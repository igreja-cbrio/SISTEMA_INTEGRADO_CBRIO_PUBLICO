








const { callApi } = require('./httpClient');
const { supabase } = require('../../utils/supabase');

const ENABLED = (process.env.SANTANDER_BOLETOS_ENABLED || 'false').toLowerCase() === 'true';
const BASE_PATH_OVERRIDE = process.env.SANTANDER_BOLETOS_BASE_PATH || '';
const WORKSPACE_ID = process.env.SANTANDER_BOLETOS_WORKSPACE_ID || '';
const COVENANT_CODE = process.env.SANTANDER_BOLETOS_COVENANT_CODE || process.env.SANTANDER_CONTA || '';
const BENEFICIARY_DOC = process.env.SANTANDER_CNPJ_TITULAR || '';



const DEFAULT_BOLETOS_PATHS = [
  '/collection_bill_management/v2',
  '/collection_bill_management/v1',
  '/bill_management/v2',
  '/bills/v1',
  '/cobranca/v2',
  '/banking/v1/collection',
];

const BOLETOS_PATHS = BASE_PATH_OVERRIDE
  ? [BASE_PATH_OVERRIDE, ...DEFAULT_BOLETOS_PATHS.filter(p => p !== BASE_PATH_OVERRIDE)]
  : DEFAULT_BOLETOS_PATHS;

let pathFuncionando = null;

function isPathNaoExiste(err) {
  const msg = (err.message || '').toLowerCase();
  return msg.includes('404')
    || msg.includes('applicationnotfound')
    || msg.includes('unable to identify proxy')
    || msg.includes('not found')
    || msg.includes('resource not found');
}

async function tentarComPaths(fn) {
  if (pathFuncionando) return fn(pathFuncionando);
  const errosPorPath = [];
  for (const p of BOLETOS_PATHS) {
    try {
      const res = await fn(p);
      pathFuncionando = p;
      return res;
    } catch (e) {
      errosPorPath.push({ path: p, status: e.status || '?', msg: (e.message || '').slice(0, 120) });
      if (!isPathNaoExiste(e)) {
        const ag = new Error(`${e.message}\n\nPaths tentados antes deste:\n${errosPorPath.map((x, i) => `  ${i+1}. [${x.status}] ${x.path}`).join('\n')}`);
        ag.status = e.status;
        ag.body = e.body;
        ag.tentativas = errosPorPath;
        throw ag;
      }
    }
  }
  const ag = new Error(
    `Nenhum dos ${BOLETOS_PATHS.length} paths Santander Boletos respondeu. Tentativas:\n` +
    errosPorPath.map((x, i) => `  ${i+1}. [${x.status}] ${x.path}`).join('\n')
  );
  ag.tentativas = errosPorPath;
  throw ag;
}

function isEnabled() { return ENABLED; }
function getPathFuncionando() { return pathFuncionando; }

function getConfig() {
  return {
    enabled: ENABLED,
    workspace_id: WORKSPACE_ID,
    workspace_preview: WORKSPACE_ID ? WORKSPACE_ID.slice(0, 6) + '***' : null,
    covenant_code: COVENANT_CODE ? COVENANT_CODE.slice(0, 4) + '***' : null,
    beneficiary_doc: BENEFICIARY_DOC ? BENEFICIARY_DOC.slice(0, 4) + '***' : null,
    base_paths_tested: BOLETOS_PATHS,
    base_path_working: pathFuncionando,
  };
}





async function gerarNossoNumero() {
  const { data, error } = await supabase.rpc('santander_proximo_nosso_numero');
  if (error || !data) {

    return String(Math.floor(Date.now() / 1000)).slice(-13);
  }
  return String(data).padStart(13, '0').slice(-13);
}













async function emitirBoleto({
  nossoNumero, valor, vencimento, pagador, descricao, instrucoes, encargos,
}) {
  if (!ENABLED) throw new Error('Boletos desabilitado · setar SANTANDER_BOLETOS_ENABLED=true');
  if (!WORKSPACE_ID) throw new Error('SANTANDER_BOLETOS_WORKSPACE_ID não configurado');
  if (!nossoNumero) throw new Error('nossoNumero obrigatorio');
  if (!valor || valor <= 0) throw new Error('valor invalido');
  if (!vencimento) throw new Error('vencimento obrigatorio');
  if (!pagador?.nome) throw new Error('pagador.nome obrigatorio');

  const docNorm = String(pagador.documento || '').replace(/\D/g, '');
  const tipoDoc = pagador.tipoDoc || (docNorm.length === 11 ? 'CPF' : 'CNPJ');


  const body = {
    nsuCode: nossoNumero,
    nsuDate: new Date().toISOString().slice(0, 10),
    covenantCode: COVENANT_CODE || undefined,
    bankNumber: nossoNumero,
    clientNumber: nossoNumero,
    dueDate: vencimento,
    issueDate: new Date().toISOString().slice(0, 10),
    nominalValue: Number(valor).toFixed(2),
    payer: {
      name: String(pagador.nome).slice(0, 100),
      documentType: tipoDoc,
      documentNumber: docNorm || undefined,
      address: pagador.logradouro ? String(pagador.logradouro).slice(0, 80) : undefined,
      addressNumber: pagador.numero || undefined,
      neighborhood: pagador.bairro ? String(pagador.bairro).slice(0, 30) : undefined,
      city: pagador.cidade || undefined,
      state: pagador.uf || undefined,
      zipCode: (pagador.cep || '').replace(/\D/g, '') || undefined,
      email: pagador.email || undefined,
      phoneNumber: (pagador.telefone || '').replace(/\D/g, '') || undefined,
    },
    beneficiary: BENEFICIARY_DOC ? {
      documentType: BENEFICIARY_DOC.length === 14 ? 'CNPJ' : 'CPF',
      documentNumber: BENEFICIARY_DOC,
    } : undefined,
    documentKind: 'DUPLICATA_MERCANTIL',
    messages: [
      descricao ? String(descricao).slice(0, 100) : null,
      instrucoes ? String(instrucoes).slice(0, 100) : null,
    ].filter(Boolean),
  };


  if (encargos?.multaPct && encargos.multaPct > 0) {
    body.fineQuantityDays = 0;
    body.finePercentage = Number(encargos.multaPct).toFixed(2);
  }
  if (encargos?.jurosPctDia && encargos.jurosPctDia > 0) {
    body.interestPercentage = Number(encargos.jurosPctDia).toFixed(4);
  }
  if (encargos?.descontoValor && encargos.descontoValor > 0 && encargos?.descontoDataLimite) {
    body.discountOne = {
      value: Number(encargos.descontoValor).toFixed(2),
      limitDate: encargos.descontoDataLimite,
    };
  }

  return tentarComPaths(base =>
    callApi(`${base}/workspaces/${encodeURIComponent(WORKSPACE_ID)}/bank_slips`, {
      method: 'POST', body,
    })
  );
}

async function consultarBoleto(nossoNumero) {
  if (!ENABLED) throw new Error('Boletos desabilitado');
  if (!WORKSPACE_ID) throw new Error('WORKSPACE_ID não configurado');
  return tentarComPaths(base =>
    callApi(`${base}/workspaces/${encodeURIComponent(WORKSPACE_ID)}/bank_slips/${encodeURIComponent(nossoNumero)}`, {
      method: 'GET',
    })
  );
}

async function cancelarBoleto(nossoNumero) {
  if (!ENABLED) throw new Error('Boletos desabilitado');
  if (!WORKSPACE_ID) throw new Error('WORKSPACE_ID não configurado');
  return tentarComPaths(base =>
    callApi(`${base}/workspaces/${encodeURIComponent(WORKSPACE_ID)}/bank_slips/${encodeURIComponent(nossoNumero)}`, {
      method: 'PATCH',
      body: { operation: 'BAIXAR', status: 'BAIXADO' },
    })
  );
}




function mapStatus(s) {
  if (!s) return 'PENDENTE';
  const norm = String(s).toUpperCase();
  if (['REGISTRADO', 'REGISTERED', 'EMITIDO', 'CRIADO', 'CREATED'].includes(norm)) return 'REGISTRADO';
  if (['LIQUIDADO', 'PAID', 'PAGO'].includes(norm)) return 'LIQUIDADO';
  if (['BAIXADO', 'CANCELLED', 'CANCELADO'].includes(norm)) return 'BAIXADO';
  if (['PROTESTADO', 'PROTESTED'].includes(norm)) return 'PROTESTADO';
  return norm;
}

module.exports = {
  isEnabled,
  getConfig,
  gerarNossoNumero,
  emitirBoleto,
  consultarBoleto,
  cancelarBoleto,
  mapStatus,
};
