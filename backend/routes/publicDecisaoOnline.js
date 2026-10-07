












const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { supabase } = require('../utils/supabase');
const { findCultoAtual } = require('../services/onlineCollectors');
const { registrarConsentimentos, TEXTOS } = require('../services/inscricaoContrato');
const { validarDecisao } = require('../utils/decisaoCampos');
const { verificarTokenDecisao } = require('../utils/decisaoToken');
const { hojeBRT } = require('../utils/cultoJanela');
const { bairroPorCep } = require('../services/geoBrasil');
const { canonizarBairro } = require('../services/bairroCanonico');





const DIAS_REPLAY = 7;




const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas · aguarde um instante.' },
});
router.use(limiter);

function soDigitos(s) {
  return String(s || '').replace(/\D/g, '');
}







async function ultimoCultoOnlineRecente() {
  const desde = new Date(Date.now() - 3 * 60 * 60 * 1000 - DIAS_REPLAY * 86400000)
    .toISOString().slice(0, 10);










  const { data } = await supabase
    .from('cultos')
    .select('id, data, vol_service_types!inner(name, has_online, recurrence_time)')
    .eq('vol_service_types.has_online', true)
    .gte('data', desde)
    .order('data', { ascending: false })
    .limit(60);
  if (!data?.length) return null;
  const ordenados = [...data].sort((a, b) => {
    if (a.data !== b.data) return a.data < b.data ? 1 : -1;
    const ha = a.vol_service_types?.recurrence_time || '';
    const hb = b.vol_service_types?.recurrence_time || '';
    return ha < hb ? 1 : ha > hb ? -1 : 0;
  });
  const c = ordenados[0];
  return { id: c.id, data: c.data, nome: c.vol_service_types?.name || 'Culto' };
}





async function resolverCultoOnline({ comFallback = false } = {}) {
  const culto = await findCultoAtual({ fallbackUltimoDoDia: comFallback });
  if (culto) {
    const st = culto.vol_service_types;
    if (st?.has_online) return { id: culto.id, data: culto.data, nome: st.name || 'Culto' };
  }
  return comFallback ? await ultimoCultoOnlineRecente() : null;
}























async function levarCepAoCadastro(membroId, cep) {
  if (!membroId || !cep) return;

  const { data: membro } = await supabase
    .from('mem_membros')
    .select('id, cep, bairro')
    .eq('id', membroId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!membro) return;

  const patch = {};
  if (!String(membro.cep || '').trim()) patch.cep = cep;

  if (!String(membro.bairro || '').trim()) {
    const via = await bairroPorCep(cep);
    if (via?.bairro) patch.bairro = await canonizarBairro(via.bairro);
  }

  if (!Object.keys(patch).length) return;





  let q = supabase.from('mem_membros').update(patch).eq('id', membroId);
  if (patch.cep !== undefined) q = q.or('cep.is.null,cep.eq.');
  if (patch.bairro !== undefined) q = q.or('bairro.is.null,bairro.eq.');
  await q;
}














async function cultoDoToken(token) {
  const cultoId = verificarTokenDecisao(token);
  if (!cultoId) return null;

  const { data } = await supabase
    .from('cultos')
    .select('id, data, vol_service_types!inner(name, has_online)')
    .eq('id', cultoId)
    .eq('vol_service_types.has_online', true)
    .is('deleted_at', null)
    .maybeSingle();
  if (!data) return null;

  const culto = { id: data.id, data: data.data, nome: data.vol_service_types?.name || 'Culto' };



  const agora = await resolverCultoOnline({ comFallback: true });
  return { culto, replay: !agora || agora.id !== culto.id };
}



router.get('/ativo', async (req, res) => {
  try {

    if (req.query.t) {
      const doToken = await cultoDoToken(req.query.t);
      if (doToken) {
        return res.json({
          ativo: true,



          aoVivo: !doToken.replay,
          replay: doToken.replay,
          culto: doToken.culto,
        });
      }
    }
    const aoVivoCulto = await resolverCultoOnline();
    const culto = aoVivoCulto || await resolverCultoOnline({ comFallback: true });
    res.json({ ativo: !!culto, aoVivo: !!aoVivoCulto, replay: false, culto });
  } catch (e) {
    console.error('[public/decisao-online/ativo]', e.message);
    res.json({ ativo: false, culto: null });
  }
});


router.post('/', async (req, res) => {
  try {



    const v = validarDecisao(req.body);
    if (!v.ok) return res.status(400).json({ error: v.erro, campo: v.campo });
    const { nome, dataNascimento, telefone, cep, email } = v.valores;






    const doToken = req.body?.t ? await cultoDoToken(req.body.t) : null;
    const culto = doToken?.culto || await resolverCultoOnline({ comFallback: true });





    const decidiuEm = doToken?.replay ? hojeBRT() : null;
    if (!culto) {
      return res.status(409).json({
        error: 'sem_culto_recente',
        message: 'Não conseguimos registrar agora. Fale com a gente pelo WhatsApp da igreja — sua decisão importa.',
      });
    }




    const decisaoId = crypto.randomUUID();

    await registrarConsentimentos({
      porta: 'decisao',
      refId: decisaoId,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      itens: [{ tipo: 'termos_lgpd', aceito: true, texto: TEXTOS.termos_lgpd }],
    });

    const { data: criada, error } = await supabase
      .from('cultos_decisoes_pessoas')
      .insert({
        id: decisaoId,
        culto_id: culto.id,
        nome,
        telefone,
        email,
        data_nascimento: dataNascimento,
        cep,
        decidiu_em: decidiuEm,
        tipo_decisao: 'online',
        fonte: 'form_publico',
      })


      .select('membro_id')
      .maybeSingle();
    if (error) throw error;




    await levarCepAoCadastro(criada?.membro_id, cep).catch((e) => {
      console.warn('[decisao-online] cep nao propagado:', e.message);
    });

    res.json({ ok: true, culto: { nome: culto.nome, data: culto.data } });
  } catch (e) {
    console.error('[public/decisao-online POST]', e.message);
    res.status(500).json({ error: 'Não foi possível registrar agora. Tente novamente.' });
  }
});

module.exports = router;
