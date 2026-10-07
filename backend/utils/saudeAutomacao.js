

























const HORA = 3600000;





const MARCAS_CONFIG = ['42703', '42p01', 'pgrst204', 'pgrst205',
  'does not exist', 'could not find', 'unknown column'];


function erroDeConfiguracao(erro) {
  if (!erro) return false;
  const texto = `${erro.code || ''} ${erro.message || ''} ${erro.details || ''}`.toLowerCase();
  return MARCAS_CONFIG.some((m) => texto.includes(m));
}









function classificar(p, ultima, erro = null, agora = Date.now()) {


  if (erroDeConfiguracao(erro)) {
    return { status: 'erro_config', ultima: null, horas: null,
      motivo: erro.message || String(erro) };
  }
  if (erro) return { status: 'desconhecido', ultima: null, horas: null,
    motivo: erro.message || String(erro) };

  if (!ultima) return { status: 'desconhecido', ultima: null, horas: null, motivo: null };

  const t = new Date(ultima).getTime();
  if (!Number.isFinite(t)) {
    return { status: 'erro_config', ultima: null, horas: null,
      motivo: `timestamp ilegível: ${ultima}` };
  }
  const horas = Math.floor((agora - t) / HORA);
  const max = Number(p && p.maxHoras);
  if (!Number.isFinite(max) || max <= 0) {
    return { status: 'erro_config', ultima, horas, motivo: 'maxHoras inválido no catálogo' };
  }
  let status = 'ok';
  if (horas > max * 2) status = 'parado';
  else if (horas > max) status = 'atrasado';
  return { status, ultima, horas, motivo: null };
}



const STATUS_QUE_ALERTAM = Object.freeze(['atrasado', 'parado', 'erro_config']);

function deveAlertar(status) {
  return STATUS_QUE_ALERTAM.includes(status);
}


function textoAlerta(s) {
  if (s.status === 'erro_config') {
    return {
      titulo: `Monitor quebrado: ${s.label}`,
      mensagem: `O monitor não consegue verificar "${s.label}" — ${s.motivo || 'consulta inválida'}. `
        + `Enquanto isso durar, este pipeline NÃO está sendo vigiado: se ele parar, nenhum alerta sai. `
        + `O conserto é no cadastro do monitor (tabela/coluna), não no pipeline.`,
      severidade: 'warning',
    };
  }
  return {
    titulo: `Automação ${s.status === 'parado' ? 'parada' : 'atrasada'}: ${s.label}`,
    mensagem: `${s.label} está há ${s.horas}h sem novo registro (esperado a cada ${s.maxHoras}h). `
      + `Verifique se a sincronização/cron está rodando.`,
    severidade: s.status === 'parado' ? 'warning' : 'info',
  };
}

module.exports = { HORA, erroDeConfiguracao, classificar, deveAlertar, textoAlerta, STATUS_QUE_ALERTAM };
