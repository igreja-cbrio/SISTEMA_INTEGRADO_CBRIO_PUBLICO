import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chaveLimiteApp, ehChaveAnonima, normalizarIpParaChave } from '../../backend/utils/appRateLimit.js';





const bearer = (t: string) => ({ headers: { authorization: `Bearer ${t}` } });
const TOKEN = 'a'.repeat(60);

describe('chaveLimiteApp · quem paga a cota', () => {
  it('usuário autenticado tem bucket próprio (não divide com o WiFi)', () => {
    const a = chaveLimiteApp({ user: { id: 'user-1' }, ip: '200.1.1.1' });
    const b = chaveLimiteApp({ user: { id: 'user-2' }, ip: '200.1.1.1' });
    expect(a).toBe('u:user-1');
    expect(b).toBe('u:user-2');
    expect(a).not.toBe(b);
    expect(ehChaveAnonima(a)).toBe(false);
  });

  it('req.user vence o token: rota com authApp antes do limiter usa o id', () => {
    const chave = chaveLimiteApp({ user: { id: 'user-1' }, ...bearer(TOKEN) });
    expect(chave).toBe('u:user-1');
  });

  it('limiter ANTES do authApp cai no hash do Bearer, não no IP', () => {


    const chave = chaveLimiteApp({ ...bearer(TOKEN), ip: '200.1.1.1' });
    expect(chave.startsWith('t:')).toBe(true);
    expect(ehChaveAnonima(chave)).toBe(false);
  });

  it('o mesmo token dá a mesma chave, e tokens diferentes dão chaves diferentes', () => {
    expect(chaveLimiteApp(bearer(TOKEN))).toBe(chaveLimiteApp(bearer(TOKEN)));
    expect(chaveLimiteApp(bearer(TOKEN))).not.toBe(chaveLimiteApp(bearer('b'.repeat(60))));
  });

  it('NÃO guarda o JWT na chave (ela é hash curto)', () => {
    const chave = chaveLimiteApp(bearer(TOKEN));
    expect(chave).not.toContain(TOKEN);
    expect(chave.length).toBeLessThanOrEqual(34);
  });

  it('token curto/inventado NÃO cria bucket próprio — volta pro IP', () => {

    const chave = chaveLimiteApp({ ...bearer('xxx'), ip: '200.1.1.1' });
    expect(ehChaveAnonima(chave)).toBe(true);
    expect(chave).toBe('ip:200.1.1.1');
  });

  it('anônimo de verdade usa IP e é marcado como anônimo (paga o teto alto)', () => {
    const chave = chaveLimiteApp({ ip: '200.1.1.1' });
    expect(chave).toBe('ip:200.1.1.1');
    expect(ehChaveAnonima(chave)).toBe(true);
  });

  it('normalizador injetado é respeitado (usado só em teste)', () => {
    const chave = chaveLimiteApp({ ip: '2001:db8::1' }, () => 'X');
    expect(chave).toBe('ip:X');
  });

  it('IPv6 já vem normalizado por PADRÃO, sem normalizador injetado', () => {



    expect(chaveLimiteApp({ ip: '2001:db8::1' })).toBe('ip:2001:db8:0:0::/64');
    expect(chaveLimiteApp({ ip: '200.1.1.1' })).toBe('ip:200.1.1.1');
  });
});

describe('normalizarIpParaChave · agrupamento de IPv6 por /64', () => {
  it('dois endereços da MESMA /64 caem na mesma chave', () => {


    const a = normalizarIpParaChave('2001:db8:85a3:1::1');
    const b = normalizarIpParaChave('2001:db8:85a3:1::beef');
    expect(a).toBe(b);
  });

  it('/64 diferentes NÃO se misturam', () => {
    expect(normalizarIpParaChave('2001:db8:85a3:1::1'))
      .not.toBe(normalizarIpParaChave('2001:db8:85a3:2::1'));
  });

  it('IPv4 passa intacto e IPv4-mapeado volta a IPv4', () => {
    expect(normalizarIpParaChave('200.1.1.1')).toBe('200.1.1.1');
    expect(normalizarIpParaChave('::ffff:200.1.1.1')).toBe('200.1.1.1');
  });

  it('tolera zona de interface e caixa alta', () => {
    expect(normalizarIpParaChave('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
    expect(normalizarIpParaChave('2001:DB8::1')).toBe(normalizarIpParaChave('2001:db8::1'));
  });

  it('IP vazio/nulo não quebra (vira "desconhecido")', () => {
    expect(normalizarIpParaChave('')).toBe('desconhecido');
    expect(normalizarIpParaChave(null)).toBe('desconhecido');
    expect(normalizarIpParaChave(undefined)).toBe('desconhecido');
  });

  it('lixo que não é IP volta como veio, sem lançar', () => {
    expect(() => normalizarIpParaChave('nao-e-ip:::x')).not.toThrow();
  });
});












describe('guarda · não depender de export nomeado do express-rate-limit', () => {



  const semComentarios = (codigo: string) =>
    codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  const fonte = (rel: string) =>
    semComentarios(readFileSync(resolve(__dirname, '../../', rel), 'utf8'));

  it('nem o router do app nem a régua importam nomeados do pacote', () => {
    for (const arquivo of ['backend/routes/app.js', 'backend/utils/appRateLimit.js']) {
      const codigo = fonte(arquivo);
      expect(codigo, `${arquivo} não pode desestruturar require('express-rate-limit')`)
        .not.toMatch(/(?:const|let|var)\s*\{[^}]*\}\s*=\s*require\(\s*['"]express-rate-limit['"]/);
      expect(codigo, `${arquivo} não pode usar ipKeyGenerator do pacote`)
        .not.toMatch(/\bipKeyGenerator\s*\(/);
    }
  });

  it('o backend tem express-rate-limit PRÓPRIO — a versão da raiz não vale', () => {




    const pkgBackend = JSON.parse(
      readFileSync(resolve(__dirname, '../../backend/package.json'), 'utf8'),
    );
    const pkgRaiz = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8'));
    const vBackend = pkgBackend.dependencies?.['express-rate-limit'];
    const vRaiz = pkgRaiz.dependencies?.['express-rate-limit'];
    expect(vBackend, 'backend/package.json precisa declarar express-rate-limit').toBeTruthy();

    expect(String(vBackend).replace(/[^\d]*(\d+).*/, '$1')).toBe('7');
    expect(String(vRaiz).replace(/[^\d]*(\d+).*/, '$1')).toBe('8');
  });

  it('requisição sem IP e sem token não quebra a montagem da chave', () => {
    expect(chaveLimiteApp({})).toBe('ip:desconhecido');
    expect(chaveLimiteApp(undefined as never)).toBe('ip:desconhecido');
  });

  it('aceita "bearer" em caixa baixa (cliente que monta o header na mão)', () => {
    const chave = chaveLimiteApp({ headers: { authorization: `bearer ${TOKEN}` }, ip: '1.1.1.1' });
    expect(chave.startsWith('t:')).toBe(true);
  });
});
