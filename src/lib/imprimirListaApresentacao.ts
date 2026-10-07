












export interface CriancaLinha {
  nome: string;
  idade?: string | null;

  responsaveis?: string | null;

  telefone?: string | null;
}

export interface BlocoApresentacao {

  turma: string;

  horario: string;
  criancas: CriancaLinha[];
}

export interface OpcoesBlocos {

  fmtHorario?: (h: string) => string;
}

export interface OpcoesApresentacao {
  colunas?: { contato?: boolean };
}

const CSS = `
  @page { size: A4 portrait; margin: 14mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; color: #111; background: #fff;
    font-family: 'Inter', system-ui, -apple-system, Arial, sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .bloco { margin-bottom: 22px; }
  .cabec { border-bottom: 2px solid #407F96; padding-bottom: 6px; margin-bottom: 12px; page-break-after: avoid; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  .titulo { font-size: 11pt; font-weight: 800; color: #407F96; letter-spacing: .3px; }
  .sub { font-size: 14pt; font-weight: 800; margin-top: 2px; }
  .culto { font-size: 11pt; font-weight: 600; color: #444; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #999; padding: 7px 8px; font-size: 11pt; text-align: left; }
  thead th { background: #E7F1F5; font-size: 9.5pt; text-transform: uppercase; letter-spacing: .4px; }
  th.num, td.num { width: 34px; text-align: center; color: #666; }
  th.idade, td.idade { width: 74px; }
  th.chk, td.chk { width: 72px; text-align: center; }
  .box { display: inline-block; width: 16px; height: 16px; border: 2px solid #333; border-radius: 3px; }
  tbody tr { height: 32px; }
  .vazio { text-align: center; color: #999; font-style: italic; }
  .rodape { margin-top: 10px; font-size: 10pt; color: #444; display: flex; justify-content: space-between; }
  .rodape .ass { color: #999; }
`;

function escapeHtml(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  } as Record<string, string>)[c]);
}

function tabelaBloco(b: BlocoApresentacao, comContato: boolean): string {
  const nCols = comContato ? 6 : 5;
  const linhas = b.criancas.length
    ? b.criancas.map((c, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td>${escapeHtml(c.nome)}</td>
        <td class="idade">${escapeHtml(c.idade || '')}</td>
        <td>${escapeHtml(c.responsaveis || '')}</td>
        ${comContato ? `<td>${escapeHtml(c.telefone || '—')}</td>` : ''}
        <td class="chk"><span class="box"></span></td>
      </tr>`).join('')
    : `<tr><td class="vazio" colspan="${nCols}">Nenhuma criança neste culto</td></tr>`;

  return `
    <section class="bloco">
      <div class="cabec">
        <div class="titulo">⛪ CB Rio · Lista de Presença — Apresentação de Crianças</div>
        <div class="sub">${escapeHtml(b.turma)}</div>
        <div class="culto">${escapeHtml(b.horario ? `Culto das ${b.horario}` : 'Culto ainda não definido')}</div>
      </div>
      <table>
        <thead>
          <tr>
            <th class="num">#</th>
            <th>Criança</th>
            <th class="idade">Idade</th>
            <th>Responsáveis</th>
            ${comContato ? '<th>Contato</th>' : ''}
            <th class="chk">Presente</th>
          </tr>
        </thead>
        <tbody>${linhas}</tbody>
      </table>
      <div class="rodape">
        <span>Total: <strong>${b.criancas.length}</strong></span>
        <span class="ass">Responsável: ______________________</span>
      </div>
    </section>`;
}





export function montarHtmlApresentacao(
  blocos: BlocoApresentacao[],
  opcoes: OpcoesApresentacao = {},
): string {
  const comContato = !!opcoes.colunas?.contato;
  const corpo = blocos.map((b) => tabelaBloco(b, comContato)).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Lista de presença — Apresentação de Crianças</title><style>${CSS}</style></head><body>${corpo}</body></html>`;
}








export function imprimirListaApresentacao(
  blocos: BlocoApresentacao[],
  opcoes: OpcoesApresentacao = {},
): boolean {
  if (!blocos.length) return false;
  const htmlStr = montarHtmlApresentacao(blocos, opcoes);

  const win = window.open('', '_blank', 'width=900,height=1100,scrollbars=yes');
  if (!win) return false;

  win.document.open();
  win.document.write(htmlStr);
  win.document.close();
  win.focus();
  setTimeout(() => {
    try { win.print(); } catch (e) { console.error('[listaApresentacao] print:', e); }
  }, 350);
  return true;
}









export function montarBlocosApresentacao(
  inscricoes: Array<{
    crianca_nome?: string | null; crianca_idade?: string | null;
    nome_pai?: string | null; nome_mae?: string | null;
    telefone?: string | null; status?: string | null;
    data_apresentacao?: string | null; horario_culto?: string | null;
  }>,
  fmtData: (iso: string) => string,
  opcoes: OpcoesBlocos = {},
): BlocoApresentacao[] {
  const vivas = (inscricoes || []).filter((i) => i.status !== 'cancelado');

  const mapa = new Map<string, BlocoApresentacao>();
  for (const i of vivas) {
    const dia = i.data_apresentacao || '';
    const hora = i.horario_culto || '';
    const chave = `${dia}|${hora}`;
    if (!mapa.has(chave)) {
      mapa.set(chave, {
        turma: dia ? fmtData(dia) : 'Turma ainda não definida',



        horario: hora,
        criancas: [],
      });
    }



    const resp = [i.nome_pai, i.nome_mae].filter(Boolean).join(' · ');
    mapa.get(chave)!.criancas.push({
      nome: i.crianca_nome || '—',
      idade: i.crianca_idade || null,
      responsaveis: resp || null,
      telefone: i.telefone || null,
    });
  }




  const blocos = [...mapa.values()];
  for (const b of blocos) b.criancas.sort((a, c) => a.nome.localeCompare(c.nome, 'pt-BR'));
  blocos.sort((a, b) => {
    if (a.turma !== b.turma) return a.turma.localeCompare(b.turma, 'pt-BR');
    if (!a.horario) return 1;
    if (!b.horario) return -1;
    return a.horario.localeCompare(b.horario, 'pt-BR');
  });

  const fmtHorario = opcoes.fmtHorario;
  if (fmtHorario) {
    for (const b of blocos) if (b.horario) b.horario = fmtHorario(b.horario) || b.horario;
  }
  return blocos;
}
