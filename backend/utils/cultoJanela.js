




























const DIAS_JANELA = 2;


function hojeBRT(agora = Date.now()) {
  return new Date(agora - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}


function diasDesde(dataCulto, hojeIso) {
  const a = Date.parse(`${dataCulto}T00:00:00Z`);
  const b = Date.parse(`${hojeIso}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}






function estadoJanelaCulto(dataCulto, hojeIso) {
  const dias = diasDesde(dataCulto, hojeIso);
  if (dias === null) return { estado: 'encerrado', dias: null };
  if (dias < 0) return { estado: 'antes', dias };
  return { estado: dias <= DIAS_JANELA ? 'aberto' : 'encerrado', dias };
}


function dataBR(iso) {
  const [y, m, d] = String(iso || '').split('-');
  return y && m && d ? `${d}/${m}/${y}` : '';
}

module.exports = { DIAS_JANELA, hojeBRT, diasDesde, estadoJanelaCulto, dataBR };
