

















const { diaBRT } = require('./volDisponibilidade');

const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];









const ANTECEDENCIA_PADRAO_DIAS = 1;
const ANTECEDENCIA_KIDS_DIAS = 3;


function _chaveArea(v) {
  return String(v == null ? '' : v)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().toLowerCase();
}










function ehEscalaKids(escala) {
  return _chaveArea(escala?.team_area).includes('kid');
}


function antecedenciaDaEscala(escala) {
  return ehEscalaKids(escala) ? ANTECEDENCIA_KIDS_DIAS : ANTECEDENCIA_PADRAO_DIAS;
}










function antecedenciaDoGrupo(escalas) {
  return (escalas || []).reduce((m, e) => Math.max(m, antecedenciaDaEscala(e)), ANTECEDENCIA_PADRAO_DIAS);
}


function chavePessoa(escala) {
  return escala?.volunteer_id || escala?.planning_center_person_id || null;
}








function elegivelParaAviso(escala, agoraISO, dias, diasAlvo) {
  if (!escala || !chavePessoa(escala)) return false;
  if (escala.confirmation_status === 'declined') return false;
  const quando = new Date(escala.scheduled_at).getTime();
  const agora = new Date(agoraISO).getTime();
  if (!Number.isFinite(quando) || !Number.isFinite(agora)) return false;
  if (quando < agora) return false;





  if (diasAlvo && diasAlvo.size) {
    if (!diasAlvo.has(diaBRT(escala.scheduled_at))) return false;
  }
  return quando <= agora + dias * 86400000;
}











function textoQuando(iso, horarios, omitirDia = false) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';

  const brt = new Date(d.getTime() - 3 * 3600000);
  const dia = DIAS_SEMANA[brt.getUTCDay()];
  const data = `${String(brt.getUTCDate()).padStart(2, '0')}/${String(brt.getUTCMonth() + 1).padStart(2, '0')}`;
  const inicio = omitirDia ? data : `${dia}, ${data}`;
  const hs = [...new Set(horarios || [])].sort();
  if (!hs.length) return inicio;
  const lista = hs.length === 1 ? hs[0] : `${hs.slice(0, -1).join(', ')} e ${hs[hs.length - 1]}`;
  return `${inicio}, às ${lista}`;
}









function nomeJaDizODia(nome, iso) {
  const d = new Date(iso);
  if (!nome || !Number.isFinite(d.getTime())) return false;
  const brt = new Date(d.getTime() - 3 * 3600000);
  const dia = DIAS_SEMANA[brt.getUTCDay()];
  const n = _norm(nome);

  const raiz = _norm(dia).split('-')[0];
  return n.includes(raiz);
}


function _norm(v) {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}


function horaBRT(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const brt = new Date(d.getTime() - 3 * 3600000);
  return `${String(brt.getUTCHours()).padStart(2, '0')}:${String(brt.getUTCMinutes()).padStart(2, '0')}`;
}


function textoAreas(areas) {
  const u = [...new Set((areas || []).filter(Boolean))];
  if (!u.length) return 'Voluntariado';
  if (u.length === 1) return u[0];
  return `${u.slice(0, -1).join(', ')} e ${u[u.length - 1]}`;
}


function textoEvento(nomes) {
  const u = [...new Set((nomes || []).filter(Boolean))];
  if (!u.length) return 'culto';
  if (u.length === 1) return u[0];
  return `${u.length} cultos`;
}







function agruparParaAviso({ escalas, agora, dias = 7, diasAlvo = null, porAntecedencia = false }) {
  const alvo = diasAlvo ? (diasAlvo instanceof Set ? diasAlvo : new Set(diasAlvo)) : null;
  const grupos = new Map();
  for (const e of escalas || []) {




    if (!elegivelParaAviso(e, agora, dias, porAntecedencia ? null : alvo)) continue;
    const pessoa = chavePessoa(e);
    const dia = diaBRT(e.scheduled_at);
    const k = `${pessoa}::${dia}`;
    if (!grupos.has(k)) {
      grupos.set(k, {
        chave: k, pessoa, dia,
        nome: e.volunteer_name || null,
        volunteer_id: e.volunteer_id || null,
        planning_center_person_id: e.planning_center_person_id || null,
        escala_ids: [], areas: [], cultos: [], horarios: [],
        _escalas: [],
        primeiro: e.scheduled_at,
      });
    }
    const g = grupos.get(k);
    g._escalas.push(e);
    g.escala_ids.push(e.id);
    if (e.team_name) g.areas.push(e.team_name);
    if (e.service_name) g.cultos.push(e.service_name);
    g.horarios.push(horaBRT(e.scheduled_at));
    if (e.scheduled_at < g.primeiro) g.primeiro = e.scheduled_at;
  }

  return [...grupos.values()]
    .map(g => ({ ...g, antecedencia: antecedenciaDoGrupo(g._escalas), kids: g._escalas.some(ehEscalaKids) }))














    .filter(g => !porAntecedencia || diaBRT(g.primeiro) <= diaRelativoBRT(agora, g.antecedencia))
    .map(g => ({
      ...g,
      params: (() => {
        const evento = textoEvento(g.cultos);


        const omitir = g.cultos.length > 0 && nomeJaDizODia(evento, g.primeiro);
        return [textoAreas(g.areas), evento, textoQuando(g.primeiro, g.horarios, omitir)];
      })(),
    }))


    .sort((a, b) => String(a.primeiro).localeCompare(String(b.primeiro)));
}














function selecionarRodada({ grupos, jaAvisados, telefonePorPessoa, teto = 200 }) {
  const avisados = jaAvisados instanceof Set ? jaAvisados : new Set(jaAvisados || []);
  const fones = telefonePorPessoa instanceof Map ? telefonePorPessoa : new Map(Object.entries(telefonePorPessoa || {}));

  const pendentes = [];
  let ja_avisados = 0;
  const sem_telefone = [];

  for (const g of grupos || []) {
    if (g.escala_ids.some(id => avisados.has(id))) { ja_avisados++; continue; }
    const telefone = fones.get(g.pessoa) || null;
    if (!telefone) { sem_telefone.push(g); continue; }
    pendentes.push({ ...g, telefone });
  }

  return {
    rodada: pendentes.slice(0, teto),
    adiados: Math.max(0, pendentes.length - teto),
    sem_telefone,
    ja_avisados,
  };
}








function diaRelativoBRT(agoraISO, deslocamento) {
  const base = new Date(agoraISO);
  if (!Number.isFinite(base.getTime())) return null;
  return diaBRT(new Date(base.getTime() + (deslocamento || 0) * 86400000));
}

module.exports = {
  chavePessoa, elegivelParaAviso, agruparParaAviso, selecionarRodada,
  textoQuando, textoAreas, textoEvento, horaBRT, diaRelativoBRT, nomeJaDizODia,
  ANTECEDENCIA_PADRAO_DIAS, ANTECEDENCIA_KIDS_DIAS,
  ehEscalaKids, antecedenciaDaEscala, antecedenciaDoGrupo,
};
