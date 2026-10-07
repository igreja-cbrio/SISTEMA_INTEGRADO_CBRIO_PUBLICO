

































const CATEGORIAS_GRUPO = [
  'Conexao', 'Estudo', 'Jornada 180', 'Discipulado',
  'Casais', 'Jovens', 'Mulheres', 'Homens', 'Misto',
];


const CAMPOS_EDITAVEIS_APP = [
  'nome', 'categoria', 'descricao', 'tema', 'dia_semana', 'horario', 'local', 'endereco', 'bairro',
];



const CAMPOS_DE_ENDERECO = ['endereco', 'bairro'];

function semAcento(v) {



  return String(v == null ? '' : v).normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function texto(v, max = 500) {
  const s = String(v == null ? '' : v).trim().replace(/\s+/g, ' ');
  return s ? s.slice(0, max) : null;
}


function normalizarCategoria(v) {
  const alvo = semAcento(v).trim().toLowerCase();
  if (!alvo) return null;
  return CATEGORIAS_GRUPO.find((c) => semAcento(c).toLowerCase() === alvo) || null;
}


function normalizarHorario(v) {
  const bruto = String(v == null ? '' : v).trim();
  if (!bruto) return null;
  const digitos = bruto.replace(/\D/g, '');
  let h;
  let m;
  if (/^\d{1,2}:\d{1,2}/.test(bruto)) {
    const [hh, mm] = bruto.split(':');
    h = Number(hh); m = Number(mm.slice(0, 2));
  } else if (digitos.length === 4) {
    h = Number(digitos.slice(0, 2)); m = Number(digitos.slice(2));
  } else if (digitos.length === 3) {
    h = Number(digitos.slice(0, 1)); m = Number(digitos.slice(1));
  } else if (digitos.length <= 2 && digitos.length >= 1) {
    h = Number(digitos); m = 0;
  } else {
    return null;
  }
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}











function validarEdicaoGrupoApp(body = {}) {
  const erros = {};
  const valores = {};
  const b = body || {};

  if ('nome' in b) {
    const nome = texto(b.nome, 200);


    if (!nome) erros.nome = 'O nome do grupo não pode ficar vazio.';
    else valores.nome = nome;
  }

  if ('categoria' in b) {
    const bruta = String(b.categoria == null ? '' : b.categoria).trim();
    if (!bruta) {
      valores.categoria = null;
    } else {
      const cat = normalizarCategoria(bruta);
      if (!cat) {
        erros.categoria = `Categoria inválida. Use uma destas: ${CATEGORIAS_GRUPO.join(', ')}.`;
      } else {
        valores.categoria = cat;
      }
    }
  }

  if ('dia_semana' in b) {
    const v = b.dia_semana;
    if (v === null || v === '' || v === undefined) {
      valores.dia_semana = null;
    } else {
      const n = Number(v);


      if (!Number.isInteger(n) || n < 0 || n > 6) {
        erros.dia_semana = 'Dia da semana inválido.';
      } else {
        valores.dia_semana = n;
      }
    }
  }

  if ('horario' in b) {
    const bruto = String(b.horario == null ? '' : b.horario).trim();
    if (!bruto) {
      valores.horario = null;
    } else {
      const hora = normalizarHorario(bruto);
      if (!hora) erros.horario = 'Horário inválido. Use o formato 19:30.';
      else valores.horario = hora;
    }
  }

  for (const campo of ['descricao', 'tema', 'local', 'endereco', 'bairro']) {
    if (campo in b) valores[campo] = texto(b[campo], campo === 'descricao' ? 2000 : 500);
  }

  const mudouEndereco = CAMPOS_DE_ENDERECO.some((c) => c in b);
  return { erros, valores, mudouEndereco };
}

module.exports = {
  CATEGORIAS_GRUPO,
  CAMPOS_EDITAVEIS_APP,
  CAMPOS_DE_ENDERECO,
  normalizarCategoria,
  normalizarHorario,
  validarEdicaoGrupoApp,
};
