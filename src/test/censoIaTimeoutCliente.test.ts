














import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(__dirname, '..', '..');
const rotas = readFileSync(join(RAIZ, 'backend/routes/censo.js'), 'utf8');
const api = readFileSync(join(RAIZ, 'src/api.js'), 'utf8');




const fnsIa = [...rotas.matchAll(/const \{([^}]+)\} = require\('[^']*IA'\)/g)]
  .flatMap((m) => m[1].split(',').map((x) => x.trim().split(':')[0].trim()))
  .filter(Boolean);


const blocos = [...rotas.matchAll(/router\.post\('([^']+)'[\s\S]*?(?=\nrouter\.[a-z]+\(|\nmodule\.exports)/g)];
const postsDeIa = blocos.filter((m) => fnsIa.some((f) => new RegExp(`\\b${f}\\b`).test(m[0]))).map((m) => m[1]);

describe('⚠️⚠️ rota de IA do censo exige timeout explícito no cliente', () => {
  it('o backend declara pelo menos duas rotas de IA (premissa)', () => {
    expect(fnsIa.length, 'nenhuma função importada de um serviço *IA.js em routes/censo.js').toBeGreaterThan(0);
    expect(postsDeIa.length, `nenhum POST de IA encontrado (funções: ${fnsIa.join(', ')})`)
      .toBeGreaterThanOrEqual(2);
  });

  it.each(['/ia', '/relatorio'])('POST /censo%s tem timeout no api.js', (rota) => {
    expect(postsDeIa, `POST '${rota}' deixou de ser rota de IA — reveja este teste`).toContain(rota);

    const re = new RegExp(`post\\('/censo${rota}'[^\\n]*timeout:\\s*\\d`);
    expect(api, `\`post('/censo${rota}', …)\` sem \`timeout\` — vai morrer aos 30s e mentir que falhou`)
      .toMatch(re);
  });

  it('e o timeout cobre o maxDuration da função (senão o cliente desiste primeiro)', () => {
    const maxDur = Number(JSON.parse(readFileSync(join(RAIZ, 'vercel.json'), 'utf8'))
      .functions?.['api/index.js']?.maxDuration || 0);
    expect(maxDur, 'maxDuration sumiu do vercel.json').toBeGreaterThan(0);
    for (const rota of ['/ia', '/relatorio']) {
      const m = api.match(new RegExp(`post\\('/censo${rota}'[^\\n]*timeout:\\s*(\\d[\\d_]*)`));
      expect(m, `sem timeout em /censo${rota}`).not.toBeNull();
      const ms = Number(String(m![1]).replace(/_/g, ''));
      expect(ms / 1000, `/censo${rota}: cliente desiste antes do servidor (max ${maxDur}s)`)
        .toBeGreaterThanOrEqual(maxDur);
    }
  });
});
