











import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(__dirname, '../..');
const semComentarios = (s: string) =>
  s.split('\n').map((l) => l.replace(/(^|[^:])\/\/[^\n]*/, '$1')).join('\n');

const rota = semComentarios(readFileSync(path.join(raiz, 'backend/routes/totemKids.js'), 'utf8'));










const migration = readFileSync(
  path.join(raiz, 'supabase/migrations/20260902200000_kids_codigos_reservados.sql'), 'utf8')
  .split('\n').map((l) => l.replace(/--.*/, '')).join('\n');

describe('⚠️⚠️ código já IMPRESSO é imutável', () => {
  it('o retry NÃO roda quando o código veio de reserva', () => {


    expect(rota).toContain('const maxTentativas = reservaOk ? 1 : 5');
    expect(rota).toContain('codigoFinal = reservaOk ? codigoReservado : await gerarCodigo()');
  });

  it('colisão em código reservado vira EXCEÇÃO PARA HUMANO, nunca troca silenciosa', () => {
    expect(rota).toMatch(/if \(reservaOk\)[\s\S]{0,400}codigo_conflito: true/);
    expect(rota).toMatch(/N[ÃA]O reimprima/i);
  });

  it('⚠️ código que o cliente inventou é RECUSADO — a reserva tem que existir', () => {

    expect(rota).toContain("from('kids_codigos_reservados')");
    expect(rota).toMatch(/reservaOk = !!r && r\.status === 'reservado'/);
    expect(rota).toContain('codigo_invalido: true');
  });
});

describe('⚠️⚠️ o gerador ONLINE enxerga as reservas', () => {
  it('senão sortearia um código que já está IMPRESSO em papel', () => {


    expect(migration).toContain('FROM public.kids_codigos_reservados r');
    expect(migration).toMatch(/WHERE r\.codigo = v_codigo\s*\n\s*AND r\.status = 'reservado'/);
  });

  it('⚠️ usa v_codigo, nunca `codigo` (42702 quebraria TODO check-in)', () => {



    expect(migration).toContain('v_codigo text;');
    expect(migration).not.toMatch(/WHERE r\.codigo = codigo\b/);
  });
});

describe('⚠️ a reserva não vaza pela chave pública', () => {
  it('só service_role executa a função de reservar', () => {
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.fn_kids_reservar_codigos[^;]*FROM public, anon, authenticated/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.fn_kids_reservar_codigos[^;]*TO service_role/);
  });

  it('a tabela tem RLS e NENHUMA policy para authenticated', () => {


    expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
    expect(migration).toMatch(/FOR ALL TO service_role/);
    expect(migration).not.toMatch(/TO authenticated/);
  });
});
