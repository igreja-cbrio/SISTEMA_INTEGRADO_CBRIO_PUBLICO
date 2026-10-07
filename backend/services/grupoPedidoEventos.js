



const { supabase } = require('../utils/supabase');

async function registrarEventoPedido(pedidoId, tipo, detalhe = {}, autorNome = null) {
  try {
    const { error } = await supabase.from('mem_grupo_pedido_eventos').insert({
      pedido_id: pedidoId,
      tipo,
      detalhe: detalhe || {},
      autor_nome: autorNome || null,
    });
    if (error) console.error('[PedidoEventos]', tipo, error.message);
  } catch (e) {
    console.error('[PedidoEventos]', tipo, e.message);
  }
}

module.exports = { registrarEventoPedido };
