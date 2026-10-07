


import { useEffect, useState } from 'react';
import { modoDoQuadro } from '@/lib/censoCruzamento';

const ler = (): 'lateral' | 'flutuante' =>
  (typeof window === 'undefined' ? 'flutuante' : modoDoQuadro(window.innerWidth));

export function useModoQuadroCenso() {
  const [modo, setModo] = useState<'lateral' | 'flutuante'>(ler);
  useEffect(() => {
    const onResize = () => setModo(ler());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return modo;
}
