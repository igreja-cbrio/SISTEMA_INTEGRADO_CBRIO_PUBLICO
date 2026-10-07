import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';












export default function FotoLightboxGlobal() {
  const [foto, setFoto] = useState(null);

  useEffect(() => {
    function aoClicar(e) {
      const img = e.target?.closest?.('img[data-foto-avatar]');
      if (!img) return;
      const url = img.currentSrc || img.src;
      if (!url) return;
      if (img.closest('button, a, [role="menuitem"], [role="button"], [data-foto-skip]')) return;
      e.preventDefault();
      e.stopPropagation();
      setFoto({ url, nome: img.alt || 'Foto' });
    }
    document.addEventListener('click', aoClicar, true);
    return () => document.removeEventListener('click', aoClicar, true);
  }, []);

  return (
    <Dialog open={!!foto} onOpenChange={(v) => { if (!v) setFoto(null); }}>
      {                                                                           }
      <DialogContent className="max-w-lg z-[1100]">
        <DialogHeader>
          <DialogTitle className="truncate">{foto?.nome || 'Foto'}</DialogTitle>
        </DialogHeader>
        {foto ? (
          <img
            src={foto.url}
            alt={foto.nome}
            className="w-full max-h-[70vh] object-contain rounded-lg bg-muted"
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
