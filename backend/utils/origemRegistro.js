
























const DA_PESSOA = new Set(['form_publico', 'app', 'chat']);


const DE_TERCEIRO = new Set(['manual', 'link_culto']);









function origemDoRegistro(fonte) {
  const f = String(fonte || '').trim().toLowerCase();
  if (DA_PESSOA.has(f)) {
    return { rotulo: 'Preencheu', porPessoa: true, fonte: f };
  }
  if (DE_TERCEIRO.has(f)) {
    return { rotulo: 'Registrado pela equipe', porPessoa: false, fonte: f };
  }
  return { rotulo: 'Registrado', porPessoa: null, fonte: f || null };
}










function quandoBRT(iso, agora = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const b = new Date(t - 3 * 3600 * 1000);
  const dd = String(b.getUTCDate()).padStart(2, '0');
  const mm = String(b.getUTCMonth() + 1).padStart(2, '0');
  const hh = String(b.getUTCHours()).padStart(2, '0');
  const mi = String(b.getUTCMinutes()).padStart(2, '0');
  const anoAgora = new Date(agora - 3 * 3600 * 1000).getUTCFullYear();
  const ano = b.getUTCFullYear() === anoAgora ? '' : `/${b.getUTCFullYear()}`;
  return `${dd}/${mm}${ano} ${hh}:${mi}`;
}


function diaBRT(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t - 3 * 3600 * 1000).toISOString().slice(0, 10);
}













function atrasoDias(registradoEm, dataCulto) {
  const dia = diaBRT(registradoEm);
  if (!dia || !dataCulto) return null;
  const a = Date.parse(`${dia}T12:00:00Z`);
  const b = Date.parse(`${String(dataCulto).slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const d = Math.round((a - b) / 86400000);
  return d > 0 ? d : null;
}


function textoRegistro({ registradoEm, fonte, dataCulto, agora = Date.now() } = {}) {
  const quando = quandoBRT(registradoEm, agora);
  if (!quando) return null;
  const { rotulo, porPessoa } = origemDoRegistro(fonte);
  const dias = atrasoDias(registradoEm, dataCulto);
  const sufixo = dias ? ` · ${dias} dia${dias === 1 ? '' : 's'} após o culto` : '';
  return { texto: `${rotulo} ${quando}${sufixo}`, porPessoa, atrasoDias: dias };
}

module.exports = { origemDoRegistro, quandoBRT, diaBRT, atrasoDias, textoRegistro, DA_PESSOA, DE_TERCEIRO };
