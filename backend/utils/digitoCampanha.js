

















































function extrairDigito(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(valor);
  if (!Number.isFinite(n)) return null;
  const centavos = Math.round(Math.abs(n) * 100) % 100;
  return String(centavos).padStart(2, '0');
}








function digitoValido(digito) {
  const d = String(digito ?? '').trim();
  return /^[0-9]{2}$/.test(d) && d !== '00';
}


function normalizarDigito(digito) {
  if (digito === null || digito === undefined) return null;
  const cru = String(digito).trim();
  if (!/^[0-9]{1,2}$/.test(cru)) return null;
  const d = cru.padStart(2, '0');
  return digitoValido(d) ? d : null;
}









function ehCredito(lancamento) {
  if (!lancamento) return false;
  if (lancamento.tipo_trn === 'CREDIT') return true;
  if (lancamento.tipo_trn === 'DEBIT') return false;
  return Number(lancamento.valor) > 0;
}











function digitoDoLancamento(lancamento, ativos) {
  if (!ehCredito(lancamento)) return null;
  const digito = extrairDigito(lancamento.valor);
  if (!digitoValido(digito)) return null;

  const lista = (Array.isArray(ativos) ? ativos : [])
    .map((a) => (typeof a === 'string' || typeof a === 'number'
      ? normalizarDigito(a)
      : normalizarDigito(a?.digito ?? a?.centavo)))
    .filter(Boolean);

  return lista.includes(digito) ? digito : null;
}















function checarDigitoLivre(digito, ocupados, { ignorar = null } = {}) {
  const d = normalizarDigito(digito);
  if (!d) {
    return {
      ok: false,
      motivo: 'O dígito precisa ser dois números de 01 a 99. O 00 não pode: '
        + 'ele é o centavo de quem não declarou nada.',
      conflito: null,
    };
  }
  const conflito = (Array.isArray(ocupados) ? ocupados : []).find((o) => {
    const dono = o?.dono ?? o?.id ?? null;
    if (ignorar !== null && dono !== null && String(dono) === String(ignorar)) return false;
    return normalizarDigito(o?.digito ?? o?.centavo) === d;
  });
  if (conflito) {
    return {
      ok: false,
      motivo: `O dígito ${d} já é de "${conflito.descricao || conflito.nome || 'outro destino'}". `
        + 'Dois destinos com o mesmo dígito fazem o extrato virar irrecuperável: '
        + 'o banco não guarda nada que permita desempatar depois.',
      conflito,
    };
  }
  return { ok: true, motivo: null, conflito: null };
}









function sugerirDigito(ocupados) {
  for (let i = 1; i <= 99; i += 1) {
    const d = String(i).padStart(2, '0');
    if (checarDigitoLivre(d, ocupados).ok) return d;
  }
  return null;
}













function valorComDigito(valorCentavos, digito) {
  const d = normalizarDigito(digito);
  const bruto = Math.round(Number(valorCentavos) || 0);
  if (!d || bruto <= 0) return bruto;
  const reaisInteiros = Math.floor(bruto / 100);
  const alvo = reaisInteiros * 100 + Number(d);


  return alvo > 0 ? alvo : Number(d);
}



























const CARENCIA_CREDITO_DIAS = 3;


function isoParaEpoch(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? ''));
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}










function fimJanelaCredito(dataFim) {
  const t = isoParaEpoch(dataFim);
  if (t === null) return null;
  return new Date(t + CARENCIA_CREDITO_DIAS * 86400000).toISOString().slice(0, 10);
}








function creditoNaJanela(dia, { data_inicio, data_fim } = {}) {
  const d = String(dia ?? '').slice(0, 10);
  const valido = isoParaEpoch(d) !== null;
  const ini = isoParaEpoch(data_inicio) !== null ? String(data_inicio).slice(0, 10) : null;
  const fim = fimJanelaCredito(data_fim);



  if (ini && (!valido || d < ini)) return false;
  if (fim && (!valido || d > fim)) return false;
  return true;
}























function montarExtratoCaixa({ camp, transacoes = [], brutos = [], brutosComTransacao = new Set(), vinculos = [] }) {
  const digito = normalizarDigito(camp?.digito);
  const janela = { data_inicio: camp?.data_inicio, data_fim: camp?.data_fim };

  const vetoT = new Set(); const vetoB = new Set();
  const inclT = new Set(); const inclB = new Set();
  for (const v of vinculos || []) {
    if (v.incluir === false) {
      if (v.transacao_id) vetoT.add(v.transacao_id);
      if (v.lancamento_bruto_id) vetoB.add(v.lancamento_bruto_id);
    } else if (v.incluir === true) {
      if (v.transacao_id) inclT.add(v.transacao_id);
      if (v.lancamento_bruto_id) inclB.add(v.lancamento_bruto_id);
    }
  }

  const receitas = (transacoes || []).filter((t) => t && t.tipo === 'receita');
  const vistasT = new Set();
  const confirmadas = [];
  let lancadoAte = null;
  for (const t of receitas) {
    if (vistasT.has(t.id)) continue;
    vistasT.add(t.id);
    const centavoBate = !!digito && extrairDigito(t.valor) === digito;
    const naJanela = creditoNaJanela(t.data_competencia, janela);

    if (centavoBate && naJanela) {
      const d = String(t.data_competencia).slice(0, 10);
      if (!lancadoAte || d > lancadoAte) lancadoAte = d;
    }
    const porDigito = !!digito
      && (String(t.identificador_centavo ?? '').trim() === digito || centavoBate)
      && naJanela
      && !vetoT.has(t.id);
    if (porDigito || inclT.has(t.id)) confirmadas.push(t);
  }

  const vistasB = new Set();
  const conciliando = [];
  for (const b of brutos || []) {
    if (!b || vistasB.has(b.id)) continue;
    vistasB.add(b.id);
    if (!ehCredito(b)) continue;
    if (brutosComTransacao.has(b.id)) continue;
    const d = String(b.data_lancamento ?? '').slice(0, 10);
    const porDigito = !!digito
      && extrairDigito(b.valor) === digito
      && creditoNaJanela(d, janela)

      && (lancadoAte === null || d > lancadoAte)
      && !vetoB.has(b.id);
    if (porDigito || inclB.has(b.id)) conciliando.push(b);
  }

  return { confirmadas, conciliando, lancado_ate: lancadoAte };
}

module.exports = {
  extrairDigito,
  digitoValido,
  normalizarDigito,
  ehCredito,
  digitoDoLancamento,
  checarDigitoLivre,
  sugerirDigito,
  valorComDigito,
  CARENCIA_CREDITO_DIAS,
  fimJanelaCredito,
  creditoNaJanela,
  montarExtratoCaixa,
};
