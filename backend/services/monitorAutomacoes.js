








const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');
const { classificar, deveAlertar, textoAlerta } = require('../utils/saudeAutomacao');

const HORA = 3600000;



const PIPELINES = [
  { chave: 'fin_sync',     label: 'Sincronização financeira',     tabela: 'fin_transacoes',          coluna: 'created_at', maxHoras: 48,  modulo: 'financeiro' },
  { chave: 'contribuicoes',label: 'Contribuições (dízimos/ofertas)',tabela: 'mem_contribuicoes',      coluna: 'created_at', maxHoras: 72,  modulo: 'financeiro' },
















  { chave: 'youtube_snap', label: 'Snapshot do canal (YouTube)',   tabela: 'online_canal_snapshot',   coluna: 'collected_at', maxHoras: 48,  modulo: 'online' },
  { chave: 'youtube_vids', label: 'Vídeos do YouTube',             tabela: 'online_videos',           coluna: 'collected_at', maxHoras: 72,  modulo: 'online' },
  { chave: 'app_telemetria',label: 'Telemetria do app',            tabela: 'app_eventos',             coluna: 'created_at', maxHoras: 72,  modulo: 'dashboard' },
];



async function recencia(p) {
  try {
    const { data, error } = await supabase
      .from(p.tabela)
      .select(p.coluna)
      .order(p.coluna, { ascending: false })
      .limit(1)
      .maybeSingle();



    return { ...p, ...classificar(p, data?.[p.coluna] || null, error) };
  } catch (e) {
    return { ...p, ...classificar(p, null, e) };
  }
}


async function checarSaude() {
  return Promise.all(PIPELINES.map(recencia));
}



async function checarEAlertar() {
  const saude = await checarSaude();
  const hojeStr = new Date().toISOString().slice(0, 10);
  let count = 0;
  for (const s of saude) {



    if (!deveAlertar(s.status)) continue;
    const t = textoAlerta(s);
    count += await notificar({
      modulo: s.modulo,


      tipo: s.status === 'erro_config' ? 'monitor_mal_configurado' : 'automacao_sem_atualizar',
      titulo: t.titulo,
      mensagem: t.mensagem,
      link: '/admin',
      severidade: t.severidade,
      chaveDedup: `automacao_${s.chave}_${s.status === 'erro_config' ? 'cfg_' : ''}${hojeStr}`,
    });
  }
  return count;
}

module.exports = { checarSaude, checarEAlertar, PIPELINES };
