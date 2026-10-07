



















const HORAS_TIMER = 3;
const HORAS_JANELA = 24;
const MARGEM_CRON_MIN = 65;
const DIAS_INATIVIDADE = 7;

const H = 3_600_000;
const MIN = 60_000;

function ms(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}


function janelaFechaMs(c) {
  const inb = ms(c?.last_inbound_at);
  return inb === null ? null : inb + HORAS_JANELA * H;
}


function limitePesquisaMs(c) {
  const fim = janelaFechaMs(c);
  return fim === null ? null : fim - MARGEM_CRON_MIN * MIN;
}





function planoFinalizar(c, agoraMs = Date.now()) {
  const janelaFim = janelaFechaMs(c);
  if (janelaFim === null || janelaFim <= agoraMs) {
    return { modo: 'agora_sem_pesquisa', encerraEm: null, reduzido: false };
  }
  const alvo = agoraMs + HORAS_TIMER * H;
  const fim = Math.min(alvo, limitePesquisaMs(c));
  if (fim <= agoraMs) {
    return { modo: 'agora_com_pesquisa', encerraEm: null, reduzido: true };
  }
  return { modo: 'timer', encerraEm: new Date(fim).toISOString(), reduzido: fim < alvo };
}


function encerramentoPendente(c) {
  if (!c || c.resolvida) return false;
  const desde = ms(c.encerrar_desde);
  if (desde === null) return false;
  const inb = ms(c.last_inbound_at);
  return inb === null || inb <= desde;
}


function encerraEm(c) {
  if (!encerramentoPendente(c)) return null;
  const alvo = ms(c.encerrar_desde) + HORAS_TIMER * H;
  const limite = limitePesquisaMs(c);
  return new Date(limite === null ? alvo : Math.min(alvo, limite)).toISOString();
}


function pesquisaPermitida(c, agoraMs = Date.now()) {
  const fim = janelaFechaMs(c);
  return fim !== null && agoraMs < fim;
}





function motivoEncerramento(c, agoraMs = Date.now()) {
  if (!c || c.resolvida) return null;
  const em = encerraEm(c);
  if (em && agoraMs >= ms(em)) return 'finalizar';
  const ult = ms(c.last_message_at);
  if (ult !== null && agoraMs - ult >= DIAS_INATIVIDADE * 86_400_000) return 'inatividade';
  return null;
}

module.exports = {
  HORAS_TIMER, HORAS_JANELA, MARGEM_CRON_MIN, DIAS_INATIVIDADE,
  planoFinalizar, encerramentoPendente, encerraEm, pesquisaPermitida, motivoEncerramento,
};
