










































const { supabase } = require('../utils/supabase');
const { pesquisaDevida, primeiroNome } = require('../utils/visitanteRegras');

const DISPARO_ID = 'visitante_pesquisa';
const CONTEXTO = 'cuidados.visitante_pesquisa';


const CONTEXTO_OBRIGADO = 'cuidados.visitante_pesquisa_obrigado';
const TEMPLATE = process.env.WHATSAPP_TEMPLATE_VISITANTE_PESQUISA || 'visitante_pesquisa_satisfacao';
const TETO_POR_RODADA = 100;


async function horasDosCultos(ids) {
  const out = new Map();
  const lista = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < lista.length; i += 200) {
    const { data, error } = await supabase.from('cultos').select('id, data, hora').in('id', lista.slice(i, i + 200));
    if (error) throw error;
    for (const c of data || []) out.set(c.id, c);
  }
  return out;
}






async function enviarPesquisasDevidas({ agora = new Date() } = {}) {
  const resumo = { enviadas: 0, aguardando: 0, expiradas: 0, desligado: false, erro: null };
  try {
    const { disparoDesligado } = require('./comunicacaoDisparosOff');
    if (await disparoDesligado(DISPARO_ID)) { resumo.desligado = true; return resumo; }



    const desde = new Date(agora.getTime() - 72 * 3600 * 1000).toISOString();
    const { data: visitas, error } = await supabase
      .from('vis_visitas')
      .select('id, nome, telefone, culto_id, culto_data, created_at, whatsapp_optin, pesquisa_enviada_em')
      .eq('whatsapp_optin', true)
      .is('pesquisa_enviada_em', null)
      .is('deleted_at', null)
      .gte('created_at', desde)
      .order('created_at', { ascending: true })
      .limit(TETO_POR_RODADA);
    if (error) throw error;
    if (!visitas?.length) return resumo;

    const cultos = await horasDosCultos(visitas.map((v) => v.culto_id));
    const { enfileirarLote } = require('./whatsappFila');
    const itens = [];

    for (const v of visitas) {
      const culto = v.culto_id ? cultos.get(v.culto_id) : null;
      const destino = pesquisaDevida({
        registradoEm: v.created_at,
        cultoData: culto?.data || v.culto_data || null,
        cultoHora: culto?.hora || null,
        whatsappOptin: v.whatsapp_optin,
        pesquisaEnviadaEm: v.pesquisa_enviada_em,
        agora,
      });
      if (destino === 'aguardar') { resumo.aguardando += 1; continue; }
      if (destino === 'expirada') {


        await supabase.from('vis_visitas')
          .update({ pesquisa_enviada_em: agora.toISOString(), pesquisa_status: 'expirada' })
          .eq('id', v.id).is('pesquisa_enviada_em', null)
          .then(() => {}, () => {});
        resumo.expiradas += 1;
        continue;
      }
      if (destino !== 'enviar') continue;



      const { data: marcada } = await supabase.from('vis_visitas')
        .update({ pesquisa_enviada_em: agora.toISOString(), pesquisa_status: 'enviada' })
        .eq('id', v.id).is('pesquisa_enviada_em', null)
        .select('id');
      if (!marcada?.length) continue;

      itens.push({

        telefone: v.telefone,
        template: TEMPLATE,



        params: [primeiroNome(v.nome)],
        contexto: CONTEXTO,
        refId: v.id,
      });
    }

    if (itens.length) {
      const lote = await enfileirarLote(itens);
      resumo.enviadas = lote.queued || 0;
      if (lote.motivo) resumo.erro = lote.motivo;
    }
    return resumo;
  } catch (e) {
    console.error('[visitantePesquisa]', e.message);
    resumo.erro = e.message;
    return resumo;
  }
}


async function publicoPesquisaVisitante() {
  const desde = new Date(Date.now() - 72 * 3600 * 1000).toISOString();
  const { count } = await supabase.from('vis_visitas')
    .select('id', { count: 'exact', head: true })
    .eq('whatsapp_optin', true).is('pesquisa_enviada_em', null).is('deleted_at', null)
    .gte('created_at', desde);
  return {
    total: count || 0,
    pessoas: [],
    universo: { rotulo: 'visitantes com opt-in aguardando a pesquisa (72h)', qtd: count || 0 },
  };
}

module.exports = { DISPARO_ID, CONTEXTO, CONTEXTO_OBRIGADO, TEMPLATE, enviarPesquisasDevidas, publicoPesquisaVisitante };
