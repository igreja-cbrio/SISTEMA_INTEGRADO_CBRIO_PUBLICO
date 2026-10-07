import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { TABELAS_COM_MEMBRO, COLUNA_ALTERNATIVA } from '../../backend/services/fusaoVerificacao.js';




















const RAIZ = path.resolve(__dirname, '../../supabase/migrations');


const ehBackup = (t: string) => /^_bk_|^bkp_|_backup$/.test(t);






const NAO_E_VINCULO: Record<string, string> = {


  marketing_rotina_execucoes: 'membro_id referencia marketing_membros(id), não mem_membros',


  marketing_entrega_arquivos: 'membro_id referencia marketing_membros(id), não mem_membros',
};

function tabelasComMembroIdNasMigrations(): Set<string> {
  const achadas = new Set<string>();
  for (const arq of [...fs.readdirSync(RAIZ).filter((f) => f.endsWith('.sql')).map(f => path.join(RAIZ, f)), path.join(__dirname, 'fixtures/schema-publico-contratos.sql')]) {
    const sql = fs.readFileSync(arq, 'utf8');

    const criar = /CREATE TABLE (?:IF NOT EXISTS )?(?:public\.)?([a-z0-9_]+)\s*\(([\s\S]*?)\n\)\s*;/gi;
    let m: RegExpExecArray | null;
    while ((m = criar.exec(sql))) {
      if (/\bmembro_id\b/.test(m[2])) achadas.add(m[1]);
    }

    const alterar = /ALTER TABLE (?:ONLY )?(?:public\.)?([a-z0-9_]+)[^;]*?ADD COLUMN (?:IF NOT EXISTS )?membro_id/gi;
    while ((m = alterar.exec(sql))) achadas.add(m[1]);
  }
  return achadas;
}

describe('fusão de cadastros · nenhuma tabela fica de fora da conferência', () => {
  it('toda tabela com membro_id nas migrations está declarada', () => {
    const nasMigrations = [...tabelasComMembroIdNasMigrations()]
      .filter((t) => !ehBackup(t))
      .filter((t) => !NAO_E_VINCULO[t]);
    const declaradas = new Set<string>([
      ...TABELAS_COM_MEMBRO,
      ...Object.keys(COLUNA_ALTERNATIVA),
    ]);
    const faltando = nasMigrations.filter((t) => !declaradas.has(t)).sort();

    expect(faltando, faltando.length
      ? `Tabela(s) com \`membro_id\` fora de TABELAS_COM_MEMBRO em `
        + `backend/services/fusaoVerificacao.js: ${faltando.join(', ')}.\n`
        + `Acrescente lá — senão a fusão de cadastros pode deixar linha apontando `
        + `para um cadastro apagado, e a pessoa perde o vínculo sem ninguém ver.`
      : '').toEqual([]);
  });

  it('a lista declarada não tem nome inventado', () => {


    const nasMigrations = tabelasComMembroIdNasMigrations();
    const orfaosNaLista = TABELAS_COM_MEMBRO
      .filter((t) => !nasMigrations.has(t))


      .filter((t) => !['profiles'].includes(t));
    expect(orfaosNaLista, `na lista mas sem coluna membro_id nas migrations: ${orfaosNaLista.join(', ')}`)
      .toEqual([]);
  });

  it('a varredura acha as tabelas que já sabemos que existem', () => {


    const achadas = tabelasComMembroIdNasMigrations();
    for (const conhecida of ['cen_resposta', 'mem_contribuicoes', 'mem_contatos', 'batismo_inscricoes']) {
      expect(achadas.has(conhecida), `o varredor deixou de achar ${conhecida}`).toBe(true);
    }
    expect(achadas.size).toBeGreaterThan(40);
  });
});
