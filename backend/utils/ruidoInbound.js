
























function normalizar(t) {
  return String(t || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}




const EMPRESA_FORTE = [
  { id: 'mensagem_automatica', re: /\bmensagem automatica\b|\bresposta automatica\b|\batendimento automatico\b/ },
  { id: 'indisponivel_no_momento', re: /nao estamos disponiveis (no momento|agora)/ },
  { id: 'fora_do_horario', re: /fora do (nosso )?horario de atendimento/ },
];


const EMPRESA_FRACO = [
  { id: 'bem_vindo_a_empresa', re: /\b(seja )?bem[- ]?vind[oa](\(a\))?\s+(a|à|ao|na|no)\s+\S/ },
  { id: 'agradecemos_mensagem', re: /agradecemos? (sua|pela|a sua|o seu|seu) (mensagem|contato)|agradece por (fazer parte|entrar em contato)|obrigad[oa] por entrar em contato/ },
  { id: 'responderemos', re: /(responderemos|retornaremos|retornamos o contato|entraremos em contato|responderei) (assim que|em breve|o mais|sua mensagem)|assim que possivel,? responderemos|prazo maximo de retorno/ },
  { id: 'horario_atendimento', re: /horario de (atendimento|funcionamento)/ },
  { id: 'equipe_vai_atender', re: /um de nossos (especialistas|atendentes|consultores|vendedores)|nossa equipe (se prepara|ira|vai) (pra|para)? ?(te )?atende|ansiosos para atende/ },
  { id: 'como_podemos_ajudar', re: /em que (podemos|posso) (te )?ajudar|como (podemos|posso) (te )?ajudar|estou aqui para (te )?(ajudar|ouvir)|prazer (em )?(te )?atende/ },

  { id: 'agradece_contato', re: /agradecem? (seu|o seu|pelo|por seu) contato|agrade[cç]o (seu|o seu|pelo) contato/ },
  { id: 'bem_vindo_generico', re: /\b(seja )?bem[- ]?vind[oa]/ },
  { id: 'profissional', re: /\bsou (a|o|uma|um) (fonoaudiolog|corretor|nutricionist|dentist|advogad|psicolog|personal|consultor|vendedor|fotograf|arquitet|contador|engenheir)|\b(corretora? de seguros|especialista em|fonoaudiolog[ao])\b/ },
  { id: 'conheca_trabalho', re: /conhe[cç]a (meu|nosso|nossos|nossa|alguns|alguns dos) (trabalho|produtos|servicos|roteiros)|se desejar conhecer|(veja|vejam|acesse) (em )?nosso (instagram|site)/ },
  { id: 'link_comercial', re: /instagram\.com|\.netlify\.app|linktr\.ee|\bwww\.\S+|https?:\/\/\S+/ },
  { id: 'oferecemos', re: /oferecemos (solucoes|servicos)|modelos disponiveis|entrego .* em todo o rio/ },
  { id: 'nome_de_negocio', re: /\b(oficina|mecanica|pisos|decks|engenharia|photograf|fotografia|imobiliaria|advocacia|clinica|consultorio|loja|studio|estudio|ltda|me\b)/ },
];


const NAO_SOU_EU = [



  { id: 'nao_sou', re: /\bnao sou\b(?! (de|muito|mto|bom|boa|capaz|contra|a favor|daqui|dai|dessa|desse|assim|tao|nada|ninguem)\b)/ },
  { id: 'numero_errado', re: /\bnumero errado\b|\bcontato errado\b|\btelefone errado\b/ },
  { id: 'engano', re: /houve (um )?engano|foi (um )?engano|mensagem (por )?engano/ },
  { id: 'nao_conheco', re: /\bnao conhe[cç]o\b/ },
  { id: 'outra_igreja', re: /(congregando|congrego|sou|fa[cç]o parte|estou|membro) (de |em |da |na |numa |de uma )?outra igreja|mudei de igreja|sou da igreja (?!cbrio|comunidade batista do rio)/ },
  { id: 'excluir_cadastro', re: /(exclus[aã]o|excluir|exclua|excluam|apagar|apague|retirar|retire|retirem|remover|remova|removam|tirar|tire|tirem) (o )?(meu|meus|o meu|minha|do meu) (cadastro|numero|contato|telefone|nome|dados)|agrade[cç]o a exclus[aã]o/ },
  { id: 'nao_estamos_mais', re: /nao (estamos|estou|frequento|frequentamos|vou|vamos) mais (ai|aí|na igreja|a igreja)/ },
];




function classificarRuido(texto) {
  const t = normalizar(texto);
  if (!t || t.length < 6) return { tipo: null, sinais: [] };

  const fortes = EMPRESA_FORTE.filter(s => s.re.test(t)).map(s => s.id);
  const fracos = EMPRESA_FRACO.filter(s => s.re.test(t)).map(s => s.id);




  const ehNossaEcoada = /recebemos sua inscri[cç]ao|sua inscri[cç]ao (foi|esta) (confirmada|recebida)|cbrio|grupo de conexao|seu pedido foi aprovado|boas-vindas ao grupo/.test(t);
  if (!ehNossaEcoada && (fortes.length >= 1 || fracos.length >= 2)) {
    return { tipo: 'auto_resposta_empresa', sinais: [...fortes, ...fracos] };
  }

  const naoSou = NAO_SOU_EU.filter(s => s.re.test(t)).map(s => s.id);
  if (naoSou.length >= 1) return { tipo: 'nao_sou_eu', sinais: naoSou };

  return { tipo: null, sinais: [] };
}


function ehDigitoDeMenu(texto) {
  const t = normalizar(texto);


  return /^\d(?!\d|h\b|hs\b)\s*[-–.]?\s*[a-z]{0,12}$/.test(t);
}

module.exports = { classificarRuido, ehDigitoDeMenu, normalizar, EMPRESA_FORTE, EMPRESA_FRACO, NAO_SOU_EU };
