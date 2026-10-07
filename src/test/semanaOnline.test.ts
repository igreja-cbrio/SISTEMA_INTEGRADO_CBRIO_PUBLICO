











import { describe, it, expect } from 'vitest';
const { semanaAnteriorBRT, somarViews, compararSemanas, DIAS_CONSOLIDACAO } = require('../../backend/utils/semanaOnline');

function comFuso<T>(tz: string, fn: () => T): T {
  const antes = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    if (antes === undefined) delete process.env.TZ;
    else process.env.TZ = antes;
  }
}

describe('semanaAnteriorBRT · qual semana o card mostra', () => {
  it('na segunda de manhã mostra a semana que acabou de fechar', () => {

    const s = semanaAnteriorBRT(Date.parse('2026-09-21T12:00:00Z'));
    expect(s.inicio).toBe('2026-09-14');
    expect(s.fim).toBe('2026-09-20');
    expect(s.rotulo).toBe('14/09 a 20/09');
  });

  it('a semana vai de SEGUNDA a DOMINGO', () => {
    const s = semanaAnteriorBRT(Date.parse('2026-09-23T15:00:00Z'));
    expect(new Date(`${s.inicio}T00:00:00Z`).getUTCDay()).toBe(1);
    expect(new Date(`${s.fim}T00:00:00Z`).getUTCDay()).toBe(0);
  });

  it('⚠️⚠️ domingo 22h NO RIO ainda é domingo — a semana anterior é a de antes', () => {
    comFuso('America/Sao_Paulo', () => {

      const s = semanaAnteriorBRT(Date.parse('2026-09-21T01:00:00Z'));


      expect(s.inicio).toBe('2026-09-07');
      expect(s.fim).toBe('2026-09-13');
    });
  });

  it('⚠️ segunda 00:30 BRT (03:30 UTC) já mostra a semana fechada', () => {
    comFuso('America/Sao_Paulo', () => {
      const s = semanaAnteriorBRT(Date.parse('2026-09-21T03:30:00Z'));
      expect(s.fim).toBe('2026-09-20');
    });
  });

  it('atravessa a virada de ano sem quebrar', () => {

    const s = semanaAnteriorBRT(Date.parse('2027-01-05T15:00:00Z'));
    expect(s.inicio < s.fim).toBe(true);
    expect(new Date(`${s.inicio}T00:00:00Z`).getUTCDay()).toBe(1);
    expect(Date.parse(`${s.fim}T00:00:00Z`)).toBeLessThan(Date.parse('2027-01-05T00:00:00Z'));
  });

  it('⚠️ o rótulo é DD/MM e não escorrega de dia por fuso', () => {
    comFuso('America/Sao_Paulo', () => {
      const s = semanaAnteriorBRT(Date.parse('2026-09-21T12:00:00Z'));

      expect(s.rotulo).toBe('14/09 a 20/09');
    });
  });
});

describe('⚠️ consolidação · o número ainda sobe nos primeiros dias', () => {
  it('na segunda a semana está consolidando', () => {
    expect(semanaAnteriorBRT(Date.parse('2026-09-21T12:00:00Z')).consolidando).toBe(true);
  });

  it('na terça ainda está consolidando', () => {
    expect(semanaAnteriorBRT(Date.parse('2026-09-22T12:00:00Z')).consolidando).toBe(true);
  });

  it('de quarta em diante o número é final', () => {
    expect(semanaAnteriorBRT(Date.parse('2026-09-23T12:00:00Z')).consolidando).toBe(false);
    expect(semanaAnteriorBRT(Date.parse('2026-09-25T12:00:00Z')).consolidando).toBe(false);
  });

  it('a janela é de 2 dias, que é o que o YouTube ainda ajusta', () => {
    expect(DIAS_CONSOLIDACAO).toBe(2);
  });
});

describe('⚠️⚠️ somarViews · ausência NUNCA vira zero', () => {
  const linhas = [
    { data: '2026-09-13', views: 999, watch_minutos: 10 },
    { data: '2026-09-14', views: 4191, watch_minutos: 100 },
    { data: '2026-09-15', views: 2970, watch_minutos: 80 },
    { data: '2026-09-20', views: 606, watch_minutos: 20 },
    { data: '2026-09-21', views: 268, watch_minutos: 5 },
  ];

  it('soma só o que está DENTRO do intervalo', () => {
    const r = somarViews(linhas, '2026-09-14', '2026-09-20');
    expect(r.views).toBe(4191 + 2970 + 606);
    expect(r.dias_com_dado).toBe(3);
  });

  it('⚠️⚠️ sem nenhuma linha devolve NULL, nunca 0', () => {

    const r = somarViews([], '2026-09-14', '2026-09-20');
    expect(r.views).toBeNull();
    expect(r.dias_com_dado).toBe(0);
  });

  it('⚠️ declara a COBERTURA — dia sem coleta some da soma sem avisar', () => {


    const r = somarViews(linhas, '2026-09-14', '2026-09-20');
    expect(r.dias_com_dado).toBeLessThan(7);
  });

  it('entrada inválida não derruba nem inventa número', () => {
    expect(somarViews(null as any, '2026-09-14', '2026-09-20').views).toBeNull();
    const r = somarViews([{ data: '2026-09-15', views: 'x' } as any], '2026-09-14', '2026-09-20');
    expect(r.views).toBe(0);
    expect(r.dias_com_dado).toBe(1);
  });

  it('watch_minutos ausente não vira zero', () => {
    const r = somarViews([{ data: '2026-09-15', views: 100 }], '2026-09-14', '2026-09-20');
    expect(r.views).toBe(100);
    expect(r.watch_minutos).toBeNull();
  });

  it('aceita data com timestamp (o PostgREST pode devolver assim)', () => {
    const r = somarViews([{ data: '2026-09-15T00:00:00+00:00', views: 50 }], '2026-09-14', '2026-09-20');
    expect(r.views).toBe(50);
  });
});

describe('⚠️⚠️ compararSemanas · só semana COMPLETA vira percentual', () => {
  it('o caso sintético de 21/09: 5 dias contra 7 NÃO vira -55%', () => {




    const r = compararSemanas({ views: 6151, dias_com_dado: 5 }, { views: 13613, dias_com_dado: 7 });
    expect(r.pode).toBe(false);
    expect(r.motivo).toBe('semana_incompleta');
    expect(r.percentual).toBeUndefined();
  });

  it('com as duas completas, devolve percentual e absoluto', () => {
    const r = compararSemanas({ views: 13613, dias_com_dado: 7 }, { views: 7820, dias_com_dado: 7 });
    expect(r.pode).toBe(true);
    expect(r.absoluto).toBe(5793);
    expect(r.percentual).toBe(74.1);
  });

  it('queda real entre semanas completas é reportada', () => {
    const r = compararSemanas({ views: 800, dias_com_dado: 7 }, { views: 1000, dias_com_dado: 7 });
    expect(r.pode).toBe(true);
    expect(r.percentual).toBe(-20);
  });

  it('⚠️ semana ANTERIOR incompleta também bloqueia', () => {
    const r = compararSemanas({ views: 1000, dias_com_dado: 7 }, { views: 500, dias_com_dado: 4 });
    expect(r.pode).toBe(false);
    expect(r.motivo).toBe('anterior_incompleta');
  });

  it('⚠️⚠️ base ZERO não vira +∞ nem +100%', () => {


    const r = compararSemanas({ views: 100, dias_com_dado: 7 }, { views: 0, dias_com_dado: 7 });
    expect(r.pode).toBe(false);
    expect(r.motivo).toBe('base_zero');
    expect(r.absoluto).toBe(100);
  });

  it('⚠️ sem dado nenhum não compara', () => {
    expect(compararSemanas({ views: null, dias_com_dado: 0 }, { views: 100, dias_com_dado: 7 }).pode).toBe(false);
    expect(compararSemanas(null as any, null as any).pode).toBe(false);
  });

  it('semana completa com zero views compara normalmente', () => {

    const r = compararSemanas({ views: 0, dias_com_dado: 7 }, { views: 500, dias_com_dado: 7 });
    expect(r.pode).toBe(true);
    expect(r.percentual).toBe(-100);
  });
});
