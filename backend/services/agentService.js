const { supabase } = require('../utils/supabase');
const { modeloProvado } = require('../utils/modeloIa');


const PRICING = {
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
  'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
};

const DEFAULT_BUDGET = parseInt(process.env.AI_DEFAULT_TOKEN_BUDGET || '50000');
const MAX_BUDGET = parseInt(process.env.AI_MAX_TOKEN_BUDGET || '200000');

const GUARDRAILS = `
REGRAS OBRIGATÓRIAS — GUARDRAILS:
1. NUNCA invente, fabrique ou suponha dados. Use APENAS dados reais fornecidos no contexto ou retornados pelas APIs.
2. Se não tiver certeza sobre algo, diga explicitamente "não tenho informação suficiente".
3. Todas as análises devem ser baseadas em evidências concretas dos dados.
4. Ao sugerir ações de escrita, SEMPRE marque com _agent_generated: true.
5. Respostas em português brasileiro.
6. Seja conciso e objetivo.
`.trim();

class AgentService {
  constructor(runId, agentType, config = {}) {
    this.runId = runId;
    this.agentType = agentType;
    this.config = config;
    this.tokenBudget = Math.min(config.tokenBudget || DEFAULT_BUDGET, MAX_BUDGET);
    this.totalTokensIn = 0;
    this.totalTokensOut = 0;
    this.totalCost = 0;
    this.stepCount = 0;
  }


  static async createRun(agentType, triggeredBy, config = {}) {

    if (config._existingRunId) {
      const cleanConfig = { ...config };
      delete cleanConfig._existingRunId;
      return new AgentService(config._existingRunId, agentType, cleanConfig);
    }
    const { data, error } = await supabase.from('agent_runs').insert({
      agent_type: agentType,
      status: 'running',
      triggered_by: triggeredBy,
      config,
    }).select().single();
    if (error) throw new Error(`Erro ao criar run: ${error.message}`);
    return new AgentService(data.id, agentType, config);
  }


  checkBudget() {
    const total = this.totalTokensIn + this.totalTokensOut;
    if (total >= this.tokenBudget) {
      throw new Error(`Budget de tokens excedido: ${total}/${this.tokenBudget}`);
    }
    return this.tokenBudget - total;
  }











  async call({ model = 'claude-haiku-4-5-20251001', system, messages, tools, toolChoice, role = 'step', maxTokens = 2048 }) {
    this.checkBudget();
    this.stepCount++;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY não configurada');


    let systemField;
    if (Array.isArray(system)) {

      const first = system[0] || { type: 'text', text: '' };
      systemField = [
        { ...first, text: `${GUARDRAILS}\n\n${first.text || ''}` },
        ...system.slice(1),
      ];
    } else {
      systemField = `${GUARDRAILS}\n\n${system || ''}`;
    }

    const body = {
      model,
      max_tokens: maxTokens,
      system: systemField,
      messages,
    };
    if (tools?.length) body.tools = tools;
    if (toolChoice) body.tool_choice = toolChoice;

    const start = Date.now();
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${err}`);
    }

    const data = await res.json();
    const duration = Date.now() - start;


    const tokensIn = data.usage?.input_tokens || 0;
    const tokensOut = data.usage?.output_tokens || 0;
    const pricing = PRICING[model] || PRICING['claude-haiku-4-5-20251001'];
    const cost = (tokensIn * pricing.input + tokensOut * pricing.output) / 1_000_000;

    this.totalTokensIn += tokensIn;
    this.totalTokensOut += tokensOut;
    this.totalCost += cost;


    const textBlock = data.content?.find(b => b.type === 'text');
    const toolCalls = data.content?.filter(b => b.type === 'tool_use') || [];


    await supabase.from('agent_steps').insert({
      run_id: this.runId,
      step_number: this.stepCount,
      model,
      role,
      tokens_input: tokensIn,
      tokens_output: tokensOut,
      cost_usd: cost,
      response_text: textBlock?.text?.slice(0, 10000),
      tool_calls: toolCalls.length ? toolCalls : [],
      duration_ms: duration,
    });


    await supabase.from('agent_runs').update({
      tokens_input: this.totalTokensIn,
      tokens_output: this.totalTokensOut,
      cost_usd: this.totalCost,
    }).eq('id', this.runId);

    return {
      text: textBlock?.text || '',
      toolCalls,
      usage: { input: tokensIn, output: tokensOut, cost },
      stopReason: data.stop_reason,
    };
  }


  async callHaiku(system, userMessage, role = 'step') {
    return this.call({
      model: 'claude-haiku-4-5-20251001',
      system,
      messages: [{ role: 'user', content: userMessage }],
      role,
      maxTokens: 1024,
    });
  }









  async callSonnet(system, userMessage, role = 'analysis') {
    return this.call({
      model: process.env.AGENTE_AI_MODEL || modeloProvado(),
      system,
      messages: [{ role: 'user', content: userMessage }],
      role,
      maxTokens: 4096,
    });
  }


  async complete(summary, findings = [], actionsTaken = []) {
    await supabase.from('agent_runs').update({
      status: 'completed',
      summary,
      findings,
      actions_taken: actionsTaken,
      tokens_input: this.totalTokensIn,
      tokens_output: this.totalTokensOut,
      cost_usd: this.totalCost,
      completed_at: new Date().toISOString(),
    }).eq('id', this.runId);


    this._notificarSeNecessario(findings, summary).catch(e =>
      console.warn('[AgentService] notificacao falhou:', e.message)
    );
  }


  async _notificarSeNecessario(findings, summary) {
    if (process.env.AI_DISABLE_NOTIFICATIONS === '1') return;
    if (!Array.isArray(findings) || !findings.length) return;

    const criticos = findings.filter(f => f.severity === 'critico');
    const avisos = findings.filter(f => f.severity === 'aviso');
    if (!criticos.length && avisos.length < 3) return;

    let notificar;
    try { notificar = require('./notificar').notificar; }
    catch { return; }

    const score = this.config?.score;
    const nomeAgente = this.agentType
      .replace('module_', '')
      .replace('_', ' ')
      .replace(/\b\w/g, c => c.toUpperCase());

    const severidade = criticos.length ? 'critico' : 'aviso';
    const titulo = criticos.length
      ? `${nomeAgente}: ${criticos.length} problema(s) crítico(s)`
      : `${nomeAgente}: ${avisos.length} avisos detectados`;
    const primeiraEvidencia = (criticos[0] || avisos[0])?.title || 'Veja o detalhe da auditoria.';
    const mensagem = score != null
      ? `Score ${score}/10 — ${primeiraEvidencia}`
      : primeiraEvidencia;

    await notificar({
      modulo: 'assistenteIA',
      tipo: 'auditoria_critica',
      titulo,
      mensagem,
      link: `/assistente-ia?run=${this.runId}`,
      severidade,
      chaveDedup: `auditoria_${this.agentType}_${new Date().toISOString().slice(0, 10)}`,
    });
  }


  async fail(errorMsg) {
    await supabase.from('agent_runs').update({
      status: 'failed',
      error: errorMsg,
      tokens_input: this.totalTokensIn,
      tokens_output: this.totalTokensOut,
      cost_usd: this.totalCost,
      completed_at: new Date().toISOString(),
    }).eq('id', this.runId);
  }


  async cancel() {
    await supabase.from('agent_runs').update({
      status: 'cancelled',
      completed_at: new Date().toISOString(),
    }).eq('id', this.runId);
  }




  async getMemories(module = null) {
    let query = supabase.from('agent_memory')
      .select('key, value, updated_at')
      .eq('agent_type', this.agentType);
    if (module) query = query.eq('module', module);
    const { data } = await query.order('updated_at', { ascending: false });
    return data || [];
  }


  async remember(key, value, module = null) {
    const { error } = await supabase.from('agent_memory')
      .upsert({
        agent_type: this.agentType,
        module: module || this.agentType.replace('module_', ''),
        key,
        value: typeof value === 'string' ? value : JSON.stringify(value),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'agent_type,module,key' });
    if (error) console.error('[AgentMemory] Erro ao salvar:', error.message);
  }


  formatMemories(memories) {
    if (!memories.length) return 'Nenhuma memória anterior.';
    return memories.map(m => `- ${m.key}: ${m.value}`).join('\n');
  }


  async getScoreHistory(module = null, limit = 10) {
    let query = supabase.from('agent_runs')
      .select('created_at, config, findings, summary')
      .eq('agent_type', this.agentType)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(limit);
    const { data } = await query;
    return (data || []).map(r => ({
      date: r.created_at,
      score: r.config?.score || null,
      findingsCount: r.findings?.length || 0,
    }));
  }
}

module.exports = { AgentService, GUARDRAILS };
