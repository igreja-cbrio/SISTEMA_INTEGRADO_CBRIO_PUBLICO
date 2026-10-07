
















const TIMEOUT_MS = 5000;
const CACHE_MS = 10000;






async function sondar(client, { timeoutMs = TIMEOUT_MS, agora = Date.now() } = {}) {
  if (!client) return { ok: false, ms: 0, erro: 'sem_client' };
  const t0 = agora;
  try {
    const { error } = await Promise.race([
      client.from('modulos').select('id', { count: 'exact', head: true }).limit(1),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout do health check')), timeoutMs)),
    ]);
    if (error) throw error;
    return { ok: true, ms: Date.now() - t0, erro: null };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, erro: String(e?.message || e).slice(0, 200) };
  }
}









function respostaSaude(sonda) {
  if (sonda && sonda.ok) {
    return { status: 200, corpo: { status: 'ok', latencia_ms: sonda.ms } };
  }
  return {
    status: 503,
    corpo: { status: 'down', latencia_ms: sonda?.ms ?? 0, erro: sonda?.erro || 'desconhecido' },
    retryApos: 30,
  };
}

module.exports = { sondar, respostaSaude, TIMEOUT_MS, CACHE_MS };
