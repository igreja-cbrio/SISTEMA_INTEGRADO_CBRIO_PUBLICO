




































const { supabase } = require('../utils/supabase');
const {
  validarCamposPadrao, processarIdentidade, registrarConsentimentos, TEXTOS,
} = require('./inscricaoContrato');
const { registrarContatoDaPorta } = require('./membroMatch');
const { registrarEventoPedido } = require('./grupoPedidoEventos');
const { funcaoDoRoster } = require('../utils/pessoaDiretaCampos');














async function cadastrarPessoaNoGrupo({ grupo, dados = {}, autor = {}, origem = 'grupos_app_lider', ip = null, userAgent = null }) {



  const { erros, valores } = validarCamposPadrao(dados, {
    exigirCpf: true, exigirEmail: true, exigirNascimento: true, exigirSexo: true,
  });
  if (Object.keys(erros).length) {
    const campo = Object.keys(erros)[0];
    return { ok: false, http: 400, error: erros[campo], campo, erros };
  }

  const funcao = funcaoDoRoster(dados);


  const optin = dados.whatsapp_optin === true;






  const ident = await processarIdentidade({
    nomeCompleto: valores.nomeCompleto,
    cpf: valores.cpf,
    email: valores.email,
    telefone: valores.telefone,
    dataNascimento: valores.dataNascimento,
    genero: valores.sexo,
    politica: 'criar',



    status: 'visitante',
    origem,
    origemId: grupo.id,
  });
  const membroId = ident?.membroId;
  if (!membroId) {
    return { ok: false, http: 502, error: 'Não foi possível registrar a pessoa. Tente de novo.' };
  }






  try {
    const { data: mem } = await supabase.from('mem_membros')
      .select('genero, data_nascimento, email, telefone, endereco')
      .eq('id', membroId).maybeSingle();
    if (mem) {
      const upd = {};
      if (valores.sexo && !mem.genero) upd.genero = valores.sexo;
      if (valores.dataNascimento && !mem.data_nascimento) upd.data_nascimento = valores.dataNascimento;
      if (valores.email && !mem.email) upd.email = valores.email;
      const telAtual = String(mem.telefone || '').replace(/\D/g, '');
      if (valores.telefone && !telAtual) upd.telefone = valores.telefone;
      if (valores.endereco && !mem.endereco) upd.endereco = valores.endereco;
      if (Object.keys(upd).length) await supabase.from('mem_membros').update(upd).eq('id', membroId);




      const emailDiverge = valores.email && mem.email
        && String(mem.email).trim().toLowerCase() !== valores.email;
      const telDiverge = valores.telefone && telAtual && telAtual !== valores.telefone;
      if (emailDiverge || telDiverge) {
        registrarContatoDaPorta(membroId, {
          telefone: telDiverge ? valores.telefone : null,
          email: emailDiverge ? valores.email : null,
        }, origem);
      }
    }
  } catch (e) { console.warn('[grupoPessoaDireta] enriquecer cadastro:', e.message); }





  if (optin) {
    try {
      await supabase.from('mem_membros')
        .update({ whatsapp_optin: true, whatsapp_optin_em: new Date().toISOString() })
        .eq('id', membroId).is('deleted_at', null)
        .or('whatsapp_optin.is.null,whatsapp_optin.eq.false');
    } catch (e) { console.warn('[grupoPessoaDireta] optin:', e.message); }
  }


  const { data: jaAtivo } = await supabase.from('mem_grupo_membros')
    .select('id').eq('grupo_id', grupo.id).eq('membro_id', membroId)
    .is('saiu_em', null).is('deleted_at', null).limit(1).maybeSingle();
  if (jaAtivo) {
    return { ok: true, http: 200, ja_no_grupo: true, membro_id: membroId, nome: valores.nomeCompleto };
  }

  const { data: vinculo, error: eV } = await supabase.from('mem_grupo_membros').insert({
    grupo_id: grupo.id,
    membro_id: membroId,
    funcao,
    entrou_em: new Date().toISOString().slice(0, 10),
  }).select('id').single();
  if (eV) throw eV;





  let pedidoFechado = null;
  try {
    const { data: ped } = await supabase.from('mem_grupo_pedidos')
      .select('id').eq('grupo_id', grupo.id).eq('membro_id', membroId)
      .eq('status', 'pendente').is('deleted_at', null).limit(1).maybeSingle();
    if (ped?.id) {
      const { data: upd } = await supabase.from('mem_grupo_pedidos')
        .update({ status: 'aprovado', decidido_por_nome: `${autor.nome || 'Equipe'} (cadastro direto)` })
        .eq('id', ped.id).eq('status', 'pendente').select('id');
      if (upd && upd.length) {
        pedidoFechado = ped.id;
        await registrarEventoPedido(ped.id, 'aprovado_triagem',
          { origem, vinculo_id: vinculo?.id || null }, autor.nome || null).catch(() => {});
      }
    }
  } catch (e) { console.warn('[grupoPessoaDireta] fechar pedido pendente:', e.message); }










  const prefixo = `DECLARADO PRESENCIALMENTE POR ${autor.nome || 'um líder/equipe'} `
    + `no cadastro do grupo "${grupo.nome}" pelo ${origem === 'grupos_erp_equipe' ? 'sistema' : 'app'} `
    + '(não é aceite digitado pelo próprio titular). Texto apresentado: ';
  registrarConsentimentos({
    porta: 'grupos',
    refId: vinculo?.id || null,
    membroId,
    ip,
    userAgent,
    itens: [
      { tipo: 'termos_lgpd', aceito: true, texto: prefixo + TEXTOS.termos_lgpd },



      { tipo: 'whatsapp', aceito: optin, texto: prefixo + (TEXTOS.whatsapp || 'Autorizo receber mensagens no WhatsApp.') },
    ],
  }).catch(e => console.warn('[grupoPessoaDireta] consentimento:', e.message));

  return {
    ok: true,
    http: 201,
    membro_id: membroId,
    vinculo_id: vinculo?.id || null,
    nome: valores.nomeCompleto,
    funcao,




    pessoa_nova: ident?.created === true,
    ligada_por: ident?.matchedBy || null,
    pedido_fechado: pedidoFechado,
  };
}

module.exports = { cadastrarPessoaNoGrupo };
