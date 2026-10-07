





























export type PontoCurva = { ratio_pct: number; audience_watch_ratio: number };

export type CurvaLida = {
  pontos: { x: number; y: number }[];

  max: number;

  emMinutos: boolean;

  media: number;
  pico: number;
  picoX: number;

  fim: number;

  inicioCulto: number | null;

  abertura: string | null;
  fmtEixo: (v: number) => string;
  fmtRotulo: (v: number) => string;
};

const VAZIA: CurvaLida = {
  pontos: [], max: 100, emMinutos: false, media: 0, pico: 0, picoX: 0, fim: 0,
  inicioCulto: null, abertura: null,
  fmtEixo: (v) => `${v}%`, fmtRotulo: (v) => `${v}% do vídeo`,
};










export function acharAbertura(pontos: PontoCurva[]): number | null {
  if (pontos.length < 6) return null;
  const limite = Math.floor(pontos.length / 3);
  let iVale = 0;
  for (let i = 1; i <= limite; i++) {
    if (pontos[i].audience_watch_ratio < pontos[iVale].audience_watch_ratio) iVale = i;
  }
  const vale = pontos[iVale].audience_watch_ratio;
  if (iVale === 0 || vale <= 0) return null;
  let depois = 0;
  for (let i = iVale + 1; i < pontos.length; i++) {
    if (pontos[i].audience_watch_ratio > depois) depois = pontos[i].audience_watch_ratio;
  }
  return depois >= vale * 2 ? iVale : null;
}

export function lerCurva(
  curva: PontoCurva[] | null | undefined,
  duracaoMinutos?: number | null,
): CurvaLida {
  if (!Array.isArray(curva) || curva.length === 0) return VAZIA;
  const pts = [...curva]
    .filter((p) => Number.isFinite(p?.ratio_pct) && Number.isFinite(p?.audience_watch_ratio))
    .sort((a, b) => a.ratio_pct - b.ratio_pct);
  if (pts.length === 0) return VAZIA;

  const emMinutos = Number.isFinite(duracaoMinutos as number) && (duracaoMinutos as number) > 0;
  const dur = emMinutos ? (duracaoMinutos as number) : 100;
  const emX = (pct: number) => (emMinutos ? (pct / 100) * dur : pct);

  const pontos = pts.map((p) => ({ x: emX(p.ratio_pct), y: p.audience_watch_ratio }));

  const iAbertura = acharAbertura(pts);
  const inicioCulto = iAbertura != null ? emX(pts[iAbertura].ratio_pct) : null;



  const doCulto = iAbertura != null ? pts.slice(iAbertura) : pts;
  const media = doCulto.reduce((s, p) => s + p.audience_watch_ratio, 0) / doCulto.length;

  let iPico = 0;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].audience_watch_ratio > pts[iPico].audience_watch_ratio) iPico = i;
  }

  const fmtMin = (v: number) => {
    const m = Math.round(v);
    return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m} min`;
  };
  const fmtEixo = emMinutos ? fmtMin : (v: number) => `${Math.round(v)}%`;
  const fmtRotulo = emMinutos
    ? (v: number) => `${fmtMin(v)} de transmissão`
    : (v: number) => `${Math.round(v)}% do vídeo`;

  return {
    pontos,
    max: emMinutos ? dur : 100,
    emMinutos,
    media,
    pico: pts[iPico].audience_watch_ratio,
    picoX: emX(pts[iPico].ratio_pct),
    fim: pts[pts.length - 1].audience_watch_ratio,
    inicioCulto,
    abertura: inicioCulto != null
      ? (emMinutos ? `os ${Math.round(inicioCulto)} primeiros min` : `os primeiros ${Math.round(inicioCulto)}%`)
      : null,
    fmtEixo,
    fmtRotulo,
  };
}
