









const XLSX = require('xlsx');





function decodeEndToEndId(e2eId) {
  if (!e2eId || typeof e2eId !== 'string' || !e2eId.startsWith('E') || e2eId.length < 21) {
    return null;
  }


  const ispb = e2eId.substring(1, 9);
  const yyyy = e2eId.substring(9, 13);
  const mm   = e2eId.substring(13, 15);
  const dd   = e2eId.substring(15, 17);
  const hh   = e2eId.substring(17, 19);
  const mi   = e2eId.substring(19, 21);
  const suffix = e2eId.substring(21);


  if (!/^\d{8}$/.test(ispb) || !/^\d{4}$/.test(yyyy) || !/^\d{2}$/.test(mm) ||
      !/^\d{2}$/.test(dd) || !/^\d{2}$/.test(hh) || !/^\d{2}$/.test(mi)) {
    return null;
  }


  const utc = new Date(Date.UTC(
    parseInt(yyyy, 10),
    parseInt(mm, 10) - 1,
    parseInt(dd, 10),
    parseInt(hh, 10),
    parseInt(mi, 10),
    0
  ));

  if (isNaN(utc.getTime())) return null;


  const brt = new Date(utc.getTime() - 3 * 60 * 60 * 1000);

  const pad = (n) => String(n).padStart(2, '0');

  return {
    ispb,
    suffix,
    datetime_utc: utc,
    datetime_brt: brt,
    data: `${brt.getUTCFullYear()}-${pad(brt.getUTCMonth() + 1)}-${pad(brt.getUTCDate())}`,
    hora: `${pad(brt.getUTCHours())}:${pad(brt.getUTCMinutes())}:00`,

    datetime_brt_iso: `${brt.getUTCFullYear()}-${pad(brt.getUTCMonth() + 1)}-${pad(brt.getUTCDate())}T${pad(brt.getUTCHours())}:${pad(brt.getUTCMinutes())}:00`,
  };
}




function normHeader(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim();
}




const HEADER_MAP = {
  'data':                       'data',
  'banco origem':               'banco_origem',
  'titularidade':               'titularidade',
  'pagador':                    'pagador',
  'tipo de lancamento':         'tipo',
  'identificador do pagamento': 'identificador',
  'valor':                      'valor',
  'id da transacao':            'e2e_id',
};





const { parseDateBR } = require('../utils/dataBr');




function parseValor(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return raw;
  const s = String(raw).trim().replace(/R\$\s*/i, '');
  if (/,\d{1,2}$/.test(s)) {
    return parseFloat(s.replace(/\./g, '').replace(',', '.'));
  }
  return parseFloat(s);
}




function parsePixExtrato(buffer, filename = '') {
  const isCSV = /\.csv$/i.test(filename);

  let rows = [];
  if (isCSV) {

    const text = buffer.toString('utf-8');
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length === 0) return { records: [], header: null };
    const headerCols = lines[0].split(/[;,]/).map(c => c.trim().replace(/^"|"$/g, ''));
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(/[;,]/).map(c => c.trim().replace(/^"|"$/g, ''));
      const row = {};
      headerCols.forEach((h, j) => { row[h] = cols[j] || ''; });
      rows.push(row);
    }
  } else {

    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });
  }


  const records = [];
  for (const r of rows) {
    const mapped = {};
    for (const [k, v] of Object.entries(r)) {
      const norm = normHeader(k);
      const field = HEADER_MAP[norm];
      if (field) mapped[field] = v;
    }
    if (!mapped.e2e_id && !mapped.data) continue;

    const decoded = decodeEndToEndId(mapped.e2e_id);
    const data = decoded?.data || parseDateBR(mapped.data);
    const valor = parseValor(mapped.valor);

    if (!data || valor === null) continue;


    let tipo = 'recebido';
    if (mapped.tipo) {
      tipo = /receb/i.test(mapped.tipo) ? 'recebido' : 'enviado';
    } else if (valor < 0) {
      tipo = 'enviado';
    }

    records.push({
      end_to_end_id: mapped.e2e_id || null,
      data,
      hora: decoded?.hora || null,
      datetime_brt: decoded?.datetime_brt_iso || null,
      datetime_utc: decoded ? decoded.datetime_utc.toISOString() : null,
      valor: Math.abs(valor),
      tipo,
      banco_origem: mapped.banco_origem || null,
      ispb_origem: decoded?.ispb || null,
      pagador_nome: mapped.pagador || null,
      pagador_documento: null,
      titularidade: mapped.titularidade || null,
      identificador_pagamento: mapped.identificador && mapped.identificador !== '-' ? mapped.identificador : null,
      raw_data: { original: r },
    });
  }

  return {
    records,
    total: records.length,
  };
}

module.exports = {
  parsePixExtrato,
  decodeEndToEndId,
  parseDateBR,
  parseValor,
};
