



















import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { semComentariosJs } from './_semComentarios';
import { nivelGuardNext, METODOS_ESCRITA, ROUTE_KEY } from '../../backend/utils/nextGuardNivel';

const RAIZ = join(__dirname, '..', '..');
const ROTA_NEXT = join(RAIZ, 'backend', 'routes', 'next.js');
const AUTH = join(RAIZ, 'backend', 'middleware', 'auth.js');

const fonteRota = semComentariosJs(readFileSync(ROTA_NEXT, 'utf8'));
const fonteAuth = semComentariosJs(readFileSync(AUTH, 'utf8'));

describe('régua de nível do guard do Next', () => {
  it('leitura (GET/HEAD) pede nível 1', () => {
    expect(nivelGuardNext('GET')).toBe(1);
    expect(nivelGuardNext('HEAD')).toBe(1);
  });

  it('toda escrita pede nível 2', () => {
    for (const m of METODOS_ESCRITA) expect(nivelGuardNext(m)).toBe(2);
  });

  it('DELETE fica em 2, não em 3', () => {



    expect(nivelGuardNext('DELETE')).toBe(2);
  });

  it('método desconhecido/vazio cai na leitura (fail-closed no nível mais alto que existe)', () => {
    expect(nivelGuardNext('')).toBe(1);
    expect(nivelGuardNext(undefined as unknown as string)).toBe(1);
  });

  it('minúsculo é tratado igual (Express normaliza, mas a régua não confia)', () => {
    expect(nivelGuardNext('post')).toBe(2);
    expect(nivelGuardNext('get')).toBe(1);
  });
});

describe('montagem do guard em backend/routes/next.js', () => {
  it('o router pendura authenticate E o guard de módulo', () => {
    expect(fonteRota).toContain('router.use(authenticate)');
    expect(fonteRota).toMatch(/authorizeModule\(NEXT_ROUTE_KEY,\s*1\)/);
    expect(fonteRota).toMatch(/authorizeModule\(NEXT_ROUTE_KEY,\s*2\)/);
  });

  it('o guard usa a régua pura, não um if solto na rota', () => {
    expect(fonteRota).toContain('nivelGuardNext(req.method)');
  });
});

describe('ROUTE_MODULE_MAP', () => {
  it('o routeKey do Next aceita `next` E `integracao`', () => {



    expect(ROUTE_KEY).toBe('next-gestao');
    const linha = fonteAuth.split('\n').find(l => l.includes(`'${ROUTE_KEY}'`));
    expect(linha, `routeKey '${ROUTE_KEY}' ausente do ROUTE_MODULE_MAP`).toBeTruthy();
    expect(linha).toContain("'next'");
    expect(linha).toContain("'integracao'");
  });

  it('`batismo` NÃO entra — quem só tem batismo nem renderiza a aba Next', () => {
    const linha = fonteAuth.split('\n').find(l => l.includes(`'${ROUTE_KEY}'`))!;
    expect(linha).not.toContain("'batismo'");
  });
});
