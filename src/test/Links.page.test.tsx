import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';










//  · eslint e build — nenhum dos dois executa o componente.





vi.mock('../api', () => ({
  links: {
    listar: vi.fn(async () => ([{
      link_id: 'l1', slug: 'censo', titulo: 'Censo CBRio 2026',
      destino: 'https://www.cbrio.org/censo/p/censo-cbrio-2026', ativo: true,
      onde: 'QR do culto', acessos: 12, acessos_7d: 12, acessos_30d: 12,
      ultimo_acesso: '2026-08-08T12:00:00Z',
    }])),
    obter: vi.fn(), criar: vi.fn(), atualizar: vi.fn(),
    remover: vi.fn(), paraDestino: vi.fn(),
  },
}));



vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    getAccessLevel: (nomes: string[]) => (nomes.some((n) => n === 'bloqueado') ? 0 : 5),
  }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import Links from '../pages/links/Links';

describe('página /links', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renderiza sem estourar e mostra o link', async () => {
    const erros: unknown[] = [];
    const original = console.error;
    console.error = (...a: unknown[]) => { erros.push(a[0]); };
    try {
      render(<Links />);
      expect(await screen.findByText('Censo CBRio 2026')).toBeTruthy();
    } finally { console.error = original; }
    expect(erros.filter((e) => String(e).match(/is not a function|Minified React error/i))).toEqual([]);
  });

  it('mostra o endereço que vai IMPRESSO, não o destino', async () => {


    render(<Links />);
    expect(await screen.findByText('cbrio.org/r/censo')).toBeTruthy();
  });

  it('mostra a contagem de escaneamentos', async () => {
    render(<Links />);
    await screen.findByText('Censo CBRio 2026');
    expect(screen.getByText('12')).toBeTruthy();
  });
});
