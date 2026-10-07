import { useCallback, useEffect, useRef } from 'react';






const Z_MIN = 0.2;
const Z_MAX = 2;
const clampZ = (z) => Math.max(Z_MIN, Math.min(Z_MAX, z));


export const TOQUE_LONGO_MS = 550;
export const TOQUE_TOLERANCIA_PX = 8;



export function pontoNoCanvas({ clientX, clientY } = {}, rect, vista) {
  const zoom = Number(vista?.zoom);
  if (!rect || !(zoom > 0) || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
  return {
    x: (clientX - rect.left - (Number(vista.x) || 0)) / zoom,
    y: (clientY - rect.top - (Number(vista.y) || 0)) / zoom,
  };
}




export function useCanvasPanZoom(ativo = true, { toqueLongo = false } = {}) {
  const viewportRef = useRef(null);
  const canvasRef = useRef(null);
  const labelRef = useRef(null);
  const t = useRef({ zoom: 1, x: 0, y: 0 });
  const moved = useRef(false);

  const apply = useCallback(() => {
    const { zoom, x, y } = t.current;
    if (canvasRef.current) canvasRef.current.style.transform = `translate(${x}px,${y}px) scale(${zoom})`;
    if (labelRef.current) labelRef.current.textContent = `${Math.round(zoom * 100)}%`;
  }, []);

  const zoomAt = useCallback((nz, cx, cy) => {
    const cur = t.current;
    const z = clampZ(nz);
    t.current = { zoom: z, x: cx - (cx - cur.x) * (z / cur.zoom), y: cy - (cy - cur.y) * (z / cur.zoom) };
    apply();
  }, [apply]);

  const setView = useCallback((v) => { t.current = { ...t.current, ...v, zoom: clampZ(v.zoom ?? t.current.zoom) }; apply(); }, [apply]);

  const zoomStep = useCallback((fator) => {
    const vp = viewportRef.current;
    if (!vp) return;
    zoomAt(t.current.zoom * fator, vp.clientWidth / 2, vp.clientHeight / 2);
  }, [zoomAt]);


  const paraCanvas = useCallback((clientX, clientY) => {
    const vp = viewportRef.current;
    if (!vp) return null;
    return pontoNoCanvas({ clientX, clientY }, vp.getBoundingClientRect(), t.current);
  }, []);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return undefined;
    const pts = new Map();
    let panStart = null;
    let pinch = null;




    let toque = null;
    const cancelarToque = () => { if (toque) { clearTimeout(toque.timer); toque = null; } };

    const onWheel = (e) => {
      e.preventDefault();
      const r = vp.getBoundingClientRect();
      zoomAt(t.current.zoom * (1 - e.deltaY * 0.0014), e.clientX - r.left, e.clientY - r.top);
    };
    const onDown = (e) => {
      if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
      if (e.target.closest('input, label, textarea, select, [data-no-pan]')) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved.current = false;
      if (pts.size === 1) {
        panStart = { x: e.clientX - t.current.x, y: e.clientY - t.current.y, ox: e.clientX, oy: e.clientY };
        if (toqueLongo && e.pointerType === 'touch') {
          const alvo = e.target;
          const { clientX, clientY, pointerId } = e;
          toque = {
            id: pointerId, x: clientX, y: clientY,
            timer: setTimeout(() => {
              toque = null;

              moved.current = true;
              panStart = null;
              alvo.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX, clientY }));
            }, TOQUE_LONGO_MS),
          };
        }
      } else if (pts.size === 2) {
        cancelarToque();
        const [a, b] = [...pts.values()];
        const r = vp.getBoundingClientRect();
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: t.current.zoom, cx: (a.x + b.x) / 2 - r.left, cy: (a.y + b.y) / 2 - r.top };
        panStart = null;
      }
    };
    const onMove = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (toque && toque.id === e.pointerId && Math.hypot(e.clientX - toque.x, e.clientY - toque.y) > TOQUE_TOLERANCIA_PX) cancelarToque();
      if (pinch && pts.size === 2) {
        const [a, b] = [...pts.values()];
        zoomAt(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, pinch.cx, pinch.cy);
        moved.current = true;
      } else if (panStart) {
        if (!moved.current && Math.hypot(e.clientX - panStart.ox, e.clientY - panStart.oy) < 5) return;
        moved.current = true;
        vp.classList.add('panning');
        t.current = { ...t.current, x: e.clientX - panStart.x, y: e.clientY - panStart.y };
        apply();
      }
    };
    const onEnd = (e) => {
      if (toque && toque.id === e.pointerId) cancelarToque();
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (!pts.size) { panStart = null; vp.classList.remove('panning'); }
    };

    const onClickCapture = (e) => {
      if (moved.current) { e.stopPropagation(); e.preventDefault(); moved.current = false; }
    };


    const onMenuCapture = () => {
      if (!toque) return;
      cancelarToque();
      moved.current = true;
      panStart = null;
    };

    vp.addEventListener('wheel', onWheel, { passive: false });
    vp.addEventListener('pointerdown', onDown);
    vp.addEventListener('click', onClickCapture, true);
    vp.addEventListener('contextmenu', onMenuCapture, true);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
    return () => {
      cancelarToque();
      vp.removeEventListener('wheel', onWheel);
      vp.removeEventListener('pointerdown', onDown);
      vp.removeEventListener('click', onClickCapture, true);
      vp.removeEventListener('contextmenu', onMenuCapture, true);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
    };
  }, [apply, zoomAt, ativo, toqueLongo]);

  return { viewportRef, canvasRef, labelRef, apply, setView, zoomStep, paraCanvas };
}
