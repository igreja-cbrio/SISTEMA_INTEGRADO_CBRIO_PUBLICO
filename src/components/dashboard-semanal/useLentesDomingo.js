









import { useQuery } from '@tanstack/react-query';
import { dashboardSemanal as api } from '../../api';

export default function useLentesDomingo() {
  return useQuery({
    queryKey: ['dash-sem', 'lentes-domingo'],
    queryFn: () => api.lentesDomingo({ semanas: 16 }),
    staleTime: 60_000,
    retry: 1,
  });
}
