import { describe, it, expect } from 'vitest';

import * as PA from '../../backend/services/planejamentoAnualRegras.js';

const {
  CRITERIOS,
  somarDias,
  horariosSobrepoem,
  liquido,
  modeloCusteio,
  mesesOcupados,
  rateioMensal,
  decisaoVigente,
  noCalendario,
  estadoDerivado,
  podeTransicionar,
  validarEnvio,
  validarCamposObrigatorios,
  validarAvaliacao,
  validarRetificacao,
  diffRetificacao,
  montarRanking,
  detectarConflitos,
  aplicarAceites,
  validarTravas,
  caixaLivreMensal,
  orcamentoDoPastor,
  projetarProposta,
} = PA;


const DIRETORIAS = ['ministerial', 'operacoes', 'financeiro', 'criativo'];
const QUORUM = 4;
const CHAVES = CRITERIOS.map((c: any) => c.chave);

let seq = 0;
function prop(o: Record<string, unknown> = {}) {
  seq += 1;
  return {
    id: `p-${String(seq).padStart(3, '0')}`,
    ciclo_id: 'c1',
    nome: `Proposta ${seq}`,
    natureza: 'evento',
    area: 'kids',
    lider_id: 'u-lider',
    data_inicio: '2027-03-10',
    precisao_inicio: 'dia',
    multi_dia: false,
    data_fim: null,
    precisao_fim: null,
    recorrencia: 'unica',
    dia_semana: null,
    hora_inicio: null,
    hora_fim: null,
    local_id: 'templo',
    descricao: '',
    alcance_pct: 50,
    publico_considerado: 'igreja_inteira',
    valores: [],
    custo: 1000,
    tem_arrecadacao: false,
    arrecadacao_prevista: 0,
    estado: 'enviada',
    versao: 1,
    versao_anterior: null,
    deleted_at: null,
    ...o,
  };
}

let aseq = 0;
function aval(diretoria: string, notas: number | number[], extra: Record<string, unknown> = {}) {
  aseq += 1;
  const ns = Array.isArray(notas) ? notas : new Array(7).fill(notas);
  const o: Record<string, unknown> = {
    id: `a-${aseq}`, diretoria, avaliador_id: `u-${diretoria}`,
    coment_criterios: {}, comentario_geral: null, deleted_at: null, ...extra,
  };
  CHAVES.forEach((c: string, i: number) => { o['nota_' + c] = ns[i]; });
  return o;
}

function quatroAvaliacoes(notas: number | number[] = 4) {
  return DIRETORIAS.map((d) => aval(d, notas));
}

let dseq = 0;
function decisao(o: Record<string, unknown> = {}) {
  dseq += 1;
  return {
    id: `d-${dseq}`, rodada: 1, decisao: 'aprovada',
    ressalva_texto: null, ressalva_prazo: null, ressalva_cumprida_em: null,
    exigencia_texto: null, exigencia_prazo: null,
    revogada_em: null, decidido_por: 'u-pastor', ...o,
  };
}

const LOCAIS: Record<string, unknown> = {
  templo: { id: 'templo', nome: 'Templo', gera_conflito: true },
  sala1: { id: 'sala1', nome: 'Sala 1', gera_conflito: true },
  fora: { id: 'fora', nome: 'Fora da igreja', gera_conflito: false },
};


describe('cegueira até o quórum (teste 1 e 9 do spec)', () => {
  const p = prop();
  const tres = DIRETORIAS.slice(0, 3).map((d) => aval(d, 4));
  const quatro = quatroAvaliacoes(4);

  it('avaliador com 3/4 NÃO vê notas alheias nem médias · vê a própria + contagem', () => {
    const proj = projetarProposta({ proposta: p, avaliacoes: tres, decisoes: [], apontamentos: [], quorum: QUORUM, papel: 'avaliador', minhaDiretoria: 'ministerial' });
    expect(proj.avaliacoes).toBeNull();
    expect(proj.medias).toBeNull();
    expect(proj.soma).toBeNull();
    expect(proj.minha_avaliacao).toBeTruthy();
    expect(proj.minha_avaliacao.diretoria).toBe('ministerial');
    expect(proj.avaliacoes_recebidas).toBe(3);
  });

  it('com 4/4 as notas e médias aparecem', () => {
    const proj = projetarProposta({ proposta: p, avaliacoes: quatro, decisoes: [], apontamentos: [], quorum: QUORUM, papel: 'avaliador', minhaDiretoria: 'ministerial' });
    expect(proj.avaliacoes).toHaveLength(4);
    expect(proj.medias).toHaveLength(7);
    expect(proj.soma).toBeCloseTo(28, 5);
  });

  it('2026-09-18: o Pastor SEMPRE recebe as avaliações, mesmo parciais (revoga a cegueira anterior)', () => {
    const proj = projetarProposta({ proposta: p, avaliacoes: tres, decisoes: [], apontamentos: [], quorum: QUORUM, papel: 'pastor' });
    expect(proj.avaliacoes).toHaveLength(3);
    expect(proj.medias).not.toBeNull();
  });

  it('avaliação soft-deletada (reaberta pros diretores) não conta pro quórum', () => {
    const comDeletada = [...tres, aval('criativo', 5, { deleted_at: '2027-01-01T00:00:00Z' })];
    const proj = projetarProposta({ proposta: p, avaliacoes: comDeletada, decisoes: [], apontamentos: [], quorum: QUORUM, papel: 'avaliador', minhaDiretoria: 'ministerial' });
    expect(proj.avaliacoes_recebidas).toBe(3);
    expect(proj.avaliacoes).toBeNull();
  });
});


describe('proposta sem quórum (teste 2 do spec)', () => {
  it('não aparece no ranking e o painel diz quem falta', () => {
    const completa = prop({ nome: 'Completa' });
    const incompleta = prop({ nome: 'Incompleta' });
    const r = montarRanking({
      propostas: [completa, incompleta],
      avaliacoesPorProposta: {
        [completa.id]: quatroAvaliacoes(3),
        [incompleta.id]: [aval('ministerial', 5), aval('criativo', 5)],
      },
      quorum: QUORUM,
      diretorias: DIRETORIAS,
    });
    expect(r.ranqueadas).toHaveLength(1);
    expect(r.ranqueadas[0].proposta.nome).toBe('Completa');
    expect(r.foraDoRanking).toHaveLength(1);
    expect(r.foraDoRanking[0].faltam.sort()).toEqual(['financeiro', 'operacoes']);
  });

  it('não conta como pendente no orçamento do Pastor', () => {
    const semQuorum = prop({ custo: 999 });
    const orc = orcamentoDoPastor({
      propostas: [semQuorum],
      avaliacoesPorProposta: { [semQuorum.id]: [aval('ministerial', 4)] },
      decisoesPorProposta: {},
      quorum: QUORUM,
      caixaLivre: new Array(12).fill(1000),
    });
    expect(orc.propostos.every((v: number) => v === 0)).toBe(true);
    expect(orc.pendentes).toHaveLength(0);
  });
});




describe('orcamentoDoPastor.propostos reflete apontamento e recorrência', () => {
  it('proposta pendente recorrente (mensal) distribui o anualizado/12 em TODOS os meses, não só no mês de início', () => {
    const p = prop({ custo: 1200, recorrencia: 'mensal', data_inicio: '2027-06-01' });
    const orc = orcamentoDoPastor({
      propostas: [p],
      avaliacoesPorProposta: { [p.id]: quatroAvaliacoes(4) },
      decisoesPorProposta: {},
      quorum: QUORUM,
      caixaLivre: new Array(12).fill(0),
    });
    expect(orc.pendentes).toHaveLength(1);

    orc.propostos.forEach((v: number) => expect(v).toBe(1200));
  });

  it('apontamento do Pastor no custo/recorrência atualiza "propostos" em tempo real', () => {
    const p = prop({ custo: 1000, recorrencia: 'unica', data_inicio: '2027-08-15' });
    const orcAntes = orcamentoDoPastor({
      propostas: [p],
      avaliacoesPorProposta: { [p.id]: quatroAvaliacoes(4) },
      decisoesPorProposta: {},
      quorum: QUORUM,
      caixaLivre: new Array(12).fill(0),
    });
    expect(orcAntes.propostos[7]).toBe(1000);

    const pApontado = { ...p, custo_apontado: 500 };
    const orcDepois = orcamentoDoPastor({
      propostas: [pApontado],
      avaliacoesPorProposta: { [p.id]: quatroAvaliacoes(4) },
      decisoesPorProposta: {},
      quorum: QUORUM,
      caixaLivre: new Array(12).fill(0),
    });
    expect(orcDepois.propostos[7]).toBe(500);
    expect(orcDepois.propostos.reduce((s: number, v: number) => s + v, 0)).toBe(500);
  });
});


describe('ranking e desempate (teste 3 do spec)', () => {
  it('soma igual → decide o primeiro critério divergente na ordem do formulário', () => {

    const a = prop({ nome: 'Alfa' });
    const b = prop({ nome: 'Beta' });
    const notasA = [5, 3, 4, 4, 4, 4, 4];
    const notasB = [4, 4, 4, 4, 4, 4, 4];
    const r = montarRanking({
      propostas: [b, a],
      avaliacoesPorProposta: {
        [a.id]: DIRETORIAS.map((d) => aval(d, notasA)),
        [b.id]: DIRETORIAS.map((d) => aval(d, notasB)),
      },
      quorum: QUORUM,
      diretorias: DIRETORIAS,
    });
    expect(r.ranqueadas[0].proposta.nome).toBe('Alfa');
    expect(r.ranqueadas[0].soma).toBeCloseTo(r.ranqueadas[1].soma, 9);
  });

  it('empate total → ordem alfabética pt-BR (acento não joga pro fim)', () => {
    const zebra = prop({ nome: 'Zebra' });
    const agape = prop({ nome: 'Ágape' });
    const r = montarRanking({
      propostas: [zebra, agape],
      avaliacoesPorProposta: {
        [zebra.id]: quatroAvaliacoes(4),
        [agape.id]: quatroAvaliacoes(4),
      },
      quorum: QUORUM,
      diretorias: DIRETORIAS,
    });
    expect(r.ranqueadas.map((x: any) => x.proposta.nome)).toEqual(['Ágape', 'Zebra']);
  });

  it('proposta retificada fica fora do painel de ranking (fila do Pastor)', () => {
    const ret = prop({ estado: 'retificada' });
    const r = montarRanking({
      propostas: [ret],
      avaliacoesPorProposta: { [ret.id]: quatroAvaliacoes(4) },
      quorum: QUORUM,
      diretorias: DIRETORIAS,
    });
    expect(r.ranqueadas).toHaveLength(0);
    expect(r.foraDoRanking).toHaveLength(0);
  });
});







describe('aprovada com ressalvas (2026-09-18: nunca trava calendário/publicação)', () => {
  const p = prop({ estado: 'aprovada_ressalvas', custo: 600, data_inicio: '2027-05-01', precisao_inicio: 'mes' });
  const naoVerificada = [decisao({ decisao: 'aprovada_ressalvas', ressalva_texto: 'Reduzir custo' })];
  const verificada = [decisao({ decisao: 'aprovada_ressalvas', ressalva_texto: 'Reduzir custo', ressalva_cumprida_em: '2027-01-10T12:00:00Z' })];

  it('não verificada: já está no calendário, já conta no custo comprometido e NÃO trava a publicação', () => {
    expect(noCalendario(p, naoVerificada)).toBe(true);
    const orc = orcamentoDoPastor({
      propostas: [p],
      avaliacoesPorProposta: { [p.id]: quatroAvaliacoes(4) },
      decisoesPorProposta: { [p.id]: naoVerificada },
      quorum: QUORUM,
      caixaLivre: new Array(12).fill(0),
    });
    expect(orc.comprometido[4]).toBe(600);
    const travas = validarTravas({
      propostas: [p],
      avaliacoesPorProposta: { [p.id]: quatroAvaliacoes(4) },
      decisoesPorProposta: { [p.id]: naoVerificada },
      quorum: QUORUM,
      locaisById: LOCAIS,
      aceites: [],
    });
    expect(travas.bloqueada).toBe(false);
    expect(travas.motivos.join(' ')).not.toMatch(/ressalva/);

    expect(travas.detalhe.ressalva).toHaveLength(1);
  });

  it('verificada: segue no calendário e no custo comprometido, e a pendência some do detalhe', () => {
    expect(noCalendario(p, verificada)).toBe(true);
    const orc = orcamentoDoPastor({
      propostas: [p],
      avaliacoesPorProposta: { [p.id]: quatroAvaliacoes(4) },
      decisoesPorProposta: { [p.id]: verificada },
      quorum: QUORUM,
      caixaLivre: new Array(12).fill(0),
    });
    expect(orc.comprometido[4]).toBe(600);
    const travas = validarTravas({
      propostas: [p],
      avaliacoesPorProposta: { [p.id]: quatroAvaliacoes(4) },
      decisoesPorProposta: { [p.id]: verificada },
      quorum: QUORUM,
      locaisById: LOCAIS,
      aceites: [],
    });
    expect(travas.bloqueada).toBe(false);
    expect(travas.detalhe.ressalva).toHaveLength(0);
  });
});


describe('conflitos (testes 5 e 6 do spec)', () => {
  it('agenda NÃO dispara entre naturezas diferentes; espaço SIM (mesmo local + horário)', () => {
    const evento = prop({ natureza: 'evento', data_inicio: '2027-06-12', hora_inicio: '19:00', hora_fim: '22:00', local_id: 'templo' });
    const projeto = prop({ natureza: 'projeto', data_inicio: '2027-06-12', hora_inicio: '20:00', hora_fim: '23:00', local_id: 'templo' });
    const conflitos = detectarConflitos([evento, projeto], LOCAIS);
    expect(conflitos.map((c: any) => c.tipo)).toEqual(['espaco']);
    expect(conflitos[0].firme).toBe(true);
  });

  it('mesma data e local mas SEM horário → nenhum conflito de espaço (bug do protótipo corrigido)', () => {
    const a = prop({ data_inicio: '2027-06-12', hora_inicio: '19:00', hora_fim: null, local_id: 'templo' });
    const b = prop({ data_inicio: '2027-06-12', hora_inicio: '19:30', hora_fim: '21:00', local_id: 'templo', natureza: 'projeto' });
    expect(detectarConflitos([a, b], LOCAIS)).toHaveLength(0);
  });

  it("'Fora da igreja' nunca gera conflito de espaço", () => {
    const a = prop({ natureza: 'evento', data_inicio: '2027-06-12', hora_inicio: '19:00', hora_fim: '22:00', local_id: 'fora' });
    const b = prop({ natureza: 'projeto', data_inicio: '2027-06-12', hora_inicio: '19:00', hora_fim: '22:00', local_id: 'fora' });
    expect(detectarConflitos([a, b], LOCAIS)).toHaveLength(0);
  });

  it('precisão mensal → concentração (não firme), que NÃO bloqueia publicação', () => {
    const a = prop({ natureza: 'evento', data_inicio: '2027-06-01', precisao_inicio: 'mes' });
    const b = prop({ natureza: 'evento', data_inicio: '2027-06-15', precisao_inicio: 'dia' });
    const conflitos = detectarConflitos([a, b], LOCAIS);
    expect(conflitos).toHaveLength(1);
    expect(conflitos[0].firme).toBe(false);
  });

  it('duas rotinas: mesmo local + dia da semana + horário sobreposto → espaço E agenda; aceitar um remove só ele', () => {
    const r1 = prop({ natureza: 'rotina', dia_semana: 3, recorrencia: 'semanal', data_inicio: '2027-02-01', precisao_inicio: 'mes', multi_dia: true, data_fim: '2027-11-30', precisao_fim: 'mes', hora_inicio: '19:30', hora_fim: '21:00', local_id: 'sala1', estado: 'aprovada' });
    const r2 = prop({ natureza: 'rotina', dia_semana: 3, recorrencia: 'semanal', data_inicio: '2027-03-01', precisao_inicio: 'mes', multi_dia: true, data_fim: '2027-12-01', precisao_fim: 'mes', hora_inicio: '20:00', hora_fim: '21:30', local_id: 'sala1', estado: 'aprovada' });
    const conflitos = detectarConflitos([r1, r2], LOCAIS);
    expect(conflitos.map((c: any) => c.tipo).sort()).toEqual(['agenda', 'espaco']);
    expect(conflitos.every((c: any) => c.firme)).toBe(true);

    const [pa, pb] = [r1.id, r2.id].sort();
    const aceites = [{ proposta_a: pa, proposta_b: pb, tipo: 'agenda', justificativa: 'Coincidência desejada' }];
    const marcados = aplicarAceites(conflitos, aceites);
    expect(marcados.find((c: any) => c.tipo === 'agenda').aceite).toBeTruthy();
    expect(marcados.find((c: any) => c.tipo === 'espaco').aceite).toBeNull();

    const travas = validarTravas({
      propostas: [r1, r2],
      avaliacoesPorProposta: { [r1.id]: quatroAvaliacoes(4), [r2.id]: quatroAvaliacoes(4) },
      decisoesPorProposta: { [r1.id]: [decisao()], [r2.id]: [decisao()] },
      quorum: QUORUM,
      locaisById: LOCAIS,
      aceites,
    });
    expect(travas.motivos).toContain('1 conflito(s) confirmado(s) e não aceito(s) no calendário');
  });



  it('evento de vários dias colide com outro que cai no meio da faixa', () => {
    const a = prop({ natureza: 'evento', data_inicio: '2027-05-10', multi_dia: true, data_fim: '2027-05-15', precisao_inicio: 'dia', precisao_fim: 'dia', hora_inicio: '09:00', hora_fim: '18:00', local_id: 'templo' });
    const b = prop({ natureza: 'evento', data_inicio: '2027-05-12', hora_inicio: '10:00', hora_fim: '11:00', local_id: 'templo' });
    const conflitos = detectarConflitos([a, b], LOCAIS);
    expect(conflitos.map((c: any) => c.tipo).sort()).toEqual(['agenda', 'espaco']);
    expect(conflitos.every((c: any) => c.firme)).toBe(true);
  });

  it('duas faixas multi-dia que só se tocam (sem sobrepor) não colidem', () => {
    const a = prop({ natureza: 'evento', data_inicio: '2027-05-01', multi_dia: true, data_fim: '2027-05-10', precisao_inicio: 'dia', precisao_fim: 'dia', hora_inicio: '09:00', hora_fim: '18:00', local_id: 'templo' });
    const b = prop({ natureza: 'evento', data_inicio: '2027-05-11', multi_dia: true, data_fim: '2027-05-20', precisao_inicio: 'dia', precisao_fim: 'dia', hora_inicio: '09:00', hora_fim: '18:00', local_id: 'templo' });
    expect(detectarConflitos([a, b], LOCAIS)).toHaveLength(0);
  });





  it('rotina × evento único: colide quando o evento cai no dia da semana da rotina', () => {

    const rotina = prop({ natureza: 'rotina', dia_semana: 3, recorrencia: 'semanal', data_inicio: '2027-01-01', precisao_inicio: 'mes', multi_dia: true, data_fim: '2027-12-01', precisao_fim: 'mes', hora_inicio: '19:00', hora_fim: '21:00', local_id: 'sala1', estado: 'aprovada' });
    const evento = prop({ natureza: 'evento', data_inicio: '2027-05-12', precisao_inicio: 'dia', hora_inicio: '19:30', hora_fim: '20:30', local_id: 'sala1', estado: 'aprovada' });
    const conflitos = detectarConflitos([rotina, evento], LOCAIS);
    expect(conflitos.map((c: any) => c.tipo)).toEqual(['espaco']);
    expect(conflitos[0].firme).toBe(true);
  });

  it('rotina × evento único: NÃO colide se o evento cai num dia da semana diferente', () => {

    const rotina = prop({ natureza: 'rotina', dia_semana: 3, recorrencia: 'semanal', data_inicio: '2027-01-01', precisao_inicio: 'mes', multi_dia: true, data_fim: '2027-12-01', precisao_fim: 'mes', hora_inicio: '19:00', hora_fim: '21:00', local_id: 'sala1', estado: 'aprovada' });
    const evento = prop({ natureza: 'evento', data_inicio: '2027-05-10', precisao_inicio: 'dia', hora_inicio: '19:30', hora_fim: '20:30', local_id: 'sala1', estado: 'aprovada' });
    expect(detectarConflitos([rotina, evento], LOCAIS)).toHaveLength(0);
  });

  it('rotina × evento com precisão mensal: concentração (não firme), fora do mês da rotina não colide', () => {
    const rotina = prop({ natureza: 'rotina', dia_semana: 3, recorrencia: 'semanal', data_inicio: '2027-01-01', precisao_inicio: 'mes', multi_dia: true, data_fim: '2027-06-01', precisao_fim: 'mes', hora_inicio: '19:00', hora_fim: '21:00', local_id: 'sala1', estado: 'aprovada' });
    const dentro = prop({ natureza: 'evento', data_inicio: '2027-04-01', precisao_inicio: 'mes', hora_inicio: '19:30', hora_fim: '20:30', local_id: 'sala1', estado: 'aprovada' });
    const conflitos = detectarConflitos([rotina, dentro], LOCAIS);
    expect(conflitos.map((c: any) => c.tipo)).toEqual(['espaco']);
    expect(conflitos[0].firme).toBe(false);

    const fora = prop({ natureza: 'evento', data_inicio: '2027-09-01', precisao_inicio: 'mes', hora_inicio: '19:30', hora_fim: '20:30', local_id: 'sala1', estado: 'aprovada' });
    expect(detectarConflitos([rotina, fora], LOCAIS)).toHaveLength(0);
  });
});


describe('travas de publicação (teste 7 do spec)', () => {
  const base = () => ({
    avaliacoesPorProposta: {} as Record<string, unknown[]>,
    decisoesPorProposta: {} as Record<string, unknown[]>,
    quorum: QUORUM,
    locaisById: LOCAIS,
    aceites: [] as unknown[],
  });

  it('trava 1 · proposta sem quórum', () => {
    const p = prop();
    const t = validarTravas({ ...base(), propostas: [p], avaliacoesPorProposta: { [p.id]: [aval('criativo', 4)] } });
    expect(t.bloqueada).toBe(true);
    expect(t.motivos).toEqual(['1 proposta(s) sem quórum de avaliação']);
  });

  it('trava 2 · proposta sem decisão', () => {
    const p = prop();
    const t = validarTravas({ ...base(), propostas: [p], avaliacoesPorProposta: { [p.id]: quatroAvaliacoes(4) } });
    expect(t.motivos).toEqual(['1 proposta(s) sem decisão']);
  });

  it('trava 3 · retificação em andamento (reprovada aguardando OU retificada aguardando o Pastor)', () => {
    const rep = prop({ estado: 'reprovada' });
    const ret = prop({ estado: 'retificada' });
    const t = validarTravas({ ...base(), propostas: [rep, ret] });
    expect(t.motivos).toEqual(['2 retificação(ões) em andamento']);
  });



  it('ressalva não verificada NÃO bloqueia a publicação (só aparece em detalhe.ressalva)', () => {
    const p = prop({ estado: 'aprovada_ressalvas' });
    const t = validarTravas({
      ...base(),
      propostas: [p],
      decisoesPorProposta: { [p.id]: [decisao({ decisao: 'aprovada_ressalvas', ressalva_texto: 'x' })] },
    });
    expect(t.motivos).toEqual([]);
    expect(t.bloqueada).toBe(false);
    expect(t.detalhe.ressalva).toHaveLength(1);
  });

  it('trava 5 · conflito firme não aceito', () => {
    const a = prop({ estado: 'aprovada', natureza: 'evento', data_inicio: '2027-06-12' });
    const b = prop({ estado: 'aprovada', natureza: 'evento', data_inicio: '2027-06-12' });
    const t = validarTravas({
      ...base(),
      propostas: [a, b],
      decisoesPorProposta: { [a.id]: [decisao()], [b.id]: [decisao()] },
    });
    expect(t.motivos).toEqual(['1 conflito(s) confirmado(s) e não aceito(s) no calendário']);
  });

  it('nenhuma trava → publicação liberada (concentração mensal não bloqueia)', () => {
    const a = prop({ estado: 'aprovada', natureza: 'evento', data_inicio: '2027-06-01', precisao_inicio: 'mes' });
    const b = prop({ estado: 'aprovada', natureza: 'evento', data_inicio: '2027-06-15', precisao_inicio: 'dia' });
    const t = validarTravas({
      ...base(),
      propostas: [a, b],
      decisoesPorProposta: { [a.id]: [decisao()], [b.id]: [decisao()] },
    });
    expect(t.bloqueada).toBe(false);
    expect(t.motivos).toEqual([]);
  });
});


describe('retificação (teste 8 do spec)', () => {
  it('diff campo a campo entre versão anterior e atual', () => {
    const anterior = { data_inicio: '2027-07-10', precisao_inicio: 'dia', data_fim: '2027-07-12', precisao_fim: 'dia', custo: 96000, arrecadacao_prevista: 52000, local_id: 'fora', descricao: 'Acampamento' };
    const atual = prop({ data_inicio: '2027-07-17', precisao_inicio: 'dia', data_fim: '2027-07-19', precisao_fim: 'dia', custo: 78000, arrecadacao_prevista: 52000, local_id: 'fora', descricao: 'Acampamento', versao: 2, versao_anterior: anterior });
    const diff = diffRetificacao(anterior, atual);
    expect(diff.map((d: any) => d.campo).sort()).toEqual(['custo', 'data_fim', 'data_inicio']);
    expect(diff.find((d: any) => d.campo === 'custo')).toEqual({ campo: 'custo', antes: 96000, depois: 78000 });
  });

  it('segunda rodada de retificação é impossível (versão 2 já usada)', () => {
    const p = prop({ estado: 'reprovada', versao: 2 });
    expect(validarRetificacao(p, '2027-01-10')).toContain('A rodada única de retificação já foi usada.');
  });

  it('retificação dentro do prazo em proposta reprovada versão 1 passa', () => {
    const p = prop({ estado: 'reprovada', versao: 1, retificacao_prazo: '2027-01-15' });
    expect(validarRetificacao(p, '2027-01-14')).toEqual([]);
  });

  it('prazo expirado bloqueia', () => {
    const p = prop({ estado: 'reprovada', versao: 1, retificacao_prazo: '2027-01-15' });
    expect(validarRetificacao(p, '2027-01-16')).toContain('O prazo de retificação expirou.');
  });

  it('reabrir pros diretores é transição legal a partir de retificada (apaga notas = soft-delete nas rotas)', () => {
    expect(podeTransicionar('retificada', 'enviada')).toBe(true);
    expect(podeTransicionar('arquivada', 'enviada')).toBe(false);
  });
});


describe('visibilidade por papel (teste 9 do spec)', () => {
  const p = prop({ estado: 'reprovada' });
  const decisoes = [decisao({ decisao: 'reprovada', exigencia_texto: 'Refazer o orçamento', exigencia_prazo: '2027-02-01' })];
  const apontamentos = [{ id: 'ap1', campo: 'custo', texto: 'Separar alimentação de estrutura', deleted_at: null }];
  const avaliacoes = quatroAvaliacoes([4, 4, 4, 4, 4, 2, 3]);

  it('proponente vê exigência e apontamentos · NUNCA notas nem fundamentação', () => {
    const proj = projetarProposta({ proposta: p, avaliacoes, decisoes, apontamentos, quorum: QUORUM, papel: 'proponente' });
    expect(proj.exigencia?.texto).toBe('Refazer o orçamento');
    expect(proj.apontamentos).toHaveLength(1);
    expect(proj.avaliacoes).toBeNull();
    expect(proj.medias).toBeNull();
  });

  it('avaliador NÃO vê exigência/ressalva/apontamentos (só do proponente e do Pastor)', () => {
    const proj = projetarProposta({ proposta: p, avaliacoes, decisoes, apontamentos, quorum: QUORUM, papel: 'avaliador', minhaDiretoria: 'criativo' });
    expect(proj.exigencia).toBeNull();
    expect(proj.ressalva).toBeNull();
    expect(proj.apontamentos).toBeNull();
    expect(proj.avaliacoes).toHaveLength(4);
  });

  it('pastor vê tudo (é o autor das devolutivas)', () => {
    const proj = projetarProposta({ proposta: p, avaliacoes, decisoes, apontamentos, quorum: QUORUM, papel: 'pastor' });
    expect(proj.exigencia?.texto).toBe('Refazer o orçamento');
    expect(proj.apontamentos).toHaveLength(1);
    expect(proj.avaliacoes).toHaveLength(4);
  });

  it('observador não recebe devolutivas nem notas', () => {
    const proj = projetarProposta({ proposta: p, avaliacoes, decisoes, apontamentos, quorum: QUORUM, papel: 'observador' });
    expect(proj.exigencia).toBeNull();
    expect(proj.apontamentos).toBeNull();
    expect(proj.avaliacoes).toBeNull();
  });

  it('apontamento removido pelo Pastor (soft-delete) some da devolutiva', () => {
    const proj = projetarProposta({ proposta: p, avaliacoes, decisoes, apontamentos: [{ ...apontamentos[0], deleted_at: '2027-01-01T00:00:00Z' }], quorum: QUORUM, papel: 'proponente' });
    expect(proj.apontamentos).toHaveLength(0);
  });
});


describe('orçamento derivado (teste 10 do spec)', () => {
  it('caixa livre = (dízimos + outras) − (folha + operacionais + provisões), mês a mês', () => {
    const valores = [
      { linha: 'dizimos_ofertas', mes: 1, valor: 345000 },
      { linha: 'outras_receitas', mes: 1, valor: 20000 },
      { linha: 'folha', mes: 1, valor: 95000 },
      { linha: 'despesas_operacionais', mes: 1, valor: 55000 },
      { linha: 'provisoes', mes: 1, valor: 15000 },
      { linha: 'dizimos_ofertas', mes: 12, valor: 360000 },
      { linha: 'folha', mes: 12, valor: 190000 },
    ];
    const caixa = caixaLivreMensal(valores);
    expect(caixa[0]).toBe(200000);
    expect(caixa[11]).toBe(170000);
    expect(caixa[5]).toBe(0);
  });

  it('rateio uniforme soma EXATAMENTE o líquido (dízima periódica não vaza centavo)', () => {
    const p = prop({ custo: 1000, multi_dia: true, data_inicio: '2027-03-01', precisao_inicio: 'mes', data_fim: '2027-05-31', precisao_fim: 'mes' });
    const rateio = rateioMensal(p);
    expect(rateio[2] + rateio[3] + rateio[4]).toBeCloseTo(1000, 10);
    expect(rateio.reduce((s: number, v: number) => s + v, 0)).toBeCloseTo(1000, 10);
    expect(rateio[0]).toBe(0);
  });

  it('líquido desconta arrecadação; custeio derivado classifica certo', () => {
    const parcial = prop({ custo: 1000, tem_arrecadacao: true, arrecadacao_prevista: 400 });
    expect(liquido(parcial)).toBe(600);
    expect(modeloCusteio(parcial).tipo).toBe('parcial');
    expect(modeloCusteio(prop({ custo: 500, tem_arrecadacao: false })).tipo).toBe('integral');
    expect(modeloCusteio(prop({ custo: 500, tem_arrecadacao: true, arrecadacao_prevista: 500 })).tipo).toBe('autossustentado');
    expect(modeloCusteio(prop({ custo: 500, tem_arrecadacao: true, arrecadacao_prevista: 900 })).tipo).toBe('autossustentado');
  });

  it('dado inconsistente (fim antes do início) degrada pra zero · sem NaN (bug do protótipo)', () => {
    const p = prop({ multi_dia: true, data_inicio: '2027-11-01', data_fim: '2027-03-01' });
    expect(mesesOcupados(p)).toEqual([]);
    expect(rateioMensal(p).every((v: number) => v === 0)).toBe(true);
  });
});


describe('janela de submissão (teste 11 do spec)', () => {

  const propCompleta = (o: Record<string, unknown> = {}) => prop({
    pertencimento: 'Cultura de acolhimento da CBRio.',
    visao_explique: 'Contribui para 5 anos, 5 igrejas, 50 mil vidas.',
    impacto: 'Cativa quem vem pelo que a CBRio é.',
    valores: [{ nome: 'Servir em comunidade', justificativa: 'Escala de voluntários da comunidade.' }],
    ...o,
  });

  it('envio com janela fechada é rejeitado na regra (não só na tela)', () => {
    const erros = validarEnvio(propCompleta(), { submissao_aberta: false });
    expect(erros.join(' ')).toContain('janela de submissão está fechada');
  });

  it('janela aberta + proposta completa passa; valor marcado sem justificativa reprova', () => {
    expect(validarEnvio(propCompleta(), { submissao_aberta: true })).toEqual([]);
    const semJust = propCompleta({ valores: [{ nome: 'Servir em comunidade', justificativa: '' }] });
    expect(validarEnvio(semJust, { submissao_aberta: true }).join(' ')).toContain('Justificativa é obrigatória');
  });

  it('seção 2 é obrigatória por inteiro — cada campo vazio reprova o envio', () => {
    const casos: Array<[string, Record<string, unknown>, string]> = [
      ['pertencimento', { pertencimento: '' }, 'Pertencimento é obrigatório'],
      ['visão', { visao_explique: '   ' }, 'Visão CBRio é obrigatória'],
      ['impacto', { impacto: null }, 'Impacto é obrigatório'],
      ['alcance', { alcance_pct: null }, 'Alcance estimado é obrigatório'],
      ['custo', { custo: null }, 'Custo total é obrigatório'],
      ['valores', { valores: [] }, 'Marque ao menos um dos cinco valores'],
      ['arrecadação', { tem_arrecadacao: true, arrecadacao_prevista: 0 }, 'Informe o valor previsto de arrecadação'],
    ];
    for (const [campo, patch, esperado] of casos) {
      const erros = validarEnvio(propCompleta(patch), { submissao_aberta: true });
      expect(erros.join(' '), `campo ${campo}`).toContain(esperado);
    }
  });

  it('custo zero é válido (rotina sem custo) · arrecadação informada passa', () => {
    expect(validarEnvio(propCompleta({ custo: 0 }), { submissao_aberta: true })).toEqual([]);
    expect(validarEnvio(propCompleta({ tem_arrecadacao: true, arrecadacao_prevista: 500 }), { submissao_aberta: true })).toEqual([]);
  });

  it('o label do primeiro campo é "Nome da proposta"', () => {
    expect(validarEnvio(propCompleta({ nome: '' }), { submissao_aberta: true }).join(' '))
      .toContain('Nome da proposta é obrigatório');
  });



  it('data de início fora do ano do ciclo reprova o envio', () => {
    const erros = validarEnvio(propCompleta({ data_inicio: '2027-03-10' }), { submissao_aberta: true, ano: 2028 });
    expect(erros.join(' ')).toContain('deve ser em 2028');
  });

  it('data de início no ano do ciclo passa', () => {
    expect(validarEnvio(propCompleta({ data_inicio: '2028-03-10' }), { submissao_aberta: true, ano: 2028 })).toEqual([]);
  });

  it('sem ano no ciclo (uso legado/testes antigos) não quebra a validação', () => {
    expect(validarEnvio(propCompleta(), { submissao_aberta: true })).toEqual([]);
  });

  it('data de fim pode virar o ano (evento de Réveillon) — só a de início é travada', () => {
    const p = propCompleta({ data_inicio: '2027-12-30', multi_dia: true, data_fim: '2028-01-01' });
    expect(validarEnvio(p, { submissao_aberta: true, ano: 2027 })).toEqual([]);
  });



  it('data de encerramento antes da de início reprova com mensagem clara', () => {
    const p = propCompleta({ data_inicio: '2027-03-15', multi_dia: true, data_fim: '2027-03-01' });
    expect(validarEnvio(p, { submissao_aberta: true, ano: 2027 }).join(' '))
      .toContain('data de encerramento não pode ser antes da data de início');
  });

  it('data de encerramento no último dia do mesmo mês do início passa', () => {
    const p = propCompleta({ data_inicio: '2027-03-15', multi_dia: true, data_fim: '2027-03-31' });
    expect(validarEnvio(p, { submissao_aberta: true, ano: 2027 })).toEqual([]);
  });







  it('validarCamposObrigatorios reprova local_id/data_inicio nulos, sem exigir janela aberta', () => {
    const patched = propCompleta({ local_id: null, data_inicio: null });
    const erros = validarCamposObrigatorios(patched, { ano: 2027 });
    expect(erros.join(' ')).toContain('Local é obrigatório');
    expect(erros.join(' ')).toContain('Mês de início é obrigatório');
    expect(erros.join(' ')).not.toContain('janela de submissão');
  });

  it('validarCamposObrigatorios passa com a proposta completa (mesmo com a janela fechada)', () => {
    expect(validarCamposObrigatorios(propCompleta(), { ano: 2027 })).toEqual([]);
  });

  it('as 7 notas são obrigatórias, inteiras, de 1 a 5', () => {
    const completas: Record<string, number> = {};
    CHAVES.forEach((c: string) => { completas['nota_' + c] = 3; });
    expect(validarAvaliacao(completas)).toEqual([]);
    expect(validarAvaliacao({ ...completas, nota_custo: 6 }).join(' ')).toContain('Custo');
    const { nota_visao, ...faltando } = completas;
    expect(validarAvaliacao(faltando).join(' ')).toContain('Visão CBRio');
  });
});


describe('prazos de 5 dias (teste 12 do spec)', () => {
  it('soma dias corridos atravessando mês e ano sem shift de fuso', () => {
    expect(somarDias('2026-08-12', 5)).toBe('2026-08-17');
    expect(somarDias('2026-08-29', 5)).toBe('2026-09-03');
    expect(somarDias('2026-12-30', 5)).toBe('2027-01-04');
    expect(somarDias('2028-02-27', 5)).toBe('2028-03-03');
  });
});


describe('estados derivados e decisão vigente', () => {
  it('enviada deriva em_avaliacao/ranqueada pela contagem × quórum', () => {
    const p = prop();
    expect(estadoDerivado(p, 2, QUORUM)).toBe('em_avaliacao');
    expect(estadoDerivado(p, 4, QUORUM)).toBe('ranqueada');
    expect(estadoDerivado(prop({ estado: 'aprovada' }), 4, QUORUM)).toBe('aprovada');
  });

  it('decisão vigente = maior rodada não-revogada', () => {
    const d1 = decisao({ rodada: 1, decisao: 'reprovada', exigencia_texto: 'x' });
    const d2 = decisao({ rodada: 2, decisao: 'aprovada' });
    expect(decisaoVigente([d1, d2]).rodada).toBe(2);
    expect(decisaoVigente([d1, { ...d2, revogada_em: '2027-01-01T00:00:00Z' }]).rodada).toBe(1);
    expect(decisaoVigente([])).toBeNull();
  });

  it('horários sem os 4 campos nunca sobrepõem (proteção contra o bug do protótipo)', () => {
    expect(horariosSobrepoem({ hora_inicio: '19:00', hora_fim: null }, { hora_inicio: '19:30', hora_fim: '21:00' })).toBe(false);
    expect(horariosSobrepoem({ hora_inicio: '19:00', hora_fim: '20:00' }, { hora_inicio: '20:00', hora_fim: '21:00' })).toBe(false);
    expect(horariosSobrepoem({ hora_inicio: '19:00', hora_fim: '20:30' }, { hora_inicio: '20:00', hora_fim: '21:00' })).toBe(true);
  });
});


describe('valorEfetivoProposta · apontado vence o original quando presente', () => {
  const {
    valorEfetivoProposta, custoAnualizado, distribuirCustoPorMes,
    custoMensalTodasPropostas, custoMensalAprovadas, MULTIPLICADOR_RECORRENCIA,
  } = PA as any;

  it('sem apontamento nenhum, devolve os valores originais', () => {
    const p = prop({ custo: 1000, recorrencia: 'mensal', dia_semana: 2, data_inicio: '2027-05-01', precisao_inicio: 'mes' });
    expect(valorEfetivoProposta(p)).toEqual({
      custo: 1000, recorrencia: 'mensal', diaSemana: 2, dataInicio: '2027-05-01', precisaoInicio: 'mes',
    });
  });

  it('apontamento presente vence o original, campo a campo', () => {
    const p = prop({
      custo: 1000, recorrencia: 'unica', data_inicio: '2027-05-01', precisao_inicio: 'dia',
      custo_apontado: 500, recorrencia_apontada: 'mensal', dia_semana_apontado: 3,
      data_inicio_apontada: '2027-06-01', precisao_inicio_apontada: 'mes',
    });
    expect(valorEfetivoProposta(p)).toEqual({
      custo: 500, recorrencia: 'mensal', diaSemana: 3, dataInicio: '2027-06-01', precisaoInicio: 'mes',
    });
  });

  it('custoAnualizado aplica o multiplicador certo por recorrência', () => {
    expect(custoAnualizado(100, 'unica')).toBe(100);
    expect(custoAnualizado(100, 'diaria')).toBe(36500);
    expect(custoAnualizado(100, 'semanal')).toBe(5200);
    expect(custoAnualizado(100, 'mensal')).toBe(1200);
    expect(custoAnualizado(100, 'trimestral')).toBe(400);
    expect(custoAnualizado(100, 'semestral')).toBe(200);
    expect(custoAnualizado(100, 'personalizada')).toBe(100);
    expect(MULTIPLICADOR_RECORRENCIA.mensal).toBe(12);
  });

  it('distribuirCustoPorMes: única distribui nos meses ocupados (via rateioMensal)', () => {
    const p = prop({ custo: 1200, recorrencia: 'unica', data_inicio: '2027-03-10', precisao_inicio: 'dia', multi_dia: false });
    const porMes = distribuirCustoPorMes(p, { usarApontamento: false });
    expect(porMes[2]).toBe(1200);
    expect(porMes.reduce((s: number, v: number) => s + v, 0)).toBe(1200);
  });

  it('distribuirCustoPorMes: recorrente distribui o anualizado / 12 em todos os meses', () => {
    const p = prop({ custo: 120, recorrencia: 'mensal' });
    const porMes = distribuirCustoPorMes(p, { usarApontamento: false });
    porMes.forEach((v: number) => expect(v).toBe(120));
  });

  it('usarApontamento:false NUNCA usa o valor apontado (linha imutável)', () => {
    const p = prop({ custo: 100, recorrencia: 'unica', data_inicio: '2027-04-05', precisao_inicio: 'dia', custo_apontado: 999999 });
    const porMes = distribuirCustoPorMes(p, { usarApontamento: false });
    expect(porMes.reduce((s: number, v: number) => s + v, 0)).toBe(100);
  });

  it('usarApontamento:true usa o valor apontado quando presente', () => {
    const p = prop({ custo: 100, recorrencia: 'unica', data_inicio: '2027-04-05', precisao_inicio: 'dia', custo_apontado: 500 });
    const porMes = distribuirCustoPorMes(p, { usarApontamento: true });
    expect(porMes.reduce((s: number, v: number) => s + v, 0)).toBe(500);
  });

  it('custoMensalTodasPropostas inclui tudo exceto rascunho/arquivada, sempre sem apontamento', () => {
    const p1 = prop({ estado: 'enviada', custo: 100, recorrencia: 'unica', data_inicio: '2027-01-15', precisao_inicio: 'dia' });
    const p2 = prop({ estado: 'rascunho', custo: 999, recorrencia: 'unica', data_inicio: '2027-01-15', precisao_inicio: 'dia' });
    const p3 = prop({ estado: 'arquivada', custo: 999, recorrencia: 'unica', data_inicio: '2027-01-15', precisao_inicio: 'dia' });
    const p4 = prop({ estado: 'reprovada', custo: 50, recorrencia: 'unica', data_inicio: '2027-01-15', precisao_inicio: 'dia' });
    const total = custoMensalTodasPropostas([p1, p2, p3, p4]);
    expect(total[0]).toBe(150);
  });

  it('custoMensalAprovadas soma só aprovada/aprovada_ressalvas, usando apontamento', () => {
    const p1 = prop({ estado: 'aprovada', custo: 100, custo_apontado: 200, recorrencia: 'unica', data_inicio: '2027-02-10', precisao_inicio: 'dia' });
    const p2 = prop({ estado: 'aprovada_ressalvas', custo: 50, recorrencia: 'unica', data_inicio: '2027-02-10', precisao_inicio: 'dia' });
    const p3 = prop({ estado: 'enviada', custo: 999, recorrencia: 'unica', data_inicio: '2027-02-10', precisao_inicio: 'dia' });
    const total = custoMensalAprovadas([p1, p2, p3]);
    expect(total[1]).toBe(250);
  });



  it('apontamento de data numa proposta multi-dia preserva a duração (não zera)', () => {

    const p = prop({
      custo: 600, recorrencia: 'unica', multi_dia: true,
      data_inicio: '2027-03-10', precisao_inicio: 'dia',
      data_fim: '2027-04-10', precisao_fim: 'dia',
      data_inicio_apontada: '2027-06-15',
    });
    const semApontamento = distribuirCustoPorMes(p, { usarApontamento: false });
    expect(semApontamento.reduce((s: number, v: number) => s + v, 0)).toBe(600);

    const comApontamento = distribuirCustoPorMes(p, { usarApontamento: true });
    const total = comApontamento.reduce((s: number, v: number) => s + v, 0);
    expect(total).toBe(600);
    expect(comApontamento[5]).toBeGreaterThan(0);
    expect(comApontamento[6]).toBeGreaterThan(0);
    expect(comApontamento[2]).toBe(0);
  });

  it('apontamento de data que estouraria dezembro comprime a janela, sem zerar o total', () => {
    const p = prop({
      custo: 300, recorrencia: 'unica', multi_dia: true,
      data_inicio: '2027-10-01', precisao_inicio: 'mes',
      data_fim: '2027-12-01', precisao_fim: 'mes',
      data_inicio_apontada: '2027-11-01',
    });
    const porMes = distribuirCustoPorMes(p, { usarApontamento: true });
    const total = porMes.reduce((s: number, v: number) => s + v, 0);
    expect(total).toBe(300);
    expect(porMes[10]).toBe(150);
    expect(porMes[11]).toBe(150);
  });



  it('recorrente autossustentada (arrecadação >= custo) usa o líquido, não o bruto', () => {
    const p = prop({
      custo: 100, recorrencia: 'mensal',
      tem_arrecadacao: true, arrecadacao_prevista: 100,
    });
    const porMes = distribuirCustoPorMes(p, { usarApontamento: false });
    porMes.forEach((v: number) => expect(v).toBe(0));
  });

  it('recorrente parcialmente custeada desconta a arrecadação anualizada', () => {
    const p = prop({
      custo: 100, recorrencia: 'mensal',
      tem_arrecadacao: true, arrecadacao_prevista: 40,
    });
    const porMes = distribuirCustoPorMes(p, { usarApontamento: false });
    porMes.forEach((v: number) => expect(v).toBe(60));
  });
});

describe('projetarProposta · papel pastor sempre recebe avaliações (mesmo parciais)', () => {
  const p = prop();
  it('pastor recebe avaliações parciais (quórum incompleto)', () => {
    const avs = [aval('ministerial', 4)];
    const r = projetarProposta({ proposta: p, avaliacoes: avs, decisoes: [], apontamentos: [], quorum: QUORUM, papel: 'pastor' });
    expect(r.avaliacoes).toHaveLength(1);
    expect(r.medias).not.toBeNull();
  });

  it('avaliador continua cego até o quórum completo (não regride)', () => {
    const avs = [aval('ministerial', 4)];
    const r = projetarProposta({ proposta: p, avaliacoes: avs, decisoes: [], apontamentos: [], quorum: QUORUM, papel: 'avaliador', minhaDiretoria: 'ministerial' });
    expect(r.avaliacoes).toBeNull();
    expect(r.minha_avaliacao).not.toBeNull();
  });
});


describe('projetarProposta · quem propôs nunca vê fundamentação, mesmo acumulando papel', () => {
  const p = prop({ estado: 'reprovada' });
  const decisoes = [decisao({ decisao: 'reprovada', exigencia_texto: 'Refazer o orçamento', exigencia_prazo: '2027-02-01' })];
  const apontamentos = [{ id: 'ap1', campo: 'custo', texto: 'Separar alimentação de estrutura', deleted_at: null }];
  const avaliacoes = quatroAvaliacoes([4, 4, 4, 4, 4, 2, 3]);

  it('diretor que também é o proponente: sem notas/fundamentação, com exigência/apontamentos', () => {
    const proj = projetarProposta({
      proposta: p, avaliacoes, decisoes, apontamentos, quorum: QUORUM,
      papel: 'avaliador', minhaDiretoria: 'criativo', souProponente: true,
    });
    expect(proj.avaliacoes).toBeNull();
    expect(proj.medias).toBeNull();
    expect(proj.soma).toBeNull();
    expect(proj.exigencia?.texto).toBe('Refazer o orçamento');
    expect(proj.apontamentos).toHaveLength(1);
  });

  it('Pastor que também é o proponente: sem notas/fundamentação da própria proposta', () => {
    const proj = projetarProposta({
      proposta: p, avaliacoes, decisoes, apontamentos, quorum: QUORUM,
      papel: 'pastor', souProponente: true,
    });
    expect(proj.avaliacoes).toBeNull();
    expect(proj.medias).toBeNull();
    expect(proj.exigencia?.texto).toBe('Refazer o orçamento');
  });

  it('sem souProponente, comportamento por papel continua igual (não regride)', () => {
    const proj = projetarProposta({
      proposta: p, avaliacoes, decisoes, apontamentos, quorum: QUORUM,
      papel: 'avaliador', minhaDiretoria: 'criativo',
    });
    expect(proj.avaliacoes).toHaveLength(4);
  });
});


describe('valoresMaterializacao · o que o Projeto/Evento recebe', () => {
  it('usa o custo e a data apontados pelo Pastor, não os originais', () => {
    const p = prop({ custo: 8000, custo_apontado: 5000, data_inicio: '2027-03-10', data_inicio_apontada: '2027-04-15', precisao_inicio: 'dia' });
    const v = PA.valoresMaterializacao(p);
    expect(v.custoAnual).toBe(5000);
    expect(v.dataInicio).toBe('2027-04-15');
  });

  it('anualiza custo e arrecadação pela recorrência e calcula o custo para a igreja', () => {
    const p = prop({ custo: 100, recorrencia: 'mensal', tem_arrecadacao: true, arrecadacao_prevista: 40 });
    const v = PA.valoresMaterializacao(p);
    expect(v.custoAnual).toBe(1200);
    expect(v.arrecadacaoAnual).toBe(480);
    expect(v.custoIgreja).toBe(720);
  });

  it('custo para a igreja nunca fica negativo (autossustentado)', () => {
    const p = prop({ custo: 100, tem_arrecadacao: true, arrecadacao_prevista: 300 });
    expect(PA.valoresMaterializacao(p).custoIgreja).toBe(0);
  });

  it('descarta data_fim anterior ao início apontado', () => {
    const p = prop({ multi_dia: true, data_inicio: '2027-03-01', data_fim: '2027-03-31', data_inicio_apontada: '2027-06-01' });
    expect(PA.valoresMaterializacao(p).dataFim).toBeNull();
  });

  it('marca precisão de mês', () => {
    expect(PA.valoresMaterializacao(prop({ precisao_inicio: 'mes', data_inicio: '2027-03-01' })).precisaoMes).toBe(true);
    expect(PA.valoresMaterializacao(prop({ precisao_inicio: 'dia' })).precisaoMes).toBe(false);
  });
});

describe('datasOcorrencias · evento recorrente vindo de proposta', () => {
  it('semanal: ancora no dia da semana da proposta e vai até 31/12', () => {

    const datas = PA.datasOcorrencias(prop({ recorrencia: 'semanal', dia_semana: 0, data_inicio: '2027-03-10', precisao_inicio: 'dia' }));
    expect(datas[0]).toBe('2027-03-14');
    expect(datas[1]).toBe('2027-03-21');
    expect(datas[datas.length - 1] <= '2027-12-31').toBe(true);
  });

  it('mensal: repete o dia do mês e clampa no último dia de meses curtos', () => {
    const datas = PA.datasOcorrencias(prop({ recorrencia: 'mensal', data_inicio: '2027-01-31', precisao_inicio: 'dia' }));
    expect(datas.slice(0, 3)).toEqual(['2027-01-31', '2027-02-28', '2027-03-31']);
    expect(datas).toHaveLength(12);
  });

  it('trimestral respeita a data_fim da faixa', () => {
    const datas = PA.datasOcorrencias(prop({ recorrencia: 'trimestral', data_inicio: '2027-02-10', precisao_inicio: 'dia', multi_dia: true, data_fim: '2027-09-30' }));
    expect(datas).toEqual(['2027-02-10', '2027-05-10', '2027-08-10']);
  });

  it('única, precisão de mês ou recorrência sem equivalente → nenhuma ocorrência', () => {
    expect(PA.datasOcorrencias(prop({ recorrencia: 'unica', precisao_inicio: 'dia' }))).toEqual([]);
    expect(PA.datasOcorrencias(prop({ recorrencia: 'mensal', precisao_inicio: 'mes', data_inicio: '2027-03-01' }))).toEqual([]);
    expect(PA.datasOcorrencias(prop({ recorrencia: 'personalizada', precisao_inicio: 'dia' }))).toEqual([]);
  });

  it('RECORRENCIA_EVENTO só produz valores aceitos pelo CHECK de events', () => {
    const aceitos = ['unico', 'semanal', 'quinzenal', 'mensal', 'bimestral', 'trimestral', 'semestral', 'anual'];
    Object.values(PA.RECORRENCIA_EVENTO).forEach((r) => expect(aceitos).toContain(r));
  });
});


describe('gestorPode · líderes das áreas + PMO gerenciam a execução', () => {
  const p = prop({ area: 'kids', lider_id: 'u-lider', preenchido_por_id: 'u-assistente', created_by: 'u-criador' });
  const base = { pastor: false, pmo: false, areasLider: new Set<string>(), userId: 'u-qualquer' };

  it('Pastor/super-admin e PMO sempre podem', () => {
    expect(PA.gestorPode({ ...base, pastor: true }, p)).toBe(true);
    expect(PA.gestorPode({ ...base, pmo: true }, p)).toBe(true);
  });

  it('líder da proposta, quem preencheu e quem criou podem', () => {
    expect(PA.gestorPode({ ...base, userId: 'u-lider' }, p)).toBe(true);
    expect(PA.gestorPode({ ...base, userId: 'u-assistente' }, p)).toBe(true);
    expect(PA.gestorPode({ ...base, userId: 'u-criador' }, p)).toBe(true);
  });

  it('líder da área da proposta pode — de outra área não', () => {
    expect(PA.gestorPode({ ...base, areasLider: new Set(['kids']) }, p)).toBe(true);
    expect(PA.gestorPode({ ...base, areasLider: new Set(['grupos']) }, p)).toBe(false);
  });

  it('quem só tem acesso de leitura ao módulo não gerencia', () => {
    expect(PA.gestorPode(base, p)).toBe(false);
  });

  it('proposta sem área e sem dono nunca casa por engano com undefined', () => {
    const orfa = prop({ area: null, lider_id: null, preenchido_por_id: null, created_by: null });
    expect(PA.gestorPode({ ...base, userId: undefined as unknown as string, areasLider: new Set(['kids']) }, orfa)).toBe(false);
  });
});

describe('datasNoCalendario · onde a proposta aparece no calendário da Execução', () => {
  it('evento de vários dias entra em todos os dias, inclusive quando cruza o mês', () => {
    const r = PA.datasNoCalendario(prop({ natureza: 'evento', precisao_inicio: 'dia', data_inicio: '2027-05-30', multi_dia: true, data_fim: '2027-06-02', recorrencia: 'unica' }));
    expect(r.dias).toEqual(['2027-05-30', '2027-05-31', '2027-06-01', '2027-06-02']);
    expect(r.mesSemDia).toBeNull();
  });

  it('rotina semanal aparece em cada dia da semana marcado', () => {
    const r = PA.datasNoCalendario(prop({ natureza: 'rotina', recorrencia: 'semanal', dia_semana: 0, precisao_inicio: 'dia', data_inicio: '2027-03-10' }));
    expect(r.dias[0]).toBe('2027-03-14');
    expect(r.dias.length).toBeGreaterThan(20);
  });

  it('precisão só de mês vai pra "sem dia exato" do mês', () => {
    const r = PA.datasNoCalendario(prop({ precisao_inicio: 'mes', data_inicio: '2027-08-01' }));
    expect(r).toEqual({ dias: [], mesSemDia: '2027-08' });
  });

  it('data única vira um dia só', () => {
    const r = PA.datasNoCalendario(prop({ precisao_inicio: 'dia', data_inicio: '2027-04-10', multi_dia: false, recorrencia: 'unica' }));
    expect(r.dias).toEqual(['2027-04-10']);
  });
});

describe('liturgicosDoAno · Ceia, Apresentação, Batismo e Culto do Amigo', () => {
  const lit = (ano: number) => Object.fromEntries(PA.liturgicosDoAno(ano).map((l: any) => [l.id, l.calendario.dias]));

  it('Ceia no 1º, Apresentação no 2º e Batismo no 4º domingo de cada mês', () => {
    const l = lit(2027);
    expect(l['liturgico:ceia']).toHaveLength(12);
    expect(l['liturgico:ceia'][0]).toBe('2027-01-03');
    expect(l['liturgico:apresentacao'][0]).toBe('2027-01-10');
    expect(l['liturgico:batismo'][0]).toBe('2027-01-24');
  });

  it('Culto do Amigo só nos meses com 5 domingos', () => {

    expect(lit(2027)['liturgico:culto-do-amigo']).toEqual(['2027-01-31', '2027-05-30', '2027-08-29', '2027-10-31']);
  });
});

describe('rotina · fases livres de implantação', () => {
  it('sugere Preparação, Implantação e Acompanhamento como ponto de partida', () => {
    expect(PA.FASES_INICIAIS_ROTINA).toEqual(['Preparação', 'Implantação', 'Acompanhamento']);
  });
  it('nome de fase: trim, espaços colapsados, 1..80 caracteres', () => {
    expect(PA.nomeFaseRotina('  Testar   com a equipe ')).toBe('Testar com a equipe');
    expect(PA.nomeFaseRotina('   ')).toBeNull();
    expect(PA.nomeFaseRotina(null)).toBeNull();
    expect(PA.nomeFaseRotina('x'.repeat(81))).toBeNull();
  });
});

describe('cultosDoAno · cultos fixos da semana', () => {
  const c = (ano: number) => Object.fromEntries(PA.cultosDoAno(ano).map((x: any) => [x.id, x.calendario.dias]));

  it('domingo, quarta e sábado (Bridge e AMI) caem no dia da semana certo', () => {
    const r = c(2027);
    expect(r['culto:domingo'][0]).toBe('2027-01-03');
    expect(r['culto:quarta'][0]).toBe('2027-01-06');
    expect(r['culto:bridge'][0]).toBe('2027-01-02');
    expect(r['culto:ami'][0]).toBe('2027-01-02');
  });

  it('todas as semanas do ano, sem vazar pro ano seguinte', () => {
    const dias = c(2027)['culto:domingo'];
    expect(dias).toHaveLength(52);
    expect(dias.every((d: string) => d.startsWith('2027'))).toBe(true);
  });
});

describe('saudeExecucao · farol da execução', () => {
  const HOJE = '2027-03-10';
  const tarefas = (o: Record<string, number> = {}) => ({ total: 0, abertas: 0, concluidas: 0, atrasadas: 0, bloqueadas: 0, vencendo7: 0, ...o });
  const ctx = (o: Record<string, unknown> = {}) => ({ hoje: HOJE, foraDoPlano: false, temVinculo: true, tarefas: tarefas({ total: 4, abertas: 4 }), ressalva: null, publicado: null, ...o });
  const base = (o: Record<string, unknown> = {}) => prop({ natureza: 'evento', precisao_inicio: 'dia', data_inicio: '2027-08-10', recorrencia: 'unica', ...o });

  it('verde quando nada está errado', () => {
    const r = PA.saudeExecucao(base(), ctx());
    expect(r.farol).toBe('verde');
    expect(r.motivos).toEqual([]);
  });

  it('vermelho: fora do plano, tarefa bloqueada e ressalva vencida', () => {
    expect(PA.saudeExecucao(base(), ctx({ foraDoPlano: true })).farol).toBe('vermelho');
    expect(PA.saudeExecucao(base(), ctx({ tarefas: tarefas({ total: 4, abertas: 4, bloqueadas: 1 }) })).farol).toBe('vermelho');
    const r = PA.saudeExecucao(base(), ctx({ ressalva: { texto: 'x', prazo: '2027-03-01', cumprida: false } }));
    expect(r.farol).toBe('vermelho');
    expect(r.avisos.some((a: any) => a.tipo === 'ressalva')).toBe(true);
  });

  it('ressalva já verificada não pesa no farol', () => {
    const r = PA.saudeExecucao(base(), ctx({ ressalva: { texto: 'x', prazo: '2027-03-01', cumprida: true } }));
    expect(r.farol).toBe('verde');
  });

  it('atraso pequeno é amarelo; atraso de 30%+ das abertas é vermelho', () => {
    expect(PA.saudeExecucao(base(), ctx({ tarefas: tarefas({ total: 10, abertas: 10, atrasadas: 2 }) })).farol).toBe('amarelo');
    expect(PA.saudeExecucao(base(), ctx({ tarefas: tarefas({ total: 10, abertas: 10, atrasadas: 3 }) })).farol).toBe('vermelho');
  });

  it('ressalva dentro do prazo é amarela e avisa na última semana', () => {
    const r = PA.saudeExecucao(base(), ctx({ ressalva: { texto: 'x', prazo: '2027-03-15', cumprida: false } }));
    expect(r.farol).toBe('amarelo');
    expect(r.avisos.find((a: any) => a.tipo === 'ressalva')?.texto).toContain('15/03');
  });

  it('data diferente do calendário publicado vira divergência amarela', () => {
    const r = PA.saudeExecucao(base({ data_inicio: '2027-08-17' }), ctx({ publicado: { data_inicio: '2027-08-10', data_fim: null, recorrencia: 'unica', dia_semana: null } }));
    expect(r.farol).toBe('amarelo');
    expect(r.divergencias[0]).toContain('10/08');
    expect(r.divergencias[0]).toContain('17/08');
  });

  it('publicado igual ao atual não gera divergência', () => {
    expect(PA.divergenciaPublicado(base(), { data_inicio: '2027-08-10', data_fim: null, recorrencia: 'unica', dia_semana: null })).toEqual([]);
  });

  it('começa em até 30 dias sem vínculo (ou sem tarefas) é amarelo; longe, não', () => {
    const perto = base({ data_inicio: '2027-03-25' });
    expect(PA.saudeExecucao(perto, ctx({ temVinculo: false })).farol).toBe('amarelo');
    expect(PA.saudeExecucao(perto, ctx({ tarefas: tarefas() })).farol).toBe('amarelo');
    expect(PA.saudeExecucao(base({ data_inicio: '2027-09-25' }), ctx({ temVinculo: false })).farol).toBe('verde');
  });

  it('tarefas vencendo em 7 dias geram aviso, sem mudar o farol', () => {
    const r = PA.saudeExecucao(base(), ctx({ tarefas: tarefas({ total: 4, abertas: 4, vencendo7: 2 }) }));
    expect(r.farol).toBe('verde');
    expect(r.avisos[0].tipo).toBe('prazo');
  });
});

describe('calendário geral 2026 como modelo · Geracional e Encontrão', () => {
  it('5º domingo: Culto do Amigo (CBKids) e Culto Jovem (AMI) são GERACIONAL; Ceia/Apresentação/Batismo são liturgia', () => {
    const l = Object.fromEntries(PA.liturgicosDoAno(2026).map((x: any) => [x.id, x]));
    expect(l['liturgico:culto-do-amigo'].categoria).toBe('geracional');
    expect(l['liturgico:culto-jovem'].categoria).toBe('geracional');
    expect(l['liturgico:ceia'].categoria).toBe('rotina_liturgia');

    expect(l['liturgico:culto-jovem'].calendario.dias).toEqual(['2026-03-29', '2026-05-31', '2026-08-30', '2026-11-29']);
  });
});

describe('encontraoDoAno · Rotina Staff na 2ª quarta do mês', () => {
  it('cai na segunda quarta de cada mês (fev e mar de 2026 batem com o PDF; em jan o PDF tem exceção em 07/01)', () => {
    const e = PA.encontraoDoAno(2026);
    expect(e.categoria).toBe('rotina_staff');
    expect(e.calendario.dias).toHaveLength(12);
    expect(e.calendario.dias.slice(0, 3)).toEqual(['2026-01-14', '2026-02-11', '2026-03-11']);
  });

  it('sempre quarta-feira, entre o dia 8 e o 14', () => {
    for (const d of PA.encontraoDoAno(2027).calendario.dias) {
      const dia = Number(d.slice(8, 10));
      expect(new Date(`${d}T12:00:00Z`).getUTCDay()).toBe(3);
      expect(dia).toBeGreaterThanOrEqual(8);
      expect(dia).toBeLessThanOrEqual(14);
    }
  });
});

describe('remanejar datas dos itens fixos', () => {
  const enc = () => PA.encontraoDoAno(2026);

  it('ehDataISO só aceita datas reais', () => {
    expect(PA.ehDataISO('2027-02-28')).toBe(true);
    expect(PA.ehDataISO('2027-02-30')).toBe(false);
    expect(PA.ehDataISO('27-02-28')).toBe(false);
    expect(PA.ehDataISO(null)).toBe(false);
  });

  it('adiar troca só aquela ocorrência e diz de onde veio', () => {
    const [r] = PA.aplicarAjustes([enc()], [{ item_id: 'rotina_fixa:encontrao', data_original: '2026-03-11', data_nova: '2026-03-18', motivo: 'feriado' }], 2026);
    expect(r.calendario.dias).toContain('2026-03-18');
    expect(r.calendario.dias).not.toContain('2026-03-11');
    expect(r.calendario.dias).toHaveLength(12);
    expect(r.remanejadas).toEqual({ '2026-03-18': '2026-03-11' });
    expect(r.ajustes[0].motivo).toBe('feriado');
  });

  it('data_nova null = não acontece naquele mês', () => {
    const [r] = PA.aplicarAjustes([enc()], [{ item_id: 'rotina_fixa:encontrao', data_original: '2026-03-11', data_nova: null }], 2026);
    expect(r.calendario.dias).toHaveLength(11);
    expect(r.calendario.dias).not.toContain('2026-03-11');
  });

  it('ajuste de outro item não mexe neste; sem ajustes devolve a regra pura', () => {
    const [r] = PA.aplicarAjustes([enc()], [{ item_id: 'culto:quarta', data_original: '2026-03-11', data_nova: null }], 2026);
    expect(r.calendario.dias).toHaveLength(12);
    expect(r.ajustes).toEqual([]);
  });

  it('data movida pro ano seguinte sai da lista do ano (e entra na do próximo)', () => {
    const aj = [{ item_id: 'rotina_fixa:encontrao', data_original: '2026-12-09', data_nova: '2027-01-06' }];
    expect(PA.aplicarAjustes([enc()], aj, 2026)[0].calendario.dias).not.toContain('2027-01-06');
    expect(PA.aplicarAjustes([enc()], aj, 2026)[0].calendario.dias).toHaveLength(11);
    const em27 = PA.aplicarAjustes([PA.encontraoDoAno(2027)], aj, 2027)[0];
    expect(em27.calendario.dias).toContain('2027-01-06');
  });
});
