// Arruma os nomes de autor que já estão no banco (servidor/nomes.mjs).
//
//   node ingestao/arrumar-nomes.mjs            # só mostra o que mudaria
//   node ingestao/arrumar-nomes.mjs --aplicar  # muda
//
// Na VPS, dentro do container (o banco é do volume):
//   docker compose -f /opt/fio/infra/docker-compose.yml exec -T fio node ingestao/arrumar-nomes.mjs --aplicar
//
// Quando o nome limpo já existe em outra pessoa ("G. K. Chesterton" e
// "G. K. (Gilbert Keith) Chesterton"), as duas viram uma: as obras passam
// para a que fica e a outra sai. O catálogo do site é refeito pela esteira
// na próxima publicação inteira (ao subir, e de 6 em 6 horas).

import { abrir } from '../servidor/banco/base.mjs'
import { limparNome } from '../servidor/nomes.mjs'

const aplicar = process.argv.includes('--aplicar')
const banco = abrir()
banco.exec('PRAGMA busy_timeout = 30000')

// a ordem alfabética ("Haggard, H. Rider (Henry Rider)") perde os mesmos parênteses
const limparOrdem = (o) => String(o ?? '')
  .replace(/\s*\(página não existe\)/gi, '')
  .replace(/\s*\((translator|tradutor|editor|ed\.)\)/gi, '')
  .replace(/^(.*?\b[A-ZÀ-Ý]\.[^(]*?)\s*\([^)]*\)/u, '$1')
  .replace(/\s+/g, ' ').trim()

const pessoas = banco.prepare('SELECT id, nome, nome_ordem, morte FROM pessoa').all()
const porNome = new Map(pessoas.map((p) => [p.nome, p]))
const mudancas = []
for (const p of pessoas) {
  const novo = limparNome(p.nome)
  if (!novo || novo === p.nome) continue
  const outra = porNome.get(novo)
  mudancas.push({ p, novo, juntarCom: outra && outra.id !== p.id ? outra : null })
}

for (const m of mudancas) console.log(`${m.juntarCom ? 'JUNTA' : 'nome '}  ${m.p.id}  "${m.p.nome}"  →  "${m.novo}"${m.juntarCom ? `  (com ${m.juntarCom.id})` : ''}`)
console.log(`\n${mudancas.length} nome(s)${aplicar ? '' : ' — nada mudou; rode com --aplicar'}`)
if (!aplicar || !mudancas.length) process.exit(0)

const renomear = banco.prepare('UPDATE pessoa SET nome = ?, nome_ordem = ? WHERE id = ?')
const moverObras = banco.prepare('UPDATE OR IGNORE obra_pessoa SET pessoa_id = ? WHERE pessoa_id = ?')
const moverTradutor = banco.prepare('UPDATE texto SET tradutor_id = ? WHERE tradutor_id = ?')
const morte = banco.prepare('UPDATE pessoa SET morte = COALESCE(morte, ?) WHERE id = ?')
const apagar = banco.prepare('DELETE FROM pessoa WHERE id = ?')
banco.exec('BEGIN')
try {
  for (const { p, novo, juntarCom } of mudancas) {
    if (juntarCom) {
      moverObras.run(juntarCom.id, p.id)
      moverTradutor.run(juntarCom.id, p.id)
      if (p.morte) morte.run(p.morte, juntarCom.id)
      apagar.run(p.id) // o que sobrou em obra_pessoa (repetido) sai em cascata
    } else {
      const ordem = p.nome_ordem && p.nome_ordem !== p.nome ? limparOrdem(p.nome_ordem) : novo
      renomear.run(novo, ordem || novo, p.id)
    }
  }
  banco.exec('COMMIT')
  console.log('aplicado')
} catch (e) { banco.exec('ROLLBACK'); throw e }
