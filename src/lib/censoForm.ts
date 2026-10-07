
















export type Pergunta = {
  id: string;
  tipo: string;
  texto: string;
  descricao?: string;
  obrigatoria?: boolean;
  opcoes?: string[];
  opcoes_neutras?: string[];
  rotulos?: { min?: string; max?: string };
  max?: number;
  min_num?: number;
  max_num?: number;
  formato?: string;
  mostrar_se?: { pergunta: string; valores: string[] };
  sensivel?: boolean;
  acao?: string;
  cuidado_tipo?: string;


  consentimento_tipo?: string;
  permite_nao_se_aplica?: boolean;
  preenche_de?: string;



  catalogo?: string;



  permite_outro?: boolean;
};

export type Respostas = Record<string, unknown>;

export const NAO_SE_APLICA = 'Não se aplica';
export const TIPOS_SEM_RESPOSTA = ['secao'];


export function visivel(p: Pergunta, respostas: Respostas): boolean {
  const cond = p?.mostrar_se;
  if (!cond?.pergunta) return true;
  const bruto = respostas?.[cond.pergunta];
  if (bruto === undefined || bruto === null) return false;
  const dadas = (Array.isArray(bruto) ? bruto : [bruto]).map((v) => String(v).trim());
  return cond.valores.some((v) => dadas.includes(String(v).trim()));
}

export function ehNeutra(p: Pergunta, valor: unknown): boolean {
  const v = String(valor ?? '').trim();
  if (p?.permite_nao_se_aplica === true && v === NAO_SE_APLICA) return true;
  return (p?.opcoes_neutras || []).includes(v);
}






export function aplicarNeutraExclusiva(p: Pergunta, valores: unknown[]): string[] {
  const opts = (valores || []).map((v) => String(v ?? '').trim()).filter(Boolean);
  const neutra = opts.find((o) => ehNeutra(p, o));
  return neutra ? [neutra] : opts;
}


export function alternarOpcao(p: Pergunta, atuais: unknown, opcao: string): string[] {
  const lista = Array.isArray(atuais) ? atuais.map(String) : [];
  const jaTem = lista.includes(opcao);

  if (ehNeutra(p, opcao)) return jaTem ? [] : [opcao];
  const semNeutra = lista.filter((o) => !ehNeutra(p, o));
  return jaTem ? semNeutra.filter((o) => o !== opcao) : [...semNeutra, opcao];
}

function vazio(v: unknown): boolean {
  return v === undefined || v === null
    || (typeof v === 'string' && v.trim() === '')
    || (Array.isArray(v) && v.length === 0);
}






export function faltando(perguntas: Pergunta[], respostas: Respostas): Pergunta[] {
  return (perguntas || []).filter((p) => (
    !TIPOS_SEM_RESPOSTA.includes(p.tipo)
    && p.obrigatoria === true
    && visivel(p, respostas)
    && vazio(respostas[p.id])
  ));
}

export type Bloco = { titulo: string; perguntas: Pergunta[] };







export function blocosVisiveis(perguntas: Pergunta[], respostas: Respostas): Bloco[] {
  const blocos: Bloco[] = [];
  let atual: Bloco | null = null;
  for (const p of perguntas || []) {
    if (p.tipo === 'secao') { atual = { titulo: p.texto, perguntas: [] }; blocos.push(atual); continue; }
    if (!visivel(p, respostas)) continue;
    if (!atual) { atual = { titulo: '', perguntas: [] }; blocos.push(atual); }
    atual.perguntas.push(p);
  }
  return blocos.filter((b) => b.perguntas.length > 0);
}


export function progresso(perguntas: Pergunta[], respostas: Respostas): { feitas: number; total: number; pct: number } {
  const visiveis = (perguntas || []).filter(
    (p) => !TIPOS_SEM_RESPOSTA.includes(p.tipo) && visivel(p, respostas),
  );
  const feitas = visiveis.filter((p) => !vazio(respostas[p.id])).length;
  const total = visiveis.length;
  return { feitas, total, pct: total ? Math.round((feitas / total) * 100) : 0 };
}






export function limparInvisiveis(perguntas: Pergunta[], respostas: Respostas): Respostas {
  const out: Respostas = {};
  for (const p of perguntas || []) {
    if (TIPOS_SEM_RESPOSTA.includes(p.tipo)) continue;
    if (respostas[p.id] !== undefined && visivel(p, respostas)) out[p.id] = respostas[p.id];
  }
  return out;
}































export function cpfValido(valor: unknown): boolean {
  const cpf = soDigitosCenso(valor);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (ate: number, peso: number) => {
    let soma = 0;
    for (let i = 0; i < ate; i += 1) soma += Number(cpf[i]) * (peso - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9, 10) === Number(cpf[9]) && dv(10, 11) === Number(cpf[10]);
}

function soDigitosCenso(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '');
}

export type Problema = { id: string; texto: string; motivo: string };








export function invalidos(perguntas: Pergunta[], respostas: Respostas): Problema[] {
  const out: Problema[] = [];
  const marca = (p: Pergunta, motivo: string) => out.push({ id: p.id, texto: p.texto, motivo });

  for (const p of perguntas || []) {
    if (TIPOS_SEM_RESPOSTA.includes(p.tipo)) continue;
    if (!visivel(p, respostas)) continue;
    const bruto = respostas[p.id];
    if (vazio(bruto)) continue;


    if (p.formato === 'cpf') {
      if (!cpfValido(bruto)) marca(p, 'CPF inválido — confira os números.');
      continue;
    }
    if (p.tipo === 'data') {
      const v = String(bruto).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) {
        marca(p, 'Data incompleta — escolha o dia, o mês e o ano.');
      }
      continue;
    }
    if (p.tipo === 'opcao_unica' || p.tipo === 'sim_nao') {
      const permitidas = p.opcoes || (p.tipo === 'sim_nao' ? ['Sim', 'Não'] : null);
      if (permitidas && !permitidas.includes(String(bruto).trim())) {
        marca(p, 'Escolha uma das opções.');
      }
      continue;
    }
    if (p.tipo === 'numero' || p.tipo === 'nps' || p.tipo === 'escala_5' || p.tipo === 'estrelas_5') {
      if (p.permite_nao_se_aplica === true && String(bruto).trim() === NAO_SE_APLICA) continue;
      const n = Number(bruto);
      const [min, max] = p.tipo === 'nps' ? [0, p.max ?? 10]
        : p.tipo === 'numero' ? [p.min_num ?? 0, p.max_num ?? 99]
          : [1, 5];
      if (!Number.isFinite(n)) marca(p, 'Digite um número.');
      else if (n < min || n > max) marca(p, `Use um número entre ${min} e ${max}.`);
      continue;
    }


    if (p.formato === 'email') {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(String(bruto).trim())) {
        marca(p, 'E-mail inválido — confira se tem @ e o final (.com, .br).');
      }
      continue;
    }
    if (p.formato === 'telefone') {
      const d = soDigitosCenso(bruto);
      if (d.length < 10 || d.length > 11) marca(p, 'Telefone incompleto — com DDD, 10 ou 11 números.');
      continue;
    }
    if (p.formato === 'cep') {
      if (soDigitosCenso(bruto).length !== 8) marca(p, 'CEP incompleto — são 8 números.');
      continue;
    }
  }
  return out;
}









export function bloqueios(perguntas: Pergunta[], respostas: Respostas): Problema[] {
  const out: Problema[] = faltando(perguntas, respostas)
    .map((p) => ({ id: p.id, texto: p.texto, motivo: 'Precisa responder.' }));
  const jaTem = new Set(out.map((o) => o.id));
  for (const i of invalidos(perguntas, respostas)) if (!jaTem.has(i.id)) out.push(i);

  const ordem = new Map((perguntas || []).map((p, i) => [p.id, i]));
  return out.sort((a, b) => (ordem.get(a.id) ?? 0) - (ordem.get(b.id) ?? 0));
}
