



















const ROTULO_AGENTE = Object.freeze({
  incident_backend_diagnostician: 'Especialista Backend & API',
  incident_automation_diagnostician: 'Especialista em Automações',
  incident_experience_diagnostician: 'Especialista em Experiência',
  incident_general_diagnostician: 'Especialista Geral de Incidentes',
  system_auditor: 'Auditor do Sistema',
  design_auditor: 'Auditor de Design',
});





function rotuloAgente(agentType) {
  const t = String(agentType || '').trim();
  if (!t) return 'Agente';
  if (ROTULO_AGENTE[t]) return ROTULO_AGENTE[t];
  if (t.startsWith('module_')) {
    const mod = t.slice('module_'.length).replace(/_/g, ' ');
    return `Auditoria · ${mod.charAt(0).toUpperCase()}${mod.slice(1)}`;
  }
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}


const SEVERIDADES = Object.freeze(['critico', 'aviso', 'info']);

function severidadeDe(finding) {
  const s = String(finding?.severity || '').toLowerCase();
  return SEVERIDADES.includes(s) ? s : 'info';
}














function planoDeAcao(finding, diagnosis) {
  const doDiagnostico = Array.isArray(diagnosis?.recommended_actions)
    ? diagnosis.recommended_actions.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  if (doDiagnostico.length) return doDiagnostico;
  return String(finding?.suggestion || '')
    .split('|')
    .map((x) => x.trim())
    .filter(Boolean);
}

function passosDeValidacao(diagnosis) {
  return Array.isArray(diagnosis?.validation_steps)
    ? diagnosis.validation_steps.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
}

function evidencias(finding, diagnosis) {
  if (Array.isArray(diagnosis?.evidence) && diagnosis.evidence.length) {
    return diagnosis.evidence.map((x) => String(x || '').trim()).filter(Boolean);
  }

  const detalhe = String(finding?.detail || '');
  const corte = detalhe.indexOf('Evidências:');
  if (corte < 0) return [];
  return detalhe.slice(corte + 'Evidências:'.length)
    .split('|').map((x) => x.trim()).filter(Boolean);
}


function resumoDoFinding(finding, diagnosis) {
  if (diagnosis?.summary) return String(diagnosis.summary).trim();
  const detalhe = String(finding?.detail || '');
  const corte = detalhe.indexOf('Evidências:');
  return (corte < 0 ? detalhe : detalhe.slice(0, corte)).trim();
}










function estadoDoItem(incidente) {
  if (!incidente) return 'sem_incidente';
  const st = String(incidente.status || '').toLowerCase();
  if (st === 'resolvido' || st === 'risco_aceito' || st === 'duplicado') return 'encerrado';
  return 'aberto';
}












function montarItens({ runs = [], incidentes = new Map(), diagnosticos = new Map() } = {}) {
  const itens = [];
  for (const run of runs) {
    const findings = Array.isArray(run?.findings) ? run.findings : [];
    findings.forEach((finding, i) => {
      const incidenteId = finding?.incident_id || null;
      const incidente = incidenteId ? (incidentes.get(incidenteId) || null) : null;
      const diagnosis = incidenteId ? (diagnosticos.get(incidenteId) || null) : null;
      itens.push({


        id: `${run.id}:${i}`,
        run_id: run.id,
        agent_type: run.agent_type || null,
        agente: rotuloAgente(run.agent_type),
        quando: run.completed_at || run.started_at || run.created_at || null,
        severidade: severidadeDe(finding),
        estado: estadoDoItem(incidente),
        titulo: String(finding?.title || 'Constatação sem título').trim(),
        modulo: finding?.module || null,
        resumo: resumoDoFinding(finding, diagnosis),
        evidencias: evidencias(finding, diagnosis),
        plano_de_acao: planoDeAcao(finding, diagnosis),
        passos_de_validacao: passosDeValidacao(diagnosis),
        classificacao: diagnosis?.classification || null,
        confianca: diagnosis?.confidence || null,
        risco: diagnosis?.risk_level || null,


        decisao_necessaria: diagnosis?.decision_required === true && !!String(diagnosis?.decision_question || '').trim(),
        pergunta_de_decisao: String(diagnosis?.decision_question || '').trim() || null,
        incidente: incidente ? {
          id: incidente.id,
          titulo: incidente.title,
          status: incidente.status,
          severidade: incidente.severity,
          ambiente: incidente.environment,
          request_id: incidente.request_id,
          release: incidente.release,
          impacto: incidente.impact_summary,
          aberto_em: incidente.created_at,
          resolvido_em: incidente.resolved_at,
        } : null,
      });
    });
  }
  return itens;
}


function resumirItens(itens = []) {
  const abertos = itens.filter((i) => i.estado === 'aberto');
  return {
    total: itens.length,
    abertos: abertos.length,
    criticos_abertos: abertos.filter((i) => i.severidade === 'critico').length,
    aguardando_decisao: abertos.filter((i) => i.decisao_necessaria).length,
    sem_plano: itens.filter((i) => !i.plano_de_acao.length).length,
  };
}

module.exports = {
  ROTULO_AGENTE,
  rotuloAgente,
  severidadeDe,
  planoDeAcao,
  passosDeValidacao,
  evidencias,
  resumoDoFinding,
  estadoDoItem,
  montarItens,
  resumirItens,
};
