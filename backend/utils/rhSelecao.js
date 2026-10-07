const { validarRespostas } = require('./rhSelecaoFormulario');
const CONSENTIMENTO = 'transferencia-interna-v1';
const BUCKET = 'rh-selecao-anexos';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function texto(v, campo, min, max) {
  if (typeof v !== 'string' || v.trim().length < min || v.trim().length > max) throw new Error(`${campo}: preencha entre ${min} e ${max} caracteres.`);
  return v.trim();
}
function linkSeguro(v) {
  if (!v) return null;
  const valor = texto(v, 'Link do anexo', 1, 2000);
  try { const u = new URL(valor); if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new Error(); return u.href; }
  catch { throw new Error('Informe um link HTTP ou HTTPS válido, sem credenciais.'); }
}
function validarInscricao(b, processo, temArquivo = false) {
  if (b.consentimento !== true) throw new Error('Autorize o uso das informações para este processo.');
  if (!Array.isArray(b.vagas) || !b.vagas.length || b.vagas.length > 20 || b.vagas.some(v => typeof v !== 'string' || !processo.vagas.includes(v))) throw new Error('Selecione pelo menos uma vaga válida.');
  const respostas = validarRespostas(b, processo, temArquivo);
  return { respostas, formulario_versao: processo.formulario_versao || 1, nome: texto(b.nome, 'Nome completo', 3, 200), cargo_area: texto(b.cargo_area, 'Cargo e área atuais', 2, 300), vagas: [...new Set(b.vagas)], motivacao: respostas.motivacao || '', experiencia: respostas.experiencia || '', restricao: respostas.restricao || '', anexo_link: linkSeguro(b.anexo_link), consentimento_versao: CONSENTIMENTO };
}
function validarProcesso(b) {
  if (!Array.isArray(b.vagas) || !b.vagas.length || b.vagas.length > 20) throw new Error('Informe de uma a vinte vagas.');
  const vagas = [...new Set(b.vagas.map(v => texto(v, 'Vaga', 2, 160)))];
  return { titulo: texto(b.titulo, 'Título', 3, 160), vagas, publico: 'interno', status: 'rascunho' };
}
function extensaoArquivo(file) {
  if (!file) return null;
  const b = file.buffer;
  if (file.mimetype === 'application/pdf' && b.subarray(0,5).toString() === '%PDF-') return 'pdf';
  if (file.mimetype === 'image/png' && b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'png';
  if (file.mimetype === 'image/jpeg' && b[0] === 255 && b[1] === 216 && b[2] === 255) return 'jpg';
  if (file.mimetype === 'text/plain' && !b.includes(0)) return 'txt';
  if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' && b.subarray(0,2).toString() === 'PK' && b.includes(Buffer.from('word/document.xml'))) return 'docx';
  throw new Error('Envie PDF, DOCX, TXT, JPG ou PNG válido, de até 3 MB.');
}
module.exports = { CONSENTIMENTO, BUCKET, UUID, validarInscricao, validarProcesso, extensaoArquivo, linkSeguro };
