import { totemKids } from '../api';

export async function senhaTotemValida(senha: string): Promise<boolean> {
  if (!senha.trim()) return false;
  try {
    const resposta = await totemKids.editSenha.verificar(senha.trim());
    return resposta?.ok === true;
  } catch {
    return false;
  }
}
