








const Anthropic = require('@anthropic-ai/sdk');

const MODEL = 'claude-haiku-4-5-20251001';

function montarPrompt(funcionarios) {

  const linhas = funcionarios.map((f) => {
    const gestor = f.gestorIdx != null ? ` · reporta a #${f.gestorIdx}` : ' · sem gestor (topo)';
    return `#${f.idx} ${f.nome}${f.cargo ? ` (${f.cargo})` : ''}${f.area ? ` [${f.area}]` : ''}${gestor}`;
  });
  return linhas.join('\n');
}

const SYSTEM = `Você organiza o ORGANOGRAMA de uma igreja (CBRio). Recebe a lista de colaboradores com um ÍNDICE (#n), nome, cargo, área e quem é o gestor atual de cada um. O usuário descreve, em português, mudanças de hierarquia ("fulano reporta a beltrano", "tira o gestor de X", "coloca a equipe de mídia sob Y", "X agora é gestor de Z").

Responda APENAS com um JSON válido, sem texto fora dele, no formato:
{"mudancas":[{"colaborador":<indice>,"gestor":<indice ou null>,"motivo":"explicação curta"}],"observacao":"resumo do que entendeu ou aviso se algo ficou ambíguo"}

Regras:
- Use SOMENTE os índices que aparecem na lista. Nunca invente pessoas.
- "gestor": null significa SEM gestor (vai para o topo do organograma).
- "colaborador" é quem PASSA a reportar; "gestor" é a quem ele reporta.
- Casar nomes tolera acento, caixa, apelido e nome parcial (ex.: "Pedrão" → Pedro). Se um nome casar com mais de uma pessoa e não der pra decidir, NÃO inclua a mudança e explique na "observacao".
- Só inclua mudanças que o usuário pediu de forma clara. Se não houver nada claro, retorne "mudancas":[] e explique na "observacao".
- Não mexa em quem o usuário não citou.`;


async function chamarModelo(instrucao, funcionarios) {
  const client = new Anthropic();
  const lista = montarPrompt(funcionarios);
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 1200,
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: `COLABORADORES:\n${lista}\n\nPEDIDO DO RH:\n"${instrucao}"\n\nResponda só com o JSON.`,
    }],
  });
  const texto = (resp?.content?.[0]?.text || '').trim();
  const m = texto.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('A IA não retornou um resultado interpretável');
  return JSON.parse(m[0]);
}

module.exports = { chamarModelo, MODEL };
