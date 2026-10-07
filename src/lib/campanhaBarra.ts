










export type EstadoCampanha = 'arrecadando' | 'antes' | 'depois' | 'nao_ativa' | 'indefinido';

export type CampanhaBarra = {
  nome?: string | null;
  status?: string | null;
  no_ar?: boolean | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  data_lancamento?: string | null;
  publica?: boolean | null;
  total_centavos?: number | null;
  meta_centavos?: number | null;
};


function dia(iso?: string | null): string | null {
  if (typeof iso !== 'string') return null;
  const t = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}











export function hojeBrt(agora: Date = new Date()): string {

  return agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}





export function estadoDaCampanha(c: CampanhaBarra, hoje: string): EstadoCampanha {
  const h = dia(hoje);
  if (h === null) return 'indefinido';
  if (c?.status !== 'ativa') return 'nao_ativa';
  const ini = dia(c?.data_inicio);
  const fim = dia(c?.data_fim);
  if (ini !== null && h < ini) return 'antes';
  if (fim !== null && h > fim) return 'depois';
  return 'arrecadando';
}

function dataBr(iso?: string | null): string | null {
  const d = dia(iso);
  if (d === null) return null;
  const [a, m, x] = d.split('-');
  return `${x}/${m}/${a}`;
}

export type AvisoBarra = { tom: 'ambar' | 'neutro'; texto: string };








export function avisosDaBarra(c: CampanhaBarra, hoje: string): AvisoBarra[] {
  const avisos: AvisoBarra[] = [];
  const estado = estadoDaCampanha(c, hoje);
  const semDinheiro = Number(c?.total_centavos || 0) <= 0;

  if (estado === 'antes') {
    const quando = dataBr(c?.data_inicio);
    avisos.push({
      tom: 'ambar',
      texto: quando

        ? `A arrecadação abre em ${quando} — o valor ainda não é resultado da campanha.`
        : 'A arrecadação ainda não abriu — o valor ainda não é resultado da campanha.',
    });
  } else if (estado === 'depois') {
    const quando = dataBr(c?.data_fim);
    avisos.push({
      tom: 'neutro',
      texto: quando ? `A janela de arrecadação fechou em ${quando}.` : 'A janela de arrecadação já fechou.',
    });
  } else if (estado === 'nao_ativa' && c?.status === 'encerrada') {



    avisos.push({ tom: 'neutro', texto: 'Campanha encerrada — este é o resultado final.' });
  } else if (estado === 'nao_ativa') {



    avisos.push({
      tom: 'ambar',
      texto: c?.status === 'pausada'
        ? 'Campanha pausada — o dígito não está identificando doação.'
        : 'Campanha ainda não ativada — o dígito não está identificando doação.',
    });
  } else if (estado === 'arrecadando' && semDinheiro) {


    avisos.push({ tom: 'neutro', texto: 'Arrecadação aberta e nenhuma doação identificada ainda.' });
  }




  if (c?.publica !== true && c?.status !== 'encerrada') {
    avisos.push({ tom: 'neutro', texto: 'Ainda não aparece nas telas do culto.' });
  }

  return avisos;
}


export function seloDoEstado(c: CampanhaBarra, hoje: string): string {
  switch (estadoDaCampanha(c, hoje)) {
    case 'arrecadando': return 'Arrecadando';
    case 'antes': return 'Ainda não abriu';
    case 'depois': return 'Encerrada';
    case 'nao_ativa':
      if (c?.status === 'pausada') return 'Pausada';
      if (c?.status === 'encerrada') return 'Encerrada';
      return 'Não ativada';
    default: return '—';
  }
}
