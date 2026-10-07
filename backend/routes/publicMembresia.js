// Respostas públicas SEM `password`; nenhum segredo deve ser retornado.

const router = require('express').Router();
const multer = require('multer');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { supabase } = require('../utils/supabase');
const { cepCompleto } = require('../utils/trechoCep');
const { notificar } = require('../services/notificar');
const { donosDoGrupo } = require('../services/gruposDestinatarios');
const { avisarPedidoNovoNoApp } = require('../services/gruposAvisoApp');
const { uploadModuleFile, SHAREPOINT_CONFIGURED } = require('../services/storageService');



const { acharMembroGuardado, ehNomeDerivadoDeEmail, registrarContatoDaPorta } = require('../services/membroMatch');
const { registrarObservacaoSegura } = require('../services/identidadeProgressiva');
const { cpfValido, emailValido } = require('../services/inscricaoContrato');
const { verificarTokenCenso } = require('../utils/censoToken');



const { podeIdentificarPorCpf } = require('../utils/censoPrefill');
const { avaliarProntidao } = require('../utils/prontidaoCadastro');



const { acharAuthUserPorEmail } = require('../utils/authUsers');

const { enviarLinkDeAcesso } = require('../utils/magicLink');
const { canonizarBairro } = require('../services/bairroCanonico');

const uploadMw = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Formato de imagem não suportado.'));
  },
});


















const cadastroLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.PUBLIC_MEMBRESIA_RATE_LIMIT_MAX) || 10000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas submissões deste endereço. Tente novamente em alguns minutos.' },
});






const lookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.PUBLIC_MEMBRESIA_LOOKUP_RATE_LIMIT_MAX) || 3000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas consultas deste endereço. Tente novamente em alguns minutos.' },
});


function soDigitos(v) {
  return (v || '').toString().replace(/\D+/g, '');
}



function getFrontendUrl() {
  if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL.replace(/\/+$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:5173';
}














const cpfProbeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.PUBLIC_MEMBRESIA_CPF_PROBE_MAX) || 20,
  keyGenerator: (req) => {
    const d = soDigitos(req.query?.cpf);
    return d.length === 11 ? `cpfprobe:${d}` : `cpfprobe:ip:${req.ip}`;
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas consultas para este CPF. Tente novamente em alguns minutos.' },
});






















const contaPorEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.PUBLIC_MEMBRESIA_CONTA_EMAIL_MAX) || 3,
  skip: (req) => !req.body?.senha || !req.body?.email,
  keyGenerator: (req) => {
    const e = String(req.body?.email || '').trim().toLowerCase();
    return e ? `contaemail:${e}` : `contaemail:ip:${req.ip}`;
  },
  handler: (req, _res, next) => {
    req.contaPorEmailEstourou = true;
    console.warn('[PUBLIC CADASTRO] criação de conta bloqueada pelo balde por e-mail alvo');
    next();
  },
  standardHeaders: false,
  legacyHeaders: false,
});



const VINCULOS_DECLARADOS = ['membro', 'congregado', 'visitante'];



const COLUNAS_CENSO = ['censo', 'vinculo_declarado', 'censo_conflitos'];








const COLUNAS_OPCIONAIS = [
  ...COLUNAS_CENSO,

  'carta_transferencia', 'igreja_anterior',
];







function semColunasOpcionais(payload) {
  const copia = { ...payload };
  for (const c of COLUNAS_OPCIONAIS) delete copia[c];
  return copia;
}
function ehColunaAusente(error) {
  if (!error) return false;
  return error.code === '42703'
    || /column .* does not exist/i.test(error.message || '')
    || /could not find the .* column/i.test(error.message || '');
}







router.post('/upload-foto', cadastroLimiter, uploadMw.single('foto'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Imagem não fornecida' });
    const id = `pub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const ext = req.file.mimetype === 'image/png' ? 'png' : req.file.mimetype === 'image/webp' ? 'webp' : 'jpg';
    const path = `cadastros/${id}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from('fotos-membros')
      .upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
    if (upErr) throw upErr;

    const { data: urlData } = supabase.storage.from('fotos-membros').getPublicUrl(path);


    if (SHAREPOINT_CONFIGURED) {
      uploadModuleFile('membresia', 'Cadastros_Publicos', `${id}.${ext}`, req.file.buffer)
        .then(() => console.log(`[PUBLIC] Foto sincronizada com SharePoint: ${id}`))
        .catch(spErr => console.error('[PUBLIC] SharePoint sync erro (nao-critico):', spErr.message));
    }

    res.json({ foto_url: urlData.publicUrl });
  } catch (e) {
    console.error('[PUBLIC] foto upload error:', e.message);
    res.status(500).json({ error: 'Erro ao enviar foto' });
  }
});
























let _bairrosCache = { em: 0, itens: null };
const BAIRROS_CACHE_MS = 10 * 60 * 1000;












const BAIRROS_CACHE_BORDA = 'public, s-maxage=300, stale-while-revalidate=600';

router.get('/bairros', lookupLimiter, async (req, res) => {
  try {
    if (_bairrosCache.itens && Date.now() - _bairrosCache.em < BAIRROS_CACHE_MS) {
      res.set('Cache-Control', BAIRROS_CACHE_BORDA);
      return res.json({ bairros: _bairrosCache.itens, cache: true });
    }
    const { data, error } = await supabase.rpc('fn_dem_bairros_catalogo');
    if (error) throw error;
    const itens = (data || []).map((b) => ({
      norm: b.bairro_norm,
      nome: b.bairro,
      pessoas: b.pessoas || 0,
      apelidos: b.apelidos || [],
    }));
    _bairrosCache = { em: Date.now(), itens };
    res.set('Cache-Control', BAIRROS_CACHE_BORDA);
    res.json({ bairros: itens, cache: false });
  } catch (e) {



    console.error('[public/membresia/bairros]', e.message);
    res.json({ bairros: [], indisponivel: true });
  }
});

router.get('/verificar-familia', lookupLimiter, async (req, res) => {
  try {
    const { sobrenome } = req.query;
    if (!sobrenome || typeof sobrenome !== 'string' || sobrenome.trim().length < 2) {
      return res.json({ familias: [] });
    }
    const termo = sobrenome.trim();
    const { data: familias } = await supabase
      .from('mem_familias')
      .select('id, nome')
      .ilike('nome', `%${termo}%`)
      .limit(5);


    res.json({ familias: familias || [] });
  } catch (e) {
    console.error('[PUBLIC] verificar-familia error:', e.message);
    res.json({ familias: [] });
  }
});














function mascararTelefone(telefone) {
  const d = soDigitos(telefone);
  if (d.length !== 10 && d.length !== 11) return '';

  if (d.length === 11) {
    return `(${d.slice(0, 2)}) ${d[2]}****-**${d.slice(9, 11)}`;
  }
  return `(${d.slice(0, 2)}) ****-**${d.slice(8, 10)}`;
}

router.get('/lookup-nome-telefone', lookupLimiter, async (req, res) => {
  try {
    const nomeRaw = (req.query.nome || '').toString().trim();
    const telefoneRaw = (req.query.telefone || '').toString();
    const digits = soDigitos(telefoneRaw);

    if (nomeRaw.length < 2 || (digits.length !== 10 && digits.length !== 11)) {
      return res.json({ found: false, reason: 'invalid' });
    }

    const primeiroNome = nomeRaw.split(/\s+/)[0].toLowerCase();
    if (primeiroNome.length < 2) {
      return res.json({ found: false, reason: 'invalid' });
    }




    const { data: candidatos } = await supabase
      .from('mem_membros')
      .select('id, nome, telefone, status, cpf, data_nascimento')
      .eq('active', true)
      .ilike('nome', `${primeiroNome}%`)
      .limit(50);

    const match = (candidatos || []).find(
      (c) => soDigitos(c.telefone) === digits,
    );

    if (match) {
      const partes = (match.nome || '').trim().split(/\s+/);
      const pn = partes[0] || '';
      const ini = partes
        .slice(1)
        .map((p) => p[0]?.toUpperCase() || '')
        .join('. ')
        .trim();


      const cadastroCompleto = !!(match.cpf && match.data_nascimento);
      return res.json({
        found: true,
        matchId: match.id,
        primeiroNome: pn,
        iniciaisSobrenome: ini ? ini + '.' : '',
        telefoneMascarado: mascararTelefone(match.telefone),
        cadastroCompleto,
        status: match.status || 'visitante',
      });
    }

    return res.json({ found: false });
  } catch (e) {
    console.error('[PUBLIC] lookup-nome-telefone error:', e.message);
    res.json({ found: false, reason: 'error' });
  }
});



















router.get('/censo/meus-dados', lookupLimiter, async (req, res) => {
  try {
    const membroId = verificarTokenCenso(req.query.t);


    if (!membroId) return res.status(404).json({ ok: false, error: 'Link inválido ou expirado.' });

    const { data: m, error } = await supabase
      .from('mem_membros')
      .select('id, nome, cpf, email, telefone, data_nascimento, genero, estado_civil, endereco, bairro, cidade, cep, profissao, foto_url, censo_respondido_em')
      .eq('id', membroId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    if (!m) return res.status(404).json({ ok: false, error: 'Link inválido ou expirado.' });



    const prontidao = avaliarProntidao({
      ...m, status: 'pendente', aceita_termos: true, duplicado_de_id: null,
    });

    res.json({
      ok: true,
      ja_respondeu: !!m.censo_respondido_em,
      faltando: prontidao.faltando,
      dados: {
        nome: m.nome || '',
        cpf: m.cpf || '',
        email: m.email || '',
        telefone: m.telefone || '',
        data_nascimento: m.data_nascimento || '',
        genero: m.genero || '',
        estado_civil: m.estado_civil || '',
        endereco: m.endereco || '',
        bairro: m.bairro || '',
        cidade: m.cidade || '',
        cep: m.cep || '',
        profissao: m.profissao || '',
        foto_url: m.foto_url || '',
      },
    });
  } catch (e) {
    console.error('[PUBLIC] censo/meus-dados error:', e.message);
    res.status(500).json({ ok: false, error: 'Erro ao carregar seus dados' });
  }
});



















router.get('/lookup-cpf', lookupLimiter, cpfProbeLimiter, async (req, res) => {

  const neutra = { found: false };
  try {
    const cpf = req.query.cpf;


    if (!cpf || !cpfValido(cpf)) {
      return res.json(neutra);
    }
    const d = soDigitos(cpf);




    const nascimento = String(req.query.data_nascimento || req.query.nascimento || '').trim();
    const temNascimento = /^\d{4}-\d{2}-\d{2}$/.test(nascimento);
    if (!podeIdentificarPorCpf({ cpfValido: true, temNascimento })) {
      return res.json(neutra);
    }


    const { data: m } = await supabase
      .from('mem_membros')
      .select('id, nome, data_nascimento, status')
      .eq('cpf', d)
      .eq('active', true)
      .maybeSingle();


    if (m && m.data_nascimento !== nascimento) {
      return res.json(neutra);
    }

    if (m) {
      const partes = (m.nome || '').trim().split(/\s+/);
      const primeiroNome = partes[0] || '';
      const iniciaisSobrenome = partes.slice(1).map(p => p[0]?.toUpperCase() || '').join('. ').trim();
      return res.json({
        found: true,
        fonte: 'membro',
        primeiroNome,
        iniciaisSobrenome: iniciaisSobrenome ? iniciaisSobrenome + '.' : '',
        status: m.status,
      });
    }





    const { data: p } = await supabase
      .from('mem_cadastros_pendentes')
      .select('id, nome, status, data_nascimento')
      .eq('cpf', d)
      .in('status', ['pendente', 'duplicado'])
      .maybeSingle();


    if (p && p.data_nascimento !== nascimento) {
      return res.json(neutra);
    }

    if (p) {
      const partes = (p.nome || '').trim().split(/\s+/);
      const primeiroNome = partes[0] || '';
      const iniciaisSobrenome = partes.slice(1).map(x => x[0]?.toUpperCase() || '').join('. ').trim();
      return res.json({
        found: true,
        fonte: 'pendente',
        primeiroNome,
        iniciaisSobrenome: iniciaisSobrenome ? iniciaisSobrenome + '.' : '',
        status: p.status,
      });
    }

    return res.json(neutra);
  } catch (e) {
    console.error('[PUBLIC] lookup-cpf error:', e.message);


    res.json(neutra);
  }
});










router.post('/cadastro', cadastroLimiter, contaPorEmailLimiter, async (req, res) => {
  try {
    const {
      nome,
      cpf,
      email,
      telefone,
      data_nascimento,


      genero,
      estado_civil,
      endereco,
      bairro,
      cidade,
      cep,
      profissao,
      como_conheceu,
      origem,
      aceita_termos,
      aceita_contato,
      whatsapp_optin,
      consentimento_texto,
      converteu_na_cbrio,







      carta_transferencia,
      igreja_anterior,



      vinculo_declarado,
      censo,


      censo_token,
      familia_sugerida_id,
      foto_url,

      grupo_id,
      grupo_observacao,


      match_membro_id,



      senha,

      website,
    } = req.body || {};


    if (website && String(website).trim() !== '') {
      return res.status(201).json({ ok: true });
    }


    if (!nome || typeof nome !== 'string' || nome.trim().length < 3) {
      return res.status(400).json({ error: 'Nome é obrigatório (mínimo 3 caracteres).' });
    }
    if (nome.trim().length > 200) {
      return res.status(400).json({ error: 'Nome muito longo.' });
    }
    if (!telefone || soDigitos(telefone).length < 10) {
      return res.status(400).json({ error: 'Celular é obrigatório (informe DDD + número).' });
    }
    if (!cpf || !cpfValido(cpf)) {
      return res.status(400).json({ error: 'CPF inválido.' });
    }
    if (!data_nascimento) {
      return res.status(400).json({ error: 'Data de nascimento é obrigatória.' });
    }
    if (email && !emailValido(email)) {
      return res.status(400).json({ error: 'E-mail inválido.' });
    }
    if (senha !== undefined && senha !== null && senha !== '') {
      if (typeof senha !== 'string' || senha.length < 6) {
        return res.status(400).json({ error: 'Senha precisa ter pelo menos 6 caracteres.' });
      }
      if (!email) {
        return res.status(400).json({ error: 'Email obrigatório quando criar senha.' });
      }
    }
    if (!aceita_termos) {
      return res.status(400).json({ error: 'É necessário aceitar os termos para enviar o cadastro.' });
    }

    if (!VINCULOS_DECLARADOS.includes(vinculo_declarado || '') && vinculo_declarado) {
      return res.status(400).json({ error: 'Vínculo declarado inválido.' });
    }
    const ehCenso = !!censo;
    if (ehCenso && !vinculo_declarado) {
      return res.status(400).json({ error: 'Informe seu vínculo com a igreja.' });
    }









    const generoNorm = String(genero || '').trim().toLowerCase();
    if (!['masculino', 'feminino'].includes(generoNorm)) {
      return res.status(400).json({ error: 'Selecione o sexo (masculino ou feminino).', campo: 'genero' });
    }







    const origemValida = ['site', 'qr_code', 'evento', 'importacao', 'online'];
    const origemFinal = origemValida.includes(origem) ? origem : 'site';




















    if (origemFinal === 'site' && !cepCompleto(cep)) {
      return res.status(400).json({
        error: String(cep || '').trim()
          ? 'CEP incompleto — informe os 8 dígitos.'
          : 'CEP é obrigatório.',
        campo: 'cep',
      });
    }




    const bairroCanon = await canonizarBairro(bairro);


    let duplicadoDeId = null;


    let matchedBy = null;
    const emailLimpo = email ? email.trim().toLowerCase() : null;
    const telefoneLimpo = soDigitos(telefone);
    const cpfLimpo = soDigitos(cpf);






    const membroIdToken = verificarTokenCenso(censo_token);
    if (membroIdToken) {
      const { data: alvo } = await supabase
        .from('mem_membros').select('id').eq('id', membroIdToken)
        .is('deleted_at', null).maybeSingle();
      if (alvo) {
        duplicadoDeId = alvo.id;
        matchedBy = 'token_censo';
      }
    }



    if (!duplicadoDeId && match_membro_id && typeof match_membro_id === 'string') {
      const { data: confirmado } = await supabase
        .from('mem_membros')
        .select('id, telefone')
        .eq('id', match_membro_id)
        .eq('active', true)
        .maybeSingle();
      if (confirmado && soDigitos(confirmado.telefone) === telefoneLimpo) {
        duplicadoDeId = confirmado.id;




        matchedBy = 'confirmado_usuario';
      }
    }

    if (!duplicadoDeId) {
      const match = await acharMembroGuardado({
        cpf: cpfLimpo, email: emailLimpo, telefone: telefoneLimpo,
        nome: nome.trim(), dataNascimento: data_nascimento,
      });
      duplicadoDeId = match?.membro_id || null;
      matchedBy = match?.matched_by || null;
    }


    const ip =
      (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() ||
      req.ip ||
      null;
    const userAgent = (req.headers['user-agent'] || '').toString().slice(0, 500);

    const payload = {
      nome: nome.trim(),
      cpf: cpfLimpo,
      email: emailLimpo,
      telefone: telefone || null,
      data_nascimento: data_nascimento || null,
      genero: generoNorm,
      estado_civil: estado_civil || null,
      endereco: endereco || null,




      bairro: bairroCanon,
      cidade: cidade || null,
      cep: cep || null,
      profissao: profissao || null,
      como_conheceu: como_conheceu || null,
      origem: origemFinal,
      aceita_termos: !!aceita_termos,
      aceita_contato: !!aceita_contato,
      whatsapp_optin: !!whatsapp_optin,
      whatsapp_optin_em: whatsapp_optin ? new Date().toISOString() : null,
      consentimento_texto: consentimento_texto ? String(consentimento_texto).slice(0, 2000) : null,


      ...(converteu_na_cbrio ? { converteu_na_cbrio: true } : {}),






      ...(carta_transferencia === true ? { carta_transferencia: true } : {}),


      ...(typeof igreja_anterior === 'string' && igreja_anterior.trim()
        ? { igreja_anterior: igreja_anterior.trim().slice(0, 160) }
        : {}),
      familia_sugerida_id: familia_sugerida_id || null,
      foto_url: foto_url || null,
      status: duplicadoDeId ? 'duplicado' : 'pendente',
      duplicado_de_id: duplicadoDeId,
      ip_origem: ip,
      user_agent: userAgent,
      ...(ehCenso ? { censo: true } : {}),
      ...(vinculo_declarado ? { vinculo_declarado } : {}),
    };

    let { data, error } = await supabase
      .from('mem_cadastros_pendentes')
      .insert(payload)
      .select('id, status')
      .single();

    if (error && ehColunaAusente(error)) {
      console.warn('[PUBLIC CADASTRO] coluna opcional ausente (migration do censo 20260803160000 ou da carta 20260915120000 não aplicada) — gravando sem elas');
      ({ data, error } = await supabase
        .from('mem_cadastros_pendentes')
        .insert(semColunasOpcionais(payload))
        .select('id, status')
        .single());
    }

    if (error) {
      console.error('[PUBLIC CADASTRO] insert error:', error.message);
      return res.status(500).json({ error: 'Não foi possível registrar seu cadastro.' });
    }

    await registrarObservacaoSegura({
      membroId: duplicadoDeId,
      origem: 'membresia_formulario', origemId: data.id,
      nome: nome.trim(), cpf: cpfLimpo, email: emailLimpo,
      telefone: telefoneLimpo, dataNascimento: data_nascimento,
      dados: { status: data.status },
    });






    let censoResultado = null;
    if (ehCenso && duplicadoDeId) {
      try {
        const { reconciliarCenso } = require('../services/censoReconciliar');



















        const contatoProvado = matchedBy === 'token_censo';















        if (!contatoProvado && (emailLimpo || telefoneLimpo)) {
          registrarContatoDaPorta(
            duplicadoDeId,
            { telefone: telefoneLimpo || null, email: emailLimpo || null },
            'censo',
          );












          const camposContato = [
            emailLimpo ? 'email' : null,
            telefoneLimpo ? 'telefone' : null,
          ].filter(Boolean).join(', ');
          supabase.from('mem_historico').insert({
            membro_id: duplicadoDeId,
            tipo: 'outro',
            descricao: `[censo] contato de porta anônima acumulado (sem token pessoal): ${camposContato} (cadastro ${data.id})`,
            created_at: new Date().toISOString(),
          }).then(({ error: eHist }) => {
            if (eHist) console.warn('[PUBLIC CADASTRO censo] histórico do contato não gravado:', eHist.message);
          }, (e) => console.warn('[PUBLIC CADASTRO censo] histórico do contato não gravado:', e?.message));
        }

        censoResultado = await reconciliarCenso({
          membroId: duplicadoDeId,
          matchedBy,
          origemId: data.id,
          dados: {
            ...(contatoProvado ? { email: emailLimpo, telefone: telefoneLimpo } : {}),
            data_nascimento,
            estado_civil, endereco, bairro, cidade, cep, profissao,
          },
        });




        const semConflito = censoResultado.acao === 'aplicado'
          || censoResultado.acao === 'sem_mudanca';
        const patch = semConflito
          ? { status: 'aplicado', censo_conflitos: null }
          : { censo_conflitos: censoResultado.conflitos?.length ? censoResultado.conflitos : null };

        let { error: ePatch } = await supabase
          .from('mem_cadastros_pendentes').update(patch).eq('id', data.id);
        if (ePatch && ehColunaAusente(ePatch)) {


          ePatch = null;
        }
        if (ePatch) console.error('[PUBLIC CADASTRO censo patch]', ePatch.message);
        else if (semConflito) data.status = 'aplicado';



        const { error: eCob } = await supabase
          .from('mem_membros')
          .update({
            censo_respondido_em: new Date().toISOString(),
            censo_vinculo_declarado: vinculo_declarado || null,
          })
          .eq('id', duplicadoDeId);
        if (eCob && !ehColunaAusente(eCob)) {
          console.error('[PUBLIC CADASTRO censo cobertura]', eCob.message);
        }















        if (whatsapp_optin) {
          const { error: eOptin } = await supabase
            .from('mem_membros')
            .update({ whatsapp_optin: true, whatsapp_optin_em: new Date().toISOString() })
            .eq('id', duplicadoDeId)
            .or('whatsapp_optin.is.null,whatsapp_optin.eq.false');
          if (eOptin && !ehColunaAusente(eOptin)) {
            console.error('[PUBLIC CADASTRO censo optin]', eOptin.message);
          }
        }
      } catch (censoErr) {
        console.error('[PUBLIC CADASTRO censo]', censoErr.message);
      }














      if (duplicadoDeId && cpfLimpo) {
        try {
          const { reconciliarCpfTardio } = require('../services/cpfReconciliar');
          const rCpf = await reconciliarCpfTardio({
            membroId: duplicadoDeId,
            cpf: cpfLimpo,
            origem: matchedBy === 'token_censo' ? 'censo_link_pessoal' : 'censo_formulario',
            origemId: data.id,
            dataNascimento: data_nascimento || null,
            confianca: (matchedBy === 'cpf' || matchedBy === 'token_censo') ? 'forte' : 'fraca',
          });
          if (rCpf?.acao && !['consolidado', 'ja_tinha'].includes(rCpf.acao)) {
            console.warn('[PUBLIC CADASTRO censo cpf]', rCpf.acao);
          }
        } catch (cpfErr) {


          console.error('[PUBLIC CADASTRO censo cpf]', cpfErr.message);
        }
      }
    }








    if (data.status !== 'aplicado') {
      notificar({
        modulo: 'membresia',
        tipo: 'novo_cadastro',
        titulo: ehCenso ? 'Censo · cadastro para revisar' : 'Novo cadastro de membresia',
        mensagem: ehCenso
          ? `${nome.trim()} respondeu o censo e o cadastro precisa de revisão${censoResultado?.conflitos?.length ? ` (${censoResultado.conflitos.length} campo(s) em conflito)` : ''}.`
          : `${nome.trim()} enviou um cadastro pelo formulário público.`,





        link: ehCenso
          ? `/ministerial/membresia?tab=cadastros&status=${data.status === 'duplicado' ? 'duplicado' : 'pendente'}`
          : '/ministerial/membresia?tab=cadastros&status=pendente',
        severidade: 'info',
        chaveDedup: `novo_cadastro_${data.id}`,
      }).catch(err => console.error('[PUBLIC CADASTRO] notificação falhou:', err.message));
    }



    if (grupo_id) {
      try {
        const pedidoBase = {
          grupo_id,
          nome: nome.trim(),
          email: emailLimpo,
          telefone: telefone || null,
          origem: 'cadastro_interno',
          observacao: grupo_observacao ? String(grupo_observacao).slice(0, 500) : null,
          status: 'pendente',
        };
        if (duplicadoDeId) {
          pedidoBase.membro_id = duplicadoDeId;
        } else {
          pedidoBase.cadastro_pendente_id = data.id;
        }
        const { data: pedido } = await supabase.from('mem_grupo_pedidos').insert(pedidoBase).select('id').single();
        if (pedido) {




          const { data: grupo } = await supabase.from('mem_grupos').select('nome').eq('id', grupo_id).maybeSingle();


          await avisarPedidoNovoNoApp({
            grupoId: grupo_id, pedidoId: pedido.id,
            grupoNome: grupo?.nome, pessoaNome: nome,
          });
          donosDoGrupo(grupo_id).then((donos) => {
            if (!donos.length) return;
            return notificar({
              modulo: 'grupos',
              tipo: 'pedido_grupo',
              titulo: `Novo pedido para ${grupo?.nome || 'grupo'}`,
              mensagem: `${nome.trim()} pediu para entrar no grupo via cadastro de membresia.`,
              link: '/grupos/pedidos',
              severidade: 'aviso',
              chaveDedup: `pedido_grupo_${pedido.id}`,
              targetIds: donos,
            });
          }).catch(err => console.error('[PUBLIC CADASTRO pedido grupo notify]', err.message));
        }
      } catch (pedidoErr) {

        console.error('[PUBLIC CADASTRO pedido grupo]', pedidoErr.message);
      }
    }

























    let accountCreated = false;
    let canLoginDevocional = false;
    if (senha && emailLimpo && !req.contaPorEmailEstourou) {
      try {

        let authUserId = null;




        let authUserNovo = false;




        const existing = await acharAuthUserPorEmail(emailLimpo);
        if (existing) {
          authUserId = existing.id;





        } else {
          const { data: created, error: createErr } = await supabase.auth.admin.createUser({
            email: emailLimpo,








            email_confirm: false,






            user_metadata: {
              full_name: nome.trim(),
              name: nome.trim(),
              source: 'membresia_publica',
              cadastro_pendente_id: data.id,
            },
          });
          if (createErr) {
            console.error('[PUBLIC CADASTRO] createUser:', createErr.message);
          } else {
            authUserId = created.user?.id;
            authUserNovo = !!authUserId;
          }
        }


        if (authUserId) {
          const { data: profileExistente } = await supabase
            .from('profiles')
            .select('id, membro_id, name')
            .eq('id', authUserId)
            .maybeSingle();

          if (!profileExistente) {
            await supabase.from('profiles').insert({
              id: authUserId,
              email: emailLimpo,
              name: nome.trim(),
              role: null,






              membro_id: null,
              is_membro_only: true,
              active: true,
            });
          } else {


            const patch = {};



            if (ehNomeDerivadoDeEmail(profileExistente.name, emailLimpo)) patch.name = nome.trim();
            if (Object.keys(patch).length) {
              await supabase.from('profiles').update(patch).eq('id', authUserId);
            }










            const membroDoLogin = profileExistente.membro_id;
            if (membroDoLogin) {
              const { data: mem } = await supabase.from('mem_membros')
                .select('id, nome, email').eq('id', membroDoLogin).maybeSingle();
              if (mem && ehNomeDerivadoDeEmail(mem.nome, mem.email || emailLimpo)) {
                const { error: eNome } = await supabase.from('mem_membros')
                  .update({ nome: nome.trim() }).eq('id', mem.id).eq('nome', mem.nome);
                if (eNome) console.error('[PUBLIC CADASTRO] corrigir nome do membro:', eNome.message);
                else console.log(`[PUBLIC CADASTRO] nome derivado do e-mail corrigido: ${mem.nome} -> ${nome.trim()}`);
              }
            }
          }
          accountCreated = true;


























          if (authUserNovo) {
            const envioLink = await enviarLinkDeAcesso({
              email: emailLimpo,
              redirectTo: `${getFrontendUrl()}/redefinir-senha`,
              nome: nome.trim(),
              assunto: 'Seu acesso · Comunidade Batista do Rio',
              chamada: 'Recebemos seu cadastro. Para criar sua senha e usar o aplicativo da igreja, toque no botão abaixo — ele já abre você logado.',
              textoBotao: 'Criar minha senha',
              rodape: 'O link é pessoal e vale por pouco tempo. Se não foi você que se cadastrou, pode ignorar este e-mail.',
              tag: 'PUBLIC CADASTRO',
            });
            if (!envioLink.ok) console.error('[PUBLIC CADASTRO] link de acesso nao saiu:', envioLink.motivo);
          }



          canLoginDevocional = false;
        }
      } catch (accErr) {

        console.error('[PUBLIC CADASTRO] criar conta falhou:', accErr.message);
      }
    }





    res.status(201).json({
      ok: true,
      id: data.id,
      account_created: accountCreated,
      can_login_devocional: canLoginDevocional,
      ...(ehCenso ? { censo_atualizado: !!duplicadoDeId } : {}),
    });
  } catch (e) {
    console.error('[PUBLIC CADASTRO] exception:', e.message);
    res.status(500).json({ error: 'Erro ao processar cadastro.' });
  }
});










function primeiroNome(nomeCompleto) {
  if (!nomeCompleto) return 'Membro';
  const parts = String(nomeCompleto).trim().split(/\s+/);
  return parts[0] || 'Membro';
}

function memberQrToken(cpfLimpo) {
  const salt = process.env.MEM_QR_SALT || 'cbrio-mem-v1';
  return crypto.createHash('sha256').update(salt + cpfLimpo).digest('hex').slice(0, 24);
}

function memberIdFromCpf(cpfLimpo) {

  const hash = crypto.createHash('sha256').update(cpfLimpo).digest('hex').slice(0, 8).toUpperCase();
  return `CBR-M-${hash}`;
}



async function registerQrToken(token, cpfLimpo) {
  try {
    await supabase
      .from('mem_qrcodes')
      .upsert({ token, cpf: cpfLimpo }, { onConflict: 'token' });
  } catch (err) {
    console.error('[PUBLIC MEM WALLET] registerQrToken falhou:', err.message);
  }
}



async function lookupCadastro(cpfLimpo, dataNascimento) {
  if (!cpfLimpo || cpfLimpo.length !== 11 || !dataNascimento) {
    return { found: false };
  }


  const { data: membro } = await supabase
    .from('mem_membros')
    .select('id, nome, data_nascimento, active')
    .eq('cpf', cpfLimpo)
    .eq('active', true)
    .maybeSingle();
  if (membro && membro.data_nascimento === dataNascimento) {
    return { found: true, nome: membro.nome, pending: false };
  }


  const { data: pendente } = await supabase
    .from('mem_cadastros_pendentes')
    .select('id, nome, data_nascimento')
    .eq('cpf', cpfLimpo)
    .maybeSingle();
  if (pendente && pendente.data_nascimento === dataNascimento) {
    return { found: true, nome: pendente.nome, pending: true };
  }

  return { found: false };
}




router.post('/wallet/verify', lookupLimiter, async (req, res) => {
  try {
    const { cpf, data_nascimento } = req.body || {};
    const cleanCpf = soDigitos(cpf);
    if (!cpfValido(cleanCpf)) return res.status(400).json({ error: 'CPF invalido' });
    if (!data_nascimento) return res.status(400).json({ error: 'Data de nascimento obrigatória' });

    const r = await lookupCadastro(cleanCpf, data_nascimento);
    if (!r.found) {

      return res.json({ found: false });
    }
    res.json({ found: true, nome: primeiroNome(r.nome), pending: r.pending });
  } catch (e) {
    console.error('[PUBLIC MEM WALLET] verify error:', e.message);
    res.status(500).json({ error: 'Erro ao verificar cadastro' });
  }
});




router.post('/wallet/qr-token', lookupLimiter, async (req, res) => {
  try {
    const { cpf, data_nascimento } = req.body || {};
    const cleanCpf = soDigitos(cpf);
    if (!cpfValido(cleanCpf)) return res.status(400).json({ error: 'CPF invalido' });
    if (!data_nascimento) return res.status(400).json({ error: 'Data de nascimento obrigatória' });

    const r = await lookupCadastro(cleanCpf, data_nascimento);
    if (!r.found) return res.status(404).json({ error: 'Cadastro não encontrado' });

    const qr = memberQrToken(cleanCpf);
    await registerQrToken(qr, cleanCpf);

    res.json({
      qr,
      memberId: memberIdFromCpf(cleanCpf),
      nome: r.nome,
    });
  } catch (e) {
    console.error('[PUBLIC MEM WALLET] qr-token error:', e.message);
    res.status(500).json({ error: 'Erro ao gerar QR' });
  }
});



router.post('/wallet/google', lookupLimiter, async (req, res) => {
  try {
    const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID;
    const serviceAccountEmail = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL;
    const rawKey = process.env.GOOGLE_WALLET_PRIVATE_KEY || '';
    const privateKey = rawKey.replace(/\\n/g, '\n');

    if (!issuerId || !serviceAccountEmail || !privateKey) {
      return res.status(503).json({ error: 'Google Wallet não configurado' });
    }

    const { cpf, data_nascimento } = req.body || {};
    const cleanCpf = soDigitos(cpf);
    if (!cpfValido(cleanCpf)) return res.status(400).json({ error: 'CPF invalido' });
    if (!data_nascimento) return res.status(400).json({ error: 'Data de nascimento obrigatória' });

    const r = await lookupCadastro(cleanCpf, data_nascimento);
    if (!r.found) return res.status(404).json({ error: 'Cadastro não encontrado' });

    const jwt = require('jsonwebtoken');
    const qrToken = memberQrToken(cleanCpf);
    const memberId = memberIdFromCpf(cleanCpf);
    await registerQrToken(qrToken, cleanCpf);

    const classId = `${issuerId}.cbrio_membro_v1`;

    const objectId = `${issuerId}.mem_${qrToken}`;

    const frontendUrl = (process.env.FRONTEND_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')).replace(/\/+$/, '');
    const logoUrl = frontendUrl ? `${frontendUrl}/logo-cbrio-text.png` : 'https://sistema-cbrio.vercel.app/logo-cbrio-text.png';

    const genericObject = {
      id: objectId,
      classId,
      genericType: 'GENERIC_OTHER',
      hexBackgroundColor: '#408097',
      logo: {
        sourceUri: { uri: logoUrl },
        contentDescription: { defaultValue: { language: 'pt-BR', value: 'CBRio' } },
      },
      cardTitle: { defaultValue: { language: 'pt-BR', value: 'CBRio' } },
      subheader: { defaultValue: { language: 'pt-BR', value: 'MEMBRO' } },
      header: { defaultValue: { language: 'pt-BR', value: r.nome || 'Membro' } },
      textModulesData: [
        { id: 'membro_id', header: 'MEMBRO ID', body: memberId },
      ],
      barcode: { type: 'QR_CODE', value: qrToken, alternateText: memberId },
      state: 'ACTIVE',
    };

    const claims = {
      iss: serviceAccountEmail,
      aud: 'google',
      typ: 'savetowallet',
      iat: Math.floor(Date.now() / 1000),
      payload: { genericObjects: [genericObject] },
    };

    const token = jwt.sign(claims, privateKey, { algorithm: 'RS256' });
    res.json({ url: `https://pay.google.com/gp/v/save/${token}`, memberId });
  } catch (err) {
    console.error('[PUBLIC MEM WALLET] google error:', err.message);
    res.status(500).json({ error: err.message });
  }
});



router.post('/wallet/apple', lookupLimiter, async (req, res) => {
  try {
    const { buildMembroPass } = require('../services/appleWallet');
    const { cpf, data_nascimento } = req.body || {};
    const cleanCpf = soDigitos(cpf);
    if (!cpfValido(cleanCpf)) return res.status(400).json({ error: 'CPF invalido' });
    if (!data_nascimento) return res.status(400).json({ error: 'Data de nascimento obrigatória' });

    const r = await lookupCadastro(cleanCpf, data_nascimento);
    if (!r.found) return res.status(404).json({ error: 'Cadastro não encontrado' });

    const qrToken = memberQrToken(cleanCpf);
    const memberId = memberIdFromCpf(cleanCpf);
    await registerQrToken(qrToken, cleanCpf);

    const pkpassBuffer = await buildMembroPass({
      nome: r.nome,
      qrToken,
      memberId,
      pending: r.pending,
    });

    res.setHeader('Content-Type', 'application/vnd.apple.pkpass');
    res.setHeader('Content-Disposition', `attachment; filename="cbrio-membro.pkpass"`);
    res.send(pkpassBuffer);
  } catch (err) {
    console.error('[PUBLIC MEM WALLET] apple error:', err.message);
    res.status(503).json({ error: 'Apple Wallet indisponível no momento. Use o QR acima.' });
  }
});

module.exports = router;
