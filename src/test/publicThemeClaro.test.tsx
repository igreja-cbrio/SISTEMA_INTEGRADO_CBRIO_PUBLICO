import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';











const CHAVE_PUBLICA = 'cbrio-theme-publico';
const CHAVE_ERP = 'cbrio-theme';




const memoria = new Map<string, string>();
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => (memoria.has(k) ? memoria.get(k)! : null),
    setItem: (k: string, v: string) => { memoria.set(k, String(v)); },
    removeItem: (k: string) => { memoria.delete(k); },
    clear: () => { memoria.clear(); },
  },
});

async function carregar() {
  vi.resetModules();
  return import('../pages/public/publicTheme');
}

describe('tema das páginas públicas · padrão CLARO', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('sem preferência salva, abre no CLARO', async () => {
    const { usePublicTheme } = await carregar();
    const { result } = renderHook(() => usePublicTheme());
    expect(result.current.isDark).toBe(false);
    expect(result.current.C.pageBg).toBe('#eef2f1');
  });

  it('⚠️ o tema ESCURO do ERP não arrasta o formulário junto', async () => {


    window.localStorage.setItem(CHAVE_ERP, 'dark');
    const { usePublicTheme } = await carregar();
    const { result } = renderHook(() => usePublicTheme());
    expect(result.current.isDark).toBe(false);
  });

  it('quem CLICOU no botão tem a escolha respeitada', async () => {
    window.localStorage.setItem(CHAVE_PUBLICA, 'dark');
    const { usePublicTheme } = await carregar();
    const { result } = renderHook(() => usePublicTheme());
    expect(result.current.isDark).toBe(true);
    expect(result.current.C.pageBg).toBe('#0a0a0a');
  });

  it('alternar grava na chave PRÓPRIA e não encosta na do ERP', async () => {
    window.localStorage.setItem(CHAVE_ERP, 'dark');
    const { usePublicTheme } = await carregar();
    const { result } = renderHook(() => usePublicTheme());

    act(() => { result.current.toggle(); });

    expect(result.current.isDark).toBe(true);
    expect(window.localStorage.getItem(CHAVE_PUBLICA)).toBe('dark');

    expect(window.localStorage.getItem(CHAVE_ERP)).toBe('dark');
  });

  it('o data-theme do documento acompanha a página pública', async () => {


    const { usePublicTheme } = await carregar();
    const { result } = renderHook(() => usePublicTheme());
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    act(() => { result.current.toggle(); });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('ao sair da página pública, o tema do ERP volta', async () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    const { usePublicTheme } = await carregar();
    const { unmount } = renderHook(() => usePublicTheme());
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    unmount();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('a paleta padrão do contexto é a CLARA', async () => {

    const { PublicPaletteCtx } = await carregar();
    // @ts-expect-error acesso ao default do contexto no teste
    const padrao = PublicPaletteCtx._currentValue ?? PublicPaletteCtx.Provider._context?._currentValue;
    expect(padrao.isDark).toBe(false);
  });
});
