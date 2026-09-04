// Funde um catálogo novo no banco de produção, sem tocar nas contas.
//
//   node servidor/fundir.mjs /entrada/catalogo.db
//
// **O problema.** O catálogo é derivado: nasce da ingestão, na máquina de
// quem desenvolve, e é refeito por inteiro a cada rodada. As contas não: elas
// só existem em produção, e perder uma é perder de verdade.
//
// Mandar o arquivo inteiro por cima apagaria as contas. Reingerir 1.500 obras
// dentro da VPS gastaria a máquina inteira por meia hora. Então: as tabelas
// de catálogo são substituídas em bloco, e as de gente ficam onde estão.

import { DatabaseSync } from 'node:sqlite'
import { existsSync } from 'node:fs'

// O que vem de fora. Ordem importa: os filhos primeiro na hora de apagar.
const DO_CATALOGO = [
  'busca_capitulo', 'busca_obra',
  'trilha_item', 'trilha', 'relacao_obra', 'fonte_ref', 'fragmento',
  'relacao_entidade', 'entidade', 'conceito', 'obra_tema', 'tema',
  'capitulo', 'disponibilidade', 'direito', 'texto', 'obra_pessoa',
  'obra', 'pessoa',
]

// O que NUNCA é tocado. Está escrito para ser lido numa revisão: se um dia
// alguém acrescentar uma tabela de gente, tem que aparecer aqui.
const DE_GENTE = [
  'leitor', 'sessao', 'convite', 'recuperacao', 'tentativa',
  'guardado', 'perfil_leitor', 'recomendacao', 'registro',
  // `abertura` é anônima, mas só existe em produção: é medição de uso, e a
  // máquina de desenvolvimento não tem nenhuma. Substituí-la apagaria a
  // contagem de "o mais lido" a cada publicação.
  'abertura',
]

const entrada = process.argv[2]
const destino = process.env.FIO_BANCO || '/dados/catalogo.db'

if (!entrada || !existsSync(entrada)) {
  console.error(`não achei o catálogo novo em ${entrada}`)
  process.exit(1)
}

const banco = new DatabaseSync(destino)
banco.exec('PRAGMA journal_mode = WAL')

// Contar uma tabela que pode ainda não existir: o banco de produção é mais
// velho que o esquema, e uma tabela nova só aparece lá depois da migração.
// Isto é RELATÓRIO — não pode derrubar uma fusão que já foi confirmada.
const contar = (t) => {
  try { return banco.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n }
  catch { return null }
}

const antes = Object.fromEntries(DE_GENTE.map(t => [t, contar(t)]))

banco.exec(`ATTACH DATABASE '${entrada.replace(/'/g, "''")}' AS entrada`)

// As chaves estrangeiras ficam desligadas durante a troca: apagar `obra`
// com elas ligadas dispara cascatas que apagariam `texto` de leitor (trilho
// C). Ligadas de volta no fim, com verificação — desligar e esquecer é como
// se cria banco inconsistente.
banco.exec('PRAGMA foreign_keys = OFF')
banco.exec('BEGIN')

let copiadas = 0
try {
  for (const tabela of DO_CATALOGO) {
    const existeLa = banco.prepare(
      `SELECT 1 FROM entrada.sqlite_master WHERE type IN ('table') AND name = ?`).get(tabela)
    if (!existeLa) continue

    // As colunas vêm nomeadas, e o nome do lado de cá NÃO leva `main.`.
    //
    // Os dois detalhes são por causa do FTS5: uma tabela virtual recusa
    // `DELETE FROM main.busca_obra` ("no such table") porque o módulo resolve
    // as tabelas-sombra dela por conta própria, e `SELECT *` nela não devolve
    // as colunas na ordem que o INSERT espera.
    const colunas = banco.prepare(`PRAGMA entrada.table_info(${tabela})`)
      .all().map(c => `"${c.name}"`).join(', ')

    if (tabela === 'texto') {
      // O arquivo que um leitor enviou é dele, e não vem no catálogo novo.
      banco.exec('DELETE FROM texto WHERE dono_id IS NULL')
    } else {
      banco.exec(`DELETE FROM ${tabela}`)
    }
    banco.exec(`INSERT INTO ${tabela} (${colunas}) SELECT ${colunas} FROM entrada.${tabela}`)
    copiadas++
  }
  banco.exec('COMMIT')
} catch (e) {
  banco.exec('ROLLBACK')
  console.error('nada foi mudado:', e.message)
  process.exit(1)
}

banco.exec('PRAGMA foreign_keys = ON')
const quebradas = banco.prepare('PRAGMA foreign_key_check').all()
if (quebradas.length) {
  console.error(`ATENÇÃO: ${quebradas.length} referências quebradas depois da fusão`)
  console.error(quebradas.slice(0, 5))
}

banco.exec('DETACH DATABASE entrada')
banco.exec('PRAGMA wal_checkpoint(TRUNCATE)')

const depois = Object.fromEntries(DE_GENTE.map(t => [t, contar(t)]))
const obras = banco.prepare('SELECT COUNT(*) n FROM obra').get().n

console.log(`tabelas de catálogo trocadas . ${copiadas}`)
console.log(`obras .......................... ${obras}`)
for (const t of DE_GENTE) {
  if (depois[t] === null) { console.log(`${t.padEnd(14)}     —  ainda não existe aqui`); continue }
  const igual = antes[t] === depois[t]
  console.log(`${t.padEnd(14)} ${String(depois[t]).padStart(5)}  ${igual ? 'intacta' : `MUDOU (era ${antes[t]})`}`)
}
banco.close()
