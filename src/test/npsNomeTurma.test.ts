




















import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { semComentariosJs } from './_semComentarios';

const RAIZ = join(__dirname, '..', '..');
const TELA = semComentariosJs(readFileSync(join(RAIZ, 'src', 'pages', 'Nps.jsx'), 'utf8'));
const ROTA = semComentariosJs(readFileSync(join(RAIZ, 'backend', 'routes', 'nps.js'), 'utf8'));

describe('a tela do NPS não depende do módulo Next', () => {
  it('não importa a api do Next', () => {
    expect(TELA).not.toMatch(/next as nextApi/);
    expect(TELA).not.toMatch(/\bnextApi\./);
  });

  it('lê o nome da turma da própria resposta (`turma_nome`)', () => {
    expect(TELA).toContain('turma_nome');
  });

  it('mantém o fallback pra turma sem nome (turma apagada não deixa a opção vazia)', () => {
    expect(TELA).toContain('Turma (sem nome)');
  });
});

describe('o backend do NPS anexa o nome da turma', () => {
  it('o endpoint de respostas passa pelo anexo', () => {
    expect(ROTA).toMatch(/res\.json\(await anexarNomeDaTurma\(data\)\)/);
  });

  it('o anexo lê next_turmas com o service role e ignora turma apagada', () => {
    expect(ROTA).toMatch(/from\('next_turmas'\)/);
    expect(ROTA).toMatch(/anexarNomeDaTurma[\s\S]{0,900}deleted_at/);
  });

  it('⚠️ o anexo NUNCA derruba a lista de respostas — erro só omite o nome', () => {


    expect(ROTA).toMatch(/anexarNomeDaTurma[\s\S]{0,1200}catch[\s\S]{0,200}return respostas;/);
  });
});
