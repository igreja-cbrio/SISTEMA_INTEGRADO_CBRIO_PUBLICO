import { describe, it, expect } from 'vitest';
import { hrefWhatsapp } from '@/lib/conversas';





describe('hrefWhatsapp · 55 só quando o número é BR sem código de país', () => {
  it('celular com DDD (11 dígitos) ganha o 55', () => {
    expect(hrefWhatsapp('21999998888')).toBe('https://wa.me/5521999998888');
  });

  it('fixo com DDD (10 dígitos) ganha o 55', () => {
    expect(hrefWhatsapp('2133334444')).toBe('https://wa.me/552133334444');
  });

  it('número que JÁ tem código de país não ganha outro 55', () => {
    expect(hrefWhatsapp('5521999998888')).toBe('https://wa.me/5521999998888');
  });

  it('número com 12-13 dígitos é preservado (já tem país)', () => {
    expect(hrefWhatsapp('351912345678')).toBe('https://wa.me/351912345678');
  });







  it('estrangeiro de 11 dígitos AINDA leva 55 · gap conhecido', () => {
    expect(hrefWhatsapp('41000000018')).toBe('https://wa.me/5541000000018');
  });

  it('limpa máscara, parênteses, espaço e hífen', () => {
    expect(hrefWhatsapp('(21) 99999-8888')).toBe('https://wa.me/5521999998888');
    expect(hrefWhatsapp('+55 21 99999-8888')).toBe('https://wa.me/5521999998888');
  });

  it('curto demais devolve null (o chamador esconde o botão)', () => {
    expect(hrefWhatsapp('900000015')).toBeNull();
    expect(hrefWhatsapp('99998888')).toBeNull();
    expect(hrefWhatsapp('')).toBeNull();
    expect(hrefWhatsapp(null)).toBeNull();
    expect(hrefWhatsapp(undefined)).toBeNull();
  });

  it('aceita número em vez de string', () => {
    expect(hrefWhatsapp(21999998888)).toBe('https://wa.me/5521999998888');
  });

  it('texto opcional vai encodado', () => {
    expect(hrefWhatsapp('21999998888', 'Olá, tudo bem?'))
      .toBe('https://wa.me/5521999998888?text=Ol%C3%A1%2C%20tudo%20bem%3F');
  });
});
