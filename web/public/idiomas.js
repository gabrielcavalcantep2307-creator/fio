const main = document.getElementById('main')
let CURSO_ATUAL = null
let LISTA_IDIOMAS = null

// localStorage pode falhar (privado, cota) — nunca deixa a página quebrar por causa disso
function guardarLocal(chave, valor) { try { localStorage.setItem(chave, valor) } catch {} }
function lerLocal(chave) { try { return localStorage.getItem(chave) } catch { return null } }

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
  LISTA_IDIOMAS = lista
  addEventListener('hashchange', () => roteador(lista))
  roteador(lista)
}

const FERRAMENTAS_GERAIS = { tradutor: 'dicionario', estudio: 'musica' }

function roteador(lista) {
  const partes = location.hash.replace(/^#\/?/, '').split('/')
  const chave = partes[0]
  const secao = partes[1] || ''
  const detalhe = partes.slice(2).join('/')
  if (FERRAMENTAS_GERAIS[chave]) {
    CURSO_ATUAL = null
    abrirFerramentaGeral(chave, lista)
  } else if (chave && lista.some((i) => i.chave === chave)) {
    abrirIdioma(chave, secao, detalhe)
  } else {
    CURSO_ATUAL = null
    desenharGrade(lista)
  }
}

/** Tradutor/Estúdio Musical acessados direto do hub, sem escolher idioma antes. */
function abrirFerramentaGeral(ferramenta, lista) {
  const secaoAlvo = FERRAMENTAS_GERAIS[ferramenta]
  const lembrado = lerLocal('fio:idiomas:ultimo')
  if (lembrado && lista.some((i) => i.chave === lembrado)) {
    location.hash = `#/${lembrado}/${secaoAlvo}`
    return
  }
  const nomeFerramenta = ferramenta === 'tradutor' ? 'o Tradutor' : 'o Estúdio Musical'
  por(main,
    el('div', { class: 'topo-idiomas' },
      el('a', { href: '#/', class: 'voltar-link' }, '← todos os idiomas')),
    el('div', { class: 'escolher-ferramenta' },
      el('h1', {}, `Escolha o idioma para usar ${nomeFerramenta}`),
      el('p', { class: 'sub' }, 'Depois dá para trocar de idioma sem sair daqui.'),
      el('div', { class: 'grade-idiomas' }, lista.map((i) => el('button', {
        class: 'cartao-idioma', type: 'button',
        onclick: () => { location.hash = `#/${i.chave}/${secaoAlvo}` },
      },
        el('span', { class: 'bandeira', 'aria-hidden': 'true' }, i.bandeira),
        el('h3', {}, i.nome))))))
}

let PALAVRA_PENDENTE = null

function desenharGrade(lista) {
  const PROF = { completo: 'curso completo', basico: 'o básico — mais chegando' }
  // ordenados por uso: quem já tem progresso vem primeiro
  const ordenada = [...lista].sort((a, b) => (b.feitas ?? 0) - (a.feitas ?? 0))
  const totalFeitas = lista.reduce((s, i) => s + (i.feitas ?? 0), 0)
  const totalUnidades = lista.reduce((s, i) => s + (i.unidades ?? 0), 0)
  const idiomasComecados = lista.filter((i) => (i.feitas ?? 0) > 0).length

  const continuarAlvo = el('div', { class: 'continuar-estudando', style: 'display:none' })

  const buscaRapida = el('input', { type: 'search', class: 'hub-busca-rapida', placeholder: '🔎 Traduzir uma palavra em qualquer idioma…', autocomplete: 'off' })
  buscaRapida.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' || !buscaRapida.value.trim()) return
    PALAVRA_PENDENTE = buscaRapida.value.trim()
    location.hash = '#/tradutor'
  })

  por(main,
    el('div', { class: 'topo-idiomas hub-topo' },
      el('div', {},
        el('h1', {}, 'Idiomas'),
        el('p', { class: 'sub', style: 'margin:0;max-width:56ch' }, 'Aulas do zero, gramática, diálogos, flashcards, música estrofe por estrofe e quiz — escolha uma língua e mergulhe.')),
      el('span', { class: 'selo-tear' }, '✦ plano Tear')),

    continuarAlvo,
    buscaRapida,

    idiomasComecados ? el('div', { class: 'hub-stats' },
      el('div', { class: 'hub-stat' }, el('b', {}, String(totalFeitas)), el('span', {}, 'unidades no total')),
      el('div', { class: 'hub-stat' }, el('b', {}, `${idiomasComecados}/${lista.length}`), el('span', {}, 'idiomas começados')),
      el('div', { class: 'hub-stat' }, el('b', {}, String(totalUnidades)), el('span', {}, 'unidades no catálogo'))) : null,

    el('div', { class: 'grade-idiomas' }, ordenada.map((i) => {
      const pct = i.unidades ? Math.round(((i.feitas ?? 0) / i.unidades) * 100) : 0
      return el('button', {
        class: 'cartao-idioma', type: 'button',
        onclick: () => { location.hash = `#/${i.chave}` },
      },
        i.feitas ? el('span', { class: 'selo-andamento' }, 'em andamento') : null,
        el('span', { class: 'bandeira', 'aria-hidden': 'true' }, i.bandeira),
        el('h3', {}, i.nome),
        el('span', { class: 'prof' }, `${PROF[i.profundidade] ?? i.profundidade} · ${i.unidades} unidades`),
        i.feitas ? el('div', { class: 'cartao-progresso' },
          el('div', { class: 'cartao-progresso-barra' }, el('i', { style: `width:${pct}%` })),
          el('span', {}, `${i.feitas}/${i.unidades} unidades feitas`)) : null)
    })),

    el('div', { class: 'hub-separador' }, el('span', {}, 'ou use sem escolher idioma')),

    el('div', { class: 'hub-ferramentas' },
      el('h2', {}, 'Ferramentas gerais'),
      el('p', { class: 'sub' }, 'Sem precisar escolher idioma primeiro — você escolhe lá dentro.'),
      el('div', { class: 'painel-secoes' },
        el('button', { class: 'painel-card', type: 'button', onclick: () => { location.hash = '#/tradutor' } },
          el('span', { class: 'painel-card-ico' }, '💬'),
          el('div', {}, el('h3', {}, 'Tradutor'), el('p', {}, 'Traduza qualquer palavra, em qualquer um dos sete idiomas'))),
        el('button', { class: 'painel-card', type: 'button', onclick: () => { location.hash = '#/estudio' } },
          el('span', { class: 'painel-card-ico' }, '🎵'),
          el('div', {}, el('h3', {}, 'Estúdio Musical'), el('p', {}, 'Estude qualquer música do catálogo, estrofe por estrofe'))))))

  carregarContinuarEstudando(continuarAlvo, lista)
}

/** Card "continuar de onde parou" + música em destaque — carrega depois, sem travar o hub. */
async function carregarContinuarEstudando(alvo, lista) {
  const chave = lerLocal('fio:idiomas:ultimo')
  if (!chave || !lista.some((i) => i.chave === chave)) return
  let resposta
  try { resposta = await pedir(`/idiomas/${chave}`) } catch { return }
  const { curso, progresso, sequencia } = resposta
  const proxima = curso.unidades.find((u) => !progresso[u.chave])
  const musicas = []
  for (const u of curso.unidades) for (const m of (u.musicas || [])) if (m.youtubeId) musicas.push(m)
  const destaque = musicas[Math.floor(Math.random() * musicas.length)]

  por(alvo,
    el('div', { class: 'continuar-card' },
      el('div', { class: 'continuar-txt' },
        el('span', { class: 'continuar-rotulo' }, `${curso.bandeira} continuando em ${curso.nome}`),
        el('h2', {}, proxima ? proxima.titulo : 'Curso completo — reveja quando quiser'),
        sequencia > 0 ? el('span', { class: 'selo-sequencia' }, `🔥 ${sequencia} ${sequencia === 1 ? 'dia seguido' : 'dias seguidos'}`) : null),
      el('button', { class: 'botao', type: 'button', onclick: () => {
        location.hash = proxima ? `#/${chave}/curso/${proxima.chave}` : `#/${chave}/curso`
      } }, '▶ Continuar')),
    destaque ? el('button', { class: 'destaque-musica', type: 'button', onclick: () => {
      const idx = musicas.indexOf(destaque)
      location.hash = `#/${chave}/musica/${idx}`
    } },
      el('img', { src: `https://img.youtube.com/vi/${destaque.youtubeId}/mqdefault.jpg`, alt: '', loading: 'lazy' }),
      el('div', { class: 'destaque-musica-txt' },
        el('span', {}, 'Música em destaque'),
        el('b', {}, destaque.titulo), ' — ', destaque.artista)) : null)
  alvo.style.display = 'flex'
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
    guardarLocal('fio:idiomas:ultimo', chave)
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

  // trocar de idioma sem sair da ferramenta — só faz sentido em Tradutor/Estúdio,
  // que valem sozinhos (o Painel e o Curso são a imersão NESSE idioma específico)
  const trocador = (secao === 'musica' || secao === 'dicionario') && LISTA_IDIOMAS?.length > 1
    ? el('select', { class: 'trocador-idioma', 'aria-label': 'Trocar de idioma', onchange: (ev) => {
        location.hash = `#/${ev.target.value}/${secao}`
      } }, LISTA_IDIOMAS.map((i) => el('option', { value: i.chave, selected: i.chave === CURSO_ATUAL.chave ? '' : null }, `${i.bandeira} ${i.nome}`)))
    : null

  const conteudo = el('div', { class: 'secao-conteudo' })

  por(main,
    el('div', { class: 'topo-idioma' },
      el('a', { href: '#/', class: 'voltar-link' }, '← todos os idiomas'),
      el('div', { class: 'idioma-hero' },
        el('span', { class: 'idioma-bandeira' }, curso.bandeira),
        el('div', { style: 'flex:1' },
          el('h1', { style: 'margin:0' }, curso.nome),
          saud.s ? el('p', { class: 'saudacao-nativa' }, `${saud.s} ${saud.f}`) : null),
        trocador)),
    navBtns,
    conteudo)

  if (secao === 'curso') desenharCurso(conteudo, detalhe)
  else if (secao === 'musica') desenharEstudioMusical(conteudo, detalhe)
  else if (secao === 'dicionario') desenharTradutor(conteudo)
  else desenharPainelPrincipal(conteudo)
}

// ── painel principal (dashboard) ──

/**
 * Nível CEFR aproximado, só a partir de palavras vistas e unidades concluídas
 * — não é exame nenhum, é uma régua grosseira pra dar noção de onde se está.
 * Faixas soltas de propósito: a pesquisa (Cambridge/ALTE) fala em ~70h pro A1
 * e mais de 300h pro B1; aqui a proxy é "quanto vocabulário + prática já
 * passou pela pessoa", não hora cronometrada.
 */
function nivelEstimado(totalV, feitas) {
  const pontos = totalV * 1 + feitas * 15
  if (pontos < 60) return { nivel: 'A1', rotulo: 'iniciante' }
  if (pontos < 160) return { nivel: 'A2', rotulo: 'básico' }
  if (pontos < 320) return { nivel: 'B1', rotulo: 'intermediário' }
  if (pontos < 550) return { nivel: 'B2', rotulo: 'intermediário avançado' }
  return { nivel: 'C1', rotulo: 'avançado' }
}

function desenharPainelPrincipal(alvo) {
  const { curso, progresso, revisao, salvas = [], sequencia = 0 } = CURSO_ATUAL
  const feitas = Object.keys(progresso).length
  const totalU = curso.unidades.length
  const totalV = curso.unidades.reduce((s, u) => s + (u.vocabulario?.length || 0), 0)
  const musicas = coletarMusicas()
  const primeiraNaoFeita = curso.unidades.find((u) => !progresso[u.chave])
  const pct = totalU ? Math.round((feitas / totalU) * 100) : 0
  const nivel = nivelEstimado(totalV, feitas)

  const recentes = Object.entries(progresso)
    .sort(([, a], [, b]) => new Date(b.concluido_em) - new Date(a.concluido_em))
    .slice(0, 5)
    .map(([chave, p]) => ({ ...p, titulo: curso.unidades.find((u) => u.chave === chave)?.titulo || chave }))

  const musicaSugerida = musicas.find((m) => m.youtubeId)

  por(alvo,
    el('div', { class: 'painel-topo' },
      el('div', { class: 'anel-progresso', style: `--pct:${pct}%` },
        el('div', { class: 'anel-miolo' }, el('b', {}, `${pct}%`), el('span', {}, 'do curso'))),
      el('div', { class: 'painel-topo-txt' },
        el('h2', {}, feitas === 0 ? 'Vamos começar' : feitas === totalU ? 'Curso completo!' : 'Continue de onde parou'),
        el('p', {}, `${feitas} de ${totalU} unidades concluídas · ${totalV} palavras no curso`),
        el('div', { class: 'painel-selos' },
          el('span', { class: 'selo-nivel', title: 'Estimativa a partir do que você já viu — não é um exame' }, `Nível estimado: ${nivel.nivel} (${nivel.rotulo})`),
          sequencia > 0 ? el('span', { class: 'selo-sequencia' }, `🔥 ${sequencia} ${sequencia === 1 ? 'dia seguido' : 'dias seguidos'}`) : null))),

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
        el('div', { class: 'stat-label' }, 'para revisar')),
      el('button', { class: 'stat stat-clicavel', type: 'button', onclick: () => { location.hash = `#/${CURSO_ATUAL.chave}/dicionario` } },
        el('div', { class: 'stat-num' }, String(salvas.length)),
        el('div', { class: 'stat-label' }, 'palavras salvas'))),

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
        musicaSugerida ? el('img', { class: 'painel-card-capa', src: `https://img.youtube.com/vi/${musicaSugerida.youtubeId}/mqdefault.jpg`, alt: '', loading: 'lazy' }) : null,
        el('span', { class: 'painel-card-ico' }, '🎵'),
        el('div', {},
          el('h3', {}, 'Estúdio Musical'),
          el('p', {}, `${musicas.length} músicas para estudar estrofe por estrofe`))),
      el('button', { class: 'painel-card', type: 'button', onclick: () => { location.hash = `#/${CURSO_ATUAL.chave}/dicionario` } },
        el('span', { class: 'painel-card-ico' }, '💬'),
        el('div', {},
          el('h3', {}, 'Tradutor'),
          el('p', {}, 'Traduz palavra ou frase, nos dois sentidos')))),

    recentes.length ? el('div', { class: 'bloco painel-atividade' },
      el('h3', {}, 'Atividade recente'),
      recentes.map((r) => el('div', { class: 'atividade-item' },
        el('span', { class: 'atividade-ico' }, '✓'),
        el('span', { class: 'atividade-txt' }, `${r.titulo} — ${r.acertos}/${r.total} acertos`),
        el('span', { class: 'atividade-quando' }, formatarQuando(r.concluido_em))))) : null)
}

function formatarQuando(iso) {
  const diffMs = Date.now() - new Date(iso.replace(' ', 'T') + 'Z').getTime()
  const dias = Math.floor(diffMs / 86400000)
  if (dias <= 0) return 'hoje'
  if (dias === 1) return 'ontem'
  if (dias < 30) return `${dias} dias atrás`
  return new Date(iso).toLocaleDateString('pt-BR')
}

// ── curso (unidades em abas horizontais) ──

function desenharCurso(alvo, unidadeChave) {
  const { curso, progresso } = CURSO_ATUAL
  const unidade = (unidadeChave && curso.unidades.find((u) => u.chave === unidadeChave))
    || curso.unidades.find((u) => !progresso[u.chave])
    || curso.unidades[0]

  const tabs = el('div', { class: 'unidades-tabs', role: 'tablist' },
    curso.unidades.map((u, i) => el('button', {
      class: 'unidade-tab' + (u.chave === unidade.chave ? ' ativa' : '') + (progresso[u.chave] ? ' feita' : ''),
      type: 'button', role: 'tab',
      onclick: () => { location.hash = `#/${CURSO_ATUAL.chave}/curso/${u.chave}` },
    },
      el('span', { class: 'tab-num' }, progresso[u.chave] ? '✓' : String(i + 1)),
      el('span', { class: 'tab-titulo' }, u.titulo))))

  const btnEsq = el('button', { class: 'unidades-seta esq', type: 'button', title: 'Ver anteriores', onclick: () => {
    tabs.scrollBy({ left: -240, behavior: 'smooth' })
  } }, '‹')
  const btnDir = el('button', { class: 'unidades-seta dir', type: 'button', title: 'Ver mais', onclick: () => {
    tabs.scrollBy({ left: 240, behavior: 'smooth' })
  } }, '›')

  function atualizarSetas() {
    btnEsq.classList.toggle('escondida', tabs.scrollLeft <= 4)
    btnDir.classList.toggle('escondida', tabs.scrollLeft >= tabs.scrollWidth - tabs.clientWidth - 4)
  }
  tabs.addEventListener('scroll', atualizarSetas)

  const listaUnidades = el('div', { class: 'unidades-tabs-wrap' }, btnEsq, tabs, btnDir)
  const painel = el('div', { class: 'licao' })
  por(alvo, listaUnidades, painel)
  desenharPainelUnidade(painel, unidade)
  setTimeout(atualizarSetas, 0)
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

  blocos.push(notaPessoal(unidade.chave, 'Anote aqui seu próprio jeito de lembrar desta unidade…'))

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

  const formPedido = desenharPedirMusica()

  por(alvo,
    el('div', { class: 'bloco', style: 'border:none;background:none;padding:0' },
      el('h2', { style: 'margin-bottom:4px' }, '🎵 Estúdio Musical'),
      el('p', { class: 'sub', style: 'margin:0 0 14px' }, 'Estude cada música estrofe por estrofe. Aprenda palavras, significados e pronúncia.'),
      musicas.length ? el('button', { class: 'botao mini', type: 'button', onclick: () => { location.hash = `#/${CURSO_ATUAL.chave}/musica/0` } }, '▶ Tocar tudo') : null),
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
          el('div', { class: 'unidade-musica' }, m._unidade))))),
    formPedido)
}

function desenharPedirMusica() {
  const chave = CURSO_ATUAL.chave
  const aberto = el('div', { class: 'pedir-musica-form', style: 'display:none' })
  const saida = el('div')
  const tituloC = el('input', { type: 'text', placeholder: 'Título da música', maxlength: '200' })
  const artistaC = el('input', { type: 'text', placeholder: 'Artista (opcional)', maxlength: '120' })
  const notaC = el('input', { type: 'text', placeholder: 'Link do YouTube ou observação (opcional)', maxlength: '500' })
  const enviar = el('button', { class: 'botao mini', type: 'button', onclick: async () => {
    if (!tituloC.value.trim()) { por(saida, recado('ruim', 'Diga ao menos o título.')); return }
    enviar.disabled = true
    try {
      await pedir(`/idiomas/${chave}/pedir-musica`, { titulo: tituloC.value, artista: artistaC.value, nota: notaC.value })
      por(saida, recado('bom', 'Pedido enviado — obrigado! Vamos avaliar para adicionar ao catálogo.'))
      tituloC.value = ''; artistaC.value = ''; notaC.value = ''
    } catch (e) { por(saida, recado('ruim', e.message)) }
    enviar.disabled = false
  } }, 'Enviar pedido')
  por(aberto, el('div', { class: 'bloco' },
    el('h3', { style: 'margin-top:0' }, 'Peça uma música'),
    el('p', { class: 'sub', style: 'margin:0 0 12px' }, 'Não achou a música que queria estudar? Peça aqui — avaliamos e adicionamos ao catálogo.'),
    el('div', { class: 'pedir-musica-campos' }, tituloC, artistaC, notaC, enviar),
    saida))
  return el('div', {},
    el('button', { class: 'botao fraco mini', type: 'button', style: 'margin-top:16px', onclick: () => {
      aberto.style.display = aberto.style.display === 'none' ? 'block' : 'none'
    } }, '🎤 Peça uma música que falta'),
    aberto)
}

// ── player do YouTube ──
//
// Um <iframe src="youtube-nocookie.com/embed/..."> puro, sem carregar o
// script externo da API (`youtube.com/iframe_api`) — a CSP do site só libera
// `script-src 'self'`, e carregar JS de fora quebrava o player em produção
// em silêncio (24/09/2026). Pular para uma estrofe ainda funciona: com
// `enablejsapi=1` o player aceita comando por `postMessage`, sem precisar
// do script nenhum.

/**
 * Fala com o player do YouTube por `postMessage`, sem carregar o script
 * `youtube.com/iframe_api` (bloqueado pela CSP — foi a causa do "Erro 153"/tela
 * preta de antes). Mandando `listening` de tempos em tempos, o player começa a
 * devolver `infoDelivery` sozinho, com `currentTime` — é assim que a legenda ao
 * vivo sabe em que ponto da música está, sem precisar da biblioteca oficial.
 */
function criarControlePlayer(iframe) {
  const ORIGEM = 'https://www.youtube-nocookie.com'
  const mandar = (func, args = []) => iframe?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), ORIGEM)

  // O YouTube devolve currentTime pelo buffer decodificado, que pode estar
  // 1-2 s na frente do áudio que sai no speaker. A solução: usamos os valores
  // do YouTube só para sincronizar um relógio LOCAL que avança com Date.now()
  // enquanto o vídeo está tocando — assim a precisão não depende do intervalo
  // do postMessage.
  let tempoBase = 0      // currentTime recebido do YouTube
  let momentoBase = 0    // Date.now() quando recebemos esse currentTime
  let tocando = false    // playerState === 1
  const ouvintes = new Set()

  const tempoInterpolado = () =>
    tocando ? tempoBase + (Date.now() - momentoBase) / 1000 : tempoBase

  function aoReceber(ev) {
    if (ev.source !== iframe?.contentWindow) return
    let dado
    try { dado = JSON.parse(ev.data) } catch { return }
    if (dado.event === 'infoDelivery' && typeof dado.info?.currentTime === 'number') {
      // resincroniza o relógio local com o valor do YouTube
      tempoBase = dado.info.currentTime
      momentoBase = Date.now()
      tocando = dado.info.playerState === 1
    }
  }
  window.addEventListener('message', aoReceber)

  // dispara os ouvintes a cada 100 ms com o tempo interpolado — independente
  // de quando o YouTube responde
  const intervalo = setInterval(() => {
    iframe?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: musicaIdAtual, channel: 'widget' }), ORIGEM)
    if (tocando) for (const fn of ouvintes) fn(tempoInterpolado())
  }, 100)

  return {
    pular(seg) {
      tempoBase = seg; momentoBase = Date.now()
      mandar('seekTo', [seg, true]); mandar('playVideo')
    },
    velocidade(r) { mandar('setPlaybackRate', [r]) },
    tempoAgora: tempoInterpolado,
    aoAtualizar(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn) },
    destruir() { window.removeEventListener('message', aoReceber); clearInterval(intervalo) },
  }
}
let musicaIdAtual = 'player'
let loopAtivo = null // { intervalo, botao }

/** Liga/desliga repetição de um trecho (usa o tempo do player, sem precisar de setInterval preciso). */
function alternarLoop(botao, controle, inicioSeg, fimSeg) {
  if (loopAtivo) {
    clearInterval(loopAtivo.intervalo)
    loopAtivo.botao.classList.remove('ativa')
    const eraEsteBotao = loopAtivo.botao === botao
    loopAtivo = null
    if (eraEsteBotao) return
  }
  controle.pular(inicioSeg)
  const intervalo = setInterval(() => {
    if (controle.tempoAgora() >= fimSeg) controle.pular(inicioSeg)
  }, 500)
  botao.classList.add('ativa')
  loopAtivo = { intervalo, botao }
}

/** A tira de legenda que acompanha a música tocando — mostra a linha atual sozinha. */
function desenharLegendaAoVivo(estrofes, controle) {
  const todasLinhas = []
  estrofes.forEach((e, iEst) => (e.linhas || []).forEach((l, iLinha) => {
    if (l.inicio != null) todasLinhas.push({ ...l, iEst, iLinha })
  }))
  todasLinhas.sort((a, b) => a.inicio - b.inicio)
  if (!todasLinhas.length || !controle) return null

  const original = el('div', { class: 'legenda-original' }, '♪ toque em play e acompanhe a letra aqui, em tempo real')
  const traducao = el('div', { class: 'legenda-traducao' })
  const caixa = el('div', { class: 'legenda-ao-vivo' }, el('span', { class: 'legenda-rotulo' }, 'AO VIVO'), original, traducao)

  let indiceAtual = -1
  const parar = controle.aoAtualizar((tempo) => {
    let i = -1
    for (let k = 0; k < todasLinhas.length; k++) { if (todasLinhas[k].inicio <= tempo + 0.2) i = k; else break }
    if (i === indiceAtual) return
    indiceAtual = i
    if (i < 0) { original.textContent = '♪ toque em play e acompanhe a letra aqui, em tempo real'; traducao.textContent = ''; return }
    original.textContent = todasLinhas[i].original
    traducao.textContent = todasLinhas[i].traducao
    caixa.dataset.estrofe = todasLinhas[i].iEst
    document.querySelectorAll('.linha-tocando').forEach((n) => n.classList.remove('linha-tocando'))
    document.querySelector(`[data-linha-chave="${todasLinhas[i].iEst}-${todasLinhas[i].iLinha}"]`)?.classList.add('linha-tocando')
  })
  caixa._pararSincronia = parar
  return caixa
}

function desenharEstudoMusica(alvo, musica, idx, total) {
  const estrofes = musica.frases || []
  musicaIdAtual = `player-${idx}`

  const nav = el('div', { class: 'estudo-musica-nav' },
    idx > 0 ? el('button', { class: 'botao mini fraco', type: 'button', onclick: () => {
      location.hash = `#/${CURSO_ATUAL.chave}/musica/${idx - 1}`
    } }, '← Anterior') : el('span'),
    el('span', { class: 'sub' }, `${idx + 1} de ${total}`),
    idx < total - 1 ? el('button', { class: 'botao mini fraco', type: 'button', onclick: () => {
      location.hash = `#/${CURSO_ATUAL.chave}/musica/${idx + 1}`
    } }, 'Próxima →') : el('span'))

  const iframe = musica.youtubeId
    ? el('iframe', {
        class: 'yt-player', id: musicaIdAtual,
        src: `https://www.youtube-nocookie.com/embed/${musica.youtubeId}?rel=0&enablejsapi=1`,
        allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
        allowfullscreen: '', loading: 'lazy', frameborder: '0',
        // O site manda `Referrer-Policy: no-referrer` (proposital, ver Caddyfile.fiolib)
        // — mas sem referrer nenhum, o YouTube recusa alguns vídeos (os de selo/VEVO)
        // com "Erro 153" de configuração. Este atributo vale só PARA ESTE iframe,
        // manda a origem (não a URL inteira) e não afeta o resto do site.
        referrerpolicy: 'origin',
        title: musica.titulo,
      })
    : null
  const playerEl = iframe
    ? el('div', { class: 'yt-player-wrap' }, iframe)
    : el('a', {
        class: 'yt-thumb-busca botao mini fraco',
        href: `https://www.youtube.com/results?search_query=${encodeURIComponent(musica.titulo + ' ' + musica.artista)}`,
        target: '_blank', rel: 'noopener',
      }, '🔎 Procurar no YouTube')

  const controle = iframe ? criarControlePlayer(iframe) : null
  const velocidadeBtns = controle ? el('div', { class: 'velocidade-btns' },
    [0.75, 1, 1.25].map((r) => el('button', { class: 'botao mini fraco', type: 'button', onclick: (ev) => {
      controle.velocidade(r)
      ev.currentTarget.parentElement.querySelectorAll('button').forEach((b) => b.classList.remove('ativa'))
      ev.currentTarget.classList.add('ativa')
    } }, `${r}x`))) : null

  const header = el('div', { class: 'bloco estudo-musica-header', style: musica.youtubeId
    ? `--capa:url(https://img.youtube.com/vi/${musica.youtubeId}/hqdefault.jpg)` : '' },
    el('h2', { style: 'margin:0 0 4px' }, musica.titulo),
    el('p', { class: 'sub', style: 'margin:0 0 14px' }, musica.artista),
    playerEl,
    velocidadeBtns)

  const legenda = desenharLegendaAoVivo(estrofes, controle)

  const adivinha = el('input', { type: 'checkbox', id: 'modo-adivinha' })
  const modoAdivinha = el('label', { class: 'modo-adivinha', for: 'modo-adivinha' },
    adivinha, ' 🙈 Esconder tradução até eu clicar (testar antes de ver)')
  adivinha.addEventListener('change', () => {
    estrofesEl.classList.toggle('adivinha-ativo', adivinha.checked)
  })

  const estrofesEl = el('div', { class: 'bloco estudo-estrofes' },
    el('h2', { style: 'margin:0 0 4px' }, 'Estrofe por estrofe'),
    el('p', { class: 'sub', style: 'margin:0 0 14px' }, musica.frases?.some((f) => f.linhas?.some((l) => l.inicio != null))
      ? 'Toque em qualquer linha para pular o vídeo até ali.'
      : 'Toque em cada estrofe para ver a tradução e o significado de cada palavra.'),
    modoAdivinha,
    estrofes.length
      ? el('div', { class: 'lista-estrofes', style: 'margin-top:14px' }, estrofes.map((e, i) => criarEstrofe(e, i + 1, controle, `${musica.titulo}::${i + 1}`, i)))
      : el('p', { class: 'sub' }, 'Letra ainda não disponível para estudo.'))

  por(alvo,
    el('button', { class: 'voltar-estudio', type: 'button', onclick: () => {
      location.hash = `#/${CURSO_ATUAL.chave}/musica`
    } }, '← Voltar ao estúdio'),
    header, legenda, estrofesEl, nav)
}

function criarEstrofe(estrofe, num, controle, notaChave, iEst) {
  const detalhe = el('div', { class: 'estrofe-detalhe', style: 'display:none' })
  const item = el('div', { class: 'estrofe-item' })
  const linhasComTempo = estrofe.linhas?.filter((l) => l.inicio != null) || []

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
      (estrofe.inicio != null || linhasComTempo[0]) && controle ? el('button', { class: 'fala mini', type: 'button', title: 'Pular o vídeo pra cá', onclick: (ev) => {
        ev.stopPropagation()
        controle.pular(estrofe.inicio ?? linhasComTempo[0].inicio)
      } }, '▶') : null,
      linhasComTempo.length >= 2 && controle ? el('button', { class: 'fala mini loop-btn', type: 'button', title: 'Repetir esta estrofe em loop', onclick: (ev) => {
        ev.stopPropagation()
        alternarLoop(ev.currentTarget, controle, linhasComTempo[0].inicio, (estrofe.linhas.at(-1).inicio ?? linhasComTempo.at(-1).inicio) + 3)
      } }, '🔁') : null,
      el('span', {}, estrofe.original)))

  const detalhes = []
  if (estrofe.linhas?.length) {
    detalhes.push(el('div', { class: 'estrofe-linhas' },
      el('h4', {}, 'Linha por linha'),
      estrofe.linhas.map((l, iLinha) => el('div', { class: 'linha-item', 'data-linha-chave': `${iEst}-${iLinha}` },
        el('div', { class: 'linha-original' },
          el('button', { class: 'fala mini', type: 'button', onclick: () => falar(limparParaVoz(l.original), CURSO_ATUAL.curso.voz) }, '🔊'),
          l.inicio != null && controle ? el('button', { class: 'fala mini', type: 'button', title: 'Pular pra esta linha', onclick: () => controle.pular(l.inicio) }, '▶') : null,
          el('span', {}, l.original)),
        el('div', { class: 'linha-trad' }, l.traducao),
        l.notas?.length ? el('div', { class: 'linha-notas' },
          l.notas.map((n) => el('div', { class: 'linha-nota' },
            el('b', {}, n.trecho), ' — ', n.explicacao))) : null,
        el('button', { class: 'revelar-linha', type: 'button', onclick: (ev) => ev.currentTarget.closest('.linha-item').classList.add('revelada') }, '👁 revelar')))))
  } else if (estrofe.traducao) {
    // músicas ainda não reescritas no formato linha por linha (ver o método em docs)
    detalhes.push(el('div', { class: 'estrofe-trad' },
      el('strong', {}, 'Tradução: '),
      estrofe.traducao))
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
  if (notaChave) detalhes.push(notaPessoal(notaChave, 'Sua nota sobre esta estrofe…', true))
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
  const bandeira = CURSO_ATUAL.curso.bandeira
  const chave = CURSO_ATUAL.chave
  const salvasSet = new Set((CURSO_ATUAL.salvas || []).map((s) => s.palavra))

  let direcao = 'pt->idioma'
  let timer = null

  const ladoEsq = el('span', { class: 'tradutor-lado ativo' },
    el('span', { class: 'tradutor-lado-bandeira' }, '🇧🇷'), 'Português')
  const ladoDir = el('span', { class: 'tradutor-lado' },
    el('span', { class: 'tradutor-lado-bandeira' }, bandeira), idioma)
  const swap = el('button', { class: 'tradutor-swap', type: 'button', title: 'Trocar direção', onclick: () => {
    direcao = direcao === 'pt->idioma' ? 'idioma->pt' : 'pt->idioma'
    ladoEsq.classList.toggle('ativo', direcao === 'pt->idioma')
    ladoDir.classList.toggle('ativo', direcao === 'idioma->pt')
    swap.classList.toggle('girou')
    campo.placeholder = direcao === 'pt->idioma' ? `Digite em português…` : `Digite em ${idioma.toLowerCase()}…`
    campo.value = ''
    buscar()
  } }, '⇄')

  const campo = el('input', {
    type: 'search', class: 'busca-dicionario',
    placeholder: `Digite em português…`,
    autocomplete: 'off', spellcheck: 'false',
  })
  const resultado = el('div', { style: 'display:none' })
  const resultados = el('div', { class: 'resultados-busca' })

  async function traduzirAoVivo(q) {
    por(resultado, el('div', { class: 'tradutor-resultado tradutor-carregando' },
      el('div', { class: 'tradutor-resultado-txt' }, 'traduzindo…')))
    resultado.style.display = 'flex'
    try {
      const r = await pedir(`/idiomas/${chave}/traduzir`, { texto: q, direcao })
      const langFala = direcao === 'pt->idioma' ? CURSO_ATUAL.curso.voz : 'pt-BR'
      const jaSalva = salvasSet.has(q)
      const estrela = el('button', { class: 'fala estrela' + (jaSalva ? ' salva' : ''), type: 'button', title: jaSalva ? 'Tirar dos salvos' : 'Salvar para revisar depois', onclick: async () => {
        try {
          if (salvasSet.has(q)) {
            await pedir(`/idiomas/${chave}/tirar-salva`, { palavra: q })
            salvasSet.delete(q)
            CURSO_ATUAL.salvas = (CURSO_ATUAL.salvas || []).filter((s) => s.palavra !== q)
          } else {
            await pedir(`/idiomas/${chave}/salvar`, { palavra: q, traducao: r.traducao })
            salvasSet.add(q)
            CURSO_ATUAL.salvas = [{ palavra: q, traducao: r.traducao, criado_em: new Date().toISOString() }, ...(CURSO_ATUAL.salvas || [])]
          }
          const agoraSalva = salvasSet.has(q)
          estrela.classList.toggle('salva', agoraSalva)
          estrela.title = agoraSalva ? 'Tirar dos salvos' : 'Salvar para revisar depois'
          estrela.textContent = agoraSalva ? '⭐' : '☆'
        } catch {}
      } }, salvasSet.has(q) ? '⭐' : '☆')
      por(resultado, el('div', { class: 'tradutor-resultado' },
        el('button', { class: 'fala', type: 'button', title: 'Ouvir', onclick: () => falar(limparParaVoz(r.traducao), langFala) }, '🔊'),
        el('div', { class: 'tradutor-resultado-txt' }, r.traducao || '—'),
        estrela))
    } catch (e) {
      por(resultado, el('div', { class: 'tradutor-resultado' },
        el('div', { class: 'tradutor-resultado-txt', style: 'font-size:14px;color:var(--tinta2);font-style:italic;font-weight:400' }, e.message || 'Não consegui traduzir agora.')))
    }
  }

  function buscar() {
    const q = campo.value.trim()
    clearTimeout(timer)

    const norm = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    const achados = q ? vocab.filter((v) =>
      norm(v.palavra).includes(norm(q)) || norm(v.traducao).includes(norm(q)) ||
      (v.exemplo && norm(v.exemplo).includes(norm(q)))) : []

    // o resultado local é síncrono: aparece na hora, sem esperar a rede
    if (achados.length) {
      por(resultados, el('div', { class: 'tradutor-local' },
        el('h4', {}, `Já ensinado no curso de ${idioma}`),
        achados.map((v) => el('div', { class: 'resultado-item' },
          el('button', { class: 'fala mini', type: 'button', onclick: () => falar(limparParaVoz(v.palavra), CURSO_ATUAL.curso.voz) }, '🔊'),
          el('div', { class: 'vocab-info' },
            el('div', { class: 'vocab-palavra' }, v.palavra),
            el('div', { class: 'vocab-sig' }, v.traducao),
            v.exemplo ? el('div', { class: 'vocab-detalhe' }, v.exemplo) : null,
            el('div', { class: 'unid-tag' }, v._unidade))))))
    } else if (q) {
      por(resultados)
    } else {
      const salvas = CURSO_ATUAL.salvas || []
      por(resultados,
        el('p', { class: 'sub' }, `${vocab.length} palavras do curso disponíveis para consulta rápida.`),
        salvas.length ? el('div', { class: 'tradutor-local', style: 'margin-top:18px' },
          el('h4', {}, `⭐ Suas palavras salvas (${salvas.length})`),
          salvas.map((s) => el('div', { class: 'resultado-item' },
            el('button', { class: 'fala mini', type: 'button', onclick: () => falar(limparParaVoz(s.palavra), CURSO_ATUAL.curso.voz) }, '🔊'),
            el('div', { class: 'vocab-info' },
              el('div', { class: 'vocab-palavra' }, s.palavra),
              el('div', { class: 'vocab-sig' }, s.traducao)),
            el('button', { class: 'fala mini', type: 'button', title: 'Tirar dos salvos', onclick: async () => {
              await pedir(`/idiomas/${chave}/tirar-salva`, { palavra: s.palavra })
              CURSO_ATUAL.salvas = CURSO_ATUAL.salvas.filter((x) => x.palavra !== s.palavra)
              salvasSet.delete(s.palavra)
              buscar()
            } }, '✕')))) : null)
    }

    if (!q) { resultado.style.display = 'none'; return }
    timer = setTimeout(() => traduzirAoVivo(q), 600)
  }

  campo.addEventListener('input', buscar)

  por(alvo,
    el('div', { class: 'bloco', style: 'border:none;background:none;padding:0' },
      el('h2', { style: 'margin-bottom:4px' }, `💬 Tradutor de ${idioma}`),
      el('p', { class: 'sub', style: 'margin:0 0 16px' }, `Traduz na hora, nos dois sentidos — sem abrir outra aba.`)),
    el('div', { class: 'ficha-tradutor' },
      el('div', { class: 'tradutor-direcao' }, ladoEsq, swap, ladoDir),
      campo,
      resultado),
    resultados)

  if (PALAVRA_PENDENTE) {
    campo.value = PALAVRA_PENDENTE
    PALAVRA_PENDENTE = null
  }
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

// ── notas pessoais ──

/** Campo de texto livre, salvo por `item` (chave de unidade ou "música::N"). */
function notaPessoal(item, dica, compacta = false) {
  let timer = null
  const status = el('span', { class: 'nota-status' })
  const campo = el('textarea', {
    class: 'nota-pessoal-campo', placeholder: dica, rows: compacta ? '2' : '3',
    oninput: () => {
      clearTimeout(timer)
      status.textContent = ''
      timer = setTimeout(async () => {
        try {
          await pedir(`/idiomas/${CURSO_ATUAL.chave}/nota`, { item, texto: campo.value })
          CURSO_ATUAL.notas[item] = campo.value
          status.textContent = 'salvo'
          setTimeout(() => { status.textContent = '' }, 1500)
        } catch {}
      }, 700)
    },
  }, CURSO_ATUAL.notas?.[item] || '')
  if (compacta) {
    return el('div', { class: 'nota-pessoal nota-pessoal-compacta' },
      el('div', { class: 'nota-pessoal-titulo' }, '✏️ Sua nota', status), campo)
  }
  return el('div', { class: 'bloco nota-pessoal' },
    el('div', { class: 'bloco-titulo' }, el('span', { class: 'ico' }, '✏️'), el('h2', { style: 'margin:0' }, 'Suas notas'), status),
    campo)
}

// ── helpers ──

function limparParaVoz(texto) {
  return texto.replace(/\s*[\/|]\s*/g, ' ').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()
}

// Vozes carregam de forma assíncrona no Chrome — `getVoices()` devolve [] na
// primeira chamada e só fica preenchido depois do evento `voiceschanged`.
// Guardamos uma lista cacheada e a atualizamos quando o evento chega.
let _vozes = []
if ('speechSynthesis' in window) {
  const atualizar = () => { _vozes = speechSynthesis.getVoices() }
  atualizar()
  speechSynthesis.addEventListener('voiceschanged', atualizar)
}

function falar(texto, lang) {
  if (!('speechSynthesis' in window)) return
  speechSynthesis.cancel()
  const limpo = limparParaVoz(texto)
  if (!limpo) return
  const codigo = (lang || 'pt-BR').slice(0, 2)

  function emitir() {
    const u = new SpeechSynthesisUtterance(limpo)
    u.lang = lang || 'pt-BR'
    u.rate = 0.85
    // tenta achar uma voz para o idioma; sem ela o navegador usa a padrão
    const lista = _vozes.length ? _vozes : speechSynthesis.getVoices()
    const voz = lista.find((v) => v.lang.toLowerCase().startsWith(codigo))
    if (voz) u.voice = voz
    speechSynthesis.speak(u)
  }

  // se as vozes ainda não chegaram, espera o evento e fala logo depois
  if (_vozes.length) {
    emitir()
  } else {
    speechSynthesis.addEventListener('voiceschanged', emitir, { once: true })
  }
}

iniciar()
