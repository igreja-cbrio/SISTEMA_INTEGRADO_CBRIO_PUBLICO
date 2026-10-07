







export function trocarVizinho(ids: string[], idx: number, direcao: 1 | -1): string[] | null {
  const alvo = idx + direcao;


  if (!Array.isArray(ids) || idx < 0 || idx >= ids.length) return null;
  if (alvo < 0 || alvo >= ids.length) return null;
  const out = [...ids];
  [out[idx], out[alvo]] = [out[alvo], out[idx]];
  return out;
}










export function aplicarNovaOrdem<T extends { id: string }>(lista: T[], idsNaOrdem: string[]): T[] {
  if (!Array.isArray(lista) || !Array.isArray(idsNaOrdem) || !idsNaOrdem.length) return lista;
  const doGrupo = new Set(idsNaOrdem);
  const porId = new Map(lista.filter((t) => t && doGrupo.has(t.id)).map((t) => [t.id, t]));


  const fila = idsNaOrdem.filter((id) => porId.has(id)).map((id) => porId.get(id) as T);
  let i = 0;
  return lista.map((t) => (t && doGrupo.has(t.id) ? fila[i++] : t));
}
