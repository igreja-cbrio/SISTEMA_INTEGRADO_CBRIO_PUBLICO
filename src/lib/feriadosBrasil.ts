








export type TipoFeriado = 'nacional' | 'movel';

export interface Feriado {
  data: string;
  nome: string;
  tipo: TipoFeriado;
}

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

function somarDias(dataIso: string, dias: number): string {
  const [y, m, d] = dataIso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}


export function domingoDePascoa(ano: number): string {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(ano, mes, dia);
}


export function feriadosNacionais(ano: number): Feriado[] {
  const pascoa = domingoDePascoa(ano);

  const fixos: Feriado[] = [
    { data: iso(ano, 1, 1), nome: 'Confraternização Universal', tipo: 'nacional' },
    { data: iso(ano, 4, 21), nome: 'Tiradentes', tipo: 'nacional' },
    { data: iso(ano, 5, 1), nome: 'Dia do Trabalho', tipo: 'nacional' },
    { data: iso(ano, 9, 7), nome: 'Independência do Brasil', tipo: 'nacional' },
    { data: iso(ano, 10, 12), nome: 'Nossa Senhora Aparecida', tipo: 'nacional' },
    { data: iso(ano, 11, 2), nome: 'Finados', tipo: 'nacional' },
    { data: iso(ano, 11, 15), nome: 'Proclamação da República', tipo: 'nacional' },

    { data: iso(ano, 11, 20), nome: 'Consciência Negra', tipo: 'nacional' },
    { data: iso(ano, 12, 25), nome: 'Natal', tipo: 'nacional' },
  ];

  const moveis: Feriado[] = [
    { data: somarDias(pascoa, -48), nome: 'Carnaval (segunda)', tipo: 'movel' },
    { data: somarDias(pascoa, -47), nome: 'Carnaval', tipo: 'movel' },
    { data: somarDias(pascoa, -46), nome: 'Quarta-feira de Cinzas', tipo: 'movel' },
    { data: somarDias(pascoa, -2), nome: 'Sexta-Feira Santa', tipo: 'movel' },
    { data: pascoa, nome: 'Páscoa', tipo: 'movel' },
    { data: somarDias(pascoa, 60), nome: 'Corpus Christi', tipo: 'movel' },
  ];

  return [...fixos, ...moveis].sort((a, b) => a.data.localeCompare(b.data));
}


export function feriadosPorData(ano: number): Record<string, Feriado[]> {
  const mapa: Record<string, Feriado[]> = {};
  for (const f of feriadosNacionais(ano)) {
    (mapa[f.data] = mapa[f.data] || []).push(f);
  }
  return mapa;
}
