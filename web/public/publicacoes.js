// Comunidade: o que quem tem conta escreveu e desenhou, depois da revisão.
//
//   /publicacoes.html                 a vitrine, com filtros (espelhados na URL)
//   /publicacoes.html?id=12           a ficha da obra
//   /publicacoes.html?id=12&cap=3     o capítulo, no leitor
//
// Texto de capítulo entra por nó de texto, parágrafo a parágrafo; imagem só
// pelo caminho /api/pub-arquivo/, que confere permissão no servidor.

cabecalho('comunidade')
const main = document.getElementById('main')
const url = new URLSearchParams(location.search)

// ─────────────────────────────────────────────────────────────
// vitrine
// ─────────────────────────────────────────────────────────────

const filtros = {
  q: url.get('q') ?? '', tipo: url.get('tipo') ?? '', formato: url.get('formato') ?? '', genero: url.get('genero') ?? '',
  cor: url.get('cor') ?? '', status: url.get('status') ?? '', classificacao: url.get('classificacao') ?? '', ordem: url.get('ordem') ?? 'recentes',
}
let obras = [], proxima = 1, carregando = false, pedido = 0, erro = null, opcoes = null
let area, painel

const consulta = (pagina) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(filtros)) if (v && !(k === 'ordem' && v === 'recentes')) p.set(k, v)
  if (pagina > 1) p.set('pagina', String(pagina))
  return p
}

function cartao(o) {
  return el('a', { class: 'card', href: `/publicacoes.html?id=${o.id}` },
    el('div', { class: 'cap' },
      o.capa?.startsWith('/api/pub-arquivo/') ? el('img', { src: o.capa, alt: `Capa de ${o.titulo}`, loading: 'lazy' }) : null,
      el('div', { class: 'selos-c' }, el('span', {}, o.formatoNome), o.cor === 'colorido' ? el('span', {}, 'colorido') : null,
        o.classificacao !== 'livre' ? el('span', {}, `${o.classificacao}+`) : null)),
    el('div', { class: 't' }, o.titulo),
    el('div', { class: 'g' }, `@${o.autor.usuario} · ${o.partes} cap.`))
}

async function buscar(recomecar) {
  if (recomecar) { obras = []; proxima = 1 }
  if (!proxima) return
  const meu = ++pedido
  carregando = true
  const q = consulta(1)
  history.replaceState(null, '', `/publicacoes.html${q.toString() ? '?' + q : ''}`)
  desenharLista()
  try {
    const r = await pedir(`/publicacoes?${consulta(proxima)}`)
    if (meu !== pedido) return
    opcoes ??= r.opcoes
    obras.push(...r.obras); proxima = r.proximaPagina; erro = null
    if (!painel) montarVitrine()
  } catch (e) {
    if (meu === pedido) erro = e.message
    if (!painel) por(main, el('h1', {}, 'Comunidade'), recado('ruim', `Não consegui abrir: ${e.message}`))
  }
  finally { if (meu === pedido) { carregando = false; desenharLista() } }
}

function desenharLista() {
  if (!area) return
  por(area, 
    obras.length ? el('div', { class: 'grade' }, obras.map(cartao)) : null,
    carregando ? el('p', { class: 'estado-m' }, 'procurando…') : null,
    !carregando && erro ? el('p', { class: 'estado-m' }, erro) : null,
    !carregando && !erro && !obras.length ? el('div', { class: 'estado-m' },
      el('p', {}, Object.entries(filtros).some(([k, v]) => v && k !== 'ordem') ? 'Nada com esses filtros. Tente tirar algum.' : 'Ainda não há obras publicadas pela comunidade.'),
      el('a', { class: 'botao fraco', href: '/publicar.html' }, 'Publicar a sua')) : null,
    !carregando && proxima && obras.length ? el('button', { class: 'filtro mais', onclick: () => buscar(false) }, 'Carregar mais') : null)
}

// Grupo de botões que se lembra de qual está marcado — o defeito da página de
// quadrinhos (16/09) era justamente o botão não acompanhar o filtro.
function chips(rotulo, chave, lista) {
  const botoes = lista.map(([valor, nome]) => el('button', {
    class: 'filtro', type: 'button', 'aria-pressed': String(filtros[chave] === valor),
    onclick: () => {
      filtros[chave] = valor
      for (const b of botoes) b.setAttribute('aria-pressed', String(b._valor === valor))
      // formato e cor dependem do tipo: trocar de tipo não pode deixar um filtro escondido valendo
      if (chave === 'tipo') { filtros.formato = ''; if (valor !== 'quadrinho') filtros.cor = ''; montarVitrine() }
      buscar(true)
    },
  }, nome))
  botoes.forEach((b, i) => { b._valor = lista[i][0] })
  return el('div', { class: 'linha-filtro' }, el('span', { class: 'rot' }, rotulo), botoes)
}

function seletor(chave, rotulo, lista) {
  const s = el('select', { 'aria-label': rotulo, onchange: (e) => { filtros[chave] = e.target.value; buscar(true) } },
    lista.map(([v, r]) => { const o = el('option', { value: v }, r); if (filtros[chave] === v) o.selected = true; return o }))
  return s
}

function montarVitrine() {
  const o = opcoes
  if (!o) { por(main, el('p', { class: 'sub' }, 'abrindo…')); return }
  let espera
  const busca = el('input', { class: 'busca', type: 'search', placeholder: 'Buscar por título, sinopse ou @autor', value: filtros.q, 'aria-label': 'Buscar' })
  busca.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(() => { filtros.q = busca.value.trim(); buscar(true) }, 400) })
  const formatos = filtros.tipo ? Object.entries(o.formatos[filtros.tipo]) : [...Object.entries(o.formatos.livro), ...Object.entries(o.formatos.quadrinho)]
  painel = el('div', { class: 'painel-filtros' },
    el('div', { class: 'linha-filtro' }, busca),
    chips('Tipo', 'tipo', [['', 'Tudo'], ['livro', 'Livros'], ['quadrinho', 'Quadrinhos']]),
    filtros.tipo === 'quadrinho' ? chips('Cor', 'cor', [['', 'Todos'], ['colorido', 'Colorido'], ['pb', 'Preto e branco']]) : null,
    el('div', { class: 'linha-filtro' }, el('span', { class: 'rot' }, 'Mais'),
      seletor('formato', 'Formato', [['', 'Todo formato'], ...formatos]),
      seletor('genero', 'Gênero', [['', 'Todo gênero'], ...Object.entries(o.generos).sort((a, b) => a[1].localeCompare(b[1], 'pt'))]),
      seletor('status', 'Situação', [['', 'Qualquer situação'], ['andamento', 'Em andamento'], ['completa', 'Completa'], ['hiato', 'Em hiato']]),
      seletor('classificacao', 'Classificação', [['', 'Qualquer idade'], ['livre', 'Só livre'], ['12', 'Até 12+'], ['14', 'Até 14+'], ['16', 'Até 16+']]),
      seletor('ordem', 'Ordem', [['recentes', 'Atualizadas agora'], ['populares', 'Mais lidas'], ['novas', 'Publicadas agora'], ['az', 'A–Z']])))
  area ??= el('div', {})
  por(main, 
    el('h1', {}, 'Comunidade'),
    el('p', { class: 'sub' }, 'Livros, mangás, manhwas e HQs publicados por quem escreve e desenha aqui. Tudo passa pela revisão do Fio antes de aparecer.'),
    painel, area,
    el('p', { class: 'rodape' }, 'Viu alguma obra que não é de quem publicou? Abra a obra e use “denunciar”. Obras com denúncias saem do ar até a revisão.'))
  desenharLista()
}

// ─────────────────────────────────────────────────────────────
// ficha
// ─────────────────────────────────────────────────────────────

const dataCurta = (s) => s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleDateString('pt-BR') : ''

async function mostrarFicha(id) {
  let o
  try { o = await pedir(`/publicacao?id=${encodeURIComponent(id)}`) }
  catch (e) { por(main, el('p', {}, el('a', { href: '/publicacoes.html' }, '← comunidade')), recado('ruim', e.message)); return }
  document.title = `${o.titulo} — Fio`
  const pessoa = await eu()
  const primeiro = o.partes.find((p) => o.souDono || p.publicadaEm)
  por(main, 
    el('p', {}, el('a', { href: '/publicacoes.html', style: 'font-size:13px;color:var(--tinta2);text-decoration:none' }, '← comunidade')),
    o.souDono && o.estado !== 'publicada' ? recado(o.estado === 'recusada' || o.estado === 'suspensa' ? 'ruim' : 'bom',
      `Só você e a administração veem esta página: a obra está ${({ rascunho: 'em rascunho', revisao: 'em revisão', recusada: 'recusada', suspensa: 'suspensa' })[o.estado]}.${o.motivo ? ` Motivo: ${o.motivo}` : ''}`) : null,
    el('div', { class: 'topo' },
      o.capa ? el('img', { src: o.capa, alt: `Capa de ${o.titulo}` }) : el('div', { class: 'vazia-capa' }, 'sem capa'),
      el('div', {},
        el('h1', {}, o.titulo),
        el('div', { class: 'aut' }, `por ${o.autor.nome} (@${o.autor.usuario})`),
        el('div', { class: 'selos' },
          el('span', { class: 'selo' }, o.formatoNome),
          o.cor ? el('span', { class: 'selo' }, o.cor === 'pb' ? 'preto e branco' : 'colorido') : null,
          o.tipo === 'quadrinho' ? el('span', { class: 'selo' }, o.sentido === 'rtl' ? 'lê-se ←' : 'lê-se →') : null,
          el('span', { class: 'selo' }, o.classificacao === 'livre' ? 'livre' : `${o.classificacao}+`),
          el('span', { class: 'selo' }, ({ andamento: 'em andamento', completa: 'completa', hiato: 'em hiato' })[o.status]),
          o.generos.map((g) => el('a', { class: 'selo', href: `/publicacoes.html?genero=${g.chave}`, style: 'text-decoration:none' }, g.nome))),
        el('p', { class: 'sinopse' }, o.sinopse),
        el('p', {},
          primeiro ? el('a', { class: 'botao', href: `/publicacoes.html?id=${o.id}&cap=${primeiro.ordem}` }, o.tipo === 'livro' ? 'Começar a ler' : 'Ler o capítulo 1') : null, ' ',
          o.souDono ? el('a', { class: 'botao fraco', href: `/publicar.html?obra=${o.id}` }, 'Editar') : null),
        el('div', { class: 'aut' }, `${o.leituras.toLocaleString('pt-BR')} ${o.leituras === 1 ? 'leitura' : 'leituras'} · atualizada em ${dataCurta(o.atualizadaEm)}`))),
    el('h2', {}, o.tipo === 'livro' ? 'Capítulos' : 'Capítulos'),
    o.partes.length ? el('ul', { class: 'caps' }, o.partes.map((p) => el('li', {},
      el('a', { href: `/publicacoes.html?id=${o.id}&cap=${p.ordem}` },
        el('span', { class: 'n' }, String(p.ordem)), el('span', {}, p.titulo),
        o.souDono && p.estado !== 'publicada' ? el('span', { class: `selo ${p.estado === 'recusada' ? 'ruim' : 'ouro'}` }, p.estado) : null,
        el('span', { class: 'd' }, o.tipo === 'livro' ? `${Math.max(1, Math.round(p.palavras / 230))} min` : `${p.paginas} pág.`))))) : el('p', { class: 'sub' }, 'Nenhum capítulo publicado ainda.'),
    !o.souDono ? caixaDenuncia(o, pessoa) : null)
}

function caixaDenuncia(o, pessoa) {
  if (!pessoa) return el('p', { class: 'denuncia aut' }, 'Algo errado com esta obra? ', el('a', { href: '/#/entrar' }, 'Entre'), ' para denunciar.')
  const motivo = el('select', {}, Object.entries(o.motivos ?? opcoesPadrao()).map(([k, v]) => el('option', { value: k }, v)))
  const detalhe = el('textarea', { placeholder: 'Conte o que viu (opcional). Se é obra sua publicada por outra pessoa, diga onde está o original.', maxlength: '1000', style: 'min-height:80px' })
  const saida = el('div')
  return el('details', { class: 'denuncia' }, el('summary', {}, 'denunciar esta obra'),
    el('div', { class: 'caixa', style: 'margin-top:10px;max-width:520px' },
      el('label', { class: 'campo' }, el('span', {}, 'Motivo'), motivo),
      el('label', { class: 'campo' }, el('span', {}, 'Detalhes'), detalhe),
      el('button', { class: 'botao', onclick: async (e) => {
        e.target.disabled = true
        try { await pedir('/publicacao/denunciar', { id: o.id, motivo: motivo.value, detalhe: detalhe.value }); por(saida, recado('bom', 'Recebido. A administração vai olhar.')) }
        catch (x) { e.target.disabled = false; por(saida, recado('ruim', x.message)) }
      } }, 'Enviar denúncia'), saida))
}
const opcoesPadrao = () => ({ direitos: 'Não é do autor (direitos autorais)', sexual: 'Conteúdo sexual', odio: 'Ódio ou assédio', violencia: 'Violência extrema', menor: 'Classificação errada', spam: 'Spam ou propaganda', outro: 'Outro' })

// ─────────────────────────────────────────────────────────────
// leitor
// ─────────────────────────────────────────────────────────────

async function mostrarCapitulo(id, cap) {
  let r
  try { r = await pedir(`/publicacao/parte?id=${encodeURIComponent(id)}&ordem=${encodeURIComponent(cap)}`) }
  catch (e) { por(main, el('p', {}, el('a', { href: `/publicacoes.html?id=${encodeURIComponent(id)}` }, '← voltar à obra')), recado('ruim', e.message)); return }
  document.title = `${r.parte.titulo} · ${r.obra.titulo} — Fio`
  const ir = (n) => `/publicacoes.html?id=${r.obra.id}&cap=${n}`
  const nav = () => el('div', { class: 'navcap' },
    r.anterior ? el('a', { class: 'botao fraco', href: ir(r.anterior) }, '← anterior') : el('span'),
    el('a', { class: 'botao fraco', href: `/publicacoes.html?id=${r.obra.id}` }, 'capítulos'),
    r.proxima ? el('a', { class: 'botao', href: ir(r.proxima) }, 'próximo →') : el('span'))

  let corpo
  if (r.texto != null) {
    corpo = el('article', { class: 'texto' }, el('h2', {}, r.parte.titulo),
      r.texto.split(/\n\s*\n|\n/).map((t) => t.trim()).filter(Boolean).map((t) => el('p', {}, t)))
  } else {
    corpo = el('div', { class: 'paginas' }, r.paginas.filter((u) => u.startsWith('/api/pub-arquivo/'))
      .map((u, i) => el('img', { src: u, alt: `Página ${i + 1}`, loading: i < 3 ? 'eager' : 'lazy', decoding: 'async' })))
  }
  por(main, 
    el('div', { class: 'leitor-topo' },
      el('a', { href: `/publicacoes.html?id=${r.obra.id}`, style: 'color:var(--tinta2);text-decoration:none;font-size:13px' }, `← ${r.obra.titulo}`),
      el('span', { class: 't' }, `${r.parte.ordem}. ${r.parte.titulo}`),
      r.parte.estado && r.parte.estado !== 'publicada' ? el('span', { class: 'selo ouro' }, r.parte.estado) : null),
    corpo, nav())
  document.addEventListener('keydown', (e) => {
    if (e.target.closest?.('input,textarea,select')) return
    if (e.key === 'ArrowRight' && r.proxima) location.href = ir(r.proxima)
    if (e.key === 'ArrowLeft' && r.anterior) location.href = ir(r.anterior)
  })
  scrollTo(0, 0)
}

// ─────────────────────────────────────────────────────────────

if (url.get('id') && url.get('cap')) mostrarCapitulo(url.get('id'), url.get('cap'))
else if (url.get('id')) mostrarFicha(url.get('id'))
else buscar(true)
