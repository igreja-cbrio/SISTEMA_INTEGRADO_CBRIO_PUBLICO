























const LIMIAR_INATIVO_DIAS = 90;



const JANELA_LISTA_DIAS = 120;


function diasDesde(iso, agora = Date.now()) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((agora - t) / 86400000);
}
















function nivelPorDias(dias, servicos4m = null) {
  const d = Number.isFinite(dias) ? dias : Infinity;
  if (d <= 30 && Number.isFinite(servicos4m) && servicos4m >= 4) {
    return { nivel: 'muito_ativo', label: 'Muito ativo' };
  }
  if (d <= 45) return { nivel: 'ativo', label: 'Ativo' };
  if (d <= LIMIAR_INATIVO_DIAS) return { nivel: 'pouco_ativo', label: 'Pouco ativo' };
  return { nivel: 'inativo', label: 'Inativo' };
}


function ehInativo(dias) {
  return nivelPorDias(dias).nivel === 'inativo';
}

module.exports = {
  nivelPorDias, ehInativo, diasDesde,
  LIMIAR_INATIVO_DIAS, JANELA_LISTA_DIAS,
};
