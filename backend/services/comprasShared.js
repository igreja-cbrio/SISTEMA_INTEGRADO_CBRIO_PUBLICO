


const { supabase } = require('../utils/supabase');
const { sugerirCategoria } = require('./nfScanner');

const hoje = () => new Date().toISOString().slice(0, 10);

const FORMA_PGTO_IA = {
  dinheiro: 'Dinheiro', pix: 'Pix', credito: 'Cartão', debito: 'Cartão', boleto: 'Boleto',
};




async function resolverFornecedor({ nome, cnpj, telefone, endereco }) {
  const nomeT = (nome || '').trim();
  const cnpjT = (cnpj || '').replace(/\D/g, '') || null;
  if (!nomeT && !cnpjT) return null;
  if (cnpjT) {
    const { data } = await supabase.from('log_fornecedores').select('id').eq('cnpj', cnpjT).maybeSingle();
    if (data) return data.id;
  }
  if (nomeT) {
    const { data } = await supabase.from('log_fornecedores').select('id').ilike('razao_social', nomeT).limit(1);
    if (data && data.length) return data[0].id;
  }
  const { data: novo, error } = await supabase.from('log_fornecedores')
    .insert({
      razao_social: nomeT || 'Fornecedor sem nome', cnpj: cnpjT,
      telefone: telefone || null, endereco: endereco || null, ativo: true,
      observacoes: 'Cadastrado automaticamente pela aba Compras · completar dados',
    })
    .select('id').single();
  if (error) { console.error('[COMPRAS] resolverFornecedor:', error.message); return null; }
  return novo.id;
}

const soDigitos = (s) => String(s || '').replace(/\D/g, '');



async function matchCompradorPorTelefone(telefone) {
  const alvo = soDigitos(telefone).slice(-11);
  if (alvo.length < 10) return null;
  const { data } = await supabase.from('rh_funcionarios')
    .select('id, nome, telefone').is('deleted_at', null).eq('status', 'ativo');
  if (!data) return null;

  for (const f of data) {
    const d = soDigitos(f.telefone).slice(-11);
    if (d.length >= 10 && (d.endsWith(alvo) || alvo.endsWith(d))) return { id: f.id, nome: f.nome };
  }
  return null;
}



async function criarCompraPendenteDeNota({ extraido, storagePath, telefone, origem = 'whatsapp' }) {
  const fornecedorId = (extraido?.emitente_nome || extraido?.emitente_cnpj)
    ? await resolverFornecedor({ nome: extraido?.emitente_nome, cnpj: extraido?.emitente_cnpj })
    : null;
  const comprador = telefone ? await matchCompradorPorTelefone(telefone) : null;
  let sugestao = null;
  if (extraido?.valor_total) {
    try { sugestao = await sugerirCategoria({ cnpj: extraido?.emitente_cnpj, nome: extraido?.emitente_nome, valor: extraido?.valor_total, descricao: extraido?.descricao_resumo }); }
    catch (e) {                   }
  }

  const { data, error } = await supabase.from('log_compras')
    .insert({
      tipo: 'variavel',
      data_compra: extraido?.data_emissao || hoje(),
      fornecedor: extraido?.emitente_nome || null,
      fornecedor_id: fornecedorId,
      emitente_cnpj: extraido?.emitente_cnpj || null,
      numero_nota: extraido?.numero || null,
      materiais: extraido?.descricao_resumo || null,
      valor: extraido?.valor_total || null,
      forma_pgto: FORMA_PGTO_IA[extraido?.forma_pagamento] || null,
      plano_contas_id: sugestao?.plano_contas_id || null,
      centro_custo_id: sugestao?.centro_custo_id || null,
      comprador: comprador?.nome || null,
      comprador_id: comprador?.id || null,
      origem_registro: origem,
      storage_path: storagePath || null,
      extracao_raw: extraido || null,
      extracao_confianca: extraido?.confianca ?? null,
      status_aprovacao: 'pendente',
    })
    .select('id, fornecedor, valor, forma_pgto, data_compra').single();
  if (error) { console.error('[COMPRAS] criarCompraPendenteDeNota:', error.message); return null; }

  try { await require('./finFaturas').vincularCompraNaFatura(data); } catch (e2) { console.error('[COMPRAS] fatura:', e2.message); }
  return data;
}

module.exports = { resolverFornecedor, matchCompradorPorTelefone, criarCompraPendenteDeNota, FORMA_PGTO_IA };
