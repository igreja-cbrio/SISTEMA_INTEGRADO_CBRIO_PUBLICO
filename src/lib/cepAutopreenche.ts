










export const CAMPOS_DO_CEP = ['endereco', 'bairro', 'cidade', 'uf'] as const;
export type CampoDoCep = (typeof CAMPOS_DO_CEP)[number];

export type EnderecoCep = Partial<Record<CampoDoCep, string>>;


export function mascaraCep(valor: string): string {
  const d = String(valor || '').replace(/\D/g, '').slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

export function cepCompleto(valor: string): boolean {
  return String(valor || '').replace(/\D/g, '').length === 8;
}











export function mapearViaCep(json: unknown): EnderecoCep | null {
  if (!json || typeof json !== 'object') return null;
  const j = json as Record<string, unknown>;
  if (j.erro === true || j.erro === 'true') return null;

  const texto = (v: unknown) => String(v ?? '').trim();
  const out: EnderecoCep = {};
  const logradouro = texto(j.logradouro);
  const bairro = texto(j.bairro);
  const cidade = texto(j.localidade);
  const uf = texto(j.uf);
  if (logradouro) out.endereco = logradouro;
  if (bairro) out.bairro = bairro;
  if (cidade) out.cidade = cidade;
  if (uf) out.uf = uf;



  return out.cidade ? out : null;
}

type PerguntaMin = { id: string; preenche_de?: string };










export function aplicarEndereco(
  perguntas: PerguntaMin[],
  respostas: Record<string, unknown>,
  dados: EnderecoCep,
  jaDoCep: Set<string> = new Set(),
): { respostas: Record<string, unknown>; preenchidas: string[] } {
  const proximas = { ...respostas };
  const preenchidas: string[] = [];

  for (const p of perguntas) {
    const campo = p.preenche_de as CampoDoCep | undefined;
    if (!campo || !CAMPOS_DO_CEP.includes(campo)) continue;
    const novo = dados[campo];
    if (!novo) continue;

    const atual = proximas[p.id];
    const vazio = atual === undefined || atual === null || String(atual).trim() === '';
    if (!vazio && !jaDoCep.has(p.id)) continue;

    if (String(atual ?? '') !== novo) proximas[p.id] = novo;
    preenchidas.push(p.id);
  }
  return { respostas: proximas, preenchidas };
}








export async function buscarCep(cep: string, timeoutMs = 6000): Promise<EnderecoCep | null> {
  const d = String(cep || '').replace(/\D/g, '');
  if (d.length !== 8) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`https://viacep.com.br/ws/${d}/json/`, { signal: ctrl.signal });
    if (!r.ok) return null;
    return mapearViaCep(await r.json());
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
