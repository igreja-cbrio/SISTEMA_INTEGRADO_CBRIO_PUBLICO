









export function hojeBRT(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}


export function diaDaSemanaBRT(agora: Date = new Date()): number {

  return new Date(`${hojeBRT(agora)}T12:00:00`).getDay();
}

export function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export type BlocoDaRotina = "abastecer" | "decidir" | "fechar" | "fora";





export function blocoDoDia(dow: number): BlocoDaRotina {
  if (dow === 5) return "abastecer";
  if (dow === 1) return "decidir";
  if (dow === 3) return "fechar";
  return "fora";
}

export function tituloDoBloco(bloco: BlocoDaRotina): string {
  switch (bloco) {
    case "abastecer":
      return "SEXTA · Abastecer (tudo que depende de outra pessoa sai hoje)";
    case "decidir":
      return "SEGUNDA · Decidir e comunicar (2 pautas de manhã + o documento das 17:00)";
    case "fechar":
      return "QUARTA · Fechar (last call + qualidade + subir + reunião + ata em 24h)";
    default:
      return "Hoje não é dia de rotina";
  }
}



export function proximaQuarta(dia: string): string {
  const dow = new Date(`${dia}T12:00:00`).getDay();
  return somarDias(dia, (3 - dow + 7) % 7);
}



export function ehUltimaSextaDoMes(dia: string): boolean {
  const d = new Date(`${dia}T12:00:00`);
  if (d.getDay() !== 5) return false;
  const maisSete = new Date(d);
  maisSete.setDate(maisSete.getDate() + 7);
  return maisSete.getMonth() !== d.getMonth();
}

export const NOME_DO_DIA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
