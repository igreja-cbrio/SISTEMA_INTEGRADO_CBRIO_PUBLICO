import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { semComentariosJs } from './_semComentarios';

























const RAIZ = resolve(__dirname, '..', '..');
const arq = (nome: string) => resolve(RAIZ, 'backend/routes', nome);

function carregar(nome: string) {
  const cru = readFileSync(arq(nome), 'utf8');
  return { cru, limpo: semComentariosJs(cru) };
}

const kpis = carregar('kpis.js');
const grupos = carregar('grupos.js');
const voluntariado = carregar('voluntariado.js');
const tasks = carregar('tasks.js');


function linhaDaRota(limpo: string, metodo: string, caminho: string): string | undefined {
  const alvo = `router.${metodo}('${caminho}'`;
  return limpo.split('\n').find((l) => l.includes(alvo));
}

describe('sanidade do limpador — asserção negativa sobre texto comido passa por vacuidade', () => {
  for (const [nome, f] of Object.entries({ kpis, grupos, voluntariado, tasks })) {
    it(`${nome}.js sobrevive a semComentariosJs`, () => {


      expect(f.limpo).toContain('router.');
      expect(f.limpo.replace(/\s+/g, ' ').length).toBeGreaterThan(500);
    });
  }
});











const LEITURAS_DE_PESSOA: Array<{ caminho: string; guard: string; porque: string }> = [
  {
    caminho: '/cultos/:id/decisoes-pessoas',
    guard: 'authorizeIntegracaoLeitura',
    porque: 'nome, CPF, data_nascimento e o responsável do menor de quem decidiu no culto',
  },
  {
    caminho: '/decisoes-pessoas/historico-importado',
    guard: 'authorizeIntegracaoLeitura',
    porque: 'CPF e nascimento de convertido importado',
  },
  {
    caminho: '/decisoes-pessoas/incompletos',
    guard: 'authorizeIntegracaoLeitura',
    porque: 'até 1.000 convertidos com CPF/nascimento',
  },
  {
    caminho: '/decisoes-pessoas/buscar-membro',
    guard: 'authorizeIntegracaoNominal',
    porque: 'resposta NOMINAL sobre a base inteira — régua de nível 2, como membresia/censo',
  },
  {
    caminho: '/batismos',
    guard: 'authorizeBatismoLeitura',
    porque: 'as inscrições de batismo com CPF, nascimento e possui_deficiencia',
  },
  {
    caminho: '/batismos/cobertura-convertidos',
    guard: 'authorizeBatismoLeitura',
    porque: 'nome e telefone de cada convertido ainda não batizado',
  },
];

describe('⚠️⚠️ A02 · kpis.js — leitura de pessoa exige módulo, não só login', () => {
  for (const r of LEITURAS_DE_PESSOA) {
    it(`GET ${r.caminho} passa por ${r.guard} — ${r.porque}`, () => {
      const linha = linhaDaRota(kpis.limpo, 'get', r.caminho);
      expect(linha, `GET ${r.caminho} sumiu de kpis.js — se foi renomeada, atualizar ESTE teste`).toBeTruthy();
      expect(linha, `GET ${r.caminho} ficou SEM gate — ${r.porque}`).toContain(r.guard);
    });
  }

  it('os três wrappers de leitura existem e apontam para as chaves decididas', () => {


    expect(kpis.limpo).toContain("authorizeModule('integracao', 1)");
    expect(kpis.limpo).toContain("authorizeModule('integracao', 2)");
    expect(kpis.limpo).toContain("authorizeModule('batismo-leitura', 1)");
    for (const w of ['authorizeIntegracaoLeitura', 'authorizeIntegracaoNominal', 'authorizeBatismoLeitura']) {
      expect(kpis.limpo, `wrapper ${w} não é mais declarado`).toMatch(new RegExp(`function\\s+${w}\\s*\\(`));
    }
  });

  it('⚠️ o wrapper SOMA com kpi_areas — sem isso o dono do dado toma 403 na lista', () => {


    expect(kpis.limpo).toMatch(/function\s+_porAreaKpi\s*\(/);
    expect(kpis.limpo).toContain('modulosBloqueados');
    for (const w of ['authorizeIntegracaoLeitura', 'authorizeIntegracaoNominal', 'authorizeBatismoLeitura']) {
      const i = kpis.limpo.indexOf(`function ${w}(`);
      expect(kpis.limpo.slice(i, i + 220), `${w} deixou de somar kpi_areas`).toContain('_porAreaKpi(req');
    }
  });

  it('⚠️ a trava é POR ROTA — kpis.js não ganhou router.use(authorizeModule)', () => {


    expect(kpis.limpo).not.toMatch(/router\.use\(\s*authorizeModule/);
  });
});

describe('⚠️⚠️ A02 · o buscador de membro não é mais oráculo de CPF', () => {

  const inicio = kpis.limpo.indexOf("router.get('/decisoes-pessoas/buscar-membro'");
  const resto = kpis.limpo.slice(inicio + 10);
  const fim = inicio + 10 + resto.search(/\nrouter\.(get|post|put|patch|delete)\(/);
  const bloco = kpis.limpo.slice(inicio, fim);

  it('o bloco da rota foi isolado (senão todo assert abaixo é vácuo)', () => {
    expect(inicio).toBeGreaterThan(-1);
    expect(fim).toBeGreaterThan(inicio);
    expect(bloco).toContain('mem_membros');
  });

  it('exige CPF COMPLETO — 11 dígitos, não prefixo de 5', () => {


    expect(bloco).toMatch(/cpfLimpo\.length\s*===\s*11/);
    expect(bloco, 'voltou a aceitar prefixo de CPF').not.toMatch(/cpfLimpo\.length\s*>=\s*\d/);
  });

  it('⚠️ a BUSCA não exige DV, a ESCRITA exige — é decisão, não esquecimento', () => {









    expect(bloco, 'a busca voltou a exigir DV — ver os 4 CPFs de DV inválido no legado')
      .not.toContain('cpfValido(cpfLimpo)');
    const iPost = kpis.limpo.indexOf("router.post('/cultos/:id/decisoes-pessoas'");
    expect(kpis.limpo.slice(iPost, iPost + 6000), 'a ESCRITA perdeu a validação de DV')
      .toMatch(/cpfLimpo\.length\s*!==\s*11\s*\|\|\s*!cpfValido\(cpfLimpo\)/);
  });

  it('o payload NÃO devolve cpf nem data_nascimento — só os 2 últimos dígitos', () => {


    expect(bloco).toContain('cpf_final');
    expect(bloco, 'data_nascimento voltou ao payload do buscador').not.toContain('data_nascimento');
    expect(bloco, 'o select do buscador voltou a puxar data_nascimento').not.toMatch(/select\([^)]*data_nascimento/);


    expect(bloco, 'o campo `cpf` voltou ao objeto de resposta').not.toMatch(/\n\s*cpf:\s/);
  });

  it('⚠️ a ESCRITA compensa o buscador mascarado — a decisão não nasce vazia', () => {



    const i = kpis.limpo.indexOf("router.post('/cultos/:id/decisoes-pessoas'");
    expect(i).toBeGreaterThan(-1);
    const bloco2 = kpis.limpo.slice(i, i + 6000);
    expect(bloco2).toMatch(/nascLimpo/);
    expect(bloco2).toMatch(/select\('cpf,\s*data_nascimento'\)/);
    expect(bloco2, 'a escrita perdeu o gate de Integração').toContain('authorizeIntegracao');
  });
});




const GRUPOS_PII: Array<{ caminho: string; guard: string; porque: string }> = [
  { caminho: '/buscar', guard: "authorizeModule('grupos', 1)", porque: 'busca livre de grupo/pessoa' },
  { caminho: '/lideres/buscar', guard: "authorizeModule('grupos', 1)", porque: 'busca nominal de líderes' },
  { caminho: '/pedidos/list', guard: "authorizeModule('grupos', 1)", porque: 'nome, e-mail e telefone de quem pediu para entrar' },
  { caminho: '/lideres-inscricoes/list', guard: "authorizeModule('grupos', 1)", porque: 'inscrições de líder com contato' },
  { caminho: '/:id/historico-membros', guard: "authorizeModule('grupos', 1)", porque: 'histórico de entrada e saída por pessoa' },
  { caminho: '/:id/entradas-saidas', guard: "authorizeModule('grupos', 1)", porque: 'quem entrou e quem saiu do grupo' },
  { caminho: '/:id/frequencia', guard: "authorizeModule('grupos', 1)", porque: 'presença nominal por encontro' },
  { caminho: '/pessoas/papeis', guard: "authorizeModule('grupos', 1)", porque: 'papel de cada pessoa na malha de grupos' },
  { caminho: '/pessoas/:membroId/frequencia', guard: "authorizeModule('grupos', 1)", porque: 'frequência de UMA pessoa' },
  { caminho: '/entrada/cobertura', guard: "authorizeModule('grupos', 1)", porque: 'cobertura nominal da porta de entrada' },

  { caminho: '/visitas/painel', guard: 'podeVerSupervisaoGrupos', porque: 'visitas de supervisão' },
  { caminho: '/:id/observacoes', guard: 'podeVerSupervisaoGrupos', porque: 'observação pastoral sobre o grupo' },
];

describe('⚠️ A03 · grupos.js — rotas de PII com gate de módulo', () => {
  for (const r of GRUPOS_PII) {
    it(`GET ${r.caminho} exige ${r.guard} — ${r.porque}`, () => {
      const linha = linhaDaRota(grupos.limpo, 'get', r.caminho);
      expect(linha, `GET ${r.caminho} sumiu de grupos.js`).toBeTruthy();
      expect(linha, `GET ${r.caminho} ficou SEM gate — ${r.porque}`).toContain(r.guard);
    });
  }

  it('⚠️ segue sem gate global — /meu e /supervisao/me são self-scoped', () => {

    expect(grupos.limpo).not.toMatch(/router\.use\(\s*authorizeModule/);
  });
});










const VOL_ESCRITAS: Array<[string, string]> = [
  ['post', '/services'],
  ['put', '/services/:id'],
  ['delete', '/services/:id'],
  ['post', '/teams-manage'],
  ['put', '/teams-manage/:id'],
  ['delete', '/teams-manage/:id'],
  ['post', '/positions'],
  ['put', '/positions/:id'],
  ['delete', '/positions/:id'],
  ['post', '/team-members'],
  ['delete', '/team-members/:id'],
  ['delete', '/schedules/:id'],
  ['post', '/schedules/bulk'],
  ['post', '/schedules/desfazer-lote'],
];

describe('⚠️⚠️ B08 · voluntariado.js — escrita estrutural tem gate PRÓPRIO na rota', () => {
  for (const [metodo, caminho] of VOL_ESCRITAS) {
    it(`${metodo.toUpperCase()} ${caminho} declara authorizeModule('voluntariado', …) na própria rota`, () => {
      const linha = linhaDaRota(voluntariado.limpo, metodo, caminho);
      expect(linha, `${metodo.toUpperCase()} ${caminho} sumiu de voluntariado.js`).toBeTruthy();
      expect(
        linha,
        `${metodo.toUpperCase()} ${caminho} herda o piso só por middleware de bloco — ` +
          'a trava é POR ROTA (lei da casa, jornada.js:52-55)',
      ).toMatch(/authorizeModule\('voluntariado',\s*[3-5]\)|authEscalaEscrita/);
    });
  }

  it('conceder e remover PAPEL exige voluntariado 5 — é autorização, não cadastro', () => {
    for (const [metodo, caminho] of [['post', '/roles'], ['delete', '/roles/:profileId/:role']] as const) {
      const linha = linhaDaRota(voluntariado.limpo, metodo, caminho);
      expect(linha, `${metodo.toUpperCase()} ${caminho} sumiu`).toBeTruthy();
      expect(linha).toContain("authorizeModule('voluntariado', 5)");
    }
  });

  it('⚠️⚠️ NÃO existe router.use condicional por MÉTODO — a trava é por rota', () => {




    const usos = voluntariado.limpo.match(/router\.use\(\s*(?:async\s*)?\(req[\s\S]{0,400}?\n\}\);/g) || [];
    const condicional = usos.filter((b) => /req\.method|req\.path/.test(b));
    expect(
      condicional,
      'voluntariado.js ainda tem router.use que decide o gate por método/caminho — ' +
        'trocar por authorizeModule em cada rota de escrita',
    ).toHaveLength(0);
    expect(voluntariado.limpo, 'a lista de exceções por regex ainda existe')
      .not.toContain('ESCRITA_COM_REGUA_PROPRIA');
  });

  it('o piso de LEITURA do arquivo continua membresia>=1 (agregado do /painel)', () => {
    expect(voluntariado.limpo).toContain("router.use(authenticate, authorizeModule('membresia', 1))");
  });
});



describe('⚠️⚠️ toda routeKey usada nos 4 arquivos existe no ROUTE_MODULE_MAP', () => {






  const auth = readFileSync(resolve(RAIZ, 'backend/middleware/auth.js'), 'utf8');
  const bloco = auth.match(/const\s+ROUTE_MODULE_MAP\s*=\s*\{([\s\S]*?)\n\};/);
  const mapa = semComentariosJs(bloco?.[1] || '');

  it('o ROUTE_MODULE_MAP foi encontrado e tem conteúdo', () => {
    expect(bloco, 'a forma do ROUTE_MODULE_MAP mudou — atualizar o recorte').toBeTruthy();
    expect(mapa).toMatch(/['"]membresia['"]\s*:/);
  });

  const arquivos: Array<[string, string]> = [
    ['kpis.js', kpis.limpo],
    ['grupos.js', grupos.limpo],
    ['voluntariado.js', voluntariado.limpo],
    ['tasks.js', tasks.limpo],
  ];

  for (const [nome, limpo] of arquivos) {
    it(`${nome} — nenhuma chave órfã`, () => {
      const chaves = [...limpo.matchAll(/authorizeModule\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const chave of [...new Set(chaves)]) {
        expect(
          mapa,
          `${nome} usa a routeKey '${chave}', que NÃO está no ROUTE_MODULE_MAP — ` +
            'authorizeModule cai no nível padrão do cargo e a matriz desliga em silêncio',
        ).toMatch(new RegExp(`['"]${chave.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]\\s*:`));
      }
    });
  }

  it("⚠️ nenhum dos 4 usa a routeKey ampla `membros` em escrita ou lista de PII", () => {


    for (const [nome, limpo] of arquivos) {
      expect(limpo, `${nome} passou a usar a chave ampla 'membros'`).not.toMatch(/authorizeModule\(\s*['"]membros['"]/);
    }
  });

  it("a chave nova `batismo-leitura` abre as DUAS portas (integracao e batismo)", () => {




    expect(mapa).toMatch(/['"]batismo-leitura['"]\s*:\s*\[[^\]]*'integracao'[^\]]*'batismo'[^\]]*\]/);
    expect(mapa, "o slug `batismo` ganhou entrada própria — isso muda a régua da ESCRITA")
      .not.toMatch(/\n\s*['"]batismo['"]\s*:/);
  });
});
