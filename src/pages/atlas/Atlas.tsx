import { useEffect, useMemo } from 'react';



import atlasHtml from './atlas.html?raw';








export default function Atlas({ initialHash }: { initialHash?: string }) {
  useEffect(() => {
    const anterior = document.title;
    document.title = (initialHash === '#fluxograma' ? 'Fluxograma · ' : '') + 'Atlas operacional · CBRio';
    return () => { document.title = anterior; };
  }, [initialHash]);

  const doc = useMemo(() => {
    const hashScript = initialHash
      ? '<script>try{location.hash=' + JSON.stringify(initialHash) + ';}catch(e){}</script>'
      : '';
    return '<!doctype html><html lang="pt-br"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' +
      hashScript + atlasHtml + '</body></html>';
  }, [initialHash]);

  return (
    <iframe
      title="Atlas operacional CBRio"
      srcDoc={doc}
      sandbox="allow-scripts allow-same-origin"
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', border: 'none', background: '#eef2f1' }}
    />
  );
}
