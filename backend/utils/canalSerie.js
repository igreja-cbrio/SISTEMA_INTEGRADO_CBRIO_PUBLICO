


























const PERIODOS = Object.freeze([7, 28, 90]);
const PERIODO_PADRAO = 28;







function normalizarPeriodo(bruto) {
  const n = Number(bruto);
  return PERIODOS.includes(n) ? n : PERIODO_PADRAO;
}



function hojeBRT(agora = Date.now()) {
  return new Date(agora - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}


function janelaDoPeriodo(dias, agora = Date.now()) {
  const d = normalizarPeriodo(dias);
  const fim = hojeBRT(agora);
  const inicio = new Date(Date.parse(`${fim}T12:00:00Z`) - (d - 1) * 86400000)
    .toISOString().slice(0, 10);
  return { dias: d, inicio, fim };
}









function montarSerie(linhas, janela) {
  const dentro = (Array.isArray(linhas) ? linhas : [])
    .map((l) => ({
      data: typeof l?.data === 'string' ? l.data.slice(0, 10) : null,
      views: Number.isFinite(Number(l?.views)) ? Number(l.views) : null,


      horas: Number.isFinite(Number(l?.watch_minutos))
        ? Math.round(Number(l.watch_minutos) / 60)
        : null,
    }))
    .filter((l) => l.data && l.data >= janela.inicio && l.data <= janela.fim)
    .sort((a, b) => (a.data < b.data ? -1 : 1));

  const comViews = dentro.filter((l) => l.views !== null);
  const totalViews = comViews.reduce((s, l) => s + l.views, 0);
  const comHoras = dentro.filter((l) => l.horas !== null);
  const totalHoras = comHoras.reduce((s, l) => s + l.horas, 0);

  return {
    pontos: dentro,


    total_views: comViews.length ? totalViews : null,
    total_horas: comHoras.length ? totalHoras : null,
    dias_com_dado: dentro.length,


    ultimo_dia: dentro.length ? dentro[dentro.length - 1].data : null,
  };
}


const FONTE_ROTULO = Object.freeze({
  SUBSCRIBER: 'Inscritos',
  YT_SEARCH: 'Busca no YouTube',
  YT_CHANNEL: 'Página do canal',
  RELATED_VIDEO: 'Vídeos sugeridos',
  EXT_URL: 'Links de fora',
  NOTIFICATION: 'Notificação',
  PLAYLIST: 'Playlist',
  SHORTS: 'Shorts',
  YT_OTHER_PAGE: 'Outras páginas do YT',
  NO_LINK_OTHER: 'Direto / sem origem',
  NO_LINK_EMBEDDED: 'Player incorporado',
  IMMERSIVE_LIVE: 'Ao vivo em destaque',
  END_SCREEN: 'Tela final',
  ANNOTATION: 'Card do vídeo',
  HASHTAGS: 'Hashtag',
  SOUND_PAGE: 'Página de som',
  CAMPAIGN_CARD: 'Campanha',
  ADVERTISING: 'Anúncio',
  PROMOTED: 'Promovido',
});













function agregarTrafego(linhas, { topo = 6 } = {}) {
  const porFonte = new Map();
  for (const l of Array.isArray(linhas) ? linhas : []) {
    const fonte = typeof l?.fonte === 'string' ? l.fonte.trim() : '';
    const views = Number(l?.views);
    if (!fonte || !Number.isFinite(views) || views <= 0) continue;
    porFonte.set(fonte, (porFonte.get(fonte) || 0) + views);
  }

  const total = [...porFonte.values()].reduce((s, v) => s + v, 0);
  if (!total) return { itens: [], total: null, videos: 0 };

  const ordenado = [...porFonte.entries()]
    .map(([fonte, views]) => ({
      fonte,
      rotulo: FONTE_ROTULO[fonte] || fonte,
      views,
      pct: Number(((views / total) * 100).toFixed(1)),
    }))
    .sort((a, b) => b.views - a.views);

  const itens = ordenado.slice(0, topo);
  const resto = ordenado.slice(topo);
  if (resto.length) {


    const views = resto.reduce((s, r) => s + r.views, 0);
    itens.push({
      fonte: '_outras',
      rotulo: `Outras (${resto.length})`,
      views,
      pct: Number(((views / total) * 100).toFixed(1)),
    });
  }

  const videos = new Set(
    (Array.isArray(linhas) ? linhas : [])
      .map((l) => l?.video_id)
      .filter(Boolean),
  ).size;

  return { itens, total, videos };
}

module.exports = {
  PERIODOS,
  PERIODO_PADRAO,
  normalizarPeriodo,
  hojeBRT,
  janelaDoPeriodo,
  montarSerie,
  agregarTrafego,
  FONTE_ROTULO,
};
