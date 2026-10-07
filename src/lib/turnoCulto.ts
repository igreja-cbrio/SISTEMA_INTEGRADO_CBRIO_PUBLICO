










export const LIMITE_MANHA = '12:00';

export type ItemCulto = {
  nome: string;
  service_type_id?: string | null;
  valor_absoluto?: number | null;
  media?: number | null;
  taxa_ocupacao?: number | null;
  recurrence_day?: number | null;
  recurrence_time?: string | null;
};


export function turnoDoCulto(item: ItemCulto): 'manha' | 'noite' | null {
  if (Number(item?.recurrence_day) !== 0) return null;
  const h = String(item?.recurrence_time || '').slice(0, 5);


  if (!/^\d{2}:\d{2}$/.test(h)) return null;
  return h < LIMITE_MANHA ? 'manha' : 'noite';
}

const ROTULO = { manha: 'Dom manhã', noite: 'Dom noite' } as const;










export function agruparPorTurno(items: ItemCulto[]): (ItemCulto & { cultos?: number })[] {
  const grupos = new Map<string, ItemCulto[]>();
  const out: (ItemCulto & { cultos?: number })[] = [];

  for (const i of items || []) {
    const t = turnoDoCulto(i);
    if (!t) { out.push({ ...i, cultos: 1 }); continue; }
    if (!grupos.has(t)) grupos.set(t, []);
    (grupos.get(t) as ItemCulto[]).push(i);
  }

  for (const t of ['manha', 'noite'] as const) {
    const membros = grupos.get(t);
    if (!membros || !membros.length) continue;
    const soma = (f: keyof ItemCulto) =>
      membros.reduce((a, m) => a + (Number(m[f]) || 0), 0);
    const comTaxa = membros.filter((m) => m.taxa_ocupacao != null);
    out.push({
      nome: ROTULO[t],



      service_type_id: null,
      valor_absoluto: soma('valor_absoluto'),
      media: soma('media'),
      taxa_ocupacao: comTaxa.length
        ? Math.round((comTaxa.reduce((a, m) => a + Number(m.taxa_ocupacao), 0) / comTaxa.length) * 10) / 10
        : null,
      recurrence_day: 0,

      recurrence_time: membros
        .map((m) => String(m.recurrence_time || '99:99').slice(0, 5))
        .sort()[0],
      cultos: membros.length,
    });
  }

  return out;
}
