


















const CAPACIDADE_TEMPLO = 1050;


const CAPACIDADE_BRIDGE = 100;






function capacidadeDoCulto(tipo, padrao = CAPACIDADE_TEMPLO) {
  const bruto = tipo?.capacidade_lugares;


  const n = Number(bruto);
  if (Number.isFinite(n) && n > 0) return n;





  if (bruto === undefined) {
    const nome = tipo?.name || tipo?.service_type_name || '';
    if (/bridge/i.test(nome)) return CAPACIDADE_BRIDGE;
  }
  return padrao;
}




function capacidadeSomada(tipos, padrao = CAPACIDADE_TEMPLO) {
  if (!Array.isArray(tipos)) return 0;
  return tipos.reduce((s, t) => s + capacidadeDoCulto(t, padrao), 0);
}

module.exports = { capacidadeDoCulto, capacidadeSomada, CAPACIDADE_TEMPLO, CAPACIDADE_BRIDGE };
