











import { useState, useMemo } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandItem } from '../ui/command';
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar';


const TONS = ['#0f766e', '#1d4ed8', '#7c3aed', '#b45309', '#be123c', '#0e7490', '#4d7c0f', '#a21caf'];

function tomDoNome(nome) {
  let h = 0;
  for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) | 0;
  return TONS[Math.abs(h) % TONS.length];
}

function iniciais(nome) {
  const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

function Foto({ nome, url, tamanho = 24 }) {
  return (
    <Avatar style={{ width: tamanho, height: tamanho, flex: '0 0 auto' }}>
      {url && <AvatarImage src={url} alt="" />}
      <AvatarFallback
        style={{ background: tomDoNome(String(nome || '')), color: '#fff', fontSize: tamanho * 0.4 }}
      >
        {iniciais(nome)}
      </AvatarFallback>
    </Avatar>
  );
}













export default function SeletorResponsavel({ valores, colaboradores, onChange, cores }) {
  const [aberto, setAberto] = useState(false);
  const C = cores;
  const lista = Array.isArray(valores) ? valores.filter(Boolean) : [];





  const porNome = useMemo(() => {
    const m = new Map();
    for (const c of colaboradores) m.set(String(c.name || '').trim().toLowerCase(), c);
    return m;
  }, [colaboradores]);

  const perfilDe = (nome) => porNome.get(String(nome || '').trim().toLowerCase()) || null;
  const selecionado = (nome) => lista.some((v) => v.toLowerCase() === String(nome || '').toLowerCase());

  const alternar = (nome) => {
    onChange(selecionado(nome) ? lista.filter((v) => v.toLowerCase() !== nome.toLowerCase()) : [...lista, nome]);
  };

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-xs rounded-md px-2 py-1 border flex items-center gap-1.5 min-w-52 max-w-72 text-left"
          style={{ background: C.inputBg, borderColor: C.border, color: lista.length ? C.text : C.t3 }}
        >
          {lista.length === 0 ? (
            <><span className="flex-1">responsável…</span><ChevronsUpDown size={13} style={{ color: C.t3 }} /></>
          ) : (
            <>
              {

                                                   }
              <span className="flex -space-x-1.5 flex-none">
                {lista.slice(0, 4).map((nome) => (
                  <span key={nome} title={nome} style={{ borderRadius: 999, outline: `2px solid ${C.inputBg}` }}>
                    <Foto nome={nome} url={perfilDe(nome)?.avatar_url} tamanho={20} />
                  </span>
                ))}
              </span>
              <span className="truncate flex-1" title={lista.join(', ')}>
                {lista.length === 1 ? lista[0] : `${lista.length} responsáveis`}
              </span>
              <span
                role="button"
                tabIndex={0}
                aria-label="remover todos os responsáveis"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onChange([]); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onChange([]); }
                }}
                style={{ display: 'flex', color: C.t3 }}
              >
                <X size={13} />
              </span>
            </>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent className="p-0 w-72" align="start">
        <Command>
          <CommandInput placeholder="Buscar colaborador…" />
          <CommandList>
            <CommandEmpty>Ninguém encontrado.</CommandEmpty>

            {

                                                                            }
            {lista.filter((n) => !perfilDe(n)).map((nome) => (
              <CommandItem key={`livre-${nome}`} value={nome} onSelect={() => alternar(nome)}
                           className="flex items-center gap-2">
                <Foto nome={nome} url={null} />
                <span className="flex-1 truncate text-sm">{nome}</span>
                <span className="text-[10px] uppercase" style={{ color: C.t3 }}>da ata</span>
                <Check size={14} style={{ color: C.primary }} />
              </CommandItem>
            ))}

            {colaboradores.map((c) => (
              <CommandItem
                key={c.id}
                value={c.name || ''}
                onSelect={() => alternar(c.name)}
                className="flex items-center gap-2"
              >
                <Foto nome={c.name} url={c.avatar_url} />
                <span className="flex-1 truncate text-sm">{c.name}</span>
                {c.area && <span className="text-[10px] uppercase" style={{ color: C.t3 }}>{c.area}</span>}
                {selecionado(c.name) && <Check size={14} style={{ color: C.primary }} />}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
