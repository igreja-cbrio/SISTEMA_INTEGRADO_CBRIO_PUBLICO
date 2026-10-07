


















const { supabase } = require('../utils/supabase');
const { normalizarCpf, registrarObservacaoSegura } = require('./identidadeProgressiva');
const { acharOuCriarGuardado } = require('./membroMatch');


async function mapLimit(items, limit, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  });
  await Promise.all(workers);
}


async function carregarIndicePorDocumento() {
  const porDoc = new Map();
  let offset = 0;
  const page = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from('mem_membros')
      .select('id, cpf, cnpj')
      .is('deleted_at', null)
      .range(offset, offset + page - 1);
    if (error) throw new Error('Erro carregando membros: ' + error.message);
    if (!data || !data.length) break;
    for (const m of data) {
      if (m.cpf) porDoc.set(String(m.cpf).replace(/\D/g, ''), m.id);
      if (m.cnpj) porDoc.set(String(m.cnpj).replace(/\D/g, ''), m.id);
    }
    if (data.length < page) break;
    offset += page;
  }
  return porDoc;
}








async function vincularIdentidadeOfx(transactions, { criarAvulso = true } = {}) {
  const stats = { cpfs_unicos: 0, vinculados_existente: 0, avulsos_criados: 0, observacoes: 0, ignorados: 0 };
  const mapaDoc = new Map();




  const porDoc = new Map();
  for (const t of transactions) {
    const raw = t.documento_contraparte;
    if (!raw) continue;
    const doc = String(raw).replace(/\D/g, '');
    if (doc.length !== 11 && doc.length !== 14) continue;
    const cur = porDoc.get(doc) || { nome: null, temCredito: false, len: doc.length };
    if (!cur.nome && t.nome_contraparte) cur.nome = t.nome_contraparte;
    if (t.tipo_trn === 'CREDIT' && Number(t.valor) > 0) cur.temCredito = true;
    porDoc.set(doc, cur);
  }
  stats.cpfs_unicos = porDoc.size;

  const indice = await carregarIndicePorDocumento();


  await mapLimit([...porDoc.entries()], 8, async ([doc, info]) => {
    const jaExiste = indice.get(doc);
    if (info.len === 14) {

      if (jaExiste) { mapaDoc.set(doc, jaExiste); stats.vinculados_existente++; }
      else stats.ignorados++;
      return;
    }

    const cpf = normalizarCpf(doc);
    if (!cpf) { stats.ignorados++; return; }


    await registrarObservacaoSegura({ origem: 'financeiro_ofx', origemId: cpf, cpf, nome: info.nome || null });
    stats.observacoes++;

    if (jaExiste) { mapaDoc.set(doc, jaExiste); stats.vinculados_existente++; return; }






    const nomeReal = String(info.nome || '').trim();
    if (criarAvulso && info.temCredito && nomeReal) {
      try {
        const r = await acharOuCriarGuardado({
          cpf, nome: nomeReal,
          status: 'contribuinte_avulso', origem: 'financeiro_ofx',
        });
        if (r?.membro_id) {
          mapaDoc.set(doc, r.membro_id);
          if (r.created) stats.avulsos_criados++; else stats.vinculados_existente++;
        }
      } catch (e) {
        console.warn('[ofxIdentidade] criar avulso falhou · cpf=%s · %s', cpf.slice(0, 3) + '***', e.message);
      }
    } else {

      stats.ignorados++;
      if (criarAvulso && info.temCredito && !nomeReal) stats.sem_nome = (stats.sem_nome || 0) + 1;
    }
  });

  return { mapaDoc, stats };
}

module.exports = { vincularIdentidadeOfx };
