import { useEffect, useRef, useState } from 'react';












export default function DescricaoGrupo({
  texto,
  linhas = 3,
  cor = 'var(--cbrio-text2)',
  corBotao = '#00B39D',



  expansivel = true,
  fontSize = 12.5,
}) {
  const limpo = (texto || '').trim();
  const ref = useRef(null);
  const [aberto, setAberto] = useState(false);
  const [transborda, setTransborda] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !limpo) { setTransborda(false); return; }
    const medir = () => {


      if (aberto) return;
      setTransborda(el.scrollHeight > el.clientHeight + 1);
    };
    medir();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, [limpo, linhas, aberto]);

  if (!limpo) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <div
        ref={ref}
        style={{
          fontSize,
          lineHeight: 1.45,
          color: cor,
          whiteSpace: 'pre-line',
          overflowWrap: 'anywhere',
          ...(aberto ? {} : {
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: linhas,
            overflow: 'hidden',
          }),
        }}
      >
        {limpo}
      </div>
      {expansivel && transborda && (
        <button
          type="button"
          onClick={() => setAberto(v => !v)}
          style={{
            alignSelf: 'flex-start', background: 'none', border: 'none', padding: '4px 0',
            color: corBotao, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            minHeight: 32,
          }}
        >
          {aberto ? 'Ver menos' : 'Conheça mais o grupo'}
        </button>
      )}
    </div>
  );
}
