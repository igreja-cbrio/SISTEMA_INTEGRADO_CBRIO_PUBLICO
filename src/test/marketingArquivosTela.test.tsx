import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';





const listar = vi.fn();
const baixar = vi.fn();
const criarEstrutura = vi.fn();
vi.mock('../api', () => ({
  marketingArquivos: {
    listar: (...a: unknown[]) => listar(...a), baixar: (...a: unknown[]) => baixar(...a),
    criarEstrutura: (...a: unknown[]) => criarEstrutura(...a),
  },
}));
vi.mock('../pages/marketing/MarketingNav', () => ({ default: () => <nav aria-label="Marketing">menu do Marketing</nav> }));

import MarketingArquivos from '../pages/marketing/MarketingArquivos';
import { buscarArquivos, conteudoDaPasta, urlDaPasta, PASTAS_DO_ANO } from '../pages/marketing/arquivos/arvoreArquivos';

type Arq = Record<string, unknown>;
const arq = (id: string, nome: string, caminho: string[], extra: Arq = {}) => ({
  id, nome, caminho, categoria: 'ciclo', tamanho: 2048, enviado_em: `2026-10-0${id.length % 9 + 1}T12:00:00Z`,
  enviado_por: 'Luciana Pariz', web_url: `https://sp/${id}`, legado: false, contexto: {}, ...extra,
});
const ARQUIVOS = [
  arq('a1', 'AMI - Thumbs - capa.png', ['Ciclo criativo', 'Natal 2026', '05 - Execução'], { contexto: { tarefa: 'Natal · Execução', subtarefa: 'Thumbs' } }),
  arq('a22', 'Briefing - briefing.pdf', ['Requisições', '12 - Dezembro', 'Arte do culto de Natal'], { categoria: 'requisicoes', contexto: { tarefa: 'Arte do culto de Natal' } }),
  arq('a333', 'stories.zip', ['Rotina', '10 - Outubro', 'Stories do culto'], { categoria: 'rotina', legado: true, contexto: { compromisso: 'Stories do culto', pessoa: 'Luciana' } }),
];
const resposta = (extra: Arq = {}) => ({
  ano: '2026', anos: [{ ano: '2026', total: 3 }, { ano: '2025', total: 0 }],
  acesso: { marketing: true, eventos: false }, arquivos: ARQUIVOS,
  destino: { local: 'criativo', raiz_url: 'https://infracbrio.sharepoint.com/sites/Criativo/Documentos%20Compartilhados/Demandas' },
  avisos: [], abrir: null, ...extra,
});
const abrir = (url = '/marketing/arquivos') => render(<MemoryRouter initialEntries={[url]}><MarketingArquivos /></MemoryRouter>);

beforeEach(() => {
  listar.mockReset(); listar.mockResolvedValue(resposta());
  baixar.mockReset(); baixar.mockResolvedValue({ url: 'https://download.falso/a1' });
});

describe('a régua da árvore', () => {
  it('no ano: as quatro pastas na ordem do SharePoint, mesmo vazias, com o total de dentro', () => {
    const { pastas, arquivos } = conteudoDaPasta(ARQUIVOS, [], { fixas: PASTAS_DO_ANO });
    expect(pastas.map(p => [p.nome, p.total])).toEqual([['Ciclo criativo', 1], ['Rotina', 1], ['Requisições', 1], ['Redes', 0]]);
    expect(arquivos).toEqual([]);
    const dentro = conteudoDaPasta(ARQUIVOS, ['Ciclo criativo', 'Natal 2026', '05 - Execução']);
    expect(dentro.pastas).toEqual([]);
    expect(dentro.arquivos.map(a => a.id)).toEqual(['a1']);
  });

  it('a busca ignora acento e caixa, e cada palavra tem de bater', () => {
    expect(buscarArquivos(ARQUIVOS, 'execucao').map(a => a.id)).toEqual(['a1']);
    expect(buscarArquivos(ARQUIVOS, 'natal briefing').map(a => a.id)).toEqual(['a22']);
    expect(buscarArquivos(ARQUIVOS, 'luciana').length).toBe(3);
    expect(buscarArquivos(ARQUIVOS, '  ')).toEqual([]);
  });

  it('o endereço da pasta no SharePoint codifica cada pedaço', () => {
    expect(urlDaPasta('https://x/Documentos%20Compartilhados/Demandas', '2026', ['Ciclo criativo', 'Natal 2026']))
      .toBe('https://x/Documentos%20Compartilhados/Demandas/2026/Ciclo%20criativo/Natal%202026');
    expect(urlDaPasta(null, '2026', [])).toBeNull();
  });
});

describe('a página', () => {
  it('Marketing: as pastas do ano com quem vê cada uma; entra, chega no arquivo e abre a pasta no SharePoint', async () => {
    abrir();
    expect(await screen.findByText('menu do Marketing')).toBeTruthy();
    const ciclo = await screen.findByRole('button', { name: /Ciclo criativo/ });

    expect(screen.getByText(/Todo arquivo ganha um nome padrão/).textContent).toContain('2026 - Natal - F03 - Moodboard - AMI - v01');
    expect(ciclo.textContent).toContain('O Marketing e quem acompanha o Eventos veem');
    expect(screen.getByRole('button', { name: /Requisições/ }).textContent).toContain('Só o Marketing vê');
    fireEvent.click(ciclo);
    fireEvent.click(await screen.findByRole('button', { name: /Natal 2026/ }));
    fireEvent.click(await screen.findByRole('button', { name: /05 - Execução/ }));
    const lista = await screen.findByRole('region', { name: 'Arquivos desta pasta' });
    expect(within(lista).getByText('AMI - Thumbs - capa.png')).toBeTruthy();
    expect(within(lista).getByText(/Natal · Execução · Thumbs/)).toBeTruthy();
    const pasta = screen.getByRole('link', { name: /Abrir esta pasta no SharePoint/ });
    expect(pasta.getAttribute('href')).toBe('https://infracbrio.sharepoint.com/sites/Criativo/Documentos%20Compartilhados/Demandas/2026/Ciclo%20criativo/Natal%202026/05%20-%20Execu%C3%A7%C3%A3o');

    fireEvent.click(within(screen.getByRole('navigation', { name: 'Pastas' })).getByRole('button', { name: '2026' }));
    expect(await screen.findByRole('button', { name: /Rotina/ })).toBeTruthy();
  });

  it('baixar pede o link ao servidor e o navegador vai direto ao SharePoint', async () => {
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...original, assign } });
    try {
      abrir();
      fireEvent.change(await screen.findByLabelText('Buscar nos arquivos do ano'), { target: { value: 'capa' } });
      fireEvent.click(await screen.findByRole('button', { name: 'Baixar AMI - Thumbs - capa.png' }));
      await waitFor(() => expect(assign).toHaveBeenCalledWith('https://download.falso/a1'));
      expect(baixar).toHaveBeenCalledWith('a1');
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original });
    }
  });

  it('o arquivo que saiu do SharePoint diz o porquê (nunca falha calado)', async () => {
    baixar.mockRejectedValue(new Error('Este arquivo não está mais no SharePoint (foi apagado, movido ou já arquivado).'));
    abrir();
    fireEvent.change(await screen.findByLabelText('Buscar nos arquivos do ano'), { target: { value: 'stories' } });
    expect(await screen.findByText(/pasta antiga, no CBRio Hub/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Baixar stories.zip' }));
    expect((await screen.findByRole('alert')).textContent).toContain('não está mais no SharePoint');
  });

  it('sem acesso ao site Criativo: o aviso de que os envios estão no CBRio Hub', async () => {
    listar.mockResolvedValue(resposta({ destino: { local: 'hub', raiz_url: 'https://hub/Criativo/Demandas' } }));
    abrir();
    expect((await screen.findByRole('status')).textContent).toContain('biblioteca Criativo do CBRio Hub');
  });

  it('só do Eventos: sem o menu do Marketing, sem o link do SharePoint, só o Ciclo criativo', async () => {
    listar.mockResolvedValue(resposta({
      acesso: { marketing: false, eventos: true }, destino: null,
      arquivos: [{ ...ARQUIVOS[0], web_url: null }],
    }));
    abrir();
    expect(await screen.findByRole('heading', { name: 'Arquivos do ciclo criativo' })).toBeTruthy();
    expect(screen.queryByText('menu do Marketing')).toBeNull();
    expect(screen.getByRole('button', { name: /Ciclo criativo/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Requisições/ })).toBeNull();
    expect(screen.queryByText(/Fim do ano/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Buscar nos arquivos do ano'), { target: { value: 'capa' } });
    expect(await screen.findByRole('button', { name: 'Baixar AMI - Thumbs - capa.png' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Abrir AMI/ })).toBeNull();
  });

  it('veio do Eventos: abre direto na pasta do evento', async () => {
    listar.mockResolvedValue(resposta({ abrir: { ano: '2026', caminho: ['Ciclo criativo', 'Natal 2026'] } }));
    abrir('/marketing/arquivos?evento=eeeeeeee-0000-4000-8000-000000000001');
    expect(await screen.findByRole('button', { name: /05 - Execução/ })).toBeTruthy();
    expect(listar).toHaveBeenCalledWith({ ano: '', evento: 'eeeeeeee-0000-4000-8000-000000000001' });

    await new Promise(r => setTimeout(r, 50));
    expect(listar).toHaveBeenCalledTimes(1);
  });

  it('o líder cria as pastas do ano: a tela pede lote a lote até acabar e diz o resultado', async () => {
    listar.mockResolvedValue(resposta({ pode_criar_estrutura: true }));
    const destino = { local: 'criativo', raiz_url: 'https://infracbrio.sharepoint.com/sites/Criativo/Documentos%20Compartilhados/Demandas' };
    criarEstrutura.mockReset();
    criarEstrutura
      .mockResolvedValueOnce({ ano: '2026', total: 51, feitas: 40, criadas: 38, existiam: 2, proximo: 40, destino })
      .mockResolvedValueOnce({ ano: '2026', total: 51, feitas: 51, criadas: 11, existiam: 0, proximo: null, destino });
    abrir();
    fireEvent.click(await screen.findByRole('button', { name: /Criar as pastas de 2026/ }));
    const status = await screen.findByText(/Pronto: as 51 pastas de 2026 estão no SharePoint/);
    expect(status.textContent).toContain('49 criadas agora, 2 já existiam');
    expect(criarEstrutura.mock.calls).toEqual([['2026', 0], ['2026', 40]]);
    expect(within(status).getByRole('link', { name: 'Abrir no SharePoint' }).getAttribute('href'))
      .toBe('https://infracbrio.sharepoint.com/sites/Criativo/Documentos%20Compartilhados/Demandas/2026');
  });

  it('o SharePoint recusou no meio: o motivo aparece; e quem não é o líder nem vê o botão', async () => {
    listar.mockResolvedValue(resposta({ pode_criar_estrutura: true }));
    criarEstrutura.mockReset();
    criarEstrutura.mockRejectedValue(new Error('O SharePoint recusou criar a pasta "Demandas" (403)'));
    abrir();
    fireEvent.click(await screen.findByRole('button', { name: /Criar as pastas de 2026/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('recusou criar a pasta');
  });

  it('sem a permissão do líder, nada de criar pastas', async () => {
    abrir();
    expect(await screen.findByRole('button', { name: /Ciclo criativo/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Criar as pastas/ })).toBeNull();
  });

  it('⚠️ falhou a carga: o motivo, nunca uma árvore vazia', async () => {
    listar.mockRejectedValue(new Error('Falta aplicar a migration 20261005150000_mkt_entrega_arquivos.sql.'));
    abrir();
    expect((await screen.findByRole('alert')).textContent).toContain('Falta aplicar a migration');
    expect(screen.queryByText(/Ainda não há arquivos/)).toBeNull();
  });
});
