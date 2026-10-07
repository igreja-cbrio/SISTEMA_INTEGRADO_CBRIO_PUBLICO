import { useEffect, useState, type CSSProperties } from 'react';

















const MARGEM_PX = 8;


const LIMIAR_TECLADO_PX = 150;

export function useTecladoVirtual(): { estilo: CSSProperties; tecladoAberto: boolean } {
  const [estilo, setEstilo] = useState<CSSProperties>({});
  const [tecladoAberto, setTecladoAberto] = useState(false);

  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;

    const recalcular = () => {
      const aberto = window.innerHeight - vv.height > LIMIAR_TECLADO_PX;
      setTecladoAberto(aberto);
      if (!aberto) { setEstilo({}); return; }
      setEstilo({
        top: `${Math.round(vv.offsetTop + MARGEM_PX)}px`,
        transform: 'translate(-50%, 0)',
        maxHeight: `${Math.round(vv.height - MARGEM_PX * 2)}px`,
        overflowY: 'auto',
      });
    };

    recalcular();
    vv.addEventListener('resize', recalcular);
    vv.addEventListener('scroll', recalcular);
    return () => {
      vv.removeEventListener('resize', recalcular);
      vv.removeEventListener('scroll', recalcular);
    };
  }, []);

  return { estilo, tecladoAberto };
}



export function rolarCampoParaVista(e: { target: EventTarget | null }) {
  const el = e.target as HTMLElement | null;
  if (!el || typeof el.scrollIntoView !== 'function') return;
  window.setTimeout(() => {
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, 350);
}
