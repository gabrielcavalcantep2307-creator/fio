// O estudo de idiomas — francês, espanhol, japonês (completos), e alemão,
// russo, italiano, inglês (o básico, por enquanto). Exclusivo do plano Tear.
//
// Cada idioma é um curso JSON estático (/dados/idiomas/<chave>.json, servido
// pela rota que confere o plano — ver servidor/rotas/idiomas.mjs). Aqui só
// se desenha: unidade por unidade, vocabulário com voz do navegador, canção
// de domínio público, sugestão de música atual (link, não tocada aqui — a
// não ser o vídeo do YouTube, que é embutido pelo próprio YouTube), e um
// quiz que alimenta a revisão espaçada (SM-2, do lado do servidor).

const main = document.getElementById('main')

let CURSO_ATUAL = null   // { chave, curso, progresso, revisao }

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

// ── a grade dos sete ──
function desenharGrade(lista) {
  CURSO_ATUAL = null
  const PROFUNDIDADE = { completo: 'curso completo', basico: 'o básico — mais chegando' }
  por(main,
    el('div', { class: 'topo-idiomas' },
      el('div', {},
        el('h1', {}, 'Idiomas'),
        el('p', { class: 'sub', style: 'margin:0' }, 'Aulas, quiz, repetição espaçada, canção e voz — para aprender falando.')),
      el('span', { class: 'selo-tear' }, '✦ plano Tear')),
    el('div', { class: 'grade-idiomas' }, lista.map((i) => el('button', {
      class: 'cartao-idioma', type: 'button', onclick: () => { location.hash = `#/${i.chave}` },
    },
      el('span', { class: 'bandeira', 'aria-hidden': 'true' }, i.bandeira),
      el('h3', {}, i.nome),
      el('span', { class: 'prof' }, `${PROFUNDIDADE[i.profundidade] ?? i.profundidade} · ${i.unidades} unidades`)))))
}

// ── abrir um idioma ──
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
      el('div', {}, el('a', { href: '#/', style: 'font-size:13px;color:var(--tinta2);margin-top:14px;display:inline-block' }, '← voltar')),
    ))
}

// ── o curso: barra lateral de unidades + a lição ──
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
  desenharLicao(painel, unidade)
}

function desenharLicao(painel, unidade) {
  const blocos = [
    el('div', { class: 'bloco' },
      el('h2', {}, unidade.titulo),
      unidade.tema ? el('p', { class: 'sub', style: 'margin:0' }, unidade.tema) : null),
  ]

  if (unidade.vocabulario?.length) {
    blocos.push(el('div', { class: 'bloco' },
      el('h2', {}, 'Vocabulário'),
      el('div', { class: 'vocab' }, unidade.vocabulario.map((v) => el('div', { class: 'palavra' },
        el('button', { class: 'fala', type: 'button', title: 'Ouvir', onclick: () => falar(v.palavra, CURSO_ATUAL.curso.voz) }, '🔊'),
        el('div', { class: 'txt' },
          el('div', { class: 'orig' }, v.palavra),
          el('div', { class: 'trad' }, v.traducao),
          v.exemplo ? el('div', { class: 'exemplo' }, `${v.exemplo}${v.exemploTraducao ? ' — ' + v.exemploTraducao : ''}`) : null))))))
  }

  if (unidade.associacao) {
    blocos.push(el('div', { class: 'bloco' }, el('div', { class: 'assoc' }, el('b', {}, '💡 Associação — '), unidade.associacao)))
  }
  if (unidade.dica) {
    blocos.push(el('div', { class: 'bloco' }, el('div', { class: 'dica' }, el('b', {}, '✎ Dica — '), unidade.dica)))
  }

  if (unidade.cancao) {
    const c = unidade.cancao
    blocos.push(el('div', { class: 'bloco' },
      el('h2', {}, `🎵 ${c.titulo}`),
      el('p', { class: 'sub', style: 'margin:0 0 10px' }, `${c.autor} · domínio público`),
      el('button', { class: 'botao mini fraco', type: 'button', onclick: () => falar(c.letra.replace(/\n/g, '. '), CURSO_ATUAL.curso.voz) }, '🔊 ouvir a letra'),
      el('p', { class: 'cancao-letra', style: 'margin-top:12px' }, c.letra)))
  }

  if (unidade.musicaAtual) {
    const m = unidade.musicaAtual
    blocos.push(el('div', { class: 'bloco' },
      el('h2', {}, '🎧 Para praticar ouvindo'),
      el('p', { class: 'sub', style: 'margin:0 0 10px' }, `${m.titulo} — ${m.artista}`),
      m.youtubeId
        ? el('div', { class: 'video-embutido' }, el('iframe', {
            src: `https://www.youtube-nocookie.com/embed/${m.youtubeId}`,
            title: m.titulo, allow: 'encrypted-media', allowfullscreen: 'true', loading: 'lazy',
          }))
        : el('a', { class: 'botao mini fraco', href: `https://www.youtube.com/results?search_query=${encodeURIComponent(m.titulo + ' ' + m.artista)}`, target: '_blank', rel: 'noopener' }, 'procurar no YouTube')))
  }

  if (unidade.quiz?.length) {
    blocos.push(el('div', { class: 'bloco', id: 'bloco-quiz' }, el('h2', {}, 'Quiz'), el('div', { id: 'corpo-quiz' })))
  }

  por(painel, blocos)
  if (unidade.quiz?.length) iniciarQuiz(unidade, document.getElementById('corpo-quiz'))
}

// ── o quiz de uma unidade ──
function iniciarQuiz(unidade, alvo) {
  let indice = 0
  let acertos = 0
  const total = unidade.quiz.length

  function proxima() {
    if (indice >= total) {
      por(alvo,
        el('div', { class: 'quiz-resultado' },
          el('span', { style: 'font:500 18px Literata,Georgia,serif' }, `${acertos} de ${total} certas`),
          el('button', { class: 'botao mini', type: 'button', onclick: () => { indice = 0; acertos = 0; proxima() } }, 'Refazer')))
      pedir(`/idiomas/${CURSO_ATUAL.chave}/concluir`, { unidade: unidade.chave, acertos, total }).catch(() => {})
      return
    }
    desenharPergunta(unidade.quiz[indice], alvo, (acertou) => {
      if (acertou) acertos++
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
  // 'traduzir': resposta curta, comparada sem acento/caixa
  // sem acento, sem ß (teclado BR não tem), sem espaço nas pontas — quem
  // digitou "heisse" ou "heiße" acerta a mesma pergunta de alemão
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

// ── revisão espaçada: os itens vencidos, de qualquer unidade do curso ──
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

// ── a voz do navegador — de graça, em qualquer um dos sete idiomas ──
function falar(texto, lang) {
  if (!('speechSynthesis' in window)) return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(texto)
  u.lang = lang || 'pt-BR'
  u.rate = 0.92
  speechSynthesis.speak(u)
}

iniciar()
