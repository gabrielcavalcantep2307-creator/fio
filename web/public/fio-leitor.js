// O que o leitor de livros do app ganhou por fora do bundle (17/09):
//
//   1. OUVIR — o botão "ouvir" do leitor já existia. Agora é benefício de plano:
//      o bundle remendado pergunta `window.fioVoz` antes de falar, e manda para
//      /assinaturas.html?por=voz quando é false. Aqui também fica o controle de
//      velocidade (o bundle lê `fio:voz-vel` ao começar a falar).
//   2. CORREÇÕES — nos livros traduzidos pelo Fio, selecionar um trecho mostra
//      "sugerir correção". A sugestão vai para a fila do painel.
//
// Carregado pelo index.html do app. Nada aqui escreve HTML: só nós de texto.

(function () {
  const h = (tag, attrs = {}, ...filhos) => {
    const e = document.createElement(tag)
    for (const [k, v] of Object.entries(attrs)) {
      if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v)
      else if (v != null && v !== false) e.setAttribute(k, v === true ? '' : v)
    }
    for (const f of filhos.flat()) if (f != null && f !== false) e.append(f.nodeType ? f : document.createTextNode(String(f)))
    return e
  }
  const api = (c, corpo) => fetch('/api' + c, {
    method: corpo ? 'POST' : 'GET', credentials: 'same-origin',
    headers: corpo ? { 'content-type': 'application/json', 'x-fio': '1' } : {},
    body: corpo ? JSON.stringify(corpo) : undefined,
  }).then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.erro || `erro ${r.status}`), { status: r.status }); return j })

  // ── abrir a busca quando alguém chegou de outra página pedindo ──
  // (o bundle remendado olha esta marca; aqui só garantimos que ela some)

  // ── o plano: voz ──
  let plano = null
  function lerPlano() {
    return api('/planos').then((v) => { plano = v.meu; window.fioVoz = !!v.meu?.voz; mostrarChipVoz() }).catch(() => { window.fioVoz = false })
  }
  lerPlano()
  addEventListener('focus', () => lerPlano())

  // ── rota ──
  const rotaLeitor = () => location.hash.match(/^#\/ler\/(\d+)/)?.[1] ?? null

  // ── velocidade da voz: um chip fixo, só no leitor ──
  const VELOCIDADES = [0.8, 1, 1.2, 1.5, 1.8]
  const velAtual = () => Number(localStorage.getItem('fio:voz-vel')) || 1
  const chipVoz = h('button', {
    type: 'button', title: 'Velocidade da voz (vale na próxima vez que tocar em ouvir)',
    style: 'position:fixed;right:14px;bottom:70px;z-index:60;border:1px solid var(--linha);background:var(--papel);color:var(--tinta-2);border-radius:999px;padding:6px 12px;font:12px Inter,system-ui,sans-serif;cursor:pointer;display:none;box-shadow:0 6px 18px -10px rgba(0,0,0,.5)',
    onclick: () => {
      const i = VELOCIDADES.indexOf(velAtual())
      const nova = VELOCIDADES[(i + 1) % VELOCIDADES.length]
      try { localStorage.setItem('fio:voz-vel', String(nova)) } catch {}
      pintarChip()
      // se estiver falando, recomeça do trecho atual com a velocidade nova
      const botao = [...document.querySelectorAll('button')].find((b) => b.textContent === 'parar a voz')
      if (botao) { botao.click(); setTimeout(() => [...document.querySelectorAll('button')].find((b) => b.textContent === 'ouvir')?.click(), 150) }
    },
  })
  const pintarChip = () => { chipVoz.textContent = `voz ${String(velAtual()).replace('.', ',')}×` }
  pintarChip()

  // ── correções ──
  let resumo = null, obraAtual = null
  const botaoCorrigir = h('button', {
    type: 'button',
    style: 'position:absolute;z-index:70;display:none;background:var(--acento);color:#fff;border:none;border-radius:999px;padding:6px 12px;font:13px Inter,system-ui,sans-serif;cursor:pointer;box-shadow:0 8px 20px -8px rgba(0,0,0,.6)',
    onmousedown: (e) => e.preventDefault(),
    onclick: () => abrirCorrecao(),
  }, 'sugerir correção')
  const chipRevisao = h('div', {
    style: 'position:fixed;left:14px;bottom:70px;z-index:60;max-width:min(360px,70vw);border:1px solid var(--linha);background:var(--papel);color:var(--tinta-2);border-radius:12px;padding:8px 12px;font:12px/1.4 Inter,system-ui,sans-serif;display:none;box-shadow:0 6px 18px -10px rgba(0,0,0,.5)',
  })
  let trechoSelecionado = ''

  function textoSelecionado() {
    const sel = getSelection()
    if (!sel || sel.isCollapsed) return null
    const t = sel.toString().replace(/\s+/g, ' ').trim()
    if (t.length < 3 || t.length > 600) return null
    const no = sel.anchorNode?.parentElement
    if (!no?.closest?.('.colunas, article, main')) return null
    return { t, ret: sel.getRangeAt(0).getBoundingClientRect() }
  }

  function aoSelecionar() {
    if (!resumo || !rotaLeitor()) { botaoCorrigir.style.display = 'none'; return }
    const s = textoSelecionado()
    if (!s) { botaoCorrigir.style.display = 'none'; return }
    trechoSelecionado = s.t
    botaoCorrigir.style.display = 'block'
    botaoCorrigir.style.top = `${scrollY + s.ret.bottom + 8}px`
    botaoCorrigir.style.left = `${Math.max(8, Math.min(scrollX + s.ret.left, scrollX + innerWidth - 170))}px`
  }
  let espera = null
  document.addEventListener('selectionchange', () => { clearTimeout(espera); espera = setTimeout(aoSelecionar, 250) })

  function abrirCorrecao() {
    botaoCorrigir.style.display = 'none'
    const trecho = trechoSelecionado
    const proposta = h('textarea', { rows: '4', style: 'width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--linha);border-radius:8px;background:var(--papel);color:var(--tinta);font:15px/1.5 Literata,Georgia,serif' })
    proposta.value = trecho
    const comentario = h('input', { type: 'text', maxlength: '400', placeholder: 'Por quê? (opcional — ex.: “no original é ironia”)', style: 'width:100%;box-sizing:border-box;margin-top:8px;padding:8px 10px;border:1px solid var(--linha);border-radius:8px;background:var(--papel);color:var(--tinta);font:14px Inter,system-ui,sans-serif' })
    const saida = h('p', { style: 'margin:10px 0 0;font-size:13px;color:var(--acento)' })
    const enviar = h('button', { type: 'button', style: 'background:var(--acento);color:#fff;border:none;border-radius:8px;padding:9px 16px;font:14px Inter,system-ui,sans-serif;cursor:pointer' }, 'Enviar correção')
    const fechar = () => veu.remove()
    const veu = h('div', { style: 'position:fixed;inset:0;z-index:90;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px', onclick: (e) => { if (e.target === veu) fechar() } },
      h('div', { role: 'dialog', 'aria-modal': 'true', style: 'background:var(--papel);color:var(--tinta);border-radius:14px;max-width:520px;width:100%;padding:20px;font:14px/1.5 Inter,system-ui,sans-serif' },
        h('div', { style: 'font:18px Literata,Georgia,serif;margin-bottom:6px' }, 'Sugerir correção'),
        h('p', { style: 'margin:0 0 10px;color:var(--tinta-2);font-size:13px' }, 'Esta tradução saiu de um modelo e pode ter erros. Corrija o trecho; a administração revisa e, se entrar, você aparece como revisor do livro.'),
        h('div', { style: 'font-size:12px;color:var(--tinta-2)' }, 'trecho'),
        h('blockquote', { style: 'margin:4px 0 12px;padding:8px 12px;border-left:3px solid var(--acento);background:var(--papel-2);font-family:Literata,Georgia,serif' }, trecho),
        h('div', { style: 'font-size:12px;color:var(--tinta-2)' }, 'como deveria ficar'), proposta, comentario, saida,
        h('div', { style: 'display:flex;gap:8px;margin-top:14px;justify-content:flex-end' },
          h('button', { type: 'button', onclick: fechar, style: 'background:none;border:1px solid var(--linha);color:var(--tinta);border-radius:8px;padding:9px 14px;font:14px Inter,system-ui,sans-serif;cursor:pointer' }, 'Cancelar'),
          enviar)))
    enviar.addEventListener('click', async () => {
      enviar.disabled = true
      let capitulo = null
      try { capitulo = JSON.parse(localStorage.getItem('fio.estante.v1') || '{}')?.progresso?.[obraAtual]?.capitulo ?? null } catch {}
      try {
        await api('/correcoes', { obra: Number(obraAtual), capitulo, trecho, proposta: proposta.value, comentario: comentario.value })
        saida.style.color = 'var(--tinta-2)'
        saida.textContent = 'Recebido, obrigado! Se ela entrar no texto, você recebe um aviso.'
        enviar.textContent = 'Enviado'
        setTimeout(fechar, 1800)
      } catch (e) {
        enviar.disabled = false
        saida.textContent = e.status === 401 ? 'Entre na sua conta para sugerir correções.' : e.message
      }
    })
    document.body.append(veu)
    proposta.focus()
  }

  // a velocidade só aparece para quem pode ouvir
  function mostrarChipVoz() { chipVoz.style.display = rotaLeitor() && window.fioVoz && 'speechSynthesis' in window ? 'block' : 'none' }

  async function aoMudarRota() {
    const id = rotaLeitor()
    mostrarChipVoz()
    botaoCorrigir.style.display = 'none'
    if (!id) { chipRevisao.style.display = 'none'; resumo = null; obraAtual = null; return }
    if (id === obraAtual) return
    obraAtual = id
    resumo = null
    chipRevisao.style.display = 'none'
    try {
      const r = await api(`/correcoes/resumo?obra=${id}`)
      if (!r.revisao || obraAtual !== id) return
      resumo = r
      const quem = r.revisores.map((x) => x.usuario)
      chipRevisao.replaceChildren(
        h('b', { style: 'color:var(--tinta)' }, r.revisao === 'comunitaria' ? 'Tradução revisada pela comunidade' : 'Tradução automática'),
        h('br'),
        r.aceitas ? `${r.aceitas} ${r.aceitas === 1 ? 'correção' : 'correções'} de ${quem.slice(0, 4).join(', ')}${quem.length > 4 ? ' e mais' : ''}. ` : 'Ninguém corrigiu ainda. ',
        'Selecione um trecho para sugerir uma correção.',
        h('button', { type: 'button', 'aria-label': 'Fechar', onclick: () => { chipRevisao.style.display = 'none' },
          style: 'margin-left:6px;background:none;border:none;color:var(--tinta-2);cursor:pointer;font-size:14px' }, '×'))
      chipRevisao.style.display = 'block'
    } catch { /* sem resumo: sem correções nesta obra */ }
  }

  document.body.append(chipVoz, chipRevisao, botaoCorrigir)
  addEventListener('hashchange', aoMudarRota)
  aoMudarRota()
})()
