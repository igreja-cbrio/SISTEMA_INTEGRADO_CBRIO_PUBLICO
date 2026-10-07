






import { pontosCegos } from './Graficos';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 }));
const dia = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '');
const PAPEL = { auto: 'Autoavaliação', gestor: 'Gestor', par: 'Colega', liderado: 'Liderado' };
const EIXO = { resultado: 'Resultado', comportamento: 'Comportamento' };

export function htmlDoResultado(r) {
  const max = r.ciclo?.escala_max || 6;
  const vis = (k) => r.papeis?.[k]?.visivel;
  const cols = [['auto', 'Auto'], ['gestor', 'Gestor'], ['par', 'Pares'], ['liderado', 'Liderados']].filter(([k]) => vis(k));
  const barra = (v) => (v == null ? '' : `<span class="barra"><span style="width:${Math.max(0, Math.min(100, ((v - 1) / (max - 1)) * 100))}%"></span></span>`);
  const linhas = (r.criterios || []).map((c) => {
    const sub = [
      ...(c.perguntas || []).filter((p) => p.texto && p.texto !== c.nome).map((p) => p.texto),
      c.descricao,
    ].filter(Boolean).map((t) => `<div class="sub">${esc(t)}</div>`).join('');
    return `<tr>
      <td><div class="crit">${esc(c.nome)}${c.calibrado ? ' <span class="tag">calibrado</span>' : ''}</div><div class="eixo">${esc(EIXO[c.eixo] || '')}</div>${sub}</td>
      ${cols.map(([k]) => `<td class="num">${n(c[k])}</td>`).join('')}
      <td class="num final">${n(c.final)}${barra(c.final)}</td>
    </tr>`;
  }).join('');
  const cegos = pontosCegos(r.criterios || []);
  const comentarios = (r.criterios || []).filter((c) => c.comentarios?.length).map((c) => `
    <div class="bloco-com">
      <div class="crit">${esc(c.nome)}</div>
      <ul>${c.comentarios.map((cm) => `<li><span class="quem">${esc(PAPEL[cm.papel] || cm.papel)}:</span> ${esc(cm.texto)}</li>`).join('')}</ul>
    </div>`).join('');
  const plano = (r.entrega?.plano || []).map((a, i) => `<li><b>${i + 1}.</b> ${esc(a.texto)}${a.prazo ? ` <span class="sub">— até ${dia(a.prazo)}</span>` : ''}</li>`).join('');
  const ocultos = Object.entries(r.papeis || {}).filter(([, v]) => !v.visivel && v.respondentes > 0)
    .map(([k, v]) => `${v.respondentes} ${k === 'par' ? (v.respondentes === 1 ? 'par' : 'pares') : (v.respondentes === 1 ? 'liderado' : 'liderados')}`);

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(r.avaliado?.nome)} · ${esc(r.ciclo?.nome)}</title>
<style>
  @page { size: A4; margin: 16mm 14mm 18mm; }
  * { box-sizing: border-box; }
  body { font-family: "Inter", "Segoe UI", system-ui, sans-serif; color: #1f2933; font-size: 10.5pt; line-height: 1.45; margin: 0; }
  header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #0d9488; padding-bottom: 8px; margin-bottom: 16px; }
  .marca { font-size: 9pt; letter-spacing: .02em; color: #0d9488; font-weight: 600; }
  h1 { font-size: 17pt; margin: 2px 0 0; }
  .cargo { color: #52606d; font-size: 10pt; }
  .ciclo { text-align: right; color: #52606d; font-size: 9pt; }
  .resumo { display: flex; gap: 28px; align-items: flex-end; margin: 4px 0 18px; padding: 12px 14px; background: #f5f7f7; border-radius: 8px; }
  .nota { font-size: 30pt; font-weight: 700; line-height: 1; }
  .nota small { font-size: 11pt; color: #7b8794; font-weight: 400; }
  .rot { font-size: 8.5pt; color: #7b8794; }
  .val { font-size: 12pt; font-weight: 600; }
  h2 { font-size: 12pt; margin: 20px 0 8px; break-after: avoid; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 8.5pt; color: #7b8794; font-weight: 600; border-bottom: 1px solid #cbd2d9; padding: 6px 6px; }
  th.num, td.num { text-align: right; width: 62px; }
  td { padding: 7px 6px; border-bottom: 1px solid #e4e7eb; vertical-align: top; }
  tr { break-inside: avoid; }
  .crit { font-weight: 600; }
  .eixo { font-size: 8pt; color: #0d9488; }
  .sub { font-size: 8.5pt; color: #52606d; }
  .final { font-weight: 700; width: 92px !important; }
  .barra { display: block; height: 4px; background: #e4e7eb; border-radius: 2px; margin-top: 4px; }
  .barra span { display: block; height: 4px; background: #0d9488; border-radius: 2px; }
  .tag { font-size: 7.5pt; font-weight: 600; color: #0d9488; border: 1px solid #0d9488; border-radius: 3px; padding: 0 3px; }
  .cegos li, .plano li { margin: 3px 0; }
  ul, ol { padding-left: 16px; margin: 4px 0; }
  .bloco-com { break-inside: avoid; margin-bottom: 10px; }
  .quem { color: #7b8794; font-size: 9pt; }
  .nota-rodape { margin-top: 22px; padding-top: 8px; border-top: 1px solid #e4e7eb; font-size: 8pt; color: #7b8794; }
</style></head><body>
<header>
  <div><div class="marca">CBRio · Avaliação 360</div><h1>${esc(r.avaliado?.nome)}</h1>
  <div class="cargo">${esc([r.avaliado?.cargo, r.avaliado?.area].filter(Boolean).join(' · '))}</div></div>
  <div class="ciclo">${esc(r.ciclo?.nome)}<br>impresso em ${new Date().toLocaleDateString('pt-BR')}</div>
</header>
<div class="resumo">
  <div><div class="rot">Nota final</div><div class="nota">${n(r.final)} <small>/ ${max}</small></div></div>
  <div><div class="rot">Resultado</div><div class="val">${n(r.eixo_resultado)}</div></div>
  <div><div class="rot">Comportamento</div><div class="val">${n(r.eixo_comportamento)}</div></div>
  ${r.quadrante ? `<div><div class="rot">Quadrante (9-box)</div><div class="val">${esc(r.quadrante)}</div></div>` : ''}
</div>
<div class="sub">Pesos: autoavaliação ${Math.round((r.ciclo?.peso_auto || 0) * 100)}% · gestor ${Math.round((r.ciclo?.peso_gestor || 0) * 100)}% · pares e liderados ${Math.round((r.ciclo?.peso_outros || 0) * 100)}%. Escala de 1 a ${max}.${ocultos.length ? ` Não aparecem, por sigilo: ${esc(ocultos.join(' e '))} (menos de ${r.ciclo?.piso || 3} respostas).` : ''}</div>

<h2>Resultado por critério</h2>
<table><thead><tr><th>Critério</th>${cols.map(([, t]) => `<th class="num">${t}</th>`).join('')}<th class="num">Final</th></tr></thead><tbody>${linhas}</tbody></table>

${cegos.length ? `<h2>Onde a autoavaliação mais se distancia dos outros</h2><ul class="cegos">${cegos.map((x) => `<li><b>${esc(x.nome)}</b>: autoavaliação ${n(x.auto)} · os outros ${n(Math.round(x.outros * 100) / 100)} (${x.diff > 0 ? `${n(Math.round(x.diff * 10) / 10)} acima` : `${n(Math.round(-x.diff * 10) / 10)} abaixo`})</li>`).join('')}</ul>` : ''}
${comentarios ? `<h2>Comentários</h2><div class="sub" style="margin-bottom:6px">Sem o nome de quem escreveu.</div>${comentarios}` : ''}
${plano ? `<h2>Plano de ação</h2><ul class="plano" style="list-style:none;padding-left:0">${plano}</ul>` : ''}
${r.entrega?.devolutiva_dia ? `<p class="sub">Devolutiva realizada em ${dia(r.entrega.devolutiva_dia)}.</p>` : ''}
<div class="nota-rodape">Documento confidencial. As notas de pares e liderados são médias e os comentários não identificam quem respondeu.</div>
</body></html>`;
}

export function imprimirResultado(r) {
  const f = document.createElement('iframe');
  f.setAttribute('aria-hidden', 'true');
  Object.assign(f.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(f);
  const doc = f.contentWindow.document;
  doc.open();
  doc.write(htmlDoResultado(r));
  doc.close();
  const imprimir = () => {
    f.contentWindow.focus();
    f.contentWindow.print();
    setTimeout(() => f.remove(), 1000);
  };
  if (doc.readyState === 'complete') setTimeout(imprimir, 150);
  else f.onload = imprimir;
}
