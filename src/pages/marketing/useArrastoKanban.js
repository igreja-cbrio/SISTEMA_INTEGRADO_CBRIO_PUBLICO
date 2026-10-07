import { useCallback, useEffect, useRef, useState } from 'react';
import {
  iniciarArrasto, moverArrasto, decidirSoltura, velocidadeAutoScroll,
} from '../../lib/arrastoKanban';













export function useArrastoKanban({ onMover, aceitaColuna, habilitado = true }) {
  const [arrasto, setArrasto] = useState(null);
  const arrastoRef = useRef(null);
  const fantasmaRef = useRef(null);
  const containerRef = useRef(null);
  const rafRef = useRef(0);
  const [colunaSobre, setColunaSobre] = useState(null);

  arrastoRef.current = arrasto;

  const limpar = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }






    fantasmaRef.current = null;
    setArrasto(null);
    arrastoRef.current = null;
    setColunaSobre(null);
    document.body.style.removeProperty('user-select');
  }, []);




  useEffect(() => {
    if (!arrasto?.ativo) return undefined;
    let vivo = true;
    const passo = () => {
      if (!vivo) return;
      const cont = containerRef.current;
      const e = arrastoRef.current;
      if (cont && e) {
        const r = cont.getBoundingClientRect();
        const v = velocidadeAutoScroll(e.x, { left: r.left, right: r.right });
        if (v !== 0) cont.scrollLeft += v;
      }
      rafRef.current = requestAnimationFrame(passo);
    };
    rafRef.current = requestAnimationFrame(passo);
    return () => { vivo = false; if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [arrasto?.ativo]);

  const colunaSob = useCallback((x, y) => {
    const f = fantasmaRef.current;
    const visivel = f?.style.display;
    if (f) f.style.display = 'none';
    const el = document.elementFromPoint(x, y);
    if (f) f.style.display = visivel || '';
    const col = el?.closest?.('[data-coluna]');
    return col?.getAttribute('data-coluna') || null;
  }, []);

  const aoPressionar = useCallback((ev, card) => {
    if (!habilitado) return;

    if (ev.pointerType === 'mouse' && ev.button !== 0) return;

    if (ev.target?.closest?.('button, a, [role="menuitem"], input, textarea, select')) return;
    setArrasto(iniciarArrasto({
      pointerId: ev.pointerId,
      cardId: card.id,
      estadoOrigem: card.estado,
      x: ev.clientX,
      y: ev.clientY,
    }));
  }, [habilitado]);



  useEffect(() => {
    if (!arrasto) return undefined;

    const mover = (ev) => {
      if (ev.pointerId !== arrastoRef.current?.pointerId) return;
      const prox = moverArrasto(arrastoRef.current, ev.clientX, ev.clientY);
      arrastoRef.current = prox;
      setArrasto(prox);
      if (!prox?.ativo) return;

      if (ev.cancelable) ev.preventDefault();
      document.body.style.setProperty('user-select', 'none');
      if (fantasmaRef.current) {
        fantasmaRef.current.style.transform = `translate(${ev.clientX + 8}px, ${ev.clientY + 8}px)`;
      }
      setColunaSobre(colunaSob(ev.clientX, ev.clientY));
    };

    const soltar = (ev) => {
      const atual = arrastoRef.current;
      if (!atual || ev.pointerId !== atual.pointerId) return;
      const alvo = atual.ativo ? colunaSob(ev.clientX, ev.clientY) : null;
      const decisao = decidirSoltura(atual, alvo, aceitaColuna);
      limpar();
      if (decisao.acao === 'mover') onMover?.(decisao.cardId, decisao.para);
      else if (decisao.acao === 'clique') onMover?.(decisao.cardId, null);
    };

    const cancelar = () => limpar();

    window.addEventListener('pointermove', mover, { passive: false });
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', cancelar);
    return () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      window.removeEventListener('pointercancel', cancelar);
    };
  }, [arrasto, colunaSob, aceitaColuna, onMover, limpar]);

  return {
    arrasto,
    arrastando: !!arrasto?.ativo,
    cardArrastado: arrasto?.ativo ? arrasto.cardId : null,
    colunaSobre,
    containerRef,
    fantasmaRef,
    aoPressionar,
  };
}
