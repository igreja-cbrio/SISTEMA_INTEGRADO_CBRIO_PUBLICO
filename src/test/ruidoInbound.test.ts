import { describe, it, expect } from 'vitest';
import { classificarRuido, ehDigitoDeMenu } from '../../backend/utils/ruidoInbound.js';










describe('auto-resposta de empresa · casa (casos sintéticos)', () => {
  const casos = [
    "Bem-vindo à Oficina de Demonstração. Em que podemos ajudar?",
    "Agradecemos a mensagem. Não estamos disponíveis no momento.",
    "Bem-vindo à Loja Modelo. Nossa equipe vai atender em breve.",
    "Mensagem automática: retorno em breve.",
    "Estamos fora do horário de atendimento.",
    "A Loja Exemplo agradece seu contato. Como podemos ajudar?",
    "Sou uma corretora de seguros. Estou aqui para ajudar.",
    "Sou a fonoaudióloga de demonstração. Estou aqui para ouvir.",
    "Conheça nosso trabalho em https://example.test/portfolio",
    "Oferecemos serviços. Veja nosso site https://example.test",
    "Nosso consultório agradece seu contato.",
    "Atendimento automático da loja de demonstração.",
    "Resposta automática: tentaremos novamente em breve.",
    "Agradeço seu contato. Como posso ajudar?",
    "Bem-vindo. Como podemos ajudar?",
    "Agradecemos sua mensagem. Responderemos assim que possível.",
    "Conheça nossos produtos da loja de demonstração."
];
  for (const t of casos) {
    it(t.slice(0, 50), () => {
      const r = classificarRuido(t);
      expect(r.tipo).toBe('auto_resposta_empresa');
      expect(r.sinais.length).toBeGreaterThan(0);
    });
  }
});

describe('auto-resposta de empresa · NÃO casa (gente de verdade)', () => {
  const casos = [
    "Quem coordena o grupo de demonstração?",
    "Bom dia, vou atualizar o cadastro de exemplo.",
    "Obrigado pelo convite; confirmo para a próxima semana.",
    "Posso colaborar com a atividade de demonstração.",
    "Obrigado pela aprovação. Onde encontro o endereço?",
    "Pronto para ajudar.",
    "Quando começa a atividade?",
    "Existe um link para inscrição?",
    "Há pessoas de exemplo que ainda não constam na lista.",
    "Olá, Pessoa Exemplo! Recebemos sua inscrição na atividade de demonstração.",
    "Boas-vindas ao grupo de conexão Exemplo. Seu pedido foi aprovado.",
    "Seja bem-vindo à CBRio! Como podemos ajudar? https://example.test"
];
  for (const t of casos) {
    it(t.slice(0, 50), () => {
      expect(classificarRuido(t).tipo).not.toBe('auto_resposta_empresa');
    });
  }
  it('um sinal FRACO sozinho não basta (o efeito é finalizar a conversa)', () => {
    expect(classificarRuido('Seja bem-vindo!').tipo).toBeNull();
    expect(classificarRuido('Olha o nosso site www.igreja.org').tipo).toBeNull();
  });
  it('texto vazio ou curto nunca casa', () => {
    expect(classificarRuido('').tipo).toBeNull();
    expect(classificarRuido('ok').tipo).toBeNull();
    expect(classificarRuido(null).tipo).toBeNull();
  });
});

describe('"não sou eu" · casa (casos sintéticos)', () => {
  const casos = [
    "Número errado: este contato é de demonstração.",
    "Eu não sou membro.",
    "Não sou a Pessoa A. Houve um engano com a Pessoa B.",
    "Não sou a pessoa citada.",
    "Olá, não sou o contato procurado.",
    "Não sou membro da igreja.",
    "Estou congregando em outra igreja.",
    "Sou da igreja de demonstração.",
    "Solicito remover meu cadastro.",
    "Não estamos mais aí.",
    "Por favor retire meu número."
];
  for (const t of casos) {
    it(t.slice(0, 50), () => { expect(classificarRuido(t).tipo).toBe('nao_sou_eu'); });
  }
});

describe('"não sou eu" · NÃO casa', () => {
  const casos = [
    "Sou visitante de demonstração.",
    "Este telefone é meu.",
    "Não sou de faltar, pretendo comparecer.",
    "Não sou muito de usar mensagens.",
    "Escolhi o grupo de exemplo errado. Posso corrigir?",
    "Sou da igreja CBRio."
];
  for (const t of casos) {
    it(t.slice(0, 50), () => { expect(classificarRuido(t).tipo).not.toBe('nao_sou_eu'); });
  }
  it('empresa vence "não sou eu" quando os dois casam (a mensagem é da máquina, não da pessoa)', () => {
    const r = classificarRuido('Seja bem-vindo à Loja X! Não estamos disponíveis no momento. Não sou um atendente humano.');
    expect(r.tipo).toBe('auto_resposta_empresa');
  });
});

describe('dígito do menu antigo (só o varredor usa)', () => {
  it('casa os formatos aceitos', () => {
    for (const t of ['2', '3', '6', '2 - Grupos', '1Cuidados', '2 grupos', '5.']) expect(ehDigitoDeMenu(t)).toBe(true);
  });
  it('não casa número que é resposta de verdade', () => {
    for (const t of ['somos 7', '21 99999-8888', '2 pessoas vão', '19h', '']) expect(ehDigitoDeMenu(t)).toBe(false);
  });
});
