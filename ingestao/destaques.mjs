// Os livros que as pessoas realmente querem ler.
//
//   node ingestao/destaques.mjs
//
// **O problema que isto resolve.** O acervo livre é do século XIX. Alguém que
// abre a biblioteca hoje quer ver *Sapiens*, *Torto Arado*, *1984*, *Duna* —
// e, se não vê, conclui que o lugar é um museu.
//
// Não podemos servir o texto de nenhum deles. Podemos — e isso é o produto —
// ter a ficha, a capa, a frase que explica por que importa, e o caminho para
// achá-lo. É o trilho B fazendo o trabalho para o qual ele existe.
//
// A busca é por TÍTULO + AUTOR, e não só por autor: aqui a curadoria é obra a
// obra, e trazer "mais oito coisas do Harari" seria justamente o contrário.

import { abrir, fechar } from '../servidor/banco/base.mjs'

const PAUSA = 1200
const UA = 'fio/0.1 (biblioteca em portugues; contato: toksr12@gmail.com)'

// `chamada` é escrita à mão. É o que separa uma estante de uma planilha.
const COLECOES = [
  {
    nome: 'Todo mundo está lendo',
    resumo: 'Os livros que aparecem em toda conversa. Nenhum deles pode ser servido aqui — mas a ficha, a capa e o caminho para achá-lo, sim.',
    livros: [
      { titulo: 'A revolução dos bichos', autor: 'George Orwell', chamada: 'Uma fábula de cento e vinte páginas sobre como uma revolução justa vira exatamente aquilo que derrubou.' },
      { titulo: '1984', autor: 'George Orwell', chamada: 'O livro que deu nome ao que a gente teme: a vigilância, a língua encolhida, o passado reescrito.' },
      { titulo: 'Sapiens', autor: 'Yuval Noah Harari', chamada: 'Setenta mil anos de história humana com uma tese: o que nos separou dos outros bichos foi a capacidade de acreditar em coisas que não existem.' },
      { titulo: 'Torto arado', autor: 'Itamar Vieira Junior', chamada: 'Duas irmãs, uma faca e uma comunidade quilombola na Bahia. O romance brasileiro mais premiado da década.' },
      { titulo: 'Rápido e devagar', autor: 'Daniel Kahneman', chamada: 'Um Nobel explicando, com quarenta anos de experimento, por que você erra do jeito que erra.' },
      { titulo: 'O homem em busca de um sentido', autor: 'Viktor Frankl', chamada: 'Um psiquiatra sobrevive a Auschwitz e escreve sobre o que sustenta uma pessoa quando tudo é tirado.' },
      { titulo: 'Ensaio sobre a cegueira', autor: 'José Saramago', chamada: 'Uma cidade inteira fica cega, menos uma pessoa. O que acontece depois não é sobre os olhos.' },
      { titulo: 'Cem anos de solidão', autor: 'Gabriel García Márquez', chamada: 'Sete gerações de uma família e de um vilarejo, contadas como se milagre e cotidiano fossem a mesma coisa.' },
      { titulo: 'A hora da estrela', autor: 'Clarice Lispector', chamada: 'Uma nordestina pobre no Rio, narrada por um homem que não sabe como contá-la — e diz isso o tempo todo.' },
      { titulo: 'Quarto de despejo', autor: 'Carolina Maria de Jesus', chamada: 'O diário de uma catadora de papel na favela do Canindé, escrito em cadernos achados no lixo. Vendeu cem mil exemplares em 1960.' },
      { titulo: 'Vidas secas', autor: 'Graciliano Ramos', chamada: 'Uma família e uma cachorra atravessando o sertão. A cachorra tem o capítulo mais bonito.' },
      { titulo: 'Duna', autor: 'Frank Herbert', chamada: 'Deserto, especiaria e profecia — e uma advertência sobre o que acontece com quem segue um messias.' },
      { titulo: 'O problema dos três corpos', autor: 'Cixin Liu', chamada: 'A Revolução Cultural chinesa, um sinal do espaço, e a pior resposta possível a ele.' },
      { titulo: 'Como as democracias morrem', autor: 'Steven Levitsky', chamada: 'Democracias não caem mais por golpe militar. Caem devagar, por dentro, e este livro lista os sinais.' },
      { titulo: 'Pequeno manual antirracista', autor: 'Djamila Ribeiro', chamada: 'Onze capítulos curtos sobre o que fazer, e não só sobre o que sentir.' },
      { titulo: 'A psicologia financeira', autor: 'Morgan Housel', chamada: 'Dinheiro é menos matemática e mais comportamento — e o comportamento não se aprende em planilha.' },
    ],
  },
  {
    nome: 'Poder e sociedade',
    resumo: 'Do manual de um conselheiro florentino do século XVI até a vigilância de hoje. Cada um pega o anterior e discorda dele.',
    livros: [
      { titulo: 'O príncipe', autor: 'Maquiavel', chamada: 'O primeiro livro a descrever o poder como ele é, e não como deveria ser. Escrito para conseguir emprego.' },
      { titulo: 'A arte da guerra', autor: 'Sun Tzu', chamada: 'Vencer sem lutar é o topo da arte. Dois mil e quinhentos anos depois, ainda se cita em reunião.' },
      { titulo: 'Vigiar e punir', autor: 'Michel Foucault', chamada: 'Como a punição saiu da praça pública e entrou na cabeça de todo mundo.' },
      { titulo: 'Origens do totalitarismo', autor: 'Hannah Arendt', chamada: 'O que precisa acontecer numa sociedade antes que o pior se torne possível.' },
      { titulo: 'Eichmann em Jerusalém', autor: 'Hannah Arendt', chamada: 'O relato do julgamento que deu ao mundo a expressão "banalidade do mal" — e a briga que ela causou.' },
      { titulo: 'Casa-grande & senzala', autor: 'Gilberto Freyre', chamada: 'A interpretação do Brasil que mais influenciou o país, e a que mais se discute até hoje.' },
      { titulo: 'Raízes do Brasil', autor: 'Sérgio Buarque de Holanda', chamada: 'De onde vem o "homem cordial" — que não quer dizer gentil, e quase todo mundo entende errado.' },
      { titulo: 'Os donos do poder', autor: 'Raymundo Faoro', chamada: 'A tese de que o Estado brasileiro nunca foi capturado por uma elite: ele sempre foi a elite.' },
    ],
  },
  {
    nome: 'Distopias que continuam atuais',
    resumo: 'Escritas para falar do presente de quem escreveu, e por isso ainda falam do nosso.',
    livros: [
      { titulo: 'Admirável mundo novo', autor: 'Aldous Huxley', chamada: 'A tirania que não precisa de medo: basta dar prazer suficiente para ninguém querer sair.' },
      { titulo: 'Fahrenheit 451', autor: 'Ray Bradbury', chamada: 'Bombeiros que queimam livros — e uma população que já tinha parado de lê-los antes disso.' },
      { titulo: 'O conto da aia', autor: 'Margaret Atwood', chamada: 'Atwood disse que não escreveu nada que não tivesse acontecido em algum lugar.' },
      { titulo: 'Laranja mecânica', autor: 'Anthony Burgess', chamada: 'Um jovem violento é "curado" pelo Estado. O livro pergunta se isso é melhor.' },
      { titulo: 'Neuromancer', autor: 'William Gibson', chamada: 'Inventou a palavra "ciberespaço" em 1984, antes de existir internet para a maioria.' },
    ],
  },
  {
    nome: 'Para começar a pensar',
    resumo: 'Filosofia e pensamento crítico sem exigir que você já saiba filosofia.',
    livros: [
      { titulo: 'O mundo assombrado pelos demônios', autor: 'Carl Sagan', chamada: 'Um manual de detecção de baboseira, escrito com uma paciência que hoje faz falta.' },
      { titulo: 'A lógica do cisne negro', autor: 'Nassim Nicholas Taleb', chamada: 'O que decide a história são os eventos que ninguém previu — e nós continuamos prevendo.' },
      { titulo: 'O mito de Sísifo', autor: 'Albert Camus', chamada: 'Se a vida não tem sentido dado, a primeira pergunta séria da filosofia é por que continuar.' },
      { titulo: 'Assim falou Zaratustra', autor: 'Friedrich Nietzsche', chamada: 'Escrito como profecia, e feito para irritar quem procura conforto.' },
      { titulo: 'Meditações', autor: 'Marco Aurélio', chamada: 'O diário particular de um imperador romano, escrito só para ele mesmo. Talvez por isso funcione.' },
      { titulo: 'A república', autor: 'Platão', chamada: 'A pergunta é "o que é justiça". A resposta leva a inventar uma cidade inteira.' },
    ],
  },
  {
    nome: 'Filosofia, do começo ao fim',
    resumo: 'Vinte e cinco séculos em ordem. Cada um responde ao anterior — e é por isso que a ordem importa.',
    livros: [
      { titulo: 'A república', autor: 'Platão', chamada: 'A pergunta é "o que é justiça". A resposta leva a inventar uma cidade inteira — e a expulsar os poetas dela.' },
      { titulo: 'Ética a Nicômaco', autor: 'Aristóteles', chamada: 'Como viver bem não é uma regra: é um hábito que se treina. A ideia mais prática da filosofia antiga.' },
      { titulo: 'Meditações', autor: 'Marco Aurélio', chamada: 'O diário particular de um imperador romano, escrito só para ele mesmo. Talvez por isso funcione.' },
      { titulo: 'Cartas a Lucílio', autor: 'Sêneca', chamada: 'Cento e vinte e quatro cartas de um homem riquíssimo explicando por que a riqueza não resolve.' },
      { titulo: 'Discurso do método', autor: 'René Descartes', chamada: 'Duvidar de tudo até achar o que não dá para duvidar. Sessenta páginas que reiniciaram a filosofia.' },
      { titulo: 'Ensaios', autor: 'Michel de Montaigne', chamada: 'Inventou o ensaio para responder a uma pergunta: o que eu sei? A resposta, honesta, é "quase nada".' },
      { titulo: 'Crítica da razão pura', autor: 'Immanuel Kant', chamada: 'O livro mais difícil desta lista, e o divisor de águas: o que a mente pode conhecer, e onde ela para.' },
      { titulo: 'O mundo como vontade e representação', autor: 'Arthur Schopenhauer', chamada: 'O primeiro filósofo europeu a levar o budismo a sério, e o mais bem-escrito dos alemães.' },
      { titulo: 'Assim falou Zaratustra', autor: 'Friedrich Nietzsche', chamada: 'Escrito como profecia, e feito para irritar quem procura conforto.' },
      { titulo: 'Genealogia da moral', autor: 'Friedrich Nietzsche', chamada: 'De onde vieram "bom" e "mau" — e a suspeita de que quem os inventou tinha interesse.' },
      { titulo: 'O ser e o nada', autor: 'Jean-Paul Sartre', chamada: 'Estamos condenados a ser livres, e a liberdade é mais pesada do que parece.' },
      { titulo: 'O mito de Sísifo', autor: 'Albert Camus', chamada: 'Se a vida não tem sentido dado, a primeira pergunta séria da filosofia é por que continuar.' },
      { titulo: 'Investigações filosóficas', autor: 'Ludwig Wittgenstein', chamada: 'Metade dos problemas da filosofia são problemas de linguagem — e ele tinha escrito o livro anterior dizendo o contrário.' },
      { titulo: 'A condição humana', autor: 'Hannah Arendt', chamada: 'A diferença entre trabalhar, produzir e agir — e por que só a última faz de alguém uma pessoa pública.' },
      { titulo: 'As palavras e as coisas', autor: 'Michel Foucault', chamada: 'Cada época tem regras invisíveis sobre o que pode ser dito. Este livro procura as nossas.' },
      { titulo: 'Sociedade do cansaço', autor: 'Byung-Chul Han', chamada: 'A opressão de hoje não vem de fora: é você cobrando de si mesmo, sem parar, achando que é liberdade.' },
    ],
  },
  {
    nome: 'Top 10 — Política no Brasil',
    resumo: 'Dez livros para entender por que o país funciona como funciona. Do Império à semana passada.',
    livros: [
      { titulo: 'Os donos do poder', autor: 'Raymundo Faoro', chamada: 'A tese de que o Estado brasileiro nunca foi capturado por uma elite: ele sempre foi a elite.' },
      { titulo: 'Raízes do Brasil', autor: 'Sérgio Buarque de Holanda', chamada: 'De onde vem o "homem cordial" — que não quer dizer gentil, e quase todo mundo entende errado.' },
      { titulo: 'Casa-grande & senzala', autor: 'Gilberto Freyre', chamada: 'A interpretação do Brasil que mais influenciou o país, e a que mais se discute até hoje.' },
      { titulo: 'Cidadania no Brasil', autor: 'José Murilo de Carvalho', chamada: 'Aqui os direitos sociais vieram antes dos políticos — e isso explica muita coisa.' },
      { titulo: 'História concisa do Brasil', autor: 'Boris Fausto', chamada: 'Quinhentos anos em quatrocentas páginas, sem simplificar o que não dá.' },
      { titulo: 'Brasil: uma biografia', autor: 'Lilia Moritz Schwarcz', chamada: 'A história do país contada por quem se pergunta quem foi deixado de fora dela.' },
      { titulo: '1808', autor: 'Laurentino Gomes', chamada: 'A corte portuguesa inteira atravessa o Atlântico fugindo de Napoleão. É história, e lê-se como romance.' },
      { titulo: 'A elite do atraso', autor: 'Jessé Souza', chamada: 'A tese incômoda: a corrupção que o país denuncia é a que aparece, e não a que decide.' },
      { titulo: 'O que é o Brasil?', autor: 'Darcy Ribeiro', chamada: 'Um antropólogo tentando responder à pergunta mais difícil sobre o próprio país.' },
      { titulo: 'Como as democracias morrem', autor: 'Steven Levitsky', chamada: 'Democracias não caem mais por golpe militar. Caem devagar, por dentro, e este livro lista os sinais.' },
    ],
  },
  {
    nome: 'Clássicos que todo mundo gosta',
    resumo: 'Os que aparecem em toda lista, e continuam aparecendo por um motivo.',
    livros: [
      { titulo: 'Crime e castigo', autor: 'Fiódor Dostoiévski', chamada: 'Um estudante mata uma velha para provar uma teoria. As quinhentas páginas seguintes são a teoria desmoronando.' },
      { titulo: 'Os irmãos Karamázov', autor: 'Fiódor Dostoiévski', chamada: 'Três irmãos, um pai assassinado, e a pergunta se Deus existe — feita por gente de verdade, não por filósofos.' },
      { titulo: 'Anna Kariênina', autor: 'Liev Tolstói', chamada: 'Começa com a frase mais citada da literatura e termina sem dar razão a ninguém.' },
      { titulo: 'Guerra e paz', autor: 'Liev Tolstói', chamada: 'Napoleão invade a Rússia, e o livro insiste que grandes homens não fazem história.' },
      { titulo: 'O pequeno príncipe', autor: 'Antoine de Saint-Exupéry', chamada: 'Escrito para adultos, publicado como infantil, e ninguém nunca corrigiu isso.' },
      { titulo: 'Orgulho e preconceito', autor: 'Jane Austen', chamada: 'Uma comédia de casamento que é, por baixo, um livro sobre dinheiro e sobre não ter nenhum.' },
      { titulo: 'O retrato de Dorian Gray', autor: 'Oscar Wilde', chamada: 'Um homem não envelhece; o retrato dele, sim. E o retrato fica cada vez mais honesto.' },
      { titulo: 'O apanhador no campo de centeio', autor: 'J. D. Salinger', chamada: 'Três dias de um adolescente expulso do colégio, e a voz que inventou toda uma maneira de escrever.' },
      { titulo: 'O sol é para todos', autor: 'Harper Lee', chamada: 'Um julgamento racista no Alabama, visto por uma menina de oito anos que não entende tudo — e por isso entende.' },
      { titulo: 'A metamorfose', autor: 'Franz Kafka', chamada: 'Acorda transformado em inseto. A parte assustadora não é essa: é como a família reage.' },
      { titulo: 'O estrangeiro', autor: 'Albert Camus', chamada: 'É condenado menos pelo crime e mais por não ter chorado no enterro da mãe.' },
      { titulo: 'O senhor dos anéis', autor: 'J. R. R. Tolkien', chamada: 'Inventou línguas antes de inventar o mundo, e o mundo antes de inventar a história.' },
    ],
  },
]

const banco = abrir()

const sql = {
  achaPessoa: banco.prepare('SELECT id FROM pessoa WHERE nome = ?'),
  poePessoa: banco.prepare('INSERT INTO pessoa (nome, nome_ordem) VALUES (?,?)'),
  achaObraOlid: banco.prepare('SELECT id FROM obra WHERE olid_work = ?'),
  achaObraTitulo: banco.prepare(
    `SELECT o.id FROM obra o JOIN obra_pessoa op ON op.obra_id = o.id
       JOIN pessoa p ON p.id = op.pessoa_id
      WHERE o.titulo = ? COLLATE NOCASE AND p.nome = ?`),
  poeObra: banco.prepare(
    `INSERT INTO obra (titulo, ano, idioma_original, olid_work, trilho, publicada, capa_externa, assuntos)
     VALUES (?,?,'pt',?,'B',1,?,?)`),
  liga: banco.prepare('INSERT OR IGNORE INTO obra_pessoa (obra_id, pessoa_id, papel) VALUES (?,?,?)'),
  poeDisp: banco.prepare(
    `INSERT INTO disponibilidade (obra_id, tipo, provedor, rotulo, url, idioma)
     VALUES (?,?,?,?,?,'pt')`),
  temDisp: banco.prepare('SELECT 1 FROM disponibilidade WHERE obra_id = ? AND provedor = ?'),
  limpaFrag: banco.prepare("DELETE FROM fragmento WHERE obra_id = ? AND tipo = 'chamada'"),
  poeFrag: banco.prepare(
    `INSERT INTO fragmento (obra_id, tipo, titulo, corpo, revela_ate, natureza, gerado_por, revisado)
     VALUES (?,?,?,?,0,?,'humano',1)`),
  busca: banco.prepare(
    'INSERT INTO busca_obra (titulo, titulo_pt, autores, temas, resumo, conteudo_obra_id) VALUES (?,?,?,?,?,?)'),
  achaTrilha: banco.prepare('SELECT id FROM trilha WHERE nome = ?'),
  poeTrilha: banco.prepare('INSERT INTO trilha (nome, resumo, publicada) VALUES (?,?,1)'),
  limpaItens: banco.prepare('DELETE FROM trilha_item WHERE trilha_id = ?'),
  poeItem: banco.prepare(
    'INSERT OR REPLACE INTO trilha_item (trilha_id, obra_id, ordem, porque) VALUES (?,?,?,?)'),
}

const CAMPOS = 'key,title,author_name,first_publish_year,cover_i,edition_count,subject'

async function buscarOL(parametros) {
  const url = 'https://openlibrary.org/search.json?' + new URLSearchParams({ ...parametros, limit: '5', fields: CAMPOS })
  const r = await fetch(url, { headers: { 'user-agent': UA } })
  if (!r.ok) return []
  const docs = (await r.json()).docs ?? []
  // mais edições = a obra central, e não uma adaptação ou um estudo sobre ela
  return docs.sort((a, b) => (b.edition_count ?? 0) - (a.edition_count ?? 0))
}

/**
 * Três tentativas, da mais precisa para a mais frouxa.
 *
 * A Open Library guarda a obra pelo título ORIGINAL. Procurar
 * "A revolução dos bichos" com `language=por` não acha nada — a obra chama
 * "Animal Farm", e o português é uma edição dela. Por isso o título em
 * português é NOSSO (vem da curadoria) e de lá só vêm o identificador e a
 * capa. É o que evita um catálogo em português com metade dos títulos em
 * inglês.
 */
const sobrenome = (nome) => nome.trim().split(/\s+/).pop().toLowerCase()

/**
 * O resultado tem que ser DAQUELE autor.
 *
 * Sem esta checagem, "O homem em busca de um sentido / Viktor Frankl" voltou
 * com a capa de um livro chamado *Desenhos Astrais* — a busca frouxa acha
 * qualquer coisa, e uma capa errada numa estante é pior que capa nenhuma:
 * quem vê acha que o site não sabe o que tem.
 */
const ehDoAutor = (doc, autor) =>
  (doc.author_name ?? []).some(n => n.toLowerCase().includes(sobrenome(autor)))

/**
 * Três tentativas, da mais precisa para a mais frouxa — e a checagem de autor
 * só vale na última.
 *
 * As duas primeiras buscam por `title:` E `author:` ao mesmo tempo: se a Open
 * Library devolveu algo, ela casou os dois campos, e exigir de novo que o
 * sobrenome apareça em `author_name` só derruba resultado bom — "Maquiavel"
 * está lá como "Niccolò Machiavelli", "Cixin Liu" como "Liu Cixin".
 *
 * A terceira é texto livre, e é ela que traz lixo: foi assim que Viktor
 * Frankl ganhou a capa de um livro chamado *Desenhos Astrais*. Nela, o autor
 * tem que bater.
 */
async function procurar(titulo, autor) {
  const tentativas = [
    { params: { title: titulo, author: autor, language: 'por' }, conferir: false },
    { params: { title: titulo, author: autor }, conferir: false },
    { params: { q: `${titulo} ${autor}` }, conferir: true },
  ]
  for (const { params, conferir } of tentativas) {
    const achados = await buscarOL(params)
    const bons = conferir ? achados.filter(d => ehDoAutor(d, autor)) : achados
    if (bons[0]) return bons[0]
    await pausa()
  }
  return null
}

let novas = 0, achadas = 0, semCapa = []

for (const colecao of COLECOES) {
  console.log(`\n${colecao.nome}`)
  const trilhaId = Number(
    sql.achaTrilha.get(colecao.nome)?.id
    ?? sql.poeTrilha.run(colecao.nome, colecao.resumo).lastInsertRowid)
  banco.prepare('UPDATE trilha SET resumo = ?, publicada = 1 WHERE id = ?').run(colecao.resumo, trilhaId)
  sql.limpaItens.run(trilhaId)

  for (const [i, livro] of colecao.livros.entries()) {
    process.stdout.write(`  ${livro.titulo.slice(0, 40).padEnd(42)}`)
    let d = null
    try { d = await procurar(livro.titulo, livro.autor) } catch { /* segue */ }

    const pessoa = sql.achaPessoa.get(livro.autor)
      ?? { id: sql.poePessoa.run(livro.autor, livro.autor).lastInsertRowid }

    // pode já existir da ingestão por autor — não duplicar
    let obraId = (d && sql.achaObraOlid.get(d.key)?.id)
      ?? sql.achaObraTitulo.get(livro.titulo, livro.autor)?.id

    if (obraId) { achadas++ } else {
      if (!d) {
        // Sem identificador externo a obra ainda entra: a curadoria é nossa,
        // e ficar de fora por causa de um catálogo de terceiro seria deixar
        // o acervo depender de quem não é dono dele.
        obraId = Number(banco.prepare(
          `INSERT INTO obra (titulo, idioma_original, trilho, publicada) VALUES (?,'pt','B',1)`,
        ).run(livro.titulo).lastInsertRowid)
        sql.busca.run(livro.titulo, livro.titulo, livro.autor, colecao.nome, '', obraId)
        semCapa.push(livro.titulo)
        novas++
      } else {
      obraId = Number(sql.poeObra.run(
        livro.titulo, d.first_publish_year ?? null, d.key,
        d.cover_i ? String(d.cover_i) : null,
        (d.subject ?? []).slice(0, 12).join('; '),
      ).lastInsertRowid)
      sql.busca.run(livro.titulo, livro.titulo, livro.autor, `${colecao.nome} ${d.title ?? ''}`, '', obraId)
      novas++
      }
    }
    obraId = Number(obraId)

    sql.liga.run(obraId, Number(pessoa.id), 'autor')

    // Título, capa e chamada valem mesmo para obra que já veio da ingestão por
    // autor. O título da curadoria SEMPRE vence o da Open Library: lá a obra
    // está pelo nome original, e foi assim que "Cem anos de solidão" entrou no
    // catálogo como "Cien años de soledad", num site que é só em português.
    banco.prepare('UPDATE obra SET titulo = ? WHERE id = ?').run(livro.titulo, obraId)
    if (d?.cover_i) banco.prepare('UPDATE obra SET capa_externa = COALESCE(capa_externa, ?) WHERE id = ?')
      .run(String(d.cover_i), obraId)
    sql.limpaFrag.run(obraId)
    sql.poeFrag.run(obraId, 'chamada', null, livro.chamada, 'fato')

    if (!sql.temDisp.get(obraId, 'Estante Virtual')) {
      sql.poeDisp.run(obraId, 'compra', 'Estante Virtual', 'procurar usado e novo',
        `https://www.estantevirtual.com.br/busca?q=${encodeURIComponent(`${livro.titulo} ${livro.autor}`)}`)
    }
    if (d && !sql.temDisp.get(obraId, 'Open Library')) {
      sql.poeDisp.run(obraId, 'previa', 'Open Library', 'ficha e edições', `https://openlibrary.org${d.key}`)
    }

    sql.poeItem.run(trilhaId, obraId, i + 1, null)
    console.log(d ? 'ok' : 'sem capa')
    await pausa()
  }
}

console.log(`\nobras novas ..... ${novas}`)
console.log(`já existiam ..... ${achadas}`)
if (semCapa.length) console.log(`sem capa ........ ${semCapa.join(', ')}`)
fechar()

function pausa() { return new Promise(r => setTimeout(r, PAUSA)) }
