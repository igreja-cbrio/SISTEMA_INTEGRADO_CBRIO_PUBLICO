















import catalogo from './assistenteAcoes.json';

export type TelaAssistente = {
  id: string;
  rotulo: string;
  caminho: string;
  perm?: string;
  module?: string;
  foraDoMenu?: boolean;
};

export type FormularioAssistente = {
  id: string;
  rotulo: string;
  tela: string;
  parametros: string;
  escrita: { modulo: string; nivel: number };
  primeiroCampo: string;
};

export const TELAS: TelaAssistente[] = catalogo.telas;
export const FORMULARIOS: FormularioAssistente[] = catalogo.formularios;

export const FERRAMENTA_TELA = 'ir_para_tela';
export const FERRAMENTA_FORMULARIO = 'abrir_formulario';

export type ChamadaFerramenta = { name?: unknown; arguments?: unknown; tool_call_id?: unknown };

export type ContextoAcao = {

  podeVer: (item: { path: string; perm?: string; module?: string }) => boolean;

  podeEscrever: (modulo: string, nivel: number) => boolean;
  permissoesCarregadas: boolean;
  telaPequena: boolean;

  formularioEmPreenchimento?: boolean;
};

export type ResultadoAcao = {
  status: 'success' | 'error';
  output: string;
  navegarPara?: string;
  aviso?: string;
};

const TAM_MAX_ARGUMENTOS = 2000;

function lerArgumentos(bruto: unknown): Record<string, unknown> | null {
  if (typeof bruto !== 'string' || bruto.length > TAM_MAX_ARGUMENTOS) return null;
  try {
    const obj = JSON.parse(bruto);
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : null;
  } catch {
    return null;
  }
}

const erro = (output: string): ResultadoAcao => ({ status: 'error', output });



export function decidirAcao(chamada: ChamadaFerramenta, ctx: ContextoAcao): ResultadoAcao | null {
  const nome = chamada?.name;
  if (nome !== FERRAMENTA_TELA && nome !== FERRAMENTA_FORMULARIO) return null;

  const args = lerArgumentos(chamada.arguments);
  if (!args) return erro('Pedido inválido. Não foi possível abrir nada.');

  if (!ctx.permissoesCarregadas) {
    return erro('As permissões da pessoa ainda estão carregando. Peça para ela tentar de novo em alguns segundos.');
  }

  if (ctx.formularioEmPreenchimento) {
    return erro('A pessoa está preenchendo um formulário. Peça para ela salvar ou cancelar antes de abrir outra tela.');
  }

  if (nome === FERRAMENTA_TELA) {
    const tela = TELAS.find((t) => t.id === args.tela);
    if (!tela) return erro('Essa tela não existe na lista que o assistente pode abrir.');
    if (!ctx.podeVer({ path: tela.caminho, perm: tela.perm, module: tela.module })) {
      return erro(`A pessoa não tem acesso à tela ${tela.rotulo}. O acesso é liberado pelos administradores do sistema.`);
    }
    return {
      status: 'success',
      output: `A tela ${tela.rotulo} foi aberta para a pessoa.`,
      navegarPara: tela.caminho,
      aviso: `Assistente abriu: ${tela.rotulo}`,
    };
  }

  const formulario = FORMULARIOS.find((f) => f.id === args.formulario);
  const tela = formulario ? TELAS.find((t) => t.id === formulario.tela) : undefined;
  if (!formulario || !tela) return erro('Esse formulário não existe na lista que o assistente pode abrir.');
  if (ctx.telaPequena) {
    return erro('No celular o vídeo ocupa a tela inteira. Peça para a pessoa abrir esse cadastro pelo computador.');
  }
  if (!ctx.podeVer({ path: tela.caminho, perm: tela.perm, module: tela.module })
      || !ctx.podeEscrever(formulario.escrita.modulo, formulario.escrita.nivel)) {
    return erro(`A pessoa não tem permissão para ${formulario.rotulo.toLowerCase()}. O acesso é liberado pelos administradores do sistema.`);
  }
  return {
    status: 'success',
    output: `O formulário "${formulario.rotulo}" foi aberto vazio na tela. A pessoa deve DIGITAR os dados; não peça nem repita nenhum dado pessoal em voz alta. Oriente a começar por ${formulario.primeiroCampo}.`,
    navegarPara: `${tela.caminho}?${formulario.parametros}`,
    aviso: `Assistente abriu: ${formulario.rotulo}`,
  };
}



export function idDaChamada(chamada: ChamadaFerramenta): string | null {
  return typeof chamada?.tool_call_id === 'string' && chamada.tool_call_id ? chamada.tool_call_id : null;
}
