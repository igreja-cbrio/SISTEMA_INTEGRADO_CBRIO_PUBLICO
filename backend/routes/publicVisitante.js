




















const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { supabase } = require('../utils/supabase');
const { cultoDeAgora } = require('../services/cultoDeAgora');
const { registrarConsentimentos, TEXTOS } = require('../services/inscricaoContrato');
const {
  LOCAIS, validarVisitante, gerarCodigoVoucher, normalizarNota, primeiroNome,
} = require('../utils/visitanteRegras');
const { verificarTokenPesquisa } = require('../utils/visitanteToken');




const limiterLeitura = rateLimit({
  windowMs: 60 * 1000, max: 600, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Muitas tentativas · aguarde um instante.' },
});
const limiterEscrita = rateLimit({
  windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Muitas tentativas · aguarde um instante.' },
});

const TEXTO_LGPD_VISITANTE =
  'Autorizo a Igreja CBRio a guardar meu nome, CPF e WhatsApp para registrar ' +
  'minha visita, entregar o voucher da cafeteria e para que a equipe de ' +
  'integração fale comigo, conforme a LGPD. O CPF é usado só para não emitir ' +
  'o voucher duas vezes. Posso pedir acesso, correção ou exclusão dos meus ' +
  'dados a qualquer momento pelos canais da igreja.';

const TEXTO_OPTIN_VISITANTE =
  'Aceito receber, pelo WhatsApp informado, uma pesquisa rápida de satisfação ' +
  'sobre o culto de hoje e mensagens da equipe de integração. Posso pedir ' +
  'para parar a qualquer momento.';


async function codigoVoucherLivre() {
  for (let i = 0; i < 5; i++) {
    const cod = gerarCodigoVoucher();
    const { data } = await supabase.from('vis_visitas')
      .select('id').eq('voucher_codigo', cod).is('deleted_at', null).limit(1);
    if (!data?.length) return cod;
  }
  return null;
}


router.get('/contexto', limiterLeitura, async (req, res) => {
  try {
    const local = LOCAIS.find((l) => l.id === String(req.query.local || '').toLowerCase()) || null;
    let culto = null, aoVivo = false;
    try {
      const r = await cultoDeAgora();
      culto = r.culto ? { id: r.culto.id, nome: r.culto.nome, data: r.culto.data } : null;
      aoVivo = !!r.ao_vivo;
    } catch (e) {
      console.warn('[public/visitante/contexto] culto indisponível:', e.message);
    }
    res.json({
      ok: true,
      local: local ? { id: local.id, nome: local.nome, chamada: local.chamada } : null,
      culto, ao_vivo: aoVivo,
      textos: { lgpd: TEXTO_LGPD_VISITANTE, whatsapp: TEXTO_OPTIN_VISITANTE },
    });
  } catch (e) {
    console.error('[public/visitante/contexto]', e.message);

    res.json({ ok: false, local: null, culto: null, ao_vivo: false,
      textos: { lgpd: TEXTO_LGPD_VISITANTE, whatsapp: TEXTO_OPTIN_VISITANTE } });
  }
});


router.post('/', limiterEscrita, async (req, res) => {
  try {


    const v = validarVisitante(req.body);
    if (!v.ok) return res.status(400).json({ error: v.erro, campo: v.campo });
    const { nome, telefone, cpf, whatsapp_optin, local } = v.valores;


    let culto = null;
    try { culto = (await cultoDeAgora()).culto || null; } catch (e) {
      console.warn('[public/visitante] culto indisponível:', e.message);
    }




    const hojeBrtIni = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    const inicioDiaUtc = new Date(`${hojeBrtIni}T03:00:00Z`).toISOString();
    const { data: hoje, error: eHoje } = await supabase.from('vis_visitas')
      .select('id, voucher_codigo, voucher_status, culto_nome, culto_data, nome')
      .eq('cpf', cpf).is('deleted_at', null).gte('created_at', inicioDiaUtc)
      .order('created_at', { ascending: false }).limit(1);
    if (eHoje) console.error('[public/visitante] dedup do dia falhou:', eHoje.message);
    if (hoje?.length) {
      const j = hoje[0];
      return res.json({
        ok: true, repetida_hoje: true, visita_id: j.id, nome: primeiroNome(j.nome),
        voucher: { codigo: j.voucher_codigo, status: j.voucher_status },
        culto: j.culto_nome ? { nome: j.culto_nome, data: j.culto_data } : null,
      });
    }


    const { data: anterior, error: eAnt } = await supabase.from('vis_visitas')
      .select('id').eq('cpf', cpf).is('deleted_at', null)
      .in('voucher_status', ['emitido', 'resgatado']).limit(1);
    if (eAnt) throw eAnt;
    const jaGanhou = !!anterior?.length;


    const visitaId = crypto.randomUUID();
    await registrarConsentimentos({
      porta: 'visitante', refId: visitaId, ip: req.ip, userAgent: req.get('user-agent'),
      itens: [
        { tipo: 'termos_lgpd', aceito: true, texto: TEXTO_LGPD_VISITANTE },

        { tipo: 'whatsapp', aceito: whatsapp_optin, texto: TEXTO_OPTIN_VISITANTE || TEXTOS.whatsapp },
      ],
    });


    let membroId = null;
    try {
      const { data, error } = await supabase.rpc('fn_link_or_create_membro', {
        p_cpf: cpf, p_telefone: telefone, p_email: null, p_nome: nome,
        p_status_inicial: 'visitante', p_fonte: 'visitante_qr',
      });
      if (error) throw error;
      membroId = data || null;
    } catch (e) {


      console.error('[public/visitante] matcher falhou:', e.message);
    }


    if (membroId && whatsapp_optin) {
      await supabase.from('mem_membros')
        .update({ whatsapp_optin: true, whatsapp_optin_em: new Date().toISOString() })
        .eq('id', membroId).or('whatsapp_optin.is.null,whatsapp_optin.eq.false')
        .then(() => {}, (e) => console.warn('[public/visitante] optin:', e.message));
    }

    const voucherCodigo = jaGanhou ? null : await codigoVoucherLivre();
    const voucherStatus = jaGanhou ? 'repetido' : 'emitido';

    const { data: criada, error } = await supabase.from('vis_visitas').insert({
      id: visitaId,
      membro_id: membroId,
      culto_id: culto?.id || null,
      culto_nome: culto?.nome || null,
      culto_data: culto?.data || null,
      nome, telefone, cpf, local,
      voucher_codigo: voucherCodigo,
      voucher_status: voucherStatus,
      whatsapp_optin,
      pesquisa_status: whatsapp_optin ? 'pendente' : 'sem_optin',
      ip_origem: req.ip || null,
      user_agent: String(req.get('user-agent') || '').slice(0, 300) || null,
    }).select('id').maybeSingle();
    if (error) throw error;

    res.json({
      ok: true, repetida_hoje: false, visita_id: criada?.id || visitaId, nome: primeiroNome(nome),
      voucher: { codigo: voucherCodigo, status: voucherStatus },
      culto: culto ? { nome: culto.nome, data: culto.data } : null,
      pesquisa: whatsapp_optin ? 'depois_do_culto' : 'sem_optin',
    });
  } catch (e) {
    console.error('[public/visitante POST]', e.message);
    res.status(500).json({ error: 'Não foi possível registrar agora. Tente novamente ou procure alguém da equipe.' });
  }
});


function visitaDoToken(token) {
  return verificarTokenPesquisa(token);
}


router.get('/avaliar/:token', limiterLeitura, async (req, res) => {
  try {
    const id = visitaDoToken(req.params.token);

    if (!id) return res.status(404).json({ error: 'Link inválido.' });
    const { data, error } = await supabase.from('vis_visitas')
      .select('id, nome, culto_nome, culto_data, pesquisa_nota, pesquisa_respondida_em, pesquisa_comentario')
      .eq('id', id).is('deleted_at', null).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Link inválido.' });
    res.json({
      ok: true,
      nome: primeiroNome(data.nome),
      culto: data.culto_nome ? { nome: data.culto_nome, data: data.culto_data } : null,
      ja_respondida: !!data.pesquisa_respondida_em,
      nota: data.pesquisa_nota,



      tem_comentario: !!data.pesquisa_comentario,
    });
  } catch (e) {
    console.error('[public/visitante/avaliar GET]', e.message);
    res.status(500).json({ error: 'Não foi possível carregar a pesquisa.' });
  }
});







router.post('/avaliar/:token', limiterEscrita, async (req, res) => {
  try {
    const id = visitaDoToken(req.params.token);
    if (!id) return res.status(404).json({ error: 'Link inválido.' });
    const nota = normalizarNota(req.body?.nota);
    const comentario = String(req.body?.comentario || '').trim().slice(0, 1000) || null;


    if (!nota) {
      if (!comentario) return res.status(400).json({ error: 'Escolha uma carinha.', campo: 'nota' });


      const { data: com, error: errCom } = await supabase.from('vis_visitas')
        .update({ pesquisa_comentario: comentario })
        .eq('id', id).is('deleted_at', null)
        .not('pesquisa_respondida_em', 'is', null).is('pesquisa_comentario', null)
        .select('id');
      if (errCom) throw errCom;


      return res.json({ ok: true, comentario_gravado: !!com?.length });
    }


    const { data, error } = await supabase.from('vis_visitas')
      .update({ pesquisa_nota: nota, pesquisa_comentario: comentario,
        pesquisa_respondida_em: new Date().toISOString(), pesquisa_status: 'respondida' })
      .eq('id', id).is('deleted_at', null).is('pesquisa_respondida_em', null)
      .select('id');
    if (error) throw error;
    if (!data?.length) {
      const { data: ja } = await supabase.from('vis_visitas')
        .select('id, pesquisa_respondida_em').eq('id', id).is('deleted_at', null).maybeSingle();
      if (!ja) return res.status(404).json({ error: 'Link inválido.' });
      return res.json({ ok: true, ja_respondida: true });
    }
    res.json({ ok: true, ja_respondida: false });
  } catch (e) {
    console.error('[public/visitante/avaliar POST]', e.message);
    res.status(500).json({ error: 'Não foi possível enviar agora. Tente novamente.' });
  }
});

module.exports = router;
module.exports.TEXTO_LGPD_VISITANTE = TEXTO_LGPD_VISITANTE;
module.exports.TEXTO_OPTIN_VISITANTE = TEXTO_OPTIN_VISITANTE;
