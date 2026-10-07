























import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import MapLibreGL from 'maplibre-gl';
import { Map, MapControls, useMap } from '@/components/ui/map';
import { nucleoDoMapa } from '@/lib/nucleoMapaBairros';

export { nucleoDoMapa };

export type BairroMapa = {
  bairro: string;
  norm: string;
  total: number;
  lat: number;
  lng: number;
};

const SRC = 'dem-bairros';
const L_CALOR = 'dem-bairros-calor';
const L_CIRCULO = 'dem-bairros-circulo';
const L_NUMERO = 'dem-bairros-numero';




const DIAG = typeof location !== 'undefined' && location.search.includes('diagmapa=1');


const diag = (msg: string, extra?: Record<string, unknown>) => {
  if (!DIAG) return;
  const cauda = extra ? ' ' + Object.entries(extra).map(([k, v]) => `${k}=${String(v)}`).join(' ') : '';
  console.info(`[mapa-bairros] ${msg}${cauda}`);
};

const TEAL = '#00B39D';
const TEAL_SUAVE = 'rgba(0,179,157,0.62)';

function escapar(t: string) {
  return t.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

function montarGeoJson(bairros: BairroMapa[], total: number) {
  const maior = Math.max(1, ...bairros.map((b) => b.total));
  return {
    type: 'FeatureCollection' as const,
    features: bairros.map((b) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [b.lng, b.lat] },
      properties: {
        norm: b.norm,
        bairro: b.bairro,
        total: b.total,



        peso: Math.sqrt(b.total / maior),
        pct: total > 0 ? Math.round((b.total / total) * 100) : 0,
      },
    })),
  };
}

function Enquadrar({ bairros, tudo }: { bairros: BairroMapa[]; tudo: boolean }) {
  const { map, isLoaded } = useMap();
  const alvo = useMemo(
    () => (tudo ? bairros : nucleoDoMapa(bairros).nucleo),
    [bairros, tudo],
  );


  const chave = alvo.map((b) => b.norm).sort().join('|');
  useEffect(() => {






    if (!map || alvo.length === 0) return;


    map.resize();
    if (alvo.length === 1) {
      map.flyTo({ center: [alvo[0].lng, alvo[0].lat], zoom: 13, duration: 600 });
      return;
    }
    const lats = alvo.map((b) => b.lat);
    const lngs = alvo.map((b) => b.lng);
    map.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 64, duration: 600, maxZoom: 13 },
    );

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, isLoaded, map]);
  return null;
}

function Camadas({
  bairros,
  totalNoMapa,
  selecionado,
  onSelecionar,
}: {
  bairros: BairroMapa[];
  totalNoMapa: number;
  selecionado?: string | null;
  onSelecionar?: (norm: string | null) => void;
}) {
  const { map, isLoaded } = useMap();
  const dados = useMemo(() => montarGeoJson(bairros, totalNoMapa), [bairros, totalNoMapa]);



  const dadosRef = useRef(dados);
  dadosRef.current = dados;
  const selRef = useRef<string | null>(selecionado ?? null);
  selRef.current = selecionado ?? null;
  const onSelRef = useRef(onSelecionar);
  onSelRef.current = onSelecionar;

  useEffect(() => {







    if (!map) return;
    let vivo = true;
    diag('effect montou', { isLoaded });

    const pintarSelecao = () => {
      if (!map.getLayer(L_CIRCULO)) return;
      const sel = selRef.current ?? ' ';
      map.setPaintProperty(L_CIRCULO, 'circle-color', [
        'case', ['==', ['get', 'norm'], sel], TEAL, TEAL_SUAVE,
      ]);
      map.setPaintProperty(L_CIRCULO, 'circle-stroke-width', [
        'case', ['==', ['get', 'norm'], sel], 3, 1.5,
      ]);
    };



    let conferencias = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const agendarConferencia = () => {
      if (!vivo || conferencias >= 12) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (!vivo) return;
        if (!map.getLayer(L_CALOR) || !map.getLayer(L_CIRCULO)) {
          conferencias += 1;
          diag('camadas sumiram (setStyle?) — reaplicando', { tentativa: conferencias });
          aplicar();
        }
      }, 400);
    };

    const aplicar = () => {
      if (!vivo) return;







      diag('aplicar', {
        estiloPronto: map.isStyleLoaded(),
        features: dadosRef.current.features.length,
        temSource: !!map.getSource(SRC),
        temCalor: !!map.getLayer(L_CALOR),
      });
      try {
        const src = map.getSource(SRC) as MapLibreGL.GeoJSONSource | undefined;
        if (src) src.setData(dadosRef.current as never);
        else map.addSource(SRC, { type: 'geojson', data: dadosRef.current as never });

        if (!map.getLayer(L_CALOR)) {
          map.addLayer({
            id: L_CALOR,
            type: 'heatmap',
            source: SRC,
            paint: {
              'heatmap-weight': ['get', 'peso'],














              'heatmap-intensity': [
                'interpolate', ['linear'], ['zoom'],
                7, 2.2,
                11, 2.6,
                15, 3.2,
              ],
              'heatmap-radius': [
                'interpolate', ['linear'], ['zoom'],
                7, 55,
                9, 95,
                11, 130,
                13, 175,
                15, 240,
              ],
              'heatmap-opacity': 0.85,





              'heatmap-color': [
                'interpolate', ['linear'], ['heatmap-density'],
                0, 'rgba(0,0,0,0)',
                0.06, 'rgba(0,179,157,0.35)',
                0.22, 'rgba(56,189,248,0.55)',
                0.42, 'rgba(163,230,53,0.68)',
                0.62, 'rgba(250,204,21,0.80)',
                0.82, 'rgba(249,115,22,0.88)',
                1, 'rgba(220,38,38,0.92)',
              ],
            },
          });
        }

        if (!map.getLayer(L_CIRCULO)) {
          map.addLayer({
            id: L_CIRCULO,
            type: 'circle',
            source: SRC,
            paint: {













              'circle-radius': [
                'interpolate', ['linear'], ['get', 'total'],
                1, 8,
                5, 12,
                20, 17,
                60, 22,
              ],
              'circle-color': TEAL_SUAVE,
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 1.5,
            },
          });
        }

        if (!map.getLayer(L_NUMERO)) {



          try {
            map.addLayer({
              id: L_NUMERO,
              type: 'symbol',
              source: SRC,
              layout: {
                'text-field': ['to-string', ['get', 'total']],
                'text-font': ['Open Sans Semibold', 'Open Sans Regular', 'Noto Sans Regular'],
                'text-size': 12,
                'text-allow-overlap': true,
              },
              paint: {
                'text-color': '#ffffff',
                'text-halo-color': 'rgba(0,0,0,0.45)',
                'text-halo-width': 1,
              },
            });
          } catch {

          }
        }

        pintarSelecao();

























        map.resize();
        map.triggerRepaint();








        agendarConferencia();






        if (DIAG) (window as unknown as { __mapaBairros?: unknown }).__mapaBairros = map;
        diag('estado do render', {
          zoom: map.getZoom().toFixed(2),
          centro: map.getCenter().toArray().map((n) => n.toFixed(3)).join(','),
          estiloPronto: map.isStyleLoaded(),
          calorVisivel: map.getLayoutProperty(L_CALOR, 'visibility') ?? 'default',
          raioCalor: JSON.stringify(map.getPaintProperty(L_CALOR, 'heatmap-radius')),
          featuresRenderizadas: (() => {
            try { return map.queryRenderedFeatures(undefined, { layers: [L_CIRCULO] }).length; }
            catch { return 'erro'; }
          })(),
          featuresNaSource: (() => {
            try { return map.querySourceFeatures(SRC).length; } catch { return 'erro'; }
          })(),
        });
        diag('camadas ok', { calor: !!map.getLayer(L_CALOR), circulo: !!map.getLayer(L_CIRCULO), numero: !!map.getLayer(L_NUMERO) });
      } catch (e) {


        diag('aplicar falhou (o proximo gatilho tenta de novo)', e);
      }
    };

    aplicar();







    map.on('styledata', aplicar);
    map.on('idle', aplicar);
    map.on('load', aplicar);
    map.on('style.load', aplicar);



    const aoErrar = (e: { error?: { message?: string } }) => {
      diag('erro do mapa', { msg: e?.error?.message ?? 'sem mensagem' });
    };
    map.on('error', aoErrar);

    const popup = new MapLibreGL.Popup({ closeButton: false, closeOnClick: false, offset: 14 });
    const aoClicar = (e: MapLibreGL.MapLayerMouseEvent) => {
      const f = e.features?.[0];
      const norm = f?.properties?.norm as string | undefined;
      if (!norm) return;
      onSelRef.current?.(selRef.current === norm ? null : norm);
    };
    const aoEntrar = (e: MapLibreGL.MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      map.getCanvas().style.cursor = 'pointer';
      const p = f.properties as { bairro: string; total: number; pct: number };
      const pessoas = `${p.total} ${Number(p.total) === 1 ? 'pessoa' : 'pessoas'}`;



      const geo = f.geometry as unknown as { type?: string; coordinates?: [number, number] };
      if (geo.type !== 'Point' || !geo.coordinates) return;
      const coord = geo.coordinates;
      popup
        .setLngLat(coord)
        .setHTML(
          `<div style="font:600 13px/1.3 system-ui;color:#111">${escapar(String(p.bairro))}</div>` +
            `<div style="font:400 12px/1.3 system-ui;color:#555;margin-top:2px">${pessoas} · ${p.pct}% de quem está no mapa</div>`,
        )
        .addTo(map);
    };
    const aoSair = () => {
      map.getCanvas().style.cursor = '';
      popup.remove();
    };

    map.on('click', L_CIRCULO, aoClicar);
    map.on('mouseenter', L_CIRCULO, aoEntrar);
    map.on('mouseleave', L_CIRCULO, aoSair);

    return () => {
      vivo = false;
      map.off('styledata', aplicar);
      map.off('idle', aplicar);
      map.off('load', aplicar);
      map.off('style.load', aplicar);
      map.off('error', aoErrar);
      map.off('click', L_CIRCULO, aoClicar);
      map.off('mouseenter', L_CIRCULO, aoEntrar);
      map.off('mouseleave', L_CIRCULO, aoSair);
      popup.remove();

      try {
        if (timer) clearTimeout(timer);
        [L_NUMERO, L_CIRCULO, L_CALOR].forEach((l) => {
          if (map.getLayer(l)) map.removeLayer(l);
        });
        if (map.getSource(SRC)) map.removeSource(SRC);
      } catch {

      }
    };

















    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);





  useEffect(() => {
    if (!map) return;
    const src = map.getSource(SRC) as MapLibreGL.GeoJSONSource | undefined;
    if (src) src.setData(dados as never);
  }, [dados, map]);

  useEffect(() => {
    if (!map || !map.getLayer(L_CIRCULO)) return;
    const sel = selecionado ?? ' ';
    map.setPaintProperty(L_CIRCULO, 'circle-color', [
      'case', ['==', ['get', 'norm'], sel], TEAL, TEAL_SUAVE,
    ]);
    map.setPaintProperty(L_CIRCULO, 'circle-stroke-width', [
      'case', ['==', ['get', 'norm'], sel], 3, 1.5,
    ]);
  }, [selecionado, map]);

  return null;
}






function AjustarTamanho({ marca }: { marca: unknown }) {
  const { map } = useMap();
  useEffect(() => {
    if (!map) return;
    const id = requestAnimationFrame(() => {
      map.resize();
      map.triggerRepaint();
    });
    return () => cancelAnimationFrame(id);
  }, [map, marca]);
  return null;
}



function useTemaDoSistema(): 'light' | 'dark' {
  const [tema, setTema] = useState<'light' | 'dark'>(() =>
    typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light'
      ? 'light' : 'dark');
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const obs = new MutationObserver(() => {
      setTema(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return tema;
}

export default function MapaBairros({
  bairros,
  selecionado,
  onSelecionar,





  unidade = 'bairro',
  unidadePlural = 'bairro(s)',
}: {
  bairros: BairroMapa[];
  selecionado?: string | null;
  onSelecionar?: (norm: string | null) => void;
  unidade?: string;
  unidadePlural?: string;
}) {
  const tema = useTemaDoSistema();
  const [verTudo, setVerTudo] = useState(false);
  const [expandido, setExpandido] = useState(false);
  const [avisoTela, setAvisoTela] = useState<string | null>(null);
  const caixaRef = useRef<HTMLDivElement>(null);

















  const alternar = () => {
    const el = caixaRef.current;
    if (!el) return;
    setAvisoTela(null);
    if (document.fullscreenElement) { void document.exitFullscreen(); return; }
    if (!document.fullscreenEnabled || !el.requestFullscreen) {
      setAvisoTela('Este navegador não permite tela cheia nesta página.');
      return;
    }
    el.requestFullscreen().catch(() => {
      setExpandido(false);
      setAvisoTela('O navegador recusou a tela cheia. Tente a tecla F11.');
    });
  };




  useEffect(() => {
    const aoMudar = () => setExpandido(document.fullscreenElement === caixaRef.current);
    document.addEventListener('fullscreenchange', aoMudar);
    return () => document.removeEventListener('fullscreenchange', aoMudar);
  }, []);
  const totalNoMapa = useMemo(() => bairros.reduce((s, b) => s + b.total, 0), [bairros]);
  const fora = useMemo(() => nucleoDoMapa(bairros).fora, [bairros]);

  if (bairros.length === 0) {
    return (
      <div className="h-[420px] rounded-[16px] border border-border grid place-items-center text-center p-6">
        <div>
          <p className="text-sm font-medium">Nenhum {unidade} no mapa ainda</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            O mapa precisa de duas coisas: pessoas com bairro no cadastro e o centróide
            daquele bairro resolvido. Use “Resolver bairros” abaixo.
          </p>
        </div>
      </div>
    );
  }

  return (





    <div
      ref={caixaRef}



      className={expandido ? 'flex h-full w-full flex-col gap-2 bg-background p-4' : 'space-y-2'}
    >
      <div
        className={
          expandido
            ? 'relative flex-1 min-h-0 rounded-[16px] overflow-hidden border border-border'
            : 'relative h-[420px] rounded-[16px] overflow-hidden border border-border'
        }
      >
        <Map theme={tema} center={[-43.35, -22.93]} zoom={10}>
          <Enquadrar bairros={bairros} tudo={verTudo} />
          <MapControls position="top-right" />
          <AjustarTamanho marca={expandido} />
          <Camadas
            bairros={bairros}
            totalNoMapa={totalNoMapa}
            selecionado={selecionado}
            onSelecionar={onSelecionar}
          />
        </Map>

        {
                                                             }
        <button
          type="button"
          onClick={alternar}
          aria-label={expandido ? 'Sair da tela cheia' : 'Ver o mapa em tela cheia'}
          title={expandido ? 'Sair da tela cheia (Esc)' : 'Ver em tela cheia'}
          className="absolute left-2 top-2 z-10 inline-flex items-center gap-1.5 rounded-md border border-border bg-card/90 px-2.5 py-1.5 text-xs font-medium shadow-sm backdrop-blur hover:bg-card"
        >
          {expandido ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          {expandido ? 'Sair da tela cheia' : 'Tela cheia'}
        </button>
      </div>

      {

                                               }
      {avisoTela && (
        <p className="text-xs text-amber-600 dark:text-amber-500">{avisoTela}</p>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span>menos gente</span>
          <span
            className="h-2.5 w-28 rounded-full"
            style={{
              background:
                'linear-gradient(90deg, rgba(0,179,157,0.45), rgba(56,189,248,0.7), rgba(163,230,53,0.8), rgba(250,204,21,0.9), rgba(249,115,22,0.95), rgba(220,38,38,1))',
            }}
          />
          <span>mais gente</span>
        </span>
        <span>O número dentro do círculo é quantas pessoas moram naquele {unidade}.</span>
        {fora.length > 0 && (
          <button
            type="button"
            onClick={() => setVerTudo((v) => !v)}
            className="underline underline-offset-2 hover:text-foreground"
          >
            {verTudo
              ? 'Voltar ao enquadramento principal'
              : `${fora.length} ${unidadePlural} fora do quadro inicial — enquadrar tudo`}
          </button>
        )}
      </div>
    </div>
  );
}
