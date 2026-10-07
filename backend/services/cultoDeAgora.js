
















const { supabase } = require('../utils/supabase');


function hojeBRT() { return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10); }


function agoraMinutosBRT() {
  const d = new Date(Date.now() - 3 * 3600 * 1000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}
function minutosDaHora(hora) {
  const [hh, mm] = String(hora || '').split(':');
  const h = Number(hh), m = Number(mm || 0);
  return Number.isFinite(h) ? h * 60 + (Number.isFinite(m) ? m : 0) : null;
}

async function cultoDeAgora() {
  const hoje = hojeBRT();
  const { data } = await supabase
    .from('cultos')
    .select('id, nome, data, hora')
    .eq('data', hoje).is('deleted_at', null)
    .order('hora', { ascending: true });
  const lista = data || [];
  if (!lista.length) return { culto: null, ao_vivo: false };

  const agora = agoraMinutosBRT();

  const iniciados = lista.filter((c) => {
    const ini = minutosDaHora(c.hora);
    return ini != null && agora >= ini && agora <= ini + 180;
  });
  if (iniciados.length) return { culto: iniciados[iniciados.length - 1], ao_vivo: true };

  const chegando = lista.find((c) => {
    const ini = minutosDaHora(c.hora);
    return ini != null && agora >= ini - 30 && agora < ini;
  });
  if (chegando) return { culto: chegando, ao_vivo: true };

  const proximo = lista.find((c) => {
    const ini = minutosDaHora(c.hora);
    return ini != null && ini > agora;
  });
  return { culto: proximo || lista[lista.length - 1], ao_vivo: false };
}

module.exports = { cultoDeAgora };
