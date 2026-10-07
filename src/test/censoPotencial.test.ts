











import { describe, it, expect } from 'vitest';
import {
  classificar, contatoDe, montarPotencial, resumoPotencial, cruzarComKids,
  FAIXAS_KIDS, FAIXA_AMI, FAIXA_BRIDGE, DIAS_FREQUENCIA_KIDS,
} from '../../backend/utils/censoPotencial.js';

const pai = (over: Record<string, unknown> = {}) => ({
  nome: 'Fulano de Tal', telefone: '21999990000', email: 'f@x.com',
  tem_filhos: 'Sim', filhos_quantos: 2, filhos_faixas: ['3 a 6 anos'],
  filhos_frequentam: 'Não', entregou_vida: 'Sim', batizado: 'Sim',
  whatsapp_optin: 'Sim, autorizo', ...over,
});
const linha = (payload: Record<string, unknown>, id = 'r1') => ({ id, membro_id: 'm1', payload });

describe('Potencial Kids · "Não" e "Parcialmente" são listas DIFERENTES', () => {
  it('quem tem filho na faixa e não frequenta entra em kids_nao', () => {
    expect(classificar(pai()).kids).toBe('nao');
  });

  it('⚠️ "Parcialmente" NÃO entra em kids_nao — a família já está no Kids', () => {
    const c = classificar(pai({ filhos_frequentam: 'Parcialmente' }));
    expect(c.kids, 'juntar os dois faz ligar para quem já leva o filho').toBe('parcial');
  });

  it('quem já frequenta não entra em nenhuma das duas', () => {
    expect(classificar(pai({ filhos_frequentam: 'Sim' })).kids).toBeNull();
  });

  it('as quatro faixas do Kids valem, e só elas', () => {
    for (const f of FAIXAS_KIDS) {
      expect(classificar(pai({ filhos_faixas: [f] })).kids, `faixa ${f}`).toBe('nao');
    }
    expect(classificar(pai({ filhos_faixas: [FAIXA_AMI] })).kids).toBeNull();
  });

  it('⚠️ sem filhos não entra, mesmo dizendo que não frequenta', () => {
    expect(classificar(pai({ tem_filhos: 'Não', filhos_faixas: undefined })).kids).toBeNull();
  });
});

describe('⚠️⚠️ payload sem `filhos_faixas` não pode derrubar a rota', () => {
  it('chave ausente (398 payloads reais) devolve lista vazia, não exceção', () => {
    const p = pai(); delete (p as Record<string, unknown>).filhos_faixas;
    expect(() => classificar(p)).not.toThrow();
    expect(classificar(p).kids).toBeNull();
  });

  it('valor não-array também não explode', () => {
    expect(() => classificar(pai({ filhos_faixas: 'texto' }))).not.toThrow();
    expect(() => classificar(pai({ filhos_faixas: null }))).not.toThrow();
  });
});

describe('AMI e Bridge saem SÓ da faixa — não há pergunta de frequência', () => {




  it('⚠️ 13 a 17 é BRIDGE; 18 a 25 é AMI', () => {
    expect(FAIXA_BRIDGE).toBe('13 a 17 anos');
    expect(FAIXA_AMI).toBe('18 a 25 anos');
    expect(classificar(pai({ filhos_faixas: ['13 a 17 anos'] })).bridge).toBe(true);
    expect(classificar(pai({ filhos_faixas: ['13 a 17 anos'] })).ami).toBe(false);
    expect(classificar(pai({ filhos_faixas: ['18 a 25 anos'] })).ami).toBe(true);
  });

  it('a mesma pessoa pode estar nas duas', () => {
    const c = classificar(pai({ filhos_faixas: [FAIXA_AMI, FAIXA_BRIDGE] }));
    expect(c.ami && c.bridge).toBe(true);
  });
});

describe('Convertidos não batizados', () => {
  it('entregou a vida e não foi batizado', () => {
    expect(classificar(pai({ entregou_vida: 'Sim', batizado: 'Não' })).convertido).toBe(true);
  });

  it('⚠️ "Ainda em decisão" NÃO entra — a pessoa não declarou conversão', () => {
    const c = classificar(pai({ entregou_vida: 'Ainda em decisão', batizado: 'Não' }));
    expect(c.convertido, 'abordar como convertido afirma por ela o que ela não disse').toBe(false);
  });

  it('já batizado não entra', () => {
    expect(classificar(pai({ entregou_vida: 'Sim', batizado: 'Sim' })).convertido).toBe(false);
  });
});



describe('Ainda não fez o Next · ainda não serve', () => {
  it('quem respondeu "Não" entra', () => {
    const c = classificar(pai({ fez_next: 'Não', serve_ministerio: 'Não' }));
    expect(c.nao_fez_next && c.nao_serve).toBe(true);
  });

  it('quem respondeu "Sim" não entra', () => {
    const c = classificar(pai({ fez_next: 'Sim', serve_ministerio: 'Sim' }));
    expect(c.nao_fez_next || c.nao_serve).toBe(false);
  });

  it('⚠️ quem NÃO RESPONDEU não entra — ausência não é "não fez"', () => {
    const p = pai(); delete (p as Record<string, unknown>).fez_next;
    expect(
      classificar(p).nao_fez_next,
      'ligar para quem já fez, por causa de campo vazio, queima quem liga',
    ).toBe(false);
  });
});

describe('⚠️⚠️ WhatsApp tem TRÊS estados, não dois', () => {
  it('quem autorizou', () => {
    expect(contatoDe(pai()).whatsapp).toBe('autorizou');
  });

  it('⚠️ quem escreveu "Não autorizo" é RECUSA — a tela não oferece WhatsApp', () => {
    expect(contatoDe(pai({ whatsapp_optin: 'Não autorizo' })).whatsapp).toBe('recusou');
  });

  it('⚠️ quem respondeu ANTES de a pergunta existir não é recusa', () => {
    const p = pai(); delete (p as Record<string, unknown>).whatsapp_optin;
    expect(
      contatoDe(p).whatsapp,
      'a pergunta entrou em 13/09; tratar ausência como recusa apagaria centenas sem ninguém ter dito não',
    ).toBe('nao_perguntado');
  });
});

describe('⚠️ a soma das listas NÃO é o número de famílias', () => {
  it('quem está em duas listas conta UMA vez em familias_distintas', () => {
    const r = montarPotencial([
      linha(pai({ filhos_faixas: ['3 a 6 anos', FAIXA_AMI], batizado: 'Não' }), 'r1'),
    ]);
    expect(r.totais.kids_nao + r.totais.ami + r.totais.convertidos).toBe(3);
    expect(r.familias_distintas, 'sem dedup a mesma família leva 3 ligações').toBe(1);
  });

  it('quem não entra em lista nenhuma não conta', () => {
    const r = montarPotencial([linha(pai({ tem_filhos: 'Não', filhos_faixas: undefined }), 'r9')]);
    expect(r.familias_distintas).toBe(0);
  });

  it('linha sem payload é ignorada, não derruba', () => {
    const r = montarPotencial([{ id: 'x', membro_id: null, payload: null } as never, linha(pai())]);
    expect(r.totais.kids_nao).toBe(1);
  });
});

describe('⚠️ o resumo (nível 2) não carrega PII', () => {
  it('devolve só contagens — nenhum nome ou telefone', () => {
    const r = resumoPotencial([linha(pai())]);
    expect(JSON.stringify(r)).not.toContain('Fulano');
    expect(JSON.stringify(r)).not.toContain('21999990000');
    expect(r.totais.kids_nao).toBe(1);
  });
});








import { podeExportar } from '../../backend/utils/podeExportar.js';

describe('⚠️⚠️ podeExportar respeita a matriz de permissões', () => {
  const comFlag = (v: boolean) => ({ granular: { modulePerms: { censo: { leitura: 2, pode_exportar: v } } } });

  it('cargo de nível 2 SEM a flag não exporta', () => {
    expect(
      podeExportar(comFlag(false), 'censo'),
      'é o caso de 33 dos 34 cargos com acesso ao censo',
    ).toBe(false);
  });

  it('cargo com a flag exporta', () => {
    expect(podeExportar(comFlag(true), 'censo')).toBe(true);
  });

  it('super admin e diretor passam (como em todo o resto do sistema)', () => {
    expect(podeExportar({ is_super_admin: true }, 'censo')).toBe(true);
    expect(podeExportar({ role: 'diretor' }, 'censo')).toBe(true);
  });

  it('⚠️ sem permissão granular é NÃO — fail-closed', () => {
    expect(podeExportar({}, 'censo')).toBe(false);
    expect(podeExportar(null as never, 'censo')).toBe(false);
    expect(podeExportar({ granular: { modulePerms: null } } as never, 'censo')).toBe(false);
  });

  it('⚠️ flag de OUTRO módulo não libera o censo', () => {
    const u = { granular: { modulePerms: { financeiro: { pode_exportar: true } } } };
    expect(podeExportar(u, 'censo')).toBe(false);
  });
});



















import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('⚠️⚠️ o encaminhamento vai para a fila do CENSO, não para a de batismo', () => {
  const rota = readFileSync(join(__dirname, '..', '..', 'backend/routes/censo.js'), 'utf8');
  const trecho = rota.slice(rota.indexOf("router.post('/potencial/cuidado'"));

  it('insere em `cen_cuidado`', () => {
    expect(trecho).toMatch(/from\('cen_cuidado'\)[\s\S]{0,120}insert/);
  });

  it('⚠️ NÃO toca em cui_convertidos nem na fila de batismo', () => {
    expect(trecho, 'criar em cui_convertidos derruba 2 KPIs de Cuidados').not.toContain('cui_convertidos');
    expect(trecho).not.toContain('cui_batismo_next_fila');
  });

  it('⚠️ deduplica: `cen_cuidado` não tem UNIQUE, dois cliques criariam duas linhas', () => {
    expect(trecho).toMatch(/\.in\('status', \['aberto', 'em_contato'\]\)/);
    expect(trecho, 'já estar na fila não é erro — responde ok com ja_estava').toMatch(/ja_estava: true/);
  });

  it('⚠️ o tipo é validado contra o CHECK da tabela', () => {
    expect(trecho).toMatch(/\['familiar', 'aconselhamento', 'oracao', 'conversa'\]/);
  });

  it('exige nível 4 — o mesmo da lista nominal', () => {
    expect(trecho).toMatch(/authorizeModule\('censo', 4\)/);
  });
});




describe('cruzarComKids · quem já está, quem sumiu e quantas faltam', () => {
  const HOJE = '2026-09-29';
  const criancas = [
    { nome: 'Ana', data_nascimento: '2022-10-01', ultimo_checkin: '2026-09-27' },
    { nome: 'Beto', data_nascimento: '2018-01-15', ultimo_checkin: '2026-05-01' },
  ];
  it('separa "no Kids" (check-in nos últimos 90 dias) de "cadastrada sem frequência"', () => {
    const k = cruzarComKids({ membro_id: 'm1', filhos_quantos: 3 }, criancas, HOJE);
    expect(k.vinculo).toBe('membro');
    expect(k.no_kids).toBe(1);
    expect(k.cadastradas_sem_frequencia).toBe(1);
    expect(k.cadastradas.map((c) => [c.nome, c.frequenta, c.idade])).toEqual([['Ana', true, 3], ['Beto', false, 8]]);
  });
  it('faltam = declarados − cadastradas, nunca negativo, e null sem declarado', () => {
    expect(cruzarComKids({ membro_id: 'm1', filhos_quantos: 3 }, criancas, HOJE).faltam).toBe(1);
    expect(cruzarComKids({ membro_id: 'm1', filhos_quantos: 1 }, criancas, HOJE).faltam).toBe(0);
    expect(cruzarComKids({ membro_id: 'm1', filhos_quantos: null }, criancas, HOJE).faltam).toBeNull();
  });
  it('⚠️ a janela é EXATAMENTE 90 dias; check-in no futuro não é frequência', () => {
    const noLimite = [{ nome: 'X', ultimo_checkin: '2026-07-01' }];
    expect(cruzarComKids({ membro_id: 'm1' }, noLimite, HOJE).no_kids).toBe(1);
    const foraPor1 = [{ nome: 'X', ultimo_checkin: '2026-06-30' }];
    expect(cruzarComKids({ membro_id: 'm1' }, foraPor1, HOJE).no_kids).toBe(0);
    expect(cruzarComKids({ membro_id: 'm1' }, [{ nome: 'X', ultimo_checkin: '2026-10-05' }], HOJE).no_kids).toBe(0);
    expect(DIAS_FREQUENCIA_KIDS).toBe(90);
  });
  it('sem membro resolvido não afirma nada — vínculo "sem_membro", listas vazias', () => {
    const k = cruzarComKids({ membro_id: null, filhos_quantos: 2 }, criancas, HOJE);
    expect(k).toMatchObject({ vinculo: 'sem_membro', cadastradas: [], no_kids: 0, faltam: null, declarados: 2 });
  });
  it('idade em anos completos, calculada em string (não em Date)', () => {
    const k = cruzarComKids({ membro_id: 'm1' }, [{ nome: 'A', data_nascimento: '2020-09-30' }, { nome: 'B', data_nascimento: '2020-09-29' }, { nome: 'C' }], HOJE);
    expect(k.cadastradas.map((c) => c.idade)).toEqual([5, 6, null]);
  });
});

describe('montarPotencial cruza SÓ quando a rota mandou o mapa, e resolve CPF sem membro', () => {
  const HOJE = '2026-09-29';
  const kids = new Map([
    ['m1', [{ nome: 'Ana', data_nascimento: '2022-10-01', ultimo_checkin: '2026-09-27' }]],
    ['m9', [{ nome: 'Zé', data_nascimento: '2019-01-01', ultimo_checkin: '2026-09-20' }]],
  ]);
  it('⚠️ "Não frequenta" com criança no Kids ganha o SELO discorda — continua na lista', () => {
    const r = montarPotencial([linha(pai({ filhos_frequentam: 'Não', filhos_quantos: 2 }))], undefined, { kids, hoje: HOJE });
    expect(r.kids_nao).toHaveLength(1);
    expect(r.kids_nao[0].kids).toMatchObject({ vinculo: 'membro', no_kids: 1, faltam: 1, discorda: true });
    expect(r.cruzamento_kids).toEqual({ nao_com_crianca_no_kids: 1, parcial_com_crianca_no_kids: 0, nao_discorda: 1, sem_membro: 0 });
  });
  it('"Parcialmente" com criança no Kids não é discordância', () => {
    const r = montarPotencial([linha(pai({ filhos_frequentam: 'Parcialmente' }))], undefined, { kids, hoje: HOJE });
    expect(r.kids_parcial[0].kids.discorda).toBe(false);
    expect(r.cruzamento_kids.parcial_com_crianca_no_kids).toBe(1);
  });
  it('resposta sem membro_id resolve pelo CPF do payload (quem ainda não passou pelo cron)', () => {
    const l = { id: 'r2', membro_id: null, payload: pai({ cpf: '123.456.789-09', filhos_frequentam: 'Parcialmente' }) };
    const r = montarPotencial([l], undefined, { kids, hoje: HOJE, membroPorCpf: new Map([['12345678909', 'm9']]) });
    expect(r.kids_parcial[0].kids).toMatchObject({ vinculo: 'membro', no_kids: 1 });
    expect(r.kids_parcial[0].kids.cadastradas[0].nome).toBe('Zé');
    const semCpf = montarPotencial([{ ...l, payload: pai({ filhos_frequentam: 'Parcialmente' }) }], undefined, { kids, hoje: HOJE });
    expect(semCpf.kids_parcial[0].kids.vinculo).toBe('sem_membro');
    expect(semCpf.cruzamento_kids.sem_membro).toBe(1);
  });
  it('sem o mapa (resumo nível 2 ou leitura falhou) nada é cruzado e cruzamento_kids é null', () => {
    const r = montarPotencial([linha(pai())]);
    expect(r.kids_nao[0].kids).toBeUndefined();
    expect(r.cruzamento_kids).toBeNull();
    expect(resumoPotencial([linha(pai())])).not.toHaveProperty('kids_nao');
  });
  it('quem não está numa lista do Kids não carrega dado de criança', () => {
    const r = montarPotencial([linha(pai({ filhos_faixas: ['18 a 25 anos'] }))], undefined, { kids, hoje: HOJE });
    expect(r.ami[0].kids).toBeUndefined();
  });
});

describe('Ainda não estão em grupo (02/10/2026)', () => {
  it('quem respondeu "Não" entra; "Sim" e ausência não', () => {
    expect(classificar(pai({ participa_grupo: 'Não' })).nao_grupo).toBe(true);
    expect(classificar(pai({ participa_grupo: 'Sim' })).nao_grupo).toBe(false);
    expect(classificar(pai()).nao_grupo, 'campo vazio não é "não participa"').toBe(false);
  });

  it('conta em familias_distintas como as outras listas de contato', () => {
    const r = montarPotencial([linha({ participa_grupo: 'Não' })]);
    expect(r.totais.nao_grupo).toBe(1);
    expect(r.familias_distintas).toBe(1);
  });
});

describe('⚠️⚠️ Sem contribuição registrada vem do CADASTRO, não do censo', () => {
  const base = [
    { id: 'r1', membro_id: 'm1', payload: pai() },
    { id: 'r2', membro_id: 'm2', payload: pai() },
    { id: 'r3', membro_id: null, payload: pai() },
  ];

  it('entra quem tem cadastro e não está entre os contribuintes', () => {
    const r = montarPotencial(base, null, { contribuintes: new Set(['m2']) });
    expect(r.sem_generosidade.map((p: { membro_id: string }) => p.membro_id)).toEqual(['m1']);
    expect(r.totais.sem_generosidade).toBe(1);
  });

  it('⚠️ quem respondeu sem cadastro é CONTADO à parte, nunca entra na lista', () => {
    const r = montarPotencial(base, null, { contribuintes: new Set() });
    expect(r.totais.sem_generosidade).toBe(2);
    expect(r.generosidade_sem_vinculo).toBe(1);
  });

  it('⚠️ sem leitura das contribuições o total é null — nunca "ninguém contribui"', () => {
    const r = montarPotencial(base, null, {});
    expect(r.totais.sem_generosidade).toBeNull();
    expect(r.generosidade_sem_vinculo).toBeNull();
    expect(r.sem_generosidade).toEqual([]);
  });

  it('⚠️ não infla familias_distintas — não é lista de ligação', () => {
    const r = montarPotencial([linha({ filhos_frequentam: 'Sim' })], null, { contribuintes: new Set() });
    expect(r.totais.sem_generosidade).toBe(1);
    expect(r.familias_distintas).toBe(0);
  });

  it('o resumo (nível 2) leva a contagem e nenhum nome', () => {
    const r = resumoPotencial(base, { contribuintes: new Set() });
    expect(r.totais.sem_generosidade).toBe(2);
    expect(JSON.stringify(r)).not.toMatch(/Fulano|2199999/);
  });
});
