


































function cpfValido(valor) {
  const c = String(valor || '').replace(/\D/g, '');
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += Number(c[i]) * (10 - i);
  let d1 = (soma * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== Number(c[9])) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += Number(c[i]) * (11 - i);
  let d2 = (soma * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === Number(c[10]);
}










function cnpjValido(valor) {
  const c = String(valor || '').replace(/\D/g, '');
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const calc = (base) => {
    let peso = base.length - 7;
    let soma = 0;
    for (let i = 0; i < base.length; i++) {
      soma += Number(base[i]) * peso;
      peso -= 1;
      if (peso < 2) peso = 9;
    }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  if (calc(c.slice(0, 12)) !== Number(c[12])) return false;
  return calc(c.slice(0, 13)) === Number(c[13]);
}







const CNPJ_IGREJA = '07023068000135';



const CNPJ_ADQUIRENTES = [
  '01027058000191',
  '00749048760142',
  '16501555000157',
  '08561701000101',
  '10573521000191',
  '17351180000159',
];

const BLACKLIST = new Set([CNPJ_IGREJA, ...CNPJ_ADQUIRENTES]);


function bloquearDocumentos(lista) {
  for (const d of lista || []) {
    const c = String(d || '').replace(/\D/g, '');
    if (c.length === 11 || c.length === 14) BLACKLIST.add(c);
  }
}

function ehBloqueado(digitos) {
  return BLACKLIST.has(String(digitos || '').replace(/\D/g, ''));
}










const BORDA_ANTES = '(?<!\\d)';
const BORDA_DEPOIS = '(?!\\d)';

const RE = {
  cnpjFormatado: new RegExp(`${BORDA_ANTES}\\d{2}\\.\\d{3}\\.\\d{3}/\\d{4}-\\d{2}${BORDA_DEPOIS}`, 'g'),
  cpfFormatado: new RegExp(`${BORDA_ANTES}\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2}${BORDA_DEPOIS}`, 'g'),
  cnpjCru: new RegExp(`${BORDA_ANTES}\\d{14}${BORDA_DEPOIS}`, 'g'),
  cpfCru: new RegExp(`${BORDA_ANTES}\\d{11}${BORDA_DEPOIS}`, 'g'),
};

function candidatos(memo, re, tipo, ehValido) {
  const achados = [];
  for (const m of String(memo).matchAll(re)) {
    const digitos = m[0].replace(/\D/g, '');
    if (!ehValido(digitos)) continue;
    if (ehBloqueado(digitos)) continue;
    achados.push({ documento: digitos, tipo, formatado: m[0] });
  }
  return achados;
}











function extrairDocumentoDoMemo(memo) {
  if (!memo) return null;
  const texto = String(memo);










  const porTipo = [
    { tipo: 'cnpj', achados: [...candidatos(texto, RE.cnpjFormatado, 'cnpj', cnpjValido),
                              ...candidatos(texto, RE.cnpjCru, 'cnpj', cnpjValido)] },
    { tipo: 'cpf', achados: [...candidatos(texto, RE.cpfFormatado, 'cpf', cpfValido),
                             ...candidatos(texto, RE.cpfCru, 'cpf', cpfValido)] },
  ];

  for (const { achados } of porTipo) {
    if (!achados.length) continue;
    const unicos = [...new Set(achados.map((a) => a.documento))];
    if (unicos.length > 1) {
      return { documento: null, tipo: null, formatado: null, motivo: 'ambiguo' };
    }

    return achados.find((a) => /\D/.test(a.formatado)) || achados[0];
  }
  return null;
}

module.exports = {
  cpfValido,
  cnpjValido,
  extrairDocumentoDoMemo,
  bloquearDocumentos,
  ehBloqueado,
  CNPJ_IGREJA,
  CNPJ_ADQUIRENTES,
};
