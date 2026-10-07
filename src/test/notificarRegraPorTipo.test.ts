import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'node:module';








const req = createRequire(import.meta.url);


function fakeSupabase(cfg: any) {
  return {
    from(tabela: string) {
      const b: any = {
        _cols: '',
        select(c: string) { this._cols = c; return this; },
        eq() { return this; },
        in() { return this; },
        then(res: any, rej: any) {
          if (tabela === 'notificacao_regras') {


            if (this._cols.includes('tipo')) {
              return Promise.resolve(cfg.erroTipo
                ? { data: null, error: { message: 'column notificacao_regras.tipo does not exist' } }
                : { data: cfg.regras || [], error: null }).then(res, rej);
            }
            return Promise.resolve({ data: cfg.regrasSemTipo || [], error: null }).then(res, rej);
          }
          return Promise.resolve({ data: cfg.profiles || [], error: null }).then(res, rej);
        },
      };
      return b;
    },
  };
}





const cfgAtual: any = {};
req('../../backend/utils/supabase.js').supabase = fakeSupabase(cfgAtual);
const { resolverDestinatarios } = req('../../backend/services/notificar.js');

function comCenario(cfg: any) {
  for (const k of Object.keys(cfgAtual)) delete cfgAtual[k];
  Object.assign(cfgAtual, cfg);
}

const ADMINS = [
  { id: 'admin-1', is_servico: false },
  { id: 'admin-2', is_servico: false },
];

describe('resolverDestinatarios · regra por TIPO', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('regra do TIPO vence a regra do módulo', async () => {
    comCenario({
      regras: [
        { profile_id: 'coordenacao', tipo: null },
        { profile_id: 'marino', tipo: 'webhook_pagamento_recusado' },
        { profile_id: 'marcos', tipo: 'webhook_pagamento_recusado' },
      ],
    });
    const r = await resolverDestinatarios('inscricoes', 'webhook_pagamento_recusado');
    expect(r.sort()).toEqual(['marcos', 'marino']);
  });

  it('⚠️ configurar UM tipo não muda o destino dos OUTROS avisos do módulo', async () => {


    comCenario({
      regras: [
        { profile_id: 'coordenacao', tipo: null },
        { profile_id: 'marino', tipo: 'webhook_pagamento_recusado' },
      ],
    });
    const r = await resolverDestinatarios('inscricoes', 'nova_inscricao');
    expect(r).toEqual(['coordenacao']);
  });

  it('regra de OUTRO tipo nunca vaza pro aviso pedido', async () => {
    comCenario({
      regras: [{ profile_id: 'marino', tipo: 'webhook_pagamento_recusado' }],
      profiles: ADMINS,
    });

    const r = await resolverDestinatarios('inscricoes', 'nova_inscricao');
    expect(r).not.toContain('marino');
    expect(r.sort()).toEqual(['admin-1', 'admin-2']);
  });

  it('sem tipo pedido, usa as regras genéricas (comportamento histórico)', async () => {
    comCenario({
      regras: [
        { profile_id: 'coordenacao', tipo: null },
        { profile_id: 'marino', tipo: 'webhook_pagamento_recusado' },
      ],
    });
    expect(await resolverDestinatarios('inscricoes')).toEqual(['coordenacao']);
  });

  it('sem regra nenhuma, cai no fallback de admin/diretor', async () => {
    comCenario({ regras: [], profiles: ADMINS });
    expect((await resolverDestinatarios('inscricoes', 'nova_inscricao')).sort())
      .toEqual(['admin-1', 'admin-2']);
  });

  it('conta-robô fica de fora do fallback (não regredir)', async () => {
    comCenario({
      regras: [],
      profiles: [...ADMINS, { id: 'robo', is_servico: true }],
    });
    expect(await resolverDestinatarios('inscricoes', 'x')).not.toContain('robo');
  });

  it('⚠️⚠️ coluna `tipo` ausente NÃO derruba a notificação do sistema inteiro', async () => {



    vi.spyOn(console, 'warn').mockImplementation(() => {});
    comCenario({
      erroTipo: true,
      regrasSemTipo: [{ profile_id: 'coordenacao' }],
    });
    expect(await resolverDestinatarios('inscricoes', 'webhook_pagamento_recusado'))
      .toEqual(['coordenacao']);
  });
});
