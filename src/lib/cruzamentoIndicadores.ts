











export type SerieMensal = { mes: number; [ano: string]: number | null | string | undefined };

export type Ponto = {
  ano: number;
  mes: number;
  label: string;
  valores: Record<string, number | null>;

  parcial: boolean;
};

export const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function variacaoPct(atual: number | null, anterior: number | null): number | null {
  if (atual == null || anterior == null || anterior === 0) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}


export function montarLinhaDoTempo(
  seriesPorIndicador: Record<string, SerieMensal[] | undefined>,
  anos: number[],
  mesCorrente?: { ano: number; mes: number },
): Ponto[] {
  const chaves = Object.keys(seriesPorIndicador);
  const anosOrd = [...anos].sort((a, b) => a - b);
  const mesesSet = new Set<number>();
  for (const k of chaves) for (const r of seriesPorIndicador[k] || []) mesesSet.add(Number(r.mes));
  const meses = [...mesesSet].sort((a, b) => a - b);

  const pontos: Ponto[] = [];
  for (const ano of anosOrd) {
    for (const mes of meses) {
      const valores: Record<string, number | null> = {};
      let algum = false;
      for (const k of chaves) {
        const linha = (seriesPorIndicador[k] || []).find(r => Number(r.mes) === mes);
        const v = linha ? num(linha[String(ano)]) : null;
        valores[k] = v;
        if (v != null) algum = true;
      }
      if (!algum) continue;
      pontos.push({
        ano,
        mes,
        label: anosOrd.length > 1 ? `${MESES_CURTOS[mes - 1]}/${String(ano).slice(2)}` : MESES_CURTOS[mes - 1],
        valores,
        parcial: !!mesCorrente && mesCorrente.ano === ano && mesCorrente.mes === mes,
      });
    }
  }
  return pontos;
}

function valorEm(pontos: Ponto[], ano: number, mes: number, k: string): number | null {
  const p = pontos.find(x => x.ano === ano && x.mes === mes);
  return p ? p.valores[k] ?? null : null;
}


export function variacoes(pontos: Ponto[], k: string) {
  return pontos.map(p => {
    const mesAnt = p.mes === 1 ? 12 : p.mes - 1;
    const anoAnt = p.mes === 1 ? p.ano - 1 : p.ano;
    const v = p.valores[k] ?? null;
    return {
      mom: variacaoPct(v, valorEm(pontos, anoAnt, mesAnt, k)),
      yoy: variacaoPct(v, valorEm(pontos, p.ano - 1, p.mes, k)),
    };
  });
}


export function indiceBase100(pontos: Ponto[], k: string): (number | null)[] {
  const base = pontos.map(p => p.valores[k]).find(v => v != null && v !== 0);
  return pontos.map(p => {
    const v = p.valores[k];
    if (v == null || base == null) return null;
    return Math.round((v / base) * 1000) / 10;
  });
}


export function razaoPor100(pontos: Ponto[], k: string, base: string): (number | null)[] {
  return pontos.map(p => {
    const a = p.valores[k];
    const b = p.valores[base];
    if (a == null || b == null || b === 0) return null;
    return Math.round((a / b) * 10000) / 100;
  });
}


export function correlacao(pontos: Ponto[], a: string, b: string): { r: number | null; n: number } {
  const pares = pontos
    .filter(p => !p.parcial)
    .map(p => [p.valores[a], p.valores[b]] as const)
    .filter((x): x is readonly [number, number] => x[0] != null && x[1] != null);
  const n = pares.length;
  if (n < 3) return { r: null, n };
  const mx = pares.reduce((s, x) => s + x[0], 0) / n;
  const my = pares.reduce((s, x) => s + x[1], 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of pares) {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return { r: null, n };
  return { r: sxy / Math.sqrt(sxx * syy), n };
}

export function rotuloCorrelacao(r: number | null): string {
  if (r == null) return 'sem base';
  const a = Math.abs(r);
  const forca = a >= 0.7 ? 'forte' : a >= 0.4 ? 'moderada' : a >= 0.2 ? 'fraca' : 'nenhuma';
  if (forca === 'nenhuma') return 'sem relação';
  return `${forca} ${r > 0 ? 'positiva' : 'negativa'}`;
}


export function variacaoPeriodo(pontos: Ponto[], k: string) {
  const todos = pontos.filter(p => p.valores[k] != null);
  const com = todos.filter(p => !p.parcial);
  if (!com.length) {
    return { inicio: null, fim: null, deltaPct: null, total: todos.reduce((s, p) => s + (p.valores[k] as number), 0), de: null, ate: null };
  }
  const ini = com[0];
  const fim = com[com.length - 1];
  return {
    inicio: ini.valores[k] as number,
    fim: fim.valores[k] as number,
    deltaPct: com.length > 1 ? variacaoPct(fim.valores[k], ini.valores[k]) : null,
    total: todos.reduce((s, p) => s + (p.valores[k] as number), 0),
    de: ini.label,
    ate: fim.label,
  };
}


export const MIN_MESES_RELACAO = 6;





export function fraseRelacao(r: number | null, n: number, a: string, b: string): { nivel: 'poucos' | 'nenhuma' | 'fraca' | 'moderada' | 'forte'; texto: string } {
  if (r == null || n < MIN_MESES_RELACAO) {
    return { nivel: 'poucos', texto: `Ainda há poucos meses com ${a} e ${b} juntos (${n}) para dizer se andam juntos.` };
  }
  const forca = Math.abs(r) >= 0.7 ? 'forte' : Math.abs(r) >= 0.4 ? 'moderada' : Math.abs(r) >= 0.2 ? 'fraca' : 'nenhuma';
  if (forca === 'nenhuma') {
    return { nivel: 'nenhuma', texto: `${a} e ${b} não mostram relação: um subir não diz nada sobre o outro (${n} meses).` };
  }
  const sentido = r > 0 ? `${b} costuma subir junto` : `${b} costuma cair`;
  return { nivel: forca, texto: `Nos meses em que ${a} sobe, ${sentido} — relação ${forca} (${n} meses).` };
}
