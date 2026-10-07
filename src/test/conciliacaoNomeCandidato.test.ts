















import { describe, it, expect } from 'vitest';
import { nomesPodemSerMesmaPessoa } from '../../backend/services/duplicidadePolicy';

describe('nome compatível para atribuir doação', () => {
  it('⚠️ o caso da Ana: nenhum dos candidatos é ela', () => {
    const bal = 'Ana Montanha da Vereda Ribeiral';
    for (const cand of [
      'CAETANO FLORIANO TERRANAL',
      'SANDRA MARIA RIBEIRAL SALGUEIRAL',
      'JUREMA BRUMAL GONCALVO',
    ]) {
      expect(nomesPodemSerMesmaPessoa(bal, cand)).toBe(false);
    }
  });

  it('aceita a forma abreviada — o balanço tem o nome civil, o banco o curto', () => {
    expect(nomesPodemSerMesmaPessoa('Ana Montanha da Vereda Ribeiral', 'ANA MONTANHA RIBEIRAL')).toBe(true);
    expect(nomesPodemSerMesmaPessoa('WALTER OLIVEIRA DA SILVA', 'Walter Oliveira Silva')).toBe(true);
  });

  it('ignora acento e caixa — o extrato vem em maiúsculas sem acento', () => {
    expect(nomesPodemSerMesmaPessoa('Joaquim Lima dos Santos', 'JOAQUIM LIMA DOS SANTOS')).toBe(true);
    expect(nomesPodemSerMesmaPessoa('Rute Marta do Nascedouro Laranjal', 'RÚTE MARTA DO NASCEDOURO LARANJAL')).toBe(true);
  });

  it('⚠️ sobrenome em comum NÃO é a mesma pessoa — é família', () => {

    expect(nomesPodemSerMesmaPessoa('Ana Souza Lima', 'Joao Souza Lima')).toBe(false);
    expect(nomesPodemSerMesmaPessoa('Priscila Prado Veronal', 'Ronaldo Prado Veronal')).toBe(false);
  });

  it('⚠️ primeiro nome igual e resto diferente NÃO basta', () => {
    expect(nomesPodemSerMesmaPessoa('Caetano Augusto Nascedouro', 'Caetano Floriano Terranal')).toBe(false);
  });

  it('nome vazio nunca casa', () => {
    expect(nomesPodemSerMesmaPessoa('', 'ANA MONTANHA')).toBe(false);
    expect(nomesPodemSerMesmaPessoa('ANA MONTANHA', '')).toBe(false);
  });
});
