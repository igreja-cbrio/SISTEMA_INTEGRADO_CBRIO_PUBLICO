


























export const CICLOS_PARA_ALERTAR = 3;

export const CICLOS_PARA_RECUPERAR = 2;

export type Estado = {
  falhasSeguidas: number;
  sucessosSeguidos: number;

  alertado: boolean;

  desdeMs: number | null;
};

export const estadoInicial: Estado = {
  falhasSeguidas: 0, sucessosSeguidos: 0, alertado: false, desdeMs: null,
};

export type Ciclo = {

  bancoOk: boolean;

  appOk: boolean;
  agoraMs: number;
};

export type Decisao = {
  estado: Estado;

  alertar: boolean;

  recuperou: boolean;

  duracaoMs: number | null;

  diagnostico: 'banco_fora' | 'app_fora_banco_ok' | 'sonda_suspeita' | 'ok';
};








function diagnosticar(c: Ciclo): Decisao['diagnostico'] {
  if (c.bancoOk && c.appOk) return 'ok';
  if (!c.bancoOk && !c.appOk) return 'banco_fora';
  if (c.bancoOk && !c.appOk) return 'app_fora_banco_ok';
  return 'sonda_suspeita';
}

export function avaliarCiclo(estado: Estado, c: Ciclo): Decisao {
  const diagnostico = diagnosticar(c);
  const saudavel = diagnostico === 'ok';

  if (saudavel) {
    const sucessos = estado.sucessosSeguidos + 1;



    const recuperou = estado.alertado && sucessos >= CICLOS_PARA_RECUPERAR;
    return {
      estado: recuperou
        ? { ...estadoInicial }
        : { falhasSeguidas: 0, sucessosSeguidos: sucessos, alertado: estado.alertado, desdeMs: estado.desdeMs },
      alertar: false,
      recuperou,
      duracaoMs: recuperou && estado.desdeMs ? c.agoraMs - estado.desdeMs : null,
      diagnostico,
    };
  }

  const falhas = estado.falhasSeguidas + 1;
  const desdeMs = estado.desdeMs ?? c.agoraMs;


  const alertar = falhas >= CICLOS_PARA_ALERTAR && !estado.alertado;

  return {
    estado: { falhasSeguidas: falhas, sucessosSeguidos: 0, alertado: estado.alertado || alertar, desdeMs },
    alertar,
    recuperou: false,
    duracaoMs: null,
    diagnostico,
  };
}


export function textoAlerta(d: Decisao, urlPainel: string): { assunto: string; corpo: string } {
  const mapa: Record<string, string> = {
    banco_fora: 'O BANCO NÃO RESPONDE — o sistema está fora do ar',
    app_fora_banco_ok: 'O SITE não responde, mas o banco está vivo (Vercel/Cloudflare)',
    sonda_suspeita: 'A sonda não alcança o banco, mas o site responde (pode ser a sonda)',
  };
  const assunto = `[CBRio] ${mapa[d.diagnostico] || 'Falha detectada'}`;
  const passos = d.diagnostico === 'banco_fora'


    ? `O QUE FAZER:\n1. Abra ${urlPainel}\n2. Settings → General → "Restart project"\n3. Aguarde ~4 min e confira se voltou.\n\nNa queda de 02/09/2026 isso resolveu em 4 minutos.`
    : d.diagnostico === 'app_fora_banco_ok'
      ? `O QUE FAZER:\n1. NÃO reinicie o banco — ele está vivo.\n2. Confira o último deploy na Vercel e o status da Cloudflare.`
      : `O QUE FAZER:\n1. Confira se o site abre no seu celular.\n2. Se abrir, o problema é a sonda (rede/credencial do worker), não o sistema.`;
  return { assunto, corpo: `${mapa[d.diagnostico] || 'Falha'}\n\n${passos}` };
}
