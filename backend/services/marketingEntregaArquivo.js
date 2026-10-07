'use strict';










const { supabase } = require('../utils/supabase');
const storage = require('./storageService');

const GRAPH = 'https://graph.microsoft.com/v1.0';
const TABELA = 'marketing_entrega_arquivos';
const COLS = 'id, origem, checklist_item_id, card_id, compromisso_id, membro_id, semana_inicio, nome_arquivo, tamanho_bytes, web_url, enviado_por, enviado_em, deleted_at';
const MIGRATION = '20261005150000_mkt_entrega_arquivos.sql';


const MIGRATION_ARQUIVOS = '20261006120000_mkt_arquivos_criativo.sql';

const ehTabelaAusente = (e) => !!e && (e.code === '42P01' || e.code === 'PGRST205');
const ehColunaAusente = (e) => !!e && (e.code === '42703' || e.code === 'PGRST204');

const sharepointPronto = () => !!storage.SHAREPOINT_CONFIGURED;








const SITE_CRIATIVO = 'infracbrio.sharepoint.com:/sites/Criativo';
const BIBLIOTECA_CRIATIVO_URL = 'https://infracbrio.sharepoint.com/sites/Criativo/Documentos%20Compartilhados';
const MIN = 60 * 1000;
let destinoCache = null;



const idDeCompartilhamento = (url) => `u!${Buffer.from(url).toString('base64').replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-')}`;

async function driveDoSiteCriativo(token) {
  const h = { Authorization: `Bearer ${token}` };
  const r1 = await fetch(`${GRAPH}/sites/${SITE_CRIATIVO}:/drive?$select=id,webUrl`, { headers: h });
  if (r1.ok) {
    const j = await r1.json();
    if (j && j.id) return { local: 'criativo', driveId: j.id, webUrl: j.webUrl || BIBLIOTECA_CRIATIVO_URL };
  }
  const r2 = await fetch(`${GRAPH}/shares/${idDeCompartilhamento(BIBLIOTECA_CRIATIVO_URL)}/driveItem?$select=id,parentReference`, { headers: h });
  if (r2.ok) {
    const j = await r2.json();
    const driveId = j && j.parentReference && j.parentReference.driveId;
    if (driveId) return { local: 'criativo', driveId, webUrl: BIBLIOTECA_CRIATIVO_URL };
  }
  throw new Error(`o SharePoint respondeu ${r1.status} e ${r2.status}`);
}

async function driveDoHub(token) {
  const driveId = await storage.getDriveIdByName(storage.MODULE_LIBRARY_MAP.criativo);
  const r = await fetch(`${GRAPH}/drives/${driveId}?$select=webUrl`, { headers: { Authorization: `Bearer ${token}` } });
  const j = r.ok ? await r.json() : null;
  return { local: 'hub', driveId, webUrl: (j && j.webUrl) || null };
}


async function destinoDosArquivos() {
  if (destinoCache && Date.now() < destinoCache.ate) return destinoCache.destino;
  const token = await storage.getGraphToken();
  let destino;
  try {
    destino = await driveDoSiteCriativo(token);
  } catch (e) {
    console.warn('[MARKETING-ARQUIVOS] sem acesso ao site Criativo, indo para o CBRio Hub:', e.message);
    destino = { ...(await driveDoHub(token)), motivo: e.message };
  }
  destinoCache = { destino, ate: Date.now() + (destino.local === 'criativo' ? 60 : 5) * MIN };
  return destino;
}



async function pastaJaUsadaPelaTarefa({ cardId, driveId }) {
  if (!cardId) return null;
  const { data, error } = await supabase.from(TABELA).select('pasta')
    .eq('card_id', cardId).eq('drive_id', driveId).is('deleted_at', null)
    .order('enviado_em', { ascending: true }).limit(1);
  if (error) {
    if (ehTabelaAusente(error)) return null;
    throw error;
  }
  return (data && data[0] && data[0].pasta) || null;
}



async function nomesNaPasta({ pasta }) {
  const { data, error } = await lerPaginado(() => supabase.from(TABELA).select('nome_arquivo').eq('pasta', pasta));
  if (error) {
    if (ehTabelaAusente(error)) return [];
    throw error;
  }
  return (data || []).map(r => r.nome_arquivo);
}



async function criarPasta({ driveId, pasta }) {
  const seg = String(pasta || '').split('/').filter(Boolean);
  const nome = seg.pop();
  if (!nome) throw new Error('Pasta vazia');
  const token = await storage.getGraphToken();
  const pai = seg.length ? `root:/${caminhoGraph(...seg)}:` : 'root';
  const r = await fetch(`${GRAPH}/drives/${driveId}/${pai}/children`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nome, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
  });
  if (r.status === 409) return 'existia';
  if (!r.ok) throw new Error(`O SharePoint recusou criar a pasta "${pasta}" (${r.status})`);
  return 'criada';
}




async function linkDeDownload({ driveId, itemId }) {
  const token = await storage.getGraphToken();
  const r = await fetch(`${GRAPH}/drives/${driveId}/items/${encodeURIComponent(itemId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`O SharePoint não respondeu sobre o arquivo (${r.status})`);
  const j = await r.json();
  return (j && j['@microsoft.graph.downloadUrl']) || null;
}

const caminhoGraph = (...partes) => partes.join('/').split('/').filter(Boolean).map(encodeURIComponent).join('/');

async function criarSessaoDeEnvio({ driveId, pasta, nomeArquivo }) {
  const token = await storage.getGraphToken();
  const r = await fetch(`${GRAPH}/drives/${driveId}/root:/${caminhoGraph(pasta, nomeArquivo)}:/createUploadSession`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },

    body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'rename' } }),
  });
  if (!r.ok) throw new Error(`O SharePoint recusou abrir o envio (${r.status})`);
  const j = await r.json();
  if (!j.uploadUrl) throw new Error('O SharePoint não devolveu o endereço do envio');
  return { uploadUrl: j.uploadUrl };
}


async function lerItemDoDrive({ driveId, itemId }) {
  const token = await storage.getGraphToken();
  const r = await fetch(`${GRAPH}/drives/${driveId}/items/${encodeURIComponent(itemId)}?$select=id,name,webUrl,size,file,parentReference`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`O SharePoint não respondeu sobre o arquivo (${r.status})`);
  return r.json();
}

async function lerPaginado(montar) {
  const out = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await montar().order('id').range(de, de + 999);
    if (error) return { error };
    out.push(...(data || []));
    if (!data || data.length < 1000) return { data: out };
  }
}



async function arquivosDasEntregas({ itemIds = [], compromissoIds = [] } = {}) {
  const out = [];
  const lotes = [
    ['checklist_item_id', [...new Set(itemIds.filter(Boolean))]],
    ['compromisso_id', [...new Set(compromissoIds.filter(Boolean))]],
  ];
  for (const [coluna, ids] of lotes) {
    for (let i = 0; i < ids.length; i += 200) {
      const lote = ids.slice(i, i + 200);
      const { data, error } = await lerPaginado(() => supabase.from(TABELA).select(COLS).in(coluna, lote).is('deleted_at', null));
      if (error) {
        if (ehTabelaAusente(error)) return null;
        throw new Error(`${TABELA}: ${error.message}`);
      }
      out.push(...data);
    }
  }
  return out;
}


async function recursoDisponivel() {
  const { error } = await supabase.from(TABELA).select('id').limit(1);
  if (!error) return true;
  if (ehTabelaAusente(error)) return false;
  throw error;
}



async function arvoreNovaDisponivel() {
  const { error } = await supabase.from(TABELA).select('categoria, plano_id').limit(1);
  if (!error) return true;
  if (ehTabelaAusente(error) || ehColunaAusente(error)) return false;
  throw error;
}





async function arquivosDaPagina({ soCiclo = false } = {}) {
  const { data, error } = await lerPaginado(() => {
    let q = supabase.from(TABELA).select('*').is('deleted_at', null);
    if (soCiclo) q = q.eq('origem', 'ciclo');
    return q;
  });
  if (error) {
    if (ehTabelaAusente(error)) return null;
    throw error;
  }
  return data;
}



async function exigeArquivoDosCompromissos(ids = []) {
  const unicos = [...new Set(ids.filter(Boolean))];
  const out = {};
  for (let i = 0; i < unicos.length; i += 200) {
    const { data, error } = await supabase.from('marketing_compromissos_recorrentes')
      .select('id, exige_arquivo').in('id', unicos.slice(i, i + 200));
    if (error) {
      if (ehColunaAusente(error)) return {};
      throw error;
    }
    for (const c of data || []) if (c.exige_arquivo === true) out[c.id] = true;
  }
  return out;
}


async function contarArquivos(alvo) {
  let q = supabase.from(TABELA).select('id', { count: 'exact', head: true }).is('deleted_at', null);
  q = alvo.itemId
    ? q.eq('checklist_item_id', alvo.itemId)
    : q.eq('compromisso_id', alvo.compromissoId).eq('membro_id', alvo.membroId).eq('semana_inicio', alvo.semanaInicio);
  const { count, error } = await q;
  if (error) {
    if (ehTabelaAusente(error)) return null;
    throw error;
  }
  return count || 0;
}

module.exports = {
  TABELA, MIGRATION, ehTabelaAusente, ehColunaAusente, sharepointPronto, destinoDosArquivos,
  pastaJaUsadaPelaTarefa, nomesNaPasta, criarPasta, linkDeDownload, MIGRATION_ARQUIVOS, arvoreNovaDisponivel, arquivosDaPagina,
  criarSessaoDeEnvio, lerItemDoDrive, arquivosDasEntregas, recursoDisponivel,
  exigeArquivoDosCompromissos, contarArquivos,
};
