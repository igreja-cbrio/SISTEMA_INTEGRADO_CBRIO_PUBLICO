




















const { supabase } = require('../utils/supabase');
const {
  proximasOcorrencias, ocorrenciasPassadas, janelaCorrecaoPassada,
} = require('../utils/agendaGrupo');
const { ancorasDeGrupos, iniciosDeGrupos } = require('./grupoAncora');
const { apagarEncontroGrupo } = require('./grupoEncontroApagar');

const D = /^\d{4}-\d{2}-\d{2}$/;


function hojeBRTLocal() {
  return new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
}

async function aplicarExcecaoAgenda({
  grupoId, dataOriginal, acao, novaData = null, novoHorario = null, motivo = null,
  autor = {},






  confirmarApagarChamada = false,
}) {
  if (!D.test(String(dataOriginal || ''))) {
    return { ok: false, http: 400, error: 'Informe a data do encontro que você quer alterar.' };
  }
  if (!['remarcar', 'cancelar', 'desfazer'].includes(acao)) {
    return { ok: false, http: 400, error: 'Ação inválida.' };
  }

  const hojeISO = hojeBRTLocal();






  const noPassado = dataOriginal < hojeISO;

  if (acao === 'desfazer') {
    const { error } = await supabase.from('mem_grupo_agenda_excecoes')
      .delete().eq('grupo_id', grupoId).eq('data_original', dataOriginal);
    if (error) return traduzErro(error);
    return { ok: true, http: 200, acao: 'desfeito' };
  }







  let encontroNaData = null;
  if (noPassado) {
    const { data: enc } = await supabase.from('mem_grupo_encontros')
      .select('id').eq('grupo_id', grupoId).eq('data', dataOriginal)
      .is('deleted_at', null).limit(1).maybeSingle();
    encontroNaData = enc || null;
  }








  if (acao === 'cancelar' && encontroNaData) {
    if (!confirmarApagarChamada) {


      let presentes = null;
      try {
        const { count } = await supabase.from('mem_grupo_encontro_presencas')
          .select('membro_id', { count: 'exact', head: true })
          .eq('encontro_id', encontroNaData.id).eq('presente', true);
        presentes = typeof count === 'number' ? count : null;
      } catch (e) { console.warn('[grupoAgendaExcecao] contar presentes:', e.message); }
      return {
        ok: false, http: 409, codigo: 'tem_chamada', presentes,
        error: presentes
          ? `Esse dia tem chamada com ${presentes} ${presentes === 1 ? 'presença' : 'presenças'}. Marcar que não aconteceu vai APAGAR essa chamada.`
          : 'Esse dia tem uma chamada registrada. Marcar que não aconteceu vai APAGAR essa chamada.',
      };
    }







    await apagarEncontroGrupo(encontroNaData.id);
    encontroNaData = null;
  }

  const linha = {
    grupo_id: grupoId,
    data_original: dataOriginal,
    status: acao === 'cancelar' ? 'cancelado' : 'remarcado',
    motivo: motivo ? String(motivo).trim().slice(0, 300) : null,
    decidido_por: autor.id || null,
    decidido_por_nome: autor.nome || null,
    updated_at: new Date().toISOString(),
  };

  if (acao === 'remarcar') {
    if (!D.test(String(novaData || ''))) {
      return { ok: false, http: 400, error: 'Informe a nova data.' };
    }


    if (!noPassado && novaData < hojeISO) {
      return { ok: false, http: 400, error: 'A nova data não pode ser no passado.' };
    }
    if (noPassado && novaData > hojeISO) {




      return {
        ok: false, http: 400, codigo: 'correcao_no_futuro',
        error: 'Um encontro que já passou só pode ser corrigido para uma data passada. Se ele não aconteceu, marque "não aconteceu" — o próximo encontro do grupo já está na agenda.',
      };
    }
    if (novoHorario && !/^\d{2}:\d{2}$/.test(String(novoHorario))) {
      return { ok: false, http: 400, error: 'Horário inválido (use HH:MM).' };
    }





    let janela = null;
    try {
      const { data: g } = await supabase.from('mem_grupos')
        .select('dia_semana, horario, recorrencia').eq('id', grupoId).maybeSingle();
      const [anc, ini] = await Promise.all([ancorasDeGrupos([grupoId]), iniciosDeGrupos([grupoId])]);
      if (noPassado) {


        const passadas = ocorrenciasPassadas({
          diaSemana: g?.dia_semana, horario: g?.horario, recorrencia: g?.recorrencia,
          ancoraISO: anc[grupoId] || null,
          inicioISO: ini[grupoId] || null, desdeISO: ini[grupoId] || null,
          excecoes: [], quantas: 24,
        });
        const i = passadas.findIndex(o => o.data_original === dataOriginal);
        if (i >= 0) {
          const j = janelaCorrecaoPassada({
            dataOriginal,
            anteriorISO: passadas[i + 1]?.data || null,
            proximaISO: passadas[i - 1]?.data || null,
            hojeISO,




            ocupadas: await datasComChamada(grupoId, dataOriginal),
          });


          if (j) janela = { pode_remarcar: j.pode, remarcar_de: j.de, remarcar_ate: j.ate, bloqueadas: j.bloqueadas };
        }
      } else {
        const lista = proximasOcorrencias({
          diaSemana: g?.dia_semana, horario: g?.horario, recorrencia: g?.recorrencia,
          ancoraISO: anc[grupoId] || null, excecoes: [], quantas: 40, janelaDias: 200,
        });
        janela = lista.find(o => o.data_original === dataOriginal) || null;
      }
    } catch (e) {
      console.warn('[grupoAgendaExcecao] janela:', e.message);
    }


    if (!janela) {
      return {
        ok: false, http: 409, codigo: 'janela_indisponivel',
        error: 'Não consegui conferir a agenda deste grupo agora. Tente de novo em instantes.',
      };
    }
    if (!janela.pode_remarcar) {
      return {
        ok: false, http: 409, codigo: 'sem_janela',
        error: noPassado
          ? 'Não sobra nenhuma data livre entre os encontros vizinhos. Se este não aconteceu, marque "não aconteceu".'
          : 'Este encontro está colado no seguinte — não dá para remarcar. Se ele não vai acontecer, cancele.',
      };
    }
    if ((janela.bloqueadas || []).includes(novaData)) {
      return {
        ok: false, http: 409, codigo: 'data_ocupada',
        error: 'Já existe um encontro registrado nessa data. Escolha outro dia.',
      };
    }
    if (novaData < janela.remarcar_de || novaData > janela.remarcar_ate) {
      return {
        ok: false, http: 409, codigo: 'fora_da_janela',
        error: noPassado
          ? `A data precisa ficar entre ${janela.remarcar_de} e ${janela.remarcar_ate} — senão o encontro passa por cima do anterior ou do seguinte.`
          : `A nova data precisa ficar entre ${janela.remarcar_de} e ${janela.remarcar_ate}. Para mover mais que isso, cancele este encontro.`,
        remarcar_de: janela.remarcar_de,
        remarcar_ate: janela.remarcar_ate,
      };
    }








    if (encontroNaData) {
      const { error: eMove } = await supabase.from('mem_grupo_encontros')
        .update({ data: novaData }).eq('id', encontroNaData.id);
      if (eMove) {
        if (eMove.code === '23505') {
          return {
            ok: false, http: 409, codigo: 'data_ocupada',
            error: 'Já existe um encontro registrado nessa data. Escolha outro dia.',
          };
        }
        return traduzErro(eMove);
      }
    }
    linha.nova_data = novaData;
    linha.novo_horario = novoHorario || null;
  } else {
    linha.nova_data = null;
    linha.novo_horario = null;
  }


  const { error } = await supabase.from('mem_grupo_agenda_excecoes')
    .upsert(linha, { onConflict: 'grupo_id,data_original' });
  if (error) return traduzErro(error);

  return {
    ok: true, http: 200, acao: linha.status, no_passado: noPassado,
    motivo: linha.motivo, nova_data: linha.nova_data, novo_horario: linha.novo_horario,
    chamada_movida: Boolean(encontroNaData && acao === 'remarcar'),
  };
}










async function datasComChamada(grupoId, exceto) {
  try {
    const { data, error } = await supabase.from('mem_grupo_encontros')
      .select('data').eq('grupo_id', grupoId).is('deleted_at', null);
    if (error) throw error;
    return (data || [])
      .map(e => String(e.data).slice(0, 10))
      .filter(d => d !== exceto);
  } catch (e) {
    console.warn('[grupoAgendaExcecao] datas ocupadas:', e.message);
    return [];
  }
}


function traduzErro(error) {
  if (/does not exist|schema cache/i.test(error.message || '')) {
    return {
      ok: false, http: 503, codigo: 'sem_tabela',
      error: 'A agenda ainda não está disponível. Avise a equipe de grupos.',
    };
  }
  throw error;
}

module.exports = { aplicarExcecaoAgenda };
