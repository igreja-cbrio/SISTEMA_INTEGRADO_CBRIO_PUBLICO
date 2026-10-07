





















import { useEffect, useRef, useState } from 'react';
import CartaoVisual from './CartaoVisual';

const SDK_URL = 'https://sdk.mercadopago.com/js/v2';
const CONTAINER_ID = 'cbrio-cartao-brick';

declare global {
  interface Window { MercadoPago?: any }
}


let sdkPromise: Promise<void> | null = null;
function carregarSdk(): Promise<void> {
  if (window.MercadoPago) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SDK_URL;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {

      sdkPromise = null;
      reject(new Error('Não foi possível carregar o formulário de cartão.'));
    };
    document.head.appendChild(s);
  });
  return sdkPromise;
}

export type CartaoBrickProps = {
  publicKey: string;
  valorCentavos: number;

  parcelasMax?: number | null;

  onPagar: (formData: any) => Promise<void>;

  checkoutUrl?: string | null;
  corTexto?: string;
  corTextoFraco?: string;

  escuro?: boolean;
  corFundoInput?: string;
  corBorda?: string;
};




const VERDE_CBRIO = '#00B39D';

export default function CartaoBrick({
  publicKey, valorCentavos, parcelasMax, onPagar, checkoutUrl,
  corTexto = '#111', corTextoFraco = '#666',
  escuro = false, corFundoInput, corBorda,
}: CartaoBrickProps) {
  const [estado, setEstado] = useState<'carregando' | 'pronto' | 'erro'>('carregando');
  const [erro, setErro] = useState<string | null>(null);




  const [bin, setBin] = useState<string | null>(null);
  const [pagando, setPagando] = useState(false);
  const [erroPagamento, setErroPagamento] = useState<string | null>(null);
  const controller = useRef<any>(null);



  const onPagarRef = useRef(onPagar);
  onPagarRef.current = onPagar;

  const teto = Math.max(1, Math.min(Number(parcelasMax) > 0 ? Number(parcelasMax) : 1, 12));












  async function pagarDaqui() {
    if (pagando) return;
    setErroPagamento(null);
    setPagando(true);

    let dados: any;
    try {
      dados = await controller.current?.getFormData?.();
    } catch {
      setPagando(false);
      return;
    }
    if (!dados) { setPagando(false); return; }

    try {
      await onPagarRef.current(dados);
    } catch (e: any) {
      setErroPagamento(e?.message || 'Não conseguimos concluir o pagamento. Tente de novo.');
    } finally {
      setPagando(false);
    }
  }

  useEffect(() => {
    let vivo = true;

    (async () => {
      try {
        await carregarSdk();
        if (!vivo) return;

        const mp = new window.MercadoPago(publicKey, { locale: 'pt-BR' });
        const bricks = mp.bricks();



        if (controller.current?.unmount) {
          try { controller.current.unmount(); } catch {                     }
        }

        controller.current = await bricks.create('cardPayment', CONTAINER_ID, {
          initialization: {

            amount: Math.round(valorCentavos) / 100,
          },
          customization: {
            paymentMethods: { minInstallments: 1, maxInstallments: teto },
            visual: {



              hideFormTitle: true,







              hidePaymentButton: true,
              style: {
                theme: escuro ? 'dark' : 'default',
                customVariables: {
                  baseColor: VERDE_CBRIO,
                  buttonTextColor: '#ffffff',
                  textPrimaryColor: corTexto,
                  textSecondaryColor: corTextoFraco,
                  ...(corFundoInput ? { inputBackgroundColor: corFundoInput } : {}),
                  ...(corBorda ? { outlineSecondaryColor: corBorda } : {}),

                  borderRadiusSmall: '8px',
                  borderRadiusMedium: '10px',
                  borderRadiusLarge: '12px',
                  borderRadiusFull: '999px',


                  inputVerticalPadding: '14px',
                  inputHorizontalPadding: '14px',





                  formPadding: '4px',
                  fontSizeMedium: '16px',
                },
              },
            },
          },
          callbacks: {
            onReady: () => { if (vivo) setEstado('pronto'); },



            onBinChange: (b: any) => {
              if (!vivo) return;
              const d = String(b || '').replace(/\D/g, '').slice(0, 8);
              setBin(d || null);
            },
            onSubmit: (formData: any) => onPagarRef.current(formData),
            onError: (e: any) => {


              if (!vivo) return;
              console.warn('[CartaoBrick]', e?.message || e);
            },
          },
        });
      } catch (e: any) {
        if (!vivo) return;
        setErro(e?.message || 'Não foi possível carregar o formulário de cartão.');
        setEstado('erro');
      }
    })();

    return () => {
      vivo = false;
      if (controller.current?.unmount) {
        try { controller.current.unmount(); } catch {                     }
      }
      controller.current = null;
    };

  }, [publicKey, valorCentavos, teto, escuro, corTexto, corTextoFraco, corFundoInput, corBorda]);

  if (estado === 'erro') {
    return (
      <div style={{ marginTop: 14 }}>
        <p style={{ fontSize: 13, color: '#b45309' }}>{erro}</p>
        {checkoutUrl && (
          <>
            <p style={{ fontSize: 12.5, color: corTextoFraco, marginTop: 6 }}>
              Você ainda pode concluir na página do provedor de pagamento.
            </p>
            <a href={checkoutUrl} style={{ textDecoration: 'none' }}>
              <button style={{
                width: '100%', marginTop: 10, padding: '13px 18px', borderRadius: 999,
                border: 'none', background: '#00B39D', color: '#fff',
                fontSize: 15, fontWeight: 700, cursor: 'pointer',
              }}>
                Pagar com cartão
              </button>
            </a>
          </>
        )}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 14 }}>
      {

                    }
      {estado === 'pronto' && (
        <CartaoVisual bin={bin} valorCentavos={valorCentavos} escuro={escuro} />
      )}
      {estado === 'carregando' && (
        <p style={{ fontSize: 13, color: corTextoFraco }}>Carregando o formulário seguro…</p>
      )}
      {
                                                                       }
      <div className="pgto-cartao" id={CONTAINER_ID} />

      {estado === 'pronto' && (
        <>
          {erroPagamento && (
            <p role="alert" style={{
              fontSize: 13, color: '#ef4444', marginTop: 14, lineHeight: 1.5,
            }}>
              {erroPagamento}
            </p>
          )}
          {

                                                         }
          <button
            type="button"
            className="pgto-acao"
            onClick={pagarDaqui}
            disabled={pagando}
            style={{
              width: '100%', marginTop: 20, padding: '14px 18px', borderRadius: 999,
              border: 'none', background: pagando ? '#0d8d7d' : VERDE_CBRIO, color: '#fff',
              fontSize: 16, fontWeight: 700,
              cursor: pagando ? 'progress' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
              <rect x="4" y="10" width="16" height="11" rx="2.5" />
              <path d="M8 10V7a4 4 0 018 0v3" />
            </svg>
            {pagando ? 'Processando…' : 'Pagar'}
          </button>
        </>
      )}

      <p style={{ fontSize: 12.5, color: corTexto, marginTop: 10 }}>
        Você paga aqui mesmo, sem sair desta página.
      </p>
      <p style={{ fontSize: 11.5, color: corTextoFraco, marginTop: 4 }}>
        Os dados do cartão vão criptografados direto ao provedor de pagamento.
        A igreja não recebe nem guarda o número do seu cartão.
      </p>
    </div>
  );
}
