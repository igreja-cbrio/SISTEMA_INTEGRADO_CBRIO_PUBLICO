























const { supabase } = require('../../utils/supabase');
const { notificar } = require('../notificar');
const providers = require('./providers');



const INTERVALO_MS = 20 * 60 * 60 * 1000;



const FALHAS_PRA_AVISAR = 3;


const INTERVALO_AVISO_MS = 20 * 60 * 60 * 1000;


function ehCredencialAusente(msg) {
  return /não configurada|nao configurada/i.test(String(msg || ''));
}





function ehAmbienteTrocado(msg) {
  return /é de SANDBOX|é de PRODUÇÃO/i.test(String(msg || ''));
}


function ehCredencialRecusada(status) {
  return status === 401 || status === 403;
}

async function linhaAtual(provider) {
  const { data, error } = await supabase.from('pag_provider_saude')
    .select('*').eq('provider', provider).maybeSingle();


  if (error) { console.error('[pagamentos/saude] leitura:', error.message); return null; }
  return data || null;
}

async function gravar(provider, patch) {
  const { error } = await supabase.from('pag_provider_saude')
    .upsert({ provider, ...patch }, { onConflict: 'provider' });
  if (error) console.error('[pagamentos/saude] gravação:', error.message);
}

async function avisar({ provider, titulo, mensagem, severidade }) {
  await notificar({
    modulo: 'inscricoes',
    tipo: 'pagamento_credencial',
    titulo,
    mensagem,
    severidade,

    chaveDedup: `pag_credencial_${provider}_${new Date().toISOString().slice(0, 10)}`,
    link: '/inscricoes',
  }).catch((e) => console.error('[pagamentos/saude] notificar:', e.message));
}











async function verificar({ provider, forcar = false } = {}) {
  const nome = provider || providers.providerPadrao();



  if (nome === 'manual') return { provider: nome, pulado: 'provider_manual' };

  let adapter;
  try {
    adapter = providers.obter(nome);
  } catch (e) {
    return { provider: nome, pulado: 'provider_desconhecido', erro: e.message };
  }
  if (typeof adapter.verificarChave !== 'function') {
    return { provider: nome, pulado: 'adapter_sem_sonda' };
  }

  const atual = await linhaAtual(nome);
  if (!forcar && atual?.verificado_em) {
    const desde = Date.now() - new Date(atual.verificado_em).getTime();
    if (desde < INTERVALO_MS) {
      return { provider: nome, pulado: 'verificado_recentemente', verificado_em: atual.verificado_em };
    }
  }

  try {
    const r = await adapter.verificarChave();
    const recuperou = (atual?.falhas_consecutivas || 0) >= FALHAS_PRA_AVISAR
      || (atual?.ok === false && atual?.avisado_em);
    await gravar(nome, {
      verificado_em: new Date().toISOString(),
      ok: true, status_http: 200, erro: null,
      latencia_ms: r?.latencia_ms ?? null,
      falhas_consecutivas: 0, avisado_em: null,
    });


    if (recuperou) {
      await avisar({
        provider: nome, severidade: 'info',
        titulo: 'Credencial de pagamento voltou a responder',
        mensagem: `A chave do ${nome} respondeu normalmente. Cobranças e confirmações voltaram ao normal.`,
      });
    }
    return { provider: nome, ok: true, latencia_ms: r?.latencia_ms ?? null };
  } catch (e) {
    const msg = e?.message || 'erro desconhecido';
    const status = e?.status ?? null;


    if (ehCredencialAusente(msg)) {
      await gravar(nome, {
        verificado_em: new Date().toISOString(),
        ok: null, status_http: null, erro: null, latencia_ms: null,
        falhas_consecutivas: 0, avisado_em: null,
      });
      return { provider: nome, pulado: 'sem_credencial' };
    }

    const falhas = (atual?.falhas_consecutivas || 0) + 1;
    const grave = ehCredencialRecusada(status) || ehAmbienteTrocado(msg);
    const insistiu = falhas >= FALHAS_PRA_AVISAR;
    const avisadoHa = atual?.avisado_em ? Date.now() - new Date(atual.avisado_em).getTime() : Infinity;
    const deveAvisar = (grave || insistiu) && avisadoHa >= INTERVALO_AVISO_MS;

    await gravar(nome, {
      verificado_em: new Date().toISOString(),
      ok: false, status_http: status, erro: msg.slice(0, 500),
      latencia_ms: null, falhas_consecutivas: falhas,
      ...(deveAvisar ? { avisado_em: new Date().toISOString() } : {}),
    });

    if (deveAvisar) {
      const porque = ehAmbienteTrocado(msg)
        ? 'A chave configurada é do ambiente errado.'
        : ehCredencialRecusada(status)
          ? 'O provedor recusou a chave (401/403) — ela pode ter sido revogada, trocada, ou expirada por desuso.'
          : `Falhou ${falhas} vezes seguidas.`;
      await avisar({
        provider: nome, severidade: 'alta',
        titulo: 'Credencial de pagamento não está respondendo',
        mensagem: `${porque} Enquanto isso, evento pago não consegue gerar cobrança e pagamento feito pode não ser confirmado automaticamente. Detalhe técnico: ${msg.slice(0, 200)}`,
      });
    }

    console.error(`[pagamentos/saude] ${nome} falhou (${falhas}x):`, msg);
    return { provider: nome, ok: false, status_http: status, erro: msg, falhas_consecutivas: falhas };
  }
}


async function atual(provider) {
  const nome = provider || providers.providerPadrao();
  const linha = await linhaAtual(nome);
  return {
    provider: nome,
    configurado: providers.pspConfigurado(),
    ...(linha || {}),
  };
}

module.exports = {
  verificar,
  atual,


  _internos: {
    INTERVALO_MS, FALHAS_PRA_AVISAR, INTERVALO_AVISO_MS,
    ehCredencialAusente, ehAmbienteTrocado, ehCredencialRecusada,
  },
};
