













export const MAIORIDADE = 18;

export const PARENTESCOS = ['Mãe', 'Pai', 'Avó', 'Avô', 'Tia', 'Tio', 'Irmã', 'Irmão', 'Responsável legal', 'Outro'];







export function hojeBRT(agoraMs = Date.now()) {
  return new Date(agoraMs - 3 * 3600 * 1000).toISOString().slice(0, 10);
}


export function idadeEmAnos(nascimentoISO, refISO) {
  const nasc = String(nascimentoISO || '').slice(0, 10);
  const ref = String(refISO || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nasc) || !/^\d{4}-\d{2}-\d{2}$/.test(ref)) return null;
  if (nasc > ref) return null;
  let anos = Number(ref.slice(0, 4)) - Number(nasc.slice(0, 4));
  if (ref.slice(5) < nasc.slice(5)) anos -= 1;
  return anos;
}

export function ehMenorDeIdade(nascimentoISO, refISO) {
  const idade = idadeEmAnos(nascimentoISO, refISO || hojeBRT());
  if (idade === null) return false;
  return idade < MAIORIDADE;
}


export function exigeResponsavel(evento, nascimentoISO, refISO) {
  if (!evento || !evento.exige_dados_menor) return false;
  return ehMenorDeIdade(nascimentoISO, refISO);
}
