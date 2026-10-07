


























import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FONTE = readFileSync(
  join(__dirname, '..', '..', 'agent-worker/src/tools/voluntariadoRead.ts'), 'utf8',
);
const trecho = FONTE.slice(FONTE.indexOf('listarVoluntariosInativos'));

describe('⚠️⚠️ o filtro de inativos casa pelo MEMBRO, não por ids de tabelas diferentes', () => {
  it('traduz vol_profiles → membro_id antes de comparar', () => {
    expect(trecho, 'sem a tradução, o Set nunca casa e todo mundo vira inativo')
      .toMatch(/from\("vol_profiles"\)[\s\S]{0,120}select\("id, membresia_id"\)/);
    expect(trecho).toMatch(/membrosAtivos\.add\(p\.membresia_id\)/);
  });

  it('⚠️ o filtro compara `v.membro_id`, NUNCA `v.id`', () => {
    expect(trecho).toMatch(/!membrosAtivos\.has\(v\.membro_id\)/);
    expect(
      trecho.replace(/\/\/[^\n]*/g, ''),
      'comparar mem_voluntarios.id contra vol_profiles.id foi o bug',
    ).not.toMatch(/idsAtivos\.has\(v\.id\)/);
  });
});

describe('⚠️ o item carrega o check-in REAL, para o modelo não inventar', () => {
  it('devolve ultimo_checkin e dias_desde_ultimo_checkin', () => {
    expect(trecho).toMatch(/ultimo_checkin:/);
    expect(trecho).toMatch(/dias_desde_ultimo_checkin:/);
    expect(trecho).toMatch(/total_checkins:/);
  });

  it('⚠️⚠️ avisa que `desde` é data de CADASTRO — a confusão que gerou "158 dias"', () => {
    expect(trecho).toMatch(/desde` e a data de CADASTRO/);
  });

  it('⚠️⚠️ e que `ultimo_checkin: null` NÃO é "nunca serviu"', () => {
    expect(
      trecho,
      'as duas réguas da casa proíbem afirmar isso a partir de uma janela',
    ).toMatch(/NUNCA 'nunca serviu'/);
  });

  it('marca quem não tem perfil de escala, em vez de acusá-lo', () => {
    expect(trecho).toMatch(/sem_perfil_de_escala/);
  });
});
