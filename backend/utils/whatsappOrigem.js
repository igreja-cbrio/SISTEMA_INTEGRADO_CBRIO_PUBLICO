













const { moduloDoContexto } = require('./whatsappModulo');







const ROTULOS = [
  ['grupos.pedido_novo_lider', 'Grupos · aviso ao líder de um novo pedido'],
  ['grupos.inscricao_confirmada', 'Grupos · confirmação de inscrição'],
  ['grupos.pedido_aprovado', 'Grupos · pedido aprovado pelo líder'],
  ['grupos.confira_lista', 'Grupos · confira a lista do seu grupo'],
  ['grupos.frequencia_mes', 'Grupos · chamada do mês'],
  ['grupos.renovacao_temporada', 'Grupos · renovação de temporada'],
  ['grupos.sugestao', 'Grupos · sugestão de outro grupo'],
  ['membresia.censo_atualizacao', 'Censo · atualização cadastral'],
  ['censo', 'Censo · atualização cadastral'],
  ['inscricoes.confirmacao', 'Inscrições · confirmação de inscrição em evento'],
  ['app.inscricao_confirmada', 'Inscrição pelo app · confirmação'],
  ['app.pedido_atualizado', 'Solicitações · sua solicitação mudou de status'],
  ['app.aniversario', 'Aniversário · parabéns (voluntariado)'],
  ['app.batismo_lembrete', 'Batismo · lembrete da cerimônia'],
  ['app.escala_voluntario', 'Voluntariado · você foi escalado'],
  ['app.kids_vinculo', 'Kids · resultado do pedido de vínculo'],
  ['app.kids_precheckin', 'Kids · pré-check-in'],
  ['app.doacao_recebida', 'Generosidade · doação recebida'],
  ['app.familia_convite_aceito', 'Família · convite aceito'],
  ['app.suporte', 'Ajuda com o app · dúvida de membro'],
  ['next', 'NEXT · convite'],
  ['voluntariado', 'Voluntariado'],
  ['batismo', 'Batismo'],

  ['grupos.fallback_template', 'Grupos · aviso do bot'],
  ['membresia.cadastro_confirmado', 'Membresia · confirmação de cadastro'],
  ['cuidados.devocional_diario', 'Devocional · devocional do dia'],
  ['cuidados.visitante_pesquisa_obrigado', 'Visitantes · agradecimento da pesquisa'],
  ['cuidados.visitante_pesquisa', 'Visitantes · pesquisa de satisfação'],
  ['cuidados', 'Cuidado pastoral'],
  ['kids.retirada_codigo', 'Kids · código de retirada'],
  ['kids.resumo_dia', 'Kids · resumo do dia do totem'],
  ['kids', 'Kids'],
  ['solicitacoes.aprovacao_cold', 'Solicitações · aprovação pendente'],
  ['solicitacoes', 'Solicitações'],
  ['rh.onboarding_lote', 'RH · formulário de dados pessoais'],
  ['rh', 'RH'],


  ['comunicacao.envio_manual', 'Comunicação · envio manual da equipe'],
  ['comunicacao.agendamento', 'Comunicação · envio programado'],
  ['comunicacao', 'Comunicação'],
  ['auto', 'Mensagem automática do sistema'],
];










function rotuloDoDisparo(contexto) {
  const c = String(contexto || '').trim().toLowerCase();
  const { modulo, link } = moduloDoContexto(c);
  if (!c) return { rotulo: 'Disparo sem contexto', modulo, link, conhecido: false };
  for (const [chave, rotulo] of ROTULOS) {
    if (c === chave || c.startsWith(`${chave}.`)) return { rotulo, modulo, link, conhecido: true };
  }
  return { rotulo: c, modulo, link, conhecido: false };
}















function chaveTelefone(telefone) {
  const d = String(telefone || '').replace(/\D/g, '');
  return d.length >= 8 ? d.slice(-8) : null;
}

module.exports = { rotuloDoDisparo, chaveTelefone, ROTULOS };
