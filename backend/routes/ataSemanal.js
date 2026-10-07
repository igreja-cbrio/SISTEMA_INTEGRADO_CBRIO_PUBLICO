












const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');









const { isAuthorizedCron } = require('../utils/cronAuth');
const { gerarAtasPendentes } = require('../services/ataGenerator');

async function gerarPendentes(req, res) {
  if (!isAuthorizedCron(req)) return res.status(401).json({ error: 'unauthorized' });
  try {
    const limite = Math.min(5, Math.max(1, Number(req.query.limite) || 2));
    res.json(await gerarAtasPendentes({ limite }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
router.get('/cron/gerar', gerarPendentes);
router.post('/cron/gerar', gerarPendentes);

router.use(authenticate);






function apenasColaborador(req, res, next) {
  if (req.user?.is_membro_only) {
    return res.status(403).json({ error: 'Acesso restrito a colaboradores' });
  }
  next();
}
router.use(apenasColaborador);

const STATUS_VALIDOS = ['pendente', 'em_andamento', 'concluida', 'cancelada', 'nao_executada'];



let _tipoId = null;
async function tipoMinisterialId() {
  if (_tipoId) return _tipoId;
  const { data } = await supabase
    .from('governance_meeting_types')
    .select('id')
    .eq('sigla', 'MIN')
    .maybeSingle();
  _tipoId = data?.id || null;
  return _tipoId;
}






router.get('/colaboradores', async (_req, res) => {
  try {








    const { data, error } = await supabase
      .from('vw_colaboradores')
      .select('id, name, email, avatar_url, area')
      .order('name');
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


router.get('/reunioes', async (_req, res) => {
  try {
    const tipo = await tipoMinisterialId();
    if (!tipo) return res.json([]);
    const { data, error } = await supabase
      .from('governance_meetings')
      .select('id, date, status, ata, observacoes, participantes')
      .eq('type_id', tipo)
      .is('deleted_at', null)
      .order('date', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/reunioes/:id', async (req, res) => {
  try {
    const tipo = await tipoMinisterialId();
    const { data: reuniao, error } = await supabase
      .from('governance_meetings')
      .select('id, date, status, local, pauta, ata, deliberacoes, temas, participantes, observacoes')
      .eq('id', req.params.id)
      .eq('type_id', tipo)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    if (!reuniao) return res.status(404).json({ error: 'Reunião não encontrada' });

    const { data: tasks } = await supabase
      .from('governance_tasks')
      .select('*')
      .eq('meeting_id', reuniao.id)
      .order('sort_order', { ascending: true })
      .order('created_at');

    res.json({ ...reuniao, tasks: tasks || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


router.patch('/tarefas/:id', async (req, res) => {
  try {





    const tipo = await tipoMinisterialId();
    const { data: tarefa } = await supabase
      .from('governance_tasks')
      .select('id, meeting_id, governance_meetings!inner(type_id, deleted_at)')
      .eq('id', req.params.id)
      .maybeSingle();

    if (!tarefa || tarefa.governance_meetings?.type_id !== tipo
        || tarefa.governance_meetings?.deleted_at) {
      return res.status(404).json({ error: 'Pendência não encontrada' });
    }



    const b = req.body || {};
    const campos = {};




    if ('responsaveis' in b) {
      const lista = Array.isArray(b.responsaveis)
        ? [...new Set(b.responsaveis.map((x) => String(x ?? '').trim()).filter(Boolean))]
        : [];
      campos.responsaveis = lista.length ? lista : null;

      campos.responsavel = lista.length ? lista.join(', ') : null;
    } else if ('responsavel' in b) {
      const v = String(b.responsavel ?? '').trim();
      campos.responsavel = v || null;
      campos.responsaveis = v ? [v] : null;
    }
    if ('prazo' in b) {
      const v = String(b.prazo ?? '').trim();
      if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        return res.status(400).json({ error: 'prazo deve ser AAAA-MM-DD' });
      }
      campos.prazo = v || null;
    }
    if ('status' in b) {
      if (!STATUS_VALIDOS.includes(b.status)) {
        return res.status(400).json({ error: `status inválido. Use: ${STATUS_VALIDOS.join(', ')}` });
      }
      campos.status = b.status;
    }
    if (!Object.keys(campos).length) {
      return res.status(400).json({ error: 'nada para atualizar' });
    }

    const { data, error } = await supabase
      .from('governance_tasks')
      .update(campos)
      .eq('id', req.params.id)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});








router.post('/tarefas/:id/enviar', async (req, res) => {
  try {
    const tipo = await tipoMinisterialId();
    const { data: pend } = await supabase
      .from('governance_tasks')
      .select('id, titulo, responsavel, responsaveis, prazo, tarefa_pessoal_id, tarefas_pessoais_ids, meeting_id, governance_meetings!inner(date, type_id, deleted_at)')
      .eq('id', req.params.id)
      .maybeSingle();

    if (!pend || pend.governance_meetings?.type_id !== tipo
        || pend.governance_meetings?.deleted_at) {
      return res.status(404).json({ error: 'Pendência não encontrada' });
    }



    const jaEnviadas = pend.tarefas_pessoais_ids?.length
      ? pend.tarefas_pessoais_ids
      : (pend.tarefa_pessoal_id ? [pend.tarefa_pessoal_id] : []);
    if (jaEnviadas.length) {
      return res.json({ criada: false, tarefas_ids: jaEnviadas, motivo: 'ja_enviada' });
    }


    const nomes = pend.responsaveis?.length
      ? pend.responsaveis
      : (String(pend.responsavel || '').trim() ? [String(pend.responsavel).trim()] : []);




    const destinos = [];
    for (const nome of nomes) {
      const { data: perfil } = await supabase
        .from('profiles').select('id, name')
        .eq('active', true).not('is_membro_only', 'is', true)
        .ilike('name', nome).maybeSingle();
      if (perfil) destinos.push({ id: perfil.id, nome: perfil.name, daAta: nome });
    }




    const semCorrespondencia = !destinos.length;
    if (semCorrespondencia) {
      destinos.push({ id: req.user.userId, nome: req.user.name || null, daAta: nomes.join(', ') || null });
    }

    const dataReuniao = pend.governance_meetings?.date || null;
    const dataBr = dataReuniao
      ? String(dataReuniao).slice(0, 10).split('-').reverse().join('/')
      : null;

    const linhas = destinos.map((d) => ({
      titulo: String(pend.titulo || '').slice(0, 200),
      descricao: [
        dataBr ? `Pendência da reunião ministerial de ${dataBr}.` : 'Pendência da reunião ministerial.',
        d.daAta && d.nome !== d.daAta ? `Na ata, o responsável está como "${d.daAta}".` : null,
        nomes.length > 1 ? `Compartilhada com: ${nomes.join(', ')}.` : null,
        d.id !== req.user.userId && req.user.name ? `Enviada por ${req.user.name}.` : null,
      ].filter(Boolean).join(' '),
      data: pend.prazo || null,
      responsavel_id: d.id,
      responsavel_nome: d.nome,








      created_by: d.id,
      tipo: 'pessoal',
      status: 'a_fazer',
      prioridade: 'media',
      recorrencia: 'unica',
    }));

    const { data: criadas, error: errTarefa } = await supabase
      .from('tarefas_pessoais').insert(linhas).select('id');
    if (errTarefa) throw errTarefa;

    const ids = (criadas || []).map((t) => t.id);
    const { error: errVinculo } = await supabase
      .from('governance_tasks')
      .update({
        tarefas_pessoais_ids: ids,


        tarefa_pessoal_id: ids[0] || null,
      })
      .eq('id', pend.id);



    res.json({
      criada: true,
      tarefas_ids: ids,
      vinculo: !errVinculo,
      responsaveis: destinos.map((d) => d.nome).filter(Boolean),
      sem_correspondencia: semCorrespondencia,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


router.post('/gerar', async (req, res) => {
  try {
    const limite = Math.min(5, Math.max(1, Number(req.body?.limite) || 1));
    res.json(await gerarAtasPendentes({ limite }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
