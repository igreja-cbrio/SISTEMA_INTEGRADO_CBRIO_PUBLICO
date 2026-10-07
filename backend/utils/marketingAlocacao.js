'use strict';









const regra = require('./marketingChecklist');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ITENS = 40;

const texto = (v) => (typeof v === 'string' ? v.trim() : '');
const dataValida = (v) => typeof v === 'string' && DATA_RE.test(v) && !Number.isNaN(Date.parse(v + 'T12:00:00Z'));



function validarItemNovo(item, i, { donoPadrao, exigirPlano }) {
  const n = i + 1;
  if (!texto(item?.texto)) return { erro: `Subtarefa ${n}: descreva o que precisa ser feito` };
  const { campos, erro } = regra.camposSubtarefa({
    membro_id: item.membro_id === undefined || item.membro_id === '' ? donoPadrao : item.membro_id,
    esforco_valor: item.esforco_valor,
    esforco_unidade: item.esforco_unidade ?? 'horas',
    prazo: item.prazo,
    exige_registro: item.exige_registro ?? false,
  });
  if (erro) return { erro: `Subtarefa ${n}: ${erro}` };
  if (exigirPlano) {
    if (!campos.membro_id) return { erro: `Subtarefa ${n}: escolha quem faz` };
    if (!(campos.esforco_valor > 0)) return { erro: `Subtarefa ${n}: informe o esforço (horas ou dias)` };
    if (!campos.prazo) return { erro: `Subtarefa ${n}: informe o prazo` };
  }
  return { item: { texto: texto(item.texto), grupo: texto(item.grupo) || null, ...campos } };
}

function ultimoPrazo(itens) {
  return itens.map(i => i.prazo).filter(Boolean).sort().pop() || null;
}





function validarNovaTarefa(body = {}, { modo = 'pendente' } = {}) {
  const titulo = texto(body.titulo);
  if (!titulo) return { erro: 'Dê um título para a tarefa' };
  if (!UUID_RE.test(String(body.atribuido_a || ''))) return { erro: 'Escolha o responsável' };
  if (!regra.PRIORIDADES.includes(body.prioridade)) return { erro: 'Escolha a prioridade' };
  const descricao = texto(body.descricao);
  if (modo === 'pendente' && !descricao) return { erro: 'Escreva o que você espera desta entrega' };
  if (body.culto != null && body.culto !== '' && !regra.CULTOS.includes(body.culto)) return { erro: 'Culto inválido' };
  const culto = body.culto || null;

  const lista = Array.isArray(body.itens) ? body.itens : [];
  if (!lista.length) return { erro: 'Inclua pelo menos uma subtarefa' };
  if (lista.length > MAX_ITENS) return { erro: `No máximo ${MAX_ITENS} subtarefas por tarefa` };
  const itens = [];
  for (let i = 0; i < lista.length; i++) {
    const r = validarItemNovo(lista[i], i, { donoPadrao: body.atribuido_a, exigirPlano: true });
    if (r.erro) return r;
    itens.push({ ...r.item, ordem: i });
  }

  const fimProducao = ultimoPrazo(itens);
  let prazoEntrega = null;
  if (modo === 'pendente') {
    if (!dataValida(body.prazo_entrega)) return { erro: 'Informe a data de entrega final (AAAA-MM-DD)' };
    prazoEntrega = body.prazo_entrega;
    if (fimProducao && prazoEntrega < fimProducao) {
      return { erro: `A entrega final (${prazoEntrega}) não pode ser antes do último prazo de subtarefa (${fimProducao})` };
    }
  }
  return {
    card: { titulo, descricao: descricao || null, atribuido_a: body.atribuido_a, prioridade: body.prioridade, culto, data_fim: fimProducao },
    itens,
    prazo_entrega: prazoEntrega,
  };
}



function validarEdicao(body = {}, atual = { itens: [] }) {
  const card = {};
  if (body.titulo !== undefined) {
    if (!texto(body.titulo)) return { erro: 'O título não pode ficar vazio' };
    card.titulo = texto(body.titulo);
  }
  if (body.descricao !== undefined) card.descricao = texto(body.descricao) || null;
  if (body.atribuido_a !== undefined) {
    if (!UUID_RE.test(String(body.atribuido_a || ''))) return { erro: 'Responsável inválido' };
    card.atribuido_a = body.atribuido_a;
  }
  if (body.prioridade !== undefined) {
    if (body.prioridade !== null && !regra.PRIORIDADES.includes(body.prioridade)) return { erro: 'Prioridade inválida' };
    card.prioridade = body.prioridade;
  }
  if (body.culto !== undefined) {
    if (body.culto !== null && body.culto !== '' && !regra.CULTOS.includes(body.culto)) return { erro: 'Culto inválido' };
    card.culto = body.culto || null;
  }

  const remover = Array.isArray(body.remover_itens) ? body.remover_itens.filter(id => UUID_RE.test(String(id))) : [];
  const idsAtuais = new Set((atual.itens || []).map(i => i.id));
  const atualizar = [];
  for (const [i, it] of (Array.isArray(body.atualizar_itens) ? body.atualizar_itens : []).entries()) {
    if (!idsAtuais.has(it?.id)) return { erro: `Subtarefa ${i + 1} não pertence a esta tarefa` };
    const { campos, erro } = regra.camposSubtarefa({
      membro_id: it.membro_id, esforco_valor: it.esforco_valor, esforco_unidade: it.esforco_unidade,
      prazo: it.prazo, exige_registro: it.exige_registro,
    });
    if (erro) return { erro: `Subtarefa ${i + 1}: ${erro}` };
    if (it.texto !== undefined) {
      if (!texto(it.texto)) return { erro: `Subtarefa ${i + 1}: o texto não pode ficar vazio` };
      campos.texto = texto(it.texto);
    }
    atualizar.push({ id: it.id, campos });
  }
  const novos = [];
  const donoPadrao = card.atribuido_a || atual.atribuido_a;
  for (const [i, it] of (Array.isArray(body.novos_itens) ? body.novos_itens : []).entries()) {
    const r = validarItemNovo(it, i, { donoPadrao, exigirPlano: true });
    if (r.erro) return { erro: r.erro.replace('Subtarefa', 'Nova subtarefa') };
    novos.push(r.item);
  }


  const sobram = (atual.itens || [])
    .filter(i => !remover.includes(i.id))
    .map(i => {
      const a = atualizar.find(x => x.id === i.id);
      return a && a.campos.prazo !== undefined ? { prazo: a.campos.prazo } : { prazo: i.prazo };
    })
    .concat(novos);
  const fimProducao = ultimoPrazo(sobram);
  if (novos.length || atualizar.length || remover.length) card.data_fim = fimProducao;

  let prazoEntrega;
  if (body.prazo_entrega !== undefined) {
    if (!dataValida(body.prazo_entrega)) return { erro: 'Data de entrega final inválida (AAAA-MM-DD)' };
    prazoEntrega = body.prazo_entrega;
  }
  const entregaConferir = prazoEntrega ?? atual.prazo_entrega ?? null;
  if (entregaConferir && fimProducao && entregaConferir < fimProducao) {
    return { erro: `A entrega final (${entregaConferir}) não pode ser antes do último prazo de subtarefa (${fimProducao})` };
  }
  return { card, atualizar, novos, remover, prazo_entrega: prazoEntrega };
}



const HORAS_POR_DIA = 8;
function horasDoItem(item) {
  const v = Number(item?.esforco_valor) || 0;
  return item?.esforco_unidade === 'dias' ? v * HORAS_POR_DIA : v;
}




function cargaPorSemana(itens, { prazoDaTarefa = {}, semanaDe }) {
  const carga = {};
  for (const i of itens || []) {
    if (i.feito || !i.membro_id) continue;
    const h = horasDoItem(i);
    if (!(h > 0)) continue;
    const data = i.prazo || prazoDaTarefa[i.card_id];
    if (!data) continue;
    const s = semanaDe(data);
    if (s == null) continue;
    const sem = Math.max(1, s);
    const m = (carga[i.membro_id] ||= {});
    m[sem] = Math.round(((m[sem] || 0) + h) * 10) / 10;
  }
  return carga;
}

module.exports = {
  HORAS_POR_DIA, MAX_ITENS,
  validarNovaTarefa, validarEdicao, horasDoItem, ultimoPrazo, cargaPorSemana,
};
