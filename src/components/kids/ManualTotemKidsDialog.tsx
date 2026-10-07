






import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

export function ManualTotemKidsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [texto, setTexto] = useState<string | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    if (!open || texto !== null) return;
    let vivo = true;
    import('../../../docs/totem-kids-manual.md?raw')
      .then((m) => { if (vivo) setTexto(m.default); })
      .catch(() => { if (vivo) setErro(true); });
    return () => { vivo = false; };
  }, [open, texto]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Manual do Totem Kids</DialogTitle>
          <DialogDescription>Como operar o check-in, a etiqueta e a retirada das crianças.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto min-h-0 pr-1">
          {erro ? (
            <p className="text-sm text-destructive">Não foi possível abrir o manual. Recarregue a página e tente de novo.</p>
          ) : texto === null ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
          ) : (
            <article className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{texto}</ReactMarkdown>
            </article>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
