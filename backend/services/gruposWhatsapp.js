













const { supabase } = require('../utils/supabase');
const { configurado } = require('./whatsappService');


const { enfileirar } = require('./whatsappFila');



const { bloqueioTotalAtivo } = require('./gruposEnviosConfig');




const { quandoComData, ondeComLink } = require('../utils/avisoGrupoAprovado');
const { ehGrupoOnline } = require('../utils/grupoOnline');


const {
  APROV_TTL_MS, RENOV_TTL_MS, CONFIRA_TTL_MS,
  assinarToken, verificarToken,
} = require('../utils/gruposToken');



const WHATSAPP_LIGADO = () => configurado();
const TEMPLATE_LANG = process.env.WHATSAPP_TEMPLATE_LANG || 'pt_BR';



const TPL_NOVO_PEDIDO_LIDER = process.env.WHATSAPP_TEMPLATE_GRUPOS_PEDIDO_LIDER || 'grupos_pedido_novo_lider_v2';
const TPL_PEDIDO_APROVADO = process.env.WHATSAPP_TEMPLATE_GRUPOS_APROVADO || 'grupos_pedido_aprovado_v2';



const TPL_SUGESTAO_GRUPO = process.env.WHATSAPP_TEMPLATE_GRUPOS_SUGESTAO || 'grupos_sugestao_grupo';
const TPL_FREQUENCIA_MES = process.env.WHATSAPP_TEMPLATE_GRUPOS_FREQUENCIA || 'grupos_frequencia_mes';



const TPL_RENOVACAO = process.env.WHATSAPP_TEMPLATE_GRUPOS_RENOVACAO || 'grupos_renovacao_temporada';




const TPL_CONFIRA = process.env.WHATSAPP_TEMPLATE_GRUPOS_CONFIRA || 'grupos_confira_lista';



const TPL_MATERIAL = process.env.WHATSAPP_TEMPLATE_GRUPOS_MATERIAL || null;




const TPL_ABERTURA = process.env.WHATSAPP_TEMPLATE_GRUPOS_ABERTURA || 'abertura_grupos_convite_lider';


const TPL_INSCRICAO_CONFIRMADA = process.env.WHATSAPP_TEMPLATE_INSCRICAO_CONFIRMADA || 'cbrio_inscricao_confirmada';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function rotuloMes(m) {
  const [ano, mes] = String(m || '').split('-').map(Number);
  return (mes >= 1 && mes <= 12) ? `${MESES[mes - 1]}/${ano}` : String(m || '');
}

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];




const RE_BASE_LOCAL = /localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|^https?:\/\/(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/i;
function baseUrl() {
  const candidata = (process.env.FRONTEND_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://cbrio.org')
  ).replace(/\/+$/, '');
  if (RE_BASE_LOCAL.test(candidata)) {
    console.warn('[GruposWPP] FRONTEND_URL local (%s) ignorada em link de WhatsApp — usando https://cbrio.org', candidata);
    return 'https://cbrio.org';
  }
  return candidata;
}







function formatarQuando(grupo) {

  if ((grupo?.recorrencia || '').toLowerCase().trim() === 'diario') {
    return grupo.horario ? `Todos os dias às ${String(grupo.horario).slice(0, 5)}` : 'Todos os dias';
  }
  if (grupo?.dia_semana == null) return 'a combinar';
  const dia = DIAS_SEMANA[grupo.dia_semana] || 'a combinar';
  return grupo.horario ? `${dia} às ${String(grupo.horario).slice(0, 5)}` : dia;
}

function formatarOnde(grupo) {
  const partes = [grupo?.local, grupo?.endereco, grupo?.complemento, grupo?.bairro].filter(Boolean);
  return partes.length ? partes.join(' — ') : 'a combinar';
}














async function montarEnvioNovoPedido({ grupo, pedidoId, pessoa }) {
  if (await bloqueioTotalAtivo()) return { erro: 'bloqueio_total' };
  if (!WHATSAPP_LIGADO()) return { erro: 'disabled' };
  if (!grupo?.lider_id) return { erro: 'sem_lider' };
  const { data: lider } = await supabase.from('mem_membros')
    .select('nome, telefone').eq('id', grupo.lider_id).maybeSingle();
  if (!lider?.telefone) return { erro: 'lider_sem_telefone' };

  let link;
  try {



    link = `${baseUrl()}/g/a/${assinarToken('aprov', pedidoId, { l: grupo.lider_id }, APROV_TTL_MS)}`;
  } catch (e) {
    console.error('[GruposWPP] token não assinado:', e.message);
    return { erro: 'sem_secret' };
  }




  const contato = String(pessoa.contato || '').trim()
    || [pessoa.telefone, pessoa.email].filter(Boolean).join(' · ')
    || 'sem contato';
  return {
    envio: {
      telefone: lider.telefone,
      template: TPL_NOVO_PEDIDO_LIDER,


      params: [
        (lider.nome || '').trim().split(/\s+/)[0] || 'Líder',
        (grupo.nome || '').trim() || 'seu grupo',
        (pessoa.nome || '').trim() || 'Alguém',
        contato,
        link,
      ],
      contexto: 'grupos.pedido_novo_lider',
      refId: pedidoId,
    },
  };
}



async function notificarLiderNovoPedido({ grupo, pedidoId, pessoa }) {
  try {
    const m = await montarEnvioNovoPedido({ grupo, pedidoId, pessoa });
    if (m.erro) return { sent: false, reason: m.erro };
    const r = await enfileirar(m.envio);
    if (!r.sent) console.log('[GruposWPP] template líder não enviado:', r.reason || r.status);
    return r;
  } catch (e) {
    console.error('[GruposWPP] notificarLiderNovoPedido:', e.message);
    return { sent: false, reason: 'exception' };
  }
}























async function agendaEDoGrupo(grupo) {
  const out = {};
  if (!grupo?.id) return out;
  try {
    const { proximoEncontro } = require('../utils/agendaGrupo');
    const { ancoraDoGrupo } = require('./sugestaoGrupoAgenda');

    const { ancoraISO, estimada } = await ancoraDoGrupo(grupo);




    const { data: exc, error: eExc } = await supabase
      .from('mem_grupo_agenda_excecoes')
      .select('data_original, status, nova_data, novo_horario')
      .eq('grupo_id', grupo.id);
    if (eExc) throw eExc;

    const prox = proximoEncontro({
      diaSemana: grupo.dia_semana, horario: grupo.horario,
      recorrencia: grupo.recorrencia, ancoraISO, excecoes: exc || [],
    });
    out.proximaISO = prox?.data || null;
    out.proximoHorario = prox?.horario || null;

    out.estimada = Boolean(estimada || prox?.ancora_incerta);
  } catch (e) {
    console.warn('[GruposWPP] agenda do grupo indisponivel:', e.message);
  }

  try {
    const { data } = await supabase.from('mem_grupo_link')
      .select('link').eq('grupo_id', grupo.id).maybeSingle();
    out.link = data?.link || null;
  } catch (e) {
    console.warn('[GruposWPP] link da sala indisponivel:', e.message);
  }
  return out;
}

async function notificarPessoaAprovada({ telefone, grupo, liderNome, liderTelefone, optin, pedidoId = null }) {
  try {
    if (await bloqueioTotalAtivo()) return { sent: false, reason: 'bloqueio_total' };
    if (!telefone) return { sent: false, reason: 'pessoa_sem_telefone' };
    if (optin === false) return { sent: false, reason: 'sem_optin' };



    const extra = await agendaEDoGrupo(grupo);
    const r = await enfileirar({
      telefone,
      template: TPL_PEDIDO_APROVADO,
      params: [
        (grupo?.nome || '').trim() || 'seu grupo',
        quandoComData({
          diaSemana: grupo?.dia_semana, horario: grupo?.horario,
          recorrencia: grupo?.recorrencia,
          proximaISO: extra.proximaISO, proximoHorario: extra.proximoHorario, estimada: extra.estimada,
        }),
        ondeComLink({
          partes: [grupo?.local, grupo?.endereco, grupo?.complemento, grupo?.bairro],
          online: ehGrupoOnline(grupo), linkOnline: extra.link,
        }),
        (liderNome || '').trim() || 'o líder do grupo',
        (liderTelefone || '').trim() || 'em breve pelo WhatsApp',
      ],
      contexto: 'grupos.pedido_aprovado',



      refId: pedidoId,
    });
    if (!r.sent) console.log('[GruposWPP] template aprovado não enviado:', r.reason || r.status);
    return r;
  } catch (e) {
    console.error('[GruposWPP] notificarPessoaAprovada:', e.message);
    return { sent: false, reason: 'exception' };
  }
}












function sanitizarMotivo(motivo) {
  return String(motivo || '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

async function notificarPessoaSugestao({ telefone, pessoaNome, grupoOriginalNome, grupoSugerido, pedidoId, motivo }) {
  try {
    if (await bloqueioTotalAtivo()) return { sent: false, reason: 'bloqueio_total' };


    if (!WHATSAPP_LIGADO()) return { sent: false, reason: 'disabled' };
    if (!telefone) return { sent: false, reason: 'pessoa_sem_telefone' };
    let link;
    try {
      link = `${baseUrl()}/g/s/${assinarToken('suges', pedidoId, { g: grupoSugerido.id })}`;
    } catch (e) {
      console.error('[GruposWPP] token não assinado:', e.message);
      return { sent: false, reason: 'sem_secret' };
    }
    const sugeridoResumo = [
      (grupoSugerido?.nome || '').trim() || 'outro grupo',
      formatarQuando(grupoSugerido) !== 'a combinar' ? formatarQuando(grupoSugerido) : null,
      formatarOnde(grupoSugerido) !== 'a combinar' ? formatarOnde(grupoSugerido) : null,
    ].filter(Boolean).join(' — ');


    const motivoTxt = sanitizarMotivo(motivo);
    const mensagemSugestao = motivoTxt
      ? `${motivoTxt} — a liderança indicou um grupo com vagas para você.`
      : 'a liderança indicou um grupo com vagas para você.';
    const r = await enfileirar({
      telefone,
      template: TPL_SUGESTAO_GRUPO,
      params: [
        (pessoaNome || '').trim().split(/\s+/)[0] || 'Olá',
        (grupoOriginalNome || '').trim() || 'grupo escolhido',
        mensagemSugestao,
        sugeridoResumo,
        link,
      ],
      contexto: 'grupos.sugestao_grupo',
      refId: pedidoId,
    });
    if (!r.sent) console.log('[GruposWPP] template sugestão não enviado:', r.reason || r.status);
    return r;
  } catch (e) {
    console.error('[GruposWPP] notificarPessoaSugestao:', e.message);
    return { sent: false, reason: 'exception' };
  }
}







function montarEnvioFrequencia({ grupo, lider, mes }) {
  if (!WHATSAPP_LIGADO()) return { erro: 'disabled' };
  if (!lider?.telefone) return { erro: 'lider_sem_telefone' };
  let link;
  try {
    link = `${baseUrl()}/g/f/${assinarToken('freq', grupo.id, { m: mes, l: grupo.lider_id })}`;
  } catch (e) {
    console.error('[GruposWPP] token não assinado:', e.message);
    return { erro: 'sem_secret' };
  }
  return {
    envio: {
      telefone: lider.telefone,
      template: TPL_FREQUENCIA_MES,
      params: [
        (lider.nome || '').trim().split(/\s+/)[0] || 'Líder',
        rotuloMes(mes),
        (grupo.nome || '').trim() || 'seu grupo',
        link,
      ],
      contexto: 'grupos.frequencia_mes',
      refId: grupo.id,
    },
  };
}


async function notificarLiderFrequencia({ grupo, lider, mes }) {
  try {
    if (await bloqueioTotalAtivo()) return { sent: false, reason: 'bloqueio_total' };
    const m = montarEnvioFrequencia({ grupo, lider, mes });
    if (m.erro) return { sent: false, reason: m.erro };
    const r = await enfileirar(m.envio);
    if (!r.sent) console.log('[GruposWPP] template frequência não enviado:', r.reason || r.status);
    return r;
  } catch (e) {
    console.error('[GruposWPP] notificarLiderFrequencia:', e.message);
    return { sent: false, reason: 'exception' };
  }
}









function montarEnvioRenovacao({ grupo, lider, temporada, renovacaoId, geracao }) {
  if (!WHATSAPP_LIGADO()) return { erro: 'disabled' };
  if (!lider?.telefone) return { erro: 'lider_sem_telefone' };
  let link;
  try {
    link = `${baseUrl()}/g/r/${assinarToken('renov', grupo.id, {
      r: renovacaoId, g: geracao || 1, l: grupo.lider_id,
    }, RENOV_TTL_MS)}`;
  } catch (e) {
    console.error('[GruposWPP] token não assinado:', e.message);
    return { erro: 'sem_secret' };
  }
  return {
    envio: {
      telefone: lider.telefone,
      template: TPL_RENOVACAO,
      params: [
        (lider.nome || '').trim().split(/\s+/)[0] || 'Líder',
        (temporada?.label || temporada?.id || 'nova temporada'),
        (grupo.nome || '').trim() || 'seu grupo',
        link,
      ],
      contexto: 'grupos.renovacao_temporada',
      refId: renovacaoId,
    },
  };
}











function montarEnvioConfira({ grupo, lider, conferenciaId, geracao, qtd }) {
  if (!WHATSAPP_LIGADO()) return { erro: 'disabled' };
  if (!lider?.telefone) return { erro: 'lider_sem_telefone' };
  let link;
  try {
    link = `${baseUrl()}/g/c/${assinarToken('conf', grupo.id, {
      c: conferenciaId, g: geracao || 1, l: grupo.lider_id,
    }, CONFIRA_TTL_MS)}`;
  } catch (e) {
    console.error('[GruposWPP] token não assinado:', e.message);
    return { erro: 'sem_secret' };
  }
  return {
    envio: {
      telefone: lider.telefone,
      template: TPL_CONFIRA,
      params: [
        (lider.nome || '').trim().split(/\s+/)[0] || 'Líder',
        (grupo.nome || '').trim() || 'seu grupo',


        String(Number.isFinite(qtd) ? qtd : 0),
        link,
      ],
      contexto: 'grupos.confira_lista',
      refId: conferenciaId,
    },
  };
}






function montarEnvioMaterial({ lider, link, titulo }) {
  if (!WHATSAPP_LIGADO()) return { erro: 'disabled' };
  if (!lider?.telefone) return { erro: 'lider_sem_telefone' };
  if (!TPL_MATERIAL) return { erro: 'sem_template' };
  return {
    envio: {
      telefone: lider.telefone,
      template: TPL_MATERIAL,
      params: [
        (lider.nome || '').trim().split(/\s+/)[0] || 'Líder',
        (titulo || 'Material do grupo').slice(0, 120),
        link || '',
      ],
      contexto: 'grupos.material',
      refId: null,
    },
  };
}






function montarEnvioAbertura({ lider }) {
  if (!WHATSAPP_LIGADO()) return { erro: 'disabled' };
  if (!lider?.telefone) return { erro: 'lider_sem_telefone' };
  return {
    envio: {
      telefone: lider.telefone,
      template: TPL_ABERTURA,
      params: [ (lider.nome || '').trim().split(/\s+/)[0] || 'Líder' ],
      contexto: 'grupos.abertura_convite',
      refId: null,
    },
  };
}




async function enviarInscricaoConfirmada({ telefone, nome, grupoNome, pedidoId }) {
  try {
    if (await bloqueioTotalAtivo()) return { sent: false, reason: 'bloqueio_total' };
    if (!telefone) return { sent: false, reason: 'pessoa_sem_telefone' };
    const r = await enfileirar({
      telefone,
      template: TPL_INSCRICAO_CONFIRMADA,
      params: [
        (nome || '').trim().split(/\s+/)[0] || 'Olá',
        (grupoNome || '').trim() || 'um grupo de conexão',
      ],
      contexto: 'grupos.inscricao_confirmada',
      refId: pedidoId,
    });
    if (!r.sent) console.log('[GruposWPP] inscrição confirmada não enviada agora:', r.reason || '(na fila)');
    return r;
  } catch (e) {
    console.error('[GruposWPP] enviarInscricaoConfirmada:', e.message);
    return { sent: false, reason: 'exception' };
  }
}

module.exports = {
  baseUrl,
  assinarToken,
  verificarToken,
  formatarQuando,
  formatarOnde,
  rotuloMes,
  montarEnvioNovoPedido,
  notificarLiderNovoPedido,
  notificarPessoaAprovada,
  notificarPessoaSugestao,
  montarEnvioFrequencia,
  notificarLiderFrequencia,
  montarEnvioRenovacao,
  montarEnvioConfira,
  montarEnvioMaterial,
  montarEnvioAbertura,
  enviarInscricaoConfirmada,
};
