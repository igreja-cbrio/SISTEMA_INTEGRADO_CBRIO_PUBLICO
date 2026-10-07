






































import { useEffect, useRef, useCallback } from 'react';

export const GTM_INSCRICOES = 'GTM-PQHGF574';



export type PortaGtm =
  | 'eventos' | 'grupos' | 'grupos_lider' | 'next'
  | 'batismo' | 'apresentacao' | 'voluntariado';





const CAMPOS_PERMITIDOS = new Set([
  'grupo_id',
  'categoria',
  'origem',
  'totem',

  'resultado',
  'pessoas',
]);

type Extras = Record<string, unknown>;

function limpar(extras?: Extras): Extras {
  const saida: Extras = {};
  for (const [k, v] of Object.entries(extras || {})) {
    if (!CAMPOS_PERMITIDOS.has(k)) {
      if (import.meta.env?.DEV) console.warn(`[gtm] campo "${k}" fora da lista permitida — descartado (LGPD)`);
      continue;
    }
    if (v !== undefined && v !== null) saida[k] = v;
  }
  return saida;
}

const containersCarregados = new Set<string>();





export function carregarGtm(containerId: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (!containerId || containersCarregados.has(containerId)) return;
  containersCarregados.add(containerId);

  const w = window as unknown as { dataLayer?: unknown[] };
  w.dataLayer = w.dataLayer || [];
  w.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });

  const tag = document.createElement('script');
  tag.async = true;
  tag.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(containerId)}`;


  const primeiro = document.getElementsByTagName('script')[0];
  if (primeiro && primeiro.parentNode) primeiro.parentNode.insertBefore(tag, primeiro);
  else document.head.appendChild(tag);
}

function empurrar(event: string, porta: PortaGtm, extras?: Extras): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { dataLayer?: unknown[] };
  w.dataLayer = w.dataLayer || [];
  w.dataLayer.push({ event, porta, ...limpar(extras) });
}
















export function desfechoInscricaoGrupos(
  r: { pedido_id?: unknown; renovado?: unknown; conjuge?: { pedido_id?: unknown } | null } | null | undefined,
): { resultado: 'criado' | 'renovado'; pessoas: number } | null {
  const criouTitular = !!(r && r.pedido_id);
  const criouConjuge = !!(r && r.conjuge && r.conjuge.pedido_id);
  if (criouTitular || criouConjuge) {
    return { resultado: 'criado', pessoas: (criouTitular ? 1 : 0) + (criouConjuge ? 1 : 0) };
  }


  if (r && r.renovado === true) return { resultado: 'renovado', pessoas: 0 };
  return null;
}


export function medirInscricaoConcluida(porta: PortaGtm, extras?: Extras): void {
  empurrar('inscricao_concluida', porta, extras);
}












export function useFunilInscricao(porta: PortaGtm, extras?: Extras) {
  const vistos = useRef(new Set<string>());

  useEffect(() => {
    carregarGtm(GTM_INSCRICOES);
    empurrar('inscricao_pagina', porta, extras);



    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [porta]);

  const medirFormulario = useCallback((chave: string, dados?: Extras) => {
    if (!chave || vistos.current.has(chave)) return;
    vistos.current.add(chave);
    empurrar('inscricao_formulario', porta, dados);
  }, [porta]);

  const esquecerEtapas = useCallback(() => { vistos.current.clear(); }, []);

  return { medirFormulario, esquecerEtapas };
}
