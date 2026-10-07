import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const req = createRequire(import.meta.url);




const { ehTextoDeOpiniao, prepararMaterial, TIPOS_PARA_IA } =
  req(resolve(__dirname, '../../backend/utils/censoIaFiltro.js'));










describe('censo · o que vai para a IA', () => {
  it('texto_longo (opinião de verdade) VAI', () => {
    expect(ehTextoDeOpiniao({ tipo: 'texto_longo', valor_texto: 'Gosto do acolhimento' })).toBe(true);
  });


  it.each([
    ['cpf', '12345678909'],
    ['nome', 'Fulano da Silva Souza'],
    ['email', 'fulano@gmail.com'],
    ['telefone', '(21) 90000-0022'],
    ['p9_cep', '22640-100'],
    ['bairro', 'Barra da Tijuca'],
    ['cidade', 'Rio de Janeiro'],
    ['conjuge_nome', 'Beltrana Souza'],
    ['instagram', '@fulano'],
  ])('texto_curto "%s" NUNCA vai', (id, valor) => {
    expect(ehTextoDeOpiniao({ pergunta_id: id, tipo: 'texto_curto', valor_texto: valor })).toBe(false);
  });

  it('nascimento (data) não vai', () => {
    expect(ehTextoDeOpiniao({ tipo: 'data', valor_texto: '1980-01-01' })).toBe(false);
  });



  it('busca (nome de igreja/grupo) não vai', () => {
    expect(ehTextoDeOpiniao({ tipo: 'busca', valor_texto: 'PIB Barra' })).toBe(false);
  });


  it.each([[undefined], ['tipo_que_nao_existe'], [null], ['']])
    ('tipo desconhecido (%s) NÃO vai', (tipo) => {
      expect(ehTextoDeOpiniao({ tipo, valor_texto: 'qualquer coisa' })).toBe(false);
    });

  it('item nulo não derruba nem vaza', () => {
    expect(ehTextoDeOpiniao(null)).toBe(false);
    expect(ehTextoDeOpiniao(undefined)).toBe(false);
  });

  it('a lista é FECHADA e contém apenas texto_longo', () => {
    expect([...TIPOS_PARA_IA]).toEqual(['texto_longo']);
  });


  it('num lote misto, só a opinião sobrevive a prepararMaterial', () => {
    const lote = [
      { pergunta_id: 'cpf', pergunta_texto: 'CPF', tipo: 'texto_curto', valor_texto: '12345678909', sensivel: false },
      { pergunta_id: 'nome', pergunta_texto: 'Nome completo', tipo: 'texto_curto', valor_texto: 'Fulano da Silva', sensivel: false },
      { pergunta_id: 'telefone', pergunta_texto: 'Telefone', tipo: 'texto_curto', valor_texto: '(21) 90000-0022', sensivel: false },
      { pergunta_id: 'igreja_anterior_nome', pergunta_texto: 'Qual era a igreja?', tipo: 'busca', valor_texto: 'PIB Barra', sensivel: false },
      { pergunta_id: 'mais_ama', pergunta_texto: 'O que você mais ama?', tipo: 'texto_longo', valor_texto: 'O acolhimento das pessoas', sensivel: false },
    ];
    const { blocos, total_textos } = prepararMaterial(lote);
    expect(blocos).toHaveLength(1);
    expect(blocos[0].pergunta_id).toBe('mais_ama');
    expect(total_textos).toBe(1);
    const serializado = JSON.stringify(blocos);
    for (const proibido of ['12345678909', 'Fulano', '98455', 'PIB Barra']) {
      expect(serializado).not.toContain(proibido);
    }
  });

  it('sensível continua fora mesmo sendo texto_longo', () => {
    const { blocos } = prepararMaterial([
      { pergunta_id: 'x', tipo: 'texto_longo', valor_texto: 'confidencial', sensivel: true },
    ]);
    expect(blocos).toHaveLength(0);
  });
});



describe('censo · a rota /ia filtra tipo no SQL', () => {
  it("o SELECT do /ia tem .in('tipo', ...)", () => {
    const src = readFileSync(resolve(__dirname, '../../backend/routes/censo.js'), 'utf8');
    const limpo = src
      .split('\n')
      .map((l) => l.replace(/\/\*.*?\*\//g, ''))
      .map((l) => l.replace(/(^|[^:])\/\/[^\n]*/, '$1'))
      .join('\n');
    const i = limpo.indexOf("router.post('/ia'");
    expect(i).toBeGreaterThan(-1);
    const bloco = limpo.slice(i, i + 2200);
    expect(bloco).toContain("cen_resposta_item");
    expect(bloco).toContain(".in('tipo'");
    expect(bloco).toContain('TIPOS_PARA_IA');
  });
});







describe('censo · a régua da IA não pode depender da árvore de backend/', () => {
  it('censoIaFiltro.js não faz require de pacote externo nem de services/', () => {
    const src = readFileSync(resolve(__dirname, '../../backend/utils/censoIaFiltro.js'), 'utf8');
    const limpo = src
      .split('\n')
      .map((l) => l.replace(/\/\*.*?\*\//g, ''))
      .map((l) => l.replace(/(^|[^:])\/\/[^\n]*/, '$1'))
      .join('\n');
    const requires = [...limpo.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
    expect(requires.filter((r) => !r.startsWith('.'))).toEqual([]);
    expect(requires.filter((r) => r.includes('services/'))).toEqual([]);
  });

  it('o serviço RE-EXPORTA a régua (nenhum chamador precisou mudar)', () => {
    const src = readFileSync(resolve(__dirname, '../../backend/services/censoLeituraIA.js'), 'utf8');
    expect(src).toContain("require('../utils/censoIaFiltro')");
    expect(src).toContain('ehTextoDeOpiniao');
  });
});
