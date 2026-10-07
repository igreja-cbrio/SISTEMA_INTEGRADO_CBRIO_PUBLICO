import { describe, it, expect } from 'vitest';
import { normalizarDestino, SLUG_RE, RESERVADOS } from '../../backend/routes/links.js';
import { aparelhoDe, origemDe } from '../../backend/routes/redirecionador.js';
import { sugerirSlug, BASE_QR } from '../lib/linksCurtos';





describe('destino do link curto', () => {
  it('aceita http e https', () => {
    expect(normalizarDestino('https://www.cbrio.org/censo').destino)
      .toBe('https://www.cbrio.org/censo');
    expect(normalizarDestino('http://exemplo.com').erro).toBeUndefined();
  });

  it('RECUSA javascript: — é XSS hospedado no nosso domínio', () => {



    expect(normalizarDestino('javascript:alert(1)').erro).toBeTruthy();
    expect(normalizarDestino('JavaScript:alert(1)').erro).toBeTruthy();
  });

  it('RECUSA data: — mesmo motivo', () => {
    expect(normalizarDestino('data:text/html,<script>alert(1)</script>').erro).toBeTruthy();
  });

  it('recusa texto que não é URL', () => {
    expect(normalizarDestino('cbrio.org/censo').erro).toBeTruthy();
    expect(normalizarDestino('').erro).toBeTruthy();
    expect(normalizarDestino(null).erro).toBeTruthy();
  });

  it('RECUSA apontar para outro link curto — seria laço no celular de quem escaneou', () => {
    expect(normalizarDestino('https://www.cbrio.org/r/censo').erro).toMatch(/laço/i);
    expect(normalizarDestino('https://outro.com/r/x').erro).toMatch(/laço/i);
  });

  it('deixa passar caminho que só PARECE link curto', () => {


    expect(normalizarDestino('https://www.cbrio.org/relatorios').erro).toBeUndefined();
  });
});

describe('código do link (slug)', () => {
  it('aceita o que cabe bem num QR e num cartaz', () => {
    for (const s of ['censo', 'kids', 'censo-2026', 'r2d2']) {
      expect(SLUG_RE.test(s), s).toBe(true);
    }
  });

  it('recusa o que confunde quem digita à mão', () => {
    for (const s of ['ab', 'Censo', 'censo_2026', '-censo', 'censo-', 'ce nso', 'censo!']) {
      expect(SLUG_RE.test(s), s).toBe(false);
    }
  });

  it('protege nomes que já significam outra coisa', () => {
    for (const s of ['api', 'admin', 'r', 'assets']) expect(RESERVADOS.has(s), s).toBe(true);
  });
});

describe('sugestão de código a partir do nome', () => {












  it('tira acento de verdade', () => {
    expect(sugerirSlug('Inscrição')).toBe('inscricao');
    expect(sugerirSlug('Censo CBRio 2026')).toBe('censo-cbrio-2026');
    expect(sugerirSlug('ÁGUA & Ação')).toBe('agua-acao');
    expect(sugerirSlug('João · Célula')).toBe('joao-celula');
  });

  it('nunca deixa hífen sobrando nas pontas', () => {
    expect(sugerirSlug('  Retiro!  ')).toBe('retiro');
    expect(sugerirSlug('— Kids —')).toBe('kids');
  });

  it('o que ele sugere é aceito pelo servidor', () => {

    for (const nome of ['Censo CBRio 2026', 'Inscrição · Retiro de Casais', 'ÁGUA & Ação']) {
      expect(SLUG_RE.test(sugerirSlug(nome)), nome).toBe(true);
    }
  });

  it('o endereço do QR aponta para o domínio certo', () => {


    expect(BASE_QR).toBe('https://www.cbrio.org/r/');
  });
});

describe('contagem de escaneamento não guarda quem', () => {
  it('reduz o user-agent a uma categoria', () => {
    expect(aparelhoDe('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe('celular');
    expect(aparelhoDe('Mozilla/5.0 (Linux; Android 14)')).toBe('celular');
    expect(aparelhoDe('Mozilla/5.0 (Macintosh; Intel Mac OS X)')).toBe('computador');
    expect(aparelhoDe('')).toBe('outro');
  });

  it('guarda só o domínio de origem, nunca a URL inteira', () => {


    expect(origemDe('https://www.instagram.com/p/abc123?token=segredo')).toBe('www.instagram.com');
    expect(origemDe('lixo')).toBeNull();
    expect(origemDe(undefined)).toBeNull();
  });
});
