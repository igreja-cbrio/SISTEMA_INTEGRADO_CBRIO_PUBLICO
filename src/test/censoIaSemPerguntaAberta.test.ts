















import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(__dirname, '..', '..');
const semComentarios = (src: string) => src
  .split('\n')
  .map((l) => l.replace(/(^|[^:])\/\/[^\n]*/, '$1'))
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '');

const rotaIa = () => {
  const src = semComentarios(readFileSync(join(RAIZ, 'backend/routes/censo.js'), 'utf8'));
  const i = src.indexOf("router.post('/ia'");
  expect(i, "POST /ia não encontrado").toBeGreaterThan(-1);
  const resto = src.slice(i);
  const fim = resto.search(/\nrouter\.(get|post|patch|put|delete)\(|\nmodule\.exports/);
  return fim === -1 ? resto : resto.slice(0, fim);
};

describe('⚠️⚠️ a mensagem distingue "não existe pergunta" de "ninguém escreveu"', () => {
  it('olha o questionário antes de escolher o texto', () => {
    const c = rotaIa();
    expect(c).toMatch(/from\('cen_pesquisa'\)[\s\S]{0,80}select\('perguntas'\)/);
    expect(c).toMatch(/TIPOS_PARA_IA\.has\(String\(q\?\.tipo \|\| ''\)\)/);
  });

  it('⚠️⚠️ NÃO manda mais esperar quando a pergunta não existe', () => {
    const c = rotaIa();
    expect(c, 'voltou a dizer só "ainda"').not.toMatch(/'Nenhuma resposta aberta para ler ainda'/);
    expect(c).toMatch(/não tem nenhuma pergunta aberta/);
  });

  it('e continua dizendo "ainda" quando a pergunta EXISTE e está vazia', () => {
    expect(rotaIa()).toMatch(/Ainda ninguém escreveu/);
  });

  it('a tela recebe o caso em campo próprio, não só em prosa', () => {
    expect(rotaIa()).toMatch(/sem_pergunta_aberta:\s*!temPerguntaAberta/);
  });
});

describe('⚠️⚠️ as duas guardas de privacidade continuam na consulta', () => {
  it('filtro por TIPO (o que impede CPF/telefone/e-mail irem pro modelo)', () => {
    expect(rotaIa()).toMatch(/\.in\('tipo',\s*\[\.\.\.TIPOS_PARA_IA\]\)/);
  });

  it('filtro do BLOCO DE CUIDADO (sensivel) — é outro risco, não o mesmo', () => {
    expect(rotaIa()).toMatch(/\.eq\('sensivel',\s*false\)/);
  });

  it('⚠️ TIPOS_PARA_IA continua sendo só texto_longo', () => {
    const src = readFileSync(join(RAIZ, 'backend/utils/censoIaFiltro.js'), 'utf8');
    expect(src).toMatch(/TIPOS_PARA_IA = new Set\(\['texto_longo'\]\)/);

    expect(src).not.toMatch(/TIPOS_PARA_IA = new Set\(\[[^\]]*'texto_curto'/);
  });
});









describe('⚠️⚠️ a tela lê o campo onde o cliente de fato o deixa', () => {
  const tela = () => readFileSync(join(RAIZ, 'src/components/censo/AbaLeituraIA.tsx'), 'utf8');

  it('o cliente achata o corpo do erro na raiz (premissa deste teste)', () => {
    const api = semComentarios(readFileSync(join(RAIZ, 'src/api.js'), 'utf8'));
    expect(api, 'src/api.js parou de achatar o corpo — reveja a leitura na tela')
      .toMatch(/Object\.assign\(error, err\)/);
  });

  it('lê da raiz do erro, não de um `.corpo` que não existe', () => {
    const t = semComentarios(tela());
    expect(t).toMatch(/er as \{ sem_pergunta_aberta\?: boolean \}/);
    expect(t, 'voltou a ler `.corpo`, que o cliente nunca preenche')
      .not.toMatch(/\bcorpo\?\.\s*sem_pergunta_aberta/);
  });

  it('e o caso vira saída para o Relatório, não texto vermelho', () => {
    const t = tela();
    expect(t).toMatch(/aoIrParaRelatorio/);
    expect(t).toMatch(/Ver o relatório/);
  });
});
