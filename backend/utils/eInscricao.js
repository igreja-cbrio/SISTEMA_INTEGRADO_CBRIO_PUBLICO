



























const ORIGEM_E_INSCRICAO = 'e_inscricao';
const PLATAFORMA_E_INSCRICAO = 'E-Inscrição';

const TAXA_E_INSCRICAO_PCT = 5.5;


function reaisParaCentavos(texto) {
  if (texto == null) return null;
  let s = String(texto).trim();
  if (!s) return null;

  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}





function liquidoCentavos(brutoCentavos, taxaPct = TAXA_E_INSCRICAO_PCT) {
  const b = Number(brutoCentavos);
  const t = Number(taxaPct);
  if (!Number.isFinite(b) || !Number.isFinite(t)) return null;
  return Math.round(b * (1 - t / 100));
}


function simNao(texto) {
  const s = String(texto ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (s === 'sim') return true;
  if (s === 'nao') return false;
  return null;
}


function sexoCanonico(texto) {
  const s = String(texto ?? '').trim().toLowerCase();
  if (s.startsWith('fem')) return 'feminino';
  if (s.startsWith('mas')) return 'masculino';
  return null;
}


function cpfDigits(texto) {
  const d = String(texto ?? '').replace(/\D/g, '');
  return d.length === 11 ? d : null;
}







function telefoneDigits(texto) {
  const s = String(texto ?? '');

  const trechos = s.split(/[^\d()+\-.\s]+/).map((t) => t.replace(/\D/g, '')).filter(Boolean);
  for (let d of trechos) {
    if (d.length === 13 && d.startsWith('55')) d = d.slice(2);
    if (d.length === 12 && d.startsWith('55')) d = d.slice(2);
    if (d.length >= 10 && d.length <= 11) return d;
  }

  const maior = trechos.sort((a, b) => b.length - a.length)[0] || '';
  return maior.length >= 8 && maior.length <= 11 ? maior : null;
}







function parseDataBR(texto) {
  const s = String(texto ?? '').trim();
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (!m) {
    const d = s.replace(/\D/g, '');
    if (d.length === 8) m = [d, d.slice(0, 2), d.slice(2, 4), d.slice(4)];
  }
  if (!m) return null;
  const dia = Number(m[1]); const mes = Number(m[2]); const ano = Number(m[3]);
  if (!(ano >= 1900 && ano <= 2100 && mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31)) return null;
  const dt = new Date(Date.UTC(ano, mes - 1, dia));
  if (dt.getUTCMonth() !== mes - 1 || dt.getUTCDate() !== dia) return null;
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}







function parseDataHoraBRT(texto) {
  const m = String(texto ?? '').trim().match(/^(\d{2})-(\d{2})-(\d{4})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}-03:00`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}






function parseCsvEInscricao(texto) {
  const linhas = [];
  let campo = ''; let linha = []; let aspas = false;
  const s = String(texto ?? '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (aspas) {
      if (ch === '"') {
        if (s[i + 1] === '"') { campo += '"'; i++; } else aspas = false;
      } else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === ';') { linha.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      linha.push(campo); campo = '';
      if (linha.some((c) => c !== '')) linhas.push(linha);
      linha = [];
    } else campo += ch;
  }
  if (campo !== '' || linha.length) { linha.push(campo); if (linha.some((c) => c !== '')) linhas.push(linha); }
  if (!linhas.length) return [];
  const cab = linhas[0].map((c) => c.trim());
  return linhas.slice(1).map((l) => {
    const o = {};
    cab.forEach((k, i) => { o[k] = (l[i] ?? '').trim(); });
    return o;
  });
}




const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
function coluna(rec, ...prefixos) {
  const chaves = Object.keys(rec);
  for (const p of prefixos) {
    const alvo = norm(p);
    const k = chaves.find((c) => norm(c).startsWith(alvo));
    if (k !== undefined) return rec[k] ?? '';
  }
  return '';
}


function vazio(v) {
  const s = String(v ?? '').trim();
  return !s || /^[xX\-—.]+$/.test(s);
}
const ouNull = (v) => (vazio(v) ? null : String(v).trim());








function mapearLinhaEInscricao(rec, { taxaPct = TAXA_E_INSCRICAO_PCT, arquivo = null, importadoEm = null } = {}) {
  const avisos = [];
  const nome = String(coluna(rec, 'Nome') || '').replace(/\s+/g, ' ').trim();
  const cpf = cpfDigits(coluna(rec, 'Número do documento', 'Numero do documento'));
  if (!cpf) avisos.push('CPF inválido ou ausente');
  const email = String(coluna(rec, 'Email') || '').trim().toLowerCase() || null;
  const telefone = telefoneDigits(coluna(rec, 'Telefone para Contato'));
  if (!telefone) avisos.push('telefone não reconhecido');
  const nascimento = parseDataBR(coluna(rec, 'Data de Nascimento'));
  if (!nascimento) avisos.push('data de nascimento não reconhecida');
  const sexo = sexoCanonico(coluna(rec, 'Gênero', 'Genero'));
  if (!sexo) avisos.push('gênero não reconhecido');

  const brutoCentavos = reaisParaCentavos(coluna(rec, 'Valor'));
  const liquido = brutoCentavos == null ? null : liquidoCentavos(brutoCentavos, taxaPct);
  if (liquido == null) avisos.push('valor não reconhecido');

  const inscritoEm = parseDataHoraBRT(coluna(rec, 'Data da inscrição', 'Data da inscricao'));
  if (!inscritoEm) avisos.push('data da inscrição não reconhecida');

  const cancelada = simNao(coluna(rec, 'Cancelada')) === true;
  const status = String(coluna(rec, 'Status') || '').trim();


  const dados = {};
  const put = (k, v) => { if (!vazio(v)) dados[k] = String(v).trim(); };


  put('c_retiro_emerg1', coluna(rec, 'Informe 2 contatos'));
  put('c_retiro_jesus', coluna(rec, 'Já aceitou Jesus', 'Ja aceitou Jesus'));
  put('c_retiro_batizado', coluna(rec, 'Já é batizado', 'Ja e batizado'));
  put('c_retiro_membro', coluna(rec, 'É membro AMI', 'E membro AMI'));
  put('c_retiro_igreja', coluna(rec, 'Caso não seja membro', 'Caso nao seja membro'));
  put('c_retiro_conhece', coluna(rec, 'Caso seja visitante, conhece'));
  put('c_retiro_restricao', coluna(rec, 'Possui alguma restrição alimentar', 'Possui alguma restricao alimentar'));
  put('c_retiro_med_controlado', coluna(rec, 'Faz uso de algum medicamento controlado'));
  put('c_retiro_alergia', coluna(rec, 'Possui alergia medicamentosa'));
  put('c_retiro_qual_med', coluna(rec, 'Qual medicamento'));

  const codigo = String(coluna(rec, 'Código da inscrição', 'Codigo da inscricao') || '').trim() || null;
  if (!codigo) avisos.push('sem código da plataforma');
  const parcelasTxt = String(coluna(rec, 'Quantidade de parcelas') || '').trim();
  dados.e_inscricao = {
    plataforma: PLATAFORMA_E_INSCRICAO,
    codigo,
    status: status || null,
    cancelada,
    inscrito_em: inscritoEm,
    categoria: ouNull(coluna(rec, 'Categoria')),
    cupom: ouNull(coluna(rec, 'Cupom')),
    forma_pagamento: ouNull(coluna(rec, 'Forma de pagamento')),
    parcelas: parcelasTxt ? Number(parcelasTxt) || null : null,
    valor_bruto_centavos: brutoCentavos,
    taxa_pct: taxaPct,
    valor_liquido_centavos: liquido,
    aceites: {
      termo_menor: ouNull(coluna(rec, 'Termos de responsabilidade')),
      info_retiro: ouNull(coluna(rec, 'Informações Sobre o Retiro', 'Informacoes Sobre o Retiro')),
      cancelamento: ouNull(coluna(rec, 'Cancelamento, desistência', 'Cancelamento, desistencia')),
    },
    quem_inscreveu: ouNull(coluna(rec, 'Quem realizou a inscrição', 'Quem realizou a inscricao')),
    email_quem_inscreveu: (ouNull(coluna(rec, 'Email de quem realizou')) || '').toLowerCase() || null,
    checkin_em: ouNull(coluna(rec, 'Check-in em')),
    arquivo: arquivo || null,
    importado_em: importadoEm || null,
  };


  const respNome = ouNull(coluna(rec, 'Nome Completo do Responsável', 'Nome Completo do Responsavel'));
  const responsavel = respNome ? {
    responsavel_nome: respNome,
    responsavel_cpf: cpfDigits(coluna(rec, 'CPF do Responsável', 'CPF do Responsavel')),
    responsavel_parentesco: ouNull(coluna(rec, 'Grau de Parentesco')),
    responsavel_telefone: telefoneDigits(coluna(rec, 'Celular do Responsável', 'Celular do Responsavel')),
    responsavel_email: (ouNull(coluna(rec, 'Email do Responsável', 'Email do Responsavel')) || '').toLowerCase() || null,

    responsavel_autoriza_batismo: simNao(coluna(rec, 'Caso menor de 18 anos pelo qual')),
  } : {
    responsavel_nome: null, responsavel_cpf: null, responsavel_parentesco: null,
    responsavel_telefone: null, responsavel_email: null, responsavel_autoriza_batismo: null,
  };

  return {
    nome_completo: nome,
    cpf,
    email,
    telefone,
    data_nascimento: nascimento,
    sexo,
    endereco: ouNull(coluna(rec, 'Endereço Completo', 'Endereco Completo')),
    dados,
    ...responsavel,
    status: cancelada ? 'cancelada' : 'confirmada',
    origem: ORIGEM_E_INSCRICAO,
    valor_cobrado_centavos: liquido,
    created_at: inscritoEm,
    codigo_plataforma: codigo,
    avisos,
  };
}







function resumoPorPlataforma(linhas, arrecadadoSistemaCentavos = null) {
  const externo = { plataforma: PLATAFORMA_E_INSCRICAO, origem: ORIGEM_E_INSCRICAO, inscritos: 0, valor_liquido_centavos: 0 };
  const sistema = { inscritos: 0, arrecadado_centavos: arrecadadoSistemaCentavos };
  for (const l of linhas || []) {
    if (!l || l.status === 'cancelada') continue;
    if (l.origem === ORIGEM_E_INSCRICAO) {
      externo.inscritos += 1;
      externo.valor_liquido_centavos += Number(l.valor_cobrado_centavos) || 0;
    } else sistema.inscritos += 1;
  }
  const total_centavos = arrecadadoSistemaCentavos == null
    ? null
    : externo.valor_liquido_centavos + Number(arrecadadoSistemaCentavos || 0);
  return { externo, sistema, total_inscritos: externo.inscritos + sistema.inscritos, total_centavos };
}









function decodificarCsv(bytes) {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}




const COLUNAS_ESSENCIAIS = [
  'Nome', 'Número do documento', 'Email', 'Código da inscrição',
  'Cancelada', 'Data da inscrição', 'Valor',
];







function faltamColunasEInscricao(registros) {
  const chaves = Object.keys((registros || [])[0] || {});
  if (!chaves.length) return [...COLUNAS_ESSENCIAIS];
  return COLUNAS_ESSENCIAIS.filter((rotulo) => {
    const alvo = norm(rotulo);
    return !chaves.some((c) => norm(c).startsWith(alvo));
  });
}

module.exports = {
  ORIGEM_E_INSCRICAO, PLATAFORMA_E_INSCRICAO, TAXA_E_INSCRICAO_PCT,
  reaisParaCentavos, liquidoCentavos, simNao, sexoCanonico, cpfDigits, telefoneDigits,
  parseDataBR, parseDataHoraBRT, parseCsvEInscricao, mapearLinhaEInscricao, resumoPorPlataforma,
  decodificarCsv, faltamColunasEInscricao, COLUNAS_ESSENCIAIS,
};
