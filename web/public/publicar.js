// O estúdio de quem publica: obras, capa, capítulos e o envio para revisão.
//
// Quem decide tudo é o servidor (plano, limites, dono da obra, tipo da
// imagem). Esta página só evita a viagem inútil: confere tamanho e tipo antes
// de mandar, e mostra o limite antes de a pessoa bater nele.

cabecalho('publicar')
const main = document.getElementById('main')
const url = new URLSearchParams(location.search)
const MB = 1024 * 1024
const TIPOS_IMG = ['image/jpeg', 'image/png', 'image/webp']

let estudio = null // resposta de /minhas-publicacoes

const ESTADOS = {
  rascunho: ['rascunho', ''], revisao: ['em revisão', 'ouro'], publicada: ['publicada', 'bom'],
  recusada: ['recusada', 'ruim'], suspensa: ['suspensa', 'ruim'],
}
const seloEstado = (e) => el('span', { class: `selo ${ESTADOS[e]?.[1] ?? ''}` }, ESTADOS[e]?.[0] ?? e)
const mb = (b) => `${(b / MB).toLocaleString('pt-BR', { maximumFractionDigits: b < 10 * MB ? 1 : 0 })} MB`

async function iniciar() {
  const pessoa = await eu()
  if (!pessoa) {
    por(main, el('h1', {}, 'Publicar no Fio'),
      el('p', { class: 'sub' }, 'Entre com a sua conta para publicar livros e quadrinhos.'),
      el('a', { class: 'botao', href: '/#/entrar' }, 'Entrar'))
    return
  }
  try { estudio = await pedir('/minhas-publicacoes') }
  catch (e) { por(main, recado('ruim', `Não consegui abrir o estúdio: ${e.message}`)); return }

  if (url.get('obra')) return editor(Number(url.get('obra')))
  if (url.get('nova') && estudio.plano.limites) return editor(null)
  painel()
}

function regras() {
  return el('details', { class: 'caixa', style: 'margin-top:30px' }, el('summary', { style: 'cursor:pointer' }, 'As regras de publicação'),
    el('ul', { class: 'regras' },
      el('li', {}, 'Só publique o que é seu, ou o que você tem autorização por escrito para publicar. Mangá, manhwa ou livro de outra pessoa é retirado, e a conta pode perder o plano.'),
      el('li', {}, 'Nada de sexo explícito, em nenhuma classificação. Violência e temas pesados são aceitos com a classificação certa.'),
      el('li', {}, 'Tudo passa pela revisão da administração antes de aparecer: obra nova, capítulo novo, capítulo editado e capa trocada.'),
      el('li', {}, 'Imagens: JPG, PNG ou WebP. Capa em pé (2:3), até 3 MB. Páginas até 5 MB cada; para webtoon, 800 a 1200 px de largura lê bem no celular.'),
      el('li', {}, 'Removemos das imagens os dados escondidos (como a localização de fotos de celular) antes de guardar.'),
      el('li', {}, 'Três denúncias de pessoas diferentes tiram a obra do ar até a revisão.')))
}

// ─────────────────────────────────────────────────────────────
// o painel do autor
// ─────────────────────────────────────────────────────────────

function painel() {
  const { plano, uso, obras } = estudio
  const lim = plano.limites
  const barra = (usado, total) => el('div', { class: 'barrinha' }, el('i', { style: `width:${Math.min(100, Math.round(usado / total * 100))}%` }))

  por(main, 
    el('h1', {}, 'Publicar'),
    el('p', { class: 'sub' }, 'Escreva e desenhe aqui: livros, mangás, manhwas e HQs. Depois da revisão, a obra aparece na ',
      el('a', { href: '/publicacoes.html' }, 'comunidade'), ' e nos filtros por formato, gênero, cor e classificação.'),
    lim ? el('div', { class: 'uso' },
      el('div', { class: 'caixa' }, el('div', { class: 'aut' }, 'plano'), el('b', {}, plano.nome), el('div', {}, el('a', { href: '/assinaturas.html', style: 'font-size:12.5px;color:var(--tinta2)' }, 'ver planos'))),
      el('div', { class: 'caixa' }, el('div', { class: 'aut' }, 'obras'), el('b', {}, `${uso.obras} de ${lim.obras}`), barra(uso.obras, lim.obras)),
      el('div', { class: 'caixa' }, el('div', { class: 'aut' }, 'espaço de imagens'), el('b', {}, `${mb(uso.bytes)} de ${mb(lim.armazenamento)}`), barra(uso.bytes, lim.armazenamento)))
      : el('div', { class: 'aviso-topo' }, el('span', { style: 'font-size:20px' }, '✒️'), el('div', {},
        el('b', {}, `Publicar faz parte dos planos Trama e Tear. O seu plano é ${plano.nome}.`),
        'As assinaturas ainda não estão abertas; por enquanto os planos são concedidos pela administração. ',
        el('a', { href: '/assinaturas.html' }, 'Ver os planos e o que cada um permite.'))),
    lim ? el('p', {}, uso.obras < lim.obras
      ? el('a', { class: 'botao', href: '/publicar.html?nova=1' }, '+ Nova obra')
      : el('span', { class: 'aut' }, 'Você chegou ao limite de obras do seu plano.')) : null,
    obras.length ? el('h2', { style: 'margin-top:26px' }, 'Suas obras') : null,
    obras.length ? el('div', { class: 'minhas' }, obras.map((o) => el('a', { class: 'minha', href: `/publicar.html?obra=${o.id}` },
      o.capa ? el('img', { src: o.capa, alt: '' }) : el('div', { class: 'sem' }),
      el('div', {},
        el('h2', {}, o.titulo),
        el('div', { class: 'selos', style: 'margin:4px 0' }, seloEstado(o.estado), o.capa_pendente ? el('span', { class: 'selo ouro' }, 'capa nova em revisão') : null,
          o.denuncias ? el('span', { class: 'selo ruim' }, `${o.denuncias} denúncia(s)`) : null),
        el('div', { class: 'aut' }, `${o.partes_publicadas} de ${o.partes} capítulos no ar · ${o.leituras.toLocaleString('pt-BR')} leituras`),
        o.motivo ? el('div', { class: 'aut', style: 'color:var(--acento);margin-top:4px' }, o.motivo) : null)))) : null,
    regras())
}

// ─────────────────────────────────────────────────────────────
// o editor de uma obra
// ─────────────────────────────────────────────────────────────

async function editor(id) {
  const op = estudio.opcoes
  let obra = null
  if (id) {
    try { obra = await pedir(`/publicacao?id=${id}`) }
    catch (e) { por(main, el('p', {}, el('a', { href: '/publicar.html' }, '← suas obras')), recado('ruim', e.message)); return }
    if (!obra.souDono) { location.href = `/publicacoes.html?id=${id}`; return }
  }
  const podeEscrever = !!estudio.plano.limites
  const saida = el('div')
  const avisar = (tipo, texto) => { por(saida, recado(tipo, texto)); saida.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }

  // ── dados ──
  let tipo = obra?.tipo ?? 'livro'
  const titulo = el('input', { type: 'text', maxlength: '120', value: obra?.titulo ?? '', required: true })
  const formato = el('select', {})
  const pintarFormatos = () => por(formato, ...Object.entries(op.formatos[tipo]).map(([k, v]) => {
    const o = el('option', { value: k }, v); if (obra?.formato === k) o.selected = true; return o
  }))
  pintarFormatos()
  const escolhidos = new Set(obra?.generosChaves ?? [])
  const generos = el('div', { class: 'generos' }, Object.entries(op.generos).sort((a, b) => a[1].localeCompare(b[1], 'pt')).map(([k, v]) => {
    const c = el('input', { type: 'checkbox', value: k }); c.checked = escolhidos.has(k)
    c.addEventListener('change', () => {
      if (c.checked && escolhidos.size >= 4) { c.checked = false; avisar('ruim', 'No máximo 4 gêneros.'); return }
      c.checked ? escolhidos.add(k) : escolhidos.delete(k)
    })
    return el('label', {}, c, v)
  }))
  // em ordem de idade: chave numérica num objeto vem antes de "livre"
  const classificacao = el('select', {}, ['livre', '10', '12', '14', '16', '18'].map((k) => {
    const o = el('option', { value: k }, op.classificacoes[k]); if ((obra?.classificacao ?? 'livre') === k) o.selected = true; return o
  }))
  const sinopse = el('textarea', { maxlength: '2000', placeholder: 'Do que se trata, em poucas linhas. É o que aparece na vitrine.' }); sinopse.value = obra?.sinopse ?? ''
  const cor = el('select', {}, el('option', { value: 'colorido' }, 'Colorido'), el('option', { value: 'pb' }, 'Preto e branco')); cor.value = obra?.cor ?? 'colorido'
  const sentido = el('select', {}, el('option', { value: 'ltr' }, 'Esquerda → direita (HQ, manhwa, webtoon)'), el('option', { value: 'rtl' }, 'Direita ← esquerda (mangá japonês)')); sentido.value = obra?.sentido ?? 'ltr'
  const status = el('select', {}, el('option', { value: 'andamento' }, 'Em andamento'), el('option', { value: 'completa' }, 'Completa'), el('option', { value: 'hiato' }, 'Em hiato')); status.value = obra?.statusObra ?? 'andamento'
  const autoria = el('input', { type: 'checkbox' })
  const soQuadrinho = el('div', { class: 'duas' },
    el('label', { class: 'campo' }, el('span', {}, 'Cor'), cor),
    el('label', { class: 'campo' }, el('span', {}, 'Sentido de leitura'), sentido))
  const tipoEscolha = obra ? null : el('div', { class: 'linha-filtro', style: 'margin-bottom:14px' },
    ['livro', 'quadrinho'].map((t) => el('button', { type: 'button', class: 'filtro', 'aria-pressed': String(t === tipo), onclick: (e) => {
      tipo = t
      for (const b of e.target.parentNode.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b === e.target))
      pintarFormatos(); soQuadrinho.hidden = tipo !== 'quadrinho'
    } }, op.tipos[t])))
  soQuadrinho.hidden = tipo !== 'quadrinho'

  const salvarDados = async (ev) => {
    ev.preventDefault()
    const b = ev.submitter; b.disabled = true
    try {
      const r = await pedir('/publicacao', {
        id: obra?.id, tipo, titulo: titulo.value, formato: formato.value, generos: [...escolhidos], classificacao: classificacao.value,
        sinopse: sinopse.value, cor: cor.value, sentido: sentido.value, status_obra: status.value, autoria: autoria.checked,
      })
      if (!obra) { location.href = `/publicar.html?obra=${r.id}`; return }
      avisar('bom', 'Dados salvos.'); b.disabled = false
    } catch (e) { b.disabled = false; avisar('ruim', e.message) }
  }

  const secDados = el('form', { class: 'secao caixa', onsubmit: salvarDados },
    el('h2', {}, obra ? 'Dados da obra' : 'Nova obra'),
    tipoEscolha,
    el('label', { class: 'campo' }, el('span', {}, 'Título'), titulo),
    el('div', { class: 'duas' },
      el('label', { class: 'campo' }, el('span', {}, 'Formato'), formato),
      el('label', { class: 'campo' }, el('span', {}, 'Classificação indicativa'), classificacao)),
    soQuadrinho,
    el('div', { class: 'campo', style: 'margin-bottom:14px' }, el('span', { class: 'aut', style: 'display:block;margin-bottom:6px' }, 'Gêneros (até 4) — é por eles que a obra aparece nos filtros'), generos),
    el('label', { class: 'campo' }, el('span', {}, 'Sinopse'), sinopse),
    el('label', { class: 'campo' }, el('span', {}, 'Situação'), status),
    el('label', { class: 'chave', style: 'margin:6px 0 16px' }, autoria,
      el('span', {}, 'Declaro que sou autor(a) desta obra, ou que tenho autorização por escrito de quem é, e que ela segue as regras de publicação do Fio.')),
    el('button', { class: 'botao', disabled: !podeEscrever }, obra ? 'Salvar dados' : 'Criar obra'))

  if (!obra) {
    por(main, el('p', {}, el('a', { href: '/publicar.html', style: 'color:var(--tinta2);font-size:13px;text-decoration:none' }, '← suas obras')), saida, secDados, regras())
    return
  }

  // ── capa ──
  const arquivoCapa = el('input', { type: 'file', accept: TIPOS_IMG.join(',') })
  const secCapa = el('section', { class: 'secao caixa' }, el('h2', {}, 'Capa'),
    el('div', { class: 'capa-atual' },
      obra.capa ? el('img', { src: obra.capa, alt: 'capa atual' }) : el('div', { class: 'vazia-capa', style: 'width:140px;aspect-ratio:2/3;background:var(--linha);border-radius:6px' }),
      obra.capaPendente ? el('div', {}, el('div', { class: 'aut' }, 'capa nova, esperando revisão'), el('img', { src: obra.capaPendente, alt: 'capa nova' })) : null,
      el('div', { style: 'flex:1;min-width:220px' },
        el('p', { class: 'aut', style: 'margin-top:0' }, 'Imagem em pé, proporção perto de 2:3 (ex.: 800 × 1200 px), JPG, PNG ou WebP, até 3 MB.',
          obra.estado === 'publicada' ? ' Como a obra já está no ar, a capa nova só troca depois da revisão.' : ''),
        arquivoCapa, ' ',
        el('button', { class: 'botao fraco', type: 'button', disabled: !podeEscrever, onclick: async (e) => {
          const f = arquivoCapa.files[0]
          if (!f) return avisar('ruim', 'Escolha a imagem da capa.')
          if (!TIPOS_IMG.includes(f.type)) return avisar('ruim', 'Só JPG, PNG ou WebP.')
          if (f.size > 3 * MB) return avisar('ruim', 'A capa passa de 3 MB.')
          e.target.disabled = true
          try { await pedir(`/publicacao/imagem?id=${obra.id}&uso=capa`, null, { bruto: f }); location.reload() }
          catch (x) { e.target.disabled = false; avisar('ruim', x.message) }
        } }, 'Enviar capa'))))

  // ── capítulos ──
  const listaCaps = el('ul', { class: 'caps-ed' }, obra.partes.map((p) => el('li', {},
    el('span', { class: 'n' }, String(p.ordem)), el('span', {}, p.titulo), seloEstado(p.estado),
    p.motivo ? el('span', { class: 'aut', style: 'color:var(--acento)' }, p.motivo) : null,
    el('span', { class: 'aut' }, obra.tipo === 'livro' ? `${p.palavras.toLocaleString('pt-BR')} palavras` : `${p.paginas} páginas`),
    el('span', { class: 'acoes' },
      el('a', { class: 'botao fraco mini', href: `/publicacoes.html?id=${obra.id}&cap=${p.ordem}` }, 'ver'),
      el('button', { class: 'botao fraco mini', type: 'button', disabled: !podeEscrever, onclick: () => editorCapitulo(obra, p) }, 'editar'),
      el('button', { class: 'botao fraco mini', type: 'button', onclick: async () => {
        if (!confirm(`Apagar o capítulo "${p.titulo}"? Não tem volta.`)) return
        try { await pedir('/publicacao/parte/apagar', { publicacao: obra.id, id: p.id }); location.reload() } catch (x) { avisar('ruim', x.message) }
      } }, 'apagar')))))
  const areaCap = el('div')
  const secCaps = el('section', { class: 'secao caixa' }, el('h2', {}, 'Capítulos'),
    obra.partes.length ? listaCaps : el('p', { class: 'aut' }, 'Nenhum capítulo ainda.'),
    el('button', { class: 'botao fraco', type: 'button', disabled: !podeEscrever, onclick: () => editorCapitulo(obra, null) }, '+ Novo capítulo'),
    areaCap)

  function editorCapitulo(o, parte) {
    const tituloCap = el('input', { type: 'text', maxlength: '120', value: parte?.titulo ?? `Capítulo ${(o.partes.at(-1)?.ordem ?? 0) + 1}` })
    const lim = estudio.plano.limites
    let corpo, coletar
    if (o.tipo === 'livro') {
      const txt = el('textarea', { style: 'min-height:360px;font-family:Literata,Georgia,serif;font-size:16px', placeholder: 'Cole ou escreva o capítulo. Uma linha em branco separa parágrafos.' })
      const cont = el('div', { class: 'contador' })
      const contar = () => { cont.textContent = `${txt.value.length.toLocaleString('pt-BR')} de ${lim.caracteresPorParte.toLocaleString('pt-BR')} caracteres` }
      txt.addEventListener('input', contar)
      if (parte) pedir(`/publicacao/parte?id=${o.id}&ordem=${parte.ordem}`).then((r) => { txt.value = r.texto ?? ''; contar() }).catch(() => {})
      contar()
      corpo = el('div', {}, txt, cont)
      coletar = () => ({ texto: txt.value })
    } else {
      const paginas = [] // [{ arquivo, url }]
      const grade = el('div', { class: 'miniaturas' })
      const pintar = () => por(grade, ...paginas.map((p, i) => el('div', { class: 'mini' },
        el('img', { src: p.url, alt: `página ${i + 1}`, loading: 'lazy' }), el('span', { class: 'num' }, String(i + 1)),
        el('div', { class: 'bts' },
          el('button', { type: 'button', title: 'antes', onclick: () => { if (i > 0) { [paginas[i - 1], paginas[i]] = [paginas[i], paginas[i - 1]]; pintar() } } }, '←'),
          el('button', { type: 'button', title: 'tirar', onclick: () => { paginas.splice(i, 1); pintar() } }, '✕'),
          el('button', { type: 'button', title: 'depois', onclick: () => { if (i < paginas.length - 1) { [paginas[i + 1], paginas[i]] = [paginas[i], paginas[i + 1]]; pintar() } } }, '→')))))
      if (parte) pedir(`/publicacao/parte?id=${o.id}&ordem=${parte.ordem}`).then((r) => {
        for (const u of r.paginas ?? []) paginas.push({ arquivo: u.split('/').pop(), url: u }); pintar()
      }).catch(() => {})
      const escolher = el('input', { type: 'file', accept: TIPOS_IMG.join(','), multiple: true })
      const progresso = el('div', { class: 'aut' })
      escolher.addEventListener('change', async () => {
        // em ordem de nome, com número lido como número (2 antes de 10)
        const fs = [...escolher.files].sort((a, b) => a.name.localeCompare(b.name, 'pt', { numeric: true }))
        escolher.disabled = true
        let feitos = 0
        for (const f of fs) {
          if (paginas.length >= lim.paginasPorParte) { avisar('ruim', `Até ${lim.paginasPorParte} páginas por capítulo no seu plano.`); break }
          progresso.textContent = `enviando ${++feitos} de ${fs.length}: ${f.name}`
          if (!TIPOS_IMG.includes(f.type) || f.size > 5 * MB) { avisar('ruim', `${f.name}: só JPG, PNG ou WebP até 5 MB.`); continue }
          try { const r = await pedir(`/publicacao/imagem?id=${o.id}&uso=pagina`, null, { bruto: f }); paginas.push({ arquivo: r.arquivo, url: r.url }); pintar() }
          catch (x) { avisar('ruim', `${f.name}: ${x.message}`); if (x.status === 403 || x.status === 429) break }
        }
        progresso.textContent = paginas.length ? `${paginas.length} página(s) no capítulo. Confira a ordem e salve.` : ''
        escolher.value = ''; escolher.disabled = false
      })
      corpo = el('div', {}, el('p', { class: 'aut' }, 'Escolha as páginas (pode escolher várias de uma vez; entram em ordem de nome do arquivo).'), escolher, progresso, grade)
      coletar = () => ({ paginas: paginas.map((p) => p.arquivo) })
    }
    por(areaCap, el('form', { class: 'caixa', style: 'margin-top:16px;background:var(--papel)', onsubmit: async (ev) => {
      ev.preventDefault()
      const b = ev.submitter; b.disabled = true
      try { await pedir('/publicacao/parte', { publicacao: o.id, id: parte?.id, titulo: tituloCap.value, ...coletar() }); location.reload() }
      catch (x) { b.disabled = false; avisar('ruim', x.message) }
    } },
    el('h3', { style: 'margin-top:0' }, parte ? `Editando: ${parte.titulo}` : 'Novo capítulo'),
    parte && parte.estado === 'publicada' ? el('p', { class: 'aut' }, 'Salvar uma edição tira este capítulo do ar até a revisão aprovar de novo.') : null,
    el('label', { class: 'campo' }, el('span', {}, 'Título do capítulo'), tituloCap),
    corpo,
    el('div', { style: 'margin-top:12px;display:flex;gap:8px' },
      el('button', { class: 'botao' }, 'Salvar capítulo'),
      el('button', { class: 'botao fraco', type: 'button', onclick: () => por(areaCap) }, 'Cancelar'))))
    areaCap.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  // ── enviar ──
  const pessoa = await eu()
  const pendentes = obra.partes.filter((p) => p.estado === 'rascunho' || p.estado === 'recusada').length
  const secEnviar = el('section', { class: 'secao caixa' }, el('h2', {}, pessoa?.papel === 'admin' ? 'Publicar' : 'Enviar para revisão'),
    el('p', { class: 'aut' }, pessoa?.papel === 'admin'
      ? 'Conta da administração publica direto, sem revisão.'
      : obra.estado === 'publicada'
        ? `A obra está no ar. ${pendentes ? `${pendentes} capítulo(s) novo(s) ou editado(s) esperando envio.` : 'Nada novo para enviar.'}`
        : 'A administração confere se a obra segue as regras. Você recebe um aviso na central quando for aprovada — ou o motivo, se não for.'),
    el('button', { class: 'botao', type: 'button', disabled: !podeEscrever || obra.estado === 'suspensa', onclick: async (e) => {
      e.target.disabled = true
      try { const r = await pedir('/publicacao/enviar', { id: obra.id }); avisar('bom', r.estado === 'publicada' ? 'Publicado.' : 'Enviado para revisão.'); setTimeout(() => location.reload(), 900) }
      catch (x) { e.target.disabled = false; avisar('ruim', x.message) }
    } }, pessoa?.papel === 'admin' ? 'Publicar agora' : 'Enviar para revisão'),
    ' ',
    el('button', { class: 'botao fraco', type: 'button', onclick: async () => {
      if (!confirm(`Apagar "${obra.titulo}" inteira, com capítulos e imagens? Não tem volta.`)) return
      try { await pedir('/publicacao/apagar', { id: obra.id }); location.href = '/publicar.html' } catch (x) { avisar('ruim', x.message) }
    } }, 'Apagar obra'))

  por(main, 
    el('p', {}, el('a', { href: '/publicar.html', style: 'color:var(--tinta2);font-size:13px;text-decoration:none' }, '← suas obras'), '  ·  ',
      el('a', { href: `/publicacoes.html?id=${obra.id}`, style: 'color:var(--tinta2);font-size:13px' }, 'ver como leitor')),
    el('h1', {}, obra.titulo),
    el('div', { class: 'selos' }, seloEstado(obra.estado), obra.motivo ? el('span', { class: 'aut', style: 'color:var(--acento)' }, obra.motivo) : null),
    saida, secEnviar, secCapa, secCaps, secDados, regras())
}

iniciar()
