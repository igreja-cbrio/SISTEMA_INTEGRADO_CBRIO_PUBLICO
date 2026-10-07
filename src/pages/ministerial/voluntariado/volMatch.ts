









import type { VolCheckIn, VolSchedule } from './types';

export const normName = (s?: string | null) =>
  (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();



export const dateOfSP = (iso?: string | null): string | null => {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  } catch {
    return iso.slice(0, 10);
  }
};








export function blocoDoServico(nome?: string | null): string | null {
  const n = (nome || '').toLowerCase().trim();
  const m = (re: RegExp) => re.test(n);






  if (m(/^domingo - manh/) || m(/^cbkids - manh/) || m(/^domingo 08/) || m(/^domingo 09/) || m(/^domingo 10/) || m(/^domingo 11/)) return 'Domingo Manhã';
  if (m(/^domingo - noite/) || m(/^cbkids - noite/) || m(/^domingo 18/) || m(/^domingo 19/) || m(/^domingo 20/)) return 'Domingo Noite';
  if (m(/^quarta/) || m(/^cbkids - quarta/)) return 'Quarta';
  if (m(/^ami/) || m(/^culto ami/)) return 'AMI';
  if (m(/bridge/)) return 'Bridge';
  return null;
}


export function ciMatchesSched(ci: VolCheckIn, sch: VolSchedule): boolean {
  if (ci.schedule_id && sch.id && ci.schedule_id === sch.id) return true;
  if (ci.volunteer_id && sch.volunteer_id && ci.volunteer_id === sch.volunteer_id) return true;
  const pc = ci.volunteer?.planning_center_id;
  if (pc && sch.planning_center_person_id && pc === sch.planning_center_person_id) return true;
  const n = normName(ci.volunteer?.full_name);
  const sn = normName(sch.volunteer_name);
  if (n && sn && n === sn) return true;
  return false;
}
