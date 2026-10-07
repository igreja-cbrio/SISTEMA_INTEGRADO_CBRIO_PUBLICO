import { describe, it, expect } from 'vitest';

import {
  HORARIO_NEXT, ENCONTROS_POR_TURMA, domingosDoMes, diaDaSemana, nomeTurma,
  turmasPlanejadas, mesesAGarantir, domingosInscritiveis, proximoMes, hojeBRT, mesDe,
  proximaTurma,
  proximasTurmas,
  TURMAS_OFERECIDAS,
} from '../../backend/utils/nextTurmas.js';

describe('nextTurmas · a régua das turmas do mês', () => {
  it('o Next acontece no culto de 09:30 e a turma tem UM encontro', () => {
    expect(HORARIO_NEXT).toBe('09:30');
    expect(ENCONTROS_POR_TURMA).toBe(1);
  });

  it('acha os domingos de um mês de 4 domingos', () => {
    expect(domingosDoMes('2026-09')).toEqual(
      ['2026-09-06', '2026-09-13', '2026-09-20', '2026-09-27'],
    );
  });

  it('acha os CINCO domingos quando o mês tem cinco', () => {



    expect(domingosDoMes('2026-11')).toEqual(
      ['2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29'],
    );
  });

  it('fevereiro de ano bissexto não inventa dia 30', () => {
    const fev = domingosDoMes('2028-02');
    expect(fev.every(d => d.startsWith('2028-02-'))).toBe(true);
    expect(fev.every(d => Number(d.slice(-2)) <= 29)).toBe(true);
  });

  it('mês inválido devolve lista vazia em vez de estourar', () => {
    for (const m of ['', '2026-13', '2026-00', '26-09', 'setembro', null as any, undefined as any]) {
      expect(domingosDoMes(m)).toEqual([]);
    }
  });

  it('⚠️ dia da semana NÃO depende do fuso da máquina', () => {



    const tz = process.env.TZ;
    try {
      process.env.TZ = 'America/Sao_Paulo';
      expect(diaDaSemana('2026-09-06')).toBe(0);
      expect(domingosDoMes('2026-09')).toContain('2026-09-06');
      process.env.TZ = 'Pacific/Kiritimati';
      expect(diaDaSemana('2026-09-06')).toBe(0);
      expect(domingosDoMes('2026-09')).toContain('2026-09-06');
    } finally {
      if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz;
    }
  });

  it('nenhum dia gerado deixa de ser domingo', () => {
    for (const mes of ['2026-01', '2026-02', '2026-06', '2026-11', '2027-03']) {
      for (const d of domingosDoMes(mes)) expect(diaDaSemana(d)).toBe(0);
    }
  });

  it('o nome da turma leva o ano', () => {
    expect(nomeTurma('2026-09-06')).toBe('Next · 06/09/2026');
    expect(nomeTurma('2026-9-6')).toBeNull();
    expect(nomeTurma('')).toBeNull();
  });

  it('cada turma planejada tem exatamente UM encontro, no próprio domingo', () => {
    const t = turmasPlanejadas('2026-09', new Date('2026-08-01T12:00:00Z'));
    expect(t).toHaveLength(4);
    for (const x of t) {
      expect(x.encontros).toHaveLength(1);
      expect(x.encontros[0].numero).toBe(1);
      expect(x.encontros[0].data).toBe(x.data);
      expect(x.horario).toBe('09:30');
    }
  });

  it('⚠️ NÃO planeja turma para domingo que já passou', () => {

    const agora = new Date('2026-08-26T15:00:00Z');
    expect(turmasPlanejadas('2026-08', agora).map(t => t.data)).toEqual(['2026-08-30']);
  });

  it('planeja o mês seguinte inteiro', () => {
    const agora = new Date('2026-08-26T15:00:00Z');
    expect(turmasPlanejadas('2026-09', agora).map(t => t.data)).toEqual(
      ['2026-09-06', '2026-09-13', '2026-09-20', '2026-09-27'],
    );
  });

  it('mês inteiro no passado não planeja nada', () => {
    const agora = new Date('2026-08-26T15:00:00Z');
    expect(turmasPlanejadas('2026-07', agora)).toEqual([]);
  });

  it('o numero do encontro é 1 mesmo no 5º domingo (o CHECK do banco é 1..4)', () => {
    const t = turmasPlanejadas('2026-11', new Date('2026-10-01T12:00:00Z'));
    expect(t).toHaveLength(5);
    expect(t.map(x => x.encontros[0].numero)).toEqual([1, 1, 1, 1, 1]);
  });

  it('garante o mês corrente E o seguinte', () => {
    expect(mesesAGarantir(new Date('2026-08-26T12:00:00Z'))).toEqual(['2026-08', '2026-09']);

    expect(mesesAGarantir(new Date('2026-12-15T12:00:00Z'))).toEqual(['2026-12', '2027-01']);
  });

  it('proximoMes vira o ano em dezembro', () => {
    expect(proximoMes('2026-12')).toBe('2027-01');
    expect(proximoMes('2026-01')).toBe('2026-02');
    expect(proximoMes('2026-13')).toBeNull();
  });

  it('⚠️ o dia de hoje é o do fuso da IGREJA, não o UTC', () => {

    expect(hojeBRT(new Date('2026-08-27T02:00:00Z'))).toBe('2026-08-26');
    expect(mesDe(hojeBRT(new Date('2026-09-01T02:00:00Z')))).toBe('2026-08');
  });

  it('domingo que já passou não é oferecido no formulário', () => {
    const agora = new Date('2026-09-14T12:00:00Z');
    const dias = ['2026-09-06', '2026-09-13', '2026-09-20', '2026-09-27'];
    expect(domingosInscritiveis(dias, agora)).toEqual(['2026-09-20', '2026-09-27']);
  });

  it('o domingo de HOJE continua sendo opção', () => {
    const agora = new Date('2026-09-20T13:00:00Z');
    expect(domingosInscritiveis(['2026-09-13', '2026-09-20'], agora)).toEqual(['2026-09-20']);
  });

  it('lixo na lista de domingos não vira opção', () => {
    const agora = new Date('2026-09-01T12:00:00Z');
    expect(domingosInscritiveis(['', 'amanhã', '2026-9-6', '2026-09-06'] as any, agora))
      .toEqual(['2026-09-06']);
    expect(domingosInscritiveis(null as any, agora)).toEqual([]);
  });
});







describe('proximaTurma', () => {

  const abertas = [
    { id: 'a', data: '2026-08-30' }, { id: 'b', data: '2026-09-06' },
    { id: 'c', data: '2026-09-13' }, { id: 'd', data: '2026-09-20' },
    { id: 'e', data: '2026-09-27' }, { id: 'f', data: '2026-10-04' },
    { id: 'g', data: '2026-10-11' }, { id: 'h', data: '2026-10-18' },
    { id: 'i', data: '2026-10-25' },
  ];

  it('devolve a próxima, não a mais distante', () => {
    expect(proximaTurma(abertas, '2026-09-15')?.id).toBe('d');
  });



  it('a ordem do array não decide — a DATA decide', () => {
    const embaralhada = [...abertas].reverse();
    expect(proximaTurma(embaralhada, '2026-09-15')?.id).toBe('d');
  });

  it('o domingo de HOJE ainda conta (o encontro é hoje às 9h30)', () => {
    expect(proximaTurma(abertas, '2026-09-20')?.id).toBe('d');
  });

  it('passado nunca é oferecido', () => {
    expect(proximaTurma(abertas, '2026-10-26')).toBeNull();
  });



  it('turma sem data fica de fora', () => {
    expect(proximaTurma([{ id: 'x', data: null }, { id: 'y', data: '2026-09-20' }], '2026-09-15')?.id).toBe('y');
    expect(proximaTurma([{ id: 'x', data: null }], '2026-09-15')).toBeNull();
    expect(proximaTurma([{ id: 'x', data: '20/09/2026' }], '2026-09-15')).toBeNull();
  });

  it('entrada inválida não inventa turma', () => {
    expect(proximaTurma(null as any, '2026-09-15')).toBeNull();
    expect(proximaTurma(abertas, 'hoje' as any)).toBeNull();



    expect(proximaTurma(abertas, '')).toBeNull();
    expect(proximaTurma([], '2026-09-15')).toBeNull();
  });
});






describe('proximasTurmas', () => {
  const abertas = [
    { id: 'a', data: '2026-08-30' }, { id: 'b', data: '2026-09-06' },
    { id: 'c', data: '2026-09-13' }, { id: 'd', data: '2026-09-20' },
    { id: 'e', data: '2026-09-27' }, { id: 'f', data: '2026-10-04' },
    { id: 'g', data: '2026-10-11' }, { id: 'h', data: '2026-10-18' },
    { id: 'i', data: '2026-10-25' },
  ];

  it('oferece TRÊS por padrão, da mais perto para a mais longe', () => {
    expect(TURMAS_OFERECIDAS).toBe(3);
    expect(proximasTurmas(abertas, '2026-09-15').map(t => t.id)).toEqual(['d', 'e', 'f']);
  });



  it('o teto é o ponto: nunca devolve tudo que está aberto', () => {
    expect(proximasTurmas(abertas, '2026-09-15').length).toBe(3);
    expect(proximasTurmas(abertas, '2026-09-15').some(t => t.data > '2026-10-04')).toBe(false);
  });

  it('a ordem do array não decide — a DATA decide', () => {
    expect(proximasTurmas([...abertas].reverse(), '2026-09-15').map(t => t.id)).toEqual(['d', 'e', 'f']);
  });

  it('havendo menos que o teto, devolve o que há', () => {
    expect(proximasTurmas(abertas, '2026-10-18').map(t => t.id)).toEqual(['h', 'i']);
    expect(proximasTurmas(abertas, '2026-10-25').map(t => t.id)).toEqual(['i']);
  });

  it('passado nunca é oferecido, e sem futuro devolve lista vazia', () => {
    expect(proximasTurmas(abertas, '2026-10-26')).toEqual([]);
  });



  it('teto inválido não vira "sem teto"', () => {
    expect(proximasTurmas(abertas, '2026-09-15', 0)).toEqual([]);
    expect(proximasTurmas(abertas, '2026-09-15', -1)).toEqual([]);
    expect(proximasTurmas(abertas, '2026-09-15', 2.5 as any)).toEqual([]);
    expect(proximasTurmas(abertas, '2026-09-15', null as any)).toEqual([]);
  });

  it('entrada inválida devolve lista vazia, nunca null', () => {
    expect(proximasTurmas(null as any, '2026-09-15')).toEqual([]);
    expect(proximasTurmas(abertas, '')).toEqual([]);
    expect(proximasTurmas(abertas, 'hoje' as any)).toEqual([]);
  });





  it('proximaTurma é a primeira de proximasTurmas — uma régua só', () => {
    for (const hoje of ['2026-09-15', '2026-09-20', '2026-10-25', '2026-10-26']) {
      expect(proximaTurma(abertas, hoje)?.id ?? null)
        .toBe(proximasTurmas(abertas, hoje)[0]?.id ?? null);
    }
  });
});
