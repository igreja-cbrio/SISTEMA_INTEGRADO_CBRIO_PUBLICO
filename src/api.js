import { supabase } from './supabaseClient';

import { fetchPublicoComRetry as npsFetchRetry } from './lib/censoApi';
import { resolveApiBaseUrl } from './lib/api-base';
import { captureApiError } from './lib/sentry';


const API = resolveApiBaseUrl(import.meta.env.VITE_API_URL);






let _cachedToken = null;
if (supabase) {
  supabase.auth.getSession()
    .then(({ data }) => { _cachedToken = data?.session?.access_token || null; })
    .catch(() => {});
  supabase.auth.onAuthStateChange((_event, session) => {
    _cachedToken = session?.access_token || null;
  });
}



function tokenExpirado(t) {
  try {
    const p = JSON.parse(atob(t.split('.')[1]));
    return !p.exp || p.exp * 1000 < Date.now() + 30000;
  } catch { return false; }
}

async function getToken() {
  if (!supabase) return null;





  if (_cachedToken && !tokenExpirado(_cachedToken)) return _cachedToken;




  try {
    const session = await Promise.race([
      supabase.auth.getSession().then(({ data }) => data?.session || null),
      new Promise((resolve) => setTimeout(() => resolve(null), 3000)),
    ]);
    if (session?.access_token) {
      _cachedToken = session.access_token;
      return _cachedToken;
    }
  } catch {

  }




  if (_cachedToken && tokenExpirado(_cachedToken)) {
    try {


      const refreshed = await Promise.race([
        supabase.auth.refreshSession().then(({ data }) => data?.session?.access_token || null),
        new Promise((resolve) => setTimeout(() => resolve(null), 8000)),
      ]);
      if (refreshed && !tokenExpirado(refreshed)) { _cachedToken = refreshed; return _cachedToken; }
    } catch {              }
    return null;
  }
  return _cachedToken;
}

const headers = async () => {
  const token = await getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};





let _deadSessionHandled = false;
async function handleDeadSession() {
  if (_deadSessionHandled) return;
  _deadSessionHandled = true;
  try { await supabase?.auth.signOut(); } catch {}
  try {
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.replace('/login');
    }
  } catch {}
}

async function request(path, opts = {}) {
  const h = await headers();


  const { timeout = 30000, ...rest } = opts;
  const method = String(rest.method || 'GET').toUpperCase();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let res;
  try {
    res = await fetch(`${API}${path}`, { ...rest, headers: { ...h, ...rest.headers }, signal: controller.signal });
  } catch (cause) {
    if (cause?.name === 'AbortError') {
      const error = Object.assign(new Error('Tempo esgotado ao falar com o servidor. Recarregue a página ou tente de novo.'), { code: 'API_TIMEOUT' });
      captureApiError(error, { path, method, kind: 'timeout', code: error.code });
      throw error;
    }
    captureApiError(cause, { path, method, kind: 'network', code: 'API_NETWORK_ERROR' });
    throw cause;
  } finally {
    clearTimeout(timer);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    const error = Object.assign(new Error('Backend não disponível. Os módulos funcionam apenas com o servidor rodando.'), { code: 'API_INVALID_RESPONSE', status: res.status });
    captureApiError(error, { path, method, kind: 'protocol', status: res.status, code: error.code });
    throw error;
  }

  if (res.status === 401) {
    const body = await res.json().catch(() => ({}));
    console.warn('[API] 401', { path, reason: body.reason, detail: body.detail });




    if (body.reason === 'invalid_token') {
      handleDeadSession();
    }
    const reasonMsg = {
      no_token:       'Sessão expirada. Faça login novamente.',
      invalid_token:  'Sua sessão expirou. Redirecionando para o login...',
    };
    const error = new Error(reasonMsg[body.reason] || body.error || 'Não autorizado. Verifique se o backend está configurado corretamente.');
    error.requestId = res.headers.get('x-request-id') || body.request_id || null;
    throw error;
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    const error = new Error(err.error || `HTTP ${res.status}`);

    Object.assign(error, err);
    error.status = res.status;
    error.requestId = res.headers.get('x-request-id') || err.request_id || null;
    captureApiError(error, {
      path,
      method,
      kind: 'response',
      status: res.status,
      requestId: error.requestId,
      code: error.code,
    });
    throw error;
  }
  try {
    return await res.json();
  } catch (cause) {
    const error = Object.assign(new Error('Resposta inválida recebida do servidor.'), { code: 'API_INVALID_JSON', status: res.status, cause });
    captureApiError(error, { path, method, kind: 'protocol', status: res.status, code: error.code });
    throw error;
  }
}

const get = (path, opts) => request(path, { ...opts });


const post = (path, body, opts) => request(path, { method: 'POST', body: JSON.stringify(body), ...opts });
const put = (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) });
const patch = (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) });


const del = (path, body) => request(path, body === undefined
  ? { method: 'DELETE' }
  : { method: 'DELETE', body: JSON.stringify(body) });

export const users = {
  list: () => get('/auth/users'),
  me: () => get('/auth/me'),
};



export const tutorial = {
  progress: () => get('/tutorial/progress'),
  complete: (tour_id, status) => post('/tutorial/complete', { tour_id, status }),
  reset: (tour_id) => del('/tutorial/progress' + (tour_id ? `?tour_id=${encodeURIComponent(tour_id)}` : '')),
};


export const face = {
  reconhecer: (data) => post('/face/reconhecer', data),
  resumo: (params) => get('/face/presencas/resumo' + (params ? '?' + new URLSearchParams(params) : '')),
  presencaLista: (params) => get('/face/presencas/lista' + (params ? '?' + new URLSearchParams(params) : '')),
  cultos: () => get('/face/cultos'),
  anonimos: (params) => get('/face/anonimos' + (params ? '?' + new URLSearchParams(params) : '')),
  vincular: (anonId, membro_id) => post(`/face/anonimos/${anonId}/vincular`, { membro_id }),
  cadastrar: (anonId, data) => post(`/face/anonimos/${anonId}/cadastrar`, data),
  descartar: (anonId) => post(`/face/anonimos/${anonId}/descartar`, {}),
  importarAnonimo: (data) => post('/face/anonimos/importar', data),
  galeria: (params) => get('/face/membros/galeria' + (params ? '?' + new URLSearchParams(params) : '')),


  fotoBlobUrl: async (membroId) => {
    const token = await getToken();
    const res = await fetch(`${API}/face/membros/${membroId}/foto`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new Error('Falha ao carregar a foto');
    return URL.createObjectURL(await res.blob());
  },
  enroll: (membroId, descriptor, consentimento) => post(`/face/membros/${membroId}/enroll`, { descriptor, consentimento }),
  removerEnroll: (membroId) => del(`/face/membros/${membroId}/enroll`),
};


export const feedback = {
  enviar: (data) => post('/feedback', data),
  list: (params) => get('/feedback' + (params ? '?' + new URLSearchParams(params) : '')),
  resumo: () => get('/feedback/resumo'),
  erros: () => get('/feedback/erros'),
  relatorios: () => get('/feedback/relatorios'),
  atualizar: (id, data) => patch(`/feedback/${id}`, data),
};

export const events = {
  list: (params) => get('/events' + (params ? '?' + new URLSearchParams(params) : '')),
  dashboard: () => get('/events/dashboard'),
  categories: () => get('/events/categories'),
  get: (id) => get(`/events/${id}`),
  create: (data) => post('/events', data),
  update: (id, data) => put(`/events/${id}`, data),
  updateStatus: (id, status) => patch(`/events/${id}/status`, { status }),
  remove: (id) => del(`/events/${id}`),
  updateOccurrence: (evId, occId, data) => patch(`/events/${evId}/occurrences/${occId}`, data),
  createTask: (evId, data) => post(`/events/${evId}/tasks`, data),
  updateTask: (taskId, data) => put(`/events/tasks/${taskId}`, data),
  updateTaskStatus: (taskId, status) => patch(`/events/tasks/${taskId}/status`, { status }),
  removeTask: (taskId) => del(`/events/tasks/${taskId}`),
  createSubtask: (taskId, data) => post(`/events/tasks/${taskId}/subtasks`, data),
  toggleSubtask: (subId, done) => patch(`/events/subtasks/${subId}`, { done }),
  removeSubtask: (subId) => del(`/events/subtasks/${subId}`),
  addComment: (taskId, text) => post(`/events/tasks/${taskId}/comments`, { text }),
  simpleTemplates: () => get('/events/simple-templates'),
  createSimpleTemplate: (data) => post('/events/simple-templates', data),
  deleteSimpleTemplate: (id) => del(`/events/simple-templates/${id}`),
  toggleSimpleTemplate: (id) => patch(`/events/simple-templates/${id}/toggle`, {}),
  applySimpleTemplates: (eventId) => post(`/events/${eventId}/apply-simple-templates`, {}),

  setVisivelPainelRh: (id, visivel_painel_rh) => patch(`/events/${id}/visivel-painel-rh`, { visivel_painel_rh }),
};




export const campanhas = {
  list: (params) => get('/campanhas' + (params ? '?' + new URLSearchParams(params) : '')),
  get: (id) => get(`/campanhas/${id}`),
  criar: (data) => post('/campanhas', data),
  atualizar: (id, data) => put(`/campanhas/${id}`, data),
  status: (id, status) => post(`/campanhas/${id}/status`, { status }),
  remover: (id) => del(`/campanhas/${id}`),
  digitos: () => get('/campanhas/digitos'),
  segmentos: () => get('/campanhas/segmentos'),
  aux: () => get('/campanhas/aux'),


  definirDigito: (id, digito, motivo) => post(`/campanhas/${id}/digito`, { digito, motivo }),
  digitoHistorico: (id) => get(`/campanhas/${id}/digito-historico`),
  lancamentos: (id) => get(`/campanhas/${id}/lancamentos`),
  pendentes: (id) => get(`/campanhas/${id}/pendentes`),
  vincular: (id, data) => post(`/campanhas/${id}/vinculo`, data),
  desvincular: (id, vinculoId) => del(`/campanhas/${id}/vinculo/${vinculoId}`),

  templates: () => get('/campanhas/templates'),

  programas: (params) => get('/campanhas/programas' + (params ? '?' + new URLSearchParams(params) : '')),
  programaEdicoes: (id) => get(`/campanhas/programas/${id}/edicoes`),
  programaAtualizar: (id, data) => patch(`/campanhas/programas/${id}`, data),
  inscritos: (id) => get(`/campanhas/${id}/inscritos`),
  alvoHistorico: (id) => get(`/campanhas/${id}/alvo-historico`),
  comparativo: (id) => get(`/campanhas/${id}/comparativo`),
  cicloCriativo: (id) => post(`/campanhas/${id}/ciclo-criativo`, {}),
  auxContabil: () => get('/campanhas/aux-contabil'),
  ativacoes: {
    list: (id) => get(`/campanhas/${id}/ativacoes`),
    criar: (id, data) => post(`/campanhas/${id}/ativacoes`, data),
    adotar: (id, data) => post(`/campanhas/${id}/ativacoes/adotar`, data),
    remover: (id, linkId) => del(`/campanhas/${id}/ativacoes/${linkId}`),
  },
  marcos: {
    criar: (id, data) => post(`/campanhas/${id}/marcos`, data),
    atualizar: (marcoId, data) => put(`/campanhas/marcos/${marcoId}`, data),
    remover: (marcoId) => del(`/campanhas/marcos/${marcoId}`),
  },
  disparos: {
    previa: (id, data) => post(`/campanhas/${id}/disparos/previa`, data),
    criar: (id, data) => post(`/campanhas/${id}/disparos`, data),
    atualizar: (disparoId, data) => put(`/campanhas/disparos/${disparoId}`, data),
    agendar: (disparoId, agendado_para) => post(`/campanhas/disparos/${disparoId}/agendar`, { agendado_para }),
    cancelar: (disparoId) => post(`/campanhas/disparos/${disparoId}/cancelar`, {}),
    envios: (disparoId) => get(`/campanhas/disparos/${disparoId}/envios`),
  },
  agradecimentos: {
    list: (id) => get(`/campanhas/${id}/agradecimentos`),
    rodar: () => post('/campanhas/agradecimentos/rodar', {}),
  },
};




export const censo = {
  aux: () => get('/censo/aux'),

  pesquisas: () => get('/censo/pesquisas'),
  pesquisa: (id) => get(`/censo/pesquisas/${id}`),
  criar: (data) => post('/censo/pesquisas', data),
  atualizar: (id, data) => put(`/censo/pesquisas/${id}`, data),
  status: (id, status) => post(`/censo/pesquisas/${id}/status`, { status }),
  duplicar: (id, data) => post(`/censo/pesquisas/${id}/duplicar`, data || {}),
  remover: (id) => del(`/censo/pesquisas/${id}`),





  respostas: (pesquisaId, limite, offset) =>
    get(`/censo/respostas?pesquisa_id=${pesquisaId}${limite ? `&limite=${limite}` : ''}${offset ? `&offset=${offset}` : ''}`),
  resposta: (id) => get(`/censo/respostas/${id}`),


  removerResposta: (id) => del(`/censo/respostas/${id}`),


  cuidadoResumo: (pesquisaId) => get(`/censo/cuidado/resumo?pesquisa_id=${pesquisaId}`),
  cuidado: (pesquisaId, filtros = {}) => {
    const qs = new URLSearchParams({ pesquisa_id: pesquisaId });
    if (filtros.status) qs.set('status', filtros.status);
    if (filtros.tipo) qs.set('tipo', filtros.tipo);
    return get(`/censo/cuidado?${qs}`);
  },
  cuidadoAtualizar: (id, dados) => patch(`/censo/cuidado/${id}`, dados),



  pendentes: (pesquisaId) => get(`/censo/pendentes?pesquisa_id=${pesquisaId}`),
  posProcessar: (pesquisaId, limite) =>
    post('/censo/pos-processar', { pesquisa_id: pesquisaId, limite }),



  cobertura: (pesquisaId) => get(`/censo/cobertura?pesquisa_id=${pesquisaId}`),


  perfil: (pesquisaId) => get(`/censo/perfil?pesquisa_id=${pesquisaId}`),
  perfilMapa: (pesquisaId) => get(`/censo/perfil/mapa?pesquisa_id=${pesquisaId}`),

  perfilCruzamento: (pesquisaId) => get(`/censo/perfil/cruzamento?pesquisa_id=${pesquisaId}`, { timeout: 60000 }),
  relatorio: (pesquisaId) => get(`/censo/relatorio?pesquisa_id=${pesquisaId}`),




  potencialResumo: (pesquisaId) => get(`/censo/potencial/resumo?pesquisa_id=${pesquisaId}`),
  potencial: (pesquisaId) => get(`/censo/potencial?pesquisa_id=${pesquisaId}`),


  potencialVoluntariosResumo: (pesquisaId) => get(`/censo/potencial/voluntarios/resumo?pesquisa_id=${pesquisaId}`),
  potencialVoluntarios: (pesquisaId) => get(`/censo/potencial/voluntarios?pesquisa_id=${pesquisaId}`),


  potencialGruposResumo: (pesquisaId) => get(`/censo/potencial/grupos/resumo?pesquisa_id=${pesquisaId}`),
  potencialGrupos: (pesquisaId) => get(`/censo/potencial/grupos?pesquisa_id=${pesquisaId}`),




  potencialParaCuidado: (respostaId, tipo = 'conversa', observacao) =>
    post('/censo/potencial/cuidado', { resposta_id: respostaId, tipo, observacao }),





  gerarRelatorio: (pesquisaId) => post('/censo/relatorio', { pesquisa_id: pesquisaId }, { timeout: 600000 }),
  ia: {
    obter: (pesquisaId) => get(`/censo/ia?pesquisa_id=${pesquisaId}`),




    gerar: (pesquisaId) => post('/censo/ia', { pesquisa_id: pesquisaId }, { timeout: 600000 }),
  },
};


export const links = {
  listar: () => get('/links'),
  obter: (id) => get(`/links/${id}`),
  criar: (dados) => post('/links', dados),

  atualizar: (id, dados) => put(`/links/${id}`, dados),
  remover: (id) => del(`/links/${id}`),


  paraDestino: (dados) => post('/links/para-destino', dados),


  catalogo: () => get('/links/catalogo'),
};

export const projects = {
  categories: () => get('/projects/categories'),
  dashboard: () => get('/projects/dashboard'),
  list: (params) => get('/projects' + (params ? '?' + new URLSearchParams(params) : '')),
  get: (id) => get(`/projects/${id}`),
  create: (data) => post('/projects', data),
  update: (id, data) => put(`/projects/${id}`, data),
  remove: (id) => del(`/projects/${id}`),
  createPhase: (pId, data) => post(`/projects/${pId}/phases`, data),
  updatePhase: (phaseId, data) => patch(`/projects/phases/${phaseId}`, data),
  createTask: (pId, data) => post(`/projects/${pId}/tasks`, data),
  updateTask: (taskId, data) => put(`/projects/tasks/${taskId}`, data),
  updateTaskStatus: (taskId, status) => patch(`/projects/tasks/${taskId}/status`, { status }),
  removeTask: (taskId) => del(`/projects/tasks/${taskId}`),
  createSubtask: (taskId, data) => post(`/projects/tasks/${taskId}/subtasks`, data),
  toggleSubtask: (subId, done) => patch(`/projects/subtasks/${subId}`, { done }),
  removeSubtask: (subId) => del(`/projects/subtasks/${subId}`),
  addComment: (taskId, text) => post(`/projects/tasks/${taskId}/comments`, { text }),
  createMilestone: (pId, data) => post(`/projects/${pId}/milestones`, data),
  updateMilestone: (mId, data) => put(`/projects/milestones/${mId}`, data),
  updateMilestoneStatus: (mId, status) => patch(`/projects/milestones/${mId}/status`, { status }),
  createKpi: (pId, data) => post(`/projects/${pId}/kpis`, data),
  updateKpi: (kpiId, data) => patch(`/projects/kpis/${kpiId}`, data),
  removeKpi: (kpiId) => del(`/projects/kpis/${kpiId}`),
  createRisk: (pId, data) => post(`/projects/${pId}/risks`, data),
  updateRisk: (riskId, data) => patch(`/projects/risks/${riskId}`, data),
  removeRisk: (riskId) => del(`/projects/risks/${riskId}`),
  createBudgetItem: (pId, data) => post(`/projects/${pId}/budget`, data),
  updateBudgetItem: (itemId, data) => patch(`/projects/budget/${itemId}`, data),
  removeBudgetItem: (itemId) => del(`/projects/budget/${itemId}`),
  getRetrospective: (pId) => get(`/projects/${pId}/retrospective`),
  saveRetrospective: (pId, data) => post(`/projects/${pId}/retrospective`, data),
};

export const expansion = {
  dashboard: () => get('/expansion/dashboard'),
  milestones: () => get('/expansion/milestones'),
  createMilestone: (data) => post('/expansion/milestones', data),
  updateMilestone: (id, data) => put(`/expansion/milestones/${id}`, data),
  removeMilestone: (id) => del(`/expansion/milestones/${id}`),
  createTask: (miId, data) => post(`/expansion/milestones/${miId}/tasks`, data),
  updateTask: (id, data) => put(`/expansion/tasks/${id}`, data),
  removeTask: (id) => del(`/expansion/tasks/${id}`),
  createSubtask: (taskId, data) => post(`/expansion/tasks/${taskId}/subtasks`, data),
  updateSubtaskPct: (id, pct) => patch(`/expansion/subtasks/${id}`, { pct }),
  removeSubtask: (id) => del(`/expansion/subtasks/${id}`),
  getDependents: (id) => get(`/expansion/milestones/${id}/dependents`),
  getDependencies: (id) => get(`/expansion/milestones/${id}/dependencies`),

  planos: () => get('/expansion/planos'),
  createPlano: (data) => post('/expansion/planos', data),
  updatePlano: (id, data) => put(`/expansion/planos/${id}`, data),
  encerrarPlano: (id, data) => post(`/expansion/planos/${id}/encerrar`, data),
  reabrirPlano: (id) => post(`/expansion/planos/${id}/reabrir`, {}),
  removePlano: (id) => del(`/expansion/planos/${id}`),
};


export const eventosExternos = {
  list: () => get('/eventos-externos'),
  get: (id) => get(`/eventos-externos/${id}`),
  criar: (data) => post('/eventos-externos', data),
  atualizar: (id, data) => put(`/eventos-externos/${id}`, data),
  remover: (id) => del(`/eventos-externos/${id}`),
  sortear: (id, premio) => post(`/eventos-externos/${id}/sortear`, { premio }),
  atualizarInscricao: (eventoId, inscricaoId, data) => patch(`/eventos-externos/${eventoId}/inscricoes/${inscricaoId}`, data),
  excluirInscricao: (eventoId, inscricaoId) => del(`/eventos-externos/${eventoId}/inscricoes/${inscricaoId}`),
  uploadCapa: (file) => { const fd = new FormData(); fd.append('arquivo', file); return requestFile('/eventos-externos/upload-capa', fd); },
};


export const inscricoesApi = {
  areas: () => get('/inscricoes/areas'),
  series: () => get('/inscricoes/series'),
  atualizarSerie: (id, data) => put(`/inscricoes/series/${id}`, data),
  listarEventos: () => get('/inscricoes/eventos'),
  evento: (id) => get(`/inscricoes/eventos/${id}`),
  inscricoesDoEvento: (id) => get(`/inscricoes/eventos/${id}/inscricoes`),


  eventoResumo: (id) => get(`/inscricoes/eventos/${id}/resumo`),


  darBolsa: (eventoId, inscricaoId, data) => post(`/inscricoes/eventos/${eventoId}/inscricoes/${inscricaoId}/bolsa`, data),
  tirarBolsa: (eventoId, inscricaoId) => del(`/inscricoes/eventos/${eventoId}/inscricoes/${inscricaoId}/bolsa`),



  beneficios: (eventoId) => get(`/inscricoes/eventos/${eventoId}/beneficios`),
  criarBeneficio: (eventoId, data) => post(`/inscricoes/eventos/${eventoId}/beneficios`, data),
  removerBeneficio: (eventoId, beneficioId) => del(`/inscricoes/eventos/${eventoId}/beneficios/${beneficioId}`),



  comprovantes: (eventoId, inscricaoId) =>
    get(`/inscricoes/eventos/${eventoId}/inscricoes/${inscricaoId}/comprovantes`),
  aceitarComprovante: (eventoId, inscricaoId, comprovanteId, data) =>
    post(`/inscricoes/eventos/${eventoId}/inscricoes/${inscricaoId}/comprovantes/${comprovanteId}/aceitar`, data || {}),
  recusarComprovante: (eventoId, inscricaoId, comprovanteId, motivo) =>
    post(`/inscricoes/eventos/${eventoId}/inscricoes/${inscricaoId}/comprovantes/${comprovanteId}/recusar`, { motivo }),
  criarEvento: (data) => post('/inscricoes/eventos', data),

  igrejasParceiras: () => get('/inscricoes/igrejas-parceiras'),
  criarIgrejaParceira: (data) => post('/inscricoes/igrejas-parceiras', data),

  genesis: () => get('/inscricoes/genesis'),
  criarEdicaoGenesis: (data) => post('/inscricoes/genesis/edicoes', data),
  atualizarEvento: (id, data) => put(`/inscricoes/eventos/${id}`, data),
  excluirEvento: (id) => del(`/inscricoes/eventos/${id}`),
  novaEdicao: (id, data) => post(`/inscricoes/eventos/${id}/nova-edicao`, data),



  sortear: (id, premio, opts) => post(`/inscricoes/eventos/${id}/sortear`, { premio, substituir: !!opts?.substituir }),
  unificadas: (qs) => get(`/inscricoes/unificadas${qs ? `?${qs}` : ''}`),
  unificadasPessoas: (qs) => get(`/inscricoes/unificadas/pessoas${qs ? `?${qs}` : ''}`),
  unificadasDashboard: (qs) => get(`/inscricoes/unificadas/dashboard${qs ? `?${qs}` : ''}`),
  atualizarInscricao: (eventoId, inscricaoId, data) => patch(`/inscricoes/eventos/${eventoId}/inscricoes/${inscricaoId}`, data),
  excluirInscricao: (eventoId, inscricaoId) => del(`/inscricoes/eventos/${eventoId}/inscricoes/${inscricaoId}`),


  excluirInscricoesLote: (eventoId, ids) => post(`/inscricoes/eventos/${eventoId}/inscricoes/excluir-lote`, { ids }),
  uploadCapa: (file) => { const fd = new FormData(); fd.append('arquivo', file); return requestFile('/inscricoes/upload-capa', fd); },


  uploadArquivoEvento: (file) => { const fd = new FormData(); fd.append('arquivo', file); return requestFile('/inscricoes/upload-arquivo', fd); },




  importarEInscricao: (eventoId, file, confirmar) => {
    const fd = new FormData();
    fd.append('arquivo', file);
    if (confirmar) fd.append('confirmar', '1');
    return requestFile(`/inscricoes/eventos/${eventoId}/importar-einscricao`, fd);
  },


  portas: () => get('/inscricoes/portas'),


  pagamentoSaude: (verificar) => get(`/inscricoes/pagamento-saude${verificar ? '?verificar=1' : ''}`),
  qrs: (qs) => get(`/inscricoes/qrs${qs ? `?${qs}` : ''}`),
  revogarQr: (id, motivo) => patch(`/inscricoes/qrs/${id}/revogar`, { motivo }),
  reativarQr: (id, motivo) => patch(`/inscricoes/qrs/${id}/reativar`, { motivo }),
  checkinEstado: (eventoId) => get(`/inscricoes/eventos/${eventoId}/checkin`),
  checkinBuscar: (eventoId, q) => get(`/inscricoes/eventos/${eventoId}/checkin/buscar?q=${encodeURIComponent(q)}`),
  checkinMarcar: (eventoId, data) => post(`/inscricoes/eventos/${eventoId}/checkin`, data),
  checkinDesfazer: (eventoId, inscricaoId, motivo) => del(`/inscricoes/eventos/${eventoId}/checkin/${inscricaoId}`, { motivo }),
  checkinHistorico: (eventoId) => get(`/inscricoes/eventos/${eventoId}/checkin/historico`),
  checkinQrAutoatendimento: (eventoId) => get(`/inscricoes/eventos/${eventoId}/checkin/qr-autoatendimento`),
  checkinAvisoAppPrevia: (eventoId) => get(`/inscricoes/eventos/${eventoId}/checkin/aviso-app`),
  checkinAvisoAppEnviar: (eventoId) => post(`/inscricoes/eventos/${eventoId}/checkin/aviso-app`, {}),
  checkinAvisoEmailPrevia: (eventoId) => get(`/inscricoes/eventos/${eventoId}/checkin/aviso-email`),
  checkinAvisoEmailEnviar: (eventoId) => post(`/inscricoes/eventos/${eventoId}/checkin/aviso-email`, {}),
  buscarPessoaCadastro: (eventoId, q) => get(`/inscricoes/eventos/${eventoId}/pessoas/buscar?q=${encodeURIComponent(q)}`),
  inscreverNaHora: (eventoId, payload) => post(`/inscricoes/eventos/${eventoId}/inscrever-na-hora`, payload),




  emailTemplates: (eventoId) => get(`/inscricoes/email-templates${eventoId ? `?evento_id=${eventoId}` : ''}`),
  salvarEmailTemplate: (tipo, data) => put(`/inscricoes/email-templates/${tipo}`, data),
  restaurarEmailTemplate: (tipo, eventoId) =>
    del(`/inscricoes/email-templates/${tipo}${eventoId ? `?evento_id=${eventoId}` : ''}`),
  previewEmailTemplate: (data) => post('/inscricoes/email-templates/preview', data),

  testarEmailTemplate: (data) => post('/inscricoes/email-templates/teste', data),







  totemEventos: () => get('/inscricoes/totem/eventos'),
  totemInscrever: (eventoId, data) => post(`/inscricoes/totem/eventos/${eventoId}/inscrever`, data),






  totens: () => get('/inscricoes/totens'),


  totensContas: () => get('/inscricoes/totens/contas'),
  criarTotem: (data) => post('/inscricoes/totens', data),
  atualizarTotem: (id, data) => patch(`/inscricoes/totens/${id}`, data),


  parearTotem: (id, rotulo) => post(`/inscricoes/totens/${id}/pareamento`, { rotulo }),
  revogarTotem: (id, motivo) => post(`/inscricoes/totens/${id}/revogar`, { motivo }),
  revogarCredencialTotem: (tokenId, motivo) => post(`/inscricoes/totens/tokens/${tokenId}/revogar`, { motivo }),
};


export const eventoPublico = {

  lookupCpf: (slug, cpf) => fetch(`${API}/public/evento/${encodeURIComponent(slug)}/lookup-cpf`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cpf }),
  }).then(async r => {
    const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Erro'); return j;
  }),
  get: (slug) => fetch(`${API}/public/evento/${encodeURIComponent(slug)}`).then(async r => {
    const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Erro'); return j;
  }),


  serie: (slugBase) => fetch(`${API}/public/evento/serie/${encodeURIComponent(slugBase)}`).then(async r => {
    const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Erro'); return j;
  }),
  textos: () => fetch(`${API}/public/evento/textos`).then(async r => {
    const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Erro'); return j;
  }),
  inscrever: (slug, data) => fetch(`${API}/public/evento/${encodeURIComponent(slug)}/inscrever`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  }).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Erro'); return j; }),



  pagamento: (token) => fetch(`${API}/public/evento/pagamento/${encodeURIComponent(token)}`)
    .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Erro'); return j; }),









  pagamentoCartao: (token, formData) => fetch(`${API}/public/evento/pagamento/${encodeURIComponent(token)}/cartao`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData),
  }).then(async r => {
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || 'Erro'); e.recusado = !!j.recusado; e.pagamento = j.pagamento; throw e; }
    return j;
  }),
  pagamentoMetodo: (token, metodo, parcelas = 1) => fetch(`${API}/public/evento/pagamento/${encodeURIComponent(token)}/metodo`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ metodo, parcelas }),
  }).then(async r => {
    const j = await r.json();
    if (!r.ok) { const e = new Error(j.error || 'Erro'); e.pagamento = j.pagamento || null; throw e; }
    return j;
  }),


  enviarComprovante: (token, file, { metodo_declarado, observacao } = {}) => {
    const fd = new FormData();
    fd.append('arquivo', file);
    if (metodo_declarado) fd.append('metodo_declarado', metodo_declarado);
    if (observacao) fd.append('observacao', observacao);
    return fetch(`${API}/public/evento/pagamento/${encodeURIComponent(token)}/comprovante`, {
      method: 'POST', body: fd,
    }).then(async r => {
      const j = await r.json();
      if (!r.ok) { const e = new Error(j.error || 'Erro'); e.pagamento = j.pagamento || null; throw e; }
      return j;
    });
  },

  comprovante: (token) => fetch(`${API}/public/evento/comprovante/${encodeURIComponent(token)}`)
    .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Erro'); return j; }),

  uploadImagem: (slug, file) => {
    const fd = new FormData(); fd.append('arquivo', file);
    return fetch(`${API}/public/evento/${encodeURIComponent(slug)}/upload-imagem`, { method: 'POST', body: fd })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Erro'); return j; });
  },
};







export const generosidadePublica = {


  prefill: (t) => fetch(`${API}/public/generosidade/prefill?t=${encodeURIComponent(t)}`)
    .then((r) => (r.ok ? r.json() : { prefill: null }))
    .catch(() => ({ prefill: null })),
  config: () => fetch(`${API}/public/generosidade/config`)
    .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Erro'); return j; }),
  doar: (dados) => fetch(`${API}/public/generosidade/doacao`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados),
  }).then(async r => {
    const j = await r.json();
    if (!r.ok) { const e = new Error(j.error || 'Erro'); e.campo = j.campo || null; throw e; }
    return j;
  }),
  status: (token) => fetch(`${API}/public/generosidade/${encodeURIComponent(token)}`)
    .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Erro'); return j; }),


  metodo: (token, metodo, parcelas = 1) => fetch(`${API}/public/generosidade/${encodeURIComponent(token)}/metodo`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ metodo, parcelas }),
  }).then(async r => {
    const j = await r.json();
    if (!r.ok) { const e = new Error(j.error || 'Erro'); e.pagamento = j.pagamento || null; throw e; }
    return j;
  }),
};


export const decisaoOnline = {
  ativo: (token) => fetch(
    `${API}/public/decisao-online/ativo${token ? `?t=${encodeURIComponent(token)}` : ''}`,
  ).then(r => r.json()),
  registrar: (data) => fetch(`${API}/public/decisao-online`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then(async r => {
    const j = await r.json();
    if (!r.ok) throw new Error(j.message || j.error || 'Erro');
    return j;
  }),
};



export const decisaoCulto = {
  abrir: (token) => fetch(`${API}/public/decisao-culto/${token}`).then(async r => {
    const j = await r.json();
    if (!r.ok) throw new Error(j.message || j.error || 'Erro');
    return j;
  }),
  registrar: (token, data) => fetch(`${API}/public/decisao-culto/${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then(async r => {
    const j = await r.json();
    if (!r.ok) throw new Error(j.message || j.error || 'Erro');
    return j;
  }),
};

export const next = {

  publicEventos: () => fetch(`${API}/public/next/eventos`).then(r => r.json()),

  publicTurmas: () => fetch(`${API}/public/next/turmas`).then(async r => {
    const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Erro'); return j;
  }),

  publicTextos: () => fetch(`${API}/public/next/textos`).then(async r => {
    const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Erro'); return j;
  }),
  publicInscrever: (data) => fetch(`${API}/public/next/inscrever`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then(async r => {
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Erro');
    return j;
  }),

  publicDirecionarInfo: (token) => fetch(`${API}/public/next/direcionar/${token}`).then(async r => {
    const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Erro'); return j;
  }),
  publicDirecionar: (token, data) => fetch(`${API}/public/next/direcionar/${token}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  }).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Erro'); return j; }),

  publicCheckinInfo: (token) => fetch(`${API}/public/next/checkin/${token}`).then(async r => {
    const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Erro'); return j;
  }),
  publicCheckin: (token, data) => fetch(`${API}/public/next/checkin/${token}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  }).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Erro'); return j; }),
  publicCheckinWalkin: (token, data) => fetch(`${API}/public/next/checkin/${token}/walkin`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  }).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Erro'); return j; }),

  direcionarQr: () => get('/next/direcionar-qr'),


  batismoHorarios: () => get('/next/batismo-horarios'),

  satisfacao: () => get('/next/satisfacao'),

  dashboard: () => get('/next/dashboard'),
  eventos: {
    list: (params) => get('/next/eventos' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/next/eventos', data),
    update: (id, data) => put(`/next/eventos/${id}`, data),
    autoCreateMes: (data) => post('/next/eventos/auto-create-mes', data || {}),
  },
  inscricoes: {
    list: (params) => get('/next/inscricoes' + (params ? '?' + new URLSearchParams(params) : '')),
    get: (id) => get(`/next/inscricoes/${id}`),
    create: (data) => post('/next/inscricoes', data),
    update: (id, data) => put(`/next/inscricoes/${id}`, data),
    checkin: (id) => post(`/next/inscricoes/${id}/checkin`, {}),
    descheckin: (id) => del(`/next/inscricoes/${id}/checkin`),
    indicacoes: (id, data) => post(`/next/inscricoes/${id}/indicacoes`, data),
  },
  indicacoes: {
    list: (params) => get('/next/indicacoes' + (params ? '?' + new URLSearchParams(params) : '')),
    update: (id, data) => put(`/next/indicacoes/${id}`, data),
  },

  turmas: {
    list: (params) => get('/next/turmas' + (params ? '?' + new URLSearchParams(params) : '')),
    get: (id) => get(`/next/turmas/${id}`),
    create: (data) => post('/next/turmas', data),
    update: (id, data) => patch(`/next/turmas/${id}`, data),
    remove: (id) => del(`/next/turmas/${id}`),
    listaEspera: () => get('/next/lista-espera'),
  },
  encontros: {
    update: (id, data) => patch(`/next/encontros/${id}`, data),
    setPresencas: (id, matriculaIds) => put(`/next/encontros/${id}/presencas`, { matricula_ids: matriculaIds }),

    setPresenca: (id, matriculaId, presente = true) => post(`/next/encontros/${id}/presenca`, { matricula_id: matriculaId, presente }),
  },
  matriculas: {
    list: (params) => get('/next/matriculas' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/next/matriculas', data),
    update: (id, data) => patch(`/next/matriculas/${id}`, data),

    transferir: (id, turma_id) => post(`/next/matriculas/${id}/transferir`, { turma_id }),
    remove: (id) => del(`/next/matriculas/${id}`),

    setContato: (id, feito) => patch(`/next/matriculas/${id}/contato`, { feito }),




    direcionar: (id, destinos, areas, horarioBatismo) =>
      post(`/next/matriculas/${id}/direcionar`, { destinos, areas, horario_batismo: horarioBatismo || null }),

    backfillMembros: () => post('/next/matriculas/backfill-membros', {}),
  },

  pessoas: (params) => get('/next/pessoas' + (params ? '?' + new URLSearchParams(params) : '')),

  curso: () => get('/next/curso'),

  pessoaAulas: (membroId, data) => put(`/next/pessoa/${membroId}/aulas`, data),
  convertidos: {
    resolver: (id, resolucao) => post(`/next/convertidos/${id}/resolver`, { resolucao }),
    desresolver: (id) => del(`/next/convertidos/${id}/resolver`),
  },
};

export const integracao = {



  dashboard: () => get('/integracao/dashboard'),
  kpisTaticos: () => get('/integracao/kpis/taticos'),
  historicoAnual: () => get('/integracao/historico-anual'),
  historicoBatismos: () => get('/integracao/historico-batismos'),
  coleta: {
    cultosAbertos: () => get('/integracao/coleta/cultos-abertos'),
    submeter: (data) => post('/integracao/coleta', data),
    minhas: () => get('/integracao/coleta/minhas'),
    pendentes: () => get('/integracao/coleta/pendentes'),
    aprovar: (id) => post(`/integracao/coleta/${id}/aprovar`),
    rejeitar: (id, motivo) => post(`/integracao/coleta/${id}/rejeitar`, { motivo }),
  },
  decisoesApp: {
    list: (status = 'pendente') => get(`/integracao/decisoes-app?status=${status}`),
    confirmar: (id, culto_id) => post(`/integracao/decisoes-app/${id}/confirmar`, { culto_id }),
    descartar: (id) => post(`/integracao/decisoes-app/${id}/descartar`),
  },
};

export const dashboardSemanal = {
  cultos: () => get('/dashboard-semanal/cultos'),

  lentesDomingo: (params = {}) => get('/dashboard-semanal/lentes-domingo?' + new URLSearchParams(params)),
  semanasDisponiveis: (ano) => get(`/dashboard-semanal/semanas-disponiveis?ano=${ano}`),
  semanal: (params) => get('/dashboard-semanal/semanal?' + new URLSearchParams(params)),
  resumoSemana: (ano, semana) => get(`/dashboard-semanal/resumo-semana?ano=${ano}&semana=${semana}`),
  voluntariadoPessoas: (ano, semana) => get(`/dashboard-semanal/voluntariado-pessoas?ano=${ano}&semana=${semana}`),
  voluntariadoComposicao: (ano, semana) => get(`/dashboard-semanal/voluntariado-composicao?ano=${ano}&semana=${semana}`),

  notasList: (ano, semana) => get(`/dashboard-semanal/notas?ano=${ano}&semana=${semana}`),
  notaCreate: (data) => post('/dashboard-semanal/notas', data),
  notaDelete: (id) => del(`/dashboard-semanal/notas/${id}`),
  resumoMes: (ano, mes) => get(`/dashboard-semanal/resumo-mes?ano=${ano}&mes=${mes}`),
  nextPresencaMensal: (meses = 12) => get(`/dashboard-semanal/next-presenca-mensal?meses=${meses}`),
  nextPresencaMensalSet: (data) => put('/dashboard-semanal/next-presenca-mensal', data),
  ranking: (params) => get('/dashboard-semanal/ranking?' + new URLSearchParams(params)),
  yoy: (params) => get('/dashboard-semanal/yoy?' + new URLSearchParams(params)),
  mensal: (params) => get('/dashboard-semanal/mensal?' + new URLSearchParams(params)),
  ytd: (params) => get('/dashboard-semanal/ytd?' + new URLSearchParams(params)),
  mediaMovel: (params) => get('/dashboard-semanal/media-movel?' + new URLSearchParams(params)),
  metasList: () => get('/dashboard-semanal/metas'),
  metaCreate: (data) => post('/dashboard-semanal/metas', data),
  metaUpdate: (id, data) => put(`/dashboard-semanal/metas/${id}`, data),
  metaRemove: (id) => del(`/dashboard-semanal/metas/${id}`),
  metaSugerir: (params) => get('/dashboard-semanal/metas/sugerir?' + new URLSearchParams(params)),
  metaValorAtual: (params) => get('/dashboard-semanal/metas/valor-atual?' + new URLSearchParams(params)),
  iaSugerirIndicador: (pergunta) => post('/dashboard-semanal/ia/sugerir-indicador', { pergunta }),
  indicadoresCustomList: (status) => get('/dashboard-semanal/indicadores-custom' + (status ? `?status=${status}` : '')),
  indicadorCustomPatch: (id, data) => patch(`/dashboard-semanal/indicadores-custom/${id}`, data),

  iaRefinarIndicador: (id, instrucao) => post(`/dashboard-semanal/ia/refinar-indicador/${id}`, { instrucao }),
  indicadorCustomRemove: (id) => del(`/dashboard-semanal/indicadores-custom/${id}`),


  kpisTaticos: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return get('/kpis/v2/taticos' + (qs ? '?' + qs : ''));
  },


  kpiDetalhe: (id) => get(`/painel/kpi/${encodeURIComponent(id)}`),
};

export const grupos = {
  list: (params) => get('/grupos' + (params ? '?' + new URLSearchParams(params) : '')),
  meu: () => get('/grupos/meu'),
  get: (id) => get(`/grupos/${id}`),
  create: (data) => post('/grupos', data),
  update: (id, data) => put(`/grupos/${id}`, data),
  remove: (id) => del(`/grupos/${id}`),
  addMembro: (grupoId, data) => post(`/grupos/${grupoId}/membros`, data),



  addPessoaNova: (grupoId, data) => post(`/grupos/${grupoId}/pessoas`, data),


  transferencias: {
    list: (params) => get('/grupos/transferencias' + (params ? '?' + new URLSearchParams(params) : '')),
    resolver: (id, body) => post(`/grupos/transferencias/${id}/resolver`, body),
  },

  candidatosAdicionar: (grupoId) => get(`/grupos/${grupoId}/candidatos-adicionar`),
  sairMembro: (participacaoId, data) => patch(`/grupos/participacao/${participacaoId}/sair`, data),
  registrarPresenca: (participacaoId) => patch(`/grupos/participacao/${participacaoId}/presenca`, {}),
  materiais: (params) => get('/grupos/materiais' + (params ? '?' + new URLSearchParams(params) : '')),
  uploadMaterial: (formData) => requestFile('/grupos/materiais', formData),
  importarLideresAnalisar: (file) => { const fd = new FormData(); fd.append('arquivo', file); return requestFile('/grupos/importar-lideres/analisar', fd, { timeoutMs: 120_000 }); },

  importarParticipantes: (file, { dryRun = true, reconciliar = false } = {}) => { const fd = new FormData(); fd.append('arquivo', file); const qs = [dryRun ? 'dry_run=1' : '', reconciliar ? 'reconciliar=1' : ''].filter(Boolean).join('&'); return requestFile(`/grupos/importar-participantes${qs ? `?${qs}` : ''}`, fd, { timeoutMs: 300_000 }); },
  importarLideresAplicar: (vinculos) => post('/grupos/importar-lideres/aplicar', { vinculos }),
  removeMaterial: (docId) => del(`/grupos/materiais/${docId}`),
  encontros: (grupoId, params) => get(`/grupos/${grupoId}/encontros` + (params ? '?' + new URLSearchParams(params) : '')),
  encontro: (encontroId) => get(`/grupos/encontros/${encontroId}`),


  encontrosPendentes: (grupoId) => get(`/grupos/${grupoId}/encontros-pendentes`),

  agendaExcecao: (grupoId, body) => post(`/grupos/${grupoId}/agenda`, body),



  entradasSaidas: (grupoId) => get(`/grupos/${grupoId}/entradas-saidas`),
  registrarEncontro: (grupoId, data) => post(`/grupos/${grupoId}/encontros`, data),
  atualizarEncontro: (encontroId, data) => patch(`/grupos/encontros/${encontroId}`, data),
  removerEncontro: (encontroId) => del(`/grupos/encontros/${encontroId}`),
  metricas: (grupoId) => get(`/grupos/${grupoId}/metricas`),
  historicoAlteracoes: (grupoId) => get(`/grupos/${grupoId}/historico-alteracoes`),
  renovacao: {
    painel: (params) => get('/grupos/renovacao/painel' + (params ? '?' + new URLSearchParams(params) : '')),
    disparar: (temporadaId) => post('/grupos/renovacao/disparar', { temporada_id: temporadaId }),
    triar: (renId, body) => post(`/grupos/renovacao/${renId}/triar`, body),
  },


  confira: {
    painel: (params) => get('/grupos/confira/painel' + (params ? '?' + new URLSearchParams(params) : '')),
    preview: (audiencia, novaRodada = false) => post('/grupos/confira/preview', { audiencia, nova_rodada: novaRodada }),
    disparar: (audiencia, novaRodada = false) => post('/grupos/confira/disparar', { audiencia, nova_rodada: novaRodada }),
    triar: (confId, obs) => post(`/grupos/confira/${confId}/triar`, { obs }),
  },
  envios: {
    getConfig: () => get('/grupos/envios/config'),
    setConfig: (patch) => put('/grupos/envios/config', patch),
    aux: () => get('/grupos/envios/aux'),
    previewFrequencia: (audiencia) => post('/grupos/envios/frequencia/preview', { audiencia }),
    dispararFrequencia: (audiencia) => post('/grupos/envios/frequencia', { audiencia }),
    previewMaterial: (audiencia) => post('/grupos/envios/material/preview', { audiencia }),
    dispararMaterial: (file, audiencia, titulo) => { const fd = new FormData(); fd.append('arquivo', file); fd.append('audiencia', JSON.stringify(audiencia || {})); if (titulo) fd.append('titulo', titulo); return requestFile('/grupos/envios/material', fd, { timeoutMs: 120_000 }); },
    previewAbertura: (audiencia) => post('/grupos/envios/abertura/preview', { audiencia }),
    dispararAbertura: (audiencia) => post('/grupos/envios/abertura', { audiencia }),
    historico: () => get('/grupos/envios/historico'),
  },
  saudeAgregada: (params) => get('/grupos/saude/agregado' + (params ? '?' + new URLSearchParams(params) : '')),
  relatorioKpis: (params) => get('/grupos/kpis/relatorio' + (params ? '?' + new URLSearchParams(params) : '')),
  kpisTaticos: () => get('/grupos/kpis/taticos'),
  lideresTreinamento: (params) => get('/grupos/kpis/lideres-treinamento' + (params ? '?' + new URLSearchParams(params) : '')),
  temporadas: () => get('/grupos/temporadas/list'),
  atualizarTemporada: (id, data) => patch(`/grupos/temporadas/${id}`, data),

  temporadasConsolidado: () => get('/grupos/temporadas/consolidado'),
  consolidarTemporada: (id, forcar = false) => post(`/grupos/temporadas/${id}/consolidar${forcar ? '?forcar=1' : ''}`, {}),

  temporadaMetricas: (temporada) => get('/grupos/kpis/temporada-metricas?temporada=' + encodeURIComponent(temporada)),

  frequenciaGrupo: (grupoId) => get(`/grupos/${grupoId}/frequencia`),

  frequenciaPessoa: (membroId) => get(`/grupos/pessoas/${membroId}/frequencia`),

  frequenciaRanking: (temporada) => get('/grupos/kpis/frequencia-grupos' + (temporada ? '?temporada=' + encodeURIComponent(temporada) : '')),

  temporadaSeries: (temporada) => get('/grupos/kpis/temporada-series?temporada=' + encodeURIComponent(temporada)),

  semPresenca: (temporada) => get('/grupos/kpis/sem-presenca?temporada=' + encodeURIComponent(temporada)),

  prontidaoTemporada: (temporada) => get('/grupos/kpis/prontidao' + (temporada ? '?temporada=' + encodeURIComponent(temporada) : '')),
  redes: {
    list: () => get('/grupos/redes'),
    create: (data) => post('/grupos/redes', data),
    update: (id, data) => put(`/grupos/redes/${id}`, data),
  },

  temporadaInscricoes: {
    get: () => get('/grupos/temporada-inscricoes'),
    set: (data) => put('/grupos/temporada-inscricoes', data),
  },
  bairros: (params) => get('/grupos/bairros/list' + (params ? '?' + new URLSearchParams(params) : '')),

  buscar: (params) => get('/grupos/buscar' + (params ? '?' + new URLSearchParams(params) : '')),
  buscarLideres: (params) => get('/grupos/lideres/buscar' + (params ? '?' + new URLSearchParams(params) : '')),

  buscarPessoas: (q) => get('/grupos/pessoas/buscar?q=' + encodeURIComponent(q)),

  pessoaFicha: (membroId) => get(`/grupos/pessoas/${membroId}/ficha`),
  pessoaFichaSalvar: (membroId, data) => patch(`/grupos/pessoas/${membroId}/ficha`, data),




  vinculosDuplicados: {
    list: () => get('/grupos/vinculos/duplicados'),
    resolver: (manterId, removerIds) =>
      post('/grupos/vinculos/duplicados/resolver', { manter_id: manterId, remover_ids: removerIds }),
  },
  duplicatas: {
    list: (fresh) => get('/grupos/duplicatas' + (fresh ? '?fresh=1' : '')),
    fundir: (keepId, mergeIds, campos) => post('/grupos/duplicatas/fundir', { keep_id: keepId, merge_ids: mergeIds, campos }),
    ignorar: (ids) => post('/grupos/duplicatas/ignorar', { ids }),
  },
  gruposDoLider: (liderId, params) => get(`/grupos/lideres/${liderId}/grupos` + (params ? '?' + new URLSearchParams(params) : '')),
  criarPedido: (grupoId, data) => post(`/grupos/${grupoId}/pedidos`, data),
  listarPedidos: (params) => get('/grupos/pedidos/list' + (params ? '?' + new URLSearchParams(params) : '')),
  contarPedidos: () => get('/grupos/pedidos/count'),
  resumoPedidos: () => get('/grupos/pedidos/resumo'),


  entradaCobertura: (params) => get('/grupos/entrada/cobertura' + (params ? '?' + new URLSearchParams(params) : '')),
  historicoMembros: (grupoId) => get(`/grupos/${grupoId}/historico-membros`),
  aprovarPedido: (pedidoId) => post(`/grupos/pedidos/${pedidoId}/aprovar`, {}),


  aprovarPedidoDireto: (pedidoId, grupoId) => post(`/grupos/pedidos/${pedidoId}/aprovar-direto`, { grupo_id: grupoId || null }),
  aprovarPedidosLote: (pedidoIds) => post('/grupos/pedidos/aprovar-lote', { pedido_ids: pedidoIds }),
  rejeitarPedido: (pedidoId, motivo) => post(`/grupos/pedidos/${pedidoId}/rejeitar`, { motivo }),
  sugerirPedido: (pedidoId, grupoSugeridoId, motivo) => post(`/grupos/pedidos/${pedidoId}/sugerir`, { grupo_sugerido_id: grupoSugeridoId, motivo: motivo || null }),
  pedidoEventos: (pedidoId) => get(`/grupos/pedidos/${pedidoId}/eventos`),

  liderInscricoes: {
    list: (params) => get('/grupos/lideres-inscricoes/list' + (params ? '?' + new URLSearchParams(params) : '')),
    aceitar: (id) => post(`/grupos/lideres-inscricoes/${id}/aceitar`, {}),
    recusar: (id, motivo) => post(`/grupos/lideres-inscricoes/${id}/recusar`, { motivo: motivo || null }),
    promover: (id) => post(`/grupos/lideres-inscricoes/${id}/promover`, {}),
    vincular: (id, grupoId, funcao) => post(`/grupos/lideres-inscricoes/${id}/vincular`, { grupo_id: grupoId, funcao }),
  },
  setAceitandoInscricoes: (grupoId, aceitando) => patch(`/grupos/${grupoId}/aceitando`, { aceitando }),
  geocodeBatch: (data) => post('/grupos/geocode-batch', data || {}),

  supervisaoMe: () => get('/grupos/supervisao/me'),
  setSupervisor: (grupoId, supervisor_id) => put(`/grupos/${grupoId}/supervisor`, { supervisor_id }),
  setFuncaoMembro: (membroRowId, funcao) => put(`/grupos/membros/${membroRowId}/funcao`, { funcao }),
  listVisitas: (grupoId) => get(`/grupos/${grupoId}/visitas`),
  addVisita: (grupoId, body) => post(`/grupos/${grupoId}/visitas`, body),
  updateVisita: (visitaId, body) => patch(`/grupos/visitas/${visitaId}`, body),
  removeVisita: (visitaId) => del(`/grupos/visitas/${visitaId}`),
  visitasPainel: () => get('/grupos/visitas/painel'),
  pessoasPapeis: () => get('/grupos/pessoas/papeis'),

  pedirDadosPessoa: (membroId) => post(`/grupos/pessoas/${membroId}/pedir-dados`, {}),


  sexoColher: (aplicar = false) => post('/grupos/pessoas/sexo/colher', { aplicar }),


  sexoSugestoes: (offset = 0) => get(`/grupos/pessoas/sexo/sugestoes?offset=${offset}`),
  sexoConfirmar: (itens) => post('/grupos/pessoas/sexo/confirmar', { itens }),
  marcarEstudoSemana: (docId, ativo) => patch(`/whatsapp-grupos/materiais/${docId}/estudo-semana`, { ativo }),
  semRelato: () => get('/grupos/kpis/sem-relato'),
  listObservacoes: (grupoId) => get(`/grupos/${grupoId}/observacoes`),
  setObservacao: (grupoId, periodo, observacao) => put(`/grupos/${grupoId}/observacoes/${periodo}`, { observacao }),
};

export const whatsapp = {

  testDisparo: (chave) => post('/whatsapp/test-disparo', { chave }),

  listLideres: () => get('/whatsapp/lideres'),
  vincularLider: (data) => post('/whatsapp/lideres', data),
  atualizarLider: (id, data) => put(`/whatsapp/lideres/${id}`, data),
  removerLider: (id) => del(`/whatsapp/lideres/${id}`),

  listColetas: (status) => get('/whatsapp/coletas' + (status ? `?status=${status}` : '')),
  aplicarColeta: (id) => post(`/whatsapp/coletas/${id}/aplicar`, {}),
  rejeitarColeta: (id, motivo) => post(`/whatsapp/coletas/${id}/rejeitar`, { motivo }),

  getConfig: () => get('/whatsapp/config'),
  saveConfig: (data) => put('/whatsapp/config', data),

  broadcastDestinatarios: () => get('/whatsapp/broadcast/destinatarios'),
  broadcastEnviar: (mensagem) => post('/whatsapp/broadcast', { mensagem }),
};

export const strategic = {
  categories: () => get('/strategic/categories'),
  list: (params) => get('/strategic' + (params ? '?' + new URLSearchParams(params) : '')),
  get: (id) => get(`/strategic/${id}`),
  create: (data) => post('/strategic', data),
  update: (id, data) => put(`/strategic/${id}`, data),
  remove: (id) => del(`/strategic/${id}`),
  createTask: (planId, data) => post(`/strategic/${planId}/tasks`, data),
  updateTask: (taskId, data) => put(`/strategic/tasks/${taskId}`, data),
  updateTaskStatus: (taskId, status) => patch(`/strategic/tasks/${taskId}/status`, { status }),
  removeTask: (taskId) => del(`/strategic/tasks/${taskId}`),
  createSubtask: (taskId, data) => post(`/strategic/tasks/${taskId}/subtasks`, data),
  toggleSubtask: (subId, done) => patch(`/strategic/subtasks/${subId}`, { done }),
  removeSubtask: (subId) => del(`/strategic/subtasks/${subId}`),
  addComment: (taskId, text) => post(`/strategic/tasks/${taskId}/comments`, { text }),
  createMilestone: (planId, data) => post(`/strategic/${planId}/milestones`, data),
  updateMilestone: (mId, data) => put(`/strategic/milestones/${mId}`, data),
  updateMilestoneStatus: (mId, status) => patch(`/strategic/milestones/${mId}/status`, { status }),
};

export const meetings = {
  list: (params) => get('/meetings' + (params ? '?' + new URLSearchParams(params) : '')),
  create: (data) => post('/meetings', data),
  update: (id, data) => put(`/meetings/${id}`, data),
  remove: (id) => del(`/meetings/${id}`),
  togglePendency: (id, done) => patch(`/meetings/pendencies/${id}`, { done }),
  removePendency: (id) => del(`/meetings/pendencies/${id}`),
};

export const dashboard = {
  pmo: () => get('/dashboard/pmo'),
  workload: () => get('/dashboard/workload'),
};

export const risks = {
  list: (eventId) => get(`/events/${eventId}/risks`),
  create: (eventId, data) => post(`/events/${eventId}/risks`, data),
  update: (riskId, data) => patch(`/events/risks/${riskId}`, data),
  remove: (riskId) => del(`/events/risks/${riskId}`),
};

export const retrospective = {
  get: (eventId) => get(`/events/${eventId}/retrospective`),
  save: (eventId, data) => post(`/events/${eventId}/retrospective`, data),
};

export const history = {
  list: (eventId) => get(`/events/${eventId}/history`),
};

export const tasks = {

  all: (params) => {
    const q = new URLSearchParams();
    if (params?.source) q.set('source', params.source);
    if (params?.area) q.set('area', params.area);
    if (params?.finalized) q.set('finalized', params.finalized);
    const qs = q.toString();
    return get('/tasks/all' + (qs ? '?' + qs : ''));
  },
  updateStatus: (source, taskId, status) => patch(`/tasks/${source}/${taskId}/status`, { status }),
};

export const occurrences = {
  get: (occId) => get(`/occurrences/${occId}`),
  list: (eventId) => get(`/occurrences/${eventId}`),
  create: (eventId, data) => post(`/occurrences/${eventId}`, data),
  update: (id, data) => patch(`/occurrences/${id}`, data),
  remove: (id) => del(`/occurrences/${id}`),
  createTask: (occId, data) => post(`/occurrences/${occId}/tasks`, data),
  updateTask: (taskId, data) => patch(`/occurrences/tasks/${taskId}`, data),
  updateTaskStatus: (taskId, status) => patch(`/occurrences/tasks/${taskId}/status`, { status }),
  removeTask: (taskId) => del(`/occurrences/tasks/${taskId}`),
  createMeeting: (occId, data) => post(`/occurrences/${occId}/meetings`, data),
  removeMeeting: (id) => del(`/occurrences/meetings/${id}`),
  togglePendency: (id, done) => patch(`/occurrences/pendencies/${id}`, { done }),
};

export const cycles = {
  activate: (eventId) => post(`/cycles/activate/${eventId}`, {}),
  get: (eventId) => get(`/cycles/${eventId}`),
  createPhase: (data) => post('/cycles/phases', data),
  updatePhase: (phaseId, data) => patch(`/cycles/phases/${phaseId}`, data),
  deletePhase: (phaseId) => del(`/cycles/phases/${phaseId}`),
  createTask: (data) => post('/cycles/tasks', data),
  updateTask: (taskId, data) => patch(`/cycles/tasks/${taskId}`, data),
  updateSubtask: (subId, data) => patch(`/cycles/subtasks/${subId}`, data),
  createSubtask: (taskId, name) => post(`/cycles/tasks/${taskId}/subtasks`, { name }),
  deleteSubtask: (subId) => del(`/cycles/subtasks/${subId}`),
  deleteTask: (taskId) => del(`/cycles/tasks/${taskId}`),
  updateAdmItem: (itemId, data) => patch(`/cycles/adm/${itemId}`, data),
  registerExpense: (data) => post('/cycles/expenses', data),
  summaryAll: () => get('/cycles/summary/all'),
  kanbanAll: () => get('/cycles/kanban/all'),

  kpiEvento: (eventId) => get(`/cycles/kpis/evento/${eventId}`),
  kpiCross: (params) => get('/cycles/kpis/cross' + (params ? '?' + new URLSearchParams(params) : '')),
  deliverCard: (cardId, data) => post(`/cycles/card-completions/${cardId}/deliver`, data),
  approveCard: (cardId) => patch(`/cycles/card-completions/${cardId}/approve`, {}),
  qualityCard: (cardId, rating) => patch(`/cycles/card-completions/${cardId}/quality`, { quality_rating: rating }),
  docResumo: (taskId) => get(`/cycles/kpis/doc-resumo/${taskId}`),
  toggleCritical: (taskId, isCritical) => patch(`/cycles/tasks/${taskId}/critical`, { is_critical: isCritical }),
  kpiAreaWeights: () => get('/cycles/kpis/area-weights'),
  updateAreaWeight: (id, weight) => put(`/cycles/kpis/area-weights/${id}`, { weight }),

  admTemplates: () => get('/cycles/adm-templates'),
  createAdmTemplate: (data) => post('/cycles/adm-templates', data),
  updateAdmTemplate: (id, data) => put(`/cycles/adm-templates/${id}`, data),
  deleteAdmTemplate: (id) => del(`/cycles/adm-templates/${id}`),
  toggleAdmTemplate: (id) => patch(`/cycles/adm-templates/${id}/toggle`, {}),
  addAdmSubtask: (templateId, data) => post(`/cycles/adm-templates/${templateId}/subtasks`, data),
  removeAdmSubtask: (id) => del(`/cycles/adm-template-subtasks/${id}`),
};

export const revisoes = {
  diagnostico: () => get('/revisoes/diagnostico'),
  simular: (tipo, id, params) => get(`/revisoes/simular/${tipo}/${id}` + (params ? '?' + new URLSearchParams(params) : '')),
  updateProjeto: (id, data) => put(`/revisoes/projeto/${id}`, data),
  updateExpansao: (id, data) => put(`/revisoes/expansao/${id}`, data),
  deleteProjeto: (id, motivo) => request(`/revisoes/projeto/${id}`, { method: 'DELETE', body: JSON.stringify({ motivo }) }),
  deleteExpansao: (id, motivo) => request(`/revisoes/expansao/${id}`, { method: 'DELETE', body: JSON.stringify({ motivo }) }),
  historico: (params) => get('/revisoes/historico' + (params ? '?' + new URLSearchParams(params) : '')),
};

export const governanca = {

  tipos: () => get('/governanca/tipos'),
  relatorio: (sigla) => get(`/governanca/relatorio/${sigla}`),
  salvarObservacoes: (sigla, observacoes) => post(`/governanca/relatorio/${sigla}/observacoes`, { observacoes }),


  types: {
    list:   () => get('/governanca/types'),
    create: (data) => post('/governanca/types', data),
    update: (id, data) => patch(`/governanca/types/${id}`, data),
  },
  cycles: {
    list:   (year) => get('/governanca/cycles' + (year ? `?year=${year}` : '')),
    get:    (id) => get(`/governanca/cycles/${id}`),
    create: (year, month) => post('/governanca/cycles', { year, month }),
    generateYear: (year, fromMonth) => post('/governanca/cycles/generate-year', { year, from_month: fromMonth }),
  },
  meetings: {
    list:   (params = {}) => get('/governanca/meetings' + (Object.keys(params).length ? '?' + new URLSearchParams(params) : '')),
    get:    (id) => get(`/governanca/meetings/${id}`),
    create: (data) => post('/governanca/meetings', data),
    update: (id, data) => patch(`/governanca/meetings/${id}`, data),
    remove: (id) => del(`/governanca/meetings/${id}`),
    aplicarTemplates: (id) => post(`/governanca/meetings/${id}/apply-templates`, {}),
    gerarPauta: (id) => post(`/governanca/meetings/${id}/gerar-pauta`, {}),
  },
  tasks: {
    create: (meetingId, data) => post(`/governanca/meetings/${meetingId}/tasks`, data),
    update: (id, data) => patch(`/governanca/tasks/${id}`, data),
    remove: (id) => del(`/governanca/tasks/${id}`),
  },
  docs: {
    list:     (meetingId) => get(`/governanca/meetings/${meetingId}/docs`),
    upload:   (meetingId, file, tipo) => {
      const fd = new FormData();
      fd.append('arquivo', file);
      if (tipo) fd.append('tipo', tipo);
      return requestFile(`/governanca/meetings/${meetingId}/docs`, fd, { timeoutMs: 120_000 });
    },
    download: (docId) => get(`/governanca/docs/${docId}/download`),
    remove:   (docId) => del(`/governanca/docs/${docId}`),
    update:   (docId, conteudo_md) => patch(`/governanca/docs/${docId}`, { conteudo_md }),
  },

  analise: (sigla, ano) => get('/governanca/analise?' + new URLSearchParams({ sigla, ...(ano ? { ano } : {}) })),
  memoria: {
    get:    (sigla, ano) => get('/governanca/memoria?' + new URLSearchParams({ sigla, ...(ano ? { ano } : {}) })),
    gerar:  (sigla, ano) => post('/governanca/memoria/gerar', { sigla, ano }),
    update: (id, conteudo_md) => patch(`/governanca/memoria/${id}`, { conteudo_md }),
  },

  kpiObjetivos: (meses, ano) => get('/governanca/kpi-objetivos' + (ano ? `?ano=${ano}` : (meses ? `?meses=${meses}` : ''))),
  deliberacoes: (params = {}) => get('/governanca/deliberacoes' + (Object.keys(params).length ? '?' + new URLSearchParams(params) : '')),
  extrairDeliberacoes: (meetingId) => post(`/governanca/meetings/${meetingId}/extrair-deliberacoes`, {}),
};



export const assistenteConversas = {
  registrarVideo: (body, opts) => post('/assistente-conversas/video', body, opts),
  temas: (params) => get('/assistente-conversas/temas' + (params ? '?' + new URLSearchParams(params) : '')),
};

export const agents = {
  generate: (data) => post('/agents/generate', data),
  queue: (status) => get('/agents/queue' + (status ? `?status=${status}` : '')),
  approve: (id) => patch(`/agents/queue/${id}/approve`),
  reject: (id, motivo) => patch(`/agents/queue/${id}/reject`, motivo ? { motivo } : undefined),
  apply: (id) => post(`/agents/queue/${id}/apply`),
  triggerWorker: (data) => post('/agents/worker/trigger', data || {}),
  log: () => get('/agents/log'),
  run: (data) => post('/agents/run', data),
  runs: (params) => get('/agents/runs' + (params ? '?' + new URLSearchParams(params) : '')),

  diagnosticos: (params) => get('/agents/diagnosticos' + (params ? '?' + new URLSearchParams(params) : '')),

  diagnosticosPrevia: (params) => get('/agents/diagnosticos/previa-resolucao' + (params ? '?' + new URLSearchParams(params) : '')),
  diagnosticosResolver: (body) => post('/agents/diagnosticos/resolver', body || {}),
  runDetail: (id) => get(`/agents/runs/${id}`),
  runSteps: (id) => get(`/agents/runs/${id}/steps`),
  cancelRun: (id) => post(`/agents/runs/${id}/cancel`),
  stats: () => get('/agents/stats'),
  scores: () => get('/agents/scores'),
  memory: (module) => get(`/agents/memory/${module}`),

  modules: () => get('/agents/modules'),
  sessions: () => get('/agents/sessions'),
  sessionMessages: (id) => get(`/agents/sessions/${id}/messages`),
  deleteSession: (id) => del(`/agents/sessions/${id}`),



  chat: async ({ message, module, sessionId }) => {
    const token = await getToken();
    const res = await fetch(`${API}/agents/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ message, module, sessionId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res;
  },




  ask: async ({ message, sessionId }) => {
    const token = await getToken();
    const res = await fetch(`${API}/agents/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ message, sessionId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res;
  },






  agentTasks: {
    team: () => get('/agent-tasks/team'),
    addMembro: (data) => post('/agent-tasks/team', data),
    updateMembro: (agentKey, data) => patch(`/agent-tasks/team/${agentKey}`, data),
    instrucoes: (agentKey) => get(`/agent-tasks/team/${agentKey}/instrucoes`),
    estruturar: (agentKey, raw) => post(`/agent-tasks/team/${agentKey}/instrucoes/estruturar`, { raw }),
    salvarInstrucoes: (agentKey, data) => put(`/agent-tasks/team/${agentKey}/instrucoes`, data),
    tarefas: (params) => get('/agent-tasks/tarefas' + (params ? '?' + new URLSearchParams(params) : '')),
    tarefa: (id) => get(`/agent-tasks/tarefas/${id}`),
    criarTarefa: (data) => post('/agent-tasks/tarefas', data),
    atualizarTarefa: (id, data) => patch(`/agent-tasks/tarefas/${id}`, data),
    comentar: (id, texto) => post(`/agent-tasks/tarefas/${id}/comentario`, { texto }),
    transicao: (id, status) => post(`/agent-tasks/tarefas/${id}/transicao`, { status }),
    gates: (id, data) => post(`/agent-tasks/tarefas/${id}/gates`, data),
    decidir: (id, data) => post(`/agent-tasks/tarefas/${id}/decidir`, data),
    excluirTarefa: (id) => del(`/agent-tasks/tarefas/${id}`),
  },
  tts: async (text, opts = {}) => {
    const token = await getToken();
    const res = await fetch(`${API}/agents/tts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ text, ...opts }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const e = new Error(err.error || `HTTP ${res.status}`);
      e.code = err.code;
      e.status = res.status;
      throw e;
    }
    return await res.blob();
  },
};


function qsDoador({ chaves, inicio, fim, formato } = {}) {
  const qs = new URLSearchParams();
  for (const c of chaves || []) qs.append('chave', c);
  if (inicio) qs.set('inicio', inicio);
  if (fim) qs.set('fim', fim);
  if (formato) qs.set('formato', formato);
  return qs.toString();
}

export const financeiro = {
  dashboard: () => get('/financeiro/dashboard'),
  contas: {
    list: () => get('/financeiro/contas'),
    create: (data) => post('/financeiro/contas', data),
    update: (id, data) => put(`/financeiro/contas/${id}`, data),
    remove: (id) => del(`/financeiro/contas/${id}`),
  },
  categorias: {
    list: () => get('/financeiro/categorias'),
    create: (data) => post('/financeiro/categorias', data),
    remove: (id) => del(`/financeiro/categorias/${id}`),
  },
  transacoes: {
    list: (params) => get('/financeiro/transacoes' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/financeiro/transacoes', data),
    update: (id, data) => put(`/financeiro/transacoes/${id}`, data),
    remove: (id) => del(`/financeiro/transacoes/${id}`),
  },

  comprovantes: (params) => get('/financeiro/comprovantes' + (params ? '?' + new URLSearchParams(params) : '')),

  comprovantesPastas: () => get('/financeiro/comprovantes/pastas'),
  comprovantesPasta: (pasta, params) => get(`/financeiro/comprovantes/pasta/${encodeURIComponent(pasta)}` + (params ? '?' + new URLSearchParams(params) : '')),
  contasPagar: {
    list: (params) => get('/financeiro/contas-pagar' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/financeiro/contas-pagar', data),
    update: (id, data) => put(`/financeiro/contas-pagar/${id}`, data),
    remove: (id) => del(`/financeiro/contas-pagar/${id}`),
  },
  solicitacoesPendentesFinanceiro: () => get('/solicitacoes/pendentes-financeiro'),
  solicitacaoAprovarFinanceiro: (id, observacao, forma_pagamento) => post(`/solicitacoes/${id}/aprovar-financeiro`, { observacao, forma_pagamento }),
  solicitacaoReprovarFinanceiro: (id, motivo) => post(`/solicitacoes/${id}/reprovar-financeiro`, { motivo }),
  solicitacaoSobrestarFinanceiro: (id, motivo, revisao) => post(`/solicitacoes/${id}/sobrestar`, { motivo, revisao }),
  urgenciaFrequente: () => get('/solicitacoes/dashboard/urgencia-frequente'),
  recorrentes: {
    list: (params) => get('/financeiro/recorrentes' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/financeiro/recorrentes', data),
    update: (id, data) => patch(`/financeiro/recorrentes/${id}`, data),
    remove: (id) => del(`/financeiro/recorrentes/${id}`),
    gerarContasPagar: () => post('/financeiro/recorrentes/gerar-contas-pagar', {}),
  },
  projecaoCaixa: () => get('/financeiro/projecao-caixa'),
  generosidade: {
    overview: () => get('/financeiro/generosidade/overview'),
    anonimos: () => get('/financeiro/generosidade/anonimos'),
    pararam: (periodo = '2m') => get(`/financeiro/generosidade/pararam?periodo=${encodeURIComponent(periodo)}`),
    top: (periodo = '12m', ordem = 'desc', limite) =>
      get(`/financeiro/generosidade/top?periodo=${encodeURIComponent(periodo)}&ordem=${encodeURIComponent(ordem)}`
        + (limite ? `&limite=${encodeURIComponent(limite)}` : '')),
    historico: (membroId, periodo = '12m') =>
      get(`/financeiro/generosidade/top/${encodeURIComponent(membroId)}/historico?periodo=${encodeURIComponent(periodo)}`),
  },


  doadores: {
    buscar: (q) => get(`/financeiro/doadores/buscar?q=${encodeURIComponent(q)}`),
    historico: ({ chaves, inicio, fim }) => get(`/financeiro/doadores/historico?${qsDoador({ chaves, inicio, fim })}`),

    impressao: ({ chaves, inicio, fim }) => get(`/financeiro/doadores/relatorio?${qsDoador({ chaves, inicio, fim, formato: 'impressao' })}`),
    baixarXlsx: async ({ chaves, inicio, fim }) => {
      const h = await headers();
      const res = await fetch(`${API}/financeiro/doadores/relatorio?${qsDoador({ chaves, inicio, fim, formato: 'xlsx' })}`, { headers: h });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || 'Erro ao baixar a planilha');
      }
      const blob = await res.blob();
      const cd = res.headers.get('content-disposition') || '';
      const m = cd.match(/filename="([^"]+)"/);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = m ? m[1] : 'doacoes.xlsx';
      a.click();
      URL.revokeObjectURL(a.href);
    },
  },
  filaClassificacao: {
    stats: () => get('/financeiro/fila-classificacao/stats'),
    items: (params) => get('/financeiro/fila-classificacao/items' + (params ? '?' + new URLSearchParams(params) : '')),
    aprovarMassa: (confianca_min) => post('/financeiro/fila-classificacao/aprovar-massa', { confianca_min }),
    decidir: (id, data) => post(`/financeiro/fila-classificacao/${id}/decidir`, data),
    reclassificar: () => post('/financeiro/fila-classificacao/reclassificar', {}),
  },
  alertas: {
    list: (params) => get('/financeiro/alertas' + (params ? '?' + new URLSearchParams(params) : '')),
    atender: (id, comentario) => post(`/financeiro/alertas/${id}/atender`, { comentario }),
    gerar: () => post('/financeiro/alertas/gerar', {}),
  },
  calendario: (params) => get('/financeiro/calendario' + (params ? '?' + new URLSearchParams(params) : '')),
  centrosCustoLista: () => get('/financeiro/centros-custo'),
  closing: {
    list: () => get('/financeiro/closing'),
    fechar: (ano, mes, observacao) => post('/financeiro/closing/fechar', { ano, mes, observacao }),
    reabrir: (ano, mes, motivo) => post('/financeiro/closing/reabrir', { ano, mes, motivo }),
  },
  dreComparativo: () => get('/financeiro/dre-comparativo'),
  audit: {
    geral: (params) => get('/financeiro/audit' + (params ? '?' + new URLSearchParams(params) : '')),
    porRegistro: (tabela, rowId) => get(`/financeiro/audit/${encodeURIComponent(tabela)}/${encodeURIComponent(rowId)}`),
  },
  dreCentroAtual: () => get('/financeiro/dre-centro-custo/atual'),
  dreCentroHistorico: (id) => get(`/financeiro/dre-centro-custo/${id}/historico`),
  reembolsos: {
    list: (params) => get('/financeiro/reembolsos' + (params ? '?' + new URLSearchParams(params) : '')),
    aprovar: (id, status) => patch(`/financeiro/reembolsos/${id}`, { status }),
  },
};







const _finSemExtra = () => {
  try { return !!JSON.parse(localStorage.getItem('fin_dashboard_filtros_v1') || '{}')?.sem_extra; }
  catch { return false; }
};
const _finSemExtraQS = () => (_finSemExtra() ? '?sem_extra=1' : '');

export const financeiroV2 = {
  kpisTaticos: () => get('/financeiro-v2/kpis/taticos'),
  planoContas: {
    list: (params) => get('/financeiro-v2/plano-contas' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/financeiro-v2/plano-contas', data),
    update: (id, data) => put(`/financeiro-v2/plano-contas/${id}`, data),
    remove: (id) => del(`/financeiro-v2/plano-contas/${id}`),
  },
  centrosCusto: {
    list: (params) => get('/financeiro-v2/centros-custo' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/financeiro-v2/centros-custo', data),
    update: (id, data) => put(`/financeiro-v2/centros-custo/${id}`, data),
    remove: (id) => del(`/financeiro-v2/centros-custo/${id}`),
  },
  identificadores: {
    list: () => get('/financeiro-v2/identificadores'),
    create: (data) => post('/financeiro-v2/identificadores', data),
    update: (id, data) => put(`/financeiro-v2/identificadores/${id}`, data),
    remove: (id) => del(`/financeiro-v2/identificadores/${id}`),
  },
  cultoSlots: {
    list: () => get('/financeiro-v2/culto-slots'),
    create: (data) => post('/financeiro-v2/culto-slots', data),
    update: (id, data) => put(`/financeiro-v2/culto-slots/${id}`, data),
    remove: (id) => del(`/financeiro-v2/culto-slots/${id}`),
  },
  regras: {
    list: () => get('/financeiro-v2/regras-classificacao'),
    create: (data) => post('/financeiro-v2/regras-classificacao', data),
    update: (id, data) => put(`/financeiro-v2/regras-classificacao/${id}`, data),
    remove: (id) => del(`/financeiro-v2/regras-classificacao/${id}`),
  },
  importar: {
    ofx: (file, conta_id) => {
      const fd = new FormData();
      fd.append('arquivo', file);
      fd.append('conta_id', conta_id);


      return requestFile('/financeiro-v2/importar/ofx', fd, { timeoutMs: 300_000 });
    },
    pixExtrato: (file, conta_id) => {
      const fd = new FormData();
      fd.append('arquivo', file);
      if (conta_id) fd.append('conta_id', conta_id);
      return requestFile('/financeiro-v2/importar/pix-extrato', fd, { timeoutMs: 300_000 });
    },
    balanco: (file) => {
      const fd = new FormData();
      fd.append('arquivo', file);
      return requestFile('/financeiro-v2/importar/balanco', fd, { timeoutMs: 300_000 });
    },
    contribuicoesPrevia: (file) => {
      const fd = new FormData();
      fd.append('arquivo', file);
      return requestFile('/financeiro-v2/importar/contribuicoes/previa', fd, { timeoutMs: 300_000 });
    },
    contribuicoes: (file) => {
      const fd = new FormData();
      fd.append('arquivo', file);
      return requestFile('/financeiro-v2/importar/contribuicoes', fd, { timeoutMs: 300_000 });
    },
  },
  uploads: (params) => get('/financeiro-v2/uploads' + (params ? '?' + new URLSearchParams(params) : '')),
  lancamentosBrutos: (params) => get('/financeiro-v2/lancamentos-brutos' + (params ? '?' + new URLSearchParams(params) : '')),
  fila: {
    list: (params) => get('/financeiro-v2/fila-classificacao' + (params ? '?' + new URLSearchParams(params) : '')),
    aprovar: (filaId, data) => post(`/financeiro-v2/classificar/${filaId}/aprovar`, data),
    ignorar: (filaId) => post(`/financeiro-v2/classificar/${filaId}/ignorar`, {}),

    sugerirLote: () => post('/financeiro-v2/fila-classificacao/sugerir-lote', {}),
  },

  conciliacao: {
    sugestoes: () => get('/financeiro-v2/conciliacao/sugestoes'),
    aplicar: (pares) => post('/financeiro-v2/conciliacao/aplicar', { pares }),
    aplicarSeguros: () => post('/financeiro-v2/conciliacao/aplicar-seguros', {}),
  },

  conciliacaoOfx: {
    rodar: (inicio, fim, dryRun) => post('/financeiro-v2/conciliar-balanco-ofx', { inicio, fim, dry_run: dryRun }),
    revisao: (inicio, fim) => get(`/financeiro-v2/conciliar-balanco-ofx/revisao?inicio=${inicio}&fim=${fim}`),
    confirmar: (transacao_id, bruto_id) => post('/financeiro-v2/conciliar-balanco-ofx/confirmar', { transacao_id, bruto_id }),
    ignorar: (transacao_id) => post('/financeiro-v2/conciliar-balanco-ofx/ignorar', { transacao_id }),

  identificados: (inicio, fim) => get(`/financeiro-v2/conciliar-balanco-ofx/identificados?inicio=${inicio}&fim=${fim}`),
  desfazer: (transacao_id) => post('/financeiro-v2/conciliar-balanco-ofx/desfazer', { transacao_id }),
  },

  cartoes: {
    list: () => get('/financeiro-v2/cartoes'),
    criar: (data) => post('/financeiro-v2/cartoes', data),
    atualizar: (id, data) => put(`/financeiro-v2/cartoes/${id}`, data),
  },
  faturas: {
    list: (cartaoId) => get('/financeiro-v2/faturas' + (cartaoId ? `?cartao_id=${cartaoId}` : '')),
    get: (id) => get(`/financeiro-v2/faturas/${id}`),
    sincronizar: (id) => post(`/financeiro-v2/faturas/${id}/sincronizar`, {}),

    comparar: (id, file, senha) => {
      const fd = new FormData();
      fd.append('arquivo', file);
      if (senha) fd.append('senha', senha);
      return requestFile(`/financeiro-v2/faturas/${id}/comparar`, fd, { timeoutMs: 300_000 });
    },
  },
  notasCompras: {
    list: (params) => get('/financeiro-v2/notas-compras' + (params ? '?' + new URLSearchParams(params) : '')),
    lancar: (id, data) => post(`/financeiro-v2/notas-compras/${id}/lancar`, data),
    rejeitar: (id, motivo) => post(`/financeiro-v2/notas-compras/${id}/rejeitar`, { motivo }),
  },
  contasPagar: {
    list: (params) => get('/financeiro-v2/contas-pagar' + (params ? '?' + new URLSearchParams(params) : '')),
    resumo: (params) => get('/financeiro-v2/contas-pagar/resumo' + (params ? '?' + new URLSearchParams(params) : '')),
    importar: (file, origem) => {
      const fd = new FormData();
      fd.append('arquivo', file);
      if (origem) fd.append('origem', origem);
      return requestFile('/financeiro-v2/contas-pagar/importar', fd, { timeoutMs: 300_000 });
    },

    criar: (data) => post('/financeiro-v2/contas-pagar', data),
    atualizar: (id, data) => put(`/financeiro-v2/contas-pagar/${id}`, data),
    remover: (id) => del(`/financeiro-v2/contas-pagar/${id}`),
    tornarRecorrente: (id) => post(`/financeiro-v2/contas-pagar/${id}/tornar-recorrente`, {}),
    desfazerRecorrente: (id) => del(`/financeiro-v2/contas-pagar/${id}/tornar-recorrente`),


    lerBoleto: ({ arquivo, linha, origem } = {}) => {
      if (!arquivo) return post('/financeiro-v2/contas-pagar/ler-boleto', { linha, origem });
      const fd = new FormData();
      fd.append('arquivo', arquivo);
      if (linha) fd.append('linha', linha);
      if (origem) fd.append('origem', origem);
      return requestFile('/financeiro-v2/contas-pagar/ler-boleto', fd, { timeoutMs: 90_000 });
    },
    anexarBoleto: (id, arquivo) => {
      const fd = new FormData();
      fd.append('arquivo', arquivo);
      return requestFile(`/financeiro-v2/contas-pagar/${id}/boleto`, fd, { timeoutMs: 90_000 });
    },
    verBoleto: (id) => get(`/financeiro-v2/contas-pagar/${id}/boleto`),
  },

  auxFuncionarios: () => get('/financeiro-v2/aux/funcionarios'),


  transacoes: {
    list: (params) => get('/financeiro-v2/transacoes' + (params ? '?' + new URLSearchParams(params) : '')),
    criar: (data) => post('/financeiro-v2/transacoes', data),
    atualizar: (id, data) => put(`/financeiro-v2/transacoes/${id}`, data),
    detalhe: (id) => get(`/financeiro-v2/transacoes/${id}/detalhe`),
    anexar: (id, file) => {
      const fd = new FormData();
      fd.append('arquivo', file);
      return requestFile(`/financeiro-v2/transacoes/${id}/anexos`, fd, { timeoutMs: 120_000 });
    },
    removerAnexo: (id, url) => request(`/financeiro-v2/transacoes/${id}/anexos`, { method: 'DELETE', body: JSON.stringify({ url }) }),
  },
  arrecadacoes: (params) => get('/financeiro-v2/arrecadacoes' + (params ? '?' + new URLSearchParams(params) : '')),
  despesasDetalhe: (params) => get('/financeiro-v2/despesas/detalhe' + (params ? '?' + new URLSearchParams(params) : '')),
  sugerirPlanoHorario: (params) => get('/financeiro-v2/sugerir-plano-horario' + (params ? '?' + new URLSearchParams(params) : '')),
  historicoPagador: ({ nome, documento }) => {
    const qs = new URLSearchParams();
    if (nome) qs.set('nome', nome);
    if (documento) qs.set('documento', documento);
    return get('/financeiro-v2/historico-pagador?' + qs.toString());
  },
  dashboard: {
    overview: (opts) => {

      if (!opts) return get('/financeiro-v2/dashboard/overview');
      if (typeof opts === 'string') return get(`/financeiro-v2/dashboard/overview?period=${opts}`);
      const qs = new URLSearchParams();
      if (opts.period) qs.set('period', opts.period);
      if (opts.year != null) qs.set('year', opts.year);
      if (opts.month != null) qs.set('month', opts.month);
      if (opts.inicio) qs.set('inicio', opts.inicio);
      if (opts.fim) qs.set('fim', opts.fim);
      return get(`/financeiro-v2/dashboard/overview${qs.toString() ? `?${qs}` : ''}`);
    },
    semana: (semana) => get('/financeiro-v2/dashboard/semana' + (semana ? `?semana=${semana}` : '')),
    semanaCompleta: (semana, filtros = {}) => {
      const qs = new URLSearchParams();
      if (semana) qs.set('semana', semana);
      if (filtros?.centro_custo_id) qs.set('centro_custo_id', filtros.centro_custo_id);
      if (filtros?.plano_contas_id) qs.set('plano_contas_id', filtros.plano_contas_id);
      if (filtros?.sem_extra) qs.set('sem_extra', '1');
      const s = qs.toString();
      return get('/financeiro-v2/dashboard/semana-completa' + (s ? `?${s}` : ''));
    },
    financeiroCompleto: () => get(`/financeiro-v2/dashboard/financeiro-completo${_finSemExtraQS()}`),
    saidasDetalhadas: (mes) => get('/financeiro-v2/dashboard/saidas-detalhadas' + (mes ? `?mes=${mes}` : '')),
    melhorSemana: () => get('/financeiro-v2/dashboard/melhor-semana'),
    assistente: (aba, semana) => {
      const qs = new URLSearchParams({ aba: aba || 'resumo' });
      if (semana) qs.set('semana', semana);
      if (_finSemExtra()) qs.set('sem_extra', '1');
      return get(`/financeiro-v2/dashboard/assistente?${qs}`);
    },

    analiseProfunda: (semana) => {
      const qs = new URLSearchParams();
      if (semana) qs.set('semana', semana);
      if (_finSemExtra()) qs.set('sem_extra', '1');
      const s = qs.toString();
      return request('/financeiro-v2/dashboard/analise-profunda' + (s ? `?${s}` : ''), { timeout: 120_000 });
    },
  },
  metas: {
    list: (params) => get('/financeiro-v2/metas' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/financeiro-v2/metas', data),
    update: (id, data) => put(`/financeiro-v2/metas/${id}`, data),
    remove: (id) => del(`/financeiro-v2/metas/${id}`),
    progresso: (params) => {
      const p = new URLSearchParams(params || {});
      if (_finSemExtra()) p.set('sem_extra', '1');
      const qs = p.toString();
      return get('/financeiro-v2/metas-progresso' + (qs ? `?${qs}` : ''));
    },
  },
  freqArrecadacaoSemanal: (semanas = 20) => get(`/financeiro-v2/freq-arrecadacao-semanal?semanas=${semanas}${_finSemExtra() ? '&sem_extra=1' : ''}`),
  arrecadacaoAnual: (ano, filtros = {}) => {
    const params = new URLSearchParams();
    if (ano) params.set('ano', ano);
    if (filtros.centro_custo_id) params.set('centro_custo_id', filtros.centro_custo_id);
    if (filtros.plano_contas_id) params.set('plano_contas_id', filtros.plano_contas_id);
    if (filtros.sem_extra || _finSemExtra()) params.set('sem_extra', '1');
    const qs = params.toString();
    return get(`/financeiro-v2/arrecadacao-anual${qs ? `?${qs}` : ''}`);
  },
  sazonalidadeSemanal: (anos) => {
    const p = new URLSearchParams();
    if (Array.isArray(anos) && anos.length) p.set('anos', anos.join(','));
    if (_finSemExtra()) p.set('sem_extra', '1');
    const qs = p.toString();
    return get(`/financeiro-v2/sazonalidade-semanal${qs ? `?${qs}` : ''}`);
  },
  categoriaTransacoes: ({ categoria, inicio, fim }) =>
    get(`/financeiro-v2/categoria-transacoes?categoria=${encodeURIComponent(categoria)}&inicio=${inicio}&fim=${fim}`),
  despesaTransacoes: (params) =>
    get('/financeiro-v2/despesa-transacoes?' + new URLSearchParams(params).toString()),
  filtrosDisponiveis: () => get('/financeiro-v2/filtros-disponiveis'),
  saudeFinanceira: (ano) => {
    const p = new URLSearchParams();
    if (ano) p.set('ano', ano);
    if (_finSemExtra()) p.set('sem_extra', '1');
    const qs = p.toString();
    return get(`/financeiro-v2/saude-financeira${qs ? `?${qs}` : ''}`);
  },
  doadores: ({ ano, limit, offset } = {}) => {
    const p = new URLSearchParams();
    if (ano) p.set('ano', ano);
    if (limit) p.set('limit', limit);
    if (offset != null) p.set('offset', offset);
    const qs = p.toString();
    return get(`/financeiro-v2/doadores${qs ? `?${qs}` : ''}`);
  },
  doadorTransacoes: ({ nome, ano, limit } = {}) => {
    const p = new URLSearchParams();
    if (nome) p.set('nome', nome);
    if (ano) p.set('ano', ano);
    if (limit) p.set('limit', limit);
    return get(`/financeiro-v2/doador/transacoes?${p.toString()}`);
  },
  dizimoOferta: (ano, semExtra) => get(`/financeiro-v2/dizimo-oferta?ano=${ano || ''}${semExtra ? '&sem_extra=1' : ''}`),

  quintasSemanas: (anos = 4, semExtra = false) => get(`/financeiro-v2/quintas-semanas?anos=${anos}&sem_extra=${semExtra ? 1 : 0}`),
  syncSaldoBancos: () => post('/financeiro-v2/sync-saldo-bancos', {}),
  backfill: (data) => post('/financeiro-v2/backfill/transacoes', data || {}),
  recorrencias: {
    list: (params) => get('/financeiro-v2/recorrencias' + (params ? '?' + new URLSearchParams(params) : '')),
    update: (id, data) => put(`/financeiro-v2/recorrencias/${id}`, data),
    detectar: (data) => post('/financeiro-v2/recorrencias/detectar', data || {}),
  },
  dre: {
    mensal: (mes) => get(`/financeiro-v2/dre/mensal?mes=${mes}`),
    comparativo: (meses = 6) => get(`/financeiro-v2/dre/comparativo?meses=${meses}`),
  },
  analises: {
    heatmap: () => get('/financeiro-v2/analises/heatmap'),
    forecast: (semanas = 4) => get(`/financeiro-v2/analises/forecast?semanas=${semanas}`),
    rodar: () => post('/financeiro-v2/analises/rodar', {}),
  },
  alertas: {
    list: (params) => get('/financeiro-v2/alertas' + (params ? '?' + new URLSearchParams(params) : '')),
    dismiss: (id, data) => post(`/financeiro-v2/alertas/${id}/dismiss`, data || {}),
  },
};

export const santander = {
  pixCultoAtual: (limit = 30) => get(`/santander/pix/culto-atual?limit=${limit}`),
  pixApiDiagnostico: () => get('/santander/pix-api/diagnostico'),
  health: () => get('/santander/health'),
  saldo: () => get('/santander/saldo'),
  saldoHistorico: (dias = 30) => get(`/santander/saldo/historico?dias=${dias}`),
  contas: () => get('/santander/contas'),
  extrato: (inicio, fim, refresh = false) =>
    get(`/santander/extrato?inicio=${inicio}&fim=${fim}${refresh ? '&refresh=1' : ''}`),
  comprovantes: {
    list: (params) => get('/santander/comprovantes?' + new URLSearchParams(params)),
    local: (params) => get('/santander/comprovantes-local' + (params ? '?' + new URLSearchParams(params) : '')),
    baixar: (paymentId, metadata) => post(`/santander/comprovantes/${encodeURIComponent(paymentId)}/baixar`, { metadata }),
    pdfUrl: (paymentId) => get(`/santander/comprovantes/${encodeURIComponent(paymentId)}/pdf-url`),
    vincular: (paymentId, data) => post(`/santander/comprovantes/${encodeURIComponent(paymentId)}/vincular`, data),
    desvincular: (paymentId) => del(`/santander/comprovantes/${encodeURIComponent(paymentId)}/vincular`),
  },
  bulk: {
    list: () => get('/santander/bulk'),
    create: (data) => post('/santander/bulk', data),
    get: (orderId) => get(`/santander/bulk/${encodeURIComponent(orderId)}`),
  },
  log: () => get('/santander/log'),
  syncExtratoFila: (dias = 3) => post('/santander/sync-extrato-fila', { dias }),
  syncExtratoHistorico: () => get('/santander/sync-extrato-historico'),
  importarHistorico: (desde, ate) => post('/santander/importar-historico', { desde, ate }),
  pixCob: {
    health: () => get('/santander/pix-cob/health'),
    list: (params) => get('/santander/pix-cob' + (params ? '?' + new URLSearchParams(params) : '')),
    get: (txid) => get(`/santander/pix-cob/${encodeURIComponent(txid)}`),
    criar: (data) => post('/santander/pix-cob', data),
    cancelar: (txid) => patch(`/santander/pix-cob/${encodeURIComponent(txid)}/cancelar`, {}),
  },
  pagamentos: {
    health: () => get('/santander/pagamentos/health'),
    parse: (linha) => post('/santander/pagamentos/parse', { linha }),
    list: (params) => get('/santander/pagamentos' + (params ? '?' + new URLSearchParams(params) : '')),
    get: (id) => get(`/santander/pagamentos/${id}`),
    criar: (data) => post('/santander/pagamentos', data),
    cancelar: (id) => patch(`/santander/pagamentos/${id}/cancelar`, {}),
  },
  boletos: {
    health: () => get('/santander/boletos/health'),
    list: (params) => get('/santander/boletos' + (params ? '?' + new URLSearchParams(params) : '')),
    get: (id) => get(`/santander/boletos/${id}`),
    emitir: (data) => post('/santander/boletos', data),
    cancelar: (id) => patch(`/santander/boletos/${id}/cancelar`, {}),
  },
};

export const logistica = {
  dashboard: (refresh = false) => get('/logistica/dashboard' + (refresh ? '?refresh=1' : '')),
  fornecedores: {
    list: (params) => get('/logistica/fornecedores' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/logistica/fornecedores', data),
    update: (id, data) => put(`/logistica/fornecedores/${id}`, data),
    remove: (id) => del(`/logistica/fornecedores/${id}`),
    enriquecer: (id) => post(`/logistica/fornecedores/${id}/enriquecer`, {}),
    enriquecerIncompletos: () => post('/logistica/fornecedores/enriquecer-incompletos', {}),
  },
  pedidos: {
    list: (params) => get('/logistica/pedidos' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/logistica/pedidos', data),
    update: (id, data) => put(`/logistica/pedidos/${id}`, data),
    remove: (id) => del(`/logistica/pedidos/${id}`),
    receber: (id, data) => post(`/logistica/pedidos/${id}/recebimento`, data),
    itens: (pedidoId) => get(`/logistica/pedidos/${pedidoId}/itens`),
    addItem: (pedidoId, data) => post(`/logistica/pedidos/${pedidoId}/itens`, data),
    removeItem: (id) => del(`/logistica/itens/${id}`),
  },
  notas: {
    list: (params) => get('/logistica/notas' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/logistica/notas', data),
    update: (id, data) => put(`/logistica/notas/${id}`, data),
    remove: (id) => del(`/logistica/notas/${id}`),
    escanear: (file) => {
      const fd = new FormData();
      fd.append('arquivo', file);
      return requestFile('/logistica/notas/escanear', fd, { timeoutMs: 120_000 });
    },


    importarXml: (arquivos) => post('/logistica/notas/importar-xml', { arquivos }),

    nfe: (id) => get(`/logistica/notas/${id}/nfe`),

    importarDanfe: (arquivos) => post('/logistica/notas/importar-danfe', { arquivos }),
    danfeUrl: (id) => get(`/logistica/notas/${id}/danfe`),
    enviarFinanceiro: (id) => post(`/logistica/notas/${id}/enviar-financeiro`, {}),
    categorias: () => get('/logistica/notas/aux/categorias'),
  },

  compras: {
    list: (params) => get('/logistica/compras' + (params ? '?' + new URLSearchParams(params) : '')),
    kpis: () => get('/logistica/compras/kpis'),
    centrosCusto: () => get('/logistica/compras/aux/centros-custo'),
    planoContas: () => get('/logistica/compras/aux/plano-contas'),
    compradores: () => get('/logistica/compras/aux/compradores'),
    create: (data) => post('/logistica/compras', data),
    update: (id, data) => put(`/logistica/compras/${id}`, data),
    remove: (id) => del(`/logistica/compras/${id}`),
    escanear: (file) => {
      const fd = new FormData();
      fd.append('arquivo', file);
      return requestFile('/logistica/compras/escanear', fd, { timeoutMs: 120_000 });
    },
    importar: (file) => {
      const fd = new FormData();
      fd.append('arquivo', file);
      return requestFile('/logistica/compras/importar', fd, { timeoutMs: 180_000 });
    },
    aprovar: (id, correcoes) => post(`/logistica/compras/${id}/aprovar`, correcoes || {}),
    rejeitar: (id, motivo) => post(`/logistica/compras/${id}/rejeitar`, { motivo }),
    sugestoesVinculo: (id) => get(`/logistica/compras/${id}/sugestoes-vinculo`),
    vincular: (id, fin_transacao_id, score) => post(`/logistica/compras/${id}/vincular`, { fin_transacao_id, score }),
    desvincular: (id) => post(`/logistica/compras/${id}/desvincular`, {}),
  },

  estoque: {
    produtos: (params) => get('/logistica/estoque/produtos' + (params ? '?' + new URLSearchParams(params) : '')),
    criarProduto: (data) => post('/logistica/estoque/produtos', data),
    atualizarProduto: (id, data) => patch(`/logistica/estoque/produtos/${id}`, data),
    removerProduto: (id) => del(`/logistica/estoque/produtos/${id}`),
    movimentacoes: (params) => get('/logistica/estoque/movimentacoes' + (params ? '?' + new URLSearchParams(params) : '')),
    lancar: (movimentos) => post('/logistica/estoque/movimentacoes', Array.isArray(movimentos) ? { movimentos } : movimentos),
    lotes: (dias) => get('/logistica/estoque/lotes' + (dias ? `?dias=${dias}` : '')),
    consumo: (dias = 90) => get(`/logistica/estoque/consumo?dias=${dias}`),
    gerarCompra: (produto_ids) => post('/logistica/estoque/gerar-compra', { produto_ids }),
    relatorio: (dias = 90) => get(`/logistica/estoque/relatorio?dias=${dias}`),
  },
};

export const patrimonio = {
  dashboard: () => get('/patrimonio/dashboard'),
  dashboardIndicadores: () => get('/patrimonio/dashboard/indicadores'),
  dashboardDepreciacao: () => get('/patrimonio/dashboard/depreciacao'),
  dashboardAtividade: () => get('/patrimonio/dashboard/atividade'),
  categorias: {
    list: () => get('/patrimonio/categorias'),
    create: (data) => post('/patrimonio/categorias', data),
    update: (id, data) => put(`/patrimonio/categorias/${id}`, data),
    remove: (id) => del(`/patrimonio/categorias/${id}`),
  },
  localizacoes: {
    list: () => get('/patrimonio/localizacoes'),
    create: (data) => post('/patrimonio/localizacoes', data),
    update: (id, data) => put(`/patrimonio/localizacoes/${id}`, data),
    remove: (id) => del(`/patrimonio/localizacoes/${id}`),
  },
  bens: {
    list: (params) => get('/patrimonio/bens' + (params ? '?' + new URLSearchParams(params) : '')),
    get: (id) => get(`/patrimonio/bens/${id}`),
    create: (data) => post('/patrimonio/bens', data),
    update: (id, data) => put(`/patrimonio/bens/${id}`, data),
    remove: (id, data) => del(`/patrimonio/bens/${id}`, data),
    proximoCodigo: (qtd = 1) => get(`/patrimonio/bens/proximo-codigo?qtd=${qtd}`),
    criarLote: (data) => post('/patrimonio/bens/lote', data),
    movimentar: (id, data) => post(`/patrimonio/bens/${id}/movimentacoes`, data),
    dispensarAlerta: (id) => post(`/patrimonio/bens/${id}/dispensar-alerta`, {}),
    porCodigo: (codigo) => get(`/patrimonio/bens/barcode/${encodeURIComponent(codigo)}`),
    bulkEditar: (data) => put('/patrimonio/bens/bulk', data),
    bulkRenomear: (data) => put('/patrimonio/bens/bulk/renomear', data),
    bulkMovimentar: (data) => post('/patrimonio/bens/bulk/movimentar', data),
    bulkBaixa: (data) => post('/patrimonio/bens/bulk/baixa', data),
  },
  movimentacoes: {
    list: (params) => get('/patrimonio/movimentacoes' + (params ? '?' + new URLSearchParams(params) : '')),
  },
  inventarios: {
    list: () => get('/patrimonio/inventarios'),
    create: (data) => post('/patrimonio/inventarios', data),
    atualizar: (id, data) => patch(`/patrimonio/inventarios/${id}`, data),
  },
  revisao: {
    responsaveis: () => get('/patrimonio/revisao/aux/responsaveis'),
    ciclos: () => get('/patrimonio/revisao/ciclos'),
    criarCiclo: (data) => post('/patrimonio/revisao/ciclos', data),
    convocacao: (id) => get(`/patrimonio/revisao/convocacoes/${id}`),
    iniciar: (id) => post(`/patrimonio/revisao/convocacoes/${id}/iniciar`, {}),
    atualizarItem: (id, data) => put(`/patrimonio/revisao/itens/${id}`, data),
    concluir: (id) => post(`/patrimonio/revisao/convocacoes/${id}/concluir`, {}),
    indicadores: () => get('/patrimonio/revisao/indicadores'),
  },
};

export const rh = {




  uploadFotoNova: (file) => { const fd = new FormData(); fd.append('foto', file); return requestFile('/rh/foto', fd); },
  dashboard: () => get('/rh/dashboard'),
  dashboardSeries: (meses = 12) => get(`/rh/dashboard/series?meses=${meses}`),
  acessos: () => get('/rh/acessos'),
  organograma: {
    ia: (instrucao) => post('/rh/organograma/ia', { instrucao }),
    aplicar: (mudancas) => post('/rh/organograma/ia/aplicar', { mudancas }),
  },
  funcionarios: {
    list: (params) => get('/rh/funcionarios' + (params ? '?' + new URLSearchParams(params) : '')),
    get: (id) => get(`/rh/funcionarios/${id}`),
    pagamentos: (id) => get(`/rh/funcionarios/${id}/pagamentos`),
    create: (data) => post('/rh/funcionarios', data),
    update: (id, data) => put(`/rh/funcionarios/${id}`, data),
    remove: (id) => del(`/rh/funcionarios/${id}`),
    desligar: (id, data) => post(`/rh/funcionarios/${id}/desligar`, data),
    reativar: (id) => post(`/rh/funcionarios/${id}/reativar`),
    concluirAdmissao: (id) => post(`/rh/funcionarios/${id}/concluir-admissao`),
    setGestor: (id, gestorId) => put(`/rh/funcionarios/${id}/gestor`, { gestor_id: gestorId || null }),
    onboardingLink: (id, regenerar = false) => post(`/rh/funcionarios/${id}/onboarding-link`, { regenerar }),
    fichaContratadaLink: (id, regenerar = false) => post(`/rh/funcionarios/${id}/ficha-contratada-link`, { regenerar }),
    uploadFoto: (id, file) => {
      const fd = new FormData();
      fd.append('foto', file);
      return requestFile(`/rh/funcionarios/${id}/foto`, fd);
    },
  },
  documentos: {
    create: (funcId, data) => post(`/rh/funcionarios/${funcId}/documentos`, data),
    upload: (funcId, formData) => requestFile(`/rh/funcionarios/${funcId}/documentos`, formData),
    remove: (id) => del(`/rh/documentos/${id}`),
  },
  treinamentos: {
    list: () => get('/rh/treinamentos'),
    create: (data) => post('/rh/treinamentos', data),
    update: (id, data) => put(`/rh/treinamentos/${id}`, data),
    remove: (id) => del(`/rh/treinamentos/${id}`),
    inscrever: (id, data) => post(`/rh/treinamentos/${id}/inscrever`, data),
    atualizarInscricao: (id, data) => patch(`/rh/treinamentos-funcionarios/${id}`, data),
  },

  folha: {
    autoVincular: () => post('/rh/folha/auto-vincular', {}),
    naoVinculados: () => get('/rh/folha/nao-vinculados'),
    vincular: (txId, body) => patch(`/rh/folha/vinculo/${txId}`, body),
  },
  ferias: {
    list: (params) => get('/rh/ferias' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (funcId, data) => post(`/rh/funcionarios/${funcId}/ferias`, data),
    update: (id, data) => patch(`/rh/ferias/${id}`, data),
    remove: (id) => del(`/rh/ferias/${id}`),


    porSolicitacao: (solicitacaoId) => get(`/rh/solicitacoes/${solicitacaoId}/ferias`),
    registrarDeSolicitacao: (solicitacaoId, data) => post(`/rh/solicitacoes/${solicitacaoId}/ferias`, data),
  },

  coberturas: {
    list: (params) => get('/rh/coberturas' + (params ? '?' + new URLSearchParams(params) : '')),
    cancelar: (id) => post(`/rh/coberturas/${id}/cancelar`, {}),
    minhas: () => get('/coberturas/minhas'),
  },
  extras: {
    list: (params) => get('/rh/extras' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/rh/extras', data),
    update: (id, data) => patch(`/rh/extras/${id}`, data),
    remove: (id) => del(`/rh/extras/${id}`),
  },
  config: {
    get: () => get('/rh/config'),
    set: (chave, valor) => put(`/rh/config/${chave}`, { valor }),
  },
  avaliacoes: {
    list: (params) => get('/rh/avaliacoes' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/rh/avaliacoes', data),
    update: (id, data) => patch(`/rh/avaliacoes/${id}`, data),
    remove: (id) => del(`/rh/avaliacoes/${id}`),
    submitFatores: (id, data) => post(`/rh/avaliacoes/${id}/fatores`, data),
    concluir: (id) => post(`/rh/avaliacoes/${id}/concluir`),
    iniciarCiclo: (data) => post('/rh/avaliacoes/iniciar-ciclo', data),
  },


  fichaContratada: {
    pendentes: () => get('/rh/ficha-contratada/pendentes'),


    cobrar: (seco = false) => post(`/rh/ficha-contratada/cobrar${seco ? '?seco=1' : ''}`, { seco }),
  },
  onboarding: {
    pendentes: () => get('/rh/onboarding/pendentes'),
    preview: () => post('/rh/onboarding/preview', {}),
    disparar: () => post('/rh/onboarding/disparar', {}),
  },
};

export const pcs = {

  graus: {
    list: () => get('/pcs/graus'),
    update: (id, data) => put(`/pcs/graus/${id}`, data),
    reajusteColetivo: (data) => post('/pcs/graus/reajuste-coletivo', data),
  },
  reajustes: {
    list: () => get('/pcs/reajustes-coletivos'),
  },

  criterios: {
    list: () => get('/pcs/criterios'),
    update: (id, data) => put(`/pcs/criterios/${id}`, data),
    updateNivel: (id, data) => put(`/pcs/niveis-criterio/${id}`, data),
  },

  beneficios: {
    list: () => get('/pcs/beneficios'),
    update: (id, data) => put(`/pcs/beneficios/${id}`, data),
    setElegibilidade: (beneficioId, grauId, status) =>
      put(`/pcs/beneficios/${beneficioId}/grau/${grauId}`, { status }),
    porFuncionario: (id) => get(`/pcs/funcionarios/${id}/beneficios`),
  },

  aderencia: {
    list: () => get('/pcs/aderencia'),
    resumo: () => get('/pcs/aderencia/resumo'),
    planoAcao: () => get('/pcs/aderencia/plano-acao'),
    aplicarEnquadramento: (data) => post('/pcs/aderencia/aplicar-enquadramento', data || {}),
  },

  progressoes: {
    list: (params) => get('/pcs/progressoes' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/pcs/progressoes', data),
  },

  elegibilidade: () => get('/pcs/elegibilidade'),
  sugerirGrau: (pontos) => get(`/pcs/sugerir-grau/${pontos}`),

  pontuacao: {
    list: (ciclo) => get('/pcs/pontuacao' + (ciclo ? `?ciclo=${encodeURIComponent(ciclo)}` : '')),
    resumo: (ciclo) => get('/pcs/pontuacao/resumo' + (ciclo ? `?ciclo=${encodeURIComponent(ciclo)}` : '')),
    update: (funcionarioId, data) => put(`/pcs/pontuacao/${funcionarioId}`, data),
  },
};

export const notificacoes = {
  list: (params) => get('/notificacoes' + (params ? '?' + new URLSearchParams(params) : '')),
  count: () => get('/notificacoes/count'),
  ler: (id) => patch(`/notificacoes/${id}/ler`),
  lerTodas: () => patch('/notificacoes/ler-todas'),
  gerar: () => post('/notificacoes/gerar'),
  regras: {
    list: () => get('/notificacoes/regras'),
    create: (data) => post('/notificacoes/regras', data),
    remove: (id) => del(`/notificacoes/regras/${id}`),
  },
};


export const appAnalytics = {
  resumo: (dias = 14) => get(`/app-analytics/resumo?dias=${dias}`),
  aoVivo: () => get('/app-analytics/ao-vivo'),
};


export const sistema = {
  fundacao: () => get('/sistema/fundacao'),
  observabilityStatus: () => get('/sistema/observabilidade/status'),
  runBackendObservabilityCanary: () => post('/sistema/observabilidade/canary', { confirm: 'SENTRY_CANARY' }),
  overview: (hours = 24) => get(`/sistema/overview?hours=${hours}`),
  runs: (params = {}) => get('/sistema/jobs/runs?' + new URLSearchParams(
    Object.entries(params).filter(([, value]) => value != null && value !== '')
  )),
  incidents: (params = {}) => get('/sistema/incidents?' + new URLSearchParams(
    Object.entries(params).filter(([, value]) => value != null && value !== '')
  )),
  createIncident: (data) => post('/sistema/incidents', data),
  updateIncident: (id, data) => patch(`/sistema/incidents/${id}`, data),
  incidentEvents: (id) => get(`/sistema/incidents/${id}/events`),
  addIncidentNote: (id, message) => post(`/sistema/incidents/${id}/notes`, { message }),
  webErrors: (limit = 100) => get(`/sistema/web/errors?limit=${limit}`),
  webCommandCenter: (hours = 24 * 7) => get(`/sistema/web/command-center?hours=${hours}`),
  runWebSynthetics: () => post('/sistema/web/synthetics/run', {}),
  mobileCommandCenter: (platform, days = 14) => get(`/sistema/mobile/command-center?platform=${encodeURIComponent(platform)}&days=${days}`),
  refreshMobilePushReceipts: () => post('/sistema/mobile/push/receipts/refresh', {}),
  governanceCommandCenter: () => get('/sistema/governance/command-center'),
  updateGovernanceControl: (controlKey, data) => patch(`/sistema/governance/controls/${encodeURIComponent(controlKey)}`, data),
  financeCommandCenter: (months = 12) => get(`/sistema/finance/command-center?months=${months}`),
  createFinanceCost: (data) => post('/sistema/finance/costs', data),
  updateFinanceProvider: (providerKey, data) => patch(`/sistema/finance/providers/${encodeURIComponent(providerKey)}`, data),
  createExecutiveReport: (data) => post('/sistema/finance/reports', data),
  publishExecutiveReport: (id) => post(`/sistema/finance/reports/${id}/publish`, {}),
  executiveReport: (id) => get(`/sistema/finance/reports/${id}/export`),
  feedback: (params = {}) => get('/sistema/feedback?' + new URLSearchParams(
    Object.entries(params).filter(([, value]) => value != null && value !== '')
  )),
};


export const comunicados = {
  list: () => get('/comunicados'),
  create: (data) => post('/comunicados', data),
  update: (id, data) => put(`/comunicados/${id}`, data),
  publicar: (id) => post(`/comunicados/${id}/publicar`, {}),
  arquivar: (id) => post(`/comunicados/${id}/arquivar`, {}),
  remove: (id) => del(`/comunicados/${id}`),
  uploadFoto: (file) => {
    const fd = new FormData();
    fd.append('arquivo', file);
    return requestFile('/comunicados/upload-foto', fd);
  },
};


export const painelRh = {
  aniversariantes: () => get('/painel-rh/aniversariantes'),
  eventos: () => get('/painel-rh/eventos'),
  comunicados: () => get('/painel-rh/comunicados'),
  comunicadosAdmin: () => get('/painel-rh/comunicados/admin'),
  criarComunicado: (data) => post('/painel-rh/comunicados', data),
  atualizarComunicado: (id, data) => put(`/painel-rh/comunicados/${id}`, data),
  publicarComunicado: (id) => post(`/painel-rh/comunicados/${id}/publicar`, {}),
  arquivarComunicado: (id) => post(`/painel-rh/comunicados/${id}/arquivar`, {}),
  removerComunicado: (id) => del(`/painel-rh/comunicados/${id}`),
};

export const painelArea = {

  get: (area, params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null && v !== '')
    ).toString();
    return get(`/painel-area/${encodeURIComponent(area)}${qs ? `?${qs}` : ''}`);
  },

  series: (area, meses = 12) => {
    return get(`/painel-area/${encodeURIComponent(area)}/series?meses=${meses}`);
  },


  registrarNps: (area, body) => post(`/painel-area/${encodeURIComponent(area)}/nps`, body),

  pessoas: (area) => get(`/painel-area/${encodeURIComponent(area)}/pessoas`),



  procedenciaKpi: (kpiId) => get(`/painel-area/kpi/${encodeURIComponent(kpiId)}/procedencia`),

  pessoa: (area, id) => get(`/painel-area/${encodeURIComponent(area)}/pessoas/${id}`),
};


export const totemKids = {
  dashboard: () => get('/totem-kids/dashboard'),

  cadastrosNovos: (params) => get('/totem-kids/cadastros-novos' + (params ? '?' + new URLSearchParams(params) : '')),

  voluntariadoInscricoes: (params) => get('/totem-kids/voluntariado-inscricoes' + (params ? '?' + new URLSearchParams(params) : '')),
  voluntariadoInscricaoUpdate: (id, dados) => patch(`/totem-kids/voluntariado-inscricoes/${id}`, dados),
  batismos: () => get('/totem-kids/batismos'),
  apresentacoes: () => get('/totem-kids/apresentacoes'),

  apresentacaoDetalhe: (id) => get(`/totem-kids/apresentacoes/${id}`),
  apresentacaoUpdate: (id, body) => patch(`/totem-kids/apresentacoes/${id}`, body),
  apresentacaoRemove: (id) => del(`/totem-kids/apresentacoes/${id}`),

  apresentacaoCheckin: (id, presente) => post(`/totem-kids/apresentacoes/${id}/checkin`, { presente }),


  apresentacaoFoto: (id, file) => { const fd = new FormData(); fd.append('foto', file); return requestFile(`/totem-kids/apresentacoes/${id}/foto`, fd, { timeoutMs: 120_000 }); },
  apresentacaoFotoRemover: (id) => del(`/totem-kids/apresentacoes/${id}/foto`),

  apresentacaoHorarios: {
    list: (data) => get('/totem-kids/apresentacoes/horarios' + (data ? `?data=${encodeURIComponent(data)}` : '')),
    create: (body) => post('/totem-kids/apresentacoes/horarios', body),
    update: (id, body) => patch(`/totem-kids/apresentacoes/horarios/${id}`, body),
    remove: (id) => del(`/totem-kids/apresentacoes/horarios/${id}`),
  },
  resumoExemplo: () => post('/totem-kids/resumo/exemplo', {}),
  comparativoMes: (mes) => get(`/totem-kids/comparativo-mes?mes=${encodeURIComponent(mes)}`),
  frequenciaSistema: (data) => get(`/totem-kids/frequencia-sistema?data=${encodeURIComponent(data)}`),
  kidsEquipe: {
    list: () => get('/totem-kids/kids-equipe'),
    buscar: (q) => get(`/totem-kids/kids-equipe/buscar?q=${encodeURIComponent(q)}`),
    alocar: (body) => post('/totem-kids/kids-equipe/membro', body),
    remover: (id) => del(`/totem-kids/kids-equipe/membro/${id}`),
    ficha: (volProfileId) => get(`/totem-kids/kids-equipe/membro/${volProfileId}/ficha`),
  },
  estoque: {
    list: () => get('/totem-kids/estoque'),
    add: (salaId, body) => post(`/totem-kids/salas/${salaId}/estoque`, body),
    update: (id, body) => patch(`/totem-kids/estoque/${id}`, body),
    remove: (id) => del(`/totem-kids/estoque/${id}`),
    registrarPatrimonio: (id) => post(`/totem-kids/estoque/${id}/patrimonio`, {}),
    localizacoesKids: () => get('/totem-kids/salas/localizacoes-kids'),
    sincronizarPatrimonio: () => post('/totem-kids/salas/sincronizar-patrimonio', {}),
    vincularLocalizacao: (salaId, localizacao_id) => patch(`/totem-kids/salas/${salaId}/localizacao`, { localizacao_id }),
  },
  sessoes: {
    atual: () => get('/totem-kids/sessoes/atual'),
    garantir: (cultoId) => post('/totem-kids/sessoes/garantir', { culto_id: cultoId }),
    list: (params = {}) => {
      const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
      return get(`/totem-kids/sessoes${qs ? `?${qs}` : ''}`);
    },
    create: (data) => post('/totem-kids/sessoes', data),
    abrir: (id) => post(`/totem-kids/sessoes/${id}/abrir`, {}),
    encerrar: (id, body = {}) => post(`/totem-kids/sessoes/${id}/encerrar`, body),
    encerrarVencidas: () => post('/totem-kids/sessoes/encerrar-vencidas', {}),
    trocarPeriodo: (cultoIds) => post('/totem-kids/sessoes/trocar-periodo', { culto_ids: cultoIds }),
  },
  criancas: {
    buscar: (q) => get(`/totem-kids/criancas/buscar?q=${encodeURIComponent(q)}`),
    get: (id) => get(`/totem-kids/criancas/${id}`),
    irmaos: (id) => get(`/totem-kids/criancas/${id}/irmaos`),
    uploadFoto: (id, dataUrl) => post(`/totem-kids/criancas/${id}/foto`, { dataUrl }),
    removeFoto: (id) => del(`/totem-kids/criancas/${id}/foto`),
    uploadFotoResponsavel: (membroId, dataUrl) => post(`/totem-kids/responsaveis/${membroId}/foto`, { dataUrl }),
    duplicados: () => get('/totem-kids/criancas/duplicados'),
    merge: (keep_id, merge_ids) => post('/totem-kids/criancas/merge', { keep_id, merge_ids }),
    list: (params = {}) => {
      const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
      return get(`/totem-kids/criancas${qs ? `?${qs}` : ''}`);
    },
    create: (data) => post('/totem-kids/criancas', data),
    update: (id, data) => patch(`/totem-kids/criancas/${id}`, data),

    updateResponsavelMembro: (membroId, data) => patch(`/totem-kids/membro/${membroId}`, data),
    updateResponsavelVinculo: (criancaId, membroId, data) => patch(`/totem-kids/criancas/${criancaId}/responsaveis/${membroId}`, data),
    removeResponsavelVinculo: (criancaId, membroId) => del(`/totem-kids/criancas/${criancaId}/responsaveis/${membroId}`),
    historico: (id) => get(`/totem-kids/historico/crianca/${id}`),
    addResponsavel: (id, data) => post(`/totem-kids/criancas/${id}/responsaveis`, data),
    addResponsavelRapido: (id, data) => post(`/totem-kids/criancas/${id}/responsavel-rapido`, data),
    removeResponsavel: (responsavelId) => del(`/totem-kids/responsaveis/${responsavelId}`),
    inativar: (id, body) => patch(`/totem-kids/criancas/${id}/inativar`, body),
    tornarFrequentador: (id) => post(`/totem-kids/criancas/${id}/tornar-frequentador`, {}),

    aniversarioImpressoes: (id) => get(`/totem-kids/criancas/${id}/aniversario-impressoes`),

    responsavelFamilia: (cpf) => get(`/totem-kids/responsavel-familia?cpf=${encodeURIComponent(cpf)}`),

    familiaRevisar: (data) => post('/totem-kids/familia-revisar', data),
    jornada: (id) => get(`/totem-kids/criancas/${id}/jornada`),
    analiseFrequencia: (id) => get(`/totem-kids/criancas/${id}/analise-frequencia`),

    atendimentos: (id) => get(`/totem-kids/criancas/${id}/atendimentos`),
    addAtendimento: (id, data) => post(`/totem-kids/criancas/${id}/atendimentos`, data),
    removeAtendimento: (atendimentoId) => del(`/totem-kids/atendimentos/${atendimentoId}`),

    importar: (file, { dryRun = false } = {}) => {
      const fd = new FormData();
      fd.append('arquivo', file);
      return requestFile(`/totem-kids/criancas/importar${dryRun ? '?dry_run=1' : ''}`, fd);
    },

    modeloImportacaoUrl: () => `${API}/totem-kids/criancas/modelo-importacao`,
  },
  checkin: {
    criar: (data) => post('/totem-kids/checkin', data),




    reservarCodigos: (data) => post('/totem-kids/codigos-reservados', data),

    lote: (data) => post('/totem-kids/checkin/lote', data),

    aberto: (sessaoId, criancaId) => get(`/totem-kids/checkin/aberto?sessao_id=${encodeURIComponent(sessaoId)}&crianca_id=${encodeURIComponent(criancaId)}`),
    porCodigo: (codigo) => get(`/totem-kids/checkin/codigo/${encodeURIComponent(codigo)}`),

    abertosBuscar: ({ nome, pager } = {}) => get(`/totem-kids/checkins-abertos/buscar?${pager ? `pager=${encodeURIComponent(pager)}` : `nome=${encodeURIComponent(nome || '')}`}`),
    atualizar: (id, data) => patch(`/totem-kids/checkin/${id}`, data),


    setPager: (id, pager_numero) => patch(`/totem-kids/checkin/${id}/pager`, { pager_numero }),

    pagerDevolvido: (id, devolvido = true) => patch(`/totem-kids/checkin/${id}/pager-devolvido`, { devolvido }),
  },
  cultosDoDia: (data) => get(`/totem-kids/cultos-do-dia?data=${encodeURIComponent(data)}`),


  semCheckin: (limit) => get('/totem-kids/sem-checkin' + (limit ? `?limit=${limit}` : '')),
  ausentes: (min = 3) => get(`/totem-kids/ausentes?min=${min}`),
  aniversariantesMes: (mes) => get(`/totem-kids/aniversariantes?mes=${mes}`),
  ausenteContatar: (criancaId) => post(`/totem-kids/ausentes/${criancaId}/contato`, {}),
  ausenteDescontatar: (criancaId, desde) => del(`/totem-kids/ausentes/${criancaId}/contato` + (desde ? `?desde=${desde}` : '')),

  pagersEmUso: () => get('/totem-kids/pagers-em-uso'),

  pagersConferencia: ({ culto_id, data } = {}) => get(`/totem-kids/pagers/conferencia${culto_id ? `?culto_id=${encodeURIComponent(culto_id)}` : (data ? `?data=${encodeURIComponent(data)}` : '')}`),

  pagersCultos: () => get('/totem-kids/pagers/cultos'),

  preCheckin: {
    buscarCodigo: (codigo) => get(`/totem-kids/pre-checkin/codigo/${encodeURIComponent(codigo)}`),
    consumir: (id, data) => post(`/totem-kids/pre-checkin/${id}/consumir`, data),
  },

  editSenha: {
    status: () => get('/totem-kids/edit-senha/status'),
    definir: (senha) => post('/totem-kids/edit-senha', { senha }),
    verificar: (senha) => post('/totem-kids/edit-senha/verificar', { senha }),
  },

  vinculos: {
    list: (status = 'pendente') => get(`/totem-kids/vinculo-solicitacoes?status=${encodeURIComponent(status)}`),
    get: (id) => get(`/totem-kids/vinculo-solicitacoes/${id}`),
    aprovar: (id, criancaId) => post(`/totem-kids/vinculo-solicitacoes/${id}/aprovar`, criancaId ? { crianca_id: criancaId } : {}),
    rejeitar: (id, motivo) => post(`/totem-kids/vinculo-solicitacoes/${id}/rejeitar`, { motivo }),
  },
  checkout: {
    realizar: (data) => post('/totem-kids/checkout', data),

    desfazer: (checkinId) => post(`/totem-kids/checkin/${checkinId}/reabrir`, {}),
  },
  painel: {
    aoVivo: (sessaoId) => get(`/totem-kids/painel/ao-vivo${sessaoId ? `?sessao_id=${sessaoId}` : ''}`),
    sala: (salaId, sessaoId) => get(`/totem-kids/painel/sala/${salaId}${sessaoId ? `?sessao_id=${sessaoId}` : ''}`),
    dia: (data) => get(`/totem-kids/painel/dia${data ? `?data=${encodeURIComponent(data)}` : ''}`),
    checkoutTodos: () => post('/totem-kids/painel/checkout-todos', {}),
  },
  decisoes: {

    presentesNaSessao: (sessaoId) => get(`/totem-kids/sessoes/${sessaoId}/criancas-presentes`),

    historicoCrianca: (criancaId) => get(`/totem-kids/decisoes/historico/${criancaId}`),

    resumoPorCrianca: () => get('/totem-kids/decisoes/resumo-por-crianca'),



    registro: (p = {}) => {
      const q = new URLSearchParams();
      if (p.dias) q.set('dias', String(p.dias));
      if (p.ano) q.set('ano', String(p.ano));
      const s = q.toString();
      return get(`/totem-kids/decisoes/registro${s ? `?${s}` : ''}`);
    },



    buscar: (q) => get(`/totem-kids/decisoes/buscar?q=${encodeURIComponent(q || '')}`),
    candidatos: (id) => get(`/totem-kids/decisoes/fila/${id}/candidatos`),
    resolver: (id, body) => patch(`/totem-kids/decisoes/fila/${id}`, body),
  },
  salas: {
    list: () => get('/totem-kids/salas'),
    create: (data) => post('/totem-kids/salas', data),
    update: (id, data) => patch(`/totem-kids/salas/${id}`, data),
    remove: (id) => del(`/totem-kids/salas/${id}`),
    uploadLogo: (id, dataUrl) => post(`/totem-kids/salas/${id}/logo`, { dataUrl }),
    removerLogo: (id) => post(`/totem-kids/salas/${id}/logo/remover`, {}),
  },
  etiquetaConfig: {
    get: () => get('/totem-kids/etiqueta-config'),
    save: (data) => put('/totem-kids/etiqueta-config', data),
    uploadLogoAniversario: (dataUrl) => post('/totem-kids/etiqueta-config/logo', { dataUrl }),
    removerLogoAniversario: () => post('/totem-kids/etiqueta-config/logo/remover', {}),
  },
  etiquetas: {
    log: (data) => post('/totem-kids/etiquetas-log', data),

    logLote: (eventos) => post('/totem-kids/etiquetas-log', { eventos }),
  },
  auditoria: {
    overrides: () => get('/totem-kids/auditoria/overrides'),
  },


  portao: {
    scan: (codigo) => post('/totem-kids/portao/scan', { codigo }),
    scans: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return get(`/totem-kids/portao/scans${q ? `?${q}` : ''}`);
    },
  },
};




export const ataSemanal = {
  colaboradores: () => get('/ata-semanal/colaboradores'),
  reunioes:      () => get('/ata-semanal/reunioes'),
  reuniao:       (id) => get(`/ata-semanal/reunioes/${id}`),
  salvarTarefa:  (id, data) => patch(`/ata-semanal/tarefas/${id}`, data),
  enviarParaMinhasTarefas: (id) => post(`/ata-semanal/tarefas/${id}/enviar`, {}),
};

export const permissoes = {
  bustCache: () => post('/permissoes/cache/bust', {}),
  estrutura: () => get('/permissoes/estrutura'),
  colaboradores: () => get('/permissoes/colaboradores'),
  matriz: () => get('/permissoes/matriz'),
  setCelula: (data) => put('/permissoes/matriz/celula', data),
  cargo: (id) => get(`/permissoes/cargo/${id}`),
  usuario: (id) => get(`/permissoes/usuario/${id}`),
  usuarioPorEmail: (email) => get(`/permissoes/usuario-por-email/${encodeURIComponent(email)}`),
  criarUsuario: (data) => post('/permissoes/usuario', data),

  criarLogin: (data) => post('/permissoes/criar-login', data),
  setEmail: (id, email) => put(`/permissoes/usuario/${id}/email`, { email }),
  setCargo: (id, cargo_id) => put(`/permissoes/usuario/${id}/cargo`, { cargo_id }),
  setRole: (id, role) => put(`/permissoes/usuario/${id}/role`, { role }),
  setAreas: (id, area_ids) => put(`/permissoes/usuario/${id}/areas`, { area_ids }),
  setModulo: (id, data) => put(`/permissoes/usuario/${id}/modulo`, data),
  removerOverride: (id, moduloId) => del(`/permissoes/usuario/${id}/modulo/${moduloId}`),
};

export const marketing = {

  etiquetas:    () => get('/marketing/etiquetas'),
  membros:      () => get('/marketing/membros'),
  recorrentes:  () => get('/marketing/compromissos-recorrentes'),
  generosidade: (ano) => get(`/marketing/generosidade?ano=${encodeURIComponent(ano)}`),




  resultadoCampanhas: () => get('/marketing/resultado-campanhas'),


  cards:        (params) => get('/marketing/cards' + (params ? '?' + new URLSearchParams(params) : '')),
  card:         (id) => get(`/marketing/cards/${id}`),
  criarCard:    (data) => post('/marketing/cards', data),
  atualizarCard:(id, data) => patch(`/marketing/cards/${id}`, data),
  removerCard:  (id) => del(`/marketing/cards/${id}`),


  sugerirRevisao:  (id, motivo) => patch(`/marketing/cards/${id}/sugerir-revisao`, { motivo }),
  aprovarEntrega:  (id) => patch(`/marketing/cards/${id}/aprovar-entrega`, {}),


  entregaveis: {
    list:     (cardId) => get(`/marketing/cards/${cardId}/entregaveis`),
    upload:   (cardId, file, tipo) => {
      const fd = new FormData();
      fd.append('arquivo', file);
      if (tipo) fd.append('tipo', tipo);
      return requestFile(`/marketing/cards/${cardId}/entregaveis`, fd, { timeoutMs: 120_000 });
    },
    download: (entregavelId) => `${API}/marketing/entregaveis/${entregavelId}/download`,
    remove:   (entregavelId) => del(`/marketing/entregaveis/${entregavelId}`),
  },


  checklist: {
    list:   (cardId) => get(`/marketing/cards/${cardId}/checklist`),
    create: (cardId, data) => post(`/marketing/cards/${cardId}/checklist`, data),
    update: (itemId, data) => patch(`/marketing/checklist/${itemId}`, data),
    remove: (itemId) => del(`/marketing/checklist/${itemId}`),
  },


  analytics: {
    kpis:              (semanas = 12) => get(`/marketing/analytics/kpis?semanas=${semanas}`),
    aprovacoesOrigem:  (dias = 90) => get(`/marketing/analytics/aprovacoes-origem?dias=${dias}`),
  },



  painel: () => get('/marketing/painel'),


  fila: {
    posicao:   (cardId) => get(`/marketing/fila/posicao/${cardId}`),
  },



  kanban: (params) => get('/marketing/kanban' + (params ? '?' + new URLSearchParams(params) : '')),


  dashboard: {
    get: (params) => get('/marketing/dashboard' + (params ? '?' + new URLSearchParams(params) : '')),
    fase: (faseId) => get(`/marketing/dashboard/fase/${faseId}`),
  },




  avisosInicio: {
    list:      () => get('/marketing/avisos-inicio'),
    criar:     (data) => post('/marketing/avisos-inicio', data),
    atualizar: (id, data) => patch(`/marketing/avisos-inicio/${id}`, data),
    remover:   (id) => del(`/marketing/avisos-inicio/${id}`),
  },


  ciclo: {
    list:  () => get('/marketing/ciclo-criativo'),
    batch: (cardIds, payload) => patch('/marketing/ciclo-criativo/batch', { card_ids: cardIds, ...payload }),
  },


  campanhas: {
    list:      (status) => get('/marketing/campanhas' + (status ? '?status=' + encodeURIComponent(status) : '')),
    get:       (id) => get(`/marketing/campanhas/${id}`),
    update:    (id, data) => patch(`/marketing/campanhas/${id}`, data),
    remove:    (id) => del(`/marketing/campanhas/${id}`),
    criarCard: (id, data) => post(`/marketing/campanhas/${id}/cards`, data),
    aprovar:   (id) => post(`/marketing/campanhas/${id}/aprovar`, {}),
    revisar:   (id, motivo) => post(`/marketing/campanhas/${id}/revisar`, { motivo }),
  },





  capacidadeDia: (membroId, inicio, fimOuOpts) => {
    const q = new URLSearchParams({ membro_id: membroId, inicio });
    if (typeof fimOuOpts === 'string') q.set('fim', fimOuOpts);
    else if (fimOuOpts?.ocupa_dias != null) q.set('ocupa_dias', String(fimOuOpts.ocupa_dias));
    return get(`/marketing/capacidade-dia?${q}`);
  },


  admin: {
    membros: {
      list:   () => get('/marketing/admin/membros'),
      create: (data) => post('/marketing/admin/membros', data),
      update: (id, data) => patch(`/marketing/admin/membros/${id}`, data),
      remove: (id) => del(`/marketing/admin/membros/${id}`),
    },
    etiquetasTipo: {
      list:   () => get('/marketing/admin/etiquetas/tipo'),
      create: (data) => post('/marketing/admin/etiquetas/tipo', data),
      update: (id, data) => patch(`/marketing/admin/etiquetas/tipo/${id}`, data),
    },
    etiquetasDestino: {
      list:   () => get('/marketing/admin/etiquetas/destino'),
      create: (data) => post('/marketing/admin/etiquetas/destino', data),
      update: (id, data) => patch(`/marketing/admin/etiquetas/destino/${id}`, data),
    },
    recorrentes: {
      list:   () => get('/marketing/admin/recorrentes'),
      create: (data) => post('/marketing/admin/recorrentes', data),
      update: (id, data) => patch(`/marketing/admin/recorrentes/${id}`, data),
      remove: (id) => del(`/marketing/admin/recorrentes/${id}`),
    },
    overrides: {
      list:   (params) => get('/marketing/admin/overrides' + (params ? '?' + new URLSearchParams(params) : '')),
      create: (data) => post('/marketing/admin/overrides', data),
      update: (id, data) => patch(`/marketing/admin/overrides/${id}`, data),
      remove: (id) => del(`/marketing/admin/overrides/${id}`),
    },

    cicloPadroes: {
      list:       () => get('/marketing/admin/ciclo-padroes'),
      categorias: () => get('/marketing/admin/ciclo-padroes/categorias'),
      fases:      (categoryId) => get('/marketing/admin/ciclo-padroes/fases?category_id=' + encodeURIComponent(categoryId)),
      create:     (data) => post('/marketing/admin/ciclo-padroes', data),
      update:     (id, data) => patch(`/marketing/admin/ciclo-padroes/${id}`, data),
      remove:     (id) => del(`/marketing/admin/ciclo-padroes/${id}`),
      aplicar:    (categoryId) => post('/marketing/admin/ciclo-padroes/aplicar', categoryId ? { category_id: categoryId } : {}),
    },

    cicloItens: {
      list:   (categoryId) => get('/marketing/admin/ciclo-itens' + (categoryId ? '?category_id=' + encodeURIComponent(categoryId) : '')),
      create: (data) => post('/marketing/admin/ciclo-itens', data),
      update: (id, data) => patch(`/marketing/admin/ciclo-itens/${id}`, data),
      remove: (id) => del(`/marketing/admin/ciclo-itens/${id}`),
    },
  },
};



export const marketingLinha = {

  get: (ano, verComo) => {
    const qs = new URLSearchParams();
    if (ano) qs.set('ano', ano);
    if (verComo) qs.set('ver_como', verComo);
    const s = qs.toString();
    return get(`/marketing/linha${s ? `?${s}` : ''}`);
  },
  marcarRotina: (compromissoId, semanaInicio, membroId) =>
    put(`/marketing/linha/rotina/${encodeURIComponent(compromissoId)}/${encodeURIComponent(semanaInicio)}`, { membro_id: membroId }),
  desmarcarRotina: (compromissoId, semanaInicio, membroId) =>
    del(`/marketing/linha/rotina/${encodeURIComponent(compromissoId)}/${encodeURIComponent(semanaInicio)}?membro_id=${encodeURIComponent(membroId)}`),



  solicitacao: (id) => get(`/marketing/linha/solicitacoes/${encodeURIComponent(id)}`),
  acaoSolicitacao: (id, body) => post(`/marketing/linha/solicitacoes/${encodeURIComponent(id)}/acao`, body),

  alocar: (campanhaId, body) => post(`/marketing/linha/pendentes/${encodeURIComponent(campanhaId)}/alocar`, body),
  criarTarefa: (body) => post('/marketing/linha/tarefas', body),
  editarTarefa: (id, body) => patch(`/marketing/linha/tarefas/${encodeURIComponent(id)}`, body),





  entregas: {
    sessao: (alvo, arquivo) => post('/marketing/linha/entregas/sessao', { alvo, nome_arquivo: arquivo.name, tamanho_bytes: arquivo.size }),
    registrar: (alvo, enviado) => post('/marketing/linha/entregas', { alvo, ...enviado }),
    remover: (id) => del(`/marketing/linha/entregas/${encodeURIComponent(id)}`),
  },



  planos: {
    get: (mes) => get(`/marketing/linha/redes/planos/${encodeURIComponent(mes)}`),
    salvar: (mes, body) => put(`/marketing/linha/redes/planos/${encodeURIComponent(mes)}`, body),
    refSessao: (mes, arquivo) => post(`/marketing/linha/redes/planos/${encodeURIComponent(mes)}/ref/sessao`, { nome_arquivo: arquivo.name, tamanho_bytes: arquivo.size }),
  },
};



export const marketingArquivos = {

  listar: ({ ano, evento } = {}) => {
    const qs = new URLSearchParams();
    if (ano) qs.set('ano', ano);
    if (evento) qs.set('evento', evento);
    const s = qs.toString();
    return get(`/marketing/arquivos${s ? `?${s}` : ''}`);
  },
  baixar: (id) => get(`/marketing/arquivos/${encodeURIComponent(id)}/baixar`),


  criarEstrutura: (ano, desde = 0) => post('/marketing/arquivos/estrutura', { ano, desde }),
};

export const solicitacoes = {
  list:           (params) => get('/solicitacoes' + (params ? '?' + new URLSearchParams(params) : '')),
  create:         (data) => post('/solicitacoes', data),
  update:         (id, data) => patch(`/solicitacoes/${id}`, data),
  meuPapel:       () => get('/solicitacoes/meu-papel'),
  slaDefs:        () => get('/solicitacoes/sla-defs'),
  reservasEspaco: (params) => get('/solicitacoes/reservas-espaco' + (params ? '?' + new URLSearchParams(params) : '')),
  alcadas:        () => get('/solicitacoes/alcadas'),
  aprovarOrigem:  (id) => patch(`/solicitacoes/${id}/aprovar-origem`, {}),
  rejeitarOrigem: (id, motivo) => patch(`/solicitacoes/${id}/rejeitar-origem`, { motivo }),

  aprovarMerito:  (id) => post(`/solicitacoes/${id}/aprovar-merito`, {}),
  reprovarMerito: (id, motivo) => post(`/solicitacoes/${id}/reprovar-merito`, { motivo }),
  sobrestar:      (id, { motivo, revisao } = {}) => post(`/solicitacoes/${id}/sobrestar`, { motivo, revisao }),
  retomar:        (id) => post(`/solicitacoes/${id}/retomar`, {}),

  registrarCotacao: (id, payload) => post(`/solicitacoes/${id}/registrar-cotacao`, payload),



  aprovarNaAlcada: (id, { observacao, forma_pagamento } = {}) =>
    post(`/solicitacoes/${id}/aprovar-financeiro`, { observacao, forma_pagamento }),

  listarCotacoes:   (id) => get(`/solicitacoes/${id}/cotacoes`),
  adicionarCotacao: (id, payload) => post(`/solicitacoes/${id}/cotacoes`, payload),
  editarCotacao:    (cotacaoId, payload) => patch(`/solicitacoes/cotacoes/${cotacaoId}`, payload),
  removerCotacao:   (cotacaoId) => del(`/solicitacoes/cotacoes/${cotacaoId}`),
  sugerirCotacao:   (id, cotacaoId) => post(`/solicitacoes/${id}/cotacoes/${cotacaoId}/sugerir`, {}),
  enviarCotacoesFinanceiro: (id, payload) => post(`/solicitacoes/${id}/enviar-cotacoes-financeiro`, payload || {}),
  classificacaoAux: (area) => get(`/solicitacoes/aux/classificacao${area ? `?area=${encodeURIComponent(area)}` : ''}`),
  converterEmCompra: (id, payload) => post(`/solicitacoes/${id}/converter-em-compra`, payload),
  lancarFinanceiro: (id, payload) => post(`/solicitacoes/${id}/lancar-financeiro`, payload || {}),
  escanearNotaFiscal: (id, file) => { const fd = new FormData(); fd.append('arquivo', file); return requestFile(`/solicitacoes/${id}/nota-fiscal/escanear`, fd, { timeoutMs: 120_000 }); },

  aPagar: () => get('/solicitacoes/a-pagar'),
  concluirPagamento: (id, { forma, data, valor, observacao, arquivo } = {}) => {
    const fd = new FormData();
    fd.append('forma', forma || '');
    if (data) fd.append('data', data);
    if (valor !== undefined && valor !== null && valor !== '') fd.append('valor', String(valor));
    if (observacao) fd.append('observacao', observacao);
    if (arquivo) fd.append('arquivo', arquivo);
    return requestFile(`/solicitacoes/${id}/concluir-pagamento`, fd, { timeoutMs: 120_000 });
  },
  comprovantePagamento: (id) => get(`/solicitacoes/${id}/comprovante-pagamento`),
  areaResponsaveis: {
    list:    () => get('/solicitacoes/area-responsaveis'),
    save:    (area, profile_ids) => put('/solicitacoes/area-responsaveis', { area, profile_ids }),
  },
  fluxos: {
    list:      () => get('/solicitacoes/fluxos'),
    get:       (categoria) => get(`/solicitacoes/fluxos/${categoria}`),
    andamento: (categoria) => get(`/solicitacoes/fluxos/${categoria}/andamento`),
    setEtapaResponsaveis: (etapaId, profile_ids) => put(`/solicitacoes/fluxos/etapas/${etapaId}/responsaveis`, { profile_ids }),
    criarEtapa:     (categoria, payload) => post(`/solicitacoes/fluxos/${categoria}/etapas`, payload),
    editarEtapa:    (etapaId, body) => patch(`/solicitacoes/fluxos/etapas/${etapaId}`, body),
    removerEtapa:   (etapaId) => del(`/solicitacoes/fluxos/etapas/${etapaId}`),
    criarTransicao: (payload) => post('/solicitacoes/fluxos/transicoes', payload),
    removerTransicao: (id) => del(`/solicitacoes/fluxos/transicoes/${id}`),
  },




  vinculaveisML: () => get('/solicitacoes/vinculaveis-ml'),
  vincularML:   (id, mlInput) => post(`/solicitacoes/${id}/vincular-ml`, { ml_input: mlInput }),
  desvincularML: (id) => del(`/solicitacoes/${id}/vincular-ml`),
  atualizarML:  (id) => post(`/solicitacoes/${id}/atualizar-ml`, {}),
  mlTimeline:   (id) => get(`/solicitacoes/${id}/ml-timeline`),

  timeline:        (id) => get(`/solicitacoes/${id}/timeline`),
  minhasAprovacoes: (params) => get('/solicitacoes/minhas-aprovacoes' + (params ? '?' + new URLSearchParams(params) : '')),
  relatarProblema: (id, motivo, comentario) => post(`/solicitacoes/${id}/relatar-problema`, { motivo, comentario }),
  reenviar:        (id, campos) => post(`/solicitacoes/${id}/reenviar`, campos || {}),

  editar:          (id, campos) => patch(`/solicitacoes/${id}/editar`, campos || {}),

  retirarAjuste:   (id, comentario) => post(`/solicitacoes/${id}/retirar-ajuste`, { comentario }),

  corrigir: (id, { campos, motivo, esperado, arquivo } = {}) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos || {})) fd.append(k, v ?? '');
    fd.append('motivo', motivo || '');
    if (esperado) fd.append('esperado', esperado);
    if (arquivo) fd.append('arquivo', arquivo);
    return requestFile(`/solicitacoes/${id}/corrigir`, fd, { timeoutMs: 120_000 });
  },
  diagnosticoRefeitas: (dias = 90) => get(`/solicitacoes/dashboard/refeitas?dias=${dias}`),

  estoqueProdutos: (busca) => get('/solicitacoes/estoque/produtos' + (busca ? '?busca=' + encodeURIComponent(busca) : '')),
  atenderEstoque: (id, itens, observacao) => post(`/solicitacoes/${id}/atender-estoque`, { itens, observacao }),
};

export const producao = {
  serviceTypes: () => get('/producao/service-types'),
  salvarMetaTipo: (id, meta_duracao_min) => patch(`/producao/service-types/${id}/meta`, { meta_duracao_min }),
  semana:       (inicio, fim) => get(`/producao/semana?inicio=${inicio}&fim=${fim}`),
  culto:        (id) => get(`/producao/culto/${id}`),
  salvarCulto:  (id, data) => put(`/producao/culto/${id}`, data),
  salvarEtapas: (cultoId, etapas) => put(`/producao/culto/${cultoId}/etapas`, { etapas }),
  addOcorrencia:(id, data) => post(`/producao/culto/${id}/ocorrencias`, data),
  removerOcorrencia: (id) => del(`/producao/ocorrencias/${id}`),
  vincularSolicitacao: (ocorrenciaId, solicitacaoId) => patch(`/producao/ocorrencias/${ocorrenciaId}/solicitacao`, { solicitacao_id: solicitacaoId }),
  salvarChecklist: (cultoId, marks) => put(`/producao/culto/${cultoId}/checklist`, { marks }),
  acumulado:    (params = {}) => get('/producao/acumulado' + (Object.keys(params).length ? '?' + new URLSearchParams(params) : '')),
  pendencias:   () => get('/producao/pendencias'),
  desempenho:   () => get('/producao/desempenho'),

  checklistItens: {
    list:   () => get('/producao/checklist-itens'),
    create: (data) => post('/producao/checklist-itens', data),
    update: (id, data) => patch(`/producao/checklist-itens/${id}`, data),
    remove: (id) => del(`/producao/checklist-itens/${id}`),
  },

  roteiroEtapas: {
    list:   () => get('/producao/roteiro-etapas'),
    create: (data) => post('/producao/roteiro-etapas', data),
    update: (id, data) => patch(`/producao/roteiro-etapas/${id}`, data),
    remove: (id) => del(`/producao/roteiro-etapas/${id}`),
  },
};





export const nextBatismo = {
  resumo: () => get('/entradas/resumo'),
  duplicados: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return get('/entradas/duplicados' + (qs ? '?' + qs : ''));
  },
  semVinculo: () => get('/entradas/sem-vinculo'),
  familiasPendentes: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return get('/entradas/familias-pendentes' + (qs ? '?' + qs : ''));
  },
  vincularFamilia: (data) => post('/entradas/vincular-familia', data),
  ignorarFamilia: (data) => post('/entradas/ignorar-familia', data),
  candidatos: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return get('/entradas/candidatos' + (qs ? '?' + qs : ''));
  },
  ligar: (data) => post('/entradas/ligar', data),
  ignorarDuplicata: (data) => post('/entradas/ignorar-duplicata', data),
  adiarDuplicata: (data) => post('/entradas/adiar-duplicata', data),
  reativarDuplicata: (data) => post('/entradas/reativar-duplicata', data),
  adiarEmLote: (data = { criterio: 'nome_apenas' }) => post('/entradas/adiar-em-lote', data),
  duplicadosAdiados: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return get('/entradas/duplicados/adiados' + (qs ? '?' + qs : ''));
  },
  fundir: (data) => post('/entradas/fundir', data),


  vizinhosDoPar: (ids) => get('/entradas/duplicados/vizinhos?ids=' + encodeURIComponent(ids.join(','))),
  resolucoes: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return get('/entradas/resolucoes' + (qs ? '?' + qs : ''));
  },
  pessoa: (id) => get('/entradas/pessoa/' + encodeURIComponent(id)),


  pedirDados: (id) => post('/entradas/pessoa/' + encodeURIComponent(id) + '/pedir-dados', {}),
};

export const membresia = {
  kpis: () => get('/membresia/kpis'),




  perfil: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
    ).toString();
    return get('/membresia/perfil' + (qs ? '?' + qs : ''));
  },
  perfilBairros: () => get('/membresia/perfil/bairros'),
  perfilGeocode: (limite) => post('/membresia/perfil/bairros/geocode', { limite }),
  perfilBairroPatch: (norm, campos) =>
    patch(`/membresia/perfil/bairros/${encodeURIComponent(norm)}`, campos),
  perfilCeps: () => get('/membresia/perfil/ceps'),
  perfilCepsGeocode: (limite) => post('/membresia/perfil/ceps/geocode', { limite }),
  qrLookup: (token) => get(`/membresia/qr-lookup/${encodeURIComponent(token)}`),
  cpfLookup: (cpf, nascimento) => get(`/membresia/cpf-lookup/${encodeURIComponent(String(cpf).replace(/\D/g, ''))}?nascimento=${encodeURIComponent(nascimento || '')}`),
  orfaosStats: () => get('/membresia/orfaos-stats'),


  exclusoes: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return get('/membresia/exclusoes' + (qs ? '?' + qs : ''));
  },
  promoverOrfaos: () => post('/membresia/promover-orfaos', {}),

  identidade: {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return get('/membresia/identidade-pendencias' + (qs ? '?' + qs : ''));
    },
    confirmarCpf: (id) => post(`/membresia/identidade-pendencias/${id}/confirmar-cpf`, {}),
    ligarInscricao: (id) => post(`/membresia/identidade-pendencias/${id}/ligar-inscricao`, {}),
    ligarLote: (ids) => post('/membresia/identidade-pendencias/ligar-lote', { ids }),
    setStatus: (id, status) => post(`/membresia/identidade-pendencias/${id}/status`, { status }),
  },

  duplicados: {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return get('/membresia/duplicados' + (qs ? '?' + qs : ''));
    },
    ignorar: (data) => post('/membresia/duplicados/ignorar', data),
    merge: (data) => post('/membresia/membros/merge', data),
    doMembro: (id) => get(`/membresia/membros/${id}/possiveis-duplicados`),
    log: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return get('/membresia/merge-log' + (qs ? '?' + qs : ''));
    },
  },
  membros: {
    list: (params) => get('/membresia/membros' + (params ? '?' + new URLSearchParams(params) : '')),
    get: (id, opts) => get(`/membresia/membros/${id}` + (opts?.escopo ? `?escopo=${encodeURIComponent(opts.escopo)}` : '')),
    timeline: (id) => get(`/membresia/membros/${id}/timeline`),



    censo: (id) => get(`/membresia/membros/${id}/censo`),
    inscricoes: (id) => get(`/membresia/membros/${id}/inscricoes`),
    create: (data) => post('/membresia/membros', data),
    update: (id, data) => put(`/membresia/membros/${id}`, data),
    remove: (id) => del(`/membresia/membros/${id}`),


    desativar: (id, motivo) => post(`/membresia/membros/${id}/desativar`, { motivo: motivo || null }),
    reativar: (id, status) => post(`/membresia/membros/${id}/reativar`, status ? { status } : {}),
    uploadFoto: (id, formData) => requestFile(`/membresia/membros/${id}/foto`, formData),
    wifi: (id) => get(`/membresia/membros/${id}/wifi`),
    reconhecimentoFacial: (id) => get(`/membresia/membros/${id}/reconhecimento-facial`),
  },
  trilha: {
    create: (data) => post('/membresia/trilha', data),
    update: (id, data) => patch(`/membresia/trilha/${id}`, data),
  },
  familias: {
    list: (params) => get('/membresia/familias' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/membresia/familias', data),
    update: (id, data) => put(`/membresia/familias/${id}`, data),
    remove: (id) => del(`/membresia/familias/${id}`),
    vincular: (membroId, data) => patch(`/membresia/membros/${membroId}/familia`, data),
    mesmaFamilia: (membroId, data) => post(`/membresia/membros/${membroId}/mesma-familia`, data),
  },
  vinculos: {
    list: (membroId) => get(`/membresia/membros/${membroId}/vinculos`),
    create: (membroId, data) => post(`/membresia/membros/${membroId}/vinculos`, data),
    remove: (id) => del(`/membresia/vinculos/${id}`),
  },
  historico: {
    create: (data) => post('/membresia/historico', data),
  },
  grupos: {
    list: (params) => get('/membresia/grupos' + (params ? '?' + new URLSearchParams(params) : '')),
    get: (id) => get(`/membresia/grupos/${id}`),
    create: (data) => post('/membresia/grupos', data),
    update: (id, data) => put(`/membresia/grupos/${id}`, data),
    remove: (id) => del(`/membresia/grupos/${id}`),
    adicionarMembro: (grupoId, data) => post(`/membresia/grupos/${grupoId}/membros`, data),
    sairMembro: (participacaoId, data) => patch(`/membresia/grupo-membros/${participacaoId}/sair`, data),
  },
  totem: {


    pedirGrupo: (grupoId, data) => post(`/membresia/totem/grupos/${grupoId}/entrar`, data),
    batismoHorarios: () => get('/public/batismo/horarios'),
    geocodeCep: (cep) => get(`/membresia/geocode-cep?cep=${encodeURIComponent(cep)}`),
    updateMembro: (id, data) => put(`/membresia/totem/membros/${id}`, data),
    uploadFoto: (id, formData) => requestFile(`/membresia/totem/membros/${id}/foto`, formData),
    next: {
      status: (params = {}) => get('/membresia/totem/next/status?' + new URLSearchParams(params).toString()),
      inscrever: (data) => post('/membresia/totem/next/inscrever', data),
      informacoes: (data) => post('/membresia/totem/next/informacoes', data),
    },
    apresentacaoBebe: {
      status: (params = {}) => get('/membresia/totem/apresentacao-bebe/status?' + new URLSearchParams(params).toString()),
      create: (data) => post('/membresia/totem/apresentacao-bebe', data),
    },


    novoConvertido: {
      contexto: () => get('/membresia/totem/novo-convertido/contexto'),
      registrar: (data) => post('/membresia/totem/novo-convertido', data),
    },
  },
  contribuicoes: {
    list: (params) => get('/membresia/contribuicoes' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/membresia/contribuicoes', data),
    update: (id, data) => put(`/membresia/contribuicoes/${id}`, data),
    remove: (id) => del(`/membresia/contribuicoes/${id}`),
    kpis: () => get('/membresia/contribuicoes/kpis'),
  },
  ministerios: {
    list: (params) => get('/membresia/ministerios' + (params ? '?' + new URLSearchParams(params) : '')),
    get: (id) => get(`/membresia/ministerios/${id}`),
    create: (data) => post('/membresia/ministerios', data),
    update: (id, data) => put(`/membresia/ministerios/${id}`, data),
    remove: (id) => del(`/membresia/ministerios/${id}`),
  },
  voluntarios: {
    create: (data) => post('/membresia/voluntarios', data),
    update: (id, data) => put(`/membresia/voluntarios/${id}`, data),
    sair: (id, motivo) => patch(`/membresia/voluntarios/${id}/sair`, { motivo }),
  },
  escalas: {
    list: (params) => get('/membresia/escalas' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/membresia/escalas', data),
    update: (id, data) => put(`/membresia/escalas/${id}`, data),
    remove: (id) => del(`/membresia/escalas/${id}`),
  },
  checkins: {
    list: (params) => get('/membresia/checkins' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/membresia/checkins', data),
    remove: (id) => del(`/membresia/checkins/${id}`),
  },

  censo: {
    cobertura: (params) => get('/membresia/censo/cobertura' + (params ? '?' + new URLSearchParams(params) : '')),
    faltantes: (params) => get('/membresia/censo/faltantes' + (params ? '?' + new URLSearchParams(params) : '')),

    disparoPreview: (params) => get('/membresia/censo/disparo/preview' + (params ? '?' + new URLSearchParams(params) : '')),





    disparar: (body) => post('/membresia/censo/disparo', body, { timeout: 300000 }),

    disparoResultado: () => get('/membresia/censo/disparo/resultado'),

    disparoPreviewEmail: (nome) => get('/membresia/censo/disparo/preview-email' + (nome ? `?nome=${encodeURIComponent(nome)}` : '')),
  },
  cadastros: {
    list: (params) => get('/membresia/cadastros' + (params ? '?' + new URLSearchParams(params) : '')),
    kpis: () => get('/membresia/cadastros/kpis'),
    podeAprovar: () => get('/membresia/cadastros/pode-aprovar'),
    confirmarWhatsapp: (id) => post(`/membresia/cadastros/${id}/confirmar-whatsapp`, {}),
    aprovar: (id, data) => post(`/membresia/cadastros/${id}/aprovar`, data || {}),









    aprovarLote: (ids) => post('/membresia/cadastros/aprovar-lote', { ids }, { timeout: 90000 }),
    rejeitar: (id, motivo) => post(`/membresia/cadastros/${id}/rejeitar`, { motivo }),
    update: (id, data) => patch(`/membresia/cadastros/${id}`, data),
    remove: (id) => del(`/membresia/cadastros/${id}`),
  },
};





export const familiaPublic = {

  conviteInfo: async (codigo) => {
    const r = await fetch(`${API}/public/familia/convite/${encodeURIComponent(codigo)}`);
    if (!r.ok) return { status: r.status === 404 ? 'inexistente' : 'erro' };
    return r.json();
  },
};





function erroPublicoGrupos(r) {
  const e = new Error(r.status === 429
    ? 'Muitos acessos ao mesmo tempo. Aguarde alguns segundos e toque em tentar de novo.'
    : 'Nao conseguimos carregar os grupos agora. Verifique a conexao e tente de novo.');
  e.status = r.status;
  return e;
}

export const gruposPublic = {
  temporadas: async () => {
    const r = await fetch(`${API}/public/grupos/temporadas`);
    if (!r.ok) throw erroPublicoGrupos(r);
    return r.json();
  },
  buscar: async (params) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    const r = await fetch(`${API}/public/grupos/buscar${qs}`);
    if (!r.ok) throw erroPublicoGrupos(r);
    return r.json();
  },
  getById: async (id) => {
    const r = await fetch(`${API}/public/grupos/${id}`);
    if (!r.ok) return null;
    return r.json();
  },
  buscarLideres: async (params) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    const r = await fetch(`${API}/public/grupos/lideres/buscar${qs}`);
    if (!r.ok) return [];
    return r.json();
  },
  gruposDoLider: async (liderId, params) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    const r = await fetch(`${API}/public/grupos/lideres/${liderId}/grupos${qs}`);
    if (!r.ok) return [];
    return r.json();
  },
  inscreverLider: async (data) => {
    const r = await fetch(`${API}/public/grupos/inscrever-lider`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const error = new Error(j.error || `HTTP ${r.status}`);
      Object.assign(error, j);
      throw error;
    }
    return j;
  },
  inscrever: async (data) => {
    const r = await fetch(`${API}/public/grupos/inscrever`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {


      const error = new Error(j.error || `HTTP ${r.status}`);
      Object.assign(error, j);
      error.status = r.status;
      throw error;
    }
    return j;
  },
  uploadFoto: async (file) => {
    const fd = new FormData();
    fd.append('foto', file);
    const r = await fetch(`${API}/public/grupos/upload-foto`, { method: 'POST', body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Erro ao enviar foto');
    return j;
  },

  pedidoPorToken: async (token) => {
    const r = await fetch(`${API}/public/grupos/pedido/por-token?token=${encodeURIComponent(token)}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Erro ao carregar pedido');
    return j;
  },
  aprovarPorToken: async (token, acao, motivo) => {
    const r = await fetch(`${API}/public/grupos/aprovar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, acao, motivo }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Erro ao registrar decisão');
    return j;
  },

  sugestaoPorToken: async (token) => {
    const r = await fetch(`${API}/public/grupos/pedido/sugestao?token=${encodeURIComponent(token)}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Erro ao carregar sugestão');
    return j;
  },
  aceitarSugestao: async (token) => {
    const r = await fetch(`${API}/public/grupos/sugestao/aceitar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Erro ao confirmar');
    return j;
  },

  frequenciaPorToken: async (token) => {
    const r = await fetch(`${API}/public/grupos/grupo/frequencia?token=${encodeURIComponent(token)}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Erro ao carregar a chamada');
    return j;
  },
  salvarFrequencia: async (token, presentes) => {
    const r = await fetch(`${API}/public/grupos/grupo/frequencia`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, presentes }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Erro ao salvar a frequência');
    return j;
  },
  adicionarVisitanteFrequencia: async (token, { nome, telefone }) => {
    const r = await fetch(`${API}/public/grupos/grupo/frequencia/visitante`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, nome, telefone }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || 'Erro ao adicionar visitante'); Object.assign(e, j); throw e; }
    return j;
  },

  renovacaoPorToken: async (token) => {
    const r = await fetch(`${API}/public/grupos/grupo/renovacao?token=${encodeURIComponent(token)}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Erro ao carregar a renovação');
    return j;
  },
  responderRenovacao: async (token, body) => {
    const r = await fetch(`${API}/public/grupos/grupo/renovacao`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, ...body }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || 'Erro ao salvar a resposta'); Object.assign(e, j); throw e; }
    return j;
  },

  confiraPorToken: async (token) => {
    const r = await fetch(`${API}/public/grupos/grupo/confira?token=${encodeURIComponent(token)}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Erro ao carregar a lista do grupo');


    return j;
  },
  responderConfira: async (token, body) => {
    const r = await fetch(`${API}/public/grupos/grupo/confira`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, ...body }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || 'Erro ao salvar a resposta'); Object.assign(e, j); throw e; }
    return j;
  },
};

export const apresentacaoCriancasPublico = {
  proximaData: async () => {
    const res = await fetch(`${API}/public/apresentacao-criancas/proxima-data`);
    if (!res.ok) throw new Error('Erro ao buscar próxima data');
    return res.json();
  },

  textos: async () => {
    const res = await fetch(`${API}/public/apresentacao-criancas/textos`);
    if (!res.ok) throw new Error('Erro ao buscar textos');
    return res.json();
  },


  enviarFoto: async (file) => {
    const fd = new FormData();
    fd.append('foto', file);
    const res = await fetch(`${API}/public/apresentacao-criancas/foto`, { method: 'POST', body: fd });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || 'Não conseguimos enviar a foto.');
    return j;
  },
  inscrever: async (data) => {
    const res = await fetch(`${API}/public/apresentacao-criancas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },
};

export const batismoPublico = {

  textos: async () => {
    const res = await fetch(`${API}/public/batismo/textos`);
    const j = await res.json(); if (!res.ok) throw new Error(j.error || 'Erro'); return j;
  },
  proximaData: async () => {
    const res = await fetch(`${API}/public/batismo/proxima-data`);
    if (!res.ok) throw new Error('Erro ao buscar próxima data');
    return res.json();
  },
  horarios: async () => {


    const res = await fetch(`${API}/public/batismo/horarios?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Erro ao buscar horários');
    return res.json();
  },
  inscrever: async (data) => {
    const res = await fetch(`${API}/public/batismo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },


  acesso: async (token) => {
    const res = await fetch(`${API}/public/batismo/acesso?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Link inválido ou expirado.');
    }
    return res.json();
  },
};


export const relatorios = {
  tipos: () => get('/relatorios/tipos'),
  dados: ({ tipo, inicio, fim }) =>
    get(`/relatorios/dados?tipo=${encodeURIComponent(tipo)}&inicio=${inicio}&fim=${fim}`),
  baixarXlsx: async ({ tipo, inicio, fim, colunas }) => {
    const qs = new URLSearchParams({ tipo, inicio, fim });
    if (colunas?.length) qs.set('colunas', colunas.join(','));
    const h = await headers();
    const res = await fetch(`${API}/relatorios/xlsx?${qs.toString()}`, { headers: h });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || 'Erro ao baixar a planilha');
    }
    const blob = await res.blob();
    const cd = res.headers.get('content-disposition') || '';
    const m = cd.match(/filename="([^"]+)"/);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = m ? m[1] : `${tipo}.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);
  },
};

export const cadastroPublico = {





  bairros: async () => {
    try {
      const res = await fetch(`${API}/public/membresia/bairros`);
      if (!res.ok) return { bairros: [] };
      return res.json();
    } catch {
      return { bairros: [] };
    }
  },
  uploadFoto: async (file) => {
    const fd = new FormData();
    fd.append('foto', file);
    const res = await fetch(`${API}/public/membresia/upload-foto`, { method: 'POST', body: fd });
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Erro ao enviar foto'); }
    return res.json();
  },
  verificarFamilia: async (sobrenome) => {
    const res = await fetch(`${API}/public/membresia/verificar-familia?sobrenome=${encodeURIComponent(sobrenome)}`);
    if (!res.ok) return { familias: [] };
    return res.json();
  },




  censoMeusDados: async (token) => {
    const res = await fetch(`${API}/public/membresia/censo/meus-dados?t=${encodeURIComponent(token)}`);
    if (!res.ok) return { ok: false };
    return res.json();
  },







  lookupCpf: async (cpf, dataNascimento) => {
    const qs = `cpf=${encodeURIComponent(cpf)}&data_nascimento=${encodeURIComponent(dataNascimento || '')}`;
    const res = await fetch(`${API}/public/membresia/lookup-cpf?${qs}`);
    if (!res.ok) return { found: false };
    return res.json();
  },
  lookupNomeTelefone: async (nome, telefone) => {
    const qs = `nome=${encodeURIComponent(nome)}&telefone=${encodeURIComponent(telefone)}`;
    const res = await fetch(`${API}/public/membresia/lookup-nome-telefone?${qs}`);
    if (!res.ok) return { found: false };
    return res.json();
  },
  enviar: async (data) => {
    const res = await fetch(`${API}/public/membresia/cadastro`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  walletVerify: async (cpf, data_nascimento) => {
    const res = await fetch(`${API}/public/membresia/wallet/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cpf, data_nascimento }),
    });
    const ct = res.headers.get('content-type') || '';
    if (!res.ok) {
      if (ct.includes('application/json')) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      throw new Error(`Erro no servidor (HTTP ${res.status}). Tente novamente.`);
    }
    if (!ct.includes('application/json')) {
      throw new Error('Resposta inesperada do servidor. Tente novamente.');
    }
    return res.json();
  },
  walletQrToken: async (cpf, data_nascimento) => {
    const res = await fetch(`${API}/public/membresia/wallet/qr-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cpf, data_nascimento }),
    });
    const ct = res.headers.get('content-type') || '';
    if (!res.ok) {
      if (ct.includes('application/json')) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      throw new Error(`Erro no servidor (HTTP ${res.status}). Tente novamente.`);
    }
    if (!ct.includes('application/json')) {
      throw new Error('Resposta inesperada do servidor. Tente novamente.');
    }
    return res.json();
  },
  walletGoogle: async (cpf, data_nascimento) => {
    const res = await fetch(`${API}/public/membresia/wallet/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cpf, data_nascimento }),
    });
    const ct = res.headers.get('content-type') || '';
    if (!res.ok) {
      if (ct.includes('application/json')) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      throw new Error(`Erro no servidor (HTTP ${res.status}). Tente novamente.`);
    }
    if (!ct.includes('application/json')) {
      throw new Error('Resposta inesperada do servidor. Tente novamente.');
    }
    return res.json();
  },
  walletApple: async (cpf, data_nascimento) => {
    const res = await fetch(`${API}/public/membresia/wallet/apple`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cpf, data_nascimento }),
    });
    const ct = res.headers.get('content-type') || '';
    if (!res.ok) {
      if (ct.includes('application/json')) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      throw new Error(`Erro no servidor (HTTP ${res.status}). Tente novamente.`);
    }
    return res.blob();
  },
};

async function requestFile(path, formData, { timeoutMs = 60_000 } = {}) {
  const token = await getToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: formData,
      signal: controller.signal,
    });
  } catch (cause) {
    if (cause?.name === 'AbortError') {
      const error = Object.assign(new Error('Tempo esgotado ao enviar arquivo (60s). Tente novamente.'), { code: 'API_UPLOAD_TIMEOUT' });
      captureApiError(error, { path, method: 'POST', kind: 'timeout', code: error.code });
      throw error;
    }
    captureApiError(cause, { path, method: 'POST', kind: 'network', code: 'API_UPLOAD_NETWORK_ERROR' });
    throw cause;
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401) { if (supabase) await supabase.auth.signOut(); window.location.href = '/login'; throw new Error('Sessão expirada'); }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error = Object.assign(new Error(body.error || `HTTP ${res.status}`), body, {
      status: res.status,
      requestId: res.headers.get('x-request-id') || body.request_id || null,
    });
    captureApiError(error, {
      path, method: 'POST', kind: 'response', status: res.status,
      requestId: error.requestId, code: error.code,
    });
    throw error;
  }
  try {
    return await res.json();
  } catch (cause) {
    const error = Object.assign(new Error('Resposta inválida recebida após o upload.'), { code: 'API_INVALID_JSON', status: res.status, cause });
    captureApiError(error, { path, method: 'POST', kind: 'protocol', status: res.status, code: error.code });
    throw error;
  }
}

export const attachments = {
  upload: (eventId, taskId, formData) => requestFile(`/events/${eventId}/tasks/${taskId}/attachments`, formData),
  list: (eventId) => get(`/events/${eventId}/attachments`),
  listByTask: (eventId, taskId) => get(`/events/${eventId}/tasks/${taskId}/attachments`),
  remove: (id) => del(`/events/attachments/${id}`),
};

export const reports = {

  generate: (eventId, data) => post(`/events/${eventId}/report`, data),
  list: (eventId) => get(`/events/${eventId}/reports`),
  get: (eventId, id) => get(`/events/${eventId}/reports/${id}`),


  start: (eventId, data) => post(`/events/${eventId}/report/start`, data),
  generateSection: (eventId, reportId, section, force = false) =>
    post(`/events/${eventId}/report/${reportId}/section${force ? '?force=1' : ''}`, { section }),
  finalize: (eventId, reportId) => post(`/events/${eventId}/report/${reportId}/finalize`, {}),

  emailSummary: (eventId, reportId, force = false) =>
    post(`/events/${eventId}/report/${reportId}/email-summary`, force ? { force: true } : {}),
};

export const completions = {
  getUploadUrl: (data) => post('/completions/upload-url', data),
  complete: (data) => post('/completions', data),
  attach: (data) => post('/completions/attach', data),
  getByTask: (taskId) => get(`/completions/task/${taskId}`),
  reopen: (taskId, reason) => request(`/completions/${taskId}/reopen`, { method: 'DELETE', body: JSON.stringify({ reason }) }),
  listByEvent: (eventId) => get(`/completions/event/${eventId}`),
};

export const ml = {
  status: () => get('/ml/status'),
  config: (data) => post('/ml/config', data),
  authCallback: (code) => post('/ml/auth-callback', { code }),
  disconnect: () => post('/ml/disconnect'),
  orders: (params) => get('/ml/orders' + (params ? '?' + new URLSearchParams(params) : '')),
  order: (id) => get(`/ml/orders/${id}`),
  shipments: (params) => get('/ml/shipments' + (params ? '?' + new URLSearchParams(params) : '')),
  shipment: (id) => get(`/ml/shipments/${id}`),
  syncNotas: () => post('/ml/sync-notas'),
};

export const arquivei = {
  status: () => get('/arquivei/status'),
  config: (data) => post('/arquivei/config', data),
  disconnect: () => post('/arquivei/disconnect'),
  sync: () => post('/arquivei/sync'),
};


export const publicVoluntariado = {
  lookupCpf: (cpf) => post('/public/voluntariado/lookup-cpf', { cpf }),


  escalaPorToken: (token) => get(`/public/voluntariado/escala/${token}`),
  responderEscala: (token, status) => post(`/public/voluntariado/escala/${token}/responder`, { status }),
  requestLogin: (cpf, serviceId) => post('/public/voluntariado/request-login', { cpf, serviceId }),
  register: (data) => post('/public/voluntariado/register', data),

  textos: () => fetch(`${API}/public/voluntariado/textos`).then(async r => {
    const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Erro'); return j;
  }),
  inscreverForm: (data) => fetch(`${API}/public/voluntariado/inscrever-form`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then(async r => {
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Erro ao enviar inscrição');
    return j;
  }),
  formOpcoes: () => fetch(`${API}/public/voluntariado/form-opcoes`).then(async r => {
    const j = await r.json().catch(() => ({}));
    return j?.opcoes || [];
  }),
};


export const voluntariado = {
  kpisTaticos: () => get('/voluntariado/kpis/taticos'),

  aniversariantesSemana: () => get('/voluntariado/aniversariantes-semana'),
  parabenizar: (volProfileId) => post(`/voluntariado/aniversariantes/${volProfileId}/parabenizar`, {}),

  acessos: {
    list: (params) => get('/voluntariado/acessos' + (params ? '?' + new URLSearchParams(params) : '')),
    cargos: () => get('/voluntariado/acessos/cargos'),
    criarLogin: (data) => post('/voluntariado/acessos/criar-login', data),
  },

  frequencia: {
    list: (params) => get('/voluntariado/frequencia' + (params ? '?' + new URLSearchParams(params) : '')),
    detalhe: (params) => get('/voluntariado/frequencia/detalhe?' + new URLSearchParams(params)),
    perfis: (q) => get('/voluntariado/frequencia/perfis' + (q ? '?q=' + encodeURIComponent(q) : '')),
    vincular: (nome_norm, vol_profile_id) => post('/voluntariado/frequencia/vincular', { nome_norm, vol_profile_id }),
    revincular: () => post('/voluntariado/frequencia/revincular', {}),
    sugerirVinculos: () => post('/voluntariado/frequencia/sugerir-vinculos', {}),
    vincularLote: (vinculos) => post('/voluntariado/frequencia/vincular-lote', { vinculos }),
    importar: (file) => { const fd = new FormData(); fd.append('arquivo', file); return requestFile('/voluntariado/frequencia/importar', fd); },

    setInatividade: (chave, motivo, detalhe) => put('/voluntariado/frequencia/inatividade', { chave, motivo, detalhe }),

    saiuIgreja: (chave, membro_id, detalhe) => post('/voluntariado/frequencia/saiu-igreja', { chave, membro_id, detalhe }),
  },

  whatsappAuto: {
    config: () => get('/voluntariado/whatsapp-auto/config'),
    saveConfig: (data) => put('/voluntariado/whatsapp-auto/config', data),
    testar: (telefone, nome) => post('/voluntariado/whatsapp-auto/testar', { telefone, nome }),
    envios: () => get('/voluntariado/whatsapp-auto/envios'),
  },

  emails: {
    list: () => get('/voluntariado/emails'),
    get: (id) => get(`/voluntariado/emails/${id}`),
    create: (data) => post('/voluntariado/emails', data),
    update: (id, data) => put(`/voluntariado/emails/${id}`, data),
    remove: (id) => del(`/voluntariado/emails/${id}`),
    resolverDestinatarios: (segmento) => post('/voluntariado/emails/resolver-destinatarios', { segmento }),
    destinatarios: (id) => get(`/voluntariado/emails/${id}/destinatarios`),
    uploadImagem: (file) => { const fd = new FormData(); fd.append('arquivo', file); return requestFile('/voluntariado/emails/upload-imagem', fd); },
    gerarIa: (data) => post('/voluntariado/emails/gerar-ia', data, { timeout: 120_000 }),
    preview: (corpo_html, incluir_assinatura) => post('/voluntariado/emails/preview', { corpo_html, incluir_assinatura }),
    teste: (id) => post(`/voluntariado/emails/${id}/teste`, {}),
    enviar: (id) => post(`/voluntariado/emails/${id}/enviar`, {}, { timeout: 300_000 }),
    agendar: (id, agendado_para) => post(`/voluntariado/emails/${id}/agendar`, { agendado_para }),
    cancelar: (id) => post(`/voluntariado/emails/${id}/cancelar`, {}),
    reenviarErros: (id) => post(`/voluntariado/emails/${id}/reenviar-erros`, {}, { timeout: 300_000 }),

    config: () => get('/voluntariado/emails/config'),
    saveConfig: (assinatura_html) => put('/voluntariado/emails/config', { assinatura_html }),

    templates: {
      list: () => get('/voluntariado/emails/templates'),
      create: (data) => post('/voluntariado/emails/templates', data),
      update: (id, data) => put(`/voluntariado/emails/templates/${id}`, data),
      remove: (id) => del(`/voluntariado/emails/templates/${id}`),
    },
  },

  backfillEmails: () => post('/voluntariado/backfill-emails', {}, { timeout: 300_000 }),

  backfillNascimento: () => post('/voluntariado/backfill-nascimento', {}, { timeout: 300_000 }),

  formOpcoes: {
    list: () => get('/voluntariado/form-opcoes'),
    create: (data) => post('/voluntariado/form-opcoes', data),
    update: (id, data) => put(`/voluntariado/form-opcoes/${id}`, data),
    remove: (id) => del(`/voluntariado/form-opcoes/${id}`),
  },

  inscricoesSummary: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.ano) qs.set('ano', params.ano);
    if (params.area) qs.set('area', params.area);
    const s = qs.toString();
    return get(`/voluntariado/inscricoes-summary${s ? `?${s}` : ''}`);
  },
  inscricoesList: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.ano) qs.set('ano', params.ano);
    if (params.area) qs.set('area', params.area);
    if (params.status) qs.set('status', params.status);
    if (params.mes) qs.set('mes', params.mes);
    if (params.de) qs.set('de', params.de);
    if (params.ate) qs.set('ate', params.ate);
    if (params.search) qs.set('search', params.search);
    if (params.limit != null) qs.set('limit', params.limit);
    if (params.offset != null) qs.set('offset', params.offset);
    const s = qs.toString();
    return get(`/voluntariado/inscricoes${s ? `?${s}` : ''}`);
  },

  atualizarInscricao: (id, status) => patch(`/voluntariado/inscricoes/${id}`, { status }),

  editarInscricao: (id, dados) => patch(`/voluntariado/inscricoes/${id}/dados`, dados),

  desistirInscricao: (id, motivo) => post(`/voluntariado/inscricoes/${id}/desistiu`, { motivo }),


  excluirInscricaoVol: (id) => del(`/voluntariado/inscricoes/${id}`),
  excluirInscricoesVolLote: (ids) => post('/voluntariado/inscricoes/excluir-lote', { ids }),



  distribuicaoDirecionada: (params) => {
    const limpos = Object.fromEntries(
      Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== ''),
    );
    const qs = new URLSearchParams(limpos).toString();
    return get(`/voluntariado/inscricoes/por-direcionada${qs ? `?${qs}` : ''}`);
  },

  antecedentes: (inscricaoId) => get(`/voluntariado/inscricoes/${inscricaoId}/antecedentes`),
  consultarAntecedentes: (inscricaoId) => post(`/voluntariado/inscricoes/${inscricaoId}/antecedentes/consultar`, {}),
  revisarAntecedentes: (checkId, data) => patch(`/voluntariado/antecedentes/${checkId}`, data),
  antecedentesPendentes: () => get('/voluntariado/antecedentes/pendentes'),

  teamMembers: (teamId, yearMonth) =>
    get(`/voluntariado/team/${teamId}/members${yearMonth ? `?year_month=${yearMonth}` : ''}`),
  oneOnOne: {
    create: (data) => post('/voluntariado/1x1', data),
    remove: (id) => del(`/voluntariado/1x1/${id}`),
  },

  me: {
    get: () => get('/voluntariado/me'),
    update: (data) => put('/voluntariado/me', data),
    schedules: () => get('/voluntariado/my-schedules'),
    respondSchedule: (id, status) => post(`/voluntariado/my-schedules/${id}/respond`, { status }),
    availability: () => get('/voluntariado/my-availability'),
    addAvailability: (data) => post('/voluntariado/my-availability', data),
    removeAvailability: (id) => del(`/voluntariado/my-availability/${id}`),
    services: (year) => get(`/voluntariado/my-services?year=${year}`),
    walletGoogle: () => get('/voluntariado/me/wallet/google'),
    walletApple: async () => {
      const token = await getToken();
      const res = await fetch(`${API}/voluntariado/me/wallet/apple`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      return res.blob();
    },
    saveFace: (descriptor, photo_url) => post('/voluntariado/me/face', { descriptor, photo_url }),
    registerMember: (data) => post('/voluntariado/me/register-member', data),
    checkIns: () => get('/voluntariado/my-check-ins'),
  },
  selfCheckinQr: (serviceId) => get(`/voluntariado/self-checkin-qr/${serviceId}`),

  profiles: {
    list: () => get('/voluntariado/profiles'),
    get: (id) => get(`/voluntariado/profiles/${id}`),
    detalhe: (id) => get(`/voluntariado/profiles/${id}/detalhe`),
    create: (data) => post('/voluntariado/profiles', data),
    update: (id, data) => put(`/voluntariado/profiles/${id}`, data),

    editarCadastro: (id, data) => put(`/voluntariado/profiles/${id}/cadastro`, data),
  },

  roles: {
    list: () => get('/voluntariado/roles'),
    add: (profile_id, role) => post('/voluntariado/roles', { profile_id, role }),
    remove: (profileId, role) => del(`/voluntariado/roles/${profileId}/${role}`),
  },

  serviceTypes: {
    list: () => get('/voluntariado/service-types'),
    create: (data) => post('/voluntariado/service-types', data),
    update: (id, data) => put(`/voluntariado/service-types/${id}`, data),
    remove: (id) => del(`/voluntariado/service-types/${id}`),
    generate: (id, weeks, year) => post(`/voluntariado/service-types/${id}/generate`, { weeks, year }),
  },


  relatorioDados: (desde, ate) => get(`/voluntariado/relatorio-dados?desde=${desde}&ate=${ate}`),

  config: {
    get: () => get('/voluntariado/config'),
    update: (body) => put('/voluntariado/config', body),
  },
  services: {
    list: () => get('/voluntariado/services'),
    upcoming: () => get('/voluntariado/services/upcoming'),
    today: () => get('/voluntariado/services/today'),

    checkinWindow: (back, ahead) => get(`/voluntariado/services/checkin-window?back=${back ?? 21}&ahead=${ahead ?? 35}`),
    create: (data) => post('/voluntariado/services', data),
    update: (id, data) => put(`/voluntariado/services/${id}`, data),
    remove: (id) => del(`/voluntariado/services/${id}`),
  },

  schedules: {
    list: (params) => get('/voluntariado/schedules' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/voluntariado/schedules', data),
    update: (id, data) => put(`/voluntariado/schedules/${id}`, data),
    remove: (id) => del(`/voluntariado/schedules/${id}`),
    bulk: (service_id, assignments, forcar) => post('/voluntariado/schedules/bulk', { service_id, assignments, forcar }),
    copy: (from_service_id, to_service_id) => post('/voluntariado/schedules/copy', { from_service_id, to_service_id }),



    autoFill: (service_id, team_ids) => post('/voluntariado/schedules/auto-fill', { service_id, team_ids }),

    desfazerLote: (service_id, ids) => post('/voluntariado/schedules/desfazer-lote', { service_id, ids }),


    contextoMontagem: (service_id) => get(`/voluntariado/services/${service_id}/contexto-montagem`),
  },

  scheduleTemplates: {
    list: () => get('/voluntariado/schedule-templates'),
    get: (id) => get(`/voluntariado/schedule-templates/${id}`),
    create: (data) => post('/voluntariado/schedule-templates', data),
    update: (id, data) => put(`/voluntariado/schedule-templates/${id}`, data),
    remove: (id) => del(`/voluntariado/schedule-templates/${id}`),
    porTipo: (serviceTypeId) => get(`/voluntariado/schedule-templates/por-tipo/${serviceTypeId}`),
    apply: (id, service_id) => post(`/voluntariado/schedule-templates/${id}/apply`, { service_id }),
  },

  escalaCobertura: (serviceId) => get(`/voluntariado/services/${serviceId}/escala-cobertura`),

  escalaMatriz: (params) => get('/voluntariado/escala-matriz' + (params ? '?' + new URLSearchParams(params) : '')),

  checkIns: {
    list: (params) => get('/voluntariado/check-ins' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/voluntariado/check-ins', data),
    manha: (data) => post('/voluntariado/check-ins/manha', data),
  },
  cultosManha: () => get('/voluntariado/cultos-manha'),


  vincularMembros: (body) => post('/voluntariado/vincular-membros', body || {}),
  updateProfileContact: (id, data) => put(`/voluntariado/profiles/${id}/contact`, data),

  qrLookup: (qr_code) => post('/voluntariado/qr-lookup', { qr_code }),

  volunteerQrCodes: {
    list: () => get('/voluntariado/volunteer-qrcodes'),
    create: (data) => post('/voluntariado/volunteer-qrcodes', data),
  },

  face: {
    saveProfile: (data) => post('/voluntariado/face/save-profile', data),
    saveQrcode: (data) => post('/voluntariado/face/save-qrcode', data),
    match: (descriptor, threshold) => post('/voluntariado/face/match', { descriptor, threshold }),
  },

  selfCheckin: (data) => post('/voluntariado/self-checkin', data),




  sync: () => post('/voluntariado/sync', {}, { timeout: 300000 }),
  syncHistorical: (startDate, endDate) => post('/voluntariado/sync-historical', { startDate, endDate }, { timeout: 300000 }),
  syncAuto: () => post('/voluntariado/sync-auto', {}, { timeout: 300000 }),
  syncDiagnostics: () => get('/voluntariado/diagnostics'),
  pcoCpfCheck: () => get('/voluntariado/pco-cpf-check'),
  backfillCpf: () => post('/voluntariado/backfill-cpf'),
  volCpfCoverage: () => get('/voluntariado/vol-cpf-coverage'),
  backfillCpfFromMembro: () => post('/voluntariado/backfill-cpf-from-membro'),
  volCpfHiddenCheck: () => get('/voluntariado/vol-cpf-hidden-check'),

  syncLogs: () => get('/voluntariado/sync-logs'),


  volunteersPool: (incluirArquivados = false) =>
    get(`/voluntariado/volunteers-pool${incluirArquivados ? '?incluir_arquivados=1' : ''}`),

  supervisores: {
    list: () => get('/voluntariado/supervisores'),


    grant: (membro_id, area, position_id = null, rodizio = {}) => post('/voluntariado/supervisores', { membro_id, area, position_id, ...rodizio }),



    update: (id, body) => patch(`/voluntariado/supervisores/${id}`, body),


    candidatos: (volProfileId) => get(`/voluntariado/supervisores/candidatos?vol_profile_id=${encodeURIComponent(volProfileId)}`),
    vincular: (vol_profile_id, membro_id) => post('/voluntariado/supervisores/vincular', { vol_profile_id, membro_id }),
    revoke: (id) => del(`/voluntariado/supervisores/${id}`),
  },

  volByMembro: (membroId) => get(`/voluntariado/vol-by-membro/${membroId}`),
  queroServir: (membroId) => post('/voluntariado/quero-servir', { membro_id: membroId }),
  waitingAllocation: () => get('/voluntariado/waiting-allocation'),
  allocate: (id, data) => post(`/voluntariado/allocate/${id}`, data),

  teams: () => get('/voluntariado/teams'),

  teamsManage: {
    list: () => get('/voluntariado/teams-manage'),
    create: (data) => post('/voluntariado/teams-manage', data),
    update: (id, data) => put(`/voluntariado/teams-manage/${id}`, data),
    remove: (id) => del(`/voluntariado/teams-manage/${id}`),
    importFromSchedules: () => post('/voluntariado/teams-manage/import-from-schedules'),
    syncMembersFromSchedules: () => post('/voluntariado/teams-manage/sync-members-from-schedules'),

    pendenciasPco: () => get('/voluntariado/teams-manage/pendencias-pco'),

    mapaPco: () => get('/voluntariado/teams-manage/mapa-pco'),
    mapearPco: (data) => post('/voluntariado/teams-manage/mapa-pco', data),
  },

  positions: {
    list: (params) => get('/voluntariado/positions' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/voluntariado/positions', data),
    update: (id, data) => put(`/voluntariado/positions/${id}`, data),
    remove: (id) => del(`/voluntariado/positions/${id}`),
  },

  teamMembers: {
    list: (params) => get('/voluntariado/team-members' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/voluntariado/team-members', data),
    update: (id, data) => put(`/voluntariado/team-members/${id}`, data),
    remove: (id) => del(`/voluntariado/team-members/${id}`),
  },

  availability: {
    list: (params) => get('/voluntariado/availability' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/voluntariado/availability', data),
    remove: (id) => del(`/voluntariado/availability/${id}`),
    byService: (from, to) => get(`/voluntariado/services-availability?from=${from}&to=${to}`),
  },

  trainingCheckins: {
    list: (params) => get('/voluntariado/training-checkins' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/voluntariado/training-checkins', data),
  },

  pc: {
    searchPeople: (query) => post('/voluntariado/pc/search-people', { query }),
    getPerson: (person_id) => post('/voluntariado/pc/get-person', { person_id }),
  },
};


export const kpis = {

  serviceTypes: () => get('/kpis/service-types'),

  cultos: {
    list: (params) => get('/kpis/cultos' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/kpis/cultos', data),
    update: (id, data) => put(`/kpis/cultos/${id}`, data),
    remove: (id) => del(`/kpis/cultos/${id}`),
    voluntarios: (id) => get(`/kpis/cultos/${id}/voluntarios`),


    linkDecisoes: (id) => get(`/kpis/cultos/${id}/link-decisoes`),


    linksDecisoesPeriodo: (inicio, fim) =>
      get(`/kpis/cultos/links-decisoes?inicio=${encodeURIComponent(inicio)}&fim=${encodeURIComponent(fim)}`),

    decisoesPessoas: {
      list:   (cultoId) => get(`/kpis/cultos/${cultoId}/decisoes-pessoas`),
      create: (cultoId, data) => post(`/kpis/cultos/${cultoId}/decisoes-pessoas`, data),
      update: (id, data) => put(`/kpis/decisoes-pessoas/${id}`, data),
      remove: (id) => del(`/kpis/decisoes-pessoas/${id}`),
      buscarMembro: (q) => get(`/kpis/decisoes-pessoas/buscar-membro?q=${encodeURIComponent(q)}`),

      historicoImportado: (params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return get('/kpis/decisoes-pessoas/historico-importado' + (qs ? '?' + qs : ''));
      },

      incompletos: (params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return get('/kpis/decisoes-pessoas/incompletos' + (qs ? '?' + qs : ''));
      },
    },
  },

  batismos: {
    list: (params) => get('/kpis/batismos' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/kpis/batismos', data),
    update: (id, data) => put(`/kpis/batismos/${id}`, data),

    updateEmMassa: (ids, status) => put('/kpis/batismos/em-massa', { ids, status }),
    coberturaConvertidos: () => get('/kpis/batismos/cobertura-convertidos'),

    horarios: {
      list: () => get('/kpis/batismos/horarios'),
      create: (data) => post('/kpis/batismos/horarios', data),
      update: (id, data) => patch(`/kpis/batismos/horarios/${id}`, data),
      remove: (id) => del(`/kpis/batismos/horarios/${id}`),
    },
    config: () => get('/kpis/batismos/config'),
    salvarConfig: (data) => patch('/kpis/batismos/config', data),

    checkin: {
      doDia: (params) => get('/kpis/batismos/checkin/do-dia' + (params ? '?' + new URLSearchParams(params) : '')),
      confirmar: (id, body) => post(`/kpis/batismos/${id}/checkin`, body),
      fotoReferencia: (id, file) => {
        const fd = new FormData();
        fd.append('foto', file, 'selfie.jpg');
        return requestFile(`/kpis/batismos/${id}/foto-referencia`, fd);
      },
    },
  },

  dashboard: (semanas) => get(`/kpis/dashboard?semanas=${semanas || 12}`),
  metas: () => get('/kpis/metas'),
  updateMeta: (id, data) => put(`/kpis/metas/${id}`, data),

  cultosAutoCreate: (weeks) => post(`/kpis/cultos/auto-create${weeks ? `?weeks=${weeks}` : ''}`, {}),

  cultura: (mes) => get(`/kpis/cultura${mes ? `?mes=${mes}` : ''}`),
  culturaMensalList: () => get('/kpis/cultura/mensal'),
  culturaMensalUpsert: (data) => post('/kpis/cultura/mensal', data),
  pense: {
    list: () => get('/kpis/cultura/pense'),
    create: (data) => post('/kpis/cultura/pense', data),
    remove: (id) => del(`/kpis/cultura/pense/${id}`),
    sync: () => post('/kpis/cultura/pense/sync', {}),
  },

  v2: {
    nsm: (ano) => get(`/kpis/v2/nsm${ano ? `?ano=${ano}` : ''}`),
    direcionadores: (ano) => get(`/kpis/v2/direcionadores${ano ? `?ano=${ano}` : ''}`),
    estrategicos: (ano) => get(`/kpis/v2/estrategicos${ano ? `?ano=${ano}` : ''}`),
    taticos: (params) => get('/kpis/v2/taticos' + (params ? '?' + new URLSearchParams(params) : '')),
    taticoDetail: (id, limit) => get(`/kpis/v2/taticos/${id}${limit ? `?limit=${limit}` : ''}`),
    taticoCreate: (data) => post('/kpis/v2/taticos', data),
    taticoUpdate: (id, data) => put(`/kpis/v2/taticos/${id}`, data),
    taticoDelete: (id, hard = false) => del(`/kpis/v2/taticos/${id}${hard ? '?hard=true' : ''}`),
    areas: () => get('/kpis/v2/areas'),
    periodoAtual: (periodicidade) => get(`/kpis/v2/periodo-atual?periodicidade=${periodicidade}`),
    registros: {
      list: (params) => get('/kpis/v2/registros' + (params ? '?' + new URLSearchParams(params) : '')),
      create: (data) => post('/kpis/v2/registros', data),
      update: (id, data) => put(`/kpis/v2/registros/${id}`, data),
      remove: (id) => del(`/kpis/v2/registros/${id}`),
    },


    coletarAuto: (opts = {}) => {
      const params = new URLSearchParams();
      if (opts.dryRun) params.set('dry_run', 'true');
      if (opts.fontes?.length) params.set('fontes', opts.fontes.join(','));
      if (opts.areas?.length) params.set('areas', opts.areas.join(','));
      const qs = params.toString();
      return post(`/kpis/v2/coletar${qs ? `?${qs}` : ''}`, {});
    },


    coletarBackfill: (opts = {}) => post('/kpis/v2/coletar/backfill', {
      meses: opts.meses || 6,
      fontes: opts.fontes || null,
      areas: opts.areas || null,
    }),
  },
};


export const nextConvite = {
  pendentes: (contato) => get('/next-convite/pendentes' + (contato ? `?contato=${encodeURIComponent(contato)}` : '')),
  getConfig: () => get('/next-convite/config'),
  saveConfig: (body) => put('/next-convite/config', body),
  enviar: (convertido_ids, tipo = 'next') => post('/next-convite/enviar', { convertido_ids, tipo }),
  marcar: (convertido_ids, tipo = 'next') => post('/next-convite/marcar', { convertido_ids, tipo }),
};


export const agentePrimeiroContato = {
  fila: (status = 'pendente') => get(`/agente-primeiro-contato?status=${encodeURIComponent(status)}`),
  enviado: (id, editou = false) => post(`/agente-primeiro-contato/${id}/enviado`, { editou }),
  ignorar: (id, motivo) => post(`/agente-primeiro-contato/${id}/ignorar`, { motivo }),
};

export const agenteBatismoNext = {
  fila: (status = 'pendente') => get(`/agente-batismo-next?status=${encodeURIComponent(status)}`),
  enviado: (id, editou = false) => post(`/agente-batismo-next/${id}/enviado`, { editou }),
  ignorar: (id, motivo) => post(`/agente-batismo-next/${id}/ignorar`, { motivo }),
};

export const agenteVoluntariado = {
  analisar: () => get('/agente-voluntariado'),
  lembrar: (schedule_ids) => post('/agente-voluntariado/lembrar', schedule_ids ? { schedule_ids } : {}),


  avisarSemana: (dias) => post('/agente-voluntariado/avisar-semana', dias ? { dias } : {}),
};

export const monitorAutomacoes = {
  status: () => get('/monitor-automacoes/status'),
};


export const waInbox = {
  conversas: (params = {}) => {
    const p = new URLSearchParams();
    if (params.status) p.set('status', params.status);
    if (params.q) p.set('q', params.q);
    if (params.area) p.set('area', params.area);
    const qs = p.toString();
    return get(`/wa-inbox/conversas${qs ? `?${qs}` : ''}`);
  },
  mensagens: (id) => get(`/wa-inbox/conversas/${id}/mensagens`),
  responder: (id, body) => post(`/wa-inbox/conversas/${id}/responder`, body),
  abrir: (body) => post('/wa-inbox/conversas/abrir', body),
  nova: (body) => post('/wa-inbox/conversas/nova', body),
  ler: (id) => post(`/wa-inbox/conversas/${id}/ler`, {}),
  atualizar: (id, body) => patch(`/wa-inbox/conversas/${id}`, body),
  finalizar: (id, cancelar = false) => post(`/wa-inbox/conversas/${id}/finalizar`, { cancelar }),
  transferir: (id, area) => post(`/wa-inbox/conversas/${id}/transferir`, { area }),
  anexar: (id, file) => { const fd = new FormData(); fd.append('arquivo', file); return requestFile(`/wa-inbox/conversas/${id}/anexo`, fd, { timeoutMs: 120_000 }); },
  areas: () => get('/wa-inbox/areas'),
  templates: () => get('/wa-inbox/templates'),
  colaboradores: () => get('/wa-inbox/colaboradores'),

  mensagensProntas: () => get('/wa-inbox/mensagens-prontas'),
  criarMensagemPronta: (body) => post('/wa-inbox/mensagens-prontas', body),
  atualizarMensagemPronta: (id, body) => patch(`/wa-inbox/mensagens-prontas/${id}`, body),
  removerMensagemPronta: (id) => del(`/wa-inbox/mensagens-prontas/${id}`),
  perfil: (id) => get(`/wa-inbox/conversas/${id}/perfil`),
  naoLidas: () => get('/wa-inbox/nao-lidas'),
  resumoAreas: () => get('/wa-inbox/resumo-areas'),
  setores: () => get('/wa-inbox/setores'),
  criarSetor: (body) => post('/wa-inbox/setores', body),
  salvarSetor: (id, body) => put(`/wa-inbox/setores/${id}`, body),
  removerSetor: (id) => del(`/wa-inbox/setores/${id}`),
};


export const comunicacao = {




  sugestaoGrupo: (conversaId, auto) => get(`/comunicacao/conversas/${conversaId}/sugestao-grupo${auto ? '?auto=1' : ''}`),






  automaticas: (params = {}) => {
    const p = new URLSearchParams();
    if (params.dias) p.set('dias', String(params.dias));
    if (params.pessoas) p.set('pessoas', '1');
    const qs = p.toString();
    return get(`/comunicacao/automaticas${qs ? `?${qs}` : ''}`, { timeout: 90_000 });
  },
  numeros: {
    list: () => get('/comunicacao/numeros'),
    criar: (body) => post('/comunicacao/numeros', body),
    atualizar: (id, body) => put(`/comunicacao/numeros/${id}`, body),
  },
  templates: {
    list: (params = {}) => {
      const p = new URLSearchParams();
      if (params.modulo) p.set('modulo', params.modulo);
      if (params.status) p.set('status', params.status);
      const qs = p.toString();
      return get(`/comunicacao/templates${qs ? `?${qs}` : ''}`);
    },
    sync: () => post('/comunicacao/templates/sync', {}, { timeout: 120_000 }),
    atualizar: (id, body) => put(`/comunicacao/templates/${id}`, body),

    testar: (chave) => post('/comunicacao/templates/testar', { chave }),
  },


  conexao: {
    get: () => get('/comunicacao/conexao'),
    salvar: (body) => put('/comunicacao/conexao', body),
  },
  agendamentos: {
    list: () => get('/comunicacao/agendamentos'),
    criar: (body) => post('/comunicacao/agendamentos', body),
    atualizar: (id, body) => put(`/comunicacao/agendamentos/${id}`, body),
    remover: (id) => del(`/comunicacao/agendamentos/${id}`),
  },
  atendentes: {
    list: () => get('/comunicacao/atendentes'),
    criar: (body) => post('/comunicacao/atendentes', body),
    atualizar: (id, body) => put(`/comunicacao/atendentes/${id}`, body),
  },
  tarifas: {
    list: () => get('/comunicacao/tarifas'),
    atualizar: (categoria, tarifa) => put(`/comunicacao/tarifas/${encodeURIComponent(categoria)}`, { tarifa }),
  },

  contatos: (busca) => get('/comunicacao/contatos' + (busca ? `?busca=${encodeURIComponent(busca)}` : '')),

  automaticaToggle: (id, ativo) => patch(`/comunicacao/automaticas/${encodeURIComponent(id)}`, { ativo }),
  envios: {
    list: (params = {}) => {
      const p = new URLSearchParams();
      ['status', 'contexto', 'telefone', 'de', 'ate', 'limit', 'offset'].forEach((k) => {
        if (params[k] != null && params[k] !== '') p.set(k, params[k]);
      });
      const qs = p.toString();
      return get(`/comunicacao/envios${qs ? `?${qs}` : ''}`);
    },
    resumo: (dias = 30) => get(`/comunicacao/envios/resumo?dias=${dias}`),



    previa: (body) => post('/comunicacao/envios/previa', body),
    agora: (body) => post('/comunicacao/envios/agora', body),
  },
  custo: (meses = 6) => get(`/comunicacao/custo?meses=${meses}`),



  dashboard: (params = {}) => {
    const p = new URLSearchParams();
    if (params.ano) p.set('ano', String(params.ano));
    else if (params.dias) p.set('dias', String(params.dias));
    const qs = p.toString();
    return get(`/comunicacao/dashboard${qs ? `?${qs}` : ''}`, { timeout: 60_000 });
  },


  botIa: {
    config: () => get('/comunicacao/bot-ia/config'),
    salvarConfig: (body) => put('/comunicacao/bot-ia/config', body),
    areas: () => get('/comunicacao/bot-ia/areas'),
    salvarArea: (area, body) => put(`/comunicacao/bot-ia/areas/${encodeURIComponent(area)}`, body),

    simular: (body) => post('/comunicacao/bot-ia/simular', body, { timeout: 60_000 }),
    resumo: (dias = 7) => get(`/comunicacao/bot-ia/resumo?dias=${dias}`),


    varreduras: () => get('/comunicacao/bot-ia/varreduras'),
    varreduraExemplos: (periodo) => get(`/comunicacao/bot-ia/varreduras/${encodeURIComponent(periodo)}/exemplos`),


    rodarVarredura: (periodo) => post('/comunicacao/bot-ia/varreduras/rodar', periodo ? { periodo } : {}, { timeout: 150_000 }),
  },


  equipe: {
    list: () => get('/comunicacao/equipe'),
    salvar: (area, body) => put(`/comunicacao/equipe/${encodeURIComponent(area)}`, body),
  },
  erros: {
    list: () => get('/comunicacao/erros'),
    reenviar: (id, telefone) => post(`/comunicacao/erros/${id}/reenviar`, telefone ? { telefone } : {}),
  },
};

export const cuidados = {
  dashboard: () => get('/cuidados/dashboard'),
  kpisTaticos: () => get('/cuidados/kpis/taticos'),
  dashboardSeries: (params) => get('/cuidados/dashboard-series' + (params ? '?' + new URLSearchParams(params) : '')),
  jornadaConvertidos: (params) => get('/cuidados/jornada-convertidos' + (params ? '?' + new URLSearchParams(params) : '')),
  acompanhamentos: {
    list: (params) => get('/cuidados/acompanhamentos' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/cuidados/acompanhamentos', data),
    update: (id, data) => patch(`/cuidados/acompanhamentos/${id}`, data),
    remove: (id) => del(`/cuidados/acompanhamentos/${id}`),
  },
  pedidosApp: {
    list: (params) => get('/cuidados/pedidos-app' + (params ? '?' + new URLSearchParams(params) : '')),
    updateStatus: (id, tratamento_status) => patch(`/cuidados/pedidos-app/${id}`, { tratamento_status }),
  },

  pedidos: {
    list: (params) => get('/cuidados/pedidos' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/cuidados/pedidos', data),
    update: (id, data) => patch(`/cuidados/pedidos/${id}`, data),
    remove: (id) => del(`/cuidados/pedidos/${id}`),
    atender: (fonte, id, atendimento) => post('/cuidados/pedidos/atender', { fonte, id, atendimento }),
  },
  oracoes: {
    list: () => get('/cuidados/oracoes'),
    insights: () => get('/cuidados/oracoes/insights'),
    analisar: () => post('/cuidados/oracoes/analisar', {}),
  },

  whatsappAuto: {
    config: () => get('/cuidados/whatsapp-auto/config'),
    saveConfig: (data) => put('/cuidados/whatsapp-auto/config', data),
    testar: (telefone, nome) => post('/cuidados/whatsapp-auto/testar', { telefone, nome }),
    envios: () => get('/cuidados/whatsapp-auto/envios'),
  },
  jornada180: {
    list: (params) => get('/cuidados/jornada180' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/cuidados/jornada180', data),
    remove: (id) => del(`/cuidados/jornada180/${id}`),
  },

  j180: {
    turmas: {
      list: (params) => get('/cuidados/j180/turmas' + (params ? '?' + new URLSearchParams(params) : '')),
      get: (id) => get(`/cuidados/j180/turmas/${id}`),
      create: (data) => post('/cuidados/j180/turmas', data),
      update: (id, data) => patch(`/cuidados/j180/turmas/${id}`, data),
      remove: (id) => del(`/cuidados/j180/turmas/${id}`),
    },
    membros: {
      add: (turmaId, data) => post(`/cuidados/j180/turmas/${turmaId}/membros`, data),
      update: (id, data) => patch(`/cuidados/j180/membros/${id}`, data),
      remove: (id) => del(`/cuidados/j180/membros/${id}`),
    },
    encontros: {
      list: (turmaId) => get(`/cuidados/j180/turmas/${turmaId}/encontros`),
      registrar: (turmaId, data) => post(`/cuidados/j180/turmas/${turmaId}/encontros`, data),
      remove: (id) => del(`/cuidados/j180/encontros/${id}`),
    },
    relatorio: () => get('/cuidados/j180/relatorio'),
  },
  convertidos: {
    list: (params) => get('/cuidados/convertidos' + (params ? '?' + new URLSearchParams(params) : '')),

    update: (id, data) => patch(`/cuidados/convertidos/${id}`, data),
    remove: (id) => del(`/cuidados/convertidos/${id}`),
    tags: () => get('/cuidados/convertidos/tags'),
    atendentes: () => get('/cuidados/convertidos/atendentes'),
    visitasPendentes: () => get('/cuidados/visitas-pendentes'),
    agendarEncontro: (id, data) => post(`/cuidados/convertidos/${id}/agendar-encontro`, data),
    cancelarEncontro: (id) => post(`/cuidados/convertidos/${id}/cancelar-encontro`, {}),
    registrarContato: (id) => post(`/cuidados/convertidos/${id}/registrar-contato`, {}),
    desfecho: (id, data) => post(`/cuidados/convertidos/${id}/desfecho`, data),


    direcionar: (id, direcionamento) => post(`/cuidados/convertidos/${id}/direcionar`, { direcionamento }),
  },

  responsaveis: {
    list: () => get('/cuidados/responsaveis'),
    create: (nome) => post('/cuidados/responsaveis', { nome }),
    update: (id, data) => patch(`/cuidados/responsaveis/${id}`, data),
    remove: (id) => del(`/cuidados/responsaveis/${id}`),
  },

  visitas: {
    list: (params) => get('/cuidados/visitas' + (params ? '?' + new URLSearchParams(params) : '')),
    create: (data) => post('/cuidados/visitas', data),
    update: (id, data) => patch(`/cuidados/visitas/${id}`, data),
    remove: (id) => del(`/cuidados/visitas/${id}`),
  },

  trilha: () => get('/cuidados/trilha'),
  atendimentoComentarios: {
    list: (refTipo, refId) => get(`/cuidados/atendimentos/${refTipo}/${refId}/comentarios`),
    create: (refTipo, refId, texto) => post(`/cuidados/atendimentos/${refTipo}/${refId}/comentarios`, { texto }),
    remove: (id) => del(`/cuidados/atendimento-comentarios/${id}`),
  },
  agregado: {
    list: (mes) => get(`/cuidados/agregado${mes ? `?mes=${mes}` : ''}`),
    upsert: (data) => post('/cuidados/agregado', data),
  },
  buscarMembro: (cpf) => get(`/cuidados/buscar-membro?cpf=${encodeURIComponent(cpf)}`),
  criarMembro: (data) => post('/cuidados/criar-membro', data),
};

export const batismoFotos = {
  datas: () => get('/batismo-fotos'),
  fotos: (data) => get(`/batismo-fotos/${data}/fotos`),
  upload: (data, formData) => requestFile(`/batismo-fotos/${data}/fotos`, formData),
  remove: (data, nome) => del(`/batismo-fotos/${data}/fotos/${encodeURIComponent(nome)}`),
};

export const destaques = {
  list: () => get('/destaques'),
  create: (formData) => requestFile('/destaques', formData),
  update: (id, data) => put(`/destaques/${id}`, data),
  trocarImagem: (id, formData) => requestFile(`/destaques/${id}/imagem`, formData),
  remove: (id) => del(`/destaques/${id}`),
};




export const encaminhamentos = {
  list: (params) => get('/encaminhamentos' + (params ? '?' + new URLSearchParams(params) : '')),
  resumo: (destino) => get('/encaminhamentos/resumo' + (destino ? `?destino=${encodeURIComponent(destino)}` : '')),
  get: (id) => get(`/encaminhamentos/${id}`),
  contato: (id, data) => post(`/encaminhamentos/${id}/contato`, data),
  updateStatus: (id, status) => patch(`/encaminhamentos/${id}`, { status }),

  auxGrupos: () => get('/encaminhamentos/aux/grupos'),
};



export const rotinas = {
  escopo: () => get('/rotinas/escopo'),
  painel: (periodo = '30d') => get(`/rotinas/painel?periodo=${periodo}`),
  levantamento: () => get('/rotinas/levantamento'),
  abrirLevantamento: (nome) => post('/rotinas/levantamento/abrir', { nome }),
  encerrarLevantamento: () => post('/rotinas/levantamento/encerrar', {}),
  declarar: (area, concluida = true) => post('/rotinas/levantamento/declarar', { area, concluida }),
  acompanhamento: (id, ativo) => put(`/rotinas/${id}/acompanhamento`, { ativo }),
  pessoas: () => get('/rotinas/pessoas'),
  list: () => get('/rotinas'),
  create: (corpo) => post('/rotinas', corpo),
  update: (id, corpo) => put(`/rotinas/${id}`, corpo),
  remove: (id) => del(`/rotinas/${id}`),
  criarItem: (id, corpo) => post(`/rotinas/${id}/itens`, corpo),
  atualizarItem: (id, itemId, corpo) => put(`/rotinas/${id}/itens/${itemId}`, corpo),
  removerItem: (id, itemId) => del(`/rotinas/${id}/itens/${itemId}`),
};

export const tarefas = {
  list: () => get('/tarefas'),
  create: (data) => post('/tarefas', data),
  update: (id, data) => put(`/tarefas/${id}`, data),
  remove: (id, serie = false) => del(`/tarefas/${id}${serie ? '?serie=1' : ''}`),

  reordenar: (ids) => post('/tarefas/reordenar', { ids }),
};

export const processos = {
  list:   (p) => get('/processos' + (p ? '?' + new URLSearchParams(p) : '')),
  get:    (id) => get(`/processos/${id}`),
  create: (d) => post('/processos', d),
  update: (id, d) => put(`/processos/${id}`, d),
  remove: (id) => del(`/processos/${id}`),
  agenda: {
    list:   (p) => get('/processos/agenda/all' + (p ? '?' + new URLSearchParams(p) : '')),
    saveBulk: (items) => put('/processos/agenda/bulk', { items }),
  },
  registros: {
    list:   (p) => get('/processos/registros/list' + (p ? '?' + new URLSearchParams(p) : '')),
    create: (d) => post('/processos/registros', d),
  },
  tarefas: {
    list:   (p) => get('/processos/tarefas/list' + (p ? '?' + new URLSearchParams(p) : '')),
    create: (d) => post('/processos/tarefas', d),
    toggle: (id, done) => patch(`/processos/tarefas/${id}`, { done }),
    remove: (id) => del(`/processos/tarefas/${id}`),
  },
  coletar: (dryRun = false) => post(`/processos/coletar${dryRun ? '?dry_run=true' : ''}`, {}),
};

export const jornada = {
  dashboard: (p) => get('/jornada/dashboard' + (p ? '?' + new URLSearchParams(p) : '')),
  visao: (p) => get('/jornada/visao' + (p ? '?' + new URLSearchParams(p) : '')),
  membros: (p) => get('/jornada/membros' + (p ? '?' + new URLSearchParams(p) : '')),
  membro: (id) => get(`/jornada/membro/${id}`),
  cruzar: (criterios, opts = {}) => post('/jornada/cruzar', { criterios, ...opts }),
  refreshPapeis: () => post('/jornada/refresh-papeis', {}),
};

export const devocionais = {
  list: (p) => get('/devocionais' + (p ? '?' + new URLSearchParams(p) : '')),
  byMembro: (id) => get(`/devocionais/membro/${id}`),
  kpis: () => get('/devocionais/kpis'),
  stats: (p) => get('/devocionais/stats' + (p ? '?' + new URLSearchParams(p) : '')),
  create: (body) => post('/devocionais', body),
  update: (id, body) => put(`/devocionais/${id}`, body),
  remove: (id) => del(`/devocionais/${id}`),
};


export const bible = {
  bibles: (language) => get('/bible/bibles' + (language ? '?language=' + encodeURIComponent(language) : '')),
  books: (bibleId) => get(`/bible/bibles/${bibleId}/books`),
  chapters: (bibleId, bookId) => get(`/bible/bibles/${bibleId}/books/${bookId}/chapters`),
  chapter: (bibleId, chapterId) => get(`/bible/bibles/${bibleId}/chapters/${chapterId}`),
};


export const devocionalPlanos = {
  list: () => get('/devocional-planos'),
  get: (id) => get(`/devocional-planos/${id}`),
  create: (body) => post('/devocional-planos', body),
  update: (id, body) => put(`/devocional-planos/${id}`, body),
  remove: (id) => del(`/devocional-planos/${id}`),
  gerarIA: (id, body) => post(`/devocional-planos/${id}/gerar-ia`, body || {}),
  carregarDocx: (id, file, { sobrescrever = false } = {}) => {
    const fd = new FormData();
    fd.append('arquivo', file);
    return requestFile(`/devocional-planos/${id}/carregar-docx${sobrescrever ? '?sobrescrever=1' : ''}`, fd, { timeoutMs: 120_000 });
  },

  previewDocx: (file) => {
    const fd = new FormData();
    fd.append('arquivo', file);
    return requestFile('/devocional-planos/preview-docx', fd, { timeoutMs: 120_000 });
  },

  publicarItensLote: (id, itens, sobrescrever = false) => post(`/devocional-planos/${id}/itens-lote`, { itens, sobrescrever }),
  createItem: (id, body) => post(`/devocional-planos/${id}/itens`, body),
  updateItem: (itemId, body) => put(`/devocional-planos/itens/${itemId}`, body),
  videoUpload: (itemId, body) => post(`/devocional-planos/itens/${itemId}/video/upload`, body),
  removeItem: (itemId) => del(`/devocional-planos/itens/${itemId}`),
  adesao: (id, params) => get(`/devocional-planos/${id}/adesao` + (params ? '?' + new URLSearchParams(params) : '')),
  enviarHoje: (id) => post(`/devocional-planos/${id}/enviar-hoje`, {}),
  envios: (id) => get(`/devocional-planos/${id}/envios`),
  metricasCuidados: () => get('/devocional-planos/metricas-cuidados'),
};


export const devocionalMembro = {
  hoje: () => get('/devocional-membro/hoje'),
  checkIn: (body) => post('/devocional-membro/check-in', body || {}),
  historico: () => get('/devocional-membro/historico'),
};







export const pessoas = {
  lookup: ({ cpf, email, telefone } = {}) => {
    const params = new URLSearchParams();
    if (cpf) params.set('cpf', cpf);
    if (email) params.set('email', email);
    if (telefone) params.set('telefone', telefone);
    return get('/pessoas/lookup?' + params.toString());
  },
  findOrCreate: (body) => post('/pessoas/find-or-create', body),
};


export const nsm = {
  painel: () => get('/nsm/painel'),
  segmento: (seg) => get(`/nsm/painel/${seg}`),
  recalcular: () => post('/nsm/recalcular', {}),
  eventos: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return get('/nsm/eventos' + (qs ? '?' + qs : ''));
  },
};


export const dadosBrutos = {
  tipos: {
    list:   (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return get('/dados-brutos/tipos' + (qs ? '?' + qs : ''));
    },
    create: (body) => post('/dados-brutos/tipos', body),
    update: (id, body) => put(`/dados-brutos/tipos/${id}`, body),
  },
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return get('/dados-brutos' + (qs ? '?' + qs : ''));
  },
  create: (body) => post('/dados-brutos', body),
  update: (id, body) => put(`/dados-brutos/${id}`, body),
  remove: (id) => del(`/dados-brutos/${id}`),
  validar:    (id) => post(`/dados-brutos/${id}/validar`, {}),
  desvalidar: (id) => del(`/dados-brutos/${id}/validar`),
};


export const gestao = {
  pulso: () => get('/gestao/pulso'),
  saude: () => get('/gestao/saude'),
  cobrar: (liderId, body = {}) => post(`/gestao/pulso/cobrar/${liderId}`, body),
  painelAdm: () => get('/gestao/painel-adm'),
  recalcularAdm: () => post('/gestao/painel-adm/recalcular', {}),
};


export const ritual = {
  resumo: (periodo) => get('/ritual/resumo' + (periodo ? `?periodo=${periodo}` : '')),
  pendentes: (periodo) => get('/ritual/pendentes' + (periodo ? `?periodo=${periodo}` : '')),
  revisados: (periodo) => get('/ritual/revisados' + (periodo ? `?periodo=${periodo}` : '')),
  revisar: (kpiId, body) => post(`/ritual/${encodeURIComponent(kpiId)}/revisar`, body),
  atualizarRevisao: (id, body) => patch(`/ritual/revisao/${id}`, body),
  historico: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return get('/ritual/historico' + (qs ? '?' + qs : ''));
  },
};


export const estrategia = {
  direcionadores: {
    list:   () => get('/estrategia/direcionadores'),
    create: (body) => post('/estrategia/direcionadores', body),
    update: (id, body) => put(`/estrategia/direcionadores/${id}`, body),
  },
  objetivos: {
    list:   (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return get('/estrategia/objetivos' + (qs ? '?' + qs : ''));
    },
    get:    (id) => get(`/estrategia/objetivos/${id}`),
    create: (body) => post('/estrategia/objetivos', body),
    update: (id, body) => put(`/estrategia/objetivos/${id}`, body),
    remove: (id) => del(`/estrategia/objetivos/${id}`),
  },
  krs: {
    list:   (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return get('/estrategia/krs' + (qs ? '?' + qs : ''));
    },
    create: (body) => post('/estrategia/krs', body),
    update: (id, body) => put(`/estrategia/krs/${id}`, body),
    remove: (id) => del(`/estrategia/krs/${id}`),
  },
  metasInstitucionais: {
    list:    () => get('/estrategia/metas-institucionais'),
    upsert:  (body) => post('/estrategia/metas-institucionais', body),
    update:  (id, body) => put(`/estrategia/metas-institucionais/${id}`, body),
    aplicar: (tipo) => post('/estrategia/metas-institucionais/aplicar', { tipo }),
  },
  okrsPorTipo:  () => get('/estrategia/okrs-por-tipo'),
  setOkrTipo:   (id, tipo_okr) => put(`/estrategia/objetivos/${id}/tipo`, { tipo_okr }),
  setDadoPrincipal: (id, dado_tipo_principal) => put(`/estrategia/objetivos/${id}/dado-tipo-principal`, { dado_tipo_principal }),




  indiceBase: () => get('/estrategia/indice-base'),


  linhagem: {
    resumo: () => get('/estrategia/linhagem/resumo'),
    set:    (kpiId, linhagem) => put(`/estrategia/linhagem/${kpiId}`, { linhagem }),
  },



  ciclos: {
    list:    () => get('/estrategia/ciclos'),
    vigente: () => get('/estrategia/ciclos/vigente'),
    get:     (id) => get(`/estrategia/ciclos/${id}`),
    create:  (body) => post('/estrategia/ciclos', body),
    update:  (id, body) => patch(`/estrategia/ciclos/${id}`, body),
    krs: {
      create: (cicloId, body) => post(`/estrategia/ciclos/${cicloId}/krs`, body),
      update: (id, body) => patch(`/estrategia/ciclo-krs/${id}`, body),
      remove: (id) => del(`/estrategia/ciclo-krs/${id}`),
    },
  },
};


export const painel = {
  mandalas:   () => get('/painel/mandalas'),
  matriz:     () => get('/painel/matriz'),
  matrizAdm:  () => get('/painel/matriz-adm'),
  matrizCriativo: () => get('/painel/matriz-criativo'),
  celula:     (area, valor) => get(`/painel/celula/${area}/${valor}`),
  celulaAdm:  (areaAdm, areaCliente) => get(`/painel/celula-adm/${areaAdm}/${areaCliente}`),
  celulaCriativo: (areaCriativa, areaCliente) => get(`/painel/celula-criativo/${areaCriativa}/${areaCliente}`),
  alertas:  (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return get('/painel/alertas' + (qs ? '?' + qs : ''));
  },
  kpi: (id) => get(`/painel/kpi/${encodeURIComponent(id)}`),
  nsmPessoas: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return get('/painel/nsm/pessoas' + (qs ? '?' + qs : ''));
  },

  nsmSerie: (meses = 12, segmento = 'central') =>
    get(`/painel/nsm/serie?meses=${meses}&segmento=${segmento}`),


  nsmSemDados: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return get('/painel/nsm/sem-dados' + (qs ? '?' + qs : ''));
  },

  serieTemporalDados: () => get('/painel/serie-temporal/dados'),


  serieTemporal: (params = {}) => {
    const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== ''));
    const qs = new URLSearchParams(clean).toString();
    return get('/painel/serie-temporal' + (qs ? '?' + qs : ''));
  },

  monitoramentoOkr: () => get('/painel/monitoramento-okr'),
};

export const nps = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return get('/nps' + (qs ? '?' + qs : ''));
  },
  get: (id) => get(`/nps/${id}`),
  create: (data) => post('/nps', data),
  update: (id, data) => put(`/nps/${id}`, data),
  remove: (id) => del(`/nps/${id}`),
  gerarPerguntas: (data) => post('/nps/gerar-perguntas', data),
  respostas: (id) => get(`/nps/${id}/respostas`),
  responder: (id, data) => post(`/nps/${id}/responder`, data),
  analisar: (id) => post(`/nps/${id}/analisar`, {}),
  notificar: (id) => post(`/nps/${id}/notificar`, {}),


  importarForm: (url) => post('/nps/importar-form', { url }),
  importarRespostas: (id, file, { preview = false, notaColuna } = {}) => {
    const fd = new FormData();
    fd.append('arquivo', file);
    if (notaColuna) fd.append('nota_coluna', notaColuna);
    return requestFile(`/nps/${id}/importar-respostas${preview ? '?preview=1' : ''}`, fd, { timeoutMs: 120_000 });
  },





  publicGet: (token, turma) =>
    npsFetchRetry(
      () => fetch(`${API}/public/nps/${encodeURIComponent(token)}` + (turma ? `?turma=${encodeURIComponent(turma)}` : ''), { headers: { 'Content-Type': 'application/json' } }),
      { tentativas: 4, msg: 'Erro ao carregar pesquisa' },
    ),
  publicResponder: (token, payload) =>
    npsFetchRetry(
      () => fetch(`${API}/public/nps/${encodeURIComponent(token)}/responder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
      { tentativas: 3, msg: 'Erro ao enviar resposta' },
    ),



  publicResponderBeacon: (token, payload) => {
    try {
      if (typeof navigator === 'undefined' || !navigator.sendBeacon) return false;
      const url = `${API}/public/nps/${encodeURIComponent(token)}/responder`;
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      return navigator.sendBeacon(url, blob);
    } catch { return false; }
  },
};







export { censoPublico } from './lib/censoApi';

export const online = {

  aceitacoes: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
    ).toString();
    return get('/online/aceitacoes' + (qs ? '?' + qs : ''));
  },
  qrCultos: (inicio, fim) => get(`/online/qr-cultos?inicio=${inicio}&fim=${fim}`),



  linkMembresia: () => get('/online/link-membresia'),

  comunidadeMensal: (mes, valor) => post('/online/comunidade-mensal', { mes, valor }),
  dashboard: () => get('/online/dashboard'),
  engajamento: () => get('/online/engajamento'),



  canalSerie: (dias) => get(`/online/canal-serie?dias=${dias}`),



  arrecadacao: (ano) => get(`/online/arrecadacao${ano ? `?ano=${ano}` : ''}`),
  cultosMetricas: (limit) => get('/online/cultos-metricas' + (limit ? '?limit=' + limit : '')),
  series: (order) => get('/online/series' + (order ? '?order=' + order : '')),
  serie: (id) => get('/online/series/' + id),
  sync: () => post('/online/sync', {}),
  oauth: {
    status: () => get('/online/oauth/status'),
    authorize: () => get('/online/oauth/authorize'),
    disconnect: () => post('/online/oauth/disconnect', {}),
  },
  coletar: {
    live: () => post('/online/coletar/live', {}),
    ds: () => post('/online/coletar/ds', {}),
    ddus: () => post('/online/coletar/ddus', {}),
    backfillCultos: () => post('/online/coletar/backfill-cultos', {}),
    catchUp: (limit = 5) => post(`/online/coletar/catch-up?limit=${limit}`, {}),
    engajamento: (ano) => post(`/online/coletar/engajamento${ano ? `?ano=${ano}` : ''}`, {}),



    viewsDia: (dias = 5) => post(`/online/coletar/views-dia?dias=${dias}`, {}),
  },
  debug: {
    canaisAutorizados: () => get('/online/debug/canais-autorizados'),
    analyticsTest: (video_id, start, end) =>
      get(`/online/debug/analytics-test?video_id=${encodeURIComponent(video_id)}${start ? `&start=${start}` : ''}${end ? `&end=${end}` : ''}`),
  },
};

export const wifi = {
  resumo: () => get('/wifi/resumo'),
  pessoas: (params) => get('/wifi/pessoas' + (params ? '?' + new URLSearchParams(params) : '')),
  pessoa: (cpf) => get('/wifi/pessoas/' + encodeURIComponent(cpf)),
  cultos: (params) => get('/wifi/cultos' + (params ? '?' + new URLSearchParams(params) : '')),
  semanas: (params) => get('/wifi/semanas' + (params ? '?' + new URLSearchParams(params) : '')),
  alertas: () => get('/wifi/alertas'),
  servicos: () => get('/wifi/servicos'),
  sync: () => post('/wifi/sync', {}),
};








export const planejamentoAnual = {
  constantes: () => get('/planejamento-anual/aux/constantes'),
  locais: () => get('/planejamento-anual/aux/locais'),
  areas: () => get('/planejamento-anual/aux/areas'),
  ciclos: {
    list: () => get('/planejamento-anual/ciclos'),
    get: (id) => get(`/planejamento-anual/ciclos/${id}`),
    create: (ano) => post('/planejamento-anual/ciclos', { ano }),
    janelas: (id, corpo) => patch(`/planejamento-anual/ciclos/${id}/janelas`, corpo),
    avaliadores: (id, avaliadores) => put(`/planejamento-anual/ciclos/${id}/avaliadores`, { avaliadores }),
    removerAvaliador: (id, diretoria) => del(`/planejamento-anual/ciclos/${id}/avaliadores/${diretoria}`),
    responsaveisOrcamento: (id) => get(`/planejamento-anual/ciclos/${id}/orcamento/responsaveis`),
    salvarResponsaveisOrcamento: (id, profileIds) => put(`/planejamento-anual/ciclos/${id}/orcamento/responsaveis`, { profile_ids: profileIds }),
    propostas: (id, params) => get(`/planejamento-anual/ciclos/${id}/propostas` + (params ? '?' + new URLSearchParams(params) : '')),
    ranking: (id) => get(`/planejamento-anual/ciclos/${id}/ranking`),
    conflitos: (id) => get(`/planejamento-anual/ciclos/${id}/conflitos`),
    insights: (id) => get(`/planejamento-anual/ciclos/${id}/insights`),
    aceitarConflito: (id, corpo) => post(`/planejamento-anual/ciclos/${id}/conflitos/aceitar`, corpo),
    reabrirConflito: (id, aceiteId) => del(`/planejamento-anual/ciclos/${id}/conflitos/aceites/${aceiteId}`),
    calendario: (id) => get(`/planejamento-anual/ciclos/${id}/calendario`),
    travas: (id) => get(`/planejamento-anual/ciclos/${id}/travas`),
    publicar: (id) => post(`/planejamento-anual/ciclos/${id}/publicar`, {}),
    decisoesLote: (id, corpo) => post(`/planejamento-anual/ciclos/${id}/decisoes-lote`, corpo),
    orcamento: (id) => get(`/planejamento-anual/ciclos/${id}/orcamento`),
    salvarOrcamento: (id, corpo) => put(`/planejamento-anual/ciclos/${id}/orcamento`, corpo),
    enviarOrcamento: (id) => post(`/planejamento-anual/ciclos/${id}/orcamento/enviar`, {}),
    orcamentoPastor: (id, simular) => get(`/planejamento-anual/ciclos/${id}/orcamento/pastor` + (simular ? `?simular=${simular}` : '')),
  },
  propostas: {
    create: (corpo) => post('/planejamento-anual/propostas', corpo),
    get: (id, params) => get(`/planejamento-anual/propostas/${id}` + (params ? '?' + new URLSearchParams(params) : '')),
    update: (id, corpo) => put(`/planejamento-anual/propostas/${id}`, corpo),
    descartar: (id) => del(`/planejamento-anual/propostas/${id}`),
    enviar: (id) => post(`/planejamento-anual/propostas/${id}/enviar`, {}),
    avaliar: (id, corpo) => put(`/planejamento-anual/propostas/${id}/avaliacao`, corpo),
    decidir: (id, corpo) => post(`/planejamento-anual/propostas/${id}/decisao`, corpo),
    decidirRetificacao: (id, corpo) => post(`/planejamento-anual/propostas/${id}/decisao-retificacao`, corpo),
    retificar: (id, corpo) => post(`/planejamento-anual/propostas/${id}/retificar`, corpo),
    retirar: (id) => post(`/planejamento-anual/propostas/${id}/retirar`, {}),
    verificarRessalva: (id) => post(`/planejamento-anual/propostas/${id}/ressalva/verificar`, {}),
    reabrirRessalva: (id) => post(`/planejamento-anual/propostas/${id}/ressalva/reabrir`, {}),
    remanejar: (id, corpo) => put(`/planejamento-anual/propostas/${id}/remanejar`, corpo),
    apontar: (id, corpo) => post(`/planejamento-anual/propostas/${id}/apontamentos`, corpo),
    removerApontamento: (apontamentoId) => del(`/planejamento-anual/apontamentos/${apontamentoId}`),


    apontarPastor: (id, { campo, valor, dia_semana, precisao } = {}) =>
      put(`/planejamento-anual/propostas/${id}/apontamento-pastor`, { campo, valor, dia_semana, precisao }),
    removerApontamentoPastor: (id, campo) =>
      put(`/planejamento-anual/propostas/${id}/apontamento-pastor`, { campo, valor: null }),
    configRotina: (id) => get(`/planejamento-anual/propostas/${id}/config-rotina`),
    salvarConfigRotina: (id, corpo) => put(`/planejamento-anual/propostas/${id}/config-rotina`, corpo),
  },


  execucao: {
    propostas: (params) => get('/planejamento-anual/execucao/propostas' + (params ? '?' + new URLSearchParams(params) : '')),
    proposta: (id) => get(`/planejamento-anual/execucao/propostas/${id}`),
    ajustarCalendario: (corpo) => put('/planejamento-anual/execucao/calendario/ajustes', corpo),
    desfazerAjusteCalendario: (itemId, dataOriginal) => del(`/planejamento-anual/execucao/calendario/ajustes?item_id=${encodeURIComponent(itemId)}&data_original=${dataOriginal}`),
    liturgicos: (ano, cultos = false) => get(`/planejamento-anual/execucao/liturgicos?ano=${ano}${cultos ? '&cultos=1' : ''}`),
    materializar: (id, tipo) => post(`/planejamento-anual/propostas/${id}/materializar`, { tipo }),


    iniciarFases: (id) => post(`/planejamento-anual/execucao/propostas/${id}/fases/iniciar`, {}),
    rotina: (id) => get(`/planejamento-anual/execucao/propostas/${id}/rotina`),
    colocarEmOperacao: (id) => post(`/planejamento-anual/execucao/propostas/${id}/operacao`, {}),
    criarFase: (id, nome) => post(`/planejamento-anual/execucao/propostas/${id}/fases`, { nome }),
    renomearFase: (id, faseId, nome) => put(`/planejamento-anual/execucao/propostas/${id}/fases/${faseId}`, { nome }),
    excluirFase: (id, faseId) => del(`/planejamento-anual/execucao/propostas/${id}/fases/${faseId}`),
    criarTarefa: (id, corpo) => post(`/planejamento-anual/execucao/propostas/${id}/tarefas`, corpo),
    atualizarTarefa: (id, taskId, corpo) => put(`/planejamento-anual/execucao/propostas/${id}/tarefas/${taskId}`, corpo),
    statusTarefa: (id, taskId, status) => patch(`/planejamento-anual/execucao/propostas/${id}/tarefas/${taskId}/status`, { status }),
    excluirTarefa: (id, taskId) => del(`/planejamento-anual/execucao/propostas/${id}/tarefas/${taskId}`),
  },
};

export const auth = {
  uploadFoto: (file) => {
    const fd = new FormData();
    fd.append('foto', file);
    return requestFile('/auth/profile/foto', fd);
  },
};


export const apresentacoes = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return get('/apresentacoes' + (q ? '?' + q : ''));
  },
  get: (id) => get(`/apresentacoes/${id}`),
  create: (body) => post('/apresentacoes', body),
  remove: (id) => del(`/apresentacoes/${id}`),
  gerar: (id, body = {}) => post(`/apresentacoes/${id}/gerar`, body),
  uploadArquivos: (id, files) => {
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    return requestFile(`/apresentacoes/${id}/arquivos`, fd);
  },
  removerArquivo: (id, arquivoId) => del(`/apresentacoes/${id}/arquivos/${arquivoId}`),
  reset: (id) => post(`/apresentacoes/${id}/reset`, {}),


  fetchHtml: async (id) => {
    const h = await headers();
    const res = await fetch(`${API}/apresentacoes/${id}/render`, { headers: h });
    if (!res.ok) throw new Error(`Erro ao carregar HTML (${res.status})`);
    return res.text();
  },
  resumoUso: () => get('/apresentacoes/uso/resumo'),
};


export const onboardingPublico = {
  get: (token) => get(`/public/rh-onboarding/${encodeURIComponent(token)}`),
  salvar: (token, dados) => post(`/public/rh-onboarding/${encodeURIComponent(token)}`, dados),
};



export const fichaContratadaPublica = {
  get: (token) => get(`/public/rh-ficha-contratada/${encodeURIComponent(token)}`),
  salvar: (token, dados) => post(`/public/rh-ficha-contratada/${encodeURIComponent(token)}`, dados),
};




export const visitantePublico = {
  contexto: (local) => fetch(`${API}/public/visitante/contexto${local ? `?local=${encodeURIComponent(local)}` : ''}`)
    .then(r => r.json()),
  registrar: (data) => fetch(`${API}/public/visitante`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  }).then(async r => {
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || 'Erro'); e.campo = j.campo; e.status = r.status; throw e; }
    return j;
  }),
  avaliacao: (token) => fetch(`${API}/public/visitante/avaliar/${encodeURIComponent(token)}`)
    .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Link inválido'); return j; }),
  avaliar: (token, data) => fetch(`${API}/public/visitante/avaliar/${encodeURIComponent(token)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  }).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Erro'); return j; }),
};


export const visitantes = {
  listar: (params) => get('/visitantes' + (params ? '?' + new URLSearchParams(params) : '')),
  resumo: (params) => get('/visitantes/resumo' + (params ? '?' + new URLSearchParams(params) : '')),
  locais: () => get('/visitantes/locais'),
  obter: (id) => get(`/visitantes/${id}`),
  atualizar: (id, data) => patch(`/visitantes/${id}`, data),
  remover: (id) => del(`/visitantes/${id}`),
  voucher: {
    consultar: (codigo) => get(`/visitantes/voucher/${encodeURIComponent(codigo)}`),
    resgatar: (codigo) => post(`/visitantes/voucher/${encodeURIComponent(codigo)}/resgatar`, {}),
  },

  cuidados: (params) => get('/visitantes/cuidados' + (params ? '?' + new URLSearchParams(params) : '')),
  atualizarCuidados: (id, data) => patch(`/visitantes/cuidados/${id}`, data),



  fluxo: (params) => get('/visitantes/cuidados/fluxo' + (params ? '?' + new URLSearchParams(params) : '')),
  encerrarFluxo: (id, data) => post(`/visitantes/cuidados/${id}/desfecho`, data),
  reabrirFluxo: (id) => del(`/visitantes/cuidados/${id}/desfecho`),
};


export const avaliacao360 = {

  minhas: () => get('/avaliacao360/minhas'),
  formulario: (conviteId) => get(`/avaliacao360/convite/${conviteId}`),
  responder: (conviteId, notas) => post(`/avaliacao360/convite/${conviteId}/responder`, { notas }),
  editarResposta: (conviteId, notas) => post(`/avaliacao360/convite/${conviteId}/editar`, { notas }),

  competencias: () => get('/avaliacao360/competencias'),
  criarCompetencia: (dados) => post('/avaliacao360/competencias', dados),
  editarCompetencia: (id, dados) => patch(`/avaliacao360/competencias/${id}`, dados),
  pesoPcs: (id, peso_pcs) => put(`/avaliacao360/competencias/${id}/peso-pcs`, { peso_pcs }),
  avisoPcs: (id) => get(`/avaliacao360/ciclos/${id}/aviso-pcs`),
  avisoPcsUltimo: () => get('/avaliacao360/aviso-pcs/ultimo'),
  ciclos: () => get('/avaliacao360/ciclos'),
  ciclo: (id) => get(`/avaliacao360/ciclos/${id}`),
  criarCiclo: (dados) => post('/avaliacao360/ciclos', dados),
  editarCiclo: (id, dados) => patch(`/avaliacao360/ciclos/${id}`, dados),
  salvarPerguntas: (id, itens) => put(`/avaliacao360/ciclos/${id}/perguntas`, { itens }),
  configCriterio: (id, competenciaId, dados) => put(`/avaliacao360/ciclos/${id}/criterios/${competenciaId}`, dados),
  pessoa: (id, avaliadoId) => get(`/avaliacao360/ciclos/${id}/pessoa/${avaliadoId}`),
  definirAvaliados: (id, avaliadoId, dados) => put(`/avaliacao360/ciclos/${id}/avaliados/${avaliadoId}`, dados),
  removerAvaliado: (id, avaliadoId) => post(`/avaliacao360/ciclos/${id}/avaliados/${avaliadoId}/remover`),
  mudarStatus: (id, para) => post(`/avaliacao360/ciclos/${id}/status`, { para }),
  sugerir: (id) => post(`/avaliacao360/ciclos/${id}/sugerir`),
  avaliadores: (id) => get(`/avaliacao360/ciclos/${id}/avaliadores`),
  editarAvaliador: (id, dados) => post(`/avaliacao360/ciclos/${id}/avaliadores`, dados),
  adesao: (id) => get(`/avaliacao360/ciclos/${id}/adesao`),
  entregas: (id) => get(`/avaliacao360/ciclos/${id}/entregas`),
  avisar: (id, tipo) => post(`/avaliacao360/ciclos/${id}/avisar`, { tipo }),

  resultadosCiclo: (id) => get(`/avaliacao360/ciclos/${id}/resultados`),
  resultadoRH: (id, avaliadoId) => get(`/avaliacao360/ciclos/${id}/resultados/${avaliadoId}`),
  entregarRH: (id, avaliadoId, dados) => post(`/avaliacao360/ciclos/${id}/resultados/${avaliadoId}/entrega`, dados),
  calibrar: (id, avaliadoId, dados) => post(`/avaliacao360/ciclos/${id}/resultados/${avaliadoId}/calibragem`, dados),

  meusResultados: () => get('/avaliacao360/resultados'),
  resultado: (cicloId, avaliadoId) => get(`/avaliacao360/resultados/${cicloId}/${avaliadoId}`),
  entregar: (cicloId, avaliadoId, dados) => post(`/avaliacao360/resultados/${cicloId}/${avaliadoId}/entrega`, dados),
  plano: (cicloId, avaliadoId, plano) => post(`/avaliacao360/resultados/${cicloId}/${avaliadoId}/plano`, { plano }),
  planoRH: (cicloId, avaliadoId, plano) => post(`/avaliacao360/ciclos/${cicloId}/resultados/${avaliadoId}/plano`, { plano }),
};

export const rhSelecao = {
  gestao: () => get('/rh-selecao/gestao'),
  criar: (b) => post('/rh-selecao/gestao', b),
  status: (id, status) => patch(`/rh-selecao/gestao/${id}`, { status }),
  editarFormulario: (id, dados) => put(`/rh-selecao/gestao/${id}/formulario`, dados),
  inscricoes: (id, pagina = 0, vaga = '') => get(`/rh-selecao/gestao/${id}/inscricoes?${new URLSearchParams({ pagina, vaga })}`),
  criterios: (id, vaga, instrucoes) => put(`/rh-selecao/gestao/${id}/criterios`, { vaga, instrucoes }),
  preparar: (id) => post(`/rh-selecao/inscricoes/${id}/preparar`, {}),
  curriculo: (id, texto) => put(`/rh-selecao/inscricoes/${id}/curriculo`, { texto }),
  analisar: (id, vaga) => post(`/rh-selecao/inscricoes/${id}/analisar`, { vaga }, { timeout: 90000 }),
  avaliar: (id, status) => patch(`/rh-selecao/inscricoes/${id}`, { status }),
  anexo: (id) => get(`/rh-selecao/inscricoes/${id}/anexo`),
  formulario: (id) => get(`/rh-selecao/${id}`),
  enviar: (id, dados, arquivo) => { const fd = new FormData(); fd.append('dados', JSON.stringify(dados)); if (arquivo) fd.append('arquivo', arquivo); return requestFile(`/rh-selecao/${id}/inscricoes`, fd); },
};
