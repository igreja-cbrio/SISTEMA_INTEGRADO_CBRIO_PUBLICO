













export const DESC_MAX = 500;


export function disseSim(resposta) {
  return /^sim$/i.test(String(resposta == null ? '' : resposta).trim());
}





export function acessibilidadeBatismo(bruto = {}) {
  const b = bruto || {};
  const sim = disseSim(b.limitacao_mobilidade);
  const marcado = b.possui_deficiencia === true;
  const afirmou = sim || marcado;

  const escrito = afirmou
    ? String(b.deficiencia_descricao == null ? '' : b.deficiencia_descricao).trim()
    : '';




  if (!afirmou) return { possui: false, pedeDescricao: false, descricao: null };

  const descricao = escrito ? escrito.slice(0, DESC_MAX) : (sim ? 'Limitação de mobilidade' : null);
  return { possui: true, pedeDescricao: true, descricao };
}
