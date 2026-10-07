














const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODIGO_LEN = 8;

function ipv4ParaInt(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(ip || '').trim());
  if (!m) return null;
  let n = 0;
  for (let i = 1; i <= 4; i++) {
    const o = Number(m[i]);
    if (o > 255) return null;
    n = (n * 256) + o;
  }
  return n;
}













function ipDentroDoCerco(ip, permitidos) {
  if (!Array.isArray(permitidos) || permitidos.length === 0) return true;

  const alvo = ipv4ParaInt(ip);
  if (alvo === null) return false;

  for (const regra of permitidos) {
    const [rede, bitsRaw] = String(regra).split('/');
    const base = ipv4ParaInt(rede);
    if (base === null) continue;

    const bits = bitsRaw === undefined ? 32 : Number(bitsRaw);
    if (!Number.isInteger(bits) || bits < 0 || bits > 32) continue;



    const mascara = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    if (((alvo & mascara) >>> 0) === ((base & mascara) >>> 0)) return true;
  }
  return false;
}










function sanitizarIps(v) {
  if (v === undefined || v === null || v === '') return { lista: null, descartados: [] };

  const bruto = Array.isArray(v) ? v : String(v).split(/[\s,;]+/);
  const limpos = bruto.map((s) => String(s).trim()).filter(Boolean);
  const validos = [];
  const descartados = [];

  for (const s of limpos) {
    if (/^(\d{1,3}\.){3}\d{1,3}(\/(3[0-2]|[12]?\d))?$/.test(s) && ipv4ParaInt(s.split('/')[0]) !== null) {
      validos.push(s);
    } else {
      descartados.push(s);
    }
  }

  return { lista: validos.length ? validos : null, descartados };
}

module.exports = { ALFABETO, CODIGO_LEN, ipv4ParaInt, ipDentroDoCerco, sanitizarIps };
