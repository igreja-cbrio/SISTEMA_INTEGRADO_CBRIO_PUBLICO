



















const { supabase } = require('../utils/supabase');
const { normalizarCpf, cpfValido } = require('../utils/cpf');


async function donoAtivoDoCpf(cpf11, { exceto } = {}) {
  let q = supabase.from('mem_membros')
    .select('id, nome, cpf')
    .eq('cpf', cpf11)
    .is('deleted_at', null)
    .limit(2);
  if (exceto) q = q.neq('id', exceto);
  const { data, error } = await q;
  if (error) throw error;
  return (data && data[0]) || null;
}

async function registrarPendencia({ tipo, membroId, conflitoId, origem, origemId, detalhe }) {
  try {
    const { error } = await supabase.from('identidade_pendencias').insert({
      tipo,
      membro_id: membroId || null,
      membro_conflito_id: conflitoId || null,
      origem: origem || null,
      origem_id: origemId != null ? String(origemId) : null,
      detalhe: detalhe || null,
    });

    if (error && error.code !== '23505') throw error;
    return !error;
  } catch (e) {
    console.error('[cpfReconciliar] pendência não registrada:', e.message);
    return false;
  }
}

async function logHistorico(membroId, acao, observacao) {





  const { error } = await supabase.from('mem_historico').insert({
    membro_id: membroId,
    tipo: 'outro',
    descricao: `[${acao}] ${observacao}`,
    created_at: new Date().toISOString(),
  });
  if (error) console.warn('[cpfReconciliar] histórico não gravado:', error.message);
}















async function reconciliarCpfTardio({ membroId, cpf, origem, origemId, dataNascimento, confianca = 'forte' } = {}) {
  const cpf11 = normalizarCpf(cpf);
  if (!membroId || !cpf11 || !cpfValido(cpf11)) return { acao: 'cpf_invalido' };

  const { data: membro, error } = await supabase.from('mem_membros')
    .select('id, nome, cpf, data_nascimento, deleted_at')
    .eq('id', membroId)
    .maybeSingle();
  if (error) throw error;
  if (!membro || membro.deleted_at) return { acao: 'membro_nao_encontrado' };

  const cpfAtual = normalizarCpf(membro.cpf);
  if (cpfAtual === cpf11) return { acao: 'ja_tinha' };



  const nascInput = dataNascimento ? String(dataNascimento).slice(0, 10) : null;
  const nascMembro = membro.data_nascimento ? String(membro.data_nascimento).slice(0, 10) : null;
  if (nascInput && nascMembro && nascInput !== nascMembro) {
    await registrarPendencia({
      tipo: 'vinculo_divergente', membroId, conflitoId: null, origem, origemId,
      detalhe: 'CPF chegou com data de nascimento diferente da do membro vinculado — provável vínculo por sinal fraco na pessoa errada.',
    });
    return { acao: 'nascimento_divergente_pendencia' };
  }


  if (cpfAtual) {
    const dono = await donoAtivoDoCpf(cpf11, { exceto: membroId });
    await registrarPendencia({
      tipo: 'cpf_divergente', membroId, conflitoId: dono?.id || null,
      origem, origemId,
      detalhe: `Membro já tem CPF; um CPF diferente chegou via ${origem || 'origem desconhecida'}.`,
    });
    return { acao: 'divergente_pendencia', conflito_id: dono?.id || null };
  }


  const dono = await donoAtivoDoCpf(cpf11, { exceto: membroId });
  if (dono) {
    await registrarPendencia({
      tipo: 'cpf_conflito', membroId, conflitoId: dono.id,
      origem, origemId,
      detalhe: `CPF chegou pra um cadastro sem CPF, mas já pertence a outro membro ativo — provável mesma pessoa em 2 cadastros (fundir).`,
    });
    return { acao: 'conflito_pendencia', conflito_id: dono.id };
  }








  if (confianca === 'fraca' && !(nascInput && nascMembro)) {
    return { acao: 'sinal_fraco_ignorado' };
  }


  const { data: upd, error: e2 } = await supabase.from('mem_membros')
    .update({ cpf: cpf11, updated_at: new Date().toISOString() })
    .eq('id', membroId)
    .is('cpf', null)
    .select('id');
  if (e2) {

    if (e2.code === '23505') {
      const donoAgora = await donoAtivoDoCpf(cpf11, { exceto: membroId });
      if (donoAgora) {
        await registrarPendencia({
          tipo: 'cpf_conflito', membroId, conflitoId: donoAgora.id, origem, origemId,
          detalhe: 'Corrida: outro fluxo gravou o mesmo CPF primeiro.',
        });
        return { acao: 'conflito_pendencia', conflito_id: donoAgora.id };
      }




      await registrarPendencia({
        tipo: 'cpf_conflito', membroId, conflitoId: null, origem, origemId,
        detalhe: 'CPF preso num cadastro deletado (constraint total mem_membros_cpf_key).',
      });
      return { acao: 'conflito_pendencia', conflito_id: null };
    }
    throw e2;
  }
  if (!upd || upd.length === 0) {



    const { data: m2 } = await supabase.from('mem_membros')
      .select('cpf').eq('id', membroId).maybeSingle();
    if (normalizarCpf(m2?.cpf) === cpf11) return { acao: 'ja_tinha' };
    await registrarPendencia({
      tipo: 'cpf_divergente', membroId, conflitoId: null, origem, origemId,
      detalhe: 'Corrida: o membro recebeu outro CPF durante a reconciliação.',
    });
    return { acao: 'divergente_pendencia', conflito_id: null };
  }

  await logHistorico(membroId, 'cpf_recebido',
    `CPF recebido tardiamente via ${origem || 'fluxo'}${origemId ? ` (id ${origemId})` : ''} e consolidado no cadastro.`);
  return { acao: 'cpf_preenchido' };
}




async function propagarCpfConvertido({ membroId }) {
  try {
    const { data: m } = await supabase.from('mem_membros')
      .select('cpf').eq('id', membroId).maybeSingle();
    const cpf11 = normalizarCpf(m?.cpf);
    if (!cpf11) return 0;
    const { data, error } = await supabase.from('cui_convertidos')
      .update({ cpf: cpf11 })
      .eq('membro_id', membroId)
      .is('cpf', null)
      .select('id');
    if (error) throw error;
    return (data || []).length;
  } catch (e) {
    console.error('[cpfReconciliar] propagar cui_convertidos:', e.message);
    return 0;
  }
}

module.exports = { reconciliarCpfTardio, propagarCpfConvertido, donoAtivoDoCpf, registrarPendencia };
