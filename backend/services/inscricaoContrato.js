









const { supabase } = require('../utils/supabase');
const {
  cpfValido, normalizarCpf, normalizarTelefone, normalizarEmail,
  registrarObservacaoSegura,
} = require('./identidadeProgressiva');
const { acharOuCriarGuardado, acharMembroGuardado, registrarContatoDaPorta } = require('./membroMatch');



const {
  tirarCodigoPaisTelefone, emailValido, validarNascimento,
  CONECTIVOS_NOME, temAbreviacaoNome,
} = require('../utils/camposContato');

const SEXOS = ['masculino', 'feminino'];


const TEXTOS = {
  termos_lgpd:
    'Autorizo a Igreja CBRio a tratar os dados informados neste formulário ' +
    '(incluindo endereço IP e navegador, para segurança) com a finalidade de ' +
    'organizar a atividade em que estou me inscrevendo e me comunicar sobre ela, ' +
    'conforme a LGPD. Posso solicitar acesso, correção ou exclusão dos meus dados ' +
    'a qualquer momento pelos canais da igreja.',
  menor_responsavel:
    'Declaro que sou pai, mãe ou responsável legal da(s) criança(s) informada(s) ' +
    'e autorizo o tratamento dos dados pessoais dela(s) (nome, data de nascimento) ' +
    'pela Igreja CBRio, exclusivamente para organização da apresentação de crianças ' +
    'e comunicação relacionada, conforme a LGPD (art. 14). Sei que posso solicitar ' +
    'acesso, correção ou exclusão desses dados a qualquer momento.',






  menor_responsavel_inscricao:
    'Declaro que sou o responsável legal pela pessoa inscrita, que ela é menor de ' +
    '18 anos, e autorizo a inscrição dela nesta atividade e o tratamento dos dados ' +
    'informados (dela e meus, como contato de emergência) pela Igreja CBRio, ' +
    'exclusivamente para organizar a atividade e me comunicar sobre ela, conforme a ' +
    'LGPD (art. 14). Sei que posso solicitar acesso, correção ou exclusão desses ' +
    'dados a qualquer momento pelos canais da igreja.',
  imagem:
    'Autorizo o uso de fotos do evento em que eu (ou a criança sob minha ' +
    'responsabilidade) apareça nas mídias da Igreja CBRio.',


  whatsapp:
    'Aceito receber confirmações, lembretes e avisos desta inscrição pelo ' +
    'WhatsApp, no número informado. Posso pedir pra parar a qualquer momento.',
  aviso_optin:
    'Se você não marcar, não conseguiremos te enviar confirmações, lembretes e avisos pelo WhatsApp.',
};















function splitNomeCompleto(nomeCompleto) {
  const partes = String(nomeCompleto || '').trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  return { nome: partes[0] || '', sobrenome: partes.slice(1).join(' ') };
}

function honeypotPreenchido(body) {
  return Boolean(String((body && body.website) || '').trim());
}






function validarCamposPadrao(body = {}, opts = {}) {
  const {
    exigirCpf = true, exigirEmail = true, exigirNascimento = true, exigirSexo = true,
  } = opts;
  const erros = {};

  const nomeCompleto = String(body.nome_completo ?? body.nome ?? '').trim().replace(/\s+/g, ' ');
  if (nomeCompleto.length < 5 || nomeCompleto.split(' ').length < 2) {
    erros.nome_completo = 'Informe o nome completo.';
  } else if (temAbreviacaoNome(nomeCompleto)) {
    erros.nome_completo = 'Escreva o nome completo, sem abreviações.';
  }




  const telefone = tirarCodigoPaisTelefone(String(body.telefone || '').replace(/\D/g, ''));
  if (telefone.length < 10 || telefone.length > 11) erros.telefone = 'Informe um telefone válido com DDD.';

  const cpf = normalizarCpf(body.cpf);
  if (exigirCpf && !cpf) erros.cpf = 'Informe um CPF válido.';

  const email = normalizarEmail(body.email);
  const emailOk = Boolean(email && emailValido(email));
  if (exigirEmail && !emailOk) erros.email = 'Informe um e-mail válido.';
  else if (!exigirEmail && body.email && !emailOk) erros.email = 'E-mail inválido.';

  const dataNascimento = validarNascimento(body.data_nascimento);
  if (exigirNascimento && !dataNascimento) erros.data_nascimento = 'Informe uma data de nascimento válida.';

  const sexo = String(body.sexo ?? body.genero ?? '').trim().toLowerCase();
  if (exigirSexo && !SEXOS.includes(sexo)) erros.sexo = 'Selecione masculino ou feminino.';

  const endereco = String(body.endereco || '').trim().slice(0, 300) || null;
  const { nome, sobrenome } = splitNomeCompleto(nomeCompleto);

  return {
    erros,
    valores: {
      nomeCompleto,
      nome,
      sobrenome,
      telefone,
      cpf: cpf || null,
      email: emailOk ? email : null,
      dataNascimento: dataNascimento || null,
      sexo: SEXOS.includes(sexo) ? sexo : null,
      endereco,
    },
  };
}




async function processarIdentidade({
  nomeCompleto, cpf, email, telefone, dataNascimento, genero,
  politica = 'ligar', status = 'visitante', origem, origemId = null,
  soChaveForte = false, extra = {},
}) {
  if (politica === 'criar') {
    const r = await acharOuCriarGuardado(



      { cpf, email, telefone, nome: nomeCompleto, dataNascimento, genero, status, extra, origem, origemId },
      { soChaveForte },
    );
    return { membroId: (r && r.membro_id) || null, matchedBy: (r && r.matched_by) || null, created: Boolean(r && r.created) };
  }
  const r = await acharMembroGuardado(
    { cpf, email, telefone, nome: nomeCompleto, dataNascimento },
    { soChaveForte },
  );
  const membroId = (r && r.membro_id) || null;













  if (membroId) {


    try {
      registrarContatoDaPorta(membroId, { telefone, email }, 'porta');
    } catch (e) {
      console.error('[inscricaoContrato] contato da porta não registrado:', e.message);
    }











    const matchedBy = (r && r.matched_by) || null;
    if (cpf && matchedBy && matchedBy !== 'cpf') {
      try {
        const { reconciliarCpfTardio } = require('./cpfReconciliar');
        const { normalizarCpf } = require('./membroMatch');
        const cpf11 = normalizarCpf(cpf);
        if (cpf11) {
          await reconciliarCpfTardio({
            membroId, cpf: cpf11, origem: `porta:${origem || 'inscricao'}`, origemId,
            dataNascimento,
            confianca: matchedBy === 'nome+nascimento' ? 'forte' : 'fraca',
          });
        }
      } catch (e) {
        console.error('[inscricaoContrato] cpf tardio não consolidado:', e.message);
      }
    }
  }

  try {
    await registrarObservacaoSegura({
      membroId, origem, origemId, nome: nomeCompleto, cpf, telefone, email, dataNascimento,
    });
  } catch (e) {
    console.error('[inscricaoContrato] observação de identidade falhou:', e.message);
  }
  return { membroId, matchedBy: (r && r.matched_by) || null, created: false };
}



async function registrarConsentimentos({ porta, refId, membroId = null, ip = null, userAgent = null, itens = [] }) {
  const linhas = (itens || [])
    .filter((i) => i && i.tipo)
    .map((i) => ({
      porta,
      ref_id: refId,
      membro_id: membroId,
      tipo: i.tipo,
      texto: String(i.texto ?? TEXTOS[i.tipo] ?? ''),
      aceito: Boolean(i.aceito),
      ip_origem: ip ? String(ip).slice(0, 100) : null,
      user_agent: userAgent ? String(userAgent).slice(0, 300) : null,
    }));
  if (!linhas.length) return { ok: true, gravados: 0 };
  const { error } = await supabase.from('inscricao_consentimentos').insert(linhas);
  if (error) {
    console.error('[inscricaoContrato] gravação de consentimentos falhou:', error.message);
    return { ok: false, gravados: 0 };
  }
  return { ok: true, gravados: linhas.length };
}

module.exports = {
  tirarCodigoPaisTelefone,
  SEXOS,
  TEXTOS,
  temAbreviacaoNome,
  validarNascimento,
  splitNomeCompleto,
  honeypotPreenchido,
  emailValido,
  validarCamposPadrao,
  processarIdentidade,
  registrarConsentimentos,

  cpfValido,
  normalizarCpf,
  normalizarTelefone,
  normalizarEmail,
};
