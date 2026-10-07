



import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { rotinas as api } from '../../api';
import { C, cardStyle, hint, input } from '../planejamentoAnual/comum';

const PERIODOS = [
  { valor: 'semana', rotulo: 'Esta semana' },
  { valor: 'mes', rotulo: 'Este mês' },
  { valor: '30d', rotulo: 'Últimos 30 dias' },
];

const fmtDia = (iso) => `${String(iso).slice(8, 10)}/${String(iso).slice(5, 7)}`;


export function corDoPct(pct) {
  if (pct == null) return C.t3;
  if (pct >= 90) return C.green;
  if (pct >= 70) return C.amber;
  return C.red;
}

export function Barra({ r }) {
  const cor = corDoPct(r.pct);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 150 }}>
      <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--cbrio-border)', overflow: 'hidden' }}>
        <div style={{ width: `${r.pct ?? 0}%`, height: '100%', background: cor }} />
      </div>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: cor, minWidth: 38, textAlign: 'right' }}>
        {r.pct == null ? '—' : `${r.pct}%`}
      </span>
    </div>
  );
}

const celula = { padding: '7px 10px', fontSize: 13, color: C.text, borderBottom: '1px solid var(--hairline)', verticalAlign: 'middle' };
const cab = { ...celula, fontSize: 11.5, fontWeight: 700, color: C.t3, textTransform: 'uppercase', textAlign: 'left' };

function Cartao({ titulo, valor, cor }) {
  return (
    <div style={{ ...cardStyle, padding: 14, minWidth: 140, flex: '1 1 140px' }}>
      <div style={{ fontSize: 11.5, color: C.t3, textTransform: 'uppercase', fontWeight: 700 }}>{titulo}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: cor || C.text }}>{valor}</div>
    </div>
  );
}

function LinhaArea({ a }) {
  const [aberta, setAberta] = useState(false);
  return (
    <>
      <tr style={{ cursor: 'pointer' }} onClick={() => setAberta((v) => !v)} aria-expanded={aberta}>
        <td style={{ ...celula, fontWeight: 700 }}>{aberta ? '▾' : '▸'} {a.rotulo}</td>
        <td style={celula}><Barra r={a} /></td>
        <td style={celula}>{a.cumpridas}</td>
        <td style={{ ...celula, color: a.naoCumpridas ? C.red : C.text, fontWeight: a.naoCumpridas ? 700 : 400 }}>{a.naoCumpridas}</td>
        <td style={celula}>{a.emAberto}</td>
      </tr>
      {aberta && a.rotinas.map((r) => (
        <RotinaLinhas key={r.id} r={r} />
      ))}
    </>
  );
}

function RotinaLinhas({ r }) {
  return (
    <>
      <tr style={{ background: 'var(--cbrio-bg)' }}>
        <td style={{ ...celula, paddingLeft: 28, fontWeight: 600 }}>{r.nome}</td>
        <td style={celula}><Barra r={r} /></td>
        <td style={celula}>{r.cumpridas}</td>
        <td style={{ ...celula, color: r.naoCumpridas ? C.red : C.text }}>{r.naoCumpridas}</td>
        <td style={celula}>{r.emAberto}</td>
      </tr>
      {r.itens.map((i) => (
        <tr key={i.id}>
          <td style={{ ...celula, paddingLeft: 48, color: C.t2 }}>
            {i.titulo} <span style={{ color: C.t3 }}>· {i.responsavel_nome || '—'}</span>
          </td>
          <td style={celula}><Barra r={i} /></td>
          <td style={celula}>{i.cumpridas}</td>
          <td style={{ ...celula, color: i.naoCumpridas ? C.red : C.text }}>{i.naoCumpridas}</td>
          <td style={celula}>{i.emAberto}</td>
        </tr>
      ))}
    </>
  );
}

export default function PainelCumprimento() {
  const [periodo, setPeriodo] = useState('30d');
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try { setDados(await api.painel(periodo)); }
    catch (e) { toast.error(e.message || 'Erro ao carregar o painel'); }
    finally { setCarregando(false); }
  }, [periodo]);
  useEffect(() => { carregar(); }, [carregar]);

  const g = dados?.geral;
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <select style={{ ...input, width: 'auto' }} value={periodo} onChange={(e) => setPeriodo(e.target.value)} aria-label="Período">
          {PERIODOS.map((p) => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
        </select>
        {dados && <span style={hint}>{fmtDia(dados.de)} a {fmtDia(dados.ate)} · só tarefas planejadas (de rotina) que já venceram contam no percentual</span>}
      </div>

      {carregando && !dados && <p style={hint}>Carregando…</p>}

      {g && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Cartao titulo="Cumprimento" valor={g.pct == null ? '—' : `${g.pct}%`} cor={corDoPct(g.pct)} />
          <Cartao titulo="Cumpridas" valor={g.cumpridas} />
          <Cartao titulo="Não cumpridas" valor={g.naoCumpridas} cor={g.naoCumpridas ? C.red : undefined} />
          <Cartao titulo="Em aberto" valor={g.emAberto} />
        </div>
      )}

      {dados && dados.areas.length === 0 && (
        <div style={{ ...cardStyle, padding: 18 }}>
          <p style={{ margin: 0, fontSize: 13, color: C.t2 }}>
            Ainda não há rotinas com itens nas suas áreas. Cadastre uma rotina na aba "Rotinas" e inclua os itens do checklist.
          </p>
        </div>
      )}

      {dados && dados.areas.length > 0 && (
        <div style={{ ...cardStyle, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr><th style={cab}>Área · rotina · item</th><th style={cab}>Cumprimento</th><th style={cab}>Cumpridas</th><th style={cab}>Não cumpridas</th><th style={cab}>Em aberto</th></tr>
            </thead>
            <tbody>{dados.areas.map((a) => <LinhaArea key={a.area} a={a} />)}</tbody>
          </table>
        </div>
      )}

      {dados && dados.totalNaoCumpridas > 0 && (
        <div style={{ ...cardStyle, padding: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 8 }}>
            Não cumpridas ({dados.totalNaoCumpridas}{dados.totalNaoCumpridas > dados.naoCumpridas.length ? ` · mostrando as ${dados.naoCumpridas.length} mais recentes` : ''})
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            {dados.naoCumpridas.map((n, i) => (
              <div key={`${n.data}-${n.item}-${i}`} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12.5, color: C.text }}>
                <span style={{ color: C.red, fontWeight: 700, minWidth: 42 }}>{fmtDia(n.data)}</span>
                <strong>{n.item}</strong>
                <span style={{ color: C.t2 }}>{n.rotina} · {n.area}</span>
                <span style={{ color: C.t3 }}>{n.responsavel_nome || '—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
