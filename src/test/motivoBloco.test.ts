import { describe, it, expect } from 'vitest';
import { motivoFalhaBloco } from '@/pages/ministerial/totemKids/lib/motivoBloco';






describe('motivoFalhaBloco · por que o bloco offline está vazio', () => {
  it('403 fala de PERMISSÃO e manda procurar quem cuida do sistema', () => {
    const m = motivoFalhaBloco({ status: 403 });
    expect(m).toMatch(/permiss/i);
    expect(m).toMatch(/n[ií]vel 2/i);
    expect(m).toMatch(/sistema/i);
  });

  it('401 cai no mesmo caminho do 403 (é credencial, não rede)', () => {
    expect(motivoFalhaBloco({ status: 401 })).toBe(motivoFalhaBloco({ status: 403 }));
  });

  it('⚠️ 503 CARREGA o detalhe do Postgres — é ele que aponta a causa', () => {
    const m = motivoFalhaBloco({
      status: 503,
      detalhe: 'function public.fn_kids_reservar_codigos does not exist',
    });
    expect(m).toContain('fn_kids_reservar_codigos');
    expect(m).toMatch(/sistema/i);
  });

  it('503 sem detalhe não deixa traço solto na frase', () => {
    const m = motivoFalhaBloco({ status: 503 });
    expect(m).not.toMatch(/—\s*\./);
    expect(m).not.toMatch(/undefined|null/);
    expect(m).toMatch(/sistema/i);
  });

  it('503 com detalhe só de espaço é tratado como sem detalhe', () => {
    expect(motivoFalhaBloco({ status: 503, detalhe: '   ' })).toBe(motivoFalhaBloco({ status: 503 }));
  });

  it('outro 5xx fala de falha do servidor', () => {
    expect(motivoFalhaBloco({ status: 500 })).toMatch(/servidor/i);
  });

  it('4xx inesperado nomeia o código para dar o que investigar', () => {
    expect(motivoFalhaBloco({ status: 418 })).toContain('418');
  });







  it('sem status = rede: diz que volta sozinho e NÃO manda chamar ninguém', () => {
    for (const e of [new Error('Failed to fetch'), {}, null, undefined]) {
      const m = motivoFalhaBloco(e);
      expect(m).toMatch(/internet|servidor agora/i);
      expect(m).toMatch(/sozinho/i);
      expect(m).not.toMatch(/fale com/i);
    }
  });

  it('status como string não é lido como status (não inventa código)', () => {
    const m = motivoFalhaBloco({ status: '403' as unknown as number });
    expect(m).toBe(motivoFalhaBloco(null));
  });







  it('401 real (sem status, só mensagem) manda LOGAR DE NOVO, não esperar rede', () => {
    for (const m of ['Sessão expirada. Faça login novamente.', 'Sua sessão expirou. Redirecionando para o login...', 'Não autorizado. Verifique se o backend está configurado corretamente.']) {
      const t = motivoFalhaBloco(new Error(m));
      expect(t).toMatch(/login/i);
      expect(t).not.toMatch(/internet/i);
    }
  });







  it('TypeError de programa NÃO é rede: diz que é do totem e manda avisar', () => {
    for (const m of ['A.reservarCodigos is not a function', "Cannot read properties of undefined (reading 'x')"]) {
      const t = motivoFalhaBloco(new TypeError(m));
      expect(t).toMatch(/pr[óo]prio totem|falha no pr[óo]prio/i);
      expect(t).toMatch(/avise|sistema/i);


      expect(t).not.toMatch(/sozinho|internet voltar/i);
      expect(t).toContain(m);
    }
  });

  it('⚠️ "Failed to fetch" também é TypeError, e SEGUE sendo rede', () => {
    const t = motivoFalhaBloco(new TypeError('Failed to fetch'));
    expect(t).toMatch(/internet/i);
    expect(t).not.toMatch(/pr[óo]prio totem/i);
  });

  it('nunca devolve frase vazia', () => {
    for (const e of [null, undefined, {}, { status: 403 }, { status: 503 }, { status: 500 }]) {
      expect(motivoFalhaBloco(e).trim().length).toBeGreaterThan(20);
    }
  });
});
