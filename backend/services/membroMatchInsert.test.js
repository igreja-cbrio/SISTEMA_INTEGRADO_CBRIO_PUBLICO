






















const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function semComentarios(js) {












  return String(js)
    .split('\r\n').join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n');
}

const arquivo = path.join(__dirname, 'membroMatch.js');
const fonte = semComentarios(fs.readFileSync(arquivo, 'utf8'));


const insert = /\.from\('mem_membros'\)\s*\.insert\(\{([\s\S]*?)\}\)\.select\(/.exec(fonte);
assert(insert, 'não achei o INSERT em mem_membros no matcher — se ele mudou de forma, este teste precisa acompanhar');
const payload = insert[1];

assert(/data_nascimento/.test(payload),
  'o INSERT do matcher tem que gravar data_nascimento: sem isso a data que a pessoa digitou é usada para decidir identidade e jogada fora na criação');
assert(/genero/.test(payload),
  'o INSERT do matcher tem que gravar genero: o sexo é obrigatório em toda porta do Contrato de Inscrição e não pode morrer no funil');



assert(/data_nascimento:\s*nasc\b/.test(payload),
  'data_nascimento deve gravar o `nasc` que o matcher usou para casar — outra fonte faria o gravado divergir do que decidiu a identidade');
assert(/genero:\s*generoCanon\b/.test(payload),
  'genero deve gravar o valor traduzido (`generoCanon`), nunca o cru: mem_membros usa masculino|feminino e as portas guardam M|F');


assert(/require\('\.\.\/utils\/dadosDoCadastro'\)/.test(fonte),
  'a tradução de sexo tem que vir de utils/dadosDoCadastro (sexoPara) — cópia local divergiria do resto do sistema');




const contrato = semComentarios(fs.readFileSync(path.join(__dirname, 'inscricaoContrato.js'), 'utf8'));
const chamada = /acharOuCriarGuardado\(\s*\{([\s\S]*?)\}/.exec(contrato);
assert(chamada, 'não achei a chamada de acharOuCriarGuardado em inscricaoContrato');
assert(/\bgenero\b/.test(chamada[1]),
  'processarIdentidade tem que repassar genero ao matcher');


const batismo = semComentarios(fs.readFileSync(path.join(__dirname, '..', 'routes', 'publicBatismo.js'), 'utf8'));
const chamadaBat = /acharOuCriarGuardado\(\{([\s\S]*?)\}\)/.exec(batismo);
assert(chamadaBat, 'não achei a chamada de acharOuCriarGuardado em publicBatismo');
assert(/genero:/.test(chamadaBat[1]),
  'a porta do batismo tem que passar o sexo ao matcher (era o caso do Pedro Moreira Gonçalez)');






assert(/telefone_digits\.eq\./.test(fonte),
  'a busca de candidatos tem que filtrar por telefone_digits — ilike sobre a coluna crua é cego a número mascarado');





assert(/telefone\.ilike\./.test(fonte),
  'o fallback pro ilike tem que continuar existindo para o intervalo entre deploy e migration');
assert(/telefone_digits/.test(fonte.slice(fonte.indexOf('resultado.error'))),
  'o fallback tem que ser disparado pelo erro que cita telefone_digits, não por qualquer erro (erro de rede não deve virar busca cega)');

const canon = /function telefoneComparavel\(v\) \{([\s\S]*?)^\}/m.exec(fonte);
assert(canon, 'não achei telefoneComparavel');
const comparavel = new Function('v', canon[1]);
assert.equal(comparavel('(21) 97965-1112'), comparavel('21979651112'),
  'as duas formas do MESMO telefone têm que virar o mesmo valor (é o caso Fabio Moura, que gerou cadastro duplicado)');
assert.equal(comparavel('5521970079969'), '21970079969', 'código de país 55 sai quando o resto é telefone completo');






assert.equal(comparavel('55991234567'), '55991234567',
  'número de Santa Maria SEM código de país mantém os 11 dígitos — replace(^55) cru viraria 991234567 e perderia o DDD');
assert.equal(comparavel('5555991234567'), '55991234567', 'número de Santa Maria com código de país mantém o DDD 55');
assert.equal(comparavel('996013179'), null, 'telefone curto demais não vira chave de busca');






const ramo = /if \(soChaveForte && permitirMatchPerfeito[\s\S]*?^  \}/m.exec(fonte);
assert(ramo, 'não achei o ramo do match perfeito');
assert(/normalizarNome\(c\.nome\) !== alvo/.test(ramo[0]),
  'o match perfeito exige nome normalizado IDÊNTICO — Dice/abreviação é o ramo normal, não este');
assert(/cpf11 && cCpf && cpf11 !== cCpf/.test(ramo[0]),
  'CPF conflitante tem que VETAR o match perfeito (caso Fabio Moura: mesmo nome e nascimento, CPFs diferentes)');
assert(/perfeitos\.length === 1/.test(ramo[0]),
  'só liga com EXATAMENTE um candidato: 2+ significa que a base já tem duplicata e escolher seria cara-ou-coroa');
assert(/permitirMatchPerfeito = false/.test(fonte),
  'a opção tem que ser OPT-IN: quem passa soChaveForte por um "não sou eu" do dedup não pode ser religado por nome+nascimento');






const { nomeEhVersaoAbreviada } = require('./duplicidadePolicy');

assert(/nomeAutorizaLigar\(c\.nome, nome\)/.test(fonte),
  'os gates de candidato (e-mail+nome e telefone+nome) têm que usar nomeAutorizaLigar — com Dice puro o cadastro antigo vira fantasma');








const corpoLigar = /function nomeAutorizaLigar\(a, b\) \{([\s\S]*?)^\}/m.exec(fonte);
assert(corpoLigar, 'não achei nomeAutorizaLigar');
assert(/nomeEhVersaoAbreviada\(a, b\)/.test(corpoLigar[1]),
  'nomeAutorizaLigar tem que somar o containment — sem ele o cadastro antigo volta a virar fantasma');
assert(/require\('\.\/duplicidadePolicy'\)/.test(fonte)
  && /const \{ nomeEhVersaoAbreviada \} = require\('\.\/duplicidadePolicy'\)/.test(fonte),
  'o import tem que ser exatamente nomeEhVersaoAbreviada: apelidar nomesPodemSerMesmaPessoa reintroduz o Dice e liga irmãs');
assert(!/nomesPodemSerMesmaPessoa/.test(fonte),
  'o matcher NÃO pode usar nomesPodemSerMesmaPessoa: aquela é a régua de SUGERIR (tem o atalho de Dice), não a de LIGAR');
assert((fonte.match(/nomeAutorizaLigar\(c\.nome, nome\)/g) || []).length === 2,
  'são DOIS gates (acharOuCriarGuardado e acharMembroGuardado) e os dois precisam da régua');





assert(/find\(\(c\) => nomesMesmaPessoa\(c\.nome, nome\)\)/.test(fonte),
  'o ramo nome+nascimento tem que continuar com nomesMesmaPessoa: nascimento igual + nome contido ligaria gêmeos');




assert.equal(nomeEhVersaoAbreviada('Helena Modelo de Exemplo Silva', 'Helena Modelo'), true,
  'nome contido é a mesma pessoa (caso sintético de abreviação)');
assert.equal(nomeEhVersaoAbreviada('Beatriz Exemplo Modelo', 'Beatriz Modelo'), true,
  'o caso Beatriz Modelo tem que ligar');
assert.equal(nomeEhVersaoAbreviada('Carla A. B. Exemplo Modelo', 'Darla A. B. Exemplo Modelo'), false,
  'IRMÃS: uma letra de diferença no PRIMEIRO nome não autoriza ligar');
assert.equal(nomeEhVersaoAbreviada('Mara Exemplo Silva Modelo', 'Nara Exemplo Silva Modelo'), false,
  'IRMÃS: idem — este é o par que o atalho de Dice aceitaria');
assert.equal(nomeEhVersaoAbreviada('Ana Souza Lima', 'Joao Souza Lima'), false,
  'irmãos que só compartilham sobrenome nunca ligam');
assert.equal(nomeEhVersaoAbreviada('Ana Souza', 'Ana Lima'), false,
  'mesmo primeiro nome com sobrenome diferente não é versão abreviada');







const app = semComentarios(fs.readFileSync(path.join(__dirname, 'appIdentidade.js'), 'utf8'));
const chamadaApp = /acharOuCriarGuardado\(\{([\s\S]*?)\}\)/.exec(app);
assert(chamadaApp, 'não achei a chamada de acharOuCriarGuardado em appIdentidade');
assert(/genero:/.test(chamadaApp[1]),
  'o onboarding do app tem que passar o sexo ao matcher — a tela o exige e ele não pode morrer no funil');


assert(/patch\.genero = d\.sexo/.test(app),
  'preencherOQuePortaoExige tem que seguir gravando o sexo: no match por CPF o INSERT não roda e ele é o único caminho');

console.log('membroMatch: INSERT grava nascimento/sexo · telefone comparável com fallback · match perfeito com veto de CPF');
