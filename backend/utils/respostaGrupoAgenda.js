


































const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];


const CADENCIA_TEXTO = {
  semanal: '',
  quinzenal: ' (a cada 15 dias)',
  mensal: ' (uma vez por mês)',
  diario: ' (todos os dias)',
};

function primeiroNomeDe(nome) {
  return String(nome || '').trim().split(/\s+/)[0] || '';
}








function quandoPorExtenso(dataISO, horario) {
  if (!dataISO) return null;
  const [a, m, d] = String(dataISO).slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) return null;
  const dia = DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
  const hh = String(horario || '').slice(0, 5);
  const data = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
  return hh ? `${dia}, ${data}, às ${hh}` : `${dia}, ${data}`;
}













function montarRespostaAgenda({
  nome = '', grupoNome = '', proximaISO = null, horario = '',
  recorrencia = 'semanal', local = '', liderNome = '', liderTelefone = '',
  estimada = false,
} = {}) {
  const oi = primeiroNomeDe(nome) ? `Oi, ${primeiroNomeDe(nome)}!` : 'Oi!';
  const grupo = String(grupoNome || '').trim();
  const quando = quandoPorExtenso(proximaISO, horario);
  const cadencia = CADENCIA_TEXTO[String(recorrencia || '').toLowerCase()] ?? '';
  const lider = String(liderNome || '').trim();
  const contatoLider = lider
    ? `${primeiroNomeDe(lider)}${liderTelefone ? ` (${liderTelefone})` : ''}`
    : null;

  const l = [];

  if (!quando) {



    l.push(`${oi} O grupo *${grupo}* já está acontecendo e você já pode participar.`);
    l.push('');
    l.push(contatoLider
      ? `Para confirmar o próximo encontro, fale com ${contatoLider}.`
      : 'A liderança vai te confirmar a data do próximo encontro.');
    return { texto: l.join('\n'), confianca: 'sem_data' };
  }

  l.push(`${oi} O grupo *${grupo}* já está acontecendo e você já pode participar do próximo encontro.`);
  l.push('');
  l.push(`📅 ${quando}${cadencia}`);
  if (String(local || '').trim()) l.push(`📍 ${String(local).trim()}`);

  if (estimada) {



    l.push('');
    l.push(contatoLider
      ? `Como os encontros deste grupo ainda não estão registrados no sistema, confirme com ${contatoLider} antes de ir. 🙏`
      : 'Como os encontros deste grupo ainda não estão registrados no sistema, confirme com a liderança antes de ir. 🙏');
    return { texto: l.join('\n'), confianca: 'estimada' };
  }

  if (contatoLider) {
    l.push('');
    l.push(`Qualquer dúvida, fale com ${contatoLider}.`);
  }
  l.push('');
  l.push('Te esperamos lá! 💚');
  return { texto: l.join('\n'), confianca: 'confirmada' };
}























function montarRespostaLink({
  nome = '', grupoNome = '', online = false, local = '',
  liderNome = '', liderTelefone = '', proximaISO = null, horario = '',
} = {}) {
  const oi = primeiroNomeDe(nome) ? `Oi, ${primeiroNomeDe(nome)}!` : 'Oi!';
  const lider = primeiroNomeDe(String(liderNome || '').trim());
  const tel = String(liderTelefone || '').trim();
  const quando = quandoPorExtenso(proximaISO, horario);
  const l = [oi, ''];

  if (online) {
    l.push(lider


      ? `O link do encontro é enviado pela liderança do grupo: a ${lider} vai entrar em contato com você.`
      : 'O link do encontro é enviado pela liderança do grupo — ela vai entrar em contato com você.');
    if (lider && tel) {
      l.push('');
      l.push(`Se quiser adiantar, o contato dela é ${tel}.`);
    }
  } else {

    l.push(String(local || '').trim()
      ? `O seu grupo é presencial, em ${String(local).trim()}.`
      : 'O seu grupo é presencial.');
    l.push(lider
      ? `A ${lider} vai entrar em contato com você com os detalhes.`
      : 'A liderança do grupo vai entrar em contato com você com os detalhes.');
    if (lider && tel) {
      l.push('');
      l.push(`Se quiser adiantar, o contato dela é ${tel}.`);
    }
  }

  if (grupoNome || quando) {
    l.push('');
    if (grupoNome) l.push(`👥 ${String(grupoNome).trim()}`);


    if (quando) l.push(`📅 ${quando}`);
  }

  l.push('');
  l.push('Qualquer coisa, é só chamar por aqui. 💚');
  return { texto: l.join('\n'), confianca: 'confirmada' };
}

module.exports = { montarRespostaAgenda, montarRespostaLink, quandoPorExtenso, primeiroNomeDe, CADENCIA_TEXTO, DIAS };
