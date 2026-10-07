



















const XLSX = require('xlsx');
const crypto = require('crypto');
const { supabase } = require('../utils/supabase');

const BATCH_SIZE = 500;


const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();


const SINONIMOS = {


  nome: ['nome', 'nome completo', 'contribuinte', 'nome do contribuinte', 'membro', 'doador', 'origem'],
  cpf: ['cpf', 'documento', 'cpf/cnpj', 'cpf cnpj'],
  valor: ['valor', 'valor(r$)', 'valor (r$)', 'valor r$', 'valor da contribuicao'],
  data: ['data', 'data contribuicao', 'data da contribuicao', 'competencia', 'data do lancamento', 'data lancamento'],



  tipo: ['tipo de contribuicao', 'tipo contribuicao', 'tipo', 'especie'],
  forma_pagamento: ['forma', 'forma de pagamento', 'forma pagamento', 'forma pagto'],
  area: ['area', 'ministerio', 'campus', 'centro de custo'],
  campanha: ['campanha'],
};

const AREAS_VALIDAS = ['kids', 'sede', 'ami', 'bridge', 'online'];



function detectarLayout(header) {
  const norms = header.map(norm);
  const idxDe = (chave) => {
    for (const syn of SINONIMOS[chave]) {
      const i = norms.indexOf(syn);
      if (i >= 0) return i;
    }
    return -1;
  };
  const layout = {};
  for (const chave of Object.keys(SINONIMOS)) layout[chave] = idxDe(chave);
  return layout;
}




function dataToISO(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date && !isNaN(v)) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d || !d.y) return null;
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const s = String(v).trim();
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (br) {
    const [, d, m, y] = br;
    const yy = y.length === 2 ? `20${y}` : y;
    return `${yy}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}


function valorBR(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/[R$\s]/g, '');

  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  s = s.replace(/[^0-9.\-]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}


function mapearTipo(v) {
  const s = norm(v);
  if (!s) return 'dizimo';
  if (s.includes('dizim')) return 'dizimo';
  if (s.includes('campanh')) return 'campanha';
  if (s.includes('ofert')) return 'oferta';
  return 'dizimo';
}


function mapearArea(v) {
  const s = norm(v);
  if (!s) return null;
  if (AREAS_VALIDAS.includes(s)) return s;
  if (s.includes('kid') || s.includes('crianc') || s.includes('infant')) return 'kids';
  if (s.includes('bridge')) return 'bridge';
  if (s.includes('ami')) return 'ami';
  if (s.includes('online')) return 'online';
  if (s.includes('sede') || s.includes('templo') || s.includes('matriz')) return 'sede';
  return null;
}

const txt = (v) => (v === null || v === undefined || String(v).trim() === '') ? null : String(v).trim();






function parsePlanilha(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true, cellNF: false, cellStyles: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { rows: [], colunas_detectadas: {}, faltando: ['nome/cpf', 'valor', 'data'] };

  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  if (grid.length < 2) return { rows: [], colunas_detectadas: {}, faltando: ['nome/cpf', 'valor', 'data'] };

  const header = grid[0];
  const layout = detectarLayout(header);


  const faltando = [];
  if (layout.valor < 0) faltando.push('valor');
  if (layout.data < 0) faltando.push('data');
  if (layout.nome < 0 && layout.cpf < 0) faltando.push('nome ou cpf');

  const colunas_detectadas = {};
  for (const [chave, i] of Object.entries(layout)) {
    if (i >= 0) colunas_detectadas[chave] = String(header[i]).trim();
  }

  const at = (r, i) => (i >= 0 ? r[i] : null);
  const rows = [];
  for (let li = 1; li < grid.length; li++) {
    const r = grid[li];
    if (!r || r.every((c) => c === null || c === '')) continue;

    rows.push({
      linha: li + 1,
      nome: txt(at(r, layout.nome)),
      cpf: txt(at(r, layout.cpf)),
      _valorRaw: at(r, layout.valor),
      _dataRaw: at(r, layout.data),
      valor: valorBR(at(r, layout.valor)),
      data: dataToISO(at(r, layout.data)),
      tipo: mapearTipo(at(r, layout.tipo)),
      forma_pagamento: txt(at(r, layout.forma_pagamento)),
      area: mapearArea(at(r, layout.area)),
      campanha: txt(at(r, layout.campanha)),
    });
  }

  return { rows, colunas_detectadas, faltando };
}



function refExterna(membroId, dataISO, valor, tipo) {
  const centavos = Math.round((valor || 0) * 100);
  return crypto.createHash('sha256')
    .update(`${membroId}|${dataISO}|${centavos}|${tipo}`)
    .digest('hex');
}



async function refsJaGravadas(refs) {
  const existentes = new Set();
  const lista = [...refs];
  for (let i = 0; i < lista.length; i += 500) {
    const chunk = lista.slice(i, i + 500);
    const { data, error } = await supabase
      .from('mem_contribuicoes')
      .select('referencia_externa')
      .in('referencia_externa', chunk)
      .is('deleted_at', null);
    if (error) throw new Error('Erro consultando contribuições existentes: ' + error.message);
    (data || []).forEach((r) => existentes.add(r.referencia_externa));
  }
  return existentes;
}





async function carregarIndiceMembros() {
  const porCpf = new Map();
  const porNome = new Map();
  let offset = 0;
  const page = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from('mem_membros')
      .select('id, nome, cpf')
      .is('deleted_at', null)
      .range(offset, offset + page - 1);
    if (error) throw new Error('Erro carregando membros: ' + error.message);
    if (!data || !data.length) break;
    for (const m of data) {
      const nn = norm(m.nome);
      if (nn) { if (!porNome.has(nn)) porNome.set(nn, []); porNome.get(nn).push(m.id); }
      if (m.cpf) porCpf.set(String(m.cpf).replace(/\D/g, ''), m.id);
    }
    if (data.length < page) break;
    offset += page;
  }
  return { porCpf, porNome };
}





function casarPorIndice(idx, r) {
  const cpf = r.cpf ? String(r.cpf).replace(/\D/g, '') : null;
  if (cpf && idx.porCpf.has(cpf)) return { membro_id: idx.porCpf.get(cpf) };
  const nn = norm(r.nome);
  if (nn && idx.porNome.has(nn)) {
    const ids = idx.porNome.get(nn);
    if (ids.length === 1) return { membro_id: ids[0] };
    return { _ambiguo: true };
  }
  return null;
}




async function processar(rows, { userId = null, commit = false } = {}) {
  const resumo = {
    total: rows.length,
    inseridos: 0,
    duplicados: 0,
    sem_vinculo: 0,
    ambiguos: 0,
    erros: [],
    colunas_detectadas: null,
    amostra_sem_vinculo: [],
  };








  const chavePessoa = (r) =>
    r.cpf ? 'cpf:' + String(r.cpf).replace(/\D/g, '')
      : (r.nome ? 'nome:' + norm(r.nome) : null);
  const linhaPorChave = new Map();
  for (const r of rows) {
    const k = chavePessoa(r);
    if (k && !linhaPorChave.has(k)) linhaPorChave.set(k, r);
  }
  const indiceMembros = await carregarIndiceMembros();
  const matchByChave = new Map();
  for (const [k, r] of linhaPorChave) {
    matchByChave.set(k, casarPorIndice(indiceMembros, r));
  }


  const candidatos = [];
  const refsVistas = new Set();
  const semVinculoNomes = [];

  for (const row of rows) {

    if (row.valor === null || !(row.valor > 0)) {
      resumo.erros.push({ linha: row.linha, motivo: `valor inválido (${row._valorRaw ?? 'vazio'})` });
      continue;
    }

    if (!row.data) {
      resumo.erros.push({ linha: row.linha, motivo: `data inválida (${row._dataRaw ?? 'vazio'})` });
      continue;
    }
    if (!row.nome && !row.cpf) {
      resumo.erros.push({ linha: row.linha, motivo: 'linha sem nome e sem CPF' });
      continue;
    }



    const match = matchByChave.get(chavePessoa(row)) || null;
    if (!match?.membro_id) {
      resumo.sem_vinculo++;
      if (match?._ambiguo) resumo.ambiguos++;
      if (semVinculoNomes.length < 20) semVinculoNomes.push(row.nome || row.cpf || `linha ${row.linha}`);
      continue;
    }

    const ref = refExterna(match.membro_id, row.data, row.valor, row.tipo);


    if (refsVistas.has(ref)) {
      resumo.duplicados++;
      continue;
    }
    refsVistas.add(ref);

    candidatos.push({
      ref,
      payload: {
        membro_id: match.membro_id,
        tipo: row.tipo,
        valor: row.valor,
        data: row.data,
        origem: 'importacao',
        referencia_externa: ref,
        registrado_por: userId,
        area: row.area || null,
        forma_pagamento: row.forma_pagamento || null,
        campanha: row.campanha || null,
      },
    });
  }

  resumo.amostra_sem_vinculo = semVinculoNomes;


  const jaGravadas = candidatos.length
    ? await refsJaGravadas(candidatos.map((c) => c.ref))
    : new Set();

  const novos = [];
  for (const c of candidatos) {
    if (jaGravadas.has(c.ref)) resumo.duplicados++;
    else novos.push(c.payload);
  }


  if (!commit) {
    resumo.inseridos = novos.length;
    return resumo;
  }


  let inseridos = 0;
  for (let i = 0; i < novos.length; i += BATCH_SIZE) {
    const chunk = novos.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from('mem_contribuicoes')
      .insert(chunk)
      .select('id');
    if (error) {
      resumo.erros.push({ linha: null, motivo: `lote ${i / BATCH_SIZE + 1}: ${error.message}` });
      continue;
    }
    inseridos += (data?.length || 0);
  }
  resumo.inseridos = inseridos;
  return resumo;
}

module.exports = { parsePlanilha, processar, refExterna };
