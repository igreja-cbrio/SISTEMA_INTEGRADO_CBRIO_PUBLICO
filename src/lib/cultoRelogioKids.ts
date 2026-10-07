



















export function horaMin(h: string): number {
  const [hh, mm] = String(h || '').split(':').map(Number);
  return (hh || 0) * 60 + (mm || 0);
}


export function periodoKey(hora?: string): 'manha' | 'tarde' | 'noite' {
  const h = Number(String(hora || '').slice(0, 2)) || 0;
  return h < 12 ? 'manha' : h < 18 ? 'tarde' : 'noite';
}


export function agoraMinBRT(): number {
  const s = new Date().toLocaleTimeString('en-GB', {
    timeZone: 'America/Sao_Paulo', hour12: false, hour: '2-digit', minute: '2-digit',
  });
  return horaMin(s);
}

export function escolherCultoPorRelogio(
  cultos: any[],
  agoraMin: number = agoraMinBRT(),
): { atual: any | null; visiveis: any[] } {
  const lista = (cultos || []).filter((c) => c.hora).sort((a, b) => horaMin(a.hora) - horaMin(b.hora));
  if (!lista.length) return { atual: null, visiveis: [] };
  const ultimoI = lista.length - 1;
  const comFim = lista.map((c, i) => {
    const ini = horaMin(c.hora), ult = i === ultimoI;
    return { ...c, _abre: ini - (ult ? 60 : 30), _fim: ini + (ult ? 180 : 60) };
  });

  for (let i = 0; i < ultimoI; i++) comFim[i]._fim = Math.min(comFim[i]._fim, comFim[i + 1]._abre);


  for (let i = 0; i < ultimoI; i++) {
    if (periodoKey(comFim[i].hora) === periodoKey(comFim[i + 1].hora)) {
      comFim[i + 1]._abre = Math.min(comFim[i + 1]._abre, comFim[i]._fim);
    }
  }
  const agora = agoraMin;
  const visiveis = comFim.filter((c) => agora < c._fim);
  let atual = visiveis.find((c) => agora >= c._abre && agora < c._fim) || null;
  if (!atual && comFim.length && agora < comFim[0]._abre) atual = comFim[0];
  return { atual, visiveis };
}
