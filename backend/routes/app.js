



const router   = require('express').Router();
const kidsVisitante = require('../utils/kidsVisitante');

function hojeBRTKids() {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}
const { semCache } = require('../middleware/semCache');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const { supabase } = require('../utils/supabase');
const { equipeSupervisionada, filtrarPorSupervisao, supervisionaTudo, podeSupervisionar, subareasNaArea, soEditores, somenteLeitura, papelMaior, cultoNoEscopo, gerenciaEstruturaDoTime, gerenciaAlgumaEstrutura } = require('../utils/supervisorArea');
const { ordenarPorPreferencia } = require('../utils/preferenciaRodizio');
const { normalizarEscolha } = require('../utils/elegibilidadeVol');
const { ehDiaDoCulto } = require('../utils/janelaCulto');
const { classificarCulto } = require('../utils/rodizioCulto');
const { proximasOcorrencias, proximoEncontro, ocorrenciaAnterior, ocorrenciasPassadas, janelaCorrecaoPassada } = require('../utils/agendaGrupo');
const { notificar, resolverDestinatarios } = require('../services/notificar');
const { responderEscala, STATUS_VALIDOS: STATUS_ESCALA } = require('../services/escalaResposta');
const { acoesDaNotificacao, acaoPermitida, statusDaAcao } = require('../utils/acaoNotificacao');
const { validarMensagem: validarMensagemSuporte, montarParams: montarParamsSuporte, digitos: digitosSuporte } = require('../utils/suporteApp');
const { donosDoGrupo } = require('../services/gruposDestinatarios');
const { avisarPedidoNovoNoApp } = require('../services/gruposAvisoApp');
const { dispararAuto } = require('../services/whatsappAuto');
const wpp = require('../services/whatsappService');
const { analisarOracao } = require('../services/oracaoAnalise');
const { acharOuCriarGuardado } = require('../services/membroMatch');
const campDoacao = require('../utils/campanhaDoacao');
const doacaoToken = require('../utils/doacaoToken');
const { basePublica } = require('../utils/linkInscricaoApp');
const { hojeBrt: hojeBrtCamp } = require('../services/campanhaArrecadacao');



const pagamentos = require('../services/pagamentos');

const { vincularParentesco, entrarNaFamilia, VINC_INVERSO } = require('../services/familiaVinculo');


const gruposWpp = require('../services/gruposWhatsapp');
const { baseUrl } = gruposWpp;


const { chaveMesMembro } = require('../services/nextMatricula');


const {
  podeGerenciarNext, podeEscreverNext, podeGerenciarTurmaApp, NIVEL_MINIMO_NEXT_APP,
} = require('../utils/nextGestaoApp');



const { direcionarMatricula } = require('../services/nextDirecionar');
const { horariosDisponiveis: horariosBatismoDisponiveis } = require('../utils/batismoHorario');
const {
  horariosConfigurados: batismoHorariosConfiguradosApp,
  ocupacaoPorHorario: batismoOcupacaoPorHorarioApp,
  dataProximoBatismo: dataProximoBatismoApp,
} = require('../services/batismoHorarios');
const { registrarObservacaoSegura } = require('../services/identidadeProgressiva');
const { cpfValido: cpfValidoApp, emailValido: emailValidoApp } = require('../services/inscricaoContrato');


const { inscreverEspinha, eventoEspinhaPorId, anexarConfigMenor } = require('./publicEventoExterno');
const { portasCompartilhaveis, linkDoEvento } = require('../utils/linkInscricaoApp');
const { TEXTOS: TEXTOS_INSCRICAO } = require('../services/inscricaoContrato');
const { gerarTokenComprovante } = require('../services/inscricaoComprovante');
const { chavesDaPessoa, mesclarInscricoes } = require('../utils/inscricaoDaPessoa');
const checkoutExterno = require('../utils/checkoutExterno');


const { aprovarPedidoCore } = require('./grupos');
const { cadastrarPessoaNoGrupo } = require('../services/grupoPessoaDireta');
const { ancorasDeGrupos, iniciosDeGrupos } = require('../services/grupoAncora');
const { aplicarExcecaoAgenda } = require('../services/grupoAgendaExcecao');
const { registrarEventoPedido } = require('../services/grupoPedidoEventos');
const appIdentidade = require('../services/appIdentidade');
const { acharRespostaDaPessoa } = require('../services/censoJaRespondeu');
const { anexarMarcadores } = require('../services/jornadaMarcadores');





const { sexoPara, patchDoCadastro } = require('../utils/dadosDoCadastro');
const { precisaPagerPorInclusao } = require('../utils/saudeCrianca');
const { gerarTokenIdentidade } = require('../utils/censoRespostaToken');


const {
  getModulos,
  getCargoMatrix,
  resolveEffectivePerms,
  isSuperAdminEmail,
} = require('../middleware/auth');


const { MIMES_CAPA, caminhoDaCapa, extensaoDaCapa, caminhoNovoDaCapa } = require('../utils/grupoCapaApp');


const { avaliarEntradaNoGrupo } = require('../utils/entradaGrupoApp');


async function authApp(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token não fornecido' });
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Token inválido' });
  req.user = user;
  next();
}


async function tryAuth(req, _res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    const { data: { user } } = await supabase.auth.getUser(token).catch(() => ({ data: {} }));
    req.user = user || null;
  }
  next();
}





















const { chaveLimiteApp, ehChaveAnonima } = require('../utils/appRateLimit');

const { sanearDadosApp } = require('../utils/saneamentoInscricaoApp');
const { mascaraTelefone } = require('../utils/camposContato');
const { avaliarHorarioBatismo, horariosDisponiveis } = require('../utils/batismoHorario');
const {
  horariosConfigurados: batismoHorariosConfigurados,
  ocupacaoPorHorario: batismoOcupacaoPorHorario,
  dataProximoBatismo,
} = require('../services/batismoHorarios');

const { validarEdicaoGrupoApp } = require('../utils/grupoEdicaoApp');
const { mapaDeFotos } = require('../utils/fotoVoluntario');

function limiterApp({ max, maxAnonimo, nome }) {
  const chave = (req) => chaveLimiteApp(req);
  return rateLimit({
    windowMs: 15 * 60 * 1000,

    limit: (req) => (ehChaveAnonima(chave(req)) ? maxAnonimo : max),
    keyGenerator: (req) => `${nome}:${chave(req)}`,




    skip: () => process.env.NODE_ENV !== 'production',
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muitas requisições. Tente novamente em alguns minutos.' },
  });
}





const limiterStrict = limiterApp({
  max: parseInt(process.env.APP_STRICT_RATE_LIMIT_MAX) || 30,
  maxAnonimo: parseInt(process.env.APP_STRICT_RATE_LIMIT_IP_MAX) || 120,
  nome: 'strict',
});





const limiterNormal = limiterApp({
  max: parseInt(process.env.APP_RATE_LIMIT_MAX) || 600,
  maxAnonimo: parseInt(process.env.APP_RATE_LIMIT_IP_MAX) || 10000,
  nome: 'normal',
});


































router.use(semCache);

























router.get('/versao', limiterNormal, async (_req, res) => {
  const padrao = {
    bloqueia: false,
    minima_ios: null,
    minima_android: null,
    mensagem: null,
    url_loja_ios: null,
    url_loja_android: null,
  };
  try {
    const { data, error } = await supabase
      .from('app_config')
      .select('bloqueia, versao_minima_ios, versao_minima_android, mensagem, url_loja_ios, url_loja_android')
      .eq('id', true)
      .maybeSingle();


    if (error || !data) return res.json(padrao);
    res.json({
      bloqueia: !!data.bloqueia,
      minima_ios: data.versao_minima_ios || null,
      minima_android: data.versao_minima_android || null,
      mensagem: data.mensagem || null,
      url_loja_ios: data.url_loja_ios || null,
      url_loja_android: data.url_loja_android || null,
    });
  } catch (e) {
    console.warn('[APP] /versao:', e.message);
    res.json(padrao);
  }
});


router.get('/anuncios', limiterNormal, async (_req, res) => {
  try {
    const { data } = await supabase
      .from('app_anuncios')
      .select('titulo, descricao, cor, link, created_at')
      .eq('ativo', true)
      .order('created_at', { ascending: false })
      .limit(10);
    res.json(data || []);
  } catch {
    res.json([]);
  }
});

















const limiterVisitante = limiterApp({
  max: parseInt(process.env.APP_VISITANTE_RATE_LIMIT_MAX) || 30,
  maxAnonimo: parseInt(process.env.APP_VISITANTE_RATE_LIMIT_IP_MAX) || 3000,
  nome: 'visitante',
});

router.post('/visitante', limiterVisitante, async (req, res) => {
  try {
    const { nome, telefone, email, como_conheceu } = req.body;
    if (!nome?.trim() || !telefone?.trim()) {
      return res.status(400).json({ error: 'Nome e telefone são obrigatórios' });
    }
    const resultado = await acharOuCriarGuardado({
      nome: nome.trim(), telefone, email: email?.trim() || null,
      status: 'visitante', origem: 'app_visitante',
      extra: {
        como_conheceu: como_conheceu || null,
        situacao: 'visitante', origem_cadastro: 'app',
      },
    });
    const { data, error } = await supabase.from('mem_membros')
      .select('id, nome').eq('id', resultado.membro_id).single();
    if (error) throw error;
    res.status(resultado.created ? 201 : 200).json({ ...data, criado: resultado.created });
  } catch (e) {
    console.error('[APP] visitante:', e.message);
    res.status(500).json({ error: 'Erro ao registrar visitante' });
  }
});


router.post('/checkin', authApp, limiterNormal, async (req, res) => {
  try {
    const { service_type_id, data: dataCheckin } = req.body;
    if (!service_type_id || !dataCheckin) {
      return res.status(400).json({ error: 'service_type_id e data são obrigatórios' });
    }

    const membro = await resolveMembroApp(req);

    const { data, error } = await supabase
      .from('mem_checkins')
      .insert({
        service_type_id,
        data: dataCheckin,
        membro_id: membro?.id || null,
        origem: 'app',
        registrado_por: req.user.id,
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('[APP] checkin:', e.message);
    res.status(500).json({ error: 'Erro ao registrar check-in' });
  }
});











router.post('/identidade/por-cpf', authApp, limiterStrict, async (req, res) => {
  try {
    const r = await appIdentidade.identificarPorCpf({
      cpf: req.body?.cpf,
      authUserId: req.user.id,
      email: req.user.email || null,
      ip: req.ip || null,
    });
    if (!r.ok) return res.status(r.status || 400).json({ error: r.error, codigo: r.codigo });
    res.json(r);
  } catch (e) {
    console.error('[APP] identidade/por-cpf:', e.message);
    res.status(500).json({ error: 'Não foi possível verificar seu CPF agora.' });
  }
});

router.post('/identidade/confirmar', authApp, limiterStrict, async (req, res) => {
  try {
    const r = await appIdentidade.confirmarCodigo({
      verificacaoId: req.body?.verificacao_id,
      codigo: req.body?.codigo,
      authUserId: req.user.id,
      email: req.user.email || null,
    });
    if (!r.ok) return res.status(r.status || 400).json({ error: r.error, codigo: r.codigo });
    res.json(r);
  } catch (e) {
    console.error('[APP] identidade/confirmar:', e.message);
    res.status(500).json({ error: 'Não foi possível confirmar o código agora.' });
  }
});

router.post('/identidade/completar', authApp, limiterNormal, async (req, res) => {
  try {
    const r = await appIdentidade.completarCadastro({
      payload: req.body || {},
      authUserId: req.user.id,
      email: req.user.email || null,
      ip: req.ip || null,
      userAgent: req.get('user-agent') || null,
    });
    if (!r.ok) return res.status(r.status || 400).json({ error: r.error, codigo: r.codigo, campo: r.campo, erros: r.erros });
    res.json(r);
  } catch (e) {
    console.error('[APP] identidade/completar:', e.message);
    res.status(500).json({ error: 'Não foi possível salvar seus dados agora.' });
  }
});



router.get('/identidade/status', authApp, limiterNormal, async (req, res) => {
  try {









    const exigirFicha = !appIdentidade.contaDeRevisaoLoja(req.user?.email);
    const membro = await resolveMembroApp(req).catch(() => null);
    if (!membro) {
      return res.json({
        vinculado: false,
        completo: false,
        falta: exigirFicha
          ? ['nome', 'telefone', 'nascimento', 'cpf', 'sexo']
          : ['nome', 'telefone', 'nascimento'],
        exige_cpf: exigirFicha,
      });
    }
    const falta = [];
    if (!membro.telefone) falta.push('telefone');
    if (!membro.cpf) falta.push('cpf');
    const { data: m } = await supabase.from('mem_membros')
      .select('nome, data_nascimento, genero').eq('id', membro.id).maybeSingle();
    if (!m?.data_nascimento) falta.push('nascimento');
    if (!m?.genero) falta.push('sexo');
    const nomeFraco = require('../services/membroMatch')
      .ehNomeDerivadoDeEmail(m?.nome, req.user.email || '');
    if (nomeFraco) falta.push('nome');












    let confirmouFicha = true;
    if (exigirFicha) {
      const { data: prof, error: eProf } = await supabase.from('profiles')
        .select('app_ficha_confirmada_em').eq('id', req.user.id).maybeSingle();
      if (eProf) console.warn('[APP] app_ficha_confirmada_em ausente?', eProf.message);
      else confirmouFicha = !!prof?.app_ficha_confirmada_em;
    }



    const bloqueiam = exigirFicha ? falta : falta.filter(f => f !== 'cpf' && f !== 'sexo');
    res.json({
      vinculado: true,
      completo: bloqueiam.length === 0 && confirmouFicha,
      falta,


      exige_cpf: exigirFicha,




      pode_preencher_com_vinculo: confirmouFicha,
      nome: m?.nome || membro.nome || null,
    });
  } catch (e) {
    console.error('[APP] identidade/status:', e.message);
    res.status(500).json({ error: 'Erro ao verificar seu cadastro' });
  }
});


router.get('/grupos', limiterNormal, async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('mem_grupos')
      .select('id, nome, dia_semana, horario, bairro, local, descricao, ativo')
      .eq('ativo', true)
      .order('nome');
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar grupos' });
  }
});


router.get('/membro/grupos', authApp, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    if (!membro) return res.json([]);

    const { data: participacoes } = await supabase
      .from('mem_grupo_membros')
      .select('papel, grupo:mem_grupos(id, nome, dia_semana, horario, bairro, local)')
      .eq('membro_id', membro.id)
      .eq('ativo', true);

    res.json((participacoes || []).map(p => ({ ...p.grupo, papel: p.papel })));
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar grupos do membro' });
  }
});


router.get('/membro/perfil', authApp, async (req, res) => {
  try {




    const membro = await resolveMembroApp(req);
    if (!membro) return res.json(null);

    const { data } = await supabase
      .from('mem_membros')
      .select('id, nome, telefone, email, data_nascimento, endereco, situacao, foto_url, membro_desde')
      .eq('id', membro.id)
      .maybeSingle();

    if (!data) return res.json(null);

    const { count: totalCheckins } = await supabase
      .from('mem_checkins')
      .select('*', { count: 'exact', head: true })
      .eq('membro_id', data.id);

    const { count: totalGrupos } = await supabase
      .from('mem_grupo_membros')
      .select('*', { count: 'exact', head: true })
      .eq('membro_id', data.id)
      .eq('ativo', true);

    res.json({ ...data, total_checkins: totalCheckins || 0, total_grupos: totalGrupos || 0 });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar perfil' });
  }
});


router.put('/membro/perfil', authApp, limiterNormal, async (req, res) => {
  try {
    const allowed = ['nome', 'telefone', 'data_nascimento', 'endereco'];
    const update  = Object.fromEntries(
      Object.entries(req.body).filter(([k]) => allowed.includes(k))
    );

    if ('data_nascimento' in update && !update.data_nascimento) update.data_nascimento = null;









    const saneado = sanearDadosApp(update);
    if (saneado.ajustes.length) {

      console.log(`[APP] perfil · saneado: ${saneado.ajustes.join(', ')}`);
    }
    Object.assign(update, saneado.dados);



    if ('nome' in update && !update.nome) {
      return res.status(400).json({ error: 'O nome não pode ficar vazio.', campo: 'nome' });
    }
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'Nenhum campo válido para atualizar' });
    }


    const membro = await resolveMembroApp(req);
    if (!membro) {





      if ('telefone' in update) {
        const telefonePerfil = update.telefone ? mascaraTelefone(update.telefone) : null;
        supabase.from('profiles').update({ telefone: telefonePerfil }).eq('id', req.user.id)
          .then(() => {}).catch((err) => console.log(`[APP] perfil · sync profiles.telefone (sem membro): ${err.message}`));
      }
      return res.status(404).json({ error: 'Membro não encontrado' });
    }

    const { data, error } = await supabase
      .from('mem_membros').update(update).eq('id', membro.id).select().single();
    if (error) throw error;








    if ('telefone' in update) {
      const telefonePerfil = update.telefone ? mascaraTelefone(update.telefone) : null;
      supabase.from('profiles').update({ telefone: telefonePerfil }).eq('id', req.user.id)
        .then(() => {}).catch((err) => console.log(`[APP] perfil · sync profiles.telefone: ${err.message}`));
    }

    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao atualizar perfil' });
  }
});


router.post('/membro/vincular', limiterStrict, authApp, async (req, res) => {
  try {
    const { cpf, data_nascimento } = req.body;
    if (!cpf || !data_nascimento) {
      return res.status(400).json({ error: 'CPF e data de nascimento são obrigatórios' });
    }
    const cpfDigitos = cpf.replace(/\D/g, '');





    const { data: membro } = await supabase
      .from('mem_membros')
      .select('id, nome, cpf, data_nascimento')
      .eq('cpf', cpfDigitos)
      .is('deleted_at', null)
      .maybeSingle();

    if (!membro) {
      return res.status(404).json({ error: 'CPF não encontrado em nosso cadastro' });
    }


    const normalizar = (v) => (v || '').replace(/\D/g, '');
    const nascBD  = normalizar(membro.data_nascimento);
    const nascReq = normalizar(data_nascimento);

    const nascReqISO = nascReq.length === 8
      ? `${nascReq.slice(4)}${nascReq.slice(2, 4)}${nascReq.slice(0, 2)}`
      : nascReq;
    if (nascBD !== nascReq && nascBD !== nascReqISO) {
      return res.status(400).json({ error: 'Data de nascimento não confere' });
    }





    const { data: jaVinculado } = await supabase
      .from('profiles')
      .select('id')
      .eq('membro_id', membro.id)
      .neq('id', req.user.id)
      .limit(1);
    if (jaVinculado && jaVinculado.length > 0) {
      return res.status(409).json({ error: 'Este cadastro já está vinculado a outra conta. Fale com a secretaria.' });
    }



    const { data: linked, error: linkErr } = await supabase
      .from('profiles')
      .update({ membro_id: membro.id })
      .eq('id', req.user.id)
      .select('id')
      .maybeSingle();
    if (linkErr) throw linkErr;
    if (!linked) return res.status(404).json({ error: 'Conta não encontrada. Saia e entre de novo.' });

    res.json({ ok: true, nome: membro.nome });
  } catch (e) {
    console.error('[APP] vincular:', e.message);
    res.status(500).json({ error: 'Erro ao vincular conta' });
  }
});


router.get('/voluntariado/status/:userId', authApp, async (req, res) => {
  try {
    const { data: volProfile } = await supabase
      .from('vol_profiles')
      .select('id, status, area, funcao')
      .eq('auth_user_id', req.user.id)
      .maybeSingle();

    res.json({
      voluntario: volProfile?.status === 'ativo',
      area:       volProfile?.area   || null,
      funcao:     volProfile?.funcao || null,
    });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao verificar status de voluntário' });
  }
});





router.get('/voluntariado/supervisor', authApp, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req).catch(() => null);
    if (!membro) return res.json({ supervisor: false, areas: [], somente_leitura: false, papel: null });
    const grants = await concessoesDoMembro(membro.id);
    const areas = [...new Set(grants.map(r => r.area).filter(Boolean))];



    res.json({
      supervisor: areas.length > 0, areas, somente_leitura: somenteLeitura(grants), papel: papelMaior(grants),


      gere_pessoas: gerenciaAlgumaEstrutura(grants),
    });
  } catch (e) {
    console.error('[app] voluntariado/supervisor:', e.message);
    res.status(500).json({ error: 'Erro ao verificar supervisão' });
  }
});




const TIPOS_INSCRICAO = new Set([
  'grupos', 'batismo', 'retiro', 'cursos', 'next', 'voluntariado', 'eventos',
  'aconselhamento', 'oracao', 'sos', 'contato',
]);
const TIPOS_CUIDADOS = new Set(['aconselhamento', 'oracao', 'sos']);








const LABEL_INSCRICAO_WPP = {
  grupos: 'Grupos de Conexão', batismo: 'Batismo', next: 'NEXT',
  voluntariado: 'Voluntariado',
};



const LABEL_INSCRICAO_LEAD = {
  retiro: 'Retiro', cursos: 'Cursos', eventos: 'Eventos',
};
const MODULO_LEAD = { retiro: 'eventos', cursos: 'eventos', eventos: 'eventos' };



const MODULO_POR_TIPO_INSCRICAO = {
  grupos: 'grupos', batismo: 'batismos', next: 'next', voluntariado: 'voluntariado',
};
const LINK_POR_TIPO_INSCRICAO = {
  grupos: '/grupos?tab=entrada', batismo: '/batismo',
  next: '/ministerial/next?tab=turmas', voluntariado: '/ministerial/voluntariado/inscricoes',
};














const DESTINO_CONTRATO = {
  voluntariado: {
    tabela: 'vol_inscricoes',
    mapa: { cpf: 'cpf', data_nascimento: 'data_nascimento', sexo: 'sexo' },
    sexo: 'canonico',
  },
  batismo: {
    tabela: 'batismo_inscricoes',
    mapa: { cpf: 'cpf', data_nascimento: 'data_nascimento', sexo: 'sexo' },
    sexo: 'curto',
  },
  next: {
    tabela: 'next_matriculas',
    mapa: { cpf: 'cpf', data_nascimento: 'data_nascimento', sexo: 'sexo' },
    sexo: 'canonico',
  },
};












async function completarComCadastro(tipo, membroId) {
  const destino = DESTINO_CONTRATO[tipo];
  if (!destino) return null;

  const { data: membro } = await supabase
    .from('mem_membros')
    .select('cpf, data_nascimento, genero, email, telefone')
    .eq('id', membroId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!membro) return null;

  const colunas = ['id', ...Object.values(destino.mapa)].join(', ');
  const desde = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: linha } = await supabase
    .from(destino.tabela)
    .select(colunas)
    .eq('membro_id', membroId)
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!linha) return null;

  const patch = patchDoCadastro(linha, membro, destino.mapa, { sexo: destino.sexo });
  if (!Object.keys(patch).length) return null;

  const { error } = await supabase.from(destino.tabela).update(patch).eq('id', linha.id);
  if (error) throw error;
  return { tabela: destino.tabela, campos: Object.keys(patch) };
}

const LABEL_CUIDADOS = { aconselhamento: 'aconselhamento', oracao: 'oração', sos: 'SOS' };

const SEV_CUIDADOS = { sos: 'urgente', aconselhamento: 'aviso', oracao: 'info' };

function extrairMensagem(d) {
  return d.mensagem || d.message || d.texto || d.descricao || d.obs || d.observacao || null;
}










router.get('/inscricoes/portas', authApp, limiterNormal, async (req, res) => {
  try {
    res.json({ portas: portasCompartilhaveis() });
  } catch (e) {
    console.error('[APP] inscricoes/portas:', e.message);


    res.status(500).json({ error: 'Erro ao carregar os links de inscrição' });
  }
});

router.post('/inscricoes', limiterStrict, tryAuth, async (req, res) => {
  try {
    const { tipo, ...extras } = req.body || {};
    if (!tipo) return res.status(400).json({ error: 'Tipo de inscrição é obrigatório' });
    if (!TIPOS_INSCRICAO.has(tipo)) {
      console.warn('[APP] inscricoes · tipo não reconhecido:', tipo);
      return res.status(400).json({ error: `Tipo de inscrição não reconhecido: ${tipo}` });
    }

    const ehCuidados = TIPOS_CUIDADOS.has(tipo);

    let dados = { ...extras };
    let membroId = null;







    if (true) {
      const membro = await resolveMembroApp(req).catch(() => null);
      if (membro) {
        membroId = membro.id;
        dados.membro_id = membro.id;
        if (!dados.nome && membro.nome) dados.nome = membro.nome;
        if (!dados.telefone && membro.telefone) dados.telefone = membro.telefone;
        if (!dados.cpf && membro.cpf) dados.cpf = membro.cpf;
      }

      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!membroId && typeof extras.membro_id === 'string' && UUID_RE.test(extras.membro_id)) {
        membroId = extras.membro_id;
      }
    }




    if (!ehCuidados && tipo !== 'contato') {
      const cpfDig = String(dados.cpf || '').replace(/\D+/g, '');
      if (cpfDig.length !== 11) {
        return res.status(400).json({ error: 'CPF é obrigatório pra se inscrever — complete seu CPF no perfil do app.' });
      }
      dados.cpf = cpfDig;
    }








    if (tipo === 'next') {
      const membroNext = membroId ? await resolveMembroApp(req).catch(() => null) : null;
      if (!membroNext) {
        return res.status(404).json({ error: 'Cadastro de membro não encontrado — complete seu cadastro no app.' });
      }
      const rNext = await matricularNoNextAberto({ membro: membroNext, email: req.user?.email })
        .catch((e) => { console.error('[APP] inscricoes next:', e.message); return { ok: false, error: 'Não foi possível inscrever no NEXT agora.' }; });
      if (!rNext.ok) return res.status(400).json({ error: rNext.error });
      if (rNext.matricula_id) {
        notificar({
          modulo: 'next',
          tipo: 'next_nova_inscricao',
          titulo: 'Nova inscrição no NEXT',
          mensagem: `${membroNext.nome || 'Alguém'} se inscreveu no NEXT pelo app (${rNext.turma.titulo}).`,
          link: '/ministerial/next?tab=turmas',
          chaveDedup: `next_mat_${rNext.matricula_id}`,
        }).catch(e => console.warn('[APP] inscricoes next · notificar:', e.message));
      }


    }










    if (tipo === 'batismo' && dados.horario_culto && String(dados.horario_culto).trim()) {
      const dataBat = await dataProximoBatismo();
      const [configurados, ocupacao] = await Promise.all([
        batismoHorariosConfigurados(),


        dataBat ? batismoOcupacaoPorHorario(dataBat) : Promise.resolve({}),
      ]);
      const av = avaliarHorarioBatismo(dados.horario_culto, {
        configurados: dataBat ? configurados : null,
        ocupacao,
      });
      if (!av.ok) return res.status(409).json({ error: av.mensagem });
      dados.horario_culto = av.horario;
    }


    if (tipo === 'oracao') {
      const msgOra = extrairMensagem(extras);
      if (msgOra) {
        const analise = await analisarOracao(msgOra).catch(() => null);
        if (analise) dados.analise = analise;
      }
    }






















    const saneado = sanearDadosApp(dados);
    if (saneado.ajustes.length) {

      console.log(`[APP] inscricoes · payload saneado (${tipo}): ${saneado.ajustes.join(', ')}`);
    }
    dados = saneado.dados;



















    if (tipo === 'grupos' && dados.grupo_id) {
      const { data: grupoAlvo } = await supabase
        .from('mem_grupos')
        .select('id, nome, categoria, ativo, aceitando_inscricoes, modo_inscricao, temporada, deleted_at')
        .eq('id', dados.grupo_id)
        .maybeSingle();



      let temporadaAberta = null;
      if (grupoAlvo?.temporada && String(grupoAlvo.modo_inscricao || '') !== 'sempre_aberto') {
        const { data: temp } = await supabase
          .from('mem_temporadas')
          .select('inscricoes_abertas')
          .eq('id', grupoAlvo.temporada)
          .maybeSingle();
        temporadaAberta = temp?.inscricoes_abertas === true;
      }




      let genero = dados.genero || dados.sexo || null;
      if (!genero && membroId) {
        const { data: m } = await supabase
          .from('mem_membros').select('genero').eq('id', membroId).maybeSingle();
        genero = m?.genero || null;
      }

      const veredito = avaliarEntradaNoGrupo({ grupo: grupoAlvo, genero, temporadaAberta });
      if (!veredito.ok) {
        console.log(
          `[APP] inscricoes · grupo recusado (${veredito.codigo}) · grupo=${dados.grupo_id} membro=${membroId || 'anon'}`,
        );
        return res.status(veredito.status).json({ error: veredito.erro, codigo: veredito.codigo });
      }
    }

    const { data: inserted, error } = await supabase
      .from('app_inscricoes')
      .insert({
        tipo,
        auth_user_id: req.user?.id || null,
        membro_id: membroId,
        dados,
        status: 'pendente',
      })
      .select('id')
      .single();


    if (error) {
      console.error('[APP] inscricoes · falha ao gravar:', error.message);
      return res.status(500).json({ error: 'Não foi possível registrar sua solicitação. Tente novamente.' });
    }
























    const { data: posFanout } = await supabase
      .from('app_inscricoes')
      .select('status, fanout_erro')
      .eq('id', inserted.id)
      .maybeSingle();

    if (posFanout?.status === 'erro') {
      const nomeErro = dados.nome || req.user?.email || 'Alguém';
      const sqlstate = posFanout.fanout_erro?.sqlstate || '?';
      const constr = posFanout.fanout_erro?.constraint || null;
      console.error(
        `[APP] inscricoes · fanout falhou · tipo=${tipo} id=${inserted.id} sqlstate=${sqlstate}${constr ? ` constraint=${constr}` : ''}`,
      );
      notificar({
        modulo: MODULO_POR_TIPO_INSCRICAO[tipo] || 'membresia',
        tipo: 'app_inscricao_erro',
        titulo: `Inscrição pelo app NÃO foi registrada — ${nomeErro}`,
        mensagem:
          `A solicitação de ${LABEL_INSCRICAO_WPP[tipo] || tipo} de ${nomeErro} não chegou na fila `
          + `(erro ${sqlstate}${constr ? ` em ${constr}` : ''}). A pessoa foi avisada e pode ter tentado de novo. `
          + 'Registrar à mão ou corrigir a causa.',
        link: LINK_POR_TIPO_INSCRICAO[tipo] || '/ministerial/membresia',
        severidade: 'alta',



        chaveDedup: `app_inscricao_erro_${tipo}_${membroId || req.user?.id || 'anon'}`,
      }).catch((e) => console.warn('[APP] inscricoes · notificar erro de fanout:', e.message));




      return res.status(502).json({
        error:
          'Não conseguimos concluir sua solicitação agora. Nossa equipe já foi avisada '
          + 'e vai resolver — se preferir, tente novamente em alguns minutos.',
        codigo: 'fanout_falhou',
      });
    }







    if (posFanout?.status === 'duplicado') {
      return res.status(200).json({
        ok: true,
        id: inserted.id,
        duplicado: true,
        message:
          `Você já tem uma inscrição de ${LABEL_INSCRICAO_WPP[tipo] || tipo} em andamento — `
          + 'não precisa se inscrever de novo. Nossa equipe já está com o seu pedido.',
      });
    }

















    if (membroId && DESTINO_CONTRATO[tipo]) {
      try {
        await completarComCadastro(tipo, membroId);
      } catch (e) {
        console.warn('[APP] inscricoes · completar do cadastro:', e.message);
      }
    }


















    if (tipo === 'grupos' && dados.grupo_id) {
      try {





        const desde = new Date(Date.now() - 2 * 60 * 1000).toISOString();
        let q = supabase
          .from('mem_grupo_pedidos')
          .select('id, nome, telefone, email')
          .eq('grupo_id', dados.grupo_id)
          .eq('status', 'pendente')
          .eq('origem', 'app')
          .gte('created_at', desde)
          .order('created_at', { ascending: false })
          .limit(1);
        q = membroId ? q.eq('membro_id', membroId) : q.is('membro_id', null);
        const { data: pedidos } = await q;
        const pedido = pedidos?.[0] || null;

        if (pedido) {
          const { data: grupo } = await supabase
            .from('mem_grupos')
            .select('id, nome, lider_id')
            .eq('id', dados.grupo_id)
            .maybeSingle();
          if (grupo) {
            const r = await gruposWpp.notificarLiderNovoPedido({
              grupo,
              pedidoId: pedido.id,
              pessoa: {
                nome: pedido.nome || dados.nome,
                telefone: pedido.telefone || dados.telefone,
                email: pedido.email || dados.email,
              },
            });
            if (!r?.sent) {
              console.log('[APP] inscricoes · aviso ao líder não enviado:', r?.reason || r?.status);
            }




            await avisarPedidoNovoNoApp({
              grupoId: grupo.id,
              pedidoId: pedido.id,
              grupoNome: grupo.nome,
              pessoaNome: pedido.nome || dados.nome,
            });
          }
        } else {
          console.warn('[APP] inscricoes · pedido de grupo não localizado pra avisar o líder:', inserted.id);
        }
      } catch (e) {
        console.warn('[APP] inscricoes · aviso ao líder:', e.message);
      }
    }


    if (ehCuidados) {
      const nome = dados.nome || req.user?.email || 'Alguém';
      const label = LABEL_CUIDADOS[tipo] || tipo;
      const msg = extrairMensagem(extras);
      const urgente = tipo === 'sos';
      notificar({
        modulo: 'cuidados',
        tipo: `app_pedido_${tipo}`,
        titulo: urgente ? `🆘 SOS — ${nome}` : `Novo pedido de ${label} — ${nome}`,
        mensagem: `${nome} pediu ${label} pelo app${msg ? `: "${String(msg).slice(0, 180)}"` : '.'}`,
        link: '/ministerial/cuidados?tab=acomp',
        severidade: SEV_CUIDADOS[tipo] || 'info',
        chaveDedup: `app_pedido_${inserted.id}`,
      }).catch(e => console.warn('[APP] inscricoes · notificar:', e.message));
    }











    if (tipo === 'contato') {
      const nome = dados.nome || req.user?.email || 'Alguém';
      const msg = extrairMensagem(extras);
      const assunto = dados.assunto ? ` (${String(dados.assunto).slice(0, 40)})` : '';
      notificar({
        modulo: 'cuidados',
        tipo: 'app_contato',
        titulo: `Fale Conosco — ${nome}${assunto}`,
        mensagem: `${nome} mandou uma mensagem pelo app${msg ? `: "${String(msg).slice(0, 180)}"` : '.'}`,
        link: '/ministerial/cuidados?tab=acomp',
        severidade: 'info',
        chaveDedup: `app_contato_${inserted.id}`,
      }).catch(e => console.warn('[APP] inscricoes · notificar contato:', e.message));
    }



    if (tipo === 'batismo') {
      const nome = [dados.nome, dados.sobrenome].filter(Boolean).join(' ') || req.user?.email || 'Alguém';
      notificar({
        modulo: 'batismos',
        tipo: 'nova_inscricao_batismo',
        titulo: 'Nova inscrição de batismo (app) 💧',
        mensagem: `${nome} se inscreveu pro batismo pelo app.`,
        link: '/batismo',
        severidade: 'info',
        chaveDedup: `batismo_app_${inserted.id}`,
      }).catch(e => console.warn('[APP] inscricoes · notificar batismo:', e.message));
    }


    if (tipo === 'aconselhamento') {
      try {
        await dispararAuto('cuidados_aconselhamento', {
          refId: inserted.id, telefone: dados.telefone, nome: dados.nome, origem: 'app',
        });
      } catch (e) { console.warn('[APP] aconselhamento whatsapp:', e.message); }
    }




    if (LABEL_INSCRICAO_LEAD[tipo]) {
      const nome = dados.nome || req.user?.email || 'Alguém';
      const label = LABEL_INSCRICAO_LEAD[tipo];
      const msg = extrairMensagem(extras);
      notificar({
        modulo: MODULO_LEAD[tipo] || 'eventos',
        tipo: `app_interesse_${tipo}`,
        titulo: `Interesse em ${label} — ${nome}`,
        mensagem: `${nome} demonstrou interesse em ${label} pelo app${msg ? `: "${String(msg).slice(0, 180)}"` : '.'} Entre em contato — não há inscrição confirmada.`,
        link: '/eventos',
        severidade: 'info',
        chaveDedup: `app_interesse_${inserted.id}`,
      }).catch(e => console.warn('[APP] inscricoes · notificar lead:', e.message));
    }






















    if (LABEL_INSCRICAO_WPP[tipo] && membroId) {
      try {
        const primeiroNome = String(dados.nome || '').trim().split(/\s+/)[0] || 'Olá';
        await wpp.notificarMembro(membroId, 'inscricao_confirmada', [primeiroNome, LABEL_INSCRICAO_WPP[tipo]]);
      } catch (e) {
        console.warn('[APP] inscricao wpp:', e.message);
      }
    }

    res.status(201).json({ ok: true, id: inserted.id, message: 'Solicitação recebida! Nossa equipe entrará em contato.' });
  } catch (e) {
    console.error('[APP] inscricoes:', e.message);
    res.status(500).json({ error: 'Erro ao registrar inscrição' });
  }
});























router.get('/censo', authApp, limiterNormal, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req).catch(() => null);
    if (!membro) return res.json({ pesquisa: null, motivo: 'sem_cadastro' });











    const { data: pesquisa, error: erroPesquisa } = await supabase
      .from('cen_pesquisa')
      .select('id, slug, titulo, subtitulo, fecha_em')
      .eq('status', 'aberta').is('deleted_at', null)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (erroPesquisa) {
      console.error('[APP] censo · consulta falhou:', erroPesquisa.message);
      return res.status(500).json({ pesquisa: null, motivo: 'erro_consulta' });
    }
    if (!pesquisa) return res.json({ pesquisa: null, motivo: 'nenhuma_aberta' });

    const ja = await acharRespostaDaPessoa({
      pesquisaId: pesquisa.id, membroId: membro.id, cpf: membro.cpf,
    });

    const token = ja ? null : gerarTokenIdentidade(membro.id);
    const base = process.env.PUBLIC_BASE_URL || 'https://www.cbrio.org';

    res.json({
      pesquisa: {
        slug: pesquisa.slug, titulo: pesquisa.titulo,
        subtitulo: pesquisa.subtitulo, fecha_em: pesquisa.fecha_em,
      },
      ja_respondeu: !!ja,
      respondida_em: ja?.concluida_em || null,




      token: token || null,


      url: token ? `${base}/censo/p/${pesquisa.slug}?t=${token}&canal=app` : null,
    });
  } catch (e) {
    console.error('[APP] censo:', e.message);
    res.status(500).json({ error: 'Erro ao carregar o censo' });
  }
});







async function resolveMembroApp(req) {
  const authId = req.user?.id;
  const email = req.user?.email || null;
  if (authId) {
    const { data: prof } = await supabase.from('profiles').select('membro_id').eq('id', authId).maybeSingle();
    if (prof?.membro_id) {







      const { data: m } = await supabase.from('mem_membros')
        .select('id, nome, cpf, email, telefone').eq('id', prof.membro_id)
        .is('deleted_at', null).maybeSingle();
      if (m) return m;
    }
  }
  if (email) {



    const { data: ms } = await supabase.from('mem_membros')
      .select('id, nome, cpf, email, telefone').ilike('email', email).is('deleted_at', null)
      .order('created_at', { ascending: true }).limit(1);
    if (ms && ms[0]) return ms[0];
  }



  const cpfRaw = req.user?.user_metadata?.cpf || req.user?.user_metadata?.CPF || null;
  const cpf = cpfRaw ? String(cpfRaw).replace(/\D/g, '') : '';
  if (cpf.length === 11) {
    const fmt = `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
    const { data: mc } = await supabase.from('mem_membros')
      .select('id, nome, cpf, email, telefone')
      .or(`cpf.eq.${cpf},cpf.eq.${fmt}`).is('deleted_at', null)
      .order('created_at', { ascending: true }).limit(1);
    if (mc && mc[0]) {
      if (authId) {
        try {
          await supabase.from('profiles').update({ membro_id: mc[0].id })
            .eq('id', authId).is('membro_id', null);
        } catch {                             }
      }
      return mc[0];
    }
  }
  return null;
}




async function resolverVolProfile(req, membro) {
  const sel = 'id, full_name, planning_center_id, auth_user_id, cpf, membresia_id, allocation_status';
  let { data: vp } = await supabase.from('vol_profiles').select(sel).eq('auth_user_id', req.user.id).maybeSingle();
  if (!vp) {
    const cpf = String(membro?.cpf || '').replace(/\D/g, '');
    if (cpf.length === 11) {
      const fmt = `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
      const { data } = await supabase.from('vol_profiles').select(sel).or(`cpf.eq.${cpf},cpf.eq.${fmt}`).limit(1);
      vp = (data && data[0]) || null;
    }
  }
  if (!vp && membro?.id) {
    const { data } = await supabase.from('vol_profiles').select(sel).eq('membresia_id', membro.id).maybeSingle();
    vp = data || null;
  }
  if (!vp && req.user.email) {
    const { data } = await supabase.from('vol_profiles').select(sel).ilike('email', req.user.email).limit(1);
    vp = (data && data[0]) || null;
  }

  if (vp) {
    const patch = {};
    if (!vp.auth_user_id) patch.auth_user_id = req.user.id;
    if (membro?.id && !vp.membresia_id) patch.membresia_id = membro.id;
    if (Object.keys(patch).length) {
      try { await supabase.from('vol_profiles').update(patch).eq('id', vp.id); Object.assign(vp, patch); } catch {                   }
    }
  }
  return vp;
}

async function escalasDoVoluntario(vp) {
  if (!vp) return [];
  const conds = [`volunteer_id.eq.${vp.id}`];
  if (vp.planning_center_id) conds.push(`planning_center_person_id.eq.${vp.planning_center_id}`);
  const { data: schedules } = await supabase.from('vol_schedules')
    .select('id, service_id, team_name, position_name, confirmation_status, service:vol_services(name, service_type_name, scheduled_at)')
    .or(conds.join(','));
  const agora = Date.now();
  const futuras = (schedules || [])
    .map(s => ({ ...s, service: Array.isArray(s.service) ? s.service[0] : s.service }))
    .filter(s => s.service?.scheduled_at && new Date(s.service.scheduled_at).getTime() >= agora)
    .sort((a, b) => new Date(a.service.scheduled_at).getTime() - new Date(b.service.scheduled_at).getTime());
  const ids = futuras.map(s => s.id);
  let checked = new Set();
  if (ids.length) {
    const { data: ci } = await supabase.from('vol_check_ins').select('schedule_id').in('schedule_id', ids);
    checked = new Set((ci || []).map(c => c.schedule_id));
  }
  return futuras.map(s => ({
    id: s.id, service_id: s.service_id, team_name: s.team_name, position_name: s.position_name,
    confirmation_status: s.confirmation_status, has_checkin: checked.has(s.id),
    service: s.service ? { name: s.service.name, service_type_name: s.service.service_type_name, scheduled_at: s.service.scheduled_at } : null,
  }));
}


async function historicoCheckinVoluntario(vp) {
  if (!vp) return [];
  const { data: cis } = await supabase.from('vol_check_ins')
    .select('id, checked_in_at, method, service:vol_services(name, service_type_name, scheduled_at)')
    .eq('volunteer_id', vp.id)
    .order('checked_in_at', { ascending: false })
    .limit(30);
  return (cis || []).map(c => {
    const svc = Array.isArray(c.service) ? c.service[0] : c.service;
    return {
      id: c.id, checked_in_at: c.checked_in_at, method: c.method || null,
      servico: svc?.name || svc?.service_type_name || null,
      data: svc?.scheduled_at || c.checked_in_at,
    };
  });
}


router.get('/voluntariado/me', authApp, limiterNormal, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);

    const vp = await resolverVolProfile(req, membro);


    let inscricao = null;
    const orParts = [];
    if (membro?.id) orParts.push(`membro_id.eq.${membro.id}`);
    if (req.user.email) orParts.push(`email.ilike.${req.user.email}`);
    if (orParts.length) {
      const { data: ins } = await supabase.from('vol_inscricoes')
        .select('id, status, area, ministerios_interesse, data_inscricao, enviado_lider_em, integrado_em')
        .is('deleted_at', null)
        .or(orParts.join(',')).order('data_inscricao', { ascending: false }).limit(1).maybeSingle();
      inscricao = ins || null;
    }

    const ativo = vp?.allocation_status === 'active';
    const [escalas, indispRes, prefs] = await Promise.all([
      escalasDoVoluntario(vp),
      vp ? supabase.from('vol_availability').select('*').eq('volunteer_profile_id', vp.id).order('unavailable_from') : Promise.resolve({ data: [] }),
      vp ? rodizioSemanaDosPerfis([vp.id]) : Promise.resolve({}),
    ]);

    res.json({
      membro_id: membro?.id || null,
      vol_profile_id: vp?.id || null,
      voluntario_ativo: ativo,
      inscricao,
      area: inscricao?.area || null,
      ministerios: inscricao?.ministerios_interesse || null,
      escalas,
      indisponibilidades: indispRes.data || [],

      rodizio_semana: vp ? (prefs[vp.id] ?? null) : null,
    });
  } catch (e) {
    console.error('[APP vol/me]', e.message);
    res.status(500).json({ error: 'Erro ao carregar voluntariado' });
  }
});







router.patch('/voluntariado/me/rodizio', authApp, limiterNormal, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req).catch(() => null);
    const vp = await resolverVolProfile(req, membro);
    if (!vp) return res.status(404).json({ error: 'Perfil de voluntário não encontrado' });
    const bruto = req.body ? req.body.semana : undefined;
    const semana = (bruto === null || bruto === undefined || bruto === '') ? null : Number(bruto);
    if (semana !== null && !(Number.isInteger(semana) && semana >= 1 && semana <= 4)) {
      return res.status(400).json({ error: 'Semana inválida: 1 a 4, ou vazio pra nenhuma.' });
    }
    const { error } = await supabase.from('vol_profiles').update({ rodizio_semana: semana }).eq('id', vp.id);
    if (error) {
      if (error.code === '42703') return res.status(503).json({ error: 'A preferência de semana ainda não foi liberada no banco.' });
      throw error;
    }
    res.json({ rodizio_semana: semana });
  } catch (e) {
    console.error('[APP vol/me rodizio]', e.message);
    res.status(500).json({ error: 'Erro ao salvar a preferência' });
  }
});

router.post('/voluntariado/solicitar-area', authApp, limiterStrict, async (req, res) => {
  try {
    const { areas, nome_mae } = req.body || {};
    if (!Array.isArray(areas) || areas.length === 0) {
      return res.status(400).json({ error: 'Selecione ao menos uma área' });
    }
    const membro = await resolveMembroApp(req);
    if (!membro) return res.status(404).json({ error: 'Cadastro de membro não encontrado' });


    const { data: aberta } = await supabase.from('vol_inscricoes')
      .select('id, status, area')
      .is('deleted_at', null)
      .eq('membro_id', membro.id)
      .in('status', ['inscrito', 'enviado_ministerio'])
      .limit(1).maybeSingle();
    if (aberta) {
      return res.status(409).json({
        error: 'Você já tem uma inscrição em análise. Aguarde a equipe entrar em contato.',
        jaInscrito: true, inscricao_status: aberta.status,
      });
    }

    const nomeCompleto = (membro.nome || '').trim();
    const nome = nomeCompleto.split(' ')[0] || nomeCompleto || 'Membro';
    const sobrenome = nomeCompleto.split(' ').slice(1).join(' ') || '-';


    const { error } = await supabase.from('app_inscricoes').insert({
      tipo: 'voluntariado',
      auth_user_id: req.user.id,
      status: 'pendente',
      dados: {
        nome, sobrenome, nome_completo: nomeCompleto || nome,
        cpf: membro.cpf || null, email: membro.email || req.user.email || null,
        telefone: membro.telefone || null,
        nome_mae: nome_mae || null,
        areas, membro_id: membro.id,
      },
    });
    if (error) throw error;



    try {
      const { data: vi } = await supabase.from('vol_inscricoes')
        .select('id').eq('membro_id', membro.id).eq('status', 'inscrito').is('deleted_at', null)
        .order('data_inscricao', { ascending: false }).limit(1).maybeSingle();
      await dispararAuto('voluntariado_inscricao', {
        refId: vi?.id || null,
        telefone: membro.telefone,
        nome: membro.nome,
        origem: 'app',
      });
    } catch (e) { console.warn('[APP vol/solicitar-area] whatsapp:', e.message); }

    res.status(201).json({ ok: true, message: 'Pedido enviado! A coordenação de voluntários vai falar com você.' });
  } catch (e) {
    console.error('[APP vol/solicitar-area]', e.message);
    res.status(500).json({ error: 'Erro ao enviar pedido' });
  }
});





router.post('/voluntariado/vincular-cpf', authApp, limiterStrict, async (req, res) => {
  try {
    const cpfDigitos = String(req.body?.cpf || '').replace(/\D/g, '');
    if (cpfDigitos.length !== 11) {
      return res.status(400).json({ error: 'Informe um CPF válido (11 dígitos)' });
    }
    const membro = await resolveMembroApp(req);


    const fmt = `${cpfDigitos.slice(0, 3)}.${cpfDigitos.slice(3, 6)}.${cpfDigitos.slice(6, 9)}-${cpfDigitos.slice(9)}`;
    const { data: achados } = await supabase
      .from('vol_profiles')
      .select('id, full_name, auth_user_id, membresia_id, allocation_status, status')
      .or(`cpf.eq.${cpfDigitos},cpf.eq.${fmt}`)
      .limit(1);
    const vp = (achados && achados[0]) || null;

    if (!vp) {


      if (membro?.id) {
        await supabase.from('mem_membros').update({ cpf: cpfDigitos })
          .eq('id', membro.id).or('cpf.is.null,cpf.eq.').then(() => {}, () => {});
      }
      return res.json({ found: false });
    }


    if (vp.auth_user_id && vp.auth_user_id !== req.user.id) {
      return res.status(409).json({ error: 'Este cadastro de voluntário já está vinculado a outra conta. Fale com a coordenação.' });
    }


    const patch = { auth_user_id: req.user.id };
    if (membro?.id && !vp.membresia_id) patch.membresia_id = membro.id;
    const { error: upErr } = await supabase.from('vol_profiles').update(patch).eq('id', vp.id);
    if (upErr) throw upErr;


    if (membro?.id) {
      await supabase.from('mem_membros').update({ cpf: cpfDigitos })
        .eq('id', membro.id).or('cpf.is.null,cpf.eq.').then(() => {}, () => {});
    }

    res.json({
      found: true,
      nome: vp.full_name || null,
      integrado: vp.status === 'ativo' || vp.allocation_status === 'integrado',
    });
  } catch (e) {
    console.error('[APP vol/vincular-cpf]', e.message);
    res.status(500).json({ error: 'Erro ao cruzar o CPF' });
  }
});




router.get('/voluntariado/escalas', authApp, limiterNormal, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    const vp = await resolverVolProfile(req, membro);
    const [escalas, historico] = await Promise.all([
      escalasDoVoluntario(vp),
      historicoCheckinVoluntario(vp),
    ]);
    res.json({ escalas, historico, vol_profile_id: vp?.id || null });
  } catch (e) {
    console.error('[APP vol/escalas]', e.message);
    res.status(500).json({ error: 'Erro ao buscar escalas' });
  }
});





async function responderMinhaEscala(scheduleId, status, vp, motivo) {
  const { data: escala } = await supabase.from('vol_schedules')
    .select('id, volunteer_id, planning_center_person_id, service:vol_services(scheduled_at)')
    .eq('id', scheduleId).maybeSingle();
  if (!escala) return { ok: false, status: 404, erro: 'Escala não encontrada' };




  const minha = (escala.volunteer_id && escala.volunteer_id === vp.id)
    || (escala.planning_center_person_id && escala.planning_center_person_id === vp.planning_center_id);
  if (!minha) return { ok: false, status: 403, erro: 'Esta escala não é sua.' };




  if (status === 'declined') {
    const quando = escala.service?.scheduled_at ? new Date(escala.service.scheduled_at) : null;
    if (quando && quando.getTime() < Date.now()) {
      return { ok: false, status: 400, erro: 'Esse culto já passou — não dá mais pra recusar.' };
    }
  }
  return responderEscala(scheduleId, status, { origem: 'app', motivo });
}












router.post('/voluntariado/escalas/:id/responder', authApp, limiterNormal, async (req, res) => {
  try {
    const { status, motivo } = req.body || {};
    if (!STATUS_ESCALA.includes(status)) {
      return res.status(400).json({ error: "status deve ser 'confirmed' ou 'declined'" });
    }
    const membro = await resolveMembroApp(req);
    const vp = await resolverVolProfile(req, membro);
    if (!vp) return res.status(404).json({ error: 'Perfil de voluntário não encontrado' });

    const r = await responderMinhaEscala(req.params.id, status, vp, motivo);
    if (!r.ok) return res.status(r.status || 400).json({ error: r.erro });
    res.json(r.escala);
  } catch (e) {
    console.error('[APP vol/responder]', e.message);
    res.status(500).json({ error: 'Erro ao responder escala' });
  }
});

















router.post('/suporte', authApp, limiterStrict, async (req, res) => {
  try {
    const v = validarMensagemSuporte(req.body?.mensagem);
    if (!v.ok) return res.status(400).json({ error: v.erro });

    const membro = await resolveMembroApp(req);
    const nome = membro?.nome || req.user.email || 'Alguém do app';




    const telefone = digitosSuporte(req.body?.telefone) || membro?.telefone || null;



    const { data: linha, error: insErr } = await supabase.from('app_suporte_mensagens').insert({
      membro_id: membro?.id || null,
      user_id: req.user.id,
      nome,
      telefone,
      mensagem: v.mensagem,
      app_versao: String(req.body?.app_versao || '').slice(0, 40) || null,
      plataforma: String(req.body?.plataforma || '').slice(0, 20) || null,
    }).select('id').single();
    if (insErr) throw insErr;



    let whatsapp = 'nao_configurado';
    try {
      const { data: cfg } = await supabase.from('whatsapp_config')
        .select('suporte_app_membro_id').limit(1).maybeSingle();
      const destinoId = cfg?.suporte_app_membro_id || null;
      if (!destinoId) {
        whatsapp = 'sem_destinatario';
      } else {
        const params = montarParamsSuporte({ nome, telefone, mensagem: v.mensagem });
        const r = await wpp.notificarMembro(destinoId, 'suporte_app', params);
        whatsapp = r?.ok ? 'enviado' : (r?.motivo || r?.reason || 'nao_enviado');
        if (r?.ok) {
          await supabase.from('app_suporte_mensagens')
            .update({ enviado_em: new Date().toISOString() }).eq('id', linha.id);
        }
      }
    } catch (e) {


      console.error('[APP suporte] whatsapp:', e.message);
      whatsapp = 'erro';
    }



    notificar({
      modulo: 'dashboard',
      tipo: 'suporte_app',
      titulo: `Dúvida sobre o app: ${nome}`,
      mensagem: v.mensagem.slice(0, 300),
      link: '/admin/app-analytics',
      severidade: 'info',
      chaveDedup: `suporte_app_${linha.id}`,
    }).catch((e) => console.error('[APP suporte] notificar:', e.message));



    res.status(201).json({ ok: true, id: linha.id, whatsapp });
  } catch (e) {
    console.error('[APP] suporte:', e.message);
    res.status(500).json({ error: 'Não foi possível enviar agora. Tente de novo em instantes.' });
  }
});


















router.post('/notificacoes/:id/acao', authApp, limiterNormal, async (req, res) => {
  try {
    const acao = String(req.body?.acao || '');
    const { data: n } = await supabase.from('app_notificacoes')
      .select('id, tipo, data, lida_em')
      .eq('id', req.params.id).eq('user_id', req.user.id).maybeSingle();
    if (!n) return res.status(404).json({ error: 'Notificação não encontrada' });

    const disponivel = acoesDaNotificacao(n.tipo, n.data);
    if (!acaoPermitida(n.tipo, n.data, acao)) {


      return res.status(400).json({ error: 'Ação indisponível para esta notificação', feita: disponivel.feita, acoes: disponivel.acoes });
    }

    let resultado = { ok: true };

    if (n.tipo === 'escala') {
      const membro = await resolveMembroApp(req);
      const vp = await resolverVolProfile(req, membro);
      if (!vp) return res.status(404).json({ error: 'Perfil de voluntário não encontrado' });
      const status = statusDaAcao(acao);





      const ok = [];
      const falhas = [];
      for (const id of disponivel.escalaIds) {
        const r = await responderMinhaEscala(id, status, vp, req.body?.motivo);
        (r.ok ? ok : falhas).push({ id, erro: r.erro || null });
      }


      if (!ok.length) {
        const primeira = falhas[0] || {};
        return res.status(400).json({ error: primeira.erro || 'Não foi possível responder', falhas: falhas.length });
      }

      resultado = { ok: true, respondidas: ok.length, falhas: falhas.length, total: disponivel.escalaIds.length };
    }

    if (n.tipo === 'grupo_pedido') {
      const ctx = await autorizarDecisaoPedido(req, res, disponivel.pedidoId);
      if (!ctx) return;
      if (acao === 'aprovar') {
        const user = { userId: req.user.id, name: ctx.membro?.nome || req.user.email || 'Líder' };
        const r = await aprovarPedidoCore(disponivel.pedidoId, user);
        if (!r.ok) return res.status(r.code || 400).json({ error: r.error });
        resultado = { ok: true, acao: 'aprovado' };
      } else {
        const r = await devolverPedidoParaTriagem(disponivel.pedidoId, req, ctx, req.body?.motivo);
        if (!r.ok) return res.status(r.status || 400).json({ error: r.erro });
        resultado = { ok: true, acao: r.acao };
      }
    }




    const agora = new Date().toISOString();
    await supabase.from('app_notificacoes')
      .update({ data: { ...(n.data || {}), acao, acao_em: agora }, lida_em: n.lida_em || agora })
      .eq('id', n.id).eq('user_id', req.user.id);

    res.json({ ...resultado, acao_registrada: acao });
  } catch (e) {
    console.error('[APP] notificacoes/acao:', e.message);
    res.status(500).json({ error: 'Não foi possível concluir' });
  }
});


router.get('/voluntariado/indisponibilidades', authApp, limiterNormal, async (req, res) => {
  try {
    const { data: vp } = await supabase.from('vol_profiles')
      .select('id').eq('auth_user_id', req.user.id).maybeSingle();
    if (!vp) return res.json([]);
    const { data } = await supabase.from('vol_availability')
      .select('*').eq('volunteer_profile_id', vp.id).order('unavailable_from');
    res.json(data || []);
  } catch (e) {
    console.error('[APP vol/indisp list]', e.message);
    res.status(500).json({ error: 'Erro ao buscar indisponibilidade' });
  }
});



router.post('/voluntariado/indisponibilidade', authApp, limiterNormal, async (req, res) => {
  try {
    const { service_id, inicio, fim, motivo } = req.body || {};
    const { data: vp } = await supabase.from('vol_profiles')
      .select('id').eq('auth_user_id', req.user.id).maybeSingle();
    if (!vp) return res.status(404).json({ error: 'Perfil de voluntário não encontrado' });

    let from = inicio; let to = fim || inicio;
    if (service_id) {
      const { data: s } = await supabase.from('vol_services').select('scheduled_at').eq('id', service_id).maybeSingle();
      if (!s) return res.status(404).json({ error: 'Culto não encontrado' });
      from = s.scheduled_at.split('T')[0]; to = from;
    }
    if (!from) return res.status(400).json({ error: 'Informe service_id ou inicio/fim' });

    const { data, error } = await supabase.from('vol_availability').insert({
      volunteer_profile_id: vp.id, service_id: service_id || null,
      unavailable_from: from, unavailable_to: to, reason: motivo || null,
    }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('[APP vol/indisp create]', e.message);
    res.status(500).json({ error: 'Erro ao registrar indisponibilidade' });
  }
});


router.delete('/voluntariado/indisponibilidade/:id', authApp, limiterNormal, async (req, res) => {
  try {
    const { data: vp } = await supabase.from('vol_profiles')
      .select('id').eq('auth_user_id', req.user.id).maybeSingle();
    if (!vp) return res.status(404).json({ error: 'Perfil não encontrado' });
    const { error } = await supabase.from('vol_availability')
      .delete().eq('id', req.params.id).eq('volunteer_profile_id', vp.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[APP vol/indisp delete]', e.message);
    res.status(500).json({ error: 'Erro ao remover indisponibilidade' });
  }
});














async function concessoesDoMembro(membroId) {
  const base = 'area, position_id, culto_dia, culto_periodo, culto_semana';
  let r = await supabase.from('vol_area_supervisores').select(`${base}, papel, team_id`).eq('membro_id', membroId);
  if (r.error && r.error.code === '42703') {
    r = await supabase.from('vol_area_supervisores').select(base).eq('membro_id', membroId);
  }
  if (r.error) throw r.error;
  return (r.data || []).filter(x => x.area);
}












async function supervisorAreasApp(req, { escrita = false } = {}) {
  const membro = await resolveMembroApp(req).catch(() => null);
  if (!membro) return { membro: null, areas: [], grants: [], todas: [], somente_leitura: false, papel: null };
  const todas = await concessoesDoMembro(membro.id);
  const grants = escrita ? soEditores(todas) : todas;
  return {
    membro,
    areas: [...new Set(grants.map(r => r.area))],
    grants,
    todas,
    somente_leitura: somenteLeitura(todas),
    papel: papelMaior(todas),
  };
}

function negarSupervisao(res, sup) {
  if (sup && sup.somente_leitura) {
    return res.status(403).json({ error: 'Seu acesso ao Servir é só de leitura. Fale com quem lidera o time.', somente_leitura: true });
  }
  return res.status(403).json({ error: 'Você não é supervisor de escala.' });
}







async function rodizioSemanaDosPerfis(ids) {
  const mapa = {};
  const lista = [...new Set((ids || []).filter(Boolean))];
  for (let k = 0; k < lista.length; k += 100) {
    const { data, error } = await supabase.from('vol_profiles')
      .select('id, rodizio_semana').in('id', lista.slice(k, k + 100));
    if (error) {
      if (error.code !== '42703') console.warn('[APP vol/rodizio_semana]', error.message);
      return mapa;
    }
    for (const p of data || []) mapa[p.id] = p.rodizio_semana ?? null;
  }
  return mapa;
}



















async function rodizioDoServico(serviceId) {
  if (!serviceId) return null;
  const { data } = await supabase.from('vol_services')
    .select('scheduled_at').eq('id', serviceId).maybeSingle();
  return classificarCulto(data?.scheduled_at || null);
}

async function resolverPosicaoId(teamId, positionName) {
  if (!teamId || !positionName) return null;
  const { data } = await supabase.from('vol_positions')
    .select('id').eq('team_id', teamId).eq('name', positionName).maybeSingle();
  return data?.id || null;
}














async function resolverEquipeId(teamName) {
  if (!teamName) return null;



  const { data } = await supabase.from('vol_teams')
    .select('id').eq('name', teamName).eq('is_active', true).limit(1);
  return data?.[0]?.id || null;
}








async function escalaSobSupervisao(scheduleId, grants) {
  if (supervisionaTudo(grants)) return { ok: true };
  const { data: sc } = await supabase.from('vol_schedules')
    .select('id, team_id, team_name, position_id, position_name, service_id').eq('id', scheduleId).maybeSingle();
  if (!sc) return { ok: false, motivo: 'nao_encontrada' };
  let equipe = null;
  if (sc.team_id) {
    const { data } = await supabase.from('vol_teams').select('id, name, area').eq('id', sc.team_id).maybeSingle();
    equipe = data;
  } else if (sc.team_name) {
    const { data } = await supabase.from('vol_teams').select('id, name, area').eq('name', sc.team_name).maybeSingle();
    equipe = data;
  }


  if (!equipe) return { ok: false, motivo: 'sem_equipe' };
  if (!equipeSupervisionada(equipe, grants)) {
    return { ok: false, motivo: 'outra_area', equipe: equipe.name };
  }



  const alvo = { area: equipe.area, team_id: equipe.id, position_id: sc.position_id || null, culto: await rodizioDoServico(sc.service_id) };
  if (!podeSupervisionar(grants, alvo)) {
    return { ok: false, motivo: 'outra_subarea', equipe: equipe.name, subarea: sc.position_name || null };
  }
  return { ok: true };
}


router.get('/voluntariado/escala/servicos', authApp, limiterNormal, async (req, res) => {
  try {
    const sup = await supervisorAreasApp(req);
    const { areas, grants } = sup;
    if (!areas.length) return negarSupervisao(res, sup);
    const hoje = new Date(Date.now() - 12 * 3600 * 1000).toISOString();







    const ate = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString();
    const { data, error } = await supabase
      .from('vol_services')
      .select('id, service_type_name, scheduled_at')
      .gte('scheduled_at', hoje)
      .lte('scheduled_at', ate)
      .order('scheduled_at', { ascending: true })
      .limit(400);
    if (error) throw error;

    const ids = (data || []).map(s => s.id);
    const cnt = {};
    if (ids.length) {
      const { data: scs } = await supabase.from('vol_schedules').select('service_id').in('service_id', ids);
      for (const r of scs || []) cnt[r.service_id] = (cnt[r.service_id] || 0) + 1;
    }


    const servicos = (data || []).filter(sv => cultoNoEscopo(grants, classificarCulto(sv.scheduled_at)));
    res.json({
      areas,
      somente_leitura: sup.somente_leitura,
      papel: sup.papel,
      servicos: servicos.map(sv => ({ ...sv, escalados: cnt[sv.id] || 0 })),
    });
  } catch (e) {
    console.error('[APP vol/escala servicos]', e.message);
    res.status(500).json({ error: 'Erro ao listar cultos' });
  }
});





router.get('/voluntariado/escala/:serviceId', authApp, limiterNormal, async (req, res) => {
  try {
    const sup = await supervisorAreasApp(req);
    const { areas, grants } = sup;
    if (!areas.length) return negarSupervisao(res, sup);
    const [{ data, error }, { data: composicao, error: composicaoErr }] = await Promise.all([
      supabase
      .from('vol_schedules')


      .select('id, volunteer_id, volunteer_name, team_id, team_name, position_id, position_name, confirmation_status, recusa_motivo')
      .eq('service_id', req.params.serviceId)
      .order('team_name', { ascending: true })
      .order('volunteer_name', { ascending: true }),
      supabase
        .from('vol_escala_culto_itens')
        .select('team_id, position_id, quantidade, team:vol_teams(id,name,area), position:vol_positions(id,name)')
        .eq('service_id', req.params.serviceId)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true }),
    ]);
    if (error) throw error;
    if (composicaoErr) throw composicaoErr;
    const todosItens = (composicao || []).map(item => {
      const team = Array.isArray(item.team) ? item.team[0] : item.team;
      const position = Array.isArray(item.position) ? item.position[0] : item.position;
      return {
        team_id: item.team_id,
        team_name: team?.name || 'Sem equipe',
        area: team?.area || null,
        position_id: item.position_id || null,
        position_name: position?.name || null,
        quantidade: item.quantidade || 1,
      };
    });









    const rodizio = await rodizioDoServico(req.params.serviceId);
    const itens = (todosItens || []).filter(i => podeSupervisionar(grants, {
      area: i.area, team_id: i.team_id, position_id: i.position_id, culto: rodizio,
    }));



    const equipesVisiveis = new Set(itens.map(i => i.team_id).filter(Boolean));
    const nomesVisiveis = new Set(itens.map(i => i.team_name));




    const posicoesVisiveis = new Set(itens.map(i => i.position_id).filter(Boolean));
    const recortaSubarea = itens.some(i => i.position_id) && !supervisionaTudo(grants)
      && (data || []).some(e => e.position_id);
    const escalasVisiveis = supervisionaTudo(grants)
      ? (data || [])
      : (data || [])
        .filter(e => equipesVisiveis.has(e.team_id) || nomesVisiveis.has(e.team_name))
        .filter(e => !recortaSubarea || !e.position_id || posicoesVisiveis.has(e.position_id));









    const areaPorEquipeResp = {};
    {
      const { data: eqs } = await supabase.from('vol_teams').select('id, name, area');
      for (const t of eqs || []) {
        if (t.id) areaPorEquipeResp[t.id] = t.area || null;
        if (t.name) areaPorEquipeResp[`n:${t.name}`] = t.area || null;
      }
    }














    const idsVol = (escalasVisiveis || []).map(e => e.volunteer_id);
    const fotoPorVol = await mapaDeFotos(supabase, idsVol);

    const comArea = (escalasVisiveis || []).map((e) => ({
      ...e,
      area: areaPorEquipeResp[e.team_id] ?? areaPorEquipeResp[`n:${e.team_name}`] ?? null,
      foto_url: e.volunteer_id ? (fotoPorVol[e.volunteer_id] || null) : null,
    }));

    res.json({
      escalas: comArea,







      escala: comArea,
      composicao: itens.map(i => ({ ...i, area: i.area || 'Sem área' })),
      areas_supervisionadas: areas,
      somente_leitura: sup.somente_leitura,
      papel: sup.papel,


      ocultos: todosItens.length - itens.length,
    });
  } catch (e) {
    console.error('[APP vol/escala get]', e.message);
    res.status(500).json({ error: 'Erro ao carregar a escala' });
  }
});










router.get('/voluntariado/escala-pool', authApp, limiterNormal, async (req, res) => {
  try {
    const sup = await supervisorAreasApp(req);
    const { areas, grants } = sup;
    if (!areas.length) return negarSupervisao(res, sup);
    const q = String(req.query.q || '').trim();
    const serviceId = String(req.query.service_id || '').trim() || null;
    const teamId = String(req.query.team_id || '').trim() || null;
    const culto = serviceId ? await rodizioDoServico(serviceId) : null;
    const semana = culto && culto.semana ? Number(culto.semana) : null;

    let pessoas = [];
    if (teamId) {
      const { data: eq } = await supabase.from('vol_teams').select('id, name, area').eq('id', teamId).maybeSingle();
      if (!eq) return res.status(404).json({ error: 'Equipe não encontrada' });
      if (!equipeSupervisionada(eq, grants)) {
        return res.status(403).json({ error: `Você não supervisiona ${eq.name}.` });
      }
      const { data: vinc, error: vErr } = await supabase.from('vol_team_members')
        .select('volunteer_profile_id, position_id, position:vol_positions(id, name)')
        .eq('team_id', teamId).eq('is_active', true)
        .not('volunteer_profile_id', 'is', null);
      if (vErr) throw vErr;




      const ids = [...new Set((vinc || []).map(v => v.volunteer_profile_id))];
      const posPor = {};
      for (const v of vinc || []) {
        const pos = Array.isArray(v.position) ? v.position[0] : v.position;
        if (!pos || !pos.id) continue;
        const lista = (posPor[v.volunteer_profile_id] ||= []);
        if (!lista.some(x => x.id === pos.id)) lista.push({ id: pos.id, name: pos.name || null });
      }

      for (let k = 0; k < ids.length; k += 100) {
        let query = supabase.from('vol_profiles')
          .select('id, full_name, planning_center_id')
          .in('id', ids.slice(k, k + 100)).eq('arquivado', false);
        if (q) query = query.ilike('full_name', `%${q}%`);
        const { data, error } = await query;
        if (error) throw error;
        for (const p of data || []) pessoas.push({ ...p, do_time: true, posicoes: posPor[p.id] || [] });
      }
    } else {
      let query = supabase.from('vol_profiles')
        .select('id, full_name, planning_center_id').eq('arquivado', false)
        .order('full_name').limit(30);
      if (q) query = query.ilike('full_name', `%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      pessoas = (data || []).map(p => ({ ...p, do_time: false }));
    }

    const pref = await rodizioSemanaDosPerfis(pessoas.map(p => p.id));
    const comPref = pessoas.map(p => ({ ...p, rodizio_semana: pref[p.id] ?? null }));
    res.json(ordenarPorPreferencia(comPref, semana));
  } catch (e) {
    console.error('[APP vol/escala pool]', e.message);
    res.status(500).json({ error: 'Erro ao buscar voluntários' });
  }
});




router.get('/voluntariado/voluntario/:id/detalhe', authApp, limiterNormal, async (req, res) => {
  try {
    const { areas } = await supervisorAreasApp(req);
    if (!areas.length) return res.status(403).json({ error: 'Você não é supervisor de escala.' });
    const { data: vp } = await supabase.from('vol_profiles')
      .select('id, full_name, planning_center_id, membresia_id, phone, avatar_url').eq('id', req.params.id).maybeSingle();
    if (!vp) return res.status(404).json({ error: 'Voluntário não encontrado' });


    let telefone = null;
    if (vp.membresia_id) {
      const { data: m } = await supabase.from('mem_membros').select('telefone').eq('id', vp.membresia_id).maybeSingle();
      telefone = m?.telefone || null;
    }
    if (!telefone) telefone = vp.phone || null;
    if (!telefone && vp.planning_center_id) {
      try { const { fetchPcoPhone } = require('../services/planningCenter'); telefone = await fetchPcoPhone(vp.planning_center_id); } catch {                   }
    }

    const { data: schedsRaw } = await supabase.from('vol_schedules')
      .select('id, team_name, position_name, confirmation_status, service:vol_services(service_type_name, scheduled_at)')
      .eq('volunteer_id', vp.id).limit(100);
    const escalas = (schedsRaw || [])
      .map((s) => ({ culto: s.service?.service_type_name || null, data: s.service?.scheduled_at || null, equipe: s.team_name, posicao: s.position_name, status: s.confirmation_status }))
      .sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')))
      .slice(0, 40);

    const { data: cisRaw } = await supabase.from('vol_check_ins')
      .select('id, created_at, service:vol_services(service_type_name, scheduled_at)')
      .eq('volunteer_id', vp.id).limit(100);
    const checkins = (cisRaw || [])
      .map((c) => ({ culto: c.service?.service_type_name || null, data: c.service?.scheduled_at || c.created_at || null }))
      .sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')))
      .slice(0, 40);

    const equipes = [...new Set((schedsRaw || []).map((s) => s.team_name).filter(Boolean))];

    res.json({
      id: vp.id, full_name: vp.full_name, avatar_url: vp.avatar_url || null,
      telefone, equipes, total_checkins: checkins.length, total_escalas: escalas.length, checkins, escalas,
    });
  } catch (e) {
    console.error('[APP vol/voluntario detalhe]', e.message);
    res.status(500).json({ error: 'Erro ao carregar o voluntário' });
  }
});





















async function exigirGestorServir(req, res) {
  const sup = await supervisorAreasApp(req, { escrita: true });
  if (sup.papel !== 'admin' && !gerenciaAlgumaEstrutura(sup.grants)) {
    res.status(403).json({ error: 'Só quem lidera um time gerencia as pessoas dele.' });
    return null;
  }
  sup.admin = sup.papel === 'admin';
  return sup;
}
function _gerenciaTime(sup, equipe) {
  return sup.admin || gerenciaEstruturaDoTime(sup.grants, equipe);
}
async function _timeDoVinculo(vinculoId) {
  const { data: v } = await supabase.from('vol_team_members')
    .select('id, team_id, volunteer_profile_id, team:vol_teams(id, name, area)').eq('id', vinculoId).maybeSingle();
  if (!v) return null;
  return { ...v, team: _um(v.team) };
}
const SEL_VINCULO = 'id, team_id, position_id, volunteer_profile_id, volunteer_name, is_active, service_type_ids, team:vol_teams(id, name, area, is_active), position:vol_positions(id, name)';
function _um(x) { return Array.isArray(x) ? x[0] : x; }
function _vinculoResp(v) {
  const team = _um(v.team); const position = _um(v.position);
  return {
    id: v.id, team_id: v.team_id, team_name: team?.name || null, team_area: team?.area || null,
    position_id: v.position_id || null, position_name: position?.name || null,
    service_type_ids: Array.isArray(v.service_type_ids) && v.service_type_ids.length ? v.service_type_ids.map(String) : null,
    is_active: v.is_active !== false,
  };
}
async function _tiposAtivos() {
  const { data } = await supabase.from('vol_service_types')
    .select('id, name, recurrence_day, recurrence_time, is_active').eq('is_active', true).order('name');
  return (data || []).map((t) => ({ id: t.id, name: t.name, recurrence_day: t.recurrence_day ?? null, recurrence_time: t.recurrence_time ?? null }));
}


router.get('/voluntariado/admin/pessoas', authApp, limiterNormal, async (req, res) => {
  try {
    const sup = await exigirGestorServir(req, res);
    if (!sup) return;
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json([]);
    const { data: perfis, error } = await supabase.from('vol_profiles')
      .select('id, full_name, avatar_url, rodizio_semana').eq('arquivado', false)
      .ilike('full_name', `%${q}%`).order('full_name').limit(30);
    if (error) throw error;
    const ids = (perfis || []).map((p) => p.id);
    const timesPor = {};
    if (ids.length) {
      const { data: vinc } = await supabase.from('vol_team_members')
        .select('volunteer_profile_id, team:vol_teams(name, is_active)').in('volunteer_profile_id', ids).eq('is_active', true);
      for (const v of vinc || []) {
        const t = _um(v.team);
        if (!t || t.is_active === false) continue;
        (timesPor[v.volunteer_profile_id] ||= new Set()).add(t.name);
      }
    }
    res.json((perfis || []).map((p) => ({
      id: p.id, full_name: p.full_name, avatar_url: p.avatar_url || null, rodizio_semana: p.rodizio_semana ?? null,
      times: [...(timesPor[p.id] || [])].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    })));
  } catch (e) {
    console.error('[APP vol/admin pessoas]', e.message);
    res.status(500).json({ error: 'Erro ao buscar pessoas' });
  }
});



router.get('/voluntariado/admin/pessoas/:id', authApp, limiterNormal, async (req, res) => {
  try {
    const sup = await exigirGestorServir(req, res);
    if (!sup) return;
    const { data: vp } = await supabase.from('vol_profiles')
      .select('id, full_name, avatar_url, phone, rodizio_semana, arquivado').eq('id', req.params.id).maybeSingle();
    if (!vp) return res.status(404).json({ error: 'Pessoa não encontrada' });
    const [{ data: vinc }, { data: times }, tipos] = await Promise.all([
      supabase.from('vol_team_members').select(SEL_VINCULO).eq('volunteer_profile_id', vp.id).eq('is_active', true),
      supabase.from('vol_teams').select('id, name, area, positions:vol_positions(id, name, is_active, sort_order)').eq('is_active', true).order('name'),
      _tiposAtivos(),
    ]);



    const timePorId = {}; for (const t of times || []) timePorId[t.id] = t;
    const todosVinc = (vinc || []).map(_vinculoResp).filter((v) => v.team_id);
    const vinculos = todosVinc.filter((v) => _gerenciaTime(sup, timePorId[v.team_id] || { id: v.team_id, area: v.team_area }));
    const timesGeridos = (times || []).filter((t) => _gerenciaTime(sup, t));
    res.json({
      pessoa: { id: vp.id, full_name: vp.full_name, avatar_url: vp.avatar_url || null, telefone: vp.phone || null, rodizio_semana: vp.rodizio_semana ?? null },
      escopo: sup.admin ? 'admin' : 'lider',
      vinculos,
      vinculos_fora: todosVinc.length - vinculos.length,

      pode_rodizio: sup.admin || vinculos.length > 0,
      times: timesGeridos.map((t) => ({
        id: t.id, name: t.name, area: t.area || null,
        posicoes: (t.positions || []).filter((p) => p.is_active !== false)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.name).localeCompare(String(b.name), 'pt-BR'))
          .map((p) => ({ id: p.id, name: p.name })),
      })),
      tipos,
    });
  } catch (e) {
    console.error('[APP vol/admin pessoa]', e.message);
    res.status(500).json({ error: 'Erro ao carregar a pessoa' });
  }
});




router.post('/voluntariado/admin/vinculos', authApp, limiterNormal, async (req, res) => {
  try {
    const sup = await exigirGestorServir(req, res);
    if (!sup) return;
    const { volunteer_profile_id, team_id } = req.body || {};
    const position_id = req.body?.position_id || null;
    if (!volunteer_profile_id || !team_id) return res.status(400).json({ error: 'volunteer_profile_id e team_id obrigatórios' });
    const [{ data: vp }, { data: eq }] = await Promise.all([
      supabase.from('vol_profiles').select('id, full_name').eq('id', volunteer_profile_id).maybeSingle(),
      supabase.from('vol_teams').select('id, name, area, is_active').eq('id', team_id).maybeSingle(),
    ]);
    if (!vp) return res.status(404).json({ error: 'Pessoa não encontrada' });
    if (!eq || eq.is_active === false) return res.status(404).json({ error: 'Time não encontrado ou inativo' });
    if (!_gerenciaTime(sup, eq)) return res.status(403).json({ error: `Você não lidera ${eq.name}.` });
    if (position_id) {
      const { data: pos } = await supabase.from('vol_positions').select('id, team_id').eq('id', position_id).maybeSingle();
      if (!pos || String(pos.team_id) !== String(team_id)) return res.status(400).json({ error: 'Essa função não é deste time.' });
    }
    let q = supabase.from('vol_team_members').select('id, is_active').eq('team_id', team_id).eq('volunteer_profile_id', vp.id);
    q = position_id ? q.eq('position_id', position_id) : q.is('position_id', null);
    const { data: existentes } = await q;
    const igual = (existentes || [])[0];
    if (igual) {
      if (igual.is_active !== false) return res.status(409).json({ error: `${vp.full_name} já está neste time${position_id ? ' nessa função' : ''}.` });
      const { data, error } = await supabase.from('vol_team_members').update({ is_active: true }).eq('id', igual.id).select(SEL_VINCULO).single();
      if (error) throw error;
      return res.status(200).json(_vinculoResp(data));
    }
    const { data, error } = await supabase.from('vol_team_members')
      .insert({ team_id, position_id, volunteer_profile_id: vp.id, volunteer_name: vp.full_name, is_active: true })
      .select(SEL_VINCULO).single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: `${vp.full_name} já está neste time.` });
      throw error;
    }
    res.status(201).json(_vinculoResp(data));
  } catch (e) {
    console.error('[APP vol/admin vinculo post]', e.message);
    res.status(500).json({ error: 'Erro ao vincular ao time' });
  }
});






router.patch('/voluntariado/admin/vinculos/:id', authApp, limiterNormal, async (req, res) => {
  try {
    const sup = await exigirGestorServir(req, res);
    if (!sup) return;
    const { service_type_ids, position_id } = req.body || {};
    const alvo = await _timeDoVinculo(req.params.id);
    if (!alvo) return res.status(404).json({ error: 'Vínculo não encontrado' });
    if (!_gerenciaTime(sup, alvo.team || { id: alvo.team_id })) return res.status(403).json({ error: `Você não lidera ${alvo.team?.name || 'este time'}.` });
    if (service_type_ids !== undefined) {
      const tipos = await _tiposAtivos();
      const valor = normalizarEscolha(service_type_ids, tipos.map((t) => t.id));
      let q = supabase.from('vol_team_members').update({ service_type_ids: valor }).eq('team_id', alvo.team_id);
      q = alvo.volunteer_profile_id ? q.eq('volunteer_profile_id', alvo.volunteer_profile_id) : q.eq('id', alvo.id);
      const { error } = await q;
      if (error) throw error;
    }
    if (position_id !== undefined) {
      if (position_id) {
        const { data: pos } = await supabase.from('vol_positions').select('id, team_id').eq('id', position_id).maybeSingle();
        if (!pos || String(pos.team_id) !== String(alvo.team_id)) return res.status(400).json({ error: 'Essa função não é deste time.' });
      }
      const { error } = await supabase.from('vol_team_members').update({ position_id: position_id || null }).eq('id', alvo.id);
      if (error) throw error;
    }
    const { data } = await supabase.from('vol_team_members').select(SEL_VINCULO).eq('id', alvo.id).single();
    res.json(_vinculoResp(data));
  } catch (e) {
    console.error('[APP vol/admin vinculo patch]', e.message);
    res.status(500).json({ error: 'Erro ao atualizar o vínculo' });
  }
});


router.delete('/voluntariado/admin/vinculos/:id', authApp, limiterNormal, async (req, res) => {
  try {
    const sup = await exigirGestorServir(req, res);
    if (!sup) return;
    const alvo = await _timeDoVinculo(req.params.id);
    if (!alvo) return res.status(404).json({ error: 'Vínculo não encontrado' });
    if (!_gerenciaTime(sup, alvo.team || { id: alvo.team_id })) return res.status(403).json({ error: `Você não lidera ${alvo.team?.name || 'este time'}.` });
    const { data, error } = await supabase.from('vol_team_members')
      .update({ is_active: false }).eq('id', req.params.id).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Vínculo não encontrado' });
    res.json({ ok: true, id: data.id });
  } catch (e) {
    console.error('[APP vol/admin vinculo delete]', e.message);
    res.status(500).json({ error: 'Erro ao tirar do time' });
  }
});



router.patch('/voluntariado/admin/pessoas/:id/rodizio', authApp, limiterNormal, async (req, res) => {
  try {
    const sup = await exigirGestorServir(req, res);
    if (!sup) return;
    const bruto = req.body ? req.body.semana : undefined;
    const semana = (bruto === null || bruto === undefined || bruto === '') ? null : Number(bruto);
    if (semana !== null && !(Number.isInteger(semana) && semana >= 1 && semana <= 4)) {
      return res.status(400).json({ error: 'Semana inválida: 1 a 4, ou vazio pra nenhuma.' });
    }
    if (!sup.admin) {
      const { data: vinc } = await supabase.from('vol_team_members')
        .select('team:vol_teams(id, name, area)').eq('volunteer_profile_id', req.params.id).eq('is_active', true);
      const emTimeMeu = (vinc || []).some((v) => _gerenciaTime(sup, _um(v.team)));
      if (!emTimeMeu) return res.status(403).json({ error: 'A preferência é editável por quem lidera um time dessa pessoa.' });
    }
    const { data, error } = await supabase.from('vol_profiles').update({ rodizio_semana: semana }).eq('id', req.params.id).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Pessoa não encontrada' });
    res.json({ rodizio_semana: semana });
  } catch (e) {
    console.error('[APP vol/admin pessoa rodizio]', e.message);
    res.status(500).json({ error: 'Erro ao salvar a preferência' });
  }
});

router.post('/voluntariado/escala', authApp, limiterNormal, async (req, res) => {
  try {
    const sup = await supervisorAreasApp(req, { escrita: true });
    const { areas, grants } = sup;
    if (!areas.length) return negarSupervisao(res, sup);
    const { service_id, volunteer_id, team_name, position_name } = req.body || {};
    if (!service_id || !volunteer_id) return res.status(400).json({ error: 'service_id e volunteer_id obrigatórios' });




    if (!supervisionaTudo(grants)) {
      if (!team_name) {
        return res.status(400).json({ error: 'Escolha a equipe: supervisor de área não escala sem equipe definida.' });
      }
      const { data: eq } = await supabase.from('vol_teams')
        .select('id, name, area').eq('name', team_name).maybeSingle();
      if (!eq || !equipeSupervisionada(eq, grants)) {
        return res.status(403).json({
          error: `Você não supervisiona ${team_name}. Fale com quem responde por essa área.`,
        });
      }






      const rodizio = await rodizioDoServico(service_id);
      const recorte = subareasNaArea(grants, eq.area, eq.id);
      if (recorte.length) {

        if (!position_name) {
          return res.status(400).json({
            error: 'Escolha a subárea: sua supervisão é de subárea específica, não da área inteira.',
          });
        }
        const posId = await resolverPosicaoId(eq.id, position_name);
        if (!posId || !podeSupervisionar(grants, { area: eq.area, team_id: eq.id, position_id: posId, culto: rodizio })) {
          return res.status(403).json({
            error: `Você não supervisiona ${position_name} em ${team_name} neste culto.`,
          });
        }
      } else if (!podeSupervisionar(grants, { area: eq.area, team_id: eq.id, position_id: null, culto: rodizio })) {


        return res.status(403).json({
          error: 'Este culto não está no seu turno de supervisão.',
          fora_do_rodizio: true,
        });
      }
    }

    const { data: vp } = await supabase.from('vol_profiles')
      .select('id, full_name, planning_center_id, auth_user_id, membresia_id').eq('id', volunteer_id).maybeSingle();
    if (!vp) return res.status(404).json({ error: 'Voluntário não encontrado' });


    let dupQ = supabase.from('vol_schedules').select('id')
      .eq('service_id', service_id).eq('volunteer_id', vp.id);
    dupQ = (team_name ? dupQ.eq('team_name', team_name) : dupQ.is('team_name', null));
    const { data: dup } = await dupQ.maybeSingle();
    if (dup) return res.status(409).json({ error: 'Essa pessoa já está nesta equipe do culto' });


    const teamId = await resolverEquipeId(team_name);
    const positionId = await resolverPosicaoId(teamId, position_name);
    const { data, error } = await supabase.from('vol_schedules').insert({
      service_id,
      volunteer_id: vp.id,
      volunteer_name: vp.full_name,
      planning_center_person_id: vp.planning_center_id || null,
      team_id: teamId,
      team_name: team_name || null,
      position_id: positionId,
      position_name: position_name || null,
      confirmation_status: 'pending',
      source: 'manual',
    }).select('id, volunteer_id, volunteer_name, team_id, team_name, position_id, position_name, confirmation_status').single();
    if (error) throw error;
    res.status(201).json(data);


    (async () => {
      try {
        const { notificarApp, membrosParaUsuarios } = require('../services/appPush');
        let userIds = vp.auth_user_id ? [vp.auth_user_id] : [];
        if (!userIds.length && vp.membresia_id) userIds = await membrosParaUsuarios([vp.membresia_id]);
        if (!userIds.length) return;
        const { data: svc } = await supabase.from('vol_services')
          .select('service_type_name, scheduled_at').eq('id', service_id).maybeSingle();
        let quando = '';
        if (svc?.scheduled_at) {
          const b = new Date(new Date(svc.scheduled_at).getTime() - 3 * 3600 * 1000);
          const dd = String(b.getUTCDate()).padStart(2, '0');
          const mm = String(b.getUTCMonth() + 1).padStart(2, '0');
          const aa = String(b.getUTCFullYear()).slice(2);
          const hh = String(b.getUTCHours()).padStart(2, '0');
          const mi = String(b.getUTCMinutes()).padStart(2, '0');
          quando = `${dd}/${mm}/${aa} ${hh}:${mi}`;
        }
        const culto = svc?.service_type_name || 'um culto';
        const teamTxt = team_name ? ` · ${team_name}` : '';
        await notificarApp(userIds, {
          tipo: 'escala',
          titulo: 'Você foi escalado(a) 🙌',
          body: `${culto}${quando ? ` · ${quando}` : ''}${teamTxt}. Confirme sua presença no app.`,
          data: { service_id },
        });
      } catch (e) { console.error('[APP vol/escala push]', e.message); }
    })();
  } catch (e) {
    console.error('[APP vol/escala post]', e.message);
    res.status(500).json({ error: 'Erro ao escalar' });
  }
});


router.patch('/voluntariado/escala/:id', authApp, limiterNormal, async (req, res) => {
  try {
    const sup = await supervisorAreasApp(req, { escrita: true });
    const { areas, grants } = sup;
    if (!areas.length) return negarSupervisao(res, sup);
    const { team_name, position_name } = req.body || {};
    const { data: atual } = await supabase.from('vol_schedules')
      .select('id, service_id, volunteer_id, team_id, team_name').eq('id', req.params.id).maybeSingle();
    if (!atual) return res.status(404).json({ error: 'Escala não encontrada' });
    const novoTeam = team_name === undefined ? atual.team_name : (team_name || null);

    if (atual.volunteer_id && novoTeam !== atual.team_name) {
      let dupQ = supabase.from('vol_schedules').select('id')
        .eq('service_id', atual.service_id).eq('volunteer_id', atual.volunteer_id).neq('id', atual.id);
      dupQ = (novoTeam ? dupQ.eq('team_name', novoTeam) : dupQ.is('team_name', null));
      const { data: dup } = await dupQ.maybeSingle();
      if (dup) return res.status(409).json({ error: 'Essa pessoa já está nessa equipe' });
    }


    if (!supervisionaTudo(grants)) {
      const origem = await escalaSobSupervisao(req.params.id, grants);
      if (!origem.ok) {
        return res.status(403).json({ error: `Essa escala é de ${origem.equipe || 'outra área'}, que você não supervisiona.` });
      }
      if (novoTeam) {
        const { data: destino } = await supabase.from('vol_teams')
          .select('id, name, area').eq('name', novoTeam).maybeSingle();
        if (!destino || !equipeSupervisionada(destino, grants)) {
          return res.status(403).json({ error: `Você não supervisiona ${novoTeam}.` });
        }



        const recorte = subareasNaArea(grants, destino.area);
        if (recorte.length) {
          const nomePos = position_name !== undefined ? position_name : null;
          if (!nomePos) {
            return res.status(400).json({ error: 'Escolha a subárea do destino: sua supervisão é de subárea específica.' });
          }
          const posId = await resolverPosicaoId(destino.id, nomePos);
          if (!posId || !podeSupervisionar(grants, { area: destino.area, team_id: destino.id, position_id: posId, culto: await rodizioDoServico(atual.service_id) })) {
            return res.status(403).json({ error: `Você não supervisiona ${nomePos} em ${novoTeam}.` });
          }
        }
      }
    }
    const patch = { team_name: novoTeam };
    if (position_name !== undefined) patch.position_name = position_name || null;








    if (team_name !== undefined) {
      const teamId = await resolverEquipeId(novoTeam);
      patch.team_id = teamId;
      if (position_name !== undefined) patch.position_id = await resolverPosicaoId(teamId, position_name || null);
      else if (novoTeam !== atual.team_name) patch.position_id = null;
    } else if (position_name !== undefined) {
      patch.position_id = await resolverPosicaoId(atual.team_id, position_name || null);
    }
    const { data, error } = await supabase.from('vol_schedules').update(patch)
      .eq('id', req.params.id)
      .select('id, volunteer_id, volunteer_name, team_id, team_name, position_id, position_name, confirmation_status').single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[APP vol/escala patch]', e.message);
    res.status(500).json({ error: 'Erro ao mover' });
  }
});


router.delete('/voluntariado/escala/:id', authApp, limiterNormal, async (req, res) => {
  try {
    const sup = await supervisorAreasApp(req, { escrita: true });
    const { areas, grants } = sup;
    if (!areas.length) return negarSupervisao(res, sup);


    const sob = await escalaSobSupervisao(req.params.id, grants);
    if (!sob.ok) {
      return res.status(403).json({ error: `Essa escala é de ${sob.equipe || 'outra área'}, que você não supervisiona.` });
    }
    const { data: sc } = await supabase.from('vol_schedules').select('source').eq('id', req.params.id).maybeSingle();
    if (sc && sc.source && sc.source !== 'manual') {
      return res.status(400).json({ error: 'Essa pessoa veio do Planning Center — remova por lá. Pelo app só dá pra tirar quem foi escalado aqui.' });
    }
    const { error } = await supabase.from('vol_schedules').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[APP vol/escala delete]', e.message);
    res.status(500).json({ error: 'Erro ao remover da escala' });
  }
});























async function cultoEhHoje(serviceId) {
  const { data: svc } = await supabase.from('vol_services')
    .select('id, scheduled_at, name').eq('id', serviceId).maybeSingle();
  if (!svc?.scheduled_at) return { ok: false, motivo: 'servico_sem_data' };


  const r = ehDiaDoCulto(svc.scheduled_at);
  return { ...r, servico: svc.name };
}











async function checkinSobSupervisao(scheduleId, grants) {
  if (supervisionaTudo(grants)) return { ok: true };
  if (!scheduleId) return { ok: true, sem_escala: true };
  const { data: sc } = await supabase.from('vol_schedules')
    .select('id, team_id, team_name, position_id, position_name, service_id').eq('id', scheduleId).maybeSingle();
  if (!sc) return { ok: false, motivo: 'escala_nao_encontrada' };
  let equipe = null;
  if (sc.team_id) {
    const { data } = await supabase.from('vol_teams').select('id, name, area').eq('id', sc.team_id).maybeSingle();
    equipe = data;
  } else if (sc.team_name) {
    const { data } = await supabase.from('vol_teams').select('id, name, area').eq('name', sc.team_name).maybeSingle();
    equipe = data;
  }
  if (!equipe) return { ok: false, motivo: 'sem_equipe' };
  if (!podeSupervisionar(grants, { area: equipe.area, team_id: equipe.id, position_id: sc.position_id || null, culto: await rodizioDoServico(sc.service_id) })) {
    return { ok: false, motivo: 'fora_do_escopo', equipe: equipe.name, subarea: sc.position_name || null };
  }
  return { ok: true };
}



router.get('/voluntariado/escala/:serviceId/checkins', authApp, limiterNormal, async (req, res) => {
  try {
    const { areas, grants } = await supervisorAreasApp(req);
    if (!areas.length) return res.status(403).json({ error: 'Você não é supervisor de escala.' });




    const { data, error } = await supabase.from('vol_check_ins')
      .select('id, schedule_id, volunteer_id, checked_in_at, method, volunteer_name, is_unscheduled, volunteer:vol_profiles(full_name), schedule:vol_schedules(volunteer_name, team_id, team_name, position_id, position_name)')
      .eq('service_id', req.params.serviceId)
      .order('checked_in_at', { ascending: false });
    if (error) throw error;

    let areaPorEquipe = {};
    if (!supervisionaTudo(grants)) {
      const { data: eqs } = await supabase.from('vol_teams').select('id, name, area');
      for (const t of eqs || []) {
        if (t.id) areaPorEquipe[t.id] = t.area;
        if (t.name) areaPorEquipe[`n:${t.name}`] = t.area;
      }
    }

    const rodizioLista = supervisionaTudo(grants) ? null : await rodizioDoServico(req.params.serviceId);
    const noEscopo = (c) => {
      if (supervisionaTudo(grants)) return true;
      const sch = Array.isArray(c.schedule) ? c.schedule[0] : c.schedule;


      if (!sch) return true;
      const area = areaPorEquipe[sch.team_id] ?? areaPorEquipe[`n:${sch.team_name}`] ?? null;
      return podeSupervisionar(grants, { area, team_id: sch.team_id || null, position_id: sch.position_id || null, culto: rodizioLista });
    };
    const visiveis = (data || []).filter(noEscopo);

    res.json(visiveis.map((c) => {
      const sch = Array.isArray(c.schedule) ? c.schedule[0] : c.schedule;
      return {
        id: c.id,
        schedule_id: c.schedule_id,
        volunteer_id: c.volunteer_id,
        volunteer_name: c.volunteer?.full_name || sch?.volunteer_name || c.volunteer_name || null,
        checked_in_at: c.checked_in_at,
        method: c.method,
        is_unscheduled: c.is_unscheduled || false,
        equipe: sch?.team_name || null,
        subarea: sch?.position_name || null,
      };
    }));
  } catch (e) {
    console.error('[APP vol/escala checkins]', e.message);
    res.status(500).json({ error: 'Erro ao carregar os check-ins' });
  }
});







router.post('/voluntariado/checkin', authApp, limiterNormal, async (req, res) => {
  try {
    const sup = await supervisorAreasApp(req, { escrita: true });
    const { areas, grants } = sup;
    if (!areas.length) return negarSupervisao(res, sup);
    const { service_id, schedule_id, volunteer_id, method } = req.body || {};
    if (!service_id) return res.status(400).json({ error: 'service_id obrigatório' });
    const metodo = ['qr_code', 'manual', 'facial', 'self_service'].includes(method) ? method : 'manual';





    const janela = await cultoEhHoje(service_id);
    if (!janela.ok) {
      return res.status(403).json({
        error: janela.motivo === 'fora_do_dia'
          ? `Check-in só no dia do culto. "${janela.servico || 'Este culto'}" é ${janela.dia?.split('-').reverse().join('/')}.`
          : 'Este culto não tem data definida — não é possível registrar presença.',
        fora_da_janela: true,
      });
    }

    const norm = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const dateSP = (iso) => { try { return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); } catch { return (iso || '').slice(0, 10); } };
    const periodoSP = (iso) => { try { const h = Number(new Date(iso).toLocaleString('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).slice(0, 2)); return h < 14 ? 'manha' : 'noite'; } catch { return 'noite'; } };

    let resolvedScheduleId = schedule_id || null;
    let resolvedVolunteerId = volunteer_id || null;
    let resolvedUnscheduled;

    const { data: ciSvc } = await supabase.from('vol_services').select('scheduled_at').eq('id', service_id).maybeSingle();
    const ciDate = ciSvc?.scheduled_at ? dateSP(ciSvc.scheduled_at) : null;
    const ciPer = ciSvc?.scheduled_at ? periodoSP(ciSvc.scheduled_at) : null;

    if (ciDate) {
      const { data: svcsDia } = await supabase.from('vol_services')
        .select('id, scheduled_at')
        .gte('scheduled_at', `${ciDate}T00:00:00-03:00`).lt('scheduled_at', `${ciDate}T23:59:59-03:00`);
      const idsDia = (svcsDia || []).map((s) => s.id);
      const idsBloco = (svcsDia || []).filter((s) => periodoSP(s.scheduled_at) === ciPer).map((s) => s.id);


      if (!resolvedVolunteerId && resolvedScheduleId) {
        const { data: sch } = await supabase.from('vol_schedules').select('volunteer_id').eq('id', resolvedScheduleId).maybeSingle();
        if (sch?.volunteer_id) resolvedVolunteerId = sch.volunteer_id;
      }


      if (resolvedVolunteerId && idsBloco.length) {
        const { data: jaTem } = await supabase.from('vol_check_ins')
          .select('id, checked_in_at, method, volunteer:vol_profiles(full_name), schedule:vol_schedules(volunteer_name)')
          .eq('volunteer_id', resolvedVolunteerId).in('service_id', idsBloco)
          .order('checked_in_at', { ascending: true }).limit(1);
        if (jaTem && jaTem[0]) {
          const ex = jaTem[0];
          return res.status(409).json({
            error: 'Check-in já foi realizado', alreadyCheckedIn: true,
            volunteerName: ex.volunteer?.full_name || ex.schedule?.volunteer_name || null,
            checkedInAt: ex.checked_in_at, method: ex.method,
          });
        }
      }


      if (!resolvedScheduleId && idsDia.length) {
        let vp = null;
        if (resolvedVolunteerId) ({ data: vp } = await supabase.from('vol_profiles').select('planning_center_id, full_name').eq('id', resolvedVolunteerId).maybeSingle());
        const vpName = norm(vp?.full_name);
        const { data: scheds } = await supabase.from('vol_schedules')
          .select('id, volunteer_id, planning_center_person_id, volunteer_name, service_id').in('service_id', idsDia);
        const casa = (s) => (
          (resolvedVolunteerId && s.volunteer_id && s.volunteer_id === resolvedVolunteerId) ||
          (vp?.planning_center_id && s.planning_center_person_id && s.planning_center_person_id === vp.planning_center_id) ||
          (vpName && norm(s.volunteer_name) === vpName)
        );
        const match = (scheds || []).filter((s) => idsBloco.includes(s.service_id)).find(casa) || (scheds || []).find(casa);
        if (match) {
          resolvedScheduleId = match.id;
          resolvedUnscheduled = false;
          if (!resolvedVolunteerId && match.volunteer_id) resolvedVolunteerId = match.volunteer_id;
        } else {
          resolvedUnscheduled = true;
        }
      }
    }

    if (!resolvedVolunteerId && !resolvedScheduleId) {
      return res.status(400).json({ error: 'Informe o voluntário (volunteer_id) ou a escala (schedule_id) pra registrar o check-in.' });
    }





    const escopo = await checkinSobSupervisao(resolvedScheduleId, grants);
    if (!escopo.ok) {
      return res.status(403).json({
        error: escopo.motivo === 'fora_do_escopo'
          ? `${escopo.subarea ? `${escopo.subarea} (${escopo.equipe})` : escopo.equipe} não está na sua supervisão.`
          : 'Não foi possível confirmar que essa escala está na sua supervisão.',
        fora_do_escopo: true,
      });
    }

    const { data, error } = await supabase.from('vol_check_ins').insert({
      schedule_id: resolvedScheduleId,
      volunteer_id: resolvedVolunteerId,
      service_id,
      checked_in_by: req.user.id,
      method: metodo,
      is_unscheduled: resolvedUnscheduled || false,
    }).select('id, schedule_id, volunteer_id, service_id, checked_in_at, method, is_unscheduled').single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Check-in já foi realizado', alreadyCheckedIn: true });
      }
      throw error;
    }


    if (resolvedScheduleId) {
      await supabase.from('vol_schedules')
        .update({ confirmation_status: 'confirmed' }).eq('id', resolvedScheduleId).eq('confirmation_status', 'pending');
    }
    res.status(201).json(data);
  } catch (e) {
    console.error('[APP vol/checkin post]', e.message);
    res.status(500).json({ error: 'Erro ao registrar check-in' });
  }
});














router.delete('/voluntariado/checkin/:id', authApp, limiterNormal, async (req, res) => {
  try {
    const sup = await supervisorAreasApp(req, { escrita: true });
    const { areas, grants } = sup;
    if (!areas.length) return negarSupervisao(res, sup);

    const { data: ci } = await supabase.from('vol_check_ins')
      .select('id, service_id, schedule_id, volunteer_id, volunteer_name, checked_in_at, method, volunteer:vol_profiles(full_name), schedule:vol_schedules(volunteer_name)')
      .eq('id', req.params.id).maybeSingle();
    if (!ci) return res.status(404).json({ error: 'Check-in não encontrado' });

    const janela = await cultoEhHoje(ci.service_id);
    if (!janela.ok) {
      return res.status(403).json({
        error: 'Só é possível desfazer no dia do culto. Fale com a coordenação do voluntariado.',
        fora_da_janela: true,
      });
    }

    const escopo = await checkinSobSupervisao(ci.schedule_id, grants);
    if (!escopo.ok) {
      return res.status(403).json({ error: 'Esse check-in não está na sua supervisão.', fora_do_escopo: true });
    }

    const nome = ci.volunteer?.full_name
      || (Array.isArray(ci.schedule) ? ci.schedule[0]?.volunteer_name : ci.schedule?.volunteer_name)
      || ci.volunteer_name || null;

    const { error } = await supabase.from('vol_check_ins').delete().eq('id', ci.id);
    if (error) throw error;



    try {
      await supabase.from('audit_log').insert({
        table_name: 'vol_check_ins',
        record_id: ci.id,
        action: 'DELETE',
        field_name: 'checked_in_at',
        old_value: ci.checked_in_at ? String(ci.checked_in_at) : null,
        new_value: null,
        description: `Check-in de ${nome || 'voluntário'} desfeito pelo supervisor no app (método ${ci.method || '—'}).`,
        changed_by: req.user?.id || null,
      });
    } catch (e) {
      console.warn('[APP vol/checkin delete] audit não gravado:', e.message);
    }

    res.json({ ok: true, id: ci.id, volunteer_name: nome });
  } catch (e) {
    console.error('[APP vol/checkin delete]', e.message);
    res.status(500).json({ error: 'Erro ao desfazer o check-in' });
  }
});





const NEXT_CHURCH = {
  lat: parseFloat(process.env.NEXT_CHURCH_LAT || '-23.001115'),
  lng: parseFloat(process.env.NEXT_CHURCH_LNG || '-43.388279'),
  raio: parseInt(process.env.NEXT_CHECKIN_RADIUS_M || '500', 10),
};
function distanciaMetros(aLat, aLng, bLat, bLng) {
  const R = 6371000, toR = (x) => (x * Math.PI) / 180;
  const dLat = toR(bLat - aLat), dLng = toR(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function hojeBRT() { return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10); }
function partesNome(nomeCompleto) {
  const n = (nomeCompleto || '').trim();
  return { nome: n.split(' ')[0] || 'Membro', sobrenome: n.split(' ').slice(1).join(' ') || null };
}

















async function nextTurmasAbertas() {
  const { data: turmas } = await supabase.from('next_turmas')
    .select('id, nome, status, horario, observacoes')
    .eq('status', 'aberta').is('deleted_at', null)
    .order('created_at', { ascending: true });
  if (!turmas || !turmas.length) return { turmas: [], encontros: [] };
  const { data: encontros } = await supabase.from('next_encontros')
    .select('id, turma_id, numero, data, tema')
    .in('turma_id', turmas.map(t => t.id))
    .order('data', { ascending: true });
  return { turmas, encontros: encontros || [] };
}


router.get('/next/me', authApp, limiterNormal, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    const hoje = hojeBRT();
    const { turmas, encontros } = await nextTurmasAbertas();
    const turmaPorId = new Map(turmas.map(t => [t.id, t]));


    const matPorTurma = {};
    if (membro && turmas.length) {
      const { data: mats } = await supabase.from('next_matriculas')
        .select('id, turma_id, status, check_in_at')
        .eq('membro_id', membro.id).in('turma_id', turmas.map(t => t.id))
        .is('deleted_at', null);
      (mats || []).forEach(m => { matPorTurma[m.turma_id] = m; });
    }


    const presPorEncontro = {};
    const matIds = Object.values(matPorTurma).map(m => m.id);
    if (matIds.length && encontros.length) {
      const { data: pres } = await supabase.from('next_presencas')
        .select('encontro_id, presente, created_at')
        .in('matricula_id', matIds).in('encontro_id', encontros.map(e => e.id));
      (pres || []).forEach(p => { if (p.presente) presPorEncontro[p.encontro_id] = p.created_at; });
    }

    const lista = encontros.filter(e => e.data >= hoje).slice(0, 12).map(e => {
      const turma = turmaPorId.get(e.turma_id);
      return {
        id: e.id,
        data: e.data,


        titulo: e.tema || turma?.nome || 'Encontro do NEXT',
        turma_id: e.turma_id,
        turma_nome: turma?.nome || null,
        horario: turma?.horario || null,
        inscrito: !!matPorTurma[e.turma_id],
        check_in_at: presPorEncontro[e.id] || null,
        pode_checkin_hoje: e.data === hoje,
      };
    });

    res.json({
      membro_id: membro?.id || null,
      inscrito_next: Object.keys(matPorTurma).length > 0,
      encontros: lista,
      igreja: { lat: NEXT_CHURCH.lat, lng: NEXT_CHURCH.lng, raio_m: NEXT_CHURCH.raio },
    });
  } catch (e) {
    console.error('[APP next/me]', e.message);
    res.status(500).json({ error: 'Erro ao carregar NEXT' });
  }
});












async function matricularNoNextAberto({ membro, email }) {
  const hoje = hojeBRT();
  const { turmas, encontros } = await nextTurmasAbertas();
  if (!turmas.length) {
    return { ok: false, error: 'Não há turma do NEXT com inscrições abertas no momento.' };
  }
  const proximo = encontros.find(e => e.data >= hoje) || null;
  const turma = proximo
    ? turmas.find(t => t.id === proximo.turma_id)
    : turmas[turmas.length - 1];
  if (!turma) {
    return { ok: false, error: 'Não há turma do NEXT com inscrições abertas no momento.' };
  }
  const resposta = {
    id: proximo?.id || turma.id,
    turma_id: turma.id,
    titulo: turma.nome,
    data: proximo?.data || null,
    horario: turma.horario || null,
  };

  const { data: ja } = await supabase.from('next_matriculas')
    .select('id').eq('membro_id', membro.id).eq('turma_id', turma.id)
    .is('deleted_at', null).limit(1).maybeSingle();
  if (ja) return { ok: true, turma: resposta, jaInscrito: true, matricula_id: ja.id };

  const { nome, sobrenome } = partesNome(membro.nome);

  const primeiroEnc = encontros.find(e => e.turma_id === turma.id) || proximo;
  const chave = primeiroEnc ? chaveMesMembro(primeiroEnc.data, membro.id) : null;

  const { data: nova, error } = await supabase.from('next_matriculas').insert({
    turma_id: turma.id, nome, sobrenome,
    cpf: membro.cpf || null, email: membro.email || email || null,
    telefone: membro.telefone || null, data_nascimento: membro.data_nascimento || null,
    membro_id: membro.id, origem: 'app', status: 'matriculado',
    origem_mes_key: chave,
  }).select('id').single();

  if (error) {


    if (error.code === '23505') return { ok: true, turma: resposta, jaInscrito: true };
    throw error;
  }
  return { ok: true, turma: resposta, matricula_id: nova?.id || null };
}







router.post('/next/inscrever', authApp, limiterStrict, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    if (!membro) return res.status(404).json({ error: 'Cadastro de membro não encontrado' });

    const r = await matricularNoNextAberto({ membro, email: req.user.email });
    if (!r.ok) return res.status(400).json({ error: r.error });
    if (r.jaInscrito) return res.json({ ok: true, evento: r.turma, jaInscrito: true });


    notificar({
      modulo: 'next',
      tipo: 'next_nova_inscricao',
      titulo: 'Nova inscrição no NEXT',
      mensagem: `${membro.nome || 'Alguém'} se inscreveu no NEXT pelo app (${r.turma.titulo}).`,
      link: '/ministerial/next?tab=turmas',
      chaveDedup: r.matricula_id ? `next_mat_${r.matricula_id}` : undefined,
    }).catch(e => console.warn('[APP next/inscrever] notificar:', e.message));

    res.status(201).json({ ok: true, evento: r.turma, message: 'Inscrição no NEXT confirmada!' });
  } catch (e) {
    console.error('[APP next/inscrever]', e.message);
    res.status(500).json({ error: 'Erro ao inscrever no NEXT' });
  }
});









router.post('/next/encontros/:encontroId/checkin', authApp, limiterNormal, async (req, res) => {
  try {
    const { lat, lng } = req.body || {};
    const membro = await resolveMembroApp(req);
    if (!membro) return res.status(404).json({ error: 'Cadastro de membro não encontrado' });

    const encontroId = req.params.encontroId;
    const { data: enc } = await supabase.from('next_encontros')
      .select('id, turma_id, data, tema').eq('id', encontroId).maybeSingle();
    if (!enc) return res.status(404).json({ error: 'Encontro não encontrado' });
    if (enc.data !== hojeBRT()) {
      return res.status(422).json({ error: 'O check-in só fica disponível no dia do encontro.' });
    }
    if (lat == null || lng == null || Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) {
      return res.status(422).json({ needLocation: true, error: 'Ative a localização para confirmar sua presença.' });
    }
    const dist = distanciaMetros(Number(lat), Number(lng), NEXT_CHURCH.lat, NEXT_CHURCH.lng);
    if (dist > NEXT_CHURCH.raio) {
      return res.status(403).json({ error: 'Você precisa estar na igreja para fazer o check-in.', distancia_m: Math.round(dist) });
    }

    const { data: turma } = await supabase.from('next_turmas')
      .select('id, nome').eq('id', enc.turma_id).is('deleted_at', null).maybeSingle();
    if (!turma) return res.status(404).json({ error: 'Turma do encontro não encontrada' });

    const agora = new Date().toISOString();
    const { nome, sobrenome } = partesNome(membro.nome);




    let { data: mat } = await supabase.from('next_matriculas')
      .select('id, check_in_at').eq('membro_id', membro.id).eq('turma_id', turma.id)
      .is('deleted_at', null).limit(1).maybeSingle();
    let matriculaNova = false;
    if (!mat) {
      const { data: criada, error: errMat } = await supabase.from('next_matriculas').insert({
        turma_id: turma.id, nome, sobrenome,
        cpf: membro.cpf || null, email: membro.email || req.user.email || null,
        telefone: membro.telefone || null, data_nascimento: membro.data_nascimento || null,
        membro_id: membro.id, origem: 'app', status: 'matriculado',
        origem_mes_key: chaveMesMembro(enc.data, membro.id),
        check_in_at: agora, check_in_by: req.user.id,
      }).select('id, check_in_at').single();
      if (errMat) {


        if (errMat.code !== '23505') throw errMat;
        const { data: existente } = await supabase.from('next_matriculas')
          .select('id, check_in_at').eq('membro_id', membro.id)
          .eq('origem_mes_key', chaveMesMembro(enc.data, membro.id))
          .is('deleted_at', null).limit(1).maybeSingle();
        if (!existente) throw errMat;
        mat = existente;
      } else {
        mat = criada;
        matriculaNova = true;
      }
    }


    const { data: jaPres } = await supabase.from('next_presencas')
      .select('id, created_at').eq('encontro_id', enc.id).eq('matricula_id', mat.id)
      .eq('presente', true).limit(1).maybeSingle();
    if (jaPres) {
      return res.json({ ok: true, jaCheckin: true, check_in_at: jaPres.created_at || mat.check_in_at || agora });
    }
    await supabase.from('next_presencas').delete().eq('encontro_id', enc.id).eq('matricula_id', mat.id);
    const { error: errPres } = await supabase.from('next_presencas')
      .insert({ encontro_id: enc.id, matricula_id: mat.id, presente: true });
    if (errPres) throw errPres;
    await supabase.from('next_matriculas')
      .update({ check_in_at: agora, check_in_by: req.user.id, updated_at: agora })
      .eq('id', mat.id);

    if (matriculaNova) {
      notificar({
        modulo: 'next',
        tipo: 'next_nova_inscricao',
        titulo: 'Nova inscrição no NEXT',
        mensagem: `${membro.nome || nome} entrou no NEXT pelo app (check-in · ${turma.nome}).`,
        link: '/ministerial/next?tab=turmas',
        chaveDedup: `next_mat_${mat.id}`,
      }).catch(e => console.warn('[APP next/checkin] notificar:', e.message));
    }

    res.status(matriculaNova ? 201 : 200).json({ ok: true, check_in_at: agora });
  } catch (e) {
    console.error('[APP next/checkin]', e.message);
    res.status(500).json({ error: 'Erro ao fazer check-in' });
  }
});












async function recomputarStatusTurmaApp(turmaId) {
  if (!turmaId) return;
  const { data: encontros } = await supabase.from('next_encontros').select('id').eq('turma_id', turmaId);
  const encIds = (encontros || []).map((e) => e.id);
  const totalEnc = encIds.length;
  const { data: mats } = await supabase
    .from('next_matriculas').select('id, status').eq('turma_id', turmaId).is('deleted_at', null);
  if (!mats || !mats.length) return;
  const presByMat = {};
  if (encIds.length) {
    const { data: pres } = await supabase.from('next_presencas').select('matricula_id, presente').in('encontro_id', encIds);
    (pres || []).forEach((p) => { if (p.presente) presByMat[p.matricula_id] = (presByMat[p.matricula_id] || 0) + 1; });
  }
  for (const m of mats) {
    if (m.status === 'desistiu' || m.status === 'incompleto') continue;
    const n = presByMat[m.id] || 0;
    const novo = (totalEnc > 0 && n >= totalEnc) ? 'formado' : 'matriculado';
    if (novo !== m.status) {
      await supabase.from('next_matriculas')
        .update({ status: novo, updated_at: new Date().toISOString() }).eq('id', m.id);
    }
  }
}

















async function contextoGestaoNext(req) {
  const membro = await resolveMembroApp(req);
  const permissao = await permissaoModuloApp(req, 'next').catch((e) => {
    console.error('[APP next] permissaoModuloApp:', e.message);
    return { leitura: 0, escrita: 0 };
  });
  const leitura = Number(permissao.leitura || 0);
  const escrita = Number(permissao.escrita || 0);
  let turmasProprias = [];
  if (membro) {
    const { data, error } = await supabase.from('next_turmas')
      .select('id, nome, status, observacoes, origem_mes, created_at')
      .eq('responsavel_id', membro.id).is('deleted_at', null)
      .order('created_at', { ascending: false }).limit(200);


    if (error) throw error;
    turmasProprias = data || [];
  }
  const proprias = turmasProprias.length;
  return {
    membro,
    leitura,
    escrita,
    turmasProprias,
    gerencia: podeGerenciarNext({ leitura, escrita, turmasProprias: proprias }),
    escreve: podeEscreverNext({ escrita, turmasProprias: proprias }),
  };
}


async function autorizarGestaoNextApp(req, res, next) {
  try {
    const ctx = await contextoGestaoNext(req);
    if (!ctx.gerencia) {
      return res.status(403).json({ error: 'Esta área é só para quem gerencia o Next.' });
    }
    req.nextCtx = ctx;
    next();
  } catch (e) {
    console.error('[APP next/permissao]', e.message);
    res.status(500).json({ error: 'Erro ao verificar o seu acesso ao Next.' });
  }
}



async function autorizarEscritaNextApp(req, res, next) {
  try {
    const ctx = req.nextCtx || await contextoGestaoNext(req);
    if (!ctx.escreve) {
      return res.status(403).json({
        error: 'Seu acesso ao Next é somente de leitura.',
        codigo: 'somente_leitura',
      });
    }
    req.nextCtx = ctx;
    next();
  } catch (e) {
    console.error('[APP next/permissao-escrita]', e.message);
    res.status(500).json({ error: 'Erro ao verificar o seu acesso ao Next.' });
  }
}




async function turmaGerenciavel(ctx, turmaId, { escrever = false } = {}) {
  const { data: turma, error } = await supabase.from('next_turmas')
    .select('*').eq('id', turmaId).is('deleted_at', null).maybeSingle();
  if (error) throw error;
  if (!turma) return { erro: { status: 404, msg: 'Turma não encontrada' } };
  const pode = podeGerenciarTurmaApp({
    leitura: ctx.leitura, escrita: ctx.escrita, escrever,
    turma, membroId: ctx.membro?.id,
  });
  if (!pode) return { erro: { status: 403, msg: 'Você não gerencia esta turma.' } };
  return { turma };
}






router.get('/next/papel', authApp, limiterNormal, async (req, res) => {
  try {
    const ctx = await contextoGestaoNext(req);
    res.json({ responsavel: ctx.turmasProprias.length > 0, turmas: ctx.turmasProprias });
  } catch (e) {
    console.error('[APP next/papel]', e.message);
    res.status(500).json({ error: 'Erro ao carregar suas turmas do NEXT' });
  }
});




router.get('/next/gestao', authApp, limiterNormal, async (req, res) => {
  try {
    const ctx = await contextoGestaoNext(req);
    if (!ctx.gerencia) {


      return res.json({
        gerencia: false, escreve: false, por_permissao: false,
        eh_responsavel: false, turmas: [], espera: 0,
      });
    }
    const { data: abertas, error } = await supabase.from('next_turmas')
      .select('id, nome, status, observacoes, origem_mes, responsavel_id, created_at')
      .eq('status', 'aberta').is('deleted_at', null)
      .order('created_at', { ascending: false }).limit(200);
    if (error) throw error;



    const porId = new Map();
    (abertas || []).forEach((t) => porId.set(t.id, t));
    ctx.turmasProprias.forEach((t) => { if (!porId.has(t.id)) porId.set(t.id, t); });
    const turmas = [...porId.values()];


    const ids = turmas.map((t) => t.id);
    const meta = {};
    if (ids.length) {
      const [{ data: encs }, { data: mats }] = await Promise.all([
        supabase.from('next_encontros').select('id, turma_id, numero, data').in('turma_id', ids).order('numero'),
        supabase.from('next_matriculas').select('turma_id').in('turma_id', ids).is('deleted_at', null).limit(1000),
      ]);
      (encs || []).forEach((e) => {
        const m = meta[e.turma_id] || (meta[e.turma_id] = { encontros: [], matriculados: 0 });
        m.encontros.push({ id: e.id, numero: e.numero, data: e.data });
      });
      (mats || []).forEach((m) => {
        const x = meta[m.turma_id] || (meta[m.turma_id] = { encontros: [], matriculados: 0 });
        x.matriculados += 1;
      });
    }


    const { count: espera } = await supabase.from('next_matriculas')
      .select('id', { count: 'exact', head: true })
      .is('turma_id', null).is('deleted_at', null);

    res.json({
      gerencia: true,




      escreve: ctx.escreve,




      por_permissao: Math.max(ctx.leitura, ctx.escrita) >= NIVEL_MINIMO_NEXT_APP,
      eh_responsavel: ctx.turmasProprias.length > 0,
      espera: Number(espera || 0),
      turmas: turmas.map((t) => ({
        ...t,
        sou_responsavel: !!(ctx.membro?.id && t.responsavel_id === ctx.membro.id),
        encontros: meta[t.id]?.encontros || [],
        matriculados: meta[t.id]?.matriculados || 0,
      })),
    });
  } catch (e) {
    console.error('[APP next/gestao]', e.message);
    res.status(500).json({ error: 'Erro ao carregar a gestão do Next' });
  }
});




router.get('/next/lista-espera', authApp, autorizarGestaoNextApp, limiterNormal, async (req, res) => {
  try {
    const { data, error } = await supabase.from('next_matriculas')
      .select('id, nome, sobrenome, telefone, observacoes, created_at')
      .is('turma_id', null).is('deleted_at', null)
      .order('created_at', { ascending: true }).limit(500);
    if (error) throw error;
    res.json({ count: (data || []).length, pessoas: data || [] });
  } catch (e) {
    console.error('[APP next/lista-espera]', e.message);
    res.status(500).json({ error: 'Erro ao carregar a lista de espera' });
  }
});







router.post('/next/matriculas/:matriculaId/alocar', authApp, autorizarGestaoNextApp, autorizarEscritaNextApp, limiterNormal, async (req, res) => {
  try {
    const turmaId = req.body?.turma_id;
    if (!turmaId) return res.status(400).json({ error: 'Escolha a turma' });
    const alvo = await turmaGerenciavel(req.nextCtx, turmaId, { escrever: true });
    if (alvo.erro) return res.status(alvo.erro.status).json({ error: alvo.erro.msg });

    const { data: mat } = await supabase.from('next_matriculas')
      .select('id, turma_id, nome, sobrenome').eq('id', req.params.matriculaId)
      .is('deleted_at', null).maybeSingle();
    if (!mat) return res.status(404).json({ error: 'Pessoa não encontrada' });
    if (mat.turma_id) {
      return res.status(409).json({
        error: 'Esta pessoa já está numa turma. Transferir é feito pelo sistema, com a coordenação.',
        codigo: 'ja_tem_turma',
      });
    }



    const { data, error } = await supabase.from('next_matriculas')
      .update({ turma_id: turmaId, updated_at: new Date().toISOString() })
      .eq('id', mat.id).is('turma_id', null).is('deleted_at', null)
      .select('id, turma_id').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(409).json({ error: 'Alguém já alocou esta pessoa.', codigo: 'corrida' });

    await recomputarStatusTurmaApp(turmaId).catch((e) => console.warn('[APP next alocar] recompute:', e.message));
    res.json({ ok: true, id: data.id, turma_id: data.turma_id });
  } catch (e) {
    console.error('[APP next/alocar]', e.message);
    res.status(500).json({ error: 'Erro ao alocar na turma' });
  }
});






router.get('/next/direcionar-opcoes', authApp, autorizarGestaoNextApp, limiterNormal, async (req, res) => {
  try {
    const dataBatismo = await dataProximoBatismoApp();
    const configurados = await batismoHorariosConfiguradosApp();
    let batismo = { data_batismo: dataBatismo || null, horarios: [], indisponivel: true };



    if (dataBatismo && configurados !== null) {
      const ocup = await batismoOcupacaoPorHorarioApp(dataBatismo);
      batismo = { data_batismo: dataBatismo, horarios: horariosBatismoDisponiveis(configurados, ocup) };
    }
    const { data: opcoes, error: eOp } = await supabase.from('vol_form_opcoes')
      .select('id, label, area_canonica').eq('ativo', true).order('ordem', { ascending: true });
    if (eOp) console.warn('[APP next/direcionar-opcoes] vol_form_opcoes:', eOp.message);
    res.json({ batismo, areas: opcoes || [], areas_indisponivel: !!eOp });
  } catch (e) {
    console.error('[APP next/direcionar-opcoes]', e.message);
    res.status(500).json({ error: 'Erro ao carregar as opções de direcionamento' });
  }
});











router.post('/next/matriculas/:matriculaId/direcionar', authApp, autorizarGestaoNextApp, autorizarEscritaNextApp, limiterNormal, async (req, res) => {
  try {
    const { data: mat } = await supabase.from('next_matriculas')
      .select('id, turma_id').eq('id', req.params.matriculaId).is('deleted_at', null).maybeSingle();
    if (!mat) return res.status(404).json({ error: 'Pessoa não encontrada' });


    if (!mat.turma_id) {
      return res.status(409).json({
        error: 'Esta pessoa ainda está na lista de espera. Aloque numa turma antes de direcionar.',
        codigo: 'sem_turma',
      });
    }
    const alvo = await turmaGerenciavel(req.nextCtx, mat.turma_id, { escrever: true });
    if (alvo.erro) return res.status(alvo.erro.status).json({ error: alvo.erro.msg });

    const r = await direcionarMatricula({
      matriculaId: mat.id,
      destinos: req.body?.destinos,
      areas: req.body?.areas,
      horarioBatismo: req.body?.horario_batismo || null,
      userId: req.user?.id || null,
      permitir: ['grupos', 'voluntarios', 'batismo'],
    });
    res.json(r);
  } catch (e) {



    if (e.status) return res.status(e.status).json({ error: e.message, codigo: e.codigo, campo: e.campo });
    console.error('[APP next/direcionar]', e.message);
    res.status(500).json({ error: 'Erro ao direcionar' });
  }
});



router.get('/next/turmas/:turmaId', authApp, autorizarGestaoNextApp, limiterNormal, async (req, res) => {
  try {
    const { turmaId } = req.params;
    const alvo = await turmaGerenciavel(req.nextCtx, turmaId);
    if (alvo.erro) return res.status(alvo.erro.status).json({ error: alvo.erro.msg });
    const { data: encontros } = await supabase.from('next_encontros')
      .select('*').eq('turma_id', turmaId).order('numero');
    const { data: matriculas } = await supabase.from('next_matriculas')
      .select('id, nome, sobrenome, telefone, status, check_in_at, indicou_batismo, indicou_servir, indicou_grupo')
      .eq('turma_id', turmaId).is('deleted_at', null).order('nome');
    const encIds = (encontros || []).map((e) => e.id);
    let presencas = [];
    if (encIds.length) {
      const { data: pres } = await supabase.from('next_presencas')
        .select('encontro_id, matricula_id, presente').in('encontro_id', encIds);
      presencas = pres || [];
    }
    res.json({
      turma: alvo.turma,
      encontros: encontros || [],
      matriculas: matriculas || [],
      presencas,
      sou_responsavel: !!(req.nextCtx.membro?.id && alvo.turma.responsavel_id === req.nextCtx.membro.id),
    });
  } catch (e) {
    console.error('[APP next/turmas/:id]', e.message);
    res.status(500).json({ error: 'Erro ao carregar a turma' });
  }
});



















router.post('/next/turmas/:turmaId/matriculas', authApp, autorizarGestaoNextApp, autorizarEscritaNextApp, limiterStrict, async (req, res) => {
  try {
    const { turmaId } = req.params;
    const alvo = await turmaGerenciavel(req.nextCtx, turmaId, { escrever: true });
    if (alvo.erro) return res.status(alvo.erro.status).json({ error: alvo.erro.msg });

    const nome = String(req.body?.nome || '').trim();
    if (nome.length < 2) return res.status(400).json({ error: 'Informe o nome' });
    const sobrenome = req.body?.sobrenome ? String(req.body.sobrenome).trim() : null;
    const cpfBruto = req.body?.cpf ? String(req.body.cpf) : null;
    const emailBruto = req.body?.email ? String(req.body.email).trim() : null;

    if (cpfBruto && String(cpfBruto).replace(/\D/g, '') && !cpfValidoApp(cpfBruto)) {
      return res.status(400).json({ error: 'CPF inválido — confira os dígitos', campo: 'cpf' });
    }
    if (emailBruto && !emailValidoApp(emailBruto)) {
      return res.status(400).json({ error: 'E-mail inválido', campo: 'email' });
    }
    const cpf = cpfBruto ? String(cpfBruto).replace(/\D/g, '') || null : null;
    const telefone = req.body?.telefone ? String(req.body.telefone).replace(/\D/g, '') || null : null;
    const email = emailBruto ? emailBruto.toLowerCase() : null;
    const nomeCompleto = [nome, sobrenome].filter(Boolean).join(' ').trim();


    let encontro = null;
    if (req.body?.encontro_id) {
      const { data: enc } = await supabase.from('next_encontros')
        .select('id, turma_id').eq('id', req.body.encontro_id).maybeSingle();
      if (!enc || enc.turma_id !== turmaId) {
        return res.status(400).json({ error: 'Encontro não é desta turma', campo: 'encontro_id' });
      }
      encontro = enc;
    }

    let membroId = null;
    try {
      const r = await acharOuCriarGuardado({
        cpf, email, telefone, nome: nomeCompleto,
        dataNascimento: req.body?.data_nascimento || null,
        status: 'visitante', origem: 'next_checkin_app',
      });
      membroId = r?.membro_id || null;
    } catch (e) { console.error('[APP next walkin] matcher:', e.message); }


    if (membroId) {
      const { data: ja } = await supabase.from('next_matriculas').select('id')
        .eq('turma_id', turmaId).eq('membro_id', membroId).is('deleted_at', null)
        .limit(1).maybeSingle();
      if (ja) {
        await marcarPresencaNextApp(encontro?.id, ja.id, true);
        return res.json({ ok: true, id: ja.id, ja_inscrito: true });
      }
    }

    const { data: mat, error: matErr } = await supabase.from('next_matriculas').insert({
      turma_id: turmaId, nome, sobrenome, cpf, telefone, email,
      data_nascimento: req.body?.data_nascimento || null,
      membro_id: membroId, origem: 'app',



      registered_by: req.user?.id ?? null,
      check_in_at: new Date().toISOString(),
    }).select('id').single();
    if (matErr) {
      if (matErr.code === '23505') return res.json({ ok: true, ja_inscrito: true });
      throw matErr;
    }
    await marcarPresencaNextApp(encontro?.id, mat.id, true);
    await registrarObservacaoSegura({
      membroId, origem: 'next_checkin_app', origemId: mat.id,
      nome: nomeCompleto, cpf, telefone, email,
      dataNascimento: req.body?.data_nascimento || null,
    }).catch((e) => console.warn('[APP next walkin] observacao:', e.message));
    await recomputarStatusTurmaApp(turmaId).catch((e) => console.warn('[APP next walkin] recompute:', e.message));
    res.status(201).json({ ok: true, id: mat.id, pessoa_nova: !membroId });
  } catch (e) {
    console.error('[APP next/walkin]', e.message);
    res.status(500).json({ error: 'Erro ao registrar quem chegou' });
  }
});






async function marcarPresencaNextApp(encontroId, matriculaId, presente) {
  if (encontroId) {
    await supabase.from('next_presencas').delete()
      .eq('encontro_id', encontroId).eq('matricula_id', matriculaId);
    if (presente) {
      const { error } = await supabase.from('next_presencas')
        .insert({ encontro_id: encontroId, matricula_id: matriculaId, presente: true });
      if (error) throw error;
    }
  }
  await supabase.from('next_matriculas')
    .update({ check_in_at: presente ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq('id', matriculaId);
}




router.post('/next/encontros/:encontroId/presenca', authApp, autorizarGestaoNextApp, autorizarEscritaNextApp, limiterNormal, async (req, res) => {
  try {
    const { encontroId } = req.params;
    const matriculaId = req.body?.matricula_id;
    const presente = req.body?.presente !== false;
    if (!matriculaId) return res.status(400).json({ error: 'matricula_id obrigatório' });

    const { data: enc } = await supabase.from('next_encontros')
      .select('id, turma_id').eq('id', encontroId).maybeSingle();
    if (!enc) return res.status(404).json({ error: 'Encontro não encontrado' });
    const alvo = await turmaGerenciavel(req.nextCtx, enc.turma_id, { escrever: true });
    if (alvo.erro) return res.status(alvo.erro.status).json({ error: alvo.erro.msg });



    const { data: mat } = await supabase.from('next_matriculas')
      .select('id, turma_id').eq('id', matriculaId).is('deleted_at', null).maybeSingle();
    if (!mat || mat.turma_id !== enc.turma_id) {
      return res.status(400).json({ error: 'Pessoa não é desta turma' });
    }

    await marcarPresencaNextApp(encontroId, matriculaId, presente);


    await recomputarStatusTurmaApp(enc.turma_id).catch((e) => console.warn('[APP next presenca] recompute:', e.message));
    res.json({ ok: true, presente });
  } catch (e) {
    console.error('[APP next/encontros/:id/presenca]', e.message);
    res.status(500).json({ error: 'Erro ao marcar presença' });
  }
});







router.get('/kids/meus-filhos', authApp, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    if (!membro) return res.json({ membro: null, filhos: [], preCheckin: null });

    const { data: vinculos } = await supabase
      .from('kids_responsaveis')
      .select('crianca_id, parentesco, kids_criancas!inner(id, nome, data_nascimento, observacoes_medicas, tem_espectro, tem_alergia, tem_limitacao_fisica, ativo)')
      .eq('membro_id', membro.id)
      .eq('autorizado_buscar', true);

    const filhos = (vinculos || [])
      .map((v) => (Array.isArray(v.kids_criancas) ? v.kids_criancas[0] : v.kids_criancas))
      .filter((c) => c && c.ativo)
      .map((c) => ({
        id: c.id,
        nome: c.nome,
        data_nascimento: c.data_nascimento,
        observacoes_medicas: c.observacoes_medicas || null,
        tem_espectro: c.tem_espectro ?? null,
        tem_alergia: c.tem_alergia ?? null,
        tem_limitacao_fisica: c.tem_limitacao_fisica ?? null,
      }));


    const { data: pre } = await supabase
      .from('kids_pre_checkins')
      .select('id, codigo, crianca_ids, criado_em, expira_em')
      .eq('responsavel_membro_id', membro.id)
      .eq('status', 'pendente')
      .gt('expira_em', new Date().toISOString())
      .order('criado_em', { ascending: false })
      .limit(1)
      .maybeSingle();

    res.json({ membro: { id: membro.id, nome: membro.nome }, filhos, preCheckin: pre || null });
  } catch (e) {
    console.error('[APP] kids/meus-filhos:', e.message);
    res.status(500).json({ error: 'Erro ao carregar' });
  }
});


router.post('/kids/pre-checkin', authApp, limiterStrict, async (req, res) => {
  try {
    const { crianca_ids } = req.body || {};
    if (!Array.isArray(crianca_ids) || crianca_ids.length === 0) {
      return res.status(400).json({ error: 'Selecione ao menos uma criança' });
    }
    const membro = await resolveMembroApp(req);
    if (!membro) return res.status(400).json({ error: 'Cadastro de membro não encontrado' });


    const { data: vinculos } = await supabase
      .from('kids_responsaveis')
      .select('crianca_id')
      .eq('membro_id', membro.id)
      .eq('autorizado_buscar', true)
      .in('crianca_id', crianca_ids);
    const permitidos = new Set((vinculos || []).map((v) => v.crianca_id));
    if (crianca_ids.some((id) => !permitidos.has(id))) {
      return res.status(403).json({ error: 'Você só pode preparar o check-in dos seus filhos.' });
    }


    await supabase
      .from('kids_pre_checkins')
      .update({ status: 'cancelado' })
      .eq('responsavel_membro_id', membro.id)
      .eq('status', 'pendente');

    const { data: codigoRow } = await supabase.rpc('fn_kids_pre_checkin_codigo');
    const codigo = codigoRow || Math.random().toString(36).slice(2, 8).toUpperCase();
    const expira = new Date(Date.now() + 12 * 3600 * 1000).toISOString();

    const { data: criado, error } = await supabase
      .from('kids_pre_checkins')
      .insert({
        codigo,
        responsavel_membro_id: membro.id,
        responsavel_nome: membro.nome,
        responsavel_telefone: membro.telefone || null,
        crianca_ids,
        expira_em: expira,
      })
      .select('id, codigo, crianca_ids, expira_em')
      .single();
    if (error) throw error;


    wpp.notificarMembro(membro.id, 'kids_precheckin', [codigo]).catch(() => {});

    res.status(201).json(criado);
  } catch (e) {
    console.error('[APP] kids/pre-checkin:', e.message);
    res.status(500).json({ error: 'Não foi possível gerar o check-in' });
  }
});



router.get('/kids/filho/:id', authApp, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    if (!membro) return res.status(400).json({ error: 'Cadastro não encontrado' });

    const { data: vinc } = await supabase
      .from('kids_responsaveis')
      .select('id, parentesco')
      .eq('membro_id', membro.id)
      .eq('crianca_id', req.params.id)
      .eq('autorizado_buscar', true)
      .maybeSingle();
    if (!vinc) return res.status(403).json({ error: 'Você não é responsável autorizado desta criança.' });

    const { data: c } = await supabase
      .from('kids_criancas')
      .select('id, nome, data_nascimento, foto_url, foto_storage_path, foto_consentimento_em, observacoes_medicas, necessidades_especiais, tem_espectro, espectro_qual, tem_alergia, alergia_qual, tem_limitacao_fisica, limitacao_fisica_qual')
      .eq('id', req.params.id)
      .eq('ativo', true)
      .maybeSingle();
    if (!c) return res.status(404).json({ error: 'Criança não encontrada' });


    let fotoUrl = null;
    if (c.foto_consentimento_em) {
      if (c.foto_storage_path) {
        const { data: signed } = await supabase.storage.from('kids-documentos').createSignedUrl(c.foto_storage_path, 60 * 30);
        fotoUrl = signed?.signedUrl || null;
      } else {
        fotoUrl = c.foto_url;
      }
    }

    const idadeMeses = c.data_nascimento
      ? Math.floor((Date.now() - new Date(c.data_nascimento).getTime()) / (1000 * 60 * 60 * 24 * 30.44))
      : null;


    let salaSugerida = null;
    if (idadeMeses != null) {
      const { data: salas } = await supabase
        .from('kids_salas')
        .select('nome, cor, faixa_etaria_min_meses, faixa_etaria_max_meses')
        .eq('ativo', true);
      const s = (salas || []).find((x) => x.faixa_etaria_min_meses <= idadeMeses && x.faixa_etaria_max_meses >= idadeMeses);
      if (s) salaSugerida = { nome: s.nome, cor: s.cor };
    }


    const { data: checkins } = await supabase
      .from('kids_checkins')
      .select('id, checkin_at, checkout_at, fez_decisao_jesus, sala:kids_salas(nome, cor), sessao:kids_sessoes(culto:cultos(nome, data))')
      .eq('crianca_id', req.params.id)
      .order('checkin_at', { ascending: false })
      .limit(20);

    const historico = (checkins || []).map((k) => {
      const sala = Array.isArray(k.sala) ? k.sala[0] : k.sala;
      const sessao = Array.isArray(k.sessao) ? k.sessao[0] : k.sessao;
      const culto = sessao && (Array.isArray(sessao.culto) ? sessao.culto[0] : sessao.culto);
      return {
        id: k.id,
        checkin_at: k.checkin_at,
        checkout_at: k.checkout_at,
        decisao: !!k.fez_decisao_jesus,
        sala: sala?.nome || null,
        cor: sala?.cor || null,
        culto: culto?.nome || null,
        data: culto?.data || null,
      };
    });

    res.json({
      crianca: {
        id: c.id,
        nome: c.nome,
        data_nascimento: c.data_nascimento,
        idade_meses: idadeMeses,
        observacoes_medicas: c.observacoes_medicas || null,
        necessidades_especiais: c.necessidades_especiais || null,
        tem_espectro: c.tem_espectro ?? null,
        espectro_qual: c.espectro_qual || null,
        tem_alergia: c.tem_alergia ?? null,
        alergia_qual: c.alergia_qual || null,
        tem_limitacao_fisica: c.tem_limitacao_fisica ?? null,
        limitacao_fisica_qual: c.limitacao_fisica_qual || null,
        parentesco: vinc.parentesco || null,
        foto_url: fotoUrl,
        foto_consentida: !!c.foto_consentimento_em,
      },
      sala_sugerida: salaSugerida,
      total_checkins: historico.length,
      historico,
    });
  } catch (e) {
    console.error('[APP] kids/filho:', e.message);
    res.status(500).json({ error: 'Erro ao carregar' });
  }
});


async function ehResponsavelAutorizado(membroId, criancaId) {
  const { data } = await supabase
    .from('kids_responsaveis').select('id')
    .eq('membro_id', membroId).eq('crianca_id', criancaId).eq('autorizado_buscar', true)
    .maybeSingle();
  return !!data;
}





router.post('/kids/filho/:id/foto', authApp, limiterStrict, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    if (!membro) return res.status(400).json({ error: 'Cadastro não encontrado' });
    const { storage_path, consentimento, versao_consentimento } = req.body || {};
    if (consentimento !== true) {
      return res.status(400).json({ error: 'É necessário autorizar o uso da imagem da criança.' });
    }
    if (!storage_path || typeof storage_path !== 'string') {
      return res.status(400).json({ error: 'Arquivo inválido' });
    }
    if (!storage_path.startsWith(`${req.user.id}/`)) {
      return res.status(403).json({ error: 'Caminho inválido' });
    }
    if (!(await ehResponsavelAutorizado(membro.id, req.params.id))) {
      return res.status(403).json({ error: 'Você não é responsável autorizado desta criança.' });
    }

    const { error } = await supabase.from('kids_criancas').update({
      foto_storage_path: storage_path,
      foto_url: null,
      foto_consentimento_em: new Date().toISOString(),
      foto_consentimento_por: req.user.id,
      foto_consentimento_versao: (versao_consentimento || 'eca-lgpd-v1').toString().slice(0, 40),
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.id).eq('ativo', true);
    if (error) throw error;

    const { data: signed } = await supabase.storage.from('kids-documentos').createSignedUrl(storage_path, 60 * 30);
    res.json({ ok: true, foto_url: signed?.signedUrl || null });
  } catch (e) {
    console.error('[APP] kids/foto:', e.message);
    res.status(500).json({ error: 'Erro ao salvar a foto' });
  }
});


router.post('/kids/filho/:id/foto/remover', authApp, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    if (!membro) return res.status(400).json({ error: 'Cadastro não encontrado' });
    if (!(await ehResponsavelAutorizado(membro.id, req.params.id))) {
      return res.status(403).json({ error: 'Você não é responsável autorizado desta criança.' });
    }
    const { data: c } = await supabase.from('kids_criancas')
      .select('foto_storage_path').eq('id', req.params.id).maybeSingle();
    const { error } = await supabase.from('kids_criancas').update({
      foto_storage_path: null,
      foto_url: null,
      foto_consentimento_em: null,
      foto_consentimento_por: null,
      foto_consentimento_versao: null,
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.id);
    if (error) throw error;
    if (c?.foto_storage_path) {
      try { await supabase.storage.from('kids-documentos').remove([c.foto_storage_path]); } catch {                   }
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[APP] kids/foto remover:', e.message);
    res.status(500).json({ error: 'Erro ao remover a foto' });
  }
});




router.post('/kids/filho/:id/saude', authApp, limiterStrict, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    if (!membro) return res.status(400).json({ error: 'Cadastro não encontrado' });
    if (!(await ehResponsavelAutorizado(membro.id, req.params.id))) {
      return res.status(403).json({ error: 'Você não é responsável autorizado desta criança.' });
    }
    const {
      tem_espectro, espectro_qual, tem_alergia, alergia_qual,
      tem_limitacao_fisica, limitacao_fisica_qual, observacoes_medicas,
    } = req.body || {};

    const bool = (v) => (v === true ? true : (v === false ? false : null));
    const txt = (cond, v) => (cond && v ? String(v).trim().slice(0, 500) : null);

    const { error } = await supabase.from('kids_criancas').update({
      tem_espectro: bool(tem_espectro),
      espectro_qual: txt(tem_espectro === true, espectro_qual),
      tem_alergia: bool(tem_alergia),
      alergia_qual: txt(tem_alergia === true, alergia_qual),
      tem_limitacao_fisica: bool(tem_limitacao_fisica),
      limitacao_fisica_qual: txt(tem_limitacao_fisica === true, limitacao_fisica_qual),
      observacoes_medicas: observacoes_medicas ? String(observacoes_medicas).trim().slice(0, 1000) : null,
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.id).eq('ativo', true);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[APP] kids/saude:', e.message);
    res.status(500).json({ error: 'Erro ao salvar as informações de saúde' });
  }
});







router.post('/kids/solicitar-vinculo', authApp, limiterStrict, async (req, res) => {
  try {
    const {
      crianca_nome, crianca_data_nascimento, parentesco, observacao,
      mae_nome, pai_nome, serie, necessidade_especial,
      consent_marketing, consent_marketing_versao,
      crianca_foto_path, foto_consentimento, foto_consentimento_versao,
      foto_mae_path, foto_pai_path,

      tem_espectro, espectro_qual, tem_alergia, alergia_qual,
      tem_limitacao_fisica, limitacao_fisica_qual, observacoes_medicas,

      crianca_doc_path, doc_pai_path, doc_mae_path,
    } = req.body || {};

    if (!crianca_nome || !String(crianca_nome).trim()) {
      return res.status(400).json({ error: 'Informe o nome da criança' });
    }
    const temNomePais = (mae_nome && String(mae_nome).trim()) || (pai_nome && String(pai_nome).trim());
    const temDocLegado = doc_pai_path || doc_mae_path;
    if (!temNomePais && !temDocLegado) {
      return res.status(400).json({ error: 'Informe o nome da mãe e/ou do pai' });
    }



    const prefixo = `${req.user.id}/`;
    const paths = [crianca_foto_path, crianca_doc_path, doc_pai_path, doc_mae_path, foto_mae_path, foto_pai_path].filter(Boolean);
    if (paths.some((p) => !String(p).startsWith(prefixo))) {
      return res.status(403).json({ error: 'Arquivo inválido.' });
    }

    const membro = await resolveMembroApp(req);
    if (!membro) return res.status(400).json({ error: 'Complete seu cadastro de membro antes de solicitar.' });

    if (!membro.nome || !String(membro.nome).trim()) return res.status(400).json({ error: 'Complete seu nome no perfil antes de cadastrar a criança.' });
    if (!membro.telefone || !String(membro.telefone).trim()) return res.status(400).json({ error: 'Cadastre seu telefone no perfil antes de cadastrar a criança.' });

    const parentescosOk = ['mae', 'pai', 'avo_a', 'tio_a', 'tutor', 'outro'];
    const parent = parentescosOk.includes(parentesco) ? parentesco : 'outro';
    const comFoto = !!(crianca_foto_path && foto_consentimento);

    const { data: criado, error } = await supabase
      .from('kids_vinculo_solicitacoes')
      .insert({
        solicitante_membro_id: membro.id,
        solicitante_nome: membro.nome,
        solicitante_telefone: membro.telefone || null,
        solicitante_parentesco: parent,
        crianca_nome: String(crianca_nome).trim(),
        crianca_data_nascimento: crianca_data_nascimento || null,
        mae_nome: mae_nome ? String(mae_nome).trim() : null,
        pai_nome: pai_nome ? String(pai_nome).trim() : null,
        serie: serie ? String(serie).trim().slice(0, 80) : null,
        necessidade_especial: necessidade_especial ? String(necessidade_especial).trim().slice(0, 500) : null,
        consent_marketing: consent_marketing === true ? true : (consent_marketing === false ? false : null),
        consent_marketing_em: (consent_marketing === true || consent_marketing === false) ? new Date().toISOString() : null,
        consent_marketing_versao: (consent_marketing === true || consent_marketing === false) ? (consent_marketing_versao || 'felca-eca-digital-v1') : null,
        foto_mae_path: foto_mae_path || null,
        foto_pai_path: foto_pai_path || null,
        crianca_foto_path: comFoto ? crianca_foto_path : null,
        foto_consentimento_em: comFoto ? new Date().toISOString() : null,
        foto_consentimento_versao: comFoto ? (foto_consentimento_versao || 'eca-lgpd-v1') : null,
        crianca_doc_path: crianca_doc_path || null,
        doc_pai_path: doc_pai_path || null,
        doc_mae_path: doc_mae_path || null,
        tem_espectro: tem_espectro === true ? true : (tem_espectro === false ? false : null),
        espectro_qual: tem_espectro === true && espectro_qual ? String(espectro_qual).trim().slice(0, 500) : null,
        tem_alergia: tem_alergia === true ? true : (tem_alergia === false ? false : null),
        alergia_qual: tem_alergia === true && alergia_qual ? String(alergia_qual).trim().slice(0, 500) : null,
        tem_limitacao_fisica: tem_limitacao_fisica === true ? true : (tem_limitacao_fisica === false ? false : null),
        limitacao_fisica_qual: tem_limitacao_fisica === true && limitacao_fisica_qual ? String(limitacao_fisica_qual).trim().slice(0, 500) : null,
        observacoes_medicas: observacoes_medicas ? String(observacoes_medicas).trim().slice(0, 1000) : null,
        observacao: observacao ? String(observacao).trim() : null,
      })
      .select('id, status, created_at')
      .single();
    if (error) throw error;

    notificar({
      modulo: 'kids',
      tipo: 'kids_vinculo_solicitacao',
      titulo: 'Nova solicitação de vínculo Kids',
      mensagem: `${membro.nome} pediu vínculo com ${String(crianca_nome).trim()}. Confira e aprove.`,
      link: '/ministerial/totem-kids/vinculos',
      severidade: 'aviso',
      chaveDedup: `kids_vinculo_${criado.id}`,
    }).catch((e) => console.warn('[APP] solicitar-vinculo · notificar:', e.message));

    res.status(201).json(criado);
  } catch (e) {
    console.error('[APP] kids/solicitar-vinculo:', e.message);
    res.status(500).json({ error: 'Não foi possível enviar a solicitação' });
  }
});


router.get('/whatsapp-optin', authApp, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    if (!membro) return res.json({ optin: false, optin_em: null });
    const { data } = await supabase
      .from('mem_membros')
      .select('whatsapp_optin, whatsapp_optin_em')
      .eq('id', membro.id)
      .maybeSingle();
    res.json({ optin: !!data?.whatsapp_optin, optin_em: data?.whatsapp_optin_em || null });
  } catch (e) {
    console.error('[APP] whatsapp-optin get:', e.message);
    res.status(500).json({ error: 'Erro ao carregar preferência' });
  }
});


router.post('/whatsapp-optin', authApp, async (req, res) => {
  try {
    const optin = !!req.body?.optin;
    const membro = await resolveMembroApp(req);
    if (!membro) return res.status(400).json({ error: 'Cadastro de membro não encontrado' });
    const { error } = await supabase
      .from('mem_membros')
      .update({ whatsapp_optin: optin, whatsapp_optin_em: new Date().toISOString() })
      .eq('id', membro.id);
    if (error) throw error;
    res.json({ ok: true, optin });
  } catch (e) {
    console.error('[APP] whatsapp-optin post:', e.message);
    res.status(500).json({ error: 'Não foi possível salvar' });
  }
});


router.get('/kids/minhas-solicitacoes', authApp, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    if (!membro) return res.json({ solicitacoes: [] });

    const { data } = await supabase
      .from('kids_vinculo_solicitacoes')
      .select('id, crianca_nome, status, motivo_rejeicao, created_at, decidido_em')
      .eq('solicitante_membro_id', membro.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(20);

    res.json({ solicitacoes: data || [] });
  } catch (e) {
    console.error('[APP] kids/minhas-solicitacoes:', e.message);
    res.status(500).json({ error: 'Erro ao carregar solicitações' });
  }
});






function proximoEncontroISO(diaSemana, horario, excecoes, recorrencia, ancoraISO) {
  const p = proximoEncontro({
    diaSemana, horario, recorrencia, ancoraISO: ancoraISO || null,
    excecoes: excecoes || [],
  });
  return p ? p.inicio : null;
}




router.get('/meu-grupo', authApp, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    if (!membro) return res.json({ grupos: [] });
    const GSEL = 'id, nome, dia_semana, horario, recorrencia, local, endereco, bairro, complemento, lat, lng, foto_url, lider_id';



    const excecoesPorGrupo = {};
    async function carregarExcecoes(ids) {
      if (!ids.length) return;
      try {
        const { data, error } = await supabase.from('mem_grupo_agenda_excecoes')
          .select('grupo_id, data_original, status, nova_data, novo_horario, motivo')
          .in('grupo_id', ids).gte('data_original', new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
        if (error) throw error;
        for (const e of data || []) (excecoesPorGrupo[e.grupo_id] ||= []).push(e);
      } catch (e) { console.warn('[APP] agenda excecoes indisponivel:', e.message); }
    }
    const { data: vinculos } = await supabase
      .from('mem_grupo_membros')
      .select(`grupo_id, funcao, mem_grupos(${GSEL})`)
      .eq('membro_id', membro.id)
      .is('saiu_em', null)
      .is('deleted_at', null);




    const porId = new Map();
    for (const v of vinculos || []) {
      const g = Array.isArray(v.mem_grupos) ? v.mem_grupos[0] : v.mem_grupos;
      if (g) porId.set(g.id, { g, funcao: v.funcao });
    }
    const { data: liderados } = await supabase
      .from('mem_grupos').select(GSEL)
      .eq('lider_id', membro.id).is('deleted_at', null);
    for (const g of liderados || []) {
      const atual = porId.get(g.id);
      if (atual) atual.funcao = 'lider';
      else porId.set(g.id, { g, funcao: 'lider' });
    }

    await carregarExcecoes([...porId.keys()]);


    const ancorasMeuGrupo = await ancorasDeGrupos([...porId.keys()]);

    const grupos = [];
    for (const { g, funcao } of porId.values()) {
      if (!g) continue;
      let lider = null;
      if (g.lider_id) {
        const { data: l } = await supabase.from('mem_membros').select('nome, telefone').eq('id', g.lider_id).maybeSingle();
        if (l) lider = { nome: l.nome, telefone: l.telefone };
      }
      const { data: docs } = await supabase
        .from('mem_grupo_documentos')
        .select('id, nome, comentario, storage_path, created_at')
        .contains('grupo_ids', [g.id])
        .order('created_at', { ascending: false })
        .limit(15);
      const materiais = (docs || []).map((d) => ({
        id: d.id,
        nome: d.nome,
        comentario: d.comentario || null,
        url: d.storage_path ? supabase.storage.from('eventos-anexos').getPublicUrl(d.storage_path).data.publicUrl : null,
      }));
      grupos.push({
        id: g.id, nome: g.nome, dia_semana: g.dia_semana, horario: g.horario,
        local: g.local, endereco: g.endereco, bairro: g.bairro, complemento: g.complemento,
        lat: g.lat, lng: g.lng,
        foto_url: g.foto_url, funcao, lider,
        proximo_encontro: proximoEncontroISO(g.dia_semana, g.horario, excecoesPorGrupo[g.id] || [], g.recorrencia, ancorasMeuGrupo[g.id]),
        proximas_ocorrencias: proximasOcorrencias({
          diaSemana: g.dia_semana, horario: g.horario,
          recorrencia: g.recorrencia, ancoraISO: ancorasMeuGrupo[g.id] || null,
          excecoes: excecoesPorGrupo[g.id] || [], quantas: 6,
        }),
        materiais,
      });
    }
    res.json({ grupos });
  } catch (e) {
    console.error('[APP] meu-grupo:', e.message);
    res.status(500).json({ error: 'Erro ao carregar seu grupo' });
  }
});


router.get('/videos', authApp, async (req, res) => {
  try {
    const channelId = process.env.YOUTUBE_CHANNEL_ID || 'UCfjMVzaYlCS_VE3JuEJj2vQ';
    const { data: videos } = await supabase
      .from('online_videos')
      .select('video_id, titulo, thumbnail_url, publicado_em, duration_seconds, serie:online_series(titulo)')
      .order('publicado_em', { ascending: false })
      .limit(30);
    const { data: series } = await supabase
      .from('online_series')
      .select('playlist_id, titulo, thumbnail_url, total_videos')
      .order('publicada_em', { ascending: false, nullsFirst: false })
      .limit(20);

    res.json({
      canal_live: `https://www.youtube.com/channel/${channelId}/live`,
      videos: (videos || []).map((v) => ({
        video_id: v.video_id,
        titulo: v.titulo,
        thumbnail_url: v.thumbnail_url,
        publicado_em: v.publicado_em,
        duration_seconds: v.duration_seconds,
        serie: Array.isArray(v.serie) ? v.serie[0]?.titulo : v.serie?.titulo || null,
      })),
      series: series || [],
    });
  } catch (e) {
    console.error('[APP] videos:', e.message);
    res.status(500).json({ error: 'Erro ao carregar vídeos' });
  }
});





const PENSE_HANDLE = process.env.YOUTUBE_PENSE_HANDLE || 'CanalPense';
let _penseCache = { at: 0, uploads: null, video: null };
router.get('/pense-ultimo', authApp, async (req, res) => {
  try {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) return res.json({ video: null });

    const TTL = 3 * 60 * 60 * 1000;
    if (_penseCache.video && Date.now() - _penseCache.at < TTL) {
      return res.json({ video: _penseCache.video });
    }

    const yt = async (path) => {
      const r = await fetch(`https://www.googleapis.com/youtube/v3/${path}&key=${apiKey}`);
      if (!r.ok) throw new Error(`YouTube ${r.status}`);
      return r.json();
    };


    let uploads = _penseCache.uploads;
    if (!uploads) {
      const ch = await yt(`channels?part=contentDetails&forHandle=${encodeURIComponent(PENSE_HANDLE)}`);
      uploads = ch?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads || null;
      _penseCache.uploads = uploads;
    }
    if (!uploads) return res.json({ video: null });


    const pl = await yt(`playlistItems?part=snippet&maxResults=1&playlistId=${uploads}`);
    const sn = pl?.items?.[0]?.snippet;
    const videoId = sn?.resourceId?.videoId;
    if (!videoId) return res.json({ video: null });

    const th = sn.thumbnails || {};
    const video = {
      video_id: videoId,
      titulo: sn.title || 'Pense',
      thumbnail_url: (th.maxres || th.high || th.medium || th.default)?.url || null,
      publicado_em: sn.publishedAt || null,
    };
    _penseCache = { at: Date.now(), uploads, video };
    res.json({ video });
  } catch (e) {
    console.error('[APP] pense-ultimo:', e.message);
    res.json({ video: _penseCache.video || null });
  }
});







const { cultoDeAgora } = require('../services/cultoDeAgora');
const { filtroSoEventosCbrio, idsEventosParceiros } = require('../services/igrejaParceira');


router.get('/culto/agora', authApp, async (req, res) => {
  try {
    const channelId = process.env.YOUTUBE_CHANNEL_ID || 'UCfjMVzaYlCS_VE3JuEJj2vQ';
    const hoje = hojeBRT();
    const { culto, ao_vivo } = await cultoDeAgora();

    let jaRegistrou = false;
    const membro = await resolveMembroApp(req).catch(() => null);
    if (membro?.id) {
      const { data: pend } = await supabase
        .from('app_decisoes').select('id')
        .eq('membro_id', membro.id).eq('status', 'pendente').is('deleted_at', null)
        .gte('criada_em', `${hoje}T00:00:00`).limit(1);
      jaRegistrou = (pend || []).length > 0;
    }
    res.json({
      culto: culto || null,
      ao_vivo,
      canal_live: `https://www.youtube.com/channel/${channelId}/live`,
      jaRegistrou,
    });
  } catch (e) {
    console.error('[APP] culto/agora:', e.message);
    res.status(500).json({ error: 'Erro ao carregar o culto' });
  }
});



router.post('/culto/decisao', authApp, limiterNormal, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req).catch(() => null);
    if (!membro?.id) return res.status(400).json({ error: 'Complete seu cadastro de membro primeiro.' });

    const ambiente = ['presencial', 'online'].includes(req.body?.ambiente) ? req.body.ambiente : 'presencial';
    const tipo = ['aceitar', 'reconciliacao', 'rededicacao', 'batismo', 'outro'].includes(req.body?.tipo) ? req.body.tipo : null;
    const observacao = (req.body?.observacao || '').toString().trim().slice(0, 500) || null;
    const hoje = hojeBRT();


    const { data: pend } = await supabase
      .from('app_decisoes').select('id')
      .eq('membro_id', membro.id).eq('status', 'pendente').is('deleted_at', null)
      .gte('criada_em', `${hoje}T00:00:00`).limit(1);
    if ((pend || []).length) return res.json({ ok: true, jaRegistrou: true });





    const { culto } = await cultoDeAgora();

    const { error } = await supabase.from('app_decisoes').insert({
      membro_id: membro.id, culto_id: culto?.id || null, ambiente, tipo, observacao, status: 'pendente',
    });
    if (error) throw error;

    try {
      await notificar({
        modulo: 'integracao',
        tipo: 'decisao_app',
        titulo: 'Nova decisão de fé pelo app 🙌',
        mensagem: `${membro.nome} registrou uma decisão pelo app. Confirme na aba Decisões.`,
        link: '/integracao?tab=vis_decisoes',
        chaveDedup: `decisao_app-${membro.id}-${hoje}`,
      });
    } catch (e) { console.warn('[APP] notificar decisao_app:', e.message); }

    res.json({ ok: true, jaRegistrou: true });
  } catch (e) {
    console.error('[APP] culto/decisao:', e.message);
    res.status(500).json({ error: 'Erro ao registrar decisão' });
  }
});


router.get('/comunicados', authApp, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req).catch(() => null);
    const segmentos = ['todos'];
    if (membro?.id) {
      const { data: m } = await supabase.from('mem_membros').select('frequenta_area').eq('id', membro.id).maybeSingle();
      if (m?.frequenta_area) segmentos.push(m.frequenta_area);
    }
    const { data } = await supabase
      .from('comunicados')
      .select('id, titulo, corpo, foto_url, segmento, publicado_em')
      .eq('status', 'publicado')
      .is('deleted_at', null)
      .in('segmento', segmentos)
      .order('publicado_em', { ascending: false })
      .limit(50);
    res.json({ comunicados: data || [] });
  } catch (e) {
    console.error('[APP] comunicados:', e.message);
    res.status(500).json({ error: 'Erro ao carregar comunicados' });
  }
});




router.post('/telemetria', tryAuth, async (req, res) => {
  try {
    const { normalizeMobileTelemetryBatch } = require('../services/systemMobileOps');
    const rows = normalizeMobileTelemetryBatch(req.body?.eventos, req.user?.id || null);
    if (!rows.length) return res.json({ ok: true, gravados: 0 });
    const { error } = await supabase.from('app_eventos').upsert(rows, {
      onConflict: 'event_id',
      ignoreDuplicates: true,
    });
    if (error) throw error;
    res.json({ ok: true, gravados: rows.length });
  } catch (e) {
    console.warn('[APP] telemetria:', e.message);






    try {
      const dia = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
      await notificar({
        modulo: 'dashboard',
        tipo: 'telemetria_app_falhando',
        titulo: 'Telemetria do app não está gravando',
        mensagem: `A ingestão de eventos do app está falhando: ${e.message}. Enquanto isso, o painel de uso do app fica sem dado novo.`,
        severidade: 'alta',
        link: '/admin/app-analytics',
        chaveDedup: `telemetria_app_falha_${dia}`,
      });
    } catch {                                                      }
    res.json({ ok: false });
  }
});

























async function permissaoModuloApp(req, slug) {
  const email = String(req.user?.email || '').trim().toLowerCase();
  if (!email) return { leitura: 0, escrita: 0, superadmin: false };
  if (await isSuperAdminEmail(email)) return { leitura: 5, escrita: 5, superadmin: true };

  const { data: prof } = await supabase.from('profiles')
    .select('role').eq('id', req.user.id).maybeSingle();
  if (prof && ['admin', 'diretor'].includes(prof.role)) {
    return { leitura: 5, escrita: 5, superadmin: false };
  }

  const { data: permUser } = await supabase.from('usuarios')
    .select('id, cargo_id').eq('email', email).eq('ativo', true).maybeSingle();
  if (!permUser) return { leitura: 0, escrita: 0, superadmin: false };
  const [overridesRes, modulos, cargoMatrix, userAreasRes] = await Promise.all([
    supabase.from('permissoes_modulo')
      .select('modulo_id, nivel_leitura, nivel_escrita, pode_exportar, pode_aprovar, escopo_proprio, expira_em')
      .eq('usuario_id', permUser.id),
    getModulos(),
    getCargoMatrix(permUser.cargo_id),
    supabase.from('usuario_areas').select('areas(nome)').eq('usuario_id', permUser.id),
  ]);
  const agora = Date.now();
  const overrides = (overridesRes.data || []).filter(o => !o.expira_em || new Date(o.expira_em).getTime() > agora);
  const areas = (userAreasRes.data || []).map(ua => ua.areas?.nome).filter(Boolean);
  const perms = resolveEffectivePerms({ overrides, cargoMatrix, cargoId: permUser.cargo_id, modulos, areas });
  const p = perms[slug] || {};
  return { leitura: Number(p.leitura || 0), escrita: Number(p.escrita || 0), superadmin: false };
}

async function autorizarGestaoBatismoApp(req, res, next) {
  try {
    const permissao = await permissaoModuloApp(req, 'batismo');
    if (Math.max(permissao.leitura, permissao.escrita) < 2) {
      return res.status(403).json({ error: 'Esta área é só para quem gerencia o Batismo.' });
    }
    req.batismoPermissao = permissao;
    next();
  } catch (e) {
    console.error('[APP] batismo/permissao:', e.message);
    res.status(500).json({ error: 'Erro ao verificar a permissão de Batismo.' });
  }
}

function dataIsoValida(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')); }
function dataBatismoFutura(v) { return dataIsoValida(v) && String(v) >= hojeBRT(); }
function limparTexto(v, max = 500) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

const BATISMO_COLUNAS_APP = [
  'id', 'membro_id', 'nome', 'sobrenome', 'telefone', 'email', 'cpf',
  'data_nascimento', 'data_batismo', 'horario_culto', 'status', 'checkin_em',
  'tamanho_camisa', 'eh_crianca', 'possui_deficiencia',
  'deficiencia_descricao', 'observacoes', 'endereco', 'area_kpi', 'created_at',
].join(', ');

router.get('/batismo/papel', authApp, limiterNormal, async (req, res) => {
  try {
    const p = await permissaoModuloApp(req, 'batismo');
    const nivel = Math.max(p.leitura, p.escrita);
    res.json({ pode_gerenciar: nivel >= 2, nivel, superadmin: p.superadmin });
  } catch (e) {
    console.error('[APP] batismo/papel:', e.message);
    res.status(500).json({ error: 'Erro ao carregar seu acesso ao Batismo.' });
  }
});

router.get('/batismo/gestao', authApp, autorizarGestaoBatismoApp, limiterNormal, async (req, res) => {
  try {
    const hoje = hojeBRT();
    const [datasRes, proxima, horarios] = await Promise.all([
      supabase.from('batismo_inscricoes').select('data_batismo')
        .is('deleted_at', null).not('status', 'in', '(cancelado,rejeitado)')
        .not('data_batismo', 'is', null),
      dataProximoBatismo(),
      batismoHorariosConfigurados(),
    ]);
    if (datasRes.error) throw datasRes.error;
    const datasSet = new Set((datasRes.data || []).map(x => x.data_batismo).filter(dataIsoValida));
    if (dataIsoValida(proxima)) datasSet.add(proxima);


    const datas = [...datasSet].filter(d => d >= hoje).sort().slice(0, 3);
    const datasPermitidas = new Set(datas);
    const pedida = dataIsoValida(req.query.data) ? String(req.query.data) : null;
    const selecionada = pedida && datasPermitidas.has(pedida)
      ? pedida
      : (datas[0] || (dataIsoValida(proxima) ? proxima : hoje));
    const [pessoasRes, aprovacoesRes] = await Promise.all([
      supabase.from('batismo_inscricoes').select(BATISMO_COLUNAS_APP)
        .eq('data_batismo', selecionada).is('deleted_at', null)
        .not('status', 'in', '(cancelado,rejeitado)')
        .order('horario_culto', { ascending: true, nullsFirst: false }).order('nome'),
      supabase.from('batismo_inscricoes').select(BATISMO_COLUNAS_APP)
        .eq('status', 'pendente').is('deleted_at', null).order('created_at'),
    ]);
    if (pessoasRes.error) throw pessoasRes.error;
    if (aprovacoesRes.error) throw aprovacoesRes.error;
    const pessoas = pessoasRes.data || [];
    res.json({
      data: selecionada, datas, hoje, pessoas, aprovacoes: aprovacoesRes.data || [],
      resumo: {
        previstos: pessoas.length,
        presentes: pessoas.filter(p => !!p.checkin_em).length,
        aguardando: (aprovacoesRes.data || []).length,
      },
      horarios: Array.isArray(horarios)
        ? horarios.filter(h => h.aberto !== false).map(h => ({ horario: h.horario, label: h.label || h.horario }))
        : [],
    });
  } catch (e) {
    console.error('[APP] batismo/gestao:', e.message);
    res.status(500).json({ error: 'Erro ao carregar a gestão do Batismo.' });
  }
});

router.post('/batismo/gestao/pessoas', authApp, autorizarGestaoBatismoApp, limiterNormal, async (req, res) => {
  try {
    const nome = limparTexto(req.body?.nome, 120);
    const sobrenome = limparTexto(req.body?.sobrenome, 120);
    const dataBatismo = dataIsoValida(req.body?.data_batismo) ? String(req.body.data_batismo) : await dataProximoBatismo();
    if (!nome || !sobrenome) return res.status(400).json({ error: 'Nome e sobrenome são obrigatórios.' });
    if (!dataIsoValida(dataBatismo)) return res.status(400).json({ error: 'Selecione uma data de Batismo.' });
    if (!dataBatismoFutura(dataBatismo)) return res.status(400).json({ error: 'A data de Batismo já passou.' });
    const cpf = String(req.body?.cpf || '').replace(/\D/g, '') || null;
    let membroId = null;
    try {
      const vinculo = await acharOuCriarGuardado({
        cpf, email: limparTexto(req.body?.email, 180), telefone: limparTexto(req.body?.telefone, 40),
        nome: `${nome} ${sobrenome}`,
        dataNascimento: dataIsoValida(req.body?.data_nascimento) ? req.body.data_nascimento : null,
        status: 'visitante', origem: 'batismo_app_gestao',
      });
      membroId = vinculo.membro_id || null;
    } catch (e) { console.warn('[APP] batismo/gestao/pessoas · vínculo:', e.message); }
    const { data, error } = await supabase.from('batismo_inscricoes').insert({
      membro_id: membroId, nome, sobrenome,
      telefone: limparTexto(req.body?.telefone, 40), email: limparTexto(req.body?.email, 180), cpf,
      data_nascimento: dataIsoValida(req.body?.data_nascimento) ? req.body.data_nascimento : null,
      data_batismo: dataBatismo, horario_culto: limparTexto(req.body?.horario_culto, 40),
      tamanho_camisa: limparTexto(req.body?.tamanho_camisa, 12)?.toUpperCase() || null,
      endereco: limparTexto(req.body?.endereco, 300),
      observacoes: limparTexto(req.body?.observacoes, 1000),
      status: 'confirmado', origem: 'app_gestao_batismo', inscrito_por: req.user.id,
      area_kpi: ['kids', 'sede', 'bridge', 'ami', 'online'].includes(req.body?.area_kpi) ? req.body.area_kpi : 'sede',
    }).select(BATISMO_COLUNAS_APP).single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('[APP] batismo/gestao/pessoas POST:', e.message);
    res.status(500).json({ error: 'Erro ao adicionar a pessoa ao Batismo.' });
  }
});

router.post('/batismo/gestao/:id/aprovar', authApp, autorizarGestaoBatismoApp, limiterNormal, async (req, res) => {
  try {
    const { data: atual, error: buscaErr } = await supabase.from('batismo_inscricoes')
      .select('id, status, data_batismo').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (buscaErr) throw buscaErr;
    if (!atual) return res.status(404).json({ error: 'Inscrição não encontrada.' });
    if (atual.status !== 'pendente') return res.status(409).json({ error: 'Esta solicitação já foi tratada.' });
    const dataBatismo = dataIsoValida(req.body?.data_batismo)
      ? String(req.body.data_batismo) : (atual.data_batismo || await dataProximoBatismo());
    if (!dataIsoValida(dataBatismo)) return res.status(400).json({ error: 'Selecione a data antes de aprovar.' });
    if (!dataBatismoFutura(dataBatismo)) return res.status(400).json({ error: 'A data de Batismo já passou.' });
    const update = { status: 'confirmado', data_batismo: dataBatismo, updated_at: new Date().toISOString() };
    if (req.body?.horario_culto !== undefined) update.horario_culto = limparTexto(req.body.horario_culto, 40);
    const { data, error } = await supabase.from('batismo_inscricoes').update(update)
      .eq('id', req.params.id).eq('status', 'pendente').is('deleted_at', null)
      .select(BATISMO_COLUNAS_APP).single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[APP] batismo/gestao/aprovar:', e.message);
    res.status(500).json({ error: 'Erro ao aprovar a inscrição.' });
  }
});

router.put('/batismo/gestao/:id', authApp, autorizarGestaoBatismoApp, limiterNormal, async (req, res) => {
  try {
    const update = { updated_at: new Date().toISOString() };
    for (const [campo, max] of [
      ['nome', 120], ['sobrenome', 120], ['telefone', 40], ['email', 180],
      ['observacoes', 1000], ['endereco', 300], ['deficiencia_descricao', 500], ['horario_culto', 40],
    ]) if (req.body?.[campo] !== undefined) update[campo] = limparTexto(req.body[campo], max);
    if (req.body?.nome !== undefined && !update.nome) return res.status(400).json({ error: 'Nome é obrigatório.' });
    if (req.body?.sobrenome !== undefined && !update.sobrenome) return res.status(400).json({ error: 'Sobrenome é obrigatório.' });
    if (req.body?.data_batismo !== undefined) {
      if (!dataIsoValida(req.body.data_batismo)) return res.status(400).json({ error: 'Data de Batismo inválida.' });
      if (!dataBatismoFutura(req.body.data_batismo)) return res.status(400).json({ error: 'A data de Batismo já passou.' });
      update.data_batismo = req.body.data_batismo;
    }
    if (req.body?.data_nascimento !== undefined) update.data_nascimento = dataIsoValida(req.body.data_nascimento) ? req.body.data_nascimento : null;
    if (req.body?.tamanho_camisa !== undefined) update.tamanho_camisa = limparTexto(req.body.tamanho_camisa, 12)?.toUpperCase() || null;
    if (req.body?.eh_crianca !== undefined) update.eh_crianca = !!req.body.eh_crianca;
    if (req.body?.possui_deficiencia !== undefined) update.possui_deficiencia = !!req.body.possui_deficiencia;
    if (['kids', 'sede', 'bridge', 'ami', 'online'].includes(req.body?.area_kpi)) update.area_kpi = req.body.area_kpi;
    const { data, error } = await supabase.from('batismo_inscricoes').update(update)
      .eq('id', req.params.id).is('deleted_at', null).select(BATISMO_COLUNAS_APP).single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[APP] batismo/gestao/pessoa PUT:', e.message);
    res.status(500).json({ error: 'Erro ao salvar os dados da pessoa.' });
  }
});

router.post('/batismo/gestao/:id/checkin', authApp, autorizarGestaoBatismoApp, limiterNormal, async (req, res) => {
  try {
    const presente = req.body?.presente !== false;
    const agora = new Date().toISOString();
    const update = presente
      ? { checkin_em: agora, checkin_por: req.user.id, updated_at: agora }
      : { checkin_em: null, checkin_por: null, updated_at: agora };
    const { data, error } = await supabase.from('batismo_inscricoes').update(update)
      .eq('id', req.params.id).is('deleted_at', null).not('status', 'in', '(cancelado,rejeitado)')
      .select(BATISMO_COLUNAS_APP).single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[APP] batismo/gestao/checkin:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar o check-in.' });
  }
});


router.delete('/batismo/gestao/:id', authApp, autorizarGestaoBatismoApp, limiterNormal, async (req, res) => {
  try {
    const agora = new Date().toISOString();
    const { data, error } = await supabase.from('batismo_inscricoes')
      .update({ status: 'cancelado', checkin_em: null, checkin_por: null, updated_at: agora })
      .eq('id', req.params.id).is('deleted_at', null).select('id').single();
    if (error) throw error;
    res.json({ ok: true, id: data.id });
  } catch (e) {
    console.error('[APP] batismo/gestao/pessoa DELETE:', e.message);
    res.status(500).json({ error: 'Erro ao retirar a pessoa deste Batismo.' });
  }
});

async function gruposPapelApp(req) {
  const membro = await resolveMembroApp(req).catch(() => null);


  let gruposLiderados = [];
  let gruposSupervisionados = [];
  if (membro?.id) {
    const [glRes, gsRes, rosterRes] = await Promise.all([
      supabase.from('mem_grupos')
        .select('id, nome').eq('lider_id', membro.id).is('deleted_at', null)
        .order('nome', { ascending: true }),
      supabase.from('mem_grupos')
        .select('id, nome').eq('supervisor_id', membro.id).is('deleted_at', null)
        .order('nome', { ascending: true }),













      supabase.from('mem_grupo_membros')
        .select('grupo_id, mem_grupos!inner(id, nome)')
        .eq('membro_id', membro.id)
        .in('funcao', ['lider', 'lider_treinamento'])
        .is('saiu_em', null).is('deleted_at', null)
        .is('mem_grupos.deleted_at', null),
    ]);
    gruposLiderados = glRes.data || [];
    gruposSupervisionados = gsRes.data || [];
    if (rosterRes.error) {
      console.warn('[APP] gruposPapelApp · roster de líderes:', rosterRes.error.message);
    } else {
      const vistos = new Set(gruposLiderados.map(g => g.id));
      for (const v of (rosterRes.data || [])) {
        const g = v.mem_grupos;
        if (!g?.id || vistos.has(g.id)) continue;
        vistos.add(g.id);
        gruposLiderados.push({ id: g.id, nome: g.nome });
      }
      gruposLiderados.sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
    }
  }


  const geridosMap = new Map();
  for (const g of [...gruposLiderados, ...gruposSupervisionados]) {
    if (!geridosMap.has(g.id)) geridosMap.set(g.id, g);
  }
  const gruposGeridos = [...geridosMap.values()]
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome)));


  let adminGrupos = false;
  const email = req.user?.email || null;
  if (req.user?.id) {
    const { data: prof } = await supabase.from('profiles')
      .select('role').eq('id', req.user.id).maybeSingle();
    if (prof && ['admin', 'diretor'].includes(prof.role)) adminGrupos = true;
  }



  if (!adminGrupos && email) {
    try {
      const { data: permUser } = await supabase.from('usuarios')
        .select('id, cargo_id').eq('email', email).eq('ativo', true).maybeSingle();
      if (permUser) {
        const [overridesRes, modulos, cargoMatrix, userAreasRes] = await Promise.all([
          supabase.from('permissoes_modulo')
            .select('modulo_id, nivel_leitura, nivel_escrita, pode_exportar, pode_aprovar, escopo_proprio, expira_em')
            .eq('usuario_id', permUser.id),
          getModulos(),
          getCargoMatrix(permUser.cargo_id),
          supabase.from('usuario_areas')
            .select('areas(nome)').eq('usuario_id', permUser.id),
        ]);
        const now = Date.now();
        const overrides = (overridesRes.data || [])
          .filter(o => !o.expira_em || new Date(o.expira_em).getTime() > now);
        const areas = (userAreasRes.data || []).map(ua => ua.areas?.nome).filter(Boolean);
        const modulePerms = resolveEffectivePerms({
          overrides, cargoMatrix, cargoId: permUser.cargo_id, modulos, areas,
        });
        const g = modulePerms['grupos'];
        if (g && (Math.max(g.leitura || 0, g.escrita || 0) >= 3)) adminGrupos = true;
      }
    } catch (e) {
      console.warn('[APP] gruposPapelApp · permissões:', e.message);
    }
  }

  return { membro, adminGrupos, gruposLiderados, gruposSupervisionados, gruposGeridos };
}











function papelNoGrupoApp({ gruposLiderados, gruposSupervisionados, adminGrupos }, gid) {
  if ((gruposLiderados || []).some(g => g.id === gid)) return 'lider';
  if ((gruposSupervisionados || []).some(g => g.id === gid)) return 'supervisor';
  if (adminGrupos) return 'admin';
  return 'nenhum';
}


router.get('/grupos/papel', authApp, limiterNormal, async (req, res) => {
  try {
    const { adminGrupos, gruposLiderados, gruposSupervisionados } = await gruposPapelApp(req);
    res.json({
      lider: gruposLiderados.length > 0,
      supervisor: gruposSupervisionados.length > 0,
      admin_grupos: adminGrupos,
      grupos_liderados: gruposLiderados,
      grupos_supervisionados: gruposSupervisionados,
    });
  } catch (e) {
    console.error('[APP] grupos/papel:', e.message);
    res.status(500).json({ error: 'Erro ao carregar seu papel em grupos' });
  }
});



function pedidosPendentesQuery({ adminGrupos, gruposGeridos }) {
  if (!adminGrupos && !gruposGeridos.length) return null;
  let q = supabase.from('mem_grupo_pedidos')
    .select('id, grupo_id, nome, telefone, email, origem, created_at, mem_grupos(nome)')
    .eq('status', 'pendente');
  if (!adminGrupos) {
    q = q.in('grupo_id', gruposGeridos.map(g => g.id));
  }
  return q;
}


router.get('/grupos/pedidos', authApp, limiterNormal, async (req, res) => {
  try {
    const { adminGrupos, gruposGeridos } = await gruposPapelApp(req);
    const q = pedidosPendentesQuery({ adminGrupos, gruposGeridos });
    if (!q) return res.json({ admin: false, pedidos: [] });
    const { data, error } = await q.order('created_at', { ascending: true });
    if (error) throw error;
    const pedidos = (data || []).map(p => ({
      id: p.id,
      grupo_id: p.grupo_id,
      grupo_nome: (Array.isArray(p.mem_grupos) ? p.mem_grupos[0] : p.mem_grupos)?.nome || null,
      nome: p.nome,
      telefone: p.telefone,
      email: p.email,
      origem: p.origem,
      created_at: p.created_at,
    }));
    res.json({ admin: adminGrupos, pedidos });
  } catch (e) {
    console.error('[APP] grupos/pedidos:', e.message);
    res.status(500).json({ error: 'Erro ao carregar pedidos' });
  }
});


router.get('/grupos/pedidos/count', authApp, limiterNormal, async (req, res) => {
  try {
    const { adminGrupos, gruposGeridos } = await gruposPapelApp(req);
    if (!adminGrupos && !gruposGeridos.length) return res.json({ count: 0 });
    let q = supabase.from('mem_grupo_pedidos')
      .select('id', { count: 'exact', head: true }).eq('status', 'pendente');
    if (!adminGrupos) q = q.in('grupo_id', gruposGeridos.map(g => g.id));
    const { count, error } = await q;
    if (error) throw error;
    res.json({ count: count || 0 });
  } catch (e) {
    console.error('[APP] grupos/pedidos/count:', e.message);
    res.status(500).json({ error: 'Erro ao contar pedidos' });
  }
});




async function autorizarDecisaoPedido(req, res, pedidoId) {
  const { membro, adminGrupos, gruposGeridos } = await gruposPapelApp(req);
  const { data: pedido } = await supabase.from('mem_grupo_pedidos')
    .select('id, grupo_id, status').eq('id', pedidoId || req.params.id).maybeSingle();
  if (!pedido) { res.status(404).json({ error: 'Pedido não encontrado' }); return null; }
  const ehGerido = gruposGeridos.some(g => g.id === pedido.grupo_id);
  if (!adminGrupos && !ehGerido) {
    res.status(403).json({ error: 'Você não tem permissão para decidir este pedido' });
    return null;
  }
  return { pedido, membro };
}


router.post('/grupos/pedidos/:id/aprovar', authApp, limiterNormal, async (req, res) => {
  try {
    const ctx = await autorizarDecisaoPedido(req, res);
    if (!ctx) return;

    const user = { userId: req.user.id, name: ctx.membro?.nome || req.user.email || 'Líder' };
    const r = await aprovarPedidoCore(req.params.id, user);
    if (!r.ok) return res.status(r.code || 400).json({ error: r.error });
    res.json({ ok: true });
  } catch (e) {
    console.error('[APP] grupos/pedidos aprovar:', e.message);
    res.status(500).json({ error: 'Erro ao aprovar pedido' });
  }
});











async function devolverPedidoParaTriagem(pedidoId, req, ctx, motivo) {
  const motivoInterno = motivo ? String(motivo).trim().slice(0, 500) : null;
  const { data: pedido } = await supabase.from('mem_grupo_pedidos')
    .select('id, status, grupo_id, membro_id, nome').eq('id', pedidoId).single();
  if (!pedido) return { ok: false, status: 404, erro: 'Pedido não encontrado' };
  if (pedido.status !== 'pendente') {
    return { ok: false, status: 409, erro: `Pedido já foi ${pedido.status}` };
  }
  const decididoPorNome = ctx.membro?.nome || req.user.email || 'Líder';

  const { data: claimed } = await supabase.from('mem_grupo_pedidos').update({
    status: 'devolvido',
    motivo_rejeicao: motivoInterno,
    decidido_por: req.user.id,
    decidido_por_nome: decididoPorNome,
    decidido_em: new Date().toISOString(),
  }).eq('id', pedido.id).eq('status', 'pendente').select('id');
  if (!claimed || !claimed.length) {
    return { ok: false, status: 409, erro: 'Pedido já foi decidido por outra pessoa' };
  }


  await registrarEventoPedido(pedido.id, 'recusado_lider',
    { motivo_interno: motivoInterno, origem: 'app' }, decididoPorNome);




  (async () => {
    try {
      const { data: grupo } = await supabase.from('mem_grupos').select('nome').eq('id', pedido.grupo_id).single();
      await notificar({
        modulo: 'grupos',
        tipo: 'pedido_devolvido',
        titulo: `Pedido devolvido pra triagem: ${pedido.nome}`,
        mensagem: `O líder de ${grupo?.nome || 'um grupo'} recusou o pedido pelo app${motivoInterno ? ` (motivo interno: ${motivoInterno.slice(0, 200)})` : ''}. Sugira outro grupo pra pessoa ou rejeite de vez.`,
        link: '/grupos?tab=entrada',
        severidade: 'aviso',
        chaveDedup: `pedido_devolvido_${pedido.id}`,
      });
    } catch (e) { console.error('[APP grupos/pedidos devolver notify]', e.message); }
  })();

  return { ok: true, acao: 'devolvido' };
}

router.post('/grupos/pedidos/:id/rejeitar', authApp, limiterNormal, async (req, res) => {
  try {
    const ctx = await autorizarDecisaoPedido(req, res);
    if (!ctx) return;
    const r = await devolverPedidoParaTriagem(req.params.id, req, ctx, req.body?.motivo);
    if (!r.ok) return res.status(r.status || 400).json({ error: r.erro });
    res.json({ ok: true, acao: r.acao });
  } catch (e) {
    console.error('[APP] grupos/pedidos rejeitar:', e.message);
    res.status(500).json({ error: 'Erro ao recusar pedido' });
  }
});





router.get('/grupos/meus', authApp, limiterNormal, async (req, res) => {
  try {
    const papel = await gruposPapelApp(req);
    const { adminGrupos, gruposGeridos } = papel;
    const ids = gruposGeridos.map(g => g.id);
    if (!ids.length) return res.json({ admin: adminGrupos, grupos: [] });

    const [infoRes, membrosRes, pendRes] = await Promise.all([
      supabase.from('mem_grupos')
        .select('id, nome, dia_semana, horario, local, bairro, categoria, aceitando_inscricoes')
        .in('id', ids).is('deleted_at', null),
      supabase.from('mem_grupo_membros')
        .select('grupo_id').in('grupo_id', ids).is('saiu_em', null).is('deleted_at', null),
      supabase.from('mem_grupo_pedidos')
        .select('grupo_id').in('grupo_id', ids).eq('status', 'pendente'),
    ]);
    const countBy = (arr) => {
      const m = {};
      (arr || []).forEach(r => { m[r.grupo_id] = (m[r.grupo_id] || 0) + 1; });
      return m;
    };
    const mc = countBy(membrosRes.data);
    const pc = countBy(pendRes.data);
    const grupos = (infoRes.data || []).map(g => ({
      ...g,
      membros_ativos: mc[g.id] || 0,
      pendentes: pc[g.id] || 0,




      papel: papelNoGrupoApp(papel, g.id),
    })).sort((a, b) => (b.pendentes - a.pendentes) || String(a.nome).localeCompare(String(b.nome)));
    res.json({ admin: adminGrupos, grupos });
  } catch (e) {
    console.error('[APP] grupos/meus:', e.message);
    res.status(500).json({ error: 'Erro ao carregar seus grupos' });
  }
});




router.get('/grupos/:grupoId/membros', authApp, limiterNormal, async (req, res) => {
  try {
    const papel = await gruposPapelApp(req);
    const { adminGrupos, gruposGeridos } = papel;
    const gid = req.params.grupoId;
    const ehGerido = gruposGeridos.some(g => g.id === gid);
    if (!adminGrupos && !ehGerido) {
      return res.status(403).json({ error: 'Você não gerencia este grupo' });
    }




    const { data: grupo } = await supabase.from('mem_grupos')




      .select('id, nome, dia_semana, horario, local, endereco, bairro, descricao, categoria, aceitando_inscricoes, modo_inscricao, lider_id')
      .eq('id', gid).is('deleted_at', null).maybeSingle();
    if (!grupo) return res.status(404).json({ error: 'Grupo não encontrado' });

    const [rosterRes, pendRes] = await Promise.all([
      supabase.from('mem_grupo_membros')
        .select('id, membro_id, funcao, entrou_em, presencas, membro:mem_membros(id, nome, telefone)')
        .eq('grupo_id', gid).is('saiu_em', null).is('deleted_at', null)
        .order('created_at', { ascending: true }),
      supabase.from('mem_grupo_pedidos')
        .select('id, grupo_id, nome, telefone, email, origem, created_at')
        .eq('grupo_id', gid).eq('status', 'pendente')
        .order('created_at', { ascending: true }),
    ]);
    const membros = (rosterRes.data || []).map(r => {
      const m = Array.isArray(r.membro) ? r.membro[0] : r.membro;
      return {
        id: r.id, funcao: r.funcao, entrou_em: r.entrou_em, presencas: r.presencas,



        membro_id: r.membro_id || m?.id || null,
        nome: m?.nome || '—', telefone: m?.telefone || null,
      };
    });







    await anexarMarcadores(membros, (p) => p.membro_id, { incluirSensiveis: false });
    const pendentes = (pendRes.data || []).map(p => ({
      id: p.id, grupo_id: p.grupo_id, grupo_nome: grupo.nome,
      nome: p.nome, telefone: p.telefone, email: p.email, origem: p.origem, created_at: p.created_at,
    }));


    res.json({ grupo, membros, pendentes, meu_papel: papelNoGrupoApp(papel, gid) });
  } catch (e) {
    console.error('[APP] grupos/membros:', e.message);
    res.status(500).json({ error: 'Erro ao carregar o grupo' });
  }
});













async function gateGrupoApp(req, res, gid) {
  const papel = await gruposPapelApp(req);
  const { adminGrupos, gruposGeridos, membro } = papel;
  if (!adminGrupos && !gruposGeridos.some(g => g.id === gid)) {
    res.status(403).json({ error: 'Você não gerencia este grupo' });
    return { ok: false };
  }
  const { data: grupo } = await supabase.from('mem_grupos')
    .select('id, nome, lider_id').eq('id', gid).is('deleted_at', null).maybeSingle();
  if (!grupo) {
    res.status(404).json({ error: 'Grupo não encontrado' });
    return { ok: false };
  }



  return { ok: true, grupo, membro, adminGrupos, meuPapel: papelNoGrupoApp(papel, gid) };
}





























router.put('/grupos/:grupoId', authApp, limiterNormal, async (req, res) => {
  try {
    const gid = req.params.grupoId;
    const gate = await gateGrupoApp(req, res, gid);
    if (!gate.ok) return undefined;

    const { erros, valores, mudouEndereco } = validarEdicaoGrupoApp(req.body || {});
    const campoComErro = Object.keys(erros)[0];
    if (campoComErro) {


      return res.status(400).json({ error: erros[campoComErro], campo: campoComErro, erros });
    }
    if (!Object.keys(valores).length) {
      return res.status(400).json({ error: 'Nada para atualizar.' });
    }





    const { data: atualizado, error } = await supabase
      .from('mem_grupos')
      .update({ ...valores, updated_at: new Date().toISOString() })
      .eq('id', gid)
      .is('deleted_at', null)
      .select('id, nome, categoria, descricao, tema, dia_semana, horario, local, endereco, bairro')
      .maybeSingle();

    if (error) {
      console.error('[APP] grupos · editar:', error.message);
      return res.status(500).json({ error: 'Não foi possível salvar as alterações.' });
    }
    if (!atualizado) {



      console.error('[APP] grupos · editar: 0 linhas afetadas no grupo', gid);
      return res.status(409).json({ error: 'O grupo não está mais disponível para edição.' });
    }







    if (mudouEndereco) {
      notificar({
        modulo: 'grupos',
        tipo: 'grupo_endereco_mudou_app',
        titulo: `Endereço do grupo mudou — ${atualizado.nome}`,
        mensagem:
          `O endereço de "${atualizado.nome}" foi editado pelo app. O pino do mapa e o `
          + '"como chegar" continuam no lugar antigo até rodar a ferramenta de endereços.',
        link: '/admin/grupos/geocode',
        severidade: 'aviso',
        chaveDedup: `grupo_endereco_app_${gid}`,
      }).catch((e) => console.warn('[APP] grupos · editar · notificar endereço:', e.message));
    }

    return res.json({ ok: true, grupo: atualizado });
  } catch (e) {
    console.error('[APP] grupos · editar:', e.message);
    return res.status(500).json({ error: 'Não foi possível salvar as alterações.' });
  }
});






























const uploadCapa = multer({
  storage: multer.memoryStorage(),




  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {

    if (MIMES_CAPA.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Use uma imagem JPG, PNG ou WEBP.'));
  },
});


function uploadCapaMw(req, res, next) {
  uploadCapa.single('foto')(req, res, (err) => {
    if (!err) return next();
    const msg = err instanceof multer.MulterError
      ? (err.code === 'LIMIT_FILE_SIZE' ? 'Imagem muito grande (máximo 4MB).' : 'Falha no envio da imagem.')
      : (err.message || 'Formato de imagem não suportado.');
    return res.status(400).json({ error: msg });
  });
}






router.post('/grupos/:grupoId/foto', authApp, limiterStrict, uploadCapaMw, async (req, res) => {
  try {
    const gid = req.params.grupoId;
    const gate = await gateGrupoApp(req, res, gid);
    if (!gate.ok) return undefined;
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ error: 'Nenhuma imagem foi enviada.' });
    }


    const { data: antes } = await supabase
      .from('mem_grupos').select('foto_url').eq('id', gid).maybeSingle();






    const ext = extensaoDaCapa(req.file.mimetype);
    if (!ext) return res.status(400).json({ error: 'Use uma imagem JPG, PNG ou WEBP.' });
    const path = caminhoNovoDaCapa(gid, ext, Date.now());

    const { error: upErr } = await supabase.storage
      .from('grupos')
      .upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
    if (upErr) {
      console.error('[APP] grupos · capa · upload:', upErr.message);
      return res.status(500).json({ error: 'Não foi possível enviar a imagem.' });
    }

    const { data: urlData } = supabase.storage.from('grupos').getPublicUrl(path);
    const foto_url = urlData.publicUrl;


    const { data: atualizado, error } = await supabase
      .from('mem_grupos')
      .update({ foto_url, updated_at: new Date().toISOString() })
      .eq('id', gid)
      .is('deleted_at', null)
      .select('id, foto_url')
      .maybeSingle();

    if (error || !atualizado) {

      await supabase.storage.from('grupos').remove([path]).catch(() => {});
      if (error) {
        console.error('[APP] grupos · capa · update:', error.message);
        return res.status(500).json({ error: 'Não foi possível salvar a capa.' });
      }
      console.error('[APP] grupos · capa: 0 linhas afetadas no grupo', gid);
      return res.status(409).json({ error: 'O grupo não está mais disponível para edição.' });
    }


    const antigo = caminhoDaCapa(antes?.foto_url);
    if (antigo && antigo !== path) {
      supabase.storage.from('grupos').remove([antigo])
        .catch((e) => console.warn('[APP] grupos · capa · limpar antiga:', e.message));
    }

    return res.json({ ok: true, foto_url: atualizado.foto_url });
  } catch (e) {
    console.error('[APP] grupos · capa:', e.message);
    return res.status(500).json({ error: 'Não foi possível salvar a capa.' });
  }
});




router.delete('/grupos/:grupoId/foto', authApp, limiterNormal, async (req, res) => {
  try {
    const gid = req.params.grupoId;
    const gate = await gateGrupoApp(req, res, gid);
    if (!gate.ok) return undefined;

    const { data: antes } = await supabase
      .from('mem_grupos').select('foto_url').eq('id', gid).maybeSingle();

    const { data: atualizado, error } = await supabase
      .from('mem_grupos')
      .update({ foto_url: null, updated_at: new Date().toISOString() })
      .eq('id', gid)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('[APP] grupos · capa · remover:', error.message);
      return res.status(500).json({ error: 'Não foi possível remover a capa.' });
    }
    if (!atualizado) {
      return res.status(409).json({ error: 'O grupo não está mais disponível para edição.' });
    }

    const antigo = caminhoDaCapa(antes?.foto_url);
    if (antigo) {
      supabase.storage.from('grupos').remove([antigo])
        .catch((e) => console.warn('[APP] grupos · capa · limpar:', e.message));
    }
    return res.json({ ok: true, foto_url: null });
  } catch (e) {
    console.error('[APP] grupos · capa · remover:', e.message);
    return res.status(500).json({ error: 'Não foi possível remover a capa.' });
  }
});























router.post('/membro/foto', authApp, limiterStrict, uploadCapaMw, async (req, res) => {
  try {
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ error: 'Nenhuma imagem foi enviada.' });
    }
    const ext = extensaoDaCapa(req.file.mimetype);
    if (!ext) return res.status(400).json({ error: 'Use uma imagem JPG, PNG ou WEBP.' });

    const uid = req.user.id;




    const path = `${uid}/avatar-${Date.now()}.${ext}`;

    const { data: antes } = await supabase
      .from('profiles').select('avatar_url, membro_id').eq('id', uid).maybeSingle();

    const { error: upErr } = await supabase.storage
      .from('avatars')
      .upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
    if (upErr) {
      console.error('[APP] membro · foto · upload:', upErr.message);
      return res.status(500).json({ error: 'Não foi possível enviar a imagem.' });
    }

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
    const avatar_url = urlData.publicUrl;




    const { data: atualizado, error } = await supabase
      .from('profiles')
      .update({ avatar_url, updated_at: new Date().toISOString() })
      .eq('id', uid)
      .select('id, avatar_url')
      .maybeSingle();

    if (error || !atualizado) {
      await supabase.storage.from('avatars').remove([path]).catch(() => {});
      if (error) {
        console.error('[APP] membro · foto · update:', error.message);
        return res.status(500).json({ error: 'Não foi possível salvar a foto.' });
      }
      console.error('[APP] membro · foto: 0 linhas afetadas no profile', uid);
      return res.status(409).json({ error: 'Não foi possível salvar a foto agora.' });
    }

























    if (antes?.membro_id) {
      const { error: eFoto } = await supabase
        .from('mem_membros')
        .update({ foto_url: avatar_url })
        .eq('id', antes.membro_id)
        .is('deleted_at', null);


      if (eFoto) console.error('[APP] membro · foto · propagar mem_membros:', eFoto.message);
    }


    const marca = '/storage/v1/object/public/avatars/';
    const s = String(antes?.avatar_url || '');
    const i = s.indexOf(marca);
    if (i >= 0) {
      const antigo = s.slice(i + marca.length).split(/[?#]/)[0];


      if (antigo && antigo.startsWith(`${uid}/`) && antigo !== path) {
        supabase.storage.from('avatars').remove([antigo])
          .catch((e) => console.warn('[APP] membro · foto · limpar antiga:', e.message));
      }
    }

    return res.json({ ok: true, avatar_url: atualizado.avatar_url });
  } catch (e) {
    console.error('[APP] membro · foto:', e.message);
    return res.status(500).json({ error: 'Não foi possível salvar a foto.' });
  }
});




















const FUNCOES_APP = ['frequentador', 'lider_treinamento', 'lider'];


router.put('/grupos/:grupoId/membros/:rowId/funcao', authApp, limiterNormal, async (req, res) => {
  try {
    const gid = req.params.grupoId;
    const g = await gateGrupoApp(req, res, gid);
    if (!g.ok) return;
    const funcao = String(req.body?.funcao || '').trim();
    if (!FUNCOES_APP.includes(funcao)) {
      return res.status(400).json({
        error: 'Função inválida. Pelo app dá pra marcar frequentador, líder em treinamento ou líder (cadastro) — supervisor e coordenador são da hierarquia de supervisão.',
      });
    }

    const { data: linha } = await supabase.from('mem_grupo_membros')
      .select('id, grupo_id, membro_id, funcao').eq('id', req.params.rowId)
      .eq('grupo_id', gid).is('saiu_em', null).is('deleted_at', null).maybeSingle();
    if (!linha) return res.status(404).json({ error: 'Participante não encontrado neste grupo' });




    if (linha.membro_id && linha.membro_id === g.grupo.lider_id) {
      return res.status(400).json({
        error: 'Esta é a líder principal do grupo (é quem recebe os avisos no WhatsApp). Trocar o principal é com a coordenação.',
      });
    }
    const { error } = await supabase.from('mem_grupo_membros')
      .update({ funcao }).eq('id', linha.id);
    if (error) throw error;
    res.json({ ok: true, funcao });
  } catch (e) {
    console.error('[APP] grupos/funcao:', e.message);
    res.status(500).json({ error: 'Erro ao mudar a função' });
  }
});




router.post('/grupos/:grupoId/membros/:rowId/sair', authApp, limiterNormal, async (req, res) => {
  try {
    const gid = req.params.grupoId;
    const g = await gateGrupoApp(req, res, gid);
    if (!g.ok) return;
    const { data: linha } = await supabase.from('mem_grupo_membros')
      .select('id, membro_id').eq('id', req.params.rowId)
      .eq('grupo_id', gid).is('saiu_em', null).is('deleted_at', null).maybeSingle();
    if (!linha) return res.status(404).json({ error: 'Participante não encontrado neste grupo' });


    if (linha.membro_id && linha.membro_id === g.grupo.lider_id) {
      return res.status(400).json({ error: 'A líder principal não pode sair do grupo pelo app — fale com a coordenação.' });
    }
    const motivo = String(req.body?.motivo || '').trim().slice(0, 300) || 'Saída registrada pelo líder no app';
    const { error } = await supabase.from('mem_grupo_membros')
      .update({ saiu_em: new Date().toISOString().slice(0, 10), motivo_saida: motivo })
      .eq('id', linha.id).is('saiu_em', null);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[APP] grupos/sair:', e.message);
    res.status(500).json({ error: 'Erro ao registrar a saída' });
  }
});













router.post('/meu-grupo/:grupoId/sair', authApp, limiterStrict, async (req, res) => {
  try {
    const gid = req.params.grupoId;
    const membro = await resolveMembroApp(req);
    if (!membro) return res.status(404).json({ error: 'Não encontrei seu cadastro.' });

    const { data: grupo } = await supabase.from('mem_grupos')
      .select('id, nome, lider_id').eq('id', gid).is('deleted_at', null).maybeSingle();
    if (!grupo) return res.status(404).json({ error: 'Grupo não encontrado.' });




    if (grupo.lider_id && grupo.lider_id === membro.id) {
      return res.status(409).json({
        error: 'Você lidera este grupo — a saída precisa passar pela coordenação, para o grupo não ficar sem líder.',
        codigo: 'e_lider',
      });
    }

    const { data: vinculos, error: eV } = await supabase.from('mem_grupo_membros')
      .select('id, funcao').eq('grupo_id', gid).eq('membro_id', membro.id)
      .is('saiu_em', null).is('deleted_at', null);
    if (eV) throw eV;
    if (!vinculos || !vinculos.length) {
      return res.status(409).json({ error: 'Você já não faz parte deste grupo.', codigo: 'nao_participa' });
    }






    if (vinculos.some(v => ['lider', 'lider_treinamento'].includes(String(v.funcao)))) {
      return res.status(409).json({
        error: 'Você é da liderança deste grupo — fale com a coordenação para registrar a saída.',
        codigo: 'e_lideranca',
      });
    }

    const motivo = String(req.body?.motivo || '').trim().slice(0, 300) || 'Saiu pelo app';
    const { data: saiu, error } = await supabase.from('mem_grupo_membros')
      .update({ saiu_em: new Date().toISOString().slice(0, 10), motivo_saida: motivo })
      .in('id', vinculos.map(v => v.id))
      .is('saiu_em', null)
      .select('id');
    if (error) throw error;
    if (!saiu || !saiu.length) {
      return res.status(409).json({ error: 'Você já não faz parte deste grupo.', codigo: 'nao_participa' });
    }






    (async () => {


      try {
        const { avisarSaidaNoApp } = require('../services/gruposAvisoApp');
        await avisarSaidaNoApp({
          grupoId: gid, grupoNome: grupo.nome, pessoaNome: membro.nome,
          dia: new Date().toISOString().slice(0, 10),
        });
      } catch (err) { console.warn('[APP] aviso de saida (app):', err.message); }
      try {
        await notificar({
          modulo: 'grupos',
          tipo: 'grupo_saida',
          titulo: `Saída de grupo: ${grupo.nome}`,
          mensagem: `${membro.nome || 'Uma pessoa'} saiu de ${grupo.nome} pelo app.`,
          link: '/grupos',
          severidade: 'info',
          chaveDedup: `grupo_saida_${gid}_${membro.id}`,
        });
      } catch (err) { console.warn('[APP] aviso de saida:', err.message); }
    })();

    res.json({ ok: true, saiu: saiu.length });
  } catch (e) {
    console.error('[APP] meu-grupo/sair:', e.message);
    res.status(500).json({ error: 'Erro ao registrar a saída' });
  }
});



















router.post('/grupos/:grupoId/pessoas', authApp, limiterStrict, async (req, res) => {
  try {
    const gid = req.params.grupoId;
    const g = await gateGrupoApp(req, res, gid);
    if (!g.ok) return;

    const r = await cadastrarPessoaNoGrupo({
      grupo: g.grupo,
      dados: req.body || {},
      autor: { id: req.user?.id || null, nome: g.membro?.nome || req.user?.email || 'Líder (app)' },
      origem: 'grupos_app_lider',
      ip: req.ip || null,
      userAgent: req.get?.('user-agent') || null,
    });
    if (!r.ok) return res.status(r.http || 400).json({ error: r.error, campo: r.campo });





    if (!r.ja_no_grupo) {
      notificar({
        modulo: 'grupos',
        tipo: 'novo_membro_grupo',
        titulo: `Nova pessoa no grupo ${g.grupo.nome}`,
        mensagem: `${r.nome} foi cadastrada pelo líder no app e já entrou em "${g.grupo.nome}".`
          + (r.sem_cpf ? ' Cadastro sem CPF — aparece na fila de "faltam dados".' : ''),
        link: '/grupos',
        severidade: 'info',
        chaveDedup: `novo_membro_${gid}_${r.membro_id}`,
      }).catch(e => console.warn('[APP] pessoas · notificar:', e.message));
    }

    const { ok, http, ...corpo } = r;
    res.status(http || 201).json({ ok: true, ...corpo });
  } catch (e) {
    console.error('[APP] grupos/pessoas:', e.message);
    res.status(500).json({ error: 'Erro ao cadastrar a pessoa' });
  }
});























router.post('/grupos/:grupoId/membros/:rowId/transferir', authApp, limiterNormal, async (req, res) => {
  try {
    const gid = req.params.grupoId;
    const g = await gateGrupoApp(req, res, gid);
    if (!g.ok) return;

    const { data: linha } = await supabase.from('mem_grupo_membros')
      .select('id, membro_id').eq('id', req.params.rowId)
      .eq('grupo_id', gid).is('saiu_em', null).is('deleted_at', null).maybeSingle();
    if (!linha?.membro_id) return res.status(404).json({ error: 'Participante não encontrado neste grupo' });




    if (linha.membro_id === g.grupo.lider_id) {
      return res.status(400).json({
        error: 'Esta é a líder principal do grupo — mover a liderança é com a coordenação.',
      });
    }

    const { data: pessoa } = await supabase.from('mem_membros')
      .select('nome').eq('id', linha.membro_id).is('deleted_at', null).maybeSingle();
    const motivo = String(req.body?.motivo || '').trim().slice(0, 500) || null;





    const { data: jaPediu } = await supabase.from('mem_grupo_transferencias')
      .select('id, created_at').eq('membro_id', linha.membro_id)
      .eq('grupo_origem_id', gid).eq('status', 'pendente').limit(1).maybeSingle();
    if (jaPediu) {
      return res.json({ ok: true, ja_pedido: true, transferencia_id: jaPediu.id });
    }

    const { data: novo, error } = await supabase.from('mem_grupo_transferencias').insert({
      membro_id: linha.membro_id,
      grupo_origem_id: gid,
      vinculo_id: linha.id,
      motivo,
      status: 'pendente',
      pedido_por: req.user?.id || null,


      pedido_por_nome: g.membro?.nome || req.user?.email || 'Líder (app)',
      origem: 'app',
    }).select('id').single();
    if (error) {


      if (error.code === '23505') return res.json({ ok: true, ja_pedido: true });
      throw error;
    }












    (async () => {
      const coordenacao = await resolverDestinatarios('grupos').catch(() => []);
      await notificar({
        modulo: 'grupos',
        tipo: 'grupo_transferencia_pedida',
        titulo: 'Transferência pedida por um líder',
        mensagem: `${pessoa?.nome || 'Alguém'} do grupo "${g.grupo.nome}" precisa ser transferida. `
          + `${motivo ? `Motivo: ${motivo}. ` : ''}O pedido está na Caixa de entrada, aguardando a coordenação escolher o grupo.`,
        link: '/grupos?tab=entrada',
        severidade: 'aviso',
        chaveDedup: `grupo_transf_${novo?.id}`,
        ...(coordenacao.length ? { targetIds: coordenacao } : {}),
      });
    })().catch(e => console.warn('[APP] transferir · notificar:', e.message));

    res.status(201).json({ ok: true, transferencia_id: novo?.id || null });
  } catch (e) {
    console.error('[APP] grupos/transferir:', e.message);
    res.status(500).json({ error: 'Erro ao pedir a transferência' });
  }
});






















router.get('/grupos/:grupoId/encontros', authApp, limiterNormal, async (req, res) => {
  try {
    const gid = req.params.grupoId;
    const g = await gateGrupoApp(req, res, gid);
    if (!g.ok) return;
    const { data: encontros, error } = await supabase.from('mem_grupo_encontros')
      .select('id, data, tema, observacoes, registrado_por_nome, created_at')
      .eq('grupo_id', gid).is('deleted_at', null)
      .order('data', { ascending: false }).limit(24);
    if (error) throw error;
    const ids = (encontros || []).map(e => e.id);
    const presentes = {};
    if (ids.length) {
      const { data: pres } = await supabase.from('mem_grupo_encontro_presencas')
        .select('encontro_id, presente').in('encontro_id', ids);
      (pres || []).forEach(p => { if (p.presente) presentes[p.encontro_id] = (presentes[p.encontro_id] || 0) + 1; });
    }
    const lista = (encontros || []).map(e => ({ ...e, presentes: presentes[e.id] || 0 }));





    let ocorrencias = null;
    let ocorrenciasAviso = null;
    try {
      const { data: grupo, error: eG } = await supabase.from('mem_grupos')
        .select('dia_semana, horario, recorrencia').eq('id', gid).maybeSingle();
      if (eG) throw eG;



      const desdeExcecoes = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
      const { data: exc, error: eE } = await supabase.from('mem_grupo_agenda_excecoes')
        .select('data_original, status, nova_data, novo_horario, motivo')
        .eq('grupo_id', gid).gte('data_original', desdeExcecoes);
      if (eE) throw eE;
      const [ancoras, inicios] = await Promise.all([
        ancorasDeGrupos([gid]),




        iniciosDeGrupos([gid]),
      ]);
      const porData = new Map(lista.map(e => [String(e.data).slice(0, 10), e]));
      const brutas = ocorrenciasPassadas({
        diaSemana: grupo?.dia_semana, horario: grupo?.horario,
        recorrencia: grupo?.recorrencia, ancoraISO: ancoras[gid] || null,
        inicioISO: inicios[gid] || null,








        desdeISO: inicios[gid] || null,
        excecoes: exc || [], registradas: [...porData.keys()], quantas: 12,
      });






      ocorrencias = brutas.map((o, i) => {
        const enc = porData.get(o.data) || null;
        const janela = janelaCorrecaoPassada({
          dataOriginal: o.data_original,


          anteriorISO: brutas[i + 1]?.data || null,
          proximaISO: brutas[i - 1]?.data || null,
          hojeISO: hojeBRT(),






          ocupadas: [...porData.keys()].filter(d => d !== o.data),
        });
        return {
          ...o,
          encontro_id: enc?.id || null,
          presentes: enc ? enc.presentes : null,
          tema: enc?.tema || null,
          observacoes: enc?.observacoes || null,
          registrado_por_nome: enc?.registrado_por_nome || null,
          pode_corrigir: !!janela?.pode,
          corrigir_de: janela?.de || null,
          corrigir_ate: janela?.ate || null,


          corrigir_bloqueadas: janela?.bloqueadas || [],
        };
      });




      const naTimeline = new Set(ocorrencias.map(o => o.data));
      for (const e of lista) {
        const d = String(e.data).slice(0, 10);
        if (naTimeline.has(d)) continue;
        ocorrencias.push({
          data_original: d, data: d, horario: null, status: 'registrado',
          motivo: null, dia_semana: null, registrado: true, avulso: true,
          encontro_id: e.id, presentes: e.presentes, tema: e.tema,
          observacoes: e.observacoes, registrado_por_nome: e.registrado_por_nome,
        });
      }
      ocorrencias.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));
    } catch (e) {
      console.warn('[APP] encontros · timeline indisponível:', e.message);
      ocorrencias = null;
      ocorrenciasAviso = 'Não deu pra montar a agenda dos encontros agora.';
    }

    res.json({ encontros: lista, ocorrencias, ocorrencias_aviso: ocorrenciasAviso });
  } catch (e) {
    console.error('[APP] grupos/encontros:', e.message);
    res.status(500).json({ error: 'Erro ao carregar os encontros' });
  }
});













router.get('/grupos/:grupoId/encontros/:encontroId', authApp, limiterNormal, async (req, res) => {
  try {
    const gid = req.params.grupoId;
    const g = await gateGrupoApp(req, res, gid);
    if (!g.ok) return;

    const { data: enc } = await supabase.from('mem_grupo_encontros')
      .select('id, data, tema, observacoes, registrado_por_nome, created_at')
      .eq('id', req.params.encontroId).eq('grupo_id', gid).is('deleted_at', null)
      .maybeSingle();
    if (!enc) return res.status(404).json({ error: 'Encontro não encontrado' });

    const { data: pres } = await supabase.from('mem_grupo_encontro_presencas')
      .select('membro_id, presente, membro:mem_membros(id, nome)')
      .eq('encontro_id', enc.id);

    const presentes = (pres || [])
      .filter(p => p.presente)
      .map(p => {
        const m = Array.isArray(p.membro) ? p.membro[0] : p.membro;
        return { membro_id: p.membro_id, nome: m?.nome || '—' };
      })
      .sort((a, b) => String(a.nome).localeCompare(String(b.nome)));

    res.json({ encontro: { ...enc, presentes } });
  } catch (e) {
    console.error('[APP] grupos/encontros detalhe:', e.message);
    res.status(500).json({ error: 'Erro ao carregar o encontro' });
  }
});






router.post('/grupos/:grupoId/encontros', authApp, limiterNormal, async (req, res) => {
  try {
    const gid = req.params.grupoId;
    const g = await gateGrupoApp(req, res, gid);
    if (!g.ok) return;
    const hoje = hojeBRT();
    const data = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.data || '')) ? req.body.data : hoje;
    if (data > hoje) return res.status(400).json({ error: 'Não dá pra registrar encontro no futuro.' });



    const { data: roster } = await supabase.from('mem_grupo_membros')
      .select('membro_id').eq('grupo_id', gid).is('saiu_em', null).is('deleted_at', null);
    const validos = new Set((roster || []).map(r => r.membro_id).filter(Boolean));
    const presentes = (Array.isArray(req.body?.presentes) ? req.body.presentes : [])
      .filter(id => validos.has(id));

    const { data: encontroId, error } = await supabase.rpc('registrar_encontro_grupo', {
      p_grupo_id: gid,
      p_data: data,
      p_tema: req.body?.tema ? String(req.body.tema).trim().slice(0, 200) : null,
      p_observacoes: req.body?.observacoes ? String(req.body.observacoes).trim().slice(0, 2000) : null,
      p_registrado_por: req.user?.id || null,







      p_registrado_por_nome: g.meuPapel === 'supervisor'
        ? `${g.membro?.nome || req.user?.email || 'Supervisor'} (supervisor)`
        : (g.membro?.nome || req.user?.email || 'Líder (app)'),
      p_membros_presentes: presentes,
    });
    if (error) throw error;





    donosDoGrupo(g.grupo.id).then((donos) => {
      const alvos = donos.filter((id) => id !== req.user?.id);
      if (!alvos.length) return;
      return notificar({
        modulo: 'grupos',
        tipo: 'grupo_encontro_registrado',
        titulo: 'Encontro registrado pelo app',
        mensagem: `${g.grupo.nome}: ${presentes.length} presente(s) em ${data.split('-').reverse().join('/')}${req.body?.observacoes ? ' · com comentário do líder' : ''}.`,
        link: '/grupos',
        chaveDedup: `grupo_enc_${encontroId}`,
        targetIds: alvos,
      });
    }).catch(e => console.warn('[APP] encontro · notificar:', e.message));

    res.status(201).json({ ok: true, encontro_id: encontroId, presentes: presentes.length });
  } catch (e) {












    if (e?.code === '23505') {
      return res.status(409).json({
        error: 'Já existe frequência registrada para este grupo nesta data.',
        codigo: 'encontro_duplicado',
      });
    }
    console.error('[APP] grupos/encontros POST:', e.message);
    res.status(500).json({ error: 'Erro ao registrar a frequência' });
  }
});




























router.post('/grupos/:grupoId/visitas', authApp, limiterNormal, async (req, res) => {
  try {
    const gid = req.params.grupoId;
    const g = await gateGrupoApp(req, res, gid);
    if (!g.ok) return;

    const hoje = hojeBRT();
    const data = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.data_visita || ''))
      ? req.body.data_visita : hoje;
    if (data > hoje) return res.status(400).json({ error: 'Não dá pra registrar visita no futuro.' });

    const observacao = req.body?.observacao ? String(req.body.observacao).trim().slice(0, 2000) : null;







    const { data: jaTem } = await supabase.from('grupo_supervisao_visitas')
      .select('id, data_visita, observacao, status')
      .eq('grupo_id', gid)
      .eq('data_visita', data)
      .eq('status', 'realizada')
      .eq('responsavel_id', req.user?.id || null)
      .maybeSingle();
    if (jaTem) {

      if (observacao && observacao !== jaTem.observacao) {
        const { data: atualizada } = await supabase.from('grupo_supervisao_visitas')
          .update({ observacao }).eq('id', jaTem.id)
          .select('id, data_visita, observacao, status').maybeSingle();
        return res.status(200).json({ ok: true, visita: atualizada || jaTem, ja_existia: true });
      }
      return res.status(200).json({ ok: true, visita: jaTem, ja_existia: true });
    }

    const { data: linha, error } = await supabase.from('grupo_supervisao_visitas')
      .insert({
        grupo_id: gid,
        supervisor_id: g.membro?.id || null,
        responsavel_id: req.user?.id || null,
        registrado_por: req.user?.id || null,
        data_visita: data,
        observacao,
        status: 'realizada',
      })
      .select('id, data_visita, observacao, status')
      .single();
    if (error) throw error;


    donosDoGrupo(gid).then((donos) => {
      const alvos = donos.filter((id) => id !== req.user?.id);
      if (!alvos.length) return;
      return notificar({
        modulo: 'grupos',
        tipo: 'grupo_visita_registrada',
        titulo: 'Visita de supervisão registrada pelo app',
        mensagem: `${g.grupo.nome}: visita em ${data.split('-').reverse().join('/')}${observacao ? ' · com comentário' : ''}.`,
        link: '/grupos?tab=visitas',
        chaveDedup: `grupo_visita_${linha.id}`,
        targetIds: alvos,
      });
    }).catch(e => console.warn('[APP] visita · notificar:', e.message));

    res.status(201).json({ ok: true, visita: linha });
  } catch (e) {
    console.error('[APP] grupos/visitas POST:', e.message);
    res.status(500).json({ error: 'Erro ao registrar a visita' });
  }
});



router.get('/grupos/:grupoId/visitas', authApp, limiterNormal, async (req, res) => {
  try {
    const gid = req.params.grupoId;
    const g = await gateGrupoApp(req, res, gid);
    if (!g.ok) return;











    const uid = req.user?.id || null;
    let q = supabase.from('grupo_supervisao_visitas')
      .select('id, data_visita, observacao, status')
      .eq('grupo_id', gid)
      .eq('status', 'realizada');
    if (uid) q = q.or(`responsavel_id.eq.${uid},registrado_por.eq.${uid}`);
    const { data, error } = await q.order('data_visita', { ascending: false }).limit(20);
    if (error) throw error;
    res.json({ visitas: data || [] });
  } catch (e) {
    console.error('[APP] grupos/visitas GET:', e.message);
    res.status(500).json({ error: 'Erro ao carregar as visitas' });
  }
});


















async function janelaDaTemporada() {
  try {
    const { data, error } = await supabase.from('mem_temporadas')
      .select('data_fim').eq('inscricoes_abertas', true).order('data_inicio', { ascending: false }).limit(1);
    if (error) throw error;
    const fim = data && data[0] && data[0].data_fim;
    if (!fim) return 120;
    const dias = Math.ceil((new Date(String(fim).slice(0, 10) + 'T12:00:00Z') - Date.now()) / 86400000);
    return Math.max(30, Math.min(dias, 200));
  } catch (e) { console.warn('[APP] temporada indisponivel:', e.message); return 120; }
}

router.get('/grupos/:grupoId/agenda', authApp, limiterNormal, async (req, res) => {
  try {
    const gid = req.params.grupoId;
    const gate = await gateGrupoApp(req, res, gid);
    if (!gate.ok) return;
    const { data: g } = await supabase.from('mem_grupos')
      .select('id, nome, dia_semana, horario, recorrencia').eq('id', gid).maybeSingle();
    let excecoes = [];
    try {
      const { data, error } = await supabase.from('mem_grupo_agenda_excecoes')
        .select('data_original, status, nova_data, novo_horario, motivo, decidido_por_nome')
        .eq('grupo_id', gid).gte('data_original', new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
      if (error) throw error;
      excecoes = data || [];
    } catch (e) {
      console.warn('[APP] agenda indisponivel:', e.message);
      return res.json({ ocorrencias: [], aviso: 'A agenda ainda não está disponível. Tente mais tarde.' });
    }
    const ancoras = await ancorasDeGrupos([gid]);
    const janelaDias = await janelaDaTemporada();
    res.json({
      grupo: {
        id: g?.id, nome: g?.nome, dia_semana: g?.dia_semana,
        horario: g?.horario, recorrencia: g?.recorrencia || 'semanal',
      },
      ocorrencias: proximasOcorrencias({
        diaSemana: g?.dia_semana, horario: g?.horario,
        recorrencia: g?.recorrencia, ancoraISO: ancoras[gid] || null,
        excecoes, quantas: 40, janelaDias,
      }),




      anterior: ocorrenciaAnterior({
        diaSemana: g?.dia_semana, horario: g?.horario,
        recorrencia: g?.recorrencia, ancoraISO: ancoras[gid] || null,
        excecoes,
      }),
    });
  } catch (e) {
    console.error('[APP] agenda:', e.message);
    res.status(500).json({ error: 'Erro ao carregar a agenda' });
  }
});


router.post('/grupos/:grupoId/agenda', authApp, limiterStrict, async (req, res) => {
  try {
    const gid = req.params.grupoId;
    const gate = await gateGrupoApp(req, res, gid);
    if (!gate.ok) return;
    const {
      data_original, acao, nova_data, novo_horario, motivo,
      confirmar_apagar_chamada,
    } = req.body || {};





    const r = await aplicarExcecaoAgenda({
      grupoId: gid,
      dataOriginal: data_original,
      acao,
      novaData: nova_data,
      novoHorario: novo_horario,
      motivo,
      autor: { id: gate.membro?.id || null, nome: gate.membro?.nome || null },



      confirmarApagarChamada: confirmar_apagar_chamada === true,
    });
    if (!r.ok) {
      const corpo = { error: r.error };
      if (r.codigo) corpo.codigo = r.codigo;
      if (r.remarcar_de) corpo.remarcar_de = r.remarcar_de;
      if (r.remarcar_ate) corpo.remarcar_ate = r.remarcar_ate;


      if (r.presentes !== undefined) corpo.presentes = r.presentes;
      return res.status(r.http || 400).json(corpo);
    }





    if (r.acao !== 'desfeito') {
      (async () => {
        try {
          const cancelou = r.acao === 'cancelado';



          const titulo = cancelou
            ? (r.no_passado
              ? `Encontro não aconteceu: ${gate.grupo.nome}`
              : `Encontro cancelado: ${gate.grupo.nome}`)
            : (r.no_passado
              ? `Data de encontro corrigida: ${gate.grupo.nome}`
              : `Encontro remarcado: ${gate.grupo.nome}`);
          const quem = gate.membro?.nome || 'O líder';
          const mensagem = cancelou
            ? (r.no_passado
              ? `${quem} registrou que o encontro de ${data_original} não aconteceu.${r.motivo ? ` Motivo: ${r.motivo}` : ''}`
              : `${quem} cancelou o encontro de ${data_original}.${r.motivo ? ` Motivo: ${r.motivo}` : ''}`)
            : (r.no_passado
              ? `${quem} corrigiu a data do encontro de ${data_original} para ${r.nova_data}.`
                + `${r.chamada_movida ? ' A chamada foi movida junto.' : ''}${r.motivo ? ` Motivo: ${r.motivo}` : ''}`
              : `${quem} remarcou o encontro de ${data_original} para ${r.nova_data}`
                + `${r.novo_horario ? ` às ${r.novo_horario}` : ''}.${r.motivo ? ` Motivo: ${r.motivo}` : ''}`);
          await notificar({
            modulo: 'grupos',
            tipo: 'agenda_grupo_alterada',
            titulo,
            mensagem,
            link: '/grupos',
            severidade: 'info',
            chaveDedup: `agenda_${gid}_${data_original}_${r.acao}`,
          });
        } catch (err) { console.error('[APP] agenda notify:', err.message); }
      })();
    }

    res.json({ ok: true, acao: r.acao, chamada_movida: r.chamada_movida });
  } catch (e) {
    console.error('[APP] agenda escrita:', e.message);
    res.status(500).json({ error: 'Erro ao alterar o encontro' });
  }
});

router.post('/grupos/:grupoId/ajuda', authApp, limiterStrict, async (req, res) => {
  try {
    const gid = req.params.grupoId;
    const g = await gateGrupoApp(req, res, gid);
    if (!g.ok) return;
    const msg = String(req.body?.mensagem || '').trim();
    if (msg.length < 5) return res.status(400).json({ error: 'Escreva o que você precisa (pelo menos uma frase).' });
    const quem = g.membro?.nome || req.user?.email || 'Líder';
    await notificar({
      modulo: 'grupos',
      tipo: 'grupo_pedido_ajuda',
      titulo: `Pedido de ajuda · ${g.grupo.nome}`,
      mensagem: `${quem} (líder de "${g.grupo.nome}") pediu ajuda pelo app: "${msg.slice(0, 400)}"`,
      link: '/grupos?tab=entrada',
      severidade: 'aviso',

      chaveDedup: `grupo_ajuda_${gid}_${Date.now()}`,
    });
    res.status(201).json({ ok: true });
  } catch (e) {
    console.error('[APP] grupos/ajuda:', e.message);
    res.status(500).json({ error: 'Erro ao enviar seu pedido' });
  }
});


router.get('/grupos/:grupoId/materiais', authApp, limiterNormal, async (req, res) => {
  try {
    const gid = req.params.grupoId;
    const g = await gateGrupoApp(req, res, gid);
    if (!g.ok) return;
    const { data, error } = await supabase.from('mem_grupo_documentos')



      .select('id, nome, tipo, sharepoint_url, storage_path, etiquetas, grupo_ids, estudo_semana, created_at')
      .order('created_at', { ascending: false }).limit(200);
    if (error) throw error;

    const BUCKET = `${process.env.SUPABASE_URL || ''}/storage/v1/object/public/eventos-anexos/`;
    const materiais = (data || [])
      .filter(d => !Array.isArray(d.grupo_ids) || d.grupo_ids.length === 0 || d.grupo_ids.includes(gid))
      .slice(0, 60)
      .map(d => ({
        id: d.id, nome: d.nome, tipo: d.tipo,
        estudo_semana: !!d.estudo_semana, etiquetas: d.etiquetas || [],
        created_at: d.created_at,


        url: d.sharepoint_url || (d.storage_path ? BUCKET + d.storage_path : null),
      }));
    res.json({ materiais });
  } catch (e) {
    console.error('[APP] grupos/materiais:', e.message);
    res.status(500).json({ error: 'Erro ao carregar os estudos' });
  }
});






const STATUS_TAREFA = ['a_fazer', 'fazendo', 'concluida'];
const PRIOS_TAREFA = ['baixa', 'media', 'alta'];

function limparTarefaApp(d = {}) {
  const out = {};
  if (d.titulo !== undefined) out.titulo = String(d.titulo || '').trim().slice(0, 200);
  if (d.descricao !== undefined) out.descricao = d.descricao ? String(d.descricao).trim().slice(0, 2000) : null;
  if (d.data !== undefined) out.data = d.data || null;
  if (d.horario !== undefined) out.horario = d.horario || null;
  if (d.prioridade !== undefined) out.prioridade = PRIOS_TAREFA.includes(d.prioridade) ? d.prioridade : 'media';
  if (d.status !== undefined && STATUS_TAREFA.includes(d.status)) {
    out.status = d.status;
    out.done = d.status === 'concluida';
  }
  return out;
}


router.get('/tarefas', authApp, limiterNormal, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('tarefas_pessoais')
      .select('id, titulo, descricao, data, horario, prioridade, status, done, created_at, updated_at')
      .eq('created_by', req.user.id)
      .order('done', { ascending: true })
      .order('data', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[APP] tarefas list:', e.message);
    res.status(500).json({ error: 'Erro ao listar as tarefas' });
  }
});


router.post('/tarefas', authApp, limiterNormal, async (req, res) => {
  try {
    const d = req.body || {};
    if (!d.titulo || !String(d.titulo).trim()) return res.status(400).json({ error: 'Informe o título da tarefa' });
    const { data, error } = await supabase.from('tarefas_pessoais').insert({
      ...limparTarefaApp(d),
      titulo: String(d.titulo).trim().slice(0, 200),
      status: STATUS_TAREFA.includes(d.status) ? d.status : 'a_fazer',
      done: d.status === 'concluida',
      created_by: req.user.id,
      responsavel_id: req.user.id,
      tipo: 'pessoal',
      recorrencia: 'unica',
    }).select('id, titulo, descricao, data, horario, prioridade, status, done, created_at, updated_at').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('[APP] tarefas create:', e.message);
    res.status(500).json({ error: 'Erro ao criar a tarefa' });
  }
});


router.put('/tarefas/:id', authApp, limiterNormal, async (req, res) => {
  try {
    const patch = limparTarefaApp(req.body || {});
    if (patch.titulo !== undefined && !patch.titulo) return res.status(400).json({ error: 'Informe o título da tarefa' });
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nada para atualizar' });
    patch.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from('tarefas_pessoais')
      .update(patch)
      .eq('id', req.params.id).eq('created_by', req.user.id)
      .select('id, titulo, descricao, data, horario, prioridade, status, done, created_at, updated_at')
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Tarefa não encontrada' });
    res.json(data);
  } catch (e) {
    console.error('[APP] tarefas update:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar a tarefa' });
  }
});


router.delete('/tarefas/:id', authApp, limiterNormal, async (req, res) => {
  try {
    const { error, count } = await supabase.from('tarefas_pessoais')
      .delete({ count: 'exact' })
      .eq('id', req.params.id).eq('created_by', req.user.id);
    if (error) throw error;
    if (!count) return res.status(404).json({ error: 'Tarefa não encontrada' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[APP] tarefas delete:', e.message);
    res.status(500).json({ error: 'Erro ao excluir a tarefa' });
  }
});


























const {
  proximoSegundoDomingo: _proxSegDom,
  iso: _isoData,
  acharCriancaNaFamilia,
  validarPedido: _validarPedidoCrianca,
  pessoaDaCrianca,
  nomesDosPais,
} = require('../utils/criancaApresentacao');
const {
  hojeBRT: _hojeBrtApres,
  separar: _separarApres,
  juntar: _juntarApres,
} = require('../utils/apresentacaoHistorico');




const { escolherHorarioPara: _escolherHorarioApres } = require('../services/apresentacaoHorarios');
const { exigeConfirmacaoPaisIguais: _exigeConfPaisApres, rotuloHorarioApresentacao: _rotuloHorarioApres } = require('../utils/apresentacaoHorario');








async function paisDasCriancas(ids) {
  const mapa = new Map();
  if (!ids?.length) return mapa;
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from('mem_vinculos_familiares')
      .select('pessoa_id, relacionado_id')
      .eq('tipo', 'filho')
      .in('pessoa_id', ids.slice(i, i + 200))
      .is('deleted_at', null);
    for (const v of data || []) {
      if (!mapa.has(v.pessoa_id)) mapa.set(v.pessoa_id, []);
      mapa.get(v.pessoa_id).push(v.relacionado_id);
    }
  }
  return mapa;
}




















async function apresentacoesDaPessoa(membro) {
  const COLS = 'id, crianca_nome, data_apresentacao, horario_culto, status, crianca_id, created_at';
  const vazio = { vinculo: [], cpf: [], ficha_kids: [] };
  if (!membro?.id) return { linhas: [], incompleto: false };

  const falhas = [];
  const seguro = async (nome, fn) => {
    try { return (await fn()) || []; }
    catch (e) { falhas.push(nome); console.warn('[APP] apres/%s: %s', nome, e.message); return []; }
  };


  const porCaminho = { ...vazio };
  porCaminho.vinculo = await seguro('vinculo', async () => {
    const { data, error } = await supabase.from('apresentacao_criancas')
      .select(COLS).eq('responsavel_membro_id', membro.id).is('deleted_at', null);
    if (error) throw error;
    return data;
  });


  const cpf = String(membro.cpf || '').replace(/\D/g, '');
  if (cpf.length === 11) {
    porCaminho.cpf = await seguro('cpf', async () => {
      const { data, error } = await supabase.from('apresentacao_criancas')
        .select(COLS).eq('cpf_responsavel', cpf).is('deleted_at', null);
      if (error) throw error;
      return data;
    });
  }


  const criancas = await seguro('kids', async () => {
    const { data, error } = await supabase.from('kids_responsaveis')
      .select('crianca_id').eq('membro_id', membro.id).is('deleted_at', null);
    if (error) throw error;
    return data;
  });
  const ids = [...new Set((criancas || []).map((c) => c.crianca_id).filter(Boolean))];
  if (ids.length) {
    porCaminho.ficha_kids = await seguro('kids_apres', async () => {
      const out = [];

      for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await supabase.from('apresentacao_criancas')
          .select(COLS).in('crianca_id', ids.slice(i, i + 200)).is('deleted_at', null);
        if (error) throw error;
        out.push(...(data || []));
      }
      return out;
    });
  }




  return { linhas: _juntarApres(porCaminho), incompleto: falhas.length > 0 };
}


router.get('/apresentacao-crianca', authApp, limiterNormal, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    const data = _isoData(_proxSegDom());






    let familia = null;
    if (membro?.id) {
      try {
        const dados = await carregarFamiliaDoMembro(membro.id);
        familia = {
          nome: dados.familia?.nome || null,
          membros: (dados.familiares || []).map((f) => f.nome).filter(Boolean).slice(0, 8),
        };
      } catch (e) { console.warn('[APP] apres familia:', e.message); }
    }




    const { linhas, incompleto } = await apresentacoesDaPessoa(membro);
    const { proximas, historico } = _separarApres(linhas, _hojeBrtApres());

    res.json({
      proxima_data: data,
      familia,
      pedidos: proximas,

      historico,


      historico_incompleto: incompleto,

      pode_indicar_vinculo: !!membro?.id,
    });
  } catch (e) {
    console.error('[APP] apresentacao-crianca GET:', e.message);
    res.status(500).json({ error: 'Erro ao carregar a apresentação de crianças' });
  }
});




router.post('/apresentacao-crianca', authApp, limiterStrict, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    const v = _validarPedidoCrianca(req.body, membro);
    if (!v.ok) return res.status(400).json({ error: v.erro });
    const p = v.dados;

    const dataApres = _isoData(_proxSegDom());










    if (!p.propria && _exigeConfPaisApres(p.responsavel.nome_pai, p.responsavel.nome_mae, p.pais_iguais_confirmado)
       ) {
      return res.status(400).json({ codigo: 'pais_iguais', error: 'O nome do pai e o da mãe estão iguais. Confirme que é a mesma pessoa para seguir.' });
    }



    const escolhaHorario = await _escolherHorarioApres(dataApres);
    const horarioCulto = escolhaHorario.horario;

    let criancaMembroId = null;
    let reusou = false;
    let familiaNome = null;
    let extraMembroId = null;
    let extraEmOutraFamilia = false;
    let extraFalhou = false;

    if (p.propria) {












      const { data: eu } = await supabase.from('mem_membros')
        .select('id, familia_id, igreja_id, genero').eq('id', membro.id).maybeSingle();
      const meuSexo = sexoPara('curto', eu?.genero);
      if (meuSexo) p.responsavel.sexo = meuSexo;







      if (p.responsavel_extra) {
        try {
          const achou = await acharOuCriarGuardado({
            cpf: p.responsavel_extra.cpf,
            nome: p.responsavel_extra.nome,
            telefone: p.responsavel_extra.telefone,
            status: 'visitante',
            extra: p.responsavel_extra.sexo ? { genero: p.responsavel_extra.sexo } : {},
            origem: 'apresentacao_crianca_app',
            origemId: membro.id,
          });
          if (achou?.id) {
            extraMembroId = achou.id;
            const { data: dele } = await supabase.from('mem_membros')
              .select('familia_id').eq('id', achou.id).maybeSingle();







            if (!dele?.familia_id || dele.familia_id === eu?.familia_id) {
              const fx = await entrarNaFamilia(supabase, {
                membroId: achou.id, anfitriaoId: membro.id, userId: req.user?.id || null,
              });
              if (fx?.ok) familiaNome = fx.familia_nome || familiaNome;
            } else {
              extraEmOutraFamilia = true;
            }
          }
        } catch (e2) {



          console.warn('[APP] apres responsavel extra:', e2.message);
          extraFalhou = true;
        }
      }

      if (eu?.familia_id) {
        const { data: naFamilia } = await supabase.from('mem_membros')
          .select('id, nome, data_nascimento')
          .eq('familia_id', eu.familia_id).is('deleted_at', null);




        const paisPor = await paisDasCriancas((naFamilia || []).map((x) => x.id));
        const achada = acharCriancaNaFamilia(
          naFamilia, p.crianca.nome, p.crianca.data_nascimento,
          paisPor, [membro.id, extraMembroId].filter(Boolean),
        );
        if (achada) { criancaMembroId = achada.id; reusou = true; }
      }

      if (!criancaMembroId) {






        const { data: nova, error: errNova } = await supabase.from('mem_membros')
          .insert(pessoaDaCrianca(p.crianca, eu?.igreja_id || null))
          .select('id').single();
        if (errNova) throw errNova;
        criancaMembroId = nova.id;
      }




      const fam = await entrarNaFamilia(supabase, {
        membroId: criancaMembroId, anfitriaoId: membro.id, userId: req.user?.id || null,
      });
      if (fam?.ok) familiaNome = fam.familia_nome || null;
      await vincularParentesco(supabase, {
        pessoaId: criancaMembroId, relacionadoId: membro.id, tipo: 'filho',
        userId: req.user?.id || null,
      });




      if (extraMembroId) {
        await vincularParentesco(supabase, {
          pessoaId: criancaMembroId, relacionadoId: extraMembroId, tipo: 'filho',
          userId: req.user?.id || null,
        });
      }
    }










    let kidsCriancaId = null;
    try {


      const { data: kidDup } = await supabase.from('kids_criancas')
        .select('id, tem_alergia, alergia_qual, tem_espectro, espectro_qual, tem_limitacao_fisica, limitacao_fisica_qual')
        .ilike('nome', p.crianca.nome)
        .eq('data_nascimento', p.crianca.data_nascimento)
        .eq('ativo', true)
        .limit(1);
      if (kidDup && kidDup.length) {
        kidsCriancaId = kidDup[0].id;


        const patch = {};
        for (const [k, val] of Object.entries(p.crianca.saude || {})) {
          if (kidDup[0][k] === null || kidDup[0][k] === undefined) patch[k] = val;
        }
        if (Object.keys(patch).length) {
          await supabase.from('kids_criancas').update(patch).eq('id', kidsCriancaId);
        }
      } else {
        const { data: kid } = await supabase.from('kids_criancas')
          .insert({
            nome: p.crianca.nome,
            data_nascimento: p.crianca.data_nascimento,
            sexo: p.crianca.sexo || null,
            visitante: true,





        data_limite: kidsVisitante.prazoDe(hojeBRTKids()),
            observacoes_internas: `Cadastrado pela Apresentação de Crianças no app (${dataApres}).`,
            ...(p.crianca.saude || {}),
          })
          .select('id').single();
        kidsCriancaId = kid?.id || null;
      }
    } catch (e2) {
      console.warn('[APP] apres ficha kids:', e2.message);
    }


    const linha = {
      responsavel_membro_id: p.propria ? membro.id : null,
      responsavel_nome: p.responsavel.nome,
      responsavel_telefone: p.responsavel.telefone,
      responsavel_email: p.responsavel.email || null,
      crianca_nome: p.crianca.nome,
      crianca_data_nascimento: p.crianca.data_nascimento,

      crianca_sexo: sexoPara('canonico', p.crianca.sexo),
      crianca_id: kidsCriancaId,
      origem: 'app',
      status: 'pendente',





      ...(p.propria
        ? nomesDosPais(p.responsavel, p.responsavel_extra)
        : { nome_pai: p.responsavel.nome_pai || null, nome_mae: p.responsavel.nome_mae || null }),
      observacoes: p.observacoes,
      data_apresentacao: dataApres,





      ...(horarioCulto ? { horario_culto: horarioCulto } : {}),
      registrado_por: req.user?.id || null,
    };




    if (p.propria) {
      const { data: jaTem } = await supabase.from('apresentacao_criancas')
        .select('id, horario_culto').eq('responsavel_membro_id', membro.id)
        .eq('data_apresentacao', dataApres)
        .ilike('crianca_nome', p.crianca.nome)
        .is('deleted_at', null).maybeSingle();
      if (jaTem) {
        return res.json({
          ok: true, ja_inscrito: true, id: jaTem.id,
          data_apresentacao: dataApres, crianca_membro_id: criancaMembroId,
          familia: familiaNome, reusou_crianca: reusou,
          horario_culto: jaTem.horario_culto || null,
          horario_rotulo: _rotuloHorarioApres(jaTem.horario_culto, escolhaHorario.configurados),
        });
      }
    }

    const { data: criada, error } = await supabase.from('apresentacao_criancas')
      .insert(linha).select('id').single();
    if (error) throw error;



    try {
      await notificar({
        modulo: 'kids', tipo: 'apresentacao_crianca',
        titulo: 'Apresentação de criança pelo app',
        mensagem: `${p.responsavel.nome} pediu a apresentação de ${p.crianca.nome} em ${dataApres.split('-').reverse().join('/')}`
          + (horarioCulto ? ` · ${_rotuloHorarioApres(horarioCulto, escolhaHorario.configurados)}.` : '. Sem horário atribuído — definir na tela do Kids.'),
        link: '/kids', severidade: 'info',
        chaveDedup: `apres_app_${criada.id}`,
      });
    } catch (e2) { console.warn('[APP] apres notif:', e2.message); }

    res.status(201).json({
      ok: true, id: criada.id, data_apresentacao: dataApres,
      crianca_membro_id: criancaMembroId, familia: familiaNome,
      reusou_crianca: reusou,

      horario_culto: horarioCulto,
      horario_rotulo: _rotuloHorarioApres(horarioCulto, escolhaHorario.configurados),


      pager_inclusao: precisaPagerPorInclusao(p.crianca.saude),


      responsavel_extra: p.responsavel_extra
        ? {
            entrou: !!extraMembroId && !extraEmOutraFamilia && !extraFalhou,
            em_outra_familia: extraEmOutraFamilia,
            falhou: extraFalhou,
          }
        : null,
    });
  } catch (e) {
    console.error('[APP] apresentacao-crianca POST:', e.message);
    res.status(500).json({ error: 'Não foi possível registrar a apresentação agora' });
  }
});






const PARENTESCO_APP = {

  filho:   { tipo: 'filho',   rotulo: 'filho(a)' },
  pai_mae: { tipo: 'pai_mae', rotulo: 'pai/mãe' },
  conjuge: { tipo: 'conjuge', rotulo: 'cônjuge' },
  irmao:   { tipo: 'irmao',   rotulo: 'irmão(ã)' },
  outro:   { tipo: 'outro',   rotulo: 'familiar' },
};
const CODIGO_ALFA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function gerarCodigoFamilia(n = 6) {
  let s = '';
  for (let i = 0; i < n; i++) s += CODIGO_ALFA[Math.floor(Math.random() * CODIGO_ALFA.length)];
  return s;
}
const primeiroNome = (n) => String(n || '').trim().split(/\s+/)[0] || 'Alguém';


async function carregarFamiliaDoMembro(membroId) {
  const { data: m } = await supabase.from('mem_membros')
    .select('id, nome, familia_id, familia:mem_familias(id, nome)')
    .eq('id', membroId).maybeSingle();
  let familiares = [];
  if (m?.familia_id) {
    const { data: fs } = await supabase.from('mem_membros')
      .select('id, nome, foto_url, status')
      .eq('familia_id', m.familia_id).neq('id', membroId)
      .eq('active', true).is('deleted_at', null);
    familiares = fs || [];
  }
  const { data: vins } = await supabase.from('mem_vinculos_familiares')
    .select('tipo, relacionado:mem_membros!mem_vinculos_familiares_relacionado_id_fkey(id, nome)')
    .eq('pessoa_id', membroId).is('deleted_at', null);
  const parentescoPor = {};
  (vins || []).forEach((v) => { if (v.relacionado?.id) parentescoPor[v.relacionado.id] = v.tipo; });
  return {
    familia: m?.familia ? { id: m.familia.id, nome: m.familia.nome } : null,
    familiares: familiares.map((f) => ({ ...f, parentesco: parentescoPor[f.id] || null })),
  };
}


router.get('/familia', authApp, limiterNormal, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    if (!membro) return res.status(404).json({ error: 'Cadastro de membro não encontrado' });
    const dados = await carregarFamiliaDoMembro(membro.id);
    res.json(dados);
  } catch (e) {
    console.error('[APP] familia GET:', e.message);
    res.status(500).json({ error: 'Erro ao carregar sua família' });
  }
});


router.post('/familia/convite', authApp, limiterStrict, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    if (!membro) return res.status(404).json({ error: 'Cadastro de membro não encontrado' });
    const key = String(req.body?.parentesco || 'outro');
    const opt = PARENTESCO_APP[key] || PARENTESCO_APP.outro;



    let convite = null;
    const { data: pend } = await supabase.from('mem_familia_convites')
      .select('id, codigo, expira_em')
      .eq('criador_membro_id', membro.id).eq('parentesco', opt.tipo).eq('status', 'pendente')
      .is('deleted_at', null).gt('expira_em', new Date().toISOString())
      .order('created_at', { ascending: false }).limit(1);
    if (pend && pend[0]) {
      convite = pend[0];
    } else {

      let codigo = null;
      for (let i = 0; i < 20 && !codigo; i++) {
        const cand = gerarCodigoFamilia();
        const { data: existe } = await supabase.from('mem_familia_convites')
          .select('id').eq('codigo', cand).is('deleted_at', null).maybeSingle();
        if (!existe) codigo = cand;
      }
      if (!codigo) return res.status(500).json({ error: 'Não foi possível gerar o código, tente de novo' });
      const { data: m } = await supabase.from('mem_membros').select('familia_id').eq('id', membro.id).maybeSingle();
      const expira = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: ins, error } = await supabase.from('mem_familia_convites')
        .insert({ codigo, criador_membro_id: membro.id, familia_id: m?.familia_id || null, parentesco: opt.tipo, expira_em: expira })
        .select('id, codigo, expira_em').single();
      if (error) throw error;
      convite = ins;
    }

    const link = `${baseUrl()}/f/a/${convite.codigo}`;
    const mensagem = `Oi! Quero te adicionar como ${opt.rotulo} na minha família no app da CBRio. `
      + `É só abrir este link e confirmar: ${link}\n\nSe já tiver o app, você também pode entrar em "Minha família" e usar o código ${convite.codigo}.`;
    res.status(201).json({ codigo: convite.codigo, parentesco: opt.tipo, rotulo: opt.rotulo, link, mensagem, expira_em: convite.expira_em });
  } catch (e) {
    console.error('[APP] familia convite:', e.message);
    res.status(500).json({ error: 'Erro ao gerar o convite' });
  }
});


router.get('/familia/convite-info', authApp, limiterNormal, async (req, res) => {
  try {
    const codigo = String(req.query?.codigo || '').trim().toUpperCase();
    if (!codigo) return res.status(400).json({ error: 'Código não informado' });
    const { data: conv } = await supabase.from('mem_familia_convites')
      .select('id, status, expira_em, parentesco, criador_membro_id')
      .eq('codigo', codigo).is('deleted_at', null).maybeSingle();
    if (!conv) return res.status(404).json({ error: 'Convite não encontrado' });
    if (conv.status !== 'pendente') return res.status(410).json({ error: 'Convite já usado ou cancelado', status: conv.status });
    if (new Date(conv.expira_em) < new Date()) return res.status(410).json({ error: 'Convite expirado', status: 'expirado' });
    const { data: criador } = await supabase.from('mem_membros').select('nome').eq('id', conv.criador_membro_id).maybeSingle();
    const opt = PARENTESCO_APP[conv.parentesco] || PARENTESCO_APP.outro;
    res.json({ criador_nome: primeiroNome(criador?.nome), parentesco: conv.parentesco, rotulo: opt.rotulo });
  } catch (e) {
    console.error('[APP] familia convite-info:', e.message);
    res.status(500).json({ error: 'Erro ao ler o convite' });
  }
});


router.post('/familia/aceitar', authApp, limiterStrict, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    if (!membro) return res.status(404).json({ error: 'Cadastro de membro não encontrado' });
    const codigo = String(req.body?.codigo || '').trim().toUpperCase();
    if (!codigo) return res.status(400).json({ error: 'Código não informado' });

    const { data: conv } = await supabase.from('mem_familia_convites')
      .select('id, status, expira_em, parentesco, criador_membro_id, aceito_por_membro_id')
      .eq('codigo', codigo).is('deleted_at', null).maybeSingle();
    if (!conv) return res.status(404).json({ error: 'Convite não encontrado' });
    if (conv.status !== 'pendente') return res.status(410).json({ error: 'Este convite já foi usado ou cancelado' });
    if (new Date(conv.expira_em) < new Date()) return res.status(410).json({ error: 'Este convite expirou' });
    if (conv.criador_membro_id === membro.id) return res.status(400).json({ error: 'Você não pode aceitar o próprio convite' });


    const fam = await entrarNaFamilia(supabase, { membroId: membro.id, anfitriaoId: conv.criador_membro_id, userId: req.user?.id || null });
    if (!fam.ok) return res.status(500).json({ error: 'Não foi possível entrar na família' });


    if (conv.parentesco && VINC_INVERSO[conv.parentesco] && conv.parentesco !== 'outro') {
      await vincularParentesco(supabase, {
        pessoaId: membro.id, relacionadoId: conv.criador_membro_id, tipo: conv.parentesco, userId: req.user?.id || null,
      });
    }


    await supabase.from('mem_familia_convites')
      .update({ status: 'aceito', aceito_por_membro_id: membro.id, aceito_em: new Date().toISOString() })
      .eq('id', conv.id);


    try {
      const { data: prof } = await supabase.from('profiles').select('id').eq('membro_id', conv.criador_membro_id).maybeSingle();
      if (prof?.id) {
        await notificar({
          modulo: 'membresia', tipo: 'familia_convite_aceito',
          titulo: 'Convite de família aceito',
          mensagem: `${primeiroNome(membro.nome)} aceitou seu convite e agora faz parte da sua família.`,
          link: '/perfil', severidade: 'info',
          chaveDedup: `fam_conv_${conv.id}`, targetIds: [prof.id],
        });
      }
      await wpp.notificarMembro(conv.criador_membro_id, 'familia_convite_aceito', [primeiroNome(membro.nome)]);
    } catch (e2) { console.warn('[APP] familia aceitar notif:', e2.message); }

    const dados = await carregarFamiliaDoMembro(membro.id);
    res.json({ ok: true, familia: fam.familia_nome ? { id: fam.familia_id, nome: fam.familia_nome } : dados.familia, ...dados });
  } catch (e) {
    console.error('[APP] familia aceitar:', e.message);
    res.status(500).json({ error: 'Erro ao aceitar o convite' });
  }
});




router.delete('/familia/vinculo/:outroId', authApp, limiterNormal, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    if (!membro) return res.status(404).json({ error: 'Cadastro de membro não encontrado' });
    const outroId = req.params.outroId;

    const [{ data: a }, { data: b }] = await Promise.all([
      supabase.from('mem_membros').select('id, familia_id').eq('id', membro.id).maybeSingle(),
      supabase.from('mem_membros').select('id, familia_id').eq('id', outroId).maybeSingle(),
    ]);
    if (!b || !a?.familia_id || a.familia_id !== b.familia_id) {
      return res.status(400).json({ error: 'Essa pessoa não está na sua família' });
    }

    await supabase.from('mem_membros').update({ familia_id: null }).eq('id', outroId);

    const nowIso = new Date().toISOString();
    await supabase.from('mem_vinculos_familiares').update({ deleted_at: nowIso })
      .or(`and(pessoa_id.eq.${membro.id},relacionado_id.eq.${outroId}),and(pessoa_id.eq.${outroId},relacionado_id.eq.${membro.id})`)
      .is('deleted_at', null);
    const dados = await carregarFamiliaDoMembro(membro.id);
    res.json({ ok: true, ...dados });
  } catch (e) {
    console.error('[APP] familia remover vinculo:', e.message);
    res.status(500).json({ error: 'Erro ao remover da família' });
  }
});

















router.get('/eventos', authApp, limiterNormal, async (req, res) => {
  try {
    const nowIso = new Date().toISOString();


    const soCbrio = await filtroSoEventosCbrio();
    let qCatalogo = supabase.from('insc_eventos')
      .select('id, nome, slug, descricao, area, tipo, data, hora, local, capa_url, vagas, valor_centavos, pagamento_ativo, pagamento_metodos, parcelas_max, inscricoes_abrem_em, inscricoes_encerram_em, tem_sorteio, campos, msg_sucesso_titulo, msg_sucesso_texto, checkout_externo_url, checkout_externo_nome, created_at')
      .eq('status', 'publicado').is('deleted_at', null);
    if (soCbrio) qCatalogo = qCatalogo.or(soCbrio);
    const { data, error } = await qCatalogo
      .order('data', { ascending: true, nullsFirst: false })
      .limit(100);
    if (error) throw error;
    const abertos = (data || []).filter((e) => {
      if (e.inscricoes_abrem_em && e.inscricoes_abrem_em > nowIso) return false;
      if (e.inscricoes_encerram_em && e.inscricoes_encerram_em < nowIso) return false;
      return true;
    });




    await Promise.all(abertos.map((e) => anexarConfigMenor(e).catch(() => e)));



    const membro = await resolveMembroApp(req).catch(() => null);
    const inscritos = new Set();











    const pendentes = new Set();
    if (membro && abertos.length) {
      const chaves = chavesDaPessoa(membro);
      const idsAbertos = abertos.map((e) => e.id);
      const base = () => supabase.from('inscricoes')
        .select('id, evento_id, status, membro_id, cpf')
        .in('evento_id', idsAbertos)
        .neq('status', 'cancelada')
        .is('deleted_at', null);
      const { data: porVinculo } = await base().eq('membro_id', membro.id);



      let porCpf = [];
      if (chaves.cpf) {
        const r = await base().is('membro_id', null).eq('cpf', chaves.cpf);
        if (r.error) console.warn('[APP] eventos/inscrito por cpf:', r.error.message);
        else porCpf = r.data || [];
      }
      const minhas = mesclarInscricoes(porVinculo || [], porCpf, chaves);
      (minhas || []).forEach((i) => {
        inscritos.add(i.evento_id);
        if (i.status === 'recebida') pendentes.add(i.evento_id);
      });
    }





    const restantes = new Map();
    await Promise.all(abertos.filter((e) => e.vagas != null).map(async (e) => {
      try {
        const { data: v } = await supabase.rpc('fn_insc_vagas', { p_evento_id: e.id });
        const n = Array.isArray(v) ? v[0] : v;
        if (n && n.restantes != null) restantes.set(e.id, Number(n.restantes));
      } catch {                                                }
    }));

    const eventos = abertos.map((e) => ({
      id: e.id, nome: e.nome, slug: e.slug, descricao: e.descricao,
      area: e.area, tipo: e.tipo, data: e.data, hora: e.hora, local: e.local,
      capa_url: e.capa_url, vagas: e.vagas, tem_sorteio: e.tem_sorteio,



      inscricoes_encerram_em: e.inscricoes_encerram_em || null,
      vagas_restantes: restantes.has(e.id) ? restantes.get(e.id) : null,


      pagamento_pendente: pendentes.has(e.id),
      pago: !!e.pagamento_ativo,
      valor_centavos: e.pagamento_ativo ? (e.valor_centavos || null) : null,


      parcelas_max: e.pagamento_ativo ? (e.parcelas_max || null) : null,

      campos: Array.isArray(e.campos) ? e.campos : [],
      msg_sucesso_titulo: e.msg_sucesso_titulo || null,
      msg_sucesso_texto: e.msg_sucesso_texto || null,
      inscrito: inscritos.has(e.id),



      url: linkDoEvento(e.slug),






      checkout_externo: checkoutExterno.temCheckoutExterno(e) ? {
        nome: checkoutExterno.nomeExterno(e.checkout_externo_nome),
      } : null,






      so_web: checkoutExterno.temCheckoutExterno(e)
        || !!e.exige_dados_menor
        || (Array.isArray(e.termos_extra) && e.termos_extra.length > 0),
    }));
    res.json({
      eventos,


      textos: { termos_lgpd: TEXTOS_INSCRICAO.termos_lgpd, aviso_optin: TEXTOS_INSCRICAO.aviso_optin },
    });
  } catch (e) {
    console.error('[APP] eventos abertos:', e.message);
    res.status(500).json({ error: 'Erro ao carregar eventos' });
  }
});



router.get('/eventos/minhas', authApp, limiterNormal, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req).catch(() => null);
    if (!membro) return res.json({ inscricoes: [] });

    const COLS_MINHAS = 'id, evento_id, status, created_at, numero_sorte, valor_cobrado_centavos, bolsa_tipo, dados, membro_id, cpf, insc_eventos(id, nome, slug, data, hora, local, capa_url, tem_sorteio, pagamento_ativo, valor_centavos, checkin_ativo)';
    const chaves = chavesDaPessoa(membro);
    const { data: porVinculo, error } = await supabase.from('inscricoes')
      .select(COLS_MINHAS)
      .eq('membro_id', membro.id).is('deleted_at', null)
      .order('created_at', { ascending: false }).limit(50);
    if (error) throw error;





    let porCpf = [];
    if (chaves.cpf) {
      const r = await supabase.from('inscricoes')
        .select(COLS_MINHAS)
        .is('membro_id', null).eq('cpf', chaves.cpf).is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(50);
      if (r.error) console.warn('[APP] eventos/minhas por cpf:', r.error.message);
      else porCpf = r.data || [];


      if (porCpf.length) {
        const parceiros = new Set(await idsEventosParceiros().catch(() => []));
        if (parceiros.size) porCpf = porCpf.filter((i) => !parceiros.has(i.evento_id));
      }
    }
    const data = mesclarInscricoes(porVinculo || [], porCpf, chaves)
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
      .slice(0, 50);

    const ids = (data || []).map((i) => i.id);


    const pagos = {};
    if (ids.length) {
      const { data: pg, error: ePg } = await supabase
        .from('vw_insc_pagamento_estado')




        .select('inscricao_id, status_pagamento, metodo, valor_centavos, pago_em, expira_em, checkout_url')
        .in('inscricao_id', ids);
      if (ePg) console.warn('[APP] eventos/minhas pagamento:', ePg.message);
      (pg || []).forEach((pp) => { pagos[pp.inscricao_id] = pp; });
    }


    const cobrancas = {};
    if (ids.length) {
      const { data: cb } = await supabase.from('insc_pagamentos')


        .select('inscricao_id, pag_cobrancas(public_token)')
        .in('inscricao_id', ids);
      (cb || []).forEach((c) => {
        const tk = c.pag_cobrancas && c.pag_cobrancas.public_token;
        if (tk) cobrancas[c.inscricao_id] = tk;
      });
    }

    const inscricoes = (data || []).map((i) => {
      const ev = i.insc_eventos || {};
      const pg = pagos[i.id] || null;
      const tk = cobrancas[i.id] || null;
      return {
        id: i.id,
        status: i.status,
        criado_em: i.created_at,
        numero_sorte: ev.tem_sorteio ? i.numero_sorte : null,
        bolsa_tipo: i.bolsa_tipo || null,
        valor_cobrado_centavos: i.valor_cobrado_centavos,
        respostas: i.dados && typeof i.dados === 'object' ? i.dados : {},









        comprovante_url: i.status === 'confirmada'
          ? `${baseUrl()}/i/c/${gerarTokenComprovante(i.id)}`
          : null,


        comprovante_bloqueado: i.status === 'confirmada'
          ? null
          : (i.status === 'cancelada' ? 'cancelada' : 'aguardando_pagamento'),
        pagamento: pg ? {
          status: pg.status_pagamento, metodo: pg.metodo,
          valor_centavos: pg.valor_centavos, pago_em: pg.pago_em, expira_em: pg.expira_em,


          url: tk ? `${baseUrl()}/pagamento/${tk}` : (pg.checkout_url || null),
        } : null,
        evento: {
          id: ev.id, nome: ev.nome, slug: ev.slug, data: ev.data, hora: ev.hora,
          local: ev.local, capa_url: ev.capa_url, tem_sorteio: ev.tem_sorteio,
          pago: !!ev.pagamento_ativo, checkin_ativo: !!ev.checkin_ativo,


          url: linkDoEvento(ev.slug),
        },
      };
    });
    res.json({ inscricoes });
  } catch (e) {
    console.error('[APP] eventos/minhas:', e.message);
    res.status(500).json({ error: 'Erro ao carregar suas inscrições' });
  }
});





router.post('/eventos/:id/inscrever', authApp, limiterStrict, async (req, res) => {
  try {
    const ev = await eventoEspinhaPorId(req.params.id);
    if (!ev || ev.igreja_parceira) return res.status(404).json({ error: 'Evento não encontrado' });
    if (ev.status !== 'publicado') {
      return res.status(403).json({ error: 'As inscrições deste evento não estão abertas.' });
    }





    if (ev.exige_dados_menor || (Array.isArray(ev.termos_extra) && ev.termos_extra.length)) {
      return res.status(409).json({
        error: 'A inscrição deste evento é feita pelo formulário completo, no navegador.',
        so_web: true,
        url: linkDoEvento(ev.slug),
      });
    }

    const membro = await resolveMembroApp(req).catch(() => null);
    if (membro && !req.body?.membro_id) req.body = { ...(req.body || {}), membro_id: membro.id };
    return await inscreverEspinha(req, res, ev, { origem: 'app' });
  } catch (e) {
    console.error('[APP] eventos/inscrever:', e.message);
    res.status(500).json({ error: 'Erro ao inscrever no evento' });
  }
});






















async function campanhasParaDoarNoApp() {
  try {
    const { data, error } = await supabase
      .from('camp_campanhas')
      .select('id, nome, status, data_inicio, data_fim, descricao_curta, aceita_online')
      .eq('status', 'ativa')
      .is('deleted_at', null)
      .order('data_lancamento', { ascending: false });
    if (error) throw error;
    return campDoacao.campanhasOfertaveis(data || [], hojeBrtCamp());
  } catch (e) {

    console.warn('[app] campanhas para doar indisponíveis:', e.message);
    return [];
  }
}


router.get('/generosidade/config', limiterNormal, async (req, res) => {
  try {





    const aviso = !pagamentos.habilitado()
      ? 'A doação pelo app está temporariamente indisponível. Tente de novo em alguns minutos.'
      : !pagamentos.pspConfigurado()
        ? 'A doação pelo app ainda está sendo preparada.'
        : null;
    const campanhas = (await campanhasParaDoarNoApp()).map(campDoacao.paraOApp);
    res.json({
      ativo: !aviso,
      aviso: aviso || null,
      categorias: campDoacao.CATEGORIAS,


      campanhas,
    });
  } catch (e) {
    console.error('[app] generosidade/config:', e.message);


    res.status(500).json({ error: 'Não foi possível carregar a generosidade agora.' });
  }
});













router.get('/generosidade/link', limiterNormal, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);



    const token = membro?.id ? doacaoToken.emitir(membro.id) : null;
    const base = `${basePublica()}/doar`;
    res.json({
      url: token ? `${base}?t=${encodeURIComponent(token)}` : base,
      prefill: Boolean(token),



      motivo_sem_prefill: token ? null : (membro?.id ? 'sem_segredo' : 'sem_cadastro'),
    });
  } catch (e) {
    console.error('[app] generosidade/link:', e.message);


    res.status(500).json({ error: 'Não foi possível montar o link agora.' });
  }
});


router.post('/generosidade/doar', limiterStrict, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);



    if (!membro?.id) {
      return res.status(409).json({
        error: 'Complete seu cadastro para doar pelo app.', codigo: 'sem_cadastro',
      });
    }



    if (!pagamentos.habilitado() || !pagamentos.pspConfigurado()) {
      return res.status(503).json({
        error: 'A doação pelo app está indisponível agora.', codigo: 'pagamento_indisponivel',
      });
    }

    const valor = Number(req.body?.valor_centavos);
    if (!Number.isInteger(valor) || valor <= 0) {
      return res.status(400).json({ error: 'Valor inválido.', campo: 'valor_centavos' });
    }

    const ofertaveis = await campanhasParaDoarNoApp();
    const escolha = campDoacao.validarEscolha({
      categoria: req.body?.categoria,
      campanha_id: req.body?.campanha_id,
      ofertaveis,
    });
    if (!escolha.ok) {


      const msg = {
        campanha_nao_escolhida: 'Escolha a campanha.',
        campanha_indisponivel: 'Esta campanha não está mais recebendo doação.',
        categoria_invalida: 'Escolha dízimo, oferta ou campanha.',
      }[escolha.motivo] || 'Não foi possível iniciar a doação.';
      return res.status(400).json({ error: msg, codigo: escolha.motivo });
    }

    const { cobranca } = await pagamentos.criarCobranca({
      origem_tipo: pagamentos.ORIGENS.GENEROSIDADE,

      origem_id: null,
      valor_centavos: valor,
      descricao: campDoacao.descricaoDaDoacao({
        categoria: escolha.categoria, campanha_nome: escolha.campanha_nome,
      }),
      pagador_nome: membro.nome || null,
      pagador_cpf: membro.cpf || null,
      pagador_email: membro.email || null,
      pagador_telefone: membro.telefone || null,

      membro_id: membro.id,
      metadata: campDoacao.metadataDaDoacao({
        categoria: escolha.categoria,
        campanha_id: escolha.campanha_id,
        campanha_nome: escolha.campanha_nome,
        canal: 'app',
      }),
    });









    res.json({
      ok: true,
      token: cobranca.public_token,
      pagamento_url: `${basePublica()}/pagamento/${cobranca.public_token}`,
    });
  } catch (e) {
    console.error('[app] generosidade/doar:', e.message);
    notificar({
      modulo: 'financeiro',
      tipo: 'doacao_falha_criar',
      titulo: 'Falha ao criar cobrança de doação (app)',
      mensagem: `Alguém tentou doar pelo app e a cobrança não foi criada: ${e.message}.`,
      severidade: 'alerta',
      link: '/campanhas',
      chaveDedup: `doacao_falha_criar_app_${new Date().toISOString().slice(0, 10)}`,
    }).catch(() => {});
    res.status(502).json({ error: 'Não conseguimos iniciar a doação agora. Tente novamente em alguns minutos.' });
  }
});

module.exports = router;
