


















const { supabase } = require('../utils/supabase');

const API = process.env.PLAUD_API_BASE || 'https://platform.plaud.ai/developer/api';
const URL_REFRESH = `${API}/oauth/third-party/access-token/refresh`;



const MARGEM_MS = 5 * 60 * 1000;

async function lerCredencial() {
  const { data, error } = await supabase
    .from('plaud_credencial')
    .select('refresh_token, access_token, expira_em')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw new Error(`plaud: falha lendo credencial — ${error.message}`);
  if (!data?.refresh_token) {
    throw new Error('plaud: sem refresh_token em plaud_credencial. Refaça o login OAuth e semeie a linha id=1.');
  }
  return data;
}

async function renovar(refreshToken) {
  const corpo = new URLSearchParams({ refresh_token: refreshToken });
  const res = await fetch(URL_REFRESH, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: corpo.toString(),
  });
  const txt = await res.text();
  if (!res.ok) {


    throw new Error(`plaud: refresh falhou (${res.status}). Se persistir, refaça o login OAuth do Plaud. Resposta: ${txt.slice(0, 200)}`);
  }
  const d = JSON.parse(txt);
  const expiraEm = new Date(Date.now() + (Number(d.expires_in || 3600) * 1000));



  const { error } = await supabase
    .from('plaud_credencial')
    .update({
      refresh_token: d.refresh_token || refreshToken,
      access_token: d.access_token,
      expira_em: expiraEm.toISOString(),
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', 1);
  if (error) throw new Error(`plaud: token renovado mas não gravado — ${error.message}`);

  return d.access_token;
}

async function accessToken() {
  const cred = await lerCredencial();
  const aindaVale = cred.access_token
    && cred.expira_em
    && (new Date(cred.expira_em).getTime() - Date.now()) > MARGEM_MS;
  if (aindaVale) return cred.access_token;
  return renovar(cred.refresh_token);
}

async function chamar(caminho) {
  const token = await accessToken();
  const res = await fetch(`${API}${caminho}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`plaud: GET ${caminho} devolveu ${res.status} — ${(await res.text()).slice(0, 200)}`);
  }
  return res.json();
}





async function listarGravacoes({ pagina = 1, tamanho = 50 } = {}) {
  const d = await chamar(`/open/third-party/files/?page=${pagina}&page_size=${Math.max(10, tamanho)}`);
  return d?.data || [];
}















async function detalheGravacao(fileId) {
  const d = await chamar(`/open/third-party/files/${fileId}`);
  const porTipo = Object.fromEntries((d.source_list || []).map((s) => [s.data_type, s]));

  const parse = (bruto) => {
    if (!bruto) return [];
    try { return JSON.parse(bruto); } catch { return []; }
  };

  return {
    id: d.id,
    nome: d.name,



    inicioUtc: d.start_at,
    duracaoMs: d.duration,
    serial: d.serial_number,
    transcricao: parse(porTipo.transaction?.data_content),
    roteiro: parse(porTipo.outline?.data_content),
    resumoFalhou: (d.note_list || []).some((n) => n.data_error_code),
  };
}

module.exports = { listarGravacoes, detalheGravacao, accessToken };
