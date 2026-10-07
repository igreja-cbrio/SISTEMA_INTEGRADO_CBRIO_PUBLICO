




import { useMemo, useState, useEffect } from 'react';
import { C, cardStyle, input, hint, Badge, fmtQuando, rotuloArea, MESES_LONGOS } from '../planejamentoAnual/comum';
import LegendaCalendario, { estiloChip } from '../planejamentoAnual/legendaCalendario';
import { feriadosNacionais } from '../../lib/feriadosBrasil';
import { DatePicker } from '@/components/ui/date-picker';

const CORES_NATUREZA = { evento: C.blue, projeto: C.purple, rotina: C.primary, liturgico: C.amber, culto: C.t3, rotina_fixa: C.t3, feriado: C.t3 };
const ROTULO_NATUREZA = { evento: 'Evento', projeto: 'Projeto', rotina: 'Rotina', liturgico: 'Litúrgico', culto: 'Culto', rotina_fixa: 'Rotina Staff', feriado: 'Feriado' };

const SEM_DETALHE = ['liturgico', 'culto', 'rotina_fixa', 'feriado'];
const WEEK_DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const pad = (n) => String(n).padStart(2, '0');
const isoLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtDiaCurto = (iso) => { const [, m, d] = iso.split('-'); return `${d}/${m}`; };



export function mesInicial(propostas, hoje = new Date()) {
  const datas = [];
  for (const p of propostas || []) {
    for (const d of p.calendario?.dias || []) datas.push(d);
    if (p.calendario?.mesSemDia) datas.push(`${p.calendario.mesSemDia}-01`);
  }
  if (!datas.length) return `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}`;
  datas.sort();
  const hojeIso = isoLocal(hoje);
  return (datas.find((d) => d >= hojeIso) || datas[0]).slice(0, 7);
}

function indices(propostas) {
  const porDia = {};
  const semDiaPorMes = {};
  for (const p of propostas || []) {
    for (const d of p.calendario?.dias || []) (porDia[d] = porDia[d] || []).push(p);
    const m = p.calendario?.mesSemDia;
    if (m) (semDiaPorMes[m] = semDiaPorMes[m] || []).push(p);
  }
  return { porDia, semDiaPorMes };
}

function LinhaProposta({ p, areas, ativa, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', flexWrap: 'wrap',
        border: `1px solid ${ativa ? C.primary : 'var(--hairline)'}`, background: ativa ? C.primaryBg : 'transparent',
      }}
    >
      <Badge texto={ROTULO_NATUREZA[p.natureza] || p.natureza} cor={CORES_NATUREZA[p.natureza] || C.primary} />
      <span style={{ fontWeight: 600, fontSize: 13, color: C.text }}>{p.nome}</span>
      <span style={{ fontSize: 12, color: C.t3 }}>{SEM_DETALHE.includes(p.natureza) ? p.horarios : rotuloArea(p.area, areas)}</span>
      {p.lider_nome && <span style={{ fontSize: 12, color: C.t3, marginLeft: 'auto' }}>{p.lider_nome}</span>}
    </div>
  );
}







function RemanejarOcorrencia({ item, dia, onRemanejar, onDesfazer }) {
  const original = item.remanejadas?.[dia] || dia;
  const foiRemanejada = Boolean(item.remanejadas?.[dia]);
  const [nova, setNova] = useState(dia);
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { setNova(dia); setMotivo(''); }, [dia, item.id]);

  const enviar = async (dataNova) => {
    setSalvando(true);
    try { await onRemanejar({ item_id: item.id, data_original: original, data_nova: dataNova, motivo }); }
    finally { setSalvando(false); }
  };
  return (
    <div style={{ borderTop: '1px solid var(--hairline)', marginTop: 10, paddingTop: 10, display: 'grid', gap: 8 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text }}>
        Remanejar {fmtDiaCurto(dia)}
        {foiRemanejada && <span style={{ fontWeight: 400, color: C.t3 }}> · adiado de {fmtDiaCurto(original)}</span>}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ minWidth: 170 }}><DatePicker value={nova} onChange={setNova} clearable={false} /></div>
        <input
          placeholder="Motivo (opcional)" value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)}
          style={{ ...input, flex: '1 1 180px', width: 'auto' }}
        />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button style={{ ...input, width: 'auto', cursor: 'pointer', fontWeight: 600, color: C.primary }}
          disabled={salvando || !nova || nova === dia} onClick={() => enviar(nova)}>Remanejar para {nova && nova !== dia ? fmtDiaCurto(nova) : 'a nova data'}</button>
        <button style={{ ...input, width: 'auto', cursor: 'pointer', color: C.red }} disabled={salvando} onClick={() => enviar(null)}>
          Não acontece neste dia
        </button>
        {foiRemanejada && (
          <button style={{ ...input, width: 'auto', cursor: 'pointer' }} disabled={salvando} onClick={() => onDesfazer(item.id, original)}>
            Voltar para {fmtDiaCurto(original)}
          </button>
        )}
      </div>
    </div>
  );
}

export default function CalendarioExecucao({ propostas, liturgicos = [], areas, carregando, mes, onMes, dia, onDia, selecionada, onSelecionar, onAbrir, onRemanejar, onDesfazer }) {

  const anoGrade = Number(mes.slice(0, 4));
  const feriados = useMemo(() => feriadosNacionais(anoGrade).map((f) => ({
    id: `feriado:${f.data}`, natureza: 'feriado', categoria: 'feriado', nome: f.nome,
    descricao: f.tipo === 'movel' ? 'Feriado nacional (móvel).' : 'Feriado nacional.', horarios: '',
    calendario: { dias: [f.data], mesSemDia: null },
  })), [anoGrade]);
  const itens = useMemo(() => [...feriados, ...(propostas || []), ...liturgicos], [feriados, propostas, liturgicos]);
  const { porDia, semDiaPorMes } = useMemo(() => indices(itens), [itens]);
  const [year, month0] = mes.split('-').map(Number);
  const month = month0 - 1;
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = isoLocal(new Date());
  const semData = semDiaPorMes[mes] || [];
  const irPara = (delta) => { const d = new Date(year, month + delta, 1); onMes(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`); };

  const days = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  const doDia = dia ? (porDia[dia] || []) : [];
  const escolhida = itens.find((p) => p.id === selecionada) || null;


  const ajustesDoAno = useMemo(() => liturgicos.flatMap((l) => (l.ajustes || [])
    .map((a) => ({ ...a, item_id: l.id, nome: l.nome, pode: Boolean(l.pode_remanejar) }))), [liturgicos]);
  const ehLiturgico = SEM_DETALHE.includes(escolhida?.natureza);
  const totalNoMes = new Set([
    ...Object.entries(porDia).filter(([k]) => k.startsWith(mes)).flatMap(([, l]) => l.map((p) => p.id)),
    ...semData.map((p) => p.id),
  ]).size;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid var(--hairline)' }}>
          <button onClick={() => irPara(-1)} aria-label="Mês anterior" style={{ ...input, width: 'auto', padding: '4px 10px', cursor: 'pointer' }}>‹</button>
          <span style={{ fontWeight: 700, fontSize: 15, color: C.text, textAlign: 'center' }}>
            {MESES_LONGOS[month]} {year}
            <span style={{ display: 'block', fontSize: 11.5, fontWeight: 400, color: C.t3 }}>
              {carregando ? 'Carregando…' : `${totalNoMes} ${totalNoMes === 1 ? 'proposta' : 'propostas'} neste mês`}
            </span>
          </span>
          <button onClick={() => irPara(1)} aria-label="Próximo mês" style={{ ...input, width: 'auto', padding: '4px 10px', cursor: 'pointer' }}>›</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--hairline)' }}>
          {WEEK_DAYS.map((d) => (
            <div key={d} style={{ padding: '8px 0', textAlign: 'center', fontSize: 11, fontWeight: 700, color: C.t3, textTransform: 'uppercase' }}>{d}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {days.map((d, i) => {
            if (!d) return <div key={`e${i}`} style={{ minHeight: 80, borderRight: '1px solid var(--hairline)', borderBottom: '1px solid var(--hairline)' }} />;
            const ds = `${mes}-${pad(d)}`;
            const evs = porDia[ds] || [];
            const isToday = ds === today;
            return (
              <div
                key={d}
                onClick={() => onDia(ds === dia ? null : ds)}
                style={{
                  minHeight: 80, padding: '4px 6px', cursor: 'pointer', minWidth: 0,
                  borderRight: '1px solid var(--hairline)', borderBottom: '1px solid var(--hairline)',
                  background: ds === dia ? C.primaryBg : 'var(--cbrio-card)',
                }}
              >
                <div style={{
                  fontSize: 12, fontWeight: isToday ? 800 : 400, marginBottom: 4, color: isToday ? '#fff' : C.text,
                  ...(isToday ? { background: C.primary, borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' } : {}),
                }}>{d}</div>
                {evs.slice(0, 3).map((p) => (
                  <div key={p.id} style={{
                    fontSize: 10, padding: '1px 4px', marginBottom: 2, borderRadius: 4, overflow: 'hidden',
                    whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                    ...estiloChip(p),
                  }}>{p.nome}</div>
                ))}
                {evs.length > 3 && <div style={{ fontSize: 9, color: C.t3, fontWeight: 600 }}>+{evs.length - 3} mais</div>}
              </div>
            );
          })}
        </div>
      </div>

      <LegendaCalendario />

      {!carregando && !(propostas || []).length && (
        <div style={{ ...cardStyle, padding: 14 }}><p style={{ ...hint, margin: 0 }}>Nenhuma proposta aprovada encontrada com estes filtros.</p></div>
      )}

      {dia && (
        <div style={{ ...cardStyle, padding: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 8 }}>
            {doDia.length ? `${doDia.length} no dia ${fmtDiaCurto(dia)}` : `Nada marcado para o dia ${fmtDiaCurto(dia)}`}
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {doDia.map((p) => <LinhaProposta key={p.id} p={p} areas={areas} ativa={p.id === selecionada} onClick={() => onSelecionar(p.id === selecionada ? null : p.id)} />)}
          </div>
        </div>
      )}

      {ajustesDoAno.length > 0 && (
        <div style={{ ...cardStyle, padding: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 8 }}>Datas remanejadas ({ajustesDoAno.length})</div>
          <div style={{ display: 'grid', gap: 4 }}>
            {ajustesDoAno.map((a) => (
              <div key={`${a.item_id}-${a.data_original}`} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12.5, color: C.text }}>
                <strong>{a.nome}</strong>
                <span style={{ color: C.t2 }}>
                  {a.data_nova ? `${fmtDiaCurto(a.data_original)} → ${fmtDiaCurto(a.data_nova)}` : `${fmtDiaCurto(a.data_original)} não acontece`}
                  {a.motivo ? ` · ${a.motivo}` : ''}
                </span>
                {a.pode && (
                  <button style={{ ...input, width: 'auto', padding: '2px 8px', fontSize: 11.5, cursor: 'pointer', marginLeft: 'auto' }}
                    onClick={() => onDesfazer(a.item_id, a.data_original)}>Desfazer</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {semData.length > 0 && (
        <div style={{ ...cardStyle, padding: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 8 }}>Sem dia exato em {MESES_LONGOS[month]} ({semData.length})</div>
          <p style={hint}>Estas propostas têm só o mês definido, por isso não caem num dia da grade acima.</p>
          <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
            {semData.map((p) => <LinhaProposta key={p.id} p={p} areas={areas} ativa={p.id === selecionada} onClick={() => onSelecionar(p.id === selecionada ? null : p.id)} />)}
          </div>
        </div>
      )}

      {escolhida && (
        <div style={{ ...cardStyle, padding: 14, borderColor: C.primary }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
            <Badge texto={ROTULO_NATUREZA[escolhida.natureza] || escolhida.natureza} cor={CORES_NATUREZA[escolhida.natureza] || C.primary} />
            <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{escolhida.nome}</span>
          </div>
          {ehLiturgico ? (
            <div style={{ fontSize: 12, color: C.t2, marginBottom: 8 }}>{escolhida.horarios}</div>
          ) : (
          <div style={{ fontSize: 12, color: C.t2, marginBottom: 8 }}>
            {fmtQuando(escolhida)}
            {escolhida.hora_inicio ? ` · ${String(escolhida.hora_inicio).slice(0, 5)}${escolhida.hora_fim ? `–${String(escolhida.hora_fim).slice(0, 5)}` : ''}` : ''}
            {' · '}{rotuloArea(escolhida.area, areas)}
            {escolhida.lider_nome ? ` · ${escolhida.lider_nome}` : ''}
          </div>
          )}
          <p style={{ margin: '0 0 10px', fontSize: 13, color: C.text, whiteSpace: 'pre-wrap' }}>
            {escolhida.descricao?.trim() || 'Esta proposta não tem descrição.'}
          </p>
          {!ehLiturgico && (
            <button
              onClick={() => onAbrir(escolhida.id)}
              style={{ ...input, width: 'auto', padding: '5px 12px', cursor: 'pointer', fontWeight: 600, color: C.primary }}
            >Ver detalhe →</button>
          )}
          {escolhida.pode_remanejar && dia && (escolhida.calendario?.dias || []).includes(dia) && (
            <RemanejarOcorrencia item={escolhida} dia={dia} onRemanejar={onRemanejar} onDesfazer={onDesfazer} />
          )}
        </div>
      )}
    </div>
  );
}
