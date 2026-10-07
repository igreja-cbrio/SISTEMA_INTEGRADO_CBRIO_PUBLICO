






const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');
const { verifyDirecionarToken, direcionarMatricula } = require('../services/nextDirecionar');
const { horariosDisponiveis } = require('../utils/batismoHorario');
const {
  horariosConfigurados: batismoHorariosConfigurados,
  ocupacaoPorHorario: batismoOcupacaoPorHorario,
  dataProximoBatismo,
} = require('../services/batismoHorarios');
const { acharOuCriarGuardado } = require('../services/membroMatch');
const { registrarObservacaoSegura } = require('../services/identidadeProgressiva');



function brtHojeRangeUtc() {
  const brt = new Date(Date.now() - 3 * 3600 * 1000);
  const start = new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate(), 3, 0, 0));
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}






const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.PUBLIC_FORM_RATE_LIMIT_MAX) || (process.env.NODE_ENV === 'production' ? 600 : 5000),
  message: { error: 'Muitas requisições. Aguarde alguns minutos.' },
  skip: () => process.env.NODE_ENV !== 'production',
  standardHeaders: true,
  legacyHeaders: false,
});
router.use(limiter);















async function turmaEscolhida(turmaId) {
  if (!turmaId || !/^[0-9a-f-]{36}$/i.test(String(turmaId))) return null;





  const oferecidas = await turmasOferecidas();
  return oferecidas.find((t) => String(turmaId) === t.id) || null;
}
















async function turmasOferecidas() {
  const { data, error } = await supabase.from('next_turmas')
    .select('id, nome, next_encontros(data)')
    .eq('status', 'aberta').is('deleted_at', null)
    .limit(200);
  if (error) throw error;
  const lista = (data || []).map((t) => {

    const datas = (t.next_encontros || []).map(e => e.data).filter(Boolean).sort();
    return { id: t.id, nome: t.nome, data: datas[0] || null };
  });

  return proximasTurmas(lista, hojeBRT(), TURMAS_OFERECIDAS);
}










async function proximaTurmaAberta() {
  return (await turmasOferecidas())[0] || null;
}
















async function turmaAbertaAtual() {
  return proximaTurmaAberta();
}


const { HORARIO_NEXT, hojeBRT, proximaTurma, proximasTurmas, TURMAS_OFERECIDAS } = require('../utils/nextTurmas');


const {
  temAbreviacaoNome, splitNomeCompleto, validarNascimento,
  registrarConsentimentos, SEXOS, TEXTOS, cpfValido, emailValido,
} = require('../services/inscricaoContrato');




















const MOTIVOS_VALIDOS = ['recem_convertido', 'prestes_batizar', 'conhecer_cbrio', 'servir_voluntario'];
function motivoValido(m) { return MOTIVOS_VALIDOS.includes(String(m || '')) ? String(m) : null; }

function soDigitos(s) { return String(s || '').replace(/\D/g, ''); }






router.get('/eventos', async (_req, res) => {
  const hoje = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('next_eventos')
    .select('id, data, titulo, status')
    .eq('status', 'agendado')
    .gte('data', hoje)
    .order('data');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});










router.get('/turmas', async (_req, res) => {
  try {




    res.json({ horario: HORARIO_NEXT, turmas: await turmasOferecidas() });
  } catch (e) {


    console.error('[public/next/turmas]', e.message);
    res.status(500).json({ error: 'Não foi possível carregar as datas.' });
  }
});



router.get('/textos', (_req, res) => {
  res.json({ termos_lgpd: TEXTOS.termos_lgpd, aviso_optin: TEXTOS.aviso_optin });
});






router.post('/inscrever', async (req, res) => {
  try {
    const {
      nome, sobrenome, nome_completo, cpf, telefone, email, data_nascimento,
      sexo, endereco, motivo, observacoes,
      aceita_termos,
      whatsapp_optin,
      website,
    } = req.body || {};

    if (website) return res.status(200).json({ ok: true });

    const cleanMotivo = motivoValido(motivo);


    let cleanNome = String(nome || '').trim();
    let cleanSobrenome = sobrenome ? String(sobrenome).trim() : '';
    if (nome_completo && String(nome_completo).trim()) {
      const s = splitNomeCompleto(nome_completo);
      cleanNome = s.nome;
      cleanSobrenome = s.sobrenome;
    }
    if (!cleanNome || cleanNome.length < 2) {
      return res.status(400).json({ error: 'Nome obrigatorio' });
    }
    if (temAbreviacaoNome([cleanNome, cleanSobrenome].filter(Boolean).join(' '))) {
      return res.status(400).json({ error: 'Escreva seu nome completo, sem abreviações' });
    }
    if (!email || !emailValido(email)) {
      return res.status(400).json({ error: 'Email invalido' });
    }
    const telDigitos = soDigitos(telefone);
    if (telDigitos.length < 10 || telDigitos.length > 11) {
      return res.status(400).json({ error: 'Telefone invalido' });
    }

    const cleanNascimento = validarNascimento(data_nascimento);
    if (!cleanNascimento) {
      return res.status(400).json({ error: 'Informe uma data de nascimento válida' });
    }

    const cleanSexo = String(sexo || '').toLowerCase();
    if (!SEXOS.includes(cleanSexo)) {
      return res.status(400).json({ error: 'Selecione masculino ou feminino' });
    }
    const cleanEndereco = endereco ? String(endereco).trim().slice(0, 300) : null;
    if (!aceita_termos) {
      return res.status(400).json({ error: 'É preciso aceitar os termos para se inscrever' });
    }





    if (!cpf || !cpfValido(cpf)) {
      return res.status(400).json({ error: 'CPF obrigatório — confira os dígitos' });
    }

    const cleanCpf = soDigitos(cpf);
    const cleanEmail = String(email).toLowerCase().trim();




    let jaBatizado = false, jaVoluntario = false, jaDoador = false;
    let membroId = null;
    try {
      const { acharOuCriarGuardado } = require('../services/membroMatch');
      const r = await acharOuCriarGuardado({
        cpf: cleanCpf,
        email: cleanEmail,
        telefone,
        nome: [cleanNome, cleanSobrenome].filter(Boolean).join(' '),
        dataNascimento: cleanNascimento,




        genero: cleanSexo || null,
        status: 'visitante',
        origem: 'next_formulario',
      });
      membroId = r.membro_id;
    } catch (e) {
      console.error('publicNext acharOuCriarGuardado:', e.message);
    }


    if (whatsapp_optin && membroId) {
      try {
        await supabase.from('mem_membros')
          .update({ whatsapp_optin: true, whatsapp_optin_em: new Date().toISOString() })
          .eq('id', membroId).is('deleted_at', null);
      } catch (e) {
        console.warn('publicNext optin membro:', e.message);
      }
    }





    const orVol = [`cpf.eq.${cleanCpf}`];
    if (membroId) orVol.push(`membresia_id.eq.${membroId}`);
    const [snapBatizado, snapVol] = await Promise.all([
      membroId
        ? supabase.from('mem_membros').select('batizado').eq('id', membroId).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from('vol_profiles').select('id', { count: 'exact', head: true })
        .or(orVol.join(',')).eq('allocation_status', 'active'),
    ]);
    jaBatizado = !!snapBatizado?.data?.batizado;
    if (snapVol?.count && snapVol.count > 0) jaVoluntario = true;









    const turma = (await turmaEscolhida(req.body?.turma_id)) || await proximaTurmaAberta();




    if (membroId) {
      let q = supabase.from('next_matriculas').select('id')
        .eq('membro_id', membroId).is('deleted_at', null);
      q = turma?.id ? q.eq('turma_id', turma.id) : q.is('turma_id', null);
      const { data: ja } = await q.limit(1).maybeSingle();
      if (ja) return res.json({ ok: true, ja_inscrito: true, id: ja.id });
    }

    const { data: mat, error: matErr } = await supabase
      .from('next_matriculas')
      .insert({
        turma_id: turma?.id || null,
        nome: cleanNome, sobrenome: cleanSobrenome || null,
        cpf: cleanCpf, telefone: telDigitos || null, email: cleanEmail,
        data_nascimento: cleanNascimento, sexo: cleanSexo, endereco: cleanEndereco,
        membro_id: membroId, motivo: cleanMotivo,
        observacoes: observacoes ? String(observacoes).trim().slice(0, 1000) : null,
        ja_batizado: jaBatizado, ja_voluntario: jaVoluntario, ja_doador: jaDoador,
        origem: 'formulario',
        whatsapp_optin: !!whatsapp_optin,
        whatsapp_optin_em: whatsapp_optin ? new Date().toISOString() : null,
      })
      .select('id')
      .single();

    if (matErr) {

      if (matErr.code === '23505') return res.status(200).json({ ok: true, ja_inscrito: true });
      return res.status(500).json({ error: matErr.message });
    }
    await registrarObservacaoSegura({
      membroId, origem: 'next_formulario', origemId: mat.id,
      nome: [cleanNome, cleanSobrenome].filter(Boolean).join(' '), cpf: cleanCpf,
      telefone, email: cleanEmail, dataNascimento: cleanNascimento,
    });


    registrarConsentimentos({
      porta: 'next', refId: mat.id, membroId,
      ip: req.ip || null, userAgent: (req.headers['user-agent'] || '').slice(0, 300) || null,
      itens: [
        { tipo: 'termos_lgpd', aceito: true },
        { tipo: 'whatsapp', aceito: !!whatsapp_optin },
      ],
    }).catch((e) => console.error('[next] consentimentos:', e.message));


    try {
      await notificar({
        modulo: 'next',
        titulo: 'Nova inscrição no NEXT',
        mensagem: `${cleanNome} ${cleanSobrenome || ''} (${cleanEmail}) se inscreveu para o NEXT.`,
        link: '/ministerial/integracao?tab=next',
      });
    } catch (e) {
      console.error('[next] erro ao notificar:', e.message);
    }

    res.json({ ok: true, id: mat.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});











router.get('/direcionar/:token', async (req, res) => {
  try {
    if (!verifyDirecionarToken(req.params.token)) return res.status(403).json({ error: 'Link inválido' });
    const turma = await turmaAbertaAtual();
    if (!turma) return res.json({ turma: null, pessoas: [] });


    const { start, end } = brtHojeRangeUtc();
    const { data: pessoas } = await supabase.from('next_matriculas')
      .select('id, nome, sobrenome, indicou_grupo, indicou_servir, indicou_batismo')
      .eq('turma_id', turma.id).is('deleted_at', null)
      .gte('check_in_at', start).lt('check_in_at', end)
      .order('nome');
    res.json({
      turma: { nome: turma.nome },
      pessoas: (pessoas || []).map(p => ({
        id: p.id,
        nome: `${p.nome || ''}${p.sobrenome ? ' ' + p.sobrenome : ''}`.trim(),
        ja: { grupos: !!p.indicou_grupo, voluntarios: !!p.indicou_servir, batismo: !!p.indicou_batismo },
      })),



      batismo: await horariosDoBatismo(),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});







async function horariosDoBatismo() {
  try {
    const dataBatismo = await dataProximoBatismo();
    const configurados = await batismoHorariosConfigurados();
    if (!dataBatismo || configurados === null) {
      return { data_batismo: dataBatismo || null, horarios: [], indisponivel: true };
    }
    const ocup = await batismoOcupacaoPorHorario(dataBatismo);
    return { data_batismo: dataBatismo, horarios: horariosDisponiveis(configurados, ocup) };
  } catch (e) {
    console.error('[publicNext] horariosDoBatismo:', e.message);
    return { data_batismo: null, horarios: [], indisponivel: true };
  }
}


router.post('/direcionar/:token', async (req, res) => {
  try {
    if (!verifyDirecionarToken(req.params.token)) return res.status(403).json({ error: 'Link inválido' });
    const { matricula_id, destinos, areas, horario_batismo } = req.body || {};
    if (!matricula_id) return res.status(400).json({ error: 'Selecione a pessoa' });
    const turma = await turmaAbertaAtual();
    if (!turma) return res.status(409).json({ error: 'Nenhuma turma aberta no momento' });

    const { data: m } = await supabase.from('next_matriculas')
      .select('id, turma_id').eq('id', matricula_id).is('deleted_at', null).maybeSingle();
    if (!m || m.turma_id !== turma.id) return res.status(403).json({ error: 'Pessoa não pertence à turma aberta' });
    const r = await direcionarMatricula({
      matriculaId: matricula_id, destinos, areas,
      horarioBatismo: horario_batismo || null,
      userId: null,
      permitir: ['grupos', 'voluntarios', 'batismo'],
    });
    res.json(r);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, codigo: e.codigo, campo: e.campo });
  }
});







router.get('/checkin/:token', async (req, res) => {
  try {
    if (!verifyDirecionarToken(req.params.token)) return res.status(403).json({ error: 'Link inválido' });
    const turma = await turmaAbertaAtual();
    if (!turma) return res.json({ turma: null, pessoas: [] });
    const { start, end } = brtHojeRangeUtc();
    const { data: pessoas } = await supabase.from('next_matriculas')
      .select('id, nome, sobrenome, check_in_at, origem')
      .eq('turma_id', turma.id).is('deleted_at', null).order('nome');
    res.json({
      turma: { nome: turma.nome },
      pessoas: (pessoas || []).map(p => ({
        id: p.id,
        nome: `${p.nome || ''}${p.sobrenome ? ' ' + p.sobrenome : ''}`.trim(),
        presente: !!(p.check_in_at && p.check_in_at >= start && p.check_in_at < end),
        walk_in: p.origem === 'totem',
      })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


router.post('/checkin/:token', async (req, res) => {
  try {
    if (!verifyDirecionarToken(req.params.token)) return res.status(403).json({ error: 'Link inválido' });
    const { matricula_id, presente = true } = req.body || {};
    if (!matricula_id) return res.status(400).json({ error: 'Selecione a pessoa' });
    const turma = await turmaAbertaAtual();
    if (!turma) return res.status(409).json({ error: 'Nenhuma turma aberta no momento' });
    const { data: m } = await supabase.from('next_matriculas')
      .select('id, turma_id').eq('id', matricula_id).is('deleted_at', null).maybeSingle();
    if (!m || m.turma_id !== turma.id) return res.status(403).json({ error: 'Pessoa não pertence à turma aberta' });
    await supabase.from('next_matriculas')
      .update({ check_in_at: presente ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
      .eq('id', matricula_id);
    res.json({ ok: true, presente: !!presente });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


router.post('/checkin/:token/walkin', async (req, res) => {
  try {
    if (!verifyDirecionarToken(req.params.token)) return res.status(403).json({ error: 'Link inválido' });
    const { nome, sobrenome, cpf, telefone, email, data_nascimento } = req.body || {};
    if (!nome || String(nome).trim().length < 2) return res.status(400).json({ error: 'Informe o nome' });
    if (cpf && !cpfValido(cpf)) return res.status(400).json({ error: 'CPF inválido' });
    if (email && !emailValido(email)) return res.status(400).json({ error: 'E-mail inválido' });
    const turma = await turmaAbertaAtual();
    if (!turma) return res.status(409).json({ error: 'Nenhuma turma aberta no momento' });

    const cleanCpf = cpf ? soDigitos(cpf) : null;
    const cleanTel = telefone ? soDigitos(telefone) : null;
    const cleanEmail = email ? String(email).toLowerCase().trim() : null;
    const nomeCompleto = [nome, sobrenome].filter(Boolean).join(' ').trim();


    let membroId = null;
    try {
      const r = await acharOuCriarGuardado({
        cpf: cleanCpf, email: cleanEmail, telefone: cleanTel,
        nome: nomeCompleto, dataNascimento: data_nascimento || null, status: 'visitante',
        origem: 'next_checkin',
      });
      membroId = r?.membro_id || null;
    } catch (e) { console.error('[next walkin] acharOuCriarGuardado:', e.message); }


    if (membroId) {
      const { data: ja } = await supabase.from('next_matriculas').select('id')
        .eq('turma_id', turma.id).eq('membro_id', membroId).is('deleted_at', null)
        .limit(1).maybeSingle();
      if (ja) {
        await supabase.from('next_matriculas')
          .update({ check_in_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', ja.id);
        return res.json({ ok: true, id: ja.id, ja_inscrito: true });
      }
    }

    const { data: mat, error: matErr } = await supabase.from('next_matriculas').insert({
      turma_id: turma.id,
      nome: String(nome).trim(), sobrenome: sobrenome ? String(sobrenome).trim() : null,
      cpf: cleanCpf, telefone: cleanTel, email: cleanEmail,
      data_nascimento: data_nascimento || null, membro_id: membroId,
      origem: 'totem', check_in_at: new Date().toISOString(),
    }).select('id').single();
    if (matErr) {
      if (matErr.code === '23505') return res.json({ ok: true, ja_inscrito: true });
      return res.status(500).json({ error: matErr.message });
    }
    await registrarObservacaoSegura({
      membroId, origem: 'next_checkin', origemId: mat.id,
      nome: nomeCompleto, cpf: cleanCpf, telefone: cleanTel,
      email: cleanEmail, dataNascimento: data_nascimento || null,
    });
    res.json({ ok: true, id: mat.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
