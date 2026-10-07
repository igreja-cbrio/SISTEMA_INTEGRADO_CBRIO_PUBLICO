import { describe, it, expect } from 'vitest';
import {
  caminhoDaCapa, extensaoDaCapa, caminhoNovoDaCapa, MIMES_CAPA,
} from '../../backend/utils/grupoCapaApp.js';











const BASE = 'https://example.supabase.co/storage/v1/object/public/grupos';

describe('caminhoDaCapa · o que PODE ser apagado', () => {
  it('reconhece a URL que o nosso próprio endpoint gera', () => {
    expect(caminhoDaCapa(`${BASE}/abc-123/1786131000000.jpg`))
      .toBe('abc-123/1786131000000.jpg');
  });

  it('ignora o cache-buster que a tela antiga colava na URL', () => {


    expect(caminhoDaCapa(`${BASE}/abc-123/1.jpg?t=1786131000000`)).toBe('abc-123/1.jpg');
    expect(caminhoDaCapa(`${BASE}/abc-123/1.jpg#topo`)).toBe('abc-123/1.jpg');
  });

  it('decodifica caminho com escape', () => {
    expect(caminhoDaCapa(`${BASE}/abc%2D123/foto%20nova.png`)).toBe('abc-123/foto nova.png');
  });
});

describe('caminhoDaCapa · o que NÃO pode ser apagado', () => {
  it('recusa vazio e não-string', () => {
    for (const v of [null, undefined, '', '   ', 42, {}, []]) {
      expect(caminhoDaCapa(v as never)).toBeNull();
    }
  });

  it('⚠️ recusa OUTRO BUCKET — o caso que apagaria o avatar de alguém', () => {
    const avatar = 'https://example.supabase.co/storage/v1/object/public/avatars/u1/avatar-1.jpg';
    expect(caminhoDaCapa(avatar)).toBeNull();
    expect(caminhoDaCapa(`https://x.co/storage/v1/object/public/fotos-membros/a.jpg`)).toBeNull();
  });

  it('⚠️ recusa URL de fora colada à mão no web', () => {

    expect(caminhoDaCapa('https://images.unsplash.com/photo-123.jpg')).toBeNull();
    expect(caminhoDaCapa('não é url nenhuma')).toBeNull();
  });

  it('⚠️ recusa a marca escondida na QUERY (URL forjada)', () => {
    expect(caminhoDaCapa(`https://site.com/x?u=${BASE}/abc/1.jpg`)).toBeNull();
    expect(caminhoDaCapa(`https://site.com/x#${BASE}/abc/1.jpg`)).toBeNull();
  });

  it('⚠️ recusa travessia com `..` (sair do bucket)', () => {
    expect(caminhoDaCapa(`${BASE}/../avatars/u1/avatar.jpg`)).toBeNull();
    expect(caminhoDaCapa(`${BASE}/abc/../../avatars/x.jpg`)).toBeNull();

    expect(caminhoDaCapa(`${BASE}/..%2Favatars%2Fx.jpg`)).toBeNull();
  });

  it('recusa caminho vazio depois da marca e escape quebrado', () => {
    expect(caminhoDaCapa(BASE + '/')).toBeNull();
    expect(caminhoDaCapa(`${BASE}/?t=1`)).toBeNull();
    expect(caminhoDaCapa(`${BASE}/abc%ZZ.jpg`)).toBeNull();
  });

  it('aceita ".." como PARTE do nome, que não é travessia', () => {
    expect(caminhoDaCapa(`${BASE}/abc/foto..jpg`)).toBe('abc/foto..jpg');
  });
});

describe('extensaoDaCapa · quem manda é o mime, não a URI do aparelho', () => {
  it('mapeia os 3 formatos aceitos', () => {
    expect(extensaoDaCapa('image/jpeg')).toBe('jpg');
    expect(extensaoDaCapa('image/png')).toBe('png');
    expect(extensaoDaCapa('image/webp')).toBe('webp');
    expect(extensaoDaCapa(' IMAGE/JPEG ')).toBe('jpg');
  });

  it('recusa o que a allowlist não cobre', () => {



    expect(extensaoDaCapa('image/heic')).toBeNull();
    expect(extensaoDaCapa('image/gif')).toBeNull();
    expect(extensaoDaCapa('application/pdf')).toBeNull();
    expect(extensaoDaCapa('')).toBeNull();
    expect(extensaoDaCapa(null as never)).toBeNull();
  });

  it('a allowlist do multer é a MESMA lista (um lugar só)', () => {
    expect([...MIMES_CAPA].sort()).toEqual(['image/jpeg', 'image/png', 'image/webp']);
  });
});

describe('caminhoNovoDaCapa · único por upload', () => {
  it('monta `<grupo>/<ms>.<ext>` e devolve caminho DIFERENTE a cada envio', () => {
    const a = caminhoNovoDaCapa('g1', 'jpg', 1786131000000);
    const b = caminhoNovoDaCapa('g1', 'jpg', 1786131000001);
    expect(a).toBe('g1/1786131000000.jpg');
    expect(a).not.toBe(b);
  });

  it('o caminho novo é sempre reconhecido de volta pela régua de limpeza', () => {

    const p = caminhoNovoDaCapa('abc-123', 'webp', 1786131000000);
    expect(caminhoDaCapa(`${BASE}/${p}`)).toBe(p);
  });
});
