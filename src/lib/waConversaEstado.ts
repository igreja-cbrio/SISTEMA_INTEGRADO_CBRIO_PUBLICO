













export type ConversaEstado = {
  resolvida: boolean;
  last_message_at: string | null;
  last_inbound_at: string | null;
};

export type Vista = 'abertas' | 'sem_resposta' | 'finalizadas';

export const LIMITE_SEM_RESPOSTA_H = 48;

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

export function semResposta(c: ConversaEstado): boolean {
  if (!c || c.resolvida) return false;
  const inb = ms(c.last_inbound_at);
  if (inb === null) return false;
  const ult = ms(c.last_message_at);
  return ult === null || inb >= ult;
}


export function horasSemResposta(c: ConversaEstado, agoraMs: number = Date.now()): number | null {
  const inb = ms(c?.last_inbound_at);
  if (inb === null) return null;
  return Math.max(0, (agoraMs - inb) / 3_600_000);
}

export function vencida(horas: number | null): boolean {
  return horas !== null && horas >= LIMITE_SEM_RESPOSTA_H;
}


export function rotuloIdade(horas: number | null): string {
  if (horas === null) return '';
  if (horas < 1) return `há ${Math.max(1, Math.floor(horas * 60))}min`;
  if (horas < 24) return `há ${Math.floor(horas)}h`;
  return `há ${Math.floor(horas / 24)}d`;
}






export function aplicarVista<T extends ConversaEstado>(lista: T[], vista: Vista): T[] {
  const arr = Array.isArray(lista) ? lista : [];
  if (vista === 'finalizadas') return arr.filter(c => c.resolvida);
  if (vista === 'sem_resposta') {
    return arr.filter(semResposta).sort((a, b) => (ms(a.last_inbound_at) ?? 0) - (ms(b.last_inbound_at) ?? 0));
  }
  return arr.filter(c => !c.resolvida);
}

export function contarVistas(lista: ConversaEstado[], agoraMs: number = Date.now()) {
  const arr = Array.isArray(lista) ? lista : [];
  const abertas = arr.filter(c => !c.resolvida);
  const sem = abertas.filter(semResposta);
  const vencidas = sem.filter(c => vencida(horasSemResposta(c, agoraMs))).length;
  return { abertas: abertas.length, sem_resposta: sem.length, vencidas };
}






export const HORAS_TIMER = 3;
export const HORAS_JANELA = 24;
export const MARGEM_CRON_MIN = 65;

export function encerraEmFinalizar(
  c: ConversaEstado & { encerrar_desde?: string | null },
): string | null {
  if (!c || c.resolvida) return null;
  const desde = ms(c.encerrar_desde);
  if (desde === null) return null;
  const inb = ms(c.last_inbound_at);
  if (inb !== null && inb > desde) return null;
  const alvo = desde + HORAS_TIMER * 3_600_000;
  if (inb === null) return new Date(alvo).toISOString();
  const limite = inb + HORAS_JANELA * 3_600_000 - MARGEM_CRON_MIN * 60_000;
  return new Date(Math.min(alvo, limite)).toISOString();
}
