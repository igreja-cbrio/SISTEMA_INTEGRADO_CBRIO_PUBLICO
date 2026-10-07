'use strict';











const TEXTO_MAX = 600;


const PERIODO_MAX_DIAS = 366;
const ANTECEDENCIA_MAX_DIAS = 366;

const DIA_MS = 86400000;
const utc = (s) => Date.parse(`${s}T00:00:00Z`);


function dataValida(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = utc(s);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
}

function somarDias(dia, n) {
  return new Date(utc(dia) + n * DIA_MS).toISOString().slice(0, 10);
}

const diasEntre = (depois, antes) => Math.round((utc(depois) - utc(antes)) / DIA_MS);



function normalizarTexto(texto) {
  return String(texto ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const ddmmaaaa = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;





function validarAviso(entrada = {}, { hoje, atual = null } = {}) {
  if (!dataValida(hoje)) throw new Error('validarAviso: hoje inválido');
  const tem = (k) => Object.prototype.hasOwnProperty.call(entrada || {}, k) && entrada[k] !== undefined;
  const bruto = {
    texto: tem('texto') ? entrada.texto : atual?.texto,
    inicio: tem('inicio') ? entrada.inicio : atual?.inicio,
    fim: tem('fim') ? entrada.fim : atual?.fim,
  };

  if (bruto.texto != null && typeof bruto.texto !== 'string') return { ok: false, erro: 'O texto do aviso precisa ser um texto.' };
  const texto = normalizarTexto(bruto.texto);
  if (!texto) return { ok: false, erro: 'Escreva o aviso.' };
  if (texto.length > TEXTO_MAX) {
    return { ok: false, erro: `O aviso passou de ${TEXTO_MAX} caracteres (tem ${texto.length}). Encurte um pouco.` };
  }

  const inicio = bruto.inicio;
  const fim = bruto.fim;
  if (!dataValida(inicio)) return { ok: false, erro: 'Escolha a data em que o aviso começa a aparecer.' };
  if (!dataValida(fim)) return { ok: false, erro: 'Escolha até quando o aviso fica no ar.' };
  if (fim < inicio) return { ok: false, erro: 'A data final vem antes da inicial.' };
  if (fim < hoje) {
    return { ok: false, erro: `A data final (${ddmmaaaa(fim)}) já passou: o aviso não apareceria. Escolha uma data de hoje em diante.` };
  }
  if (diasEntre(fim, inicio) + 1 > PERIODO_MAX_DIAS) {
    return { ok: false, erro: 'Um aviso fica no ar no máximo um ano. Encurte o período.' };
  }
  if (inicio > somarDias(hoje, ANTECEDENCIA_MAX_DIAS)) {
    return { ok: false, erro: 'Dá para agendar um aviso até um ano à frente. Confira o ano da data inicial.' };
  }
  return { ok: true, valores: { texto, inicio, fim } };
}


function estadoDoAviso(aviso, hoje) {
  if (!aviso) return null;
  if (aviso.inicio > hoje) return 'agendado';
  if (aviso.fim < hoje) return 'encerrado';
  return 'vigente';
}



function separarAvisos(avisos = [], hoje) {
  const vigentes = [];
  const agendados = [];
  for (const a of avisos || []) {
    if (!a || a.deleted_at) continue;
    const estado = estadoDoAviso(a, hoje);
    const com = { ...a, estado };
    if (estado === 'vigente') vigentes.push(com);
    else if (estado === 'agendado') agendados.push(com);
  }
  const criado = (a) => String(a.created_at || '');
  vigentes.sort((a, b) => b.inicio.localeCompare(a.inicio) || criado(b).localeCompare(criado(a)));
  agendados.sort((a, b) => a.inicio.localeCompare(b.inicio) || criado(a).localeCompare(criado(b)));
  return { vigentes, agendados };
}

module.exports = {
  TEXTO_MAX, PERIODO_MAX_DIAS, ANTECEDENCIA_MAX_DIAS,
  dataValida, somarDias, normalizarTexto, validarAviso, estadoDoAviso, separarAvisos,
};
