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
    nome: 'cabeçalho pergunta quantos avisos novos há (só com conta)',
    // Hook novo antes do `return`, sempre na mesma ordem: regra de hooks
    // respeitada. Refaz a pergunta a cada troca de rota.
    de: ';return(0,l.useEffect)(()=>{a(!1)},[e]),',
    para: ';let[avN,avSet]=(0,l.useState)(0);(0,l.useEffect)(()=>{if(!n){avSet(0);return}fetch(`/api/avisos/contagem`,{credentials:`include`}).then(e=>e.ok?e.json():null).then(e=>e&&avSet(e.naoLidos||0)).catch(()=>{})},[n?.id,e]);return(0,l.useEffect)(()=>{a(!1)},[e]),',
  },
  {
    nome: 'link "para você" com contador no cabeçalho (computador)',
    de: 'n?.papel===`admin`&&(0,N.jsx)(`a`,{href:`/admin.html`,className:`miudo hover:opacity-70`',
    para: 'n&&(0,N.jsxs)(`a`,{href:`/central.html`,className:`miudo hover:opacity-70`,children:[`para você`,avN>0&&(0,N.jsx)(`span`,{style:{marginLeft:`.35rem`,background:`var(--acento)`,color:`#fff`,borderRadius:`999px`,padding:`0 .4rem`,fontSize:`.65rem`},children:avN})]}),n?.papel===`admin`&&(0,N.jsx)(`a`,{href:`/admin.html`,className:`miudo hover:opacity-70`',
  },
  {
    nome: 'link "para você" no menu do celular',
    de: 'n?.papel===`admin`&&(0,N.jsx)(`a`,{href:`/admin.html`,className:`block px-4 py-3.5 text-sm`',
    para: 'n&&(0,N.jsx)(`a`,{href:`/central.html`,className:`block px-4 py-3.5 text-sm`,style:{color:`var(--tinta)`,borderBottom:`1px solid var(--linha)`},children:avN>0?`para você · ${avN} ${avN===1?`aviso novo`:`avisos novos`}`:`para você`}),n?.papel===`admin`&&(0,N.jsx)(`a`,{href:`/admin.html`,className:`block px-4 py-3.5 text-sm`',
  },
  {
    nome: 'home: pede as recomendações de quem tem conta',
    de: 'function ht({catalogo:e}){',
    para: 'function ht({catalogo:e}){let pvEu=E(),[pvRec,pvSet]=(0,l.useState)(null);(0,l.useEffect)(()=>{if(!pvEu){pvSet(null);return}fetch(`/api/recomendacoes`,{credentials:`include`}).then(e=>e.ok?e.json():null).then(e=>pvSet(e)).catch(()=>{})},[pvEu?.id]);',
  },
  {
    nome: 'home: prateleira "Para você" (ou o convite ao questionário)',
    de: 's.length>0&&(0,N.jsxs)(`div`,{className:`flex flex-col gap-3`,children:[(0,N.jsx)(lt,{titulo:`Você parou aqui`',
    para: 'pvRec&&pvRec.pedir&&(0,N.jsxs)(`a`,{href:`/central.html?bemvindo=1`,className:`block rounded-xl p-5 sm:p-7`,style:{background:`var(--papel-2)`,border:`1px solid var(--linha)`,textDecoration:`none`},children:[(0,N.jsx)(`div`,{className:`miudo`,children:`para você`}),(0,N.jsx)(`h2`,{className:`text-[1.15rem]`,style:{fontFamily:`Literata, serif`,marginTop:`.4rem`},children:`Conte do que você gosta e receba recomendações na hora →`})]}),pvRec&&pvRec.obras&&pvRec.obras.length>=3&&(0,N.jsx)(lt,{titulo:`Para você`,subtitulo:pvRec.resumo,obras:pvRec.obras.map(e=>a.get(e.id)).filter(e=>!!e),verMais:`/central.html`}),s.length>0&&(0,N.jsxs)(`div`,{className:`flex flex-col gap-3`,children:[(0,N.jsx)(lt,{titulo:`Você parou aqui`',
  },
  {
    nome: 'depois de criar a conta, o questionário de gosto',
    de: 'await de(n.nome,n.email,n.senha,h,n.convite)',
    para: 'await de(n.nome,n.email,n.senha,h,n.convite),location.href=`/central.html?bemvindo=1`',
  },
  // ── quadrinhos e mangá (16/09) ──
  {
    nome: 'link "quadrinhos" no cabeçalho (computador)',
    de: 'n&&(0,N.jsxs)(`a`,{href:`/central.html`,className:`miudo hover:opacity-70`',
    para: '(0,N.jsx)(`a`,{href:`/quadrinhos.html`,className:`miudo hover:opacity-70`,children:`quadrinhos`}),n&&(0,N.jsxs)(`a`,{href:`/central.html`,className:`miudo hover:opacity-70`',
  },
  {
    nome: 'link "quadrinhos e mangá" no menu do celular',
    de: 'n&&(0,N.jsx)(`a`,{href:`/central.html`,className:`block px-4 py-3.5 text-sm`',
    para: '(0,N.jsx)(`a`,{href:`/quadrinhos.html`,className:`block px-4 py-3.5 text-sm`,style:{color:`var(--tinta)`,borderBottom:`1px solid var(--linha)`},children:`quadrinhos e mangá`}),n&&(0,N.jsx)(`a`,{href:`/central.html`,className:`block px-4 py-3.5 text-sm`',
  },
  {
    // Era um quadro só de texto, depois dos botões de humor: ficava a 3.600 px
    // do topo e ninguém via (16/09). Agora é prateleira com capa, no alto.
    nome: 'home: carrega o resumo dos quadrinhos livres e o que está em alta',
    de: 'function ht({catalogo:e}){',
    para: 'function ht({catalogo:e}){let[qdSeries,qdSet]=(0,l.useState)(null),[mgAlta,mgSet]=(0,l.useState)(null);(0,l.useEffect)(()=>{fetch(`/dados/quadrinhos-resumo.json`).then(e=>e.ok?e.json():null).then(e=>e&&qdSet(e.series)).catch(()=>{});fetch(`/api/mangas?ordem=alta`).then(e=>e.ok?e.json():null).then(e=>e&&mgSet(e.obras)).catch(()=>{})},[]);',
  },
  {
    nome: 'home: prateleiras "Quadrinhos e mangá para ler aqui" e "Mangá e manhwa em alta", antes do Top 10',
    de: '(0,N.jsx)(dt,{titulo:`Top 10 — o que está sendo lido`',
    para: 'qdSeries&&qdSeries.length>0&&(0,N.jsxs)(`section`,{children:[(0,N.jsxs)(`div`,{className:`flex items-baseline gap-3 mb-4 px-1 flex-wrap`,children:[(0,N.jsx)(`h2`,{style:{fontFamily:`Literata, serif`},className:`text-[1.15rem]`,children:`Quadrinhos e mangá para ler aqui`}),(0,N.jsx)(`span`,{className:`text-xs`,style:{color:`var(--tinta-2)`},children:`${qdSeries.length} séries livres, com leitor próprio`}),(0,N.jsx)(`a`,{href:`/quadrinhos.html?aba=aqui`,className:`text-[0.68rem] italic ml-auto hover:opacity-70`,style:{color:`var(--tinta-2)`},children:`ver todos →`})]}),(0,N.jsx)(`div`,{className:`flex overflow-x-auto pb-2`,style:{gap:`1rem`,scrollbarWidth:`none`,overscrollBehaviorX:`contain`},children:qdSeries.slice(0,20).map(e=>(0,N.jsxs)(`a`,{href:`/quadrinhos.html?serie=${encodeURIComponent(e.id)}`,className:`group shrink-0 block`,style:{width:`8.5rem`},children:[(0,N.jsxs)(`span`,{className:`block overflow-hidden rounded-[3px] transition-transform duration-200 group-hover:-translate-y-1`,style:{position:`relative`,aspectRatio:`2/3`,background:`var(--papel-2)`,boxShadow:`0 1px 2px rgba(0,0,0,.2), 0 10px 24px -14px rgba(0,0,0,.6)`},children:[(0,N.jsx)(`img`,{src:e.capa,alt:`Capa de ${e.titulo}`,loading:`lazy`,style:{width:`100%`,height:`100%`,objectFit:`cover`,display:`block`}}),(0,N.jsx)(`span`,{style:{position:`absolute`,left:`6px`,bottom:`6px`,background:`rgba(0,0,0,.72)`,color:`#fff`,fontSize:`.6rem`,borderRadius:`999px`,padding:`1px 7px`},children:e.sentido===`rtl`?`mangá ←`:e.estilo})]}),(0,N.jsx)(`span`,{className:`block mt-2 text-[0.8rem] leading-snug line-clamp-2`,style:{fontFamily:`Literata, serif`},children:e.titulo}),(0,N.jsx)(`span`,{className:`block text-[0.68rem] truncate`,style:{color:`var(--tinta-2)`},children:`${e.autor} · ${e.volumes} ${e.formato===`quadrinho`?`episódios`:`volumes`}`})]},e.id))})]}),mgAlta&&mgAlta.length>0&&(0,N.jsxs)(`section`,{children:[(0,N.jsxs)(`div`,{className:`flex items-baseline gap-3 mb-4 px-1 flex-wrap`,children:[(0,N.jsx)(`h2`,{style:{fontFamily:`Literata, serif`},className:`text-[1.15rem]`,children:`Mangá e manhwa em alta`}),(0,N.jsx)(`span`,{className:`text-xs`,style:{color:`var(--tinta-2)`},children:`para descobrir · a ficha diz onde ler oficialmente`}),(0,N.jsx)(`a`,{href:`/quadrinhos.html`,className:`text-[0.68rem] italic ml-auto hover:opacity-70`,style:{color:`var(--tinta-2)`},children:`filtrar milhares →`})]}),(0,N.jsx)(`div`,{className:`flex overflow-x-auto pb-2`,style:{gap:`1rem`,scrollbarWidth:`none`,overscrollBehaviorX:`contain`},children:mgAlta.slice(0,20).map(e=>(0,N.jsxs)(`a`,{href:`/quadrinhos.html?manga=${e.id}`,className:`group shrink-0 block`,style:{width:`8.5rem`},children:[(0,N.jsxs)(`span`,{className:`block overflow-hidden rounded-[3px] transition-transform duration-200 group-hover:-translate-y-1`,style:{position:`relative`,aspectRatio:`2/3`,background:e.cor||`var(--papel-2)`,boxShadow:`0 1px 2px rgba(0,0,0,.2), 0 10px 24px -14px rgba(0,0,0,.6)`},children:[typeof e.capa===`string`&&e.capa.startsWith(`/api/capa-manga/`)&&(0,N.jsx)(`img`,{src:e.capa,alt:`Capa de ${e.titulo}`,loading:`lazy`,style:{width:`100%`,height:`100%`,objectFit:`cover`,display:`block`}}),(0,N.jsx)(`span`,{style:{position:`absolute`,left:`6px`,bottom:`6px`,background:e.emPortugues?`#1d7a46`:`rgba(0,0,0,.72)`,color:`#fff`,fontSize:`.6rem`,borderRadius:`999px`,padding:`1px 7px`},children:e.emPortugues?`${e.tipo} · em português`:e.tipo})]}),(0,N.jsx)(`span`,{className:`block mt-2 text-[0.8rem] leading-snug line-clamp-2`,style:{fontFamily:`Literata, serif`},children:e.titulo}),(0,N.jsx)(`span`,{className:`block text-[0.68rem] truncate`,style:{color:`var(--tinta-2)`},children:e.generos.slice(0,2).join(` · `)})]},e.id))})]}),(0,N.jsx)(dt,{titulo:`Top 10 — o que está sendo lido`',
  },
  // ── comunidade, publicar e planos (17/09) ──
  // Os links vão logo depois de "quadrinhos", que já é um remendo: a âncora é o
  // texto que o remendo anterior deixou.
  {
    nome: 'link "comunidade" no cabeçalho (computador)',
    de: '(0,N.jsx)(`a`,{href:`/quadrinhos.html`,className:`miudo hover:opacity-70`,children:`quadrinhos`}),',
    para: '(0,N.jsx)(`a`,{href:`/quadrinhos.html`,className:`miudo hover:opacity-70`,children:`quadrinhos`}),(0,N.jsx)(`a`,{href:`/publicacoes.html`,className:`miudo hover:opacity-70`,children:`comunidade`}),',
  },
  {
    nome: 'links "comunidade", "publicar" e "planos" no menu do celular',
    de: '(0,N.jsx)(`a`,{href:`/quadrinhos.html`,className:`block px-4 py-3.5 text-sm`,style:{color:`var(--tinta)`,borderBottom:`1px solid var(--linha)`},children:`quadrinhos e mangá`}),',
    para: '(0,N.jsx)(`a`,{href:`/quadrinhos.html`,className:`block px-4 py-3.5 text-sm`,style:{color:`var(--tinta)`,borderBottom:`1px solid var(--linha)`},children:`quadrinhos e mangá`}),(0,N.jsx)(`a`,{href:`/publicacoes.html`,className:`block px-4 py-3.5 text-sm`,style:{color:`var(--tinta)`,borderBottom:`1px solid var(--linha)`},children:`comunidade: obras dos leitores`}),(0,N.jsx)(`a`,{href:`/publicar.html`,className:`block px-4 py-3.5 text-sm`,style:{color:`var(--tinta)`,borderBottom:`1px solid var(--linha)`},children:`publicar`}),(0,N.jsx)(`a`,{href:`/assinaturas.html`,className:`block px-4 py-3.5 text-sm`,style:{color:`var(--tinta)`,borderBottom:`1px solid var(--linha)`},children:`planos`}),',
  },
  {
    nome: 'home: carrega as publicações recentes da comunidade',
    de: '[mgAlta,mgSet]=(0,l.useState)(null);(0,l.useEffect)(()=>{',
    para: '[mgAlta,mgSet]=(0,l.useState)(null),[pubC,pubSet]=(0,l.useState)(null);(0,l.useEffect)(()=>{fetch(`/api/publicacoes?ordem=recentes`).then(e=>e.ok?e.json():null).then(e=>e&&pubSet(e.obras)).catch(()=>{});',
  },
  {
    // Só aparece quando existe obra publicada: prateleira vazia na home é pior
    // que prateleira nenhuma.
    nome: 'home: prateleira "Da comunidade", antes do Top 10',
    de: '(0,N.jsx)(dt,{titulo:`Top 10 — o que está sendo lido`',
    para: 'pubC&&pubC.length>0&&(0,N.jsxs)(`section`,{children:[(0,N.jsxs)(`div`,{className:`flex items-baseline gap-3 mb-4 px-1 flex-wrap`,children:[(0,N.jsx)(`h2`,{style:{fontFamily:`Literata, serif`},className:`text-[1.15rem]`,children:`Da comunidade`}),(0,N.jsx)(`span`,{className:`text-xs`,style:{color:`var(--tinta-2)`},children:`livros e quadrinhos de quem escreve e desenha aqui`}),(0,N.jsx)(`a`,{href:`/publicacoes.html`,className:`text-[0.68rem] italic ml-auto hover:opacity-70`,style:{color:`var(--tinta-2)`},children:`ver todos →`})]}),(0,N.jsx)(`div`,{className:`flex overflow-x-auto pb-2`,style:{gap:`1rem`,scrollbarWidth:`none`,overscrollBehaviorX:`contain`},children:pubC.slice(0,20).map(e=>(0,N.jsxs)(`a`,{href:`/publicacoes.html?id=${e.id}`,className:`group shrink-0 block`,style:{width:`8.5rem`},children:[(0,N.jsxs)(`span`,{className:`block overflow-hidden rounded-[3px] transition-transform duration-200 group-hover:-translate-y-1`,style:{position:`relative`,aspectRatio:`2/3`,background:`var(--papel-2)`,boxShadow:`0 1px 2px rgba(0,0,0,.2), 0 10px 24px -14px rgba(0,0,0,.6)`},children:[typeof e.capa===`string`&&e.capa.startsWith(`/api/pub-arquivo/`)&&(0,N.jsx)(`img`,{src:e.capa,alt:`Capa de ${e.titulo}`,loading:`lazy`,style:{width:`100%`,height:`100%`,objectFit:`cover`,display:`block`}}),(0,N.jsx)(`span`,{style:{position:`absolute`,left:`6px`,bottom:`6px`,background:`rgba(0,0,0,.72)`,color:`#fff`,fontSize:`.6rem`,borderRadius:`999px`,padding:`1px 7px`},children:e.formatoNome})]}),(0,N.jsx)(`span`,{className:`block mt-2 text-[0.8rem] leading-snug line-clamp-2`,style:{fontFamily:`Literata, serif`},children:e.titulo}),(0,N.jsx)(`span`,{className:`block text-[0.68rem] truncate`,style:{color:`var(--tinta-2)`},children:`@${e.autor.usuario}`})]},e.id))})]}),(0,N.jsx)(dt,{titulo:`Top 10 — o que está sendo lido`',
  },
  // ── apagar a conta sem e-mail (LGPD, achado em 16/09) ──
  // As duas telas de apagar só habilitavam o botão quando o texto digitado era
  // igual ao e-mail. Conta criada só com nome de usuário nunca conseguia.
  { nome: 'apagar conta (estante): mostra o usuário quando não há e-mail',
    de: 'Digite `,(0,N.jsx)(`b`,{children:r.email})', para: 'Digite `,(0,N.jsx)(`b`,{children:r.email||r.usuario})' },
  { nome: 'apagar conta (estante): placeholder', de: 'placeholder:r.email,', para: 'placeholder:r.email||r.usuario,' },
  { nome: 'apagar conta (estante): botão aceita o usuário',
    de: 'disabled:d.trim().toLowerCase()!==r.email,', para: 'disabled:d.trim().toLowerCase()!==String(r.email||r.usuario).toLowerCase(),' },
  { nome: 'apagar conta (conta): rótulo', de: 'rotulo:`digite ${e.email} para confirmar`', para: 'rotulo:`digite ${e.email||e.usuario} para confirmar`' },
  { nome: 'apagar conta (conta): botão aceita o usuário', de: '!==e.email', para: '!==String(e.email||e.usuario).toLowerCase()' },
  { nome: 'apagar conta (conta): texto', de: 'por isso é preciso digitar o e-mail.', para: 'por isso é preciso digitar o seu nome de usuário (ou o e-mail).' },
  {
    nome: 'home sem as prateleiras genéricas por tema',
    // "Romance", "Filosofia", "História": catálogo, não descoberta. Os temas
    // continuam na estante e em /tema; só saem da home, onde as coleções
    // curadas (servidor/servicos/descoberta.mjs) tomam o lugar.
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
  // ── 17/09: ouvir é benefício de plano; busca aberta a partir das páginas soltas ──
  {
    // `window.fioVoz` vem de /fio-leitor.js (o plano da pessoa). A velocidade
    // escolhida no chip do leitor vale ao começar a falar.
    nome: 'ouvir em voz alta: só com plano, e com a velocidade escolhida',
    de: 'le.current=bn({aoMudar:O,aoAcabar:()=>{oe(!1),O(-1)}}),le.current.falar(ue),oe(!0)',
    para: 'if(window.fioVoz!==!0){location.href=`/assinaturas.html?por=voz`;return}le.current=bn({velocidade:Number(localStorage.getItem(`fio:voz-vel`))||1,aoMudar:O,aoAcabar:()=>{oe(!1),O(-1)}}),le.current.falar(ue),oe(!0)',
  },
  // ── 17/09 (noite): conta nova, espaços para as ideias, livro em amostra fora do cache ──
  {
    // A tela de conta virou /conta.html (perfil, plano, segurança, aparelhos,
    // dados). Quem entra em #/entrar já logado vai para lá.
    nome: 'conta: a tela antiga leva para /conta.html',
    de: 'function Zt(){let e=E(),[t,n]=(0,l.useState)(`perfil`);return(',
    para: 'function Zt(){(0,l.useEffect)(()=>{location.replace(`/conta.html`)},[]);return null;let e=E(),[t,n]=(0,l.useState)(`perfil`);return(',
  },
  {
    // Um div vazio que o React não mexe; /fio-app-extras.js monta a meta de
    // leitura dentro dele.
    nome: 'estante: espaço da meta de leitura do ano',
    de: 'e.startsWith(`/estante`)?(0,N.jsx)(wt,{catalogo:n})',
    para: 'e.startsWith(`/estante`)?(0,N.jsxs)(N.Fragment,{children:[(0,N.jsx)(`div`,{id:`fio-extra-estante`,className:`max-w-6xl mx-auto px-4 sm:px-8`}),(0,N.jsx)(wt,{catalogo:n})]})',
  },
  {
    nome: 'caderno: espaço da revisão do dia',
    de: 'e.startsWith(`/caderno`)?(0,N.jsx)(Ut,{catalogo:n})',
    para: 'e.startsWith(`/caderno`)?(0,N.jsxs)(N.Fragment,{children:[(0,N.jsx)(`div`,{id:`fio-extra-caderno`,className:`max-w-6xl mx-auto px-4 sm:px-8`}),(0,N.jsx)(Ut,{catalogo:n})]})',
  },
  {
    // Livro que veio em amostra (sem conta ou limite do mês) não fica no cache
    // da sessão: quem entra ou assina e reabre recebe o livro inteiro.
    nome: 'livro em amostra não fica no cache',
    de: 'let i=await r.json();return f.set(t,i),i}',
    para: 'let i=await r.json();return i.limitado||f.set(t,i),i}',
  },
  {
    // A barra das páginas soltas não tem a busca (ela mora no app): marca o
    // pedido e vem para cá; o app abre a busca assim que monta.
    nome: 'busca: abre quando outra página pediu',
    de: 'p=E();(0,l.useEffect)(()=>{document.documentElement.dataset.tema=t.tema},[t.tema])',
    para: 'p=E();(0,l.useEffect)(()=>{document.documentElement.dataset.tema=t.tema},[t.tema]),(0,l.useEffect)(()=>{try{sessionStorage.getItem(`fio:abrir-busca`)&&(sessionStorage.removeItem(`fio:abrir-busca`),f(!0))}catch{}},[])',
  },
  // ── 18/09: os dados do navegador têm dono (achado: a estante de uma conta ia para a outra) ──
  {
    // Antes da primeira sincronia com a conta que entrou, /fio-dono.js confere
    // de quem é o que está no navegador. Se era de outra conta (ou de antes da
    // correção), apaga aqui também, e a sincronia só traz o que é desta.
    nome: 'sincronia: dados de outra conta saem antes de subir',
    de: '(0,l.useEffect)(()=>{if(!p)return;let e=!0,t=!1,n,r=async()=>{',
    para: '(0,l.useEffect)(()=>{if(!p)return;window.fioDono&&window.fioDono.conferir(p.id)&&ze();let e=!0,t=!1,n,r=async()=>{',
  },
  {
    nome: 'sair: nada da conta fica no navegador',
    de: 'async function be(){await D(`/sair`,{}),w=null,T()}',
    para: 'async function be(){await D(`/sair`,{}),window.fioDono&&window.fioDono.saiu(),ze(),w=null,T()}',
  },
  {
    // "Levar embora" (baixar marcações e JSON) saiu do caderno: com conta,
    // tudo já fica guardado. Exportar e apagar moram em /conta.html#dados.
    nome: 'caderno: sem a aba "conta e dados"',
    de: '[`marcacoes`,`marcações`],[`dados`,`conta e dados`]]',
    para: '[`marcacoes`,`marcações`]]',
  },
  {
    // O botão era <a href="#onde">: no app o # é a rota, então clicar ia para
    // uma tela que não existe. Agora rola até a lista "onde encontrar".
    nome: 'ficha: "Onde encontrar" rola até a lista',
    de: '(0,N.jsx)(`a`,{href:`#onde`,',
    para: '(0,N.jsx)(`a`,{href:`#onde`,onClick:e=>{e.preventDefault();let t=document.getElementById(`fio-onde`);t&&t.scrollIntoView({behavior:`smooth`,block:`center`})},',
  },
  {
    nome: 'ficha: a lista "onde encontrar" tem endereço',
    de: '(0,N.jsx)(`div`,{className:`miudo mt-6 mb-3`,children:`onde encontrar`})',
    para: '(0,N.jsx)(`div`,{id:`fio-onde`,className:`miudo mt-6 mb-3`,children:`onde encontrar`})',
  },
  {
    // Entrar (ou criar conta) com o Google: servidor/google.mjs. O botão só
    // leva ao servidor, que faz tudo por redirecionamento.
    nome: 'entrar: botão "Continuar com o Google"',
    de: '(0,N.jsxs)(`form`,{onSubmit:T,className:`flex flex-col gap-3 mt-7`,children:[',
    // Nasce escondido; /fio-app-extras.js mostra quando /api/google/ligado diz que está ligado.
    para: 'e!==`esqueci`&&(0,N.jsxs)(`div`,{id:`fio-google`,style:{display:`none`},children:[(0,N.jsxs)(`a`,{href:`/api/google/entrar?volta=%2F%23%2F`,className:`mt-7 flex items-center justify-center gap-3 px-4 py-2.5 rounded text-sm hover:opacity-80`,style:{border:`1px solid var(--linha)`,background:`var(--papel)`,color:`var(--tinta)`,textDecoration:`none`},children:[(0,N.jsx)(`span`,{"aria-hidden":!0,style:{fontWeight:700,fontFamily:`Arial, sans-serif`,background:`conic-gradient(#ea4335 0 25%,#fbbc05 0 50%,#34a853 0 75%,#4285f4 0)`,WebkitBackgroundClip:`text`,backgroundClip:`text`,color:`transparent`,fontSize:`1.15rem`},children:`G`}),e===`criar`?`Criar conta com o Google`:`Continuar com o Google`]}),(0,N.jsx)(`div`,{className:`mt-5 text-center text-xs`,style:{color:`var(--tinta-2)`},children:`ou com usuário e senha`})]}),(0,N.jsxs)(`form`,{onSubmit:T,className:`flex flex-col gap-3 mt-7`,children:[',
  },
  // ── 18/09 (noite): a cara dos sites de leitura, com a identidade do Fio ──
  // Estilos em /fio-visual.css; aqui só as classes e os selos.
  {
    // O destaque da home ganha a capa desfocada ao fundo.
    nome: 'visual: destaque da home com a capa ao fundo',
    de: '(0,N.jsxs)(`section`,{className:`rounded-xl overflow-hidden relative`,style:{background:`var(--papel-2)`,border:`1px solid var(--linha)`},children:[(0,N.jsx)(`div`,{"aria-hidden":!0,className:`absolute inset-0 pointer-events-none`,style:{background:`radial-gradient(58% 88% at 13% 42%, color-mix(in srgb, var(--acento) 14%, transparent), transparent 70%)`}}),',
    para: '(0,N.jsxs)(`section`,{className:`fio-hero rounded-xl overflow-hidden relative`,children:[(0,N.jsx)(`div`,{"aria-hidden":!0,className:`fio-hero-fundo`,style:{backgroundImage:e.capa?`url("/capas/${e.capa}")`:e.capaOL?`url("https://covers.openlibrary.org/b/id/${e.capaOL}-M.jpg")`:void 0}}),(0,N.jsx)(`div`,{"aria-hidden":!0,className:`fio-hero-veu absolute inset-0 pointer-events-none`}),',
  },
  {
    nome: 'visual: espaço de "chegaram agora" logo abaixo do destaque',
    de: 'h&&(0,N.jsx)(gt,{obra:h,quantas:p.length}),',
    para: 'h&&(0,N.jsx)(gt,{obra:h,quantas:p.length}),(0,N.jsx)(`div`,{id:`fio-extra-novidades`}),',
  },
  {
    // Os selos do cartão de livro, como nos sites de mangá: o tipo no canto de
    // cima, a nota à direita, o tempo de leitura embaixo.
    nome: 'visual: selos no cartão de livro',
    de: '(0,N.jsxs)(`div`,{className:`relative aspect-[2/3] overflow-hidden rounded-[3px] transition-transform duration-200 group-hover:-translate-y-1`,style:{boxShadow:`0 1px 2px rgba(0,0,0,.18), 0 8px 20px -12px rgba(0,0,0,.5)`},children:[(0,N.jsx)(Xe,{obra:e}),e.traducao===`automatica`&&(0,N.jsx)(`span`,{className:`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded`,title:`tradução automática, sem revisão humana`,style:{background:`color-mix(in srgb, var(--papel) 88%, transparent)`,color:`var(--tinta-2)`,fontSize:9,letterSpacing:`.08em`,textTransform:`uppercase`},children:`trad. automática`}),',
    para: '(0,N.jsxs)(`div`,{className:`fio-capa relative aspect-[2/3] overflow-hidden transition-transform duration-200 group-hover:-translate-y-1`,children:[(0,N.jsx)(Xe,{obra:e}),e.traducao===`automatica`?(0,N.jsx)(`span`,{className:`fio-selo fio-selo-trad`,title:`tradução automática do Fio, sem revisão humana`,children:`tradução Fio`}):/^lei-/.test(e.capa||``)?(0,N.jsx)(`span`,{className:`fio-selo fio-selo-lei`,children:`lei`}):null,e.nota!=null&&(0,N.jsxs)(`span`,{className:`fio-nota`,children:[`★ `,e.nota.toFixed(1).replace(`.`,`,`)]}),e.trilho===`A`&&ct(e.minutos)&&(0,N.jsx)(`span`,{className:`fio-tempo`,children:ct(e.minutos)}),',
  },
  {
    nome: 'visual: títulos das prateleiras com a barrinha',
    de: 'style:{fontFamily:`Literata, serif`},className:`text-[1.05rem]`',
    para: 'style:{fontFamily:`Literata, serif`},className:`fio-titulo text-[1.05rem]`',
    vezes: 2,
  },
  {
    nome: 'visual: títulos grandes das prateleiras com a barrinha',
    de: 'style:{fontFamily:`Literata, serif`},className:`text-[1.15rem]`',
    para: 'style:{fontFamily:`Literata, serif`},className:`fio-titulo text-[1.15rem]`',
    // 2 do bundle original + Da comunidade, Quadrinhos e Mangá em alta (remendos anteriores)
    vezes: 5,
  },
  {
    nome: 'caderno: seção "seus dados" desligada',
    de: 'h===`dados`&&(0,N.jsxs)(`section`,{className:`mt-8 pt-8`',
    para: '!1&&(0,N.jsxs)(`section`,{className:`mt-8 pt-8`',
  },
]

let s = readFileSync(arg('base'), 'utf8')
for (const r of REMENDOS) {
  if (r.trecho) {
    const t = r.trecho(s)
    if (!t) throw new Error(`âncora não encontrada: ${r.nome}`)
    s = s.slice(0, t[0]) + t[2] + s.slice(t[1])
  } else {
    // `vezes`: quantas âncoras iguais o remendo troca (padrão 1); número
    // diferente = bundle diferente do esperado, e nada é trocado
    const esperadas = r.vezes ?? 1
    const n = s.split(r.de).length - 1
    if (n !== esperadas) throw new Error(`"${r.nome}": esperava ${esperadas} âncora(s), achei ${n}`)
    s = s.split(r.de).join(r.para)
  }
  console.log(`  ok  ${r.nome}`)
}

const saida = arg('saida')
mkdirSync(join(saida, 'ativos'), { recursive: true })
const nome = `index-${createHash('sha256').update(s).digest('base64url').slice(0, 8)}.js`
writeFileSync(join(saida, 'ativos', nome), s)
// /fio-leitor.js: o que o leitor ganhou por fora do bundle (voz por plano,
// correções comunitárias). Script da própria origem, sem nada embutido.
let index = readFileSync(arg('index'), 'utf8').replace(/\/ativos\/index-[\w-]+\.js/, `/ativos/${nome}`)
// /fio-dono.js roda ANTES do bundle (script comum, sem defer): quando a
// sincronia começa, `window.fioDono` já existe.
if (!index.includes('/fio-dono.js')) index = index.replace(/<meta charset="UTF-8" \/>/i, (m) => `${m}\n    <script src="/fio-dono.js"></script>`)
if (!index.includes('/fio-dono.js')) throw new Error('index.html sem /fio-dono.js')
// /fio-visual.css: a cara dos sites de leitura (18/09), DEPOIS do CSS do app
if (!index.includes('/fio-visual.css')) index = index.replace('</head>', '    <link rel="stylesheet" href="/fio-visual.css">\n  </head>')
if (!index.includes('/fio-leitor.js')) index = index.replace('</head>', '    <script defer src="/fio-leitor.js"></script>\n  </head>')
if (!index.includes('/fio-app-extras.js')) index = index.replace('</head>', '    <script defer src="/fio-app-extras.js"></script>\n  </head>')
if (!index.includes(nome)) throw new Error('index.html não aponta para o bundle novo')
if (!index.includes('/fio-leitor.js')) throw new Error('index.html sem /fio-leitor.js')
writeFileSync(join(saida, 'index.html'), index)
console.log(`\n${saida}/ativos/${nome}`)
