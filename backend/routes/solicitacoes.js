const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { notificar, resolverDestinatarios } = require('../services/notificar');
const { enviarEmail } = require('../services/email');
const painelCache = require('../services/painelCache');
const mlTracker = require('../services/solicitacoesMlTracker');
const solicFluxo = require('../services/solicFluxo');
const { podeVincular, candidatas } = require('../utils/vinculoMlSolicitacao');
const { rotuloStatusSolicitacao } = require('../utils/solicitacaoStatusLabel');

const CRON_SECRET = process.env.CRON_SECRET;
const { isAuthorizedCron } = require('../utils/cronAuth');
const wpp = require('../services/whatsappService');
const multer = require('multer');
const crypto = require('crypto');



const { assinarAnexosSolicitacoes } = require('../services/anexosSolicitacao');
const { extrairNotaFiscal, sugerirCategoria } = require('../services/nfScanner');
const { lancarDespesaConciliando } = require('../services/finLancamento');
const { aprenderClassificacao } = require('../services/financeiroClassificador');







const {
  COMPRA_DIRETA_LIMITE,
  DESTINO_COMPRA_DIRETA,
  decidirDestinoCotacao,
  motivoDispensaTexto,
} = require('../utils/alcadaCompra');
const { elegivelAlcada, LIMITE_ALCADA_PADRAO } = require('../utils/alcadaCompras');
const uploadNfSolic = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });


const conclusaoPag = require('../utils/conclusaoPagamento');
const finComprovantes = require('../services/finComprovantes');
const { hojeBrtIso } = require('../utils/boletoLinha');

const correcaoSol = require('../utils/correcaoSolicitacao');
const retirarAjusteRegua = require('../utils/retirarAjuste');
const { estaEncerrada, patchPodeMudarStatus } = require('../utils/statusSolicitacao');


const uploadComprovante = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });




async function notificarPedidoWhatsapp(solicitacaoId, statusLabel, detalhe) {
  try {
    const { data: sol } = await supabase.from('solicitacoes').select('titulo, solicitante_id').eq('id', solicitacaoId).maybeSingle();
    if (!sol?.solicitante_id) return;
    const { data: prof } = await supabase.from('profiles').select('name, membro_id').eq('id', sol.solicitante_id).maybeSingle();
    if (!prof?.membro_id) return;
    const primeiroNome = (prof.name || '').trim().split(/\s+/)[0] || 'Olá';
    const link = `${process.env.FRONTEND_URL || 'https://cbrio.org'}/solicitacoes`;
    await wpp.notificarMembro(prof.membro_id, 'pedido_atualizado', [
      primeiroNome, sol.titulo || 'sua solicitação', String(statusLabel || '').replace(/_/g, ' '),
      detalhe ? String(detalhe).slice(0, 200) : 'Sem detalhes adicionais.', link,
    ]);
  } catch (e) { console.error('[SOLICITACOES] wpp pedido:', e.message); }
}



router.post('/cron/atualizar-ml', async (req, res) => {
  if (!isAuthorizedCron(req)) {
    return res.status(401).json({ erro: 'Nao autorizado' });
  }
  try {
    const result = await mlTracker.processarUpdates({ batchSize: 30, throttleMs: 200 });
    res.json(result);
  } catch (e) {
    console.error('[SOLICITACOES cron-ml] erro:', e.message);
    res.status(500).json({ ok: false, erro: e.message });
  }
});

router.use(authenticate);




router.get('/fluxos', async (req, res) => {
  try {
    if (!(await isAdminFallback(req)) && !['admin', 'diretor'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Sem permissão para ver os fluxos.' });
    }
    res.json(await solicFluxo.listCategoriasComFluxo());
  } catch (e) {
    console.error('[SOLICITACOES] listar fluxos:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/fluxos/:categoria', async (req, res) => {
  try {
    if (!(await isAdminFallback(req)) && !['admin', 'diretor'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Sem permissão para ver este fluxo.' });
    }
    const fluxo = await solicFluxo.getFluxoAtivo(req.params.categoria);
    if (!fluxo) return res.status(404).json({ error: 'Nenhum fluxo configurado para esta categoria.' });
    res.json(fluxo);
  } catch (e) {
    console.error('[SOLICITACOES] obter fluxo:', e.message);
    res.status(500).json({ error: e.message });
  }
});



router.get('/fluxos/:categoria/andamento', async (req, res) => {
  try {
    if (!(await isAdminFallback(req)) && !['admin', 'diretor'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Sem permissão.' });
    }
    const fluxo = await solicFluxo.getFluxoAtivo(req.params.categoria);
    if (!fluxo) return res.json({ porStatus: {} });
    const statuses = [...new Set((fluxo.etapas || []).map(e => e.status_map).filter(Boolean))];
    const porStatus = {};
    await Promise.all(statuses.map(async st => {
      const { count } = await supabase
        .from('solicitacoes')
        .select('id', { count: 'exact', head: true })
        .eq('categoria', req.params.categoria).eq('status', st).is('deleted_at', null);
      porStatus[st] = count || 0;
    }));
    res.json({ porStatus });
  } catch (e) {
    console.error('[SOLICITACOES] andamento fluxo:', e.message);
    res.status(500).json({ error: e.message });
  }
});



router.put('/fluxos/etapas/:etapaId/responsaveis', async (req, res) => {
  try {
    if (!(await isAdminFallback(req))) {
      return res.status(403).json({ error: 'Apenas administradores podem editar o fluxo.' });
    }
    const { profile_ids } = req.body || {};
    if (!Array.isArray(profile_ids)) return res.status(400).json({ error: 'profile_ids deve ser array' });

    const { data: etapa, error: eErr } = await supabase
      .from('solic_fluxo_etapas')
      .select('id, area, solic_fluxos(categoria)')
      .eq('id', req.params.etapaId).is('deleted_at', null).maybeSingle();
    if (eErr) throw eErr;
    if (!etapa) return res.status(404).json({ error: 'Etapa não encontrada.' });

    const ids = [...new Set(profile_ids.filter(Boolean))];

    if (ids.length) {
      const { data: ex } = await supabase.from('profiles').select('id').in('id', ids);
      const validos = new Set((ex || []).map(p => p.id));
      const inval = ids.filter(i => !validos.has(i));
      if (inval.length) {
        return res.status(400).json({
          error: 'Uma das pessoas ainda não tem conta no sistema (precisa fazer o primeiro login). Nada foi alterado.',
          invalidos: inval,
        });
      }
    }


    const { error: delErr } = await supabase
      .from('solic_fluxo_etapa_responsaveis').delete().eq('etapa_id', etapa.id);
    if (delErr) throw delErr;
    if (ids.length) {
      const { error: insErr } = await supabase.from('solic_fluxo_etapa_responsaveis')
        .insert(ids.map(pid => ({ etapa_id: etapa.id, profile_id: pid, criado_por: req.user.userId })));
      if (insErr) throw insErr;
    }




    if (etapa.area && ids.length) {
      try {
        const { data: jaResp } = await supabase
          .from('area_solicitacoes_responsaveis').select('profile_id').eq('area', etapa.area);
        const existentes = new Set((jaResp || []).map(r => r.profile_id));
        const novos = ids.filter(i => !existentes.has(i));
        if (novos.length) {
          await supabase.from('area_solicitacoes_responsaveis')
            .insert(novos.map(pid => ({ area: etapa.area, profile_id: pid, criado_por: req.user.userId })));
        }
      } catch (mirrErr) {
        console.warn('[SOLICITACOES] espelho área falhou (best-effort):', mirrErr.message);
      }
    }

    solicFluxo.bustCache(etapa.solic_fluxos?.categoria);
    res.json({ ok: true, etapa_id: etapa.id, count: ids.length });
  } catch (e) {
    console.error('[SOLICITACOES] etapa responsaveis PUT:', e.message);
    res.status(500).json({ error: e.message });
  }
});


const FLUXO_TIPOS = ['inicio', 'etapa', 'aprovacao', 'execucao', 'entrega', 'fim'];
const FLUXO_STATUS_VALIDOS = [
  'aguardando_aprovacao_origem', 'em_cotacao', 'pendente', 'em_analise', 'aprovado',
  'rejeitado', 'concluido', 'aguardando_aprovacao_financeira', 'em_atendimento',
  'aguardando_entrega', 'avaliado', 'aguardando_ajuste', 'cancelado', 'aguardando_merito', 'sobrestada',
];
async function guardFluxoAdmin(req, res) {
  if (!(await isAdminFallback(req))) { res.status(403).json({ error: 'Apenas administradores podem editar o fluxo.' }); return false; }
  return true;
}


router.post('/fluxos/:categoria/etapas', async (req, res) => {
  try {
    if (!(await guardFluxoAdmin(req, res))) return;
    const b = req.body || {};
    if (!b.label || !String(b.label).trim()) return res.status(400).json({ error: 'Informe o nome da etapa.' });
    const tipo = FLUXO_TIPOS.includes(b.tipo) ? b.tipo : 'etapa';
    if (b.status_map && !FLUXO_STATUS_VALIDOS.includes(b.status_map)) return res.status(400).json({ error: 'Status inválido.' });
    const { data: fluxo } = await supabase.from('solic_fluxos')
      .select('id').eq('categoria', req.params.categoria).eq('is_ativa', true).is('deleted_at', null).maybeSingle();
    if (!fluxo) return res.status(404).json({ error: 'Sem fluxo ativo para esta categoria.' });
    const chave = (String(b.chave || b.label).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'etapa') + '_' + Date.now().toString(36).slice(-4);
    const { data: maxOrdem } = await supabase.from('solic_fluxo_etapas')
      .select('ordem').eq('fluxo_id', fluxo.id).is('deleted_at', null).order('ordem', { ascending: false }).limit(1).maybeSingle();
    const { data, error } = await supabase.from('solic_fluxo_etapas').insert({
      fluxo_id: fluxo.id, chave, label: String(b.label).trim(), tipo,
      ordem: (maxOrdem?.ordem ?? -1) + 1,
      area: b.area || null, modulo: b.modulo || null,
      status_map: b.status_map || null, sla_horas: b.sla_horas ?? null,
      descricao: b.descricao || null,
      pos_x: b.pos_x ?? 0, pos_y: b.pos_y ?? 0,
    }).select('*').single();
    if (error) throw error;
    solicFluxo.bustCache(req.params.categoria);
    res.status(201).json(data);
  } catch (e) { console.error('[SOLICITACOES] criar etapa:', e.message); res.status(500).json({ error: e.message }); }
});


router.patch('/fluxos/etapas/:id', async (req, res) => {
  try {
    if (!(await guardFluxoAdmin(req, res))) return;
    const b = req.body || {};
    if (b.tipo != null && !FLUXO_TIPOS.includes(b.tipo)) return res.status(400).json({ error: 'Tipo inválido.' });
    if (b.status_map && !FLUXO_STATUS_VALIDOS.includes(b.status_map)) return res.status(400).json({ error: 'Status inválido.' });
    const patch = { atualizado_em: new Date().toISOString() };
    for (const k of ['label', 'tipo', 'area', 'modulo', 'status_map', 'sla_horas', 'descricao', 'pos_x', 'pos_y']) {
      if (b[k] !== undefined) patch[k] = b[k] === '' ? null : b[k];
    }
    const { data, error } = await supabase.from('solic_fluxo_etapas')
      .update(patch).eq('id', req.params.id).is('deleted_at', null)
      .select('*, solic_fluxos(categoria)').single();
    if (error) throw error;
    solicFluxo.bustCache(data?.solic_fluxos?.categoria);
    res.json(data);
  } catch (e) { console.error('[SOLICITACOES] editar etapa:', e.message); res.status(500).json({ error: e.message }); }
});


router.delete('/fluxos/etapas/:id', async (req, res) => {
  try {
    if (!(await guardFluxoAdmin(req, res))) return;
    const now = new Date().toISOString();
    const { data: etapa } = await supabase.from('solic_fluxo_etapas')
      .select('id, solic_fluxos(categoria)').eq('id', req.params.id).maybeSingle();
    await supabase.from('solic_fluxo_etapas').update({ deleted_at: now }).eq('id', req.params.id);
    await supabase.from('solic_fluxo_transicoes').update({ deleted_at: now })
      .or(`de_etapa_id.eq.${req.params.id},para_etapa_id.eq.${req.params.id}`);
    solicFluxo.bustCache(etapa?.solic_fluxos?.categoria);
    res.json({ ok: true });
  } catch (e) { console.error('[SOLICITACOES] remover etapa:', e.message); res.status(500).json({ error: e.message }); }
});


router.post('/fluxos/transicoes', async (req, res) => {
  try {
    if (!(await guardFluxoAdmin(req, res))) return;
    const { de_etapa_id, para_etapa_id, verbo, label, condicao_tipo, condicao_valor } = req.body || {};
    if (!de_etapa_id || !para_etapa_id) return res.status(400).json({ error: 'Origem e destino são obrigatórios.' });
    if (de_etapa_id === para_etapa_id) return res.status(400).json({ error: 'Uma etapa não liga nela mesma.' });
    const { data: de } = await supabase.from('solic_fluxo_etapas')
      .select('fluxo_id, solic_fluxos(categoria)').eq('id', de_etapa_id).is('deleted_at', null).maybeSingle();
    const { data: para } = await supabase.from('solic_fluxo_etapas').select('fluxo_id').eq('id', para_etapa_id).is('deleted_at', null).maybeSingle();
    if (!de || !para) return res.status(404).json({ error: 'Etapa não encontrada.' });
    if (de.fluxo_id !== para.fluxo_id) return res.status(400).json({ error: 'As etapas são de fluxos diferentes.' });
    const { data, error } = await supabase.from('solic_fluxo_transicoes').insert({
      fluxo_id: de.fluxo_id, de_etapa_id, para_etapa_id,
      verbo: verbo || null, label: label || null,
      condicao_tipo: condicao_tipo || null, condicao_valor: condicao_valor || null,
    }).select('*').single();
    if (error) throw error;
    solicFluxo.bustCache(de.solic_fluxos?.categoria);
    res.status(201).json(data);
  } catch (e) { console.error('[SOLICITACOES] criar transicao:', e.message); res.status(500).json({ error: e.message }); }
});


router.delete('/fluxos/transicoes/:id', async (req, res) => {
  try {
    if (!(await guardFluxoAdmin(req, res))) return;
    const { data: t } = await supabase.from('solic_fluxo_transicoes')
      .select('fluxo_id, solic_fluxos(categoria)').eq('id', req.params.id).maybeSingle();
    await supabase.from('solic_fluxo_transicoes').update({ deleted_at: new Date().toISOString() }).eq('id', req.params.id);
    solicFluxo.bustCache(t?.solic_fluxos?.categoria);
    res.json({ ok: true });
  } catch (e) { console.error('[SOLICITACOES] remover transicao:', e.message); res.status(500).json({ error: e.message }); }
});




router.get('/aux/classificacao', async (req, res) => {
  try {
    let centrosQ = supabase.from('fin_centros_custo').select('id, codigo, nome, area_slug')
      .eq('ativo', true).eq('aceita_lancamento', true).order('codigo');
    if (req.query.area) centrosQ = centrosQ.eq('area_slug', String(req.query.area));
    const [planos, centros, contas] = await Promise.all([
      supabase.from('fin_plano_contas').select('id, codigo, nome')
        .eq('tipo', 'despesa').eq('ativo', true).eq('aceita_lancamento', true).order('codigo'),
      centrosQ,
      supabase.from('fin_contas').select('id, nome, banco').eq('ativa', true).order('nome'),
    ]);
    if (planos.error) throw planos.error;
    res.json({ planos: planos.data || [], centros: centros.data || [], contas: contas.data || [] });
  } catch (e) { console.error('[SOLICITACOES] aux classificacao:', e.message); res.status(500).json({ error: e.message }); }
});




router.post('/:id/lancar-financeiro', async (req, res) => {
  try {
    const { conta_id, plano_contas_id, centro_custo_id, data_pagamento, observacoes } = req.body || {};
    const { data: sol } = await supabase.from('solicitacoes')
      .select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!sol) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    if (!(await podeGerirSolicitacao(req, sol))) return res.status(403).json({ error: 'Você não pode lançar esta compra.' });
    if (!['compras', 'servico'].includes(sol.categoria)) return res.status(400).json({ error: 'Só compra/serviço gera lançamento.' });
    if (!sol.aprovado_financeiro_em) return res.status(400).json({ error: 'A compra ainda não foi aprovada no financeiro.' });
    if (sol.fin_transacao_id) return res.status(409).json({ error: 'Esta compra já foi lançada no financeiro.' });

    const finalPlano = plano_contas_id || sol.plano_contas_id;
    if (!finalPlano) return res.status(400).json({ error: 'Informe o plano de contas antes de lançar.' });
    const { data: plano } = await supabase.from('fin_plano_contas')
      .select('tipo, aceita_lancamento, ativo').eq('id', finalPlano).maybeSingle();
    if (!plano || plano.tipo !== 'despesa' || !plano.aceita_lancamento || plano.ativo === false) {
      return res.status(400).json({ error: 'Plano de contas inválido (conta de despesa que aceita lançamento).' });
    }
    const finalCentro = centro_custo_id !== undefined ? (centro_custo_id || null) : sol.centro_custo_id;
    const valor = Number(sol.valor_cotado ?? sol.valor_estimado) || 0;
    if (!valor) return res.status(400).json({ error: 'Compra sem valor cotado.' });

    const ex = sol.nota_fiscal_extracao || {};
    const dataBase = ex.data_emissao || new Date().toISOString().slice(0, 10);

    const r = await lancarDespesaConciliando({
      descricao: sol.titulo || `Compra ${String(sol.id).slice(0, 8)}`,
      valor, dataBase, dataPagamento: data_pagamento,
      referencia: ex.numero ? `NF ${ex.numero}` : `Solicitação ${String(sol.id).slice(0, 8)}`,
      observacoes,
      plano_contas_id: finalPlano, centro_custo_id: finalCentro, conta_id,
      classificacao_origem: 'manual', classificacao_confianca: 1.0,
      createdBy: req.user.userId,
      extras: { solicitacao_id: sol.id },
    });
    if (r.erro) return res.status(400).json({ error: r.erro, precisaConta: !!r.precisaConta });


    const { data: upd } = await supabase.from('solicitacoes')
      .update({
        fin_transacao_id: r.transacao.id,
        fin_vinculo_status: r.conciliada ? 'conciliado' : 'lancado',
        plano_contas_id: finalPlano, centro_custo_id: finalCentro,
      })
      .eq('id', sol.id).is('fin_transacao_id', null).select('id').maybeSingle();
    if (!upd) {
      await supabase.from('fin_transacoes').update({ status: 'cancelado' }).eq('id', r.transacao.id);
      return res.status(409).json({ error: 'Esta compra já foi lançada por outra pessoa.' });
    }

    if (ex.emitente_cnpj) {
      aprenderClassificacao({ documento: ex.emitente_cnpj, nome: ex.emitente_nome, plano_contas_id: finalPlano, centro_custo_id: finalCentro })
        .catch(e => console.error('[SOLICITACOES] aprender lançar:', e.message));
    }
    notificar({
      modulo: 'financeiro', tipo: 'solicitacao_status',
      titulo: `Compra lançada no financeiro: ${sol.titulo}`,
      mensagem: `${r.conciliada ? 'Conciliada com o extrato' : 'Lançada como pendente'} · ${valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`,
      link: '/solicitacoes', severidade: 'info', chaveDedup: `solic_lancada_${sol.id}`,
      extraTargetIds: [sol.solicitante_id].filter(Boolean),
    }).catch(() => {});

    res.json({ transacao: r.transacao, conciliada: r.conciliada });
  } catch (e) {
    console.error('[SOLICITACOES] lancar-financeiro:', e.message);
    res.status(500).json({ error: e.message });
  }
});




router.post('/:id/nota-fiscal/escanear', uploadNfSolic.single('arquivo'), async (req, res) => {
  try {
    const { data: sol } = await supabase.from('solicitacoes')
      .select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!sol) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    if (!(await podeCotar(req, sol))) return res.status(403).json({ error: 'Apenas a logística (ou admin) pode anexar a nota.' });
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });

    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }[req.file.mimetype] || 'bin';
    const path = `notas-fiscais/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
    const { error: upErr } = await supabase.storage.from('solicitacoes')
      .upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
    if (upErr) return res.status(500).json({ error: `Erro ao salvar o arquivo: ${upErr.message}` });
    const url = supabase.storage.from('solicitacoes').getPublicUrl(path).data.publicUrl;

    let extraido = null, raw = null;
    try { ({ extraido, raw } = await extrairNotaFiscal(req.file.buffer, req.file.mimetype)); }
    catch (e) { console.error('[SOLICITACOES] NF extração:', e.message); }

    let sugestao = null;
    if (extraido?.valor_total) {
      sugestao = await sugerirCategoria({
        cnpj: extraido.emitente_cnpj, nome: extraido.emitente_nome,
        valor: extraido.valor_total, descricao: extraido.descricao_resumo,
      }).catch(() => null);
    }



    await supabase.from('solicitacoes')
      .update({ nota_fiscal_url: url, nota_fiscal_extracao: extraido || null })
      .eq('id', sol.id);

    res.json({ url, extracao_ok: !!extraido, extracao: extraido, sugestao });
  } catch (e) {
    console.error('[SOLICITACOES] escanear NF:', e.message);
    res.status(500).json({ error: 'Erro ao escanear a nota fiscal.' });
  }
});


router.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) painelCache.bust('');
    });
  }
  next();
});

const ALLOWED_CATEGORIES = ['ti', 'compras', 'reembolso', 'reserva_espaco', 'espaco', 'infraestrutura', 'hospitalidade', 'ferias', 'licenca', 'marketing', 'pagamento', 'servico', 'producao', 'outro'];





const STATUS_PATCH_PERMITIDOS = ['pendente', 'em_analise', 'aprovado', 'rejeitado', 'concluido', 'em_atendimento', 'aguardando_entrega', 'em_cotacao', 'cancelado'];


const CATEGORIA_MODULO = {
  ti: 'ti',
  compras: 'logistica',
  servico: 'logistica',
  reembolso: 'financeiro',
  pagamento: 'financeiro',
  reserva_espaco: 'administrativo',
  espaco: 'administrativo',
  infraestrutura: 'administrativo',
  hospitalidade: 'administrativo',
  ferias: 'rh',
  licenca: 'rh',
  marketing: 'marketing',
  producao: 'producao',
  outro: 'administrativo',
};


const CATEGORIA_TO_AREA_RESP = {
  ti:              { area: 'ti',                subcategoria: 'default' },
  compras:         { area: 'logistica_compras', subcategoria: 'default' },
  servico:         { area: 'logistica_compras', subcategoria: 'servico' },
  reembolso:       { area: 'financeiro',        subcategoria: 'reembolso' },
  pagamento:       { area: 'financeiro',        subcategoria: 'pagamento' },
  reserva_espaco:  { area: 'reserva_espaco',    subcategoria: 'default' },
  espaco:          { area: 'reserva_espaco',    subcategoria: 'default' },
  infraestrutura:  { area: 'manutencao',        subcategoria: 'default' },
  hospitalidade:   { area: 'hospitalidade',     subcategoria: 'default' },
  ferias:          { area: 'rh',                subcategoria: 'ferias' },
  licenca:         { area: 'rh',                subcategoria: 'licenca' },
  marketing:       { area: 'marketing',         subcategoria: 'default' },
  producao:        { area: 'producao',          subcategoria: 'default' },
  outro:           { area: null,                subcategoria: 'default' },
};




function linkFilaFinanceira(solicitacaoId) {
  return `/admin/financeiro?aba=solicitacoes&solicitacao=${encodeURIComponent(solicitacaoId)}`;
}







const CRIATIVO_CATEGORIAS = ['marketing', 'producao'];







const CATEGORIA_ORIGEM_APROVADOR = {
  hospitalidade: (process.env.CBRIO_PRIVATE_4F5D55E01D38 || '00000000-0000-0000-0000-000000000000'),
};


const MODULO_CATEGORIAS = {
  ti: ['ti'],
  logistica: ['compras', 'servico'],
  financeiro: ['reembolso', 'pagamento'],
  administrativo: ['espaco', 'reserva_espaco', 'infraestrutura', 'hospitalidade', 'outro'],
  rh: ['ferias', 'licenca'],
  marketing: ['marketing'],
  producao: ['producao'],
};


const PERM_TO_MODULO = {
  'DP': 'rh',
  'Pessoas': 'rh',
  'Financeiro': 'financeiro',
  'Logística': 'logistica',
  'Patrimônio': 'administrativo',
  'Membresia': 'administrativo',
  'TI': 'ti',
  'Marketing': 'marketing',
};






function _setorPorArea(raw) {
  const v = String(raw || '').normalize('NFD')
    .split('').filter(c => { const x = c.charCodeAt(0); return x < 0x0300 || x > 0x036f; }).join('')
    .toLowerCase().trim();
  if (!v) return null;
  if (['gestao', 'administrativo', 'adm', 'financeiro', 'rh', 'recursos humanos', 'logistica', 'logistica_compras', 'logistica_estoque', 'compras', 'manutencao', 'patrimonio', 'ti', 'tecnologia', 'operacoes', 'operacional', 'estrategia', 'governanca', 'juridico', 'secretaria', 'reserva_espaco'].includes(v)) return 'Gestao';
  if (['criativo', 'criativa', 'marketing', 'producao', 'comunicacao', 'design', 'audiovisual', 'midia', 'adoracao', 'louvor'].includes(v)) return 'Criativo';
  if (['ministerial', 'ministerio', 'pastoral', 'voluntariado', 'voluntariada', 'cuidados', 'grupos', 'integracao', 'next', 'membresia', 'discipulado', 'kids', 'ami', 'bridge', 'online', 'sede', 'cba', 'geracional', 'jornada'].includes(v)) return 'Ministerial';
  return null;
}


const CARGO_SETOR = {
  'diretor-criativo': 'Criativo', 'coordenador-marketing': 'Criativo', 'assistente-marketing': 'Criativo',
  'lider-producao': 'Criativo', 'assistente-producao': 'Criativo',
  'diretor-administrativo': 'Gestao', 'coordenador-estrategia': 'Gestao', 'coordenador-financeiro': 'Gestao',
  'assistente-financeiro': 'Gestao', 'lider-operacoes': 'Gestao', 'lider-logistica': 'Gestao',
  'assistente-logistica': 'Gestao', 'assistente-operacoes': 'Gestao', 'diretor-rh': 'Gestao',
  'diretor-ministerial': 'Ministerial', 'lider-ministerial': 'Ministerial', 'assistente-ministerial': 'Ministerial',
  'coordenador-kids': 'Ministerial', 'assistente-kids': 'Ministerial', 'coordenador-ami': 'Ministerial',
  'coordenador-bridge': 'Ministerial', 'coordenador-online': 'Ministerial', 'supervisor-jornada': 'Ministerial',
  'coordenador-voluntarios': 'Ministerial',
};






function resolverSetorHint(user) {
  const setorArea = _setorPorArea(user.area);
  if (setorArea) return setorArea;
  const cs = user.granular?.cargoSlug;
  if (cs && CARGO_SETOR[cs]) return CARGO_SETOR[cs];
  const cands = [
    ...(Array.isArray(user.granular?.areas) ? user.granular.areas : []),
    ...(Array.isArray(user.kpi_areas) ? user.kpi_areas : []),
  ];
  for (const c of cands) { const s = _setorPorArea(c); if (s) return s; }
  return null;
}






async function setoresQueCoaprova(userId) {
  if (!userId) return [];
  try {
    const { data, error } = await supabase
      .from('setor_coaprovadores')
      .select('setor')
      .eq('profile_id', userId);
    if (error) return [];
    return [...new Set((data || []).map(r => r.setor).filter(Boolean))];
  } catch { return []; }
}



async function diretorIdsQuePodeAprovar(userId) {
  const ids = new Set([userId]);
  const setores = await setoresQueCoaprova(userId);
  if (setores.length) {
    try {
      const { data } = await supabase
        .from('setor_diretor')
        .select('diretor_id')
        .in('setor', setores);
      (data || []).forEach(d => d.diretor_id && ids.add(d.diretor_id));
    } catch {                   }
  }
  return [...ids];
}



async function podeAprovarOrigem(userId, sol) {
  if (!sol?.aprovacao_origem_diretor_id) return false;
  if (sol.aprovacao_origem_diretor_id === userId) return true;
  const setores = await setoresQueCoaprova(userId);
  if (!setores.length) return false;
  try {
    const { data } = await supabase
      .from('setor_diretor')
      .select('setor')
      .eq('diretor_id', sol.aprovacao_origem_diretor_id)
      .in('setor', setores)
      .maybeSingle();
    return !!data;
  } catch { return false; }
}


async function coaprovadorIdsParaDiretor(diretorId) {
  if (!diretorId) return [];
  try {
    const { data: sd } = await supabase
      .from('setor_diretor')
      .select('setor')
      .eq('diretor_id', diretorId)
      .maybeSingle();
    if (!sd?.setor) return [];
    const { data: co } = await supabase
      .from('setor_coaprovadores')
      .select('profile_id')
      .eq('setor', sd.setor);
    return (co || []).map(c => c.profile_id).filter(Boolean);
  } catch { return []; }
}






const SETOR_GESTAO = 'Gestao';








const COMPRA_COTACAO_DIRETA_LIMITE = COMPRA_DIRETA_LIMITE;
const COMPRA_COTACAO_DIRETA_MOTIVO = 'Compra de até R$ 1.000 · direto para cotação';




async function overrideGestaoPorCategoria(categoria) {
  if (!categoria) return null;
  try {
    const { data, error } = await supabase
      .from('solicitacoes_categoria_aprovadores')
      .select('profile_id, nome')
      .eq('categoria', categoria);
    if (error || !data || !data.length) return null;
    return {
      ids: [...new Set(data.map(r => r.profile_id).filter(Boolean))],
      nomes: [...new Set(data.map(r => r.nome).filter(Boolean))],
    };
  } catch { return null; }
}


async function mapaGestaoOverride() {
  const map = {};
  try {
    const { data } = await supabase
      .from('solicitacoes_categoria_aprovadores')
      .select('categoria, profile_id, nome');
    for (const r of data || []) {
      if (!r.categoria || !r.profile_id) continue;
      const m = (map[r.categoria] = map[r.categoria] || { ids: [], nomes: [] });
      if (!m.ids.includes(r.profile_id)) m.ids.push(r.profile_id);
      if (r.nome && !m.nomes.includes(r.nome)) m.nomes.push(r.nome);
    }
  } catch {                   }
  return map;
}





async function aprovadoresGestaoIds(categoria) {
  const ov = await overrideGestaoPorCategoria(categoria);
  if (ov && ov.ids.length) return ov.ids;
  const ids = new Set();
  try {
    const { data } = await supabase
      .from('setor_diretor').select('diretor_id').eq('setor', SETOR_GESTAO);
    (data || []).forEach(r => r.diretor_id && ids.add(r.diretor_id));
  } catch {                   }
  try {
    const { data } = await supabase
      .from('setor_coaprovadores').select('profile_id').eq('setor', SETOR_GESTAO);
    (data || []).forEach(r => r.profile_id && ids.add(r.profile_id));
  } catch {                   }
  return [...ids];
}



async function aprovadoresGestaoNomes(categoria) {
  const ov = await overrideGestaoPorCategoria(categoria);
  if (ov && ov.nomes.length) return ov.nomes;
  const nomes = [];
  try {
    const { data } = await supabase
      .from('setor_diretor').select('diretor_nome').eq('setor', SETOR_GESTAO);
    (data || []).forEach(r => r.diretor_nome && nomes.push(r.diretor_nome));
  } catch {                   }
  try {
    const { data } = await supabase
      .from('setor_coaprovadores').select('nome').eq('setor', SETOR_GESTAO);
    (data || []).forEach(r => r.nome && nomes.push(r.nome));
  } catch {                   }
  return [...new Set(nomes)];
}



async function aprovadoresMeritoIds() {
  try {
    const { data, error } = await supabase
      .from('solicitacoes_merito_aprovadores')
      .select('profile_id');
    if (error) return [];
    return (data || []).map(r => r.profile_id).filter(Boolean);
  } catch { return []; }
}






function proximoStatusPosAprovacao(sol) {
  if (['compras', 'servico'].includes(sol.categoria)) return 'em_cotacao';


  if (CRIATIVO_CATEGORIAS.includes(sol.categoria) && sol.precisa_aprovacao_financeira && !sol.aprovado_financeiro_em) return 'em_cotacao';
  if (sol.precisa_aprovacao_financeira && !sol.aprovado_financeiro_em) return 'aguardando_aprovacao_financeira';
  return 'pendente';
}



function precisaMerito(sol) {






  if (sol.categoria !== 'compras') return false;
  if (sol.merito_status != null) return false;
  const valor = Number(sol.valor_estimado) || 0;
  return sol.eh_planejado === true ? valor > 5000 : valor > 1000;
}




async function registrarEvento(solicitacaoId, { statusAnterior, statusNovo, atorId, observacao }) {
  try {
    const { error } = await supabase.from('solicitacoes_eventos').insert({
      solicitacao_id: solicitacaoId,
      status_anterior: statusAnterior ?? null,
      status_novo: statusNovo,
      ator_id: atorId || null,
      observacao: observacao || null,
    });
    if (error) console.error('[SOLICITACOES] evento timeline:', error.message);
  } catch (e) { console.error('[SOLICITACOES] evento timeline:', e.message); }
}



async function notificarMeritoPendente(sol) {
  try {
    const alvos = await aprovadoresMeritoIds();
    if (!alvos.length) return;
    await notificar({
      modulo: 'administrativo',
      tipo: 'solicitacao_merito',
      titulo: `Julgamento de mérito: ${sol.titulo}`,
      mensagem: 'A solicitação passou pelas aprovações e tem custo · aguarda seu julgamento de mérito.',
      link: '/solicitacoes?aba=aprovar',
      severidade: 'info',
      chaveDedup: `solicitacao_merito_${sol.id}`,
      targetIds: alvos,
      email: true,
    });
  } catch (e) { console.error('[SOLICITACOES] notify merito:', e.message); }
}



async function podeGerirSolicitacao(req, sol) {
  if (['admin', 'diretor'].includes(req.user.role)) return true;
  if (sol.responsavel_id === req.user.userId) return true;
  if (sol.area_responsavel) {
    const { data: rr } = await supabase
      .from('area_solicitacoes_responsaveis')
      .select('profile_id')
      .eq('area', sol.area_responsavel)
      .eq('profile_id', req.user.userId)
      .maybeSingle();
    return !!rr;
  }
  return false;
}


router.get('/', async (req, res) => {
  try {
    const userId = req.user.userId;
    const role = req.user.role;
    const granular = req.user.granular;

    const { categoria, status, mine, aba, periodo } = req.query;

    let data;
    let papeisPorId = null;

    if (aba === 'aprovar') {







      const isSuper = await isAdminFallback(req);
      const aprovarIds = await diretorIdsQuePodeAprovar(userId);

      const overrideMap = await mapaGestaoOverride();
      const defaultGestaoIds = await aprovadoresGestaoIds();
      const aprovaGestaoDe = (cat) => (overrideMap[cat]?.ids?.length ? overrideMap[cat].ids : defaultGestaoIds).includes(userId);
      const ehAlgumGestao = defaultGestaoIds.includes(userId) || Object.values(overrideMap).some(o => (o.ids || []).includes(userId));
      const meritoIds = await aprovadoresMeritoIds();
      const ehMerito = meritoIds.includes(userId);

      const mkBase = () => {
        let b = supabase
          .from('solicitacoes')
          .select('*, solicitacao_itens(id, descricao, quantidade, unidade, valor_estimado, link_referencia, imagem_url, ordem)')
          .is('deleted_at', null)
          .order('created_at', { ascending: false });
        if (categoria) b = b.eq('categoria', categoria);
        if (status) b = b.eq('status', status);
        return b;
      };
      const queries = [];
      if (isSuper) {
        queries.push(mkBase().in('aprovacao_origem_status', ['pendente', 'triagem']));
      } else if (aprovarIds.length) {
        queries.push(mkBase().in('aprovacao_origem_diretor_id', aprovarIds).eq('aprovacao_origem_status', 'pendente'));
      }



      if (isSuper || ehAlgumGestao) queries.push(mkBase().eq('aprovacao_gestao_status', 'pendente').in('aprovacao_origem_status', ['aprovada', 'dispensada']));
      if (isSuper || ehMerito) queries.push(mkBase().eq('status', 'aguardando_merito'));

      const results = await Promise.all(queries);
      const comErro = results.find(r => r.error);
      if (comErro) throw comErro.error;

      const vistos = new Set();
      data = [];
      for (const r of results) {
        for (const row of (r.data || [])) {
          if (vistos.has(row.id)) continue;
          vistos.add(row.id);
          data.push(row);
        }
      }
      data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());







      papeisPorId = {};
      for (const d of data) {
        const papeis = [];
        if (d.aprovacao_origem_status === 'pendente' && aprovarIds.includes(d.aprovacao_origem_diretor_id)) papeis.push('origem');


        if (isSuper && d.aprovacao_origem_status === 'triagem') papeis.push('origem');
        if (d.aprovacao_gestao_status === 'pendente' && ['aprovada', 'dispensada'].includes(d.aprovacao_origem_status) && aprovaGestaoDe(d.categoria)) papeis.push('gestao');
        if (d.status === 'aguardando_merito' && ehMerito) papeis.push('merito');
        papeisPorId[d.id] = papeis;
      }

      data = data.filter(d => (papeisPorId[d.id] || []).length);
    } else {
      let q = supabase
        .from('solicitacoes')
        .select('*, solicitacao_itens(id, descricao, quantidade, unidade, valor_estimado, link_referencia, imagem_url, ordem)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (categoria) q = q.eq('categoria', categoria);
      if (status) q = q.eq('status', status);






      const dias = periodo === 'tudo' ? 0 : (parseInt(periodo, 10) || 365);
      if (dias > 0) q = q.gte('updated_at', new Date(Date.now() - dias * 86400000).toISOString());

      if (mine === 'true') {



        let areasView = [...new Set([
          ...((granular?.areas) || []).map(a => String(a).toLowerCase()),
          ...((req.user.kpi_areas) || []).map(a => String(a).toLowerCase()),
        ])].filter(a => /^[a-z0-9_]+$/.test(a));





        areasView = areasView.filter(a => a !== 'financeiro');
        if (areasView.length) {
          q = q.or(`solicitante_id.eq.${userId},and(compartilhar_area.eq.true,area_cliente.in.(${areasView.join(',')}))`);
        } else {
          q = q.eq('solicitante_id', userId);
        }
      } else if (['admin', 'diretor'].includes(role)) {

      } else {




        const { data: respRows } = await supabase
          .from('area_solicitacoes_responsaveis')
          .select('area')
          .eq('profile_id', userId);
        const responsavelAreas = new Set((respRows || []).map(r => r.area));



        const escopoFinanceiro = await obterCategoriasFinanceirasAutorizadas(userId);
        if (escopoFinanceiro.disponivel && escopoFinanceiro.categorias.size > 0) {
          responsavelAreas.delete('financeiro');
        }




        const orParts = [
          `solicitante_id.eq.${encodeURIComponent(userId)}`,
          `responsavel_id.eq.${encodeURIComponent(userId)}`,
        ];
        if (responsavelAreas.size > 0) {
          orParts.push(`area_responsavel.in.(${[...responsavelAreas].join(',')})`);
        }






        const perms = granular?.modulePerms || {};
        const ehDiretorCargo = /^diretor/.test(String(granular?.cargoSlug || ''));
        const minhasAreas = [...new Set([
          ...((granular?.areas) || []).map(a => String(a).toLowerCase()),
          ...((req.user.kpi_areas) || []).map(a => String(a).toLowerCase()),
        ])].filter(a => /^[a-z0-9_]+$/.test(a));
        const areasLideradas = minhasAreas.filter(a =>
          ehDiretorCargo || (perms[a] && (perms[a].leitura >= 4 || perms[a].escrita >= 4)));
        if (areasLideradas.length) {
          orParts.push(`area_cliente.in.(${areasLideradas.join(',')})`);
        }
        q = q.or(orParts.join(','));
      }




      const limitParam = Math.min(parseInt(req.query.limit, 10) || 0, 1000);
      const offsetParam = Math.max(parseInt(req.query.offset, 10) || 0, 0);
      if (limitParam > 0) q = q.range(offsetParam, offsetParam + limitParam - 1);

      const { data: rows, error } = await q;
      if (error) throw error;
      data = rows;
    }


    const profileIds = [...new Set((data || []).flatMap(d => [
      d.solicitante_id, d.responsavel_id, d.aprovacao_origem_diretor_id,
    ].filter(Boolean)))];
    let profileMap = {};
    if (profileIds.length) {
      const { data: profiles } = await supabase.from('profiles').select('id,name,email').in('id', profileIds);
      if (profiles) profileMap = Object.fromEntries(profiles.map(p => [p.id, p]));
    }


    const tipoIds    = [...new Set((data || []).map(d => d.marketing_tipo_id).filter(Boolean))];
    const destinoIds = [...new Set((data || []).map(d => d.marketing_destino_id).filter(Boolean))];
    let tipoMap = {}, destinoMap = {};
    if (tipoIds.length) {
      const { data: t } = await supabase.from('marketing_etiquetas_tipo').select('id, slug, nome, cor, habilidade_padrao, esforco_max_h').in('id', tipoIds);
      tipoMap = Object.fromEntries((t || []).map(x => [x.id, x]));
    }
    if (destinoIds.length) {
      const { data: d } = await supabase.from('marketing_etiquetas_destino').select('id, slug, nome, cor').in('id', destinoIds);
      destinoMap = Object.fromEntries((d || []).map(x => [x.id, x]));
    }


    const solicMktIds = (data || [])
      .filter(d => d.area_responsavel === 'marketing')
      .map(d => d.id);
    let cardMap = {};
    let campanhaMap = {};
    if (solicMktIds.length) {
      const { data: cards } = await supabase
        .from('marketing_kanban_cards')
        .select('id, solicitacao_id, estado, tem_revisao, prazo_confirmado, prazo_preliminar, atribuido_a, entregue_em')
        .in('solicitacao_id', solicMktIds)
        .is('deleted_at', null);
      cardMap = Object.fromEntries((cards || []).map(c => [c.solicitacao_id, c]));



      const { data: camps } = await supabase
        .from('marketing_campanhas')
        .select('id, solicitacao_id, status, titulo, prazo_entrega')
        .in('solicitacao_id', solicMktIds)
        .is('deleted_at', null);
      const campIds = (camps || []).map(c => c.id);
      const entregMap = {};
      if (campIds.length) {
        const { data: ents } = await supabase
          .from('marketing_kanban_cards')
          .select('id, campanha_id, titulo, estado, atribuido_a, data_fim, tem_revisao')
          .in('campanha_id', campIds)
          .is('deleted_at', null);
        const membroIds = [...new Set((ents || []).map(e => e.atribuido_a).filter(Boolean))];
        let donoMap = {};
        if (membroIds.length) {
          const { data: ms } = await supabase.from('marketing_membros').select('id, profile_id, nome_display').in('id', membroIds);
          const pids = [...new Set((ms || []).map(m => m.profile_id).filter(Boolean))];
          let pmap = {};
          if (pids.length) {
            const { data: ps } = await supabase.from('profiles').select('id, name').in('id', pids);
            pmap = Object.fromEntries((ps || []).map(p => [p.id, p.name]));
          }
          donoMap = Object.fromEntries((ms || []).map(m => [m.id, pmap[m.profile_id] || m.nome_display || null]));
        }







        const arquivoMap = {};
        const cardIds = (ents || []).map(e => e.id);
        if (cardIds.length) {
          for (let i = 0; i < cardIds.length; i += 200) {
            const { data: arqs, error: eArq } = await supabase
              .from('marketing_entregaveis')
              .select('id, card_id, nome_arquivo, tipo_mime, tamanho_bytes, enviado_em, tipo')
              .in('card_id', cardIds.slice(i, i + 200))
              .eq('tipo', 'entregavel')
              .is('deleted_at', null)
              .order('enviado_em', { ascending: false });


            if (eArq) { console.error('[SOLICITACOES] entregaveis (não-bloqueante):', eArq.message); break; }
            for (const a of arqs || []) {
              if (!arquivoMap[a.card_id]) arquivoMap[a.card_id] = [];
              arquivoMap[a.card_id].push(a);
            }
          }
        }
        for (const e of (ents || [])) {
          if (!entregMap[e.campanha_id]) entregMap[e.campanha_id] = [];
          entregMap[e.campanha_id].push({
            id: e.id, titulo: e.titulo, estado: e.estado,
            dono_nome: donoMap[e.atribuido_a] || null, data_fim: e.data_fim,
            tem_revisao: e.tem_revisao,
            arquivos: arquivoMap[e.id] || [],
          });
        }
      }
      campanhaMap = Object.fromEntries((camps || []).map(c => [c.solicitacao_id, { ...c, entregaveis: entregMap[c.id] || [] }]));
    }



    const diretorIdsPg = [...new Set((data || []).map(d => d.aprovacao_origem_diretor_id).filter(Boolean))];
    let setorPorDiretor = {};
    let coapsPorSetor = {};
    if (diretorIdsPg.length) {
      try {
        const { data: sd } = await supabase.from('setor_diretor').select('setor, diretor_id').in('diretor_id', diretorIdsPg);
        setorPorDiretor = Object.fromEntries((sd || []).map(r => [r.diretor_id, r.setor]));
        const setores = [...new Set(Object.values(setorPorDiretor))];
        if (setores.length) {
          const { data: co } = await supabase.from('setor_coaprovadores').select('setor, nome, profile_id').in('setor', setores);
          for (const c of (co || [])) {
            (coapsPorSetor[c.setor] = coapsPorSetor[c.setor] || []).push(c);
          }
        }
      } catch {                                                                  }
    }
    const nomesAprovadores = (d) => {
      const principal = profileMap[d.aprovacao_origem_diretor_id]?.name;
      if (!principal) return [];
      const setor = setorPorDiretor[d.aprovacao_origem_diretor_id];
      const coaps = (coapsPorSetor[setor] || [])
        .map(c => c.nome || profileMap[c.profile_id]?.name)
        .filter(n => n && n !== principal);
      return [principal, ...[...new Set(coaps)]];
    };



    const gestaoNomesPorCat = {};
    for (const cat of [...new Set((data || []).filter(d => d.aprovacao_gestao_status).map(d => d.categoria))]) {
      gestaoNomesPorCat[cat] = await aprovadoresGestaoNomes(cat);
    }



    const pendenteDe = (d) => {
      if (['pendente', 'triagem'].includes(d.aprovacao_origem_status)) return nomesAprovadores(d);
      if (d.aprovacao_gestao_status === 'pendente') return gestaoNomesPorCat[d.categoria] || [];
      return [];
    };






    let alcadaFlag = () => false;
    try {
      const [{ data: minhasAreas }, { data: limites }] = await Promise.all([
        supabase.from('area_solicitacoes_responsaveis').select('area').eq('profile_id', req.user.userId),
        supabase.from('area_alcadas').select('area_cliente, limite_aprovacao'),
      ]);
      const areas = new Set((minhasAreas || []).map(r => r.area));
      const limitePorArea = Object.fromEntries(
        (limites || []).map(l => [l.area_cliente, Number(l.limite_aprovacao)]).filter(([, v]) => Number.isFinite(v))
      );
      if (areas.size) {
        alcadaFlag = (d) => areas.has(d.area_responsavel)
          && elegivelAlcada(d, limitePorArea[d.area_cliente] ?? LIMITE_ALCADA_PADRAO).ok;
      }
    } catch (e) {
      console.warn('[SOLICITACOES] flag de alçada indisponível:', e.message);
    }

    const enriched = (data || []).map(d => ({
      ...d,
      pode_aprovar_alcada: alcadaFlag(d),
      solicitante: profileMap[d.solicitante_id] || null,
      responsavel: profileMap[d.responsavel_id] || null,
      aprovacao_origem_diretor: profileMap[d.aprovacao_origem_diretor_id] || null,
      aprovacao_origem_aprovadores: nomesAprovadores(d),
      aprovacao_gestao_aprovadores: d.aprovacao_gestao_status ? (gestaoNomesPorCat[d.categoria] || []) : [],
      aprovacao_pendente_de: pendenteDe(d),
      ...(papeisPorId ? { aprovacao_papel_pendente: papeisPorId[d.id] || [] } : {}),
      marketing_tipo: tipoMap[d.marketing_tipo_id] || null,
      marketing_destino: destinoMap[d.marketing_destino_id] || null,
      marketing_card: cardMap[d.id] || null,
      marketing_campanha: campanhaMap[d.id] || null,
    }));






    let saida = enriched;
    try {
      saida = await assinarAnexosSolicitacoes(enriched);
    } catch (err) {
      console.warn('[SOLICITACOES] assinatura de anexos falhou:', err.message);
    }

    res.json(saida);
  } catch (e) {
    console.error('[SOLICITACOES] list error:', e.message);
    res.status(500).json({ error: 'Erro ao listar solicitações' });
  }
});






router.get('/minhas-aprovacoes', async (req, res) => {
  try {
    const userId = req.user.id;
    const isSuper = await isAdminFallback(req);
    const dias = Math.min(parseInt(req.query.dias, 10) || 180, 730);
    const desde = new Date(Date.now() - dias * 86400000).toISOString();
    const todos = isSuper && ['1', 'true'].includes(String(req.query.todos));

    let q = supabase
      .from('solicitacoes_eventos')
      .select('id, solicitacao_id, status_anterior, status_novo, ator_id, observacao, created_at')
      .gte('created_at', desde)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (!todos) q = q.eq('ator_id', userId);
    const { data: eventos, error } = await q;
    if (error) throw error;



    const ehDecisao = (obs) => /^(aprova|rejei|reprov|m[eé]rito)/i.test((obs || '').trim());
    const decisoes = (eventos || []).filter(e => ehDecisao(e.observacao));
    if (!decisoes.length) return res.json([]);

    const solIds = [...new Set(decisoes.map(e => e.solicitacao_id).filter(Boolean))];
    const { data: sols } = await supabase
      .from('solicitacoes')
      .select('id, titulo, categoria, status, solicitante_id, valor_estimado')
      .in('id', solIds);
    const solMap = Object.fromEntries((sols || []).map(s => [s.id, s]));

    const profIds = [...new Set([
      ...decisoes.map(e => e.ator_id),
      ...(sols || []).map(s => s.solicitante_id),
    ].filter(Boolean))];
    let profMap = {};
    if (profIds.length) {
      const { data: profs } = await supabase.from('profiles').select('id, name').in('id', profIds);
      profMap = Object.fromEntries((profs || []).map(p => [p.id, p.name]));
    }

    const out = decisoes.map(e => {
      const s = solMap[e.solicitacao_id] || {};
      const obs = e.observacao || '';
      const decisao = /rejei|reprov/i.test(obs) ? 'rejeitada' : 'aprovada';
      const etapa = /gest/i.test(obs) ? 'gestao' : /m[eé]rito/i.test(obs) ? 'merito' : 'origem';
      return {
        evento_id: e.id,
        solicitacao_id: e.solicitacao_id,
        titulo: s.titulo || null,
        categoria: s.categoria || null,
        status_atual: s.status || null,
        valor_estimado: s.valor_estimado ?? null,
        solicitante: s.solicitante_id ? (profMap[s.solicitante_id] || null) : null,
        ator: e.ator_id ? (profMap[e.ator_id] || null) : null,
        decisao,
        etapa,
        observacao: obs,
        em: e.created_at,
      };
    });
    res.json(out);
  } catch (e) {
    console.error('[SOLICITACOES] minhas-aprovacoes:', e.message);
    res.status(500).json({ error: 'Erro ao carregar histórico de aprovações' });
  }
});





router.get('/meu-papel', async (req, res) => {
  try {
    const userId = req.user.userId;
    const role = req.user.role;



    const { data: setorRow } = await supabase
      .from('setor_diretor')
      .select('setor, diretor_nome')
      .eq('diretor_id', userId)
      .maybeSingle();
    const coSetores = await setoresQueCoaprova(userId);
    const ehAprovadorOrigem = !!setorRow || coSetores.length > 0;


    const isSuper = await isAdminFallback(req);





    const aprovarIds = await diretorIdsQuePodeAprovar(userId);
    let pendentesOrigem = 0;
    if (aprovarIds.length) {
      const { count } = await supabase
        .from('solicitacoes')
        .select('id', { count: 'exact', head: true })
        .in('aprovacao_origem_diretor_id', aprovarIds)
        .eq('aprovacao_origem_status', 'pendente')
        .is('deleted_at', null);
      pendentesOrigem = count || 0;
    }


    let pendentesTriagem = 0;
    if (isSuper) {
      const { count } = await supabase
        .from('solicitacoes')
        .select('id', { count: 'exact', head: true })
        .eq('aprovacao_origem_status', 'triagem')
        .is('deleted_at', null);
      pendentesTriagem = count || 0;
    }






    const overrideMapMP = await mapaGestaoOverride();
    const defaultGestaoIdsMP = await aprovadoresGestaoIds();
    const aprovaGestaoDeMP = (cat) => (overrideMapMP[cat]?.ids?.length ? overrideMapMP[cat].ids : defaultGestaoIdsMP).includes(userId);
    const ehAprovadorGestao = defaultGestaoIdsMP.includes(userId)
      || Object.values(overrideMapMP).some(o => (o.ids || []).includes(userId));
    const meritoIds = await aprovadoresMeritoIds();
    const ehAprovadorMerito = meritoIds.includes(userId);



    let pendentesGestao = 0;
    if (ehAprovadorGestao) {
      const { data: gp } = await supabase
        .from('solicitacoes')
        .select('categoria')
        .eq('aprovacao_gestao_status', 'pendente')
        .in('aprovacao_origem_status', ['aprovada', 'dispensada'])
        .is('deleted_at', null)
        .limit(1000);
      pendentesGestao = (gp || []).filter(r => aprovaGestaoDeMP(r.categoria)).length;
    }
    let pendentesMerito = 0;
    if (ehAprovadorMerito) {
      const { count } = await supabase
        .from('solicitacoes')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'aguardando_merito')
        .is('deleted_at', null);
      pendentesMerito = count || 0;
    }



    let correcao = { pode: false, categorias: [] };
    try { correcao = await autoridadeCorrecaoFinanceira(req); }
    catch (e) { console.error('[SOLICITACOES] meu-papel · correção:', e.message); }

    if (['admin', 'diretor'].includes(role)) {
      return res.json({
        corrige_financeiro: correcao.pode,
        corrige_categorias: correcao.categorias,
        atende: true,
        admin: true,
        areas: [],
        eh_diretor_origem: !!setorRow,
        setor_origem: setorRow?.setor || null,
        pendentes_origem: pendentesOrigem,
        eh_triagem_admin: isSuper,
        pendentes_triagem: pendentesTriagem,
        eh_aprovador_gestao: ehAprovadorGestao,
        pendentes_gestao: pendentesGestao,
        eh_aprovador_merito: ehAprovadorMerito,
        pendentes_merito: pendentesMerito,
      });
    }
    const { data, error } = await supabase
      .from('area_solicitacoes_responsaveis')
      .select('area')
      .eq('profile_id', userId);
    if (error) throw error;
    const areas = (data || []).map(r => r.area);











    let temAtribuidas = EXECUTOR_FINANCEIRO_ID && userId === EXECUTOR_FINANCEIRO_ID;
    if (!temAtribuidas && areas.length === 0) {
      const { count: atribCount } = await supabase
        .from('solicitacoes')
        .select('id', { count: 'exact', head: true })
        .eq('responsavel_id', userId)
        .is('deleted_at', null);
      temAtribuidas = (atribCount || 0) > 0;
    }

    res.json({
      corrige_financeiro: correcao.pode,
      corrige_categorias: correcao.categorias,
      atende: areas.length > 0 || temAtribuidas,
      admin: false,
      areas,
      eh_diretor_origem: ehAprovadorOrigem,
      setor_origem: setorRow?.setor || coSetores[0] || null,
      pendentes_origem: pendentesOrigem,
      eh_triagem_admin: isSuper,
      pendentes_triagem: pendentesTriagem,
      eh_aprovador_gestao: ehAprovadorGestao,
      pendentes_gestao: pendentesGestao,
      eh_aprovador_merito: ehAprovadorMerito,
      pendentes_merito: pendentesMerito,
    });
  } catch (e) {
    console.error('[SOLICITACOES] meu-papel error:', e.message);
    res.status(500).json({ error: 'Erro ao resolver papel' });
  }
});


router.post('/', async (req, res) => {
  try {
    const userId = req.user.userId;
    const userName = req.user.name;

    const { titulo, descricao, justificativa, categoria, urgencia, valor_estimado, area_solicitante,

            area_responsavel, subcategoria, eh_urgente, justificativa_urgencia,
            data_necessaria, espaco_solicitado, data_uso, horario_inicio, horario_fim, qtde_pessoas,

            motivo_reembolso, data_compra,
            forma_pagamento, chave_pix, banco, agencia, conta, documento_url,

            itens, link_referencia, favorecido_nome, favorecido_documento,
            recorrente, recorrencia,

            itens_lista,

            imagens_url,

            marketing_tipo_id, marketing_destino_id,
            mkt_publico_alvo, mkt_ideia_inicial,

            eh_planejado,

            manter_privada } = req.body;
    if (!titulo || !categoria) return res.status(400).json({ error: 'Título e categoria são obrigatórios' });


    const CATEGORIAS_PRIVADAS = ['ferias', 'licenca', 'reembolso'];
    const compartilharArea = !CATEGORIAS_PRIVADAS.includes(categoria) && !manter_privada;
    if (!ALLOWED_CATEGORIES.includes(categoria)) {
      return res.status(400).json({ error: `Categoria inválida: "${categoria}". Permitidas: ${ALLOWED_CATEGORIES.join(', ')}` });
    }



    const itensListaNorm = (Array.isArray(itens_lista) ? itens_lista : [])
      .filter(it => it && String(it.descricao || '').trim())
      .map((it, i) => {
        const qNum = Number(it.quantidade);
        const quantidade = isFinite(qNum) && qNum > 0 ? qNum : 1;
        const vNum = Number(it.valor_estimado);
        const temValor = it.valor_estimado != null && it.valor_estimado !== '' && isFinite(vNum);



        const valorLinha = temValor
          ? (it.valor_tipo === 'unitario' ? vNum * quantidade : vNum)
          : null;
        return {
          descricao: String(it.descricao).trim().slice(0, 500),
          quantidade,
          unidade: it.unidade ? String(it.unidade).trim().slice(0, 20) : 'un',
          link_referencia: it.link_referencia ? String(it.link_referencia).trim().slice(0, 1000) : null,
          valor_estimado: valorLinha,
          imagem_url: it.imagem_url ? String(it.imagem_url).slice(0, 2000) : null,
          ordem: i,
        };
      });
    let itensTexto = itens;
    let valorEstimadoFinal = valor_estimado;
    if (itensListaNorm.length) {
      itensTexto = itensListaNorm
        .map(it => `${it.quantidade}x ${it.descricao}`)
        .join('\n');



      const soma = itensListaNorm.reduce(
        (acc, it) => acc + (it.valor_estimado != null ? it.valor_estimado : 0), 0);
      const semTotal = valorEstimadoFinal == null || valorEstimadoFinal === '' || Number(valorEstimadoFinal) === 0;
      if (semTotal && soma > 0) valorEstimadoFinal = soma;
    }




    const imagensNorm = (Array.isArray(imagens_url) ? imagens_url : [])
      .filter(u => typeof u === 'string' && u.trim())
      .slice(0, 5)
      .map(u => u.trim().slice(0, 2000));




    const ehCriativo = CRIATIVO_CATEGORIAS.includes(categoria);
    const criativoComCusto = ehCriativo && Number(valorEstimadoFinal) > 0;


    const mapa = CATEGORIA_TO_AREA_RESP[categoria] || { area: null, subcategoria: 'default' };


    const finalAreaResp = area_responsavel || (criativoComCusto ? 'logistica_compras' : mapa.area);
    const finalSub = subcategoria || (criativoComCusto ? 'default' : mapa.subcategoria);





    const _stripAcentos = (s) => String(s || '').normalize('NFD')
      .split('').filter(c => { const code = c.charCodeAt(0); return code < 0x0300 || code > 0x036f; }).join('');
    const _slugArea = (s) => _stripAcentos(s).toLowerCase().trim();
    const areaClienteResolvida =
      (Array.isArray(req.user.kpi_areas) && req.user.kpi_areas[0])
      || (req.user.granular?.areas?.[0] ? _slugArea(req.user.granular.areas[0]) : null)
      || (req.user.area ? _slugArea(req.user.area) : null)
      || null;








    const planejado = eh_planejado === true || eh_planejado === 'true';
    const setorHint = resolverSetorHint(req.user);

    let rota = null;
    let gestaoStatus = null;
    let gestaoMotivo = null;
    let gestaoIdsNotificar = [];





    try {






      const { data: r, error: rErr } = await supabase
        .rpc('fn_solicitacoes_rotear_origem', {
          p_solicitante_id: userId, p_setor_hint: setorHint, p_categoria: categoria,
        });
      if (rErr) throw rErr;
      rota = r;
    } catch (rerr) {
      console.error('[SOLICITAÇÕES] roteamento de origem falhou (fallback trigger):', rerr.message);
    }









    let categoriaVaiDiretoPraOperacao = false;
    try {
      const { data: disp, error: dErr } = await supabase
        .rpc('fn_solicitacoes_categoria_dispensa_origem', { p_categoria: categoria });
      if (dErr) throw dErr;
      categoriaVaiDiretoPraOperacao = disp === true;
    } catch (derr) {
      console.error('[SOLICITAÇÕES] dispensa por categoria falhou (mantém carimbo de Gestão):', derr.message);
    }











    if (categoria === 'compras') {
      const valorCompra = Number(valorEstimadoFinal) || 0;
      if (planejado && valorCompra <= 1000) {
        rota = { diretor_id: null, aprovacao_status: 'dispensada', status: 'pendente',
          motivo: 'Compra planejada até R$ 1.000 · direto para cotação' };
      }

    }



    if (categoria === 'reserva_espaco') {
      rota = { diretor_id: null, aprovacao_status: 'dispensada', status: 'pendente',
        motivo: 'Reserva de espaço vai direto para operações (Amaury)' };
    }




    if (CATEGORIA_ORIGEM_APROVADOR[categoria]) {
      rota = { diretor_id: CATEGORIA_ORIGEM_APROVADOR[categoria], aprovacao_status: 'pendente',
        status: 'aguardando_aprovacao_origem',
        motivo: 'Origem aprovada pelo responsável da categoria' };
    }









    if (ehCriativo && rota?.aprovacao_status === 'pendente') {
      try {
        const { data: cri } = await supabase.from('setor_diretor')
          .select('diretor_id').eq('setor', 'Criativo').maybeSingle();
        if (cri?.diretor_id) {
          rota = { diretor_id: cri.diretor_id, aprovacao_status: 'pendente',
            status: 'aguardando_aprovacao_origem',
            motivo: 'Criativo · aprovação de origem com o diretor do Criativo (por categoria)' };
        }
      } catch (e) { console.warn('[SOLICITAÇÕES] exceção origem Criativo:', e.message); }
    }

    if (categoria === 'compras' && !planejado) {


      gestaoStatus = 'dispensada';
      gestaoMotivo = 'Compras não passam pela Gestão · origem (quando aplicável) + cotação + financeiro';
    } else if (ehCriativo && !planejado) {


      gestaoStatus = 'dispensada';
      gestaoMotivo = 'Criativo não passa pela Gestão · origem do Criativo + financeiro';
    } else if (CATEGORIA_ORIGEM_APROVADOR[categoria] && !planejado) {


      gestaoStatus = 'dispensada';
      gestaoMotivo = 'Origem aprovada pelo responsável da categoria (Amaury) · sem carimbo de Gestão';
    } else if (categoriaVaiDiretoPraOperacao && !planejado) {




      gestaoStatus = 'dispensada';
      gestaoMotivo = 'Servico/manutencao vai direto para operacao (decisao 17/08) · Gestao fica ciente, nao aprova';
    } else if (!planejado && categoria !== 'reserva_espaco') {


      const temOverride = !!(await overrideGestaoPorCategoria(categoria));
      const gestaoIds = await aprovadoresGestaoIds(categoria);
      const demandanteEhAprovador = gestaoIds.includes(userId);


      if (demandanteEhAprovador || (!temOverride && setorHint === SETOR_GESTAO)) {
        gestaoStatus = 'dispensada';
        gestaoMotivo = demandanteEhAprovador
          ? 'Demandante é aprovador do 2º carimbo · papéis colapsam no carimbo de origem'
          : 'Demandante do setor Gestão · papéis colapsam no carimbo de origem';
      } else {
        gestaoStatus = 'pendente';
        gestaoIdsNotificar = gestaoIds;
      }
    }
    const agoraIso = new Date().toISOString();

    let { data, error } = await supabase
      .from('solicitacoes')
      .insert({
        titulo,
        descricao,
        justificativa,
        categoria,
        urgencia: urgencia || 'normal',
        valor_estimado: valorEstimadoFinal,
        solicitante_id: userId,
        compartilhar_area: compartilharArea,
        area_solicitante,
        cargo_solicitante: req.user.granular?.cargoNome || null,


        area_cliente: areaClienteResolvida,
        area_responsavel: finalAreaResp,

        eh_planejado: planejado,
        ...(planejado && { planejado_por: userId }),




        ...(criativoComCusto && { precisa_aprovacao_financeira: true }),


        ...(rota && {
          aprovacao_origem_diretor_id: rota.diretor_id || null,
          aprovacao_origem_status: rota.aprovacao_status,
          aprovacao_origem_motivo: rota.motivo || null,
          aprovacao_origem_em: rota.aprovacao_status === 'dispensada' ? agoraIso : null,
        }),

        aprovacao_gestao_status: gestaoStatus,
        ...(gestaoStatus === 'dispensada' && {
          aprovacao_gestao_em: agoraIso,
          aprovacao_gestao_motivo: gestaoMotivo,
        }),



        ...(((rota && ['pendente', 'triagem'].includes(rota.aprovacao_status)) || gestaoStatus === 'pendente')
          ? { status: 'aguardando_aprovacao_origem' }
          : (rota ? { status: rota.status } : {})),
        subcategoria: finalSub,
        eh_urgente: !!eh_urgente,
        justificativa_urgencia: justificativa_urgencia || null,
        data_necessaria: data_necessaria || null,

        ...(imagensNorm.length && { imagens_url: imagensNorm }),

        ...(finalAreaResp === 'reserva_espaco' && {
          espaco_solicitado: espaco_solicitado || null,
          data_uso: data_uso || null,
          horario_inicio: horario_inicio || null,
          horario_fim: horario_fim || null,
          qtde_pessoas: qtde_pessoas || null,
        }),

        ...(categoria === 'reembolso' && {
          motivo_reembolso: motivo_reembolso || null,
          data_compra: data_compra || null,
          forma_pagamento: forma_pagamento || null,
          chave_pix: chave_pix || null,
          banco: banco || null,
          agencia: agencia || null,
          conta: conta || null,
          documento_url: documento_url || null,
        }),


        ...(categoria === 'compras' && {
          itens: itensTexto || null,
          link_referencia: link_referencia || null,
          favorecido_nome: favorecido_nome || null,
        }),


        ...(categoria === 'pagamento' && {
          favorecido_nome: favorecido_nome || null,
          favorecido_documento: favorecido_documento || null,
          forma_pagamento: forma_pagamento || null,
          chave_pix: chave_pix || null,
          banco: banco || null,
          agencia: agencia || null,
          conta: conta || null,
          documento_url: documento_url || null,
          recorrente: !!recorrente,
          recorrencia: recorrencia || null,
        }),

        ...(categoria === 'servico' && {
          itens: itensTexto || null,
          favorecido_nome: favorecido_nome || null,
          favorecido_documento: favorecido_documento || null,
          link_referencia: link_referencia || null,
          documento_url: documento_url || null,
          recorrente: !!recorrente,
          recorrencia: recorrencia || null,
        }),


        ...(categoria === 'marketing' && {
          marketing_tipo_id: marketing_tipo_id || null,
          marketing_destino_id: marketing_destino_id || null,
          mkt_publico_alvo: mkt_publico_alvo || null,
          mkt_ideia_inicial: mkt_ideia_inicial || null,
        }),
      })
      .select('*')
      .single();
    if (error) throw error;





    if (data.aprovacao_origem_status === 'dispensada'
        && (data.aprovacao_gestao_status === 'dispensada' || data.aprovacao_gestao_status == null)
        && precisaMerito(data)) {
      const statusAntes = data.status;
      const { data: up, error: upErr } = await supabase
        .from('solicitacoes')
        .update({ status: 'aguardando_merito', merito_status: 'pendente' })
        .eq('id', data.id)
        .select('*')
        .single();
      if (!upErr && up) {
        data = up;
        registrarEvento(data.id, {
          statusAnterior: statusAntes,
          statusNovo: 'aguardando_merito',
          atorId: userId,
          observacao: 'Carimbos dispensados · pedido com custo enviado ao julgamento de mérito',
        });
        notificarMeritoPendente(data);
        require('../services/solicitacaoWpp').enviarMeritoWpp(data).catch(() => {});
      } else if (upErr) {
        console.error('[SOLICITACOES] mover pra mérito no create:', upErr.message);
      }
    }




    if (itensListaNorm.length && (categoria === 'compras' || categoria === 'servico')) {
      const rows = itensListaNorm.map(it => ({ ...it, solicitacao_id: data.id }));
      const { error: itErr } = await supabase.from('solicitacao_itens').insert(rows);
      if (itErr) console.error('[SOLICITAÇÕES] falha ao gravar itens do pedido:', itErr.message);
    }



    let responsaveisDaArea = [];
    if (finalAreaResp) {
      const { data: resps } = await supabase
        .from('area_solicitacoes_responsaveis')
        .select('profile_id')
        .eq('area', finalAreaResp);
      responsaveisDaArea = (resps || []).map(r => r.profile_id);

      if (responsaveisDaArea.length === 1) {
        await supabase
          .from('solicitacoes')
          .update({ responsavel_id: responsaveisDaArea[0] })
          .eq('id', data.id);
        data.responsavel_id = responsaveisDaArea[0];
      }
    }



    const modulo = CATEGORIA_MODULO[categoria] || 'administrativo';
    notificar({
      modulo,
      tipo: 'solicitacao',
      titulo: `Nova solicitação: ${titulo}`,
      mensagem: `${userName || 'Usuário'} criou uma solicitação de ${categoria}`,
      link: '/solicitacoes',
      severidade: urgencia === 'critica' ? 'alta' : 'info',
      chaveDedup: `solicitacao_nova_${data.id}`,
      extraTargetIds: responsaveisDaArea,
    }).catch(err => console.error('[SOLICITACOES] notify error:', err.message));




    if (categoria === 'compras' && data.status === 'em_cotacao'
        && data.aprovacao_origem_status === 'dispensada') {
      registrarEvento(data.id, {
        statusAnterior: null,
        statusNovo: 'em_cotacao',
        atorId: userId,
        observacao: 'Compra entrou direto na cotação (Amaury)',
      });
      if (responsaveisDaArea.length) {
        notificar({
          modulo,
          tipo: 'solicitacao_status',
          titulo: `Cotar: ${titulo}`,
          mensagem: `Compra entrou direto na cotação — registre a cotação (valor + fornecedor) pra seguir pra aprovação financeira.`,
          link: '/solicitacoes',
          severidade: 'info',
          chaveDedup: `solicitacao_cotar_${data.id}`,
          targetIds: responsaveisDaArea,
        }).catch(err => console.error('[SOLICITACOES] notify cotar direto:', err.message));
      }
    }



    if (data.status === 'aguardando_aprovacao_origem' && data.aprovacao_origem_diretor_id) {


      const coIds = await coaprovadorIdsParaDiretor(data.aprovacao_origem_diretor_id);
      const alvosAprovacao = [...new Set([data.aprovacao_origem_diretor_id, ...coIds])];
      notificar({
        modulo: 'administrativo',
        tipo: 'solicitacao_aprovacao_origem',
        titulo: `Aprovar solicitacao: ${titulo}`,
        mensagem: `${userName || 'Funcionario'} pediu uma solicitação que precisa da sua aprovação antes de seguir para ${finalAreaResp || 'area alvo'}.`,
        link: '/solicitacoes?aba=aprovar',
        severidade: 'info',
        chaveDedup: `solicitacao_aprovacao_origem_${data.id}`,
        targetIds: alvosAprovacao,
        email: true,
      }).catch(err => console.error('[SOLICITACOES] notify diretor:', err.message));


      require('../services/solicitacaoWpp').enviarAprovacaoWpp(data).catch(() => {});
    }







    if (data.aprovacao_gestao_status === 'pendente'
        && ['aprovada', 'dispensada'].includes(data.aprovacao_origem_status)
        && gestaoIdsNotificar.length) {
      notificar({
        modulo: 'administrativo',
        tipo: 'solicitacao_aprovacao_gestao',
        titulo: `Aprovar solicitação (Gestão): ${titulo}`,
        mensagem: `${userName || 'Funcionário'} pediu uma solicitação não-planejada que precisa também do carimbo da diretoria de Gestão.`,
        link: '/solicitacoes?aba=aprovar',
        severidade: 'info',
        chaveDedup: `solicitacao_aprovacao_gestao_${data.id}`,
        targetIds: gestaoIdsNotificar,
        email: true,
      }).catch(err => console.error('[SOLICITACOES] notify gestao:', err.message));
    }



    if (data.status === 'aguardando_aprovacao_origem' && data.aprovacao_origem_status === 'triagem') {
      notificar({
        modulo: 'administrativo',
        tipo: 'solicitacao_triagem',
        titulo: 'Triagem · usuário sem área no sistema',
        mensagem: `A solicitação "${titulo}" caiu na triagem porque ${userName || 'o solicitante'} está no sistema sem área/setor definido. Defina a área no cadastro (Permissões › Usuários) e aprove/encaminhe.`,
        link: '/solicitacoes?aba=aprovar',
        severidade: 'alta',
        chaveDedup: `solicitacao_triagem_${data.id}`,
      }).catch(err => console.error('[SOLICITACOES] notify triagem:', err.message));
    }






    if (categoriaVaiDiretoPraOperacao && gestaoStatus === 'dispensada') {
      aprovadoresGestaoIds(categoria)
        .then(ids => {
          if (!ids.length) return;
          return notificar({
            modulo: 'administrativo',
            tipo: 'solicitacao_servico_ciencia',
            titulo: `Serviço pedido à manutenção: ${titulo}`,
            mensagem: `${userName || 'Um funcionário'} pediu um serviço/manutenção. Foi direto para a operação (Amaury) — você não precisa aprovar, é só para ciência.`,
            link: '/solicitacoes',
            severidade: 'info',
            chaveDedup: `solicitacao_servico_ciencia_${data.id}`,
            targetIds: ids,
          });
        })
        .catch(err => console.error('[SOLICITACOES] notify ciência serviço:', err.message));
    }

    res.status(201).json(data);
  } catch (e) {
    console.error('[SOLICITACOES] create error:', e.message);

    if (e.code === '42501' || /apenas funcionarios podem criar solicitacoes/i.test(e.message || '')) {
      return res.status(403).json({
        error: 'Apenas funcionários com vinculo ativo em RH podem criar solicitações.',
      });
    }
    res.status(500).json({ error: e.message || 'Erro ao criar solicitação' });
  }
});




async function isAdminFallback(req) {


  if (['admin'].includes(req.user.role)) return true;
  const { data } = await supabase
    .from('app_super_admins')
    .select('email')
    .ilike('email', req.user.email)
    .eq('ativo', true)
    .maybeSingle();
  return !!data;
}








async function aprovarOrigemHandler(req, res) {
  try {
    const userId = req.user.userId;
    const userName = req.user.name;
    const isSuperAdmin = await isAdminFallback(req);

    const { data: atual, error: getErr } = await supabase
      .from('solicitacoes')
      .select('*')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (getErr) throw getErr;
    if (!atual) return res.status(404).json({ error: 'Solicitação não encontrada.' });

    const origemPendente = ['pendente', 'triagem'].includes(atual.aprovacao_origem_status);
    const gestaoPendente = atual.aprovacao_gestao_status === 'pendente';
    if (!origemPendente && !gestaoPendente) {
      return res.status(400).json({ error: 'Solicitação não está pendente de aprovação.' });
    }





    const isDiretorAlvo = origemPendente && atual.aprovacao_origem_diretor_id === userId;
    const isCoaprovador = origemPendente && !isDiretorAlvo && await podeAprovarOrigem(userId, atual);
    const podeOrigem = origemPendente && (isDiretorAlvo || isCoaprovador || isSuperAdmin);
    let ehAprovadorGestao = false;
    if (gestaoPendente) {
      const gestaoIds = await aprovadoresGestaoIds(atual.categoria);
      ehAprovadorGestao = gestaoIds.includes(userId);
    }


    const origemResolvida = ['aprovada', 'dispensada'].includes(atual.aprovacao_origem_status);
    const podeGestao = gestaoPendente && origemResolvida && (ehAprovadorGestao || isSuperAdmin);
    if (!podeOrigem && !podeGestao) {

      if (gestaoPendente && !origemResolvida && (ehAprovadorGestao || isSuperAdmin)) {
        return res.status(409).json({ error: 'Esta solicitação ainda aguarda a aprovação do diretor da área do demandante. O carimbo de Gestão fica disponível depois disso.' });
      }
      return res.status(403).json({ error: 'Apenas o diretor de origem, um co-aprovador do setor ou a diretoria de Gestão pode aprovar esta solicitação.' });
    }


    const carimbo = podeOrigem ? 'origem' : 'gestao';
    const agoraIso = new Date().toISOString();

    const update = {};
    if (carimbo === 'origem') {
      update.aprovacao_origem_status = 'aprovada';
      update.aprovacao_origem_em = agoraIso;

      if (!isDiretorAlvo && isCoaprovador) {
        update.aprovacao_origem_motivo = `Aprovada por ${userName || 'co-aprovador'} (co-aprovador do setor)`;
      } else if (!isDiretorAlvo && isSuperAdmin) {
        update.aprovacao_origem_diretor_id = userId;
        update.aprovacao_origem_motivo = '[Fallback super-admin]';
      }
    } else {
      update.aprovacao_gestao_status = 'aprovada';
      update.aprovacao_gestao_por = userId;
      update.aprovacao_gestao_em = agoraIso;
      if (!ehAprovadorGestao && isSuperAdmin) {
        update.aprovacao_gestao_motivo = '[Fallback super-admin]';
      }
    }


    const origemOk = carimbo === 'origem'
      || ['aprovada', 'dispensada'].includes(atual.aprovacao_origem_status);
    const gestaoOk = carimbo === 'gestao'
      || atual.aprovacao_gestao_status == null
      || ['aprovada', 'dispensada'].includes(atual.aprovacao_gestao_status);
    const completo = origemOk && gestaoOk;






    const vaiPraMerito = completo && precisaMerito(atual);
    const ehCotacao = ['compras', 'servico'].includes(atual.categoria);
    if (!completo) {
      update.status = 'aguardando_aprovacao_origem';
    } else if (vaiPraMerito) {
      update.status = 'aguardando_merito';
      update.merito_status = 'pendente';
    } else {
      update.status = proximoStatusPosAprovacao(atual);
    }

    const { data, error } = await supabase
      .from('solicitacoes')
      .update(update)
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;


    await registrarEvento(data.id, {
      statusAnterior: atual.status,
      statusNovo: data.status,
      atorId: userId,
      observacao: carimbo === 'gestao'
        ? `Aprovação da diretoria de Gestão (${userName || 'aprovador'})`
        : `Aprovação do diretor de origem (${userName || 'aprovador'})`,
    });

    const modulo = CATEGORIA_MODULO[data.categoria] || 'administrativo';


    if (!completo) {
      const faltaLabel = carimbo === 'origem' ? 'da diretoria de Gestão' : 'do diretor da sua área';
      notificar({
        modulo,
        tipo: 'solicitacao_status',
        titulo: `Aprovação parcial: ${data.titulo}`,
        mensagem: `${userName || 'Aprovador'} deu o carimbo ${carimbo === 'origem' ? 'de origem' : 'de Gestão'} · falta a aprovação ${faltaLabel}.`,
        link: '/solicitacoes',
        severidade: 'info',
        chaveDedup: `solicitacao_carimbo_${carimbo}_${data.id}`,
        targetIds: [data.solicitante_id].filter(Boolean),
      }).catch(err => console.error('[SOLICITACOES] notify carimbo parcial:', err.message));



      if (carimbo === 'origem' && data.aprovacao_gestao_status === 'pendente') {
        const gestaoIds = await aprovadoresGestaoIds(data.categoria);
        if (gestaoIds.length) {
          notificar({
            modulo,
            tipo: 'solicitacao_aprovacao_gestao',
            titulo: `Aprovar solicitação (Gestão): ${data.titulo}`,
            mensagem: `O diretor da área do demandante aprovou · agora precisa do carimbo do 2º aprovador.`,
            link: '/solicitacoes?aba=aprovar',
            severidade: 'info',
            chaveDedup: `solicitacao_aprovacao_gestao_${data.id}`,
            targetIds: gestaoIds,
            email: true,
          }).catch(err => console.error('[SOLICITACOES] notify gestao (pos-origem):', err.message));
        }
      }
      return res.json(data);
    }


    if (vaiPraMerito) {
      notificar({
        modulo,
        tipo: 'solicitacao_status',
        titulo: `Aprovada · em julgamento de mérito: ${data.titulo}`,
        mensagem: `${userName || 'Aprovador'} concluiu as aprovações · como o pedido tem custo, segue para o julgamento de mérito.`,
        link: '/solicitacoes',
        severidade: 'info',
        chaveDedup: `solicitacao_merito_solic_${data.id}`,
        targetIds: [data.solicitante_id].filter(Boolean),
      }).catch(err => console.error('[SOLICITACOES] notify merito solicitante:', err.message));
      notificarMeritoPendente(data);
      require('../services/solicitacaoWpp').enviarMeritoWpp(data).catch(() => {});
      notificarPedidoWhatsapp(data.id, 'aguardando julgamento de mérito', null);
      return res.json(data);
    }



    notificarPedidoWhatsapp(data.id, 'aprovada na origem', null);


    notificar({
      modulo,
      tipo: 'solicitacao_status',
      titulo: `Aprovada: ${data.titulo}`,
      mensagem: ehCotacao
        ? `${userName || 'Diretor'} aprovou sua solicitação. Foi pra cotação na logística (valor e fornecedor) antes do financeiro.`
        : `${userName || 'Diretor'} aprovou sua solicitação. Foi para a fila ${data.area_responsavel || 'da area alvo'}.`,
      link: '/solicitacoes',
      severidade: 'info',
      chaveDedup: `solicitacao_aprovada_origem_${data.id}`,
      targetIds: [data.solicitante_id].filter(Boolean),
    }).catch(err => console.error('[SOLICITACOES] notify aprovar:', err.message));

    if (data.area_responsavel) {
      resolverDestinatarios(modulo).then(managers => {
        const filtered = managers.filter(id => id !== data.solicitante_id);
        if (filtered.length) {
          notificar({
            modulo,
            tipo: 'solicitacao',
            titulo: ehCotacao ? `Cotar: ${data.titulo}` : `Nova na fila: ${data.titulo}`,
            mensagem: ehCotacao
              ? `Solicitação aprovada pelo diretor · registre a cotação (valor + fornecedor) pra seguir pro financeiro.`
              : `Solicitação aprovada pelo diretor · pronta para atendimento.`,
            link: '/solicitacoes',
            severidade: 'info',
            chaveDedup: `solicitacao_pos_aprovacao_${data.id}`,
            targetIds: filtered,



            email: modulo === 'financeiro',
          }).catch(err => console.error('[SOLICITACOES] notify responsaveis:', err.message));
        }
      }).catch(err => console.error('[SOLICITACOES] resolve managers:', err.message));
    }

    res.json(data);
  } catch (e) {
    console.error('[SOLICITACOES] aprovar-origem:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao aprovar solicitação' });
  }
}
router.patch('/:id/aprovar-origem', aprovarOrigemHandler);




async function podeCotar(req, sol) {
  if (['admin', 'diretor'].includes(req.user.role)) return true;
  const mp = req.user.granular?.modulePerms || {};
  const log = mp.logistica || mp.Logistica;
  if (log && (log.leitura >= 3 || log.escrita >= 3)) return true;
  if (!sol?.area_responsavel) return false;
  const { data } = await supabase
    .from('area_solicitacoes_responsaveis')
    .select('profile_id')
    .eq('area', sol.area_responsavel)
    .eq('profile_id', req.user.userId)
    .maybeSingle();
  return !!data;
}










router.post('/:id/registrar-cotacao', async (req, res) => {
  try {
    const { valor_cotado, fornecedor, observacao } = req.body || {};
    const valor = Number(valor_cotado);
    if (valor_cotado == null || valor_cotado === '' || Number.isNaN(valor) || valor < 0) {
      return res.status(400).json({ error: 'Informe o valor cotado (número ≥ 0).' });
    }
    const { data: atual, error: getErr } = await supabase
      .from('solicitacoes').select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (getErr) throw getErr;
    if (!atual) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    if (atual.status !== 'em_cotacao') {
      return res.status(400).json({ error: 'Esta solicitação não está em cotação.' });
    }
    if (!(await podeCotar(req, atual))) {
      return res.status(403).json({ error: 'Apenas a logística (ou admin) pode registrar a cotação.' });
    }



    const updates = {
      valor_cotado: valor,
      cotacao_fornecedor: fornecedor || null,
      cotacao_observacao: observacao || null,
      cotacao_em: new Date().toISOString(),
      cotacao_por: req.user.userId,
      valor_estimado: valor,
      precisa_aprovacao_financeira: true,
      status: 'aguardando_aprovacao_financeira',
    };
    const { data, error } = await supabase
      .from('solicitacoes')
      .update(updates)
      .eq('id', req.params.id)
      .eq('status', 'em_cotacao')
      .is('deleted_at', null)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(409).json({ error: 'Esta solicitação saiu da etapa de cotação. Atualize a fila antes de registrar a cotação.' });




    const dispensadaPorBaixoValor = atual.aprovacao_origem_motivo === COMPRA_COTACAO_DIRETA_MOTIVO;
    const cotacaoAcimaDaDispensa = dispensadaPorBaixoValor && valor > COMPRA_COTACAO_DIRETA_LIMITE;
    if (cotacaoAcimaDaDispensa) {
      registrarEvento(data.id, {
        statusAnterior: 'em_cotacao',
        statusNovo: 'aguardando_aprovacao_financeira',
        atorId: req.user.userId,
        observacao: `Cotação de R$ ${valor.toFixed(2)} acima do limite de R$ ${COMPRA_COTACAO_DIRETA_LIMITE} que dispensou as aprovações no pedido`,
      });
    }


    resolverDestinatarios('financeiro').then(async managers => {
      const finProfileIds = new Set((managers || []).filter(Boolean));
      const { data: responsaveisFinanceiro } = await supabase
        .from('area_solicitacoes_responsaveis')
        .select('profile_id')
        .eq('area', 'financeiro');
      (responsaveisFinanceiro || []).forEach(item => item.profile_id && finProfileIds.add(item.profile_id));
      const alvo = await filtrarAprovadoresFinanceirosPorCategoria(finProfileIds, data.categoria);
      if (alvo.length) {
        notificar({
          modulo: 'financeiro',
          tipo: 'solicitacao_status',
          titulo: `Cotação pronta: ${data.titulo}`,
          mensagem: `A logística cotou R$ ${valor.toFixed(2)}${fornecedor ? ` (${fornecedor})` : ''} · aguarda sua aprovação financeira.${cotacaoAcimaDaDispensa ? ` Atenção: o pedido entrou sem aprovações por ter sido estimado em até R$ ${COMPRA_COTACAO_DIRETA_LIMITE}, mas a cotação veio acima disso.` : ''}`,
          link: linkFilaFinanceira(data.id),
          severidade: cotacaoAcimaDaDispensa ? 'alta' : 'info',
          chaveDedup: `solicitacao_cotacao_${data.id}`,
          targetIds: alvo,

          email: true,
        }).catch(err => console.error('[SOLICITACOES] notify cotacao:', err.message));
      }
    }).catch(err => console.error('[SOLICITACOES] resolve financeiro:', err.message));

    res.json(data);
  } catch (e) {
    console.error('[SOLICITACOES] registrar-cotacao:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao registrar cotação' });
  }
});










async function carregarSolDaCotacao(cotacaoId) {
  const { data: cot } = await supabase
    .from('solicitacao_cotacoes').select('*').eq('id', cotacaoId).maybeSingle();
  if (!cot) return { cot: null, sol: null };
  const { data: sol } = await supabase
    .from('solicitacoes').select('*').eq('id', cot.solicitacao_id).is('deleted_at', null).maybeSingle();
  return { cot, sol };
}

function cotacoesPodemSerGerenciadas(solicitacao) {
  return ['compras', 'servico'].includes(solicitacao?.categoria)
    && !solicitacao?.aprovado_financeiro_em
    && ['em_cotacao', 'aguardando_aprovacao_financeira'].includes(solicitacao?.status);
}

function fmtBRLServer(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 'R$ 0,00';
  return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtmlCot(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}



router.get('/:id/cotacoes', async (req, res) => {
  try {
    const { data: sol, error: solError } = await supabase
      .from('solicitacoes')
      .select('*')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (solError) throw solError;
    if (!sol) return res.status(404).json({ error: 'Solicitação não encontrada.' });

    let podeVer = sol.solicitante_id === req.user.userId;
    if (!podeVer) podeVer = await podeCotar(req, sol);
    if (!podeVer) podeVer = await podeGerirSolicitacao(req, sol);
    if (!podeVer && aguardandoAprovacaoFinanceira(sol)) {
      podeVer = await podeAprovarFinanceiro(req, sol.categoria);
    }

    if (!podeVer) podeVer = await podeAprovarNaAlcada(req, sol);
    if (!podeVer) {
      return res.status(403).json({ error: 'Sem permissão para ver as cotações desta solicitação.' });
    }

    const { data, error } = await supabase
      .from('solicitacao_cotacoes')
      .select('*')
      .eq('solicitacao_id', req.params.id)
      .order('ordem', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;




    const [envelope] = await assinarAnexosSolicitacoes([{ solicitacao_cotacoes: data || [] }]);
    res.json(envelope?.solicitacao_cotacoes || data || []);
  } catch (e) {
    console.error('[SOLICITACOES] listar-cotacoes:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao listar cotações' });
  }
});


router.post('/:id/cotacoes', async (req, res) => {
  try {
    const { fornecedor, valor, prazo, link, observacao, anexo_url } = req.body || {};
    const nomeForn = (fornecedor || '').trim();
    if (!nomeForn) return res.status(400).json({ error: 'Informe o fornecedor.' });
    const v = Number(valor);
    if (valor == null || valor === '' || Number.isNaN(v) || v < 0) {
      return res.status(400).json({ error: 'Informe o valor da cotação (número ≥ 0).' });
    }
    const { data: sol, error: getErr } = await supabase
      .from('solicitacoes').select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (getErr) throw getErr;
    if (!sol) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    if (!['compras', 'servico'].includes(sol.categoria)) {
      return res.status(400).json({ error: 'Cotações só se aplicam a compras/serviço.' });
    }
    if (!(await podeCotar(req, sol))) {
      return res.status(403).json({ error: 'Apenas a logística (ou admin) pode registrar cotações.' });
    }
    if (!cotacoesPodemSerGerenciadas(sol)) {
      return res.status(400).json({ error: 'As cotações só podem ser alteradas antes da aprovação financeira.' });
    }


    const { count } = await supabase
      .from('solicitacao_cotacoes')
      .select('id', { count: 'exact', head: true })
      .eq('solicitacao_id', sol.id);

    const { data, error } = await supabase
      .from('solicitacao_cotacoes')
      .insert({
        solicitacao_id: sol.id,
        fornecedor: nomeForn,
        valor: v,
        prazo: (prazo || '').trim() || null,
        link: (link || '').trim() || null,
        observacao: (observacao || '').trim() || null,
        anexo_url: (anexo_url || '').trim() || null,
        ordem: count || 0,
        created_by: req.user.userId,
      })
      .select('*').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('[SOLICITACOES] criar-cotacao:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao criar cotação' });
  }
});


router.patch('/cotacoes/:cotacaoId', async (req, res) => {
  try {
    const { sol } = await carregarSolDaCotacao(req.params.cotacaoId);
    if (!sol) return res.status(404).json({ error: 'Cotação não encontrada.' });
    if (!(await podeCotar(req, sol))) {
      return res.status(403).json({ error: 'Apenas a logística (ou admin) pode editar cotações.' });
    }
    if (!cotacoesPodemSerGerenciadas(sol)) {
      return res.status(400).json({ error: 'As cotações só podem ser alteradas antes da aprovação financeira.' });
    }
    const { fornecedor, valor, prazo, link, observacao, anexo_url } = req.body || {};
    const updates = {};
    if (fornecedor !== undefined) {
      const nome = (fornecedor || '').trim();
      if (!nome) return res.status(400).json({ error: 'Fornecedor não pode ficar vazio.' });
      updates.fornecedor = nome;
    }
    if (valor !== undefined) {
      const v = Number(valor);
      if (Number.isNaN(v) || v < 0) return res.status(400).json({ error: 'Valor inválido.' });
      updates.valor = v;
    }
    if (prazo !== undefined) updates.prazo = (prazo || '').trim() || null;
    if (link !== undefined) updates.link = (link || '').trim() || null;
    if (observacao !== undefined) updates.observacao = (observacao || '').trim() || null;
    if (anexo_url !== undefined) updates.anexo_url = (anexo_url || '').trim() || null;
    if (!Object.keys(updates).length) return res.status(400).json({ error: 'Nada para atualizar.' });

    const { data, error } = await supabase
      .from('solicitacao_cotacoes').update(updates).eq('id', req.params.cotacaoId).select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[SOLICITACOES] editar-cotacao:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao editar cotação' });
  }
});


router.delete('/cotacoes/:cotacaoId', async (req, res) => {
  try {
    const { sol } = await carregarSolDaCotacao(req.params.cotacaoId);
    if (!sol) return res.status(404).json({ error: 'Cotação não encontrada.' });
    if (!(await podeCotar(req, sol))) {
      return res.status(403).json({ error: 'Apenas a logística (ou admin) pode remover cotações.' });
    }
    if (!cotacoesPodemSerGerenciadas(sol)) {
      return res.status(400).json({ error: 'As cotações só podem ser alteradas antes da aprovação financeira.' });
    }
    const { error } = await supabase
      .from('solicitacao_cotacoes').delete().eq('id', req.params.cotacaoId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[SOLICITACOES] remover-cotacao:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao remover cotação' });
  }
});


router.post('/:id/cotacoes/:cotacaoId/sugerir', async (req, res) => {
  try {
    const { data: sol } = await supabase
      .from('solicitacoes').select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!sol) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    if (!(await podeCotar(req, sol))) {
      return res.status(403).json({ error: 'Apenas a logística (ou admin) pode marcar a cotação sugerida.' });
    }
    if (!cotacoesPodemSerGerenciadas(sol)) {
      return res.status(400).json({ error: 'As cotações só podem ser alteradas antes da aprovação financeira.' });
    }

    const { error: e1 } = await supabase
      .from('solicitacao_cotacoes').update({ sugerida: false })
      .eq('solicitacao_id', req.params.id).eq('sugerida', true);
    if (e1) throw e1;
    const { data, error } = await supabase
      .from('solicitacao_cotacoes').update({ sugerida: true })
      .eq('id', req.params.cotacaoId).eq('solicitacao_id', req.params.id).select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[SOLICITACOES] sugerir-cotacao:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao marcar cotação sugerida' });
  }
});



function montarHtmlCotacoes({ sol, cotacoes, itens, refCot, solicitanteNome, catLabel, link }) {
  const total = cotacoes.reduce((s, c) => s + (Number(c.valor) || 0), 0);
  const dataNec = sol.data_necessaria
    ? new Date(sol.data_necessaria).toLocaleDateString('pt-BR')
    : null;

  const linhasCot = cotacoes.map(c => {
    const eSug = !!c.sugerida;
    const fw = eSug ? 'font-weight:700;' : '';
    const bg = eSug ? 'background:#e8faf6;' : '';
    const estrela = eSug ? '★ ' : '';






    const temAnexo = !!c.anexo_url;
    const linkHtml = c.link
      ? `<a href="${escapeHtmlCot(c.link)}" style="color:#00857a">abrir</a>`
      : '<span style="color:#bbb">—</span>';
    const anexoHtml = temAnexo
      ? '<span style="color:#00857a">✓ no sistema</span>'
      : '<span style="color:#bbb">—</span>';
    const obs = c.observacao
      ? `<div style="color:#666;font-size:12px;margin-top:2px">${escapeHtmlCot(c.observacao)}</div>` : '';
    return `<tr style="${bg}">
      <td style="padding:8px 10px;border-bottom:1px solid #eee;${fw}">${estrela}${escapeHtmlCot(c.fornecedor)}${obs}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;${fw}">${fmtBRLServer(c.valor)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;">${escapeHtmlCot(c.prazo || '—')}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;">${linkHtml}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;">${anexoHtml}</td>
    </tr>`;
  }).join('');

  const itensHtml = (itens && itens.length)
    ? `<p style="margin:20px 0 6px;font-weight:700;color:#1a1a1a">Itens do pedido</p>
       <table style="border-collapse:collapse;width:100%;font-size:13px">
         <thead><tr style="background:#f5f5f5;text-align:left">
           <th style="padding:6px 10px">Item</th>
           <th style="padding:6px 10px;text-align:right">Qtd</th>
         </tr></thead>
         <tbody>${itens.map(it => `<tr>
           <td style="padding:6px 10px;border-bottom:1px solid #eee">${escapeHtmlCot(it.descricao)}</td>
           <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${escapeHtmlCot(it.quantidade)} ${escapeHtmlCot(it.unidade || '')}</td>
         </tr>`).join('')}</tbody>
       </table>` : '';

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.5;max-width:640px">
    <h2 style="margin:0 0 4px;font-size:18px;color:#00857a">Cotações para aprovação</h2>
    <p style="margin:0 0 16px;color:#666">${escapeHtmlCot(sol.titulo || 'Solicitação')}</p>

    <table style="border-collapse:collapse;width:100%;font-size:13px;margin-bottom:8px">
      <tbody>
        <tr><td style="padding:3px 0;color:#888;width:130px">Solicitante</td><td style="padding:3px 0">${escapeHtmlCot(solicitanteNome || '—')}</td></tr>
        <tr><td style="padding:3px 0;color:#888">Categoria</td><td style="padding:3px 0">${escapeHtmlCot(catLabel || sol.categoria || '—')}</td></tr>
        ${dataNec ? `<tr><td style="padding:3px 0;color:#888">Data necessária</td><td style="padding:3px 0">${dataNec}</td></tr>` : ''}
      </tbody>
    </table>

    <p style="margin:16px 0 6px;font-weight:700">Cotações (${cotacoes.length})</p>
    <table style="border-collapse:collapse;width:100%;font-size:13px">
      <thead><tr style="background:#f5f5f5;text-align:left">
        <th style="padding:8px 10px">Fornecedor</th>
        <th style="padding:8px 10px;text-align:right">Valor</th>
        <th style="padding:8px 10px">Prazo</th>
        <th style="padding:8px 10px">Link</th>
        <th style="padding:8px 10px">Orçamento</th>
      </tr></thead>
      <tbody>${linhasCot}</tbody>
    </table>

    <p style="margin:12px 0 0;font-size:13px;color:#444">
      ${refCot ? `<strong>Sugerida:</strong> ${escapeHtmlCot(refCot.fornecedor)} — ${fmtBRLServer(refCot.valor)}<br/>` : ''}
      <span style="color:#888">Soma de todas as cotações listadas:</span> ${fmtBRLServer(total)}
    </p>

    ${itensHtml}

    ${link ? `<p style="margin:22px 0 8px"><a href="${escapeHtmlCot(link)}" style="background:#00B39D;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">Abrir no sistema</a></p>` : ''}
    <p style="margin:16px 0 0;color:#999;font-size:12px">Mensagem automática do sistema CBRio · módulo de Solicitações.</p>
  </div>`;
}


router.post('/:id/enviar-cotacoes-financeiro', async (req, res) => {
  try {
    const { data: sol, error: getErr } = await supabase
      .from('solicitacoes').select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (getErr) throw getErr;
    if (!sol) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    if (!(await podeCotar(req, sol))) {
      return res.status(403).json({ error: 'Apenas a logística (ou admin) pode enviar as cotações.' });
    }
    if (!cotacoesPodemSerGerenciadas(sol)) {
      return res.status(400).json({ error: 'As cotações só podem ser enviadas antes da aprovação financeira.' });
    }

    let { data: cotacoes, error: cotErr } = await supabase
      .from('solicitacao_cotacoes').select('*')
      .eq('solicitacao_id', sol.id)
      .order('ordem', { ascending: true }).order('created_at', { ascending: true });
    if (cotErr) throw cotErr;




    if (!cotacoes || !cotacoes.length) {
      const vInline = Number(req.body?.valor);
      if (req.body?.valor != null && req.body?.valor !== '' && Number.isFinite(vInline) && vInline >= 0) {
        const { data: nova, error: novaErr } = await supabase
          .from('solicitacao_cotacoes')
          .insert({
            solicitacao_id: sol.id,
            fornecedor: (req.body.fornecedor || '').trim() || 'Não informado',
            valor: vInline,
            prazo: (req.body.prazo || '').trim() || null,
            link: (req.body.link || '').trim() || null,
            observacao: (req.body.observacao || '').trim() || null,
            ordem: 0,
            created_by: req.user.userId,
          })
          .select('*').single();
        if (novaErr) throw novaErr;
        cotacoes = [nova];
      }
    }
    if (!cotacoes || !cotacoes.length) {
      return res.status(400).json({ error: 'Informe o valor da cotação para enviar ao financeiro.' });
    }


    const refCot = cotacoes.find(c => c.sugerida)
      || [...cotacoes].sort((a, b) => (Number(a.valor) || 0) - (Number(b.valor) || 0))[0];


    const planoId = req.body?.plano_contas_id || null;
    const centroId = req.body?.centro_custo_id || null;
    if (planoId) {
      const { data: plano } = await supabase.from('fin_plano_contas')
        .select('tipo, aceita_lancamento, ativo').eq('id', planoId).maybeSingle();
      if (!plano || plano.tipo !== 'despesa' || !plano.aceita_lancamento || plano.ativo === false) {
        return res.status(400).json({ error: 'Plano de contas inválido (precisa ser uma conta de despesa que aceita lançamento).' });
      }
    }









    const decisao = decidirDestinoCotacao({
      categoria: sol.categoria,
      valorCotado: refCot.valor,
      forcarFinanceiro: req.body?.forcar_financeiro === true || sol.status !== 'em_cotacao',
    });
    const vaiExecutarDireto = decisao.destino === DESTINO_COMPRA_DIRETA;


    const updates = {
      valor_cotado: Number(refCot.valor),
      valor_estimado: Number(refCot.valor),
      precisa_aprovacao_financeira: !vaiExecutarDireto,
      cotacao_fornecedor: refCot.fornecedor || null,
      cotacao_observacao: refCot.observacao || null,
      cotacao_em: new Date().toISOString(),
      cotacao_por: req.user.userId,
      cotacoes_email_em: new Date().toISOString(),
      cotacoes_email_por: req.user.userId,
    };
    if (planoId) updates.plano_contas_id = planoId;
    if (centroId) updates.centro_custo_id = centroId;
    if (vaiExecutarDireto) {



      updates.status = 'pendente';
      updates.area_responsavel = 'logistica_compras';
      updates.forma_pagamento = 'cartao_credito';
      updates.financeiro_dispensado_em = new Date().toISOString();
      updates.financeiro_dispensa_motivo = motivoDispensaTexto(decisao.limite);
      updates.financeiro_dispensa_limite = decisao.limite;
    } else if (sol.status === 'em_cotacao') {

      updates.status = 'aguardando_aprovacao_financeira';
    }

    const aplicar = (payload) => supabase
      .from('solicitacoes')
      .update(payload)
      .eq('id', sol.id)
      .in('status', ['em_cotacao', 'aguardando_aprovacao_financeira'])
      .is('aprovado_financeiro_em', null)
      .is('deleted_at', null)
      .select('*')
      .maybeSingle();

    let { data: solAtualizada, error: upErr } = await aplicar(updates);






    let dispensaIndisponivel = false;
    if (upErr && vaiExecutarDireto && /financeiro_dispensa|42703|PGRST204|schema cache/i.test(upErr.message || '')) {
      console.warn('[SOLICITACOES] dispensa financeira indisponível (migration 20260812210000 ausente):', upErr.message);
      dispensaIndisponivel = true;
      const semDispensa = { ...updates };
      delete semDispensa.financeiro_dispensado_em;
      delete semDispensa.financeiro_dispensa_motivo;
      delete semDispensa.financeiro_dispensa_limite;
      semDispensa.precisa_aprovacao_financeira = true;
      semDispensa.status = sol.status === 'em_cotacao' ? 'aguardando_aprovacao_financeira' : sol.status;
      delete semDispensa.area_responsavel;
      delete semDispensa.forma_pagamento;
      ({ data: solAtualizada, error: upErr } = await aplicar(semDispensa));
    }
    if (upErr) throw upErr;
    if (!solAtualizada) {
      return res.status(409).json({ error: 'Esta solicitação foi alterada por outra pessoa. Atualize antes de reenviar as cotações.' });
    }
    const executouDireto = vaiExecutarDireto && !dispensaIndisponivel;


    const { data: itens } = await supabase
      .from('solicitacao_itens').select('descricao, quantidade, unidade, ordem')
      .eq('solicitacao_id', sol.id).order('ordem', { ascending: true });


    let solicitanteNome = null;
    if (sol.solicitante_id) {
      const { data: prof } = await supabase
        .from('profiles').select('name').eq('id', sol.solicitante_id).maybeSingle();
      solicitanteNome = prof?.name || null;
    }



    const finProfileIds = new Set();
    const { data: respFin } = await supabase
      .from('area_solicitacoes_responsaveis').select('profile_id').eq('area', 'financeiro');
    (respFin || []).forEach(r => r.profile_id && finProfileIds.add(r.profile_id));
    const resolvidos = await resolverDestinatarios('financeiro').catch(() => []);
    (resolvidos || []).forEach(id => id && finProfileIds.add(id));

    const idsArr = await filtrarAprovadoresFinanceirosPorCategoria(finProfileIds, sol.categoria);
    let emails = [];
    if (idsArr.length) {
      const { data: profs } = await supabase.from('profiles').select('email').in('id', idsArr);
      emails = (profs || []).map(p => p.email);
    }

    let remetenteEmail = null;
    if (req.user.userId) {
      const { data: me } = await supabase.from('profiles').select('email').eq('id', req.user.userId).maybeSingle();
      remetenteEmail = me?.email || null;
    }
    const to = [...new Set([...emails, remetenteEmail].filter(e => e && /@/.test(e)))];

    const catLabel = ({ compras: 'Compras', servico: 'Serviço' })[sol.categoria] || sol.categoria;
    const base = process.env.FRONTEND_URL || '';
    const link = base ? `${base}${linkFilaFinanceira(sol.id)}` : '';
    const html = montarHtmlCotacoes({ sol, cotacoes, itens, refCot, solicitanteNome, catLabel, link });








    const querEmail = req.body?.enviar_email === true && !executouDireto;
    let emailResultado = { ok: false, error: 'nao_solicitado' };
    if (querEmail && to.length) {
      emailResultado = await enviarEmail({
        to,
        subject: `Cotações para aprovação — ${sol.titulo || 'Solicitação'}`,
        html,
      }).catch(e => ({ ok: false, error: e.message }));
    }






    notificar({
      modulo: 'financeiro',
      tipo: 'cotacao_financeiro',
      titulo: executouDireto
        ? 'Compra liberada sem aprovação financeira'
        : 'Cotações prontas para aprovação',
      mensagem: executouDireto
        ? `"${sol.titulo}" · ${fmtBRLServer(refCot.valor)} (${refCot.fornecedor}) · dentro do limite de ${fmtBRLServer(decisao.limite)}, a logística executa direto. Você não precisa aprovar — este aviso é só pra você saber do gasto.`
        : `${cotacoes.length} ${cotacoes.length === 1 ? 'cotação' : 'cotações'} de "${sol.titulo}" · sugerida ${fmtBRLServer(refCot.valor)} (${refCot.fornecedor}).`,
      link: linkFilaFinanceira(sol.id),
      severidade: 'info',
      chaveDedup: `solicitacao_cotacoes_${sol.id}`,
      targetIds: idsArr,
      email: false,
    }).catch(err => console.error('[SOLICITACOES] notify cotacoes:', err.message));

    if (executouDireto) {



      registrarEvento(solAtualizada.id, {
        statusAnterior: 'em_cotacao',
        statusNovo: 'pendente',
        atorId: req.user.userId,
        observacao: `${motivoDispensaTexto(decisao.limite)} · cotado ${fmtBRLServer(refCot.valor)}`,
      });

      notificar({
        modulo: CATEGORIA_MODULO[sol.categoria] || 'logistica',
        tipo: 'solicitacao_status',
        titulo: `Liberado pra compra: ${sol.titulo}`,
        mensagem: `Cotado em ${fmtBRLServer(refCot.valor)} · dentro do limite de ${fmtBRLServer(decisao.limite)}, então a logística compra direto, sem passar pelo financeiro.`,
        link: '/solicitacoes',
        severidade: 'info',
        chaveDedup: `solicitacao_compra_direta_${sol.id}`,
        extraTargetIds: [sol.solicitante_id].filter(Boolean),
      }).catch(err => console.error('[SOLICITACOES] notify compra direta:', err.message));

      return res.json({
        ok: true,
        destino: 'compra_direta',
        limite: decisao.limite,
        email_solicitado: false,
        solicitacao: solAtualizada,
      });
    }


    if (!querEmail) {
      return res.json({
        ok: true,
        destino: 'financeiro',
        motivo_destino: decisao.motivo,
        dispensa_indisponivel: dispensaIndisponivel || undefined,
        email_solicitado: false,
        solicitacao: solAtualizada,
      });
    }
    if (!to.length) {
      return res.json({
        ok: true, email_solicitado: true, email_ok: false, enviados: 0,
        motivo: 'Nenhum e-mail de financeiro encontrado.',
        solicitacao: solAtualizada,
      });
    }
    if (!emailResultado?.ok) {
      return res.json({
        ok: true, email_solicitado: true, email_ok: false, enviados: to.length,
        motivo: emailResultado?.error || 'Falha no envio do e-mail.',
        solicitacao: solAtualizada,
      });
    }
    res.json({ ok: true, email_solicitado: true, email_ok: true, enviados: to.length, solicitacao: solAtualizada });
  } catch (e) {
    console.error('[SOLICITACOES] enviar-cotacoes-financeiro:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao enviar cotações ao financeiro' });
  }
});




async function rejeitarOrigemHandler(req, res) {
  try {
    const userId = req.user.userId;
    const userName = req.user.name;
    const isSuperAdmin = await isAdminFallback(req);
    const { motivo } = req.body || {};
    if (!motivo || !motivo.trim()) {
      return res.status(400).json({ error: 'Motivo da rejeição é obrigatório.' });
    }

    const { data: atual } = await supabase
      .from('solicitacoes')
      .select('*')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!atual) return res.status(404).json({ error: 'Solicitação não encontrada.' });

    const origemPendente = ['pendente', 'triagem'].includes(atual.aprovacao_origem_status);
    const gestaoPendente = atual.aprovacao_gestao_status === 'pendente';
    if (!origemPendente && !gestaoPendente) {
      return res.status(400).json({ error: 'Solicitação não está pendente de aprovação.' });
    }

    const isDiretorAlvo = origemPendente && atual.aprovacao_origem_diretor_id === userId;
    const isCoaprovador = origemPendente && !isDiretorAlvo && await podeAprovarOrigem(userId, atual);
    const podeOrigem = origemPendente && (isDiretorAlvo || isCoaprovador || isSuperAdmin);
    let ehAprovadorGestao = false;
    if (gestaoPendente) {
      const gestaoIds = await aprovadoresGestaoIds(atual.categoria);
      ehAprovadorGestao = gestaoIds.includes(userId);
    }
    const podeGestao = gestaoPendente && (ehAprovadorGestao || isSuperAdmin);
    if (!podeOrigem && !podeGestao) {
      return res.status(403).json({ error: 'Apenas o diretor de origem, um co-aprovador do setor ou o 2º aprovador pode rejeitar esta solicitação.' });
    }

    const carimbo = podeOrigem ? 'origem' : 'gestao';
    const agoraIso = new Date().toISOString();
    const update = { status: 'rejeitado' };
    if (carimbo === 'origem') {
      update.aprovacao_origem_status = 'rejeitada';
      update.aprovacao_origem_em = agoraIso;
      update.aprovacao_origem_motivo = motivo.trim();
      if (!isDiretorAlvo && isSuperAdmin && !isCoaprovador) {
        update.aprovacao_origem_diretor_id = userId;
      }
    } else {
      update.aprovacao_gestao_status = 'rejeitada';
      update.aprovacao_gestao_por = userId;
      update.aprovacao_gestao_em = agoraIso;
      update.aprovacao_gestao_motivo = motivo.trim();
    }

    const { data, error } = await supabase
      .from('solicitacoes')
      .update(update)
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;

    await registrarEvento(data.id, {
      statusAnterior: atual.status,
      statusNovo: 'rejeitado',
      atorId: userId,
      observacao: carimbo === 'gestao'
        ? `Rejeitada pela diretoria de Gestão: ${motivo.trim()}`
        : `Rejeitada na origem: ${motivo.trim()}`,
    });

    const modulo = CATEGORIA_MODULO[data.categoria] || 'administrativo';
    notificar({
      modulo,
      tipo: 'solicitacao_status',
      titulo: `Rejeitada: ${data.titulo}`,
      mensagem: `${userName || 'Diretor'} rejeitou: ${motivo.trim()}`,
      link: '/solicitacoes',
      severidade: 'alta',
      chaveDedup: `solicitacao_rejeitada_origem_${data.id}`,
      targetIds: [data.solicitante_id].filter(Boolean),
    }).catch(err => console.error('[SOLICITACOES] notify rejeitar:', err.message));

    res.json(data);
  } catch (e) {
    console.error('[SOLICITACOES] rejeitar-origem:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao rejeitar solicitação' });
  }
}
router.patch('/:id/rejeitar-origem', rejeitarOrigemHandler);



function normalizarItensCompra(itens_lista) {
  const itensNorm = (Array.isArray(itens_lista) ? itens_lista : [])
    .filter(it => it && String(it.descricao || '').trim())
    .map((it, i) => {
      const qNum = Number(it.quantidade);
      const quantidade = isFinite(qNum) && qNum > 0 ? qNum : 1;
      const vNum = Number(it.valor_estimado);
      const temValor = it.valor_estimado != null && it.valor_estimado !== '' && isFinite(vNum);
      const valorLinha = temValor ? (it.valor_tipo === 'unitario' ? vNum * quantidade : vNum) : null;
      return {
        descricao: String(it.descricao).trim().slice(0, 500),
        quantidade,
        unidade: it.unidade ? String(it.unidade).trim().slice(0, 20) : 'un',
        link_referencia: it.link_referencia ? String(it.link_referencia).trim().slice(0, 1000) : null,
        valor_estimado: valorLinha,
        imagem_url: it.imagem_url ? String(it.imagem_url).slice(0, 2000) : null,
        ordem: i,
      };
    });
  const itensTexto = itensNorm.map(it => `${it.quantidade}x ${it.descricao}`).join('\n');
  const valorTotal = itensNorm.reduce((acc, it) => acc + (it.valor_estimado != null ? it.valor_estimado : 0), 0);
  return { itensNorm, itensTexto, valorTotal };
}





router.post('/:id/converter-em-compra', async (req, res) => {
  try {
    const { data: sol } = await supabase.from('solicitacoes')
      .select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!sol) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    if (!(await podeGerirSolicitacao(req, sol))) {
      return res.status(403).json({ error: 'Você não pode converter esta solicitação.' });
    }
    if (!CRIATIVO_CATEGORIAS.includes(sol.categoria)) {
      return res.status(400).json({ error: 'Só um pedido de marketing/produção pode virar compra.' });
    }
    if (['concluido', 'cancelado', 'rejeitado', 'avaliado'].includes(sol.status)) {
      return res.status(400).json({ error: 'Este pedido já está encerrado.' });
    }

    const { itens_lista, favorecido_nome, eh_planejado, data_necessaria, justificativa } = req.body || {};
    const { itensNorm, itensTexto, valorTotal } = normalizarItensCompra(itens_lista);
    if (!itensNorm.length) return res.status(400).json({ error: 'Adicione ao menos um item da compra.' });

    const planejado = eh_planejado === true || eh_planejado === 'true';

    const precisaMeritoConv = planejado ? valorTotal > 5000 : valorTotal > 1000;
    const now = new Date().toISOString();

    const updates = {
      categoria: 'compras',
      area_responsavel: 'logistica_compras',
      subcategoria: 'default',
      eh_planejado: planejado,
      ...(planejado ? { planejado_por: req.user.userId } : {}),
      itens: itensTexto,
      valor_estimado: valorTotal,

      precisa_aprovacao_financeira: true,
      aprovacao_gestao_status: 'dispensada',
      aprovacao_gestao_em: now,
      aprovacao_gestao_motivo: 'Compra convertida de um pedido de marketing (origem já aprovada no Criativo).',
      status: precisaMeritoConv ? 'aguardando_merito' : 'em_cotacao',
      ...(precisaMeritoConv ? { merito_status: 'pendente', merito_em: now } : {}),
    };
    if (favorecido_nome) updates.favorecido_nome = String(favorecido_nome).trim().slice(0, 200);
    if (data_necessaria) updates.data_necessaria = data_necessaria;
    if (justificativa) {
      updates.justificativa = sol.justificativa
        ? `${sol.justificativa}\n[Virou compra] ${justificativa}`
        : String(justificativa).slice(0, 2000);
    }

    const { data, error } = await supabase.from('solicitacoes')
      .update(updates).eq('id', sol.id).is('deleted_at', null).select('*').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(409).json({ error: 'Solicitação alterada por outra pessoa. Recarregue.' });


    try {
      await supabase.from('solicitacao_itens')
        .insert(itensNorm.map(it => ({ ...it, solicitacao_id: sol.id })));
    } catch (e) { console.error('[SOLICITACOES] converter itens:', e.message); }



    try {
      await supabase.from('marketing_campanhas')
        .update({ status: 'concluida' })
        .eq('solicitacao_id', sol.id).neq('status', 'concluida');
    } catch (e) { console.error('[SOLICITACOES] fechar campanha:', e.message); }


    notificar({
      modulo: 'logistica',
      tipo: 'solicitacao_status',
      titulo: `Compra vinda do marketing: ${sol.titulo}`,
      mensagem: `Um pedido de marketing virou compra${precisaMeritoConv ? ' (aguardando o Pastor Presidente)' : ' e já está pronto pra cotação'}.`,
      link: '/solicitacoes',
      severidade: 'info',
      chaveDedup: `solicitacao_virou_compra_${sol.id}`,
      extraTargetIds: [sol.solicitante_id].filter(Boolean),
    }).catch(err => console.error('[SOLICITACOES] notify converter:', err.message));

    res.json(data);
  } catch (e) {
    console.error('[SOLICITACOES] converter-em-compra:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao converter em compra' });
  }
});



function _fakeRes() {
  const r = { statusCode: 200, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}
async function aprovarOrigemInterno({ solicitacaoId, aprovadorId, aprovadorNome, aprovadorEmail }) {
  const req = { params: { id: solicitacaoId }, body: {}, user: { userId: aprovadorId, name: aprovadorNome || null, email: aprovadorEmail || '', role: 'assistente' } };
  const res = _fakeRes();
  await aprovarOrigemHandler(req, res);
  return { ok: res.statusCode < 400, status: res.statusCode, data: res.body };
}
async function rejeitarOrigemInterno({ solicitacaoId, aprovadorId, aprovadorNome, aprovadorEmail, motivo }) {
  const req = { params: { id: solicitacaoId }, body: { motivo: motivo || 'Rejeitada pelo WhatsApp' }, user: { userId: aprovadorId, name: aprovadorNome || null, email: aprovadorEmail || '', role: 'assistente' } };
  const res = _fakeRes();
  await rejeitarOrigemHandler(req, res);
  return { ok: res.statusCode < 400, status: res.statusCode, data: res.body };
}







async function podeJulgarMerito(req) {
  const ids = await aprovadoresMeritoIds();
  if (ids.includes(req.user.userId)) return true;
  return isAdminFallback(req);
}

async function aprovarMeritoHandler(req, res) {
  try {
    const userId = req.user.userId;
    const userName = req.user.name;
    if (!(await podeJulgarMerito(req))) {
      return res.status(403).json({ error: 'Apenas o aprovador de mérito pode julgar esta solicitação.' });
    }

    const { data: atual } = await supabase
      .from('solicitacoes')
      .select('*')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!atual) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    if (atual.status !== 'aguardando_merito') {
      return res.status(400).json({ error: 'Solicitação não está aguardando julgamento de mérito.' });
    }




    const { data, error } = await supabase
      .from('solicitacoes')
      .update({
        merito_status: 'aprovado',
        merito_por: userId,
        merito_em: new Date().toISOString(),
        status: proximoStatusPosAprovacao(atual),
      })
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;

    await registrarEvento(data.id, {
      statusAnterior: atual.status,
      statusNovo: data.status,
      atorId: userId,
      observacao: `Mérito aprovado por ${userName || 'aprovador de mérito'}`,
    });

    const modulo = CATEGORIA_MODULO[data.categoria] || 'administrativo';
    const destinoLabel = {
      em_cotacao: 'cotação na logística (valor e fornecedor) antes do financeiro',
      aguardando_aprovacao_financeira: 'aprovação financeira',
      pendente: `a fila ${data.area_responsavel || 'da área responsável'}`,
    }[data.status] || 'a próxima etapa do fluxo';
    notificar({
      modulo,
      tipo: 'solicitacao_status',
      titulo: `Mérito aprovado: ${data.titulo}`,
      mensagem: `${userName || 'O aprovador de mérito'} aprovou o mérito · seu pedido seguiu para ${destinoLabel}.`,
      link: '/solicitacoes',
      severidade: 'info',
      chaveDedup: `solicitacao_merito_aprovado_${data.id}`,
      targetIds: [data.solicitante_id].filter(Boolean),
    }).catch(err => console.error('[SOLICITACOES] notify merito aprovado:', err.message));


    if (data.area_responsavel) {
      resolverDestinatarios(modulo).then(managers => {
        const filtered = managers.filter(id => id !== data.solicitante_id);
        if (filtered.length) {
          notificar({
            modulo,
            tipo: 'solicitacao',
            titulo: data.status === 'em_cotacao' ? `Cotar: ${data.titulo}` : `Nova na fila: ${data.titulo}`,
            mensagem: data.status === 'em_cotacao'
              ? 'Mérito aprovado · registre a cotação (valor + fornecedor) pra seguir pro financeiro.'
              : 'Mérito aprovado · pronta para a próxima etapa.',
            link: '/solicitacoes',
            severidade: 'info',
            chaveDedup: `solicitacao_pos_merito_${data.id}`,
            targetIds: filtered,
          }).catch(err => console.error('[SOLICITACOES] notify pos-merito:', err.message));
        }
      }).catch(err => console.error('[SOLICITACOES] resolve managers merito:', err.message));
    }

    notificarPedidoWhatsapp(data.id, 'mérito aprovado', null);
    res.json(data);
  } catch (e) {
    console.error('[SOLICITACOES] aprovar-merito:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao aprovar o mérito' });
  }
}
router.post('/:id/aprovar-merito', aprovarMeritoHandler);



async function reprovarMeritoHandler(req, res) {
  try {
    const userId = req.user.userId;
    const userName = req.user.name;
    if (!(await podeJulgarMerito(req))) {
      return res.status(403).json({ error: 'Apenas o aprovador de mérito pode julgar esta solicitação.' });
    }
    const { motivo } = req.body || {};
    if (!motivo || motivo.trim().length < 5) {
      return res.status(400).json({ error: 'Informe o motivo da reprovação (mínimo 5 caracteres).' });
    }

    const { data: atual } = await supabase
      .from('solicitacoes')
      .select('*')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!atual) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    if (atual.status !== 'aguardando_merito') {
      return res.status(400).json({ error: 'Solicitação não está aguardando julgamento de mérito.' });
    }

    const { data, error } = await supabase
      .from('solicitacoes')
      .update({
        merito_status: 'rejeitado',
        merito_por: userId,
        merito_em: new Date().toISOString(),
        merito_motivo: motivo.trim(),
        status: 'rejeitado',
      })
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;

    await registrarEvento(data.id, {
      statusAnterior: atual.status,
      statusNovo: 'rejeitado',
      atorId: userId,
      observacao: `Mérito reprovado: ${motivo.trim()}`,
    });

    const modulo = CATEGORIA_MODULO[data.categoria] || 'administrativo';
    notificar({
      modulo,
      tipo: 'solicitacao_status',
      titulo: `Mérito reprovado: ${data.titulo}`,
      mensagem: `${userName || 'O aprovador de mérito'} reprovou o mérito: ${motivo.trim()}`,
      link: '/solicitacoes',
      severidade: 'alta',
      chaveDedup: `solicitacao_merito_reprovado_${data.id}`,
      targetIds: [data.solicitante_id].filter(Boolean),
    }).catch(err => console.error('[SOLICITACOES] notify merito reprovado:', err.message));

    notificarPedidoWhatsapp(data.id, 'mérito reprovado', motivo.trim());
    res.json(data);
  } catch (e) {
    console.error('[SOLICITACOES] reprovar-merito:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao reprovar o mérito' });
  }
}
router.post('/:id/reprovar-merito', reprovarMeritoHandler);



async function aprovarMeritoInterno({ solicitacaoId, aprovadorId, aprovadorNome, aprovadorEmail }) {
  const req = { params: { id: solicitacaoId }, body: {}, user: { userId: aprovadorId, name: aprovadorNome || null, email: aprovadorEmail || '', role: 'assistente' } };
  const res = _fakeRes();
  await aprovarMeritoHandler(req, res);
  return { ok: res.statusCode < 400, status: res.statusCode, data: res.body };
}
async function rejeitarMeritoInterno({ solicitacaoId, aprovadorId, aprovadorNome, aprovadorEmail, motivo }) {
  const req = { params: { id: solicitacaoId }, body: { motivo: motivo || 'Reprovada pelo WhatsApp' }, user: { userId: aprovadorId, name: aprovadorNome || null, email: aprovadorEmail || '', role: 'assistente' } };
  const res = _fakeRes();
  await reprovarMeritoHandler(req, res);
  return { ok: res.statusCode < 400, status: res.statusCode, data: res.body };
}









const STATUS_SOBRESTAVEL_RESP = ['pendente', 'em_analise', 'em_atendimento'];

router.post('/:id/sobrestar', async (req, res) => {
  try {
    const userId = req.user.userId;
    const userName = req.user.name;
    const { motivo, revisao } = req.body || {};
    if (!motivo || motivo.trim().length < 3) {
      return res.status(400).json({ error: 'Informe o motivo do sobrestamento (mínimo 3 caracteres).' });
    }
    if (revisao && !/^\d{4}-\d{2}-\d{2}$/.test(String(revisao))) {
      return res.status(400).json({ error: 'Data de revisão inválida (use AAAA-MM-DD).' });
    }

    const { data: atual } = await supabase
      .from('solicitacoes')
      .select('*')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!atual) return res.status(404).json({ error: 'Solicitação não encontrada.' });

    if (atual.status === 'aguardando_aprovacao_financeira') {
      if (!(await podeAprovarFinanceiro(req, atual.categoria))) {
        return res.status(403).json({ error: 'Apenas o financeiro pode sobrestar nesta etapa.' });
      }
    } else if (STATUS_SOBRESTAVEL_RESP.includes(atual.status)) {
      if (!(await podeGerirSolicitacao(req, atual))) {
        return res.status(403).json({ error: 'Apenas o responsável da área (ou admin) pode sobrestar esta solicitação.' });
      }
    } else {
      return res.status(400).json({ error: 'Esta solicitação não pode ser sobrestada neste status.' });
    }

    const agoraIso = new Date().toISOString();
    const update = {
      status: 'sobrestada',
      sobrestada_em: agoraIso,
      sobrestada_por: userId,
      sobrestada_motivo: motivo.trim(),
      sobrestada_revisao: revisao || null,
      sobrestada_status_anterior: atual.status,
    };

    if (!atual.sla_pausado_em) update.sla_pausado_em = agoraIso;

    const { data, error } = await supabase
      .from('solicitacoes')
      .update(update)
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;

    const revisaoBr = revisao ? String(revisao).split('-').reverse().join('/') : null;
    await registrarEvento(data.id, {
      statusAnterior: atual.status,
      statusNovo: 'sobrestada',
      atorId: userId,
      observacao: `Sobrestada: ${motivo.trim()}${revisaoBr ? ` · revisão em ${revisaoBr}` : ''}`,
    });

    const modulo = CATEGORIA_MODULO[data.categoria] || 'administrativo';
    notificar({
      modulo,
      tipo: 'solicitacao_status',
      titulo: `Em espera (sobrestada): ${data.titulo}`,
      mensagem: `${userName || 'A área'} colocou sua solicitação em espera: ${motivo.trim()}${revisaoBr ? ` · revisão prevista para ${revisaoBr}` : ''}. O SLA fica pausado até a retomada.`,
      link: '/solicitacoes',
      severidade: 'info',
      chaveDedup: `solicitacao_sobrestada_${data.id}_${Date.now()}`,
      targetIds: [data.solicitante_id].filter(Boolean),
    }).catch(err => console.error('[SOLICITACOES] notify sobrestar:', err.message));

    notificarPedidoWhatsapp(data.id, 'em espera (sobrestada)', motivo.trim());
    res.json(data);
  } catch (e) {
    console.error('[SOLICITACOES] sobrestar:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao sobrestar a solicitação' });
  }
});

router.post('/:id/retomar', async (req, res) => {
  try {
    const userId = req.user.userId;
    const userName = req.user.name;

    const { data: atual } = await supabase
      .from('solicitacoes')
      .select('*')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!atual) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    if (atual.status !== 'sobrestada') {
      return res.status(400).json({ error: 'Solicitação não está sobrestada.' });
    }


    if (atual.sobrestada_status_anterior === 'aguardando_aprovacao_financeira') {
      if (!(await podeAprovarFinanceiro(req, atual.categoria))) {
        return res.status(403).json({ error: 'Apenas o financeiro pode retomar nesta etapa.' });
      }
    } else if (!(await podeGerirSolicitacao(req, atual))) {
      return res.status(403).json({ error: 'Apenas o responsável da área (ou admin) pode retomar esta solicitação.' });
    }

    const statusRestaurado = atual.sobrestada_status_anterior || 'pendente';
    const update = {
      status: statusRestaurado,

      sobrestada_status_anterior: null,
      sobrestada_em: null,
      sobrestada_por: null,
      sobrestada_motivo: null,
      sobrestada_revisao: null,
      sla_pausado_em: null,
    };

    if (atual.sla_pausado_em) {
      const pausaMs = Date.now() - new Date(atual.sla_pausado_em).getTime();
      if (pausaMs > 0) {
        if (atual.sla_resposta_deadline) update.sla_resposta_deadline = new Date(new Date(atual.sla_resposta_deadline).getTime() + pausaMs).toISOString();
        if (atual.sla_resolucao_deadline) update.sla_resolucao_deadline = new Date(new Date(atual.sla_resolucao_deadline).getTime() + pausaMs).toISOString();
      }
    }

    const { data, error } = await supabase
      .from('solicitacoes')
      .update(update)
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;

    await registrarEvento(data.id, {
      statusAnterior: 'sobrestada',
      statusNovo: data.status,
      atorId: userId,
      observacao: `Retomada do sobrestamento por ${userName || 'responsável'} · SLA retomado`,
    });

    const modulo = CATEGORIA_MODULO[data.categoria] || 'administrativo';
    notificar({
      modulo,
      tipo: 'solicitacao_status',
      titulo: `Retomada: ${data.titulo}`,
      mensagem: `${userName || 'A área'} retomou sua solicitação (estava em espera) · voltou para "${String(data.status).replace(/_/g, ' ')}" e o SLA foi retomado.`,
      link: '/solicitacoes',
      severidade: 'info',
      chaveDedup: `solicitacao_retomada_${data.id}_${Date.now()}`,
      targetIds: [data.solicitante_id].filter(Boolean),
    }).catch(err => console.error('[SOLICITACOES] notify retomar:', err.message));

    notificarPedidoWhatsapp(data.id, 'retomada', null);
    res.json(data);
  } catch (e) {
    console.error('[SOLICITACOES] retomar:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao retomar a solicitação' });
  }
});


router.patch('/:id', async (req, res) => {
  try {
    const userId = req.user.userId;
    const userName = req.user.name;

    const { status, responsavel_id, observacoes,

            proposta_orcamento, proposta_cronograma,
            nps_nota, nps_comentario } = req.body;








    if (status && !STATUS_PATCH_PERMITIDOS.includes(status)) {
      return res.status(400).json({ error: `Status "${status}" não pode ser definido por aqui · use o endpoint próprio do fluxo (aprovação, mérito ou sobrestamento).` });
    }


    const { data: sol } = await supabase
      .from('solicitacoes')
      .select('id, solicitante_id, responsavel_id, area_responsavel, status, categoria, pago_em')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!sol) return res.status(404).json({ error: 'Solicitação não encontrada' });





    if (status === 'concluido' && status !== sol.status
        && conclusaoPag.CATEGORIAS_SO_CONCLUEM_PAGANDO.includes(sol.categoria) && !sol.pago_em) {
      return res.status(400).json({
        error: 'Reembolso e pagamento são concluídos registrando o pagamento no Financeiro (forma de pagamento e, se não for dinheiro, o comprovante).',
        codigo: 'concluir_pelo_pagamento',
      });
    }




    if (status && status !== sol.status
        && ['aguardando_aprovacao_origem', 'aguardando_merito', 'sobrestada', 'em_cotacao', 'aguardando_aprovacao_financeira'].includes(sol.status)) {
      return res.status(400).json({ error: 'Esta solicitação está num portão do fluxo (aprovação, cotação, mérito, financeiro ou sobrestamento) · use o endpoint próprio para movê-la.' });
    }






    if (!patchPodeMudarStatus(sol.status, status)) {
      return res.status(400).json({
        error: 'Solicitação encerrada não muda de situação. Para corrigir um pagamento, use "Corrigir"; para outro pedido, abra uma solicitação nova.',
        codigo: 'encerrada',
      });
    }

    const isAdmin = ['admin', 'diretor'].includes(req.user.role);
    const isResponsavel = sol.responsavel_id === userId;
    const isSolicitante = sol.solicitante_id === userId;
    let isAreaResp = false;
    if (!isAdmin && !isResponsavel && sol.area_responsavel) {
      const { data: respRow } = await supabase
        .from('area_solicitacoes_responsaveis')
        .select('profile_id')
        .eq('area', sol.area_responsavel)
        .eq('profile_id', userId)
        .maybeSingle();
      isAreaResp = !!respRow;
    }
    const podeGerir = isAdmin || isResponsavel || isAreaResp;
    if (!podeGerir && !isSolicitante) {
      return res.status(403).json({ error: 'Sem permissão para alterar esta solicitação' });
    }

    const update = {};

    if (podeGerir) {
      if (status) update.status = status;
      if (responsavel_id !== undefined) update.responsavel_id = responsavel_id;
      if (observacoes !== undefined) update.observacoes = observacoes;
      if (proposta_orcamento !== undefined) update.proposta_orcamento = proposta_orcamento;
      if (proposta_cronograma !== undefined) update.proposta_cronograma = proposta_cronograma;
    }

    if (nps_nota !== undefined) update.nps_nota = nps_nota;
    if (nps_comentario !== undefined) update.nps_comentario = nps_comentario;

    if (!Object.keys(update).length) return res.status(400).json({ error: 'Nada para atualizar' });

    const { data, error } = await supabase
      .from('solicitacoes')
      .update(update)
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;


    if (status && data) {
      const modulo = CATEGORIA_MODULO[data.categoria] || 'administrativo';
      const statusLabel = rotuloStatusSolicitacao(status);
      const obsNote = observacoes ? ` — "${observacoes}"` : '';


      const ehConclusao = status === 'concluido';
      const tituloSolicitante = ehConclusao
        ? `Avalie: ${data.titulo}`
        : `Solicitação atualizada: ${data.titulo}`;
      const mensagemSolicitante = ehConclusao
        ? `Sua solicitação foi concluída${obsNote}. Avalie o atendimento em 30 segundos · ajuda muito a melhorar.`
        : `Status alterado para "${statusLabel}"${obsNote}`;


      notificar({
        modulo,
        tipo: ehConclusao ? 'solicitacao_avaliar' : 'solicitacao_status',
        titulo: tituloSolicitante,
        mensagem: mensagemSolicitante,
        link: '/solicitacoes',
        severidade: status === 'rejeitado' ? 'alta' : 'info',
        chaveDedup: `solicitacao_status_${data.id}_${status}`,
        targetIds: [data.solicitante_id],
      }).catch(err => console.error('[SOLICITACOES] notify solicitante error:', err.message));


      notificarPedidoWhatsapp(data.id, statusLabel, observacoes);


      resolverDestinatarios(modulo).then(managers => {
        const filtered = managers.filter(id => id !== data.solicitante_id);
        if (filtered.length) {
          notificar({
            modulo,
            tipo: 'solicitacao_status',
            titulo: `Solicitação atualizada: ${data.titulo}`,
            mensagem: `Status alterado para "${statusLabel}" por ${userName || 'usuário'}${obsNote}`,
            link: '/solicitacoes',
            severidade: 'info',
            chaveDedup: `solicitacao_status_mgr_${data.id}_${status}`,
            targetIds: filtered,
          }).catch(err => console.error('[SOLICITACOES] notify managers error:', err.message));
        }
      }).catch(err => console.error('[SOLICITACOES] resolve managers error:', err.message));
    }

    res.json(data);
  } catch (e) {
    console.error('[SOLICITACOES] update error:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar solicitação' });
  }
});







router.get('/:id/timeline', async (req, res) => {
  try {
    const [{ data: eventos }, { data: ajustes }] = await Promise.all([
      supabase.from('solicitacoes_eventos').select('*').eq('solicitacao_id', req.params.id).order('created_at', { ascending: true }),
      supabase.from('solicitacao_ajustes').select('*').eq('solicitacao_id', req.params.id).order('created_at', { ascending: true }),
    ]);
    const ids = [...new Set([
      ...(eventos || []).map(e => e.ator_id),
      ...(ajustes || []).map(a => a.autor_id),
    ].filter(Boolean))];
    let nomes = {};
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('id, name').in('id', ids);
      nomes = Object.fromEntries((profs || []).map(p => [p.id, p.name]));
    }
    const linha = [
      ...(eventos || []).map(e => ({ tipo: 'evento', em: e.created_at, status_anterior: e.status_anterior, status_novo: e.status_novo, ator: nomes[e.ator_id] || null, observacao: e.observacao })),
      ...(ajustes || []).map(a => ({ tipo: 'ajuste', em: a.created_at, lado: a.lado, motivo: a.motivo, comentario: a.comentario, ator: nomes[a.autor_id] || null, alteracoes: a.alteracoes || null })),
    ].sort((x, y) => new Date(x.em).getTime() - new Date(y.em).getTime());
    res.json(linha);
  } catch (e) {
    console.error('[SOLICITACOES] timeline:', e.message);
    res.status(500).json({ error: e.message });
  }
});





router.post('/:id/relatar-problema', async (req, res) => {
  try {
    const userId = req.user.userId;
    const userName = req.user.name;
    const { motivo, comentario } = req.body || {};
    if (!['descricao', 'escopo', 'data', 'cancelamento'].includes(motivo)) {
      return res.status(400).json({ error: 'Motivo inválido.' });
    }


    if (motivo !== 'cancelamento' && (!comentario || comentario.trim().length < 3)) {
      return res.status(400).json({ error: 'Descreva o problema (mínimo 3 caracteres).' });
    }

    const { data: sol } = await supabase
      .from('solicitacoes')
      .select('id, solicitante_id, responsavel_id, area_responsavel, categoria, titulo, status, vezes_refeita, aprovacao_origem_status')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!sol) return res.status(404).json({ error: 'Solicitação não encontrada.' });

    const isAdmin = ['admin', 'diretor'].includes(req.user.role);
    const isSolic = sol.solicitante_id === userId;
    const isResp = sol.responsavel_id === userId;
    let isAreaResp = false;
    if (!isAdmin && !isResp && sol.area_responsavel) {
      const { data: rr } = await supabase.from('area_solicitacoes_responsaveis')
        .select('profile_id').eq('area', sol.area_responsavel).eq('profile_id', userId).maybeSingle();
      isAreaResp = !!rr;
    }
    const podeGerir = isAdmin || isResp || isAreaResp;
    if (!isSolic && !podeGerir) return res.status(403).json({ error: 'Sem permissão.' });
    if (estaEncerrada(sol.status)) {
      return res.status(400).json({ error: 'Solicitação já encerrada · não é possível relatar problema.' });
    }


    if (sol.status === 'sobrestada') {
      return res.status(400).json({ error: 'Esta solicitação está sobrestada (em espera) · retome-a antes de relatar problema.' });
    }
    if (sol.status === 'aguardando_merito') {
      return res.status(400).json({ error: 'Esta solicitação aguarda o julgamento de mérito · o ajuste/devolução só vale depois da decisão.' });
    }




    if (sol.status === 'aguardando_aprovacao_origem' || ['pendente', 'triagem'].includes(sol.aprovacao_origem_status)) {
      return res.status(400).json({ error: 'Esta solicitação ainda aguarda a aprovação do diretor de origem · o ajuste/devolução só vale depois que ela for aprovada.' });
    }


    if (sol.status === 'aguardando_ajuste' && motivo !== 'cancelamento') {


      return res.status(400).json({
        error: isSolic
          ? 'Já está aguardando ajuste · edite e reenvie (ou cancele).'
          : 'Já está aguardando ajuste do solicitante. Se o pedido de ajuste foi engano, use "Retirar pedido de ajuste".',
      });
    }

    const lado = isSolic ? 'solicitante' : 'responsavel';
    await supabase.from('solicitacao_ajustes').insert({
      solicitacao_id: sol.id, autor_id: userId, lado, motivo, comentario: comentario || null,
    });

    const modulo = CATEGORIA_MODULO[sol.categoria] || 'administrativo';

    if (motivo === 'cancelamento') {
      const { data, error } = await supabase.from('solicitacoes')
        .update({ status: 'cancelado' }).eq('id', sol.id).select('*').single();
      if (error) throw error;
      notificar({
        modulo, tipo: 'solicitacao_status',
        titulo: `Cancelada: ${sol.titulo}`,
        mensagem: `${userName || 'Usuário'} cancelou a solicitação${comentario ? ` · ${comentario}` : ''}.`,
        link: '/solicitacoes', severidade: 'info',
        chaveDedup: `solicitacao_cancelada_${sol.id}`,
        ...(lado === 'responsavel' ? { targetIds: [sol.solicitante_id].filter(Boolean) } : {}),
      }).catch(err => console.error('[SOLICITACOES] notify cancelar:', err.message));
      return res.json(data);
    }

    const update = {
      status: 'aguardando_ajuste',
      status_antes_ajuste: sol.status,
      sla_pausado_em: new Date().toISOString(),
      vezes_refeita: (sol.vezes_refeita || 0) + 1,
    };
    const { data, error } = await supabase.from('solicitacoes')
      .update(update).eq('id', sol.id).select('*').single();
    if (error) throw error;

    const MOTIVO_LABEL = { descricao: 'descrição', escopo: 'escopo', data: 'data' };
    if (lado === 'responsavel') {
      notificar({
        modulo, tipo: 'solicitacao_status',
        titulo: `Sua solicitação voltou para ajuste: ${sol.titulo}`,
        mensagem: `${userName || 'A área'} pediu ajuste em ${MOTIVO_LABEL[motivo]}${comentario ? `: ${comentario}` : ''}. Edite e reenvie.`,
        link: '/solicitacoes', severidade: 'alta',
        chaveDedup: `solicitacao_devolvida_${sol.id}_${new Date(update.sla_pausado_em).getTime()}`,
        targetIds: [sol.solicitante_id].filter(Boolean),
      }).catch(err => console.error('[SOLICITACOES] notify devolucao:', err.message));
    } else {
      notificar({
        modulo, tipo: 'solicitacao_status',
        titulo: `Solicitante vai ajustar: ${sol.titulo}`,
        mensagem: `${userName || 'O solicitante'} sinalizou ajuste em ${MOTIVO_LABEL[motivo]}${comentario ? `: ${comentario}` : ''}. O SLA fica pausado até o reenvio.`,
        link: '/solicitacoes', severidade: 'info',
        chaveDedup: `solicitacao_ajuste_solic_${sol.id}_${new Date(update.sla_pausado_em).getTime()}`,
      }).catch(err => console.error('[SOLICITACOES] notify ajuste:', err.message));
    }
    res.json(data);
  } catch (e) {
    console.error('[SOLICITACOES] relatar-problema:', e.message);
    res.status(500).json({ error: e.message });
  }
});




router.post('/:id/reenviar', async (req, res) => {
  try {
    const userId = req.user.userId;
    const userName = req.user.name;
    const { titulo, descricao, justificativa, data_necessaria, resposta, itens_lista, valor_estimado } = req.body || {};
    const { data: sol } = await supabase
      .from('solicitacoes')
      .select('id, solicitante_id, status, status_antes_ajuste, sla_pausado_em, sla_resposta_deadline, sla_resolucao_deadline, categoria, titulo, area_responsavel')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!sol) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    const isAdmin = ['admin', 'diretor'].includes(req.user.role);
    if (sol.solicitante_id !== userId && !isAdmin) {
      return res.status(403).json({ error: 'Só o solicitante pode reenviar.' });
    }
    if (sol.status !== 'aguardando_ajuste') {
      return res.status(400).json({ error: 'Solicitação não está aguardando ajuste.' });
    }

    if (!resposta || resposta.trim().length < 3) {
      return res.status(400).json({ error: 'Descreva sua resposta ao ajuste (mínimo 3 caracteres).' });
    }

    const update = {
      status: sol.status_antes_ajuste || 'pendente',
      status_antes_ajuste: null,
      sla_pausado_em: null,
    };
    if (titulo !== undefined) update.titulo = titulo;
    if (descricao !== undefined) update.descricao = descricao;
    if (justificativa !== undefined) update.justificativa = justificativa;
    if (data_necessaria !== undefined) update.data_necessaria = data_necessaria || null;




    const editaItens = Array.isArray(itens_lista)
      && ['compras', 'servico'].includes(sol.categoria);
    let itensNorm = [];
    if (editaItens) {
      itensNorm = itens_lista
        .filter(it => it && String(it.descricao || '').trim())
        .map((it, i) => {
          const qNum = Number(it.quantidade);
          const quantidade = isFinite(qNum) && qNum > 0 ? qNum : 1;
          const vNum = Number(it.valor_estimado);
          const temValor = it.valor_estimado != null && it.valor_estimado !== '' && isFinite(vNum);
          const valorLinha = temValor
            ? (it.valor_tipo === 'unitario' ? vNum * quantidade : vNum)
            : null;
          return {
            descricao: String(it.descricao).trim().slice(0, 500),
            quantidade,
            unidade: it.unidade ? String(it.unidade).trim().slice(0, 20) : 'un',
            link_referencia: it.link_referencia ? String(it.link_referencia).trim().slice(0, 1000) : null,
            valor_estimado: valorLinha,
            imagem_url: it.imagem_url ? String(it.imagem_url).slice(0, 2000) : null,
            ordem: i,
          };
        });
      update.itens = itensNorm.length
        ? itensNorm.map(it => `${it.quantidade}x ${it.descricao}`).join('\n')
        : null;
      const soma = itensNorm.reduce((acc, it) => acc + (it.valor_estimado != null ? it.valor_estimado : 0), 0);
      if (soma > 0) update.valor_estimado = soma;
      else if (valor_estimado != null && valor_estimado !== '') update.valor_estimado = Number(valor_estimado) || null;
    }


    if (sol.sla_pausado_em) {
      const pausaMs = Date.now() - new Date(sol.sla_pausado_em).getTime();
      if (pausaMs > 0) {
        if (sol.sla_resposta_deadline) update.sla_resposta_deadline = new Date(new Date(sol.sla_resposta_deadline).getTime() + pausaMs).toISOString();
        if (sol.sla_resolucao_deadline) update.sla_resolucao_deadline = new Date(new Date(sol.sla_resolucao_deadline).getTime() + pausaMs).toISOString();
      }
    }



    const { data, error } = await supabase.from('solicitacoes')
      .update(update).eq('id', sol.id).eq('status', 'aguardando_ajuste').select('*').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(409).json({ error: 'A solicitação mudou enquanto você ajustava (a área pode ter retirado o pedido de ajuste). Atualize a tela.' });



    if (editaItens) {
      const { error: delErr } = await supabase.from('solicitacao_itens').delete().eq('solicitacao_id', sol.id);
      if (delErr) console.error('[SOLICITACOES] reenviar · limpar itens:', delErr.message);
      if (itensNorm.length) {
        const rows = itensNorm.map(it => ({ ...it, solicitacao_id: sol.id }));
        const { error: insErr } = await supabase.from('solicitacao_itens').insert(rows);
        if (insErr) console.error('[SOLICITACOES] reenviar · gravar itens:', insErr.message);
      }
    }


    const respostaTxt = resposta.trim();
    await supabase.from('solicitacao_ajustes').insert({
      solicitacao_id: sol.id, autor_id: userId, lado: 'solicitante', motivo: 'resposta', comentario: respostaTxt,
    });

    const modulo = CATEGORIA_MODULO[sol.categoria] || 'administrativo';
    resolverDestinatarios(modulo).then(managers => {
      if (managers.length) {
        notificar({
          modulo, tipo: 'solicitacao_status',
          titulo: `Reenviada: ${data.titulo}`,
          mensagem: `${userName || 'O solicitante'} ajustou e respondeu: "${respostaTxt}" · voltou pra fila ${data.area_responsavel || ''}.`,
          link: '/solicitacoes', severidade: 'info',
          chaveDedup: `solicitacao_reenviada_${sol.id}_${Date.now()}`,
          targetIds: managers,
        }).catch(err => console.error('[SOLICITACOES] notify reenviar:', err.message));
      }
    }).catch(err => console.error('[SOLICITACOES] resolve managers reenviar:', err.message));

    res.json(data);
  } catch (e) {
    console.error('[SOLICITACOES] reenviar:', e.message);
    res.status(500).json({ error: e.message });
  }
});









router.post('/:id/retirar-ajuste', async (req, res) => {
  try {
    const userId = req.user.userId;
    const comentario = String(req.body?.comentario || '').trim().slice(0, 1000);
    const { data: sol, error: solErr } = await supabase
      .from('solicitacoes')
      .select('id, solicitante_id, responsavel_id, area_responsavel, categoria, titulo, status, status_antes_ajuste, vezes_refeita, deleted_at')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (solErr) throw solErr;
    if (!sol) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    if (!(await podeGerirSolicitacao(req, sol))) {
      return res.status(403).json({ error: 'Só quem atende a área pode retirar o pedido de ajuste.' });
    }

    const { data: ultimo, error: ajErr } = await supabase.from('solicitacao_ajustes')
      .select('id, lado, motivo, autor_id, created_at')
      .eq('solicitacao_id', sol.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ajErr) throw ajErr;

    const pode = retirarAjusteRegua.podeRetirarAjuste({ sol, ultimoAjuste: ultimo, comentario, usuarioId: userId });
    if (!pode.ok) return res.status(400).json({ error: pode.erro, motivo: pode.motivo });



    const { data, error } = await supabase.from('solicitacoes')
      .update(retirarAjusteRegua.montarRetirada(sol))
      .eq('id', sol.id).eq('status', 'aguardando_ajuste')
      .select('*').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(409).json({ error: 'A solicitação mudou enquanto você retirava o ajuste. Atualize a tela.' });

    const { error: insErr } = await supabase.from('solicitacao_ajustes').insert({
      solicitacao_id: sol.id, autor_id: userId, lado: 'responsavel', motivo: 'resposta',
      comentario: `Retirou o pedido de ajuste: ${comentario}`,
    });
    if (insErr) console.error('[SOLICITACOES] retirar-ajuste · registrar:', insErr.message);
    await registrarEvento(sol.id, {
      statusAnterior: 'aguardando_ajuste',
      statusNovo: data.status,
      atorId: userId,
      observacao: `Pedido de ajuste retirado pela área · ${comentario}`,
    });


    try {
      await notificar({
        modulo: CATEGORIA_MODULO[sol.categoria] || 'administrativo',
        tipo: 'solicitacao_status',
        titulo: `Não precisa mais ajustar: ${sol.titulo}`,
        mensagem: `${req.user.name || 'A área'} retirou o pedido de ajuste e a solicitação voltou para a fila. ${comentario}`,
        link: '/solicitacoes',
        severidade: 'info',
        chaveDedup: `solicitacao_ajuste_retirado_${sol.id}_${Date.now()}`,
        targetIds: [sol.solicitante_id].filter(Boolean),
      });
    } catch (err) { console.error('[SOLICITACOES] notificar retirada de ajuste:', err.message); }

    res.json(data);
  } catch (e) {
    console.error('[SOLICITACOES] retirar-ajuste:', e);
    res.status(500).json({ error: 'Erro ao retirar o pedido de ajuste.', detalhe: e?.message || null });
  }
});







router.patch('/:id/editar', async (req, res) => {
  try {
    const userId = req.user.userId;
    const userName = req.user.name;
    const { data: sol } = await supabase
      .from('solicitacoes')
      .select('id, solicitante_id, status, categoria, titulo, aprovacao_origem_status, aprovacao_origem_diretor_id')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!sol) return res.status(404).json({ error: 'Solicitação não encontrada.' });

    const isAdmin = ['admin', 'diretor'].includes(req.user.role);
    if (sol.solicitante_id !== userId && !isAdmin) {
      return res.status(403).json({ error: 'Só o solicitante pode editar a própria solicitação.' });
    }
    if (sol.status !== 'aguardando_aprovacao_origem') {
      return res.status(400).json({ error: 'A edição direta só vale enquanto a solicitação aguarda a aprovação do diretor. Depois da aprovação, use "Relatar problema" para pedir ajuste.' });
    }

    const b = req.body || {};
    const update = {};
    if (b.titulo !== undefined) {
      const t = String(b.titulo).trim();
      if (!t) return res.status(400).json({ error: 'O título não pode ficar vazio.' });
      update.titulo = t.slice(0, 300);
    }
    if (b.descricao !== undefined) update.descricao = b.descricao || null;
    if (b.justificativa !== undefined) update.justificativa = b.justificativa || null;
    if (b.data_necessaria !== undefined) update.data_necessaria = b.data_necessaria || null;
    if (b.valor_estimado !== undefined) {
      const v = Number(b.valor_estimado);
      update.valor_estimado = (b.valor_estimado === '' || b.valor_estimado == null || !isFinite(v)) ? null : v;
    }

    if (b.documento_url !== undefined) {
      update.documento_url = b.documento_url ? String(b.documento_url).slice(0, 2000) : null;
    }





    if (b.imagens_url !== undefined) {
      update.imagens_url = (Array.isArray(b.imagens_url) ? b.imagens_url : [])
        .filter(u => typeof u === 'string' && u.trim())
        .slice(0, 5)
        .map(u => u.trim().slice(0, 2000));
    }
    if (b.link_referencia !== undefined) {
      update.link_referencia = b.link_referencia ? String(b.link_referencia).trim().slice(0, 1000) : null;
    }

    for (const campo of ['favorecido_nome', 'favorecido_documento', 'forma_pagamento', 'chave_pix',
                         'banco', 'agencia', 'conta', 'motivo_reembolso', 'espaco_solicitado',
                         'horario_inicio', 'horario_fim']) {
      if (b[campo] !== undefined) update[campo] = b[campo] ? String(b[campo]).slice(0, 500) : null;
    }
    if (b.data_compra !== undefined) update.data_compra = b.data_compra || null;
    if (b.data_uso !== undefined) update.data_uso = b.data_uso || null;
    if (b.qtde_pessoas !== undefined) {
      const q = parseInt(b.qtde_pessoas, 10);
      update.qtde_pessoas = isFinite(q) && q > 0 ? q : null;
    }



    const editaItens = Array.isArray(b.itens_lista) && ['compras', 'servico'].includes(sol.categoria);
    let itensNorm = [];
    if (editaItens) {
      itensNorm = b.itens_lista
        .filter(it => it && String(it.descricao || '').trim())
        .map((it, i) => {
          const qNum = Number(it.quantidade);
          const quantidade = isFinite(qNum) && qNum > 0 ? qNum : 1;
          const vNum = Number(it.valor_estimado);
          const temValor = it.valor_estimado != null && it.valor_estimado !== '' && isFinite(vNum);
          const valorLinha = temValor
            ? (it.valor_tipo === 'unitario' ? vNum * quantidade : vNum)
            : null;
          return {
            descricao: String(it.descricao).trim().slice(0, 500),
            quantidade,
            unidade: it.unidade ? String(it.unidade).trim().slice(0, 20) : 'un',
            link_referencia: it.link_referencia ? String(it.link_referencia).trim().slice(0, 1000) : null,
            valor_estimado: valorLinha,
            imagem_url: it.imagem_url ? String(it.imagem_url).slice(0, 2000) : null,
            ordem: i,
          };
        });
      update.itens = itensNorm.length
        ? itensNorm.map(it => `${it.quantidade}x ${it.descricao}`).join('\n')
        : null;
      const soma = itensNorm.reduce((acc, it) => acc + (it.valor_estimado != null ? it.valor_estimado : 0), 0);
      if (soma > 0) update.valor_estimado = soma;
    }

    if (!Object.keys(update).length) return res.status(400).json({ error: 'Nada para atualizar.' });

    const { data, error } = await supabase
      .from('solicitacoes')
      .update(update)
      .eq('id', sol.id)
      .select('*')
      .single();
    if (error) throw error;



    if (editaItens) {
      const { error: delErr } = await supabase.from('solicitacao_itens').delete().eq('solicitacao_id', sol.id);
      if (delErr) console.error('[SOLICITACOES] editar · limpar itens:', delErr.message);
      if (itensNorm.length) {
        const rows = itensNorm.map(it => ({ ...it, solicitacao_id: sol.id }));
        const { error: insErr } = await supabase.from('solicitacao_itens').insert(rows);
        if (insErr) console.error('[SOLICITACOES] editar · gravar itens:', insErr.message);
      }
    }




    const camposEditados = Object.keys(update).join(', ');
    const ajusteBase = {
      solicitacao_id: sol.id, autor_id: userId, lado: 'solicitante',
      comentario: `Editou a solicitação antes da aprovação (${camposEditados}).`,
    };
    const { error: ajErr } = await supabase.from('solicitacao_ajustes')
      .insert({ ...ajusteBase, motivo: 'edicao' });
    if (ajErr) {
      const { error: fbErr } = await supabase.from('solicitacao_ajustes')
        .insert({ ...ajusteBase, motivo: 'descricao' });
      if (fbErr) console.error('[SOLICITACOES] editar · log ajuste:', fbErr.message);
    }


    if (sol.aprovacao_origem_diretor_id && sol.aprovacao_origem_diretor_id !== userId) {
      const modulo = CATEGORIA_MODULO[sol.categoria] || 'administrativo';
      notificar({
        modulo, tipo: 'solicitacao_status',
        titulo: `Solicitação editada antes da aprovação: ${data.titulo}`,
        mensagem: `${userName || 'O solicitante'} atualizou o pedido que aguarda sua aprovação (${camposEditados}).`,
        link: '/solicitacoes', severidade: 'info',
        chaveDedup: `solicitacao_editada_${sol.id}_${Date.now()}`,
        targetIds: [sol.aprovacao_origem_diretor_id],
      }).catch(err => console.error('[SOLICITACOES] notify editar:', err.message));
    }

    res.json(data);
  } catch (e) {
    console.error('[SOLICITACOES] editar:', e.message);
    res.status(500).json({ error: 'Erro ao editar solicitação' });
  }
});


router.get('/sla-defs', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('sla_definicoes')
      .select('*')
      .eq('ativo', true)
      .order('area_responsavel')
      .order('subcategoria')
      .order('eh_urgente');
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});


router.get('/reservas-espaco', async (req, res) => {
  try {
    const { desde, ate } = req.query;
    let q = supabase.from('vw_reserva_espacos').select('*');
    if (desde) q = q.gte('data_uso', desde);
    if (ate) q = q.lte('data_uso', ate);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});


router.get('/alcadas', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('area_alcadas')
      .select('*')
      .order('area_cliente');
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});



router.get('/area-responsaveis', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('area_solicitacoes_responsaveis')
      .select('id, area, profile_id, criado_em')
      .order('area');
    if (error) throw error;

    const profileIds = [...new Set((data || []).map(r => r.profile_id))];
    let profileMap = {};
    if (profileIds.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, nome_completo, email')
        .in('id', profileIds);
      profileMap = Object.fromEntries((profs || []).map(p => [p.id, p]));
    }

    const enriched = (data || []).map(r => ({
      ...r,
      profile: profileMap[r.profile_id] || null,
    }));
    res.json(enriched);
  } catch (e) { res.status(500).json({ error: e.message }); }
});



router.put('/area-responsaveis', async (req, res) => {
  if (!['admin', 'diretor'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Apenas admin/diretor podem configurar responsaveis' });
  }
  try {
    const { area, profile_ids } = req.body || {};
    if (!area) return res.status(400).json({ error: 'area obrigatoria' });
    if (!Array.isArray(profile_ids)) return res.status(400).json({ error: 'profile_ids deve ser array' });





    const idsUnicos = [...new Set((profile_ids || []).filter(Boolean))];
    if (idsUnicos.length > 0) {
      const { data: existentes, error: chkErr } = await supabase
        .from('profiles').select('id').in('id', idsUnicos);
      if (chkErr) throw chkErr;
      const validos = new Set((existentes || []).map(p => p.id));
      const invalidos = idsUnicos.filter(id => !validos.has(id));
      if (invalidos.length) {
        return res.status(400).json({
          error: 'Uma das pessoas selecionadas ainda não tem conta no sistema (precisa fazer o primeiro login). Nenhuma alteração foi feita.',
          invalidos,
        });
      }
    }


    const { error: delError } = await supabase
      .from('area_solicitacoes_responsaveis')
      .delete()
      .eq('area', area);
    if (delError) throw delError;

    if (idsUnicos.length > 0) {
      const rows = idsUnicos.map(pid => ({ area, profile_id: pid, criado_por: req.user.userId }));
      const { error: insError } = await supabase
        .from('area_solicitacoes_responsaveis')
        .insert(rows);
      if (insError) throw insError;
    }

    res.json({ ok: true, area, count: idsUnicos.length });
  } catch (e) {
    console.error('[SOLICITACOES] area-responsaveis PUT:', e.message);
    res.status(500).json({ error: e.message });
  }
});














router.get('/vinculaveis-ml', async (req, res) => {
  try {
    const userId = req.user.userId;
    const role = req.user.role;


    const { data: areasRows, error: areasErr } = await supabase
      .from('area_solicitacoes_responsaveis')
      .select('area').eq('profile_id', userId);


    if (areasErr) throw new Error(`Não foi possível conferir suas áreas: ${areasErr.message}`);
    const areasResponsavel = (areasRows || []).map((r) => r.area).filter(Boolean);

    const { data, error } = await supabase
      .from('solicitacoes')
      .select('id, titulo, status, categoria, area_responsavel, area_cliente, valor_estimado, '
        + 'solicitante_id, responsavel_id, created_at, deleted_at, ml_order_id, ml_item_title')
      .eq('categoria', 'compras')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;

    const lista = candidatas(data || [], { userId, role, areasResponsavel });


    const ids = [...new Set(lista.map((s) => s.solicitante_id).filter(Boolean))];
    const nomes = new Map();
    for (let i = 0; i < ids.length; i += 200) {
      const { data: profs } = await supabase.from('profiles')
        .select('id, name').in('id', ids.slice(i, i + 200));
      for (const p of profs || []) nomes.set(p.id, p.name);
    }

    res.json(lista.map((s) => ({
      id: s.id,
      titulo: s.titulo,
      status: s.status,
      area_responsavel: s.area_responsavel,
      area_cliente: s.area_cliente,
      valor_estimado: s.valor_estimado,
      created_at: s.created_at,
      solicitante_nome: nomes.get(s.solicitante_id) || null,

      ml_order_id: s.ml_order_id || null,
      ml_item_title: s.ml_item_title || null,
    })));
  } catch (e) {
    console.error('[SOLICITACOES] vinculaveis-ml error:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao listar solicitações.' });
  }
});




router.post('/:id/vincular-ml', async (req, res) => {
  try {
    const userId = req.user.userId;
    const role = req.user.role;
    const { ml_input } = req.body || {};
    if (!ml_input) {
      return res.status(400).json({ error: 'Cole a URL ou o número do pedido do Mercado Livre.' });
    }


    const { data: sol } = await supabase
      .from('solicitacoes')
      .select('id, solicitante_id, responsavel_id, area_responsavel, categoria')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!sol) return res.status(404).json({ error: 'Solicitação não encontrada' });



    let areasResponsavel = [];
    const atalho = ['admin', 'diretor'].includes(role)
      || sol.solicitante_id === userId || sol.responsavel_id === userId;
    if (!atalho && sol.area_responsavel) {
      const { data: respRow } = await supabase
        .from('area_solicitacoes_responsaveis')
        .select('area')
        .eq('area', sol.area_responsavel)
        .eq('profile_id', userId)
        .maybeSingle();
      if (respRow?.area) areasResponsavel = [respRow.area];
    }
    if (!podeVincular(sol, { userId, role, areasResponsavel })) {
      return res.status(403).json({ error: 'Sem permissão para vincular o pedido.' });
    }

    const result = await mlTracker.linkOrder({
      solicitacaoId: req.params.id,
      mlOrderInput: ml_input,
      profileId: userId,
    });
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (e) {
    console.error('[SOLICITACOES] vincular-ml error:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao vincular pedido.' });
  }
});


router.delete('/:id/vincular-ml', async (req, res) => {
  try {
    const userId = req.user.userId;
    const role = req.user.role;
    const { data: sol } = await supabase
      .from('solicitacoes')
      .select('id, solicitante_id, responsavel_id, ml_linked_by')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!sol) return res.status(404).json({ error: 'Solicitação não encontrada' });

    const isAdmin = ['admin', 'diretor'].includes(role);
    const podeRemover = isAdmin
      || sol.ml_linked_by === userId
      || sol.responsavel_id === userId;
    if (!podeRemover) {
      return res.status(403).json({ error: 'Sem permissão para desvincular.' });
    }

    await supabase
      .from('solicitacoes')
      .update({
        ml_order_id: null,
        ml_shipment_id: null,
        ml_tracking_number: null,
        ml_tracking_url: null,
        ml_item_title: null,
        ml_total_amount: null,
        ml_last_status: null,
        ml_last_status_changed_at: null,
        ml_last_checked_at: null,
        ml_linked_at: null,
        ml_linked_by: null,
        ml_estimated_delivery: null,
      })
      .eq('id', req.params.id);

    res.json({ ok: true });
  } catch (e) {
    console.error('[SOLICITACOES] unvincular-ml error:', e.message);
    res.status(500).json({ error: e.message });
  }
});


router.get('/:id/ml-timeline', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('solicitacao_ml_eventos')
      .select('*')
      .eq('solicitacao_id', req.params.id)
      .order('ocorrido_em', { ascending: true });
    if (error) throw error;
    res.json({
      eventos: data || [],
      statusLabels: mlTracker.STATUS_LABELS,
    });
  } catch (e) {
    console.error('[SOLICITACOES] ml-timeline error:', e.message);
    res.status(500).json({ error: e.message });
  }
});


router.post('/:id/atualizar-ml', async (req, res) => {
  try {
    const role = req.user.role;
    const userId = req.user.userId;
    const { data: sol } = await supabase
      .from('solicitacoes')
      .select('id, solicitante_id, responsavel_id, ml_shipment_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!sol) return res.status(404).json({ error: 'Solicitação não encontrada' });
    if (!sol.ml_shipment_id) return res.status(400).json({ error: 'Solicitação sem pedido ML vinculado.' });

    const isAdmin = ['admin', 'diretor'].includes(role);
    const isMine = sol.solicitante_id === userId || sol.responsavel_id === userId;
    if (!isAdmin && !isMine) return res.status(403).json({ error: 'Sem permissão.' });


    const { data: full } = await supabase
      .from('solicitacoes')
      .select('ml_order_id')
      .eq('id', req.params.id)
      .single();

    const result = await mlTracker.linkOrder({
      solicitacaoId: req.params.id,
      mlOrderInput: full.ml_order_id,
      profileId: userId,
    });
    res.json(result);
  } catch (e) {
    console.error('[SOLICITACOES] atualizar-ml error:', e.message);
    res.status(500).json({ error: e.message });
  }
});






async function obterCategoriasFinanceirasAutorizadas(profileId) {
  try {
    const { data, error } = await supabase
      .from('solicitacoes_financeiro_aprovadores')
      .select('categoria')
      .eq('profile_id', profileId);
    if (error) {
      console.warn('[SOLICITACOES] escopo financeiro indisponível:', error.message);
      return { disponivel: false, categorias: new Set() };
    }
    return {
      disponivel: true,
      categorias: new Set((data || []).map(item => item.categoria).filter(Boolean)),
    };
  } catch (error) {
    console.warn('[SOLICITACOES] falha ao consultar escopo financeiro:', error.message);
    return { disponivel: false, categorias: new Set() };
  }
}

async function filtrarAprovadoresFinanceirosPorCategoria(profileIds, categoria) {
  const ids = [...new Set([...(profileIds || [])].filter(Boolean))];
  if (!ids.length) return [];

  try {
    const { data, error } = await supabase
      .from('solicitacoes_financeiro_aprovadores')
      .select('profile_id, categoria')
      .in('profile_id', ids);
    if (error) throw error;

    const categoriasPorPerfil = new Map();
    (data || []).forEach(item => {
      if (!categoriasPorPerfil.has(item.profile_id)) categoriasPorPerfil.set(item.profile_id, new Set());
      categoriasPorPerfil.get(item.profile_id).add(item.categoria);
    });



    return ids.filter(id => !categoriasPorPerfil.has(id) || categoriasPorPerfil.get(id).has(categoria));
  } catch (error) {
    console.warn('[SOLICITACOES] falha ao filtrar destinatários financeiros:', error.message);
    return [];
  }
}

async function podeAprovarFinanceiro(req, categoria = null) {
  const userId = req.user.userId;
  const role = req.user.role;
  let temPermissaoBase = ['admin', 'diretor'].includes(role);
  if (!temPermissaoBase) {
    const modulePerms = req.user.granular?.modulePerms || {};
    const fin = modulePerms.financeiro || modulePerms.Financeiro;
    temPermissaoBase = !!(fin && (fin.leitura >= 3 || fin.escrita >= 3));
  }
  if (!temPermissaoBase) {
    const { data } = await supabase
      .from('area_solicitacoes_responsaveis')
      .select('profile_id')
      .eq('area', 'financeiro')
      .eq('profile_id', userId)
      .maybeSingle();
    temPermissaoBase = !!data;
  }
  if (!temPermissaoBase || !categoria) return temPermissaoBase;

  const escopoFinanceiro = await obterCategoriasFinanceirasAutorizadas(userId);
  return escopoFinanceiro.disponivel
    && (escopoFinanceiro.categorias.size === 0 || escopoFinanceiro.categorias.has(categoria));
}





async function autoridadeCorrecaoFinanceira(req) {
  const fin = req.user.granular?.modulePerms?.financeiro || req.user.granular?.modulePerms?.Financeiro || null;
  let ehResp = false;
  if (!['admin', 'diretor'].includes(req.user.role) && req.user.is_super_admin !== true) {
    ehResp = await ehResponsavelAreaFinanceiro(req.user.userId);
  }
  const base = correcaoSol.temAutoridadeDeCorrecao({
    role: req.user.role, superAdmin: req.user.is_super_admin === true, finPerm: fin, ehResponsavelFinanceiro: ehResp,
  });
  if (!base) return { pode: false, categorias: [] };
  const escopo = await obterCategoriasFinanceirasAutorizadas(req.user.userId);
  if (!escopo.disponivel) return { pode: false, categorias: [] };
  return { pode: true, categorias: [...escopo.categorias] };
}

async function podeCorrigirFinanceiro(req, categoria) {
  const a = await autoridadeCorrecaoFinanceira(req);
  return a.pode && correcaoSol.categoriaNoEscopo(a.categorias, categoria);
}

function aguardandoAprovacaoFinanceira(solicitacao) {
  return solicitacao?.status === 'aguardando_aprovacao_financeira'
    && solicitacao?.precisa_aprovacao_financeira === true
    && !solicitacao?.aprovado_financeiro_em;
}

function cotacaoObrigatoriaRegistrada(solicitacao) {
  if (!['compras', 'servico'].includes(solicitacao?.categoria)) return true;
  const valor = Number(solicitacao?.valor_cotado);
  return !!solicitacao?.cotacao_em && Number.isFinite(valor) && valor >= 0;
}










async function limiteAlcadaDaArea(areaCliente) {
  if (!areaCliente) return LIMITE_ALCADA_PADRAO;
  try {
    const { data, error } = await supabase
      .from('area_alcadas')
      .select('limite_aprovacao')
      .eq('area_cliente', areaCliente)
      .maybeSingle();
    if (error) throw error;
    const limite = Number(data?.limite_aprovacao);
    return Number.isFinite(limite) && limite >= 0 ? limite : LIMITE_ALCADA_PADRAO;
  } catch (e) {
    console.warn('[SOLICITACOES] falha ao ler alçada da área:', e.message);
    return LIMITE_ALCADA_PADRAO;
  }
}






async function ehResponsavelDaArea(req, area) {
  if (!area || !req?.user?.userId) return false;
  const { data, error } = await supabase
    .from('area_solicitacoes_responsaveis')
    .select('profile_id')
    .eq('area', area)
    .eq('profile_id', req.user.userId)
    .maybeSingle();
  if (error) {
    console.warn('[SOLICITACOES] falha ao checar responsável da área:', error.message);
    return false;
  }
  return !!data;
}


async function avaliarAlcada(req, sol) {
  const limite = await limiteAlcadaDaArea(sol?.area_cliente);
  const eleg = elegivelAlcada(sol, limite);
  if (!eleg.ok) return { ...eleg, responsavel: false };
  const responsavel = await ehResponsavelDaArea(req, sol.area_responsavel);
  return { ...eleg, responsavel, ok: responsavel, motivo: responsavel ? null : 'nao_responsavel' };
}

async function podeAprovarNaAlcada(req, sol) {
  const r = await avaliarAlcada(req, sol);
  return r.ok;
}

router.get('/pendentes-financeiro', async (req, res) => {
  try {
    if (!(await podeAprovarFinanceiro(req))) {
      return res.status(403).json({ error: 'Sem permissão pra ver pendências financeiras' });
    }
    const escopoFinanceiro = await obterCategoriasFinanceirasAutorizadas(req.user.userId);
    if (!escopoFinanceiro.disponivel) {
      return res.status(503).json({ error: 'A configuração do escopo financeiro não está disponível.' });
    }
    let consulta = supabase
      .from('solicitacoes')
      .select('*')
      .eq('precisa_aprovacao_financeira', true)
      .is('aprovado_financeiro_em', null)
      .eq('status', 'aguardando_aprovacao_financeira')
      .is('deleted_at', null)
      .order('eh_urgente', { ascending: false })
      .order('created_at', { ascending: true });
    if (escopoFinanceiro.categorias.size) {
      consulta = consulta.in('categoria', [...escopoFinanceiro.categorias]);
    }
    const { data, error } = await consulta;
    if (error) throw error;



    const ids = [...new Set((data || []).map(s => s.solicitante_id).filter(Boolean))];
    let byId = {};
    if (ids.length > 0) {
      const { data: profs } = await supabase
        .from('profiles').select('id, name, email, avatar_url').in('id', ids);
      byId = Object.fromEntries((profs || []).map(p => [p.id, p]));
    }
    const enriched = (data || []).map(s => ({
      ...s,
      solicitante_nome: byId[s.solicitante_id]?.name || null,
      solicitante_email: byId[s.solicitante_id]?.email || null,
      solicitante_avatar: byId[s.solicitante_id]?.avatar_url || null,
    }));









    res.json(await assinarAnexosSolicitacoes(enriched));
  } catch (e) {
    console.error('[SOLICITACOES] pendentes-financeiro:', e.message);
    res.status(500).json({ error: e.message });
  }
});




const FORMAS_PAGAMENTO_VALIDAS = ['boleto', 'pix', 'transferencia_bancaria', 'dinheiro', 'cartao_credito'];


const EXECUTOR_FINANCEIRO_ID = (process.env.CBRIO_PRIVATE_1FE0C2050FB4 || '00000000-0000-0000-0000-000000000000');

router.post('/:id/aprovar-financeiro', async (req, res) => {
  try {
    const { observacao } = req.body || {};
    const formaPagamento = (req.body?.forma_pagamento || '').trim() || null;
    const { data: atual } = await supabase
      .from('solicitacoes').select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!atual) return res.status(404).json({ error: 'Solicitação não encontrada' });




    let viaAlcada = false;
    let limiteAlcada = LIMITE_ALCADA_PADRAO;
    if (!(await podeAprovarFinanceiro(req, atual.categoria))) {
      const alc = await avaliarAlcada(req, atual);
      limiteAlcada = alc.limite;
      if (!alc.ok) {
        return res.status(403).json({
          error: alc.motivo === 'acima_do_limite'
            ? `Compras acima de R$ ${alc.limite.toLocaleString('pt-BR')} precisam da aprovação do financeiro.`
            : 'Você não pode aprovar esta categoria de solicitação.',
        });
      }
      viaAlcada = true;
    }

    if (!aguardandoAprovacaoFinanceira(atual)) {
      return res.status(400).json({ error: 'Esta solicitação não está aguardando aprovação financeira.' });
    }
    if (!cotacaoObrigatoriaRegistrada(atual)) {
      return res.status(400).json({ error: 'A compra precisa ter uma cotação registrada antes da aprovação financeira.' });
    }


    const ehCompraServico = ['compras', 'servico'].includes(atual.categoria);
    if (formaPagamento && !FORMAS_PAGAMENTO_VALIDAS.includes(formaPagamento)) {
      return res.status(400).json({ error: 'Forma de pagamento inválida.' });
    }
    if (ehCompraServico && !formaPagamento) {
      return res.status(400).json({ error: 'Escolha a forma de pagamento (define se a compra volta pra área comprar no cartão ou vai pro financeiro pagar).' });
    }







    const noCartao = formaPagamento === 'cartao_credito';
    const vaiProFinanceiro = !ehCompraServico || !noCartao;
    const novaAreaResp = vaiProFinanceiro ? 'financeiro' : 'logistica_compras';
    const novoStatus = vaiProFinanceiro ? 'em_atendimento' : 'pendente';

    const updates = {
      aprovado_financeiro_em: new Date().toISOString(),
      aprovado_financeiro_por: req.user.userId,
      area_responsavel: novaAreaResp,
      status: novoStatus,
    };



    if (formaPagamento && ehCompraServico) updates.forma_pagamento = formaPagamento;

    if (vaiProFinanceiro && EXECUTOR_FINANCEIRO_ID) updates.responsavel_id = EXECUTOR_FINANCEIRO_ID;




    const carimbo = viaAlcada
      ? `[Aprovação por alçada · até R$ ${limiteAlcada.toLocaleString('pt-BR')} · sem passar pelo financeiro]`
      : '[Aprovação financeira]';
    const linhaObs = observacao ? `${carimbo} ${observacao}` : (viaAlcada ? carimbo : null);
    if (linhaObs) {
      updates.observacoes = atual.observacoes
        ? `${atual.observacoes}\n${linhaObs}`
        : linhaObs;
    }

    const { data, error } = await supabase
      .from('solicitacoes')
      .update(updates)
      .eq('id', req.params.id)
      .eq('status', 'aguardando_aprovacao_financeira')
      .eq('precisa_aprovacao_financeira', true)
      .is('aprovado_financeiro_em', null)
      .is('deleted_at', null)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(409).json({ error: 'Esta solicitação foi alterada por outra pessoa. Atualize a fila antes de decidir.' });

    const acaoMsg = (noCartao && ehCompraServico)
      ? 'liberado pra compra no cartão'
      : {
          compras:   'enviado pro financeiro pagar a compra',
          servico:   'enviado pro financeiro pagar o serviço',
          reembolso: 'pode efetuar o reembolso',
          pagamento: 'pode efetuar o pagamento',
        }[atual.categoria] || 'liberado pra atendimento';



    await notificar({
      modulo: vaiProFinanceiro ? 'financeiro' : (CATEGORIA_MODULO[atual.categoria] || 'logistica'),
      tipo: 'solicitacao_status',
      titulo: `Solicitação aprovada: ${atual.titulo}`,
      mensagem: viaAlcada
        ? `${req.user.name || 'A área responsável'} aprovou dentro da alçada (até R$ ${limiteAlcada.toLocaleString('pt-BR')}) · ${acaoMsg}`
        : `${req.user.name || 'O financeiro'} aprovou financeiramente · ${acaoMsg}`,
      link: vaiProFinanceiro ? '/admin/financeiro?aba=pagar' : '/solicitacoes',
      severidade: 'info',
      chaveDedup: `solicitacao_aprovada_fin_${data.id}`,
      extraTargetIds: [atual.solicitante_id, vaiProFinanceiro ? data.responsavel_id : null].filter(Boolean),
    }).catch(err => console.error('[SOLICITACOES] notify:', err.message));


    notificarPedidoWhatsapp(data.id, 'aprovada no financeiro', acaoMsg);

    res.json(data);
  } catch (e) {
    console.error('[SOLICITACOES] aprovar-financeiro:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/reprovar-financeiro', async (req, res) => {
  try {
    const { motivo } = req.body || {};
    if (!motivo) return res.status(400).json({ error: 'Motivo da reprovação é obrigatório' });

    const { data: atual } = await supabase
      .from('solicitacoes').select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!atual) return res.status(404).json({ error: 'Solicitação não encontrada' });
    if (!(await podeAprovarFinanceiro(req, atual.categoria))) {
      return res.status(403).json({ error: 'Você não pode reprovar esta categoria de solicitação.' });
    }
    if (!aguardandoAprovacaoFinanceira(atual)) {
      return res.status(400).json({ error: 'Esta solicitação não está aguardando aprovação financeira.' });
    }
    if (!cotacaoObrigatoriaRegistrada(atual)) {
      return res.status(400).json({ error: 'A compra precisa ter uma cotação registrada antes da reprovação financeira.' });
    }

    const updates = {
      status: 'rejeitado',
      aprovado_financeiro_em: new Date().toISOString(),
      aprovado_financeiro_por: req.user.userId,
      observacoes: atual.observacoes
        ? `${atual.observacoes}\n[REPROVADO pelo financeiro] ${motivo}`
        : `[REPROVADO pelo financeiro] ${motivo}`,
    };

    const { data, error } = await supabase
      .from('solicitacoes')
      .update(updates)
      .eq('id', req.params.id)
      .eq('status', 'aguardando_aprovacao_financeira')
      .eq('precisa_aprovacao_financeira', true)
      .is('aprovado_financeiro_em', null)
      .is('deleted_at', null)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(409).json({ error: 'Esta solicitação foi alterada por outra pessoa. Atualize a fila antes de decidir.' });

    notificar({
      modulo: 'financeiro',
      tipo: 'solicitacao_status',
      titulo: `Solicitação reprovada: ${atual.titulo}`,
      mensagem: `Financeiro reprovou · ${motivo}`,
      link: '/solicitacoes',
      severidade: 'alta',
      chaveDedup: `solicitacao_reprovada_fin_${data.id}`,
      extraTargetIds: [atual.solicitante_id].filter(Boolean),
    }).catch(err => console.error('[SOLICITACOES] notify:', err.message));

    res.json(data);
  } catch (e) {
    console.error('[SOLICITACOES] reprovar-financeiro:', e.message);
    res.status(500).json({ error: e.message });
  }
});



















async function ehResponsavelAreaFinanceiro(userId) {
  const { data, error } = await supabase.from('area_solicitacoes_responsaveis')
    .select('profile_id').eq('area', 'financeiro').eq('profile_id', userId).maybeSingle();
  if (error) throw error;
  return !!data;
}





router.get('/a-pagar', async (req, res) => {
  try {
    const userId = req.user.userId;
    const verTudo = ['admin', 'diretor'].includes(req.user.role) || await ehResponsavelAreaFinanceiro(userId);

    let consulta = supabase.from('solicitacoes').select('*')
      .is('deleted_at', null)
      .eq('status', 'em_atendimento')
      .eq('area_responsavel', 'financeiro')
      .is('pago_em', null)
      .in('categoria', conclusaoPag.CATEGORIAS_PAGAS_PELO_FINANCEIRO)
      .order('eh_urgente', { ascending: false })
      .order('data_necessaria', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
      .limit(500);
    if (!verTudo) consulta = consulta.eq('responsavel_id', userId);
    const { data, error } = await consulta;
    if (error) throw error;

    const linhas = (data || []).filter(s => conclusaoPag.prontaParaPagar(s).ok);
    const ids = [...new Set(linhas.map(s => s.solicitante_id).filter(Boolean))];
    let porId = {};
    if (ids.length) {
      const { data: profs, error: pErr } = await supabase.from('profiles')
        .select('id, name, email, avatar_url').in('id', ids);
      if (pErr) throw pErr;
      porId = Object.fromEntries((profs || []).map(p => [p.id, p]));
    }
    const itens = linhas.map(s => ({
      ...s,
      solicitante_nome: porId[s.solicitante_id]?.name || null,
      solicitante_email: porId[s.solicitante_id]?.email || null,
      solicitante_avatar: porId[s.solicitante_id]?.avatar_url || null,
      formas_permitidas: conclusaoPag.formasDaCategoria(s.categoria),
      status_apos_pagamento: conclusaoPag.statusAposPagamento(s.categoria),

      pode_pagar: s.solicitante_id !== userId,
    }));
    res.json({ itens: await assinarAnexosSolicitacoes(itens), escopo: verTudo ? 'financeiro' : 'atribuidas' });
  } catch (e) {
    console.error('[SOLICITACOES] a-pagar:', e);
    res.status(500).json({ error: 'Erro ao carregar a fila de pagamento.', detalhe: e?.message || null });
  }
});


router.post('/:id/concluir-pagamento', uploadComprovante.single('arquivo'), async (req, res) => {
  let arquivoSubido = null;
  try {
    const { data: sol, error: solErr } = await supabase.from('solicitacoes')
      .select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (solErr) throw solErr;
    if (!sol) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    if (!(await podeGerirSolicitacao(req, sol))) {
      return res.status(403).json({ error: 'Só quem atende o financeiro registra o pagamento desta solicitação.' });
    }
    const pronta = conclusaoPag.prontaParaPagar(sol);
    if (!pronta.ok) {
      return res.status(pronta.motivo === 'ja_pago' ? 409 : 400).json({ error: pronta.erro, motivo: pronta.motivo });
    }

    const forma = String(req.body?.forma || '').trim();
    const valorCentavos = conclusaoPag.reaisParaCentavos(req.body?.valor);
    const dataPagamento = String(req.body?.data || '').trim() || hojeBrtIso();
    const observacao = req.body?.observacao ? String(req.body.observacao).trim().slice(0, 1000) : null;
    const valida = conclusaoPag.validarConclusao({
      categoria: sol.categoria,
      forma,
      temArquivo: !!req.file,
      valorPagoCentavos: valorCentavos,
      dataPagamento,
      hojeIso: hojeBrtIso(),
      executorId: req.user.userId,
      solicitanteId: sol.solicitante_id,
    });
    if (!valida.ok) return res.status(400).json({ error: valida.erro, campo: valida.campo });

    let info = null;
    if (req.file) {
      const up = await finComprovantes.subirArquivo({ origemTipo: 'solicitacao', origemId: sol.id, arquivo: req.file });
      if (!up.ok) return res.status(400).json({ error: up.erro, campo: 'arquivo' });
      info = up.info;
      arquivoSubido = info.storage_path;
    }

    const valorPadrao = Number(sol.valor_cotado ?? sol.valor_estimado);
    const valorPago = valorCentavos != null ? valorCentavos / 100 : (valorPadrao > 0 ? valorPadrao : null);
    const statusNovo = conclusaoPag.statusAposPagamento(sol.categoria);

    const { data: r, error: rpcErr } = await supabase.rpc('fn_solicitacao_concluir_pagamento', {
      p_id: sol.id,
      p_forma: forma,
      p_data: dataPagamento,
      p_valor: valorPago,
      p_por: req.user.userId,
      p_observacao: observacao,
      p_status_novo: statusNovo,
      p_arquivo: info ? {
        pasta: conclusaoPag.PASTA_POR_CATEGORIA[sol.categoria],
        storage_path: info.storage_path,
        nome: info.nome,
        mime: info.mime,
        tamanho: String(info.tamanho),
        sha256: info.sha256,
      } : null,
    });
    if (rpcErr) throw rpcErr;
    if (!r?.ok) {
      await finComprovantes.removerArquivo(arquivoSubido);
      arquivoSubido = null;
      return res.status(409).json({ error: 'Esta solicitação foi alterada por outra pessoa (ou o pagamento já foi registrado). Atualize a fila.' });
    }
    arquivoSubido = null;

    const avisos = [];
    if (info) {
      const mesmos = await finComprovantes.mesmosArquivos(info.sha256, sol.id);
      if (mesmos === null) avisos.push('Não foi possível conferir se este comprovante já foi usado em outra solicitação.');
      else if (mesmos.length) avisos.push(`Este mesmo arquivo já foi anexado em ${mesmos.length} outro(s) registro(s). Confira se não é comprovante reaproveitado.`);
    }
    if (conclusaoPag.divergeDaPreferencia(forma, sol.forma_pagamento)) {
      avisos.push(`O solicitante pediu ${conclusaoPag.ROTULO_FORMA[sol.forma_pagamento === 'transferencia' ? 'transferencia_bancaria' : sol.forma_pagamento] || sol.forma_pagamento} e o pagamento foi feito por ${conclusaoPag.ROTULO_FORMA[forma]}.`);
    }

    const rotulo = conclusaoPag.ROTULO_FORMA[forma];
    await registrarEvento(sol.id, {
      statusAnterior: sol.status,
      statusNovo,
      atorId: req.user.userId,
      observacao: `Pagamento registrado · ${rotulo}${info ? ' · comprovante anexado' : ' · sem comprovante'}`,
    });


    const concluiu = statusNovo === 'concluido';
    try {
      await notificar({
        modulo: CATEGORIA_MODULO[sol.categoria] || 'financeiro',
        tipo: concluiu ? 'solicitacao_avaliar' : 'solicitacao_status',
        titulo: concluiu ? `Avalie: ${sol.titulo}` : `Pago: ${sol.titulo}`,
        mensagem: concluiu
          ? `O financeiro registrou o pagamento (${rotulo}). Avalie o atendimento em 30 segundos · ajuda muito a melhorar.`
          : `O financeiro pagou (${rotulo}). Agora a compra aguarda a entrega.`,
        link: '/solicitacoes',
        severidade: 'info',
        chaveDedup: `solicitacao_paga_${sol.id}`,
        targetIds: [sol.solicitante_id].filter(Boolean),
      });
      if (!concluiu) {

        await notificar({
          modulo: 'logistica',
          tipo: 'solicitacao_status',
          titulo: `Pago pelo financeiro: ${sol.titulo}`,
          mensagem: `${req.user.name || 'O financeiro'} pagou por ${rotulo} · aguardando entrega.`,
          link: '/solicitacoes',
          severidade: 'info',
          chaveDedup: `solicitacao_paga_log_${sol.id}`,
        });
      }
    } catch (err) { console.error('[SOLICITACOES] notificar pagamento:', err.message); }
    await notificarPedidoWhatsapp(sol.id, concluiu ? 'concluída' : 'paga · aguardando entrega', `Pagamento registrado (${rotulo}).`);

    const { data: atual } = await supabase.from('solicitacoes').select('*').eq('id', sol.id).maybeSingle();
    res.json({ solicitacao: atual || null, comprovante_id: r.comprovante_id || null, avisos });
  } catch (e) {
    if (arquivoSubido) await finComprovantes.removerArquivo(arquivoSubido);
    console.error('[SOLICITACOES] concluir-pagamento:', e);
    res.status(500).json({ error: 'Erro ao registrar o pagamento.', detalhe: e?.message || null });
  }
});



router.get('/:id/comprovante-pagamento', async (req, res) => {
  try {
    const { data: sol, error: solErr } = await supabase.from('solicitacoes')
      .select('id, solicitante_id, responsavel_id, area_responsavel, categoria, pago_em, pagamento_forma')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (solErr) throw solErr;
    if (!sol) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    const fin = req.user.granular?.modulePerms?.financeiro;
    const pode = sol.solicitante_id === req.user.userId
      || (fin && (fin.leitura >= 3 || fin.escrita >= 3))
      || await podeGerirSolicitacao(req, sol);
    if (!pode) return res.status(403).json({ error: 'Sem permissão para ver este comprovante.' });

    const mapa = await finComprovantes.comprovantesDe('solicitacao', [sol.id]);
    const comp = (mapa.get(sol.id) || [])[0];
    if (!comp) return res.json({ comprovante: null, pago_em: sol.pago_em, pagamento_forma: sol.pagamento_forma });
    const urls = await finComprovantes.assinarCaminhos([comp.storage_path]);
    res.json({
      comprovante: { id: comp.id, nome: comp.nome, mime: comp.mime, url: urls.get(comp.storage_path) || null, criado_em: comp.created_at },
      pago_em: sol.pago_em,
      pagamento_forma: sol.pagamento_forma,
    });
  } catch (e) {
    console.error('[SOLICITACOES] comprovante-pagamento:', e);
    res.status(500).json({ error: 'Erro ao abrir o comprovante.', detalhe: e?.message || null });
  }
});

















const MENSAGEM_FALHA_CORRECAO = {
  conflito: 'Outra pessoa alterou esta solicitação enquanto você corrigia. Feche, abra de novo e refaça a correção.',
  nao_elegivel: 'Esta solicitação não está mais num estado que aceita correção. Atualize a tela.',
  lancada: 'Esta solicitação já foi lançada no financeiro: valor e data do pagamento se corrigem no lançamento.',
  nao_encontrada: 'Solicitação não encontrada.',
  nada_mudou: 'Nada mudou: altere algum campo ou anexe o comprovante novo.',
};



router.post('/:id/corrigir', uploadComprovante.single('arquivo'), async (req, res) => {
  let arquivoSubido = null;
  try {
    const { data: sol, error: solErr } = await supabase.from('solicitacoes')
      .select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (solErr) throw solErr;
    if (!sol) return res.status(404).json({ error: 'Solicitação não encontrada.' });

    if (!(await podeCorrigirFinanceiro(req, sol.categoria))) {
      return res.status(403).json({ error: 'Só o financeiro corrige uma solicitação depois do pagamento.' });
    }

    const comprovantes = await finComprovantes.comprovantesDe('solicitacao', [sol.id]);
    const temComprovanteAtual = (comprovantes.get(sol.id) || []).length > 0;

    const corpo = {};
    for (const k of [...correcaoSol.CAMPOS_CORRIGIVEIS, ...correcaoSol.CAMPOS_TRAVADOS, 'motivo']) {
      if (req.body?.[k] !== undefined) corpo[k] = req.body[k];
    }
    const m = correcaoSol.montarCorrecao({
      sol,
      corpo,
      temArquivo: !!req.file,
      temComprovanteAtual,
      executorId: req.user.userId,
      hojeIso: hojeBrtIso(),
    });
    if (!m.ok) {
      return res.status(m.motivo === 'imutavel' ? 409 : 400).json({ error: m.erro, campo: m.campo });
    }

    let info = null;
    if (req.file) {
      const up = await finComprovantes.subirArquivo({ origemTipo: 'solicitacao', origemId: sol.id, arquivo: req.file });
      if (!up.ok) return res.status(400).json({ error: up.erro, campo: 'arquivo' });
      info = up.info;
      arquivoSubido = info.storage_path;
    }

    const esperado = String(req.body?.esperado || '').trim() || null;
    const { data: r, error: rpcErr } = await supabase.rpc('fn_solicitacao_corrigir', {
      p_id: sol.id,
      p_esperado: esperado,
      p_campos: m.campos,
      p_alteracoes: m.alteracoes,
      p_autor: req.user.userId,
      p_motivo: m.motivo,

      p_observacao: correcaoSol.observacaoDoEvento({ rotulos: m.rotulos, temArquivo: !!req.file, temComprovanteAtual }),
      p_arquivo: info ? {
        pasta: conclusaoPag.PASTA_POR_CATEGORIA[sol.categoria],
        storage_path: info.storage_path,
        nome: info.nome,
        mime: info.mime,
        tamanho: String(info.tamanho),
        sha256: info.sha256,
      } : null,
    });
    if (rpcErr) throw rpcErr;
    if (!r?.ok) {
      await finComprovantes.removerArquivo(arquivoSubido);
      arquivoSubido = null;
      return res.status(409).json({ error: MENSAGEM_FALHA_CORRECAO[r?.motivo] || 'Não foi possível salvar a correção.', motivo: r?.motivo || null });
    }
    arquivoSubido = null;

    const avisos = [];
    if (info) {
      const mesmos = await finComprovantes.mesmosArquivos(info.sha256, sol.id);
      if (mesmos === null) avisos.push('Não foi possível conferir se este comprovante já foi usado em outra solicitação.');
      else if (mesmos.length) avisos.push(`Este mesmo arquivo já foi anexado em ${mesmos.length} outro(s) registro(s). Confira se não é comprovante reaproveitado.`);
    }



    try {
      await notificar({
        modulo: CATEGORIA_MODULO[sol.categoria] || 'financeiro',
        tipo: 'solicitacao_status',
        titulo: `Corrigida pelo financeiro: ${sol.titulo}`,
        mensagem: `${req.user.name || 'O financeiro'} corrigiu ${m.rotulos.join(', ')}. Motivo: ${m.motivo}`,
        link: '/solicitacoes',
        severidade: 'info',
        chaveDedup: `solicitacao_corrigida_${sol.id}_${r.ajuste_id}`,
        targetIds: [sol.solicitante_id].filter(Boolean),
      });
    } catch (err) { console.error('[SOLICITACOES] notificar correção:', err.message); }

    const { data: atual } = await supabase.from('solicitacoes').select('*').eq('id', sol.id).maybeSingle();
    res.json({ solicitacao: atual || null, ajuste_id: r.ajuste_id, alteracoes: m.alteracoes, avisos });
  } catch (e) {
    if (arquivoSubido) await finComprovantes.removerArquivo(arquivoSubido);
    console.error('[SOLICITACOES] corrigir:', e);
    res.status(500).json({ error: 'Erro ao salvar a correção.', detalhe: e?.message || null });
  }
});


router.get('/dashboard/urgencia-frequente', async (req, res) => {
  try {
    const role = req.user.role;
    if (!['admin', 'diretor'].includes(role)) {
      const modulePerms = req.user.granular?.modulePerms || {};
      const fin = modulePerms.financeiro || modulePerms.Financeiro;
      if (!(fin && fin.leitura >= 3)) {
        return res.status(403).json({ error: 'Sem permissão' });
      }
    }
    const desde = new Date(Date.now() - 90 * 86400000).toISOString();
    const { data, error } = await supabase
      .from('solicitacoes')
      .select('solicitante_id, eh_urgente')
      .gte('created_at', desde)
      .is('deleted_at', null);
    if (error) throw error;

    const agg = new Map();
    (data || []).forEach(s => {
      const id = s.solicitante_id;
      if (!id) return;
      if (!agg.has(id)) agg.set(id, { solicitante_id: id, total: 0, urgentes: 0 });
      const a = agg.get(id);
      a.total++;
      if (s.eh_urgente) a.urgentes++;
    });

    const lista = [...agg.values()]
      .filter(a => a.urgentes >= 2)
      .map(a => ({ ...a, taxa: a.total > 0 ? (a.urgentes / a.total) : 0 }))
      .sort((a, b) => b.urgentes - a.urgentes)
      .slice(0, 20);

    if (lista.length > 0) {
      const ids = lista.map(x => x.solicitante_id);
      const { data: profs } = await supabase
        .from('profiles').select('id, name, email').in('id', ids);
      const byId = Object.fromEntries((profs || []).map(p => [p.id, p]));
      lista.forEach(x => {
        const p = byId[x.solicitante_id];
        x.nome = p?.name || '—';
        x.email = p?.email || null;
      });
    }

    res.json(lista);
  } catch (e) {
    console.error('[SOLICITACOES] urgencia-frequente:', e.message);
    res.status(500).json({ error: e.message });
  }
});




router.get('/dashboard/refeitas', async (req, res) => {
  try {
    const role = req.user.role;
    if (!['admin', 'diretor'].includes(role)) {
      const { data: rr } = await supabase
        .from('area_solicitacoes_responsaveis')
        .select('area').eq('profile_id', req.user.userId).limit(1);
      if (!rr || !rr.length) return res.status(403).json({ error: 'Sem permissão' });
    }
    const dias = Math.min(Math.max(parseInt(req.query.dias, 10) || 90, 7), 365);
    const desde = new Date(Date.now() - dias * 86400000).toISOString();

    const [{ count: totalPeriodo }, { data: ajustes }] = await Promise.all([
      supabase.from('solicitacoes').select('id', { count: 'exact', head: true })
        .gte('created_at', desde).is('deleted_at', null),
      supabase.from('solicitacao_ajustes').select('solicitacao_id, lado, motivo')
        .gte('created_at', desde),
    ]);

    const refeitasSet = new Set();
    const devolucoesSet = new Set();
    const porMotivo = { descricao: 0, escopo: 0, data: 0, cancelamento: 0 };
    (ajustes || []).forEach(a => {
      porMotivo[a.motivo] = (porMotivo[a.motivo] || 0) + 1;
      if (a.motivo === 'cancelamento') return;
      if (a.lado === 'solicitante') refeitasSet.add(a.solicitacao_id);



      else if (retirarAjusteRegua.ehDevolucaoDaArea(a)) devolucoesSet.add(a.solicitacao_id);
    });

    const total = totalPeriodo || 0;
    const refeitas = refeitasSet.size;
    res.json({
      dias,
      total_periodo: total,
      refeitas,
      devolucoes: devolucoesSet.size,
      pct_refeitas: total > 0 ? Math.round((refeitas / total) * 1000) / 10 : 0,
      por_motivo: porMotivo,
    });
  } catch (e) {
    console.error('[SOLICITACOES] dashboard-refeitas:', e.message);
    res.status(500).json({ error: e.message });
  }
});







router.get('/estoque/produtos', async (req, res) => {
  try {
    const busca = (req.query.busca || '').toString().replace(/[,()*:%]/g, ' ').trim();
    let q = supabase.from('vw_log_estoque_saldo').select('id,nome,categoria,unidade,saldo')
      .eq('ativo', true).order('nome').limit(1000);
    if (busca) q = q.ilike('nome', `%${busca}%`);
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});


router.post('/:id/atender-estoque', async (req, res) => {
  try {
    const userId = req.user.userId;
    const userName = req.user.name;
    const { itens, observacao } = req.body || {};
    if (!Array.isArray(itens) || !itens.length) return res.status(400).json({ error: 'Informe ao menos um item.' });

    const { data: sol } = await supabase.from('solicitacoes')
      .select('id, solicitante_id, responsavel_id, area_responsavel, area_cliente, categoria, titulo, status, observacoes')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!sol) return res.status(404).json({ error: 'Solicitação não encontrada.' });


    const isAdm = ['admin', 'diretor'].includes(req.user.role);
    const isResp = sol.responsavel_id === userId;
    let isAreaResp = false;
    if (!isAdm && !isResp && sol.area_responsavel) {
      const { data: rr } = await supabase.from('area_solicitacoes_responsaveis')
        .select('profile_id').eq('area', sol.area_responsavel).eq('profile_id', userId).maybeSingle();
      isAreaResp = !!rr;
    }
    if (!isAdm && !isResp && !isAreaResp) return res.status(403).json({ error: 'Sem permissão.' });
    if (['concluido', 'cancelado', 'rejeitado', 'avaliado'].includes(sol.status)) {
      return res.status(400).json({ error: 'Solicitação já encerrada.' });
    }





    const produtoIds = [...new Set(itens.map(it => it.produto_id).filter(Boolean))];
    const { data: saldos, error: saldoErr } = await supabase.from('vw_log_estoque_saldo')
      .select('id, nome, saldo').in('id', produtoIds);
    if (saldoErr) return res.status(400).json({ error: 'Erro ao checar saldo do estoque: ' + saldoErr.message });
    const saldoPorId = new Map((saldos || []).map(s => [s.id, s]));

    const rows = [];
    for (const it of itens) {
      const qtd = Number(it.quantidade);
      if (!it.produto_id || !qtd || qtd <= 0) return res.status(400).json({ error: 'Item inválido (produto + quantidade > 0).' });
      const prod = saldoPorId.get(it.produto_id);
      const saldoAtual = Number(prod?.saldo || 0);
      if (qtd > saldoAtual) {
        return res.status(400).json({
          error: `Saldo insuficiente em "${prod?.nome || it.produto_id}": disponível ${saldoAtual}, pedido ${qtd}.`,
        });
      }
      rows.push({
        produto_id: it.produto_id, tipo: 'saida', quantidade: qtd,
        data_movimentacao: new Date().toISOString().slice(0, 10),
        area_destino: sol.area_cliente || null,
        motivo: `Atende solicitação: ${sol.titulo}`,
        origem_solicitacao_id: sol.id, feito_por: userId,
      });
    }
    const { error: movErr } = await supabase.from('log_estoque_movimentacoes').insert(rows);
    if (movErr) return res.status(400).json({ error: 'Erro ao baixar do estoque: ' + movErr.message });

    const obs = `${sol.observacoes ? sol.observacoes + '\n' : ''}Atendido pela estoque por ${userName || 'logística'}${observacao ? ` · ${observacao}` : ''}.`;
    const { data, error } = await supabase.from('solicitacoes')
      .update({ status: 'concluido', observacoes: obs }).eq('id', sol.id).select('*').single();
    if (error) return res.status(400).json({ error: error.message });

    notificar({
      modulo: CATEGORIA_MODULO[sol.categoria] || 'logistica',
      tipo: 'solicitacao_status',
      titulo: `Atendida pela estoque: ${sol.titulo}`,
      mensagem: `${userName || 'A logística'} atendeu sua solicitação com itens que já tínhamos no estoque.`,
      link: '/solicitacoes', severidade: 'info',
      chaveDedup: `solicitacao_atendida_estoque_${sol.id}`,
      targetIds: [sol.solicitante_id].filter(Boolean),
    }).catch(err => console.error('[SOLICITACOES] notify atender-estoque:', err.message));

    res.json(data);
  } catch (e) { console.error('[SOLICITACOES] atender-estoque:', e.message); res.status(500).json({ error: e.message }); }
});

module.exports = router;
module.exports.aprovarOrigemInterno = aprovarOrigemInterno;
module.exports.rejeitarOrigemInterno = rejeitarOrigemInterno;
module.exports.aprovarMeritoInterno = aprovarMeritoInterno;
module.exports.rejeitarMeritoInterno = rejeitarMeritoInterno;
module.exports.aprovadoresMeritoIds = aprovadoresMeritoIds;
