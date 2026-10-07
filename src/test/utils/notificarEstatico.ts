













import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';










export function semComentarios(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}


export function lerBackend(caminhoRelativo: string): string {
  return semComentarios(
    readFileSync(resolve(__dirname, '../../../', caminhoRelativo), 'utf-8'),
  );
}






export function chamadasNotificar(src: string): string[] {
  const blocos: string[] = [];
  const marca = 'notificar({';
  let i = src.indexOf(marca);
  while (i !== -1) {
    let nivel = 0;
    let fim = i + marca.length - 1;
    for (let j = fim; j < src.length; j += 1) {
      if (src[j] === '{') nivel += 1;
      else if (src[j] === '}') {
        nivel -= 1;
        if (nivel === 0) { fim = j; break; }
      }
    }
    blocos.push(src.slice(i, fim + 1));
    i = src.indexOf(marca, fim);
  }
  return blocos;
}






export function corpoDaRota(src: string, rota: string): string {
  const i = src.indexOf(`'${rota}'`);
  if (i === -1) return '';
  const fim = src.indexOf('\n});', i);
  return src.slice(i, fim === -1 ? undefined : fim);
}
