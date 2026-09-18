// O estúdio: onde se escreve e se desenha para publicar no Fio.
//
//   /publicar.html                 suas obras, uso do plano, nova obra
//   /publicar.html?obra=12         o estúdio da obra: capítulos | dados | capa
//   /publicar.html?nova=livro      nova obra (livro ou quadrinho)
//
// O que o estúdio faz, e onde cada coisa confere:
//   - capítulos em lista lateral, arrastar para reordenar (servidor confere
//     que a lista é a mesma e grava a ordem nova);
//   - livro: editor com negrito/itálico/quebra de cena, contagem, prévia como
//     o leitor vê, rascunho automático no navegador (recarregar não perde nada)
//     e Ctrl+S; importar manuscrito .docx/.epub/.txt/.md (fio-manuscrito.js);
//   - quadrinho: soltar várias páginas, envio com barra de progresso e nova
//     tentativa, arrastar para ordenar, inverter, prévia;
//   - capa com prévia antes de enviar; dados da obra com os filtros.
// Plano, limites, dono e tipo de imagem: quem decide é o servidor.

const main = document.getElementById('main')
const url = new URLSearchParams(location.search)
const MB = 1024 * 1024
const TIPOS_IMG = ['image/jpeg', 'image/png', 'image/webp']
const ESTADOS = {
  rascunho: ['rascunho', 'var(--tinta2)'], revisao: ['em revisão', 'var(--ouro)'], publicada: ['no ar', 'var(--bom)'],
  recusada: ['recusado', 'var(--acento)'], suspensa: ['suspensa', 'var(--acento)'],
}
const selo = (estado) => el('span', { class: 'selo', style: `color:${ESTADOS[estado]?.[1]};border-color:${ESTADOS[estado]?.[1]}` }, ESTADOS[estado]?.[0] ?? estado)
let estudio = null
let pessoa = null

async function iniciar() {
  pessoa = await eu()
  if (!pessoa) {
    por(main, el('h1', {}, 'Estúdio'), el('p', { class: 'sub' }, 'Entre com a sua conta para publicar livros e quadrinhos.'),
      el('a', { class: 'botao', href: '/#/entrar' }, 'Entrar'))
    return
  }
  try { estudio = await pedir('/minhas-publicacoes') } catch (e) { por(main, recado('ruim', e.message)); return }
  if (url.get('obra')) return abrirObra(Number(url.get('obra')))
  if (url.get('nova') && estudio.plano.limites) return formularioObra(null, url.get('nova') === 'quadrinho' ? 'quadrinho' : 'livro')
  painel()
}

function regras() {
  return el('details', { class: 'caixa', style: 'margin-top:30px' }, el('summary', { style: 'cursor:pointer' }, 'As regras de publicação'),
    el('ul', { class: 'regras' },
      el('li', {}, 'Só publique o que é seu, ou o que você tem autorização por escrito para publicar. Obra de outra pessoa é retirada, e a conta pode perder o plano.'),
      el('li', {}, 'Nada de sexo explícito, em nenhuma classificação. Violência e temas pesados são aceitos com a classificação certa.'),
      el('li', {}, 'Obra nova, capítulo novo, edição e capa trocada passam pela revisão antes de aparecer. O que já está no ar continua no ar enquanto a edição espera.'),
      el('li', {}, 'Denúncias vão para a administração, que decide. Nada sai do ar sozinho.')))
}

// ─────────────────────────────────────────────────────────────
// painel do autor
// ─────────────────────────────────────────────────────────────
function painel() {
  const { plano, uso, obras } = estudio
  const lim = plano.limites
  por(main,
    el('h1', {}, 'Estúdio'),
    el('p', { class: 'sub' }, 'Escreva e desenhe aqui. Depois da revisão, a obra aparece na ', el('a', { href: '/publicacoes.html' }, 'comunidade'),
      ', com filtros por formato, gênero, cor e classificação, e quem a segue recebe aviso a cada capítulo novo.'),
    lim ? el('div', { class: 'uso' },
      el('div', { class: 'caixa' }, el('div', { class: 'aut' }, 'plano'), el('b', {}, plano.nome)),
      el('div', { class: 'caixa' }, el('div', { class: 'aut' }, 'obras'), el('b', {}, `${uso.obras} de ${lim.obras}`),
        el('div', { class: 'barrinha' }, el('i', { style: `width:${Math.min(100, Math.round(uso.obras / lim.obras * 100))}%` }))),
      el('div', { class: 'caixa' }, el('div', { class: 'aut' }, 'leituras das suas obras'), el('b', {}, obras.reduce((n, o) => n + o.leituras, 0).toLocaleString('pt-BR'))))
      : el('div', { class: 'aviso-topo' }, el('span', { style: 'font-size:20px' }, '✒️'), el('div', {},
        el('b', {}, `Publicar faz parte dos planos Trama e Tear. O seu plano é ${plano.nome}.`),
        'As assinaturas ainda não estão abertas; por enquanto os planos são concedidos pela administração. ',
        el('a', { href: '/assinaturas.html' }, 'Ver os planos.'))),
    lim && uso.obras < lim.obras ? el('section', {},
      el('h2', {}, 'Começar uma obra'),
      el('div', { class: 'nova' },
        el('button', { type: 'button', onclick: () => formularioObra(null, 'livro') }, el('span', { style: 'font-size:26px' }, '📖'), el('b', {}, 'Livro'),
          el('span', { class: 'aut' }, 'Romance, contos, poesia, light novel, web novel. Dá para importar .docx, .epub, .txt ou .md.')),
        el('button', { type: 'button', onclick: () => formularioObra(null, 'quadrinho') }, el('span', { style: 'font-size:26px' }, '🎨'), el('b', {}, 'Quadrinho'),
          el('span', { class: 'aut' }, 'Mangá, manhwa, webtoon, HQ ou tirinha. Solte as páginas e ordene arrastando.')))) : null,
    obras.length ? el('h2', { style: 'margin-top:30px' }, 'Suas obras') : null,
    obras.length ? el('div', { class: 'minhas' }, obras.map((o) => el('a', { class: 'minha', href: `/publicar.html?obra=${o.id}` },
      o.capa ? el('img', { src: o.capa, alt: '' }) : el('div', { class: 'sem' }),
      el('div', {},
        el('h2', {}, o.titulo),
        el('div', { class: 'selos', style: 'margin:4px 0' }, selo(o.estado),
          o.capa_pendente ? el('span', { class: 'selo' }, 'capa nova em revisão') : null,
          o.denuncias ? el('span', { class: 'selo ruim' }, `${o.denuncias} denúncia(s)`) : null),
        el('div', { class: 'aut' }, `${o.partes_publicadas} de ${o.partes} capítulos no ar · ${o.leituras.toLocaleString('pt-BR')} leituras`),
        o.motivo ? el('div', { class: 'aut', style: 'color:var(--acento);margin-top:4px' }, o.motivo) : null)))) : null,
    regras())
}

// ─────────────────────────────────────────────────────────────
// dados da obra (nova ou existente)
// ─────────────────────────────────────────────────────────────
function formularioObra(obra, tipoInicial, alvo = main, aoSalvar = null) {
  const op = estudio.opcoes
  let tipo = obra?.tipo ?? tipoInicial
  const saida = el('div')
  const titulo = el('input', { type: 'text', maxlength: '120', value: obra?.titulo ?? '', placeholder: 'o título como vai aparecer' })
  const formato = el('select', {})
  const pintarFormatos = () => por(formato, Object.entries(op.formatos[tipo]).map(([k, v]) => {
    const o = el('option', { value: k }, v); if (obra?.formato === k) o.selected = true; return o
  }))
  pintarFormatos()
  const escolhidos = new Set(obra?.generosChaves ?? [])
  const generos = el('div', { class: 'generos' }, Object.entries(op.generos).sort((a, b) => a[1].localeCompare(b[1], 'pt')).map(([k, v]) => {
    const c = el('input', { type: 'checkbox', value: k }); c.checked = escolhidos.has(k)
    c.addEventListener('change', () => {
      if (c.checked && escolhidos.size >= 4) { c.checked = false; por(saida, recado('ruim', 'No máximo 4 gêneros.')); return }
      c.checked ? escolhidos.add(k) : escolhidos.delete(k)
    })
    return el('label', {}, c, v)
  }))
  const classificacao = el('select', {}, ['livre', '10', '12', '14', '16', '18'].map((k) => {
    const o = el('option', { value: k }, op.classificacoes[k]); if ((obra?.classificacao ?? 'livre') === k) o.selected = true; return o
  }))
  const sinopse = el('textarea', { maxlength: '2000', placeholder: 'Do que se trata, em poucas linhas. É o que aparece na vitrine.' }); sinopse.value = obra?.sinopse ?? ''
  const contaSinopse = el('div', { class: 'aut', style: 'text-align:right' })
  const pintarConta = () => { contaSinopse.textContent = `${sinopse.value.length}/2000` }
  sinopse.addEventListener('input', pintarConta); pintarConta()
  const cor = el('select', {}, el('option', { value: 'colorido' }, 'Colorido'), el('option', { value: 'pb' }, 'Preto e branco')); cor.value = obra?.cor ?? 'colorido'
  const sentido = el('select', {}, el('option', { value: 'ltr' }, 'Esquerda → direita (HQ, manhwa, webtoon)'), el('option', { value: 'rtl' }, 'Direita ← esquerda (mangá japonês)')); sentido.value = obra?.sentido ?? 'ltr'
  const status = el('select', {}, el('option', { value: 'andamento' }, 'Em andamento'), el('option', { value: 'completa' }, 'Completa'), el('option', { value: 'hiato' }, 'Em hiato')); status.value = obra?.statusObra ?? 'andamento'
  const autoria = el('input', { type: 'checkbox' })
  const soQuadrinho = el('div', { class: 'duas', hidden: tipo !== 'quadrinho' },
    el('label', { class: 'campo' }, el('span', {}, 'Cor'), cor),
    el('label', { class: 'campo' }, el('span', {}, 'Sentido de leitura'), sentido))
  const tipoEscolha = obra ? null : el('div', { class: 'linha-filtro', style: 'margin-bottom:14px' },
    ['livro', 'quadrinho'].map((t) => el('button', { type: 'button', class: 'filtro', 'aria-pressed': String(t === tipo), onclick: (e) => {
      tipo = t
      for (const b of e.currentTarget.parentNode.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b === e.currentTarget))
      pintarFormatos(); soQuadrinho.hidden = tipo !== 'quadrinho'
    } }, op.tipos[t])))

  const form = el('form', { class: 'caixa', onsubmit: async (ev) => {
    ev.preventDefault()
    const b = ev.submitter; b.disabled = true
    try {
      const r = await pedir('/publicacao', {
        id: obra?.id, tipo, titulo: titulo.value, formato: formato.value, generos: [...escolhidos], classificacao: classificacao.value,
        sinopse: sinopse.value, cor: cor.value, sentido: sentido.value, status_obra: status.value, autoria: autoria.checked,
      })
      if (!obra) { location.href = `/publicar.html?obra=${r.id}`; return }
      por(saida, recado('bom', 'Dados salvos.')); b.disabled = false
      aoSalvar?.()
    } catch (e) { b.disabled = false; por(saida, recado('ruim', e.message)) }
  } },
  el('h2', {}, obra ? 'Dados da obra' : 'Nova obra'),
  tipoEscolha,
  el('label', { class: 'campo' }, el('span', {}, 'Título'), titulo),
  el('div', { class: 'duas' },
    el('label', { class: 'campo' }, el('span', {}, 'Formato'), formato),
    el('label', { class: 'campo' }, el('span', {}, 'Classificação indicativa'), classificacao)),
  soQuadrinho,
  el('div', { style: 'margin-bottom:14px' }, el('span', { class: 'aut', style: 'display:block;margin-bottom:6px' }, 'Gêneros (até 4) — é por eles que a obra aparece nos filtros'), generos),
  el('label', { class: 'campo' }, el('span', {}, 'Sinopse'), sinopse, contaSinopse),
  el('label', { class: 'campo' }, el('span', {}, 'Situação'), status),
  el('label', { class: 'chave', style: 'margin:6px 0 16px' }, autoria,
    el('span', {}, 'Declaro que sou autor(a) desta obra, ou que tenho autorização por escrito de quem é, e que ela segue as regras de publicação do Fio.')),
  el('button', { class: 'botao', disabled: !estudio.plano.limites }, obra ? 'Salvar dados' : 'Criar e começar a escrever'),
  saida)

  if (alvo === main) por(main, el('p', {}, el('a', { href: '/publicar.html', class: 'aut' }, '← estúdio')), form, regras())
  else por(alvo, form)
}

// ─────────────────────────────────────────────────────────────
// o estúdio de uma obra
// ─────────────────────────────────────────────────────────────
let obraAtual = null
let abaObra = 'capitulos'
let parteAberta = null // id da parte no editor, ou 'nova'

async function abrirObra(id) {
  try { obraAtual = await pedir(`/publicacao?id=${id}`) } catch (e) { por(main, recado('ruim', e.message)); return }
  if (!obraAtual.souDono) { location.href = `/publicacoes.html?id=${id}`; return }
  desenharEstudio()
}

function desenharEstudio() {
  const o = obraAtual
  const admin = pessoa?.papel === 'admin'
  const aEnviar = o.partes.filter((p) => p.estado === 'rascunho' || p.estado === 'recusada' || p.pendente === 'rascunho').length
  const conteudo = el('div')
  por(main,
    el('p', {}, el('a', { href: '/publicar.html', class: 'aut' }, '← estúdio')),
    el('div', { class: 'topo-ed' },
      o.capa ? el('img', { src: o.capa, alt: '', style: 'width:46px;aspect-ratio:2/3;object-fit:cover;border-radius:4px' }) : null,
      el('div', {}, el('h1', {}, o.titulo), el('div', { class: 'selos', style: 'margin:4px 0 0' }, selo(o.estado), el('span', { class: 'selo' }, o.formatoNome),
        o.leituras ? el('span', { class: 'selo' }, `${o.leituras.toLocaleString('pt-BR')} leituras`) : null,
        o.seguidores ? el('span', { class: 'selo' }, `${o.seguidores} seguidores`) : null)),
      el('div', { class: 'acoes' },
        el('a', { class: 'botao fraco', href: `/publicacoes.html?id=${o.id}`, target: '_blank' }, 'Ver como leitor'),
        el('button', { class: 'botao', type: 'button', disabled: o.estado === 'suspensa' || !estudio.plano.limites, onclick: enviar },
          admin ? 'Publicar agora' : o.estado === 'publicada' ? `Enviar para revisão${aEnviar ? ` (${aEnviar})` : ''}` : 'Enviar para revisão'))),
    o.motivo ? recado('ruim', `Motivo da administração: ${o.motivo}`) : null,
    el('div', { class: 'abas-ed', role: 'tablist' }, [['capitulos', 'Capítulos'], ['dados', 'Dados da obra'], ['capa', 'Capa']].map(([k, r]) =>
      el('button', { type: 'button', role: 'tab', 'aria-selected': String(k === abaObra), onclick: () => { abaObra = k; desenharEstudio() } }, r))),
    conteudo,
    el('details', { class: 'caixa', style: 'margin-top:30px' }, el('summary', { style: 'cursor:pointer;color:var(--acento)' }, 'Apagar a obra'),
      el('p', { class: 'aut' }, 'Apaga a obra inteira, com capítulos e imagens. Não tem volta.'),
      el('button', { class: 'botao', type: 'button', onclick: async () => {
        if (!confirm(`Apagar "${o.titulo}" para sempre?`)) return
        try { await pedir('/publicacao/apagar', { id: o.id }); location.href = '/publicar.html' } catch (e) { alert(e.message) }
      } }, 'Apagar para sempre')))
  if (abaObra === 'dados') formularioObra(o, o.tipo, conteudo, () => abrirObra(o.id))
  else if (abaObra === 'capa') abaCapa(conteudo)
  else abaCapitulos(conteudo)
}

async function enviar(ev) {
  const b = ev.currentTarget; b.disabled = true
  try {
    const r = await pedir('/publicacao/enviar', { id: obraAtual.id })
    alert(r.estado === 'publicada' ? 'Publicado.' : 'Enviado para revisão. Você recebe um aviso na central quando a administração decidir.')
    abrirObra(obraAtual.id)
  } catch (e) { alert(e.message); b.disabled = false }
}

// ── capa ──
function abaCapa(alvo) {
  const o = obraAtual
  const saida = el('div')
  const previa = el('img', { class: 'capa-grande', alt: 'prévia da capa', src: o.capaPendente ?? o.capa ?? 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' })
  const escolher = el('input', { type: 'file', accept: TIPOS_IMG.join(',') })
  let arquivo = null
  escolher.addEventListener('change', () => {
    arquivo = escolher.files[0]
    if (!arquivo) return
    if (!TIPOS_IMG.includes(arquivo.type)) { por(saida, recado('ruim', 'Só JPG, PNG ou WebP.')); arquivo = null; return }
    if (arquivo.size > 3 * MB) { por(saida, recado('ruim', 'A capa passa de 3 MB.')); arquivo = null; return }
    const leitor = new FileReader()
    leitor.onload = () => {
      previa.onload = () => {
        const prop = previa.naturalHeight / previa.naturalWidth
        por(saida, prop < 1.1 || prop > 1.8 || previa.naturalWidth < 300
          ? recado('ruim', `Esta imagem tem ${previa.naturalWidth}×${previa.naturalHeight}. A capa precisa ser em pé (perto de 2:3) e ter 300 px de largura ou mais.`)
          : recado('bom', `${previa.naturalWidth}×${previa.naturalHeight} — boa para capa.`))
      }
      previa.src = leitor.result
    }
    leitor.readAsDataURL(arquivo)
  })
  por(alvo, el('div', { class: 'caixa', style: 'display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start' },
    previa,
    el('div', { style: 'flex:1;min-width:240px' },
      el('h2', {}, 'Capa'),
      el('p', { class: 'aut' }, 'Imagem em pé, perto de 2:3 (ex.: 800 × 1200 px). É o que aparece na vitrine, na home e nos avisos.',
        o.estado === 'publicada' ? ' Como a obra já está no ar, a capa nova só troca depois da revisão; até lá fica a atual.' : ''),
      o.capaPendente ? recado('bom', 'Há uma capa nova esperando revisão (é a da prévia).') : null,
      el('p', {}, escolher),
      el('button', { class: 'botao', type: 'button', onclick: async (e) => {
        if (!arquivo) return por(saida, recado('ruim', 'Escolha a imagem primeiro.'))
        const b = e.currentTarget; b.disabled = true
        try { await pedir(`/publicacao/imagem?id=${o.id}&uso=capa`, null, { bruto: arquivo }); abrirObra(o.id) }
        catch (x) { b.disabled = false; por(saida, recado('ruim', x.message)) }
      } }, 'Enviar capa'),
      saida)))
}

// ── capítulos ──
function abaCapitulos(alvo) {
  const o = obraAtual
  const lista = el('div', { class: 'lista-caps' })
  const area = el('div', { class: 'area-ed' })
  por(alvo, el('div', { class: 'estudio' }, lista, area))

  let arrastado = null
  const cor = (p) => p.pendente ? 'var(--ouro)' : ESTADOS[p.estado]?.[1] ?? 'var(--tinta2)'
  const itens = o.partes.map((p) => {
    const item = el('div', { class: 'item-cap', draggable: 'true', 'aria-current': String(parteAberta === p.id), title: p.motivo ?? '',
      onclick: () => { parteAberta = p.id; abaCapitulos(alvo) } },
    el('span', { class: 'pega', 'aria-hidden': 'true' }, '⋮⋮'),
    el('span', { class: 'n' }, String(p.ordem)),
    el('span', { class: 't' }, p.titulo),
    el('span', { class: 'ponto', style: `background:${cor(p)}`, title: p.pendente ? 'edição esperando' : ESTADOS[p.estado]?.[0] }))
    item.dataset.id = p.id
    item.addEventListener('dragstart', (e) => { arrastado = item; item.classList.add('arrastando'); e.dataTransfer.effectAllowed = 'move' })
    item.addEventListener('dragend', () => { item.classList.remove('arrastando'); for (const i of lista.querySelectorAll('.alvo')) i.classList.remove('alvo') })
    item.addEventListener('dragover', (e) => { e.preventDefault(); item.classList.add('alvo') })
    item.addEventListener('dragleave', () => item.classList.remove('alvo'))
    item.addEventListener('drop', async (e) => {
      e.preventDefault(); item.classList.remove('alvo')
      if (!arrastado || arrastado === item) return
      lista.insertBefore(arrastado, item)
      const ids = [...lista.querySelectorAll('.item-cap')].map((i) => Number(i.dataset.id))
      try { await pedir('/publicacao/partes/ordem', { publicacao: o.id, ids }) } catch (x) { alert(x.message) }
      abrirObra(o.id)
    })
    return item
  })
  por(lista,
    el('div', { style: 'display:flex;gap:6px;padding:4px 4px 8px;flex-wrap:wrap' },
      el('button', { class: 'botao mini', type: 'button', disabled: !estudio.plano.limites, onclick: () => { parteAberta = 'nova'; abaCapitulos(alvo) } }, '+ Capítulo'),
      o.tipo === 'livro' ? el('button', { class: 'botao fraco mini', type: 'button', disabled: !estudio.plano.limites, onclick: () => importar() }, 'Importar manuscrito') : null),
    itens.length ? itens : el('p', { class: 'aut', style: 'padding:8px' }, 'Nenhum capítulo ainda.'),
    itens.length > 1 ? el('p', { class: 'aut', style: 'padding:6px 8px 2px' }, 'Arraste ⋮⋮ para mudar a ordem.') : null)

  if (parteAberta === 'nova') return o.tipo === 'livro' ? editorTexto(area, null) : editorPaginas(area, null)
  const parte = o.partes.find((p) => p.id === parteAberta)
  if (parte) return o.tipo === 'livro' ? editorTexto(area, parte) : editorPaginas(area, parte)

  const passos = [
    [!!o.capa || !!o.capaPendente, 'Capa enviada', 'capa'],
    [o.sinopse?.length >= 20, 'Sinopse escrita', 'dados'],
    [o.partes.length > 0, 'Pelo menos um capítulo', null],
    [o.estado !== 'rascunho', 'Enviado para revisão', null],
    [o.estado === 'publicada', 'No ar', null],
  ]
  por(area, el('div', { class: 'caixa' },
    el('h2', {}, o.partes.length ? 'Escolha um capítulo ao lado' : 'Comece o primeiro capítulo'),
    el('ul', { class: 'checklist' }, passos.map(([ok, t, aba]) => el('li', { class: ok ? 'feito' : '' },
      aba && !ok ? el('a', { href: '#', onclick: (e) => { e.preventDefault(); abaObra = aba; desenharEstudio() } }, t) : t))),
    el('p', { class: 'aut', style: 'margin-top:14px' }, o.tipo === 'livro'
      ? 'Dica: tem o livro pronto num arquivo? Use "Importar manuscrito" — ele separa os capítulos pelos títulos.'
      : 'Dica: solte todas as páginas de uma vez; elas entram em ordem de nome do arquivo e dá para arrastar depois.')))
}

// ── editor de texto (livro) ──
let avisoSaida = null
function editorTexto(area, parte) {
  const o = obraAtual
  const lim = estudio.plano.limites
  const chave = `fio:rascunho:${o.id}:${parte?.id ?? 'nova'}`
  const tituloPadrao = parte?.titulo ?? `Capítulo ${(o.partes.at(-1)?.ordem ?? 0) + 1}`
  const titulo = el('input', { type: 'text', maxlength: '120', value: tituloPadrao, style: 'font:500 20px Literata,Georgia,serif;width:100%;padding:8px 10px;border:1px solid var(--linha);border-radius:8px;background:var(--papel);color:var(--tinta);margin-bottom:10px' })
  const texto = el('textarea', { class: 'texto-cap', placeholder: 'Escreva ou cole o capítulo. Linha em branco separa parágrafos. **negrito**, _itálico_, e *** sozinho numa linha para quebra de cena.' })
  const previa = el('div', { class: 'previa-texto', hidden: true })
  const contador = el('span', { class: 'dir' })
  const estadoSalvo = el('span', { class: 'aut' })
  const saida = el('div')
  let original = '', mudou = false

  const contar = () => {
    const palavras = (texto.value.match(/\S+/g) ?? []).length
    contador.textContent = `${palavras.toLocaleString('pt-BR')} palavras · ${texto.value.length.toLocaleString('pt-BR')}/${lim?.caracteresPorParte?.toLocaleString('pt-BR') ?? '—'} caracteres · ~${Math.max(1, Math.round(palavras / 230))} min`
  }
  let relogio
  const rascunho = () => {
    mudou = texto.value !== original || titulo.value !== tituloPadrao
    clearTimeout(relogio)
    relogio = setTimeout(() => {
      if (mudou) { try { localStorage.setItem(chave, JSON.stringify({ titulo: titulo.value, texto: texto.value, em: Date.now() })) } catch {} }
      estadoSalvo.textContent = mudou ? 'rascunho guardado neste aparelho · ainda não salvo no Fio' : ''
    }, 800)
    contar()
  }
  const envolver = (antes, depois = antes) => {
    const [a, b] = [texto.selectionStart, texto.selectionEnd]
    const sel = texto.value.slice(a, b) || 'texto'
    texto.setRangeText(`${antes}${sel}${depois}`, a, b, 'select')
    texto.focus(); rascunho()
  }
  const inserir = (s) => { texto.setRangeText(s, texto.selectionStart, texto.selectionEnd, 'end'); texto.focus(); rascunho() }
  const salvar = async (botao) => {
    if (botao) botao.disabled = true
    try {
      const r = await pedir('/publicacao/parte', { publicacao: o.id, id: parte?.id, titulo: titulo.value, texto: texto.value })
      try { localStorage.removeItem(chave) } catch {}
      original = texto.value; mudou = false
      parteAberta = r.id
      por(saida, recado('bom', r.pendente ? 'Edição salva. O capítulo no ar continua o mesmo até a revisão aprovar.' : 'Capítulo salvo. Quando terminar, envie a obra para revisão.'))
      setTimeout(() => abrirObra(o.id), 900)
    } catch (e) { por(saida, recado('ruim', e.message)) }
    if (botao) botao.disabled = false
  }

  const carregar = async () => {
    if (parte) {
      try { const r = await pedir(`/publicacao/parte?id=${o.id}&ordem=${parte.ordem}`); original = r.texto ?? ''; titulo.value = r.parte.titulo } catch {}
    }
    texto.value = original
    try {
      const r = JSON.parse(localStorage.getItem(chave) || 'null')
      if (r && r.texto && r.texto !== original) {
        por(saida, el('div', { class: 'recado bom', style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap' },
          `Há um rascunho deste capítulo de ${new Date(r.em).toLocaleString('pt-BR')} que não foi salvo.`,
          el('button', { class: 'botao mini', type: 'button', onclick: () => { texto.value = r.texto; titulo.value = r.titulo; rascunho(); por(saida) } }, 'Recuperar'),
          el('button', { class: 'botao fraco mini', type: 'button', onclick: () => { try { localStorage.removeItem(chave) } catch {} por(saida) } }, 'Descartar')))
      }
    } catch {}
    contar()
  }
  texto.addEventListener('input', rascunho)
  titulo.addEventListener('input', rascunho)
  texto.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); salvar() }
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') { e.preventDefault(); envolver('**') }
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') { e.preventDefault(); envolver('_') }
  })
  if (avisoSaida) removeEventListener('beforeunload', avisoSaida)
  avisoSaida = (e) => { if (mudou && texto.isConnected) { e.preventDefault(); e.returnValue = '' } }
  addEventListener('beforeunload', avisoSaida)

  const alternarPrevia = (b) => {
    const ver = previa.hidden
    if (ver) por(previa, el('h2', { style: 'text-align:center;margin:0 0 1em' }, titulo.value), marcacaoParaNos(texto.value))
    previa.hidden = !ver; texto.hidden = ver
    b.textContent = ver ? 'Voltar a escrever' : 'Prévia'
  }
  por(area,
    parte?.estado === 'publicada' ? el('p', { class: 'aut' }, parte.pendente ? 'Há uma edição deste capítulo esperando revisão; é ela que está aqui.' : 'Este capítulo está no ar. Salvar cria uma edição que só entra depois da revisão.') : null,
    parte?.motivo ? recado('ruim', `Motivo da recusa: ${parte.motivo}`) : null,
    titulo,
    el('div', { class: 'barra-ferr' },
      el('button', { type: 'button', title: 'Negrito (Ctrl+B)', onclick: () => envolver('**') }, el('b', {}, 'N')),
      el('button', { type: 'button', title: 'Itálico (Ctrl+I)', onclick: () => envolver('_') }, el('i', {}, 'I')),
      el('button', { type: 'button', title: 'Quebra de cena', onclick: () => inserir('\n\n***\n\n') }, '✱ cena'),
      el('button', { type: 'button', title: 'Travessão de diálogo', onclick: () => inserir('— ') }, '— diálogo'),
      el('button', { type: 'button', onclick: (e) => alternarPrevia(e.currentTarget) }, 'Prévia'),
      contador),
    texto, previa,
    el('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px' },
      el('button', { class: 'botao', type: 'button', disabled: !lim, title: 'Ctrl+S', onclick: (e) => salvar(e.currentTarget) }, 'Salvar capítulo'),
      parte ? el('button', { class: 'botao fraco', type: 'button', onclick: async () => {
        if (!confirm(`Apagar "${parte.titulo}"?`)) return
        try { await pedir('/publicacao/parte/apagar', { publicacao: o.id, id: parte.id }); parteAberta = null; abrirObra(o.id) } catch (x) { alert(x.message) }
      } }, 'Apagar capítulo') : null,
      estadoSalvo),
    saida)
  carregar()
}

// ── importar manuscrito (livro) ──
function importar() {
  const o = obraAtual
  const arquivo = el('input', { type: 'file', accept: '.docx,.epub,.txt,.md,.markdown' })
  const resultado = el('div')
  const fechar = () => veu.remove()
  const veu = el('div', { class: 'modal', onclick: (e) => { if (e.target === veu) fechar() } },
    el('div', { class: 'caixa' },
      el('h2', {}, 'Importar manuscrito'),
      el('p', { class: 'aut' }, 'Word (.docx), EPUB, texto (.txt) ou Markdown (.md). O arquivo é lido aqui no seu navegador; os capítulos são separados pelos títulos (estilo "Título 1" no Word, "# …" ou linhas "Capítulo …"). Negrito e itálico vêm junto.'),
      arquivo, resultado,
      el('p', { style: 'margin-top:14px' }, el('button', { class: 'botao fraco', type: 'button', onclick: fechar }, 'Fechar'))))
  document.body.append(veu)
  arquivo.addEventListener('change', async () => {
    const f = arquivo.files[0]; if (!f) return
    por(resultado, el('p', { class: 'aut' }, 'lendo o arquivo…'))
    let caps
    try { caps = await lerManuscrito(f) } catch (e) { por(resultado, recado('ruim', e.message)); return }
    const lim = estudio.plano.limites
    const cabem = Math.max(0, lim.partesPorObra - o.partes.length)
    const marcados = caps.map((c) => ({ ...c, usar: c.texto.length <= lim.caracteresPorParte && c.texto.length >= 50 }))
    const linhas = marcados.map((c, i) => {
      const ch = el('input', { type: 'checkbox' }); ch.checked = c.usar; ch.disabled = c.texto.length > lim.caracteresPorParte || c.texto.length < 50
      ch.addEventListener('change', () => { c.usar = ch.checked })
      const tit = el('input', { type: 'text', value: c.titulo, maxlength: '120', style: 'flex:1' })
      tit.addEventListener('input', () => { c.titulo = tit.value })
      const palavras = (c.texto.match(/\S+/g) ?? []).length
      return el('div', { style: 'display:flex;gap:8px;align-items:center;padding:6px 0;border-top:1px solid var(--linha)' },
        ch, el('span', { class: 'aut', style: 'min-width:2em' }, String(i + 1)), tit,
        el('span', { class: 'aut', style: 'white-space:nowrap' }, c.texto.length > lim.caracteresPorParte ? 'longo demais — divida' : c.texto.length < 50 ? 'curto demais' : `${palavras.toLocaleString('pt-BR')} palavras`))
    })
    const progresso = el('div', { class: 'aut' })
    por(resultado,
      el('p', {}, el('b', {}, `${caps.length} capítulo(s) encontrado(s).`), ` Cabem mais ${cabem} nesta obra.`),
      el('div', { style: 'max-height:50vh;overflow:auto' }, linhas),
      el('p', {}, el('button', { class: 'botao', type: 'button', onclick: async (e) => {
        const escolhidos = marcados.filter((c) => c.usar).slice(0, cabem)
        if (!escolhidos.length) return
        e.currentTarget.disabled = true
        let feitos = 0
        for (const c of escolhidos) {
          progresso.textContent = `criando ${feitos + 1} de ${escolhidos.length}: ${c.titulo}`
          try { await pedir('/publicacao/parte', { publicacao: o.id, titulo: c.titulo, texto: c.texto }); feitos++ }
          catch (x) { por(resultado, recado('ruim', `Parou em "${c.titulo}": ${x.message}`)); break }
        }
        progresso.textContent = `${feitos} capítulo(s) criado(s).`
        setTimeout(() => { fechar(); parteAberta = null; abrirObra(o.id) }, 900)
      } }, 'Criar os capítulos marcados')), progresso)
  })
}

// ── editor de páginas (quadrinho) ──
function editorPaginas(area, parte) {
  const o = obraAtual
  const lim = estudio.plano.limites
  const titulo = el('input', { type: 'text', maxlength: '120', value: parte?.titulo ?? `Capítulo ${(o.partes.at(-1)?.ordem ?? 0) + 1}`, style: 'font:500 20px Literata,Georgia,serif;width:100%;padding:8px 10px;border:1px solid var(--linha);border-radius:8px;background:var(--papel);color:var(--tinta);margin-bottom:10px' })
  const paginas = []
  const grade = el('div', { class: 'miniaturas' })
  const fila = el('div', { class: 'fila-up' })
  const saida = el('div')
  const contagem = el('span', { class: 'aut' })

  let arrastada = null
  const pintar = () => {
    contagem.textContent = `${paginas.length}${lim ? ` de até ${lim.paginasPorParte}` : ''} páginas`
    por(grade, paginas.map((p, i) => {
      const m = el('div', { class: 'mini', draggable: 'true' },
        el('img', { src: p.url, alt: `página ${i + 1}`, loading: 'lazy' }), el('span', { class: 'num' }, String(i + 1)),
        el('button', { class: 'tirar', type: 'button', title: 'tirar do capítulo', onclick: () => { paginas.splice(i, 1); pintar() } }, '×'))
      m.addEventListener('dragstart', () => { arrastada = i; m.classList.add('arrastando') })
      m.addEventListener('dragend', () => m.classList.remove('arrastando'))
      m.addEventListener('dragover', (e) => { e.preventDefault(); m.classList.add('alvo') })
      m.addEventListener('dragleave', () => m.classList.remove('alvo'))
      m.addEventListener('drop', (e) => {
        e.preventDefault(); m.classList.remove('alvo')
        if (arrastada == null || arrastada === i) return
        const [x] = paginas.splice(arrastada, 1); paginas.splice(i, 0, x); arrastada = null; pintar()
      })
      return m
    }))
  }

  // envio com progresso (XHR tem evento de upload), três ao mesmo tempo, até 3 tentativas
  const enviarUma = (arquivo, linha) => new Promise((ok, falha) => {
    const x = new XMLHttpRequest()
    x.open('POST', `/api/publicacao/imagem?id=${o.id}&uso=pagina`)
    x.setRequestHeader('x-fio', '1')
    x.upload.onprogress = (e) => { if (e.lengthComputable) linha.barra.value = e.loaded / e.total }
    x.onload = () => { let j = {}; try { j = JSON.parse(x.responseText) } catch {} x.status === 200 ? ok(j) : falha(Object.assign(new Error(j.erro || `erro ${x.status}`), { status: x.status })) }
    x.onerror = () => falha(new Error('a conexão caiu'))
    x.send(arquivo)
  })
  const receber = async (arquivos) => {
    const lista = [...arquivos].filter((f) => f.type.startsWith('image/')).sort((a, b) => a.name.localeCompare(b.name, 'pt', { numeric: true }))
    const tarefas = lista.map((f) => {
      const barra = el('progress', { max: '1', value: '0' })
      const estado = el('span', { style: 'min-width:9em' }, 'na fila')
      const t = { f, barra, estado, no: el('div', {}, el('span', { style: 'flex:0 0 40%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, f.name), barra, estado) }
      fila.append(t.no)
      return t
    })
    const resultado = new Array(tarefas.length)
    let proxima = 0
    const trabalhador = async () => {
      while (proxima < tarefas.length) {
        const k = proxima++; const t = tarefas[k]
        if (!TIPOS_IMG.includes(t.f.type) || t.f.size > 5 * MB) { t.estado.textContent = 'só JPG/PNG/WebP até 5 MB'; continue }
        if (lim && paginas.length + resultado.filter(Boolean).length >= lim.paginasPorParte) { t.estado.textContent = 'passou do limite do plano'; continue }
        t.estado.textContent = 'enviando'
        for (let tentativa = 1; tentativa <= 3; tentativa++) {
          try { const r = await enviarUma(t.f, t); resultado[k] = { arquivo: r.arquivo, url: r.url }; t.estado.textContent = 'pronta'; break }
          catch (e) {
            if (tentativa === 3 || e.status === 415 || e.status === 403) { t.estado.textContent = e.message; t.estado.style.color = 'var(--acento)'; break }
            t.estado.textContent = `tentando de novo (${tentativa})`
            await new Promise((r) => setTimeout(r, 1500 * tentativa))
          }
        }
      }
    }
    await Promise.all([trabalhador(), trabalhador(), trabalhador()])
    paginas.push(...resultado.filter(Boolean))
    pintar()
    setTimeout(() => { for (const t of tarefas) if (t.estado.textContent === 'pronta') t.no.remove() }, 1500)
  }

  const escolher = el('input', { type: 'file', accept: TIPOS_IMG.join(','), multiple: true, hidden: true })
  const soltar = el('label', { class: 'soltar' }, el('b', {}, 'Solte as páginas aqui'), el('div', { class: 'aut' }, 'ou clique para escolher · JPG, PNG ou WebP até 5 MB cada · entram em ordem de nome'), escolher)
  escolher.addEventListener('change', () => { receber(escolher.files); escolher.value = '' })
  soltar.addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); soltar.classList.add('por-cima') } })
  soltar.addEventListener('dragleave', () => soltar.classList.remove('por-cima'))
  soltar.addEventListener('drop', (e) => { e.preventDefault(); soltar.classList.remove('por-cima'); receber(e.dataTransfer.files) })

  const salvar = async (b) => {
    b.disabled = true
    try {
      const r = await pedir('/publicacao/parte', { publicacao: o.id, id: parte?.id, titulo: titulo.value, paginas: paginas.map((p) => p.arquivo) })
      parteAberta = r.id
      por(saida, recado('bom', r.pendente ? 'Edição salva. O capítulo no ar continua o mesmo até a revisão aprovar.' : 'Capítulo salvo.'))
      setTimeout(() => abrirObra(o.id), 900)
    } catch (e) { por(saida, recado('ruim', e.message)) }
    b.disabled = false
  }
  const previa = () => {
    const veu = el('div', { class: 'modal', style: 'background:rgba(0,0,0,.92)', onclick: () => veu.remove() },
      el('div', { style: 'max-width:900px;width:100%' },
        el('p', { style: 'color:#ddd;text-align:center' }, `Prévia · ${o.sentido === 'rtl' ? 'mangá (lê-se ←)' : 'lê-se →'} · toque para fechar`),
        paginas.map((p) => el('img', { src: p.url, alt: '', style: 'width:100%;display:block' }))))
    document.body.append(veu)
  }

  por(area,
    parte?.estado === 'publicada' ? el('p', { class: 'aut' }, parte.pendente ? 'Há uma edição deste capítulo esperando revisão; é ela que está aqui.' : 'Este capítulo está no ar. Salvar cria uma edição que só entra depois da revisão.') : null,
    parte?.motivo ? recado('ruim', `Motivo da recusa: ${parte.motivo}`) : null,
    titulo, soltar, fila,
    el('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px' },
      contagem,
      el('button', { class: 'botao fraco mini', type: 'button', onclick: () => { paginas.reverse(); pintar() } }, 'inverter ordem'),
      el('button', { class: 'botao fraco mini', type: 'button', onclick: previa }, 'prévia')),
    grade,
    el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
      el('button', { class: 'botao', type: 'button', disabled: !lim, onclick: (e) => salvar(e.currentTarget) }, 'Salvar capítulo'),
      parte ? el('button', { class: 'botao fraco', type: 'button', onclick: async () => {
        if (!confirm(`Apagar "${parte.titulo}"?`)) return
        try { await pedir('/publicacao/parte/apagar', { publicacao: o.id, id: parte.id }); parteAberta = null; abrirObra(o.id) } catch (x) { alert(x.message) }
      } }, 'Apagar capítulo') : null),
    saida)

  if (parte) {
    pedir(`/publicacao/parte?id=${o.id}&ordem=${parte.ordem}`).then((r) => {
      titulo.value = r.parte.titulo
      for (const u of r.paginas ?? []) paginas.push({ arquivo: u.split('/').pop(), url: u })
      pintar()
    }).catch(() => {})
  }
  pintar()
}

iniciar()
