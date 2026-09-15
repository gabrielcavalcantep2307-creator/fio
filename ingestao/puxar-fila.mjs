// Puxa a fila do painel para a esteira local.
//
//   node ingestao/puxar-fila.mjs
//
// O dono adiciona livros no painel (na web); eles ficam numa tabela do banco,
// na VPS. Este script, na máquina do dono, vai buscá-los por SSH, transforma
// cada um numa obra de verdade (via `fila-do-painel.mjs`, do lado de lá) e
// junta as linhas ao `dados/traducoes/esteira.json`. Depois disso, a esteira
// os traduz como qualquer outro.
//
// Por SSH, e não por HTTP: a máquina do dono já tem a chave da VPS, e assim
// não é preciso guardar a senha do painel em lugar nenhum aqui.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const PLANO = join(RAIZ, 'dados', 'traducoes', 'esteira.json')
const arg = (n, p) => { const i = process.argv.indexOf(`--${n}`); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : p }

const MAQUINA = process.env.MAQUINA || 'root@142.93.57.2'
const CHAVE = process.env.CHAVE_SSH || join(homedir(), '.ssh', 'picord-deploy')
const CONTAINER = 'infra-fio-1'

const ssh = (cmd) => execFileSync('ssh', ['-i', CHAVE, '-o', 'StrictHostKeyChecking=accept-new', MAQUINA, cmd],
  { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })

console.log('levando a ponte para o servidor…')
// manda o script da ponte para dentro do container e roda contra o banco.
// A pasta /app/ingestao some a cada redeploy do servidor (a imagem só traz
// /app/servidor), então garante que ela existe antes de copiar.
execFileSync('scp', ['-i', CHAVE, join(RAIZ, 'ingestao', 'fila-do-painel.mjs'), `${MAQUINA}:/tmp/fila-do-painel.mjs`], { stdio: 'ignore' })
ssh(`docker exec --user root ${CONTAINER} mkdir -p /app/ingestao && docker cp /tmp/fila-do-painel.mjs ${CONTAINER}:/app/ingestao/fila-do-painel.mjs && docker exec --user root ${CONTAINER} chown -R 1717:1717 /app/ingestao`)

console.log('perguntando a fila…')
const saida = ssh(`docker exec ${CONTAINER} node /app/ingestao/fila-do-painel.mjs --banco /dados/catalogo.db 2>/dev/null`)
const linha = saida.split('\n')
const i = linha.indexOf('===PLANO===')
if (i < 0) { console.error('não achei o plano na resposta do servidor'); process.exit(1) }
const novos = JSON.parse(linha[i + 1])

if (!novos.length) { console.log('nada novo na fila do painel.'); process.exit(0) }

const j = existsSync(PLANO) ? JSON.parse(readFileSync(PLANO, 'utf8')) : { plano: [] }
const tem = new Set(j.plano.map((o) => o.saida))
let add = 0
for (const n of novos) if (n.saida && !tem.has(n.saida)) { j.plano.push(n); tem.add(n.saida); add++ }
writeFileSync(PLANO, JSON.stringify(j, null, 1), 'utf8')

console.log(`${add} livro(s) do painel entraram na fila. total agora: ${j.plano.length}`)
console.log('a esteira os traduz na próxima rodada (ou relance-a).')
