



























const express = require('express');
const router = express.Router();
const { supabase } = require('../utils/supabase');
const { esperarRegistro } = require('../utils/registroAcesso');



function aparelhoDe(ua) {
  const s = String(ua || '').toLowerCase();
  if (!s) return 'outro';
  if (/iphone|android|ipad|mobile/.test(s)) return 'celular';
  if (/windows|macintosh|linux|cros/.test(s)) return 'computador';
  return 'outro';
}



function origemDe(referer) {
  try { return new URL(String(referer)).hostname.slice(0, 120) || null; }
  catch { return null; }
}

function pagina(titulo, mensagem) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titulo}</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       background:#eef2f1;color:#1a1a1a;font-family:system-ui,-apple-system,sans-serif;padding:24px}
  .c{max-width:420px;text-align:center}
  h1{font-size:19px;margin:0 0 10px}
  p{font-size:15px;line-height:1.5;color:#555;margin:0}
  a{color:#0d9488;text-decoration:none;font-weight:500;display:inline-block;margin-top:18px}
</style></head><body><div class="c">
<h1>${titulo}</h1><p>${mensagem}</p>
<a href="https://www.cbrio.org">Ir para o site da CBRio</a>
</div></body></html>`;
}

router.get('/:slug', async (req, res) => {
  const slug = String(req.params.slug || '').toLowerCase().slice(0, 60);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    return res.status(404).type('html').send(pagina(
      'Link não encontrado',
      'Esse endereço não existe. Confira se o código foi digitado corretamente.',
    ));
  }

  try {
    const { data, error } = await supabase
      .from('link_curto').select('id, destino, ativo, titulo')
      .eq('slug', slug).is('deleted_at', null).maybeSingle();
    if (error) throw error;

    if (!data) {
      return res.status(404).type('html').send(pagina(
        'Link não encontrado',
        'Esse QR code não está mais ativo no nosso sistema. Se ele estava num cartaz ou impresso, avise a equipe da CBRio.',
      ));
    }
    if (!data.ativo) {


      return res.status(410).type('html').send(pagina(
        'Esse link foi desativado',
        `${data.titulo ? `"${data.titulo}" não` : 'Este link não'} está mais no ar. Se você chegou por um material impresso, ele provavelmente já passou.`,
      ));
    }






















    await esperarRegistro(
      supabase.from('link_curto_acesso').insert({
        link_id: data.id,
        aparelho: aparelhoDe(req.get('user-agent')),
        origem: origemDe(req.get('referer')),
      }),
    );

    res.set('Cache-Control', 'public, max-age=0, s-maxage=30');
    res.redirect(302, data.destino);
  } catch {

    res.status(503).type('html').send(pagina(
      'Não consegui abrir agora',
      'Tivemos um problema momentâneo. Tente escanear de novo em alguns segundos.',
    ));
  }
});

module.exports = router;
module.exports.aparelhoDe = aparelhoDe;
module.exports.origemDe = origemDe;
