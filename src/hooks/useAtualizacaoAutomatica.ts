















import { useEffect, useRef, useState } from 'react';

export const INTERVALO_PADRAO_MS = 60_000;

export function useAtualizacaoAutomatica(
  recarregar: () => Promise<unknown> | void,
  { intervaloMs = INTERVALO_PADRAO_MS, ativo = true }: { intervaloMs?: number; ativo?: boolean } = {},
) {
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const ref = useRef(recarregar);
  ref.current = recarregar;

  useEffect(() => {
    if (!ativo) return undefined;
    let vivo = true;
    const rodar = async () => {
      if (!vivo || typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      try { await ref.current(); if (vivo) setAtualizadoEm(new Date()); } catch {                        }
    };
    const timer = setInterval(rodar, intervaloMs);
    const aoVoltar = () => { if (document.visibilityState === 'visible') rodar(); };
    document.addEventListener('visibilitychange', aoVoltar);
    window.addEventListener('focus', aoVoltar);



    return () => {
      vivo = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', aoVoltar);
      window.removeEventListener('focus', aoVoltar);
    };
  }, [intervaloMs, ativo]);

  return { atualizadoEm, marcarAtualizado: () => setAtualizadoEm(new Date()) };
}

export function horaCurta(d: Date | null) {
  return d ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
}
