





















import { idadeEmAnos, faixaPorIdade, type Faixa } from './faixaEtaria';

export type CategoriaEtaria = Faixa;

export const CATEGORIAS: CategoriaEtaria[] = ['crianca', 'adolescente', 'jovem', 'adulto'];

export const CATEGORIA_LABEL: Record<CategoriaEtaria, string> = {
  crianca: 'Criança',
  adolescente: 'Adolescente',
  jovem: 'Jovem',
  adulto: 'Adulto',
};


export const CATEGORIA_LABEL_FAIXA: Record<CategoriaEtaria, string> = {
  crianca: 'Criança (até 12)',
  adolescente: 'Adolescente (13–17)',
  jovem: 'Jovem (18–25)',
  adulto: 'Adulto (26+)',
};

export const CATEGORIA_COR: Record<CategoriaEtaria, string> = {
  crianca: '#ec4899',
  adolescente: '#a855f7',
  jovem: '#f59e0b',
  adulto: '#0ea5e9',
};


export const categoriaPorIdade = faixaPorIdade;

type Batizando = {
  data_nascimento?: string | null;
  eh_crianca?: boolean | null;
  categoria_etaria?: CategoriaEtaria | string | null;
};













export function categoriaBatismo(b: Batizando | null | undefined, agora?: Date): CategoriaEtaria | null {
  if (!b) return null;
  if (b.eh_crianca === true) return 'crianca';

  const porData = categoriaPorIdade(idadeEmAnos(b.data_nascimento, agora));
  if (porData) return porData;

  const salva = String(b.categoria_etaria || '') as CategoriaEtaria;
  return CATEGORIAS.includes(salva) ? salva : null;
}
