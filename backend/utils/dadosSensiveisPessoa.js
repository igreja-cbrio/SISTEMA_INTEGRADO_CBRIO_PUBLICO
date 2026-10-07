









































const MODULOS_FINANCEIRO = ['membresia', 'financeiro'];
const NIVEL_FINANCEIRO = 2;


const MODULOS_PASTORAL = ['cuidados', 'membresia'];
const NIVEL_PASTORAL = { cuidados: 1, membresia: 2 };









function temNivelEm(user, modulos, nivel) {
  if (!user) return false;

  const bloqueados = user.granular?.modulosBloqueados || [];


  if (modulos.every((m) => bloqueados.includes(m))) return false;

  if (user.is_super_admin === true) return true;
  if (user.role === 'admin' || user.role === 'diretor') return true;

  const perms = user.granular?.modulePerms;
  if (!perms) return false;

  return modulos.some((m) => {
    if (bloqueados.includes(m)) return false;
    const minimo = typeof nivel === 'number' ? nivel : nivel[m];
    if (typeof minimo !== 'number') return false;
    const atual = perms[m]?.leitura;
    return typeof atual === 'number' && atual >= minimo;
  });
}


function podeVerFinanceiroDePessoa(user) {
  return temNivelEm(user, MODULOS_FINANCEIRO, NIVEL_FINANCEIRO);
}


function podeVerPastoralDePessoa(user) {
  return temNivelEm(user, MODULOS_PASTORAL, NIVEL_PASTORAL);
}









const EVENTO_SENSIVEL = {
  contribuicao: 'financeiro',
  aconselhamento: 'pastoral',
  jornada: 'pastoral',
  encaminhamento: 'pastoral',
};






function filtrarTimeline(eventos, { financeiro, pastoral }) {
  const pode = { financeiro: !!financeiro, pastoral: !!pastoral };
  const ocultos = { financeiro: 0, pastoral: 0 };
  const visiveis = [];
  for (const ev of eventos || []) {
    const exige = EVENTO_SENSIVEL[ev?.tipo];
    if (exige && !pode[exige]) { ocultos[exige] += 1; continue; }
    visiveis.push(ev);
  }
  return { eventos: visiveis, ocultos };
}

module.exports = {
  MODULOS_FINANCEIRO,
  NIVEL_FINANCEIRO,
  MODULOS_PASTORAL,
  NIVEL_PASTORAL,
  EVENTO_SENSIVEL,
  temNivelEm,
  podeVerFinanceiroDePessoa,
  podeVerPastoralDePessoa,
  filtrarTimeline,
};
