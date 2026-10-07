























const { isoWeekOf } = require('./isoWeek');

const CORTE_DOMINGO_0930 = '2026-08-24';


function tipoVigenteEm(tipo, diaISO) {
  if (!tipo) return false;
  if (tipo.is_active === false) return false;
  if (tipo.vigente_de && diaISO < String(tipo.vigente_de).slice(0, 10)) return false;
  if (tipo.vigente_ate && diaISO > String(tipo.vigente_ate).slice(0, 10)) return false;
  return true;
}













function turnoDoTipo(tipo) {
  const h = String((tipo && tipo.recurrence_time) || '').slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(h)) return null;
  return h < '12:00' ? 'manha' : 'noite';
}

const ROTULO_TURNO = { manha: 'Domingo manhã', noite: 'Domingo noite' };

function chaveDaSerie(tipo, lente) {
  if (lente === 'turno') {
    const t = turnoDoTipo(tipo);
    return t ? `turno:${t}` : 'turno:sem_horario';
  }
  if (lente === 'continuidade' && tipo.linhagem_key) return `linh:${tipo.linhagem_key}`;
  if (lente === 'consolidacao' && tipo.consolidacao_key) return `cons:${tipo.consolidacao_key}`;
  return `tipo:${tipo.id}`;
}

function _fmtDDMM(iso) { return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`; }
function _mais7(d) { return new Date(d.getTime() + 7 * 86400000); }




function eixoDomingos({ hoje, corte = CORTE_DOMINGO_0930, nSemanas = 16 }) {
  const hd = new Date(`${hoje}T12:00:00Z`);
  const ultimo = new Date(hd);
  ultimo.setUTCDate(hd.getUTCDate() - hd.getUTCDay());
  const cd = new Date(`${corte}T12:00:00Z`);
  const domingoNovo = new Date(cd);
  domingoNovo.setUTCDate(cd.getUTCDate() + ((7 - cd.getUTCDay()) % 7));
  const eixo = [];
  for (let i = nSemanas - 1; i >= 0; i--) {
    const d = new Date(ultimo);
    d.setUTCDate(ultimo.getUTCDate() - i * 7);
    eixo.push(d);
  }
  for (let d = _mais7(ultimo); d <= domingoNovo; d = _mais7(d)) eixo.push(d);
  return eixo.map((d) => {
    const { ano, semana } = isoWeekOf(d);
    const iso = d.toISOString().slice(0, 10);
    return { ano_iso: ano, semana_iso: semana, domingo: iso, label: _fmtDDMM(iso) };
  });
}




function montarLentes({ tipos, linhas, capacidadeUnitaria, hoje, nSemanas = 16, corte = CORTE_DOMINGO_0930 }) {
  const eixo = eixoDomingos({ hoje, corte, nSemanas });


  const porSemanaTipo = new Map();
  for (const r of linhas || []) {
    const k = `${r.ano_iso}-${r.semana_iso}|${r.service_type_id}`;
    porSemanaTipo.set(k, (porSemanaTipo.get(k) || 0) + (Number(r.valor) || 0));
  }
  const valorDe = (s, tipoId) => porSemanaTipo.get(`${s.ano_iso}-${s.semana_iso}|${tipoId}`);

  const hora = (t) => String(t.recurrence_time || '').slice(0, 5);
  const tiposOrdenados = [...(tipos || [])].sort((a, b) => hora(a).localeCompare(hora(b)));

  const lentes = {};
  for (const lente of ['separada', 'continuidade', 'consolidacao', 'turno']) {
    const grupos = new Map();
    for (const t of tiposOrdenados) {
      const c = chaveDaSerie(t, lente);
      if (!grupos.has(c)) grupos.set(c, []);
      grupos.get(c).push(t);
    }

    const series = [...grupos.entries()].map(([key, membros]) => {
      let label;
      if (lente === 'turno') {



        const t = key.slice('turno:'.length);
        label = ROTULO_TURNO[t] || 'Domingo · sem horário definido';
      } else if (membros.length === 1) label = membros[0].name;
      else if (lente === 'continuidade') {

        const ordenados = [...membros].sort((a, b) =>
          String(a.vigente_de || '0000').localeCompare(String(b.vigente_de || '0000')));
        label = ordenados.map((t) => t.name).join(' → ');
      } else {
        label = membros.map((t) => t.name).join(' + ');
      }

      const h = lente === 'turno' && key === 'turno:sem_horario' ? '99:99' : hora(membros[0]);
      return { key, label, hora: h, cor: membros[0].color || null };
    }).sort((a, b) => a.hora.localeCompare(b.hora));



    const pontos = eixo.map((s) => {
      const valores = {};
      for (const [key, membros] of grupos) {
        let soma = 0, tem = false;
        for (const t of membros) {
          const v = valorDe(s, t.id);
          if (v != null && v > 0) { soma += v; tem = true; }
        }
        if (tem) valores[key] = soma;
      }
      return { ...s, valores };
    });


    const medias = {};
    for (const [key] of grupos) {
      const vals = pontos.map((p) => p.valores[key]).filter((v) => v != null);
      medias[key] = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    }

    lentes[lente] = { series, pontos, medias };
  }


  const ocupacao = eixo.map((s) => {
    let freq = 0, tem = false;
    for (const t of tiposOrdenados) {
      const v = valorDe(s, t.id);
      if (v != null && v > 0) { freq += v; tem = true; }
    }
    const vigentes = tiposOrdenados.filter((t) => tipoVigenteEm(t, s.domingo)).length;
    const capacidade = vigentes * (Number(capacidadeUnitaria) || 0);
    return {
      ...s,
      freq_total: tem ? freq : null,
      cultos_vigentes: vigentes,
      capacidade_total: capacidade,
      taxa: tem && capacidade > 0 ? Math.round((freq / capacidade) * 1000) / 10 : null,
    };
  });

  const domingoNovo = eixo.find((s) => s.domingo >= corte) || null;
  return {
    eixo,
    lentes,
    ocupacao,
    corte: { data: corte, domingo: domingoNovo?.domingo || null, label: domingoNovo?.label || null },
  };
}

module.exports = { CORTE_DOMINGO_0930, tipoVigenteEm, chaveDaSerie, turnoDoTipo, ROTULO_TURNO, eixoDomingos, montarLentes };
