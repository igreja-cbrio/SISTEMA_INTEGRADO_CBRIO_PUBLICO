










export type Pergunta = {


  id?: string;
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

const COM_OPCOES = ['opcao_unica', 'multipla'];
const ESCALAS = ['escala_5', 'estrelas_5'];








export function trocarTipoPergunta(p: Pergunta, tipo: string): Pergunta {
  const limpo: Pergunta = {
    id: p.id, tipo, texto: p.texto, descricao: p.descricao,
    obrigatoria: p.obrigatoria, mostrar_se: p.mostrar_se, sensivel: p.sensivel,
  };












  if (p.preenche_de) limpo.preenche_de = p.preenche_de;



  if (tipo === 'busca') {
    if (p.catalogo) limpo.catalogo = p.catalogo;
    if (p.permite_outro !== undefined) limpo.permite_outro = p.permite_outro;
  }
  if (COM_OPCOES.includes(tipo)) {
    limpo.opcoes = p.opcoes?.length ? p.opcoes : ['Opção 1', 'Opção 2'];
    const neutras = p.opcoes_neutras?.filter((n) => limpo.opcoes?.includes(n));
    if (neutras?.length) limpo.opcoes_neutras = neutras;
  }
  if (ESCALAS.includes(tipo)) {
    limpo.rotulos = p.rotulos;
    if (p.permite_nao_se_aplica) limpo.permite_nao_se_aplica = true;
  }
  if (tipo === 'nps') limpo.max = 10;
  if (tipo === 'numero') { limpo.min_num = p.min_num ?? 0; limpo.max_num = p.max_num ?? 99; }
  if (tipo === 'texto_curto') limpo.formato = p.formato;
  if (tipo === 'sim_nao' && p.acao === 'cuidado') {
    limpo.acao = 'cuidado'; limpo.cuidado_tipo = p.cuidado_tipo;
  }











  if ((tipo === 'sim_nao' || tipo === 'opcao_unica') && p.acao === 'consentimento') {
    limpo.acao = 'consentimento'; limpo.consentimento_tipo = p.consentimento_tipo;
  }
  if (tipo === 'secao') { delete limpo.obrigatoria; delete limpo.sensivel; delete limpo.mostrar_se; }
  return limpo;
}






export function validarOrdem(lista: Pergunta[]): string | null {
  const vistos = new Set<string>();
  for (const p of lista) {
    const dep = p.mostrar_se?.pergunta;
    if (dep && !vistos.has(dep)) {
      return `“${p.texto}” só aparece dependendo de uma pergunta anterior. Nesta ordem ela ficaria antes da pergunta de que depende.`;
    }
    if (p.id) vistos.add(p.id);
  }
  return null;
}
















export function moverPergunta(
  lista: Pergunta[],
  de: number,
  para: number,
): { lista: Pergunta[]; erro: string | null } {
  if (de < 0 || de >= lista.length) return { lista, erro: null };
  const destino = Math.max(0, Math.min(lista.length - 1, para));
  if (destino === de) return { lista, erro: null };

  const proximo = [...lista];
  const [movida] = proximo.splice(de, 1);
  proximo.splice(destino, 0, movida);

  const erro = validarOrdem(proximo);
  if (erro) return { lista, erro };
  return { lista: proximo, erro: null };
}













export function removerPerguntas(
  lista: Pergunta[],
  indices: number[],
): { lista: Pergunta[]; erro: string | null } {
  const alvo = new Set(indices.filter((i) => i >= 0 && i < lista.length));
  if (!alvo.size) return { lista, erro: null };

  const idsRemovidos = new Set(
    [...alvo].map((i) => lista[i].id).filter((id): id is string => !!id),
  );
  const restantes = lista.filter((_, i) => !alvo.has(i));

  const orfas = restantes.filter(
    (q) => q.mostrar_se?.pergunta && idsRemovidos.has(q.mostrar_se.pergunta),
  );
  if (orfas.length) {
    const nomes = orfas.map((o) => `“${o.texto || 'sem texto'}”`).join(', ');
    return {
      lista,
      erro: `Não é possível apagar: ${nomes} ${orfas.length > 1 ? 'dependem' : 'depende'} de uma pergunta da seleção. Inclua ${orfas.length > 1 ? 'essas perguntas' : 'essa pergunta'} na seleção ou remova a condicional ${orfas.length > 1 ? 'delas' : 'dela'} primeiro.`,
    };
  }
  return { lista: restantes, erro: null };
}













export function moverOpcao(p: Pergunta, de: number, para: number): Partial<Pergunta> {
  const opcoes = p.opcoes || [];
  if (de < 0 || de >= opcoes.length) return {};
  const destino = Math.max(0, Math.min(opcoes.length - 1, para));
  if (destino === de) return {};
  const proximo = [...opcoes];
  const [movida] = proximo.splice(de, 1);
  proximo.splice(destino, 0, movida);
  return { opcoes: proximo };
}


export function selecionadasComResposta(lista: Pergunta[], indices: number[]): number {
  const alvo = new Set(indices);
  return lista.filter((p, i) => alvo.has(i) && !!p.id).length;
}






export function indiceApos(aberta: number | null, de: number, para: number): number | null {
  if (aberta === null) return null;
  if (aberta === de) return para;

  if (de < aberta && aberta <= para) return aberta - 1;

  if (para <= aberta && aberta < de) return aberta + 1;
  return aberta;
}





export function renomearOpcao(p: Pergunta, i: number, valor: string): Partial<Pergunta> {
  const opcoes = p.opcoes || [];
  const antigo = opcoes[i];
  const neutras = p.opcoes_neutras || [];
  return {
    opcoes: opcoes.map((o, j) => (j === i ? valor : o)),
    opcoes_neutras: neutras.map((n) => (n === antigo ? valor : n)),
  };
}
