// Transforma o banco no site estático.
//
// Três formatos, e a razão de cada um:
//
//   catalogo.json     magro, carregado uma vez. É o que a busca, os filtros e
//                     as prateleiras usam — tudo acontece no navegador, sem
//                     ida ao servidor.
//   fichas/{id}.json  a página da obra: onde encontrar, assuntos, sumário.
//
// O TEXTO dos livros NÃO sai daqui. Ele já foi arquivo estático, e parou de
// ser quando o acervo legível passou de 123 para 527 obras: 127 MB de texto
// num diretório que é copiado inteiro a cada publicação, e versionado no git.
// Agora o texto vem do banco, por `GET /api/livro/{id}` — o banco já vai para
// a máquina de qualquer jeito, e o site voltou a caber em poucos megabytes.
//
//   node ingestao/publicar.mjs

import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { abrir, fechar, RAIZ } from '../servidor/banco/base.mjs'

// Para onde vai. O padrão continua sendo a pasta do site em desenvolvimento;
// `--saida` existe porque este script também roda DENTRO do container, contra
// o banco de produção, para republicar o catálogo sem reconstruir o site.
const ondeSai = (() => {
  const i = process.argv.indexOf('--saida')
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : null
})()
const SAIDA = ondeSai ?? join(RAIZ, 'web', 'public', 'dados')
const CASA = process.env.FIO_JURISDICAO || 'BR'

const banco = abrir()
rmSync(join(SAIDA, 'livros'), { recursive: true, force: true }) // não existe mais
rmSync(join(SAIDA, 'fichas'), { recursive: true, force: true })
mkdirSync(join(SAIDA, 'fichas'), { recursive: true })

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
const obras = banco.prepare(`
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
   WHERE o.publicada = 1
   GROUP BY o.id
   ORDER BY o.titulo`).all(CASA)

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

const limpo = (s) => (s ?? '').split('\n')[0].replace(/\s+/g, ' ').trim()

// Aqui em cima, e não junto de `motivoDoImpedimento` lá embaixo, que é quem a
// usa: `function` é içada, `const` não. Declarada depois do laço, ela existe
// mas ainda não está inicializada quando a primeira obra impedida passa — e o
// erro que sai, "Cannot access before initialization", não parece de ordem.
const NOME_DA_LINGUA = {
  es: 'espanhol', en: 'inglês', fr: 'francês', de: 'alemão',
  it: 'italiano', la: 'latim', zh: 'chinês',
}

const resumo = []
let comTexto = 0
let bytes = 0

for (const o of obras) {
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
    ...(editorial.chamada ? { chamada: editorial.chamada } : {}),
  }
  resumo.push(linha)

  const ficha = {
    ...linha,
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
  }

  if (podeLer) {
    // Só o sumário: o corpo dos capítulos fica no banco.
    ficha.capitulos = capsDe.all(o.texto_id)
      .map(c => ({ ordem: c.ordem, titulo: c.titulo, palavras: c.palavras }))
    bytes += ficha.capitulos.reduce((s, c) => s + c.palavras, 0)
    comTexto++
  }

  writeFileSync(join(SAIDA, 'fichas', `${o.id}.json`), JSON.stringify(ficha))
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
for (const c of colecoes) {
  c.obras = itensDe.all(c.id).map(i => i.obra_id).filter(id => publicadas.has(id))
  delete c.id
}

// o trilho A no catálogo é o calculado aqui, não o gravado na obra
const legiveis = resumo.filter(o => o.trilho === 'A').length
for (const t of temas) {
  t.legiveis = resumo.filter(o => o.temas.includes(t.nome) && o.trilho === 'A').length
}

writeFileSync(join(SAIDA, 'catalogo.json'), JSON.stringify({
  geradoEm: new Date().toISOString().slice(0, 10),
  obras: resumo, temas, autores, colecoes: colecoes.filter(c => c.obras.length >= 3),
}))

const capas = existsSync(join(RAIZ, 'web', 'public', 'capas'))
console.log(`catálogo ...... ${resumo.length} obras em português`)
console.log(`para ler ...... ${legiveis}  (${(bytes / 1e6).toFixed(1)} milhões de palavras, no banco)`)
console.log(`só ficha ...... ${resumo.length - legiveis}`)
console.log(`com capa ...... ${resumo.filter(o => o.capa || o.capaOL).length}`)
console.log(`com chamada ... ${resumo.filter(o => o.chamada).length}`)
console.log(`prateleiras ... ${temas.length}`)
console.log(`coleções ...... ${colecoes.length}`)
console.log(`autores ....... ${autores.length}`)
console.log(`capas locais .. ${capas ? 'sim' : 'não (rode ingestao/capas.mjs)'}`)
fechar()
