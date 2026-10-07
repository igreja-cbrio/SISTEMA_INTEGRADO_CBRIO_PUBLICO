import { describe, it, expect } from 'vitest';
import {
  pixValido, validarFicha, normalizarFicha, semSegredos, ehContratada,
  estadoFicha, bloqueioFolha, NUNCA_NO_PUBLICO, REGIMES,
} from '../../backend/utils/fichaContratada.js';


const OK = {
  razao_social: 'FULANO SERVICOS LTDA',
  cnpj: '11222333000181',
  regime_tributario: 'MEI',
  endereco_sede: 'Rua X, 10 - Rio de Janeiro/RJ',
  email_contratual: 'fulano@exemplo.com',
  rep_nome: 'Fulano de Tal',
  rep_cpf: '11144477735',
  pix_tipo: 'cnpj',
  pix_chave: '11222333000181',
  conta_titular: 'FULANO SERVICOS LTDA',
  titular_confere: true,
};

describe('pixValido · valida por TIPO DECLARADO', () => {
  it('⚠️⚠️ CPF e CNPJ conferem o DÍGITO VERIFICADOR', () => {


    expect(pixValido('cpf', '11144477735')).toBe(true);
    expect(pixValido('cpf', '11111111111')).toBe(false);
    expect(pixValido('cnpj', '11222333000181')).toBe(true);
    expect(pixValido('cnpj', '11222333000180')).toBe(false);
  });

  it('⚠️⚠️ 11 dígitos é CPF OU telefone — o tipo declarado decide', () => {

    expect(pixValido('telefone', '21999998888')).toBe(true);
    expect(pixValido('cpf', '21999998888')).toBe(false);
  });

  it('telefone aceita com ou sem o 55 do país', () => {
    expect(pixValido('telefone', '5521999998888')).toBe(true);
    expect(pixValido('telefone', '2199999888')).toBe(true);
    expect(pixValido('telefone', '999998888')).toBe(false);
  });

  it('e-mail e aleatória (EVP)', () => {
    expect(pixValido('email', 'a@b.com')).toBe(true);
    expect(pixValido('email', 'sem-arroba')).toBe(false);
    expect(pixValido('aleatoria', '123e4567-e89b-12d3-a456-426614174000')).toBe(true);
    expect(pixValido('aleatoria', 'qualquer-coisa')).toBe(false);
  });

  it('⚠️ tipo fora da lista NUNCA passa (fail-closed)', () => {
    expect(pixValido('pix', 'x')).toBe(false);
    expect(pixValido('', 'x')).toBe(false);
    expect(pixValido('cpf', '')).toBe(false);
  });
});

describe('validarFicha', () => {
  it('a ficha mínima passa', () => {
    expect(validarFicha(OK).ok).toBe(true);
  });

  it('⚠️ devolve TODOS os erros de uma vez, não o primeiro', () => {


    const { erros } = validarFicha({});
    expect(Object.keys(erros).length).toBeGreaterThan(5);
  });

  it('CNPJ e CPF com DV errado são recusados', () => {
    expect(validarFicha({ ...OK, cnpj: '11222333000180' }).erros.cnpj).toBeTruthy();
    expect(validarFicha({ ...OK, rep_cpf: '11111111111' }).erros.rep_cpf).toBeTruthy();
  });

  it('⚠️ inscrição municipal NÃO é obrigatória (MEI normalmente não tem)', () => {
    const { inscricao_municipal, ...sem } = { ...OK, inscricao_municipal: '' };
    expect(validarFicha(sem).ok).toBe(true);
  });

  it('regime fora da lista é recusado', () => {
    expect(validarFicha({ ...OK, regime_tributario: 'LUCRO XPTO' }).erros.regime_tributario).toBeTruthy();
    for (const r of REGIMES) expect(validarFicha({ ...OK, regime_tributario: r }).ok).toBe(true);
  });

  it('⚠️⚠️ titular diferente NÃO bloqueia, mas EXIGE motivo', () => {



    expect(validarFicha({ ...OK, titular_confere: false }).erros.titular_motivo).toBeTruthy();
    expect(validarFicha({ ...OK, titular_confere: false, titular_motivo: 'Conta PF do MEI' }).ok).toBe(true);
  });

  it('⚠️ não declarar se o titular confere é erro (o silêncio não vale por "sim")', () => {
    const { titular_confere, ...sem } = OK;
    expect(validarFicha(sem).erros.titular_confere).toBeTruthy();
  });
});

describe('normalizarFicha', () => {
  it('⚠️ documento vai digits-only — é assim que a conciliação da folha casa', () => {
    const n = normalizarFicha({ ...OK, cnpj: '11.222.333/0001-81', rep_cpf: '111.444.777-35' });
    expect(n.cnpj).toBe('11222333000181');
    expect(n.rep_cpf).toBe('11144477735');
  });

  it('e-mail em minúsculas, vazio vira null', () => {
    const n = normalizarFicha({ email_contratual: '  Fulano@Exemplo.COM ', banco: '   ' });
    expect(n.email_contratual).toBe('fulano@exemplo.com');
    expect(n.banco).toBeNull();
  });

  it('⚠️ titular_confere só aceita booleano — string não vira "sim"', () => {
    expect(normalizarFicha({ titular_confere: 'sim' }).titular_confere).toBeNull();
    expect(normalizarFicha({ titular_confere: true }).titular_confere).toBe(true);
    expect(normalizarFicha({ titular_confere: false }).titular_confere).toBe(false);
  });
});

describe('semSegredos · o que NUNCA sai numa resposta pública', () => {
  it('⚠️⚠️ IP e user-agent do aceite NÃO saem — o link é encaminhável', () => {



    const fora: any = semSegredos({
      ...OK, aceite_em: '2026-09-21T12:00:00Z', aceite_texto: 'Declaro...',
      aceite_ip: '189.113.142.122', aceite_user_agent: 'Mozilla/5.0',
    });
    expect(fora).not.toHaveProperty('aceite_ip');
    expect(fora).not.toHaveProperty('aceite_user_agent');

    expect(fora.aceite_em).toBeTruthy();
    expect(fora.aceite_texto).toBeTruthy();
  });

  it('⚠️⚠️ banco, conta, PIX e CPF do representante não saem', () => {


    const fora = semSegredos({ ...OK, banco: 'X', agencia: '1', conta: '2' });
    for (const c of NUNCA_NO_PUBLICO) expect(fora).not.toHaveProperty(c);
    expect(fora.razao_social).toBe(OK.razao_social);
  });
});

describe('ehContratada · só PJ recebe a ficha', () => {
  it('PJ e PJ+ recebem', () => {
    expect(ehContratada('PJ')).toBe(true);
    expect(ehContratada('PJ+')).toBe(true);
    expect(ehContratada('pj')).toBe(true);
  });

  it('⚠️⚠️ CLT e PREBENDA NÃO recebem', () => {



    expect(ehContratada('CLT')).toBe(false);
    expect(ehContratada('PREBENDA')).toBe(false);
  });

  it('⚠️ fail-closed: tipo desconhecido ou vazio não recebe', () => {
    expect(ehContratada('ESTAGIO')).toBe(false);
    expect(ehContratada(null)).toBe(false);
    expect(ehContratada('')).toBe(false);
  });
});

describe('estadoFicha', () => {
  it('⚠️⚠️ CLT é "não aplicável", NUNCA pendência', () => {

    const e = estadoFicha({ tipo_contrato: 'CLT' });
    expect(e.aplicavel).toBe(false);
    expect(e.faltando).toEqual([]);
  });

  it('PJ sem ficha lista tudo que falta', () => {
    const e = estadoFicha({ tipo_contrato: 'PJ' });
    expect(e.aplicavel).toBe(true);
    expect(e.preenchida).toBe(false);
    expect(e.faltando.length).toBeGreaterThan(5);
  });

  it('PJ com ficha completa e aceita', () => {
    const e = estadoFicha({ tipo_contrato: 'PJ', ficha_contratada: { ...OK, aceite_em: '2026-09-21T12:00:00Z' } });
    expect(e.completa).toBe(true);
    expect(e.aceita).toBe(true);
  });

  it('⚠️ preenchida mas incompleta nomeia o que falta', () => {
    const e = estadoFicha({ tipo_contrato: 'PJ', ficha_contratada: { ...OK, pix_chave: '' } });
    expect(e.preenchida).toBe(true);
    expect(e.completa).toBe(false);
    expect(e.faltando.join(' ')).toContain('PIX');
  });

  it('⚠️ completa sem aceite NÃO é aceita', () => {
    const e = estadoFicha({ tipo_contrato: 'PJ', ficha_contratada: OK });
    expect(e.completa).toBe(true);
    expect(e.aceita).toBe(false);
  });
});

describe('bloqueioFolha', () => {
  it('⚠️⚠️ CLT nunca é bloqueado', () => {
    expect(bloqueioFolha({ tipo_contrato: 'CLT' }).bloqueado).toBe(false);
  });

  it('PJ sem ficha é bloqueado, com motivo legível', () => {
    const b = bloqueioFolha({ tipo_contrato: 'PJ' });
    expect(b.bloqueado).toBe(true);
    expect(b.motivo).toMatch(/não preenchida/i);
  });

  it('PJ com ficha incompleta é bloqueado e o motivo DIZ o que falta', () => {
    const b = bloqueioFolha({ tipo_contrato: 'PJ', ficha_contratada: { ...OK, cnpj: '' } });
    expect(b.bloqueado).toBe(true);
    expect(b.motivo).toContain('CNPJ');
  });

  it('PJ com ficha completa libera', () => {
    expect(bloqueioFolha({ tipo_contrato: 'PJ', ficha_contratada: OK }).bloqueado).toBe(false);
  });

  it('⚠️ o bloqueio NÃO exige aceite — só o dado completo', () => {



    const b = bloqueioFolha({ tipo_contrato: 'PJ', ficha_contratada: OK });
    expect(b.bloqueado).toBe(false);
  });
});
