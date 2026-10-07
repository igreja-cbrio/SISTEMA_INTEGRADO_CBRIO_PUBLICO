import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';




























const ARQ_PUBLICO = resolve(__dirname, '../../backend/routes/publicMembresia.js');
const ARQ_MEMBRESIA = resolve(__dirname, '../../backend/routes/membresia.js');














function semComentarios(js: string): string {
  return js
    .split('\n')
    .map((l) => l.replace(/\/\*.*?\*\//g, ''))
    .map((l) => l.replace(/(^|[^:])\/\/[^\n]*/, '$1'))
    .join('\n');
}


function listaDe(js: string, nome: string): string {
  const i = js.indexOf(`${nome} = [`);
  expect(i, `const ${nome} não encontrada`).toBeGreaterThan(-1);
  const fim = js.indexOf('];', i);
  expect(fim, `fim de ${nome} não encontrado`).toBeGreaterThan(i);
  return js.slice(i, fim);
}

const COLUNAS_NOVAS = ['carta_transferencia', 'igreja_anterior'];

describe('Seja membro · carta de transferência e igreja de origem', () => {
  const publico = semComentarios(readFileSync(ARQ_PUBLICO, 'utf8'));
  const membresia = semComentarios(readFileSync(ARQ_MEMBRESIA, 'utf8'));

  it('o limpador de comentários não destrói os arquivos', () => {
    expect(publico).toContain("router.post('/cadastro'");
    expect(membresia).toContain('async function aprovarCadastroCore');
  });

  for (const col of COLUNAS_NOVAS) {
    it(`'${col}' está em COLUNAS_OPCIONAIS — senão o fallback do 42703 não a remove e a submissão se perde`, () => {
      expect(listaDe(publico, 'COLUNAS_OPCIONAIS')).toContain(`'${col}'`);
    });

    it(`'${col}' está em cadFields — senão a resposta some da ficha ao aprovar`, () => {
      expect(listaDe(membresia, 'cadFields')).toContain(`'${col}'`);
    });
  }

  it('o INSERT usa o fallback GERAL, não o antigo específico do censo', () => {


    expect(publico).toContain('semColunasOpcionais(payload)');
    expect(publico).not.toContain('semColunasDoCenso');
  });

  it('COLUNAS_OPCIONAIS continua contendo as do censo (não trocar uma lista pela outra)', () => {
    const lista = listaDe(publico, 'COLUNAS_OPCIONAIS');


    expect(lista).toContain('COLUNAS_CENSO');
  });

  it('a carta só é gravada com `=== true` — string "false" do JSON é truthy', () => {



    expect(publico).toContain('carta_transferencia === true');
  });

  it('a igreja de origem é trimada e tem teto (texto livre de porta pública)', () => {
    const i = publico.indexOf('igreja_anterior.trim()');
    expect(i, 'o trim da igreja_anterior sumiu').toBeGreaterThan(-1);
    expect(publico.slice(i, i + 200)).toContain('.slice(0, 160)');
  });









  it('a porta NÃO escreve em igreja_batismo_anterior (é outro fato)', () => {
    expect(publico).not.toContain('igreja_batismo_anterior');
  });
});
