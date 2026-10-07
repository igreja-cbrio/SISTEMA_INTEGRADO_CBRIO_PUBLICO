import { describe, it, expect } from 'vitest';
import { avisoPedidoNovo, primeiroNome, TIPOS_ROTEADOS_HOJE } from '../../backend/utils/avisoGrupoApp.js';









describe('avisoPedidoNovo · o aviso que o app entende', () => {
  const base = { pedidoId: 'ped-1', grupoId: 'gru-1', grupoNome: 'Conexão Barra', pessoaNome: 'Maria Silva Souza' };




  it('o tipo é `grupo_pedido` — NÃO o `pedido_grupo` do sino do ERP', () => {
    expect(avisoPedidoNovo(base)!.tipo).toBe('grupo_pedido');
    expect(avisoPedidoNovo(base)!.tipo).not.toBe('pedido_grupo');
  });

  it('leva grupo e pedido no `data` — é deles que o toque monta a rota', () => {
    expect(avisoPedidoNovo(base)!.data).toEqual({ grupo_id: 'gru-1', pedido_id: 'ped-1' });
  });




  it('a chave de dedup é o PEDIDO, não o instante', () => {
    const a = avisoPedidoNovo(base)!;
    const b = avisoPedidoNovo({ ...base, pessoaNome: 'Outro Nome' })!;
    expect(a.chaveDedup).toBe('grupo_pedido:ped-1');
    expect(b.chaveDedup).toBe(a.chaveDedup);
    expect(avisoPedidoNovo({ ...base, pedidoId: 'ped-2' })!.chaveDedup)
      .not.toBe(a.chaveDedup);
  });

  it('diz o PRÓXIMO PASSO, porque a lei do fluxo é ligar antes de aprovar', () => {
    expect(avisoPedidoNovo(base)!.body).toBe(
      'Maria quer entrar em Conexão Barra. Fale com Maria antes de aprovar.',
    );
  });



  it('sem pedido ou sem grupo devolve null, nunca aviso pela metade', () => {
    expect(avisoPedidoNovo({ ...base, pedidoId: undefined as never })).toBeNull();
    expect(avisoPedidoNovo({ ...base, grupoId: undefined as never })).toBeNull();
  });

  it('grupo sem nome não vira "undefined" na tela da pessoa', () => {
    expect(avisoPedidoNovo({ ...base, grupoNome: '' })!.body).toContain('em seu grupo');
    expect(avisoPedidoNovo({ ...base, grupoNome: undefined })!.body).not.toContain('undefined');
  });

  it('primeiroNome cabe no push e nunca fica vazio', () => {
    expect(primeiroNome('  Ana  Beatriz  Lima ')).toBe('Ana');
    expect(primeiroNome('')).toBe('Alguém');
    expect(primeiroNome(null as never)).toBe('Alguém');
  });
});















describe('contrato do vocabulário', () => {
  it('`grupo_pedido` é o único ligado agora — e NÃO é o `pedido_grupo` do ERP', () => {
    expect(TIPOS_ROTEADOS_HOJE).toEqual(['grupo_pedido']);
    expect(TIPOS_ROTEADOS_HOJE).not.toContain('pedido_grupo');
  });
});
