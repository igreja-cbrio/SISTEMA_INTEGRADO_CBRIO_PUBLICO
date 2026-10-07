



















import { describe, it, expect } from 'vitest';
import { bloqueios, visivel } from '@/lib/censoForm';

type P = Parameters<typeof bloqueios>[0][number];

const QUESTIONARIO = [
  { id: 'pais', tipo: 'opcao_unica', texto: 'Onde você mora?', opcoes: ['Brasil', 'Moro fora do Brasil'], obrigatoria: true },
  { id: 'pais_outro', tipo: 'texto_curto', texto: 'Em que país você mora?', obrigatoria: true, mostrar_se: { pergunta: 'pais', valores: ['Moro fora do Brasil'] } },
  { id: 'p9_cep', tipo: 'texto_curto', texto: 'CEP', formato: 'cep', obrigatoria: true, mostrar_se: { pergunta: 'pais', valores: ['Brasil'] } },
  { id: 'cidade', tipo: 'texto_curto', texto: 'Cidade', obrigatoria: true },
  { id: 'bairro', tipo: 'texto_curto', texto: 'Bairro', obrigatoria: true, mostrar_se: { pergunta: 'pais', valores: ['Brasil'] } },
] as unknown as P[];

const ids = (r: Record<string, unknown>) => bloqueios(QUESTIONARIO, r as never).map((b) => b.id).sort();

describe('⚠️⚠️ quem mora fora do Brasil consegue terminar o censo', () => {
  it('CEP e bairro somem; a pergunta do país aparece', () => {
    const r = { pais: 'Moro fora do Brasil' };
    expect(visivel(QUESTIONARIO[2], r as never)).toBe(false);
    expect(visivel(QUESTIONARIO[4], r as never)).toBe(false);
    expect(visivel(QUESTIONARIO[1], r as never)).toBe(true);
  });

  it('⚠️ e o CEP NÃO trava mais o avanço', () => {
    expect(
      ids({ pais: 'Moro fora do Brasil', pais_outro: 'Portugal', cidade: 'Lisboa' }),
      'era o bloqueio total: sem CEP brasileiro não havia como concluir',
    ).toEqual([]);
  });







  it('⚠️ CEP inválido digitado ANTES de trocar o país não trava mais nada', () => {
    expect(
      ids({ pais: 'Moro fora do Brasil', pais_outro: 'Portugal', cidade: 'Lisboa', p9_cep: '1000100' }),
      'o rascunho guarda o que ela digitou antes de perceber que o campo não servia',
    ).toEqual([]);
  });

  it('a cidade continua obrigatória para todo mundo — texto livre serve em qualquer país', () => {
    expect(ids({ pais: 'Moro fora do Brasil', pais_outro: 'Portugal' })).toEqual(['cidade']);
  });

  it('⚠️ e o país é obrigatório: sem ele, CEP e bairro ficam escondidos e ninguém informa endereço', () => {
    expect(ids({ cidade: 'Rio' })).toEqual(['pais']);
  });
});

describe('quem mora no Brasil continua sendo cobrado igual', () => {
  it('CEP e bairro voltam a ser obrigatórios', () => {
    expect(ids({ pais: 'Brasil', cidade: 'Rio de Janeiro' })).toEqual(['bairro', 'p9_cep']);
  });

  it('⚠️ CEP brasileiro INCOMPLETO continua barrado — o conserto não afrouxou a régua', () => {
    expect(
      ids({ pais: 'Brasil', cidade: 'Rio', bairro: 'Barra da Tijuca', p9_cep: '22793-5' }),
      'foi assim que 4 pessoas ficaram com rascunho preso em agosto',
    ).toEqual(['p9_cep']);
  });

  it('CEP completo passa', () => {
    expect(ids({ pais: 'Brasil', cidade: 'Rio', bairro: 'Barra da Tijuca', p9_cep: '22793-520' })).toEqual([]);
  });
});
