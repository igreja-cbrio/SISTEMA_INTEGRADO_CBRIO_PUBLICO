




























const DDD_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

const MOTIVOS = {
  SEM_TELEFONE: 'sem_telefone',
  NUMERO_ERRADO: 'numero_errado',
  SEM_WHATSAPP: 'sem_whatsapp',
};

const ROTULO = {
  [MOTIVOS.SEM_TELEFONE]: 'Sem telefone',

  [MOTIVOS.NUMERO_ERRADO]: 'Número errado — impossível contato',
  [MOTIVOS.SEM_WHATSAPP]: 'Número errado — impossível contato',
};


function digitos(raw) {
  return String(raw || '').replace(/\D+/g, '');
}







function telefoneAlcancavel(raw) {
  const d = digitos(raw);
  if (!d) return false;

  const nacional = (d.startsWith('55') && (d.length === 12 || d.length === 13))
    ? d.slice(2)
    : d;
  if (nacional.length !== 10 && nacional.length !== 11) return false;
  if (!DDD_VALIDOS.has(Number(nacional.slice(0, 2)))) return false;

  if (nacional.length === 11 && nacional[2] !== '9') return false;
  return true;
}









function classificarContato({ telefone, email, entregaFalhou = false } = {}) {
  const emailLimpo = String(email || '').trim() || null;
  const semTelefone = !digitos(telefone);
  let motivo = null;
  if (semTelefone) motivo = MOTIVOS.SEM_TELEFONE;
  else if (!telefoneAlcancavel(telefone)) motivo = MOTIVOS.NUMERO_ERRADO;
  else if (entregaFalhou) motivo = MOTIVOS.SEM_WHATSAPP;

  return {
    ok: !motivo,
    motivo,
    rotulo: motivo ? ROTULO[motivo] : null,


    usarEmail: Boolean(motivo && emailLimpo),
    email: emailLimpo,
  };
}







function contatoParaLider({ telefone, email, telefoneExibicao, entregaFalhou = false } = {}) {
  const c = classificarContato({ telefone, email, entregaFalhou });
  const telMostrar = telefoneExibicao || digitos(telefone) || null;
  if (c.ok) return [telMostrar, c.email].filter(Boolean).join(' · ') || 'sem contato';
  if (c.usarEmail) return `e-mail ${c.email} (o telefone informado não recebe WhatsApp)`;
  if (telMostrar) return `${telMostrar} — número não recebe WhatsApp, confirmar com a pessoa`;
  return 'sem contato';
}

module.exports = {
  DDD_VALIDOS,
  MOTIVOS,
  digitos,
  telefoneAlcancavel,
  classificarContato,
  contatoParaLider,
};
