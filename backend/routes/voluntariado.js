const router = require('express').Router();
const { authenticate, authorizeModule, getEffectiveLevel, bustPermissionCaches } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const atividadeVol = require('../utils/atividadeVoluntario');
const linhaEq = require('../utils/escalaLinhaEquipe');
const { acharOuCriarGuardado, acharMembroGuardado, normalizarTelefone, normalizarEmail } = require('../services/membroMatch');
const { falhaInterna } = require('../utils/responderFalha');
const { reconciliarCpfTardio } = require('../services/cpfReconciliar');
const { cpfValido } = require('../utils/cpf');
const { getPCCredentials, fetchWithRetry, PC_SERVICES_BASE, assignVolunteersToTeams, syncTeamMembersFromSchedules, fetchAllServiceTypes } = require('../services/planningCenter');
const { enqueueSync } = require('../services/cerebroSync');
const { resolverVoluntarioPorQr } = require('../services/volCheckinResolver');
const { notificar } = require('../services/notificar');
const { mountWhatsappAuto } = require('./whatsappAutoRoutes');
const { requireCron } = require('../utils/cronAuth');



const {
  normalizarIds: normalizarIdsExclusao,
  separarExclusaoLote: separarExclusaoLoteInsc,
  resumoDoLote: resumoDoLoteInsc,
} = require('../utils/exclusaoInscricaoLote');
const { diaBRT, avaliarIndisponibilidade, textoIndisponibilidade, indexarPorPessoa, ehPessoaEscalavel } = require('../utils/volDisponibilidade');
const { semanasSemServir, rotuloTempoSemServir, distribuirVagas } = require('../utils/volRodizio');
const { normalizarFlagsTipoCulto } = require('../utils/tipoCultoFlags');
const { montarCobertura, contarStatus } = require('../utils/volCobertura');
const { cultosDoBloco } = require('../utils/blocoCulto');
const { podeServirNoTipo, pessoaServeNoTipo } = require('../utils/elegibilidadeVol');
const { podeGerarCulto } = require('../utils/volSyncIntegrity');
const { filtrarVigentes } = require('../utils/vigenciaTipoCulto');
const { proximoCursor } = require('../utils/cursorLote');
const { chavePco } = require('../utils/pcoChave');
const { diaIntegracaoBRT } = require('../utils/volIntegradoEm');



const { faltandoNoCadastro, validarParcialCadastro } = require('../utils/volCadastroCheckin');
const { atualizarStatusInscricao } = require('../services/volInscricaoStatus');
const { responderEscala } = require('../services/escalaResposta');
const antecedentes = require('../services/antecedentesCriminais');
const { executarSyncCompleto } = require('../services/voluntariadoSync');
const { anexarMarcadores, podeVerMarcadorSensivel } = require('../services/jornadaMarcadores');
const multer = require('multer');
const { mapaDeFotos, fotoDoPerfil } = require('../utils/fotoVoluntario');
const uploadCsv = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });




router.get('/cron/antecedentes', requireCron, async (req, res) => {
  try {
    const r = await antecedentes.processarPendentes({ limite: 25 });
    res.json({ ok: true, ...r });
  } catch (e) {
    console.error('[vol/cron/antecedentes]', e.message);
    res.status(500).json({ error: 'Erro no cron de antecedentes' });
  }
});




router.get('/cron/sync', requireCron, async (req, res) => {
  try {
    const r = await executarSyncCompleto();
    await supabase.from('vol_sync_logs').insert({
      sync_type: 'automatic', services_synced: r.services, schedules_synced: r.schedules,
      qrcodes_generated: r.qrCodesGenerated, status: 'success',
    });










    let ml = null;
    try {
      const mlTracker = require('../services/solicitacoesMlTracker');
      ml = await mlTracker.processarUpdates({ batchSize: 30, throttleMs: 200 });
    } catch (e) {
      console.error('[vol/cron/sync] carona ml-tracker:', e.message);
      ml = { ok: false, erro: e.message };
    }

    res.json({ ok: true, ...r, ml });
  } catch (e) {
    console.error('[vol/cron/sync]', e.message);
    res.status(500).json({ error: 'Erro no cron de sync do voluntariado' });
  }
});




router.get('/cron/emails', requireCron, async (req, res) => {
  try {
    const { drenarDisparos } = require('../services/volEmailSender');
    const r = await drenarDisparos({ budgetMs: 270000 });
    res.json({ ok: true, ...r });
  } catch (e) {
    console.error('[vol/cron/emails]', e.message);
    res.status(500).json({ error: 'Erro no cron de e-mails do voluntariado' });
  }
});

router.use(authenticate, authorizeModule('membresia', 1));
































router.use('/emails', require('./volEmails'));





const VOL_CONFIG_DEFAULT = { muito_ativo_min: 8, regular_min: 4, pouco_ativo_min: 1, sobrecarga_limite: 8, pco_ativo: true };

router.get('/config', async (req, res) => {
  try {
    const { data } = await supabase.from('vol_config').select('*').eq('id', 1).maybeSingle();
    res.json({ ...VOL_CONFIG_DEFAULT, ...(data || {}) });
  } catch (e) {
    console.error('[vol/config get]', e.message);
    res.json(VOL_CONFIG_DEFAULT);
  }
});





router.get('/kpis/taticos', async (req, res) => {
  try {
    const { data: kpisRaw, error: kpisErr } = await supabase
      .from('kpi_indicadores_taticos')
      .select('id, indicador, descricao, meta_descricao, meta_valor, unidade, periodicidade, lider_funcionario_id')
      .eq('ativo', true)
      .ilike('area', 'voluntariado')
      .order('indicador', { ascending: true });
    if (kpisErr) throw kpisErr;
    const kpis = kpisRaw || [];
    const kpiIds = kpis.map(k => k.id);

    let trajByKpi = {};
    if (kpiIds.length > 0) {
      const { data: traj, error: trajErr } = await supabase
        .from('vw_kpi_trajetoria_atual')
        .select('kpi_id, status_trajetoria, ultimo_periodo, ultimo_valor, checkpoint_meta, percentual_meta')
        .in('kpi_id', kpiIds);
      if (trajErr) console.error('[voluntariado kpis/taticos] trajetoria falhou:', trajErr.message);
      (traj || []).forEach(t => { trajByKpi[t.kpi_id] = t; });
    }

    const enriched = kpis.map(k => ({
      id: k.id,
      indicador: k.indicador,
      descricao: k.descricao,
      meta_descricao: k.meta_descricao,
      meta_valor: k.meta_valor,
      unidade: k.unidade,
      periodicidade: k.periodicidade,
      trajetoria: trajByKpi[k.id] || null,
    }));

    res.json({ area: 'voluntariado', total: enriched.length, kpis: enriched });
  } catch (e) {
    console.error('[voluntariado kpis/taticos]', e.message);
    res.status(500).json({ error: 'Erro ao buscar KPIs táticos de voluntariado' });
  }
});

router.put('/config', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const toInt = (v, def) => {
      const n = Math.round(Number(v));
      return Number.isFinite(n) && n >= 0 ? n : def;
    };
    const cfg = {
      muito_ativo_min: toInt(req.body?.muito_ativo_min, VOL_CONFIG_DEFAULT.muito_ativo_min),
      regular_min: toInt(req.body?.regular_min, VOL_CONFIG_DEFAULT.regular_min),
      pouco_ativo_min: toInt(req.body?.pouco_ativo_min, VOL_CONFIG_DEFAULT.pouco_ativo_min),
      sobrecarga_limite: toInt(req.body?.sobrecarga_limite, VOL_CONFIG_DEFAULT.sobrecarga_limite),
    };




    if (typeof req.body?.pco_ativo === 'boolean') cfg.pco_ativo = req.body.pco_ativo;

    if (!(cfg.muito_ativo_min >= cfg.regular_min && cfg.regular_min >= cfg.pouco_ativo_min && cfg.pouco_ativo_min >= 1)) {
      return res.status(400).json({ error: 'Os limites devem ser decrescentes: Muito Ativo ≥ Regular ≥ Pouco Ativo ≥ 1.' });
    }
    const { data, error } = await supabase
      .from('vol_config')
      .upsert({ id: 1, ...cfg, updated_at: new Date().toISOString(), updated_by: req.user?.id || null }, { onConflict: 'id' })
      .select('*')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[vol/config put]', e.message);
    res.status(500).json({ error: 'Erro ao salvar a régua do termômetro' });
  }
});





function normNome(s) {
  return (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}
function cultoCanonico(s) {
  const n = normNome(s);
  if (n.startsWith('sab')) return 'Sábado';
  if (n.startsWith('dom')) return 'Domingo';
  if (n.startsWith('qua')) return 'Quarta';
  return (s || '—').toString().trim() || '—';
}

function parseCsvGrade(texto) {
  const splitLinha = (l) => {
    const out = []; let cur = ''; let q = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (c === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (c === ',' && !q) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur); return out;
  };
  return texto.replace(/\r/g, '').split('\n').map(splitLinha);
}

function parseDataCel(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return isNaN(v) ? null : v.toISOString().slice(0, 10);
  if (typeof v === 'number') return v > 40000 ? serialParaISO(v) : null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}
const MESES_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];



function extrairRegistrosDeGrade(aoa, mesLabel) {
  if (!aoa || aoa.length < 2) return [];
  const head0 = (aoa[0] || []).map(c => normNome(c));
  const idxNome = head0.indexOf('nome');
  const idxData = head0.indexOf('data');
  const out = [];
  if (idxNome >= 0 && idxData >= 0) {
    const idxCulto = head0.indexOf('culto');
    const idxMes = head0.indexOf('mes');
    for (let r = 1; r < aoa.length; r++) {
      const row = aoa[r] || [];
      const nome = (row[idxNome] == null ? '' : String(row[idxNome])).trim();
      const data = parseDataCel(row[idxData]);
      if (!nome || !data) continue;
      out.push({ nome, data, culto: cultoCanonico(idxCulto >= 0 ? row[idxCulto] : ''), mes: (idxMes >= 0 ? String(row[idxMes] || '') : mesLabel) || null });
    }
    return out;
  }
  const diaRow = aoa[0] || [];
  const dataRow = aoa[1] || [];
  const dateCols = [];
  for (let c = 0; c < dataRow.length; c++) {
    const iso = parseDataCel(dataRow[c]);
    if (iso) dateCols.push({ c, iso, culto: cultoCanonico(diaRow[c]) });
  }
  if (!dateCols.length) return [];
  for (let r = 2; r < aoa.length; r++) {
    const row = aoa[r] || [];
    for (const dc of dateCols) {
      const nome = (row[dc.c] == null ? '' : String(row[dc.c])).trim();
      if (!nome) continue;
      const mes = mesLabel || MESES_PT[Number(dc.iso.slice(5, 7)) - 1] || null;
      out.push({ nome, data: dc.iso, culto: dc.culto, mes });
    }
  }
  return out;
}


function serialParaISO(n) {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(Number(n)) * 86400000);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}



function extrairControleXlsx(buffer) {
  const XLSX = require('xlsx');
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const registros = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    registros.push(...extrairRegistrosDeGrade(aoa, sheetName));
  }
  return registros;
}




function extrairInscritosXlsx(buffer) {
  const XLSX = require('xlsx');
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const nomes = new Set();
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]; if (!ws) continue;
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    const head0 = (aoa[0] || []).map((c) => normNome(c));
    if (head0.indexOf('nome') >= 0 && head0.indexOf('data') >= 0) continue;
    for (let r = 2; r < aoa.length; r++) {
      const nome = (aoa[r] && aoa[r][0] != null ? String(aoa[r][0]) : '').trim();
      if (nome) nomes.add(nome);
    }
  }
  return [...nomes];
}



async function linkInscritos() {
  const { data: profs } = await supabase.from('vol_profiles').select('id, full_name, membresia_id');
  const map = new Map(); const dup = new Set();
  for (const p of profs || []) { const k = normNome(p.full_name); if (!k) continue; if (map.has(k)) dup.add(k); else map.set(k, p); }
  for (const k of dup) map.delete(k);
  const { data: ins } = await supabase.from('vol_inscritos').select('id, nome_norm').is('vol_profile_id', null).is('deleted_at', null);
  let n = 0;
  for (const it of ins || []) {
    const p = map.get(it.nome_norm);
    if (!p) continue;
    const { error } = await supabase.from('vol_inscritos').update({ vol_profile_id: p.id, membro_id: p.membresia_id || null, updated_at: new Date().toISOString() }).eq('id', it.id);
    if (!error) n += 1;
  }
  return n;
}



async function rematchFrequencia() {
  const { data: profs } = await supabase.from('vol_profiles').select('id, full_name');
  const map = new Map(); const dup = new Set();
  for (const p of profs || []) {
    const k = normNome(p.full_name);
    if (!k) continue;
    if (map.has(k)) dup.add(k); else map.set(k, p.id);
  }
  for (const k of dup) map.delete(k);

  const { data: pend } = await supabase.from('vw_vol_frequencia')
    .select('nome_norm').is('vol_profile_id', null);
  const nomes = [...new Set((pend || []).map(r => r.nome_norm))];
  let n = 0;
  for (const nm of nomes) {
    const pid = map.get(nm);
    if (!pid) continue;
    const { error } = await supabase.from('vol_servicos_historico')
      .update({ vol_profile_id: pid }).eq('nome_norm', nm).is('vol_profile_id', null);
    if (!error) n += 1;
  }
  return n;
}




router.post('/frequencia/importar', authorizeModule('membresia', 2), uploadCsv.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Envie o arquivo em "arquivo".' });
    const origem = (req.body?.origem || 'planilha_2026').toString().slice(0, 40);
    const fname = (req.file.originalname || '').toLowerCase();
    const ehXlsx = fname.endsWith('.xlsx') || fname.endsWith('.xls') || /spreadsheet|excel|officedocument/.test(req.file.mimetype || '');

    let brutos;
    try {
      brutos = ehXlsx
        ? extrairControleXlsx(req.file.buffer)
        : extrairRegistrosDeGrade(parseCsvGrade(req.file.buffer.toString('utf-8')), null);
    } catch (e) {
      console.error('[vol] parse import', e.message);
      return res.status(400).json({ error: 'Não consegui ler o arquivo. Envie a planilha de controle (.xlsx) ou o CSV exportado dela.' });
    }

    const vistos = new Set();
    const registros = [];
    for (const b of brutos) {
      const nome = (b.nome || '').trim();
      if (!nome || !/^\d{4}-\d{2}-\d{2}$/.test(b.data || '')) continue;
      const culto = cultoCanonico(b.culto);
      const nome_norm = normNome(nome);
      if (!nome_norm) continue;
      const k = `${nome_norm}|${b.data}|${culto}`;
      if (vistos.has(k)) continue;
      vistos.add(k);
      registros.push({ nome_planilha: nome, nome_norm, data: b.data, culto_label: culto, mes: b.mes || null, origem });
    }
    if (!registros.length) {
      return res.status(400).json({ error: 'Não encontrei serviços na planilha. Envie a planilha de controle (.xlsx ou .csv com colunas por data) ou um CSV com colunas nome,data,culto.' });
    }


    let ignoradosNaoPessoa = 0;
    try {
      const { nomesNaoPessoa } = require('../services/volNomeFiltro');
      const skip = await nomesNaoPessoa(registros.map(r => r.nome_planilha));
      if (skip.size) {
        const antes = registros.length;
        for (let i = registros.length - 1; i >= 0; i--) {
          if (skip.has(registros[i].nome_norm)) registros.splice(i, 1);
        }
        ignoradosNaoPessoa = antes - registros.length;
      }
    } catch (e) {
      console.warn('[vol] filtro nao-pessoa:', e.message);
    }
    if (!registros.length) {
      return res.status(400).json({ error: 'Todas as linhas foram identificadas como posição/equipe (não pessoas). Confira se os nomes das pessoas estão na planilha.' });
    }

    for (let i = 0; i < registros.length; i += 500) {
      const lote = registros.slice(i, i + 500);
      const { error } = await supabase.from('vol_servicos_historico')
        .upsert(lote, { onConflict: 'nome_norm,data,culto_label,origem', ignoreDuplicates: true });
      if (error) return res.status(400).json({ error: 'Falha ao gravar: ' + error.message });
    }
    const vinculadas = await rematchFrequencia();



    let inscritos = 0;
    if (ehXlsx) {
      try {
        const nomesIns = extrairInscritosXlsx(req.file.buffer);
        let skip = new Set();
        try { const { nomesNaoPessoa } = require('../services/volNomeFiltro'); skip = await nomesNaoPessoa(nomesIns); } catch (e) {             }
        const linhas = []; const vistosI = new Set();
        for (const nome of nomesIns) {
          const nn = normNome(nome);
          if (!nn || skip.has(nn) || vistosI.has(nn)) continue;
          vistosI.add(nn);
          linhas.push({ nome_planilha: nome, nome_norm: nn, origem });
        }
        for (let i = 0; i < linhas.length; i += 500) {
          await supabase.from('vol_inscritos').upsert(linhas.slice(i, i + 500), { onConflict: 'nome_norm,origem', ignoreDuplicates: true });
        }
        inscritos = linhas.length;
        await linkInscritos();
      } catch (e) { console.warn('[vol] inscritos:', e.message); }
    }
    res.json({ processadas: registros.length, nomes_vinculados: vinculadas, ignorados_nao_pessoa: ignoradosNaoPessoa, inscritos });
  } catch (e) {
    console.error('[vol] importar frequencia', e.message);
    res.status(500).json({ error: 'Erro ao importar o controle' });
  }
});


router.get('/frequencia', async (req, res) => {
  try {
    const build = () => {
      let q = supabase.from('vw_vol_frequencia').select('*');


      if (req.query.status === 'ativos') q = q.eq('situacao', 'ativo');
      else if (req.query.status === 'inativos') q = q.eq('situacao', 'inativo');
      else if (req.query.status === 'novos') q = q.eq('situacao', 'novo');

      if (req.query.vinculo === 'nao') q = q.is('membro_id', null);
      else if (req.query.vinculo === 'sim') q = q.not('membro_id', 'is', null);
      if (req.query.busca) q = q.ilike('nome', `%${req.query.busca}%`);
      return q.order('ativo', { ascending: false }).order('ultimo_servico', { ascending: false, nullsFirst: false });
    };

    let data = []; let offset = 0;
    while (true) {
      const { data: page, error } = await build().range(offset, offset + 999);
      if (error) return res.status(400).json({ error: error.message });
      if (!page || !page.length) break;
      data = data.concat(page);
      if (page.length < 1000) break;
      offset += 1000;
    }



    const contarSituacao = (situ) => supabase.from('vw_vol_frequencia')
      .select('chave', { count: 'exact', head: true }).eq('situacao', situ);
    const { count: total } = await supabase.from('vw_vol_frequencia').select('chave', { count: 'exact', head: true });
    const { count: ativos } = await contarSituacao('ativo');
    const { count: inativos } = await contarSituacao('inativo');
    const { count: novos } = await contarSituacao('novo');


    const chaves = [...new Set(data.map(r => r.chave).filter(Boolean))];
    const motivoByChave = {};
    for (let i = 0; i < chaves.length; i += 500) {
      const lote = chaves.slice(i, i + 500);
      const { data: ms } = await supabase.from('vol_inatividade')
        .select('chave, motivo, detalhe, registrado_em').in('chave', lote);
      (ms || []).forEach(m => { motivoByChave[m.chave] = m; });
    }
    const itens = data.map(r => ({
      ...r,
      inatividade_motivo: motivoByChave[r.chave]?.motivo || null,
      inatividade_detalhe: motivoByChave[r.chave]?.detalhe || null,
      inatividade_em: motivoByChave[r.chave]?.registrado_em || null,
    }));
    res.json({ resumo: { total: total || 0, ativos: ativos || 0, inativos: inativos || 0, novos: novos || 0 }, itens });
  } catch (e) {
    console.error('[vol] frequencia', e.message);
    res.status(500).json({ error: 'Erro ao carregar frequência' });
  }
});


router.get('/frequencia/detalhe', async (req, res) => {
  try {
    let q = supabase.from('vol_servicos_historico')
      .select('data, culto_label, mes, origem, nome_planilha').is('deleted_at', null);
    if (req.query.profile_id) q = q.eq('vol_profile_id', req.query.profile_id);
    else if (req.query.nome_norm) q = q.eq('nome_norm', req.query.nome_norm);
    else return res.status(400).json({ error: 'Informe profile_id ou nome_norm' });
    const { data, error } = await q.order('data', { ascending: false }).limit(500);
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao carregar detalhe' });
  }
});




router.put('/frequencia/inatividade', authorizeModule('membresia', 2), async (req, res) => {
  try {
    const chave = String(req.body?.chave || '').trim();
    if (!chave) return res.status(400).json({ error: 'chave obrigatória' });
    const motivo = String(req.body?.motivo || '').trim().slice(0, 60);
    const detalhe = req.body?.detalhe != null ? String(req.body.detalhe).trim().slice(0, 1000) : null;
    if (!motivo) {
      await supabase.from('vol_inatividade').delete().eq('chave', chave);
      return res.json({ ok: true, cleared: true });
    }
    const { data, error } = await supabase.from('vol_inatividade')
      .upsert({ chave, motivo, detalhe: detalhe || null, registrado_por: req.user?.id ?? null, updated_at: new Date().toISOString() },
        { onConflict: 'chave' })
      .select('chave, motivo, detalhe, registrado_em').single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, motivo: data });
  } catch (e) {
    console.error('[vol] inatividade', e.message);
    res.status(500).json({ error: 'Erro ao salvar o motivo' });
  }
});





router.post('/frequencia/saiu-igreja', authorizeModule('membresia', 2), async (req, res) => {
  try {
    const chave = String(req.body?.chave || '').trim();
    if (!chave) return res.status(400).json({ error: 'chave obrigatória' });
    const membroId = req.body?.membro_id ? String(req.body.membro_id).trim() : null;
    const detalhe = req.body?.detalhe != null ? String(req.body.detalhe).trim().slice(0, 1000) : null;


    const { error: viErr } = await supabase.from('vol_inatividade')
      .upsert({ chave, motivo: 'saiu_igreja', detalhe: detalhe || null, registrado_por: req.user?.id ?? null, updated_at: new Date().toISOString() },
        { onConflict: 'chave' });
    if (viErr) return res.status(500).json({ error: viErr.message });


    let membroAtualizado = false;
    if (membroId && /^[0-9a-f-]{36}$/i.test(membroId)) {
      const { error: mmErr } = await supabase.from('mem_membros')
        .update({ status: 'inativo' }).eq('id', membroId).is('deleted_at', null);
      if (mmErr) console.error('[vol] saiu-igreja mem_membros:', mmErr.message);
      else membroAtualizado = true;
    }
    res.json({ ok: true, membro_atualizado: membroAtualizado });
  } catch (e) {
    console.error('[vol] saiu-igreja', e.message);
    res.status(500).json({ error: 'Erro ao registrar a saída' });
  }
});


router.get('/frequencia/perfis', async (req, res) => {
  try {
    let q = supabase.from('vol_profiles').select('id, full_name').order('full_name').limit(20);
    if (req.query.q) q = q.ilike('full_name', `%${req.query.q}%`);
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar perfis' });
  }
});


router.post('/frequencia/vincular', authorizeModule('membresia', 2), async (req, res) => {
  try {
    const { nome_norm, vol_profile_id } = req.body || {};
    if (!nome_norm || !vol_profile_id) return res.status(400).json({ error: 'nome_norm e vol_profile_id obrigatórios' });
    const { error } = await supabase.from('vol_servicos_historico')
      .update({ vol_profile_id }).eq('nome_norm', nome_norm).is('deleted_at', null);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao vincular' });
  }
});


router.post('/frequencia/revincular', authorizeModule('membresia', 2), async (req, res) => {
  try {
    const n = await rematchFrequencia();
    res.json({ nomes_vinculados: n });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao revincular' });
  }
});



router.post('/frequencia/sync-pco', authorizeModule('membresia', 2), async (req, res) => {
  try {
    const { bridgeFrequenciaPCO } = require('../services/voluntariadoFreqPCO');
    const desde = new Date(Date.now() - 120 * 864e5).toISOString();
    const r = await bridgeFrequenciaPCO(desde);
    res.json(r);
  } catch (e) {
    console.error('[vol] sync-pco frequencia', e.message);
    res.status(500).json({ error: 'Erro ao trazer escalas do Planning Center' });
  }
});



router.post('/frequencia/sugerir-vinculos', authorizeModule('membresia', 2), async (req, res) => {
  try {

    const pend = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase.from('vw_vol_frequencia')
        .select('nome_norm, nome, total_servicos')
        .is('vol_profile_id', null)
        .range(from, from + 999);
      if (error) return res.status(400).json({ error: error.message });
      if (!data || !data.length) break;
      pend.push(...data);
      if (data.length < 1000) break;
      from += 1000;
    }
    const nomes = pend.map(r => ({ nome_norm: r.nome_norm, nome: r.nome, total: r.total_servicos }));
    if (!nomes.length) return res.json({ sugestoes: [] });


    const perfis = [];
    from = 0;
    while (true) {
      const { data } = await supabase.from('vol_profiles')
        .select('id, full_name').range(from, from + 999);
      if (!data || !data.length) break;
      perfis.push(...data);
      if (data.length < 1000) break;
      from += 1000;
    }

    const { sugerirVinculos } = require('../services/volVinculoIA');
    const sugestoes = await sugerirVinculos(nomes, perfis);

    const totalPorNome = new Map(nomes.map(n => [n.nome_norm, n.total]));
    for (const s of sugestoes) s.total_servicos = totalPorNome.get(s.nome_norm) ?? 0;
    res.json({ sugestoes });
  } catch (e) {
    console.error('[vol] sugerir-vinculos', e.message);
    res.status(500).json({ error: 'Erro ao gerar sugestões' });
  }
});



router.post('/frequencia/vincular-lote', authorizeModule('membresia', 2), async (req, res) => {
  try {
    const vinculos = Array.isArray(req.body?.vinculos) ? req.body.vinculos : [];
    let vinculados = 0;
    for (const v of vinculos) {
      if (!v?.nome_norm || !v?.vol_profile_id) continue;
      const { error } = await supabase.from('vol_servicos_historico')
        .update({ vol_profile_id: v.vol_profile_id })
        .eq('nome_norm', v.nome_norm)
        .is('vol_profile_id', null)
        .is('deleted_at', null);
      if (!error) vinculados += 1;
    }
    res.json({ vinculados });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao vincular em lote' });
  }
});



mountWhatsappAuto(router, { chave: 'voluntariado_inscricao', modulo: 'voluntariado', authorizeModule });






router.get('/me', async (req, res) => {
  try {
    const userId = req.user.userId;

    let { data: volProfile } = await supabase.from('vol_profiles')
      .select('*').eq('auth_user_id', userId).maybeSingle();


    if (!volProfile) {
      const { data: authProfile } = await supabase.from('profiles')
        .select('email, name').eq('id', userId).maybeSingle();
      if (authProfile?.email) {
        const { data: byEmail } = await supabase.from('vol_profiles')
          .select('*').eq('email', authProfile.email).maybeSingle();
        if (byEmail) {

          await supabase.from('vol_profiles').update({ auth_user_id: userId }).eq('id', byEmail.id);
          volProfile = { ...byEmail, auth_user_id: userId };
        }
      }
    }


    let teams = [];
    if (volProfile) {
      const { data: memberData } = await supabase.from('vol_team_members')
        .select('*, team:vol_teams(id, name, color), position:vol_positions(id, name)')
        .eq('volunteer_profile_id', volProfile.id).eq('is_active', true);
      teams = memberData || [];
    }

    res.json({ profile: volProfile, teams });
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar perfil do voluntário' }); }
});


router.post('/me/face', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { descriptor, photo_url } = req.body;
    if (!descriptor || !Array.isArray(descriptor)) {
      return res.status(400).json({ error: 'descriptor obrigatorio' });
    }

    const { data: profile } = await supabase.from('vol_profiles')
      .select('id').eq('auth_user_id', userId).maybeSingle();
    if (!profile) {
      return res.status(404).json({ error: 'Perfil de voluntário não encontrado' });
    }

    const { data, error } = await supabase.rpc('vol_save_profile_face_descriptor', {
      p_profile_id: profile.id,
      descriptor,
      photo_url: photo_url || null,
    });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) {
    console.error('[Vol] save my face error:', e.message);
    res.status(500).json({ error: 'Erro ao salvar reconhecimento facial' });
  }
});


router.put('/me', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { full_name, cpf, phone, email } = req.body;
    if (!full_name) return res.status(400).json({ error: 'Nome obrigatorio' });


    let { data: existing } = await supabase.from('vol_profiles')
      .select('id, cpf').eq('auth_user_id', userId).maybeSingle();

    const cleanCpf = cpf ? cpf.replace(/\D/g, '') : '';
    const currentCpf = existing?.cpf ? existing.cpf.replace(/\D/g, '') : '';
    const cpfChanged = cleanCpf && cleanCpf !== currentCpf;




    let membroMatch = null;
    if (cpfChanged) {
      if (cleanCpf.length !== 11 || !cpfValido(cleanCpf)) {
        return res.status(400).json({ error: 'CPF inválido — confira os dígitos' });
      }
      const { data: membro } = await supabase.from('mem_membros')
        .select('id, nome, telefone, email').eq('cpf', cleanCpf).is('deleted_at', null).maybeSingle();
      if (!membro) {
        return res.status(409).json({
          error: 'CPF não encontrado no cadastro de membros. Complete o cadastro para continuar.',
          code: 'MEMBER_NOT_FOUND',
          cpf: cleanCpf,
        });
      }
      membroMatch = membro;
    }

    let profileId;
    if (existing) {
      profileId = existing.id;
      const update = {
        full_name,
        cpf: cleanCpf || null,
        phone: phone || null,
        email: email || null,
        profile_complete: true,
      };
      if (membroMatch) update.membresia_id = membroMatch.id;
      await supabase.from('vol_profiles').update(update).eq('id', profileId);
    } else {
      const insert = {
        auth_user_id: userId,
        full_name,
        cpf: cleanCpf || null,
        phone: phone || null,
        email: email || null,
        profile_complete: true,
      };
      if (membroMatch) insert.membresia_id = membroMatch.id;
      const { data: created, error } = await supabase.from('vol_profiles').insert(insert).select().single();
      if (error) return res.status(400).json({ error: error.message });
      profileId = created.id;
    }

    const { data: updated } = await supabase.from('vol_profiles')
      .select('*').eq('id', profileId).single();

    res.json({
      profile: updated,
      membresiaMatch: membroMatch ? { id: membroMatch.id, nome: membroMatch.nome } : null,
    });
  } catch (e) {
    console.error('[Vol] update me error:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar perfil' });
  }
});



router.post('/me/register-member', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { nome, sobrenome, cpf, celular } = req.body || {};

    if (!nome || !nome.trim()) return res.status(400).json({ error: 'Nome obrigatorio' });
    if (!sobrenome || !sobrenome.trim()) return res.status(400).json({ error: 'Sobrenome obrigatorio' });
    if (!cpf) return res.status(400).json({ error: 'CPF obrigatorio' });
    if (!celular || !celular.trim()) return res.status(400).json({ error: 'Celular obrigatorio' });

    const cleanCpf = String(cpf).replace(/\D/g, '');
    if (cleanCpf.length !== 11 || !cpfValido(cleanCpf)) return res.status(400).json({ error: 'CPF inválido — confira os dígitos' });
    const cleanPhone = String(celular).replace(/\D/g, '');
    if (cleanPhone.length < 10) return res.status(400).json({ error: 'Celular invalido' });

    const fullName = `${nome.trim()} ${sobrenome.trim()}`.replace(/\s+/g, ' ');



    let membro;
    try {
      const r = await acharOuCriarGuardado({
        cpf: cleanCpf, telefone: cleanPhone, nome: fullName, status: 'visitante',
        origem: 'voluntariado_ficha',
      });
      const { data } = await supabase.from('mem_membros')
        .select('id, nome, telefone, email').eq('id', r.membro_id).single();
      membro = data;
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }


    let { data: profile } = await supabase.from('vol_profiles')
      .select('id').eq('auth_user_id', userId).maybeSingle();

    if (profile) {
      await supabase.from('vol_profiles').update({
        full_name: fullName,
        cpf: cleanCpf,
        phone: cleanPhone,
        membresia_id: membro.id,
        profile_complete: true,
      }).eq('id', profile.id);
    } else {
      const { data: created, error } = await supabase.from('vol_profiles').insert({
        auth_user_id: userId,
        full_name: fullName,
        cpf: cleanCpf,
        phone: cleanPhone,
        membresia_id: membro.id,
        profile_complete: true,
      }).select('id').single();
      if (error) return res.status(400).json({ error: error.message });
      profile = created;
    }

    const { data: updated } = await supabase.from('vol_profiles')
      .select('*').eq('id', profile.id).single();

    res.json({
      profile: updated,
      membresiaMatch: { id: membro.id, nome: membro.nome },
      created: true,
    });
  } catch (e) {
    console.error('[Vol] register member error:', e.message);
    res.status(500).json({ error: 'Erro ao cadastrar membro' });
  }
});


router.get('/me/wallet/google', async (req, res) => {
  try {
    const userId = req.user.userId;

    const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID;
    const serviceAccountEmail = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL;
    const rawKey = process.env.GOOGLE_WALLET_PRIVATE_KEY || '';
    const privateKey = rawKey.replace(/\\n/g, '\n');

    if (!issuerId || !serviceAccountEmail || !privateKey) {
      return res.status(503).json({ error: 'Google Wallet não configurado' });
    }

    const { data: profile } = await supabase.from('vol_profiles')
      .select('id, full_name, qr_code').eq('auth_user_id', userId).maybeSingle();

    if (!profile) return res.status(404).json({ error: 'Perfil não encontrado' });
    if (!profile.qr_code) return res.status(400).json({ error: 'QR Code ainda não gerado para este perfil' });

    const jwt = require('jsonwebtoken');
    const classId = `${issuerId}.cbrio_voluntario_v1`;
    const objectId = `${issuerId}.vol_${profile.id.replace(/-/g, '_')}`;


    const voluntarioId = `CBR-${profile.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;


    const frontendUrl = (process.env.FRONTEND_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')).replace(/\/+$/, '');
    const logoUrl = frontendUrl ? `${frontendUrl}/logo-cbrio-text.png` : 'https://sistema-cbrio.vercel.app/logo-cbrio-text.png';

    const genericObject = {
      id: objectId,
      classId: classId,
      genericType: 'GENERIC_OTHER',
      hexBackgroundColor: '#408097',
      logo: {
        sourceUri: { uri: logoUrl },
        contentDescription: { defaultValue: { language: 'pt-BR', value: 'CBRio' } },
      },
      cardTitle: { defaultValue: { language: 'pt-BR', value: 'CBRio' } },
      subheader: { defaultValue: { language: 'pt-BR', value: 'NOME' } },
      header: { defaultValue: { language: 'pt-BR', value: profile.full_name || 'Voluntario' } },
      textModulesData: [
        { id: 'vol_id', header: 'VOLUNTARIO ID', body: voluntarioId },
      ],
      barcode: { type: 'QR_CODE', value: profile.qr_code, alternateText: voluntarioId },
      state: 'ACTIVE',
    };

    const claims = {
      iss: serviceAccountEmail,
      aud: 'google',
      typ: 'savetowallet',
      iat: Math.floor(Date.now() / 1000),
      payload: { genericObjects: [genericObject] },
    };

    const token = jwt.sign(claims, privateKey, { algorithm: 'RS256' });
    res.json({ url: `https://pay.google.com/gp/v/save/${token}`, voluntarioId });
  } catch (err) {
    console.error('[Wallet] Google error:', err.message);
    res.status(500).json({ error: err.message });
  }
});


router.get('/me/wallet/apple', async (req, res) => {
  try {
    const { buildVoluntarioPass } = require('../services/appleWallet');
    const userId = req.user.userId;

    const { data: profile } = await supabase.from('vol_profiles')
      .select('id, full_name, qr_code').eq('auth_user_id', userId).maybeSingle();

    if (!profile) return res.status(404).json({ error: 'Perfil não encontrado' });
    if (!profile.qr_code) return res.status(400).json({ error: 'QR Code ainda não gerado para este perfil' });

    const voluntarioId = `CBR-${profile.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

    const pkpassBuffer = await buildVoluntarioPass({
      nome: profile.full_name,
      qrCode: profile.qr_code,
      voluntarioId,
    });

    res.setHeader('Content-Type', 'application/vnd.apple.pkpass');
    res.setHeader('Content-Disposition', `attachment; filename="cbrio-voluntario.pkpass"`);
    res.send(pkpassBuffer);
  } catch (err) {
    console.error('[Wallet] Apple error:', err.message);
    res.status(503).json({ error: 'Apple Wallet indisponível no momento.' });
  }
});


router.get('/my-schedules', async (req, res) => {
  try {
    const userId = req.user.userId;


    const { data: volProfile } = await supabase.from('vol_profiles')
      .select('id, planning_center_id').eq('auth_user_id', userId).maybeSingle();

    if (!volProfile) return res.json([]);


    const conditions = [`volunteer_id.eq.${volProfile.id}`];
    if (volProfile.planning_center_id) {
      conditions.push(`planning_center_person_id.eq.${volProfile.planning_center_id}`);
    }

    const { data: schedules } = await supabase.from('vol_schedules')
      .select('*, service:vol_services!inner(*)')
      .or(conditions.join(','))
      .gte('service.scheduled_at', new Date().toISOString())
      .order('service(scheduled_at)', { ascending: true });


    const scheduleIds = (schedules || []).map(s => s.id);
    let checkIns = [];
    if (scheduleIds.length > 0) {
      const { data: ci } = await supabase.from('vol_check_ins').select('schedule_id').in('schedule_id', scheduleIds);
      checkIns = ci || [];
    }
    const checkedIds = new Set(checkIns.map(c => c.schedule_id));

    const result = (schedules || []).map(s => ({
      ...s,
      has_checkin: checkedIds.has(s.id),
    }));

    res.json(result);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar minhas escalas' }); }
});













router.post('/my-schedules/:id/respond', async (req, res) => {
  try {
    const { status } = req.body;

    const { data: escala } = await supabase.from('vol_schedules')
      .select('id, volunteer_id, planning_center_person_id').eq('id', req.params.id).maybeSingle();
    if (!escala) return res.status(404).json({ error: 'Escala não encontrada' });

    const { data: meuPerfil } = await supabase.from('vol_profiles')
      .select('id, planning_center_id').eq('auth_user_id', req.user.userId).maybeSingle();

    const minha = !!meuPerfil && (
      (escala.volunteer_id && escala.volunteer_id === meuPerfil.id) ||
      (escala.planning_center_person_id && escala.planning_center_person_id === meuPerfil.planning_center_id)
    );


    const podeGerir = getEffectiveLevel(req, 'voluntariado') >= 3;
    if (!minha && !podeGerir) return res.status(403).json({ error: 'Esta escala não é sua.' });

    const r = await responderEscala(req.params.id, status, {
      origem: minha ? 'app' : 'sistema', porUserId: req.user.userId,
    });
    if (!r.ok) return res.status(r.status || 400).json({ error: r.erro });
    res.json(r.escala);
  } catch (e) { res.status(500).json({ error: 'Erro ao responder escala' }); }
});


router.get('/my-services', async (req, res) => {
  try {
    const { year } = req.query;
    const targetYear = parseInt(year || new Date().getFullYear());
    const userId = req.user.userId;

    const { data: volProfile } = await supabase.from('vol_profiles')
      .select('id').eq('auth_user_id', userId).maybeSingle();

    const { data: services, error } = await supabase.from('vol_services')
      .select('id, name, service_type_name, service_type_id, scheduled_at')
      .not('service_type_id', 'is', null)
      .gte('scheduled_at', `${targetYear}-01-01T00:00:00`)
      .lte('scheduled_at', `${targetYear}-12-31T23:59:59`)
      .order('scheduled_at');
    if (error) return res.status(400).json({ error: error.message });

    if (!volProfile) {
      return res.json((services || []).map(s => ({ ...s, is_unavailable: false, availability_id: null })));
    }

    const { data: unavailabilities } = await supabase.from('vol_availability')
      .select('id, service_id')
      .eq('volunteer_profile_id', volProfile.id)
      .not('service_id', 'is', null);

    const availabilityMap = new Map((unavailabilities || []).map(u => [u.service_id, u.id]));

    res.json((services || []).map(s => ({
      ...s,
      is_unavailable: availabilityMap.has(s.id),
      availability_id: availabilityMap.get(s.id) || null,
    })));
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar cultos do voluntário' }); }
});


router.get('/my-availability', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { data: volProfile } = await supabase.from('vol_profiles')
      .select('id').eq('auth_user_id', userId).maybeSingle();
    if (!volProfile) return res.json([]);

    const { data, error } = await supabase.from('vol_availability')
      .select('*').eq('volunteer_profile_id', volProfile.id).order('unavailable_from');
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar disponibilidade' }); }
});



router.post('/my-availability', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { service_id, unavailable_from, unavailable_to, reason } = req.body;

    const { data: volProfile } = await supabase.from('vol_profiles')
      .select('id').eq('auth_user_id', userId).maybeSingle();
    if (!volProfile) return res.status(404).json({ error: 'Perfil de voluntário não encontrado' });

    let fromDate = unavailable_from;
    let toDate = unavailable_to;

    if (service_id) {

      const { data: service } = await supabase.from('vol_services')
        .select('scheduled_at').eq('id', service_id).single();
      if (!service) return res.status(404).json({ error: 'Culto não encontrado' });
      fromDate = service.scheduled_at.split('T')[0];
      toDate = fromDate;
    }

    if (!fromDate) return res.status(400).json({ error: 'service_id ou datas obrigatórios' });

    const { data, error } = await supabase.from('vol_availability')
      .insert({ volunteer_profile_id: volProfile.id, service_id: service_id || null, unavailable_from: fromDate, unavailable_to: toDate, reason: reason || null })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao registrar indisponibilidade' }); }
});


router.delete('/my-availability/:id', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { data: volProfile } = await supabase.from('vol_profiles')
      .select('id').eq('auth_user_id', userId).maybeSingle();
    if (!volProfile) return res.status(404).json({ error: 'Perfil não encontrado' });


    const { error } = await supabase.from('vol_availability')
      .delete().eq('id', req.params.id).eq('volunteer_profile_id', volProfile.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover indisponibilidade' }); }
});


router.get('/self-checkin-qr/:serviceId', async (req, res) => {
  try {
    const serviceId = req.params.serviceId;
    const { data: service } = await supabase.from('vol_services')
      .select('id, name, scheduled_at').eq('id', serviceId).single();
    if (!service) return res.status(404).json({ error: 'Culto não encontrado' });


    const frontendUrl = process.env.FRONTEND_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:5173');
    const qrUrl = `${frontendUrl}/voluntariado/self-checkin?serviceId=${serviceId}`;

    res.json({ url: qrUrl, service });
  } catch (e) { res.status(500).json({ error: 'Erro ao gerar QR code' }); }
});




router.get('/profiles', async (req, res) => {
  try {
    const { data, error } = await supabase.from('vol_profiles').select('*').order('full_name');
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar perfis' }); }
});

router.get('/profiles/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('vol_profiles').select('*').eq('id', req.params.id).single();
    if (error) return res.status(404).json({ error: 'Perfil não encontrado' });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar perfil' }); }
});



router.get('/profiles/:id/detalhe', async (req, res) => {
  try {
    const id = req.params.id;
    const { data: profile, error: ep } = await supabase.from('vol_profiles').select('*').eq('id', id).single();
    if (ep || !profile) return res.status(404).json({ error: 'Perfil não encontrado' });


    const { data: servicos } = await supabase.from('vol_servicos_historico')
      .select('data, culto_label, mes, origem').eq('vol_profile_id', id).is('deleted_at', null)
      .order('data', { ascending: false }).limit(1000);


    const { data: checkins } = await supabase.from('vol_check_ins')
      .select('id, checked_in_at, method, is_unscheduled, service:vol_services(scheduled_at, service_type_name, name)')
      .eq('volunteer_id', id).order('checked_in_at', { ascending: false }).limit(500);


    let escq = supabase.from('vol_schedules')
      .select('id, team_name, position_name, confirmation_status, service:vol_services(scheduled_at, service_type_name, name)');
    const pcid = /^\d+$/.test(String(profile.planning_center_id || '')) ? profile.planning_center_id : null;
    if (pcid) escq = escq.or(`volunteer_id.eq.${id},planning_center_person_id.eq.${pcid}`);
    else escq = escq.eq('volunteer_id', id);
    const { data: escalas } = await escq.limit(500);

    const norm1 = (x) => (Array.isArray(x) ? x[0] : x) || null;
    const servArr = servicos || [];
    const ciArr = (checkins || []).map((c) => ({ ...c, service: norm1(c.service) }));
    const escArr = (escalas || []).map((e) => ({ ...e, service: norm1(e.service) }));
    const porCulto = {};
    for (const s of servArr) porCulto[s.culto_label] = (porCulto[s.culto_label] || 0) + 1;
    const d4 = new Date(); d4.setMonth(d4.getMonth() - 4);
    const desde4m = d4.toISOString().slice(0, 10);
    const serv4m = servArr.filter((s) => s.data >= desde4m).length;


    const equipes = [...new Set(escArr.map((e) => e.team_name).filter(Boolean))];




    const ultimoServico = servArr[0]?.data || null;
    const ultimoCheckin = ciArr[0]?.checked_in_at || null;
    const ultimaAtividade = [ultimoServico, ultimoCheckin].filter(Boolean).sort().pop() || null;
    let diasDesde = Infinity;
    if (ultimaAtividade) diasDesde = Math.floor((Date.now() - new Date(ultimaAtividade).getTime()) / 86400000);




    const { nivel, label } = atividadeVol.nivelPorDias(
      Number.isFinite(diasDesde) ? diasDesde : null, serv4m,
    );
    const termometro = {
      nivel, label,
      dias_desde_ultima_atividade: Number.isFinite(diasDesde) ? diasDesde : null,
      ultima_atividade: ultimaAtividade,
      servicos_4m: serv4m,
    };

    res.json({
      profile,
      servicos: servArr,
      checkins: ciArr,
      escalas: escArr,
      termometro,
      equipes,
      totais: {
        total_servicos: servArr.length,
        servicos_4m: serv4m,
        total_checkins: ciArr.length,
        ultimo_servico: ultimoServico,
        por_culto: porCulto,
      },
    });
  } catch (e) {
    console.error('[vol] profile detalhe', e.message);
    res.status(500).json({ error: 'Erro ao carregar detalhe do voluntário' });
  }
});





router.get('/aniversariantes-semana', async (req, res) => {
  try {
    const { data, error } = await supabase.rpc('fn_vol_aniversariantes_semana');
    if (error) throw error;
    const rows = (data || []).map((r) => ({
      vol_profile_id: r.vol_profile_id,
      nome: r.nome,
      telefone: r.telefone || null,
      data_nascimento: r.data_nascimento,
      aniversario: r.aniversario,
      dow: r.dow,
      hoje: r.aniversario === new Date().toISOString().slice(0, 10),
      parabenizado: false,
    }));

    const anoAtual = new Date().getFullYear();
    const ids = rows.map((r) => r.vol_profile_id).filter(Boolean);
    if (ids.length) {
      const { data: pb } = await supabase.from('vol_parabens')
        .select('vol_profile_id').eq('ano', anoAtual).in('vol_profile_id', ids);
      const enviados = new Set((pb || []).map((p) => p.vol_profile_id));
      rows.forEach((r) => { r.parabenizado = enviados.has(r.vol_profile_id); });
    }
    res.json({ rows });
  } catch (e) {
    console.error('[vol] aniversariantes-semana', e.message);
    res.status(500).json({ error: 'Erro ao carregar aniversariantes' });
  }
});



const MSG_RESULTADO = {
  sem_optin: 'A pessoa não deu consentimento (opt-in) para receber mensagens no WhatsApp. Use o botão de abrir no WhatsApp para falar manualmente.',
  sem_cadastro: 'Voluntário sem cadastro de membro (sem opt-in registrado). Use o WhatsApp manual.',
  sem_membro: 'Voluntário sem cadastro de membro vinculado.',
  sem_telefone: 'Voluntário sem telefone.',
  telefone_invalido: 'Telefone inválido.',
  template_nao_configurado: 'Template de aniversário não configurado na Meta/env.',
  wpp_nao_configurado: 'WhatsApp não configurado.',
};

router.post('/aniversariantes/:volProfileId/parabenizar', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const volId = req.params.volProfileId;
    const { data: vp } = await supabase.from('vol_profiles')
      .select('id, full_name, membresia_id').eq('id', volId).maybeSingle();
    if (!vp) return res.status(404).json({ error: 'Voluntário não encontrado' });

    const primeiro = String(vp.full_name || '').trim().split(/\s+/)[0] || '';






    const { jaParabenizado, registrarParabens } = require('../services/aniversarioVoluntario');
    if (await jaParabenizado({ membroId: vp.membresia_id, volProfileId: volId })) {
      return res.status(409).json({
        ok: false, resultado: 'ja_parabenizado',
        error: 'Esta pessoa já foi parabenizada este ano (pela equipe ou pelo envio automático do dia). Se quiser falar de novo, use o botão de abrir no WhatsApp.',
      });
    }

    let resultado = 'sem_cadastro';
    let sent = false;
    if (vp.membresia_id) {
      const wpp = require('../services/whatsappService');
      const r = await wpp.notificarMembro(vp.membresia_id, 'aniversario', [primeiro]);
      if (r?.sent) { sent = true; resultado = 'enviado'; }
      else resultado = r?.skipped || r?.reason || 'falhou';
    }

    if (sent) {




      await registrarParabens({
        volProfileId: volId,
        porUserId: req.user.userId || req.user.id,
        resultado,
      });
      return res.json({ ok: true, resultado });
    }
    return res.status(400).json({ ok: false, resultado, error: MSG_RESULTADO[resultado] || 'Não foi possível enviar pela API. Use o WhatsApp manual.' });
  } catch (e) {
    console.error('[vol] parabenizar', e.message);
    res.status(500).json({ error: 'Erro ao parabenizar' });
  }
});

router.post('/profiles', async (req, res) => {
  try {
    const { full_name, cpf } = req.body;



    const email = normalizarEmail(req.body.email) || null;
    const phone = normalizarTelefone(req.body.phone) || null;
    if (!full_name || !full_name.trim()) return res.status(400).json({ error: 'Nome obrigatorio' });

    if (String(req.body.phone || '').trim() && !phone) {
      return res.status(400).json({ error: 'Telefone inválido: informe com DDD (10 ou 11 dígitos).' });
    }
    if (String(req.body.email || '').trim() && !email) {
      return res.status(400).json({ error: 'E-mail inválido: confira o endereço.' });
    }
    const cleanCpf = cpf ? cpf.replace(/\D/g, '') : null;
    if (cleanCpf && (cleanCpf.length !== 11 || !cpfValido(cleanCpf))) {
      return res.status(400).json({ error: 'CPF inválido — confira os dígitos' });
    }


    let membresiaId = null;
    try {
      const { findOrCreateMembro } = require('./pessoas');
      const r = await findOrCreateMembro({
        cpf: cleanCpf, email, telefone: phone, nome: full_name.trim(),
        status: 'visitante', origem: 'voluntariado_perfil',
      });
      membresiaId = r.membro_id;
    } catch (e) {
      console.error('voluntariado/profiles findOrCreateMembro:', e.message);
    }

    const { data, error } = await supabase.from('vol_profiles')
      .insert({
        full_name: full_name.trim(), email, phone,
        cpf: cleanCpf || null, origem: 'manual', allocation_status: 'active',
        profile_complete: true, membresia_id: membresiaId,
      })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    enqueueSync('voluntario', data.id, 'upsert').catch(() => {});
    res.json(data);
  } catch (e) { return falhaInterna(res, 'Erro ao criar perfil', e); }
});


router.put('/profiles/:id', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { full_name, email, planning_center_id, avatar_url } = req.body;
    const { data, error } = await supabase.from('vol_profiles')
      .update({ full_name, email, planning_center_id, avatar_url }).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    enqueueSync('voluntario', req.params.id, 'upsert').catch(() => {});
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar perfil' }); }
});







router.put('/profiles/:id/cadastro', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { full_name, email, phone, cpf } = req.body || {};
    if (!full_name || !String(full_name).trim()) {
      return res.status(400).json({ error: 'Nome obrigatório' });
    }
    const nome = String(full_name).trim();

    const { data: perfil, error: pErr } = await supabase.from('vol_profiles')
      .select('id, full_name, email, phone, cpf, membresia_id, planning_center_id')
      .eq('id', req.params.id).maybeSingle();
    if (pErr) throw pErr;
    if (!perfil) return res.status(404).json({ error: 'Voluntário não encontrado' });



    let cleanCpf = perfil.cpf || null;
    if (cpf !== undefined) {
      const dig = String(cpf || '').replace(/\D/g, '');
      if (!dig) cleanCpf = null;
      else if (dig === String(perfil.cpf || '')) cleanCpf = dig;
      else if (dig.length !== 11 || !cpfValido(dig)) return res.status(400).json({ error: 'CPF inválido — confira os dígitos' });
      else cleanCpf = dig;
    }
    let cleanPhone = perfil.phone || null;
    if (phone !== undefined) {
      let d = String(phone || '').replace(/\D/g, '');
      if (!d) cleanPhone = null;
      else {
        if (d.startsWith('55') && d.length > 11) d = d.slice(2);
        if (d.length < 10 || d.length > 11) return res.status(400).json({ error: 'Telefone inválido — DDD + número (10 ou 11 dígitos)' });
        cleanPhone = d;
      }
    }
    let cleanEmail = perfil.email || null;
    if (email !== undefined) {
      const e = String(email || '').trim().toLowerCase();
      if (!e) cleanEmail = null;
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return res.status(400).json({ error: 'E-mail inválido' });
      else cleanEmail = e;
    }



    let membresiaId = perfil.membresia_id || null;
    if (!membresiaId) {
      try {
        const r = await acharOuCriarGuardado({
          cpf: cleanCpf, email: cleanEmail, telefone: cleanPhone, nome,
          status: 'visitante', origem: 'voluntariado_edicao',
        });
        membresiaId = r?.membro_id || null;
      } catch (e) {
        console.error('[vol] cadastro matcher:', e.message);
      }
    }


    if (membresiaId) {
      const patchMembro = { nome };
      if (cleanEmail !== null) patchMembro.email = cleanEmail;
      if (cleanPhone !== null) patchMembro.telefone = cleanPhone;
      if (cleanCpf !== null) patchMembro.cpf = cleanCpf;
      const { error: mErr } = await supabase.from('mem_membros')
        .update(patchMembro).eq('id', membresiaId);
      if (mErr) {

        const dup = /duplicate|unique|23505/i.test(mErr.message || '');
        return res.status(dup ? 409 : 400).json({
          error: dup ? 'CPF ou e-mail já pertence a outra pessoa na membresia.' : mErr.message,
        });
      }
      enqueueSync('membro', membresiaId, 'upsert').catch(() => {});
    }


    const { data, error } = await supabase.from('vol_profiles')
      .update({
        full_name: nome, email: cleanEmail, phone: cleanPhone, cpf: cleanCpf,
        membresia_id: membresiaId, protegido_sync: true, profile_complete: true,
      })
      .eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    enqueueSync('voluntario', req.params.id, 'upsert').catch(() => {});

    res.json({ ...data, membresia_vinculada: !!membresiaId });
  } catch (e) {
    console.error('[vol] editar cadastro:', e.message);
    res.status(500).json({ error: 'Erro ao salvar o cadastro do voluntário' });
  }
});





router.get('/form-opcoes', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vol_form_opcoes')
      .select('*')
      .order('ordem', { ascending: true });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar opções do formulário' }); }
});

router.post('/form-opcoes', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { label, area_canonica, exige_dados_menor, aviso_titulo, aviso_texto, ordem } = req.body || {};
    if (!label || !String(label).trim()) return res.status(400).json({ error: 'Informe o nome da opção' });
    const areas = ['kids', 'sede', 'ami', 'bridge', 'online'];
    const area = areas.includes(String(area_canonica)) ? String(area_canonica) : 'sede';

    let ord = Number.isFinite(Number(ordem)) ? Number(ordem) : null;
    if (ord == null) {
      const { data: max } = await supabase
        .from('vol_form_opcoes').select('ordem').order('ordem', { ascending: false }).limit(1).maybeSingle();
      ord = (max?.ordem || 0) + 10;
    }
    const { data, error } = await supabase
      .from('vol_form_opcoes')
      .insert({
        label: String(label).trim(),
        area_canonica: area,
        exige_dados_menor: !!exige_dados_menor,
        aviso_titulo: aviso_titulo ? String(aviso_titulo).trim() : null,
        aviso_texto: aviso_texto ? String(aviso_texto).trim() : null,
        ordem: ord,
      })
      .select('*').single();
    if (error) {
      if (error.code === '23505') return res.status(400).json({ error: 'Já existe uma opção com esse nome' });
      return res.status(400).json({ error: error.message });
    }
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar opção do formulário' }); }
});

router.put('/form-opcoes/:id', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { label, area_canonica, exige_dados_menor, aviso_titulo, aviso_texto, ordem, ativo } = req.body || {};
    const patch = { updated_at: new Date().toISOString() };
    if (label !== undefined) patch.label = String(label).trim();
    if (area_canonica !== undefined) {
      const areas = ['kids', 'sede', 'ami', 'bridge', 'online'];
      patch.area_canonica = areas.includes(String(area_canonica)) ? String(area_canonica) : 'sede';
    }
    if (exige_dados_menor !== undefined) patch.exige_dados_menor = !!exige_dados_menor;
    if (aviso_titulo !== undefined) patch.aviso_titulo = aviso_titulo ? String(aviso_titulo).trim() : null;
    if (aviso_texto !== undefined) patch.aviso_texto = aviso_texto ? String(aviso_texto).trim() : null;
    if (ordem !== undefined && Number.isFinite(Number(ordem))) patch.ordem = Number(ordem);
    if (ativo !== undefined) patch.ativo = !!ativo;
    const { data, error } = await supabase
      .from('vol_form_opcoes').update(patch).eq('id', req.params.id).select('*').single();
    if (error) {
      if (error.code === '23505') return res.status(400).json({ error: 'Já existe uma opção com esse nome' });
      return res.status(400).json({ error: error.message });
    }
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar opção do formulário' }); }
});

router.delete('/form-opcoes/:id', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { error } = await supabase.from('vol_form_opcoes').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover opção do formulário' }); }
});




router.get('/supervisores', authorizeModule('voluntariado', 3), async (req, res) => {
  try {


    let r = await supabase.from('vol_area_supervisores').select(SELECT_SUPERVISOR).order('area', { ascending: true });
    if (r.error && r.error.code === '42703') {
      r = await supabase.from('vol_area_supervisores').select(SELECT_SUPERVISOR_BASE).order('area', { ascending: true });
    }
    if (r.error) throw r.error;
    res.json(r.data || []);
  } catch (e) {
    console.error('[voluntariado] supervisores get:', e.message);
    res.status(500).json({ error: 'Erro ao listar supervisores' });
  }
});






















async function validarEscopoSupervisao({ area, position_id, culto_dia, culto_periodo, culto_semana, team_id, papel }) {
  const norm = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const PAPEIS = ['leitor', 'lider', 'admin'];
  const pap = papel ? String(papel).trim().toLowerCase() : 'lider';
  if (!PAPEIS.includes(pap)) return { erro: 'Papel invalido (leitor|lider|admin).' };

  let teamId = team_id || null;
  let areaFinal = area ? String(area).trim().toLowerCase() : '';
  if (teamId) {
    const { data: eq } = await supabase.from('vol_teams').select('id, name, area, is_active').eq('id', teamId).maybeSingle();
    if (!eq) return { erro: 'Esse time não existe.' };

    areaFinal = String(eq.area || '').trim().toLowerCase() || 'geral';
  }
  if (!areaFinal) return { erro: 'Escolha um time, uma área, um culto ou geral.' };

  let posId = position_id || null;
  if (posId) {
    const { data: pos } = await supabase.from('vol_positions')
      .select('id, name, team_id, team:vol_teams(id, area)').eq('id', posId).maybeSingle();
    if (!pos) return { erro: 'Essa subárea não existe.' };
    if (teamId) {
      if (String(pos.team_id) !== String(teamId)) return { erro: 'Essa função não é deste time.' };
    } else {
      const areaDaPos = Array.isArray(pos.team) ? pos.team[0]?.area : pos.team?.area;
      if (norm(areaDaPos) !== norm(areaFinal)) return { erro: 'Essa subárea não pertence à área escolhida.' };
    }
  }

  const DIAS = ['domingo', 'quarta', 'sabado'];
  const PERIODOS = ['manha', 'noite'];
  const dia = culto_dia ? norm(culto_dia) : null;
  const per = culto_periodo ? String(culto_periodo).trim().toLowerCase() : null;
  const sem = (culto_semana === 0 || culto_semana) ? Number(culto_semana) : null;
  if (dia && !DIAS.includes(dia)) return { erro: 'Dia do culto invalido (domingo|quarta|sabado).' };
  if (per && !PERIODOS.includes(per)) return { erro: 'Periodo invalido (manha|noite).' };
  if (sem !== null && !(Number.isInteger(sem) && sem >= 1 && sem <= 4)) {
    return { erro: 'Semana do rodizio invalida (1 a 4).' };
  }
  if (per && !dia) return { erro: 'Escolha o dia do culto antes do periodo.' };
  if (per && dia !== 'domingo') return { erro: 'Só o domingo tem manhã/noite — quarta e sábado são culto único.' };

  if (pap === 'admin' && (teamId || posId || dia || per || sem !== null || areaFinal !== 'geral')) {
    return { erro: 'Admin é sempre geral, sem recorte. Pra um time ou culto específico, use Líder.' };
  }
  return { posId, dia, per, sem, teamId, papel: pap, area: areaFinal };
}

const SELECT_SUPERVISOR_BASE = 'id, area, position_id, culto_dia, culto_periodo, culto_semana, created_at, membro:mem_membros(id, nome, telefone, foto_url), position:vol_positions(id, name, team_id)';


const SELECT_SUPERVISOR = `${SELECT_SUPERVISOR_BASE}, papel, team_id, team:vol_teams(id, name, area)`;




















router.get('/supervisores/candidatos', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const volId = String(req.query.vol_profile_id || '').trim();
    if (!volId) return res.status(400).json({ error: 'vol_profile_id obrigatório' });

    const { data: vp } = await supabase.from('vol_profiles')
      .select('id, full_name, email, cpf, membresia_id').eq('id', volId).maybeSingle();
    if (!vp) return res.status(404).json({ error: 'Perfil de voluntário não encontrado' });
    if (vp.membresia_id) return res.json({ ja_vinculado: true, candidatos: [] });

    const digitos = (v) => String(v || '').replace(/\D/g, '');
    const semAcento = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const cpf = digitos(vp.cpf);
    const email = (vp.email || '').trim().toLowerCase();

    const achados = new Map();
    const guardar = (m, sinal) => {
      if (!m?.id || achados.has(m.id)) return;
      achados.set(m.id, {
        id: m.id, nome: m.nome, status: m.status,
        tem_cpf: !!m.cpf, data_nascimento: m.data_nascimento || null,
        email: m.email || null, telefone: m.telefone || null,
        sinal,
      });
    };
    const COLS = 'id, nome, cpf, email, telefone, data_nascimento, status';

    if (cpf.length === 11) {
      const { data } = await supabase.from('mem_membros').select(COLS)
        .eq('cpf', cpf).is('deleted_at', null).limit(3);
      (data || []).forEach((m) => guardar(m, 'cpf'));
    }
    if (email) {
      const { data } = await supabase.from('mem_membros').select(COLS)
        .ilike('email', email).is('deleted_at', null).limit(5);
      (data || []).forEach((m) => guardar(m, 'email'));
    }
    if (vp.full_name) {


      const { data } = await supabase.from('mem_membros').select(COLS)
        .ilike('nome', vp.full_name.trim()).is('deleted_at', null).limit(5);
      (data || []).filter((m) => semAcento(m.nome) === semAcento(vp.full_name))
        .forEach((m) => guardar(m, 'nome'));
    }

    res.json({
      ja_vinculado: false,
      perfil: { id: vp.id, full_name: vp.full_name, email: vp.email || null, tem_cpf: !!cpf },
      candidatos: [...achados.values()],
    });
  } catch (e) {
    console.error('[voluntariado] supervisores candidatos:', e.message);
    res.status(500).json({ error: 'Erro ao procurar cadastro da pessoa' });
  }
});

router.post('/supervisores', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { membro_id, area, position_id, culto_dia, culto_periodo, culto_semana, team_id, papel } = req.body || {};
    if (!membro_id || (!area && !team_id)) return res.status(400).json({ error: 'membro_id e area (ou team_id) obrigatórios' });

    const esc = await validarEscopoSupervisao({ area, position_id, culto_dia, culto_periodo, culto_semana, team_id, papel });
    if (esc.erro) return res.status(400).json({ error: esc.erro });

    const { data, error } = await supabase
      .from('vol_area_supervisores')
      .insert({
        membro_id,
        area: esc.area,
        team_id: esc.teamId,
        papel: esc.papel,
        position_id: esc.posId,
        culto_dia: esc.dia,
        culto_periodo: esc.per,
        culto_semana: esc.sem,
        concedido_por: req.user?.userId || null,
      })
      .select(SELECT_SUPERVISOR)
      .single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Essa pessoa já supervisiona isso' });
      if (error.code === '42703') return res.status(503).json({ error: 'Papéis e times ainda não foram liberados no banco (migration 20260924120000).' });
      throw error;
    }
    res.status(201).json(data);
  } catch (e) {
    console.error('[voluntariado] supervisores post:', e.message);
    res.status(500).json({ error: 'Erro ao conceder supervisão' });
  }
});











router.patch('/supervisores/:id', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { area, position_id, culto_dia, culto_periodo, culto_semana, team_id, papel } = req.body || {};
    if (!area && !team_id) return res.status(400).json({ error: 'area (ou team_id) obrigatória' });

    const esc = await validarEscopoSupervisao({ area, position_id, culto_dia, culto_periodo, culto_semana, team_id, papel });
    if (esc.erro) return res.status(400).json({ error: esc.erro });

    const { data, error } = await supabase
      .from('vol_area_supervisores')
      .update({
        area: esc.area,
        team_id: esc.teamId,
        papel: esc.papel,
        position_id: esc.posId,
        culto_dia: esc.dia,
        culto_periodo: esc.per,
        culto_semana: esc.sem,
      })
      .eq('id', req.params.id)
      .select(SELECT_SUPERVISOR)
      .single();

    if (error) {



      if (error.code === '23505') {
        return res.status(409).json({ error: 'Essa pessoa já tem uma supervisão com exatamente esse escopo.' });
      }
      throw error;
    }
    if (!data) return res.status(404).json({ error: 'Supervisão não encontrada' });
    res.json(data);
  } catch (e) {
    console.error('[voluntariado] supervisores patch:', e.message);
    res.status(500).json({ error: 'Erro ao editar a supervisão' });
  }
});








router.post('/supervisores/vincular', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { vol_profile_id, membro_id } = req.body || {};
    if (!vol_profile_id || !membro_id) {
      return res.status(400).json({ error: 'vol_profile_id e membro_id obrigatórios' });
    }
    const { data: vp } = await supabase.from('vol_profiles')
      .select('id, full_name, membresia_id').eq('id', vol_profile_id).maybeSingle();
    if (!vp) return res.status(404).json({ error: 'Perfil de voluntário não encontrado' });


    if (vp.membresia_id) {
      return res.status(409).json({ error: 'Esse perfil já está vinculado a um cadastro.' });
    }
    const { data: m } = await supabase.from('mem_membros')
      .select('id, nome').eq('id', membro_id).is('deleted_at', null).maybeSingle();
    if (!m) return res.status(404).json({ error: 'Cadastro de membro não encontrado' });

    const { error } = await supabase.from('vol_profiles')
      .update({ membresia_id: m.id }).eq('id', vp.id).is('membresia_id', null);
    if (error) throw error;




    res.json({ ok: true, vol_profile_id: vp.id, membro_id: m.id, membro_nome: m.nome });
  } catch (e) {
    console.error('[voluntariado] supervisores vincular:', e.message);
    res.status(500).json({ error: 'Erro ao vincular' });
  }
});

router.delete('/supervisores/:id', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { error } = await supabase.from('vol_area_supervisores').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[voluntariado] supervisores delete:', e.message);
    res.status(500).json({ error: 'Erro ao remover supervisão' });
  }
});




router.get('/roles', async (req, res) => {
  try {
    const { data, error } = await supabase.from('vol_user_roles').select('*');
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar roles' }); }
});



router.post('/roles', authorizeModule('voluntariado', 5), async (req, res) => {
  try {
    const { profile_id, role } = req.body;
    if (!profile_id || !role) return res.status(400).json({ error: 'profile_id e role obrigatórios' });
    const { data, error } = await supabase.from('vol_user_roles').insert({ profile_id, role }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao adicionar role' }); }
});


router.delete('/roles/:profileId/:role', authorizeModule('voluntariado', 5), async (req, res) => {
  try {
    const { error } = await supabase.from('vol_user_roles')
      .delete().eq('profile_id', req.params.profileId).eq('role', req.params.role);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover role' }); }
});






router.get('/vol-by-membro/:membroId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vol_profiles')
      .select('id, full_name, allocation_status, origem, cpf, team_members:vol_team_members(id, team:vol_teams(id, name, color))')
      .eq('membresia_id', req.params.membroId)
      .maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || null);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar perfil do voluntário' }); }
});


router.post('/quero-servir', async (req, res) => {
  try {
    const { membro_id } = req.body;
    if (!membro_id) return res.status(400).json({ error: 'membro_id obrigatorio' });


    const { data: membro, error: memErr } = await supabase
      .from('mem_membros')
      .select('id, nome, cpf, email')
      .eq('id', membro_id)
      .single();
    if (memErr || !membro) return res.status(404).json({ error: 'Membro não encontrado' });

    const cleanCpf = membro.cpf ? membro.cpf.replace(/\D/g, '') : null;
    let volProfile = null;


    const { data: byMembro } = await supabase
      .from('vol_profiles')
      .select('id, allocation_status, cpf')
      .eq('membresia_id', membro_id)
      .maybeSingle();

    if (byMembro) {

      const hasTeam = await supabase.from('vol_team_members')
        .select('id').eq('volunteer_profile_id', byMembro.id).limit(1);
      const newStatus = hasTeam.data?.length > 0 ? 'active' : 'waiting_allocation';
      await supabase.from('vol_profiles').update({
        membresia_id: membro_id,
        origem: 'membresia',
        allocation_status: newStatus,
      }).eq('id', byMembro.id);
      const { data: updated } = await supabase.from('vol_profiles').select('*').eq('id', byMembro.id).single();
      volProfile = updated;
    } else if (cleanCpf) {

      const { data: byCpf } = await supabase
        .from('vol_profiles')
        .select('id, allocation_status')
        .eq('cpf', cleanCpf)
        .maybeSingle();

      if (byCpf) {

        await supabase.from('vol_profiles').update({
          membresia_id: membro_id,
          origem: 'membresia',
          allocation_status: 'waiting_allocation',
        }).eq('id', byCpf.id);
        const { data: updated } = await supabase.from('vol_profiles').select('*').eq('id', byCpf.id).single();
        volProfile = updated;
      } else {

        const { data: created, error: createErr } = await supabase
          .from('vol_profiles')
          .insert({
            full_name: membro.nome,
            cpf: cleanCpf,
            email: membro.email,
            membresia_id: membro_id,
            origem: 'membresia',
            allocation_status: 'waiting_allocation',
            profile_complete: false,
          })
          .select('*')
          .single();
        if (createErr) return res.status(400).json({ error: createErr.message });
        volProfile = created;
      }
    } else {

      const { data: created, error: createErr } = await supabase
        .from('vol_profiles')
        .insert({
          full_name: membro.nome,
          email: membro.email,
          membresia_id: membro_id,
          origem: 'membresia',
          allocation_status: 'waiting_allocation',
          profile_complete: false,
        })
        .select('*')
        .single();
      if (createErr) return res.status(400).json({ error: createErr.message });
      volProfile = created;
    }


    await supabase.from('mem_membros').update({ quer_servir: true }).eq('id', membro_id);

    res.json({ success: true, vol_profile: volProfile });
  } catch (e) {
    console.error('[QUERO SERVIR]', e.message);
    res.status(500).json({ error: 'Erro ao registrar interesse em servir' });
  }
});


router.get('/waiting-allocation', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vol_profiles')
      .select(`
        id, full_name, email, cpf, avatar_url, origem, membresia_id, created_at,
        team_members:vol_team_members(id, team:vol_teams(id, name, color))
      `)
      .eq('allocation_status', 'waiting_allocation')
      .order('created_at', { ascending: true });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar fila de alocacao' }); }
});


















router.post('/vincular-membros', authorizeModule('voluntariado', 3), async (req, res) => {
  try {














    const aplicar = req.body?.aplicar === true;
    const depoisDe = typeof req.body?.depois_de === 'string' ? req.body.depois_de : null;
    const tamanho = Math.min(Math.max(Number(req.body?.tamanho) || 40, 1), 60);




    const jaTomados = new Set(Array.isArray(req.body?.ja_tomados) ? req.body.ja_tomados : []);

    let q = supabase.from('vol_profiles')
      .select('id, full_name, email, cpf, phone', { count: 'exact' })
      .is('membresia_id', null).eq('arquivado', false)
      .order('id').limit(tamanho);
    if (depoisDe) q = q.gt('id', depoisDe);
    const { data: pagina, error, count } = await q;
    if (error) return res.status(400).json({ error: error.message });

    const perfis = (pagina || []).filter(v => ehPessoaEscalavel(v.full_name));







    const donoDoMembro = new Map();
    for (let off = 0; ; off += 1000) {
      const { data: ocupados, error: eOcup } = await supabase.from('vol_profiles')
        .select('membresia_id, full_name').not('membresia_id', 'is', null)
        .order('id').range(off, off + 999);
      if (eOcup) return res.status(400).json({ error: eOcup.message });
      (ocupados || []).forEach(o => donoDoMembro.set(o.membresia_id, o.full_name));
      if (!ocupados || ocupados.length < 1000) break;
    }




    const achados = [];
    for (let i = 0; i < perfis.length; i += 5) {
      const grupo = perfis.slice(i, i + 5);
      const hits = await Promise.all(grupo.map(async (v) => {
        try {
          return await acharMembroGuardado({
            cpf: v.cpf, email: v.email, telefone: v.phone, nome: v.full_name,
          });
        } catch (e) {
          console.error('[vincular-membros] matcher:', v.id, e.message);
          return null;
        }
      }));
      grupo.forEach((v, k) => achados.push({ v, hit: hits[k] }));
    }




    const ligados = [], semMatch = [], conflitos = [];
    for (const { v, hit } of achados) {
      if (!hit?.membro_id) { semMatch.push({ id: v.id, nome: v.full_name }); continue; }
      const dono = donoDoMembro.get(hit.membro_id);
      if (dono || jaTomados.has(hit.membro_id)) {
        conflitos.push({ id: v.id, nome: v.full_name, membro_id: hit.membro_id, disputa_com: dono || '(outro nesta rodada)' });
        continue;
      }
      donoDoMembro.set(hit.membro_id, v.full_name);
      ligados.push({ id: v.id, nome: v.full_name, membro_id: hit.membro_id, por: hit.matched_by });
    }

    if (aplicar && ligados.length) {
      for (let i = 0; i < ligados.length; i += 25) {
        const lote = ligados.slice(i, i + 25);


        await Promise.all(lote.map(l => supabase.from('vol_profiles')
          .update({ membresia_id: l.membro_id }).eq('id', l.id).is('membresia_id', null)));
      }
    }




    res.json({
      aplicado: aplicar,
      proximo_cursor: proximoCursor(pagina, tamanho),


      total: count ?? null,
      analisados: perfis.length,
      ligados: ligados.length,
      conflitos: conflitos.length,
      sem_match: semMatch.length,
      por_chave: ligados.reduce((a, l) => { a[l.por] = (a[l.por] || 0) + 1; return a; }, {}),
      membros_ligados: ligados.map(l => l.membro_id),
      exemplos_ligados: ligados.slice(0, 8),
      exemplos_conflitos: conflitos.slice(0, 8),
      exemplos_sem_match: semMatch.slice(0, 8),
    });
  } catch (e) {
    console.error('[vincular-membros]', e.message);
    res.status(500).json({ error: 'Erro ao vincular voluntários a membros' });
  }
});


router.post('/allocate/:id', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { id } = req.params;
    const { team_id, position_id } = req.body;
    if (!team_id) return res.status(400).json({ error: 'team_id obrigatorio' });


    const { data: vol } = await supabase
      .from('vol_profiles')
      .select('id, full_name, planning_center_id')
      .eq('id', id)
      .maybeSingle();
    if (!vol) return res.status(404).json({ error: 'Voluntário não encontrado' });





    let qJa = supabase.from('vol_team_members')
      .select('id')
      .eq('team_id', team_id)
      .eq('volunteer_profile_id', id);



    qJa = position_id ? qJa.eq('position_id', position_id) : qJa.is('position_id', null);
    const { data: jaTem, error: jaErr } = await qJa.maybeSingle();
    if (jaErr) return res.status(400).json({ error: jaErr.message });
    if (!jaTem) {
      const { error: tmErr } = await supabase.from('vol_team_members').insert({
        volunteer_profile_id: id,
        team_id,
        position_id: position_id || null,
        volunteer_name: vol.full_name || 'Sem nome',
        planning_center_person_id: vol.planning_center_id || null,
      });
      if (tmErr) return res.status(400).json({ error: tmErr.message });
    }


    await supabase.from('vol_profiles').update({ allocation_status: 'active' }).eq('id', id);

    res.json({ success: true });
  } catch (e) {
    console.error('[ALLOCATE]', e.message);
    res.status(500).json({ error: 'Erro ao alocar voluntário' });
  }
});

















async function ultimaAtividadePorVoluntario() {
  const desde = new Date(Date.now() - atividadeVol.JANELA_LISTA_DIAS * 86400000).toISOString();
  const mapa = new Map();
  const guarda = (chave, iso) => {
    if (!chave || !iso) return;
    const atual = mapa.get(chave);
    if (!atual || iso > atual) mapa.set(chave, iso);
  };
  try {
    for (let pag = 0; pag < 20; pag += 1) {
      const { data, error } = await supabase.from('vol_check_ins')
        .select('volunteer_id, checked_in_at')
        .gte('checked_in_at', desde).not('volunteer_id', 'is', null)
        .range(pag * 1000, pag * 1000 + 999);
      if (error) throw error;
      for (const r of data || []) guarda(r.volunteer_id, r.checked_in_at);
      if (!data || data.length < 1000) break;
    }
    for (let pag = 0; pag < 20; pag += 1) {
      const { data, error } = await supabase.from('vol_servicos_historico')
        .select('vol_profile_id, data')
        .gte('data', desde.slice(0, 10)).is('deleted_at', null)
        .range(pag * 1000, pag * 1000 + 999);
      if (error) throw error;
      for (const r of data || []) guarda(r.vol_profile_id, r.data);
      if (!data || data.length < 1000) break;
    }
  } catch (e) {
    console.warn('[voluntariado] ultima atividade:', e.message);
    return null;
  }
  return mapa;
}

router.get('/volunteers-pool', async (req, res) => {
  try {


    const incluirArquivados = ['1', 'true'].includes(String(req.query.incluir_arquivados || ''));

    let all = []; let offset = 0;
    while (true) {
      let q = supabase
        .from('vol_profiles')
        .select(`
          id, full_name, email, avatar_url, planning_center_id, qr_code, phone, cpf, arquivado, membresia_id,
          membro:mem_membros(foto_url),
          team_members:vol_team_members(
            id, team_id, position_id, is_active, service_type_ids,
            team:vol_teams(id, name, color),
            position:vol_positions(id, name)
          )
        `)
        .order('full_name').range(offset, offset + 999);
      if (!incluirArquivados) q = q.eq('arquivado', false);
      const { data, error } = await q;
      if (error) return res.status(400).json({ error: error.message });
      if (!data || !data.length) break;
      all = all.concat(data);
      if (data.length < 1000) break;
      offset += 1000;
    }













    for (const v of all) v.foto_url = fotoDoPerfil(v);

    await anexarMarcadores(all, (p) => p.membresia_id || null, {
      incluirSensiveis: podeVerMarcadorSensivel(req.user),
    });



    const atividade = await ultimaAtividadePorVoluntario();
    for (const p of all) {
      if (!atividade) { p.atividade = null; continue; }
      const ultima = atividade.get(p.id) || null;
      const dias = atividadeVol.diasDesde(ultima);
      const { nivel, label } = atividadeVol.nivelPorDias(dias);
      p.atividade = { nivel, label, dias_desde: dias, ultima_atividade: ultima };
    }

    res.json(all);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar pool de voluntários' }); }
});





async function attachScheduledCount(services) {
  if (!services || services.length === 0) return services || [];
  const ids = services.map(s => s.id);
  try {
    const { data: counts } = await supabase
      .from('vol_schedules')
      .select('service_id')
      .in('service_id', ids);
    const countMap = (counts || []).reduce((acc, r) => {
      acc[r.service_id] = (acc[r.service_id] || 0) + 1;
      return acc;
    }, {});
    return services.map(s => ({ ...s, scheduled_count: countMap[s.id] || 0 }));
  } catch {
    return services.map(s => ({ ...s, scheduled_count: 0 }));
  }
}

router.get('/services', async (req, res) => {
  try {
    const { data, error } = await supabase.from('vol_services').select('*').order('scheduled_at', { ascending: true });
    if (error) return res.status(400).json({ error: error.message });
    res.json(await attachScheduledCount(data));
  } catch (e) { res.status(500).json({ error: 'Erro ao listar cultos' }); }
});

router.get('/services/upcoming', async (req, res) => {
  try {
    const { data, error } = await supabase.from('vol_services').select('*')
      .gte('scheduled_at', new Date().toISOString()).order('scheduled_at').limit(10);
    if (error) return res.status(400).json({ error: error.message });
    res.json(await attachScheduledCount(data));
  } catch (e) { res.status(500).json({ error: 'Erro ao listar próximos cultos' }); }
});

router.get('/services/today', async (req, res) => {
  try {

    const nowBRT = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const y = nowBRT.getUTCFullYear();
    const m = String(nowBRT.getUTCMonth() + 1).padStart(2, '0');
    const d = String(nowBRT.getUTCDate()).padStart(2, '0');
    const start = `${y}-${m}-${d}T00:00:00-03:00`;
    const end = `${y}-${m}-${d}T23:59:59-03:00`;
    const { data, error } = await supabase.from('vol_services').select('*')
      .gte('scheduled_at', start).lte('scheduled_at', end).order('scheduled_at');
    if (error) return res.status(400).json({ error: error.message });
    res.json(await attachScheduledCount(data));
  } catch (e) { res.status(500).json({ error: 'Erro ao listar cultos de hoje' }); }
});





router.get('/services/checkin-window', async (req, res) => {
  try {
    const back = Math.min(Math.max(Number(req.query.back) || 21, 0), 120);
    const ahead = Math.min(Math.max(Number(req.query.ahead) || 35, 1), 120);
    const from = new Date(Date.now() - back * 864e5).toISOString();
    const to = new Date(Date.now() + ahead * 864e5).toISOString();
    const { data, error } = await supabase.from('vol_services').select('*')
      .gte('scheduled_at', from).lte('scheduled_at', to).order('scheduled_at');
    if (error) return res.status(400).json({ error: error.message });
    res.json(await attachScheduledCount(data));
  } catch (e) { res.status(500).json({ error: 'Erro ao listar cultos do período' }); }
});







router.get('/relatorio-dados', async (req, res) => {
  try {
    const { desde, ate } = req.query;
    if (!desde || !ate) return res.status(400).json({ error: 'desde e ate são obrigatórios (YYYY-MM-DD)' });

    const { data: services, error: eSvc } = await supabase
      .from('vol_services').select('*')
      .gte('scheduled_at', `${desde}T00:00:00-03:00`)
      .lte('scheduled_at', `${ate}T23:59:59-03:00`)
      .order('scheduled_at', { ascending: false })
      .limit(500);
    if (eSvc) throw eSvc;

    const ids = (services || []).map(s => s.id);
    const schedules = [];
    const checkIns = [];
    for (let i = 0; i < ids.length; i += 50) {
      const lote = ids.slice(i, i + 50);
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from('vol_schedules')
          .select('*').in('service_id', lote).order('id').range(from, from + 999);
        if (error) throw error;
        schedules.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from('vol_check_ins')
          .select('*, volunteer:vol_profiles(id, full_name, planning_center_id), schedule:vol_schedules(id, volunteer_name, volunteer_id, team_name, position_name), service:vol_services(id, name, scheduled_at)')
          .in('service_id', lote).order('id').range(from, from + 999);
        if (error) throw error;
        checkIns.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
    }

    res.json({ services: services || [], schedules, checkIns });
  } catch (e) {
    console.error('[vol/relatorio-dados]', e.message);
    res.status(500).json({ error: 'Erro ao carregar os dados do relatório' });
  }
});

router.get('/schedules', async (req, res) => {
  try {
    const { service_id, volunteer_id } = req.query;
    let q = supabase.from('vol_schedules').select('*, service:vol_services(*)').order('team_name');
    if (service_id) q = q.eq('service_id', service_id);
    if (volunteer_id) q = q.eq('volunteer_id', volunteer_id);
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });


    const scheduleIds = data.map(s => s.id);
    let checkIns = [];
    if (scheduleIds.length > 0) {
      const { data: ci } = await supabase.from('vol_check_ins').select('*').in('schedule_id', scheduleIds);
      checkIns = ci || [];
    }
    const result = data.map(s => ({ ...s, check_in: checkIns.find(c => c.schedule_id === s.id) || null }));
    res.json(result);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar escalas' }); }
});




router.get('/check-ins', async (req, res) => {
  try {
    const { service_id, volunteer_id, is_unscheduled } = req.query;
    let q = supabase.from('vol_check_ins').select('*, volunteer:vol_profiles(id, full_name, planning_center_id), schedule:vol_schedules(id, volunteer_name, volunteer_id, team_name, position_name), service:vol_services(id, name, scheduled_at)')
      .order('checked_in_at', { ascending: false });
    if (service_id) q = q.eq('service_id', service_id);
    if (volunteer_id) q = q.eq('volunteer_id', volunteer_id);
    if (is_unscheduled === 'true') q = q.eq('is_unscheduled', true);
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar check-ins' }); }
});

router.post('/check-ins', async (req, res) => {
  try {
    const { schedule_id, volunteer_id, service_id, method, is_unscheduled, checked_in_at, novo_cadastro, volunteer_name } = req.body;
    if (!method) return res.status(400).json({ error: 'method obrigatorio' });
    const nomeDigitado = (volunteer_name || '').trim().slice(0, 120) || null;
















    const JANELA_RETROATIVA_MS = 60 * 24 * 60 * 60 * 1000;
    let checkedInAt = null;
    let dataAjustada = false;
    if (checked_in_at) {
      const t = new Date(checked_in_at);
      const ms = t.getTime();
      const now = Date.now();
      if (!Number.isNaN(ms) && ms <= now + 5 * 60 * 1000 && ms >= now - JANELA_RETROATIVA_MS) {
        checkedInAt = t.toISOString();
      } else {
        dataAjustada = true;
      }
    }








    const norm = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const dateSP = (iso) => { try { return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); } catch { return (iso || '').slice(0, 10); } };
    const periodoSP = (iso) => { try { const h = Number(new Date(iso).toLocaleString('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).slice(0, 2)); return h < 14 ? 'manha' : 'noite'; } catch { return 'noite'; } };

    let resolvedScheduleId = schedule_id || null;
    let resolvedUnscheduled = is_unscheduled;
    let resolvedVolunteerId = volunteer_id || null;








    if (service_id) {
      const { data: ciSvc } = await supabase.from('vol_services').select('scheduled_at').eq('id', service_id).maybeSingle();
      const ciDate = ciSvc?.scheduled_at ? dateSP(ciSvc.scheduled_at) : null;
      const ciPer = ciSvc?.scheduled_at ? periodoSP(ciSvc.scheduled_at) : null;

      if (ciDate) {
        const { data: svcsDia } = await supabase.from('vol_services')
          .select('id, scheduled_at')
          .gte('scheduled_at', `${ciDate}T00:00:00-03:00`).lt('scheduled_at', `${ciDate}T23:59:59-03:00`);
        const idsDia = (svcsDia || []).map(s => s.id);
        const idsBloco = (svcsDia || []).filter(s => periodoSP(s.scheduled_at) === ciPer).map(s => s.id);


        if (volunteer_id && idsBloco.length) {
          const { data: jaTem } = await supabase.from('vol_check_ins')
            .select('id, checked_in_at, method, volunteer:vol_profiles(full_name), schedule:vol_schedules(volunteer_name)')
            .eq('volunteer_id', volunteer_id).in('service_id', idsBloco)
            .order('checked_in_at', { ascending: true }).limit(1);
          if (jaTem && jaTem[0]) {
            const ex = jaTem[0];
            return res.status(409).json({
              error: 'Check-in j\u00e1 foi realizado', alreadyCheckedIn: true,
              volunteerName: ex.volunteer?.full_name || ex.schedule?.volunteer_name || null,
              checkedInAt: ex.checked_in_at, method: ex.method,
            });
          }
        }


        if (!resolvedScheduleId && idsDia.length) {
          let vp = null;
          if (volunteer_id) ({ data: vp } = await supabase.from('vol_profiles').select('planning_center_id, full_name').eq('id', volunteer_id).maybeSingle());
          const vpName = norm(vp?.full_name);
          const { data: scheds } = await supabase.from('vol_schedules')
            .select('id, volunteer_id, planning_center_person_id, volunteer_name, service_id').in('service_id', idsDia);
          const casa = (s) => (
            (volunteer_id && s.volunteer_id && s.volunteer_id === volunteer_id) ||
            (vp?.planning_center_id && s.planning_center_person_id && s.planning_center_person_id === vp.planning_center_id) ||
            (vpName && norm(s.volunteer_name) === vpName) ||

            (nomeDigitado && norm(s.volunteer_name) === norm(nomeDigitado))
          );
          const match = (scheds || []).filter(s => idsBloco.includes(s.service_id)).find(casa) || (scheds || []).find(casa);
          if (match) {
            resolvedScheduleId = match.id;
            resolvedUnscheduled = false;
            if (!resolvedVolunteerId && match.volunteer_id) resolvedVolunteerId = match.volunteer_id;
          } else if (resolvedUnscheduled === undefined) {
            resolvedUnscheduled = true;
          }
        }
      }
    }



    if (!resolvedVolunteerId && nomeDigitado) {
      const { data: cands } = await supabase.from('vol_profiles')
        .select('id, full_name')
        .eq('arquivado', false)
        .ilike('full_name', nomeDigitado);
      const exatos = (cands || []).filter(p => norm(p.full_name) === norm(nomeDigitado));
      if (exatos.length === 1) resolvedVolunteerId = exatos[0].id;
    }






    if (!resolvedVolunteerId && !resolvedScheduleId && !nomeDigitado) {
      return res.status(400).json({
        error: 'O sistema foi atualizado: recarregue a página (F5 ou Ctrl+R) e refaça o check-in — agora o nome do voluntário fica registrado.',
      });
    }

    const { data, error } = await supabase.from('vol_check_ins')
      .insert({
        schedule_id: resolvedScheduleId,
        volunteer_id: resolvedVolunteerId,
        service_id: service_id || null,
        checked_in_by: req.user.userId,
        method,
        is_unscheduled: resolvedUnscheduled || false,

        ...(nomeDigitado ? { volunteer_name: nomeDigitado } : {}),
        ...(checkedInAt ? { checked_in_at: checkedInAt } : {}),
      }).select().single();


    if (error) {
      if (error.code === '23505') {

        let volunteerName = null;
        let checkedInAt = null;
        let existingMethod = null;
        try {
          let existing = null;
          if (resolvedScheduleId) {
            const r = await supabase.from('vol_check_ins')
              .select('checked_in_at, method, volunteer:vol_profiles(full_name), schedule:vol_schedules(volunteer_name)')
              .eq('schedule_id', resolvedScheduleId).maybeSingle();
            existing = r.data;
            volunteerName = existing?.volunteer?.full_name || existing?.schedule?.volunteer_name || null;
          } else if (volunteer_id && service_id) {
            const r = await supabase.from('vol_check_ins')
              .select('checked_in_at, method, volunteer:vol_profiles(full_name)')
              .eq('volunteer_id', volunteer_id).eq('service_id', service_id)
              .eq('is_unscheduled', true).limit(1);
            existing = r.data?.[0] || null;
            volunteerName = existing?.volunteer?.full_name || null;
          }
          checkedInAt = existing?.checked_in_at || null;
          existingMethod = existing?.method || null;

          if (!volunteerName && volunteer_id) {
            const { data: v } = await supabase.from('vol_profiles').select('full_name').eq('id', volunteer_id).maybeSingle();
            volunteerName = v?.full_name || null;
          }
        } catch {}
        return res.status(409).json({
          error: 'Check-in já foi realizado',
          alreadyCheckedIn: true,
          volunteerName,
          checkedInAt,
          method: existingMethod,
        });
      }
      return res.status(400).json({ error: error.message });
    }



    if (resolvedScheduleId) {
      await supabase.from('vol_schedules')
        .update({ confirmation_status: 'confirmed' }).eq('id', resolvedScheduleId).eq('confirmation_status', 'pending');
    }







    let needsCpf = false;
    let faltando = [];
    let volProfileName = null;


    if (!resolvedVolunteerId && (resolvedScheduleId || schedule_id)) {
      const { data: sch } = await supabase.from('vol_schedules')
        .select('volunteer_id').eq('id', resolvedScheduleId || schedule_id).maybeSingle();
      resolvedVolunteerId = sch?.volunteer_id || null;
    }
    if (resolvedVolunteerId) {
      const r = await faltaDoVoluntario(resolvedVolunteerId);
      faltando = r.faltando;




      needsCpf = faltando.includes('cpf');
      volProfileName = r.nome;
    }




    if (novo_cadastro && resolvedVolunteerId) {
      notificar({
        modulo: 'voluntariado', tipo: 'vol_checkin_novo_sem_escala',
        titulo: 'Novo voluntário cadastrado no totem',
        mensagem: `${volProfileName || 'Voluntário'} foi cadastrado no totem e marcado presente sem escala. Revise o cadastro (dados, possível duplicado).`,
        link: '/voluntariado', severidade: 'aviso',
        chaveDedup: `vol_novo_totem_${resolvedVolunteerId}_${service_id || ''}`,
      }).catch((e) => console.warn('[checkin novo notify]', e.message));
    }

    res.json({
      ...data,
      isUnscheduled: !!resolvedUnscheduled,
      volunteer_id: resolvedVolunteerId,
      volunteer_name: volProfileName || nomeDigitado || null,
      needs_cpf: needsCpf,
      missing_fields: faltando,




      data_ajustada: dataAjustada,
    });
  } catch (e) { res.status(500).json({ error: 'Erro ao registrar check-in' }); }
});






router.post('/check-ins/rematch', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const dateSP = (iso) => { try { return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); } catch { return (iso || '').slice(0, 10); } };

    const { data: cis } = await supabase.from('vol_check_ins')
      .select('id, volunteer_id, service_id, schedule_id, is_unscheduled, volunteer:vol_profiles(planning_center_id, full_name), service:vol_services(scheduled_at)')
      .or('is_unscheduled.eq.true,schedule_id.is.null')
      .not('service_id', 'is', null)
      .limit(5000);


    const schedTaken = new Set();
    const { data: usados } = await supabase.from('vol_check_ins').select('schedule_id').eq('is_unscheduled', false).not('schedule_id', 'is', null).limit(20000);
    (usados || []).forEach(u => u.schedule_id && schedTaken.add(u.schedule_id));

    const porData = new Map();
    for (const ci of cis || []) {
      const d = ci.service?.scheduled_at ? dateSP(ci.service.scheduled_at) : null;
      if (!d) continue;
      if (!porData.has(d)) porData.set(d, []);
      porData.get(d).push(ci);
    }

    let religados = 0, semMatch = 0;
    for (const [d, lista] of porData) {
      const { data: svcsDia } = await supabase.from('vol_services').select('id, scheduled_at')
        .gte('scheduled_at', `${d}T00:00:00-03:00`).lt('scheduled_at', `${d}T23:59:59-03:00`);
      const idsDia = (svcsDia || []).map(s => s.id);
      if (!idsDia.length) { semMatch += lista.length; continue; }
      const { data: scheds } = await supabase.from('vol_schedules')
        .select('id, volunteer_id, planning_center_person_id, volunteer_name, service_id').in('service_id', idsDia);
      for (const ci of lista) {
        const vpName = norm(ci.volunteer?.full_name);
        const pcid = ci.volunteer?.planning_center_id;
        const match = (scheds || []).find(s => !schedTaken.has(s.id) && (
          (ci.volunteer_id && s.volunteer_id && s.volunteer_id === ci.volunteer_id) ||
          (pcid && s.planning_center_person_id && s.planning_center_person_id === pcid) ||
          (vpName && norm(s.volunteer_name) === vpName)
        ));
        if (!match) { semMatch++; continue; }
        const upd = { is_unscheduled: false, schedule_id: match.id };
        if (!ci.volunteer_id && match.volunteer_id) upd.volunteer_id = match.volunteer_id;
        const { error } = await supabase.from('vol_check_ins').update(upd).eq('id', ci.id);
        if (error) { semMatch++; continue; }
        schedTaken.add(match.id);
        religados++;
      }
    }
    res.json({ ok: true, analisados: (cis || []).length, religados, sem_match: semMatch });
  } catch (e) {
    console.error('[vol checkin rematch]', e.message);
    res.status(500).json({ error: e.message || 'Erro no rematch' });
  }
});






router.post('/services/limpar-vazios', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { data: alvos } = await supabase.from('vol_services').select('id').not('service_type_id', 'is', null).limit(5000);
    const ids = [];
    for (const s of alvos || []) {
      const [{ count: ne }, { count: nc }] = await Promise.all([
        supabase.from('vol_schedules').select('id', { count: 'exact', head: true }).eq('service_id', s.id),
        supabase.from('vol_check_ins').select('id', { count: 'exact', head: true }).eq('service_id', s.id),
      ]);
      if (!ne && !nc) ids.push(s.id);
    }
    if (req.query.dry === '1') return res.json({ ok: true, dry: true, vazios: ids.length });
    let apagados = 0;
    for (let i = 0; i < ids.length; i += 200) {
      const lote = ids.slice(i, i + 200);

      await supabase.from('vol_availability').delete().in('service_id', lote);
      const { error } = await supabase.from('vol_services').delete().in('id', lote);
      if (!error) apagados += lote.length;
    }
    res.json({ ok: true, apagados });
  } catch (e) {
    console.error('[vol limpar-vazios]', e.message);
    res.status(500).json({ error: e.message || 'Erro ao limpar serviços vazios' });
  }
});



async function ensureServiceDoTipo(typeId, dateStr) {
  const ini = `${dateStr}T00:00:00-03:00`, fim = `${dateStr}T23:59:59-03:00`;
  const { data: ex } = await supabase.from('vol_services').select('id')
    .eq('service_type_id', typeId).gte('scheduled_at', ini).lte('scheduled_at', fim).limit(1);
  if (ex && ex[0]) return ex[0].id;
  const { data: t } = await supabase.from('vol_service_types').select('name, recurrence_time').eq('id', typeId).maybeSingle();
  if (!t) return null;
  const hhmm = String(t.recurrence_time || '08:00').slice(0, 5);
  const { data: svc } = await supabase.from('vol_services')
    .insert({ name: t.name, service_type_name: t.name, service_type_id: typeId, scheduled_at: `${dateStr}T${hhmm}:00-03:00` })
    .select('id').single();
  return svc?.id || null;
}



router.get('/cultos-manha', async (req, res) => {
  try {






    const dia = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.dia || ''))
      ? String(req.query.dia)
      : diaBRT(new Date().toISOString());
    const { data } = await supabase.from('vol_service_types')
      .select('id, name, recurrence_time, is_active, vigente_de, vigente_ate')
      .eq('recurrence_day', 0).eq('is_active', true).lt('recurrence_time', '14:00:00')
      .order('recurrence_time');
    res.json(filtrarVigentes(data || [], dia)
      .map(t => ({ id: t.id, name: t.name, recurrence_time: t.recurrence_time })));
  } catch (e) { res.status(500).json({ error: 'Erro ao listar cultos da manhã' }); }
});










async function faltaDoVoluntario(volunteerId) {
  if (!volunteerId) return { faltando: [], nome: null };
  const { data: vp } = await supabase.from('vol_profiles')
    .select('full_name, cpf, phone, email, membresia_id').eq('id', volunteerId).maybeSingle();
  if (!vp) return { faltando: [], nome: null };
  let membro = null;
  if (vp.membresia_id) {
    const { data: m } = await supabase.from('mem_membros')
      .select('nome, cpf, telefone, email, data_nascimento, genero')
      .eq('id', vp.membresia_id).maybeSingle();
    membro = m || null;
  }
  return { faltando: faltandoNoCadastro(vp, membro), nome: vp.full_name || membro?.nome || null };
}





router.post('/check-ins/manha', async (req, res) => {
  try {
    const { volunteer_id, service_date, service_type_ids, method, checked_in_at } = req.body || {};
    if (!method || !service_date || !Array.isArray(service_type_ids) || !service_type_ids.length) {
      return res.status(400).json({ error: 'volunteer_id, service_date, service_type_ids[] e method obrigatórios' });
    }
    let checkedInAt = null;
    if (checked_in_at) { const t = new Date(checked_in_at); if (!Number.isNaN(t.getTime())) { const now = Date.now(); if (t.getTime() <= now + 3e5 && t.getTime() >= now - 7 * 864e5) checkedInAt = t.toISOString(); } }


    const svcIds = [];
    for (const tid of service_type_ids) { const id = await ensureServiceDoTipo(tid, service_date); if (id) svcIds.push(id); }
    if (!svcIds.length) return res.status(400).json({ error: 'Nenhum culto válido' });


    const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    let resolvedScheduleId = null, resolvedVolunteerId = volunteer_id || null;
    if (volunteer_id) {
      const { data: svcsDia } = await supabase.from('vol_services').select('id')
        .gte('scheduled_at', `${service_date}T00:00:00-03:00`).lt('scheduled_at', `${service_date}T23:59:59-03:00`);
      const idsDia = (svcsDia || []).map(s => s.id);
      const { data: vp } = await supabase.from('vol_profiles').select('planning_center_id, full_name').eq('id', volunteer_id).maybeSingle();
      const vpName = norm(vp?.full_name);
      if (idsDia.length) {
        const { data: scheds } = await supabase.from('vol_schedules')
          .select('id, volunteer_id, planning_center_person_id, volunteer_name').in('service_id', idsDia);
        const match = (scheds || []).find(s =>
          (s.volunteer_id && s.volunteer_id === volunteer_id) ||
          (vp?.planning_center_id && s.planning_center_person_id === vp.planning_center_id) ||
          (vpName && norm(s.volunteer_name) === vpName));
        if (match) { resolvedScheduleId = match.id; if (!resolvedVolunteerId && match.volunteer_id) resolvedVolunteerId = match.volunteer_id; }
      }
    }

    let criados = 0, jaTinha = 0;
    for (const svcId of svcIds) {
      const { data: ex } = await supabase.from('vol_check_ins').select('id')
        .eq('service_id', svcId).eq('volunteer_id', resolvedVolunteerId).limit(1);
      if (ex && ex[0]) { jaTinha++; continue; }
      const { error } = await supabase.from('vol_check_ins').insert({
        schedule_id: resolvedScheduleId, volunteer_id: resolvedVolunteerId, service_id: svcId,
        checked_in_by: req.user.userId, method, is_unscheduled: !resolvedScheduleId,
        ...(checkedInAt ? { checked_in_at: checkedInAt } : {}),
      });
      if (!error) criados++;
    }


    const falta = await faltaDoVoluntario(resolvedVolunteerId);
    res.json({
      ok: true, criados, ja_tinha: jaTinha, cultos: svcIds.length,
      volunteer_id: resolvedVolunteerId,
      volunteer_name: falta.nome,
      missing_fields: falta.faltando,
    });
  } catch (e) {
    console.error('[vol checkin manha]', e.message);
    res.status(500).json({ error: e.message || 'Erro no check-in da manhã' });
  }
});






























router.put('/profiles/:id/contact', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: perfil, error: fetchErr } = await supabase.from('vol_profiles')
      .select('id, auth_user_id, full_name, cpf, phone, email, membresia_id').eq('id', id).maybeSingle();
    if (fetchErr) return res.status(400).json({ error: fetchErr.message });
    if (!perfil) return res.status(404).json({ error: 'Voluntário não encontrado' });

    const ehDono = !!perfil.auth_user_id && perfil.auth_user_id === req.user.userId;
    const operaVoluntariado = (getEffectiveLevel(req, 'voluntariado') || 0) >= 1;
    if (!ehDono && !operaVoluntariado) {
      return res.status(403).json({ error: 'Sem permissão para completar o cadastro deste voluntário' });
    }

    const { erros, valores } = validarParcialCadastro(req.body);
    if (Object.keys(erros).length) {
      return res.status(400).json({ error: Object.values(erros)[0], erros });
    }


    if (!Object.keys(valores).length) {
      return res.json({ success: true, pulou: true, gravou: [], profile: perfil });
    }

    const semValor = (v) => v === null || v === undefined || String(v).trim() === '';






    let membresiaId = perfil.membresia_id || null;
    if (!membresiaId) {
      const cpfChave = valores.cpf || perfil.cpf || null;
      const emailChave = valores.email || perfil.email || null;
      const telChave = valores.telefone || perfil.phone || null;
      if (cpfChave || emailChave || telChave) {
        try {
          const r = await acharOuCriarGuardado({
            cpf: cpfChave, email: emailChave, telefone: telChave,
            nome: valores.nome || perfil.full_name || null,
            dataNascimento: valores.dataNascimento || null,
            genero: valores.genero || null,
            status: 'visitante', origem: 'voluntariado_checkin',
          });
          membresiaId = r?.membro_id || null;
        } catch (e) {



          console.error('[vol completar cadastro] matcher:', e.message);
        }
      }
    }









    let cpfNoMembro = null;
    if (membresiaId && valores.cpf) {
      try {
        cpfNoMembro = await reconciliarCpfTardio({
          membroId: membresiaId, cpf: valores.cpf,
          origem: 'vol_checkin', origemId: perfil.id,
          dataNascimento: valores.dataNascimento || null,
          confianca: 'fraca',
        });
      } catch (e) {
        console.error('[vol completar cadastro] cpf tardio:', e.message);
      }
    }


    if (membresiaId) {
      const { data: membro } = await supabase.from('mem_membros')
        .select('id, nome, telefone, email, data_nascimento, genero').eq('id', membresiaId).maybeSingle();
      if (membro) {
        const candidatos = {
          nome: valores.nome,
          telefone: valores.telefone,
          email: valores.email,
          data_nascimento: valores.dataNascimento,
          genero: valores.genero,
        };
        const patchMembro = {};
        for (const [coluna, valor] of Object.entries(candidatos)) {
          if (valor && semValor(membro[coluna])) patchMembro[coluna] = valor;
        }
        if (Object.keys(patchMembro).length) {
          patchMembro.updated_at = new Date().toISOString();
          const { error: mErr } = await supabase.from('mem_membros').update(patchMembro).eq('id', membresiaId);
          if (mErr) {
            const dup = /duplicate|unique|23505/i.test(mErr.message || '');
            return res.status(dup ? 409 : 400).json({
              error: dup ? 'Esse e-mail já pertence a outra pessoa na membresia.' : mErr.message,
            });
          }
          enqueueSync('membro', membresiaId, 'upsert').catch(() => {});
        }
      }
    }


    const patchPerfil = {};
    if (valores.nome) patchPerfil.full_name = valores.nome;
    if (valores.cpf) patchPerfil.cpf = valores.cpf;
    if (valores.telefone) patchPerfil.phone = valores.telefone;
    if (valores.email) patchPerfil.email = valores.email;
    if (membresiaId && membresiaId !== perfil.membresia_id) patchPerfil.membresia_id = membresiaId;

    let atualizado = perfil;
    if (Object.keys(patchPerfil).length) {
      const { data: upd, error } = await supabase.from('vol_profiles')
        .update(patchPerfil).eq('id', id)
        .select('id, full_name, cpf, phone, email, membresia_id').single();
      if (error) {
        const dup = /duplicate|unique|23505/i.test(error.message || '');
        return res.status(dup ? 409 : 400).json({
          error: dup ? 'Esse CPF ou e-mail já pertence a outro voluntário.' : error.message,
        });
      }
      atualizado = upd;
      enqueueSync('voluntario', id, 'upsert').catch(() => {});
    }




    let membroFinal = null;
    if (atualizado.membresia_id) {
      const { data: m } = await supabase.from('mem_membros')
        .select('nome, cpf, telefone, email, data_nascimento, genero')
        .eq('id', atualizado.membresia_id).maybeSingle();
      membroFinal = m || null;
    }

    res.json({
      success: true,
      profile: atualizado,
      gravou: Object.keys(valores),
      membresia_vinculada: !!atualizado.membresia_id,
      cpf_acao: cpfNoMembro?.acao || null,
      missing_fields: faltandoNoCadastro(atualizado, membroFinal),
    });
  } catch (e) {
    console.error('[Vol] completar cadastro no check-in:', e.message);
    res.status(500).json({ error: 'Erro ao completar o cadastro' });
  }
});


router.get('/my-check-ins', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { data: profile } = await supabase.from('vol_profiles')
      .select('id').eq('auth_user_id', userId).maybeSingle();
    if (!profile) return res.json([]);

    const { data, error } = await supabase.from('vol_check_ins')
      .select('id, checked_in_at, method, is_unscheduled, schedule_id, service:vol_services(id, name, scheduled_at)')
      .eq('volunteer_id', profile.id)
      .order('checked_in_at', { ascending: false })
      .limit(100);
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) {
    console.error('[Vol] my-check-ins error:', e.message);
    res.status(500).json({ error: 'Erro ao listar meus check-ins' });
  }
});




router.post('/qr-lookup', async (req, res) => {
  try {
    const { qr_code } = req.body;
    if (!qr_code) return res.status(400).json({ error: 'qr_code obrigatorio' });



    const resolucao = await resolverVoluntarioPorQr(qr_code, supabase);
    if (!resolucao.ok) return res.status(resolucao.statusCode).json({ error: resolucao.error });
    const volunteerData = resolucao.volunteerData;




    if (!volunteerData.id && !volunteerData.planning_center_id) {
      return res.json({
        profile: { id: null, planning_center_id: null, full_name: volunteerData.name, type: volunteerData.type },
        isUnscheduled: true, volunteerName: volunteerData.name,
      });
    }


    const nowBRT = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const by = nowBRT.getUTCFullYear();
    const bm = String(nowBRT.getUTCMonth() + 1).padStart(2, '0');
    const bd = String(nowBRT.getUTCDate()).padStart(2, '0');
    const startOfDay = `${by}-${bm}-${bd}T00:00:00-03:00`;
    const endOfDay = `${by}-${bm}-${bd}T23:59:59-03:00`;

    let scheduleQuery = supabase.from('vol_schedules').select('*, service:vol_services!inner(*)')
      .gte('service.scheduled_at', startOfDay).lt('service.scheduled_at', endOfDay);

    if (volunteerData.type === 'profile' && volunteerData.id) {
      scheduleQuery = scheduleQuery.or(`volunteer_id.eq.${volunteerData.id},planning_center_person_id.eq.${volunteerData.planning_center_id}`);
    } else if (volunteerData.planning_center_id) {
      scheduleQuery = scheduleQuery.eq('planning_center_person_id', volunteerData.planning_center_id);
    }

    const { data: schedules } = await scheduleQuery;

    const profileResult = { id: volunteerData.id, planning_center_id: volunteerData.planning_center_id, full_name: volunteerData.name, type: volunteerData.type };

    if (!schedules || schedules.length === 0) {
      return res.json({ profile: profileResult, isUnscheduled: true, volunteerName: volunteerData.name });
    }


    const { data: existingCIs } = await supabase.from('vol_check_ins').select('schedule_id').in('schedule_id', schedules.map(s => s.id));
    const unchecked = schedules.find(s => !(existingCIs || []).some(c => c.schedule_id === s.id));

    if (!unchecked) return res.status(409).json({ error: 'Voluntário já fez check-in em todas as escalas de hoje' });

    res.json({ schedule: unchecked, profile: profileResult, isUnscheduled: false, volunteerName: unchecked.volunteer_name });
  } catch (e) { console.error('[VOL] qr-lookup error:', e.message); res.status(500).json({ error: 'Erro ao buscar QR' }); }
});




router.get('/volunteer-qrcodes', async (req, res) => {
  try {
    const { data, error } = await supabase.from('vol_volunteer_qrcodes').select('*').order('volunteer_name');
    if (error) return res.status(400).json({ error: error.message });

    const { data: profiles } = await supabase.from('vol_profiles').select('id, full_name, qr_code, avatar_url, planning_center_id, face_descriptor').not('qr_code', 'is', null);
    res.json({ qrcodes: data, profiles: profiles || [] });
  } catch (e) { res.status(500).json({ error: 'Erro ao listar QR codes' }); }
});


router.post('/volunteer-qrcodes', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { planning_center_person_id, volunteer_name, avatar_url } = req.body;
    if (!planning_center_person_id || !volunteer_name) return res.status(400).json({ error: 'Campos obrigatorios' });
    const { data, error } = await supabase.from('vol_volunteer_qrcodes')
      .upsert({ planning_center_person_id, volunteer_name, avatar_url: avatar_url || null },
        { onConflict: 'planning_center_person_id', ignoreDuplicates: false }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar QR code' }); }
});





router.post('/face/save-profile', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { profile_id, descriptor, photo_url } = req.body;
    if (!profile_id || !descriptor) return res.status(400).json({ error: 'profile_id e descriptor obrigatórios' });
    const { data, error } = await supabase.rpc('vol_save_profile_face_descriptor', {
      p_profile_id: profile_id, descriptor, photo_url: photo_url || null,
    });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao salvar face descriptor' }); }
});


router.post('/face/save-qrcode', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { qrcode_id, descriptor, photo_url } = req.body;
    if (!qrcode_id || !descriptor) return res.status(400).json({ error: 'qrcode_id e descriptor obrigatórios' });
    const { data, error } = await supabase.rpc('vol_save_qrcode_face_descriptor', {
      qrcode_id, descriptor, photo_url: photo_url || null,
    });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao salvar face descriptor' }); }
});

router.post('/face/match', async (req, res) => {
  try {
    const { descriptor, threshold } = req.body;
    if (!descriptor) return res.status(400).json({ error: 'descriptor obrigatorio' });
    const { data, error } = await supabase.rpc('vol_find_face_match', {
      query_descriptor: `[${descriptor.join(',')}]`, match_threshold: threshold || 0.6,
    });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar face match' }); }
});




router.post('/self-checkin', async (req, res) => {
  try {
    const { serviceId, action, scheduleId, volunteerName, planningCenterId } = req.body;
    if (!serviceId) return res.status(400).json({ error: 'serviceId obrigatorio' });

    const { data: service } = await supabase.from('vol_services').select('id, name, scheduled_at').eq('id', serviceId).single();
    if (!service) return res.status(404).json({ error: 'Culto não encontrado' });





    const ymdBR = (d) => new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d);
    if (ymdBR(new Date(service.scheduled_at)) !== ymdBR(new Date())) {
      return res.status(400).json({ error: 'Este culto não e de hoje' });
    }


    if (action === 'list') {
      const { data: schedules } = await supabase.from('vol_schedules')
        .select('id, volunteer_name, team_name, position_name, planning_center_person_id')
        .eq('service_id', serviceId).order('volunteer_name');
      const { data: checkIns } = await supabase.from('vol_check_ins').select('schedule_id').eq('service_id', serviceId);
      const checkedIds = new Set((checkIns || []).map(c => c.schedule_id));
      const result = (schedules || []).map(s => ({ ...s, has_checkin: checkedIds.has(s.id) }));
      return res.json({ serviceName: service.name, schedules: result });
    }


    if (scheduleId) {
      const { data: existing } = await supabase.from('vol_check_ins').select('id').eq('schedule_id', scheduleId).maybeSingle();
      if (existing) return res.status(409).json({ error: 'Check-in já realizado', alreadyCheckedIn: true });

      const { data: schedule } = await supabase.from('vol_schedules')
        .select('id, volunteer_id, volunteer_name, team_name, position_name').eq('id', scheduleId).single();
      if (!schedule) return res.status(404).json({ error: 'Escala não encontrada' });

      const { error } = await supabase.from('vol_check_ins').insert({
        schedule_id: scheduleId, volunteer_id: schedule.volunteer_id, service_id: serviceId, method: 'self_service', is_unscheduled: false,
      });
      if (error) { if (error.code === '23505') return res.status(409).json({ error: 'Check-in já realizado', alreadyCheckedIn: true }); throw error; }

      await supabase.from('vol_schedules').update({ confirmation_status: 'confirmed' }).eq('id', scheduleId).eq('confirmation_status', 'pending');
      return res.json({ success: true, volunteerName: schedule.volunteer_name, teamName: schedule.team_name, positionName: schedule.position_name });
    }


    if (!volunteerName) return res.status(400).json({ error: 'volunteerName obrigatório para check-in sem escala' });
    let volunteerId = null;
    if (planningCenterId) {
      const { data: prof } = await supabase.from('vol_profiles').select('id').eq('planning_center_id', planningCenterId).maybeSingle();
      if (prof) volunteerId = prof.id;
    }
    const { error } = await supabase.from('vol_check_ins').insert({
      volunteer_id: volunteerId, service_id: serviceId, method: 'self_service', is_unscheduled: true,
    });
    if (error) throw error;
    res.json({ success: true, volunteerName, isUnscheduled: true });
  } catch (e) { console.error('[VOL] self-checkin error:', e.message); res.status(500).json({ error: 'Erro no self-checkin' }); }
});




router.get('/sync-logs', async (req, res) => {
  try {
    const { data, error } = await supabase.from('vol_sync_logs').select('*').order('created_at', { ascending: false }).limit(20);
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar sync logs' }); }
});




router.get('/training-checkins', async (req, res) => {
  try {
    const { service_id } = req.query;
    let q = supabase.from('vol_training_checkins').select('*').order('created_at', { ascending: false });
    if (service_id) q = q.eq('service_id', service_id);
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar training checkins' }); }
});


router.post('/training-checkins', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { service_id, volunteer_name, team_name, phone } = req.body;
    if (!volunteer_name || !team_name) return res.status(400).json({ error: 'volunteer_name e team_name obrigatórios' });
    const { data, error } = await supabase.from('vol_training_checkins')
      .insert({ service_id: service_id || null, volunteer_name, team_name, phone: phone || null, registered_by: req.user.userId }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao registrar training checkin' }); }
});







router.get('/team/:teamId/members', async (req, res) => {
  try {
    const { teamId } = req.params;
    const yearMonth = req.query.year_month || new Date().toISOString().slice(0, 7);
    const inicio = `${yearMonth}-01`;
    const [y, m] = yearMonth.split('-').map(Number);
    const fim = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);


    const { data: members, error: e1 } = await supabase
      .from('vol_team_members')


      .select('id, volunteer_profile_id, volunteer_name, position_id, service_type_ids, position:vol_positions(id, name)')
      .eq('team_id', teamId);
    if (e1) return res.status(400).json({ error: e1.message });

    const profileIds = [...new Set((members || []).map(m => m.volunteer_profile_id).filter(Boolean))];


    const profilesMap = {};
    if (profileIds.length) {
      const { data: profiles } = await supabase
        .from('vol_profiles')
        .select('id, full_name, email, phone, allocation_status, profile_complete')
        .in('id', profileIds);
      for (const p of (profiles || [])) profilesMap[p.id] = p;
    }


    let oneOnOneMap = {};
    if (profileIds.length) {
      const { data: meetings } = await supabase
        .from('vol_1x1_meetings')
        .select('id, volunteer_profile_id, meeting_date, observacoes, registered_by, created_at')
        .eq('team_id', teamId)
        .gte('meeting_date', inicio)
        .lt('meeting_date', fim);
      for (const meeting of (meetings || [])) {
        oneOnOneMap[meeting.volunteer_profile_id] = meeting;
      }
    }

    const result = (members || []).map(m => ({
      ...m,
      profile: profilesMap[m.volunteer_profile_id] || null,
      meeting_1x1: oneOnOneMap[m.volunteer_profile_id] || null,
    }));

    res.json({ year_month: yearMonth, total: result.length, members: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});



router.post('/1x1', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { volunteer_profile_id, team_id, meeting_date, observacoes } = req.body;
    if (!volunteer_profile_id || !team_id) {
      return res.status(400).json({ error: 'volunteer_profile_id e team_id obrigatórios' });
    }
    const date = meeting_date || new Date().toISOString().slice(0, 10);



    const ym = date.slice(0, 7);
    const inicio = `${ym}-01`;
    const [y, m] = ym.split('-').map(Number);
    const fim = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);

    await supabase
      .from('vol_1x1_meetings')
      .delete()
      .eq('volunteer_profile_id', volunteer_profile_id)
      .eq('team_id', team_id)
      .gte('meeting_date', inicio)
      .lt('meeting_date', fim);

    const { data, error } = await supabase
      .from('vol_1x1_meetings')
      .insert({
        volunteer_profile_id,
        team_id,
        meeting_date: date,
        observacoes: observacoes || null,
        registered_by: req.user?.userId || req.user?.id || null,
      })
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});



router.delete('/1x1/:id', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { error } = await supabase.from('vol_1x1_meetings').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});




router.get('/teams', async (req, res) => {
  try {
    const { data, error } = await supabase.from('vol_schedules').select('team_name').not('team_name', 'is', null);
    if (error) return res.status(400).json({ error: error.message });
    const teams = new Set();
    (data || []).forEach(s => {
      if (s.team_name) s.team_name.split(',').forEach(t => { const trimmed = t.trim(); if (trimmed) teams.add(trimmed); });
    });
    res.json([...teams].sort());
  } catch (e) { res.status(500).json({ error: 'Erro ao listar equipes' }); }
});





router.post('/pc/search-people', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { query } = req.body;
    if (!query || query.trim().length < 2) return res.status(400).json({ error: 'Query minimo 2 caracteres' });
    const appId = process.env.PLANNING_CENTER_APP_ID;
    const secret = process.env.PLANNING_CENTER_SECRET;
    if (!appId || !secret) return res.status(500).json({ error: 'Planning Center não configurado' });
    const auth = Buffer.from(`${appId}:${secret}`).toString('base64');
    const url = `https://api.planningcenteronline.com/people/v2/people?where[search_name_or_email]=${encodeURIComponent(query.trim())}&per_page=10`;
    const response = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
    if (!response.ok) return res.status(response.status).json({ error: 'Falha ao buscar no Planning Center' });
    const data = await response.json();
    const people = (data.data || []).map(p => ({
      id: p.id, full_name: `${p.attributes.first_name || ''} ${p.attributes.last_name || ''}`.trim(),
      first_name: p.attributes.first_name || '', last_name: p.attributes.last_name || '', avatar_url: p.attributes.avatar || null,
    }));
    res.json({ people });
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar no PC' }); }
});


router.post('/pc/get-person', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { person_id } = req.body;
    if (!person_id) return res.status(400).json({ error: 'person_id obrigatorio' });
    const appId = process.env.PLANNING_CENTER_APP_ID;
    const secret = process.env.PLANNING_CENTER_SECRET;
    if (!appId || !secret) return res.status(500).json({ error: 'Planning Center não configurado' });
    const auth = Buffer.from(`${appId}:${secret}`).toString('base64');
    const response = await fetch(`https://api.planningcenteronline.com/people/v2/people/${person_id}`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!response.ok) return res.status(response.status).json({ error: 'Falha ao buscar pessoa' });
    const data = await response.json();
    const p = data.data;
    res.json({ person: { id: p.id, full_name: `${p.attributes.first_name || ''} ${p.attributes.last_name || ''}`.trim(), avatar_url: p.attributes.avatar || null } });
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar pessoa no PC' }); }
});




router.get('/service-types', async (req, res) => {
  try {
    const { data, error } = await supabase.from('vol_service_types').select('*').order('name');
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar tipos de culto' }); }
});















router.post('/service-types', authorizeModule('voluntariado', 5), async (req, res) => {
  try {
    const { name, description, recurrence_day, recurrence_time, color } = req.body;
    if (!name) return res.status(400).json({ error: 'name obrigatorio' });
    const flags = normalizarFlagsTipoCulto(req.body, { modo: 'criar' });
    if (!flags.ok) return res.status(400).json({ error: flags.erro, campo: flags.campo });
    const { data, error } = await supabase.from('vol_service_types')
      .insert({ name, description, recurrence_day, recurrence_time, color, ...flags.patch })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar tipo de culto' }); }
});





router.put('/service-types/:id', authorizeModule('voluntariado', 5), async (req, res) => {
  try {
    const { name, description, recurrence_day, recurrence_time, color, is_active } = req.body;
    const flags = normalizarFlagsTipoCulto(req.body, { modo: 'atualizar' });
    if (!flags.ok) return res.status(400).json({ error: flags.erro, campo: flags.campo });
    const { data, error } = await supabase.from('vol_service_types')
      .update({ name, description, recurrence_day, recurrence_time, color, is_active, ...flags.patch })
      .eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar tipo de culto' }); }
});

router.delete('/service-types/:id', authorizeModule('voluntariado', 5), async (req, res) => {
  try {





    const { count, error: cErr } = await supabase.from('cultos')
      .select('id', { count: 'exact', head: true })
      .eq('service_type_id', req.params.id);
    if (cErr) return res.status(500).json({ error: 'Não deu pra conferir os cultos vinculados — exclusão bloqueada por segurança.' });
    if ((count || 0) > 0) {
      return res.status(409).json({ error: `Este tipo tem ${count} culto(s) vinculado(s). Encerre o tipo (desativar) em vez de excluir — excluir apagaria roteiro de produção e escalas em cascata.` });
    }
    const { error } = await supabase.from('vol_service_types').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover tipo de culto' }); }
});



router.post('/service-types/:id/generate', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { weeks, year } = req.body;

    const { data: sType, error: stErr } = await supabase.from('vol_service_types')
      .select('*').eq('id', req.params.id).single();
    if (stErr || !sType) return res.status(404).json({ error: 'Tipo de culto não encontrado' });
    if (sType.recurrence_day == null || !sType.recurrence_time) {
      return res.status(400).json({ error: 'Tipo de culto sem recorrencia configurada' });
    }

    const [hours, minutes] = sType.recurrence_time.split(':').map(Number);
    const pad = (n) => String(n).padStart(2, '0');


    const toBRTISO = (y, m0, d) =>
      `${y}-${pad(m0 + 1)}-${pad(d)}T${pad(hours)}:${pad(minutes)}:00-03:00`;
    const dayStartBRT = (y, m0, d) => `${y}-${pad(m0 + 1)}-${pad(d)}T00:00:00-03:00`;
    const dayEndBRT = (y, m0, d) => new Date(Date.UTC(y, m0, d + 1)).toISOString().slice(0, 10) + 'T00:00:00-03:00';


    let pcoAtivo = true;
    try {
      const { data: cfg } = await supabase.from('vol_config').select('pco_ativo').eq('id', 1).maybeSingle();
      if (cfg && cfg.pco_ativo === false) pcoAtivo = false;
    } catch (e) {
      console.error('[vol generate] leitura de pco_ativo:', e.message);
    }

    const generated = [];

    const makeIfAbsent = async (y, m0, d) => {
      const scheduledAt = toBRTISO(y, m0, d);
      const { data: existing } = await supabase.from('vol_services')
        .select('id, service_type_id, planning_center_id')
        .gte('scheduled_at', dayStartBRT(y, m0, d))
        .lt('scheduled_at', dayEndBRT(y, m0, d));




      if (!podeGerarCulto({ servicosDoDia: existing || [], serviceTypeId: sType.id, pcoAtivo }).pode) return;
      const { data: svc, error: svcErr } = await supabase.from('vol_services')
        .insert({ name: sType.name, service_type_name: sType.name, service_type_id: sType.id, scheduled_at: scheduledAt })
        .select().single();
      if (!svcErr && svc) generated.push(svc);
    };

    if (year) {


      let cursor = new Date(Date.UTC(year, 0, 1));
      while (cursor.getUTCDay() !== sType.recurrence_day) {
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      const endMs = Date.UTC(year, 11, 31);
      while (cursor.getTime() <= endMs) {
        await makeIfAbsent(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate());
        cursor.setUTCDate(cursor.getUTCDate() + 7);
      }
    } else {

      const weeksAhead = weeks || 4;

      const brtNow = new Date(Date.now() - 3 * 60 * 60 * 1000);
      let cursor = new Date(Date.UTC(brtNow.getUTCFullYear(), brtNow.getUTCMonth(), brtNow.getUTCDate()));
      const delta = (sType.recurrence_day - cursor.getUTCDay() + 7) % 7;
      cursor.setUTCDate(cursor.getUTCDate() + delta);
      for (let w = 0; w < weeksAhead; w++) {
        await makeIfAbsent(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate());
        cursor.setUTCDate(cursor.getUTCDate() + 7);
      }
    }

    res.json({ generated: generated.length, services: generated });
  } catch (e) { res.status(500).json({ error: 'Erro ao gerar cultos' }); }
});





router.post('/services', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { name, service_type_name, service_type_id, scheduled_at, forcar } = req.body;
    if (!name || !scheduled_at) return res.status(400).json({ error: 'name e scheduled_at obrigatórios' });





    if (!forcar) {
      const d = new Date(scheduled_at);
      if (!Number.isNaN(d.getTime())) {
        const dia = d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
        const { data: doDia } = await supabase.from('vol_services')
          .select('name')
          .not('planning_center_id', 'is', null)
          .gte('scheduled_at', `${dia}T00:00:00-03:00`)
          .lt('scheduled_at', `${dia}T23:59:59-03:00`)
          .limit(5);
        if (doDia?.length) {
          return res.status(409).json({
            error: `Este dia já tem culto(s) do Planning Center com a escala: ${doDia.map(s => s.name).join(', ')}. ` +
              'Use esse culto pro check-in — criar outro separa as presenças da escala. ' +
              'Se realmente precisar de um culto extra neste dia, envie forcar=true.',
          });
        }
      }
    }

    const { data, error } = await supabase.from('vol_services')
      .insert({ name, service_type_name, service_type_id, scheduled_at }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar culto' }); }
});


router.put('/services/:id', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { name, service_type_name, scheduled_at } = req.body;
    const { data, error } = await supabase.from('vol_services')
      .update({ name, service_type_name, scheduled_at }).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar culto' }); }
});


router.delete('/services/:id', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { error } = await supabase.from('vol_services').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover culto' }); }
});




router.get('/teams-manage', async (req, res) => {
  try {
    const { data, error } = await supabase.from('vol_teams')
      .select('*, leader:vol_profiles!vol_teams_leader_profile_id_fkey(id, full_name, avatar_url), positions:vol_positions(*), members:vol_team_members!team_id(id)')
      .order('sort_order').order('name');
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar equipes' }); }
});


router.post('/teams-manage', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { name, description, color, leader_profile_id, sort_order, area, split_por_horario } = req.body;
    if (!name) return res.status(400).json({ error: 'name obrigatorio' });
    const { data, error } = await supabase.from('vol_teams')



      .insert({ name, description, color, leader_profile_id, sort_order: sort_order || 0, area: area || null, split_por_horario: split_por_horario === true }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar equipe' }); }
});


router.put('/teams-manage/:id', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { name, description, color, leader_profile_id, is_active, sort_order, area, split_por_horario } = req.body;



    const patch = { name, description, color, leader_profile_id, is_active, sort_order, area };
    if (split_por_horario !== undefined) patch.split_por_horario = split_por_horario === true;
    const { data, error } = await supabase.from('vol_teams')
      .update(patch)
      .eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar equipe' }); }
});


router.delete('/teams-manage/:id', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { error } = await supabase.from('vol_teams').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover equipe' }); }
});




router.get('/positions', async (req, res) => {
  try {
    const { team_id } = req.query;
    let q = supabase.from('vol_positions').select('*, team:vol_teams(id, name)').order('sort_order').order('name');
    if (team_id) q = q.eq('team_id', team_id);
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar posições' }); }
});


router.post('/positions', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { team_id, name, description, min_volunteers, max_volunteers, sort_order } = req.body;
    if (!team_id || !name) return res.status(400).json({ error: 'team_id e name obrigatórios' });
    const { data, error } = await supabase.from('vol_positions')
      .insert({ team_id, name, description, min_volunteers, max_volunteers, sort_order: sort_order || 0 }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar posição' }); }
});


router.put('/positions/:id', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { name, description, min_volunteers, max_volunteers, is_active, sort_order } = req.body;
    const { data, error } = await supabase.from('vol_positions')
      .update({ name, description, min_volunteers, max_volunteers, is_active, sort_order })
      .eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar posição' }); }
});


router.delete('/positions/:id', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { error } = await supabase.from('vol_positions').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover posição' }); }
});




router.get('/team-members', async (req, res) => {
  try {
    const { team_id } = req.query;


    const montar = (comPref) => {
      let q = supabase.from('vol_team_members')
        .select(`*, team:vol_teams(id, name, color), position:vol_positions(id, name), profile:vol_profiles(id, full_name, avatar_url, planning_center_id${comPref ? ', rodizio_semana' : ''})`)
        .eq('is_active', true).order('volunteer_name');
      if (team_id) q = q.eq('team_id', team_id);
      return q;
    };
    let r = await montar(true);
    if (r.error && r.error.code === '42703') r = await montar(false);
    if (r.error) return res.status(400).json({ error: r.error.message });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar membros da equipe' }); }
});


router.post('/team-members', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { team_id, position_id, volunteer_profile_id, planning_center_person_id, volunteer_name } = req.body;
    if (!team_id || !volunteer_name) return res.status(400).json({ error: 'team_id e volunteer_name obrigatórios' });
    if (!volunteer_profile_id && !planning_center_person_id) {
      return res.status(400).json({ error: 'volunteer_profile_id ou planning_center_person_id obrigatório' });
    }
    const { data, error } = await supabase.from('vol_team_members')
      .insert({ team_id, position_id, volunteer_profile_id, planning_center_person_id, volunteer_name })
      .select().single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Voluntário já esta nesta equipe' });
      return res.status(400).json({ error: error.message });
    }
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao adicionar membro a equipe' }); }
});


router.put('/team-members/:id', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { position_id, is_active, service_type_ids, rodizio_semana } = req.body;













    if (rodizio_semana !== undefined) {
      const sem = (rodizio_semana === null || rodizio_semana === '') ? null : Number(rodizio_semana);
      if (sem !== null && !(Number.isInteger(sem) && sem >= 1 && sem <= 4)) {
        return res.status(400).json({ error: 'Semana inválida: 1 a 4, ou vazio pra nenhuma.' });
      }
      const { data: v } = await supabase.from('vol_team_members')
        .select('volunteer_profile_id').eq('id', req.params.id).maybeSingle();
      if (!v) return res.status(404).json({ error: 'Vínculo não encontrado' });
      if (!v.volunteer_profile_id) return res.status(400).json({ error: 'Este vínculo não tem perfil de voluntário — só dá pra guardar preferência de quem tem cadastro.' });
      const { error: ePref } = await supabase.from('vol_profiles').update({ rodizio_semana: sem }).eq('id', v.volunteer_profile_id);
      if (ePref) {
        if (ePref.code === '42703') return res.status(503).json({ error: 'A preferência de semana ainda não foi liberada no banco (migration 20260924120100).' });
        return res.status(400).json({ error: ePref.message });
      }
    }
    if (service_type_ids !== undefined) {
      const lista = Array.isArray(service_type_ids)
        ? [...new Set(service_type_ids.filter(Boolean).map(String))]
        : [];



      const valor = lista.length ? lista : null;

      const { data: alvo } = await supabase.from('vol_team_members')
        .select('team_id, volunteer_profile_id, planning_center_person_id')
        .eq('id', req.params.id).maybeSingle();
      if (!alvo) return res.status(404).json({ error: 'Vínculo não encontrado' });

      let q = supabase.from('vol_team_members')
        .update({ service_type_ids: valor })
        .eq('team_id', alvo.team_id);



      if (alvo.volunteer_profile_id) q = q.eq('volunteer_profile_id', alvo.volunteer_profile_id);
      else if (alvo.planning_center_person_id) q = q.eq('planning_center_person_id', alvo.planning_center_person_id);
      else q = q.eq('id', req.params.id);

      const { error: eEleg } = await q;
      if (eEleg) return res.status(400).json({ error: eEleg.message });
    }



    if (position_id === undefined && is_active === undefined) {

      const { data: atual, error: eGet } = await supabase.from('vol_team_members')
        .select('*').eq('id', req.params.id).single();
      if (eGet) return res.status(400).json({ error: eGet.message });
      return res.json(atual);
    }

    const { data, error } = await supabase.from('vol_team_members')
      .update({ position_id, is_active }).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar membro' }); }
});


router.delete('/team-members/:id', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { error } = await supabase.from('vol_team_members').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover membro da equipe' }); }
});






router.get('/services-availability', async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from e to obrigatórios' });

    const { data: services, error: svcErr } = await supabase
      .from('vol_services')
      .select('id, name, service_type_name, scheduled_at')
      .not('service_type_id', 'is', null)
      .gte('scheduled_at', `${from}T00:00:00`)
      .lte('scheduled_at', `${to}T23:59:59`)
      .order('scheduled_at');
    if (svcErr) return res.status(400).json({ error: svcErr.message });

    if (!services || services.length === 0) return res.json([]);

    const serviceIds = services.map(s => s.id);


    const { data: unavail } = await supabase
      .from('vol_availability')
      .select('service_id, volunteer_profile_id, vol_profiles(full_name, avatar_url)')
      .in('service_id', serviceIds)
      .not('service_id', 'is', null);
















    const { data: porPeriodo } = await supabase
      .from('vol_availability')
      .select('unavailable_from, unavailable_to, reason, volunteer_profile_id, vol_profiles(full_name, avatar_url)')
      .is('service_id', null)


      .lte('unavailable_from', to)
      .gte('unavailable_to', from);


    const unavailByService = new Map();
    const jaListado = new Map();
    const push = (serviceId, item) => {
      if (!unavailByService.has(serviceId)) {
        unavailByService.set(serviceId, []);
        jaListado.set(serviceId, new Set());
      }

      if (item.profile_id) {
        if (jaListado.get(serviceId).has(item.profile_id)) return;
        jaListado.get(serviceId).add(item.profile_id);
      }
      unavailByService.get(serviceId).push(item);
    };

    for (const u of (unavail || [])) {
      push(u.service_id, {
        profile_id: u.volunteer_profile_id,
        name: u.vol_profiles?.full_name || 'Voluntario',
        avatar_url: u.vol_profiles?.avatar_url || null,
        origem: 'culto',
      });
    }


    for (const s of services) {
      const dia = String(s.scheduled_at).slice(0, 10);
      for (const u of (porPeriodo || [])) {
        if (u.unavailable_from <= dia && dia <= u.unavailable_to) {
          push(s.id, {
            profile_id: u.volunteer_profile_id,
            name: u.vol_profiles?.full_name || 'Voluntario',
            avatar_url: u.vol_profiles?.avatar_url || null,
            origem: 'periodo',


            motivo: u.reason || null,
            periodo: { de: u.unavailable_from, ate: u.unavailable_to },
          });
        }
      }
    }

    res.json(services.map(s => ({
      ...s,
      unavailable: unavailByService.get(s.id) || [],
    })));
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar disponibilidade dos cultos' }); }
});

router.get('/availability', async (req, res) => {
  try {
    const { volunteer_profile_id, from, to } = req.query;
    let q = supabase.from('vol_availability').select('*').order('unavailable_from');
    if (volunteer_profile_id) q = q.eq('volunteer_profile_id', volunteer_profile_id);
    if (from) q = q.gte('unavailable_to', from);
    if (to) q = q.lte('unavailable_from', to);
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar disponibilidade' }); }
});


router.post('/availability', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { volunteer_profile_id, planning_center_person_id, unavailable_from, unavailable_to, reason } = req.body;
    if (!unavailable_from || !unavailable_to) return res.status(400).json({ error: 'Datas obrigatorias' });
    if (!volunteer_profile_id && !planning_center_person_id) {
      return res.status(400).json({ error: 'volunteer_profile_id ou planning_center_person_id obrigatório' });
    }
    const { data, error } = await supabase.from('vol_availability')
      .insert({ volunteer_profile_id, planning_center_person_id, unavailable_from, unavailable_to, reason })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao registrar indisponibilidade' }); }
});


router.delete('/availability/:id', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { error } = await supabase.from('vol_availability').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover indisponibilidade' }); }
});


















async function _bloqueioPorIndisponibilidade({ service_id, volunteer_id, planning_center_person_id }) {
  if (!service_id || (!volunteer_id && !planning_center_person_id)) return null;

  const { data: svc, error: sErr } = await supabase
    .from('vol_services').select('id, scheduled_at').eq('id', service_id).maybeSingle();





  if (sErr) { console.error('[voluntariado] disponibilidade não conferida:', sErr.message); return null; }
  if (!svc) return null;

  let q = supabase.from('vol_availability')
    .select('service_id, unavailable_from, unavailable_to, reason, volunteer_profile_id, planning_center_person_id');
  q = volunteer_id
    ? q.eq('volunteer_profile_id', volunteer_id)
    : q.eq('planning_center_person_id', planning_center_person_id);
  const { data: linhas, error: aErr } = await q;
  if (aErr) { console.error('[voluntariado] disponibilidade não conferida:', aErr.message); return null; }

  const v = avaliarIndisponibilidade(
    { serviceId: service_id, dia: diaBRT(svc.scheduled_at) },
    linhas || [],
  );
  return v.indisponivel ? v : null;
}











async function _separarPorDisponibilidade(service_id, pessoas) {
  const lista = pessoas || [];
  if (!lista.length) return { ok: [], pulados: [] };

  const { data: svc, error: sErr } = await supabase
    .from('vol_services').select('id, scheduled_at').eq('id', service_id).maybeSingle();


  if (sErr || !svc) {
    if (sErr) console.error('[voluntariado] disponibilidade do lote não conferida:', sErr.message);
    return { ok: lista, pulados: [] };
  }

  const { data: linhas, error: aErr } = await supabase.from('vol_availability')
    .select('service_id, unavailable_from, unavailable_to, reason, volunteer_profile_id, planning_center_person_id');
  if (aErr) {
    console.error('[voluntariado] disponibilidade do lote não conferida:', aErr.message);
    return { ok: lista, pulados: [] };
  }

  const idx = indexarPorPessoa(linhas || []);
  const ctx = { serviceId: service_id, dia: diaBRT(svc.scheduled_at) };
  const ok = [];
  const pulados = [];
  for (const p of lista) {
    const eventos = [
      ...(idx.get(p.volunteer_id) || []),
      ...(idx.get(p.planning_center_person_id) || []),
    ];
    const v = avaliarIndisponibilidade(ctx, eventos);
    if (v.indisponivel) pulados.push({ nome: p.volunteer_name || 'Voluntário', motivo: textoIndisponibilidade(v) });
    else ok.push(p);
  }
  return { ok, pulados };
}


router.post('/schedules', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { service_id, volunteer_id, volunteer_name, team_id, team_name, position_id, position_name, planning_center_person_id, notes, forcar } = req.body;
    if (!service_id || !volunteer_name) return res.status(400).json({ error: 'service_id e volunteer_name obrigatórios' });

    if (!forcar) {
      const bloqueio = await _bloqueioPorIndisponibilidade({ service_id, volunteer_id, planning_center_person_id });
      if (bloqueio) {
        return res.status(409).json({
          error: `${volunteer_name} ${textoIndisponibilidade(bloqueio)}.`,
          codigo: 'indisponivel',
          origem: bloqueio.origem,
          motivo: bloqueio.motivo,
        });
      }
    }

    const { data, error } = await supabase.from('vol_schedules')
      .insert({
        service_id,
        volunteer_id: volunteer_id || null,
        volunteer_name,
        team_id: team_id || null,
        team_name: team_name || null,
        position_id: position_id || null,
        position_name: position_name || null,
        planning_center_person_id: planning_center_person_id || null,
        confirmation_status: 'pending',
        source: 'manual',
        notes: notes || null,
      }).select().single();

    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Voluntário já escalado neste culto' });
      return res.status(400).json({ error: error.message });
    }
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar escala' }); }
});



router.put('/schedules/:id', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { team_id, team_name, position_id, position_name, confirmation_status, notes } = req.body;
    const updates = {};
    if (team_id !== undefined) updates.team_id = team_id;
    if (team_name !== undefined) updates.team_name = team_name;
    if (position_id !== undefined) updates.position_id = position_id;
    if (position_name !== undefined) updates.position_name = position_name;
    if (confirmation_status !== undefined) updates.confirmation_status = confirmation_status;
    if (notes !== undefined) updates.notes = notes;

    const { data, error } = await supabase.from('vol_schedules')
      .update(updates).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar escala' }); }
});



router.delete('/schedules/:id', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { error } = await supabase.from('vol_schedules').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover escala' }); }
});







router.post('/schedules/bulk', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { service_id, assignments, forcar } = req.body;
    if (!service_id || !Array.isArray(assignments) || !assignments.length) {
      return res.status(400).json({ error: 'service_id e assignments[] obrigatórios' });
    }

    let entrando = assignments;
    let pulados = [];
    if (!forcar) {
      const sep = await _separarPorDisponibilidade(service_id, assignments);
      entrando = sep.ok;
      pulados = sep.pulados;
    }
    if (!entrando.length) {
      return res.status(409).json({
        error: 'Ninguém do lote está disponível neste culto.',
        codigo: 'indisponivel', pulados,
      });
    }

    const rows = entrando.map(a => ({
      service_id,
      volunteer_id: a.volunteer_id || null,
      volunteer_name: a.volunteer_name,
      team_id: a.team_id || null,
      team_name: a.team_name || null,
      position_id: a.position_id || null,
      position_name: a.position_name || null,




      escala_culto_item_id: a.escala_culto_item_id || null,
      planning_center_person_id: a.planning_center_person_id || null,
      confirmation_status: 'pending',
      source: a.source || 'manual',
      notes: a.notes || null,
    }));

    const { data, error } = await supabase.from('vol_schedules')



      .upsert(rows, { onConflict: 'service_id,planning_center_person_id,team_name,position_name,slot_seq', ignoreDuplicates: true })
      .select();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ created: data.length, schedules: data, pulados });
  } catch (e) { res.status(500).json({ error: 'Erro ao criar escalas em lote' }); }
});













router.post('/schedules/desfazer-lote', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { service_id, ids } = req.body;
    if (!service_id || !Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ error: 'service_id e ids[] obrigatórios' });
    }
    if (ids.length > 200) return res.status(400).json({ error: 'Máximo de 200 por vez' });

    const { data, error } = await supabase.from('vol_schedules')
      .delete().eq('service_id', service_id).in('id', ids).select('id');
    if (error) return res.status(400).json({ error: error.message });
    res.json({ removidas: (data || []).length });
  } catch (e) { res.status(500).json({ error: 'Erro ao desfazer' }); }
});



router.post('/schedules/copy', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { from_service_id, to_service_id } = req.body;
    if (!from_service_id || !to_service_id) {
      return res.status(400).json({ error: 'from_service_id e to_service_id obrigatórios' });
    }

    const { data: source } = await supabase.from('vol_schedules')
      .select('*').eq('service_id', from_service_id);
    if (!source || !source.length) return res.status(404).json({ error: 'Nenhuma escala encontrada no culto de origem' });






    const { data: svcDestino } = await supabase.from('vol_services')
      .select('id, scheduled_at').eq('id', to_service_id).maybeSingle();
    const diaDestino = diaBRT(svcDestino?.scheduled_at);
    const idsOrigem = [...new Set(source.flatMap(s => [s.volunteer_id, s.planning_center_person_id]).filter(Boolean))];
    let idxIndispon = new Map();
    if (idsOrigem.length) {
      const linhas = [];
      for (let i = 0; i < idsOrigem.length; i += 200) {
        const bloco = idsOrigem.slice(i, i + 200);
        const [{ data: a }, { data: b }] = await Promise.all([
          supabase.from('vol_availability')
            .select('service_id, unavailable_from, unavailable_to, reason, volunteer_profile_id, planning_center_person_id')
            .in('volunteer_profile_id', bloco),
          supabase.from('vol_availability')
            .select('service_id, unavailable_from, unavailable_to, reason, volunteer_profile_id, planning_center_person_id')
            .in('planning_center_person_id', bloco),
        ]);
        linhas.push(...(a || []), ...(b || []));
      }
      idxIndispon = indexarPorPessoa(linhas);
    }
    const indispon = (s) => [s.volunteer_id, s.planning_center_person_id].filter(Boolean).some((id) =>
      avaliarIndisponibilidade({ serviceId: to_service_id, dia: diaDestino }, idxIndispon.get(id) || []).indisponivel);

    const pulados = source.filter(indispon).map(s => s.volunteer_name).filter(Boolean);
    const copiaveis = source.filter(s => !indispon(s));
    if (!copiaveis.length) {
      return res.status(409).json({
        error: 'Ninguém do culto de origem está disponível neste culto.',
        codigo: 'todos_indisponiveis', pulados,
      });
    }

    const rows = copiaveis.map(s => ({
      service_id: to_service_id,
      volunteer_id: s.volunteer_id,
      volunteer_name: s.volunteer_name,
      team_id: s.team_id,
      team_name: s.team_name,
      position_id: s.position_id,
      position_name: s.position_name,
      planning_center_person_id: s.planning_center_person_id,
      confirmation_status: 'pending',
      source: 'manual',
    }));

    const { data, error } = await supabase.from('vol_schedules')
      .insert(rows).select();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ copied: data.length, schedules: data, pulados });
  } catch (e) { res.status(500).json({ error: 'Erro ao copiar escalas' }); }
});























router.post('/schedules/auto-fill', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { service_id, team_id, team_ids } = req.body;
    if (!service_id) return res.status(400).json({ error: 'service_id obrigatório' });
    const filtroTeams = Array.isArray(team_ids) && team_ids.length
      ? team_ids
      : (team_id ? [team_id] : null);

    const { data: service } = await supabase.from('vol_services')
      .select('id, scheduled_at').eq('id', service_id).single();
    if (!service) return res.status(404).json({ error: 'Culto não encontrado' });
    const dia = diaBRT(service.scheduled_at);


    const { itens } = await _coberturaDoCulto(service_id);
    const vagas = itens
      .filter(i => !filtroTeams || filtroTeams.includes(i.team_id))
      .filter(i => i.faltam > 0);

    if (!itens.length) {



      return res.status(409).json({
        codigo: 'sem_composicao',
        error: 'Este culto ainda não tem composição definida. Aplique um template de escala primeiro — é ele que diz quantas vagas cada área tem.',
      });
    }
    if (!vagas.length) {
      return res.json({ created: 0, schedule_ids: [], detalhe: [], sem_candidato: [], mensagem: 'Todas as vagas já estão preenchidas.' });
    }


    const teamIds = [...new Set(vagas.map(v => v.team_id).filter(Boolean))];
    let membros = [];
    for (let i = 0; i < teamIds.length; i += 50) {
      const lote = teamIds.slice(i, i + 50);
      let offset = 0;
      for (;;) {
        const { data, error } = await supabase.from('vol_team_members')
          .select('id, team_id, position_id, volunteer_profile_id, planning_center_person_id, volunteer_name')
          .in('team_id', lote).eq('is_active', true)
          .order('id').range(offset, offset + 999);
        if (error) return res.status(400).json({ error: error.message });
        membros = membros.concat(data || []);
        if (!data || data.length < 1000) break;
        offset += 1000;
      }
    }
    if (!membros.length) {
      return res.status(409).json({ codigo: 'sem_membros', error: 'Nenhuma das áreas com vaga tem membros cadastrados.' });
    }


    const [{ data: unavail }, { data: escalasEste }, { data: outrosDia }] = await Promise.all([
      supabase.from('vol_availability')
        .select('service_id, unavailable_from, unavailable_to, reason, volunteer_profile_id, planning_center_person_id'),
      supabase.from('vol_schedules').select('volunteer_id, planning_center_person_id').eq('service_id', service_id),
      supabase.from('vol_services').select('id')
        .gte('scheduled_at', `${dia}T00:00:00-03:00`).lte('scheduled_at', `${dia}T23:59:59-03:00`)
        .neq('id', service_id),
    ]);

    const indisponIdx = indexarPorPessoa(unavail || []);
    const ctxIndispon = { serviceId: service_id, dia };
    const jaAqui = new Set();
    for (const s of escalasEste || []) { if (s.volunteer_id) jaAqui.add(s.volunteer_id); if (s.planning_center_person_id) jaAqui.add(s.planning_center_person_id); }

    const conflito = new Set();
    const idsOutros = (outrosDia || []).map(o => o.id);
    if (idsOutros.length) {
      const { data: escOutros } = await supabase.from('vol_schedules')
        .select('volunteer_id, planning_center_person_id').in('service_id', idsOutros);
      for (const s of escOutros || []) { if (s.volunteer_id) conflito.add(s.volunteer_id); if (s.planning_center_person_id) conflito.add(s.planning_center_person_id); }
    }


    const chavesAlvo = new Set();
    for (const m of membros) { if (m.volunteer_profile_id) chavesAlvo.add(m.volunteer_profile_id); if (m.planning_center_person_id) chavesAlvo.add(m.planning_center_person_id); }
    const rodizio = await _ultimaEscalaPorPessoa({ antesISO: service.scheduled_at, chavesAlvo });


    const porPessoa = new Map();
    for (const m of membros) {
      const chave = m.volunteer_profile_id || m.planning_center_person_id;
      if (!chave) continue;


      if (!ehPessoaEscalavel(m.volunteer_name)) continue;
      if (!porPessoa.has(chave)) {
        const eventos = [
          ...(indisponIdx.get(m.volunteer_profile_id) || []),
          ...(indisponIdx.get(m.planning_center_person_id) || []),
        ];
        const ultimas = [rodizio.mapa.get(m.volunteer_profile_id), rodizio.mapa.get(m.planning_center_person_id)].filter(Boolean);
        const ultima = ultimas.length ? ultimas.sort().pop() : null;
        porPessoa.set(chave, {
          id: chave,
          nome: m.volunteer_name,
          volunteer_id: m.volunteer_profile_id || null,
          planning_center_person_id: m.planning_center_person_id || null,
          indisponivel: avaliarIndisponibilidade(ctxIndispon, eventos).indisponivel,
          jaEscalado: jaAqui.has(m.volunteer_profile_id) || jaAqui.has(m.planning_center_person_id),
          conflito: conflito.has(m.volunteer_profile_id) || conflito.has(m.planning_center_person_id),
          semanas: semanasSemServir(ultima, service.scheduled_at),
          equipes: [],
        });
      }
      porPessoa.get(chave).equipes.push({ team_id: m.team_id, position_id: m.position_id || null });
    }

    const { atribuicoes, vagasSemCandidato } = distribuirVagas({
      vagas, candidatos: [...porPessoa.values()],
    });

    if (!atribuicoes.length) {
      return res.json({
        created: 0, schedule_ids: [], detalhe: [],
        sem_candidato: vagasSemCandidato.map(v => ({ equipe: v.team, funcao: v.position, restantes: v.restantes })),
        mensagem: 'Ninguém disponível para as vagas em aberto.',
      });
    }

    const rows = atribuicoes.map(({ vaga, candidato }) => ({
      service_id,
      volunteer_id: candidato.volunteer_id,
      volunteer_name: candidato.nome,
      team_id: vaga.team_id,
      team_name: vaga.team || null,
      position_id: vaga.position_id || null,
      position_name: vaga.position || null,
      escala_culto_item_id: vaga.id,
      planning_center_person_id: candidato.planning_center_person_id,
      confirmation_status: 'pending',
      source: 'auto_rotation',
    }));

    const { data: created, error } = await supabase.from('vol_schedules').insert(rows).select();
    if (error) return res.status(400).json({ error: error.message });

    res.json({
      created: created.length,


      schedule_ids: created.map(c => c.id),
      detalhe: atribuicoes.map(({ vaga, candidato }) => ({
        equipe: vaga.team, funcao: vaga.position, nome: candidato.nome,
        rotulo: rotuloTempoSemServir(candidato.semanas),
      })),
      sem_candidato: vagasSemCandidato.map(v => ({ equipe: v.team, funcao: v.position, restantes: v.restantes })),
    });
  } catch (e) { res.status(500).json({ error: 'Erro ao auto-preencher escala' }); }
});



router.post('/teams-manage/import-from-schedules', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const teamNames = new Set();


    try {
      const { basic: credentials } = getPCCredentials();
      const serviceTypes = await fetchAllServiceTypes(credentials);

      for (const st of serviceTypes) {
        const teamsRes = await fetchWithRetry(
          `${PC_SERVICES_BASE}/service_types/${st.id}/teams?per_page=100`,
          { Authorization: `Basic ${credentials}` }
        );
        for (const team of (teamsRes?.data || [])) {
          const name = team.attributes?.name;
          if (name) teamNames.add(name.trim());
        }
      }
    } catch (pcoErr) {
      console.warn('[import-teams] PCO indisponivel, usando vol_schedules:', pcoErr.message);
    }


    const { data: schedData } = await supabase.from('vol_schedules')
      .select('team_name').not('team_name', 'is', null);
    (schedData || []).forEach(s => {
      if (s.team_name) s.team_name.split(',').forEach(t => { const trimmed = t.trim(); if (trimmed) teamNames.add(trimmed); });
    });







    const { data: mapa, error: mapaErr } = await supabase.from('vol_pco_mapa').select('pco_chave');
    if (mapaErr) return res.status(400).json({ error: mapaErr.message });
    const conhecidas = new Set((mapa || []).map(m => m.pco_chave));
    const pendentes = [...teamNames].filter(n => !conhecidas.has(chavePco(n))).sort();

    res.json({
      conferidos: teamNames.size,
      pendentes,


      imported: 0,
      teams: [],
    });
  } catch (e) { res.status(500).json({ error: 'Erro ao importar equipes' }); }
});



router.post('/teams-manage/sync-members-from-schedules', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const result = await syncTeamMembersFromSchedules(supabase);
    res.json(result);
  } catch (e) {
    console.error('[sync-members]', e.message);
    res.status(500).json({ error: 'Erro ao sincronizar membros de equipe' });
  }
});












router.get('/teams-manage/pendencias-pco', async (req, res) => {
  try {




    const contagem = new Map();
    let offset = 0;
    for (;;) {
      const { data, error } = await supabase.from('vol_schedules')
        .select('team_name').not('team_name', 'is', null)
        .order('id').range(offset, offset + 999);
      if (error) return res.status(400).json({ error: error.message });
      if (!data || !data.length) break;
      for (const s of data) {
        for (const parte of String(s.team_name).split(',')) {
          const nome = parte.trim();
          if (nome) contagem.set(nome, (contagem.get(nome) || 0) + 1);
        }
      }
      if (data.length < 1000) break;
      offset += 1000;
    }

    const { data: mapa, error: mapaErr } = await supabase.from('vol_pco_mapa').select('pco_chave');
    if (mapaErr) return res.status(400).json({ error: mapaErr.message });
    const conhecidas = new Set((mapa || []).map(m => m.pco_chave));

    const pendentes = [...contagem.entries()]
      .filter(([nome]) => !conhecidas.has(chavePco(nome)))
      .map(([nome, escalas]) => ({ nome, escalas }))
      .sort((a, b) => b.escalas - a.escalas);

    res.json({ pendentes, total: pendentes.length });
  } catch (e) {
    console.error('[pendencias-pco]', e.message);
    res.status(500).json({ error: 'Erro ao listar pendências do Planning Center' });
  }
});

router.get('/teams-manage/mapa-pco', async (req, res) => {
  try {
    const { data, error } = await supabase.from('vol_pco_mapa')
      .select('id, pco_nome, pco_chave, ignorar, observacao, team:vol_teams(id, name), position:vol_positions(id, name)')
      .order('pco_nome');
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar o de-para do Planning Center' }); }
});





router.post('/teams-manage/mapa-pco', authorizeModule('voluntariado', 3), async (req, res) => {
  try {
    const { pco_nome, team_id, position_id, ignorar, observacao } = req.body || {};
    if (!pco_nome) return res.status(400).json({ error: 'pco_nome obrigatorio' });



    if (!team_id && !ignorar) {
      return res.status(400).json({ error: 'Escolha a equipe de destino ou marque para ignorar' });
    }
    const { data, error } = await supabase.from('vol_pco_mapa')
      .upsert({
        pco_nome,
        pco_chave: chavePco(pco_nome),
        team_id: ignorar ? null : team_id,
        position_id: ignorar ? null : (position_id || null),
        ignorar: !!ignorar,
        observacao: observacao || null,
      }, { onConflict: 'pco_chave' })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) {
    console.error('[mapa-pco]', e.message);
    res.status(500).json({ error: 'Erro ao gravar o de-para' });
  }
});





router.get('/inscricoes-summary', async (req, res) => {
  try {
    const ano = req.query.ano ? String(req.query.ano) : null;
    const area = req.query.area ? String(req.query.area).toLowerCase() : null;





    const data = [];
    const PAGINA = 1000;
    for (let inicio = 0; ; inicio += PAGINA) {
      let query = supabase
        .from('vol_inscricoes')
        .select('data_inscricao, status, area')
        .is('deleted_at', null)
        .order('data_inscricao', { ascending: false })
        .order('id', { ascending: false })
        .range(inicio, inicio + PAGINA - 1);
      if (ano) {
        query = query
          .gte('data_inscricao', `${ano}-01-01`)
          .lt('data_inscricao', `${Number(ano) + 1}-01-01`);
      }
      if (area) query = query.eq('area', area);
      const { data: pagina, error } = await query;
      if (error) throw error;
      data.push(...(pagina || []));
      if (!pagina || pagina.length < PAGINA) break;
    }


    const isAlocada = (s) => s === 'integrado';

    const porMes = {};
    let totalRecebidas = 0;
    let totalAlocadas = 0;
    const porArea = {
      kids: { recebidas: 0, alocadas: 0 },
      sede: { recebidas: 0, alocadas: 0 },
    };

    for (const row of data || []) {
      const ym = String(row.data_inscricao).slice(0, 7);
      if (!porMes[ym]) {
        porMes[ym] = { recebidas: 0, alocadas: 0, kids_rec: 0, kids_aloc: 0, sede_rec: 0, sede_aloc: 0 };
      }
      const aloc = isAlocada(row.status);
      porMes[ym].recebidas += 1;
      totalRecebidas += 1;
      if (porArea[row.area]) porArea[row.area].recebidas += 1;
      if (row.area === 'kids') porMes[ym].kids_rec += 1;
      if (row.area === 'sede') porMes[ym].sede_rec += 1;
      if (aloc) {
        porMes[ym].alocadas += 1;
        totalAlocadas += 1;
        if (porArea[row.area]) porArea[row.area].alocadas += 1;
        if (row.area === 'kids') porMes[ym].kids_aloc += 1;
        if (row.area === 'sede') porMes[ym].sede_aloc += 1;
      }
    }

    const meses = Object.keys(porMes).sort().map(ym => {
      const m = porMes[ym];
      const taxa = m.recebidas > 0 ? Math.round((m.alocadas / m.recebidas) * 100) : null;
      return { mes: ym, ...m, taxa };
    });

    const taxa = totalRecebidas > 0 ? Math.round((totalAlocadas / totalRecebidas) * 100) : null;

    res.json({
      filtros: { ano, area },
      total: { recebidas: totalRecebidas, alocadas: totalAlocadas, taxa },
      por_area: porArea,
      meses,
    });
  } catch (e) {
    console.error('[inscricoes-summary]', e.message);
    res.status(500).json({ error: 'Erro ao agregar inscrições' });
  }
});


router.get('/inscricoes', async (req, res) => {
  try {
    const ano = req.query.ano ? String(req.query.ano) : null;
    const area = req.query.area ? String(req.query.area).toLowerCase() : null;
    const status = req.query.status ? String(req.query.status) : null;
    const mes = req.query.mes ? String(req.query.mes) : null;
    const de = req.query.de ? String(req.query.de) : null;
    const ate = req.query.ate ? String(req.query.ate) : null;
    const search = req.query.search ? String(req.query.search).trim() : null;
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Number(req.query.offset) || 0;






    const diaValido = (s) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
      const [y, m, d] = s.split('-').map(Number);
      if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return false;
      const dt = new Date(Date.UTC(y, m - 1, d));
      return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
    };
    if ((de && !diaValido(de)) || (ate && !diaValido(ate))) {
      return res.status(400).json({ error: 'Período inválido — use datas reais no formato AAAA-MM-DD' });
    }
    if (de && ate && de > ate) {
      return res.status(400).json({ error: 'Período inválido — a data inicial vem depois da final' });
    }

    let q = supabase
      .from('vol_inscricoes')
      .select(`
        id, nome, sobrenome, nome_completo, cpf, email, telefone,
        data_nascimento, nome_mae, data_inscricao, area, status,
        dom_predominante, ministerios_interesse, area_direcionada, participou_next,
        feedback, integrado_em, membro_id, origem
      `, { count: 'exact' })
      .is('deleted_at', null)
      .order('data_inscricao', { ascending: false })





      .order('id', { ascending: false })
      .range(offset, offset + limit - 1);

    if (ano) {
      q = q.gte('data_inscricao', `${ano}-01-01`).lt('data_inscricao', `${Number(ano) + 1}-01-01`);
    }
    if (mes) {
      const [y, m] = mes.split('-');
      const nextMonth = new Date(Number(y), Number(m), 1);
      q = q.gte('data_inscricao', `${mes}-01`).lt('data_inscricao', nextMonth.toISOString().slice(0, 10));
    }




    if (de) q = q.gte('data_inscricao', `${de}T00:00:00-03:00`);
    if (ate) {
      const fim = new Date(`${ate}T12:00:00Z`);
      fim.setUTCDate(fim.getUTCDate() + 1);
      q = q.lt('data_inscricao', `${fim.toISOString().slice(0, 10)}T00:00:00-03:00`);
    }
    if (area) q = q.eq('area', area);
    if (status) q = q.eq('status', status);
    if (search) q = q.ilike('nome_completo', `%${search}%`);

    const { data, error, count } = await q;
    if (error) throw error;

    res.json({ total: count || 0, limit, offset, rows: data || [] });
  } catch (e) {
    console.error('[inscricoes-list]', e.message);
    res.status(500).json({ error: 'Erro ao listar inscrições' });
  }
});





router.get('/inscricoes/por-direcionada', async (req, res) => {
  try {
    const ano = req.query.ano ? String(req.query.ano) : null;
    const status = req.query.status ? String(req.query.status) : null;
    let all = [];
    let offset = 0;
    const page = 1000;

    while (true) {
      let q = supabase.from('vol_inscricoes')
        .select('area_direcionada, status')
        .is('deleted_at', null)
        .not('area_direcionada', 'is', null)
        .order('data_inscricao', { ascending: false })
        .range(offset, offset + page - 1);
      if (ano) q = q.gte('data_inscricao', `${ano}-01-01`).lt('data_inscricao', `${Number(ano) + 1}-01-01`);
      if (status) q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw error;
      all = all.concat(data || []);
      if (!data || data.length < page) break;
      offset += page;
    }
    const counts = {};
    let pessoas = 0;
    for (const r of all) {
      const arr = Array.isArray(r.area_direcionada) ? r.area_direcionada : [];
      if (arr.length) pessoas += 1;
      for (const m of arr) {
        const k = String(m).trim();
        if (k) counts[k] = (counts[k] || 0) + 1;
      }
    }
    const rows = Object.entries(counts)
      .map(([ministerio, total]) => ({ ministerio, total }))
      .sort((a, b) => b.total - a.total);
    res.json({ rows, pessoas });
  } catch (e) {
    console.error('[inscricoes por-direcionada]', e.message);
    res.status(500).json({ error: 'Erro ao calcular distribuição' });
  }
});



const VOL_INSCRICAO_STATUS = ['inscrito', 'enviado_ministerio', 'integrado'];
router.patch('/inscricoes/:id', async (req, res) => {
  try {
    const { status, feedback } = req.body || {};
    if (!VOL_INSCRICAO_STATUS.includes(status)) {
      return res.status(400).json({ error: 'status inválido' });
    }
    const isAdmin = ['admin', 'diretor'].includes(req.user.role);
    const lvl = Math.max(getEffectiveLevel(req, 'voluntariado') || 0, getEffectiveLevel(req, 'membresia') || 0);
    if (!isAdmin && lvl < 3) {
      return res.status(403).json({ error: 'Sem permissão para alterar a inscrição' });
    }



    if (status === 'integrado') {
      const { data: insc } = await supabase.from('vol_inscricoes')
        .select('area, area_direcionada').eq('id', req.params.id).is('deleted_at', null).maybeSingle();



      if (!Array.isArray(insc?.area_direcionada) || insc.area_direcionada.length === 0) {
        return res.status(400).json({
          error: 'Defina a área direcionada (onde a pessoa vai servir) antes de integrar.',
          code: 'direcionada_obrigatoria',
        });
      }

      const areaInsc = String(insc?.area || '').toLowerCase();
      if (areaInsc === 'kids' || areaInsc === 'bridge') {
        const { data: chk } = await supabase.from('vol_background_checks')
          .select('status').eq('inscricao_id', req.params.id)
          .is('deleted_at', null).order('created_at', { ascending: false })
          .limit(1).maybeSingle();
        if (!chk || !antecedentes.STATUS_LIBERADOS.has(chk.status)) {
          return res.status(409).json({
            error: 'Triagem de antecedentes pendente — só é possível integrar após a verificação ser liberada (nada consta, aprovação manual ou dispensa).',
            code: 'antecedentes_pendentes',
          });
        }
      }
    }

    const patch = { status, updated_at: new Date().toISOString() };
    if (status === 'enviado_ministerio') patch.enviado_lider_em = new Date().toISOString();



    if (status === 'integrado') patch.integrado_em = diaIntegracaoBRT();
    if (feedback !== undefined) patch.feedback = feedback || null;



    const data = await atualizarStatusInscricao(req.params.id, patch);


    (async () => {
      try {
        if (!data.membro_id) return;
        const { data: prof } = await supabase.from('vol_profiles')
          .select('auth_user_id').eq('membresia_id', data.membro_id).maybeSingle();
        const targetId = prof?.auth_user_id;
        if (!targetId) return;
        if (status === 'integrado') {
          await notificar({
            modulo: 'voluntariado', tipo: 'vol_integrado',
            titulo: 'Você agora faz parte do time! 🎉',
            mensagem: `Sua inscrição para servir (${data.area}) foi integrada. Bem-vindo(a)!`,
            link: '/voluntariado', severidade: 'info',
            chaveDedup: `vol_integrado_${data.id}`, targetIds: [targetId],
          });
        } else if (status === 'enviado_ministerio') {
          await notificar({
            modulo: 'voluntariado', tipo: 'vol_enviado',
            titulo: 'Sua inscrição avançou',
            mensagem: `Encaminhamos sua inscrição (${data.area}) ao ministério. Em breve o líder fala com você.`,
            link: '/voluntariado', severidade: 'info',
            chaveDedup: `vol_enviado_${data.id}`, targetIds: [targetId],
          });
        }
      } catch (e) { console.warn('[inscricao status notify]', e.message); }
    })();

    res.json(data);
  } catch (e) {
    console.error('[inscricao status]', e.message);
    res.status(500).json({ error: 'Erro ao atualizar inscrição' });
  }
});





router.patch('/inscricoes/:id/dados', async (req, res) => {
  try {
    const isAdmin = ['admin', 'diretor'].includes(req.user.role);
    const lvl = Math.max(getEffectiveLevel(req, 'voluntariado') || 0, getEffectiveLevel(req, 'membresia') || 0);
    if (!isAdmin && lvl < 3) {
      return res.status(403).json({ error: 'Sem permissão para editar a inscrição' });
    }

    const { cpf, data_nascimento, nome_mae, ministerios_interesse, area_direcionada, feedback } = req.body || {};
    const patch = { updated_at: new Date().toISOString() };

    if (cpf !== undefined) {
      const d = String(cpf || '').replace(/\D+/g, '');
      if (d && (d.length !== 11 || !cpfValido(d))) {



        const { data: atual } = await supabase.from('vol_inscricoes')
          .select('cpf').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
        const atualNorm = String(atual?.cpf || '').replace(/\D+/g, '');
        if (!atualNorm || d !== atualNorm) {
          return res.status(400).json({ error: 'CPF inválido — confira os dígitos' });
        }
      }
      patch.cpf = d || null;
    }
    if (data_nascimento !== undefined) {
      const d = data_nascimento ? String(data_nascimento).slice(0, 10) : null;
      if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return res.status(400).json({ error: 'Data de nascimento inválida' });
      patch.data_nascimento = d;
    }
    if (nome_mae !== undefined) {
      patch.nome_mae = nome_mae ? String(nome_mae).trim() : null;
    }
    if (ministerios_interesse !== undefined) {
      patch.ministerios_interesse = ministerios_interesse ? String(ministerios_interesse).trim() : null;
    }
    if (area_direcionada !== undefined) {
      const arr = Array.isArray(area_direcionada)
        ? [...new Set(area_direcionada.map((s) => String(s).trim()).filter(Boolean))]
        : [];
      patch.area_direcionada = arr.length ? arr : null;
    }
    if (feedback !== undefined) {
      patch.feedback = feedback ? String(feedback).trim() : null;
    }

    if (Object.keys(patch).length === 1) {
      return res.status(400).json({ error: 'Nada para atualizar' });
    }

    const { data, error } = await supabase.from('vol_inscricoes')
      .update(patch).eq('id', req.params.id).select().single();
    if (error) throw error;







    if (patch.cpf && data) {
      (async () => {
        try {
          if (data.membro_id) {




            await reconciliarCpfTardio({
              membroId: data.membro_id, cpf: patch.cpf,
              origem: 'vol_ficha', origemId: data.id,
              dataNascimento: data.data_nascimento || null,
              confianca: 'fraca',
            });
          } else {
            const hit = await acharMembroGuardado({
              cpf: patch.cpf, email: data.email, telefone: data.telefone,
              nome: data.nome_completo || [data.nome, data.sobrenome].filter(Boolean).join(' '),
              dataNascimento: data.data_nascimento || null,
            });
            if (hit?.membro_id) {
              await supabase.from('vol_inscricoes')
                .update({ membro_id: hit.membro_id, updated_at: new Date().toISOString() })
                .eq('id', data.id).is('membro_id', null);




              if (hit.matched_by !== 'cpf') {
                await reconciliarCpfTardio({
                  membroId: hit.membro_id, cpf: patch.cpf,
                  origem: 'vol_ficha', origemId: data.id,
                  dataNascimento: data.data_nascimento || null,
                  confianca: 'fraca',
                });
              }
            }
          }
        } catch (e2) {
          console.error('[inscricao dados] reconciliar cpf:', e2.message);
        }
      })();
    }
    res.json(data);
  } catch (e) {
    console.error('[inscricao dados]', e.message);
    res.status(500).json({ error: 'Erro ao salvar dados da inscrição' });
  }
});








router.post('/inscricoes/:id/desistiu', async (req, res) => {
  try {
    const isAdmin = ['admin', 'diretor'].includes(req.user.role);
    const lvl = Math.max(getEffectiveLevel(req, 'voluntariado') || 0, getEffectiveLevel(req, 'membresia') || 0);
    if (!isAdmin && lvl < 3) {
      return res.status(403).json({ error: 'Sem permissão para alterar a inscrição' });
    }

    const motivo = req.body?.motivo ? String(req.body.motivo).trim().slice(0, 500) : '';
    const { data: atual } = await supabase.from('vol_inscricoes')
      .select('feedback').eq('id', req.params.id).maybeSingle();

    const nota = motivo ? `Desistiu de servir: ${motivo}` : 'Desistiu de servir.';
    const feedback = atual?.feedback ? `${atual.feedback}\n${nota}` : nota;



    const data = await atualizarStatusInscricao(req.params.id, {
      status: 'desistente', feedback, updated_at: new Date().toISOString(),
    });
    res.json(data);
  } catch (e) {
    console.error('[inscricao desistiu]', e.message);
    res.status(500).json({ error: 'Erro ao registrar a desistência' });
  }
});














function podeOperarInscricaoVol(req) {
  if (['admin', 'diretor'].includes(req.user.role)) return true;
  const lvl = Math.max(getEffectiveLevel(req, 'voluntariado') || 0, getEffectiveLevel(req, 'membresia') || 0);
  return lvl >= 3;
}


router.delete('/inscricoes/:id', async (req, res) => {
  try {
    if (!podeOperarInscricaoVol(req)) {
      return res.status(403).json({ error: 'Sem permissão para excluir a inscrição' });
    }
    const { data: atual } = await supabase.from('vol_inscricoes')
      .select('id').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!atual) return res.status(404).json({ error: 'Inscrição não encontrada' });

    const { error } = await supabase.rpc('app_soft_delete', {
      p_table_name: 'vol_inscricoes', p_row_id: req.params.id, p_deleted_by: req.user?.id ?? null,
    });
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[inscricao excluir]', e.message);


    res.status(500).json({ error: 'Erro ao excluir a inscrição', detalhe: e.message });
  }
});




router.post('/inscricoes/excluir-lote', async (req, res) => {
  try {
    if (!podeOperarInscricaoVol(req)) {
      return res.status(403).json({ error: 'Sem permissão para excluir inscrições' });
    }
    const { ids, ignorados, acimaDoTeto } = normalizarIdsExclusao(req.body?.ids);
    if (!ids.length) return res.status(400).json({ error: 'Selecione ao menos uma inscrição' });

    const { data: vivas, error: eVivas } = await supabase.from('vol_inscricoes')
      .select('id, nome_completo, status').is('deleted_at', null).in('id', ids);
    if (eVivas) throw eVivas;





    const plano = separarExclusaoLoteInsc(ids, vivas || [], []);
    const integradas = (vivas || [])
      .filter((v) => plano.excluir.includes(v.id) && ['integrado', 'enviado_ministerio'].includes(v.status))
      .map((v) => ({ id: v.id, nome: v.nome_completo || null, status: v.status }));



    const excluidas = [];
    const falhas = [];
    const motivos = new Set();
    const BLOCO = 8;
    for (let i = 0; i < plano.excluir.length; i += BLOCO) {
      const fatia = plano.excluir.slice(i, i + BLOCO);
      const r = await Promise.all(fatia.map(async (id) => {
        const { error } = await supabase.rpc('app_soft_delete', {
          p_table_name: 'vol_inscricoes', p_row_id: id, p_deleted_by: req.user?.id ?? null,
        });
        return { id, erro: error?.message || null };
      }));
      for (const item of r) {
        (item.erro ? falhas : excluidas).push(item.id);
        if (item.erro) motivos.add(item.erro);
      }
      if (r.some((x) => x.erro)) console.error('[inscricao excluir-lote falhas]', r.filter((x) => x.erro));
    }

    res.json({
      ok: true,
      excluidas,
      integradas,
      nao_encontradas: plano.naoEncontradas,
      falhas,
      falhas_motivo: [...motivos],
      ignorados,
      acima_do_teto: acimaDoTeto,
      resumo: resumoDoLoteInsc({
        excluidas: excluidas.length,
        naoEncontradas: plano.naoEncontradas.length,
        falhas: falhas.length,
      }),
    });
  } catch (e) {
    console.error('[inscricao excluir-lote]', e.message);
    res.status(500).json({ error: 'Erro ao excluir as inscrições', detalhe: e.message });
  }
});





const BGCHECK_FIELDS =
  'id, inscricao_id, area, status, resultado, certidao_url, consulta_erro, ' +
  'consentimento, consentimento_em, consulta_em, revisado_por_nome, revisado_em, ' +
  'observacoes, created_at, updated_at';

function nivelTriagem(req) {
  if (['admin', 'diretor'].includes(req.user.role)) return 5;
  return Math.max(
    getEffectiveLevel(req, 'voluntariado') || 0,
    getEffectiveLevel(req, 'kids') || 0,
    getEffectiveLevel(req, 'bridge') || 0,
  );
}


router.get('/inscricoes/:id/antecedentes', async (req, res) => {
  try {
    if (nivelTriagem(req) < 3) return res.status(403).json({ error: 'Sem permissão para ver antecedentes' });
    const { data, error } = await supabase.from('vol_background_checks')
      .select(BGCHECK_FIELDS)
      .eq('inscricao_id', req.params.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1).maybeSingle();
    if (error) throw error;
    res.json({ check: data || null, autoConfigurado: antecedentes.isConfigured() });
  } catch (e) {
    console.error('[antecedentes get]', e.message);
    res.status(500).json({ error: 'Erro ao buscar triagem' });
  }
});


router.post('/inscricoes/:id/antecedentes/consultar', async (req, res) => {
  try {
    if (nivelTriagem(req) < 3) return res.status(403).json({ error: 'Sem permissão' });
    const { data: insc } = await supabase.from('vol_inscricoes')
      .select('id, area, membro_id, nome_completo, nome, sobrenome, cpf, nome_mae, data_nascimento')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!insc) return res.status(404).json({ error: 'Inscrição não encontrada' });
    const area = String(insc.area || '').toLowerCase();
    if (area !== 'kids' && area !== 'bridge') {
      return res.status(400).json({ error: 'Triagem de antecedentes só se aplica a Kids/Bridge' });
    }
    if (!antecedentes.isConfigured()) {
      return res.status(400).json({ error: 'Consulta automática indisponível (token não configurado). Faça a triagem manual.', code: 'sem_token' });
    }





    const nomeCompleto = insc.nome_completo || [insc.nome, insc.sobrenome].filter(Boolean).join(' ').trim();
    const cpfDigitos = String(insc.cpf || '').replace(/\D+/g, '');
    const faltando = [];
    if (!nomeCompleto || nomeCompleto.trim().length < 3) faltando.push('nome completo');
    if (cpfDigitos.length !== 11) faltando.push('CPF');
    if (!insc.data_nascimento) faltando.push('data de nascimento');
    if (!insc.nome_mae || String(insc.nome_mae).trim().length < 2) faltando.push('nome da mãe');
    if (faltando.length) {
      return res.status(400).json({
        error: `Complete os dados da pessoa antes de consultar os antecedentes: ${faltando.join(', ')}.`,
        code: 'dados_incompletos',
        faltando,
      });
    }


    const chk = await antecedentes.criarCheckParaInscricao(insc, { consentimento: true, origem: 'coordenacao' });
    if (!chk) return res.status(500).json({ error: 'Não foi possível abrir a triagem' });





    await supabase.from('vol_background_checks')
      .update({
        nome_completo: nomeCompleto,
        cpf: cpfDigitos,
        nome_mae: String(insc.nome_mae).trim(),
        data_nascimento: insc.data_nascimento,
        updated_at: new Date().toISOString(),
      })
      .eq('id', chk.id);

    const r = await antecedentes.processarCheck(chk.id);
    const { data } = await supabase.from('vol_background_checks')
      .select(BGCHECK_FIELDS).eq('id', chk.id).maybeSingle();
    res.json({ ...r, check: data || null });
  } catch (e) {
    console.error('[antecedentes consultar]', e.message);
    res.status(500).json({ error: 'Erro ao consultar antecedentes' });
  }
});


router.patch('/antecedentes/:id', async (req, res) => {
  try {
    if (nivelTriagem(req) < 3) return res.status(403).json({ error: 'Sem permissão' });
    const { acao, observacoes } = req.body || {};
    const MAP = { aprovar: 'aprovado_manual', reprovar: 'reprovado', dispensar: 'dispensado' };
    if (!MAP[acao]) return res.status(400).json({ error: 'Ação inválida' });
    const patch = {
      status: MAP[acao],



      consulta_erro: null,
      observacoes: observacoes !== undefined ? (observacoes || null) : undefined,
      revisado_por: req.user.userId || null,
      revisado_por_nome: req.user.name || req.user.email || null,
      revisado_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);
    const { data, error } = await supabase.from('vol_background_checks')
      .update(patch).eq('id', req.params.id).is('deleted_at', null)
      .select(BGCHECK_FIELDS).single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[antecedentes revisar]', e.message);
    res.status(500).json({ error: 'Erro ao revisar triagem' });
  }
});


router.get('/antecedentes/pendentes', async (req, res) => {
  try {
    if (nivelTriagem(req) < 3) return res.status(403).json({ error: 'Sem permissão' });
    const { data, error } = await supabase.from('vol_background_checks')
      .select(BGCHECK_FIELDS + ', vol_inscricoes(nome_completo)')
      .is('deleted_at', null)
      .in('status', ['pendente', 'possivel_registro', 'erro'])
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) throw error;
    res.json({ rows: data || [], autoConfigurado: antecedentes.isConfigured() });
  } catch (e) {
    console.error('[antecedentes pendentes]', e.message);
    res.status(500).json({ error: 'Erro ao listar pendências' });
  }
});







function soAdmin(req, res) {
  if (!['admin', 'diretor'].includes(req.user?.role)) {
    res.status(403).json({ error: 'Apenas administradores podem gerir acessos de voluntários.' });
    return false;
  }
  return true;
}
const soDigitos = (v) => String(v || '').replace(/\D/g, '');
function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function acharAuthUserPorEmail(email) {
  const alvo = String(email || '').toLowerCase().trim();
  if (!alvo) return null;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const u = (data.users || []).find((x) => (x.email || '').toLowerCase().trim() === alvo);
    if (u) return u;
    if (!data.users || data.users.length < 1000) break;
  }
  return null;
}




router.get('/acessos', async (req, res) => {
  if (!soAdmin(req, res)) return;
  try {
    const q = String(req.query.q || '').trim();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 25));
    const from = (page - 1) * pageSize;

    let qv = supabase.from('vol_profiles')
      .select('id, full_name, email, cpf, phone, membresia_id, auth_user_id, profile_complete, created_at', { count: 'exact' })
      .order('full_name', { ascending: true })
      .range(from, from + pageSize - 1);
    if (q) qv = qv.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`);
    const { data: vols, count, error } = await qv;
    if (error) return res.status(500).json({ error: error.message });

    const emails = [...new Set((vols || []).map(v => (v.email || '').toLowerCase().trim()).filter(Boolean))];
    const memIds = [...new Set((vols || []).map(v => v.membresia_id).filter(Boolean))];
    const cpfs = [...new Set((vols || []).map(v => soDigitos(v.cpf)).filter(c => c.length >= 11))];


    const profByEmail = new Map();
    for (const ch of chunk(emails, 100)) {
      if (!ch.length) continue;
      const { data } = await supabase.from('profiles')
        .select('id, email, name, role, active').in('email', ch);
      (data || []).forEach(p => profByEmail.set((p.email || '').toLowerCase().trim(), p));
    }

    const usuByEmail = new Map();
    for (const ch of chunk(emails, 100)) {
      if (!ch.length) continue;
      const { data } = await supabase.from('usuarios')
        .select('id, email, cargo_id').in('email', ch);
      (data || []).forEach(u => usuByEmail.set((u.email || '').toLowerCase().trim(), u));
    }

    const cargoById = new Map();
    {
      const { data } = await supabase.from('cargos').select('id, nome, slug');
      (data || []).forEach(c => cargoById.set(c.id, c));
    }

    const memById = new Map();
    const memByCpf = new Map();
    for (const ch of chunk(memIds, 100)) {
      if (!ch.length) continue;
      const { data } = await supabase.from('mem_membros')
        .select('id, nome, cpf, telefone, email, status, data_nascimento, frequenta_area')
        .in('id', ch).is('deleted_at', null);
      (data || []).forEach(m => memById.set(m.id, m));
    }
    for (const ch of chunk(cpfs, 100)) {
      if (!ch.length) continue;
      const { data } = await supabase.from('mem_membros')
        .select('id, nome, cpf, telefone, email, status, data_nascimento, frequenta_area')
        .in('cpf', ch).is('deleted_at', null);
      (data || []).forEach(m => memByCpf.set(soDigitos(m.cpf), m));
    }

    const rows = (vols || []).map(v => {
      const email = (v.email || '').toLowerCase().trim();
      const prof = profByEmail.get(email) || null;
      const temLogin = !!(v.auth_user_id || prof);
      const usu = usuByEmail.get(email) || null;
      const cargo = usu?.cargo_id ? cargoById.get(usu.cargo_id) : null;
      const membro = (v.membresia_id && memById.get(v.membresia_id))
        || memByCpf.get(soDigitos(v.cpf)) || null;
      return {
        vol_profile_id: v.id,
        nome: v.full_name,
        email: v.email,
        cpf: v.cpf,
        telefone: v.phone,
        perfil_completo: !!v.profile_complete,
        tem_login: temLogin,
        acesso: prof ? { id: prof.id, role: prof.role, ativo: prof.active } : null,
        cargo: cargo ? { id: cargo.id, nome: cargo.nome, slug: cargo.slug } : null,
        membresia: membro
          ? { id: membro.id, nome: membro.nome, cpf: membro.cpf, telefone: membro.telefone,
              email: membro.email, status: membro.status, data_nascimento: membro.data_nascimento,
              frequenta_area: membro.frequenta_area, via: v.membresia_id ? 'vinculo' : 'cpf' }
          : null,
      };
    });

    res.json({ rows, total: count || 0, page, pageSize });
  } catch (e) {
    console.error('[voluntariado/acessos]', e.message);
    res.status(500).json({ error: 'Erro ao carregar acessos.' });
  }
});


router.get('/acessos/cargos', async (req, res) => {
  if (!soAdmin(req, res)) return;
  try {
    const { data } = await supabase.from('cargos')
      .select('id, slug, nome, categoria').eq('ativo', true).order('nome');
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});




router.post('/acessos/criar-login', async (req, res) => {
  if (!soAdmin(req, res)) return;
  try {
    const { vol_profile_id, nome, email, cpf, telefone, data_nascimento, cargo_slug, senha } = req.body || {};
    const mail = String(email || '').toLowerCase().trim();
    if (!nome || !mail) return res.status(400).json({ error: 'Nome e e-mail são obrigatórios.' });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return res.status(400).json({ error: 'E-mail inválido.' });
    if (!senha || String(senha).length < 8) return res.status(400).json({ error: 'A senha temporária precisa ter ao menos 8 caracteres.' });


    let authUser = await acharAuthUserPorEmail(mail);
    let uid = authUser?.id;
    let jaExistia = !!uid;
    if (!uid) {
      const { data, error } = await supabase.auth.admin.createUser({
        email: mail, password: String(senha), email_confirm: true,
        user_metadata: { name: nome },
      });
      if (error) return res.status(400).json({ error: `Falha ao criar login: ${error.message}` });
      uid = data.user.id;
    } else {
      await supabase.auth.admin.updateUserById(uid, { password: String(senha) });
    }




    const { error: pErr } = await supabase.from('profiles').upsert({
      id: uid, name: nome, email: mail, role: 'assistente', active: true,
      is_membro_only: false,
    }, { onConflict: 'id' });
    if (pErr) return res.status(400).json({ error: `Falha no profile: ${pErr.message}` });


    let cargoId = null;
    if (cargo_slug) {
      const { data: cg } = await supabase.from('cargos').select('id').eq('slug', cargo_slug).maybeSingle();
      cargoId = cg?.id || null;
    }
    const { data: usuExist } = await supabase.from('usuarios').select('id').eq('email', mail).maybeSingle();
    if (usuExist?.id) {
      const patch = { nome };
      if (cargoId) patch.cargo_id = cargoId;
      await supabase.from('usuarios').update(patch).eq('id', usuExist.id);
    } else {
      await supabase.from('usuarios').insert({ nome, email: mail, cargo_id: cargoId });
    }


    if (vol_profile_id) {
      await supabase.from('vol_profiles').update({ auth_user_id: uid }).eq('id', vol_profile_id);
    }





    try {
      const cpfDigits = String(cpf || '').replace(/\D/g, '');
      const telDigits = normalizarTelefone(telefone) || '';
      const dob = data_nascimento || null;
      if (nome && (cpfDigits || telDigits || dob)) {
        const membro = await acharOuCriarGuardado({
          nome, email: mail, cpf: cpfDigits || null, telefone: telefone || null,
          dataNascimento: dob, extra: dob ? { data_nascimento: dob } : {},
          origem: 'voluntariado_acesso',
        });
        if (membro?.id) {
          const { data: m } = await supabase.from('mem_membros')
            .select('cpf, telefone, data_nascimento').eq('id', membro.id).maybeSingle();
          const patch = {};
          if (cpfDigits && !m?.cpf) patch.cpf = cpfDigits;
          if (telDigits && !m?.telefone) patch.telefone = telDigits;
          if (dob && !m?.data_nascimento) patch.data_nascimento = dob;
          if (Object.keys(patch).length) await supabase.from('mem_membros').update(patch).eq('id', membro.id);
          const pPatch = { membro_id: membro.id };
          if (telDigits) pPatch.telefone = telDigits;
          if (dob) pPatch.data_nascimento = dob;
          await supabase.from('profiles').update(pPatch).eq('id', uid);
        }
      }
    } catch (e) { console.warn('[criar-login] pessoa canônica:', e.message); }

    bustPermissionCaches();
    res.json({
      ok: true, user_id: uid, ja_existia: jaExistia,
      aviso: 'Login pronto. Repasse a senha temporária; ele troca no 1º acesso. Pode levar alguns minutos pra liberar (cache de permissões).',
    });
  } catch (e) {
    console.error('[voluntariado/acessos/criar-login]', e.message);
    res.status(500).json({ error: 'Erro ao criar login.' });
  }
});








const authEscalaEscrita = authorizeModule('voluntariado', 3);


async function carregarTemplate(id) {
  const { data: tpl } = await supabase.from('vol_escala_templates')
    .select('*').eq('id', id).is('deleted_at', null).maybeSingle();
  if (!tpl) return null;
  const [{ data: itens }, { data: tipos }, { data: liderancas }] = await Promise.all([
    supabase.from('vol_escala_template_itens')
      .select('*, team:vol_teams(id,name,area), position:vol_positions(id,name)')
      .eq('template_id', id).order('sort_order'),
    supabase.from('vol_escala_template_tipos').select('service_type_id').eq('template_id', id),
    supabase.from('vol_escala_template_liderancas')
      .select('team_id, responsavel_profile_id, responsavel:profiles(id,name,email)')
      .eq('template_id', id),
  ]);
  const itemIds = (itens || []).map(i => i.id);
  let pessoasPorItem = {};
  if (itemIds.length) {
    const { data: pessoas } = await supabase.from('vol_escala_template_item_pessoas')
      .select('item_id, volunteer_id, volunteer:vol_profiles(id,full_name)')
      .in('item_id', itemIds);
    for (const p of pessoas || []) (pessoasPorItem[p.item_id] ||= []).push(p);
  }
  return {
    ...tpl,
    service_type_ids: (tipos || []).map(t => t.service_type_id),
    itens: (itens || []).map(i => ({ ...i, pessoas: pessoasPorItem[i.id] || [] })),
    liderancas: liderancas || [],
  };
}


async function gravarItensETipos(templateId, itens, serviceTypeIds, liderancas) {
  if (Array.isArray(serviceTypeIds)) {
    await supabase.from('vol_escala_template_tipos').delete().eq('template_id', templateId);
    const rows = serviceTypeIds.filter(Boolean).map(st => ({ template_id: templateId, service_type_id: st }));
    if (rows.length) await supabase.from('vol_escala_template_tipos').insert(rows);
  }
  if (Array.isArray(itens)) {
    await supabase.from('vol_escala_template_itens').delete().eq('template_id', templateId);
    for (let idx = 0; idx < itens.length; idx++) {
      const it = itens[idx];
      if (!it?.team_id) continue;
      const { data: novo, error } = await supabase.from('vol_escala_template_itens')
        .insert({
          template_id: templateId,
          team_id: it.team_id,
          position_id: it.position_id || null,
          quantidade: Math.max(1, parseInt(it.quantidade, 10) || 1),
          fixo: !!it.fixo,
          sort_order: it.sort_order ?? idx,
        }).select('id').single();
      if (error) throw new Error(error.message);
      const pessoas = Array.isArray(it.pessoas) ? it.pessoas : [];
      const pRows = pessoas
        .map(p => (typeof p === 'string' ? p : p.volunteer_id))
        .filter(Boolean)
        .map(vid => ({ item_id: novo.id, volunteer_id: vid }));
      if (pRows.length) await supabase.from('vol_escala_template_item_pessoas').insert(pRows);
    }
  }


  if (Array.isArray(liderancas)) {
    await supabase.from('vol_escala_template_liderancas').delete().eq('template_id', templateId);
    const rows = liderancas
      .filter(l => l?.team_id && l?.responsavel_profile_id)
      .map(l => ({ template_id: templateId, team_id: l.team_id, responsavel_profile_id: l.responsavel_profile_id }));
    if (rows.length) {
      const { error } = await supabase.from('vol_escala_template_liderancas').insert(rows);
      if (error) throw new Error(error.message);
    }
  }
}


router.get('/schedule-templates', async (req, res) => {
  try {
    const { data, error } = await supabase.from('vol_escala_templates')
      .select('*, itens:vol_escala_template_itens(count), tipos:vol_escala_template_tipos(service_type_id)')
      .is('deleted_at', null).order('sort_order').order('nome');
    if (error) return res.status(400).json({ error: error.message });
    res.json((data || []).map(t => ({
      ...t,
      itens_count: t.itens?.[0]?.count ?? 0,
      service_type_ids: (t.tipos || []).map(x => x.service_type_id),
      itens: undefined, tipos: undefined,
    })));
  } catch (e) { res.status(500).json({ error: 'Erro ao listar templates de escala' }); }
});


router.get('/schedule-templates/:id', async (req, res) => {
  try {
    const tpl = await carregarTemplate(req.params.id);
    if (!tpl) return res.status(404).json({ error: 'Template não encontrado' });
    res.json(tpl);
  } catch (e) { res.status(500).json({ error: 'Erro ao carregar template' }); }
});


router.post('/schedule-templates', authEscalaEscrita, async (req, res) => {
  try {
    const { nome, descricao, ativo, sort_order, service_type_ids, itens, liderancas } = req.body || {};
    if (!nome || !nome.trim()) return res.status(400).json({ error: 'nome obrigatório' });
    const { data: tpl, error } = await supabase.from('vol_escala_templates')
      .insert({ nome: nome.trim(), descricao: descricao || null, ativo: ativo !== false, sort_order: sort_order || 0 })
      .select('id').single();
    if (error) return res.status(400).json({ error: error.message });
    await gravarItensETipos(tpl.id, itens, service_type_ids, liderancas);
    res.json(await carregarTemplate(tpl.id));
  } catch (e) { res.status(500).json({ error: e.message || 'Erro ao criar template' }); }
});


router.put('/schedule-templates/:id', authEscalaEscrita, async (req, res) => {
  try {
    const { nome, descricao, ativo, sort_order, service_type_ids, itens, liderancas } = req.body || {};
    const patch = {};
    if (nome !== undefined) patch.nome = String(nome).trim();
    if (descricao !== undefined) patch.descricao = descricao || null;
    if (ativo !== undefined) patch.ativo = !!ativo;
    if (sort_order !== undefined) patch.sort_order = sort_order || 0;
    if (Object.keys(patch).length) {
      const { error } = await supabase.from('vol_escala_templates')
        .update(patch).eq('id', req.params.id).is('deleted_at', null);
      if (error) return res.status(400).json({ error: error.message });
    }
    await gravarItensETipos(req.params.id, itens, service_type_ids, liderancas);
    res.json(await carregarTemplate(req.params.id));
  } catch (e) { res.status(500).json({ error: e.message || 'Erro ao atualizar template' }); }
});


router.delete('/schedule-templates/:id', authEscalaEscrita, async (req, res) => {
  try {
    const { error } = await supabase.from('vol_escala_templates')
      .update({ deleted_at: new Date().toISOString() }).eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover template' }); }
});


router.get('/schedule-templates/por-tipo/:serviceTypeId', async (req, res) => {
  try {
    const { data, error } = await supabase.from('vol_escala_template_tipos')
      .select('template:vol_escala_templates(*)')
      .eq('service_type_id', req.params.serviceTypeId);
    if (error) return res.status(400).json({ error: error.message });
    res.json((data || []).map(x => x.template).filter(t => t && !t.deleted_at && t.ativo));
  } catch (e) { res.status(500).json({ error: 'Erro ao sugerir templates' }); }
});
















async function upsertAlvoEscala(linha) {
  let r = await supabase.from('vol_escala_culto_itens')
    .upsert(linha, { onConflict: 'service_id,team_id,position_id,culto_id' })
    .select('id').single();
  if (r.error && String(r.error.code) === '42P10') {
    if (linha.culto_id) {
      throw new Error('Escala por horário exige a migration 20260903200000 (unique do alvo com culto_id).');
    }
    const { culto_id: _ignora, ...semCulto } = linha;
    r = await supabase.from('vol_escala_culto_itens')
      .upsert(semCulto, { onConflict: 'service_id,team_id,position_id' })
      .select('id').single();
  }
  if (r.error) throw new Error(r.error.message);
  return r.data;
}









router.post('/schedule-templates/:id/apply', authEscalaEscrita, async (req, res) => {
  try {
    const { service_id } = req.body || {};
    if (!service_id) return res.status(400).json({ error: 'service_id obrigatório' });
    const tpl = await carregarTemplate(req.params.id);
    if (!tpl) return res.status(404).json({ error: 'Template não encontrado' });
    const { data: svc } = await supabase.from('vol_services').select('id, scheduled_at, service_type_id').eq('id', service_id).maybeSingle();
    if (!svc) return res.status(404).json({ error: 'Culto não encontrado' });



    const diaServico = diaBRT(svc.scheduled_at);
    const idsPadrao = [...new Set(tpl.itens.flatMap((i) => (i.pessoas || []).map((p) => p.volunteer_id)).filter(Boolean))];
    let indisponPorPessoa = new Map();
    if (idsPadrao.length) {
      const linhas = [];
      for (let i = 0; i < idsPadrao.length; i += 200) {
        const { data } = await supabase.from('vol_availability')
          .select('service_id, unavailable_from, unavailable_to, reason, volunteer_profile_id, planning_center_person_id')
          .in('volunteer_profile_id', idsPadrao.slice(i, i + 200));
        linhas.push(...(data || []));
      }
      indisponPorPessoa = indexarPorPessoa(linhas);
    }
    const pulados = [];



    const { data: jaEscalados } = await supabase.from('vol_schedules')
      .select('volunteer_id, team_id, team_name, position_name, slot_seq, planning_center_person_id')
      .eq('service_id', service_id);
    const escaladoChave = new Set((jaEscalados || [])
      .filter(s => s.volunteer_id).map(s => `${s.volunteer_id}:${s.team_id || ''}`));


    const slotUsados = {};
    const slotKey = (tn, pn) => `${tn || ''}::${pn || ''}`;
    for (const s of jaEscalados || []) {
      if (s.planning_center_person_id) continue;
      (slotUsados[slotKey(s.team_name, s.position_name)] ||= new Set()).add(s.slot_seq || 0);
    }
    const proximoSlot = (tn, pn) => {
      const set = (slotUsados[slotKey(tn, pn)] ||= new Set());
      let n = 0; while (set.has(n)) n += 1; set.add(n); return n;
    };










    let cultosBloco = [];
    const splitPorTime = new Map();
    try {
      const idsTimes = [...new Set(tpl.itens.map((i) => i.team_id).filter(Boolean))];
      const [tiposRes, cultosRes, timesRes] = await Promise.all([
        supabase.from('vol_service_types').select('id, bloco_servico, is_active, vigente_de, vigente_ate'),
        supabase.from('cultos').select('id, data, hora, service_type_id').eq('data', diaServico).is('deleted_at', null),
        idsTimes.length
          ? supabase.from('vol_teams').select('id, split_por_horario').in('id', idsTimes)
          : Promise.resolve({ data: [] }),
      ]);
      for (const t of timesRes.data || []) splitPorTime.set(t.id, t.split_por_horario === true);
      const tipos = tiposRes.data || [];
      const tipo = tipos.find((t) => t.id === svc.service_type_id) || null;
      cultosBloco = cultosDoBloco({ tipo, tipos, cultos: cultosRes.data || [], diaISO: diaServico });
    } catch {
      cultosBloco = [];
    }

    const podeDividir = cultosBloco.length > 1;

    let itensCriados = 0, preenchidas = 0, vagasTotais = 0, alvosPorHorario = 0;
    for (const it of tpl.itens) {


      const dividir = podeDividir && splitPorTime.get(it.team_id) === true;
      let cItem = null;
      for (const cultoId of dividir ? cultosBloco.map((c) => c.id) : [null]) {
        cItem = cItem || await upsertAlvoEscala({
          service_id,
          template_id: tpl.id,
          template_item_id: it.id,
          team_id: it.team_id,
          position_id: it.position_id || null,
          culto_id: cultoId,
          quantidade: it.quantidade,
          fixo: it.fixo,
          sort_order: it.sort_order,
          deleted_at: null,
          updated_at: new Date().toISOString(),
        });
        if (cItem && dividir) alvosPorHorario += 1;
        itensCriados += 1;
        vagasTotais += it.quantidade;
      }






      if (dividir) continue;


      const teamName = it.team?.name || null;
      const positionName = it.position?.name || null;
      let usadas = 0;
      for (const p of it.pessoas) {
        if (usadas >= it.quantidade) break;
        const chave = `${p.volunteer_id}:${it.team_id}`;
        if (escaladoChave.has(chave)) { usadas += 1; continue; }
        const nome = p.volunteer?.full_name || null;






        const bloqueio = avaliarIndisponibilidade(
          { serviceId: service_id, dia: diaServico },
          indisponPorPessoa.get(p.volunteer_id) || [],
        );
        if (bloqueio.indisponivel) {
          pulados.push({ volunteer_id: p.volunteer_id, nome, equipe: it.team?.name || null, motivo: textoIndisponibilidade(bloqueio) });
          continue;
        }
        const { error: sErr } = await supabase.from('vol_schedules').insert({
          service_id,
          volunteer_id: p.volunteer_id,
          volunteer_name: nome,
          team_id: it.team_id,
          team_name: teamName,
          position_id: it.position_id || null,
          position_name: positionName,
          source: 'template',
          confirmation_status: 'pending',
          escala_culto_item_id: cItem.id,
          slot_seq: proximoSlot(teamName, positionName),
        });
        if (!sErr) { escaladoChave.add(chave); usadas += 1; preenchidas += 1; }
      }
    }


    res.json({
      ok: true,
      itens: itensCriados,
      vagas: vagasTotais,
      preenchidas,
      pulados,
      horarios: cultosBloco.map((c) => ({ culto_id: c.id, hora: c.hora })),
      alvos_por_horario: alvosPorHorario,
    });
  } catch (e) { res.status(500).json({ error: e.message || 'Erro ao aplicar template' }); }
});



























const RODIZIO_CULTOS_POR_BLOCO = 10;
const RODIZIO_MAX_BLOCOS = 12;

async function _ultimaEscalaPorPessoa({ antesISO, chavesAlvo }) {
  const vazio = { mapa: new Map(), desde: null, completo: false };
  const { data: cultos, error } = await supabase.from('vol_services')
    .select('id, scheduled_at')
    .lt('scheduled_at', antesISO)
    .order('scheduled_at', { ascending: false })
    .limit(RODIZIO_CULTOS_POR_BLOCO * RODIZIO_MAX_BLOCOS);
  if (error) { console.error('[voluntariado] rodízio não apurado:', error.message); return vazio; }

  const lista = cultos || [];
  const mapa = new Map();
  const alvo = chavesAlvo instanceof Set && chavesAlvo.size ? chavesAlvo : null;
  let ultimoVarrido = null;
  let completo = false;

  for (let i = 0; i < lista.length; i += RODIZIO_CULTOS_POR_BLOCO) {
    const bloco = lista.slice(i, i + RODIZIO_CULTOS_POR_BLOCO);
    const quando = Object.fromEntries(bloco.map(c => [c.id, c.scheduled_at]));



    let offset = 0;
    for (;;) {
      const { data, error: sErr } = await supabase.from('vol_schedules')
        .select('volunteer_id, planning_center_person_id, service_id')
        .in('service_id', bloco.map(c => c.id))
        .order('id').range(offset, offset + 999);
      if (sErr) { console.error('[voluntariado] rodízio não apurado:', sErr.message); return { mapa, desde: ultimoVarrido, completo: false }; }
      for (const s of data || []) {
        const dt = quando[s.service_id];
        if (!dt) continue;
        for (const k of [s.volunteer_id, s.planning_center_person_id]) {
          if (!k) continue;
          const atual = mapa.get(k);
          if (!atual || dt > atual) mapa.set(k, dt);
        }
      }
      if (!data || data.length < 1000) break;
      offset += 1000;
    }
    ultimoVarrido = bloco[bloco.length - 1].scheduled_at;

    if (alvo && [...alvo].every(k => mapa.has(k))) { completo = true; break; }
  }

  return { mapa, desde: ultimoVarrido, completo };
}

router.get('/services/:serviceId/contexto-montagem', async (req, res) => {
  try {
    const sid = req.params.serviceId;
    const { data: service } = await supabase




      .from('vol_services').select('id, name, service_type_name, service_type_id, scheduled_at').eq('id', sid).single();
    if (!service) return res.status(404).json({ error: 'Culto não encontrado' });


    const d = new Date(service.scheduled_at);
    const y = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const dia = `${y}-${mm}-${dd}`;


    let all = []; let offset = 0;
    while (true) {
      let q = supabase
        .from('vol_profiles')
        .select(`
          id, full_name, email, avatar_url, planning_center_id, qr_code, phone, cpf, arquivado, membresia_id,
          membro:mem_membros(foto_url),
          team_members:vol_team_members(
            id, team_id, position_id, is_active, service_type_ids,
            team:vol_teams(id, name, color),
            position:vol_positions(id, name)
          )
        `)




        .eq('arquivado', false)
        .order('full_name').range(offset, offset + 999);
      const { data, error } = await q;
      if (error) return res.status(400).json({ error: error.message });
      if (!data || !data.length) break;
      all = all.concat(data);
      if (data.length < 1000) break;
      offset += 1000;
    }




    all = all.filter((v) => ehPessoaEscalavel(v.full_name));



    for (const v of all) v.foto_url = fotoDoPerfil(v);










    for (const v of all) {
      v.team_members = (v.team_members || []).map((tm) => ({
        ...tm,
        serve_este_tipo: podeServirNoTipo(tm, service.service_type_id),
      }));
      v.serve_este_tipo = pessoaServeNoTipo(v.team_members, service.service_type_id);
    }


    const chave = (pid, pcid) => `${pid || ''}::${pcid || ''}`;
    const [{ data: unavCulto }, { data: unavPeriodo }] = await Promise.all([
      supabase.from('vol_availability')
        .select('volunteer_profile_id, planning_center_person_id, reason')
        .eq('service_id', sid),
      supabase.from('vol_availability')
        .select('volunteer_profile_id, planning_center_person_id, reason, unavailable_from, unavailable_to')
        .is('service_id', null)
        .lte('unavailable_from', dia)
        .gte('unavailable_to', dia),
    ]);
    const unavCultoMap = new Map();
    (unavCulto || []).forEach(u => unavCultoMap.set(chave(u.volunteer_profile_id, u.planning_center_person_id), u.reason));
    const unavPeriodoMap = new Map();
    (unavPeriodo || []).forEach(u => {
      const k = chave(u.volunteer_profile_id, u.planning_center_person_id);
      if (!unavPeriodoMap.has(k)) unavPeriodoMap.set(k, u);
    });


    const [{ data: outrosCultosDia }, { data: escalasEste }] = await Promise.all([
      supabase.from('vol_services').select('id, name, scheduled_at')
        .gte('scheduled_at', `${dia}T00:00:00-03:00`)
        .lte('scheduled_at', `${dia}T23:59:59-03:00`)
        .neq('id', sid).order('scheduled_at'),
      supabase.from('vol_schedules')
        .select('volunteer_id, planning_center_person_id').eq('service_id', sid),
    ]);
    const escaladoEste = new Set((escalasEste || []).map(s => chave(s.volunteer_id, s.planning_center_person_id)));
    const servicoPorId = Object.fromEntries((outrosCultosDia || []).map(o => [o.id, o]));
    const escaladoOutrosMap = new Map();
    if (outrosCultosDia && outrosCultosDia.length) {
      const { data: escalasOutros } = await supabase.from('vol_schedules')
        .select('volunteer_id, planning_center_person_id, service_id')
        .in('service_id', outrosCultosDia.map(o => o.id));
      (escalasOutros || []).forEach(s => {
        const k = chave(s.volunteer_id, s.planning_center_person_id);
        const o = servicoPorId[s.service_id];
        if (!escaladoOutrosMap.has(k)) escaladoOutrosMap.set(k, []);
        escaladoOutrosMap.get(k).push({ service_id: s.service_id, name: o?.name || 'Outro culto', scheduled_at: o?.scheduled_at || null });
      });
    }


    const chavesAlvo = new Set();
    for (const v of all || []) { if (v.id) chavesAlvo.add(v.id); if (v.planning_center_id) chavesAlvo.add(v.planning_center_id); }
    const rodizio = await _ultimaEscalaPorPessoa({ antesISO: service.scheduled_at, chavesAlvo });

    const pool = (all || []).map(v => {
      const k = chave(v.id, v.planning_center_id);
      const uPeriodo = unavPeriodoMap.get(k);
      const uCulto = unavCultoMap.get(k);
      const motivo = uPeriodo?.reason || uCulto || null;


      const ultimas = [rodizio.mapa.get(v.id), rodizio.mapa.get(v.planning_center_id)].filter(Boolean);
      const ultima = ultimas.length ? ultimas.sort().pop() : null;
      const semanas = semanasSemServir(ultima, service.scheduled_at);
      return {
        ...v,
        indisponivel: !!(uPeriodo || uCulto),
        indisponivelMotivo: motivo,
        indisponivelOrigem: uPeriodo ? 'periodo' : (uCulto ? 'culto' : null),
        jaEscalado: escaladoEste.has(k),
        escaladoEm: escaladoOutrosMap.get(k) || [],
        ultimaEscala: ultima,
        semanasSemServir: semanas,
        rotuloRodizio: rotuloTempoSemServir(semanas),
      };
    });

    res.json({
      service, pool, outrosCultosDia: outrosCultosDia || [],


      rodizio: { desde: rodizio.desde, completo: rodizio.completo },
    });
  } catch (e) { res.status(500).json({ error: 'Erro ao montar contexto da escala' }); }
});










async function _coberturaDoCulto(sid) {
  const [{ data: alvo, error: aErr }, { data: sched, error: sErr }] = await Promise.all([
    supabase.from('vol_escala_culto_itens')
      .select('*, team:vol_teams(id,name), position:vol_positions(id,name)')
      .eq('service_id', sid).is('deleted_at', null).order('sort_order'),
    supabase.from('vol_schedules')




      .select('id, volunteer_id, volunteer_name, team_id, position_id, confirmation_status, escala_culto_item_id, culto_id')
      .eq('service_id', sid),
  ]);
  if (aErr || sErr) throw new Error((aErr || sErr).message);





  const fotos = await mapaDeFotos(supabase, (sched || []).map(s => s.volunteer_id));
  const comFoto = (sched || []).map(s => ({
    ...s,
    foto_url: s.volunteer_id ? (fotos[s.volunteer_id] || null) : null,
  }));




  const { itens, sobrando, resumo } = montarCobertura(alvo || [], comFoto);
  return { itens, sobrando, escalas: comFoto, resumo };
}























const MATRIZ_MAX_CULTOS = 40;

router.get('/escala-matriz', async (req, res) => {
  try {
    const semanas = Math.min(8, Math.max(1, parseInt(req.query.semanas, 10) || 4));


    const desde = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.desde || ''))
      ? req.query.desde
      : diaBRT(new Date());
    const fim = new Date(new Date(`${desde}T12:00:00-03:00`).getTime() + semanas * 7 * 86400000);

    let q = supabase.from('vol_services')
      .select('id, name, scheduled_at, service_type_id, service_type_name')
      .gte('scheduled_at', `${desde}T00:00:00-03:00`)
      .lte('scheduled_at', fim.toISOString())
      .order('scheduled_at')
      .limit(MATRIZ_MAX_CULTOS + 1);
    if (req.query.service_type_id) q = q.eq('service_type_id', req.query.service_type_id);



    const serviceIds = String(req.query.service_ids || '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id));
    if (serviceIds.length) q = q.in('id', serviceIds.slice(0, MATRIZ_MAX_CULTOS));
    const { data: cultosBrutos, error: cErr } = await q;
    if (cErr) return res.status(400).json({ error: cErr.message });



    const cultos = (cultosBrutos || []).slice(0, MATRIZ_MAX_CULTOS);
    const truncado = (cultosBrutos || []).length > MATRIZ_MAX_CULTOS;
    if (!cultos.length) {
      return res.json({ cultos: [], linhas: [], resumo: { alvo: 0, preenchidas: 0, faltam: 0 }, truncado: false });
    }

    const ids = cultos.map(c => c.id);
    const emLotes = async (tabela, select) => {
      let todos = [];
      for (let i = 0; i < ids.length; i += 20) {
        const lote = ids.slice(i, i + 20);
        let offset = 0;
        for (;;) {
          let qq = supabase.from(tabela).select(select).in('service_id', lote).order('id').range(offset, offset + 999);
          if (tabela === 'vol_escala_culto_itens') qq = qq.is('deleted_at', null);
          const { data, error } = await qq;
          if (error) throw new Error(error.message);
          todos = todos.concat(data || []);
          if (!data || data.length < 1000) break;
          offset += 1000;
        }
      }
      return todos;
    };

    const [itens, escalas] = await Promise.all([
      emLotes('vol_escala_culto_itens', 'id, service_id, team_id, position_id, quantidade, fixo, sort_order, team:vol_teams(id,name,area,color), position:vol_positions(id,name)'),
      emLotes('vol_schedules', 'id, service_id, volunteer_id, volunteer_name, team_id, position_id, confirmation_status, escala_culto_item_id, planning_center_person_id'),
    ]);

    const porCulto = new Map(ids.map(id => [id, { itens: [], escalas: [] }]));
    for (const i of itens) porCulto.get(i.service_id)?.itens.push(i);
    for (const s of escalas) porCulto.get(s.service_id)?.escalas.push(s);



    const linhas = new Map();






    const garanteLinha = (team_id, team, area, cor, position_id, position, ordem, team_name) => {
      const k = linhaEq.chaveDaLinha({ team_id, team_name: team_name || team, position_id });
      if (!linhas.has(k)) {



        const rot = linhaEq.rotuloDaEquipe({ team_id, team_name: team_name || team, nome_do_vinculo: team });
        linhas.set(k, {
          chave: k, team_id, team: rot.nome, equipe_vinculada: rot.vinculada,


          area: linhaEq.areaDaLinha({ team_id, area }) || 'Sem área',
          cor: cor || null,
          position_id: position_id || null, position: position || null,
          ordem: ordem ?? 999, celulas: {},
        });
      }
      const l = linhas.get(k);
      if (ordem != null && ordem < l.ordem) l.ordem = ordem;
      if (!l.position && position) l.position = position;
      if (!l.cor && cor) l.cor = cor;
      return l;
    };

    let alvoTotal = 0, preenchTotal = 0, faltamTotal = 0;





    const fotoPorVol = await mapaDeFotos(supabase, escalas.map(e => e.volunteer_id));
    const pessoaDaEscala = s => ({
      id: s.id, nome: s.volunteer_name, status: s.confirmation_status || 'pending',
      volunteer_id: s.volunteer_id, planning_center_person_id: s.planning_center_person_id,
      foto_url: s.volunteer_id ? (fotoPorVol[s.volunteer_id] || null) : null,
    });

    for (const culto of cultos) {
      const { itens: it, escalas: es } = porCulto.get(culto.id);
      const cob = montarCobertura(it, es);
      alvoTotal += cob.resumo.alvo;
      preenchTotal += cob.resumo.preenchidas;
      faltamTotal += cob.resumo.faltam;

      for (const item of cob.itens) {
        const bruto = it.find(x => x.id === item.id);
        const l = garanteLinha(item.team_id, item.team, bruto?.team?.area, bruto?.team?.color, item.position_id, item.position, bruto?.sort_order);
        l.celulas[culto.id] = {
          item_id: item.id, alvo: item.alvo, faltam: item.faltam,
          pessoas: item.pessoas.map(pessoaDaEscala),
        };
      }




      for (const s of cob.sobrando) {




        const l = garanteLinha(s.team_id, null, null, null, s.position_id, s.position_name || null, 998, s.team_name);
        const c = (l.celulas[culto.id] ||= { item_id: null, alvo: 0, faltam: 0, pessoas: [] });
        c.pessoas.push(pessoaDaEscala(s));
      }
    }




    const semNome = [...linhas.values()].filter(l => l.team_id && (!l.team || l.team === 'Sem equipe'));
    if (semNome.length) {
      const teamIds = [...new Set(semNome.map(l => l.team_id).filter(Boolean))];
      if (teamIds.length) {
        const { data: ts } = await supabase.from('vol_teams').select('id, name, area, color').in('id', teamIds);
        const mapa = Object.fromEntries((ts || []).map(t => [t.id, t]));
        for (const l of semNome) {
          const t = mapa[l.team_id];
          if (t) { l.team = t.name; l.area = l.area === 'Sem área' ? (t.area || 'Sem área') : l.area; l.cor = l.cor || t.color; }
        }
      }
    }

    const ordenadas = [...linhas.values()].sort((a, b) =>
      a.area.localeCompare(b.area, 'pt-BR') ||
      a.team.localeCompare(b.team, 'pt-BR') ||
      a.ordem - b.ordem ||
      String(a.position || '').localeCompare(String(b.position || ''), 'pt-BR'));

    res.json({
      cultos: cultos.map(c => ({
        ...c,
        status: contarStatus(porCulto.get(c.id).escalas),
      })),
      linhas: ordenadas,
      resumo: { alvo: alvoTotal, preenchidas: preenchTotal, faltam: faltamTotal },
      truncado,
      janela: { desde, semanas },
    });
  } catch (e) {
    console.error('[voluntariado] matriz:', e.message);
    res.status(500).json({ error: 'Erro ao montar a matriz da escala' });
  }
});

router.get('/services/:serviceId/escala-cobertura', async (req, res) => {
  try {
    const sid = req.params.serviceId;
    const { itens, resumo } = await _coberturaDoCulto(sid);
    res.json({ service_id: sid, itens, resumo });
  } catch (e) { res.status(500).json({ error: 'Erro ao calcular cobertura da escala' }); }
});

module.exports = router;
