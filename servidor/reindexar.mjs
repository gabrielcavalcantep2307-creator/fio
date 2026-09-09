// Refazer os índices de busca a partir do que já está no banco.
//
//   node servidor/reindexar.mjs            # refaz os dois
//   node servidor/reindexar.mjs --obra     # só o de obras
//   node servidor/reindexar.mjs --capitulo # só o de capítulos
//
// ─────────────────────────────────────────────────────────────
// Por que isto existe: mais da metade do banco é índice
//
// Medido com `dbstat` no catálogo de 1,8 GB:
//
//     712 MB   capitulo                 ← o texto dos livros
//     686 MB   busca_capitulo_content   ← uma SEGUNDA cópia do mesmo texto
//     365 MB   busca_capitulo_data      ← o índice invertido
//      10 MB   traducao_memoria
//       …      todo o resto junto não chega a 5 MB
//
// O FTS5, na forma padrão, guarda o próprio conteúdo indexado. São 1.051 MB
// de dado DERIVADO — nada ali que não possa ser refeito a partir de
// `capitulo` e `obra`.
//
// Isso importa numa hora específica: a publicação manda o banco inteiro para
// a VPS. Mandar o índice junto é mandar 1 GB do que a outra ponta pode
// construir sozinha, e a diferença aparece no relógio — o envio de uma
// publicação passou de minutos a horas conforme o acervo cresceu.
//
// Então a cópia sai sem índice (`copia.mjs --sem-busca`) e a fusão o refaz
// (`fundir.mjs`). A busca funciona igual; o que muda é onde o trabalho é
// feito.
//
// ─────────────────────────────────────────────────────────────
// O que NÃO foi feito, e por quê
//
// O FTS5 tem a forma `content='capitulo'`, em que ele não guarda cópia
// nenhuma e lê da tabela original. Isso apagaria os 686 MB de vez, e não só
// no transporte. Não foi feito agora porque muda o esquema de uma tabela que
// o site consulta a cada busca, e trocar isso no mesmo dia em que se sobe
// sete livros novos é juntar dois riscos sem necessidade. Fica anotado como
// o próximo passo óbvio.

import { pathToFileURL } from 'node:url'
import { abrir, fechar, recriarDerivada } from './banco/base.mjs'

/** Quantos capítulos entram por transação. */
const LOTE = 2000

/**
 * O índice de capítulos, refeito do zero.
 *
 * Em lotes, e não numa transação só: são 86 mil capítulos e 110 milhões de
 * palavras, e a VPS que roda isto tem 2 GB de memória divididos com outro
 * produto. Uma transação única segura tudo no journal até o COMMIT.
 */
export function reindexarCapitulos(banco, aoAndar) {
  recriarDerivada(banco, 'busca_capitulo')
  const total = banco.prepare('SELECT COUNT(*) n FROM capitulo').get().n
  const pagina = banco.prepare(
    'SELECT id, texto_id, corpo FROM capitulo WHERE id > ? ORDER BY id LIMIT ?')
  const poe = banco.prepare(
    'INSERT INTO busca_capitulo (corpo, capitulo_id, texto_id) VALUES (?,?,?)')

  let ultimo = 0
  let feitos = 0
  for (;;) {
    const linhas = pagina.all(ultimo, LOTE)
    if (!linhas.length) break
    banco.exec('BEGIN')
    for (const c of linhas) {
      poe.run(c.corpo, c.id, c.texto_id)
      ultimo = c.id
    }
    banco.exec('COMMIT')
    feitos += linhas.length
    aoAndar?.(feitos, total)
  }
  return feitos
}

/**
 * O índice de obras.
 *
 * Pequeno (uma linha por obra) e reconstruído inteiro de uma vez. Os campos
 * são os mesmos que os scripts de ingestão já gravavam — a diferença é que
 * agora existe UM lugar que sabe montá-los, em vez de cinco que repetem a
 * mesma consulta.
 */
export function reindexarObras(banco) {
  recriarDerivada(banco, 'busca_obra')
  const obras = banco.prepare(`
    SELECT o.id, o.titulo, o.titulo_pt,
           (SELECT group_concat(p.nome, ', ') FROM obra_pessoa op
              JOIN pessoa p ON p.id = op.pessoa_id
             WHERE op.obra_id = o.id) autores,
           (SELECT group_concat(t.nome, ', ') FROM obra_tema ot
              JOIN tema t ON t.id = ot.tema_id
             WHERE ot.obra_id = o.id) temas,
           (SELECT f.corpo FROM fragmento f
             WHERE f.obra_id = o.id AND f.tipo = 'chamada'
               AND (f.gerado_por <> 'ia' OR f.revisado = 1) LIMIT 1) resumo
      FROM obra o
     WHERE o.publicada = 1`).all()
  const poe = banco.prepare(
    'INSERT INTO busca_obra (titulo, titulo_pt, autores, temas, resumo, conteudo_obra_id) VALUES (?,?,?,?,?,?)')
  banco.exec('BEGIN')
  for (const o of obras) {
    poe.run(o.titulo ?? '', o.titulo_pt ?? '', o.autores ?? '', o.temas ?? '', o.resumo ?? '', o.id)
  }
  banco.exec('COMMIT')
  return obras.length
}

function main() {
  const soObra = process.argv.includes('--obra')
  const soCapitulo = process.argv.includes('--capitulo')
  const banco = abrir()

  if (!soCapitulo) {
    console.log(`busca de obras ..... ${reindexarObras(banco)} obras`)
  }
  if (!soObra) {
    const n = reindexarCapitulos(banco, (feitos, total) => {
      process.stdout.write(`\rbusca de capítulos . ${feitos}/${total}`)
    })
    console.log(`\rbusca de capítulos . ${n} capítulos${' '.repeat(20)}`)
  }
  fechar()
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main()
