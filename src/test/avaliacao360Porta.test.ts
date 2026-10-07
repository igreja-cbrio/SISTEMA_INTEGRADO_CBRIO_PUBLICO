













import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const raiz = resolve(__dirname, '../..');
const ler = (p: string) => readFileSync(resolve(raiz, p), 'utf8');




function semComentarios(src: string): string {
  return src
    .split('\n')
    .map((l) => l.replace(/(^|[^:])\/\/[^\n]*$/, '$1'))
    .filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
    .join('\n');
}

const rota = semComentarios(ler('backend/routes/avaliacao360.js'));
const servico = semComentarios(ler('backend/services/avaliacao360.js'));
const server = semComentarios(ler('backend/server.js'));
const sql = ler('supabase/migrations/20260926160000_avaliacao360_resposta_atomica.sql');

describe('⚠️⚠️ a porta fica FORA do gate do RH', () => {
  it('o router.use NÃO tem authorizeModule', () => {
    const useRouter = rota.match(/router\.use\([^)]*\)/g) || [];
    expect(useRouter.length).toBeGreaterThan(0);
    for (const u of useRouter) {
      expect(u).not.toContain('authorizeModule');
    }
  });

  it('o router.use exige login E ser colaborador', () => {


    expect(rota).toMatch(/router\.use\(\s*authenticate\s*,\s*apenasColaborador\s*\)/);
  });

  it('⚠️ a rota é montada fora de /api/rh', () => {
    expect(server).toContain("app.use('/api/avaliacao360', require('./routes/avaliacao360'))");

    expect(server).not.toMatch(/app\.use\('\/api\/rh\/[^']*avaliacao360/);
  });
});

describe('⚠️ administração do ciclo é gated POR ROTA', () => {
  const adminRotas = ['/ciclos', '/ciclos/:id', '/ciclos/:id/sugerir', '/ciclos/:id/avaliadores',
    '/ciclos/:id/status', '/ciclos/:id/perguntas', '/ciclos/:id/pessoa/:avaliadoId',
    '/ciclos/:id/avaliados/:avaliadoId', '/ciclos/:id/avaliados/:avaliadoId/remover', '/ciclos/:id/adesao', '/competencias', '/competencias/:id'];

  it('toda rota de administração exige rh nível 3', () => {
    for (const caminho of adminRotas) {
      const re = new RegExp(`router\\.(get|post|patch|put|delete)\\('${caminho.replace(/[/:]/g, '\\$&')}'\\s*,\\s*authorizeModule\\('rh',\\s*3\\)`);
      expect(rota, `${caminho} sem authorizeModule('rh', 3)`).toMatch(re);
    }
  });

  it('⚠️ as rotas do COLABORADOR não podem ser gated por módulo', () => {

    for (const caminho of ['/minhas', '/convite/:id']) {
      const re = new RegExp(`router\\.get\\('${caminho.replace(/[/:]/g, '\\$&')}'\\s*,\\s*authorizeModule`);
      expect(rota, `${caminho} NÃO pode ter authorizeModule`).not.toMatch(re);
    }
    expect(rota).not.toMatch(/router\.post\('\/convite\/:id\/responder',\s*authorizeModule/);
  });
});

describe('⚠️⚠️ quem a pessoa é sai do LOGIN, nunca do corpo', () => {
  it('as rotas do colaborador resolvem pelo login', () => {

    expect(rota).toContain('comFuncionario(req, res)');
    expect(servico).toMatch(/req\?\.user\?\.email/);
  });

  it('⚠️ responder confere que o convite é DESTE login', () => {


    const bloco = rota.slice(rota.indexOf("router.post('/convite/:id/responder'"));
    expect(bloco).toContain('p_avaliador_id: eu.id');
    expect(sql).toContain('avaliador_id = p_avaliador_id');
  });

  it('⚠️ nenhuma rota do colaborador aceita funcionario_id do corpo', () => {

    expect(rota).not.toMatch(/req\.body[^\n]*funcionario_id/);
    expect(rota).not.toMatch(/req\.body[^\n]*avaliador_id/);
    expect(rota).not.toMatch(/req\.body[^\n]*avaliado_id/);
  });
});

describe('⚠️ a identidade não vaza para a resposta', () => {
  it('o INSERT em rh_aval360_resposta NÃO grava avaliador_id', () => {



    const i = sql.indexOf('INSERT INTO rh_aval360_resposta(');
    expect(i).toBeGreaterThan(-1);
    const bloco = sql.slice(i, sql.indexOf('RETURNING id', i));
    expect(bloco).toContain('convite_id');
    expect(bloco).not.toContain('avaliador_id');
  });
});

describe('⚠️ quem avalia quem é do RH, pela hierarquia do banco (28/09)', () => {
  const ciclo = ler('supabase/migrations/20260928150000_avaliacao360_ciclo.sql');
  it('o serviço não calcula convite: a régua vive em fn_aval360_hierarquia()', () => {
    expect(servico).not.toMatch(/rh_aval360_convite/);
    expect(ciclo).toContain('CREATE OR REPLACE FUNCTION public.fn_aval360_hierarquia()');
  });
  it('⚠️ par = mesmo gestor, e liderado avalia o gestor', () => {
    expect(ciclo).toMatch(/ON b\.gestor_id = a\.gestor_id AND b\.id <> a\.id/);
    expect(ciclo).toMatch(/SELECT g\.id, f\.id, 'liderado'/);
  });
  it('⚠️ abaixo do piso é suprimido COM MOTIVO ao enviar, antes de alguém preencher', () => {
    expect(ciclo).toContain("suprimido_motivo = 'abaixo_do_piso'");
  });
  it('⚠️ não existe rota do colaborador para indicar ou aprovar par', () => {
    expect(rota).not.toMatch(/router\.(get|post)\('\/pares/);
    expect(rota).not.toMatch(/fn_aval360_indicar_pares|fn_aval360_decidir_par/);
  });
});
