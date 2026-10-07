
































const JANELA_SILENCIO_HORAS = 72;










function deveAgradecer(doacao, contexto = {}) {
  if (!doacao) return { agradecer: false, motivo: 'doação inexistente' };





  if (contexto.ja_agradecida) {
    return { agradecer: false, motivo: 'esta doação já foi agradecida' };
  }



  if (!doacao.membro_id) {
    return { agradecer: false, motivo: 'doação sem cadastro vinculado (anônima)' };
  }

  if (!contexto.canal_disponivel) {
    return { agradecer: false, motivo: 'pessoa sem e-mail nem opt-in de WhatsApp' };
  }




  if (Number(doacao.valor_centavos) <= 0) {
    return { agradecer: false, motivo: 'valor não é uma entrada de dinheiro' };
  }

  if (contexto.ultimo_agradecimento_em && contexto.agora) {
    const horas = (new Date(contexto.agora) - new Date(contexto.ultimo_agradecimento_em)) / 3600000;
    if (Number.isFinite(horas) && horas >= 0 && horas < JANELA_SILENCIO_HORAS) {
      return {
        agradecer: false,
        motivo: `já foi agradecida nas últimas ${JANELA_SILENCIO_HORAS}h`,
      };
    }
  }

  return { agradecer: true, motivo: null };
}











function textoAgradecimento(campanha = {}) {
  const nome = campanha.nome || 'nossa campanha';
  const causa = campanha.descricao_curta
    || 'transformar o espaço onde as nossas crianças são cuidadas e ensinadas';

  const assunto = `Obrigado por fazer parte da ${nome}`;

  const corpoTexto = [
    'Sua contribuição chegou.',
    '',
    `Você acabou de participar da ${nome} — e queríamos que você soubesse `
      + 'que isso não passou em branco por aqui.',
    '',
    `Cada valor que entra vai direto para ${causa}. Não é uma obra de concreto: `
      + 'é o lugar onde uma criança vai ouvir sobre Jesus pela primeira vez, e onde '
      + 'os pais dela vão poder deixá-la em paz enquanto adoram.',
    '',
    'Obrigado por não ter ficado só assistindo.',
    '',
    campanha.link ? `Acompanhe o andamento em ${campanha.link}` : null,
    '',
    'Com gratidão,',
    'Equipe CBRio',
  ].filter((l) => l !== null).join('\n');

  return { assunto, corpo_texto: corpoTexto };
}

module.exports = {
  JANELA_SILENCIO_HORAS,
  deveAgradecer,
  textoAgradecimento,
};
