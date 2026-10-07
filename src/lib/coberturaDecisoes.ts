










































export type ContagemDecisoes = {

  declaradoPresencial: number | null | undefined;

  declaradoOnline: number | null | undefined;

  nomesPresencial: number;

  nomesOnline: number;
};

export type DivergenciaTipo = {
  tipo: 'presencial' | 'online';
  declarado: number;
  nomes: number;

  gap: number;
  faltamNomes: number;
  sobramNomes: number;
};

export type Cobertura = {
  presencial: DivergenciaTipo;
  online: DivergenciaTipo;

  divergentes: DivergenciaTipo[];

  nomesOnlineSemNumero: boolean;
};



function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? Math.trunc(x) : 0;
}

function divergencia(
  tipo: 'presencial' | 'online',
  declarado: number,
  nomes: number,
): DivergenciaTipo {
  const gap = declarado - nomes;
  return {
    tipo,
    declarado,
    nomes,
    gap,
    faltamNomes: Math.max(0, gap),
    sobramNomes: Math.max(0, -gap),
  };
}








export function conferirCobertura(c: ContagemDecisoes): Cobertura {
  const presencial = divergencia('presencial', n(c.declaradoPresencial), n(c.nomesPresencial));
  const online = divergencia('online', n(c.declaradoOnline), n(c.nomesOnline));
  return {
    presencial,
    online,
    divergentes: [presencial, online].filter((d) => d.gap !== 0),


    nomesOnlineSemNumero: online.sobramNomes > 0,
  };
}





export function textoDivergencia(cob: Cobertura): string | null {
  const partes: string[] = [];




  if (cob.online.sobramNomes > 0) {
    partes.push(
      `${cob.online.sobramNomes} ${cob.online.sobramNomes === 1 ? 'nome online cadastrado não está' : 'nomes online cadastrados não estão'} no número de decisões online`
      + ` (${cob.online.nomes} ${cob.online.nomes === 1 ? 'nome' : 'nomes'} × ${cob.online.declarado} no total).`
      + ' Lance em "Online · chat e outros" — cadastrar o nome não soma sozinho.',
    );
  } else if (cob.online.faltamNomes > 0) {
    partes.push(`faltam ${cob.online.faltamNomes} ${cob.online.faltamNomes === 1 ? 'nome' : 'nomes'} de decisão online.`);
  }

  if (cob.presencial.faltamNomes > 0) {
    partes.push(`faltam ${cob.presencial.faltamNomes} ${cob.presencial.faltamNomes === 1 ? 'nome' : 'nomes'} de decisão presencial.`);
  } else if (cob.presencial.sobramNomes > 0) {
    partes.push(
      `${cob.presencial.sobramNomes} ${cob.presencial.sobramNomes === 1 ? 'nome presencial cadastrado não está' : 'nomes presenciais cadastrados não estão'} no número de decisões presenciais.`,
    );
  }

  return partes.length ? partes.join(' E ') : null;
}
