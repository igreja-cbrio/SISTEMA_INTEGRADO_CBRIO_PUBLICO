import { reconciliarRespostasSelecao } from '../../../lib/respostasSelecao';
import PADRAO from '../../../../backend/utils/rhSelecaoFormularioPadrao.json';
import CamposSelecao from './CamposSelecao';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, LockKeyhole, Briefcase } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { rhSelecao } from '../../../api';
import { Button } from '../../../components/ui/button';
import { guardarRetornoSelecao, limparRetornoSelecao } from '../../../lib/selecaoRetorno';
const campo = 'w-full rounded-lg border border-input bg-background px-3 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const inicial = { nome: '', cargo_area: '', vagas: [], motivacao: '', experiencia: '', restricao: '', anexo_link: '', consentimento: false, respostas: {} };
export default function SelecaoInterna() {
  const { id } = useParams();
  const { user, loading: authLoading, signInWithEmail, signOut } = useAuth();
  const [dados, setDados] = useState(null), [form, setForm] = useState(inicial), [arquivo, setArquivo] = useState(null);
  const [erro, setErro] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(''), [senha, setSenha] = useState('');
  const identidade = useRef('');
  const versaoCarregada = useRef(null);
  const [aviso,setAviso] = useState('');
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    if (!user) { guardarRetornoSelecao(`/selecao-interna/${id}`); return; }
    limparRetornoSelecao(); let atual = true;
    const chave = `${id}:${user.id}`, mudou = identidade.current !== chave;
    identidade.current = chave; setLoading(true); setErro(''); setDados(null);
    if (mudou) { setForm(inicial); setArquivo(null); versaoCarregada.current = null;setAviso(''); }
    rhSelecao.formulario(id).then(r => { if (atual) {
      const schema = r.processo.formulario || PADRAO;
      const versao = r.processo.formulario_versao || 1;
      if (versaoCarregada.current !== null && versaoCarregada.current !== versao) setAviso('O formulário foi atualizado. Mantivemos as respostas compatíveis; confira as perguntas e opções antes de enviar.');
      versaoCarregada.current = versao;
      setDados(r);
      if (mudou) setForm({ ...inicial, nome: r.funcionario.nome || '', cargo_area: [r.funcionario.cargo, r.funcionario.area].filter(Boolean).join(' · ') });
      else setForm(f => ({ ...f, respostas: reconciliarRespostasSelecao({motivacao:f.motivacao,experiencia:f.experiencia,restricao:f.restricao,...f.respostas},schema.campos), anexo_link: schema.campos.some(c => c.tipo === 'anexo') ? f.anexo_link : '' }));
      if (!schema.campos.some(c => c.tipo === 'anexo')) setArquivo(null);
    } }).catch(e => { if (atual) setErro(e.message); }).finally(() => { if (atual) setLoading(false); });
    return () => { atual = false; };
  }, [id, user?.id, tentativa]);
  const formulario = dados?.processo.formulario || PADRAO;
  const alterar = (k,v) => setForm(f => ({ ...f, [k]: v }));
  async function entrar(e) { e.preventDefault(); setBusy(true); setErro(''); try { const r = await signInWithEmail(email,senha); if (r.error) setErro(r.error.message); } catch { setErro('Não foi possível entrar. Tente novamente.'); } finally { setBusy(false); } }
  async function enviar(e) {
    e.preventDefault(); if (busy) return;
    if (!form.vagas.length) return setErro('Selecione pelo menos uma vaga de interesse.');
    const temAnexo = formulario.campos.some(c => c.tipo === 'anexo');
    if (temAnexo && arquivo?.size > 3 * 1024 * 1024) return setErro('O arquivo deve ter até 3 MB.');
    setBusy(true); setErro('');
    try {
      const inscricao = await rhSelecao.enviar(id,{ ...form, anexo_link: temAnexo ? form.anexo_link : '', formulario_versao: dados.processo.formulario_versao || 1 },temAnexo ? arquivo : null); setDados(d => ({ ...d, inscricao })); }
    catch (e) { setErro(`${e.message} Se o envio ficou sem confirmação, consulte sua inscrição antes de tentar novamente.`); }
    finally { setBusy(false); }
  }
  return <main className="min-h-screen bg-background px-4 py-8 sm:py-12"><div className="mx-auto max-w-2xl space-y-6">
    <header><div className="flex items-center gap-2 text-primary text-sm font-semibold"><Briefcase className="size-5" />CBRio · Oportunidades internas</div><h1 className="mt-3 text-2xl sm:text-3xl font-semibold">{dados?.processo.titulo || 'Processo seletivo interno'}</h1><p className="mt-2 text-muted-foreground whitespace-pre-wrap">{formulario.descricao}</p></header>
    {authLoading ? <p role="status">Verificando sua sessão…</p> : !user ? <section className="rounded-2xl border bg-card p-6 space-y-4"><h2 className="flex gap-2 items-center font-semibold"><LockKeyhole className="size-5" />Entre com sua conta do sistema</h2><p className="text-sm text-muted-foreground">A inscrição é exclusiva para colaboradores. Se você já estiver conectado neste navegador, o formulário abre automaticamente.</p><form onSubmit={entrar} className="space-y-4"><label className="block space-y-2"><span>E-mail</span><input className={campo} type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label><label className="block space-y-2"><span>Senha do sistema</span><input className={campo} type="password" autoComplete="current-password" required value={senha} onChange={e => setSenha(e.target.value)} /></label><Button disabled={busy} type="submit">{busy ? 'Entrando…' : 'Entrar e preencher'}</Button><a className="block text-sm text-primary underline" href="/login" onClick={() => guardarRetornoSelecao(`/selecao-interna/${id}`)}>Outras formas de login ou recuperar senha</a></form></section> : <>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="text-muted-foreground">Conta: {user.email}</span><Button variant="ghost" disabled={busy} onClick={() => signOut()}>Trocar conta</Button></div>
      {loading ? <p role="status">Carregando processo…</p> : dados?.inscricao ? <section className="rounded-2xl border bg-card p-6 space-y-4"><CheckCircle2 className="size-9 text-primary" /><h2 className="text-xl font-semibold">Inscrição recebida</h2><p>Obrigado, {dados.inscricao.nome}. O RH recebeu sua candidatura para:</p><ul className="list-disc pl-5">{dados.inscricao.vagas.map(v => <li key={v}>{v}</li>)}</ul><p className="text-sm text-muted-foreground">Enviada em {new Date(dados.inscricao.criado_em).toLocaleString('pt-BR')}. Não é necessário enviar novamente.</p></section> : dados?.processo.status === 'encerrado' ? <p className="rounded-xl border p-6">As inscrições deste processo foram encerradas.</p> : dados ? <form onSubmit={enviar} className="rounded-2xl border bg-card p-5 sm:p-8 space-y-6">
        <p className="text-sm text-muted-foreground">Campos com * são obrigatórios. Você pode se candidatar a mais de uma vaga.</p>
        <fieldset disabled={busy} className="space-y-6">
        {[["nome","Nome completo",200],["cargo_area","Cargo e área atuais",300]].map(([k,label,max]) => <label key={k} className="block space-y-2"><span className="font-medium">{label} *</span><input className={campo} required maxLength={max} value={form[k]} onChange={e => alterar(k,e.target.value)} /></label>)}
        <fieldset className="space-y-2"><legend className="font-medium mb-2">Vaga de interesse *</legend>{dados.processo.vagas.map(v => <label key={v} className={`flex gap-3 items-center rounded-lg border p-3 cursor-pointer ${form.vagas.includes(v) ? 'border-primary bg-primary/5' : 'border-input'}`}><input type="checkbox" className="size-4 accent-primary" checked={form.vagas.includes(v)} onChange={e => alterar('vagas', e.target.checked ? [...form.vagas,v] : form.vagas.filter(x => x !== v))} /><span>{v}</span></label>)}</fieldset>
        <CamposSelecao campos={formulario.campos} respostas={{ motivacao:form.motivacao,experiencia:form.experiencia,restricao:form.restricao,...form.respostas }} alterar={(k,v) => setForm(f => ({ ...f,respostas:{...f.respostas,[k]:v} }))} arquivo={arquivo} setArquivo={setArquivo} link={form.anexo_link} setLink={v => alterar('anexo_link',v)} disabled={busy} />
        <label className="flex items-start gap-3 text-sm"><input required type="checkbox" className="mt-1 size-4 shrink-0 accent-primary" checked={form.consentimento} onChange={e => alterar('consentimento',e.target.checked)} /><span>Autorizo o uso destas informações apenas para este processo de transferência interna *</span></label>
        <p className="text-xs text-muted-foreground">O RH poderá usar IA como apoio à leitura das experiências e requisitos profissionais. A avaliação e a decisão são humanas.</p>
        <Button type="submit" className="w-full sm:w-auto" disabled={busy}>{busy ? 'Enviando inscrição…' : 'Enviar inscrição'}</Button>
        </fieldset>
      </form> : null}
    </>}
    {aviso && <p role="status" className="rounded-xl border p-4 text-sm">{aviso}</p>}
    {erro && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3"><p>{erro}</p>{user && <Button variant="outline" disabled={busy} onClick={() => setTentativa(t => t+1)}>Consultar minha inscrição</Button>}</div>}
  </div></main>;
}
