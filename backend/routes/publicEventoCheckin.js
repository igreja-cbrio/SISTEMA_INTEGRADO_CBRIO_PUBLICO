










const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { supabase } = require('../utils/supabase');
const { verificarTokenCheckin } = require('../utils/eventoCheckinToken');
const {
  validarEntrada, escolherInscricao, resumoPublico,
  validarEntradaNome, escolherPorNomeTelefone, telefoneChave,
} = require('../utils/checkinAutoatendimento');
const { marcarCheckinAuditavel } = require('../services/inscricaoCheckin');




const limiterGeral = rateLimit({
  windowMs: 15 * 60 * 1000, max: 5000,
  message: { error: 'Muitas requisições. Aguarde alguns instantes.' },
  skip: () => process.env.NODE_ENV !== 'production',
  standardHeaders: true, legacyHeaders: false,
});
const limiterBusca = rateLimit({
  windowMs: 10 * 60 * 1000, max: 300,
  message: { error: 'Muitas tentativas. Procure alguém da equipe na entrada.' },
  skip: () => process.env.NODE_ENV !== 'production',
  standardHeaders: true, legacyHeaders: false,
});
router.use(limiterGeral);






async function eventoDoToken(token) {
  const id = verificarTokenCheckin(token);
  if (!id) return { erro: 'token' };
  const { data: ev, error } = await supabase.from('insc_eventos')
    .select('id, nome, data, hora, local, status, checkin_ativo, tem_sorteio')
    .eq('id', id).is('deleted_at', null).maybeSingle();
  if (error) return { erro: 'infra' };
  if (!ev) return { erro: 'token' };
  if (ev.status !== 'publicado') return { erro: 'fechado', evento: ev };
  if (!ev.checkin_ativo) return { erro: 'fechado', evento: ev };
  return { evento: ev };
}















async function resolverInscricao(eventoId, body, campos) {
  const b = body || {};
  const querNome = b.nome != null || b.telefone != null;

  if (querNome) {
    const v = validarEntradaNome(b);
    if (!v.ok) return { erro: 'entrada', via: 'nome', motivo: v.motivo };



    const chave = telefoneChave(v.telefone);
    if (!chave) return { erro: 'entrada', via: 'nome', motivo: 'telefone_invalido' };
    const { data, error } = await supabase.from('inscricoes')
      .select(`${campos}, telefone`)
      .eq('evento_id', eventoId).like('telefone', `%${chave}`).is('deleted_at', null)
      .limit(50);
    if (error) throw error;
    const vivas = (data || []).filter(i => i.status !== 'cancelada');
    return { via: 'nome', escolha: escolherPorNomeTelefone(vivas, v) };
  }

  const v = validarEntrada(b);
  if (!v.ok) return { erro: 'entrada', via: 'cpf', motivo: v.motivo };
  const { data, error } = await supabase.from('inscricoes')
    .select(campos)
    .eq('evento_id', eventoId).eq('cpf', v.cpf).is('deleted_at', null)
    .limit(20);
  if (error) throw error;
  const vivas = (data || []).filter(i => i.status !== 'cancelada');
  return { via: 'cpf', escolha: escolherInscricao(vivas, v.nascimento) };
}


function erroEntrada(via) {
  return via === 'nome'
    ? 'Confira o nome completo e o celular.'
    : 'Confira o CPF e a data de nascimento.';
}






function erroNaoEncontrada(via) {
  return via === 'nome'
    ? 'Não encontramos sua inscrição com esses dados. Confira o nome completo e o celular, ou procure alguém da equipe.'
    : 'Não encontramos sua inscrição com esses dados. Confira o CPF e a data, ou procure alguém da equipe.';
}




router.get('/:token', async (req, res) => {
  try {
    const r = await eventoDoToken(req.params.token);
    if (r.erro === 'infra') return res.status(503).json({ error: 'Não foi possível abrir o check-in agora.' });
    if (r.erro === 'token') return res.status(404).json({ error: 'Este QR não é válido.' });
    if (r.erro === 'fechado') {
      return res.status(409).json({ error: 'O check-in deste evento não está aberto.', motivo: 'fechado' });
    }
    const { evento: e } = r;
    res.json({ evento: { nome: e.nome, data: e.data, hora: e.hora, local: e.local } });
  } catch (e) {
    console.error('[public/evento-checkin] get:', e.message);
    res.status(500).json({ error: 'Erro ao abrir o check-in.' });
  }
});


router.post('/:token/buscar', limiterBusca, async (req, res) => {
  try {
    const r = await eventoDoToken(req.params.token);
    if (r.erro === 'infra') return res.status(503).json({ error: 'Não foi possível consultar agora.' });
    if (r.erro) return res.status(r.erro === 'token' ? 404 : 409).json({ error: 'Check-in indisponível.' });

    const achado = await resolverInscricao(r.evento.id, req.body, 'id, nome_completo, data_nascimento, status');
    if (achado.erro === 'entrada') {
      return res.status(400).json({ error: erroEntrada(achado.via), motivo: achado.motivo });
    }
    const escolha = achado.escolha;
    if (escolha.situacao === 'ambiguo') {
      return res.status(409).json({
        error: 'Encontramos mais de uma inscrição com esses dados. Procure alguém da equipe na entrada.',
        motivo: 'ambiguo',
      });
    }
    if (escolha.situacao !== 'ok') {
      return res.status(404).json({ error: erroNaoEncontrada(achado.via), motivo: 'nao_encontrada' });
    }


    const { data: ja } = await supabase.from('insc_checkins')
      .select('em').eq('inscricao_id', escolha.inscricao.id).maybeSingle();

    res.json({ inscricao: resumoPublico({ ...escolha.inscricao, checkin_em: ja?.em || null }) });
  } catch (e) {
    console.error('[public/evento-checkin] buscar:', e.message);
    res.status(500).json({ error: 'Erro ao procurar sua inscrição.' });
  }
});


router.post('/:token/confirmar', limiterBusca, async (req, res) => {
  try {
    const r = await eventoDoToken(req.params.token);
    if (r.erro === 'infra') return res.status(503).json({ error: 'Não foi possível confirmar agora.' });
    if (r.erro) return res.status(r.erro === 'token' ? 404 : 409).json({ error: 'Check-in indisponível.' });





    const achado = await resolverInscricao(
      r.evento.id, req.body, 'id, nome_completo, data_nascimento, status, numero_sorte');
    if (achado.erro === 'entrada') {
      return res.status(400).json({ error: erroEntrada(achado.via) });
    }
    if (achado.escolha.situacao !== 'ok') {
      return res.status(404).json({ error: 'Não encontramos sua inscrição com esses dados.' });
    }
    const ins = achado.escolha.inscricao;



    if (ins.status === 'recebida') {
      return res.status(409).json({
        error: 'Sua inscrição está com o pagamento pendente. Procure alguém da equipe na entrada.',
        motivo: 'pagamento_pendente',
      });
    }

    const marcado = await marcarCheckinAuditavel({
      inscricaoId: ins.id, por: null, modo: 'autoatendimento',
    });



    res.json({
      ok: true,
      ja_checkin: !!marcado.ja_checkin,
      primeiro_nome: String(ins.nome_completo || '').trim().split(/\s+/)[0] || '',
      numero_sorte: r.evento.tem_sorteio ? (ins.numero_sorte ?? null) : null,
    });
  } catch (e) {
    console.error('[public/evento-checkin] confirmar:', e.message);
    res.status(500).json({ error: 'Erro ao confirmar o check-in.' });
  }
});

module.exports = router;
