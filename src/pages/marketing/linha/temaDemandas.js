









export const CHAVE_TEMA_DEMANDAS = 'cbrio.marketing.demandas.tema';



export function normalizarTema(valor) {
  return valor === 'escuro' ? 'escuro' : 'claro';
}



export function lerTemaDemandas(storage) {
  try {
    return normalizarTema(storage ? storage.getItem(CHAVE_TEMA_DEMANDAS) : null);
  } catch {
    return 'claro';
  }
}

export function gravarTemaDemandas(storage, tema) {
  try {
    if (storage) storage.setItem(CHAVE_TEMA_DEMANDAS, normalizarTema(tema));
  } catch {

  }
}


export function capturarTemaSistema(html, body) {
  return {
    dataTheme: html.getAttribute('data-theme'),
    escuro: html.classList.contains('dark'),
    overflow: body ? body.style.overflow : '',
  };
}




export function aplicarTemaDemandas(html, tema) {
  const escuro = normalizarTema(tema) === 'escuro';
  html.setAttribute('data-theme', escuro ? 'dark' : 'light');
  html.classList.toggle('dark', escuro);
}

export function restaurarTemaSistema(html, body, salvo) {
  if (!salvo) return;
  if (salvo.dataTheme) html.setAttribute('data-theme', salvo.dataTheme);
  else html.removeAttribute('data-theme');
  html.classList.toggle('dark', !!salvo.escuro);
  if (body) body.style.overflow = salvo.overflow || '';
}
