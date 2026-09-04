// Junta obras duplicadas.
//
//   node ingestao/limpar-duplicatas.mjs
//
// Duplicata aparece quando a mesma obra chega por dois caminhos: a ingestão
// por autor traz "Rapido e Devagar" (o título como a Open Library tem), a
// curadoria traz "Rápido e devagar" (o título como se diz em português), e o
// casamento por texto exato não vê que são a mesma coisa.
//
// A chave de identidade aqui é (título sem acento e sem pontuação + autor).
// Vence quem tem mais coisa: capa, identificador externo, texto.

import { abrir, fechar } from '../servidor/banco/base.mjs'

const banco = abrir()

const chave = (titulo, autor) =>
  `${titulo}|${autor ?? ''}`
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9|]/g, '')

const obras = banco.prepare(`
  SELECT o.id, o.titulo, o.capa, o.capa_externa, o.olid_work,
         (SELECT p.nome FROM obra_pessoa op JOIN pessoa p ON p.id = op.pessoa_id
           WHERE op.obra_id = o.id AND op.papel = 'autor' LIMIT 1) autor,
         (SELECT COUNT(*) FROM texto t WHERE t.obra_id = o.id AND t.normalizado = 1) tem_texto,
         (SELECT COUNT(*) FROM fragmento f WHERE f.obra_id = o.id) fragmentos
    FROM obra o WHERE o.publicada = 1`).all()

const grupos = new Map()
for (const o of obras) {
  const k = chave(o.titulo.split('\n')[0], o.autor)
  if (!grupos.has(k)) grupos.set(k, [])
  grupos.get(k).push(o)
}

// quanto "peso" a linha tem: quem tem mais fica
const peso = (o) =>
  (o.tem_texto ? 100 : 0) + (o.capa ? 20 : 0) + (o.capa_externa ? 10 : 0)
  + (o.olid_work ? 5 : 0) + Math.min(o.fragmentos, 5)

let juntadas = 0
banco.exec('BEGIN')
for (const [, lista] of grupos) {
  if (lista.length < 2) continue
  const ordenada = [...lista].sort((a, b) => peso(b) - peso(a) || a.id - b.id)
  const fica = ordenada[0]
  for (const some of ordenada.slice(1)) {
    // o que a perdedora tinha e a vencedora não, passa junto
    if (!fica.capa_externa && some.capa_externa) {
      banco.prepare('UPDATE obra SET capa_externa = ? WHERE id = ?').run(some.capa_externa, fica.id)
      fica.capa_externa = some.capa_externa
    }
    if (!fica.olid_work && some.olid_work) {
      // O identificador é único. Solta o da perdedora ANTES de dá-lo à outra
      // — senão as duas linhas o têm por um instante, e o banco recusa.
      banco.prepare('UPDATE obra SET olid_work = NULL WHERE id = ?').run(some.id)
      banco.prepare('UPDATE obra SET olid_work = ? WHERE id = ?').run(some.olid_work, fica.id)
      fica.olid_work = some.olid_work
    }
    // as coleções apontam para a que fica
    banco.prepare('UPDATE OR IGNORE trilha_item SET obra_id = ? WHERE obra_id = ?').run(fica.id, some.id)
    banco.prepare('DELETE FROM trilha_item WHERE obra_id = ?').run(some.id)
    // fragmento e disponibilidade da perdedora só entram se a que fica não tem
    if (!fica.fragmentos) {
      banco.prepare('UPDATE fragmento SET obra_id = ? WHERE obra_id = ?').run(fica.id, some.id)
    }
    banco.prepare(
      `UPDATE disponibilidade SET obra_id = ? WHERE obra_id = ? AND provedor NOT IN
        (SELECT provedor FROM disponibilidade WHERE obra_id = ?)`).run(fica.id, some.id, fica.id)

    banco.prepare('DELETE FROM obra WHERE id = ?').run(some.id)
    banco.prepare('DELETE FROM busca_obra WHERE conteudo_obra_id = ?').run(some.id)
    juntadas++
  }
}
banco.exec('COMMIT')

console.log(`duplicatas juntadas ... ${juntadas}`)
console.log(`obras agora ........... ${banco.prepare('SELECT COUNT(*) n FROM obra WHERE publicada = 1').get().n}`)
fechar()
