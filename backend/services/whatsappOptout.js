












const { supabase } = require('../utils/supabase');

const digits = (t) => String(t || '').replace(/\D/g, '');
const tel8 = (t) => digits(t).slice(-8);




function intencaoOptOut(bruto, { deBotao = false } = {}) {
  const n = String(bruto || '').toLowerCase().trim();
  if (!n) return null;

  if (/n[aã]o quero (mais )?(receber|mensagens|msgs?)/.test(n) || /parar de receber/.test(n)) return 'out';
  if (/voltar a receber/.test(n)) return 'in';


  const curto = deBotao || n.length <= 24;
  if (curto) {
    if (/^(sair|parar|pare|stop|descadastrar|remover|desinscrever)\b/.test(n)) return 'out';
    if (/^(voltar|quero receber)\b/.test(n)) return 'in';
  }
  return null;
}





async function aplicarOptOut({ telefone, ligar = false }) {
  const chave = tel8(telefone);
  if (!chave || chave.length < 8) return { afetados: 0 };
  let afetados = 0;


  try {
    const { data: mems } = await supabase.from('mem_membros')
      .select('id, telefone').eq('whatsapp_optin', !ligar).is('deleted_at', null).limit(5000);
    const alvo = (mems || []).filter(m => tel8(m.telefone) === chave);
    for (const m of alvo) {
      await supabase.from('mem_membros')
        .update({ whatsapp_optin: ligar, whatsapp_optin_em: ligar ? new Date().toISOString() : null })
        .eq('id', m.id);
      afetados++;
    }
  } catch (e) { console.warn('[optout] membros:', e.message); }






  try {
    const { data: insc } = await supabase.from('inscricoes')
      .select('id, telefone').eq('whatsapp_optin', !ligar)
      .neq('status', 'cancelada').is('deleted_at', null).limit(5000);
    const alvoI = (insc || []).filter((i) => tel8(i.telefone) === chave);
    for (const i of alvoI) {
      await supabase.from('inscricoes')
        .update({ whatsapp_optin: ligar, whatsapp_optin_em: ligar ? new Date().toISOString() : null })
        .eq('id', i.id);
      afetados++;
    }
  } catch (e) { console.warn('[optout] inscricoes:', e.message); }


  try {
    const { data: lids } = await supabase.from('whatsapp_lideres')
      .select('id, telefone, recebe_lembretes').is('deleted_at', null).limit(5000);
    const alvoL = (lids || []).filter(l => tel8(l.telefone) === chave && l.recebe_lembretes !== ligar);
    for (const l of alvoL) {
      await supabase.from('whatsapp_lideres').update({ recebe_lembretes: ligar }).eq('id', l.id);
      afetados++;
    }
  } catch (e) { console.warn('[optout] lideres:', e.message); }

  return { afetados };
}

module.exports = { intencaoOptOut, aplicarOptOut };
