






















export type ValorGrafico = { valor: string; total: number; pct: number; neutra: boolean };
export type GraficoPerfil = {
  tipo: string; id: string; texto: string; sensivel?: boolean;
  base?: number; neutras?: number; total?: number; media?: number | null;
  aberta?: boolean; valores?: ValorGrafico[];
  valores_ocultos?: number; valores_ocultos_pessoas?: number;
};

export const VALORES_CENSO = ['seguir', 'conectar', 'investir', 'servir', 'generosidade'] as const;
export type ValorCenso = typeof VALORES_CENSO[number];

export const ROTULO_VALOR: Record<ValorCenso, { label: string; ajuda: string }> = {
  seguir: { label: 'Seguir', ajuda: 'batizou, fez o Next ou registrou decisão' },
  conectar: { label: 'Grupos', ajuda: 'está num grupo ou esteve nos últimos 12 meses' },
  investir: { label: 'Investir', ajuda: 'devocional concluído nos últimos 12 meses' },
  servir: { label: 'Voluntários', ajuda: 'cadastro de voluntário ativo ou nos últimos 12 meses' },
  generosidade: { label: 'Generosidade', ajuda: 'dízimo ou oferta nos últimos 12 meses' },
};

export const DEMO_CHAVES = ['faixa_etaria', 'genero', 'estado_civil', 'bairro', 'status_membro'] as const;
export type DemoChave = typeof DEMO_CHAVES[number];

export type PessoaCruzamento = {
  id: string;
  nome: string;
  membro: boolean;
  d: Record<DemoChave, string>;

  bn: string | null;

  a: Record<string, string[]>;

  v: Partial<Record<ValorCenso, boolean>> | null;
};


export type CruzamentoBruto = {
  dicionario: Record<string, string[]>;
  pessoas: (Omit<PessoaCruzamento, 'a'> & { a: Record<string, number[]> })[];
  sensiveis_fora?: boolean;
  generosidade_visivel?: boolean;
  valores_indisponiveis?: string[];
  valores_desde?: string;
};


export function decodificarCruzamento(bruto: CruzamentoBruto): PessoaCruzamento[] {
  const dic = bruto.dicionario || {};
  return (bruto.pessoas || []).map((p) => {
    const a: Record<string, string[]> = {};
    for (const [pid, cods] of Object.entries(p.a || {})) {
      a[pid] = cods.map((c) => dic[pid]?.[c]).filter((v): v is string => v != null);
    }
    return { ...p, a };
  });
}


export type Filtros = Record<string, string[]>;

export const campoPergunta = (id: string) => `p:${id}`;
export const campoDemografia = (k: DemoChave) => `d:${k}`;
export const CAMPO_MAPA = 'mapa';

function valoresDoCampo(p: PessoaCruzamento, campo: string): string[] {
  if (campo === CAMPO_MAPA) return p.bn ? [p.bn] : [];
  if (campo.startsWith('d:')) {
    const v = p.d[campo.slice(2) as DemoChave];
    return v ? [v] : [];
  }
  if (campo.startsWith('p:')) return p.a[campo.slice(2)] || [];
  return [];
}


export function alternarFiltro(filtros: Filtros, campo: string, valor: string): Filtros {
  const atual = filtros[campo] || [];
  const prox = atual.includes(valor) ? atual.filter((v) => v !== valor) : [...atual, valor];
  const out = { ...filtros };
  if (prox.length) out[campo] = prox; else delete out[campo];
  return out;
}

export function temFiltro(filtros: Filtros): boolean {
  return Object.values(filtros).some((v) => v.length > 0);
}


export function filtrarPessoas(pessoas: PessoaCruzamento[], filtros: Filtros): PessoaCruzamento[] {
  const ativos = Object.entries(filtros).filter(([, vs]) => vs.length > 0);
  if (!ativos.length) return pessoas;
  return pessoas.filter((p) => ativos.every(([campo, escolhidos]) => {
    const dele = valoresDoCampo(p, campo);
    return dele.some((v) => escolhidos.includes(v));
  }));
}

const um = (n: number) => Math.round(n * 1000) / 10;
const TIPOS_NUMERICOS = ['numero', 'escala_5', 'estrelas_5', 'nps'];







export function recontarGrafico(g: GraficoPerfil, pessoas: PessoaCruzamento[]): GraficoPerfil {
  if (g.tipo === 'secao') return g;


  if (g.aberta && !(g.valores || []).length) return g;
  const contagem = new Map<string, number>();
  for (const p of pessoas) {
    for (const v of new Set(p.a[g.id] || [])) contagem.set(v, (contagem.get(v) || 0) + 1);
  }
  const listados = g.valores || [];
  const neutra = new Map(listados.map((v) => [v.valor, v.neutra]));
  let base = 0; let neutras = 0;
  for (const [valor, n] of contagem) {
    if (neutra.get(valor)) neutras += n; else base += n;
  }
  const total = base + neutras;
  const valores = listados.map((v) => {
    const n = contagem.get(v.valor) || 0;
    return {
      ...v, total: n,
      pct: v.neutra ? (total ? um(n / total) : 0) : (base ? um(n / base) : 0),
    };
  });
  const listadosSet = new Set(listados.map((v) => v.valor));
  let ocultos = 0; let ocultosPessoas = 0;
  for (const [valor, n] of contagem) {
    if (listadosSet.has(valor) || n <= 0) continue;
    ocultos += 1; ocultosPessoas += n;
  }
  let media: number | null = g.media ?? null;
  if (TIPOS_NUMERICOS.includes(g.tipo)) {
    let soma = 0;
    for (const [valor, n] of contagem) {
      if (neutra.get(valor)) continue;
      const x = Number(valor);
      if (Number.isFinite(x)) soma += x * n;
    }
    media = base ? Math.round((soma / base) * 100) / 100 : null;
  }
  return {
    ...g, base, neutras, total, media, valores,
    valores_ocultos: ocultos, valores_ocultos_pessoas: ocultosPessoas,
  };
}

const SEM_DADO = '(não informado)';
const ORDEM_FAIXA = ['0-11', '12-17', '18-24', '25-34', '35-44', '45-59', '60+'];
const TETO_BAIRRO = 12;






export function recontarDemografia(pessoas: PessoaCruzamento[]) {
  const demografia = {} as Record<DemoChave, { valor: string; total: number }[]>;
  const ocultos: Record<string, { valores: number; pessoas: number }> = {};
  for (const k of DEMO_CHAVES) {
    const c = new Map<string, number>();
    for (const p of pessoas) {
      const v = p.d[k] || SEM_DADO;
      c.set(v, (c.get(v) || 0) + 1);
    }
    const lista = [...c.entries()].map(([valor, total]) => ({ valor, total }))
      .sort((a, b) => b.total - a.total);
    if (k === 'faixa_etaria') {
      const idx = (v: string) => (ORDEM_FAIXA.includes(v) ? ORDEM_FAIXA.indexOf(v) : Number.MAX_SAFE_INTEGER);
      demografia[k] = lista.map((l, i) => ({ l, i }))
        .sort((a, b) => (idx(a.l.valor) - idx(b.l.valor)) || (a.i - b.i)).map(({ l }) => l);
    } else if (k === 'bairro' && lista.length > TETO_BAIRRO) {
      const semDado = lista.filter((v) => v.valor === SEM_DADO);
      const resto = lista.filter((v) => v.valor !== SEM_DADO);
      const fora = resto.slice(TETO_BAIRRO);
      demografia[k] = [...resto.slice(0, TETO_BAIRRO), ...semDado];
      ocultos[k] = { valores: fora.length, pessoas: fora.reduce((s, v) => s + v.total, 0) };
    } else {
      demografia[k] = lista.slice(0, 100);
    }
  }
  return { demografia, ocultos };
}

export type BairroMapa = { bairro: string; norm: string; total: number; lat: number; lng: number };


export function recontarMapa(bairros: BairroMapa[], pessoas: PessoaCruzamento[]) {
  const c = new Map<string, number>();
  for (const p of pessoas) if (p.bn) c.set(p.bn, (c.get(p.bn) || 0) + 1);
  const lista = bairros.map((b) => ({ ...b, total: c.get(b.norm) || 0 }))
    .filter((b) => b.total > 0).sort((a, b) => b.total - a.total);
  return { bairros: lista, pessoas_no_mapa: lista.reduce((s, b) => s + b.total, 0) };
}






export function resumirValores(pessoas: PessoaCruzamento[], generosidadeVisivel: boolean) {
  const comCadastro = pessoas.filter((p) => p.v);
  const base = comCadastro.length;
  const valores = VALORES_CENSO
    .filter((k) => k !== 'generosidade' || generosidadeVisivel)
    .map((k) => {
      const total = comCadastro.reduce((acc, p) => acc + (p.v?.[k] ? 1 : 0), 0);
      return { chave: k, total, pct: base ? Math.round((total / base) * 100) : 0 };
    });
  return { base, sem_cadastro: pessoas.length - base, valores };
}






export const LARGURA_PAGINA_CENSO = 1152;
export const LARGURA_COLUNA_PERGUNTAS = 1104;
export const LARGURA_QUADRO = 328;
export const VAO_QUADRO = 16;
export const LARGURA_PAGINA_COM_QUADRO = LARGURA_PAGINA_CENSO + VAO_QUADRO + LARGURA_QUADRO;


export const LIMIAR_QUADRO_LATERAL = 1410;

export function modoDoQuadro(larguraJanela: number): 'lateral' | 'flutuante' {
  if (!Number.isFinite(larguraJanela) || larguraJanela <= 0) return 'flutuante';
  return larguraJanela >= LIMIAR_QUADRO_LATERAL ? 'lateral' : 'flutuante';
}
