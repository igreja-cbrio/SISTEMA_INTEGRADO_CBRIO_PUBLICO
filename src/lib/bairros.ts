










export type BairroCatalogo = {
  norm: string;
  nome: string;
  pessoas: number;

  apelidos: string[];
};


export function normalizarBairro(valor: string | null | undefined): string {
  const t = String(valor ?? '').trim().toLowerCase();
  if (!t) return '';


  return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export type EstadoBairro =

  | { tipo: 'vazio' }

  | { tipo: 'conhecido'; bairro: BairroCatalogo }

  | { tipo: 'apelido'; bairro: BairroCatalogo; digitado: string }

  | { tipo: 'novo'; digitado: string };








export function avaliarBairro(texto: string, catalogo: BairroCatalogo[]): EstadoBairro {
  const digitado = String(texto ?? '').trim();
  const norm = normalizarBairro(digitado);
  if (!norm) return { tipo: 'vazio' };

  const exato = catalogo.find((b) => b.norm === norm);
  if (exato) return { tipo: 'conhecido', bairro: exato };

  const porApelido = catalogo.find((b) => b.apelidos?.includes(norm));
  if (porApelido) return { tipo: 'apelido', bairro: porApelido, digitado };

  return { tipo: 'novo', digitado };
}












export function sugerirBairros(
  texto: string,
  catalogo: BairroCatalogo[],
  limite = 8,
): BairroCatalogo[] {
  const q = normalizarBairro(texto);
  if (!q) return [...catalogo].sort((a, b) => b.pessoas - a.pessoas).slice(0, limite);

  const pontuar = (b: BairroCatalogo): number => {
    if (b.norm === q) return 0;
    if (b.norm.startsWith(q)) return 1;
    if (b.apelidos?.some((a) => a === q || a.startsWith(q))) return 2;
    if (b.norm.includes(q)) return 3;
    if (b.apelidos?.some((a) => a.includes(q))) return 4;
    return Infinity;
  };

  return catalogo
    .map((b) => ({ b, p: pontuar(b) }))
    .filter((x) => Number.isFinite(x.p))
    .sort((x, y) => (x.p - y.p) || (y.b.pessoas - x.b.pessoas) || x.b.nome.localeCompare(y.b.nome, 'pt-BR'))
    .slice(0, limite)
    .map((x) => x.b);
}
