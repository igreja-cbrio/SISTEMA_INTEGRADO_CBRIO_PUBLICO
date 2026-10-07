







const { supabase } = require('../utils/supabase');
const { montarItens, resumirItens } = require('../utils/agentDiagnostico');

const LOTE = 200;

async function lerEmLotes(ids, consulta) {
  const out = [];
  for (let i = 0; i < ids.length; i += LOTE) {
    const { data, error } = await consulta(ids.slice(i, i + LOTE));



    if (error) throw error;
    out.push(...(data || []));
  }
  return out;
}






async function listarDiagnosticos({ limite, agentType } = {}) {
  const lim = Math.min(Math.max(parseInt(limite, 10) || 40, 1), 100);

  let q = supabase.from('agent_runs')
    .select('id, agent_type, status, summary, findings, started_at, completed_at, created_at')
    .not('findings', 'is', null)
    .order('created_at', { ascending: false })
    .limit(lim);
  if (agentType) q = q.eq('agent_type', agentType);

  const { data: runsBrutas, error } = await q;
  if (error) throw error;




  const runs = (runsBrutas || []).filter((r) => Array.isArray(r.findings) && r.findings.length);

  const incidenteIds = [...new Set(
    runs.flatMap((r) => r.findings.map((f) => f?.incident_id).filter(Boolean)),
  )];

  const incidentes = new Map();
  const diagnosticos = new Map();

  if (incidenteIds.length) {
    const linhas = await lerEmLotes(incidenteIds, (chunk) => supabase
      .from('system_incidents')
      .select('id, title, status, severity, environment, request_id, release, impact_summary, created_at, resolved_at')
      .in('id', chunk));
    linhas.forEach((i) => incidentes.set(i.id, i));




    const eventos = await lerEmLotes(incidenteIds, (chunk) => supabase
      .from('system_incident_events')
      .select('incident_id, metadata, created_at')
      .in('incident_id', chunk)
      .order('created_at', { ascending: true }));
    eventos.forEach((ev) => {
      const d = ev?.metadata?.diagnosis;
      if (d && typeof d === 'object') diagnosticos.set(ev.incident_id, d);
    });
  }

  const itens = montarItens({ runs, incidentes, diagnosticos });
  return { itens, resumo: resumirItens(itens) };
}

module.exports = { listarDiagnosticos };
