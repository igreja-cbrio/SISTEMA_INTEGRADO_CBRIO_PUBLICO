import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { join } from 'path';
import { semComentariosJs } from './_semComentarios';
import { enviarParaSharePoint, PEDACO_BYTES } from '../lib/enviarParaSharePoint';




const require = createRequire(import.meta.url);
const E = require('../../backend/utils/marketingEntregaArquivo.js');

const raiz = join(__dirname, '..', '..');
const ler = (p: string) => readFileSync(join(raiz, p), 'utf8');

describe('a árvore do site Criativo (06/10 · o ano em cima, nomes para gente ler)', () => {
  const hoje = '2026-10-06';

  it('ciclo: Demandas/<ano DO EVENTO>/Ciclo criativo/<evento>/<NN - fase>', () => {
    const p = E.pastaDaEntrega({ tipo: 'ciclo', evento: { nome: 'Série: Parábolas', data: '2026-11-08' }, fase: { numero: 6, nome: 'Execução Estratégica' } }, hoje);
    expect(p.pasta).toBe('Demandas/2026/Ciclo criativo/Série Parábolas/06 - Execução Estratégica');
    expect(p).toMatchObject({ ano: '2026', categoria: 'ciclo', partes: ['Ciclo criativo', 'Série Parábolas', '06 - Execução Estratégica'] });

    expect(E.pastaDaEntrega({ tipo: 'ciclo', evento: { nome: 'Retiro', data: '2027-01-15' }, fase: { numero: 1, nome: 'Pré-Briefing' } }, hoje).pasta)
      .toBe('Demandas/2027/Ciclo criativo/Retiro/01 - Pré-Briefing');

    expect(E.pastaDaEntrega({ tipo: 'ciclo', evento: { nome: '' }, fase: null }, hoje).pasta)
      .toBe('Demandas/2026/Ciclo criativo/Evento sem nome/Outras tarefas');
    expect(E.pastaDaEntrega({ tipo: 'ciclo', evento: { nome: 'Natal' }, fase: { numero: 3, nome: '' } }, hoje).pasta)
      .toBe('Demandas/2026/Ciclo criativo/Natal/03');
  });

  it('rotina: o mês é o da QUARTA-FEIRA da semana (a régua das rotinas mensais)', () => {
    expect(E.pastaDaEntrega({ tipo: 'rotina', semanaInicio: '2026-10-04', compromisso: 'Captações de domingo (fotos e vídeos)' }, hoje).pasta)
      .toBe('Demandas/2026/Rotina/10 - Outubro/Captações de domingo');

    expect(E.pastaDaEntrega({ tipo: 'rotina', semanaInicio: '2026-11-29', compromisso: 'Análise do YouTube' }, hoje).pasta)
      .toBe('Demandas/2026/Rotina/12 - Dezembro/Análise do YouTube');

    expect(E.pastaDaEntrega({ tipo: 'rotina', semanaInicio: '2026-12-27', compromisso: 'Stories' }, hoje).ano).toBe('2026');

    expect(E.pastaDaEntrega({ tipo: 'rotina', semanaInicio: '2027-01-03', compromisso: 'Stories' }, hoje).pasta)
      .toBe('Demandas/2027/Rotina/01 - Janeiro/Stories');
  });

  it('tarefa: Requisições/<mês do prazo>/<tarefa> e Redes/Produção/<mês>/<tarefa>', () => {
    expect(E.pastaDaEntrega({ tipo: 'tarefa', categoria: 'requisicoes', titulo: 'Arte do culto de Natal', dia: '2026-12-20' }, hoje).pasta)
      .toBe('Demandas/2026/Requisições/12 - Dezembro/Arte do culto de Natal');
    expect(E.pastaDaEntrega({ tipo: 'tarefa', categoria: 'redes', titulo: 'Postar · Semana 1 de novembro', dia: '2026-11-03' }, hoje).pasta)
      .toBe('Demandas/2026/Redes/Produção/11 - Novembro/Postar · Semana 1 de novembro');

    expect(E.pastaDaEntrega({ tipo: 'tarefa', categoria: 'requisicoes', titulo: 'Banner', dia: null }, hoje).pasta)
      .toBe('Demandas/2026/Requisições/10 - Outubro/Banner');
    expect(() => E.pastaDaEntrega({ tipo: 'tarefa', categoria: 'ciclo', titulo: 'x', dia: hoje }, hoje)).toThrow();
  });

  it('planejamento de postagens: Redes/Planejamento/<MM - mês>', () => {
    expect(E.pastaDaEntrega({ tipo: 'planejamento', mes: '2026-11' }, hoje).pasta).toBe('Demandas/2026/Redes/Planejamento/11 - Novembro');
    expect(() => E.pastaDaEntrega({ tipo: 'planejamento', mes: '2026-13' }, hoje)).toThrow();
    expect(() => E.pastaDaEntrega({ tipo: 'qualquer' }, hoje)).toThrow();
  });

  it('nome de pasta: acento e espaço ficam; o que o SharePoint recusa, não', () => {
    expect(E.nomeLegivel('Ação de Graças 2026!')).toBe('Ação de Graças 2026!');
    expect(E.nomeLegivel('Culto: "Família" <vol. 2> 50% #1 a/b|c')).toBe('Culto Família vol. 2 50 1 a b c');
    expect(E.nomeLegivel('  ..~$rascunho. . ')).toBe('rascunho');
    expect(E.nomeLegivel('CON')).toBe('Sem nome');
    expect(E.nomeLegivel('', 'Rotina')).toBe('Rotina');
    expect(E.nomeLegivel('x'.repeat(200)).length).toBe(80);

    expect(E.nomeLegivel('🎄'.repeat(100))).toBe('🎄'.repeat(80));

    expect(E.nomeLegivel('Pregão')).toBe('Pregão');
  });

  it('a pasta da tarefa é a do PRIMEIRO arquivo (renomear ou mudar o prazo não espalha os arquivos)', () => {
    const nova = 'Demandas/2026/Requisições/12 - Dezembro/Arte';
    expect(E.pastaFixada(nova, 'Demandas/2026/Requisições/11 - Novembro/Arte')).toBe('Demandas/2026/Requisições/11 - Novembro/Arte');
    expect(E.pastaFixada(nova, null)).toBe(nova);

    expect(E.pastaFixada(nova, 'Eventos/Natal/Fase_05_-_Execucao')).toBe(nova);
  });
});

describe('o nome do arquivo', () => {
  it('leva o culto e a entrega na frente, legível, e nunca perde a extensão', () => {
    expect(E.nomeDoArquivo('Capa – versão final (2).PNG', ['AMI', 'PPT · capa e miolo'])).toBe('AMI - PPT · capa e miolo - Capa – versão final (2).png');
    const longo = E.nomeDoArquivo(`${'muito '.repeat(40)}longo.pdf`, ['AMI', 'Thumbs']);
    expect(longo.endsWith('.pdf')).toBe(true);
    expect(Array.from(longo).length).toBeLessThanOrEqual(120);

    expect(E.nomeDoArquivo('a.pdf', ['x'.repeat(60), '', null])).toBe(`${'x'.repeat(40)} - a.pdf`);
  });

  it('sem extensão, ou com "extensão" que não é extensão, fica sem; o proibido sai', () => {
    expect(E.nomeDoArquivo('LEIA-ME', [])).toBe('LEIA-ME');
    expect(E.nomeDoArquivo('relatorio.versao final de outubro', ['KIDS'])).toBe('KIDS - relatorio.versao final de outubro');
    expect(E.nomeDoArquivo('.env', [])).toBe('env');
    expect(E.nomeDoArquivo('', [])).toBe('arquivo');
    expect(E.nomeDoArquivo('roteiro: v2?.docx', ['2026-10-04', 'Luciana'])).toBe('2026-10-04 - Luciana - roteiro v2.docx');
  });
});

describe('o NOME PADRÃO (06/10): de onde o arquivo é e o que ele é, nunca o nome original', () => {
  const nomeDe = (o: Record<string, unknown>, versao = 1, original = 'qualquer coisa.PDF') =>
    E.nomePadrao({ base: E.baseDoNome(E.partesDoNome(o)), versao, original });

  it('ciclo: ano · evento (sem repetir o ano) · F<fase> · entregável · culto · versão', () => {
    const fase = 'Demandas/2026/Ciclo criativo/Natal 2026/03 - Brainstorming e Conceito';
    expect(nomeDe({ pasta: fase, tipo: 'ciclo', entregavel: 'Moodboard', culto: 'ami' })).toBe('2026 - Natal - F03 - Moodboard - AMI - v01.pdf');
    expect(nomeDe({ pasta: fase, tipo: 'ciclo', entregavel: 'Defesa', culto: 'ami' }, 2)).toBe('2026 - Natal - F03 - Defesa - AMI - v02.pdf');

    expect(nomeDe({ pasta: fase, tipo: 'ciclo', entregavel: 'Moodboard' })).toBe('2026 - Natal - F03 - Moodboard - v01.pdf');
    expect(nomeDe({ pasta: 'Demandas/2026/Ciclo criativo/Natal 2026/Outras tarefas', tipo: 'ciclo', entregavel: 'Fotos', tarefa: 'Ensaio fotográfico' }, 1, 'IMG_0001.zip'))
      .toBe('2026 - Natal - Ensaio fotográfico - Fotos - v01.zip');
  });

  it('rotina: a semana · o compromisso · a pessoa; requisição e produção: ano · tarefa · subtarefa', () => {
    expect(nomeDe({ pasta: 'Demandas/2026/Rotina/10 - Outubro/Análise do YouTube', tipo: 'rotina', semanaInicio: '2026-10-11', pessoa: 'Luciana' }))
      .toBe('2026-10-11 - Análise do YouTube - Luciana - v01.pdf');
    expect(nomeDe({ pasta: 'Demandas/2026/Requisições/12 - Dezembro/Arte do culto de Natal', tipo: 'tarefa', entregavel: 'Briefing' }))
      .toBe('2026 - Arte do culto de Natal - Briefing - v01.pdf');
    expect(nomeDe({ pasta: 'Demandas/2026/Redes/Produção/11 - Novembro/Postar · Semana 1 de novembro', tipo: 'tarefa', entregavel: 'Post 1' }, 1, 'a.png'))
      .toBe('2026 - Postar · Semana 1 de novembro - Post 1 - v01.png');
  });

  it('o ano sai do nome do evento só quando é o ano da pasta e está separado', () => {
    expect(E.semAno('Natal 2026', '2026')).toBe('Natal');
    expect(E.semAno('Natal: 2026', '2026')).toBe('Natal');
    expect(E.semAno('2026 - Retiro', '2026')).toBe('Retiro');
    expect(E.semAno('Natal 12026', '2026')).toBe('Natal 12026');
    expect(E.semAno('Natal 2027', '2026')).toBe('Natal 2027');
    expect(E.semAno('Conferência 2026 Jovem', '2026')).toBe('Conferência 2026 Jovem');
    expect(E.semAno('2026', '2026')).toBe('2026');
  });

  it('a versão: a maior do MESMO entregável na pasta, mais um (tirado conta; outro entregável e o sufixo do SharePoint não)', () => {
    const base = '2026 - Natal - F03 - Moodboard - AMI';
    expect(E.proximaVersao([], base)).toBe(1);
    expect(E.proximaVersao([`${base} - v01.pdf`, `${base} - v02.png`], base)).toBe(3);

    expect(E.proximaVersao([`${base} - v03 1.png`], base)).toBe(4);
    expect(E.proximaVersao(['2026 - Natal - F03 - Defesa - AMI - v07.pdf', `${base} - Extra - v09.pdf`], base)).toBe(1);
    expect(E.proximaVersao([`${base} - v09.pdf`], base)).toBe(10);
    expect(E.nomePadrao({ base, versao: 10, original: 'x.pdf' })).toBe(`${base} - v10.pdf`);

    expect(E.proximaVersao([`${base.toUpperCase()} - V01.pdf`.normalize('NFD')], base)).toBe(2);
  });

  it('a extensão é a do original, em minúscula; sem extensão, sem extensão; nome comprido é cortado sem perder a versão', () => {
    const base = E.baseDoNome(['2026', 'x'.repeat(60), 'y'.repeat(60), 'z'.repeat(60)]);
    expect(Array.from(base).length).toBeLessThanOrEqual(100);
    expect(E.nomePadrao({ base, versao: 1, original: 'FOTO.JPEG' }).endsWith(' - v01.jpeg')).toBe(true);
    expect(E.nomePadrao({ base: 'A', versao: 1, original: 'LEIA-ME' })).toBe('A - v01');
    expect(E.nomePadrao({ base: 'A', versao: 1, original: 'relatorio.versao final' })).toBe('A - v01');

    expect(E.baseDoNome(['2026', 'Natal: "especial"', 'Peça 1/2'])).toBe('2026 - Natal especial - Peça 1 2');
  });
});

describe('a ESTRUTURA DO ANO (06/10): só as pastas que o ano ainda vai usar', () => {
  const eventos = [
    { nome: 'Natal: 2026', data: '2026-12-24', fases: [{ numero: 5, nome: 'Execução' }, { numero: 3, nome: 'Brainstorming e Conceito' }] },
    { nome: 'Páscoa', data: '2026-04-05', fases: [{ numero: 1, nome: 'Briefing' }] },
    { nome: 'Retiro', data: '2027-01-15', fases: [{ numero: 1, nome: 'Briefing' }] },
    { nome: 'Sem data', data: null, fases: [{ numero: 1, nome: 'Briefing' }] },
    { nome: 'Culto de hoje', data: '2026-10-06', fases: [] },
  ];
  const compromissos = [{ descricao: 'Análise do YouTube' }, { descricao: 'Stories do culto (sábado)' }, { descricao: '  ' }];
  const r = E.estruturaDoAno({ ano: '2026', hoje: '2026-10-06', eventos, compromissos });

  it('as do ano, o evento que ainda vem com as fases em ordem, e o pai sempre antes do filho', () => {
    expect(r.slice(0, 8)).toEqual(['Demandas', 'Demandas/2026', 'Demandas/2026/Ciclo criativo', 'Demandas/2026/Rotina',
      'Demandas/2026/Requisições', 'Demandas/2026/Redes', 'Demandas/2026/Redes/Produção', 'Demandas/2026/Redes/Planejamento']);
    const natal = r.filter(p => p.includes('Natal'));
    expect(natal).toEqual(['Demandas/2026/Ciclo criativo/Natal 2026',
      'Demandas/2026/Ciclo criativo/Natal 2026/03 - Brainstorming e Conceito',
      'Demandas/2026/Ciclo criativo/Natal 2026/05 - Execução']);
    for (const p of r) {
      const pai = p.split('/').slice(0, -1).join('/');
      if (pai) expect(r.indexOf(pai)).toBeLessThan(r.indexOf(p));
    }
    expect(new Set(r).size).toBe(r.length);
  });

  it('o passado não: evento que já foi, evento de 2027, evento sem data, nem evento sem fase do Marketing', () => {
    expect(r.some(p => /Páscoa|Retiro|Sem data|Culto de hoje/.test(p))).toBe(false);
  });

  it('rotina: o mês de hoje até dezembro, com os compromissos; requisições e produção: os meses; planejamento: só os DEPOIS deste', () => {
    for (const m of ['10 - Outubro', '11 - Novembro', '12 - Dezembro']) {
      expect(r).toContain(`Demandas/2026/Rotina/${m}/Análise do YouTube`);
      expect(r).toContain(`Demandas/2026/Rotina/${m}/Stories do culto`);
      expect(r).toContain(`Demandas/2026/Requisições/${m}`);
      expect(r).toContain(`Demandas/2026/Redes/Produção/${m}`);
    }
    expect(r.some(p => p.includes('09 - Setembro'))).toBe(false);
    expect(r.filter(p => p.startsWith('Demandas/2026/Redes/Planejamento/'))).toEqual([
      'Demandas/2026/Redes/Planejamento/11 - Novembro', 'Demandas/2026/Redes/Planejamento/12 - Dezembro']);

    expect(r.filter(p => /^Demandas\/2026\/Rotina\/10 - Outubro\//.test(p))).toHaveLength(2);
  });

  it('é a MESMA pasta do envio (a régua é uma só)', () => {
    expect(r).toContain(E.pastaDaEntrega({ tipo: 'rotina', semanaInicio: '2026-11-29', compromisso: 'Análise do YouTube' }, '2026-10-06').pasta);
    expect(r).toContain(E.pastaDaEntrega({ tipo: 'tarefa', categoria: 'requisicoes', titulo: 'x', dia: '2026-11-03' }, '2026-10-06').partes
      .slice(0, -1).reduce((acc: string, s: string) => `${acc}/${s}`, 'Demandas/2026'));
  });

  it('em dezembro: só dezembro, sem planejamento; outro ano: recusa (os próximos ficam para depois)', () => {
    const dez = E.estruturaDoAno({ ano: '2026', hoje: '2026-12-10', eventos: [], compromissos: [] });
    expect(dez.filter(p => p.startsWith('Demandas/2026/Requisições/'))).toEqual(['Demandas/2026/Requisições/12 - Dezembro']);
    expect(dez.some(p => p.startsWith('Demandas/2026/Redes/Planejamento/'))).toBe(false);
    expect(() => E.estruturaDoAno({ ano: '2027', hoje: '2026-10-06' })).toThrow();
  });
});

describe('quem vê o quê na página Arquivos', () => {
  it('Ciclo criativo: Marketing e quem tem o Eventos · rotina, requisições e redes: só o Marketing', () => {
    const ciclo = { origem: 'ciclo' };
    const req = { origem: 'tarefa', categoria: 'requisicoes' };
    const prod = { origem: 'tarefa', categoria: 'redes' };
    const rot = { origem: 'rotina' };
    const plano = { origem: 'planejamento' };
    for (const a of [ciclo, req, prod, rot, plano]) expect(E.podeVerArquivo(a, { marketing: true })).toBe(true);
    expect(E.podeVerArquivo(ciclo, { eventos: true })).toBe(true);
    for (const a of [req, prod, rot, plano]) expect(E.podeVerArquivo(a, { eventos: true })).toBe(false);
    expect(E.podeVerArquivo(ciclo, {})).toBe(false);

    expect(E.podeVerArquivo({ origem: 'outra' }, { eventos: true })).toBe(false);
  });

  it('a categoria: a coluna quando existe; antes dela, a origem', () => {
    expect(E.categoriaDoArquivo({ origem: 'ciclo' })).toBe('ciclo');
    expect(E.categoriaDoArquivo({ origem: 'rotina' })).toBe('rotina');
    expect(E.categoriaDoArquivo({ origem: 'planejamento' })).toBe('redes');
    expect(E.categoriaDoArquivo({ origem: 'tarefa', categoria: 'redes' })).toBe('redes');
    expect(E.categoriaDoArquivo({ origem: 'tarefa', categoria: 'xyz' })).toBe('requisicoes');
  });

  it('o caminho na página é o da pasta; o arquivo de antes da árvore nova aparece onde estaria hoje', () => {
    expect(E.caminhoNaArvore({ pasta: 'Demandas/2026/Ciclo criativo/Natal/05 - Execução' }))
      .toEqual(['2026', 'Ciclo criativo', 'Natal', '05 - Execução']);
    const legado = E.pastaDaEntrega({ tipo: 'rotina', semanaInicio: '2026-10-04', compromisso: 'Stories' }, '2026-10-06');
    expect(E.caminhoNaArvore({ pasta: 'Marketing/Rotina/2026-10-04/Stories' }, legado)).toEqual(['2026', 'Rotina', '10 - Outubro', 'Stories']);
    expect(E.caminhoNaArvore({ pasta: 'Eventos/Natal/Fase_05' })).toBeNull();
  });

  it('a subtarefa de tarefa: entrega de ciclo EXIGE; evento fora das fases, produção e requisição só anexam', () => {
    expect(E.tipoDaTarefa({ origem: 'evento', event_id: 'e', event_phase_id: 'f' }, 'ins')).toEqual({ origem: 'ciclo', categoria: 'ciclo', exige: true });
    expect(E.tipoDaTarefa({ origem: 'interna', event_id: 'e' }, 'ins')).toEqual({ origem: 'ciclo', categoria: 'ciclo', exige: false });
    expect(E.tipoDaTarefa({ origem: 'interna' }, 'prd')).toEqual({ origem: 'tarefa', categoria: 'redes', exige: false });
    expect(E.tipoDaTarefa({ origem: 'solicitacao', solicitacao_id: 's' }, 'sis')).toEqual({ origem: 'tarefa', categoria: 'requisicoes', exige: false });
  });
});

describe('validar o arquivo', () => {
  it('nome, tamanho > 0 e até 10 GB', () => {
    expect(E.validarArquivo({ nome: '', tamanho: 10 }).ok).toBe(false);
    expect(E.validarArquivo({ nome: 'a.png', tamanho: 0 }).erro).toMatch(/vazio/);
    expect(E.validarArquivo({ nome: 'a.mp4', tamanho: E.TAMANHO_MAX_BYTES + 1 }).erro).toMatch(/10 GB/);
    expect(E.validarArquivo({ nome: 'a.mp4', tamanho: E.TAMANHO_MAX_BYTES }).ok).toBe(true);
  });
});

describe('o arquivo está mesmo na pasta da entrega? (lido do SharePoint, não do navegador)', () => {
  const pasta = 'Demandas/2026/Ciclo criativo/Série Parábolas/06 - Execução Estratégica';
  const item = (path: string, driveId = 'D1') => ({ id: 'i1', webUrl: 'https://sp/x', parentReference: { driveId, path } });

  it('pasta certa, no drive certo (o caminho pode vir codificado, com outra caixa ou com o acento decomposto)', () => {
    expect(E.itemNaPasta({ driveItem: item(`/drives/D1/root:/${pasta}`), driveId: 'D1', pasta })).toBe(true);
    expect(E.itemNaPasta({ driveItem: item(`/drives/D1/root:/${pasta.toLowerCase()}`), driveId: 'D1', pasta })).toBe(true);
    expect(E.itemNaPasta({ driveItem: item(`/drives/D1/root:/${encodeURI(pasta)}`), driveId: 'D1', pasta })).toBe(true);
    expect(E.itemNaPasta({ driveItem: item(`/drives/D1/root:/${pasta.normalize('NFD')}`), driveId: 'D1', pasta })).toBe(true);
  });

  it('outra pasta, subpasta, pasta "parecida" ou outro drive: não', () => {
    expect(E.itemNaPasta({ driveItem: item('/drives/D1/root:/Demandas/2026/Ciclo criativo/Outro/06 - Execução Estratégica'), driveId: 'D1', pasta })).toBe(false);
    expect(E.itemNaPasta({ driveItem: item(`/drives/D1/root:/${pasta}/sub`), driveId: 'D1', pasta })).toBe(false);
    expect(E.itemNaPasta({ driveItem: item(`/drives/D1/root:/${pasta} 2`), driveId: 'D1', pasta })).toBe(false);
    expect(E.itemNaPasta({ driveItem: item(`/drives/D1/root:/Copia/${pasta}`), driveId: 'D1', pasta })).toBe(false);
    expect(E.itemNaPasta({ driveItem: item(`/drives/D2/root:/${pasta}`, 'D2'), driveId: 'D1', pasta })).toBe(false);
    expect(E.itemNaPasta({ driveItem: { id: 'i1', parentReference: { path: `root:/${pasta}` } }, driveId: 'D1', pasta })).toBe(false);
    expect(E.itemNaPasta({ driveItem: null, driveId: 'D1', pasta })).toBe(false);
  });
});

describe('o que cada subtarefa aceita (GET /linha)', () => {
  it('toda subtarefa ACEITA arquivo; EXIGE só a entrega de ciclo', () => {
    type ItemT = Record<string, unknown>;
    const ciclo = { frente: 'ins', event_phase_id: 'f1', itens: [{ id: 'i1' }, { id: 'i2' }] as ItemT[] };
    const req = { frente: 'sis', event_phase_id: null, itens: [{ id: 'i3' }] as ItemT[] };
    const soltaDeEvento = { frente: 'ins', event_phase_id: null, itens: [{ id: 'i4' }] as ItemT[] };
    E.anotarEntregas({
      cards: [ciclo, req, soltaDeEvento],
      arquivos: [
        { id: 'a1', origem: 'ciclo', checklist_item_id: 'i1', nome_arquivo: 'capa.png', web_url: 'u1', tamanho_bytes: 10 },
        { id: 'a2', origem: 'ciclo', checklist_item_id: 'i1', nome_arquivo: 'velho.png', web_url: 'u2', deleted_at: '2026-10-05' },
        { id: 'a3', origem: 'tarefa', checklist_item_id: 'i3', nome_arquivo: 'briefing.pdf', web_url: 'u3' },
      ],
    });
    expect(ciclo.itens[0]).toMatchObject({ aceita_arquivo: true, exige_arquivo: true });
    expect((ciclo.itens[0].arquivos as { id: string }[]).map(a => a.id)).toEqual(['a1']);
    expect(ciclo.itens[1]).toMatchObject({ aceita_arquivo: true, exige_arquivo: true, arquivos: [] });
    expect(req.itens[0]).toMatchObject({ aceita_arquivo: true, exige_arquivo: false });
    expect((req.itens[0].arquivos as { id: string }[]).map(a => a.id)).toEqual(['a3']);
    expect(soltaDeEvento.itens[0]).toMatchObject({ aceita_arquivo: true, exige_arquivo: false, arquivos: [] });
  });

  it('rotina: toda subtarefa aceita; exige só o compromisso marcado; o arquivo é da pessoa NAQUELA semana', () => {
    type ItemR = Record<string, unknown>;
    const t1 = { semana_inicio: '2026-10-04', itens: [{ id: 'c1|2026-10-04', compromisso_id: 'c1', membro_id: 'm1' }, { id: 'c2|2026-10-04', compromisso_id: 'c2', membro_id: 'm1' }] as ItemR[] };
    const t2 = { semana_inicio: '2026-10-11', itens: [{ id: 'c1|2026-10-11', compromisso_id: 'c1', membro_id: 'm1' }] as ItemR[] };
    E.anotarEntregas({
      rotina: [t1, t2],
      exigeArquivo: { c1: true },
      arquivos: [
        { id: 'r1', origem: 'rotina', compromisso_id: 'c1', membro_id: 'm1', semana_inicio: '2026-10-04', nome_arquivo: 'fotos.zip', web_url: 'u' },
        { id: 'r2', origem: 'rotina', compromisso_id: 'c2', membro_id: 'm1', semana_inicio: '2026-10-04', nome_arquivo: 'extra.pdf', web_url: 'u' },
      ],
    });
    expect(t1.itens[0]).toMatchObject({ aceita_arquivo: true, exige_arquivo: true });
    expect(t1.itens[0].arquivos as unknown[]).toHaveLength(1);
    expect(t1.itens[1]).toMatchObject({ aceita_arquivo: true, exige_arquivo: false });
    expect((t1.itens[1].arquivos as { id: string }[]).map(a => a.id)).toEqual(['r2']);
    expect(t2.itens[0]).toMatchObject({ aceita_arquivo: true, arquivos: [] });
  });
});

describe('o envio direto ao SharePoint (em pedaços de 10 MB)', () => {
  it('até 10 MB num PUT só; acima, em pedaços com Content-Range, e devolve o item final', async () => {
    const total = 2 * PEDACO_BYTES + 5;
    const arquivo = { size: total, slice: (a: number, b: number) => ({ a, b }) } as unknown as Blob;
    const chamadas: string[] = [];
    const fetchImpl = vi.fn(async (_url: string, init: { headers: Record<string, string> }) => {
      chamadas.push(init.headers['Content-Range']);
      const ultimo = chamadas.length === 3;
      return { ok: true, status: ultimo ? 201 : 202, json: async () => ({ id: 'sp-1', webUrl: 'https://sp/arq' }) };
    });
    const progresso: number[] = [];
    const r = await enviarParaSharePoint({ uploadUrl: 'https://up', arquivo, onProgresso: (p: number) => progresso.push(p), fetchImpl });
    expect(r.id).toBe('sp-1');
    expect(chamadas).toEqual([
      `bytes 0-${PEDACO_BYTES - 1}/${total}`,
      `bytes ${PEDACO_BYTES}-${2 * PEDACO_BYTES - 1}/${total}`,
      `bytes ${2 * PEDACO_BYTES}-${total - 1}/${total}`,
    ]);
    expect(progresso[progresso.length - 1]).toBe(100);
    expect(PEDACO_BYTES % (320 * 1024)).toBe(0);
  });

  it('⚠️ recusa do SharePoint vira erro com o motivo (nunca "enviado")', async () => {
    const arquivo = { size: 10, slice: () => ({}) } as unknown as Blob;
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 413, json: async () => ({}) }));
    await expect(enviarParaSharePoint({ uploadUrl: 'https://up', arquivo, fetchImpl })).rejects.toThrow(/413/);
  });
});

describe('guardas de estrutura', () => {
  const linha = semComentariosJs(ler('backend/routes/marketingLinha.js'));
  const mkt = semComentariosJs(ler('backend/routes/marketing.js'));
  const servico = semComentariosJs(ler('backend/services/marketingEntregaArquivo.js'));
  const migration = ler('supabase/migrations/20261005150000_mkt_entrega_arquivos.sql');

  it('as 3 rotas existem, no módulo, e quem envia é quem pode MARCAR', () => {
    expect(linha).toContain("router.post('/entregas/sessao', authorizeModule('marketing', 1)");
    expect(linha).toContain("router.post('/entregas', authorizeModule('marketing', 1)");
    expect(linha).toContain("router.delete('/entregas/:id', authorizeModule('marketing', 1)");
    expect(linha).toMatch(/async function destinoDaEntrega[\s\S]{0,1600}regraSubtarefa\.podeMarcarItem\(/);
    expect(linha).toMatch(/async function destinoDaEntrega[\s\S]{0,4000}autorizarRotinaDe\(/);
  });

  it('o registrar LÊ o arquivo no SharePoint e confere a pasta ANTES de gravar', () => {
    const corpo = linha.slice(linha.indexOf("router.post('/entregas', authorizeModule"));
    const iLer = corpo.indexOf('SE.lerItemDoDrive(');
    const iPasta = corpo.indexOf('E.itemNaPasta(');
    const iGrava = corpo.indexOf('.insert(linha)');
    expect(iLer).toBeGreaterThan(-1);
    expect(iPasta).toBeGreaterThan(iLer);
    expect(iGrava).toBeGreaterThan(iPasta);

    expect(corpo).toContain('nome_arquivo: sp.name');
    expect(corpo).toContain('web_url: sp.webUrl');

    expect(corpo).toContain('regraSubtarefa.faltaRegistro(');
    expect(corpo).toContain('await avisarSeChecklistConcluiu(');
  });

  it('tirar o último arquivo reabre a entrega (ciclo e rotina) · o anexo não reabre nada', () => {
    const corpo = linha.slice(linha.indexOf("router.delete('/entregas/:id'"));
    expect(corpo).toMatch(/contarArquivos\(\{ itemId: a\.checklist_item_id \}\)\) === 0[\s\S]{0,300}feito: false/);

    expect(corpo).toMatch(/if \(\(await itemEhEntregaDeCiclo\(a\.checklist_item_id\)\)\s*&& \(await SE\.contarArquivos/);
    expect(corpo).toMatch(/if \(exige\s*&& \(await SE\.contarArquivos\(\{ compromissoId/);
    expect(corpo).toMatch(/marketing_rotina_execucoes'\)\.delete\(\)/);
    expect(corpo).toMatch(/!ctx\.lider && a\.enviado_por !== req\.user\.userId/);
  });

  it('⚠️ sem arquivo não marca: o checklist (ciclo) e a rotina (compromisso que pede) recusam', () => {
    expect(mkt).toMatch(/select\('id, atribuido_a, visibilidade, estado, origem, event_phase_id'\)/);


    expect(mkt).toMatch(/if \(update\.feito === true && !item\.feito && ehEntregaDeCiclo\(card\)\s*&& \(await contarArquivosDaEntrega\(\{ itemId: item\.id \}\)\) === 0\) \{\s*return res\.status\(400\)/);
    expect(mkt).toContain("codigo: 'arquivo_obrigatorio'");
    const put = linha.slice(linha.indexOf("router.put('/rotina/:compromissoId/:semanaInicio'"));
    expect(put.slice(0, 900)).toContain("codigo: 'arquivo_obrigatorio'");
  });

  it('tudo vai para o site Criativo (sem acesso, a reserva no CBRio Hub); nome repetido ganha sufixo', () => {
    expect(servico).toContain("const SITE_CRIATIVO = 'infracbrio.sharepoint.com:/sites/Criativo';");
    expect(servico).toMatch(/destino = await driveDoSiteCriativo\(token\);\s*\} catch \(e\) \{[\s\S]{0,200}driveDoHub\(token\)/);

    expect(servico).toContain("(destino.local === 'criativo' ? 60 : 5) * MIN");
    expect(servico).not.toContain('PLANEJAMENTO_DRIVE_ID');
    expect(servico).toContain("'@microsoft.graph.conflictBehavior': 'rename'");

    expect(linha).not.toContain('RP.pastaDoPlanejamento');
    expect(linha).toContain("E.pastaDaEntrega({ tipo: 'planejamento', mes }).pasta");
  });

  it('a migration: a tabela só do backend, as chaves de cada origem e o "exige arquivo" da rotina', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.marketing_entrega_arquivos');
    expect(migration).toContain("CHECK (origem IN ('ciclo', 'rotina'))");
    expect(migration).toMatch(/uq_mkt_entrega_arquivos_item_sp[\s\S]{0,120}\(drive_id, sharepoint_item_id\)[\s\S]{0,40}WHERE deleted_at IS NULL/);
    expect(migration).toMatch(/TO anon, authenticated\s+USING \(false\)\s+WITH CHECK \(false\)/);
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS exige_arquivo boolean NOT NULL DEFAULT false');
  });

  it('a migration de 06/10: as origens novas, a categoria que CASA com a origem e a FK do plano em bloco próprio', () => {
    const m06 = ler('supabase/migrations/20261006120000_mkt_arquivos_criativo.sql');
    expect(m06).toContain("CHECK (origem IN ('ciclo', 'rotina', 'tarefa', 'planejamento'))");

    expect(m06).toContain("(origem = 'tarefa'       AND categoria IS NOT NULL AND categoria IN ('requisicoes', 'redes'))");
    expect(m06).toContain("(categoria IS NULL AND origem IN ('ciclo', 'rotina', 'planejamento'))");
    expect(m06).toMatch(/ADD COLUMN IF NOT EXISTS plano_id uuid;/);
    expect(m06).toMatch(/ADD CONSTRAINT fk_mkt_entrega_arquivos_plano\s+FOREIGN KEY \(plano_id\) REFERENCES public\.marketing_redes_planos\(id\) ON DELETE SET NULL/);

    expect(linha).toContain("...(d.origem === 'tarefa' ? { categoria: d.categoria } : {}),");
  });
});
