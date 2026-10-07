import { useAuth } from '@/contexts/AuthContext';




















export function useVolPodeEscrever(nivelMinimo = 3): boolean {
  const { canAccessModule, modulePerms } = useAuth() as {
    canAccessModule: (nomes: string[], tipo?: string, nivelMinimo?: number) => boolean;
    modulePerms: Record<string, unknown> | null | undefined;
  };




  if (!modulePerms) return true;


  return canAccessModule(['voluntariado', 'Voluntariado'], 'escrita', nivelMinimo);
}
