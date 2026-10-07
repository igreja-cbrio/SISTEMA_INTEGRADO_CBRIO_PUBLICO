import { describe, it, expect } from 'vitest';

import { keyCampoPreservada, novaKeyCampo, KEY_CAMPO_OK } from '../../backend/utils/campoKey.js';







describe('keyCampoPreservada · chave existente NUNCA é trocada', () => {
  it('preserva chave opaca do form-builder', () => {
    expect(keyCampoPreservada('c_ms4yx5n3_01ax')).toBe('c_ms4yx5n3_01ax');
  });

  it('⚠️ preserva chave LEGADA em formato slug (o caso do Celebra)', () => {


    expect(keyCampoPreservada('nome_da_empresa_negocio')).toBe('nome_da_empresa_negocio');
    expect(keyCampoPreservada('breve_descricao_do_item_servic')).toBe('breve_descricao_do_item_servic');

    expect(keyCampoPreservada('em_qual_ministerio_voce_serve')).toBe('em_qual_ministerio_voce_serve');
  });

  it('preserva chave de um só caractere e de 60 caracteres', () => {
    expect(keyCampoPreservada('a')).toBe('a');
    const k60 = 'a'.repeat(60);
    expect(keyCampoPreservada(k60)).toBe(k60);
  });

  it('gera chave nova quando não existe nenhuma', () => {
    for (const vazio of ['', null, undefined]) {
      const k = keyCampoPreservada(vazio as any);
      expect(k).toMatch(/^c_[a-z0-9]+_[a-z0-9]+$/);
    }
  });

  it('gera chave nova quando a existente tem caractere fora do conjunto seguro', () => {


    for (const ruim of ['Nome', 'descrição', 'com espaço', 'com-hifen', 'a.b', 'x'.repeat(61)]) {
      expect(keyCampoPreservada(ruim)).toMatch(/^c_/);
    }
  });

  it('novaKeyCampo sempre casa com a régua de chave aceita', () => {
    for (let i = 0; i < 50; i++) expect(KEY_CAMPO_OK.test(novaKeyCampo())).toBe(true);
  });

  it('a régua NÃO exige prefixo c_ · era isso que causava o incidente', () => {

    expect(KEY_CAMPO_OK.test('nome_da_empresa_negocio')).toBe(true);
  });
});
