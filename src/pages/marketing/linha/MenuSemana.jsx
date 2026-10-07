import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { ddmm } from './layout';






const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MARGEM = 8;



export function diaDaSemana(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return '';
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)));
  return Number.isNaN(d.getTime()) ? '' : DIAS[d.getUTCDay()];
}


export function situacaoDaSemana(semana) {
  if (!semana) return null;
  if (semana.atual) return { tag: 'Esta semana', dica: null };
  if (semana.futura) return { tag: 'Próximas semanas', dica: null };
  return { tag: 'Já passou', dica: 'A semana já passou: a tarefa nasce atrasada.' };
}

export default function MenuSemana({ semana, x, y, onNovaTarefa, onFechar }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: x, top: y });


  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof window === 'undefined') return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    setPos({
      left: Math.max(MARGEM, Math.min(x, window.innerWidth - w - MARGEM)),
      top: Math.max(MARGEM, Math.min(y, window.innerHeight - h - MARGEM)),
    });
  }, [x, y]);


  useEffect(() => {
    const fora = (e) => { if (ref.current && !ref.current.contains(e.target)) onFechar(); };
    const tecla = (e) => { if (e.key === 'Escape') onFechar(); };
    document.addEventListener('pointerdown', fora, true);
    document.addEventListener('keydown', tecla);
    window.addEventListener('wheel', onFechar, { passive: true });
    window.addEventListener('resize', onFechar);
    return () => {
      document.removeEventListener('pointerdown', fora, true);
      document.removeEventListener('keydown', tecla);
      window.removeEventListener('wheel', onFechar);
      window.removeEventListener('resize', onFechar);
    };
  }, [onFechar]);

  if (!semana) return null;
  const sit = situacaoDaSemana(semana);
  const prazo = semana.fim;

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={`Opções da semana ${semana.n}`}
      data-no-pan
      className="fixed z-[80] w-[248px] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg"
      style={{ left: pos.left, top: pos.top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="border-b border-border px-3 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold">Semana {semana.n}</span>
          {sit && <span className="text-[11px] text-muted-foreground">{sit.tag}</span>}
        </div>
        <span className="block text-xs tabular-nums text-muted-foreground">{ddmm(semana.inicio)} a {ddmm(semana.fim)}</span>
      </div>
      <button
        type="button"
        role="menuitem"
        autoFocus
        className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
        onClick={() => { onNovaTarefa(semana); onFechar(); }}
      >
        <CalendarPlus className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <span className="min-w-0">
          <span className="block text-sm font-medium">Nova tarefa nesta semana</span>
          <span className="block text-[11px] text-muted-foreground">
            Prazo sugerido: {diaDaSemana(prazo)} {ddmm(prazo)}
          </span>
          {sit?.dica && <span className="block text-[11px] text-muted-foreground">{sit.dica}</span>}
        </span>
      </button>
    </div>
  );
}
