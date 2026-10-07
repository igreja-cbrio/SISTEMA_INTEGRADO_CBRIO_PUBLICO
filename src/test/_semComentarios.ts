















export function semComentariosJs(src: string): string {












  const espacos = (m: string) => m.replace(/[^\n]/g, ' ');
  return String(src || '')
    .replace(/(^|[^:])(\/\/[^\n]*)/g, (_m, pre, com) => pre + espacos(com))
    .replace(/\/\*[\s\S]*?\*\//g, espacos);
}
