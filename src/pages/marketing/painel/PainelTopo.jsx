import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, CalendarClock, CircleDashed, Inbox } from 'lucide-react';
import { Card } from '../../../components/ui/card';
import { COR } from './pecasPainel';
import { textoHero, ddmm, plural } from './reguaPainel';






export default function PainelTopo({ topo, semana }) {
  const navigate = useNavigate();
  const hero = textoHero(topo);
  if (!hero) return null;

  const tiles = [
    {
      icone: CalendarClock,
      numero: topo.pecas_nesta_semana,
      rotulo: topo.pecas_nesta_semana === 1 ? 'peça vence nesta semana' : 'peças vencem nesta semana',
      detalhe: semana ? `${ddmm(semana.inicio)} a ${ddmm(semana.fim)}` : null,
    },
    {
      icone: CircleDashed,
      numero: topo.sem_prazo,
      rotulo: topo.sem_prazo === 1 ? 'demanda sem prazo' : 'demandas sem prazo',
      detalhe: 'ficam fora do horizonte de prazos',
    },
    {
      icone: Inbox,
      numero: topo.pedidos_esperando,
      rotulo: topo.pedidos_esperando === 1 ? 'pedido esperando o Marketing' : 'pedidos esperando o Marketing',
      detalhe: topo.pedidos_esperando == null
        ? 'a fila de pedidos não carregou'
        : [
          topo.pedido_mais_antigo_dias != null ? `o mais antigo há ${plural(topo.pedido_mais_antigo_dias, 'dia', 'dias')}` : null,
          topo.pedidos_no_diretor ? `${topo.pedidos_no_diretor} no diretor de origem` : null,
        ].filter(Boolean).join(' · ') || 'nenhum esperando',
    },
  ];

  const corHero = hero.alerta ? COR.laranja : COR.verde;
  const IconeHero = hero.alerta ? AlertTriangle : CheckCircle2;

  return (
    <div className="grid gap-3 md:grid-cols-5">
      <button
        type="button"
        onClick={() => navigate('/marketing/demandas')}
        className="md:col-span-2 text-left"
        aria-label={`${hero.alerta ? `${hero.numero} ${hero.titulo}` : hero.titulo}. ${hero.detalhe}. Abrir as Demandas.`}
      >
        <Card className="h-full p-4 md:p-5 border-l-4 transition-colors hover:bg-accent/40" style={{ borderLeftColor: corHero }}>
          <div className="flex items-start gap-3">
            <IconeHero className="h-6 w-6 shrink-0 mt-1" style={{ color: corHero }} aria-hidden />
            <div className="min-w-0">
              <p className="font-heading text-foreground leading-tight">
                {hero.alerta && <span className="text-4xl md:text-5xl font-semibold tabular-nums mr-2 align-baseline">{hero.numero}</span>}
                <span className={hero.alerta ? 'text-lg md:text-xl font-medium' : 'text-xl md:text-2xl font-semibold'}>{hero.titulo}</span>
              </p>
              <p className="text-sm text-muted-foreground mt-1.5">{hero.detalhe}</p>
              {hero.frentes.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {hero.frentes.map(f => `${f.n} ${f.rotulo}`).join(' · ')}
                </p>
              )}
              <p className="text-xs text-primary mt-2">Abrir as Demandas →</p>
            </div>
          </div>
        </Card>
      </button>

      {tiles.map(t => (
        <Card key={t.rotulo} className="p-4 min-w-0">
          <t.icone className="h-4 w-4 text-muted-foreground" aria-hidden />
          <p className="font-heading text-3xl font-semibold tabular-nums text-foreground mt-2 leading-none">
            {t.numero == null ? '—' : t.numero}
          </p>
          <p className="text-sm text-foreground mt-1.5 leading-snug">{t.rotulo}</p>
          {t.detalhe && <p className="text-xs text-muted-foreground mt-1 leading-snug">{t.detalhe}</p>}
        </Card>
      ))}
    </div>
  );
}
