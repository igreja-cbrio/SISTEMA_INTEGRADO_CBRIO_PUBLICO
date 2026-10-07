import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  APROV_TTL_MS,
  TOKEN_TTL_MS,
  RENOV_TTL_MS,
  CONFIRA_TTL_MS,
  assinarToken,
  verificarToken,
} from '../../backend/utils/gruposToken.js';






















const SEGREDO = 'segredo-de-teste-só-do-vitest';
const ENVS = ['GRUPOS_TOKEN_SECRET', 'CRON_SECRET'] as const;
const original: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENVS) original[k] = process.env[k];
  process.env.GRUPOS_TOKEN_SECRET = SEGREDO;
  delete process.env.CRON_SECRET;
});

afterEach(() => {
  for (const k of ENVS) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k] as string;
  }
});

const DIA = 24 * 60 * 60 * 1000;


const T0 = Date.parse('2026-08-12T12:00:00-03:00');


const TEMPORADA_ABERTA = { aceitarExpirado: true };
const TEMPORADA_FECHADA = { aceitarExpirado: false };

describe('TTL · o link de aprovação passou de 7 para 30 dias', () => {
  it('aprovação dura 30 dias', () => {
    expect(APROV_TTL_MS).toBe(30 * DIA);
  });

  it('o default histórico de 7 dias continua valendo para os outros links', () => {


    expect(TOKEN_TTL_MS).toBe(7 * DIA);
    expect(RENOV_TTL_MS).toBe(30 * DIA);
    expect(CONFIRA_TTL_MS).toBe(30 * DIA);
  });

  it('token de aprovação recém-assinado ainda vale no 29º dia', () => {
    const t = assinarToken('aprov', 'pedido-1', { l: 'lider-1' }, APROV_TTL_MS, T0);
    expect(verificarToken(t, 'aprov', T0 + 29 * DIA)).toMatchObject({ p: 'pedido-1', l: 'lider-1' });
  });
});

describe('validade = TEMPORADA · o link já entregue abre enquanto ela estiver aberta', () => {


  const tokenAntigo = () => assinarToken('aprov', 'pedido-antigo', { l: 'lider-1' }, 7 * DIA, T0 - 15 * DIA);

  it('aceita o token vencido com a temporada ABERTA', () => {
    const p = verificarToken(tokenAntigo(), 'aprov', T0, TEMPORADA_ABERTA);
    expect(p).toMatchObject({ p: 'pedido-antigo', l: 'lider-1', prorrogado: true });
  });

  it('RECUSA o mesmo token com a temporada FECHADA', () => {


    expect(verificarToken(tokenAntigo(), 'aprov', T0, TEMPORADA_FECHADA)).toBeNull();
  });

  it('vale MUITO depois do fim de agosto (a data fixa antiga não manda mais)', () => {
    const dezembro = Date.parse('2026-12-20T12:00:00-03:00');
    expect(verificarToken(tokenAntigo(), 'aprov', dezembro, TEMPORADA_ABERTA)).toMatchObject({ prorrogado: true });
  });

  it('⚠️ o DEFAULT é não prorrogar — quem não passa opts não prorroga', () => {


    expect(verificarToken(tokenAntigo(), 'aprov', T0)).toBeNull();
    expect(verificarToken(tokenAntigo(), 'aprov', T0, {})).toBeNull();
  });

  it('só o booleano `true` abre — valor "quase verdadeiro" não serve', () => {


    for (const v of ['true', 1, {}, [], 'sim']) {
      expect(verificarToken(tokenAntigo(), 'aprov', T0, { aceitarExpirado: v as never })).toBeNull();
    }
  });

  it('marca `prorrogado` só quando de fato prorrogou', () => {


    const novo = assinarToken('aprov', 'pedido-novo', { l: 'lider-1' }, APROV_TTL_MS, T0);
    expect(verificarToken(novo, 'aprov', T0 + DIA, TEMPORADA_ABERTA)).not.toHaveProperty('prorrogado');
  });

  it('dentro do TTL o link abre mesmo com a temporada fechada', () => {


    const novo = assinarToken('aprov', 'pedido-novo', { l: 'lider-1' }, APROV_TTL_MS, T0);
    expect(verificarToken(novo, 'aprov', T0 + DIA, TEMPORADA_FECHADA)).toMatchObject({ p: 'pedido-novo' });
  });
});

describe('⚠️ o que a prorrogação NÃO pode virar', () => {
  it('NÃO vale para os outros tipos de link, NEM com a temporada aberta', () => {




    for (const tipo of ['suges', 'freq', 'renov', 'conf']) {
      const t = assinarToken(tipo, 'x', { l: 'lider-1' }, 7 * DIA, T0 - 15 * DIA);
      expect(verificarToken(t, tipo, T0, TEMPORADA_ABERTA)).toBeNull();
    }
  });

  it('NÃO dispensa a assinatura — token forjado continua recusado', () => {
    const t = assinarToken('aprov', 'pedido-antigo', { l: 'lider-1' }, 7 * DIA, T0 - 15 * DIA);
    const [json] = t.split('.');
    expect(verificarToken(`${json}.assinaturaInventada12345`, 'aprov', T0, TEMPORADA_ABERTA)).toBeNull();


    const outro = Buffer.from(
      JSON.stringify({ t: 'aprov', p: 'pedido-de-outra-pessoa', l: 'lider-1', exp: T0 + DIA }),
    ).toString('base64url');
    const [, sig] = t.split('.');
    expect(verificarToken(`${outro}.${sig}`, 'aprov', T0, TEMPORADA_ABERTA)).toBeNull();
  });

  it('NÃO aceita token de outro tipo remarcado como aprovação', () => {


    const t = assinarToken('conf', 'grupo-1', { l: 'lider-1' }, 7 * DIA, T0 - 15 * DIA);
    expect(verificarToken(t, 'aprov', T0, TEMPORADA_ABERTA)).toBeNull();
  });

  it('continua fail-closed sem segredo configurado', () => {
    const t = assinarToken('aprov', 'pedido-antigo', { l: 'lider-1' }, 7 * DIA, T0 - 15 * DIA);
    delete process.env.GRUPOS_TOKEN_SECRET;
    delete process.env.CRON_SECRET;
    expect(verificarToken(t, 'aprov', T0, TEMPORADA_ABERTA)).toBeNull();
    expect(() => assinarToken('aprov', 'p', {}, APROV_TTL_MS, T0)).toThrow();
  });

  it('token sem `exp` é recusado, temporada aberta ou não', () => {

    const semExp = Buffer.from(JSON.stringify({ t: 'aprov', p: 'x', l: 'lider-1' })).toString('base64url');
    const crypto = require('crypto');
    const sig = crypto.createHmac('sha256', SEGREDO).update(semExp).digest('base64url').slice(0, 24);
    expect(verificarToken(`${semExp}.${sig}`, 'aprov', T0, TEMPORADA_ABERTA)).toBeNull();
  });
});
