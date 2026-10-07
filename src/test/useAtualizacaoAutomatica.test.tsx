// @vitest-environment jsdom


import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAtualizacaoAutomatica, INTERVALO_PADRAO_MS } from '../hooks/useAtualizacaoAutomatica';

function visivel(v: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
}
afterEach(() => { vi.useRealTimers(); visivel('visible'); });

describe('useAtualizacaoAutomatica', () => {
  it('recarrega a cada intervalo enquanto a aba está visível, e carimba a hora', async () => {
    vi.useFakeTimers();
    const rec = vi.fn(async () => {});
    const { result } = renderHook(() => useAtualizacaoAutomatica(rec, { intervaloMs: 1000 }));
    expect(rec).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(rec).toHaveBeenCalledTimes(2);
    expect(result.current.atualizadoEm).toBeInstanceOf(Date);
  });
  it('⚠️ aba ESCONDIDA não recarrega — e ao voltar a ficar visível recarrega na hora', async () => {
    vi.useFakeTimers();
    const rec = vi.fn(async () => {});
    renderHook(() => useAtualizacaoAutomatica(rec, { intervaloMs: 1000 }));
    visivel('hidden');
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(rec).not.toHaveBeenCalled();
    visivel('visible');
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(rec).toHaveBeenCalledTimes(1);
  });
  it('foco na janela recarrega; desmontar para tudo', async () => {
    vi.useFakeTimers();
    const rec = vi.fn(async () => {});
    const { unmount } = renderHook(() => useAtualizacaoAutomatica(rec, { intervaloMs: 1000 }));
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(rec).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
    expect(rec).toHaveBeenCalledTimes(1);
  });
  it('falha do recarregamento não estoura nem carimba a hora; `ativo:false` desliga', async () => {
    vi.useFakeTimers();
    const rec = vi.fn(async () => { throw new Error('rede'); });
    const { result } = renderHook(() => useAtualizacaoAutomatica(rec, { intervaloMs: 1000 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(rec).toHaveBeenCalledTimes(1);
    expect(result.current.atualizadoEm).toBeNull();
    const off = vi.fn(async () => {});
    renderHook(() => useAtualizacaoAutomatica(off, { intervaloMs: 1000, ativo: false }));
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(off).not.toHaveBeenCalled();
    expect(INTERVALO_PADRAO_MS).toBe(60_000);
  });
});
