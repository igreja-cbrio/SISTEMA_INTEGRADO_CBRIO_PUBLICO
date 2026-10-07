










const { soDigitos } = require('./boletoLinha');



function montarSugestao({ leitura, texto, hojeIso, origemCodigo = 'codigo_barras' }) {
  const campos = {};
  const origem = {};
  const avisos = [];

  if (leitura && leitura.ok) {
    campos.codigo_barras = leitura.codigo_barras;
    campos.linha_digitavel = leitura.linha_digitavel;
    origem.codigo_barras = origemCodigo;
    if (leitura.valor_centavos != null) {
      campos.valor = leitura.valor_centavos / 100;
      origem.valor = origemCodigo;
    } else {
      avisos.push({ tipo: 'valor_aberto', texto: 'O valor não vem no código deste boleto (valor em aberto ou de referência). Preencha o valor a pagar.' });
    }
    if (leitura.vencimento) {
      campos.data_vencimento = leitura.vencimento;
      origem.data_vencimento = origemCodigo;
    }
    if (leitura.banco_nome) campos.banco = leitura.banco_nome;
  }

  const benef = texto && texto.beneficiario;
  if (benef) {
    if (benef.nome) { campos.fornecedor = benef.nome; origem.fornecedor = 'texto'; }
    campos.beneficiario_cnpj = benef.documento;
    origem.beneficiario_cnpj = 'texto';
  }

  const impresso = texto && texto.vencimento_impresso;
  if (!campos.data_vencimento && impresso) {

    campos.data_vencimento = impresso;
    origem.data_vencimento = 'texto';
  } else if (campos.data_vencimento && impresso && impresso !== campos.data_vencimento) {
    avisos.push({
      tipo: 'vencimento_divergente',
      texto: `A data impressa no boleto (${br(impresso)}) é diferente da que está no código (${br(campos.data_vencimento)}). Confira antes de lançar.`,
    });
  }
  if (leitura && leitura.ok && !campos.data_vencimento) {
    avisos.push({ tipo: 'sem_vencimento', texto: 'Este boleto não informa o vencimento. Preencha a data.' });
  }
  if (campos.data_vencimento && hojeIso && campos.data_vencimento < hojeIso) {
    avisos.push({ tipo: 'vencido', texto: `Boleto vencido em ${br(campos.data_vencimento)} — o valor a pagar pode ter juros e multa.` });
  }
  if (leitura && leitura.ok && leitura.tipo === 'arrecadacao' && !benef) {
    avisos.push({ tipo: 'sem_beneficiario', texto: 'Conta de consumo ou tributo: preencha o fornecedor.' });
  }

  const quem = campos.fornecedor || campos.banco || null;
  if (quem) campos.descricao = `Boleto · ${quem}`.slice(0, 200);

  return { campos, origem, avisos };
}

function br(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || '');
}





function boletoUnico(codigoBarras) {
  const c = soDigitos(codigoBarras);
  if (c.length !== 44) return false;
  if (c[0] !== '8') return c.slice(9, 19) !== '0000000000';
  return c[2] === '6' || c[2] === '8';
}












const STOP = new Set(['LTDA', 'ME', 'EPP', 'EIRELI', 'SA', 'S/A', 'DE', 'DA', 'DO', 'DOS', 'DAS', 'E', 'CIA', 'COMERCIO', 'SERVICOS']);

function tokensFornecedor(nome) {
  return new Set(
    String(nome || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ')
      .split(/\s+/).filter(t => t.length >= 3 && !STOP.has(t))
  );
}

function fornecedoresCompativeis(a, b) {
  const ta = tokensFornecedor(a);
  const tb = tokensFornecedor(b);
  if (!ta.size || !tb.size) return false;
  for (const t of ta) if (tb.has(t)) return true;
  return false;
}

const chaveValorData = (valor, data) => `${Math.round(Number(valor) * 100)}|${String(data || '').slice(0, 10)}`;

function planejarAdocao(titulosNovos, manuais) {
  const porChaveTit = new Map();
  for (const t of titulosNovos || []) {
    if (t.valor == null || !t.data_vencimento) continue;
    const k = chaveValorData(t.valor, t.data_vencimento);
    if (!porChaveTit.has(k)) porChaveTit.set(k, []);
    porChaveTit.get(k).push(t);
  }
  const porChaveMan = new Map();
  for (const m of manuais || []) {
    if (m.import_chave || m.valor == null || !m.data_vencimento) continue;
    const k = chaveValorData(m.valor, m.data_vencimento);
    if (!porChaveMan.has(k)) porChaveMan.set(k, []);
    porChaveMan.get(k).push(m);
  }
  const adotar = [];
  const ambiguos = [];
  for (const [k, mans] of porChaveMan) {
    const tits = porChaveTit.get(k);
    if (!tits) continue;
    if (tits.length === 1 && mans.length === 1 && fornecedoresCompativeis(tits[0].fornecedor, mans[0].fornecedor)) {
      adotar.push({ manual_id: mans[0].id, import_chave: tits[0].import_chave });
    } else {
      ambiguos.push({
        valor: mans[0].valor,
        data_vencimento: mans[0].data_vencimento,
        manuais: mans.map(m => ({ id: m.id, fornecedor: m.fornecedor, descricao: m.descricao })),
        importados: tits.map(t => ({ import_chave: t.import_chave, fornecedor: t.fornecedor, descricao: t.descricao })),
        motivo: (tits.length > 1 || mans.length > 1) ? 'mais_de_um_candidato' : 'fornecedor_diferente',
      });
    }
  }
  return { adotar, ambiguos };
}









function mesmoFornecedor(a, b) {
  const ta = tokensFornecedor(a);
  const tb = tokensFornecedor(b);
  if (!ta.size || !tb.size) return false;
  let comuns = 0;
  for (const t of ta) if (tb.has(t)) comuns += 1;
  return comuns >= Math.min(2, ta.size, tb.size);
}




function historicoDoFornecedor(nome, contas) {
  const casadas = (contas || [])
    .filter(c => c && c.plano_contas_id && mesmoFornecedor(nome, c.fornecedor))
    .sort((x, y) => String(y.data_vencimento || '').localeCompare(String(x.data_vencimento || '')));
  if (!casadas.length) return null;
  const ult = casadas[0];
  return {
    plano_contas_id: ult.plano_contas_id,
    centro_custo_id: ult.centro_custo_id || null,
    fornecedor: ult.fornecedor,
    contas_consideradas: casadas.length,
    planos_distintos: new Set(casadas.map(c => c.plano_contas_id)).size,
  };
}

module.exports = {
  montarSugestao,
  boletoUnico,
  tokensFornecedor,
  fornecedoresCompativeis,
  planejarAdocao,
  mesmoFornecedor,
  historicoDoFornecedor,
};
