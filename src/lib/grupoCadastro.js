











export const ehDiario = (g) => (g?.recorrencia || '').toLowerCase().trim() === 'diario';




export function camposFaltantes(g) {
  const faltas = [];
  if (!g.lider_id) faltas.push('Líder');




  else if (g.lider_apagado === true) faltas.push('Líder (cadastro apagado)');
  else if (!(g.lider?.telefone ?? g.lider_telefone)) faltas.push('Telefone do líder');

  if (g.dia_semana == null && !ehDiario(g)) faltas.push('Dia da semana');
  if (!g.horario) faltas.push('Horário');







  if (!g.eh_online) {


    if (!g.endereco || g.endereco_publico === null) faltas.push('Endereço');
    else if (g.endereco_tem_numero === false) faltas.push('Número no endereço');
  }
  if (!g.bairro) faltas.push('Bairro');
  if (!g.faixa_etaria) faltas.push('Faixa etária');



  const rotuloEtario = ['adolescentes', 'jovens', 'jovens adultos'].includes(String(g.faixa_etaria || '').toLowerCase());
  const nomeEtario = /jovens|jovem|adolescente|teen/i.test(g.nome || '');
  if ((rotuloEtario || nomeEtario) && g.idade_min == null && g.idade_max == null) faltas.push('Idades da faixa (mín/máx)');
  if (!g.categoria) faltas.push('Categoria');
  if (!g.rede_id) faltas.push('Rede');
  return faltas;
}




export function faltasPorCampo(grupos) {
  const c = {};
  (grupos || []).forEach(g => camposFaltantes(g).forEach(f => { c[f] = (c[f] || 0) + 1; }));
  return Object.entries(c).sort((a, b) => b[1] - a[1]);
}
