











export type PontoBairro = {
  bairro: string;
  norm: string;
  total: number;
  lat: number;
  lng: number;
};




const dist2 = (a: PontoBairro, lat: number, lng: number) =>
  (a.lat - lat) ** 2 + (a.lng - lng) ** 2;




const mediana = (ordenada: number[]) => {
  const n = ordenada.length;
  if (n === 0) return 0;
  const meio = Math.floor(n / 2);
  return n % 2 ? ordenada[meio] : (ordenada[meio - 1] + ordenada[meio]) / 2;
};





























export function nucleoDoMapa<T extends PontoBairro>(bairros: T[], cobertura = 0.9) {
  if (bairros.length <= 1) return { nucleo: bairros, fora: [] as T[] };
  const total = bairros.reduce((s, b) => s + b.total, 0);








  if (total <= 0) return { nucleo: bairros, fora: [] as T[] };




  const centroLat = mediana(bairros.map((b) => b.lat).sort((a, b) => a - b));
  const centroLng = mediana(bairros.map((b) => b.lng).sort((a, b) => a - b));

  const porDistancia = [...bairros].sort(
    (a, b) => dist2(a, centroLat, centroLng) - dist2(b, centroLat, centroLng),
  );
  const nucleo: T[] = [];
  let acumulado = 0;
  for (const b of porDistancia) {
    nucleo.push(b);
    acumulado += b.total;
    if (acumulado / total >= cobertura) break;
  }

  const dentro = new Set(nucleo.map((b) => b.norm));
  return { nucleo, fora: bairros.filter((b) => !dentro.has(b.norm)) };
}
