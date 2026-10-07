












import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { CalendarRange, CalendarDays, List as ListIcon } from 'lucide-react';
import { planejamentoAnual as api } from '../../api';
import ModuleHeader from '../../components/layout/ModuleHeader';
import { C, cardStyle, input, hint, Badge, fmtQuando, rotuloArea } from '../planejamentoAnual/comum';
import PropostaDetalhe from './PropostaDetalhe';
import CalendarioExecucao, { mesInicial } from './CalendarioExecucao';
import Farol from './Farol';


const CORES_NATUREZA = { evento: C.blue, projeto: C.purple, rotina: C.primary };
const ROTULO_NATUREZA = { evento: 'Evento', projeto: 'Projeto', rotina: 'Rotina' };

const btnToggle = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 8,
  fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--hairline)',
  background: 'var(--cbrio-card)', color: C.t2,
};
const btnToggleAtivo = { background: C.primary, color: '#fff', border: `1px solid ${C.primary}` };

const thStyle = { textAlign: 'left', padding: '8px 10px', fontSize: 11.5, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: '1px solid var(--hairline)' };
const tdStyle = { padding: '9px 10px', fontSize: 13, color: C.text, borderBottom: '1px solid var(--hairline)', verticalAlign: 'top' };

export default function ExecucaoPlanejamento() {
  const [ciclos, setCiclos] = useState([]);
  const [areas, setAreas] = useState([]);
  const [cicloId, setCicloId] = useState('');
  const [natureza, setNatureza] = useState('');
  const [area, setArea] = useState('');
  const [propostas, setPropostas] = useState([]);
  const [carregando, setCarregando] = useState(true);





  const [view, setView] = useState('lista');
  const [mes, setMes] = useState(null);
  const [dia, setDia] = useState(null);
  const [selecionada, setSelecionada] = useState(null);
  const [soAtencao, setSoAtencao] = useState(false);
  const [propostaId, setPropostaId] = useState(() => new URLSearchParams(window.location.search).get('proposta'));

  useEffect(() => {
    api.ciclos.list().then((l) => setCiclos(Array.isArray(l) ? l : [])).catch(() => {});
    api.areas().then((l) => setAreas(Array.isArray(l) ? l : [])).catch(() => {});
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const params = {};
      if (cicloId) params.ciclo_id = cicloId;
      if (natureza) params.natureza = natureza;
      if (area) params.area = area;
      const lista = await api.execucao.propostas(Object.keys(params).length ? params : undefined);
      setPropostas(Array.isArray(lista) ? lista : []);
    } catch (e) {
      toast.error(e.message || 'Erro ao carregar as propostas aprovadas');
    } finally { setCarregando(false); }
  }, [cicloId, natureza, area]);
  useEffect(() => { carregar(); }, [carregar]);

  const mesExibido = mes || mesInicial(propostas);



  const contagem = useMemo(() => {
    const c = { vermelho: 0, amarelo: 0 };
    propostas.forEach((p) => { if (c[p.saude?.farol] !== undefined) c[p.saude.farol] += 1; });
    return c;
  }, [propostas]);
  const avisos = useMemo(() => propostas
    .flatMap((p) => (p.saude?.avisos || []).map((a) => ({ ...a, id: p.id, nome: p.nome })))
    .sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === 'vermelho' ? -1 : 1))
    .slice(0, 8), [propostas]);
  const visiveis = useMemo(
    () => (soAtencao ? propostas.filter((p) => p.saude?.farol === 'amarelo' || p.saude?.farol === 'vermelho') : propostas),
    [propostas, soAtencao],
  );


  const anoExibido = mesExibido.slice(0, 4);
  const [liturgicos, setLiturgicos] = useState([]);

  const [cultos, setCultos] = useState(() => { try { return localStorage.getItem('execucao.cultos') === '1'; } catch { return false; } });
  const alternarCultos = (v) => { setCultos(v); try { localStorage.setItem('execucao.cultos', v ? '1' : '0'); } catch {                   } };
  const [versaoFixos, setVersaoFixos] = useState(0);
  useEffect(() => {
    if (view !== 'calendario') return;
    let vivo = true;
    api.execucao.liturgicos(anoExibido, cultos)
      .then((l) => { if (vivo) setLiturgicos(Array.isArray(l) ? l : []); })
      .catch(() => { if (vivo) setLiturgicos([]); });
    return () => { vivo = false; };
  }, [view, anoExibido, cultos, versaoFixos]);

  const areasComPropostas = useMemo(() => areas, [areas]);

  if (propostaId) {
    return (
      <PropostaDetalhe
        id={propostaId}
        areas={areas}
        onVoltar={() => {
          setPropostaId(null);
          if (window.location.search.includes('proposta=')) window.history.replaceState(null, '', window.location.pathname);
          carregar();
        }}
      />
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px 40px' }}>
      <ModuleHeader
        icon={CalendarRange}
        title="Execução do Planejamento"
        subtitle="Propostas aprovadas do Planejamento Anual — detalhe somente-leitura e fases do Projeto/Evento vinculado"
      />

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        <button onClick={() => setView('lista')} style={{ ...btnToggle, ...(view === 'lista' ? btnToggleAtivo : {}) }}>
          <ListIcon size={14} /> Lista
        </button>
        <button onClick={() => setView('calendario')} style={{ ...btnToggle, ...(view === 'calendario' ? btnToggleAtivo : {}) }}>
          <CalendarDays size={14} /> Calendário
        </button>
        {view === 'calendario' && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 8, fontSize: 13, color: C.t2, cursor: 'pointer' }}>
            <input type="checkbox" checked={cultos} onChange={(e) => alternarCultos(e.target.checked)} />
            Cultos da semana
          </label>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ minWidth: 160 }}>
          <span style={{ ...hint, display: 'block', marginBottom: 3 }}>Ciclo</span>
          <select style={input} value={cicloId} onChange={(e) => setCicloId(e.target.value)}>
            <option value="">Todos os ciclos</option>
            {ciclos.map((c) => <option key={c.id} value={c.id}>Ciclo {c.ano}</option>)}
          </select>
        </div>
        <div style={{ minWidth: 160 }}>
          <span style={{ ...hint, display: 'block', marginBottom: 3 }}>Categoria (natureza)</span>
          <select style={input} value={natureza} onChange={(e) => setNatureza(e.target.value)}>
            <option value="">Todas</option>
            <option value="evento">Evento</option>
            <option value="projeto">Projeto</option>
            <option value="rotina">Rotina</option>
          </select>
        </div>
        <div style={{ minWidth: 200 }}>
          <span style={{ ...hint, display: 'block', marginBottom: 3 }}>Área</span>
          <select style={input} value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">Todas</option>
            {areasComPropostas.map((a) => <option key={a.area} value={a.area}>{a.rotulo || a.area}</option>)}
          </select>
        </div>
      </div>

      {(contagem.vermelho + contagem.amarelo > 0) && (
        <div style={{ ...cardStyle, padding: 14, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginBottom: avisos.length ? 10 : 0 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: C.text }}>Atenção</span>
            <Farol saude={{ farol: 'vermelho' }} />
            <span style={{ fontSize: 13, color: C.t2 }}>{contagem.vermelho}</span>
            <Farol saude={{ farol: 'amarelo' }} />
            <span style={{ fontSize: 13, color: C.t2 }}>{contagem.amarelo}</span>
            <label style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.t2, cursor: 'pointer' }}>
              <input type="checkbox" checked={soAtencao} onChange={(e) => setSoAtencao(e.target.checked)} />
              Só o que precisa de atenção
            </label>
          </div>
          {avisos.length > 0 && (
            <div style={{ display: 'grid', gap: 4 }}>
              {avisos.map((a, i) => (
                <div
                  key={`${a.id}-${i}`}
                  onClick={() => setPropostaId(a.id)}
                  style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: C.text, cursor: 'pointer', padding: '3px 0' }}
                >
                  <Farol saude={{ farol: a.nivel }} compacto />
                  <strong>{a.nome}</strong>
                  <span style={{ color: C.t2 }}>{a.texto}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {view === 'calendario' ? (
        <CalendarioExecucao
          propostas={visiveis} liturgicos={natureza || area ? [] : liturgicos} areas={areas} carregando={carregando}
          mes={mesExibido} onMes={setMes} dia={dia} onDia={setDia}
          selecionada={selecionada} onSelecionar={setSelecionada} onAbrir={setPropostaId}
          onRemanejar={async (corpo) => {
            try { await api.execucao.ajustarCalendario(corpo); toast.success('Data remanejada'); setVersaoFixos((v) => v + 1); return true; }
            catch (e) { toast.error(e.message || 'Não foi possível remanejar'); return false; }
          }}
          onDesfazer={async (itemId, dataOriginal) => {
            try { await api.execucao.desfazerAjusteCalendario(itemId, dataOriginal); toast.success('Voltou para a data da regra'); setVersaoFixos((v) => v + 1); }
            catch (e) { toast.error(e.message || 'Não foi possível desfazer'); }
          }}
        />
      ) : (
      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={thStyle}>Proposta</th>
              <th style={thStyle}>Natureza</th>
              <th style={thStyle}>Área</th>
              <th style={thStyle}>Líder</th>
              <th style={thStyle}>Data</th>
              <th style={thStyle}>Calendário</th>
              <th style={thStyle}>Vínculo</th>
              <th style={thStyle}>Saúde</th>
            </tr></thead>
            <tbody>
              {carregando && <tr><td style={tdStyle} colSpan={8}>Carregando…</td></tr>}
              {!carregando && !propostas.length && (
                <tr><td style={tdStyle} colSpan={8}>{soAtencao ? 'Nenhuma proposta precisa de atenção agora.' : 'Nenhuma proposta aprovada encontrada com estes filtros.'}</td></tr>
              )}
              {visiveis.map((p) => (
                <tr
                  key={p.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setPropostaId(p.id)}
                >
                  <td style={{ ...tdStyle, fontWeight: 600 }}>
                    {p.nome}
                    {p.fora_do_plano && (
                      <div style={{ marginTop: 4 }}><Badge texto="Fora do plano" cor={C.red} /></div>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <Badge texto={ROTULO_NATUREZA[p.natureza] || p.natureza} cor={CORES_NATUREZA[p.natureza] || C.primary} />
                  </td>
                  <td style={tdStyle}>{rotuloArea(p.area, areas)}</td>
                  <td style={tdStyle}>{p.lider_nome || '—'}</td>
                  <td style={tdStyle}>{fmtQuando(p)}</td>
                  <td style={tdStyle}>
                    {p.fora_do_plano ? (
                      <Badge texto="Retirada do calendário" cor={C.red} />
                    ) : p.no_calendario ? (
                      <Badge texto="No calendário" cor={C.green} />
                    ) : (
                      <Badge texto="Aguardando calendário" cor={C.amber} />
                    )}
                  </td>
                  <td style={tdStyle}>
                    {p.vinculo?.tipo === 'projeto' && <Badge texto="Projeto criado" cor={C.purple} />}
                    {p.vinculo?.tipo === 'evento' && <Badge texto="Evento criado" cor={C.blue} />}
                    {!p.vinculo?.tipo && p.natureza === 'rotina' && <span style={{ color: C.t3, fontSize: 12 }}>Fases na proposta</span>}
                    {!p.vinculo?.tipo && p.natureza !== 'rotina' && <span style={{ color: C.t3, fontSize: 12 }}>—</span>}
                  </td>
                  <td style={tdStyle}><Farol saude={p.saude} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  );
}
