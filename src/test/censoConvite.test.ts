import { describe, it, expect } from 'vitest';

import {
  TETO_RODADA_WHATSAPP,
  whatsappPronto,
  semCpf,
  primeiroNome,
  emailUtilizavel,
  canaisDaPessoa,
  limitarPorTeto,
  montarLinkCenso,
} from '../../backend/utils/censoConvite.js';





describe('semCpf', () => {
  it('trata ausência e formato incompleto como sem CPF', () => {
    expect(semCpf(null)).toBe(true);
    expect(semCpf('')).toBe(true);
    expect(semCpf('123')).toBe(true);
    expect(semCpf('1234567890')).toBe(true);
  });

  it('aceita CPF de 11 dígitos, com ou sem máscara', () => {
    expect(semCpf('12345678901')).toBe(false);
    expect(semCpf('123.456.789-01')).toBe(false);
  });
});

describe('primeiroNome', () => {
  it('usa só o primeiro token', () => {
    expect(primeiroNome('Maria Rosa De Oliveira')).toBe('Maria');
    expect(primeiroNome('  Ana   Carolina ')).toBe('Ana');
  });


  it('nome vazio vira vocativo neutro, nunca string vazia', () => {
    expect(primeiroNome('')).toBe('tudo bem');
    expect(primeiroNome(null)).toBe('tudo bem');
    expect(primeiroNome('   ')).toBe('tudo bem');
  });
});

describe('emailUtilizavel', () => {
  it('aceita e-mail comum', () => {
    expect(emailUtilizavel('pessoa@gmail.com')).toBe(true);
    expect(emailUtilizavel('  Pessoa@CBRio.org  ')).toBe(true);
  });

  it('recusa endereço malformado', () => {
    expect(emailUtilizavel('')).toBe(false);
    expect(emailUtilizavel('pessoa')).toBe(false);
    expect(emailUtilizavel('pessoa@sem-tld')).toBe(false);
  });



  it('recusa o relay do "Entrar com Apple"', () => {
    expect(emailUtilizavel('5rr9697fp4@privaterelay.appleid.com')).toBe(false);
  });
});

describe('canaisDaPessoa', () => {
  it('libera os dois canais quando há telefone alcançável e e-mail', () => {
    const r = canaisDaPessoa({ telefone: '21999998888', email: 'a@b.com' });
    expect(r).toMatchObject({ whatsapp: true, email: true });
    expect(r.motivos).toEqual([]);
  });

  it('separa "sem telefone" de "número errado"', () => {
    expect(canaisDaPessoa({ email: 'a@b.com' }).motivos).toContain('sem_telefone');

    expect(canaisDaPessoa({ telefone: '900000015', email: 'a@b.com' }).motivos)
      .toContain('numero_errado');
  });



  it('não manda WhatsApp para número que o envio não alcança', () => {
    expect(canaisDaPessoa({ telefone: '900000015' }).whatsapp).toBe(false);
    expect(canaisDaPessoa({ telefone: '21899998888' }).whatsapp).toBe(false);
  });

  it('DDD 55 (Santa Maria/RS) é legítimo e não é confundido com DDI', () => {
    expect(canaisDaPessoa({ telefone: '55999998888' }).whatsapp).toBe(true);
  });

  it('respeita o opt-in só quando ele é obrigatório', () => {
    const pessoa = { telefone: '21999998888', whatsapp_optin: false };
    expect(canaisDaPessoa(pessoa, { optinObrigatorio: false }).whatsapp).toBe(true);
    const gated = canaisDaPessoa(pessoa, { optinObrigatorio: true });
    expect(gated.whatsapp).toBe(false);
    expect(gated.motivos).toContain('sem_optin');
  });

  it('canal não pedido não é avaliado nem gera motivo', () => {
    const r = canaisDaPessoa({ telefone: '21999998888' }, { canais: ['whatsapp'] });
    expect(r.email).toBe(false);
    expect(r.motivos).not.toContain('sem_email');
  });
});

describe('limitarPorTeto', () => {
  const lista = Array.from({ length: 500 }, (_, i) => i);

  it('corta no teto e DEVOLVE quantos ficaram', () => {
    const r = limitarPorTeto(lista, 200);
    expect(r.envia).toHaveLength(200);
    expect(r.adiados).toBe(300);
  });

  it('lista menor que o teto sai inteira, sem adiados', () => {
    const r = limitarPorTeto([1, 2, 3], 200);
    expect(r.envia).toHaveLength(3);
    expect(r.adiados).toBe(0);
  });


  it('teto inválido não libera envio', () => {
    expect(limitarPorTeto(lista, 0)).toMatchObject({ adiados: 500 });
    expect(limitarPorTeto(lista, -1).envia).toHaveLength(0);
    expect(limitarPorTeto(lista, NaN).envia).toHaveLength(0);
  });

  it('lista ausente não estoura', () => {
    expect(limitarPorTeto(undefined, 200)).toMatchObject({ envia: [], adiados: 0 });
  });
});

describe('teto da rodada', () => {




  it('não passa de 250 por rodada', () => {
    expect(TETO_RODADA_WHATSAPP).toBeLessThanOrEqual(250);
    expect(TETO_RODADA_WHATSAPP).toBeGreaterThan(0);
  });
});

describe('whatsappPronto · semáforo do canal', () => {




  it('sem a env o canal está FECHADO', () => {
    expect(whatsappPronto({})).toBe(false);
    expect(whatsappPronto({ WHATSAPP_TEMPLATE_CENSO_ATUALIZACAO: '' })).toBe(false);
    expect(whatsappPronto({ WHATSAPP_TEMPLATE_CENSO_ATUALIZACAO: '   ' })).toBe(false);
  });

  it('com a env preenchida o canal abre', () => {
    expect(whatsappPronto({ WHATSAPP_TEMPLATE_CENSO_ATUALIZACAO: 'atualizacao_cadastro' })).toBe(true);
  });



  it('o default do nome do template não abre o canal sozinho', () => {
    expect(whatsappPronto({ WHATSAPP_TEMPLATE_LANG: 'pt_BR' })).toBe(false);
  });
});

describe('montarLinkCenso', () => {
  it('usa o mesmo ?censo=1 do QR impresso', () => {
    expect(montarLinkCenso('https://cbrio.org'))
      .toBe('https://cbrio.org/cadastro-membresia?censo=1');
  });

  it('tolera barra no fim e base ausente', () => {
    expect(montarLinkCenso('https://cbrio.org///'))
      .toBe('https://cbrio.org/cadastro-membresia?censo=1');
    expect(montarLinkCenso(null)).toContain('https://cbrio.org/cadastro-membresia');
  });



  it('com membroId anexa o token assinado', () => {
    process.env.CRON_SECRET = 'segredo-de-teste';
    const link = montarLinkCenso('https://cbrio.org', '5211a14f-3f5d-4225-96ef-81fb49af961c');
    expect(link).toMatch(/^https:\/\/cbrio\.org\/cadastro-membresia\?censo=1&t=[0-9a-f]{32}\.[0-9a-f]{20}$/);
  });

  it('pessoas diferentes recebem links diferentes', () => {
    process.env.CRON_SECRET = 'segredo-de-teste';
    expect(montarLinkCenso('https://cbrio.org', '5211a14f-3f5d-4225-96ef-81fb49af961c'))
      .not.toBe(montarLinkCenso('https://cbrio.org', '44c2ee91-e7e2-486e-8406-045102c8b0af'));
  });


  it('sem segredo cai no link genérico, não em erro', () => {
    const antes = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    delete process.env.CENSO_TOKEN_SECRET;
    expect(montarLinkCenso('https://cbrio.org', '5211a14f-3f5d-4225-96ef-81fb49af961c'))
      .toBe('https://cbrio.org/cadastro-membresia?censo=1');
    if (antes) process.env.CRON_SECRET = antes;
  });
});
