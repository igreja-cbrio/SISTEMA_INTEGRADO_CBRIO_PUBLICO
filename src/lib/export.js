













export function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

const NUMERO_PURO = /^-?\d+([.,]\d+)?$/;

export function celulaCsv(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  const s = String(v ?? '');
  const neutralizada = /^[=+\-@\t\r]/.test(s) && !NUMERO_PURO.test(s) ? `'${s}` : s;
  return `"${neutralizada.replace(/"/g, '""')}"`;
}

export function montarCsv(headers, rows) {
  return [headers, ...rows].map(r => r.map(celulaCsv).join(',')).join('\n');
}

export function exportCSV(headers, rows, filename = 'export') {
  const blob = new Blob(['﻿' + montarCsv(headers, rows)], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${filename}_${dateStr()}.csv`);
}

export function montarHtmlPdf(title, headers, rows, options = {}) {
  const { subtitle, footer, geradoEm } = options;
  const now = geradoEm || new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const t = escapeHtml(title);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${t}</title>
<style>body{font-family:Inter,sans-serif;padding:40px}h1{font-size:18px}
table{width:100%;border-collapse:collapse;margin-top:16px}
th,td{border:1px solid #ddd;padding:8px 12px;text-align:left;font-size:12px}
th{background:#f5f5f5;font-weight:600}
.footer{margin-top:24px;font-size:11px;color:#888}</style></head>
<body><h1>${t}</h1>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}
<table><thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
<tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c == null ? '—' : escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>
<div class="footer">${rows.length} registro(s) — Gerado em ${escapeHtml(now)}${footer ? ` — ${escapeHtml(footer)}` : ''}</div>
</body></html>`;
}





export function exportPDF(title, headers, rows, options = {}) {
  const html = montarHtmlPdf(title, headers, rows, options);
  const win = window.open('', '_blank');
  if (!win) {
    console.warn('[export] pop-up bloqueado · libere pop-ups do site para exportar em PDF');
    return false;
  }
  win.document.write(html);
  win.document.close();
  return true;
}

function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}



export function dateStr(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(agora);
}
