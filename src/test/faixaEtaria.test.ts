import { describe, it, expect, vi, afterEach } from 'vitest';
import { idadeEmAnos, faixaEtaria, faixaPorIdade, faixaLabel, sexoLabel } from '../lib/faixaEtaria';





function nascidoHaAnos(anos: number, deslocDias = 0): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - anos);
  d.setDate(d.getDate() + deslocDias);



  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dia}`;
}

afterEach(() => { vi.useRealTimers(); });

describe('idadeEmAnos', () => {
  it('conta anos completos, não a diferença de ano civil', () => {
    expect(idadeEmAnos(nascidoHaAnos(30))).toBe(30);

    expect(idadeEmAnos(nascidoHaAnos(31, 1))).toBe(30);

    expect(idadeEmAnos(nascidoHaAnos(31, -1))).toBe(31);
  });

  it('trata YYYY-MM-DD como data LOCAL, não UTC', () => {


    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 28, 12, 0, 0));
    expect(idadeEmAnos('1996-07-28')).toBe(30);
    expect(idadeEmAnos('1996-07-29')).toBe(29);
  });





  it('devolve null pra ausente, inválido ou absurdo', () => {
    expect(idadeEmAnos(null)).toBeNull();
    expect(idadeEmAnos(undefined)).toBeNull();
    expect(idadeEmAnos('')).toBeNull();
    expect(idadeEmAnos('não é data')).toBeNull();
    expect(idadeEmAnos('1500-01-01')).toBeNull();
    expect(idadeEmAnos(nascidoHaAnos(-5))).toBeNull();
  });

  it('aceita Date além de string', () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 20);
    expect(idadeEmAnos(d)).toBe(20);
  });
});

describe('faixaEtaria · limiares exatos da fn_faixa_etaria', () => {
  it('< 13 = criança', () => {
    expect(faixaEtaria(nascidoHaAnos(0))).toBe('crianca');
    expect(faixaEtaria(nascidoHaAnos(12))).toBe('crianca');
  });

  it('13 a 17 = adolescente (os dois limites incluídos)', () => {
    expect(faixaEtaria(nascidoHaAnos(13))).toBe('adolescente');
    expect(faixaEtaria(nascidoHaAnos(17))).toBe('adolescente');
  });



  it('18 a 25 = jovem (os dois limites incluídos)', () => {
    expect(faixaEtaria(nascidoHaAnos(18))).toBe('jovem');
    expect(faixaEtaria(nascidoHaAnos(25))).toBe('jovem');
  });

  it('26+ = adulto', () => {
    expect(faixaEtaria(nascidoHaAnos(26))).toBe('adulto');
    expect(faixaEtaria(nascidoHaAnos(30))).toBe('adulto');
    expect(faixaEtaria(nascidoHaAnos(80))).toBe('adulto');
  });

  it('sem nascimento = null, e o rótulo diz isso em vez de chutar faixa', () => {
    expect(faixaEtaria(null)).toBeNull();
    expect(faixaLabel(null)).toBe('Sem data de nascimento');
  });

  it('slug nunca leva acento (é identificador); rótulo leva', () => {
    expect(faixaEtaria(nascidoHaAnos(5))).toBe('crianca');
    expect(faixaLabel(nascidoHaAnos(5), true)).toBe('Criança');
  });
});

describe('data impossível não vira faixa', () => {



  it('nascimento no futuro e idade acima de 130 devolvem null', () => {
    expect(faixaEtaria(nascidoHaAnos(-1))).toBeNull();
    expect(faixaEtaria('2026-11-21', new Date(2026, 7, 19))).toBeNull();
    expect(faixaEtaria('1886-03-15')).toBeNull();
    expect(faixaLabel('2026-11-21')).toBe('Sem data de nascimento');
  });
});

describe('faixaPorIdade · a régua sobre a idade, sem depender de data', () => {
  it('os quatro cortes', () => {
    expect(faixaPorIdade(12)).toBe('crianca');
    expect(faixaPorIdade(13)).toBe('adolescente');
    expect(faixaPorIdade(17)).toBe('adolescente');
    expect(faixaPorIdade(18)).toBe('jovem');
    expect(faixaPorIdade(25)).toBe('jovem');
    expect(faixaPorIdade(26)).toBe('adulto');
  });




  it('idade impossível devolve null em vez de virar criança', () => {
    expect(faixaPorIdade(null)).toBeNull();
    expect(faixaPorIdade(undefined)).toBeNull();
    expect(faixaPorIdade(-1)).toBeNull();
    expect(faixaPorIdade(Number.NaN)).toBeNull();
    expect(faixaPorIdade(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('sexoLabel', () => {
  it('traduz o vocabulário canônico', () => {
    expect(sexoLabel('masculino')).toBe('Masculino');
    expect(sexoLabel('feminino')).toBe('Feminino');
  });

  it('ausente vira "Não informado", não string vazia', () => {

    expect(sexoLabel(null)).toBe('Não informado');
    expect(sexoLabel('')).toBe('Não informado');
  });

  it('valor desconhecido é exibido como veio, não escondido', () => {
    expect(sexoLabel('outro')).toBe('outro');
  });
});
