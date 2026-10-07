import { describe, it, expect } from 'vitest';
import {
  ehImagem, nomeDoArquivo, rotuloTipo,
  validarAnexos, sanitizarNome, caminhoDeUpload,
  MAX_ANEXOS, LIMITE_ARQUIVO_MB,
} from '../lib/anexoSolicitacao';

const arq = (name: string, mb = 0.1) => ({ name, size: Math.round(mb * 1024 * 1024) });



const assinada = (p: string) =>
  `https://abc.supabase.co/storage/v1/object/sign/solicitacoes/${p}?token=token-ficticio`;

describe('anexoSolicitacao · imagem × arquivo', () => {


  it('PDF em URL ASSINADA não é imagem', () => {
    expect(ehImagem(assinada('anexos/1757000000000-a1b2-orcamento.pdf'))).toBe(false);
  });

  it('imagem em URL assinada é imagem, em qualquer caixa', () => {
    expect(ehImagem(assinada('anexos/1757000000000-a1b2-foto.jpg'))).toBe(true);
    expect(ehImagem(assinada('anexos/1757000000000-a1b2-foto.JPG'))).toBe(true);
    expect(ehImagem(assinada('anexos/1757000000000-a1b2-foto.WebP'))).toBe(true);
  });

  it('URL pública antiga (sem token) continua funcionando', () => {

    expect(ehImagem('https://abc.supabase.co/storage/v1/object/public/solicitacoes/fotos/x.png')).toBe(true);
    expect(ehImagem('https://abc.supabase.co/storage/v1/object/public/solicitacoes/comprovantes/x.pdf')).toBe(false);
  });

  it('fragmento (#) também é cortado antes de olhar a extensão', () => {
    expect(ehImagem('https://x/a/b.pdf#page=2')).toBe(false);
    expect(ehImagem('https://x/a/b.png#zoom')).toBe(true);
  });


  it('sem extensão reconhecível NÃO é imagem', () => {
    expect(ehImagem('https://x/a/b?token=1')).toBe(false);
    expect(ehImagem('https://x/a/arquivo.')).toBe(false);
    expect(ehImagem('')).toBe(false);
    expect(ehImagem(null as unknown as string)).toBe(false);
    expect(ehImagem(undefined as unknown as string)).toBe(false);
  });


  it('SVG NÃO é tratado como imagem (XSS)', () => {
    expect(ehImagem(assinada('anexos/1757000000000-a1b2-logo.svg'))).toBe(false);
  });

  it('ponto no MEIO do nome não vira extensão', () => {
    expect(ehImagem(assinada('anexos/1757000000000-a1b2-nota.fiscal.png'))).toBe(true);
    expect(ehImagem(assinada('anexos/1757000000000-a1b2-nota.fiscal.pdf'))).toBe(false);
  });
});

describe('anexoSolicitacao · nome legível', () => {
  it('devolve o nome original, sem o prefixo técnico do upload', () => {
    expect(nomeDoArquivo(assinada('anexos/1757000000000-a1b2c3-orcamento-alfa.pdf')))
      .toBe('orcamento-alfa.pdf');
  });

  it('percent-encoding é desfeito', () => {
    expect(nomeDoArquivo(assinada('anexos/1757000000000-a1b2-proposta%20final.pdf')))
      .toBe('proposta final.pdf');
  });

  it('arquivo antigo (sem o prefixo) mantém o nome como está', () => {
    expect(nomeDoArquivo('https://x/storage/v1/object/public/solicitacoes/fotos/foto.png'))
      .toBe('foto.png');
  });


  it('URL degenerada devolve rótulo genérico, nunca string vazia', () => {
    expect(nomeDoArquivo('')).toBe('arquivo');
    expect(nomeDoArquivo('https://x/')).toBe('arquivo');
    expect(nomeDoArquivo(null as unknown as string)).toBe('arquivo');
  });

  it('nome absurdamente longo é truncado', () => {
    const longo = 'a'.repeat(300) + '.pdf';
    expect(nomeDoArquivo(assinada(`anexos/${longo}`)).length).toBeLessThanOrEqual(80);
  });
});

describe('anexoSolicitacao · rótulo do tipo', () => {
  it('usa a extensão em maiúsculas', () => {
    expect(rotuloTipo(assinada('anexos/1757000000000-a1b2-x.pdf'))).toBe('PDF');
    expect(rotuloTipo(assinada('anexos/1757000000000-a1b2-x.docx'))).toBe('DOCX');
  });

  it('sem extensão devolve ARQUIVO', () => {
    expect(rotuloTipo('https://x/a/b?token=1')).toBe('ARQUIVO');
  });
});

describe('anexoSolicitacao · validação ANTES do upload', () => {
  it('aceita PDF e imagem dentro do limite', () => {
    expect(validarAnexos([arq('orcamento.pdf', 3), arq('foto.jpg', 1)]).ok).toBe(true);
  });

  it('recusa formato fora da lista, nomeando o arquivo', () => {
    const r = validarAnexos([arq('virus.exe')]);
    expect(r.ok).toBe(false);
    expect(r.erro).toContain('virus.exe');
  });


  it('recusa SVG no upload', () => {
    expect(validarAnexos([arq('logo.svg')]).ok).toBe(false);
  });

  it('recusa arquivo acima do limite, dizendo o tamanho', () => {
    const r = validarAnexos([arq('proposta.pdf', LIMITE_ARQUIVO_MB + 5)]);
    expect(r.ok).toBe(false);
    expect(r.erro).toContain('proposta.pdf');
    expect(r.erro).toContain(String(LIMITE_ARQUIVO_MB));
  });

  it('recusa acima de MAX_ANEXOS', () => {
    const muitos = Array.from({ length: MAX_ANEXOS + 1 }, (_, i) => arq(`a${i}.pdf`));
    expect(validarAnexos(muitos).ok).toBe(false);
  });



  it('com max: Infinity, quantidade não bloqueia (mas formato/tamanho sim)', () => {
    const dez = Array.from({ length: 10 }, (_, i) => arq(`item${i}.jpg`));
    expect(validarAnexos(dez, { max: Infinity }).ok).toBe(true);
    expect(validarAnexos([...dez, arq('x.exe')], { max: Infinity }).ok).toBe(false);
  });



  it('arquivo sem size conhecido passa', () => {
    expect(validarAnexos([{ name: 'x.pdf' } as never]).ok).toBe(true);
  });

  it('lista vazia ou inválida passa', () => {
    expect(validarAnexos([]).ok).toBe(true);
    expect(validarAnexos(null as never).ok).toBe(true);
  });
});

describe('anexoSolicitacao · caminho do upload', () => {
  it('sanitiza acento, espaço e travessia', () => {
    expect(sanitizarNome('Orçamento Alfa — 2026.PDF')).toBe('orcamento-alfa-2026.pdf');
    expect(sanitizarNome('../../etc/passwd')).not.toContain('..');
    expect(sanitizarNome('../../etc/passwd')).not.toContain('/');
    expect(sanitizarNome('')).toBe('arquivo');
  });



  it('ida e volta preserva o nome legível', () => {
    const path = caminhoDeUpload('anexos', 'Proposta Fornecedor Beta.pdf', 1757000000000, 'a1b2c3');
    expect(path).toBe('anexos/1757000000000-a1b2c3-proposta-fornecedor-beta.pdf');
    const assinadaUrl = `https://x.supabase.co/storage/v1/object/sign/solicitacoes/${path}?token=jwt`;
    expect(nomeDoArquivo(assinadaUrl)).toBe('proposta-fornecedor-beta.pdf');
    expect(ehImagem(assinadaUrl)).toBe(false);
    expect(rotuloTipo(assinadaUrl)).toBe('PDF');
  });

  it('o caminho nunca escapa da pasta', () => {
    const path = caminhoDeUpload('anexos', '../../../evil.pdf', 1757000000000, 'zz');
    expect(path.startsWith('anexos/')).toBe(true);
    expect(path.split('/').length).toBe(2);
  });
});
