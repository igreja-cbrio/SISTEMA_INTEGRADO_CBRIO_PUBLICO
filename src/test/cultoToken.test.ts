










import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { gerarTokenCulto, verificarTokenCulto, montarLinkCulto } from '../../backend/utils/cultoToken.js';

const ID = '7c1d2e3f-8a9b-4c5d-9e0f-abcdef123456';
const SEC = 'segredo-de-teste';
const original = { ...process.env };

beforeEach(() => { process.env.CULTO_TOKEN_SECRET = SEC; delete process.env.CRON_SECRET; });
afterEach(() => { process.env = { ...original }; });

describe('ida e volta', () => {
  it('gera e verifica o mesmo culto', () => {
    const t = gerarTokenCulto(ID);
    expect(t).toMatch(/^[0-9a-f]{32}\.[0-9a-f]{20}$/);
    expect(verificarTokenCulto(t)).toBe(ID);
  });

  it('aceita id em maiúsculas e com espaços em volta do token', () => {
    const t = gerarTokenCulto(ID.toUpperCase());
    expect(verificarTokenCulto(`  ${t!.toUpperCase()}  `)).toBe(ID);
  });

  it('id inválido não gera token', () => {
    expect(gerarTokenCulto('nao-e-uuid')).toBeNull();
    expect(gerarTokenCulto(null as any)).toBeNull();
  });
});

describe('⚠️ fail-closed sem segredo', () => {
  it('sem segredo nenhum, não gera e não aceita', () => {
    const t = gerarTokenCulto(ID);
    delete process.env.CULTO_TOKEN_SECRET;
    delete process.env.CRON_SECRET;
    expect(gerarTokenCulto(ID)).toBeNull();
    expect(verificarTokenCulto(t)).toBeNull();


    expect(montarLinkCulto(ID, 'https://cbrio.org')).toBeNull();
  });

  it('cai no CRON_SECRET quando não há o específico', () => {
    delete process.env.CULTO_TOKEN_SECRET;
    process.env.CRON_SECRET = 'outro-segredo';
    const t = gerarTokenCulto(ID);
    expect(verificarTokenCulto(t)).toBe(ID);
  });
});

describe('⚠️ assinatura', () => {
  it('assinatura adulterada não passa', () => {
    const t = gerarTokenCulto(ID)!;
    const [id, sig] = t.split('.');
    const trocado = sig[0] === 'a' ? 'b' : 'a';
    expect(verificarTokenCulto(`${id}.${trocado}${sig.slice(1)}`)).toBeNull();
  });

  it('⚠️⚠️ trocar o CULTO sem reassinar não passa', () => {



    const t = gerarTokenCulto(ID)!;
    const outro = 'ffffffffffffffffffffffffffffffff';
    expect(verificarTokenCulto(`${outro}.${t.split('.')[1]}`)).toBeNull();
  });

  it('segredo trocado invalida os links antigos', () => {
    const t = gerarTokenCulto(ID)!;
    process.env.CULTO_TOKEN_SECRET = 'outro';
    expect(verificarTokenCulto(t)).toBeNull();
  });

  it('lixo não derruba a verificação', () => {
    for (const v of ['', '   ', 'abc', 'a.b', `${'0'.repeat(32)}.${'0'.repeat(19)}`, null, undefined]) {
      expect(verificarTokenCulto(v as any)).toBeNull();
    }
  });
});

describe('⚠️⚠️ namespace — token de outro fluxo NÃO vale aqui', () => {
  it('token da escala (mesmo segredo, outro namespace) é recusado', () => {



    const idNorm = ID.replace(/-/g, '');
    const daEscala = createHmac('sha256', SEC).update(`escala-resposta:${idNorm}`).digest('hex').slice(0, 20);
    expect(verificarTokenCulto(`${idNorm}.${daEscala}`)).toBeNull();
  });

  it('token do censo (mesmo segredo, outro namespace) é recusado', () => {
    const idNorm = ID.replace(/-/g, '');
    const doCenso = createHmac('sha256', SEC).update(`censo-atualizacao:${idNorm}`).digest('hex').slice(0, 20);
    expect(verificarTokenCulto(`${idNorm}.${doCenso}`)).toBeNull();
  });

  it('token sem namespace nenhum é recusado', () => {
    const idNorm = ID.replace(/-/g, '');
    const cru = createHmac('sha256', SEC).update(idNorm).digest('hex').slice(0, 20);
    expect(verificarTokenCulto(`${idNorm}.${cru}`)).toBeNull();
  });

  it('o token daqui não vale em OUTRO fluxo (namespace é mão dupla)', () => {
    const idNorm = ID.replace(/-/g, '');
    const daqui = gerarTokenCulto(ID)!.split('.')[1];
    const esperadoNoCenso = createHmac('sha256', SEC).update(`censo-atualizacao:${idNorm}`).digest('hex').slice(0, 20);
    expect(daqui).not.toBe(esperadoNoCenso);
  });
});

describe('montarLinkCulto', () => {
  it('monta com a base dada e sem barra dupla', () => {
    expect(montarLinkCulto(ID, 'https://cbrio.org/')).toMatch(/^https:\/\/cbrio\.org\/c\/[0-9a-f]{32}\.[0-9a-f]{20}$/);
  });
});
