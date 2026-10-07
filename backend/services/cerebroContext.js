

















const { getGraphToken } = require('./storageService');

const HUB_SITE_ID = 'infracbrio.sharepoint.com,04b50f10-ea32-40ba-84bd-44a3b38ee2a7,94fe6af6-f064-455d-afc5-67a377f5e82c';
const VAULT_NAME = 'Cerebro CBRio';



const DEFAULT_MAX_CHARS = 200_000;


let _cache = null;
let _cacheExpiry = 0;
const CACHE_TTL_MS = 15 * 60 * 1000;


const DOWNLOAD_CONCURRENCY = 6;




async function graphFetch(url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Graph ${res.status} ${url.slice(0, 120)}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function obterVaultDriveId(token) {
  const data = await graphFetch(`https://graph.microsoft.com/v1.0/sites/${HUB_SITE_ID}/drives`, token);
  const drive = (data.value || []).find(d => d.name === VAULT_NAME);
  if (!drive) throw new Error(`Biblioteca "${VAULT_NAME}" não encontrada no CBRio Hub`);
  return drive.id;
}


async function listarMarkdownsRecursivo(token, driveId) {
  const itens = [];
  const fila = [{ pasta: 'root', caminho: '' }];

  while (fila.length > 0) {
    const { pasta, caminho } = fila.shift();
    const url = pasta === 'root'
      ? `https://graph.microsoft.com/v1.0/drives/${driveId}/root/children?$top=200&$select=id,name,size,folder,file,lastModifiedDateTime`
      : `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${pasta}/children?$top=200&$select=id,name,size,folder,file,lastModifiedDateTime`;

    let next = url;
    while (next) {
      const page = await graphFetch(next, token);
      for (const it of page.value || []) {
        if (it.folder) {
          fila.push({ pasta: it.id, caminho: caminho ? `${caminho}/${it.name}` : it.name });
        } else if (it.file && it.name.toLowerCase().endsWith('.md')) {

          if (it.name === 'AGENTE-REGRAS.md') continue;
          itens.push({
            itemId: it.id,
            nome: it.name,
            caminho: caminho ? `${caminho}/${it.name}` : it.name,
            tamanho: it.size || 0,
            modificadoEm: it.lastModifiedDateTime,
          });
        }
      }
      next = page['@odata.nextLink'] || null;
    }
  }


  itens.sort((a, b) => (b.modificadoEm || '').localeCompare(a.modificadoEm || ''));
  return itens;
}

async function baixarConteudo(token, driveId, itemId) {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/content`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Download falhou (${res.status}) item ${itemId}`);
  return res.text();
}


async function executarComConcorrencia(itens, fn, concorrencia) {
  const resultados = new Array(itens.length);
  let proximo = 0;

  async function worker() {
    while (true) {
      const idx = proximo++;
      if (idx >= itens.length) return;
      try {
        resultados[idx] = { ok: true, valor: await fn(itens[idx], idx) };
      } catch (e) {
        resultados[idx] = { ok: false, erro: e.message };
      }
    }
  }

  const workers = Array.from({ length: Math.min(concorrencia, itens.length) }, () => worker());
  await Promise.all(workers);
  return resultados;
}




async function _coletarCompleto(maxChars) {
  const t0 = Date.now();
  const token = await getGraphToken();
  const driveId = await obterVaultDriveId(token);
  const lista = await listarMarkdownsRecursivo(token, driveId);

  if (lista.length === 0) {
    return {
      textoCompleto: '',
      totalNotas: 0,
      notasIncluidas: 0,
      totalChars: 0,
      truncado: false,
      duracaoMs: Date.now() - t0,
    };
  }


  const conteudos = await executarComConcorrencia(
    lista,
    (n) => baixarConteudo(token, driveId, n.itemId),
    DOWNLOAD_CONCURRENCY
  );


  const partes = [];
  let totalChars = 0;
  let notasIncluidas = 0;
  let truncado = false;

  for (let i = 0; i < lista.length; i++) {
    const r = conteudos[i];
    if (!r || !r.ok) continue;
    const corpo = String(r.valor || '').trim();
    if (!corpo) continue;

    const bloco = `\n\n## ${lista[i].caminho}\n\n${corpo}\n`;
    if (totalChars + bloco.length > maxChars) {
      truncado = true;
      break;
    }
    partes.push(bloco);
    totalChars += bloco.length;
    notasIncluidas++;
  }

  return {
    textoCompleto: partes.join(''),
    totalNotas: lista.length,
    notasIncluidas,
    totalChars,
    truncado,
    duracaoMs: Date.now() - t0,
  };
}

async function coletarContextoCompleto({ maxChars = DEFAULT_MAX_CHARS, ignorarCache = false } = {}) {
  if (!ignorarCache && _cache && Date.now() < _cacheExpiry) {
    return { ..._cache, doCache: true };
  }

  const resultado = await _coletarCompleto(maxChars);
  _cache = resultado;
  _cacheExpiry = Date.now() + CACHE_TTL_MS;
  return { ...resultado, doCache: false };
}

function bustCache() {
  _cache = null;
  _cacheExpiry = 0;
}

module.exports = {
  coletarContextoCompleto,
  bustCache,
  DEFAULT_MAX_CHARS,
};
