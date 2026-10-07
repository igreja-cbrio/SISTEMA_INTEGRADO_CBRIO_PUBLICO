























function diaBRT(agora) {
  const d = agora instanceof Date ? agora : new Date(agora);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}


function diasEntre(depois, antes) {
  const a = new Date(antes);
  const b = depois instanceof Date ? depois : new Date(depois);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}










const ESCADA_DIAS = [3, 7];
const MAX_COBRANCAS = 1 + ESCADA_DIAS.length;










function canaisDe(func, { temTemplateWhatsapp = false } = {}) {
  const f = func || {};
  const canais = [];











  if (f.profile_id) canais.push('sistema');

  const email = String(f.email || '').trim();


  if (email.includes('@') && !email.endsWith('@privaterelay.appleid.com')) canais.push('email');
  const tel = String(f.telefone || '').replace(/\D/g, '');
  const semPais = tel.length > 11 && tel.startsWith('55') ? tel.slice(2) : tel;
  if (temTemplateWhatsapp && (semPais.length === 10 || semPais.length === 11)) canais.push('whatsapp');
  return canais;
}












function decidirCobranca(func, { agora, temTemplateWhatsapp = false, estado } = {}) {
  const f = func || {};
  const ref = agora instanceof Date ? agora : new Date(agora);




  if (estado && estado.aplicavel === false) {
    return { acao: 'parar', rodada: 0, canais: [], motivo: 'nao_e_pj' };
  }
  if (estado && estado.completa) {
    return { acao: 'parar', rodada: 0, canais: [], motivo: 'ja_entregou' };
  }

  const cobrancas = Array.isArray(f.ficha_contratada_cobrancas) ? f.ficha_contratada_cobrancas : [];
  const feitas = cobrancas.length;
  const canais = canaisDe(f, { temTemplateWhatsapp });

  if (!canais.length) {



    return { acao: 'parar', rodada: 0, canais: [], motivo: 'sem_canal' };
  }
  if (feitas >= MAX_COBRANCAS) {
    return { acao: 'parar', rodada: feitas, canais, motivo: 'escada_esgotada' };
  }
  if (feitas === 0) {
    return { acao: 'enviar', rodada: 1, canais, motivo: 'primeira_via' };
  }

  const ultima = cobrancas[cobrancas.length - 1];
  const dias = diasEntre(ref, ultima && ultima.em);
  if (dias === null) {

    return { acao: 'parar', rodada: feitas, canais, motivo: 'data_ilegivel' };
  }
  const intervalo = ESCADA_DIAS[feitas - 1];
  if (dias < intervalo) {
    return { acao: 'aguardar', rodada: feitas, canais, motivo: `faltam ${intervalo - dias} dia(s)` };
  }
  return { acao: 'enviar', rodada: feitas + 1, canais, motivo: 'lembrete' };
}








function montarRodada(lista, { agora, temTemplateWhatsapp = false, teto = 50, estadoDe } = {}) {
  const enviar = [];
  const resumo = { aguardando: 0, ja_entregou: 0, sem_canal: 0, nao_e_pj: 0, escada_esgotada: 0, data_ilegivel: 0 };

  for (const f of (lista || [])) {
    const estado = typeof estadoDe === 'function' ? estadoDe(f) : undefined;
    const d = decidirCobranca(f, { agora, temTemplateWhatsapp, estado });
    if (d.acao === 'enviar') { enviar.push({ func: f, ...d }); continue; }
    if (d.acao === 'aguardar') { resumo.aguardando += 1; continue; }
    if (Object.prototype.hasOwnProperty.call(resumo, d.motivo)) resumo[d.motivo] += 1;
  }


  enviar.sort((a, b) => a.rodada - b.rodada);
  return { enviar: enviar.slice(0, teto), adiados: Math.max(0, enviar.length - teto), resumo };
}

module.exports = {
  ESCADA_DIAS, MAX_COBRANCAS,
  diaBRT, diasEntre, canaisDe, decidirCobranca, montarRodada,
};
