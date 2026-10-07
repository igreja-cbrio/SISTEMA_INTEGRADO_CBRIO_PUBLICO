



const { supabase } = require('../utils/supabase');
const { enviarTexto } = require('./whatsappSend');
const { normalizarTelefone } = require('./whatsappService');
const waInbox = require('./waInbox');
const waEquipe = require('./waEquipe');
const { notificar } = require('./notificar');
const { ehSoAgradecimento } = require('../utils/agradecimento');

function primeiroNome(nome) { return String(nome || '').trim().split(/\s+/)[0] || ''; }

async function setoresAtivos() {




  const { data } = await supabase.from('conversas_setores')
    .select('*').eq('ativo', true).order('ordem', { ascending: true });
  return data || [];
}





async function concluirTriagem({ conv, telefone, setor, nomeInformado }) {
  const area = setor?.area || null;
  const rotulo = setor?.rotulo || area || 'atendimento';
  const paraAtendente = !!(setor?.destino_tipo === 'atendente' && setor?.atendente_id);




  const responsavel = paraAtendente ? null : await waEquipe.responsavelDaArea(area).catch(() => null);
  const patch = { bot_estado: 'concluido', bot_area_pendente: null, area };

  if (!conv.membro_id && nomeInformado) patch.nome = nomeInformado;
  if (paraAtendente) patch.atribuido_a = setor.atendente_id;
  else if (responsavel) patch.atribuido_a = responsavel.profileId;
  await supabase.from('wa_conversas').update(patch).eq('id', conv.id);

  const nome = primeiroNome(patch.nome || conv.nome || nomeInformado || '');
  const proto = conv.protocolo ? `\n\nSeu protocolo de atendimento é *${conv.protocolo}* (guarde pra acompanhar).` : '';
  const propria = String(setor?.mensagem_resposta || '').trim();
  await responder(telefone, propria
    ? `${propria}${proto}`
    : `Obrigado${nome ? `, ${nome}` : ''}! 🙏 Já encaminhei sua mensagem pro time de *${rotulo}*. Em breve alguém fala com você por aqui.${proto}`);

  try {
    const atribuidoA = paraAtendente ? setor.atendente_id : (responsavel?.profileId || null);
    const alvos = atribuidoA ? [atribuidoA] : await resolverProfilesDaArea(area);
    const nomePessoa = patch.nome || conv.nome || nomeInformado || 'Contato';
    const sup = responsavel?.papel === 'suplente' ? ' (você é o suplente da área)' : '';
    await notificar({
      modulo: 'conversas',
      tipo: 'conversa_triada',
      titulo: `Nova conversa · ${rotulo}`,
      mensagem: `${nomePessoa}${conv.membro_id ? '' : ' (⚠️ não cadastrado na membresia)'} quer falar com ${rotulo}${atribuidoA ? ` — atribuída a você${sup}` : ''}.`,
      link: `/comunicacao?tab=conversas${area ? `&area=${encodeURIComponent(area)}` : ''}`,
      chaveDedup: `conversa_triada_${conv.id}`,
      targetIds: alvos.length ? alvos : undefined,
    });
  } catch (e) { console.error('[triagem] notificar:', e.message); }
}

function montarMenu(setores, nome) {
  const saud = nome ? `Olá, ${primeiroNome(nome)}! ` : 'Olá! ';
  const linhas = setores.map((s, i) => `${i + 1} - ${s.rotulo}`).join('\n');
  return `${saud}Obrigado por entrar em contato com a CBRio!\nResponda, com qual setor você deseja entrar em contato:\n\n${linhas}`;
}


function escolherSetor(texto, setores) {
  const t = String(texto || '').trim().toLowerCase();
  const n = parseInt(t.replace(/\D+/g, ''), 10);
  if (n >= 1 && n <= setores.length) return setores[n - 1];
  return setores.find(s => t === s.rotulo.toLowerCase() || t === s.area.toLowerCase())
    || setores.find(s => t.length >= 3 && (s.rotulo.toLowerCase().includes(t) || t.includes(s.rotulo.toLowerCase())));
}

async function resolverProfilesDaArea(areaNome) {
  try {
    const { data } = await supabase.rpc('conversas_profiles_da_area', { area_nome: areaNome });
    return [...new Set((data || []).map(r => r.profile_id).filter(Boolean))];
  } catch (e) { console.error('[triagem] resolverProfilesDaArea:', e.message); return []; }
}


async function responder(telefone, texto) {
  const r = await enviarTexto(telefone, texto).catch(e => { console.error('[triagem] enviarTexto:', e.message); return null; });

  await waInbox.registrarOutbound({ telefone, texto, tipo: 'bot', waMessageId: r?.message_id || null }).catch(() => {});
}



async function tratar({ telefone, texto }) {
  const tel = normalizarTelefone(telefone) || String(telefone).replace(/\D+/g, '');
  const { data: conv } = await supabase.from('wa_conversas')
    .select('id, nome, membro_id, protocolo, bot_estado, bot_area_pendente')
    .eq('telefone', tel).is('deleted_at', null).maybeSingle();
  if (!conv) return false;

  const setores = await setoresAtivos();
  if (!setores.length) return false;

  const estado = conv.bot_estado || null;













  if (estado !== 'concluido' && ehSoAgradecimento(texto)) {


    if (estado === 'cortesia') return true;
    const oi = primeiroNome(conv.nome) ? `${primeiroNome(conv.nome)}, ` : '';
    await responder(
      telefone,
      `${oi}nós que agradecemos! 🙏\n\nSe precisar falar com a gente sobre alguma coisa, manda um *oi* aqui que eu te ajudo a chegar na pessoa certa.`,
    );
    await supabase.from('wa_conversas').update({ bot_estado: 'cortesia' }).eq('id', conv.id);
    return true;
  }




  if (estado === 'cortesia') {
    await responder(telefone, montarMenu(setores, conv.nome));
    await supabase.from('wa_conversas').update({ bot_estado: 'aguardando_setor' }).eq('id', conv.id);
    return true;
  }


  if (!estado) {
    await responder(telefone, montarMenu(setores, conv.nome));
    await supabase.from('wa_conversas').update({ bot_estado: 'aguardando_setor' }).eq('id', conv.id);
    return true;
  }


  if (estado === 'aguardando_setor') {
    const setor = escolherSetor(texto, setores);
    if (!setor) {
      await responder(telefone, `Não entendi 🙈. Responda só o número do setor:\n\n${setores.map((s, i) => `${i + 1} - ${s.rotulo}`).join('\n')}`);
      return true;
    }


    if (setor.pedir_nome === false) {
      await concluirTriagem({ conv, telefone, setor, nomeInformado: null });
      return true;
    }
    await responder(telefone, 'Para atendermos você da melhor forma, me diga seu *NOME*');



    await supabase.from('wa_conversas').update({ bot_estado: 'aguardando_nome', bot_area_pendente: String(setor.id) }).eq('id', conv.id);
    return true;
  }


  if (estado === 'aguardando_nome') {
    const nomeInformado = String(texto || '').trim().slice(0, 120);
    const pend = conv.bot_area_pendente;
    const setor = setores.find(s => String(s.id) === String(pend))
      || setores.find(s => s.area === pend)
      || { area: pend, rotulo: pend };
    await concluirTriagem({ conv, telefone, setor, nomeInformado });
    return true;
  }


  return true;
}

module.exports = { tratar };
