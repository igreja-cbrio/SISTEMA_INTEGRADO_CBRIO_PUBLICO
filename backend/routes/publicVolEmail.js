






const express = require('express');
const router = express.Router();
const { supabase } = require('../utils/supabase');


const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

router.get('/px/:id.gif', (req, res) => {
  const id = req.params.id;

  res.set({
    'Content-Type': 'image/gif',
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Content-Length': PIXEL.length,
  });
  res.end(PIXEL);


  (async () => {
    try {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return;
      const { data: row } = await supabase
        .from('vol_email_disparo_destinatarios')
        .select('aberto_em, aberturas')
        .eq('id', id)
        .maybeSingle();
      if (!row) return;
      await supabase
        .from('vol_email_disparo_destinatarios')
        .update({
          aberto_em: row.aberto_em || new Date().toISOString(),
          aberturas: (row.aberturas || 0) + 1,
        })
        .eq('id', id);
    } catch (e) {
      console.error('[publicVolEmail/px]', e.message);
    }
  })();
});

module.exports = router;
