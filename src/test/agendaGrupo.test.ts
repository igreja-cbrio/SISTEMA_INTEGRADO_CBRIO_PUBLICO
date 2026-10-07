import { describe, it, expect } from 'vitest';
import { proximasOcorrencias, proximoEncontro, agoraBRT, ocorrenciasPassadas, ancoraDeInicio, janelaCorrecaoPassada } from '../../backend/utils/agendaGrupo.js';











const DOM_20H_BRT = new Date('2026-08-16T23:00:00Z');

const DOM_23H_BRT = new Date('2026-08-17T02:00:00Z');

describe('fuso · o dia de operação é BRT (bug do cálculo antigo)', () => {
  it('às 23h BRT de domingo ainda é DOMINGO', () => {
    expect(agoraBRT(DOM_23H_BRT)).toMatchObject({ dia: 16, diaSemana: 0, hora: 23 });
  });

  it('⚠️ grupo de domingo NÃO pula uma semana às 23h BRT de domingo', () => {



    const p = proximoEncontro({ diaSemana: 0, horario: '19:00', agora: DOM_23H_BRT });
    expect(p?.data).toBe('2026-08-23');
  });

  it('encontro de HOJE que ainda não começou continua sendo o próximo', () => {
    expect(proximoEncontro({ diaSemana: 0, horario: '21:00', agora: DOM_20H_BRT })?.data).toBe('2026-08-16');
  });

  it('o instante devolvido é o horário BRT convertido (não UTC cru)', () => {
    const p = proximoEncontro({ diaSemana: 0, horario: '21:00', agora: DOM_20H_BRT });
    expect(p?.inicio).toBe('2026-08-17T00:00:00.000Z');
  });
});

describe('exceções · cancelar e remarcar UMA ocorrência', () => {
  const base = { diaSemana: 0, horario: '21:00', agora: DOM_20H_BRT };

  it('cancelar pula a ocorrência no "próximo encontro"', () => {
    const p = proximoEncontro({ ...base, excecoes: [{ data_original: '2026-08-16', status: 'cancelado' }] });
    expect(p?.data).toBe('2026-08-23');
  });

  it('⚠️ mas a cancelada CONTINUA na lista, marcada — pra poder desfazer', () => {
    const l = proximasOcorrencias({ ...base, excecoes: [{ data_original: '2026-08-16', status: 'cancelado' }] });
    expect(l[0]).toMatchObject({ data: '2026-08-16', status: 'cancelado' });
  });

  it('remarcar muda data e hora daquela ocorrência só', () => {
    const l = proximasOcorrencias({
      ...base,
      excecoes: [{ data_original: '2026-08-16', status: 'remarcado', nova_data: '2026-08-18', novo_horario: '20:00' }],
    });
    expect(l[0]).toMatchObject({ data_original: '2026-08-16', data: '2026-08-18', horario: '20:00', status: 'remarcado' });
    expect(l[1]).toMatchObject({ data: '2026-08-23', status: 'normal' });
  });

  it('remarcar para o passado some da lista de futuros (não ressuscita)', () => {
    const l = proximasOcorrencias({
      ...base,
      excecoes: [{ data_original: '2026-08-16', status: 'remarcado', nova_data: '2026-08-10' }],
    });
    expect(l.find(o => o.data_original === '2026-08-16')).toBeUndefined();
  });

  it('exceção de OUTRA data não afeta a próxima', () => {
    const l = proximasOcorrencias({ ...base, excecoes: [{ data_original: '2026-09-06', status: 'cancelado' }] });
    expect(l[0]).toMatchObject({ data: '2026-08-16', status: 'normal' });
  });

  it('todas as próximas canceladas ⇒ próximo encontro é null (o app diz isso)', () => {
    const ex = ['2026-08-16', '2026-08-23', '2026-08-30'].map(d => ({ data_original: d, status: 'cancelado' }));
    const l = proximasOcorrencias({ ...base, excecoes: ex, quantas: 3, janelaDias: 15 });
    expect(l.every(o => o.status === 'cancelado')).toBe(true);
    expect(proximoEncontro({ ...base, excecoes: ex, quantas: 3, janelaDias: 15 })).toBeNull();
  });
});

describe('⚠️ o que não pode quebrar', () => {
  it('grupo sem dia_semana devolve lista vazia, não erro', () => {
    expect(proximasOcorrencias({ diaSemana: null, horario: '19:00' })).toEqual([]);
    expect(proximoEncontro({ diaSemana: undefined, horario: '19:00' })).toBeNull();
  });

  it('dia_semana 0 (DOMINGO) funciona — é falsy e já mordeu este módulo antes', () => {
    const p = proximoEncontro({ diaSemana: 0, horario: '21:00', agora: DOM_20H_BRT });
    expect(p?.data).toBe('2026-08-16');
  });

  it('dia_semana inválido não gera data maluca', () => {
    expect(proximasOcorrencias({ diaSemana: 9, horario: '19:00' })).toEqual([]);
  });

  it('sem exceções, o comportamento é o de sempre', () => {
    const l = proximasOcorrencias({ diaSemana: 3, horario: '20:00', agora: DOM_20H_BRT, quantas: 3 });
    expect(l.map(o => o.data)).toEqual(['2026-08-19', '2026-08-26', '2026-09-02']);
    expect(l.every(o => o.status === 'normal')).toBe(true);
  });
});














import { cadenciaDias, janelaRemarcacao, LIMITE_REMARCA_DIAS } from '../../backend/utils/agendaGrupo.js';


const QUA_09H = new Date('2026-08-19T12:00:00Z');
const terca = (extra: Record<string, unknown> = {}) =>
  proximasOcorrencias({ diaSemana: 2, horario: '20:00', agora: QUA_09H, quantas: 4, ...extra });

describe('cadência · a recorrência do grupo manda', () => {
  it('semanal anda de 7 em 7', () => {
    expect(terca({ recorrencia: 'semanal' }).map(o => o.data))
      .toEqual(['2026-08-25', '2026-09-01', '2026-09-08', '2026-09-15']);
  });

  it('⚠️ quinzenal COM âncora anda de 14 em 14 a partir dela', () => {

    expect(terca({ recorrencia: 'quinzenal', ancoraISO: '2026-08-11' }).map(o => o.data))
      .toEqual(['2026-08-25', '2026-09-08', '2026-09-22', '2026-10-06']);
  });

  it('⚠️ mensal = 28 dias, pra continuar caindo na MESMA terça', () => {
    const ds = terca({ recorrencia: 'mensal', ancoraISO: '2026-08-04' });
    expect(ds.map(o => o.data)).toEqual(['2026-09-01', '2026-09-29', '2026-10-27', '2026-11-24']);
    for (const o of ds) expect(o.dia_semana).toBe(2);
  });

  it('diário ignora dia_semana e anda de 1 em 1', () => {
    const ds = proximasOcorrencias({ diaSemana: 2, horario: '20:00', recorrencia: 'diario', agora: QUA_09H, quantas: 3 });
    expect(ds.map(o => o.data)).toEqual(['2026-08-19', '2026-08-20', '2026-08-21']);
  });

  it('recorrência nula/desconhecida cai no semanal (a maioria)', () => {
    expect(cadenciaDias(null)).toBe(7);
    expect(cadenciaDias('esporadico')).toBe(7);
    expect(cadenciaDias('QUINZENAL')).toBe(14);
  });

  it('⚠️⚠️ quinzenal SEM âncora devolve UMA ocorrência, declarada incerta', () => {



    const ds = terca({ recorrencia: 'quinzenal' });
    expect(ds).toHaveLength(1);
    expect(ds[0].ancora_incerta).toBe(true);
  });

  it('semanal NUNCA é incerto — não depende de âncora', () => {
    expect(terca({ recorrencia: 'semanal' }).every(o => o.ancora_incerta === false)).toBe(true);
  });
});

describe('janela de remarcação · min(7 dias, véspera do próximo)', () => {
  it('semanal: 6 dias, porque o próximo encontro é em 7', () => {
    const [primeiro] = terca({ recorrencia: 'semanal' });
    expect(primeiro.data_original).toBe('2026-08-25');
    expect(primeiro.remarcar_ate).toBe('2026-08-31');
    expect(primeiro.pode_remarcar).toBe(true);
  });

  it('⚠️ quinzenal: o teto de 7 dias manda (não os 13 da cadência)', () => {
    const [primeiro] = terca({ recorrencia: 'quinzenal', ancoraISO: '2026-08-11' });
    expect(primeiro.remarcar_ate).toBe('2026-09-01');
  });

  it('⚠️⚠️ mensal: o teto de 7 impede duas reuniões em dias seguidos', () => {
    const [primeiro] = terca({ recorrencia: 'mensal', ancoraISO: '2026-08-04' });

    expect(primeiro.remarcar_ate).toBe('2026-09-08');
  });

  it('nunca no passado: o piso é HOJE', () => {
    const [primeiro] = terca({ recorrencia: 'semanal' });
    expect(primeiro.remarcar_de).toBe('2026-08-19');
  });

  it('não invade o encontro ANTERIOR', () => {
    const j = janelaRemarcacao({
      dataOriginal: '2026-09-01', anteriorISO: '2026-08-25',
      proximaISO: '2026-09-08', hojeISO: '2026-08-19',
    });
    expect(j).toMatchObject({ de: '2026-08-26', ate: '2026-09-07', pode: true });
  });

  it('⚠️ espremida entre a véspera e o dia seguinte, a janela vira O PRÓPRIO DIA', () => {



    const j = janelaRemarcacao({
      dataOriginal: '2026-09-01', anteriorISO: '2026-08-31',
      proximaISO: '2026-09-02', hojeISO: '2026-09-01',
    });
    expect(j).toMatchObject({ de: '2026-09-01', ate: '2026-09-01', pode: true });
  });

  it('⚠️ janela REALMENTE vazia devolve pode=false', () => {


    const j = janelaRemarcacao({
      dataOriginal: '2026-09-01', anteriorISO: '2026-09-01',
      proximaISO: '2026-09-01', hojeISO: '2026-08-19',
    });
    expect(j.pode).toBe(false);
  });

  it('o limite é 7 e mudá-lo é decisão, não acidente', () => {
    expect(LIMITE_REMARCA_DIAS).toBe(7);
  });
});









import { ocorrenciaAnterior } from '../../backend/utils/agendaGrupo.js';


const TER_14H = new Date('2026-08-18T17:00:00Z');
const anterior = (excecoes: any[] = []) =>
  ocorrenciaAnterior({ diaSemana: 2, horario: '20:00', excecoes, agora: TER_14H });

describe('encontro anterior · é o que decide "faltou registrar"', () => {
  it('sem exceção, a anterior é a ocorrência de hoje', () => {
    expect(anterior()).toMatchObject({ data: '2026-08-18', status: 'normal' });
  });

  it('⚠️⚠️ remarcado 18 → 20: a anterior volta a ser 11, não 18', () => {


    expect(anterior([{ data_original: '2026-08-18', status: 'remarcado', nova_data: '2026-08-20' }]))
      .toMatchObject({ data: '2026-08-11' });
  });

  it('⚠️ encontro CANCELADO não gera pendência de chamada', () => {
    expect(anterior([{ data_original: '2026-08-18', status: 'cancelado' }])).toBeNull();
  });

  it('remarcado para TRÁS (antecipado) passa a ser a anterior', () => {
    expect(anterior([{ data_original: '2026-08-18', status: 'remarcado', nova_data: '2026-08-17' }]))
      .toMatchObject({ data: '2026-08-17', data_original: '2026-08-18' });
  });

  it('grupo sem dia_semana devolve null, não erro', () => {
    expect(ocorrenciaAnterior({ diaSemana: null, horario: '20:00', agora: TER_14H })).toBeNull();
  });
});















const TER_25_12H = new Date('2026-08-25T15:00:00Z');

const passadas = (extra: Record<string, unknown> = {}) =>
  ocorrenciasPassadas({ diaSemana: 2, horario: '19:30', agora: TER_25_12H, quantas: 4, ...extra });

describe('ocorrencias passadas - o historico a vista', () => {
  it('lista da mais RECENTE para a mais antiga', () => {
    expect(passadas().map((o: any) => o.data))
      .toEqual(['2026-08-18', '2026-08-11', '2026-08-04', '2026-07-28']);
  });

  it('ATENCAO o encontro de HOJE que ainda nao chegou na hora NAO entra', () => {


    expect(passadas().map((o: any) => o.data)).not.toContain('2026-08-25');
  });

  it('o encontro de hoje ENTRA depois de passar a hora', () => {

    const depois = ocorrenciasPassadas({
      diaSemana: 2, horario: '19:30', agora: new Date('2026-08-25T23:00:00Z'), quantas: 2,
    });
    expect(depois[0]).toMatchObject({ data: '2026-08-25', status: 'nao_registrado' });
  });

  it('sem chamada registrada, tudo volta como nao_registrado', () => {
    expect(passadas().every((o: any) => o.status === 'nao_registrado')).toBe(true);
  });

  it('ATENCAO a semana em que o lider registrou fica registrado, e SO ela', () => {

    const r = passadas({ registradas: ['2026-08-18'] });
    expect(r[0]).toMatchObject({ data: '2026-08-18', status: 'registrado', registrado: true });
    expect(r[1]).toMatchObject({ data: '2026-08-11', status: 'nao_registrado' });
  });

  it('aceita Set de datas registradas, nao so array', () => {
    const r = passadas({ registradas: new Set(['2026-08-11']) });
    expect(r.find((o: any) => o.data === '2026-08-11')?.status).toBe('registrado');
  });

  it('ATENCAO encontro CANCELADO nao e pendencia de chamada', () => {
    const r = passadas({ excecoes: [{ data_original: '2026-08-18', status: 'cancelado' }] });
    expect(r[0]).toMatchObject({ data: '2026-08-18', status: 'cancelado' });
  });

  it('cancelado que TEM chamada registrada conta como registrado', () => {

    const r = passadas({
      excecoes: [{ data_original: '2026-08-18', status: 'cancelado' }],
      registradas: ['2026-08-18'],
    });
    expect(r[0]).toMatchObject({ data: '2026-08-18', status: 'registrado' });
  });

  it('remarcado para tras aparece na DATA NOVA, com a original ao lado', () => {
    const r = passadas({ excecoes: [{ data_original: '2026-08-18', status: 'remarcado', nova_data: '2026-08-20' }] });
    expect(r[0]).toMatchObject({ data: '2026-08-20', data_original: '2026-08-18' });
  });

  it('ATENCAO remarcado para o FUTURO sai do historico', () => {


    const r = passadas({ excecoes: [{ data_original: '2026-08-18', status: 'remarcado', nova_data: '2026-08-28' }] });
    expect(r.map((o: any) => o.data)).not.toContain('2026-08-18');
    expect(r.map((o: any) => o.data)).not.toContain('2026-08-28');
    expect(r[0].data).toBe('2026-08-11');
  });

  it('remarcado leva o horario novo', () => {
    const r = passadas({ excecoes: [{ data_original: '2026-08-18', status: 'remarcado', nova_data: '2026-08-19', novo_horario: '21:00' }] });
    expect(r[0]).toMatchObject({ data: '2026-08-19', horario: '21:00' });
  });

  it('respeita a cadencia: quinzenal COM ancora salta de 14 em 14', () => {
    const r = passadas({ recorrencia: 'quinzenal', ancoraISO: '2026-08-11' });
    expect(r.map((o: any) => o.data)).toEqual(['2026-08-11', '2026-07-28', '2026-07-14', '2026-06-30']);
  });

  it('ATENCAO quinzenal SEM ancora devolve VAZIO - nao inventa passado', () => {


    expect(passadas({ recorrencia: 'quinzenal' })).toEqual([]);
  });

  it('mensal COM ancora salta de 28 em 28', () => {
    const r = passadas({ recorrencia: 'mensal', ancoraISO: '2026-08-04', quantas: 3 });
    expect(r.map((o: any) => o.data)).toEqual(['2026-08-04', '2026-07-07', '2026-06-09']);
  });

  it('diario devolve os dias corridos, incluindo hoje', () => {
    const r = ocorrenciasPassadas({ diaSemana: 2, recorrencia: 'diario', horario: '07:00', agora: TER_25_12H, quantas: 3 });
    expect(r.map((o: any) => o.data)).toEqual(['2026-08-25', '2026-08-24', '2026-08-23']);
  });

  it('ATENCAO grupo sem dia_semana devolve VAZIO (Number(null) e DOMINGO)', () => {
    expect(ocorrenciasPassadas({ diaSemana: null, horario: '20:00', agora: TER_25_12H })).toEqual([]);
    expect(ocorrenciasPassadas({ diaSemana: undefined, horario: '20:00', agora: TER_25_12H })).toEqual([]);
    expect(ocorrenciasPassadas({ diaSemana: '', horario: '20:00', agora: TER_25_12H })).toEqual([]);
  });

  it('respeita o teto de quantas', () => {
    expect(ocorrenciasPassadas({ diaSemana: 2, horario: '19:30', agora: TER_25_12H, quantas: 2 })).toHaveLength(2);
  });

  it('desdeISO corta o inicio da temporada', () => {
    const r = passadas({ desdeISO: '2026-08-05', quantas: 10 });
    expect(r.map((o: any) => o.data)).toEqual(['2026-08-18', '2026-08-11']);
  });

  it('ATENCAO o dia e BRT: as 23h BRT de terca ainda e TERCA', () => {


    const r = ocorrenciasPassadas({
      diaSemana: 2, horario: '19:30', agora: new Date('2026-08-26T02:00:00Z'), quantas: 1,
    });
    expect(r[0].data).toBe('2026-08-25');
  });
});





















const passadasComInicio = (extra: Record<string, unknown> = {}) =>
  ocorrenciasPassadas({
    diaSemana: 2, horario: '19:30', agora: TER_25_12H, quantas: 4,
    recorrencia: 'quinzenal', inicioISO: '2026-07-01', ...extra,
  });

describe('datas estimadas · o histórico do quinzenal/mensal existe', () => {
  it('⚠️⚠️ quinzenal SEM âncora real gera as datas a partir do início', () => {

    expect(passadasComInicio().map((o: any) => o.data))
      .toEqual(['2026-08-18', '2026-08-04', '2026-07-21', '2026-07-07']);
  });

  it('⚠️ e TODAS vêm marcadas como ESTIMADAS', () => {

    expect(passadasComInicio().every((o: any) => o.data_estimada === true)).toBe(true);
  });

  it('⚠️⚠️ com âncora REAL (encontro registrado) NADA é estimado', () => {

    const r = passadasComInicio({ ancoraISO: '2026-08-11' });
    expect(r.map((o: any) => o.data)).toEqual(['2026-08-11', '2026-07-28', '2026-07-14', '2026-06-30']);
    expect(r.every((o: any) => o.data_estimada === false)).toBe(true);
  });

  it('⚠️ SEMANAL nunca é estimado — o dia da semana já determina tudo', () => {
    const r = passadasComInicio({ recorrencia: 'semanal' });
    expect(r.every((o: any) => o.data_estimada === false)).toBe(true);
  });

  it('mensal também gera (28 dias) a partir do início', () => {
    const r = passadasComInicio({ recorrencia: 'mensal', inicioISO: '2026-05-01', quantas: 3 });
    expect(r.map((o: any) => o.data)).toEqual(['2026-07-28', '2026-06-30', '2026-06-02']);
    expect(r[0].data_estimada).toBe(true);
  });

  it('⚠️ ocorrência com EXCEÇÃO deixa de ser estimativa (gente já decidiu)', () => {
    const r = passadasComInicio({
      excecoes: [{ data_original: '2026-08-18', status: 'remarcado', nova_data: '2026-08-19' }],
    });
    expect(r[0]).toMatchObject({ data: '2026-08-19', data_estimada: false });
    expect(r[1].data_estimada).toBe(true);
  });

  it('⚠️ sem âncora E sem início continua VAZIO — não há de onde derivar', () => {
    expect(ocorrenciasPassadas({
      diaSemana: 2, recorrencia: 'quinzenal', agora: TER_25_12H,
    })).toEqual([]);
  });

  it('⚠️ grupo sem dia_semana não ganha agenda estimada', () => {
    expect(ocorrenciasPassadas({
      diaSemana: null, recorrencia: 'quinzenal', inicioISO: '2026-07-01', agora: TER_25_12H,
    })).toEqual([]);
  });

  it('⚠️⚠️ desdeISO é o PISO: não lista antes de o grupo começar', () => {




    const r = passadasComInicio({ desdeISO: '2026-08-01', quantas: 12 });
    expect(r.map((o: any) => o.data)).toEqual(['2026-08-18', '2026-08-04']);
  });
});

describe('ancoraDeInicio · a 1a ocorrência do dia da semana', () => {
  it('01/07/2026 é quarta; para grupo de TERÇA a âncora é 07/07', () => {
    expect(ancoraDeInicio({ diaSemana: 2, inicioISO: '2026-07-01' })).toBe('2026-07-07');
  });

  it('quando o início JÁ cai no dia da semana, é ele mesmo', () => {
    expect(ancoraDeInicio({ diaSemana: 3, inicioISO: '2026-07-01' })).toBe('2026-07-01');
  });

  it('⚠️ sem início, sem dia da semana ou com data ilegível devolve null', () => {
    expect(ancoraDeInicio({ diaSemana: 2, inicioISO: null })).toBeNull();
    expect(ancoraDeInicio({ diaSemana: null, inicioISO: '2026-07-01' })).toBeNull();
    expect(ancoraDeInicio({ diaSemana: 2, inicioISO: 'ontem' })).toBeNull();

    expect(ancoraDeInicio({ diaSemana: 9, inicioISO: '2026-07-01' })).toBeNull();
  });
});

describe('janelaCorrecaoPassada · corrigir a data de um encontro que já passou', () => {
  const HOJE = '2026-08-25';

  it('fica ESTRITAMENTE entre os vizinhos', () => {



    expect(janelaCorrecaoPassada({
      dataOriginal: '2026-08-18', anteriorISO: '2026-08-11', proximaISO: '2026-08-25', hojeISO: HOJE,
    })).toMatchObject({ de: '2026-08-12', ate: '2026-08-24', pode: true });
  });

  it('⚠️⚠️ NUNCA passa de hoje — encontro futuro não se corrige', () => {



    const j = janelaCorrecaoPassada({ dataOriginal: '2026-08-25', hojeISO: HOJE });
    expect(j?.ate).toBe(HOJE);
  });

  it('sem vizinhos, abre uma folga limitada — nunca qualquer data', () => {

    const j = janelaCorrecaoPassada({ dataOriginal: '2026-08-18', hojeISO: HOJE });
    expect(j).toMatchObject({ de: '2026-06-19', ate: HOJE, pode: true });
  });

  it('⚠️ vizinhos colados espremem a janela até a PRÓPRIA data, e isso é pode:true', () => {





    expect(janelaCorrecaoPassada({
      dataOriginal: '2026-08-18', anteriorISO: '2026-08-17', proximaISO: '2026-08-19', hojeISO: HOJE,
    })).toMatchObject({ de: '2026-08-18', ate: '2026-08-18', pode: true });
  });

  it('⚠️⚠️ vizinhos INCOERENTES fecham a janela, nunca abrem', () => {


    expect(janelaCorrecaoPassada({
      dataOriginal: '2026-08-18', anteriorISO: '2026-08-20', proximaISO: '2026-08-10', hojeISO: HOJE,
    })).toMatchObject({ pode: false });
  });

  it('sem data ou sem hoje devolve null, nunca uma janela inventada', () => {
    expect(janelaCorrecaoPassada({ dataOriginal: null as unknown as string, hojeISO: HOJE })).toBeNull();
    expect(janelaCorrecaoPassada({ dataOriginal: '2026-08-18', hojeISO: null as unknown as string })).toBeNull();
  });
});






describe('janelaCorrecaoPassada · o dia que já tem chamada sai da janela', () => {
  const HOJE = '2026-08-25';
  const base = { dataOriginal: '2026-08-18', anteriorISO: '2026-08-11', proximaISO: '2026-08-25', hojeISO: HOJE };

  it('sem `ocupadas` a janela é a de sempre e `bloqueadas` vem vazia', () => {
    const j = janelaCorrecaoPassada(base)!;
    expect(j.de).toBe('2026-08-12');
    expect(j.ate).toBe('2026-08-24');
    expect(j.bloqueadas).toEqual([]);
    expect(j.pode).toBe(true);
  });

  it('devolve as datas ocupadas que caem DENTRO da janela', () => {
    const j = janelaCorrecaoPassada({ ...base, ocupadas: ['2026-08-13', '2026-08-20'] })!;
    expect(j.bloqueadas).toEqual(['2026-08-13', '2026-08-20']);

    expect(j.de).toBe('2026-08-12');
    expect(j.ate).toBe('2026-08-24');
    expect(j.pode).toBe(true);
  });



  it('data ocupada FORA da janela não é devolvida', () => {
    const j = janelaCorrecaoPassada({ ...base, ocupadas: ['2026-07-01', '2026-12-25'] })!;
    expect(j.bloqueadas).toEqual([]);
  });




  it('a data original nunca entra em bloqueadas, mesmo constando em ocupadas', () => {
    const j = janelaCorrecaoPassada({ ...base, ocupadas: ['2026-08-18'] })!;
    expect(j.bloqueadas).toEqual([]);
    expect(j.pode).toBe(true);
  });



  it('sem NENHUMA data livre, `pode` é false', () => {
    const j = janelaCorrecaoPassada({
      dataOriginal: '2026-08-18', anteriorISO: '2026-08-16', proximaISO: '2026-08-20',
      hojeISO: HOJE, ocupadas: ['2026-08-17', '2026-08-18', '2026-08-19'],
    })!;

    expect(j.bloqueadas).toEqual(['2026-08-17', '2026-08-19']);
    expect(j.pode).toBe(true);


    const vazia = janelaCorrecaoPassada({
      dataOriginal: '2026-08-18', anteriorISO: '2026-08-18', proximaISO: '2026-08-20',
      hojeISO: HOJE, ocupadas: ['2026-08-19'],
    })!;
    expect(vazia.de).toBe('2026-08-19');
    expect(vazia.ate).toBe('2026-08-19');
    expect(vazia.bloqueadas).toEqual(['2026-08-19']);
    expect(vazia.pode).toBe(false);
  });

  it('tolera timestamp e lista nula sem quebrar', () => {
    expect(janelaCorrecaoPassada({ ...base, ocupadas: null as unknown as string[] })!.bloqueadas).toEqual([]);
    expect(
      janelaCorrecaoPassada({ ...base, ocupadas: ['2026-08-13T00:00:00+00:00'] })!.bloqueadas
    ).toEqual(['2026-08-13']);
  });
});
