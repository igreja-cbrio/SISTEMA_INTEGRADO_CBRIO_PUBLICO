























const { ehCampoDeCadastro } = require('./censoCampoCadastro');



const { TIPOS_CONSENTIMENTO } = require('./censoConsentimento');



const TIPOS = Object.freeze([
  'secao',
  'texto_curto',
  'texto_longo',
  'data',
  'numero',
  'escala_5',
  'estrelas_5',
  'nps',
  'sim_nao',
  'opcao_unica',
  'multipla',



  'busca',
]);

const TIPOS_COM_OPCOES = Object.freeze(['opcao_unica', 'multipla']);
const TIPOS_SEM_RESPOSTA = Object.freeze(['secao']);

const TIPOS_NUMERICOS = Object.freeze(['numero', 'escala_5', 'estrelas_5', 'nps']);





const FORMATOS = Object.freeze(['texto', 'telefone', 'email', 'instagram', 'cpf', 'cep']);



const CATALOGOS = Object.freeze(['igrejas_rj', 'grupos_ativos']);



const CUIDADO_TIPOS = Object.freeze(['familiar', 'aconselhamento', 'oracao', 'conversa']);



const ESCALA_MIN = 1;
const ESCALA_MAX = 5;







const NAO_SE_APLICA = 'Não se aplica';

const { cpfValido, soDigitos } = require('./cpf');

function ehTexto(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function lista(v) {
  return Array.isArray(v) ? v : [];
}





function slugificar(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}












function validarPerguntas(entrada) {
  const erros = [];
  if (!Array.isArray(entrada)) {
    return { ok: false, erros: ['perguntas deve ser uma lista'], perguntas: [] };
  }

  const vistos = new Set();
  const perguntas = entrada.map((p, i) => {
    const pos = i + 1;
    const tipo = String(p?.tipo || '').trim();
    if (!TIPOS.includes(tipo)) erros.push(`Pergunta ${pos}: tipo "${tipo}" não existe`);
    if (!ehTexto(p?.texto)) erros.push(`Pergunta ${pos}: texto vazio`);

    let id = ehTexto(p?.id) ? String(p.id).trim() : `p${pos}_${slugificar(p?.texto).slice(0, 24) || 'pergunta'}`;
    if (vistos.has(id)) {
      erros.push(`Pergunta ${pos}: id duplicado "${id}"`);
      id = `${id}_${pos}`;
    }
    vistos.add(id);

    const out = { id, tipo, texto: String(p?.texto || '').trim() };
    if (ehTexto(p?.descricao)) out.descricao = String(p.descricao).trim();


    const opcoes = lista(p?.opcoes).map((o) => String(o ?? '').trim()).filter(Boolean);
    if (TIPOS_COM_OPCOES.includes(tipo)) {
      if (opcoes.length < 2) erros.push(`Pergunta ${pos}: "${tipo}" precisa de pelo menos 2 opções`);
      if (new Set(opcoes).size !== opcoes.length) erros.push(`Pergunta ${pos}: opções repetidas`);
    }
    if (opcoes.length) out.opcoes = opcoes;





    const neutras = lista(p?.opcoes_neutras).map((o) => String(o ?? '').trim()).filter(Boolean);
    if (neutras.length) {
      const fora = neutras.filter((n) => !opcoes.includes(n));
      if (fora.length) erros.push(`Pergunta ${pos}: opcoes_neutras fora da lista de opções: ${fora.join(', ')}`);
      out.opcoes_neutras = neutras.filter((n) => opcoes.includes(n));
    }


    if (tipo === 'nps') {
      const max = Number(p?.max);
      out.max = Number.isFinite(max) && max > 0 ? Math.min(Math.trunc(max), 10) : 10;
    }
    if (tipo === 'escala_5' || tipo === 'estrelas_5') {
      const min = ehTexto(p?.rotulos?.min) ? String(p.rotulos.min).trim() : '';
      const rmax = ehTexto(p?.rotulos?.max) ? String(p.rotulos.max).trim() : '';
      if (min || rmax) out.rotulos = { min, max: rmax };
      if (p?.permite_nao_se_aplica === true) out.permite_nao_se_aplica = true;
    } else if (p?.permite_nao_se_aplica === true) {

      erros.push(`Pergunta ${pos}: permite_nao_se_aplica só vale em escala — em pergunta de opção, inclua "${NAO_SE_APLICA}" nas opções e em opcoes_neutras`);
    }


    if (p?.formato !== undefined) {
      const f = String(p.formato).trim();
      if (!FORMATOS.includes(f)) erros.push(`Pergunta ${pos}: formato "${f}" não existe`);
      else if (f !== 'texto') {
        if (tipo !== 'texto_curto') erros.push(`Pergunta ${pos}: formato "${f}" só vale em texto_curto`);
        else out.formato = f;
      }
    }


    if (tipo === 'busca') {
      const cat = String(p?.catalogo || '').trim();
      if (!CATALOGOS.includes(cat)) {
        erros.push(`Pergunta ${pos}: catálogo "${cat}" não existe (use ${CATALOGOS.join(' ou ')})`);
      } else {
        out.catalogo = cat;
      }

      out.permite_outro = p?.permite_outro !== false;
    } else if (p?.catalogo !== undefined) {
      erros.push(`Pergunta ${pos}: catálogo só vale no tipo "busca"`);
    }


    if (tipo === 'numero') {
      const mn = Number(p?.min_num); const mx = Number(p?.max_num);
      out.min_num = Number.isFinite(mn) ? mn : 0;
      out.max_num = Number.isFinite(mx) ? mx : 99;
      if (out.min_num > out.max_num) erros.push(`Pergunta ${pos}: min_num maior que max_num`);
    }




    if (p?.mostrar_se !== undefined && p.mostrar_se !== null) {
      const dep = ehTexto(p.mostrar_se?.pergunta) ? String(p.mostrar_se.pergunta).trim() : '';
      const valores = lista(p.mostrar_se?.valores).map((v) => String(v ?? '').trim()).filter(Boolean);
      if (!dep) erros.push(`Pergunta ${pos}: mostrar_se sem pergunta de referência`);
      else if (!vistos.has(dep) || dep === id) {
        erros.push(`Pergunta ${pos}: mostrar_se aponta para "${dep}", que não é uma pergunta anterior`);
      } else if (!valores.length) {
        erros.push(`Pergunta ${pos}: mostrar_se sem valores que a ativem`);
      } else {
        out.mostrar_se = { pergunta: dep, valores };
      }
    }


    if (p?.acao !== undefined && p.acao !== null && String(p.acao).trim() !== '') {
      const acao = String(p.acao).trim();
      if (acao === 'consentimento') {




        const ct = String(p?.consentimento_tipo || '').trim();
        if (!TIPOS_CONSENTIMENTO.includes(ct)) {
          erros.push(`Pergunta ${pos}: consentimento_tipo precisa ser um de ${TIPOS_CONSENTIMENTO.join('/')}`);
        } else if (tipo !== 'sim_nao' && tipo !== 'opcao_unica') {
          erros.push(`Pergunta ${pos}: consentimento precisa ser Sim/Não ou opção única`);
        } else {
          out.acao = 'consentimento';
          out.consentimento_tipo = ct;
        }
      } else if (acao !== 'cuidado') erros.push(`Pergunta ${pos}: acao "${acao}" não existe`);
      else {
        const ct = String(p?.cuidado_tipo || '').trim();
        if (!CUIDADO_TIPOS.includes(ct)) {
          erros.push(`Pergunta ${pos}: cuidado_tipo precisa ser um de ${CUIDADO_TIPOS.join('/')}`);
        } else if (tipo !== 'sim_nao') {
          erros.push(`Pergunta ${pos}: gatilho de cuidado precisa ser Sim/Não`);
        } else {
          out.acao = 'cuidado';
          out.cuidado_tipo = ct;
        }
      }
    }

    if (p?.sensivel === true) out.sensivel = true;







    if (ehTexto(p?.preenche_de)) {
      const destino = String(p.preenche_de).trim();
      if (!ehCampoDeCadastro(destino)) {
        erros.push(`Pergunta ${pos}: "${destino}" não é um campo do cadastro`);
      } else {
        out.preenche_de = destino;
      }
    }
    if (!TIPOS_SEM_RESPOSTA.includes(tipo)) out.obrigatoria = p?.obrigatoria === true;

    return out;
  });

  const respondiveis = perguntas.filter((p) => !TIPOS_SEM_RESPOSTA.includes(p.tipo));
  if (respondiveis.length === 0) erros.push('A pesquisa precisa de pelo menos uma pergunta respondível');

  return { ok: erros.length === 0, erros, perguntas };
}









function visivel(pergunta, respostas = {}) {
  const cond = pergunta?.mostrar_se;
  if (!cond?.pergunta) return true;
  const bruto = respostas?.[cond.pergunta];
  if (bruto === undefined || bruto === null) return false;
  const dadas = (Array.isArray(bruto) ? bruto : [bruto]).map((v) => String(v).trim());
  return cond.valores.some((v) => dadas.includes(String(v).trim()));
}


function ehNeutra(pergunta, valor) {
  const v = String(valor ?? '').trim();
  if (pergunta?.permite_nao_se_aplica === true && v === NAO_SE_APLICA) return true;
  return lista(pergunta?.opcoes_neutras).includes(v);
}






function resolverMultipla(pergunta, valores) {
  const opts = lista(valores).map((v) => String(v ?? '').trim()).filter(Boolean);
  const validas = pergunta?.opcoes ? opts.filter((o) => pergunta.opcoes.includes(o)) : opts;
  const neutra = validas.find((o) => ehNeutra(pergunta, o));
  return neutra ? [neutra] : validas;
}



















function montarItens({ perguntas, respostas }) {
  const itens = [];
  const faltando = [];
  const cuidados = [];
  const ignoradas = [];
  const mapa = respostas && typeof respostas === 'object' ? respostas : {};
  const listaPerguntas = Array.isArray(perguntas) ? perguntas : [];

  for (const p of listaPerguntas) {
    if (TIPOS_SEM_RESPOSTA.includes(p.tipo)) continue;



    if (!visivel(p, mapa)) {
      if (mapa[p.id] !== undefined) ignoradas.push(p.id);
      continue;
    }

    const bruto = mapa[p.id];
    const vazio = bruto === undefined || bruto === null
      || (typeof bruto === 'string' && bruto.trim() === '')
      || (Array.isArray(bruto) && bruto.length === 0);

    if (vazio) {
      if (p.obrigatoria) faltando.push({ id: p.id, texto: p.texto });
      continue;
    }

    const item = {
      pergunta_id: p.id,
      pergunta_texto: p.texto,
      tipo: p.tipo,
      valor_texto: null,
      valor_num: null,
      valor_opcoes: null,
      sensivel: p.sensivel === true,
    };
    const faltou = () => { if (p.obrigatoria) faltando.push({ id: p.id, texto: p.texto }); };

    if (p.tipo === 'multipla') {
      const opts = resolverMultipla(p, Array.isArray(bruto) ? bruto : [bruto]);
      if (!opts.length) { faltou(); continue; }
      item.valor_opcoes = opts;

      item.valor_texto = opts.join(' | ');
    } else if (p.tipo === 'opcao_unica' || p.tipo === 'sim_nao') {
      const v = String(bruto).trim();
      const permitidas = p.opcoes || (p.tipo === 'sim_nao' ? ['Sim', 'Não'] : null);
      if (permitidas && !permitidas.includes(v)) { ignoradas.push(p.id); faltou(); continue; }
      item.valor_texto = v;
      if (p.acao === 'cuidado' && v === 'Sim') cuidados.push({ tipo: p.cuidado_tipo });
    } else if (TIPOS_NUMERICOS.includes(p.tipo)) {


      if (p.permite_nao_se_aplica === true && String(bruto).trim() === NAO_SE_APLICA) {
        item.valor_texto = NAO_SE_APLICA;
        itens.push(item);
        continue;
      }
      const n = Number(bruto);
      if (!Number.isFinite(n)) { faltou(); continue; }
      const [min, max] = p.tipo === 'nps' ? [0, p.max ?? 10]
        : p.tipo === 'numero' ? [p.min_num ?? 0, p.max_num ?? 99]
        : [ESCALA_MIN, ESCALA_MAX];
      if (n < min || n > max) { ignoradas.push(p.id); faltou(); continue; }
      item.valor_num = n;
      item.valor_texto = String(n);
    } else if (p.tipo === 'data') {
      const v = String(bruto).trim();

      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) {
        ignoradas.push(p.id); faltou(); continue;
      }
      item.valor_texto = v;
    } else if (p.tipo === 'busca') {


      item.valor_texto = String(bruto).trim().slice(0, 200);
      if (!item.valor_texto) { faltou(); continue; }
    } else if (p.formato === 'cpf') {


      const digitos = soDigitos(bruto);
      if (!cpfValido(digitos)) { ignoradas.push(p.id); faltou(); continue; }
      item.valor_texto = digitos;
    } else {
      item.valor_texto = String(bruto).trim();
      if (!item.valor_texto) { faltou(); continue; }
    }

    itens.push(item);
  }

  return { itens, faltando, cuidados, ignoradas };
}








function ordenarPorOpcoes(pergunta, linhas) {
  const opcoes = lista(pergunta?.opcoes);
  const idx = new Map(opcoes.map((o, i) => [o, i]));
  return lista(linhas)
    .map((l, i) => ({ l, i }))
    .sort((a, b) => {
      const ia = idx.has(String(a.l?.valor)) ? idx.get(String(a.l.valor)) : Number.MAX_SAFE_INTEGER;
      const ib = idx.has(String(b.l?.valor)) ? idx.get(String(b.l.valor)) : Number.MAX_SAFE_INTEGER;
      return ia === ib ? a.i - b.i : ia - ib;
    })
    .map(({ l }) => l);
}









function baseSemNeutras(pergunta, linhas) {
  let base = 0; let neutras = 0;
  for (const l of lista(linhas)) {
    const n = Number(l?.total) || 0;
    if (ehNeutra(pergunta, l?.valor)) neutras += n; else base += n;
  }
  return { base, neutras, total: base + neutras };
}

module.exports = {
  TIPOS,
  TIPOS_COM_OPCOES,
  TIPOS_SEM_RESPOSTA,
  TIPOS_NUMERICOS,
  FORMATOS,
  CATALOGOS,
  CUIDADO_TIPOS,


  TIPOS_CONSENTIMENTO,
  ESCALA_MIN,
  ESCALA_MAX,
  NAO_SE_APLICA,
  slugificar,
  validarPerguntas,
  visivel,
  ehNeutra,
  resolverMultipla,
  montarItens,
  ordenarPorOpcoes,
  baseSemNeutras,
};
