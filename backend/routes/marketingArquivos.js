


















const router = require('express').Router();
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { falhaInterna } = require('../utils/responderFalha');
const E = require('../utils/marketingEntregaArquivo');
const SE = require('../services/marketingEntregaArquivo');
const L = require('../utils/marketingLinha');
const { contextoSubtarefa } = require('../services/marketingContexto');

router.use(authenticate);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;



function passaNoModulo(req, routeKey) {
  let passou = false;
  const resMudo = { status() { return this; }, json() { return this; } };
  authorizeModule(routeKey, 1)(req, resMudo, () => { passou = true; });
  return passou;
}
const acessoDe = (req) => ({ marketing: passaNoModulo(req, 'marketing'), eventos: passaNoModulo(req, 'eventos') });

async function lerEmLotes(tabela, cols, valores) {
  const unicos = [...new Set((valores || []).filter(Boolean))];
  const out = [];
  for (let i = 0; i < unicos.length; i += 200) {
    const { data, error } = await supabase.from(tabela).select(cols).in('id', unicos.slice(i, i + 200));
    if (error) throw new Error(`${tabela}: ${error.message}`);
    out.push(...(data || []));
  }
  return new Map(out.map(r => [r.id, r]));
}




async function anotar(arquivos, hoje) {
  const legados = arquivos.filter(a => !String(a.pasta || '').startsWith(`${E.RAIZ}/`));
  const [cards, itens, comps, membros, perfis, eventos, fases] = await Promise.all([
    lerEmLotes('marketing_kanban_cards', 'id, titulo', arquivos.map(a => a.card_id)),
    lerEmLotes('marketing_card_checklist', 'id, texto', arquivos.map(a => a.checklist_item_id)),
    lerEmLotes('marketing_compromissos_recorrentes', 'id, descricao', arquivos.map(a => a.compromisso_id)),
    lerEmLotes('marketing_membros', 'id, nome_display', arquivos.map(a => a.membro_id)),
    lerEmLotes('profiles', 'id, name', arquivos.map(a => a.enviado_por)),
    lerEmLotes('events', 'id, name, date', legados.map(a => a.event_id)),
    lerEmLotes('event_cycle_phases', 'id, numero_fase, nome_fase', legados.map(a => a.event_phase_id)),
  ]);
  return arquivos.map((a) => {
    let legado = null;
    if (!String(a.pasta || '').startsWith(`${E.RAIZ}/`)) {
      if (a.origem === 'rotina' && a.semana_inicio) {
        legado = E.pastaDaEntrega({ tipo: 'rotina', semanaInicio: a.semana_inicio, compromisso: comps.get(a.compromisso_id)?.descricao }, hoje);
      } else {
        const ev = eventos.get(a.event_id);
        const f = fases.get(a.event_phase_id);
        legado = E.pastaDaEntrega({
          tipo: 'ciclo',
          evento: { nome: ev?.name, data: ev?.date || L.dataSP(a.enviado_em) },
          fase: f ? { numero: f.numero_fase, nome: f.nome_fase } : null,
        }, hoje);
      }
    }
    const caminho = E.caminhoNaArvore(a, legado) || [];
    return {
      a,
      ano: caminho[0] || '',
      caminho: caminho.slice(1),
      legado: !!legado,
      contexto: {
        tarefa: cards.get(a.card_id)?.titulo || null,
        subtarefa: itens.get(a.checklist_item_id)?.texto || null,
        compromisso: comps.get(a.compromisso_id)?.descricao || null,
        pessoa: membros.get(a.membro_id)?.nome_display || null,
      },
      enviado_por: perfis.get(a.enviado_por)?.name || null,
    };
  });
}

router.get('/', async (req, res) => {
  try {
    const acesso = acessoDe(req);
    if (!acesso.marketing && !acesso.eventos) {
      return res.status(403).json({ error: 'A página Arquivos é do Marketing e de quem acompanha o ciclo criativo pelo Eventos.' });
    }
    const hoje = L.dataSP(new Date().toISOString());
    const avisos = [];
    const lidos = await SE.arquivosDaPagina({ soCiclo: !acesso.marketing });
    if (lidos === null) return res.status(409).json({ error: `Falta aplicar a migration ${SE.MIGRATION}.` });

    const visiveis = lidos.filter(a => E.podeVerArquivo(a, acesso));
    const anotados = await anotar(visiveis, hoje);




    let abrir = null;
    const eventoId = String(req.query.evento || '');
    if (UUID.test(eventoId)) {
      const doEvento = anotados.filter(x => x.a.event_id === eventoId && x.caminho[0] === E.CATEGORIAS.ciclo)
        .sort((p, q) => String(q.a.enviado_em).localeCompare(String(p.a.enviado_em)));
      if (doEvento.length) {
        abrir = { ano: doEvento[0].ano, caminho: doEvento[0].caminho.slice(0, 2) };
      } else {
        const { data: ev, error: eEv } = await supabase.from('events').select('name, date').eq('id', eventoId).maybeSingle();
        if (eEv) throw eEv;
        if (ev) {
          const p = E.pastaDaEntrega({ tipo: 'ciclo', evento: { nome: ev.name, data: ev.date }, fase: null }, hoje);
          abrir = { ano: p.ano, caminho: p.partes.slice(0, 2) };
        }
      }
    }

    const porAno = {};
    for (const x of anotados) porAno[x.ano] = (porAno[x.ano] || 0) + 1;
    const anoAtual = hoje.slice(0, 4);
    const pedido = /^\d{4}$/.test(String(req.query.ano || '')) ? String(req.query.ano) : null;
    const ano = pedido || (abrir && abrir.ano) || anoAtual;
    const anos = [...new Set([anoAtual, ano, ...Object.keys(porAno)])].filter(Boolean).sort().reverse()
      .map(a => ({ ano: a, total: porAno[a] || 0 }));

    const arquivos = anotados.filter(x => x.ano === ano).map(x => ({
      id: x.a.id,
      nome: x.a.nome_arquivo,
      caminho: x.caminho,
      categoria: E.categoriaDoArquivo(x.a),
      tamanho: x.a.tamanho_bytes ?? null,
      tipo_mime: x.a.tipo_mime || null,
      enviado_em: x.a.enviado_em,
      enviado_por: x.enviado_por,


      web_url: acesso.marketing ? x.a.web_url : null,
      legado: x.legado,
      contexto: x.contexto,
    })).sort((p, q) => String(q.enviado_em).localeCompare(String(p.enviado_em)));



    let destino = null;
    if (acesso.marketing && SE.sharepointPronto()) {
      try {
        const d = await SE.destinoDosArquivos();
        destino = { local: d.local, raiz_url: d.webUrl ? `${d.webUrl}/${E.RAIZ}` : null };
      } catch (e) {
        avisos.push(`Não deu para conferir o SharePoint agora: ${e.message}`);
      }
    }

    const podeCriarEstrutura = acesso.marketing && SE.sharepointPronto() && ano === anoAtual
      && (await contextoSubtarefa(req)).lider === true;
    res.json({ ano, anos, acesso, arquivos, destino, avisos, abrir, pode_criar_estrutura: podeCriarEstrutura });
  } catch (e) {
    return falhaInterna(res, 'Não foi possível carregar os arquivos', e);
  }
});

router.get('/:id/baixar', async (req, res) => {
  try {
    const acesso = acessoDe(req);
    if (!acesso.marketing && !acesso.eventos) return res.status(403).json({ error: 'Sem acesso aos arquivos.' });
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Arquivo inválido' });
    const { data: a, error } = await supabase.from(SE.TABELA).select('*')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (error) {
      if (SE.ehTabelaAusente(error)) return res.status(409).json({ error: `Falta aplicar a migration ${SE.MIGRATION}.` });
      throw error;
    }

    if (!a || !E.podeVerArquivo(a, acesso)) return res.status(404).json({ error: 'Arquivo não encontrado.' });
    if (!SE.sharepointPronto()) return res.status(503).json({ error: 'O SharePoint não está configurado neste servidor.' });
    const url = await SE.linkDeDownload({ driveId: a.drive_id, itemId: a.sharepoint_item_id });
    if (!url) {
      return res.status(410).json({ error: 'Este arquivo não está mais no SharePoint (foi apagado, movido ou já arquivado).' });
    }
    res.json({ url, nome: a.nome_arquivo });
  } catch (e) {
    return falhaInterna(res, 'Não foi possível baixar o arquivo', e);
  }
});




async function dadosDaEstrutura(ano, hoje) {
  const { data: eventos, error } = await supabase.from('events').select('id, name, date, status')
    .gte('date', hoje).lte('date', `${ano}-12-31`);
  if (error) throw error;
  const vivos = (eventos || []).filter(e => !/cancel/i.test(String(e.status || '')));
  const ids = vivos.map(e => e.id);
  const fasesDoEvento = {};
  for (let i = 0; i < ids.length; i += 200) {
    const { data: cards, error: eC } = await supabase.from('marketing_kanban_cards')
      .select('event_id, event_phase_id').in('event_id', ids.slice(i, i + 200))
      .not('event_phase_id', 'is', null).is('deleted_at', null);
    if (eC) throw eC;
    for (const c of cards || []) (fasesDoEvento[c.event_id] ||= new Set()).add(c.event_phase_id);
  }
  const faseIds = [...new Set(Object.values(fasesDoEvento).flatMap(s => [...s]))];
  const fases = await lerEmLotes('event_cycle_phases', 'id, numero_fase, nome_fase', faseIds);
  const { data: comps, error: eComp } = await supabase.from('marketing_compromissos_recorrentes')
    .select('id, descricao').eq('ativo', true).is('deleted_at', null);
  if (eComp) throw eComp;
  return {
    eventos: vivos.map(e => ({
      nome: e.name,
      data: L.dataSP(e.date),
      fases: [...(fasesDoEvento[e.id] || [])].map(id => fases.get(id)).filter(Boolean)
        .map(f => ({ numero: f.numero_fase, nome: f.nome_fase })),
    })),
    compromissos: (comps || []).map(c => ({ descricao: c.descricao })),
  };
}

const LOTE_ESTRUTURA = 40;

router.post('/estrutura', async (req, res) => {
  try {
    if (!(await contextoSubtarefa(req)).lider) {
      return res.status(403).json({ error: 'Só o líder do Marketing cria as pastas do ano.' });
    }
    if (!SE.sharepointPronto()) return res.status(503).json({ error: 'O SharePoint não está configurado neste servidor.' });
    const hoje = L.dataSP(new Date().toISOString());
    const ano = String((req.body && req.body.ano) || hoje.slice(0, 4));
    if (ano !== hoje.slice(0, 4)) return res.status(400).json({ error: 'Por enquanto, só as pastas do ano corrente.' });
    const pastas = E.estruturaDoAno({ ano, hoje, ...(await dadosDaEstrutura(ano, hoje)) });
    const desde = Math.max(0, Math.floor(Number(req.body && req.body.desde) || 0));
    const destino = await SE.destinoDosArquivos();
    let criadas = 0;
    let existiam = 0;
    const lote = pastas.slice(desde, desde + LOTE_ESTRUTURA);

    for (const pasta of lote) {
      if ((await SE.criarPasta({ driveId: destino.driveId, pasta })) === 'criada') criadas += 1;
      else existiam += 1;
    }
    const feitas = desde + lote.length;
    res.json({
      ano, total: pastas.length, feitas, criadas, existiam,
      proximo: feitas < pastas.length ? feitas : null,
      destino: { local: destino.local, raiz_url: destino.webUrl ? `${destino.webUrl}/${E.RAIZ}` : null },
    });
  } catch (e) {
    return falhaInterna(res, 'Não foi possível criar as pastas do ano', e, { exporDetalhe: true });
  }
});

module.exports = router;
