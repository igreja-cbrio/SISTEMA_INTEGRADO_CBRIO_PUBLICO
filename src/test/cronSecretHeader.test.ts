
















import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const raiz = resolve(__dirname, '../..');
const ler = (p: string) => readFileSync(resolve(raiz, p), 'utf8');




function semComentarios(src: string): string {
  return src
    .split('\n')
    .map((l) => l.replace(/(^|[^:])\/\/[^\n]*$/, '$1'))
    .filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
    .join('\n');
}

const cronAuth = semComentarios(ler('backend/utils/cronAuth.js'));
const online = semComentarios(ler('backend/routes/online.js'));

describe('⚠️⚠️ isAuthorizedCron NUNCA lê a query string', () => {
  it('a régua não toca em req.query', () => {

    expect(cronAuth).not.toMatch(/req\.query/);
  });

  it('lê os dois headers e nada mais', () => {
    expect(cronAuth).toContain("req.headers['x-cron-secret']");
    expect(cronAuth).toContain("req.headers['authorization']");
  });

  it('⚠️ compara em tempo constante e falha FECHADO sem segredo', () => {
    expect(cronAuth).toContain('timingSafeEqual');

    expect(cronAuth).toMatch(/if \(!secret\) return false/);
  });
});

describe('⚠️ existe caminho HUMANO para o disparo manual', () => {


  const paresCronHumano = [
    ['/cron/views-dia-collect', '/coletar/views-dia'],
    ['/cron/ds-collect', '/coletar/ds'],
    ['/cron/ddus-collect', '/coletar/ddus'],
  ];

  it('todo cron de coleta do Online tem gêmeo autenticado por sessão', () => {
    for (const [cron, humano] of paresCronHumano) {
      expect(online, `sem rota de cron ${cron}`).toContain(`'${cron}'`);
      expect(online, `sem caminho humano ${humano}`).toContain(`'${humano}'`);
    }
  });

  it('⚠️ o caminho humano é gated por permissão, não por segredo', () => {
    const i = online.indexOf("router.post('/coletar/views-dia'");
    expect(i, 'sem rota manual de views-dia').toBeGreaterThan(-1);
    const linha = online.slice(i, online.indexOf('\n', i));






    expect(linha).toMatch(/authorize\(|authorizeModule\(/);


    expect(linha).not.toContain('autorizaCron');
  });

  it('⚠️ o caminho do CRON continua exigindo o segredo', () => {

    const i = online.indexOf("router.get('/cron/views-dia-collect'");
    expect(i).toBeGreaterThan(-1);
    expect(online.slice(i, online.indexOf('\n', i))).toContain('autorizaCron');
  });
});
