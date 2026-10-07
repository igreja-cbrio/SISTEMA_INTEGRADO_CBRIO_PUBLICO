import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';























const ARQ = resolve(__dirname, '../../backend/routes/cuidados.js');
const ARQ_AUTH = resolve(__dirname, '../../backend/middleware/auth.js');








function semComentarios(js: string): string {
  return js
    .split('\n')
    .map((l) => l.replace(/\/\*.*?\*\//g, ''))
    .map((l) => l.replace(/(^|[^:])\/\/[^\n]*/, '$1'))
    .join('\n');
}

const ROTAS_COM_GATE: Array<{
  metodo: string; caminho: string; chave: string; nivel: number; porque: string;
}> = [

  { metodo: 'get', caminho: '/dashboard', chave: 'cuidados', nivel: 1,
    porque: 'agregado de vw_cuidados_mensal; a tela já é condicionada a canCuidados' },
  { metodo: 'get', caminho: '/acompanhamentos', chave: 'cuidados', nivel: 1,
    porque: 'até 500 fichas de aconselhamento com nome, telefone e motivo (luto, casal, saúde)' },
  { metodo: 'get', caminho: '/jornada180', chave: 'cuidados', nivel: 1,
    porque: 'rota legada de cui_jornada180, que alimenta KPI e o /painel' },
  { metodo: 'get', caminho: '/convertidos/tags', chave: 'cuidados', nivel: 1,
    porque: 'constante sem PII, mas exceção sem gate é o que faz a próxima nascer aberta' },
  { metodo: 'get', caminho: '/convertidos/atendentes', chave: 'cuidados', nivel: 1,
    porque: 'nome e e-mail dos cargos pastorais — organograma de quem atende' },
  { metodo: 'get', caminho: '/convertidos', chave: 'cuidados', nivel: 1,
    porque: 'até 2000 fichas com nome, CPF, telefone, observação pastoral e tags de triagem' },
  { metodo: 'get', caminho: '/visitas-pendentes', chave: 'cuidados', nivel: 1,
    porque: 'fila de visitas com pessoa e endereço' },
  { metodo: 'get', caminho: '/agregado', chave: 'cuidados', nivel: 1,
    porque: 'leitura do agregado de atendimentos' },


  { metodo: 'get', caminho: '/buscar-membro', chave: 'cuidados', nivel: 2,
    porque: 'oráculo de CPF: confirma se uma pessoa está na base (mesmo padrão do B06 em pessoas.js)' },


  { metodo: 'post', caminho: '/acompanhamentos', chave: 'cuidados', nivel: 3,
    porque: 'cria ficha de aconselhamento' },
  { metodo: 'patch', caminho: '/acompanhamentos/:id', chave: 'cuidados', nivel: 3,
    porque: 'edita ficha de aconselhamento' },
  { metodo: 'delete', caminho: '/acompanhamentos/:id', chave: 'cuidados', nivel: 3,
    porque: 'apaga ficha de aconselhamento' },
  { metodo: 'post', caminho: '/jornada180', chave: 'cuidados', nivel: 3,
    porque: 'injeta encontro em cui_jornada180 — mexe no indicador do /painel' },
  { metodo: 'delete', caminho: '/jornada180/:id', chave: 'cuidados', nivel: 3,
    porque: 'apagar encontro derruba número do /painel' },
  { metodo: 'patch', caminho: '/convertidos/:id', chave: 'cuidados', nivel: 3,
    porque: 'edita a ficha do convertido; dava para falsificar o SLA de 3 dias' },
  { metodo: 'delete', caminho: '/convertidos/:id', chave: 'cuidados', nivel: 3,
    porque: 'cui_convertidos é fonte canônica do convertido no /painel e na NSM' },
  { metodo: 'post', caminho: '/convertidos/:id/agendar-encontro', chave: 'cuidados', nivel: 3,
    porque: 'marca encontro e notifica o pastor' },
  { metodo: 'post', caminho: '/convertidos/:id/cancelar-encontro', chave: 'cuidados', nivel: 3,
    porque: 'cancela encontro agendado' },
  { metodo: 'post', caminho: '/convertidos/:id/desfecho', chave: 'cuidados', nivel: 3,
    porque: 'fecha o acompanhamento e dispara encaminhamentos' },
  { metodo: 'post', caminho: '/agregado', chave: 'cuidados', nivel: 3,
    porque: 'grava o agregado de atendimentos' },
  { metodo: 'post', caminho: '/criar-membro', chave: 'cuidados', nivel: 3,
    porque: 'escrita em mem_membros (mesmo padrão do B06 em pessoas.js)' },


  { metodo: 'get', caminho: '/jornada-convertidos', chave: 'jornada-convertidos', nivel: 1,
    porque: 'lista nome, telefone e CPF; a tela é do líder de área (online, ami, bridge, kids), que não tem o módulo cuidados' },
  { metodo: 'post', caminho: '/convertidos/:id/registrar-contato', chave: 'jornada-convertidos', nivel: 1,
    porque: 'o botão vive no mesmo componente da lista — par obrigatório, senão o dono da tela vê e não age' },
];

describe('cuidados.js · rotas que precisam de authorizeModule', () => {
  const bruto = readFileSync(ARQ, 'utf8');
  const limpo = semComentarios(bruto);



  it('o limpador de comentários não destrói o arquivo', () => {
    expect(limpo).toContain("router.get('/convertidos'");
    expect(limpo.length).toBeGreaterThan(bruto.length * 0.5);
  });

  for (const r of ROTAS_COM_GATE) {
    it(`${r.metodo.toUpperCase()} ${r.caminho} exige ${r.chave} >= ${r.nivel} — ${r.porque}`, () => {
      const linha = limpo
        .split('\n')
        .find((l) => l.includes(`router.${r.metodo}('${r.caminho}'`));
      expect(linha, `rota ${r.metodo.toUpperCase()} ${r.caminho} sumiu do arquivo`).toBeTruthy();
      expect(
        linha,
        `${r.metodo.toUpperCase()} ${r.caminho} ficou SEM o gate — ${r.porque}`,
      ).toContain(`authorizeModule('${r.chave}', ${r.nivel})`);
    });
  }

  it('NENHUMA rota do arquivo fica sem authorizeModule (é o que o A01 fechou)', () => {




    const semGate = limpo
      .split('\n')
      .filter((l) => /^router\.(get|post|put|patch|delete)\(/.test(l))
      .filter((l) => !l.includes('authorizeModule('));
    expect(semGate, `rotas sem gate:\n${semGate.join('\n')}`).toEqual([]);
  });

  it('o arquivo continua sem gate global (o gate é por rota — não relaxar)', () => {


    expect(limpo).not.toMatch(/router\.use\(\s*authorizeModule/);
  });

  it('a routeKey estreita `jornada-convertidos` existe no ROUTE_MODULE_MAP', () => {


    const auth = semComentarios(readFileSync(ARQ_AUTH, 'utf8'));
    expect(auth).toMatch(/'jornada-convertidos'\s*:\s*\[/);
  });

  it('a lista de PII do painel de convertidos NÃO usa a routeKey ampla `membros`', () => {



    expect(limpo).not.toContain("authorizeModule('membros'");
  });

  it('PATCH /convertidos/:id não grava req.body cru (mass-assignment)', () => {


    const trecho = limpo.slice(limpo.indexOf("router.patch('/convertidos/:id'"));
    const corpo = trecho.slice(0, trecho.indexOf('router.', 10));
    expect(corpo).not.toMatch(/\.update\(\s*req\.body\s*\)/);
    expect(corpo).toContain('CAMPOS_EDITAVEIS');
  });













  it('a whitelist do PATCH /convertidos/:id cobre todo campo que a tela edita', () => {
    const trecho = limpo.slice(limpo.indexOf('const CAMPOS_EDITAVEIS'));
    const lista = trecho.slice(0, trecho.indexOf('];'));

    const EDITADOS_PELA_TELA = [
      'primeiro_contato_status',
      'primeiro_contato_em',
      'atendido_apos_culto',
      'responsavel_atendimento',
      'nome', 'telefone', 'observacoes', 'tags',
      'data_culto',
      'cadastrado',
    ];
    for (const campo of EDITADOS_PELA_TELA) {
      expect(lista, `${campo} saiu da whitelist — a tela edita e o PATCH descarta`).toContain(`'${campo}'`);
    }
  });







  it('a whitelist não ressuscita colunas que não existem em cui_convertidos', () => {
    const trecho = limpo.slice(limpo.indexOf('const CAMPOS_EDITAVEIS'));
    const lista = trecho.slice(0, trecho.indexOf('];'));

    for (const fantasma of ['email', 'status', 'encontro_em', 'encontro_responsavel', 'desfecho_observacao']) {
      expect(lista, `'${fantasma}' não é coluna de cui_convertidos`).not.toContain(`'${fantasma}'`);
    }
  });
});
