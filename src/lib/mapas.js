



export function urlsNavegacao({ lat, lng, endereco } = {}) {
  const temCoords = lat != null && lng != null && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lng));
  const q = encodeURIComponent((endereco || '').trim());
  return {
    google: temCoords
      ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
      : `https://www.google.com/maps/search/?api=1&query=${q}`,
    waze: temCoords
      ? `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
      : `https://waze.com/ul?q=${q}&navigate=yes`,
    temDestino: temCoords || q.length > 0,
  };
}
