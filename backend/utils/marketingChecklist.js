'use strict';







const UNIDADES = ['horas', 'dias'];
const PRIORIDADES = ['baixa', 'normal', 'alta', 'urgente'];
const VISIBILIDADES = ['equipe', 'so_lider', 'lider_move'];
const CULTOS = ['cbrio', 'ami', 'kids'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const ESFORCO_MAX = 999;

function ehLider({ role, habilidades } = {}) {
  if (role === 'admin' || role === 'diretor') return true;
  return Array.isArray(habilidades) && habilidades.includes('coordenador');
}







function podeMarcarItem({ lider, nivel, meusMembroIds, item, card }) {
  if (lider) return true;
  const vis = card?.visibilidade || 'equipe';
  if (vis === 'lider_move' || vis === 'so_lider') return false;
  const meus = Array.isArray(meusMembroIds) ? meusMembroIds : [];
  if (item?.membro_id && meus.includes(item.membro_id)) return true;
  if (card?.atribuido_a && meus.includes(card.atribuido_a)) return true;
  return typeof nivel === 'number' && nivel >= 3;
}



function podeEditarItem({ lider, nivel, card }) {
  if (lider) return true;
  const vis = card?.visibilidade || 'equipe';
  if (vis === 'lider_move' || vis === 'so_lider') return false;
  return typeof nivel === 'number' && nivel >= 3;
}




function camposSubtarefa(body = {}) {
  const campos = {};
  if (body.membro_id !== undefined) {
    if (body.membro_id === null || body.membro_id === '') campos.membro_id = null;
    else if (UUID_RE.test(String(body.membro_id))) campos.membro_id = String(body.membro_id);
    else return { erro: 'membro_id inválido' };
  }
  if (body.esforco_valor !== undefined) {
    const v = body.esforco_valor;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > ESFORCO_MAX) {
      return { erro: `esforco_valor deve ser um número entre 0 e ${ESFORCO_MAX}` };
    }
    campos.esforco_valor = Math.round(v * 10) / 10;
  }
  if (body.esforco_unidade !== undefined) {
    if (!UNIDADES.includes(body.esforco_unidade)) return { erro: "esforco_unidade deve ser 'horas' ou 'dias'" };
    campos.esforco_unidade = body.esforco_unidade;
  }
  if (body.prazo !== undefined) {
    if (body.prazo === null || body.prazo === '') campos.prazo = null;
    else if (DATA_RE.test(String(body.prazo)) && !Number.isNaN(Date.parse(String(body.prazo) + 'T12:00:00Z'))) {
      campos.prazo = String(body.prazo);
    } else return { erro: 'prazo deve ser uma data AAAA-MM-DD' };
  }
  if (body.exige_registro !== undefined) {
    if (typeof body.exige_registro !== 'boolean') return { erro: 'exige_registro deve ser verdadeiro ou falso' };
    campos.exige_registro = body.exige_registro;
  }
  if (body.registro !== undefined) {
    if (body.registro !== null && typeof body.registro !== 'string') return { erro: 'registro deve ser texto' };
    campos.registro = body.registro === null ? null : body.registro.trim() || null;
  }
  return { campos };
}



function faltaRegistro({ exigeRegistro, feito, registro }) {
  return !!(feito && exigeRegistro && !(typeof registro === 'string' && registro.trim()));
}


function camposCardLider(body = {}) {
  const campos = {};
  if (body.culto !== undefined) {
    if (body.culto !== null && !CULTOS.includes(body.culto)) return { erro: 'culto inválido' };
    campos.culto = body.culto;
  }
  if (body.prioridade !== undefined) {
    if (body.prioridade !== null && !PRIORIDADES.includes(body.prioridade)) return { erro: 'prioridade inválida' };
    campos.prioridade = body.prioridade;
  }
  if (body.visibilidade !== undefined) {
    if (!VISIBILIDADES.includes(body.visibilidade)) return { erro: 'visibilidade inválida' };
    campos.visibilidade = body.visibilidade;
  }
  return { campos };
}

module.exports = {
  UNIDADES, PRIORIDADES, VISIBILIDADES, CULTOS,
  ehLider, podeMarcarItem, podeEditarItem, camposSubtarefa, faltaRegistro, camposCardLider,
};
