











const { supabase } = require('../utils/supabase');
const { enviarEmail, isConfigured } = require('./email');
const { notificar } = require('./notificar');
const { basePublica } = require('../utils/linkInscricaoApp');
const { estadoFicha, ehContratada } = require('../utils/fichaContratada');
const { montarRodada, diaBRT } = require('../utils/fichaCobranca');
const crypto = require('crypto');

const DIAS_VALIDADE = 30;
const TETO_RODADA = 40;

const COLUNAS = 'id, nome, email, telefone, cargo, tipo_contrato, status, '
  + 'ficha_contratada, ficha_contratada_token, ficha_contratada_expira_em, ficha_contratada_cobrancas';


const STATUS_ELEGIVEIS = ['ativo', 'em_admissao', 'ferias', 'licenca'];

async function listarCandidatos() {
  const { data, error } = await supabase
    .from('rh_funcionarios')
    .select(COLUNAS)
    .is('deleted_at', null)
    .in('status', STATUS_ELEGIVEIS);
  if (error) return { erro: error.message };


  const candidatos = (data || []).filter((f) => ehContratada(f.tipo_contrato));












  const emails = [...new Set(candidatos.map((f) => String(f.email || '').trim().toLowerCase()).filter(Boolean))];
  const porEmail = new Map();
  for (let i = 0; i < emails.length; i += 200) {
    const { data: ps, error: e2 } = await supabase
      .from('profiles').select('id, email, active').in('email', emails.slice(i, i + 200));
    if (e2) { console.warn('[ficha cobranca] não resolvi contas:', e2.message); break; }
    for (const p of (ps || [])) {
      if (p.active !== false) porEmail.set(String(p.email || '').toLowerCase(), p.id);
    }
  }
  for (const f of candidatos) {
    f.profile_id = porEmail.get(String(f.email || '').trim().toLowerCase()) || null;
  }
  return { candidatos };
}








async function garantirToken(func) {
  const valeAinda = func.ficha_contratada_token
    && func.ficha_contratada_expira_em
    && new Date(func.ficha_contratada_expira_em) > new Date();
  if (valeAinda) {
    return { url: `${basePublica()}/ficha-contratada/${func.ficha_contratada_token}` };
  }
  const token = func.ficha_contratada_token || crypto.randomBytes(24).toString('base64url');
  const expira = new Date();
  expira.setDate(expira.getDate() + DIAS_VALIDADE);
  const { error } = await supabase.from('rh_funcionarios')
    .update({ ficha_contratada_token: token, ficha_contratada_expira_em: expira.toISOString() })
    .eq('id', func.id);
  if (error) return { erro: error.message };
  return { url: `${basePublica()}/ficha-contratada/${token}` };
}

function assunto(rodada) {
  return rodada === 1
    ? 'CBRio · ficha cadastral da sua empresa'
    : 'CBRio · lembrete: ficha cadastral da sua empresa';
}

function corpo({ nome, url, rodada, faltando }) {
  const primeiro = String(nome || '').trim().split(/\s+/)[0] || '';
  const abre = rodada === 1
    ? 'Para seguir com o seu contrato de prestação de serviços e com os pagamentos, precisamos dos dados da sua empresa.'
    : 'Passando para lembrar: ainda estamos esperando os dados da sua empresa.';



  const oQueFalta = (faltando && faltando.length)
    ? `<p style="margin:0 0 16px"><b>Falta preencher:</b> ${faltando.join(', ')}.</p>`
    : '';
  return `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;color:#12303a;line-height:1.6">
      <p style="margin:0 0 16px">Olá${primeiro ? `, ${primeiro}` : ''}!</p>
      <p style="margin:0 0 16px">${abre}</p>
      ${oQueFalta}
      <p style="margin:0 0 24px">É rápido — leva uns 3 minutos:</p>
      <p style="margin:0 0 24px">
        <a href="${url}" style="background:#00B39D;color:#04222A;text-decoration:none;padding:13px 22px;border-radius:9px;font-weight:700;display:inline-block">Preencher a ficha</a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:#5b7780">Ou copie este endereço: ${url}</p>
      <p style="margin:0;font-size:13px;color:#5b7780">O pagamento depende desta ficha estar completa. Qualquer dúvida, é só responder este e-mail.</p>
    </div>`;
}













async function dispararCobranca({ seco = false, agora = new Date() } = {}) {
  const r = await listarCandidatos();
  if (r.erro) return { erro: r.erro };




  const temTemplateWhatsapp = false;

  const rodada = montarRodada(r.candidatos, {
    agora, temTemplateWhatsapp, teto: TETO_RODADA, estadoDe: estadoFicha,
  });



  const alguemPeloSistema = rodada.enviar.some((e) => e.canais.includes('sistema'));
  const canalOk = isConfigured() || alguemPeloSistema;
  if (!canalOk) {



    return {
      erro: 'canal_de_email_nao_configurado',
      detalhe: 'Nenhum e-mail sairia. Configure o Microsoft Graph antes de disparar.',
      elegiveis: rodada.enviar.length,
      resumo: rodada.resumo,
    };
  }

  if (seco) {
    return {
      seco: true,
      elegiveis: rodada.enviar.length,
      adiados: rodada.adiados,
      resumo: rodada.resumo,
      exemplo: rodada.enviar.slice(0, 5).map((e) => ({
        nome: e.func.nome, rodada: e.rodada, canais: e.canais,
      })),
    };
  }

  let enviados = 0;
  const falhas = [];

  for (const item of rodada.enviar) {
    const { func } = item;
    const link = await garantirToken(func);
    if (link.erro) { falhas.push({ nome: func.nome, motivo: 'link: ' + link.erro }); continue; }

    const estado = estadoFicha(func);
    const saiu = [];



    if (item.canais.includes('sistema') && func.profile_id) {
      try {
        await notificar({
          modulo: 'rh',
          tipo: 'ficha_contratada_pendente',
          titulo: item.rodada === 1 ? 'Preencha a ficha da sua empresa' : 'Lembrete · ficha da sua empresa',
          mensagem: estado.faltando.length && estado.preenchida
            ? `Falta preencher: ${estado.faltando.join(', ')}.`
            : 'Precisamos dos dados da sua empresa para o contrato e os pagamentos.',
          link: `/ficha-contratada/${link.url.split('/').pop()}`,
          severidade: 'alerta',



          targetIds: [func.profile_id],
          chaveDedup: `ficha_pendente:${func.id}:r${item.rodada}`,
        });
        saiu.push('sistema');
      } catch (e) {
        console.warn('[ficha cobranca] notificação falhou:', func.nome, e.message);
      }
    }

    if (item.canais.includes('email')) {
      const res = await enviarEmail({
        to: func.email,
        subject: assunto(item.rodada),
        html: corpo({ nome: func.nome, url: link.url, rodada: item.rodada, faltando: estado.faltando }),
      });
      if (res && res.ok !== false) saiu.push('email');
      else falhas.push({ nome: func.nome, motivo: (res && res.error) || 'falha no e-mail' });
    }




    if (!saiu.length) continue;

    const cobrancas = Array.isArray(func.ficha_contratada_cobrancas) ? func.ficha_contratada_cobrancas : [];
    const { error } = await supabase.from('rh_funcionarios').update({
      ficha_contratada_cobrancas: [...cobrancas, {


        em: new Date().toISOString(), canais: saiu, rodada: item.rodada, dia: diaBRT(agora),
      }],
      ficha_contratada_enviado_em: new Date().toISOString(),
    }).eq('id', func.id);




    if (error) falhas.push({ nome: func.nome, motivo: 'enviado mas NÃO registrado: ' + error.message });
    enviados += 1;
  }

  return {
    enviados,
    adiados: rodada.adiados,
    falhas,
    resumo: rodada.resumo,
    canal: 'email',

    whatsapp: 'sem_template_aprovado',
  };
}

module.exports = { listarCandidatos, dispararCobranca, garantirToken, TETO_RODADA };
