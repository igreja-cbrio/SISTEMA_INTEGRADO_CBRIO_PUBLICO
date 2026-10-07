






















const crypto = require('crypto');
const { supabase } = require('../utils/supabase');
const {
  acharMembroGuardado, acharOuCriarGuardado, ehNomeDerivadoDeEmail,
  ehNomePlaceholder, normalizarCpf, normalizarTelefone, registrarContatoDaPorta,
} = require('./membroMatch');
const { cpfValido, validarCamposPadrao } = require('./inscricaoContrato');
const { notificar } = require('./notificar');
const { enviarEmail, isConfigured: emailConfigurado } = require('./email');

const CODIGO_TTL_MIN = 10;
const MAX_TENTATIVAS = 5;


const MAX_ENVIOS_DIA_POR_DESTINO = 5;











const RE_SCHEMA_AUSENTE = /(does not exist|could not find|schema cache|42703|42P01|PGRST20[24])/i;
const schemaAusente = (e) =>
  RE_SCHEMA_AUSENTE.test(`${e?.code || ''} ${e?.message || ''} ${e?.details || ''}`);

const hashCodigo = (codigo, salId) =>
  crypto.createHash('sha256').update(`${codigo}:${salId}`).digest('hex');


function gerarCodigo() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}



function mascararTelefone(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length < 8) return null;
  const ddd = d.length >= 10 ? d.slice(-11, -9) || d.slice(0, 2) : null;
  const fim = d.slice(-4);
  return ddd ? `(${ddd}) *****-${fim}` : `*****-${fim}`;
}




function mascararEmail(raw) {
  const email = String(raw || '').trim().toLowerCase();
  const at = email.lastIndexOf('@');
  if (at < 1) return null;
  const local = email.slice(0, at);
  const dominio = email.slice(at);
  if (local.length <= 4) return `${local[0]}***${dominio}`;
  return `${local.slice(0, 3)}***${local.slice(-2)}${dominio}`;
}



const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'del', 'di', 'van', 'von']);
function mascararNome(nome) {
  const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return null;
  return [
    partes[0],
    ...partes.slice(1).map(p => (PARTICULAS.has(p.toLowerCase()) ? p : `${p[0].toUpperCase()}.`)),
  ].join(' ');
}



async function ehCadastroFantasma(membroId, email) {
  if (!membroId) return false;
  const { data: m } = await supabase.from('mem_membros')
    .select('id, nome, cpf, telefone, data_nascimento, origem_cadastro')
    .eq('id', membroId).maybeSingle();
  if (!m) return false;
  if (m.cpf || m.telefone || m.data_nascimento) return false;
  const nomeFraco = ehNomePlaceholder(m.nome)
    || (email ? ehNomeDerivadoDeEmail(m.nome, email) : false);
  return m.origem_cadastro === 'auth' || nomeFraco;
}




async function fundirFantasma(fantasmaId, realId, quem) {
  if (!fantasmaId || !realId || fantasmaId === realId) return { fundido: false };
  try {


    const { error } = await supabase.rpc('merge_membros', {
      p_keep_id: realId, p_merge_ids: [fantasmaId],
      p_feito_por: quem || null,
      p_observacao: 'App · conta vinculada ao cadastro real (fantasma do gatilho de auth)',
    });
    if (error) throw error;
    return { fundido: true };
  } catch (e) {
    console.error('[appIdentidade] merge do fantasma falhou:', e.message);
    return { fundido: false, erro: e.message };
  }
}


async function vincularProfile({ authUserId, email, membroId }) {
  const { data: prof } = await supabase.from('profiles')
    .select('id, membro_id').eq('id', authUserId).maybeSingle();
  const anterior = prof?.membro_id || null;
  const { error } = await supabase.from('profiles')
    .update({ membro_id: membroId }).eq('id', authUserId);
  if (error) throw error;
  let fusao = { fundido: false };
  if (anterior && anterior !== membroId && await ehCadastroFantasma(anterior, email)) {
    fusao = await fundirFantasma(anterior, membroId, authUserId);
  }
  return { anterior, fusao };
}


async function identificarPorCpf({ cpf, authUserId, email, ip }) {
  const limpo = normalizarCpf(cpf);
  if (!limpo || !cpfValido(limpo)) {
    return { ok: false, status: 400, codigo: 'cpf_invalido', error: 'Confira o CPF digitado.' };
  }


  const { data: achados } = await supabase.from('mem_membros')
    .select('id, nome, telefone, email').eq('cpf', limpo).is('deleted_at', null).limit(2);
  const membro = (achados || [])[0] || null;



  if (!membro) {
    return { ok: true, encontrado: false, motivo: 'nao_encontrado' };
  }
  const semCanal = (motivo) => ({
    ok: true, encontrado: true, pode_confirmar: false, motivo,
    nome_mascarado: mascararNome(membro.nome),
  });

  const emailCadastro = String(membro.email || '').trim().toLowerCase();
  if (!emailCadastro) return semCanal('sem_email');
  if (!emailConfigurado()) return semCanal('sem_canal');






  const { data: mesmoEmail } = await supabase.from('mem_membros')
    .select('id').ilike('email', emailCadastro).is('deleted_at', null).neq('id', membro.id).limit(1);
  if (mesmoEmail && mesmoEmail.length) return semCanal('email_compartilhado');


  const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count, error: eCount } = await supabase.from('app_verificacoes')
    .select('*', { count: 'exact', head: true })
    .eq('email', emailCadastro).gte('created_at', desde);
  if (eCount) {
    if (schemaAusente(eCount)) {
      console.error('[appIdentidade] migration pendente — caminho rápido off');
      return semCanal('sem_canal');
    }
    throw eCount;
  }
  if ((count || 0) >= MAX_ENVIOS_DIA_POR_DESTINO) {
    return { ok: false, status: 429, codigo: 'muitos_envios',
      error: 'Já enviamos vários códigos pra este e-mail hoje. Tente amanhã ou preencha seus dados.' };
  }


  await supabase.from('app_verificacoes')
    .update({ consumido_em: new Date().toISOString() })
    .eq('auth_user_id', authUserId).is('consumido_em', null);

  const codigo = gerarCodigo();
  const { data: linha, error: eIns } = await supabase.from('app_verificacoes').insert({
    auth_user_id: authUserId, membro_id: membro.id,
    email: emailCadastro,
    telefone: normalizarTelefone(membro.telefone) || null,
    codigo_hash: 'pendente',
    expira_em: new Date(Date.now() + CODIGO_TTL_MIN * 60 * 1000).toISOString(),
    canal: 'email', ip: ip || null,
  }).select('id').single();
  if (eIns) throw eIns;

  await supabase.from('app_verificacoes')
    .update({ codigo_hash: hashCodigo(codigo, linha.id) }).eq('id', linha.id);


  const envio = await enviarEmail({
    to: emailCadastro,
    subject: `${codigo} é seu código de acesso · CBRio`,
    text: `Seu código de verificação é ${codigo}.\n\n`
      + `Use no app da CBRio pra confirmar que é você. Por segurança, não compartilhe este código.\n`
      + `Expira em ${CODIGO_TTL_MIN} minutos.\n\n`
      + `Se você não pediu, ignore este e-mail — nada muda na sua conta.`,
    html: `<div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:480px">
      <p style="font-size:15px;color:#334">Seu código de verificação é:</p>
      <p style="font-size:34px;font-weight:800;letter-spacing:6px;color:#00839D;margin:12px 0">${codigo}</p>
      <p style="font-size:14px;color:#556">Use no app da CBRio pra confirmar que é você.
      Por segurança, não compartilhe este código. Expira em ${CODIGO_TTL_MIN} minutos.</p>
      <p style="font-size:12px;color:#889">Se você não pediu, ignore este e-mail — nada muda na sua conta.</p>
    </div>`,
    fromName: 'CBRio',
  }).catch(e => ({ ok: false, error: e.message }));
  if (!envio?.ok) {
    console.error('[appIdentidade] envio do código falhou:', envio?.error);
    return { ok: false, status: 502, codigo: 'envio_falhou',
      error: 'Não conseguimos enviar o código agora. Tente de novo ou preencha seus dados.' };
  }

  return {
    ok: true, encontrado: true, pode_confirmar: true,
    verificacao_id: linha.id,
    nome_mascarado: mascararNome(membro.nome),
    email_mascarado: mascararEmail(emailCadastro),
    expira_em_min: CODIGO_TTL_MIN,
    canal: 'email',
  };
}

async function confirmarCodigo({ verificacaoId, codigo, authUserId, email }) {
  const cod = String(codigo || '').replace(/\D/g, '');
  if (cod.length !== 6) {
    return { ok: false, status: 400, codigo: 'codigo_invalido', error: 'O código tem 6 números.' };
  }
  const { data: v } = await supabase.from('app_verificacoes')
    .select('*').eq('id', verificacaoId).maybeSingle();

  if (!v || v.auth_user_id !== authUserId || v.consumido_em) {
    return { ok: false, status: 400, codigo: 'nao_encontrada', error: 'Pedido de código inválido. Comece de novo.' };
  }
  if (new Date(v.expira_em).getTime() < Date.now()) {
    return { ok: false, status: 400, codigo: 'expirado', error: 'O código expirou. Peça um novo.' };
  }
  if ((v.tentativas || 0) >= MAX_TENTATIVAS) {
    return { ok: false, status: 429, codigo: 'tentativas', error: 'Muitas tentativas. Peça um código novo.' };
  }
  if (hashCodigo(cod, v.id) !== v.codigo_hash) {
    await supabase.from('app_verificacoes')
      .update({ tentativas: (v.tentativas || 0) + 1 }).eq('id', v.id);
    const restam = MAX_TENTATIVAS - (v.tentativas || 0) - 1;
    return { ok: false, status: 400, codigo: 'codigo_errado',
      error: restam > 0 ? `Código não confere. Você ainda pode tentar ${restam}x.` : 'Código não confere. Peça um novo.' };
  }

  await supabase.from('app_verificacoes')
    .update({ consumido_em: new Date().toISOString() }).eq('id', v.id);
  const { fusao } = await vincularProfile({ authUserId, email, membroId: v.membro_id });













  const { error: eMarca } = await supabase.from('profiles')
    .update({ app_ficha_confirmada_em: new Date().toISOString() })
    .eq('id', authUserId);
  if (eMarca) console.warn('[appIdentidade] marcar app_ficha_confirmada_em (cpf):', eMarca.message);



  if (email) {
    try { registrarContatoDaPorta(v.membro_id, { email }, 'app_login_cpf'); } catch {                 }
  }
  const { data: m } = await supabase.from('mem_membros')
    .select('id, nome, telefone, email, cpf, data_nascimento').eq('id', v.membro_id).maybeSingle();
  return { ok: true, membro: m || null, fantasma_fundido: !!fusao.fundido };
}



















const CONTAS_REVISAO_LOJA = new Set((process.env.APP_REVISAO_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean));


function contaDeRevisaoLoja(email) {
  return CONTAS_REVISAO_LOJA.has(String(email || '').trim().toLowerCase());
}














async function preencherOQuePortaoExige(membroId, d, emailDaConta) {
  const { data: atual, error: eLer } = await supabase.from('mem_membros')
    .select('nome, telefone, cpf, data_nascimento, genero')
    .eq('id', membroId).is('deleted_at', null).maybeSingle();
  if (eLer || !atual) {
    console.warn('[appIdentidade] não consegui ler o cadastro para preencher:', eLer?.message);
    return;
  }

  const patch = {};
  if (!atual.telefone && d.telefone) patch.telefone = d.telefone;
  if (!atual.data_nascimento && d.dataNascimento) patch.data_nascimento = d.dataNascimento;
  if (!atual.genero && d.sexo) patch.genero = d.sexo;



  const { ehNomeDerivadoDeEmail } = require('./membroMatch');
  if (d.nomeCompleto && ehNomeDerivadoDeEmail(atual.nome, emailDaConta || '')) {
    patch.nome = d.nomeCompleto;
  }







  if (!Object.keys(patch).length) return;

  const { error } = await supabase.from('mem_membros')
    .update(patch).eq('id', membroId).is('deleted_at', null);
  if (error) {
    console.warn('[appIdentidade] preencher cadastro:', error.message, Object.keys(patch).join(','));
    return;
  }
  console.log(`[appIdentidade] cadastro completado (${membroId}): ${Object.keys(patch).join(', ')}`);
}

async function completarCadastro({ payload, authUserId, email, ip, userAgent }) {





  const { erros, valores } = validarCamposPadrao({
    nome_completo: payload?.nome_completo,
    telefone: payload?.telefone,
    email: payload?.email || email,
    cpf: payload?.cpf,
    data_nascimento: payload?.data_nascimento,
    sexo: payload?.sexo,
  }, { exigirCpf: !contaDeRevisaoLoja(email), exigirSexo: !contaDeRevisaoLoja(email), exigirEmail: true, exigirNascimento: true });
  const campos = Object.keys(erros || {});
  if (campos.length) {
    return { ok: false, status: 400, codigo: 'campos', campo: campos[0], error: erros[campos[0]], erros };
  }
  const d = valores;




  const r = await acharOuCriarGuardado({
    cpf: d.cpf || null, email: d.email, telefone: d.telefone, nome: d.nomeCompleto,
    dataNascimento: d.dataNascimento || null,




    genero: d.sexo || null,
    status: 'visitante',
    origem: 'app_onboarding',
    origemId: authUserId,
  });
  const membroId = r?.membro_id || null;
  if (!membroId) {
    return { ok: false, status: 500, codigo: 'sem_membro', error: 'Não foi possível salvar seus dados agora.' };
  }
  const { fusao } = await vincularProfile({ authUserId, email, membroId });








  try {
    const { data: au } = await supabase.auth.admin.getUserById(authUserId);
    const freq = au?.user?.user_metadata?.frequenta_area;
    if (freq === 'ami' || freq === 'bridge') {
      await supabase.from('mem_membros')
        .update({ frequenta_area: freq })
        .eq('id', membroId).is('frequenta_area', null).is('deleted_at', null);
    }
  } catch (e) {
    console.warn('[appIdentidade] frequenta_area do metadata:', e.message);
  }























  await preencherOQuePortaoExige(membroId, d, email);





  if (r.created) {
    notificar({
      modulo: 'membresia', tipo: 'cadastro_app',
      titulo: `Cadastro novo pelo app: ${d.nomeCompleto}`,
      mensagem: 'A pessoa se cadastrou pelo app (nome, telefone, e-mail e nascimento). Confira em Membresia.',
      link: '/ministerial/membresia', severidade: 'info',
      chaveDedup: `cadastro_app_${membroId}`,
    }).catch(() => {});
  }







  const { error: eMarca } = await supabase.from('profiles')
    .update({ app_ficha_confirmada_em: new Date().toISOString() })
    .eq('id', authUserId);
  if (eMarca) console.warn('[appIdentidade] marcar app_ficha_confirmada_em:', eMarca.message);

  const { data: m } = await supabase.from('mem_membros')
    .select('id, nome, telefone, email, cpf, data_nascimento').eq('id', membroId).maybeSingle();
  return { ok: true, membro: m || null, criado: !!r.created, fantasma_fundido: !!fusao.fundido };
}

module.exports = {
  contaDeRevisaoLoja,
  preencherOQuePortaoExige,
  identificarPorCpf,
  confirmarCodigo,
  completarCadastro,

  mascararTelefone,
  mascararEmail,
  mascararNome,
  CODIGO_TTL_MIN,
};
