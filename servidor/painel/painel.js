// O painel do Fio, do lado do navegador.
//
// Página separada do app (cujo fonte se perdeu). Desde 19/09/2026 ela NÃO mora
// na pasta pública do site: fica em servidor/painel/ e é servida num endereço
// secreto (FIO_PAINEL no .env), só para sessão de administração — ver
// servidor/http/painel.mjs. Para qualquer outra pessoa o endereço é igual a
// um endereço que não existe, e /admin.html também. As rotas /api/admin/*
// continuam respondendo 404 a quem não é admin.

// a conversa com a API é a de todas as páginas (/fio-api.js)
const pedir = (caminho, corpo) => fioApi.pedir(caminho, corpo)

const el = (tag, attrs = {}, ...filhos) => {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v
    else if (k === 'html') e.innerHTML = v
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v)
    else if (v != null) e.setAttribute(k, v)
  }
  for (const f of filhos.flat(Infinity)) e.append(f?.nodeType ? f : document.createTextNode(String(f ?? '')))
  return e
}
const num = (n) => (n ?? 0).toLocaleString('pt-BR')
const main = document.getElementById('main')

async function iniciar() {
  let eu
  try { eu = (await pedir('/eu')).pessoa } catch { eu = null }
  if (!eu) { telaEntrar(); return }
  if (eu.papel !== 'admin') {
    main.replaceChildren(el('p', { class: 'ajuda' },
      'Esta conta não tem acesso ao painel. Entre com a conta de administração.',
      ' ', el('button', { class: 'fraco', onclick: async () => { try { await pedir('/sair', {}) } catch {} ; window.fioDono?.saiu(); telaEntrar() } }, 'trocar de conta')))
    return
  }
  document.getElementById('quem').textContent = `entrado como ${eu.usuario}`
  await desenhar()
}

// O painel entra por si só: uma conta de administração digita aqui e não
// depende da tela de login do site. O backend aceita nome de usuário OU e-mail
// no mesmo campo — quem cuida da casa escreve o que lembrar.
function telaEntrar() {
  document.getElementById('quem').textContent = ''
  const ident = el('input', { placeholder: 'curador', autocomplete: 'username' })
  const senha = el('input', { type: 'password', placeholder: 'sua senha', autocomplete: 'current-password' })
  const aviso = el('p', { class: 'recado ruim', style: 'display:none' })
  const form = el('form', { class: 'add', style: 'max-width:360px',
    onsubmit: async (ev) => {
      ev.preventDefault()
      aviso.style.display = 'none'
      const b = ev.submitter; b.disabled = true
      try {
        await pedir('/entrar', { email: ident.value.trim(), senha: senha.value })
        await iniciar()
      } catch (e) {
        b.disabled = false
        aviso.textContent = e.message
        aviso.style.display = ''
      }
    } },
    el('div', {}, el('label', {}, 'usuário ou e-mail'), ident),
    el('div', { style: 'margin-top:10px' }, el('label', {}, 'senha'), senha),
    aviso,
    el('div', { style: 'margin-top:12px' }, el('button', {}, 'Entrar no painel')))
  // Desde 19/09/2026 a conta de administração entra só pelo Google (o servidor
  // recusa a senha dela quando o Google está ligado — contas.adminSoPeloGoogle).
  // A senha fica escondida em "outra forma" para a saída de emergência.
  const google = el('a', { href: '/api/google/entrar?volta=' + encodeURIComponent(location.pathname),
    style: 'display:inline-block;background:var(--acento);color:#fff;border-radius:7px;padding:10px 18px;text-decoration:none;font-family:ui-sans-serif,system-ui,sans-serif' },
    'Entrar com o Google')
  const outra = el('details', { style: 'margin-top:18px' }, el('summary', { class: 'ajuda', style: 'cursor:pointer' }, 'entrar com senha'), form)
  main.replaceChildren(
    el('p', { class: 'ajuda' }, 'Painel de administração. A conta de curadoria entra pelo Google do dono.'),
    google, outra)
}

async function desenhar() {
  main.replaceChildren(el('p', { class: 'ajuda' }, 'Carregando o panorama…'))
  let p, fila, aj, pubs, cor, msg
  try {
    [p, fila, aj, pubs, cor, msg] = await Promise.all([pedir('/painel'), pedir('/fila'), pedir('/ajustes'),
      pedir('/admin/publicacoes'), pedir('/admin/correcoes'), pedir('/admin/contatos').catch(() => ({ pendentes: 0 }))])
  } catch (e) { main.replaceChildren(recado('ruim', `Não deu para carregar: ${e.message}`)); return }

  const pendencias = pubs.obras.length + pubs.denuncias.length
  main.replaceChildren(
    abas([
      ['controle', 'Controle', () => [secaoControle()]],
      ['panorama', 'Panorama', () => [esteiraAoVivo(), panorama(p), recentes(p.recentes)]],
      ['esteira', 'Esteira', () => [esteiraAoVivo(), secaoFila(fila.itens), secaoAdicionar()]],
      ['publicacoes', `Publicações${pendencias ? ` (${pendencias})` : ''}`, () => [secaoPublicacoes(pubs)]],
      ['correcoes', `Correções${cor.pendentes.length ? ` (${cor.pendentes.length})` : ''}`, () => [secaoCorrecoes(cor)]],
      ['acervo', 'Acervo', () => [secaoAcervo()]],
      ['assinaturas', 'Assinaturas', () => [secaoAssinaturas()]],
      ['mensagens', `Mensagens${msg.pendentes ? ` (${msg.pendentes})` : ''}`, () => [secaoMensagens()]],
      ['ajustes', 'Configurações', () => [secaoAjustes(aj)]],
    ]),
  )
}

// ── acervo: a curadoria dos livros e dos quadrinhos (servidor/curadoria.mjs) ──
//
// Procurar, corrigir título e autor, trocar capa, reescrever o "por que ler",
// arrumar temas, destacar e esconder — sem reconstruir o catálogo. A edição
// fica no banco e o servidor a aplica por cima do arquivo do catálogo.
let acervoAba = 'livros'
function secaoAcervo() {
  const s = el('section', {}, el('h2', {}, 'Acervo'))
  s.append(el('p', { class: 'ajuda' },
    'A curadoria do que está no site. As mudanças valem na hora para quem abrir o site de novo, e continuam valendo quando o catálogo for republicado. Campo vazio volta ao original.'))
  const barra = el('div', { class: 'aba' })
  const alvo = el('div', {})
  const pintar = () => {
    for (const b of barra.children) b.setAttribute('aria-selected', String(b._chave === acervoAba))
    alvo.replaceChildren(el('p', { class: 'ajuda' }, 'carregando o catálogo…'))
    ;(acervoAba === 'livros' ? acervoLivros : acervoQuadrinhos)(alvo)
  }
  for (const [k, r] of [['livros', 'Livros'], ['quadrinhos', 'Quadrinhos']]) {
    const b = el('button', { onclick: () => { acervoAba = k; pintar() } }, r)
    b._chave = k; barra.append(b)
  }
  s.append(barra, alvo)
  pintar()
  return s
}

const capaUrl = (o, capaEditada) => {
  const c = capaEditada ?? o.capa
  return c ? `/capas/${c}` : o.capaOL ? `https://covers.openlibrary.org/b/id/${o.capaOL}-M.jpg` : null
}
const miniCapa = (src, largura = 52) => el('div', { style: `width:${largura}px;aspect-ratio:2/3;border-radius:3px;overflow:hidden;background:var(--linha);flex:none` },
  src ? el('img', { src, alt: '', loading: 'lazy', style: 'width:100%;height:100%;object-fit:cover;display:block' }) : '')
const normal = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

let baseLivros = null
async function acervoLivros(alvo) {
  try { baseLivros ??= await pedir('/admin/curadoria/base?tipo=livros') } catch (e) { alvo.replaceChildren(recado('ruim', e.message)); return }
  const busca = el('input', { placeholder: 'título, autor ou número da obra', style: 'max-width:420px' })
  const filtro = el('select', { style: 'padding:8px;border-radius:7px;border:1px solid var(--linha);background:var(--fundo);color:var(--tinta)' },
    ...[['', 'todos'], ['editados', 'editados'], ['ocultos', 'ocultos'], ['semcapa', 'sem capa'], ['legiveis', 'para ler (trilho A)']].map(([v, r]) => el('option', { value: v }, r)))
  const lista = el('div', {})
  const editor = el('div', {})
  const desenharLista = () => {
    const q = normal(busca.value.trim())
    const f = filtro.value
    let itens = baseLivros.obras
    if (f === 'editados') itens = itens.filter((o) => o.edicao)
    if (f === 'ocultos') itens = itens.filter((o) => o.edicao?.oculta)
    if (f === 'semcapa') itens = itens.filter((o) => !o.capa && !o.capaOL && !o.edicao?.capa)
    if (f === 'legiveis') itens = itens.filter((o) => o.trilho === 'A')
    if (q) itens = /^\d+$/.test(q) ? itens.filter((o) => String(o.id) === q) : itens.filter((o) => normal(`${o.titulo} ${o.autor}`).includes(q))
    if (!q && !f) { lista.replaceChildren(el('p', { class: 'ajuda' }, `${num(baseLivros.obras.length)} obras. Procure pelo título ou autor, ou use o filtro.`)); return }
    lista.replaceChildren(
      el('p', { class: 'ajuda' }, `${num(itens.length)} encontrada(s)${itens.length > 60 ? ' — mostrando 60' : ''}`),
      el('div', { style: 'display:grid;gap:6px' }, itens.slice(0, 60).map((o) => el('button', {
        class: 'fraco', style: 'display:flex;gap:12px;align-items:center;text-align:left;padding:8px;width:100%',
        onclick: () => abrirLivro(o.id),
      }, miniCapa(capaUrl(o, o.edicao?.capa), 36),
      el('span', { style: 'flex:1;min-width:0' }, el('b', { style: 'display:block;font-weight:600;color:var(--tinta)' }, o.edicao?.titulo ?? o.titulo),
        el('span', { class: 'ajuda' }, `${o.edicao?.autor ?? o.autor ?? '—'} · nº ${o.id} · trilho ${o.trilho}`)),
      o.edicao?.oculta ? el('span', { class: 'selo erro' }, 'oculto') : o.edicao ? el('span', { class: 'selo pronto' }, 'editado') : ''))))
  }
  let espera
  busca.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(desenharLista, 200) })
  filtro.addEventListener('change', desenharLista)

  async function abrirLivro(id) {
    editor.replaceChildren(el('p', { class: 'ajuda' }, 'abrindo a obra…'))
    editor.scrollIntoView({ behavior: 'smooth', block: 'start' })
    let f
    try { f = await pedir(`/admin/curadoria/ficha?id=${id}`) } catch (e) { editor.replaceChildren(recado('ruim', e.message)); return }
    const o = f.original, ed = f.edicao.campos
    const valor = (k) => ed[k] ?? o[k] ?? ''
    const campoTexto = (k, rotulo, { longo = false, max = 200 } = {}) => {
      const inp = longo ? el('textarea', { maxlength: String(max), style: 'min-height:96px;font-family:inherit' }) : el('input', { maxlength: String(max) })
      inp.value = valor(k)
      const original = String(o[k] ?? '')
      return { k, inp, no: el('div', { style: 'margin-top:10px' },
        el('label', {}, rotulo, ed[k] !== undefined ? el('span', { class: 'selo pronto', style: 'margin-left:6px' }, 'editado') : ''),
        inp,
        el('div', { class: 'ajuda', style: 'font-size:12px;margin-top:2px' }, original ? `original: ${original.slice(0, 160)}${original.length > 160 ? '…' : ''}` : 'original: (vazio)',
          ed[k] !== undefined ? el('button', { class: 'fraco', style: 'margin-left:8px;padding:1px 8px;font-size:11px', onclick: (e) => { e.preventDefault(); inp.value = original } }, 'voltar ao original') : '')) }
    }
    const campos = [
      campoTexto('titulo', 'Título'), campoTexto('autor', 'Autor exibido', { max: 160 }), campoTexto('subtitulo', 'Subtítulo'),
      campoTexto('chamada', 'Chamada (a frase da vitrine)', { max: 240 }),
      campoTexto('porque', 'Por que ler', { longo: true, max: 2000 }), campoTexto('observar', 'O que observar', { longo: true, max: 2000 }),
    ]
    const temasSel = new Set(ed.temas ?? o.temas ?? [])
    const temas = el('div', { style: 'display:flex;flex-wrap:wrap;gap:6px;margin-top:6px' }, baseLivros.temas.map((t) => {
      const c = el('input', { type: 'checkbox', style: 'width:auto' }); c.checked = temasSel.has(t)
      c.addEventListener('change', () => { c.checked ? temasSel.add(t) : temasSel.delete(t) })
      return el('label', { style: 'display:inline-flex;gap:4px;align-items:center;border:1px solid var(--linha);border-radius:999px;padding:2px 10px;font-size:13px;color:var(--tinta);margin:0' }, c, t)
    }))
    const oculta = el('input', { type: 'checkbox', style: 'width:auto' }); oculta.checked = f.edicao.oculta
    const arquivoCapa = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', style: 'width:auto' })
    const saida = el('div')
    const capaAtual = capaUrl(o, ed.capa)
    editor.replaceChildren(el('div', { class: 'grupo', style: 'margin-top:18px' },
      el('div', { style: 'display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start' },
        el('div', { style: 'display:flex;flex-direction:column;gap:8px;align-items:flex-start' },
          miniCapa(capaAtual, 140),
          arquivoCapa,
          el('button', { class: 'fraco', onclick: async () => {
            const arq = arquivoCapa.files[0]; if (!arq) return saida.replaceChildren(recado('ruim', 'Escolha a imagem da capa.'))
            try {
              await fioApi.pedir(`/admin/curadoria/capa?tipo=obra&id=${o.id}`, null, { bruto: arq })
              baseLivros = null; abrirLivro(o.id)
            } catch (e) { saida.replaceChildren(recado('ruim', e.message)) }
          } }, 'Enviar capa nova'),
          ed.capa ? el('button', { class: 'fraco', onclick: async () => { await pedir('/admin/curadoria/obra', { id: o.id, capa: null }); baseLivros = null; abrirLivro(o.id) } }, 'Voltar à capa original') : ''),
        el('div', { style: 'flex:1;min-width:280px' },
          el('h3', {}, `${valor('titulo')} `, el('span', { class: 'ajuda' }, `nº ${o.id} · ${o.capitulos} capítulos · ${o.fonte ?? ''}`)),
          el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' },
            el('a', { href: `/#/obra/${o.id}`, target: '_blank' }, 'ver no site'), el('a', { href: `/#/ler/${o.id}`, target: '_blank' }, 'ler')),
          ...campos.map((c) => c.no),
          el('div', { style: 'margin-top:10px' }, el('label', {}, 'Temas (até 6)'), temas),
          el('label', { class: 'liga', style: 'margin-top:12px' }, el('span', {}, 'Ocultar do site (sai do catálogo e da leitura)'), oculta),
          el('div', { style: 'display:flex;gap:8px;margin-top:12px' },
            el('button', { onclick: async (ev) => {
              ev.target.disabled = true
              const dado = { id: o.id, temas: [...temasSel].slice(0, 6), oculta: oculta.checked }
              // igual ao original = não é edição
              for (const c of campos) dado[c.k] = c.inp.value.trim() === String(o[c.k] ?? '').trim() ? null : c.inp.value
              if (JSON.stringify([...temasSel].sort()) === JSON.stringify([...(o.temas ?? [])].sort())) dado.temas = null
              try { await pedir('/admin/curadoria/obra', dado); baseLivros = null; saida.replaceChildren(recado('bom', 'Salvo. Já vale no site.')); await acervoLivrosRecarregar() }
              catch (e) { saida.replaceChildren(recado('ruim', e.message)) }
              ev.target.disabled = false
            } }, 'Salvar')),
          saida))))
  }
  async function acervoLivrosRecarregar() { baseLivros = await pedir('/admin/curadoria/base?tipo=livros'); desenharLista() }

  alvo.replaceChildren(el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, busca, filtro), lista, editor)
  desenharLista()
  busca.focus()
}

async function acervoQuadrinhos(alvo) {
  let base
  try { base = await pedir('/admin/curadoria/base?tipo=quadrinhos') } catch (e) { alvo.replaceChildren(recado('ruim', e.message)); return }
  const editor = el('div', {})
  const lista = el('div', { style: 'display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(150px,1fr))' }, base.series.map((s) => el('button', {
    class: 'fraco', style: 'display:flex;flex-direction:column;gap:6px;align-items:flex-start;text-align:left;padding:8px',
    onclick: () => abrir(s),
  }, miniCapa(s.edicao?.capa ?? s.capa, 130),
  el('b', { style: 'font-weight:600;color:var(--tinta);font-size:13px' }, s.edicao?.titulo ?? s.titulo),
  el('span', { class: 'ajuda', style: 'font-size:12px' }, `${s.volumes.length} vol.`),
  s.edicao?.oculta ? el('span', { class: 'selo erro' }, 'oculta') : s.edicao?.destaque ? el('span', { class: 'selo pronto' }, 'destaque') : s.edicao ? el('span', { class: 'selo espera' }, 'editada') : '')))

  function abrir(s) {
    const ed = s.edicao ?? {}
    const titulo = el('input', { maxlength: '160' }); titulo.value = ed.titulo ?? s.titulo
    const resumo = el('textarea', { maxlength: '1500', style: 'min-height:110px;font-family:inherit' }); resumo.value = ed.resumo ?? s.resumo ?? ''
    const tags = el('input', {}); tags.value = (ed.tags ?? s.tags ?? []).join(', ')
    const destaque = el('input', { type: 'checkbox', style: 'width:auto' }); destaque.checked = !!ed.destaque
    const oculta = el('input', { type: 'checkbox', style: 'width:auto' }); oculta.checked = !!ed.oculta
    let capaEscolhida = ed.capa ?? null
    const previa = el('div', {})
    const pintarPrevia = () => previa.replaceChildren(miniCapa(capaEscolhida ?? s.capa, 140))
    pintarPrevia()
    const paginas = [...new Set([...s.volumes.map((v) => v.capa), ...(s.volumes[0]?.paginas ?? [])])].filter(Boolean).slice(0, 40)
    const escolha = el('div', { style: 'display:flex;gap:6px;overflow-x:auto;padding:4px 0' }, paginas.map((p) => el('button', {
      class: 'fraco', style: 'padding:2px;flex:none', title: 'usar como capa', onclick: () => { capaEscolhida = p; pintarPrevia() },
    }, miniCapa(p, 60))))
    const arquivo = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', style: 'width:auto' })
    const saida = el('div')
    editor.replaceChildren(el('div', { class: 'grupo', style: 'margin-top:18px' },
      el('div', { style: 'display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start' },
        el('div', { style: 'display:flex;flex-direction:column;gap:8px' }, previa,
          el('button', { class: 'fraco', onclick: () => { capaEscolhida = null; pintarPrevia() } }, 'capa original')),
        el('div', { style: 'flex:1;min-width:280px' },
          el('h3', {}, s.titulo, ' ', el('a', { href: `/quadrinhos.html?aba=aqui&serie=${encodeURIComponent(s.id)}`, target: '_blank', style: 'font-size:13px' }, 'ver no site')),
          el('label', {}, 'Título'), titulo,
          el('label', { style: 'margin-top:10px' }, 'Resumo'), resumo,
          el('label', { style: 'margin-top:10px' }, 'Etiquetas (separadas por vírgula)'), tags,
          el('label', { style: 'margin-top:10px' }, 'Capa: escolha uma página'), escolha,
          el('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' }, arquivo, el('button', { class: 'fraco', onclick: async () => {
            const arq = arquivo.files[0]; if (!arq) return
            try {
              await fioApi.pedir(`/admin/curadoria/capa?tipo=serie&id=${encodeURIComponent(s.id)}`, null, { bruto: arq })
              saida.replaceChildren(recado('bom', 'Capa enviada.')); acervoQuadrinhos(alvo)
            } catch (e) { saida.replaceChildren(recado('ruim', e.message)) }
          } }, 'ou enviar imagem')),
          el('label', { class: 'liga', style: 'margin-top:12px' }, el('span', {}, 'Destaque (aparece primeiro)'), destaque),
          el('label', { class: 'liga' }, el('span', {}, 'Ocultar do site'), oculta),
          el('div', { style: 'margin-top:12px' }, el('button', { onclick: async (ev) => {
            ev.target.disabled = true
            const dado = {
              id: s.id, destaque: destaque.checked, oculta: oculta.checked,
              titulo: titulo.value.trim() === s.titulo ? null : titulo.value,
              resumo: resumo.value.trim() === String(s.resumo ?? '').trim() ? null : resumo.value,
              tags: tags.value.split(',').map((t) => t.trim()).filter(Boolean),
            }
            if (JSON.stringify(dado.tags) === JSON.stringify(s.tags ?? [])) dado.tags = null
            if (!(capaEscolhida && capaEscolhida.startsWith('/capas/cur-'))) dado.capa = capaEscolhida
            try { await pedir('/admin/curadoria/serie', dado); saida.replaceChildren(recado('bom', 'Salvo. Já vale no site.')); acervoQuadrinhos(alvo) }
            catch (e) { saida.replaceChildren(recado('ruim', e.message)); ev.target.disabled = false }
          } }, 'Salvar')), saida))))
    editor.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  alvo.replaceChildren(lista, editor)
}

// ── a esteira, ao vivo ──
//
// Lê /api/admin/esteira a cada 10 s enquanto a caixa está na tela. O pulso vem
// da própria esteira — desde 18/09 o trabalhador na VPS (servidor/
// esteira-trabalhador.mjs) —; se ele envelhece, a caixa diz que a esteira
// parou em vez de fingir que está andando.
let relogioEsteira = null
function esteiraAoVivo() {
  const caixa = el('section', { class: 'grupo', style: 'margin-bottom:26px' }, el('p', { class: 'ajuda' }, 'Perguntando à esteira…'))
  const barra = (fracao, cor = 'var(--acento)') => el('div', { style: 'height:8px;background:var(--linha);border-radius:4px;overflow:hidden;margin:6px 0 2px' },
    el('div', { style: `height:100%;width:${Math.round(Math.min(1, Math.max(0, fracao)) * 100)}%;background:${cor};transition:width .6s` }))
  const idade = (seg) => seg < 60 ? `há ${seg} s` : seg < 3600 ? `há ${Math.round(seg / 60)} min` : seg < 86400 ? `há ${Math.round(seg / 3600)} h` : `há ${Math.round(seg / 86400)} dias`

  async function atualizar() {
    if (!document.body.contains(caixa)) { clearInterval(relogioEsteira); relogioEsteira = null; return }
    let e
    try { e = await pedir('/admin/esteira') } catch (x) { caixa.replaceChildren(recado('ruim', x.message)); return }
    const pu = e.pulso
    const plano = pu?.plano ?? {}
    const pctPlano = plano.total ? plano.traduzidos / plano.total : null
    const at = pu?.atual
    const estadoTexto = !pu ? 'ainda não mandou sinal (o serviço da esteira subiu?)'
      : e.viva ? ({
        traduzindo: 'traduzindo agora', publicando: 'atualizando o catálogo do site', instalando: 'instalando no acervo',
        medindo: 'começando', ociosa: 'em dia: esperando livros novos na fila',
        esperando: 'o serviço de tradução não responde; tentando de novo em alguns minutos',
        pausada: 'pausada pelo painel',
      }[pu.estado] ?? pu.estado)
      : pu.estado === 'terminou' ? `terminou a rodada ${idade(pu.idadeSegundos)}`
      : `parada — último sinal ${idade(pu.idadeSegundos)} (o serviço da esteira na VPS caiu? ele volta sozinho em instantes)`
    const botaoPausa = el('button', {
      class: 'fraco', style: 'margin-left:auto',
      onclick: async () => {
        botaoPausa.disabled = true
        try { await pedir('/admin/esteira/pausa', { pausada: !e.pausada }); await atualizar() }
        catch (x) { caixa.prepend(recado('ruim', x.message)) }
      },
    }, e.pausada ? 'Retomar' : 'Pausar')
    caixa.replaceChildren(
      el('div', { style: 'display:flex;align-items:center;gap:10px;flex-wrap:wrap' },
        el('span', { style: `width:10px;height:10px;border-radius:50%;background:${e.viva ? '#3aa55d' : 'var(--alerta)'};${e.viva ? 'box-shadow:0 0 0 4px color-mix(in srgb,#3aa55d 25%,transparent)' : ''}` }),
        el('h3', { style: 'margin:0' }, 'Esteira de tradução'),
        el('span', { class: 'ajuda' }, e.pausada && pu?.estado !== 'pausada' ? 'pausa pedida: termina o livro atual e para' : estadoTexto),
        botaoPausa),
      at ? el('div', { style: 'margin-top:14px' },
        el('div', {}, el('b', {}, at.titulo), el('span', { class: 'ajuda' }, `  · do ${at.de}`)),
        at.total ? barra(at.feitas / at.total) : barra(0),
        el('div', { class: 'ajuda' }, at.total
          ? `${num(at.feitas)} de ${num(at.total)} trechos (${Math.round(at.feitas / at.total * 100)}%) · faltam ~${at.minRestantes ?? '?'} min`
          : 'começando: baixando e dividindo o livro')) : null,
      pctPlano != null ? el('div', { style: 'margin-top:14px' },
        el('div', {}, el('b', {}, `Plano inteiro: ${num(plano.traduzidos)} de ${num(plano.total)} livros`),
          el('span', { class: 'ajuda' }, `  · ${Math.round(pctPlano * 100)}% feito, faltam ${num(plano.total - plano.traduzidos)}`)),
        barra(pctPlano, '#3aa55d')) : null,
      e.previsao?.livros ? el('div', { class: 'ajuda', style: 'margin-top:8px' },
        `Previsão: no ritmo dos últimos livros (~${num(e.previsao.porMinuto)} palavras por minuto), os ${num(e.previsao.livros)} livros da fila acabam em ~${e.previsao.dias < 1 ? 'menos de um dia' : `${num(Math.round(e.previsao.dias))} dia${Math.round(e.previsao.dias) === 1 ? '' : 's'}`}.`) : null,
      pu?.rodada?.total ? el('div', { class: 'ajuda', style: 'margin-top:8px' },
        `Nesta rodada: ${pu.rodada.feitos} prontos, ${pu.rodada.falhas} falharam, de ${pu.rodada.total}.`) : null,
      el('div', { class: 'cartoes', style: 'margin-top:14px' },
        cartao(e.publicadas, 'traduções no site'),
        cartao(e.fila.espera, 'pedidos esperando'),
        cartao(e.fila.na_esteira, 'na esteira'),
        cartao(e.fila.erro, 'com erro')),
      pu?.ultimos?.length ? el('div', { style: 'margin-top:14px' }, el('div', { class: 'ajuda' }, 'Últimos livros:'),
        el('ul', { style: 'margin:4px 0 0;padding-left:18px;font-size:14px' }, pu.ultimos.map((u) =>
          el('li', {}, u.ok ? '✓ ' : '✗ ', u.titulo, el('span', { class: 'ajuda' }, u.ok ? ` — ${num(u.palavras)} palavras, ${u.min} min` : ' — falhou'))))) : null,
      pu?.log?.length ? el('details', { style: 'margin-top:12px' }, el('summary', { class: 'ajuda', style: 'cursor:pointer' }, 'últimas linhas do log'),
        el('pre', { class: 'mono', style: 'white-space:pre-wrap;background:var(--fundo);padding:10px;border-radius:8px;max-height:220px;overflow:auto' }, pu.log.join('\n'))) : null)
  }
  // A primeira leitura espera a caixa entrar na página: chamada aqui, na hora,
  // ela ainda não está no documento e `atualizar` desistia — o painel ficava
  // 10 s em "Perguntando à esteira…".
  setTimeout(atualizar, 0)
  clearInterval(relogioEsteira)
  relogioEsteira = setInterval(atualizar, 10_000)
  return caixa
}

// ── correções comunitárias das traduções ──
function secaoCorrecoes(d) {
  const s = el('section', {}, el('h2', {}, 'Correções sugeridas pelos leitores'))
  s.append(el('p', { class: 'ajuda' },
    'Leitores selecionam um trecho estranho numa tradução da esteira e sugerem a forma certa. Aceitar troca o texto na hora ',
    'e credita quem sugeriu. Dá para ajustar a correção antes de aceitar.'))
  const decidir = async (dado) => {
    try { await pedir('/admin/correcao', dado); abaAtual = 'correcoes'; await desenhar() }
    catch (e) { main.prepend(recado('ruim', e.message)) }
  }
  if (!d.pendentes.length) s.append(el('div', { class: 'vazio' }, 'Nenhuma correção esperando.'))
  for (const c of d.pendentes) {
    const proposta = el('textarea', { style: 'min-height:60px;font-family:inherit' })
    proposta.value = c.proposta
    s.append(el('div', { class: 'grupo' },
      el('div', { class: 'ajuda' }, el('a', { href: `/#/obra/${c.obra_id}`, target: '_blank' }, c.obra), ` · capítulo ${c.capitulo_ordem} · por ${c.usuario ?? '(conta apagada)'}`),
      el('p', { style: 'margin:10px 0 6px;line-height:1.6' },
        c.contexto ? el('span', { class: 'ajuda' }, `…${c.contexto.antes}`) : '',
        el('del', { style: 'background:color-mix(in srgb,var(--alerta) 18%,transparent);text-decoration:line-through' }, c.trecho),
        c.contexto ? el('span', { class: 'ajuda' }, `${c.contexto.depois}…`) : ''),
      c.comentario ? el('p', { class: 'ajuda' }, `“${c.comentario}”`) : '',
      c.achados !== 1 ? recado('ruim', c.achados ? `O trecho aparece ${c.achados} vezes; não dá para aplicar sozinho.` : 'O trecho não está mais no capítulo.') : '',
      el('label', {}, 'fica assim'), proposta,
      el('div', { style: 'margin-top:8px;display:flex;gap:8px' },
        c.achados === 1 ? el('button', { onclick: () => decidir({ id: c.id, acao: 'aceitar', proposta: proposta.value }) }, 'Aceitar') : '',
        el('button', { class: 'fraco', onclick: () => decidir({ id: c.id, acao: 'recusar' }) }, 'Recusar'))))
  }
  if (d.livros.length) {
    s.append(el('h2', { style: 'margin-top:26px' }, 'Livros com correções'))
    const t = el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Livro'), el('th', {}, 'Aceitas'), el('th', {}, 'Revisores'), el('th', {}, ''))))
    const corpo = el('tbody', {})
    for (const l of d.livros) {
      corpo.append(el('tr', {},
        el('td', {}, el('a', { href: `/#/obra/${l.obra_id}`, target: '_blank' }, l.titulo)),
        el('td', { class: 'mono' }, num(l.aceitas)), el('td', { class: 'mono' }, num(l.pessoas)),
        el('td', {}, el('button', { class: 'fraco', onclick: async () => {
          try { await pedir('/admin/correcoes/revisado', { obra: l.obra_id, desfazer: !!l.revisada }); abaAtual = 'correcoes'; await desenhar() }
          catch (e) { main.prepend(recado('ruim', e.message)) }
        } }, l.revisada ? 'desmarcar revisado' : 'marcar como revisado'))))
    }
    t.append(corpo); s.append(t)
    s.append(el('p', { class: 'ajuda' }, 'Marcar como revisado tira o rótulo “tradução automática” do livro e credita os revisores.'))
  }
  return s
}

// ── assinaturas: todas as contas, com filtro, e o plano trocado na linha ──
//
// Até 19/09 a aba mostrava só quem já tinha plano, e dar um plano era digitar
// o nome de usuário num formulário. O dono pediu: ver todas as contas, filtrar
// por quem assina e por tipo de plano, e delegar dali (planos.listarContas).
const ROTULO_PLANO = { leitor: 'Grátis', novelo: 'Novelo', trama: 'Trama', tear: 'Tear' }
const FILTROS_CONTAS = [
  ['todos', 'Todas'], ['assinantes', 'Assinantes'], ['gratis', 'Grátis'], ['novelo', 'Novelo'], ['trama', 'Trama'],
  ['tear', 'Tear'], ['interessados', 'Querem assinar'], ['vencidos', 'Plano vencido'], ['admin', 'Administração'],
]
const PRAZOS = [['', 'sem prazo'], ['30', '30 dias'], ['90', '90 dias'], ['365', '1 ano']]
let estadoContas = { q: '', filtro: 'todos', pagina: 1 }
const dataCurta = (s) => (s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' }) : '—')
const estiloSelect = 'padding:6px;border-radius:7px;border:1px solid var(--linha);background:var(--fundo);color:var(--tinta)'

function secaoAssinaturas() {
  const s = el('section', {}, el('h2', {}, 'Assinaturas e contas'))
  s.append(el('p', { class: 'ajuda' },
    'Todas as contas do site. Troque o plano na própria linha e clique em "aplicar". O pagamento ainda não existe: quem tem plano é quem você concede aqui (cortesia). ',
    'Quem clicou em "me avise quando abrir" aparece em "Querem assinar". Contas de administração são sempre Tear. ',
    el('a', { href: '/assinaturas.html', target: '_blank' }, 'Ver a página de planos')))
  const resumo = el('div', { class: 'cartoes', style: 'margin:14px 0' })
  const chips = el('div', { class: 'aba', style: 'flex-wrap:wrap' })
  const busca = el('input', { type: 'search', placeholder: 'procurar por nome, usuário ou e-mail', value: estadoContas.q, style: 'max-width:340px' })
  const lista = el('div', {}, el('p', { class: 'ajuda' }, 'Carregando as contas…'))
  let espera = null
  busca.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(() => { estadoContas = { ...estadoContas, q: busca.value, pagina: 1 }; carregar() }, 300) })
  s.append(resumo, el('div', { style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap' }, busca), chips, lista)

  async function carregar() {
    let r
    try {
      const p = new URLSearchParams({ q: estadoContas.q, filtro: estadoContas.filtro, pagina: String(estadoContas.pagina) })
      r = await pedir(`/admin/contas?${p}`)
    } catch (e) { lista.replaceChildren(recado('ruim', e.message)); return }
    resumo.replaceChildren(
      cartao(r.resumo.todos, 'contas'), cartao(r.resumo.assinantes, 'com plano (inclui administração)'),
      cartao(r.resumo.novelo, 'Novelo'), cartao(r.resumo.trama, 'Trama'), cartao(r.resumo.tear, 'Tear'),
      cartao(r.resumo.interessados, 'querem assinar'))
    chips.replaceChildren(...FILTROS_CONTAS.map(([k, rot]) => el('button', { type: 'button', 'aria-selected': String(estadoContas.filtro === k),
      onclick: () => { estadoContas = { ...estadoContas, filtro: k, pagina: 1 }; carregar() } }, `${rot} (${num(r.resumo[k] ?? 0)})`)))
    if (!r.contas.length) { lista.replaceChildren(el('div', { class: 'vazio' }, 'Nenhuma conta neste filtro.')); return }
    const corpo = el('tbody')
    for (const c of r.contas) {
      const ehAdmin = c.papel === 'admin'
      const plano = el('select', { style: estiloSelect, disabled: ehAdmin ? '' : null },
        r.planos.map((p) => el('option', { value: p.chave }, ROTULO_PLANO[p.chave] ?? p.nome)))
      plano.value = c.planoAtual
      const prazo = el('select', { style: estiloSelect, title: 'Por quanto tempo', disabled: ehAdmin ? '' : null },
        PRAZOS.map(([v, rot]) => el('option', { value: v }, rot)))
      const aplicar = el('button', { type: 'button', style: 'padding:6px 12px;visibility:hidden', onclick: async () => {
        aplicar.disabled = true
        try {
          await pedir('/admin/assinatura', { usuario: c.usuario, plano: plano.value, dias: Number(prazo.value) || null, nota: 'pelo painel' })
          await carregar()
          main.prepend(recado('bom', plano.value === 'leitor' ? `${c.usuario} voltou ao plano Grátis.` : `${c.usuario} agora tem o plano ${ROTULO_PLANO[plano.value]}.`))
        } catch (e) { aplicar.disabled = false; main.prepend(recado('ruim', e.message)) }
      } }, 'aplicar')
      const mudou = () => { aplicar.style.visibility = plano.value !== c.planoAtual || prazo.value ? 'visible' : 'hidden' }
      plano.addEventListener('change', mudou); prazo.addEventListener('change', mudou)
      const situacao = ehAdmin ? el('span', { class: 'selo pronto' }, 'administração')
        : c.vencida ? el('span', { class: 'selo erro' }, `${ROTULO_PLANO[c.plano]} venceu ${dataCurta(c.ate)}`)
          : c.plano ? el('span', { class: 'selo pronto' }, c.ate ? `até ${dataCurta(c.ate)}` : 'sem prazo')
            : c.quer ? el('span', { class: 'selo espera' }, `quer o ${ROTULO_PLANO[c.quer]}`) : el('span', { class: 'ajuda' }, '—')
      corpo.append(el('tr', {},
        el('td', {}, el('div', {}, c.nome), el('div', { class: 'mono', style: 'color:var(--tinta2)' }, `@${c.usuario}${c.email ? ` · ${c.email}` : ''}${c.google ? ' · Google' : ''}`)),
        el('td', {}, el('div', { style: 'display:flex;gap:6px;align-items:center;flex-wrap:wrap' }, plano, prazo, aplicar)),
        el('td', {}, situacao),
        el('td', { class: 'mono' }, c.planoAtual === 'leitor' ? `${c.livros_mes} livro${c.livros_mes === 1 ? '' : 's'}` : '—'),
        el('td', { class: 'mono' }, dataCurta(c.visto_em)),
        el('td', { class: 'mono' }, dataCurta(c.criado_em))))
    }
    const tabela = el('table', { style: 'margin-top:12px' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Conta'), el('th', {}, 'Plano'), el('th', {}, 'Situação'), el('th', {}, 'Livros no mês'), el('th', {}, 'Visto'), el('th', {}, 'Criada'))),
      corpo)
    const paginas = r.paginas > 1 ? el('div', { class: 'aba' },
      el('button', { type: 'button', disabled: r.pagina <= 1 ? '' : null, onclick: () => { estadoContas.pagina = r.pagina - 1; carregar() } }, '← anteriores'),
      el('span', { class: 'ajuda', style: 'align-self:center' }, `página ${r.pagina} de ${r.paginas} · ${num(r.total)} contas`),
      el('button', { type: 'button', disabled: r.pagina >= r.paginas ? '' : null, onclick: () => { estadoContas.pagina = r.pagina + 1; carregar() } }, 'próximas →')) : null
    lista.replaceChildren(el('div', { style: 'overflow-x:auto' }, tabela), paginas ?? '')
  }
  carregar()
  return s
}

// ── mensagens: o "fale com a gente" e os avisos de direito autoral ──
function secaoMensagens() {
  const s = el('section', {}, el('h2', {}, 'Mensagens'))
  s.append(el('p', { class: 'ajuda' }, 'O que chega pelo formulário de /direitos.html. Aviso de direito autoral pede resposta rápida: esconda a obra em Acervo enquanto verifica e responda no e-mail da pessoa.'))
  const lista = el('div', {}, el('p', { class: 'ajuda' }, 'Carregando…'))
  s.append(lista)
  async function carregar() {
    let r
    try { r = await pedir('/admin/contatos') } catch (e) { lista.replaceChildren(recado('ruim', e.message)); return }
    if (!r.mensagens.length) { lista.replaceChildren(el('div', { class: 'vazio' }, 'Nenhuma mensagem ainda.')); return }
    lista.replaceChildren(...r.mensagens.map((m) => el('div', { class: 'grupo', style: m.resolvido_em ? 'opacity:.6' : '' },
      el('div', { style: 'display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap' },
        el('h3', {}, r.tipos[m.tipo] ?? m.tipo),
        el('span', { class: `selo ${m.resolvido_em ? 'pronto' : m.tipo === 'direito' ? 'erro' : 'espera'}` }, m.resolvido_em ? `resolvida ${dataCurta(m.resolvido_em)}` : `FIO-${String(m.id).padStart(5, '0')} · ${dataCurta(m.criado_em)}`)),
      el('p', { style: 'margin:8px 0 4px' }, el('b', {}, m.nome), ' · ', el('a', { href: `mailto:${m.email}` }, m.email)),
      m.obra ? el('p', { class: 'mono', style: 'margin:0 0 6px' }, m.obra) : null,
      el('p', { style: 'white-space:pre-wrap;margin:0 0 10px' }, m.mensagem),
      m.resposta ? el('p', { class: 'ajuda' }, `Nota: ${m.resposta}`) : null,
      el('button', { type: 'button', class: m.resolvido_em ? 'fraco' : '', onclick: async () => {
        const nota = m.resolvido_em ? '' : (prompt('Uma nota para você: o que foi feito?', '') ?? '')
        try { await pedir('/admin/contato/resolver', { id: m.id, resposta: nota, desfazer: !!m.resolvido_em }); carregar() } catch (e) { main.prepend(recado('ruim', e.message)) }
      } }, m.resolvido_em ? 'reabrir' : 'marcar como resolvida'))))
  }
  carregar()
  return s
}

// ── publicações: a fila de revisão e as denúncias ──
function secaoPublicacoes(d) {
  const s = el('section', {}, el('h2', {}, 'Revisão de publicações'))
  s.append(el('p', { class: 'ajuda' },
    'Nada novo aparece no site sem passar por aqui, e nada sai do ar sem você decidir: denúncia e edição de capítulo publicado ',
    'esperam aqui com a versão atual no ar. Abra a obra (“ver”) antes de aprovar. Recusar e suspender pedem motivo, que vai para o autor.'))

  const decidir = async (dado, pedirMotivo) => {
    let motivo = null
    if (pedirMotivo) { motivo = prompt('Motivo (vai para o autor):'); if (!motivo) return }
    try { await pedir('/admin/publicacao', { ...dado, motivo }); abaAtual = 'publicacoes'; await desenhar() }
    catch (e) { main.prepend(recado('ruim', e.message)) }
  }
  const bt = (rotulo, dado, pedirMotivo, fraco = true) =>
    el('button', { class: fraco ? 'fraco' : '', style: 'margin:2px', onclick: () => decidir(dado, pedirMotivo) }, rotulo)

  if (!d.obras.length) s.append(el('div', { class: 'vazio' }, 'Nada esperando revisão.'))
  for (const o of d.obras) {
    const caixa = el('div', { class: 'grupo' })
    caixa.append(el('div', { style: 'display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap' },
      o.capa ? el('img', { src: o.capa, alt: '', style: 'width:80px;aspect-ratio:2/3;object-fit:cover;border-radius:4px' }) : '',
      o.capa_pendente ? el('div', {}, el('div', { class: 'ajuda' }, 'capa nova'), el('img', { src: o.capa_pendente, alt: '', style: 'width:80px;aspect-ratio:2/3;object-fit:cover;border-radius:4px' })) : '',
      el('div', { style: 'flex:1;min-width:220px' },
        el('h3', {}, o.titulo),
        el('div', { class: 'ajuda' }, `${o.tipo} · ${o.formato} · ${o.classificacao === 'livre' ? 'livre' : o.classificacao + '+'} · por ${o.usuario} · ${o.estado}`),
        o.declarou_autoria ? el('div', { class: 'ajuda mono' }, `declarou autoria: ${o.declarou_autoria}`) : '',
        o.motivo ? el('div', { class: 'ajuda', style: 'color:var(--alerta)' }, o.motivo) : '',
        el('div', { style: 'margin-top:8px' },
          el('a', { href: `/publicacoes.html?id=${o.id}`, target: '_blank' }, 'ver a obra'), ' ',
          o.estado === 'revisao' ? bt('Aprovar obra', { alvo: 'obra', id: o.id, acao: 'aprovar' }, false, false) : '',
          o.estado === 'revisao' ? bt('Recusar', { alvo: 'obra', id: o.id, acao: 'recusar' }, true) : '',
          o.estado === 'suspensa' ? bt('Reativar', { alvo: 'obra', id: o.id, acao: 'reativar' }, false, false) : '',
          o.estado === 'publicada' ? bt('Suspender', { alvo: 'obra', id: o.id, acao: 'suspender' }, true) : '',
          o.capa_pendente ? bt('Aprovar capa', { alvo: 'capa', id: o.id, acao: 'aprovar' }) : '',
          o.capa_pendente ? bt('Recusar capa', { alvo: 'capa', id: o.id, acao: 'recusar' }, true) : ''))))
    if (o.partes.length && o.estado !== 'revisao') {
      const lista = el('div', { style: 'margin-top:10px' }, el('div', { class: 'ajuda' }, 'Capítulos esperando revisão:'))
      for (const x of o.partes) {
        lista.append(el('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:4px 0;border-top:1px solid var(--linha)' },
          el('span', {}, `${x.ordem}. ${x.titulo}`), x.edicao ? el('span', { class: 'selo espera' }, 'edição de capítulo no ar') : '',
          el('span', { class: 'ajuda' }, x.paginas ? `${x.paginas} páginas` : `${x.palavras} palavras`),
          el('a', { href: `/publicacoes.html?id=${o.id}&cap=${x.ordem}`, target: '_blank' }, 'ler'),
          bt('Aprovar', { alvo: 'parte', id: x.id, acao: 'aprovar' }, false, false),
          bt('Recusar', { alvo: 'parte', id: x.id, acao: 'recusar' }, true)))
      }
      caixa.append(lista)
    } else if (o.partes.length) {
      caixa.append(el('div', { class: 'ajuda', style: 'margin-top:6px' }, `${o.partes.length} capítulo(s) entram junto com a aprovação da obra.`))
    }
    s.append(caixa)
  }

  if (d.denuncias.length) {
    s.append(el('h2', { style: 'margin-top:26px' }, `Denúncias abertas (${d.denuncias.length})`))
    const t = el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Obra'), el('th', {}, 'Motivo'), el('th', {}, 'Quem'), el('th', {}, ''))))
    const corpo = el('tbody', {})
    for (const x of d.denuncias) {
      corpo.append(el('tr', {},
        el('td', {}, el('a', { href: `/publicacoes.html?id=${x.publicacao_id}`, target: '_blank' }, `#${x.publicacao_id}`)),
        el('td', {}, x.motivoNome, x.detalhe ? el('div', { class: 'ajuda' }, x.detalhe) : ''),
        el('td', {}, x.usuario || '(conta apagada)'),
        el('td', {}, bt('resolvida', { alvo: 'denuncia', id: x.id, acao: 'resolver' }))))
    }
    t.append(corpo); s.append(t)
  }

  if (d.publicadas.length) {
    s.append(el('h2', { style: 'margin-top:26px' }, 'No ar'))
    const t = el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Obra'), el('th', {}, 'Autor'), el('th', {}, 'Leituras'), el('th', {}, ''))))
    const corpo = el('tbody', {})
    for (const x of d.publicadas) {
      corpo.append(el('tr', {},
        el('td', {}, el('a', { href: `/publicacoes.html?id=${x.id}`, target: '_blank' }, x.titulo)),
        el('td', {}, x.usuario), el('td', { class: 'mono' }, num(x.leituras)),
        el('td', {}, bt('suspender', { alvo: 'obra', id: x.id, acao: 'suspender' }, true))))
    }
    t.append(corpo); s.append(t)
  }
  return s
}

// A navegação do painel: três frentes, uma de cada vez. Guarda a escolha em
// memória para redesenhos não voltarem sempre ao começo.
let abaAtual = 'controle'
function abas(defs) {
  const barra = el('div', { class: 'aba', style: 'margin:0 0 22px' })
  const alvo = el('div', {})
  const pintar = () => {
    const def = defs.find((d) => d[0] === abaAtual) ?? defs[0]
    for (const b of barra.children) b.setAttribute('aria-selected', String(b._chave === def[0]))
    alvo.replaceChildren(...def[2]())
  }
  for (const [chave, rotulo] of defs) {
    const b = el('button', { onclick: () => { abaAtual = chave; pintar() } }, rotulo)
    b._chave = chave
    barra.append(b)
  }
  pintar()
  return el('div', {}, barra, alvo)
}

const recado = (tipo, texto) => el('div', { class: `recado ${tipo}` }, texto)

function cartao(n, r) {
  return el('div', { class: 'cartao' }, el('div', { class: 'n' }, num(n)), el('div', { class: 'r' }, r))
}

function panorama(p) {
  const a = p.acervo
  return el('section', {},
    el('h2', {}, 'O acervo'),
    el('div', { class: 'cartoes' },
      cartao(a.legiveis, 'livros para ler'),
      cartao(a.obras, 'obras no catálogo'),
      cartao(a.nossas, 'traduzidos por nós'),
      cartao(Math.round(a.palavras / 1e6) + ' mi', 'palavras'),
      cartao(a.autores, 'autores'),
      cartao(p.leitores.contas, 'contas de leitor')))
}

function secaoFila(itens) {
  const s = el('section', {}, el('h2', {}, `Fila de tradução (${itens.length})`))
  if (!itens.length) { s.append(el('div', { class: 'vazio' }, 'A fila está vazia. Adicione livros abaixo.')); return s }
  const t = el('table', {},
    el('thead', {}, el('tr', {},
      el('th', {}, 'Título'), el('th', {}, 'Autor'), el('th', {}, 'De'),
      el('th', {}, 'Estado'), el('th', {}, ''))))
  const corpo = el('tbody', {})
  for (const it of itens) {
    const acao = el('span', {},
      it.estado === 'erro' ? el('button', { class: 'fraco', onclick: () => retentar(it.id) }, 'tentar de novo') : '',
      ['espera', 'erro'].includes(it.estado) ? el('button', { class: 'fraco', onclick: () => remover(it.id) }, 'tirar') : '')
    // Na esteira depois de uma falha: diz quando volta, em vez de parecer parado.
    const volta = it.estado === 'na_esteira' && it.tentar_depois
      ? el('div', { class: 'ajuda', style: 'font-size:12px' }, `falhou ${it.tentativas}× · tenta de novo às ${new Date(it.tentar_depois.replace(' ', 'T') + 'Z').toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}`)
      : null
    corpo.append(el('tr', {},
      el('td', {}, it.titulo),
      el('td', {}, it.autor),
      el('td', { class: 'mono' }, it.idioma),
      el('td', {}, el('span', { class: `selo ${it.estado}`, title: it.nota || '' }, rotulo(it.estado)), volta,
        it.estado === 'erro' && it.nota ? el('div', { class: 'ajuda', style: 'font-size:12px;max-width:340px' }, it.nota) : null),
      el('td', {}, acao)))
  }
  t.append(corpo); s.append(t)
  return s
}

const rotulo = (e) => ({ espera: 'esperando', na_esteira: 'na esteira', pronto: 'pronto', erro: 'erro' }[e] ?? e)

function secaoAdicionar() {
  const s = el('section', {}, el('h2', {}, 'Adicionar livros à fila'))
  s.append(el('p', { class: 'ajuda' },
    'Só domínio público, e a fonte tem de ser o original no Project Gutenberg. ',
    'A esteira roda sozinha na VPS, dia e noite: pega esta fila, traduz e publica. Os livros aparecem no site quando ficam prontos.'))

  const abas = el('div', { class: 'aba' })
  const bUm = el('button', { 'aria-selected': 'true' }, 'Um livro')
  const bLote = el('button', { 'aria-selected': 'false' }, 'Vários (colar lista)')
  abas.append(bUm, bLote)
  s.append(abas)

  // ── um livro ──
  const titulo = el('input', { placeholder: 'em português, ex.: A Ilha do Tesouro' })
  const autor = el('input', { placeholder: 'ex.: Robert Louis Stevenson' })
  const gut = el('input', { placeholder: 'id ou URL do Gutenberg, ex.: 120' })
  const idioma = el('input', { placeholder: 'en', value: 'en' })
  const formUm = el('form', { class: 'add', onsubmit: enviarUm },
    el('div', { class: 'campos' },
      el('div', {}, el('label', {}, 'Título'), titulo),
      el('div', {}, el('label', {}, 'Autor'), autor),
      el('div', {}, el('label', {}, 'Gutenberg'), gut),
      el('div', {}, el('label', {}, 'Língua'), idioma)),
    el('div', { style: 'margin-top:12px' }, el('button', {}, 'Adicionar à fila')))

  // ── lote ──
  const area = el('textarea', {
    placeholder: 'Um por linha, separado por | :\nTítulo | Autor | id-do-gutenberg | língua\n\nA Ilha do Tesouro | Robert Louis Stevenson | 120 | en\nFrankenstein | Mary Shelley | 84 | en',
  })
  const formLote = el('form', { class: 'add', hidden: true, onsubmit: enviarLote },
    area, el('div', { style: 'margin-top:12px' }, el('button', {}, 'Adicionar todos')))

  bUm.onclick = () => { bUm.setAttribute('aria-selected', 'true'); bLote.setAttribute('aria-selected', 'false'); formUm.hidden = false; formLote.hidden = true }
  bLote.onclick = () => { bLote.setAttribute('aria-selected', 'true'); bUm.setAttribute('aria-selected', 'false'); formLote.hidden = false; formUm.hidden = true }

  s.append(formUm, formLote)
  s._campos = { titulo, autor, gut, idioma, area }
  return s
}

async function enviar(livros, botao) {
  botao.disabled = true
  try {
    const r = await pedir('/fila', { livros })
    const msg = `${r.aceitos} adicionado(s)` + (r.recusados.length ? `, ${r.recusados.length} recusado(s)` : '')
    await desenhar()
    main.prepend(recado(r.aceitos ? 'bom' : 'ruim', msg + (r.recusados[0] ? ` — ${r.recusados[0].porque}` : '')))
  } catch (e) {
    botao.disabled = false
    main.prepend(recado('ruim', e.message))
  }
}

function enviarUm(ev) {
  ev.preventDefault()
  const c = ev.target.closest('section')._campos
  enviar([{ titulo: c.titulo.value, autor: c.autor.value, gutenberg: c.gut.value, idioma: c.idioma.value }], ev.submitter)
}

function enviarLote(ev) {
  ev.preventDefault()
  const c = ev.target.closest('section')._campos
  const livros = c.area.value.split('\n').map((l) => l.trim()).filter(Boolean).map((linha) => {
    const [titulo, autor, gutenberg, idioma] = linha.split('|').map((x) => x.trim())
    return { titulo, autor, gutenberg, idioma: idioma || 'en' }
  })
  if (!livros.length) return
  enviar(livros, ev.submitter)
}

async function retentar(id) {
  try { await pedir('/fila/retentar', { id }); await desenhar() }
  catch (e) { main.prepend(recado('ruim', e.message)) }
}

async function remover(id) {
  try { await pedir('/fila/remover', { id }); await desenhar() }
  catch (e) { main.prepend(recado('ruim', e.message)) }
}

// ── a sala de controle (/api/admin/controle, servidor/controle.mjs) ──
//
// Responde "está tudo funcionando, e preciso abrir alguma coisa?". Nada no PC
// precisa ficar aberto: site, esteira e backup rodam na VPS sozinhos; no PC só
// a cópia diária, escondida. Atualiza a cada 30 s enquanto está na tela.
let relogioControle = null
function secaoControle() {
  const s = el('section', {}, el('p', { class: 'ajuda' }, 'Olhando tudo…'))
  const mb = (b) => b == null ? '—' : b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`
  const quando = (iso) => { const d = new Date(String(iso ?? '').replace(' ', 'T') + (/Z|[+-]\d\d:?\d\d$/.test(iso ?? '') ? '' : 'Z')); return isNaN(d) ? '—' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) }
  const cor = { ok: '#3aa55d', atencao: 'var(--dourado)', problema: 'var(--alerta)' }
  const texto = (n, r) => el('div', { class: 'cartao' }, el('div', { class: 'n' }, n), el('div', { class: 'r' }, r))
  const linha = (rotulo, valor) => el('div', { class: 'liga' }, el('span', {}, rotulo), el('span', { class: 'ajuda', style: 'text-align:right' }, valor))

  async function atualizar() {
    if (!document.body.contains(s)) { clearInterval(relogioControle); relogioControle = null; return }
    let r
    try { r = await pedir('/admin/controle') } catch (x) { s.replaceChildren(recado('ruim', x.message)); return }
    const faltas = r.avisos.filter((a) => a.nivel !== 'ok')
    const topo = faltas.some((a) => a.nivel === 'problema') ? ['ruim', 'Tem coisa pedindo atenção — veja em vermelho abaixo.']
      : faltas.length ? ['bom', 'Tudo no ar. Alguns detalhes em amarelo abaixo.']
      : ['bom', 'Tudo funcionando. Nada precisa ficar aberto no seu PC.']
    const m = r.maquina, seg = r.seguranca

    const sair = el('button', { class: 'fraco', onclick: async () => {
      sair.disabled = true
      // redesenha primeiro: `atualizar` troca o conteúdo e apagaria o recado
      try { const x = await pedir('/sair-dos-outros', {}); await atualizar(); s.prepend(recado('bom', `${x.encerradas} sessão(ões) encerrada(s).`)) }
      catch (x) { sair.disabled = false; s.prepend(recado('ruim', x.message)) }
    } }, 'Sair de todos os outros aparelhos')

    // Os dois interruptores. Nenhum deles mexe na máquina: o site "desligado"
    // mostra a página de manutenção a quem não é admin (servidor/manutencao.mjs),
    // e a esteira desligada termina o livro em curso e para.
    const interruptor = (rotulo, estadoTexto, ligado, textoBotao, confirmar, acao) => {
      const b = el('button', { class: ligado ? 'fraco' : '', onclick: async () => {
        if (confirmar && !confirm(confirmar)) return
        b.disabled = true
        try { await acao(); await atualizar() } catch (x) { b.disabled = false; s.prepend(recado('ruim', x.message)) }
      } }, textoBotao)
      return el('div', { class: 'liga' },
        el('span', {}, el('b', {}, rotulo), ' ', el('span', { class: 'ajuda' }, estadoTexto)), b)
    }
    const siteNoAr = !r.site.manutencao
    const esteiraLigada = !r.esteira.pausada

    s.replaceChildren(
      el('h2', {}, 'Controle'),
      recado(...topo),
      el('div', { class: 'grupo' }, el('h3', {}, 'Ligar e desligar'),
        interruptor('Site', siteNoAr ? 'no ar para todo mundo' : 'desligado: os leitores veem "voltamos já"; só você vê o site',
          siteNoAr, siteNoAr ? 'Desligar para os leitores' : 'Religar o site',
          siteNoAr ? 'Desligar o site para os leitores? Eles verão uma página de "voltamos já" até você religar.' : null,
          () => pedir('/ajustes', { manutencao: siteNoAr })),
        interruptor('Esteira de tradução', (!esteiraLigada ? 'desligada' : !r.esteira.viva ? 'ligada, mas sem sinal (veja abaixo)'
          : r.esteira.estado === 'ociosa' ? 'ligada, em dia' : 'ligada, traduzindo')
          + (r.esteira.previsao?.livros ? ` · fila de ${num(r.esteira.previsao.livros)} livros, acaba em ~${Math.max(1, Math.round(r.esteira.previsao.dias))} dia(s)` : ''),
          esteiraLigada, esteiraLigada ? 'Desligar a esteira' : 'Ligar a esteira',
          esteiraLigada ? 'Desligar a esteira? O livro que está sendo traduzido termina, e ela para.' : null,
          () => pedir('/admin/esteira/pausa', { pausada: esteiraLigada })),
        el('p', { class: 'ajuda', style: 'margin:8px 0 0' }, 'Se o site inteiro sair do ar e este painel não abrir, os comandos de emergência estão em docs/COMANDOS.md.')),
      el('div', { class: 'grupo' }, el('h3', {}, 'O que está rodando'),
        el('ul', { style: 'list-style:none;margin:8px 0 0;padding:0' }, r.avisos.map((a) =>
          el('li', { style: 'display:flex;gap:10px;align-items:baseline;padding:7px 0;border-top:1px solid var(--linha);flex-wrap:wrap' },
            el('span', { style: `flex:none;width:9px;height:9px;border-radius:50%;background:${cor[a.nivel]}` }),
            el('b', { style: 'flex:none;min-width:150px;font-family:ui-sans-serif,system-ui,sans-serif;font-size:14px' }, a.assunto),
            el('span', { style: 'flex:1;min-width:200px' }, a.texto))))),

      el('div', { class: 'grupo' }, el('h3', {}, 'Onde cada coisa roda'),
        el('p', { class: 'ajuda', style: 'margin:6px 0 4px' }, 'Na VPS, sempre, com o seu PC ligado ou não: o site, a esteira de tradução e o backup do banco (todo dia às 03:20). Se um deles cair, volta sozinho.'),
        el('p', { class: 'ajuda', style: 'margin:0 0 8px' }, 'No seu PC: nada. Nenhum programa da Fiolib roda no computador.'),
        linha('Versão do servidor no ar', r.site.versao ? `${r.site.versao.commit} · ${quando(r.site.versao.quando)}` : '—'),
        linha('Último backup do banco', r.backup ? `${quando(r.backup.quando)} · ${mb(r.backup.bytes)}` : '—'),
        r.copiaPc ? linha('Última cópia feita à mão no PC', quando(r.copiaPc.quando)) : null),

      el('div', { class: 'grupo' }, el('h3', {}, 'A máquina'),
        el('div', { class: 'cartoes', style: 'margin-top:10px' },
          texto(mb(m.memoria?.livre), `memória livre de ${mb(m.memoria?.total)}`),
          texto(m.memoria?.swapTotal ? mb(m.memoria.swapTotal - m.memoria.swapLivre) : 'sem', m.memoria?.swapTotal ? `reserva usada de ${mb(m.memoria.swapTotal)}` : 'memória de reserva'),
          texto(mb(m.disco?.livre), `disco livre de ${mb(m.disco?.total)}`),
          texto(m.carga[0].toFixed(2), `carga (${m.nucleos} núcleo${m.nucleos > 1 ? 's' : ''})`),
          texto(mb(m.banco), 'o banco'),
          texto(mb(r.site.memoria), 'memória do site')),
        r.vps ? el('div', { style: 'margin-top:10px' },
          linha('Conferida pela última vez', quando(r.vps.quando)),
          linha('Tentativas de invasão por SSH barradas (24 h)', num(r.vps.ssh_barradas)),
          linha('Endereços bloqueados agora', num(r.vps.banidos)),
          linha('Atualizações de segurança pendentes', num(r.vps.atualizacoes)),
          linha('Reinício pedido pelo sistema', r.vps.reiniciar ? 'sim' : 'não')) : null),

      el('div', { class: 'grupo' }, el('h3', {}, 'Segurança do painel'),
        linha('Entrada da administração', seg.soGoogle ? 'só pelo Google do dono ✓' : 'com senha (ligue o Google nesta conta)'),
        linha('Senhas erradas na administração (24 h)', num(seg.tentativas.admin)),
        linha('Senhas erradas no site todo (24 h)', num(seg.tentativas.total)),
        seg.alertas.length ? el('div', { style: 'margin-top:10px' }, el('div', { class: 'ajuda' }, 'Alertas:'),
          el('ul', { style: 'margin:4px 0 0;padding-left:18px;font-size:14px' }, seg.alertas.map((a) =>
            el('li', {}, quando(a.quando), ' — ', a.tipo === 'senha-admin-certa' ? 'senha CERTA da administração digitada fora do Google (barrada) ' : a.tipo + ' ', el('span', { class: 'ajuda' }, a.detalhe))))) : null,
        el('div', { class: 'ajuda', style: 'margin:14px 0 6px' }, 'Aparelhos com o painel aberto (cada sessão vale 7 dias):'),
        el('table', {}, el('tbody', {}, seg.sessoes.map((x) => el('tr', {},
          el('td', {}, x.aparelho, x.esta ? el('b', {}, ' (este)') : ''),
          el('td', { class: 'mono' }, x.de ?? ''),
          el('td', { class: 'mono' }, `desde ${quando(x.desde)}`))))),
        el('div', { style: 'margin-top:10px' }, sair)),

      el('div', { class: 'grupo' }, el('h3', {}, 'Diário do painel'),
        el('p', { class: 'ajuda', style: 'margin:4px 0 10px' }, 'Tudo que foi feito com a conta de administração: entradas e mudanças, com o aparelho ou a faixa de rede de onde veio.'),
        r.diario.length ? el('table', {}, el('tbody', {}, r.diario.map((d) => el('tr', {},
          el('td', { class: 'mono', style: 'white-space:nowrap' }, quando(d.quando)),
          el('td', {}, el('b', {}, d.usuario ?? '—'), ' ', d.acao, d.resumo ? el('div', { class: 'ajuda mono' }, d.resumo) : null),
          el('td', { class: 'mono' }, d.de ?? ''))))) : el('p', { class: 'vazio' }, 'Nada registrado ainda.')))
  }
  setTimeout(atualizar, 0)
  clearInterval(relogioControle)
  relogioControle = setInterval(atualizar, 30_000)
  return s
}

// ── a central de configurações, por seções ──
function grupo(titulo, descricao, ...filhos) {
  return el('div', { class: 'grupo' },
    el('h3', {}, titulo),
    descricao ? el('p', { class: 'ajuda', style: 'margin:2px 0 12px' }, descricao) : '',
    ...filhos)
}

function chave(rotulo, ligado, aoMudar) {
  const inp = el('input', { type: 'checkbox' })
  inp.checked = ligado
  inp.addEventListener('change', () => aoMudar(inp.checked))
  return el('label', { class: 'liga' }, el('span', {}, rotulo), inp)
}

function secaoAjustes(a) {
  const estado = { cadastro_aberto: a.cadastro_aberto, amostra: a.amostra }
  const livrosCampo = el('input', { type: 'number', min: '0', max: '100', value: String(a.gratis_livros_mes), style: 'max-width:100px' })

  const s = el('section', {}, el('h2', {}, 'Configurações'))

  s.append(grupo('Quem entra',
    'Com o cadastro aberto, qualquer pessoa cria conta sem precisar de convite. Fechado, só entra quem recebe um código.',
    chave('Cadastro aberto (sem convite)', estado.cadastro_aberto, (v) => { estado.cadastro_aberto = v })))

  s.append(grupo('Quem lê o quê',
    'Sem conta, a pessoa lê só o primeiro capítulo de cada livro (e o primeiro volume de cada quadrinho). No plano grátis, abre um número de livros novos a cada 30 dias; o que já abriu fica aberto. Leis não contam. Planos pagos não têm limite.',
    chave('Sem conta: só o primeiro capítulo', estado.amostra, (v) => { estado.amostra = v }),
    el('label', { class: 'liga', style: 'margin-top:10px' },
      el('span', {}, 'Plano grátis: livros novos por mês'), livrosCampo)))

  s.append(grupo('Esteira e jurisdição',
    'Só leitura. Mudam pelo ambiente do servidor, não por aqui.',
    el('div', { class: 'cartoes' },
      cartao(a.esteira_paralelo, 'traduções em paralelo'),
      cartao(a.jurisdicao, 'jurisdição de direito'))))

  const botao = el('button', {}, 'Salvar configurações')
  const salvar = el('form', { class: 'add', onsubmit: async (ev) => {
    ev.preventDefault()
    botao.disabled = true
    try {
      await pedir('/ajustes', {
        cadastro_aberto: estado.cadastro_aberto,
        amostra: estado.amostra,
        gratis_livros_mes: Number(livrosCampo.value),
      })
      await desenhar()
      main.prepend(recado('bom', 'Configurações salvas.'))
    } catch (e) { botao.disabled = false; main.prepend(recado('ruim', e.message)) }
  } }, el('div', {}, botao))
  s.append(salvar)
  return s
}

function recentes(lista) {
  const s = el('section', {}, el('h2', {}, 'Últimos que subiram'))
  if (!lista?.length) { s.append(el('div', { class: 'vazio' }, 'nada ainda')); return s }
  const t = el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Título'), el('th', {}, 'Autor'), el('th', {}, 'Quando'))))
  const corpo = el('tbody', {})
  for (const o of lista) {
    corpo.append(el('tr', {},
      // o site navega por hash: `/obra/12` abria a home
      el('td', {}, el('a', { href: `/#/obra/${o.id}` }, o.titulo)),
      el('td', {}, o.autor || '—'),
      el('td', { class: 'mono' }, (o.criado_em || '').slice(0, 16))))
  }
  t.append(corpo); s.append(t)
  return s
}

iniciar()
