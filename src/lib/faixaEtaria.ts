

















export type Faixa = 'crianca' | 'adolescente' | 'jovem' | 'adulto';

export const FAIXAS: Faixa[] = ['crianca', 'adolescente', 'jovem', 'adulto'];

export const FAIXA_LABEL: Record<Faixa, string> = {
  crianca: 'Criança (até 12)',
  adolescente: 'Adolescente (13–17)',
  jovem: 'Jovem (18–25)',
  adulto: 'Adulto (26+)',
};

export const FAIXA_LABEL_CURTO: Record<Faixa, string> = {
  crianca: 'Criança',
  adolescente: 'Adolescente',
  jovem: 'Jovem',
  adulto: 'Adulto',
};









export function idadeEmAnos(nascimento?: string | Date | null, agora?: Date): number | null {
  if (!nascimento) return null;
  const d = nascimento instanceof Date
    ? nascimento
    : new Date(`${String(nascimento).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;




  const hoje = agora instanceof Date && !Number.isNaN(agora.getTime()) ? agora : new Date();
  let anos = hoje.getFullYear() - d.getFullYear();
  const m = hoje.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < d.getDate())) anos -= 1;
  return anos < 0 || anos > 130 ? null : anos;
}


export function faixaPorIdade(idade?: number | null): Faixa | null {
  if (idade == null || !Number.isFinite(idade) || idade < 0) return null;
  if (idade < 13) return 'crianca';
  if (idade < 18) return 'adolescente';
  if (idade < 26) return 'jovem';
  return 'adulto';
}

export function faixaEtaria(nascimento?: string | Date | null, agora?: Date): Faixa | null {
  return faixaPorIdade(idadeEmAnos(nascimento, agora));
}

export function faixaLabel(nascimento?: string | Date | null, curto = false): string {
  const f = faixaEtaria(nascimento);
  if (!f) return 'Sem data de nascimento';
  return curto ? FAIXA_LABEL_CURTO[f] : FAIXA_LABEL[f];
}



export const SEXO_LABEL: Record<string, string> = {
  masculino: 'Masculino',
  feminino: 'Feminino',
};

export function sexoLabel(sexo?: string | null): string {
  if (!sexo) return 'Não informado';
  return SEXO_LABEL[sexo] || sexo;
}
