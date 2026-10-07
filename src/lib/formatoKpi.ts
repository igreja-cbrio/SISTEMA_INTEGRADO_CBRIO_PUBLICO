




















export type UnidadeKpi = string | null | undefined;

const ehMoeda = (u: UnidadeKpi) => /^(r\$|brl|reais)$/i.test(String(u || '').trim());
const ehPercent = (u: UnidadeKpi) => String(u || '').trim() === '%';






const SEM_SUFIXO = new Set(['#', 'nota']);








export function formatarValorKpi(valor: unknown, unidade?: UnidadeKpi): string {
  if (valor == null || valor === '') return '—';
  const n = typeof valor === 'number' ? valor : Number(valor);
  if (!Number.isFinite(n)) return '—';

  if (ehMoeda(unidade)) {



    const temCentavos = Math.abs(n % 1) > 1e-9;
    return n.toLocaleString('pt-BR', {
      style: 'currency', currency: 'BRL',
      minimumFractionDigits: temCentavos ? 2 : 0,
      maximumFractionDigits: temCentavos ? 2 : 0,
    });
  }



  const casas = Math.abs(n % 1) > 1e-9 ? 1 : 0;
  const num = n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

  if (ehPercent(unidade)) return `${num}%`;

  const u = String(unidade || '').trim();
  if (!u || SEM_SUFIXO.has(u)) return num;
  return `${num} ${u}`;
}





export function formatarMetaKpi(meta: unknown, unidade?: UnidadeKpi): string | null {
  if (meta == null || meta === '') return null;
  const txt = formatarValorKpi(meta, unidade);
  return txt === '—' ? null : `meta ${txt}`;
}
