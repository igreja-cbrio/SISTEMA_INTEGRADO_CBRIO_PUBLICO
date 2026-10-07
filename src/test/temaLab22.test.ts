import { describe, it, expect, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { semComentariosJs } from './_semComentarios';
import {
  temaDoModulo, useTemaModulo, aplicarTemaModulo,
  TEMA_LAB22, ATRIBUTO_TEMA_MODULO, ID_FONTES_LAB22,
} from '../lib/temaModulo';
import { rotuloDataCabecalho } from '../lib/dataCabecalho';













const raiz = join(__dirname, '..', '..');
const lerCru = (rel: string) => readFileSync(join(raiz, rel), 'utf8');
const ler = (rel: string) => semComentariosJs(lerCru(rel));
const semComentariosCss = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');

describe('temaDoModulo · qual rota ganha o tema', () => {
  it('o Marketing e as abas dele', () => {
    expect(temaDoModulo('/marketing')).toBe(TEMA_LAB22);
    expect(temaDoModulo('/marketing/demandas')).toBe(TEMA_LAB22);
    expect(temaDoModulo('/marketing/campanhas')).toBe(TEMA_LAB22);
  });

  it('⚠️ o prefixo leva a barra: /marketingx NÃO é o Marketing', () => {
    expect(temaDoModulo('/marketingx')).toBeNull();
    expect(temaDoModulo('/marketing-antigo')).toBeNull();
  });

  it('o resto do sistema fica com o tema do sistema', () => {
    expect(temaDoModulo('/')).toBeNull();
    expect(temaDoModulo('/dashboard')).toBeNull();
    expect(temaDoModulo('/ministerial/cuidados')).toBeNull();
    expect(temaDoModulo('/admin/marketing')).toBeNull();
    expect(temaDoModulo('')).toBeNull();
    expect(temaDoModulo(null)).toBeNull();
    expect(temaDoModulo(undefined)).toBeNull();
  });
});

describe('useTemaModulo · o atributo no <html>', () => {
  const html = () => document.documentElement;
  const links = () => document.querySelectorAll(`#${ID_FONTES_LAB22}`);

  afterEach(() => {
    aplicarTemaModulo(document, null);
    links().forEach(l => l.remove());
  });

  it('liga ao entrar no Marketing e baixa as fontes UMA vez', () => {
    const { rerender } = renderHook(({ p }) => useTemaModulo(p), { initialProps: { p: '/marketing' } });
    expect(html().getAttribute(ATRIBUTO_TEMA_MODULO)).toBe(TEMA_LAB22);
    expect(links()).toHaveLength(1);

    rerender({ p: '/marketing/campanhas' });
    expect(html().getAttribute(ATRIBUTO_TEMA_MODULO)).toBe(TEMA_LAB22);
    expect(links()).toHaveLength(1);
  });

  it('sair e voltar ao módulo não empilha pedido de fonte', () => {


    renderHook(() => useTemaModulo('/marketing')).unmount();
    renderHook(() => useTemaModulo('/marketing/app')).unmount();
    renderHook(() => useTemaModulo('/marketing/demandas'));
    expect(links()).toHaveLength(1);
  });

  it('⚠️ DESLIGA ao sair do módulo — o tema não pode vazar para a próxima tela', () => {
    const { rerender } = renderHook(({ p }) => useTemaModulo(p), { initialProps: { p: '/marketing/app' } });
    expect(html().getAttribute(ATRIBUTO_TEMA_MODULO)).toBe(TEMA_LAB22);
    rerender({ p: '/ministerial/cuidados' });
    expect(html().hasAttribute(ATRIBUTO_TEMA_MODULO)).toBe(false);
  });

  it('⚠️ desmontar (logout, erro de tela) também desliga', () => {
    const { unmount } = renderHook(() => useTemaModulo('/marketing'));
    expect(html().getAttribute(ATRIBUTO_TEMA_MODULO)).toBe(TEMA_LAB22);
    unmount();
    expect(html().hasAttribute(ATRIBUTO_TEMA_MODULO)).toBe(false);
  });

  it('fora do Marketing não baixa fonte nenhuma', () => {
    renderHook(() => useTemaModulo('/dashboard'));
    expect(html().hasAttribute(ATRIBUTO_TEMA_MODULO)).toBe(false);
    expect(links()).toHaveLength(0);
  });
});

describe('rotuloDataCabecalho · o dia no canto do menu', () => {
  const tzAntes = process.env.TZ;
  afterEach(() => { process.env.TZ = tzAntes; });

  it('"sexta 25-09"', () => {
    expect(rotuloDataCabecalho(new Date('2026-09-25T15:00:00Z'))).toBe('sexta 25-09');
  });

  it('⚠️ o dia é o da IGREJA: 22h30 de sexta no Rio já é sábado em UTC', () => {


    process.env.TZ = 'UTC';
    expect(rotuloDataCabecalho(new Date('2026-09-26T01:30:00Z'))).toBe('sexta 25-09');
  });

  it('sábado e domingo ficam como estão; o "-feira" sai', () => {
    expect(rotuloDataCabecalho(new Date('2026-09-26T15:00:00Z'))).toBe('sábado 26-09');
    expect(rotuloDataCabecalho(new Date('2026-09-27T15:00:00Z'))).toBe('domingo 27-09');
    expect(rotuloDataCabecalho(new Date('2026-09-28T15:00:00Z'))).toBe('segunda 28-09');
  });

  it('data inválida não vira "NaN"', () => {
    expect(rotuloDataCabecalho(new Date('lixo'))).toBe('');
  });
});


const css = semComentariosCss(lerCru('src/index.css'));

function bloco(seletor: string): Record<string, string> {
  const i = css.indexOf(`${seletor} {`);
  if (i < 0) throw new Error(`bloco não encontrado: ${seletor}`);
  const corpo = css.slice(i, css.indexOf('}', i));
  const tokens: Record<string, string> = {};
  for (const m of corpo.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) tokens[m[1]] = m[2].trim();
  return tokens;
}

const escuro = bloco('html[data-tema-modulo="lab22"]');

const claro = { ...escuro, ...bloco('html[data-tema-modulo="lab22"][data-theme="light"]') };

type RGB = [number, number, number];
function hslParaRgb(valor: string): RGB {
  const m = valor.match(/^(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (!m) throw new Error(`token HSL ilegível: "${valor}"`);
  const h = Number(m[1]); const s = Number(m[2]) / 100; const l = Number(m[3]) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const mm = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + mm) * 255, (g + mm) * 255, (b + mm) * 255];
}
function hexParaRgb(hex: string): RGB {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function luminancia([r, g, b]: RGB): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contraste(a: string, b: string): number {
  const [la, lb] = [luminancia(hslParaRgb(a)), luminancia(hslParaRgb(b))];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe('as cores do Pablo · as mesmas no claro e no escuro', () => {
  const PALETA: Record<string, string> = {
    'lab-azul': '#0F03F9', 'lab-laranja': '#FA5D02', 'lab-indigo': '#3E39A5', 'lab-verde': '#497A3E',
  };

  it('cada token da paleta É a cor do Pablo (tolerância de arredondamento do HSL)', () => {
    for (const [token, hex] of Object.entries(PALETA)) {
      const obtido = hslParaRgb(escuro[token]);
      const esperado = hexParaRgb(hex);
      obtido.forEach((v, i) => expect(Math.abs(v - esperado[i]), `${token} canal ${i}`).toBeLessThanOrEqual(3));
    }
  });

  it('⚠️ a primária é o azul da marca, IGUAL nos dois temas ("mantendo as cores")', () => {
    expect(escuro.primary).toBe(escuro['lab-azul']);
    expect(claro.primary).toBe(escuro['lab-azul']);
  });
});

describe('contraste WCAG dos pares que a tela usa', () => {
  for (const [nome, t] of [['escuro', escuro], ['claro', claro]] as const) {
    it(`${nome} · texto sobre o fundo e sobre o card (≥ 7:1)`, () => {
      expect(contraste(t.foreground, t.background)).toBeGreaterThanOrEqual(7);
      expect(contraste(t['card-foreground'], t.card)).toBeGreaterThanOrEqual(7);
    });

    it(`${nome} · texto apagado (≥ 4,5:1 no fundo, no card e no muted)`, () => {
      expect(contraste(t['muted-foreground'], t.background)).toBeGreaterThanOrEqual(4.5);
      expect(contraste(t['muted-foreground'], t.card)).toBeGreaterThanOrEqual(4.5);
      expect(contraste(t['muted-foreground'], t.muted)).toBeGreaterThanOrEqual(4.5);
    });

    it(`${nome} · texto sobre o botão azul (≥ 4,5:1)`, () => {
      expect(contraste(t['primary-foreground'], t.primary)).toBeGreaterThanOrEqual(4.5);
    });

    it(`${nome} · o azul como TEXTO (≥ 4,5:1 no fundo e no card)`, () => {
      expect(contraste(t['lab-azul-texto'], t.background)).toBeGreaterThanOrEqual(4.5);
      expect(contraste(t['lab-azul-texto'], t.card)).toBeGreaterThanOrEqual(4.5);
    });

    it(`${nome} · o anel de foco aparece (≥ 3:1)`, () => {
      expect(contraste(t.ring, t.background)).toBeGreaterThanOrEqual(3);
    });
  }

  it('⚠️ é por isso que o azul da marca NÃO serve de texto no escuro', () => {

    expect(contraste(escuro['lab-azul'], escuro.background)).toBeLessThan(4.5);
  });
});

describe('guardas estáticas · o CSS do tema', () => {
  it('o `text-primary` usa o tom legível SÓ no escuro', () => {
    expect(css).toMatch(/html\[data-tema-modulo="lab22"\]:not\(\[data-theme="light"\]\) \.text-primary \{\s*color: hsl\(var\(--lab-azul-texto\)\);/);
  });

  it('⚠️ o chanfro NUNCA pega `rounded-full` (avatar e selo virariam losango)', () => {
    const regra = css.slice(css.indexOf('corner-shape: bevel') - 260, css.indexOf('corner-shape: bevel'));
    expect(regra).toContain(':not(.rounded-full)');
  });

  it('o cabeçalho do sistema fica chapado dentro do Marketing, com peso acima das variantes', () => {
    expect(css).toMatch(/html\[data-tema-modulo="lab22"\] \.cbrio-app-header \{[^}]*backdrop-filter: none;/);
    expect(ler('src/components/layout/AppShell.jsx')).toContain('<header className="cbrio-app-header ');
  });

  it('as fontes do Tailwind seguem as variáveis do tema', () => {
    expect(css).toContain(':where(html[data-tema-modulo="lab22"]) .font-heading { font-family: var(--font-heading); }');
    expect(escuro['font-heading']).toContain("'Stack Sans Headline'");
    expect(escuro['font-body']).toContain("'Stack Sans Text'");
  });
});

describe('guardas estáticas · as 7 abas e as rotas', () => {
  const app = ler('src/App.tsx');
  const nav = ler('src/pages/marketing/MarketingNav.jsx');

  it('o menu tem as 7 abas, nesta ordem (Arquivos entrou em 06/10, ao lado das Demandas)', () => {
    const ordem = ['/marketing', '/marketing/demandas', '/marketing/arquivos', '/marketing/dashboard',
      '/marketing/calendario', '/marketing/campanhas', '/marketing/app'];
    const achadas = [...nav.matchAll(/path: '([^']+)'/g)].map(m => m[1]);
    expect(achadas).toEqual(ordem);
    expect(nav).not.toContain("'/marketing/analytics'");
  });

  it('Início, Dashboard e Calendário têm tela; o Analytics antigo redireciona', () => {
    const guardada = (path: string, tela: string) => new RegExp(
      `path="${path.replace(/\//g, '\\/')}" element=\\{<ModuleGuard moduleSlug="marketing" nivelMinimo=\\{1\\}><Suspense fallback=\\{<Loading />\\}><${tela} />`);
    expect(app).toMatch(guardada('/marketing', 'MarketingInicio'));
    expect(app).toMatch(guardada('/marketing/dashboard', 'MarketingAnalytics'));
    expect(app).toMatch(guardada('/marketing/calendario', 'MarketingCalendario'));
    expect(app).toMatch(/path="\/marketing\/analytics" element=\{<Navigate to="\/marketing\/dashboard" replace \/>\}/);
    expect(app).not.toContain('MarketingDashboard');

    expect(app).toMatch(/path="\/marketing\/arquivos" element=\{<ModuleGuard anyOf=\{\['marketing', 'eventos'\]\} nivelMinimo=\{1\}><Suspense fallback=\{<Loading \/>\}><MarketingArquivos \/>/);
  });

  it('o AppShell liga o tema pela rota', () => {
    expect(ler('src/components/layout/AppShell.jsx')).toContain('useTemaModulo(location.pathname)');
  });
});
