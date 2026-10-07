













import { totemKids } from '@/api';

export interface DadosImpressao {
  checkinId: string;
  criancaId?: string;
  estacaoId?: string | null;
  crianca: {
    nome: string;
    idadeLabel: string;
    idadeAnos?: number | null;
    salaNome: string;
    salaCor?: string;
    salaLogoUrl?: string | null;
    observacoesMedicas?: string | null;
    alergia?: string | null;
    necessidade?: string | null;
    fotoAutorizada?: boolean;
    aniversarioSemana?: boolean;
  };
  responsavel: {
    nome: string;
  };
  codigoSeguranca: string;
  codigoBarras: string;
  dataHora: string;
  cultoNome?: string;
  cultoDiaHora?: string;
  ensaio?: boolean;
  pagerNumero?: string;
  layout?: EtiquetaLayout;
  logoAniversarioUrl?: string | null;
}


export type FonteEtiqueta = 'sans' | 'condensada' | 'arredondada' | 'serif' | 'mono';
export type EscalaEtiqueta = 'P' | 'M' | 'G' | 'GG';

export interface EtiquetaLayout {
  fonte?: FonteEtiqueta;
  escalaFonte?: EscalaEtiqueta;
  nomeTamanho?: 'auto' | 'P' | 'M' | 'G';


  logoTamanho?: 'P' | 'M' | 'G';
  logoPosicao?: 'esquerda' | 'direita' | 'acima';
}

export const LAYOUT_ETIQUETA_PADRAO: EtiquetaLayout = {
  fonte: 'sans',
  escalaFonte: 'M',
  nomeTamanho: 'auto',
};



const FONTES: Record<FonteEtiqueta, string> = {
  sans:        "'Inter','Helvetica Neue',Arial,system-ui,sans-serif",
  condensada:  "'Arial Narrow','Roboto Condensed','Liberation Sans Narrow',sans-serif",
  arredondada: "'Trebuchet MS','Segoe UI',Verdana,sans-serif",
  serif:       "Georgia,'Times New Roman',Times,serif",
  mono:        "'Courier New',Consolas,monospace",
};


const ESCALAS: Record<EscalaEtiqueta, number> = { P: 0.88, M: 1, G: 1.14, GG: 1.28 };









function cssEtiqueta(layout: EtiquetaLayout = LAYOUT_ETIQUETA_PADRAO): string {
  const fonte = FONTES[layout.fonte || 'sans'] || FONTES.sans;
  const escala = ESCALAS[layout.escalaFonte || 'M'] ?? 1;

  const pt = (base: number) => `calc(${base}pt * var(--escala))`;
  return `
  :root { --fonte: ${fonte}; --escala: ${escala}; }
  @page { size: 90mm 29mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body {
    width: 90mm; margin: 0; padding: 0;
    font-family: var(--fonte);
    color: #000; background: #fff;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  /* Cada etiqueta ocupa uma página; a Brother corta entre elas (1 job só). */
  .pagina { break-inside: avoid; }
  .etiqueta {
    width: 90mm; height: 29mm; padding: 1.5mm 2mm;
    display: flex; align-items: stretch; gap: 2mm;
    overflow: hidden; position: relative;
  }
  /* Faixa de cor da sala (única marca visual da categoria — a logo saiu). */
  .faixa-cor { position: absolute; top: 0; bottom: 0; left: 0; width: 3mm; background: var(--cor, #EC4899); }
  .col-esq { flex: 1; display: flex; flex-direction: column; justify-content: center; padding-left: 3mm; overflow: hidden; }
  
  .col-dir { width: 30mm; display: flex; flex-direction: column; align-items: center; justify-content: center; border-left: 0.5mm dashed #444; padding-left: 2mm; flex-shrink: 0; }
  /* Idade em destaque: número grande + legenda, como no sistema antigo. */
  .col-idade { width: 11mm; display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink: 0; }
  .idade-num { font-size: ${pt(17)}; font-weight: 900; line-height: 1; }
  .idade-num-p { font-size: ${pt(11)}; }
  .idade-cap { font-size: ${pt(6.5)}; font-weight: 700; color: #333; margin-top: 0.5mm; }

  .topo { display: flex; align-items: center; gap: 1.5mm; }
  .foto-badge { display: inline-flex; align-items: center; justify-content: center; line-height: 0; flex-shrink: 0; }
  .foto-badge svg { display: block; }

  /* Primeiro nome em destaque + resto do nome completo menor embaixo. */
  .nome-primeiro {
    font-size: calc(var(--nome-pt, 16) * var(--escala) * 1pt);
    font-weight: 800; line-height: 1;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .nome-resto {
    font-size: ${pt(8.5)}; font-weight: 700; line-height: 1.05; margin-top: 0.3mm;
    word-break: break-word; overflow: hidden; text-overflow: ellipsis;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  }
  .sala { font-size: ${pt(9)}; font-weight: 700; line-height: 1.1; margin-top: 0.4mm; }
  
  .pager-chip {
    display: inline-block; margin-left: 1.2mm; padding: 0.2mm 1mm;
    border: 0.35mm solid #000; border-radius: 0.8mm; vertical-align: baseline;
    font-family: 'Courier New', monospace; font-weight: 900; font-size: ${pt(8.5)};
    letter-spacing: 0.4px; white-space: nowrap;
  }

  /* Banda PRETA do código (branco no preto) + réguas finas em cima/embaixo —
     eco da estética de barcode da etiqueta antiga; imprime bem na térmica. */
  .band-wrap { width: 100%; }
  .band-rule { height: 0.45mm; background: #000; border-radius: 0.2mm; margin: 0.35mm 0; }
  .codigo-band {
    background: #000; color: #fff; font-family: 'Courier New', monospace;
    font-weight: 900; font-size: ${pt(16)}; letter-spacing: 2.5px;
    text-align: center; line-height: 1; padding: 1mm 1mm 0.8mm; border-radius: 0.6mm;
  }
  .codigo-band-g { font-size: ${pt(21)}; letter-spacing: 3px; }
  
  .codigo-band-cheia { font-size: ${pt(24)}; letter-spacing: 2px; flex: 1; display: flex; align-items: center; justify-content: center; padding: 1mm 0.5mm; }
  .col-dir-cheia { padding-top: 1mm; padding-bottom: 1mm; }
  .col-dir-cheia .band-wrap { flex: 1; display: flex; flex-direction: column; }
  
  .recibo-nome { font-size: ${pt(10)}; font-weight: 800; line-height: 1.05; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .recibo-logo { display: block; height: 6mm; max-width: 26mm; object-fit: contain; align-self: flex-start; margin: 0.6mm 0 0.4mm; }
  .recibo-hint { font-size: ${pt(6.5)}; color: #555; line-height: 1.1; margin-top: 0.3mm; }
  .recibo-dir { width: 42mm; justify-content: center; }
  .recibo-dir .barcode-area svg { max-width: 34mm; height: 7mm; }
  .recibo-culto { font-size: ${pt(8)}; font-weight: 800; line-height: 1.1; }
  
  .recibo-pager {
    font-family: 'Courier New', monospace; font-weight: 900; font-size: ${pt(13)};
    letter-spacing: 0.6px; line-height: 1.1; margin-top: 0.7mm; align-self: flex-start;
    border: 0.4mm solid #000; border-radius: 0.8mm; padding: 0.4mm 1.5mm;
  }
  .info-sec { font-size: ${pt(7.5)}; color: #444; line-height: 1.2; margin-top: 0.5mm; }
  
  .alerta {
    color: #000; font-weight: 800; font-size: ${pt(8)}; line-height: 1.1;
    margin-top: 1mm; display: flex; align-items: center; gap: 1mm; overflow: hidden;
  }
  .alerta svg { width: 3.6mm; height: 3.6mm; flex-shrink: 0; }
  .alerta-txt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* Faixa de ENSAIO (modo teste · culto de outro dia): a etiqueta física não
     pode ter cara de check-in real — ela sobrevive à tela. */
  .ensaio-strip {
    background: #000; color: #fff; padding: 0.6mm 1.5mm; margin-bottom: 0.6mm;
    font-size: ${pt(6.5)}; font-weight: 800; letter-spacing: 0.6px; line-height: 1.1;
    border-radius: 0.5mm; text-align: center; white-space: nowrap; overflow: hidden;
  }

  /* Código de segurança · sempre monoespaçado (evita confundir O/0, I/1). */
  .codigo { font-family: 'Courier New', monospace; font-size: ${pt(20)}; font-weight: 900; letter-spacing: 2px; line-height: 1; text-align: center; }
  .cod-label { font-size: ${pt(6.5)}; color: #555; text-align: center; margin-top: 0.5mm; }
  .barcode-area { margin-top: 1mm; text-align: center; }
  .barcode-area svg { max-width: 28mm; height: 6mm; }
  .data-hora { font-size: ${pt(6.5)}; color: #555; margin-top: 1mm; text-align: center; line-height: 1.1; }
  .header-resp { font-size: ${pt(7)}; font-weight: 700; color: #444; text-align: center; margin-bottom: 1mm; line-height: 1.1; }

  /* Etiqueta de aniversário (4ª · na semana do aniversário) */
  .etiqueta.aniv { flex-direction: column; align-items: stretch; gap: 1mm; padding: 1.5mm 3mm; }
  .aniv-banner { background: #000; color: #fff; font-weight: 900; font-size: ${pt(12)}; text-align: center; letter-spacing: 0.5px; padding: 1mm 0; border-radius: 0.5mm; }
  .aniv-row { display: flex; align-items: center; justify-content: space-between; gap: 2mm; flex: 1; }
  .aniv-logo { height: 9mm; max-width: 30mm; object-fit: contain; }
  .aniv-idade { font-size: ${pt(15)}; font-weight: 900; white-space: nowrap; }
  .aniv-bolo { line-height: 0; }
  .aniv-bolo svg { height: 13mm; width: auto; display: block; }
  `;
}

function gerarBarcodeSvg(codigo: string): Promise<string> {

  return import('bwip-js/browser').then(mod => {
    const bwipjs = (mod as unknown as { default?: { toSVG: (o: object) => string }; toSVG?: (o: object) => string }).default
      || (mod as unknown as { toSVG: (o: object) => string });

    const opts = {
      bcid: 'code128',
      text: codigo,
      scale: 1,
      height: 8,
      includetext: false,
      backgroundcolor: 'FFFFFF',
    };
    try {
      const svg = bwipjs.toSVG(opts);
      return svg;
    } catch (e) {
      console.warn('[totemKids/imprimir] falha barcode, fallback texto:', e);
      return `<text>${codigo}</text>`;
    }
  }).catch(() => `<text>${codigo}</text>`);
}




function nomeParaEtiqueta(nome: string): string {
  return String(nome || '').trim().replace(/\s+/g, ' ');
}




function partesNome(nome: string): { primeiro: string; resto: string } {
  const p = nomeParaEtiqueta(nome).split(' ');
  return { primeiro: p[0] || '', resto: p.slice(1).join(' ') };
}


function fontePrimeiroNome(primeiro: string, tamanho?: EtiquetaLayout['nomeTamanho']): number {
  if (tamanho === 'P') return 11;
  if (tamanho === 'M') return 13;
  if (tamanho === 'G') return 15;
  const n = primeiro.length;
  if (n <= 8) return 16;
  if (n <= 12) return 14;
  if (n <= 16) return 12;
  return 10;
}




function bandaCodigo(codigo: string, variante?: 'g' | 'cheia'): string {
  const extra = variante === 'g' ? ' codigo-band-g' : variante === 'cheia' ? ' codigo-band-cheia' : '';
  return `<div class="band-wrap">
    <div class="band-rule"></div>
    <div class="codigo-band${extra}">${codigo}</div>
    <div class="band-rule"></div>
  </div>`;
}




const ICONE_CAMERA_NAO = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/><line x1="2" y1="2" x2="22" y2="22" stroke-width="2.4"/></svg>`;

const ICONE_ALERTA = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#000" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13.5"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;


const ICONE_BOLO = `<svg viewBox="0 0 64 64" width="52" height="52" fill="none" stroke="#000" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M24 6c1.6 1 1.6 3.2 0 3.8-1.6-.6-1.6-2.8 0-3.8z" fill="#000" stroke="none"/><path d="M32 4c1.6 1 1.6 3.2 0 3.8-1.6-.6-1.6-2.8 0-3.8z" fill="#000" stroke="none"/><path d="M40 6c1.6 1 1.6 3.2 0 3.8-1.6-.6-1.6-2.8 0-3.8z" fill="#000" stroke="none"/><line x1="24" y1="11" x2="24" y2="20"/><line x1="32" y1="9" x2="32" y2="20"/><line x1="40" y1="11" x2="40" y2="20"/><rect x="19" y="20" width="26" height="9" rx="1.5"/><rect x="13" y="29" width="38" height="11" rx="1.5"/><path d="M8 40h48v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2z"/><line x1="6" y1="52" x2="58" y2="52"/></svg>`;





function htmlEtiquetaCrianca(d: DadosImpressao): string {
  const layout = { ...LAYOUT_ETIQUETA_PADRAO, ...(d.layout || {}) };







  const saude = [
    d.crianca.alergia || '',
    d.crianca.necessidade || '',
    !d.crianca.alergia && !d.crianca.necessidade ? (d.crianca.observacoesMedicas || '') : '',
  ].filter(Boolean).join(' · ');
  const alerta = saude
    ? `<div class="alerta">${ICONE_ALERTA}<span class="alerta-txt">${escapeHtml(saude)}</span></div>`
    : '';




  const foto = d.crianca.fotoAutorizada ? '' : `<span class="foto-badge">${ICONE_CAMERA_NAO}</span>`;


  const { primeiro, resto } = partesNome(d.crianca.nome);
  const nomePt = fontePrimeiroNome(primeiro, layout.nomeTamanho);



  const anos = d.crianca.idadeAnos;
  const idadeValor = anos != null && anos >= 1 ? String(anos) : (d.crianca.idadeLabel || '—');

  return `<div class="etiqueta" style="--cor:${d.crianca.salaCor || '#EC4899'}">
    <div class="faixa-cor"></div>
    <div class="col-esq">
      ${d.ensaio ? '<div class="ensaio-strip">TESTE / ENSAIO — NÃO VALE COMO PRESENÇA</div>' : ''}
      <div class="topo"><div class="nome-primeiro" style="--nome-pt:${nomePt}">${escapeHtml(primeiro)}</div>${foto}</div>
      ${resto ? `<div class="nome-resto">${escapeHtml(resto)}</div>` : ''}
      <div class="sala">${escapeHtml(d.crianca.salaNome)}${d.pagerNumero ? `<span class="pager-chip">Pager ${escapeHtml(d.pagerNumero)}</span>` : ''}</div>
      ${alerta}
    </div>
    <div class="col-idade">
      <div class="idade-num${String(idadeValor).length > 2 ? ' idade-num-p' : ''}">${escapeHtml(idadeValor)}</div>
      <div class="idade-cap">idade</div>
    </div>
    <div class="col-dir col-dir-cheia">
      ${bandaCodigo(d.codigoSeguranca, 'cheia')}
    </div>
  </div>`;
}


function htmlEtiquetaAniversario(d: DadosImpressao): string {
  const anos = d.crianca.idadeAnos != null ? d.crianca.idadeAnos : null;
  const idade = anos != null ? `${anos} ano${anos === 1 ? '' : 's'}` : '';
  const logo = d.logoAniversarioUrl
    ? `<img class="aniv-logo" src="${escapeHtml(d.logoAniversarioUrl)}" alt="" />`
    : '<span></span>';
  return `<div class="etiqueta aniv">
    <div class="aniv-banner">FELIZ ANIVERSÁRIO!</div>
    <div class="aniv-row">
      ${logo}
      ${idade ? `<span class="aniv-idade">${escapeHtml(idade)}</span>` : ''}
      <span class="aniv-bolo">${ICONE_BOLO}</span>
    </div>
  </div>`;
}



function documento(fragmentos: string[], layout?: EtiquetaLayout): string {
  const corpo = fragmentos.map((f, i) =>
    `<div class="pagina"${i < fragmentos.length - 1 ? ' style="page-break-after:always"' : ''}>${f}</div>`
  ).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>${cssEtiqueta(layout)}</style></head><body>${corpo}</body></html>`;
}




function htmlEtiquetaResponsavel(d: DadosImpressao, barcodeSvg: string): string {







  const logo = d.logoAniversarioUrl
    ? `<img class="recibo-logo" src="${escapeHtml(d.logoAniversarioUrl)}" alt="" />`
    : '';
  return `<div class="etiqueta">
    <div class="col-esq" style="padding-left:0">
      ${d.ensaio ? '<div class="ensaio-strip">TESTE / ENSAIO — NÃO VALE COMO PRESENÇA</div>' : ''}
      <div class="recibo-nome">${escapeHtml(nomeParaEtiqueta(d.responsavel.nome))}</div>
      ${logo}
      <div class="recibo-culto">${escapeHtml(d.cultoDiaHora || d.crianca.salaNome)}</div>
      ${d.pagerNumero ? `<div class="recibo-pager">PAGER ${escapeHtml(d.pagerNumero)}</div>` : ''}
      <div class="recibo-hint">Apresente este código para buscar</div>
    </div>
    <div class="col-dir recibo-dir">
      ${bandaCodigo(d.codigoSeguranca, 'g')}
      <div class="barcode-area">${barcodeSvg}</div>
    </div>
  </div>`;
}



function preloadImg(url?: string | null): Promise<void> {
  if (!url) return Promise.resolve();
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = url;

    setTimeout(resolve, 2500);
  });
}

function escapeHtml(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  } as Record<string, string>)[c]);
}

type ResultadoImpressao = { status: 'enviada' | 'sucesso' };







const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function checkinIdValido(id: string | undefined | null): boolean {
  return !!id && UUID_RE.test(id);
}

function imprimirHtml(html: string, preview = false): Promise<ResultadoImpressao> {
  if (preview) {



    return new Promise((resolve) => {
      const win = window.open('', '_blank', 'width=480,height=200,scrollbars=yes');
      if (!win) {
        throw new Error('Popup bloqueado · libere popups do sistema para visualizar a etiqueta');
      }
      win.document.open();
      win.document.write(html);
      win.document.close();
      resolve({ status: 'sucesso' });
    });
  }
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');



    iframe.style.position = 'fixed';
    iframe.style.top = '0';
    iframe.style.left = '-9999px';
    iframe.style.width = '90mm';
    iframe.style.height = '29mm';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      reject(new Error('O navegador não conseguiu preparar a impressão'));
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();


    setTimeout(() => {
      let finalizado = false;
      const concluir = (status: ResultadoImpressao['status']) => {
        if (finalizado) return;
        finalizado = true;
        try { document.body.removeChild(iframe); } catch {                   }
        resolve({ status });
      };
      try {



        iframe.contentWindow?.addEventListener('afterprint', () => concluir('sucesso'), { once: true });
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        console.error('[totemKids/imprimir] erro print:', e);
        try { document.body.removeChild(iframe); } catch {                   }
        reject(new Error(`Falha ao enviar para a impressora: ${e instanceof Error ? e.message : String(e)}`));
        return;
      }


      setTimeout(() => concluir('enviada'), 4000);
    }, 400);
  });
}



export function gerarHtmlPreviewCrianca(d: DadosImpressao): string {
  return documento([htmlEtiquetaCrianca(d)], d.layout);
}


export function gerarHtmlPreviewAniversario(d: DadosImpressao): string {
  return documento([htmlEtiquetaAniversario(d)], d.layout);
}








export async function imprimirEtiquetas(d: DadosImpressao, preview = false, incluirRecibo = true): Promise<void> {
  const [barcodeSvg] = await Promise.all([
    gerarBarcodeSvg(d.codigoBarras),


    preloadImg(d.logoAniversarioUrl),
  ]);







  let comAniversario = !!d.crianca.aniversarioSemana;
  if (comAniversario && d.criancaId) {
    try {
      const r = await totemKids.criancas.aniversarioImpressoes(d.criancaId);
      comAniversario = r?.imprimir !== false;
    } catch {                 }
  }



  const fragCrianca = htmlEtiquetaCrianca(d);
  const fragmentos = [fragCrianca, fragCrianca];
  if (incluirRecibo) fragmentos.push(htmlEtiquetaResponsavel(d, barcodeSvg));
  if (comAniversario) fragmentos.push(htmlEtiquetaAniversario(d));

  const resultado = await imprimirHtml(documento(fragmentos, d.layout), preview);
  if (preview) return;
  if (!checkinIdValido(d.checkinId)) return;

  totemKids.etiquetas.log({
    checkin_id: d.checkinId,
    estacao_id: d.estacaoId,
    tipo: 'crianca',
    conteudo: {
      nome: d.crianca.nome,
      sala: d.crianca.salaNome,
      idade: d.crianca.idadeLabel,
      codigo: d.codigoSeguranca,
      observacoes_medicas: d.crianca.observacoesMedicas,
      copias: 2,
      aniversario: comAniversario,
    },
    status: resultado.status,
  }).catch(() => {});
  if (incluirRecibo) {
    totemKids.etiquetas.log({
      checkin_id: d.checkinId,
      estacao_id: d.estacaoId,
      tipo: 'responsavel',
      conteudo: { crianca: d.crianca.nome, sala: d.crianca.salaNome, codigo: d.codigoSeguranca },
      status: resultado.status,
    }).catch(() => {});
  }
}






export async function imprimirEtiquetasLote(
  itens: { d: DadosImpressao; incluirRecibo: boolean }[],
  preview = false,
): Promise<void> {
  if (!itens.length) return;
  if (itens.length === 1) {

    return imprimirEtiquetas(itens[0].d, preview, itens[0].incluirRecibo);
  }

  const primeiro = itens[0].d;

  const barcodes = new Map<string, string>();
  await Promise.all([
    ...itens.filter((it) => it.incluirRecibo).map(async (it) => {
      barcodes.set(it.d.codigoBarras, await gerarBarcodeSvg(it.d.codigoBarras));
    }),
    preloadImg(primeiro.logoAniversarioUrl),
  ]);


  const podeAniversario = await Promise.all(itens.map(async (it) => {
    if (!it.d.crianca.aniversarioSemana) return false;
    if (!it.d.criancaId) return true;
    try {
      const r = await totemKids.criancas.aniversarioImpressoes(it.d.criancaId);
      return r?.imprimir !== false;
    } catch { return true;                                           }
  }));

  const fragmentos: string[] = [];
  for (let i = 0; i < itens.length; i++) {
    const { d, incluirRecibo } = itens[i];
    const fragCrianca = htmlEtiquetaCrianca(d);
    fragmentos.push(fragCrianca, fragCrianca);
    if (incluirRecibo) fragmentos.push(htmlEtiquetaResponsavel(d, barcodes.get(d.codigoBarras) || ''));
    if (podeAniversario[i]) fragmentos.push(htmlEtiquetaAniversario(d));
  }

  const resultado = await imprimirHtml(documento(fragmentos, primeiro.layout), preview);
  if (preview) return;

  const eventos: Record<string, unknown>[] = [];
  itens.forEach(({ d, incluirRecibo }, i) => {
    if (!checkinIdValido(d.checkinId)) return;
    eventos.push({
      checkin_id: d.checkinId,
      estacao_id: d.estacaoId,
      tipo: 'crianca',
      conteudo: {
        nome: d.crianca.nome,
        sala: d.crianca.salaNome,
        idade: d.crianca.idadeLabel,
        codigo: d.codigoSeguranca,
        observacoes_medicas: d.crianca.observacoesMedicas,
        copias: 2,
        aniversario: podeAniversario[i],
        lote_familia: itens.length,
      },
      status: resultado.status,
    });
    if (incluirRecibo) {
      eventos.push({
        checkin_id: d.checkinId,
        estacao_id: d.estacaoId,
        tipo: 'responsavel',
        conteudo: { crianca: d.crianca.nome, sala: d.crianca.salaNome, codigo: d.codigoSeguranca, lote_familia: itens.length },
        status: resultado.status,
      });
    }
  });
  if (eventos.length) totemKids.etiquetas.logLote(eventos).catch(() => {});
}


export async function reimprimirEtiqueta(d: DadosImpressao, tipo: 'crianca' | 'responsavel', motivo: string): Promise<void> {
  const [barcodeSvg] = await Promise.all([
    gerarBarcodeSvg(d.codigoBarras),
    tipo === 'responsavel' ? preloadImg(d.logoAniversarioUrl) : Promise.resolve(),
  ]);
  const frag = tipo === 'crianca' ? htmlEtiquetaCrianca(d) : htmlEtiquetaResponsavel(d, barcodeSvg);
  const resultado = await imprimirHtml(documento([frag], d.layout));
  totemKids.etiquetas.log({
    checkin_id: d.checkinId,
    estacao_id: d.estacaoId,
    tipo,
    conteudo: { nome: d.crianca.nome, codigo: d.codigoSeguranca },
    reimpressao: true,
    motivo_reimpressao: motivo,
    status: resultado.status,
  }).catch(() => {});
}




export async function reimprimirEtiquetasCompletas(d: DadosImpressao, motivo: string): Promise<void> {
  const [barcodeSvg] = await Promise.all([
    gerarBarcodeSvg(d.codigoBarras),
    preloadImg(d.crianca.salaLogoUrl),
    preloadImg(d.logoAniversarioUrl),
  ]);




  const fragCrianca = htmlEtiquetaCrianca(d);
  const fragmentos = [fragCrianca, fragCrianca, htmlEtiquetaResponsavel(d, barcodeSvg)];
  if (d.crianca.aniversarioSemana) fragmentos.push(htmlEtiquetaAniversario(d));
  const resultado = await imprimirHtml(documento(fragmentos));
  await Promise.all([
    totemKids.etiquetas.log({
      checkin_id: d.checkinId,
      estacao_id: d.estacaoId,
      tipo: 'crianca',
      conteudo: { nome: d.crianca.nome, codigo: d.codigoSeguranca, copias: 2, completa: true },
      reimpressao: true,
      motivo_reimpressao: motivo,
      status: resultado.status,
    }),
    totemKids.etiquetas.log({
      checkin_id: d.checkinId,
      estacao_id: d.estacaoId,
      tipo: 'responsavel',
      conteudo: { nome: d.responsavel.nome, codigo: d.codigoSeguranca, completa: true },
      reimpressao: true,
      motivo_reimpressao: motivo,
      status: resultado.status,
    }),
  ]).catch(() => {});
}
