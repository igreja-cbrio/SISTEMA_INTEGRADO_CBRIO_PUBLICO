













import { useState } from 'react';

export type StatusAvatar = 'confirmed' | 'declined' | 'pending';

const CLASSE: Record<StatusAvatar, string> = {
  confirmed: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  declined: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  pending: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};


export function iniciais(nome: string): string {
  const p = String(nome || '').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

export default function AvatarVoluntario({
  nome, fotoUrl, status = 'pending', tamanho = 28, neutro = false,
}: {
  nome: string;
  fotoUrl?: string | null;
  status?: StatusAvatar;

  tamanho?: number;

  neutro?: boolean;
}) {



  const [quebrou, setQuebrou] = useState(false);
  const mostrarFoto = !!fotoUrl && !quebrou;
  const fundo = neutro ? 'bg-muted text-muted-foreground' : CLASSE[status] || CLASSE.pending;

  return (
    <span
      className={`shrink-0 rounded-full flex items-center justify-center font-semibold overflow-hidden ${mostrarFoto ? 'bg-muted' : fundo}`}
      style={{ width: tamanho, height: tamanho, fontSize: Math.max(9, Math.round(tamanho * 0.38)) }}
      title={nome}
    >
      {mostrarFoto ? (
        <img
          data-foto-avatar=""
          src={fotoUrl as string}
          alt={nome}
          loading="lazy"
          onError={() => setQuebrou(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        iniciais(nome)
      )}
    </span>
  );
}
