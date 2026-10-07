


































const MS_DIA = 86400000;
const OFFSET_BRT = 3 * 3600 * 1000;






const ENCAMINHAMENTOS = [
  { v: 'grupo', l: 'Grupo' },
  { v: 'next', l: 'Next' },
  { v: 'batismo', l: 'Batismo' },
  { v: 'servir', l: 'Servir' },
  { v: 'cuidado', l: 'Cuidado pastoral' },
  { v: 'outro', l: 'Outro' },
];
const IDS_ENCAMINHAMENTO = ENCAMINHAMENTOS.map((e) => e.v);







const DESFECHOS = [
  { v: 'encaminhada', l: 'Encaminhei para algo', exigeEncaminhamento: true },
  { v: 'sem_necessidade', l: 'Conversamos, sem necessidade agora' },
  { v: 'nao_alcancada', l: 'Não consegui falar' },
];
const IDS_DESFECHO = DESFECHOS.map((d) => d.v);













const FLUXOS = {
  visitante: {
    porta: 'visitante',
    label: 'Visitante',
    refTipo: 'vis_visitas',
    modulo: 'cuidados',
    baseData: 'created_at',
    etapas: [
      {
        chave: 'registro',
        label: 'Registrou a visita',
        quem: 'A pessoa, no QR do cartaz',
        dependeDaPessoa: true,
        prazoDias: 0,
        evidencia: { tipo: 'campo', campo: 'created_at' },
      },
      {
        chave: 'voucher',
        label: 'Retirou o café',
        quem: 'Cafeteria',
        dependeDaPessoa: true,
        prazoDias: 0,
        evidencia: { tipo: 'campoUm', campo: 'voucher_status', de: ['resgatado'], campoData: 'voucher_resgatado_em' },
      },
      {
        chave: 'pesquisa',
        label: 'Respondeu a pesquisa',
        quem: 'A pessoa, no WhatsApp',
        dependeDaPessoa: true,
        prazoDias: 3,
        evidencia: { tipo: 'campo', campo: 'pesquisa_respondida_em' },
      },
      {
        chave: 'contato',
        label: 'Falar com ela',
        quem: 'Integração',
        prazoDias: 1,
        evidencia: { tipo: 'campo', campo: 'primeiro_contato_em' },
      },
      {
        chave: 'desfecho',
        label: 'Encerrar com desfecho',
        quem: 'Integração',
        prazoDias: 3,
        encerra: true,
        evidencia: { tipo: 'acao' },
      },
    ],
  },
};

const PORTAS = Object.keys(FLUXOS);

function fluxoDaPorta(porta) {
  return FLUXOS[String(porta || '')] || null;
}


function etapasCobradas(porta) {
  const f = fluxoDaPorta(porta);
  return f ? f.etapas.filter((e) => !e.dependeDaPessoa) : [];
}


function prazoDaEtapa(baseEm, prazoDias) {
  const t = new Date(baseEm).getTime();
  if (!Number.isFinite(t)) return null;
  const diaBrt = Math.floor((t - OFFSET_BRT) / MS_DIA);
  const dias = Number.isFinite(Number(prazoDias)) ? Number(prazoDias) : 0;

  return (diaBrt + dias + 1) * MS_DIA + OFFSET_BRT;
}

function _ms(v) {
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}





function evidenciaDaEtapa(etapa, registro, acoes) {
  const ev = etapa.evidencia || {};
  if (ev.tipo === 'acao') {
    const a = acoes && acoes[etapa.chave];
    return a ? { feito: true, em: _ms(a.feito_em) } : { feito: false, em: null };
  }
  const valor = registro ? registro[ev.campo] : null;
  if (ev.tipo === 'campoUm') {
    const ok = Array.isArray(ev.de) && ev.de.includes(valor);

    return { feito: ok, em: ok ? _ms(registro[ev.campoData] || null) : null };
  }
  const em = _ms(valor);
  return { feito: em != null, em };
}














function situacaoEtapa({ porta, etapa, registro, acoes, agora, encerrado }) {
  const ev = evidenciaDaEtapa(etapa, registro, acoes);
  if (ev.feito) return 'feito';
  if (encerrado) return 'dispensada';
  if (etapa.dependeDaPessoa) return 'aguardando';
  const f = fluxoDaPorta(porta);
  const base = registro ? registro[(f && f.baseData) || 'created_at'] : null;
  const prazo = prazoDaEtapa(base, etapa.prazoDias);
  if (prazo == null) return 'no_prazo';
  const now = agora instanceof Date ? agora.getTime() : (typeof agora === 'number' ? agora : Date.now());
  if (now >= prazo) return 'atrasado';

  const fimDeHoje = (Math.floor((now - OFFSET_BRT) / MS_DIA) + 1) * MS_DIA + OFFSET_BRT;
  return prazo <= fimDeHoje ? 'vence_hoje' : 'no_prazo';
}









function estadoDoFluxo({ porta, registro, acoes, agora }) {
  const f = fluxoDaPorta(porta);
  if (!f || !registro) return null;
  const mapa = acoes || {};



  const chaveEncerra = (f.etapas.find((e) => e.encerra) || {}).chave;
  const acaoDesfecho = (chaveEncerra && mapa[chaveEncerra]) || null;
  const encerrado = !!acaoDesfecho;
  const etapas = f.etapas.map((e) => {
    const etapa = e;
    const ev = evidenciaDaEtapa(etapa, registro, mapa);
    return {
      chave: e.chave,
      label: e.label,
      quem: e.quem,



      depende_da_pessoa: !!e.dependeDaPessoa,
      encerra: !!e.encerra,
      prazo_em: prazoDaEtapa(registro[f.baseData], e.prazoDias),
      feito_em: ev.em,
      situacao: situacaoEtapa({ porta: f.porta, etapa, registro, acoes: mapa, agora, encerrado: encerrado && !ev.feito }),
    };
  });
  const cobradas = etapas.filter((e) => !e.depende_da_pessoa);
  const atrasadas = cobradas.filter((e) => e.situacao === 'atrasado').map((e) => e.chave);
  const pendentes = cobradas.filter((e) => e.situacao !== 'feito' && e.situacao !== 'dispensada');
  return {
    porta: f.porta,
    label: f.label,
    encerrado,
    desfecho: acaoDesfecho ? acaoDesfecho.resultado || null : null,
    encaminhamento: acaoDesfecho ? acaoDesfecho.encaminhamento || null : null,
    etapas,
    atual: pendentes.length ? pendentes[0].chave : null,
    atrasadas,
    cobradas_pendentes: pendentes.length,
  };
}











function adesaoDoFluxo({ porta, itens, agora }) {
  const f = fluxoDaPorta(porta);
  if (!f) return null;
  const lista = Array.isArray(itens) ? itens : [];
  const porEtapa = {};
  for (const e of etapasCobradas(porta)) {
    porEtapa[e.chave] = { label: e.label, feito: 0, atrasado: 0, no_prazo: 0, dispensada: 0 };
  }
  let encerrados = 0;
  for (const it of lista) {
    const st = estadoDoFluxo({ porta, registro: it.registro, acoes: it.acoes, agora });
    if (!st) continue;
    if (st.encerrado) encerrados += 1;
    for (const e of st.etapas) {
      if (e.depende_da_pessoa) continue;
      const alvo = porEtapa[e.chave];
      if (!alvo) continue;
      if (e.situacao === 'feito') alvo.feito += 1;
      else if (e.situacao === 'atrasado') alvo.atrasado += 1;
      else if (e.situacao === 'dispensada') alvo.dispensada += 1;
      else alvo.no_prazo += 1;
    }
  }
  let feitas = 0, vencidas = 0;
  for (const k of Object.keys(porEtapa)) {
    feitas += porEtapa[k].feito;
    vencidas += porEtapa[k].feito + porEtapa[k].atrasado;
  }
  return {
    porta: f.porta,
    pessoas: lista.length,
    encerrados,
    por_etapa: porEtapa,

    adesao_pct: vencidas ? Math.round((feitas / vencidas) * 100) : null,
    vencidas,
  };
}


function validarDesfecho({ resultado, encaminhamento }) {
  const r = String(resultado || '').trim();
  if (!IDS_DESFECHO.includes(r)) return { ok: false, erro: 'Escolha como o fluxo terminou.', campo: 'resultado' };
  const def = DESFECHOS.find((d) => d.v === r);
  const enc = String(encaminhamento || '').trim();
  if (def.exigeEncaminhamento) {
    if (!enc) return { ok: false, erro: 'Diga para onde você encaminhou.', campo: 'encaminhamento' };
    if (!IDS_ENCAMINHAMENTO.includes(enc)) return { ok: false, erro: 'Destino desconhecido.', campo: 'encaminhamento' };
  } else if (enc && !IDS_ENCAMINHAMENTO.includes(enc)) {
    return { ok: false, erro: 'Destino desconhecido.', campo: 'encaminhamento' };
  }
  return { ok: true, resultado: r, encaminhamento: enc || null };
}

module.exports = {
  FLUXOS, PORTAS, ENCAMINHAMENTOS, IDS_ENCAMINHAMENTO, DESFECHOS, IDS_DESFECHO,
  fluxoDaPorta, etapasCobradas, prazoDaEtapa, evidenciaDaEtapa, situacaoEtapa,
  estadoDoFluxo, adesaoDoFluxo, validarDesfecho,
};
