import { describe, it, expect } from 'vitest';
import { amostraNomes, plural, MAX_AMOSTRA } from '../../backend/utils/avisoAgregado.js';




import { semComentarios, lerBackend, chamadasNotificar } from './utils/notificarEstatico';









describe('amostraNomes · a mensagem leva contagem + amostra', () => {
  it('lista tudo quando cabe no limite', () => {
    expect(amostraNomes(['A', 'B', 'C'])).toBe('A, B, C');
  });

  it('corta no limite e declara quantos ficaram de fora', () => {
    const seis = ['A', 'B', 'C', 'D', 'E', 'F'];
    expect(amostraNomes(seis)).toBe('A, B, C, D, E e mais 1');
    expect(MAX_AMOSTRA).toBe(5);
  });

  it('nunca esconde o resto em silêncio: o total é sempre reconstituível', () => {
    const trinta = Array.from({ length: 30 }, (_, i) => `G${i + 1}`);
    const frase = amostraNomes(trinta);
    const resto = Number(frase.match(/e mais (\d+)$/)![1]);
    const mostrados = frase.replace(/ e mais \d+$/, '').split(', ').length;
    expect(mostrados + resto).toBe(30);
  });

  it('lista vazia devolve string vazia (o gerador nem chega a notificar)', () => {
    expect(amostraNomes([])).toBe('');
    expect(amostraNomes(null as unknown as string[])).toBe('');
  });

  it('ignora item nulo/vazio em vez de imprimir vírgula solta', () => {
    expect(amostraNomes(['A', '', null as unknown as string, 'B'])).toBe('A, B');
  });

  it('⚠️ NÃO reordena: a ordem "pior primeiro" é decisão de quem chama', () => {


    expect(amostraNomes(['Zebra (90 dias)', 'Alfa (2 dias)']))
      .toBe('Zebra (90 dias), Alfa (2 dias)');
  });
});

describe('plural · concordância sem inventar sufixo', () => {
  it('⚠️ MUTATION-TEST: plural não sai de `+ "s"`', () => {


    expect(plural(1, 'reunião', 'reuniões')).toBe('reunião');
    expect(plural(2, 'reunião', 'reuniões')).toBe('reuniões');
    expect(plural(2, 'reunião', 'reuniões')).not.toBe('reuniãos');
    expect(plural(0, 'grupo', 'grupos')).toBe('grupos');
  });
});
















const GERADOR = lerBackend('backend/services/notificacaoGenerator.js');
const CHAMADAS = chamadasNotificar(GERADOR);

const AGREGADOS = [
  { tipo: 'grupo_sem_encontro', chave: 'grupo_sem_encontro' },
  { tipo: 'membro_sem_grupo', chave: 'membro_sem_grupo' },
  { tipo: 'ata_pendente', chave: 'gov_ata_pendente' },
  { tipo: 'kids_crianca_ausente', chave: 'kids_crianca_ausente' },
];

describe('geradores periódicos · 1 aviso agregado, não 1 por item', () => {
  it('o strip de comentários não come o // de uma URL', () => {
    expect(semComentarios('const u = "https://cbrio.org"; // nota'))
      .toContain('https://cbrio.org');
  });

  for (const { tipo, chave } of AGREGADOS) {
    it(`${tipo} · chave de dedup é literal estável ('${chave}')`, () => {
      expect(GERADOR).toContain(`chaveDedup: '${chave}'`);
    });

    it(`⚠️ MUTATION-TEST: o aviso amplo de ${tipo} não volta a deduplicar por item`, () => {



      const interpolaId = new RegExp('chaveDedup:\\s*`[^`]*' + chave, 'i');
      const amplos = CHAMADAS.filter(c => (
        c.includes(`tipo: '${tipo}'`) && !/targetIds:/.test(c)
      ));
      for (const bloco of amplos) expect(bloco).not.toMatch(interpolaId);
    });
















    it(`${tipo} · aviso por item existe só com destinatário nomeado`, () => {
      const doTipo = CHAMADAS.filter(c => c.includes(`tipo: '${tipo}'`));
      expect(doTipo.length).toBeGreaterThan(0);
      for (const bloco of doTipo) {
        const porItem = /chaveDedup:\s*`/.test(bloco);
        if (porItem) {
          expect(bloco, `${tipo}: aviso por item sem targetIds volta a explodir no fallback do módulo`)
            .toMatch(/targetIds:/);
        }
      }
    });

    it(`${tipo} · o aviso agregado (sem targetIds) é único`, () => {
      const amplos = CHAMADAS.filter(c => (
        c.includes(`tipo: '${tipo}'`) && !/targetIds:/.test(c)
      ));
      expect(amplos.length).toBe(1);
    });
  }












});
