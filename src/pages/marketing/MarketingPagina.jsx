import MarketingNav from './MarketingNav';
































export default function MarketingPagina({ subtitulo, acoes, children, semMenu = false, titulo = 'Marketing' }) {
  return (



    <div className="p-4 md:p-6 space-y-5 md:space-y-6">
      {                                                                 }
      {!semMenu && <MarketingNav />}

      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div className="min-w-0">
          {
                                                                             }
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-foreground">
            {titulo}
          </h1>
          {subtitulo && <p className="text-sm text-muted-foreground mt-1.5">{subtitulo}</p>}
        </div>
        {acoes && <div className="flex items-center gap-2 shrink-0 flex-wrap">{acoes}</div>}
      </div>

      {children}
    </div>
  );
}
