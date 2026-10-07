






const { supabase } = require('../utils/supabase');
const { notificar } = require('./notificar');

const TIPOS = ['aconselhamento', 'capelania', 'oracao', 'sos', 'visita', 'outro'];
const CANAIS = ['app', 'whatsapp', 'plataforma', 'manual'];

async function registrarPedidoCuidado({
  canal = 'manual', tipo = 'outro', membro_id = null, nome = null,
  telefone = null, email = null, mensagem = null, origem_ref = null, criado_por = null,
} = {}) {
  const payload = {
    canal: CANAIS.includes(canal) ? canal : 'manual',
    tipo: TIPOS.includes(tipo) ? tipo : 'outro',
    membro_id: membro_id || null,
    nome: nome || null,
    telefone: telefone ? String(telefone).replace(/\D/g, '') || null : null,
    email: email ? String(email).trim().toLowerCase() || null : null,
    mensagem: mensagem || null,
    origem_ref: origem_ref || null,
    criado_por: criado_por || null,
  };
  const { data, error } = await supabase.from('cui_pedidos').insert(payload).select().single();
  if (error) throw error;

  notificar({
    modulo: 'cuidados',
    tipo: 'novo_pedido_cuidado',
    titulo: `Novo pedido de cuidado — ${payload.nome || 'pessoa'}`,
    mensagem: `${payload.tipo} via ${payload.canal}${payload.mensagem ? ': ' + String(payload.mensagem).slice(0, 120) : ''}`,
    link: '/ministerial/cuidados?tab=acomp',
    severidade: payload.tipo === 'sos' ? 'alta' : 'info',
    chaveDedup: `cui_pedido_${data.id}`,
  }).catch(() => {});

  return data;
}

module.exports = { registrarPedidoCuidado, TIPOS_PEDIDO_CUIDADO: TIPOS, CANAIS_PEDIDO_CUIDADO: CANAIS };
