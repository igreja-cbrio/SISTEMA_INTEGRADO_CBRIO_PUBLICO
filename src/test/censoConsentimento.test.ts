import { describe, it, expect } from 'vitest';

import {
  TIPOS_CONSENTIMENTO,
  tipoDeConsentimento,
  interpretarResposta,
  textoDaProva,
  consentimentosDaResposta,
  patchDoCadastro,
} from '../../backend/utils/censoConsentimento.js';
import { validarPerguntas } from '../../backend/utils/censoPerguntas.js';











describe('tipoDeConsentimento — a marca é DECLARATIVA, nunca o id', () => {
  it('lê a pergunta que declara acao: consentimento', () => {
    expect(tipoDeConsentimento({ acao: 'consentimento', consentimento_tipo: 'whatsapp' }))
      .toBe('whatsapp');
  });

  it('id chamado whatsapp_optin NÃO basta — o construtor renomeia id', () => {


    expect(tipoDeConsentimento({ id: 'whatsapp_optin', tipo: 'sim_nao' })).toBeNull();
  });

  it('tipo fora do CHECK do banco não vira consentimento', () => {


    expect(tipoDeConsentimento({ acao: 'consentimento', consentimento_tipo: 'newsletter' }))
      .toBeNull();
  });

  it('gatilho de cuidado não é consentimento', () => {
    expect(tipoDeConsentimento({ acao: 'cuidado', cuidado_tipo: 'oracao' })).toBeNull();
  });
});

describe('interpretarResposta — a NEGAÇÃO é avaliada primeiro', () => {
  it('"Não autorizo" é recusa, e não aceite por conter "autorizo"', () => {



    expect(interpretarResposta('Não autorizo')).toBe(false);
    expect(interpretarResposta('Nao aceito')).toBe(false);
    expect(interpretarResposta('Não, obrigado')).toBe(false);
  });

  it('aceita as formas afirmativas', () => {
    expect(interpretarResposta('Sim')).toBe(true);
    expect(interpretarResposta('Autorizo')).toBe(true);
    expect(interpretarResposta('Concordo')).toBe(true);
    expect(interpretarResposta(true)).toBe(true);
  });

  it('booleano false é recusa explícita', () => {
    expect(interpretarResposta(false)).toBe(false);
  });

  it('múltipla chega como lista; consentimento é uma escolha só', () => {
    expect(interpretarResposta(['Sim'])).toBe(true);
    expect(interpretarResposta(['Não autorizo'])).toBe(false);
  });

  it('o que não dá para entender devolve null — e null não grava nada', () => {

    expect(interpretarResposta('')).toBeNull();
    expect(interpretarResposta(undefined)).toBeNull();
    expect(interpretarResposta('talvez depois')).toBeNull();
  });
});

describe('textoDaProva — o que fica gravado é o que a pessoa LEU', () => {
  it('junta enunciado e descrição', () => {



    const t = textoDaProva({
      texto: 'Podemos te mandar mensagens no WhatsApp?',
      descricao: 'Avisos e convites da igreja. Cancele respondendo SAIR.',
    });
    expect(t).toContain('WhatsApp');
    expect(t).toContain('SAIR');
  });

  it('sem descrição, fica só o enunciado', () => {
    expect(textoDaProva({ texto: 'Autoriza uso de imagem?' })).toBe('Autoriza uso de imagem?');
  });
});

describe('consentimentosDaResposta', () => {
  const perguntas = [
    { id: 'nome', tipo: 'texto_curto', texto: 'Nome' },
    {
      id: 'q_wpp', tipo: 'sim_nao', acao: 'consentimento', consentimento_tipo: 'whatsapp',
      texto: 'Podemos te mandar mensagens no WhatsApp?',
      descricao: 'Avisos e convites. Cancele respondendo SAIR.',
    },
  ];

  it('a RECUSA é gravada, não descartada', () => {




    const { consentimentos } = consentimentosDaResposta(perguntas, { q_wpp: 'Não' });
    expect(consentimentos).toHaveLength(1);
    expect(consentimentos[0]).toMatchObject({ tipo: 'whatsapp', aceito: false });
    expect(consentimentos[0].texto).toContain('SAIR');
  });

  it('o aceite é gravado com o texto lido', () => {
    const { consentimentos } = consentimentosDaResposta(perguntas, { q_wpp: 'Sim' });
    expect(consentimentos[0]).toMatchObject({ tipo: 'whatsapp', aceito: true });
  });

  it('pergunta não respondida vira indefinido — nem aceite, nem recusa', () => {
    const { consentimentos, indefinidos } = consentimentosDaResposta(perguntas, {});
    expect(consentimentos).toHaveLength(0);
    expect(indefinidos).toEqual([{ tipo: 'whatsapp', pergunta_id: 'q_wpp' }]);
  });

  it('duas perguntas do mesmo tipo: vale a PRIMEIRA', () => {


    const dobrado = [
      { ...perguntas[1], id: 'a' },
      { ...perguntas[1], id: 'b' },
    ];
    const { consentimentos } = consentimentosDaResposta(dobrado, { a: 'Sim', b: 'Não' });
    expect(consentimentos).toHaveLength(1);
    expect(consentimentos[0].aceito).toBe(true);
  });

  it('questionário sem pergunta de consentimento não inventa nada', () => {
    const { consentimentos, indefinidos } = consentimentosDaResposta(
      [perguntas[0]], { nome: 'Maria' },
    );
    expect(consentimentos).toHaveLength(0);
    expect(indefinidos).toHaveLength(0);
  });
});

describe('patchDoCadastro — SÓ LIGA, NUNCA DESLIGA', () => {
  it('aceite liga o opt-in', () => {
    expect(patchDoCadastro([{ tipo: 'whatsapp', aceito: true }]))
      .toEqual({ whatsapp_optin: true });
  });

  it('recusa NÃO desliga — é ausência nesta porta, não revogação', () => {

    expect(patchDoCadastro([{ tipo: 'whatsapp', aceito: false }])).toBeNull();
  });

  it('consentimento de outro tipo não mexe no opt-in', () => {
    expect(patchDoCadastro([{ tipo: 'imagem', aceito: true }])).toBeNull();
  });

  it('quando liga, a data é a DO ACEITE — nunca "agora"', () => {


    expect(patchDoCadastro([{ tipo: 'whatsapp', aceito: true }], '2026-09-13T12:00:00Z'))
      .toEqual({ whatsapp_optin: true, whatsapp_optin_em: '2026-09-13T12:00:00Z' });
  });
});

describe('espelho com o validador do questionário', () => {
  it('o construtor aceita consentimento em Sim/Não e preserva o tipo', () => {
    const { ok, perguntas } = validarPerguntas([{
      id: 'q_wpp', tipo: 'sim_nao', texto: 'Podemos te mandar mensagens?',
      acao: 'consentimento', consentimento_tipo: 'whatsapp',
    }]);
    expect(ok).toBe(true);
    expect(perguntas[0]).toMatchObject({ acao: 'consentimento', consentimento_tipo: 'whatsapp' });

    expect(tipoDeConsentimento(perguntas[0])).toBe('whatsapp');
  });

  it('recusa consentimento em tipo que não produz sim/não auditável', () => {


    const { ok, erros } = validarPerguntas([{
      id: 'q', tipo: 'texto_longo', texto: 'Fale sobre',
      acao: 'consentimento', consentimento_tipo: 'whatsapp',
    }]);
    expect(ok).toBe(false);
    expect(erros.join(' ')).toContain('Sim/Não');
  });

  it('recusa consentimento_tipo fora do CHECK do banco', () => {
    const { ok, erros } = validarPerguntas([{
      id: 'q', tipo: 'sim_nao', texto: 'Aceita?',
      acao: 'consentimento', consentimento_tipo: 'newsletter',
    }]);
    expect(ok).toBe(false);
    expect(erros.join(' ')).toContain('consentimento_tipo');
  });

  it('os tipos são os três do CHECK vivo (conferido no catálogo em 13/09)', () => {
    expect([...TIPOS_CONSENTIMENTO].sort()).toEqual(['imagem', 'termos_lgpd', 'whatsapp']);
  });
});
