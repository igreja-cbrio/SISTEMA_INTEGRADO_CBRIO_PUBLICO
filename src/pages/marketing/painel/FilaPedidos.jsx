import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cartao, Balao, COR, TabelaSimples } from './pecasPainel';
import { PEDIDO_STATUS_ROTULO, eixoDias, posicionarPontos, ddmm, plural } from './reguaPainel';







const AREA_ROTULO = { kids: 'Kids', ami: 'AMI', bridge: 'Bridge', online: 'Online', sede: 'Sede', cba: 'CBA' };
const rotuloArea = (a) => {
  if (!a) return 'sem área';
  const k = String(a).toLowerCase();
  return AREA_ROTULO[k] || (k.charAt(0).toUpperCase() + k.slice(1));
};

const MOTIVO_ROTULO = {
  solicitacao_fechada: 'a solicitação já foi encerrada',
  solicitacao_apagada: 'a solicitação foi apagada',
  sem_solicitacao: 'nunca teve solicitação',
};

function Ponto({ p, lider }) {
  const [aberto, setAberto] = useState(false);
  const noDiretor = p.status === 'aguardando_aprovacao';
  const texto = `${plural(p.dias, 'dia', 'dias')} na fila · ${PEDIDO_STATUS_ROTULO[p.status] || p.status}`;
  return (
    <div
      className="absolute -translate-x-1/2"
      style={{ left: `${p.x}%`, top: 6 + p.nivel * 11 }}
    >
      {aberto && (
        <Balao x={p.x}>
          {lider && p.titulo && <p className="font-medium">{p.titulo}</p>}
          <p>{rotuloArea(p.area)} · {texto}</p>
          {p.para && <p className="text-muted-foreground">pedido para {ddmm(p.para)}</p>}
          {p.urgente && <p className="text-muted-foreground">marcado como urgente</p>}
        </Balao>
      )}
      <button
        type="button"
        className="block h-3.5 w-3.5 rounded-full focus-visible:outline focus-visible:outline-2"
        style={{
          background: noDiretor ? 'transparent' : COR.azul,
          border: `2px solid ${COR.azul}`,
          boxShadow: p.urgente ? `0 0 0 2px hsl(var(--card)), 0 0 0 4px ${COR.laranja}` : `0 0 0 2px hsl(var(--card))`,
        }}
        aria-label={`${lider && p.titulo ? `${p.titulo}. ` : ''}${rotuloArea(p.area)}: ${texto}${p.urgente ? ', urgente' : ''}`}
        onMouseEnter={() => setAberto(true)}
        onMouseLeave={() => setAberto(false)}
        onFocus={() => setAberto(true)}
        onBlur={() => setAberto(false)}
        onClick={() => setAberto(v => !v)}
      />
    </div>
  );
}

export default function FilaPedidos({ pedidos, lider, modo }) {
  const navigate = useNavigate();
  const pontos = pedidos.pontos || [];
  const lim = eixoDias(pedidos.mais_antigo_dias);
  const posicionados = posicionarPontos(pontos, lim);
  const areas = pedidos.areas || [];
  const passo = lim <= 45 ? 15 : 30;
  const marcas = [];
  for (let d = 0; d <= lim; d += passo) marcas.push(d);
  const semViva = pedidos.sem_solicitacao_viva || { total: 0, itens: [] };

  const subtitulo = pontos.length
    ? `${plural(pedidos.esperando, 'pedido esperando', 'pedidos esperando')} o Marketing`
      + (pedidos.mediana_dias != null ? ` · mediana de ${plural(pedidos.mediana_dias, 'dia', 'dias')}` : '')
      + (pedidos.no_diretor ? ` · ${pedidos.no_diretor} no diretor de origem` : '')
    : 'Nenhum pedido esperando';

  return (
    <Cartao
      titulo="Fila de pedidos"
      subtitulo={subtitulo}
      acao={<button type="button" className="text-xs text-primary hover:underline" onClick={() => navigate('/marketing/demandas')}>Ver nas Demandas →</button>}
    >
      {!pontos.length ? (
        <p className="text-sm text-muted-foreground">Nenhum pedido de outra área está esperando o Marketing agora.</p>
      ) : modo === 'tabela' ? (
        <TabelaSimples
          colunas={[
            ...(lider ? [{ chave: 'titulo', rotulo: 'Pedido' }] : []),
            { chave: 'area', rotulo: 'Área' },
            { chave: 'dias', rotulo: 'Dias esperando', direita: true },
            { chave: 'situacao', rotulo: 'Situação' },
            { chave: 'para', rotulo: 'Para' },
          ]}
          linhas={pontos.map(p => ({
            id: p.id,
            titulo: p.titulo || '—',
            area: rotuloArea(p.area),
            dias: p.dias ?? '—',
            situacao: (PEDIDO_STATUS_ROTULO[p.status] || p.status) + (p.urgente ? ' · urgente' : ''),
            para: p.para ? ddmm(p.para) : '—',
          }))}
        />
      ) : (
        <div>
          <div className="space-y-1">
            {areas.map(a => {
              const daLinha = posicionados.filter(p => (p.area || '') === (a.area || ''));
              const niveis = Math.max(0, ...daLinha.map(p => p.nivel));
              return (
                <div key={a.area || 'sem'} className="flex items-stretch gap-2">
                  <span className="w-[4.5rem] shrink-0 pt-1.5 text-xs text-foreground truncate">{rotuloArea(a.area)}</span>
                  <div className="relative flex-1 border-l" style={{ borderColor: COR.linha, height: 26 + niveis * 11 }}>
                    <div className="absolute inset-x-0 top-1/2 h-px" style={{ background: COR.linha }} aria-hidden />
                    {pedidos.mediana_dias != null && (
                      <div className="absolute inset-y-0 w-px bg-muted-foreground/50" style={{ left: `${(pedidos.mediana_dias / lim) * 100}%` }} aria-hidden />
                    )}
                    {daLinha.map(p => <Ponto key={p.id} p={p} lider={lider} />)}
                  </div>
                  <span className="w-6 shrink-0 pt-1.5 text-right text-xs tabular-nums text-muted-foreground">{a.total}</span>
                </div>
              );
            })}
          </div>
          <div className="flex gap-2 mt-1">
            <span className="w-[4.5rem] shrink-0" />
            <div className="relative flex-1 h-4">
              {marcas.map(d => (
                <span key={d} className="absolute -translate-x-1/2 text-[10px] tabular-nums text-muted-foreground" style={{ left: `${(d / lim) * 100}%` }}>
                  {d === 0 ? '0' : `${d} d`}
                </span>
              ))}
            </div>
            <span className="w-6 shrink-0" />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COR.azul }} /> esperando o Marketing</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: COR.azul }} /> no diretor de origem</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COR.azul, boxShadow: `0 0 0 2px hsl(var(--card)), 0 0 0 3px ${COR.laranja}` }} /> urgente</span>
            {pedidos.mediana_dias != null && <span className="inline-flex items-center gap-1.5"><span className="h-3 w-px bg-muted-foreground/50" /> mediana</span>}
          </div>
        </div>
      )}
      {semViva.total > 0 && (
        <div className="mt-4 rounded-md border px-3 py-2 text-xs text-muted-foreground" style={{ borderColor: COR.linha }}>
          <p>
            {plural(semViva.total, 'registro de pedido segue', 'registros de pedido seguem')} em triagem no Marketing
            {' '}sem uma solicitação aberta por trás — {semViva.total === 1 ? 'não entra' : 'não entram'} na fila.
          </p>
          {lider && semViva.itens.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {semViva.itens.map(i => (
                <li key={i.id}>
                  <span className="text-foreground">{i.titulo || 'Sem título'}</span>
                  {' '}· {MOTIVO_ROTULO[i.motivo] || i.motivo}{i.desde ? ` · desde ${ddmm(i.desde)}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Cartao>
  );
}
