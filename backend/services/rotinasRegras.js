













const FREQUENCIAS = ['diaria', 'semanal', 'quinzenal', 'mensal'];

function somarDias(dataStr, dias) {
  const [y, m, d] = String(dataStr).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}
function diaSemanaDe(dataStr) {
  const [y, m, d] = String(dataStr).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function ultimoDiaDoMes(ano, mes) {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}








function ocorrenciasDoItem(item, de, ate) {
  if (!item || !FREQUENCIAS.includes(item.frequencia) || !de || !ate || de > ate) return [];
  const inicio = item.inicio ? String(item.inicio).slice(0, 10) : de;
  const desde = inicio > de ? inicio : de;
  const out = [];
  if (item.frequencia === 'diaria') {
    for (let c = desde; c <= ate; c = somarDias(c, 1)) {
      const dow = diaSemanaDe(c);
      if (dow >= 1 && dow <= 5) out.push(c);
    }
    return out;
  }
  if (item.frequencia === 'semanal' || item.frequencia === 'quinzenal') {
    if (item.dia_semana == null) return [];
    const passo = item.frequencia === 'semanal' ? 7 : 14;


    let c = somarDias(inicio, (Number(item.dia_semana) - diaSemanaDe(inicio) + 7) % 7);
    while (c < desde) c = somarDias(c, passo);
    for (; c <= ate; c = somarDias(c, passo)) out.push(c);
    return out;
  }

  if (item.dia_mes == null) return [];
  let [y, m] = desde.split('-').map(Number);
  for (let guarda = 0; guarda < 400; guarda += 1) {
    const dia = Math.min(Number(item.dia_mes), ultimoDiaDoMes(y, m));
    const data = `${y}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    if (data > ate) break;
    if (data >= desde) out.push(data);
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  return out;
}


function normalizarItem(b = {}, { parcial = false } = {}) {
  const item = {};
  const def = (k, v) => { if (!parcial || b[k] !== undefined) item[k] = v; };
  const titulo = String(b.titulo ?? '').trim().replace(/\s+/g, ' ');
  if (!parcial || b.titulo !== undefined) {
    if (!titulo || titulo.length > 200) return { erro: 'Título é obrigatório (até 200 caracteres)' };
    item.titulo = titulo;
  }
  if (!parcial || b.frequencia !== undefined) {
    if (!FREQUENCIAS.includes(b.frequencia)) return { erro: 'Frequência inválida' };
    item.frequencia = b.frequencia;
  }
  const freq = item.frequencia ?? b.frequencia;
  if (freq === 'semanal' || freq === 'quinzenal') {
    const dow = Number(b.dia_semana);
    if (!Number.isInteger(dow) || dow < 0 || dow > 6) return { erro: 'Escolha o dia da semana' };
    item.dia_semana = dow; item.dia_mes = null;
  } else if (freq === 'mensal') {
    const dm = Number(b.dia_mes);
    if (!Number.isInteger(dm) || dm < 1 || dm > 31) return { erro: 'Escolha o dia do mês (1 a 31)' };
    item.dia_mes = dm; item.dia_semana = null;
  } else if (freq === 'diaria') {
    item.dia_semana = null; item.dia_mes = null;
  }
  def('descricao', String(b.descricao ?? '').trim().slice(0, 2000));
  if (!parcial || b.responsavel_id !== undefined) {
    if (typeof b.responsavel_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(b.responsavel_id)) return { erro: 'Escolha o responsável' };
    item.responsavel_id = b.responsavel_id;
  }
  if (b.inicio !== undefined && b.inicio !== null && b.inicio !== '') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.inicio))) return { erro: 'Data de início inválida' };
    item.inicio = String(b.inicio);
  }
  return { item };
}





function areasVisiveis(ctx, areas) {
  if (ctx.geral || ctx.pmo) return null;
  const vis = new Set(ctx.areasLider || []);
  (areas || []).forEach((a) => { if (ctx.diretorias?.has(a.diretoria)) vis.add(a.area); });
  return vis;
}
function podeVerArea(ctx, areas, area) {
  const vis = areasVisiveis(ctx, areas);
  return vis === null || vis.has(area);
}


const podeGerirArea = podeVerArea;




function resumoCumprimento(tarefas, hoje) {
  const r = { previstas: 0, cumpridas: 0, naoCumpridas: 0, emAberto: 0, pct: null };
  (tarefas || []).forEach((t) => {
    const data = t.data ? String(t.data).slice(0, 10) : null;
    const feita = t.status === 'concluida';
    if (!data || data >= hoje) { if (!feita) r.emAberto += 1; else { r.previstas += 1; r.cumpridas += 1; } return; }
    r.previstas += 1;
    if (feita) r.cumpridas += 1; else r.naoCumpridas += 1;
  });
  r.pct = r.previstas ? Math.round((r.cumpridas / r.previstas) * 100) : null;
  return r;
}




function periodoDoPainel(periodo, hoje) {
  const [y, m] = hoje.split('-').map(Number);
  if (periodo === 'mes') return { de: `${y}-${String(m).padStart(2, '0')}-01`, ate: hoje };
  if (periodo === 'semana') {
    const dow = diaSemanaDe(hoje);
    return { de: somarDias(hoje, -((dow + 6) % 7)), ate: hoje };
  }
  return { de: somarDias(hoje, -29), ate: hoje };
}








function montarPainel({ rotinas, itens, tarefas, areas, hoje }) {
  const porItem = {};
  (tarefas || []).forEach((t) => { (porItem[t.rotina_item_id] = porItem[t.rotina_item_id] || []).push(t); });
  const itensPorRotina = {};
  (itens || []).forEach((i) => { (itensPorRotina[i.rotina_id] = itensPorRotina[i.rotina_id] || []).push(i); });
  const rotuloDe = Object.fromEntries((areas || []).map((a) => [a.area, a.rotulo]));
  const tarefasDoItem = (id) => porItem[id] || [];

  const rotinasMontadas = (rotinas || []).map((r) => {
    const its = (itensPorRotina[r.id] || []).map((i) => ({
      id: i.id, titulo: i.titulo, frequencia: i.frequencia, dia_semana: i.dia_semana, dia_mes: i.dia_mes,
      responsavel_id: i.responsavel_id, responsavel_nome: i.responsavel_nome || null,
      ...resumoCumprimento(tarefasDoItem(i.id), hoje),
    }));
    const todas = (itensPorRotina[r.id] || []).flatMap((i) => tarefasDoItem(i.id));
    return { id: r.id, nome: r.nome, area: r.area, itens: its, ...resumoCumprimento(todas, hoje) };
  });

  const areasMontadas = [...new Set(rotinasMontadas.map((r) => r.area))].map((area) => {
    const rs = rotinasMontadas.filter((r) => r.area === area);
    const todas = (rotinas || []).filter((r) => r.area === area)
      .flatMap((r) => (itensPorRotina[r.id] || []).flatMap((i) => tarefasDoItem(i.id)));
    return { area, rotulo: rotuloDe[area] || area, rotinas: rs, ...resumoCumprimento(todas, hoje) };
  }).sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101) || a.rotulo.localeCompare(b.rotulo, 'pt-BR'));


  const nomeItem = {}; const nomeRotina = {}; const areaRotina = {};
  (rotinas || []).forEach((r) => { nomeRotina[r.id] = r.nome; areaRotina[r.id] = r.area; });
  (itens || []).forEach((i) => { nomeItem[i.id] = i; });
  const naoCumpridas = (tarefas || [])
    .filter((t) => t.status !== 'concluida' && t.data && String(t.data).slice(0, 10) < hoje)
    .map((t) => {
      const it = nomeItem[t.rotina_item_id] || {};
      return {
        data: String(t.data).slice(0, 10), item: it.titulo || '—', responsavel_nome: it.responsavel_nome || null,
        rotina: nomeRotina[it.rotina_id] || '—', area: rotuloDe[areaRotina[it.rotina_id]] || areaRotina[it.rotina_id] || '—',
      };
    })
    .sort((a, b) => b.data.localeCompare(a.data));

  return {
    geral: resumoCumprimento(tarefas, hoje),
    areas: areasMontadas,
    naoCumpridas: naoCumpridas.slice(0, 30),
    totalNaoCumpridas: naoCumpridas.length,
  };
}






const ORDEM_STATUS = { pendente: 0, em_andamento: 1, concluida: 2 };
function quadroLevantamento({ areas, rotinas, itens, declaracoes }) {
  const rotinasPorArea = {};
  (rotinas || []).forEach((r) => { (rotinasPorArea[r.area] = rotinasPorArea[r.area] || []).push(r.id); });
  const itensPorRotina = {};
  (itens || []).forEach((i) => { itensPorRotina[i.rotina_id] = (itensPorRotina[i.rotina_id] || 0) + 1; });
  const feita = Object.fromEntries((declaracoes || []).map((d) => [d.area, d.concluida_em]));
  return (areas || []).map((a) => {
    const ids = rotinasPorArea[a.area] || [];
    const nItens = ids.reduce((s, id) => s + (itensPorRotina[id] || 0), 0);
    const status = feita[a.area] ? 'concluida' : ids.length ? 'em_andamento' : 'pendente';
    return { ...a, rotinas: ids.length, itens: nItens, status, concluida_em: feita[a.area] || null };
  }).sort((x, y) => ORDEM_STATUS[x.status] - ORDEM_STATUS[y.status] || x.rotulo.localeCompare(y.rotulo, 'pt-BR'));
}

module.exports = {
  FREQUENCIAS,
  quadroLevantamento,
  periodoDoPainel,
  montarPainel,
  somarDias,
  ocorrenciasDoItem,
  normalizarItem,
  areasVisiveis,
  podeVerArea,
  podeGerirArea,
  resumoCumprimento,
};
