
















const router = require('express').Router();
const { enviarLinkDeAcesso } = require('../utils/magicLink');
const { verificarTokenEscala } = require('../utils/escalaToken');
const { responderEscala } = require('../services/escalaResposta');
const rateLimit = require('express-rate-limit');
const { supabase } = require('../utils/supabase');
const { acharMembroGuardado } = require('../services/membroMatch');
const { registrarObservacaoSegura } = require('../services/identidadeProgressiva');
const { qrSlugValido } = require('../utils/campanhaTemplates');
const {
  temAbreviacaoNome, splitNomeCompleto, registrarConsentimentos, SEXOS, TEXTOS,
  cpfValido, emailValido,
} = require('../services/inscricaoContrato');




const limiterGeral = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.PUBLIC_FORM_RATE_LIMIT_MAX) || (process.env.NODE_ENV === 'production' ? 600 : 5000),
  skip: () => process.env.NODE_ENV !== 'production',
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições deste endereço. Tente novamente em alguns minutos.' },
});
router.use(limiterGeral);



const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas deste endereço. Tente novamente em alguns minutos.' },
});

function soDigitos(v) {
  return (v || '').toString().replace(/\D+/g, '');
}







const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function ehUuidValido(s) {
  return typeof s === 'string' && UUID_REGEX.test(s);
}

function maskEmail(email) {
  if (!email || !email.includes('@')) return null;
  const [local, domain] = email.split('@');
  const visible = local.slice(0, 1);
  const masked = visible + '***';
  return `${masked}@${domain}`;
}

function getFrontendUrl() {
  if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL.replace(/\/+$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:5173';
}



async function lookupByCpf(cpf) {
  const cleanCpf = soDigitos(cpf);


  const { data: vol } = await supabase.from('vol_profiles')
    .select('id, auth_user_id, full_name, email, cpf')
    .eq('cpf', cleanCpf)
    .maybeSingle();
  if (vol) {
    return { type: 'voluntario', record: vol, email: vol.email, name: vol.full_name };
  }


  const { data: func } = await supabase.from('rh_funcionarios')
    .select('id, nome, email, cpf, telefone')
    .eq('cpf', cleanCpf)
    .maybeSingle();
  if (func) {
    return { type: 'colaborador', record: func, email: func.email, name: func.nome };
  }


  const { data: membro } = await supabase.from('mem_membros')
    .select('id, nome, email, cpf, telefone')
    .eq('cpf', cleanCpf)
    .maybeSingle();
  if (membro) {
    return { type: 'membro', record: membro, email: membro.email, name: membro.nome };
  }

  return { type: 'none' };
}














router.post('/lookup-cpf', publicLimiter, async (req, res) => {
  try {
    const { cpf, website } = req.body || {};
    if (website) return res.status(200).json({ found: false });

    if (!cpfValido(cpf)) {
      return res.status(400).json({ error: 'CPF invalido' });
    }

    const result = await lookupByCpf(cpf);

    if (result.type === 'none') {
      return res.json({ found: false });
    }

    const hasEmail = !!result.email;
    return res.json({



      found: true,
      hasEmail,
      maskedEmail: hasEmail ? maskEmail(result.email) : null,
    });
  } catch (err) {
    console.error('[PublicVol] lookup-cpf error:', err.message);
    res.status(500).json({ error: 'Erro ao buscar cadastro' });
  }
});






router.post('/request-login', publicLimiter, async (req, res) => {
  try {
    const { cpf, serviceId, website } = req.body || {};
    if (website) return res.status(200).json({ ok: true });

    if (!cpfValido(cpf)) {
      return res.status(400).json({ error: 'CPF invalido' });
    }

    const result = await lookupByCpf(cpf);

    if (result.type === 'none') {
      return res.status(404).json({ error: 'Cadastro não encontrado', needsRegistration: true });
    }

    if (!result.email || !emailValido(result.email)) {
      return res.status(400).json({
        error: 'Seu cadastro não tem email valido. Procure um líder para atualizar.',
      });
    }

    const email = result.email.toLowerCase().trim();
    const cleanCpf = soDigitos(cpf);


    let authUserId = null;
    if (result.type === 'voluntario' && result.record.auth_user_id) {
      authUserId = result.record.auth_user_id;
    } else {

      const { data: existingProfile } = await supabase.from('profiles')
        .select('id, role').eq('email', email).maybeSingle();
      if (existingProfile) {
        authUserId = existingProfile.id;
      } else {

        const { data: created, error: createErr } = await supabase.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: { name: result.name || 'Voluntario' },
        });
        if (createErr) {
          console.error('[PublicVol] createUser error:', createErr.message);
          return res.status(500).json({ error: 'Erro ao criar conta' });
        }
        authUserId = created.user.id;


        await supabase.from('profiles').upsert({
          id: authUserId,
          email,
          name: result.name || 'Voluntario',
          role: 'voluntario',
          active: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
      }
    }


    if (result.type === 'voluntario') {

      if (!result.record.auth_user_id) {
        await supabase.from('vol_profiles')
          .update({ auth_user_id: authUserId })
          .eq('id', result.record.id);
      }
    } else {

      const origem = result.type === 'colaborador' ? 'manual' : 'membresia';
      const membresiaId = result.type === 'membro' ? result.record.id : null;


      const { data: existingVol } = await supabase.from('vol_profiles')
        .select('id')
        .or(`cpf.eq.${cleanCpf},auth_user_id.eq.${authUserId}`)
        .maybeSingle();

      if (existingVol) {
        await supabase.from('vol_profiles')
          .update({ auth_user_id: authUserId, cpf: cleanCpf, email })
          .eq('id', existingVol.id);
      } else {
        await supabase.from('vol_profiles').insert({
          auth_user_id: authUserId,
          full_name: result.name || 'Voluntario',
          email,
          cpf: cleanCpf,
          phone: result.record.telefone || null,
          membresia_id: membresiaId,
          origem,
          profile_complete: true,
          allocation_status: 'active',
        });
      }
    }


    const frontendUrl = getFrontendUrl();

    const serviceIdSeguro = ehUuidValido(serviceId) ? serviceId : null;
    const redirectPath = serviceIdSeguro
      ? `/voluntariado/self-checkin?serviceId=${encodeURIComponent(serviceIdSeguro)}`
      : '/voluntariado/checkin/painel';




    const envio = await enviarLinkDeAcesso({
      email,
      redirectTo: `${frontendUrl}${redirectPath}`,
      nome: result.name || null,
      assunto: 'Seu link de acesso ao check-in · CBRio',
      chamada: 'Você pediu para entrar no check-in de voluntário. É só tocar no botão abaixo — ele já abre você logado.',
      textoBotao: 'Abrir meu check-in',
      rodape: 'O link é pessoal e vale por pouco tempo. Se não foi você que pediu, pode ignorar este e-mail.',
      tag: 'PublicVol',
    });

    if (!envio.ok) {
      return res.status(502).json({
        error: 'Não conseguimos enviar o link agora. Tente de novo em alguns minutos ou procure um líder.',
      });
    }

    console.log(`[PublicVol] Link de acesso ENVIADO para ${maskEmail(email)} (tipo: ${result.type})`);
    return res.json({ ok: true, maskedEmail: maskEmail(email) });
  } catch (err) {
    console.error('[PublicVol] request-login error:', err.message);
    res.status(500).json({ error: 'Erro ao enviar link de acesso' });
  }
});




router.post('/register', publicLimiter, async (req, res) => {
  try {
    const { cpf, full_name, email: rawEmail, phone, serviceId, website } = req.body || {};
    if (website) return res.status(200).json({ ok: true });

    if (!cpfValido(cpf)) return res.status(400).json({ error: 'CPF invalido' });
    if (!full_name || full_name.trim().length < 3 || full_name.trim().length > 200) {
      return res.status(400).json({ error: 'Nome invalido (3-200 chars)' });
    }
    if (!emailValido(rawEmail)) return res.status(400).json({ error: 'Email invalido' });

    const email = rawEmail.toLowerCase().trim().slice(0, 200);
    const cleanCpf = soDigitos(cpf);



    const existing = await lookupByCpf(cleanCpf);
    if (existing.type !== 'none') {
      return res.status(409).json({ error: 'CPF já cadastrado. Use "Entrar" em vez de cadastrar.', type: existing.type });
    }


    const { data: profileByEmail } = await supabase.from('profiles')
      .select('id').eq('email', email).maybeSingle();

    let authUserId = profileByEmail?.id || null;
    if (!authUserId) {
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { name: full_name },
      });
      if (createErr) {
        console.error('[PublicVol] createUser error:', createErr.message);
        return res.status(500).json({ error: 'Erro ao criar conta' });
      }
      authUserId = created.user.id;
    }


    await supabase.from('profiles').upsert({
      id: authUserId,
      email,
      name: full_name,
      role: 'voluntario',
      active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });


    let membresiaId = null;
    try {
      const { findOrCreateMembro } = require('./pessoas');
      const r = await findOrCreateMembro({
        cpf: cleanCpf, email, telefone: phone, nome: full_name, status: 'visitante',
        origem: 'voluntariado_autoatendimento',
      });
      membresiaId = r.membro_id;
    } catch (e) {
      console.error('publicVoluntariado findOrCreateMembro:', e.message);
    }


    await supabase.from('vol_profiles').insert({
      auth_user_id: authUserId,
      full_name,
      email,
      cpf: cleanCpf,
      phone: phone ? soDigitos(phone) : null,
      origem: 'manual',
      profile_complete: true,
      allocation_status: 'active',
      membresia_id: membresiaId,
    });


    const frontendUrl = getFrontendUrl();

    const serviceIdSeguro = ehUuidValido(serviceId) ? serviceId : null;
    const redirectPath = serviceIdSeguro
      ? `/voluntariado/self-checkin?serviceId=${encodeURIComponent(serviceIdSeguro)}`
      : '/voluntariado/checkin/painel';






    const envio = await enviarLinkDeAcesso({
      email,
      redirectTo: `${frontendUrl}${redirectPath}`,
      nome: full_name.trim(),
      assunto: 'Bem-vindo(a) · seu link de acesso ao check-in · CBRio',
      chamada: 'Seu cadastro de voluntário foi criado. Toque no botão abaixo para abrir o check-in já logado.',
      textoBotao: 'Abrir meu check-in',
      rodape: 'O link é pessoal e vale por pouco tempo. Se não foi você que se cadastrou, procure a liderança.',
      tag: 'PublicVol',
    });

    if (!envio.ok) {
      return res.status(502).json({
        error: 'Cadastro criado, mas não conseguimos enviar o link agora. Toque em “Entrar” de novo em alguns minutos.',
      });
    }

    console.log(`[PublicVol] Novo voluntario cadastrado e link ENVIADO: ${maskEmail(email)}`);
    return res.json({ ok: true, maskedEmail: maskEmail(email) });
  } catch (err) {
    console.error('[PublicVol] register error:', err.message);
    res.status(500).json({ error: 'Erro ao cadastrar' });
  }
});








const AREAS_VALIDAS = new Set(['kids', 'sede', 'ami', 'bridge', 'online']);

router.post('/inscrever-form', async (req, res) => {
  try {
    const {
      nome, sobrenome, nome_completo, email, telefone, cpf, data_nascimento,
      sexo, endereco, nome_mae,
      area, participou_next, dom_predominante, ministerios_interesse,
      consentimento_antecedentes,
      aceita_termos,
      whatsapp_optin,
      website,
      qr,
    } = req.body || {};

    if (website) return res.status(200).json({ ok: true });
    const qrSlug = qrSlugValido(qr);



    let cleanNome = String(nome || '').trim();
    let cleanSobrenome = String(sobrenome || '').trim();
    if (nome_completo && String(nome_completo).trim()) {
      const s = splitNomeCompleto(nome_completo);
      cleanNome = s.nome;
      cleanSobrenome = s.sobrenome;
    }
    if (cleanNome.length < 2) return res.status(400).json({ error: 'Nome obrigatório' });
    if (cleanSobrenome.length < 2) return res.status(400).json({ error: 'Informe seu nome completo' });

    if (temAbreviacaoNome(cleanNome) || temAbreviacaoNome(cleanSobrenome)) {
      return res.status(400).json({ error: 'Escreva seu nome completo, sem abreviações' });
    }

    if (!participou_next || !String(participou_next).trim()) {
      return res.status(400).json({ error: 'Conta pra gente se você já participou do NEXT' });
    }

    const cleanEmail = email ? String(email).toLowerCase().trim() : null;
    if (!cleanEmail || !emailValido(cleanEmail)) {
      return res.status(400).json({ error: 'E-mail inválido' });
    }
    const cleanTelefone = soDigitos(telefone);
    if (cleanTelefone.length < 10 || cleanTelefone.length > 11) {
      return res.status(400).json({ error: 'Telefone inválido' });
    }
    const cleanCpf = soDigitos(cpf);
    if (!cleanCpf) {
      return res.status(400).json({ error: 'CPF obrigatório' });
    }
    if (!cpfValido(cleanCpf)) {
      return res.status(400).json({ error: 'CPF inválido' });
    }
    const cleanDataNascimento = data_nascimento ? String(data_nascimento).slice(0, 10) : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDataNascimento)) {
      return res.status(400).json({ error: 'Data de nascimento obrigatória' });
    }
    const nascimento = new Date(`${cleanDataNascimento}T12:00:00Z`);
    if (Number.isNaN(nascimento.getTime()) || nascimento.toISOString().slice(0, 10) !== cleanDataNascimento || nascimento > new Date()) {
      return res.status(400).json({ error: 'Data de nascimento inválida' });
    }
    if (!area || !AREAS_VALIDAS.has(String(area).toLowerCase())) {
      return res.status(400).json({ error: 'Selecione uma área' });
    }

    const cleanSexo = String(sexo || '').toLowerCase();
    if (!SEXOS.includes(cleanSexo)) {
      return res.status(400).json({ error: 'Selecione masculino ou feminino' });
    }
    const cleanEndereco = endereco ? String(endereco).trim().slice(0, 300) : null;
    if (!aceita_termos) {
      return res.status(400).json({ error: 'É preciso aceitar os termos para se inscrever' });
    }







    const areaLower = String(area).toLowerCase();
    let flagMenorDasOpcoes = false;
    try {
      const labels = Array.isArray(ministerios_interesse) ? ministerios_interesse.filter(Boolean) : [];
      if (labels.length) {
        const { data: opsMenor } = await supabase.from('vol_form_opcoes')
          .select('id').in('label', labels).eq('exige_dados_menor', true).limit(1);
        flagMenorDasOpcoes = !!(opsMenor && opsMenor.length);
      }
    } catch (e) { console.warn('[PublicVol/inscrever-form] opções de menor:', e.message); }
    const exigeDadosMenor = flagMenorDasOpcoes || areaLower === 'kids' || areaLower === 'bridge';
    if (exigeDadosMenor && (!nome_mae || String(nome_mae).trim().length < 2)) {
      return res.status(400).json({ error: 'Nome da mãe é obrigatório para servir em ministério com crianças e adolescentes' });
    }

    if (exigeDadosMenor && !consentimento_antecedentes) {
      return res.status(400).json({ error: 'É necessário autorizar a consulta de antecedentes para servir em ministério com crianças e adolescentes' });
    }

    const nomeCompleto = [cleanNome, cleanSobrenome].filter(Boolean).join(' ');
    const cleanMinisterios = Array.isArray(ministerios_interesse)
      ? ministerios_interesse.filter(Boolean).join(', ')
      : (ministerios_interesse ? String(ministerios_interesse).trim() : null);






    let membroId = null;
    try {
      const achado = await acharMembroGuardado({
        cpf: cleanCpf, email: cleanEmail, telefone: cleanTelefone,
        nome: nomeCompleto, dataNascimento: cleanDataNascimento || null,
      });
      membroId = achado?.membro_id || null;
    } catch (e) {
      console.warn('[PublicVol/inscrever-form] match membro:', e.message);
    }



    try {
      const orParts = [`cpf.eq.${cleanCpf}`];
      if (membroId) orParts.push(`membro_id.eq.${membroId}`);
      const { data: aberta } = await supabase.from('vol_inscricoes')
        .select('id, status')
        .or(orParts.join(','))
        .in('status', ['inscrito', 'enviado_ministerio'])
        .is('deleted_at', null)
        .limit(1);
      if (aberta && aberta.length) {
        return res.json({
          ok: true, ja_inscrito: true, id: aberta[0].id,
          mensagem: 'Já recebemos a sua inscrição — a coordenação de voluntários vai falar com você em breve.',
        });
      }
    } catch (e) {
      console.warn('[PublicVol/inscrever-form] dedup:', e.message);
    }

    const { data: insc, error: insErr } = await supabase
      .from('vol_inscricoes')
      .insert({
        nome: cleanNome,
        sobrenome: cleanSobrenome,
        nome_completo: nomeCompleto,
        cpf: cleanCpf,
        email: cleanEmail,
        telefone: cleanTelefone,
        data_nascimento: cleanDataNascimento,
        sexo: cleanSexo,
        endereco: cleanEndereco,
        nome_mae: nome_mae ? String(nome_mae).trim() : null,
        data_inscricao: new Date().toISOString(),
        participou_next: participou_next ? String(participou_next).trim() : null,
        dom_predominante: dom_predominante ? String(dom_predominante).trim() : null,
        ministerios_interesse: cleanMinisterios,
        area: String(area).toLowerCase(),
        status: 'inscrito',
        primeiro_contato_em: 'False',
        membro_id: membroId,
        origem: 'formulario_publico',
        whatsapp_optin: !!whatsapp_optin,
        whatsapp_optin_em: whatsapp_optin ? new Date().toISOString() : null,
      })
      .select('id')
      .single();

    if (insErr) {
      console.error('[PublicVol/inscrever-form] insert:', insErr.message);
      return res.status(500).json({ error: 'Erro ao registrar inscrição' });
    }





    if (qrSlug && insc?.id) {
      const { error: eQr } = await supabase.from('vol_inscricoes').update({ qr_slug: qrSlug }).eq('id', insc.id);
      if (eQr && eQr.code !== '42703') console.warn('[PublicVol/inscrever-form] qr_slug:', eQr.message);
    }
    await registrarObservacaoSegura({
      membroId, origem: 'voluntariado_formulario', origemId: insc?.id || null,
      nome: nomeCompleto, cpf: cleanCpf, telefone: cleanTelefone,
      email: cleanEmail, dataNascimento: cleanDataNascimento || null,
    });



    registrarConsentimentos({
      porta: 'voluntariado', refId: insc.id, membroId,
      ip: req.ip || null, userAgent: (req.headers['user-agent'] || '').slice(0, 300) || null,
      itens: [
        { tipo: 'termos_lgpd', aceito: true },
        { tipo: 'whatsapp', aceito: !!whatsapp_optin },
      ],
    }).catch((e) => console.error('[PublicVol/inscrever-form] consentimentos:', e.message));





    if (whatsapp_optin && membroId) {
      try {
        await supabase.from('mem_membros')
          .update({ whatsapp_optin: true, whatsapp_optin_em: new Date().toISOString() })
          .eq('id', membroId).is('deleted_at', null);
      } catch (e) {
        console.warn('[PublicVol/inscrever-form] optin membro:', e.message);
      }
    }




    if (exigeDadosMenor) {
      try {
        const { criarCheckParaInscricao } = require('../services/antecedentesCriminais');
        await criarCheckParaInscricao({
          id: insc.id,
          area: areaLower,
          membro_id: membroId,
          nome_completo: nomeCompleto,
          cpf: cleanCpf,
          nome_mae: nome_mae ? String(nome_mae).trim() : null,
          data_nascimento: cleanDataNascimento,
        }, { consentimento: true, origem: 'formulario_publico' });
      } catch (e) {
        console.error('[PublicVol/inscrever-form] antecedentes:', e.message);
      }
    }

    try {
      const { notificar } = require('../services/notificar');
      await notificar({
        modulo: 'voluntariado',
        tipo: 'nova_inscricao',
        titulo: 'Nova inscrição de voluntário',
        mensagem: `${nomeCompleto} (${cleanEmail}) se inscreveu para servir${cleanMinisterios ? ` em: ${cleanMinisterios}` : ` na área ${String(area).toUpperCase()}`}.`,
        link: '/ministerial/voluntariado/inscricoes',
        severidade: 'info',
        chaveDedup: `vol_inscricao_${insc.id}`,
      });
    } catch (e) {
      console.error('[PublicVol/inscrever-form] notificar:', e.message);
    }


    try {
      const { dispararAuto } = require('../services/whatsappAuto');
      await dispararAuto('voluntariado_inscricao', {
        refId: insc.id, telefone: cleanTelefone, nome: nomeCompleto, origem: 'formulario_publico',
      });
    } catch (e) {
      console.error('[PublicVol/inscrever-form] whatsapp:', e.message);
    }

    return res.json({ ok: true, id: insc.id });
  } catch (err) {
    console.error('[PublicVol/inscrever-form] error:', err.message);
    res.status(500).json({ error: 'Erro ao registrar inscrição' });
  }
});



















router.get('/escala/:token', async (req, res) => {
  try {
    const id = verificarTokenEscala(req.params.token);


    if (!id) return res.status(404).json({ error: 'Link inválido ou expirado.' });

    const { data: e } = await supabase.from('vol_schedules')
      .select('id, service_id, volunteer_name, team_name, position_name, confirmation_status')
      .eq('id', id).maybeSingle();
    if (!e) return res.status(404).json({ error: 'Link inválido ou expirado.' });

    const { data: s } = await supabase.from('vol_services')
      .select('name, scheduled_at').eq('id', e.service_id).maybeSingle();

    res.json({
      id: e.id,
      primeiro_nome: String(e.volunteer_name || '').trim().split(/\s+/)[0] || null,
      area: e.team_name || null,
      funcao: e.position_name || null,
      culto: s?.name || null,
      quando: s?.scheduled_at || null,
      status: e.confirmation_status || 'pending',


      passou: s?.scheduled_at ? new Date(s.scheduled_at).getTime() < Date.now() : false,
    });
  } catch (err) {
    console.error('[PublicVol/escala] error:', err.message);
    res.status(500).json({ error: 'Erro ao abrir a escala' });
  }
});

router.post('/escala/:token/responder', async (req, res) => {
  try {
    const id = verificarTokenEscala(req.params.token);
    if (!id) return res.status(404).json({ error: 'Link inválido ou expirado.' });

    const r = await responderEscala(id, req.body?.status, { origem: 'link' });
    if (!r.ok) return res.status(r.status || 400).json({ error: r.erro });

    res.json({ ok: true, status: r.escala.confirmation_status, mudou: r.mudou });
  } catch (err) {
    console.error('[PublicVol/escala responder] error:', err.message);
    res.status(500).json({ error: 'Erro ao registrar a resposta' });
  }
});



router.get('/textos', (_req, res) => {
  res.json({ termos_lgpd: TEXTOS.termos_lgpd, aviso_optin: TEXTOS.aviso_optin });
});






router.get('/form-opcoes', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vol_form_opcoes')
      .select('id, label, area_canonica, exige_dados_menor, aviso_titulo, aviso_texto')
      .eq('ativo', true)
      .order('ordem', { ascending: true });
    if (error) {
      console.warn('[PublicVol/form-opcoes]', error.message);
      return res.json({ opcoes: [] });
    }
    res.json({ opcoes: data || [] });
  } catch (e) {
    console.error('[PublicVol/form-opcoes] error:', e.message);
    res.json({ opcoes: [] });
  }
});

module.exports = router;
