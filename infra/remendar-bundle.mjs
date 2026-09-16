// Os remendos no site que está no ar.
//
//   node infra/remendar-bundle.mjs --base original.js --index index.html --saida pasta/
//
// ─────────────────────────────────────────────────────────────
// POR QUE ISTO EXISTE
//
// O fonte do site no ar nunca foi commitado (ver `infra/publicar.sh`, a trava):
// `web/src` é uma geração mais velha, sem perguntas de segurança, resenhas nem
// busca no texto. Reconstruir a partir dele apaga essas telas.
//
// Então o site muda por REMENDO no bundle minificado — e remendo feito à mão é
// remendo que ninguém consegue refazer. Aqui cada um tem nome, o trecho exato
// que procura, quantas vezes precisa achar, e o que põe no lugar. Parte sempre
// do bundle ORIGINAL (`index-DBmeFHaL.js`, guardado no servidor), aplica tudo
// em ordem, e recusa se qualquer âncora não bater: bundle diferente do
// esperado não recebe remendo nenhum.
//
// O arquivo de saída tem o resumo do conteúdo no nome, como os do Vite: o
// servidor o entrega com cache eterno, e é o `index.html` novo que aponta
// para ele.
// ─────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : null }

// ── os botões de "Não sabe o que ler?" ──
// Humores, não gêneros. Filtram só o que é legível (o componente já faz isso).
const BOTOES = `var ft=[`
  + `{chave:\`pensar\`,rotulo:\`🧠 quero pensar\`,explica:\`Ideias que ficam rodando depois que o livro fecha.\`,filtro:e=>e.temas.some(e=>[\`Filosofia\`,\`Epistemologia\`,\`Pensamento crítico\`].includes(e))||/Nietzsche|Schopenhauer|Kafka|Dostoi|Marco Aur|Epicteto|Platão|Maquiavel/.test(e.autor)},`
  + `{chave:\`aventura\`,rotulo:\`⚔️ quero aventura\`,explica:\`Mapa, espada, naufrágio e perigo — a história que não deixa parar.\`,filtro:e=>e.temas.includes(\`Aventura\`)||/Verne|Dumas|Burroughs|Haggard|Stevenson|Swift|Scott|Kipling|Homero|Cervantes|London|Sabatini/.test(e.autor)},`
  + `{chave:\`mundo\`,rotulo:\`🌌 entrar em outro mundo\`,explica:\`Outros planetas, ilhas perdidas, o fundo do mar, o país das maravilhas.\`,filtro:e=>e.temas.some(e=>[\`Ficção científica\`,\`Fantasia\`].includes(e))||/Verne|Wells|Burroughs|Carroll|Swift|Baum|Lovecraft|Barrie|Morris/.test(e.autor)},`
  + `{chave:\`poder\`,rotulo:\`🏛 entender o poder\`,explica:\`Como se manda, como se obedece, e o que sustenta os dois.\`,filtro:e=>e.temas.some(e=>[\`Política e sociedade\`,\`Sociologia\`,\`Distopia\`,\`Geopolítica\`,\`Estratégia\`].includes(e))||/Maquiavel|Hobbes|Rousseau|Locke|Montesquieu|Tocqueville|Marx|Orwell/.test(e.autor)},`
  + `{chave:\`espelho\`,rotulo:\`🕯 me olhar por dentro\`,explica:\`Culpa, liberdade, sentido — o livro como espelho.\`,filtro:e=>e.temas.some(e=>[\`Psicologia\`,\`Biografia e memórias\`].includes(e))||/Dostoi|Kafka|Tolst|Wilde|Nietzsche|Machado de Assis/.test(e.autor)},`
  + `{chave:\`estranho\`,rotulo:\`🌀 algo estranho\`,explica:\`Você não vai saber exatamente o que leu. Essa é a graça.\`,filtro:e=>/Kafka|Poe|Lovecraft|Carroll|Gogol|Hoffmann|Chesterton|Machen|Chambers/.test(e.autor)||/Alienista|Médico e o Monstro|Dorian Gray|Planolândia/.test(e.titulo)},`
  + `{chave:\`meia-hora\`,rotulo:\`⚡ tenho meia hora\`,explica:\`Obras inteiras que cabem numa sentada.\`,filtro:e=>!!e.minutos&&e.minutos<=75},`
  + `{chave:\`morar\`,rotulo:\`🏔 quero morar dentro de um livro\`,explica:\`Calhamaços que valem o compromisso — semanas, não tardes.\`,filtro:e=>!!e.minutos&&e.minutos>=480},`
  + `{chave:\`brasil\`,rotulo:\`🇧🇷 ler o Brasil\`,explica:\`O país contado por quem o escreveu.\`,filtro:e=>/Machado|Alencar|Azevedo|Nabuco|Gonçalves Dias|Lima Barreto|Euclides|Lobato|Pompeia|Bilac/.test(e.autor)},`
  + `{chave:\`lei\`,rotulo:\`⚖️ entender a lei\`,explica:\`O texto oficial, inteiro, e os livros sobre o Estado e a justiça.\`,filtro:e=>e.autor===\`Brasil\`||e.temas.includes(\`Direito\`)}`
  + `]`

// ── "Antes de ler" na página do livro ──
// Estilo em linha, e não classe Tailwind nova: o CSS no ar só tem as classes
// que o build antigo usou, e classe que não existe não faz nada.
const ANTES = `a.antes&&(0,N.jsx)(It,{titulo:\`Antes de ler\`,nota:\`para entrar sabendo como ler\`,children:(0,N.jsx)(\`dl\`,{style:{display:\`grid\`,gridTemplateColumns:\`minmax(6.5rem,10rem) 1fr\`,gap:\`.7rem 1.5rem\`,maxWidth:\`46rem\`},children:[[\`o que é\`,a.antes.oque],[\`você vai encontrar\`,a.antes.encontra],[\`dificuldade\`,a.antes.dificuldade],[\`ritmo\`,a.antes.ritmo],[\`pode gostar se gostou de\`,a.antes.gostouDe],[\`não espere\`,a.antes.naoEspere],[\`ideias\`,a.tags&&a.tags.length?a.tags.map(e=>\`#\`+e).join(\`   \`):null]].filter(e=>e[1]).map(([e,t])=>(0,N.jsxs)(N.Fragment,{children:[(0,N.jsx)(\`dt\`,{className:\`miudo\`,style:{paddingTop:\`.15rem\`},children:e}),(0,N.jsx)(\`dd\`,{className:\`leading-relaxed\`,style:{margin:0},children:t})]},e))})}),`

// ── "Este livro conversa com" ──
const CONVERSA = `a.conexoes&&a.conexoes.length>0&&(0,N.jsx)(It,{titulo:\`Este livro conversa com\`,nota:\`um livro leva a outro\`,children:(0,N.jsx)(\`ul\`,{className:\`flex flex-col gap-3 max-w-prose\`,children:a.conexoes.map(e=>(0,N.jsxs)(\`li\`,{className:\`leading-relaxed\`,children:[(0,N.jsx)(\`a\`,{href:\`#/obra/\${e.id}\`,className:\`underline hover:opacity-70\`,style:{fontFamily:\`Literata, serif\`},children:e.titulo}),(0,N.jsxs)(\`span\`,{style:{color:\`var(--tinta-2)\`},children:[e.autor?\` — \${e.autor}\`:\`\`,\` → \`,e.porque]})]},e.id))})}),`

const OBSERVAR = 'a.observar&&(0,N.jsx)(It,{titulo:`O que observar`,nota:`leitura, não fato — a sua pode ser outra`,children:(0,N.jsx)(`p`,{className:`leading-relaxed max-w-prose`,style:{fontFamily:`Literata, serif`},children:a.observar})}),'

const REMENDOS = [
  {
    nome: 'login aceita usuário OU e-mail',
    // O servidor sempre aceitou os dois no mesmo campo; o `type=email` do
    // navegador é que barrava quem digitava o nome de usuário.
    de: 'rotulo:`e-mail`,tipo:`email`,valor:n.email',
    para: 'rotulo:`e-mail ou usuário`,tipo:`text`,valor:n.email',
  },
  {
    nome: 'link do painel no cabeçalho (computador), só para admin',
    // O link é conforto, não segurança: quem decide é o servidor, que confere o
    // papel no banco a cada pedido do painel. Para leitor comum, nem aparece.
    de: '(0,N.jsx)(`a`,{href:`#/entrar`,className:`miudo hover:opacity-70`',
    para: 'n?.papel===`admin`&&(0,N.jsx)(`a`,{href:`/admin.html`,className:`miudo hover:opacity-70`,style:{color:`var(--acento)`},children:`painel`}),(0,N.jsx)(`a`,{href:`#/entrar`,className:`miudo hover:opacity-70`',
  },
  {
    nome: 'link do painel no menu do celular, só para admin',
    de: '(0,N.jsx)(`a`,{href:`#/entrar`,className:`block px-4 py-3.5 text-sm`',
    para: 'n?.papel===`admin`&&(0,N.jsx)(`a`,{href:`/admin.html`,className:`block px-4 py-3.5 text-sm`,style:{color:`var(--acento)`,borderBottom:`1px solid var(--linha)`},children:`painel de administração`}),(0,N.jsx)(`a`,{href:`#/entrar`,className:`block px-4 py-3.5 text-sm`',
  },
  {
    nome: 'nome no cabeçalho pula abreviação ("Sr. Livrario" → "livrario", não "sr.")',
    de: 'c=n?n.nome.split(` `)[0].toLowerCase():`entrar`',
    para: 'c=n?(n.nome.split(` `).find(e=>e&&!/\\.$/.test(e))||n.nome).toLowerCase():`entrar`',
  },
  {
    nome: 'home sem as prateleiras genéricas por tema',
    // "Romance", "Filosofia", "História": catálogo, não descoberta. Os temas
    // continuam na estante e em /tema; só saem da home, onde as coleções
    // curadas (ingestao/descoberta.mjs) tomam o lugar.
    trecho: (s) => {
      const i = s.indexOf('var mt=[{tema:`Romance`')
      const f = s.indexOf('];function ht(', i)
      return i < 0 || f < 0 ? null : [i, f + 1, 'var mt=[]']
    },
  },
  {
    nome: 'botões de humor em "Não sabe o que ler?"',
    trecho: (s) => {
      const i = s.indexOf('var ft=[{chave:`meia-hora`')
      const f = s.indexOf('];function pt(', i)
      return i < 0 || f < 0 ? null : [i, f + 1, BOTOES]
    },
  },
  {
    nome: '"Antes de ler" na página do livro',
    de: 'a.porque&&(0,N.jsx)(It,{titulo:`Por que este livro existe`',
    para: ANTES + 'a.porque&&(0,N.jsx)(It,{titulo:`Por que este livro existe`',
  },
  {
    nome: '"Este livro conversa com" na página do livro',
    de: OBSERVAR,
    para: OBSERVAR + CONVERSA,
  },
]

let s = readFileSync(arg('base'), 'utf8')
for (const r of REMENDOS) {
  if (r.trecho) {
    const t = r.trecho(s)
    if (!t) throw new Error(`âncora não encontrada: ${r.nome}`)
    s = s.slice(0, t[0]) + t[2] + s.slice(t[1])
  } else {
    const n = s.split(r.de).length - 1
    if (n !== 1) throw new Error(`"${r.nome}": esperava 1 âncora, achei ${n}`)
    s = s.replace(r.de, () => r.para)
  }
  console.log(`  ok  ${r.nome}`)
}

const saida = arg('saida')
mkdirSync(join(saida, 'ativos'), { recursive: true })
const nome = `index-${createHash('sha256').update(s).digest('base64url').slice(0, 8)}.js`
writeFileSync(join(saida, 'ativos', nome), s)
const index = readFileSync(arg('index'), 'utf8').replace(/\/ativos\/index-[\w-]+\.js/, `/ativos/${nome}`)
if (!index.includes(nome)) throw new Error('index.html não aponta para o bundle novo')
writeFileSync(join(saida, 'index.html'), index)
console.log(`\n${saida}/ativos/${nome}`)
