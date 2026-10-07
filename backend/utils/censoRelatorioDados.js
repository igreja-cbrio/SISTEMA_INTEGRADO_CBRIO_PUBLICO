






























const MINIMO_POR_CELULA = 25;





const CRUZAMENTOS = Object.freeze([
  {
    id: 'engajamento_por_tempo',
    eixo: 'Há quanto tempo frequenta?',
    metricas: ['Você participa de um Grupo?', 'Você serve na CBRio?', 'Você já fez o Next?', 'Você já foi batizado?'],
    motivo: 'Saber em que ponto da jornada a pessoa se conecta — e onde ela fica de fora.',
  },
  {
    id: 'engajamento_por_next',
    eixo: 'Você já fez o Next?',
    metricas: ['Você participa de um Grupo?', 'Você serve na CBRio?', 'Você contribui regularmente?'],
    controle: 'Há quanto tempo frequenta?',
    motivo: 'O Next é a porta de entrada declarada. Medir se quem passa por ele se conecta mais — controlando por tempo de casa, senão o efeito é só antiguidade.',
  },
  {
    id: 'engajamento_por_filhos',
    eixo: 'Tem filhos?',
    metricas: ['Você participa de um Grupo?', 'Você serve na CBRio?'],
    controle: 'Há quanto tempo frequenta?',
    motivo: 'Testar a explicação comum de que pais não têm tempo para grupo.',
  },
  {
    id: 'engajamento_por_canal',
    eixo: 'Como você frequenta a CBRio',
    metricas: ['Você participa de um Grupo?', 'Você serve na CBRio?', 'Você contribui regularmente?'],
    motivo: 'Quem acompanha pelo online está conectado de outras formas, ou só assiste?',
  },
]);


const ORDEM_TEMPO = Object.freeze([
  'Menos de 6 meses', 'De 6 meses a 1 ano', 'De 1 a 3 anos', 'De 3 a 5 anos', 'Mais de 5 anos',
]);

function ordenarEixo(rotulo, valores) {
  if (rotulo === 'Há quanto tempo frequenta?') {
    return [...valores].sort((a, b) => ORDEM_TEMPO.indexOf(a) - ORDEM_TEMPO.indexOf(b));
  }
  return [...valores].sort();
}

const pct = (parte, total) => (total > 0 ? Math.round((parte / total) * 1000) / 10 : null);





function montarPerfil(agregado) {
  if (!Array.isArray(agregado)) return [];
  const porPergunta = new Map();
  for (const l of agregado) {
    if (!l?.pergunta_texto || l.valor == null) continue;
    if (!porPergunta.has(l.pergunta_texto)) porPergunta.set(l.pergunta_texto, []);
    porPergunta.get(l.pergunta_texto).push({ valor: String(l.valor), n: Number(l.total) || 0 });
  }
  const out = [];
  for (const [pergunta, linhas] of porPergunta) {
    const total = linhas.reduce((s, x) => s + x.n, 0);
    if (total <= 0) continue;
    out.push({
      pergunta,
      base: total,
      opcoes: linhas
        .sort((a, b) => b.n - a.n)
        .map((x) => ({ valor: x.valor, n: x.n, pct: pct(x.n, total) })),
    });
  }
  return out;
}







function montarCruzamentos(pessoas) {
  if (!Array.isArray(pessoas) || pessoas.length === 0) return [];
  const saida = [];

  for (const c of CRUZAMENTOS) {
    const controles = c.controle
      ? ordenarEixo(c.controle, [...new Set(pessoas.map((p) => p?.[c.controle]).filter(Boolean))])
      : [null];

    const faixas = [];
    for (const ctrl of controles) {
      const base = ctrl == null ? pessoas : pessoas.filter((p) => p?.[c.controle] === ctrl);
      const valoresEixo = ordenarEixo(c.eixo, [...new Set(base.map((p) => p?.[c.eixo]).filter(Boolean))]);

      for (const v of valoresEixo) {
        const grupo = base.filter((p) => p?.[c.eixo] === v);
        const metricas = {};
        for (const m of c.metricas) {
          const comDado = grupo.filter((p) => p?.[m] != null);









          if (comDado.length < MINIMO_POR_CELULA) continue;
          metricas[m] = {
            n: comDado.length,
            sim: comDado.filter((p) => String(p[m]).toLowerCase() === 'sim').length,
            pct_sim: pct(comDado.filter((p) => String(p[m]).toLowerCase() === 'sim').length, comDado.length),
          };
        }
        if (Object.keys(metricas).length) {
          faixas.push({ controle: ctrl, valor: v, pessoas: grupo.length, metricas });
        }
      }
    }
    if (faixas.length) saida.push({ id: c.id, eixo: c.eixo, controle: c.controle || null, motivo: c.motivo, faixas });
  }
  return saida;
}












function numerosDisponiveis(perfil, cruzamentos) {
  const nums = new Set();
  for (const p of perfil || []) {
    nums.add(p.base);
    for (const o of p.opcoes || []) { nums.add(o.n); if (o.pct != null) nums.add(o.pct); }
  }
  for (const c of cruzamentos || []) {
    for (const f of c.faixas || []) {
      nums.add(f.pessoas);
      for (const m of Object.values(f.metricas || {})) {
        nums.add(m.n); nums.add(m.sim); if (m.pct_sim != null) nums.add(m.pct_sim);
      }
    }
  }
  return nums;
}


function citaNumeroReal(valor, nums) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return false;
  for (const d of nums) if (Math.abs(d - n) <= 1) return true;
  return false;
}






function filtrarRecomendacoes(itens, perfil, cruzamentos) {
  const nums = numerosDisponiveis(perfil, cruzamentos);
  const mantidas = [];
  const descartadas = [];
  for (const it of itens || []) {
    if (citaNumeroReal(it?.base_numerica, nums)) mantidas.push(it);
    else descartadas.push({ titulo: it?.titulo || '(sem título)', base_numerica: it?.base_numerica ?? null });
  }
  return { mantidas, descartadas };
}







function materialDoPerfil(perfil) {
  return (perfil || []).map((p) => [
    `### ${p.pergunta}  (base: ${p.base})`,
    ...p.opcoes.map((o) => `- ${o.valor}: ${o.n} (${o.pct}%)`),
  ].join('\n')).join('\n\n');
}








function materialDosCruzamentos(cruzamentos) {
  return (cruzamentos || []).map((c) => {
    const linhas = c.faixas.map((f) => {
      const chave = [c.controle ? `${c.controle}=${f.controle}` : null, `${c.eixo}=${f.valor}`]
        .filter(Boolean).join(' · ');
      const ms = Object.entries(f.metricas)
        .map(([m, v]) => `${m}: ${v.pct_sim}% sim (${v.sim}/${v.n})`).join(' · ');
      return `- ${chave} [${f.pessoas} pessoas] → ${ms}`;
    });
    return [`### ${c.eixo}${c.controle ? ` (controlando por ${c.controle})` : ''}`,
      `Por que a igreja quis saber: ${c.motivo}`, ...linhas].join('\n');
  }).join('\n\n');
}

module.exports = {
  MINIMO_POR_CELULA, CRUZAMENTOS, ORDEM_TEMPO,
  montarPerfil, montarCruzamentos,
  numerosDisponiveis, citaNumeroReal, filtrarRecomendacoes,
  materialDoPerfil, materialDosCruzamentos,
};
