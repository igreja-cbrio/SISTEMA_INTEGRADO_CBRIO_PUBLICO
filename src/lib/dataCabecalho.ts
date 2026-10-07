





const FUSO = 'America/Sao_Paulo';

export function rotuloDataCabecalho(agora: Date = new Date()): string {
  if (!(agora instanceof Date) || Number.isNaN(agora.getTime())) return '';
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO, weekday: 'long', day: '2-digit', month: '2-digit',
  }).formatToParts(agora);
  const parte = (tipo: string) => partes.find(p => p.type === tipo)?.value || '';

  const dia = parte('weekday').split('-')[0];
  return `${dia} ${parte('day')}-${parte('month')}`;
}
