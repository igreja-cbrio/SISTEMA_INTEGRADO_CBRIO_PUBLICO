



























const DATAS_ABERTAS_PADRAO = 3;

const ISO = /^\d{4}-\d{2}-\d{2}$/;


function dataIso(v) {
  const s = String(v || '').trim();
  if (!ISO.test(s)) return null;
  const [a, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return s;
}


















function resolverDataBatismo(escolhida, datasAbertas) {
  const lista = (Array.isArray(datasAbertas) ? datasAbertas : [])
    .map(dataIso)
    .filter(Boolean);
  if (lista.length === 0) return { data: null, motivo: 'sem_datas_abertas' };

  const pedida = dataIso(escolhida);

  if (!pedida) {
    if (escolhida !== undefined && escolhida !== null && String(escolhida).trim() !== '') {

      return { data: null, motivo: 'data_invalida' };
    }
    return { data: lista[0], motivo: null };
  }
  if (!lista.includes(pedida)) return { data: null, motivo: 'data_fora_da_janela' };
  return { data: pedida, motivo: null };
}


function mensagemData(motivo) {
  switch (motivo) {
    case 'sem_datas_abertas':
      return 'As datas de batismo ainda não foram abertas. Fale com a equipe da igreja.';
    case 'data_invalida':
      return 'Data de batismo inválida.';
    case 'data_fora_da_janela':
      return 'Essa data de batismo não está mais disponível. Escolha uma das datas oferecidas.';
    default:
      return null;
  }
}

module.exports = { DATAS_ABERTAS_PADRAO, dataIso, resolverDataBatismo, mensagemData };
