










export const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];


export function hojeBRT(agora: Date = new Date()): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(agora);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${v('year')}-${v('month')}-${v('day')}`;
}

const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;


export function mensagemLiberada(data: string | undefined | null, hoje: string): boolean {
  if (!data || !DIA_RE.test(data) || !DIA_RE.test(hoje)) return false;
  return data <= hoje;
}

export type StatusSerie = 'em_breve' | 'acontecendo' | 'concluida';


export function statusSerie(ano: number, mes: number, hoje: string): StatusSerie {
  if (!DIA_RE.test(hoje)) return 'em_breve';
  const alvo = `${ano}-${String(mes).padStart(2, '0')}`;
  const atual = hoje.slice(0, 7);
  if (alvo > atual) return 'em_breve';
  if (alvo === atual) return 'acontecendo';
  return 'concluida';
}


export function dataLonga(data: string): string {
  if (!DIA_RE.test(data)) return '';
  const [, m, d] = data.split('-');
  return `${Number(d)} de ${MESES[Number(m) - 1].toLowerCase()}`;
}


export function youtubeId(v: string | undefined | null): string | null {
  if (!v) return null;
  const s = v.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(/(?:v=|youtu\.be\/|\/live\/|\/shorts\/|\/embed\/)([\w-]{11})/);
  return m ? m[1] : null;
}
