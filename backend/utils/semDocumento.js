




















const CLASSES_SEM_DOCUMENTO = new Set(['transferencia']);

function anexosDe(t) {
  return Array.isArray(t && t.anexos_url) ? t.anexos_url : [];
}


function exigeDocumento(t) {
  if (!t || t.tipo !== 'despesa') return false;
  const classe = t.classe_movimento == null ? null : String(t.classe_movimento);
  return !CLASSES_SEM_DOCUMENTO.has(classe);
}


function faltaDocumento(t, idsComNf) {
  if (!exigeDocumento(t)) return false;
  if (anexosDe(t).length > 0) return false;
  return !(idsComNf && idsComNf.has(t.id));
}



function aplicarRecorteNoBanco(query) {
  return query
    .eq('tipo', 'despesa')
    .or('classe_movimento.is.null,classe_movimento.neq.transferencia');
}

module.exports = {
  CLASSES_SEM_DOCUMENTO,
  exigeDocumento,
  faltaDocumento,
  aplicarRecorteNoBanco,
};
