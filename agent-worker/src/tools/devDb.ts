import fs from "node:fs";
import path from "node:path";
import pg from "pg";








const DATABASE_URL = process.env.DATABASE_URL || "";




export function listarMigrationsNovas(ws: string, stdout: string): string[] {
  return stdout
    .split("\0")
    .filter(Boolean)
    .filter((f) => /^supabase\/migrations\/.+\.sql$/.test(f) && fs.existsSync(path.join(ws, f)));
}

export async function aplicarMigrations(ws: string, arquivos: string[]): Promise<string[]> {
  if (!DATABASE_URL) {
    throw new Error(
      "DATABASE_URL ausente no worker — não é possível aplicar migrations de produção. " +
        "Configure DATABASE_URL no Railway (com permissão de escrita) e rode a tarefa de novo."
    );
  }
  if (!arquivos.length) return [];

  const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const aplicadas: string[] = [];
  try {
    await client.connect();
    for (const rel of arquivos) {
      const sql = fs.readFileSync(path.join(ws, rel), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("COMMIT");
        aplicadas.push(rel);
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    }
  } finally {
    await client.end().catch(() => undefined);
  }
  return aplicadas;
}
