// Duas ideias tiradas de sites de leitura, montadas dentro do app:
//
//   ESTANTE — Meta de leitura do ano (o "Reading Challenge" do Goodreads).
//             Quantos livros quero ler este ano, quantos já li, se estou no
//             ritmo, e os livros de cada mês.
//   CADERNO — Revisão do dia (o "Daily Review" do Kindle/Readwise). Cinco
//             marcações antigas voltam para você reler; "já sei" empurra a
//             próxima vez para longe, "de novo" traz amanhã.
//
// O app remendado deixa um <div id="fio-extra-estante"> e um
// <div id="fio-extra-caderno"> vazios; este script preenche. Tudo por nó de
// texto. A meta é da conta (servidor); a revisão fica neste navegador.

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
  // a conversa com a API é a de todas as páginas (/fio-api.js, carregado antes)
  const api = (c, corpo) => window.fioApi.pedir(c, corpo)

  const guardado = () => { try { return JSON.parse(localStorage.getItem('fio.estante.v1') || '{}') } catch { return {} } }
  let catalogo = null
  const obraPorId = async (id) => {
    catalogo ??= fetch('/dados/catalogo.json').then((r) => r.json()).then((c) => new Map(c.obras.map((o) => [o.id, o]))).catch(() => new Map())
    return (await catalogo).get(Number(id))
  }
  const capaDe = (o) => (o?.capa ? `/capas/${o.capa}` : o?.capaOL ? `https://covers.openlibrary.org/b/id/${o.capaOL}-M.jpg` : null)

  const CAIXA = 'margin:28px 0 8px;padding:18px 20px;border:1px solid var(--linha);border-radius:14px;background:var(--papel-2);font-family:Inter,system-ui,sans-serif;color:var(--tinta)'
  const TITULO = 'font:500 1.15rem Literata,Georgia,serif;margin:0'
  const MIUDO = 'font-size:.78rem;color:var(--tinta-2)'
  const BOTAO = 'border:1px solid var(--linha);background:transparent;color:var(--tinta);border-radius:8px;padding:6px 12px;font:inherit;font-size:.82rem;cursor:pointer'
  const BOTAO_FORTE = 'border:1px solid var(--acento);background:var(--acento);color:#fff;border-radius:8px;padding:6px 12px;font:inherit;font-size:.82rem;cursor:pointer'

  // ─────────────────────────────────────────────────────────────
  // ESTANTE: meta do ano
  // ─────────────────────────────────────────────────────────────
  async function montarMeta(alvo) {
    alvo.dataset.montado = '1'
    const caixa = h('section', { style: CAIXA, 'aria-label': 'Meta de leitura do ano' })
    alvo.replaceChildren(caixa)
    let m
    try { m = await api('/meta') } catch (e) {
      if (e.status === 401) {
        caixa.replaceChildren(h('p', { style: TITULO }, `Sua meta de leitura de ${new Date().getFullYear()}`),
          h('p', { style: `${MIUDO};margin:6px 0 10px` }, 'Entre na sua conta para escolher quantos livros quer ler este ano e acompanhar o ritmo.'),
          h('a', { href: '#/entrar', style: BOTAO_FORTE + ';text-decoration:none;display:inline-block' }, 'Entrar'))
      } else caixa.remove()
      return
    }
    desenharMeta(caixa, m)
  }

  function desenharMeta(caixa, m) {
    const hoje = new Date()
    const diaDoAno = Math.floor((Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()) - Date.UTC(m.ano, 0, 1)) / 86400000) + 1
    const diasNoAno = (Date.UTC(m.ano + 1, 0, 1) - Date.UTC(m.ano, 0, 1)) / 86400000
    const feitos = m.lidos.length
    const campo = h('input', { type: 'number', min: '1', max: '500', value: String(m.meta ?? 12), style: 'width:5.5em;padding:6px 8px;border:1px solid var(--linha);border-radius:8px;background:var(--papel);color:var(--tinta);font:inherit' })
    const salvar = h('button', { type: 'button', style: BOTAO_FORTE, onclick: async () => {
      salvar.disabled = true
      try { desenharMeta(caixa, await api('/meta', { livros: Number(campo.value), ano: m.ano })) } catch (e) { salvar.disabled = false; alert(e.message) }
    } }, m.meta ? 'Mudar meta' : 'Definir meta')

    if (!m.meta) {
      caixa.replaceChildren(
        h('p', { style: TITULO }, `Quantos livros você quer ler em ${m.ano}?`),
        h('p', { style: `${MIUDO};margin:6px 0 12px` }, `Você já terminou ${feitos} ${feitos === 1 ? 'livro' : 'livros'} este ano. Uma meta ajuda a manter o ritmo — e dá para mudar quando quiser.`),
        h('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' }, campo, h('span', { style: MIUDO }, 'livros'), salvar))
      return
    }
    const esperado = m.meta * diaDoAno / diasNoAno
    const diferenca = Math.round(feitos - esperado)
    const livros = (n) => `${n} ${n === 1 ? 'livro' : 'livros'}`
    const ritmo = diferenca >= 1 ? `${livros(diferenca)} à frente do ritmo` : diferenca <= -1 ? `${livros(-diferenca)} atrás do ritmo` : 'no ritmo'
    const projecao = diaDoAno > 20 && feitos > 0 ? Math.round(feitos / diaDoAno * diasNoAno) : null
    const pct = Math.min(1, feitos / m.meta)
    const maxMes = Math.max(1, ...m.porMes)
    const MESES = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
    const ultimos = h('div', { style: 'display:flex;gap:8px;overflow-x:auto;padding-top:4px' })
    ;(async () => {
      for (const l of m.lidos.slice(-10).reverse()) {
        const o = await obraPorId(l.obra)
        if (!o) continue
        const capa = capaDe(o)
        ultimos.append(h('a', { href: `#/obra/${o.id}`, title: o.titulo, style: 'flex:none;width:46px;aspect-ratio:2/3;border-radius:3px;overflow:hidden;background:var(--linha);display:block' },
          capa ? h('img', { src: capa, alt: o.titulo, loading: 'lazy', style: 'width:100%;height:100%;object-fit:cover' }) : null))
      }
    })()
    caixa.replaceChildren(
      h('div', { style: 'display:flex;gap:22px;align-items:center;flex-wrap:wrap' },
        h('div', { style: `width:92px;height:92px;border-radius:50%;flex:none;display:grid;place-items:center;background:conic-gradient(var(--acento) ${Math.round(pct * 360)}deg, var(--linha) 0)` },
          h('div', { style: 'width:74px;height:74px;border-radius:50%;background:var(--papel-2);display:grid;place-items:center;text-align:center' },
            h('div', {}, h('b', { style: 'font:500 1.4rem Literata,Georgia,serif;display:block;line-height:1' }, String(feitos)), h('span', { style: MIUDO }, `de ${m.meta}`)))),
        h('div', { style: 'flex:1;min-width:220px' },
          h('p', { style: TITULO }, `Meta de ${m.ano}: ${m.meta} livros`),
          h('p', { style: `${MIUDO};margin:4px 0 0` }, feitos >= m.meta ? 'Meta cumprida! Que tal aumentar?' : `${ritmo}${projecao != null ? ` · nesse passo, ${projecao} livros até dezembro` : ''} · ${m.lendo} em leitura agora`),
          h('div', { style: 'display:flex;gap:4px;align-items:flex-end;height:44px;margin-top:10px' }, m.porMes.map((n, i) =>
            h('div', { title: `${n} em ${i + 1}/${m.ano}`, style: 'flex:1;display:flex;flex-direction:column;align-items:center;gap:2px' },
              h('div', { style: `width:100%;max-width:18px;height:${Math.max(2, Math.round(n / maxMes * 30))}px;border-radius:3px;background:${n ? 'var(--acento)' : 'var(--linha)'}` }),
              h('span', { style: 'font-size:.6rem;color:var(--tinta-2)' }, MESES[i]))))),
        h('div', { style: 'display:flex;gap:6px;align-items:center;flex-wrap:wrap' }, campo, salvar)),
      ...(m.lidos.length ? [h('div', { style: 'margin-top:12px' }, h('span', { style: MIUDO }, 'Terminados este ano'), ultimos)] : []))
  }

  // ─────────────────────────────────────────────────────────────
  // CADERNO: revisão do dia
  // ─────────────────────────────────────────────────────────────
  const CHAVE_REVISAO = 'fio:revisao'
  const lerRevisao = () => { try { return JSON.parse(localStorage.getItem(CHAVE_REVISAO) || '{}') } catch { return {} } }
  const gravarRevisao = (r) => { try { localStorage.setItem(CHAVE_REVISAO, JSON.stringify(r)) } catch {} }
  const DIA = 86400000

  async function montarRevisao(alvo) {
    alvo.dataset.montado = '1'
    const marcas = (guardado().marcacoes ?? []).filter((m) => m && m.trecho && String(m.trecho).trim().length > 12)
    if (!marcas.length) { alvo.replaceChildren(); return }
    const caixa = h('section', { style: CAIXA, 'aria-label': 'Revisão do dia' })
    alvo.replaceChildren(caixa)
    const agenda = lerRevisao()
    const hoje = Date.now()
    // as que estão "vencidas" primeiro; as nunca vistas entram misturadas
    const devidas = marcas
      .map((m) => ({ m, a: agenda[m.id] }))
      .filter((x) => !x.a || x.a.proxima <= hoje)
      .sort((x, y) => (x.a?.proxima ?? 0) - (y.a?.proxima ?? 0) || (x.m.mudouEm ?? 0) - (y.m.mudouEm ?? 0))
    const doDia = devidas.slice(0, 5)
    let i = 0
    const desenhar = async () => {
      if (i >= doDia.length) {
        const proxima = Object.values(lerRevisao()).map((a) => a.proxima).filter((p) => p > hoje).sort()[0]
        caixa.replaceChildren(h('p', { style: TITULO }, 'Revisão do dia feita'),
          h('p', { style: `${MIUDO};margin:6px 0 0` }, doDia.length
            ? `Você releu ${doDia.length} ${doDia.length === 1 ? 'marcação' : 'marcações'}. ${proxima ? `A próxima volta em ${new Date(proxima).toLocaleDateString('pt-BR')}.` : ''}`
            : 'Nada para reler hoje. As marcações voltam aos poucos, no dia certo.'))
        return
      }
      const { m, a } = doDia[i]
      const o = await obraPorId(m.obraId)
      const responder = (sabe) => {
        const r = lerRevisao()
        const intervalo = sabe ? Math.min(180, Math.max(3, Math.round((a?.intervalo ?? 1) * 2.5))) : 1
        r[m.id] = { intervalo, proxima: Date.now() + intervalo * DIA, vezes: (a?.vezes ?? 0) + 1 }
        gravarRevisao(r)
        i++
        desenhar()
      }
      caixa.replaceChildren(
        h('div', { style: 'display:flex;justify-content:space-between;gap:10px;align-items:baseline;flex-wrap:wrap' },
          h('p', { style: TITULO }, 'Revisão do dia'),
          h('span', { style: MIUDO }, `${i + 1} de ${doDia.length} · ${marcas.length} ${marcas.length === 1 ? 'marcação' : 'marcações'} no caderno`)),
        h('blockquote', { style: 'margin:12px 0;padding:10px 14px;border-left:3px solid var(--acento);font:1.02rem/1.6 Literata,Georgia,serif;background:var(--papel)' }, m.trecho),
        ...(m.nota ? [h('p', { style: `${MIUDO};margin:0 0 10px` }, `Sua nota: ${m.nota}`)] : []),
        h('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' },
          o ? h('a', { href: `#/ler/${o.id}`, style: `${MIUDO};margin-right:auto` }, `${o.titulo} — ${o.autor}`) : h('span', { style: 'margin-right:auto' }),
          h('button', { type: 'button', style: BOTAO, onclick: () => responder(false) }, 'rever amanhã'),
          h('button', { type: 'button', style: BOTAO_FORTE, onclick: () => responder(true) }, 'lembrei')))
    }
    desenhar()
  }

  // ─────────────────────────────────────────────────────────────
  // HOME: "chegaram agora" — as traduções mais novas do Fio (18/09), como a
  // faixa de "novas atualizações" dos sites de leitura
  // ─────────────────────────────────────────────────────────────
  const haQuanto = (ms) => {
    if (!ms) return ''
    const h = Math.floor((Date.now() - ms) / 3_600_000)
    return h < 1 ? 'agora há pouco' : h < 24 ? `há ${h} h` : h < 48 ? 'ontem' : `há ${Math.floor(h / 24)} dias`
  }
  async function montarNovidades(alvo) {
    alvo.dataset.montado = '1'
    let r
    try { r = await api('/novidades') } catch { return }
    const cartoes = []
    for (const n of r.obras ?? []) {
      const o = await obraPorId(n.obra)
      if (!o) continue
      const capa = capaDe(o)
      cartoes.push(h('a', { href: `#/obra/${o.id}`, title: o.titulo },
        h('div', { class: 'cap' }, capa ? h('img', { src: capa, alt: `Capa de ${o.titulo}`, loading: 'lazy' }) : null),
        n.em && Date.now() - n.em < 7 * 86_400_000 ? h('span', { class: 'novo' }, 'novo') : null,
        h('div', { class: 't' }, o.titulo),
        h('div', { class: 'q' }, [o.autor, haQuanto(n.em)].filter(Boolean).join(' · '))))
      if (cartoes.length >= 18) break
    }
    if (cartoes.length < 3) { alvo.replaceChildren(); return }
    alvo.replaceChildren(h('section', { class: 'fio-novidades' },
      h('div', { class: 'topo' }, h('h2', { class: 'fio-titulo', style: 'font:600 1.15rem Literata,Georgia,serif;margin:0' }, 'Chegaram agora'),
        h('span', {}, 'traduzidos pelo Fio, os mais novos primeiro')),
      h('div', { class: 'rolo' }, cartoes)))
  }

  // ── montar quando o app desenhar os espaços ──
  function procurar() {
    const e = document.getElementById('fio-extra-estante')
    if (e && !e.dataset.montado) montarMeta(e)
    const c = document.getElementById('fio-extra-caderno')
    if (c && !c.dataset.montado) montarRevisao(c)
    const nv = document.getElementById('fio-extra-novidades')
    if (nv && !nv.dataset.montado) montarNovidades(nv)
    // "Continuar com o Google" na tela de entrar: só aparece se o servidor
    // estiver com o Google ligado (servidor/google.mjs)
    const g = document.getElementById('fio-google')
    if (g && !g.dataset.visto) {
      g.dataset.visto = '1'
      googleLigado ??= api('/google/ligado').then((r) => !!r?.disponivel).catch(() => false)
      googleLigado.then((sim) => { if (sim) g.style.display = '' })
    }
  }
  let googleLigado = null
  new MutationObserver(procurar).observe(document.body, { childList: true, subtree: true })
  addEventListener('hashchange', procurar)
  procurar()
})()
