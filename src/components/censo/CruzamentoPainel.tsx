





import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertTriangle, Filter, Loader2, Users, X } from 'lucide-react';
import { contemNormalizado } from '@/lib/busca';
import {
  ROTULO_VALOR, VALORES_CENSO, resumirValores,
  type PessoaCruzamento, type ValorCenso,
} from '@/lib/censoCruzamento';

export type FiltroRotulado = {
  campo: string;
  campoLabel: string;
  valores: { valor: string; label: string }[];
};

const LOTE_LISTA = 100;

export default function CruzamentoPainel({
  carregando, erro, total, filtradas, filtrando, filtros, onRemover, onLimpar,
  generosidadeVisivel, valoresIndisponiveis, sensiveisFora,
}: {
  carregando: boolean;
  erro: string | null;
  total: number;
  filtradas: PessoaCruzamento[];
  filtrando: boolean;
  filtros: FiltroRotulado[];
  onRemover: (campo: string, valor: string) => void;
  onLimpar: () => void;
  generosidadeVisivel: boolean;
  valoresIndisponiveis: string[];
  sensiveisFora: boolean;
}) {
  const [buscaPessoa, setBuscaPessoa] = useState('');
  const [limite, setLimite] = useState(LOTE_LISTA);

  const resumo = useMemo(
    () => resumirValores(filtradas, generosidadeVisivel),
    [filtradas, generosidadeVisivel],
  );

  const pessoas = useMemo(() => {
    const ordenadas = [...filtradas].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    const t = buscaPessoa.trim();
    return t ? ordenadas.filter((p) => contemNormalizado(p.nome, t)) : ordenadas;
  }, [filtradas, buscaPessoa]);

  if (carregando) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" /> Preparando o filtro…
        </CardContent>
      </Card>
    );
  }
  if (erro) {

    return (
      <Card>
        <CardContent className="p-4 text-sm text-amber-600 dark:text-amber-500 flex items-start gap-2">
          <AlertTriangle className="size-4 mt-0.5 shrink-0" />
          <span>Não foi possível carregar o filtro ({erro}). Os gráficos abaixo continuam valendo.</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div>
          <p className="text-sm">
            <span className="font-semibold text-foreground">{filtradas.length}</span>
            <span className="text-muted-foreground"> de {total} respostas</span>
          </p>
          {!filtrando && (
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed flex gap-1.5">
              <Filter className="size-3.5 mt-0.5 shrink-0" />
              <span>
                Toque numa resposta para filtrar. Pode marcar várias: respostas da mesma pergunta
                somam; perguntas diferentes se cruzam.
              </span>
            </p>
          )}
        </div>

        {filtrando && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">Filtrando por</p>
              <button type="button" onClick={onLimpar}
                className="text-xs text-primary hover:underline">Limpar tudo</button>
            </div>
            <div className="space-y-1.5">
              {filtros.map((f) => (
                <div key={f.campo} className="text-xs">
                  <p className="text-muted-foreground truncate" title={f.campoLabel}>{f.campoLabel}</p>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {f.valores.map((v) => (
                      <button key={v.valor} type="button" onClick={() => onRemover(f.campo, v.valor)}
                        className="inline-flex items-center gap-1 rounded-full bg-primary/15 text-primary px-2 py-0.5 hover:bg-primary/25"
                        title="Tirar do filtro">
                        <span className="max-w-[200px] truncate">{v.label}</span>
                        <X className="size-3" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">
            5 valores {filtrando ? 'de quem está no filtro' : 'de quem respondeu'}
          </p>
          <div className="space-y-1.5">
            {resumo.valores.map((v) => (
              <div key={v.chave} title={ROTULO_VALOR[v.chave].ajuda}>
                <div className="flex items-baseline justify-between text-xs">
                  <span>{ROTULO_VALOR[v.chave].label}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {valoresIndisponiveis.includes(v.chave) ? 'indisponível' : `${v.pct}% · ${v.total}`}
                  </span>
                </div>
                <div className="h-1.5 rounded bg-muted overflow-hidden mt-0.5">
                  <div className="h-full bg-primary/75" style={{ width: `${v.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
            Sobre {resumo.base} pessoa{resumo.base === 1 ? '' : 's'} com cadastro ligado.
            Conta quem está no módulo ou teve alguma interação nos últimos 12 meses.
            {resumo.sem_cadastro > 0 && (
              <> {resumo.sem_cadastro} responderam sem cadastro ligado e ficam fora desta conta.</>
            )}
            {!generosidadeVisivel && <> Generosidade só aparece para quem tem acesso ao financeiro.</>}
          </p>
          {valoresIndisponiveis.length > 0 && (
            <p className="text-[11px] text-amber-600 dark:text-amber-500 mt-1.5">
              Parte dos valores não carregou agora — o número pode estar menor do que é.
            </p>
          )}
        </div>

        {sensiveisFora && (
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            As perguntas sensíveis ficam fora do filtro para quem não tem acesso ao bloco sensível.
          </p>
        )}

        {filtrando && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Users className="size-3.5" /> Quem são ({filtradas.length})
            </p>
            {filtradas.length > 8 && (
              <Input value={buscaPessoa} onChange={(e) => { setBuscaPessoa(e.target.value); setLimite(LOTE_LISTA); }}
                placeholder="Procurar um nome" className="h-8 text-xs" />
            )}
            {pessoas.length === 0 ? (
              <p className="text-xs text-muted-foreground">Ninguém neste recorte.</p>
            ) : (
              <ul className="space-y-1 max-h-[420px] overflow-y-auto pr-1">
                {pessoas.slice(0, limite).map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate" title={p.nome}>{p.nome}</span>
                    <MarcasValores pessoa={p} generosidadeVisivel={generosidadeVisivel} />
                  </li>
                ))}
              </ul>
            )}
            {pessoas.length > limite && (
              <Button variant="ghost" size="sm" className="w-full h-7 text-xs"
                onClick={() => setLimite((l) => l + LOTE_LISTA)}>
                Mostrar mais {Math.min(LOTE_LISTA, pessoas.length - limite)} de {pessoas.length - limite}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const SIGLA: Record<ValorCenso, string> = {
  seguir: 'S', conectar: 'G', investir: 'I', servir: 'V', generosidade: '$',
};

function MarcasValores({ pessoa, generosidadeVisivel }: { pessoa: PessoaCruzamento; generosidadeVisivel: boolean }) {
  if (!pessoa.v) {
    return <span className="text-[10px] text-muted-foreground shrink-0">sem cadastro</span>;
  }
  return (
    <span className="flex gap-0.5 shrink-0">
      {VALORES_CENSO.filter((k) => k !== 'generosidade' || generosidadeVisivel).map((k) => {
        const tem = pessoa.v?.[k] === true;
        return (
          <span key={k} title={`${ROTULO_VALOR[k].label}: ${tem ? 'sim' : 'não'}`}
            className={`size-4 rounded text-[9px] leading-4 text-center font-semibold ${
              tem ? 'bg-primary/80 text-primary-foreground' : 'bg-muted text-muted-foreground/60'}`}>
            {SIGLA[k]}
          </span>
        );
      })}
    </span>
  );
}
