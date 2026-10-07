






import { describe, it, expect } from 'vitest';
import { nucleoDoMapa, type PontoBairro as BairroMapa } from '@/lib/nucleoMapaBairros';

const b = (norm: string, total: number, lat = -22.9, lng = -43.3): BairroMapa => ({
  norm, bairro: norm, total, lat, lng,
});

describe('nucleoDoMapa', () => {
  it('lista vazia devolve vazio dos dois lados', () => {
    const r = nucleoDoMapa([]);
    expect(r.nucleo).toEqual([]);
    expect(r.fora).toEqual([]);
  });

  it('com um bairro só, ele é o núcleo e nada fica de fora', () => {
    const r = nucleoDoMapa([b('barra', 55)]);
    expect(r.nucleo).toHaveLength(1);
    expect(r.fora).toHaveLength(0);
  });

  it('deixa fora do quadro o bairro distante de peso mínimo', () => {



    const dados = [
      b('barra da tijuca', 55),
      b('freguesia', 7),
      b('jacarepagua', 4),
      b('centro', 2, -22.28, -42.53),
      b('jardim amalia', 1, -22.51, -44.07),
      b('copacabana', 1),
    ];
    const r = nucleoDoMapa(dados);
    const nomes = r.nucleo.map((x) => x.norm);
    expect(nomes).toContain('barra da tijuca');
    expect(r.fora.map((x) => x.norm)).toContain('jardim amalia');

    expect(r.nucleo.length + r.fora.length).toBe(dados.length);
  });

  it('o núcleo cobre pelo menos a cobertura pedida', () => {
    const dados = [b('a', 50), b('b', 30), b('c', 15), b('d', 5)];
    const total = 100;
    const r = nucleoDoMapa(dados, 0.9);
    const somaNucleo = r.nucleo.reduce((s, x) => s + x.total, 0);
    expect(somaNucleo / total).toBeGreaterThanOrEqual(0.9);
  });

  it('distribuição plana mantém todo mundo no quadro', () => {


    const dados = [b('a', 10), b('b', 10), b('c', 10), b('d', 10)];
    const r = nucleoDoMapa(dados, 0.9);
    expect(r.fora).toHaveLength(0);
  });

  it('total zero não recorta nada (evita divisão por zero silenciosa)', () => {
    const dados = [b('a', 0), b('b', 0)];
    const r = nucleoDoMapa(dados);
    expect(r.nucleo).toHaveLength(2);
    expect(r.fora).toHaveLength(0);
  });

  it('não altera a lista recebida', () => {
    const dados = [b('a', 1), b('b', 90)];
    const copia = dados.map((x) => x.norm).join('|');
    nucleoDoMapa(dados);
    expect(dados.map((x) => x.norm).join('|')).toBe(copia);
  });










  describe('corte por proximidade', () => {






    const producao = [
      b('barra-da-tijuca', 55, -23.000, -43.366),
      b('recreio-dos-bandeirantes', 21, -23.019, -43.463),
      b('freguesia-jacarepagua', 7, -22.941, -43.342),
      b('taquara', 5, -22.922, -43.385),
      b('vargem-pequena', 5, -22.982, -43.458),
      b('jacarepagua', 4, -22.953, -43.372),
      b('tijuca', 3, -22.925, -43.233),
      b('pechincha', 3, -22.929, -43.353),
      b('centro', 2, -22.280, -42.533),
      b('vargem-grande', 2, -22.971, -43.497),
      b('jardim-amalia', 1, -22.510, -44.080),
      b('jardim-guanabara', 1, -22.813, -43.201),
      b('meier', 1, -22.902, -43.280),
      b('olaria', 1, -22.848, -43.271),
      b('realengo', 1, -22.877, -43.430),
      b('agostinho-porto', 1, -22.790, -43.384),
      b('varzea', 1, -22.412, -42.966),
      b('alto-da-boa-vista', 1, -22.962, -43.254),
      b('anil', 1, -22.956, -43.338),
      b('bangu', 1, -22.875, -43.465),
      b('bonsucesso', 1, -22.866, -43.253),
      b('campo-grande', 1, -22.903, -43.559),
      b('copacabana', 1, -22.972, -43.184),
      b('encantado', 1, -22.897, -43.304),
      b('independencia', 1, -22.539, -43.210),
      b('iraja', 1, -22.835, -43.323),
    ];

    const outrasCidades = ['centro', 'jardim-amalia', 'varzea'];

    const span = (l: BairroMapa[], eixo: 'lat' | 'lng') =>
      Math.max(...l.map((x) => x[eixo])) - Math.min(...l.map((x) => x[eixo]));

    it('⚠️ o distante com pouca gente NÃO entra no quadro inicial', () => {
      const r = nucleoDoMapa(producao);
      const nomes = r.nucleo.map((x) => x.norm);
      for (const d of outrasCidades) expect(nomes).not.toContain(d);
    });

    it('e continua DECLARADO em `fora` — nunca desaparece', () => {
      const r = nucleoDoMapa(producao);
      const fora = r.fora.map((x) => x.norm);
      for (const d of outrasCidades) expect(fora).toContain(d);

      expect(r.nucleo.length + r.fora.length).toBe(producao.length);
    });

    it('o quadro encolhe de ~1,5° para menos de 0,4° de longitude', () => {
      expect(span(producao, 'lng')).toBeGreaterThan(1.5);
      const r = nucleoDoMapa(producao);
      expect(span(r.nucleo, 'lng')).toBeLessThan(0.4);
    });

    it('a concentração que o mapa existe para mostrar FICA', () => {
      const r = nucleoDoMapa(producao);
      const nomes = r.nucleo.map((x) => x.norm);
      expect(nomes).toContain('barra-da-tijuca');
      expect(nomes).toContain('recreio-dos-bandeirantes');
      expect(nomes).toContain('freguesia-jacarepagua');
    });



    it('segundo POLO com massa entra, mesmo estando longe', () => {
      const doisPolos = [
        b('barra', 55, -23.0, -43.366),
        b('niteroi', 40, -22.885, -43.104),
        b('recreio', 5, -23.019, -43.463),
      ];
      const r = nucleoDoMapa(doisPolos);
      expect(r.nucleo.map((x) => x.norm)).toContain('niteroi');
    });

    it('⚠️ a cobertura de 90% vale sobre o TOTAL, sempre', () => {


      const r = nucleoDoMapa(producao);
      const soma = r.nucleo.reduce((s, x) => s + x.total, 0);
      const total = producao.reduce((s, x) => s + x.total, 0);
      expect(soma / total).toBeGreaterThanOrEqual(0.9);
    });

    it('sem outra cidade na lista, ninguém a mais é cortado', () => {
      const soRio = producao.filter((x) => !outrasCidades.includes(x.norm));
      const r = nucleoDoMapa(soRio);
      const somaNucleo = r.nucleo.reduce((s, x) => s + x.total, 0);
      const total = soRio.reduce((s, x) => s + x.total, 0);
      expect(somaNucleo / total).toBeGreaterThanOrEqual(0.9);
    });
















    it('⚠️ um endereço em outro CONTINENTE não move o centro (média x mediana)', () => {
      const comPortugal = [...producao, b('lisboa', 1, 38.72, -9.14)];
      const nomes = nucleoDoMapa(comPortugal).nucleo.map((x) => x.norm);
      expect(nomes).toContain('barra-da-tijuca');
      expect(nomes).toContain('recreio-dos-bandeirantes');
      expect(nomes).not.toContain('lisboa');

      const lngs = nucleoDoMapa(comPortugal).nucleo.map((x) => x.lng);
      expect(Math.max(...lngs)).toBeLessThan(-43);
    });







    it('⚠️ cidade ao NORTE na mesma longitude não entra (latitude conta)', () => {









      const comSerra = [...producao, b('paty-do-alferes', 2, -22.428, -43.418)];
      const nomes = nucleoDoMapa(comSerra).nucleo.map((x) => x.norm);
      expect(nomes).not.toContain('paty-do-alferes');
      const lats = nucleoDoMapa(comSerra).nucleo.map((x) => x.lat);
      expect(Math.max(...lats)).toBeLessThan(-22.7);
    });

    it('o ponto distante não arrasta o quadro', () => {
      const centro = (l: BairroMapa[]) => ({
        lat: (Math.max(...l.map((x) => x.lat)) + Math.min(...l.map((x) => x.lat))) / 2,
        lng: (Math.max(...l.map((x) => x.lng)) + Math.min(...l.map((x) => x.lng))) / 2,
      });
      const soRio = producao.filter((x) => !outrasCidades.includes(x.norm));
      const sem = centro(nucleoDoMapa(soRio).nucleo);
      const com = centro(nucleoDoMapa(producao).nucleo);

      expect(Math.abs(com.lat - sem.lat)).toBeLessThan(0.05);
      expect(Math.abs(com.lng - sem.lng)).toBeLessThan(0.05);

      const nomes = nucleoDoMapa(producao).nucleo.map((x) => x.norm);
      expect(outrasCidades.every((d) => !nomes.includes(d))).toBe(true);
    });
  });
});
