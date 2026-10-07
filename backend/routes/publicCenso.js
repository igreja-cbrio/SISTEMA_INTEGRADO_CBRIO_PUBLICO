













const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { supabase } = require('../utils/supabase');
const { montarItens, validarPerguntas } = require('../utils/censoPerguntas');
const {
  gerarTokenIdentidade, verificarTokenIdentidade,
  gerarSegredoRetomada, hashRetomada, retomadaConfere,
} = require('../utils/censoRespostaToken');
const { cpfValido, normalizarCpf } = require('../utils/cpf');
const { casarComOpcao, loteParaBanco } = require('../utils/censoVocabulario');
const { podeIdentificarPorCpf, camposDoCadastro } = require('../utils/censoPrefill');
const { acharRespostaDaPessoa } = require('../services/censoJaRespondeu');
const { acharMembroGuardado, acharOuCriarGuardado } = require('../services/membroMatch');
const {
  gravarConsentimentosDoCenso, ligarOptinDoCenso,
} = require('../services/censoConsentimentoGravar');

let reconciliarCenso;
try { ({ reconciliarCenso } = require('../services/censoReconciliar')); }
catch { reconciliarCenso = async () => ({ aplicados: [], conflitos: [] }); }





















const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.PUBLIC_CENSO_RATE_LIMIT_MAX || 120000),
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente em alguns minutos.' },
});






const lookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.PUBLIC_CENSO_LOOKUP_RATE_LIMIT_MAX || 6000),
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Muitas tentativas. Tente novamente em alguns minutos.' },
});

const CANAIS = ['qr', 'app', 'link', 'email', 'whatsapp', 'totem'];












const CACHE_TTL_MS = 20_000;
const _cachePesquisa = new Map();

function cacheLer(slug) {
  const hit = _cachePesquisa.get(slug);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.valor;
  if (hit) _cachePesquisa.delete(slug);
  return null;
}
function cacheGravar(slug, valor) {


  if (_cachePesquisa.size > 50) _cachePesquisa.clear();
  _cachePesquisa.set(slug, { at: Date.now(), valor });
}

function ipHash(req) {
  const ip = req.ip || req.headers['x-forwarded-for'] || '';
  return crypto.createHash('sha256').update(`censo:${ip}`).digest('hex').slice(0, 32);
}

function ehUuid(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));
}


async function carregarPesquisaAberta(slug) {
  const chave = String(slug || '').trim();
  let data = cacheLer(chave);
  if (!data) {
    const r = await supabase
      .from('cen_pesquisa')
      .select('id, slug, titulo, subtitulo, perguntas, config, consentimento_texto, status, abre_em, fecha_em')
      .eq('slug', chave)
      .is('deleted_at', null)
      .maybeSingle();
    if (r.error) throw new Error(r.error.message);
    data = r.data;


    cacheGravar(chave, data || null);
  }
  if (!data) return { erro: 404, mensagem: 'Pesquisa não encontrada' };
  if (data.status !== 'aberta') return { erro: 409, mensagem: 'Esta pesquisa não está recebendo respostas.' };
  const agora = Date.now();
  if (data.abre_em && new Date(data.abre_em).getTime() > agora) {
    return { erro: 409, mensagem: 'Esta pesquisa ainda não começou.' };
  }
  if (data.fecha_em && new Date(data.fecha_em).getTime() < agora) {
    return { erro: 409, mensagem: 'Esta pesquisa já encerrou.' };
  }
  return { pesquisa: data };
}












const MIN_BUSCA = 2;
const TETO_CATALOGO = 20;

let _igrejas = null;
function igrejas() {
  if (_igrejas) return _igrejas;
  try {
    const doc = require('../data/igrejasRJ.json');
    _igrejas = (doc.igrejas || []).map((i) => ({
      rotulo: i.nome,
      detalhe: [i.bairro, i.cidade].filter(Boolean).join(' · ') || null,
      chave: chaveBusca(`${i.nome} ${i.cidade || ''} ${i.bairro || ''}`),
    }));
  } catch { _igrejas = []; }
  return _igrejas;
}

function chaveBusca(v) {
  return String(v || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

router.get('/catalogo/:nome', submitLimiter, async (req, res) => {
  try {
    const nome = String(req.params.nome || '').trim();
    const q = chaveBusca(req.query.q);
    if (q.length < MIN_BUSCA) return res.json({ itens: [] });

    if (nome === 'igrejas_rj') {


      const termos = q.split(' ').filter(Boolean);
      const achados = [];
      for (const i of igrejas()) {
        if (termos.every((t) => i.chave.includes(t))) {
          achados.push({ valor: i.rotulo, rotulo: i.rotulo, detalhe: i.detalhe });
          if (achados.length >= TETO_CATALOGO) break;
        }
      }
      res.set('Cache-Control', 'public, s-maxage=3600');
      return res.json({ itens: achados, incompleto: true });
    }

    if (nome === 'grupos_ativos') {
      const termo = `%${String(req.query.q || '').trim()}%`;
      const { data, error } = await supabase
        .from('mem_grupos')
        .select('id, nome, bairro, dia_semana, lider:mem_membros!mem_grupos_lider_id_fkey(nome)')
        .eq('ativo', true).is('deleted_at', null)
        .or(`nome.ilike.${termo}`)
        .order('nome').limit(TETO_CATALOGO);
      if (error) return res.json({ itens: [] });




      const { data: porLider } = await supabase
        .from('mem_grupos')


        .select('id, nome, bairro, dia_semana, lider:mem_membros!mem_grupos_lider_id_fkey!inner(nome)')
        .eq('ativo', true).is('deleted_at', null)
        .ilike('lider.nome', termo)
        .order('nome').limit(TETO_CATALOGO);

      const DIA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
      const vistos = new Set();
      const itens = [];
      for (const g of [...(data || []), ...(porLider || [])]) {
        if (vistos.has(g.id)) continue;
        vistos.add(g.id);
        itens.push({
          valor: g.nome,
          rotulo: g.nome,
          detalhe: [
            g.lider?.nome ? `líder ${g.lider.nome}` : null,
            g.bairro,
            typeof g.dia_semana === 'number' ? DIA[g.dia_semana] : null,
          ].filter(Boolean).join(' · ') || null,
        });
        if (itens.length >= TETO_CATALOGO) break;
      }
      return res.json({ itens });
    }

    return res.status(404).json({ error: 'Catálogo não encontrado' });
  } catch (e) {
    console.error('[PUBLIC CENSO] catalogo:', e.message);
    res.json({ itens: [] });
  }
});


router.get('/:slug', submitLimiter, async (req, res) => {
  try {
    const r = await carregarPesquisaAberta(req.params.slug);
    if (r.erro) return res.status(r.erro).json({ error: r.mensagem });
    const p = r.pesquisa;


    res.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
    res.json({
      slug: p.slug,
      titulo: p.titulo,
      subtitulo: p.subtitulo,
      perguntas: p.perguntas || [],
      config: p.config || {},
      consentimento_texto: p.consentimento_texto,
    });
  } catch (e) { res.status(500).json({ error: 'Não foi possível carregar a pesquisa.' }); }
});



















function valoresPreenchidos(pesquisa, membro, { viaToken } = {}) {


  const doCadastro = camposDoCadastro(membro, { viaToken });
  const valores = {};
  for (const q of pesquisa.perguntas || []) {
    if (!q.preenche_de) continue;
    const bruto = doCadastro[q.preenche_de];
    if (bruto === null || bruto === undefined || bruto === '') continue;
    if (Array.isArray(q.opcoes) && q.opcoes.length) {
      const casado = casarComOpcao(bruto, q.opcoes);


      if (casado) valores[q.id] = casado;
    } else {
      valores[q.id] = String(bruto);
    }
  }
  return valores;
}

router.post('/:slug/prefill', lookupLimiter, async (req, res) => {



  const neutra = { encontrado: false };
  try {
    const r = await carregarPesquisaAberta(req.params.slug);
    if (r.erro) return res.status(r.erro).json({ error: r.mensagem });






    const idDoToken = verificarTokenIdentidade(req.body?.identidade);
    if (idDoToken) {
      const { data: m } = await supabase.from('mem_membros')
        .select('id, nome, cpf, telefone, email, data_nascimento, estado_civil, cidade, bairro, profissao')
        .eq('id', idDoToken).eq('active', true).is('deleted_at', null).maybeSingle();
      if (!m) return res.json(neutra);
      const ja = await acharRespostaDaPessoa({
        pesquisaId: r.pesquisa.id, membroId: m.id, cpf: m.cpf,
      });
      return res.json({
        encontrado: true,
        ja_respondeu: !!ja,
        respondida_em: ja?.concluida_em || null,


        identidade: req.body.identidade,
        valores: valoresPreenchidos(r.pesquisa, m, { viaToken: true }),
      });
    }








    const cpf = normalizarCpf(req.body?.cpf);
    const nascimento = String(req.body?.data_nascimento || '').trim();
    const temNascimento = /^\d{4}-\d{2}-\d{2}$/.test(nascimento);
    if (!podeIdentificarPorCpf({ cpfValido: cpfValido(cpf), temNascimento })) {
      return res.json(neutra);
    }

    const { data, error } = await supabase
      .from('mem_membros')
      .select('id, nome, telefone, email, data_nascimento, estado_civil, cidade, bairro, profissao')
      .eq('cpf', cpf).eq('active', true).is('deleted_at', null)
      .maybeSingle();
    if (error || !data) return res.json(neutra);


    if (data.data_nascimento !== nascimento) return res.json(neutra);







    const jaTem = await acharRespostaDaPessoa({
      pesquisaId: r.pesquisa.id, membroId: data.id, cpf,
    });

    const token = gerarTokenIdentidade(data.id);
    if (!token) return res.json(neutra);





    res.json({
      encontrado: true,
      ja_respondeu: !!jaTem,
      respondida_em: jaTem?.concluida_em || null,
      identidade: token,
      valores: valoresPreenchidos(r.pesquisa, { ...data, cpf }, { viaToken: false }),
    });
  } catch (e) { res.json(neutra); }
});




router.post('/:slug/parcial', submitLimiter, async (req, res) => {
  try {
    const r = await carregarPesquisaAberta(req.params.slug);
    if (r.erro) return res.status(r.erro).json({ error: r.mensagem });

    const respostas = req.body?.respostas;
    if (!respostas || typeof respostas !== 'object') return res.status(400).json({ error: 'Respostas inválidas' });

    const rascunhoId = req.body?.rascunho_id;
    const segredo = req.body?.retomar;
    const agora = new Date().toISOString();

    if (ehUuid(rascunhoId) && segredo) {
      const { data: atual } = await supabase
        .from('cen_resposta').select('id, retomar_hash, concluida_em')
        .eq('id', rascunhoId).eq('pesquisa_id', r.pesquisa.id).is('deleted_at', null)
        .maybeSingle();
      if (!atual || !retomadaConfere(segredo, atual.retomar_hash)) {
        return res.status(404).json({ error: 'Rascunho não encontrado' });
      }

      if (atual.concluida_em) return res.json({ ok: true, concluida: true });
      await supabase.from('cen_resposta')
        .update({ payload: respostas, ultima_atividade_em: agora })
        .eq('id', atual.id);
      return res.json({ ok: true, rascunho_id: atual.id });
    }


    const novoSegredo = gerarSegredoRetomada();
    const canal = CANAIS.includes(req.body?.canal) ? req.body.canal : 'qr';
    const { data, error } = await supabase.from('cen_resposta').insert({
      pesquisa_id: r.pesquisa.id,
      canal,
      identificado_por: 'anonimo',
      payload: respostas,
      ip_hash: ipHash(req),
      retomar_hash: hashRetomada(novoSegredo),
      ultima_atividade_em: agora,
    }).select('id').single();
    if (error) return res.status(400).json({ error: 'Não foi possível salvar o rascunho' });
    res.json({ ok: true, rascunho_id: data.id, retomar: novoSegredo });
  } catch (e) { res.status(500).json({ error: 'Não foi possível salvar o rascunho' }); }
});


router.post('/:slug/retomar', submitLimiter, async (req, res) => {
  try {
    const r = await carregarPesquisaAberta(req.params.slug);
    if (r.erro) return res.status(r.erro).json({ error: r.mensagem });
    const { rascunho_id: id, retomar } = req.body || {};
    if (!ehUuid(id) || !retomar) return res.status(404).json({ error: 'Rascunho não encontrado' });

    const { data } = await supabase
      .from('cen_resposta').select('id, payload, retomar_hash, concluida_em')
      .eq('id', id).eq('pesquisa_id', r.pesquisa.id).is('deleted_at', null)
      .maybeSingle();
    if (!data || !retomadaConfere(retomar, data.retomar_hash)) {
      return res.status(404).json({ error: 'Rascunho não encontrado' });
    }
    res.json({ ok: true, respostas: data.payload || {}, concluida: !!data.concluida_em });
  } catch (e) { res.status(500).json({ error: 'Não foi possível retomar' }); }
});


router.post('/:slug/responder', submitLimiter, async (req, res) => {
  try {


    if (String(req.body?.website || '').trim()) return res.status(201).json({ ok: true });

    const r = await carregarPesquisaAberta(req.params.slug);
    if (r.erro) return res.status(r.erro).json({ error: r.mensagem });
    const pesquisa = r.pesquisa;

    const respostas = req.body?.respostas;
    if (!respostas || typeof respostas !== 'object') return res.status(400).json({ error: 'Respostas inválidas' });

    const envioId = String(req.body?.envio_id || '').trim().slice(0, 64) || null;











    if (req.body?.consentimento !== true) {
      return res.status(400).json({ error: 'É preciso aceitar o aviso de privacidade para enviar.' });
    }



    const v = validarPerguntas(pesquisa.perguntas || []);
    if (!v.ok) return res.status(500).json({ error: 'Questionário indisponível no momento.' });

    const { itens, faltando, cuidados } = montarItens({ perguntas: v.perguntas, respostas });
    if (faltando.length) {
      return res.status(400).json({
        error: 'Faltam respostas obrigatórias.',
        faltando: faltando.map((f) => f.id),
      });
    }


    let membroId = null;
    let identificadoPor = 'anonimo';
    let matchedBy = null;
    let nomeDeclarado = null;
    let contatoDeclarado = null;

    const doToken = verificarTokenIdentidade(req.body?.identidade);
    if (doToken) { membroId = doToken; identificadoPor = 'cpf_nascimento'; matchedBy = 'cpf'; }



    const porCampo = {};
    for (const p of v.perguntas) {
      if (p.preenche_de && respostas[p.id] !== undefined) porCampo[p.preenche_de] = respostas[p.id];
    }





















    const cpfInformado = normalizarCpf(porCampo.cpf);
    if (!membroId && cpfInformado && cpfValido(cpfInformado)) {
      try {
        const { data: m } = await supabase
          .from('mem_membros').select('id')
          .eq('cpf', cpfInformado).eq('active', true).is('deleted_at', null)
          .maybeSingle();
        if (m?.id) { membroId = m.id; matchedBy = 'cpf'; identificadoPor = 'cpf_nascimento'; }
      } catch {                                                    }
    }

    const vincularAgora = pesquisa.config?.vincular_na_hora === true;
    if (!membroId && vincularAgora) {
      try {
        const hit = await acharMembroGuardado({
          email: porCampo.email,
          telefone: porCampo.telefone,
          nome: porCampo.nome,
          dataNascimento: porCampo.data_nascimento,





          genero: porCampo.genero,
        });
        if (hit?.membro_id) {
          membroId = hit.membro_id;
          matchedBy = hit.matched_by;
          identificadoPor = hit.matched_by === 'cpf' ? 'cpf_nascimento' : 'nome_nascimento';
        }
      } catch {                                                            }
    }














    if (!membroId && cpfInformado && cpfValido(cpfInformado)) {
      try {
        const criado = await acharOuCriarGuardado({
          cpf: cpfInformado,
          nome: porCampo.nome,
          email: porCampo.email,
          telefone: porCampo.telefone,
          dataNascimento: porCampo.data_nascimento,





          genero: porCampo.genero,
          status: 'visitante',
          origem: 'censo',
          origemId: envioId || null,







        }, { soChaveForte: true, permitirMatchPerfeito: true });
        if (criado?.membro_id) {
          membroId = criado.membro_id;
          matchedBy = 'cpf';
          identificadoPor = 'cpf_nascimento';
        }
      } catch (e) { console.error('[PUBLIC CENSO] criar pessoa:', e.message); }
    }





    if (!membroId) {
      nomeDeclarado = porCampo.nome ? String(porCampo.nome).trim().slice(0, 160) : null;
      contatoDeclarado = porCampo.telefone || porCampo.email
        ? String(porCampo.telefone || porCampo.email).trim().slice(0, 160) : null;
    }

    const agora = new Date().toISOString();
    const iniciada = req.body?.iniciada_em && !Number.isNaN(Date.parse(req.body.iniciada_em))
      ? new Date(req.body.iniciada_em).toISOString() : agora;
    const duracao = Math.max(0, Math.round((Date.parse(agora) - Date.parse(iniciada)) / 1000)) || null;

    const linha = {
      pesquisa_id: pesquisa.id,
      membro_id: membroId,
      canal: CANAIS.includes(req.body?.canal) ? req.body.canal : 'qr',
      identificado_por: identificadoPor,
      nome_declarado: nomeDeclarado,
      contato_declarado: contatoDeclarado,
      payload: respostas,
      iniciada_em: iniciada,
      concluida_em: agora,
      duracao_seg: duracao,
      dispositivo: String(req.headers['user-agent'] || '').slice(0, 200) || null,
      ip_hash: ipHash(req),
      consentimento_texto: pesquisa.consentimento_texto,
      consentimento_em: agora,
      envio_id: envioId,
      ultima_atividade_em: agora,


      pos_processado_em: vincularAgora ? agora : null,
    };


    let respostaId = null;
    const rascunhoId = req.body?.rascunho_id;
    if (ehUuid(rascunhoId) && req.body?.retomar) {
      const { data: rascunho } = await supabase
        .from('cen_resposta').select('id, retomar_hash, concluida_em')
        .eq('id', rascunhoId).eq('pesquisa_id', pesquisa.id).is('deleted_at', null)
        .maybeSingle();
      if (rascunho && retomadaConfere(req.body.retomar, rascunho.retomar_hash)) {
        if (rascunho.concluida_em) return res.json({ ok: true, resposta_id: rascunho.id, repetido: true });
        const { error } = await supabase.from('cen_resposta').update(linha).eq('id', rascunho.id);
        if (!error) respostaId = rascunho.id;
      }
    }

    const veioDeRascunho = !!respostaId;
    if (!respostaId) {
      const { data, error } = await supabase.from('cen_resposta').insert(linha).select('id').single();
      if (error) {
        if (error.code === '23505') {






          if (envioId) {
            const { data: jaEnviado } = await supabase
              .from('cen_resposta').select('id')
              .eq('pesquisa_id', pesquisa.id).eq('envio_id', envioId)
              .maybeSingle();
            if (jaEnviado) return res.json({ ok: true, resposta_id: jaEnviado.id, repetido: true });
          }
          return res.status(409).json({ error: 'Você já respondeu este censo. Obrigado!', ja_respondeu: true });
        }
        return res.status(400).json({ error: 'Não foi possível registrar sua resposta.' });
      }
      respostaId = data.id;
    }






    if (veioDeRascunho) {
      await supabase.from('cen_resposta_item').delete().eq('resposta_id', respostaId);
    }
    const porId = new Map(v.perguntas.map((p) => [p.id, p]));
    const linhas = itens.map((i) => ({
      resposta_id: respostaId,
      pesquisa_id: pesquisa.id,
      pergunta_id: i.pergunta_id,
      pergunta_texto: i.pergunta_texto,
      tipo: i.tipo,
      valor_texto: i.valor_texto,
      valor_num: i.valor_num,
      valor_opcoes: i.valor_opcoes,
      sensivel: i.sensivel === true,
      acao: porId.get(i.pergunta_id)?.acao === 'cuidado' ? 'cuidado' : null,
    }));
    if (linhas.length) {
      const { error } = await supabase.from('cen_resposta_item').insert(linhas);
      if (error) {










        console.error('[PUBLIC CENSO] itens:', error.message);
        await supabase.from('cen_resposta').update({
          pos_processado_em: null,
          pos_processo_erro: `itens_nao_gravados: ${String(error.message).slice(0, 300)}`,
        }).eq('id', respostaId);
      }
    }




    if (cuidados.length) {
      const { error } = await supabase.from('cen_cuidado').upsert(
        cuidados.map((c) => ({
          pesquisa_id: pesquisa.id,
          resposta_id: respostaId,
          membro_id: membroId,
          tipo: c.tipo,
          status: 'aberto',
        })),
        { onConflict: 'resposta_id,tipo', ignoreDuplicates: true },
      );
      if (error) console.error('[PUBLIC CENSO] cuidado:', error.message);
    }














    let consentimentos = [];
    try {
      const out = await gravarConsentimentosDoCenso({
        respostaId,
        perguntas: v.perguntas,
        respostas,
        membroId,
        userAgent: String(req.headers['user-agent'] || '').slice(0, 300) || null,
      });
      consentimentos = out.consentimentos;
    } catch (e) {
      console.error('[PUBLIC CENSO] consentimento:', e.message);
      await supabase.from('cen_resposta').update({
        pos_processado_em: null,
        pos_processo_erro: `consentimento_nao_gravado: ${String(e.message).slice(0, 300)}`,
      }).eq('id', respostaId);
    }





    let cadastro = null;
    if (vincularAgora && membroId && matchedBy) {
      try {



        const dados = loteParaBanco(porCampo);
        delete dados.nome;
        cadastro = await reconciliarCenso({ membroId, matchedBy, dados, origemId: respostaId });




        await ligarOptinDoCenso({ membroId, consentimentos, em: agora });
      } catch (e) { console.error('[PUBLIC CENSO] reconciliar:', e.message); }
    }

    res.status(201).json({
      ok: true,
      resposta_id: respostaId,
      identificado: !!membroId,
      cuidados: cuidados.map((c) => c.tipo),
      cadastro_conflitos: cadastro?.conflitos?.length || 0,
    });
  } catch (e) {
    console.error('[PUBLIC CENSO] responder:', e.message);
    res.status(500).json({ error: 'Não foi possível registrar sua resposta.' });
  }
});

module.exports = router;
