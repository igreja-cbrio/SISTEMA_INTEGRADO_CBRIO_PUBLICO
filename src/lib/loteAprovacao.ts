

















export const TETO_APLICAR_EM_LOTE = 25;

export type IdProposta = string | number;

export type PlanoLote = {


  vao: IdProposta[];

  adiados: number;

  truncado: boolean;

  avisa: boolean;
};







export function planejarLote(ids: readonly IdProposta[] | null | undefined, tipo: 'apply' | 'reject'): PlanoLote {
  const lista: IdProposta[] = Array.isArray(ids)
    ? ids.filter((x): x is IdProposta => typeof x === 'string' || typeof x === 'number')
    : [];
  if (tipo !== 'apply') {

    return { vao: [...lista], adiados: 0, truncado: false, avisa: false };
  }
  const vao = lista.slice(0, TETO_APLICAR_EM_LOTE);
  const adiados = Math.max(0, lista.length - vao.length);
  return { vao, adiados, truncado: adiados > 0, avisa: vao.length > 0 };
}






export function textoConfirmacao(plano: PlanoLote, tipo: 'apply' | 'reject'): string {
  const n = plano.vao.length;
  if (tipo === 'reject') {
    return n === 1
      ? 'Rejeitar 1 proposta? Ela sai da fila e ninguém é avisado.'
      : `Rejeitar ${n} propostas? Elas saem da fila e ninguém é avisado.`;
  }
  const base = n === 1
    ? 'Aprovar 1 proposta vai executar a ação dela e disparar 1 aviso interno'
    : `Aprovar ${n} propostas vai executar a ação de cada uma e disparar até ${n} avisos internos`;
  const cauda = plano.truncado
    ? ` As outras ${plano.adiados} ficam para o próximo lote (o teto é ${TETO_APLICAR_EM_LOTE} por vez).`
    : '';
  return `${base} para os responsáveis.${cauda}`;
}
