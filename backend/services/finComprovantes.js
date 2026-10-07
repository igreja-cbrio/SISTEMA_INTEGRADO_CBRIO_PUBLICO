











const { supabase } = require('../utils/supabase');
const { validarArquivoComprovante, nomeExibicao, caminhoNoBucket } = require('../utils/arquivoComprovante');

const BUCKET = 'comprovantes';


const VALIDADE_SEGUNDOS = 15 * 60;






async function subirArquivo({ origemTipo, origemId, arquivo }) {
  const v = validarArquivoComprovante(arquivo);
  if (!v.ok) return { ok: false, erro: v.erro };
  const storage_path = caminhoNoBucket(origemTipo, origemId, v.ext);
  const { error } = await supabase.storage.from(BUCKET)
    .upload(storage_path, arquivo.buffer, { contentType: v.mime, upsert: false });
  if (error) return { ok: false, erro: `Não foi possível salvar o arquivo: ${error.message}` };
  return {
    ok: true,
    info: {
      storage_path,
      nome: nomeExibicao(arquivo.originalname, v.ext),
      mime: v.mime,
      tamanho: v.tamanho,
      sha256: v.sha256,
    },
  };
}



async function removerArquivo(storagePath) {
  if (!storagePath) return;
  try {
    const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
    if (error) console.warn('[COMPROVANTES] remover órfão:', error.message);
  } catch (e) { console.warn('[COMPROVANTES] remover órfão:', e.message); }
}


async function assinarCaminhos(caminhos) {
  const unicos = [...new Set((caminhos || []).filter(Boolean))];
  const mapa = new Map();
  if (!unicos.length) return mapa;
  for (let i = 0; i < unicos.length; i += 100) {
    const lote = unicos.slice(i, i + 100);
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(lote, VALIDADE_SEGUNDOS);
    if (error) throw new Error(`Falha ao assinar comprovantes: ${error.message}`);
    for (const d of data || []) {
      if (d && d.path && d.signedUrl) mapa.set(d.path, d.signedUrl);
    }
  }
  return mapa;
}







async function mesmosArquivos(sha256, origemId) {
  if (!sha256) return [];
  const { data, error } = await supabase.from('fin_comprovantes')
    .select('id, origem_tipo, origem_id, pasta, created_at')
    .eq('sha256', sha256).is('deleted_at', null).neq('origem_id', origemId).limit(5);
  if (error) { console.warn('[COMPROVANTES] sha duplicado:', error.message); return null; }
  return data || [];
}






async function registrarComprovante({ origemTipo, origemId, pasta, info, por }) {
  const anterior = await supabase.from('fin_comprovantes')
    .update({ deleted_at: new Date().toISOString() })
    .eq('origem_tipo', origemTipo).eq('origem_id', origemId).eq('pasta', pasta)
    .is('deleted_at', null).select('id');
  if (anterior.error) throw anterior.error;

  const linha = {
    origem_tipo: origemTipo, origem_id: origemId, pasta,
    storage_path: info.storage_path, nome: info.nome, mime: info.mime,
    tamanho: info.tamanho, sha256: info.sha256, criado_por: por || null,
  };
  const { data, error } = await supabase.from('fin_comprovantes').insert(linha).select('*').single();
  if (error) throw error;
  return { comprovante: data, substituidos: (anterior.data || []).length };
}


async function comprovantesDe(origemTipo, origemIds) {
  const ids = [...new Set((origemIds || []).filter(Boolean))];
  const mapa = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from('fin_comprovantes')
      .select('*').eq('origem_tipo', origemTipo).in('origem_id', ids.slice(i, i + 200)).is('deleted_at', null);
    if (error) throw error;
    for (const c of data || []) {
      if (!mapa.has(c.origem_id)) mapa.set(c.origem_id, []);
      mapa.get(c.origem_id).push(c);
    }
  }
  return mapa;
}

module.exports = {
  BUCKET,
  VALIDADE_SEGUNDOS,
  subirArquivo,
  removerArquivo,
  assinarCaminhos,
  mesmosArquivos,
  registrarComprovante,
  comprovantesDe,
};
