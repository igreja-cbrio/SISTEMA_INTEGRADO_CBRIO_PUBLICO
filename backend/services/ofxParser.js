











const iconv = require('iconv-lite');




const { extrairDocumentoDoMemo } = require('../utils/documentoBr');

function decodeBuffer(buffer) {
  const headerEnd = buffer.indexOf('\n\n') > 0 ? buffer.indexOf('\n\n') : buffer.indexOf('\r\n\r\n');
  const headerRaw = buffer.slice(0, Math.max(headerEnd, 0)).toString('ascii');

  let charset = 'utf-8';
  if (/CHARSET\s*[:=]\s*1252/i.test(headerRaw) || /CHARSET\s*[:=]\s*WINDOWS-1252/i.test(headerRaw)) {
    charset = 'win1252';
  } else if (/CHARSET\s*[:=]\s*UTF-8/i.test(headerRaw)) {
    charset = 'utf-8';
  } else if (/CHARSET\s*[:=]\s*USASCII/i.test(headerRaw) || /ENCODING\s*[:=]\s*USASCII/i.test(headerRaw)) {
    charset = 'ascii';
  }

  if (charset === 'win1252') return iconv.decode(buffer, 'win1252');
  if (charset === 'ascii') return buffer.toString('ascii');
  return buffer.toString('utf-8');
}




function extractTag(block, tag) {

  const xmlMatch = block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i'));
  if (xmlMatch) return xmlMatch[1].trim();


  const sgmlMatch = block.match(new RegExp(`<${tag}>([^<\\n\\r]*)`, 'i'));
  if (sgmlMatch) return sgmlMatch[1].trim();

  return null;
}





function parseDtPosted(raw) {
  if (!raw) return null;
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const date = `${y}-${mo}-${d}`;
  const hasTime = h !== undefined && (h !== '00' || mi !== '00' || s !== '00');
  return {
    date,
    time: hasTime ? `${h}:${mi}:${s}` : null,
    hasTime,
  };
}




function parseAmount(raw) {
  if (!raw) return 0;
  const clean = raw.trim().replace(/\s/g, '');

  if (/,\d{1,2}$/.test(clean)) {
    return parseFloat(clean.replace(/\./g, '').replace(',', '.'));
  }
  return parseFloat(clean);
}









function extractDocumento(memo) {
  const r = extrairDocumentoDoMemo(memo);

  return r?.documento || null;
}









function extractNomeContraparte(memo) {
  if (!memo) return null;
  const prefixos = [
    'PIX QR CODE RECEBIDO', 'PIX QR CODE ENVIADO', 'PIX ENVIADO', 'PIX RECEBIDO',
    'TED RECEBIDA', 'TED ENVIADA', 'DOC RECEBIDO', 'DOC ENVIADO',
    'TRANSFERENCIA RECEBIDA', 'TRANSFERENCIA ENVIADA',
    'PAGAMENTO A FORNECEDORES', 'PAGAMENTO DE BOLETO', 'PAGAMENTO CARTAO DE DEBITO',
  ];
  let s = String(memo);
  const up = s.toUpperCase();
  for (const p of prefixos) {
    if (up.startsWith(p)) { s = s.substring(p.length); break; }
  }

  s = s
    .replace(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g, ' ')
    .replace(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g, ' ')
    .replace(/\d{6,}/g, ' ');

  s = s.replace(/^.*?\d{1,2}\/\d{1,2}\s+/, '');

  s = s
    .replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, ' ')
    .replace(/[.\-/]{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!s || s.length < 3 || !/[A-Za-zÀ-ÿ]/.test(s)) return null;
  return s;
}




































const MIN_TRN_PARA_DETECTAR_CARIMBO = 3;

function horaEhCarimbo(horas) {
  const comHora = horas.filter(Boolean);
  if (comHora.length < MIN_TRN_PARA_DETECTAR_CARIMBO) return null;
  if (comHora.length !== horas.length) return null;
  const distintas = new Set(comHora);
  if (distintas.size !== 1) return null;
  return { hora: comHora[0], transacoes: comHora.length };
}

function parseOfx(buffer) {
  const content = typeof buffer === 'string' ? buffer : decodeBuffer(buffer);


  const bankIdMatch = content.match(/<BANKID>([^\n<]+)/);
  const acctIdMatch = content.match(/<ACCTID>([^\n<]+)/);
  const acctTypeMatch = content.match(/<ACCTTYPE>([^\n<]+)/);
  const curdefMatch = content.match(/<CURDEF>([^\n<]+)/);
  const dtstartMatch = content.match(/<DTSTART>([^\n<]+)/);
  const dtendMatch = content.match(/<DTEND>([^\n<]+)/);

  const header = {
    bankId: bankIdMatch ? bankIdMatch[1].trim() : null,
    acctId: acctIdMatch ? acctIdMatch[1].trim() : null,
    acctType: acctTypeMatch ? acctTypeMatch[1].trim() : null,
    currency: curdefMatch ? curdefMatch[1].trim() : 'BRL',
    dtStart: dtstartMatch ? parseDtPosted(dtstartMatch[1].trim())?.date : null,
    dtEnd: dtendMatch ? parseDtPosted(dtendMatch[1].trim())?.date : null,
  };


  const transactions = [];
  const trnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let match;
  while ((match = trnRegex.exec(content)) !== null) {
    const block = match[1];
    const trnType = extractTag(block, 'TRNTYPE');
    const dtPosted = extractTag(block, 'DTPOSTED');
    const trnAmt = extractTag(block, 'TRNAMT');
    const fitid = extractTag(block, 'FITID');
    const memo = extractTag(block, 'MEMO');
    const checkNum = extractTag(block, 'CHECKNUM');
    const refNum = extractTag(block, 'REFNUM');

    const dt = parseDtPosted(dtPosted);
    if (!dt) continue;

    const valor = parseAmount(trnAmt);
    const documento = extractDocumento(memo);
    const nome = extractNomeContraparte(memo);

    transactions.push({
      tipo_trn: trnType?.toUpperCase() || (valor < 0 ? 'DEBIT' : 'CREDIT'),
      data_lancamento: dt.date,
      hora_lancamento: dt.hasTime ? dt.time : null,
      hora_origem: dt.hasTime ? 'ofx' : null,
      valor,
      memo: memo || '',
      fitid,
      documento_contraparte: documento,
      nome_contraparte: nome,
      raw_data: { check_num: checkNum, ref_num: refNum, dt_posted_raw: dtPosted },
    });
  }


  const carimbo = horaEhCarimbo(transactions.map((t) => t.hora_lancamento));
  if (carimbo) {
    for (const t of transactions) {
      t.hora_lancamento = null;
      t.hora_origem = null;
    }
    header.horaDescartada = { motivo: 'carimbo_fixo', ...carimbo };
  }

  return { header, transactions };
}

module.exports = {
  parseOfx,
  parseDtPosted,
  horaEhCarimbo,
  parseAmount,
  extractDocumento,
  extractNomeContraparte,
};
