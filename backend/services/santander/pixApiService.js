
















const { callApi } = require('./httpClient');
const { parseDateBR } = require('../pixExtratoParser');

const PIX_API_ENABLED = (process.env.SANTANDER_PIX_API_ENABLED || 'false').toLowerCase() === 'true';
const PIX_API_PATH_OVERRIDE = process.env.SANTANDER_PIX_API_PATH || '';



const PIX_API_PATHS = PIX_API_PATH_OVERRIDE ? [PIX_API_PATH_OVERRIDE] : [
  '/pix/v1/recebimentos',
  '/pix/v1/payments-received',
  '/pix_recebidos/v1/payments',
  '/pix/v1/pix-received',
  '/banking/v1/pix/received-payments',
];

let pathFuncionando = null;

function isEnabled() {
  return PIX_API_ENABLED;
}






function decodeEndToEndId(e2eId) {
  if (!e2eId || typeof e2eId !== 'string' || !e2eId.startsWith('E') || e2eId.length < 21) {
    return null;
  }
  const ispb = e2eId.substring(1, 9);
  const yyyy = e2eId.substring(9, 13);
  const mm = e2eId.substring(13, 15);
  const dd = e2eId.substring(15, 17);
  const hh = e2eId.substring(17, 19);
  const mi = e2eId.substring(19, 21);
  if (!/^\d+$/.test(ispb + yyyy + mm + dd + hh + mi)) return null;
  const utc = new Date(Date.UTC(+yyyy, +mm - 1, +dd, +hh, +mi));
  if (isNaN(utc.getTime())) return null;
  const brt = new Date(utc.getTime() - 3 * 3600 * 1000);
  const pad = n => String(n).padStart(2, '0');
  return {
    ispb,
    datetime_utc: utc,
    datetime_brt: brt,
    data: `${brt.getUTCFullYear()}-${pad(brt.getUTCMonth() + 1)}-${pad(brt.getUTCDate())}`,
    hora: `${pad(brt.getUTCHours())}:${pad(brt.getUTCMinutes())}:00`,
    datetime_brt_iso: `${brt.getUTCFullYear()}-${pad(brt.getUTCMonth() + 1)}-${pad(brt.getUTCDate())}T${pad(brt.getUTCHours())}:${pad(brt.getUTCMinutes())}:00`,
  };
}




function normalizarPix(raw) {

  const e2eId = raw.endToEndId || raw.endToEndID || raw.id_transacao
    || raw.transactionId || raw.idTransacao || raw.txid || null;
  const decoded = decodeEndToEndId(e2eId);

  const valor = Number(
    raw.amount || raw.valor || raw.transactionAmount
    || raw.amount_received || raw.valor_recebido || 0
  );

  const pagadorNome = raw.payerName || raw.pagador?.nome || raw.payer?.name
    || raw.nomePagador || raw.fromName || null;
  const pagadorDoc = raw.payerDocument || raw.pagador?.documento || raw.payer?.document
    || raw.documentoPagador || null;
  const bancoOrigem = raw.payerBankName || raw.pagador?.banco || raw.fromBank
    || raw.bancoOrigem || raw.payerInstitutionName || null;
  const tituloPagador = raw.titularity || raw.titularidade || null;

  return {
    end_to_end_id: e2eId,



    data: decoded?.data || parseDateBR(raw.transactionDate) || parseDateBR(raw.data) || null,
    hora: decoded?.hora || null,
    datetime_brt: decoded?.datetime_brt_iso || null,
    datetime_utc: decoded ? decoded.datetime_utc.toISOString() : null,
    valor: Math.abs(valor),
    tipo: 'recebido',
    banco_origem: bancoOrigem,
    ispb_origem: decoded?.ispb || null,
    pagador_nome: pagadorNome,
    pagador_documento: pagadorDoc ? String(pagadorDoc).replace(/\D/g, '') : null,
    titularidade: tituloPagador,
    raw_data: raw,
  };
}





async function buscarPixRecebidos({ inicio, fim, userId } = {}) {
  if (!isEnabled()) {
    return { habilitado: false, transacoes: [], skipped: 'pix_api_nao_habilitado' };
  }

  const pathsParaTentar = pathFuncionando ? [pathFuncionando] : PIX_API_PATHS;
  const tentativas = [];

  for (const path of pathsParaTentar) {
    try {
      const data = await callApi(path, {
        query: { startDate: inicio, endDate: fim, initialDate: inicio, finalDate: fim },
        userId,
      });


      pathFuncionando = path;


      const lista = Array.isArray(data) ? data
        : (data?.payments || data?.transactions || data?.recebimentos
           || data?.data || data?.content || []);

      const transacoes = lista.map(normalizarPix).filter(t => t.end_to_end_id || t.valor > 0);

      return {
        habilitado: true,
        path_usado: path,
        total: transacoes.length,
        transacoes,
      };
    } catch (e) {
      tentativas.push({ path, status: e.status, msg: (e.message || '').slice(0, 120) });

      if (e.status === 401 || e.status === 403) {
        return { habilitado: true, erro: 'sem_permissao', tentativas, transacoes: [] };
      }

      continue;
    }
  }

  return {
    habilitado: true,
    erro: 'nenhum_path_funcionou',
    tentativas,
    transacoes: [],
    dica: 'Verifique se o produto PIX esta contratado na aplicação Santander · ou configure SANTANDER_PIX_API_PATH com o path correto',
  };
}

module.exports = {
  isEnabled,
  buscarPixRecebidos,
  decodeEndToEndId,
  PIX_API_PATHS,
};
