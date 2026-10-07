





















export const HORAS_APOS_INICIO = 4;



export function fimDaJanelaQr(
  data: string | null | undefined,
  hora: string | null | undefined,
  horas: number = HORAS_APOS_INICIO,
): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(data ?? '').slice(0, 10));
  if (!d) return null;
  const ano = Number(d[1]);
  const mes = Number(d[2]);
  const dia = Number(d[3]);
  const h = /^(\d{1,2}):(\d{2})/.exec(String(hora ?? ''));

  if (!h) return new Date(ano, mes - 1, dia, 23, 59, 59, 999);
  const fim = new Date(ano, mes - 1, dia, Number(h[1]), Number(h[2]), 0, 0);
  fim.setHours(fim.getHours() + horas);
  return fim;
}








export function cultoEncerrado(
  data: string | null | undefined,
  hora: string | null | undefined,
  agora: Date = new Date(),
  horas: number = HORAS_APOS_INICIO,
): boolean {
  const fim = fimDaJanelaQr(data, hora, horas);
  if (!fim) return false;
  return agora.getTime() > fim.getTime();
}
