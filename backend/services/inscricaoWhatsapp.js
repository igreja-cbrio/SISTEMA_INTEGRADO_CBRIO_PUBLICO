





















const { enfileirar } = require('./whatsappFila');
const { emitirTokenComprovante } = require('./inscricaoComprovante');

function baseUrl() {

  if (process.env.FRONTEND_URL) return String(process.env.FRONTEND_URL).replace(/\/+$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return null;
}

function formatarQuando(evento) {
  const data = String(evento?.data || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return 'em breve — fique de olho nos avisos';
  const [a, m, d] = data.split('-');
  return evento?.hora ? `${d}/${m}/${a} às ${evento.hora}` : `${d}/${m}/${a}`;
}






async function enviarConfirmacaoInscricao({ inscricaoId, nome, telefone, optin, evento }) {
  if (!optin) return { sent: false, reason: 'sem_optin' };
  const template = process.env.WHATSAPP_TEMPLATE_INSCRICAO_EVENTO;
  if (!template) return { sent: false, reason: 'template_nao_configurado' };
  const tel = String(telefone || '').replace(/\D/g, '');
  if (tel.length < 10) return { sent: false, reason: 'invalid_phone' };
  const base = baseUrl();
  const token = await emitirTokenComprovante(inscricaoId, 'whatsapp');
  if (!base || !token) return { sent: false, reason: 'sem_link_comprovante' };

  const primeiroNome = String(nome || '').trim().split(/\s+/)[0] || 'Olá';
  return enfileirar({
    telefone: tel,
    template,
    params: [
      primeiroNome,
      String(evento?.nome || 'evento').slice(0, 120),
      formatarQuando(evento),
      `${base}/i/c/${token}`,
    ],
    contexto: 'inscricoes.confirmacao',
    refId: inscricaoId,
  });
}

module.exports = { enviarConfirmacaoInscricao };
