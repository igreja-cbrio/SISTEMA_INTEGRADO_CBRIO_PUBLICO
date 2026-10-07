







const { supabase } = require('../utils/supabase');
const { decidirRoteamento, JANELA_DIAS } = require('../utils/roteamentoDisparo');
const { notificar } = require('./notificar');
const waEquipe = require('./waEquipe');


function sufixo(telefone) {
  const d = String(telefone || '').replace(/\D+/g, '');
  return d.length >= 8 ? d.slice(-8) : null;
}











async function ultimoDisparo(telefone) {
  const suf = sufixo(telefone);
  if (!suf) return null;
  const desde = new Date(Date.now() - JANELA_DIAS * 86400000).toISOString();
  const { data, error } = await supabase.from('whatsapp_envios')
    .select('contexto, criado_em, ref_id')
    .ilike('telefone', `%${suf}`)
    .eq('status', 'enviado')
    .gte('criado_em', desde)
    .order('criado_em', { ascending: false })
    .limit(1);



  if (error) { console.warn('[conversaRoteamento] envios:', error.message); return null; }
  return (data && data[0]) || null;
}

async function setoresAtivos() {
  const { data, error } = await supabase.from('conversas_setores')
    .select('id, ordem, rotulo, area, ativo, destino_tipo, atendente_id')
    .eq('ativo', true).order('ordem');
  if (error) { console.warn('[conversaRoteamento] setores:', error.message); return []; }
  return data || [];
}








async function rotearPorDisparo(conversa) {
  try {
    if (!conversa?.id) return null;
    if (conversa.area || conversa.atribuido_a) return null;

    const disparo = await ultimoDisparo(conversa.telefone);
    if (!disparo?.contexto) return null;

    const setores = await setoresAtivos();
    const decisaoBase = decidirRoteamento({
      area: conversa.area, atribuidoA: conversa.atribuido_a,
      contexto: disparo.contexto, disparoEm: disparo.criado_em, setores,
    });
    if (!decisaoBase) return null;
    const decisao = { ...decisaoBase };




    if (!decisao.atendenteId) {
      const resp = await waEquipe.responsavelDaArea(decisao.area).catch(() => null);
      if (resp) decisao.atendenteId = resp.profileId;
    }

    const patch = { area: decisao.area };
    if (decisao.atendenteId) patch.atribuido_a = decisao.atendenteId;





    const { data: mudou, error } = await supabase.from('wa_conversas')
      .update(patch).eq('id', conversa.id)
      .is('area', null).is('atribuido_a', null)
      .select('id');
    if (error) { console.warn('[conversaRoteamento] update:', error.message); return null; }
    if (!mudou?.length) return null;

    if (decisao.atendenteId) await avisar(conversa, decisao);
    return { area: decisao.area, atendenteId: decisao.atendenteId };
  } catch (e) {
    console.error('[conversaRoteamento]', e.message);
    return null;
  }
}









async function avisar(conversa, decisao) {
  try {
    const nome = conversa.nome || conversa.telefone || 'Contato';
    await notificar({
      modulo: 'conversas',
      tipo: 'conversa_triada',
      titulo: `Nova conversa · ${decisao.setor?.rotulo || decisao.area}`,
      mensagem: `${nome} respondeu um disparo de ${decisao.setor?.rotulo || decisao.area} — atribuída a você.`,
      link: `/comunicacao?tab=conversas&area=${encodeURIComponent(decisao.area)}`,
      chaveDedup: `conversa_triada_${conversa.id}`,
      targetIds: [decisao.atendenteId],
    });
  } catch (e) { console.error('[conversaRoteamento] notificar:', e.message); }
}

module.exports = { rotearPorDisparo, ultimoDisparo, sufixo };
