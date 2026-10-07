
























const MARCA_PUBLICA = '/storage/v1/object/public/';












function caminhoNoBucket(valor, bucket) {
  const s = String(valor || '').trim();
  if (!s || !bucket) return null;


  if (!/^https?:\/\//i.test(s) && !s.includes(MARCA_PUBLICA)) {
    return caminhoSeguro(s);
  }

  const marca = `${MARCA_PUBLICA}${bucket}/`;
  const i = s.indexOf(marca);
  if (i === -1) return null;


  const bruto = s.slice(i + marca.length).split('?')[0].split('#')[0];
  let decodificado;
  try {
    decodificado = decodeURIComponent(bruto);
  } catch {
    return null;
  }
  return caminhoSeguro(decodificado);
}
















function caminhoDeUrlPublica(valor, bucket) {
  const s = String(valor || '').trim();
  if (!s || !bucket) return null;
  if (!s.includes(MARCA_PUBLICA)) return null;
  return caminhoNoBucket(s, bucket);
}






function caminhoSeguro(p) {
  const s = String(p || '').trim();
  if (!s) return null;
  if (s.startsWith('/')) return null;
  if (s.split('/').some((parte) => parte === '..')) return null;
  return s;
}






function caminhosDosCampos(obj, campos, bucket) {
  const achados = [];
  for (const campo of campos || []) {
    const v = obj ? obj[campo] : null;
    const lista = Array.isArray(v) ? v : [v];
    for (const item of lista) {
      const p = caminhoNoBucket(item, bucket);
      if (p) achados.push(p);
    }
  }
  return [...new Set(achados)];
}












function aplicarAssinaturas(obj, campos, bucket, mapaAssinado) {
  if (!obj) return obj;
  const saida = { ...obj };
  for (const campo of campos || []) {
    const v = obj[campo];
    if (Array.isArray(v)) {
      saida[campo] = v.map((item) => {
        const p = caminhoNoBucket(item, bucket);
        return (p && mapaAssinado[p]) ? mapaAssinado[p] : item;
      });
    } else if (v != null) {
      const p = caminhoNoBucket(v, bucket);
      if (p && mapaAssinado[p]) saida[campo] = mapaAssinado[p];
    }
  }
  return saida;
}



























function separarCaminhosPorBucket(valores, bucketAtual, bucketLegado) {
  const legado = [];
  const atual = [];
  for (const v of (valores || [])) {
    const pLegado = bucketLegado ? caminhoDeUrlPublica(v, bucketLegado) : null;
    if (pLegado) { legado.push(pLegado); continue; }
    const pAtual = bucketAtual ? caminhoNoBucket(v, bucketAtual) : null;
    if (pAtual) atual.push(pAtual);
  }
  return { atual: [...new Set(atual)], legado: [...new Set(legado)] };
}

module.exports = {
  MARCA_PUBLICA,
  separarCaminhosPorBucket,
  caminhoNoBucket,
  caminhoDeUrlPublica,
  caminhoSeguro,
  caminhosDosCampos,
  aplicarAssinaturas,
};
