import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import MarketingPagina from './MarketingPagina';
import { ComunicadosConteudo } from './MarketingComunicados';
import Destaques from '../admin/Destaques';
import FotosBatismo from '../admin/FotosBatismo';
import { Megaphone, Images, Camera, Lock } from 'lucide-react';























const ABAS = [
  { key: 'comunicados', label: 'Comunicados', icon: Megaphone },
  { key: 'destaques',   label: 'Destaques',   icon: Images },
  { key: 'batismo',     label: 'Fotos Batismo', icon: Camera },
];

const SUBTITULO = {
  comunicados: 'Avisos do mural do app · publicar manda push pro público escolhido',
  destaques: 'Carrossel de fotos da Home do app · atualiza sozinho em até 10 minutos',
  batismo: 'Álbum do dia · aparece na aba Batismo do app para quem foi batizado',
};

export default function MarketingApp() {
  const { canAccessModule } = useAuth();


  const podeEditar = canAccessModule(['marketing'], 'escrita', 3);

  const [params, setParams] = useSearchParams();
  const daUrl = params.get('t');
  const inicial = ABAS.some(a => a.key === daUrl) ? daUrl : 'comunicados';
  const [aba, setAba] = useState(inicial);

  function trocar(k) {
    setAba(k);


    const p = new URLSearchParams(params);
    if (k === 'comunicados') p.delete('t'); else p.set('t', k);
    setParams(p, { replace: true });
  }

  const abaAtual = ABAS.some(a => a.key === aba) ? aba : 'comunicados';

  return (
    <MarketingPagina subtitulo={SUBTITULO[abaAtual]}>
      {                                                            }
      <div className="flex flex-wrap gap-1 border-b border-border">
        {ABAS.map(a => {
          const Icon = a.icon;
          const ativo = abaAtual === a.key;
          return (
            <button
              key={a.key}
              type="button"
              onClick={() => trocar(a.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                ativo
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              <Icon className="h-4 w-4" /> {a.label}
            </button>
          );
        })}
      </div>

      {abaAtual === 'comunicados' && <ComunicadosConteudo />}

      {


                                                                              }
      {abaAtual === 'destaques' && <Destaques embutido podeEditar={podeEditar} />}
      {abaAtual === 'batismo' && <FotosBatismo embutido podeEditar={podeEditar} />}

      {!podeEditar && (
        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground border-t border-border pt-3">
          <Lock className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          Você está vendo em modo leitura: publicar, editar e excluir exigem nível 3
          no módulo Marketing. Fale com o Marcos se precisar publicar.
        </p>
      )}
    </MarketingPagina>
  );
}
