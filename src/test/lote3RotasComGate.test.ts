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

const governanca = carregar('governanca.js');
const logistica = carregar('logistica.js');
const rh = carregar('rh.js');


function linhaDaRota(limpo: string, metodo: string, caminho: string): string | undefined {
  const alvo = `router.${metodo}('${caminho}'`;
  return limpo.split('\n').find((l) => l.includes(alvo));
}


function corpoDaFuncao(limpo: string, nome: string): string {
  const i = limpo.search(new RegExp(`function\\s+${nome}\\s*\\(`));
  if (i < 0) return '';
  const abre = limpo.indexOf('{', i);
  if (abre < 0) return '';
  let nivel = 0;
  for (let k = abre; k < limpo.length; k++) {
    if (limpo[k] === '{') nivel++;
    else if (limpo[k] === '}') {
      nivel--;
      if (nivel === 0) return limpo.slice(i, k + 1);
    }
  }
  return limpo.slice(i);
}

describe('sanidade do limpador — asserção negativa sobre texto comido passa por vacuidade', () => {
  for (const [nome, f] of Object.entries({ governanca, logistica, rh })) {
    it(`${nome}.js sobrevive a semComentariosJs`, () => {


      expect(f.limpo).toContain('router.');
      expect(f.limpo.replace(/\s+/g, ' ').length).toBeGreaterThan(500);
    });
  }
});



describe('⚠️⚠️ A05 · governanca.js — relatório e catálogo exigem o módulo, não só login', () => {
  it('os apelidos `rd`/`wr` apontam para governanca 1 (ler) e 3 (escrever)', () => {


    expect(governanca.limpo).toMatch(/const\s+rd\s*=\s*authorizeModule\('governanca',\s*1\)/);
    expect(governanca.limpo).toMatch(/const\s+wr\s*=\s*authorizeModule\('governanca',\s*3\)/);
  });

  it('⚠️ `rd`/`wr` são declarados ANTES da primeira rota que os usa (TDZ derruba o router)', () => {




    const decl = governanca.limpo.search(/const\s+rd\s*=\s*authorizeModule/);
    const primeiroUso = governanca.limpo.indexOf("router.get('/tipos'");
    expect(decl, 'a declaração de `rd` sumiu').toBeGreaterThan(-1);
    expect(primeiroUso, "GET /tipos sumiu de governanca.js").toBeGreaterThan(-1);
    expect(decl, '`rd` voltou a ser declarado DEPOIS da primeira rota que o usa — TDZ').toBeLessThan(primeiroUso);
    expect(
      (governanca.limpo.match(/const\s+rd\s*=\s*authorizeModule/g) || []).length,
      'existe MAIS DE UMA declaração de `rd` — a de baixo sombreia a de cima',
    ).toBe(1);
  });

  const GOV_ROTAS: Array<{ metodo: string; caminho: string; guard: string; porque: string }> = [
    {
      metodo: 'get',
      caminho: '/tipos',
      guard: 'rd',
      porque: 'catálogo das reuniões de governança — serve só a tela, que já exige nível 1',
    },
    {
      metodo: 'get',
      caminho: '/relatorio/:sigla',
      guard: 'rd',
      porque:
        'devolvia o DRE do mês (fin_contas, fin_transacoes, fin_contas_pagar, fin_reembolsos), ' +
        'OKRs, metas e orçamento de evento pra QUALQUER token válido',
    },
    {
      metodo: 'post',
      caminho: '/relatorio/:sigla/observacoes',
      guard: 'wr',
      porque: 'cria ciclo/reunião e grava observação da diretoria — mesma régua do botão de salvar (>= 3)',
    },
  ];

  for (const r of GOV_ROTAS) {
    it(`${r.metodo.toUpperCase()} ${r.caminho} passa por \`${r.guard}\` — ${r.porque}`, () => {
      const linha = linhaDaRota(governanca.limpo, r.metodo, r.caminho);
      expect(linha, `${r.metodo.toUpperCase()} ${r.caminho} sumiu de governanca.js — se foi renomeada, atualizar ESTE teste`).toBeTruthy();
      expect(linha, `${r.metodo.toUpperCase()} ${r.caminho} ficou SEM gate — ${r.porque}`)
        .toMatch(new RegExp(`,\\s*${r.guard}\\s*,`));
    });
  }

  it('⚠️⚠️ as rotas /cron/* continuam SEM guard de módulo — elas entram por SEGREDO', () => {




    const crons = governanca.limpo
      .split('\n')
      .filter((l) => /^router\.(get|post|put|patch|delete)\('\/cron\//.test(l));
    expect(crons.length, 'as rotas /cron/* sumiram de governanca.js').toBeGreaterThanOrEqual(2);
    for (const linha of crons) {
      expect(linha, `rota de cron ganhou guard de módulo (vai tomar 401 — não há req.user): ${linha.trim()}`)
        .not.toMatch(/,\s*(rd|wr|authorizeModule\()/);
    }

    expect(governanca.limpo).toContain("req.path.startsWith('/cron/')");
    expect(governanca.limpo, 'o skip do cron deixou de exigir o segredo — virou porta aberta')
      .toContain('isAuthorizedCron(req)');
  });

  it('⚠️ a trava é POR ROTA — governanca.js não ganhou router.use(authorizeModule)', () => {

    expect(governanca.limpo).not.toMatch(/router\.use\(\s*authorizeModule/);
  });
});




const LOG_ESCRITA_3: Array<[string, string]> = [
  ['post', '/fornecedores'],
  ['put', '/fornecedores/:id'],
  ['post', '/fornecedores/enriquecer-incompletos'],
  ['post', '/fornecedores/:id/enriquecer'],
  ['post', '/pedidos'],
  ['put', '/pedidos/:id'],
  ['post', '/pedidos/:id/recebimento'],
  ['post', '/pedidos/:id/itens'],
  ['post', '/notas/escanear'],
  ['post', '/notas/importar-xml'],
  ['post', '/notas/importar-danfe'],
  ['post', '/notas'],
  ['put', '/notas/:id'],
  ['post', '/compras'],
  ['put', '/compras/:id'],
  ['post', '/compras/escanear'],
  ['post', '/compras/:id/vincular'],
  ['post', '/compras/:id/desvincular'],
  ['post', '/estoque/produtos'],
  ['patch', '/estoque/produtos/:id'],
  ['delete', '/estoque/produtos/:id'],
  ['post', '/estoque/movimentacoes'],
  ['post', '/estoque/gerar-compra'],
];


const LOG_APROVACAO_4: Array<[string, string, string]> = [
  ['post', '/compras/:id/aprovar', 'aprovar compra é o controle financeiro do módulo'],
  ['post', '/compras/:id/rejeitar', 'o outro lado da aprovação'],
  ['post', '/compras/importar', 'inserção em MASSA no ledger, chaveada por hash, que ninguém desfaz linha a linha'],
  ['post', '/notas/:id/enviar-financeiro', 'manda a nota pro financeiro LANÇAR (dinheiro saindo)'],
  ['delete', '/notas/:id', 'DELETE duro da COMPROVAÇÃO fiscal, sem trilha'],
  ['delete', '/fornecedores/:id', 'DELETE duro do cadastro que lastreia a nota, sem trilha'],
  ['delete', '/pedidos/:id', 'DELETE duro de registro operacional'],
  ['delete', '/itens/:id', 'linha do pedido — não adianta blindar o pai e deixar as linhas abertas'],
  ['delete', '/compras/:id', 'soft-delete COM trilha (app_soft_delete)'],
];

describe('⚠️ RHP-02 · logistica.js — escrita com gate PRÓPRIO na rota', () => {
  for (const [metodo, caminho] of LOG_ESCRITA_3) {
    it(`${metodo.toUpperCase()} ${caminho} exige logistica >= 3`, () => {
      const linha = linhaDaRota(logistica.limpo, metodo, caminho);
      expect(linha, `${metodo.toUpperCase()} ${caminho} sumiu de logistica.js`).toBeTruthy();
      expect(
        linha,
        `${metodo.toUpperCase()} ${caminho} herda só o piso 2 do router.use — a trava é POR ROTA (lei da casa, jornada.js:52-55)`,
      ).toContain("authorizeModule('logistica', 3)");
    });
  }

  for (const [metodo, caminho, porque] of LOG_APROVACAO_4) {
    it(`${metodo.toUpperCase()} ${caminho} exige logistica >= 4 — ${porque}`, () => {
      const linha = linhaDaRota(logistica.limpo, metodo, caminho);
      expect(linha, `${metodo.toUpperCase()} ${caminho} sumiu de logistica.js`).toBeTruthy();
      expect(linha, `${metodo.toUpperCase()} ${caminho} caiu de nível — ${porque}`)
        .toContain("authorizeModule('logistica', 4)");
    });
  }

  it('⚠️⚠️ NENHUMA rota do arquivo pede nível 5 — ninguém que OPERA logística tem 5', () => {





    const linhas5 = logistica.limpo
      .split('\n')
      .map((l, i) => [i + 1, l] as const)
      .filter(([, l]) => /authorizeModule\('logistica',\s*5\)/.test(l));
    expect(
      linhas5.map(([n, l]) => `L${n}: ${l.trim()}`),
      'rota de logística pedindo nível 5 — ninguém que opera o módulo alcança esse nível',
    ).toEqual([]);
  });

  it('o piso do arquivo continua sendo o router.use de nível 2 (entrar no módulo)', () => {
    expect(logistica.limpo).toContain("router.use(authenticate, authorizeModule('logistica'))");
  });

  it('⚠️ segregação de funções: quem registrou a compra não aprova a própria', () => {


    const i = logistica.limpo.indexOf("router.post('/compras/:id/aprovar'");
    expect(i).toBeGreaterThan(-1);



    const bloco = logistica.limpo.slice(i, i + 2600);
    expect(bloco, 'a trava de auto-aprovação sumiu').toMatch(/created_by\s*===\s*req\.user\.userId/);
    expect(bloco).toContain('403');


    expect(bloco, 'a isenção da planilha sumiu — o importador não consegue aprovar o que importou')
      .toMatch(/origem_registro\s*!==\s*'planilha'/);
  });

  it('⚠️⚠️ POST /compras NUNCA nasce `aprovada` — o corpo não decide isso', () => {




    const i = logistica.limpo.indexOf("router.post('/compras'");
    expect(i).toBeGreaterThan(-1);
    const bloco = logistica.limpo.slice(i, i + 1500);
    expect(bloco, 'o POST perdeu a fixação de `pendente`')
      .toMatch(/payload\.status_aprovacao\s*=\s*'pendente'\s*;/);
    expect(bloco, "o corpo da requisição voltou a decidir o `status_aprovacao`")
      .not.toMatch(/req\.body\s*(\?\.|\[)?\s*\??\.?status_aprovacao/);
    expect(bloco, 'o POST voltou a poder gravar `aprovada`').not.toContain("'aprovada'");
    expect(bloco, 'o registro manual deixou de carimbar quem criou (base da segregação)')
      .toMatch(/created_by\s*=\s*req\.user\.userId/);
  });
});



describe('⚠️⚠️ RHP-03 · rh.js — a redação de CPF/salário existe e usa o nível do MÓDULO', () => {
  it('as três respostas de funcionário passam pela redação', () => {



    const chamadas = (rh.limpo.match(/ocultarConfidenciaisRh\(req,/g) || []).length;
    expect(chamadas, 'a redação foi removida de alguma resposta (lista, ficha ou PUT)').toBeGreaterThanOrEqual(3);
    expect(rh.limpo, 'GET /funcionarios voltou a devolver a linha crua').toMatch(
      /res\.json\(ocultarConfidenciaisRh\(req,\s*data\)\)/,
    );
    expect(rh.limpo, 'a ficha (GET /funcionarios/:id) voltou a espalhar `...func` cru').toMatch(
      /\.\.\.ocultarConfidenciaisRh\(req,\s*func\)/,
    );
    expect(rh.limpo).toMatch(/function\s+ocultarConfidenciaisRh\s*\(/);
  });

  it('a lista de campos confidenciais cobre CPF e a folha — e NÃO cobre `observacoes`', () => {
    const i = rh.limpo.indexOf('const CAMPOS_RH_CONFIDENCIAIS');
    expect(i, 'CAMPOS_RH_CONFIDENCIAIS sumiu').toBeGreaterThan(-1);
    const lista = rh.limpo.slice(i, rh.limpo.indexOf('];', i));
    for (const campo of ['cpf', 'salario', 'remuneracao_bruta', 'custo_total_mensal', 'remuneracao_liquida']) {
      expect(lista, `\`${campo}\` saiu da lista de confidenciais`).toContain(`'${campo}'`);
    }



    for (const campo of ['observacoes', 'status', 'data_demissao']) {
      expect(lista, `\`${campo}\` entrou na redação — isso QUEBRA a tela de RH`).not.toContain(`'${campo}'`);
    }
  });

















  it('⚠️⚠️ a régua da redação é `modulePerms.rh`, NUNCA getEffectiveLevel', () => {
    const bloco = corpoDaFuncao(rh.limpo, 'ocultarConfidenciaisRh');
    expect(bloco, '`ocultarConfidenciaisRh` sumiu').toBeTruthy();




    const chamada = /if\s*\(!payload\s*\|\|\s*(\w+)\(req\)\)/.exec(bloco);
    expect(chamada, 'a forma do guard da redação mudou — atualizar ESTE teste').toBeTruthy();
    const guarda = chamada![1];
    const corpoGuarda = corpoDaFuncao(rh.limpo, guarda);
    expect(corpoGuarda, `a função \`${guarda}\` não é declarada em rh.js`).toBeTruthy();

    const seguinte = /return\s+(\w+)\(req/.exec(corpoGuarda);
    const cadeia = [bloco, corpoGuarda, seguinte ? corpoDaFuncao(rh.limpo, seguinte[1]) : ''].join('\n');

    expect(
      cadeia,
      'a redação de CPF/salário voltou a usar getEffectiveLevel — ele parte do ' +
        '`nivel_padrao_leitura` do CARGO, e 8 cargos com padrão >= 4 NÃO têm linha ' +
        'em `rh`: pra eles a redação não redige nada',
    ).not.toContain('getEffectiveLevel');
    expect(cadeia, 'a régua deixou de ler o nível do MÓDULO rh').toMatch(/modulePerms\??\.?\??\.?\s*rh|modulePerms\?\.\brh\b/);
    expect(cadeia, 'a régua deixou de olhar `modulePerms`').toContain('modulePerms');
    expect(cadeia, 'o degrau da confidencialidade deixou de ser 4').toMatch(/>=\s*4/);

    expect(cadeia, 'voltou a usar o nível padrão do cargo').not.toMatch(/cargoNivel(Leitura|Escrita)/);
  });

  it('⚠️ a ESCRITA de remuneração usa a MESMA régua de módulo (as duas têm de somar)', () => {


    const corpo = corpoDaFuncao(rh.limpo, 'podeEditarRemuneracao');
    expect(corpo, '`podeEditarRemuneracao` sumiu').toBeTruthy();
    expect(corpo, 'a escrita de remuneração voltou a cair no nível padrão do cargo')
      .not.toContain('getEffectiveLevel');


    const i = rh.limpo.indexOf('const CAMPOS_RH_SENSIVEIS');
    expect(i).toBeGreaterThan(-1);
    expect(rh.limpo.slice(i, rh.limpo.indexOf('];', i)), '`cpf` saiu dos campos write-protected — o PUT vai apagar o CPF')
      .toContain("'cpf'");
  });

  const RH_ROTAS: Array<{ metodo: string; caminho: string; nivel: number; porque: string }> = [
    { metodo: 'delete', caminho: '/documentos/:id', nivel: 3, porque: 'apaga contrato/RG/CPF digitalizado de qualquer colaborador' },
    { metodo: 'delete', caminho: '/extras/:id', nivel: 3, porque: 'delete HARD de escala extra paga (plantão)' },
    { metodo: 'put', caminho: '/config/:chave', nivel: 3, porque: 'config do MÓDULO (ex.: valor_extra_padrao de todo plantão pago)' },
    { metodo: 'get', caminho: '/kpis', nivel: 3, porque: 'headcount global + lista NOMINAL das admissões do mês, sem applyAccessFilter' },
    { metodo: 'delete', caminho: '/avaliacoes/:id', nivel: 4, porque: 'delete HARD de avaliação 360° (ciclo PCS) — a aba inteira é >= 4 no front' },
  ];

  for (const r of RH_ROTAS) {
    it(`${r.metodo.toUpperCase()} ${r.caminho} exige rh >= ${r.nivel} — ${r.porque}`, () => {
      const linha = linhaDaRota(rh.limpo, r.metodo, r.caminho);
      expect(linha, `${r.metodo.toUpperCase()} ${r.caminho} sumiu de rh.js`).toBeTruthy();
      expect(linha, `${r.metodo.toUpperCase()} ${r.caminho} rodava em nível 2 — ${r.porque}`)
        .toContain(`authorizeModule('rh', ${r.nivel})`);
    });
  }

  it('⚠️ a trava é POR ROTA — rh.js não ganhou router.use(authorizeModule) de nível alto', () => {


    const usos = rh.limpo.match(/router\.use\(\s*authenticate,\s*authorizeModule\('rh'[^)]*\)/g) || [];
    for (const u of usos) {
      expect(u, 'o gate de bloco ganhou nível — isso fecha a tela pra nível 2/3').not.toMatch(/'rh',\s*[3-5]/);
    }
  });
});



describe('⚠️⚠️ toda routeKey usada nos 3 arquivos existe no ROUTE_MODULE_MAP', () => {






  const auth = readFileSync(resolve(RAIZ, 'backend/middleware/auth.js'), 'utf8');
  const bloco = auth.match(/const\s+ROUTE_MODULE_MAP\s*=\s*\{([\s\S]*?)\n\};/);
  const mapa = semComentariosJs(bloco?.[1] || '');

  it('o ROUTE_MODULE_MAP foi encontrado e tem conteúdo', () => {
    expect(bloco, 'a forma do ROUTE_MODULE_MAP mudou — atualizar o recorte').toBeTruthy();
    expect(mapa).toMatch(/['"]membresia['"]\s*:/);
  });

  const arquivos: Array<[string, string]> = [
    ['governanca.js', governanca.limpo],
    ['logistica.js', logistica.limpo],
    ['rh.js', rh.limpo],
  ];

  for (const [nome, limpo] of arquivos) {
    it(`${nome} — nenhuma chave órfã`, () => {
      const chaves = [...limpo.matchAll(/authorizeModule\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
      expect(chaves.length, `${nome} não usa authorizeModule — o recorte quebrou`).toBeGreaterThan(0);
      for (const chave of [...new Set(chaves)]) {
        expect(
          mapa,
          `${nome} usa a routeKey '${chave}', que NÃO está no ROUTE_MODULE_MAP — ` +
            'authorizeModule cai no nível padrão do cargo e a matriz desliga em silêncio',
        ).toMatch(new RegExp(`['"]${chave.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]\\s*:`));
      }
    });
  }

  it('⚠️ nenhum dos 3 usa a routeKey ampla `membros` em escrita ou lista de PII', () => {


    for (const [nome, limpo] of arquivos) {
      expect(limpo, `${nome} passou a usar a chave ampla 'membros'`).not.toMatch(/authorizeModule\(\s*['"]membros['"]/);
    }
  });
});
