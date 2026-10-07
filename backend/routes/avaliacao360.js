












const express = require('express');
const { authenticate, authorizeModule, apenasColaborador } = require('../middleware/auth');
const { isAuthorizedCron } = require('../utils/cronAuth');
const { supabase } = require('../utils/supabase');
const { enviarEmail } = require('../services/email');
const { notificar } = require('../services/notificar');
const { avisoPcs, textoAviso, LIMITES_PADRAO } = require('../utils/aval360AvisoPcs');
const {
  funcionarioDoLogin, listarAtivos,
} = require('../services/avaliacao360');

const router = express.Router();




async function lembretesDoDia() {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const { data: ciclos, error } = await supabase.from('rh_aval360_ciclo')
    .select('id, nome, status, periodo_inicio, coleta_ate').eq('status', 'coleta').is('deleted_at', null);
  if (error) throw new Error(error.message);
  const feitos = [];
  for (const c of ciclos || []) {
    for (const tipo of avisoDoDia(c, hoje)) feitos.push({ ciclo: c.nome, ...(await avisoAutomatico(c, tipo)) });
  }
  return { hoje, feitos };
}

router.get('/cron/lembretes', async (req, res) => {
  if (!isAuthorizedCron(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    res.json(await lembretesDoDia());
  } catch (e) {
    console.error('[aval360] cron lembretes:', e.message);
    res.status(500).json({ error: 'Falha no cron de lembretes.' });
  }
});

router.use(authenticate, apenasColaborador);




const MOTIVO_HTTP = {
  sem_email: [403, 'Sua conta não tem e-mail — fale com o RH.'],
  nao_e_funcionario: [403, 'Seu login não está vinculado a um cadastro de colaborador no RH.'],
  email_ambiguo: [409, 'Há mais de um cadastro ativo com o seu e-mail no RH. Peça ao RH para consolidar antes de responder.'],
  consulta_falhou: [503, 'Não foi possível confirmar seu cadastro agora. Tente de novo em instantes.'],
};

async function comFuncionario(req, res) {
  const { funcionario, erro } = await funcionarioDoLogin(req);
  if (erro) {
    const [status, msg] = MOTIVO_HTTP[erro] || [500, 'Erro ao resolver seu cadastro.'];
    res.status(status).json({ error: msg, motivo: erro });
    return null;
  }
  return funcionario;
}






router.get('/minhas', async (req, res) => {
  try {
    const eu = await comFuncionario(req, res);
    if (!eu) return;

    const { data, error } = await supabase
      .from('rh_aval360_convite')
      .select('id, papel, aprovado_em, respondido_em, ciclo_id, avaliado_id, ciclo:ciclo_id(id, nome, status, periodo_inicio, coleta_ate, escala_max, config, deleted_at), avaliado:avaliado_id(id, nome, cargo, area)')
      .eq('avaliador_id', eu.id)
      .is('deleted_at', null)
      .is('suprimido_em', null)
      .order('papel');
    if (error) throw new Error(error.message);




    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const abertos = (data || []).filter((c) => c.ciclo?.status === 'coleta'
      && !c.ciclo.deleted_at && (!c.ciclo.coleta_ate || c.ciclo.coleta_ate >= hoje)
      && (!c.ciclo.periodo_inicio || c.ciclo.periodo_inicio <= hoje)
      && (c.papel !== 'par' || c.aprovado_em));

    res.json({
      eu: { id: eu.id, nome: eu.nome, area: eu.area },
      pendentes: abertos.filter((c) => !c.respondido_em),
      respondidos: abertos.filter((c) => c.respondido_em),
    });
  } catch (e) {
    console.error('[aval360] minhas:', e.message);


    res.status(500).json({ error: 'Não foi possível carregar suas avaliações.' });
  }
});


function falhaDeDominio(res, erro, mensagem) {
  const status = { P0400: 400, P0403: 403, P0409: 409 }[erro.code];
  return res.status(status || 500).json({ error: status ? erro.message : mensagem });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


router.get('/convite/:id', async (req, res) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Convite inválido.' });
    const eu = await comFuncionario(req, res);
    if (!eu) return;
    const { data, error } = await supabase.rpc('fn_aval360_formulario', {
      p_convite_id: req.params.id, p_avaliador_id: eu.id,
    });
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[aval360] convite:', e.message);
    falhaDeDominio(res, e, 'Não foi possível carregar o formulário.');
  }
});

router.post('/convite/:id/responder', async (req, res) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Convite inválido.' });
    const eu = await comFuncionario(req, res);
    if (!eu) return;


    const { data, error } = await supabase.rpc('fn_aval360_responder', {
      p_convite_id: req.params.id, p_avaliador_id: eu.id, p_notas: req.body?.notas ?? null,
    });
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[aval360] responder:', e.message);
    falhaDeDominio(res, e, 'Não foi possível salvar sua resposta.');
  }
});


router.post('/convite/:id/editar', async (req, res) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Convite inválido.' });
    const eu = await comFuncionario(req, res);
    if (!eu) return;
    const { data, error } = await supabase.rpc('fn_aval360_editar_resposta', {
      p_convite_id: req.params.id, p_avaliador_id: eu.id, p_notas: req.body?.notas ?? null,
    });
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[aval360] editar resposta:', e.message);
    falhaDeDominio(res, e, 'Não foi possível salvar a alteração.');
  }
});






router.get('/ciclos', authorizeModule('rh', 3), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('rh_aval360_ciclo')
      .select('*')
      .is('deleted_at', null)
      .order('periodo_inicio', { ascending: false });
    if (error) throw new Error(error.message);
    const ciclos = data || [];
    const ids = ciclos.map((c) => c.id);


    let convites = [];
    let perguntas = [];
    if (ids.length) {
      [convites, perguntas] = await Promise.all([
        lerTodos(() => supabase.from('rh_aval360_convite').select('id, ciclo_id, avaliado_id, respondido_em')
          .in('ciclo_id', ids).is('deleted_at', null).is('suprimido_em', null).order('id')),
        lerTodos(() => supabase.from('rh_aval360_pergunta').select('id, ciclo_id')
          .in('ciclo_id', ids).is('deleted_at', null).order('id')),
      ]);
    }
    res.json(ciclos.map((c) => {
      const cv = convites.filter((x) => x.ciclo_id === c.id);
      return {
        ...c,
        resumo: {
          avaliados: new Set(cv.map((x) => x.avaliado_id)).size,
          formularios: cv.length,
          respondidos: cv.filter((x) => x.respondido_em).length,
          perguntas: perguntas.filter((x) => x.ciclo_id === c.id).length,
        },
      };
    }));
  } catch (e) {
    console.error('[aval360] ciclos:', e.message);
    res.status(500).json({ error: 'Não foi possível carregar os ciclos.' });
  }
});








const COMPETENCIAS_PADRAO = [
  'fz_relacionamento', 'fz_postura_pessoal', 'fz_postura_profissional', 'fz_postura_espiritual',
  'fz_grandes_desafios', 'fz_perseveranca', 'fz_desenvolvimento', 'fz_compreende_ama',
];

const ROTULOS_PADRAO_6 = ['Discordo totalmente', 'Discordo', 'Discordo em parte', 'Concordo em parte', 'Concordo', 'Concordo totalmente'];
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const PAPEIS_ORDEM = ['auto', 'gestor', 'par', 'liderado'];


async function lerTodos(montar) {
  const todos = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await montar().range(offset, offset + 999);
    if (error) throw new Error(error.message);
    todos.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return todos;
}

function rotulosValidos(v, max) {
  return v === null || (Array.isArray(v) && v.length === max
    && v.every((r) => typeof r === 'string' && r.trim().length > 0 && r.length <= 60));
}






const CAMPOS_RASCUNHO = ['nome', 'descricao', 'periodo_inicio', 'periodo_fim', 'coleta_ate',
  'escala_max', 'escala_rotulos', 'peso_auto', 'peso_gestor', 'peso_outros', 'participantes', 'config'];
const CAMPOS_ABERTO = ['descricao', 'coleta_ate', 'config'];


const CONFIG_PADRAO = {
  exigir_comentario_avaliadores: false, exigir_comentario_auto: false,
  devolutiva: true, gestor_libera: true,
  gestor_ve_quadrante: true, gestor_ve_comentarios: true,
  participante_ve_quadrante: true, participante_ve_comentarios: true, participante_so_nota_final: false,

  respostas_como_opcoes: false,

  mostrar_abaixo_do_piso: false,
  permitir_edicao: false,
};
const configDe = (c) => ({ ...CONFIG_PADRAO, ...((c && typeof c === 'object') ? c : {}) });

function camposDoCiclo(corpo, permitidos) {
  const out = {};
  for (const k of permitidos) {
    if (!(k in (corpo || {}))) continue;
    const v = corpo[k];
    if (k === 'config') {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return { erro: 'Configurações inválidas.' };
      for (const [ck, cv] of Object.entries(v)) {
        if (!(ck in CONFIG_PADRAO) || typeof cv !== 'boolean') return { erro: `Configuração desconhecida: ${ck}.` };
      }
      out[k] = v;
      continue;
    }
    if (k === 'participantes') {

      if (v !== null && !(Array.isArray(v) && v.length > 0 && v.length <= 500 && v.every((x) => typeof x === 'string' && UUID.test(x)))) {
        return { erro: 'Grupo do ciclo inválido.' };
      }
      out[k] = v === null ? null : [...new Set(v)];
      continue;
    }
    if (k === 'escala_rotulos') {
      if (v !== null && !Array.isArray(v)) return { erro: 'Nomes da escala inválidos.' };
      out[k] = v === null ? null : v.map((r) => (typeof r === 'string' ? r.trim() : r));
      continue;
    }
    if (k.endsWith('_ate') || k.startsWith('periodo_')) {
      if (v === null && k.startsWith('periodo_')) return { erro: `${k} é obrigatório.` };
      if (v !== null && !(typeof v === 'string' && DATA.test(v))) return { erro: `Data inválida em ${k}.` };
    } else if (k === 'nome') {
      if (typeof v !== 'string' || !v.trim() || v.length > 200) return { erro: 'Nome inválido.' };
    } else if (k === 'descricao') {
      if (v !== null && (typeof v !== 'string' || v.length > 5000)) return { erro: 'Descrição inválida.' };
    } else if (typeof v !== 'number' || !Number.isFinite(v)) {
      return { erro: `Valor inválido em ${k}.` };
    }
    out[k] = k === 'nome' ? v.trim() : v;
  }
  if ('escala_max' in out && !Number.isInteger(out.escala_max)) return { erro: 'A escala vai de 1 a um número inteiro (3 a 10).' };
  return { campos: out };
}

const MSG_REGRAS = 'Valores fora das regras do ciclo (pesos somam 100%, escala de 3 a 10 pontos, um nome por ponto).';



const EIXOS = ['resultado', 'comportamento'];
const APLICA = ['todos', 'gestores'];

function camposDoCriterio(corpo, parcial) {
  const out = {};
  const c = corpo || {};
  if ('nome' in c || !parcial) {
    if (typeof c.nome !== 'string' || !c.nome.trim() || c.nome.length > 200) return { erro: 'Escreva o critério (até 200 caracteres).' };
    out.nome = c.nome.trim();
  }
  if ('descricao' in c) {
    if (c.descricao !== null && (typeof c.descricao !== 'string' || c.descricao.length > 2000)) return { erro: 'Descrição inválida.' };
    out.descricao = c.descricao ? c.descricao.trim() : null;
  }
  if ('eixo' in c || !parcial) {
    if (!EIXOS.includes(c.eixo)) return { erro: 'Eixo inválido.' };
    out.eixo = c.eixo;
  }
  if ('aplica_a' in c || !parcial) {
    const v = c.aplica_a ?? 'todos';
    if (!APLICA.includes(v)) return { erro: 'Para quem vale: todos ou só gestores.' };
    out.aplica_a = v;
  }
  if (parcial && 'ativo' in c) {
    if (typeof c.ativo !== 'boolean') return { erro: 'ativo deve ser verdadeiro/falso.' };
    out.ativo = c.ativo;
  }
  return { campos: out };
}


router.get('/competencias', authorizeModule('rh', 3), async (req, res) => {
  try {
    const { data, error } = await catalogoDeCriterios('id, codigo, nome, descricao, eixo, aplica_a, area, ordem');
    if (error) throw new Error(error.message);
    res.json(data || []);
  } catch (e) {
    console.error('[aval360] competencias:', e.message);
    res.status(500).json({ error: 'Não foi possível carregar os critérios.' });
  }
});




async function catalogoDeCriterios(colunas, { soAtivos = true } = {}) {
  const montar = (cols) => {
    let q = supabase.from('rh_aval360_competencia').select(cols).is('deleted_at', null).order('ordem');
    if (soAtivos) q = q.eq('ativo', true);
    return q;
  };
  const r = await montar(`${colunas}, peso_pcs`);
  if (r.error?.code === '42703') {
    const r2 = await montar(colunas);
    return { ...r2, data: (r2.data || []).map((c) => ({ ...c, peso_pcs: 1 })), pesoPcsPendente: true };
  }
  return r;
}




router.put('/competencias/:id/peso-pcs', authorizeModule('rh', 3), async (req, res) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Critério inválido.' });
    const p = req.body?.peso_pcs;
    if (typeof p !== 'number' || !Number.isFinite(p) || p < 0 || p > 5 || Math.round(p * 2) !== p * 2) {
      return res.status(400).json({ error: 'O peso no PCS vai de 0 a 5, de meio em meio.' });
    }
    const { data, error } = await supabase.from('rh_aval360_competencia').update({ peso_pcs: p })
      .eq('id', req.params.id).is('deleted_at', null).select('id, peso_pcs').maybeSingle();
    if (error?.code === '42703') return res.status(409).json({ error: 'Falta aplicar a migration do peso no PCS (20261005180000).' });
    if (error) throw new Error(error.message);
    if (!data) return res.status(404).json({ error: 'Critério não encontrado.' });
    res.json(data);
  } catch (e) {
    console.error('[aval360] peso pcs:', e.message);
    res.status(500).json({ error: 'Não foi possível salvar o peso no PCS.' });
  }
});


router.post('/competencias', authorizeModule('rh', 3), async (req, res) => {
  try {
    const { campos, erro } = camposDoCriterio(req.body, false);
    if (erro) return res.status(400).json({ error: erro });
    const codigo = `rh_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const { data, error } = await supabase
      .from('rh_aval360_competencia')
      .insert({ ...campos, codigo, ordem: 500 })
      .select('id, codigo, nome, descricao, eixo, aplica_a, ordem')
      .single();
    if (error) throw new Error(error.message);
    res.status(201).json(data);
  } catch (e) {
    console.error('[aval360] criar criterio:', e.message);
    res.status(500).json({ error: 'Não foi possível criar o critério.' });
  }
});









router.patch('/competencias/:id', authorizeModule('rh', 3), async (req, res) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Critério inválido.' });
    const { campos, erro } = camposDoCriterio(req.body, true);
    if (erro) return res.status(400).json({ error: erro });
    if (!Object.keys(campos).length) return res.status(400).json({ error: 'Nada para alterar.' });
    const mudaTexto = Object.keys(campos).some((k) => k !== 'ativo');
    if (mudaTexto) {
      const { data: usos, error: errU } = await supabase
        .from('rh_aval360_ciclo_competencia')
        .select('ciclo:ciclo_id(status, deleted_at)')
        .eq('competencia_id', req.params.id)
        .is('deleted_at', null);
      if (errU) throw new Error(errU.message);
      if ((usos || []).some((u) => u.ciclo && !u.ciclo.deleted_at && u.ciclo.status !== 'rascunho')) {
        return res.status(409).json({ error: 'Este critério já foi usado num ciclo enviado. Crie um critério novo em vez de reescrever este.' });
      }
    }
    const { data, error } = await supabase
      .from('rh_aval360_competencia').update(campos).eq('id', req.params.id).is('deleted_at', null)
      .select('id, codigo, nome, descricao, eixo, aplica_a, ordem, ativo').maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return res.status(404).json({ error: 'Critério não encontrado.' });
    res.json(data);
  } catch (e) {
    console.error('[aval360] editar criterio:', e.message);
    res.status(500).json({ error: 'Não foi possível salvar o critério.' });
  }
});




router.post('/ciclos', authorizeModule('rh', 3), async (req, res) => {
  try {
    const { campos, erro } = camposDoCiclo(req.body, CAMPOS_RASCUNHO);
    if (erro) return res.status(400).json({ error: erro });
    if (!campos.nome || !campos.periodo_inicio || !campos.periodo_fim) {
      return res.status(400).json({ error: 'Informe nome e período do ciclo.' });
    }
    const linha = { escala_max: 6, ...campos, status: 'rascunho', created_by: req.user?.id || null };
    if (!('escala_rotulos' in campos)) linha.escala_rotulos = linha.escala_max === 6 ? ROTULOS_PADRAO_6 : null;
    if (!rotulosValidos(linha.escala_rotulos, linha.escala_max)) {
      return res.status(400).json({ error: 'Dê um nome para cada ponto da escala (ou nenhum).' });
    }
    const { data: ciclo, error } = await supabase.from('rh_aval360_ciclo').insert(linha).select('*').single();
    if (error) {
      if (error.code === '23514') return res.status(400).json({ error: MSG_REGRAS });
      throw new Error(error.message);
    }
    const { data: padrao, error: errP } = await supabase
      .from('rh_aval360_competencia')
      .select('id, codigo, nome')
      .in('codigo', COMPETENCIAS_PADRAO)
      .eq('ativo', true)
      .is('deleted_at', null);
    if (errP) throw new Error(errP.message);



    const itens = COMPETENCIAS_PADRAO
      .map((codigo) => (padrao || []).find((c) => c.codigo === codigo))
      .filter(Boolean)
      .map((c) => ({ competencia_id: c.id, texto: c.nome }));
    if (itens.length) {
      const { error: errD } = await supabase.rpc('fn_aval360_salvar_perguntas', { p_ciclo_id: ciclo.id, p_itens: itens });
      if (errD) throw errD;
    }
    res.status(201).json({ ...ciclo, perguntas_padrao: itens.length });
  } catch (e) {
    console.error('[aval360] criar ciclo:', e.message);
    falhaDeDominio(res, e, 'Não foi possível criar o ciclo.');
  }
});


router.get('/ciclos/:id', authorizeModule('rh', 3), async (req, res) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Ciclo inválido.' });
    const { data: ciclo, error } = await supabase
      .from('rh_aval360_ciclo').select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (error) throw new Error(error.message);
    if (!ciclo) return res.status(404).json({ error: 'Ciclo não encontrado.' });
    const { data: vinc, error: errV } = await supabase
      .from('rh_aval360_ciclo_competencia')
      .select('peso, ordem, visivel, competencia:competencia_id(id, codigo, nome, descricao, eixo, aplica_a)')
      .eq('ciclo_id', ciclo.id)
      .is('deleted_at', null)
      .order('ordem');
    if (errV) throw new Error(errV.message);
    const { data: perguntas, error: errQ } = await supabase
      .from('rh_aval360_pergunta')
      .select('id, texto, ajuda, ordem, competencia:competencia_id(id, nome, eixo, aplica_a)')
      .eq('ciclo_id', ciclo.id)
      .is('deleted_at', null)
      .order('ordem');
    if (errQ) throw new Error(errQ.message);
    res.json({ ...ciclo, config: configDe(ciclo.config), competencias: vinc || [], perguntas: perguntas || [] });
  } catch (e) {
    console.error('[aval360] ciclo:', e.message);
    res.status(500).json({ error: 'Não foi possível carregar o ciclo.' });
  }
});


router.patch('/ciclos/:id', authorizeModule('rh', 3), async (req, res) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Ciclo inválido.' });
    const { data: atual, error: errA } = await supabase
      .from('rh_aval360_ciclo').select('id, status, escala_max, config').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (errA) throw new Error(errA.message);
    if (!atual) return res.status(404).json({ error: 'Ciclo não encontrado.' });
    if (['publicado', 'encerrado'].includes(atual.status)) {
      return res.status(409).json({ error: 'Ciclo publicado não se edita.' });
    }
    const permitidos = atual.status === 'rascunho' ? CAMPOS_RASCUNHO : CAMPOS_ABERTO;
    const { campos, erro } = camposDoCiclo(req.body, permitidos);
    if (erro) return res.status(400).json({ error: erro });
    const ignorados = Object.keys(req.body || {}).filter((k) => !permitidos.includes(k));
    if (!Object.keys(campos).length) return res.status(400).json({ error: 'Nada para alterar.', ignorados });

    if (campos.config && atual.status !== 'rascunho' && Object.keys(campos.config).some((k) => k.startsWith('exigir_'))) {
      return res.status(409).json({ error: 'Comentário obrigatório só muda antes de enviar o ciclo.' });
    }
    const ligouAbaixoPiso = campos.config?.mostrar_abaixo_do_piso === true && !atual.config?.mostrar_abaixo_do_piso;

    if (campos.config) campos.config = { ...(atual.config || {}), ...campos.config };

    if ('escala_max' in campos && !('escala_rotulos' in campos) && campos.escala_max !== atual.escala_max) {
      campos.escala_rotulos = null;
    }
    if ('escala_rotulos' in campos && !rotulosValidos(campos.escala_rotulos, campos.escala_max ?? atual.escala_max)) {
      return res.status(400).json({ error: 'Dê um nome para cada ponto da escala (ou nenhum).' });
    }

    const { data, error } = await supabase
      .from('rh_aval360_ciclo').update(campos).eq('id', atual.id).eq('status', atual.status).select('*').maybeSingle();
    if (error) {
      if (error.code === '23514') return res.status(400).json({ error: MSG_REGRAS });
      throw new Error(error.message);
    }
    if (!data) return res.status(409).json({ error: 'O ciclo mudou de fase durante a edição. Recarregue.' });

    if (ligouAbaixoPiso) {
      const { error: errR } = await supabase.rpc('fn_aval360_reativar_abaixo_piso', { p_ciclo_id: atual.id });
      if (errR) console.error('[aval360] reativar abaixo do piso:', errR.message);
    }
    res.json({ ...data, ignorados });
  } catch (e) {
    console.error('[aval360] editar ciclo:', e.message);
    res.status(500).json({ error: 'Não foi possível salvar o ciclo.' });
  }
});





router.put('/ciclos/:id/perguntas', authorizeModule('rh', 3), async (req, res) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Ciclo inválido.' });
    const itens = req.body?.itens;
    if (!Array.isArray(itens)) return res.status(400).json({ error: 'Envie a lista de perguntas.' });
    const { data, error } = await supabase.rpc('fn_aval360_salvar_perguntas', {
      p_ciclo_id: req.params.id,
      p_itens: itens.map((i) => ({ competencia_id: i?.competencia_id, texto: i?.texto, ajuda: i?.ajuda ?? null })),
    });
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[aval360] perguntas:', e.message);
    falhaDeDominio(res, e, 'Não foi possível salvar as perguntas.');
  }
});


router.put('/ciclos/:id/criterios/:competenciaId', authorizeModule('rh', 3), async (req, res) => {
  try {
    const { id, competenciaId } = req.params;
    if (!UUID.test(id) || !UUID.test(String(competenciaId))) return res.status(400).json({ error: 'Parâmetro inválido.' });
    const { peso, visivel } = req.body || {};
    if (peso !== undefined && peso !== null && (typeof peso !== 'number' || !Number.isFinite(peso))) return res.status(400).json({ error: 'Peso inválido.' });
    if (visivel !== undefined && visivel !== null && typeof visivel !== 'boolean') return res.status(400).json({ error: 'Visibilidade inválida.' });
    if (peso == null && visivel == null) return res.status(400).json({ error: 'Nada para alterar.' });
    const { data, error } = await supabase.rpc('fn_aval360_config_criterio', {
      p_ciclo_id: id, p_competencia_id: competenciaId, p_peso: peso ?? null, p_visivel: visivel ?? null,
    });
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[aval360] criterio:', e.message);
    falhaDeDominio(res, e, 'Não foi possível salvar o critério.');
  }
});


router.post('/ciclos/:id/status', authorizeModule('rh', 3), async (req, res) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Ciclo inválido.' });
    const para = req.body?.para;
    if (!['coleta', 'apuracao', 'publicado', 'encerrado'].includes(para)) {
      return res.status(400).json({ error: 'Fase inválida.' });
    }
    const { data, error } = await supabase.rpc('fn_aval360_mudar_status', { p_ciclo_id: req.params.id, p_para: para });
    if (error) throw error;

    let aviso = null;
    if (para === 'coleta' && !data?.reaberto) {
      try {
        const { data: c } = await supabase.from('rh_aval360_ciclo').select('id, nome, status, periodo_inicio, coleta_ate').eq('id', req.params.id).maybeSingle();
        const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
        if (c && (!c.periodo_inicio || c.periodo_inicio <= hoje)) aviso = await avisoAutomatico(c, 'abertura');
      } catch (e2) { console.error('[aval360] aviso de abertura:', e2.message); }
    }

    if (para === 'publicado') {
      try {
        const r = await avisosPcsDoCiclo(req.params.id);
        const n = (r.pessoas || []).filter((p) => p.texto).length;
        if (n) {
          await notificar({
            modulo: 'rh', tipo: 'aval360_aviso_pcs',
            titulo: `Avaliação 360 publicada · ${n} ${n === 1 ? 'pessoa' : 'pessoas'} para revisar o enquadramento`,
            mensagem: `O ciclo "${r.ciclo.nome}" foi publicado. ${n === 1 ? '1 resultado pede' : `${n} resultados pedem`} um olhar no cargo (nota alta, nota baixa ou gestor e equipe vendo diferente). Veja em RH → Avaliação 360 → Resultados.`,
            link: '/admin/rh', severidade: 'info', chaveDedup: `aval360_aviso_pcs_${req.params.id}`,
          });
        }
      } catch (e2) { console.error('[aval360] notificar avisos pcs:', e2.message); }
    }
    res.json({ ...data, aviso });
  } catch (e) {
    console.error('[aval360] status:', e.message);
    falhaDeDominio(res, e, 'Não foi possível mudar a fase do ciclo.');
  }
});




router.post('/ciclos/:id/sugerir', authorizeModule('rh', 3), async (req, res) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Ciclo inválido.' });
    const { data, error } = await supabase.rpc('fn_aval360_sugerir_avaliadores', { p_ciclo_id: req.params.id });
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[aval360] sugerir:', e.message);
    falhaDeDominio(res, e, 'Não foi possível montar a lista pela hierarquia.');
  }
});











router.get('/ciclos/:id/avaliadores', authorizeModule('rh', 3), async (req, res) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Ciclo inválido.' });
    const { data: ciclo, error: errC } = await supabase
      .from('rh_aval360_ciclo').select('id, status, piso_respondentes').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (errC) throw new Error(errC.message);
    if (!ciclo) return res.status(404).json({ error: 'Ciclo não encontrado.' });
    const [convites, ativos] = await Promise.all([
      lerTodos(() => supabase
        .from('rh_aval360_convite')
        .select('id, papel, origem, suprimido_em, suprimido_motivo, avaliado_id, avaliador:avaliador_id(id, nome, cargo, area)')
        .eq('ciclo_id', ciclo.id)
        .is('deleted_at', null)
        .order('id')),
      listarAtivos(),
    ]);
    const piso = ciclo.piso_respondentes;
    const porId = new Map(ativos.map((f) => [f.id, f]));
    const pessoas = new Map();
    for (const c of convites) {
      const p = pessoas.get(c.avaliado_id) || { avaliado: null, avaliadores: [], removidos: [] };
      const item = { convite_id: c.id, papel: c.papel, origem: c.origem, avaliador: c.avaliador };
      if (c.suprimido_em) p.removidos.push({ ...item, motivo: c.suprimido_motivo });
      else p.avaliadores.push(item);
      pessoas.set(c.avaliado_id, p);
    }
    const linhas = [...pessoas.entries()].map(([id, p]) => {
      const f = porId.get(id);
      const contagem = Object.fromEntries(PAPEIS_ORDEM.map((papel) => [papel, p.avaliadores.filter((a) => a.papel === papel).length]));
      const alertas = [];
      if (!contagem.gestor) alertas.push('sem_gestor');
      for (const papel of ['par', 'liderado']) {
        if (contagem[papel] > 0 && contagem[papel] < piso) alertas.push(`${papel}_abaixo_do_piso`);

        else if (contagem[papel] === piso) alertas.push(`${papel}_no_limite`);
      }
      if (!contagem.par) alertas.push('sem_pares');
      p.avaliadores.sort((x, y) => PAPEIS_ORDEM.indexOf(x.papel) - PAPEIS_ORDEM.indexOf(y.papel)
        || String(x.avaliador?.nome).localeCompare(String(y.avaliador?.nome)));
      return {
        avaliado: f ? { id: f.id, nome: f.nome, cargo: f.cargo || null, area: f.area || null } : { id, nome: '(inativo)', inativo: true },
        contagem, alertas, avaliadores: p.avaliadores, removidos: p.removidos,
      };
    }).sort((x, y) => String(x.avaliado.nome).localeCompare(String(y.avaliado.nome)));
    const fora = ativos.filter((f) => !pessoas.has(f.id))
      .map((f) => ({ id: f.id, nome: f.nome, cargo: f.cargo || null, area: f.area || null }))
      .sort((x, y) => String(x.nome).localeCompare(String(y.nome)));
    const colaboradores = ativos
      .map((f) => ({ id: f.id, nome: f.nome, cargo: f.cargo || null, area: f.area || null, gestor_id: f.gestor_id || null }))
      .sort((x, y) => String(x.nome).localeCompare(String(y.nome)));
    res.json({ status: ciclo.status, piso, pessoas: linhas, fora_do_ciclo: fora, colaboradores });
  } catch (e) {
    console.error('[aval360] avaliadores:', e.message);
    res.status(500).json({ error: 'Não foi possível carregar a lista de avaliadores.' });
  }
});


router.post('/ciclos/:id/avaliadores', authorizeModule('rh', 3), async (req, res) => {
  try {
    const b = req.body || {};
    if (!UUID.test(req.params.id) || !UUID.test(String(b.avaliado_id)) || !UUID.test(String(b.avaliador_id))) {
      return res.status(400).json({ error: 'Pessoa ou ciclo inválido.' });
    }
    if (!PAPEIS_ORDEM.includes(b.papel)) return res.status(400).json({ error: 'Papel inválido.' });
    if (typeof b.incluir !== 'boolean') return res.status(400).json({ error: 'Informe incluir: true/false.' });
    const { data, error } = await supabase.rpc('fn_aval360_editar_avaliador', {
      p_ciclo_id: req.params.id, p_avaliado_id: b.avaliado_id, p_avaliador_id: b.avaliador_id,
      p_papel: b.papel, p_incluir: b.incluir,
    });
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[aval360] editar avaliador:', e.message);
    falhaDeDominio(res, e, 'Não foi possível salvar a alteração.');
  }
});



const PAPEIS_AVALIADOR = ['gestor', 'par', 'liderado'];







router.get('/ciclos/:id/pessoa/:avaliadoId', authorizeModule('rh', 3), async (req, res) => {
  try {
    const { id, avaliadoId } = req.params;
    if (!UUID.test(id) || !UUID.test(String(avaliadoId))) return res.status(400).json({ error: 'Parâmetro inválido.' });
    const [{ data: hier, error: errH }, ativos, convites] = await Promise.all([
      supabase.rpc('fn_aval360_hierarquia'),
      listarAtivos(),
      lerTodos(() => supabase.from('rh_aval360_convite')
        .select('id, avaliador_id, papel, origem, suprimido_em, suprimido_motivo')
        .eq('ciclo_id', id).eq('avaliado_id', avaliadoId).is('deleted_at', null).order('id')),
    ]);
    if (errH) throw errH;
    const porId = new Map(ativos.map((f) => [f.id, { id: f.id, nome: f.nome, cargo: f.cargo || null, area: f.area || null }]));
    const pessoa = porId.get(avaliadoId);
    if (!pessoa) return res.status(404).json({ error: 'Esta pessoa não está ativa no RH.' });
    const sugestao = (hier || [])
      .filter((h) => h.avaliado_id === avaliadoId && h.papel !== 'auto' && porId.has(h.avaliador_id))
      .map((h) => ({ avaliador: porId.get(h.avaliador_id), papel: h.papel }));
    const ativosNoCiclo = convites.filter((c) => !c.suprimido_em);
    const atuais = ativosNoCiclo.filter((c) => c.papel !== 'auto' && porId.has(c.avaliador_id))
      .map((c) => ({ avaliador: porId.get(c.avaliador_id), papel: c.papel, origem: c.origem }));
    res.json({ pessoa, no_ciclo: ativosNoCiclo.length > 0, sugestao, atuais });
  } catch (e) {
    console.error('[aval360] pessoa:', e.message);
    res.status(500).json({ error: 'Não foi possível carregar quem avalia esta pessoa.' });
  }
});








router.put('/ciclos/:id/avaliados/:avaliadoId', authorizeModule('rh', 3), async (req, res) => {
  try {
    const { id, avaliadoId } = req.params;
    if (!UUID.test(id) || !UUID.test(String(avaliadoId))) return res.status(400).json({ error: 'Parâmetro inválido.' });
    const lista = req.body?.avaliadores;
    if (!Array.isArray(lista) || lista.length > 80
      || !lista.every((i) => i && UUID.test(String(i.avaliador_id)) && PAPEIS_AVALIADOR.includes(i.papel))) {
      return res.status(400).json({ error: 'Lista de avaliadores inválida.' });
    }
    const itens = lista.map((i) => ({ avaliador_id: i.avaliador_id, papel: i.papel }));
    const { error } = await supabase.rpc('fn_aval360_definir_avaliadores', { p_ciclo_id: id, p_avaliado_id: avaliadoId, p_itens: itens });
    if (error) throw error;
    let incluidos = 0;
    if (req.body?.incluir_avaliadores === true && itens.length) {
      const { data, error: errI } = await supabase.rpc('fn_aval360_incluir_padrao', {
        p_ciclo_id: id, p_avaliados: itens.map((i) => i.avaliador_id),
      });
      if (errI) throw errI;
      incluidos = data?.incluidos || 0;
    }
    res.json({ ok: true, avaliadores: itens.length, incluidos });
  } catch (e) {
    console.error('[aval360] definir avaliadores:', e.message);
    falhaDeDominio(res, e, 'Não foi possível salvar quem avalia esta pessoa.');
  }
});


router.post('/ciclos/:id/avaliados/:avaliadoId/remover', authorizeModule('rh', 3), async (req, res) => {
  try {
    const { id, avaliadoId } = req.params;
    if (!UUID.test(id) || !UUID.test(String(avaliadoId))) return res.status(400).json({ error: 'Parâmetro inválido.' });
    const { data, error } = await supabase.rpc('fn_aval360_remover_avaliado', { p_ciclo_id: id, p_avaliado_id: avaliadoId });
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[aval360] remover avaliado:', e.message);
    falhaDeDominio(res, e, 'Não foi possível tirar a pessoa da avaliação.');
  }
});








router.get('/ciclos/:id/adesao', authorizeModule('rh', 3), async (req, res) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Ciclo inválido.' });
    const convites = await lerTodos(() => supabase
      .from('rh_aval360_convite')
      .select('id, papel, suprimido_em, suprimido_motivo, respondido_em, avaliador:avaliador_id(id, nome, area), avaliado:avaliado_id(id, nome, cargo)')
      .eq('ciclo_id', req.params.id)
      .is('deleted_at', null)
      .order('id'));
    const porPapel = {};
    const porAvaliador = new Map();
    const suprimidos = {};
    for (const c of convites) {
      if (c.suprimido_em) {
        const m = c.suprimido_motivo || 'outro';
        suprimidos[m] = (suprimidos[m] || 0) + 1;
        continue;
      }
      const p = (porPapel[c.papel] ||= { total: 0, respondidos: 0 });
      p.total += 1;
      if (c.respondido_em) p.respondidos += 1;
      const id = c.avaliador?.id;
      if (!id) continue;
      const a = porAvaliador.get(id) || { ...c.avaliador, total: 0, respondidos: 0 };
      a.total += 1;
      if (c.respondido_em) a.respondidos += 1;
      porAvaliador.set(id, a);
    }
    const pessoas = [...porAvaliador.values()]
      .map((a) => ({ ...a, pendentes: a.total - a.respondidos }))
      .sort((x, y) => y.pendentes - x.pendentes || String(x.nome).localeCompare(String(y.nome)));

    const porAvaliado = new Map();
    for (const c of convites) {
      if (c.suprimido_em || !c.avaliado?.id) continue;
      const a = porAvaliado.get(c.avaliado.id) || { avaliado: c.avaliado, auto: null, gestor: { total: 0, respondidos: 0 }, par: { total: 0, respondidos: 0 }, liderado: { total: 0, respondidos: 0 } };
      if (c.papel === 'auto') a.auto = !!c.respondido_em;
      else { a[c.papel].total += 1; if (c.respondido_em) a[c.papel].respondidos += 1; }
      porAvaliado.set(c.avaliado.id, a);
    }
    const avaliados = [...porAvaliado.values()].sort((x, y) => String(x.avaliado.nome).localeCompare(String(y.avaliado.nome)));

    const devendo = { auto: 0, gestor: new Set(), outros: new Set() };
    for (const c of convites) {
      if (c.suprimido_em || c.respondido_em || !c.avaliador?.id) continue;
      if (c.papel === 'auto') devendo.auto += 1;
      else if (c.papel === 'gestor') devendo.gestor.add(c.avaliador.id);
      else devendo.outros.add(c.avaliador.id);
    }
    res.json({ por_papel: porPapel, suprimidos, pessoas, avaliados,
      devendo: { auto: devendo.auto, gestor: devendo.gestor.size, outros: devendo.outros.size } });
  } catch (e) {
    console.error('[aval360] adesao:', e.message);
    res.status(500).json({ error: 'Não foi possível carregar a adesão.' });
  }
});








const FASES_COM_RESULTADO = ['apuracao', 'publicado', 'encerrado'];
const FASES_PUBLICADAS = ['publicado', 'encerrado'];



function paraOAvaliado(r) {
  const cfg = configDe(r.ciclo?.config);
  const { devolutiva_obs: _obs, ...entrega } = r.entrega || {};
  let criterios = (r.criterios || [])
    .filter((c) => c.visivel !== false)
    .map(({ justificativa: _j, ...c }) => (cfg.participante_ve_comentarios ? c : { ...c, comentarios: [] }));
  let out = { ...r, entrega, criterios };
  if (cfg.participante_so_nota_final) {
    criterios = criterios.map(({ auto: _a, gestor: _g, par: _p, liderado: _l, outros: _o, perguntas: _q, comentarios: _c, ...c }) => c);
    out = { ...out, criterios, papeis: {} };
  }
  if (!cfg.participante_ve_quadrante) out = { ...out, quadrante: null, nivel_resultado: null, nivel_comportamento: null };
  return out;
}


function paraOGestor(r) {
  const cfg = configDe(r.ciclo?.config);
  let out = r;
  if (!cfg.gestor_ve_comentarios) out = { ...out, criterios: (out.criterios || []).map((c) => ({ ...c, comentarios: [] })) };
  if (!cfg.gestor_ve_quadrante) out = { ...out, quadrante: null, nivel_resultado: null, nivel_comportamento: null };
  return out;
}


router.get('/ciclos/:id/resultados', authorizeModule('rh', 3), async (req, res) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Ciclo inválido.' });
    const { data, error } = await supabase.rpc('fn_aval360_resultados_ciclo', { p_ciclo_id: req.params.id });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[aval360] resultados:', e.message);
    falhaDeDominio(res, e, 'Não foi possível carregar os resultados.');
  }
});




async function avisosPcsDoCiclo(cicloId) {
  const { data: ciclo, error: errC } = await supabase.from('rh_aval360_ciclo')
    .select('id, nome, status, escala_max').eq('id', cicloId).is('deleted_at', null).maybeSingle();
  if (errC) throw new Error(errC.message);
  if (!ciclo) return { erro: [404, 'Ciclo não encontrado.'] };
  if (!['publicado', 'encerrado'].includes(ciclo.status)) {
    return { erro: [409, 'Os avisos de enquadramento aparecem quando o ciclo é publicado.'] };
  }
  const [{ data: lista, error: errR }, cat] = await Promise.all([
    supabase.rpc('fn_aval360_resultados_ciclo', { p_ciclo_id: cicloId }),
    catalogoDeCriterios('id, nome', { soAtivos: false }),
  ]);
  if (errR) throw errR;
  if (cat.error) throw new Error(cat.error.message);
  const pesos = Object.fromEntries((cat.data || []).map((c) => [c.id, Number(c.peso_pcs)]));
  const pessoas = (lista || []).map((r) => {
    const a = avisoPcs(r, { escalaMax: ciclo.escala_max, pesos });
    return {
      avaliado: r.avaliado, final: r.final, gestor: r.gestor, outros: r.outros, calibrado: r.calibrado,
      ...a, texto: textoAviso(a),
    };
  });
  return {
    ciclo: { id: ciclo.id, nome: ciclo.nome, status: ciclo.status, escala_max: ciclo.escala_max },
    limites: LIMITES_PADRAO, peso_pcs_pendente: !!cat.pesoPcsPendente, pessoas,
  };
}


router.get('/ciclos/:id/aviso-pcs', authorizeModule('rh', 3), async (req, res) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Ciclo inválido.' });
    const r = await avisosPcsDoCiclo(req.params.id);
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
    res.json(r);
  } catch (e) {
    console.error('[aval360] aviso pcs:', e.message);
    falhaDeDominio(res, e, 'Não foi possível calcular os avisos de enquadramento.');
  }
});


router.get('/aviso-pcs/ultimo', authorizeModule('rh', 3), async (req, res) => {
  try {
    const { data: c, error } = await supabase.from('rh_aval360_ciclo').select('id')
      .in('status', ['publicado', 'encerrado']).is('deleted_at', null)
      .order('periodo_fim', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })
      .limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    if (!c) return res.json({ ciclo: null, pessoas: [] });
    const r = await avisosPcsDoCiclo(c.id);
    if (r.erro) return res.status(r.erro[0]).json({ error: r.erro[1] });
    res.json(r);
  } catch (e) {
    console.error('[aval360] aviso pcs ultimo:', e.message);
    falhaDeDominio(res, e, 'Não foi possível calcular os avisos de enquadramento.');
  }
});


router.get('/ciclos/:id/resultados/:avaliadoId', authorizeModule('rh', 3), async (req, res) => {
  try {
    if (!UUID.test(req.params.id) || !UUID.test(String(req.params.avaliadoId))) return res.status(400).json({ error: 'Parâmetro inválido.' });
    const { data, error } = await supabase.rpc('fn_aval360_resultado', { p_ciclo_id: req.params.id, p_avaliado_id: req.params.avaliadoId });
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[aval360] resultado rh:', e.message);
    falhaDeDominio(res, e, 'Não foi possível carregar o resultado.');
  }
});

function corpoDaEntrega(b = {}) {
  if (b.liberar !== undefined && typeof b.liberar !== 'boolean') return { erro: 'liberar deve ser verdadeiro/falso.' };
  if (b.devolutiva_dia != null && !(typeof b.devolutiva_dia === 'string' && DATA.test(b.devolutiva_dia))) return { erro: 'Data da devolutiva inválida.' };
  if (b.devolutiva_obs != null && (typeof b.devolutiva_obs !== 'string' || b.devolutiva_obs.length > 5000)) return { erro: 'Observação inválida.' };
  return { liberar: b.liberar === true, dia: b.devolutiva_dia || null, obs: b.devolutiva_obs ?? null };
}

async function entregar(req, res, ehRh) {
  try {
    const cicloId = ehRh ? req.params.id : req.params.cicloId;
    if (!UUID.test(String(cicloId)) || !UUID.test(String(req.params.avaliadoId))) return res.status(400).json({ error: 'Parâmetro inválido.' });
    const c = corpoDaEntrega(req.body);
    if (c.erro) return res.status(400).json({ error: c.erro });
    const eu = await comFuncionario(req, res);
    if (!eu) return;
    const { data: cic, error: errC } = await supabase.from('rh_aval360_ciclo').select('config').eq('id', cicloId).maybeSingle();
    if (errC) throw new Error(errC.message);
    const cfg = configDe(cic?.config);
    if (!ehRh && c.liberar && !cfg.gestor_libera) return res.status(403).json({ error: 'Neste ciclo quem libera o resultado é o RH.' });
    if (c.dia && !cfg.devolutiva) return res.status(409).json({ error: 'Este ciclo não registra devolutiva.' });
    const { data, error } = await supabase.rpc('fn_aval360_entregar', {
      p_ciclo_id: cicloId, p_avaliado_id: req.params.avaliadoId, p_por: eu.id, p_eh_rh: ehRh,
      p_liberar: c.liberar, p_devolutiva_dia: c.dia, p_devolutiva_obs: c.obs,
    });
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[aval360] entrega:', e.message);
    falhaDeDominio(res, e, 'Não foi possível registrar a entrega.');
  }
}







router.post('/ciclos/:id/resultados/:avaliadoId/calibragem', authorizeModule('rh', 3), async (req, res) => {
  try {
    const b = req.body || {};
    if (!UUID.test(req.params.id) || !UUID.test(String(req.params.avaliadoId)) || !UUID.test(String(b.competencia_id))) {
      return res.status(400).json({ error: 'Parâmetro inválido.' });
    }
    if (b.nota !== null && (typeof b.nota !== 'number' || !Number.isFinite(b.nota))) return res.status(400).json({ error: 'Nota inválida.' });
    if (b.nota !== null && typeof b.justificativa !== 'string') return res.status(400).json({ error: 'Escreva a justificativa.' });
    const eu = await comFuncionario(req, res);
    if (!eu) return;
    const { data, error } = await supabase.rpc('fn_aval360_calibrar', {
      p_ciclo_id: req.params.id, p_avaliado_id: req.params.avaliadoId, p_competencia_id: b.competencia_id,
      p_nota: b.nota, p_justificativa: b.nota === null ? null : b.justificativa, p_por: eu.id,
    });
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[aval360] calibragem:', e.message);
    falhaDeDominio(res, e, 'Não foi possível salvar a calibragem.');
  }
});









router.get('/ciclos/:id/entregas', authorizeModule('rh', 3), async (req, res) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Ciclo inválido.' });
    const [convites, entregas] = await Promise.all([
      lerTodos(() => supabase.from('rh_aval360_convite')
        .select('id, papel, avaliado:avaliado_id(id, nome, cargo), avaliador:avaliador_id(id, nome, cargo)')
        .eq('ciclo_id', req.params.id).in('papel', ['auto', 'gestor']).is('deleted_at', null).is('suprimido_em', null).order('id')),
      lerTodos(() => supabase.from('rh_aval360_entrega').select('id, avaliado_id, liberado_em, devolutiva_dia')
        .eq('ciclo_id', req.params.id).is('deleted_at', null).order('id')),
    ]);
    const ent = new Map(entregas.map((e) => [e.avaliado_id, e]));
    const avaliados = new Map(convites.filter((c) => c.papel === 'auto' && c.avaliado).map((c) => [c.avaliado.id, c.avaliado]));
    const gestorDe = new Map(convites.filter((c) => c.papel === 'gestor' && c.avaliado && c.avaliador).map((c) => [c.avaliado.id, c.avaliador]));
    const porGestor = new Map();
    const semGestor = [];
    for (const [id, a] of avaliados) {
      const e = ent.get(id);
      const linha = { ...a, liberado_em: e?.liberado_em || null, devolutiva_dia: e?.devolutiva_dia || null };
      const g = gestorDe.get(id);
      if (!g) { semGestor.push(linha); continue; }
      const grupo = porGestor.get(g.id) || { gestor: g, liderados: [] };
      grupo.liderados.push(linha);
      porGestor.set(g.id, grupo);
    }
    const ordena = (l) => l.sort((x, y) => String(x.nome).localeCompare(String(y.nome)));
    const gestores = [...porGestor.values()].map((g) => ({
      ...g, liderados: ordena(g.liderados),
      liberados: g.liderados.filter((l) => l.liberado_em).length,
      devolutivas: g.liderados.filter((l) => l.devolutiva_dia).length,
    })).sort((x, y) => String(x.gestor.nome).localeCompare(String(y.gestor.nome)));
    res.json({ gestores, sem_gestor: ordena(semGestor) });
  } catch (e) {
    console.error('[aval360] entregas:', e.message);
    res.status(500).json({ error: 'Não foi possível carregar as entregas.' });
  }
});


router.post('/ciclos/:id/resultados/:avaliadoId/entrega', authorizeModule('rh', 3), (req, res) => entregar(req, res, true));






router.get('/resultados', async (req, res) => {
  try {
    const eu = await comFuncionario(req, res);
    if (!eu) return;




    const { data: minhas, error: errS } = await supabase
      .from('rh_aval360_convite')
      .select('ciclo:ciclo_id(id, nome, status, coleta_ate, deleted_at)')
      .eq('avaliado_id', eu.id).eq('papel', 'auto').is('deleted_at', null).is('suprimido_em', null);
    if (errS) throw new Error(errS.message);
    const cicMeus = (minhas || []).map((m) => m.ciclo).filter((c) => c && !c.deleted_at && c.status !== 'rascunho');
    let libs = [];
    if (cicMeus.length) {
      const { data: l, error: errL2 } = await supabase.from('rh_aval360_entrega').select('ciclo_id, liberado_em')
        .eq('avaliado_id', eu.id).in('ciclo_id', cicMeus.map((c) => c.id)).is('deleted_at', null);
      if (errL2) throw new Error(errL2.message);
      libs = l || [];
    }
    const situacao = cicMeus.map((c) => {
      const lib = libs.some((x) => x.ciclo_id === c.id && x.liberado_em);
      const etapa = lib ? 'liberado' : c.status === 'coleta' ? 'respostas' : c.status === 'apuracao' ? 'apuracao' : 'aguardando_gestor';
      return { ciclo: { id: c.id, nome: c.nome, coleta_ate: c.coleta_ate }, etapa };
    });
    const { data: ciclos, error: errC } = await supabase
      .from('rh_aval360_ciclo').select('id, nome, status, periodo_fim')
      .in('status', FASES_PUBLICADAS).is('deleted_at', null).order('periodo_fim', { ascending: false });
    if (errC) throw new Error(errC.message);
    const ids = (ciclos || []).map((c) => c.id);
    if (!ids.length) return res.json({ equipe: [], meus: [], situacao });

    const { data: lider, error: errL } = await supabase
      .from('rh_aval360_convite').select('ciclo_id, avaliado_id')
      .eq('avaliador_id', eu.id).eq('papel', 'gestor').in('ciclo_id', ids)
      .is('deleted_at', null).is('suprimido_em', null);
    if (errL) throw new Error(errL.message);
    const { data: entregas, error: errE } = await supabase
      .from('rh_aval360_entrega').select('ciclo_id, liberado_em')
      .eq('avaliado_id', eu.id).in('ciclo_id', ids).is('deleted_at', null);
    if (errE) throw new Error(errE.message);

    const equipe = [];
    for (const ciclo of ciclos) {
      const alvos = (lider || []).filter((l) => l.ciclo_id === ciclo.id);
      if (!alvos.length) continue;
      const pessoas = [];
      for (const alvo of alvos) {
        const { data, error } = await supabase.rpc('fn_aval360_resultado', { p_ciclo_id: ciclo.id, p_avaliado_id: alvo.avaliado_id });
        if (error) throw error;
        const v = paraOGestor(data);
        pessoas.push({ avaliado: v.avaliado, final: v.final, quadrante: v.quadrante, entrega: v.entrega,

          criterios: (v.criterios || []).map((c) => ({ competencia_id: c.competencia_id, nome: c.nome, final: c.final })),
          escala_max: v.ciclo?.escala_max,
          pode_liberar: configDe(data.ciclo?.config).gestor_libera, tem_devolutiva: configDe(data.ciclo?.config).devolutiva });
      }
      pessoas.sort((x, y) => String(x.avaliado?.nome).localeCompare(String(y.avaliado?.nome)));
      equipe.push({ ciclo, pessoas });
    }
    const meus = (ciclos || []).filter((c) => (entregas || []).some((e) => e.ciclo_id === c.id && e.liberado_em));
    res.json({ equipe, meus, situacao });
  } catch (e) {
    console.error('[aval360] meus resultados:', e.message);
    falhaDeDominio(res, e, 'Não foi possível carregar os resultados.');
  }
});








router.get('/resultados/:cicloId/:avaliadoId', async (req, res) => {
  try {
    const { cicloId, avaliadoId } = req.params;
    if (!UUID.test(String(cicloId)) || !UUID.test(String(avaliadoId))) return res.status(400).json({ error: 'Parâmetro inválido.' });
    const eu = await comFuncionario(req, res);
    if (!eu) return;
    const negar = () => res.status(403).json({ error: 'Resultado indisponível para você.' });
    const { data: ciclo, error: errC } = await supabase
      .from('rh_aval360_ciclo').select('id, status').eq('id', cicloId).is('deleted_at', null).maybeSingle();
    if (errC) throw new Error(errC.message);
    if (!ciclo || !FASES_PUBLICADAS.includes(ciclo.status)) return negar();

    let comoAvaliado = false;
    if (avaliadoId === eu.id) {
      const { data: e, error } = await supabase
        .from('rh_aval360_entrega').select('liberado_em')
        .eq('ciclo_id', cicloId).eq('avaliado_id', eu.id).is('deleted_at', null).maybeSingle();
      if (error) throw new Error(error.message);
      if (!e?.liberado_em) return negar();
      comoAvaliado = true;
    } else {
      const { data: ok, error } = await supabase.rpc('fn_aval360_eh_gestor', {
        p_ciclo_id: cicloId, p_avaliado_id: avaliadoId, p_gestor_id: eu.id,
      });
      if (error) throw error;
      if (ok !== true) return negar();
    }
    const { data, error } = await supabase.rpc('fn_aval360_resultado', { p_ciclo_id: cicloId, p_avaliado_id: avaliadoId });
    if (error) throw error;
    res.json(comoAvaliado ? paraOAvaliado(data) : paraOGestor(data));
  } catch (e) {
    console.error('[aval360] resultado:', e.message);
    falhaDeDominio(res, e, 'Não foi possível carregar o resultado.');
  }
});

async function salvarPlano(req, res, ehRh) {
  try {
    const cicloId = ehRh ? req.params.id : req.params.cicloId;
    if (!UUID.test(String(cicloId)) || !UUID.test(String(req.params.avaliadoId))) return res.status(400).json({ error: 'Parâmetro inválido.' });
    const plano = req.body?.plano;
    if (!Array.isArray(plano) || plano.length > 5) return res.status(400).json({ error: 'O plano tem de 0 a 5 ações.' });
    const eu = await comFuncionario(req, res);
    if (!eu) return;
    const { data, error } = await supabase.rpc('fn_aval360_plano', {
      p_ciclo_id: cicloId, p_avaliado_id: req.params.avaliadoId, p_por: eu.id, p_eh_rh: ehRh,
      p_plano: plano.map((a) => ({ texto: a?.texto, prazo: a?.prazo || null })),
    });
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[aval360] plano:', e.message);
    falhaDeDominio(res, e, 'Não foi possível salvar o plano de ação.');
  }
}
router.post('/ciclos/:id/resultados/:avaliadoId/plano', authorizeModule('rh', 3), (req, res) => salvarPlano(req, res, true));
router.post('/resultados/:cicloId/:avaliadoId/plano', (req, res) => salvarPlano(req, res, false));


router.post('/resultados/:cicloId/:avaliadoId/entrega', (req, res) => entregar(req, res, false));



const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const fmtDia = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '');

function emailDoAviso(tipo, { nome, ciclo, pendentes, pessoas }) {
  const link = `${process.env.FRONTEND_URL || 'https://cbrio.org'}/minhas-avaliacoes`;
  const botao = `<p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#0f172a;color:#fff;border-radius:6px;text-decoration:none">Abrir minhas avaliações</a></p>`;
  if (tipo === 'resultados') {
    return {
      subject: `${ciclo.nome} · os resultados da sua equipe estão disponíveis`,
      html: `<p>Olá, ${esc(nome)}!</p><p>Os resultados da <b>${esc(ciclo.nome)}</b> da sua equipe (${pessoas} pessoa${pessoas > 1 ? 's' : ''}) já estão disponíveis.</p>
<p>Leia cada resultado, converse com a pessoa e, na tela, libere o resultado para ela e registre a devolutiva.</p>${botao}`,
    };
  }
  return {
    subject: `${ciclo.nome} · você tem ${pendentes} avaliaç${pendentes > 1 ? 'ões' : 'ão'} para responder`,
    html: `<p>Olá, ${esc(nome)}!</p><p>Você tem <b>${pendentes}</b> avaliaç${pendentes > 1 ? 'ões' : 'ão'} da <b>${esc(ciclo.nome)}</b> para responder${ciclo.coleta_ate ? ` até <b>${fmtDia(ciclo.coleta_ate)}</b>` : ''}.</p>
<p>Seu nome nunca aparece junto das suas notas e comentários.</p>${botao}`,
  };
}











async function enviarAvisos(ciclo, tipo, assunto) {
  const convites = await lerTodos(() => {
    let qb = supabase.from('rh_aval360_convite')
      .select('id, avaliado_id, respondido_em, avaliador:avaliador_id(id, nome, email)')
      .eq('ciclo_id', ciclo.id).is('deleted_at', null).is('suprimido_em', null);
    if (tipo === 'resultados') qb = qb.eq('papel', 'gestor');
    else qb = qb.is('respondido_em', null);
    return qb.order('id');
  });
  const porPessoa = new Map();
  for (const c of convites) {
    if (!c.avaliador?.id) continue;
    const p = porPessoa.get(c.avaliador.id) || { ...c.avaliador, n: 0 };
    p.n += 1;
    porPessoa.set(c.avaliador.id, p);
  }
  let enviados = 0;
  const semEmail = [];
  const falhas = [];
  for (const p of porPessoa.values()) {
    if (!p.email) { semEmail.push(p.nome); continue; }
    const m = emailDoAviso(tipo, { nome: String(p.nome || '').split(' ')[0], ciclo, pendentes: p.n, pessoas: p.n });
    const r = await enviarEmail({ to: p.email, subject: assunto ? assunto(p.n) : m.subject, html: m.html });
    if (r?.ok) enviados += 1; else falhas.push(p.nome);
  }
  return { enviados, sem_email: semEmail, falhas };
}




const ASSUNTO = {
  abertura: (ciclo) => () => `${ciclo.nome} · a avaliação começou`,
  lembrete_3: (ciclo) => (n) => `${ciclo.nome} · faltam 3 dias · ${n} avaliaç${n > 1 ? 'ões' : 'ão'} para responder`,
  lembrete_1: (ciclo) => (n) => `${ciclo.nome} · último dia amanhã · ${n} avaliaç${n > 1 ? 'ões' : 'ão'} para responder`,
};
async function avisoAutomatico(ciclo, tipo) {
  const { data: ja, error: errJ } = await supabase.from('rh_aval360_aviso').select('id').eq('ciclo_id', ciclo.id).eq('tipo', tipo).maybeSingle();
  if (errJ) throw new Error(errJ.message);
  if (ja) return { tipo, ja_enviado: true };

  const { error: errI } = await supabase.from('rh_aval360_aviso').insert({ ciclo_id: ciclo.id, tipo });
  if (errI) return { tipo, ja_enviado: true };
  const r = await enviarAvisos(ciclo, 'pendentes', ASSUNTO[tipo](ciclo));
  await supabase.from('rh_aval360_aviso').update({ enviados: r.enviados }).eq('ciclo_id', ciclo.id).eq('tipo', tipo);
  return { tipo, ...r };
}
function avisoDoDia(ciclo, hoje) {
  if (ciclo.status !== 'coleta' || !ciclo.coleta_ate) return [];
  const tipos = [];
  if (!ciclo.periodo_inicio || ciclo.periodo_inicio <= hoje) tipos.push('abertura');
  const dias = Math.round((new Date(`${ciclo.coleta_ate}T12:00:00Z`) - new Date(`${hoje}T12:00:00Z`)) / 86400000);
  if (dias === 3) tipos.push('lembrete_3');
  if (dias === 1) tipos.push('lembrete_1');
  return tipos;
}

router.post('/ciclos/:id/avisar', authorizeModule('rh', 3), async (req, res) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Ciclo inválido.' });
    const tipo = req.body?.tipo;
    if (!['pendentes', 'resultados'].includes(tipo)) return res.status(400).json({ error: 'Tipo de aviso inválido.' });
    const { data: ciclo, error: errC } = await supabase
      .from('rh_aval360_ciclo').select('id, nome, status, coleta_ate').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (errC) throw new Error(errC.message);
    if (!ciclo) return res.status(404).json({ error: 'Ciclo não encontrado.' });
    if (tipo === 'pendentes' && ciclo.status !== 'coleta') return res.status(409).json({ error: 'Só há o que responder com o ciclo em respostas.' });
    if (tipo === 'resultados' && !FASES_PUBLICADAS.includes(ciclo.status)) return res.status(409).json({ error: 'Publique os resultados antes de avisar os gestores.' });

    res.json(await enviarAvisos(ciclo, tipo));
  } catch (e) {
    console.error('[aval360] avisar:', e.message);
    res.status(500).json({ error: 'Não foi possível enviar os avisos.' });
  }
});

module.exports = router;
module.exports.lembretesDoDia = lembretesDoDia;
