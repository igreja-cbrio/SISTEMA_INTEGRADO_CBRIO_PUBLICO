







const router = require('express').Router();
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const wpp = require('../services/whatsappService');

const DIA = 86400000;
const soDigitos = (s) => String(s || '').replace(/\D/g, '');
const chaveNome = (s) => String(s || '').trim().toLowerCase();





const { contatoFoiFeito } = require('../utils/primeiroContatoRegua');

router.use(authenticate);


async function jaTemNext(membroIds, cpfs, nomes) {
  const membro = new Set(), cpf = new Set(), nome = new Set();
  const qIn = async (col, vals, alvo, tf = (x) => x) => {
    const uniq = [...new Set(vals.filter(Boolean))];
    for (let i = 0; i < uniq.length; i += 200) {
      const chunk = uniq.slice(i, i + 200);
      if (chunk.length === 0) break;
      const { data } = await supabase.from('next_inscricoes').select(col).in(col, chunk);
      for (const r of data || []) if (r[col] != null) alvo.add(tf(r[col]));
    }
  };
  await qIn('membro_id', membroIds, membro);
  await qIn('cpf', cpfs, cpf, soDigitos);
  await qIn('nome', nomes, nome, chaveNome);
  return { membro, cpf, nome };
}




async function marcarStatusDisparo(ids, tipo, userId) {
  if (!Array.isArray(ids) || ids.length === 0) return;
  const agora = new Date().toISOString();
  if (tipo === 'boas_vindas') {
    await supabase.from('cui_convertidos')
      .update({ primeiro_contato_em: agora, primeiro_contato_por: userId || null })
      .in('id', ids).is('primeiro_contato_em', null);
  } else {
    await supabase.from('cui_convertidos')
      .update({ next_convite_em: agora, next_convite_por: userId || null })
      .in('id', ids).is('next_convite_em', null);
  }
}



router.get('/pendentes', authorizeModule('cuidados', 1), async (req, res) => {
  try {
    const contato = String(req.query.contato || 'todos');
    const desde = new Date(Date.now() - 120 * DIA).toISOString().slice(0, 10);
    const { data: convs } = await supabase
      .from('cui_convertidos')
      .select('id, nome, cpf, telefone, area, data_culto, membro_id, primeiro_contato_em, primeiro_contato_status, next_convite_em')
      .is('deleted_at', null)
      .gte('data_culto', desde)
      .order('data_culto', { ascending: false })
      .limit(1000);

    const sets = await jaTemNext(
      (convs || []).map((c) => c.membro_id).filter(Boolean),
      (convs || []).map((c) => c.cpf).filter(Boolean),
      (convs || []).map((c) => c.nome).filter(Boolean),
    );
    const temNext = (c) =>
      (c.membro_id && sets.membro.has(c.membro_id)) ||
      (c.cpf && sets.cpf.has(soDigitos(c.cpf))) ||
      (c.nome && sets.nome.has(chaveNome(c.nome)));

    const pendentes = (convs || [])
      .filter((c) => !temNext(c))
      .map((c) => ({
        id: c.id, nome: c.nome, telefone: c.telefone || null, area: c.area || null,
        data_culto: c.data_culto, tem_telefone: !!soDigitos(c.telefone),
        contatado: contatoFoiFeito(c),
        next_convite_em: c.next_convite_em || null,
      }))
      .filter((c) => (contato === 'nao' ? !c.contatado : contato === 'sim' ? c.contatado : true));
    res.json(pendentes);
  } catch (e) {
    console.error('[next-convite] pendentes:', e.message);
    res.status(500).json({ error: 'Erro ao carregar convertidos' });
  }
});


router.get('/config', authorizeModule('cuidados', 1), async (_req, res) => {
  try {
    const { data } = await supabase.from('next_convite_config').select('mensagem_modelo, mensagem_boas_vindas, link_inscricao').eq('id', 1).maybeSingle();
    res.json({
      mensagem_modelo: data?.mensagem_modelo || '',
      mensagem_boas_vindas: data?.mensagem_boas_vindas || '',
      link_inscricao: data?.link_inscricao || '',
      template_configurado: !!process.env.WHATSAPP_TEMPLATE_NEXT_CONVITE,
      template_boas_vindas_configurado: !!process.env.WHATSAPP_TEMPLATE_BOAS_VINDAS,
    });
  } catch (e) {
    console.error('[next-convite] config get:', e.message);
    res.status(500).json({ error: 'Erro ao carregar config' });
  }
});


router.put('/config', authorizeModule('cuidados', 2), async (req, res) => {
  try {
    const { mensagem_modelo, mensagem_boas_vindas, link_inscricao } = req.body || {};
    const patch = { id: 1, updated_at: new Date().toISOString() };
    if (mensagem_modelo !== undefined) patch.mensagem_modelo = mensagem_modelo != null ? String(mensagem_modelo).slice(0, 2000) : null;
    if (mensagem_boas_vindas !== undefined) patch.mensagem_boas_vindas = mensagem_boas_vindas != null ? String(mensagem_boas_vindas).slice(0, 2000) : null;
    if (link_inscricao !== undefined) patch.link_inscricao = link_inscricao != null ? String(link_inscricao).slice(0, 500) : null;
    const { error } = await supabase.from('next_convite_config').upsert(patch);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[next-convite] config put:', e.message);
    res.status(500).json({ error: 'Erro ao salvar config' });
  }
});


router.post('/enviar', authorizeModule('cuidados', 2), async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.convertido_ids) ? req.body.convertido_ids : [];
    if (ids.length === 0) return res.status(400).json({ error: 'Selecione ao menos uma pessoa' });


    const tipo = req.body?.tipo === 'boas_vindas' ? 'boas_vindas' : 'next';
    const templateName = tipo === 'boas_vindas'
      ? process.env.WHATSAPP_TEMPLATE_BOAS_VINDAS
      : process.env.WHATSAPP_TEMPLATE_NEXT_CONVITE;

    const { data: convs } = await supabase
      .from('cui_convertidos').select('id, nome, telefone').in('id', ids).is('deleted_at', null);

    let enviados = 0, sem_telefone = 0, falhas = 0, na_fila = 0;
    const enviadosIds = [];
    const { enfileirar } = require('../services/whatsappFila');
    for (const c of convs || []) {
      const tel = soDigitos(c.telefone);
      if (!tel) { sem_telefone++; continue; }
      if (!templateName) continue;
      const primeiro = (c.nome || '').trim().split(/\s+/)[0] || '';



      const r = await enfileirar({
        telefone: c.telefone,
        template: templateName,
        params: [primeiro],
        idioma: 'pt_BR',
        contexto: tipo === 'boas_vindas' ? 'next.boas_vindas' : 'next.convite',
        refId: c.id,
      });
      if (r?.sent) { enviados++; enviadosIds.push(c.id); }
      else if (r?.queued) { na_fila++; }
      else falhas++;
    }

    if (enviadosIds.length) await marcarStatusDisparo(enviadosIds, tipo, req.user?.id);

    res.json({
      total: ids.length,
      enviados,
      na_fila,
      sem_telefone,
      falhas,
      template_configurado: !!templateName,
    });
  } catch (e) {
    console.error('[next-convite] enviar:', e.message);
    res.status(500).json({ error: 'Erro ao enviar convites' });
  }
});



router.post('/marcar', authorizeModule('cuidados', 2), async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.convertido_ids) ? req.body.convertido_ids : [];
    if (ids.length === 0) return res.status(400).json({ error: 'Nada para marcar' });
    const tipo = req.body?.tipo === 'boas_vindas' ? 'boas_vindas' : 'next';
    await marcarStatusDisparo(ids, tipo, req.user?.id);
    res.json({ ok: true });
  } catch (e) {
    console.error('[next-convite] marcar:', e.message);
    res.status(500).json({ error: 'Erro ao marcar status' });
  }
});

module.exports = router;
