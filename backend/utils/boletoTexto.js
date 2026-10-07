
















const { acharBoletoNoTexto, soDigitos } = require('./boletoLinha');

function cnpjValido(d) {
  if (!/^\d{14}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (base, pesos) => {
    const s = base.split('').reduce((acc, n, i) => acc + Number(n) * pesos[i], 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(d.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc(d.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(d[12]) && d2 === Number(d[13]);
}

function cpfValido(d) {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (n) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

const RE_PAGADOR = /pagador|sacado|cliente/i;
const RE_BENEFICIARIO = /benefici|cedente|favorecido|recebedor/i;

function limparNome(n) {
  return String(n || '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s:.\-–]+|[\s:.\-–]+$/g, '')
    .slice(0, 120)
    .trim();
}



function candidatosDocumento(texto) {
  const linhas = String(texto || '').split(/\r?\n/);
  const cands = [];
  const reNomeDoc = /^(.{2,100}?)\s*[-–]\s*(?:CPF\/CNPJ|CNPJ\/CPF|CNPJ|CPF)\s*:?\s*([\d.\/-]{11,20})/i;
  const reDoc = /(?:CPF\/CNPJ|CNPJ\/CPF|CNPJ|CPF)\s*:?\s*([\d.\/-]{11,20})/i;
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    const contexto = [linhas[i - 2] || '', linhas[i - 1] || '', l].join(' ');
    let m = l.match(reNomeDoc);
    let nome = null;
    let docBruto = null;
    if (m) { nome = limparNome(m[1]); docBruto = m[2]; }
    else {
      m = l.match(reDoc);
      if (m) docBruto = m[1];
      else if (/^[\d.\/-]{14,20}$/.test(l.trim()) && /cnpj|cpf/i.test(linhas[i - 1] || '')) {
        docBruto = l.trim();
      }
    }
    if (!docBruto) continue;
    const doc = soDigitos(docBruto);
    const tipo = doc.length === 14 && cnpjValido(doc) ? 'cnpj' : (doc.length === 11 && cpfValido(doc) ? 'cpf' : null);
    if (!tipo) continue;


    if (nome && RE_BENEFICIARIO.test(nome) && /cpf|cnpj/i.test(nome)) nome = null;
    cands.push({
      doc, tipo, nome,
      pagador: RE_PAGADOR.test(contexto) && !RE_BENEFICIARIO.test(l),
      beneficiario: RE_BENEFICIARIO.test(contexto),
    });
  }
  return cands;
}







const RE_PROPRIA = /comunidade\s+batista\s+do\s+rio|\bcbrio\b/i;

function escolherBeneficiario(cands) {
  const pagadores = new Set(cands.filter(c => c.pagador || (c.nome && RE_PROPRIA.test(c.nome))).map(c => c.doc));




  const temCnpj = cands.some(c => c.tipo === 'cnpj' && !pagadores.has(c.doc));
  const placar = new Map();
  for (const c of cands) {
    if (pagadores.has(c.doc)) continue;
    if (temCnpj && c.tipo !== 'cnpj') continue;
    const p = placar.get(c.doc) || { doc: c.doc, tipo: c.tipo, pontos: 0, nomes: new Map() };
    p.pontos += 1 + (c.beneficiario ? 3 : 0);
    if (c.nome) p.nomes.set(c.nome, (p.nomes.get(c.nome) || 0) + 1);
    placar.set(c.doc, p);
  }
  let melhor = null;
  for (const p of placar.values()) {
    if (!melhor || p.pontos > melhor.pontos) melhor = p;
  }
  if (!melhor) return null;
  let nome = null;
  let n = 0;
  for (const [k, v] of melhor.nomes) if (v > n) { nome = k; n = v; }
  return { documento: melhor.doc, tipo: melhor.tipo, nome };
}




function vencimentoImpresso(texto) {
  const linhas = String(texto || '').split(/\r?\n/);
  for (let i = 0; i < linhas.length; i++) {
    if (!/vencimento/i.test(linhas[i])) continue;
    for (let j = i; j <= i + 2 && j < linhas.length; j++) {
      const m = linhas[j].match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
      if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    }
  }
  return null;
}

function lerTextoBoleto(texto, opts) {
  return {
    boleto: acharBoletoNoTexto(texto, opts),
    beneficiario: escolherBeneficiario(candidatosDocumento(texto)),
    vencimento_impresso: vencimentoImpresso(texto),
  };
}

module.exports = {
  cnpjValido,
  cpfValido,
  candidatosDocumento,
  escolherBeneficiario,
  vencimentoImpresso,
  lerTextoBoleto,
};
