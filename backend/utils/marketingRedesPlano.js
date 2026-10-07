'use strict';


















const DIA_MS = 86400000;
const utc = (s) => Date.parse(`${s}T00:00:00Z`);
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const somarDias = (dia, n) => iso(utc(dia) + n * DIA_MS);
const domingoDe = (dia) => iso(utc(dia) - new Date(utc(dia)).getUTCDay() * DIA_MS);
const mesDe = (dia) => String(dia).slice(0, 7);
const quartaDe = (domingo) => somarDias(domingo, 3);

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
  'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const nomeDoMes = (mes) => MESES[Number(String(mes).slice(5, 7)) - 1] || '';
const nomeDoMesMaiusculo = (mes) => { const n = nomeDoMes(mes); return n.charAt(0).toUpperCase() + n.slice(1); };
const ddmm = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '');

const mesValido = (mes) => typeof mes === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes);
function dataValida(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = utc(s);
  return Number.isFinite(t) && iso(t) === s;
}

function mesSeguinte(mes) {
  const [a, m] = mes.split('-').map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
}
function mesAnterior(mes) {
  const [a, m] = mes.split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
}
const ultimoDiaDoMes = (mes) => somarDias(`${mesSeguinte(mes)}-01`, -1);



function semanasDoMes(mes) {
  if (!mesValido(mes)) throw new Error(`semanasDoMes: mês inválido (${mes})`);
  const dia1 = `${mes}-01`;
  const ultimo = ultimoDiaDoMes(mes);
  let dom = domingoDe(dia1);
  if (mesDe(quartaDe(dom)) !== mes) dom = somarDias(dom, 7);
  const out = [];
  for (let n = 1; mesDe(quartaDe(dom)) === mes; n += 1, dom = somarDias(dom, 7)) {
    const fim = somarDias(dom, 6);
    out.push({ n, inicio: dom, fim, primeiro_dia: dom < dia1 ? dia1 : dom, ultimo_dia: fim > ultimo ? ultimo : fim });
  }
  return out;
}


function semanaDoMes(domingo) {
  const mes = mesDe(quartaDe(domingoDe(domingo)));
  const semanas = semanasDoMes(mes);
  const n = semanas.findIndex(s => s.inicio === domingoDe(domingo)) + 1;
  return { mes, n, total: semanas.length };
}


const SEMANAS_DO_MES = [1, 2, 3, 4, 5, -1, -2, -3];
const ROTULO_SEMANA_DO_MES = {
  1: '1ª semana', 2: '2ª semana', 3: '3ª semana', 4: '4ª semana', 5: '5ª semana',
  '-1': 'última semana', '-2': 'penúltima semana', '-3': 'antepenúltima semana',
};



function validarFrequencia({ frequencia, semana_do_mes } = {}) {
  if (frequencia === undefined && semana_do_mes === undefined) return { ok: true, campos: {} };
  if (frequencia === 'semanal') return { ok: true, campos: { frequencia: 'semanal', semana_do_mes: null } };
  if (frequencia !== 'mensal') return { ok: false, erro: 'Frequência inválida: use semanal ou mensal.' };
  const s = Number(semana_do_mes);
  if (!SEMANAS_DO_MES.includes(s)) return { ok: false, erro: 'Escolha em que semana do mês a rotina acontece.' };
  return { ok: true, campos: { frequencia: 'mensal', semana_do_mes: s } };
}



function compromissoNaSemana(c, domingo) {
  if (!c || c.frequencia !== 'mensal') return true;
  const alvo = Number(c.semana_do_mes);
  if (!SEMANAS_DO_MES.includes(alvo)) return false;
  const { n, total } = semanaDoMes(domingo);
  return alvo > 0 ? n === alvo : n === total + alvo + 1;
}


const mesDoPlanejamento = (domingo) => mesSeguinte(semanaDoMes(domingo).mes);



function semanaDeProducao(mes, k) {
  const semanas = semanasDoMes(mes);
  if (!(k >= 1 && k <= semanas.length)) throw new Error(`semanaDeProducao: semana ${k} fora de ${mes}`);
  if (k === 1) { const ant = semanasDoMes(mesAnterior(mes)); return ant[ant.length - 1]; }
  return semanas[k - 2];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOME_MAX = 200;
const DESCRICAO_MAX = 2000;
const POSTS_MAX = 200;
const texto = (v) => String(v ?? '').replace(/\r\n?/g, '\n').trim();

function urlValida(s) {
  if (!s) return true;
  if (s.length > 1000) return false;
  try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; }
}


const postVazio = (p) => !texto(p?.nome) && !texto(p?.ref_url) && !texto(p?.descricao)
  && !((p?.ref_arquivos || []).length);



function validarPlano({ posts = [], responsavel_membro_id } = {}, { mes } = {}) {
  if (!mesValido(mes)) return { ok: false, erro: 'Mês inválido.' };
  if (!UUID.test(String(responsavel_membro_id || ''))) {
    return { ok: false, erro: 'Escolha quem produz e posta.' };
  }
  if (!Array.isArray(posts)) return { ok: false, erro: 'As postagens vieram em formato inválido.' };
  const semanas = semanasDoMes(mes);
  const reais = posts.filter(p => !postVazio(p));
  if (reais.length > POSTS_MAX) return { ok: false, erro: `No máximo ${POSTS_MAX} postagens por mês.` };
  const out = [];
  const ordemPorSemana = {};
  for (const p of reais) {
    const k = Number(p.semana);
    const sem = semanas[k - 1];
    if (!Number.isInteger(k) || !sem) return { ok: false, erro: 'Postagem numa semana que este mês não tem.' };
    const rot = `Semana ${k}`;
    const nome = texto(p.nome);
    if (!nome) return { ok: false, erro: `${rot}: falta o nome de uma postagem.` };
    if (nome.length > NOME_MAX) return { ok: false, erro: `${rot}: o nome "${nome.slice(0, 30)}…" passou de ${NOME_MAX} caracteres.` };
    if (!dataValida(p.dia_provavel)) return { ok: false, erro: `${rot} · ${nome}: escolha o dia provável da postagem.` };
    if (p.dia_provavel < sem.primeiro_dia || p.dia_provavel > sem.ultimo_dia) {
      return { ok: false, erro: `${rot} · ${nome}: o dia provável tem de ser entre ${ddmm(sem.primeiro_dia)} e ${ddmm(sem.ultimo_dia)} (é a semana da postagem).` };
    }
    const refUrl = texto(p.ref_url);
    if (!urlValida(refUrl)) return { ok: false, erro: `${rot} · ${nome}: a referência precisa ser um link (http… ou https…).` };
    const descricao = texto(p.descricao);
    if (descricao.length > DESCRICAO_MAX) return { ok: false, erro: `${rot} · ${nome}: a descrição passou de ${DESCRICAO_MAX} caracteres.` };
    if (!UUID.test(String(p.responsavel_membro_id || ''))) return { ok: false, erro: `${rot} · ${nome}: escolha o responsável.` };
    if (p.id != null && !UUID.test(String(p.id))) return { ok: false, erro: 'Postagem inválida.' };
    ordemPorSemana[k] = (ordemPorSemana[k] || 0) + 1;
    out.push({
      id: p.id || null, semana: k, ordem: ordemPorSemana[k], dia_provavel: p.dia_provavel, nome,
      ref_url: refUrl || null, descricao: descricao || null, responsavel_membro_id: p.responsavel_membro_id,
      ref_arquivos: Array.isArray(p.ref_arquivos) ? p.ref_arquivos : [],
    });
  }
  return { ok: true, posts: out, responsavel_membro_id };
}



function tarefasDoPlano({ mes, posts = [], responsavel_membro_id }) {
  const semanas = semanasDoMes(mes);
  const Mes = nomeDoMesMaiusculo(mes);
  const out = [];
  for (const sem of semanas) {
    const daSemana = posts.filter(p => p.semana === sem.n).sort((a, b) => a.ordem - b.ordem);
    if (!daSemana.length) continue;
    const prod = semanaDeProducao(mes, sem.n);
    const quando = `${ddmm(sem.primeiro_dia)} a ${ddmm(sem.ultimo_dia)}`;
    const qtd = `${daSemana.length} ${daSemana.length === 1 ? 'postagem' : 'postagens'}`;
    out.push({
      semana: sem.n, etapa: 'producao',
      titulo: `Produzir posts · Semana ${sem.n} de ${Mes}`,
      descricao: `Produzir ${qtd} que vão ao ar na Semana ${sem.n} de ${nomeDoMes(mes)} (${quando}). A referência e a descrição estão em cada item.`,
      data_inicio: prod.inicio, data_fim: prod.fim, atribuido_a: responsavel_membro_id,
      itens: daSemana.map(p => ({ post: p, texto: p.nome, membro_id: p.responsavel_membro_id, prazo: prod.fim })),
    });
    out.push({
      semana: sem.n, etapa: 'postagem',
      titulo: `Postar · Semana ${sem.n} de ${Mes}`,
      descricao: `Postar ${qtd} da Semana ${sem.n} de ${nomeDoMes(mes)} (${quando}), cada uma no dia provável.`,
      data_inicio: sem.inicio, data_fim: sem.fim, atribuido_a: responsavel_membro_id,
      itens: daSemana.map(p => ({ post: p, texto: p.nome, membro_id: responsavel_membro_id, prazo: p.dia_provavel })),
    });
  }
  return out;
}



function planoEmBranco(mes, responsavel_membro_id = null) {
  return semanasDoMes(mes).map(s => ({
    id: null, semana: s.n, ordem: 1, dia_provavel: s.primeiro_dia, nome: '', ref_url: '', descricao: '',
    responsavel_membro_id, ref_arquivos: [],
  }));
}



function separarRefs(enviados = [], gravados = []) {
  const porItem = new Map((gravados || []).filter(r => r && r.item_id).map(r => [String(r.item_id), r]));
  const manter = [];
  const conferir = [];
  for (const r of enviados || []) {
    if (r && r.sharepoint_item_id && r.drive_id) conferir.push({ drive_id: String(r.drive_id), sharepoint_item_id: String(r.sharepoint_item_id) });
    else if (r && r.item_id && porItem.has(String(r.item_id))) manter.push(porItem.get(String(r.item_id)));
  }
  return { manter, conferir };
}



function anotarPostagens(cards = [], posts = []) {
  const porSub = new Map();
  for (const p of posts || []) {
    const info = {
      dia_provavel: p.dia_provavel, ref_url: p.ref_url || null, descricao: p.descricao || null,
      ref_arquivos: Array.isArray(p.ref_arquivos) ? p.ref_arquivos.map(r => ({ nome: r.nome, web_url: r.web_url })) : [],
    };
    if (p.subtarefa_producao_id) porSub.set(p.subtarefa_producao_id, { ...info, etapa: 'producao' });
    if (p.subtarefa_postagem_id) porSub.set(p.subtarefa_postagem_id, { ...info, etapa: 'postagem' });
  }
  for (const t of cards || []) {
    for (const i of (t && t.itens) || []) if (porSub.has(i.id)) i.plano = porSub.get(i.id);
  }
}

module.exports = {
  MESES, SEMANAS_DO_MES, ROTULO_SEMANA_DO_MES, validarFrequencia, nomeDoMes, mesValido, dataValida, mesSeguinte, mesAnterior,
  domingoDe, semanasDoMes, semanaDoMes, compromissoNaSemana, mesDoPlanejamento, semanaDeProducao,
  validarPlano, tarefasDoPlano, planoEmBranco, postVazio, separarRefs, anotarPostagens,
};
