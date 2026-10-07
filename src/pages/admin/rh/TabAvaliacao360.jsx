import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, CircleAlert, Mail, Plus, RefreshCw, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';
import { avaliacao360 } from '../../../api';
import Resultado360, { Entrega, NoveBox } from '../../../components/avaliacao360/Resultado360';
import Pesos from '../../../components/avaliacao360/Pesos';
import Perguntas, { Escala } from '../../../components/avaliacao360/Perguntas';
import Participantes from '../../../components/avaliacao360/Participantes';
import Configuracoes from '../../../components/avaliacao360/Configuracoes';
import { MapaEquipe } from '../../../components/avaliacao360/Graficos';
import { exportCSV } from '../../../lib/export';
import '../../../components/avaliacao360/tema.css';







const FASES = [
  ['rascunho', 'Montagem'],
  ['coleta', 'Respostas'],
  ['apuracao', 'Apuração'],
  ['publicado', 'Publicado'],
  ['encerrado', 'Encerrado'],
];
const NOME_FASE = { ...Object.fromEntries(FASES), indicacao: 'Indicação' };
const ACAO_FASE = {
  coleta: ['apuracao', 'Encerrar respostas', 'Ninguém mais consegue responder. Os resultados ficam visíveis só para o RH.'],
  apuracao: ['publicado', 'Publicar resultados', 'Cada gestor passa a ver o resultado dos liderados e as notas não mudam mais.'],
  publicado: ['encerrado', 'Encerrar ciclo', 'O ciclo vira histórico.'],
};
const PAPEL = { auto: 'Autoavaliação', gestor: 'Gestor', par: 'Pares', liderado: 'Liderados' };
const ROTULOS_6 = ['Discordo totalmente', 'Discordo', 'Discordo em parte', 'Concordo em parte', 'Concordo', 'Concordo totalmente'];
const TEXTO_PADRAO = `Chegou o momento do nosso ciclo de Avaliação 360º. Você vai avaliar e ser avaliado(a) pelo seu gestor, pelos colegas da sua equipe e, se tiver, pelos seus liderados.

Seu nome nunca aparece junto das suas notas e comentários: a pessoa avaliada e o gestor dela leem o que foi escrito sem saber quem escreveu. Responda com sinceridade e, sempre que puder, com um exemplo real.`;

const hoje = () => new Date().toISOString().slice(0, 10);
const pct = (v) => Math.round(Number(v ?? 0) * 100);
const fmtDiaAno = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const fmtDia = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' }) : '—');


function Secao({ n, titulo, resumo, children, acao }) {
  return (
    <section className="rounded-2xl border bg-card">
      <header className="flex flex-wrap items-start gap-4 border-b px-5 py-4 sm:px-6">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{n}</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold leading-8">{titulo}</h3>
          {resumo && <p className="text-sm text-muted-foreground">{resumo}</p>}
        </div>
        {acao}
      </header>
      <div className="px-5 py-5 sm:px-6">{children}</div>
    </section>
  );
}

function Campo({ label, dica, children }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {dica && <span className="block text-xs text-muted-foreground">{dica}</span>}
    </label>
  );
}




function estadoInicial(ciclo) {
  return {
    nome: ciclo?.nome || `Avaliação 360º - ${new Date().getFullYear()}`,
    descricao: ciclo?.descricao ?? TEXTO_PADRAO,
    inicio: ciclo?.periodo_inicio || hoje(),
    prazo: ciclo?.coleta_ate || '',
    pesos: { gestor: pct(ciclo?.peso_gestor ?? 0.7), auto: pct(ciclo?.peso_auto ?? 0.15), outros: pct(ciclo?.peso_outros ?? 0.15) },
    escala_max: ciclo?.escala_max ?? 6,
    escala_rotulos: ciclo ? (ciclo.escala_rotulos || Array(ciclo.escala_max).fill('')) : ROTULOS_6,
  };
}

function corpoDoCiclo(f, rascunho) {
  const nomeados = f.escala_rotulos.filter((r) => r.trim()).length;
  if (rascunho && nomeados > 0 && nomeados < f.escala_max) return { erro: 'Dê nome a todos os pontos da escala, ou deixe todos em branco.' };
  if (rascunho && f.prazo && f.prazo < f.inicio) return { erro: 'O prazo precisa ser depois do início.' };
  if (!rascunho) return { corpo: { descricao: f.descricao || null, coleta_ate: f.prazo || null } };
  return {
    corpo: {
      nome: f.nome, descricao: f.descricao || null,
      periodo_inicio: f.inicio, periodo_fim: f.prazo || f.inicio, coleta_ate: f.prazo || null,
      peso_gestor: f.pesos.gestor / 100, peso_auto: f.pesos.auto / 100, peso_outros: f.pesos.outros / 100,
      escala_max: f.escala_max, escala_rotulos: nomeados ? f.escala_rotulos.map((r) => r.trim()) : null,
    },
  };
}

function DadosDoCiclo({ ciclo, onSalvo }) {
  const rascunho = ciclo.status === 'rascunho';
  const [f, setF] = useState(() => estadoInicial(ciclo));
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { setF(estadoInicial(ciclo)); }, [ciclo]);
  const sujo = JSON.stringify(f) !== JSON.stringify(estadoInicial(ciclo));
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function salvar() {
    const { corpo, erro } = corpoDoCiclo(f, rascunho);
    if (erro) return toast.error(erro);
    setSalvando(true);
    try { await avaliacao360.editarCiclo(ciclo.id, corpo); toast.success('Ciclo salvo.'); await onSalvo(); }
    catch (e) { toast.error(e.message); } finally { setSalvando(false); }
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-5 md:grid-cols-[2fr_1fr_1fr]">
        <Campo label="Nome do ciclo"><Input value={f.nome} onChange={set('nome')} disabled={!rascunho} /></Campo>
        <Campo label="Começa em" dica="A avaliação aparece para as pessoas a partir deste dia.">
          <Input type="date" value={f.inicio} onChange={set('inicio')} disabled={!rascunho} />
        </Campo>
        <Campo label="Prazo para responder" dica="Último dia para enviar as respostas.">
          <Input type="date" value={f.prazo} min={f.inicio} onChange={set('prazo')} />
        </Campo>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium">Peso de cada avaliação na nota final</p>
          <p className="text-xs text-muted-foreground">Arraste: os outros se ajustam e a soma fica sempre em 100%. Quem não responder tem o peso redistribuído.</p>
        </div>
        <Pesos valor={f.pesos} disabled={!rascunho} onChange={(pesos) => setF((s) => ({ ...s, pesos }))} />
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium">Forma de resposta</p>
        <Escala max={f.escala_max} rotulos={f.escala_rotulos} disabled={!rascunho}
          onChange={({ escala_max, escala_rotulos }) => setF((s) => ({ ...s, escala_max, escala_rotulos }))} />
      </div>

      <Campo label="Texto do convite" dica="Aparece no topo do formulário de quem responde.">
        <Textarea rows={5} value={f.descricao} onChange={set('descricao')} />
      </Campo>

      {sujo && (
        <div className="sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur">
          <span className="text-sm">Alterações não salvas nos dados do ciclo.</span>
          <span className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setF(estadoInicial(ciclo))}>Descartar</Button>
            <Button size="sm" disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar'}</Button>
          </span>
        </div>
      )}
    </div>
  );
}


function NovoCiclo({ onCriado, onCancelar }) {
  const [f, setF] = useState(() => estadoInicial(null));
  const [salvando, setSalvando] = useState(false);
  async function criar() {
    const { corpo, erro } = corpoDoCiclo(f, true);
    if (erro) return toast.error(erro);
    setSalvando(true);
    try {
      const r = await avaliacao360.criarCiclo(corpo);
      toast.success('Ciclo criado com as 8 perguntas do Feedz. Agora ajuste o que vamos avaliar e quem participa.');
      onCriado(r.id);
    } catch (e) { toast.error(e.message); } finally { setSalvando(false); }
  }
  return (
    <section className="rounded-2xl border bg-card p-6">
      <h3 className="text-lg font-semibold">Novo ciclo</h3>
      <p className="mb-5 text-sm text-muted-foreground">Ele nasce com os critérios, as perguntas, a escala e os pesos do ciclo 2026 do Feedz. Tudo é ajustável depois.</p>
      <div className="grid gap-5 md:grid-cols-[2fr_1fr_1fr]">
        <Campo label="Nome do ciclo"><Input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Campo>
        <Campo label="Começa em"><Input type="date" value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value })} /></Campo>
        <Campo label="Prazo para responder"><Input type="date" value={f.prazo} min={f.inicio} onChange={(e) => setF({ ...f, prazo: e.target.value })} /></Campo>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={onCancelar}>Cancelar</Button>
        <Button disabled={salvando || !f.nome.trim()} onClick={criar}>{salvando ? 'Criando…' : 'Criar ciclo'}</Button>
      </div>
    </section>
  );
}


function Envio({ ciclo, onEnviado }) {
  const [resumo, setResumo] = useState(null);
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    avaliacao360.avaliadores(ciclo.id).then((d) => setResumo({
      avaliados: d.pessoas.filter((p) => !p.avaliado.inativo).length,
      formularios: d.pessoas.reduce((n, p) => n + p.avaliadores.length, 0),
      alertas: d.pessoas.filter((p) => p.alertas.length).length,
    })).catch(() => setResumo({ avaliados: 0, formularios: 0, alertas: 0 }));
  }, [ciclo]);
  const itens = [
    [ciclo.perguntas?.length > 0, `${ciclo.perguntas?.length || 0} perguntas`],
    [!!resumo?.avaliados, `${resumo?.avaliados ?? '…'} pessoas avaliadas · ${resumo?.formularios ?? '…'} formulários`],
    [!!ciclo.coleta_ate && ciclo.coleta_ate >= hoje(), ciclo.coleta_ate ? `Respostas de ${fmtDia(ciclo.periodo_inicio)} a ${fmtDia(ciclo.coleta_ate)}` : 'Defina o prazo para responder'],
  ];
  const pronto = itens.every(([ok]) => ok);
  async function enviar() {
    setEnviando(true);
    try {
      const r = await avaliacao360.mudarStatus(ciclo.id, 'coleta');
      toast.success(`Enviado! As pessoas veem as avaliações em "Minhas Avaliações" a partir de ${fmtDia(ciclo.periodo_inicio)}.`
        + (r.suprimidos_abaixo_do_piso ? ` ${r.suprimidos_abaixo_do_piso} avaliações de pares/liderados com menos de 3 pessoas ficaram de fora.` : ''));
      onEnviado();
    } catch (e) { toast.error(e.message); } finally { setEnviando(false); }
  }
  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {itens.map(([ok, txt]) => (
          <li key={txt} className="flex items-center gap-2 text-sm">
            {ok ? <Check className="size-4 text-primary" /> : <CircleAlert className="size-4 a360-alerta" />}{txt}
          </li>
        ))}
        {resumo?.alertas > 0 && (
          <li className="flex items-center gap-2 text-sm a360-alerta">
            <CircleAlert className="size-4" />{resumo.alertas} pessoas com aviso na lista de avaliados (ex.: menos de 3 pares) — dá para enviar assim.
          </li>
        )}
      </ul>
      {!confirmando ? (
        <Button size="lg" disabled={!pronto} onClick={() => setConfirmando(true)}><Send className="mr-2 size-4" />Enviar para preencher</Button>
      ) : (
        <div className="space-y-3 rounded-xl a360-alerta-box p-4 text-sm">
          <p>Depois de enviar, <b>perguntas, escala, pesos e a lista de quem avalia quem ficam travados</b>. Pares e liderados com menos de 3 pessoas saem automaticamente, para proteger o sigilo.</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setConfirmando(false)}>Voltar</Button>
            <Button disabled={enviando} onClick={enviar}>{enviando ? 'Enviando…' : 'Enviar agora'}</Button>
          </div>
        </div>
      )}
    </div>
  );
}


function Adesao({ ciclo }) {
  const [d, setD] = useState(null);
  const carregar = useCallback(() => avaliacao360.adesao(ciclo.id).then(setD).catch((e) => toast.error(e.message)), [ciclo.id]);
  useEffect(() => { carregar(); }, [carregar]);
  if (!d) return null;
  const faltando = d.pessoas.filter((p) => p.pendentes > 0);
  const semPiso = d.suprimidos?.abaixo_do_piso || 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          Adesão
          <Button size="sm" variant="ghost" onClick={carregar}><RefreshCw className="size-3.5" /></Button>
        </CardTitle>
        <CardDescription>Quantas avaliações já foram respondidas. Não mostra notas.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {['auto', 'gestor', 'par', 'liderado'].filter((p) => d.por_papel[p]).map((p) => {
            const { total, respondidos } = d.por_papel[p];
            const v = total ? Math.round((respondidos / total) * 100) : 0;
            return (
              <div key={p} className="rounded-md border p-2.5">
                <p className="text-xs text-muted-foreground">{PAPEL[p]}</p>
                <p className="text-lg font-semibold">{v}%</p>
                <p className="text-xs text-muted-foreground">{respondidos} de {total}{total - respondidos > 0 && <> · {total - respondidos} não {total - respondidos === 1 ? 'respondeu' : 'responderam'}</>}</p>
                <div className="h-1 bg-muted rounded mt-1"><div className="h-1 bg-primary rounded" style={{ width: `${v}%` }} /></div>
              </div>
            );
          })}
        </div>
        {d.devendo && (d.devendo.auto + d.devendo.gestor + d.devendo.outros) > 0 && (
          <p className="text-sm">
            Ainda não responderam: <b>{d.devendo.auto}</b> {d.devendo.auto === 1 ? 'autoavaliação' : 'autoavaliações'} ·
            {' '}<b>{d.devendo.gestor}</b> {d.devendo.gestor === 1 ? 'gestor' : 'gestores'} · <b>{d.devendo.outros}</b> {d.devendo.outros === 1 ? 'pessoa' : 'pessoas'} entre pares e liderados.
          </p>
        )}
        {semPiso > 0 && <p className="text-xs text-muted-foreground">{semPiso} convites de par/liderado ficaram de fora ao enviar por não chegarem a 3 pessoas (sigilo).</p>}
        {ciclo.status === 'coleta' && <BotaoAviso ciclo={ciclo} tipo="pendentes" rotulo={`E-mail para quem tem pendência (${faltando.length})`} />}
        <div>
          <p className="text-sm font-medium mb-1">Com avaliações pendentes ({faltando.length})</p>
          {faltando.length === 0 && <p className="text-sm text-muted-foreground">Ninguém pendente.</p>}
          <div className="divide-y">
            {faltando.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm py-1.5">
                <span>{p.nome}<span className="text-xs text-muted-foreground ml-2">{p.area}</span></span>
                <span className="text-xs text-muted-foreground">{p.respondidos}/{p.total} · faltam {p.pendentes}</span>
              </div>
            ))}
          </div>
        </div>
        {(d.avaliados || []).length > 0 && <AdesaoPorAvaliado avaliados={d.avaliados} />}
      </CardContent>
    </Card>
  );
}



function AdesaoPorAvaliado({ avaliados }) {
  const [so, setSo] = useState(true);
  const falta = (a) => a.auto === false || ['gestor', 'par', 'liderado'].some((k) => a[k] && a[k].respondidos < a[k].total);
  const lista = so ? avaliados.filter(falta) : avaliados;
  const cel = (x) => (!x || !x.total ? <span className="text-muted-foreground">—</span>
    : <span className={x.respondidos < x.total ? 'a360-alerta' : 'text-muted-foreground'}>{x.respondidos}/{x.total}</span>);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-medium">Por avaliado</p>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={so} onChange={(e) => setSo(e.target.checked)} />só quem ainda tem resposta faltando
        </label>
      </div>
      {lista.length === 0 ? <p className="text-sm text-muted-foreground">Todas as avaliações sobre todos já chegaram.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground text-left">
                <th className="py-1.5 pr-2 font-medium">Avaliado</th>
                <th className="py-1.5 px-2 font-medium">Autoavaliação</th>
                <th className="py-1.5 px-2 font-medium text-right">Gestor</th>
                <th className="py-1.5 px-2 font-medium text-right">Pares</th>
                <th className="py-1.5 pl-2 font-medium text-right">Liderados</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {lista.map((a) => (
                <tr key={a.avaliado.id}>
                  <td className="py-1.5 pr-2">{a.avaliado.nome}</td>
                  <td className="py-1.5 px-2 text-xs">{a.auto == null ? <span className="text-muted-foreground">—</span> : a.auto ? <span className="text-muted-foreground">feita</span> : <span className="a360-alerta">pendente</span>}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{cel(a.gestor)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{cel(a.par)}</td>
                  <td className="py-1.5 pl-2 text-right tabular-nums">{cel(a.liderado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}



function BotaoAviso({ ciclo, tipo, rotulo }) {
  const [conf, setConf] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  async function enviar() {
    setOcupado(true);
    try {
      const r = await avaliacao360.avisar(ciclo.id, tipo);
      toast.success(`${r.enviados} e-mail${r.enviados === 1 ? '' : 's'} enviado${r.enviados === 1 ? '' : 's'}.`
        + (r.sem_email.length ? ` Sem e-mail no cadastro: ${r.sem_email.join(', ')}.` : '')
        + (r.falhas.length ? ` Falhou para: ${r.falhas.join(', ')}.` : ''));
      setConf(false);
    } catch (e) { toast.error(e.message); } finally { setOcupado(false); }
  }
  if (!conf) return <Button size="sm" variant="outline" onClick={() => setConf(true)}><Mail className="size-3.5 mr-1" />{rotulo}</Button>;
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      Enviar agora?
      <Button size="sm" variant="outline" onClick={() => setConf(false)}>Não</Button>
      <Button size="sm" disabled={ocupado} onClick={enviar}>{ocupado ? 'Enviando…' : 'Enviar'}</Button>
    </span>
  );
}



const n2 = (v) => (v == null ? '' : Number(v).toFixed(2).replace('.', ','));
const ENTREGA = (e, publicado) => (e?.devolutiva_dia ? 'devolutiva feita' : e?.liberado_em ? 'liberado' : publicado ? 'pendente' : '');

function Relatorios({ ciclo, lista }) {
  const publicado = ['publicado', 'encerrado'].includes(ciclo.status);
  const comNota = lista.filter((l) => l.final != null);
  const nomeArq = `avaliacao360_${ciclo.nome}`.replace(/[^\w-]+/g, '_');
  const criterios = comNota[0]?.criterios || [];

  const porArea = useMemo(() => {
    const m = new Map();
    for (const l of comNota) {
      const k = l.avaliado?.area || 'Sem área';
      const a = m.get(k) || { area: k, n: 0, soma: 0, res: [], comp: [] };
      a.n += 1; a.soma += Number(l.final);
      if (l.eixo_resultado != null) a.res.push(Number(l.eixo_resultado));
      if (l.eixo_comportamento != null) a.comp.push(Number(l.eixo_comportamento));
      m.set(k, a);
    }
    const media = (xs) => (xs.length ? xs.reduce((x, y) => x + y, 0) / xs.length : null);
    return [...m.values()].map((a) => ({ ...a, media: a.soma / a.n, mRes: media(a.res), mComp: media(a.comp) }))
      .sort((x, y) => y.media - x.media);
  }, [comNota]);

  const porCriterio = useMemo(() => criterios.map((c) => {
    const vals = comNota.map((l) => l.criterios.find((x) => x.competencia_id === c.competencia_id)?.final).filter((v) => v != null).map(Number);
    return { nome: c.nome, eixo: c.eixo, media: vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null, n: vals.length };
  }).sort((x, y) => (y.media ?? 0) - (x.media ?? 0)), [criterios, comNota]);

  function exportarRanking() {
    const ord = [...comNota].sort((a, b) => Number(b.final) - Number(a.final));
    exportCSV(['Posição', 'Pessoa', 'Cargo', 'Área', 'Nota final', 'Resultado', 'Comportamento', 'Quadrante', 'Calibrado', 'Entrega'],
      ord.map((l, i) => [i + 1, l.avaliado?.nome, l.avaliado?.cargo, l.avaliado?.area, n2(l.final), n2(l.eixo_resultado),
        n2(l.eixo_comportamento), l.quadrante, l.calibrado ? 'sim' : 'não', ENTREGA(l.entrega, publicado)]), `${nomeArq}_ranking`);
  }
  function exportarCriterios() {
    exportCSV(['Pessoa', 'Área', ...criterios.map((c) => c.nome), 'Nota final'],
      comNota.map((l) => [l.avaliado?.nome, l.avaliado?.area,
        ...criterios.map((c) => n2(l.criterios.find((x) => x.competencia_id === c.competencia_id)?.final)), n2(l.final)]),
      `${nomeArq}_por_criterio`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between gap-2 flex-wrap">
          Relatórios
          <span className="flex gap-2">
            <Button size="sm" variant="outline" onClick={exportarRanking} disabled={!comNota.length}>Exportar ranking</Button>
            <Button size="sm" variant="outline" onClick={exportarCriterios} disabled={!comNota.length}>Exportar por critério</Button>
          </span>
        </CardTitle>
        <CardDescription>Planilhas com notas FINAIS por pessoa. Respostas individuais não são exportadas — é o que garante o sigilo.</CardDescription>
      </CardHeader>
      <CardContent className="grid lg:grid-cols-2 gap-6">
        <div>
          <p className="text-sm font-medium mb-1">Média por área</p>
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-muted-foreground text-left">
              <th className="py-1 font-medium">Área</th><th className="py-1 font-medium text-right">Pessoas</th>
              <th className="py-1 font-medium text-right">Final</th><th className="py-1 font-medium text-right">Result.</th><th className="py-1 font-medium text-right">Comport.</th>
            </tr></thead>
            <tbody className="divide-y">
              {porArea.map((a) => (
                <tr key={a.area}>
                  <td className="py-1">{a.area}</td><td className="py-1 text-right tabular-nums">{a.n}</td>
                  <td className="py-1 text-right tabular-nums font-medium">{n2(a.media)}</td>
                  <td className="py-1 text-right tabular-nums">{n2(a.mRes)}</td><td className="py-1 text-right tabular-nums">{n2(a.mComp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <p className="text-sm font-medium mb-1">Média por critério (da maior para a menor)</p>
          <div className="space-y-2">
            {porCriterio.map((c) => (
              <div key={c.nome}>
                <div className="flex justify-between text-sm"><span>{c.nome}</span><span className="tabular-nums font-medium">{n2(c.media)}</span></div>
                <div className="h-1.5 rounded-full bg-muted" title={`${n2(c.media)} de ${ciclo.escala_max} · ${c.n} pessoas`}>
                  <div className="h-1.5 rounded-full bg-primary" style={{ width: `${c.media == null ? 0 : ((c.media - 1) / (ciclo.escala_max - 1)) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


function Resultados({ ciclo, semEntrega }) {
  const [lista, setLista] = useState(null);
  const [aberto, setAberto] = useState(null);
  const [detalhe, setDetalhe] = useState(null);
  const carregar = useCallback(() => avaliacao360.resultadosCiclo(ciclo.id).then(setLista).catch((e) => toast.error(e.message)), [ciclo.id]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    if (!aberto) return setDetalhe(null);
    avaliacao360.resultadoRH(ciclo.id, aberto).then(setDetalhe).catch((e) => toast.error(e.message));
  }, [aberto, ciclo.id]);
  const publicado = ['publicado', 'encerrado'].includes(ciclo.status);

  if (aberto) {
    return (
      <div className="space-y-3">
        <Button size="sm" variant="ghost" onClick={() => setAberto(null)}><ArrowLeft className="size-4 mr-1" />Todos os resultados</Button>
        {!detalhe ? <p className="text-sm text-muted-foreground">Carregando…</p> : (
          <Resultado360 r={detalhe}
            onCalibrar={ciclo.status === 'apuracao' ? async (competencia_id, nota, justificativa) => {
              await avaliacao360.calibrar(ciclo.id, aberto, { competencia_id, nota, justificativa });
              setDetalhe(await avaliacao360.resultadoRH(ciclo.id, aberto));
              carregar();
            } : undefined}
            acoes={publicado && !semEntrega && (
            <Entrega entrega={detalhe.entrega} nome={detalhe.avaliado?.nome?.split(' ')[0]}
              enviar={(dados) => avaliacao360.entregarRH(ciclo.id, aberto, dados)}
              onPronto={() => { avaliacao360.resultadoRH(ciclo.id, aberto).then(setDetalhe); carregar(); }} />
          )} />
        )}
      </div>
    );
  }
  if (!lista) return <p className="text-sm text-muted-foreground">Carregando resultados…</p>;
  const comNota = lista.filter((l) => l.final != null).sort((a, b) => Number(b.final) - Number(a.final));
  const semNota = lista.filter((l) => l.final == null);
  const pessoas9 = comNota.filter((l) => l.nivel_resultado && l.nivel_comportamento)
    .map((l) => ({ id: l.avaliado.id, nome: l.avaliado.nome, nivel_resultado: l.nivel_resultado, nivel_comportamento: l.nivel_comportamento }));
  const liberados = lista.filter((l) => l.entrega?.liberado_em).length;
  const devolutivas = lista.filter((l) => l.entrega?.devolutiva_dia).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between gap-2 flex-wrap">
            Matriz 9box · {pessoas9.length} pessoas
            {publicado && <BotaoAviso ciclo={ciclo} tipo="resultados" rotulo="Avisar gestores por e-mail" />}
          </CardTitle>
          <CardDescription>
            {ciclo.status === 'apuracao'
              ? 'Só o RH vê. Abra uma pessoa para calibrar critérios (com justificativa). Ao publicar, a nota trava e cada gestor passa a ver os próprios liderados.'
              : `Publicado · ${liberados} de ${lista.length} liberados às pessoas · ${devolutivas} devolutivas registradas.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NoveBox pessoas={pessoas9} onPessoa={setAberto} />
        </CardContent>
      </Card>
      {comNota.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mapa de calor · pessoas × critérios</CardTitle>
            <CardDescription>Nota final de cada critério. Clique num nome para abrir o resultado.</CardDescription>
          </CardHeader>
          <CardContent><MapaEquipe pessoas={comNota} max={ciclo.escala_max} onPessoa={(p) => setAberto(p.avaliado.id)} /></CardContent>
        </Card>
      )}
      <Relatorios ciclo={ciclo} lista={lista} />
      <Card>
        <CardHeader><CardTitle className="text-base">Ranking</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground text-left">
                  <th className="py-1.5 pr-2 font-medium">Pessoa</th>
                  <th className="py-1.5 px-2 font-medium text-right">Auto</th>
                  <th className="py-1.5 px-2 font-medium text-right">Gestor</th>
                  <th className="py-1.5 px-2 font-medium text-right" title="Pares e liderados">Outros</th>
                  <th className="py-1.5 px-2 font-medium text-right">Final</th>
                  <th className="py-1.5 px-2 font-medium text-right">Resultado</th>
                  <th className="py-1.5 px-2 font-medium text-right">Comport.</th>
                  <th className="py-1.5 px-2 font-medium">Quadrante</th>
                  <th className="py-1.5 pl-2 font-medium">Entrega</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {comNota.map((l) => (
                  <tr key={l.avaliado.id} className="hover:bg-muted/50 cursor-pointer" onClick={() => setAberto(l.avaliado.id)}>
                    <td className="py-1.5 pr-2">{l.avaliado.nome}<span className="block text-xs text-muted-foreground">{l.avaliado.cargo}</span></td>
                    {['auto', 'gestor', 'outros'].map((k) => (
                      <td key={k} className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">{l[k] == null ? '—' : Number(l[k]).toFixed(2)}</td>
                    ))}
                    <td className="py-1.5 px-2 text-right font-medium tabular-nums">
                      {Number(l.final).toFixed(2)}{l.calibrado && <span className="ml-1 text-[10px] text-primary" title="Tem critério calibrado">*</span>}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{l.eixo_resultado == null ? '—' : Number(l.eixo_resultado).toFixed(2)}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{l.eixo_comportamento == null ? '—' : Number(l.eixo_comportamento).toFixed(2)}</td>
                    <td className="py-1.5 px-2">{l.quadrante || '—'}{l.calibrado && <span className="ml-1 text-[10px] text-primary">calibrado</span>}</td>
                    <td className="py-1.5 pl-2 text-xs text-muted-foreground">
                      {l.entrega?.devolutiva_dia ? 'devolutiva feita' : l.entrega?.liberado_em ? 'liberado' : publicado ? 'pendente' : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {semNota.length > 0 && (
            <p className="text-xs text-muted-foreground mt-3">Sem nenhuma resposta: {semNota.map((l) => l.avaliado?.nome).join(', ')}.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}





const ETAPAS = [
  ['montagem', 'Montagem', ['rascunho', 'indicacao']],
  ['respostas', 'Respostas', ['coleta']],
  ['apuracao', 'Apuração', ['apuracao']],
  ['resultados', 'Resultados', ['publicado', 'encerrado']],
];
const etapaDoStatus = (s) => ETAPAS.find(([, , st]) => st.includes(s))?.[0] || 'montagem';

function NavEtapas({ status, atual, onIr }) {
  const alcance = ETAPAS.findIndex(([k]) => k === etapaDoStatus(status));
  return (
    <nav className="flex items-center gap-0 overflow-x-auto" aria-label="Etapas do ciclo">
      {ETAPAS.map(([k, nome], i) => {
        const pode = i <= alcance;
        const ativo = k === atual;
        return (
          <span key={k} className="flex items-center">
            <button type="button" disabled={!pode} onClick={() => onIr(k)} aria-current={ativo ? 'page' : undefined}
              className={`flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition-colors
                ${ativo ? 'bg-primary text-primary-foreground font-medium' : pode ? 'hover:bg-muted' : 'cursor-not-allowed text-muted-foreground/60'}`}>
              <span className={`flex size-5 items-center justify-center rounded-full text-[11px]
                ${ativo ? 'bg-primary-foreground/20' : i < alcance ? 'bg-primary text-primary-foreground' : 'border'}`}>
                {i < alcance && !ativo ? <Check className="size-3" /> : i + 1}
              </span>
              {nome}
              {i === alcance && status === 'encerrado' && <span className="text-[10px] opacity-80">· encerrado</span>}
            </button>
            {i < ETAPAS.length - 1 && <span className={`mx-1.5 h-px w-6 sm:w-10 ${i < alcance ? 'bg-primary' : 'bg-border'}`} />}
          </span>
        );
      })}
    </nav>
  );
}


function PaginaRespostas({ ciclo, onMudou }) {
  const [prazo, setPrazo] = useState(ciclo.coleta_ate || '');
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { setPrazo(ciclo.coleta_ate || ''); }, [ciclo]);
  const aberto = ciclo.status === 'coleta';
  const podeReabrir = ciclo.status === 'apuracao';
  async function salvarPrazo() {
    setOcupado(true);
    try { await avaliacao360.editarCiclo(ciclo.id, { coleta_ate: prazo }); toast.success('Prazo alterado.'); await onMudou(); }
    catch (e) { toast.error(e.message); } finally { setOcupado(false); }
  }
  async function reabrir() {
    if (!prazo || prazo < hoje()) return toast.error('Escolha um novo prazo a partir de hoje.');
    setOcupado(true);
    try {
      if (prazo !== ciclo.coleta_ate) await avaliacao360.editarCiclo(ciclo.id, { coleta_ate: prazo });
      await avaliacao360.mudarStatus(ciclo.id, 'coleta');
      toast.success(`Respostas reabertas até ${fmtDia(prazo)}. Quem já respondeu continua respondido.`);
      await onMudou('respostas');
    } catch (e) { toast.error(e.message); } finally { setOcupado(false); }
  }
  return (
    <div className="space-y-6">
      {(aberto || podeReabrir) && (
        <section className={`rounded-2xl border p-5 sm:p-6 ${podeReabrir ? 'a360-alerta-box' : 'bg-card'}`}>
          <p className="font-semibold">{aberto ? 'Prazo das respostas' : 'Respostas encerradas'}</p>
          <p className="mb-4 text-sm text-muted-foreground">
            {aberto ? `As pessoas respondem até ${fmtDia(ciclo.coleta_ate)}. Pode estender ou antecipar.`
              : 'Precisa de mais respostas? Reabra com um novo prazo — quem já respondeu continua respondido e a lista de quem avalia quem não muda.'}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <Campo label={aberto ? 'Prazo para responder' : 'Novo prazo (obrigatório)'}>
              <Input type="date" className="w-48" value={prazo} min={hoje()} onChange={(e) => setPrazo(e.target.value)} />
            </Campo>
            {aberto
              ? <Button variant="outline" disabled={ocupado || !prazo || prazo === ciclo.coleta_ate} onClick={salvarPrazo}>Salvar prazo</Button>
              : <Button disabled={ocupado || !prazo || prazo < hoje()} onClick={reabrir}><RefreshCw className="mr-1 size-4" />Reabrir respostas</Button>}
          </div>
        </section>
      )}
      <Adesao ciclo={ciclo} />
    </div>
  );
}






const AVISO_COR = {
  alta: 'bg-primary/15 text-primary',
  baixa: 'a360-alerta bg-amber-500/10',
  outro: 'bg-muted text-foreground',
};
const fmtNota = (v) => (v == null ? '—' : Number(v).toFixed(1).replace('.', ','));

function RevisaoPcs({ ciclo, onVer }) {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState(null);
  const [todos, setTodos] = useState(false);
  useEffect(() => {
    avaliacao360.avisoPcs(ciclo.id).then(setD).catch((e) => setErro(e.message));
  }, [ciclo.id]);

  if (erro) return <p className="rounded-xl border p-4 text-sm a360-alerta">Avisos de enquadramento indisponíveis: {erro}</p>;
  if (!d) return <p className="text-sm text-muted-foreground">Calculando avisos de enquadramento…</p>;
  const N = d.ciclo.escala_max;
  const comAviso = d.pessoas.filter((p) => p.texto);
  const lista = (todos ? d.pessoas : comAviso).slice().sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
  const lim = d.limites;

  return (
    <section className="space-y-3 rounded-2xl border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Revisão de enquadramento · PCS</h3>
          <p className="max-w-2xl text-sm text-muted-foreground">
            A avaliação não decide salário: aqui ficam os resultados que pedem um olhar no cargo.
            Nota alta a partir de {fmtNota(N * lim.alto)} · nota baixa até {fmtNota(N * lim.baixo)} (escala de {N}) ·
            gestor e equipe com {fmtNota(N * lim.divergencia)} ou mais de distância. O peso de cada critério se ajusta em "O que vamos avaliar".
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-3xl font-semibold tabular-nums">{comAviso.length}</span>
          <span className="text-muted-foreground">de {d.pessoas.length}<br />com aviso</span>
        </div>
      </div>
      {d.peso_pcs_pendente && (
        <p className="text-xs a360-alerta">O peso no PCS ainda não foi ativado no banco: todos os critérios estão contando igual.</p>
      )}
      <div className="flex gap-1 text-xs">
        {[[false, `Com aviso (${comAviso.length})`], [true, `Todos (${d.pessoas.length})`]].map(([v, l]) => (
          <button key={l} type="button" onClick={() => setTodos(v)}
            className={`rounded-full px-3 py-1 ${todos === v ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>{l}</button>
        ))}
      </div>
      {lista.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">Nenhum resultado fora da curva neste ciclo.</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {lista.map((p) => {
            const cor = AVISO_COR[p.aviso] || AVISO_COR.outro;
            return (
              <li key={p.avaliado?.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="min-w-[180px] flex-1">
                  <span className="block text-sm font-medium">{p.avaliado?.nome}</span>
                  <span className="block text-xs text-muted-foreground">{p.avaliado?.cargo || 'Sem cargo'}{p.avaliado?.area ? ` · ${p.avaliado.area}` : ''}</span>
                </span>
                <span className="w-24 text-xs text-muted-foreground" title="Nota que conta para o aviso (com o peso de cada critério no PCS)">
                  <span className="block text-base font-semibold tabular-nums text-foreground">{fmtNota(p.nota_pcs)}<span className="text-xs font-normal text-muted-foreground"> /{N}</span></span>
                  nota final {fmtNota(p.final)}
                </span>
                <span className="flex min-w-[220px] flex-[2] flex-col gap-1">
                  {p.texto
                    ? <span className={`w-fit rounded-full px-2.5 py-0.5 text-xs font-medium ${cor}`}>{p.texto}</span>
                    : <span className="text-xs text-muted-foreground">Sem aviso</span>}
                  {p.divergencia && (
                    <span className="text-xs text-muted-foreground">Gestor {fmtNota(p.divergencia.gestor)} · pares e liderados {fmtNota(p.divergencia.outros)}</span>
                  )}
                  {(p.criterios_alta.length > 0 || p.criterios_baixa.length > 0) && (
                    <span className="flex flex-wrap gap-1">
                      {p.criterios_alta.map((c) => <span key={c.competencia_id} className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary">↑ {c.nome} {fmtNota(c.nota)}</span>)}
                      {p.criterios_baixa.map((c) => <span key={c.competencia_id} className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] a360-alerta">↓ {c.nome} {fmtNota(c.nota)}</span>)}
                    </span>
                  )}
                </span>
                <Button size="sm" variant="outline" onClick={() => onVer(p.avaliado?.id)}>Ver resultado</Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function PaginaEntregas({ ciclo }) {
  const [d, setD] = useState(null);
  const [vendo, setVendo] = useState(null);
  const [det, setDet] = useState(null);
  const [aberto, setAberto] = useState(null);
  const carregar = useCallback(() => avaliacao360.entregas(ciclo.id).then(setD).catch((e) => toast.error(e.message)), [ciclo.id]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    if (!vendo) return setDet(null);
    avaliacao360.resultadoRH(ciclo.id, vendo).then(setDet).catch((e) => toast.error(e.message));
  }, [vendo, ciclo.id]);

  if (vendo) {
    return (
      <div className="space-y-3">
        <Button size="sm" variant="ghost" onClick={() => setVendo(null)}><ArrowLeft className="mr-1 size-4" />Entregas</Button>
        {!det ? <p className="text-sm text-muted-foreground">Carregando…</p> : (
          <Resultado360 r={det} acoes={
            <Entrega entrega={det.entrega} nome={det.avaliado?.nome?.split(' ')[0]}
              enviar={(dados) => avaliacao360.entregarRH(ciclo.id, vendo, dados)}
              salvarPlano={(plano) => avaliacao360.planoRH(ciclo.id, vendo, plano)}
              onPronto={() => { avaliacao360.resultadoRH(ciclo.id, vendo).then(setDet); carregar(); }} />
          } />
        )}
      </div>
    );
  }
  if (!d) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  const todos = [...d.gestores.flatMap((g) => g.liderados), ...d.sem_gestor];
  const liberados = todos.filter((l) => l.liberado_em).length;
  const devolutivas = todos.filter((l) => l.devolutiva_dia).length;
  const pill = (l) => (l.devolutiva_dia ? ['Devolutiva feita', 'a360-res'] : l.liberado_em ? ['Liberado', 'bg-primary/15 text-primary'] : ['Aguardando', 'bg-muted text-muted-foreground']);
  const Linha = ({ l }) => {
    const [txt, cls] = pill(l);
    return (
      <li className="flex flex-wrap items-center gap-3 px-4 py-2.5">
        <span className="min-w-[160px] flex-1"><span className="block text-sm">{l.nome}</span><span className="block text-xs text-muted-foreground">{l.cargo || '—'}</span></span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs ${cls}`}>{txt}</span>
        {l.devolutiva_dia && <span className="text-xs text-muted-foreground">em {fmtDia(l.devolutiva_dia)}</span>}
        <Button size="sm" variant="outline" onClick={() => setVendo(l.id)}>Ver resultado</Button>
      </li>
    );
  };
  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-center gap-6 rounded-2xl border bg-card p-5 sm:p-6">
        <div><p className="text-3xl font-semibold tabular-nums">{liberados}<span className="text-base font-normal text-muted-foreground">/{todos.length}</span></p><p className="text-xs text-muted-foreground">resultados liberados às pessoas</p></div>
        <div><p className="text-3xl font-semibold tabular-nums">{devolutivas}<span className="text-base font-normal text-muted-foreground">/{todos.length}</span></p><p className="text-xs text-muted-foreground">devolutivas registradas</p></div>
        <p className="max-w-md flex-1 text-sm text-muted-foreground">Cada gestor recebe o resultado dos liderados dele em Minhas Avaliações, conversa com a pessoa, libera e registra a devolutiva. O RH acompanha aqui e pode liberar no lugar do gestor.</p>
        <BotaoAviso ciclo={ciclo} tipo="resultados" rotulo="Avisar gestores por e-mail" />
      </section>
      <RevisaoPcs ciclo={ciclo} onVer={setVendo} />
      <ul className="space-y-3">
        {d.gestores.map((g) => {
          const ok = g.liberados === g.liderados.length;
          return (
            <li key={g.gestor.id} className="overflow-hidden rounded-xl border bg-card">
              <button type="button" onClick={() => setAberto(aberto === g.gestor.id ? null : g.gestor.id)}
                className="flex w-full flex-wrap items-center gap-4 px-4 py-3 text-left hover:bg-muted/40">
                <span className="min-w-[200px] flex-1"><span className="block text-sm font-medium">{g.gestor.nome}</span><span className="block text-xs text-muted-foreground">recebeu {g.liderados.length} resultado{g.liderados.length === 1 ? '' : 's'}</span></span>
                <span className="flex items-center gap-2 text-xs">
                  <span className="h-1.5 w-28 rounded-full bg-muted"><span className="block h-1.5 rounded-full bg-primary" style={{ width: `${(g.liberados / g.liderados.length) * 100}%` }} /></span>
                  <span className="tabular-nums">{g.liberados}/{g.liderados.length} liberados</span>
                </span>
                <span className="text-xs text-muted-foreground">{g.devolutivas} devolutiva{g.devolutivas === 1 ? '' : 's'}</span>
                {ok ? <Check className="size-4 text-primary" /> : <CircleAlert className="size-4 a360-alerta" />}
              </button>
              {aberto === g.gestor.id && <ul className="divide-y border-t">{g.liderados.map((l) => <Linha key={l.id} l={l} />)}</ul>}
            </li>
          );
        })}
        {d.sem_gestor.length > 0 && (
          <li className="overflow-hidden rounded-xl border bg-card">
            <p className="px-4 py-3 text-sm font-medium">Sem gestor no ciclo <span className="font-normal text-muted-foreground">· o RH libera</span></p>
            <ul className="divide-y border-t">{d.sem_gestor.map((l) => <Linha key={l.id} l={l} />)}</ul>
          </li>
        )}
      </ul>
    </div>
  );
}


const STATUS = {
  rascunho: ['Rascunho', 'bg-muted text-muted-foreground'],
  indicacao: ['Rascunho', 'bg-muted text-muted-foreground'],
  coleta: ['Em andamento', 'bg-primary/15 text-primary'],
  apuracao: ['Em apuração', 'a360-comp'],
  publicado: ['Publicado', 'a360-res'],
  encerrado: ['Encerrado', 'bg-muted text-muted-foreground'],
};
const FILTROS = [['todas', 'Todas'], ['rascunho', 'Rascunho'], ['coleta', 'Em andamento'], ['apuracao', 'Em apuração'], ['publicado', 'Publicado'], ['encerrado', 'Encerrado']];

function Status({ s }) {
  const [nome, cls] = STATUS[s] || [s, 'bg-muted'];
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{nome}</span>;
}

function ListaCiclos({ ciclos, onAbrir, onNovo }) {
  const [filtro, setFiltro] = useState('todas');
  const conta = (k) => ciclos.filter((c) => (k === 'rascunho' ? ['rascunho', 'indicacao'].includes(c.status) : c.status === k)).length;
  const lista = filtro === 'todas' ? ciclos : ciclos.filter((c) => (filtro === 'rascunho' ? ['rascunho', 'indicacao'].includes(c.status) : c.status === filtro));
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Avaliações 360</h2>
          <p className="mt-1 text-sm text-muted-foreground">Todos os ciclos de avaliação. Abra os detalhes para montar, acompanhar ou ver os resultados.</p>
        </div>
        <Button onClick={onNovo}><Plus className="mr-1 size-4" />Nova avaliação</Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {FILTROS.map(([k, nome]) => {
          const n = k === 'todas' ? ciclos.length : conta(k);
          if (k !== 'todas' && !n) return null;
          return (
            <button key={k} type="button" onClick={() => setFiltro(k)}
              className={`rounded-full border px-3 py-1 text-sm ${filtro === k ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
              {nome} <span className="tabular-nums opacity-70">{n}</span>
            </button>
          );
        })}
      </div>
      <div className="overflow-hidden rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-5 py-3 font-medium">Avaliação</th>
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="hidden px-3 py-3 font-medium md:table-cell">Período</th>
              <th className="hidden px-3 py-3 text-right font-medium sm:table-cell">Pessoas</th>
              <th className="hidden px-3 py-3 font-medium lg:table-cell">Respostas</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {lista.map((c) => {
              const r = c.resumo || {};
              const pct = r.formularios ? Math.round((r.respondidos / r.formularios) * 100) : 0;
              return (
                <tr key={c.id} className="cursor-pointer hover:bg-muted/40" onClick={() => onAbrir(c.id)}>
                  <td className="px-5 py-4">
                    <span className="block font-medium">{c.nome}</span>
                    <span className="block text-xs text-muted-foreground">{r.perguntas ?? 0} perguntas · escala de 1 a {c.escala_max}</span>
                  </td>
                  <td className="px-3 py-4"><Status s={c.status} /></td>
                  <td className="hidden px-3 py-4 text-muted-foreground md:table-cell">{fmtDiaAno(c.periodo_inicio)} → {fmtDiaAno(c.coleta_ate)}</td>
                  <td className="hidden px-3 py-4 text-right tabular-nums sm:table-cell">{r.avaliados ?? 0}</td>
                  <td className="hidden px-3 py-4 lg:table-cell">
                    {c.status === 'rascunho' || !r.formularios ? <span className="text-xs text-muted-foreground">{r.formularios ? `${r.formularios} formulários` : '—'}</span> : (
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 w-24 rounded-full bg-muted"><span className="block h-1.5 rounded-full bg-primary" style={{ width: `${pct}%` }} /></span>
                        <span className="text-xs tabular-nums text-muted-foreground">{r.respondidos}/{r.formularios}</span>
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onAbrir(c.id); }}>Detalhes</Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!lista.length && <p className="p-8 text-center text-sm text-muted-foreground">Nenhuma avaliação neste filtro.</p>}
      </div>
    </div>
  );
}

export default function TabAvaliacao360() {
  const [ciclos, setCiclos] = useState(null);
  const [selId, setSelId] = useState(null);
  const [ciclo, setCiclo] = useState(null);
  const [criando, setCriando] = useState(false);
  const [mudando, setMudando] = useState(false);
  const [etapa, setEtapa] = useState('montagem');

  const carregarLista = useCallback(async () => {
    try { setCiclos(await avaliacao360.ciclos()); } catch (e) { toast.error(e.message); }
  }, []);
  const carregarCiclo = useCallback(async () => {
    if (!selId) return setCiclo(null);
    try { setCiclo(await avaliacao360.ciclo(selId)); } catch (e) { toast.error(e.message); }
  }, [selId]);
  useEffect(() => { carregarLista(); }, [carregarLista]);
  useEffect(() => { carregarCiclo(); }, [carregarCiclo]);

  useEffect(() => { if (ciclo) setEtapa(etapaDoStatus(ciclo.status)); }, [ciclo?.id, ciclo?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const voltar = () => { setSelId(null); setCiclo(null); setCriando(false); carregarLista(); };
  async function avancar(para) {
    setMudando(true);
    try {
      await avaliacao360.mudarStatus(ciclo.id, para);
      toast.success(`Ciclo em "${NOME_FASE[para]}".`);
      await carregarCiclo();
    } catch (e) { toast.error(e.message); } finally { setMudando(false); }
  }

  if (!ciclos) return <p className="p-4 text-sm text-muted-foreground">Carregando…</p>;

  if (criando) {
    return (
      <div className="mx-auto max-w-7xl space-y-4">
        <Button size="sm" variant="ghost" onClick={voltar}><ArrowLeft className="mr-1 size-4" />Todas as avaliações</Button>
        <NovoCiclo onCancelar={voltar} onCriado={(id) => { setCriando(false); setSelId(id); carregarLista(); }} />
      </div>
    );
  }

  if (!selId) {
    return (
      <div className="mx-auto max-w-7xl">
        {ciclos.length === 0 ? (
          <section className="rounded-2xl border border-dashed p-10 text-center">
            <p className="text-lg font-semibold">Nenhuma avaliação ainda</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Crie a primeira: ela já vem com os critérios, as perguntas e a escala do ciclo 2026 do Feedz.</p>
            <Button className="mt-5" onClick={() => setCriando(true)}><Plus className="mr-1 size-4" />Nova avaliação</Button>
          </section>
        ) : <ListaCiclos ciclos={ciclos} onAbrir={setSelId} onNovo={() => setCriando(true)} />}
      </div>
    );
  }

  if (!ciclo) return <p className="p-4 text-sm text-muted-foreground">Carregando…</p>;
  const rascunho = ciclo.status === 'rascunho';
  const acao = ACAO_FASE[ciclo.status];
  const RESUMO_ETAPA = {
    montagem: rascunho ? 'Monte o ciclo e envie para as pessoas preencherem.' : 'Como o ciclo foi montado. Travado desde o envio (prazo, texto e configurações de exibição ainda mudam).',
    respostas: 'Quem já respondeu, quem falta, e o prazo.',
    apuracao: 'Notas agregadas e anônimas, 9-box, ranking, relatórios e calibragem — só o RH vê.',
    resultados: 'Quem recebeu os resultados e se já entregou às pessoas.',
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Button size="sm" variant="ghost" onClick={voltar}><ArrowLeft className="mr-1 size-4" />Todas as avaliações</Button>

      <section className="space-y-5 rounded-2xl border bg-card px-5 py-6 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-semibold tracking-tight">{ciclo.nome}</h2>
              <Status s={ciclo.status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Respostas de {fmtDia(ciclo.periodo_inicio)} a {fmtDia(ciclo.coleta_ate)} · {ciclo.perguntas?.length || 0} perguntas · escala de 1 a {ciclo.escala_max}
            </p>
          </div>
          {acao && (
            <div className="flex flex-col items-end gap-1">
              <span className="flex gap-2">
                {ciclo.status === 'apuracao' && <Button variant="outline" onClick={() => setEtapa('respostas')}>Reabrir respostas</Button>}
                <Button disabled={mudando} onClick={() => avancar(acao[0])}>{acao[1]}</Button>
              </span>
              <span className="max-w-xs text-right text-xs text-muted-foreground">{acao[2]}</span>
            </div>
          )}
        </div>
        <NavEtapas status={ciclo.status} atual={etapa} onIr={setEtapa} />
        <p className="text-sm text-muted-foreground">{RESUMO_ETAPA[etapa]}</p>
      </section>

      {etapa === 'montagem' && (
        <>
          <Secao n={1} titulo="Dados do ciclo" resumo={rascunho ? 'Datas, peso de cada avaliação, forma de resposta e o texto do convite.' : 'Ciclo enviado: só o prazo e o texto do convite podem mudar.'}>
            <DadosDoCiclo ciclo={ciclo} onSalvo={carregarCiclo} />
          </Secao>
          <Secao n={2} titulo="O que vamos avaliar" resumo="Critérios (etiquetas) e as perguntas de cada um.">
            <Perguntas ciclo={ciclo} editavel={rascunho} onSalvo={carregarCiclo} />
          </Secao>
          <Secao n={3} titulo="Quem participa" resumo={rascunho ? 'Abra o organograma e clique numa pessoa para escolher quem a avalia.' : 'Lista travada desde o envio.'}>
            <Participantes key={`${ciclo.id}-${ciclo.status}`} ciclo={ciclo} />
          </Secao>
          <Secao n={4} titulo="Configurações da avaliação" resumo="Comentário obrigatório, como a resposta aparece, o que gestor e avaliado veem e como é a entrega.">
            <Configuracoes ciclo={ciclo} onSalvo={carregarCiclo} />
          </Secao>
          {rascunho && (
            <Secao n={5} titulo="Enviar para preencher" resumo="Confira e libere a avaliação para as pessoas.">
              <Envio ciclo={ciclo} onEnviado={carregarCiclo} />
            </Secao>
          )}
        </>
      )}
      {etapa === 'respostas' && <PaginaRespostas ciclo={ciclo} onMudou={carregarCiclo} />}
      {etapa === 'apuracao' && <Resultados key={`ap-${ciclo.id}-${ciclo.status}`} ciclo={ciclo} semEntrega />}
      {etapa === 'resultados' && <PaginaEntregas key={ciclo.id} ciclo={ciclo} />}
    </div>
  );
}
