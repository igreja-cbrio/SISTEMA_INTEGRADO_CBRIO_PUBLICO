import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { semComentariosJs } from './_semComentarios';
import {
  CHAVE_TEMA_DEMANDAS, normalizarTema, lerTemaDemandas, gravarTemaDemandas,
  capturarTemaSistema, aplicarTemaDemandas, restaurarTemaSistema,
} from '../pages/marketing/linha/temaDemandas';





const RAIZ = join(__dirname, '..', 'pages', 'marketing');
const ler = (...p: string[]) => readFileSync(join(RAIZ, ...p), 'utf8');

function storageFalso(inicial: Record<string, string> = {}) {
  const m = new Map(Object.entries(inicial));
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, v); },
    m,
  };
}
const storageQueLanca = {
  getItem: () => { throw new Error('SecurityError'); },
  setItem: () => { throw new Error('QuotaExceeded'); },
};

describe('a escolha do tema', () => {
  it('só existem claro e escuro; o resto é claro', () => {
    expect(normalizarTema('escuro')).toBe('escuro');
    expect(normalizarTema('claro')).toBe('claro');
    expect(normalizarTema(null)).toBe('claro');
    expect(normalizarTema('dark')).toBe('claro');
  });

  it('abre no claro sem nada guardado, e lembra o escuro', () => {
    expect(lerTemaDemandas(storageFalso())).toBe('claro');
    const s = storageFalso();
    gravarTemaDemandas(s, 'escuro');
    expect(s.m.get(CHAVE_TEMA_DEMANDAS)).toBe('escuro');
    expect(lerTemaDemandas(s)).toBe('escuro');
  });

  it('⚠️ armazenamento que lança (aba privada) não derruba a tela', () => {
    expect(lerTemaDemandas(storageQueLanca)).toBe('claro');
    expect(() => gravarTemaDemandas(storageQueLanca, 'escuro')).not.toThrow();
    expect(lerTemaDemandas(null)).toBe('claro');
  });
});

describe('o <html> enquanto a tela está aberta', () => {
  const html = document.documentElement;
  afterEach(() => { html.removeAttribute('data-theme'); html.classList.remove('dark'); document.body.style.overflow = ''; });

  it('aplica as DUAS pontas do tema (atributo do Lab22 e a classe do Tailwind)', () => {
    aplicarTemaDemandas(html, 'escuro');
    expect(html.getAttribute('data-theme')).toBe('dark');
    expect(html.classList.contains('dark')).toBe(true);
    aplicarTemaDemandas(html, 'claro');
    expect(html.getAttribute('data-theme')).toBe('light');
    expect(html.classList.contains('dark')).toBe(false);
  });

  it('⚠️ ao sair devolve EXATAMENTE o que estava, inclusive "sem atributo"', () => {
    html.setAttribute('data-theme', 'dark');
    html.classList.add('dark');
    document.body.style.overflow = 'auto';
    const salvo = capturarTemaSistema(html, document.body);
    aplicarTemaDemandas(html, 'claro');
    document.body.style.overflow = 'hidden';
    restaurarTemaSistema(html, document.body, salvo);
    expect(html.getAttribute('data-theme')).toBe('dark');
    expect(html.classList.contains('dark')).toBe(true);
    expect(document.body.style.overflow).toBe('auto');

    html.removeAttribute('data-theme');
    html.classList.remove('dark');
    const semNada = capturarTemaSistema(html, document.body);
    aplicarTemaDemandas(html, 'escuro');
    restaurarTemaSistema(html, document.body, semNada);
    expect(html.hasAttribute('data-theme')).toBe(false);
    expect(html.classList.contains('dark')).toBe(false);
  });

  it('a tela usa a régua: aplica pelo tema escolhido e restaura ao sair', () => {
    const tela = semComentariosJs(ler('MarketingLinhaDoTempo.jsx'));
    expect(tela).toContain('aplicarTemaDemandas(document.documentElement, tema)');
    expect(tela).toContain('restaurarTemaSistema(html, document.body, salvo)');

    expect(tela).not.toMatch(/setAttribute\('data-theme', 'light'\)/);

    expect(tela).toContain("'Voltar ao tema claro'");
  });
});


function hexParaRgb(hex: string) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}
function luminancia(hex: string) {
  const [r, g, b] = hexParaRgb(hex).map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contraste(a: string, b: string) {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

describe('a paleta do escuro (linha.css)', () => {
  const css = ler('linha', 'linha.css');
  const bloco = css.split('html[data-tema-modulo="lab22"]:not([data-theme="light"]) .mkt-linha {')[1]?.split('}')[0] || '';
  const tok = (nome: string) => {
    const m = bloco.match(new RegExp(`--${nome}:\\s*(#[0-9a-fA-F]{6})`));
    if (!m) throw new Error(`token --${nome} ausente no escuro`);
    return m[1].toLowerCase();
  };

  const FUNDO = '#1c1c1c';

  it('as cores do Pablo estão lá', () => {
    expect(tok('ml-accent')).toBe('#0f03f9');
    expect(tok('ml-red')).toBe('#fa5d02');
    expect(tok('ml-green')).toBe('#497a3e');
  });

  it('⚠️ o bloco em atraso (laranja) usa texto ESCURO — branco dá ~3:1', () => {
    expect(contraste('#ffffff', tok('ml-red'))).toBeLessThan(4.5);
    expect(contraste(tok('ml-on-red'), tok('ml-red'))).toBeGreaterThanOrEqual(4.5);

    expect(css).toMatch(/\.ml-blk\.red \{[^}]*--blk-ink: var\(--ml-on-red/);
  });

  it('branco no verde, no cinza e no azul passa', () => {
    for (const fundo of [tok('ml-green'), tok('ml-gray'), tok('ml-accent')]) {
      expect(contraste(tok('ml-on'), fundo)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('o azul que vira TEXTO ou LINHA é o claro, não o #0F03F9', () => {
    expect(contraste('#0f03f9', FUNDO)).toBeLessThan(3);
    expect(contraste(tok('ml-accent-deep'), FUNDO)).toBeGreaterThanOrEqual(4.5);
  });

  it('as linhas das frentes se enxergam no fundo', () => {
    for (const f of ['ln-ins', 'ln-sis', 'ln-rot', 'ln-red', 'ln-pen']) {
      expect(contraste(tok(f), FUNDO)).toBeGreaterThanOrEqual(3);
    }
  });

  it('⚠️ o claro de antes ficou igual (tokens do claro intocados)', () => {
    const claro = css.split('[data-theme="light"] .mkt-linha {')[1]?.split('}')[0] || '';
    expect(claro).toContain('--ml-accent: #00a693;');
    expect(claro).toContain('--ml-red: #c4453b;');
    expect(claro).toContain('--ml-on: #ffffff;');
    expect(claro).not.toContain('--ml-on-red');
  });
});


describe('as telas das Demandas não ficam brancas no escuro', () => {
  const arquivos = [
    ...readdirSync(join(RAIZ, 'linha')).filter(f => f.endsWith('.jsx')).map(f => join('linha', f)),
    'MarketingLinhaDoTempo.jsx',
  ];
  it.each(arquivos)('%s: toda cor do claro tem o seu dark:', (arq) => {
    const linhas = semComentariosJs(ler(arq)).split('\n');
    const culpadas = linhas
      .map((l, i) => ({ l, i: i + 1 }))
      .filter(({ l }) => /(bg-white(?![\w/-])|#00B39D|#007a6b|text-amber-[678]00|-(slate|gray|zinc)-[0-9]|(text|bg)-(red|emerald)-[0-9])/.test(l))

      .filter(({ l }) => !/escuro \? 'bg-background' : 'bg-white'/.test(l))
      .filter(({ l }) => !/dark:/.test(l));
    expect(culpadas.map(c => `${c.i}: ${c.l.trim().slice(0, 90)}`)).toEqual([]);
  });
});
