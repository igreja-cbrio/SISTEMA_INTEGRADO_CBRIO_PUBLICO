
























import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(__dirname, '..', '..');
const semComentarios = (src: string) => src
  .split('\n')
  .map((l) => l.replace(/(^|[^:])\/\/[^\n]*/, '$1'))
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '');

const fonte = () => semComentarios(readFileSync(join(RAIZ, 'backend/routes/online.js'), 'utf8'));


const rotasDeColeta = () =>
  [...fonte().matchAll(/router\.post\('(\/coletar\/[^']+)',\s*([A-Za-z]+)\(/g)]
    .map((m) => ({ rota: m[1], gate: m[2] }));

describe('⚠️ coleta é operação do módulo, não privilégio de cargo', () => {
  it('existem rotas de coleta (a busca não pode passar por vazio)', () => {
    expect(rotasDeColeta().length).toBeGreaterThanOrEqual(8);
  });

  it('TODA rota de coleta usa authorizeModule, nenhuma usa authorize de cargo', () => {
    const porCargo = rotasDeColeta().filter((r) => r.gate !== 'authorizeModule');
    expect(porCargo.map((r) => r.rota), 'coleta trancada por cargo').toEqual([]);
  });

  it('o nível exigido é 3 — o mesmo de /comunidade-mensal', () => {
    const src = fonte();
    for (const { rota } of rotasDeColeta()) {
      const i = src.indexOf(`router.post('${rota}'`);
      const linha = src.slice(i, i + 200);
      expect(linha, `${rota} com nível diferente`).toContain("authorizeModule('online', 3)");
    }
  });
});

describe('⚠️⚠️ o que NÃO foi liberado junto', () => {


  it('/oauth/disconnect continua exigindo admin ou diretor', () => {
    const src = fonte();
    const i = src.indexOf("router.post('/oauth/disconnect'");
    expect(i, 'rota /oauth/disconnect sumiu').toBeGreaterThan(-1);
    expect(src.slice(i, i + 200)).toContain("authorize('admin', 'diretor')");
  });

  it('/sync continua exigindo admin ou diretor', () => {
    const src = fonte();
    const i = src.indexOf("router.post('/sync'");
    expect(i, 'rota /sync sumiu').toBeGreaterThan(-1);
    expect(src.slice(i, i + 200)).toContain("authorize('admin', 'diretor')");
  });
});









describe('⚠️ o card de séries saiu da tela, o dado não', () => {
  it('a tela não mostra mais "Cliques em séries"', () => {
    const tela = readFileSync(join(RAIZ, 'src/pages/ministerial/Online.tsx'), 'utf8');
    const semCom = semComentarios(tela);
    expect(semCom).not.toContain('Cliques em séries');
    expect(semCom).not.toContain('cliques_series');
  });





  it('⚠️⚠️ o collector continua GRAVANDO cliques_series_pct', () => {
    const col = semComentarios(readFileSync(join(RAIZ, 'backend/services/onlineCollectors.js'), 'utf8'));
    expect(col, 'a coleta do CTR foi removida junto com o card').toContain('cliques_series_pct:');
  });

  it('o painel não expõe mais a métrica', () => {
    const painel = semComentarios(readFileSync(join(RAIZ, 'backend/routes/painel.js'), 'utf8'));
    expect(painel).not.toContain('eng_cliques_series');
  });
});
