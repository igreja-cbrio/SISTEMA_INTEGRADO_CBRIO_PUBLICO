














export type ChaveMarcador =
  | 'batismo' | 'next' | 'grupo' | 'servir' | 'devocional' | 'generosidade';

export interface MarcadorUI {

  curto: string;

  label: string;

  ajuda: string;
  cor: string;
  fundo: string;
}

export const MARCADOR_UI: Record<ChaveMarcador, MarcadorUI> = {
  batismo: {
    curto: 'BAT', label: 'Batizado',
    ajuda: 'O sistema tem registro de batismo realizado.',
    cor: '#0369a1', fundo: '#e0f2fe',
  },
  next: {
    curto: 'NEXT', label: 'Fez o Next',
    ajuda: 'Concluiu o Next (aula 1 e aula 2, em qualquer turma).',
    cor: '#065f46', fundo: '#d1fae5',
  },
  grupo: {
    curto: 'GRUPO', label: 'Em grupo de conexão',
    ajuda: 'Tem vínculo ativo em algum grupo de conexão.',
    cor: '#1e3a8a', fundo: '#dbeafe',
  },
  servir: {
    curto: 'SERVE', label: 'Serve como voluntário',
    ajuda: 'Tem vínculo de voluntariado em aberto.',
    cor: '#6b21a8', fundo: '#ede9fe',
  },
  devocional: {
    curto: 'DEVO', label: 'Devocional em dia',
    ajuda: 'Registrou devocional concluído nos últimos 90 dias.',
    cor: '#92400e', fundo: '#fef3c7',
  },
  generosidade: {
    curto: 'CONTRIB', label: 'Contribui',
    ajuda: 'Registrou dízimo ou oferta nos últimos 90 dias.',
    cor: '#831843', fundo: '#fce7f3',
  },
};


export interface Marcadores {
  chaves: ChaveMarcador[];
  detalhes?: Partial<Record<ChaveMarcador, string>>;
  sensiveis_ocultos?: boolean;

  indisponiveis?: string[];
}

export const ORDEM_MARCADORES: ChaveMarcador[] =
  ['batismo', 'next', 'grupo', 'servir', 'devocional', 'generosidade'];







export const TEXTO_SEM_MARCADOR = 'Sem marcador registrado';

export const TEXTO_AJUDA_GERAL =
  'Marcadores mostram o que o sistema tem REGISTRO de. Não ter um marcador não '
  + 'significa que a pessoa não passou por aquela etapa — pode ser só falta de registro.';
