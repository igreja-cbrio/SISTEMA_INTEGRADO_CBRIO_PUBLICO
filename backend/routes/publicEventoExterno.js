














const express = require('express');
const { semCache } = require('../middleware/semCache');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const { supabase } = require('../utils/supabase');
const { notificar, resolverDestinatarios } = require('../services/notificar');
const { moduloDaAreaEvento } = require('../utils/moduloDaAreaEvento');
const {
  validarCamposPadrao, processarIdentidade, registrarConsentimentos,
  honeypotPreenchido, TEXTOS, normalizarCpf,
} = require('../services/inscricaoContrato');
const { nomesMesmaPessoa, acharMembroGuardado } = require('../services/membroMatch');
const T = require('../utils/campanhaTemplates');
const { igrejaParceiraPorId } = require('../services/igrejaParceira');
const {
  emitirTokenComprovante,
  verificarTokenComprovanteAtivo,
} = require('../services/inscricaoComprovante');
const { enviarConfirmacaoInscricao } = require('../services/inscricaoWhatsapp');
const {
  enviarEmailInscricaoPendente,
  enviarEmailInscricaoConfirmada,
} = require('../services/inscricaoEmail');


const pagamentos = require('../services/pagamentos');
const checkoutExterno = require('../utils/checkoutExterno');



const camposCondicionais = require('../utils/camposCondicionais');
const inscricaoMenor = require('../utils/inscricaoMenor');
const lotesEvento = require('../utils/lotesEvento');



const {
  estadoBasePagamento, escolherFormaPagamento, sincronizarSeParada,
} = require('../services/pagamentos/telaPublica');



const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.EVENTO_PUBLIC_RATE_LIMIT_MAX) || (process.env.NODE_ENV === 'production' ? 1000 : 5000),
  message: { error: 'Muitas requisições. Aguarde alguns minutos.' },
  skip: () => process.env.NODE_ENV !== 'production',
  standardHeaders: true,
  legacyHeaders: false,
});
router.use(limiter);



const MIME_IMG = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
const uploadImg = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, MIME_IMG.includes(file.mimetype)),
});




const MIME_COMPROVANTE = [...MIME_IMG, 'application/pdf'];
const uploadComprovante = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, MIME_COMPROVANTE.includes(file.mimetype)),
});
const EXT_COMPROVANTE = {
  'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg',
  'image/jpg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
};




async function eventoEspinhaPorSlug(slug) {
  const { data } = await supabase.from('insc_eventos')
    .select('id, nome, slug, area, igreja_id, serie_id, data, hora, local, descricao, campos, capa_url, vagas, inscricoes_abrem_em, inscricoes_encerram_em, msg_sucesso_titulo, msg_sucesso_texto, tem_sorteio, pagamento_ativo, valor_centavos, pagamento_metodos, pagamento_expira_horas, parcelas_max, juros_repassados, status, checkout_externo_url, checkout_externo_nome')
    .eq('slug', slug).is('deleted_at', null).maybeSingle();
  if (!data || data.status === 'rascunho' || data.status === 'arquivado') return null;
  await anexarConfigMenor(data);
  await anexarExtrasEvento(data);
  await anexarAdesao(data);
  await anexarLotesEvento(data);


  data.igreja_parceira = await igrejaParceiraPorId(data.igreja_id);
  await anexarWhatsappDuvidas(data);
  await anexarValorCartaoExterno(data);
  return data;
}












async function anexarConfigMenor(ev) {
  if (!ev || !ev.id) return ev;
  try {
    const { data, error } = await supabase.from('insc_eventos')
      .select('exigir_endereco, exige_dados_menor, termos_extra')
      .eq('id', ev.id).maybeSingle();
    if (error) throw error;
    ev.exigir_endereco = !!data?.exigir_endereco;
    ev.exige_dados_menor = !!data?.exige_dados_menor;
    ev.termos_extra = Array.isArray(data?.termos_extra) ? data.termos_extra : [];
  } catch (e) {
    console.warn('[publicEvento espinha] config de menor/endereço indisponível:', e.message);
    ev.exigir_endereco = false;
    ev.exige_dados_menor = false;
    ev.termos_extra = [];
  }
  return ev;
}







async function anexarWhatsappDuvidas(ev) {
  if (!ev || !ev.id) return ev;
  try {
    const { data, error } = await supabase.from('insc_eventos')
      .select('whatsapp_duvidas_url').eq('id', ev.id).maybeSingle();
    if (error) throw error;
    ev.whatsapp_duvidas_url = /^https:\/\//.test(String(data?.whatsapp_duvidas_url || ''))
      ? data.whatsapp_duvidas_url : null;
  } catch (e) {
    console.warn('[publicEvento espinha] whatsapp de dúvidas indisponível:', e.message);
    ev.whatsapp_duvidas_url = null;
  }
  return ev;
}











async function anexarValorCartaoExterno(ev) {
  if (!ev || !ev.id) return ev;
  try {
    const { data, error } = await supabase.from('insc_eventos')
      .select('checkout_externo_valor_centavos').eq('id', ev.id).maybeSingle();
    if (error) throw error;
    const n = Number(data?.checkout_externo_valor_centavos);
    ev.checkout_externo_valor_centavos = Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
  } catch (e) {
    console.warn('[publicEvento espinha] valor do cartão externo indisponível:', e.message);
    ev.checkout_externo_valor_centavos = null;
  }
  return ev;
}







async function anexarLotesEvento(ev) {
  if (!ev || !ev.id) return ev;
  try {
    const { data, error } = await supabase.from('insc_eventos')
      .select('lotes').eq('id', ev.id).maybeSingle();
    if (error) throw error;
    ev.lotes = lotesEvento.sanitizarLotes(data?.lotes) || [];
  } catch (e) {
    console.warn('[publicEvento espinha] lotes indisponíveis:', e.message);
    ev.lotes = [];
  }
  return ev;
}













async function anexarAdesao(ev) {
  if (!ev || !ev.id) return ev;
  ev.contrato = 'completo';
  ev.campanha = null;
  try {
    const { data, error } = await supabase.from('insc_eventos')
      .select('contrato, campanha_id').eq('id', ev.id).maybeSingle();
    if (error) throw error;
    ev.contrato = data?.contrato === 'minimo' ? 'minimo' : 'completo';
    ev.campanha_id = data?.campanha_id || null;
    if (ev.campanha_id) {
      const { data: camp } = await supabase.from('camp_campanhas')
        .select('id, slug, nome, mostrar_adesoes, meses, faixas, status')
        .eq('id', ev.campanha_id).is('deleted_at', null).maybeSingle();
      if (camp) {
        let adesoes = null;
        if (camp.mostrar_adesoes) {
          const { count } = await supabase.from('inscricoes')
            .select('id', { count: 'exact', head: true })
            .eq('evento_id', ev.id).is('deleted_at', null).neq('status', 'cancelada');
          adesoes = count ?? null;
        }
        ev.campanha = { slug: camp.slug, nome: camp.nome, meses: camp.meses || null, adesoes,
          faixas: Array.isArray(camp.faixas) ? camp.faixas.map((f) => f.rotulo) : [] };
      }
    }
  } catch (e) {
    console.warn('[publicEvento espinha] adesão/contrato indisponível:', e.message);
  }
  return ev;
}





async function completarPeloCadastro(body) {
  const cpf = normalizarCpf(body.cpf);
  if (!cpf) return null;
  if (String(body.nome_completo || '').trim() && String(body.telefone || '').trim()) return null;
  const m = await acharMembroGuardado({ cpf }, { soChaveForte: true });
  if (!m?.membro_id) return null;
  const { data } = await supabase.from('mem_membros').select('nome, telefone').eq('id', m.membro_id).maybeSingle();
  if (!data) return null;
  if (!String(body.nome_completo || '').trim() && data.nome) body.nome_completo = data.nome;
  if (!String(body.telefone || '').trim() && data.telefone) body.telefone = data.telefone;
  return m.membro_id;
}

async function anexarExtrasEvento(ev) {
  if (!ev || !ev.id) return ev;
  try {
    const { data, error } = await supabase.from('insc_eventos')
      .select('data_fim, instrucoes_url, instrucoes_nome')
      .eq('id', ev.id).maybeSingle();
    if (error) throw error;
    ev.data_fim = data?.data_fim || null;
    ev.instrucoes_url = /^https:\/\//.test(String(data?.instrucoes_url || '')) ? data.instrucoes_url : null;
    ev.instrucoes_nome = data?.instrucoes_nome || null;
  } catch (e) {
    console.warn('[publicEvento espinha] período/instruções indisponíveis:', e.message);
    ev.data_fim = null;
    ev.instrucoes_url = null;
    ev.instrucoes_nome = null;
  }
  return ev;
}





async function eventoEspinhaPorId(id) {
  const { data } = await supabase.from('insc_eventos')
    .select('id, nome, slug, area, igreja_id, serie_id, data, hora, local, descricao, campos, capa_url, vagas, inscricoes_abrem_em, inscricoes_encerram_em, msg_sucesso_titulo, msg_sucesso_texto, tem_sorteio, pagamento_ativo, valor_centavos, pagamento_metodos, pagamento_expira_horas, parcelas_max, juros_repassados, status, no_totem, checkout_externo_url, checkout_externo_nome')
    .eq('id', id).is('deleted_at', null).maybeSingle();
  if (!data || data.status === 'rascunho' || data.status === 'arquivado') return null;
  await anexarConfigMenor(data);
  await anexarExtrasEvento(data);
  await anexarAdesao(data);
  await anexarLotesEvento(data);


  data.igreja_parceira = await igrejaParceiraPorId(data.igreja_id);
  await anexarWhatsappDuvidas(data);
  await anexarValorCartaoExterno(data);
  return data;
}






async function ocupacaoEspinha(eventoId) {
  try {
    const { data, error } = await supabase.rpc('fn_insc_vagas', { p_evento_id: eventoId });
    if (error) throw error;
    return data || { vagas: null, ocupadas: 0, restantes: null };
  } catch (e) {
    console.error('[publicEvento espinha] fn_insc_vagas indisponível:', e.message);
    return null;
  }
}

async function espinhaEncerrada(ev) {
  if (ev.status !== 'publicado') return true;
  const agora = Date.now();
  if (ev.inscricoes_abrem_em && agora < new Date(ev.inscricoes_abrem_em).getTime()) return true;
  if (ev.inscricoes_encerram_em && agora > new Date(ev.inscricoes_encerram_em).getTime()) return true;
  if (ev.vagas != null) {
    const ocup = await ocupacaoEspinha(ev.id);


    if (ocup && ocup.restantes != null && ocup.restantes <= 0) return true;
  }
  return false;
}


async function eventoPorSlug(slug) {
  const { data } = await supabase.from('ext_eventos')
    .select('id, nome, slug, data, hora, local, descricao, form_ativo, tem_sorteio, campos, capa_url, inscricoes_encerram_em, msg_sucesso_titulo, msg_sucesso_texto')
    .eq('slug', slug).is('deleted_at', null).maybeSingle();
  return data || null;
}

function inscricoesEncerradas(ev) {
  if (!ev.form_ativo) return true;
  if (ev.inscricoes_encerram_em && Date.now() > new Date(ev.inscricoes_encerram_em).getTime()) return true;
  return false;
}



function mesclarDados(atuais, novas) {
  const out = { ...(atuais || {}) };
  for (const [k, v] of Object.entries(novas || {})) {
    if (String(v ?? '').trim() !== '') out[k] = v;
  }
  return out;
}

function validarExtras(evCampos, dadosBody) {
  const campos = Array.isArray(evCampos) ? evCampos : [];











  const visiveis = camposCondicionais.keysVisiveis(campos, dadosBody || {});
  const respostas = {};
  for (const c of campos) {
    if (!c.key || !visiveis.has(String(c.key))) continue;
    const v = dadosBody ? dadosBody[c.key] : undefined;
    const preenchido = v !== undefined && v !== null && String(v).trim() !== '';
    if (c.obrigatorio && !preenchido) return { erro: `Preencha: ${c.label}` };
    if (preenchido) respostas[c.key] = String(v).slice(0, 500);
  }


  const temCampoImagem = campos.some((c) => c.tipo === 'imagem' && c.key && visiveis.has(String(c.key)));
  return { respostas, temCampoImagem };
}

function gerarSorteio() { return Math.floor(Math.random() * 9000) + 1000; }




function metodosDoEvento(ev) {
  const desejados = Array.isArray(ev.pagamento_metodos) && ev.pagamento_metodos.length
    ? ev.pagamento_metodos : null;
  let lista;
  try {
    lista = pagamentos.metodosDisponiveis(desejados);
  } catch {
    lista = desejados || [];
  }






  return checkoutExterno.metodosProprios(lista, ev);
}







function bloqueioPagamento(ev) {
  if (!ev.pagamento_ativo) return null;




  if (checkoutExterno.temCheckoutExterno(ev) && !metodosDoEvento(ev).length) return null;
  if (!(Number(ev.valor_centavos) > 0)) {
    return 'Este evento está marcado como pago mas ainda não tem valor definido. A equipe já foi avisada.';
  }
  if (!pagamentos.habilitado()) {
    return 'O pagamento online está temporariamente indisponível. Tente novamente em alguns minutos.';
  }
  if (!pagamentos.pspConfigurado()) {
    return 'O pagamento online deste evento ainda está sendo preparado. Volte em breve.';
  }
  return null;
}

function avisoPagamento(ev) {
  return bloqueioPagamento(ev);
}


const refCobranca = (inscricaoId) => `inscricao:${inscricaoId}`;















async function valorLoteDaInscricao(ev, inscricaoId) {
  if (!Array.isArray(ev?.lotes) || !ev.lotes.length || !inscricaoId) return null;
  try {
    const { data: eu, error: e1 } = await supabase.from('inscricoes')
      .select('created_at').eq('id', inscricaoId).maybeSingle();
    if (e1 || !eu?.created_at) return null;
    const { count, error: e2 } = await supabase.from('inscricoes')
      .select('id', { count: 'exact', head: true })
      .eq('evento_id', ev.id).is('deleted_at', null).neq('status', 'cancelada')
      .or(`created_at.lt.${eu.created_at},and(created_at.eq.${eu.created_at},id.lte.${inscricaoId})`);
    if (e2 || !(count > 0)) return null;
    const lote = lotesEvento.loteDaPosicao(ev.lotes, count);
    return lote ? { valor_centavos: lote.valor_centavos, nome: lote.nome } : null;
  } catch (e) {
    console.error('[publicEvento espinha] lote da inscrição:', e.message);
    return null;
  }
}











async function beneficioPorCpf(eventoId, cpf) {
  if (!cpf) return null;
  try {
    const { data, error } = await supabase.from('insc_beneficios')
      .select('id, tipo, valor_centavos, motivo, nome_referencia')
      .eq('evento_id', eventoId).eq('cpf', cpf)
      .is('deleted_at', null).is('usado_em', null)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  } catch (e) {
    console.error('[publicEvento] benefício por CPF indisponível:', e.message);
    return null;
  }
}










async function aplicarBeneficio(beneficio, inscricaoId) {
  if (!beneficio) return;
  const integral = beneficio.tipo === 'integral';
  try {
    const { error } = await supabase.from('inscricoes').update({
      valor_cobrado_centavos: integral ? 0 : Number(beneficio.valor_centavos),
      bolsa_tipo: beneficio.tipo,
      bolsa_motivo: beneficio.motivo,
      bolsa_por_nome: beneficio.nome_referencia
        ? `benefício pré-cadastrado (${beneficio.nome_referencia})`
        : 'benefício pré-cadastrado por CPF',
      bolsa_em: new Date().toISOString(),
    }).eq('id', inscricaoId);
    if (error) throw error;
  } catch (e) {
    console.error('[publicEvento] aplicar benefício na inscrição:', e.message);
    return;
  }


  const { error: eUso } = await supabase.from('insc_beneficios')
    .update({ usado_em: new Date().toISOString(), inscricao_id: inscricaoId })
    .eq('id', beneficio.id);
  if (eUso) console.error('[publicEvento] marcar benefício usado:', eUso.message);
}





async function cobrarInscricao({ ev, inscricaoId, val, membroId, valorCentavos, estacaoId, lote }) {
  const horas = Number(ev.pagamento_expira_horas) > 0 ? Number(ev.pagamento_expira_horas) : 48;
  const { cobranca, reemitida } = await pagamentos.criarCobranca({
    origem_tipo: pagamentos.ORIGENS.INSCRICAO,
    origem_id: inscricaoId,
    referencia: refCobranca(inscricaoId),



    valor_centavos: Number(valorCentavos) > 0 ? Number(valorCentavos) : Number(ev.valor_centavos),
    descricao: `Inscrição · ${ev.nome}`,
    metodos_ofertados: metodosDoEvento(ev),


    parcelas_max: ev.parcelas_max || null,
    juros_repassados: ev.juros_repassados !== false,
    expira_em: new Date(Date.now() + horas * 3600000).toISOString(),
    pagador_nome: val.nomeCompleto,
    pagador_cpf: val.cpf,
    pagador_email: val.email,
    pagador_telefone: val.telefone,
    membro_id: membroId || null,


    estacao_id: estacaoId || null,


    metadata: { evento_id: ev.id, evento_slug: ev.slug, evento_nome: ev.nome, ...(lote ? { lote } : {}) },
  });








  if (reemitida) {
    const { error: eVelha } = await supabase.from('insc_pagamentos')
      .update({ status: 'expirado' })




      .eq('inscricao_id', inscricaoId)
      .in('status', ['pendente', 'aguardando']);
    if (eVelha) console.error('[publicEvento espinha] aposentar espelho anterior:', eVelha.message);
  }



  const { error } = await supabase.from('insc_pagamentos').insert({
    inscricao_id: inscricaoId,
    cobranca_id: cobranca.id,


    metodo: cobranca.metodo || null,
    provider: 'psp',
    provider_ref: cobranca.provider_cobranca_id || null,
    valor_centavos: cobranca.valor_centavos,
    status: 'aguardando',
    qr_payload: cobranca.pix_payload || null,
    expira_em: cobranca.expira_em || null,
  });
  if (error && error.code !== '23505') {
    console.error('[publicEvento espinha] espelho insc_pagamentos:', error.message);
  }












  if (Number(cobranca?.valor_centavos) > 0) {
    const { error: eValor } = await supabase.from('inscricoes')
      .update({ valor_cobrado_centavos: Number(cobranca.valor_centavos) })
      .eq('id', inscricaoId);
    if (eValor) console.error('[publicEvento espinha] valor cobrado na inscrição:', eValor.message);
  }





  emailPendenteBestEffort({ ev, inscricaoId, val, cobranca });

  return cobranca;
}





function emailPendenteBestEffort({ ev, inscricaoId, val, cobranca }) {
  (async () => {
    const { data } = await supabase.from('inscricoes')
      .select('codigo, nome_completo, email').eq('id', inscricaoId).maybeSingle();
    await enviarEmailInscricaoPendente({
      inscricao: {
        codigo: data?.codigo || null,
        nome_completo: data?.nome_completo || val?.nomeCompleto,
        email: data?.email || val?.email,
      },
      evento: ev,
      cobranca,
    });
  })().catch((e) => console.error('[publicEvento espinha] e-mail pendente:', e.message));
}






function emailConfirmadaBestEffort({ ev, inscricaoId, val, comprovanteToken }) {
  (async () => {
    const { data } = await supabase.from('inscricoes')
      .select('codigo, nome_completo, email, bolsa_tipo, valor_cobrado_centavos')
      .eq('id', inscricaoId).maybeSingle();
    await enviarEmailInscricaoConfirmada({
      inscricao: {


        id: inscricaoId,
        codigo: data?.codigo || null,
        nome_completo: data?.nome_completo || val?.nomeCompleto,
        email: data?.email || val?.email,
        bolsa_tipo: data?.bolsa_tipo || null,
        valor_cobrado_centavos: data?.valor_cobrado_centavos ?? null,
      },
      evento: ev,
      cobranca: null,
      comprovanteToken,
    });
  })().catch((e) => console.error('[publicEvento espinha] e-mail confirmada:', e.message));
}


function respostaCobranca(cobranca, ev) {
  return {
    ok: true,
    pagamento: true,
    status: cobranca.status,
    public_token: cobranca.public_token,
    checkout_url: cobranca.checkout_url || null,
    valor_centavos: cobranca.valor_centavos,
    expira_em: cobranca.expira_em || null,
    tem_sorteio: ev.tem_sorteio,
  };
}











router.use('/pagamento', semCache);
router.use('/comprovante', semCache);






router.get('/serie/:slugBase', async (req, res) => {
  try {
    const { data: serie } = await supabase.from('insc_series')
      .select('id, nome').eq('slug_base', String(req.params.slugBase || '').slice(0, 80))
      .is('deleted_at', null).maybeSingle();
    if (!serie) return res.status(404).json({ error: 'Não encontrado' });
    const agora = new Date().toISOString();
    const { data, error } = await supabase.from('insc_eventos')
      .select('nome, slug, data, hora, local, inscricoes_abrem_em, inscricoes_encerram_em, igreja:igrejas(nome, cidade, estado)')
      .eq('serie_id', serie.id).eq('status', 'publicado').is('deleted_at', null)
      .order('data', { ascending: true, nullsFirst: false });
    if (error) throw error;
    const abertas = (data || []).filter((e) =>
      !(e.inscricoes_abrem_em && e.inscricoes_abrem_em > agora)
      && !(e.inscricoes_encerram_em && e.inscricoes_encerram_em < agora))
      .map(({ inscricoes_abrem_em: _a, inscricoes_encerram_em: _b, ...e }) => e);
    res.json({ serie: { nome: serie.nome }, edicoes: abertas });
  } catch (e) {
    console.error('[publicEvento] serie:', e.message);
    res.status(500).json({ error: 'Não foi possível carregar agora. Tente de novo em instantes.' });
  }
});

router.get('/textos', (_req, res) => {
  res.json({
    termos_lgpd: TEXTOS.termos_lgpd,
    imagem: TEXTOS.imagem,





    menor_responsavel: TEXTOS.menor_responsavel_inscricao,
    aviso_optin: TEXTOS.aviso_optin,
  });
});


















const METODOS_COM_COMPROVANTE = ['pix', 'transferencia'];




async function comprovantesDaInscricao(inscricaoId) {
  if (!inscricaoId) return [];
  try {
    const { data, error } = await supabase.from('insc_comprovantes')
      .select('id, status, metodo_declarado, arquivo_nome, created_at, motivo_recusa, revisado_em')
      .eq('inscricao_id', inscricaoId).is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) return [];
    return data || [];
  } catch { return []; }
}







async function instrucoesDaInscricao(inscricaoId) {
  if (!inscricaoId) return null;
  try {
    const { data, error } = await supabase.from('inscricoes')
      .select('evento:insc_eventos(instrucoes_url, instrucoes_nome)')
      .eq('id', inscricaoId).maybeSingle();
    if (error) return null;
    const url = data?.evento?.instrucoes_url;
    if (!/^https:\/\//.test(String(url || ''))) return null;
    return { url, nome: data.evento.instrucoes_nome || 'Instruções gerais' };
  } catch { return null; }
}






async function whatsappDuvidasDaInscricao(inscricaoId) {
  if (!inscricaoId) return null;
  try {
    const { data, error } = await supabase.from('inscricoes')
      .select('evento:insc_eventos(whatsapp_duvidas_url)')
      .eq('id', inscricaoId).maybeSingle();
    if (error) return null;
    const url = data?.evento?.whatsapp_duvidas_url;
    return /^https:\/\//.test(String(url || '')) ? url : null;
  } catch { return null; }
}


async function codigoDaInscricao(inscricaoId) {
  if (!inscricaoId) return null;
  try {
    const { data, error } = await supabase.from('inscricoes')
      .select('codigo').eq('id', inscricaoId).maybeSingle();
    if (error) return null;
    return data?.codigo || null;
  } catch { return null; }
}

async function respostaPagamento(cobranca) {
  const daInscricao = cobranca.origem_tipo === 'inscricao' ? cobranca.origem_id : null;
  const comprovanteToken = (cobranca.status === 'pago' && daInscricao)
    ? await emitirTokenComprovante(daInscricao, 'pagamento') : null;
  const comprovantes = daInscricao ? await comprovantesDaInscricao(daInscricao) : [];
  const ofertados = Array.isArray(cobranca.metodos_ofertados) ? cobranca.metodos_ofertados : [];
  return {




    ...estadoBasePagamento(cobranca),
    evento_nome: cobranca.metadata?.evento_nome || null,
    evento_slug: cobranca.metadata?.evento_slug || null,



    codigo: await codigoDaInscricao(daInscricao),



    comprovante_token: comprovanteToken,



    instrucoes: cobranca.status === 'pago' ? await instrucoesDaInscricao(daInscricao) : null,

    whatsapp_duvidas: await whatsappDuvidasDaInscricao(daInscricao),






    aceita_comprovante: cobranca.status !== 'pago' && (
      cobranca.metodo
        ? METODOS_COM_COMPROVANTE.includes(cobranca.metodo)
        : (ofertados.length === 0 || ofertados.some(m => METODOS_COM_COMPROVANTE.includes(m)))
    ),
    comprovantes: comprovantes.map(c => ({
      id: c.id, status: c.status, metodo_declarado: c.metodo_declarado,
      arquivo_nome: c.arquivo_nome || null, enviado_em: c.created_at,
      motivo_recusa: c.motivo_recusa || null,
    })),
  };
}









router.post('/pagamento/:token/comprovante', uploadComprovante.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Envie uma imagem (JPG/PNG/WEBP) ou PDF de até 10 MB.' });
    }
    const cobranca = await pagamentos.consultarPorToken(req.params.token);
    if (!cobranca) return res.status(404).json({ error: 'Cobrança não encontrada' });
    if (cobranca.origem_tipo !== 'inscricao' || !cobranca.origem_id) {
      return res.status(400).json({ error: 'Este pagamento não aceita comprovante.' });
    }


    if (cobranca.status === 'pago') {
      return res.status(409).json({ error: 'Este pagamento já está confirmado.', pagamento: await respostaPagamento(cobranca) });
    }

    const inscricaoId = cobranca.origem_id;
    const metodo = METODOS_COM_COMPROVANTE.includes(String(req.body?.metodo_declarado || '').trim())
      ? String(req.body.metodo_declarado).trim()
      : (METODOS_COM_COMPROVANTE.includes(cobranca.metodo) ? cobranca.metodo : 'pix');



    const jaEnviados = await comprovantesDaInscricao(inscricaoId);
    if (jaEnviados.length >= 8) {
      return res.status(429).json({ error: 'Muitos comprovantes enviados. Fale com a equipe pelo WhatsApp.' });
    }

    const ext = EXT_COMPROVANTE[req.file.mimetype] || 'bin';
    const path = `${inscricaoId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const up = await supabase.storage.from('inscricao-comprovantes')
      .upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
    if (up.error) throw new Error(up.error.message);

    const { data: linha, error } = await supabase.from('insc_comprovantes').insert({
      inscricao_id: inscricaoId,
      cobranca_id: cobranca.id,
      metodo_declarado: metodo,
      storage_path: path,
      arquivo_nome: (req.file.originalname || '').slice(0, 200) || null,
      arquivo_tipo: req.file.mimetype,
      arquivo_bytes: req.file.size,
      observacao: req.body?.observacao ? String(req.body.observacao).slice(0, 500) : null,
    }).select('id').single();
    if (error) {


      await supabase.storage.from('inscricao-comprovantes').remove([path]).catch(() => {});
      throw new Error(error.message);
    }

    const { data: insc } = await supabase.from('inscricoes')
      .select('nome_completo').eq('id', inscricaoId).maybeSingle();

    notificar({
      modulo: 'inscricoes',
      tipo: 'comprovante_pagamento',
      titulo: 'Comprovante de pagamento pra conferir',


      mensagem: `${insc?.nome_completo || 'Um inscrito'} anexou comprovante de ${metodo === 'pix' ? 'Pix' : 'transferência'}${cobranca.metadata?.evento_nome ? ` · ${cobranca.metadata.evento_nome}` : ''}. O pagamento NÃO foi baixado — confira e confirme na tela do evento.`,
      link: cobranca.metadata?.evento_id ? `/inscricoes/evento/${cobranca.metadata.evento_id}` : '/inscricoes',
      chaveDedup: `insc_comprovante_${linha.id}`,
    }).catch((err) => console.error('[publicEvento] notificar comprovante:', err.message));

    res.json({ ok: true, pagamento: await respostaPagamento(cobranca) });
  } catch (e) {
    console.error('[publicEvento] comprovante:', e.message);
    res.status(500).json({ error: 'Não conseguimos anexar o comprovante agora. Tente novamente.' });
  }
});

























router.post('/pagamento/:token/cartao', async (req, res) => {
  try {
    const cobranca = await pagamentos.consultarPorToken(req.params.token);
    if (!cobranca) return res.status(404).json({ error: 'Cobrança não encontrada' });

    const b = req.body || {};
    if (!b.token) return res.status(400).json({ error: 'Não recebemos os dados do cartão. Tente de novo.' });

    const r = await pagamentos.pagarComCartao(cobranca, {
      token: b.token,
      installments: b.installments,
      payment_method_id: b.payment_method_id,
      issuer_id: b.issuer_id,
      payment_method_option_id: b.payment_method_option_id,
      payer: b.payer,
    });



    const pagamento = await respostaPagamento(r.cobranca || cobranca);

    if (!r.ok) {
      if (r.recusado) {


        return res.status(402).json({ error: r.motivo || 'Pagamento não aprovado.', recusado: true, pagamento });
      }
      if (r.motivo === 'cobranca_nao_editavel') {
        return res.status(409).json({ error: 'Esta cobrança já foi paga ou encerrada.', pagamento });
      }
      if (r.motivo === 'provider_sem_tokenizacao') {
        return res.status(503).json({ error: 'Pagamento com cartão nesta tela está indisponível agora.', pagamento });
      }
      return res.status(400).json({ error: r.motivo || 'Não foi possível cobrar o cartão.', pagamento });
    }

    return res.json(pagamento);
  } catch (e) {
    console.error('[publicEvento] cartao:', e.message);


    res.status(502).json({ error: 'Não foi possível processar o cartão agora. Tente de novo em instantes.' });
  }
});

router.post('/pagamento/:token/metodo', async (req, res) => {
  try {
    const cobranca = await pagamentos.consultarPorToken(req.params.token);
    if (!cobranca) return res.status(404).json({ error: 'Cobrança não encontrada' });




    const r = await escolherFormaPagamento(cobranca, {
      metodo: req.body?.metodo, parcelas: req.body?.parcelas,
    });
    const pagamento = await respostaPagamento(r.cobranca);
    if (r.error) return res.status(r.status).json({ error: r.error, pagamento });
    return res.json(pagamento);
  } catch (e) {
    console.error('[publicEvento] metodo do pagamento:', e.message);
    res.status(500).json({ error: 'Erro ao escolher a forma de pagamento.' });
  }
});

router.get('/pagamento/:token', async (req, res) => {
  try {
    let cobranca = await pagamentos.consultarPorToken(req.params.token);
    if (!cobranca) return res.status(404).json({ error: 'Cobrança não encontrada' });





    cobranca = await sincronizarSeParada(cobranca);

    res.json(await respostaPagamento(cobranca));
  } catch (e) {
    console.error('[publicEvento] status do pagamento:', e.message);
    res.status(500).json({ error: 'Erro ao consultar o pagamento.' });
  }
});







router.get('/comprovante/:token', async (req, res) => {
  try {
    const inscricaoId = await verificarTokenComprovanteAtivo(req.params.token);
    if (!inscricaoId) return res.status(404).json({ error: 'Comprovante não encontrado' });

    const { data: ins } = await supabase.from('inscricoes')
      .select('id, evento_id, nome_completo, numero_sorte, status, created_at')
      .eq('id', inscricaoId).is('deleted_at', null).maybeSingle();
    if (!ins) return res.status(404).json({ error: 'Comprovante não encontrado' });

    const { data: ev } = await supabase.from('insc_eventos')
      .select('nome, slug, data, hora, local, tem_sorteio')
      .eq('id', ins.evento_id).is('deleted_at', null).maybeSingle();
    if (!ev) return res.status(404).json({ error: 'Comprovante não encontrado' });



    let checkinEm = null;
    try {
      const { data: c } = await supabase.from('insc_checkins')
        .select('em').eq('inscricao_id', ins.id).maybeSingle();
      checkinEm = c?.em || null;
    } catch (e2) { console.error('[publicEvento] comprovante/checkin:', e2.message); }

    res.json({
      nome: ins.nome_completo,
      numero_sorte: ev.tem_sorteio ? ins.numero_sorte : null,
      tem_sorteio: !!ev.tem_sorteio,
      status: ins.status,
      inscrito_em: ins.created_at,
      checkin_em: checkinEm,
      evento: { nome: ev.nome, slug: ev.slug, data: ev.data, hora: ev.hora, local: ev.local },
    });
  } catch (e) {
    console.error('[publicEvento] comprovante:', e.message);
    res.status(500).json({ error: 'Erro ao carregar o comprovante.' });
  }
});


router.get('/:slug', async (req, res) => {
  try {
  const esp = await eventoEspinhaPorSlug(req.params.slug);
  if (esp) {
    const pago = !!esp.pagamento_ativo && Number(esp.valor_centavos) > 0;
    const temLotes = pago && Array.isArray(esp.lotes) && esp.lotes.length > 0;



    const ocup = (esp.vagas != null || temLotes) ? await ocupacaoEspinha(esp.id) : null;




    const lote = temLotes && ocup ? lotesEvento.loteAtual(esp.lotes, ocup.ocupadas || 0) : null;


    const bloqueio = bloqueioPagamento(esp);
    const encerradas = !!bloqueio || await espinhaEncerrada(esp);
    return res.json({
      fonte: 'espinha',
      nome: esp.nome, slug: esp.slug, data: esp.data, hora: esp.hora, local: esp.local,

      data_fim: esp.data_fim || null,


      instrucoes: esp.instrucoes_url
        ? { url: esp.instrucoes_url, nome: esp.instrucoes_nome || 'Instruções gerais' }
        : null,
      descricao: esp.descricao, form_ativo: !encerradas, tem_sorteio: esp.tem_sorteio,
      campos: Array.isArray(esp.campos) ? esp.campos : [], capa_url: esp.capa_url || null,
      inscricoes_encerram_em: esp.inscricoes_encerram_em || null,
      inscricoes_encerradas: encerradas,
      vagas: esp.vagas ?? null,





      vagas_restantes: temLotes || !ocup ? null : ocup.restantes,



      pagamento_ativo: pago,
      valor_centavos: pago ? (lote ? lote.valor_centavos : Number(esp.valor_centavos)) : null,







      lote_atual: lote ? { nome: lote.nome, valor_centavos: lote.valor_centavos } : null,


      whatsapp_duvidas: esp.whatsapp_duvidas_url || null,
      igreja_parceira: esp.igreja_parceira ? { nome: esp.igreja_parceira.nome } : null,
      pagamento_metodos: pago ? metodosDoEvento(esp) : [],



      checkout_externo: pago && checkoutExterno.temCheckoutExterno(esp) ? {
        url: checkoutExterno.linkExternoValido(esp.checkout_externo_url),
        nome: checkoutExterno.nomeExterno(esp.checkout_externo_nome),


        exclusivo: !metodosDoEvento(esp).length,





        valor_centavos: esp.checkout_externo_valor_centavos || null,
      } : null,
      pagamento_expira_horas: pago ? (esp.pagamento_expira_horas || 48) : null,


      aviso: avisoPagamento(esp),
      msg_sucesso_titulo: esp.msg_sucesso_titulo || null,
      msg_sucesso_texto: esp.msg_sucesso_texto || null,



      exigir_endereco: !!esp.exigir_endereco,
      exige_dados_menor: !!esp.exige_dados_menor,
      contrato: esp.contrato || 'completo',
      tipo: esp.tipo || 'evento',
      campanha: esp.campanha || null,
      maioridade: inscricaoMenor.MAIORIDADE,
      parentescos: esp.exige_dados_menor ? inscricaoMenor.PARENTESCOS : [],
      termos_extra: (Array.isArray(esp.termos_extra) ? esp.termos_extra : [])
        .filter((t) => t && t.chave && t.texto)
        .map((t) => ({
          chave: String(t.chave),
          titulo: String(t.titulo || 'Termo do evento'),
          texto: String(t.texto),

          ...(t.so_menor ? { so_menor: true } : {}),
          ...(/^https:\/\//.test(String(t.url || '')) ? { url: String(t.url) } : {}),
        })),
    });
  }

  const ev = await eventoPorSlug(req.params.slug);
  if (!ev) return res.status(404).json({ error: 'Evento não encontrado' });
  res.json({
    fonte: 'ext',
    nome: ev.nome, slug: ev.slug, data: ev.data, hora: ev.hora, local: ev.local,
    descricao: ev.descricao, form_ativo: ev.form_ativo, tem_sorteio: ev.tem_sorteio,
    campos: Array.isArray(ev.campos) ? ev.campos : [], capa_url: ev.capa_url || null,
    inscricoes_encerram_em: ev.inscricoes_encerram_em || null,
    inscricoes_encerradas: inscricoesEncerradas(ev),
    msg_sucesso_titulo: ev.msg_sucesso_titulo || null,
    msg_sucesso_texto: ev.msg_sucesso_texto || null,
  });
  } catch (e) {


    console.error('[publicEvento] GET /:slug:', e.message);
    res.status(500).json({ error: 'Não foi possível carregar o evento agora. Tente de novo em instantes.' });
  }
});












async function inscreverEspinha(req, res, ev, opts = {}) {
  const body = req.body || {};
  const origemInscricao = opts.origem || 'formulario_publico';


  const contratoMinimo = ev.contrato === 'minimo';
  const qrSlug = T.qrSlugValido(body.qr);
  if (contratoMinimo) {
    try { await completarPeloCadastro(body); } catch (e) { console.warn('[publicEvento espinha] completar pelo cadastro:', e.message); }
  }


  const estacaoId = opts.estacaoId || null;
  if (await espinhaEncerrada(ev)) {
    return res.status(403).json({ error: 'As inscrições deste evento estão encerradas.' });
  }


  const bloqueio = bloqueioPagamento(ev);
  if (bloqueio) return res.status(503).json({ error: bloqueio });



  if (checkoutExterno.temCheckoutExterno(ev) && !metodosDoEvento(ev).length) {
    const op = checkoutExterno.opcoesPagamento(ev);
    return res.status(409).json({
      error: `A inscrição deste evento é feita pelo ${op.externo_nome}.`,
      checkout_externo: { url: op.externo_url, nome: op.externo_nome },
    });
  }
  const ehPago = !!ev.pagamento_ativo;


  const { erros, valores: val } = validarCamposPadrao(body, contratoMinimo
    ? { exigirEmail: false, exigirNascimento: false, exigirSexo: false } : {});
  const campoErro = Object.keys(erros)[0];
  if (campoErro) return res.status(400).json({ error: erros[campoErro], campo: campoErro });
  if (!body.aceita_termos) return res.status(400).json({ error: 'É preciso aceitar os termos para se inscrever.', campo: 'aceita_termos' });



  if (ev.exigir_endereco && !val.endereco) {
    return res.status(400).json({ error: 'Informe o endereço completo.', campo: 'endereco' });
  }

  const ex = validarExtras(ev.campos, body.dados);
  if (ex.erro) return res.status(400).json({ error: ex.erro });
  const optin = Boolean(body.whatsapp_optin);





  const precisaResponsavel = inscricaoMenor.exigeResponsavel(ev, val.dataNascimento);
  let resp = null;
  if (precisaResponsavel) {
    const r = inscricaoMenor.validarResponsavel(body);
    const respErro = Object.keys(r.erros)[0];
    if (respErro) return res.status(400).json({ error: r.erros[respErro], campo: respErro });


    if (!body.consent_menor) {
      return res.status(400).json({
        error: 'É preciso a autorização do responsável para inscrever menor de idade.',
        campo: 'consent_menor',
      });
    }
    resp = r.valores;
  }









  const termosEvento = (Array.isArray(ev.termos_extra) ? ev.termos_extra : [])
    .filter((t) => t && t.chave && t.texto)
    .filter((t) => !t.so_menor || precisaResponsavel);
  const aceitesBody = (body.aceites && typeof body.aceites === 'object') ? body.aceites : {};
  for (const t of termosEvento) {
    if (aceitesBody[t.chave] !== true) {
      return res.status(400).json({
        error: `É preciso aceitar: ${t.titulo || 'termo do evento'}.`,
        campo: `aceite_${t.chave}`,
      });
    }
  }







  const beneficio = ehPago ? await beneficioPorCpf(ev.id, val.cpf) : null;
  const isento = beneficio?.tipo === 'integral';
  const valorComBeneficio = beneficio && !isento ? Number(beneficio.valor_centavos) : null;

  const vaiCobrar = ehPago && !isento;

  const ip = req.ip || null;
  const ua = req.headers['user-agent'] || null;






  const declaradoPor = String(opts.consentDeclaradoPor || '').trim();
  const textoTermos = declaradoPor
    ? `DECLARADO PRESENCIALMENTE POR ${declaradoPor} no balcão (não é aceite digitado pelo próprio titular) — ${TEXTOS.termos_lgpd}`
    : undefined;
  const consentimentos = (refId, membroId) => registrarConsentimentos({
    porta: 'inscricoes', refId, membroId, ip, userAgent: ua,
    itens: [
      { tipo: 'termos_lgpd', aceito: true, ...(textoTermos ? { texto: textoTermos } : {}) },
      { tipo: 'whatsapp', aceito: optin },
      ...(ex.temCampoImagem ? [{ tipo: 'imagem', aceito: Boolean(body.consent_imagem) }] : []),






      ...(precisaResponsavel
        ? [{ tipo: 'menor_responsavel', aceito: true, texto: TEXTOS.menor_responsavel_inscricao }]
        : []),




      ...termosEvento.map((t) => ({
        tipo: 'evento_termo',
        aceito: true,
        texto: `[${t.chave}] ${t.titulo || 'Termo do evento'}\n\n${t.texto}`,
      })),
    ],
  });















  const COLS_DEDUP = 'id, numero_sorte, dados, membro_id, whatsapp_optin, status, nome_completo, cpf, email, data_nascimento, sexo, endereco, telefone';
  const colsDedup = ev.exige_dados_menor
    ? `${COLS_DEDUP}, responsavel_nome, responsavel_cpf, responsavel_parentesco, responsavel_telefone, responsavel_email, responsavel_autoriza_batismo`
    : COLS_DEDUP;
  const { data: dups, error: eDup } = await supabase.from('inscricoes')
    .select(colsDedup)
    .eq('evento_id', ev.id).eq('cpf', val.cpf).is('deleted_at', null).limit(2);
  if (eDup) throw eDup;
  let existente = (dups || []).find(d => d.status !== 'cancelada') || (dups || [])[0] || null;
  if (!existente && val.telefone) {
    const { data: legadas, error: eLeg } = await supabase.from('inscricoes')
      .select(colsDedup)
      .eq('evento_id', ev.id).eq('telefone', val.telefone).is('cpf', null).is('deleted_at', null).limit(5);
    if (eLeg) throw eLeg;
    existente = (legadas || []).find(d => nomesMesmaPessoa(d.nome_completo, val.nomeCompleto) && d.status !== 'cancelada')
      || (legadas || []).find(d => nomesMesmaPessoa(d.nome_completo, val.nomeCompleto))
      || null;
  }
  if (existente) {


    const patch = {
      dados: mesclarDados(existente.dados, ex.respostas),
      dados_anterior: existente.dados || {},
    };



    if (!existente.cpf && val.cpf) patch.cpf = val.cpf;
    if (!existente.email && val.email) patch.email = val.email;
    if (!existente.data_nascimento && val.dataNascimento) patch.data_nascimento = val.dataNascimento;
    if (!existente.sexo && val.sexo) patch.sexo = val.sexo;
    if (!existente.endereco && val.endereco) patch.endereco = val.endereco;
    if (!existente.telefone && val.telefone) patch.telefone = val.telefone;





    if (resp) {
      if (!existente.responsavel_nome && resp.responsavelNome) patch.responsavel_nome = resp.responsavelNome;
      if (!existente.responsavel_cpf && resp.responsavelCpf) patch.responsavel_cpf = resp.responsavelCpf;
      if (!existente.responsavel_parentesco && resp.responsavelParentesco) patch.responsavel_parentesco = resp.responsavelParentesco;
      if (!existente.responsavel_telefone && resp.responsavelTelefone) patch.responsavel_telefone = resp.responsavelTelefone;
      if (!existente.responsavel_email && resp.responsavelEmail) patch.responsavel_email = resp.responsavelEmail;
      if (existente.responsavel_autoriza_batismo == null && resp.responsavelAutorizaBatismo != null) {
        patch.responsavel_autoriza_batismo = resp.responsavelAutorizaBatismo;
      }
    }
    if (existente.status === 'cancelada') {


      patch.status = ehPago ? 'recebida' : 'confirmada';
    }
    if (optin && !existente.whatsapp_optin) { patch.whatsapp_optin = true; patch.whatsapp_optin_em = new Date().toISOString(); }
    const { error: eUp } = await supabase.from('inscricoes').update(patch).eq('id', existente.id);

    if (qrSlug) {
      const { error: eQr } = await supabase.from('inscricoes').update({ qr_slug: qrSlug }).eq('id', existente.id).is('qr_slug', null);
      if (eQr && eQr.code !== '42703') console.warn('[publicEvento espinha] qr_slug (re-inscrição):', eQr.message);
    }
    if (eUp) console.error('[publicEvento espinha] merge re-inscrição:', eUp.message);
    consentimentos(existente.id, existente.membro_id || null)
      .catch((err) => console.error('[publicEvento espinha] consentimentos:', err.message));

    if (ehPago) {





      if (beneficio) {
        notificar({
          modulo: 'inscricoes', tipo: 'beneficio_pendente',
          titulo: 'Benefício não aplicado automaticamente',
          mensagem: `${val.nomeCompleto} tem ${beneficio.tipo === 'integral' ? 'gratuidade' : 'desconto'} autorizado em "${ev.nome}", mas já estava inscrita com a cobrança cheia. Aplique pelo botão "Dar bolsa" na ficha dela (ele reemite a cobrança).`,
          link: `/inscricoes/evento/${ev.id}`,
          chaveDedup: `insc_beneficio_pendente_${beneficio.id}`,
        }).catch((err) => console.error('[publicEvento espinha] notificar benefício:', err.message));
      }






      const loteExistente = await valorLoteDaInscricao(ev, existente.id);
      const cobranca = await cobrarInscricao({
        ev, inscricaoId: existente.id, val, membroId: existente.membro_id,
        valorCentavos: loteExistente?.valor_centavos, lote: loteExistente?.nome,
      });
      return res.json({ ...respostaCobranca(cobranca, ev), ja_inscrito: true });
    }
    const comprovanteToken = await emitirTokenComprovante(existente.id, 'form_reinscricao');
    return res.json({
      ok: true, ja_inscrito: true, numero_sorte: existente.numero_sorte, tem_sorteio: ev.tem_sorteio,
      comprovante_token: comprovanteToken,
    });
  }






  const { data: rpc, error } = await supabase.rpc('fn_insc_inscrever', {
    p_evento_id: ev.id,
    p_nome_completo: val.nomeCompleto,
    p_telefone: val.telefone,
    p_cpf: val.cpf,
    p_email: val.email,
    p_data_nascimento: val.dataNascimento,
    p_sexo: val.sexo,
    p_endereco: val.endereco,
    p_dados: ex.respostas,






    p_status: vaiCobrar ? 'recebida' : 'confirmada',
    p_origem: origemInscricao,
    p_com_sorteio: !!ev.tem_sorteio,
    p_whatsapp_optin: optin,
  });
  if (error) throw error;

  if (!rpc?.ok) {


    if (rpc?.motivo === 'duplicada') {



      if (ehPago && rpc.id) {
        const loteCorrida = await valorLoteDaInscricao(ev, rpc.id);
        const cobranca = await cobrarInscricao({
          ev, inscricaoId: rpc.id, val, membroId: null, estacaoId,
          valorCentavos: loteCorrida?.valor_centavos, lote: loteCorrida?.nome,
        });
        return res.json({ ...respostaCobranca(cobranca, ev), ja_inscrito: true });
      }



      const { data: vencedora } = await supabase.from('inscricoes')
        .select('id, numero_sorte').eq('evento_id', ev.id).eq('cpf', val.cpf)
        .is('deleted_at', null).limit(1).maybeSingle();
      const comprovanteToken = vencedora
        ? await emitirTokenComprovante(vencedora.id, 'form_corrida_duplicada') : null;
      return res.status(200).json({
        ok: true, ja_inscrito: true, numero_sorte: vencedora?.numero_sorte ?? null, tem_sorteio: ev.tem_sorteio,
        comprovante_token: comprovanteToken,
      });
    }
    if (rpc?.motivo === 'sem_vaga') {
      return res.status(409).json({ error: 'As vagas deste evento acabaram de esgotar.', motivo: 'sem_vaga' });
    }
    if (rpc?.motivo === 'encerrado') {
      return res.status(403).json({ error: 'As inscrições deste evento estão encerradas.' });
    }
    if (rpc?.motivo === 'sorteio_esgotado') {
      return res.status(503).json({ error: 'Não foi possível gerar o número agora. Tente de novo.' });
    }
    console.error('[publicEvento espinha] inscrever recusado:', rpc?.motivo);
    return res.status(409).json({ error: 'Não foi possível concluir a inscrição. Tente de novo.' });
  }
  const ins = { id: rpc.id, numero_sorte: rpc.numero_sorte };
  if (qrSlug) {
    const { error: eQr } = await supabase.from('inscricoes').update({ qr_slug: qrSlug }).eq('id', ins.id);
    if (eQr && eQr.code !== '42703') console.warn('[publicEvento espinha] qr_slug:', eQr.message);
  }















  if (resp) {
    const patchResp = {
      responsavel_nome: resp.responsavelNome,
      responsavel_cpf: resp.responsavelCpf,
      responsavel_parentesco: resp.responsavelParentesco,
      responsavel_telefone: resp.responsavelTelefone,
      responsavel_email: resp.responsavelEmail,
      responsavel_autoriza_batismo: resp.responsavelAutorizaBatismo,
    };
    let erroResp = null;
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const { error: eResp } = await supabase.from('inscricoes').update(patchResp).eq('id', ins.id);
      if (!eResp) { erroResp = null; break; }
      erroResp = eResp;
    }
    if (erroResp) {
      console.error('[publicEvento espinha] responsavel do menor:', erroResp.message);


      notificar({
        modulo: 'inscricoes', tipo: 'nova_inscricao',
        titulo: `Contato do responsável não gravou · ${ev.nome}`,
        mensagem: `A inscrição de ${val.nomeCompleto} é de menor de idade e os dados do responsável NÃO foram gravados. Abra a inscrição e peça o contato antes do evento.`,
        link: `/inscricoes/evento/${ev.id}`,
        chaveDedup: `insc_resp_falhou_${ins.id}`,
      }).catch((err) => console.error('[publicEvento espinha] avisar responsavel:', err.message));
    }
  }









  if (estacaoId) {
    supabase.from('inscricoes').update({ totem_estacao_id: estacaoId }).eq('id', ins.id)
      .then(({ error: eEst }) => {
        if (eEst) console.error('[publicEvento espinha] estacao na inscricao:', eEst.message);
      });
  }



  await aplicarBeneficio(beneficio, ins.id);




















  const politicaIdentidade = normalizarCpf(val.cpf) ? 'criar' : 'ligar';
  (ev.igreja_parceira ? consentimentos(ins.id, null) : processarIdentidade({
    nomeCompleto: val.nomeCompleto, cpf: val.cpf, email: val.email, telefone: val.telefone,
    dataNascimento: val.dataNascimento, genero: val.sexo, politica: politicaIdentidade,
    origem: 'inscricoes_formulario', origemId: ins.id,
  }).then((ident) => {
    if (ident.membroId) {
      return supabase.from('inscricoes').update({ membro_id: ident.membroId }).eq('id', ins.id)
        .then(({ error: eM }) => { if (eM) console.error('[publicEvento espinha] vincular membro:', eM.message); })
        .then(() => consentimentos(ins.id, ident.membroId));
    }
    return consentimentos(ins.id, null);
  })).catch((err) => console.error('[publicEvento espinha] identidade/consentimentos:', err.message));








  let avisarTambem = [];
  try {
    const moduloArea = ev.igreja_parceira ? null : moduloDaAreaEvento(ev.area);
    if (moduloArea) avisarTambem = await resolverDestinatarios(moduloArea, 'nova_inscricao');

    if (ev.serie_id) {
      const { data: serieResp } = await supabase.from('insc_series')
        .select('responsavel_id').eq('id', ev.serie_id).maybeSingle();
      if (serieResp?.responsavel_id) avisarTambem = [...new Set([...(avisarTambem || []), serieResp.responsavel_id])];
    }
  } catch (err) {
    console.error('[publicEvento espinha] destinatarios da area:', err.message);
  }

  notificar({
    modulo: 'inscricoes', tipo: 'nova_inscricao',
    titulo: `Nova inscrição · ${ev.nome}`,


    mensagem: ehPago
      ? `${val.nomeCompleto} reservou vaga em "${ev.nome}" (${ev.area}) e está aguardando o pagamento.`
      : `${val.nomeCompleto} se inscreveu em "${ev.nome}" (${ev.area}).`,
    link: '/inscricoes',
    extraTargetIds: avisarTambem,
  }).catch((err) => console.error('[publicEvento espinha] notificar:', err.message));








  if (!vaiCobrar) {
    enviarConfirmacaoInscricao({
      inscricaoId: ins.id, nome: val.nomeCompleto, telefone: val.telefone,
      optin, evento: ev,
    }).catch((err) => console.error('[publicEvento espinha] confirmação WhatsApp:', err.message));
  }

  if (vaiCobrar) {



    try {



      const loteInsc = valorComBeneficio == null ? await valorLoteDaInscricao(ev, ins.id) : null;
      const cobranca = await cobrarInscricao({
        ev, inscricaoId: ins.id, val, membroId: null,
        valorCentavos: valorComBeneficio ?? loteInsc?.valor_centavos,
        lote: loteInsc?.nome,
        estacaoId,
      });
      return res.status(201).json({ ...respostaCobranca(cobranca, ev), beneficio: beneficio ? 'parcial' : null });
    } catch (e) {
      console.error('[publicEvento espinha] criar cobrança:', e.message);
      return res.status(502).json({
        error: 'Sua vaga ficou reservada, mas não conseguimos gerar o pagamento agora. '
          + 'Tente enviar o formulário de novo em alguns minutos — sua vaga não será perdida.',
        vaga_reservada: true,
      });
    }
  }

  const comprovanteToken = await emitirTokenComprovante(ins.id, 'form_sucesso');
  emailConfirmadaBestEffort({ ev, inscricaoId: ins.id, val, comprovanteToken });
  return res.status(201).json({
    ok: true, numero_sorte: ins.numero_sorte, tem_sorteio: ev.tem_sorteio,


    comprovante_token: comprovanteToken,


    beneficio: isento ? 'integral' : null,
  });
}


async function inscreverExt(req, res, ev) {
  const body = req.body || {};
  if (inscricoesEncerradas(ev)) return res.status(403).json({ error: 'As inscrições deste evento estão encerradas.' });

  const { erros, valores: val } = validarCamposPadrao(body);
  const campoErro = Object.keys(erros)[0];
  if (campoErro) return res.status(400).json({ error: erros[campoErro], campo: campoErro });
  if (!body.aceita_termos) return res.status(400).json({ error: 'É preciso aceitar os termos para se inscrever.', campo: 'aceita_termos' });

  const ex = validarExtras(ev.campos, body.dados);
  if (ex.erro) return res.status(400).json({ error: ex.erro });
  const optin = Boolean(body.whatsapp_optin);
  const ip = req.ip || null;
  const ua = req.headers['user-agent'] || null;

  const consentimentos = (refId, membroId) => registrarConsentimentos({
    porta: 'evento_externo', refId, membroId, ip, userAgent: ua,
    itens: [
      { tipo: 'termos_lgpd', aceito: true },
      { tipo: 'whatsapp', aceito: optin },
      ...(ex.temCampoImagem ? [{ tipo: 'imagem', aceito: Boolean(body.consent_imagem) }] : []),
    ],
  });


  const { data: porCpf, error: eCpf } = await supabase.from('ext_inscricoes')
    .select('id, numero_sorte, dados, cpf, email, data_nascimento, sexo, endereco, membro_id, whatsapp_optin')
    .eq('evento_id', ev.id).eq('cpf', val.cpf).is('deleted_at', null).limit(2);
  if (eCpf) throw eCpf;


  let existente = (porCpf || [])[0] || null;
  if (!existente) {
    const { data: porTel, error: eTel } = await supabase.from('ext_inscricoes')
      .select('id, numero_sorte, dados, cpf, email, data_nascimento, sexo, endereco, membro_id, whatsapp_optin')
      .eq('evento_id', ev.id).eq('telefone', val.telefone).is('cpf', null).is('deleted_at', null).limit(2);
    if (eTel) throw eTel;
    existente = (porTel || [])[0] || null;
  }

  if (existente) {
    const patch = {
      dados: mesclarDados(existente.dados, ex.respostas),
      dados_anterior: existente.dados || {},
    };
    if (!existente.cpf && val.cpf) patch.cpf = val.cpf;
    if (!existente.email && val.email) patch.email = val.email;
    if (!existente.data_nascimento && val.dataNascimento) patch.data_nascimento = val.dataNascimento;
    if (!existente.sexo && val.sexo) patch.sexo = val.sexo;
    if (!existente.endereco && val.endereco) patch.endereco = val.endereco;
    if (optin && !existente.whatsapp_optin) { patch.whatsapp_optin = true; patch.whatsapp_optin_em = new Date().toISOString(); }

    const ident = await processarIdentidade({
      nomeCompleto: val.nomeCompleto, cpf: val.cpf, email: val.email, telefone: val.telefone,
      dataNascimento: val.dataNascimento, politica: 'ligar',
      origem: 'evento_externo_formulario', origemId: existente.id,
    });
    if (!existente.membro_id && ident.membroId) patch.membro_id = ident.membroId;

    const { error: eUp } = await supabase.from('ext_inscricoes').update(patch).eq('id', existente.id);
    if (eUp) console.error('[publicEventoExterno] merge da re-inscrição falhou:', eUp.message);
    consentimentos(existente.id, existente.membro_id || ident.membroId || null)
      .catch((err) => console.error('[publicEventoExterno] consentimentos:', err.message));

    return res.json({ ok: true, ja_inscrito: true, numero_sorte: existente.numero_sorte, tem_sorteio: ev.tem_sorteio });
  }


  let numero = null;
  for (let tentativa = 0; tentativa < 25; tentativa++) {
    const cand = gerarSorteio();
    const { data: existe, error: eNum } = await supabase.from('ext_inscricoes')
      .select('id').eq('evento_id', ev.id).eq('numero_sorte', cand).limit(1);
    if (eNum) throw eNum;
    if (!existe || !existe.length) { numero = cand; break; }
  }
  if (numero == null) return res.status(503).json({ error: 'Não foi possível gerar o número agora. Tente de novo.' });

  const { data: ins, error } = await supabase.from('ext_inscricoes').insert({
    evento_id: ev.id,
    nome: val.nomeCompleto,
    telefone: val.telefone,
    cpf: val.cpf,
    email: val.email,
    data_nascimento: val.dataNascimento,
    sexo: val.sexo,
    endereco: val.endereco,
    whatsapp_optin: optin,
    whatsapp_optin_em: optin ? new Date().toISOString() : null,
    status: 'confirmada',
    origem: 'formulario_publico',
    numero_sorte: numero,
    dados: ex.respostas,
  }).select('id, numero_sorte').single();
  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Tente enviar de novo.' });
    throw error;
  }

  processarIdentidade({
    nomeCompleto: val.nomeCompleto, cpf: val.cpf, email: val.email, telefone: val.telefone,
    dataNascimento: val.dataNascimento, politica: 'ligar',
    origem: 'evento_externo_formulario', origemId: ins.id,
  }).then((ident) => {
    if (ident.membroId) {
      return supabase.from('ext_inscricoes').update({ membro_id: ident.membroId }).eq('id', ins.id)
        .then(({ error: eM }) => { if (eM) console.error('[publicEventoExterno] vincular membro:', eM.message); })
        .then(() => consentimentos(ins.id, ident.membroId));
    }
    return consentimentos(ins.id, null);
  }).catch((err) => console.error('[publicEventoExterno] identidade/consentimentos:', err.message));

  notificar({
    modulo: 'eventos-externos', tipo: 'nova_inscricao',
    titulo: `Nova inscrição · ${ev.nome}`,
    mensagem: `${val.nomeCompleto} confirmou presença em "${ev.nome}".`,
    link: `/eventos-externos/${ev.id}`,
  }).catch((err) => console.error('[publicEventoExterno] notificar:', err.message));

  return res.status(201).json({ ok: true, numero_sorte: ins.numero_sorte, tem_sorteio: ev.tem_sorteio });
}








router.post('/:slug/lookup-cpf', async (req, res) => {
  try {
    if (honeypotPreenchido(req.body)) return res.json({ found: false });
    const ev = await eventoEspinhaPorSlug(req.params.slug);
    if (!ev || ev.contrato !== 'minimo') return res.status(404).json({ error: 'Evento não encontrado' });
    const cpf = normalizarCpf(req.body?.cpf);
    if (!cpf) return res.json({ found: false });
    const m = await acharMembroGuardado({ cpf }, { soChaveForte: true });
    if (!m?.membro_id) return res.json({ found: false });
    const { data } = await supabase.from('mem_membros').select('nome, telefone').eq('id', m.membro_id).maybeSingle();
    const primeiro = String(data?.nome || '').trim().split(/\s+/)[0] || null;
    const tel = String(data?.telefone || '').replace(/\D/g, '');
    const telefone_mascarado = tel.length >= 8 ? `(${tel.slice(0, 2)}) *****-${tel.slice(-4)}` : null;
    res.json({ found: true, primeiro_nome: primeiro, telefone_mascarado, tem_telefone: !!tel });
  } catch (e) {
    console.error('[publicEvento lookup-cpf]', e.message);
    res.status(503).json({ error: 'Não foi possível consultar agora.' });
  }
});

router.post('/:slug/inscrever', async (req, res) => {
  try {
    if (honeypotPreenchido(req.body || {})) return res.status(200).json({ ok: true });

    const esp = await eventoEspinhaPorSlug(req.params.slug);
    if (esp) return await inscreverEspinha(req, res, esp);

    const ev = await eventoPorSlug(req.params.slug);
    if (!ev) return res.status(404).json({ error: 'Evento não encontrado' });
    return await inscreverExt(req, res, ev);
  } catch (e) {
    console.error('[publicEvento] inscrever:', e.message);
    res.status(500).json({ error: 'Erro ao confirmar presença.' });
  }
});



router.post('/:slug/upload-imagem', uploadImg.single('arquivo'), async (req, res) => {
  try {
    let pasta = null;
    const esp = await eventoEspinhaPorSlug(req.params.slug);
    if (esp) {
      if (await espinhaEncerrada(esp)) return res.status(403).json({ error: 'As inscrições deste evento estão encerradas.' });
      pasta = `espinha/inscricoes/${esp.id}`;
    } else {
      const ev = await eventoPorSlug(req.params.slug);
      if (!ev) return res.status(404).json({ error: 'Evento não encontrado' });
      if (inscricoesEncerradas(ev)) return res.status(403).json({ error: 'As inscrições deste evento estão encerradas.' });
      pasta = `inscricoes/${ev.id}`;
    }
    if (!req.file) return res.status(400).json({ error: 'Envie uma imagem (PNG, JPG, WEBP ou GIF, até 5MB).' });

    const ext = (req.file.originalname.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    const path = `${pasta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from('evento-capas').upload(path, req.file.buffer, {
      contentType: req.file.mimetype || 'image/png', upsert: false,
    });
    if (error) throw error;
    const { data } = supabase.storage.from('evento-capas').getPublicUrl(path);
    res.json({ url: data.publicUrl });
  } catch (e) {
    console.error('[publicEvento] upload-imagem:', e.message);
    res.status(500).json({ error: 'Erro ao enviar a imagem.' });
  }
});

module.exports = router;

module.exports.inscreverEspinha = inscreverEspinha;
module.exports.eventoEspinhaPorId = eventoEspinhaPorId;
module.exports.ocupacaoEspinha = ocupacaoEspinha;





module.exports.anexarConfigMenor = anexarConfigMenor;
