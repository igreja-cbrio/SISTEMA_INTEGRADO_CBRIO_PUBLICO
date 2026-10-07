
























const { supabase } = require('../utils/supabase');
const fila = require('./whatsappFila');
const { enviarEmail, isConfigured: emailConfigurado } = require('./email');



const {
  TETO_RODADA_WHATSAPP,
  TETO_RODADA_EMAIL,
  semCpf,
  primeiroNome,
  emailUtilizavel,
  canaisDaPessoa,
  limitarPorTeto,
  montarLinkCenso,
  whatsappPronto,
  jaConvidadoEmQualquerCanal,
} = require('../utils/censoConvite');
const { gerarTokenCenso } = require('../utils/censoToken');
const { tetoEfetivo } = require('../utils/cotaMeta');







const ORCAMENTO_EMAIL_MS = 200000;










async function unicosUltimas24h() {
  const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const vistos = new Set();
  for (let pag = 0; pag < 20; pag += 1) {
    const { data, error } = await supabase.from('whatsapp_envios')
      .select('telefone').gte('criado_em', desde).not('telefone', 'is', null)
      .range(pag * 1000, pag * 1000 + 999);
    if (error) { console.warn('[censoDisparo] cota 24h:', error.message); return null; }
    for (const l of data || []) {
      const d = String(l.telefone || '').replace(/\D+/g, '');
      if (d.length >= 8) vistos.add(d.slice(-8));
    }
    if (!data || data.length < 1000) break;
  }
  return vistos.size;
}

const TEMPLATE_PADRAO = 'atualizacao_cadastro';
const CONTEXTO = 'membresia.censo_atualizacao';



const PLACEHOLDER = 'contribuinte%';

function nomeTemplate() {
  return process.env.WHATSAPP_TEMPLATE_CENSO_ATUALIZACAO || TEMPLATE_PADRAO;
}



function schemaAusente(error) {
  if (!error) return false;
  return error.code === '42P01' || error.code === '42703'
    || /relation .* does not exist/i.test(error.message || '')
    || /column .* does not exist/i.test(error.message || '');
}






async function lerPublicoSemCpf({ status = ['membro_ativo'] } = {}) {
  const PAGE = 1000;
  const pessoas = [];
  let offset = 0;
  for (;;) {
    let q = supabase
      .from('mem_membros')
      .select('id, nome, telefone, email, cpf, status, whatsapp_optin, censo_respondido_em')
      .eq('active', true)
      .is('deleted_at', null)
      .not('nome', 'ilike', PLACEHOLDER)
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (Array.isArray(status) && status.length) q = q.in('status', status);

    const { data, error } = await q;
    if (error) {


      if (schemaAusente(error)) return { pessoas: [], aviso: avisoSchemaCenso() };
      throw error;
    }
    if (!data || !data.length) break;
    pessoas.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  return {


    pessoas: pessoas.filter(p => semCpf(p.cpf) && !p.censo_respondido_em),
    aviso: null,
  };
}

function avisoSchemaCenso() {
  return 'As colunas do censo em mem_membros (migration 20260803160100) ainda não foram aplicadas — o disparo fica indisponível até lá.';
}







async function lerConvitesEnviados() {
  const PAGE = 1000;
  const jaConvidado = new Set();
  const jaConvidadoQualquer = new Set();
  const porRodada = new Map();
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('mem_censo_convites')
      .select('membro_id, canal, rodada, ok')
      .order('enviado_em', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) {
      if (schemaAusente(error)) return { indisponivel: true, jaConvidado, jaConvidadoQualquer, porRodada };
      throw error;
    }
    if (!data || !data.length) break;
    for (const c of data) {
      if (c.ok && c.membro_id) {
        jaConvidado.add(`${c.membro_id}:${c.canal}`);
        jaConvidadoQualquer.add(c.membro_id);
      }
      porRodada.set(c.rodada, (porRodada.get(c.rodada) || 0) + 1);
    }
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return { indisponivel: false, jaConvidado, jaConvidadoQualquer, porRodada };
}



async function previewCenso({ status, canais = ['whatsapp', 'email'], reenviar = false, permitirCanalCruzado = false } = {}) {
  const optinObrigatorio = process.env.WHATSAPP_OPTIN_OBRIGATORIO === '1';
  const { pessoas, aviso } = await lerPublicoSemCpf({ status });
  if (aviso) return { disponivel: false, aviso };

  const convites = await lerConvitesEnviados();
  if (convites.indisponivel) {
    return {
      disponivel: false,
      aviso: 'A migration 20260804120000 (mem_censo_convites) ainda não foi aplicada — sem ela não há como saber quem já foi convidado, e o reenvio mandaria de novo para todo mundo.',
    };
  }

  const alvoWhats = [];
  const alvoEmail = [];
  const motivos = {};
  let jaConvidadas = 0;
  let jaConvidadasOutroCanal = 0;

  for (const p of pessoas) {
    const c = canaisDaPessoa(p, { canais, optinObrigatorio });
    for (const m of c.motivos) motivos[m] = (motivos[m] || 0) + 1;







    const cruzado = !permitirCanalCruzado
      && jaConvidadoEmQualquerCanal(p.id, convites.jaConvidadoQualquer);

    const novoWhats = reenviar || (!convites.jaConvidado.has(`${p.id}:whatsapp`) && !cruzado);
    const novoEmail = reenviar || (!convites.jaConvidado.has(`${p.id}:email`) && !cruzado);
    if (c.whatsapp && novoWhats) alvoWhats.push(p);
    if (c.email && novoEmail) alvoEmail.push(p);










    const jaNesteCanal = canais.some(k => convites.jaConvidado.has(`${p.id}:${k}`));
    const alcancavel = c.whatsapp || c.email || jaNesteCanal || cruzado;
    if (alcancavel && jaNesteCanal) jaConvidadas += 1;
    else if (alcancavel && cruzado) jaConvidadasOutroCanal += 1;
  }





  const usados24h = await unicosUltimas24h();
  const cota = tetoEfetivo({ tetoCanal: TETO_RODADA_WHATSAPP, unicos24h: usados24h });
  const whats = limitarPorTeto(alvoWhats, cota.teto);
  const mail = limitarPorTeto(alvoEmail, TETO_RODADA_EMAIL);
  const proxRodada = Math.max(0, ...convites.porRodada.keys()) + 1;

  return {
    disponivel: true,
    rodada: proxRodada,
    publico_sem_cpf: pessoas.length,
    whatsapp: {
      elegiveis: alvoWhats.length,
      enviar_agora: whats.envia.length,
      adiados: whats.adiados,
      teto: cota.teto,



      teto_canal: TETO_RODADA_WHATSAPP,
      cota_motivo: cota.motivo,
      cota_disponivel: cota.cota_disponivel,
      contatados_24h: cota.unicos_24h,
      template: nomeTemplate(),
      configurado: whatsappPronto(),
    },
    email: {
      elegiveis: alvoEmail.length,
      enviar_agora: mail.envia.length,
      adiados: mail.adiados,
      teto: TETO_RODADA_EMAIL,
      configurado: emailConfigurado(),
    },
    ja_convidadas: jaConvidadas,
    ja_convidadas_outro_canal: jaConvidadasOutroCanal,
    nao_recebem: motivos,
    exemplo: alvoWhats[0] || alvoEmail[0]
      ? { nome: primeiroNome((alvoWhats[0] || alvoEmail[0]).nome) }
      : null,
    link: montarLinkCenso(process.env.FRONTEND_URL),




    link_pessoal: !!gerarTokenCenso('00000000-0000-0000-0000-000000000000'),
  };
}



function corpoEmail({ nome, link, destinatario = null }) {
  const primeiro = primeiroNome(nome);
  const texto = [
    `Olá ${primeiro}!`,
    '',
    'Estamos atualizando o cadastro da nossa igreja e o seu está incompleto.',
    'Leva 2 minutos para preencher — é só abrir o link abaixo:',
    '',
    link,
    '',
    'O link é pessoal e já abre com os seus dados.',
    '',
    'Obrigado por ajudar a manter nossos dados em ordem.',
    'Comunidade Batista do Rio',
  ].join('\n');







  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111827;max-width:560px">
  <p style="margin:0 0 16px">Olá ${escapeHtml(primeiro)}!</p>
  <p style="margin:0 0 16px">Estamos atualizando o cadastro da nossa igreja e o seu está incompleto.<br>
     Leva 2 minutos para preencher.</p>
  <p style="margin:0 0 24px">
    <a href="${escapeHtml(link)}" style="background:#00B39D;color:#ffffff;text-decoration:none;padding:13px 24px;border-radius:8px;display:inline-block;font-weight:700;font-size:15px">Atualizar meu cadastro</a>
  </p>
  <p style="margin:0 0 16px;font-size:13px;color:#6b7280">Se o botão não abrir, use este endereço:<br>
     <a href="${escapeHtml(link)}" style="color:#00B39D;word-break:break-all">${escapeHtml(link)}</a></p>
  <p style="margin:0 0 24px;font-size:13px;color:#6b7280">
     Este link é <strong>pessoal</strong> e já abre com os seus dados — não encaminhe para outra pessoa.</p>

  <div style="border-top:1px solid #e5e7eb;padding-top:18px;margin-top:8px">
    <img src="https://cbrio.org/logo-cbrio-text.png" alt="CBRio · Comunidade Batista do Rio" width="132" style="display:block;width:132px;max-width:132px;height:auto;border:0;margin-bottom:10px">
    <p style="margin:0;font-size:13px;color:#374151"><strong>Comunidade Batista do Rio</strong></p>
    <p style="margin:2px 0 0;font-size:12px;color:#9ca3af">
      Você recebeu este e-mail porque tem cadastro na CBRio.${destinatario ? `<br>Enviado para ${escapeHtml(destinatario)}.` : ''}
    </p>
  </div>
</div>`;

  return { subject: 'Atualize seu cadastro na CBRio', text: texto, html };
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

async function registrarConvites(linhas) {
  if (!linhas.length) return { gravados: 0 };


  const { data, error } = await supabase
    .from('mem_censo_convites')
    .upsert(linhas, { onConflict: 'membro_id,canal,rodada', ignoreDuplicates: true })
    .select('id');
  if (error) {
    console.error('[censoDisparo] falha ao registrar convites:', error.message);
    return { gravados: 0, erro: error.message };
  }
  return { gravados: (data || []).length };
}










async function dispararCenso({ status, canais = ['whatsapp', 'email'], reenviar = false, por = null, permitirCanalCruzado = false } = {}) {
  const prev = await previewCenso({ status, canais, reenviar, permitirCanalCruzado });
  if (!prev.disponivel) return { ok: false, aviso: prev.aviso };





  const base = process.env.FRONTEND_URL;
  const linkDe = (membroId) => montarLinkCenso(base, membroId);
  const optinObrigatorio = process.env.WHATSAPP_OPTIN_OBRIGATORIO === '1';
  const { pessoas } = await lerPublicoSemCpf({ status });
  const convites = await lerConvitesEnviados();
  const rodada = prev.rodada;

  const alvoWhats = [];
  const alvoEmail = [];
  for (const p of pessoas) {
    const c = canaisDaPessoa(p, { canais, optinObrigatorio });


    const cruzado = !permitirCanalCruzado
      && jaConvidadoEmQualquerCanal(p.id, convites.jaConvidadoQualquer);
    if (c.whatsapp && (reenviar || (!convites.jaConvidado.has(`${p.id}:whatsapp`) && !cruzado))) alvoWhats.push(p);
    if (c.email && (reenviar || (!convites.jaConvidado.has(`${p.id}:email`) && !cruzado))) alvoEmail.push(p);
  }





  const tetoWhats = Number.isFinite(prev?.whatsapp?.teto) ? prev.whatsapp.teto : 0;
  const whats = limitarPorTeto(alvoWhats, tetoWhats);
  const mail = limitarPorTeto(alvoEmail, TETO_RODADA_EMAIL);

  let gravados = 0;
  let erroRegistro = null;
  const resultado = {
    ok: true,
    rodada,
    whatsapp: { enfileirados: 0, adiados: whats.adiados, motivo: null },
    email: { enviados: 0, falhas: 0, adiados: mail.adiados, motivo: null },
  };





  if (whats.envia.length && !whatsappPronto()) {
    resultado.whatsapp.motivo = 'template_nao_configurado';
    resultado.whatsapp.adiados = alvoWhats.length;
  } else if (whats.envia.length) {
    const montar = p => ({
      telefone: p.telefone,
      template: nomeTemplate(),
      params: [primeiroNome(p.nome), linkDe(p.id)],
      contexto: CONTEXTO,
      refId: p.id,
    });













    const [primeira, ...resto] = whats.envia;
    const r0 = await fila.enfileirar(montar(primeira));

    if (r0?.permanente === true) {


      resultado.whatsapp.motivo = 'template_recusado';
      resultado.whatsapp.detalhe = r0.reason || null;
      resultado.whatsapp.adiados = alvoWhats.length;
    } else {


      const regPrimeira = await registrarConvites([
        { membro_id: primeira.id, canal: 'whatsapp', rodada, enviado_por: por, ok: true },
      ]);
      gravados += regPrimeira.gravados;
      if (regPrimeira.erro) erroRegistro = regPrimeira.erro;
      resultado.whatsapp.enfileirados = 1;

      if (resto.length) {
        const r = await fila.enfileirarLote(resto.map(montar));
        resultado.whatsapp.enfileirados += r.queued || 0;
        resultado.whatsapp.motivo = r.motivo || null;
        if (r.queued) {


          const regWhats = await registrarConvites(resto.map(p => ({
            membro_id: p.id, canal: 'whatsapp', rodada, enviado_por: por, ok: true,
          })));
          gravados += regWhats.gravados;
          if (regWhats.erro) erroRegistro = regWhats.erro;
        }
      }
    }
  }


  if (mail.envia.length) {
    if (!emailConfigurado()) {
      resultado.email.motivo = 'canal_nao_configurado';
    } else {







      const BLOCO_REGISTRO = 20;
      let pendentes = [];
      const flush = async () => {
        if (!pendentes.length) return;
        const r = await registrarConvites(pendentes);
        gravados += r.gravados;
        if (r.erro) erroRegistro = r.erro;
        pendentes = [];
      };

      const comecou = Date.now();
      for (let i = 0; i < mail.envia.length; i += 1) {
        if (Date.now() - comecou > ORCAMENTO_EMAIL_MS) {
          resultado.email.adiados += mail.envia.length - i;
          resultado.email.motivo = 'orcamento_de_tempo';
          break;
        }
        const p = mail.envia[i];
        const { subject, text, html } = corpoEmail({
          nome: p.nome, link: linkDe(p.id), destinatario: String(p.email).trim(),
        });
        let ok = false;
        let erro = null;
        try {
          const r = await enviarEmail({
            to: String(p.email).trim(), subject, text, html, fromName: 'CBRio',
          });
          ok = !!(r && r.ok !== false);
          if (!ok) erro = (r && (r.error || r.motivo)) || 'falha no envio';
        } catch (e) {
          erro = e?.message || String(e);
        }
        if (ok) resultado.email.enviados += 1;
        else resultado.email.falhas += 1;
        pendentes.push({
          membro_id: p.id, canal: 'email', rodada, enviado_por: por,
          ok, erro: erro ? String(erro).slice(0, 400) : null,
        });
        if (pendentes.length >= BLOCO_REGISTRO) await flush();
      }
      await flush();
    }
  }

  resultado.registrados = gravados;
  if (erroRegistro) {
    resultado.aviso_registro = `Os convites saíram, mas o registro de quem foi convidado falhou (${erroRegistro}) — NÃO dispare a próxima rodada antes de conferir, porque ela repetiria a mensagem para as mesmas pessoas.`;
  }
  return resultado;
}





















async function rodadaCorrente() {
  const { data, error } = await supabase
    .from('mem_censo_convites')
    .select('rodada').order('rodada', { ascending: false }).limit(1);
  if (error) throw error;
  return (data && data[0] && Number(data[0].rodada)) || 1;
}






async function convidarPessoa(membroId, { por = null, canais = ['whatsapp', 'email'] } = {}) {
  if (!membroId) return { ok: false, motivo: 'sem_pessoa' };

  const { data: p, error } = await supabase
    .from('mem_membros')
    .select('id, nome, telefone, email, whatsapp_optin')
    .eq('id', membroId).is('deleted_at', null).maybeSingle();
  if (error) throw error;
  if (!p) return { ok: false, motivo: 'pessoa_nao_encontrada' };

  const optinObrigatorio = process.env.WHATSAPP_OPTIN_OBRIGATORIO === '1';
  const c = canaisDaPessoa(p, { canais, optinObrigatorio });



  if (!c.whatsapp && !c.email) return { ok: false, motivo: 'sem_canal', detalhe: c.motivos.join(', ') };

  const rodada = await rodadaCorrente();





  const { data: jaConv } = await supabase
    .from('mem_censo_convites')
    .select('canal, created_at').eq('membro_id', p.id).eq('rodada', rodada).limit(5);
  if (jaConv && jaConv.length) {
    return {
      ok: false, motivo: 'ja_convidado', rodada,
      detalhe: `já convidada nesta rodada (${jaConv.map(x => x.canal).join(', ')})`,
    };
  }

  const link = montarLinkCenso(process.env.FRONTEND_URL, p.id);
  const enviados = [];
  let erro = null;

  if (c.whatsapp) {
    if (!whatsappPronto()) {
      erro = 'template_nao_configurado';
    } else {




      const r = await fila.enfileirar({
        telefone: p.telefone,
        template: nomeTemplate(),
        params: [primeiroNome(p.nome), link],
        contexto: CONTEXTO,
        refId: p.id,
      });
      if (r?.permanente === true) erro = r.reason || 'template_recusado';
      else {
        await registrarConvites([{ membro_id: p.id, canal: 'whatsapp', rodada, enviado_por: por, ok: true }]);
        enviados.push('whatsapp');
      }
    }
  }




  if (!enviados.length && c.email) {
    if (!emailConfigurado()) {
      erro = erro || 'canal_nao_configurado';
    } else {
      const { subject, text, html } = corpoEmail({ nome: p.nome, link, destinatario: String(p.email).trim() });
      let ok = false;
      let motivoErro = null;
      try {
        const r = await enviarEmail({ to: String(p.email).trim(), subject, text, html, fromName: 'CBRio' });
        ok = !!(r && r.ok !== false);
        if (!ok) motivoErro = (r && (r.error || r.motivo)) || 'falha no envio';
      } catch (e) {
        motivoErro = e?.message || String(e);
      }
      await registrarConvites([{
        membro_id: p.id, canal: 'email', rodada, enviado_por: por,
        ok, erro: motivoErro ? String(motivoErro).slice(0, 400) : null,
      }]);
      if (ok) enviados.push('email');
      else erro = erro || motivoErro || 'falha no envio';
    }
  }



  if (!enviados.length) return { ok: false, motivo: erro || 'nao_enviado', rodada };
  return { ok: true, canais: enviados, rodada };
}

module.exports = {
  previewCenso,
  dispararCenso,
  convidarPessoa,

  semCpf,
  primeiroNome,
  emailUtilizavel,
  canaisDaPessoa,
  limitarPorTeto,
  montarLinkCenso,
  corpoEmail,
  TETO_RODADA_WHATSAPP,
  TETO_RODADA_EMAIL,
  CONTEXTO,
};
