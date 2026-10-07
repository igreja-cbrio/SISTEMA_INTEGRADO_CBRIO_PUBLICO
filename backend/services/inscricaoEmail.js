



















const { enviarEmail, isConfigured } = require('./email');
const { supabase } = require('../utils/supabase');



const VARIAVEIS = Object.freeze({
  comuns: ['nome', 'primeiro_nome', 'codigo', 'evento', 'data', 'hora', 'local', 'link'],
  confirmada: ['valor', 'forma'],
  pendente: ['valor', 'expira_em'],
  expirada: [],
});

const TIPOS = Object.freeze(['confirmada', 'pendente', 'expirada']);










async function carregarTemplate(tipo, eventoId) {
  try {
    let q = supabase.from('insc_email_templates')
      .select('tipo, evento_id, assunto, corpo_html, incluir_assinatura')
      .eq('tipo', tipo).eq('ativo', true);
    q = eventoId ? q.or(`evento_id.eq.${eventoId},evento_id.is.null`) : q.is('evento_id', null);
    const { data, error } = await q;
    if (error || !data?.length) return null;

    return data.find((t) => t.evento_id) || data.find((t) => !t.evento_id) || null;
  } catch (e) {
    console.warn('[inscricaoEmail] template indisponível, usando padrão:', e.message);
    return null;
  }
}






function renderizar(texto, vars) {
  return String(texto || '').replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (todo, chave) => {
    const v = vars[String(chave).toLowerCase()];
    return v == null || v === '' ? '' : escapar(v);
  });
}



function ativo() {
  return process.env.INSC_EMAIL_ATIVO !== '0' && process.env.INSC_EMAIL_ATIVO !== 'false';
}





const RE_URL_LOCAL = /localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|:\/\/(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/i;

function baseUrl() {
  const bruta = process.env.FRONTEND_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  if (!bruta) return null;
  const url = String(bruta).replace(/\/+$/, '');
  if (RE_URL_LOCAL.test(url)) {
    console.warn('[inscricaoEmail] FRONTEND_URL local ignorada — e-mail sai sem link');
    return null;
  }
  return url;
}






function politicaHtml() {
  const base = baseUrl();
  if (!base) return '';
  return `<a href="${base}/politica-reembolso" style="color:#9ca3af">Política de reembolso e cancelamento</a>`;
}

function escapar(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function primeiroNome(nome) {
  return String(nome || '').trim().split(/\s+/)[0] || 'Olá';
}

function formatarQuando(evento) {
  const data = String(evento?.data || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return null;
  const [a, m, d] = data.split('-');


  const fim = String(evento?.data_fim || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(fim) && fim !== data) {
    const [a2, m2, d2] = fim.split('-');
    const periodo = `${d}/${m}/${a} a ${d2}/${m2}/${a2}`;
    return evento?.hora ? `${periodo} · ${evento.hora}` : periodo;
  }
  return evento?.hora ? `${d}/${m}/${a} às ${evento.hora}` : `${d}/${m}/${a}`;
}

function reais(centavos) {
  if (centavos == null) return null;
  return `R$ ${(Number(centavos) / 100).toFixed(2).replace('.', ',')}`;
}

const ROTULO_METODO = Object.freeze({
  pix: 'Pix', boleto: 'Boleto', cartao: 'Cartão de crédito',
  apple_pay: 'Apple Pay', dinheiro: 'Dinheiro', transferencia: 'Transferência',
});


function montarHtml({ titulo, saudacao, paragrafos = [], linhas = [], acao, rodape, politica }) {
  const itens = linhas
    .filter((l) => l && l.valor)
    .map((l) => `<tr>
      <td style="padding:6px 12px 6px 0;color:#6b7280;font-size:13px;white-space:nowrap">${escapar(l.rotulo)}</td>
      <td style="padding:6px 0;color:#111827;font-size:14px;font-weight:600">${escapar(l.valor)}</td>
    </tr>`).join('');

  const botao = acao?.url
    ? `<p style="margin:24px 0 8px"><a href="${escapar(acao.url)}"
         style="display:inline-block;background:#00B39D;color:#ffffff;text-decoration:none;
                padding:12px 22px;border-radius:8px;font-weight:600;font-size:15px"
       >${escapar(acao.rotulo)}</a></p>
       <p style="margin:0;color:#6b7280;font-size:12px;word-break:break-all">${escapar(acao.url)}</p>`
    : '';

  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
                      max-width:560px;margin:0 auto;padding:24px;color:#111827">
    <h1 style="margin:0 0 4px;font-size:20px;color:#111827">${escapar(titulo)}</h1>
    <p style="margin:0 0 18px;color:#374151;font-size:15px">${escapar(saudacao)}</p>
    ${paragrafos.map((p) => `<p style="margin:0 0 14px;color:#374151;font-size:15px">${escapar(p)}</p>`).join('')}
    ${itens ? `<table role="presentation" style="border-collapse:collapse;margin:18px 0">${itens}</table>` : ''}
    ${botao}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:26px 0 14px">
    <p style="margin:0;color:#9ca3af;font-size:12px">${escapar(rodape || 'Comunidade Batista do Rio de Janeiro')}</p>
    ${politica ? `<p style="margin:8px 0 0;color:#9ca3af;font-size:12px">${politica}</p>` : ''}
  </div>`;
}

function montarTexto({ titulo, saudacao, paragrafos = [], linhas = [], acao }) {
  const partes = [titulo, '', saudacao, ''];
  paragrafos.forEach((p) => { partes.push(p, ''); });
  linhas.filter((l) => l && l.valor).forEach((l) => partes.push(`${l.rotulo}: ${l.valor}`));
  if (acao?.url) partes.push('', `${acao.rotulo}: ${acao.url}`);
  partes.push('', 'Comunidade Batista do Rio de Janeiro');
  return partes.join('\n');
}
















async function extrasDoEvento(eventoId) {
  if (!eventoId) return null;
  try {
    const { data, error } = await supabase.from('insc_eventos')
      .select('data_fim, instrucoes_url, instrucoes_nome, termos_extra')
      .eq('id', eventoId).maybeSingle();
    if (error) return null;
    return data || null;
  } catch { return null; }
}


async function inscricaoDeMenor(inscricaoId) {
  if (!inscricaoId) return false;
  try {
    const { data, error } = await supabase.from('inscricoes')
      .select('responsavel_nome').eq('id', inscricaoId).maybeSingle();
    if (error) return false;
    return !!String(data?.responsavel_nome || '').trim();
  } catch { return false; }
}

const TIPO_POR_EXTENSAO = Object.freeze({
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
});



const TETO_ARQUIVO_BYTES = 2.5 * 1024 * 1024;

async function baixarAnexo({ nome, url }) {
  if (!/^https:\/\//.test(String(url || ''))) return null;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;
    const buf = Buffer.from(await resp.arrayBuffer());
    if (!buf.length || buf.length > TETO_ARQUIVO_BYTES) return null;
    const ext = String(url).split('?')[0].split('.').pop().toLowerCase();
    return {
      nome: String(nome || `arquivo.${ext}`).slice(0, 200),
      tipo: TIPO_POR_EXTENSAO[ext] || 'application/octet-stream',
      base64: buf.toString('base64'),
    };
  } catch { return null; }
}







async function arquivosDaConfirmacao({ eventoId, inscricaoId }) {
  const extras = await extrasDoEvento(eventoId);
  if (!extras) return { anexos: [], links: [], extras: null };
  const alvos = [];
  if (/^https:\/\//.test(String(extras.instrucoes_url || ''))) {
    alvos.push({ nome: extras.instrucoes_nome || 'Instruções gerais', url: extras.instrucoes_url });
  }
  if (Array.isArray(extras.termos_extra) && await inscricaoDeMenor(inscricaoId)) {
    for (const t of extras.termos_extra) {
      if (t && t.so_menor === true && /^https:\/\//.test(String(t.url || ''))) {
        alvos.push({ nome: t.titulo || 'Documento do responsável', url: t.url });
      }
    }
  }
  const anexos = (await Promise.all(alvos.map(baixarAnexo))).filter(Boolean);
  return { anexos, links: alvos, extras };
}


function arquivosHtml(links) {
  if (!links.length) return '';
  const itens = links.map((l) => `<li style="margin:4px 0"><a href="${escapar(l.url)}"
      style="color:#00B39D;font-weight:600">${escapar(l.nome)}</a></li>`).join('');
  return `<div style="margin-top:22px;padding:14px 16px;border:1px solid #e5e7eb;border-radius:12px;
                font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
    <div style="font-size:14px;font-weight:700;color:#111827">Arquivos do evento</div>
    <p style="margin:6px 0 8px;color:#374151;font-size:13px">
      Eles também vão anexados neste e-mail — guarde para o dia do evento.</p>
    <ul style="margin:0;padding-left:18px;color:#374151;font-size:13px">${itens}</ul>
  </div>`;
}


function preparar(inscricao) {
  if (!ativo()) return { pular: 'desligado' };
  if (!isConfigured()) return { pular: 'sem_canal_email' };
  const email = String(inscricao?.email || '').trim();
  if (!email || !email.includes('@')) return { pular: 'sem_email' };
  return { email };
}






function sanitizarHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<script[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}


async function carregarAssinatura() {
  try {
    const { data, error } = await supabase.from('insc_email_templates')
      .select('corpo_html').eq('tipo', 'assinatura').is('evento_id', null)
      .eq('ativo', true).maybeSingle();
    if (error) return '';
    return data?.corpo_html || '';
  } catch { return ''; }
}









function esqueletoPadrao(tipo) {
  const V = {
    nome: '{{nome}}', primeiro: '{{primeiro_nome}}', codigo: '{{codigo}}',
    evento: '{{evento}}', data: '{{data}}', local: '{{local}}',
    valor: '{{valor}}', forma: '{{forma}}', expira: '{{expira_em}}', link: '{{link}}',
  };
  const linhasComuns = [
    { rotulo: 'Código', valor: V.codigo },
    { rotulo: 'Evento', valor: V.evento },
    { rotulo: 'Quando', valor: V.data },
    { rotulo: 'Local', valor: V.local },
  ];

  if (tipo === 'confirmada') {
    return {
      assunto: `Inscrição confirmada · ${V.evento} (${V.codigo})`,
      corpo_html: montarHtml({
        titulo: 'Inscrição confirmada',
        saudacao: `${V.primeiro}, sua inscrição está garantida.`,
        paragrafos: [
          'Recebemos seu pagamento.',
          'Guarde o código abaixo: é ele que identifica sua inscrição se você precisar falar com a equipe.',
        ],
        linhas: [...linhasComuns, { rotulo: 'Valor', valor: V.valor }, { rotulo: 'Forma', valor: V.forma }],
        acao: { rotulo: 'Ver meu comprovante', url: V.link },
      }),
    };
  }
  if (tipo === 'pendente') {
    return {
      assunto: `Pagamento pendente · ${V.evento} (${V.codigo})`,
      corpo_html: montarHtml({
        titulo: 'Falta pagar para garantir sua vaga',
        saudacao: `${V.primeiro}, recebemos sua inscrição.`,
        paragrafos: [
          'Sua vaga está reservada, mas só fica garantida depois do pagamento.',
          `Se o pagamento não for feito até ${V.expira}, a vaga volta para a fila.`,
        ],
        linhas: [...linhasComuns, { rotulo: 'Valor', valor: V.valor }],
        acao: { rotulo: 'Pagar minha inscrição', url: V.link },
      }),
    };
  }
  if (tipo === 'expirada') {
    return {
      assunto: `Reserva expirada · ${V.evento} (${V.codigo})`,
      corpo_html: montarHtml({
        titulo: 'Sua reserva expirou',
        saudacao: `${V.primeiro}, o prazo de pagamento da sua inscrição venceu.`,
        paragrafos: [
          'A vaga voltou para a fila, então sua inscrição não está mais valendo.',
          'Se ainda quiser participar, é possível se inscrever de novo enquanto houver vaga.',
        ],
        linhas: [{ rotulo: 'Código', valor: V.codigo }, { rotulo: 'Evento', valor: V.evento }],
        acao: { rotulo: 'Inscrever-se de novo', url: V.link },
      }),
    };
  }

  return {
    assunto: '',
    corpo_html: '<p><strong>Comunidade Batista do Rio de Janeiro</strong><br>'
      + 'Rua do Catete, 26 — Rio de Janeiro/RJ<br>'
      + '<a href="https://cbrio.org">cbrio.org</a></p>',
  };
}


function semTags(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function despachar({ to, subject, corpo, html, text, attachments }) {
  const corpoHtml = html || montarHtml(corpo);
  const r = await enviarEmail({
    to,
    subject,
    html: corpoHtml,
    text: text || (html ? semTags(html) : montarTexto(corpo)),
    fromName: 'CBRio',
    attachments,
  });
  if (!r.ok) console.error('[inscricaoEmail]', subject, '→', r.error);
  return r;
}







async function despacharTipo({ tipo, eventoId, to, vars, assuntoPadrao, corpo, attachments, extraHtml = '' }) {
  const [tpl, assinaturaBruta] = await Promise.all([
    carregarTemplate(tipo, eventoId),
    carregarAssinatura(),
  ]);




  const quer = tpl ? tpl.incluir_assinatura !== false : true;
  const assinatura = (quer && assinaturaBruta)
    ? `<div style="margin-top:26px;padding-top:14px;border-top:1px solid #e5e7eb;
                   font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
                   font-size:13px;color:#374151">${sanitizarHtml(renderizar(assinaturaBruta, vars))}</div>`
    : '';

  if (tpl) {
    return despachar({
      to,
      subject: renderizar(tpl.assunto, vars) || assuntoPadrao,
      html: sanitizarHtml(renderizar(tpl.corpo_html, vars)) + extraHtml + assinatura,
      attachments,
    });
  }
  return despachar({
    to,
    subject: assuntoPadrao,
    html: montarHtml(corpo) + extraHtml + assinatura,
    text: montarTexto(corpo),
    attachments,
  });
}


function varsBase({ inscricao, evento, link }) {
  return {
    nome: inscricao?.nome_completo || '',
    primeiro_nome: primeiroNome(inscricao?.nome_completo),
    codigo: inscricao?.codigo || '',
    evento: evento?.nome || '',
    data: formatarQuando(evento) || '',
    hora: evento?.hora || '',
    local: evento?.local || '',
    link: link || '',
  };
}





async function enviarEmailInscricaoConfirmada({ inscricao, evento, cobranca, comprovanteToken }) {
  const g = preparar(inscricao);
  if (g.pular) return { sent: false, reason: g.pular };




  const arq = await arquivosDaConfirmacao({ eventoId: evento?.id, inscricaoId: inscricao?.id });
  const ev = arq.extras?.data_fim ? { ...evento, data_fim: arq.extras.data_fim } : evento;

  const base = baseUrl();
  const link = (base && comprovanteToken) ? `${base}/i/c/${comprovanteToken}` : null;
  const quando = formatarQuando(ev);
  const pagou = cobranca?.valor_pago_centavos > 0;
  const isento = inscricao?.bolsa_tipo === 'integral' || inscricao?.valor_cobrado_centavos === 0;

  const corpo = {
    titulo: 'Inscrição confirmada',
    saudacao: `${primeiroNome(inscricao.nome_completo)}, sua inscrição está garantida.`,
    paragrafos: [
      isento && !pagou
        ? 'Sua inscrição foi liberada pela liderança — você não precisa pagar nada.'
        : 'Recebemos seu pagamento.',
      'Guarde o código abaixo: é ele que identifica sua inscrição se você precisar falar com a equipe.',
    ].filter(Boolean),
    linhas: [
      { rotulo: 'Código', valor: inscricao.codigo },
      { rotulo: 'Evento', valor: ev?.nome },
      { rotulo: 'Quando', valor: quando },
      { rotulo: 'Local', valor: ev?.local },
      { rotulo: 'Valor', valor: pagou ? reais(cobranca.valor_pago_centavos) : (isento ? 'Isenta' : null) },
      { rotulo: 'Forma', valor: pagou ? (ROTULO_METODO[cobranca?.metodo] || cobranca?.metodo) : null },
    ],
    acao: link ? { rotulo: 'Ver meu comprovante', url: link } : null,
    rodape: comprovanteToken
      ? 'Apresente o comprovante na entrada do evento. Comunidade Batista do Rio de Janeiro'
      : undefined,

    politica: pagou ? politicaHtml() : '',
  };

  return despacharTipo({
    tipo: 'confirmada',
    eventoId: evento?.id,
    to: g.email,
    vars: {
      ...varsBase({ inscricao, evento: ev, link }),
      valor: pagou ? reais(cobranca.valor_pago_centavos) : (isento ? 'Isenta' : ''),
      forma: pagou ? (ROTULO_METODO[cobranca?.metodo] || cobranca?.metodo || '') : '',
    },
    assuntoPadrao: `Inscrição confirmada · ${ev?.nome || 'evento'} (${inscricao.codigo})`,
    corpo,


    attachments: arq.anexos,
    extraHtml: arquivosHtml(arq.links),
  });
}


async function enviarEmailInscricaoPendente({ inscricao, evento, cobranca }) {
  const g = preparar(inscricao);
  if (g.pular) return { sent: false, reason: g.pular };
  if (!cobranca?.public_token) return { sent: false, reason: 'sem_public_token' };



  const extras = await extrasDoEvento(evento?.id);
  const ev = extras?.data_fim ? { ...evento, data_fim: extras.data_fim } : evento;

  const base = baseUrl();
  const link = base ? `${base}/pagamento/${cobranca.public_token}` : null;
  const expira = cobranca.expira_em
    ? new Date(cobranca.expira_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    : null;

  const corpo = {
    titulo: 'Falta pagar para garantir sua vaga',
    saudacao: `${primeiroNome(inscricao.nome_completo)}, recebemos sua inscrição.`,
    paragrafos: [
      'Sua vaga está reservada, mas só fica garantida depois do pagamento.',
      expira
        ? `Se o pagamento não for feito até ${expira}, a vaga volta para a fila.`
        : 'Conclua o pagamento para confirmar.',
    ],
    linhas: [
      { rotulo: 'Código', valor: inscricao.codigo },
      { rotulo: 'Evento', valor: evento?.nome },
      { rotulo: 'Quando', valor: formatarQuando(ev) },
      { rotulo: 'Valor', valor: reais(cobranca.valor_centavos) },
    ],
    acao: link ? { rotulo: 'Pagar minha inscrição', url: link } : null,
    rodape: 'Se você já pagou, ignore este e-mail. Comunidade Batista do Rio de Janeiro',
    politica: politicaHtml(),
  };

  return despacharTipo({
    tipo: 'pendente',
    eventoId: evento?.id,
    to: g.email,
    vars: {
      ...varsBase({ inscricao, evento: ev, link }),
      valor: reais(cobranca.valor_centavos) || '',
      expira_em: expira || '',
    },
    assuntoPadrao: `Pagamento pendente · ${evento?.nome || 'evento'} (${inscricao.codigo})`,
    corpo,
  });
}


async function enviarEmailInscricaoExpirada({ inscricao, evento }) {
  const g = preparar(inscricao);
  if (g.pular) return { sent: false, reason: g.pular };

  const base = baseUrl();
  const link = (base && evento?.slug) ? `${base}/evento/${evento.slug}` : null;
  const corpo = {
    titulo: 'Sua reserva expirou',
    saudacao: `${primeiroNome(inscricao.nome_completo)}, o prazo de pagamento da sua inscrição venceu.`,
    paragrafos: [
      'A vaga voltou para a fila, então sua inscrição não está mais valendo.',
      'Se ainda quiser participar, é possível se inscrever de novo enquanto houver vaga.',
    ],
    linhas: [
      { rotulo: 'Código', valor: inscricao.codigo },
      { rotulo: 'Evento', valor: evento?.nome },
    ],
    acao: link ? { rotulo: 'Inscrever-se de novo', url: link } : null,
    rodape: 'Se você pagou e recebeu este aviso, fale com a equipe citando seu código. Comunidade Batista do Rio de Janeiro',
  };

  return despacharTipo({
    tipo: 'expirada',
    eventoId: evento?.id,
    to: g.email,
    vars: varsBase({ inscricao, evento, link }),
    assuntoPadrao: `Reserva expirada · ${evento?.nome || 'evento'} (${inscricao.codigo})`,
    corpo,
  });
}






function previewTemplate({ tipo, assunto, corpo_html, assinaturaHtml, incluirAssinatura = true }) {
  const exemplo = {
    nome: 'Maria Aparecida de Souza',
    primeiro_nome: 'Maria',
    codigo: 'CBR-2026-000123',
    evento: 'Retiro AMI 2027',
    data: '16/02/2027 às 20:00',
    hora: '20:00',
    local: 'Sede — Rio de Janeiro',
    link: 'https://cbrio.org/i/c/exemplo',
    valor: 'R$ 900,00',
    forma: 'Pix',
    expira_em: '02/08/2026, 10:15:08',
  };


  const assinatura = (incluirAssinatura && assinaturaHtml && tipo !== 'assinatura')
    ? `<div style="margin-top:26px;padding-top:14px;border-top:1px solid #e5e7eb;font-size:13px;color:#374151">${sanitizarHtml(renderizar(assinaturaHtml, exemplo))}</div>`
    : '';

  return {
    tipo,
    assunto: renderizar(assunto, exemplo),
    html: sanitizarHtml(renderizar(corpo_html, exemplo)) + assinatura,
    variaveis_usadas: [...String(corpo_html || '').matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gi)]
      .map((m) => m[1].toLowerCase())
      .filter((v, i, a) => a.indexOf(v) === i),
  };
}

module.exports = {
  enviarEmailInscricaoConfirmada,
  enviarEmailInscricaoPendente,
  enviarEmailInscricaoExpirada,
  previewTemplate,
  carregarTemplate,
  carregarAssinatura,
  esqueletoPadrao,
  sanitizarHtml,
  renderizar,
  TIPOS,
  VARIAVEIS,

  baseUrl,
  formatarQuando,
  reais,
};
