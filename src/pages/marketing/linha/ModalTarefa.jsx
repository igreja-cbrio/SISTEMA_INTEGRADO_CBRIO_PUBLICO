import { useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import { NOME_FRENTE, ddmm, ddmmaaaa, rotuloCulto, nomeMembro, ehFrenteRotina, origemDaTarefa, ROTULO_ORIGEM } from './layout';
import { tituloTarefa } from './CartaoTarefa';
import ListaSubtarefas from './ListaSubtarefas';

function semanaTexto(dados, n) {
  if (n === 0) return `Antes de ${dados.ano}`;
  if (n == null) return 'Sem data';
  const w = (dados.semanas || []).find(s => s.n === n);
  return w ? `Semana ${n} · ${ddmm(w.inicio)} a ${ddmm(w.fim)}` : `Semana ${n}`;
}

function Fato({ rotulo, children }) {
  return (
    <span className="text-xs text-muted-foreground">
      <b className="mr-1 text-[10px] uppercase tracking-wider font-semibold">{rotulo}</b>{children}
    </span>
  );
}





export default function ModalTarefa({ tarefa, dados, onClose, onChanged, onEditar, somenteLeitura = false }) {
  const escRef = useRef(null);
  if (!tarefa) return null;
  const membros = dados.membros || [];
  const ehRotina = ehFrenteRotina(tarefa.frente);
  const origem = origemDaTarefa(tarefa);
  const itens = tarefa.itens || [];
  const donoId = ehRotina ? tarefa.membro_id : tarefa.atribuido_a;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        className="max-w-xl max-h-[90vh] flex flex-col"
        onEscapeKeyDown={(e) => { if (escRef.current?.()) e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogDescription className="text-xs">
            {NOME_FRENTE[tarefa.frente] || 'Tarefa'}{origem ? ` · ${ROTULO_ORIGEM[origem]}` : ''} · {semanaTexto(dados, tarefa.semana)}
          </DialogDescription>
          <DialogTitle className="text-lg">{tituloTarefa(tarefa, membros)}</DialogTitle>
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
            {tarefa.prazo && <Fato rotulo="Prazo">{ddmmaaaa(tarefa.prazo)}</Fato>}
            {tarefa.entrega_final && <Fato rotulo="Entrega final">{ddmmaaaa(tarefa.entrega_final)}</Fato>}
            {!ehRotina && tarefa.culto && <Fato rotulo="Culto">{rotuloCulto(tarefa.culto)}</Fato>}
            <Fato rotulo={ehRotina ? 'Pessoa' : 'Responsável'}>
              {donoId ? nomeMembro(membros, donoId) : 'Sem responsável'}
            </Fato>
            {itens.length > 0 && (
              <Fato rotulo="Feito">{itens.filter(i => i.feito).length} de {itens.length}</Fato>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 space-y-4 pr-1">
          {tarefa.pedido && (
            <section className="space-y-1">
              <h3 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Pedido original</h3>
              <div className="border-l-2 border-border pl-3 text-sm">
                {tarefa.pedido.titulo && <p className="font-medium">{tarefa.pedido.titulo}</p>}
                {tarefa.pedido.descricao && <p className="text-muted-foreground whitespace-pre-wrap">{tarefa.pedido.descricao}</p>}
                {tarefa.pedido.data_necessaria && (
                  <p className="text-xs text-muted-foreground mt-1">Pedido para {ddmmaaaa(tarefa.pedido.data_necessaria)}</p>
                )}
              </div>
            </section>
          )}

          {!ehRotina && tarefa.descricao && (
            <section className="space-y-1">
              <h3 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Descrição</h3>
              <p className="text-sm whitespace-pre-wrap">{tarefa.descricao}</p>
            </section>
          )}

          <section className="space-y-2">
            <h3 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
              {ehRotina ? 'Compromissos da semana' : 'Subtarefas'}
            </h3>
            <ListaSubtarefas tarefa={tarefa} dados={dados} somenteLeitura={somenteLeitura} onChanged={onChanged} escRef={escRef} />
          </section>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          {onEditar && !ehRotina && !somenteLeitura && <Button variant="outline" onClick={onEditar}>Editar</Button>}
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
