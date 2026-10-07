





const ENVIRONMENT_ID = 'env_01UMJ12N3YjCfoyLyEKL4xcu';

const AGENTS = {
  rh:              { id: 'agent_011CZtnVdHLgUvoBzJbKEQpr', label: '👥 Recursos Humanos',  icon: '👥' },
  financeiro:      { id: 'agent_011CZtnVf2WXH3NhrQ131Q8Y', label: '💰 Financeiro',        icon: '💰' },
  logistica:       { id: 'agent_011CZtnVgDw7HDeKz46v7zrt', label: '🚚 Logística',         icon: '🚚' },
  patrimonio:      { id: 'agent_011CZtnVhRsXSphFD561F3VX', label: '🏢 Patrimônio',        icon: '🏢' },
  solicitarCompra: { id: 'agent_011CZtnVioiAi2X6ow27fAYo', label: '🛒 Solicitar Compra',  icon: '🛒' },
  eventos:         { id: 'agent_011CZtnVkFXQKdGTpWZ7dMdJ', label: '📅 Eventos',           icon: '📅' },
  projetos:        { id: 'agent_011CZtnVmrXYh7CVtZRiADNh', label: '📊 Projetos',          icon: '📊' },
  expansao:        { id: 'agent_011CZtnVnuHFCpQcEGHB4Zu1', label: '🏗️ Expansão',          icon: '🏗️' },
  integracao:      { id: 'agent_011CZtnVpVmja172Tu75jNNB', label: '🔗 Integração',        icon: '🔗' },
  grupos:          { id: 'agent_011CZtnVqghrrVcLzkovohNQ', label: '👥 Grupos',             icon: '👥' },
  cuidados:        { id: 'agent_011CZtnVryLkALLSVTdnWgrz', label: '💜 Cuidados',          icon: '💜' },
  voluntariado:    { id: 'agent_011CZtnVsxtFRW9JsYUrTr74', label: '🤝 Voluntariado',      icon: '🤝' },
  membresia:       { id: 'agent_011CZtnVuDHVWYv1eneWEdy6', label: '⛪ Membresia',          icon: '⛪' },
  marketing:       { id: 'agent_011CZtnVvVBY7TQWBAoF4rJj', label: '📣 Marketing',         icon: '📣' },
  supervisor:      { id: 'agent_011CZtnVwVDPjxu4cJgm9ne2', label: '🧠 Supervisor',        icon: '🧠' },
};






const AGENT_ROUTE_KEY = {
  rh: 'rh',
  financeiro: 'financeiro',
  logistica: 'logistica',
  solicitarCompra: 'logistica',
  patrimonio: 'patrimonio',
  eventos: 'events',
  projetos: 'projects',
  expansao: 'expansion',
  integracao: 'membresia',
  grupos: 'membresia',
  cuidados: 'cuidados',
  voluntariado: 'voluntariado',
  membresia: 'membresia',
  marketing: null,
  supervisor: 'supervisor',
};

function getAgentId(module) {
  return (AGENTS[module]?.id) || AGENTS.supervisor.id;
}




function listModules() {
  return Object.entries(AGENTS).map(([key, val]) => ({
    value: key,
    label: val.label,
    icon: val.icon,
  }));
}








function canUseAgent(req, agentKey, getEffectiveLevel) {
  if (!req?.user) return false;
  if (['admin', 'diretor'].includes(req.user.role)) return true;

  const routeKey = AGENT_ROUTE_KEY[agentKey];
  if (routeKey === null || routeKey === undefined) return false;

  if (routeKey === 'supervisor') {

    return Object.entries(AGENT_ROUTE_KEY).some(([k, rk]) => {
      if (k === 'supervisor' || !rk) return false;
      return getEffectiveLevel(req, rk) >= 2;
    });
  }

  return getEffectiveLevel(req, routeKey) >= 2;
}




function listModulesForUser(req, getEffectiveLevel) {
  return listModules().filter((m) => canUseAgent(req, m.value, getEffectiveLevel));
}

module.exports = {
  ENVIRONMENT_ID,
  AGENTS,
  AGENT_ROUTE_KEY,
  getAgentId,
  listModules,
  listModulesForUser,
  canUseAgent,
};
