


































const CANAIS = ['email', 'whatsapp', 'app_push'];









const SEGMENTOS = {
  todos: 'Toda a base ativa',
  membros: 'Somente membros ativos',
  voluntarios: 'Voluntários ativos',
  pais_kids: 'Responsáveis por crianças do Kids',
  doadores_campanha: 'Quem já doou para esta campanha',

  aderentes: 'Quem aderiu a esta campanha (inscritos)',
  aderentes_em_atraso: 'Aderentes em atraso com o compromisso',
};


function emailUtilizavel(email) {
  const e = String(email ?? '').trim().toLowerCase();
  if (!e || e.length > 254) return false;
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(e)) return false;



  if (/@(exemplo|example|teste|test|nao|sem)[.-]/.test(e)) return false;
  return true;
}


function telefoneUtilizavel(telefone) {
  const d = String(telefone ?? '').replace(/\D/g, '');
  const sem55 = d.length > 11 && d.startsWith('55') ? d.slice(2) : d;
  return sem55.length === 10 || sem55.length === 11;
}








function elegivel(pessoa, canal) {
  if (!pessoa) return { elegivel: false, motivo: 'sem cadastro', destino: null };
  if (pessoa.active === false) return { elegivel: false, motivo: 'cadastro inativo', destino: null };
  if (pessoa.deleted_at) return { elegivel: false, motivo: 'cadastro excluído', destino: null };







  if (pessoa.falecido === true || pessoa.status === 'falecido') {
    return { elegivel: false, motivo: 'falecido', destino: null };
  }


  if (pessoa.status === 'inativo') {
    return { elegivel: false, motivo: 'cadastro marcado como inativo', destino: null };
  }

  if (canal === 'email') {
    if (pessoa.email_optout === true) {
      return { elegivel: false, motivo: 'pediu para não receber e-mail', destino: null };
    }
    if (!emailUtilizavel(pessoa.email)) {
      return { elegivel: false, motivo: 'sem e-mail utilizável', destino: null };
    }
    return { elegivel: true, motivo: null, destino: String(pessoa.email).trim().toLowerCase() };
  }

  if (canal === 'whatsapp') {



    if (pessoa.whatsapp_optin !== true) {
      return { elegivel: false, motivo: 'sem opt-in de WhatsApp', destino: null };
    }
    if (!telefoneUtilizavel(pessoa.telefone)) {
      return { elegivel: false, motivo: 'sem telefone utilizável', destino: null };
    }
    return { elegivel: true, motivo: null, destino: String(pessoa.telefone).replace(/\D/g, '') };
  }

  if (canal === 'app_push') {
    if (!pessoa.tem_push_token) {
      return { elegivel: false, motivo: 'não tem o app instalado', destino: null };
    }
    return { elegivel: true, motivo: null, destino: String(pessoa.id) };
  }

  return { elegivel: false, motivo: `canal desconhecido: ${canal}`, destino: null };
}





function montarPublico(pessoas, canal) {
  const alvo = [];
  const fora = [];
  const motivos = {};
  const vistos = new Set();

  for (const p of Array.isArray(pessoas) ? pessoas : []) {
    const r = elegivel(p, canal);
    if (!r.elegivel) {
      fora.push({ id: p?.id ?? null, motivo: r.motivo });
      motivos[r.motivo] = (motivos[r.motivo] || 0) + 1;
      continue;
    }




    const chave = `${canal}:${r.destino}`;
    if (vistos.has(chave)) {
      fora.push({ id: p.id, motivo: 'destino repetido (mesma casa)' });
      motivos['destino repetido (mesma casa)'] = (motivos['destino repetido (mesma casa)'] || 0) + 1;
      continue;
    }
    vistos.add(chave);
    alvo.push({ id: p.id, nome: p.nome || null, destino: r.destino });
  }

  return {
    canal,
    alvo,
    fora,
    total_base: Array.isArray(pessoas) ? pessoas.length : 0,
    total_alvo: alvo.length,
    total_fora: fora.length,
    motivos,
  };
}

module.exports = {
  CANAIS,
  SEGMENTOS,
  emailUtilizavel,
  telefoneUtilizavel,
  elegivel,
  montarPublico,
};
