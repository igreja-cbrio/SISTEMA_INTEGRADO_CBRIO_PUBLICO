






















const PIN_RAIO_M = 45;
const PIN_POR_ANEL = 6;

export interface PinoEspalhavel {
  id: string;
  lat?: number | null;
  lng?: number | null;

  pinoAproximado?: boolean;
}


function faseDaChave(chave: string): number {
  let h = 0;
  for (let i = 0; i < chave.length; i++) h = (h * 31 + chave.charCodeAt(i)) | 0;
  return ((((h % 360) + 360) % 360) * Math.PI) / 180;
}

export function espalharPinosSobrepostos<T extends PinoEspalhavel>(gs: T[]): T[] {
  const porPonto = new Map<string, T[]>();
  for (const g of gs) {

    const chave = `${Number(g.lat).toFixed(5)},${Number(g.lng).toFixed(5)}`;
    const lista = porPonto.get(chave);
    if (lista) lista.push(g);
    else porPonto.set(chave, [g]);
  }

  const saida: T[] = [];
  for (const [chave, lista] of porPonto) {
    if (lista.length === 1) {
      saida.push(lista[0]);
      continue;
    }
    const fase = faseDaChave(chave);
    const ordenados = [...lista].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    ordenados.forEach((g, i) => {
      const anel = Math.floor(i / PIN_POR_ANEL) + 1;
      const nesteAnel = Math.min(PIN_POR_ANEL, ordenados.length - (anel - 1) * PIN_POR_ANEL);
      const idxNoAnel = i % PIN_POR_ANEL;
      const ang = fase + (anel - 1) * 0.5 + (2 * Math.PI * idxNoAnel) / Math.max(nesteAnel, 1);
      const raio = PIN_RAIO_M * anel;
      const lat = Number(g.lat);
      const dLat = (raio * Math.sin(ang)) / 111320;


      const dLng = (raio * Math.cos(ang)) / (111320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.1));
      saida.push({ ...g, lat: lat + dLat, lng: Number(g.lng) + dLng, pinoAproximado: true });
    });
  }
  return saida;
}
