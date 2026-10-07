import { useEffect, useRef, useState } from 'react';
import { Loader2, AlertCircle, Plus } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';
import { marketing, marketingLinha } from '../../../api';
import { ddmm, nomeMembro, textoEsforco, ehFrenteRotina } from './layout';
import EntregaArquivos from './EntregaArquivos';










const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export default function ListaSubtarefas({ tarefa, dados, somenteLeitura = false, onChanged, escRef }) {
  const [marcando, setMarcando] = useState(null);
  const [override, setOverride] = useState({});
  const [erro, setErro] = useState(null);
  const [registroDe, setRegistroDe] = useState(null);
  const [registroTexto, setRegistroTexto] = useState('');
  const [novaAberta, setNovaAberta] = useState(false);
  const [novaTexto, setNovaTexto] = useState('');
  const [criando, setCriando] = useState(false);
  const novaRef = useRef(null);


  const arquivoRefs = useRef({});
  const [pedeArquivo, setPedeArquivo] = useState(null);


  useEffect(() => { setOverride({}); }, [tarefa]);




  useEffect(() => {
    if (!escRef || !novaAberta) return undefined;
    const fechar = () => { setNovaAberta(false); setNovaTexto(''); return true; };
    escRef.current = fechar;
    return () => { if (escRef.current === fechar) escRef.current = null; };
  }, [escRef, novaAberta]);

  const membros = dados.membros || [];
  const ehRotina = ehFrenteRotina(tarefa.frente);


  const rotinaTravada = ehRotina && dados.frentes?.[tarefa.frente]?.marcavel === false;
  const itens = tarefa.itens || [];
  const hoje = dados.hoje;
  const algumBloqueado = !somenteLeitura && !ehRotina && itens.some(i => i.pode_marcar === false);


  const podeCriar = !somenteLeitura && !ehRotina && tarefa.tipo !== 'pedido' && tarefa.pode_criar_item === true;

  async function gravar(item, feito, registro) {
    if (somenteLeitura) return;
    setMarcando(item.id);
    setErro(null);
    setOverride(o => ({ ...o, [item.id]: feito }));
    try {
      if (ehRotina) {
        if (feito) await marketingLinha.marcarRotina(item.compromisso_id, tarefa.semana_inicio, item.membro_id);
        else await marketingLinha.desmarcarRotina(item.compromisso_id, tarefa.semana_inicio, item.membro_id);
      } else {
        await marketing.checklist.update(item.id, registro !== undefined ? { feito, registro } : { feito });
      }
      setRegistroDe(null);
      setRegistroTexto('');
      await onChanged();
    } catch (e) {
      setOverride(o => { const n = { ...o }; delete n[item.id]; return n; });
      if (e?.codigo === 'registro_obrigatorio') {
        setRegistroDe(item.id);
        setRegistroTexto(item.registro || '');
      } else if (e?.codigo === 'arquivo_obrigatorio') {
        setPedeArquivo(item.id);
      } else {
        setErro(e?.message || 'Não foi possível salvar.');
      }
    } finally {
      setMarcando(null);
    }
  }

  function aoMarcar(item, feito) {
    if (feito && item.exige_arquivo && !(item.arquivos || []).length) {
      setPedeArquivo(item.id);
      arquivoRefs.current[item.id]?.abrir();
      return;
    }
    if (feito && item.exige_registro && !(item.registro || '').trim()) {
      setRegistroDe(item.id);
      setRegistroTexto('');
      return;
    }
    gravar(item, feito);
  }

  function fecharNova() {
    setNovaAberta(false);
    setNovaTexto('');
  }

  async function criarSubtarefa() {
    const texto = novaTexto.trim();
    if (!texto || criando) return;
    setCriando(true);
    setErro(null);
    try {



      await marketing.checklist.create(tarefa.id, tarefa.atribuido_a ? { texto, membro_id: tarefa.atribuido_a } : { texto });
      setNovaTexto('');
      await onChanged();

      novaRef.current?.focus();
    } catch (e) {
      setErro(e?.message || 'Não foi possível adicionar a tarefa.');
    } finally {
      setCriando(false);
    }
  }

  let grupoAnterior;
  return (
    <div className="space-y-2">
      {somenteLeitura && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Você está vendo como outra pessoa: somente leitura. Para marcar, volte para a sua visão.
        </p>
      )}
      {algumBloqueado && (
        <p className="text-xs text-muted-foreground">Nesta etapa quem marca é o líder do Marketing.</p>
      )}
      {rotinaTravada && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          A rotina ainda não pode ser marcada: falta aplicar a migration da Fase 3.
        </p>
      )}
      {erro && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" /> {erro}
        </div>
      )}
      {itens.length === 0 && !podeCriar && <p className="text-sm text-muted-foreground">Esta tarefa não tem subtarefas.</p>}
      <ul className="space-y-1.5">
        {itens.map(item => {
          const feito = override[item.id] ?? item.feito;
          const bloqueado = somenteLeitura || rotinaTravada || item.pode_marcar === false;
          const quem = nomeMembro(membros, item.membro_id);
          const esforco = textoEsforco(item.esforco_valor, item.esforco_unidade);
          const atrasado = !feito && item.prazo && hoje && item.prazo < hoje;
          const cabecalho = !ehRotina && item.grupo && item.grupo !== grupoAnterior ? item.grupo : null;
          grupoAnterior = item.grupo;
          const horaRot = ehRotina
            ? [DIAS[item.dia_semana], item.hora_inicio ? String(item.hora_inicio).slice(0, 5) : null].filter(Boolean).join(' ')
            : null;
          return (
            <li key={item.id}>
              {cabecalho && <p className="text-xs font-semibold mt-2 mb-1">{cabecalho}</p>}
              <div className={`rounded-lg border border-border bg-muted/40 px-3 py-2 ${bloqueado ? 'opacity-80' : ''}`}>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 accent-[#00B39D] dark:accent-[hsl(var(--lab-azul,243_98%_49%))]"
                    checked={!!feito}
                    disabled={bloqueado || marcando === item.id}
                    title={!bloqueado ? undefined
                      : somenteLeitura ? 'Visão emprestada: somente leitura'
                        : ehRotina ? 'Só a própria pessoa ou o líder do Marketing marca esta rotina'
                          : 'Nesta etapa quem marca é o líder do Marketing'}
                    onChange={(e) => aoMarcar(item, e.target.checked)}
                  />
                  <span className={`flex-1 text-sm ${feito ? 'line-through text-muted-foreground' : ''}`}>
                    {item.texto || 'Sem descrição'}
                    {item.exige_registro && <span className="ml-1 text-[10px] uppercase text-muted-foreground">· exige registro</span>}
                    {item.exige_arquivo && <span className="ml-1 text-[10px] uppercase text-muted-foreground">· entrega com arquivo</span>}
                  </span>
                  {marcando === item.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 pl-7 text-[11px] text-muted-foreground">
                  {horaRot && <span>{horaRot}</span>}
                  {!ehRotina && <span>{quem || 'Sem responsável'}</span>}
                  {esforco && <span>{esforco}</span>}
                  {item.prazo && <span>até {ddmm(item.prazo)}</span>}
                  {atrasado && <span className="font-semibold text-destructive">Atrasada</span>}
                </div>
                {
                                                          }
                {item.plano && (
                  <div className="mt-1 pl-7 space-y-0.5 text-xs text-muted-foreground">
                    {item.plano.ref_url && (
                      <p className="break-all">Ref: <a href={item.plano.ref_url} target="_blank" rel="noreferrer" className="underline">{item.plano.ref_url}</a></p>
                    )}
                    {(item.plano.ref_arquivos || []).map((r, j) => (
                      <p key={`${r.web_url}-${j}`} className="break-all">Ref: <a href={r.web_url} target="_blank" rel="noreferrer" className="underline">{r.nome}</a></p>
                    ))}
                    {item.plano.descricao && <p className="whitespace-pre-wrap">{item.plano.descricao}</p>}
                  </div>
                )}
                {item.registro && registroDe !== item.id && (
                  <p className="mt-1 pl-7 text-xs italic text-muted-foreground whitespace-pre-wrap">Registro: {item.registro}</p>
                )}
                {registroDe === item.id && (
                  <div className="mt-2 pl-7 space-y-2">
                    <label className="text-xs font-medium" htmlFor={`reg-${item.id}`}>Registro (obrigatório para concluir)</label>
                    <Textarea
                      id={`reg-${item.id}`}
                      rows={3}
                      value={registroTexto}
                      onChange={(e) => setRegistroTexto(e.target.value)}
                      placeholder="Escreva o que foi decidido ou feito"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={!registroTexto.trim() || marcando === item.id}
                        onClick={() => gravar(item, true, registroTexto.trim())}
                      >
                        Salvar e concluir
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setRegistroDe(null); setRegistroTexto(''); }}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
                {item.aceita_arquivo && (
                  <EntregaArquivos
                    ref={(el) => { arquivoRefs.current[item.id] = el; }}
                    item={item}
                    alvo={ehRotina
                      ? { compromisso_id: item.compromisso_id, semana_inicio: tarefa.semana_inicio, membro_id: item.membro_id }
                      : { item_id: item.id }}
                    bloqueado={bloqueado}
                    onChanged={onChanged}
                    onFaltaRegistro={() => { setRegistroDe(item.id); setRegistroTexto(item.registro || ''); }}
                  />
                )}
                {pedeArquivo === item.id && !feito && !(item.arquivos || []).length && (
                  <p className="mt-1 pl-7 text-xs text-amber-700 dark:text-amber-400" role="status">
                    Esta entrega fica feita com o arquivo: escolha o arquivo e ele sobe para o SharePoint já marcando.
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {podeCriar && (novaAberta ? (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2">
          <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            ref={novaRef}
            autoFocus
            aria-label="Nova tarefa"
            className="h-8 flex-1"
            value={novaTexto}
            disabled={criando}
            placeholder="Escreva a tarefa e tecle Enter"
            onChange={(e) => setNovaTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); criarSubtarefa(); }
            }}
          />
          <Button size="sm" className="h-8" disabled={!novaTexto.trim() || criando} onClick={criarSubtarefa}>
            {criando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Adicionar'}
          </Button>
          <Button size="sm" variant="ghost" className="h-8" disabled={criando} onClick={fecharNova}>Cancelar</Button>
        </div>
      ) : (
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-left text-sm text-muted-foreground hover:border-primary hover:text-foreground"
          onClick={() => { setErro(null); setNovaAberta(true); }}
          aria-label="Adicionar uma tarefa no fim da lista"
        >
          <Plus className="h-4 w-4 shrink-0" /> tarefa
        </button>
      ))}
    </div>
  );
}
