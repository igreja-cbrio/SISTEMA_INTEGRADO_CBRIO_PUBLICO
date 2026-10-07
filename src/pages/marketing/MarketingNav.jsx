import { useNavigate, useLocation } from 'react-router-dom';
import { rotuloDataCabecalho } from '../../lib/dataCabecalho';


















export default function MarketingNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const here = (path) => location.pathname === path;

  const items = [
    { path: '/marketing',            label: 'Início' },
    { path: '/marketing/demandas',   label: 'Demandas' },

    { path: '/marketing/arquivos',   label: 'Arquivos' },
    { path: '/marketing/dashboard',  label: 'Dashboard' },
    { path: '/marketing/calendario', label: 'Calendário' },
    { path: '/marketing/campanhas',  label: 'Campanhas' },


    { path: '/marketing/app',        label: 'App' },
  ];

  return (
    <nav aria-label="Marketing" className="flex items-end justify-between gap-4 border-b border-border">
      {

                                                }
      <div className="flex items-end gap-5 md:gap-7 overflow-x-auto -mb-px">
        {items.map(it => {
          const ativo = here(it.path);
          return (
            <button
              key={it.path}
              type="button"
              onClick={() => navigate(it.path)}
              aria-current={ativo ? 'page' : undefined}
              className={`font-heading shrink-0 whitespace-nowrap border-b-2 pb-2.5 text-[12px] font-semibold uppercase tracking-[0.12em] transition-colors ${
                ativo
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {it.label}
            </button>
          );
        })}
      </div>
      <span className="hidden sm:inline shrink-0 whitespace-nowrap pb-2.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground tabular-nums">
        {rotuloDataCabecalho()}
      </span>
    </nav>
  );
}
