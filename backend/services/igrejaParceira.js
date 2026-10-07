



















const { supabase } = require('../utils/supabase');

const TIPO_PARCEIRA = 'cba_acompanhada';

async function igrejaParceiraPorId(igrejaId) {
  if (!igrejaId) return null;
  const { data, error } = await supabase.from('igrejas')
    .select('id, nome, slug, tipo, cidade, estado, ativa')
    .eq('id', igrejaId).maybeSingle();
  if (error) throw error;
  return data && data.tipo === TIPO_PARCEIRA ? data : null;
}


async function eventoEhParceiro(ev) {
  if (!ev || !ev.igreja_id) return false;
  return Boolean(await igrejaParceiraPorId(ev.igreja_id));
}


async function idsIgrejasParceiras() {
  const { data, error } = await supabase.from('igrejas').select('id').eq('tipo', TIPO_PARCEIRA);
  if (error) throw error;
  return (data || []).map((r) => r.id);
}


async function idsEventosParceiros() {
  const igrejas = await idsIgrejasParceiras();
  if (!igrejas.length) return [];
  const { data, error } = await supabase.from('insc_eventos').select('id').in('igreja_id', igrejas);
  if (error) throw error;
  return (data || []).map((r) => r.id);
}








async function filtroSoEventosCbrio() {
  const igrejas = await idsIgrejasParceiras();
  if (!igrejas.length) return null;
  return `igreja_id.is.null,igreja_id.not.in.(${igrejas.join(',')})`;
}

module.exports = {
  TIPO_PARCEIRA,
  igrejaParceiraPorId,
  eventoEhParceiro,
  idsIgrejasParceiras,
  idsEventosParceiros,
  filtroSoEventosCbrio,
};
