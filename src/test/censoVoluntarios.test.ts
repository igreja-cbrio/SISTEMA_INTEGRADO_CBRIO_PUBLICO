







import { describe, it, expect } from 'vitest';
import {
  montarVoluntariosSemCenso, mensagemConvite, linkPesquisa, chavesDeQuemRespondeu, cpfDe, SEM_AREA,
} from '../../backend/utils/censoVoluntarios.js';

const team = (id: string, name: string, area: string | null = 'Integração', is_active: boolean | null = true) =>
  ({ id, name, area, is_active });
const vinc = (over: Record<string, unknown> = {}) => ({
  id: `v-${Math.random()}`, team_id: 't1', volunteer_profile_id: 'p1', planning_center_person_id: null,
  volunteer_name: 'Ana', is_active: true, team: team('t1', 'Recepção'), ...over,
});
const perfil = (over: Record<string, unknown> = {}) => ({
  id: 'p1', full_name: 'Ana Souza', cpf: '12345678909', membresia_id: 'm1', arquivado: false, planning_center_id: null, ...over,
});
const LINK = 'https://www.cbrio.org/censo/p/censo-2026';

function monta(over: Record<string, unknown> = {}) {
  return montarVoluntariosSemCenso({
    vinculos: [vinc()],
    perfis: { p1: perfil() },
    membros: { m1: { id: 'm1', nome: 'Ana Souza', cpf: null } },
    contatos: { p1: { phone: '21999990000', telefone_fonte: 'cadastro', membro_id: 'm1' } },
    respostas: [],
    link: LINK,
    titulo: 'Censo 2026',
    nominal: true,
    ...over,
  });
}

describe('"respondeu" é a UNIÃO de membro_id e CPF', () => {
  it('ninguém respondeu ⇒ a pessoa falta', () => {
    const r = monta();
    expect(r.totais.sem_censo).toBe(1);
    expect(r.areas[0].equipes[0].pessoas[0].nome).toBe('Ana Souza');
  });

  it('respondeu pelo membro_id (pós-processada) ⇒ some da lista', () => {
    const r = monta({ respostas: [{ membro_id: 'm1', cpf: null }] });
    expect(r.totais.sem_censo).toBe(0);
    expect(r.totais.responderam).toBe(1);
    expect(r.areas[0].equipes[0].pessoas).toEqual([]);
  });

  it('⚠️ respondeu SÓ pelo CPF digitado (ainda na fila do cron) ⇒ também some', () => {
    const r = monta({ respostas: [{ membro_id: null, cpf: '123.456.789-09' }] });
    expect(r.totais.sem_censo, 'cobrar censo de quem respondeu no domingo queima quem liga').toBe(0);
  });

  it('o CPF pode estar só no MEMBRO vinculado, não no perfil', () => {
    const r = monta({
      perfis: { p1: perfil({ cpf: null }) },
      membros: { m1: { id: 'm1', nome: 'Ana Souza', cpf: '12345678909' } },
      respostas: [{ membro_id: null, cpf: '12345678909' }],
    });
    expect(r.totais.sem_censo).toBe(0);
  });

  it('CPF de outra pessoa não conta', () => {
    const r = monta({ respostas: [{ membro_id: 'm9', cpf: '11144477735' }] });
    expect(r.totais.sem_censo).toBe(1);
  });

  it('chavesDeQuemRespondeu ignora CPF fora de 11 dígitos e membro nulo', () => {
    const c = chavesDeQuemRespondeu([{ membro_id: null, cpf: '123' }, { membro_id: 'm1', cpf: null }, null as never]);
    expect([...c.membros]).toEqual(['m1']);
    expect(c.cpfs.size).toBe(0);
    expect(cpfDe('123.456.789-09')).toBe('12345678909');
    expect(cpfDe('1234')).toBeNull();
  });
});

describe('⚠️⚠️ a unidade é PESSOA, nunca vínculo', () => {
  it('quem serve em 3 equipes conta 1 vez no total e 1 vez em cada equipe', () => {
    const r = monta({
      vinculos: [
        vinc({ team_id: 't1', team: team('t1', 'Recepção') }),
        vinc({ team_id: 't2', team: team('t2', 'Ofertório') }),
        vinc({ team_id: 't3', team: team('t3', 'Chat', 'Online') }),
      ],
    });
    expect(r.totais.voluntarios).toBe(1);
    expect(r.totais.sem_censo).toBe(1);
    const integ = r.areas.find((a) => a.area === 'Integração')!;
    expect(integ.sem_censo).toBe(1);
    expect(integ.equipes.map((e) => e.nome)).toEqual(['Ofertório', 'Recepção']);
    const pessoa = integ.equipes[0].pessoas[0];
    expect(pessoa.equipes.sort()).toEqual(['Chat', 'Ofertório', 'Recepção']);
  });

  it('a MESMA equipe em duas linhas (duas funções) não duplica a pessoa', () => {
    const r = monta({ vinculos: [vinc(), vinc()] });
    expect(r.areas[0].equipes[0].total).toBe(1);
    expect(r.areas[0].equipes[0].pessoas).toHaveLength(1);
  });

  it('vínculo só-PCO resolve o perfil pelo planning_center_id', () => {
    const r = monta({
      vinculos: [vinc({ volunteer_profile_id: null, planning_center_person_id: '999' })],
      perfis: { p1: perfil({ planning_center_id: '999' }) },
      perfilPorPc: { '999': 'p1' },
      respostas: [{ membro_id: 'm1', cpf: null }],
    });
    expect(r.totais.sem_censo, 'sem resolver o PCO a pessoa seria cobrada tendo respondido').toBe(0);
  });

  it('vínculo sem perfil nenhum entra como pessoa própria com o nome do vínculo', () => {
    const r = monta({
      vinculos: [vinc({ volunteer_profile_id: null, planning_center_person_id: '777', volunteer_name: 'Beto' })],
      perfis: {},
    });
    expect(r.areas[0].equipes[0].pessoas[0].nome).toBe('Beto');
    expect(r.areas[0].equipes[0].pessoas[0].telefone).toBeNull();
  });
});

describe('equipe e perfil aposentados ficam de fora', () => {
  it('equipe com is_active === false não entra (e é DECLARADA)', () => {
    const r = monta({ vinculos: [vinc({ team: team('t1', 'Vocal', 'Louvor', false) })] });
    expect(r.totais.voluntarios).toBe(0);
    expect(r.totais.vinculos_sem_equipe_ativa).toBe(1);
  });

  it('⚠️ equipe com is_active NULO (legada) ENTRA — nulo não é aposentada', () => {
    const r = monta({ vinculos: [vinc({ team: team('t1', 'Vocal', 'Louvor', null) })] });
    expect(r.totais.voluntarios).toBe(1);
  });

  it('perfil arquivado não entra', () => {
    const r = monta({ perfis: { p1: perfil({ arquivado: true }) } });
    expect(r.totais.voluntarios).toBe(0);
  });

  it('vínculo is_active false não entra', () => {
    const r = monta({ vinculos: [vinc({ is_active: false })] });
    expect(r.totais.voluntarios).toBe(0);
  });
});

describe('área e ordenação', () => {
  it('equipe sem área cai em "Sem área", no FIM da lista', () => {
    const r = monta({
      vinculos: [
        vinc({ team_id: 't1', team: team('t1', 'Zulu', null) }),
        vinc({ team_id: 't2', team: team('t2', 'Alfa', 'Produção') }),
      ],
    });
    expect(r.areas.map((a) => a.area)).toEqual(['Produção', SEM_AREA]);
  });

  it('área com espaço em volta é a mesma área', () => {
    const r = monta({
      vinculos: [
        vinc({ team_id: 't1', team: team('t1', 'A', ' KIDS ') }),
        vinc({ team_id: 't2', team: team('t2', 'B', 'KIDS') }),
      ],
    });
    expect(r.areas).toHaveLength(1);
  });

  it('sem_telefone conta só entre quem FALTA', () => {
    const r = monta({ contatos: {} });
    expect(r.totais.sem_telefone).toBe(1);
    const r2 = monta({ contatos: {}, respostas: [{ membro_id: 'm1', cpf: null }] });
    expect(r2.totais.sem_telefone).toBe(0);
  });
});

describe('a mensagem pré-definida', () => {
  it('leva o primeiro nome, o título e o link GENÉRICO da pesquisa', () => {
    const m = mensagemConvite({ nome: 'ana SOUZA', link: LINK, titulo: 'Censo 2026' });
    expect(m).toContain('Oi, Ana!');
    expect(m).toContain('Censo 2026');
    expect(m).toContain(LINK);
    expect(m).not.toContain('?censo=1');
    expect(m).not.toContain('t=');
  });

  it('sem nome cai no "Olá!" — nunca "Oi, !"', () => {
    expect(mensagemConvite({ nome: '', link: LINK })).toContain('Olá!');
    expect(mensagemConvite({ nome: null, link: LINK })).not.toContain('Oi, ');
  });

  it('⚠️ sem link NÃO há mensagem', () => {
    expect(mensagemConvite({ nome: 'Ana', link: null })).toBeNull();
    const r = monta({ link: null });
    expect(r.areas[0].equipes[0].pessoas[0].mensagem).toBeNull();
  });

  it('linkPesquisa monta /censo/p/<slug> e recusa sem base ou sem slug', () => {
    expect(linkPesquisa('https://www.cbrio.org/', 'censo-2026')).toBe(LINK);
    expect(linkPesquisa('', 'x')).toBeNull();
    expect(linkPesquisa('https://www.cbrio.org', '')).toBeNull();
  });

  it('a mensagem sai por pessoa, já preenchida', () => {
    const r = monta();
    expect(r.areas[0].equipes[0].pessoas[0].mensagem).toContain('Oi, Ana!');
  });
});

describe('⚠️⚠️ nível 2 (nominal=false) não recebe nome nem telefone', () => {
  it('as contagens vêm, a lista de pessoas fica vazia', () => {
    const r = monta({ nominal: false });
    expect(r.nominal).toBe(false);
    expect(r.totais.sem_censo).toBe(1);
    expect(r.areas[0].sem_censo).toBe(1);
    expect(r.areas[0].equipes[0].sem_censo).toBe(1);
    expect(r.areas[0].equipes[0].pessoas).toEqual([]);
    expect(JSON.stringify(r)).not.toContain('21999990000');
    expect(JSON.stringify(r)).not.toContain('Ana Souza');
  });
});
