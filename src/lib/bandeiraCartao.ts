

















export type Bandeira =
  | 'elo' | 'hipercard' | 'visa' | 'mastercard' | 'amex'
  | 'diners' | 'discover' | 'jcb' | null;










const BINS_SANDBOX: Record<string, Exclude<Bandeira, null>> = {
  503143: 'mastercard',
  423564: 'visa',
  501105: 'elo',
};


const ELO_PREFIXOS = [
  '401178', '401179', '431274', '438935', '451416', '457393', '457631', '457632',
  '504175', '627780', '636297', '636368', '651652', '651653', '651654', '651655',
  '651656', '651657', '651658', '651659', '651770', '651771', '651772', '651773',
  '651774', '651775', '651776', '651777', '651778', '651779',
];


const ELO_FAIXAS: Array<[number, number]> = [
  [506699, 506778], [509000, 509999], [650031, 650033], [650035, 650051],
  [650405, 650439], [650485, 650538], [650541, 650598], [650700, 650718],
  [650720, 650727], [650901, 650978], [651652, 651679], [655000, 655019],
  [655021, 655058],
];

function noIntervalo(bin6: string, faixas: Array<[number, number]>) {
  if (bin6.length < 6) return false;
  const n = Number(bin6);
  return faixas.some(([ini, fim]) => n >= ini && n <= fim);
}





export function bandeiraDoBin(bin: string | null | undefined): Bandeira {
  const d = String(bin || '').replace(/\D/g, '');
  if (d.length < 4) return null;
  const b6 = d.slice(0, 6);


  if (d.length >= 6 && BINS_SANDBOX[b6]) return BINS_SANDBOX[b6];
  if (d.length >= 6 && ELO_PREFIXOS.includes(b6)) return 'elo';
  if (noIntervalo(b6, ELO_FAIXAS)) return 'elo';
  if (b6.startsWith('606282') || d.startsWith('3841')) return 'hipercard';


  if (/^4/.test(d)) return 'visa';
  if (/^5[1-5]/.test(d)) return 'mastercard';

  if (d.length >= 4) {
    const n4 = Number(d.slice(0, 4));
    if (n4 >= 2221 && n4 <= 2720) return 'mastercard';
  }
  if (/^3[47]/.test(d)) return 'amex';
  if (/^3(0[0-5]|[68])/.test(d)) return 'diners';
  if (/^(6011|65|64[4-9])/.test(d)) return 'discover';
  if (/^35(2[89]|[3-8]\d)/.test(d)) return 'jcb';





  return null;
}


export const NOME_BANDEIRA: Record<Exclude<Bandeira, null>, string> = {
  elo: 'Elo',
  hipercard: 'Hipercard',
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  diners: 'Diners Club',
  discover: 'Discover',
  jcb: 'JCB',
};





export function formatoDoCartao(bandeira: Bandeira): { grupos: number[]; total: number } {
  if (bandeira === 'amex') return { grupos: [4, 6, 5], total: 15 };
  if (bandeira === 'diners') return { grupos: [4, 6, 4], total: 14 };
  return { grupos: [4, 4, 4, 4], total: 16 };
}
