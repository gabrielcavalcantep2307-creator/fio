// O catálogo estático do site, a partir do banco.
//
//   import { publicarCatalogo, publicarObra } from './servicos/catalogo.mjs'
//   publicarCatalogo(banco, '/site-dados')        // tudo, ~30 s
//   publicarObra(banco, '/site-dados', 123)       // uma obra, milissegundos
//
// Dois formatos, e a razão de cada um:
//
//   catalogo.json     magro, carregado uma vez. É o que a busca, os filtros e
//                     as prateleiras usam — tudo acontece no navegador, sem
//                     ida ao servidor.
//   fichas/{id}.json  a página da obra: onde encontrar, assuntos, sumário.
//
// O TEXTO dos livros NÃO sai daqui. Ele já foi arquivo estático, e parou de
// ser quando o acervo legível passou de 123 para 527 obras: 127 MB de texto
// num diretório que é copiado inteiro a cada publicação, e versionado no git.
// Agora o texto vem do banco, por `GET /api/livro/{id}`.
//
// ─────────────────────────────────────────────────────────────
// UMA OBRA DE CADA VEZ (19/09/2026)
//
// Era um script (ingestao/publicar.mjs) que a esteira rodava como outro
// processo a cada livro pronto: 5 mil obras refeitas, 30 s e 130 MB, para
// trocar UMA linha. Agora `publicarObra` troca só a linha e a ficha daquela
// obra, e acerta as contagens das prateleiras; o catálogo inteiro é refeito
// com calma (na partida da esteira e quando ela fica ociosa), porque as
// coleções da home dependem de todas as obras juntas.
//
// A troca é sempre atômica: escreve ao lado e troca por `rename`, no mesmo
// disco. O site nunca serve um catálogo pela metade.
// ─────────────────────────────────────────────────────────────

import { writeFileSync, mkdirSync, rmSync, existsSync, renameSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ORDEM, FICHAS, criarResolvedor } from './descoberta.mjs'

// ─────────────────────────────────────────────────────────────
// O FILTRO QUE FOI EMBORA, e por que ele estava errado
//
// Aqui dizia `o.idioma_original = 'pt'`, com o comentário "só entra no site o
// que é em português". A regra do dono é essa mesma, e o filtro a traduzia
// errado: `idioma_original` é a língua em que o AUTOR escreveu, e não a
// língua do texto que nós servimos.
//
// Com ele, todo livro que NÓS traduzimos ficaria de fora do site: 1984 e A
// Revolução dos Bichos têm `idioma_original = 'en'` e estão em português no
// nosso banco. O catálogo que está no ar inclui os dois, então a versão que
// rodou de verdade já não tinha este filtro — o que sobrou aqui foi a versão
// velha, que teria apagado do site os 36 livros da esteira.
//
// A regra continua valendo, e quem a aplica é a ingestão, que só traz texto
// em português. Aqui entra tudo que está publicado.
// ─────────────────────────────────────────────────────────────
const SQL_OBRAS = `
  SELECT o.id, o.titulo, o.titulo_pt, o.subtitulo, o.ano, o.trilho, o.nivel,
         o.paginas, o.minutos_leitura, o.capa, o.capa_externa, o.assuntos, o.olid_work,
         p.id autor_id, p.nome autor, p.nascimento autor_nasc, p.morte autor_morte,
         t.id texto_id, t.normalizado, t.idioma, t.fonte, t.fonte_url,
         d.estado, d.motivo
    FROM obra o
    LEFT JOIN obra_pessoa op ON op.obra_id = o.id AND op.papel = 'autor'
    LEFT JOIN pessoa p ON p.id = op.pessoa_id
    -- O MESMO texto que a API vai servir, e não um qualquer.
    --
    -- Aqui dizia só "t.obra_id = o.id AND t.dono_id IS NULL", com GROUP BY o.id
    -- por cima. Numa obra com dois textos — a nossa tradução e o original de
    -- que ela partiu — isso deixa o SQLite escolher qual sobrevive ao GROUP BY.
    -- A API não deixa: ela tem esta mesma subconsulta, que põe o português na
    -- frente. Catálogo e servidor escolhendo por critérios diferentes é a
    -- receita de uma ficha que descreve um texto e um botão que entrega outro.
    LEFT JOIN texto t ON t.id = (
      SELECT id FROM texto WHERE obra_id = o.id AND dono_id IS NULL
       ORDER BY (idioma = 'pt') DESC, normalizado DESC, id LIMIT 1)
    LEFT JOIN direito d ON d.texto_id = t.id AND d.jurisdicao = ?
`

const limpo = (s) => (s ?? '').split('\n')[0].replace(/\s+/g, ' ').trim()

// Aqui em cima, e não junto de `motivoDoImpedimento` lá embaixo, que é quem a
// usa: uma `const` declarada depois do laço existe mas ainda não está
// inicializada quando a primeira obra impedida passa.
const NOME_DA_LINGUA = {
  es: 'espanhol', en: 'inglês', fr: 'francês', de: 'alemão',
  it: 'italiano', la: 'latim', zh: 'chinês',
}

/** As consultas e a montagem de uma obra, preparadas uma vez por publicação. */
function preparar(banco, casa) {
  const temasDe = banco.prepare(
    `SELECT t.nome, ot.peso FROM obra_tema ot JOIN tema t ON t.id = ot.tema_id
      WHERE ot.obra_id = ? ORDER BY ot.peso DESC, t.nome`)
  const capsDe = banco.prepare(
    'SELECT ordem, titulo, corpo, palavras FROM capitulo WHERE texto_id = ? ORDER BY ordem')
  // A camada editorial mora em `fragmento`, com o anti-spoiler embutido:
  // `revela_ate = 0` é o que pode aparecer antes de abrir o livro. A página da
  // obra só mostra esses — quem ainda não leu nada não pode levar um spoiler
  // da ficha.
  const editorialDe = banco.prepare(
    `SELECT tipo, corpo FROM fragmento
      WHERE obra_id = ? AND revela_ate = 0
        AND (gerado_por <> 'ia' OR revisado = 1)`)
  const ondeDe = banco.prepare(
    `SELECT tipo, provedor, rotulo, url FROM disponibilidade
      WHERE obra_id = ? AND ativo = 1 ORDER BY tipo`)



  // ── a camada de descoberta: "Antes de ler", ideias e conversas ──
  //
  // Vem de `descoberta.mjs`, e não do banco: é curadoria escrita à mão, versionada
  // com o código. As conversas apontam para outras obras por referência; só entra
  // a que resolve para uma obra publicada — ligação para livro que não existe no
  // site é link quebrado com cara de sugestão.
  const resolver = criarResolvedor(banco)
  const nomeDaObra = banco.prepare(`
    SELECT COALESCE(o.titulo_pt, o.titulo) titulo,
           (SELECT p.nome FROM obra_pessoa op JOIN pessoa p ON p.id = op.pessoa_id
             WHERE op.obra_id = o.id AND op.papel = 'autor' LIMIT 1) autor
      FROM obra o WHERE o.id = ? AND o.publicada = 1`)
  const extras = new Map()
  for (const fx of FICHAS) {
    const id = resolver(fx.obra)
    if (id == null) continue
    const conexoes = []
    for (const cx of fx.conexoes ?? []) {
      const alvo = resolver(cx.obra)
      const n = alvo != null && alvo !== id ? nomeDaObra.get(alvo) : null
      if (n) conexoes.push({ id: alvo, titulo: limpo(n.titulo), autor: n.autor, porque: cx.porque })
    }
    extras.set(id, { antes: fx.antes ?? null, tags: fx.tags ?? [], conexoes })
  }

  // ── a chamada que vai para o catálogo ──
  //
  // No catálogo, a chamada tem UM uso: o destaque "para começar" da home sorteia
  // entre os legíveis que têm chamada e capa. Em 16/09 as leis ganharam capa, e a
  // home abriu com a Lei de Drogas como sugestão de leitura. A lei continua com
  // a chamada na ficha; só não entra no sorteio. E um livro da curadoria sem
  // chamada escrita usa o "você vai encontrar" do Antes de ler — assim o destaque
  // gira entre os livros que a descoberta quer mostrar.
  function chamadaDaHome(o, editorial) {
    if (o.autor === 'Brasil') return null
    return editorial.chamada ?? extras.get(o.id)?.antes?.encontra ?? null
  }


  /** A linha do catálogo e a ficha de uma obra, e se ela se lê aqui. */
  function montar(o) {
    // Botão de leitura exige TRÊS coisas: temos o texto, ele está em português,
    // e o direito permite servir aqui. Nunca duas só.
    //
    // ── por que o idioma entrou nesta conta ──
    //
    // Em 14/09/2026 havia 19 obras em trilho A cujo texto não era português:
    // seis volumes das "Memorias del general O'Leary", um "Tratado teórico
    // práctico de homeopatía", a correspondência do Lamartine em francês. Todas
    // marcadas `pt` no banco por engano da ingestão, todas com botão de ler, e
    // todas abrindo em espanhol ou francês na cara de quem clicasse.
    //
    // O rótulo já foi corrigido no banco por `conferir-idioma.mjs`. Isto aqui é
    // o que impede a coisa de voltar: a prateleira portuguesa passa a perguntar
    // a língua em vez de supor. Elas não somem do acervo — caem para trilho B,
    // que é a ficha honesta: o livro existe, e não é aqui que se lê em português.
    const podeLer = o.normalizado === 1
      && o.idioma === 'pt'
      && (o.estado === 'dominio_publico' || o.estado === 'licenca_livre')
    const trilho = podeLer ? 'A' : 'B'
    const temas = temasDe.all(o.id).map(t => t.nome)
    const editorial = Object.fromEntries(editorialDe.all(o.id).map(f => [f.tipo, f.corpo]))

    const linha = {
      id: o.id,
      titulo: limpo(o.titulo_pt || o.titulo),
      autor: o.autor ?? 'autoria não identificada',
      autorId: o.autor_id,
      ano: o.ano,
      trilho,
      minutos: o.minutos_leitura,
      temas,
      // a capa: arquivo nosso, ou id na Open Library, ou nada (o site desenha)
      capa: o.capa ?? null,
      capaOL: o.capa_externa ?? null,
      ...(chamadaDaHome(o, editorial) ? { chamada: chamadaDaHome(o, editorial) } : {}),
    }

    const ficha = {
      ...linha,
      // a ficha mantém a chamada verdadeira, inclusive a das leis
      ...(editorial.chamada ? { chamada: editorial.chamada } : {}),
      subtitulo: o.subtitulo,
      paginas: o.paginas,
      autorNasc: o.autor_nasc,
      autorMorte: o.autor_morte,
      assuntos: (o.assuntos ?? '').split(';').map(s => s.trim()).filter(Boolean).slice(0, 10),
      porque: editorial.porque_existe ?? null,
      observar: editorial.como_ler ?? null,
      direito: podeLer ? o.motivo : null,
      impedimento: podeLer ? null : motivoDoImpedimento(o),
      fonte: o.fonte,
      fonteUrl: o.fonte_url,
      olid: o.olid_work,
      onde: ondeDe.all(o.id),
      capitulos: null,
      ...(extras.get(o.id) ?? {}),
    }

    if (podeLer) {
      // Só o sumário: o corpo dos capítulos fica no banco.
      ficha.capitulos = capsDe.all(o.texto_id)
        .map(c => ({ ordem: c.ordem, titulo: c.titulo, palavras: c.palavras }))
    }


    return { linha, ficha, podeLer }
  }

  function motivoDoImpedimento(o) {
    if (o.fonte !== 'gutenberg' && !o.texto_id) {
      return 'Esta obra está protegida por direito autoral — não podemos servir o texto. '
        + 'A ficha é nossa; o livro se encontra abaixo.'
    }
    if (o.normalizado !== 1) {
      return 'O texto desta obra ainda não foi trazido. Ela está no catálogo, e entra '
        + 'quando a ingestão passar por ela.'
    }
    // Este caso é novo, e sem ele a obra cairia no motivo de direito lá embaixo —
    // que diria "estado de direito não confirmado" sobre um livro do século XIX
    // em domínio público. Nada a ver: o impedimento é a língua, e o leitor tem
    // direito de saber qual é, porque para quem lê espanhol isso não é
    // impedimento nenhum — é só clicar na fonte.
    if (o.idioma && o.idioma !== 'pt') {
      const nome = NOME_DA_LINGUA[o.idioma] ?? o.idioma
      return `O texto que temos desta obra está em ${nome}, e esta é uma biblioteca `
        + 'em português. Ela fica no catálogo, e entra para leitura no dia em que '
        + 'houver uma tradução — nossa ou em domínio público. A fonte está abaixo.'
    }
    return o.motivo ?? 'Estado de direito não confirmado para o Brasil.'
  }


  const todas = banco.prepare(`${SQL_OBRAS}   WHERE o.publicada = 1
   GROUP BY o.id
   ORDER BY o.titulo`)
  const uma = banco.prepare(`${SQL_OBRAS}   WHERE o.publicada = 1 AND o.id = ?
   GROUP BY o.id`)
  return { montar, todas: () => todas.all(casa), uma: (id) => uma.get(casa, id) }
}

/** Prateleiras, autores e coleções, a partir das linhas do catálogo. */
function agregados(banco, resumo) {
  // ── prateleiras e autores, já contados: a home não faz conta nenhuma ──

  const temas = banco.prepare(`
    SELECT t.nome, t.resumo, COUNT(*) obras,
           SUM(CASE WHEN o.trilho = 'A' THEN 1 ELSE 0 END) legiveis
      FROM tema t
      JOIN obra_tema ot ON ot.tema_id = t.id
      JOIN obra o ON o.id = ot.obra_id
     WHERE o.publicada = 1
     GROUP BY t.id HAVING obras >= 3
     ORDER BY obras DESC`).all()

  const autores = banco.prepare(`
    SELECT p.id, p.nome, p.nascimento, p.morte, COUNT(*) obras
      FROM pessoa p
      JOIN obra_pessoa op ON op.pessoa_id = p.id AND op.papel = 'autor'
      JOIN obra o ON o.id = op.obra_id
     WHERE o.publicada = 1
     GROUP BY p.id HAVING obras >= 1
     ORDER BY obras DESC`).all()

  // ── coleções: prateleiras com curadoria, não com filtro ──
  //
  // A diferença importa. "Romance" é um filtro: sai do metadado. "Todo mundo
  // está lendo" é uma escolha de gente, e é o que uma biblioteca faz que uma
  // planilha não faz.
  const colecoes = banco.prepare(`
    SELECT t.id, t.nome, t.resumo FROM trilha t WHERE t.publicada = 1 ORDER BY t.id`).all()
  const itensDe = banco.prepare(
    'SELECT obra_id, porque FROM trilha_item WHERE trilha_id = ? ORDER BY ordem')
  const publicadas = new Set(resumo.map(o => o.id))
  const legivel = new Set(resumo.filter(o => o.trilho === 'A').map(o => o.id))

  // ── `nossa`: prateleira de leitura, ou vitrine do que falta ──
  //
  // O site separa as coleções em duas: as PRATELEIRAS (Machado, Eça, ficção
  // científica — coisa que se lê aqui) e a vitrine "O que ainda não podemos
  // servir" (Sapiens, Duna — protegidos, que têm dono). `nossa` é a bandeira que
  // decide o lado. A versão reconstruída deste arquivo parou de emiti-la, e sem
  // ela as prateleiras boas sumiam da home.
  //
  // A regra: uma coleção com PELO MENOS UM livro legível é prateleira. Basta um,
  // e não a maioria — senão as prateleiras de gênero que estamos traduzindo
  // ficavam presas na vitrine até metade estar pronta, e os primeiros traduzidos
  // não apareciam em lugar nenhum.
  //
  // E os livros FICAM na coleção, todos — não há mais "graduação" que removia o
  // legível. Removê-lo deixava o livro órfão: o Alice traduzido saía da vitrine
  // de fantasia e não tinha prateleira de leitura para onde ir, porque a
  // prateleira só viraria "nossa" com a maioria pronta. Agora a coleção mostra
  // tudo: o traduzido com "ler", o que falta com "a caminho", lado a lado, e ela
  // enche à vista conforme a esteira anda. O cartão de cada livro já diz o
  // estado dele; a bandeira só decide o TÍTULO da seção.
  //
  // A vitrine sobra para as coleções com ZERO legível — os protegidos, que
  // nunca vamos traduzir. Aí o título "o que ainda não podemos servir" é a
  // verdade inteira, sem nenhum botão de ler embaixo dele.
  for (const c of colecoes) {
    const ids = itensDe.all(c.id).map(i => i.obra_id).filter(id => publicadas.has(id))
    c.nossa = ids.some(id => legivel.has(id))
    c.obras = ids
    delete c.id
  }

  // o trilho A no catálogo é o calculado aqui, não o gravado na obra
  for (const t of temas) {
    t.legiveis = resumo.filter(o => o.temas.includes(t.nome) && o.trilho === 'A').length
  }

  // ── a ordem e o fim da vitrine ──
  //
  // A home desenha as coleções na ordem em que chegam. A ordem é a da curadoria
  // (`ORDEM`, em descoberta.mjs); o que não está nela vem depois, pela antiga.
  //
  // E a vitrine "O que ainda não podemos servir" saiu, a pedido do dono (16/09):
  // uma coleção sem NENHUM livro legível não é publicada. O site só desenha a
  // vitrine quando recebe coleção com `nossa: false` — sem nenhuma, ela some
  // sozinha, sem remendo no bundle. As fichas desses livros continuam existindo
  // e aparecem na busca e na estante; só deixaram de ter uma seção na home.
  const posicao = (nome) => { const i = ORDEM.indexOf(nome); return i < 0 ? ORDEM.length : i }
  const naHome = colecoes
    .map((c, i) => ({ c, i }))
    .sort((x, y) => posicao(x.c.nome) - posicao(y.c.nome) || x.i - y.i)
    .map(({ c }) => c)
    .filter(c => c.nossa && c.obras.length >= 3)


  return { temas, autores, colecoes: naHome }
}

/**
 * Monta o catálogo inteiro. Cada ficha sai por `aoFicha` assim que fica
 * pronta, para não segurar 5 mil fichas na memória.
 */
export function montarCatalogo(banco, { jurisdicao = 'BR', aoFicha = () => {} } = {}) {
  const p = preparar(banco, jurisdicao)
  const resumo = []
  let palavras = 0
  for (const o of p.todas()) {
    const { linha, ficha, podeLer } = p.montar(o)
    resumo.push(linha)
    if (podeLer) palavras += ficha.capitulos.reduce((s, c) => s + c.palavras, 0)
    aoFicha(o.id, ficha)
  }
  const { temas, autores, colecoes } = agregados(banco, resumo)
  return {
    catalogo: { geradoEm: new Date().toISOString().slice(0, 10), obras: resumo, temas, autores, colecoes },
    numeros: {
      obras: resumo.length, legiveis: resumo.filter((o) => o.trilho === 'A').length, palavras,
      comCapa: resumo.filter((o) => o.capa || o.capaOL).length, comChamada: resumo.filter((o) => o.chamada).length,
      prateleiras: temas.length, colecoes: colecoes.length, autores: autores.length,
    },
  }
}

const gravarJson = (arquivo, valor) => {
  const tmp = `${arquivo}.novo`
  writeFileSync(tmp, JSON.stringify(valor))
  renameSync(tmp, arquivo)
}

/**
 * Refaz `catalogo.json` e `fichas/` em `pasta`, trocando tudo de uma vez.
 *
 * Trava do catálogo encolhido: se o novo tiver menos de `minimo` (90%) das
 * obras do que está no ar, NÃO troca — um banco que respondeu pela metade não
 * pode apagar metade do site. Devolve os números, e `trocou: false` nesse caso.
 */
export function publicarCatalogo(banco, pasta, { jurisdicao = 'BR', minimo = 0.9 } = {}) {
  mkdirSync(pasta, { recursive: true })
  const novo = join(pasta, '.catalogo-novo')
  rmSync(novo, { recursive: true, force: true })
  mkdirSync(join(novo, 'fichas'), { recursive: true })
  const { catalogo, numeros } = montarCatalogo(banco, {
    jurisdicao, aoFicha: (id, ficha) => writeFileSync(join(novo, 'fichas', `${id}.json`), JSON.stringify(ficha)),
  })

  const atual = join(pasta, 'catalogo.json')
  const noAr = existsSync(atual) ? (JSON.parse(readFileSync(atual, 'utf8')).obras?.length ?? 0) : 0
  if (catalogo.obras.length < noAr * minimo) {
    rmSync(novo, { recursive: true, force: true })
    return { ...numeros, trocou: false, noAr }
  }

  writeFileSync(join(novo, 'catalogo.json'), JSON.stringify(catalogo))
  const velhas = join(pasta, '.fichas-velhas')
  rmSync(velhas, { recursive: true, force: true })
  if (existsSync(join(pasta, 'fichas'))) renameSync(join(pasta, 'fichas'), velhas)
  renameSync(join(novo, 'fichas'), join(pasta, 'fichas'))
  renameSync(join(novo, 'catalogo.json'), atual)
  rmSync(velhas, { recursive: true, force: true })
  rmSync(novo, { recursive: true, force: true })
  rmSync(join(pasta, 'livros'), { recursive: true, force: true }) // não existe mais
  return { ...numeros, trocou: true, noAr }
}

/**
 * Publica UMA obra: a linha dela no catálogo, a ficha, e as contagens de
 * prateleira que ela mexe. Para o livro que a esteira acabou de instalar.
 *
 * Coleção nova na home (uma que só passa a ter livro legível agora) fica para
 * o `publicarCatalogo` seguinte — ela depende de todas as obras juntas.
 *
 * @returns {{ publicada: boolean, trilho?: string }}
 */
export function publicarObra(banco, pasta, obraId, { jurisdicao = 'BR' } = {}) {
  const atual = join(pasta, 'catalogo.json')
  if (!existsSync(atual)) return { ...publicarCatalogo(banco, pasta, { jurisdicao }), publicada: true, inteiro: true }
  const catalogo = JSON.parse(readFileSync(atual, 'utf8'))
  const p = preparar(banco, jurisdicao)
  const o = p.uma(obraId)
  const i = catalogo.obras.findIndex((x) => x.id === obraId)

  if (!o) {
    // despublicada: sai do catálogo e a ficha some
    if (i < 0) return { publicada: false }
    const [saiu] = catalogo.obras.splice(i, 1)
    for (const t of catalogo.temas) if (saiu.temas?.includes(t.nome)) { t.obras--; if (saiu.trilho === 'A') t.legiveis-- }
    gravarJson(atual, catalogo)
    rmSync(join(pasta, 'fichas', `${obraId}.json`), { force: true })
    return { publicada: false }
  }

  const { linha, ficha } = p.montar(o)
  const antes = i >= 0 ? catalogo.obras[i] : null
  if (antes) catalogo.obras[i] = linha
  else {
    // na ordem do título, como o catálogo inteiro sai
    const j = catalogo.obras.findIndex((x) => String(x.titulo).localeCompare(String(linha.titulo)) > 0)
    catalogo.obras.splice(j < 0 ? catalogo.obras.length : j, 0, linha)
    const autor = catalogo.autores.find((a) => a.id === linha.autorId)
    if (autor) autor.obras++
    else if (linha.autorId) catalogo.autores.push({ id: linha.autorId, nome: o.autor, nascimento: o.autor_nasc, morte: o.autor_morte, obras: 1 })
  }
  // as prateleiras contam obras e legíveis: acerta só o que esta obra mexeu
  for (const t of catalogo.temas) {
    const tinha = antes?.temas?.includes(t.nome), tem = linha.temas.includes(t.nome)
    t.obras += (tem ? 1 : 0) - (tinha ? 1 : 0)
    t.legiveis += (tem && linha.trilho === 'A' ? 1 : 0) - (tinha && antes.trilho === 'A' ? 1 : 0)
  }
  mkdirSync(join(pasta, 'fichas'), { recursive: true })
  gravarJson(join(pasta, 'fichas', `${obraId}.json`), ficha)
  gravarJson(atual, catalogo)
  return { publicada: true, trilho: linha.trilho }
}
