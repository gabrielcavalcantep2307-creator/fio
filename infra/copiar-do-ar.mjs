// Mantém neste PC uma cópia do que está no ar: o site inteiro e o backup do banco.
//
//   node infra/copiar-do-ar.mjs            # traz só o que mudou
//   node infra/copiar-do-ar.mjs --sem-banco
//
//   site-no-ar/       espelho de /opt/fio/site (o app remendado, as páginas,
//                     os dados do catálogo, capas e quadrinhos)
//   backups-do-ar/    os 3 backups mais recentes do banco (catalogo-*.db.gz)
//
// Por que existe: o app que está no ar só existe lá — o bundle remendado não
// tem fonte neste repositório (ver docs/PROJETO.md). Se a VPS sumir, é daqui
// que o site volta. As duas pastas ficam fora do git (.gitignore): o banco tem
// as contas das pessoas, e nada disso vai para o GitHub.
//
// Incremental: pergunta à VPS a lista de arquivos com tamanho e data, compara
// com o que já está aqui e baixa só a diferença, num tar só. O que sumiu de lá
// some daqui também — é um espelho, não um acúmulo.

import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, statSync, rmSync, utimesSync, createWriteStream, renameSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const MAQUINA = process.env.MAQUINA || 'root@142.93.57.2'
const CHAVE = process.env.CHAVE_SSH || join(homedir(), '.ssh', 'fiolib-deploy')
const SITE_REMOTO = '/opt/fio/site'
const ESPELHO = join(RAIZ, 'site-no-ar')
const BACKUPS = join(RAIZ, 'backups-do-ar')
// cópias de segurança antigas que moram dentro do site e não são o site
const FORA = /^(dados\.antes-|index\.html\.antes|site\.ant)/

const ssh = (cmd, opcoes = {}) => execFileSync('ssh', ['-i', CHAVE, '-o', 'StrictHostKeyChecking=accept-new', MAQUINA, cmd],
  { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...opcoes })

function locais(pasta, base = pasta, mapa = new Map()) {
  if (!existsSync(pasta)) return mapa
  for (const nome of readdirSync(pasta)) {
    const c = join(pasta, nome)
    const s = statSync(c)
    if (s.isDirectory()) locais(c, base, mapa)
    else mapa.set(c.slice(base.length + 1).split('\\').join('/'), { tamanho: s.size, mtime: Math.floor(s.mtimeMs / 1000) })
  }
  return mapa
}

/** Baixa uma lista de arquivos num tar só, lendo a lista pela entrada padrão do lado de lá. */
function baixar(lista, destino) {
  return new Promise((pronto, falhou) => {
    mkdirSync(destino, { recursive: true })
    const remoto = spawn('ssh', ['-i', CHAVE, MAQUINA, `cd ${SITE_REMOTO} && tar cf - -T -`], { stdio: ['pipe', 'pipe', 'inherit'] })
    const local = spawn('tar', ['xf', '-', '-C', destino.split('\\').join('/')], { stdio: ['pipe', 'inherit', 'inherit'] })
    remoto.stdout.pipe(local.stdin)
    remoto.stdin.end(lista.join('\n') + '\n')
    local.on('close', (c) => (c === 0 ? pronto() : falhou(new Error(`tar local saiu com ${c}`))))
    remoto.on('error', falhou); local.on('error', falhou)
  })
}

// ── o site ──
console.log('perguntando à VPS a lista de arquivos…')
const remotos = new Map()
for (const l of ssh(`cd ${SITE_REMOTO} && find . -type f -printf '%P\\t%s\\t%T@\\n'`).split('\n')) {
  const [caminho, tamanho, mtime] = l.split('\t')
  if (!caminho || FORA.test(caminho)) continue
  remotos.set(caminho, { tamanho: Number(tamanho), mtime: Math.floor(Number(mtime)) })
}
const aqui = locais(ESPELHO)
const faltam = [...remotos].filter(([c, r]) => { const a = aqui.get(c); return !a || a.tamanho !== r.tamanho || a.mtime !== r.mtime }).map(([c]) => c)
const sobram = [...aqui.keys()].filter((c) => !remotos.has(c))
const bytes = faltam.reduce((n, c) => n + remotos.get(c).tamanho, 0)
console.log(`site: ${remotos.size} arquivos lá; ${faltam.length} para trazer (${(bytes / 1e6).toFixed(1)} MB), ${sobram.length} para apagar daqui`)

for (let i = 0; i < faltam.length; i += 2000) {
  await baixar(faltam.slice(i, i + 2000), ESPELHO)
  process.stdout.write(`\r  ${Math.min(i + 2000, faltam.length)}/${faltam.length}`)
}
if (faltam.length) console.log()
// a data de lá, para a próxima comparação não trazer tudo de novo
for (const c of faltam) { const m = remotos.get(c).mtime; try { utimesSync(join(ESPELHO, c), m, m) } catch {} }
for (const c of sobram) rmSync(join(ESPELHO, c), { force: true })

// ── o banco: os 3 backups mais recentes ──
if (!process.argv.includes('--sem-banco')) {
  mkdirSync(BACKUPS, { recursive: true })
  const lista = ssh('ls -1t /opt/fio/backups/catalogo-*.db.gz | head -3').trim().split('\n').filter(Boolean)
  for (const r of lista) {
    const nome = r.split('/').at(-1)
    if (existsSync(join(BACKUPS, nome))) continue
    console.log(`banco: trazendo ${nome}…`)
    await new Promise((pronto, falhou) => {
      const p = spawn('ssh', ['-i', CHAVE, MAQUINA, `cat ${r}`], { stdio: ['ignore', 'pipe', 'inherit'] })
      const tmp = join(BACKUPS, `${nome}.parcial`)
      const arquivo = createWriteStream(tmp)
      p.stdout.pipe(arquivo)
      // só renomeia quando o ssh terminou E o arquivo foi todo para o disco
      let codigo = null, gravado = false
      const talvez = () => {
        if (codigo === null || !gravado) return
        if (codigo !== 0) return falhou(new Error(`ssh saiu com ${codigo}`))
        renameSync(tmp, join(BACKUPS, nome))
        pronto()
      }
      p.on('close', (c) => { codigo = c; talvez() })
      arquivo.on('finish', () => { gravado = true; talvez() })
    })
  }
  const manter = new Set(lista.map((r) => r.split('/').at(-1)))
  for (const n of readdirSync(BACKUPS)) if (/^catalogo-.*\.db\.gz$/.test(n) && !manter.has(n)) rmSync(join(BACKUPS, n))
  console.log(`banco: ${[...manter].join(', ')}`)
}
// Avisa o painel (aba Controle) que a cópia rodou: só a hora e os números.
try {
  const marca = JSON.stringify({ quando: new Date().toISOString(), arquivos: faltam.length, mb: Math.round(bytes / 1e6), apagados: sobram.length })
  ssh('mkdir -p /opt/fio/estado && cat > /opt/fio/estado/copia-pc.json.novo && chmod 644 /opt/fio/estado/copia-pc.json.novo && mv /opt/fio/estado/copia-pc.json.novo /opt/fio/estado/copia-pc.json', { input: marca })
} catch (e) { console.error('não consegui avisar o painel:', e.message) }
console.log(`pronto: ${ESPELHO}`)
