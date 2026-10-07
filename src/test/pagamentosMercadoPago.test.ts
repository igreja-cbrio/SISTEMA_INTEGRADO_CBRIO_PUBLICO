















import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mp = require('../../backend/services/pagamentos/providers/mercadopago.js');
const {
  ambienteDeclarado, conferirLiveMode, statusCanonico, metodoDeMp,
  dadosDaOrder, dadosDoPayment, expiracaoPix, paraCentavos, paraReais,
  STATUS_POR_ORDER, STATUS_POR_PAYMENT,
} = mp._internos;

const ENV_ORIGINAL = { ...process.env };

beforeEach(() => {
  process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-fake-para-teste';
  process.env.MERCADOPAGO_AMBIENTE = 'teste';
  delete process.env.VERCEL_ENV;
});

afterEach(() => {
  process.env = { ...ENV_ORIGINAL };
  vi.restoreAllMocks();
});

describe('mercadopago · ambiente (não há prefixo no token)', () => {
  it('respeita a env explícita nas duas grafias', () => {
    process.env.MERCADOPAGO_AMBIENTE = 'producao';
    expect(ambienteDeclarado()).toBe('producao');
    process.env.MERCADOPAGO_AMBIENTE = 'sandbox';
    expect(ambienteDeclarado()).toBe('teste');
  });

  it('sem env, preview da Vercel é TESTE mesmo com NODE_ENV=production', () => {



    delete process.env.MERCADOPAGO_AMBIENTE;
    process.env.VERCEL_ENV = 'preview';
    process.env.NODE_ENV = 'production';
    expect(ambienteDeclarado()).toBe('teste');
  });

  it('sem env, production da Vercel é PRODUÇÃO', () => {
    delete process.env.MERCADOPAGO_AMBIENTE;
    process.env.VERCEL_ENV = 'production';
    expect(ambienteDeclarado()).toBe('producao');
  });
});

describe('mercadopago · guarda de live_mode', () => {
  it('LANÇA quando declaramos teste e o MP responde live_mode=true', () => {
    process.env.MERCADOPAGO_AMBIENTE = 'teste';
    expect(() => conferirLiveMode({ live_mode: true })).toThrow(/dinheiro real/i);
  });

  it('LANÇA quando declaramos produção e o MP responde live_mode=false', () => {
    process.env.MERCADOPAGO_AMBIENTE = 'producao';
    expect(() => conferirLiveMode({ live_mode: false })).toThrow(/TESTE em produção/i);
  });

  it('passa quando batem', () => {
    process.env.MERCADOPAGO_AMBIENTE = 'producao';
    expect(() => conferirLiveMode({ live_mode: true })).not.toThrow();
  });

  it('não inventa erro quando o payload não traz live_mode', () => {


    expect(() => conferirLiveMode({ id: 'x' })).not.toThrow();
    expect(() => conferirLiveMode(null)).not.toThrow();
  });
});

describe('mercadopago · assinatura do webhook', () => {
  const SEGREDO = 'segredo-do-painel';

  function assinar(id: string, requestId: string, ts: string) {
    const manifesto = `id:${id};request-id:${requestId};ts:${ts};`;
    return crypto.createHmac('sha256', SEGREDO).update(manifesto).digest('hex');
  }

  it('aceita assinatura válida montada com data.id do QUERY STRING', () => {
    const ts = '1704908010';
    const reqId = 'abc-123';
    const v1 = assinar('12345', reqId, ts);
    const r = mp.verificarAssinatura(
      '{}',
      { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': reqId },
      SEGREDO,
      { query: { 'data.id': '12345' } },
    );
    expect(r.ok).toBe(true);
  });

  it('minusculiza o ULID da Orders API antes de montar o manifesto', () => {



    const ts = '1704908010';
    const reqId = 'req-9';
    const v1 = assinar('ord01j5abc', reqId, ts);
    const r = mp.verificarAssinatura(
      '{}',
      { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': reqId },
      SEGREDO,
      { query: { 'data.id': 'ORD01J5ABC' } },
    );
    expect(r.ok).toBe(true);
  });

  it('recusa quando a assinatura não confere', () => {
    const r = mp.verificarAssinatura(
      '{}',
      { 'x-signature': 'ts=1,v1=' + 'a'.repeat(64), 'x-request-id': 'r' },
      SEGREDO,
      { query: { 'data.id': '1' } },
    );
    expect(r.ok).toBe(false);
  });

  it('é FAIL-CLOSED sem segredo configurado', () => {


    const r = mp.verificarAssinatura('{}', { 'x-signature': 'ts=1,v1=x' }, '');
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/SECRET/i);
  });

  it('recusa header ausente ou malformado', () => {
    expect(mp.verificarAssinatura('{}', {}, SEGREDO).ok).toBe(false);
    expect(mp.verificarAssinatura('{}', { 'x-signature': 'lixo' }, SEGREDO).ok).toBe(false);
  });

  it('cai no data.id do CORPO quando a query não traz (entrega sem query string)', () => {
    const ts = '99';
    const v1 = assinar('777', '', ts);
    const r = mp.verificarAssinatura(
      '{}',
      { 'x-signature': `ts=${ts},v1=${v1}` },
      SEGREDO,
      { payload: { data: { id: '777' } } },
    );
    expect(r.ok).toBe(true);
  });
});

describe('mercadopago · tradução de status', () => {
  it('Orders: processed/accredited é PAGO', () => {
    expect(statusCanonico('processed', 'accredited', STATUS_POR_ORDER)).toBe('pago');
  });

  it('Orders: action_required/waiting_transfer (Pix emitido) NÃO é pago', () => {
    expect(statusCanonico('action_required', 'waiting_transfer', STATUS_POR_ORDER))
      .toBe('aguardando_pagamento');
  });

  it('Payments: authorized NÃO é pago (autorizado ≠ capturado)', () => {


    expect(statusCanonico('authorized', 'pending_capture', STATUS_POR_PAYMENT))
      .toBe('aguardando_pagamento');
  });






  it('Payments: approved é PAGO e rejected NÃO vira status terminal', () => {
    expect(statusCanonico('approved', 'accredited', STATUS_POR_PAYMENT)).toBe('pago');
    expect(statusCanonico('rejected', 'cc_rejected_bad_filled_security_code', STATUS_POR_PAYMENT))
      .toBeNull();
  });

  it('partially_refunded vence o status cru nas DUAS APIs', () => {

    expect(statusCanonico('processed', 'partially_refunded', STATUS_POR_ORDER))
      .toBe('estornado_parcial');
    expect(statusCanonico('approved', 'partially_refunded', STATUS_POR_PAYMENT))
      .toBe('estornado_parcial');
  });

  it('status desconhecido devolve null (não chuta)', () => {
    expect(statusCanonico('invencionice', null, STATUS_POR_ORDER)).toBeNull();
  });

  it('mapeia as formas do MP pro vocabulário canônico', () => {
    expect(metodoDeMp('pix')).toBe('pix');
    expect(metodoDeMp('bank_transfer')).toBe('pix');
    expect(metodoDeMp('credit_card')).toBe('cartao');
    expect(metodoDeMp('bolbradesco')).toBe('boleto');
    expect(metodoDeMp('nada-disso')).toBeNull();
  });
});

describe('mercadopago · leitura de order e de payment', () => {
  it('order paga devolve valor em centavos e taxa/líquido NULOS', () => {


    const d = dadosDaOrder({
      id: 'ORD01J', external_reference: 'inscricao:abc',
      transactions: { payments: [{
        id: 'PAY01J', status: 'processed', status_detail: 'accredited',
        amount: '900.00', paid_amount: '900.00',
        payment_method: { id: 'pix', type: 'bank_transfer' },
      }] },
    });
    expect(d.status).toBe('pago');
    expect(d.valor_pago_centavos).toBe(90000);
    expect(d.taxa_centavos).toBeNull();
    expect(d.liquido_centavos).toBeNull();
    expect(d.repassado_em).toBeNull();
    expect(d.referencia).toBe('inscricao:abc');
  });

  it('order NÃO paga não reporta valor pago', () => {
    const d = dadosDaOrder({
      id: 'ORD01J',
      transactions: { payments: [{
        status: 'action_required', status_detail: 'waiting_transfer', amount: '900.00',
        payment_method: { id: 'pix' },
      }] },
    });
    expect(d.status).toBe('aguardando_pagamento');
    expect(d.valor_pago_centavos).toBeNull();
  });

  it('payment (legado) traz taxa somada de fee_details, líquido e data de liberação', () => {
    const d = dadosDoPayment({
      id: 123, status: 'approved', status_detail: 'accredited',
      transaction_amount: 900, installments: 6,
      external_reference: 'inscricao:abc',
      payment_method_id: 'master', payment_type_id: 'credit_card',
      money_release_date: '2026-09-01T10:00:00.000-03:00',
      transaction_details: { total_paid_amount: 900, net_received_amount: 855.18 },
      fee_details: [{ type: 'mercadopago_fee', amount: 44.82 }],
      card: { brand: 'master', last_four_digits: '1234' },
    });
    expect(d.status).toBe('pago');
    expect(d.valor_pago_centavos).toBe(90000);
    expect(d.taxa_centavos).toBe(4482);
    expect(d.liquido_centavos).toBe(85518);
    expect(d.repassado_em).toBe('2026-09-01T10:00:00.000-03:00');
    expect(d.parcelas).toBe(6);
  });

  it('payment sem fee_details devolve taxa NULA em vez de zero', () => {


    const d = dadosDoPayment({ id: 1, status: 'approved', transaction_amount: 10 });
    expect(d.taxa_centavos).toBeNull();
  });

  it('NUNCA devolve PAN, CVV, validade ou nome impresso', () => {
    const d = dadosDoPayment({
      id: 1, status: 'approved', transaction_amount: 10,
      card: {
        brand: 'visa', last_four_digits: '4321',
        first_six_digits: '451234',
        expiration_month: 12, expiration_year: 2030,
        cardholder: { name: 'FULANO DE TAL' },
      },
    });
    const texto = JSON.stringify(d);
    expect(d.cartao_last4).toBe('4321');
    expect(texto).not.toMatch(/451234/);
    expect(texto).not.toMatch(/FULANO/);
    expect(texto).not.toMatch(/expiration/);
  });
});

describe('mercadopago · dinheiro e expiração', () => {
  it('converte centavos ↔ reais sem float sujo', () => {
    expect(paraReais(90000)).toBe('900.00');
    expect(paraReais(1)).toBe('0.01');
    expect(paraCentavos('855.18')).toBe(85518);
    expect(paraCentavos(0.07)).toBe(7);
    expect(paraCentavos(null)).toBeNull();
  });

  it('expiração do Pix é ISO 8601 DURATION grampeada na faixa do MP', () => {
    const agora = Date.now();

    expect(expiracaoPix({ expira_em: new Date(agora + 60 * 24 * 3600e3) })).toBe('PT43200M');

    expect(expiracaoPix({ expira_em: new Date(agora + 60e3) })).toBe('PT30M');

    expect(expiracaoPix({})).toBe('PT24H');
  });
});

describe('mercadopago · capacidades declaradas', () => {
  it('NÃO oferece boleto (falta endereço do pagador no nosso cadastro)', () => {



    expect(mp.capacidades.metodos).not.toContain('boleto');
    expect(mp.capacidades.metodos).toEqual(expect.arrayContaining(['pix', 'cartao']));
  });

  it('teto de parcelas é o do Checkout Pro', () => {
    expect(mp.capacidades.parcelas_max).toBe(36);
  });

  it('exporta o contrato inteiro que o núcleo espera', () => {
    for (const fn of ['criarCobranca', 'consultarStatus', 'cancelarCobranca',
      'estornar', 'verificarAssinatura', 'normalizarEvento', 'definirMetodo',
      'verificarChave']) {
      expect(typeof mp[fn], `${fn} deve existir`).toBe('function');
    }
    expect(mp.nome).toBe('mercadopago');
  });
});

describe('mercadopago · webhook precisa buscar o objeto', () => {
  it('tópico orders consulta a order e devolve status canônico', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        id: 'ORD01J', external_reference: 'inscricao:abc',
        transactions: { payments: [{
          id: 'PAY1', status: 'processed', status_detail: 'accredited',
          amount: '900.00', paid_amount: '900.00', payment_method: { id: 'pix' },
        }] },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const ev = await mp.normalizarEvento(
      { id: 55, type: 'orders', action: 'order.updated', data: { id: 'ORD01J' } },
      {},
    );
    expect(ev.status).toBe('pago');
    expect(ev.evento_id).toBe('orders:55');
    expect(ev.referencia).toBe('inscricao:abc');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('tópico desconhecido devolve null em vez de agir errado', async () => {
    const ev = await mp.normalizarEvento({ type: 'topic_card_id_wh', data: { id: '1' } }, {});
    expect(ev).toBeNull();
  });

  it('notificação sem data.id devolve null', async () => {
    expect(await mp.normalizarEvento({ type: 'payment' }, {})).toBeNull();
  });

  it('a guarda de live_mode vale TAMBÉM na notificação', async () => {
    process.env.MERCADOPAGO_AMBIENTE = 'teste';
    await expect(
      mp.normalizarEvento({ type: 'payment', live_mode: true, data: { id: '1' } }, {}),
    ).rejects.toThrow(/dinheiro real/i);
  });
});











describe('mercadopago · pagarComToken (cartão sem redirecionamento)', () => {
  const cobranca = {
    id: 'cob-1', valor_centavos: 90000, descricao: 'Inscrição · Retiro',
    referencia: 'inscricao:abc', pagador_email: 'pessoa@exemplo.com',
  };

  function stubFetch(resposta: any, capturado: { corpo?: any; headers?: any } = {}) {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, opts: any) => {
      capturado.corpo = JSON.parse(opts.body);
      capturado.headers = opts.headers;
      return { ok: true, status: 200, text: async () => JSON.stringify(resposta) } as any;
    }));
  }

  const aprovado = {
    id: 111, status: 'approved', live_mode: false,
    transaction_amount: 900, installments: 3,
    payment_method_id: 'master', payment_type_id: 'credit_card',
    transaction_details: { total_paid_amount: 900, net_received_amount: 850.5 },
    fee_details: [{ amount: 49.5 }],
    money_release_date: '2026-09-05T00:00:00.000-03:00',
    card: { brand: 'master', last_four_digits: '1234' },
    external_reference: 'inscricao:abc',
  };

  it('⚠️ manda o valor DA COBRANÇA, ignorando o que o formulário informou', async () => {
    const cap: any = {};
    stubFetch(aprovado, cap);

    await mp.pagarComToken(cobranca, { token: 'tok_x', installments: 3, transaction_amount: 1 });
    expect(cap.corpo.transaction_amount).toBe(900);
  });

  it('⚠️ o valor vai como NÚMERO — a Payments API recusa string', async () => {








    const cap: any = {};
    stubFetch(aprovado, cap);
    await mp.pagarComToken(cobranca, { token: 'tok_x' });
    expect(typeof cap.corpo.transaction_amount).toBe('number');

    expect(cap.corpo.transaction_amount).toBe(900);
  });

  it('valor quebrado não vira dízima ao virar número', async () => {
    const cap: any = {};
    stubFetch(aprovado, cap);
    await mp.pagarComToken({ ...cobranca, valor_centavos: 12345 }, { token: 'tok_x' });
    expect(cap.corpo.transaction_amount).toBe(123.45);
  });

  it('exige token e recusa sem ele', async () => {
    await expect(mp.pagarComToken(cobranca, {})).rejects.toThrow(/token/i);
  });

  it('parcela inválida vira 1x em vez de ir suja pro provedor', async () => {
    const cap: any = {};
    stubFetch(aprovado, cap);
    await mp.pagarComToken(cobranca, { token: 'tok_x', installments: 0 });
    expect(cap.corpo.installments).toBe(1);
  });

  it('usa chave de idempotência estável por tentativa', async () => {
    const cap: any = {};
    stubFetch(aprovado, cap);
    await mp.pagarComToken(cobranca, { token: 'tok_abcdefghijklmno' });
    expect(cap.headers['X-Idempotency-Key']).toBe('cob-1:cartao:tok_abcdefgh');
  });

  it('devolve taxa, líquido e data de liberação (o que a Orders API não dá)', async () => {
    stubFetch(aprovado);
    const r = await mp.pagarComToken(cobranca, { token: 'tok_x', installments: 3 });
    expect(r.valor_pago_centavos).toBe(90000);
    expect(r.liquido_centavos).toBe(85050);
    expect(r.taxa_centavos).toBe(4950);
    expect(r.repassado_em).toBe('2026-09-05T00:00:00.000-03:00');
    expect(r.parcelas).toBe(3);
  });

  it('⚠️ não devolve NADA de cartão além de bandeira e últimos 4', async () => {
    stubFetch(aprovado);
    const r = await mp.pagarComToken(cobranca, { token: 'tok_x' });
    expect(r.cartao_brand).toBe('master');
    expect(r.cartao_last4).toBe('1234');
    const texto = JSON.stringify(r);
    for (const proibido of ['number', 'security_code', 'cvv', 'expiration', 'cardholder']) {
      expect(texto.toLowerCase()).not.toContain(proibido);
    }
  });

  it('⚠️ recusa do emissor vem como `recusado`, sem status terminal', async () => {
    stubFetch({ id: 9, status: 'rejected', status_detail: 'cc_rejected_insufficient_amount', live_mode: false, transaction_amount: 900 });
    const r = await mp.pagarComToken(cobranca, { token: 'tok_x' });
    expect(r.recusado).toBe(true);
    expect(r.motivo_recusa).toBe('cc_rejected_insufficient_amount');


    expect(r.status).toBeNull();
  });

  it('a guarda de live_mode vale também neste caminho', async () => {
    process.env.MERCADOPAGO_AMBIENTE = 'teste';
    stubFetch({ ...aprovado, live_mode: true });
    await expect(mp.pagarComToken(cobranca, { token: 'tok_x' })).rejects.toThrow(/live_mode/i);
  });

  it('declara que sabe tokenizar (é o que a tela lê pra não redirecionar)', () => {
    expect(mp.capacidades.tokenizacao).toBe(true);
    expect(typeof mp.pagarComToken).toBe('function');
  });
});







describe('mercadopago · erro de par de credenciais é traduzido', () => {
  const cobranca = { id: 'cob-9', valor_centavos: 500, referencia: 'inscricao:z' };

  it('401 de "live credentials" diz que Public Key e Access Token têm que ser do MESMO par', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status: 401,
      text: async () => JSON.stringify({ message: 'Unauthorized use of live credentials' }),
    } as any)));

    await expect(mp.pagarComToken(cobranca, { token: 'tok_x' }))
      .rejects.toThrow(/MESMA aplicação/i);
  });

  it('erro comum NÃO ganha a dica (senão ela vira ruído e ninguém lê)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status: 400,
      text: async () => JSON.stringify({ message: 'invalid parameter' }),
    } as any)));

    await expect(mp.pagarComToken(cobranca, { token: 'tok_x' }))
      .rejects.not.toThrow(/MESMA aplicação/i);
  });
});






describe('mercadopago · guarda de CONTA (o token é da conta declarada?)', () => {
  const cobranca = { id: 'cob-c', valor_centavos: 500, referencia: 'inscricao:c' };
  const tokenDaIgreja = 'APP_USR-1111111111111111-080812-abcdef-1000000001';
  const tokenDeTeste = 'APP_USR-2222222222222222-080812-abcdef-1000000002';

  function stubOk() {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200,
      text: async () => JSON.stringify({ id: 1, status: 'approved', live_mode: true }),
    } as any)));
  }

  it('⚠️ token da conta REAL num ambiente declarado de teste LANÇA', async () => {
    stubOk();
    vi.stubEnv('MERCADOPAGO_AMBIENTE', 'producao');
    vi.stubEnv('MERCADOPAGO_CONTA_ID', '1000000002');
    vi.stubEnv('MERCADOPAGO_ACCESS_TOKEN', tokenDaIgreja);

    await expect(mp.pagarComToken(cobranca, { token: 'tok_x' }))
      .rejects.toThrow(/conta 1000000001.*conta 1000000002|cobraria dinheiro de verdade/is);
  });

  it('token da conta declarada passa', async () => {
    stubOk();
    vi.stubEnv('MERCADOPAGO_AMBIENTE', 'producao');
    vi.stubEnv('MERCADOPAGO_CONTA_ID', '1000000002');
    vi.stubEnv('MERCADOPAGO_ACCESS_TOKEN', tokenDeTeste);

    await expect(mp.pagarComToken(cobranca, { token: 'tok_x' })).resolves.toBeTruthy();
  });

  it('sem a env, NÃO bloqueia — inventar erro onde não há sinal derruba pagamento por nada', async () => {

    stubOk();
    vi.stubEnv('MERCADOPAGO_AMBIENTE', 'producao');
    vi.stubEnv('MERCADOPAGO_CONTA_ID', '');
    vi.stubEnv('MERCADOPAGO_ACCESS_TOKEN', tokenDaIgreja);

    await expect(mp.pagarComToken(cobranca, { token: 'tok_x' })).resolves.toBeTruthy();
  });

  it('token em formato sem id de conta não bloqueia', async () => {
    stubOk();
    vi.stubEnv('MERCADOPAGO_AMBIENTE', 'producao');
    vi.stubEnv('MERCADOPAGO_CONTA_ID', '1000000002');
    vi.stubEnv('MERCADOPAGO_ACCESS_TOKEN', 'TEST-formato-desconhecido');

    await expect(mp.pagarComToken(cobranca, { token: 'tok_x' })).resolves.toBeTruthy();
  });
});





describe('mercadopago · chavePublica só sai com o par coerente', () => {
  it('par coerente (produção + produção) devolve a chave', () => {
    vi.stubEnv('MERCADOPAGO_PUBLIC_KEY', 'APP_USR-pk-1');
    vi.stubEnv('MERCADOPAGO_ACCESS_TOKEN', 'APP_USR-tok-1');
    expect(mp.chavePublica()).toBe('APP_USR-pk-1');
  });

  it('par coerente (teste + teste) devolve a chave', () => {
    vi.stubEnv('MERCADOPAGO_PUBLIC_KEY', 'TEST-pk-1');
    vi.stubEnv('MERCADOPAGO_ACCESS_TOKEN', 'TEST-tok-1');
    expect(mp.chavePublica()).toBe('TEST-pk-1');
  });

  it('⚠️ versões MISTURADAS desligam o cartão na página em vez de dar 401 a cada tentativa', () => {


    vi.stubEnv('MERCADOPAGO_PUBLIC_KEY', 'TEST-pk-1');
    vi.stubEnv('MERCADOPAGO_ACCESS_TOKEN', 'APP_USR-tok-1');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(mp.chavePublica()).toBeNull();
  });

  it('sem Access Token não inventa divergência', () => {
    vi.stubEnv('MERCADOPAGO_PUBLIC_KEY', 'APP_USR-pk-1');
    vi.stubEnv('MERCADOPAGO_ACCESS_TOKEN', '');
    expect(mp.chavePublica()).toBe('APP_USR-pk-1');
  });
});







describe('mercadopago · external_reference no formato que o MP aceita', () => {
  const uuid = '9f0e4c2a-1b3d-4e5f-8a7b-6c5d4e3f2a1b';

  it('troca `:` por `_` — os únicos separadores aceitos são - e _', () => {
    expect(mp.refExterna(`inscricao:${uuid}`)).toBe(`inscricao_${uuid}`);
    expect(mp.refExterna(`inscricao:${uuid}`)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('⚠️ a volta é EXATA — é por ela que o webhook reencontra a cobrança', () => {
    const nossa = `inscricao:${uuid}:r1a2b3c4d`;
    expect(mp.refDoExterno(mp.refExterna(nossa))).toBe(nossa);
  });

  it('as referências REAIS cabem nos 64 caracteres', () => {


    for (const r of [
      `inscricao:${uuid}`,
      `inscricao:${uuid}:r${Date.now().toString(36)}`,
      `inscricao:${uuid}:b${Date.now().toString(36)}`,
    ]) {
      expect(mp.refExterna(r).length, `estourou: ${r}`).toBeLessThanOrEqual(64);
      expect(mp.refDoExterno(mp.refExterna(r))).toBe(r);
    }
  });

  it('caractere fora do alfabeto vira `-` em vez de ir sujo pro MP', () => {
    expect(mp.refExterna('pedido#42 (novo)')).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('sem referência, cai no id da cobrança', () => {
    expect(mp.refExterna(null, 'cob-123')).toBe('cob-123');
  });
});






describe('mercadopago · regra de e-mail do sandbox é traduzida', () => {
  const cobranca = { id: 'cob-s', valor_centavos: 500, referencia: 'inscricao:s' };

  it('diz que a regra é só de sandbox e que produção não muda', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status: 400,
      text: async () => JSON.stringify({
        errors: [{ code: 'invalid_email_for_sandbox', message: "must contains '@testuser.com'." }],
      }),
    } as any)));

    await expect(mp.pagarComToken(cobranca, { token: 'tok_x' }))
      .rejects.toThrow(/SÓ DE SANDBOX[\s\S]*não mexa no código/i);
  });
});






describe('mercadopago · guarda de conta × credencial de teste', () => {
  const cobranca = { id: 'cob-t', valor_centavos: 500, referencia: 'inscricao:t' };

  function stubOk(live: boolean) {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200,
      text: async () => JSON.stringify({ id: 1, status: 'approved', live_mode: live }),
    } as any)));
  }

  it('token de TESTE da conta real passa — ele não move dinheiro de ninguém', async () => {
    stubOk(false);
    vi.stubEnv('MERCADOPAGO_AMBIENTE', 'teste');
    vi.stubEnv('MERCADOPAGO_CONTA_ID', '1000000002');
    vi.stubEnv('MERCADOPAGO_ACCESS_TOKEN', 'TEST-000-000000-test-1000000001');
    await expect(mp.pagarComToken(cobranca, { token: 'tok_x' })).resolves.toBeTruthy();
  });

  it('⚠️ mas o token de PRODUÇÃO da conta real segue barrado — é ele que cobra de verdade', async () => {
    stubOk(true);
    vi.stubEnv('MERCADOPAGO_AMBIENTE', 'producao');
    vi.stubEnv('MERCADOPAGO_CONTA_ID', '1000000002');
    vi.stubEnv('MERCADOPAGO_ACCESS_TOKEN', 'APP_USR-999-080812-abc-1000000001');
    await expect(mp.pagarComToken(cobranca, { token: 'tok_x' }))
      .rejects.toThrow(/cobraria dinheiro de verdade/i);
  });
});









describe('mercadopago · valor pago é o que QUITA a cobrança', () => {
  const cobranca = { id: 'cob-v', valor_centavos: 500, referencia: 'inscricao:v' };

  function stub(resposta: any) {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200, text: async () => JSON.stringify(resposta),
    } as any)));
  }

  it('juros do parcelado NÃO entram no valor pago', async () => {
    stub({
      id: 1, status: 'approved', live_mode: false,
      transaction_amount: 5,
      transaction_details: {
        total_paid_amount: 5.05,
        net_received_amount: 4.8,
      },
      fee_details: [{ amount: 0.15 }],
      installments: 1,
    });

    const r = await mp.pagarComToken(cobranca, { token: 'tok_x' });
    expect(r.valor_pago_centavos).toBe(500);
    expect(r.liquido_centavos).toBe(480);
    expect(r.taxa_centavos).toBe(15);
  });

  it('sem transaction_amount, cai no total pago em vez de ficar sem valor', async () => {
    stub({
      id: 2, status: 'approved', live_mode: false,
      transaction_details: { total_paid_amount: 5 },
    });
    const r = await mp.pagarComToken(cobranca, { token: 'tok_x' });
    expect(r.valor_pago_centavos).toBe(500);
  });

  it('o payload CRU é devolvido pra razão auxiliar guardar', async () => {


    stub({ id: 3, status: 'approved', live_mode: false, transaction_amount: 5 });
    const r = await mp.pagarComToken(cobranca, { token: 'tok_x' });
    expect(r.payload?.id).toBe(3);
  });
});










describe('mercadopago · order que FALHA não mata a cobrança', () => {
  function stubOrder(status: string, statusPagamento?: string) {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200,
      text: async () => JSON.stringify({



        id: 'ORD01KZRWGVCN9NEGDZBW0T3QYVT9', status, live_mode: false,
        external_reference: 'inscricao_321709e5',
        total_amount: '5.00',
        transactions: { payments: [{ id: 'PAY01', status: statusPagamento || status, amount: '5.00' }] },
      }),
    } as any)));
  }

  it('`failed` NÃO vira status terminal — devolve "sem novidade"', async () => {
    stubOrder('failed');
    const r = await mp.consultarStatus({ id: 'c1', provider_cobranca_id: 'ORD01', referencia: 'inscricao:x' });

    expect(r?.status ?? null).toBeNull();
  });

  it('os status que REALMENTE encerram continuam encerrando', async () => {
    for (const [ordem, esperado] of [['expired', 'expirada'], ['canceled', 'cancelada']] as const) {
      stubOrder(ordem);
      const r = await mp.consultarStatus({ id: 'c1', provider_cobranca_id: 'ORD01', referencia: 'inscricao:x' });
      expect(r?.status, `${ordem} deveria virar ${esperado}`).toBe(esperado);
    }
  });

  it('e o pagamento aprovado segue chegando a pago', async () => {
    stubOrder('processed');
    const r = await mp.consultarStatus({ id: 'c1', provider_cobranca_id: 'ORD01', referencia: 'inscricao:x' });
    expect(r?.status).toBe('pago');
  });
});












describe('mercadopago · definirMetodo ao TROCAR de forma', () => {
  const CHECKOUT = 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=1';
  const TICKET = 'https://www.mercadopago.com.br/payments/100000000000/ticket?caller_id=1';

  const base = {
    id: 'cob-1', valor_centavos: 2000, descricao: 'Oferta',
    referencia: 'generosidade:abc', public_token: 'tok', parcelas_max: 12,
    pagador_email: 'pessoa@exemplo.com', pagador_nome: 'Maria Silva',
  };

  function stubJson(fn: (url: string, opts: any) => any) {
    const mock = vi.fn(async (url: string, opts: any) => {
      const r = fn(url, opts);
      return {
        ok: r.ok !== false,
        status: r.status ?? 200,
        text: async () => JSON.stringify(r.corpo ?? {}),
      } as any;
    });
    vi.stubGlobal('fetch', mock);
    return mock;
  }

  it('CARTÃO não devolve o ticket do Pix — cria checkout novo', async () => {


    const mock = stubJson(() => ({ corpo: { id: 'PREF9', init_point: CHECKOUT, sandbox_init_point: CHECKOUT } }));

    const r = await mp.definirMetodo({ ...base, checkout_url: TICKET }, 'cartao');

    expect(r.checkout_url).toBe(CHECKOUT);
    expect(r.checkout_url).not.toContain('/ticket');
    expect(mock).toHaveBeenCalledTimes(1);
    expect(String(mock.mock.calls[0][0])).toContain('/checkout/preferences');

    expect(r.provider_cobranca_id).toBeUndefined();
  });

  it('CARTÃO reusa a URL guardada quando ela JÁ é de checkout (sem chamar o MP)', async () => {
    const mock = stubJson(() => ({ corpo: {} }));
    const r = await mp.definirMetodo({ ...base, checkout_url: CHECKOUT }, 'cartao');
    expect(r.checkout_url).toBe(CHECKOUT);
    expect(mock).not.toHaveBeenCalled();
  });

  it('PIX com QR guardado devolve o MESMO QR e não chama o MP', async () => {
    const mock = stubJson(() => ({ corpo: {} }));
    const r = await mp.definirMetodo({
      ...base, provider_cobranca_id: 'ORD01M11', pix_payload: '000201-pix', pix_qrcode_base64: 'iVBOR',
    }, 'pix');
    expect(r.pix_payload).toBe('000201-pix');
    expect(r.pix_qrcode_base64).toBe('iVBOR');
    expect(mock).not.toHaveBeenCalled();
  });

  it('PIX NUNCA devolve checkout_url — era isso que sobrescrevia o cartão', async () => {
    stubJson(() => ({
      corpo: {
        id: 'ORD01NOVA',
        transactions: { payments: [{ payment_method: { id: 'pix', qr_code: 'qr', ticket_url: TICKET } }] },
      },
    }));
    const r = await mp.definirMetodo(base, 'pix');
    expect(r.pix_payload).toBe('qr');
    expect(r.checkout_url).toBeUndefined();
  });

  it('PIX sem QR guardado: 409 de idempotência retenta com OUTRA chave', async () => {
    const chaves: string[] = [];
    const mock = stubJson((_url, opts) => {
      chaves.push(opts.headers['X-Idempotency-Key']);
      if (chaves.length === 1) {
        return { ok: false, status: 409, corpo: { errors: [{ code: 'idempotency_key_already_used' }] } };
      }
      return {
        corpo: {
          id: 'ORD01SEG',
          transactions: { payments: [{ payment_method: { id: 'pix', qr_code: 'qr-novo' } }] },
        },
      };
    });

    const r = await mp.definirMetodo(base, 'pix');

    expect(r.pix_payload).toBe('qr-novo');
    expect(mock).toHaveBeenCalledTimes(2);
    expect(chaves[1]).not.toBe(chaves[0]);

    expect(chaves[1]).toContain('cob-1');
  });

  it('erro que NÃO é de idempotência propaga (não vira retentativa cega)', async () => {
    const mock = stubJson(() => ({ ok: false, status: 400, corpo: { message: 'pix indisponível na conta' } }));
    await expect(mp.definirMetodo(base, 'pix')).rejects.toThrow(/pix indispon/i);
    expect(mock).toHaveBeenCalledTimes(1);
  });
});
