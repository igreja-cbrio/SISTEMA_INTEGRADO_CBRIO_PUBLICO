






























const JANELA_DEBOUNCE_MS_PADRAO = 5000;





const JANELA_AGRUPAR_MS_PADRAO = 15000;








function tsMs(iso) {
  if (!iso) return null;
  const n = Date.parse(iso);
  return Number.isFinite(n) ? n : null;
}


function janelaValida(msPropostos, padrao) {
  const n = Number(msPropostos);
  if (!Number.isFinite(n) || n < 0) return padrao;
  return n;
}















function foiSuperada({ minhaId, minhaWamid, minhaCriadoEm, todasInbound }) {
  const meuMs = tsMs(minhaCriadoEm);
  if (meuMs === null) return false;
  const lista = Array.isArray(todasInbound) ? todasInbound : [];
  for (const m of lista) {
    if (!m) continue;

    const mesmoId = minhaId != null && m.id != null && m.id === minhaId;
    const mesmoWa = minhaWamid && m.whatsapp_message_id && m.whatsapp_message_id === minhaWamid;
    if (mesmoId || mesmoWa) continue;
    const outroMs = tsMs(m.criado_em);
    if (outroMs === null) continue;
    if (outroMs > meuMs) return true;
  }
  return false;
}




















function agruparMensagensDaRajada({ textoAtual, todasInbound, agoraMs, janelaMs }) {
  const janela = janelaValida(janelaMs, JANELA_AGRUPAR_MS_PADRAO);
  const inicio = Number(agoraMs) - janela;
  const dentro = (Array.isArray(todasInbound) ? todasInbound : [])
    .map(m => ({
      texto: String(m?.texto || '').trim(),
      ms: tsMs(m?.criado_em),
    }))
    .filter(x => x.texto && x.ms !== null && x.ms >= inicio && x.ms <= Number(agoraMs))
    .sort((a, b) => a.ms - b.ms);

  if (dentro.length === 0) {
    return {
      texto: String(textoAtual || '').trim(),
      contagem: 1,
      primeiraMs: agoraMs,
      ultimaMs: agoraMs,
    };
  }

  return {
    texto: dentro.map(x => x.texto).join('\n'),
    contagem: dentro.length,
    primeiraMs: dentro[0].ms,
    ultimaMs: dentro[dentro.length - 1].ms,
  };
}







function decidirDebounce({ minhaId, minhaWamid, minhaCriadoEm, textoAtual, todasInbound, agora, janelaAgruparMs }) {
  if (foiSuperada({ minhaId, minhaWamid, minhaCriadoEm, todasInbound })) {
    return { acao: 'coalesced', motivo: 'nao_sou_o_ultimo' };
  }
  const agoraMs = tsMs(agora) || Date.now();
  const g = agruparMensagensDaRajada({
    textoAtual,
    todasInbound,
    agoraMs,
    janelaMs: janelaAgruparMs,
  });
  return { acao: 'responder', texto: g.texto, contagem: g.contagem };
}

module.exports = {
  JANELA_DEBOUNCE_MS_PADRAO,
  JANELA_AGRUPAR_MS_PADRAO,
  janelaValida,
  foiSuperada,
  agruparMensagensDaRajada,
  decidirDebounce,
};
