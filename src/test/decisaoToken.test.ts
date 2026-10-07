





import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as tok from '../../backend/utils/decisaoToken.js';
import * as tokCulto from '../../backend/utils/cultoToken.js';

const { gerarTokenDecisao, verificarTokenDecisao, montarLinkDecisao } = tok as {
  gerarTokenDecisao: (id: unknown) => string | null;
  verificarTokenDecisao: (t: unknown) => string | null;
  montarLinkDecisao: (id: unknown, base?: string) => string | null;
};
const { gerarTokenCulto, verificarTokenCulto } = tokCulto as {
  gerarTokenCulto: (id: unknown) => string | null;
  verificarTokenCulto: (t: unknown) => string | null;
};

const CULTO = '11111111-2222-3333-4444-555555555555';
const OUTRO = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
let secretAntes: string | undefined;

beforeAll(() => { secretAntes = process.env.CULTO_TOKEN_SECRET; process.env.CULTO_TOKEN_SECRET = 'segredo-de-teste'; });
afterAll(() => {
  if (secretAntes === undefined) delete process.env.CULTO_TOKEN_SECRET;
  else process.env.CULTO_TOKEN_SECRET = secretAntes;
});

describe('token da decisão online', () => {
  it('vai e volta no mesmo culto', () => {
    expect(verificarTokenDecisao(gerarTokenDecisao(CULTO))).toBe(CULTO);
  });

  it('token de um culto não vira outro', () => {
    expect(verificarTokenDecisao(gerarTokenDecisao(OUTRO))).toBe(OUTRO);
    expect(gerarTokenDecisao(CULTO)).not.toBe(gerarTokenDecisao(OUTRO));
  });






  it('recusa token do LINK DO VOLUNTÁRIO, mesmo com o mesmo culto e o mesmo segredo', () => {
    expect(verificarTokenDecisao(gerarTokenCulto(CULTO))).toBeNull();
  });

  it('e o token daqui não é aceito no fluxo do voluntário', () => {
    expect(verificarTokenCulto(gerarTokenDecisao(CULTO))).toBeNull();
  });

  it('assinatura adulterada é recusada', () => {
    const t = gerarTokenDecisao(CULTO)!;
    const [id, sig] = t.split('.');
    const trocado = sig[0] === 'a' ? 'b' : 'a';
    expect(verificarTokenDecisao(`${id}.${trocado}${sig.slice(1)}`)).toBeNull();
  });

  it('id trocado com assinatura antiga é recusado', () => {
    const t = gerarTokenDecisao(CULTO)!;
    const sig = t.split('.')[1];
    expect(verificarTokenDecisao(`${OUTRO.replace(/-/g, '')}.${sig}`)).toBeNull();
  });

  it('lixo, vazio e nulo não viram culto', () => {
    for (const v of ['', 'abc', null, undefined, '../../etc', '11111111.2222']) {
      expect(verificarTokenDecisao(v)).toBeNull();
    }
  });

  it('id que não é UUID não gera token', () => {
    expect(gerarTokenDecisao('nao-e-uuid')).toBeNull();
    expect(gerarTokenDecisao('')).toBeNull();
  });

  it('o link aponta para /decisao/<token>', () => {
    const l = montarLinkDecisao(CULTO, 'https://www.cbrio.org')!;
    expect(l.startsWith('https://www.cbrio.org/decisao/')).toBe(true);
    expect(verificarTokenDecisao(l.split('/decisao/')[1])).toBe(CULTO);
  });

  it('barra sobrando na base não vira barra dupla', () => {
    expect(montarLinkDecisao(CULTO, 'https://www.cbrio.org/')).not.toContain('.org//');
  });
});

describe('⚠️ fail-closed sem segredo', () => {
  it('não gera link nem aceita token quando não há segredo', () => {
    const t = gerarTokenDecisao(CULTO)!;
    const antes = process.env.CULTO_TOKEN_SECRET;
    const antesCron = process.env.CRON_SECRET;
    delete process.env.CULTO_TOKEN_SECRET;
    delete process.env.CRON_SECRET;
    try {


      expect(gerarTokenDecisao(CULTO)).toBeNull();
      expect(montarLinkDecisao(CULTO)).toBeNull();
      expect(verificarTokenDecisao(t)).toBeNull();
    } finally {
      if (antes !== undefined) process.env.CULTO_TOKEN_SECRET = antes;
      if (antesCron !== undefined) process.env.CRON_SECRET = antesCron;
    }
  });
});
