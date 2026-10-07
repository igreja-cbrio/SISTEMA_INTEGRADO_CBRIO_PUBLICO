'use strict';








const regra = require('./marketingChecklist');

const RP = require('./marketingRedesPlano');

const TZ = 'America/Sao_Paulo';
const DIA_MS = 86400000;


const ROTINA_DESDE = '2026-09-27';

const utc = (s) => new Date(String(s).slice(0, 10) + 'T00:00:00Z');
const iso = (d) => d.toISOString().slice(0, 10);


function dataSP(v) {
  if (!v) return null;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d)) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

function semanasDoAno(ano) {
  const out = [];
  let ini = utc(`${ano}-01-01`);
  const fimAno = utc(`${ano}-12-31`);
  let n = 1;
  while (ini <= fimAno) {
    let fim = new Date(ini.getTime() + (6 - ini.getUTCDay()) * DIA_MS);
    if (fim > fimAno) fim = fimAno;
    out.push({ n, inicio: iso(ini), fim: iso(fim) });
    ini = new Date(fim.getTime() + DIA_MS);
    n++;
  }
  return out;
}



function semanaDe(data, semanas) {
  const d = dataSP(data);
  if (!d || !semanas.length) return null;
  if (d < semanas[0].inicio) return 0;
  const s = semanas.find(w => d >= w.inicio && d <= w.fim);
  return s ? s.n : null;
}


function domingoDe(data) {
  const d = utc(dataSP(data));
  return iso(new Date(d.getTime() - d.getUTCDay() * DIA_MS));
}


function prazoDoCard(c) {
  return dataSP(c.data_fim) || dataSP(c.prazo_producao) || dataSP(c.prazo_confirmado) || dataSP(c.prazo_preliminar);
}













const AREAS_TAREFA = { redes: 'prd' };

const temAreaDeTarefa = (area) => typeof area === 'string' && Object.prototype.hasOwnProperty.call(AREAS_TAREFA, area);
function ehTarefaInterna(c) {
  return !!c && !c.event_id && c.origem !== 'evento' && c.origem !== 'solicitacao'
    && !c.solicitacao_id && !c.campanha_id;
}
function frenteDoCard(c) {
  if (c.event_id || c.origem === 'evento') return 'ins';
  if (temAreaDeTarefa(c.area) && ehTarefaInterna(c)) return AREAS_TAREFA[c.area];
  return 'sis';
}




function validarAreaTarefa(valor) {
  if (valor === undefined) return { ausente: true };
  if (valor === null || valor === '') return { area: null };
  if (temAreaDeTarefa(valor)) return { area: valor };
  return { erro: 'Quadro inválido: a tarefa vai para Requisições ou para Redes · Produção' };
}





function origemRequisicao(card, campanha = null) {
  if (!card) return 'interna';
  if (card.solicitacao_id || card.origem === 'solicitacao') return 'externa';
  if (card.campanha_id && (!campanha || campanha.solicitacao_id)) return 'externa';
  return 'interna';
}





const AREAS_ROTINA = { institucional: 'rot', redes: 'red' };
const FRENTES_ROTINA = new Set(Object.values(AREAS_ROTINA));


const frenteDaArea = (area) => (Object.prototype.hasOwnProperty.call(AREAS_ROTINA, area) ? AREAS_ROTINA[area] : 'rot');
const ehFrenteRotina = (frente) => FRENTES_ROTINA.has(frente);










function contextoVerComo({ ctxReal, membros, membroId, role } = {}) {
  if (!ctxReal || !ctxReal.lider) return { erro: 'so_lider' };
  const ativos = (membros || []).filter(m => m && m.ativo !== false && !m.deleted_at);
  const alvo = ativos.find(m => String(m.id) === String(membroId));
  if (!alvo) return { erro: 'membro_invalido' };
  const daPessoa = alvo.profile_id ? ativos.filter(m => m.profile_id === alvo.profile_id) : [alvo];
  return {
    alvo,
    ctx: {
      lider: regra.ehLider({ role, habilidades: daPessoa.map(m => m.habilidade) }),
      nivel: 0,
      meusMembroIds: daPessoa.map(m => m.id),
    },
  };
}





function opcoesVerComo(ctxReal, membrosOut) {
  if (!ctxReal || !ctxReal.lider) return [];
  const meus = new Set(ctxReal.meusMembroIds || []);
  return (membrosOut || [])
    .filter(m => m && !meus.has(m.id))
    .map(m => ({ id: m.id, nome: m.nome }))
    .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
}




function recortarCard({ card, itens = [], ctx, responsaveisDoCulto = [] }) {
  const meus = ctx.meusMembroIds || [];
  const vis = card.visibilidade || 'equipe';
  const marca = (item) => regra.podeMarcarItem({ ...ctx, item, card });
  const comMarca = (lista) => lista.map(i => ({ ...i, pode_marcar: marca(i) }));

  if (ctx.lider) return { papel: 'lider', itens: comMarca(itens) };
  if (vis === 'so_lider') return null;
  const ehResp = !!card.atribuido_a && meus.includes(card.atribuido_a);
  if (vis === 'lider_move') {
    const doCulto = ehResp || responsaveisDoCulto.some(m => meus.includes(m));
    return doCulto ? { papel: 'responsavel', itens: comMarca(itens) } : null;
  }
  if (ehResp) return { papel: 'responsavel', itens: comMarca(itens) };
  const meusItens = itens.filter(i => i.membro_id && meus.includes(i.membro_id));
  return meusItens.length ? { papel: 'dono', itens: comMarca(meusItens) } : null;
}



function tarefaAberta({ estado, papel, itens }) {
  if (papel === 'dono') return itens.some(i => !i.feito);
  if (estado === 'concluido') return false;
  return !itens.length || itens.some(i => !i.feito);
}






function statusFrente(tarefas, semanaAtual) {
  const atrasadas = new Set();
  let pendentes = 0;
  for (const t of tarefas) {
    if (!t.aberta || t.semana == null || t.semana > semanaAtual) continue;
    pendentes++;
    if (t.semana < semanaAtual) atrasadas.add(t.semana);
  }
  return {
    status: atrasadas.size ? 'vermelho' : 'verde',
    pendentes,
    semanas_atrasadas: [...atrasadas].sort((a, b) => a - b),
  };
}








const SOLICITACAO_FECHADA = new Set(['concluido', 'avaliado', 'cancelado', 'rejeitado']);

function pedidosAbertos({ solicitacoes = [], campanhas = [], cards = [] } = {}) {
  const campDaSol = {};
  for (const c of campanhas) if (c && c.solicitacao_id) campDaSol[c.solicitacao_id] = c;
  const campComCard = new Set(cards.map(c => c && c.campanha_id).filter(Boolean));
  const solComCard = new Set(cards.map(c => c && c.solicitacao_id).filter(Boolean));
  const out = [];
  for (const sol of solicitacoes) {
    if (!sol || SOLICITACAO_FECHADA.has(sol.status) || solComCard.has(sol.id)) continue;
    const campanha = campDaSol[sol.id] || null;
    if (campanha && campComCard.has(campanha.id)) continue;
    const status = sol.status === 'aguardando_aprovacao_origem' ? 'aguardando_aprovacao'
      : campanha && campanha.status === 'triagem' ? 'aguardando_alocacao' : 'sem_tarefa';
    out.push({ sol, campanha, status });
  }
  return out;
}



function tituloDaRotinaMensal(descricao) {
  const t = String(descricao || '').trim();
  return (t.split(' · ')[0] || t).trim() || 'Rotina do mês';
}






function tarefasDaRotina({ compromissos, execucoes, semanas, ctx, frente = 'rot' }) {
  const feitos = new Set((execucoes || []).map(e => `${e.compromisso_id}|${e.membro_id}|${e.semana_inicio}`));
  const meus = ctx.meusMembroIds || [];
  const porChave = new Map();
  for (const c of compromissos || []) {
    const pessoas = [...new Set((c.participantes_ids || []).filter(Boolean))];
    const desde = [ROTINA_DESDE, c.created_at ? domingoDe(c.created_at) : ROTINA_DESDE].sort().pop();
    for (const m of pessoas) {
      if (!ctx.lider && !meus.includes(m)) continue;
      for (const w of semanas) {
        const domingo = domingoDe(w.inicio);
        if (domingo < desde) continue;


        const mensal = c.frequencia === 'mensal';
        if (mensal && !RP.compromissoNaSemana(c, domingo)) continue;
        const chave = mensal ? `${m}|${w.n}|${c.id}` : `${m}|${w.n}`;
        if (!porChave.has(chave)) {
          porChave.set(chave, mensal
            ? {
              id: `${frente}-${m}-${w.n}-${c.id}`, frente, membro_id: m, semana: w.n, semana_inicio: domingo, itens: [],
              mensal: true, compromisso_id: c.id, titulo: tituloDaRotinaMensal(c.descricao), tipo_rotina: c.tipo || 'comum',
              ...(c.tipo === 'planejamento_postagens' ? { mes_planejado: RP.mesDoPlanejamento(domingo) } : {}),
            }
            : { id: `${frente}-${m}-${w.n}`, frente, membro_id: m, semana: w.n, semana_inicio: domingo, itens: [] });
        }
        const feito = feitos.has(`${c.id}|${m}|${domingo}`);
        porChave.get(chave).itens.push({
          id: `${c.id}|${domingo}`, compromisso_id: c.id, texto: c.descricao, membro_id: m,
          dia_semana: c.dia_semana, hora_inicio: c.hora_inicio,
          esforco_valor: Number(c.duracao_h) || 0, esforco_unidade: 'horas',
          feito, pode_marcar: ctx.lider || meus.includes(m),
        });
      }
    }
  }

  return [...porChave.values()].map(t => ({ ...t, aberta: t.itens.some(i => !i.feito) }));
}

module.exports = {
  ROTINA_DESDE,
  dataSP,
  semanasDoAno,
  semanaDe,
  domingoDe,
  prazoDoCard,
  frenteDoCard,
  AREAS_TAREFA,
  ehTarefaInterna,
  validarAreaTarefa,
  origemRequisicao,
  AREAS_ROTINA,
  frenteDaArea,
  ehFrenteRotina,
  contextoVerComo,
  opcoesVerComo,
  recortarCard,
  tarefaAberta,
  statusFrente,
  SOLICITACAO_FECHADA,
  pedidosAbertos,
  tarefasDaRotina,
};
