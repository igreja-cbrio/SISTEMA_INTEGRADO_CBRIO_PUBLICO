







const { supabase } = require('../utils/supabase');
require('dotenv').config();

const BUCKET = 'eventos-anexos';
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const SHAREPOINT_CONFIGURED = !!(
  process.env.MICROSOFT_TENANT_ID &&
  process.env.MICROSOFT_CLIENT_ID &&
  process.env.MICROSOFT_CLIENT_SECRET &&
  process.env.SHAREPOINT_SITE_ID
);


const CBRIO_HUB_SITE_ID = 'infracbrio.sharepoint.com,04b50f10-ea32-40ba-84bd-44a3b38ee2a7,94fe6af6-f064-455d-afc5-67a377f5e82c';
const PLANEJAMENTO_DRIVE_ID = 'b!EA-1BDLqukCEvUSjs47ip_Zq_pRk8F1Fr8Vno3f16CycaaIn52TbSKQ7nZOyjaOa';


const MODULE_LIBRARY_MAP = {
  rh: 'Gestão',
  financeiro: 'Gestão',
  logistica: 'Gestão',
  patrimonio: 'Gestão',
  membresia: 'CRM e Pessoas',
  eventos: 'Planejamento',
  criativo: 'Criativo',
  ministerial: 'Ministerial',
  governanca: 'Gestão',
};


const driveCache = {};
let driveCacheExpiry = 0;


let cachedToken = null;
let tokenExpiry = 0;

async function getGraphToken() {
  if (cachedToken && Date.now() < tokenExpiry - 60000) return cachedToken;

  const res = await fetch(`https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Graph auth failed: ${data.error_description || data.error}`);

  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;
  return cachedToken;
}


function sanitizePath(str) {
  return str
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_\-. ]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 100);
}

function buildSupabasePath(eventName, phaseName, fileName) {
  const ev = sanitizePath(eventName);
  const ph = sanitizePath(phaseName || 'geral');
  const fn = sanitizePath(fileName);
  return `${ev}/${ph}/${Date.now()}_${fn}`;
}


const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';


async function listHubDrives() {
  if (Date.now() < driveCacheExpiry && Object.keys(driveCache).length > 0) return driveCache;
  const token = await getGraphToken();
  const res = await fetch(`${GRAPH_BASE}/sites/${CBRIO_HUB_SITE_ID}/drives`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) { const err = await res.text(); throw new Error(`List drives failed ${res.status}: ${err.slice(0, 200)}`); }
  const data = await res.json();
  for (const d of (data.value || [])) { driveCache[d.name] = d.id; }
  driveCacheExpiry = Date.now() + 60 * 60 * 1000;
  return driveCache;
}

async function getDriveIdByName(libraryName) {
  if (driveCache[libraryName] && Date.now() < driveCacheExpiry) return driveCache[libraryName];
  await listHubDrives();
  if (!driveCache[libraryName]) throw new Error(`Biblioteca "${libraryName}" não encontrada no CBRio Hub`);
  return driveCache[libraryName];
}


async function uploadToDrive(driveId, folderPath, fileName, fileBuffer) {
  const safeFolder = folderPath.split('/').map(sanitizePath).join('/');
  const safeName = sanitizePath(fileName);
  await ensureSharePointFolderInDrive(driveId, safeFolder);
  const filePath = `${safeFolder}/${safeName}`;
  const token = await getGraphToken();
  const res = await fetch(`${GRAPH_BASE}/drives/${driveId}/root:/${filePath}:/content`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
    body: fileBuffer,
  });
  if (!res.ok) { const err = await res.text().catch(() => ''); throw new Error(`Upload failed ${res.status}: ${err.slice(0, 200)}`); }
  const data = await res.json();
  return {
    url: data.webUrl || data['@microsoft.graph.downloadUrl'] || '',
    itemId: data.id,
    path: filePath,
    driveId,
    provider: 'sharepoint',
  };
}









async function uploadModuleFile(module, subFolder, fileName, fileBuffer) {
  if (!SHAREPOINT_CONFIGURED) throw new Error('SharePoint não configurado');
  const libraryName = MODULE_LIBRARY_MAP[module];
  if (!libraryName) throw new Error(`Módulo "${module}" não tem biblioteca SharePoint mapeada`);


  const driveId = libraryName === 'Planejamento' ? PLANEJAMENTO_DRIVE_ID : await getDriveIdByName(libraryName);
  return uploadToDrive(driveId, subFolder, fileName, fileBuffer);
}

async function graphRequest(path, opts = {}) {
  const token = await getGraphToken();
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...opts.headers },
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Graph API ${res.status}: ${err.slice(0, 200)}`);
  }
  return res;
}

async function ensureSharePointFolderInDrive(driveId, folderPath) {
  try {
    const token = await getGraphToken();
    await fetch(`${GRAPH_BASE}/drives/${driveId}/root:/${folderPath}`, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    const parts = folderPath.split('/');
    let current = '';
    for (const part of parts) {
      const parentPath = current ? `${GRAPH_BASE}/drives/${driveId}/root:/${current}:/children` : `${GRAPH_BASE}/drives/${driveId}/root/children`;
      try {
        const token = await getGraphToken();
        await fetch(parentPath, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: part, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }) });
      } catch {}
      current = current ? `${current}/${part}` : part;
    }
  }
}

async function ensureSharePointFolder(folderPath) {
  const siteId = process.env.SHAREPOINT_SITE_ID;

  try {
    await graphRequest(`/sites/${siteId}/drive/root:/${folderPath}`);
  } catch {

    const parts = folderPath.split('/');
    let current = '';
    for (const part of parts) {
      const parent = current || 'root';
      const parentPath = current ? `/sites/${siteId}/drive/root:/${current}:/children` : `/sites/${siteId}/drive/root/children`;
      try {
        await graphRequest(parentPath, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: part, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
        });
      } catch {                                }
      current = current ? `${current}/${part}` : part;
    }
  }
}

async function uploadToSharePoint(eventName, phaseName, fileName, fileBuffer) {
  const driveId = PLANEJAMENTO_DRIVE_ID;
  const folder = `Eventos/${sanitizePath(eventName)}/${sanitizePath(phaseName || 'geral')}`;
  const safeName = sanitizePath(fileName);


  await ensureSharePointFolderInDrive(driveId, folder);

  const filePath = `${folder}/${safeName}`;
  const token = await getGraphToken();
  const res = await fetch(`${GRAPH_BASE}/drives/${driveId}/root:/${filePath}:/content`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
    body: fileBuffer,
  });
  if (!res.ok) { const err = await res.text().catch(() => ''); throw new Error(`Upload failed ${res.status}: ${err.slice(0, 200)}`); }
  const data = await res.json();

  return {
    url: data.webUrl || data['@microsoft.graph.downloadUrl'] || '',
    itemId: data.id,
    path: filePath,
    provider: 'sharepoint',
  };
}

async function downloadFromSharePoint(itemId) {

  let metaRes;
  try {
    metaRes = await graphRequest(`/drives/${PLANEJAMENTO_DRIVE_ID}/items/${itemId}`);
  } catch {
    const siteId = process.env.SHAREPOINT_SITE_ID;
    metaRes = await graphRequest(`/sites/${siteId}/drive/items/${itemId}`);
  }
  const meta = await metaRes.json();
  const downloadUrl = meta['@microsoft.graph.downloadUrl'];
  if (!downloadUrl) throw new Error('Download URL not available');

  const fileRes = await fetch(downloadUrl);
  const arrayBuffer = await fileRes.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function deleteFromSharePoint(itemId) {
  try {
    await graphRequest(`/drives/${PLANEJAMENTO_DRIVE_ID}/items/${itemId}`, { method: 'DELETE' });
  } catch {
    const siteId = process.env.SHAREPOINT_SITE_ID;
    await graphRequest(`/sites/${siteId}/drive/items/${itemId}`, { method: 'DELETE' });
  }
}



async function uploadFile(eventName, phaseName, fileName, fileBuffer, mimeType) {
  if (fileBuffer.length > MAX_FILE_SIZE) {
    throw new Error(`Arquivo excede o limite de ${MAX_FILE_SIZE / 1024 / 1024}MB`);
  }


  if (SHAREPOINT_CONFIGURED) {
    try {
      return await uploadToSharePoint(eventName, phaseName, fileName, fileBuffer);
    } catch (e) {
      console.error('[Storage] SharePoint upload failed, falling back to Supabase:', e.message);
    }
  }


  const path = buildSupabasePath(eventName, phaseName, fileName);
  const { error } = await supabase.storage.from(BUCKET).upload(path, fileBuffer, {
    contentType: mimeType || 'application/octet-stream',
    upsert: false,
  });
  if (error) throw new Error(`Upload error: ${error.message}`);

  return { url: '', path, provider: 'supabase', pendingSync: SHAREPOINT_CONFIGURED };
}

async function downloadFile(supabasePath, sharepointItemId) {

  if (sharepointItemId && SHAREPOINT_CONFIGURED) {
    try {
      return await downloadFromSharePoint(sharepointItemId);
    } catch (e) {
      console.error('[Storage] SharePoint download failed:', e.message);
    }
  }


  if (!supabasePath) throw new Error('No file path available');
  const { data, error } = await supabase.storage.from(BUCKET).download(supabasePath);
  if (error) throw new Error(`Download error: ${error.message}`);
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function deleteFile(supabasePath, sharepointItemId) {
  if (sharepointItemId && SHAREPOINT_CONFIGURED) {
    try { await deleteFromSharePoint(sharepointItemId); } catch (e) {
      console.error('[Storage] SharePoint delete failed:', e.message);
    }
  }
  if (supabasePath) {
    try { await supabase.storage.from(BUCKET).remove([supabasePath]); } catch {}
  }
}

async function getSignedUrl(supabasePath) {
  if (!supabasePath) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(supabasePath, 3600);
  if (error) return null;
  return data.signedUrl;
}






async function syncPendingToSharePoint() {
  if (!SHAREPOINT_CONFIGURED) return { synced: 0, failed: 0, message: 'SharePoint não configurado' };


  const { data: pending } = await supabase.from('event_task_attachments')
    .select('id, supabase_path, file_name, file_type, event_id, phase_name')
    .not('supabase_path', 'is', null)
    .is('sharepoint_item_id', null)
    .limit(20);

  if (!pending || pending.length === 0) return { synced: 0, failed: 0, message: 'Nenhum pendente' };

  let synced = 0, failed = 0;

  for (const att of pending) {
    try {

      const { data: event } = await supabase.from('events').select('name').eq('id', att.event_id).single();
      const eventName = event?.name || att.event_id;


      const { data: fileData, error: dlErr } = await supabase.storage.from(BUCKET).download(att.supabase_path);
      if (dlErr) throw new Error(dlErr.message);
      const buffer = Buffer.from(await fileData.arrayBuffer());


      const result = await uploadToSharePoint(eventName, att.phase_name || '', att.file_name, buffer);


      await supabase.from('event_task_attachments').update({
        sharepoint_url: result.url,
        sharepoint_item_id: result.itemId,
      }).eq('id', att.id);




      synced++;
      console.log(`[Sync] ${att.file_name} → SharePoint OK`);
    } catch (e) {
      failed++;
      console.error(`[Sync] ${att.file_name} failed:`, e.message);
    }
  }

  return { synced, failed, total: pending.length, message: `${synced} sincronizado(s), ${failed} falha(s)` };
}

module.exports = {
  uploadFile, downloadFile, deleteFile, getSignedUrl, syncPendingToSharePoint,
  getGraphToken, ensureSharePointFolder, ensureSharePointFolderInDrive, sanitizePath,
  uploadModuleFile, uploadToDrive, getDriveIdByName, listHubDrives,
  MAX_FILE_SIZE, SHAREPOINT_CONFIGURED, PLANEJAMENTO_DRIVE_ID, CBRIO_HUB_SITE_ID, MODULE_LIBRARY_MAP,
};
