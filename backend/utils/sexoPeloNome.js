





























function primeiroNome(nome) {
  return String(nome || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)[0] || '';
}




const AMBIGUOS = new Set([
  'ariel', 'darci', 'darcy', 'dominique', 'iraci', 'jaci', 'jacy', 'juraci',
  'lucimar', 'nicola', 'sacha', 'sasha', 'valdeci', 'vanderci', 'neci', 'remi',
  'marion', 'cris', 'dani', 'rafa', 'altair', 'anesio', 'deni', 'eli', 'elian',
  'ivani', 'nair', 'jordan', 'robin', 'ryan', 'alcides',
]);

const MASCULINOS = new Set([

  'adriano', 'alessandro', 'alex', 'alexander', 'alexandre', 'almir', 'anderson',
  'andre', 'antonio', 'arthur', 'aurelio', 'bernardo', 'bruno', 'carlos',
  'charles', 'claudio', 'clayton', 'cristiano', 'daniel', 'davi', 'diego',
  'diogo', 'douglas', 'edson', 'eduardo', 'elias', 'eliezer', 'enzo', 'erick',
  'fabiano', 'fabio', 'felipe', 'fernando', 'flavio', 'gabriel', 'gilberto',
  'guilherme', 'gustavo', 'igor', 'jean', 'joao', 'jonatas', 'jorge', 'jose',
  'juliano', 'julio', 'leandro', 'leonardo', 'lucas', 'luis', 'luiz', 'marcelo',
  'marcio', 'marco', 'marcos', 'marcus', 'matheus', 'miguel', 'milton', 'nelson',
  'patrick', 'paulo', 'pedro', 'rafael', 'raphael', 'renan', 'renato', 'ricardo',
  'roberto', 'robson', 'rodrigo', 'rogerio', 'samuel', 'sebastiao', 'sergio',
  'silvio', 'thiago', 'tiago', 'victor', 'vinicius', 'vitor', 'wagner', 'waldyr',
  'william', 'yago', 'yuri',

  'abel', 'abraao', 'adao', 'ademar', 'ademir', 'adilson', 'adriel', 'afonso',
  'ailton', 'alan', 'alberto', 'aldo', 'aloisio', 'alvaro', 'amauri', 'americo',
  'anisio', 'aparecido', 'armando', 'arnaldo', 'aroldo', 'artur', 'augusto',
  'benedito', 'benicio', 'benjamim', 'benjamin', 'bento', 'breno', 'caetano',
  'caio', 'calebe', 'cassio', 'celso', 'cesar', 'cicero', 'claudemir', 'cleber',
  'cleiton', 'clodoaldo', 'conrado', 'cristovao', 'dalton', 'damiao', 'danilo',
  'dante', 'dario', 'davison', 'demetrio', 'denilson', 'dennis', 'dimas',
  'divino', 'domingos', 'donizete', 'dorival', 'edgar', 'edgard', 'edilson',
  'edimar', 'edinaldo', 'edivaldo', 'edmar', 'edmilson', 'edmundo', 'ednaldo',
  'edvaldo', 'elder', 'eliseu', 'elton', 'elvis', 'emanuel', 'emerson', 'emilio',
  'enio', 'erasmo', 'erico', 'ernesto', 'esdras', 'estevao', 'euclides',
  'eugenio', 'eurico', 'evandro', 'evaldo', 'everaldo', 'everton', 'ezequiel',
  'fabricio', 'fagner', 'fausto', 'felix', 'fellipe', 'filipe', 'firmino',
  'francisco', 'frederico', 'gael', 'gaspar', 'genesio', 'geraldo', 'gerson',
  'getulio', 'gilmar', 'gilson', 'gilvan', 'giovane', 'giovani', 'gleison',
  'gregorio', 'hamilton', 'heber', 'helio', 'helder', 'henrique', 'herbert',
  'hermes', 'hilario', 'horacio', 'hugo', 'humberto', 'iago', 'ilson', 'inacio',
  'isaac', 'isaias', 'ismael', 'israel', 'italo', 'ivan', 'jacob', 'jailson',
  'jair', 'jairo', 'jamil', 'jarbas', 'jeferson', 'jefferson', 'jeronimo',
  'joaquim', 'joel', 'joelson', 'jonas', 'jonatan', 'jonathan', 'josias',
  'josue', 'juarez', 'julian', 'junior', 'juvenal', 'kaio', 'kelvin', 'kevin',
  'laercio', 'lauro', 'lazaro', 'leonel', 'levi', 'lindomar', 'lino', 'lourival',
  'lucca', 'luciano', 'luan', 'magno', 'manoel', 'manuel', 'marcel', 'marciano',
  'mariano', 'mario', 'marlon', 'martinho', 'mateus', 'mauricio', 'maurilio',
  'mauro', 'maximiliano', 'messias', 'micael', 'michel', 'moacir', 'moises',
  'murilo', 'natan', 'natanael', 'nathan', 'newton', 'nicolas', 'nilson',
  'nilton', 'noel', 'norberto', 'olavo', 'olimpio', 'orlando', 'oscar', 'osmar',
  'osvaldo', 'oswaldo', 'otavio', 'pablo', 'pascoal', 'peterson', 'pierre',
  'plinio', 'ramon', 'raul', 'reginaldo', 'regis', 'reinaldo', 'rivaldo',
  'rodolfo', 'rolando', 'romario', 'romeu', 'romulo', 'ronaldo', 'ronan',
  'rubem', 'ruben', 'rubens', 'salomao', 'salvador', 'sandro', 'santiago',
  'saulo', 'savio', 'sidnei', 'sidney', 'silas', 'simao', 'tadeu', 'thales',
  'thomas', 'tobias', 'tulio', 'ulisses', 'valdemar', 'valdir', 'valentim',
  'valter', 'vanderlei', 'vanderson', 'vicente', 'vilmar', 'virgilio',
  'vladimir', 'waldemar', 'waldir', 'wallace', 'walter', 'wanderley',
  'wanderson', 'washington', 'wellington', 'wendel', 'wesley', 'weslley',
  'wilson', 'wilton', 'zacarias',

  'anselmo', 'ayres', 'caique', 'christiano', 'david', 'karlos', 'phillip',
  'ronald', 'stuart',
]);

const FEMININOS = new Set([

  'adriana', 'alda', 'alessandra', 'alexandra', 'alice', 'aline', 'amanda',
  'ana', 'andrea', 'andreia', 'angela', 'angelica', 'anna', 'barbara',
  'beatriz', 'bianca', 'brenda', 'bruna', 'camila', 'camilla', 'carla',
  'carolina', 'caroline', 'carolline', 'catia', 'celia', 'christiane',
  'claudia', 'cristiana', 'cristiane', 'cristina', 'daniela', 'daniele',
  'daniella', 'danielle', 'dayse', 'debora', 'deborah', 'deise', 'denise',
  'eduarda', 'elaine', 'elen', 'eliana', 'eliane', 'elisangela', 'elizabeth',
  'ester', 'esther', 'evelyn', 'fabiana', 'fernanda', 'flavia', 'gabriela',
  'gabriele', 'gabriella', 'gabrielle', 'giovanna', 'gisele', 'giselle',
  'giulia', 'glaucia', 'ingrid', 'iolanda', 'isabel', 'isadora', 'jacqueline',
  'jakeline', 'janaina', 'jaqueline', 'jennifer', 'jessica', 'josiane',
  'josilene', 'julia', 'juliana', 'juliane', 'karen', 'karine', 'katia',
  'keila', 'kelly', 'lais', 'lara', 'larissa', 'leandra', 'leila', 'leticia',
  'lilian', 'liliane', 'livia', 'lorena', 'luana', 'lucia', 'luciana',
  'luciene', 'luisa', 'marcela', 'marcele', 'marcella', 'marcelle', 'marcia',
  'margarida', 'maria', 'mariana', 'marina', 'marisa', 'marise', 'mayara',
  'michele', 'michelle', 'milena', 'mirella', 'miriam', 'monica', 'monique',
  'nadia', 'natalia', 'nathalia', 'nicole', 'nivea', 'paloma', 'patricia',
  'paula', 'priscila', 'priscilla', 'rafaela', 'rafaella', 'raquel', 'rebeca',
  'renata', 'rita', 'roberta', 'rosana', 'rosangela', 'sabrina', 'sandra',
  'sarah', 'silvana', 'silvia', 'simone', 'sofia', 'solange', 'sonia', 'sophia',
  'suelen', 'suellen', 'suzana', 'taina', 'talita', 'tamara', 'tatiana',
  'tatiane', 'teresa', 'thaiane', 'thaina', 'thais', 'thalita', 'thayna',
  'thays', 'valeria', 'vanessa', 'vania', 'vera', 'viviane',

  'abigail', 'adelia', 'adriane', 'agatha', 'aida', 'alana', 'albertina',
  'alcione', 'alessa', 'alexia', 'alicia', 'alina', 'allana', 'alzira',
  'amalia', 'amelia', 'anabela', 'analice', 'anastacia', 'andressa', 'anelise',
  'angelina', 'angelita', 'anita', 'antonia', 'aparecida', 'ariane', 'arlete',
  'arlinda', 'aurea', 'aurora', 'ayla', 'benedita', 'berenice', 'bernadete',
  'betania', 'brunna', 'cacilda', 'candida', 'carmem', 'carmen', 'cassia',
  'cassiana', 'catarina', 'cecilia', 'celeste', 'celina', 'cintia', 'cinthia',
  'clara', 'clarice', 'clarissa', 'claudete', 'claudiane', 'cleide', 'clelia',
  'cleonice', 'conceicao', 'consuelo', 'cremilda', 'dalva', 'damaris',
  'dandara', 'darlene', 'dayana', 'dayane', 'delma', 'dilma', 'divina',
  'dolores', 'domingas', 'dora', 'edilene', 'edina', 'edineia', 'edith', 'edna',
  'elba', 'elena', 'eliete', 'elis', 'elisa', 'elisabete', 'elisete', 'elizete',
  'eloa', 'eloisa', 'elza', 'emanuela', 'emanuelle', 'emilia', 'emily',
  'erica', 'erika', 'ermelinda', 'esmeralda', 'estela', 'estella', 'eugenia',
  'eulalia', 'eunice', 'evelin', 'fatima', 'filomena', 'flora', 'franciele',
  'francisca', 'gabrielly', 'geisa', 'genoveva', 'georgia', 'geralda', 'gerusa',
  'gilda', 'gildete', 'giovana', 'gislaine', 'gloria', 'graziela', 'guiomar',
  'helena', 'heloisa', 'henriqueta', 'hilda', 'hortencia', 'ines', 'inez',
  'iracema', 'irene', 'iris', 'irma', 'isabela', 'isabella', 'isabelle',
  'isaura', 'ivana', 'ivanete', 'ivone', 'izabel', 'izabela', 'jandira',
  'janete', 'janice', 'jasmine', 'jeane', 'jeanne', 'jenifer', 'joana',
  'joanna', 'jocelia', 'joelma', 'joice', 'jordana', 'josefa', 'josefina',
  'jucelia', 'jucimara', 'judite', 'julie', 'jussara', 'karina', 'karla',
  'katherine', 'keli', 'kellen', 'kesia', 'laura', 'laurinda', 'leda', 'leia',
  'lena', 'lenice', 'leonor', 'lidia', 'lidiane', 'ligia', 'lindalva',
  'lorraine', 'lourdes', 'lucelia', 'lucineia', 'ludmila', 'luiza', 'luzia',
  'madalena', 'magali', 'magda', 'maiara', 'maisa', 'manuela', 'mara',
  'margareth', 'margarete', 'mariah', 'marilda', 'marilene', 'marilia',
  'marilu', 'marilza', 'marinalva', 'marli', 'marlene', 'marta', 'martha',
  'matilde', 'maura', 'mayra', 'meire', 'melissa', 'michelly', 'mirian',
  'mirtes', 'moema', 'nadir', 'nancy', 'nara', 'natasha', 'neide', 'nelma',
  'nilce', 'nilda', 'nilza', 'nina', 'noemi', 'norma', 'nubia', 'odete',
  'ofelia', 'olga', 'olivia', 'otilia', 'palmira', 'pamela', 'paulina',
  'penha', 'perla', 'pietra', 'poliana', 'polyana', 'quiteria', 'raimunda',
  'ramona', 'regiane', 'regina', 'roseane', 'roseli', 'rosemary', 'rosemeire',
  'rosilene', 'rosimeire', 'rosa', 'rosalia', 'rosane', 'rute', 'ruth',
  'salete', 'samanta', 'samantha', 'sara', 'selma', 'severina', 'sheila',
  'shirley', 'silmara', 'sirlei', 'soraia', 'soraya', 'stefani', 'stella',
  'sueli', 'suely', 'sunamita', 'susana', 'suzane', 'sylvia', 'tabata',
  'tabita', 'tais', 'tania', 'telma', 'teodora', 'teresinha', 'thamires',
  'thamiris', 'tereza', 'valdirene', 'valquiria', 'vanda', 'vanuza',
  'veronica', 'vilma', 'vitoria', 'viviana', 'wanda', 'wilma', 'yara',
  'yasmin', 'zelia', 'zenaide', 'zilda', 'zuleide',

  'carina', 'elisana', 'haline', 'mariane', 'tatyanne', 'valentina',
]);





function sexoPeloNome(nome) {
  const p = primeiroNome(nome);
  if (!p) return null;
  if (AMBIGUOS.has(p)) return null;
  if (MASCULINOS.has(p)) return 'masculino';
  if (FEMININOS.has(p)) return 'feminino';





  return null;
}

module.exports = { sexoPeloNome, primeiroNome, AMBIGUOS, MASCULINOS, FEMININOS };
