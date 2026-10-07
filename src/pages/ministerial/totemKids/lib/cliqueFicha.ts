
















const INTERATIVOS = 'a,button,input,textarea,select,label,[role="button"],[data-sem-ficha]';

export type EntradaClique = {

  alvo: Element | null | undefined;

  temSelecao?: boolean;

  temFicha?: boolean;

  editandoNota?: boolean;
};








export function cliqueAbreFicha(e: EntradaClique): boolean {
  if (!e) return false;
  if (e.temFicha !== true) return false;
  if (e.editandoNota === true) return false;
  if (e.temSelecao === true) return false;
  const alvo = e.alvo;
  if (!alvo || typeof alvo.closest !== 'function') return false;
  if (alvo.closest(INTERATIVOS)) return false;
  return true;
}
