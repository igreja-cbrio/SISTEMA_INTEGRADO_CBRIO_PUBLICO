










const router = require('express').Router();
const { semFalhar } = require('../utils/semFalhar');
const crypto = require('crypto');
const freioBot = require('../utils/freioBot');
const { supabase } = require('../utils/supabase');
const { enviarTexto, normalizarTelefone } = require('../services/whatsappSend');

const { interpretarRespostaEscala, textoDaResposta, wamidRespondido } = require('../utils/respostaEscala');
const { responderEscala } = require('../services/escalaResposta');
const { CONTEXTO: CONTEXTO_ESCALA } = require('../services/escalaAviso');
const { parseConversa, responderInstitucional } = require('../services/whatsappParser');
const { safeEqual } = require('../utils/cronAuth');
const flowColeta = require('../services/whatsappFlowColeta');
const whatsappGrupos = require('../services/whatsappGrupos');
const whatsappNota = require('../services/whatsappNota');






const JANELA_CONVERSA_MIN = 60 * 24 * 7;


router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const verify = process.env.WHATSAPP_VERIFY_TOKEN;
  if (mode === 'subscribe' && verify && token && safeEqual(String(token), verify)) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});
































router.post('/', async (req, res) => {
  await processarEvento(req).catch(e => console.error('[whatsapp webhook] processar:', e.message));
  res.sendStatus(200);
});


function assinaturaValida(req) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) {



    return process.env.NODE_ENV !== 'production';
  }
  const assinatura = req.headers['x-hub-signature-256'];
  if (!assinatura || !req.rawBody) return false;
  const esperado = 'sha256=' + crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(assinatura), Buffer.from(esperado)); }
  catch { return false; }
}

async function processarEvento(req) {
  if (!assinaturaValida(req)) {
    console.warn('[whatsapp webhook] assinatura HMAC invalida · ignorando');
    return;
  }




  for (const e of (req.body?.entry || [])) {
    for (const ch of (e.changes || [])) {
      const st = ch.value?.statuses;
      if (Array.isArray(st) && st.length) {
        await processarStatuses(st).catch(err =>
          console.error('[whatsapp webhook] statuses:', err.message));
      }
    }
  }















  const { data: cfg, error: erroCfg } = await supabase
    .from('whatsapp_config')
    .select('ia_ativa, institucional, respostas_automaticas')
    .eq('id', 1).maybeSingle();
  if (erroCfg) console.warn('[whatsapp webhook] config:', erroCfg.message);



  if (freioBot.webhookDesligado({ cfg })) return;

  const entry = req.body?.entry || [];


  let processadas = 0;
  const MAX_MSGS = 20;
  for (const e of entry) {
    for (const ch of (e.changes || [])) {
      const value = ch.value || {};





      const pnid = value.metadata?.phone_number_id ? String(value.metadata.phone_number_id) : null;
      const institucional = ehNumeroBot(pnid);
      const mensagens = value.messages || [];
      for (const m of mensagens) {
        const ehTexto = m.type === 'text';
        const ehFlowReply = m.type === 'interactive' && m.interactive?.type === 'nfm_reply';


        const ehBotao = (m.type === 'interactive' && m.interactive?.type === 'button_reply') || m.type === 'button';


        const ehMidia = m.type === 'audio' || m.type === 'image' || m.type === 'document';
        if (!ehTexto && !ehFlowReply && !ehMidia && !ehBotao) continue;
        if (++processadas > MAX_MSGS) {
          console.warn('[whatsapp webhook] limite de mensagens por evento atingido · ignorando excedente');
          return;
        }




        if (institucional) {
          const assumida = await processarRespostaEscala(m).catch(err => {
            console.error('[whatsapp webhook] resposta de escala:', err.message);
            return false;
          });
          if (assumida) continue;



          const assumiuVisitante = await require('../services/visitantePesquisaResposta')
            .processarRespostaVisitante(m, { enviarTexto, normalizarTelefone })
            .catch(err => { console.error('[whatsapp webhook] pesquisa do visitante:', err.message); return false; });
          if (assumiuVisitante) continue;
        }
        if (!institucional) {
          await inboxDireto(m, pnid).catch(err =>
            console.error('[whatsapp webhook] inbox direto:', err.message));
        } else if (ehFlowReply) {
          await processarFlowReply(m).catch(err =>
            console.error('[whatsapp webhook] flow:', err.message));
        } else if (ehBotao) {
          await processarBotaoAprovacao(m).catch(err =>
            console.error('[whatsapp webhook] botao:', err.message));
        } else {
          await processarMensagem(m, cfg, pnid, erroCfg).catch(err =>
            console.error('[whatsapp webhook] mensagem:', err.message));
        }
      }
    }
  }
}




function ehNumeroBot(pnid) {
  const padrao = process.env.WHATSAPP_PHONE_NUMBER_ID;
  return !pnid || !padrao || String(pnid) === String(padrao);
}





async function tratarPesquisaSatisfacao({ telefone, texto, messageId, pnid = null, replyToWaId = null }) {
  const { data: convP } = await supabase.from('wa_conversas')
    .select('id, pesquisa_estado, protocolo').eq('telefone', telefone)
    .eq('pesquisa_estado', 'aguardando').is('deleted_at', null).maybeSingle();
  if (!convP) return false;
  const waInbox = require('../services/waInbox');
  const t = String(texto || '').trim();
  const nota = /^[0-5]$/.test(t) ? Number(t) : null;
  const agora = new Date().toISOString();
  if (nota != null) {
    await semFalhar(supabase.from('wa_mensagens').insert({
      conversa_id: convP.id, direcao: 'in', tipo: 'avaliacao', texto: t, wa_message_id: messageId,
    }), '[wa-webhook]');
    await supabase.from('wa_conversas').update({
      satisfacao: nota, satisfacao_em: agora, pesquisa_estado: 'respondida',
      last_message_at: agora, ultima_previa: `Avaliação: ${nota}/5`,
    }).eq('id', convP.id);
    const agr = `Obrigado pela sua avaliação (${nota}/5)! 🙏 Se precisar, é só chamar de novo.`;

    const rAgr = await enviarTexto(telefone, agr, pnid ? { phoneNumberId: pnid } : {}).catch(() => null);
    await waInbox.registrarOutbound({ telefone, texto: agr, tipo: 'bot', phoneNumberId: pnid, waMessageId: rAgr?.message_id || null }).catch(() => {});
  } else {

    await supabase.from('wa_conversas').update({ pesquisa_estado: 'ignorada' }).eq('id', convP.id);
    await waInbox.registrarInbound({ telefone, texto, messageId, tipo: 'text', phoneNumberId: pnid, replyToWaId }).catch(() => {});
  }
  return true;
}




async function inboxDireto(m, pnid) {
  const messageId = m.id;
  const telefone = normalizarTelefone(m.from);
  const texto = (m.text?.body
    || m.button?.text
    || m.interactive?.button_reply?.title
    || m.interactive?.list_reply?.title
    || '').slice(0, 2000);
  if (m.type === 'text') {
    const assumiu = await tratarPesquisaSatisfacao({ telefone, texto, messageId, pnid, replyToWaId: m.context?.id || null });
    if (assumiu) return;
  }
  await require('../services/waInbox').registrarInbound({
    telefone, texto, messageId,
    tipo: m.type === 'image' ? 'image' : m.type === 'audio' ? 'audio' : m.type === 'document' ? 'document' : 'text',
    mediaId: m.image?.id || m.audio?.id || m.document?.id,
    phoneNumberId: pnid,
    replyToWaId: m.context?.id || null,
  });



  await require('../services/waEquipe').atribuirPelaEquipe({ telefone, origem: 'inbox' });
}








async function processarStatuses(statuses) {
  for (const s of statuses) {
    try {
      const messageId = s?.id;
      const st = s?.status;
      if (!messageId || !st || st === 'sent') continue;
      const ts = s.timestamp
        ? new Date(Number(s.timestamp) * 1000).toISOString()
        : new Date().toISOString();
      const erroTxt = st === 'failed'
        ? String(s.errors?.[0]?.title || s.errors?.[0]?.message || s.errors?.[0]?.code || 'failed').slice(0, 300)
        : null;



      const { data: envio } = await supabase.from('whatsapp_envios')
        .select('id, contexto, telefone, ref_id, template')
        .eq('message_id', messageId).maybeSingle();

      if (envio) {
        if (st === 'delivered') {
          await supabase.from('whatsapp_envios').update({ delivered_at: ts })
            .eq('message_id', messageId).is('delivered_at', null);
        } else if (st === 'read') {

          await supabase.from('whatsapp_envios').update({ read_at: ts })
            .eq('message_id', messageId).is('read_at', null);
          await supabase.from('whatsapp_envios').update({ delivered_at: ts })
            .eq('message_id', messageId).is('delivered_at', null);
        } else if (st === 'failed') {






          const { data: mudou } = await supabase.from('whatsapp_envios')
            .update({ failed_at: ts, erro_status: erroTxt })
            .eq('message_id', messageId).is('failed_at', null)
            .select('id');





          if (mudou?.length) {
            const { avisarNaoEntregue } = require('../services/whatsappContexto');
            await avisarNaoEntregue(envio, erroTxt);
          }
        }
        continue;
      }






      const { data: chat } = await supabase.from('wa_mensagens')
        .select('id').eq('wa_message_id', messageId).maybeSingle();
      if (chat) {
        const marca = async (patch, col) => {
          const { error: eUp } = await supabase.from('wa_mensagens')
            .update(patch).eq('id', chat.id).is(col, null);
          if (eUp && eUp.code !== '42703') console.warn('[whatsapp webhook] status chat:', eUp.message);
          return eUp;
        };
        if (st === 'delivered') {
          await marca({ delivered_at: ts }, 'delivered_at');
        } else if (st === 'read') {
          await marca({ read_at: ts }, 'read_at');
          await marca({ delivered_at: ts }, 'delivered_at');
        } else if (st === 'failed') {
          const eUp = await marca({ failed_at: ts, erro_status: erroTxt }, 'failed_at');


          if (!eUp) {
            const { notificar } = require('../services/notificar');
            await notificar({
              modulo: 'conversas',
              tipo: 'whatsapp_chat_falhou',
              titulo: 'Mensagem do chat não entregue',
              mensagem: `Uma mensagem enviada pelo chat pro número ${s.recipient_id || '?'} falhou (${String(erroTxt || 'failed').slice(0, 120)}). Confira a conversa.`,
              link: '/comunicacao?tab=conversas',
              severidade: 'aviso',
              chaveDedup: `wa_chat_falha_${messageId}`,
            }).catch(() => {});
          }
        }
        continue;
      }
      await semFalhar(supabase.from('whatsapp_status_orfaos').insert({
        message_id: messageId, status: st, status_timestamp: ts, erro: erroTxt, raw: s,
      }), '[wa-webhook]');
    } catch (e) {
      console.error('[whatsapp webhook] status item:', e.message);
    }
  }
}
























async function _envioUnicoRecente(from) {
  const alvo = String(from || '').replace(/\D/g, '').slice(-8);
  if (alvo.length < 8) return null;
  const desde = new Date(Date.now() - 48 * 3600000).toISOString();
  const { data, error } = await supabase
    .from('whatsapp_envios')
    .select('id, ref_id, contexto, telefone, criado_em')
    .eq('contexto', CONTEXTO_ESCALA)
    .gte('criado_em', desde)
    .order('criado_em', { ascending: false })
    .limit(200);
  if (error) return null;
  const meus = (data || []).filter(
    (e) => String(e.telefone || '').replace(/\D/g, '').slice(-8) === alvo && e.ref_id,
  );
  return meus.length === 1 ? meus[0] : null;
}

async function processarRespostaEscala(m) {
  const wamid = wamidRespondido(m);
  const bruto = textoDaResposta(m);
  if (!bruto) return false;





  try {
    const optSvc = require('../services/whatsappOptout');
    if (optSvc.intencaoOptOut(bruto, { deBotao: m.type !== 'text' })) return false;
  } catch (e) {                                              }














  let envio = null;
  if (wamid) {
    const { data } = await supabase
      .from('whatsapp_envios').select('id, ref_id, contexto')
      .eq('message_id', wamid).eq('contexto', CONTEXTO_ESCALA).maybeSingle();
    envio = data || null;
  } else {
    envio = await _envioUnicoRecente(m.from);
  }
  if (!envio?.ref_id) return false;

  const messageId = m.id;
  const telefone = normalizarTelefone(m.from);

  const { data: jaVisto } = await supabase
    .from('whatsapp_coletas').select('id').eq('whatsapp_message_id', messageId).maybeSingle();
  if (jaVisto) return true;

  const status = interpretarRespostaEscala(bruto);
  const registrar = (raw) => semFalhar(supabase.from('whatsapp_coletas').insert({
    whatsapp_message_id: messageId, telefone, raw_text: raw, status: 'ignorado',
  }), '[wa-webhook]');



  if (!status) {







    if (!wamid) return false;
    await registrar(`[escala] não interpretado: ${bruto}`.slice(0, 500));



    await enviarTexto(telefone,
      'Não entendi 🙈 Se você NÃO vai conseguir ir, toque em *Não vou poder* na mensagem anterior ou responda com *2*. Se vai, não precisa fazer nada.')
      .catch(() => {});
    return true;
  }

  const r = await responderEscala(envio.ref_id, status, { origem: 'whatsapp' });
  await registrar(`[escala] ${status}: ${bruto}`.slice(0, 500));

  if (!r.ok) {
    await enviarTexto(telefone, 'Não consegui registrar sua resposta agora. Avise a liderança da sua área, por favor.').catch(() => {});
    return true;
  }

  await enviarTexto(telefone, status === 'confirmed'
    ? 'Presença confirmada 💚 Obrigado! Até lá.'
    : 'Tudo bem, avisamos a liderança que você não vai poder. Obrigado por avisar — assim dá tempo de encontrar alguém 🙏')
    .catch(() => {});
  return true;
}



async function processarBotaoAprovacao(m) {
  const messageId = m.id;
  const telefone = normalizarTelefone(m.from);


  const botaoId = m.type === 'button'
    ? (m.button?.text || m.button?.payload || '')
    : (m.interactive?.button_reply?.id || '');
  const { data: jaVisto } = await supabase
    .from('whatsapp_coletas').select('id').eq('whatsapp_message_id', messageId).maybeSingle();
  if (jaVisto) return;
  await require('../services/solicitacaoWpp')
    .tratarRespostaAprovacao({ telefone, texto: botaoId })
    .catch(err => console.error('[whatsapp webhook] botao aprovacao:', err.message));
  await semFalhar(supabase.from('whatsapp_coletas').insert({
    whatsapp_message_id: messageId, telefone, raw_text: botaoId, status: 'ignorado',
  }), '[wa-webhook]');
}

async function processarMensagem(m, cfg, pnid = null, erroCfg = null) {
  const messageId = m.id;
  const telefone = normalizarTelefone(m.from);

  const texto = (m.text?.body || '').slice(0, 2000);


  const { data: jaVisto } = await supabase
    .from('whatsapp_coletas').select('id').eq('whatsapp_message_id', messageId).maybeSingle();
  if (jaVisto) return;





  {
    const optSvc = require('../services/whatsappOptout');
    let bruto = texto, deBotao = false;
    if (m.type === 'button') { bruto = m.button?.text || m.button?.payload || ''; deBotao = true; }
    else if (m.type === 'interactive') { bruto = m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || m.interactive?.button_reply?.id || ''; deBotao = true; }
    const intencao = optSvc.intencaoOptOut(bruto, { deBotao });
    if (intencao) {
      const ligar = intencao === 'in';
      const r = await optSvc.aplicarOptOut({ telefone, ligar }).catch(err => { console.error('[whatsapp webhook] optout:', err.message); return null; });
      await semFalhar(supabase.from('whatsapp_coletas').insert({
        whatsapp_message_id: messageId, telefone, raw_text: (bruto || texto || '').slice(0, 2000),
        status: 'ignorado', parsed: { fonte: ligar ? 'opt_in' : 'opt_out', afetados: r?.afetados ?? 0 },
      }), '[wa-webhook]');
      await enviarTexto(telefone, ligar
        ? 'Pronto! Você voltou a receber as mensagens da CBRio. 🙏'
        : 'Pronto, você não vai mais receber mensagens da CBRio por aqui. Se mudar de ideia, responda VOLTAR.'
      ).catch(() => {});
      return;
    }
  }




  const tratadoAprov = await require('../services/solicitacaoWpp')
    .tratarRespostaAprovacao({ telefone, texto })
    .catch(err => { console.error('[whatsapp webhook] aprovacao:', err.message); return false; });
  if (tratadoAprov) {
    await semFalhar(supabase.from('whatsapp_coletas').insert({
      whatsapp_message_id: messageId, telefone, raw_text: texto, status: 'ignorado',
    }), '[wa-webhook]');
    return;
  }





  const tratadoNota = await whatsappNota
    .tratarNotaFiscal({ m, telefone, texto, messageId })
    .catch(err => { console.error('[whatsapp webhook] nota:', err.message); return false; });
  if (tratadoNota) return;



  if (m.type === 'text') {
    const assumiu = await tratarPesquisaSatisfacao({ telefone, texto, messageId, pnid, replyToWaId: m.context?.id || null });
    if (assumiu) return;
  }






  const { data: convAssumida } = await supabase.from('wa_conversas')
    .select('id').eq('telefone', telefone).eq('assumida_humano', true).is('deleted_at', null).maybeSingle();
  if (convAssumida) {
    const limColeta = new Date(Date.now() - JANELA_CONVERSA_MIN * 60 * 1000).toISOString();
    const { data: coletaViva } = await supabase.from('whatsapp_coletas')
      .select('id').eq('telefone', telefone).eq('status', 'aguardando_info').gte('created_at', limColeta).limit(1).maybeSingle();
    if (!coletaViva) {
      await require('../services/waInbox').registrarInbound({
        telefone, texto, messageId,
        tipo: m.type === 'image' ? 'image' : m.type === 'audio' ? 'audio' : m.type === 'document' ? 'document' : 'text',
        mediaId: m.image?.id || m.audio?.id || m.document?.id,
        phoneNumberId: pnid,
        replyToWaId: m.context?.id || null,
      }).catch(e => console.error('[whatsapp webhook] inbox assumida:', e.message));
      return;
    }
  }


  const { data: lider } = await supabase
    .from('whatsapp_lideres')
    .select('id, nome_exibicao, escopo, grupo_id, papel')
    .eq('telefone', telefone).eq('ativo', true).is('deleted_at', null)
    .maybeSingle();









  const podeColetar = false;


  if (!podeColetar) {


    const waInbox = require('../services/waInbox');
    await waInbox.registrarInbound({
      telefone, texto, messageId,
      tipo: m.type === 'image' ? 'image' : m.type === 'audio' ? 'audio' : m.type === 'document' ? 'document' : 'text',
      mediaId: m.image?.id || m.audio?.id || m.document?.id,
      phoneNumberId: pnid,
      replyToWaId: m.context?.id || null,
    }).catch(e => console.error('[whatsapp webhook] inbox in:', e.message));
    if (m.type !== 'text') return;










    {
      const ruido = require('../utils/ruidoInbound').classificarRuido(texto);
      if (ruido.tipo) {
        const r = await require('../services/waRuido').tratar({ telefone, texto, messageId, tipo: ruido.tipo, sinais: ruido.sinais });
        if (r.tratado) {


          if (ruido.tipo === 'nao_sou_eu') {
            await require('../services/waEquipe').atribuirPelaEquipe({ telefone, origem: 'inbox' });
          }
          return;
        }
      }
    }
















    if (!freioBot.botPodeResponder({ cfg, erroConfig: erroCfg })) {






      let botIa = { acao: 'desligado' };
      if (!erroCfg) {
        botIa = await require('../services/botIaResposta')
          .tratar({ telefone, texto, messageId, phoneNumberId: pnid, cfg })
          .catch(e => { console.error('[whatsapp webhook] bot ia:', e.message); return { acao: 'erro' }; });
      }



      if (botIa.acao === 'desligado') {
        await semFalhar(supabase.from('whatsapp_coletas').insert({
          whatsapp_message_id: messageId, telefone, raw_text: texto,
          status: 'ignorado',
          erro: erroCfg ? 'config_indisponivel' : 'respostas_automaticas_desligadas',
          modulo_destino: 'conversas',
        }), '[wa-webhook]');
      }






      if (!['responder', 'encaminhar', 'duplicado'].includes(botIa.acao)) {
        await require('../services/waEquipe').atribuirPelaEquipe({ telefone, origem: 'inbox' });
      }
      return;
    }




    if (!lider) {
      const assumiu = await require('../services/whatsappTriagem')
        .tratar({ telefone, texto })
        .catch(e => { console.error('[whatsapp webhook] triagem:', e.message); return false; });
      if (assumiu) {
        await semFalhar(supabase.from('whatsapp_coletas').insert({
          whatsapp_message_id: messageId, telefone, raw_text: texto,
          status: 'ignorado', erro: 'triagem', modulo_destino: 'conversas',
        }), '[wa-webhook]');
        return;
      }
    }

    const resposta = await responderInstitucional({ texto, institucional: cfg?.institucional });
    await supabase.from('whatsapp_coletas').insert({
      whatsapp_message_id: messageId, telefone, raw_text: texto,
      status: 'ignorado', erro: lider ? 'coleta_restrita' : 'institucional', modulo_destino: 'institucional',
    });
    const rInst = await enviarTexto(telefone, resposta);
    await waInbox.registrarOutbound({ telefone, texto: resposta, tipo: 'institucional', phoneNumberId: pnid, waMessageId: rInst?.message_id || null })
      .catch(e => console.error('[whatsapp webhook] inbox out:', e.message));
    return;
  }






  const tratadoGrupos = await whatsappGrupos
    .tratarMensagemGrupos({ m, lider, telefone, messageId })
    .catch(err => { console.error('[whatsapp webhook] grupos:', err.message); return false; });
  if (tratadoGrupos) return;
  if (m.type !== 'text') return;






  const limite = new Date(Date.now() - JANELA_CONVERSA_MIN * 60 * 1000).toISOString();
  let { data: aberta } = await supabase
    .from('whatsapp_coletas')
    .select('id, parsed, modulo_destino')
    .eq('lider_id', lider.id).eq('status', 'aguardando_info')
    .gte('created_at', limite)
    .order('created_at', { ascending: false })
    .limit(1).maybeSingle();
  if (aberta?.parsed?.fonte === 'flow') aberta = null;
  if (aberta?.parsed?.fonte === 'grupo_encontro') aberta = null;







  if (!aberta && flowColeta.pedeFormulario(texto)) {
    const podeForm = flowColeta.flowsConfigurados() && (lider.escopo || []).includes('integracao');

    const { error: dupErr } = await supabase.from('whatsapp_coletas').insert({
      whatsapp_message_id: messageId, telefone, lider_id: lider.id, raw_text: texto,
      status: 'recebido', modulo_destino: podeForm ? 'integracao' : 'desconhecido',
      erro: podeForm ? 'form_enviado' : 'orientacao',
    });
    if (dupErr) {
      if (dupErr.code === '23505') return;
      console.error('[whatsapp webhook] dedup form:', dupErr.message);
    }
    if (podeForm) {
      const fres = await flowColeta.enviarFormularioCulto(telefone, lider.nome_exibicao);


      if (fres && fres.ok === false && fres.error !== 'sem_cultos') {
        await supabase.from('whatsapp_coletas')
          .update({ erro: ('flow_fail: ' + String(fres.error || '?')).slice(0, 250) })
          .eq('whatsapp_message_id', messageId);
      }
    } else {


      const primeiro = (lider.nome_exibicao || '').split(' ')[0];
      await enviarTexto(telefone,
        `Oi${primeiro ? ', ' + primeiro : ''}! Me manda os números do encontro que eu registro. `
        + 'Ex: "12 presentes, 2 visitantes, 1 decisão". 🙏');
    }
    return;
  }


  const dica = (lider.escopo || []).length === 1 ? lider.escopo[0] : undefined;

  const dadosColetados = aberta?.parsed?.dados || {};
  const dicaEfetiva = (aberta?.modulo_destino && aberta.modulo_destino !== 'desconhecido')
    ? aberta.modulo_destino : dica;

  const r = await parseConversa({ texto, dicaModulo: dicaEfetiva, dadosColetados });


  let status;
  if (r.pronto) status = 'parseado';
  else if (r.intent === 'reportar_dado') status = 'aguardando_info';
  else status = 'recebido';

  const parsedToStore = {
    intent: r.intent, modulo: r.modulo, dados: r.dados,
    pronto: r.pronto, faltando: r.faltando, resumo: r.resumo,
  };

  if (aberta) {

    await supabase.from('whatsapp_coletas').update({
      whatsapp_message_id: messageId, raw_text: texto, parsed: parsedToStore,
      modulo_destino: r.modulo, status,
    }).eq('id', aberta.id);
  } else {
    await supabase.from('whatsapp_coletas').insert({
      whatsapp_message_id: messageId, telefone, lider_id: lider.id, raw_text: texto,
      parsed: parsedToStore, modulo_destino: r.modulo, status,
    });
  }


  const resposta = r.resposta || (r.pronto
    ? 'Recebi! Um lider vai conferir e lancar no sistema. Obrigado! 🙌'
    : 'Pode me mandar os numeros do encontro? Ex: "12 presentes, 2 visitantes, 1 decisao". 🙏');
  await enviarTexto(telefone, resposta);
}





async function processarFlowReply(m) {
  const telefone = normalizarTelefone(m.from);
  await semFalhar(supabase.from('whatsapp_coletas').insert({
    whatsapp_message_id: m.id, telefone, raw_text: '[nfm_reply descartado]',
    status: 'ignorado', erro: 'coleta_aposentada', modulo_destino: 'desconhecido',
  }), '[wa-webhook]');
  return;
  // eslint-disable-next-line no-unreachable -- código dormante da persona de coleta

  const { data: jaVisto } = await supabase
    .from('whatsapp_coletas').select('id').eq('whatsapp_message_id', m.id).maybeSingle();
  if (jaVisto) return;
  const { data: lider } = await supabase
    .from('whatsapp_lideres')
    .select('id, nome_exibicao, escopo, grupo_id, papel')
    .eq('telefone', telefone).eq('ativo', true).is('deleted_at', null)
    .maybeSingle();



  if (!lider || lider.papel !== 'coordenador') {
    await semFalhar(supabase.from('whatsapp_coletas').insert({
      whatsapp_message_id: m.id, telefone, raw_text: '[nfm_reply descartado]',
      status: 'ignorado', erro: 'coleta_restrita', modulo_destino: 'desconhecido',
    }), '[wa-webhook]');
    return;
  }
  await flowColeta.tratarFlowReply(m, telefone, lider);
}

module.exports = router;
