



import JSZip from 'jszip';
import { nomesDosPaisUnicos } from './apresentacaoPais';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function dataPorExtenso(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return String(iso);
  return `${d} de ${MESES[m - 1]} de ${y}`;
}


function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function baixarBlob(blob, nomeArquivo) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}


function nomeSeguro(criancaNome) {
  return (criancaNome || 'crianca').replace(/[\\/:*?"<>|]+/g, ' ').trim();
}


async function carregarTemplateBuffer() {
  const templateUrl = import.meta.env.VITE_CERTIFICADO_TEMPLATE_URL;
  if (!templateUrl) throw new Error('O modelo do certificado ainda não foi configurado.');
  const res = await fetch(templateUrl, { cache: 'no-store' });
  if (!res.ok) throw new Error('Não consegui carregar o modelo do certificado.');
  return res.arrayBuffer();
}


async function montarCertificadoBlob({ criancaNome, nomePai, nomeMae, dataApresentacao, genero = 'menino' }, templateBuffer) {
  const fem = genero === 'menina';



  const pais = nomesDosPaisUnicos(nomePai, nomeMae).join(' e ') || '_______________';



  const zip = await JSZip.loadAsync(templateBuffer.slice(0));

  const slidePath = 'ppt/slides/slide1.xml';
  let xml = await zip.file(slidePath).async('string');
  xml = xml
    .replace(/\{\{NOME\}\}/g, esc(criancaNome))
    .replace(/\{\{PAIS\}\}/g, esc(pais))
    .replace(/\{\{DATA\}\}/g, esc(dataPorExtenso(dataApresentacao)))
    .replace(/\{\{FILHO\}\}/g, fem ? 'filha' : 'filho')
    .replace(/\{\{DEDICADO\}\}/g, fem ? 'dedicada' : 'dedicado')
    .replace(/\{\{PRONOME\}\}/g, fem ? 'dela' : 'dele');
  zip.file(slidePath, xml);

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
}










export async function gerarCertificadoApresentacao(p) {
  const templateBuffer = await carregarTemplateBuffer();
  const blob = await montarCertificadoBlob(p, templateBuffer);
  baixarBlob(blob, `Certificado - ${nomeSeguro(p.criancaNome)}.pptx`);
}










export async function gerarCertificadosApresentacaoLote(itens, opts = {}) {
  const validos = (itens || []).filter(it => it && it.criancaNome && it.dataApresentacao);
  if (validos.length === 0) throw new Error('Nenhuma criança válida para gerar (falta nome ou data da turma).');

  const templateBuffer = await carregarTemplateBuffer();
  const pacote = new JSZip();
  const usados = new Set();

  for (let i = 0; i < validos.length; i++) {
    const it = validos[i];
    const blob = await montarCertificadoBlob(it, templateBuffer);

    let nome = `Certificado - ${nomeSeguro(it.criancaNome)}`;
    let candidato = `${nome}.pptx`;
    let n = 2;
    while (usados.has(candidato)) { candidato = `${nome} (${n++}).pptx`; }
    usados.add(candidato);
    pacote.file(candidato, blob);
    opts.onProgresso?.(i + 1, validos.length);
  }

  const zipBlob = await pacote.generateAsync({ type: 'blob', mimeType: 'application/zip' });
  baixarBlob(zipBlob, opts.nomeArquivo || 'Certificados de Apresentacao.zip');
  return validos.length;
}
