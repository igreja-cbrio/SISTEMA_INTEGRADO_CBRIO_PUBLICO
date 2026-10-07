










const { supabase } = require('../utils/supabase');
const { lerBoleto, hojeBrtIso, soDigitos } = require('../utils/boletoLinha');
const { lerTextoBoleto } = require('../utils/boletoTexto');
const { montarSugestao, boletoUnico, historicoDoFornecedor, tokensFornecedor } = require('../utils/contaPagarBoleto');
const { validarArquivoComprovante } = require('../utils/arquivoComprovante');



const MIN_TEXTO = 50;



const ORIGENS_CODIGO = new Set(['pdf', 'linha_digitada', 'leitura_codigo']);

async function textoDoPdf(buffer) {
  const pdf = require('pdf-parse');
  const r = await pdf(buffer);
  return String((r && r.text) || '');
}






async function extrairTexto(arquivo) {
  const v = validarArquivoComprovante(arquivo);
  if (!v.ok) return { ok: false, erro: v.erro };
  if (v.mime !== 'application/pdf') return { ok: true, mime: v.mime, texto: '', escaneado: true };
  let texto = '';
  try {
    texto = await textoDoPdf(arquivo.buffer);
  } catch (e) {

    console.warn('[CONTA-PAGAR-BOLETO] pdf-parse:', e.message);
    return { ok: true, mime: v.mime, texto: '', escaneado: true, aviso_leitura: 'Não foi possível ler o texto deste PDF.' };
  }
  const util = texto.replace(/\s+/g, '');
  return { ok: true, mime: v.mime, texto, escaneado: util.length < MIN_TEXTO };
}


function sugerir({ texto, linha, origemCodigo, agora = new Date() }) {
  const hoje = hojeBrtIso(agora);
  const opts = { referenciaIso: hoje };
  const textoInfo = texto ? lerTextoBoleto(texto, opts) : null;
  let leitura = null;
  let origem = 'pdf';
  if (linha) {
    leitura = lerBoleto(linha, opts);
    origem = ORIGENS_CODIGO.has(origemCodigo) ? origemCodigo : 'linha_digitada';
  } else if (textoInfo) {
    leitura = textoInfo.boleto;
  }
  const sugestao = montarSugestao({ leitura, texto: textoInfo, hojeIso: hoje, origemCodigo: origem });
  return { leitura, sugestao };
}

const CAMPOS_CONTA = 'id, descricao, fornecedor, valor, data_vencimento, status, origem';






async function enriquecer(sugestao) {
  const { campos, origem, avisos } = sugestao;
  const extras = { mesmo_boleto: [], mesmo_valor_data: [], fornecedor_cadastro: null, historico: null, indisponivel: [] };

  if (campos.codigo_barras) {
    const { data, error } = await supabase.from('fin_contas_pagar').select(CAMPOS_CONTA)
      .eq('codigo_barras', campos.codigo_barras).is('deleted_at', null).neq('status', 'cancelado').limit(5);
    if (error) extras.indisponivel.push('mesmo_boleto');
    else extras.mesmo_boleto = data || [];
  }
  if (campos.valor != null && campos.data_vencimento) {
    const { data, error } = await supabase.from('fin_contas_pagar').select(CAMPOS_CONTA)
      .eq('valor', campos.valor).eq('data_vencimento', campos.data_vencimento)
      .is('deleted_at', null).neq('status', 'cancelado').limit(10);
    if (error) extras.indisponivel.push('mesmo_valor_data');
    else {
      const ja = new Set(extras.mesmo_boleto.map(c => c.id));
      extras.mesmo_valor_data = (data || []).filter(c => !ja.has(c.id));
    }
  }



  const doc = soDigitos(campos.beneficiario_cnpj);
  if (doc.length === 14 || doc.length === 11) {
    const { data, error } = await supabase.from('log_fornecedores')
      .select('id, razao_social, nome_fantasia, cnpj').eq('cnpj', doc).limit(1);
    if (error) extras.indisponivel.push('fornecedor_cadastro');
    else if (data && data[0]) {
      const f = data[0];
      extras.fornecedor_cadastro = { id: f.id, nome: f.nome_fantasia || f.razao_social };
      const nome = f.razao_social || f.nome_fantasia;
      if (nome) { campos.fornecedor = nome; origem.fornecedor = 'cadastro'; }
    }
  }

  if (campos.fornecedor) {
    const tokens = [...tokensFornecedor(campos.fornecedor)].sort((a, b) => b.length - a.length);
    if (tokens.length) {
      const { data, error } = await supabase.from('fin_contas_pagar')
        .select('fornecedor, plano_contas_id, centro_custo_id, data_vencimento')
        .ilike('fornecedor', `%${tokens[0]}%`).is('deleted_at', null).not('plano_contas_id', 'is', null)
        .order('data_vencimento', { ascending: false }).limit(300);
      if (error) extras.indisponivel.push('historico');
      else {
        const h = historicoDoFornecedor(campos.fornecedor, data || []);
        if (h) {
          extras.historico = h;
          campos.plano_contas_id = h.plano_contas_id;
          origem.plano_contas_id = 'historico';
          if (h.centro_custo_id) { campos.centro_custo_id = h.centro_custo_id; origem.centro_custo_id = 'historico'; }
          avisos.push({
            tipo: 'plano_do_historico',
            texto: h.planos_distintos > 1
              ? `Plano e centro de custo sugeridos pela última conta de ${h.fornecedor}. Este fornecedor já foi lançado em ${h.planos_distintos} planos diferentes: confira.`
              : `Plano e centro de custo sugeridos pela última conta de ${h.fornecedor}.`,
          });
        }
      }
    }
  }

  if (extras.indisponivel.length) {
    avisos.push({ tipo: 'conferencia_indisponivel', texto: 'Não deu para conferir se este boleto já foi lançado. Confira na lista antes de lançar.' });
  }
  extras.unico = boletoUnico(campos.codigo_barras);
  return extras;
}

module.exports = { MIN_TEXTO, ORIGENS_CODIGO, extrairTexto, sugerir, enriquecer };
