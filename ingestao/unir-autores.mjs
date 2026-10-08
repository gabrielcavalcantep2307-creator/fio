// Junta o mesmo autor escrito de jeitos diferentes (08/10/2026).
//
// "Camilo Castelo Branco" (89 livros), "Camillo Castello Branco" (4) e
// "Camillo Castello -Branco" (1) são a mesma pessoa em três páginas de autor;
// "Theóphilo Braga", "Theophilo Braga" e "Téofilo Braga" também. O leitor que
// clica no autor vê três prateleiras, nenhuma inteira.
//
// A chave de identidade é só a grafia: sem acento, minúscula, letra dobrada
// desfeita, ph/th/y, hífen e espaço solto. Dois nomes com a mesma chave são a
// mesma pessoa — a não ser que os anos de nascimento ou morte, quando os dois
// os têm, discordem. Fica quem tem mais obras; os livros dos outros passam
// para ele. Nada é apagado: a pessoa velha continua na tabela, sem obras, e o
// que foi movido vai para um arquivo de desfazer.
//
//   node ingestao/unir-autores.mjs [--gravar]
//   node ingestao/unir-autores.mjs --desfazer /dados/unir-autores-XXXX.json

import { DatabaseSync } from 'node:sqlite'
import { readFileSync, writeFileSync } from 'node:fs'

const banco = new DatabaseSync(process.env.FIO_BANCO || '/dados/catalogo.db')
banco.exec('PRAGMA busy_timeout = 30000')
const gravar = process.argv.includes('--gravar')

if (process.argv.includes('--desfazer')) {
  const mov = JSON.parse(readFileSync(process.argv[process.argv.indexOf('--desfazer') + 1], 'utf8')).movidos
  banco.exec('BEGIN')
  for (const m of mov) {
    banco.prepare('DELETE FROM obra_pessoa WHERE obra_id = ? AND pessoa_id = ? AND papel = ?').run(m.obra, m.para, m.papel)
    banco.prepare('INSERT OR IGNORE INTO obra_pessoa (obra_id, pessoa_id, papel) VALUES (?, ?, ?)').run(m.obra, m.de, m.papel)
  }
  banco.exec('COMMIT')
  console.log('desfeito:', mov.length, 'ligações'); process.exit(0)
}

const SEM = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
const chave = (n) => SEM(n).toLowerCase().replace(/[^a-z ]/g, ' ').replace(/([bcdfglmnprt])\1/g, '$1')
  .replace(/ph/g, 'f').replace(/th/g, 't').replace(/y/g, 'i').replace(/\s+/g, ' ').trim()

const pessoas = banco.prepare(`SELECT p.id, p.nome, p.nascimento, p.morte,
    (SELECT COUNT(*) FROM obra_pessoa op JOIN obra o ON o.id = op.obra_id WHERE op.pessoa_id = p.id AND o.publicada = 1) obras
  FROM pessoa p`).all().filter((p) => p.obras > 0)
const grupos = new Map()
for (const p of pessoas) {
  // o nome com o caractere de substituição (�) casa pelas letras que sobraram
  const k = chave(p.nome)
  if (!grupos.has(k)) grupos.set(k, [])
  grupos.get(k).push(p)
}
// "E�ca de Queir�os" (o ç quebrado numa importação): a chave não casa, então vai por par fixo
for (const [dupId, ficaId] of [[1422, 8]]) {
  const d = pessoas.find((p) => p.id === dupId), f = pessoas.find((p) => p.id === ficaId)
  if (d && f && d.nome.includes('�') && /^E.a de Queir/.test(f.nome.replace('ç', 'c').replace(/^E.a/, 'Eca'))) grupos.get(chave(f.nome)).push(d)
}

const movidos = []
let juntas = 0
banco.exec('BEGIN')
for (const lista of grupos.values()) {
  if (lista.length < 2) continue
  // fica o nome mais de hoje: sem ll/tt/ph/th/y, com os acentos que os outros perderam; depois, quem tem mais obras
  const PREFERIDOS = new Set(['Raul Pompeia', 'Tomás Antônio Gonzaga'])
  const nota = (n) => (PREFERIDOS.has(n) ? 20 : 0) + (/ll|tt|ph|th|y/i.test(n) ? -2 : 0) + (/[áéíóúâêôãõç]/.test(n) ? 1 : 0) - (n.includes('�') ? 9 : 0)
  const ord = [...lista].sort((a, b) => nota(b.nome) - nota(a.nome) || b.obras - a.obras || a.id - b.id)
  const fica = ord[0]
  for (const dup of ord.slice(1)) {
    const conflito = (a, b) => a != null && b != null && a !== b
    if (conflito(fica.nascimento, dup.nascimento) || conflito(fica.morte, dup.morte)) { console.log(`  não junto (anos diferentes): ${dup.nome} / ${fica.nome}`); continue }
    console.log(`${dup.nome} (#${dup.id}, ${dup.obras}) -> ${fica.nome} (#${fica.id}, ${fica.obras})`)
    for (const l of banco.prepare('SELECT obra_id, papel FROM obra_pessoa WHERE pessoa_id = ?').all(dup.id)) {
      movidos.push({ obra: l.obra_id, de: dup.id, para: fica.id, papel: l.papel })
      if (gravar) {
        banco.prepare('INSERT OR IGNORE INTO obra_pessoa (obra_id, pessoa_id, papel) VALUES (?, ?, ?)').run(l.obra_id, fica.id, l.papel)
        banco.prepare('DELETE FROM obra_pessoa WHERE obra_id = ? AND pessoa_id = ? AND papel = ?').run(l.obra_id, dup.id, l.papel)
      }
    }
    juntas++
  }
}
// o nome de gente que o próprio autor assinava com y: hoje se escreve com i
const RENOMEAR = { 'Ruy Barbosa': 'Rui Barbosa' }
for (const [de, para] of Object.entries(RENOMEAR)) {
  const r = banco.prepare('SELECT id FROM pessoa WHERE nome = ?').get(de)
  if (r) { console.log(`renomear: ${de} -> ${para}`); if (gravar) banco.prepare('UPDATE pessoa SET nome = ? WHERE id = ?').run(para, r.id) }
}
if (gravar) { banco.exec('COMMIT'); const f = `/dados/unir-autores-${Date.now()}.json`; writeFileSync(f, JSON.stringify({ movidos })); console.log('desfazer:', f) } else banco.exec('ROLLBACK')
console.log({ pessoasJuntadas: juntas, ligacoesMovidas: movidos.length, gravado: gravar })
