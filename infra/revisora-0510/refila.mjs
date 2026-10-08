// 05/10/2026, pedido do dono: a revisora em "propor", passando de novo por
// TODOS os livros traduzidos por nós — nada é gravado no texto, só a proposta
// (revisao_troca, estado 'proposta'), para ser conferida antes.
// Roda DENTRO do infra-fio-1 (infra/revisora-0510.sh).
import { DatabaseSync } from 'node:sqlite'

const db = new DatabaseSync('/dados/catalogo.db')
db.exec('PRAGMA busy_timeout=10000')
db.exec('BEGIN')
const n = db.prepare(`UPDATE revisao_livro SET estado = 'espera'`).run().changes
db.prepare(`INSERT INTO ajuste (chave, valor) VALUES ('revisora', 'propor')
  ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`).run()
db.exec('COMMIT')
console.log(`${n} livros de volta à fila; revisora em "propor" (os livros novos entram sozinhos)`)
