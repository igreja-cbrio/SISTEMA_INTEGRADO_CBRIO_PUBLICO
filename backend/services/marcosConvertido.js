













const { supabase } = require('../utils/supabase');
const jt = require('../utils/jornadaTempo');








async function carregarSinaisConvertidos(convertidos, opts = {}) {
  const podeGenerosidade = opts.podeGenerosidade === true;
    const onlyDigits = (v) => String(v || '').replace(/\D/g, '');

    const fetchAll = async (table, columns, applyFilter) => {
      const out = []; let from = 0; const page = 1000;
      while (true) {
        let q = supabase.from(table).select(columns).range(from, from + page - 1);
        if (applyFilter) q = applyFilter(q);
        const { data, error } = await q;
        if (error) throw error;
        out.push(...(data || []));
        if (!data || data.length < page) break;
        from += page;
      }
      return out;
    };

    const batismos = await fetchAll('batismo_inscricoes', 'status, membro_id, cpf, nome, data_batismo', (q) => q.is('deleted_at', null));
    const nextMats = await fetchAll('next_matriculas', 'id, membro_id, cpf, nome', (q) => q.is('deleted_at', null));
    const nextFormados = await fetchAll('vw_next_formado_pessoa', 'membro_id, cpf, nome', (q) => q);


    const bM = new Map(), bC = new Map(), bN = new Map();
    const putB = (m, k, real) => { if (!k) return; const c = m.get(k); const r = real ? 2 : 1; if (!c || r > c.r) m.set(k, { r, real }); };
    for (const b of batismos) {
      const real = b.status === 'realizado';
      putB(bM, b.membro_id, real);
      putB(bC, onlyDigits(b.cpf).length === 11 ? onlyDigits(b.cpf) : null, real);
      putB(bN, String(b.nome || '').trim().toLowerCase() || null, real);
    }
    const batOf = (c) => {


      const temCpf = onlyDigits(c.cpf).length === 11;
      if (c.membro_id || temCpf) {
        const cs = [c.membro_id ? bM.get(c.membro_id) : null, temCpf ? bC.get(onlyDigits(c.cpf)) : null].filter(Boolean);
        return cs.length ? { real: cs.some(x => x.real) } : null;
      }
      const hit = bN.get(String(c.nome || '').trim().toLowerCase());
      return hit ? { real: hit.real } : null;
    };


    const insM = new Set(), insC = new Set(), insN = new Set();
    for (const m of nextMats) {
      if (m.membro_id) insM.add(m.membro_id);
      const cc = onlyDigits(m.cpf); if (cc.length === 11) insC.add(cc);
      const nn = String(m.nome || '').trim().toLowerCase(); if (nn) insN.add(nn);
    }
    const fezM = new Set(), fezC = new Set(), fezN = new Set();
    for (const v of nextFormados) {
      if (v.membro_id) fezM.add(v.membro_id);
      const cc = onlyDigits(v.cpf); if (cc.length === 11) fezC.add(cc);
      const nn = String(v.nome || '').trim().toLowerCase(); if (nn) fezN.add(nn);
    }
    const matchPessoa = (c, M, C, N) => {
      const temCpf = onlyDigits(c.cpf).length === 11;
      if (c.membro_id || temCpf) return (c.membro_id && M.has(c.membro_id)) || (temCpf && C.has(onlyDigits(c.cpf)));
      const nn = String(c.nome || '').trim().toLowerCase();
      return !!nn && N.has(nn);
    };
    const nextOf = (c) => {
      if (matchPessoa(c, fezM, fezC, fezN)) return { fez: true };
      if (matchPessoa(c, insM, insC, insN)) return { fez: false };
      return null;
    };












    const membroIds = [...new Set(convertidos.map((c) => c.membro_id).filter(Boolean))];


    const emLotes = async (table, columns, ids, applyFilter) => {
      const out = [];
      for (let i = 0; i < ids.length; i += 200) {
        const lote = ids.slice(i, i + 200);
        out.push(...await fetchAll(table, columns, (q) => {
          const base = q.in('membro_id', lote);
          return applyFilter ? applyFilter(base) : base;
        }));
      }
      return out;
    };



    const menor = (mapa, chave, dia) => {
      if (!chave || !dia) return;
      const atual = mapa.get(chave);
      if (!atual || dia < atual) mapa.set(chave, dia);
    };
    const chaveNome = (n) => String(n || '').trim().toLowerCase() || null;
    const chaveCpf = (v) => (onlyDigits(v).length === 11 ? onlyDigits(v) : null);
    const novoIdx = () => ({ M: new Map(), C: new Map(), N: new Map() });


    const dataDoMarco = (c, idx) => {
      const cpf = chaveCpf(c.cpf);
      if (c.membro_id || cpf) {
        const cands = [c.membro_id ? idx.M.get(c.membro_id) : null, cpf ? idx.C.get(cpf) : null].filter(Boolean);
        return cands.length ? cands.sort()[0] : null;
      }
      const nn = chaveNome(c.nome);
      return nn ? (idx.N.get(nn) || null) : null;
    };


    const idxBatismo = novoIdx();
    for (const b of batismos) {
      if (b.status !== 'realizado') continue;
      const dia = jt.diaBRT(b.data_batismo);
      if (!dia) continue;
      menor(idxBatismo.M, b.membro_id, dia);
      menor(idxBatismo.C, chaveCpf(b.cpf), dia);
      menor(idxBatismo.N, chaveNome(b.nome), dia);
    }


    const idxNext = novoIdx();
    const nextSemData = { M: new Set(), C: new Set(), N: new Set() };
    const matPorId = new Map(nextMats.map((m) => [m.id, m]));
    const encontros = await fetchAll('next_encontros', 'id, data', (q) => q);
    const encPorId = new Map(encontros.map((e) => [e.id, e.data]));

    const presencas = await fetchAll('next_presencas', 'matricula_id, encontro_id', (q) => q.eq('presente', true));
    for (const p of presencas) {
      const m = matPorId.get(p.matricula_id);
      if (!m) continue;
      const dia = jt.diaBRT(encPorId.get(p.encontro_id));
      if (dia) {
        menor(idxNext.M, m.membro_id, dia);
        menor(idxNext.C, chaveCpf(m.cpf), dia);
        menor(idxNext.N, chaveNome(m.nome), dia);
      } else {


        if (m.membro_id) nextSemData.M.add(m.membro_id);
        if (chaveCpf(m.cpf)) nextSemData.C.add(chaveCpf(m.cpf));
        if (chaveNome(m.nome)) nextSemData.N.add(chaveNome(m.nome));
      }
    }

    const nextLegado = await fetchAll('next_inscricoes', 'membro_id, cpf, nome, check_in_at', (q) => q.not('check_in_at', 'is', null));
    for (const l of nextLegado) {
      const dia = jt.diaBRT(l.check_in_at);
      if (!dia) continue;
      menor(idxNext.M, l.membro_id, dia);
      menor(idxNext.C, chaveCpf(l.cpf), dia);
      menor(idxNext.N, chaveNome(l.nome), dia);
    }
    const temNextSemData = (c) => {
      const cpf = chaveCpf(c.cpf);
      if (c.membro_id || cpf) return (c.membro_id && nextSemData.M.has(c.membro_id)) || (cpf && nextSemData.C.has(cpf));
      const nn = chaveNome(c.nome);
      return !!nn && nextSemData.N.has(nn);
    };



    const vinculos = await fetchAll('mem_grupo_membros', 'membro_id, entrou_em',
      (q) => q.is('deleted_at', null).is('saiu_em', null));
    const datasImport = jt.datasDeImport(vinculos.map((v) => v.entrou_em));
    const idxGrupo = novoIdx();
    for (const v of vinculos) menor(idxGrupo.M, v.membro_id, jt.diaBRT(v.entrou_em));


    const voluntarios = membroIds.length
      ? await emLotes('mem_voluntarios', 'membro_id, desde', membroIds, (q) => q.is('deleted_at', null).is('ate', null))
      : [];
    const idxServir = novoIdx();
    for (const v of voluntarios) menor(idxServir.M, v.membro_id, jt.diaBRT(v.desde));


    const idxGenerosidade = novoIdx();
    if (podeGenerosidade && membroIds.length) {
      const contribs = await emLotes('mem_contribuicoes', 'membro_id, data', membroIds,
        (q) => q.is('deleted_at', null).in('tipo', ['dizimo', 'oferta']));
      for (const ct of contribs) menor(idxGenerosidade.M, ct.membro_id, jt.diaBRT(ct.data));
    }





  function marcosDe(c, { contatoFeito = false } = {}) {
    const dataGrupo = dataDoMarco(c, idxGrupo);
    const dataNext = dataDoMarco(c, idxNext);
    const marcos = {};
    const por = (chave, marco) => { if (marco) marcos[chave] = marco; };
    por('contato', jt.montarMarco(c.primeiro_contato_em, c.data_culto, { alcancado: contatoFeito }));
    por('next', jt.montarMarco(dataNext, c.data_culto, { alcancado: !!dataNext || temNextSemData(c) }));
    por('batismo', jt.montarMarco(dataDoMarco(c, idxBatismo), c.data_culto));
    por('grupo', jt.montarMarco(dataGrupo, c.data_culto, { suspeita: !!dataGrupo && datasImport.has(dataGrupo) }));
    por('servir', jt.montarMarco(dataDoMarco(c, idxServir), c.data_culto));
    if (podeGenerosidade) por('generosidade', jt.montarMarco(dataDoMarco(c, idxGenerosidade), c.data_culto));
    return marcos;
  }

  return { batOf, nextOf, marcosDe, datasImport };
}

module.exports = { carregarSinaisConvertidos };
