// A estante particular: mandar, listar, ler, tirar.
//
// Sem framework, porque não precisa e porque esta página tem que continuar
// funcionando no dia em que o resto do site for reescrito.

// a conversa com a API é a de todas as páginas (/fio-api.js)
const api = (caminho, corpo, opcoes) => fioApi.pedir(caminho, corpo, opcoes)

const $ = (id) => document.getElementById(id)
const mostrar = (id, sim) => { $(id).hidden = !sim }

function recado(texto, ruim = false) {
  const p = $('recado')
  p.textContent = texto
  p.className = ruim ? 'recado ruim' : 'recado'
  p.hidden = !texto
}

// ── a estante ────────────────────────────────────────────────

let livros = []

async function carregar() {
  const { livros: lista } = await api('/meus-livros')
  livros = lista
  const ul = $('lista')
  ul.replaceChildren()

  if (!livros.length) {
    const vazio = document.createElement('li')
    vazio.className = 'vazio'
    vazio.textContent = 'Nada aqui ainda. Mande um EPUB acima.'
    ul.append(vazio)
  }

  for (const l of livros) {
    const li = document.createElement('li')

    const abrir = document.createElement('button')
    abrir.type = 'button'
    abrir.className = 'abrir'
    abrir.addEventListener('click', () => ler(l.id))

    const t = document.createElement('strong')
    t.textContent = l.titulo
    const d = document.createElement('span')
    d.className = 'detalhe'
    d.textContent = [
      l.autor,
      `${l.capitulos} capítulos`,
      `${(l.palavras ?? 0).toLocaleString('pt-BR')} palavras`,
      l.minutos ? `~${Math.round(l.minutos / 60)} h de leitura` : null,
    ].filter(Boolean).join(' · ')
    abrir.append(t, d)

    const tirar = document.createElement('button')
    tirar.type = 'button'
    tirar.className = 'tirar'
    tirar.textContent = 'tirar'
    tirar.addEventListener('click', async () => {
      // Apagar é o único passo sem volta desta página.
      if (!confirm(`Tirar "${l.titulo}" da estante? Some o texto e o que você marcou nele.`)) return
      await api('/apagar-meu-livro', { obra: l.id })
      await carregar()
    })

    li.append(abrir, tirar)
    ul.append(li)
  }
}

// ── mandar ───────────────────────────────────────────────────

async function mandar(arquivo) {
  if (!arquivo) return
  if (!/\.epub$/i.test(arquivo.name)) {
    return recado('Por enquanto só EPUB. PDF não tem texto separado por capítulo.', true)
  }
  recado(`Lendo ${arquivo.name}…`)
  try {
    // o nome vai no cabeçalho porque o corpo é o arquivo cru
    const r = await api('/meu-livro', null, {
      bruto: arquivo,
      cabecalhos: { 'content-type': 'application/epub+zip', 'x-arquivo': encodeURIComponent(arquivo.name) },
    })
    recado(r.repetido
      ? 'Esse livro já estava na sua estante.'
      : `Pronto: ${r.titulo} — ${r.capitulos} capítulos.`)
    await carregar()
  } catch (e) {
    recado(e.message, true)
  }
}

$('arquivo').addEventListener('change', (e) => mandar(e.target.files[0]))

for (const evento of ['dragover', 'drop']) {
  document.addEventListener(evento, (e) => {
    e.preventDefault()
    document.body.classList.toggle('arrastando', evento === 'dragover')
    if (evento === 'drop') mandar(e.dataTransfer.files[0])
  })
}
document.addEventListener('dragleave', () => document.body.classList.remove('arrastando'))

// ── ler ──────────────────────────────────────────────────────

let aberto = null
let capitulo = 0

async function ler(obraId) {
  aberto = await api(`/livro/${obraId}`)
  capitulo = Number(localStorage.getItem(`fio-c-${obraId}`) ?? 0)
  if (capitulo >= aberto.capitulos.length) capitulo = 0
  mostrar('estante', false)
  mostrar('mandar', false)
  mostrar('leitor', true)
  pintar()
}

function pintar() {
  const c = aberto.capitulos[capitulo]
  $('ondeEstou').textContent = `${c.titulo ?? `Capítulo ${capitulo + 1}`} · ${capitulo + 1} de ${aberto.capitulos.length}`

  // O corpo já foi saneado no servidor, com o mesmo filtro da ingestão, antes
  // de entrar no banco. Aqui ele só é pintado.
  $('texto').innerHTML = c.corpo
  $('antes').disabled = capitulo === 0
  $('depois').disabled = capitulo === aberto.capitulos.length - 1
  localStorage.setItem(`fio-c-${aberto.id}`, String(capitulo))
  window.scrollTo(0, 0)
}

$('antes').addEventListener('click', () => { capitulo--; pintar() })
$('depois').addEventListener('click', () => { capitulo++; pintar() })
$('fechar').addEventListener('click', () => {
  aberto = null
  mostrar('leitor', false)
  mostrar('estante', true)
  mostrar('mandar', true)
})

document.addEventListener('keydown', (e) => {
  if (!aberto) return
  if (e.key === 'ArrowLeft' && capitulo > 0) { capitulo--; pintar() }
  if (e.key === 'ArrowRight' && capitulo < aberto.capitulos.length - 1) { capitulo++; pintar() }
})

// ── começo ───────────────────────────────────────────────────

try {
  if (!(await fioApi.eu())) throw new Error('sem conta')
  mostrar('mandar', true)
  mostrar('estante', true)
  await carregar()
} catch {
  mostrar('entrar', true)
}
