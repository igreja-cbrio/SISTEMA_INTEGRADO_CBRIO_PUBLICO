import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { semComentarios } from './utils/notificarEstatico';




























const raiz = (p: string) => resolve(__dirname, '../../', p);
const ler = (p: string) => semComentarios(readFileSync(raiz(p), 'utf-8'));

type Cron = { path: string; schedule: string };
const VERCEL = JSON.parse(readFileSync(raiz('vercel.json'), 'utf-8')) as { crons?: Cron[] };
const CRONS: Cron[] = JSON.parse(readFileSync(raiz('src/test/fixtures/crons-contrato.json'), 'utf-8')).crons;

it('a cópia pública não agenda crons de produção', () => {
  expect(VERCEL.crons || []).toEqual([]);
});








const SERVER = ler('backend/server.js');
const MONTAGENS_DO_SERVER = [...SERVER.matchAll(



  /app\.use\('(\/api\/[^']*)',\s*require\('\.\/routes\/([^']+)'\)(?:\.\w+)?\)/g,
)].map(m => ({ prefixo: m[1], arquivo: `backend/routes/${m[2]}.js` }));




function noServerDireto(caminho: string): boolean {
  const base = caminho.split('?')[0];
  return new RegExp(`app\\.(get|post|all)\\('${base.replace(/\//g, '\\/')}'`).test(SERVER);
}


function resolveRota(caminho: string) {
  const semQuery = caminho.split('?')[0];
  const candidatos = MONTAGENS_DO_SERVER
    .filter(m => semQuery === m.prefixo || semQuery.startsWith(`${m.prefixo}/`))
    .sort((a, b) => b.prefixo.length - a.prefixo.length);
  if (!candidatos.length) return null;
  const dono = candidatos[0];
  return { arquivo: dono.arquivo, resto: semQuery.slice(dono.prefixo.length) || '/' };
}

describe('contrato das rotas de cron', () => {
  it('existe pelo menos um cron e todos têm path e schedule', () => {
    expect(CRONS.length).toBeGreaterThan(10);
    for (const c of CRONS) {
      expect(c.path, JSON.stringify(c)).toMatch(/^\/api\//);
      expect(c.schedule, c.path).toMatch(/\S/);
    }
  });

  it('⚠️ nenhum cron aponta para uma rotina que foi removida', () => {



    const paths = CRONS.map(c => c.path);
    expect(paths).not.toContain('/api/kpis/youtube/sync');
  });
});










function posicaoDoAuthenticate(src: string): number {
  const marcas = [
    src.indexOf('router.use(authenticate)'),
    src.indexOf('authenticate(req, res, next)'),
  ].filter(i => i >= 0);
  return marcas.length ? Math.min(...marcas) : -1;
}




const CRONS_ATRAS_DE_AUTH = CRONS
  .map(c => ({ cron: c, dono: resolveRota(c.path) }))
  .filter((x): x is { cron: Cron; dono: { arquivo: string; resto: string } } => !!x.dono)
  .filter(x => posicaoDoAuthenticate(ler(x.dono.arquivo)) >= 0);

describe('cron atrás de authenticate · a liberação existe e é explícita', () => {
  it('o extrator achou as montagens do server.js e algum cron atrás de auth', () => {
    expect(MONTAGENS_DO_SERVER.length).toBeGreaterThan(20);
    expect(CRONS_ATRAS_DE_AUTH.length).toBeGreaterThan(0);
  });

  it('todo cron do contrato tem um arquivo de rota que o atende', () => {

    for (const c of CRONS) {
      if (noServerDireto(c.path)) continue;
      expect(resolveRota(c.path), `${c.path} não casa com nenhum app.use do server.js`)
        .not.toBeNull();
    }
  });

  for (const { cron, dono } of CRONS_ATRAS_DE_AUTH) {
    it(`${dono.arquivo} · '${dono.resto}' é alcançável pelo cron`, () => {









      const src = ler(dono.arquivo);
      const iAuth = posicaoDoAuthenticate(src);
      const reg = new RegExp(`router\\.(get|post|all)\\('${dono.resto.replace(/\//g, '\\/')}'`);
      const achou = reg.exec(src);




      const vizinhos = MONTAGENS_DO_SERVER
        .filter(m => m.arquivo !== dono.arquivo && ler(m.arquivo).match(reg));
      expect(
        achou !== null || vizinhos.length > 0,
        `${dono.resto} não está registrada em ${dono.arquivo} nem em nenhum router vizinho`,
      ).toBe(true);
      const antesDoAuth = achou !== null && achou.index < iAuth;
      const liberadaPorCaminho = src.includes('CAMINHOS_DE_CRON.has(req.path)')
        && new RegExp(`CAMINHOS_DE_CRON[\\s\\S]{0,600}'${dono.resto.replace(/\//g, '\\/')}'`).test(src);



      const liberadaPorPrefixo = dono.resto.startsWith('/cron/')
        && /req\.path\.startsWith\('\/cron\/'\)\s*&&\s*isAuthorizedCron\(req\)/.test(src);
      expect(
        antesDoAuth || liberadaPorCaminho || liberadaPorPrefixo,
        `${dono.arquivo}${dono.resto}: fica DEPOIS do authenticate e não está liberada `
        + '(nem por caminho, nem pelo prefixo /cron/) ⇒ o cron leva 401 antes do '
        + 'handler, todos os dias, em silêncio',
      ).toBe(true);






      if (liberadaPorCaminho || liberadaPorPrefixo) {
        const iDesvio = Math.max(
          src.indexOf("CAMINHOS_DE_CRON.has(req.path)"),
          src.indexOf("req.path.startsWith('/cron/')"),
        );
        const authGlobalDepois = src.indexOf('router.use(authenticate)', iDesvio);
        expect(
          authGlobalDepois,
          `${dono.arquivo}: tem router.use(authenticate) DEPOIS do desvio de cron — o desvio não serve pra nada`,
        ).toBe(-1);
      }
    });

    it(`⚠️ ${dono.arquivo} · '${dono.resto}' aceita GET (o Vercel Cron não usa POST)`, () => {
      const rota = dono.resto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const get = new RegExp(`router\\.(get|all)\\('${rota}'`);

      const ondeEstá = [dono.arquivo, ...MONTAGENS_DO_SERVER.map(m => m.arquivo)]
        .filter(a => new RegExp(`router\\.(get|post|all)\\('${rota}'`).test(ler(a)));
      expect(ondeEstá.length, `${dono.resto} não está registrada em lugar nenhum`).toBeGreaterThan(0);
      expect(
        ondeEstá.some(a => get.test(ler(a))),
        `${dono.resto} só aceita POST — o Vercel Cron chama por GET`,
      ).toBe(true);
    });
  }

  it('⚠️ a liberação SÓ vale com segredo de cron válido', () => {





    for (const { dono } of CRONS_ATRAS_DE_AUTH) {
      const src = ler(dono.arquivo);
      const usaDesvio = src.includes('CAMINHOS_DE_CRON.has(req.path)')
        || src.includes("req.path.startsWith('/cron/')");
      if (!usaDesvio) continue;
      expect(
        /(?:CAMINHOS_DE_CRON\.has\(req\.path\)|req\.path\.startsWith\('\/cron\/'\))\s*&&\s*isAuthorizedCron\(req\)/
          .test(src),
        `${dono.arquivo}: o desvio de cron não exige isAuthorizedCron — é passe livre`,
      ).toBe(true);
    }
  });

  it('a liberação NÃO é um passe livre para o router inteiro', () => {



    for (const { dono } of CRONS_ATRAS_DE_AUTH) {
      const src = ler(dono.arquivo);
      if (!src.includes('CAMINHOS_DE_CRON')) continue;
      expect(src).toContain('CAMINHOS_DE_CRON.has(req.path)');
    }
  });
});
