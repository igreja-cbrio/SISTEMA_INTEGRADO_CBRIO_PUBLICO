const classe = 'w-full rounded-lg border border-input bg-background px-3 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
export default function CamposSelecao({ campos, respostas, alterar, arquivo, setArquivo, link, setLink, disabled = false }) {
  return <div className="space-y-6">{campos.map(c => {
    const valor = respostas[c.id] ?? (c.tipo === 'multipla' ? [] : '');
    const id = `pergunta-${c.id}`;
    const titulo = `${c.titulo}${c.obrigatorio ? ' *' : ''}`;
    const ajuda = c.ajuda ? <p id={`${id}-ajuda`} className="text-xs text-muted-foreground">{c.ajuda}</p> : null;
    if (c.tipo === 'anexo') return <fieldset key={c.id} disabled={disabled} className="space-y-3"><legend className="font-medium mb-2">{titulo}</legend>{ajuda}<label className="block space-y-2"><span className="text-sm">Arquivo</span><input className={classe} type="file" accept=".pdf,.docx,.txt,.jpg,.jpeg,.png" onChange={e => setArquivo(e.target.files?.[0] || null)} /></label>{arquivo && <p className="text-xs">Arquivo selecionado: {arquivo.name}</p>}<label className="block space-y-2"><span className="text-sm">Ou link para currículo/portfólio</span><input className={classe} type="url" placeholder="https://" maxLength={2000} value={link} onChange={e => setLink(e.target.value)} /></label></fieldset>;
    if (c.tipo === 'multipla') return <fieldset key={c.id} disabled={disabled} aria-describedby={ajuda ? `${id}-ajuda` : undefined} className="space-y-2"><legend className="font-medium mb-2">{titulo}</legend>{ajuda}{c.opcoes.map(o => <label key={o} className="flex items-center gap-3 rounded-lg border p-3"><input type="checkbox" className="size-4 accent-primary" checked={Array.isArray(valor) && valor.includes(o)} onChange={e => alterar(c.id,e.target.checked ? [...(Array.isArray(valor) ? valor : []),o] : valor.filter(v => v !== o))} /><span>{o}</span></label>)}</fieldset>;
    const props = { id, className:classe, required:c.obrigatorio, disabled, value: typeof valor === 'string' ? valor : '', 'aria-describedby':ajuda ? `${id}-ajuda` : undefined, onChange:e => alterar(c.id,e.target.value) };
    return <div key={c.id} className="space-y-2"><label htmlFor={id} className="font-medium">{titulo}</label>{ajuda}{c.tipo === 'paragrafo' ? <textarea {...props} rows={5} maxLength={8000} /> : c.tipo === 'escolha' ? <select {...props}><option value="">Selecione…</option>{c.opcoes.map(o => <option key={o}>{o}</option>)}</select> : <input {...props} maxLength={500} />}</div>;
  })}</div>;
}
