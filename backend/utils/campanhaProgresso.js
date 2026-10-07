




































const cent = (v) => {
  const n = Math.round(Number(v) || 0);
  return Number.isFinite(n) ? n : 0;
};









function calcularProgresso({
  meta_centavos = 0,
  caixa_confirmado_centavos = 0,
  caixa_conciliando_centavos = 0,
  online_pago_centavos = 0,
} = {}) {
  const meta = cent(meta_centavos);
  const confirmado = cent(caixa_confirmado_centavos);
  const conciliando = cent(caixa_conciliando_centavos);
  const online = cent(online_pago_centavos);

  const total = confirmado + conciliando + online;
  const falta = Math.max(0, meta - total);





  const pct = meta > 0 ? (total / meta) * 100 : 0;

  return {
    meta_centavos: meta,
    caixa_confirmado_centavos: confirmado,
    caixa_conciliando_centavos: conciliando,
    online_pago_centavos: online,
    total_centavos: total,
    falta_centavos: falta,
    pct: Number(pct.toFixed(2)),
    pct_barra: Math.max(0, Math.min(100, Number(pct.toFixed(2)))),


    pct_conciliando: total > 0 ? Number(((conciliando / total) * 100).toFixed(2)) : 0,
    bateu_meta: meta > 0 && total >= meta,
  };
}










function domingosEntre(de, ate) {
  const a = parseIso(de);
  const b = parseIso(ate);





  if (a === null || b === null || b < a) return 0;


  const diaSemana = new Date(a).getUTCDay();
  const primeiro = a + ((7 - diaSemana) % 7) * 86400000;
  if (primeiro > b) return 0;
  return Math.floor((b - primeiro) / (7 * 86400000)) + 1;
}


















function ritmoNecessario({ total_centavos = 0, meta_centavos = 0, hoje, data_inicio, data_fim }) {
  const falta = Math.max(0, cent(meta_centavos) - cent(total_centavos));
  const vazio = {
    dias_restantes: null, por_dia_centavos: null,
    domingos_restantes: null, por_domingo_centavos: null,
    inicio_efetivo: null, parte_do_inicio: false, falta_centavos: falta,
  };
  if (!hoje || !data_fim) return vazio;


  const ini = parseIso(data_inicio);
  const h = parseIso(hoje);
  if (h === null) return vazio;
  const parteDoInicio = ini !== null && ini > h;
  const inicioEfetivo = parteDoInicio ? data_inicio : hoje;

  const dias = diasEntre(inicioEfetivo, data_fim);
  if (dias === null) return vazio;

  const domingos = domingosEntre(inicioEfetivo, data_fim);



  if (dias <= 0) {
    return {
      ...vazio, dias_restantes: 0, domingos_restantes: domingos,
      inicio_efetivo: inicioEfetivo, parte_do_inicio: parteDoInicio,


      por_domingo_centavos: domingos > 0 ? falta : null,
    };
  }

  return {
    dias_restantes: dias,
    por_dia_centavos: Math.ceil(falta / dias),
    domingos_restantes: domingos,


    por_domingo_centavos: domingos > 0 ? Math.ceil(falta / domingos) : null,
    inicio_efetivo: inicioEfetivo,


    parte_do_inicio: parteDoInicio,
    falta_centavos: falta,
  };
}


function diasEntre(de, ate) {
  const a = parseIso(de);
  const b = parseIso(ate);
  if (a === null || b === null) return null;
  return Math.round((b - a) / 86400000);
}


function parseIso(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? ''));
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}










function estaNoAr({ status, data_inicio, data_fim }, hoje) {
  if (status !== 'ativa') return false;
  const h = parseIso(hoje);
  if (h === null) return false;
  const ini = parseIso(data_inicio);
  const fim = parseIso(data_fim);
  if (ini !== null && h < ini) return false;
  if (fim !== null && h > fim) return false;
  return true;
}


function brl(centavos) {
  return (cent(centavos) / 100).toLocaleString('pt-BR', {
    style: 'currency', currency: 'BRL', minimumFractionDigits: 2,
  });
}








function brlRedondo(centavos) {
  const reais = Math.round(cent(centavos) / 100);
  if (reais >= 1000) {
    const mil = Math.round(reais / 1000);
    return `R$ ${mil.toLocaleString('pt-BR')} mil`;
  }
  return `R$ ${reais.toLocaleString('pt-BR')}`;
}

module.exports = {
  calcularProgresso,
  ritmoNecessario,
  domingosEntre,
  diasEntre,
  estaNoAr,
  brl,
  brlRedondo,
};
