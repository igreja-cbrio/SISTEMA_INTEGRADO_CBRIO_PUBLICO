










import { describe, it, expect, vi } from 'vitest';
const { esperarRegistro, TETO_REGISTRO_MS } = require('../../backend/utils/registroAcesso');


const lenta = <T,>(ms: number, valor: T) =>
  new Promise<T>((r) => setTimeout(() => r(valor), ms));

describe('esperarRegistro · o insert é esperado', () => {
  it('insert que dá certo devolve "gravado"', async () => {
    expect(await esperarRegistro(Promise.resolve({ error: null }))).toBe('gravado');
  });

  it('⚠️⚠️ ERRO DO POSTGREST não passa por gravado', async () => {



    expect(await esperarRegistro(Promise.resolve({ error: { message: 'x' } }))).toBe('erro');
  });

  it('promessa rejeitada devolve "erro", nunca lança', async () => {
    await expect(esperarRegistro(Promise.reject(new Error('rede')))).resolves.toBe('erro');
  });

  it('espera de verdade: insert que demora 120ms ainda é gravado', async () => {


    expect(await esperarRegistro(lenta(120, { error: null }), 800)).toBe('gravado');
  });
});

describe('⚠️ o teto protege quem escaneou', () => {
  it('insert mais lento que o teto devolve "timeout" e libera', async () => {
    const t0 = Date.now();
    const r = await esperarRegistro(lenta(5000, { error: null }), 60);
    expect(r).toBe('timeout');

    expect(Date.now() - t0).toBeLessThan(1500);
  });

  it('⚠️⚠️ teto INVÁLIDO cai no default, nunca em zero', async () => {


    expect(await esperarRegistro(lenta(80, { error: null }), Number('abc'))).toBe('gravado');
    expect(await esperarRegistro(lenta(80, { error: null }), 0)).toBe('gravado');
    expect(await esperarRegistro(lenta(80, { error: null }), -5)).toBe('gravado');
  });

  it('o teto padrão é generoso o bastante para o insert medido (~100ms)', () => {
    expect(TETO_REGISTRO_MS).toBeGreaterThanOrEqual(500);
  });

  it('⚠️ não deixa o timer pendurado depois que o insert responde', async () => {







    vi.useFakeTimers();
    try {
      const r = await esperarRegistro(Promise.resolve({ error: null }), 3000);
      expect(r).toBe('gravado');
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('⚠️ nunca derruba quem escaneou', () => {
  it('valor que não é promessa não quebra', async () => {
    expect(await esperarRegistro(null)).toBe('sem_promessa');
    expect(await esperarRegistro(undefined)).toBe('sem_promessa');
    expect(await esperarRegistro(42 as any)).toBe('sem_promessa');
    expect(await esperarRegistro({ nao: 'e uma promessa' } as any)).toBe('sem_promessa');
  });

  it('a função NUNCA rejeita, em nenhum caminho', async () => {
    const casos = [
      Promise.resolve({ error: null }),
      Promise.resolve({ error: { message: 'x' } }),
      Promise.reject(new Error('boom')),
      lenta(5000, { error: null }),
      null,
    ];
    for (const c of casos) {
      await expect(esperarRegistro(c as any, 40)).resolves.toBeTypeOf('string');
    }
  });
});

describe('⚠️⚠️ guarda estática · o registro não pode voltar a ser fire-and-forget', () => {
  const fs = require('fs');
  const path = require('path');
  const corpo: string = fs.readFileSync(
    path.join(__dirname, '../../backend/routes/redirecionador.js'),
    'utf8',
  );

  it('o redirecionador ESPERA o registro', () => {
    expect(corpo).toContain('await esperarRegistro(');
  });

  it('⚠️ o insert NÃO volta ao `.then(() => {}, () => {})`', () => {

    expect(corpo).not.toMatch(/link_curto_acesso[\s\S]{0,400}?\.then\(\s*\(\)\s*=>\s*\{\s*\}/);
  });

  it('⚠️⚠️ o registro vem ANTES do redirect', () => {

    const iRegistro = corpo.indexOf('await esperarRegistro(');
    const iRedirect = corpo.indexOf('res.redirect(302');
    expect(iRegistro).toBeGreaterThan(-1);
    expect(iRedirect).toBeGreaterThan(-1);
    expect(iRegistro).toBeLessThan(iRedirect);
  });
});
