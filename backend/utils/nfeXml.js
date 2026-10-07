'use strict';






















function dentroDe(xml, tag) {
  if (!xml) return null;
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1] : null;
}


function todosOsBlocos(xml, tag) {
  if (!xml) return [];
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'gi');
  return [...xml.matchAll(re)].map((m) => m[1]);
}


function txt(bloco, tag) {
  const v = dentroDe(bloco, tag);
  return v === null ? null : v.trim() || null;
}


function num(bloco, tag) {
  const v = txt(bloco, tag);
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');


function chaveValida(v) {
  return /^\d{44}$/.test(soDigitos(v));
}













function lerNfe(xml, { cnpjDestinatario } = {}) {
  if (!xml || typeof xml !== 'string') return { ok: false, erro: 'arquivo_vazio' };

  const infNFe = dentroDe(xml, 'infNFe');
  if (!infNFe) return { ok: false, erro: 'nao_e_nfe' };


  const infProt = dentroDe(xml, 'infProt');
  let chave = infProt ? soDigitos(txt(infProt, 'chNFe')) : null;
  if (!chaveValida(chave)) {
    const mId = xml.match(/<infNFe[^>]*\bId=["']?NFe(\d{44})/i);
    chave = mId ? mId[1] : null;
  }
  if (!chaveValida(chave)) return { ok: false, erro: 'sem_chave_de_acesso' };




  const cStat = infProt ? txt(infProt, 'cStat') : null;
  if (infProt && cStat !== '100') {
    return { ok: false, erro: 'nao_autorizada', detalhe: `cStat ${cStat}: ${txt(infProt, 'xMotivo') || ''}`.trim() };
  }

  const emit = dentroDe(infNFe, 'emit');
  const dest = dentroDe(infNFe, 'dest');
  const ide = dentroDe(infNFe, 'ide');
  const icmsTot = dentroDe(dentroDe(infNFe, 'total') || '', 'ICMSTot');

  const cnpjDest = soDigitos(txt(dest, 'CNPJ'));
  if (cnpjDestinatario) {
    const esperado = soDigitos(cnpjDestinatario);
    if (esperado && cnpjDest && cnpjDest !== esperado) {
      return { ok: false, erro: 'destinatario_diferente', detalhe: cnpjDest };
    }
  }



  const valor = icmsTot ? num(icmsTot, 'vNF') : null;
  if (valor === null) return { ok: false, erro: 'sem_valor_total' };

  const dhEmi = txt(ide, 'dhEmi') || txt(ide, 'dEmi');



  const dataEmissao = dhEmi ? String(dhEmi).slice(0, 10) : null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataEmissao || '')) {
    return { ok: false, erro: 'sem_data_emissao' };
  }

  const itens = todosOsBlocos(infNFe, 'det').map((det) => {
    const prod = dentroDe(det, 'prod') || '';
    return {
      descricao: txt(prod, 'xProd'),
      codigo: txt(prod, 'cProd'),
      ncm: txt(prod, 'NCM'),
      cfop: txt(prod, 'CFOP'),
      unidade: txt(prod, 'uCom'),
      quantidade: num(prod, 'qCom'),
      valor_unitario: num(prod, 'vUnCom'),
      valor_total: num(prod, 'vProd'),
    };
  });


  const intermed = dentroDe(infNFe, 'infIntermed');
  const idIntermediador = intermed ? (txt(intermed, 'idCadIntTran') || '').toLowerCase() : null;



  const endereco = (bloco, tag) => {
    const e = dentroDe(bloco || '', tag);
    if (!e) return null;
    return {
      logradouro: txt(e, 'xLgr'), numero: txt(e, 'nro'), complemento: txt(e, 'xCpl'),
      bairro: txt(e, 'xBairro'), municipio: txt(e, 'xMun'), uf: txt(e, 'UF'),
      cep: txt(e, 'CEP'), fone: txt(e, 'fone'),
    };
  };

  return {
    ok: true,
    nota: {
      chave_acesso: chave,
      numero: txt(ide, 'nNF'),
      serie: txt(ide, 'serie'),
      data_emissao: dataEmissao,
      valor,
      emitente_cnpj: soDigitos(txt(emit, 'CNPJ')) || null,
      emitente_nome: txt(emit, 'xNome'),
      emitente_fantasia: txt(emit, 'xFant'),
      destinatario_cnpj: cnpjDest || null,
      itens,

      descricao: itens.map((i) => i.descricao).filter(Boolean).join(' · ').slice(0, 500) || null,
      intermediador: idIntermediador || null,
      via_mercadolivre: idIntermediador === 'mercadolivre',
      protocolo: infProt ? txt(infProt, 'nProt') : null,


      natureza_operacao: txt(ide, 'natOp'),
      emitente_ie: txt(emit, 'IE'),
      emitente_endereco: endereco(emit, 'enderEmit'),
      destinatario_nome: txt(dest, 'xNome'),
      destinatario_endereco: endereco(dest, 'enderDest'),
      totais: icmsTot ? {
        produtos: num(icmsTot, 'vProd'),
        frete: num(icmsTot, 'vFrete'),
        seguro: num(icmsTot, 'vSeg'),
        desconto: num(icmsTot, 'vDesc'),
        outros: num(icmsTot, 'vOutro'),
        icms: num(icmsTot, 'vICMS'),
        ipi: num(icmsTot, 'vIPI'),
        tributos_aprox: num(icmsTot, 'vTotTrib'),
        nota: num(icmsTot, 'vNF'),
      } : null,
      informacoes_complementares: txt(dentroDe(infNFe, 'infAdic') || '', 'infCpl'),
      autorizada_em: infProt ? txt(infProt, 'dhRecbto') : null,
    },
  };
}

module.exports = { lerNfe, dentroDe, todosOsBlocos, chaveValida };
