export const APP_UPDATE_RETRY_PARAM = '_chunk_retry';
export const APP_UPDATE_RETRY_STARTED_PARAM = '_chunk_retry_at';
export const APP_UPDATE_CACHE_BUSTER_PARAM = '_cb';
export const MAX_APP_UPDATE_RETRIES = 3;
export const APP_UPDATE_RETRY_WINDOW_MS = 60_000;

const CACHE_CLEANUP_TIMEOUT_MS = 1200;
const HTTP_CACHE_PURGE_TIMEOUT_MS = 4000;
const MAX_ASSETS_PURGAR = 20;
const VERSION_CHECK_PARAM = '_version_check';
const LEGACY_RETRY_KEYS = new Set(['boundary-chunk-retry']);

let reloadInProgress = false;

type AppUpdateRuntime = {
  getHref?: () => string;
  refreshCaches?: () => Promise<void>;
  replace?: (url: string) => void;
  reload?: () => void;
  assetsComFalha?: () => string[];
  purgarCacheHttp?: (urls: string[]) => Promise<void>;
};



























const ASSET_URL_RE = /(?:https?:\/\/[^\s"'()<>]+)?\/assets\/[^\s"'()<>]+/;

const assetsComFalha = new Set<string>();

function normalizarUrlDeAsset(
  candidata: string | null | undefined,
  origin = window.location.origin,
): string | null {
  if (!candidata) return null;
  try {
    const url = new URL(candidata, origin);
    if (url.origin !== origin || !url.pathname.startsWith('/assets/')) return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

export function extrairUrlDeAsset(mensagem: string | null | undefined): string | null {
  const match = ASSET_URL_RE.exec(mensagem || '');
  return match ? match[0].replace(/[.,;:]+$/, '') : null;
}

export function registrarAssetComFalha(candidata: string | null | undefined) {
  const url = normalizarUrlDeAsset(candidata);
  if (url) assetsComFalha.add(url);
}

export function registrarErroDeChunk(mensagem: string | null | undefined) {
  registrarAssetComFalha(extrairUrlDeAsset(mensagem));
}

type EntradaDeRecurso = PerformanceResourceTiming & { responseStatus?: number };

function assetsComFalhaNoResourceTiming(): string[] {
  try {
    if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') return [];
    return (performance.getEntriesByType('resource') as EntradaDeRecurso[])
      .filter((entrada) => {
        const status = entrada.responseStatus;
        if (typeof status === 'number' && status > 0) return status >= 400;


        return entrada.transferSize === 0 && entrada.encodedBodySize === 0 && entrada.decodedBodySize === 0;
      })
      .map((entrada) => normalizarUrlDeAsset(entrada.name))
      .filter((url): url is string => Boolean(url));
  } catch {
    return [];
  }
}

export function coletarAssetsComFalha(): string[] {
  const todos = new Set<string>([...assetsComFalha, ...assetsComFalhaNoResourceTiming()]);
  return [...todos].slice(0, MAX_ASSETS_PURGAR);
}

async function purgarCacheHttpDosAssets(urls: string[]) {
  if (typeof fetch !== 'function') return;
  await Promise.allSettled(urls.map(async (url) => {
    const resposta = await fetch(url, { cache: 'reload', credentials: 'same-origin' });


    await resposta.arrayBuffer();
  }));
}

export function getAppUpdateRetryCount(
  href = window.location.href,
  now = Date.now(),
): number {
  try {
    const url = new URL(href);
    const count = Math.max(0, parseInt(url.searchParams.get(APP_UPDATE_RETRY_PARAM) || '0', 10) || 0);
    const startedAt = Math.max(0, parseInt(url.searchParams.get(APP_UPDATE_RETRY_STARTED_PARAM) || '0', 10) || 0);
    if (startedAt && now - startedAt > APP_UPDATE_RETRY_WINDOW_MS) return 0;
    return count;
  } catch {
    return 0;
  }
}

export function buildAppUpdateUrl(
  href: string,
  options: { resetRetries?: boolean; now?: number } = {},
): string {
  const url = new URL(href);
  const now = options.now ?? Date.now();
  const currentRetryCount = getAppUpdateRetryCount(href, now);
  const currentStartedAt = Math.max(
    0,
    parseInt(url.searchParams.get(APP_UPDATE_RETRY_STARTED_PARAM) || '0', 10) || 0,
  );
  const retryCount = options.resetRetries ? 1 : currentRetryCount + 1;
  const startedAt = options.resetRetries || currentRetryCount === 0 || !currentStartedAt
    ? now
    : currentStartedAt;

  url.searchParams.set(APP_UPDATE_RETRY_PARAM, String(retryCount));
  url.searchParams.set(APP_UPDATE_RETRY_STARTED_PARAM, String(startedAt));
  url.searchParams.set(APP_UPDATE_CACHE_BUSTER_PARAM, String(now));
  return url.toString();
}














export function buildCleanUrl(href = window.location.href): string {
  try {
    const url = new URL(href);
    url.searchParams.delete(APP_UPDATE_RETRY_PARAM);
    url.searchParams.delete(APP_UPDATE_RETRY_STARTED_PARAM);
    url.searchParams.delete(APP_UPDATE_CACHE_BUSTER_PARAM);
    return url.toString();
  } catch {
    return href;
  }
}

function clearLegacyRetryFlags() {
  try {
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith('chunk-retry-') || LEGACY_RETRY_KEYS.has(key))
      .forEach((key) => sessionStorage.removeItem(key));
  } catch {

  }
}

async function refreshBrowserManagedCaches() {
  const tasks: Promise<unknown>[] = [];



  if ('caches' in window) {
    tasks.push((async () => {
      const keys = await window.caches.keys();
      await Promise.all(keys.map((key) => window.caches.delete(key)));
    })());
  }



  if ('serviceWorker' in navigator) {
    tasks.push((async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.update()));
    })());
  }

  await Promise.allSettled(tasks);
}

export async function reloadForAppUpdate(
  options: { resetRetries?: boolean } = {},
  runtime: AppUpdateRuntime = {},
) {
  if (reloadInProgress && !options.resetRetries) return;
  reloadInProgress = true;

  clearLegacyRetryFlags();



  const urlsParaPurgar = runtime.assetsComFalha?.() ?? coletarAssetsComFalha();
  if (urlsParaPurgar.length > 0) {
    try {
      await Promise.race([
        (runtime.purgarCacheHttp ?? purgarCacheHttpDosAssets)(urlsParaPurgar),
        new Promise((resolve) => setTimeout(resolve, HTTP_CACHE_PURGE_TIMEOUT_MS)),
      ]);
    } catch {

    }
    assetsComFalha.clear();
  }



  try {
    await Promise.race([
      runtime.refreshCaches?.() ?? refreshBrowserManagedCaches(),
      new Promise((resolve) => setTimeout(resolve, CACHE_CLEANUP_TIMEOUT_MS)),
    ]);
  } catch {

  }

  try {
    const href = runtime.getHref?.() ?? window.location.href;
    const replace = runtime.replace ?? window.location.replace.bind(window.location);
    replace(buildAppUpdateUrl(href, options));
  } catch {
    const reload = runtime.reload ?? window.location.reload.bind(window.location);
    reload();
  }
}

function normalizeEntryScript(src: string | null, baseHref: string): string | null {
  if (!src) return null;
  try {
    const url = new URL(src, baseHref);
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

export function getEntryScriptFromHtml(html: string, baseHref = window.location.href): string | null {
  try {
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const src = parsed.querySelector<HTMLScriptElement>('script[type="module"][src]')
      ?.getAttribute('src') ?? null;
    return normalizeEntryScript(src, baseHref);
  } catch {
    return null;
  }
}

export function getCurrentEntryScript(baseHref = window.location.href): string | null {
  const src = document.querySelector<HTMLScriptElement>('script[type="module"][src]')
    ?.getAttribute('src') ?? null;
  return normalizeEntryScript(src, baseHref);
}

export async function hasNewAppVersion(): Promise<boolean> {
  const currentEntry = getCurrentEntryScript();
  if (!currentEntry) return false;

  try {
    const checkUrl = new URL('/index.html', window.location.origin);
    checkUrl.searchParams.set(VERSION_CHECK_PARAM, String(Date.now()));

    const response = await fetch(checkUrl.toString(), {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });
    if (!response.ok) return false;

    const latestEntry = getEntryScriptFromHtml(await response.text(), checkUrl.toString());
    return Boolean(latestEntry && latestEntry !== currentEntry);
  } catch {

    return false;
  }
}
