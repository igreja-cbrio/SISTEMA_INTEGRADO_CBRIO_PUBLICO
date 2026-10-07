















import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { semComentariosJs } from './_semComentarios';

const RAIZ = join(__dirname, '..', '..');
const TELA = join(RAIZ, 'src', 'pages', 'ministerial', 'Online.tsx');
const REGUA_BACKEND = join(RAIZ, 'backend', 'utils', 'arrecadacaoOnline.js');

const telaCrua = readFileSync(TELA, 'utf-8');


const tela = semComentariosJs(telaCrua);

describe('aba Financeiro do /online · gate do dinheiro', () => {
  it('a aba é condicionada por podeVerArrecadacao', () => {
    expect(tela).toMatch(/\{podeVerArrecadacao && \(/);

    const cond = tela.indexOf('{podeVerArrecadacao && (');
    const gatilho = tela.indexOf('<TabsTrigger value="financeiro"');
    expect(gatilho).toBeGreaterThan(cond);
    expect(gatilho - cond).toBeLessThan(400);
  });

  it('exige nível 4, lendo modulePerms.online.leitura', () => {
    expect(tela).toMatch(/modulePerms\?\.online\?\.leitura/);
    expect(tela).toMatch(/nivel >= 4/);
  });

  it('NÃO usa canAccessModule para decidir o dinheiro', () => {

    expect(tela).not.toMatch(/canAccessModule/);
  });

  it('nível não-numérico não passa (string "5" não é nível)', () => {
    expect(tela).toMatch(/typeof nivel === 'number'/);
  });

  it('respeita o deny explícito do módulo', () => {
    expect(tela).toMatch(/modulosBloqueados[\s\S]{0,60}includes\('online'\)/);
  });

  it('espelha o nível exigido pelo backend', () => {
    const backend = semComentariosJs(readFileSync(REGUA_BACKEND, 'utf-8'));
    const m = backend.match(/NIVEL_VE_DINHEIRO\s*=\s*(\d+)/);
    expect(m, 'NIVEL_VE_DINHEIRO sumiu do backend').toBeTruthy();

    expect(tela).toMatch(new RegExp(`nivel >= ${m![1]}`));
  });

  it('quem perde o nível não fica preso numa aba que não existe', () => {

    expect(tela).toMatch(/abaAtiva === 'financeiro' && !podeVerArrecadacao/);
  });
});

describe('aba Financeiro do /online · conteúdo', () => {
  it('o card da arrecadação vive dentro da aba financeiro', () => {
    const abre = tela.indexOf('<TabsContent value="financeiro"');
    expect(abre).toBeGreaterThan(-1);
    const fecha = tela.indexOf('</TabsContent>', abre);
    const dentro = tela.slice(abre, fecha);
    expect(dentro).toContain('<ArrecadacaoOnlineCard');
  });

  it('o card da arrecadação aparece uma vez só', () => {
    const n = (tela.match(/<ArrecadacaoOnlineCard/g) || []).length;
    expect(n).toBe(1);
  });
});

describe('abas do /online · deep-link', () => {
  it('toda aba do catálogo tem gatilho na barra, e vice-versa', () => {
    const m = tela.match(/const ABAS_ONLINE = \[([^\]]+)\]/);
    expect(m, 'catálogo ABAS_ONLINE sumiu').toBeTruthy();
    const catalogo = (m![1].match(/'([a-z]+)'/g) || []).map((x) => x.replace(/'/g, ''));



    const topo = catalogo.filter((v) =>
      tela.includes(`<TabsTrigger value="${v}"`) && tela.includes(`<TabsContent value="${v}"`),
    );
    expect(topo.sort()).toEqual([...catalogo].sort());
    expect(catalogo.length).toBeGreaterThanOrEqual(4);
  });

  it('valor fora do catálogo cai na primeira aba, não em tela branca', () => {
    expect(tela).toMatch(/ABAS_ONLINE\.includes\(/);
    expect(tela).toMatch(/: 'pessoas'/);
  });

  it('a aba escolhida vai para a URL', () => {
    expect(tela).toMatch(/searchParams\.set\('tab'/);
  });
});
