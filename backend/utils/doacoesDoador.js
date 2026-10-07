






















const PLANOS_DOACAO = [
  { prefixo: '3.01.01', tipo: 'dizimo', rotulo: 'Dízimo' },
  { prefixo: '3.01.02', tipo: 'oferta', rotulo: 'Oferta' },
  { prefixo: '3.02.01', tipo: 'campanha', rotulo: 'Campanha' },
  { prefixo: '3.02.03.03', tipo: 'extraordinaria', rotulo: 'Doação extraordinária' },
  { prefixo: '3.02.03.05', tipo: 'missoes', rotulo: 'Missões' },
  { prefixo: '3.02.03.01', tipo: 'acao_social', rotulo: 'Ação social' },
  { prefixo: '3.02.05.05', tipo: 'outras', rotulo: 'Outras contribuições' },
];

const PREFIXOS_DOACAO = PLANOS_DOACAO.map((p) => p.prefixo);



const CLASSES_DOACAO = ['ordinaria', 'extraordinaria'];

const ORDEM_TIPOS = PLANOS_DOACAO.map((p) => p.tipo);

function tipoDoPlano(codigo) {
  const c = String(codigo || '').trim();
  if (!c) return null;

  const ordenados = [...PLANOS_DOACAO].sort((a, b) => b.prefixo.length - a.prefixo.length);
  return ordenados.find((p) => c === p.prefixo || c.startsWith(`${p.prefixo}.`)) || null;
}

function ehLinhaDeDoacao(linha) {
  return !!tipoDoPlano(linha?.plano_codigo) && CLASSES_DOACAO.includes(linha?.classe);
}



function chaveDoador(texto) {
  const s = String(texto ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  return s || null;
}

const BUSCA_MIN = 3;
const BUSCA_MAX = 100;

function validarBusca(q) {
  const chave = chaveDoador(q);

  if (!chave || chave.replace(/ /g, '').length < BUSCA_MIN) {
    return { ok: false, erro: `Digite pelo menos ${BUSCA_MIN} letras do nome.` };
  }
  if (chave.length > BUSCA_MAX) return { ok: false, erro: 'Busca longa demais.' };
  return { ok: true, q: String(q).trim() };
}

const CHAVES_MAX = 20;


function validarChaves(entrada) {
  const lista = (Array.isArray(entrada) ? entrada : (entrada == null ? [] : [entrada]))
    .map((c) => String(c ?? '').trim())
    .filter(Boolean);
  const unicas = [...new Set(lista)];
  if (!unicas.length) return { ok: false, erro: 'Escolha pelo menos um nome.' };
  if (unicas.length > CHAVES_MAX) return { ok: false, erro: `Junte no máximo ${CHAVES_MAX} variações do nome.` };
  if (unicas.some((c) => c.length > 200)) return { ok: false, erro: 'Nome inválido.' };
  return { ok: true, chaves: unicas };
}


function dataValida(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}




function validarPeriodo({ inicio, fim } = {}) {
  const i = inicio ? String(inicio).trim() : null;
  const f = fim ? String(fim).trim() : null;
  if (i && !dataValida(i)) return { ok: false, erro: 'Data inicial inválida.' };
  if (f && !dataValida(f)) return { ok: false, erro: 'Data final inválida.' };
  if (i && f && i > f) return { ok: false, erro: 'A data inicial é depois da final.' };
  return { ok: true, inicio: i, fim: f };
}

function centavos(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}






function resumirHistorico(linhas) {
  const validas = [];
  let descartadas = 0;
  for (const l of linhas || []) {
    if (ehLinhaDeDoacao(l)) validas.push(l);
    else descartadas += 1;
  }

  let totalC = 0;
  let primeira = null;
  let ultima = null;
  const porAno = new Map();
  const porTipo = new Map();
  const porNome = new Map();

  for (const l of validas) {
    const v = centavos(l.valor);
    const data = String(l.data || '').slice(0, 10);
    const ano = data.slice(0, 4);
    const tipo = tipoDoPlano(l.plano_codigo);
    totalC += v;
    if (data && (!primeira || data < primeira)) primeira = data;
    if (data && (!ultima || data > ultima)) ultima = data;

    const a = porAno.get(ano) || { ano, totalC: 0, qtd: 0, porTipoC: {} };
    a.totalC += v; a.qtd += 1;
    a.porTipoC[tipo.tipo] = (a.porTipoC[tipo.tipo] || 0) + v;
    porAno.set(ano, a);

    const t = porTipo.get(tipo.tipo) || { tipo: tipo.tipo, rotulo: tipo.rotulo, totalC: 0, qtd: 0 };
    t.totalC += v; t.qtd += 1;
    porTipo.set(tipo.tipo, t);

    const chave = l.chave || chaveDoador(l.nome) || '';
    const n = porNome.get(chave) || { chave, nome: l.nome || '', qtd: 0, totalC: 0 };
    n.qtd += 1; n.totalC += v;
    porNome.set(chave, n);
  }

  return {
    total: totalC / 100,
    qtd: validas.length,
    primeira,
    ultima,
    descartadas,
    por_ano: [...porAno.values()]
      .sort((x, y) => (x.ano < y.ano ? 1 : -1))
      .map((a) => ({
        ano: a.ano,
        total: a.totalC / 100,
        qtd: a.qtd,
        por_tipo: Object.fromEntries(Object.entries(a.porTipoC).map(([k, c]) => [k, c / 100])),
      })),
    por_tipo: [...porTipo.values()]
      .sort((x, y) => ORDEM_TIPOS.indexOf(x.tipo) - ORDEM_TIPOS.indexOf(y.tipo))
      .map((t) => ({ tipo: t.tipo, rotulo: t.rotulo, total: t.totalC / 100, qtd: t.qtd })),
    nomes: [...porNome.values()]
      .sort((x, y) => y.totalC - x.totalC)
      .map((n) => ({ chave: n.chave, nome: n.nome, qtd: n.qtd, total: n.totalC / 100 })),
  };
}

function dataBr(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

function rotuloPeriodo(inicio, fim) {
  if (!inicio && !fim) return 'Todo o histórico';
  if (inicio && fim) return `${dataBr(inicio)} a ${dataBr(fim)}`;
  if (inicio) return `A partir de ${dataBr(inicio)}`;
  return `Até ${dataBr(fim)}`;
}



function celulaSegura(v) {
  if (v == null) return '';
  const s = String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}






function montarPlanilha({ linhas, resumo, base, inicio, fim, geradoEm, geradoPor }) {
  const nomes = resumo.nomes.map((n) => n.nome).filter(Boolean);

  const avisos = [];
  if (base?.truncado) {
    avisos.push(['Atenção', `O período tem ${base.qtd_total} lançamentos; esta planilha traz os ${base.limite} mais recentes. Escolha um período menor para ter todos.`]);
  }
  if (resumo.descartadas > 0) {
    avisos.push(['Atenção', `${resumo.descartadas} lançamento(s) fora da régua de doação ficaram de fora.`]);
  }
  const cabecalho = [
    ['Relatório de doações (uso interno)'],
    ['Nome(s) no extrato', celulaSegura(nomes.join(' · '))],
    ['Período', rotuloPeriodo(inicio, fim)],
    ['Total', resumo.total],
    ['Lançamentos', resumo.qtd],
    ['Gerado em', celulaSegura(geradoEm || '')],
    ['Gerado por', celulaSegura(geradoPor || '')],
    ['Critério', 'Dízimos, ofertas, campanhas, missões, ação social, outras contribuições e doações extraordinárias do razão financeiro. Agrupado pelo nome do extrato: homônimos não são distinguidos.'],
    ...avisos,
    [],
  ];
  const doacoes = [
    ...cabecalho,
    ['Data', 'Valor (R$)', 'Tipo', 'Conta', 'Forma', 'Nome no extrato'],
    ...(linhas || []).filter(ehLinhaDeDoacao).map((l) => [
      dataBr(l.data),
      Number(l.valor) || 0,
      tipoDoPlano(l.plano_codigo)?.rotulo || '',
      celulaSegura([l.plano_codigo, l.plano_nome].filter(Boolean).join(' · ')),
      celulaSegura(l.forma_pagamento || ''),
      celulaSegura(l.nome || ''),
    ]),
  ];
  const tipos = resumo.por_tipo.map((t) => t.tipo);
  const rotulos = resumo.por_tipo.map((t) => t.rotulo);
  const porAno = [
    ['Ano', 'Total (R$)', 'Lançamentos', ...rotulos],
    ...resumo.por_ano.map((a) => [a.ano, a.total, a.qtd, ...tipos.map((t) => a.por_tipo[t] || 0)]),
    ['Total', resumo.total, resumo.qtd, ...resumo.por_tipo.map((t) => t.total)],
  ];
  return { doacoes, porAno };
}

function slug(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'doador';
}

function nomeArquivo({ nome, inicio, fim, ext }) {
  const periodo = !inicio && !fim ? 'tudo' : `${inicio || 'inicio'}_a_${fim || 'hoje'}`;
  return `doacoes_${slug(nome)}_${periodo}.${ext}`;
}







function registroDeAcesso({ acao, chaves, membros, inicio, fim, formato, qtd, user }) {
  const ids = (membros || []).map((m) => m.id).filter(Boolean);
  return {
    table_name: acao === 'download' ? 'fin_doador_relatorio' : 'fin_doador_historico',
    row_id: ids.length === 1 ? ids[0] : `nome:${(chaves || [])[0] || ''}`.slice(0, 200),
    action: 'INSERT',
    user_id: user?.userId || null,
    user_email: user?.email || null,
    changes: {
      tipo: acao === 'download' ? 'fin_doador_relatorio' : 'fin_doador_historico',
      chaves: chaves || [],
      membro_ids: ids,
      periodo: { inicio: inicio || null, fim: fim || null },
      formato: formato || null,
      qtd_linhas: qtd ?? null,
      quem: user?.name || null,
    },
  };
}

module.exports = {
  PLANOS_DOACAO,
  PREFIXOS_DOACAO,
  CLASSES_DOACAO,
  BUSCA_MIN,
  CHAVES_MAX,
  tipoDoPlano,
  ehLinhaDeDoacao,
  chaveDoador,
  validarBusca,
  validarChaves,
  validarPeriodo,
  resumirHistorico,
  rotuloPeriodo,
  dataBr,
  celulaSegura,
  montarPlanilha,
  nomeArquivo,
  registroDeAcesso,
};
