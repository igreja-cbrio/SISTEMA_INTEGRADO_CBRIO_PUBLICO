const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');
const { acharOuCriarGuardado } = require('../services/membroMatch');
const { registrarObservacaoSegura } = require('../services/identidadeProgressiva');
const {
  temAbreviacaoNome, splitNomeCompleto, validarNascimento, honeypotPreenchido,
  registrarConsentimentos, TEXTOS, cpfValido, emailValido, tirarCodigoPaisTelefone,
} = require('../services/inscricaoContrato');
const { avaliarHorarioBatismo, horariosDisponiveis, normalizarHorario } = require('../utils/batismoHorario');
const { acessibilidadeBatismo } = require('../utils/acessibilidadeBatismo');
const { horariosConfigurados, ocupacaoPorHorario, datasAbertas } = require('../services/batismoHorarios');
const { DATAS_ABERTAS_PADRAO, resolverDataBatismo, mensagemData } = require('../utils/batismoData');




const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.PUBLIC_FORM_RATE_LIMIT_MAX) || (process.env.NODE_ENV === 'production' ? 600 : 5000),
  skip: () => process.env.NODE_ENV !== 'production',
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições deste endereço. Tente novamente em alguns minutos.' },
});
router.use(limiter);




const acessoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde um instante e tente de novo.' },
});



const BUCKET_FOTOS = 'batismos';
async function listarFotosData(data) {
  const { data: arquivos, error } = await supabase.storage
    .from(BUCKET_FOTOS)
    .list(data, { limit: 200, sortBy: { column: 'name', order: 'asc' } });
  if (error) throw error;
  return (arquivos || [])
    .filter((f) => f.name && !f.name.startsWith('.'))
    .map((f) => ({
      nome: f.name,
      url: supabase.storage.from(BUCKET_FOTOS).getPublicUrl(`${data}/${f.name}`).data.publicUrl,
    }));
}

function soDigitos(v) {
  return String(v || '').replace(/\D+/g, '');
}





function quartoDomingo(year, month           ) {
  const primeiro = new Date(year, month, 1);
  const offset = (7 - primeiro.getDay()) % 7;
  return new Date(year, month, 1 + offset + 21);
}

function proximoQuartoDomingoISO() {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  let year = hoje.getFullYear();
  let month = hoje.getMonth();
  let q = quartoDomingo(year, month);
  if (q < hoje) {
    month += 1;
    if (month > 11) { year += 1; month = 0; }
    q = quartoDomingo(year, month);
  }



  return `${q.getFullYear()}-${String(q.getMonth() + 1).padStart(2, '0')}-${String(q.getDate()).padStart(2, '0')}`;
}




router.get('/proxima-data', async (_req, res) => {




  const lista = await datasAbertas(1);
  res.json({ data_batismo: (lista && lista[0]) || proximoQuartoDomingoISO() });
});



router.get('/textos', (_req, res) => {
  res.json({
    termos_lgpd: TEXTOS.termos_lgpd,
    imagem: TEXTOS.imagem,
    aviso_optin: TEXTOS.aviso_optin,
  });
});
































router.get('/horarios', async (_req, res) => {
  try {




    const lista3 = await datasAbertas(DATAS_ABERTAS_PADRAO);
    if (lista3 === null) throw new Error('datas_indisponiveis');

    const datas = lista3.length ? lista3 : [proximoQuartoDomingoISO()];
    const dataBatismo = datas[0];
    const configurados = await horariosConfigurados();
    if (configurados === null) throw new Error('catalogo_indisponivel');
    const ocup = await ocupacaoPorHorario(dataBatismo);



    const lista = horariosDisponiveis(configurados, ocup);
    let grupoUrl = null;
    try {
      const { data: cfg } = await supabase.from('batismo_config').select('grupo_url').eq('id', 1).maybeSingle();
      grupoUrl = cfg?.grupo_url || null;
    } catch {                 }



    const porData = await Promise.all(datas.map(async (d) => ({
      data_batismo: d,
      horarios: d === dataBatismo ? lista : horariosDisponiveis(configurados, await ocupacaoPorHorario(d)),
    })));

    res.json({

      data_batismo: dataBatismo,
      horarios: lista,

      datas: porData,
      grupo_url: grupoUrl,
    });
  } catch (e) {
    console.error('[publicBatismo] horarios:', e.message);
    res.status(500).json({ error: 'Erro ao listar horários' });
  }
});



router.post('/', async (req, res) => {
  try {
    const {
      nome, sobrenome, nome_completo, email, telefone, cpf, data_nascimento, sexo,
      endereco, cep, tamanho_camisa, limitacao_mobilidade, motivo,
      observacoes, horario_culto, area_kpi, fez_next,

      eh_crianca, possui_deficiencia, deficiencia_descricao,
      aceita_termos,
      consent_imagem,
      whatsapp_optin,
      qr,
    } = req.body || {};


    if (honeypotPreenchido(req.body)) return res.status(200).json({ ok: true });



    let nomeT = String(nome || '').trim();
    let sobrenomeT = String(sobrenome || '').trim();
    if (nome_completo && String(nome_completo).trim()) {
      const s = splitNomeCompleto(nome_completo);
      nomeT = s.nome;
      sobrenomeT = s.sobrenome;
    }


    if (!nomeT || nomeT.length < 2) {
      return res.status(400).json({ error: 'Informe o nome.' });
    }
    if (!sobrenomeT) {
      return res.status(400).json({ error: 'Informe o nome completo.' });
    }
    if (temAbreviacaoNome(`${nomeT} ${sobrenomeT}`)) {
      return res.status(400).json({ error: 'Escreva seu nome completo, sem abreviações.' });
    }







    const telNorm = tirarCodigoPaisTelefone(soDigitos(telefone));
    if (telNorm.length < 10 || telNorm.length > 11) {
      return res.status(400).json({ error: 'Informe um telefone valido (com DDD).' });
    }


    if (!email || !emailValido(String(email).trim())) {
      return res.status(400).json({ error: 'Informe um email valido.' });
    }
    if (!cpf || !cpfValido(cpf)) {
      return res.status(400).json({ error: 'CPF é obrigatório e precisa ser válido.' });
    }


    const nascValid = validarNascimento(data_nascimento);
    if (!nascValid) {
      return res.status(400).json({ error: 'Informe uma data de nascimento válida.' });
    }
    if (!aceita_termos) {
      return res.status(400).json({ error: 'É preciso aceitar os termos para se inscrever.' });
    }
    const camisaNorm = tamanho_camisa ? String(tamanho_camisa).trim().toUpperCase() : null;
    if (!camisaNorm || !['PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG'].includes(camisaNorm)) {
      return res.status(400).json({ error: 'Escolha o tamanho da camisa.' });
    }

    const cpfNorm = cpf ? soDigitos(cpf) : null;
    const emailNorm = String(email).trim().toLowerCase();







    let membroId = null;
    try {
      const r = await acharOuCriarGuardado({
        cpf: cpfNorm, email: emailNorm, telefone: telNorm,
        nome: `${nomeT} ${sobrenomeT}`.trim(),
        dataNascimento: nascValid,




        genero: sexo,
        status: 'visitante',
        origem: 'batismo_formulario',
      });
      membroId = r.membro_id;
    } catch (e) {
      console.error('[publicBatismo] acharOuCriarGuardado:', e.message);

    }


    if (whatsapp_optin && membroId) {
      try {
        await supabase.from('mem_membros')
          .update({ whatsapp_optin: true, whatsapp_optin_em: new Date().toISOString() })
          .eq('id', membroId).is('deleted_at', null);
      } catch (e) {
        console.warn('[publicBatismo] optin membro:', e.message);
      }
    }




    {
      const ors = [];
      if (membroId) ors.push(`membro_id.eq.${membroId}`);
      if (cpfNorm) ors.push(`cpf.eq.${cpfNorm}`);
      if (ors.length) {
        const { data: dups } = await supabase
          .from('batismo_inscricoes')
          .select('id, status')
          .or(ors.join(','))
          .in('status', ['pendente', 'confirmado'])
          .is('deleted_at', null)
          .limit(1);
        const dup = dups && dups[0];
        if (dup) {
          return res.status(200).json({
            ok: true,
            duplicado: true,
            mensagem: `Você já tem uma inscrição em andamento (status: ${dup.status}). Sua data será mantida.`,
          });
        }
      }
    }









    const { data: dataBatismo, motivo: motivoData } = resolverDataBatismo(
      req.body?.data_batismo,
      (await datasAbertas(DATAS_ABERTAS_PADRAO)) || [],
    );
    if (!dataBatismo) {
      return res.status(motivoData === 'sem_datas_abertas' ? 503 : 400)
        .json({ error: mensagemData(motivoData) });
    }



    const horarioEscolhido = normalizarHorario(horario_culto);



    const obsParts = [];
    if (motivo) obsParts.push(`Motivo: ${String(motivo).trim().slice(0, 500)}`);
    if (observacoes) obsParts.push(`Comentario: ${String(observacoes).trim().slice(0, 1000)}`);
    const cepNorm = cep ? String(cep).trim().slice(0, 20) : null;



    const sexoNorm = (() => {
      const s = sexo ? String(sexo).trim().toUpperCase() : '';
      if (s === 'M' || s === 'MASCULINO') return 'M';
      if (s === 'F' || s === 'FEMININO') return 'F';
      return null;
    })();
    if (!sexoNorm) {
      return res.status(400).json({ error: 'Selecione masculino ou feminino.' });
    }

    const AREAS_OK = ['kids', 'sede', 'bridge', 'ami', 'online'];
    const areaKpiValida = AREAS_OK.includes(area_kpi) ? area_kpi : 'sede';











    const acess = acessibilidadeBatismo({
      limitacao_mobilidade, possui_deficiencia, deficiencia_descricao,
    });
    const possuiDef = acess.possui;
    const defDescricao = acess.descricao;

    const payload = {
      nome: nomeT,
      sobrenome: sobrenomeT,
      data_nascimento: nascValid,
      cpf: cpfNorm,
      telefone: telNorm,
      email: emailNorm,
      status: 'pendente',
      data_batismo: dataBatismo,
      origem: 'publico',
      area_kpi: areaKpiValida,
      observacoes: obsParts.length ? obsParts.join('. ').slice(0, 2500) : null,
      membro_id: membroId,

      tamanho_camisa: (() => {
        const v = tamanho_camisa ? String(tamanho_camisa).trim().toUpperCase() : null;
        const validos = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG'];
        return v && validos.includes(v) ? v : null;
      })(),
      endereco: endereco ? String(endereco).trim().slice(0, 300) : null,
      horario_culto: horarioEscolhido,
      eh_crianca: !!eh_crianca,
      possui_deficiencia: possuiDef,
      deficiencia_descricao: defDescricao,

      fez_next: typeof fez_next === 'boolean' ? fez_next : null,
      cep: cepNorm,
      sexo: sexoNorm,
    };







    if (payload.horario_culto) {
      const [configurados, ocupacao] = await Promise.all([
        horariosConfigurados(),
        ocupacaoPorHorario(payload.data_batismo),
      ]);
      const av = avaliarHorarioBatismo(payload.horario_culto, { configurados, ocupacao });
      if (!av.ok) {


        return res.status(409).json({
          error: av.mensagem,
          codigo: av.motivo === 'lotado' ? 'horario_lotado' : `horario_${av.motivo}`,
          campo: 'horario_culto',
        });
      }
    }

    const { data, error } = await supabase
      .from('batismo_inscricoes')
      .insert(payload)
      .select()
      .single();
    if (error) {
      console.error('[publicBatismo] insert error:', error.message);
      return res.status(500).json({ error: 'Não foi possível registrar sua inscrição.' });
    }

    {
      const qrSlug = require('../utils/campanhaTemplates').qrSlugValido(qr);
      if (qrSlug && data?.id) {
        const { error: eQr } = await supabase.from('batismo_inscricoes').update({ qr_slug: qrSlug }).eq('id', data.id);
        if (eQr && eQr.code !== '42703') console.warn('[publicBatismo] qr_slug:', eQr.message);
      }
    }
    await registrarObservacaoSegura({
      membroId, origem: 'batismo_formulario', origemId: data.id,
      nome: `${nomeT} ${sobrenomeT}`.trim(), cpf: cpfNorm,
      telefone: telNorm, email: emailNorm, dataNascimento: nascValid,
    });




    registrarConsentimentos({
      porta: 'batismo', refId: data.id, membroId,
      ip: req.ip || null, userAgent: (req.headers['user-agent'] || '').slice(0, 300) || null,
      itens: [
        { tipo: 'termos_lgpd', aceito: true },
        { tipo: 'imagem', aceito: Boolean(consent_imagem) },
        { tipo: 'whatsapp', aceito: !!whatsapp_optin },
      ],
    }).catch((e) => console.error('[publicBatismo] consentimentos:', e.message));


    notificar({
      modulo: 'batismos',
      tipo: 'nova_inscricao_batismo',
      titulo: 'Nova inscrição de batismo',
      mensagem: `${nomeT} ${sobrenomeT} se inscreveu para o batismo de ${dataBatismo}.`,
      link: `/ministerial/integracao?tab=batismos&inscricao=${data.id}`,
      severidade: 'info',
      chaveDedup: `batismo_inscricao_${data.id}`,
      email: true,
      emailsExtra: [(process.env.CBRIO_PRIVATE_BBF059E4CEBC || 'unconfigured@example.invalid')],
    }).catch(err => console.error('[publicBatismo] notificacao falhou:', err.message));


    if (payload.eh_crianca) {
      notificar({
        modulo: 'kids',
        tipo: 'crianca_batismo',
        titulo: 'Criança para batizar',
        mensagem: `${nomeT} ${sobrenomeT} (criança) se inscreveu para o batismo de ${dataBatismo}. Entrar em contato com a família.`,
        link: '/ministerial/totem-kids/batismos',
        severidade: 'info',
        chaveDedup: `kids_batismo_${data.id}`,
      }).catch(err => console.error('[publicBatismo] notificacao kids falhou:', err.message));
    }


    let grupoUrl = null;
    try {
      const { data: cfg } = await supabase.from('batismo_config').select('grupo_url').eq('id', 1).maybeSingle();
      grupoUrl = cfg?.grupo_url || null;
    } catch {                             }

    res.status(201).json({
      ok: true,
      id: data.id,
      data_batismo: dataBatismo,
      membro_vinculado: !!membroId,
      grupo_url: grupoUrl,
    });
  } catch (e) {
    console.error('[publicBatismo] erro:', e.message);
    res.status(500).json({ error: 'Erro inesperado. Tente novamente.' });
  }
});









router.get('/acesso', acessoLimiter, async (req, res) => {
  const token = String(req.query.token || '').trim();


  if (!/^[0-9a-f]{32}$/i.test(token)) {
    return res.status(404).json({ error: 'Link inválido ou expirado. Procure a equipe.' });
  }
  try {
    const { data: insc, error } = await supabase
      .from('batismo_inscricoes')
      .select('nome, sobrenome, data_batismo, status')
      .eq('codigo_acesso', token)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) {
      console.error('[publicBatismo] acesso lookup:', error.message);
      return res.status(500).json({ error: 'Erro ao validar o acesso. Tente novamente.' });
    }
    if (!insc || ['cancelado', 'rejeitado'].includes(insc.status)) {
      return res.status(404).json({ error: 'Link inválido ou expirado. Procure a equipe.' });
    }
    let fotos = [];
    try {
      if (insc.data_batismo) fotos = await listarFotosData(insc.data_batismo);
    } catch (e) {

      console.error('[publicBatismo] acesso listar fotos:', e.message);
    }
    res.json({
      nome: `${insc.nome} ${insc.sobrenome || ''}`.trim(),
      data_batismo: insc.data_batismo,
      fotos,
    });
  } catch (e) {
    console.error('[publicBatismo] acesso erro:', e.message);
    res.status(500).json({ error: 'Erro inesperado. Tente novamente.' });
  }
});

module.exports = router;


module.exports.proximoQuartoDomingoISO = proximoQuartoDomingoISO;
