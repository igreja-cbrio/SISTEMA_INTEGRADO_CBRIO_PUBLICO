
























export type NivelPorModulo = { integracao: number; next: number; batismo: number };

export type ModoIntegracao = {

  restrito: boolean;

  abaInicial: 'frequencia' | 'next' | 'batismos';
  soNext: boolean;
  soBatismo: boolean;
};

const nivel = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : 0);







export function modoIntegracao(niveis: Partial<NivelPorModulo> | null | undefined): ModoIntegracao {
  const integracao = nivel(niveis?.integracao);
  const next = nivel(niveis?.next);
  const batismo = nivel(niveis?.batismo);

  if (integracao >= 1) {
    return { restrito: false, abaInicial: 'frequencia', soNext: false, soBatismo: false };
  }
  const soNext = next >= 1;
  const soBatismo = !soNext && batismo >= 1;




  return {
    restrito: true,
    abaInicial: soBatismo ? 'batismos' : 'next',
    soNext: !soBatismo,
    soBatismo,
  };
}
