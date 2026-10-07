import { useEffect } from 'react';





















export function usePermitirZoom() {
  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return undefined;
    const antes = meta.getAttribute('content');
    meta.setAttribute('content', 'width=device-width, initial-scale=1');
    return () => {
      if (antes !== null) meta.setAttribute('content', antes);
    };
  }, []);
}
