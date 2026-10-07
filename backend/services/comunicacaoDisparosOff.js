











const { supabase } = require('../utils/supabase');

const CACHE_MS = 60 * 1000;
let cache = { em: 0, ids: new Set() };

async function listarDesligados() {
  if (Date.now() - cache.em < CACHE_MS) return cache.ids;
  try {
    const { data, error } = await supabase.from('whatsapp_config')
      .select('disparos_off').eq('id', 1).maybeSingle();
    if (!error) {
      const ids = Array.isArray(data?.disparos_off) ? data.disparos_off : [];
      cache = { em: Date.now(), ids: new Set(ids.map(String)) };
    }
  } catch {                 }
  return cache.ids;
}

async function disparoDesligado(id) {
  const ids = await listarDesligados();
  return ids.has(String(id));
}


async function setDisparo(id, ativo) {
  const atual = [...await listarDesligados()];
  const semEle = atual.filter(x => x !== String(id));
  const novos = ativo ? semEle : [...semEle, String(id)];
  const { error } = await supabase.from('whatsapp_config')
    .update({ disparos_off: novos }).eq('id', 1);
  if (error) return { ok: false, erro: error.message };
  cache = { em: Date.now(), ids: new Set(novos) };
  return { ok: true, desligados: novos };
}

module.exports = { disparoDesligado, listarDesligados, setDisparo };
