





import { useEffect, useState } from 'react';

export function useOverlayAberto() {
  const [estado, setEstado] = useState({ aberto: false, drawerEsquerdo: false });

  useEffect(() => {
    function checar() {
      const dialog = document.querySelector('[data-state="open"][role="dialog"]');
      const drawerEsquerdo = !!document.querySelector('[data-state="open"][role="dialog"][data-side="left"]');
      setEstado(prev => {
        const aberto = !!dialog;
        if (prev.aberto === aberto && prev.drawerEsquerdo === drawerEsquerdo) return prev;
        return { aberto, drawerEsquerdo };
      });
    }
    checar();
    const observer = new MutationObserver(checar);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-state', 'data-side', 'role'],
      childList: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, []);

  return estado;
}
