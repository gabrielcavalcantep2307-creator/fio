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
