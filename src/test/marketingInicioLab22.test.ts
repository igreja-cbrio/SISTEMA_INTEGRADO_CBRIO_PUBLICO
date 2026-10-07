import { describe, it, expect } from 'vitest';
import {
  ciclosDaSemana, ciclosNaoConferidos, nomeDoCiclo, rotinasDaSemana, rotuloDias, textoCurto, nomeDeExibicao,
  avisoDaSemana, demandasSemanais, AVISO_SEM_NUMEROS, tamanhoDoNome,
} from '../pages/marketing/inicio/reguaInicio';




const texto = (partes: { t?: string; n?: number }[]) => partes.map(p => (p.n != null ? String(p.n) : p.t)).join('');

describe('ciclos · "nome - fase" desta semana', () => {
  const dash = {
    semanas: [{ idx: 0, eh_semana_atual: false }, { idx: 1, eh_semana_atual: true }],
    ciclo: {
      linhas: [
        { id: 'a', nome: 'Série: Deus no controle', dia_d: '2026-10-04', celulas: [
          { semana_idx: 0, vazio: false, numero_fase: 8, nome_fase: 'Finalizações' },
          { semana_idx: 1, vazio: false, numero_fase: 9, nome_fase: 'Alinhamentos Operacionais Finais' },
        ] },
        { id: 'b', nome: 'Série: O Mundo não vai acabar', celulas: [
          { semana_idx: 0, vazio: false, numero_fase: 11, nome_fase: 'Debrief' },
          { semana_idx: 1, vazio: true },
        ] },
        { id: 'c', nome: 'Ação de Graças', celulas: [
          { semana_idx: 1, vazio: false, numero_fase: 4, nome_fase: 'Identidade e Estratégia', transicao: { nome_fase: 'Aprovação' } },
        ] },
      ],
    },
  };

  it('pega a fase da semana ATUAL e pula o ciclo sem fase nela', () => {
    const r = ciclosDaSemana(dash);
    expect(r.map(c => `${c.nome} - ${c.fase}`)).toEqual([
      'Deus no controle - Alinhamentos Operacionais Finais',
      'Ação de Graças - Identidade e Estratégia',
    ]);
    expect(r[1].proxima).toBe('Aprovação');
  });

  it('sem semana atual no calendário (ou sem dado) devolve lista vazia', () => {
    expect(ciclosDaSemana({ semanas: [{ idx: 0, eh_semana_atual: false }], ciclo: dash.ciclo })).toEqual([]);
    expect(ciclosDaSemana(null)).toEqual([]);
  });

  it('tira o prefixo "Série:" do nome', () => {
    expect(nomeDoCiclo('Série: Pelos Olhos de Quem Vê')).toBe('Pelos Olhos de Quem Vê');
    expect(nomeDoCiclo('Serie - Parábolas')).toBe('Parábolas');
    expect(nomeDoCiclo('Ação de Graças')).toBe('Ação de Graças');
  });





  const conferido = (abertas: Record<string, number>, ...ok: unknown[]) => ({
    ...dash,
    ciclo: {
      ...dash.ciclo,
      rolando_ok: ok.length ? ok[0] : true,
      linhas: dash.ciclo.linhas.map(l => ({ ...l, mkt_abertas: abertas[l.id] })),
    },
  });

  it('com a conta do servidor, ciclo sem tarefa aberta SAI mesmo tendo fase na semana', () => {
    const r = ciclosDaSemana(conferido({ a: 0, b: 5, c: 2 }));
    expect(r.map(c => c.id)).toEqual(['c']);
    expect(r[0].abertas).toBe(2);


    expect(ciclosDaSemana(conferido({ c: 2 })).map(c => c.id)).toEqual(['c']);
  });

  it('a fase continua valendo: tarefa aberta sem fase na semana não põe o ciclo na lista', () => {

    expect(ciclosDaSemana(conferido({ a: 1, b: 5, c: 1 })).map(c => c.id)).toEqual(['a', 'c']);
  });

  it('⚠️ sem a conta (falhou ou servidor antigo) fica a régua da fase — erro nunca esconde ciclo', () => {
    for (const ok of [false, undefined, 'sim']) {
      const r = ciclosDaSemana(conferido({ a: 0, c: 0 }, ok));
      expect(r.map(c => c.id)).toEqual(['a', 'c']);
      expect(r[0].abertas).toBeNull();
    }
    expect(ciclosNaoConferidos(conferido({}, false))).toBe(true);

    expect(ciclosNaoConferidos(conferido({}, undefined))).toBe(false);
    expect(ciclosNaoConferidos(conferido({}, true))).toBe(false);
    expect(ciclosNaoConferidos(null)).toBe(false);
  });
});

describe('rotinas · dia a dia, segunda primeiro', () => {
  const linha = (tarefas: unknown[], extra = {}) => ({ semana_atual: 40, frentes: { rot: { tarefas, ...extra } } });

  it('agrupa por dia, na ordem do Pablo (segunda → domingo), só a semana atual', () => {
    const r = rotinasDaSemana(linha([
      { semana: 40, itens: [
        { dia_semana: 0, texto: 'Cobertura cultos domingo (08:30 · 10:00)' },
        { dia_semana: 1, texto: 'Atendimento redes sociais (preliminar · refinar com a equipe)' },
        { dia_semana: 3, texto: 'Gravação de vídeos' },
      ] },
      { semana: 40, itens: [{ dia_semana: 1, texto: 'Atendimento redes sociais (preliminar · refinar com a equipe)' }] },
      { semana: 41, itens: [{ dia_semana: 2, texto: 'Da semana que vem' }] },
    ]));
    expect(r!.map(d => `${d.rotulo} - ${d.textos.join(' · ')}`)).toEqual([
      'Segunda - Atendimento redes sociais',
      'Quarta - Gravação de vídeos',
      'Domingo - Cobertura cultos domingo',
    ]);
  });

  it('o mesmo compromisso em vários dias vira UMA linha', () => {
    const r = rotinasDaSemana(linha([{ semana: 40, itens: [
      ...[1, 2, 3, 4, 5, 6].map(d => ({ dia_semana: d, texto: 'Atendimento redes sociais (preliminar)' })),
      { dia_semana: 3, texto: 'Gravação de vídeos' },
      { dia_semana: 0, texto: 'Captações' },
    ] }]));
    expect(r!.map(d => `${d.rotulo} - ${d.textos[0]}`)).toEqual([
      'Segunda a Sábado - Atendimento redes sociais',
      'Quarta - Gravação de vídeos',
      'Domingo - Captações',
    ]);
  });

  it('o rótulo dos dias diz a faixa, a lista ou "todos os dias"', () => {
    expect(rotuloDias([1])).toBe('Segunda');
    expect(rotuloDias([2, 1])).toBe('Segunda e Terça');
    expect(rotuloDias([1, 3, 5])).toBe('Segunda, Quarta e Sexta');
    expect(rotuloDias([3, 4, 5, 6, 0])).toBe('Quarta a Domingo');
    expect(rotuloDias([0, 1, 2, 3, 4, 5, 6])).toBe('Todos os dias');
    expect(rotuloDias([])).toBe('');
  });

  it('no mesmo dia, o compromisso só daquele dia vem antes do que se repete', () => {
    const r = rotinasDaSemana(linha([{ semana: 40, itens: [
      { dia_semana: 1, texto: 'Todo dia útil' }, { dia_semana: 2, texto: 'Todo dia útil' }, { dia_semana: 3, texto: 'Todo dia útil' },
      { dia_semana: 1, texto: 'Reunião' },
    ] }]));
    expect(r!.map(d => d.rotulo + ' - ' + d.textos[0])).toEqual(['Segunda - Reunião', 'Segunda a Quarta - Todo dia útil']);
  });

  it('01/10: junta Institucionais e Redes — "o que cada dia tem", de qualquer área', () => {
    const r = rotinasDaSemana({
      semana_atual: 40,
      frentes: {
        rot: { tarefas: [{ semana: 40, itens: [{ dia_semana: 3, texto: 'Gravação de vídeos' }] }] },
        red: { tarefas: [{ semana: 40, itens: [{ dia_semana: 1, texto: 'Atendimento redes sociais' }] }] },
      },
    });
    expect(r!.map(d => `${d.rotulo} - ${d.textos[0]}`)).toEqual([
      'Segunda - Atendimento redes sociais',
      'Quarta - Gravação de vídeos',
    ]);
  });

  it('uma área fora do ar não apaga a outra', () => {
    const r = rotinasDaSemana({
      semana_atual: 40,
      frentes: {
        rot: { status: 'indisponivel', tarefas: [] },
        red: { tarefas: [{ semana: 40, itens: [{ dia_semana: 1, texto: 'Atendimento redes sociais' }] }] },
      },
    });
    expect(r).toHaveLength(1);
  });

  it('rotina que não carregou é null (não "nenhuma rotina")', () => {
    expect(rotinasDaSemana(linha([], { status: 'indisponivel' }))).toBeNull();
    expect(rotinasDaSemana({ semana_atual: 40, frentes: {} })).toBeNull();
    expect(rotinasDaSemana(linha([]))).toEqual([]);
  });

  it('texto curto tira só a observação do FIM, nunca o texto todo', () => {
    expect(textoCurto('Reunião de pauta (preliminar)')).toBe('Reunião de pauta');
    expect(textoCurto('(só observação)')).toBe('(só observação)');
    expect(textoCurto('Captação (08:30) no templo')).toBe('Captação (08:30) no templo');
  });
});

describe('bloco azul', () => {
  it('nome grande = primeiro e último nome', () => {
    expect(nomeDeExibicao('Pablo Henrique Pontal')).toBe('Pablo Pontal');
    expect(nomeDeExibicao('  Aline  ')).toBe('Aline');
    expect(nomeDeExibicao('')).toBe('');
    expect(nomeDeExibicao(undefined)).toBe('');
  });

  it('o tamanho do nome é relativo ao bloco e encolhe com o nome maior', () => {
    expect(tamanhoDoNome('')).toBeNull();
    expect(tamanhoDoNome(undefined)).toBeNull();
    const curto = tamanhoDoNome('Pablo Pontal')!;
    expect(curto).toMatch(/^clamp\(2\.5rem, calc\(96cqi \/ [\d.]+\), 12rem\)$/);
    const divisor = (s: string) => Number(s.match(/cqi \/ ([\d.]+)\)/)![1]);
    expect(divisor(tamanhoDoNome('Maria Eduarda Albuquerque')!)).toBeGreaterThan(divisor(curto));

    expect(tamanhoDoNome('Pablo    Pontal')).toBe(curto);

    expect(divisor(tamanhoDoNome('A')!)).toBe(1);

    expect(divisor(tamanhoDoNome('WWWWWWWW')!)).toBeGreaterThan(divisor(tamanhoDoNome('IIIIIIII')!) * 4);
    expect(tamanhoDoNome('Cauã')).toBe(tamanhoDoNome('CAUA'));
  });

  it('sem a semana da pessoa o número é null (a tela mostra "—", nunca 0)', () => {
    expect(demandasSemanais(null)).toBeNull();
    expect(demandasSemanais({})).toBeNull();
    expect(demandasSemanais({ tarefas: 0 })).toBe(0);
    expect(demandasSemanais({ tarefas: 15 })).toBe(15);
  });
});

describe('aviso · o texto do Pablo com os números da fila', () => {
  it('sem a semana da pessoa é o texto dele, sem número nenhum', () => {
    expect(texto(avisoDaSemana(null))).toBe(AVISO_SEM_NUMEROS);
  });

  it('lista só as frentes com demanda, no plural certo, e marca as atrasadas', () => {
    const r = avisoDaSemana({
      tarefas: 15, atrasadas: 3,
      por_frente: { ins: 12, sis: 1, prd: 2 }, rotina: { total: 5, feitas: 2 },
      rotina_por_frente: { rot: { total: 3, feitas: 1 }, red: { total: 2, feitas: 1 } },
    });


    expect(texto(r)).toBe(
      'Não se esqueça de checar sua fila desta semana: 14 do calendário, 1 requisição e 3 de redes (3 já atrasadas). E principalmente, tire suas dúvidas! Vamos fazer acontecer.',
    );
    expect(r.find(p => p.n === 3 && (p as { forte?: boolean }).forte)).toBeTruthy();
  });

  it('resposta de antes (sem a rotina por área) conta a rotina inteira no Calendário', () => {
    expect(texto(avisoDaSemana({ tarefas: 0, atrasadas: 0, por_frente: {}, rotina: { total: 5, feitas: 2 } })))
      .toBe('Não se esqueça de checar sua fila desta semana: 3 do calendário. E principalmente, tire suas dúvidas! Vamos fazer acontecer.');
  });

  it('uma frente só e sem atraso', () => {
    expect(texto(avisoDaSemana({ tarefas: 1, atrasadas: 0, por_frente: { ins: 0, sis: 1 }, rotina: { total: 0, feitas: 0 } })))
      .toBe('Não se esqueça de checar sua fila desta semana: 1 requisição. E principalmente, tire suas dúvidas! Vamos fazer acontecer.');
  });

  it('fila vazia e rotina toda feita = em dia', () => {
    expect(texto(avisoDaSemana({ tarefas: 0, atrasadas: 0, por_frente: {}, rotina: { total: 2, feitas: 2 } })))
      .toMatch(/^Sua fila desta semana está em dia/);
  });
});
