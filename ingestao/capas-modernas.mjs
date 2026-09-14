// Capas modernas para os livros de destaque.
//
//   node ingestao/capas-modernas.mjs --banco /dados/catalogo.db          (confere)
//   node ingestao/capas-modernas.mjs --banco /dados/catalogo.db --gravar (grava)
//
// ─────────────────────────────────────────────────────────────
// POR QUE ISTO EXISTE, E O QUE ELE FAZ QUE O `capas.mjs` NÃO FAZ
//
// `capas.mjs` baixa a capa que o Gutenberg tem: o scan da edição ANTIGA em
// domínio público — muitas vezes uma folha de rosto lavada de 1890. Serve, mas
// não é o que faz alguém parar numa estante.
//
// A Open Library tem outra coisa: a capa da edição QUE SE VENDE HOJE — a arte
// colorida da Penguin, da Companhia das Letras, do bolso moderno. Para um
// clássico famoso, é a diferença entre um museu e uma livraria.
//
// O frontend serve a capa local (`capa`) na frente da Open Library (`capaOL`).
// Então, para o moderno aparecer, este script faz duas coisas: acha o id da
// capa boa na OL e o grava em `capa_externa`, E limpa o `capa` local do scan
// velho, para o moderno ganhar a frente. Só nos livros de destaque — o acervo
// de quatro mil obscuros portugueses não tem edição moderna, e para eles o
// scan do Gutenberg continua sendo o melhor que existe.
//
// A escolha da capa: entre as edições que a OL tem, a que aparece em MAIS
// edições é a canônica — a que as editoras reimprimem, que é justamente a que
// tem a arte boa. E o sobrenome do autor tem que bater, senão vem a capa de
// outro livro (já veio "Desenhos Astrais" para o Frankl, uma vez).
// ─────────────────────────────────────────────────────────────

import { DatabaseSync } from 'node:sqlite'

const arg = (n, p = null) => {
  const i = process.argv.indexOf(`--${n}`)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : p
}
const GRAVAR = process.argv.includes('--gravar')
const UA = 'fio/0.1 (biblioteca em portugues; contato: toksr12@gmail.com)'
const db = new DatabaseSync(arg('banco', 'dados/catalogo.db'), { readOnly: !GRAVAR })

// As prateleiras de destaque. Só elas — o resto do acervo fica com o Gutenberg.
const TRILHAS = [
  'Clássicos que já dá para ler',
  'Ficção científica: os primeiros mundos', 'Terror e o gótico',
  'Fantasia e o maravilhoso', 'Cavaleiros, ilhas e o mar aberto',
  'Todo mundo está lendo', 'Poder e sociedade', 'Distopias que continuam atuais',
  'Para começar a pensar', 'Filosofia, do começo ao fim',
  'Clássicos que todo mundo gosta', 'Top 10 — Política no Brasil',
]

// O título pelo qual a Open Library conhece a obra — quase sempre o ORIGINAL.
// "A Máquina do Tempo" lá é "The Time Machine"; procurar em português não acha.
// Chave: uma parte do título em português que identifica a obra.
const EM_INGLES = {
  'máquina do tempo': 'The Time Machine', 'guerra dos mundos': 'The War of the Worlds',
  'homem invisível': 'The Invisible Man', 'vinte mil léguas': 'Twenty Thousand Leagues Under the Sea',
  'viagem ao centro': 'Journey to the Center of the Earth', 'volta ao mundo': 'Around the World in Eighty Days',
  'princesa de marte': 'A Princess of Mars', 'deuses de marte': 'The Gods of Mars',
  'frankenstein': 'Frankenstein', 'drácula': 'Dracula',
  'médico e o monstro': 'Strange Case of Dr Jekyll and Mr Hyde', 'rei de amarelo': 'The King in Yellow',
  'alice no país': "Alice's Adventures in Wonderland", 'através do espelho': 'Through the Looking Glass',
  'mágico de oz': 'The Wonderful Wizard of Oz', 'peter pan': 'Peter Pan',
  'ilha do tesouro': 'Treasure Island', 'robinson crusoé': 'Robinson Crusoe',
  'chamado selvagem': 'The Call of the Wild', 'morte de artur': "Le Morte d'Arthur",
  'conde de monte cristo': 'The Count of Monte Cristo', 'três mosqueteiros': 'The Three Musketeers',
  'othello': 'Othello', 'macbeth': 'Macbeth', 'chamado de cthulhu': 'The Call of Cthulhu',
  'príncipe': 'The Prince', 'zaratustra': 'Thus Spoke Zarathustra',
  'mundo como vontade': 'The World as Will and Representation', 'anna kariênina': 'Anna Karenina',
  'guerra e paz': 'War and Peace', 'retrato de dorian gray': 'The Picture of Dorian Gray',
  'crime e castigo': 'Crime and Punishment', 'irmãos karamázov': 'The Brothers Karamazov',
  'orgulho e preconceito': 'Pride and Prejudice', 'metamorfose': 'The Metamorphosis',
  'república': 'The Republic', 'meditações': 'Meditations',
  'revolução dos bichos': 'Animal Farm', '1984': 'Nineteen Eighty-Four',
  'manifesto comunista': 'The Communist Manifesto', 'discurso do método': 'Discourse on Method',
  'ser e o nada': 'Being and Nothingness', 'condição humana': 'The Human Condition',
  'admirável mundo novo': 'Brave New World', 'senhor dos anéis': 'The Lord of the Rings',
  'pequeno príncipe': 'The Little Prince', 'ensaios': 'Essays Montaigne',
  'arte da guerra': 'The Art of War', 'ética a nicômaco': 'Nicomachean Ethics',
  // segunda leva de gênero
  'senhor da guerra de marte': 'The Warlord of Mars', 'primeiros homens na lua': 'The First Men in the Moon',
  'ilha do doutor moreau': 'The Island of Doctor Moreau', 'da terra à lua': 'From the Earth to the Moon',
  'ilha misteriosa': 'The Mysterious Island', 'mundo perdido': 'The Lost World',
  'planolândia': 'Flatland', 'daqui a cem anos': 'Looking Backward',
  'raça que há de vir': 'The Coming Race', 'terra maravilhosa de oz': 'The Marvelous Land of Oz',
  'phantastes': 'Phantastes', 'princesa e o goblin': 'The Princess and the Goblin',
  'floresta do fim do mundo': 'The Wood Beyond the World', 'cinco crianças': 'Five Children and It',
  'castelo de otranto': 'The Castle of Otranto', 'volta do parafuso': 'The Turn of the Screw',
  'carmilla': 'Carmilla', 'grande deus pã': 'The Great God Pan',
  'fantasma da ópera': 'The Phantom of the Opera', 'cavaleiro sem cabeça': 'The Legend of Sleepy Hollow',
  'ivanhoé': 'Ivanhoe', 'vinte anos depois': 'Twenty Years After',
  'máscara de ferro': 'The Man in the Iron Mask', 'prisioneiro de zenda': 'The Prisoner of Zenda',
  'pimpinela escarlate': 'The Scarlet Pimpernel', 'minas do rei salomão': "King Solomon's Mines",
  'aventuras de robin hood': 'The Merry Adventures of Robin Hood', 'presa branca': 'White Fang',
  'capitão blood': 'Captain Blood', 'beowulf': 'Beowulf', 'cantar de rolando': 'The Song of Roland',
}

const sobrenome = (nome) => String(nome).trim().split(/\s+/).pop().toLowerCase()
const semAcento = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const tituloIngles = (titulo) => {
  const chave = Object.keys(EM_INGLES).find((k) => semAcento(titulo).includes(semAcento(k)))
  return chave ? EM_INGLES[chave] : null
}

async function buscarOL(params) {
  const url = 'https://openlibrary.org/search.json?' + new URLSearchParams({
    ...params, limit: '10', fields: 'title,author_name,cover_i,edition_count',
  })
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(20000) })
    if (r.ok) return (await r.json()).docs ?? []
  } catch { /* segue */ }
  return []
}

const maisReeditada = (docs) => docs.filter((d) => d.cover_i)
  .sort((a, b) => (b.edition_count ?? 0) - (a.edition_count ?? 0))[0]?.cover_i ?? null

async function melhorCapa(titulo, autor) {
  const ingles = tituloIngles(titulo)
  if (ingles) {
    // Título original conhecido e único ("Crime and Punishment", "The Prince"):
    // busco por ele e confio, porque o sobrenome não sobrevive à transliteração
    // — Dostoiévski é "Dostoevsky", Maquiavel é "Machiavelli", Platão é "Plato".
    // Exigir o sobrenome aqui derrubava justamente os mais famosos.
    const cover = maisReeditada(await buscarOL({ title: ingles }))
    if (cover) return cover
  }
  // Sem título conhecido: título em português + autor, com o sobrenome
  // conferido, que é a trava contra trazer a capa de outro livro.
  const docs = await buscarOL({ title: titulo, author: sobrenome(autor) })
  const bons = docs.filter((d) => (d.author_name ?? []).some((n) => semAcento(n).includes(sobrenome(autor))))
  return maisReeditada(bons)
}

const obras = []
for (const nome of TRILHAS) {
  const t = db.prepare('SELECT id FROM trilha WHERE nome = ?').get(nome)
  if (!t) continue
  for (const o of db.prepare(`
    SELECT o.id, o.titulo, o.titulo_pt, o.capa, o.capa_externa,
           (SELECT p.nome FROM obra_pessoa op JOIN pessoa p ON p.id = op.pessoa_id
             WHERE op.obra_id = o.id AND op.papel = 'autor' LIMIT 1) autor
      FROM trilha_item ti JOIN obra o ON o.id = ti.obra_id WHERE ti.trilha_id = ?`).all(t.id)) {
    if (!obras.some((x) => x.id === o.id)) obras.push(o)
  }
}

console.log(`${obras.length} livros de destaque\n`)
const mudar = GRAVAR ? db.prepare('UPDATE obra SET capa_externa = ?, capa = NULL WHERE id = ?') : null
let achou = 0, mantido = 0, semAutor = 0

if (GRAVAR) db.exec('BEGIN')
for (const o of obras) {
  const nome = o.titulo_pt || o.titulo
  if (!o.autor) { semAutor++; continue }
  const cover = await melhorCapa(nome, o.autor)
  if (cover) {
    if (GRAVAR) mudar.run(String(cover), o.id)
    achou++
    console.log(`  ✓ ${String(o.id).padStart(4)}  ${nome.slice(0, 46).padEnd(46)} capaOL ${cover}`)
  } else {
    mantido++
    console.log(`  · ${String(o.id).padStart(4)}  ${nome.slice(0, 46).padEnd(46)} (mantém o que tinha)`)
  }
  await new Promise((r) => setTimeout(r, 250))
}
if (GRAVAR) db.exec('COMMIT')

console.log(`\ncapa moderna achada: ${achou} | sem troca: ${mantido} | sem autor: ${semAutor}`)
if (!GRAVAR) console.log('(nada gravado; use --gravar)')
