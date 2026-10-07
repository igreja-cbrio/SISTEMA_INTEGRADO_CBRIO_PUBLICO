







const CAMPOS_FUSAO_PERMITIDOS = ['nome', 'telefone', 'email', 'cpf', 'data_nascimento', 'genero'];

function montarPatchFusao(campos) {
  const patch = {};
  if (!campos || typeof campos !== 'object') return patch;
  for (const k of CAMPOS_FUSAO_PERMITIDOS) {
    if (!(k in campos)) continue;
    let v = campos[k];
    if (v === null || v === undefined) continue;
    v = String(v).trim();
    if (!v) continue;
    if (k === 'cpf' || k === 'telefone') v = v.replace(/\D/g, '');
    else if (k === 'email') v = v.toLowerCase();
    patch[k] = v;
  }
  return patch;
}

module.exports = { CAMPOS_FUSAO_PERMITIDOS, montarPatchFusao };
