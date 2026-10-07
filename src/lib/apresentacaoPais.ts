








export function nomeChave(nome: unknown): string {
  return String(nome ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}


export function paisIguais(nomePai: unknown, nomeMae: unknown): boolean {
  const a = nomeChave(nomePai);
  const b = nomeChave(nomeMae);
  return Boolean(a) && a === b;
}


export function nomesDosPaisUnicos(nomePai: unknown, nomeMae: unknown): string[] {
  const out: string[] = [];
  const vistos = new Set<string>();
  for (const n of [nomePai, nomeMae]) {
    const s = String(n ?? '').trim().replace(/\s+/g, ' ');
    if (!s) continue;
    const k = nomeChave(s);
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push(s);
  }
  return out;
}

















export function exigeConfirmacaoPaisIguais(
  nomePai: unknown, nomeMae: unknown, confirmado: unknown,
): boolean {
  return paisIguais(nomePai, nomeMae) && confirmado !== true;
}

export const AVISO_PAIS_IGUAIS =
  'Você escreveu o mesmo nome no campo do pai e no da mãe. Se é a mesma pessoa, tudo bem — '
  + 'mas o certificado vai sair com esse nome UMA vez só, e não com dois responsáveis. Confere?';
