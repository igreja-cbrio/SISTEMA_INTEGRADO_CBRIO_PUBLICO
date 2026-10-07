



































const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];



const CADENCIA = { quinzenal: 'quinzenal', mensal: 'mensal' };










function paramSeguro(texto, max = 220) {
  const limpo = String(texto ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim();
  if (limpo.length <= max) return limpo;
  const corte = limpo.slice(0, max);
  const ultimo = corte.lastIndexOf(' ');
  return (ultimo > max * 0.6 ? corte.slice(0, ultimo) : corte).trim();
}





function dataCurta(dataISO) {
  const [a, m, d] = String(dataISO || '').slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) return null;
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}


function diaDaSemana(n) {
  return (n === 0 || n > 0) && n <= 6 ? DIAS[n] : null;
}











function quandoComData({ diaSemana, horario, recorrencia = 'semanal', proximaISO = null, proximoHorario = null, estimada = false }) {
  const rec = String(recorrencia || 'semanal').toLowerCase().trim();
  const hh = String(horario || '').slice(0, 5);


  if (rec === 'diario') return paramSeguro(hh ? `Todos os dias às ${hh}` : 'Todos os dias');

  const dia = diaDaSemana(diaSemana);
  const base = dia
    ? (hh ? `${dia} às ${hh}` : dia)
    : (hh ? `às ${hh}` : 'a combinar');



  const comCadencia = CADENCIA[rec] ? `${base} (${CADENCIA[rec]})` : base;

  const curta = dataCurta(proximaISO);
  if (!curta) return paramSeguro(comCadencia);

  const horaProxima = String(proximoHorario || '').slice(0, 5);
  const quandoProximo = horaProxima && horaProxima !== hh ? `${curta} às ${horaProxima}` : curta;

  return paramSeguro(estimada



    ? `${comCadencia} · o próximo deve ser dia ${quandoProximo}, confirme com o líder`
    : `${comCadencia} · o próximo é dia ${quandoProximo}`);
}












function ondeComLink({ partes = [], online = false, linkOnline = null }) {
  const endereco = partes.filter(Boolean).map(s => String(s).trim()).filter(Boolean).join(' — ');

  if (online) {
    const link = String(linkOnline || '').trim();

    if (link && `Online · ${link}`.length <= 300) return paramSeguro(`Online · ${link}`, 300);
    if (link) return 'Online · o líder envia o link';



    return paramSeguro(endereco ? `${endereco} · o líder envia o link` : 'Online · o líder envia o link');
  }

  return paramSeguro(endereco || 'a combinar');
}

module.exports = { quandoComData, ondeComLink, paramSeguro, dataCurta, diaDaSemana, DIAS, CADENCIA };
