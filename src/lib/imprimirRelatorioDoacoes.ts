













export interface LinhaDoacao {
  data: string;
  valor: number | string;
  plano_codigo?: string | null;
  plano_nome?: string | null;
  tipo_rotulo?: string | null;
  forma_pagamento?: string | null;
  nome?: string | null;
}

export interface DadosRelatorioDoacoes {
  linhas: LinhaDoacao[];
  resumo: {
    total: number; qtd: number; primeira: string | null; ultima: string | null;
    por_ano: { ano: string; total: number; qtd: number; por_tipo: Record<string, number> }[];
    por_tipo: { tipo: string; rotulo: string; total: number; qtd: number }[];
    nomes: { chave: string; nome: string; qtd: number; total: number }[];
  };
  base?: { qtd_total: number; truncado: boolean; limite: number };
  periodo_rotulo?: string;
  gerado_em?: string;
  gerado_por?: string;
}

const CSS = `
  @page { size: A4 portrait; margin: 14mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; color: #111; background: #fff;
    font-family: 'Inter', system-ui, -apple-system, Arial, sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .topo { border-bottom: 2px solid #00B39D; padding-bottom: 6px; margin-bottom: 12px; }
  .marca { font-size: 10.5pt; font-weight: 800; color: #00B39D; letter-spacing: .3px; }
  .titulo { font-size: 15pt; font-weight: 800; margin-top: 2px; }
  .meta { font-size: 9.5pt; color: #555; margin-top: 3px; }
  .cards { display: flex; gap: 8px; margin: 10px 0 14px; }
  .card { flex: 1; border: 1px solid #ccc; border-radius: 6px; padding: 6px 8px; }
  .card .r { font-size: 8pt; text-transform: uppercase; color: #666; letter-spacing: .4px; }
  .card .v { font-size: 12pt; font-weight: 700; font-variant-numeric: tabular-nums; }
  h2 { font-size: 11pt; margin: 14px 0 6px; page-break-after: avoid; break-after: avoid; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  th, td { border: 1px solid #999; padding: 5px 7px; font-size: 9.5pt; text-align: left; }
  thead th { background: #EEF7F5; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .4px; }
  td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.d { white-space: nowrap; }
  tfoot td { font-weight: 700; background: #F6F6F6; }
  .aviso { margin-top: 8px; font-size: 9pt; color: #8a5a00; }
  .rodape { margin-top: 16px; border-top: 1px solid #ccc; padding-top: 6px; font-size: 8.5pt; color: #666; }
`;

function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  } as Record<string, string>)[c]);
}

function moeda(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—';
}


export function dataBr(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}

export function htmlRelatorioDoacoes(d: DadosRelatorioDoacoes): string {
  const r = d.resumo;
  const nomes = r.nomes.map((n) => n.nome).filter(Boolean);
  const tipos = r.por_tipo;

  const tabelaAno = r.por_ano.length ? `
    <h2>Por ano</h2>
    <table>
      <thead><tr><th>Ano</th>${tipos.map((t) => `<th class="n">${escapeHtml(t.rotulo)}</th>`).join('')}<th class="n">Total</th></tr></thead>
      <tbody>${r.por_ano.map((a) => `
        <tr><td>${escapeHtml(a.ano)}</td>${tipos.map((t) => `<td class="n">${a.por_tipo[t.tipo] ? moeda(a.por_tipo[t.tipo]) : '—'}</td>`).join('')}<td class="n">${moeda(a.total)}</td></tr>`).join('')}
      </tbody>
      <tfoot><tr><td>Total</td>${tipos.map((t) => `<td class="n">${moeda(t.total)}</td>`).join('')}<td class="n">${moeda(r.total)}</td></tr></tfoot>
    </table>` : '';

  const tabelaLinhas = `
    <h2>Lançamentos (${r.qtd})</h2>
    <table>
      <thead><tr><th>Data</th><th class="n">Valor</th><th>Tipo</th><th>Forma</th><th>Nome no extrato</th></tr></thead>
      <tbody>${d.linhas.length ? d.linhas.map((l) => `
        <tr>
          <td class="d">${escapeHtml(dataBr(l.data))}</td>
          <td class="n">${moeda(l.valor)}</td>
          <td>${escapeHtml(l.tipo_rotulo || l.plano_nome || '—')}</td>
          <td>${escapeHtml(l.forma_pagamento || '—')}</td>
          <td>${escapeHtml(l.nome || '—')}</td>
        </tr>`).join('') : '<tr><td colspan="5" style="text-align:center;color:#999">Nenhuma doação no período</td></tr>'}
      </tbody>
    </table>`;

  const truncado = d.base?.truncado
    ? `<div class="aviso">Atenção: o período tem ${d.base.qtd_total} lançamentos e o relatório mostra os ${d.base.limite} mais recentes. Escolha um período menor para ver todos.</div>`
    : '';

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
    <title>Relatório de doações · ${escapeHtml(nomes[0] || 'doador')}</title><style>${CSS}</style></head><body>
    <div class="topo">
      <div class="marca">CB Rio · Financeiro · Relatório de doações (uso interno)</div>
      <div class="titulo">${escapeHtml(nomes.join(' · ') || 'Doador')}</div>
      <div class="meta">${escapeHtml(d.periodo_rotulo || '')}</div>
    </div>
    <div class="cards">
      <div class="card"><div class="r">Total</div><div class="v">${moeda(r.total)}</div></div>
      <div class="card"><div class="r">Lançamentos</div><div class="v">${r.qtd}</div></div>
      <div class="card"><div class="r">Primeira</div><div class="v">${escapeHtml(dataBr(r.primeira))}</div></div>
      <div class="card"><div class="r">Última</div><div class="v">${escapeHtml(dataBr(r.ultima))}</div></div>
    </div>
    ${truncado}
    ${tabelaAno}
    ${tabelaLinhas}
    <div class="rodape">
      Critério: dízimos, ofertas, campanhas, missões, ação social, outras contribuições e doações extraordinárias registradas no razão financeiro.
      O doador é identificado pelo nome que aparece no extrato: pessoas com o mesmo nome não são distinguidas.
      Documento interno, não é comprovante fiscal.
      ${d.gerado_em ? `<br>Gerado em ${escapeHtml(d.gerado_em)}${d.gerado_por ? ` por ${escapeHtml(d.gerado_por)}` : ''}.` : ''}
    </div>
  </body></html>`;
}

export function abrirJanelaRelatorio(): Window | null {
  return window.open('', '_blank', 'width=900,height=1100,scrollbars=yes');
}

export function escreverRelatorio(win: Window, d: DadosRelatorioDoacoes): void {
  win.document.open();
  win.document.write(htmlRelatorioDoacoes(d));
  win.document.close();
  win.focus();
  setTimeout(() => { try { win.print(); } catch (e) { console.error('[relatorioDoacoes] print:', e); } }, 350);
}
