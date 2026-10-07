





import { describe, it, expect } from 'vitest';
import {
  basePublica, linkDaRota, portasCompartilhaveis, linkDoEvento,
  CHAVES_COMPARTILHAVEIS, BASE_PADRAO,
} from '../../backend/utils/linkInscricaoApp.js';
import { PORTAS_INSCRICAO } from '../../backend/services/inscricaoPortas.js';

describe('a base é constante e imune a ambiente', () => {



  it('nenhuma env muda o link compartilhado', () => {
    const antes = basePublica();
    const salvo = { ...process.env };
    try {
      process.env.FRONTEND_URL = 'http://localhost:8080';
      process.env.PUBLIC_BASE_URL = 'https://crmcbrio.vercel.app';
      expect(basePublica()).toBe(antes);
      expect(linkDoEvento('celebra')).toBe(`${BASE_PADRAO}/evento/celebra`);
      for (const p of portasCompartilhaveis()) expect(p.url.startsWith(BASE_PADRAO)).toBe(true);
    } finally {
      process.env = salvo;
    }
  });

  it('é o domínio público da igreja, em https', () => {
    expect(BASE_PADRAO).toBe('https://www.cbrio.org');
    expect(basePublica()).toMatch(/^https:\/\//);
    expect(basePublica().endsWith('/')).toBe(false);
  });
});

describe('portas compartilháveis', () => {
  it('são as 5 da tela do app, nessa ordem', () => {
    expect(portasCompartilhaveis().map((p: any) => p.chave))
      .toEqual(['batismo', 'grupos', 'next', 'voluntariado', 'apresentacao']);
  });



  it('a URL é a 1ª rota pública do catálogo', () => {
    const doCatalogo = new Map(PORTAS_INSCRICAO.map((p: any) => [p.chave, p.rotasPublicas[0]]));
    for (const p of portasCompartilhaveis()) {
      expect(p.url).toBe(`${BASE_PADRAO}${doCatalogo.get(p.chave)}`);
    }
  });

  it('toda chave declarada existe no catálogo', () => {
    const conhecidas = new Set(PORTAS_INSCRICAO.map((p: any) => p.chave));
    for (const c of CHAVES_COMPARTILHAVEIS) expect(conhecidas.has(c)).toBe(true);
  });




  it('eventos e líderes ficam FORA', () => {
    const chaves = portasCompartilhaveis().map((p: any) => p.chave);
    expect(chaves).not.toContain('eventos');
    expect(chaves).not.toContain('grupos_lider');
  });

  it('nenhuma URL tem placeholder de rota nem barra dupla', () => {
    for (const p of portasCompartilhaveis()) {


      expect(p.url.slice('https:'.length)).not.toContain(':');
      expect(p.url.replace('https://', '')).not.toContain('//');
      expect(p.nome.length).toBeGreaterThan(0);
    }
  });
});

describe('linkDaRota · a guarda que barra rota de template', () => {




  it('rota de template NUNCA vira link', () => {
    expect(linkDaRota('/evento/:slug')).toBeNull();
    expect(linkDaRota('/g/a/:token')).toBeNull();
    expect(linkDaRota('/tudo/*')).toBeNull();
  });

  it('rota vazia ou relativa devolve null, nunca link pela metade', () => {
    expect(linkDaRota('')).toBeNull();
    expect(linkDaRota(null)).toBeNull();
    expect(linkDaRota('inscricao-batismo')).toBeNull();
  });

  it('rota simples vira link absoluto', () => {
    expect(linkDaRota('/inscricao-batismo')).toBe(`${BASE_PADRAO}/inscricao-batismo`);
  });



  it('a lista de chaves e a guarda de rota protegem independentemente', () => {
    const evento = PORTAS_INSCRICAO.find((p: any) => p.chave === 'eventos');
    expect(linkDaRota(evento.rotasPublicas[0])).toBeNull();
  });
});

describe('link de evento', () => {
  it('monta a partir do slug', () => {
    expect(linkDoEvento('celebra')).toBe(`${BASE_PADRAO}/evento/celebra`);
    expect(linkDoEvento('  celebra  ')).toBe(`${BASE_PADRAO}/evento/celebra`);
  });



  it('sem slug devolve null, nunca link pela metade', () => {
    expect(linkDoEvento('')).toBeNull();
    expect(linkDoEvento(null)).toBeNull();
    expect(linkDoEvento(undefined)).toBeNull();
  });

  it('slug estranho é escapado em vez de vazar na URL', () => {
    expect(linkDoEvento('a b')).toBe(`${BASE_PADRAO}/evento/a%20b`);
  });
});
