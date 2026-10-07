import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { semComentariosJs } from './_semComentarios';




















const DIR = resolve(__dirname, '../../backend/routes');













const DESCARTAM_O_LINK = new Set<string>([]);

function arquivosDeRota(): string[] {
  return readdirSync(DIR).filter((f) => f.endsWith('.js'));
}


function chamadas(src: string): string[] {
  const fora: string[] = [];
  const marca = 'auth.admin.generateLink';
  let i = src.indexOf(marca);
  while (i !== -1) {

    const ini = src.lastIndexOf('const', i);
    fora.push(src.slice(ini === -1 ? Math.max(0, i - 200) : ini, i));
    i = src.indexOf(marca, i + marca.length);
  }
  return fora;
}


function descartaOLink(trecho: string): boolean {
  return !/\{\s*data\b/.test(trecho);
}

describe('magic link · quem gera tem que enviar', () => {
  it('nenhum arquivo NOVO gera link e joga fora', () => {
    const novos: string[] = [];

    for (const arq of arquivosDeRota()) {
      const src = semComentariosJs(readFileSync(resolve(DIR, arq), 'utf8'));
      const pontos = chamadas(src).filter(descartaOLink);
      if (pontos.length && !DESCARTAM_O_LINK.has(arq)) novos.push(`${arq} (${pontos.length})`);
    }

    expect(
      novos,
      'ponto novo gerando magic link sem enviar — `generateLink` devolve o link em `data.properties.action_link` e NÃO manda e-mail; use `services/email.js` ou `signInWithOtp`',
    ).toEqual([]);
  });

  it('a porta do devocional não gera mais link nenhum', () => {
    const src = semComentariosJs(readFileSync(resolve(DIR, 'publicDevocional.js'), 'utf8'));
    expect(
      src.includes('generateLink'),
      'o login por magic link do devocional voltou — as telas web dele não existem mais (`/devocional` renderiza DevocionalMovido) e a rota criava auth user + profile a partir de uma chamada pública',
    ).toBe(false);
    expect(src.includes("router.post(")).toBe(false);
  });
});

describe('a régua única do link de acesso', () => {
  const HELPER = resolve(__dirname, '../../backend/utils/magicLink.js');
  const src = () => semComentariosJs(readFileSync(HELPER, 'utf8'));

  it('o helper GERA e ENVIA — as duas metades', () => {
    const c = src();
    expect(c, 'o helper parou de gerar o link').toContain('generateLink');
    expect(c, 'o helper parou de ler o action_link — é ele que vai no e-mail').toContain('properties?.action_link');
    expect(c, 'o helper parou de ENVIAR, que é a razão de ele existir').toMatch(/enviarEmail\(/);
  });

  it('⚠⚠ o link NUNCA vai pro log nem pra resposta HTTP (é credencial)', () => {
    const c = src();


    expect(c, 'o action_link foi parar num console.* — um clique nele loga qualquer um').not.toMatch(/console\.[a-z]+\([^)]*link/);
    expect(c.match(/return \{[^}]*link[^}]*\}/g) || [], 'o helper passou a devolver o link para quem chama').toEqual([]);
  });

  it('as portas públicas usam o helper, não o generateLink cru', () => {
    for (const arq of ['publicVoluntariado.js', 'publicMembresia.js']) {
      const c = semComentariosJs(readFileSync(resolve(DIR, arq), 'utf8'));
      expect(c, `${arq} voltou a chamar generateLink direto`).not.toContain('auth.admin.generateLink');
      expect(c, `${arq} parou de usar a régua única`).toContain('enviarLinkDeAcesso(');
    }
  });

  it('o link do cadastro público não pousa mais numa tela que não existe', () => {
    const c = semComentariosJs(readFileSync(resolve(DIR, 'publicMembresia.js'), 'utf8'));
    expect(c, 'o link voltou a apontar pro devocional web, que foi removido').not.toContain('/devocional/hoje');
    expect(c, 'sumiu o destino /redefinir-senha do link de acesso').toContain('/redefinir-senha');
  });
});












describe('mem_grupos · o front web não fala direto com a tabela', () => {
  const SRC = resolve(__dirname, '../../src');

  function arquivosDeCodigo(dir: string): string[] {
    const out: string[] = [];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = resolve(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'test') out.push(...arquivosDeCodigo(p)); }
      else if (/\.(ts|tsx|js|jsx)$/.test(e.name)) out.push(p);
    }
    return out;
  }

  it('nenhuma tela do ERP lê `mem_grupos` pelo supabase-js', () => {
    const culpados = arquivosDeCodigo(SRC).filter((f) => {
      const c = semComentariosJs(readFileSync(f, 'utf8'));
      return /\.from\(\s*['"]mem_grupos['"]\s*\)/.test(c);
    });
    expect(
      culpados.map((f) => f.replace(SRC, 'src')),
      'tela lendo `mem_grupos` direto — o privilégio agora é por COLUNA, então `select(\'*\')` leva 42501; passe pelo backend',
    ).toEqual([]);
  });
});
