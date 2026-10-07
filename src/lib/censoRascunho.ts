



















export function soDigitos(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '');
}












export function podeAplicarRascunho(donoCpf: unknown, cpfDigitado: unknown): boolean {
  const dono = soDigitos(donoCpf);
  const digitado = soDigitos(cpfDigitado);
  if (dono.length !== 11) return false;
  if (digitado.length !== 11) return false;
  return dono === digitado;
}
