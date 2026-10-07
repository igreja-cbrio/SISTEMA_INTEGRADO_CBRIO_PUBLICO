






const router = require('express').Router();
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { escapePostgrestValue } = require('../utils/sanitize');
const { acharOuCriar, buscarCandidatos } = require('../services/membroMatch');

router.use(authenticate);

function cleanCpf(cpf) {
  return String(cpf || '').replace(/\D/g, '');
}






const findOrCreateMembro = acharOuCriar;







router.get('/lookup', authorizeModule('membros', 1), async (req, res) => {
  try {
    const cpf = cleanCpf(req.query.cpf);
    const email = req.query.email ? String(req.query.email).trim().toLowerCase() : null;

    const emailEsc = email ? escapePostgrestValue(email) : null;
    const tel = req.query.telefone ? String(req.query.telefone).replace(/\D/g, '') : null;

    if (!cpf && !email && !tel) {
      return res.status(400).json({ error: 'Informe ao menos cpf, email ou telefone' });
    }


    const membros = await buscarCandidatos({ cpf, email, telefone: tel }, { limit: 5 });

    if (!membros || membros.length === 0) {

      const visitantePromise = (cpf && cpf.length === 11) || tel || email
        ? supabase.from('int_visitantes')
            .select('id, nome, email, telefone, cpf, status, membresia_id, data_visita')
            .or([
              cpf && cpf.length === 11 ? `cpf.eq.${cpf}` : null,
              email ? `email.ilike.${emailEsc}` : null,
              tel ? `telefone.ilike.%${tel}%` : null,
            ].filter(Boolean).join(','))
            .order('data_visita', { ascending: false })
            .limit(1)
        : Promise.resolve({ data: [] });

      const nextPromise = (cpf && cpf.length === 11) || email
        ? supabase.from('next_inscricoes')
            .select('id, nome, email, cpf, evento_id, membro_id, created_at')
            .or([
              cpf && cpf.length === 11 ? `cpf.eq.${cpf}` : null,
              email ? `email.ilike.${emailEsc}` : null,
            ].filter(Boolean).join(','))
            .order('created_at', { ascending: false })
            .limit(1)
        : Promise.resolve({ data: [] });

      const [{ data: visitantes }, { data: inscricoes }] = await Promise.all([visitantePromise, nextPromise]);
      if ((visitantes || []).length === 0 && (inscricoes || []).length === 0) {
        return res.json({ found: false });
      }
      return res.json({
        found: true,
        membro: null,
        sugestao_visitante: (visitantes || [])[0] || null,
        sugestao_inscricao_next: (inscricoes || [])[0] || null,
      });
    }

    const m = membros[0];

    const [vol, visitante, inscNext, grupo, contribuicao] = await Promise.all([
      supabase.from('vol_profiles').select('id, planning_center_id, full_name').eq('membresia_id', m.id).maybeSingle(),
      supabase.from('int_visitantes').select('id, status, data_visita').eq('membresia_id', m.id).order('data_visita', { ascending: false }).limit(1),
      supabase.from('next_inscricoes').select('id, evento_id, created_at').eq('membro_id', m.id).order('created_at', { ascending: false }).limit(3),
      supabase.from('mem_grupo_membros').select('grupo_id, mem_grupos(nome)').eq('membro_id', m.id).is('saiu_em', null).maybeSingle(),
      supabase.from('mem_contribuicoes').select('id').eq('membro_id', m.id).gte('data', new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)).limit(1),
    ]);

    res.json({
      found: true,
      membro: m,
      papeis: {
        voluntario: vol?.data || null,
        visitante: (visitante?.data || [])[0] || null,
        inscricoes_next: inscNext?.data || [],
        grupo_ativo: grupo?.data || null,
        contribuinte_recente: (contribuicao?.data || []).length > 0,
      },
      multi_match: membros.length > 1 ? membros.slice(1).map(x => ({ id: x.id, nome: x.nome, cpf: x.cpf })) : null,
    });
  } catch (e) {
    console.error('pessoas lookup:', e.message);
    res.status(500).json({ error: 'Erro no lookup' });
  }
});






router.post('/find-or-create', authorizeModule('membros', 3), async (req, res) => {
  try {
    const b = req.body || {};

    const r = await findOrCreateMembro({
      cpf: b.cpf,
      email: b.email,
      telefone: b.telefone,
      nome: b.nome,
      dataNascimento: b.dataNascimento,
      genero: b.genero,
      status: b.status,
      origem: b.origem,
      origemId: b.origemId,
    });
    res.json(r);
  } catch (e) {
    console.error('pessoas find-or-create:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
module.exports.findOrCreateMembro = findOrCreateMembro;
