// A camada editorial, escrita à mão.
//
// Este arquivo é a semente do que docs/ARQUITETURA.md chama de "contexto":
// texto que explica por que a obra importa e o que observar nela. Está escrito
// por gente, de propósito — é o padrão de qualidade que a geração em lote vai
// ter que imitar depois, e sem um padrão não há como julgar o que a máquina
// escrever.
//
// Vai para a tabela `fragmento`, que é onde o contexto mora. Nada de texto
// editorial solto no código do site.
//
//   node ingestao/curadoria.mjs

import { abrir, fechar, recriarDerivada } from '../servidor/banco/base.mjs'

/**
 * `casa` bate no começo do título. `chamada` é a frase da capa — aparece no
 * destaque e no cartão. `porque` é a página da obra. `observar` é o que o
 * leitor leva antes de começar.
 */
const FICHAS = [
  {
    casa: 'Dom Casmurro',
    chamada: 'A pergunta não é se Capitu traiu. É se dá para acreditar em quem está contando.',
    porque: 'Um homem velho manda construir uma réplica da casa em que cresceu, para ver se a casa devolve a vida que ele teve. Não devolve — então ele escreve. O livro é a defesa dele, feita por ele, sobre um casamento que acabou mal. Machado publicou em 1899, no fim de uma carreira em que passou a vida escrevendo narradores em quem não se pode confiar, e este é o mais bem-acabado deles.',
    observar: 'Repare em quem está falando. Bentinho conta tudo: escolhe o que entra, o que fica de fora, e a ordem. Toda prova contra Capitu passa pela boca dele. Ao terminar um capítulo, pergunte: isso aconteceu, ou é ele dizendo que aconteceu?',
  },
  {
    casa: 'Memorias Posthumas',
    chamada: 'Um defunto conta a própria vida — e não tem mais nada a perder mentindo.',
    porque: 'Em 1881 Machado inventou um narrador morto, que escreve depois de acabado tudo e por isso não deve satisfação a ninguém. É o livro em que a literatura brasileira deixa de imitar o romance europeu e começa a fazer outra coisa. A ironia não é enfeite: é o método.',
    observar: 'Brás Cubas se diverte com o leitor e interrompe a própria história para falar com você. Repare quando ele faz isso — quase sempre é quando está prestes a admitir alguma mesquinharia.',
  },
  {
    casa: 'Quincas Borba',
    chamada: 'Uma filosofia que justifica qualquer crueldade, levada a sério por um homem só.',
    porque: 'O Humanitismo — a doutrina que Quincas Borba inventa — diz que ao vencedor cabe tudo, e que o derrotado não tem do que reclamar. Machado põe essa ideia na cabeça de Rubião e mostra o que ela faz com uma pessoa comum. É um livro sobre como uma teoria bonita vira permissão.',
    observar: 'Preste atenção em quem repete a frase "ao vencedor, as batatas", e em que situação. A frase muda de sentido conforme quem a usa.',
  },
  {
    casa: 'O Cortiço',
    chamada: 'O prédio é o personagem: cresce, engorda e devora quem mora nele.',
    porque: 'Aluísio Azevedo publicou em 1890 um romance em que o ambiente decide o destino das pessoas — é a tese naturalista levada até o fim. Vale ler pelo retrato do Rio pobre do século XIX, e vale discutir: o livro explica gente por raça e por meio, e isso é parte do que se estuda nele hoje.',
    observar: 'Note quando o narrador descreve o cortiço como se fosse um corpo vivo. E note o que ele diz sobre as personagens negras e portuguesas — a visão do autor está ali, e é datada.',
  },
  {
    casa: 'Iracema',
    chamada: 'A fundação do Ceará contada como lenda — e a lenda tem um preço.',
    porque: 'Alencar quis dar ao Brasil um mito de origem, e escreveu em 1865 uma prosa que imita o ritmo da poesia. Iracema e Martim geram Moacir, "o filho do sofrimento": o encontro entre indígena e colonizador vira nascimento e vira perda ao mesmo tempo.',
    observar: 'Repare que a língua do livro é toda torcida para soar antiga e indígena. E repare quem morre no fim, e quem fica.',
  },
  {
    casa: 'O Guarany',
    chamada: 'O romance de aventura que virou ópera, novela e imaginário nacional.',
    porque: 'Peri e Ceci fundaram um jeito de o Brasil se imaginar: o índio nobre, a moça branca, a floresta como cenário grandioso. Alencar publicou em folhetim, capítulo a capítulo, e a estrutura mostra — cada trecho termina puxando o seguinte.',
    observar: 'Peri é indígena idealizado a ponto de deixar de ser gente. Pergunte o tempo todo: quem está descrevendo, e para quem?',
  },
  {
    casa: 'A Cidade e as Serras',
    chamada: 'Um homem que tem tudo em Paris descobre que não sente nada.',
    porque: 'Eça de Queirós escreveu, no fim da vida, a comédia de um civilizadíssimo Jacinto cercado de máquinas, telefones e teorias — e completamente vazio. O contraste com a serra portuguesa é a tese do livro, e Eça sabe que ela é simples demais; é por isso que a escreve rindo.',
    observar: 'Conte quantos aparelhos Jacinto possui no começo e quantos usa. A comédia está nessa diferença.',
  },
  {
    casa: 'Minha formação',
    chamada: 'O abolicionista contando como se formou — e o que a formação dele custou aos outros.',
    porque: 'Joaquim Nabuco escreve suas memórias em 1900 e conta a educação de um filho da elite escravocrata que se tornou o principal nome do abolicionismo. O livro é uma peça central para entender como a elite brasileira se via a si mesma.',
    observar: 'Repare onde ele se comove e onde ele passa por cima. As duas coisas dizem muito.',
  },
  {
    casa: 'Esau e Jacob',
    chamada: 'Dois irmãos gêmeos que discordam de tudo, e um país que faz o mesmo.',
    porque: 'Machado escreveu a rivalidade de Pedro e Paulo em paralelo à passagem do Império para a República. Os irmãos brigam por monarquia e república, por uma mulher, por qualquer coisa — e a discórdia é a única coisa constante.',
    observar: 'Conselheiro Aires narra sem tomar partido, o tempo todo. Pergunte se isso é sabedoria ou covardia.',
  },
  {
    casa: 'Helena',
    chamada: 'Um testamento revela uma irmã que ninguém sabia que existia.',
    porque: 'Romance de 1876, ainda da fase em que Machado trabalhava dentro do molde romântico — e já minando o molde por dentro. Serve bem para ver de onde ele partiu antes de Brás Cubas.',
    observar: 'Note como o segredo é usado: ele não é só reviravolta, é o que organiza o comportamento de todo mundo antes de ser revelado.',
  },
  {
    casa: 'Os Lusíadas',
    chamada: 'Um país pequeno escreve a si mesmo como epopeia — e o velho do Restelo avisa que vai dar errado.',
    porque: 'Camões publicou em 1572 o poema que fundou a língua. Conta a viagem de Vasco da Gama, mas o que interessa é o que ele faz com ela: mistura deuses gregos, história recente e ansiedade nacional numa coisa só. É difícil, e vale.',
    observar: 'No Canto IV aparece um velho anônimo que xinga a expedição inteira antes de ela zarpar. Camões escreveu o próprio contraditório dentro do próprio elogio. Pergunte por que ele fez isso.',
  },
  {
    casa: 'Os Maias',
    chamada: 'Uma família, um país e um século — e a decadência dos três ao mesmo tempo.',
    porque: 'Eça de Queirós despeja Lisboa inteira em 1888: a política que não decide, a imprensa que inventa, os salões que repetem frases francesas. Carlos da Maia tem tudo e não faz nada, e o livro sabe disso melhor que ele. São dezesseis horas de leitura, e é a obra mais completa do realismo em português.',
    observar: 'Repare em quantas vezes alguém anuncia um grande projeto que nunca sai do papel. É a piada que estrutura o livro, e ela não é sobre uma pessoa.',
  },
  {
    casa: 'O Primo Bazilio',
    chamada: 'Um adultério de província contado sem heroísmo nenhum — e é isso que dói.',
    porque: 'Eça pega o enredo mais banal do século e recusa dar grandeza a ele. Luísa não é trágica, Basílio não é sedutor, e a criada que descobre tudo é quem manda no livro. Machado de Assis escreveu uma crítica famosa acusando Eça de deixar o acaso resolver — vale ler as duas coisas.',
    observar: 'Acompanhe Juliana, a criada. O poder muda de mão quando ela acha a carta, e o romance passa a ser sobre chantagem doméstica, não sobre amor.',
  },
  {
    casa: 'O crime do padre Amaro',
    chamada: 'Um padre jovem, uma cidade pequena, e a instituição fechando os olhos.',
    porque: 'O primeiro grande romance de Eça, de 1875, e o mais direto: uma acusação ao clero de província e à sociedade que o sustenta. Foi escândalo, e o autor reescreveu o livro três vezes. A raiva ainda está toda lá.',
    observar: 'Note quem paga o preço no fim, e quem não paga nada. Não é distribuição por acaso — é a tese.',
  },
  {
    casa: 'A Relíquia',
    chamada: 'Um beato falso vai a Jerusalém e volta com a prova errada.',
    porque: 'Eça em modo cômico, e um dos livros mais engraçados da língua. Teodoro finge devoção para herdar da tia, e a farsa desmorona por um embrulho trocado. Por baixo da comédia, uma tese: a fé de fachada é um negócio, e todo mundo sabe.',
    observar: 'Teodoro narra a própria safadeza sem perceber que está se entregando. Repare no que ele acha que é normal.',
  },
  {
    casa: 'O Mandarim',
    chamada: 'Mate um velho do outro lado do mundo tocando uma sineta, e fique rico. Você tocaria?',
    porque: 'Novela curta de 1880 em que Eça pega um dilema moral abstrato e o leva a sério até o fim. Cabe numa hora, e é a porta de entrada mais fácil para o autor.',
    observar: 'A pergunta do livro não é se Teodoro toca a sineta. É se a distância torna o crime menor — e o que isso diz de nós.',
  },
  {
    casa: 'Amor de Perdição',
    chamada: 'Escrito em quinze dias, na cadeia, por um homem preso pelo mesmo motivo que condena o personagem.',
    porque: 'Camilo Castelo Branco escreveu este romance em 1861 na Cadeia da Relação do Porto, onde estava preso por adultério. Simão e Teresa amam contra as famílias e perdem. É o livro mais lido do romantismo português, e o mais rápido de todos eles.',
    observar: 'A prosa é curta, seca e apressada. Não é falta de capricho: é um homem escrevendo contra o relógio, e dá para ouvir.',
  },
  {
    casa: 'Viagens na Minha Terra (Completo)',
    chamada: 'Uma viagem de Lisboa a Santarém que não é sobre a viagem.',
    porque: 'Garrett inventou, em 1846, uma coisa que ainda parece moderna: um livro que interrompe a si mesmo o tempo todo para falar de política, de literatura e do próprio livro. No meio disso cabe a história de Carlos e Joaninha, e ela não termina bem.',
    observar: 'Conte quantas vezes o narrador promete voltar ao assunto. A digressão é a forma, não o defeito.',
  },
  {
    casa: 'A Morgadinha dos Cannaviaes',
    chamada: 'Um homem da cidade vai para a aldeia curar o tédio, e a aldeia tem opinião própria.',
    porque: 'Júlio Dinis escreveu em 1868 o romance mais gentil desta lista: sem vilão, sem tragédia, com gente comum tentando se entender. É longo e é doce, e funciona bem para quem quer literatura do século XIX sem sofrimento.',
    observar: 'Repare como o livro trata o interior — nem paraíso, nem atraso. Era raro na época, e continua raro.',
  },
  {
    casa: 'Os sonetos completos',
    chamada: 'Um homem tenta pensar Deus até o fim e não sobrevive à conclusão.',
    porque: 'Antero de Quental levou a filosofia alemã para dentro do soneto português e passou a vida ali. São poemas de dúvida, não de fé nem de negação. Ele se matou em 1891, e a obra é lida desde então à sombra disso — o que é justo e injusto ao mesmo tempo.',
    observar: 'Leia dois ou três por vez, não a coleção inteira. São argumentos, e argumento seguido cansa mais que verso.',
  },
  {
    casa: 'O Livro de Cesario Verde',
    chamada: 'O primeiro poeta a olhar para a rua da cidade e achar que aquilo era assunto.',
    porque: 'Cesário Verde morreu aos 31 anos, em 1886, sem publicar livro. Um amigo reuniu os poemas depois. Ele escreve sobre vendedoras, hospitais, calçada e cansaço — matéria que a poesia da época achava baixa demais. Fernando Pessoa o citou como mestre.',
    observar: '"O Sentimento dum Ocidental" é o poema central. Repare que ele descreve Lisboa andando, na altura dos olhos, e não do alto.',
  },
  {
    casa: 'Ubirajara',
    chamada: 'Alencar tenta imaginar o indígena antes da chegada de qualquer europeu.',
    porque: 'Publicado em 1874, é a terceira ponta do projeto indianista de Alencar — e a mais estranha, porque não há colonizador nenhum na história. Ele quis reconstruir um mundo, e reconstruiu com as ferramentas do romance europeu. O resultado diz mais sobre 1874 do que sobre o século XVI.',
    observar: 'Alencar pôs notas de rodapé eruditas para provar que pesquisou. Leia as notas: elas são metade do livro, e mostram o que ele estava tentando defender.',
  },
  {
    casa: 'Cinco minutos',
    chamada: 'Perder um bonde por cinco minutos muda uma vida inteira.',
    porque: 'A primeira ficção publicada de Alencar, de 1856, em forma de carta. É curtíssima — uma hora — e serve de porta de entrada tanto para o autor quanto para o romantismo brasileiro, sem compromisso.',
    observar: 'Tudo é contado por quem está apaixonado, para a pessoa amada. Pergunte o que essa escolha esconde.',
  },
  {
    casa: 'A Queda',
    chamada: 'Um fidalgo do interior vai a Lisboa fazer política e volta outro homem — pior.',
    porque: 'Camilo em modo satírico, de 1866. Calisto Elói chega ao parlamento com princípios rígidos e os troca um a um. É comédia, e é a coisa mais atual desta lista.',
    observar: 'Marque o momento exato em que ele cede pela primeira vez. Depois dele, o resto é ladeira.',
  },
]

const banco = abrir()

// `fragmento` só guarda conteúdo que os scripts refazem — dá para recriar
// quando o esquema muda, e é o que fazemos aqui.
recriarDerivada(banco, 'fragmento')

const acha = banco.prepare(
  `SELECT id, titulo FROM obra WHERE publicada = 1 AND titulo LIKE ? ORDER BY id LIMIT 1`)
const poe = banco.prepare(
  `INSERT INTO fragmento (obra_id, tipo, titulo, corpo, revela_ate, natureza, gerado_por, revisado)
   VALUES (?,?,?,?,0,?, 'humano', 1)`)

let feitas = 0, faltando = []
banco.exec('BEGIN')
for (const f of FICHAS) {
  const o = acha.get(`${f.casa}%`)
  if (!o) { faltando.push(f.casa); continue }
  // a chamada é fato sobre a obra; o "por que" e o "observar" são leitura,
  // e o site precisa mostrar essa diferença
  poe.run(o.id, 'chamada', null, f.chamada, 'fato')
  poe.run(o.id, 'porque_existe', 'Por que este livro existe', f.porque, 'fato')
  poe.run(o.id, 'como_ler', 'O que observar', f.observar, 'interpretacao')
  feitas++
}
banco.exec('COMMIT')

console.log(`fichas escritas . ${feitas}`)
if (faltando.length) console.log(`não achei ....... ${faltando.join(', ')}`)
fechar()
