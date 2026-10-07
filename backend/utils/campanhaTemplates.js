





















const VALORES = {
  seguir: 'Seguir a Jesus',
  grupos: 'Conectar com Pessoas',
  investir: 'Investir Tempo com Deus',
  voluntarios: 'Servir em Comunidade',
  generosidade: 'Viver Generosamente',
};

const FAIXAS_GENEROSIDADE = [
  { rotulo: 'R$ 50 por mês', centavos: 5000 },
  { rotulo: 'R$ 100 por mês', centavos: 10000 },
  { rotulo: 'R$ 200 por mês', centavos: 20000 },
  { rotulo: 'R$ 500 por mês', centavos: 50000 },
  { rotulo: 'Outro valor', outro: true },
];

const TEMPLATES = {
  legado: {
    id: 'legado',
    nome: 'Arrecadação (modelo anterior)',
    descricao: 'Campanha de dinheiro sem porta de adesão — a que já estava no ar.',
    valor: 'generosidade',
    unidade: 'centavos',
    dinheiro: true,
    porta: null,
    abas: ['geral', 'cronograma', 'disparos', 'doacoes'],
    oculto: true,
  },
  generosidade: {
    id: 'generosidade',
    nome: 'Generosidade',
    descricao: 'Compromisso mensal por CPF (faixas), dígito verificador no extrato e comparação prometido × realizado.',
    valor: 'generosidade',
    unidade: 'centavos',
    dinheiro: true,
    porta: 'adesao',

    sinal: true,
    abas: ['geral', 'ativacoes', 'inscritos', 'cronograma', 'disparos', 'doacoes', 'comparativo'],
    faixasPadrao: FAIXAS_GENEROSIDADE,
    mesesPadrao: 12,
  },
  voluntariado: {
    id: 'voluntariado',
    nome: 'Voluntariado',
    descricao: 'Alvo em pessoas. A inscrição É a adesão (porta de voluntários que já existe); os QRs dizem de onde cada um veio.',
    valor: 'voluntarios',
    unidade: 'pessoas',
    dinheiro: false,
    porta: 'voluntariado',



    sinal: false,
    abas: ['geral', 'ativacoes', 'inscritos', 'cronograma', 'disparos', 'comparativo'],
  },
  grupos: {
    id: 'grupos',
    nome: 'Grupos',
    descricao: 'Alvo em pessoas. A porta é a inscrição pública em grupos (pedidos na janela); realizado = aprovados. QRs dizem de onde cada pedido veio.',
    valor: 'grupos',
    unidade: 'pessoas',
    dinheiro: false,
    porta: 'grupos',
    sinal: false,
    abas: ['geral', 'ativacoes', 'inscritos', 'cronograma', 'disparos', 'comparativo'],
  },
  seguir: {
    id: 'seguir',
    nome: 'Batismo',
    descricao: 'Alvo em pessoas. A porta é a inscrição de batismo (na janela); realizado = batismo realizado.',
    valor: 'seguir',
    unidade: 'pessoas',
    dinheiro: false,
    porta: 'batismo',
    sinal: false,
    abas: ['geral', 'ativacoes', 'inscritos', 'cronograma', 'disparos', 'comparativo'],
  },
  investir: {
    id: 'investir',
    nome: 'Devocional',
    descricao: 'Alvo em pessoas. A porta é a inscrição num plano de devocional pelo app (na janela); realizado = quem fez check-in de devocional na janela.',
    valor: 'investir',
    unidade: 'pessoas',
    dinheiro: false,
    porta: 'devocional',
    sinal: false,
    abas: ['geral', 'ativacoes', 'inscritos', 'cronograma', 'disparos', 'comparativo'],
  },
};






const TEMPLATE_POR_VALOR = {
  generosidade: 'generosidade', voluntarios: 'voluntariado', grupos: 'grupos',
  seguir: 'seguir', investir: 'investir',
};
function templatePorValor(valor) {
  const id = TEMPLATE_POR_VALOR[String(valor || '')];
  return id ? TEMPLATES[id] : null;
}







const INDICADOR_POR_VALOR = {
  generosidade: { manutencao: 'generosidade', manutencao_label: '% da base dizimista/ofertante', entrada_label: 'doadores no mês' },
  voluntarios: { manutencao: 'servir', manutencao_label: '% da base servindo', entrada_label: 'inscrições de voluntariado no mês' },
  grupos: { manutencao: 'conectar', manutencao_label: '% da base em grupo', entrada_label: 'pedidos de grupo no mês' },
  seguir: { manutencao: 'seguir', manutencao_label: '% da base batizada', entrada_label: 'inscrições de batismo no mês' },
  investir: { manutencao: 'investir', manutencao_label: '% da base com devocional', entrada_label: 'inscrições em plano no mês' },
};

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;
const MAX_FAIXAS = 8;

function listarTemplates() {
  return Object.values(TEMPLATES).filter((t) => !t.oculto).map((t) => ({
    id: t.id, nome: t.nome, descricao: t.descricao, valor: t.valor, valor_nome: VALORES[t.valor],
    unidade: t.unidade, dinheiro: t.dinheiro, porta: t.porta, abas: t.abas, sinal: !!t.sinal,
    faixas_padrao: t.faixasPadrao || [], meses_padrao: t.mesesPadrao || null,
  }));
}


function listarValores() {
  return Object.entries(VALORES).map(([id, nome]) => {
    const t = templatePorValor(id);
    return {
      id, nome, template: t ? t.id : null, template_nome: t ? t.nome : null,
      sinal: t ? !!t.sinal : null, unidade: t ? t.unidade : null, porta: t ? t.porta : null,
      indicador: INDICADOR_POR_VALOR[id] || null,
    };
  });
}

function templateDe(campanha) {
  const id = String(campanha?.template || 'legado');
  return TEMPLATES[id] || TEMPLATES.legado;
}

function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}


function qrSlugValido(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return SLUG_RE.test(s) ? s : null;
}


function slugAtivacao(campSlug, titulo) {
  const base = `${slugify(campSlug)}-${slugify(titulo)}`.replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  const cortado = base.slice(0, 50).replace(/-+$/g, '');
  if (!cortado) return 'ativacao';
  return cortado.length >= 3 ? cortado : `${cortado}-qr`;
}

function validarFaixas(bruto) {
  if (bruto === undefined || bruto === null) return { faixas: [] };
  if (!Array.isArray(bruto)) return { erro: 'As faixas precisam ser uma lista.' };
  const faixas = [];
  const vistos = new Set();
  for (const f of bruto.slice(0, MAX_FAIXAS + 1)) {
    const rotulo = String(f?.rotulo ?? '').trim().slice(0, 60);
    if (!rotulo) return { erro: 'Toda faixa precisa de um rótulo.' };
    const chave = rotulo.toLowerCase();
    if (vistos.has(chave)) return { erro: `Faixa repetida: "${rotulo}".` };
    vistos.add(chave);
    if (f?.outro) { faixas.push({ rotulo, outro: true }); continue; }
    const centavos = Math.round(Number(f?.centavos));
    if (!(centavos > 0)) return { erro: `A faixa "${rotulo}" precisa de um valor em centavos maior que zero.` };
    faixas.push({ rotulo, centavos });
  }
  if (faixas.length > MAX_FAIXAS) return { erro: `No máximo ${MAX_FAIXAS} faixas.` };
  return { faixas };
}





function validarNova(body = {}) {

  const t = body.template ? TEMPLATES[String(body.template)] : templatePorValor(body.valor);
  if (!t && body.valor && !body.template) return { erro: 'Este valor ainda não tem template de campanha (a decisão acontece no culto, não numa inscrição).' };
  if (!t || t.oculto) return { erro: 'Escolha um template de campanha válido.' };
  const nome = String(body.nome || '').trim();
  if (!nome) return { erro: 'O nome da campanha é obrigatório.' };
  const valores = { template: t.id, valor: t.valor, nome, meta_centavos: null, meta_pessoas: null, faixas: [], meses: null };
  if (t.unidade === 'centavos') {
    const meta = Math.round(Number(body.meta_centavos) || 0);
    if (meta <= 0) return { erro: 'Informe o alvo em reais (maior que zero).' };
    valores.meta_centavos = meta;
    const vf = validarFaixas(body.faixas === undefined ? t.faixasPadrao : body.faixas);
    if (vf.erro) return { erro: vf.erro };
    valores.faixas = vf.faixas;
    const meses = body.meses === undefined || body.meses === null || body.meses === ''
      ? (t.mesesPadrao || null) : Math.round(Number(body.meses));
    if (meses !== null && !(meses >= 1 && meses <= 60)) return { erro: 'Os meses do compromisso vão de 1 a 60.' };
    valores.meses = meses;
  } else {
    const meta = Math.round(Number(body.meta_pessoas) || 0);
    if (meta <= 0) return { erro: 'Informe o alvo em pessoas (maior que zero).' };
    valores.meta_pessoas = meta;
  }


  if (t.porta && t.porta !== 'adesao' && !(body.data_inicio && body.data_fim)) {
    return { erro: `Campanha de ${t.nome.toLowerCase()} precisa de início e fim: a janela é o que diz quais inscrições são dela.` };
  }
  const edicao = String(body.edicao_rotulo || '').trim().slice(0, 40);
  valores.edicao_rotulo = edicao || null;
  return { valores, template: t };
}


function camposAdesao(faixas) {
  const lista = Array.isArray(faixas) ? faixas : [];
  if (!lista.length) return [];
  const campos = [{
    key: 'faixa', label: 'Quanto você quer contribuir por mês?', tipo: 'escolha',
    obrigatorio: true, opcoes: lista.map((f) => f.rotulo),
  }];
  const outro = lista.find((f) => f.outro);
  if (outro) {
    campos.push({
      key: 'valor_outro', label: 'Qual valor por mês? (R$)', tipo: 'numero', obrigatorio: true,
      opcoes: [], mostrar_se: { key: 'faixa', valores: [outro.rotulo] },
    });
  }
  return campos;
}


function compromissoDe(faixas, dados) {
  const lista = Array.isArray(faixas) ? faixas : [];
  const rotulo = dados?.faixa;
  if (!rotulo) return null;
  const f = lista.find((x) => x.rotulo === rotulo);
  if (!f) return null;
  if (f.outro) {
    const txt = String(dados?.valor_outro ?? '').replace(/[^0-9,.]/g, '').replace(/\./g, '').replace(',', '.');
    const n = Number(txt);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n * 100);
  }
  const c = Math.round(Number(f.centavos));
  return c > 0 ? c : null;
}

function parseIso(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
}





function mesesDecorridos({ data_inicio, hoje, meses }) {
  const i = parseIso(data_inicio);
  const h = parseIso(hoje);
  if (!i || !h) return 0;
  if (h.y < i.y || (h.y === i.y && (h.m < i.m || (h.m === i.m && h.d < i.d)))) return 0;
  const n = (h.y - i.y) * 12 + (h.m - i.m) + 1;
  const teto = meses ? Number(meses) : Infinity;
  return Math.max(0, Math.min(n, teto));
}










function statusAderente({ compromisso_centavos, total_centavos, meses_decorridos }) {
  const comp = Math.max(0, Math.round(Number(compromisso_centavos) || 0));
  const total = Math.max(0, Math.round(Number(total_centavos) || 0));
  const dec = Math.max(0, Math.round(Number(meses_decorridos) || 0));
  if (comp <= 0) return total > 0 ? 'em_dia' : 'sem_compromisso';
  if (dec <= 0) return total > 0 ? 'em_dia' : 'aguardando';
  if (total <= 0) return 'sem_entrada';
  return total >= comp * dec ? 'em_dia' : 'atrasado';
}

const STATUS_ADERENTE = {
  em_dia: 'Em dia', atrasado: 'Atrasado', sem_entrada: 'Sem entrada',
  sem_compromisso: 'Sem valor definido', aguardando: 'Ainda não venceu',
};


function aderenteEmAtraso(status) {
  return status === 'atrasado' || status === 'sem_entrada';
}

function resumoAderentes(lista = []) {
  const r = { total: 0, em_dia: 0, atrasado: 0, sem_entrada: 0, sem_compromisso: 0, aguardando: 0, total_entradas_centavos: 0 };
  for (const i of lista) {
    if (!i || i.status === 'cancelada') continue;
    r.total += 1;
    const st = i.status_aderente || statusAderente(i);
    if (r[st] !== undefined) r[st] += 1;
    r.total_entradas_centavos += Math.max(0, Math.round(Number(i.total_centavos) || 0));
  }
  return r;
}









function serieMensal({ linhas = [], ate, meses = 12, janela = {} } = {}) {
  const m = /^(\d{4})-(\d{2})/.exec(String(ate || ''));
  if (!m) return [];
  let y = Number(m[1]); let mo = Number(m[2]);
  const chaves = [];
  for (let i = 0; i < meses; i += 1) {
    chaves.unshift(`${y}-${String(mo).padStart(2, '0')}`);
    mo -= 1; if (mo === 0) { mo = 12; y -= 1; }
  }
  const idx = new Map(chaves.map((k, i) => [k, i]));
  const out = chaves.map((k) => ({ mes: k, total: 0, com_qr: 0, na_campanha: false }));
  const ini = String(janela.data_inicio || '').slice(0, 7);
  const fim = String(janela.data_fim || '').slice(0, 7);
  for (const o of out) o.na_campanha = !!(ini && fim && o.mes >= ini && o.mes <= fim);
  for (const l of linhas) {
    const q = String(l?.quando || '');
    let chave;
    if (/^\d{4}-\d{2}-\d{2}$/.test(q)) chave = q.slice(0, 7);
    else {
      const d = new Date(q); if (Number.isNaN(d.getTime())) continue;
      chave = new Date(d.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 7);
    }
    const i = idx.get(chave); if (i === undefined) continue;
    out[i].total += 1;
    if (l.qr_slug) out[i].com_qr += 1;
  }
  return out;
}















function comparativoEncerramento({ campanha, reguas: r, alvoHistorico = [], porAtivacao = null, inscritos = [], serie = null, hoje } = {}) {
  const t = templateDe(campanha);
  const dinheiro = t.unidade === 'centavos';
  const hist = [...(alvoHistorico || [])].sort((a, b) => String(a.alterado_em || '').localeCompare(String(b.alterado_em || '')));
  const primeiro = hist[0] || null;
  const alvoFinal = Number(r?.alvo?.valor) || 0;
  const alvoOriginal = primeiro
    ? Number(dinheiro ? primeiro.meta_centavos_anterior : primeiro.meta_pessoas_anterior) || alvoFinal
    : alvoFinal;
  const ins = r?.inscritos || {};
  const prometido = dinheiro ? Number(ins.prometido_total_centavos || 0) : Number(ins.pessoas || 0);
  const realizado = Number(r?.realizado?.valor || 0);
  const vivos = (inscritos || []).filter((i) => i && i.status !== 'cancelada');
  const meses = campanha?.meses ? Number(campanha.meses) : null;


  const somaPor = (pred) => {
    const grupo = vivos.filter(pred);
    const prom = grupo.reduce((a, i) => a + (Number(i.compromisso_centavos) || 0), 0) * (meses || 1);
    const trouxe = grupo.reduce((a, i) => a + (Number(i.total_centavos) || 0), 0);
    return { inscritos: grupo.length, prometido_centavos: dinheiro ? prom : null, trouxe_centavos: dinheiro ? trouxe : null };
  };
  const ativacoes = (porAtivacao?.ativacoes || []).map((a) => ({
    link_id: a.link_id || a.id || null, slug: a.slug, titulo: a.titulo || a.slug, canal: a.canal || null, onde: a.onde || null,
    acessos: Number(a.acessos) || 0, conversao_pct: a.conversao_pct ?? null,
    ...somaPor((i) => i.qr_slug === a.slug),
  })).sort((a, b) => b.inscritos - a.inscritos || b.acessos - a.acessos);
  const conhecidos = new Set(ativacoes.map((a) => a.slug));
  const semQr = { slug: null, titulo: 'Sem QR (link direto ou outro caminho)', acessos: null, conversao_pct: null,
    ...somaPor((i) => !i.qr_slug || !conhecidos.has(i.qr_slug)) };


  let serie_resumo = null;
  if (serie && Array.isArray(serie.serie) && serie.serie.length) {
    const dentro = serie.serie.filter((m) => m.na_campanha); const fora = serie.serie.filter((m) => !m.na_campanha);
    const soma = (xs, k) => xs.reduce((a, m) => a + (Number(m[k]) || 0), 0);
    const mediaDentro = dentro.length ? soma(dentro, 'total') / dentro.length : null;
    const mediaFora = fora.length ? soma(fora, 'total') / fora.length : null;
    serie_resumo = {
      meses_campanha: dentro.length, total_campanha: soma(dentro, 'total'), com_qr_campanha: soma(dentro, 'com_qr'),
      media_mes_campanha: mediaDentro, media_mes_fora: mediaFora,
      lift_pct: mediaDentro != null && mediaFora ? Math.round(((mediaDentro - mediaFora) / mediaFora) * 100) : null,
    };
  }

  const fim = String(campanha?.data_fim || '').slice(0, 10);
  const encerrada = campanha?.status === 'encerrada' || campanha?.status === 'cancelada';
  return {
    unidade: t.unidade, dinheiro, sinal: !!t.sinal, template: t.id, status: campanha?.status || null,
    encerrada, janela_terminou: !!(fim && hoje && fim < String(hoje).slice(0, 10)),
    alvo: { original: alvoOriginal, final: alvoFinal, mudou: alvoOriginal !== alvoFinal, mudancas: hist.length,
      historico: hist.map((h) => ({ em: h.alterado_em, motivo: h.motivo,
        de: dinheiro ? h.meta_centavos_anterior : h.meta_pessoas_anterior, para: dinheiro ? h.meta_centavos_novo : h.meta_pessoas_novo })) },
    prometido, realizado,
    pct: {
      prometido_vs_original: pct(prometido, alvoOriginal), prometido_vs_final: pct(prometido, alvoFinal),
      realizado_vs_original: pct(realizado, alvoOriginal), realizado_vs_final: pct(realizado, alvoFinal),
      realizado_vs_prometido: pct(realizado, prometido),
    },
    inscritos_resumo: dinheiro ? resumoAderentes(vivos) : { total: vivos.length },
    por_ativacao: ativacoes, sem_qr: semQr, serie_resumo,
  };
}

function pct(a, b) {
  return b > 0 ? Number(((a / b) * 100).toFixed(1)) : 0;
}






function reguas({ campanha, inscritos = [], realizado = {}, hoje }) {
  const t = templateDe(campanha);
  const ativos = inscritos.filter((i) => !i || i.status !== 'cancelada');
  if (t.unidade === 'centavos') {
    const meta = Math.max(0, Math.round(Number(campanha?.meta_centavos) || 0));
    const meses = campanha?.meses ? Number(campanha.meses) : null;
    const compromisso = ativos.reduce((s, i) => s + (Number(i?.compromisso_centavos) || 0), 0);
    const decorridos = mesesDecorridos({ data_inicio: campanha?.data_inicio, hoje, meses });
    const total = meses ? compromisso * meses : compromisso;
    const ateHoje = compromisso * decorridos;
    const real = Math.max(0, Math.round(Number(realizado?.total_centavos) || 0));
    return {
      unidade: 'centavos',
      template: t.id,
      alvo: { valor: meta, minimo: campanha?.meta_minima_centavos || null },
      inscritos: {
        pessoas: ativos.length,
        com_compromisso: ativos.filter((i) => Number(i?.compromisso_centavos) > 0).length,
        compromisso_mensal_centavos: compromisso,
        prometido_total_centavos: total,
        prometido_ate_hoje_centavos: ateHoje,
        meses,
        meses_decorridos: decorridos,
      },
      realizado: { valor: real },
      pct: {
        inscritos_vs_alvo: pct(total, meta),
        realizado_vs_alvo: pct(real, meta),
        realizado_vs_prometido: pct(real, ateHoje),
      },
    };
  }
  const meta = Math.max(0, Math.round(Number(campanha?.meta_pessoas) || 0));
  const real = Math.max(0, Math.round(Number(realizado?.pessoas) || 0));
  return {
    unidade: 'pessoas',
    template: t.id,
    alvo: { valor: meta, minimo: null },
    inscritos: { pessoas: ativos.length },
    realizado: { valor: real },
    pct: {
      inscritos_vs_alvo: pct(ativos.length, meta),
      realizado_vs_alvo: pct(real, meta),
      realizado_vs_prometido: pct(real, ativos.length),
    },
  };
}


function statusEventoAdesao(statusCampanha) {
  return statusCampanha === 'ativa' ? 'publicado' : (statusCampanha === 'rascunho' ? 'rascunho' : 'encerrado');
}


function inscritosPorAtivacao(ativacoes, inscritos) {
  const porSlug = new Map();
  for (const i of inscritos || []) {
    const k = i?.qr_slug || null;
    porSlug.set(k, (porSlug.get(k) || 0) + 1);
  }
  const lista = (ativacoes || []).map((a) => ({
    ...a,
    inscritos: porSlug.get(a.slug) || 0,
    conversao_pct: pct(porSlug.get(a.slug) || 0, Number(a.acessos) || 0),
  }));
  const conhecidos = new Set(lista.map((a) => a.slug));
  let semQr = 0;
  for (const [k, n] of porSlug) if (!k || !conhecidos.has(k)) semQr += n;
  return { ativacoes: lista, sem_qr: semQr };
}

module.exports = {
  VALORES, TEMPLATES, FAIXAS_GENEROSIDADE, SLUG_RE, MAX_FAIXAS,
  listarTemplates, templateDe, slugify, qrSlugValido, slugAtivacao,
  validarFaixas, validarNova, camposAdesao, compromissoDe,
  mesesDecorridos, reguas, statusEventoAdesao, inscritosPorAtivacao,
  statusAderente, aderenteEmAtraso, resumoAderentes, STATUS_ADERENTE,
  TEMPLATE_POR_VALOR, templatePorValor, INDICADOR_POR_VALOR, listarValores, serieMensal, comparativoEncerramento,
};
