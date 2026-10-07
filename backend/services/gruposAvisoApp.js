















const { supabase } = require('../utils/supabase');
const { donosDoGrupoApp } = require('./gruposDestinatarios');
const { notificarApp } = require('./appPush');
const { avisoPedidoNovo, avisoSaida } = require('../utils/avisoGrupoApp');

const { notificar } = require('./notificar');

























async function escalarPedidoOrfao({ grupoId, grupoNome }) {
  try {
    const enviados = await notificar({
      modulo: 'grupos',
      tipo: 'grupo_sem_lider',
      titulo: `Grupo sem líder recebendo inscrição: ${grupoNome || 'grupo'}`,
      mensagem: 'Chegou pedido novo e este grupo não tem líder nem supervisor — ninguém foi avisado e não há link de aprovação. Defina o líder ou pause as inscrições na tela de Grupos.',
      link: '/grupos',
      severidade: 'aviso',
      chaveDedup: `grupo_sem_lider_${grupoId}`,
    });
    return enviados > 0;
  } catch (e) {
    console.warn(`[gruposAvisoApp] escalada do grupo ${grupoId} falhou:`, e.message);
    return false;
  }
}















async function avisarPedidoNovoNoApp({ grupoId, pedidoId, grupoNome, pessoaNome }) {
  try {
    if (!grupoId || !pedidoId) return { ok: false, motivo: 'sem_referencia' };




    const { data: g } = await supabase
      .from('mem_grupos').select('nome, lider_id, supervisor_id').eq('id', grupoId).maybeSingle();
    const nome = grupoNome || g?.nome || null;

    const aviso = avisoPedidoNovo({ pedidoId, grupoId, grupoNome: nome, pessoaNome });
    if (!aviso) return { ok: false, motivo: 'sem_referencia' };



    if (!g || (!g.lider_id && !g.supervisor_id)) {
      const escalado = await escalarPedidoOrfao({ grupoId, grupoNome: nome });
      return { ok: true, motivo: 'grupo_sem_dono', alvos: 0, escalado };
    }






    const alvos = await donosDoGrupoApp(grupoId);
    if (!alvos.length) return { ok: true, motivo: 'sem_dono_com_app', alvos: 0 };

    const r = await notificarApp(alvos, aviso);
    return { ok: true, alvos: alvos.length, enviados: r?.enviados ?? 0, persistidos: r?.persistidos ?? 0 };
  } catch (e) {

    console.warn(`[gruposAvisoApp] pedido ${pedidoId} grupo ${grupoId}:`, e.message);
    return { ok: false, motivo: 'erro' };
  }
}






async function avisarSaidaNoApp({ grupoId, grupoNome, pessoaNome, dia }) {
  try {
    if (!grupoId) return { ok: false, motivo: 'sem_referencia' };
    let nome = grupoNome;
    if (!nome) {
      const { data: g } = await supabase
        .from('mem_grupos').select('nome').eq('id', grupoId).maybeSingle();
      nome = g?.nome || null;
    }
    const aviso = avisoSaida({ grupoId, grupoNome: nome, pessoaNome, dia });
    if (!aviso) return { ok: false, motivo: 'sem_referencia' };
    const alvos = await donosDoGrupoApp(grupoId);
    if (!alvos.length) return { ok: true, motivo: 'sem_dono_com_app', alvos: 0 };
    const r = await notificarApp(alvos, aviso);
    return { ok: true, alvos: alvos.length, enviados: r?.enviados ?? 0 };
  } catch (e) {
    console.warn(`[gruposAvisoApp] saida grupo ${grupoId}:`, e.message);
    return { ok: false, motivo: 'erro' };
  }
}

module.exports = { avisarPedidoNovoNoApp, avisarSaidaNoApp };
