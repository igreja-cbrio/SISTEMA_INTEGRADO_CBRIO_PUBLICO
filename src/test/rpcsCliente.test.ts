












import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { semComentariosJs } from './_semComentarios';

const require_ = createRequire(import.meta.url);
const {
  RPCS_CLIENTE,
  RPCS_FRONT_ERP,
  nomesRpcsCliente,
  grantsAuthenticatedNoSql,
  semComentariosSql,
} = require_('../../backend/utils/rpcsCliente.js');

const RAIZ = join(__dirname, '..', '..');

function todasAsMigrations(): string {
  const dir = join(RAIZ, 'supabase', 'migrations');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(join(dir, f), 'utf8'))
    .join('\n') + '\n' + readFileSync(join(__dirname, 'fixtures/schema-publico-contratos.sql'), 'utf8');
}




function rpcsChamadasNoFront(): Set<string> {
  const achados = new Set<string>();
  const exts = ['.js', '.jsx', '.ts', '.tsx'];
  const pilha = [join(RAIZ, 'src')];
  while (pilha.length) {
    const atual = pilha.pop()!;
    for (const ent of readdirSync(atual, { withFileTypes: true })) {
      const caminho = join(atual, ent.name);
      if (ent.isDirectory()) {

        if (ent.name !== 'test') pilha.push(caminho);
        continue;
      }
      if (!exts.some((e) => ent.name.endsWith(e))) continue;
      const src = semComentariosJs(readFileSync(caminho, 'utf8'));
      const re = /supabase\s*\.\s*rpc\(\s*['"]([a-z0-9_]+)['"]/gi;
      let m;
      while ((m = re.exec(src)) !== null) achados.add(m[1].toLowerCase());
    }
  }
  return achados;
}

describe('RPCs chamadas pelo cliente', () => {
  it('⚠️ toda RPC do inventário tem grant pra authenticated em migration', () => {
    const comGrant = grantsAuthenticatedNoSql(todasAsMigrations());
    const semGrant = nomesRpcsCliente().filter((n: string) => !comGrant.has(n));
    expect(
      semGrant,
      `RPC chamada pelo cliente SEM "grant execute ... to authenticated" em ` +
        `migration: ${semGrant.join(', ')}. Sem o grant a chamada devolve ` +
        `permission denied e o app engole o erro — tela vazia, nenhum log.`,
    ).toEqual([]);
  });

  it('⚠️ MUTANTE: o casador de grant não aceita grant só pra service_role', () => {

    const so = grantsAuthenticatedNoSql(
      'grant execute on function public.app_meu_qrcode() to service_role;',
    );
    expect(so.has('app_meu_qrcode')).toBe(false);
    const certo = grantsAuthenticatedNoSql(
      'grant execute on function public.app_meu_qrcode() to authenticated;',
    );
    expect(certo.has('app_meu_qrcode')).toBe(true);
  });

  it('grant a authenticated E service_role na mesma linha conta', () => {
    const s = grantsAuthenticatedNoSql(
      'GRANT EXECUTE ON FUNCTION public.x(uuid) TO authenticated, service_role;',
    );
    expect(s.has('x')).toBe(true);
  });

  it('⚠️ COMENTÁRIO não vale como grant (a lição de 06/08)', () => {


    const s = grantsAuthenticatedNoSql(
      '-- grant execute on function public.app_meu_qrcode() to authenticated;',
    );
    expect(s.size).toBe(0);
    expect(semComentariosSql('select 1; -- grant ... to authenticated')).not.toMatch(
      /authenticated/,
    );
  });

  it('toda chamada de supabase.rpc em src/ está no inventário', () => {
    const noCodigo = [...rpcsChamadasNoFront()];
    const inventariadas = new Set(RPCS_FRONT_ERP.map((r: { nome: string }) => r.nome));
    const fora = noCodigo.filter((n) => !inventariadas.has(n));
    expect(
      fora,
      `RPC chamada com a anon key no front e fora de RPCS_FRONT_ERP: ` +
        `${fora.join(', ')}. Acrescente no inventário e garanta o grant.`,
    ).toEqual([]);
  });

  it('⚠️ comentário de JS não conta como chamada (tropeço da 1ª versão)', () => {
    const fonte = [
      "// exemplo no comentário: supabase.rpc('fantasma')",
      '/* supabase.rpc("outro_fantasma") */',
      "await supabase.rpc('de_verdade');",
    ].join('\n');
    const limpo = semComentariosJs(fonte);
    expect(limpo).toMatch(/de_verdade/);
    expect(limpo).not.toMatch(/fantasma/);

    expect(semComentariosJs("const u = 'https://cbrio.org/x';")).toMatch(/cbrio\.org/);
  });

  it('o inventário não esconde RPC sem alvo amarrado ao auth.uid()', () => {


    for (const r of RPCS_CLIENTE) {
      expect(r.alvo, `${r.nome} precisa declarar o alvo`).toBe('auth.uid()');
      expect(r.assinatura).toMatch(/^public\.[a-z0-9_]+\(/);
      expect(r.tela.length).toBeGreaterThan(3);
    }
  });
});
