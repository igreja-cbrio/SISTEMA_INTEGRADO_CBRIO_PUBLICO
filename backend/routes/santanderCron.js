











const router = require('express').Router();
const { extrairDocumentoDoMemo } = require('../utils/documentoBr');
const { supabase } = require('../utils/supabase');
const {
  AMBIENTE, AGENCIA, CONTA, CNPJ_TITULAR,
  isConfigured, missingEnv,
} = require('../services/santander/httpClient');
const contasService = require('../services/santander/contasService');
const pixApiService = require('../services/santander/pixApiService');
const { matchOfxPix, classificarBatch } = require('../services/financeiroClassificador');
const { isAuthorizedCron } = require('../utils/cronAuth');
const { AppError, ERROR_CODES } = require('../utils/appError');
const { captureHandledException } = require('../utils/sentry');
const { setSystemJobOutcome } = require('../services/systemJobOutcome');
const { reconcileTransactions, summarizeInsertErrors } = require('../services/santander/reconciliation');
const { parseDateBR } = require('../services/pixExtratoParser');

function bankSyncError(error, publicMessage) {
  return new AppError(error?.message || publicMessage, {
    code: ERROR_CODES.BANK_SYNC_FAILED,
    publicMessage,
    cause: error,
    isOperational: false,
  });
}


function checkCronSecret(req, res, next) {
  if (!process.env.CRON_SECRET) {
    return next(new AppError('CRON_SECRET nao configurado', {
      status: 503,
      code: ERROR_CODES.DEPENDENCY_UNAVAILABLE,
      publicMessage: 'Serviço temporariamente indisponível.',
      isOperational: false,
    }));
  }

  if (!isAuthorizedCron(req)) {
    return res.status(401).json({ error: 'Cron secret invalido' });
  }
  next();
}

router.use(checkCronSecret);










async function extratoNormalizado({ inicio, fim, usarCache = false, tolerarDiaIncompleto = false } = {}) {
  const extratoApi = await contasService.consultarExtrato({ inicio, fim, usarCache, tolerarDiaIncompleto });
  const itens = Array.isArray(extratoApi?._content) ? extratoApi._content : [];
  const transacoes = itens.map((t) => {
    const isDebito = t.creditDebitType === 'DEBITO';
    const valorAbs = Number(t.amount || 0);
    return {
      id: t.transactionId,





      data: parseDateBR(t.transactionDate) || t.transactionDate,
      valor: isDebito ? -valorAbs : valorAbs,
      tipo: t.type,
      descricao: t.transactionName,
      partieNome: t.partieName || null,
      partieDoc: t.partieDocumentNumber || null,
      partieBranch: t.partieBranchCode || null,
      partieAccount: t.partieNumber || null,
      raw: t,
    };
  });
  return { transacoes, diasIncompletos: Array.isArray(extratoApi?._diasIncompletos) ? extratoApi._diasIncompletos : [] };
}





async function handlerSync(req, res, next) {
  const startTime = Date.now();


  if (!isConfigured()) {
    setSystemJobOutcome(res, {
      status: 'skipped', effectStatus: 'not_applicable', result: 'santander_nao_configurado',
    });
    return res.json({
      ok: true,
      skipped: 'santander_nao_configurado',
      missing_env: missingEnv(),
      ambiente: AMBIENTE,
    });
  }

  try {
    const { dias = 3, conta_id_override } = req.body || {};
    const dryRun = req.body?.dry_run === true || req.body?.dry_run === 'true';
    const hoje = new Date();
    const desde = new Date(hoje.getTime() - dias * 86400000);
    const inicio = desde.toISOString().slice(0, 10);
    const fim = hoje.toISOString().slice(0, 10);


    let contaLocal;
    if (conta_id_override) {
      const { data } = await supabase.from('fin_contas').select('*').eq('id', conta_id_override).single();
      contaLocal = data;
    } else {

      const { data: contas } = await supabase
        .from('fin_contas')
        .select('*')
        .or(`banco.ilike.%santander%,conta.ilike.%${CONTA}%`);
      contaLocal = (contas || [])[0];
    }

    if (!contaLocal) {
      setSystemJobOutcome(res, {
        status: 'failed', effectStatus: 'failed', errorCode: 'BANK_ACCOUNT_NOT_FOUND',
        errorMessage: 'Conta Santander nao cadastrada no Financeiro.', result: 'conta_santander_nao_cadastrada',
      });
      return res.json({
        ok: false,
        erro: 'conta_santander_nao_cadastrada',
        sugestao: `Cadastre uma conta com banco=Santander ou conta=${CONTA} em /admin/financeiro -> Contas`,
      });
    }






    const { transacoes, diasIncompletos } = await extratoNormalizado({
      inicio, fim, usarCache: false, tolerarDiaIncompleto: true,
    });
    const resumoDiasIncompletos = () => diasIncompletos.map((d) => d.dia).join(', ');

    if (transacoes.length === 0) {



      setSystemJobOutcome(res, diasIncompletos.length ? {
        status: 'failed', effectStatus: 'failed', inputCount: 0, outputCount: 0,
        errorCode: 'BANK_SYNC_DIA_INCOMPLETO',
        errorMessage: `Extrato NAO lido em ${diasIncompletos.length} dia(s): ${resumoDiasIncompletos()}. ${diasIncompletos[0]?.motivo || ''}`.trim(),
        result: 'extrato_nao_lido',
      } : {
        status: 'success', effectStatus: 'confirmed', inputCount: 0, outputCount: 0,
        result: 'sem_transacoes_no_periodo',
      });
      return res.json({
        ok: true,
        conta_id: contaLocal.id,
        sem_transacoes: true,
        periodo: { inicio, fim },
      });
    }
    const reconciliation = await reconcileTransactions(supabase, transacoes);
    if (dryRun) {
      setSystemJobOutcome(res, {
        status: 'skipped', effectStatus: 'not_applicable', inputCount: transacoes.length,
        outputCount: reconciliation.candidates.length, result: 'simulacao_concluida',
      });
      return res.json({
        ok: true,
        dry_run: true,
        conta_id: contaLocal.id,
        periodo: { inicio, fim },
        origem_total: transacoes.length,
        ja_existentes_brutos: reconciliation.existingRaw.size,
        ja_existentes_transacoes: reconciliation.existingFinal.size,
        duplicados_na_origem: reconciliation.duplicateInOrigin,
        candidatos_novos: reconciliation.candidates.length,
        por_data: reconciliation.byDate,
      });
    }
    const extrato = { transacoes: reconciliation.candidates };
    if (extrato.transacoes.length === 0) {
      setSystemJobOutcome(res, {
        status: 'success', effectStatus: 'confirmed', inputCount: transacoes.length,
        outputCount: 0, result: 'todos_lancamentos_ja_existentes',
      });
      return res.json({
        ok: true, conta_id: contaLocal.id, periodo: { inicio, fim },
        origem_total: transacoes.length, inseridos: 0,
        duplicados: reconciliation.existingRaw.size + reconciliation.existingFinal.size + reconciliation.duplicateInOrigin,
      });
    }


    const { data: uploadRow } = await supabase
      .from('fin_uploads')
      .insert({
        tipo: 'ofx',
        conta_id: contaLocal.id,
        arquivo_nome: `[cron] santander-sync-${fim}.json`,
        arquivo_tamanho: 0,
        total_registros: extrato.transacoes.length,
        data_inicio: inicio,
        data_fim: fim,
        status: 'processando',
      })
      .select().single();


    let inseridos = 0;
    let duplicados = reconciliation.existingRaw.size + reconciliation.existingFinal.size + reconciliation.duplicateInOrigin;
    let erros = 0;
    const insertErrors = [];

    for (const t of extrato.transacoes) {
      const tipoTrn = Number(t.valor) >= 0 ? 'CREDIT' : 'DEBIT';
      const memo = t.descricao || '';


      let documento = t.partieDoc || null;
      if (!documento) {



        documento = extrairDocumentoDoMemo(memo)?.documento || null;
      }

      const payload = {
        fonte: 'santander_api',
        conta_id: contaLocal.id,
        data_lancamento: t.data,
        valor: Math.abs(Number(t.valor)),
        tipo_trn: tipoTrn,
        memo,
        nome_contraparte: t.partieNome || null,
        documento_contraparte: documento,
        fitid: t.fitid,
        raw_data: { santander_api: t.raw || t },
        upload_id: uploadRow?.id,
      };

      const { error } = await supabase.from('fin_lancamentos_brutos').insert(payload);
      if (error) {
        if (error.code === '23505') duplicados++;
        else {
          erros++;
          insertErrors.push(error);
        }
      } else {
        inseridos++;
      }
    }


    const matchResult = await matchOfxPix({ uploadId: uploadRow?.id });
    const classifResult = await classificarBatch({ uploadId: uploadRow?.id });


    if (uploadRow) {
      await supabase.from('fin_uploads').update({
        total_novos: inseridos,
        total_duplicados: duplicados,
        total_matched_pix: matchResult.matched,
        total_classificados_auto: classifResult.sugeridos,
        status: erros > 0 ? 'erro' : 'concluido',
        erro_msg: erros > 0 ? `${erros} erros durante insert` : null,
        concluido_em: new Date().toISOString(),
      }).eq('id', uploadRow.id);
    }






    setSystemJobOutcome(res, diasIncompletos.length ? {
      status: 'failed', effectStatus: 'failed', inputCount: extrato.transacoes.length,
      outputCount: inseridos, discardedCount: erros,
      errorCode: 'BANK_SYNC_DIA_INCOMPLETO',
      errorMessage: `Extrato NAO lido em ${diasIncompletos.length} dia(s): ${resumoDiasIncompletos()}. Os demais dias foram importados. ${diasIncompletos[0]?.motivo || ''}`.trim(),
      result: 'sincronizacao_com_dia_incompleto',
    } : erros > 0 ? {
      status: 'warning', effectStatus: 'failed', inputCount: extrato.transacoes.length,
      outputCount: inseridos, discardedCount: erros, errorCode: 'BANK_SYNC_PARTIAL',
      errorMessage: `${erros} lancamentos nao foram inseridos. ${summarizeInsertErrors(insertErrors)}`.trim(),
      result: 'sincronizacao_parcial',
    } : {
      status: 'success', effectStatus: 'confirmed', inputCount: extrato.transacoes.length,
      outputCount: inseridos, discardedCount: 0, result: 'sincronizacao_concluida',
    });

    res.json({
      ok: true,
      ambiente: AMBIENTE,
      periodo: { inicio, fim },
      total: extrato.transacoes.length,
      inseridos, duplicados, erros,
      match_pix: matchResult,
      classificacao: classifResult,
      dias_incompletos: diasIncompletos,
      duracao_ms: Date.now() - startTime,
    });
  } catch (e) {
    console.error('[SANTANDER-CRON] erro:', e.stack || e);
    next(bankSyncError(e, 'Erro ao sincronizar o extrato bancário.'));
  }
}

router.post('/sync', handlerSync);
router.get('/sync', handlerSync);








router.post('/pix-sync', async (req, res, next) => {
  const startTime = Date.now();

  if (!isConfigured()) {
    return res.json({ ok: true, skipped: 'santander_nao_configurado' });
  }

  try {
    const hoje = new Date();
    const horas = Math.min(Math.max(Number(req.body?.horas) || 4, 1), 24);
    const desde = new Date(hoje.getTime() - horas * 3600000);
    const inicio = desde.toISOString().slice(0, 10);
    const fim = hoje.toISOString().slice(0, 10);


    const { data: contas } = await supabase
      .from('fin_contas')
      .select('*')
      .or(`banco.ilike.%santander%,conta.ilike.%${CONTA}%`);
    const contaLocal = (contas || [])[0];

    if (!contaLocal) {
      return res.json({ ok: false, erro: 'conta_santander_nao_cadastrada' });
    }




    let pixApiResult = null;
    if (pixApiService.isEnabled()) {
      try {
        pixApiResult = await pixApiService.buscarPixRecebidos({ inicio, fim });
        if (pixApiResult?.transacoes?.length) {
          let pixInseridos = 0;
          let pixDup = 0;
          for (const pix of pixApiResult.transacoes) {
            const { error } = await supabase
              .from('fin_pix_detalhe')
              .insert({
                ...pix,
                conta_id: contaLocal.id,
              });
            if (error) {
              if (error.code === '23505') pixDup++;
            } else {
              pixInseridos++;
            }
          }
          pixApiResult.inseridos = pixInseridos;
          pixApiResult.duplicados = pixDup;
        }
      } catch (e) {
        console.warn('[pix-sync] API PIX erro:', e.message);
        pixApiResult = { erro: e.message };
        captureHandledException(bankSyncError(e, 'Falha na estratégia PIX.'), req, 'bank.pix_sync.pix_api_fallback');
      }
    }




    const extrato = await extratoNormalizado({ inicio, fim, usarCache: false });
    if (!extrato?.transacoes?.length) {
      return res.json({
        ok: true,
        conta_id: contaLocal.id,
        sem_transacoes: true,
        pix_api: pixApiResult,
      });
    }


    const creditos = extrato.transacoes.filter(t => Number(t.valor) > 0);

    let inseridos = 0;
    let duplicados = 0;

    for (const t of creditos) {
      const memo = t.descricao || t.memo || '';

      const documento = extrairDocumentoDoMemo(memo)?.documento || null;

      const payload = {
        fonte: 'santander_api',
        conta_id: contaLocal.id,
        data_lancamento: t.data,
        valor: Number(t.valor),
        tipo_trn: 'CREDIT',
        memo,
        fitid: t.id || t.fitid || `santander-${t.data}-${t.valor}-${Math.random().toString(36).slice(2, 8)}`,
        documento_contraparte: documento,
        raw_data: { santander_api: t, source: 'pix-sync' },
      };

      const { error } = await supabase.from('fin_lancamentos_brutos').insert(payload);
      if (error) {
        if (error.code === '23505') duplicados++;
      } else {
        inseridos++;
      }
    }


    const matchResult = await matchOfxPix({ conta_id: contaLocal.id });
    const classifResult = await classificarBatch({});

    res.json({
      ok: true,
      ambiente: AMBIENTE,
      janela_horas: horas,
      total_creditos: creditos.length,
      inseridos, duplicados,
      match_pix: matchResult,
      classificacao: classifResult,
      pix_api: pixApiResult,
      duracao_ms: Date.now() - startTime,
    });
  } catch (e) {
    console.error('[SANTANDER-PIX-SYNC] erro:', e);
    next(bankSyncError(e, 'Erro ao sincronizar recebimentos PIX.'));
  }
});





async function handlerSaldoCron(req, res, next) {
  if (!isConfigured()) {
    return res.json({ ok: true, skipped: 'santander_nao_configurado' });
  }
  try {
    const contas = require('../services/santander/contasService');
    const saldo = await contas.snapshotSaldoDoDia({ userId: null });
    res.json({
      ok: true,
      available: saldo.available,
      total: saldo.total,
      atualizado_em: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[SANTANDER-CRON saldo]', e.message);
    next(bankSyncError(e, 'Erro ao atualizar o saldo bancário.'));
  }
}
router.post('/saldo', handlerSaldoCron);
router.get('/saldo', handlerSaldoCron);




router.get('/health', async (req, res) => {
  res.json({
    cron_secret_configurado: !!process.env.CRON_SECRET,
    santander_configurado: isConfigured(),
    missing_env: missingEnv(),
    ambiente: AMBIENTE,
    agencia: AGENCIA,
    conta: CONTA,
    cnpj_titular: CNPJ_TITULAR,
  });
});

module.exports = router;
