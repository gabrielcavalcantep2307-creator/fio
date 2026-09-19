// O contrato das rotas: o que cada endereço da API responde, de fora, pela rede.
//
//   node servidor/contrato-rotas.mjs            # confere contra rotas.contrato.json
//   node servidor/contrato-rotas.mjs --gravar   # grava o retrato atual como o certo
//
// Sobe o servidor de verdade (servidor/api.mjs) numa porta livre, com um banco
// e um site descartáveis, e passa por TODAS as rotas: sem conta, com conta de
// leitor, com conta de admin, sem o cabeçalho x-fio, com origem de fora, com
// corpo grande demais. De cada resposta guarda o que não muda de uma rodada
// para outra — o status, os cabeçalhos que importam e o FORMATO do JSON (as
// chaves e os tipos, nunca os valores, que têm data e id).
//
// Existe para reorganizar o servidor sem mudar o que ele faz: o retrato de
// antes e o de depois têm de ser iguais, rota por rota. E para a segurança:
// uma rota que passa a responder 200 a quem devia levar 401 aparece aqui.

import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:net'

const AQUI = dirname(fileURLToPath(import.meta.url))
const CONTRATO = join(AQUI, 'rotas.contrato.json')
const gravar = process.argv.includes('--gravar')

const pasta = mkdtempSync(join(tmpdir(), 'fio-contrato-'))
const site = join(pasta, 'site')
const BANCO = join(pasta, 'contrato.db')

// ── o site descartável ──
mkdirSync(join(site, 'dados', 'fichas'), { recursive: true })
mkdirSync(join(site, 'quadrinhos', 'serie-teste', '02'), { recursive: true })
mkdirSync(join(site, 'ativos'), { recursive: true })
writeFileSync(join(site, 'index.html'), '<!doctype html><title>Fio</title>')
writeFileSync(join(site, 'ativos', 'app-abc.js'), 'console.log(1)')
writeFileSync(join(site, 'dados', 'catalogo.json'), JSON.stringify({ geradoEm: '2026-09-19', obras: [{ id: 1, titulo: 'Livro de Teste', trilho: 'A', minutos: 10 }], temas: [], autores: [], colecoes: [] }))
writeFileSync(join(site, 'dados', 'fichas', '1.json'), JSON.stringify({ id: 1, titulo: 'Livro de Teste' }))
writeFileSync(join(site, 'dados', 'quadrinhos.json'), JSON.stringify({ series: [{ id: 'serie-teste', titulo: 'Série', capa: '/quadrinhos/serie-teste/capa.jpg', capitulos: [{ id: '01' }, { id: '02', capa: '/quadrinhos/serie-teste/02/001.jpg' }] }] }))
writeFileSync(join(site, 'quadrinhos', 'serie-teste', '02', '002.jpg'), 'jpg')
writeFileSync(join(site, 'quadrinhos', 'serie-teste', '02', '001.jpg'), 'jpg')

// ── o banco descartável: esquema, duas contas e um livro legível ──
process.env.FIO_BANCO = BANCO
process.env.FIO_CONVITE = 'aberto'
const { abrir, fechar } = await import('./banco/base.mjs')
const contas = await import('./contas.mjs')
const { SUGESTOES } = await import('./perguntas.mjs')
const b = abrir(BANCO)
const PERGUNTAS = SUGESTOES.slice(0, 3).map((pergunta, i) => ({ pergunta, resposta: `resposta ${i} bem certa` }))
const SENHA = 'uma senha longa e boa de teste 42'
// A primeira conta de um banco vazio vira admin (contas.criar). A fundadora
// existe só para ocupar esse lugar: as contas do contrato são as de depois.
for (const usuario of ['fundadora', 'leitora', 'dona', 'apagavel']) {
  await contas.criar(b, { usuario, nome: usuario, senha: SENHA, perguntas: PERGUNTAS }, { ip: '127.0.0.1' })
}
b.prepare("UPDATE leitor SET papel = 'admin' WHERE usuario = 'dona'").run()
const pessoa = Number(b.prepare("INSERT INTO pessoa (nome, nome_ordem, morte) VALUES ('Autor Antigo', 'Antigo, Autor', 1900)").run().lastInsertRowid)
b.prepare("INSERT INTO obra (id, titulo, titulo_pt, trilho, publicada) VALUES (1, 'Livro de Teste', 'Livro de Teste', 'A', 1)").run()
b.prepare("INSERT INTO obra_pessoa (obra_id, pessoa_id, papel) VALUES (1, ?, 'autor')").run(pessoa)
const texto = Number(b.prepare("INSERT INTO texto (obra_id, idioma, fonte, formato, normalizado, palavras) VALUES (1, 'pt', 'gutenberg', 'html', 1, 600)").run().lastInsertRowid)
for (const ordem of [1, 2]) {
  b.prepare('INSERT INTO capitulo (texto_id, ordem, titulo, corpo, palavras) VALUES (?,?,?,?,300)').run(texto, ordem, `Capítulo ${ordem}`, `<p>${'palavra '.repeat(300)}</p>`)
}
b.prepare("INSERT INTO direito (texto_id, jurisdicao, estado, motivo, verificado_por, verificado_em) VALUES (?, 'BR', 'dominio_publico', 'teste', 'humano', datetime('now'))").run(texto)
fechar()

// ── o servidor de verdade ──
const porta = await new Promise((ok) => { const s = createServer().listen(0, () => { const p = s.address().port; s.close(() => ok(p)) }) })
const BASE = `http://127.0.0.1:${porta}`
const srv = spawn(process.execPath, [join(AQUI, 'api.mjs')], {
  env: {
    ...process.env, FIO_BANCO: BANCO, FIO_ESTATICO: site, FIO_PORTA: String(porta), FIO_INSEGURO: '1',
    FIO_CONVITE: 'aberto', FIO_SITE: BASE, FIO_ESTEIRA_CHAVE: 'chave-do-contrato-com-mais-de-24-letras',
    GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', FIO_GOOGLE: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let logSrv = ''
srv.stdout.on('data', (d) => { logSrv += d })
srv.stderr.on('data', (d) => { logSrv += d })
for (let i = 0; i < 100; i++) {
  try { if ((await fetch(`${BASE}/api/saude`)).ok) break } catch {}
  await new Promise((r) => setTimeout(r, 100))
}

// ── o retrato de uma resposta ──
function formato(v, fundo = 0) {
  if (v === null) return 'null'
  if (Array.isArray(v)) return v.length ? [formato(v[0], fundo + 1)] : []
  if (typeof v === 'object') {
    if (fundo > 4) return 'objeto'
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, formato(v[k], fundo + 1)]))
  }
  return typeof v
}

const cookies = {}
async function pedir(quem, metodo, caminho, { corpo, bruto, cabecalhos = {}, semFio = false } = {}) {
  const h = { ...cabecalhos }
  if (cookies[quem]) h.cookie = cookies[quem]
  if (metodo === 'POST' && !semFio) h['x-fio'] = '1'
  if (corpo !== undefined) h['content-type'] = 'application/json'
  const r = await fetch(BASE + caminho, {
    method: metodo, headers: h, redirect: 'manual',
    body: bruto ?? (corpo !== undefined ? JSON.stringify(corpo) : undefined),
  })
  const tipo = r.headers.get('content-type') ?? ''
  const texto = await r.text()
  let json = null
  if (tipo.includes('json')) try { json = JSON.parse(texto) } catch {}
  const sc = r.headers.get('set-cookie')
  if (sc && /^fio=([^;]*)/.test(sc)) {
    const valor = sc.match(/^fio=([^;]*)/)[1]
    if (valor) cookies[quem] = `fio=${valor}`
  }
  return {
    status: r.status,
    tipo: tipo.split(';')[0] || null,
    cache: r.headers.get('cache-control'),
    local: r.headers.get('location')?.replace(/state=[^&]+|code_challenge=[^&]+|client_id=[^&]*/g, '…') ?? null,
    cookie: sc ? sc.replace(/=[^;]+/, '=…').replace(/Max-Age=\d+/, 'Max-Age=n') : null,
    corpo: json ? (r.ok ? formato(json) : json) : (r.ok ? `${texto.length > 0 ? 'texto' : 'vazio'}` : texto.slice(0, 80)),
  }
}

const retrato = {}
async function caso(nome, quem, metodo, caminho, opcoes) {
  retrato[`${nome} :: ${quem} ${metodo} ${caminho}`] = await pedir(quem, metodo, caminho, opcoes)
}

// entrar nas três contas
for (const u of ['leitora', 'dona', 'apagavel']) await caso('entrar', u, 'POST', '/api/entrar', { corpo: { usuario: u, senha: SENHA } })
await caso('senha errada', 'anon', 'POST', '/api/entrar', { corpo: { usuario: 'leitora', senha: 'errada' } })

// ── públicas ──
for (const c of ['/api/saude', '/api/sugestoes', '/api/nome-livre?u=leitora', '/api/nome-livre?u=livre_nome', '/api/populares',
  '/api/planos', '/api/novidades', '/api/quadrinhos/vitrine', '/api/google/ligado', '/api/correcoes/resumo?obra=1',
  '/api/publicacoes', '/api/publicacao?id=999', '/api/publicacao/parte?id=999&ordem=1', '/api/procurar?q=palavra',
  '/api/obra/1/avaliacoes', '/api/livro/1', '/api/livro/999', '/api/livro/1/epub', '/api/mangas/abc', '/api/pub-arquivo/nada.jpg',
  '/api/nao-existe', '/api/eu']) {
  await caso('público', 'anon', 'GET', c)
}
await caso('abri sem x-fio', 'anon', 'POST', '/api/abri/1', { semFio: true })
await caso('abri', 'anon', 'POST', '/api/abri/1')
await caso('google entrar', 'anon', 'GET', '/api/google/entrar')
await caso('google volta', 'anon', 'GET', '/api/google/volta?error=access_denied')
await caso('pulso sem chave', 'anon', 'POST', '/api/esteira/pulso', { corpo: { estado: 'traduzindo' } })
await caso('pulso com chave', 'anon', 'POST', '/api/esteira/pulso', { corpo: { estado: 'traduzindo' }, cabecalhos: { 'x-esteira-chave': 'chave-do-contrato-com-mais-de-24-letras' } })

// ── o que exige conta: sem conta tem de dar 401 ──
const DE_CONTA_GET = ['/api/eu', '/api/minhas-perguntas', '/api/meus-aparelhos', '/api/exportar', '/api/meus-livros', '/api/meus-dados',
  '/api/gosto', '/api/recomendacoes', '/api/avisos', '/api/avisos/contagem', '/api/pedidos-traducao', '/api/pedidos-traducao/buscar?q=ab',
  '/api/meta', '/api/quadrinhos/progresso', '/api/google', '/api/minha-conta', '/api/minhas-publicacoes']
for (const c of DE_CONTA_GET) { await caso('conta', 'anon', 'GET', c); await caso('conta', 'leitora', 'GET', c) }

const DE_CONTA_POST = [
  ['/api/meu-nome', { nome: 'Leitora Nova' }], ['/api/meus-dados', { itens: [{ tipo: 'estante', chave: '1', valor: '{}', mudou_em: 1 }] }],
  ['/api/avaliar', { obra: 1, nota: 5, resenha: 'bom' }], ['/api/desavaliar', { obra: 1 }], ['/api/apagar-meu-livro', { obra: 999 }],
  ['/api/gosto', { humores: [] }], ['/api/avisos/lido', {}], ['/api/meta', { livros: 12 }],
  ['/api/quadrinhos/progresso', { serie: 'serie-teste', cap: '01', pag: 1 }], ['/api/publicacao/seguir', { id: 999 }],
  ['/api/pedidos-traducao', { gutenberg: 'x' }], ['/api/correcoes', { obra: 1 }], ['/api/publicacao', { tipo: 'livro', titulo: 'Minha obra' }],
  ['/api/publicacao/apagar', { id: 999 }], ['/api/publicacao/parte', { publicacao: 999, titulo: 't' }], ['/api/publicacao/enviar', { id: 999 }],
  ['/api/publicacao/denunciar', { id: 999, motivo: 'x' }], ['/api/publicacao/partes/ordem', { id: 999, ordem: [] }],
  ['/api/sair-do-aparelho', { id: 999 }], ['/api/meu-email', { email: 'x' }], ['/api/google/senha', { senha: 'x' }], ['/api/google/desligar', {}],
  ['/api/minhas-perguntas', { atual: 'errada', perguntas: PERGUNTAS }], ['/api/minha-senha', { atual: 'errada', nova: 'outra senha longa qualquer 9' }],
  ['/api/sair-dos-outros', {}],
]
for (const [c, corpo] of DE_CONTA_POST) { await caso('conta', 'anon', 'POST', c, { corpo }); await caso('conta', 'leitora', 'POST', c, { corpo }) }

// ── o que é do admin: leitor comum tem de levar o MESMO 404 de rota inexistente ──
const DE_ADMIN_GET = ['/api/painel', '/api/fila', '/api/admin/esteira', '/api/admin/controle', '/api/admin/curadoria', '/api/admin/curadoria/base?tipo=obra',
  '/api/admin/curadoria/ficha?id=1', '/api/admin/correcoes', '/api/admin/assinaturas', '/api/admin/publicacoes', '/api/ajustes']
for (const c of DE_ADMIN_GET) for (const q of ['anon', 'leitora', 'dona']) await caso('admin', q, 'GET', c)
const DE_ADMIN_POST = [
  ['/api/fila', { livros: [{ titulo: 'Um Livro', autor: 'Alguém', gutenberg: 1342, idioma: 'en' }] }], ['/api/fila/remover', { id: 999 }],
  ['/api/fila/retentar', { id: 999 }], ['/api/admin/esteira/pausa', { pausada: false }], ['/api/admin/correcao', { id: 999, decisao: 'aceitar' }],
  ['/api/admin/correcoes/revisado', { obra: 1 }], ['/api/admin/assinatura', { usuario: 'leitora', plano: 'gratis' }],
  ['/api/admin/publicacao', { id: 999, decisao: 'aprovar' }], ['/api/admin/curadoria/obra', { id: 1 }], ['/api/admin/curadoria/serie', { id: 'x' }],
  ['/api/ajustes', { gratis_livros_mes: 3 }], ['/api/convite', { nota: 'teste' }],
]
for (const [c, corpo] of DE_ADMIN_POST) for (const q of ['anon', 'leitora', 'dona']) await caso('admin', q, 'POST', c, { corpo })

// ── CSRF e tamanho: escrita sem x-fio, de outra origem, e corpo gigante ──
await caso('sem x-fio', 'leitora', 'POST', '/api/meu-nome', { corpo: { nome: 'x' }, semFio: true })
await caso('outra origem', 'leitora', 'POST', '/api/meu-nome', { corpo: { nome: 'x' }, cabecalhos: { origin: 'https://mal.example' } })
await caso('outra origem GET', 'leitora', 'GET', '/api/eu', { cabecalhos: { origin: 'https://mal.example' } })
await caso('corpo gigante', 'leitora', 'POST', '/api/meu-nome', { bruto: JSON.stringify({ nome: 'x'.repeat(100_000) }), cabecalhos: { 'content-type': 'application/json' } })
await caso('json quebrado', 'leitora', 'POST', '/api/meu-nome', { bruto: '{isto não é json', cabecalhos: { 'content-type': 'application/json' } })
await caso('método errado', 'leitora', 'DELETE', '/api/eu')
await caso('livro POST', 'leitora', 'POST', '/api/livro/1')

// ── uploads binários ──
for (const [c, q] of [['/api/meu-livro', 'anon'], ['/api/meu-livro', 'leitora'], ['/api/publicacao/imagem?id=999&uso=capa', 'leitora'],
  ['/api/admin/curadoria/capa?tipo=obra&id=1', 'leitora'], ['/api/admin/curadoria/capa?tipo=obra&id=1', 'dona']]) {
  await caso('upload', q, 'POST', c, { bruto: 'não é um arquivo de verdade', cabecalhos: { 'x-arquivo': 'x.epub' } })
  await caso('upload sem x-fio', q, 'POST', c, { bruto: 'x', semFio: true })
  await caso('upload outra origem', q, 'POST', c, { bruto: 'x', cabecalhos: { origin: 'https://mal.example' } })
}

// ── o site estático ──
for (const c of ['/', '/index.html', '/ativos/app-abc.js', '/dados/catalogo.json', '/dados/fichas/1.json', '/../../etc/passwd', '/%2e%2e/%2e%2e/etc/passwd',
  '/obra/1', '/quadrinhos/serie-teste/02/002.jpg', '/quadrinhos/serie-teste/02/001.jpg', '/nao/existe.png', '/%E0%A4%A']) {
  await caso('estático', 'anon', 'GET', c)
}
await caso('estático com conta', 'leitora', 'GET', '/quadrinhos/serie-teste/02/002.jpg')
await caso('estático POST', 'anon', 'POST', '/index.html')

// ── recuperar a conta ──
await caso('perguntas', 'anon', 'POST', '/api/perguntas', { corpo: { usuario: 'leitora' } })
await caso('responder errado', 'anon', 'POST', '/api/responder', { corpo: { usuario: 'leitora', respostas: ['a', 'b', 'c'], senha: 'nova senha longa demais 77' } })

// ── o fim das contas ──
await caso('apagar conta sem confirmar', 'apagavel', 'POST', '/api/apagar-conta', { corpo: {} })
await caso('apagar dados', 'apagavel', 'POST', '/api/apagar-dados', { corpo: {} })
await caso('apagar conta', 'apagavel', 'POST', '/api/apagar-conta', { corpo: { usuario: 'apagavel' } })
await caso('depois de apagar', 'apagavel', 'GET', '/api/eu')
await caso('sair', 'leitora', 'POST', '/api/sair', { corpo: {} })
await caso('depois de sair', 'leitora', 'GET', '/api/eu')

// ── caminho CRU, sem o fetch "arrumar" o ../ antes de mandar ──
const { connect } = await import('node:net')
function cru(caminho) {
  return new Promise((ok) => {
    const s = connect(porta, '127.0.0.1', () => s.write(`GET ${caminho} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`))
    let r = ''
    s.on('data', (d) => { r += d })
    s.on('end', () => {
      const corpo = r.split('\r\n\r\n').slice(1).join('\r\n\r\n')
      ok({ status: Number(r.split(' ')[1]), vazou: /root:|\[boot loader\]|Windows Registry|FIO_|DatabaseSync/.test(corpo) })
    })
    s.on('error', () => ok({ status: 0, vazou: false }))
  })
}
for (const c of ['/../../../../etc/passwd', '/..%2f..%2f..%2fetc%2fpasswd', '/%2e%2e%2f%2e%2e%2fetc%2fpasswd', '/dados/..%5c..%5c..%5cwindows%5cwin.ini',
  '/..\\..\\servidor\\api.mjs', '/%2e%2e/servidor/api.mjs', '/ativos/../../contrato.db', '/api/../../contrato.db']) {
  retrato[`cru :: anon GET ${c}`] = await cru(c)
}

srv.kill('SIGTERM')
await new Promise((r) => setTimeout(r, 300))
rmSync(pasta, { recursive: true, force: true })

const erros500 = Object.entries(retrato).filter(([, r]) => r.status >= 500)
if (gravar) {
  writeFileSync(CONTRATO, JSON.stringify(retrato, null, 1) + '\n')
  console.log(`gravado: ${Object.keys(retrato).length} casos em ${CONTRATO}`)
  if (erros500.length) console.log(`atenção: ${erros500.length} respostas 5xx:`, erros500.map(([k]) => k))
  process.exit(0)
}

if (!existsSync(CONTRATO)) { console.error('sem contrato gravado; rode com --gravar'); process.exit(1) }
const certo = JSON.parse(readFileSync(CONTRATO, 'utf8'))
const diferencas = []
for (const k of new Set([...Object.keys(certo), ...Object.keys(retrato)])) {
  const a = JSON.stringify(certo[k]), d = JSON.stringify(retrato[k])
  if (a !== d) diferencas.push({ caso: k, antes: certo[k], agora: retrato[k] })
}
if (diferencas.length) {
  for (const x of diferencas) console.log(`\n✗ ${x.caso}\n  antes: ${JSON.stringify(x.antes)}\n  agora: ${JSON.stringify(x.agora)}`)
  console.log(`\n${diferencas.length} de ${Object.keys(retrato).length} casos mudaram`)
  if (process.argv.includes('--log')) console.log(logSrv)
  process.exit(1)
}
console.log(`contrato ok: ${Object.keys(retrato).length} casos iguais`)
