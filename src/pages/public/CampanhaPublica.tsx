












import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { resolveApiBaseUrl } from '../../lib/api-base';
import { safeHref } from '../../lib/safeHref';

type Campanha = {
  slug: string; nome: string; descricao_curta?: string; descricao?: string;
  video_url?: string; imagem_url?: string; cor_destaque?: string;
  data_lancamento?: string; data_fim?: string;
  pct: number; bateu_meta: boolean; mostrar_valor: boolean;
  arrecadado?: string; meta?: string;
  digito?: string; exemplo_com_digito?: string; aceita_online?: boolean;
  adesao?: { url: string; porta: string } | null; adesoes?: number | null;
};

const POLL_MS = 30000;

export default function CampanhaPublica() {
  const { slug } = useParams();
  const [c, setC] = useState<Campanha | null>(null);
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'nao_encontrada' | 'erro'>('carregando');
  const timer = useRef<any>(null);






  const [pctAnimado, setPctAnimado] = useState(0);
  const valorRef = useRef(0);
  const jaEntrou = useRef(false);
  const rafRef = useRef(0);

  const alvo = Math.max(0, Math.min(100, Number(c?.pct) || 0));

  useEffect(() => {
    if (estado !== 'ok') return;
    const de = valorRef.current;
    if (de === alvo) return;




    const entrada = !jaEntrou.current;
    jaEntrou.current = true;
    const dur = entrada ? 1100 : 600;

    const reduz = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduz) {
      valorRef.current = alvo;
      setPctAnimado(alvo);
      return;
    }

    let inicio = 0;
    const passo = (t: number) => {
      if (!inicio) inicio = t;
      const p = Math.min(1, (t - inicio) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      const v = de + (alvo - de) * e;
      valorRef.current = v;
      setPctAnimado(v);
      if (p < 1) rafRef.current = requestAnimationFrame(passo);
    };
    rafRef.current = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(rafRef.current);
  }, [alvo, estado]);

  useEffect(() => {
    let vivo = true;


    const base = resolveApiBaseUrl(import.meta.env.VITE_API_URL);

    const buscar = async () => {
      try {
        const r = await fetch(`${base}/public/campanhas/${encodeURIComponent(String(slug))}`);
        if (!vivo) return;
        if (r.status === 404) { setEstado('nao_encontrada'); return; }
        if (!r.ok) {



          setEstado((prev) => (prev === 'ok' ? 'ok' : 'erro'));
          return;
        }
        setC(await r.json());
        setEstado('ok');
      } catch {
        if (vivo) setEstado((prev) => (prev === 'ok' ? 'ok' : 'erro'));
      }
    };

    buscar();
    timer.current = setInterval(buscar, POLL_MS);
    return () => { vivo = false; if (timer.current) clearInterval(timer.current); };
  }, [slug]);

  if (estado === 'carregando') {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0b1120', color: '#94a3b8', fontFamily: 'system-ui, sans-serif' }}>
      Carregando…
    </div>;
  }
  if (estado === 'nao_encontrada') {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0b1120', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif', textAlign: 'center', padding: 24 }}>
      <div>
        <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>Campanha não encontrada</h1>
        <p style={{ color: '#94a3b8', margin: 0 }}>Confira o endereço com a equipe da igreja.</p>
      </div>
    </div>;
  }
  if (estado === 'erro' && !c) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0b1120', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif', textAlign: 'center', padding: 24 }}>
      <div>
        <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>Não conseguimos carregar agora</h1>
        <p style={{ color: '#94a3b8', margin: 0 }}>Estamos tentando de novo em alguns segundos.</p>
      </div>
    </div>;
  }
  if (!c) return null;

  const acento = c.cor_destaque || '#00B39D';
  const pct = alvo;

  const casas = String(pct).includes('.') ? String(pct).split('.')[1].length : 0;
  const pctTexto = pctAnimado.toFixed(casas);

  return (
    <div style={{
      minHeight: '100vh', background: '#0b1120', color: '#f1f5f9',
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5vh 6vw',
    }}>
      <div style={{ width: '100%', maxWidth: 900 }}>
        {c.imagem_url && (
          <img src={c.imagem_url} alt=""
            style={{ width: '100%', maxHeight: '32vh', objectFit: 'cover', borderRadius: 18, marginBottom: '4vh', display: 'block' }} />
        )}

        <h1 style={{ fontSize: 'clamp(28px, 5vw, 56px)', lineHeight: 1.1, margin: '0 0 10px', fontWeight: 700 }}>
          {c.nome}
        </h1>
        {c.descricao_curta && (
          <p style={{ fontSize: 'clamp(15px, 2vw, 22px)', color: '#94a3b8', margin: '0 0 5vh', lineHeight: 1.5 }}>
            {c.descricao_curta}
          </p>
        )}

        {                                                                                   }
        {c.mostrar_valor && (
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 'clamp(30px, 6vw, 68px)', fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {c.arrecadado}
            </div>
            <div style={{ fontSize: 'clamp(14px, 2vw, 20px)', color: '#94a3b8' }}>
              de {c.meta}
            </div>
          </div>
        )}

        <div style={{ height: 'clamp(14px, 2.4vw, 26px)', background: 'rgba(255,255,255,0.09)', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{
            width: `${pctAnimado}%`, height: '100%', background: acento, borderRadius: 999,
          }} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 'clamp(20px, 3.4vw, 38px)', fontWeight: 700, color: acento, fontVariantNumeric: 'tabular-nums' }}>
            {pctTexto}%
          </div>
          {c.bateu_meta && (
            <div style={{ fontSize: 'clamp(14px, 2vw, 20px)', color: acento, alignSelf: 'flex-end' }}>
              Meta alcançada 🎉
            </div>
          )}
        </div>

        {
                                                                     }
        {c.digito && (
          <div style={{ marginTop: '5vh', padding: '18px 20px', borderRadius: 14, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}>
            <div style={{ fontSize: 'clamp(13px, 1.6vw, 17px)', color: '#cbd5e1', lineHeight: 1.6 }}>
              Para a sua doação ser identificada nesta campanha, termine o valor
              da transferência em <strong style={{ color: '#f1f5f9' }}>,{c.digito}</strong>.
              {c.exemplo_com_digito && (
                <> Exemplo: para doar R$ 100, transfira <strong style={{ color: '#f1f5f9' }}>{c.exemplo_com_digito}</strong>.</>
              )}
            </div>
          </div>
        )}

        {c.adesao?.url && (
          <div style={{ marginTop: '4vh' }}>
            <a href={c.adesao.url} target="_blank" rel="noreferrer"
              style={{ display: 'inline-block', padding: '14px 26px', borderRadius: 999, background: acento, color: '#0b1220', fontWeight: 700, fontSize: 'clamp(15px, 1.9vw, 20px)', textDecoration: 'none' }}>
              {c.adesao.porta === 'voluntariado' ? 'Quero servir →' : 'Quero participar →'}
            </a>
            {c.adesoes != null && (
              <div style={{ marginTop: 10, fontSize: 'clamp(13px, 1.5vw, 16px)', color: '#cbd5e1' }}>
                <strong style={{ color: '#f1f5f9' }}>{c.adesoes}</strong> pessoa(s) já aderiram.
              </div>
            )}
          </div>
        )}

        {c.descricao && (
          <p style={{ marginTop: '4vh', fontSize: 'clamp(13px, 1.6vw, 17px)', color: '#94a3b8', lineHeight: 1.7, whiteSpace: 'pre-line' }}>
            {c.descricao}
          </p>
        )}

        {c.video_url && (
          <a href={safeHref(c.video_url)} target="_blank" rel="noreferrer"
            style={{ display: 'inline-block', marginTop: '4vh', color: acento, fontSize: 'clamp(14px, 1.8vw, 18px)' }}>
            Assistir ao vídeo da campanha →
          </a>
        )}
      </div>
    </div>
  );
}
