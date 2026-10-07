const PADRAO = require('./rhSelecaoFormularioPadrao.json');
const TIPOS = ['curta','paragrafo','escolha','multipla','anexo'];
const FIXOS = { motivacao: 'paragrafo', experiencia: 'paragrafo', restricao: 'curta', anexo: 'anexo' };
function texto(v, max, obrigatorio = false) {
  if (typeof v !== 'string' || v.length > max || (obrigatorio && !v.trim())) throw new Error('Texto do formulário inválido ou muito extenso.');
  return v.trim();
}
function validarFormulario(f) {
  if (!f || !Array.isArray(f.campos) || f.campos.length > 20) throw new Error('Use até 20 perguntas no formulário.');
  const ids = new Set();
  const campos = f.campos.map(c => {
    if (!c || typeof c.id !== 'string' || !/^(motivacao|experiencia|restricao|anexo|campo_[a-z0-9_-]{1,50})$/.test(c.id) || ids.has(c.id)) throw new Error('Identificador de pergunta inválido ou repetido.');
    ids.add(c.id);
    if (!TIPOS.includes(c.tipo) || (FIXOS[c.id] && FIXOS[c.id] !== c.tipo) || (c.tipo === 'anexo' && c.id !== 'anexo')) throw new Error('Tipo de pergunta inválido.');
    if (typeof c.obrigatorio !== 'boolean') throw new Error('Informe se a pergunta é obrigatória.');
    const opcoes = ['escolha','multipla'].includes(c.tipo) ? c.opcoes : [];
    if (!Array.isArray(opcoes) || (['escolha','multipla'].includes(c.tipo) && (opcoes.length < 2 || opcoes.length > 20))) throw new Error('Informe entre 2 e 20 opções.');
    const limpas = opcoes.map(o => texto(o,160,true));
    if (new Set(limpas).size !== limpas.length) throw new Error('As opções devem ser diferentes.');
    return { id:c.id, tipo:c.tipo, titulo:texto(c.titulo,500,true), ajuda:texto(c.ajuda ?? '',1000), obrigatorio:c.obrigatorio, opcoes:limpas };
  });
  return { descricao:texto(f.descricao ?? '',3000), campos };
}
function validarRespostas(body, processo, temArquivo) {
  const formulario = validarFormulario(processo.formulario || PADRAO);
  const entradas = body.respostas ?? {};
  if (!entradas || typeof entradas !== 'object' || Array.isArray(entradas)) throw new Error('Respostas inválidas.');
  const respostas = {};
  for (const c of formulario.campos) {
    if (c.tipo === 'anexo') { if (c.obrigatorio && !temArquivo && !body.anexo_link?.trim()) throw new Error(`${c.titulo}: envie um arquivo ou link.`); continue; }
    const v = Object.hasOwn(entradas,c.id) ? entradas[c.id] : FIXOS[c.id] ? body[c.id] ?? '' : '';
    if (c.tipo === 'multipla') {
      if (!Array.isArray(v) && v !== '') throw new Error(`${c.titulo}: selecione opções válidas.`);
      const valores = v === '' ? [] : v;
      if ((c.obrigatorio && !valores.length) || valores.length > 20 || valores.some(o => !c.opcoes.includes(o))) throw new Error(`${c.titulo}: selecione opções válidas.`);
      respostas[c.id] = [...new Set(valores)];
    } else {
      const valor = texto(v,c.tipo === 'paragrafo' ? 8000 : 500,c.obrigatorio);
      if (c.tipo === 'escolha' && valor && !c.opcoes.includes(valor)) throw new Error(`${c.titulo}: selecione uma opção válida.`);
      respostas[c.id] = valor;
    }
  }
  if (JSON.stringify(respostas).length > 50000) throw new Error('As respostas devem somar até 50.000 caracteres.');
  if (!formulario.campos.some(c => c.tipo === 'anexo') && (temArquivo || body.anexo_link)) throw new Error('Este formulário não recebe anexos. Atualize a página.');
  return respostas;
}
module.exports = { PADRAO, validarFormulario, validarRespostas };
