import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';










const req = createRequire(import.meta.url);
const { semCache } = req('../../backend/middleware/semCache.js');


function resFalso() {
  const headers: Record<string, string> = {};
  return {
    headers,
    corpoEnviado: null as string | null,
    tipoDefinido: null as string | null,
    set(k: string, v: string) { headers[k.toLowerCase()] = v; return this; },
    get(k: string) { return headers[k.toLowerCase()]; },
    type(t: string) { this.tipoDefinido = t; headers['content-type'] = t; return this; },
    end(b: string) { this.corpoEnviado = b; return this; },
    json(_b: any) { throw new Error('json original NÃO deveria ser chamado'); },
  };
}

describe('semCache · rota de estado nunca é cacheada', () => {
  it('manda Cache-Control: no-store', () => {
    const res = resFalso();
    semCache({} as any, res as any, () => {});
    expect(res.get('Cache-Control')).toBe('no-store');
  });

  it('⚠️ res.json passa a responder por res.end — é o que NÃO gera ETag', () => {



    const res = resFalso();
    semCache({} as any, res as any, () => {});
    res.json({ pago: true, valor_centavos: 500 });
    expect(res.corpoEnviado).toBe('{"pago":true,"valor_centavos":500}');
  });

  it('não sobrescreve Content-Type já definido', () => {
    const res = resFalso();
    res.set('Content-Type', 'application/problem+json');
    semCache({} as any, res as any, () => {});
    res.json({ error: 'x' });
    expect(res.get('Content-Type')).toBe('application/problem+json');
  });

  it('chama next() — é middleware, não terminal', () => {
    let seguiu = false;
    semCache({} as any, resFalso() as any, () => { seguiu = true; });
    expect(seguiu).toBe(true);
  });
});




describe('semCache · está montado onde precisa', () => {


  const semComentarios = (t: string) =>
    t.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

  const ler = (caminho: string) =>
    semComentarios(readFileSync(new URL(caminho, import.meta.url), 'utf8'));

  it('o app monta no router inteiro', () => {
    expect(ler('../../backend/routes/app.js')).toMatch(/router\.use\(\s*semCache\s*\)/);
  });

  it('a tela de pagamento da inscrição monta em /pagamento e /comprovante', () => {
    const t = ler('../../backend/routes/publicEventoExterno.js');
    expect(t).toMatch(/router\.use\(\s*['"]\/pagamento['"]\s*,\s*semCache\s*\)/);
    expect(t).toMatch(/router\.use\(\s*['"]\/comprovante['"]\s*,\s*semCache\s*\)/);
  });

  it('a tela de doação monta no router inteiro', () => {
    expect(ler('../../backend/routes/publicGenerosidade.js')).toMatch(/router\.use\(\s*semCache\s*\)/);
  });

  it('⚠️ a página do evento (/:slug) NÃO é coberta — é decisão, não esquecimento', () => {



    const t = ler('../../backend/routes/publicEventoExterno.js');
    expect(t).not.toMatch(/router\.use\(\s*semCache\s*\)/);
  });
});
