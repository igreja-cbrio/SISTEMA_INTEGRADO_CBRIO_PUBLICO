





















export const TIPOS_FILTRAVEIS = new Set(['select', 'escolha', 'multi']);


export const SEM_RESPOSTA = '__sem_resposta__';


export const TODOS = '';

export type OpcaoFiltro = {

  valor: string;

  rotulo: string;
  total: number;

  foraDoCatalogo: boolean;
};

export type CampoFiltravel = {
  key: string;
  label: string;
  multiplo: boolean;
  opcoes: OpcaoFiltro[];
  semResposta: number;
};






function rotuloDe(valor: string): string {
  return String(valor).replace(/\s+/g, ' ').trim();
}





export function valoresDaResposta(dados: any, key: string): string[] {
  const v = dados?.[key];
  if (v == null) return [];
  const lista = Array.isArray(v) ? v : [v];
  return lista
    .filter(x => x != null && typeof x !== 'object')
    .map(x => String(x))
    .filter(x => x.trim() !== '');
}










export function camposFiltraveis(campos: any[], inscritos: any[]): CampoFiltravel[] {
  const defs = (campos || []).filter(c => c && c.key && TIPOS_FILTRAVEIS.has(String(c.tipo)));
  if (!defs.length) return [];

  return defs.map(c => {
    const key = String(c.key);
    const contagem = new Map<string, number>();
    let semResposta = 0;

    for (const i of inscritos || []) {
      const vals = valoresDaResposta(i?.dados, key);
      if (!vals.length) { semResposta++; continue; }

      for (const v of new Set(vals)) contagem.set(v, (contagem.get(v) || 0) + 1);
    }

    const doCatalogo = (c.opcoes || [])
      .filter((o: any) => o != null && String(o).trim() !== '')
      .map((o: any) => String(o));
    const vistos = new Set(doCatalogo);

    const opcoes: OpcaoFiltro[] = doCatalogo.map(valor => ({
      valor,
      rotulo: rotuloDe(valor),
      total: contagem.get(valor) || 0,
      foraDoCatalogo: false,
    }));


    for (const [valor, total] of contagem) {
      if (vistos.has(valor)) continue;
      opcoes.push({ valor, rotulo: rotuloDe(valor), total, foraDoCatalogo: true });
    }

    return {
      key,
      label: String(c.label || key),
      multiplo: String(c.tipo) === 'multi',
      opcoes,
      semResposta,
    };
  }).filter(c => c.opcoes.length > 0 || c.semResposta > 0);
}






export function aplicarFiltroCampos<T extends { dados?: any }>(
  inscritos: T[],
  filtros: Record<string, string>,
): T[] {
  const ativos = Object.entries(filtros || {}).filter(([, v]) => v != null && v !== TODOS);
  if (!ativos.length) return inscritos || [];

  return (inscritos || []).filter(i =>
    ativos.every(([key, alvo]) => {
      const vals = valoresDaResposta(i?.dados, key);
      if (alvo === SEM_RESPOSTA) return vals.length === 0;
      return vals.includes(alvo);
    }),
  );
}


export function contarFiltrosAtivos(filtros: Record<string, string>): number {
  return Object.values(filtros || {}).filter(v => v != null && v !== TODOS).length;
}
