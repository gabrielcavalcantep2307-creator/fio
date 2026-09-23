const main = document.getElementById('main')
let CURSO_ATUAL = null

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
  desenharGrade(lista)
  addEventListener('hashchange', () => roteador(lista))
  roteador(lista)
}

function roteador(lista) {
  const chave = location.hash.match(/^#\/?(\w+)/)?.[1]
  if (chave && lista.some((i) => i.chave === chave)) abrirIdioma(chave)
  else desenharGrade(lista)
}

function desenharGrade(lista) {
  CURSO_ATUAL = null
  const PROFUNDIDADE = { completo: 'curso completo', basico: 'o básico — mais chegando' }
  por(main,
    el('div', { class: 'topo-idiomas' },
      el('div', {},
        el('h1', {}, 'Idiomas'),
        el('p', { class: 'sub', style: 'margin:0' }, 'Aulas, gramática, diálogos, flashcards, música e quiz — para aprender de verdade.')),
      el('span', { class: 'selo-tear' }, '✦ plano Tear')),
    el('div', { class: 'grade-idiomas' }, lista.map((i) => el('button', {
      class: 'cartao-idioma', type: 'button', onclick: () => { location.hash = `#/${i.chave}` },
    },
      el('span', { class: 'bandeira', 'aria-hidden': 'true' }, i.bandeira),
      el('h3', {}, i.nome),
      el('span', { class: 'prof' }, `${PROFUNDIDADE[i.profundidade] ?? i.profundidade} · ${i.unidades} unidades`)))))
}

async function abrirIdioma(chave) {
  por(main, el('p', { class: 'sub' }, 'Abrindo…'))
  let resposta
  try {
    resposta = await pedir(`/idiomas/${chave}`)
  } catch (e) {
    if (e.status === 402) { desenharBloqueio(chave); return }
    por(main, recado('ruim', e.message))
    return
  }
  CURSO_ATUAL = { chave, ...resposta }
  const primeiraNaoFeita = resposta.curso.unidades.find((u) => !resposta.progresso[u.chave])
  desenharCurso((primeiraNaoFeita ?? resposta.curso.unidades[0]).chave)
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

function desenharCurso(unidadeChave) {
  const { curso, progresso } = CURSO_ATUAL
  const unidade = curso.unidades.find((u) => u.chave === unidadeChave) ?? curso.unidades[0]

  const listaUnidades = el('nav', { class: 'lista-unidades', 'aria-label': 'Unidades' },
    curso.unidades.map((u, i) => el('button', {
      class: 'item-unidade' + (progresso[u.chave] ? ' feita' : ''), type: 'button',
      'aria-current': u.chave === unidade.chave ? 'true' : null,
      onclick: () => desenharCurso(u.chave),
    },
      el('span', { class: 'marca', 'aria-hidden': 'true' }, progresso[u.chave] ? '✓' : String(i + 1)),
      u.titulo)))

  const painel = el('div', { class: 'licao' })
  por(main,
    el('div', { class: 'topo-idiomas' },
      el('div', {},
        el('a', { href: '#/', style: 'font-size:13px;color:var(--tinta2)' }, '← todos os idiomas'),
        el('h1', { style: 'margin-top:6px' }, `${curso.bandeira} ${curso.nome}`)),
      CURSO_ATUAL.revisao.length
        ? el('button', { class: 'botao fraco', type: 'button', onclick: iniciarRevisao }, `🔁 Revisar (${CURSO_ATUAL.revisao.length})`)
        : null),
    el('div', { class: 'estudo' }, listaUnidades, painel))
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
    abas.map((a) => {
      const btn = el('button', {
        class: 'aba' + (a.id === abaAtiva ? ' ativa' : ''),
        type: 'button', role: 'tab',
        onclick: () => ativarAba(a.id),
      }, a.label)
      return btn
    }))

  function ativarAba(id) {
    abaAtiva = id
    for (const btn of botoesAbas.querySelectorAll('.aba')) {
      btn.classList.toggle('ativa', btn.textContent.includes(abas.find((a) => a.id === id).label.split(' ').pop()))
    }
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
      unidade.nivel ? el('span', { style: 'display:inline-block;margin-top:8px;font-size:11px;padding:3px 8px;border-radius:4px;background:color-mix(in srgb,var(--acento) 12%,transparent);color:var(--acento);font-weight:600' }, unidade.nivel) : null),
  ]

  if (unidade.vocabulario?.length) {
    blocos.push(el('div', { class: 'bloco' },
      el('div', { class: 'bloco-titulo' }, el('span', { class: 'ico' }, '📝'), el('h2', { style: 'margin:0' }, 'Vocabulário')),
      el('div', { class: 'vocab' }, unidade.vocabulario.map((v) => el('div', { class: 'palavra' },
        el('button', { class: 'fala', type: 'button', title: 'Ouvir', onclick: () => falar(v.palavra, CURSO_ATUAL.curso.voz) }, '🔊'),
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
            el('div', {}, f.fala),
            trad)
          return el('div', { class: `fala-linha${ehB ? ' dir' : ''}` },
            el('div', { class: `fala-avatar ${ehB ? 'b' : 'a'}` }, f.quem),
            bolha)
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

  let indice = 0
  let acertos = 0
  let total = vocab.length
  let virada = false

  function embaralhar() {
    for (let i = vocab.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [vocab[i], vocab[j]] = [vocab[j], vocab[i]]
    }
    indice = 0; acertos = 0; virada = false
    desenharCard()
  }

  const progresso = el('div', { class: 'flashcard-progresso' })
  const cardContainer = el('div')
  const acoes = el('div')
  const embaralharBtn = el('button', { class: 'flashcard-embaralhar', type: 'button', onclick: embaralhar }, '🔀 Embaralhar')

  por(alvo, el('div', { class: 'bloco' },
    el('div', { class: 'bloco-titulo' }, el('span', { class: 'ico' }, '🃏'), el('h2', { style: 'margin:0' }, 'Flashcards')),
    el('p', { class: 'sub', style: 'margin:0 0 4px' }, 'Toque no cartão para revelar. Teste sua memória.'),
    el('div', { class: 'flashcards-area' }, progresso, cardContainer, acoes, embaralharBtn)))

  function desenharCard() {
    if (indice >= total) {
      const pct = Math.round((acertos / total) * 100)
      por(progresso)
      por(cardContainer, el('div', { class: 'flashcard-resumo' },
        el('div', { class: 'nota' }, `${pct}%`),
        el('div', { style: 'font-size:15px;margin-bottom:4px' }, `${acertos} de ${total} acertos`),
        el('div', { style: 'font-size:13px;color:var(--tinta2)' }, pct >= 80 ? 'Excelente! Você domina esse vocabulário.' : pct >= 50 ? 'Bom progresso. Revise as que errou.' : 'Continue praticando — a repetição faz o domínio.'),
        el('button', { class: 'botao mini', style: 'margin-top:14px', type: 'button', onclick: () => { indice = 0; acertos = 0; desenharCard() } }, 'Recomeçar')))
      por(acoes)
      return
    }

    virada = false
    const v = vocab[indice]
    const pct = Math.round((indice / total) * 100)
    por(progresso,
      el('span', {}, `${indice + 1} de ${total}`),
      el('div', { class: 'flashcard-barra' }, el('i', { style: `width:${pct}%` })))

    const card = el('div', { class: 'flashcard', onclick: () => {
      if (!virada) { virada = true; card.classList.add('virada') }
    } },
      el('div', { class: 'flashcard-inner' },
        el('div', { class: 'flashcard-face flashcard-frente' },
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

// ── aba Música ──
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
    const conteudo = [
      el('div', { class: 'bloco-titulo' }, el('span', { class: 'ico' }, '🎧'), el('h2', { style: 'margin:0' }, m.titulo || 'Para praticar ouvindo')),
      el('p', { class: 'sub', style: 'margin:0 0 10px' }, `${m.titulo} — ${m.artista}`),
    ]
    if (m.youtubeId) {
      conteudo.push(
        el('div', { class: 'video-embutido' }, el('iframe', {
          src: `https://www.youtube-nocookie.com/embed/${m.youtubeId}`,
          title: m.titulo, allow: 'encrypted-media', allowfullscreen: 'true', loading: 'lazy',
        })),
        el('div', { class: 'video-link-direto' },
          '🔗 ',
          el('a', { href: `https://www.youtube.com/watch?v=${m.youtubeId}`, target: '_blank', rel: 'noopener' }, 'Assistir no YouTube')))
    } else {
      conteudo.push(el('a', { class: 'botao mini fraco', href: `https://www.youtube.com/results?search_query=${encodeURIComponent(m.titulo + ' ' + m.artista)}`, target: '_blank', rel: 'noopener' }, 'Procurar no YouTube'))
    }
    if (m.trechoLetra) {
      conteudo.push(el('div', { class: 'musica-trecho' },
        el('div', { class: 'original' }, m.trechoLetra),
        m.traducaoTrecho ? el('div', { class: 'traducao-trecho' }, m.traducaoTrecho) : null))
    }
    blocos.push(el('div', { class: 'bloco' }, conteudo))
  }

  por(alvo, blocos)
}

// ── aba Quiz ──
function desenharAbaQuiz(alvo, unidade) {
  const quizContainer = el('div')
  por(alvo, el('div', { class: 'bloco' },
    el('div', { class: 'bloco-titulo' }, el('span', { class: 'ico' }, '✍️'), el('h2', { style: 'margin:0' }, 'Quiz')),
    el('p', { class: 'sub', style: 'margin:0 0 10px' }, 'Responda para fixar e alimentar sua revisão espaçada.'),
    quizContainer))
  if (unidade.quiz?.length) iniciarQuiz(unidade, quizContainer)
}

// ── quiz ──
function iniciarQuiz(unidade, alvo) {
  let indice = 0
  let acertos = 0
  const total = unidade.quiz.length

  const placar = el('div', { class: 'quiz-placar' },
    el('span', {}, 'Pergunta '),
    el('span', { id: 'quiz-num' }, '1'),
    el('span', {}, ` de ${total}`),
    el('span', { style: 'margin-left:auto' }, 'Acertos: '),
    el('span', { class: 'acertos', id: 'quiz-acertos' }, '0'))
  const corpo = el('div')
  por(alvo, placar, corpo)

  function atualizarPlacar() {
    const numEl = document.getElementById('quiz-num')
    const acertosEl = document.getElementById('quiz-acertos')
    if (numEl) numEl.textContent = Math.min(indice + 1, total)
    if (acertosEl) acertosEl.textContent = acertos
  }

  function proxima() {
    if (indice >= total) {
      por(corpo,
        el('div', { class: 'quiz-resultado' },
          el('span', { style: 'font:500 18px Literata,Georgia,serif' }, `${acertos} de ${total} certas`),
          el('button', { class: 'botao mini', type: 'button', onclick: () => { indice = 0; acertos = 0; atualizarPlacar(); proxima() } }, 'Refazer')))
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
  const chave = (s) => String(s).normalize('NFD').replace(/\p{M}/gu, '').replace(/ß/g, 'ss').toLowerCase().trim()
  const campo = el('input', { type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' })
  const saida = el('div')
  const conferir = () => {
    campo.disabled = true
    const acertou = chave(campo.value) === chave(q.resposta)
    por(saida, recado(acertou ? 'bom' : 'ruim', acertou ? 'Certo!' : `A resposta era: ${q.resposta}`))
    aoResponder(acertou)
  }
  campo.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') conferir() })
  por(alvo, el('div', { class: 'quiz-pergunta' }, q.pergunta),
    el('div', { class: 'campo-resposta' }, campo, el('button', { class: 'botao mini', type: 'button', onclick: conferir }, 'Responder')),
    saida)
  campo.focus()
}

// ── revisão espaçada ──
function iniciarRevisao() {
  const { curso, revisao } = CURSO_ATUAL
  const perguntas = revisao.map((r) => {
    const [unidadeChave, qChave] = r.item.split('::')
    const u = curso.unidades.find((x) => x.chave === unidadeChave)
    const iQ = Number((qChave ?? '').replace('q', ''))
    return u?.quiz?.[iQ] ? { ...u.quiz[iQ], item: r.item } : null
  }).filter(Boolean)

  if (!perguntas.length) return
  const painel = document.querySelector('.estudo') ?? main
  const bloco = el('div', { class: 'bloco' }, el('h2', {}, `🔁 Revisão (${perguntas.length})`), el('div', { id: 'corpo-revisao' }))
  por(painel, bloco)
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

function falar(texto, lang) {
  if (!('speechSynthesis' in window)) return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(texto)
  u.lang = lang || 'pt-BR'
  u.rate = 0.92
  speechSynthesis.speak(u)
}

iniciar()
