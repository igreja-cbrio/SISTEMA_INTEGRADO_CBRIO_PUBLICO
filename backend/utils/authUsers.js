















const { supabase } = require('./supabase');

const PER_PAGE = 200;


const MAX_PAGINAS = 50;




async function acharAuthUserPorEmail(email) {
  const alvo = String(email || '').trim().toLowerCase();
  if (!alvo) return null;

  for (let page = 1; page <= MAX_PAGINAS; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) throw error;
    const users = data?.users || [];
    const achado = users.find((u) => (u.email || '').toLowerCase() === alvo);
    if (achado) return achado;

    if (users.length < PER_PAGE) return null;
  }
  return null;
}

module.exports = { acharAuthUserPorEmail };
