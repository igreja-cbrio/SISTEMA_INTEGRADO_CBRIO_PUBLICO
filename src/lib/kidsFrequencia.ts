










export type FaixaCheckin = 'zero' | '1' | '2-5' | '6-10' | '11+';

export const FAIXAS_CHECKIN: { key: FaixaCheckin; rotulo: string }[] = [
  { key: 'zero', rotulo: 'Nenhum check-in' },
  { key: '1', rotulo: '1 check-in' },
  { key: '2-5', rotulo: '2 a 5 check-ins' },
  { key: '6-10', rotulo: '6 a 10 check-ins' },
  { key: '11+', rotulo: '11 ou mais' },
];








export function faixaCheckin(qtd: number | null | undefined): FaixaCheckin {
  const n = Number(qtd);
  if (!Number.isFinite(n) || n <= 0) return 'zero';
  if (n === 1) return '1';
  if (n <= 5) return '2-5';
  if (n <= 10) return '6-10';
  return '11+';
}


export function casaFaixaCheckin(qtd: number | null | undefined, faixaSel: string): boolean {
  if (!faixaSel || faixaSel === 'todas') return true;
  return faixaCheckin(qtd) === faixaSel;
}
