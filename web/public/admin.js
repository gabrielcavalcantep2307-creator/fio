// O painel do Fio, do lado do navegador.
//
// Página separada do app (cujo fonte se perdeu), como a estante particular. Ela
// não guarda segredo nenhum: tudo que mostra vem de rotas que exigem sessão de
// ADMIN no servidor. Um leitor comum que abrir /admin.html recebe "sem acesso"
// e as rotas respondem 404 para ele — o painel nem se revela.

const API = '/api'
const pedir = (caminho, corpo) => fetch(API + caminho, {
  method: corpo ? 'POST' : 'GET',
  headers: corpo ? { 'content-type': 'application/json', 'x-fio': '1' } : {},
  body: corpo ? JSON.stringify(corpo) : undefined,
  credentials: 'include',
}).then(async (r) => {
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.erro || `erro ${r.status}`)
  return j
})

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
      ' ', el('button', { class: 'fraco', onclick: async () => { try { await pedir('/sair', {}) } catch {} ; telaEntrar() } }, 'trocar de conta')))
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
  main.replaceChildren(
    el('p', { class: 'ajuda' }, 'Painel de administração. Entre com a conta de curadoria.'),
    form)
  ident.focus()
}

async function desenhar() {
  main.replaceChildren(el('p', { class: 'ajuda' }, 'Carregando o panorama…'))
  let p, fila, aj, ass, pubs, cor
  try {
    [p, fila, aj, ass, pubs, cor] = await Promise.all([pedir('/painel'), pedir('/fila'), pedir('/ajustes'),
      pedir('/admin/assinaturas'), pedir('/admin/publicacoes'), pedir('/admin/correcoes')])
  } catch (e) { main.replaceChildren(recado('ruim', `Não deu para carregar: ${e.message}`)); return }

  const pendencias = pubs.obras.length + pubs.denuncias.length
  main.replaceChildren(
    abas([
      ['panorama', 'Panorama', () => [esteiraAoVivo(), panorama(p), recentes(p.recentes)]],
      ['esteira', 'Esteira', () => [esteiraAoVivo(), secaoFila(fila.itens), secaoAdicionar()]],
      ['publicacoes', `Publicações${pendencias ? ` (${pendencias})` : ''}`, () => [secaoPublicacoes(pubs)]],
      ['correcoes', `Correções${cor.pendentes.length ? ` (${cor.pendentes.length})` : ''}`, () => [secaoCorrecoes(cor)]],
      ['assinaturas', 'Assinaturas', () => [secaoAssinaturas(ass)]],
      ['ajustes', 'Configurações', () => [secaoAjustes(aj)]],
    ]),
  )
}

// ── a esteira, ao vivo ──
//
// Lê /api/admin/esteira a cada 10 s enquanto a caixa está na tela. O pulso vem
// da própria esteira (ingestao/pulso.mjs); se ele envelhece, a caixa diz que a
// esteira parou em vez de fingir que está andando.
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
    const estadoTexto = !e.configurada ? 'sem chave configurada no servidor'
      : !pu ? 'nunca mandou sinal (rode a esteira com a chave)'
      : e.viva ? ({ traduzindo: 'traduzindo agora', publicando: 'publicando no site', medindo: 'preparando a rodada' }[pu.estado] ?? pu.estado)
      : pu.estado === 'terminou' ? `terminou a rodada ${idade(pu.idadeSegundos)}`
      : `parada — último sinal ${idade(pu.idadeSegundos)} (PC desligado ou dormindo?)`
    caixa.replaceChildren(
      el('div', { style: 'display:flex;align-items:center;gap:10px;flex-wrap:wrap' },
        el('span', { style: `width:10px;height:10px;border-radius:50%;background:${e.viva ? '#3aa55d' : 'var(--alerta)'};${e.viva ? 'box-shadow:0 0 0 4px color-mix(in srgb,#3aa55d 25%,transparent)' : ''}` }),
        el('h3', { style: 'margin:0' }, 'Esteira de tradução'),
        el('span', { class: 'ajuda' }, estadoTexto)),
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
  atualizar()
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

// ── assinaturas: dar, trocar e tirar plano ──
//
// Ninguém assina sozinho ainda (sem pagamento). O dono concede aqui, pelo nome
// de usuário. Conta de admin já é Tear e não aparece na lista.
function secaoAssinaturas(a) {
  const s = el('section', {}, el('h2', {}, 'Assinaturas'))
  s.append(el('p', { class: 'ajuda' },
    'As assinaturas ainda não estão à venda: quem tem plano é quem você concede aqui. Publicar começa no plano Trama. ',
    'Contas de administração são sempre Tear. ', el('a', { href: '/assinaturas.html', target: '_blank' }, 'Ver a página de planos')))

  const usuario = el('input', { placeholder: 'nome de usuário' })
  const plano = el('select', { style: 'padding:8px;border-radius:7px;border:1px solid var(--linha);background:var(--fundo);color:var(--tinta)' },
    a.planos.map((x) => el('option', { value: x.chave }, x.chave === 'leitor' ? 'Leitor (tirar o plano)' : x.nome)))
  plano.value = 'trama'
  const dias = el('input', { type: 'number', min: '0', placeholder: 'sem prazo' })
  const nota = el('input', { placeholder: 'por quê (só você vê)' })
  s.append(el('form', { class: 'add', onsubmit: async (ev) => {
    ev.preventDefault()
    const b = ev.submitter; b.disabled = true
    try {
      const r = await pedir('/admin/assinatura', { usuario: usuario.value, plano: plano.value, dias: Number(dias.value) || null, nota: nota.value })
      abaAtual = 'assinaturas'; await desenhar()
      main.prepend(recado('bom', r.plano === 'leitor' ? `${r.usuario} voltou ao plano Leitor.` : `${r.usuario} agora tem o plano ${r.plano}.`))
    } catch (e) { b.disabled = false; main.prepend(recado('ruim', e.message)) }
  } },
  el('div', { class: 'campos' },
    el('div', {}, el('label', {}, 'Conta'), usuario),
    el('div', {}, el('label', {}, 'Plano'), plano),
    el('div', {}, el('label', {}, 'Dias (vazio = sem prazo)'), dias),
    el('div', {}, el('label', {}, 'Nota'), nota)),
  el('div', { style: 'margin-top:12px' }, el('button', {}, 'Conceder'))))

  if (!a.assinaturas.length) { s.append(el('div', { class: 'vazio' }, 'Ninguém tem plano ainda.')); return s }
  const t = el('table', { style: 'margin-top:16px' }, el('thead', {}, el('tr', {},
    el('th', {}, 'Conta'), el('th', {}, 'Plano'), el('th', {}, 'Desde'), el('th', {}, 'Até'), el('th', {}, 'Nota'), el('th', {}, ''))))
  const corpo = el('tbody', {})
  for (const x of a.assinaturas) {
    const vencida = x.ate && new Date(x.ate.replace(' ', 'T') + 'Z') < new Date()
    corpo.append(el('tr', {},
      el('td', {}, x.usuario), el('td', {}, el('span', { class: `selo ${vencida ? 'erro' : 'pronto'}` }, x.plano + (vencida ? ' (vencida)' : ''))),
      el('td', { class: 'mono' }, (x.desde || '').slice(0, 10)), el('td', { class: 'mono' }, x.ate ? x.ate.slice(0, 10) : '—'),
      el('td', {}, x.nota || ''),
      el('td', {}, el('button', { class: 'fraco', onclick: async () => {
        if (!confirm(`Tirar o plano de ${x.usuario}? As obras publicadas continuam no ar, mas ele não publica mais.`)) return
        try { await pedir('/admin/assinatura', { usuario: x.usuario, plano: 'leitor' }); abaAtual = 'assinaturas'; await desenhar() }
        catch (e) { main.prepend(recado('ruim', e.message)) }
      } }, 'tirar'))))
  }
  t.append(corpo); s.append(t)
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
let abaAtual = 'panorama'
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
    const acao = ['espera', 'erro'].includes(it.estado)
      ? el('button', { class: 'fraco', onclick: () => remover(it.id) }, 'tirar')
      : ''
    corpo.append(el('tr', {},
      el('td', {}, it.titulo),
      el('td', {}, it.autor),
      el('td', { class: 'mono' }, it.idioma),
      el('td', {}, el('span', { class: `selo ${it.estado}`, title: it.nota || '' }, rotulo(it.estado))),
      el('td', {}, acao)))
  }
  t.append(corpo); s.append(t)
  return s
}

const rotulo = (e) => ({ espera: 'esperando', na_esteira: 'traduzindo', pronto: 'pronto', erro: 'erro' }[e] ?? e)

function secaoAdicionar() {
  const s = el('section', {}, el('h2', {}, 'Adicionar livros à fila'))
  s.append(el('p', { class: 'ajuda' },
    'Só domínio público, e a fonte tem de ser o original no Project Gutenberg. ',
    'A esteira, na máquina do dono, puxa esta fila e traduz — os livros aparecem no site quando ficam prontos.'))

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

async function remover(id) {
  try { await pedir('/fila/remover', { id }); await desenhar() }
  catch (e) { main.prepend(recado('ruim', e.message)) }
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
