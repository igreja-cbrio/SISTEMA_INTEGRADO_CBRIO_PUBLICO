import { useState } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { rhSelecao } from '../../../api';
import { Button } from '../../../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../../components/ui/dialog';
import PADRAO from '../../../../backend/utils/rhSelecaoFormularioPadrao.json';
import CamposSelecao from './CamposSelecao';
const classe = 'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm';
const tipos = { curta:'Resposta curta', paragrafo:'Parágrafo', escolha:'Uma opção', multipla:'Várias opções', anexo:'Arquivo ou link' };
export default function EditorFormularioSelecao({ processo, onClose, onSaved }) {
  const [titulo,setTitulo] = useState(processo.titulo);
  const [formulario,setFormulario] = useState(() => structuredClone(processo.formulario || PADRAO));
  const [busy,setBusy] = useState(false), [erro,setErro] = useState(''), [previa,setPrevia] = useState(false);
  const [respostas,setRespostas] = useState({}), [arquivo,setArquivo] = useState(null), [link,setLink] = useState('');
  const alterado = titulo !== processo.titulo || JSON.stringify(formulario) !== JSON.stringify(processo.formulario || PADRAO);
  function fechar() { if (!busy && (!alterado || window.confirm('Descartar as alterações não salvas do formulário?'))) onClose(); }
  const atualizar = (id,patch) => setFormulario(f => ({ ...f, campos:f.campos.map(c => c.id === id ? {...c,...patch} : c) }));
  function mover(i,delta) { setFormulario(f => { const campos=[...f.campos]; [campos[i],campos[i+delta]]=[campos[i+delta],campos[i]]; return {...f,campos}; }); }
  function adicionar(anexo = false) { setFormulario(f => ({ ...f, campos:[...f.campos, anexo ? structuredClone(PADRAO.campos.find(c => c.id === 'anexo')) : {id:`campo_${crypto.randomUUID()}`,tipo:'curta',titulo:'Nova pergunta',ajuda:'',obrigatorio:false,opcoes:[]}] })); }
  async function salvar(e) { e.preventDefault(); setBusy(true);setErro('');try { const p=await rhSelecao.editarFormulario(processo.id,{ titulo,formulario,versao:processo.formulario_versao || 1 });onSaved(p); } catch(e) { setErro(e.message); } finally { setBusy(false); } }
  return <Dialog open onOpenChange={v => { if (!v) fechar(); }}><DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Editar processo e formulário</DialogTitle><DialogDescription>As alterações valem para novas inscrições. As candidaturas recebidas mantêm as perguntas e respostas originais.</DialogDescription></DialogHeader>
    <div className="flex gap-2"><Button variant={!previa ? 'default' : 'outline'} onClick={() => setPrevia(false)}>Editar</Button><Button variant={previa ? 'default' : 'outline'} onClick={() => setPrevia(true)}>Prévia do formulário</Button></div>
    {erro && <p role="alert" className="text-destructive text-sm">{erro}</p>}
    {previa ? <div className="rounded-xl border p-5 space-y-6"><h2 className="text-xl font-semibold">{titulo}</h2><p className="whitespace-pre-wrap text-sm">{formulario.descricao}</p><p className="text-sm text-muted-foreground">Nome completo, cargo e área, escolha de vaga e consentimento permanecem obrigatórios.</p><CamposSelecao campos={formulario.campos} respostas={respostas} alterar={(k,v) => setRespostas(r=>({...r,[k]:v}))} arquivo={arquivo} setArquivo={setArquivo} link={link} setLink={setLink} /><p className="text-sm text-muted-foreground">Esta prévia não envia uma candidatura.</p></div> : <form onSubmit={salvar} className="space-y-5"><fieldset disabled={busy} className="space-y-5">
      <label className="block space-y-2"><span className="font-medium">Nome do processo</span><input className={classe} required minLength={3} maxLength={160} value={titulo} onChange={e=>setTitulo(e.target.value)} /></label>
      <label className="block space-y-2"><span className="font-medium">Descrição apresentada ao colaborador</span><textarea className={classe} rows={3} maxLength={3000} value={formulario.descricao} onChange={e=>setFormulario(f=>({...f,descricao:e.target.value}))} /></label>
      <p className="text-sm text-muted-foreground">Nome completo, cargo e área, escolha de vaga e consentimento são campos fixos. Edite abaixo as demais perguntas. Use apenas informações necessárias ao processo.</p>
      {formulario.campos.map((c,i)=><section key={c.id} className="rounded-xl border p-4 space-y-3"><div className="flex justify-between gap-2 items-center"><h3 className="text-sm font-semibold">Pergunta {i+1}</h3><div className="flex gap-1"><Button type="button" size="icon" variant="ghost" disabled={i===0} aria-label={`Mover pergunta ${i+1} para cima`} onClick={()=>mover(i,-1)}><ArrowUp className="size-4" /></Button><Button type="button" size="icon" variant="ghost" disabled={i===formulario.campos.length-1} aria-label={`Mover pergunta ${i+1} para baixo`} onClick={()=>mover(i,1)}><ArrowDown className="size-4" /></Button><Button type="button" size="icon" variant="ghost" aria-label={`Remover pergunta ${i+1}`} onClick={()=>setFormulario(f=>({...f,campos:f.campos.filter(x=>x.id!==c.id)}))}><Trash2 className="size-4" /></Button></div></div>
        <label className="block space-y-1"><span className="text-sm">Pergunta</span><textarea className={classe} required rows={2} maxLength={500} value={c.titulo} onChange={e=>atualizar(c.id,{titulo:e.target.value})} /></label>
        <div className="flex flex-wrap gap-4 items-end"><label className="block space-y-1 flex-1 min-w-48"><span className="text-sm">Tipo de resposta</span><select className={classe} value={c.tipo} disabled={!c.id.startsWith('campo_')} onChange={e=>{ atualizar(c.id,{tipo:e.target.value,opcoes:['escolha','multipla'].includes(e.target.value)? ['Opção 1','Opção 2']:[]});setRespostas({}); }}>{Object.entries(tipos).filter(([k])=>k!=='anexo'||c.id==='anexo').map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={c.obrigatorio} onChange={e=>atualizar(c.id,{obrigatorio:e.target.checked})} />Obrigatória</label></div>
        {['escolha','multipla'].includes(c.tipo)&&<label className="block space-y-1"><span className="text-sm">Opções (uma por linha, de 2 a 20)</span><textarea className={classe} rows={4} required value={c.opcoes.join('\n')} onChange={e=>atualizar(c.id,{opcoes:e.target.value.split('\n')})} /></label>}
        <label className="block space-y-1"><span className="text-sm">Texto de ajuda (opcional)</span><input className={classe} maxLength={1000} value={c.ajuda} onChange={e=>atualizar(c.id,{ajuda:e.target.value})} /></label>
      </section>)}
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={formulario.campos.length>=20} onClick={()=>adicionar()}><Plus className="size-4 mr-2" />Adicionar pergunta</Button>{!formulario.campos.some(c=>c.tipo==='anexo')&&<Button type="button" variant="outline" disabled={formulario.campos.length>=20} onClick={()=>adicionar(true)}>Adicionar anexo</Button>}</div>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={fechar}>Cancelar</Button><Button type="submit">{busy?'Salvando…':'Salvar formulário'}</Button></div>
    </fieldset></form>}
  </DialogContent></Dialog>;
}
