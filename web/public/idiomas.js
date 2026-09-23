const main = document.getElementById('main')
let CURSO_ATUAL = null

const SAUDACOES = {
  espanhol:  { s: '¡Bienvenido!', f: 'Aprender español es abrir una puerta al mundo.' },
  frances:   { s: 'Bienvenue !', f: "Apprendre le français, c'est découvrir une nouvelle façon de penser." },
  ingles:    { s: 'Welcome!', f: 'Learning English opens doors everywhere.' },
  japones:   { s: 'ようこそ！', f: '日本語を学ぶことは冒険です。' },
  alemao:    { s: 'Willkommen!', f: 'Deutsch zu lernen ist eine Reise wert.' },
  russo:     { s: 'Добро пожаловать!', f: 'Русский язык — ключ к великой культуре.' },
  italiano:  { s: 'Benvenuto!', f: "Imparare l'italiano è scoprire la bellezza." },
}

const CODIGO_VOZ = {
  espanhol: 'es-MX', frances: 'fr-FR', ingles: 'en-US',
  japones: 'ja-JP', alemao: 'de-DE', russo: 'ru-RU', italiano: 'it-IT',
}

async function iniciar() {
  const pessoa = await eu()
  if (!pessoa) {
    por(main,
      el('h1', {}, 'Idiomas'),
      el('p', { class: 'sub' }, 'Uma área para aprender línguas do zero — francês, espanhol, japonês e mais. Entre para ver.'),
      el('a', { class: 'botao', href: '/#/entrar' }, 'Entrar ou criar conta'))
    return
  }
  window.fioDono?.conferir(pessoa.id)
  let lista
  try { ({ idiomas: lista } = await pedir('/idiomas')) } catch (e) { por(main, recado('ruim', e.message)); return }
  addEventListener('hashchange', () => roteador(lista))
  roteador(lista)
}

function roteador(lista) {
  const partes = location.hash.replace(/^#\/?/, '').split('/')
  const chave = partes[0]
  const secao = partes[1] || ''
  const detalhe = partes.slice(2).join('/')
  if (chave && lista.some((i) => i.chave === chave)) {
    abrirIdioma(chave, secao, detalhe)
  } else {
    CURSO_ATUAL = null
    desenharGrade(lista)
  }
}

function desenharGrade(lista) {
  const PROF = { completo: 'curso completo', basico: 'o básico — mais chegando' }
  por(main,
    el('div', { class: 'topo-idiomas' },
      el('div', {},
        el('h1', {}, 'Idiomas'),
        el('p', { class: 'sub', style: 'margin:0' }, 'Aulas, gramática, diálogos, flashcards, música e quiz — para aprender de verdade.')),
      el('span', { class: 'selo-tear' }, '✦ plano Tear')),
    el('div', { class: 'grade-idiomas' }, lista.map((i) => el('button', {
      class: 'cartao-idioma', type: 'button',
      onclick: () => { location.hash = `#/${i.chave}` },
    },
      el('span', { class: 'bandeira', 'aria-hidden': 'true' }, i.bandeira),
      el('h3', {}, i.nome),
      el('span', { class: 'prof' }, `${PROF[i.profundidade] ?? i.profundidade} · ${i.unidades} unidades`)))))
}

async function abrirIdioma(chave, secao, detalhe) {
  if (!CURSO_ATUAL || CURSO_ATUAL.chave !== chave) {
    por(main, el('p', { class: 'sub' }, 'Abrindo…'))
    let resposta
    try {
      resposta = await pedir(`/idiomas/${chave}`)
    } catch (e) {
      if (e.status === 402) { desenharBloqueio(chave); return }
      por(main, recado('ruim', e.message)); return
    }
    CURSO_ATUAL = { chave, ...resposta }
  }
  desenharSecoes(secao, detalhe)
}

function desenharBloqueio(chave) {
  por(main,
    el('div', { class: 'bloqueio' },
      el('div', { class: 'bandeiras' }, '🇫🇷 🇪🇸 🇯🇵'),
      el('h1', {}, 'Isso é do plano Tear'),
      el('p', { class: 'sub', style: 'max-width:52ch;margin-left:auto;margin-right:auto' },
        'O estudo de idiomas — aulas do zero, quiz, repetição espaçada, canção e voz — é uma área do plano Tear, para quem estuda pesado.'),
      el('a', { class: 'botao', href: '/assinaturas.html?por=idiomas' }, 'Ver os planos'),
      el('div', {}, el('a', { href: '#/', style: 'font-size:13px;color:var(--tinta2);margin-top:14px;display:inline-block' }, '← voltar'))))
}

// ── navegacao por secoes ──

const SECOES = [
  { id: '',           label: '🏠 Painel' },
  { id: 'curso',      label: '📚 Curso' },
  { id: 'musica',     label: '🎵 Estúdio Musical' },
  { id: 'dicionario', label: '💬 Tradutor' },
]

function desenharSecoes(secao, detalhe) {
  const { curso } = CURSO_ATUAL
  const saud = SAUDACOES[CURSO_ATUAL.chave] || {}

  const navBtns = el('div', { class: 'secao-nav' },
    SECOES.map((s) => el('button', {
      class: 'secao-btn' + (s.id === secao ? ' ativa' : ''),
      type: 'button',
      onclick: () => {
        const base = `#/${CURSO_ATUAL.chave}`
        location.hash = s.id ? `${base}/${s.id}` : base
      },
    }, s.label)))

  const conteudo = el('div', { class: 'secao-conteudo' })

  por(main,
    el('div', { class: 'topo-idioma' },
      el('a', { href: '#/', class: 'voltar-link' }, '← todos os idiomas'),
      el('div', { class: 'idioma-hero' },
        el('span', { class: 'idioma-bandeira' }, curso.bandeira),
        el('div', {},
          el('h1', { style: 'margin:0' }, curso.nome),
          saud.s ? el('p', { class: 'saudacao-nativa' }, `${saud.s} ${saud.f}`) : null))),
    navBtns,
    conteudo)

  if (secao === 'curso') desenharCurso(conteudo, detalhe)
  else if (secao === 'musica') desenharEstudioMusical(conteudo, detalhe)
  else if (secao === 'dicionario') desenharTradutor(conteudo)
  else desenharPainelPrincipal(conteudo)
}

// ── painel principal (dashboard) ──

function desenharPainelPrincipal(alvo) {
  const { curso, progresso, revisao } = CURSO_ATUAL
  const feitas = Object.keys(progresso).length
  const totalU = curso.unidades.length
  const totalV = curso.unidades.reduce((s, u) => s + (u.vocabulario?.length || 0), 0)
  const musicas = coletarMusicas()
  const primeiraNaoFeita = curso.unidades.find((u) => !progresso[u.chave])

  por(alvo,
    el('div', { class: 'painel-stats' },
      el('div', { class: 'stat' },
        el('div', { class: 'stat-num' }, `${feitas}/${totalU}`),
        el('div', { class: 'stat-label' }, 'unidades')),
      el('div', { class: 'stat' },
        el('div', { class: 'stat-num' }, String(totalV)),
        el('div', { class: 'stat-label' }, 'palavras')),
      el('div', { class: 'stat' },
        el('div', { class: 'stat-num' }, String(musicas.length)),
        el('div', { class: 'stat-label' }, 'músicas')),
      el('div', { class: 'stat' },
        el('div', { class: 'stat-num' }, String(revisao.length)),
        el('div', { class: 'stat-label' }, 'para revisar'))),

    el('div', { class: 'painel-acoes' },
      primeiraNaoFeita
        ? el('button', { class: 'botao', type: 'button', onclick: () => {
            location.hash = `#/${CURSO_ATUAL.chave}/curso/${primeiraNaoFeita.chave}`
          } }, `▶ Continuar: ${primeiraNaoFeita.titulo}`)
        : el('button', { class: 'botao', type: 'button', onclick: () => {
            location.hash = `#/${CURSO_ATUAL.chave}/curso`
          } }, '▶ Rever o curso'),
      revisao.length
        ? el('button', { class: 'botao fraco', type: 'button', onclick: () => {
            location.hash = `#/${CURSO_ATUAL.chave}/curso`
            setTimeout(iniciarRevisao, 100)
          } }, `🔁 Revisar (${revisao.length})`)
        : null),

    el('div', { class: 'painel-secoes' },
      el('button', { class: 'painel-card', type: 'button', onclick: () => { location.hash = `#/${CURSO_ATUAL.chave}/musica` } },
        el('span', { class: 'painel-card-ico' }, '🎵'),
        el('div', {},
          el('h3', {}, 'Estúdio Musical'),
          el('p', {}, `${musicas.length} músicas para estudar estrofe por estrofe`))),
      el('button', { class: 'painel-card', type: 'button', onclick: () => { location.hash = `#/${CURSO_ATUAL.chave}/dicionario` } },
        el('span', { class: 'painel-card-ico' }, '💬'),
        el('div', {},
          el('h3', {}, 'Tradutor'),
          el('p', {}, 'Traduz e tira dúvidas no idioma')))))
}

// ── curso (unidades em abas horizontais) ──

function desenharCurso(alvo, unidadeChave) {
  const { curso, progresso } = CURSO_ATUAL
  const unidade = (unidadeChave && curso.unidades.find((u) => u.chave === unidadeChave))
    || curso.unidades.find((u) => !progresso[u.chave])
    || curso.unidades[0]

  const listaUnidades = el('div', { class: 'unidades-tabs', role: 'tablist' },
    curso.unidades.map((u, i) => el('button', {
      class: 'unidade-tab' + (u.chave === unidade.chave ? ' ativa' : '') + (progresso[u.chave] ? ' feita' : ''),
      type: 'button', role: 'tab',
      onclick: () => { location.hash = `#/${CURSO_ATUAL.chave}/curso/${u.chave}` },
    },
      el('span', { class: 'tab-num' }, progresso[u.chave] ? '✓' : String(i + 1)),
      el('span', { class: 'tab-titulo' }, u.titulo))))

  const painel = el('div', { class: 'licao' })
  por(alvo, listaUnidades, painel)
  desenharPainelUnidade(painel, unidade)
}

// ── painel com abas ──

function desenharPainelUnidade(painel, unidade) {
  const temMusica = unidade.cancao || unidade.musicas?.length || unidade.musicaAtual
  const temQuiz = unidade.quiz?.length
  const temVocab = unidade.vocabulario?.length

  const abas = [
    { id: 'aprender', label: '📖 Aprender' },
    temVocab ? { id: 'praticar', label: '🃏 Praticar' } : null,
    temMusica ? { id: 'musica', label: '🎵 Música' } : null,
    temQuiz ? { id: 'quiz', label: '✍️ Quiz' } : null,
  ].filter(Boolean)

  const paineis = {}
  let abaAtiva = abas[0].id

  const botoesAbas = el('div', { class: 'abas', role: 'tablist' },
    abas.map((a) => el('button', {
      class: 'aba' + (a.id === abaAtiva ? ' ativa' : ''),
      type: 'button', role: 'tab',
      onclick: () => ativarAba(a.id),
    }, a.label)))

  function ativarAba(id) {
    abaAtiva = id
    botoesAbas.querySelectorAll('.aba').forEach((btn, i) => {
      btn.classList.toggle('ativa', abas[i].id === id)
    })
    for (const [key, div] of Object.entries(paineis)) {
      div.classList.toggle('visivel', key === id)
    }
  }

  abas.forEach((a) => {
    const div = el('div', { class: 'conteudo-aba' + (a.id === abaAtiva ? ' visivel' : ''), role: 'tabpanel' })
    paineis[a.id] = div
  })

  por(painel, botoesAbas, ...Object.values(paineis))

  desenharAbaAprender(paineis.aprender, unidade)
  if (paineis.praticar) desenharAbaPraticar(paineis.praticar, unidade)
  if (paineis.musica) desenharAbaMusica(paineis.musica, unidade)
  if (paineis.quiz) desenharAbaQuiz(paineis.quiz, unidade)
}

// ── aba Aprender ──

function desenharAbaAprender(alvo, unidade) {
  const blocos = [
    el('div', { class: 'bloco' },
      el('h2', {}, unidade.titulo),
      unidade.tema ? el('p', { class: 'sub', style: 'margin:0' }, unidade.tema) : null,
      unidade.nivel ? el('span', { class: 'nivel-tag' }, unidade.nivel) : null),
  ]

  if (unidade.vocabulario?.length) {
    blocos.push(el('div', { class: 'bloco' },
      el('div', { class: 'bloco-titulo' }, el('span', { class: 'ico' }, '📝'), el('h2', { style: 'margin:0' }, 'Vocabulário')),
      el('div', { class: 'vocab' }, unidade.vocabulario.map((v) => el('div', { class: 'palavra' },
        el('button', { class: 'fala', type: 'button', title: 'Ouvir', onclick: () => falar(limparParaVoz(v.palavra), CURSO_ATUAL.curso.voz) }, '🔊'),
        el('div', { class: 'txt' },
          el('div', { class: 'orig' }, v.palavra),
          el('div', { class: 'trad' }, v.traducao),
          v.exemplo ? el('div', { class: 'exemplo' }, `${v.exemplo}${v.exemploTraducao ? ' — ' + v.exemploTraducao : ''}`) : null))))))
  }

  if (unidade.gramatica) {
    const g = unidade.gramatica
    blocos.push(el('div', { class: 'bloco' },
      el('div', { class: 'bloco-titulo' }, el('span', { class: 'ico' }, '📐'), el('h2', { style: 'margin:0' }, g.titulo || 'Gramática')),
      el('div', { class: 'gramatica' },
        g.explicacao ? el('p', { class: 'gramatica-explicacao' }, g.explicacao) : null,
        g.exemplos?.length ? el('div', { class: 'gramatica-exemplos' },
          g.exemplos.map((ex) => el('div', { class: 'gramatica-ex' },
            el('div', { class: 'frase' }, ex.frase),
            el('div', { class: 'trad' }, ex.traducao)))) : null)))
  }

  if (unidade.dialogo) {
    const d = unidade.dialogo
    blocos.push(el('div', { class: 'bloco' },
      el('div', { class: 'bloco-titulo' }, el('span', { class: 'ico' }, '💬'), el('h2', { style: 'margin:0' }, 'Diálogo')),
      d.situacao ? el('p', { class: 'dialogo-situacao' }, d.situacao) : null,
      el('div', { class: 'dialogo' },
        d.falas.map((f) => {
          const ehB = f.quem === 'B'
          const trad = el('div', { class: 'fala-trad', style: 'display:none' }, f.traducao)
          const bolha = el('div', { class: `fala-bolha ${ehB ? 'b' : 'a'}`, onclick: () => {
            trad.style.display = trad.style.display === 'none' ? 'block' : 'none'
          } },
            el('div', {}, f.fala), trad)
          return el('div', { class: `fala-linha${ehB ? ' dir' : ''}` },
            el('div', { class: `fala-avatar ${ehB ? 'b' : 'a'}` }, f.quem), bolha)
        }))))
  }

  if (unidade.expressoes?.length) {
    blocos.push(el('div', { class: 'bloco' },
      el('div', { class: 'bloco-titulo' }, el('span', { class: 'ico' }, '💎'), el('h2', { style: 'margin:0' }, 'Expressões')),
      el('div', { class: 'expressoes' },
        unidade.expressoes.map((e) => el('div', { class: 'expressao-item' },
          el('div', { class: 'expressao-frase' }, e.expressao),
          el('div', { class: 'expressao-sig' }, e.significado),
          e.uso ? el('div', { class: 'expressao-uso' }, e.uso) : null)))))
  }

  if (unidade.cultura) {
    blocos.push(el('div', { class: 'bloco' },
      el('div', { class: 'bloco-titulo' }, el('span', { class: 'ico' }, '🌍'), el('h2', { style: 'margin:0' }, 'Cultura')),
      el('div', { class: 'cultura-nota' }, unidade.cultura)))
  }

  if (unidade.associacao) {
    blocos.push(el('div', { class: 'bloco' }, el('div', { class: 'assoc' }, el('b', {}, '💡 Associação — '), unidade.associacao)))
  }
  if (unidade.dica) {
    blocos.push(el('div', { class: 'bloco' }, el('div', { class: 'dica' }, el('b', {}, '✎ Dica — '), unidade.dica)))
  }

  por(alvo, blocos)
}

// ── aba Praticar (flashcards) ──

function desenharAbaPraticar(alvo, unidade) {
  const vocab = [...(unidade.vocabulario || [])]
  if (!vocab.length) return

  let indice = 0, acertos = 0, total = vocab.length, virada = false

  function embaralhar() {
    for (let i = vocab.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [vocab[i], vocab[j]] = [vocab[j], vocab[i]]
    }
    indice = 0; acertos = 0; virada = false; desenharCard()
  }

  const progresso = el('div', { class: 'flashcard-progresso' })
  const cardContainer = el('div', { class: 'flashcard-container' })
  const acoes = el('div')

  por(alvo, el('div', { class: 'flashcards-area' },
    el('div', { class: 'flashcard-header' },
      el('h3', {}, '🃏 Flashcards'),
      el('button', { class: 'flashcard-embaralhar', type: 'button', onclick: embaralhar }, '🔀 Embaralhar')),
    el('p', { class: 'sub', style: 'margin:0 0 8px;text-align:center' }, 'Toque no cartão para revelar a tradução.'),
    progresso, cardContainer, acoes))

  function desenharCard() {
    if (indice >= total) {
      const pct = Math.round((acertos / total) * 100)
      por(progresso)
      por(cardContainer, el('div', { class: 'flashcard-resumo' },
        el('div', { class: 'nota' }, `${pct}%`),
        el('div', { class: 'resumo-txt' }, `${acertos} de ${total} acertos`),
        el('div', { class: 'resumo-msg' }, pct >= 80 ? 'Excelente! Você domina esse vocabulário.' : pct >= 50 ? 'Bom progresso. Revise as que errou.' : 'Continue praticando — a repetição faz o domínio.'),
        el('button', { class: 'botao mini', style: 'margin-top:14px', type: 'button', onclick: () => { indice = 0; acertos = 0; desenharCard() } }, 'Recomecar')))
      por(acoes)
      return
    }
    virada = false
    const v = vocab[indice]
    const pct = Math.round((indice / total) * 100)
    por(progresso,
      el('span', { class: 'progresso-txt' }, `${indice + 1} de ${total}`),
      el('div', { class: 'flashcard-barra' }, el('i', { style: `width:${pct}%` })))

    const card = el('div', { class: 'flashcard', onclick: () => {
      if (!virada) { virada = true; card.classList.add('virada') }
    } },
      el('div', { class: 'flashcard-inner' },
        el('div', { class: 'flashcard-face flashcard-frente' },
          el('button', { class: 'fala card-fala', type: 'button', onclick: (ev) => { ev.stopPropagation(); falar(limparParaVoz(v.palavra), CURSO_ATUAL.curso.voz) } }, '🔊'),
          el('div', { class: 'flashcard-palavra' }, v.palavra),
          el('div', { class: 'flashcard-instrucao' }, 'toque para revelar')),
        el('div', { class: 'flashcard-face flashcard-verso' },
          el('div', { class: 'flashcard-traducao' }, v.traducao),
          v.exemplo ? el('div', { class: 'flashcard-exemplo' }, v.exemplo) : null)))
    por(cardContainer, card)

    por(acoes, el('div', { class: 'flashcard-acoes' },
      el('button', { class: 'nao-sei', type: 'button', onclick: () => { indice++; desenharCard() } }, '✗ Não sei'),
      el('button', { class: 'sei', type: 'button', onclick: () => { acertos++; indice++; desenharCard() } }, '✓ Sei')))
  }
  desenharCard()
}

// ── aba Musica (dentro da unidade) ──

function desenharAbaMusica(alvo, unidade) {
  const blocos = []

  if (unidade.cancao) {
    const c = unidade.cancao
    blocos.push(el('div', { class: 'bloco' },
      el('div', { class: 'bloco-titulo' }, el('span', { class: 'ico' }, '🎵'), el('h2', { style: 'margin:0' }, c.titulo)),
      el('p', { class: 'sub', style: 'margin:0 0 10px' }, `${c.autor} · domínio público`),
      el('button', { class: 'botao mini fraco', type: 'button', onclick: () => falar(c.letra.replace(/\n/g, '. '), CURSO_ATUAL.curso.voz) }, '🔊 ouvir a letra'),
      el('p', { class: 'cancao-letra', style: 'margin-top:12px' }, c.letra)))
  }

  const musicas = unidade.musicas || (unidade.musicaAtual ? [unidade.musicaAtual] : [])
  for (const m of musicas) {
    const idx = coletarMusicas().findIndex((x) => x.titulo === m.titulo && x.artista === m.artista)
    blocos.push(el('div', { class: 'bloco' },
      el('div', { class: 'bloco-titulo' }, el('span', { class: 'ico' }, '🎧'), el('h2', { style: 'margin:0' }, m.titulo || 'Para praticar ouvindo')),
      el('p', { class: 'sub', style: 'margin:0 0 10px' }, `${m.titulo} — ${m.artista}`),
      ytThumb(m.youtubeId, m.titulo),
      m.trechoLetra ? el('div', { class: 'musica-trecho' },
        el('div', { class: 'original' }, m.trechoLetra),
        m.traducaoTrecho ? el('div', { class: 'traducao-trecho' }, m.traducaoTrecho) : null) : null,
      idx >= 0 ? el('button', {
        class: 'botao mini', style: 'margin-top:10px', type: 'button',
        onclick: () => { location.hash = `#/${CURSO_ATUAL.chave}/musica/${idx}` },
      }, '🎵 Estudar esta música estrofe por estrofe') : null))
  }

  if (!blocos.length) {
    blocos.push(el('div', { class: 'bloco' }, el('p', { class: 'sub' }, 'Nenhuma música nesta unidade.')))
  }
  por(alvo, blocos)
}

// ── aba Quiz ──

function desenharAbaQuiz(alvo, unidade) {
  const quizContainer = el('div')
  por(alvo, el('div', { class: 'bloco quiz-bloco' },
    el('div', { class: 'bloco-titulo' }, el('span', { class: 'ico' }, '✍️'), el('h2', { style: 'margin:0' }, 'Quiz')),
    el('p', { class: 'sub', style: 'margin:0 0 10px' }, 'Responda para fixar e alimentar sua revisão espaçada.'),
    quizContainer))
  if (unidade.quiz?.length) iniciarQuiz(unidade, quizContainer)
}

// ── estudio musical ──

function coletarMusicas() {
  if (!CURSO_ATUAL) return []
  const todas = []
  for (const u of CURSO_ATUAL.curso.unidades) {
    const ms = u.musicas || (u.musicaAtual ? [u.musicaAtual] : [])
    for (const m of ms) todas.push({ ...m, _unidade: u.titulo })
  }
  return todas
}

function desenharEstudioMusical(alvo, detalhe) {
  const musicas = coletarMusicas()
  if (detalhe && musicas[Number(detalhe)]) {
    desenharEstudoMusica(alvo, musicas[Number(detalhe)], Number(detalhe), musicas.length)
    return
  }

  por(alvo,
    el('div', { class: 'bloco', style: 'border:none;background:none;padding:0' },
      el('h2', { style: 'margin-bottom:4px' }, '🎵 Estúdio Musical'),
      el('p', { class: 'sub', style: 'margin:0 0 20px' }, 'Estude cada música estrofe por estrofe. Aprenda palavras, significados e pronúncia.')),
    el('div', { class: 'grade-musicas' },
      musicas.map((m, i) => el('button', {
        class: 'cartao-musica', type: 'button',
        onclick: () => { location.hash = `#/${CURSO_ATUAL.chave}/musica/${i}` },
      },
        m.youtubeId
          ? el('img', { class: 'thumb-musica', src: `https://img.youtube.com/vi/${m.youtubeId}/mqdefault.jpg`, alt: '', loading: 'lazy' })
          : el('div', { class: 'thumb-musica placeholder' }, '🎵'),
        el('div', { class: 'info-musica' },
          el('div', { class: 'titulo-musica' }, m.titulo),
          el('div', { class: 'artista-musica' }, m.artista),
          el('div', { class: 'unidade-musica' }, m._unidade))))))
}

function desenharEstudoMusica(alvo, musica, idx, total) {
  const estrofes = musica.frases || []

  const nav = el('div', { class: 'estudo-musica-nav' },
    idx > 0 ? el('button', { class: 'botao mini fraco', type: 'button', onclick: () => {
      location.hash = `#/${CURSO_ATUAL.chave}/musica/${idx - 1}`
    } }, '← Anterior') : el('span'),
    el('span', { class: 'sub' }, `${idx + 1} de ${total}`),
    idx < total - 1 ? el('button', { class: 'botao mini fraco', type: 'button', onclick: () => {
      location.hash = `#/${CURSO_ATUAL.chave}/musica/${idx + 1}`
    } }, 'Próxima →') : el('span'))

  const playerEl = musica.youtubeId
    ? el('div', { class: 'yt-player-wrap' },
        el('iframe', {
          class: 'yt-player',
          src: `https://www.youtube-nocookie.com/embed/${musica.youtubeId}?rel=0`,
          allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
          allowfullscreen: '', loading: 'lazy', frameborder: '0',
          title: musica.titulo,
        }))
    : el('a', {
        class: 'yt-thumb-busca botao mini fraco',
        href: `https://www.youtube.com/results?search_query=${encodeURIComponent(musica.titulo + ' ' + musica.artista)}`,
        target: '_blank', rel: 'noopener',
      }, '🔎 Procurar no YouTube')

  const header = el('div', { class: 'bloco estudo-musica-header' },
    el('h2', { style: 'margin:0 0 4px' }, musica.titulo),
    el('p', { class: 'sub', style: 'margin:0 0 14px' }, musica.artista),
    playerEl)

  const estrofesEl = el('div', { class: 'bloco estudo-estrofes' },
    el('h2', { style: 'margin:0 0 4px' }, 'Estrofe por estrofe'),
    el('p', { class: 'sub', style: 'margin:0 0 18px' }, 'Toque em cada estrofe para ver a tradução e o significado de cada palavra.'),
    estrofes.length
      ? el('div', { class: 'lista-estrofes' }, estrofes.map((e, i) => criarEstrofe(e, i + 1)))
      : el('p', { class: 'sub' }, 'Letra ainda não disponível para estudo.'))

  por(alvo,
    el('button', { class: 'voltar-estudio', type: 'button', onclick: () => {
      location.hash = `#/${CURSO_ATUAL.chave}/musica`
    } }, '← Voltar ao estúdio'),
    header, estrofesEl, nav)
}

function criarEstrofe(estrofe, num) {
  const detalhe = el('div', { class: 'estrofe-detalhe', style: 'display:none' })
  const item = el('div', { class: 'estrofe-item' })

  const cabecalho = el('div', { class: 'estrofe-cabecalho', onclick: () => {
    const aberto = detalhe.style.display !== 'none'
    detalhe.style.display = aberto ? 'none' : 'block'
    item.classList.toggle('aberta', !aberto)
  } },
    el('div', { class: 'estrofe-num' }, `Estrofe ${num}`),
    el('div', { class: 'estrofe-original' },
      el('button', { class: 'fala mini', type: 'button', title: 'Ouvir estrofe', onclick: (ev) => {
        ev.stopPropagation()
        falar(limparParaVoz(estrofe.original), CURSO_ATUAL.curso.voz)
      } }, '🔊'),
      el('span', {}, estrofe.original)))

  const detalhes = []
  if (estrofe.traducao) {
    detalhes.push(el('div', { class: 'estrofe-trad' },
      el('strong', {}, 'Tradução: '),
      estrofe.traducao))
  }
  if (estrofe.vocabulario?.length) {
    detalhes.push(el('div', { class: 'estrofe-vocab' },
      el('h4', {}, 'Palavra por palavra'),
      estrofe.vocabulario.map((v) => el('div', { class: 'vocab-item' },
        el('button', { class: 'fala mini', type: 'button', onclick: () => falar(limparParaVoz(v.palavra), CURSO_ATUAL.curso.voz) }, '🔊'),
        el('div', { class: 'vocab-info' },
          el('div', { class: 'vocab-palavra' }, v.palavra),
          el('div', { class: 'vocab-sig' }, v.significado),
          v.detalhe ? el('div', { class: 'vocab-detalhe' }, v.detalhe) : null,
          v.sinonimos ? el('div', { class: 'vocab-sin' }, `Sinônimos: ${v.sinonimos}`) : null)))))
  }
  if (estrofe.pronuncia) {
    detalhes.push(el('div', { class: 'estrofe-pron' },
      el('strong', {}, '🗣️ Pronúncia: '),
      el('span', {}, estrofe.pronuncia),
      el('button', { class: 'fala mini', style: 'margin-left:8px', type: 'button', onclick: () => falar(limparParaVoz(estrofe.original), CURSO_ATUAL.curso.voz) }, '🔊')))
  }
  if (!detalhes.length) {
    detalhes.push(el('div', { class: 'estrofe-trad sub' }, '(toque no alto-falante para ouvir a estrofe)'))
  }
  por(detalhe, detalhes)
  item.append(cabecalho, detalhe)
  return item
}

function ytThumb(ytId, titulo) {
  if (!ytId) return el('a', {
    class: 'yt-thumb-busca botao mini fraco',
    href: `https://www.youtube.com/results?search_query=${encodeURIComponent(titulo)}`,
    target: '_blank', rel: 'noopener',
  }, '🔎 Procurar no YouTube')
  return el('a', {
    class: 'yt-thumb', href: `https://www.youtube.com/watch?v=${ytId}`,
    target: '_blank', rel: 'noopener', title: `Assistir "${titulo}" no YouTube`,
  },
    el('img', { src: `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`, alt: titulo, loading: 'lazy' }),
    el('div', { class: 'yt-play' }, '▶'))
}

// ── tradutor ──

function coletarVocabulario() {
  if (!CURSO_ATUAL) return []
  const todo = []
  for (const u of CURSO_ATUAL.curso.unidades) {
    for (const v of (u.vocabulario || [])) {
      todo.push({ ...v, _unidade: u.titulo })
    }
  }
  return todo
}

function desenharTradutor(alvo) {
  const vocab = coletarVocabulario()
  const idioma = CURSO_ATUAL.curso.nome
  const chave = CURSO_ATUAL.chave
  const codigoGt = { espanhol: 'es', frances: 'fr', ingles: 'en', japones: 'ja', alemao: 'de', russo: 'ru', italiano: 'it' }
  const tl = codigoGt[chave] || 'en'

  const campo = el('input', {
    type: 'search', class: 'busca-dicionario',
    placeholder: `Digite em português ou ${idioma.toLowerCase()}…`,
    autocomplete: 'off', spellcheck: 'false',
  })
  const resultados = el('div', { class: 'resultados-busca' })

  function buscar() {
    const q = campo.value.trim().toLowerCase()
    if (!q) {
      por(resultados,
        el('p', { class: 'sub' }, `Digite uma palavra ou frase para traduzir.`),
        el('p', { class: 'sub', style: 'margin-top:8px' }, `${vocab.length} palavras do curso disponíveis para consulta rápida.`))
      return
    }
    const norm = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    const achados = vocab.filter((v) =>
      norm(v.palavra).includes(norm(q)) || norm(v.traducao).includes(norm(q)) ||
      (v.exemplo && norm(v.exemplo).includes(norm(q))))

    const gtUrl = `https://translate.google.com/?sl=auto&tl=${tl}&text=${encodeURIComponent(q)}`
    const gtUrlPt = `https://translate.google.com/?sl=${tl}&tl=pt&text=${encodeURIComponent(q)}`

    const itens = []
    itens.push(el('div', { class: 'tradutor-acoes' },
      el('a', { class: 'botao mini', href: gtUrlPt, target: '_blank', rel: 'noopener' },
        `🌐 Traduzir para português`),
      el('a', { class: 'botao mini fraco', href: gtUrl, target: '_blank', rel: 'noopener' },
        `🌐 Traduzir para ${idioma.toLowerCase()}`)))

    if (achados.length) {
      itens.push(el('div', { class: 'tradutor-local' },
        el('h4', { style: 'margin:0 0 10px' }, `Do curso de ${idioma}:`),
        achados.map((v) => el('div', { class: 'resultado-item' },
          el('button', { class: 'fala mini', type: 'button', onclick: () => falar(limparParaVoz(v.palavra), CURSO_ATUAL.curso.voz) }, '🔊'),
          el('div', {},
            el('div', { class: 'orig' }, v.palavra),
            el('div', { class: 'trad' }, v.traducao),
            v.exemplo ? el('div', { class: 'exemplo' }, v.exemplo) : null,
            el('div', { class: 'unid-tag' }, v._unidade))))))
    }
    por(resultados, itens)
  }

  campo.addEventListener('input', buscar)

  por(alvo,
    el('div', { class: 'bloco', style: 'border:none;background:none;padding:0' },
      el('h2', { style: 'margin-bottom:4px' }, `💬 Tradutor de ${idioma}`),
      el('p', { class: 'sub', style: 'margin:0 0 16px' }, `Busque qualquer palavra ou frase — traduz direto pelo Google Translate e mostra o que o curso já ensinou.`)),
    el('div', { class: 'bloco' }, campo),
    resultados)

  buscar()
}

// ── quiz ──

function iniciarQuiz(unidade, alvo) {
  let indice = 0, acertos = 0
  const total = unidade.quiz.length

  const placar = el('div', { class: 'quiz-placar' },
    el('div', { class: 'quiz-progresso-bar' },
      el('div', { class: 'quiz-progresso-fill', id: 'quiz-fill' })),
    el('span', { class: 'quiz-status' },
      el('span', {}, 'Pergunta '),
      el('span', { id: 'quiz-num' }, '1'),
      el('span', {}, ` de ${total}`)),
    el('span', { class: 'quiz-acertos-wrap' },
      el('span', { class: 'acertos', id: 'quiz-acertos' }, '0'),
      el('span', {}, ` acerto${total !== 1 ? 's' : ''}`)))
  const corpo = el('div', { class: 'quiz-corpo' })
  por(alvo, placar, corpo)

  function atualizarPlacar() {
    const numEl = document.getElementById('quiz-num')
    const acertosEl = document.getElementById('quiz-acertos')
    const fillEl = document.getElementById('quiz-fill')
    if (numEl) numEl.textContent = Math.min(indice + 1, total)
    if (acertosEl) acertosEl.textContent = acertos
    if (fillEl) fillEl.style.width = `${Math.round((indice / total) * 100)}%`
  }

  function proxima() {
    if (indice >= total) {
      const pct = Math.round((acertos / total) * 100)
      por(corpo,
        el('div', { class: 'quiz-resultado' },
          el('div', { class: 'quiz-resultado-nota' }, `${pct}%`),
          el('div', { class: 'quiz-resultado-txt' }, `${acertos} de ${total} certas`),
          el('div', { class: 'quiz-resultado-msg' },
            pct >= 80 ? '🌟 Excelente! Você domina esta unidade.' :
            pct >= 50 ? '💪 Bom progresso! Revise o que errou.' :
            '💡 Continue praticando — você vai chegar lá!'),
          el('button', { class: 'botao', type: 'button', onclick: () => { indice = 0; acertos = 0; atualizarPlacar(); proxima() } }, 'Refazer quiz')))
      pedir(`/idiomas/${CURSO_ATUAL.chave}/concluir`, { unidade: unidade.chave, acertos, total }).catch(() => {})
      return
    }
    atualizarPlacar()
    desenharPergunta(unidade.quiz[indice], corpo, (acertou) => {
      if (acertou) acertos++
      atualizarPlacar()
      const item = `${unidade.chave}::q${indice}`
      pedir(`/idiomas/${CURSO_ATUAL.chave}/revisar`, { item, acertou }).catch(() => {})
      indice++
      setTimeout(proxima, 900)
    })
  }
  proxima()
}

function desenharPergunta(q, alvo, aoResponder) {
  if (q.tipo === 'multipla') {
    let respondida = false
    const botoes = q.opcoes.map((op, i) => el('button', {
      class: 'opcao', type: 'button',
      onclick: (ev) => {
        if (respondida) return
        respondida = true
        const acertou = i === q.certa
        ev.currentTarget.classList.add(acertou ? 'certa' : 'errada')
        if (!acertou) botoes[q.certa].classList.add('certa')
        for (const b of botoes) b.disabled = true
        aoResponder(acertou)
      },
    }, op))
    por(alvo, el('div', { class: 'quiz-pergunta' }, q.pergunta), el('div', { class: 'opcoes' }, botoes))
    return
  }
  const chaveNorm = (s) => String(s).normalize('NFD').replace(/\p{M}/gu, '').replace(new RegExp(String.fromCharCode(223), 'g'), 'ss').toLowerCase().trim()
  const campo = el('input', { type: 'text', class: 'quiz-input', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'Digite sua resposta…' })
  const saida = el('div')
  const conferir = () => {
    campo.disabled = true
    const acertou = chaveNorm(campo.value) === chaveNorm(q.resposta)
    por(saida, recado(acertou ? 'bom' : 'ruim', acertou ? 'Certo!' : `A resposta era: ${q.resposta}`))
    aoResponder(acertou)
  }
  campo.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') conferir() })
  por(alvo, el('div', { class: 'quiz-pergunta' }, q.pergunta),
    el('div', { class: 'campo-resposta' }, campo, el('button', { class: 'botao mini', type: 'button', onclick: conferir }, 'Responder')),
    saida)
  campo.focus()
}

// ── revisao espacada ──

function iniciarRevisao() {
  if (!CURSO_ATUAL) return
  const { curso, revisao } = CURSO_ATUAL
  const perguntas = revisao.map((r) => {
    const [unidadeChave, qChave] = r.item.split('::')
    const u = curso.unidades.find((x) => x.chave === unidadeChave)
    const iQ = Number((qChave ?? '').replace('q', ''))
    return u?.quiz?.[iQ] ? { ...u.quiz[iQ], item: r.item } : null
  }).filter(Boolean)

  if (!perguntas.length) return
  const painel = document.querySelector('.secao-conteudo') ?? main
  const bloco = el('div', { class: 'bloco' }, el('h2', {}, `🔁 Revisão (${perguntas.length})`), el('div', { id: 'corpo-revisao' }))
  painel.prepend(bloco)
  bloco.scrollIntoView({ behavior: 'smooth' })

  let indice = 0
  const alvo = document.getElementById('corpo-revisao')
  function proxima() {
    if (indice >= perguntas.length) {
      por(alvo, recado('bom', 'Revisão feita por hoje.'))
      return
    }
    const q = perguntas[indice]
    desenharPergunta(q, alvo, (acertou) => {
      pedir(`/idiomas/${CURSO_ATUAL.chave}/revisar`, { item: q.item, acertou }).catch(() => {})
      indice++
      setTimeout(proxima, 900)
    })
  }
  proxima()
}

// ── helpers ──

function limparParaVoz(texto) {
  return texto.replace(/\s*[\/|]\s*/g, ' ').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()
}

function falar(texto, lang) {
  if (!('speechSynthesis' in window)) return
  speechSynthesis.cancel()
  const limpo = limparParaVoz(texto)
  const u = new SpeechSynthesisUtterance(limpo)
  u.lang = lang || 'pt-BR'
  u.rate = 0.85
  speechSynthesis.speak(u)
}

iniciar()
