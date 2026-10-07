




























const { cpfValido, soDigitos } = require('./cpf');




const { normalizarSaude } = require('./saudeCrianca');




const { sexoPara } = require('./dadosDoCadastro');


const CAMPOS_PROIBIDOS_CRIANCA = ['cpf', 'cnpj'];









function segundoDomingo(ano, mes0) {
  const primeiro = new Date(ano, mes0, 1);
  const dow = primeiro.getDay();
  const primeiroDomingo = dow === 0 ? 1 : 8 - dow;
  return new Date(ano, mes0, primeiroDomingo + 7);
}

function proximoSegundoDomingo(hoje = new Date()) {
  const ref = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const candidato = segundoDomingo(ref.getFullYear(), ref.getMonth());
  if (candidato >= ref) return candidato;
  const mes = ref.getMonth() === 11 ? 0 : ref.getMonth() + 1;
  const ano = ref.getMonth() === 11 ? ref.getFullYear() + 1 : ref.getFullYear();
  return segundoDomingo(ano, mes);
}

function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}













function chaveCrianca(nome, dataNascimento) {
  const n = String(nome ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return `${n}|${String(dataNascimento ?? '').slice(0, 10)}`;
}




















function acharCriancaNaFamilia(pessoas, nome, dataNascimento, paisPorCrianca = null, paisEsperados = []) {
  const alvo = chaveCrianca(nome, dataNascimento);
  const nossos = new Set((paisEsperados || []).filter(Boolean));
  const candidatas = (pessoas || []).filter((p) => chaveCrianca(p.nome, p.data_nascimento) === alvo);

  for (const c of candidatas) {
    if (!paisPorCrianca || !nossos.size) return c;
    const pais = paisPorCrianca.get?.(c.id) ?? paisPorCrianca[c.id];
    if (!pais || !pais.length) return c;
    if (pais.some((id) => nossos.has(id))) return c;

  }
  return null;
}











function validarPedido(body, membro) {
  const propria = body?.propria === true;
  const c = body?.crianca || {};
  const nome = String(c.nome ?? '').trim();
  if (nome.length < 2) return { ok: false, erro: 'Informe o nome da criança' };

  const nasc = String(c.data_nascimento ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nasc)) return { ok: false, erro: 'Informe a data de nascimento da criança' };


  const d = new Date(`${nasc}T12:00:00`);
  if (Number.isNaN(d.getTime())) return { ok: false, erro: 'Data de nascimento inválida' };
  if (iso(d) !== nasc) return { ok: false, erro: 'Data de nascimento inválida' };
  if (d > new Date()) return { ok: false, erro: 'A data de nascimento não pode ser no futuro' };

  for (const campo of CAMPOS_PROIBIDOS_CRIANCA) {
    if (c[campo]) return { ok: false, erro: 'Não pedimos documento da criança' };
  }



  const sexo = sexoPara('curto', c.sexo);

  if (propria) {
    if (!membro?.id) return { ok: false, erro: 'Complete seu cadastro antes de apresentar uma criança' };




    const ex = validarResponsavelExtra(body?.responsavel_extra);
    if (!ex.ok) return { ok: false, erro: ex.erro };
    return {
      ok: true,
      dados: {
        propria: true,
        crianca: { nome, data_nascimento: nasc, sexo, saude: normalizarSaude(c) },
        responsavel: {
          membro_id: membro.id,
          nome: membro.nome || null,
          telefone: membro.telefone || null,
          sexo: sexoPara('curto', membro.genero),
        },
        responsavel_extra: ex.dados,
        observacoes: obs(body?.observacoes),
      },
    };
  }

  const r = body?.responsavel || {};
  const rNome = String(r.nome ?? '').trim();
  if (rNome.length < 2) return { ok: false, erro: 'Informe o nome do responsável' };
  const tel = String(r.telefone ?? '').replace(/\D/g, '');
  if (tel.length < 10 || tel.length > 11) return { ok: false, erro: 'Informe um telefone válido do responsável' };

  return {
    ok: true,
    dados: {
      propria: false,
      crianca: { nome, data_nascimento: nasc, sexo, saude: normalizarSaude(c) },
      responsavel: {
        membro_id: null,
        nome: rNome,
        telefone: tel,
        email: r.email ? String(r.email).toLowerCase().trim() : null,
        nome_pai: r.nome_pai ? String(r.nome_pai).trim() : null,
        nome_mae: r.nome_mae ? String(r.nome_mae).trim() : null,
      },
      observacoes: obs(body?.observacoes),
    },
  };
}















function validarResponsavelExtra(v) {
  if (!v) return { ok: true, dados: null };
  const nome = String(v.nome ?? '').trim();
  const cpf = soDigitos(v.cpf);
  if (!nome && !cpf) return { ok: true, dados: null };
  if (nome.length < 2) return { ok: false, erro: 'Informe o nome do outro responsável' };
  if (!nome.includes(' ')) return { ok: false, erro: 'Informe o nome COMPLETO do outro responsável' };
  if (!cpf) return { ok: false, erro: 'O CPF do outro responsável é obrigatório' };
  if (!cpfValido(cpf)) return { ok: false, erro: 'O CPF do outro responsável não é válido' };

  const tel = soDigitos(v.telefone);
  return {
    ok: true,
    dados: {
      nome,
      cpf,


      telefone: tel.length >= 10 && tel.length <= 11 ? tel : null,
      sexo: sexoPara('curto', v.sexo),
    },
  };
}










function nomesDosPais(principal, extra) {
  const slot = { nome_pai: null, nome_mae: null };
  for (const p of [principal, extra]) {
    if (!p?.nome) continue;
    if (p.sexo === 'M' && !slot.nome_pai) slot.nome_pai = p.nome;
    else if (p.sexo === 'F' && !slot.nome_mae) slot.nome_mae = p.nome;
  }
  return slot;
}

function obs(v) {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, 1000) : null;
}


function rotuloHora(hhmm) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm ?? ''));
  if (!m) return null;
  const h = String(Number(m[1]));
  return m[2] === '00' ? `${h}h` : `${h}h${m[2]}`;
}






















function escolherCultoApresentacao(cultosDia, { limite = null, contagem = null } = {}) {
  const porHora = (pref) =>
    (cultosDia || []).find((c) => String(c?.service_type?.recurrence_time || '').startsWith(pref)) || null;
  const cheio = (c) => {
    if (!limite || !c) return false;
    const n = (contagem && (contagem.get?.(c.id) ?? contagem[c.id])) || 0;
    return n >= limite;
  };
  const hora = (c) => String(c.service_type.recurrence_time).slice(0, 5);
  const escolha = (c, transbordou) => ({ culto: c, hora: hora(c), transbordou });

  const overflow = porHora('11:30');
  const primario = porHora('09:30');
  if (primario && !cheio(primario)) return escolha(primario, false);
  if (primario && overflow && !cheio(overflow)) return escolha(overflow, true);


  const dez = porHora('10:00');
  if (dez && !cheio(dez)) return escolha(dez, false);
  if (dez && overflow && !cheio(overflow)) return escolha(overflow, true);

  return { culto: null, hora: null, transbordou: false };
}



















function pessoaDaCrianca(crianca, igrejaId = null) {
  return {
    nome: crianca.nome,
    data_nascimento: crianca.data_nascimento,




    genero: sexoPara('canonico', crianca.sexo),
    status: 'visitante',
    active: true,
    origem_cadastro: 'apresentacao_crianca_app',
    ...(igrejaId ? { igreja_id: igrejaId } : {}),
  };
}

module.exports = {
  validarResponsavelExtra,
  nomesDosPais,
  proximoSegundoDomingo,
  iso,
  chaveCrianca,
  acharCriancaNaFamilia,
  validarPedido,
  pessoaDaCrianca,
  escolherCultoApresentacao,
  rotuloHora,
  CAMPOS_PROIBIDOS_CRIANCA,
};
