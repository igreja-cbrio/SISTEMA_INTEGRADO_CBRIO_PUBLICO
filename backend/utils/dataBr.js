


























function parseDateBR(raw) {
  if (!raw) return null;
  if (raw instanceof Date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${raw.getFullYear()}-${pad(raw.getMonth() + 1)}-${pad(raw.getDate())}`;
  }
  const s = String(raw).trim();

  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) {
    return `${br[3]}-${String(br[2]).padStart(2, '0')}-${String(br[1]).padStart(2, '0')}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}











const TZ_BR = 'America/Sao_Paulo';


function hojeBR() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ_BR, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}


function toYmdBR(d) {
  const date = d instanceof Date ? d : new Date(d);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ_BR, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}


function inicioDoMesBR() {
  return `${hojeBR().slice(0, 7)}-01`;
}

module.exports = { parseDateBR, hojeBR, toYmdBR, inicioDoMesBR, TZ_BR };
