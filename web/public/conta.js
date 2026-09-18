// A conta: perfil, plano, segurança, aparelhos e dados — numa página só.
//
// Substitui a tela antiga do app ("Olá, … · perfil senha perguntas aparelhos
// meus dados"): o app, quando a pessoa está entrada, manda `#/entrar` para cá.
// Tudo que muda algo sensível (e-mail, senha, perguntas) pede a senha atual, e
// quem confere é o servidor.

const main = document.getElementById('main')
const SECOES = [
  ['perfil', '👤', 'Perfil'],
  ['plano', '✦', 'Plano e uso'],
  ['seguranca', '🔒', 'Senha e recuperação'],
  ['aparelhos', '💻', 'Aparelhos'],
  ['dados', '🗂', 'Privacidade e dados'],
]
let conta = null
const dataBr = (s) => (s ? new Date(String(s).replace(' ', 'T') + (String(s).includes('Z') ? '' : 'Z')).toLocaleDateString('pt-BR') : '')
const aviso = (alvo, tipo, texto) => por(alvo, recado(tipo, texto))

async function iniciar() {
  const pessoa = await eu()
  if (!pessoa) {
    por(main, el('h1', {}, 'Minha conta'), el('p', { class: 'sub' }, 'Entre para ver a sua conta.'),
      el('a', { class: 'botao', href: '/#/entrar' }, 'Entrar ou criar conta'))
    return
  }
  window.fioDono?.conferir(pessoa.id)
  try { conta = await pedir('/minha-conta') } catch (e) { por(main, recado('ruim', e.message)); return }
  desenhar()
  addEventListener('hashchange', desenhar)
}

function desenhar() {
  const atual = SECOES.some(([k]) => `#${k}` === location.hash) ? location.hash.slice(1) : 'perfil'
  const c = conta.conta
  const iniciais = (c.nome || c.usuario).split(/\s+/).filter((p) => p && !/\.$/.test(p)).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?'
  const conteudo = el('div', { class: 'painel' })
  por(main,
    el('div', { class: 'topo-conta' },
      el('div', { class: 'avatar', 'aria-hidden': 'true' }, iniciais),
      el('div', {},
        el('h1', {}, c.nome),
        el('div', { class: 'quem' },
          el('span', {}, `@${c.usuario}`),
          el('span', { class: 'selo ouro' }, `plano ${conta.plano.nome}`),
          c.papel !== 'leitor' ? el('span', { class: 'selo' }, c.papel === 'admin' ? 'administração' : c.papel) : null,
          el('span', {}, `desde ${dataBr(c.desde)}`))),
      el('button', { class: 'botao fraco sair', type: 'button', onclick: sair }, 'Sair deste aparelho')),
    el('div', { class: 'layout' },
      el('nav', { class: 'menu-conta', 'aria-label': 'Seções da conta' }, SECOES.map(([k, ic, rot]) =>
        el('a', { href: `#${k}`, 'aria-current': k === atual ? 'page' : null }, el('span', { class: 'ic', 'aria-hidden': 'true' }, ic), rot))),
      conteudo))
  ;({ perfil, plano, seguranca, aparelhos, dados })[atual](conteudo)
}

async function sair() {
  try { await pedir('/sair', {}) } catch {}
  window.fioDono?.saiu() // estante, marcações e progresso não ficam para a próxima conta
  location.href = '/#/'
}

// ── perfil ──
function perfil(alvo) {
  const n = conta.numeros, c = conta.conta
  const numero = (valor, rotulo, href) => el('a', { class: 'numero', href: href ?? '#perfil' }, el('b', {}, String(valor)), el('span', {}, rotulo))
  const nome = el('input', { type: 'text', maxlength: '80', value: c.nome, autocomplete: 'name' })
  const saidaNome = el('div')
  const email = el('input', { type: 'email', maxlength: '254', value: c.email ?? '', placeholder: 'opcional', autocomplete: 'email' })
  const senhaEmail = el('input', { type: 'password', autocomplete: 'current-password', placeholder: 'sua senha atual' })
  const saidaEmail = el('div')
  por(alvo,
    el('section', { class: 'caixa' },
      el('h2', {}, 'Sua leitura'),
      el('p', { class: 'ajuda' }, 'O que você tem no Fio, somado em todos os seus aparelhos.'),
      el('div', { class: 'numeros' },
        numero(n.lidos, 'livros lidos', '/#/estante'), numero(n.lendo, 'lendo agora', '/#/estante'),
        numero(n.queroLer, 'na lista', '/#/estante'), numero(n.marcacoes, 'marcações', '/#/caderno'),
        numero(n.resenhas, 'resenhas'), numero(n.correcoes, 'correções aceitas'),
        numero(n.publicacoes, 'obras publicadas', '/publicar.html'), numero(n.seguindo, 'obras que sigo', '/publicacoes.html?seguindo=1'))),
    el('section', { class: 'caixa' },
      el('h2', {}, 'Como você aparece'),
      el('p', { class: 'ajuda' }, 'O nome aparece nas suas resenhas e publicações. O nome de usuário é o que você usa para entrar e não muda.'),
      el('form', { class: 'form', onsubmit: async (ev) => {
        ev.preventDefault()
        try { const r = await pedir('/meu-nome', { nome: nome.value }); conta.conta.nome = r.pessoa.nome; aviso(saidaNome, 'bom', 'Nome salvo.'); setTimeout(desenhar, 700) }
        catch (e) { aviso(saidaNome, 'ruim', e.message) }
      } },
      el('label', {}, el('span', {}, 'Nome'), nome),
      el('label', {}, el('span', {}, 'Nome de usuário'), el('div', { class: 'fixo' }, `@${c.usuario}`)),
      el('div', {}, el('button', { class: 'botao' }, 'Salvar nome')), saidaNome)),
    el('section', { class: 'caixa' },
      el('h2', {}, 'E-mail'),
      el('p', { class: 'ajuda' }, 'Opcional. O Fio não manda e-mail nem usa o e-mail para recuperar a conta — ele serve para você entrar com ele, se preferir. Deixe vazio para tirar.'),
      el('form', { class: 'form', onsubmit: async (ev) => {
        ev.preventDefault()
        try { const r = await pedir('/meu-email', { email: email.value, senha: senhaEmail.value }); conta.conta.email = r.email; senhaEmail.value = ''; aviso(saidaEmail, 'bom', r.email ? 'E-mail salvo.' : 'E-mail retirado.') }
        catch (e) { aviso(saidaEmail, 'ruim', e.message) }
      } },
      el('label', {}, el('span', {}, 'E-mail'), email),
      el('label', {}, el('span', {}, 'Senha atual (para confirmar)'), senhaEmail),
      el('div', {}, el('button', { class: 'botao fraco' }, 'Salvar e-mail')), saidaEmail)))
}

// ── plano e uso ──
function plano(alvo) {
  const p = conta.plano, u = p.uso
  const barra = (usado, limite) => el('div', { class: 'uso-barra' }, el('i', { style: `width:${Math.min(100, Math.round(usado / Math.max(1, limite) * 100))}%` }))
  por(alvo,
    el('section', { class: 'caixa' },
      el('h2', {}, `Plano ${p.nome}`),
      el('p', { class: 'ajuda' }, p.chave === 'leitor'
        ? `No plano grátis você começa ${u.livros?.limite ?? 3} livros novos a cada 30 dias. Leis, quadrinhos livres e obras da comunidade não contam, e livro já começado nunca fecha.`
        : 'Seu plano lê sem limite. As assinaturas ainda não estão à venda: este plano foi concedido pela administração.'),
      u.livros ? el('div', {},
        el('b', {}, `${u.livros.usados} de ${u.livros.limite} livros`), el('span', { class: 'aut' }, ' nos últimos 30 dias'),
        barra(u.livros.usados, u.livros.limite),
        u.livros.renovaEm && u.livros.usados >= u.livros.limite ? el('div', { class: 'aut' }, `O próximo libera em ${dataBr(u.livros.renovaEm)}.`) : null) : null,
      u.pedidos.limite ? el('div', { style: 'margin-top:16px' },
        el('b', {}, `${u.pedidos.usados} de ${u.pedidos.limite} pedidos de tradução`), el('span', { class: 'aut' }, ' no mês'),
        barra(u.pedidos.usados, u.pedidos.limite),
        el('a', { href: '/central.html#pedidos' }, 'Pedir a tradução de um clássico →')) : null,
      el('p', { style: 'margin-top:18px' }, el('a', { class: 'botao fraco', href: '/assinaturas.html' }, 'Comparar os planos'))))
}

// ── senha e perguntas ──
function seguranca(alvo) {
  const atual = el('input', { type: 'password', autocomplete: 'current-password' })
  const nova = el('input', { type: 'password', autocomplete: 'new-password', minlength: '10' })
  const repete = el('input', { type: 'password', autocomplete: 'new-password' })
  const medidor = el('i')
  const dica = el('div', { class: 'aut' })
  nova.addEventListener('input', () => {
    const v = nova.value
    const pontos = [v.length >= 10, v.length >= 14, /[a-z]/.test(v) && /[A-Z]/.test(v), /\d/.test(v), /[^A-Za-z0-9]/.test(v), new Set(v.toLowerCase()).size >= 8].filter(Boolean).length
    medidor.style.width = `${Math.round(pontos / 6 * 100)}%`
    medidor.style.background = pontos < 3 ? 'var(--acento)' : pontos < 5 ? 'var(--ouro)' : 'var(--bom)'
    dica.textContent = v.length && v.length < 10 ? 'Pelo menos 10 caracteres.' : pontos >= 5 ? 'Forte.' : v ? 'Dá para melhorar: misture palavras, números e símbolos.' : ''
  })
  const saidaSenha = el('div')

  const saidaPerg = el('div')
  const areaPerg = el('div', {}, el('p', { class: 'aut' }, 'carregando…'))
  Promise.all([pedir('/minhas-perguntas'), pedir('/sugestoes')]).then(([r, sug]) => {
    const minhas = { perguntas: (r.perguntas ?? []).map((p) => (typeof p === 'string' ? p : p.pergunta)) }
    const quantas = sug.quantas ?? 3
    const campos = Array.from({ length: quantas }, (_, i) => {
      const sel = el('select', {}, sug.sugestoes.map((s) => { const o = el('option', { value: s }, s); if (minhas.perguntas?.[i] === s) o.selected = true; return o }))
      if (!minhas.perguntas?.[i]) sel.selectedIndex = i % sug.sugestoes.length
      const resp = el('input', { type: 'text', autocomplete: 'off', placeholder: 'resposta' })
      return { sel, resp }
    })
    const senha = el('input', { type: 'password', autocomplete: 'current-password' })
    por(areaPerg,
      el('p', { class: 'ajuda' }, minhas.perguntas?.length
        ? `Suas perguntas hoje: ${minhas.perguntas.join(' · ')}. As respostas nunca aparecem aqui.`
        : 'Você ainda não tem perguntas de recuperação.'),
      el('form', { class: 'form', onsubmit: async (ev) => {
        ev.preventDefault()
        try {
          await pedir('/minhas-perguntas', { atual: senha.value, perguntas: campos.map((c) => ({ pergunta: c.sel.value, resposta: c.resp.value })) })
          senha.value = ''; for (const c of campos) c.resp.value = ''
          aviso(saidaPerg, 'bom', 'Perguntas trocadas.')
        } catch (e) { aviso(saidaPerg, 'ruim', e.message) }
      } },
      campos.map((c, i) => el('label', {}, el('span', {}, `Pergunta ${i + 1}`), c.sel, c.resp)),
      el('label', {}, el('span', {}, 'Senha atual (para confirmar)'), senha),
      el('div', {}, el('button', { class: 'botao fraco' }, 'Trocar perguntas')), saidaPerg))
  }).catch((e) => aviso(areaPerg, 'ruim', e.message))

  // Entrar com o Google (servidor/google.mjs). Conta criada pelo Google não
  // sabe a própria senha: em vez de "trocar", ela DEFINE a primeira.
  const caixaGoogle = el('section', { class: 'caixa' }, el('h2', {}, 'Entrar com o Google'), el('p', { class: 'aut' }, 'carregando…'))
  const caixaSenha = el('section', { class: 'caixa' })
  const saidaGoogle = el('div')
  pedir('/google').then((g) => {
    if (!g.disponivel) { caixaGoogle.remove(); return }
    por(caixaGoogle, el('h2', {}, 'Entrar com o Google'),
      g.ligado
        ? el('p', { class: 'ajuda' }, `Ligada à conta do Google ${g.email ?? ''} desde ${dataBr(g.desde)}. Você entra com um clique em qualquer aparelho.`)
        : el('p', { class: 'ajuda' }, 'Ligue sua conta do Google para entrar com um clique, sem digitar senha. O Fio recebe só seu nome e e-mail.'),
      g.ligado
        ? el('button', { class: 'botao fraco', type: 'button', onclick: async () => {
            if (!confirm('Desligar o Google desta conta? Você passa a entrar só com usuário e senha.')) return
            try { await pedir('/google/desligar', {}); aviso(saidaGoogle, 'bom', 'Google desligado.'); setTimeout(desenhar, 800) } catch (e) { aviso(saidaGoogle, 'ruim', e.message) }
          } }, 'Desligar o Google')
        : el('a', { class: 'botao', href: '/api/google/entrar?modo=vincular' }, 'Ligar minha conta do Google'),
      saidaGoogle)
    if (g.semSenha) {
      const n1 = el('input', { type: 'password', autocomplete: 'new-password', minlength: '10' })
      const n2 = el('input', { type: 'password', autocomplete: 'new-password' })
      const saida = el('div')
      por(caixaSenha, el('h2', {}, 'Criar uma senha'),
        el('p', { class: 'ajuda' }, 'Sua conta nasceu pelo Google e ainda não tem senha. Crie uma para poder entrar também com usuário e senha (e para poder desligar o Google).'),
        el('form', { class: 'form', onsubmit: async (ev) => {
          ev.preventDefault()
          if (n1.value !== n2.value) return aviso(saida, 'ruim', 'As duas senhas não são iguais.')
          try { await pedir('/google/senha', { nova: n1.value }); n1.value = n2.value = ''; aviso(saida, 'bom', 'Senha criada.'); setTimeout(desenhar, 900) } catch (e) { aviso(saida, 'ruim', e.message) }
        } },
        el('label', {}, el('span', {}, 'Senha nova'), n1),
        el('label', {}, el('span', {}, 'Repita a senha'), n2),
        el('div', {}, el('button', { class: 'botao' }, 'Criar senha')), saida))
    }
  }).catch(() => caixaGoogle.remove())

  por(caixaSenha,
      el('h2', {}, 'Trocar a senha'),
      el('p', { class: 'ajuda' }, 'Ao trocar, todos os outros aparelhos saem da conta. Este continua entrado.'),
      el('form', { class: 'form', onsubmit: async (ev) => {
        ev.preventDefault()
        if (nova.value !== repete.value) return aviso(saidaSenha, 'ruim', 'As duas senhas novas não são iguais.')
        try { await pedir('/minha-senha', { atual: atual.value, nova: nova.value }); atual.value = nova.value = repete.value = ''; aviso(saidaSenha, 'bom', 'Senha trocada. Os outros aparelhos saíram.') }
        catch (e) { aviso(saidaSenha, 'ruim', e.message) }
      } },
      el('label', {}, el('span', {}, 'Senha atual'), atual),
      el('label', {}, el('span', {}, 'Senha nova'), nova, el('div', { class: 'medidor' }, medidor), dica),
      el('label', {}, el('span', {}, 'Repita a senha nova'), repete),
      el('div', {}, el('button', { class: 'botao' }, 'Trocar senha')), saidaSenha))
  por(alvo,
    caixaGoogle,
    caixaSenha,
    el('section', { class: 'caixa' },
      el('h2', {}, 'Perguntas de recuperação'),
      el('p', { class: 'ajuda' }, 'É com elas que você recupera a conta se esquecer a senha — o Fio não usa e-mail para isso. Escolha respostas que só você sabe.'),
      areaPerg))
}

// ── aparelhos ──
async function aparelhos(alvo) {
  por(alvo, el('section', { class: 'caixa' }, el('h2', {}, 'Aparelhos'), el('p', { class: 'aut' }, 'carregando…')))
  let r
  try { r = await pedir('/meus-aparelhos') } catch (e) { por(alvo, recado('ruim', e.message)); return }
  const icone = (a) => /iphone|android|celular|mobile/i.test(a) ? '📱' : /ipad|tablet/i.test(a) ? '📲' : '💻'
  const saida = el('div')
  const outros = r.sessoes.filter((s) => !s.esta)
  por(alvo, el('section', { class: 'caixa' },
    el('h2', {}, 'Aparelhos'),
    el('p', { class: 'ajuda' }, 'Onde a sua conta está aberta. Não reconhece algum? Tire-o daqui e troque a senha.'),
    el('div', {}, r.sessoes.map((s) => el('div', { class: 'aparelho' },
      el('span', { class: 'ic', 'aria-hidden': 'true' }, icone(s.aparelho)),
      el('div', { class: 'desc' }, el('b', {}, s.aparelho), s.esta ? el('span', { class: 'selo bom', style: 'margin-left:8px' }, 'este aparelho') : null,
        el('small', {}, [s.de ? `rede ${s.de}` : null, `entrou em ${dataBr(s.desde)}`, s.visto ? `visto em ${dataBr(s.visto)}` : null].filter(Boolean).join(' · '))),
      s.esta ? null : el('button', { class: 'botao fraco mini', type: 'button', onclick: async () => {
        try { await pedir('/sair-do-aparelho', { id: s.id }); aparelhos(alvo) } catch (e) { aviso(saida, 'ruim', e.message) }
      } }, 'tirar')))),
    outros.length > 1 ? el('p', { style: 'margin-top:14px' }, el('button', { class: 'botao fraco', type: 'button', onclick: async () => {
      if (!confirm('Tirar a conta de todos os outros aparelhos?')) return
      try { await pedir('/sair-dos-outros', {}); aparelhos(alvo) } catch (e) { aviso(saida, 'ruim', e.message) }
    } }, 'Sair de todos os outros')) : null,
    saida))
}

// ── privacidade e dados ──
function dados(alvo) {
  const saida = el('div')
  const confirma = el('input', { type: 'text', placeholder: conta.conta.usuario, autocomplete: 'off' })
  por(alvo,
    el('section', { class: 'caixa' },
      el('h2', {}, 'Levar seus dados'),
      el('p', { class: 'ajuda' }, 'Um arquivo com tudo que o Fio guarda sobre você: conta, progresso, marcações, resenhas, gosto, avisos, publicações, correções e pedidos (LGPD, art. 18).'),
      el('button', { class: 'botao fraco', type: 'button', onclick: async (e) => {
        e.target.disabled = true
        try {
          const d = await pedir('/exportar')
          const a = el('a', { href: URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' })), download: `fio-${conta.conta.usuario}.json` })
          document.body.append(a); a.click(); a.remove()
        } catch (x) { aviso(saida, 'ruim', x.message) }
        e.target.disabled = false
      } }, 'Baixar meus dados (JSON)')),
    el('section', { class: 'caixa' },
      el('h2', {}, 'Apagar o que foi guardado'),
      el('p', { class: 'ajuda' }, 'Apaga no servidor o progresso, as marcações e a estante sincronizados. A conta continua. Neste aparelho, apague também pelo caderno do app.'),
      el('button', { class: 'botao fraco', type: 'button', onclick: async () => {
        if (!confirm('Apagar progresso, marcações e estante guardados no servidor?')) return
        try { await pedir('/apagar-dados', {}); window.fioDono?.saiu(); window.fioDono?.conferir(conta.conta.id); aviso(saida, 'bom', 'Apagado no servidor e neste navegador.') } catch (x) { aviso(saida, 'ruim', x.message) }
      } }, 'Apagar dados guardados')),
    el('section', { class: 'caixa perigo' },
      el('h2', {}, 'Apagar a conta'),
      el('p', { class: 'ajuda' }, 'Apaga a conta e tudo ligado a ela, para sempre: progresso, resenhas, publicações, avisos. Não dá para desfazer.'),
      el('div', { class: 'form' },
        el('label', {}, el('span', {}, `Para confirmar, digite ${conta.conta.usuario}`), confirma),
        el('div', {}, el('button', { class: 'botao', type: 'button', onclick: async () => {
          if (confirma.value.trim().toLowerCase() !== conta.conta.usuario.toLowerCase()) return aviso(saida, 'ruim', 'Digite o seu nome de usuário exatamente.')
          if (!confirm('Última chance: apagar a conta para sempre?')) return
          try { await pedir('/apagar-conta', { usuario: confirma.value.trim() }); window.fioDono?.saiu(); location.href = '/#/' } catch (x) { aviso(saida, 'ruim', x.message) }
        } }, 'Apagar minha conta')))),
    saida)
}

iniciar()
