











export function soDigitos(v: unknown): string {
  return String(v ?? '').replace(/\D+/g, '');
}





export function codigoConfirmado(leituras: string[]): string | null {
  const contagem = new Map<string, number>();
  for (const l of leituras) {
    const d = soDigitos(l);
    if (d.length !== 44) continue;
    contagem.set(d, (contagem.get(d) || 0) + 1);
  }
  let melhor: string | null = null;
  let n = 0;
  for (const [k, v] of contagem) if (v > n) { melhor = k; n = v; }
  return n >= 2 ? melhor : null;
}

export type Aviso = { tipo: string; texto: string };
export type RespostaLeitura = {
  ok: boolean;
  motivo?: string | null;
  tipo?: string | null;
  escaneado?: boolean;
  ler_codigo_de_barras?: boolean;
  campos?: Record<string, unknown>;
  origem?: Record<string, string>;
  avisos?: Aviso[];
  extras?: {
    mesmo_boleto?: Array<Record<string, unknown>>;
    mesmo_valor_data?: Array<Record<string, unknown>>;
    indisponivel?: string[];
    unico?: boolean;
    historico?: Record<string, unknown> | null;
  } | null;
};



const CAMPOS_FORM: Array<[string, string]> = [
  ['descricao', 'descricao'],
  ['fornecedor', 'fornecedor'],
  ['valor', 'valor'],
  ['data_vencimento', 'data_vencimento'],
  ['plano_contas_id', 'plano_contas_id'],
  ['centro_custo_id', 'centro_custo_id'],
];

const vazio = (v: unknown) => v == null || v === '';

export type FormPagar = Record<string, unknown> & { _boleto?: unknown };




export function aplicarSugestaoNoForm(form: FormPagar, resp: RespostaLeitura, { sobrescrever = false } = {}) {
  const campos = resp?.campos || {};
  const origem = resp?.origem || {};
  const novo: FormPagar = { ...form };
  const preenchidos: string[] = [];
  const mantidos: string[] = [];
  for (const [chaveForm, chaveResp] of CAMPOS_FORM) {
    const v = campos[chaveResp];
    if (vazio(v)) continue;
    if (!vazio(form[chaveForm]) && !sobrescrever) {
      if (String(form[chaveForm]) !== String(v)) mantidos.push(chaveForm);
      continue;
    }
    novo[chaveForm] = v;
    preenchidos.push(chaveForm);
  }
  if (resp?.ok) {
    novo.codigo_barras = campos.codigo_barras ?? null;
    novo.linha_digitavel = campos.linha_digitavel ?? null;
    if (vazio(form.forma_pagamento) || sobrescrever) novo.forma_pagamento = 'Boleto';
  }
  if (!vazio(campos.beneficiario_cnpj)) novo.beneficiario_cnpj = campos.beneficiario_cnpj;


  const origemAplicada: Record<string, string> = {};
  for (const k of [...preenchidos, 'codigo_barras', 'beneficiario_cnpj']) {
    const o = origem[k];
    if (o && (k !== 'codigo_barras' || resp?.ok)) origemAplicada[k] = o;
  }
  novo.boleto_origem_campos = Object.keys(origemAplicada).length ? origemAplicada : null;
  return { form: novo, preenchidos, mantidos };
}


export function camposBoletoDoForm(form: FormPagar) {
  const out: Record<string, unknown> = {};
  if (!vazio(form.codigo_barras)) out.codigo_barras = form.codigo_barras;
  if (!vazio(form.beneficiario_cnpj)) out.beneficiario_cnpj = form.beneficiario_cnpj;
  if (form.boleto_origem_campos && typeof form.boleto_origem_campos === 'object') out.boleto_origem_campos = form.boleto_origem_campos;
  return out;
}

const ROTULO_ORIGEM: Record<string, string> = {
  pdf: 'lido do código no PDF',
  linha_digitada: 'da linha digitada',
  leitura_codigo: 'lido do código de barras',
  texto: 'lido do texto do boleto · confira',
  cadastro: 'do cadastro de fornecedores',
  historico: 'da última conta deste fornecedor',
  digitado: 'digitado',
};

export function rotuloOrigem(origem: string | null | undefined): string | null {
  return origem ? ROTULO_ORIGEM[origem] || null : null;
}

export function mensagemMotivo(motivo: string | null | undefined, { escaneado = false } = {}): string {
  switch (motivo) {
    case 'digito_verificador':
      return 'A linha encontrada não confere (dígito verificador). Digite ou cole a linha digitável do boleto.';
    case 'tamanho_invalido':
      return 'A linha digitável precisa ter 47 dígitos (boleto) ou 48 (conta de consumo e tributo).';
    case 'identificador_invalido':
      return 'Esta linha não é de um boleto nem de uma conta de consumo. Confira os números.';
    case 'vazio':
      return 'Informe a linha digitável.';
    default:
      return escaneado
        ? 'Este arquivo é uma imagem e não deu para ler o código de barras. Digite ou cole a linha digitável.'
        : 'Não encontramos a linha digitável neste arquivo. Digite ou cole a linha digitável.';
  }
}



export function formatarLinha(linha: string | null | undefined): string {
  const d = soDigitos(linha);
  if (d.length === 47) {
    return `${d.slice(0, 5)}.${d.slice(5, 10)} ${d.slice(10, 15)}.${d.slice(15, 21)} ${d.slice(21, 26)}.${d.slice(26, 32)} ${d[32]} ${d.slice(33)}`;
  }
  if (d.length === 48) return [0, 12, 24, 36].map(i => `${d.slice(i, i + 11)}-${d[i + 11]}`).join(' ');
  return d;
}
