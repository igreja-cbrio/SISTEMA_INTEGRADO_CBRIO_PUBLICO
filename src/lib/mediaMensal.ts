




































export type MesArrecadacao = {

  mes?: string;
  mes_label?: string;
  receita?: number;
};

export type MediaMensal = {

  media: number | null;

  mediana: number | null;

  base: number;

  meses: string[];

  emCurso: string | null;




  assimetria: number;

  maiorMes: string | null;
};

const VAZIO: MediaMensal = {
  media: null, mediana: null, base: 0, meses: [],
  emCurso: null, assimetria: 0, maiorMes: null,
};







export function mesCorrenteISO(hoje: Date = new Date()): string {
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
}

export function calcularMediaMensal(
  meses: MesArrecadacao[] | null | undefined,
  hoje: Date = new Date(),
): MediaMensal {
  if (!Array.isArray(meses) || meses.length === 0) return VAZIO;

  const corrente = mesCorrenteISO(hoje);
  let emCurso: string | null = null;
  const usados: { label: string; receita: number }[] = [];

  for (const m of meses) {
    const chave = typeof m?.mes === 'string' ? m.mes.slice(0, 7) : '';
    const receita = Number(m?.receita);
    const label = m?.mes_label || chave || '—';

    if (chave === corrente) {



      if (Number.isFinite(receita) && receita > 0) emCurso = label;
      continue;
    }
    if (!chave || chave > corrente) continue;
    if (!Number.isFinite(receita) || receita <= 0) continue;
    usados.push({ label, receita });
  }

  if (usados.length === 0) return { ...VAZIO, emCurso };

  const valores = usados.map((u) => u.receita);
  const soma = valores.reduce((a, b) => a + b, 0);
  const media = soma / valores.length;

  const ord = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ord.length / 2);
  const mediana = ord.length % 2 === 1 ? ord[meio] : (ord[meio - 1] + ord[meio]) / 2;

  const maior = usados.reduce((a, b) => (b.receita > a.receita ? b : a), usados[0]);

  return {
    media,
    mediana,
    base: usados.length,
    meses: usados.map((u) => u.label),
    emCurso,
    assimetria: mediana > 0 ? Math.abs(media - mediana) / mediana : 0,
    maiorMes: maior.label,
  };
}







export const LIMIAR_ASSIMETRIA = 0.1;

export function mediaPuxadaPorUmMes(r: MediaMensal): boolean {
  return r.base >= 3 && r.assimetria > LIMIAR_ASSIMETRIA;
}


export function textoBase(r: MediaMensal): string {
  if (r.base === 0) return 'sem mês fechado com dado';
  const plural = r.base === 1 ? 'mês fechado' : 'meses fechados';
  return r.emCurso
    ? `${r.base} ${plural} · ${r.emCurso} em curso está fora`
    : `${r.base} ${plural}`;
}
