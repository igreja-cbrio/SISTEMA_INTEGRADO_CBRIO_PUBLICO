



















import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { podeAplicarRascunho, soDigitos } from '@/lib/censoRascunho';
import { useParams, useSearchParams } from 'react-router-dom';




import { censoPublico } from '@/lib/censoApi';
import type { Pergunta, Respostas } from '@/lib/censoForm';
import { cpfValido, limparInvisiveis } from '@/lib/censoForm';
import CensoForm from '@/components/censo/CensoForm';
import { PublicPaletteCtx, PublicThemeToggle, usePublicTheme } from './publicTheme';
import { usePermitirZoom } from '@/lib/viewportZoom';



const AnimatedBackground = lazy(() => import('./AnimatedBackground'));

type Pesquisa = {
  slug: string; titulo: string; subtitulo?: string | null;
  perguntas: Pergunta[]; consentimento_texto?: string | null;
  config?: Record<string, unknown>;
};

const TEAL = '#00B39D';
const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : `${Date.now()}-${Math.random().toString(36).slice(2)}`);




const ESPERA_ENVIO_MS = 6000;

type ErroHttp = { status?: number; dados?: { faltando?: string[] } };


function ehJaRespondeu(e: unknown): boolean {
  return (e as ErroHttp)?.status === 409;
}

function ehRecusaDefinitiva(e: unknown): boolean {
  const st = (e as ErroHttp)?.status;
  return st === 400 || st === 404 || st === 422;
}

function motivoDaRecusa(e: unknown, perguntas: Pergunta[]): { mensagem: string; campos: string[] } {
  const ids = (e as ErroHttp)?.dados?.faltando || [];
  const nome = (id: string) => perguntas.find((p) => p.id === id)?.texto || id;
  return {
    mensagem: (e instanceof Error && e.message) || 'O servidor não aceitou a resposta.',
    campos: ids.map(nome),
  };
}



















function CaixaIdentidade({ etapa, C }: {
  etapa: 'nascimento' | 'buscando' | 'nao_achou';
  C: ReturnType<typeof usePublicTheme>['C'];
}) {
  const caixa: React.CSSProperties = {
    marginBottom: 20, padding: 14, borderRadius: 11,
    border: `1px solid ${C.cardBorder}`, background: C.optionBg,
  };
  if (etapa === 'buscando') {
    return <div style={caixa}><p style={{ fontSize: 13, color: C.text3, margin: 0 }}>Procurando seu cadastro…</p></div>;
  }
  if (etapa === 'nao_achou') {
    return (
      <div style={caixa}>
        <p style={{ fontSize: 13, color: C.text3, margin: 0, lineHeight: 1.5 }}>
          Não achamos um cadastro com esse CPF e essa data de nascimento — sem
          problema, e pode ser só a data. Confira o nascimento acima; se estiver
          certo, é só seguir: a gente cria o seu cadastro ao receber o censo.
        </p>
      </div>
    );
  }
  return (
    <div style={caixa}>
      <p style={{ fontSize: 13, color: C.text2, margin: '0 0 10px', lineHeight: 1.5 }}>
        Responda a <strong>data de nascimento</strong> logo abaixo — é a terceira
        pergunta — e a gente traz o que já temos do seu cadastro.
      </p>
      <p style={{ fontSize: 12, color: C.textDim, margin: 0 }}>
        Assim você não digita nada duas vezes.
      </p>
    </div>
  );
}

export default function CensoPublica() {



  usePermitirZoom();

  const { slug = '' } = useParams();
  const [searchParams] = useSearchParams();






  const { C: palette } = usePublicTheme();

  const [pesquisa, setPesquisa] = useState<Pesquisa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [respostas, setRespostas] = useState<Respostas>({});
  const [consentimento, setConsentimento] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState<null | { cuidados: string[] }>(null);
  const [jaRespondeu, setJaRespondeu] = useState(false);
  const [preenchido, setPreenchido] = useState(false);
  const [retomado, setRetomado] = useState(false);


  const [erroEnvio, setErroEnvio] = useState<{ mensagem: string; campos: string[] } | null>(null);

  const [etapaIdent, setEtapaIdent] = useState<'nascimento' | 'buscando' | 'nao_achou'>('nascimento');


  const [identidade, setIdentidade] = useState<string | null>(searchParams.get('t'));


  const tokenDaUrl = useRef<string | null>(searchParams.get('t'));
  const canal = searchParams.get('canal') === 'app' ? 'app' : searchParams.get('t') ? 'link' : 'qr';

  const iniciadaEm = useRef(new Date().toISOString());
  const envioId = useRef<string>('');


  const perguntasRef = useRef<Pergunta[]>([]);


  const respostasRef = useRef<Respostas>({});







  const rascunhoGuardado = useRef<{ respostas: Respostas; iniciada_em?: string; dono_cpf?: string | null } | null>(null);
  const rascunhoServidor = useRef<{ respostas: Respostas } | null>(null);


  const FILA = `censo_fila_${slug}`;
  const RASCUNHO = `censo_rascunho_${slug}`;




  const LOCAL = `censo_respostas_${slug}`;

  const lerLocal = useCallback((): { respostas: Respostas; iniciada_em?: string; dono_cpf?: string | null } | null => {
    try { return JSON.parse(localStorage.getItem(LOCAL) || 'null'); } catch { return null; }
  }, [LOCAL]);

  const cpfDasRespostas = (r: Respostas): string =>
    soDigitos((r as Record<string, unknown>)?.cpf);

  const gravarLocal = useCallback((r: Respostas) => {
    try {
      localStorage.setItem(LOCAL, JSON.stringify({
        respostas: r, iniciada_em: iniciadaEm.current, em: new Date().toISOString(),

        dono_cpf: cpfDasRespostas(r) || null,
      }));
    } catch {                                                               }
  }, [LOCAL]);

  const lerFila = useCallback((): { payload: unknown }[] => {
    try { return JSON.parse(localStorage.getItem(FILA) || '[]'); } catch { return []; }
  }, [FILA]);
  const salvarFila = useCallback((arr: unknown[]) => {
    try { localStorage.setItem(FILA, JSON.stringify(arr)); } catch {                            }
  }, [FILA]);

  const subirFila = useCallback(async function subir() {
    const fila = lerFila();
    if (!fila.length) return;
    const restante: unknown[] = [];
    for (const item of fila) {
      try { await censoPublico.responder(slug, item.payload); }
      catch (e) {




        if (ehJaRespondeu(e)) { setJaRespondeu(true); continue; }
        if (ehRecusaDefinitiva(e)) { setErroEnvio(motivoDaRecusa(e, perguntasRef.current)); continue; }
        restante.push(item);
      }
    }
    salvarFila(restante);
    if (restante.length) setTimeout(subir, 8000);
  }, [slug, lerFila, salvarFila]);










  const aplicarRascunhoSeForDono = useCallback((cpfDigitado: string) => {
    const guardado = rascunhoGuardado.current;


    if (!guardado || !podeAplicarRascunho(guardado.dono_cpf, cpfDigitado)) return;
    const doServidor = rascunhoServidor.current?.respostas;
    const escolhido = doServidor && Object.keys(doServidor).length > Object.keys(guardado.respostas).length
      ? doServidor
      : guardado.respostas;
    rascunhoGuardado.current = null;
    rascunhoServidor.current = null;
    if (guardado.iniciada_em) iniciadaEm.current = guardado.iniciada_em;

    setRespostas((atuais) => ({ ...escolhido, ...atuais }));
    setRetomado(true);
  }, []);


  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const p: Pesquisa = await censoPublico.obter(slug);
        if (!vivo) return;
        setPesquisa(p);

























        const local = lerLocal();
        if (vivo && local?.respostas && Object.keys(local.respostas).length && local?.dono_cpf) {
          rascunhoGuardado.current = local;
        }




        try {
          const salvo = JSON.parse(localStorage.getItem(RASCUNHO) || 'null');
          if (salvo?.rascunho_id && salvo?.retomar) {
            const r = await censoPublico.retomar(slug, salvo);
            if (vivo && r?.ok && !r.concluida && r.respostas) {





              const doServidor = Object.keys(r.respostas).length;
              const doAparelho = Object.keys(rascunhoGuardado.current?.respostas || {}).length;
              if (doServidor > doAparelho) rascunhoServidor.current = { respostas: r.respostas };
            }
            if (r?.concluida) { localStorage.removeItem(RASCUNHO); localStorage.removeItem(LOCAL); }
          }
        } catch {                                                              }
      } catch (e) {
        if (vivo) setErro(e instanceof Error ? e.message : 'Pesquisa indisponível');
      }
      if (vivo) setCarregando(false);
    })();

    subirFila();
    const aoOcultar = () => { for (const it of lerFila()) censoPublico.responderBeacon(slug, it.payload); };
    const onVis = () => { if (document.visibilityState === 'hidden') aoOcultar(); };
    window.addEventListener('pagehide', aoOcultar);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      vivo = false;
      window.removeEventListener('pagehide', aoOcultar);
      document.removeEventListener('visibilitychange', onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);









  const ultimoSalvo = useRef(0);
  const salvarRascunho = useCallback(async (novas: Respostas) => {
    if (Object.keys(novas).length === 0) return;
    if (Date.now() - ultimoSalvo.current < 15000) return;
    ultimoSalvo.current = Date.now();
    try {
      const salvo = JSON.parse(localStorage.getItem(RASCUNHO) || 'null');
      const r = await censoPublico.parcial(slug, {
        respostas: novas, canal,
        rascunho_id: salvo?.rascunho_id, retomar: salvo?.retomar,
      });
      if (r?.rascunho_id && r?.retomar) {
        localStorage.setItem(RASCUNHO, JSON.stringify({ rascunho_id: r.rascunho_id, retomar: r.retomar }));
      }
    } catch {                                                           }
  }, [slug, canal, RASCUNHO]);



  const buscarCatalogo = useCallback(async (catalogo: string, q: string) => {
    try {
      const r = await censoPublico.catalogo(catalogo, q);
      return r?.itens || [];
    } catch { return []; }
  }, []);




  useEffect(() => {
    const t = tokenDaUrl.current;
    if (!t || !slug || !pesquisa) return;
    let vivo = true;
    censoPublico.prefill(slug, { identidade: t })
      .then((r) => {
        if (!vivo || !r?.encontrado) return;
        if (r.ja_respondeu) { setJaRespondeu(true); return; }


        setRespostas((atuais) => ({ ...(r.valores || {}), ...atuais }));
        setPreenchido(true);
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, [slug, pesquisa]);




  const perguntas = pesquisa?.perguntas || [];

  perguntasRef.current = perguntas;

  respostasRef.current = respostas;

















  const parConsultado = useRef('');
  const pCpf = perguntas.find((q) => q.formato === 'cpf');
  const pNasc = perguntas.find((q) => q.preenche_de === 'data_nascimento');
  const cpfDigitado = soDigitos(pCpf ? respostas[pCpf.id] : '');
  const nascDigitado = String(pNasc ? respostas[pNasc.id] ?? '' : '');

  useEffect(() => {
    if (identidade || preenchido) return;
    if (cpfDigitado.length !== 11 || !/^\d{4}-\d{2}-\d{2}$/.test(nascDigitado)) return;
    if (!cpfValido(cpfDigitado)) return;
    const par = `${cpfDigitado}|${nascDigitado}`;
    if (parConsultado.current === par) return;

    const t = setTimeout(() => {
      parConsultado.current = par;
      setEtapaIdent('buscando');
      censoPublico.prefill(slug, { cpf: cpfDigitado, data_nascimento: nascDigitado })
        .then((r) => {
          if (!r?.encontrado) { setEtapaIdent('nao_achou'); return; }
          if (r.ja_respondeu) { setJaRespondeu(true); return; }
          setIdentidade(r.identidade);







          const novas = { ...(r.valores || {}), ...respostasRef.current };
          setRespostas(novas);
          gravarLocal(novas);
          setPreenchido(true);
        })
        .catch(() => setEtapaIdent('nao_achou'));
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cpfDigitado, nascDigitado, identidade, preenchido, slug]);

  function aoMudar(novas: Respostas) {
    setRespostas(novas);
    gravarLocal(novas);



    aplicarRascunhoSeForDono(cpfDasRespostas(novas));
  }


  async function enviar() {
    if (!pesquisa) return;
    setEnviando(true);
    setErroEnvio(null);

    if (!envioId.current) envioId.current = uuid();
    const salvo = (() => { try { return JSON.parse(localStorage.getItem(RASCUNHO) || 'null'); } catch { return null; } })();
    const payload = {


      respostas: limparInvisiveis(perguntas, respostas),
      consentimento: true,
      envio_id: envioId.current,
      canal,
      identidade,
      iniciada_em: iniciadaEm.current,
      rascunho_id: salvo?.rascunho_id,
      retomar: salvo?.retomar,
    };


    const agradecer = (cuidados: string[] = []) => {
      localStorage.removeItem(RASCUNHO);
      localStorage.removeItem(LOCAL);
      setPronto({ cuidados });
      setEnviando(false);
    };





    const tentativa = censoPublico.responder(slug, payload)
      .then((r: { cuidados?: string[] } | undefined) => ({ ok: true as const, r }))
      .catch((e: unknown) => ({ ok: false as const, e }));
    const lento = new Promise<{ lento: true }>((res) => setTimeout(() => res({ lento: true }), ESPERA_ENVIO_MS));
    const corrida = await Promise.race([tentativa, lento]);

    if ('lento' in corrida) {



      salvarFila([...lerFila(), { payload }]);
      agradecer();
      subirFila();
      return;
    }
    if (corrida.ok) { agradecer(corrida.r?.cuidados || []); return; }

    const e = corrida.e;
    if (ehJaRespondeu(e)) {

      localStorage.removeItem(RASCUNHO);
      localStorage.removeItem(LOCAL);
      setJaRespondeu(true);
      setEnviando(false);
      return;
    }
    if (ehRecusaDefinitiva(e)) {


      setErroEnvio(motivoDaRecusa(e, perguntas));
      setEnviando(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    salvarFila([...lerFila(), { payload }]);
    agradecer();
    subirFila();
  }

  const conteudo = useMemo(() => {
    if (carregando) return <Aviso texto="Carregando…" />;
    if (erro) return <Aviso texto={erro} tom="erro" />;
    if (!pesquisa) return <Aviso texto="Pesquisa indisponível" tom="erro" />;
    if (jaRespondeu) {
      return (
        <Aviso
          titulo="Você já respondeu"
          texto="Sua resposta está registrada — não precisa responder de novo. Obrigado!"
        />
      );
    }



    if (erroEnvio && pronto) {
      return (
        <Aviso
          tom="erro"
          titulo="Sua resposta não foi registrada"
          texto={`${erroEnvio.mensagem}${erroEnvio.campos.length ? ` Confira: ${erroEnvio.campos.join(', ')}.` : ''} Por favor, abra o QR e responda de novo.`}
        />
      );
    }
    if (pronto) {
      return (






        <Aviso
          titulo="Obrigado por responder!"
          texto="Sua resposta foi registrada."
        />
      );
    }
    return (
      <>
        {
                                                                  }
        {erroEnvio && (
          <div style={{
            marginBottom: 18, padding: '12px 14px', borderRadius: 11, fontSize: 13,
            border: '1px solid rgba(239,68,68,.45)', background: 'rgba(239,68,68,.08)', color: '#ef4444',
            lineHeight: 1.5,
          }}>
            <strong>Não conseguimos registrar sua resposta.</strong> {erroEnvio.mensagem}
            {erroEnvio.campos.length > 0 && <> Confira: <strong>{erroEnvio.campos.join(', ')}</strong>.</>}
            {' '}Corrija e toque em enviar de novo — nada do que você preencheu foi perdido.
          </div>
        )}
        {
                                                                        }
        {!identidade && !preenchido && cpfDigitado.length === 11 && (
          <CaixaIdentidade etapa={etapaIdent} C={palette} />
        )}
        <CensoForm
          perguntas={perguntas}
          respostas={respostas}
          onChange={aoMudar}
          onBlocoConcluido={salvarRascunho}
          buscarCatalogo={buscarCatalogo}
          onEnviar={enviar}
          enviando={enviando}
          consentimentoTexto={pesquisa.consentimento_texto}
          consentimento={consentimento}
          onConsentimento={setConsentimento}
        />
      </>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregando, erro, pesquisa, pronto, jaRespondeu, respostas, enviando, consentimento, identidade,
    preenchido, erroEnvio, etapaIdent, cpfDigitado, palette]);

  return (
    <PublicPaletteCtx.Provider value={palette}>
      <div style={{ minHeight: '100vh', background: palette.pageBg, color: palette.text, position: 'relative' }}>
        {palette.shapes && <Suspense fallback={null}><AnimatedBackground /></Suspense>}
        <div style={{ position: 'relative', maxWidth: 620, margin: '0 auto', padding: '28px 18px 64px' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
            <PublicThemeToggle emFluxo />
          </div>

          {retomado && !pronto && !jaRespondeu && (
            <div style={{
              marginBottom: 16, padding: '10px 14px', borderRadius: 10, fontSize: 13,
              background: 'color-mix(in srgb, #00B39D 12%, transparent)',
              border: '1px solid color-mix(in srgb, #00B39D 35%, transparent)',
              color: palette.text2,
            }}>
              Recuperamos o que você já havia preenchido neste aparelho — pode continuar de onde parou.
            </div>
          )}

          {pesquisa && !pronto && !jaRespondeu && (
            <header style={{ marginBottom: 24 }}>
              <h1 style={{ fontSize: 23, fontWeight: 700, margin: 0, lineHeight: 1.25 }}>{pesquisa.titulo}</h1>
              {pesquisa.subtitulo && (
                <p style={{ fontSize: 14, color: palette.text3, margin: '8px 0 0', lineHeight: 1.5 }}>
                  {pesquisa.subtitulo}
                </p>
              )}
            </header>
          )}

          <div style={{
            background: palette.card, border: `1px solid ${palette.cardBorder}`,
            borderRadius: 16, padding: '22px 18px',
            backdropFilter: palette.isDark ? 'blur(10px)' : undefined,
          }}>
            {conteudo}
          </div>

          {!pronto && !jaRespondeu && (
            <p style={{ fontSize: 12, color: palette.textDim, textAlign: 'center', marginTop: 18, lineHeight: 1.5 }}>
              Suas respostas ficam salvas neste aparelho — se algo acontecer, você
              volta de onde parou.
            </p>
          )}
        </div>
      </div>
    </PublicPaletteCtx.Provider>
  );

  function Aviso({ titulo, texto, tom }: { titulo?: string; texto: string; tom?: 'erro' }) {
    return (
      <div style={{ padding: '26px 4px', textAlign: 'center' }}>
        {titulo && (
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px', color: tom === 'erro' ? '#ef4444' : TEAL }}>
            {titulo}
          </h2>
        )}
        <p style={{ fontSize: 15, color: tom === 'erro' ? '#ef4444' : palette.text2, margin: 0, lineHeight: 1.5 }}>
          {texto}
        </p>
      </div>
    );
  }
}
