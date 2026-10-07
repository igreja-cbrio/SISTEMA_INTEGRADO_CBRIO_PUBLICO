











const { supabase } = require('../utils/supabase');
const { PAPEIS } = require('../utils/avaliacaoAnonimato');
























async function funcionarioDoLogin(req) {
  const email = String(req?.user?.email || '').trim().toLowerCase();
  if (!email) return { funcionario: null, erro: 'sem_email' };

  const { data, error } = await supabase
    .from('rh_funcionarios')
    .select('id, nome, email, area, cargo, gestor_id, status')
    .eq('status', 'ativo')
    .is('deleted_at', null)


    .ilike('email', email.replace(/[\\%_]/g, '\\$&').replace(/\*/g, '_'));



  if (error) return { funcionario: null, erro: 'consulta_falhou' };

  const candidatos = (data || []).filter((f) => String(f.email || '').trim().toLowerCase() === email);
  if (candidatos.length === 0) return { funcionario: null, erro: 'nao_e_funcionario' };
  if (candidatos.length > 1) return { funcionario: null, erro: 'email_ambiguo' };
  return { funcionario: candidatos[0], erro: null };
}

async function listarAtivos() {


  const todos = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from('rh_funcionarios')
      .select('id, nome, email, area, cargo, gestor_id')
      .eq('status', 'ativo')
      .is('deleted_at', null)
      .order('id')
      .range(offset, offset + 999);
    if (error) throw new Error(`falha ao ler funcionários: ${error.message}`);
    if (!data || data.length === 0) break;
    todos.push(...data);
    if (data.length < 1000) break;
  }
  return todos;
}

module.exports = {
  PAPEIS,
  funcionarioDoLogin,
  listarAtivos,
};
