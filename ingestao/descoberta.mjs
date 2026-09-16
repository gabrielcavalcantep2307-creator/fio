// A biblioteca de descoberta: as seções da home e as fichas "Antes de ler".
//
// ─────────────────────────────────────────────────────────────
// A IDEIA
//
// A home era um catálogo por gênero — Romance, Filosofia, História. Isso é
// filtro, e filtro qualquer planilha faz. Uma biblioteca de descoberta responde
// a outra pergunta: QUE EXPERIÊNCIA você quer ter agora? Entrar num mundo,
// entender o poder, brigar consigo mesmo, ler algo estranho.
//
// Então as seções deixaram de ser gavetas e viraram portas: "Livros que mudam
// a maneira de ver o mundo", "O homem contra ele mesmo", "Se você gostou de
// Baki", rotas em ordem ("Entender Nietzsche", "Entender o Estado"). O mesmo
// livro aparece em várias — Crime e Castigo é culpa, é Direito, é Nietzsche
// antes de Nietzsche — e é justamente isso que leva de um livro ao próximo.
//
// ─────────────────────────────────────────────────────────────
// COMO ISTO VIRA SITE
//
//   `secoes.mjs --gravar`  grava SECOES como trilhas (na ordem) e tira do ar as
//                          trilhas antigas que não estão aqui.
//   `publicar.mjs`         ordena as coleções por ORDEM, esconde as que não têm
//                          nada legível, e mete FICHAS dentro de fichas/{id}.json
//                          (antes, tags, conexões) — a página do livro as exibe.
//
// Um livro é referido por ID do banco de produção (quando já sabemos qual é)
// ou por { t: título, a: autor } (quando ainda vai nascer da esteira). O
// resolvedor prefere sempre a obra LEGÍVEL: assim uma ficha de edição
// comercial com o mesmo nome nunca toma o lugar da nossa tradução.
//
// Só domínio público entra. Duna, Tolkien, Mistborn e companhia têm dono e
// não aparecem: seção de descoberta que leva a um livro que não se lê aqui é
// a vitrine que o dono pediu para tirar.
// ─────────────────────────────────────────────────────────────

const L = (t, a = '') => ({ t, a })

export const SECOES = [
  {
    nome: 'Livros que mudam a maneira de ver o mundo',
    resumo: 'Não precisam ser difíceis. São os que deixam uma ideia rodando na cabeça muito depois de fechados.',
    livros: [1075, 4982, 940, 1096, 1076, 816, 1051, 1062, 1097, 1077, 1083, 4980,
      L('Além do Bem e do Mal', 'Nietzsche'), L('Memórias do Subsolo', 'Dostoi')],
  },
  {
    nome: 'Entrar em outro mundo',
    resumo: 'Universos que parecem existir antes e depois da história — de uma ilha escondida a outro planeta.',
    livros: [1449, 4990, 4987, 4988, 4996, 2821, 4984, 4991, 557, 1019,
      5009, 4998, 5005, L('O Mundo Perdido'), L('Planolândia'), L('Phantastes'),
      L('A Floresta do Fim do Mundo'), L('Através do Espelho'), L('Peter Pan'), L('Ela', 'Haggard'),
      L('Robinson Crusoé'), L('Odisseia', 'Homero')],
  },
  {
    nome: 'Poder, reis e impérios',
    resumo: 'Sucessão, conspiração, guerra e ambição — na ficção e na história de verdade, que costuma ser mais cruel.',
    livros: [1062, 831, 230, 833, 1099, 1106, L('Vidas Paralelas'), L('A Vida dos Doze Césares'),
      L('Anais: o reinado de Tibério'), L('Comentários sobre a Guerra da Gália'),
      L('Declínio e Queda do Império Romano — Volume 1'), L('História de Florença'), L('Os Três Mosqueteiros', 'Dumas')],
  },
  {
    nome: 'Progressão: de ninguém a lenda',
    resumo: 'Pessoa comum → descoberta → provação → poder → transformação. A forma que o RPG e o anime herdaram, muito antes deles.',
    livros: [5004, 4990, 1810, 2821, 1409, 5027, 5000, 5003, 4989,
      L('O Chamado Selvagem'), L('Presa Branca'), L('O Capitão Blood'), L('Beowulf'), L('O Cantar de Rolando'),
      L('O Prisioneiro de Zenda'), L('A Pimpinela Escarlate'), L('As Aventuras de Robin Hood'),
      L('O Livro da Selva', 'Kipling'), L('Odisseia', 'Homero')],
  },
  {
    nome: 'O homem contra ele mesmo',
    resumo: 'Culpa, liberdade, absurdo. A pergunta que não fecha: o que eu faço com o que eu sou?',
    livros: [1096, 4982, 816, 4983, 4994, 2665, 1171, 1075, L('Memórias do Subsolo', 'Dostoi'), 3043],
  },
  {
    nome: 'Se você gostou de Baki',
    resumo: 'Corpo, disciplina, honra e combate — o código do guerreiro, do Japão à Grécia.',
    livros: [1106, L('Bushido', 'Nitobe'), L('Contos do Japão Antigo', 'Mitford'), 1810, 1076, 1107, 5003, L('Beowulf')],
  },
  {
    nome: 'Se você gostou de Vincenzo',
    resumo: 'Vingança fria, dinheiro, lei dobrada e um protagonista que joga sujo pelo motivo certo.',
    livros: [5004, 1062, 1097, L('O Grande Gatsby', 'Fitzgerald'), 1096, 1441, 544, 612],
  },
  {
    nome: 'Se você gostou de Fundação',
    resumo: 'Civilizações, ciência e o futuro usado para falar do presente — a ficção científica antes de ter nome.',
    livros: [4984, 4985, 940, 4992, 4987, 557, 5007, 5008, L('O Homem Invisível'),
      L('Os Primeiros Homens na Lua'), L('Daqui a Cem Anos'), L('A Raça que Há de Vir'), L('Planolândia')],
  },
  {
    nome: 'Livros estranhos',
    resumo: 'Você não sabe exatamente o que acabou de ler. Talvez ninguém saiba — e essa é a graça.',
    livros: [816, 4983, 4982, 3043, 4996, 1019, 3253, 1535, 4994, 1449, L('O Rei de Amarelo'),
      L('O Grande Deus Pã'), L('Planolândia'), L('A Volta do Parafuso'), L('O Homem Que Era Quinta-Feira', 'Chesterton')],
  },
  {
    nome: 'Brasil que merece ser descoberto',
    resumo: 'O país escrito por quem viveu nele: o sertão, o subúrbio, a elite, o delírio e a guerra.',
    livros: [1171, 1609, 2667, 545, 612, 2358, 3043, 1441, 2239, 1547, 544],
  },
  {
    nome: 'Rota: entender Nietzsche',
    resumo: 'Em ordem: o mestre que ele renegou, o primeiro livro, a obra-prima, os livros que a explicam — e a autobiografia em que ele se julga.',
    livros: [1083, L('O Nascimento da Tragédia', 'Nietzsche'), 1075, L('Além do Bem e do Mal', 'Nietzsche'),
      L('Crepúsculo dos Ídolos', 'Nietzsche'), L('Ecce Homo', 'Nietzsche'), 1697],
  },
  {
    nome: 'Rota: entender o Estado',
    resumo: 'De Maquiavel à Constituição de 1988. Cada livro responde ao anterior, e a pergunta é sempre a mesma: por que obedecemos?',
    livros: [1062, 647, L('Segundo Tratado sobre o Governo', 'Locke'), L('O Espírito das Leis', 'Montesquieu'),
      4980, L('Da Democracia na América', 'Tocqueville'), 1108, 660],
  },
  {
    nome: 'Rota: a ficção científica desde o começo',
    resumo: 'Do monstro de 1818 ao Grande Irmão de 1949, na ordem em que o futuro foi sendo inventado.',
    livros: [4992, 4988, 4987, 557, 4984, 4985, 4990, 940],
  },
  {
    nome: 'Como chegamos até aqui',
    resumo: 'A história em ordem, contada por quem estava perto: de Troia à Revolução Francesa, e daí a Canudos.',
    livros: [1810, L('História — Volume 1', 'Heródoto'), L('História da Guerra do Peloponeso'), L('Anábase'), 1077,
      L('Comentários sobre a Guerra da Gália'), L('Vidas Paralelas'), L('A Vida dos Doze Césares'),
      L('Anais: o reinado de Tibério'), L('Declínio e Queda do Império Romano — Volume 1'), L('História de Florença'),
      1062, L('A Revolução Francesa', 'Carlyle'), 1108, 1609],
  },
  {
    nome: 'Entre na cabeça de alguém',
    resumo: 'Personagem → conflito → pensamento → transformação. Romances que funcionam como lanterna dentro de uma pessoa.',
    livros: [545, 1096, 2665, 4992, 2358, 544, 1171, 3043, L('Memórias do Subsolo', 'Dostoi')],
  },
  {
    nome: 'Como devo viver?',
    resumo: 'Um imperador escrevendo para si mesmo, um ex-escravo ensinando liberdade: a filosofia como coisa que se usa.',
    livros: [1076, 1107, 1077, 1075, 1083, 1097, L('Cândido', 'Voltaire')],
  },
  {
    nome: 'Um livro para morar dentro',
    resumo: 'Calhamaços que valem o compromisso. Semanas, não tardes.',
    livros: [1097, 1099, 1409, 1096, 1609, 1077, 2239, 5004],
  },
]

// Ficam, depois das novas: não são gênero, são curadoria que continua boa.
export const MANTER = [
  'Machado de Assis, do começo ao fim', // também é o "Top 10" de reserva do site
  'Terror e o gótico',
  'Eça, Camilo e o romance português',
  'Da sua lista',
]

// O site procura estas pelo NOME, fora das prateleiras comuns. Não se mexe.
export const FIXAS = ['A lei, na íntegra', 'Todo mundo está lendo', 'Top 10 — Política no Brasil']

export const ORDEM = [...SECOES.map(s => s.nome), ...MANTER]

// ─────────────────────────────────────────────────────────────
// ANTES DE LER, IDEIAS E CONVERSAS
//
// "Antes de ler" existe porque às vezes o problema não é o livro: é entrar
// nele sem saber como lê-lo. Seis perguntas, sempre as mesmas, para comparar.
// "Conversa com" é o que transforma o acervo numa rede — cada ligação diz POR
// QUE um livro leva ao outro, senão é só "veja também".
// ─────────────────────────────────────────────────────────────

const f = (obra, antes, tags, conexoes) => ({ obra, antes, tags, conexoes })
const c = (obra, porque) => ({ obra, porque })

export const FICHAS = [
  f(4982, {
    oque: 'Romance — um pesadelo burocrático, publicado depois da morte do autor.',
    encontra: 'Culpa sem crime, poder sem rosto, a lógica do absurdo levada a sério.',
    dificuldade: '2 de 5 — as frases são claras; o sentido é que escorrega.',
    ritmo: 'Lento e circular, de propósito.',
    gostouDe: 'A metamorfose, 1984, Crime e Castigo',
    naoEspere: 'Explicação. Ninguém diz a Josef K. do que ele é acusado — e o livro também não.',
  }, ['culpa', 'burocracia', 'poder', 'absurdo', 'justiça'], [
    c(4983, 'a mesma máquina vista de fora: o homem que tenta entrar'),
    c(940, 'o Estado que acusa sem precisar provar'),
    c(1096, 'o avesso: um culpado que se pune sozinho'),
    c(660, 'o art. 5º é a lista de tudo o que falta ao processo de K.'),
  ]),
  f(4983, {
    oque: 'Romance inacabado — o último e o mais estranho de Kafka.',
    encontra: 'Um agrimensor chamado para um trabalho que ninguém confirma, diante de uma autoridade que não se deixa alcançar.',
    dificuldade: '3 de 5 — longo, e sem fim, literalmente.',
    ritmo: 'Muito lento; diálogos enormes.',
    gostouDe: 'O Processo, A metamorfose',
    naoEspere: 'Um final. Kafka morreu antes de escrevê-lo.',
  }, ['poder', 'burocracia', 'pertencimento', 'absurdo'], [
    c(4982, 'o mesmo labirinto, do lado de quem já está preso nele'),
    c(3043, 'a instituição que decide sozinha quem é normal'),
  ]),
  f(816, {
    oque: 'Novela curta — cabe numa tarde.',
    encontra: 'Um homem acorda inseto, e a família descobre quanto ele valia só pelo salário.',
    dificuldade: '2 de 5',
    ritmo: 'Rápido no começo, sufocante no fim.',
    gostouDe: 'O Processo, O Alienista',
    naoEspere: 'Explicação para a transformação. A pergunta do livro é outra.',
  }, ['alienação', 'família', 'trabalho', 'identidade', 'absurdo'], [
    c(4982, 'o mesmo pesadelo, com o Estado no lugar da família'),
    c(4994, 'a transformação do corpo como verdade sobre quem se é'),
    c(1171, 'outro narrador que já não pertence ao mundo dos outros'),
  ]),
  f(1096, {
    oque: 'Romance psicológico — um policial ao contrário: você sabe quem matou desde o começo.',
    encontra: 'Culpa, pobreza, a teoria do "homem extraordinário" e a consciência como tribunal.',
    dificuldade: '3 de 5 — longo e com nomes russos, mas movido a tensão.',
    ritmo: 'Febril; alterna delírio e diálogo.',
    gostouDe: 'O Processo, Os Irmãos Karamázov, Dom Casmurro',
    naoEspere: 'O mistério de quem foi. O mistério é se ele aguenta.',
  }, ['culpa', 'crime', 'moral', 'pobreza', 'redenção', 'psicologia'], [
    c(1075, 'Raskólnikov testa na prática o "além-do-homem" antes de Nietzsche lhe dar nome'),
    c(4982, 'culpa sem julgamento contra julgamento sem culpa'),
    c(1097, 'a mesma pergunta, maior: se Deus não existe, tudo é permitido?'),
    c(662, 'o Código Penal mede o homicídio; o livro mede o que a lei não alcança'),
  ]),
  f(1097, {
    oque: 'Romance-mundo: mistério criminal, drama de família, debate filosófico e julgamento no mesmo livro.',
    encontra: 'Deus, liberdade, parricídio — e o capítulo do Grande Inquisidor, que muita gente lê sozinho.',
    dificuldade: '4 de 5 — longo e cheio de desvios que valem a pena.',
    ritmo: 'Lento, com picos altíssimos.',
    gostouDe: 'Crime e Castigo, Guerra e paz',
    naoEspere: 'Pressa. É um livro para morar dentro.',
  }, ['fé', 'liberdade', 'família', 'crime', 'moral', 'justiça'], [
    c(1096, 'o crime interior de Raskólnikov vira crime de família'),
    c(1075, 'Ivan Karamázov e Nietzsche chegam ao mesmo abismo por lados opostos'),
    c(1077, 'o Grande Inquisidor é a cidade perfeita de Platão sem liberdade'),
  ]),
  f(1075, {
    oque: 'Poema filosófico em forma de profecia.',
    encontra: 'A morte de Deus, o além-do-homem, o eterno retorno, a vontade de poder.',
    dificuldade: '4 de 5 — não pela linguagem, pelas metáforas.',
    ritmo: 'Fragmentado; capítulos curtos, como sermões.',
    gostouDe: 'Meditações, O mundo como vontade e representação',
    naoEspere: 'Argumento em linha reta. Nietzsche pensa por imagens: leia devagar e sem querer resumir.',
  }, ['niilismo', 'valores', 'poder', 'existência', 'religião'], [
    c(1083, 'o mestre de quem Nietzsche partiu — e contra quem se voltou'),
    c(1097, 'Dostoiévski encena a morte de Deus que Zaratustra anuncia'),
    c(L('Além do Bem e do Mal', 'Nietzsche'), 'a mesma filosofia, agora em prosa e sem profeta'),
    c(1096, 'o romance que testou a ideia antes dela existir'),
  ]),
  f(940, {
    oque: 'Distopia política.',
    encontra: 'Vigilância total, o passado reescrito todo dia, a linguagem usada como arma.',
    dificuldade: '2 de 5',
    ritmo: 'Moderado; a terceira parte é implacável.',
    gostouDe: 'A Revolução dos Bichos, O Processo',
    naoEspere: 'Ação heroica. É um livro sobre o que o poder faz com quem resiste.',
  }, ['vigilância', 'poder', 'verdade', 'linguagem', 'totalitarismo'], [
    c(1051, 'a mesma revolução traída, contada como fábula'),
    c(1062, 'o manual que o Partido levou às últimas consequências'),
    c(4982, 'a acusação sem crime, trinta anos antes'),
    c(660, 'tudo o que o Grande Irmão apaga, a Constituição tenta garantir por escrito'),
  ]),
  f(1051, {
    oque: 'Fábula política curta.',
    encontra: 'Como uma revolução vira aquilo que derrubou.',
    dificuldade: '1 de 5',
    ritmo: 'Rápido — uma tarde.',
    gostouDe: '1984, O Príncipe',
    naoEspere: 'Livro infantil. É a União Soviética de Stálin, bicho por bicho.',
  }, ['revolução', 'poder', 'propaganda', 'desigualdade'], [
    c(940, 'o mesmo poder, agora sem fábula nenhuma'),
    c(1108, 'a promessa que a fazenda tenta cumprir'),
    c(1062, 'o porco Napoleão leu Maquiavel'),
  ]),
  f(1062, {
    oque: 'Tratado político curto, dedicado a um governante.',
    encontra: 'Como conquistar e manter o poder, sem moral de enfeite.',
    dificuldade: '2 de 5 — curto, mas cheio de exemplos da Itália do século XVI.',
    ritmo: 'Rápido; capítulos de duas páginas.',
    gostouDe: 'A Arte da Guerra, Macbeth',
    naoEspere: 'Um elogio da maldade. Maquiavel descreve o poder como ele é, não como deveria ser.',
  }, ['poder', 'Estado', 'estratégia', 'virtù', 'fortuna'], [
    c(647, 'o passo seguinte: por que alguém aceitaria um soberano'),
    c(4980, 'a resposta: o poder só é legítimo se vier do povo'),
    c(831, 'a ambição sem a prudência que Maquiavel exigia'),
    c(1106, 'a mesma frieza, aplicada ao campo de batalha'),
  ]),
  f(4980, {
    oque: 'Tratado de filosofia política (1762).',
    encontra: 'Vontade geral, soberania popular, a origem da legitimidade.',
    dificuldade: '3 de 5 — denso, mas curto.',
    ritmo: 'Moderado.',
    gostouDe: 'O Príncipe, A República',
    naoEspere: 'Manual prático. É a ideia que a Revolução Francesa levou para a rua.',
  }, ['Estado', 'soberania', 'liberdade', 'democracia'], [
    c(1062, 'o poder como técnica, antes de virar pacto'),
    c(647, 'o contrato de Hobbes, entregue ao povo e não ao rei'),
    c(660, '"todo o poder emana do povo" (art. 1º, parágrafo único) é Rousseau'),
    c(1077, 'a outra cidade ideal — a que não precisava de consentimento'),
  ]),
  f(1076, {
    oque: 'O diário de um imperador romano, nunca escrito para ser publicado.',
    encontra: 'Estoicismo aplicado: cuidar do que depende de você e aceitar o resto.',
    dificuldade: '2 de 5 — fragmentos curtos, releitura infinita.',
    ritmo: 'Abra em qualquer página.',
    gostouDe: 'O Manual de Epicteto, Assim Falou Zaratustra',
    naoEspere: 'Um sistema. São lembretes de alguém tentando ser melhor num trabalho impossível.',
  }, ['estoicismo', 'disciplina', 'morte', 'virtude', 'poder'], [
    c(1107, 'o mestre indireto de Marco Aurélio, que foi escravo'),
    c(1075, 'outra ética da força — mas sem resignação'),
    c(1062, 'o governante que tentou ter virtude de verdade'),
  ]),
  f(1107, {
    oque: 'Manual estoico de bolso, ditado por um ex-escravo.',
    encontra: 'A divisão entre o que depende de nós e o que não depende — e tudo o que decorre dela.',
    dificuldade: '1 de 5',
    ritmo: 'Meia hora.',
    gostouDe: 'Meditações',
    naoEspere: 'Consolo fácil.',
  }, ['estoicismo', 'liberdade', 'disciplina'], [
    c(1076, 'o imperador que levou este manual para o trono'),
    c(1106, 'a disciplina interior que toda estratégia exige'),
  ]),
  f(1083, {
    oque: 'A obra principal de Schopenhauer.',
    encontra: 'O mundo como representação, uma vontade cega por trás de tudo, e a arte como alívio.',
    dificuldade: '5 de 5 — é um dos grandes sistemas.',
    ritmo: 'Lento; leia livro por livro (são quatro).',
    gostouDe: 'Assim Falou Zaratustra',
    naoEspere: 'Otimismo.',
  }, ['pessimismo', 'vontade', 'arte', 'sofrimento'], [
    c(1075, 'o discípulo que transformou o pessimismo em afirmação'),
    c(1077, 'as Ideias de Platão voltam na teoria da arte'),
  ]),
  f(1077, {
    oque: 'Diálogo filosófico.',
    encontra: 'Justiça, a cidade ideal, o mito da caverna, o governo dos filósofos.',
    dificuldade: '3 de 5',
    ritmo: 'Moderado — é uma conversa.',
    gostouDe: 'Do Contrato Social, Meditações',
    naoEspere: 'Democracia. Platão desconfia dela.',
  }, ['justiça', 'Estado', 'conhecimento', 'educação', 'verdade'], [
    c(4980, 'a cidade legítima que Platão não quis fundar'),
    c(940, 'a cidade perfeita vista pelo avesso'),
    c(1097, 'o Grande Inquisidor governa como um filósofo-rei'),
  ]),
  f(545, {
    oque: 'Romance narrado por um homem que quer provar uma traição.',
    encontra: 'Ciúme, memória, e um narrador em quem não dá para confiar.',
    dificuldade: '2 de 5',
    ritmo: 'Capítulos curtíssimos.',
    gostouDe: 'Memórias Póstumas de Brás Cubas, Crime e Castigo',
    naoEspere: 'A resposta. Se Capitu traiu, o livro não diz — e é por isso que ele é grande.',
  }, ['ciúme', 'memória', 'narrador', 'casamento'], [
    c(1171, 'o outro narrador de Machado que mente com charme'),
    c(1096, 'outra consciência que se julga sozinha'),
    c(544, 'o mesmo Rio de Janeiro, visto pelo dinheiro'),
  ]),
  f(1171, {
    oque: 'Romance narrado por um defunto.',
    encontra: 'Ironia, a vaidade da elite carioca, e a filosofia do Humanitismo.',
    dificuldade: '3 de 5',
    ritmo: 'Capítulos curtos e desvios constantes.',
    gostouDe: 'Dom Casmurro, Viagens de Gulliver',
    naoEspere: 'Enredo. O prazer é a voz.',
  }, ['ironia', 'morte', 'elite', 'Brasil', 'vaidade'], [
    c(545, 'o outro narrador de Machado em quem não se deve confiar'),
    c(544, 'o Humanitismo sai daqui e vira um romance inteiro'),
    c(1449, 'a mesma sátira da humanidade, com outro disfarce'),
    c(3043, 'Machado rindo da ciência que se acha dona da razão'),
  ]),
  f(1609, {
    oque: 'Reportagem, ensaio e épico sobre a Guerra de Canudos.',
    encontra: 'A terra, o homem e a luta — o Brasil do litoral massacrando o do interior.',
    dificuldade: '5 de 5 — a primeira parte é geologia pura; vale a travessia.',
    ritmo: 'Lento até "A luta"; depois, não para.',
    gostouDe: 'Triste Fim de Policarpo Quaresma, Guerra e paz',
    naoEspere: 'Neutralidade. Euclides foi como cronista do Exército e voltou acusando-o.',
  }, ['Brasil', 'guerra', 'República', 'sertão', 'religião'], [
    c(2667, 'o patriota que acredita no Brasil e é esmagado por ele'),
    c(1099, 'outra guerra contada por quem quer entender o povo, não os generais'),
    c(660, 'a República que Canudos supostamente ameaçava'),
  ]),
  f(2667, {
    oque: 'Romance satírico da Primeira República.',
    encontra: 'Um patriota ingênuo contra um país que ri dele.',
    dificuldade: '2 de 5',
    ritmo: 'Moderado.',
    gostouDe: 'Dom Quixote, Os Sertões',
    naoEspere: 'Final feliz — está no título.',
  }, ['Brasil', 'nacionalismo', 'República', 'ironia'], [
    c(1409, 'o mesmo idealista, trocando os cavaleiros pela pátria'),
    c(1609, 'a República que ele serve fazendo o que fez em Canudos'),
    c(1171, 'a elite que Lima Barreto e Machado viam de lados opostos'),
  ]),
  f(3043, {
    oque: 'Novela satírica curta.',
    encontra: 'Um médico que decide quem é louco e acaba internando a cidade inteira.',
    dificuldade: '1 de 5',
    ritmo: 'Uma tarde.',
    gostouDe: 'A metamorfose, Memórias Póstumas de Brás Cubas',
    naoEspere: 'Tratado de psiquiatria. É sobre poder.',
  }, ['loucura', 'poder', 'ciência', 'ironia'], [
    c(4983, 'outra instituição que ninguém consegue questionar'),
    c(1062, 'Bacamarte governa pela ciência como o príncipe pela força'),
    c(1171, 'Machado, de novo, rindo de quem se acha dono da razão'),
  ]),
  f(1449, {
    oque: 'Sátira disfarçada de livro de viagem.',
    encontra: 'Liliputianos, gigantes, cientistas absurdos e cavalos mais humanos que os humanos.',
    dificuldade: '2 de 5',
    ritmo: 'Episódico — uma viagem por vez.',
    gostouDe: 'Alice no País das Maravilhas, Memórias Póstumas de Brás Cubas',
    naoEspere: 'Livro infantil. A última viagem é amarga.',
  }, ['sátira', 'viagem', 'política', 'humanidade'], [
    c(4996, 'outro mundo às avessas para falar deste'),
    c(1171, 'a mesma desconfiança da vaidade humana'),
    c(940, 'Laputa é o primeiro governo de especialistas que perdeu o chão'),
  ]),
  f(4990, {
    oque: 'Aventura planetária (1912) — o livro que inventou a "espada e planeta".',
    encontra: 'Um soldado levado a Marte fica mais forte que todos na gravidade menor — e vira lenda.',
    dificuldade: '1 de 5',
    ritmo: 'Rápido, capítulo-gancho.',
    gostouDe: 'Vinte Mil Léguas Submarinas, As minas do rei Salomão',
    naoEspere: 'Ciência plausível. É imaginação pura — e alimentou de Star Wars a Avatar.',
  }, ['progressão', 'planeta', 'guerra', 'aventura'], [
    c(4991, 'a continuação direta'),
    c(4985, 'Marte vindo até nós, catorze anos antes'),
    c(2821, 'o explorador que vira rei num lugar que ninguém mapeou'),
  ]),
  f(4984, {
    oque: 'Novela de ficção científica (1895).',
    encontra: 'Uma viagem ao ano 802.701, e uma humanidade dividida em duas espécies.',
    dificuldade: '2 de 5',
    ritmo: 'Curta.',
    gostouDe: '1984, A Guerra dos Mundos',
    naoEspere: 'Paradoxo temporal. Wells usa o futuro para falar da luta de classes do presente dele.',
  }, ['futuro', 'classes', 'evolução', 'ciência'], [
    c(4985, 'o outro Wells: o futuro que chega de fora'),
    c(940, 'a humanidade dividida, agora por um Partido'),
    c(1108, 'Elóis e Morlocks são burguesia e proletariado levados ao limite'),
  ]),
  f(4992, {
    oque: 'Romance gótico — e o primeiro grande romance de ficção científica.',
    encontra: 'Criação, abandono, e um monstro mais humano que o criador.',
    dificuldade: '2 de 5',
    ritmo: 'Moderado; histórias dentro de histórias.',
    gostouDe: 'O Médico e o Monstro, O Retrato de Dorian Gray',
    naoEspere: 'O monstro do cinema. Este fala, lê Milton e argumenta melhor que o criador.',
  }, ['criação', 'ciência', 'abandono', 'culpa', 'gótico'], [
    c(4994, 'o monstro que vem de dentro do próprio cientista'),
    c(2665, 'outra criação que cobra o preço do criador'),
    c(4984, 'a ciência olhando para o futuro, e não para o túmulo'),
  ]),
  f(1810, {
    oque: 'Poema épico grego, na tradução em verso de Odorico Mendes.',
    encontra: 'A ira de Aquiles e os últimos dias da guerra de Troia.',
    dificuldade: '5 de 5 nesta tradução — português do século XIX, em verso.',
    ritmo: 'Lento; batalhas longas, cenas inesquecíveis.',
    gostouDe: 'Guerra e paz, Dom Quixote',
    naoEspere: 'O cavalo de Troia. Ele não está aqui.',
  }, ['guerra', 'honra', 'destino', 'glória', 'luto'], [
    c(1099, 'a guerra vista de novo, dois mil e seiscentos anos depois'),
    c(1106, 'a guerra como estratégia, e não como glória'),
    c(1409, 'o herói épico visto por quem já não acredita nele'),
  ]),
  f(1106, {
    oque: 'Tratado militar chinês.',
    encontra: 'Vencer sem lutar; conhecer o inimigo e a si mesmo.',
    dificuldade: '1 de 5',
    ritmo: 'Meia hora — e releitura a vida inteira.',
    gostouDe: 'O Príncipe',
    naoEspere: 'Técnica militar detalhada. São princípios.',
  }, ['estratégia', 'guerra', 'poder', 'disciplina'], [
    c(1062, 'a mesma frieza, aplicada ao governo'),
    c(1076, 'a disciplina interior que a estratégia exige'),
  ]),
  f(5004, {
    oque: 'Romance de aventura e vingança.',
    encontra: 'Um homem traído e preso injustamente, que volta rico, paciente e implacável.',
    dificuldade: '2 de 5 — longo, mas não para.',
    ritmo: 'Rápido.',
    gostouDe: 'Os Irmãos Karamázov, O Príncipe',
    naoEspere: 'Vingança rápida. Ela leva centenas de páginas de preparo, e esse é o prazer.',
  }, ['vingança', 'justiça', 'dinheiro', 'prisão', 'transformação'], [
    c(1062, 'Dantès executa a vingança como um príncipe de Maquiavel'),
    c(4990, 'outro homem comum que volta como lenda'),
    c(1097, 'a justiça feita com as próprias mãos, e o que ela custa'),
  ]),
  f(1099, {
    oque: 'Romance histórico sobre a Rússia nas guerras napoleônicas.',
    encontra: 'Cinco famílias, a invasão de 1812, e uma teoria sobre quem realmente faz a história.',
    dificuldade: '4 de 5 — longo e cheio de personagens; vale anotar.',
    ritmo: 'Alterna o salão e a batalha.',
    gostouDe: 'Os Irmãos Karamázov, Os Sertões',
    naoEspere: 'Napoleão como herói.',
  }, ['guerra', 'história', 'família', 'destino', 'Rússia'], [
    c(1810, 'a outra grande guerra da literatura'),
    c(1609, 'a guerra contada de baixo, pelo povo'),
    c(1062, 'Napoleão fazendo tudo o que Maquiavel mandava — e perdendo'),
  ]),
  f(660, {
    oque: 'A lei fundamental do Brasil (1988), no texto compilado.',
    encontra: 'Os direitos fundamentais, a organização do Estado e os limites de quem manda.',
    dificuldade: '3 de 5 — técnico, mas escrito para ser lido por todos.',
    ritmo: 'De consulta. Comece pelo art. 5º.',
    gostouDe: 'Do Contrato Social, O Príncipe',
    naoEspere: 'Narrativa. É uma estrutura — e cada artigo responde a uma história.',
  }, ['direitos', 'Estado', 'democracia', 'poder'], [
    c(4980, 'o parágrafo único do art. 1º é Rousseau'),
    c(1062, 'o poder que a Constituição tenta amarrar'),
    c(940, 'o pesadelo que os direitos fundamentais existem para impedir'),
    c(4982, 'o devido processo legal é o que faltou a Josef K.'),
  ]),
]

// ─────────────────────────────────────────────────────────────
// O RESOLVEDOR: referência → id de obra publicada
//
// Por id, confere que a obra existe e está no ar. Por { t, a }, procura o
// título exato antes do prefixo, e entre os candidatos prefere, nesta ordem:
// o legível, o que está na nossa fila de tradução, e o mais novo — porque a
// obra velha com o mesmo nome costuma ser a ficha de uma edição comercial.
// Devolve null quando não acha: a seção simplesmente não mostra o livro.
// ─────────────────────────────────────────────────────────────
export function criarResolvedor(banco) {
  const legivel = `EXISTS (SELECT 1 FROM texto x WHERE x.obra_id = o.id AND x.idioma = 'pt' AND x.normalizado = 1
                   AND EXISTS (SELECT 1 FROM capitulo c WHERE c.texto_id = x.id))`
  const temFila = (() => {
    try { banco.prepare('SELECT 1 FROM fila_traducao LIMIT 1').get(); return true } catch { return false }
  })()
  const naFila = temFila ? 'EXISTS (SELECT 1 FROM fila_traducao f WHERE f.obra_id = o.id)' : '0'
  const porId = banco.prepare('SELECT id FROM obra WHERE id = ? AND publicada = 1')
  const porTitulo = banco.prepare(`
    SELECT o.id FROM obra o
      LEFT JOIN obra_pessoa op ON op.obra_id = o.id AND op.papel = 'autor'
      LEFT JOIN pessoa p ON p.id = op.pessoa_id
     WHERE o.publicada = 1
       AND (o.titulo LIKE ? OR o.titulo_pt LIKE ?)
       AND (? = '' OR p.nome LIKE ?)
     ORDER BY ${legivel} DESC,
              (o.titulo = ? OR o.titulo_pt = ?) DESC,
              ${naFila} DESC,
              o.id DESC
     LIMIT 1`)
  return (ref) => {
    if (typeof ref === 'number') return porId.get(ref)?.id ?? null
    const a = ref.a ?? ''
    return porTitulo.get(`${ref.t}%`, `${ref.t}%`, a, `%${a}%`, ref.t, ref.t)?.id ?? null
  }
}
