

























const { moduloDoContexto } = require('./whatsappModulo');













const JANELA_DIAS = 7;


function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim();
}



















function setorDoModulo(modulo, setores) {
  const alvo = normalizar(modulo);
  if (!alvo) return null;
  const candidatos = (Array.isArray(setores) ? setores : [])
    .filter((s) => s && s.ativo !== false && normalizar(s.area) === alvo);
  if (!candidatos.length) return null;
  return candidatos.reduce((a, b) => (Number(a.ordem ?? 1e9) <= Number(b.ordem ?? 1e9) ? a : b));
}














function decidirRoteamento({
  area = null, atribuidoA = null, contexto = null,
  disparoEm = null, agora = null, setores = [],
} = {}) {
  if (area || atribuidoA) return null;
  if (!contexto) return null;
  if (!dentroDaJanela(disparoEm, agora)) return null;

  const destino = moduloDoContexto(contexto);
  const setor = setorDoModulo(destino?.modulo, setores);
  if (!setor) return null;

  const temDono = setor.destino_tipo === 'atendente' && !!setor.atendente_id;
  return {
    area: setor.area,
    atendenteId: temDono ? setor.atendente_id : null,
    setor,
  };
}










function dentroDaJanela(disparoEm, agora) {
  if (!disparoEm) return false;
  const t = new Date(disparoEm).getTime();
  const ref = agora ? new Date(agora).getTime() : Date.now();
  if (!Number.isFinite(t) || !Number.isFinite(ref)) return false;
  const dias = (ref - t) / 86400000;
  return dias >= 0 && dias <= JANELA_DIAS;
}

module.exports = { decidirRoteamento, setorDoModulo, dentroDaJanela, normalizar, JANELA_DIAS };
