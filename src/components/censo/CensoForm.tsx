













import { useMemo, useRef, useState } from 'react';
import type { Pergunta, Respostas } from '@/lib/censoForm';
import { blocosVisiveis, bloqueios, progresso } from '@/lib/censoForm';
import { aplicarEndereco, buscarCep, cepCompleto } from '@/lib/cepAutopreenche';
import PerguntaCampo from './PerguntaCampo';
import { usePublicPalette } from '@/pages/public/publicTheme';

type Props = {
  perguntas: Pergunta[];
  respostas: Respostas;
  onChange: (respostas: Respostas) => void;



  onBlocoConcluido?: (respostas: Respostas) => void;
  buscarCatalogo?: (catalogo: string, q: string) => Promise<{ valor: string; rotulo: string; detalhe?: string | null }[]>;
  onEnviar: () => void;
  enviando?: boolean;
  consentimentoTexto?: string | null;
  consentimento: boolean;
  onConsentimento: (v: boolean) => void;
};

const TEAL = '#00B39D';

export default function CensoForm({
  perguntas, respostas, onChange, onBlocoConcluido, buscarCatalogo, onEnviar, enviando,
  consentimentoTexto, consentimento, onConsentimento,
}: Props) {
  const c = usePublicPalette();
  const [passo, setPasso] = useState(0);
  const [mostrarErros, setMostrarErros] = useState(false);

  const blocos = useMemo(() => blocosVisiveis(perguntas, respostas), [perguntas, respostas]);
  const prog = useMemo(() => progresso(perguntas, respostas), [perguntas, respostas]);


  const idx = Math.min(passo, Math.max(0, blocos.length - 1));
  const bloco = blocos[idx];
  const ultimo = idx >= blocos.length - 1;


  const problemasNoBloco = useMemo(
    () => (bloco ? bloqueios(bloco.perguntas, respostas) : []),
    [bloco, respostas],
  );
  const motivoPorId = new Map(problemasNoBloco.map((p) => [p.id, p.motivo]));









  const [buscandoCep, setBuscandoCep] = useState(false);
  const [avisoCep, setAvisoCep] = useState<string | null>(null);


  const doCep = useRef<Set<string>>(new Set());
  const ultimoCep = useRef<string>('');

  async function consultarCep(cep: string) {
    const so = cep.replace(/\D/g, '');
    if (so === ultimoCep.current) return;
    ultimoCep.current = so;
    setAvisoCep(null);
    setBuscandoCep(true);
    try {
      const dados = await buscarCep(so);
      if (!dados) {


        setAvisoCep('Não achamos esse CEP. Você pode preencher o endereço à mão.');
        return;
      }
      const r = aplicarEndereco(perguntas, respostas, dados, doCep.current);
      r.preenchidas.forEach((id) => doCep.current.add(id));
      if (r.preenchidas.length) onChange(r.respostas);
      else setAvisoCep('Esse CEP não traz rua nem bairro — preencha o endereço à mão.');
    } finally {
      setBuscandoCep(false);
    }
  }

  function setResposta(id: string, valor: unknown) {
    const proximas = { ...respostas };
    if (valor === null || valor === undefined || valor === '') delete proximas[id];
    else proximas[id] = valor;
    onChange(proximas);



    const p = perguntas.find((q) => q.id === id);
    if (p?.formato === 'cep' && typeof valor === 'string' && cepCompleto(valor)) {
      void consultarCep(valor);
    }
  }

  function avancar() {
    if (problemasNoBloco.length) { setMostrarErros(true); return; }
    setMostrarErros(false);
    if (!ultimo) {
      onBlocoConcluido?.(respostas);
      setPasso(idx + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }



    const tudo = bloqueios(perguntas, respostas);
    if (tudo.length) {
      const primeiro = blocos.findIndex((b) => b.perguntas.some((p) => p.id === tudo[0].id));
      setMostrarErros(true);
      if (primeiro >= 0) { setPasso(primeiro); window.scrollTo({ top: 0, behavior: 'smooth' }); }
      return;
    }
    if (!consentimento) { setMostrarErros(true); return; }
    onEnviar();
  }

  if (!bloco) return null;

  const btn = (primario: boolean): React.CSSProperties => ({
    padding: '13px 20px', borderRadius: 10, fontSize: 15, fontWeight: primario ? 600 : 400,
    cursor: enviando ? 'wait' : 'pointer', fontFamily: 'inherit',
    border: primario ? 'none' : `1px solid ${c.inputBorder}`,
    background: primario ? TEAL : 'transparent',
    color: primario ? '#062b26' : c.text3,
  });

  return (
    <div>
      {               }
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: c.textDim, marginBottom: 6 }}>
          <span>Parte {idx + 1} de {blocos.length}</span>
          <span>{prog.feitas} de {prog.total} respondidas</span>
        </div>
        <div style={{ height: 5, borderRadius: 3, background: c.inputBorder, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${prog.pct}%`, background: TEAL, transition: 'width .25s' }} />
        </div>
      </div>

      <h2 style={{ fontSize: 17, fontWeight: 600, color: c.text, margin: '0 0 18px' }}>{bloco.titulo}</h2>

      <div style={{ display: 'grid', gap: 22 }}>
        {bloco.perguntas.map((p) => (
          <div key={p.id}>
            <label style={{ display: 'block', fontSize: 15, color: c.text, marginBottom: 4, lineHeight: 1.4 }}>
              {p.texto}
              {p.obrigatoria && <span style={{ color: c.textDim }}> *</span>}
            </label>
            {p.descricao && (
              <p style={{ fontSize: 13, color: c.text3, margin: '0 0 8px', lineHeight: 1.4 }}>{p.descricao}</p>
            )}
            {!p.descricao && <div style={{ height: 6 }} />}
            {p.formato === 'cep' && (buscandoCep || avisoCep) && (
              <p style={{ fontSize: 12.5, color: buscandoCep ? c.text3 : '#b45309', margin: '0 0 6px' }}>
                {buscandoCep ? 'Buscando o endereço…' : avisoCep}
              </p>
            )}
            <PerguntaCampo
              pergunta={p}
              valor={respostas[p.id]}
              onChange={(v) => setResposta(p.id, v)}
              faltando={mostrarErros && motivoPorId.has(p.id)}
              buscarCatalogo={buscarCatalogo}
            />
            {
                                                                                  }
            {mostrarErros && motivoPorId.has(p.id) && (
              <p style={{ fontSize: 12.5, color: '#ef4444', margin: '6px 0 0', lineHeight: 1.4 }}>
                {motivoPorId.get(p.id)}
              </p>
            )}
          </div>
        ))}
      </div>

      {                                        }
      {ultimo && consentimentoTexto && (
        <div style={{
          marginTop: 26, padding: 14, borderRadius: 10,
          border: `1px solid ${mostrarErros && !consentimento ? '#ef4444' : c.cardBorder}`,
          background: c.optionBg,
        }}>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
            <input type="checkbox" checked={consentimento} style={{ marginTop: 3, width: 17, height: 17, accentColor: TEAL }}
              onChange={(e) => onConsentimento(e.target.checked)} />
            <span style={{ fontSize: 13, color: c.text3, lineHeight: 1.5 }}>{consentimentoTexto}</span>
          </label>
        </div>
      )}

      {mostrarErros && problemasNoBloco.length > 0 && (
        <div style={{
          marginTop: 16, padding: '10px 13px', borderRadius: 10, fontSize: 13,
          border: '1px solid rgba(239,68,68,.45)', background: 'rgba(239,68,68,.08)', color: '#ef4444',
        }}>
          <p style={{ margin: 0, fontWeight: 600 }}>
            {problemasNoBloco.length === 1 ? 'Confira 1 campo desta parte:' : `Confira ${problemasNoBloco.length} campos desta parte:`}
          </p>
          <ul style={{ margin: '6px 0 0', padding: '0 0 0 18px', lineHeight: 1.5 }}>
            {problemasNoBloco.map((pr) => (
              <li key={pr.id}><strong>{pr.texto}</strong> — {pr.motivo}</li>
            ))}
          </ul>
        </div>
      )}
      {mostrarErros && !problemasNoBloco.length && ultimo && !consentimento && (
        <p style={{ marginTop: 16, fontSize: 13, color: '#ef4444' }}>
          Marque o aviso de privacidade acima para enviar.
        </p>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
        {idx > 0 && (
          <button type="button" onClick={() => { setMostrarErros(false); setPasso(idx - 1); window.scrollTo({ top: 0 }); }}
            style={btn(false)} disabled={enviando}>
            Voltar
          </button>
        )}
        <button type="button" onClick={avancar} style={{ ...btn(true), flex: 1 }} disabled={enviando}>
          {enviando ? 'Enviando…' : ultimo ? 'Enviar respostas' : 'Continuar'}
        </button>
      </div>
    </div>
  );
}
