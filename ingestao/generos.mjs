// As prateleiras de gênero: ficção científica, fantasia, terror, o medieval.
// E a prateleira dos clássicos que JÁ dá para ler.
//
//   node ingestao/generos.mjs --banco /dados/catalogo.db          (confere)
//   node ingestao/generos.mjs --banco /dados/catalogo.db --gravar (grava)
//   node ingestao/generos.mjs --banco /dados/catalogo.db --gravar --plano  (imprime a fila)
//
// ─────────────────────────────────────────────────────────────
// O QUE ISTO FAZ, E POR QUE EXISTE
//
// O acervo livre era só o século XIX sério: romance português, direito, ensaio.
// Faltava o que muita gente abre uma biblioteca para procurar — Verne, Wells,
// Drácula, Frankenstein, o Rei Artur, uma princesa em Marte. Tudo isso é de
// domínio público no Brasil (todos os autores morreram antes de 1955), e tudo
// tem o original no Project Gutenberg. Ou seja: dá para traduzir e servir, pelo
// mesmo art. 14 que já sustenta o resto da esteira.
//
// Este arquivo faz duas coisas:
//
//   1. Cria a FICHA de cada livro de gênero (título em português, autor, capa
//      pela fonte, a chamada escrita à mão) e monta as prateleiras. Enquanto a
//      tradução não sai, o livro aparece como "a caminho" — ficha honesta, com
//      o caminho para achá-lo, que é o trilho B fazendo o trabalho dele.
//
//   2. Com `--plano`, imprime as linhas da fila de tradução para os que ainda
//      não temos. Essas linhas vão para `dados/traducoes/esteira.json`, e a
//      esteira traduz. Quando a tradução entra, o livro vira legível e a
//      prateleira, que se enche de legíveis, deixa de ser vitrine e vira
//      prateleira de verdade — sozinha, pela regra do `publicar.mjs`.
//
// A prateleira "Clássicos que dá para ler" é diferente: ela não cria nada, só
// junta numa vitrine única os famosos que a esteira JÁ traduziu e que hoje
// estão espalhados. É o destaque que o dono pediu — o oposto do museu.
// ─────────────────────────────────────────────────────────────

import { DatabaseSync } from 'node:sqlite'

const arg = (n, p = null) => {
  const i = process.argv.indexOf(`--${n}`)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : p
}
const GRAVAR = process.argv.includes('--gravar')
const IMPRIMIR_PLANO = process.argv.includes('--plano')
const banco = new DatabaseSync(arg('banco', 'dados/catalogo.db'), { readOnly: !GRAVAR })

const gut = (id) => `https://www.gutenberg.org/ebooks/${id}.txt.utf-8`

// Cada livro: título EM PORTUGUÊS (é uma biblioteca em português), autor com o
// ano de morte (é o que autoriza), o id do Gutenberg conferido um a um, a
// língua da fonte, e a chamada da capa. Todos os `gutenberg` foram verificados
// contra o cabeçalho da fonte em 14/09/2026 — título e autor batem.
const GENEROS = [
  {
    nome: 'Ficção científica: os primeiros mundos',
    resumo: 'Antes de existir a palavra, já existia o gênero. Viagens ao fundo do mar, à Lua, ao futuro e a Marte — escritas quando nada disso tinha acontecido ainda.',
    livros: [
      { titulo: 'A Máquina do Tempo', autor: 'H. G. Wells', morte: 1946, gutenberg: 35, de: 'en', chamada: 'O livro que inventou a viagem no tempo como máquina, e a usou para ver o fim da humanidade.' },
      { titulo: 'A Guerra dos Mundos', autor: 'H. G. Wells', morte: 1946, gutenberg: 36, de: 'en', chamada: 'Marte invade a Inglaterra, e o império que colonizava o mundo descobre como é ser colonizado.' },
      { titulo: 'O Homem Invisível', autor: 'H. G. Wells', morte: 1946, gutenberg: 5230, de: 'en', chamada: 'Um cientista consegue o que sempre quis, e a invisibilidade vira uma prisão sem paredes.' },
      { titulo: 'Vinte Mil Léguas Submarinas', autor: 'Júlio Verne', morte: 1905, gutenberg: 164, de: 'en', chamada: 'O capitão Nemo, o Nautilus, e o mar como o último lugar livre do planeta.' },
      { titulo: 'Viagem ao Centro da Terra', autor: 'Júlio Verne', morte: 1905, gutenberg: 18857, de: 'en', chamada: 'Uma mensagem cifrada, um vulcão na Islândia, e um mundo inteiro debaixo dos nossos pés.' },
      { titulo: 'A Volta ao Mundo em Oitenta Dias', autor: 'Júlio Verne', morte: 1905, gutenberg: 103, de: 'en', chamada: 'Uma aposta de cavalheiro vira uma corrida contra o relógio em volta do planeta inteiro.' },
      { titulo: 'Uma Princesa de Marte', autor: 'Edgar Rice Burroughs', morte: 1950, gutenberg: 62, de: 'en', chamada: 'Um soldado é levado a Marte e encontra impérios, monstros e uma princesa — a origem de toda a ficção espacial que veio depois.' },
      { titulo: 'Os Deuses de Marte', autor: 'Edgar Rice Burroughs', morte: 1950, gutenberg: 64, de: 'en', chamada: 'A volta a Marte, e a descoberta de que os deuses do planeta vermelho não são o que dizem ser.' },
    ],
  },
  {
    nome: 'Terror e o gótico',
    resumo: 'O medo antes do cinema: o monstro que somos nós, o morto que não fica morto, a casa que sabe o seu nome.',
    livros: [
      { titulo: 'Frankenstein', autor: 'Mary Shelley', morte: 1851, gutenberg: 84, de: 'en', chamada: 'Uma jovem de dezoito anos inventou a ficção científica e o terror moderno no mesmo livro. O monstro tem razão, e é isso que assusta.' },
      { titulo: 'Drácula', autor: 'Bram Stoker', morte: 1912, gutenberg: 345, de: 'en', chamada: 'Contado em cartas e diários, como se as provas de um crime — e o vampiro que fundou todos os outros.' },
      { titulo: 'O Médico e o Monstro', autor: 'Robert Louis Stevenson', morte: 1894, gutenberg: 43, de: 'en', chamada: 'Jekyll e Hyde: a descoberta de que o bem e o mal moram no mesmo endereço, e um deles está crescendo.' },
      { titulo: 'O Rei de Amarelo', autor: 'Robert W. Chambers', morte: 1933, gutenberg: 8492, de: 'en', chamada: 'Uma peça de teatro que enlouquece quem a lê. Meio século antes de Lovecraft, o terror que vem de um livro dentro do livro.' },
    ],
  },
  {
    nome: 'Fantasia e o maravilhoso',
    resumo: 'Portas para outro lugar: um buraco de coelho, um ciclone, um espelho. A fantasia antes de virar um gênero de prateleira.',
    livros: [
      { titulo: 'Alice no País das Maravilhas', autor: 'Lewis Carroll', morte: 1898, gutenberg: 11, de: 'en', chamada: 'A lógica levada tão a sério que vira loucura. Escrito para uma menina, e nunca foi só para crianças.' },
      { titulo: 'Através do Espelho', autor: 'Lewis Carroll', morte: 1898, gutenberg: 12, de: 'en', chamada: 'A volta de Alice, agora num mundo que é um jogo de xadrez — e onde é preciso correr para ficar no mesmo lugar.' },
      { titulo: 'O Mágico de Oz', autor: 'L. Frank Baum', morte: 1919, gutenberg: 55, de: 'en', chamada: 'Um ciclone, uma estrada de tijolos amarelos, e quatro personagens que já tinham o que foram pedir.' },
      { titulo: 'Peter Pan', autor: 'J. M. Barrie', morte: 1937, gutenberg: 16, de: 'en', chamada: 'O menino que não quis crescer, a Terra do Nunca, e uma tristeza por baixo da aventura que só os adultos veem.' },
    ],
  },
  {
    nome: 'Cavaleiros, ilhas e o mar aberto',
    resumo: 'A aventura na sua forma mais antiga: o mapa do tesouro, o naufrágio, a mesa redonda. Livros feitos para virar a página.',
    livros: [
      { titulo: 'A Ilha do Tesouro', autor: 'Robert Louis Stevenson', morte: 1894, gutenberg: 120, de: 'en', chamada: 'O mapa com um X, o papagaio, o Long John Silver — o molde de todo mapa do tesouro que veio depois.' },
      { titulo: 'Robinson Crusoé', autor: 'Daniel Defoe', morte: 1731, gutenberg: 521, de: 'en', chamada: 'Vinte e oito anos numa ilha deserta, e a invenção de um jeito de contar que finge ser diário de um homem real.' },
      { titulo: 'O Chamado Selvagem', autor: 'Jack London', morte: 1916, gutenberg: 215, de: 'en', chamada: 'Um cão doméstico roubado para puxar trenó no Alasca redescobre o lobo que sempre foi.' },
      { titulo: 'A Morte de Artur (Volume I)', autor: 'Thomas Malory', morte: 1471, gutenberg: 1251, de: 'en', chamada: 'Escrito na prisão no século XV, é a fonte de quase tudo que sabemos sobre Artur, Lancelote e o Graal.' },
      { titulo: 'Os Três Mosqueteiros', autor: 'Alexandre Dumas', morte: 1870, gutenberg: 1257, de: 'en', chamada: 'D\'Artagnan, a amizade, a espada e a intriga na corte — a aventura de capa e espada que definiu o gênero.' },
      { titulo: 'O Conde de Monte Cristo', autor: 'Alexandre Dumas', morte: 1870, gutenberg: 1184, de: 'en', chamada: 'Preso injustamente, foge, acha um tesouro e volta como outra pessoa. A maior história de vingança já escrita.' },
    ],
  },
]

// A prateleira dos que JÁ dá para ler: junta os famosos que a esteira traduziu.
// Casados por título + sobrenome do autor, e só entram se tiverem texto legível
// de verdade — nada aqui promete o que não cumpre.
const CLASSICOS = {
  nome: 'Clássicos que já dá para ler',
  resumo: 'Os grandes nomes que traduzimos e você pode abrir agora — do russo, do inglês, do alemão, direto para o português.',
  querem: [
    ['A Revolução dos Bichos', 'Orwell'], ['1984', 'Orwell'],
    ['Crime e Castigo', 'Dosto'], ['Os Irmãos Karamázov', 'Dosto'],
    ['Orgulho e preconceito', 'Austen'], ['Guerra e paz', 'Tol'],
    ['O Príncipe', 'Maquiavel'], ['A República', 'Plat'],
    ['Meditações', 'Marco Aurélio'], ['Assim Falou Zaratustra', 'Nietzsche'],
    ['O mundo como vontade', 'Schopenhauer'], ['A Metamorfose', 'Kafka'],
    ['O Manifesto Comunista', 'Marx'], ['Othello', 'Shakespeare'],
    ['Macbeth', 'Shakespeare'], ['O chamado de Cthulhu', 'Lovecraft'],
  ],
}

// ─────────────────────────────────────────────────────────────

const sql = {
  achaPessoa: banco.prepare('SELECT id FROM pessoa WHERE nome = ?'),
  achaObra: banco.prepare(
    `SELECT o.id FROM obra o JOIN obra_pessoa op ON op.obra_id = o.id
       JOIN pessoa p ON p.id = op.pessoa_id
      WHERE o.titulo = ? COLLATE NOCASE AND p.nome = ?`),
  // um texto NOSSO já legível para esta obra?
  legivel: banco.prepare(`
    SELECT 1 FROM texto t WHERE t.obra_id = ? AND t.idioma = 'pt' AND t.normalizado = 1
       AND EXISTS (SELECT 1 FROM capitulo c WHERE c.texto_id = t.id) LIMIT 1`),
  achaTrilha: banco.prepare('SELECT id FROM trilha WHERE nome = ?'),
}

const escrever = GRAVAR ? {
  poePessoa: banco.prepare('INSERT INTO pessoa (nome, nome_ordem, morte) VALUES (?,?,?)'),
  poMorte: banco.prepare('UPDATE pessoa SET morte = COALESCE(morte, ?) WHERE id = ?'),
  poeObra: banco.prepare(
    `INSERT INTO obra (titulo, titulo_pt, idioma_original, trilho, publicada) VALUES (?,?,?, 'B', 1)`),
  liga: banco.prepare("INSERT OR IGNORE INTO obra_pessoa (obra_id, pessoa_id, papel) VALUES (?,?,'autor')"),
  limpaChamada: banco.prepare("DELETE FROM fragmento WHERE obra_id = ? AND tipo = 'chamada'"),
  poeChamada: banco.prepare(
    `INSERT INTO fragmento (obra_id, tipo, titulo, corpo, revela_ate, natureza, gerado_por, revisado)
     VALUES (?, 'chamada', NULL, ?, 0, 'fato', 'humano', 1)`),
  temDisp: banco.prepare('SELECT 1 FROM disponibilidade WHERE obra_id = ? AND provedor = ?'),
  poeDisp: banco.prepare(
    `INSERT INTO disponibilidade (obra_id, tipo, provedor, rotulo, url, idioma)
     VALUES (?,?,?,?,?, 'pt')`),
  poeTrilha: banco.prepare('INSERT INTO trilha (nome, resumo, publicada) VALUES (?,?,1)'),
  atualizaTrilha: banco.prepare('UPDATE trilha SET resumo = ?, publicada = 1 WHERE id = ?'),
  limpaItens: banco.prepare('DELETE FROM trilha_item WHERE trilha_id = ?'),
  poeItem: banco.prepare(
    'INSERT OR REPLACE INTO trilha_item (trilha_id, obra_id, ordem, porque) VALUES (?,?,?,NULL)'),
} : null

const sobrenome = (nome) => nome.trim().split(/\s+/).pop().toLowerCase()

/** Acha ou cria a obra de gênero, e devolve o id. */
function garantirObra(livro) {
  let id = sql.achaObra.get(livro.titulo, livro.autor)?.id
  if (id) {
    if (GRAVAR) {
      const p = sql.achaPessoa.get(livro.autor)
      if (p) escrever.poMorte.run(livro.morte, p.id)
    }
    return { id, nova: false }
  }
  if (!GRAVAR) return { id: null, nova: true }

  const pessoa = sql.achaPessoa.get(livro.autor)
    ?? { id: Number(escrever.poePessoa.run(livro.autor, livro.autor, livro.morte).lastInsertRowid) }
  escrever.poMorte.run(livro.morte, pessoa.id)
  id = Number(escrever.poeObra.run(livro.titulo, livro.titulo, livro.de).lastInsertRowid)
  escrever.liga.run(id, pessoa.id)
  return { id, nova: true }
}

function montarGeneros() {
  const plano = []
  for (const g of GENEROS) {
    const itens = []
    for (const livro of g.livros) {
      const { id, nova } = garantirObra(livro)
      if (GRAVAR) {
        escrever.limpaChamada.run(id)
        escrever.poeChamada.run(id, livro.chamada)
        if (!escrever.temDisp.get(id, 'Project Gutenberg')) {
          escrever.poeDisp.run(id, 'leitura_externa', 'Project Gutenberg', 'ler o original em inglês', gut(livro.gutenberg))
        }
        if (!escrever.temDisp.get(id, 'Estante Virtual')) {
          escrever.poeDisp.run(id, 'compra', 'Estante Virtual', 'procurar edição em português',
            `https://www.estantevirtual.com.br/busca?q=${encodeURIComponent(`${livro.titulo} ${livro.autor}`)}`)
        }
      }
      itens.push({ id, livro })
      // fila de tradução: só o que ainda não é legível
      if (!id || !sql.legivel.get(id)) {
        plano.push({
          obra: id, titulo: livro.titulo, autor: livro.autor, morte: livro.morte,
          fonte: gut(livro.gutenberg), de: livro.de, saida: id ? `obra${id}` : null,
        })
      }
    }
    if (GRAVAR) {
      const trilhaId = Number(sql.achaTrilha.get(g.nome)?.id
        ?? escrever.poeTrilha.run(g.nome, g.resumo).lastInsertRowid)
      escrever.atualizaTrilha.run(g.resumo, trilhaId)
      escrever.limpaItens.run(trilhaId)
      itens.forEach((it, i) => escrever.poeItem.run(trilhaId, it.id, i + 1))
    }
    console.log(`${g.nome.padEnd(40)} ${g.livros.length} livros`)
  }
  return plano
}

function montarClassicos() {
  const achados = []
  for (const [titulo, autorParte] of CLASSICOS.querem) {
    // Casa no título português OU no original: obras que traduzimos guardam o
    // nome em português no `titulo_pt` e deixam o russo/alemão/grego no
    // `titulo`. Procurar só num dos dois perdia Crime e Castibo, A República e
    // o Manifesto — legíveis, mas com o título original no campo errado.
    const o = banco.prepare(`
      SELECT o.id, o.titulo FROM obra o
        JOIN obra_pessoa op ON op.obra_id = o.id AND op.papel = 'autor'
        JOIN pessoa p ON p.id = op.pessoa_id
       WHERE (o.titulo LIKE ? OR o.titulo_pt LIKE ?) AND p.nome LIKE ?
       ORDER BY o.id LIMIT 1`).get(`${titulo}%`, `${titulo}%`, `%${autorParte}%`)
    if (o && sql.legivel.get(o.id)) achados.push(o.id)
    else console.log(`  (ainda não legível: ${titulo})`)
  }
  console.log(`${CLASSICOS.nome.padEnd(40)} ${achados.length} legíveis`)
  if (GRAVAR && achados.length >= 3) {
    const trilhaId = Number(sql.achaTrilha.get(CLASSICOS.nome)?.id
      ?? escrever.poeTrilha.run(CLASSICOS.nome, CLASSICOS.resumo).lastInsertRowid)
    escrever.atualizaTrilha.run(CLASSICOS.resumo, trilhaId)
    escrever.limpaItens.run(trilhaId)
    achados.forEach((id, i) => escrever.poeItem.run(trilhaId, id, i + 1))
  }
}

if (GRAVAR) banco.exec('BEGIN')
console.log(GRAVAR ? '── gravando ──' : '── só conferindo (use --gravar) ──')
const plano = montarGeneros()
montarClassicos()
if (GRAVAR) banco.exec('COMMIT')

const total = GENEROS.reduce((n, g) => n + g.livros.length, 0)
console.log(`\ngênero: ${total} livros em ${GENEROS.length} prateleiras`)
console.log(`fila de tradução: ${plano.length} ainda não legíveis`)

if (IMPRIMIR_PLANO) {
  console.log('\n===PLANO_JSON===')
  console.log(JSON.stringify(plano))
}
