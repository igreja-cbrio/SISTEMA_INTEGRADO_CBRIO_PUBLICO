import { describe, it, expect } from 'vitest';
import { lerBackend, chamadasNotificar, corpoDaRota } from './utils/notificarEstatico';



















const ROTAS_PEDIDO = [
  'backend/routes/grupos.js',
  'backend/routes/publicGrupos.js',
  'backend/routes/membresia.js',
  'backend/routes/publicMembresia.js',
];

describe('pedido de grupo · avisa o dono do grupo, nunca o público do módulo', () => {
  for (const arquivo of ROTAS_PEDIDO) {
    it(`${arquivo} · todo aviso de pedido_grupo tem targetIds`, () => {
      const blocos = chamadasNotificar(lerBackend(arquivo))
        .filter(b => b.includes("tipo: 'pedido_grupo'"));
      expect(blocos.length, `${arquivo} deveria ter pelo menos um aviso de pedido_grupo`)
        .toBeGreaterThan(0);
      for (const bloco of blocos) {
        expect(bloco, `${arquivo}: pedido_grupo sem targetIds volta pro fallback de ~16 admins`)
          .toMatch(/targetIds:/);
      }
    });

    it(`${arquivo} · quem resolve o destinatário é o donosDoGrupo`, () => {







      expect(lerBackend(arquivo)).toMatch(/donosDoGrupo\(/);
    });
  }
});

describe('transferência de participante · o líder SOLICITA, a coordenação decide', () => {
  const APP = lerBackend('backend/routes/app.js');
  const ROTA = corpoDaRota(APP, '/grupos/:grupoId/membros/:rowId/transferir');
















  it('a rota existe e foi encontrada pelo extrator', () => {
    expect(ROTA).toContain('mem_grupo_transferencias');
  });

  it('⚠️⚠️ o líder NÃO escolhe o destino — nada de destino_grupo_id no corpo', () => {


    expect(ROTA).not.toMatch(/destino_grupo_id/);
    expect(ROTA).not.toMatch(/req\.body\?\.destino/);
  });

  it('⚠️ NÃO cria pedido de entrada em grupo nenhum', () => {



    expect(ROTA).not.toMatch(/from\('mem_grupo_pedidos'\)\.insert/);
  });

  it('avisa a COORDENAÇÃO pelas regras do módulo, não uma lista no código', () => {


    expect(ROTA).toMatch(/resolverDestinatarios\('grupos'\)/);
    const aviso = chamadasNotificar(ROTA)
      .filter(b => b.includes("tipo: 'grupo_transferencia_pedida'"));
    expect(aviso.length).toBeGreaterThan(0);
    for (const bloco of aviso) {





      expect(bloco, 'o aviso tem que carregar targetIds condicionado à lista da coordenação')
        .toMatch(/coordenacao\.length \? \{ targetIds: coordenacao \} : \{\}/);
    }
  });

  it('⚠️ NENHUM WhatsApp sai daqui', () => {



    expect(ROTA).not.toMatch(/notificarLiderNovoPedido\(/);
    expect(ROTA).not.toMatch(/gruposWpp\./);
  });

  it('⚠️ a pessoa NÃO é tirada do grupo pelo pedido', () => {


    expect(ROTA).not.toMatch(/saiu_em:/);
  });

  it('⚠️ a líder PRINCIPAL não é transferida pelo app', () => {

    expect(ROTA).toMatch(/g\.grupo\.lider_id/);
  });
});
