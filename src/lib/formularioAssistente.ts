







let emPreenchimento = false;

export function marcarFormularioEmPreenchimento(valor: boolean): void {
  emPreenchimento = valor;
}

export function formularioEmPreenchimento(): boolean {
  return emPreenchimento;
}
