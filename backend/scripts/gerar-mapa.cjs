#!/usr/bin/env node
'use strict';




































const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..', '..');
const SAIDA = path.join(RAIZ, 'docs', 'mapa');









function acharApp(nome) {
  const doEnv = process.env[`MAPA_DIR_${nome.toUpperCase().replace(/-/g, '_')}`];
  const candidatos = [
    doEnv,
    path.resolve(RAIZ, '..', nome),
    path.join(process.env.HOME || '', 'Documents', nome),
    path.join(process.env.HOME || '', nome),
  ].filter(Boolean);
  return candidatos.find((d) => fs.existsSync(path.join(d, 'app'))) || null;
}

const APPS = [
  { nome: 'Aplicativo-CBRio', rotulo: 'App dos membros' },
  { nome: 'CBRio-Staff', rotulo: 'App do staff' },
].map((a) => ({ ...a, dir: acharApp(a.nome) }));



function ler(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}






function semComentarios(src) {
  return String(src || '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/(^|[^:'"`\\])\/\/[^\n]*$/, '$1'))
    .join('\n');
}

function listarArquivos(dir, filtro, acc = []) {
  let itens;
  try { itens = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const it of itens) {
    if (it.name === 'node_modules' || it.name.startsWith('.')) continue;
    const p = path.join(dir, it.name);
    if (it.isDirectory()) listarArquivos(p, filtro, acc);
    else if (filtro(it.name)) acc.push(p);
  }
  return acc;
}

const rel = (p, base = RAIZ) => path.relative(base, p).split(path.sep).join('/');
const unico = (a) => [...new Set(a)].sort();



function lerAppTsx() {
  const bruto = ler(path.join(RAIZ, 'src', 'App.tsx'));
  if (!bruto) return { componentes: {}, rotas: [] };
  const src = semComentarios(bruto);


  const componentes = {};
  const reLazy = /const\s+([A-Z][A-Za-z0-9_]*)\s*=\s*(?:lazyWithRetry|lazy)\s*\(\s*\(\)\s*=>\s*import\(\s*['"]([^'"]+)['"]/g;
  for (const m of src.matchAll(reLazy)) componentes[m[1]] = m[2];








  const rotas = [];
  const pedacos = src.split(/<Route\s/).slice(1);
  for (const pedaco of pedacos) {
    const mPath = pedaco.match(/^\s*path=["']([^"']+)["']/);
    if (!mPath) continue;
    const caminho = mPath[1];
    const corpo = pedaco;
    const guard = corpo.match(/moduleSlug=["']([^"']+)["']/);
    const nivel = corpo.match(/nivelMinimo=\{?\s*(\d+)/);

    let componente = null;
    for (const t of corpo.matchAll(/<([A-Z][A-Za-z0-9_]*)/g)) {
      if (componentes[t[1]]) { componente = t[1]; break; }
    }
    rotas.push({
      caminho,
      modulo: guard ? guard[1] : null,
      nivel: nivel ? Number(nivel[1]) : null,
      componente,
      arquivo: componente ? componentes[componente] : null,
      redireciona: /<Navigate\s/.test(corpo),
      publica: !/<ProtectedRoute/.test(corpo),
    });
  }
  return { componentes, rotas };
}



function lerRouteModuleMap() {
  const bruto = ler(path.join(RAIZ, 'backend', 'middleware', 'auth.js'));
  if (!bruto) return {};
  const bloco = semComentarios(bruto).match(/const\s+ROUTE_MODULE_MAP\s*=\s*\{([\s\S]*?)\n\};/);
  if (!bloco) return {};
  const mapa = {};
  for (const m of bloco[1].matchAll(/['"]([a-z0-9-]+)['"]\s*:\s*\[([^\]]*)\]/gi)) {
    mapa[m[1]] = [...m[2].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
  }
  return mapa;
}



function lerMontagens() {
  const bruto = ler(path.join(RAIZ, 'backend', 'server.js'));
  if (!bruto) return [];
  const out = [];
  const re = /app\.use\(\s*['"](\/api\/[^'"]*)['"]\s*,\s*require\(\s*['"]\.\/routes\/([^'"]+)['"]/g;
  for (const m of semComentarios(bruto).matchAll(re)) {
    out.push({ prefixo: m[1], arquivo: `backend/routes/${m[2].replace(/\.js$/, '')}.js` });
  }
  return out;
}



function lerRotasBackend() {
  const arquivos = listarArquivos(path.join(RAIZ, 'backend', 'routes'), (n) => n.endsWith('.js') && !n.endsWith('.test.js'));
  const porArquivo = {};
  for (const p of arquivos) {
    const src = semComentarios(ler(p));
    if (!src) continue;
    const endpoints = [];
    for (const m of src.matchAll(/router\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]*)['"`]/g)) {
      endpoints.push({ metodo: m[1].toUpperCase(), caminho: m[2] || '/' });
    }
    const guards = [];
    for (const m of src.matchAll(/authorizeModule\(\s*['"]([a-z0-9-]+)['"](?:\s*,\s*(\d+))?/gi)) {
      guards.push({ modulo: m[1], nivel: m[2] ? Number(m[2]) : null });
    }
    const tabelas = unico([...src.matchAll(/\.from\(\s*['"]([a-z0-9_]+)['"]/gi)].map((m) => m[1]));
    const rpcs = unico([...src.matchAll(/\.rpc\(\s*['"]([a-z0-9_]+)['"]/gi)].map((m) => m[1]));
    const utils = unico([...src.matchAll(/require\(\s*['"]\.\.\/utils\/([a-zA-Z0-9_]+)['"]/g)].map((m) => m[1]));
    const services = unico([...src.matchAll(/require\(\s*['"]\.\.\/services\/([a-zA-Z0-9_]+)['"]/g)].map((m) => m[1]));
    porArquivo[rel(p)] = { endpoints, guards, tabelas, rpcs, utils, services };
  }
  return porArquivo;
}



function lerApiJs() {
  const bruto = ler(path.join(RAIZ, 'src', 'api.js'));
  if (!bruto) return {};
  const src = semComentarios(bruto);

  const marcas = [...src.matchAll(/^export const ([a-zA-Z0-9_]+)\s*=\s*\{/gm)];
  const ns = {};
  marcas.forEach((m, i) => {
    const ini = m.index;
    const fim = i + 1 < marcas.length ? marcas[i + 1].index : src.length;
    const corpo = src.slice(ini, fim);
    const caminhos = unico(
      [...corpo.matchAll(/['"`](\/[a-z0-9][^'"`\s]*)['"`]/gi)]
        .map((x) => x[1].split('?')[0].replace(/\$\{[^}]*\}/g, ':id'))
        .filter((c) => c.length > 1)
    );
    if (caminhos.length) ns[m[1]] = caminhos;
  });
  return ns;
}



function lerUtils() {
  const arquivos = listarArquivos(path.join(RAIZ, 'backend', 'utils'), (n) => n.endsWith('.js') && !n.includes('.test.'));
  const testes = listarArquivos(path.join(RAIZ, 'src', 'test'), (n) => /\.(ts|js)$/.test(n))
    .concat(listarArquivos(path.join(RAIZ, 'backend'), (n) => n.endsWith('.test.js')));
  const conteudoTestes = testes.map((t) => ({ arquivo: rel(t), src: ler(t) || '' }));

  const out = {};
  for (const p of arquivos) {
    const nome = path.basename(p, '.js');
    const cobertoPor = conteudoTestes
      .filter((t) => t.src.includes(`utils/${nome}`))
      .map((t) => t.arquivo);
    out[nome] = { arquivo: rel(p), cobertoPor: unico(cobertoPor) };
  }
  return out;
}



function lerCrons() {
  try {
    const j = JSON.parse(ler(path.join(RAIZ, 'vercel.json')) || '{}');
    return (j.crons || []).map((c) => ({ caminho: c.path, quando: c.schedule }));
  } catch { return []; }
}



function lerApp(app) {
  if (!app.dir || !fs.existsSync(app.dir)) return null;
  const telas = listarArquivos(path.join(app.dir, 'app'), (n) => n.endsWith('.tsx'))
    .filter((p) => !path.basename(p).startsWith('_'));
  const reChamada = /api(?:Get|Post|Patch|Put|Delete|Upload)(?:<[^>]*>)?\(\s*['"`]([^'"`]+)/g;

  const porTela = telas.map((p) => {
    const src = semComentarios(ler(p));
    const chamadas = unico([...(src || '').matchAll(reChamada)]
      .map((m) => m[1].replace(/\$\{[^}]*\}/g, ':id').split('?')[0]));

    const rota = '/' + rel(p, path.join(app.dir, 'app'))
      .replace(/\.tsx$/, '')
      .replace(/\([^)]*\)\//g, '')
      .replace(/\/index$/, '');
    return { arquivo: rel(p, app.dir), rota, chamadas };
  });

  const varrer = (sub, ext) => listarArquivos(path.join(app.dir, sub), (n) => n.endsWith(ext) && !n.includes('.test.'))
    .map((p) => {
      const src = semComentarios(ler(p));
      return {
        arquivo: rel(p, app.dir),
        chamadas: unico([...(src || '').matchAll(reChamada)]
          .map((m) => m[1].replace(/\$\{[^}]*\}/g, ':id').split('?')[0])),
      };
    });





  const libs = [...varrer('lib', '.ts'), ...varrer('components', '.tsx')];

  return { ...app, telas: porTela.sort((a, b) => a.rota.localeCompare(b.rota)), libs: libs.sort((a, b) => a.arquivo.localeCompare(b.arquivo)) };
}



function montarModelo() {
  const { rotas } = lerAppTsx();
  const routeMap = lerRouteModuleMap();
  const montagens = lerMontagens();
  const rotasBackend = lerRotasBackend();
  const apiNs = lerApiJs();
  const utils = lerUtils();
  const crons = lerCrons();
  const apps = APPS.map(lerApp).filter(Boolean);




  const slugs = new Set();
  for (const v of Object.values(routeMap)) v.forEach((s) => slugs.add(s));
  for (const info of Object.values(rotasBackend)) info.guards.forEach((g) => slugs.add(g.modulo));
  for (const r of rotas) if (r.modulo) slugs.add(r.modulo);

  const modulos = {};
  for (const slug of [...slugs].sort()) {

    const routeKeys = Object.entries(routeMap).filter(([, v]) => v.includes(slug)).map(([k]) => k).sort();


    const arquivosBackend = unico(Object.entries(rotasBackend)
      .filter(([arq, info]) => {
        if (info.guards.some((g) => g.modulo === slug)) return true;
        const mont = montagens.find((m) => m.arquivo === arq);
        if (!mont) return false;
        const chave = mont.prefixo.replace(/^\/api\//, '').replace(/\/$/, '');
        return routeKeys.includes(chave);
      })
      .map(([arq]) => arq));

    const telas = rotas.filter((r) => r.modulo === slug);

    modulos[slug] = {
      slug,
      routeKeys,
      telas,
      arquivosBackend,
      guards: unico(arquivosBackend.flatMap((a) =>
        rotasBackend[a].guards.filter((g) => g.modulo === slug).map((g) => `${g.nivel ?? 'padrão'}`))),
      endpoints: arquivosBackend.flatMap((a) => {
        const mont = montagens.find((m) => m.arquivo === a);
        const pref = mont ? mont.prefixo.replace(/\/$/, '') : '';
        return rotasBackend[a].endpoints.map((e) => `${e.metodo} ${pref}${e.caminho === '/' ? '' : e.caminho}`);
      }).sort(),
      tabelas: unico(arquivosBackend.flatMap((a) => rotasBackend[a].tabelas)),
      rpcs: unico(arquivosBackend.flatMap((a) => rotasBackend[a].rpcs)),
      utils: unico(arquivosBackend.flatMap((a) => rotasBackend[a].utils)),
      services: unico(arquivosBackend.flatMap((a) => rotasBackend[a].services)),
      apiNs: Object.keys(apiNs).filter((n) => n === slug || n === slug.replace(/-/g, '')),
      crons: crons.filter((c) => routeKeys.some((k) => c.caminho.includes(`/api/${k}`))),
    };
  }





  for (const m of Object.values(modulos)) {
    const alvos = new Set();
    for (const e of m.endpoints) {
      const p = e.split(' ')[1] || '';
      const seg = p.replace(/^\/api\/app\//, '').replace(/^\/api\//, '').split('/')[0];
      if (seg) alvos.add(seg);
    }
    alvos.add(m.slug);
    m.noApp = [];
    for (const app of apps) {
      const casa = (chamadas) => chamadas.some((c) => {
        const seg = c.replace(/^\/app\//, '').replace(/^\//, '').split('/')[0];
        return alvos.has(seg);
      });
      for (const t of app.telas) if (casa(t.chamadas)) m.noApp.push(`${app.nome}: \`${t.arquivo}\` (\`${t.rota}\`)`);
      for (const l of app.libs) if (casa(l.chamadas)) m.noApp.push(`${app.nome}: \`${l.arquivo}\``);
    }
    m.noApp = unico(m.noApp);
  }







  const reivindicados = new Set(Object.values(modulos).flatMap((m) => m.arquivosBackend));
  const orfaos = {
    telas: rotas.filter((r) => !r.modulo && !r.redireciona && r.arquivo),
    backend: Object.keys(rotasBackend).filter((a) => !reivindicados.has(a)).sort(),
  };

  return { modulos, apiNs, utils, crons, apps, rotas, montagens, rotasBackend, orfaos };
}



const AVISO = [
  '<!-- GERADO por backend/scripts/gerar-mapa.cjs — NÃO editar à mão. -->',
  '',
  '> ⚠️ **Este mapa responde ONDE algo mora, nunca SE está certo.** Ele é derivado do',
  '> código, então não mente sobre caminho de arquivo, rota ou endpoint. Mas continua',
  '> obrigatório MEDIR: número do banco, se um cron roda, se uma coluna existe, o que a',
  '> definição **viva** de uma função SQL diz, e o formato real de arquivo de terceiro.',
  '>',
  '> ⚠️ É regenerado sem travar deploy, então pode estar algumas horas atrás. Se citar',
  '> arquivo que não existe, **vale o código**.',
  '',
].join('\n');

function lista(titulo, itens, fmt = (x) => `\`${x}\``) {
  if (!itens || !itens.length) return '';
  return `\n**${titulo}**\n\n${itens.map((i) => `- ${fmt(i)}`).join('\n')}\n`;
}

function paginaModulo(m) {
  const L = [`# Módulo \`${m.slug}\``, '', AVISO];

  if (m.telas.length) {
    L.push('## Telas (ERP)', '');
    L.push('| rota | arquivo | nível |', '|---|---|---|');
    for (const t of m.telas) {
      L.push(`| \`${t.caminho}\` | ${t.arquivo ? `\`src/${t.arquivo.replace(/^\.\//, '')}\`` : '—'} | ${t.nivel ?? '—'} |`);
    }
    L.push('');
  }

  if (m.arquivosBackend.length) {
    L.push('## Backend', '');
    L.push(...m.arquivosBackend.map((a) => `- \`${a}\``));
    if (m.guards.length) L.push('', `Guard: \`authorizeModule('${m.slug}', ${m.guards.join(' | ')})\``);
    L.push('');
  }

  if (m.endpoints.length) {
    L.push('<details><summary>Endpoints (' + m.endpoints.length + ')</summary>', '');
    L.push(...m.endpoints.map((e) => `- \`${e}\``));
    L.push('', '</details>', '');
  }

  L.push(lista('Réguas puras (backend/utils)', m.utils, (u) => `\`backend/utils/${u}.js\``));
  L.push(lista('Serviços', m.services, (s) => `\`backend/services/${s}.js\``));
  L.push(lista('Tabelas que estas rotas tocam', m.tabelas));
  L.push(lista('RPCs', m.rpcs));
  L.push(lista('Namespace no front (src/api.js)', m.apiNs, (n) => `\`${n}\``));
  L.push(lista('Crons', m.crons.map((c) => `${c.caminho} — \`${c.quando}\``), (x) => x));
  L.push(lista('Onde os APPS tocam este módulo', m.noApp, (x) => x));
  L.push(lista('routeKeys em ROUTE_MODULE_MAP', m.routeKeys));

  return L.filter(Boolean).join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}

function paginaIndice(modelo) {
  const L = [
    '# Mapa do sistema · índice',
    '',
    AVISO,
    '**Leia isto ANTES de investigar onde algo mora.** Uma linha por módulo; a página',
    'de cada um tem rotas, arquivos, endpoints, réguas e tabelas.',
    '',
    '| módulo | telas | backend | página |',
    '|---|---|---|---|',
  ];
  for (const m of Object.values(modelo.modulos)) {
    const telas = m.telas.map((t) => `\`${t.caminho}\``).slice(0, 3).join(' ') || '—';
    const be = m.arquivosBackend.map((a) => `\`${path.basename(a)}\``).slice(0, 2).join(' ') || '—';
    L.push(`| **${m.slug}** | ${telas}${m.telas.length > 3 ? ' …' : ''} | ${be} | [${m.slug}](${m.slug}.md) |`);
  }
  L.push('', `## Apps`, '', 'Telas dos apps e o que cada uma chama: [APPS.md](APPS.md)', '');
  L.push('## Réguas puras (o que já existe pronto)', '');
  L.push('Antes de escrever régua nova, conferir se já existe uma:', '');
  const comTeste = Object.values(modelo.utils).filter((u) => u.cobertoPor.length);
  L.push(`\`backend/utils/\` tem **${Object.keys(modelo.utils).length}** arquivos, **${comTeste.length}** com teste.`);
  L.push('', '<details><summary>Lista completa</summary>', '');
  L.push('| régua | teste |', '|---|---|');
  for (const [nome, u] of Object.entries(modelo.utils).sort()) {
    L.push(`| \`${u.arquivo}\` | ${u.cobertoPor.length ? u.cobertoPor.map((t) => `\`${t}\``).join(' ') : '—'} |`);
  }
  L.push('', '</details>', '');
  return L.join('\n') + '\n';
}

function paginaApps(modelo) {
  const L = ['# Mapa dos apps', '', AVISO];
  if (!modelo.apps.length) {
    L.push('> Os repos dos apps não estavam presentes quando este mapa foi gerado', '> (são repositórios irmãos). Rode o gerador na máquina que os tem clonados.', '');
    return L.join('\n') + '\n';
  }
  for (const app of modelo.apps) {
    L.push(`## ${app.rotulo} · \`${app.nome}\``, '');
    L.push('| rota | arquivo | chama |', '|---|---|---|');
    for (const t of app.telas) {
      L.push(`| \`${t.rota}\` | \`${t.arquivo}\` | ${t.chamadas.length ? t.chamadas.map((c) => `\`${c}\``).join(' ') : '—'} |`);
    }
    L.push('');
    if (app.libs.length) {
      L.push('<details><summary>lib/ que fala com a API</summary>', '');
      L.push('| arquivo | chama |', '|---|---|');
      for (const l of app.libs) L.push(`| \`${l.arquivo}\` | ${l.chamadas.map((c) => `\`${c}\``).join(' ')} |`);
      L.push('', '</details>', '');
    }
  }
  return L.join('\n') + '\n';
}











function paginaArquivos(modelo) {
  const linhas = [];

  for (const r of modelo.rotas) {
    if (!r.arquivo || r.redireciona) continue;
    linhas.push({
      arquivo: `src/${r.arquivo.replace(/^\.\//, '')}`,
      tipo: 'tela ERP',
      modulo: r.modulo || '—',
      onde: r.caminho,
    });
  }
  for (const [arq, info] of Object.entries(modelo.rotasBackend)) {
    const mont = modelo.montagens.find((m) => m.arquivo === arq);
    const dono = Object.values(modelo.modulos).find((m) => m.arquivosBackend.includes(arq));
    linhas.push({ arquivo: arq, tipo: 'rota backend', modulo: dono ? dono.slug : '—', onde: mont ? mont.prefixo : '(não montado)' });
  }
  for (const u of Object.values(modelo.utils)) {
    linhas.push({ arquivo: u.arquivo, tipo: 'régua pura', modulo: '—', onde: u.cobertoPor[0] || 'SEM TESTE' });
  }
  for (const app of modelo.apps) {
    for (const t of app.telas) linhas.push({ arquivo: `${app.nome}/${t.arquivo}`, tipo: 'tela app', modulo: '—', onde: t.rota });
    for (const l of app.libs) linhas.push({ arquivo: `${app.nome}/${l.arquivo}`, tipo: 'lib app', modulo: '—', onde: `${l.chamadas.length} chamada(s)` });
  }

  linhas.sort((a, b) => a.arquivo.localeCompare(b.arquivo));
  return [
    '# Todos os arquivos · índice plano',
    '',
    AVISO,
    '**Um `grep` aqui responde "onde mora X".** É para isto que este arquivo existe:',
    'chegar com um nome e sair com um caminho, sem varrer o repositório.',
    '',
    `${linhas.length} arquivos.`,
    '',
    '| arquivo | tipo | módulo | rota / teste |',
    '|---|---|---|---|',
    ...linhas.map((l) => `| \`${l.arquivo}\` | ${l.tipo} | ${l.modulo} | \`${l.onde}\` |`),
    '',
  ].join('\n');
}

function paginaOrfaos(modelo) {
  const o = modelo.orfaos;
  const L = [
    '# Órfãos · o que nenhum módulo reivindica',
    '',
    AVISO,
    '⚠️⚠️ **Isto não é sobra do gerador — é uma lista de risco.** O CLAUDE.md',
    'registra como LEI que `routeKey` sem entrada no `ROUTE_MODULE_MAP` **desliga a',
    'matriz de permissão em silêncio** (caso `links`, 17/08: a matriz dizia 2 cargos',
    'com escrita, a API aplicava 10). Rota sem `ModuleGuard` e arquivo de rota que',
    'nenhum módulo reivindica são exatamente os candidatos a esse buraco.',
    '',
    '⚠️ Estar aqui **não** significa que está errado: há telas legitimamente sem',
    'guard (públicas, totens, `/perfil`). Significa que ninguém decidiu — vale',
    'conferir.',
    '',
    `## Telas sem ModuleGuard (${o.telas.length})`,
    '',
    '| rota | arquivo | pública? |',
    '|---|---|---|',
    ...o.telas.map((t) => `| \`${t.caminho}\` | \`src/${t.arquivo.replace(/^\.\//, '')}\` | ${t.publica ? 'sim' : 'não (só logado)'} |`),
    '',
    `## Arquivos de rota que nenhum módulo reivindica (${o.backend.length})`,
    '',
    ...o.backend.map((a) => `- \`${a}\``),
    '',
  ];
  return L.join('\n');
}

function gerar() {
  const modelo = montarModelo();
  const arquivos = {
    'INDICE.md': paginaIndice(modelo),
    'ARQUIVOS.md': paginaArquivos(modelo),
    'APPS.md': paginaApps(modelo),
    'ORFAOS.md': paginaOrfaos(modelo),
  };
  for (const m of Object.values(modelo.modulos)) arquivos[`${m.slug}.md`] = paginaModulo(m);
  return { modelo, arquivos };
}



function main() {
  const args = process.argv.slice(2);
  const { modelo, arquivos } = gerar();

  if (args.includes('--json')) {
    process.stdout.write(JSON.stringify(modelo, null, 2));
    return;
  }

  if (args.includes('--check')) {
    let mudou = 0;
    for (const [nome, conteudo] of Object.entries(arquivos)) {
      if (ler(path.join(SAIDA, nome)) !== conteudo) { console.error(`desatualizado: docs/mapa/${nome}`); mudou++; }
    }
    if (mudou) { console.error(`\n${mudou} arquivo(s) fora de data. Rode: node backend/scripts/gerar-mapa.cjs`); process.exit(1); }
    console.log('mapa em dia');
    return;
  }

  fs.mkdirSync(SAIDA, { recursive: true });


  for (const f of fs.readdirSync(SAIDA)) {
    if (f.endsWith('.md') && !arquivos[f]) fs.unlinkSync(path.join(SAIDA, f));
  }
  for (const [nome, conteudo] of Object.entries(arquivos)) {
    fs.writeFileSync(path.join(SAIDA, nome), conteudo);
  }
  const nApps = modelo.apps.reduce((s, a) => s + a.telas.length, 0);
  console.log(`docs/mapa/ · ${Object.keys(modelo.modulos).length} módulos · ${modelo.rotas.length} rotas do ERP · ${nApps} telas de app · ${Object.keys(modelo.utils).length} réguas`);
}

if (require.main === module) main();
module.exports = { gerar, montarModelo };
