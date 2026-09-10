// Instalar de uma vez tudo que a esteira traduziu.
//
//   node ingestao/instalar-lote.mjs --banco /dados/catalogo.db
//
// Varre `dados/traducoes/obraNNN.json` e põe cada um no catálogo. O número no
// nome do arquivo É o id da obra — foi assim que `achar-fonte.mjs` batizou os
// arquivos, justamente para o instalador não precisar de mais nenhuma lista.
//
// Cada obra vai numa transação sua. Um arquivo estragado não leva os outros,
// e rodar de novo é seguro: a instalação de uma obra que já tem tradução
// nossa apaga a anterior antes de gravar, então não empilha.
//
// O ano de morte sai do banco, e não do arquivo: é ele que escreve o motivo
// na tabela `direito`, e essa frase é a que responde "por que este livro pode
// estar aqui?" no dia em que alguém perguntar.

import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const PASTA = join(RAIZ, 'dados', 'traducoes')
const arg = (n, p = null) => {
  const i = process.argv.indexOf(`--${n}`)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : p
}
const banco = arg('banco', join(RAIZ, 'dados', 'catalogo.db'))

const db = new DatabaseSync(banco, { readOnly: true })
const morteDe = db.prepare(`
  SELECT p.morte FROM obra o
    JOIN obra_pessoa op ON op.obra_id = o.id AND op.papel = 'autor'
    JOIN pessoa p ON p.id = op.pessoa_id
   WHERE o.id = ?`)

const arquivos = readdirSync(PASTA)
  .filter((f) => /^obra\d+\.json$/.test(f))
  .sort()

console.log(`${arquivos.length} traduções para instalar\n`)

let postas = 0
const falhas = []

for (const f of arquivos) {
  const obra = Number(f.match(/\d+/)[0])
  const morte = morteDe.get(obra)?.morte ?? 0

  const r = spawnSync(process.execPath, [
    join(RAIZ, 'ingestao', 'instalar-traducao.mjs'),
    '--arquivo', f.replace(/\.json$/, ''),
    '--obra', String(obra),
    '--banco', banco,
    '--morte', String(morte),
  ], { encoding: 'utf8' })

  const saida = `${r.stdout ?? ''}${r.stderr ?? ''}`
  if (r.status === 0 && /trilho/.test(saida)) {
    const linha = saida.split('\n').find((l) => /texto \d+:/.test(l)) ?? ''
    console.log(`  obra ${String(obra).padStart(5)}  ${linha.trim()}`)
    postas++
  } else {
    const erro = saida.trim().split('\n').at(-1) ?? 'sem mensagem'
    console.log(`  obra ${String(obra).padStart(5)}  FALHOU: ${erro.slice(0, 90)}`)
    falhas.push({ obra, erro })
  }
}

console.log(`\n${postas} instaladas, ${falhas.length} falharam`)
console.log('\nfalta reindexar a busca — sem isto elas não aparecem em nenhuma procura:')
console.log('  node servidor/reindexar.mjs')
