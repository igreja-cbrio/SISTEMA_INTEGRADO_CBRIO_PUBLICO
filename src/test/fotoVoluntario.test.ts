import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { semComentariosJs } from './_semComentarios';
import { ehFotoDeVerdade, fotoDoPerfil, mapaDeFotos } from '../../backend/utils/fotoVoluntario';












describe('ehFotoDeVerdade · só /uploads/person/ é gente', () => {
  it('aceita a foto de pessoa do PCO', () => {
    expect(ehFotoDeVerdade('https://avatars.planningcenteronline.com/uploads/person/123-abc/avatar.jpg')).toBe(true);
  });

  it('⚠️ RECUSA o placeholder de iniciais — 121 dos 226 escalados', () => {
    expect(ehFotoDeVerdade('https://avatars.planningcenteronline.com/uploads/initials/MS.png')).toBe(false);
  });

  it('vazio, nulo e lixo não são foto', () => {
    expect(ehFotoDeVerdade(null)).toBe(false);
    expect(ehFotoDeVerdade(undefined)).toBe(false);
    expect(ehFotoDeVerdade('')).toBe(false);
    expect(ehFotoDeVerdade('https://exemplo.com/foto.jpg')).toBe(false);
  });
});

describe('fotoDoPerfil · a NOSSA foto tem preferência', () => {
  it('a foto do cadastro vence o placeholder do PCO', () => {
    expect(fotoDoPerfil({
      avatar_url: 'https://x/uploads/initials/MS.png',
      membro: { foto_url: 'https://cbrio/avatars/ana.jpg' },
    })).toBe('https://cbrio/avatars/ana.jpg');
  });

  it('a foto do cadastro vence até a foto de verdade do PCO', () => {


    expect(fotoDoPerfil({
      avatar_url: 'https://x/uploads/person/1/a.jpg',
      membro: { foto_url: 'https://cbrio/avatars/ana.jpg' },
    })).toBe('https://cbrio/avatars/ana.jpg');
  });

  it('sem a nossa, usa a do PCO — e só se for de verdade', () => {
    expect(fotoDoPerfil({ avatar_url: 'https://x/uploads/person/1/a.jpg', membro: null }))
      .toBe('https://x/uploads/person/1/a.jpg');
    expect(fotoDoPerfil({ avatar_url: 'https://x/uploads/initials/MS.png', membro: null })).toBe(null);
  });

  it('o embed pode chegar como ARRAY (o PostgREST devolve os dois formatos)', () => {
    expect(fotoDoPerfil({
      avatar_url: null,
      membro: [{ foto_url: 'https://cbrio/avatars/ana.jpg' }],
    })).toBe('https://cbrio/avatars/ana.jpg');


    expect(fotoDoPerfil({ avatar_url: null, membro: [] })).toBe(null);
  });

  it('nunca devolve string vazia — o front trataria como URL', () => {
    expect(fotoDoPerfil({ avatar_url: '', membro: { foto_url: '' } })).toBe(null);
    expect(fotoDoPerfil(null)).toBe(null);
    expect(fotoDoPerfil(undefined)).toBe(null);
  });
});

describe('mapaDeFotos · lote e tolerância a falha', () => {
  const fake = (respostas: any[]) => {
    const chamadas: any[] = [];
    let i = 0;
    return {
      chamadas,
      from() {
        const q: any = {
          select: () => q,
          in: (_col: string, ids: string[]) => {
            chamadas.push(ids);
            return Promise.resolve(respostas[i++] || { data: [], error: null });
          },
        };
        return q;
      },
    };
  };

  it('lê em lotes de 200 (lista longa estoura a URL do PostgREST)', async () => {
    const ids = Array.from({ length: 450 }, (_, k) => `id-${k}`);
    const db = fake([{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }]);
    await mapaDeFotos(db as any, ids);
    expect(db.chamadas.map(c => c.length)).toEqual([200, 200, 50]);
  });

  it('deduplica e ignora nulo antes de consultar', async () => {
    const db = fake([{ data: [], error: null }]);
    await mapaDeFotos(db as any, ['a', 'a', null, undefined, 'b', '']);
    expect(db.chamadas[0]).toEqual(['a', 'b']);
  });

  it('⚠️ erro num lote NÃO lança e NÃO perde os outros', async () => {


    const ids = Array.from({ length: 250 }, (_, k) => `id-${k}`);
    const db = fake([
      { data: null, error: { message: 'timeout' } },
      { data: [{ id: 'id-240', avatar_url: 'https://x/uploads/person/9/a.jpg', membro: null }], error: null },
    ]);
    const mapa = await mapaDeFotos(db as any, ids);
    expect(mapa['id-240']).toBe('https://x/uploads/person/9/a.jpg');
  });

  it('lista vazia não consulta nada', async () => {
    const db = fake([]);
    expect(await mapaDeFotos(db as any, [])).toEqual({});
    expect(db.chamadas.length).toBe(0);
  });
});

describe('GUARDA · a foto chega nas telas de montar escala', () => {
  const raiz = path.resolve(__dirname, '../..');
  const ler = (f: string) => semComentariosJs(fs.readFileSync(path.join(raiz, f), 'utf8'));
  const rotas = ler('backend/routes/voluntariado.js');
  const app = ler('backend/routes/app.js');

  it('a régua é ÚNICA — o app.js importa em vez de ter cópia', () => {



    expect(app).toContain("require('../utils/fotoVoluntario')");
    expect(app).not.toMatch(/const ehFotoDeVerdade = /);
  });

  it('os 3 caminhos da montagem anexam a foto', () => {



    expect(rotas).toContain("require('../utils/fotoVoluntario')");
    const usos = rotas.match(/mapaDeFotos\(supabase,/g) || [];
    expect(usos.length).toBeGreaterThanOrEqual(2);
    const resolvidos = rotas.match(/fotoDoPerfil\(v\)/g) || [];
    expect(resolvidos.length).toBeGreaterThanOrEqual(2);
  });

  it('⚠️ nenhuma tela da montagem renderiza avatar_url CRU', () => {


    for (const f of [
      'src/pages/ministerial/voluntariado/components/schedules/PainelEscalar.tsx',
      'src/pages/ministerial/voluntariado/components/schedules/MatrizCards.tsx',
      'src/pages/ministerial/voluntariado/components/schedules/MatrizEscala.tsx',
      'src/pages/ministerial/voluntariado/components/schedules/EquipeEscalaCard.tsx',
      'src/pages/ministerial/voluntariado/VolLista.tsx',
    ]) {
      expect(ler(f), f).not.toMatch(/src=\{[a-z]+\.avatar_url\}/);
    }
  });
});
