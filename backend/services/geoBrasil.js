



















const UA = 'CBRio-Sistema/1.0 (contato@cbrio.com.br)';

const NOMINATIM_INTERVALO_MS = 1100;
const TIMEOUT_VIACEP_MS = 4000;
const TIMEOUT_NOMINATIM_MS = 8000;




const CAIXA_RJ = { latMax: -21.8, latMin: -23.6, lngMax: -42.4, lngMin: -44.3 };

const dentroDoRio = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng)
  && lat <= CAIXA_RJ.latMax && lat >= CAIXA_RJ.latMin
  && lng <= CAIXA_RJ.lngMax && lng >= CAIXA_RJ.lngMin;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));



let filaNominatim = Promise.resolve();
let ultimaChamada = 0;
function esperarVezNoNominatim() {
  const minha = filaNominatim.then(async () => {
    const desde = Date.now() - ultimaChamada;
    if (desde < NOMINATIM_INTERVALO_MS) await sleep(NOMINATIM_INTERVALO_MS - desde);
    ultimaChamada = Date.now();
  });

  filaNominatim = minha.catch(() => {});
  return minha;
}

async function buscarComTimeout(url, ms, headers) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers });
    if (!r.ok) return null;
    return await r.json();
  } catch {


    return null;
  } finally {
    clearTimeout(t);
  }
}

const soDigitos = (v) => String(v || '').replace(/\D/g, '');





async function bairroPorCep(cepBruto) {
  const cep = soDigitos(cepBruto);
  if (cep.length !== 8) return null;
  const vc = await buscarComTimeout(`https://viacep.com.br/ws/${cep}/json/`, TIMEOUT_VIACEP_MS);
  if (!vc || vc.erro) return null;
  return {
    cep,
    logradouro: vc.logradouro || null,
    bairro: vc.bairro || null,
    cidade: vc.localidade || null,
    uf: vc.uf || null,
  };
}













async function coordenadaPorTexto(consulta, { exigirRio = true } = {}) {
  const q = String(consulta || '').trim();
  if (q.replace(/\W/g, '').length < 4) return null;
  await esperarVezNoNominatim();
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=br`;
  const nom = await buscarComTimeout(url, TIMEOUT_NOMINATIM_MS, { 'User-Agent': UA });
  const hit = Array.isArray(nom) ? nom[0] : null;
  if (!hit) return null;
  const lat = parseFloat(hit.lat);
  const lng = parseFloat(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (exigirRio && !dentroDoRio(lat, lng)) return null;
  return { lat, lng, exibicao: hit.display_name || null };
}





async function centroideDeBairro(bairro, cidade = 'Rio de Janeiro', uf = 'RJ') {
  const b = String(bairro || '').trim();
  if (!b) return null;


  const limpo = b.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
  const tentativas = [
    `${limpo}, ${cidade}, ${uf}, Brasil`,
    `${limpo}, ${uf}, Brasil`,
  ].filter((q, i, a) => a.indexOf(q) === i);
  for (const q of tentativas) {
    const hit = await coordenadaPorTexto(q);
    if (hit) return hit;
  }
  return null;
}



















async function coordenadaDeCep(cepBruto) {
  const via = await bairroPorCep(cepBruto);
  if (!via) return null;
  const { logradouro, bairro, cidade, uf } = via;
  const partes = [cidade, uf, 'Brasil'].filter(Boolean).join(', ');
  const tentativas = [
    logradouro && partes ? `${logradouro}, ${bairro || ''}, ${partes}`.replace(/, ,/g, ',') : null,
    bairro && partes ? `${bairro}, ${partes}` : null,
  ].filter(Boolean);
  for (const q of tentativas) {
    const hit = await coordenadaPorTexto(q, { exigirRio: false });
    if (hit) return { ...via, lat: hit.lat, lng: hit.lng };
  }



  return { ...via, lat: null, lng: null };
}




function normalizarBairro(bairro) {
  const t = String(bairro || '').trim().toLowerCase();
  if (!t) return null;


  return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '') || null;
}

module.exports = {
  bairroPorCep,
  coordenadaPorTexto,
  centroideDeBairro,
  coordenadaDeCep,
  normalizarBairro,
  dentroDoRio,
  CAIXA_RJ,
};
