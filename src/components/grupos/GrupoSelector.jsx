

















import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { grupos as authApi, gruposPublic } from '../../api';

import { normalizarBusca, contemNormalizado, algumContemNormalizado } from '../../lib/busca';
import { Input } from '../ui/input';
import { Search, MapPin, Clock, User as UserIcon, Users, List as ListIcon, Map as MapIcon } from 'lucide-react';
import DescricaoGrupo from './DescricaoGrupo';
import { GruposMapView } from './GruposMapView';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  primary: '#00B39D', primaryBg: '#00B39D18',
};

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const DIAS_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];



const RECORRENCIA_LABEL = { diario: 'Diário', semanal: 'Semanal', quinzenal: 'Quinzenal', mensal: 'Mensal' };
const RECORRENCIA_ORDEM = ['diario', 'semanal', 'quinzenal', 'mensal'];
const recorrenciaLabel = (r) => RECORRENCIA_LABEL[r] || (r ? r.charAt(0).toUpperCase() + r.slice(1) : '');


const ehDiario = (g) => (g?.recorrencia || '').toLowerCase().trim() === 'diario';



function proximaAbertura() {
  const mes = new Date().getMonth();
  if (mes < 2) return 'em março';
  if (mes < 7) return 'em agosto';
  return 'em março do ano que vem';
}

const selStyle = {
  padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`,


  fontSize: 16, background: 'var(--cbrio-input-bg)', color: C.text, flex: 1, minWidth: 150,
};

function Pill({ ativo, onClick, children }) {
  return (
    <button onClick={onClick} type="button" style={{
      padding: '6px 14px', borderRadius: 999, cursor: 'pointer', fontSize: 12,
      fontWeight: ativo ? 700 : 500,
      border: `1px solid ${ativo ? C.primary : C.border}`,
      background: ativo ? C.primaryBg : 'transparent',
      color: ativo ? C.primary : C.t2,
      display: 'inline-flex', alignItems: 'center', gap: 6,
    }}>{children}</button>
  );
}







export default function GrupoSelector({ onSelect, selectedGrupoId, mode = 'full', temporadaId, usePublicApi = false, preferirAberta = false, onInscrever }) {
  const api = usePublicApi ? gruposPublic : authApi;
  const full = mode !== 'simple';


  const isMobile = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 640px)').matches;

  const [temporada, setTemporada] = useState(temporadaId || '');
  const [grupos, setGrupos] = useState([]);
  const [loading, setLoading] = useState(false);



  const [erroCarga, setErroCarga] = useState(null);
  const [tentativa, setTentativa] = useState(0);

  const [searchMode, setSearchMode] = useState('grupo');
  const [busca, setBusca] = useState('');
  const [fCategoria, setFCategoria] = useState('');
  const [fFaixa, setFFaixa] = useState('');
  const [fBairro, setFBairro] = useState('');
  const [fDia, setFDia] = useState('');
  const [fRecorrencia, setFRecorrencia] = useState('');
  const [view, setView] = useState('lista');


  const [temporadaOpcoes, setTemporadaOpcoes] = useState([]);


  const [temporadaAberta, setTemporadaAberta] = useState({});


  useEffect(() => {
    if (temporadaId) setTemporada(temporadaId);
    api.temporadas().then(ts => {
      const lista = ts || [];
      const mapa = {};
      lista.forEach(t => { mapa[t.id] = t.inscricoes_abertas === true; });
      setTemporadaAberta(mapa);
      const ativa = lista.find(t => t.ativa);
      const aberta = lista.find(t => t.inscricoes_abertas);
      if (!temporadaId) {
        const escolha = (preferirAberta && aberta) ? aberta : (ativa || aberta);
        if (escolha) setTemporada(escolha.id);
      }
      const ops = [];
      if (ativa) ops.push({ id: ativa.id, label: ativa.label || ativa.id });
      for (const t of lista.filter(x => x.inscricoes_abertas && !x.ativa)) {
        ops.push({ id: t.id, label: t.label || t.id });
      }
      if (temporadaId && !ops.some(o => o.id === temporadaId)) {
        const t = lista.find(x => x.id === temporadaId);
        ops.push({ id: temporadaId, label: t?.label || temporadaId });
      }
      setTemporadaOpcoes(ops);
    }).catch(() => {});
  }, [temporadaId]);


  useEffect(() => {
    if (!temporada) return;
    setLoading(true);


    setFCategoria(''); setFFaixa(''); setFBairro(''); setFDia(''); setFRecorrencia('');
    setErroCarga(null);
    api.buscar({ temporada, status_temporada: 'ativo' })
      .then(d => { setGrupos(d || []); setErroCarga(null); })
      .catch(e => { setGrupos([]); setErroCarga(e?.message || 'Nao conseguimos carregar os grupos agora.'); })
      .finally(() => setLoading(false));
  }, [temporada, tentativa]);



  const categorias = useMemo(() => [...new Set(grupos.map(g => g.categoria).filter(Boolean))].sort(), [grupos]);
  const bairros = useMemo(() => [...new Set(grupos.map(g => g.bairro).filter(Boolean))].sort(), [grupos]);
  const dias = useMemo(() => [...new Set(grupos.map(g => g.dia_semana).filter(v => v != null))].sort((a, b) => a - b), [grupos]);
  const recorrencias = useMemo(() => {
    const set = [...new Set(grupos.map(g => (g.recorrencia || '').toLowerCase().trim()).filter(Boolean))];
    return set.sort((a, b) => {
      const ia = RECORRENCIA_ORDEM.indexOf(a), ib = RECORRENCIA_ORDEM.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
    });
  }, [grupos]);


  const faixas = useMemo(() => [...new Set(grupos.map(g => g.faixa_etaria).filter(Boolean))].sort(), [grupos]);

  const filtrados = useMemo(() => {
    const s = normalizarBusca(busca);
    return grupos.filter(g => {
      if (fCategoria && g.categoria !== fCategoria) return false;
      if (fFaixa && g.faixa_etaria !== fFaixa) return false;
      if (fBairro && g.bairro !== fBairro) return false;

      if (fDia !== '' && !ehDiario(g) && String(g.dia_semana) !== fDia) return false;
      if (fRecorrencia && (g.recorrencia || '').toLowerCase().trim() !== fRecorrencia) return false;
      if (s) {
        if (searchMode === 'lider') {





          const alvos = (g.lideres_busca && g.lideres_busca.length)
            ? g.lideres_busca
            : (g.lideres_nomes && g.lideres_nomes.length ? g.lideres_nomes : [g.lider_nome]).filter(Boolean);
          if (!algumContemNormalizado(alvos, s)) return false;
        } else {
          const alvo = [g.nome, g.codigo, g.local, g.bairro, g.tema].filter(Boolean).join(' ');
          if (!contemNormalizado(alvo, s)) return false;
        }
      }
      return true;
    });
  }, [grupos, busca, searchMode, fCategoria, fFaixa, fBairro, fDia, fRecorrencia]);

  const temFiltros = full && (categorias.length >= 1 || faixas.length >= 1 || bairros.length >= 1 || dias.length >= 1 || recorrencias.length >= 1);



  const inscricoesFechadas = full && !!temporada && temporadaAberta[temporada] === false;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {inscricoesFechadas && !loading && (
        <div style={{
          padding: '10px 14px', borderRadius: 10, fontSize: 13, lineHeight: 1.55,
          background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.5)', color: C.text,
        }}>
          {grupos.length > 0 ? (
            <>As inscrições da temporada estão <strong>fechadas</strong> no momento — os grupos abaixo
            aceitam inscrição o ano todo. As inscrições para mais grupos abrem <strong>{proximaAbertura()}</strong>.</>
          ) : (
            <>As inscrições da temporada estão <strong>fechadas</strong> no momento e não há grupos
            recebendo inscrição agora. As inscrições abrem <strong>{proximaAbertura()}</strong> — volte aqui
            que a lista de grupos vai estar te esperando!</>
          )}
        </div>
      )}
      {                                  }
      <div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <Pill ativo={searchMode === 'grupo'} onClick={() => { setSearchMode('grupo'); setBusca(''); }}>
            <Users size={13} /> Buscar por grupo
          </Pill>
          <Pill ativo={searchMode === 'lider'} onClick={() => { setSearchMode('lider'); setBusca(''); }}>
            <UserIcon size={13} /> Buscar por líder
          </Pill>
        </div>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.t3 }} />
          <Input
            placeholder={searchMode === 'lider' ? 'Nome do líder...' : 'Nome do grupo, bairro ou código...'}
            value={busca}
            onChange={e => setBusca(e.target.value)}
            style={{ paddingLeft: 32, fontSize: 16 }}
          />
        </div>
      </div>

      {
                                                                      }
      {full && temporadaOpcoes.length >= 2 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: C.t3, whiteSpace: 'nowrap' }}>Temporada:</span>
          <select value={temporada} onChange={e => setTemporada(e.target.value)} style={{ ...selStyle, flex: 'initial', minWidth: 200 }}>
            {temporadaOpcoes.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
      )}

      {                                                            }
      {temFiltros && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {
                                                                            }
          {categorias.length >= 1 && (
            <select value={fCategoria} onChange={e => setFCategoria(e.target.value)} style={selStyle}>
              <option value="">Categorias</option>
              {categorias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          {faixas.length >= 1 && (
            <select value={fFaixa} onChange={e => setFFaixa(e.target.value)} style={selStyle}>
              <option value="">Idades</option>
              {faixas.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          )}
          {dias.length >= 1 && (
            <select value={fDia} onChange={e => setFDia(e.target.value)} style={selStyle}>
              <option value="">Dias</option>
              {dias.map(d => <option key={d} value={String(d)}>{DIAS[d]}</option>)}
            </select>
          )}
          {recorrencias.length >= 1 && (
            <select value={fRecorrencia} onChange={e => setFRecorrencia(e.target.value)} style={selStyle}>
              <option value="">Frequência</option>
              {recorrencias.map(r => <option key={r} value={r}>{recorrenciaLabel(r)}</option>)}
            </select>
          )}
          {

                                                                     }
          {!isMobile && bairros.length >= 1 && (
            <select value={fBairro} onChange={e => setFBairro(e.target.value)} style={selStyle}>
              <option value="">Bairros</option>
              {bairros.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          )}
        </div>
      )}

      {                                           }
      {full && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Pill ativo={view === 'lista'} onClick={() => setView('lista')}><ListIcon size={13} /> Lista</Pill>
          <Pill ativo={view === 'mapa'} onClick={() => setView('mapa')}><MapIcon size={13} /> Mapa</Pill>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: C.t3 }}>
            {loading ? '...' : `${filtrados.length} grupo${filtrados.length === 1 ? '' : 's'}`}
          </span>
        </div>
      )}

      {                }
      {full && view === 'mapa' ? (
        <div style={{ height: 480, borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}` }}>
          <GruposMapView
            grupos={filtrados}
            variant="admin"
            defaultTheme="light"
            onPinClick={onSelect}
            onGroupSelect={onInscrever ? (g) => { onSelect?.(g); onInscrever(g); } : onSelect}
            onGroupSelectLabel={onInscrever ? 'Inscrever' : 'Escolher este grupo'}
          />
        </div>
      ) : (
        <ResultsList grupos={filtrados} loading={loading} selectedGrupoId={selectedGrupoId} onSelect={onSelect} isMobile={isMobile} erro={erroCarga} onTentarDeNovo={() => setTentativa(t => t + 1)} />
      )}

      {

                                                                        }
      {



                                   }
      {full && view === 'lista' && onInscrever && selectedGrupoId && (() => {
        const grupoSel = grupos.find(g => g.id === selectedGrupoId);
        if (!grupoSel) return null;
        return createPortal(
          <button
            onClick={() => onInscrever(grupoSel)}
            type="button"
            style={{
              position: 'fixed', bottom: 'calc(18px + env(safe-area-inset-bottom, 0px))',
              left: '50%', transform: 'translateX(-50%)',
              zIndex: 1000, padding: '14px 46px', borderRadius: 999,
              background: '#00B39D', color: '#fff', border: 'none', cursor: 'pointer',
              fontWeight: 800, fontSize: 16, letterSpacing: 0.3, whiteSpace: 'nowrap',
              boxShadow: '0 8px 24px rgba(0, 179, 157, 0.45)',
            }}
          >
            Inscrever
          </button>,
          document.body
        );
      })()}
    </div>
  );
}

function ResultsList({ grupos, loading, selectedGrupoId, onSelect, isMobile = false, erro = null, onTentarDeNovo }) {
  if (loading) return <div style={{ padding: 24, textAlign: 'center', color: C.t3, fontSize: 13 }}>Carregando...</div>;


  if (erro) return (
    <div style={{ padding: 20, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
      <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5, maxWidth: 340 }}>{erro}</div>
      {onTentarDeNovo && (
        <button type="button" onClick={onTentarDeNovo} style={{
          padding: '10px 18px', borderRadius: 999, minHeight: 44, cursor: 'pointer',
          border: `1px solid ${C.primary}`, background: C.primaryBg, color: C.primary,
          fontSize: 13, fontWeight: 700,
        }}>Tentar de novo</button>
      )}
    </div>
  );
  if (!grupos.length) return <div style={{ padding: 24, textAlign: 'center', color: C.t3, fontSize: 13 }}>Nenhum grupo encontrado com esses filtros.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: isMobile ? '62vh' : 380, overflowY: 'auto' }}>
      {grupos.map(g => {
        const ativo = g.id === selectedGrupoId;
        return (
          <button
            key={g.id}
            type="button"
            onClick={() => onSelect?.(g)}
            style={{
              textAlign: 'left', padding: '10px 12px', borderRadius: 10,
              border: ativo ? `2px solid ${C.primary}` : `1px solid ${C.border}`,
              background: ativo ? C.primaryBg : C.card, cursor: 'pointer',
              display: 'flex', flexDirection: 'column', gap: 4, color: C.text,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{g.nome}</div>
              {g.codigo && <code style={{ fontSize: 10, color: C.t3, fontFamily: 'monospace' }}>{g.codigo}</code>}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, color: C.t3 }}>
              {(() => {




                const nomes = (g.lideres_exibicao && g.lideres_exibicao.length
                  ? g.lideres_exibicao
                  : (g.lideres_nomes && g.lideres_nomes.length ? g.lideres_nomes : [g.lider_nome])).filter(Boolean);
                return nomes.length ? <span><UserIcon size={10} style={{ display: 'inline', marginRight: 2 }} /> {nomes.join(' · ')}</span> : null;
              })()}
              {

                                                                                 }
              {(g.endereco_publico || g.bairro) && (
                <span>
                  <MapPin size={10} style={{ display: 'inline', marginRight: 2 }} />
                  {' '}{[g.endereco_publico, g.bairro].filter(Boolean).join(' · ')}
                </span>
              )}
              {ehDiario(g)
                ? <span><Clock size={10} style={{ display: 'inline', marginRight: 2 }} /> Diário{g.horario ? ` ${g.horario.slice(0, 5)}` : ''}</span>
                : <>
                    {g.dia_semana != null && <span><Clock size={10} style={{ display: 'inline', marginRight: 2 }} /> {DIAS_CURTO[g.dia_semana]}{g.horario ? ` ${g.horario.slice(0, 5)}` : ''}</span>}
                    {g.recorrencia && g.recorrencia.toLowerCase().trim() !== 'semanal' && <span>· {recorrenciaLabel(g.recorrencia.toLowerCase().trim())}</span>}
                  </>}
              {g.dist_km != null && <span style={{ color: C.primary, fontWeight: 600 }}>{g.dist_km < 1 ? `${Math.round(g.dist_km * 1000)}m` : `${g.dist_km.toFixed(1)}km`}</span>}
              {g.categoria && <span>· {g.categoria}</span>}
              {(() => {


                if (g.idade_min != null && g.idade_max != null) return <span>· {g.idade_min}–{g.idade_max} anos</span>;
                if (g.idade_max != null) return <span>· até {g.idade_max} anos</span>;
                if (g.idade_min != null) return <span>· {g.idade_min}+ anos</span>;
                if (g.faixa_etaria && g.faixa_etaria !== 'Todas as idades') return <span>· {g.faixa_etaria}</span>;
                return null;
              })()}
            </div>
            {



                                                                    }
            <DescricaoGrupo
              texto={g.descricao}
              linhas={2}
              expansivel={false}
              fontSize={11.5}
              cor={C.t3}
            />
          </button>
        );
      })}
    </div>
  );
}
