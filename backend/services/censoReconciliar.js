































const { supabase } = require('../utils/supabase');
const {
  normalizarTelefone, normalizarEmail, registrarContatoDaPorta,
} = require('./membroMatch');
const { traduzirParaCadastro } = require('../utils/censoCampoCadastro');















const CAMPOS_CENSO = [
  'email', 'telefone', 'data_nascimento', 'estado_civil', 'genero',
  'endereco', 'bairro', 'cidade', 'cep', 'profissao', 'escolaridade',
];


const CAMPOS_ACUMULAVEIS = new Set(['email', 'telefone']);

function vazio(v) {
  return v === null || v === undefined || String(v).trim() === '';
}




function paraComparar(campo, valor) {
  if (vazio(valor)) return '';
  const s = String(valor).trim();
  if (campo === 'email') return normalizarEmail(s) || '';
  if (campo === 'telefone') return normalizarTelefone(s) || '';
  if (campo === 'cep') return s.replace(/\D+/g, '');
  if (campo === 'data_nascimento') return s.slice(0, 10);
  return s.toLowerCase().replace(/\s+/g, ' ');
}





function decidirCampos(atual = {}, informado = {}) {
  const aplicar = {};
  const acumular = {};
  const conflitos = [];
  const iguais = [];
  const descartados = [];

  for (const campo of CAMPOS_CENSO) {
    const bruto = informado[campo];
    if (vazio(bruto) && !Array.isArray(bruto)) continue;






    const t = traduzirParaCadastro(campo, bruto);
    if (!t.ok) {



      if (t.motivo !== 'vazio') {
        descartados.push({ campo, informado: Array.isArray(bruto) ? bruto.join(', ') : String(bruto), motivo: t.motivo });
      }
      continue;
    }

    const novo = t.valor;
    const cmpNovo = paraComparar(campo, novo);
    if (!cmpNovo) continue;

    const cmpAtual = paraComparar(campo, atual[campo]);

    if (!cmpAtual) {
      aplicar[campo] = novo;
    } else if (cmpAtual === cmpNovo) {
      iguais.push(campo);
    } else if (CAMPOS_ACUMULAVEIS.has(campo)) {
      acumular[campo] = novo;
    } else {
      conflitos.push({ campo, atual: atual[campo] ?? null, informado: novo });
    }
  }

  return { aplicar, acumular, conflitos, iguais, descartados };
}











const CHAVES_FORTES = new Set(['cpf', 'token_censo']);

function confiancaDoMatch(matchedBy) {
  return CHAVES_FORTES.has(matchedBy) ? 'forte' : 'fraca';
}




function podeAplicar({ matchedBy, nascimentoMembro, nascimentoInformado }) {
  if (confiancaDoMatch(matchedBy) === 'forte') return { ok: true };
  const a = nascimentoMembro ? String(nascimentoMembro).slice(0, 10) : null;
  const b = nascimentoInformado ? String(nascimentoInformado).slice(0, 10) : null;
  if (!a || !b) return { ok: false, motivo: 'sinal_fraco_sem_nascimento' };
  if (a !== b) return { ok: false, motivo: 'sinal_fraco_nascimento_divergente' };
  return { ok: true };
}

async function logHistorico(membroId, resumo) {


  const { error } = await supabase.from('mem_historico').insert({
    membro_id: membroId,
    tipo: 'outro',
    descricao: `[censo] ${resumo}`,
    created_at: new Date().toISOString(),
  });
  if (error) console.warn('[censoReconciliar] histórico não gravado:', error.message);
}






const COLUNAS_OPCIONAIS = ['escolaridade'];

function semColunasOpcionais(lista) {
  return lista.filter((c) => !COLUNAS_OPCIONAIS.includes(c));
}




const ERRO_DE_DADO = new Set(['23514', '22P02', '22001', '22007', '22008', '42703']);




async function aplicarCampos(membroId, aplicar) {
  const campos = Object.keys(aplicar);
  if (!campos.length) return { gravados: [], recusados: [], perdeuCorrida: false };

  const tentar = async (subset) => {
    let q = supabase.from('mem_membros')
      .update({ ...subset, updated_at: new Date().toISOString() })
      .eq('id', membroId);
    for (const campo of Object.keys(subset)) q = q.is(campo, null);
    return q.select('id');
  };

  const { data, error } = await tentar(aplicar);
  if (!error) {
    return { gravados: data && data.length ? campos : [], recusados: [], perdeuCorrida: !data || !data.length };
  }
  if (!ERRO_DE_DADO.has(error.code)) throw error;

  const gravados = []; const recusados = []; let perdeuCorrida = false;
  for (const campo of campos) {
    const { data: d1, error: e1 } = await tentar({ [campo]: aplicar[campo] });
    if (e1) {
      if (!ERRO_DE_DADO.has(e1.code)) throw e1;
      recusados.push({ campo, informado: aplicar[campo], motivo: `banco_recusou_${e1.code}` });
    } else if (d1 && d1.length) gravados.push(campo);
    else perdeuCorrida = true;
  }
  return { gravados, recusados, perdeuCorrida };
}










async function reconciliarCenso({ membroId, matchedBy, dados = {}, origemId } = {}) {
  const vazioResp = (acao, extra = {}) => ({
    acao, aplicados: [], conflitos: [], acumulados: [], iguais: [], descartados: [], ...extra,
  });
  if (!membroId) return vazioResp('membro_nao_encontrado');

  const colunasTodas = [...new Set(['id', 'data_nascimento', 'deleted_at', ...CAMPOS_CENSO])];
  let colunas = colunasTodas;
  let indisponiveis = [];

  let { data: membro, error } = await supabase
    .from('mem_membros').select(colunas.join(', ')).eq('id', membroId).maybeSingle();

  if (error && error.code === '42703') {

    colunas = semColunasOpcionais(colunasTodas);
    indisponiveis = COLUNAS_OPCIONAIS.slice();
    ({ data: membro, error } = await supabase
      .from('mem_membros').select(colunas.join(', ')).eq('id', membroId).maybeSingle());
  }
  if (error) throw error;
  if (!membro || membro.deleted_at) return vazioResp('membro_nao_encontrado');


  const informado = { ...dados };
  const descartadosBase = [];
  for (const campo of indisponiveis) {
    if (!vazio(informado[campo])) {
      descartadosBase.push({ campo, informado: String(informado[campo]), motivo: 'coluna_ausente' });
    }
    delete informado[campo];
  }

  const gate = podeAplicar({
    matchedBy,
    nascimentoMembro: membro.data_nascimento,
    nascimentoInformado: informado.data_nascimento,
  });
  if (!gate.ok) {


    return vazioResp('sinal_fraco_ignorado', { motivo: gate.motivo, descartados: descartadosBase });
  }

  let { aplicar, acumular, conflitos, iguais, descartados } = decidirCampos(membro, informado);
  descartados = [...descartadosBase, ...descartados];
  let campos = Object.keys(aplicar);

  if (campos.length) {





    const r1 = await aplicarCampos(membroId, aplicar);
    descartados.push(...r1.recusados);
    campos = r1.gravados;

    if (r1.perdeuCorrida) {


      const { data: m2, error: e3 } = await supabase
        .from('mem_membros').select(colunas.join(', ')).eq('id', membroId).maybeSingle();
      if (e3) throw e3;
      if (!m2 || m2.deleted_at) return vazioResp('membro_nao_encontrado');

      const r2 = decidirCampos(m2, informado);
      acumular = r2.acumular; conflitos = r2.conflitos; iguais = r2.iguais;

      const restantes = Object.fromEntries(
        Object.entries(r2.aplicar).filter(([c]) => !campos.includes(c)),
      );

      if (Object.keys(restantes).length) {
        const r3 = await aplicarCampos(membroId, restantes);
        descartados.push(...r3.recusados);
        campos = [...campos, ...r3.gravados];
        if (r3.perdeuCorrida) {

          for (const campo of Object.keys(restantes)) {
            if (!r3.gravados.includes(campo) && !r3.recusados.some((x) => x.campo === campo)) {
              conflitos.push({ campo, atual: null, informado: restantes[campo] });
            }
          }
        }
      }
    }
  }



  const acumulados = Object.keys(acumular);
  if (acumulados.length) {
    registrarContatoDaPorta(
      membroId,
      { telefone: acumular.telefone || null, email: acumular.email || null },
      'censo',
    );
  }

  if (campos.length || acumulados.length || descartados.length) {
    const partes = [];
    if (campos.length) partes.push(`preenchido: ${campos.join(', ')}`);
    if (acumulados.length) partes.push(`contato acumulado: ${acumulados.join(', ')}`);
    if (conflitos.length) partes.push(`conflito p/ revisão: ${conflitos.map((c) => c.campo).join(', ')}`);


    if (descartados.length) {
      partes.push(`não guardado: ${descartados.map((d) => `${d.campo} (${d.motivo})`).join(', ')}`);
    }
    await logHistorico(
      membroId,
      `${partes.join(' · ')}${origemId ? ` (cadastro ${origemId})` : ''}`,
    );
  }

  const acao = conflitos.length ? 'conflito'
    : (campos.length || acumulados.length) ? 'aplicado'
      : 'sem_mudanca';

  return { acao, aplicados: campos, conflitos, acumulados, iguais, descartados };
}

module.exports = {
  reconciliarCenso,

  decidirCampos,
  podeAplicar,
  confiancaDoMatch,
  CAMPOS_CENSO,
  CAMPOS_ACUMULAVEIS,
};
