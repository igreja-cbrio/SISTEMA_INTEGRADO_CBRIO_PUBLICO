




















const BASE_FATOR_ANTIGA = Date.UTC(1997, 9, 7);
const CICLO_FATOR_DIAS = 9000;
const DIA_MS = 86400000;

function soDigitos(v) {
  return String(v == null ? '' : v).replace(/\D/g, '');
}


function mod10(numero) {
  let soma = 0;
  let peso = 2;
  for (let i = numero.length - 1; i >= 0; i--) {
    let p = Number(numero[i]) * peso;
    if (p > 9) p = Math.floor(p / 10) + (p % 10);
    soma += p;
    peso = peso === 2 ? 1 : 2;
  }
  const resto = soma % 10;
  return resto === 0 ? 0 : 10 - resto;
}


function mod11Boleto(numero) {
  let soma = 0;
  let peso = 2;
  for (let i = numero.length - 1; i >= 0; i--) {
    soma += Number(numero[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const dv = 11 - (soma % 11);
  return dv === 0 || dv === 10 || dv === 11 ? 1 : dv;
}


function mod11Arrecadacao(numero) {
  let soma = 0;
  let peso = 2;
  for (let i = numero.length - 1; i >= 0; i--) {
    soma += Number(numero[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  if (resto === 0 || resto === 1) return 0;
  if (resto === 10) return 1;
  return 11 - resto;
}

function isoDeMs(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}


function hojeBrtIso(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora);
}





function vencimentoDoFator(fator, referenciaIso) {
  const f = Number(fator);
  if (!Number.isInteger(f) || f < 1000 || f > 9999) return null;
  const ref = referenciaIso ? Date.parse(`${referenciaIso}T00:00:00Z`) : Date.parse(`${hojeBrtIso()}T00:00:00Z`);
  if (!Number.isFinite(ref)) return null;
  let melhor = null;
  for (let ciclo = 0; ciclo <= 3; ciclo++) {
    const ms = BASE_FATOR_ANTIGA + (f + ciclo * CICLO_FATOR_DIAS) * DIA_MS;
    if (melhor == null || Math.abs(ms - ref) < Math.abs(melhor - ref)) melhor = ms;
  }
  return isoDeMs(melhor);
}




function barrasDeLinhaBoleto(linha) {
  if (linha.length !== 47) return null;
  const campo1 = linha.slice(0, 9);
  const campo2 = linha.slice(10, 20);
  const campo3 = linha.slice(21, 31);
  const dvGeral = linha[32];
  const fatorValor = linha.slice(33, 47);
  return `${campo1.slice(0, 4)}${dvGeral}${fatorValor}${campo1.slice(4)}${campo2}${campo3}`;
}


function linhaDeBarrasBoleto(barras) {
  if (barras.length !== 44) return null;
  const livre = barras.slice(19, 44);
  const c1 = `${barras.slice(0, 4)}${livre.slice(0, 5)}`;
  const c2 = livre.slice(5, 15);
  const c3 = livre.slice(15, 25);
  return `${c1}${mod10(c1)}${c2}${mod10(c2)}${c3}${mod10(c3)}${barras[4]}${barras.slice(5, 19)}`;
}


function barrasDeLinhaArrecadacao(linha) {
  if (linha.length !== 48) return null;
  return `${linha.slice(0, 11)}${linha.slice(12, 23)}${linha.slice(24, 35)}${linha.slice(36, 47)}`;
}

function linhaDeBarrasArrecadacao(barras, dvBloco) {
  const blocos = [barras.slice(0, 11), barras.slice(11, 22), barras.slice(22, 33), barras.slice(33, 44)];
  return blocos.map((b) => `${b}${dvBloco(b)}`).join('');
}

function bancoNome(codigo) {
  return BANCOS[codigo] || null;
}

const BANCOS = {
  '001': 'Banco do Brasil', '033': 'Santander', '041': 'Banrisul', '070': 'BRB',
  '077': 'Inter', '104': 'Caixa Econômica Federal', '133': 'Cresol', '136': 'Unicred',
  '208': 'BTG Pactual', '212': 'Banco Original', '237': 'Bradesco', '260': 'Nu Pagamentos',
  '290': 'PagSeguro', '323': 'Mercado Pago', '336': 'C6 Bank', '341': 'Itaú',
  '389': 'Mercantil do Brasil', '422': 'Safra', '748': 'Sicredi', '756': 'Sicoob',
};




function lerBoleto(entrada, { referenciaIso } = {}) {
  const d = soDigitos(entrada);
  if (!d) return { ok: false, motivo: 'vazio' };

  const ehArrecadacao = d[0] === '8';
  if (ehArrecadacao) {
    let barras;
    if (d.length === 48) barras = barrasDeLinhaArrecadacao(d);
    else if (d.length === 44) barras = d;
    else return { ok: false, motivo: 'tamanho_invalido', digitos: d.length };

    const idValor = barras[2];

    const dvBloco = idValor === '6' || idValor === '7' ? mod10 : idValor === '8' || idValor === '9' ? mod11Arrecadacao : null;
    if (!dvBloco) return { ok: false, motivo: 'identificador_invalido' };
    const semDv = `${barras.slice(0, 3)}${barras.slice(4)}`;
    const dvGeralOk = dvBloco(semDv) === Number(barras[3]);
    let blocosOk = true;
    if (d.length === 48) {
      blocosOk = linhaDeBarrasArrecadacao(barras, dvBloco) === d;
    }

    const valorEfetivo = idValor === '6' || idValor === '8';
    const valorCentavos = valorEfetivo ? Number(barras.slice(4, 15)) : null;
    return {
      ok: dvGeralOk && blocosOk,
      motivo: dvGeralOk && blocosOk ? null : 'digito_verificador',
      tipo: 'arrecadacao',
      segmento: barras[1],
      linha_digitavel: d.length === 48 ? d : linhaDeBarrasArrecadacao(barras, dvBloco),
      codigo_barras: barras,
      valor_centavos: valorCentavos && valorCentavos > 0 ? valorCentavos : null,

      vencimento: null,
      banco_codigo: null,
      banco_nome: null,
    };
  }

  let barras;
  let linha;
  if (d.length === 47) { linha = d; barras = barrasDeLinhaBoleto(d); }
  else if (d.length === 44) { barras = d; linha = linhaDeBarrasBoleto(d); }
  else return { ok: false, motivo: 'tamanho_invalido', digitos: d.length };

  const dvGeralOk = mod11Boleto(`${barras.slice(0, 4)}${barras.slice(5)}`) === Number(barras[4]);


  const camposOk = d.length === 47 ? linhaDeBarrasBoleto(barras) === d : true;
  const fator = barras.slice(5, 9);
  const valorCentavos = Number(barras.slice(9, 19));
  const banco = barras.slice(0, 3);
  return {
    ok: dvGeralOk && camposOk,
    motivo: dvGeralOk && camposOk ? null : 'digito_verificador',
    tipo: 'boleto',
    linha_digitavel: linha,
    codigo_barras: barras,
    banco_codigo: banco,
    banco_nome: bancoNome(banco),

    valor_centavos: valorCentavos > 0 ? valorCentavos : null,
    vencimento: fator === '0000' ? null : vencimentoDoFator(fator, referenciaIso),
  };
}














const SEP = '[ \\t\\u00a0]';
const PADROES_FORMATADOS = [

  new RegExp(`(?<!\\d)\\d{5}\\.?${SEP}?\\d{5}${SEP}+\\d{5}\\.?${SEP}?\\d{6}${SEP}+\\d{5}\\.?${SEP}?\\d{6}${SEP}+\\d${SEP}+\\d{14}(?!\\d)`, 'g'),

  new RegExp(`(?<!\\d)\\d{11}${SEP}?-?${SEP}?\\d${SEP}+\\d{11}${SEP}?-?${SEP}?\\d${SEP}+\\d{11}${SEP}?-?${SEP}?\\d${SEP}+\\d{11}${SEP}?-?${SEP}?\\d(?!\\d)`, 'g'),
];
const TAMANHOS = new Set([44, 47, 48]);

function acharBoletoNoTexto(texto, opts) {
  const s = String(texto || '');
  const candidatos = [];
  for (const re of PADROES_FORMATADOS) {
    for (const m of s.match(re) || []) candidatos.push(soDigitos(m));
  }

  for (const m of s.match(/(?<!\d)[0-9][0-9. \t\u00a0-]{42,70}[0-9](?!\d)/g) || []) {
    const d = soDigitos(m);
    if (TAMANHOS.has(d.length)) candidatos.push(d);
  }
  let primeiraInvalida = null;
  for (const d of candidatos) {
    const r = lerBoleto(d, opts);
    if (r.ok) return r;
    if (!primeiraInvalida && r.motivo === 'digito_verificador') primeiraInvalida = r;
  }
  return primeiraInvalida || { ok: false, motivo: 'nao_encontrado' };
}

module.exports = {
  lerBoleto,
  acharBoletoNoTexto,
  vencimentoDoFator,
  mod10,
  mod11Boleto,
  mod11Arrecadacao,
  hojeBrtIso,
  soDigitos,
};
