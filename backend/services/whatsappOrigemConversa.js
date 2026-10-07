








const { supabase } = require('../utils/supabase');
const { rotuloDoDisparo, chaveTelefone } = require('../utils/whatsappOrigem');




const { mesmoNumeroBR } = require('./waInbox');



const DIAS_JANELA = 60;
const MAX_DISPAROS = 5;






async function disparosDoTelefone(telefone, { limite = MAX_DISPAROS } = {}) {
  const chave = chaveTelefone(telefone);
  if (!chave) return [];

  const desde = new Date(Date.now() - DIAS_JANELA * 86400 * 1000).toISOString();







  const colunas = 'id, telefone, contexto, template, status, enviado_em, criado_em, ref_id';
  let { data, error } = await supabase
    .from('whatsapp_envios')
    .select(colunas)
    .eq('tel8', chave)
    .gte('criado_em', desde)
    .order('criado_em', { ascending: false })
    .limit(limite * 4);




  if (error && /tel8/.test(error.message || '')) {
    const alt = await supabase
      .from('whatsapp_envios')
      .select(colunas)
      .gte('criado_em', desde)
      .order('criado_em', { ascending: false })
      .limit(1000);
    if (alt.error) throw new Error(alt.error.message);
    data = alt.data;
    error = null;
  }
  if (error) throw new Error(error.message);

  const saida = [];
  for (const e of data || []) {



    if (!mesmoNumeroBR(e.telefone, telefone)) continue;
    const { rotulo, modulo, link, conhecido } = rotuloDoDisparo(e.contexto);
    saida.push({
      id: e.id,
      contexto: e.contexto || null,
      rotulo,
      modulo,
      link,
      conhecido,
      template: e.template || null,
      status: e.status || null,


      em: e.enviado_em || e.criado_em || null,
      entregue: e.status === 'enviado',
      ref_id: e.ref_id || null,
    });
    if (saida.length >= limite) break;
  }
  return saida;
}

module.exports = { disparosDoTelefone, DIAS_JANELA };
