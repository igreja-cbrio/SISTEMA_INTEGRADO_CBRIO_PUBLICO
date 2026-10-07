import { useQuery } from '@tanstack/react-query';
import { voluntariado } from '@/api';
import type { VolService } from '../types';

export function useVolServices() {
  return useQuery<VolService[]>({
    queryKey: ['vol', 'services'],
    queryFn: () => voluntariado.services.list(),
  });
}

export function useUpcomingServices() {
  return useQuery<VolService[]>({
    queryKey: ['vol', 'services', 'upcoming'],
    queryFn: () => voluntariado.services.upcoming(),
  });
}

export function useTodaysServices() {
  return useQuery<VolService[]>({
    queryKey: ['vol', 'services', 'today'],
    queryFn: () => voluntariado.services.today(),
  });
}


















export function ordenarCultosCheckin<T extends { scheduled_at: string }>(
  cultos: T[],
  agora: Date = new Date(),
): T[] {


  const hoje = agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const dia = (s: string) => {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  };
  const futuro = (s: string) => {
    const d = dia(s);


    return d !== '' && d > hoje;
  };
  return [...cultos].sort((a, b) => {
    const fa = futuro(a.scheduled_at);
    const fb = futuro(b.scheduled_at);
    if (fa !== fb) return fa ? 1 : -1;
    const ta = new Date(a.scheduled_at).getTime();
    const tb = new Date(b.scheduled_at).getTime();
    if (Number.isNaN(ta) || Number.isNaN(tb)) return 0;
    return fa ? ta - tb : tb - ta;
  });
}
export function useCheckinServices() {
  return useQuery<VolService[]>({
    queryKey: ['vol', 'services', 'checkin-window'],
    queryFn: async () => {













      const all = (await voluntariado.services.checkinWindow(75, 35)) as VolService[];
      return ordenarCultosCheckin(all);
    },
    staleTime: 60 * 1000,
  });
}
