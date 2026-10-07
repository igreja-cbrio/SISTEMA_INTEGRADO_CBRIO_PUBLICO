





























const { supabase } = require('../utils/supabase');
const { semFalhar } = require('../utils/semFalhar');
const { textoDaResposta, wamidRespondido } = require('../utils/respostaEscala');
const {
  interpretarNotaVisitante, ehComentario, textoObrigado, textoComentarioRecebido,
  interpretarRespostaFlowVisitante,
} = require('../utils/respostaPesquisaVisitante');
const { primeiroNome, comentarioNaJanela } = require('../utils/visitanteRegras');
const { CONTEXTO, CONTEXTO_OBRIGADO } = require('./visitantePesquisa');

const JANELA_SEM_CONTEXTO_H = 72;


function tail8(t) {
  const d = String(t || '').replace(/\D/g, '');
  return d.length >= 8 ? d.slice(-8) : null;
}


async function envioUnicoRecente(from) {
  const alvo = tail8(from);
  if (!alvo) return null;
  const desde = new Date(Date.now() - JANELA_SEM_CONTEXTO_H * 3600000).toISOString();
  const { data, error } = await supabase.from('whatsapp_envios')
    .select('id, ref_id, contexto, telefone, criado_em')
    .eq('contexto', CONTEXTO).gte('criado_em', desde)
    .order('criado_em', { ascending: false }).limit(200);
  if (error) return null;
  const meus = (data || []).filter((e) => tail8(e.telefone) === alvo && e.ref_id);
  return meus.length === 1 ? meus[0] : null;
}

async function envioPorWamid(wamid) {
  const { data } = await supabase.from('whatsapp_envios')
    .select('id, ref_id, contexto')
    .eq('message_id', wamid).in('contexto', [CONTEXTO, CONTEXTO_OBRIGADO]).maybeSingle();
  return data?.ref_id ? data : null;
}





async function processarRespostaVisitante(m, { enviarTexto, normalizarTelefone }) {
  const wamid = wamidRespondido(m);





  if (m.type === 'interactive' && m.interactive?.type === 'nfm_reply') {
    const resp = interpretarRespostaFlowVisitante(m.interactive.nfm_reply?.response_json);
    if (!resp) return false;
    const envio = wamid ? await envioPorWamid(wamid) : await envioUnicoRecente(m.from);
    if (!envio) return false;
    const messageId = m.id;
    const telefone = normalizarTelefone(m.from);
    const { data: jaVisto } = await supabase.from('whatsapp_coletas')
      .select('id').eq('whatsapp_message_id', messageId).maybeSingle();
    if (jaVisto) return true;
    const { data: visita } = await supabase.from('vis_visitas')
      .select('id, nome, telefone, pesquisa_nota, pesquisa_comentario')
      .eq('id', envio.ref_id).is('deleted_at', null).maybeSingle();
    if (!visita) return false;
    const nome = primeiroNome(visita.nome);
    await semFalhar(supabase.from('whatsapp_coletas').insert({
      whatsapp_message_id: messageId, telefone, status: 'ignorado',
      raw_text: `[visitante·flow] nota ${resp.nota}${resp.comentario ? `: ${resp.comentario}` : ''}`.slice(0, 500),
    }), '[visitante-pesquisa]');
    if (visita.pesquisa_nota != null) {

      if (resp.comentario) {
        const novo = visita.pesquisa_comentario
          ? `${visita.pesquisa_comentario}\n${resp.comentario}`.slice(0, 1000) : resp.comentario;
        await supabase.from('vis_visitas').update({ pesquisa_comentario: novo }).eq('id', visita.id);
      }
      await enviarTexto(telefone, `Sua avaliação já estava registrada, ${nome}. Obrigado! 💚`).catch(() => {});
      return true;
    }
    const agora = new Date().toISOString();
    const patch = { pesquisa_nota: resp.nota, pesquisa_respondida_em: agora, pesquisa_status: 'respondida' };
    if (resp.comentario) patch.pesquisa_comentario = resp.comentario;
    const { data: gravou } = await supabase.from('vis_visitas').update(patch)
      .eq('id', visita.id).is('pesquisa_nota', null).select('id');
    if (!gravou?.length) return true;
    try {
      const { enfileirar } = require('./whatsappFila');
      await enfileirar({ telefone: visita.telefone || telefone,
        texto: resp.comentario
          ? `Recebemos, ${nome}! 💚 Obrigado por responder e por contar como foi. Esperamos te ver de novo!`
          : textoObrigado(nome, resp.nota),
        contexto: CONTEXTO_OBRIGADO, refId: visita.id });
    } catch (e) {
      await enviarTexto(telefone, textoObrigado(nome, resp.nota)).catch(() => {});
    }
    return true;
  }

  const bruto = textoDaResposta(m);
  if (!bruto) return false;


  try {
    const optSvc = require('./whatsappOptout');
    if (optSvc.intencaoOptOut(bruto, { deBotao: m.type !== 'text' })) return false;
  } catch (e) {                            }

  const envio = wamid ? await envioPorWamid(wamid) : await envioUnicoRecente(m.from);
  if (!envio) return false;

  const messageId = m.id;
  const telefone = normalizarTelefone(m.from);
  const { data: jaVisto } = await supabase.from('whatsapp_coletas')
    .select('id').eq('whatsapp_message_id', messageId).maybeSingle();
  if (jaVisto) return true;

  const { data: visita } = await supabase.from('vis_visitas')
    .select('id, nome, telefone, pesquisa_nota, pesquisa_comentario, pesquisa_respondida_em')
    .eq('id', envio.ref_id).is('deleted_at', null).maybeSingle();
  if (!visita) return false;

  const registrar = (raw) => semFalhar(supabase.from('whatsapp_coletas').insert({
    whatsapp_message_id: messageId, telefone, raw_text: raw, status: 'ignorado',
  }), '[visitante-pesquisa]');
  const nome = primeiroNome(visita.nome);
  const nota = interpretarNotaVisitante(bruto);


  if (visita.pesquisa_nota == null) {
    if (nota == null) {

      if (!wamid) return false;


      if (ehComentario(bruto)) {
        await supabase.from('vis_visitas')
          .update({ pesquisa_comentario: String(bruto).slice(0, 1000) })
          .eq('id', visita.id).is('pesquisa_comentario', null);
        await registrar(`[visitante] comentário antes da nota: ${bruto}`.slice(0, 500));
        await enviarTexto(telefone,
          `Anotado, ${nome}, obrigado! 💚 Só falta uma coisa: toque em uma das três opções da mensagem anterior.`)
          .catch(() => {});
        return true;
      }
      await registrar(`[visitante] não interpretado: ${bruto}`.slice(0, 500));
      await enviarTexto(telefone,
        'Não entendi 🙈 Toque em uma das três opções da mensagem anterior.')
        .catch(() => {});
      return true;
    }
    const agora = new Date().toISOString();
    const { data: gravou } = await supabase.from('vis_visitas')
      .update({ pesquisa_nota: nota, pesquisa_respondida_em: agora, pesquisa_status: 'respondida' })
      .eq('id', visita.id).is('pesquisa_nota', null).select('id');
    await registrar(`[visitante] nota ${nota}: ${bruto}`.slice(0, 500));
    if (!gravou?.length) {

      return true;
    }


    try {
      const { enfileirar } = require('./whatsappFila');
      await enfileirar({ telefone: visita.telefone || telefone, texto: textoObrigado(nome, nota),
        contexto: CONTEXTO_OBRIGADO, refId: visita.id });
    } catch (e) {
      await enviarTexto(telefone, textoObrigado(nome, nota)).catch(() => {});
    }
    return true;
  }



  if (!wamid) {

    if (nota != null && m.type === 'button') {
      await registrar(`[visitante] nota repetida: ${bruto}`.slice(0, 500));
      await enviarTexto(telefone, `Sua resposta já está registrada, ${nome}. Obrigado! 💚`).catch(() => {});
      return true;
    }
    return false;
  }
  if (nota != null && !ehComentario(bruto)) {
    await registrar(`[visitante] nota repetida: ${bruto}`.slice(0, 500));
    await enviarTexto(telefone, `Sua resposta já está registrada, ${nome}. Obrigado! 💚`).catch(() => {});
    return true;
  }




  if (!comentarioNaJanela({ respondidaEm: visita.pesquisa_respondida_em })) {
    return false;
  }
  if (visita.pesquisa_comentario) {

    const novo = `${visita.pesquisa_comentario}\n${String(bruto).trim()}`.slice(0, 1000);
    await supabase.from('vis_visitas').update({ pesquisa_comentario: novo }).eq('id', visita.id);
  } else {
    await supabase.from('vis_visitas')
      .update({ pesquisa_comentario: String(bruto).trim().slice(0, 1000) })
      .eq('id', visita.id).is('pesquisa_comentario', null);
  }
  await registrar(`[visitante] comentário: ${bruto}`.slice(0, 500));

  await enviarTexto(telefone, textoComentarioRecebido(nome, visita.pesquisa_nota)).catch(() => {});
  return true;
}

module.exports = { processarRespostaVisitante, envioUnicoRecente };
