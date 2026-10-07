





















const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { supabase } = require('../utils/supabase');
const { verificarTokenCulto } = require('../utils/cultoToken');
const { registrarConsentimentos } = require('../services/inscricaoContrato');



const { DIAS_JANELA, hojeBRT, estadoJanelaCulto, dataBR } = require('../utils/cultoJanela');






const TEXTO_DECLARADO_VOLUNTARIO =
  'Registro de decisão feito por voluntário da CBRio no culto, a pedido da ' +
  'pessoa e na presença dela. A pessoa informou nome e contato para que a ' +
  'equipe pastoral entre em contato sobre os primeiros passos. Consentimento ' +
  'DECLARADO PELO VOLUNTARIO (nao coletado diretamente do titular). A pessoa ' +
  'pode solicitar acesso, correcao ou exclusao dos dados pelos canais da igreja.';



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





async function abrirCulto(token) {
  const id = verificarTokenCulto(token);
  if (!id) return { erro: 404 };

  const { data: c } = await supabase
    .from('cultos')
    .select('id, data, nome, service_type_id')
    .eq('id', id)
    .maybeSingle();
  if (!c) return { erro: 404 };

  const { data: st } = await supabase
    .from('vol_service_types')
    .select('name')
    .eq('id', c.service_type_id)
    .maybeSingle();

  const { estado, dias } = estadoJanelaCulto(c.data, hojeBRT());
  return {
    culto: {
      id: c.id,
      data: c.data,
      data_br: dataBR(c.data),
      nome: st?.name || c.nome || 'Culto',



      estado,
      aberto: estado === 'aberto',
      dias_desde: dias,
      dias_janela: DIAS_JANELA,
    },
  };
}




router.get('/:token', async (req, res) => {
  try {
    const r = await abrirCulto(req.params.token);
    if (r.erro) return res.status(404).json({ error: 'Link inválido ou expirado.' });

    const { count } = await supabase
      .from('cultos_decisoes_pessoas')
      .select('id', { count: 'exact', head: true })
      .eq('culto_id', r.culto.id)
      .is('deleted_at', null);

    res.json({ ...r.culto, ja_lancadas: count || 0 });
  } catch (e) {
    console.error('[public/decisao-culto GET]', e.message);
    res.status(500).json({ error: 'Não foi possível abrir agora. Tente novamente.' });
  }
});


router.post('/:token', async (req, res) => {
  try {
    const r = await abrirCulto(req.params.token);
    if (r.erro) return res.status(404).json({ error: 'Link inválido ou expirado.' });




    if (r.culto.estado === 'antes') {
      return res.status(409).json({
        error: 'janela_nao_abriu',
        message: `O lançamento deste culto abre no dia ${r.culto.data_br}. Guarde o link até lá.`,
      });
    }
    if (!r.culto.aberto) {
      return res.status(410).json({
        error: 'janela_encerrada',
        message: `O prazo de lançamento deste culto encerrou (${DIAS_JANELA} dias). Passe os nomes para a equipe de Integração.`,
      });
    }

    const nome = String(req.body?.nome || '').trim();
    const telefone = soDigitos(req.body?.telefone);
    const semContato = req.body?.sem_contato === true;

    if (nome.length < 2) {
      return res.status(400).json({ error: 'Informe o nome da pessoa.' });
    }





    if (!semContato && (telefone.length < 10 || telefone.length > 11)) {
      return res.status(400).json({ error: 'Informe o WhatsApp com DDD (10 ou 11 dígitos), ou marque que a pessoa não quis deixar contato.' });
    }




    if (req.body?.crianca === true) {
      return res.status(400).json({
        error: 'crianca_fora_desta_porta',
        message: 'Decisão de criança é registrada pela equipe do Kids, com o responsável.',
      });
    }





    const decisaoId = crypto.randomUUID();

    await registrarConsentimentos({
      porta: 'decisao',
      refId: decisaoId,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      itens: [{ tipo: 'termos_lgpd', aceito: true, texto: TEXTO_DECLARADO_VOLUNTARIO }],
    });





    const { error } = await supabase.from('cultos_decisoes_pessoas').insert({
      id: decisaoId,
      culto_id: r.culto.id,
      nome,
      telefone: telefone || null,
      tipo_decisao: 'presencial',
      fonte: 'link_culto',
      observacoes: semContato ? 'Pessoa não quis deixar contato (lançado pelo voluntário no culto).' : null,
    });
    if (error) throw error;

    res.json({ ok: true, nome: nome.split(/\s+/)[0] });
  } catch (e) {
    console.error('[public/decisao-culto POST]', e.message);
    res.status(500).json({ error: 'Não foi possível registrar agora. Tente novamente.' });
  }
});

module.exports = router;
