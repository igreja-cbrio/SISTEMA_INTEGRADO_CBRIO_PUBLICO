




















export interface AchadoParaPrompt {
  titulo?: string | null;
  resumo?: string | null;
  severidade?: string | null;
  modulo?: string | null;
  quando?: string | null;
  classificacao?: string | null;
  confianca?: string | null;
  risco?: string | null;
  decisao_necessaria?: boolean;
  pergunta_de_decisao?: string | null;
  evidencias?: string[] | null;
  plano_de_acao?: string[] | null;
  passos_de_validacao?: string[] | null;
  autonomia?: { faixa?: string; motivo?: string; avisos?: string[] } | null;
  andamento?: string | null;
  andamento_motivo?: string | null;
  incidente?: {
    id?: string | null;
    titulo?: string | null;
    status?: string | null;
    severidade?: string | null;
    ambiente?: string | null;
    request_id?: string | null;
    release?: string | null;
    impacto?: string | null;
    aberto_em?: string | null;
  } | null;
  tarefa?: { status?: string | null; pull_request_url?: string | null } | null;
}








function dataCurta(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function lista(titulo: string, itens?: string[] | null): string | null {
  const xs = (Array.isArray(itens) ? itens : []).map((x) => String(x || '').trim()).filter(Boolean);
  if (!xs.length) return null;
  return [`## ${titulo}`, ...xs.map((x, i) => `${i + 1}. ${x}`)].join('\n');
}









function porQueNaoFoiAutomatico(a: AchadoParaPrompt): string {
  const partes: string[] = [];
  if (a.autonomia?.motivo) partes.push(a.autonomia.motivo);

  if (a.andamento_motivo && a.andamento_motivo !== a.autonomia?.motivo) {
    partes.push(a.andamento_motivo);
  }
  if (a.tarefa?.pull_request_url) {
    partes.push(`Já existe um PR aberto pelo agente: ${a.tarefa.pull_request_url}`);
  }
  if (!partes.length) return 'Não registrado — confira a aba Diagnósticos.';
  return partes.join('. ');
}










function comoTrabalhar(a: AchadoParaPrompt, hoje: Date): string {
  const naoReproduzido = String(a.incidente?.status || '').toLowerCase() === 'nao_reproduzido';
  const dias = a.incidente?.aberto_em || a.quando
    ? Math.max(0, Math.round((hoje.getTime() - new Date(a.incidente?.aberto_em || a.quando || '').getTime()) / 86_400_000))
    : null;

  const linhas = [
    '## Antes de mexer em uma linha',
    dias !== null && dias > 2
      ? `1. ⚠️ Este achado tem ${dias} dia(s). Pode já ter sido corrigido por outra frente — **confirme no código e no banco vivo que o defeito AINDA existe** antes de escrever qualquer coisa.`
      : '1. Confirme no código e no banco vivo que o defeito realmente acontece.',
    naoReproduzido
      ? '2. ⚠️⚠️ O incidente está marcado como **não reproduzido**: ninguém conseguiu fazê-lo acontecer de novo. A causa provável acima é HIPÓTESE do agente, não fato medido. Não trate como diagnóstico fechado.'
      : '2. A causa provável acima é a hipótese do agente. Confirme antes de adotá-la.',
    '3. Se concluir que **já está resolvido** ou que o diagnóstico está errado, **diga isso e pare** — não invente conserto para fechar o card. Nesse caso o que resolve é encerrar o incidente em `/sistema`.',
    '',
    '## Regras da casa que valem aqui',
    '- Medir antes de afirmar: o banco vivo manda, não o arquivo de migration.',
    '- **Migration é decisão minha**: se o conserto precisar de mudança de schema, pare e me pergunte.',
    '- Nada de tocar autenticação, financeiro/pagamentos ou o módulo Sistema sem falar comigo.',
    '- Portão antes do PR: `npm run typecheck` (sem cache), `npm run build`, `npm test` e os scripts do gate em `.github/workflows/deploy-vercel.yml`.',
    '- Régua nova vai em `backend/utils/` ou `src/lib/` com teste, e o teste entra no gate.',
    '- Ao terminar: abra o PR e me diga o que ficou de fora e por quê.',
  ];


  return linhas.join('\n');
}






export function montarPromptDiagnostico(a: AchadoParaPrompt, agora: Date = new Date()): string {
  const inc = a.incidente || null;
  const tituloProblema = String(inc?.titulo || a.titulo || 'Achado sem título').trim();

  const identificacao = [
    '## Identificação do incidente',
    inc?.id ? `- id (tabela \`system_incidents\`): \`${inc.id}\`` : '- sem incidente aberto (achado de auditoria)',
    inc?.status ? `- status: ${inc.status}` : null,
    (inc?.severidade || a.severidade) ? `- severidade: ${inc?.severidade || a.severidade}` : null,
    inc?.ambiente ? `- ambiente: ${inc.ambiente}` : null,
    inc?.request_id ? `- rastreio (request_id): \`${inc.request_id}\`` : null,
    inc?.release ? `- release: \`${inc.release}\`` : null,
    dataCurta(inc?.aberto_em) ? `- aberto em: ${dataCurta(inc?.aberto_em)}` : null,
    dataCurta(a.quando) ? `- diagnosticado em: ${dataCurta(a.quando)}` : null,
    a.modulo ? `- módulo declarado: ${a.modulo}` : null,
  ].filter(Boolean).join('\n');

  const causa = [
    '## Causa provável (hipótese do agente)',
    a.titulo ? String(a.titulo).trim() : null,
    [
      a.classificacao ? `classificação: ${a.classificacao}` : null,
      a.confianca ? `confiança: ${a.confianca}` : null,
      a.risco ? `risco: ${a.risco}` : null,
    ].filter(Boolean).join(' · ') || null,
  ].filter(Boolean).join('\n');

  const pergunta = a.decisao_necessaria && a.pergunta_de_decisao
    ? ['## Pergunta que o agente deixou aberta',
       `${a.pergunta_de_decisao}`,
       '⚠️ Não decida isso sozinho — se o conserto depender da resposta, pare e me pergunte.'].join('\n')
    : null;




  return [
    'Preciso corrigir um erro do ERP da CBRio. O achado abaixo saiu do módulo Agentes & Auditoria (aba Diagnósticos) e o agente desenvolvedor NÃO o corrigiu sozinho.',
    [`# ${tituloProblema}`, a.resumo ? String(a.resumo).trim() : null].filter(Boolean).join('\n'),
    inc?.impacto ? `Impacto relatado: ${inc.impacto}` : null,
    ['## Por que a automação não resolveu', porQueNaoFoiAutomatico(a)].join('\n'),
    identificacao,
    causa,
    lista('Evidências que o agente viu', a.evidencias),
    lista('Plano de ação proposto pelo agente', a.plano_de_acao),
    lista('Como validar', a.passos_de_validacao),
    pergunta,
    comoTrabalhar(a, agora),
  ].filter((x) => x !== null && x !== undefined && x !== '').join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}








export const TETO_LOTE = 5;

export function montarPromptLote(achados: AchadoParaPrompt[], agora: Date = new Date()): string {
  const xs = (Array.isArray(achados) ? achados : []).filter(Boolean);
  if (!xs.length) return '';
  if (xs.length === 1) return montarPromptDiagnostico(xs[0], agora);

  const usados = xs.slice(0, TETO_LOTE);
  const deFora = xs.length - usados.length;

  return [
    `Preciso corrigir ${usados.length} erros do ERP da CBRio. Todos saíram do módulo Agentes & Auditoria (aba Diagnósticos) e o agente desenvolvedor não os corrigiu sozinho.`,
    '',
    '⚠️ Trate um por vez, na ordem, e me diga ao fim de cada um o que você concluiu. Se algum já estiver resolvido, diga e passe para o seguinte — não invente conserto.',
    deFora > 0
      ? `\n⚠️ Há ${deFora} outro(s) achado(s) além destes ${usados.length}. Copie de novo depois de fechar esta rodada.`
      : null,
    '',
    ...usados.map((a, i) => [
      '',
      `═══════════ ${i + 1} de ${usados.length} ═══════════`,
      '',
      montarPromptDiagnostico(a, agora),
    ].join('\n')),
  ].filter((x) => x !== null).join('\n').replace(/\n{4,}/g, '\n\n\n').trim();
}
