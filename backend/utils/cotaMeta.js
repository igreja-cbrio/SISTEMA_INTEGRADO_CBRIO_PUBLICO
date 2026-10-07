






























const CAPACIDADE_24H = 250;








const RESERVA_OPERACIONAL = 50;


function naoNegativo(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}












function cotaDisponivel({
  unicos24h = null, capacidade = CAPACIDADE_24H, reserva = RESERVA_OPERACIONAL,
} = {}) {
  if (unicos24h === null || unicos24h === undefined) return 0;
  const cap = naoNegativo(capacidade);
  const res = naoNegativo(reserva);
  const usados = naoNegativo(unicos24h);
  return Math.max(0, cap - res - usados);
}









function tetoEfetivo({ tetoCanal = 0, unicos24h = null, capacidade, reserva } = {}) {
  const disp = cotaDisponivel({ unicos24h, capacidade, reserva });
  const canal = naoNegativo(tetoCanal);
  if (disp <= 0) {
    return {
      teto: 0,
      motivo: unicos24h === null || unicos24h === undefined
        ? 'nao_deu_pra_conferir_a_cota'
        : 'cota_24h_esgotada',
      cota_disponivel: disp,
      unicos_24h: naoNegativo(unicos24h),
    };
  }
  if (disp < canal) {
    return { teto: disp, motivo: 'limitado_pela_cota_24h', cota_disponivel: disp, unicos_24h: naoNegativo(unicos24h) };
  }
  return { teto: canal, motivo: 'teto_do_canal', cota_disponivel: disp, unicos_24h: naoNegativo(unicos24h) };
}

module.exports = { cotaDisponivel, tetoEfetivo, CAPACIDADE_24H, RESERVA_OPERACIONAL };
