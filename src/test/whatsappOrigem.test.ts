import { describe, it, expect } from 'vitest';
import { rotuloDoDisparo, chaveTelefone, ROTULOS } from '../../backend/utils/whatsappOrigem.js';
import { MAPA } from '../../backend/utils/whatsappModulo.js';





describe('rótulo do disparo · o que a equipe lê', () => {
  it('traduz os contextos sintéticos de teste', () => {

    const reais = [
      'grupos.pedido_novo_lider',
      'grupos.inscricao_confirmada',
      'grupos.pedido_aprovado',
      'membresia.censo_atualizacao',
      'grupos.confira_lista',
      'app.inscricao_confirmada',
      'app.pedido_atualizado',
      'app.aniversario',
    ];
    for (const c of reais) {
      const r = rotuloDoDisparo(c);
      expect(r.conhecido, `${c} devia ter rótulo`).toBe(true);
      expect(r.rotulo).not.toBe(c);
      expect(r.modulo).toBeTruthy();
    }
  });

  it('cada rótulo diz de qual ASSUNTO é (grupos, censo, batismo…)', () => {
    expect(rotuloDoDisparo('grupos.pedido_novo_lider').rotulo).toMatch(/grupos/i);
    expect(rotuloDoDisparo('membresia.censo_atualizacao').rotulo).toMatch(/censo/i);
    expect(rotuloDoDisparo('app.batismo_lembrete').rotulo).toMatch(/batismo/i);
    expect(rotuloDoDisparo('next.convite').rotulo).toMatch(/next/i);
  });




  it('contexto desconhecido é DECLARADO, não escondido nem inventado', () => {
    const r = rotuloDoDisparo('modulo_que_alguem_criou.amanha');
    expect(r.conhecido).toBe(false);
    expect(r.rotulo).toBe('modulo_que_alguem_criou.amanha');
    expect(r.modulo).toBeTruthy();
  });

  it('contexto vazio não vira rótulo bonito de mentira', () => {
    for (const v of ['', null, undefined]) {
      const r = rotuloDoDisparo(v as string);
      expect(r.conhecido).toBe(false);
    }
  });




  it('todo prefixo do MAPA de módulos tem rótulo aqui', () => {
    const chavesRotulo = ROTULOS.map(([k]: [string, string]) => k);
    for (const [chave] of MAPA as [string, unknown][]) {
      const cobre = chavesRotulo.some((k: string) => k === chave || k.startsWith(`${chave}.`));
      expect(cobre, `o contexto "${chave}" existe no MAPA de módulos e não tem rótulo`).toBe(true);
    }
  });
});

describe('chave de cruzamento · o tail é só o FILTRO', () => {





  it('as formas reais do mesmo número caem no mesmo tail', () => {
    const formas = ['21900005825', '5521900005825', '(21) 90000-5825', '+55 21 90000-5825'];
    const chaves = new Set(formas.map(chaveTelefone));
    expect(chaves.size, `deveria ser uma chave só, veio ${[...chaves].join(' / ')}`).toBe(1);


    expect(chaves.has('00005825')).toBe(true);
    expect(chaveTelefone('2100005825')).toBe('00005825');
  });




  it('número curto demais NÃO gera chave parcial', () => {
    expect(chaveTelefone('9660')).toBeNull();
    expect(chaveTelefone('123')).toBeNull();
    expect(chaveTelefone('')).toBeNull();
    expect(chaveTelefone(null as unknown as string)).toBeNull();
    expect(chaveTelefone('00005826')).toBe('00005826');
  });




  it('tail igual NÃO é o mesmo número (é por isso que existe conferência depois)', () => {
    expect(chaveTelefone('21900005825')).toBe(chaveTelefone('21800005825'));
    expect(chaveTelefone('21900005825')).toBe(chaveTelefone('11900005825'));
  });
});
