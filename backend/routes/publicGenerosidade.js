


























const express = require('express');
const { semCache } = require('../middleware/semCache');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { notificar } = require('../services/notificar');
const {
  emailValido, cpfValido, normalizarCpf, normalizarEmail, normalizarTelefone,
  tirarCodigoPaisTelefone, temAbreviacaoNome, honeypotPreenchido,
} = require('../services/inscricaoContrato');
const { acharMembroGuardado } = require('../services/membroMatch');
const campDoacao = require('../utils/campanhaDoacao');
const doacaoToken = require('../utils/doacaoToken');
const doacaoPrefill = require('../utils/doacaoPrefill');












async function membroDoToken(tokenBruto) {
  const lido = doacaoToken.ler(tokenBruto);
  if (!lido.ok) return null;
  try {
    const { data, error } = await db
      .from('mem_membros')
      .select('id, nome, email, telefone, cpf')
      .eq('id', lido.membro_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  } catch (e) {
    console.warn('[publicGenerosidade] prefill indisponível:', e.message);
    return null;
  }
}
const { hojeBrt: hojeBrtCamp } = require('../services/campanhaArrecadacao');
const { supabase: db } = require('../utils/supabase');











async function campanhasQuePodemReceber() {
  try {
    const { data, error } = await db
      .from('camp_campanhas')
      .select('id, nome, status, data_inicio, data_fim, descricao_curta, aceita_online')
      .eq('status', 'ativa')
      .is('deleted_at', null)
      .order('data_lancamento', { ascending: false });
    if (error) throw error;
    return campDoacao.campanhasOfertaveis(data || [], hojeBrtCamp());
  } catch (e) {
    console.warn('[publicGenerosidade] campanhas indisponíveis:', e.message);
    return [];
  }
}

const pagamentos = require('../services/pagamentos');
const {
  estadoBasePagamento, escolherFormaPagamento, sincronizarSeParada,
} = require('../services/pagamentos/telaPublica');




const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.GENEROSIDADE_PUBLIC_RATE_LIMIT_MAX)
    || (process.env.NODE_ENV === 'production' ? 3000 : 10000),
  message: { error: 'Muitas requisições. Aguarde alguns minutos.' },
  skip: () => process.env.NODE_ENV !== 'production',
  standardHeaders: true,
  legacyHeaders: false,
});
router.use(limiter);





const CATEGORIAS = ['dizimo', 'oferta', 'campanha'];




const METODOS_DEFAULT = ['pix', 'cartao'];






function metodosOfertados() {
  const daEnv = String(process.env.GENEROSIDADE_METODOS || '').split(',')
    .map((m) => m.trim()).filter(Boolean);
  const desejados = daEnv.length ? daEnv : METODOS_DEFAULT;
  try {
    return pagamentos.metodosDisponiveis(desejados);
  } catch (e) {
    console.error('[publicGenerosidade] provider de pagamento:', e.message);
    return [];
  }
}

function tetoParcelasProvider() {
  try {
    return pagamentos.capacidades()?.parcelas_max || 1;
  } catch { return 1; }
}

function valoresSugeridos() {
  const daEnv = String(process.env.GENEROSIDADE_VALORES || '').split(',')
    .map((v) => Math.floor(Number(v.trim()) * 100)).filter((c) => c > 0);
  return daEnv.length ? daEnv : [2000, 5000, 10000, 20000, 50000];
}





const MIN_CENTAVOS = 500;
const MAX_CENTAVOS = 5000000;



const EXPIRA_HORAS = 24;









function bloqueio() {
  if (!pagamentos.habilitado()) {
    return 'A doação online está temporariamente indisponível. Tente novamente em alguns minutos.';
  }
  if (!pagamentos.pspConfigurado()) {
    return 'A doação online ainda está sendo preparada. Em breve você poderá contribuir por aqui.';
  }
  if (!metodosOfertados().length) {
    return 'Nenhuma forma de pagamento está disponível no momento.';
  }
  return null;
}











const TENTATIVA_RE = /^[a-zA-Z0-9-]{8,64}$/;

function referenciaDaTentativa(bruta) {
  const t = String(bruta || '').trim();
  const id = TENTATIVA_RE.test(t) ? t : require('crypto').randomUUID();
  return `generosidade:${id}`;
}





const TOKEN_RE = /^[0-9a-f]{32}$/i;







router.use(semCache);

router.get('/config', async (_req, res) => {
  const aviso = bloqueio();


  const campanhas = aviso ? [] : (await campanhasQuePodemReceber()).map(campDoacao.paraOApp);
  res.json({
    campanhas,
    ativo: !aviso,
    aviso,
    metodos: aviso ? [] : metodosOfertados(),
    categorias: CATEGORIAS,
    valores_sugeridos: valoresSugeridos(),
    min_centavos: MIN_CENTAVOS,
    max_centavos: MAX_CENTAVOS,
    parcelas_max: tetoParcelasProvider(),
  });
});








router.get('/prefill', async (req, res) => {
  const membro = await membroDoToken(req.query.t);


  if (!membro) return res.json({ prefill: null });
  res.json({ prefill: doacaoPrefill.prefillDoCadastro(membro) });
});



router.post('/doacao', async (req, res) => {
  try {


    if (honeypotPreenchido(req.body)) {
      return res.json({ ok: true, token: null });
    }

    const aviso = bloqueio();
    if (aviso) return res.status(503).json({ error: aviso });

    const b = req.body || {};

    const valor = Math.floor(Number(b.valor_centavos) || 0);
    if (!(valor >= MIN_CENTAVOS)) {
      return res.status(400).json({ error: `O valor mínimo para doar online é de R$ ${(MIN_CENTAVOS / 100).toFixed(2).replace('.', ',')}.` });
    }
    if (valor > MAX_CENTAVOS) {
      return res.status(400).json({
        error: `Para doações acima de R$ ${(MAX_CENTAVOS / 100).toLocaleString('pt-BR')}, fale com a secretaria da igreja — conseguimos uma forma melhor (e sem taxa de cartão).`,
      });
    }

    const categoria = CATEGORIAS.includes(String(b.categoria)) ? String(b.categoria) : 'oferta';









    let campanhaId = null;
    let campanha = categoria === 'campanha' ? String(b.campanha || '').trim().slice(0, 120) : null;
    if (categoria === 'campanha') {
      const idPedido = String(b.campanha_id || '').trim();
      if (idPedido) {
        const ofertaveis = await campanhasQuePodemReceber();
        const escolha = campDoacao.validarEscolha({
          categoria, campanha_id: idPedido, ofertaveis,
        });
        if (!escolha.ok) {
          return res.status(400).json({
            error: escolha.motivo === 'campanha_indisponivel'
              ? 'Esta campanha não está mais recebendo doação.'
              : 'Diga qual é a campanha.',
            campo: 'campanha',
          });
        }
        campanhaId = escolha.campanha_id;
        campanha = escolha.campanha_nome || campanha;
      }
      if (!campanhaId && !campanha) {
        return res.status(400).json({ error: 'Diga qual é a campanha.', campo: 'campanha' });
      }
    }

    const nome = String(b.nome || '').trim().replace(/\s+/g, ' ');
    if (nome.length < 3) return res.status(400).json({ error: 'Informe seu nome.', campo: 'nome' });




    const nomeAbreviado = temAbreviacaoNome(nome);

    const email = normalizarEmail(b.email);
    if (!email || !emailValido(email)) {
      return res.status(400).json({ error: 'Informe um e-mail válido — é para onde vai o recibo.', campo: 'email' });
    }

    const telefone = normalizarTelefone(tirarCodigoPaisTelefone(b.telefone || ''));












    const membroToken = await membroDoToken(b.t);
    const pagador = doacaoPrefill.pagadorParaCobranca({
      membro: membroToken, corpo: { nome, email, telefone, cpf: b.cpf },
    });






    const cpf = pagador.cpf_veio_do_cadastro ? pagador.cpf : normalizarCpf(b.cpf);
    if (!cpf) {
      return res.status(400).json({ error: 'Informe seu CPF — é o que liga a doação ao seu cadastro e ao comprovante anual.', campo: 'cpf' });
    }
    if (!pagador.cpf_veio_do_cadastro && !cpfValido(cpf)) {
      return res.status(400).json({ error: 'Esse CPF não parece válido. Confira os números.', campo: 'cpf' });
    }




    let membroId = membroToken?.id || null;
    if (!membroId) {
      try {
        const m = await acharMembroGuardado({ cpf, email, telefone, nome });
        membroId = m?.membro_id || null;
      } catch (e) {
        console.error('[publicGenerosidade] match do doador:', e.message);
      }
    }

    const canal = ['app', 'web'].includes(String(b.canal)) ? String(b.canal) : 'web';

    const { cobranca } = await pagamentos.criarCobranca({
      origem_tipo: pagamentos.ORIGENS.GENEROSIDADE,



      origem_id: null,
      referencia: referenciaDaTentativa(b.tentativa),
      valor_centavos: valor,
      descricao: campDoacao.descricaoDaDoacao({ categoria, campanha_nome: campanha }),
      metodos_ofertados: metodosOfertados(),
      expira_em: new Date(Date.now() + EXPIRA_HORAS * 3600000).toISOString(),
      pagador_nome: nome,
      pagador_cpf: cpf || null,
      pagador_email: email,
      pagador_telefone: telefone || null,
      membro_id: membroId,


      metadata: campDoacao.metadataDaDoacao({
        categoria, campanha_id: campanhaId, campanha_nome: campanha, canal,
        extra: { nome_abreviado: nomeAbreviado || undefined },
      }),
    });

    res.json({ ok: true, token: cobranca.public_token, pagamento: estadoBasePagamento(cobranca) });
  } catch (e) {
    console.error('[publicGenerosidade] criar doação:', e.message);


    notificar({
      modulo: 'financeiro',
      tipo: 'doacao_falha_criar',
      titulo: 'Falha ao criar cobrança de doação',
      mensagem: `Alguém tentou doar pelo site/app e a cobrança não foi criada: ${e.message}. `
        + `Confiram a credencial do provedor de pagamento.`,
      severidade: 'alerta',
      link: '/inscricoes',
      chaveDedup: `doacao_falha_criar_${new Date().toISOString().slice(0, 10)}`,
    }).catch(() => {});
    res.status(502).json({ error: 'Não conseguimos iniciar a doação agora. Tente novamente em alguns minutos.' });
  }
});




router.post('/:token/metodo', async (req, res) => {
  try {
    if (!TOKEN_RE.test(req.params.token)) return res.status(404).json({ error: 'Doação não encontrada' });
    const cobranca = await pagamentos.consultarPorToken(req.params.token);
    if (!cobranca || cobranca.origem_tipo !== pagamentos.ORIGENS.GENEROSIDADE) {
      return res.status(404).json({ error: 'Doação não encontrada' });
    }

    const r = await escolherFormaPagamento(cobranca, {
      metodo: req.body?.metodo, parcelas: req.body?.parcelas,
    });
    const pagamento = estadoBasePagamento(r.cobranca);
    if (r.error) return res.status(r.status).json({ error: r.error, pagamento });
    res.json(pagamento);
  } catch (e) {
    console.error('[publicGenerosidade] metodo:', e.message);
    res.status(500).json({ error: 'Erro ao escolher a forma de pagamento.' });
  }
});



router.get('/:token', async (req, res) => {
  try {
    if (!TOKEN_RE.test(req.params.token)) return res.status(404).json({ error: 'Doação não encontrada' });
    let cobranca = await pagamentos.consultarPorToken(req.params.token);
    if (!cobranca || cobranca.origem_tipo !== pagamentos.ORIGENS.GENEROSIDADE) {
      return res.status(404).json({ error: 'Doação não encontrada' });
    }
    cobranca = await sincronizarSeParada(cobranca);
    res.json({
      ...estadoBasePagamento(cobranca),

      categoria: cobranca.metadata?.categoria || null,
      campanha: cobranca.metadata?.campanha || null,
      campanha_id: cobranca.metadata?.campanha_id || null,
    });
  } catch (e) {
    console.error('[publicGenerosidade] status:', e.message);
    res.status(500).json({ error: 'Erro ao consultar a doação.' });
  }
});

module.exports = router;
