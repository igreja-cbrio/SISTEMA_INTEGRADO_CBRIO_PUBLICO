import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';


export interface PublicPalette {
  isDark: boolean;
  pageBg: string;
  card: string;
  cardBorder: string;
  text: string;
  text2: string;
  text3: string;
  textDim: string;
  inputBorder: string;
  optionBg: string;
  shapes: boolean;
}

const DARK: PublicPalette = {
  isDark: true,
  pageBg: '#0a0a0a',
  card: 'rgba(22,22,22,0.78)',
  cardBorder: 'rgba(255,255,255,0.06)',
  text: '#e5e5e5',
  text2: '#d4d4d4',
  text3: '#a3a3a3',
  textDim: '#737373',
  inputBorder: 'rgba(255,255,255,0.18)',
  optionBg: '#161616',
  shapes: true,
};

const LIGHT: PublicPalette = {
  isDark: false,
  pageBg: '#eef2f1',
  card: 'rgba(255,255,255,0.94)',
  cardBorder: 'rgba(0,0,0,0.08)',
  text: '#1a1a1a',
  text2: '#333333',
  text3: '#666666',
  textDim: '#9aa0a6',
  inputBorder: 'rgba(0,0,0,0.2)',
  optionBg: '#ffffff',
  shapes: false,
};

























const CHAVE_PUBLICA = 'cbrio-theme-publico';

function lerSalvo(): boolean {
  try {

    return window.localStorage.getItem(CHAVE_PUBLICA) === 'dark';
  } catch {
    return false;
  }
}

let escuroAtual = lerSalvo();
const ouvintes = new Set<() => void>();

function avisar() {
  ouvintes.forEach((f) => f());
}

function assinar(f: () => void) {
  ouvintes.add(f);
  return () => { ouvintes.delete(f); };
}

function alternarPublico() {
  escuroAtual = !escuroAtual;
  try { window.localStorage.setItem(CHAVE_PUBLICA, escuroAtual ? 'dark' : 'light'); } catch {                    }
  aplicarNoDocumento();
  avisar();
}

function aplicarNoDocumento() {
  document.documentElement.setAttribute('data-theme', escuroAtual ? 'dark' : 'light');
}




let montados = 0;
let temaDoErp: string | null = null;

export function usePublicTheme() {
  const isDark = useSyncExternalStore(assinar, () => escuroAtual, () => false);

  useEffect(() => {
    if (montados === 0) {
      temaDoErp = document.documentElement.getAttribute('data-theme');
      aplicarNoDocumento();
    }
    montados += 1;
    return () => {
      montados -= 1;
      if (montados === 0) {
        if (temaDoErp) document.documentElement.setAttribute('data-theme', temaDoErp);
        temaDoErp = null;
      }
    };
  }, []);

  return { isDark, toggle: alternarPublico, C: isDark ? DARK : LIGHT };
}




export const PublicPaletteCtx = createContext<PublicPalette>(LIGHT);
export function usePublicPalette() {
  return useContext(PublicPaletteCtx);
}








export function PublicThemeToggle({ emFluxo = false }: { emFluxo?: boolean } = {}) {
  const { isDark, toggle, C } = usePublicTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      title={isDark ? 'Tema claro' : 'Tema escuro'}
      style={{
        ...(emFluxo
          ? { position: 'relative' as const, flexShrink: 0 }
          : { position: 'fixed' as const, top: 16, right: 16, zIndex: 50 }),
        width: 40, height: 40, borderRadius: 999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: C.card, color: C.text,
        border: `1px solid ${C.cardBorder}`, cursor: 'pointer',
        backdropFilter: 'blur(12px)', fontSize: 18, lineHeight: 1,
        boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
      }}
    >
      {isDark ? '☀️' : '\u{1F319}'}
    </button>
  );
}
