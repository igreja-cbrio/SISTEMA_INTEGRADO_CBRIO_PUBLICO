





const { supabase } = require('../utils/supabase');
const wpp = require('./whatsappService');


const PARAMS = {
  pedido_atualizado: (nome) => [nome, 'Solicitação de teste', 'em andamento', 'Disparo de teste do sistema.', 'https://cbrio.org/solicitacoes'],
  inscricao_confirmada: (nome) => [nome, 'Evento de teste'],
  kids_precheckin: () => ['TESTE12'],
  batismo_lembrete: () => ['amanhã', '19h'],
  aniversario: (nome) => [nome],
  kids_vinculo: () => ['Criança Teste', 'aprovado'],
};
const CHAVES_TESTE = Object.keys(PARAMS);






async function testarDisparoPara(userId, chave = 'pedido_atualizado') {
  const k = String(chave || 'pedido_atualizado');
  if (!Object.prototype.hasOwnProperty.call(PARAMS, k)) return { ok: false, chave: k, motivo: 'Template de teste desconhecido.' };
  if (!userId) return { ok: false, chave: k, motivo: 'Sem usuário autenticado.' };
  const { data: prof, error } = await supabase.from('profiles').select('name, membro_id').eq('id', userId).maybeSingle();
  if (error) throw error;
  if (!prof?.membro_id) return { ok: false, chave: k, motivo: 'Seu perfil não está ligado a um membro (sem telefone para enviar).' };
  const nome = (prof.name || '').trim().split(/\s+/)[0] || 'Olá';
  const r = await wpp.notificarMembro(prof.membro_id, k, PARAMS[k](nome));
  return { ok: !!r?.sent, chave: k, resultado: r };
}

module.exports = { CHAVES_TESTE, testarDisparoPara };
