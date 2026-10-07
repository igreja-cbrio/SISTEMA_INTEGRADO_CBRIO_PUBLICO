import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { semComentariosJs } from './_semComentarios';





































const RAIZ = resolve(__dirname, '..', '..');
const lerLimpo = (rel: string) => semComentariosJs(readFileSync(resolve(RAIZ, rel), 'utf8'));

const ARQUIVOS = {
  membresia: 'backend/routes/publicMembresia.js',




  devocional: 'backend/routes/publicDevocional.js',
  voluntariado: 'backend/routes/publicVoluntariado.js',
  pagamentos: 'backend/routes/pagamentosWebhook.js',
  cerebro: 'backend/routes/cerebro.js',
  cronAuth: 'backend/utils/cronAuth.js',
} as const;

const fonte = Object.fromEntries(
  Object.entries(ARQUIVOS).map(([k, v]) => [k, lerLimpo(v)]),
) as Record<keyof typeof ARQUIVOS, string>;


function blocoDaRota(src: string, decl: string): string {
  const i = src.indexOf(decl);
  expect(i, `\`${decl}\` não existe mais — se a rota foi renomeada, atualizar ESTE teste`).toBeGreaterThan(-1);
  const j = src.indexOf('\nrouter.', i + decl.length);
  return src.slice(i, j === -1 ? src.length : j);
}


function blocoEntre(src: string, inicio: string, fim: string): string {
  const i = src.indexOf(inicio);
  expect(i, `âncora \`${inicio}\` sumiu — atualizar ESTE teste`).toBeGreaterThan(-1);
  const j = src.indexOf(fim, i + inicio.length);
  expect(j, `âncora de fim \`${fim}\` sumiu — atualizar ESTE teste`).toBeGreaterThan(-1);
  return src.slice(i, j);
}









describe('sanidade · os arquivos sobrevivem a semComentariosJs', () => {
  for (const [nome, src] of Object.entries(fonte)) {
    it(`${nome} continua tendo CÓDIGO depois de limpar os comentários`, () => {
      expect(src.replace(/\s+/g, ' ').trim().length).toBeGreaterThan(400);
      expect(src).toMatch(/router\.|module\.exports/);
    });
  }

  it('o limpador de fato apaga o comentário (senão o teste inteiro é teatro)', () => {


    const cru = readFileSync(resolve(RAIZ, ARQUIVOS.membresia), 'utf8');
    expect(cru, 'o comentário do conserto deveria citar `password`').toContain('SEM `password`');
    expect(fonte.membresia).not.toContain('SEM `password`');
  });
});




describe('⚠️⚠️ PUB-02 · membresia GET /lookup-cpf — CPF sozinho não é prova, e a recusa é NEUTRA', () => {
  const bloco = blocoDaRota(fonte.membresia, "router.get('/lookup-cpf'");

  it('EXIGE data de nascimento além do CPF', () => {


    expect(bloco, 'o nascimento não é lido da query').toMatch(/req\.query\.(data_nascimento|nascimento)/);
    expect(bloco, 'a régua pura do censo não está sendo aplicada').toContain('podeIdentificarPorCpf');
  });

  it('sem nascimento a resposta é a MESMA de CPF inexistente (não é 400, não é mensagem)', () => {


    const i = bloco.indexOf('if (!podeIdentificarPorCpf');
    expect(i, 'a guarda do nascimento sumiu — atualizar ESTE teste').toBeGreaterThan(-1);
    expect(bloco.slice(i, i + 200)).toContain('res.json(neutra)');
    expect(bloco).not.toMatch(/status\(4\d\d\)/);
  });

  it('⚠️ NENHUM `reason:` sobrou — era ele que discriminava os casos de recusa', () => {


    expect(bloco).not.toMatch(/\breason\s*:/);
  });

  it('o corpo de recusa é UM só, literal `{ found: false }`', () => {
    expect(bloco).toMatch(/const\s+neutra\s*=\s*\{\s*found\s*:\s*false\s*\}/);
  });

  it('⚠️⚠️ TODA saída sem sucesso devolve o MESMO objeto — nenhuma variante avulsa', () => {


    const saidas = bloco.split(/res\.json\(/).slice(1).map((t) => t.slice(0, 80));
    expect(saidas.length, 'a rota não responde mais nada?').toBeGreaterThanOrEqual(4);
    for (const s of saidas) {
      const ehNeutra = /^neutra\s*\)/.test(s.trim());
      const ehSucesso = /found\s*:\s*true/.test(s);
      expect(ehNeutra || ehSucesso, `saída em formato próprio: res.json(${s.trim().slice(0, 60)}…`).toBe(true);
    }
  });

  it('as DUAS fontes exigem o nascimento — a fila de pendentes responde a mesma pergunta sensível', () => {


    expect(bloco).toContain("from('mem_membros')");
    expect(bloco).toContain("from('mem_cadastros_pendentes')");
    const divergencias = bloco.match(/data_nascimento\s*!==\s*nascimento/g) || [];
    expect(divergencias.length, 'alguma das duas fontes não confere o nascimento').toBeGreaterThanOrEqual(2);

    expect(bloco).toMatch(/select\('id, nome, status, data_nascimento'\)/);
  });

  it('o erro do banco não vira sinal — o catch também devolve a recusa neutra', () => {
    const cat = bloco.slice(bloco.lastIndexOf('catch'));
    expect(cat).toContain('res.json(neutra)');
    expect(cat).not.toMatch(/\breason\s*:/);
  });
});




describe('⚠️⚠️ PUB-02 · voluntariado POST /lookup-cpf — não devolve nome nem qualifica a fonte', () => {
  const bloco = blocoDaRota(fonte.voluntariado, "router.post('/lookup-cpf'");

  const sucesso = blocoEntre(bloco, 'const hasEmail', '});');

  it('⚠️ `name` saiu — era o nome COMPLETO entregue a quem só tinha o CPF', () => {
    expect(sucesso).not.toMatch(/(^|[\s{,])name\s*:/);
    expect(sucesso).not.toContain('result.name');
  });

  it('⚠️ `type` saiu — `colaborador` marcava, a partir de um CPF, quem é funcionário da igreja', () => {
    expect(sucesso).not.toMatch(/(^|[\s{,])type\s*:/);
    expect(sucesso).not.toContain('result.type,');
  });

  it('o que o self-checkin realmente usa continua saindo (found · hasEmail · maskedEmail)', () => {


    expect(sucesso).toMatch(/found\s*:\s*true/);
    expect(sucesso).toMatch(/hasEmail\s*,?/);
    expect(sucesso).toContain('maskedEmail');
  });

  it('o e-mail continua MASCARADO (não é o endereço cru que substitui o nome)', () => {
    expect(sucesso).toContain('maskEmail(result.email)');
    expect(sucesso).not.toMatch(/maskedEmail\s*:\s*result\.email\b/);
  });
});




describe('⚠️⚠️ PUB-01 · cadastro público não liga a conta de quem chama ao membro casado por CPF', () => {
  const rota = blocoDaRota(fonte.membresia, "router.post('/cadastro'");





  const conta = blocoEntre(rota, 'if (senha && emailLimpo', 'catch (accErr)');

  it('⚠️⚠️ `profiles.membro_id` NUNCA sai de `duplicadoDeId` nesta porta', () => {




    expect(conta).not.toMatch(/membro_id\s*:\s*duplicadoDeId/);
    expect(conta).not.toMatch(/patch\.membro_id/);
    expect(conta).not.toMatch(/membro_id\s*=\s*duplicadoDeId/);
  });

  it('o profile novo nasce com `membro_id: null` — o vínculo é ato da EQUIPE', () => {
    const insert = blocoEntre(conta, "from('profiles').insert(", '})');
    expect(insert).toMatch(/membro_id\s*:\s*null/);
  });

  it('⚠️ a escrita em `mem_membros` só é autorizada pelo vínculo JÁ PROVADO no profile', () => {


    expect(conta).toMatch(/membroDoLogin\s*=\s*profileExistente\.membro_id\s*;/);
    expect(conta).not.toMatch(/profileExistente\.membro_id\s*\|\|\s*duplicadoDeId/);
  });

  it('⚠️⚠️ `createUser` NÃO recebe `password` — senha escolhida por anônimo não é credencial', () => {
    const create = blocoEntre(conta, 'auth.admin.createUser(', '})');
    expect(create).not.toMatch(/\bpassword\s*:/);
    expect(create).not.toContain('senha');
  });

  it('`email_confirm: false` — marcar confirmado sem verificar tirava o dono do circuito', () => {
    const create = blocoEntre(conta, 'auth.admin.createUser(', '})');
    expect(create).toMatch(/email_confirm\s*:\s*false/);
    expect(create).not.toMatch(/email_confirm\s*:\s*true/);
  });

  it('a entrada passa a ser o link no e-mail, e só para a conta CRIADA agora', () => {









    expect(conta, 'o link de acesso saiu do ramo da conta nova').toContain('enviarLinkDeAcesso(');
    expect(conta, 'voltou o generateLink cru — ele não envia e-mail').not.toContain('auth.admin.generateLink');
    expect(conta, 'o link voltou a pousar no devocional web, que foi removido').not.toContain('/devocional/hoje');
    expect(conta).toMatch(/if\s*\(\s*authUserNovo\s*\)/);
  });

  it('ninguém "entra na hora" a partir desta porta', () => {
    expect(conta).toMatch(/canLoginDevocional\s*=\s*false\s*;/);
    expect(conta).not.toMatch(/canLoginDevocional\s*=\s*!!\s*duplicadoDeId/);
  });

  it('⚠️ a busca do auth user por e-mail é PAGINADA (listUsers() cru via só a 1ª página)', () => {





    expect(fonte.membresia).toContain("require('../utils/authUsers')");
    expect(conta).toContain('acharAuthUserPorEmail(emailLimpo)');
    expect(conta, 'voltou o listUsers() sem paginação').not.toMatch(/listUsers\(\s*\)/);
    const util = lerLimpo('backend/utils/authUsers.js');
    expect(util).toMatch(/listUsers\(\s*\{\s*page\s*,\s*perPage\s*:\s*PER_PAGE\s*\}\s*\)/);


    expect(util).toMatch(/if\s*\(error\)\s*throw error/);

    expect(util).toMatch(/users\.length\s*<\s*PER_PAGE/);
  });













  it('⚠️ o devocional não procura mais usuário no auth (a rota saiu)', () => {
    expect(fonte.devocional, 'voltou o login do devocional — ver magicLinkEnvio.test.ts').not.toContain("router.post('/login'");
    expect(fonte.devocional, 'voltou o listUsers() no devocional').not.toMatch(/listUsers\(/);
    expect(fonte.devocional, 'o devocional voltou a mexer no auth').not.toContain('acharAuthUserPorEmail(');

    expect(fonte.devocional, 'sumiu o GET /hoje — o widget do app depende dele').toContain("router.get('/hoje'");
  });

  it('a fila de cadastros NÃO perde o `duplicado_de_id` — só deixa de virar acesso', () => {


    expect(rota).toMatch(/duplicado_de_id\s*:\s*duplicadoDeId/);
  });
});




const DIR_ROTAS = resolve(RAIZ, 'backend/routes');
const ROTAS = readdirSync(DIR_ROTAS)
  .filter((f) => f.endsWith('.js'))
  .map((f) => ({ nome: f, src: lerLimpo(`backend/routes/${f}`) }));

describe('⚠️⚠️ PUB-03 · segredo de cron nunca em QUERY STRING', () => {
  it('a varredura enxerga a árvore inteira de rotas (senão passa por vacuidade)', () => {
    expect(ROTAS.length).toBeGreaterThan(40);
  });

  it('nenhuma rota lê `req.query.secret`', () => {


    const culpados = ROTAS.filter((r) => /req\.query\.secret\b/.test(r.src)).map((r) => r.nome);
    expect(culpados, `segredo em query string: ${culpados.join(', ')}`).toEqual([]);
  });

  it('nenhuma rota casa o CRON_SECRET contra algo vindo de `req.query`', () => {



    const perto =
      /req\.query\.\w+[^\n]{0,80}(CRON_SECRET|cronSecret)|(CRON_SECRET|cronSecret)[^\n]{0,80}req\.query\.\w+/;
    const culpados = ROTAS.filter((r) => perto.test(r.src)).map((r) => r.nome);
    expect(culpados, `CRON_SECRET comparado com query string: ${culpados.join(', ')}`).toEqual([]);
  });

  it('`pagamentosWebhook.js` não tem mais a régua LOCAL — usa a única de utils/cronAuth', () => {
    expect(fonte.pagamentos).not.toContain('function cronAutorizado');
    expect(fonte.pagamentos).toContain("require('../utils/cronAuth')");

    for (const rota of ['/cron/tick', '/cron/expirar', '/cron/reconciliar', '/cron/replay', '/cron/saude']) {
      const b = blocoDaRota(fonte.pagamentos, `router.get('${rota}'`);
      expect(b, `${rota} sem gate de cron`).toContain('isAuthorizedCron(req)');
      expect(b, `${rota} ainda usa a régua local`).not.toContain('cronAutorizado(req)');
    }
  });
});

describe('⚠️⚠️ PUB-03 · a comparação do segredo é timing-safe', () => {
  it('`utils/cronAuth` compara com `crypto.timingSafeEqual`, e falha fechado sem env', () => {
    expect(fonte.cronAuth).toContain('crypto.timingSafeEqual');
    expect(fonte.cronAuth).toMatch(/if\s*\(!secret\)\s*return false/);

    expect(fonte.cronAuth).not.toContain('req.query');
  });

  it('nenhuma rota compara o CRON_SECRET com `===`/`!==`', () => {






    const INERTES = new Set(['voluntariado-sync.js']);
    const igualdade = /(===|!==)\s*(process\.env\.CRON_SECRET|CRON_SECRET|cronSecret)\b(?!\s*\.)/;
    const culpados = ROTAS.filter((r) => !INERTES.has(r.nome) && igualdade.test(r.src)).map((r) => r.nome);
    expect(culpados, `comparação não timing-safe: ${culpados.join(', ')}`).toEqual([]);
  });

  it('o webhook do Cérebro compara o clientState com `safeEqual`, sem fallback literal', () => {



    const web = blocoDaRota(fonte.cerebro, "router.post('/webhook'");
    expect(web).toContain('safeEqual');
    expect(web).not.toMatch(/notif\.clientState\s*!==/);
    expect(fonte.cerebro).not.toContain("'cbrio-cerebro'");

    expect(web).toMatch(/if\s*\(!CLIENT_STATES_ACEITOS\.length\)/);
  });

  it('o CRON_SECRET nunca mais é ENVIADO ao tenant Microsoft', () => {


    const sub = blocoDaRota(fonte.cerebro, "router.post('/subscriptions'");
    expect(sub).toMatch(/clientState\s*:\s*GRAPH_CLIENT_STATE/);
    expect(sub).not.toMatch(/clientState\s*:\s*CRON_SECRET/);


    expect(sub).toMatch(/if\s*\(!GRAPH_CLIENT_STATE\)/);
    expect(fonte.cerebro).toMatch(/GRAPH_CLIENT_STATE\s*=\s*process\.env\.GRAPH_CLIENT_STATE\s*\|\|\s*null/);
  });
});









describe('⚠️ o chamador do lookup manda a prova nova', () => {
  const api = lerLimpo('src/api.js');
  const chamada = blocoEntre(api, 'lookupCpf: async (cpf', '},');

  it('`cadastroPublico.lookupCpf` envia o nascimento junto do CPF', () => {


    expect(chamada, 'o chamador ainda manda só o CPF').toMatch(/data_nascimento|nascimento/);
  });
});






describe('⚠️⚠️ a TELA do cadastro consegue satisfazer o contrato novo', () => {
  const TELA = 'src/pages/public/CadastroMembresia.jsx';
  const tela = lerLimpo(TELA);

  it('sanidade · a tela sobrevive a semComentariosJs', () => {
    expect(tela.replace(/\s+/g, ' ').trim().length).toBeGreaterThan(4000);
    expect(tela).toContain('cadastroPublico.lookupCpf(');
  });

  it('o efeito do lookup tem `form.data_nascimento` nas DEPENDÊNCIAS', () => {



    const iChamada = tela.indexOf('cadastroPublico.lookupCpf(');
    expect(iChamada, 'a chamada do lookup sumiu da tela — atualizar ESTE teste').toBeGreaterThan(-1);
    const iDeps = tela.indexOf('}, [', iChamada);
    expect(iDeps, 'o array de dependências do efeito sumiu — atualizar ESTE teste').toBeGreaterThan(-1);
    const deps = tela.slice(iDeps, tela.indexOf(']', iDeps));
    expect(deps, 'o efeito não reage ao nascimento').toContain('form.data_nascimento');
  });

  it('⚠️⚠️ o campo de nascimento e o cartão de reconhecimento vivem no MESMO passo', () => {




    const marcas = [...tela.matchAll(/currentStep\s*===\s*(\d+)\s*&&/g)];
    expect(marcas.length, 'a tela não é mais dividida por `currentStep === N &&`').toBeGreaterThan(1);
    const passoDe = (agulha: string) => {
      const i = tela.indexOf(agulha);
      expect(i, `\`${agulha}\` sumiu da tela — atualizar ESTE teste`).toBeGreaterThan(-1);
      let passo = -1;
      for (const m of marcas) {
        if ((m.index as number) < i) passo = Number(m[1]);
        else break;
      }
      return passo;
    };
    const passoNascimento = passoDe('<BirthDatePicker');
    const passoCartao = passoDe('cpfLookup?.found');
    expect(
      passoNascimento,
      `nascimento no passo ${passoNascimento} e cartão de reconhecimento no passo ${passoCartao}`,
    ).toBe(passoCartao);
  });
});





















describe('⚠️⚠️ censo · contato de anônimo não encosta em membro por sinal fraco', () => {
  const svc = lerLimpo('backend/services/censoReconciliar.js');
  const chamada = blocoEntre(fonte.membresia, 'reconciliarCenso({', '});');
  const ramoCortado = blocoEntre(fonte.membresia, 'if (!contatoProvado', 'reconciliarCenso({');

  it('⚠️⚠️ o contato SÓ entra atrás de `token_censo` — e o cortado não se perde', () => {


    expect(
      fonte.membresia,
      'a trava de origem sumiu — sem ela o CPF digitado volta a escolher a chave de login de outra pessoa',





    ).toMatch(/const\s+contatoProvado\s*=\s*matchedBy\s*===\s*'token_censo'\s*;/);



    expect(chamada, 'o contato deixou de entrar pelo spread condicional').toMatch(
      /\.\.\.\(\s*contatoProvado\s*\?\s*\{[^}]*email\s*:\s*emailLimpo[^}]*telefone\s*:\s*telefoneLimpo[^}]*\}\s*:\s*\{\s*\}\s*\)/,
    );
    const semSpreads = chamada.replace(/\.\.\.\([^)]*\)/g, '');
    expect(
      semSpreads,
      'o contato voltou a ir INCONDICIONAL no `dados` — era exatamente o vazamento do lote',
    ).not.toMatch(/email\s*:\s*emailLimpo/);
    expect(semSpreads).not.toMatch(/telefone\s*:\s*telefoneLimpo/);



    expect(chamada, 'a chamada parou de dizer COMO a pessoa foi casada').toMatch(/matchedBy\s*,/);




    expect(
      ramoCortado,
      'o ramo do contato cortado não registra mais nada — o contato está sendo descartado',
    ).toContain('registrarContatoDaPorta(');
    expect(ramoCortado, 'a fonte do contato acumulado deixou de ser `censo`').toMatch(/'censo'/);
  });




  it('⚠️ o acúmulo roda ANTES do `await reconciliarCenso` — e deixa rastro no histórico', () => {






    const iAcumulo = fonte.membresia.indexOf('registrarContatoDaPorta(');
    const iReconciliar = fonte.membresia.indexOf('await reconciliarCenso({');
    expect(iAcumulo, '`registrarContatoDaPorta(` sumiu — atualizar ESTE teste').toBeGreaterThan(-1);
    expect(iReconciliar, '`await reconciliarCenso({` sumiu — atualizar ESTE teste').toBeGreaterThan(-1);
    expect(
      iAcumulo,
      'o acúmulo voltou pra depois do reconciliador — erro de infra lá volta a comer o contato cortado',
    ).toBeLessThan(iReconciliar);







    expect(
      ramoCortado,
      'o acúmulo do contato de porta anônima deixou de gravar rastro em `mem_historico`',
    ).toContain("from('mem_historico')");


    expect(ramoCortado, '`tipo` sumiu do insert — o histórico volta a falhar em silêncio').toMatch(/tipo:\s*'outro'/);
    expect(
      ramoCortado,
      'o rastro deixou de dizer que o contato veio de porta anônima sem token pessoal',
    ).toMatch(/porta an[oô]nima/);
  });

  it('só `cpf` e `token_censo` são chave FORTE', () => {



    expect(svc).toMatch(/CHAVES_FORTES\s*=\s*new Set\(\[\s*'cpf'\s*,\s*'token_censo'\s*\]\)/);
  });

  it('⚠️ sinal fraco sai ANTES de decidir campo nenhum', () => {
    expect(svc).toMatch(/if\s*\(!gate\.ok\)/);
    const iSaida = svc.indexOf("vazioResp('sinal_fraco_ignorado'");
    const iDecide = svc.indexOf('decidirCampos(membro, informado)');
    expect(iSaida, 'a saída de sinal fraco sumiu — atualizar ESTE teste').toBeGreaterThan(-1);
    expect(iDecide, '`decidirCampos` sumiu — atualizar ESTE teste').toBeGreaterThan(-1);
    expect(iSaida, 'o gate deixou de vir antes da decisão de campos').toBeLessThan(iDecide);

    expect(svc).toMatch(/sinal_fraco_sem_nascimento/);
    expect(svc).toMatch(/sinal_fraco_nascimento_divergente/);
  });
});
















describe('⚠️⚠️ PUB-01 · o ramo de criação de conta tem balde por E-MAIL ALVO', () => {
  const rota = blocoDaRota(fonte.membresia, "router.post('/cadastro'");
  const conta = blocoEntre(rota, 'if (senha && emailLimpo', 'catch (accErr)');
  const balde = blocoEntre(fonte.membresia, 'const contaPorEmailLimiter = rateLimit({', '});');

  it('⚠️⚠️ o middleware está MONTADO na rota (tirá-lo é o que reabre a porta)', () => {
    expect(
      fonte.membresia,
      'o `contaPorEmailLimiter` saiu da linha do `router.post(\'/cadastro\')` — `createUser`+`generateLink` viraram ilimitados por e-mail alvo',
    ).toMatch(/router\.post\(\s*'\/cadastro'[^)]*\bcontaPorEmailLimiter\b/);
  });

  it('o ramo de criação de conta CONSULTA o balde antes de disparar qualquer coisa', () => {


    expect(
      conta,
      'a guarda de criação de conta parou de olhar `req.contaPorEmailEstourou`',
    ).toMatch(/!\s*req\.contaPorEmailEstourou/);
  });

  it('⚠️ estourar o balde PULA a conta — não responde 429 nem derruba a submissão', () => {
    expect(balde, 'o balde perdeu o `handler` próprio — o default do express-rate-limit responde 429').toMatch(/handler\s*:/);
    expect(balde, 'o handler deixou de marcar a flag que o ramo lê').toMatch(/req\.contaPorEmailEstourou\s*=\s*true/);
    expect(balde, 'o handler não segue o pipeline — a submissão (e o consentimento LGPD) está sendo perdida').toMatch(/\bnext\(\s*\)/);
    expect(balde, 'o balde voltou a RECUSAR a requisição inteira').not.toMatch(/\.status\(/);
    expect(balde).not.toMatch(/429/);
  });
});















describe('⚠️ a TELA não afirma entrega de e-mail, e dá o caminho de saída', () => {
  const tela = lerLimpo('src/pages/public/CadastroMembresia.jsx');

  it('sanidade · o texto visível da tela sobreviveu à limpeza dos comentários', () => {
    expect(tela.replace(/\s+/g, ' ').trim().length).toBeGreaterThan(4000);
    expect(tela, 'o texto do acesso por link sumiu — atualizar ESTE teste').toContain('O acesso ao devocional é por link no e-mail.');
  });

  it('⚠️⚠️ nenhuma ponta afirma que um e-mail foi/será ENVIADO', () => {
    expect(
      tela,
      'voltou a afirmar entrega no passado — o `generateLink` não roda em 3 caminhos (balde, conta que já existia, createUser falho)',
    ).not.toMatch(/[Ee]nviamos[\s\S]{0,40}e-?mail/);
    expect(
      tela,
      'voltou a prometer entrega no futuro — mesma afirmação que não dá pra provar daqui',
    ).not.toMatch(/[Ee]nviaremos[\s\S]{0,40}e-?mail/);
  });

  it('o parágrafo de sucesso traz o CAMINHO DE SAÍDA humano', () => {


    expect(
      tela,
      'a saída humana sumiu do sucesso — a pessoa fica sem link e sem a quem recorrer',
    ).toContain('fale com a nossa equipe');
  });
});
