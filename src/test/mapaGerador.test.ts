import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';













const require_ = createRequire(import.meta.url);
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { montarModelo, gerar } = require_('../../backend/scripts/gerar-mapa.cjs');

const modelo = montarModelo();
const { arquivos } = gerar();

describe('mapa · o gerador enxerga o sistema', () => {
  it('acha as rotas do ERP', () => {


    expect(modelo.rotas.length).toBeGreaterThan(100);
  });

  it('acha os módulos e os arquivos de rota do backend', () => {
    expect(Object.keys(modelo.modulos).length).toBeGreaterThan(20);
    expect(Object.keys(modelo.rotasBackend).length).toBeGreaterThan(80);
  });

  it('acha as réguas puras de backend/utils', () => {
    expect(Object.keys(modelo.utils).length).toBeGreaterThan(50);
  });

  it('⚠️ atribui ARQUIVO à maioria das rotas — o regex do <Route> não pode colapsar', () => {




    const comArquivo = modelo.rotas.filter((r: any) => r.arquivo).length;
    expect(comArquivo).toBeGreaterThan(modelo.rotas.length * 0.5);
  });
});

describe('⚠️⚠️ mapa · todo caminho citado EXISTE', () => {
  it('telas do ERP', () => {
    const faltando = modelo.rotas
      .filter((r: any) => r.arquivo)
      .map((r: any) => `src/${String(r.arquivo).replace(/^\.\//, '')}`)
      .filter((p: string) => !['.tsx', '.jsx', '.ts', '.js'].some((e) => existsSync(path.join(RAIZ, p + e)) || existsSync(path.join(RAIZ, p, 'index' + e))));
    expect(faltando).toEqual([]);
  });

  it('arquivos de rota do backend', () => {
    const faltando = Object.keys(modelo.rotasBackend).filter((p) => !existsSync(path.join(RAIZ, p)));
    expect(faltando).toEqual([]);
  });

  it('réguas puras e os testes que elas citam', () => {
    const faltando: string[] = [];
    for (const u of Object.values(modelo.utils) as any[]) {
      if (!existsSync(path.join(RAIZ, u.arquivo))) faltando.push(u.arquivo);
      for (const t of u.cobertoPor) if (!existsSync(path.join(RAIZ, t))) faltando.push(t);
    }
    expect(faltando).toEqual([]);
  });
});

describe('mapa · as páginas saem completas', () => {
  it('tem INDICE, ARQUIVOS, APPS e ORFAOS', () => {
    for (const n of ['INDICE.md', 'ARQUIVOS.md', 'APPS.md', 'ORFAOS.md']) {
      expect(Object.keys(arquivos)).toContain(n);
    }
  });

  it('todo módulo tem página própria', () => {
    for (const slug of Object.keys(modelo.modulos)) {
      expect(Object.keys(arquivos)).toContain(`${slug}.md`);
    }
  });

  it('⚠️ toda página carrega o aviso de que o mapa diz ONDE, não SE está certo', () => {

    for (const [nome, conteudo] of Object.entries(arquivos) as [string, string][]) {
      expect(conteudo, nome).toContain('responde ONDE algo mora, nunca SE está certo');
    }
  });

  it('⚠️ toda página se declara GERADA — para ninguém editar à mão', () => {
    for (const [nome, conteudo] of Object.entries(arquivos) as [string, string][]) {
      expect(conteudo, nome).toContain('NÃO editar à mão');
    }
  });







  it('a saída é DETERMINÍSTICA — senão o auto-commit vira ruído no histórico', () => {
    const a = gerar().arquivos;
    const b = gerar().arquivos;
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
    for (const k of Object.keys(a)) expect(a[k], k).toBe(b[k]);
  }, 30000);
});

describe('mapa · responde aos pedidos que me fizeram investigar', () => {


  const plano = arquivos['ARQUIVOS.md'] as string;





  const temApps = modelo.apps.length > 0;

  it('importar DANFE (só ERP)', () => {
    expect(plano).toContain('nfeArquivo');
    expect(plano).toContain('logistica');
  });

  it('cruzar batismo × voluntário (só ERP)', () => {

    expect(plano).toContain('CruzamentosPessoas');
    expect(plano).toContain('/admin/cruzamentos');
  });

  it('a régua do link de inscrição do app está no mapa (só ERP)', () => {

    expect(plano).toContain('linkInscricaoApp');
  });

  it.skipIf(!temApps)('compartilhar link de inscrição — arquivos DO APP', () => {
    expect(plano).toContain('compartilharInscricao');
    expect(plano).toContain('BotaoCompartilhar');
  });

  it.skipIf(!temApps)('as telas dos apps entram com a rota do expo-router', () => {
    expect(arquivos['APPS.md']).toContain('/inscricoes');
    expect(arquivos['APPS.md']).not.toContain('não estavam presentes');
  });

  it.skipIf(temApps)('sem os apps clonados, APPS.md DECLARA a ausência', () => {

    expect(arquivos['APPS.md']).toContain('não estavam presentes');
  });
});
