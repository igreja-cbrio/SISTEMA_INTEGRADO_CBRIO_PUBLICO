








import { formasDaCategoria, exigeComprovante } from './conclusaoPagamentoTela';

export const STATUS_CORRIGIVEIS = ['concluido', 'avaliado', 'aguardando_entrega'];
const CATEGORIAS_PAGAS = ['reembolso', 'pagamento', 'compras', 'servico'];

export const CAMPOS_CORRIGIVEIS = [
  'titulo', 'descricao', 'justificativa', 'motivo_reembolso',
  'pagamento_forma', 'pagamento_data', 'pago_valor', 'pago_observacao',
] as const;
export type CampoCorrigivel = typeof CAMPOS_CORRIGIVEIS[number];

export const ROTULO_CAMPO: Record<string, string> = {
  titulo: 'título',
  descricao: 'descrição',
  justificativa: 'justificativa',
  motivo_reembolso: 'motivo do reembolso',
  pagamento_forma: 'forma de pagamento',
  pagamento_data: 'data do pagamento',
  pago_valor: 'valor pago',
  pago_observacao: 'observação do pagamento',
  comprovante: 'comprovante',
};

export const MOTIVO_MIN = 10;

type SolCorrecao = {
  categoria?: string | null; status?: string | null; pago_em?: string | null;
  deleted_at?: string | null; fin_transacao_id?: string | null; solicitante_id?: string | null;
};


export function elegivelParaCorrecao(s: SolCorrecao | null | undefined): boolean {
  if (!s || s.deleted_at) return false;
  if (!s.categoria || !CATEGORIAS_PAGAS.includes(s.categoria)) return false;
  if (s.status === 'rejeitado' || s.status === 'cancelado') return false;
  if (!s.pago_em) return false;
  return !!s.status && STATUS_CORRIGIVEIS.includes(s.status);
}


export function podeCorrigir(s: SolCorrecao | null | undefined, opts: { atendeArea: boolean; usuarioId?: string | null }): boolean {
  if (!opts.atendeArea) return false;
  if (!elegivelParaCorrecao(s)) return false;
  if (opts.usuarioId && s?.solicitante_id && opts.usuarioId === s.solicitante_id) return false;
  return true;
}

export function camposCorrigiveis(s: SolCorrecao | null | undefined): CampoCorrigivel[] {
  const lancada = !!s?.fin_transacao_id;
  return CAMPOS_CORRIGIVEIS.filter((c) => {
    if (c === 'motivo_reembolso' && s?.categoria !== 'reembolso') return false;
    if (lancada && (c === 'pago_valor' || c === 'pagamento_data')) return false;
    return true;
  });
}

export type FormCorrecao = Partial<Record<CampoCorrigivel, string>> & { motivo: string };

function texto(v: unknown): string {
  return v == null ? '' : String(v).trim();
}

function centavos(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) : null;
  const s = String(v).trim().replace(/[R$\s]/g, '');
  if (!s) return null;
  const normal = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  if (!/^-?\d+(\.\d+)?$/.test(normal)) return NaN;
  return Math.round(Number(normal) * 100);
}


export function formInicial(s: Record<string, unknown>): FormCorrecao {
  const v = Number(s.pago_valor);
  return {
    titulo: texto(s.titulo),
    descricao: texto(s.descricao),
    justificativa: texto(s.justificativa),
    motivo_reembolso: texto(s.motivo_reembolso),
    pagamento_forma: texto(s.pagamento_forma),
    pagamento_data: s.pagamento_data ? String(s.pagamento_data).slice(0, 10) : '',
    pago_valor: Number.isFinite(v) && v > 0 ? v.toFixed(2).replace('.', ',') : '',
    pago_observacao: texto(s.pago_observacao),
    motivo: '',
  };
}



export function camposAlterados(s: Record<string, unknown>, form: FormCorrecao): Partial<Record<CampoCorrigivel, string>> {
  const permitidos = camposCorrigiveis(s as SolCorrecao);
  const out: Partial<Record<CampoCorrigivel, string>> = {};
  for (const c of permitidos) {
    const novo = form[c];
    if (novo === undefined) continue;
    if (c === 'pago_valor') {
      if (centavos(novo) !== centavos(s.pago_valor)) out[c] = novo;
      continue;
    }
    if (c === 'pagamento_data') {
      const antes = s.pagamento_data ? String(s.pagamento_data).slice(0, 10) : '';
      if (texto(novo) !== antes) out[c] = texto(novo);
      continue;
    }
    if (texto(novo) !== texto(s[c])) out[c] = texto(novo);
  }
  return out;
}


export function motivoBloqueioCorrecao(p: {
  sol: Record<string, unknown>; form: FormCorrecao; temArquivo: boolean;
  temComprovanteAtual: boolean; hojeIso: string;
}): string | null {
  const { sol, form, temArquivo, temComprovanteAtual, hojeIso } = p;
  const alterados = camposAlterados(sol, form);
  if (!Object.keys(alterados).length && !temArquivo) return 'Altere algum campo ou anexe o comprovante novo.';
  if ('titulo' in alterados && !texto(alterados.titulo)) return 'O título não pode ficar vazio.';
  if (alterados.pagamento_forma !== undefined && !formasDaCategoria(String(sol.categoria || '')).includes(alterados.pagamento_forma)) {
    return 'Escolha uma forma de pagamento válida.';
  }
  if (alterados.pagamento_data !== undefined) {
    const d = alterados.pagamento_data;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return 'Data do pagamento inválida.';
    if (hojeIso && d > hojeIso) return 'A data do pagamento não pode ser no futuro.';
  }
  if (alterados.pago_valor !== undefined) {
    const c = centavos(alterados.pago_valor);
    if (c == null || !Number.isInteger(c) || c <= 0) return 'Valor pago inválido.';
  }
  const formaFinal = alterados.pagamento_forma || String(sol.pagamento_forma || '');
  if (exigeComprovante(formaFinal) && !temArquivo && !temComprovanteAtual) {
    return 'Esta forma de pagamento exige o comprovante anexado.';
  }
  if (texto(form.motivo).length < MOTIVO_MIN) return `Explique o motivo da correção (mínimo ${MOTIVO_MIN} caracteres).`;
  return null;
}



export const MOTIVOS_DE_DEVOLUCAO = ['descricao', 'escopo', 'data'];

export function podeRetirarAjusteTela(p: {
  sol: { status?: string | null; status_antes_ajuste?: string | null; deleted_at?: string | null; solicitante_id?: string | null } | null | undefined;
  ultimoAjuste: { lado?: string | null; motivo?: string | null } | null | undefined;
  atendeArea: boolean;
  usuarioId?: string | null;
}): boolean {
  const { sol, ultimoAjuste, atendeArea, usuarioId } = p;
  if (!atendeArea || !sol || sol.deleted_at) return false;

  if (usuarioId && sol.solicitante_id && usuarioId === sol.solicitante_id) return false;
  if (sol.status !== 'aguardando_ajuste' || !sol.status_antes_ajuste) return false;
  return !!ultimoAjuste && ultimoAjuste.lado === 'responsavel' && MOTIVOS_DE_DEVOLUCAO.includes(String(ultimoAjuste.motivo));
}
