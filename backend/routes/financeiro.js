const router = require('express').Router();
const { authenticate, authorizeModule, getEffectiveLevel } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { fetchAllRows } = require('../utils/pagination');
const { faltaDocumento, aplicarRecorteNoBanco } = require('../utils/semDocumento');
const { assinarLinhas } = require('../services/anexosLogArquivos');
const { hojeBR } = require('../utils/dataBr');
const doacoesDoador = require('../utils/doacoesDoador');
const XLSX = require('xlsx');

const { isAuthorizedCron } = require('../utils/cronAuth');


router.get('/alertas/cron-gerar', async (req, res) => {
  if (!isAuthorizedCron(req)) {
    return res.status(401).json({ erro: 'Nao autorizado' });
  }
  try {
    const { data, error } = await supabase.rpc('gerar_alertas_financeiros');
    if (error) throw error;
    const total = (data || []).reduce((s, r) => s + Number(r.qtd_criados || 0), 0);
    res.json({ ok: true, total_criados: total, por_tipo: data || [] });
  } catch (e) { res.status(500).json({ ok: false, erro: e.message }); }
});

router.use(authenticate, authorizeModule('financeiro'));


router.get('/dashboard', async (req, res) => {
  try {



    const agora = new Date();
    const mesInicio = `${agora.toISOString().slice(0, 7)}-01`;
    const mesProximo = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);

    const [contas, transacoes, pagar, reembolsos] = await Promise.all([
      supabase.from('fin_contas').select('id, nome, tipo, saldo, ativa'),


      fetchAllRows(() => supabase.from('fin_transacoes').select('tipo, valor, status, data_competencia')
        .neq('status', 'cancelado')
        .gte('data_competencia', mesInicio).lt('data_competencia', mesProximo)),
      supabase.from('fin_contas_pagar').select('id, valor, status, data_vencimento'),
      supabase.from('fin_reembolsos').select('id, valor, status'),
    ]);

    const saldoTotal = (contas.data || []).filter(c => c.ativa).reduce((s, c) => s + Number(c.saldo), 0);



    const hoje = hojeBR();

    const transMes = transacoes || [];
    const receitasMes = transMes.filter(t => t.tipo === 'receita').reduce((s, t) => s + Number(t.valor), 0);
    const despesasMes = transMes.filter(t => t.tipo === 'despesa').reduce((s, t) => s + Number(t.valor), 0);

    const pg = pagar.data || [];
    const vencidas = pg.filter(p => p.status === 'pendente' && p.data_vencimento < hoje);
    const pendentes = pg.filter(p => p.status === 'pendente');

    const reemb = reembolsos.data || [];
    const reembPendentes = reemb.filter(r => r.status === 'pendente');

    res.json({
      saldoTotal,
      contasAtivas: (contas.data || []).filter(c => c.ativa).length,
      receitasMes, despesasMes,
      contasPagarPendentes: pendentes.length,
      contasPagarVencidas: vencidas.length,
      valorPagarPendente: pendentes.reduce((s, p) => s + Number(p.valor), 0),
      reembolsosPendentes: reembPendentes.length,
      valorReembolsosPendentes: reembPendentes.reduce((s, r) => s + Number(r.valor), 0),
    });
  } catch (e) {
    console.error('[FIN] Dashboard:', e.message);
    res.status(500).json({ error: 'Erro ao carregar dashboard financeiro' });
  }
});


router.get('/contas', async (req, res) => {
  try {
    const { data, error } = await supabase.from('fin_contas').select('*').order('nome');
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar contas' }); }
});

router.post('/contas', async (req, res) => {
  try {
    const { nome, banco, agencia, conta, tipo } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    const { data, error } = await supabase.from('fin_contas')
      .insert({ nome, banco: banco || null, agencia: agencia || null, conta: conta || null, tipo: tipo || 'corrente' })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar conta' }); }
});

router.put('/contas/:id', async (req, res) => {
  try {
    const { nome, banco, agencia, conta, tipo, saldo, ativa } = req.body;
    const { data, error } = await supabase.from('fin_contas')
      .update({ nome, banco, agencia, conta, tipo, saldo, ativa })
      .eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar conta' }); }
});

router.delete('/contas/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('fin_contas').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover conta' }); }
});


router.get('/categorias', async (req, res) => {
  try {
    const { data, error } = await supabase.from('fin_categorias').select('*').order('tipo').order('nome');
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar categorias' }); }
});

router.post('/categorias', async (req, res) => {
  try {
    const { nome, tipo, icone, pai_id } = req.body;
    if (!nome || !tipo) return res.status(400).json({ error: 'Nome e tipo são obrigatórios' });
    const { data, error } = await supabase.from('fin_categorias')
      .insert({ nome, tipo, icone: icone || null, pai_id: pai_id || null })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar categoria' }); }
});

router.delete('/categorias/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('fin_categorias').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover categoria' }); }
});


router.get('/transacoes', async (req, res) => {
  try {
    const { conta_id, tipo, status, mes, inicio, fim, busca, sem_documento, limit = 1000 } = req.query;



    const build = () => {
      let query = supabase.from('fin_transacoes')
        .select('*, fin_contas(nome), fin_categorias(nome, tipo)')
        .order('data_competencia', { ascending: false });
      if (conta_id) query = query.eq('conta_id', conta_id);


      if (sem_documento === 'true') query = aplicarRecorteNoBanco(query);
      else if (tipo) query = query.eq('tipo', tipo);
      if (status) query = query.eq('status', status);
      if (mes) {
        const [y, m] = mes.split('-');
        const lastDay = new Date(Number(y), Number(m), 0).getDate();
        query = query.gte('data_competencia', `${mes}-01`).lte('data_competencia', `${mes}-${String(lastDay).padStart(2, '0')}`);
      }
      if (inicio) query = query.gte('data_competencia', inicio);
      if (fim) query = query.lte('data_competencia', fim);
      if (busca) query = query.ilike('descricao', `%${busca}%`);
      return query;
    };
    const teto = Math.min(Number(limit) || 1000, 50000);
    let data = await fetchAllRows(build, { max: teto });



    if (sem_documento === 'true') {
      const ids = data.map(t => t.id);
      const comNf = new Set();
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const { data: nfs, error: nfErr } = await supabase.from('log_notas_fiscais')
          .select('transacao_id').in('transacao_id', chunk).not('transacao_id', 'is', null);


        if (nfErr) throw nfErr;
        (nfs || []).forEach(n => comNf.add(n.transacao_id));
      }
      data = data.filter(t => faltaDocumento(t, comNf));
    }
    res.json(data);
  } catch (e) {
    console.error('[FIN] listar transações:', e);
    res.status(500).json({ error: 'Erro ao listar transações', detalhe: e?.message || null });
  }
});



router.get('/comprovantes', async (req, res) => {
  try {
    const { inicio, fim, conta_id, q } = req.query;
    const base = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
    const { data, error } = await supabase.rpc('fn_banco_comprovantes', {
      p_inicio: inicio || null,
      p_fim: fim || null,
      p_conta: conta_id || null,
      p_q: q || null,
      p_base: base,
    });
    if (error) return res.status(400).json({ error: error.message });
    const itens = Array.isArray(data) ? data : [];





    res.json({ itens: await assinarLinhas(itens, ['url']), total: itens.length });
  } catch (e) {
    console.error('[FIN] banco de comprovantes:', e);
    res.status(500).json({ error: 'Erro ao listar comprovantes' });
  }
});












const finComprovantes = require('../services/finComprovantes');
const PASTAS_COMPROVANTE = {
  reembolso: { titulo: 'Reembolsos', categorias: ['reembolso'] },
  pagamento: { titulo: 'Pagamentos', categorias: ['pagamento'] },
  compra:    { titulo: 'Compras e serviços', categorias: ['compras', 'servico'] },
  boleto:    { titulo: 'Boletos de contas a pagar', categorias: [] },
};

async function contarPasta(pasta) {
  const { count, error } = await supabase.from('fin_comprovantes')
    .select('id', { count: 'exact', head: true }).eq('pasta', pasta).is('deleted_at', null);
  if (error) throw error;
  return count || 0;
}

async function contarDinheiroSemComprovante(categorias) {
  if (!categorias.length) return 0;
  const { count, error } = await supabase.from('solicitacoes')
    .select('id', { count: 'exact', head: true })
    .in('categoria', categorias).eq('pagamento_forma', 'dinheiro')
    .not('pago_em', 'is', null).is('deleted_at', null);
  if (error) throw error;
  return count || 0;
}


router.get('/comprovantes/pastas', authorizeModule('financeiro', 3), async (req, res) => {
  try {
    const pastas = [];
    for (const [chave, def] of Object.entries(PASTAS_COMPROVANTE)) {
      pastas.push({
        pasta: chave,
        titulo: def.titulo,
        total: await contarPasta(chave),
        pagos_em_dinheiro: await contarDinheiroSemComprovante(def.categorias),
      });
    }
    res.json({ pastas });
  } catch (e) {
    console.error('[FIN] pastas de comprovantes:', e);
    res.status(500).json({ error: 'Erro ao carregar as pastas de comprovantes', detalhe: e?.message || null });
  }
});

router.get('/comprovantes/pasta/:pasta', authorizeModule('financeiro', 3), async (req, res) => {
  try {
    const pasta = String(req.params.pasta || '');
    const def = PASTAS_COMPROVANTE[pasta];
    if (!def) return res.status(400).json({ error: 'Pasta desconhecida' });
    const { q, inicio, fim } = req.query;


    const arquivos = [];
    for (let de = 0; ; de += 1000) {
      const { data, error } = await supabase.from('fin_comprovantes').select('*')
        .eq('pasta', pasta).is('deleted_at', null)
        .order('created_at', { ascending: false }).range(de, de + 999);
      if (error) throw error;
      arquivos.push(...(data || []));
      if (!data || data.length < 1000) break;
    }


    const idsSolic = [...new Set(arquivos.filter(a => a.origem_tipo === 'solicitacao').map(a => a.origem_id))];
    const idsConta = [...new Set(arquivos.filter(a => a.origem_tipo === 'conta_pagar').map(a => a.origem_id))];
    const solic = new Map();
    const contas = new Map();
    const COLS_SOLIC = 'id, titulo, categoria, valor_estimado, valor_cotado, pago_valor, pagamento_forma, pagamento_data, pago_em, pago_por, solicitante_id, favorecido_nome, deleted_at';
    for (let i = 0; i < idsSolic.length; i += 200) {
      const { data, error } = await supabase.from('solicitacoes').select(COLS_SOLIC).in('id', idsSolic.slice(i, i + 200));
      if (error) throw error;
      for (const s of data || []) solic.set(s.id, s);
    }
    for (let i = 0; i < idsConta.length; i += 200) {
      const { data, error } = await supabase.from('fin_contas_pagar')
        .select('id, descricao, fornecedor, valor, data_vencimento, data_pagamento, status, deleted_at')
        .in('id', idsConta.slice(i, i + 200));
      if (error) throw error;
      for (const c of data || []) contas.set(c.id, c);
    }



    let dinheiro = [];
    if (def.categorias.length) {
      const { data, error } = await supabase.from('solicitacoes').select(COLS_SOLIC)
        .in('categoria', def.categorias).eq('pagamento_forma', 'dinheiro')
        .not('pago_em', 'is', null).is('deleted_at', null)
        .order('pago_em', { ascending: false }).limit(500);
      if (error) throw error;
      const comArquivo = new Set(idsSolic);
      dinheiro = (data || []).filter(s => !comArquivo.has(s.id));
    }


    const idsPessoa = new Set();
    for (const s of [...solic.values(), ...dinheiro]) {
      if (s.solicitante_id) idsPessoa.add(s.solicitante_id);
      if (s.pago_por) idsPessoa.add(s.pago_por);
    }
    const nomes = new Map();
    const listaPessoas = [...idsPessoa];
    for (let i = 0; i < listaPessoas.length; i += 200) {
      const { data, error } = await supabase.from('profiles').select('id, name').in('id', listaPessoas.slice(i, i + 200));
      if (error) throw error;
      for (const p of data || []) nomes.set(p.id, p.name);
    }

    const origemDeSolic = (s) => ({
      tipo: 'solicitacao',
      id: s.id,
      titulo: s.titulo,
      categoria: s.categoria,
      valor: s.pago_valor ?? s.valor_cotado ?? s.valor_estimado ?? null,
      data: s.pagamento_data || (s.pago_em ? String(s.pago_em).slice(0, 10) : null),
      forma: s.pagamento_forma,
      favorecido: s.favorecido_nome || nomes.get(s.solicitante_id) || null,
      solicitante: nomes.get(s.solicitante_id) || null,
      pago_por: nomes.get(s.pago_por) || null,
      apagada: !!s.deleted_at,
    });
    const origemDeConta = (c) => ({
      tipo: 'conta_pagar',
      id: c.id,
      titulo: c.descricao,
      valor: c.valor,
      data: c.data_vencimento,
      favorecido: c.fornecedor,
      status: c.status,
      apagada: !!c.deleted_at,
    });

    let itens = arquivos.map(a => {
      const o = a.origem_tipo === 'solicitacao' ? solic.get(a.origem_id) : contas.get(a.origem_id);
      return {
        id: a.id,
        nome: a.nome,
        mime: a.mime,
        tamanho: a.tamanho,
        criado_em: a.created_at,
        storage_path: a.storage_path,
        origem: o ? (a.origem_tipo === 'solicitacao' ? origemDeSolic(o) : origemDeConta(o)) : { tipo: a.origem_tipo, id: a.origem_id, ausente: true },
      };
    });
    let semArquivo = dinheiro.map(origemDeSolic);


    const termo = q ? String(q).trim().toLowerCase() : '';
    const casa = (o) => {
      if (termo && ![o.titulo, o.favorecido, o.solicitante].some(t => t && String(t).toLowerCase().includes(termo))) return false;
      if (inicio && (!o.data || o.data < inicio)) return false;
      if (fim && (!o.data || o.data > fim)) return false;
      return true;
    };
    itens = itens.filter(i => casa(i.origem));
    semArquivo = semArquivo.filter(casa);

    const urls = await finComprovantes.assinarCaminhos(itens.map(i => i.storage_path));
    itens = itens.map(({ storage_path, ...resto }) => ({ ...resto, url: urls.get(storage_path) || null }));

    res.json({ pasta, titulo: def.titulo, itens, sem_arquivo: semArquivo, total: itens.length });
  } catch (e) {
    console.error('[FIN] pasta de comprovantes:', e);
    res.status(500).json({ error: 'Erro ao abrir a pasta de comprovantes', detalhe: e?.message || null });
  }
});

router.post('/transacoes', async (req, res) => {
  try {
    const { conta_id, categoria_id, tipo, descricao, valor, data_competencia, data_pagamento, referencia, observacoes } = req.body;
    if (!conta_id || !tipo || !descricao || !valor || !data_competencia) {
      return res.status(400).json({ error: 'Campos obrigatórios: conta, tipo, descrição, valor, data' });
    }
    const { data, error } = await supabase.from('fin_transacoes')
      .insert({ conta_id, categoria_id: categoria_id || null, tipo, descricao, valor, data_competencia, data_pagamento: data_pagamento || null, referencia: referencia || null, observacoes: observacoes || null, created_by: req.user.userId })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar transação' }); }
});

router.put('/transacoes/:id', async (req, res) => {
  try {
    const { conta_id, categoria_id, tipo, descricao, valor, data_competencia, data_pagamento, status, referencia, observacoes } = req.body;
    const { data, error } = await supabase.from('fin_transacoes')
      .update({ conta_id, categoria_id, tipo, descricao, valor, data_competencia, data_pagamento, status, referencia, observacoes })
      .eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar transação' }); }
});

router.delete('/transacoes/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('fin_transacoes').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover transação' }); }
});


router.get('/contas-pagar', async (req, res) => {
  try {
    const { status } = req.query;
    let query = supabase.from('fin_contas_pagar').select('*, fin_contas(nome), fin_categorias(nome)').order('data_vencimento');
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar contas a pagar' }); }
});

router.post('/contas-pagar', async (req, res) => {
  try {
    const { descricao, fornecedor, categoria_id, valor, data_vencimento, conta_id } = req.body;
    if (!descricao || !valor || !data_vencimento) return res.status(400).json({ error: 'Descrição, valor e vencimento são obrigatórios' });
    const { data, error } = await supabase.from('fin_contas_pagar')
      .insert({ descricao, fornecedor: fornecedor || null, categoria_id: categoria_id || null, valor, data_vencimento, conta_id: conta_id || null, created_by: req.user.userId })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar conta a pagar' }); }
});

router.put('/contas-pagar/:id', async (req, res) => {
  try {
    const { descricao, fornecedor, categoria_id, valor, data_vencimento, data_pagamento, conta_id, status } = req.body;
    const { data, error } = await supabase.from('fin_contas_pagar')
      .update({ descricao, fornecedor, categoria_id, valor, data_vencimento, data_pagamento, conta_id, status })
      .eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar conta a pagar' }); }
});

router.delete('/contas-pagar/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('fin_contas_pagar').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover conta a pagar' }); }
});







const REEMB_STATUS_MAP = {
  aprovado: ['aprovado', 'aguardando_aprovacao_financeira', 'em_cotacao', 'aguardando_merito'],
  rejeitado: ['rejeitado'],
  pago: ['concluido', 'pago'],
  pendente: ['aberto', 'pendente', 'aguardando_aprovacao_origem'],
};
function traduzStatusReembolso(s) {
  if (s === 'rejeitado') return 'rejeitado';
  if (s === 'concluido' || s === 'pago') return 'pago';
  if (s === 'aprovado' || s === 'aguardando_aprovacao_financeira' || s === 'em_cotacao' || s === 'aguardando_merito') return 'aprovado';
  return 'pendente';
}
router.get('/reembolsos', async (req, res) => {
  try {
    const { status } = req.query;
    let query = supabase
      .from('solicitacoes')
      .select('id, titulo, descricao, justificativa, valor_estimado, status, created_at, data_necessaria, observacoes, solicitante_id, profiles!solicitante_id(name)')
      .eq('categoria', 'reembolso')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(500);
    if (status && REEMB_STATUS_MAP[status]) query = query.in('status', REEMB_STATUS_MAP[status]);
    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    const mapeado = (data || []).map((s) => ({
      id: s.id,
      descricao: s.descricao || s.titulo || 'Reembolso',
      valor: s.valor_estimado,
      data_despesa: s.data_necessaria || s.created_at,
      status: traduzStatusReembolso(s.status),
      status_original: s.status,
      observacoes: s.justificativa || s.observacoes || null,
      solicitante_nome: s.profiles?.name || null,
      origem: 'solicitacao',
    }));
    res.json(mapeado);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar reembolsos' }); }
});

router.patch('/reembolsos/:id', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['aprovado', 'rejeitado', 'pago'].includes(status)) return res.status(400).json({ error: 'Status inválido' });


    if (!['admin', 'diretor'].includes(req.user.role) && getEffectiveLevel(req, 'financeiro') < 4) {
      return res.status(403).json({ error: 'Sem permissão para aprovar/pagar reembolsos' });
    }





    const patch = { status };
    if (status === 'aprovado' || status === 'pago') {
      patch.aprovado_por = req.user.userId;
    }
    const { data, error } = await supabase.from('fin_reembolsos')
      .update(patch)
      .eq('id', req.params.id).select().single();
    if (!error && data) {

      supabase.from('audit_log').insert({
        table_name: 'fin_reembolsos', record_id: req.params.id,
        action: `reembolso_${status}`, description: `Reembolso marcado como ${status}`,
        changed_by: req.user.userId, changed_by_name: req.user.name,
      }).then(() => {}, (err) => console.warn('[FIN][audit reembolso]', err.message));
    }
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar reembolso' }); }
});





router.get('/recorrentes', async (req, res) => {
  try {
    const { ativa, confirmada } = req.query;
    let q = supabase.from('fin_despesas_recorrentes').select('*').order('descricao');
    if (ativa !== undefined) q = q.eq('ativa', ativa === 'true');
    if (confirmada !== undefined) q = q.eq('confirmada', confirmada === 'true');
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/recorrentes', async (req, res) => {
  try {
    const {
      descricao, fornecedor, valor_medio, cadencia_dias, dia_vencimento,
      plano_contas_id, conta_id, classe, pix_chave, observacao,
      gera_n_dias_antes, proxima_estimada,
    } = req.body || {};
    if (!descricao || !valor_medio) {
      return res.status(400).json({ error: 'descrição e valor_medio são obrigatórios' });
    }
    const valor = Number(valor_medio);
    const { data, error } = await supabase.from('fin_despesas_recorrentes').insert({
      descricao,
      fornecedor: fornecedor || null,
      chave_match: (fornecedor || descricao).toLowerCase().trim(),
      tipo_chave: 'manual',
      valor_medio: valor,
      valor_minimo: valor,
      valor_maximo: valor,
      cadencia_dias: cadencia_dias ? Number(cadencia_dias) : 30,
      dia_vencimento: dia_vencimento ? Number(dia_vencimento) : null,
      plano_contas_id: plano_contas_id || null,
      conta_id: conta_id || null,
      classe: classe || 'fixa',
      pix_chave: pix_chave || null,
      observacao: observacao || null,
      gera_n_dias_antes: gera_n_dias_antes ? Number(gera_n_dias_antes) : 7,
      proxima_estimada: proxima_estimada || null,
      ativa: true, confirmada: true, confianca: 1.0,
    }).select('*').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/recorrentes/:id', async (req, res) => {
  try {
    const patch = { ...req.body };
    delete patch.id; delete patch.created_at;
    patch.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from('fin_despesas_recorrentes').update(patch).eq('id', req.params.id).select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/recorrentes/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('fin_despesas_recorrentes').update({ ativa: false }).eq('id', req.params.id).select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/recorrentes/gerar-contas-pagar', async (req, res) => {
  try {
    const { data, error } = await supabase.rpc('gerar_contas_pagar_recorrentes', {
      p_user_id: req.user.userId,
    });
    if (error) throw error;
    res.json({
      total: (data || []).length,
      criadas: (data || []).filter(r => r.acao === 'criado').length,
      ja_existiam: (data || []).filter(r => r.acao === 'ja_existe').length,
      detalhes: data || [],
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/projecao-caixa', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vw_projecao_caixa_mensal').select('*').order('mes_inicio');
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});





router.get('/generosidade/overview', async (req, res) => {
  try {
    const { data: mensal, error } = await supabase
      .from('vw_doacoes_mensal').select('*').order('mes');
    if (error) throw error;

    const arr = mensal || [];
    const mesAtual = arr[arr.length - 1] || {};
    const mesAnterior = arr[arr.length - 2] || {};
    const totalAtual = Number(mesAtual.total || 0);
    const totalAnterior = Number(mesAnterior.total || 0);
    const variacaoPct = totalAnterior > 0 ? ((totalAtual - totalAnterior) / totalAnterior) * 100 : null;


    const dizimistas = Number(mesAtual.qtd_dizimistas || 0);
    const dizimoMedio = dizimistas > 0 ? Number(mesAtual.dizimo || 0) / dizimistas : 0;


    const { count: membrosAtivos } = await supabase
      .from('mem_membros')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null)
      .eq('status', 'membro_ativo');






    const doadoresUnicos = Number(mesAtual.qtd_membros_ativos_doadores || 0);
    const pctMembrosDoando = membrosAtivos > 0 ? (doadoresUnicos / membrosAtivos) * 100 : 0;

    res.json({
      mensal: arr,
      mes_atual: {
        total: totalAtual,
        dizimo: Number(mesAtual.dizimo || 0),
        oferta: Number(mesAtual.oferta || 0),
        outras: Number(mesAtual.outras || 0),
        qtd_doacoes: Number(mesAtual.qtd_doacoes || 0),
        qtd_doadores_unicos: Number(mesAtual.qtd_doadores_unicos || 0),
        extraordinaria: Number(mesAtual.extraordinaria || 0),
        total_atribuido: Number(mesAtual.total_atribuido || 0),
        qtd_dizimistas: dizimistas,
        qtd_membros_doadores: Number(mesAtual.qtd_membros_doadores || 0),
      },
      variacao_pct: variacaoPct,
      dizimo_medio: dizimoMedio,
      membros_ativos: membrosAtivos || 0,
      doadores_unicos_mes: doadoresUnicos,
      pct_membros_doando: pctMembrosDoando,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/generosidade/anonimos', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vw_doadores_anonimos_top').select('*');
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});







const PARARAM_DIAS = { '2m': 60, '3m': 90, '6m': 180 };
router.get('/generosidade/pararam', async (req, res) => {
  try {
    const dias = PARARAM_DIAS[req.query.periodo] || 60;



    const { data, error } = await supabase.rpc('fn_generosidade_pararam', { p_dias_min: dias, p_limite: 100 });
    if (error) throw error;
    res.json({
      itens: Array.isArray(data?.itens) ? data.itens : [],
      total_candidatos: Number(data?.total_candidatos || 0),
      limite: Number(data?.limite || 100),
    });
  } catch (e) {
    console.error('[FIN] generosidade/pararam:', e);
    res.status(500).json({ error: e.message });
  }
});






const {
  parsePeriodoDoacoes, parseLimite, coberturaAtribuicao,
} = require('../utils/periodoDoacoes');




function parsePeriodo(periodo) {
  if (typeof periodo === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) {
    const [ano, mes] = periodo.split('-').map(Number);
    const desde = `${periodo}-01`;
    const ate = new Date(Date.UTC(ano, mes, 1)).toISOString().slice(0, 10);
    return { periodo, desde, ate };
  }
  if (periodo === 'tudo') return { periodo: 'tudo', desde: null, ate: null };
  const corte = new Date();
  corte.setFullYear(corte.getFullYear() - 1);
  return { periodo: '12m', desde: corte.toISOString().slice(0, 10), ate: null };
}

router.get('/generosidade/top', async (req, res) => {
  try {


    const { periodo, desde, ate, rotulo } = parsePeriodoDoacoes(req.query.periodo);
    const limite = parseLimite(req.query.limite);
    const ordem = req.query.ordem === 'asc' ? 'asc' : 'desc';



    const { data, error } = await supabase.rpc('fn_generosidade_top', {
      p_desde: desde, p_ate: ate, p_limite: limite, p_ordem: ordem,
    });
    if (error) throw error;




    res.json({
      periodo, rotulo, ordem, limite,
      top: Array.isArray(data?.top) ? data.top : [],
      pessoas_no_periodo: Number(data?.pessoas_no_periodo || 0),
      cobertura: coberturaAtribuicao(data?.base),
    });
  } catch (e) {
    console.error('[FIN] generosidade/top:', e);
    res.status(500).json({ error: e.message });
  }
});


router.get('/generosidade/top/:membroId/historico', async (req, res) => {
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.membroId)) {
      return res.status(400).json({ error: 'membro_id inválido' });
    }
    const { periodo, desde, ate } = parsePeriodoDoacoes(req.query.periodo);


    const { data, error } = await supabase.rpc('fn_generosidade_historico_membro', {
      p_membro: req.params.membroId, p_desde: desde, p_ate: ate,
    });
    if (error) throw error;
    const linhas = (Array.isArray(data?.linhas) ? data.linhas : []).map((l) => ({
      ...l,

      tipo_rotulo: doacoesDoador.tipoDoPlano(l.plano_codigo)?.rotulo || null,
    }));
    res.json({
      periodo,
      membro_id: req.params.membroId,
      total: Number(data?.total || 0),
      qtd_doacoes: Number(data?.qtd || linhas.length),
      primeira_doacao: data?.primeira || null,
      ultima_doacao: data?.ultima || null,
      contribuicoes: linhas,
    });
  } catch (e) {
    console.error('[FIN] generosidade/historico:', e);
    res.status(500).json({ error: e.message });
  }
});


















async function historicoDoador({ chaves, inicio, fim }) {
  const { data, error } = await supabase.rpc('fn_fin_doador_historico', {
    p_chaves: chaves,
    p_prefixos: doacoesDoador.PREFIXOS_DOACAO,
    p_classes: doacoesDoador.CLASSES_DOACAO,
    p_inicio: inicio,
    p_fim: fim,
  });
  if (error) throw error;
  const brutas = Array.isArray(data?.linhas) ? data.linhas : [];



  const resumo = doacoesDoador.resumirHistorico(brutas);
  const linhas = brutas.filter(doacoesDoador.ehLinhaDeDoacao).map((l) => {
    const t = doacoesDoador.tipoDoPlano(l.plano_codigo);
    return { ...l, tipo: t?.tipo || null, tipo_rotulo: t?.rotulo || null };
  });
  return {
    linhas,
    resumo,
    membros: Array.isArray(data?.membros) ? data.membros : [],
    base: {
      qtd_total: Number(data?.qtd_total || 0),
      truncado: !!data?.truncado,
      limite: Number(data?.limite || 0),
    },
  };
}

function lerFiltrosHistorico(req, res) {
  const ch = doacoesDoador.validarChaves(req.query.chave);
  if (!ch.ok) { res.status(400).json({ error: ch.erro }); return null; }
  const per = doacoesDoador.validarPeriodo({ inicio: req.query.inicio, fim: req.query.fim });
  if (!per.ok) { res.status(400).json({ error: per.erro }); return null; }
  return { chaves: ch.chaves, inicio: per.inicio, fim: per.fim };
}


router.get('/doadores/buscar', authorizeModule('financeiro', 3), async (req, res) => {
  try {
    const v = doacoesDoador.validarBusca(req.query.q);
    if (!v.ok) return res.status(400).json({ error: v.erro });
    const { data, error } = await supabase.rpc('fn_fin_doadores_buscar', {
      p_q: v.q,
      p_prefixos: doacoesDoador.PREFIXOS_DOACAO,
      p_classes: doacoesDoador.CLASSES_DOACAO,
      p_limite: 30,
    });
    if (error) throw error;
    res.json({
      itens: Array.isArray(data?.itens) ? data.itens : [],
      total_nomes: Number(data?.total_nomes || 0),
      limite: Number(data?.limite || 30),
    });
  } catch (e) {
    console.error('[FIN] doadores/buscar:', e);
    res.status(500).json({ error: 'Erro ao buscar doadores.', detalhe: e?.message || null });
  }
});


router.get('/doadores/historico', authorizeModule('financeiro', 3), async (req, res) => {
  try {
    const f = lerFiltrosHistorico(req, res);
    if (!f) return;
    const h = await historicoDoador(f);

    const { error: logErr } = await supabase.from('app_audit_log').insert(
      doacoesDoador.registroDeAcesso({
        acao: 'historico', chaves: f.chaves, membros: h.membros, inicio: f.inicio, fim: f.fim,
        qtd: h.resumo.qtd, user: req.user,
      }),
    );
    if (logErr) console.error('[FIN] doadores/historico · registro de acesso:', logErr.message);
    res.json({ ...h, inicio: f.inicio, fim: f.fim, periodo_rotulo: doacoesDoador.rotuloPeriodo(f.inicio, f.fim) });
  } catch (e) {
    console.error('[FIN] doadores/historico:', e);
    res.status(500).json({ error: 'Erro ao carregar o histórico.', detalhe: e?.message || null });
  }
});



router.get('/doadores/relatorio', authorizeModule('financeiro', 3), async (req, res) => {
  try {
    const f = lerFiltrosHistorico(req, res);
    if (!f) return;
    const formato = req.query.formato === 'impressao' ? 'impressao' : 'xlsx';
    const h = await historicoDoador(f);


    const { error: logErr } = await supabase.from('app_audit_log').insert(
      doacoesDoador.registroDeAcesso({
        acao: 'download', chaves: f.chaves, membros: h.membros, inicio: f.inicio, fim: f.fim,
        formato, qtd: h.resumo.qtd, user: req.user,
      }),
    );
    if (logErr) {
      console.error('[FIN] doadores/relatorio · registro de acesso:', logErr.message);
      return res.status(503).json({ error: 'Não foi possível registrar o download. Tente de novo em instantes.' });
    }

    const geradoEm = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const geradoPor = req.user?.name || req.user?.email || '';
    if (formato === 'impressao') {
      return res.json({ ...h, inicio: f.inicio, fim: f.fim, periodo_rotulo: doacoesDoador.rotuloPeriodo(f.inicio, f.fim), gerado_em: geradoEm, gerado_por: geradoPor });
    }

    const { doacoes, porAno } = doacoesDoador.montarPlanilha({
      linhas: h.linhas, resumo: h.resumo, base: h.base, inicio: f.inicio, fim: f.fim, geradoEm, geradoPor,
    });
    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.aoa_to_sheet(doacoes);
    ws1['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 22 }, { wch: 36 }, { wch: 18 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Doações');
    const ws2 = XLSX.utils.aoa_to_sheet(porAno);
    ws2['!cols'] = porAno[0].map(() => ({ wch: 16 }));
    XLSX.utils.book_append_sheet(wb, ws2, 'Por ano');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const nome = h.resumo.nomes[0]?.nome || f.chaves[0];
    const fn = doacoesDoador.nomeArquivo({ nome, inicio: f.inicio, fim: f.fim, ext: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fn}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(buf);
  } catch (e) {
    console.error('[FIN] doadores/relatorio:', e);
    res.status(500).json({ error: 'Erro ao gerar o relatório.', detalhe: e?.message || null });
  }
});





router.get('/fila-classificacao/stats', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vw_classificacao_stats').select('*').single();
    if (error) throw error;
    const total = Number(data?.total_ult30 || 0);
    const auto = Number(data?.classificadas_auto_ult30 || 0);
    res.json({
      ...data,
      pct_automatico: total > 0 ? (auto / total) * 100 : 0,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/fila-classificacao/items', async (req, res) => {
  try {
    const { confianca_min, origem, limit = 100 } = req.query;
    let q = supabase
      .from('fin_fila_classificacao')
      .select(`
        id, status, sugestao_confianca, sugestao_origem, sugestao_explicacao,
        sugestao_plano_contas_id, sugestao_centro_custo_id, sugestao_membro_id,
        created_at,
        bruto:fin_lancamentos_brutos!fin_fila_classificacao_lancamento_bruto_id_fkey(
          id, data_lancamento, valor, tipo_trn, memo, nome_contraparte, documento_contraparte
        )
      `)
      .eq('status', 'pendente')
      .order('sugestao_confianca', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(Math.min(500, Number(limit)));
    if (confianca_min) q = q.gte('sugestao_confianca', Number(confianca_min));
    if (origem) q = q.eq('sugestao_origem', origem);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});


router.post('/fila-classificacao/aprovar-massa', async (req, res) => {
  try {
    const { confianca_min = 0.8 } = req.body || {};
    const { data: pendentes, error: e1 } = await supabase
      .from('fin_fila_classificacao')
      .select('id, sugestao_plano_contas_id')
      .eq('status', 'pendente')
      .gte('sugestao_confianca', Number(confianca_min))
      .not('sugestao_plano_contas_id', 'is', null);
    if (e1) throw e1;
    if (!pendentes || pendentes.length === 0) {
      return res.json({ aprovadas: 0, mensagem: 'Nenhuma item elegivel' });
    }
    const ids = pendentes.map(p => p.id);
    const { error: e2 } = await supabase
      .from('fin_fila_classificacao')
      .update({ status: 'aprovado', decidido_em: new Date().toISOString(), decidido_por: req.user.userId })
      .in('id', ids);
    if (e2) throw e2;
    res.json({ aprovadas: ids.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


router.post('/fila-classificacao/:id/decidir', async (req, res) => {
  try {
    const { plano_contas_id, centro_custo_id, membro_id } = req.body || {};
    if (!plano_contas_id) return res.status(400).json({ error: 'plano_contas_id obrigatorio' });
    const { data, error } = await supabase
      .from('fin_fila_classificacao')
      .update({
        sugestao_plano_contas_id: plano_contas_id,
        sugestao_centro_custo_id: centro_custo_id || null,
        sugestao_membro_id: membro_id || null,
        status: 'aprovado',
        decidido_em: new Date().toISOString(),
        decidido_por: req.user.userId,
      })
      .eq('id', req.params.id).select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});


router.post('/fila-classificacao/reclassificar', async (req, res) => {
  try {
    const { data, error } = await supabase.rpc('reclassificar_fila_pendente');
    if (error) throw error;
    res.json({ reclassificadas: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});






router.get('/alertas', async (req, res) => {
  try {
    const { atendido } = req.query;
    if (atendido === 'true') {
      const { data, error } = await supabase
        .from('fin_alertas').select('*')
        .not('atendido_em', 'is', null)
        .order('atendido_em', { ascending: false }).limit(100);
      if (error) throw error;
      return res.json(data || []);
    }
    const { data, error } = await supabase
      .from('vw_fin_alertas_abertos').select('*');
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});


router.post('/alertas/:id/atender', async (req, res) => {
  try {
    const { comentario } = req.body || {};
    const { data, error } = await supabase
      .from('fin_alertas').update({
        atendido_em: new Date().toISOString(),
        atendido_por: req.user.userId,
        comentario_atendimento: comentario || null,
      }).eq('id', req.params.id).select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});


router.post('/alertas/gerar', async (req, res) => {
  try {
    const { data, error } = await supabase.rpc('gerar_alertas_financeiros');
    if (error) throw error;
    const total = (data || []).reduce((s, r) => s + Number(r.qtd_criados || 0), 0);
    res.json({ total_criados: total, por_tipo: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});





router.get('/calendario', async (req, res) => {
  try {
    const { inicio, fim, tipo } = req.query;
    let q = supabase.from('vw_calendario_financeiro').select('*').order('data');
    if (inicio) q = q.gte('data', inicio);
    if (fim) q = q.lte('data', fim);
    if (tipo) q = q.eq('tipo', tipo);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});






router.get('/centros-custo', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('fin_centros_custo')
      .select('id, codigo, nome, campus, area_slug, nivel, aceita_lancamento, ativo')
      .eq('ativo', true)
      .order('codigo');
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});


router.get('/dre-centro-custo/atual', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vw_dre_centro_custo_atual').select('*');
    if (error) throw error;

    const byId = {};
    (data || []).forEach(r => {
      const k = r.centro_custo_id;
      if (!byId[k]) {
        byId[k] = {
          centro_custo_id: k, codigo: r.codigo, centro_nome: r.centro_nome,
          campus: r.campus, area_slug: r.area_slug,
          receita: 0, despesa: 0, receita_anterior: 0, despesa_anterior: 0,
        };
      }
      const tgt = r.tipo === 'receita' ? 'receita' : 'despesa';
      byId[k][tgt] += Math.abs(Number(r.atual || 0));
      byId[k][`${tgt}_anterior`] += Math.abs(Number(r.anterior || 0));
    });
    const lista = Object.values(byId).map(c => ({
      ...c,
      resultado: c.receita - c.despesa,
      resultado_anterior: c.receita_anterior - c.despesa_anterior,
      total_movimentado: c.receita + c.despesa,
    })).sort((a, b) => b.total_movimentado - a.total_movimentado);
    res.json(lista);
  } catch (e) { res.status(500).json({ error: e.message }); }
});





const TABELAS_FIN_AUDITAVEIS = [
  'fin_transacoes', 'fin_contas', 'fin_contas_pagar',
  'fin_closing_mensal', 'fin_despesas_recorrentes',
];


router.get('/audit/:tabela/:row_id', async (req, res) => {
  try {
    const { tabela, row_id } = req.params;
    if (!TABELAS_FIN_AUDITAVEIS.includes(tabela)) {
      return res.status(400).json({ error: 'Tabela não auditavel' });
    }
    const { data, error } = await supabase
      .from('app_audit_log')
      .select('id, action, user_id, user_email, changes, created_at')
      .eq('table_name', tabela)
      .eq('row_id', row_id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});


router.get('/audit', authorizeModule('financeiro', 3), async (req, res) => {
  try {
    const { tabela, user_email, desde, ate, limit = 100 } = req.query;
    let q = supabase
      .from('app_audit_log')
      .select('id, table_name, row_id, action, user_id, user_email, changes, created_at')
      .in('table_name', TABELAS_FIN_AUDITAVEIS)
      .order('created_at', { ascending: false })
      .limit(Math.min(500, Number(limit)));
    if (tabela && TABELAS_FIN_AUDITAVEIS.includes(tabela)) q = q.eq('table_name', tabela);
    if (user_email) q = q.eq('user_email', user_email.toLowerCase());
    if (desde) q = q.gte('created_at', desde);
    if (ate) q = q.lte('created_at', ate);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});





router.get('/dre-comparativo', async (req, res) => {
  try {
    const [linhas, totais] = await Promise.all([
      supabase.from('vw_dre_comparativo').select('*'),
      supabase.from('vw_dre_comparativo_totais').select('*'),
    ]);
    if (linhas.error) throw linhas.error;
    if (totais.error) throw totais.error;
    res.json({ linhas: linhas.data || [], totais: totais.data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});





router.get('/closing', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('fin_closing_mensal').select('*')
      .order('ano', { ascending: false })
      .order('mes', { ascending: false })
      .limit(36);
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/closing/fechar', authorizeModule('financeiro', 4), async (req, res) => {
  try {
    const { ano, mes, observacao } = req.body || {};
    if (!ano || !mes) return res.status(400).json({ error: 'ano e mês obrigatórios' });

    const hoje = new Date();
    if (Number(ano) > hoje.getFullYear() ||
        (Number(ano) === hoje.getFullYear() && Number(mes) >= hoje.getMonth() + 1)) {
      return res.status(400).json({ error: 'Não eh possível fechar mês corrente ou futuro' });
    }
    const { data, error } = await supabase.rpc('fechar_mes_financeiro', {
      p_ano: Number(ano), p_mes: Number(mes),
      p_fechado_por: req.user.userId,
      p_observacao: observacao || null,
    });
    if (error) throw error;
    res.json({ id: data, ano, mes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/closing/reabrir', authorizeModule('financeiro', 5), async (req, res) => {
  try {
    const { ano, mes, motivo } = req.body || {};
    if (!ano || !mes) return res.status(400).json({ error: 'ano e mês obrigatórios' });
    if (!motivo || motivo.length < 5) return res.status(400).json({ error: 'motivo obrigatorio (>=5 chars)' });
    const { data, error } = await supabase.rpc('reabrir_mes_financeiro', {
      p_ano: Number(ano), p_mes: Number(mes),
      p_reaberto_por: req.user.userId, p_motivo: motivo,
    });
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Mês não estava fechado' });
    res.json({ reaberto: true, ano, mes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


router.get('/dre-centro-custo/:id/historico', async (req, res) => {
  try {
    const desde = new Date();
    desde.setMonth(desde.getMonth() - 11); desde.setDate(1);
    const { data, error } = await supabase
      .from('vw_dre_centro_custo_mensal')
      .select('mes, tipo, total, qtd_lancamentos')
      .eq('centro_custo_id', req.params.id)
      .gte('mes', desde.toISOString().slice(0, 10))
      .order('mes');
    if (error) throw error;

    const byMes = {};
    (data || []).forEach(r => {
      const k = r.mes;
      if (!byMes[k]) byMes[k] = { mes: k, receita: 0, despesa: 0, qtd: 0 };
      const v = Math.abs(Number(r.total || 0));
      byMes[k][r.tipo === 'receita' ? 'receita' : 'despesa'] += v;
      byMes[k].qtd += Number(r.qtd_lancamentos || 0);
    });
    res.json(Object.values(byMes).map(m => ({
      ...m,
      resultado: m.receita - m.despesa,
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
