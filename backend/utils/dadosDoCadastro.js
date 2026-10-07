





















const vazio = (v) => v === null || v === undefined || String(v).trim() === '';























function sexoPara(destino, valor) {
  const v = String(valor ?? '').trim().toLowerCase();
  const canonico = (v === 'm' || v === 'masculino') ? 'masculino'
    : (v === 'f' || v === 'feminino') ? 'feminino'
      : null;
  if (!canonico) return null;
  return destino === 'curto' ? (canonico === 'masculino' ? 'M' : 'F') : canonico;
}













function patchDoCadastro(linha, membro, mapa, { sexo = 'canonico' } = {}) {
  if (!linha || !membro || !mapa) return {};
  const patch = {};

  const por = {
    cpf: () => String(membro.cpf ?? '').replace(/\D/g, '') || null,
    data_nascimento: () => membro.data_nascimento || null,
    sexo: () => sexoPara(sexo, membro.genero),
    email: () => (membro.email ? String(membro.email).toLowerCase().trim() : null),
    telefone: () => String(membro.telefone ?? '').replace(/\D/g, '') || null,
  };

  for (const [campo, coluna] of Object.entries(mapa)) {
    if (!coluna || !por[campo]) continue;



    if (!(coluna in linha)) continue;
    if (!vazio(linha[coluna])) continue;
    const valor = por[campo]();
    if (!vazio(valor)) patch[coluna] = valor;
  }
  return patch;
}


function faltaDoContrato(linha, mapa) {
  if (!linha || !mapa) return [];
  return Object.entries(mapa)
    .filter(([, col]) => col && col in linha && vazio(linha[col]))
    .map(([campo]) => campo);
}

module.exports = { patchDoCadastro, faltaDoContrato, sexoPara };
