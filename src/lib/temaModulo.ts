import { useLayoutEffect } from 'react';























export const TEMA_LAB22 = 'lab22';
export const ATRIBUTO_TEMA_MODULO = 'data-tema-modulo';
export const ID_FONTES_LAB22 = 'fontes-tema-lab22';
export const URL_FONTES_LAB22 =
  'https://fonts.googleapis.com/css2?family=Stack+Sans+Headline:wght@400;500;600;700'
  + '&family=Stack+Sans+Text:wght@400;500;600;700&display=swap';



export function temaDoModulo(pathname?: string | null): string | null {
  if (!pathname || typeof pathname !== 'string') return null;
  if (pathname === '/marketing' || pathname.startsWith('/marketing/')) return TEMA_LAB22;
  return null;
}



function garantirFontesLab22(doc: Document) {
  if (doc.getElementById(ID_FONTES_LAB22)) return;
  const link = doc.createElement('link');
  link.id = ID_FONTES_LAB22;
  link.rel = 'stylesheet';
  link.href = URL_FONTES_LAB22;
  doc.head.appendChild(link);
}

export function aplicarTemaModulo(doc: Document, tema: string | null) {
  const html = doc.documentElement;
  if (tema) {
    html.setAttribute(ATRIBUTO_TEMA_MODULO, tema);
    if (tema === TEMA_LAB22) garantirFontesLab22(doc);
  } else {
    html.removeAttribute(ATRIBUTO_TEMA_MODULO);
  }
}




export function useTemaModulo(pathname: string) {
  const tema = temaDoModulo(pathname);
  useLayoutEffect(() => {
    aplicarTemaModulo(document, tema);
    return () => aplicarTemaModulo(document, null);
  }, [tema]);
  return tema;
}
