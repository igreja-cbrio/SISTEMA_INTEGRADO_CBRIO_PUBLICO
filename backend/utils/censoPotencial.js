






























const FAIXAS_KIDS = Object.freeze(['6 meses a 2 anos', '3 a 6 anos', '7 a 9 anos', '10 a 12 anos']);






const FAIXA_BRIDGE = '13 a 17 anos';
const FAIXA_AMI = '18 a 25 anos';





const OPTIN_SIM = 'Sim, autorizo';
const OPTIN_NAO = 'Não autorizo';


function faixasDe(payload) {


  const v = payload?.filhos_faixas;
  return Array.isArray(v) ? v : [];
}

function temAlguma(faixas, alvos) {
  return faixas.some((f) => alvos.includes(f));
}





function classificar(payload) {
  const faixas = faixasDe(payload);
  const temFilhos = String(payload?.tem_filhos || '') === 'Sim';
  const freq = String(payload?.filhos_frequentam || '');

  let kids = null;
  if (temFilhos && temAlguma(faixas, FAIXAS_KIDS)) {
    if (freq === 'Não') kids = 'nao';
    else if (freq === 'Parcialmente') kids = 'parcial';
  }

  return {
    kids,
    ami: temFilhos && faixas.includes(FAIXA_AMI),
    bridge: temFilhos && faixas.includes(FAIXA_BRIDGE),



    nao_fez_next: String(payload?.fez_next || '') === 'Não',
    nao_serve: String(payload?.serve_ministerio || '') === 'Não',



    nao_grupo: String(payload?.participa_grupo || '') === 'Não',


    convertido: String(payload?.entregou_vida || '') === 'Sim'
      && String(payload?.batizado || '') === 'Não',
  };
}


function contatoDe(payload) {
  const optin = String(payload?.whatsapp_optin || '');
  return {
    nome: payload?.nome || null,
    telefone: payload?.telefone || null,
    email: payload?.email || null,





    whatsapp: optin === OPTIN_SIM ? 'autorizou'
      : optin === OPTIN_NAO ? 'recusou'
      : 'nao_perguntado',
  };
}






















const DIAS_FREQUENCIA_KIDS = 90;

function idadeAnos(nascimentoISO, hojeISO) {
  const nasc = String(nascimentoISO || '').slice(0, 10);
  const ref = String(hojeISO || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nasc) || !/^\d{4}-\d{2}-\d{2}$/.test(ref) || nasc > ref) return null;
  let anos = Number(ref.slice(0, 4)) - Number(nasc.slice(0, 4));
  if (ref.slice(5) < nasc.slice(5)) anos -= 1;
  return anos;
}

function diasEntre(deISO, ateISO) {
  const de = Date.parse(String(deISO || '').slice(0, 10) + 'T12:00:00Z');
  const ate = Date.parse(String(ateISO || '').slice(0, 10) + 'T12:00:00Z');
  if (!Number.isFinite(de) || !Number.isFinite(ate)) return null;
  return Math.round((ate - de) / 86400000);
}









function cruzarComKids(pessoa, criancas, hojeISO) {
  if (!pessoa?.membro_id) return { vinculo: 'sem_membro', cadastradas: [], no_kids: 0, cadastradas_sem_frequencia: 0, declarados: pessoa?.filhos_quantos ?? null, faltam: null };
  const lista = (Array.isArray(criancas) ? criancas : []).map((c) => {
    const dias = c.ultimo_checkin ? diasEntre(c.ultimo_checkin, hojeISO) : null;

    const frequenta = dias != null && dias >= 0 && dias <= DIAS_FREQUENCIA_KIDS;
    return { nome: c.nome || 'Sem nome', idade: idadeAnos(c.data_nascimento, hojeISO), ultimo_checkin: c.ultimo_checkin ? String(c.ultimo_checkin).slice(0, 10) : null, frequenta };
  }).sort((a, b) => (b.frequenta ? 1 : 0) - (a.frequenta ? 1 : 0) || a.nome.localeCompare(b.nome));
  const noKids = lista.filter((c) => c.frequenta).length;
  const declarados = Number.isFinite(Number(pessoa.filhos_quantos)) && pessoa.filhos_quantos != null ? Number(pessoa.filhos_quantos) : null;
  return {
    vinculo: 'membro',
    cadastradas: lista,
    no_kids: noKids,
    cadastradas_sem_frequencia: lista.length - noKids,
    declarados,


    faltam: declarados == null ? null : Math.max(0, declarados - lista.length),
  };
}







function montarPotencial(linhas, formados, opts = {}) {
  const listas = {
    kids_nao: [], kids_parcial: [], ami: [], bridge: [], convertidos: [],
    nao_fez_next: [], nao_serve: [], nao_grupo: [], sem_generosidade: [],
  };
  const vistos = new Set();







  const contribuintes = opts.contribuintes instanceof Set ? opts.contribuintes : null;
  let generosidadeSemVinculo = 0;



  const kids = opts.kids instanceof Map ? opts.kids : null;
  const membroPorCpf = opts.membroPorCpf instanceof Map ? opts.membroPorCpf : new Map();
  const hoje = opts.hoje || null;
  const cruzamento = { nao_com_crianca_no_kids: 0, parcial_com_crianca_no_kids: 0, nao_discorda: 0, sem_membro: 0 };

  for (const l of Array.isArray(linhas) ? linhas : []) {
    const p = l?.payload;
    if (!p || typeof p !== 'object') continue;
    const c = classificar(p);
    const pessoa = {
      resposta_id: l.id,
      membro_id: l.membro_id || null,
      ...contatoDe(p),
      filhos_quantos: Number.isFinite(Number(p.filhos_quantos)) ? Number(p.filhos_quantos) : null,
      faixas: faixasDe(p),





      consta_formado_next: formados instanceof Set && l.membro_id
        ? formados.has(l.membro_id) : false,
    };

    if (c.kids && kids) {
      const cpf = String(p.cpf || '').replace(/\D/g, '');
      const membroId = pessoa.membro_id || (cpf.length === 11 ? membroPorCpf.get(cpf) : null) || null;
      pessoa.kids = cruzarComKids({ membro_id: membroId, filhos_quantos: pessoa.filhos_quantos }, kids.get(membroId), hoje);



      pessoa.kids.discorda = c.kids === 'nao' && pessoa.kids.no_kids > 0;
      if (pessoa.kids.vinculo === 'sem_membro') cruzamento.sem_membro += 1;
      if (c.kids === 'nao' && pessoa.kids.no_kids > 0) { cruzamento.nao_com_crianca_no_kids += 1; cruzamento.nao_discorda += 1; }
      if (c.kids === 'parcial' && pessoa.kids.no_kids > 0) cruzamento.parcial_com_crianca_no_kids += 1;
    }
    if (c.kids === 'nao') listas.kids_nao.push(pessoa);
    if (c.kids === 'parcial') listas.kids_parcial.push(pessoa);
    if (c.ami) listas.ami.push(pessoa);
    if (c.bridge) listas.bridge.push(pessoa);
    if (c.convertido) listas.convertidos.push(pessoa);
    if (c.nao_fez_next) listas.nao_fez_next.push(pessoa);
    if (c.nao_serve) listas.nao_serve.push(pessoa);
    if (c.nao_grupo) listas.nao_grupo.push(pessoa);
    if (contribuintes) {
      if (!pessoa.membro_id) generosidadeSemVinculo += 1;
      else if (!contribuintes.has(pessoa.membro_id)) listas.sem_generosidade.push(pessoa);
    }



    if (c.kids || c.ami || c.bridge || c.convertido || c.nao_fez_next || c.nao_serve || c.nao_grupo) vistos.add(l.id);
  }

  return {
    ...listas,
    totais: {
      kids_nao: listas.kids_nao.length,
      kids_parcial: listas.kids_parcial.length,
      ami: listas.ami.length,
      bridge: listas.bridge.length,
      convertidos: listas.convertidos.length,
      nao_fez_next: listas.nao_fez_next.length,
      nao_serve: listas.nao_serve.length,
      nao_grupo: listas.nao_grupo.length,
      sem_generosidade: contribuintes ? listas.sem_generosidade.length : null,
    },
    generosidade_sem_vinculo: contribuintes ? generosidadeSemVinculo : null,



    familias_distintas: vistos.size,


    cruzamento_kids: kids ? cruzamento : null,
  };
}


function resumoPotencial(linhas, opts = {}) {
  const { totais, familias_distintas, generosidade_sem_vinculo } = montarPotencial(linhas, null, opts);
  return { totais, familias_distintas, generosidade_sem_vinculo };
}

module.exports = {
  DIAS_FREQUENCIA_KIDS,
  cruzarComKids,
  FAIXAS_KIDS,
  FAIXA_AMI,
  FAIXA_BRIDGE,
  OPTIN_SIM,
  OPTIN_NAO,
  classificar,
  contatoDe,
  montarPotencial,
  resumoPotencial,
};
