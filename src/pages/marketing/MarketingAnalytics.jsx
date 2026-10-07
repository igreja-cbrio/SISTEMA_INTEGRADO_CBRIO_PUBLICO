import { useState, useEffect, useCallback } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { marketing as api } from '../../api';
import MarketingPagina from './MarketingPagina';
import { Faixa } from './dashboardPecas';
import { Button } from '../../components/ui/button';
import PainelTopo from './painel/PainelTopo';
import HorizontePrazos from './painel/HorizontePrazos';
import FilaPedidos from './painel/FilaPedidos';
import AndamentoCiclos from './painel/AndamentoCiclos';
import AprovacaoDiretor from './painel/AprovacaoDiretor';
import ProntidaoDado from './painel/ProntidaoDado';
import KpisCalibracao from './painel/KpisCalibracao';















const CHAVE_MODO = 'cbrio.marketing.dashboard.modo';

function lerModo() {
  try { return localStorage.getItem(CHAVE_MODO) === 'tabela' ? 'tabela' : 'grafico'; } catch { return 'grafico'; }
}

const horaBRT = (d) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

export default function MarketingAnalytics() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [aprovacoes, setAprovacoes] = useState(null);
  const [erroAprov, setErroAprov] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [atualizadoEm, setAtualizadoEm] = useState(null);
  const [modo, setModo] = useState(lerModo);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    const [p, a] = await Promise.allSettled([api.painel(), api.analytics.aprovacoesOrigem(90)]);
    if (p.status === 'fulfilled') {
      setDados(p.value);
      setAtualizadoEm(new Date());
    } else {
      setErro(p.reason?.message || 'Não foi possível carregar o Dashboard.');
    }
    if (a.status === 'fulfilled') {
      setAprovacoes(Array.isArray(a.value) ? a.value : []);
      setErroAprov(false);
    } else {
      setErroAprov(true);
    }
    setCarregando(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const trocarModo = (m) => {
    setModo(m);
    try { localStorage.setItem(CHAVE_MODO, m); } catch {                                   }
  };

  const lider = !!dados?.perfil?.lider;

  const acoes = (
    <>
      <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Como mostrar">
        {[['grafico', 'Gráficos'], ['tabela', 'Tabela']].map(([m, rot]) => (
          <button
            key={m}
            type="button"
            onClick={() => trocarModo(m)}
            aria-pressed={modo === m}
            className={`px-3 py-1 text-xs rounded-[4px] ${modo === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {rot}
          </button>
        ))}
      </div>
      <Button variant="outline" size="sm" onClick={carregar} disabled={carregando}>
        {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        <span className="ml-1.5">{atualizadoEm ? `Atualizado às ${horaBRT(atualizadoEm)}` : 'Atualizar'}</span>
      </Button>
    </>
  );

  return (
    <MarketingPagina subtitulo="O que vem pela frente e onde está o risco" acoes={acoes}>
      {erro && (
        <Faixa>
          {erro}{' '}
          <button type="button" className="underline" onClick={carregar}>Tentar de novo</button>
        </Faixa>
      )}

      {!dados && carregando && (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      )}

      {dados && (
        <>
          {(dados.avisos || []).map(a => <Faixa key={a}>{a}</Faixa>)}

          {dados.topo && <PainelTopo topo={dados.topo} semana={dados.semana} />}

          <div className="grid gap-4 lg:grid-cols-5">
            {dados.horizonte && (
              <div className="lg:col-span-3 min-w-0"><HorizontePrazos horizonte={dados.horizonte} modo={modo} /></div>
            )}
            {dados.pedidos && (
              <div className="lg:col-span-2 min-w-0"><FilaPedidos pedidos={dados.pedidos} lider={lider} modo={modo} /></div>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            {dados.ciclos && (
              <div className="lg:col-span-3 min-w-0"><AndamentoCiclos ciclos={dados.ciclos} modo={modo} /></div>
            )}
            <div className="lg:col-span-2 min-w-0"><AprovacaoDiretor aprovacoes={aprovacoes} erro={erroAprov} /></div>
          </div>

          {dados.prontidao && <ProntidaoDado prontidao={dados.prontidao} lider={lider} />}

          {dados.kpis && <KpisCalibracao kpis={dados.kpis} />}
        </>
      )}
    </MarketingPagina>
  );
}
