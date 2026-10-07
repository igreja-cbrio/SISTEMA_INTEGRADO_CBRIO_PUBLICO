import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { semComentariosJs } from './_semComentarios';


























const ARQ = resolve(__dirname, '../../backend/routes/publicMembresia.js');

function corpo(): string {
  return semComentariosJs(readFileSync(ARQ, 'utf8'));
}


function fechaBloco(src: string, de: number): number {
  const abre = src.indexOf('{', de);
  expect(abre, 'bloco do sexo sem `{`').toBeGreaterThan(-1);
  let profundidade = 0;
  for (let i = abre; i < src.length; i++) {
    if (src[i] === '{') profundidade++;
    else if (src[i] === '}') {
      profundidade--;
      if (profundidade === 0) return i;
    }
  }
  return -1;
}

describe('porta pública de membresia · o CEP é cobrado de verdade', () => {
  it('a validação de CEP está FORA do bloco do sexo (é alcançável)', () => {
    const src = corpo();

    const sexo = src.indexOf("if (!['masculino', 'feminino'].includes(generoNorm))");
    expect(sexo, 'sumiu a validação de sexo — reescreva esta guarda junto').toBeGreaterThan(-1);

    const fimDoSexo = fechaBloco(src, sexo);
    expect(fimDoSexo, 'bloco do sexo não fecha').toBeGreaterThan(-1);

    const cep = src.indexOf('cepCompleto(cep)');
    expect(cep, 'sumiu a cobrança de CEP na porta pública').toBeGreaterThan(-1);



    expect(
      cep,
      'a cobrança de CEP voltou para dentro do bloco do sexo — é código morto de novo (REM-01)',
    ).toBeGreaterThan(fimDoSexo);
  });

  it('cobra CEP só na porta do site, e exige os 8 dígitos', () => {
    const src = corpo();

    expect(
      /if \(origemFinal === 'site' && !cepCompleto\(cep\)\)/.test(src),
      'a cobrança de CEP deixou de ser restrita à origem `site` — o formulário do QR não pergunta CEP e 141 de 166 cadastros seriam recusados',
    ).toBe(true);



    expect(src).not.toMatch(/if \(origemFinal === 'site' && !String\(cep/);
  });

  it('a origem já está normalizada quando o CEP é cobrado', () => {
    const src = corpo();
    const origem = src.indexOf("const origemFinal = origemValida.includes(origem)");
    const cep = src.indexOf('cepCompleto(cep)');
    expect(origem, 'sumiu a normalização de origem').toBeGreaterThan(-1);
    expect(
      cep,
      '`origemFinal` é usada antes de existir — a cobrança de CEP quebraria a porta inteira com ReferenceError',
    ).toBeGreaterThan(origem);
  });
});
