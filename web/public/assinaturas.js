// Os planos do Fio: a vitrine e a comparação. Ninguém assina por aqui ainda —
// os botões dizem isso, e o servidor também (`disponivel: false`).
//
// Tudo que aparece aqui vem de `servidor/planos.mjs` e é regra que o servidor
// faz valer. Nenhum item de "em breve", nenhum detalhe de infraestrutura.

const main = document.getElementById('main')
const NOMES = { novelo: 'Novelo', trama: 'Trama', tear: 'Tear' }
const nomeDoPlano = (c) => NOMES[c] ?? c
function quandoFoi(s) {
  if (!s) return 'há pouco'
  const d = new Date(String(s).replace(' ', 'T') + 'Z')
  const h = (Date.now() - d) / 3600000
  if (h < 1) return 'há pouco'
  if (h < 24) return `há ${Math.floor(h)} h`
  return `em ${d.toLocaleDateString('pt-BR')}`
}

/** Três livros para começar enquanto o presente não chega. */
function enquantoEspera() {
  const caixa = el('div', { class: 'caixa', style: 'margin:0 0 26px' },
    el('h3', { style: 'margin:0 0 4px' }, 'Enquanto o presente não chega'),
    el('p', { class: 'sub', style: 'margin:0 0 12px' }, 'Com a conta grátis você já abre 3 livros por mês. Comece por um destes — são os mais lidos da casa agora.'),
    el('p', { class: 'sub', style: 'margin:0' }, 'carregando…'))
  // os mais lidos da semana; o título vem da ficha de cada um (arquivo pequeno)
  pedir('/populares').then(async (r) => {
    const ids = (r.semana ?? []).slice(0, 3).map((o) => o.obra_id)
    const fichas = await Promise.all(ids.map((id) => fetch(`/dados/fichas/${id}.json`).then((x) => (x.ok ? x.json() : null)).catch(() => null)))
    const livros = fichas.filter(Boolean)
    if (!livros.length) return caixa.lastChild.replaceWith(el('p', { style: 'margin:0' }, el('a', { class: 'botao fraco', href: '/#/' }, 'Ver o acervo')))
    caixa.lastChild.replaceWith(el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' },
      livros.map((o) => el('a', { class: 'botao fraco', href: `/#/ler/${o.id}`, title: o.chamada ?? '' }, String(o.titulo).split(/[\r\n]/)[0])),
      el('a', { class: 'botao fraco', href: '/#/' }, 'ver mais')))
  }).catch(() => caixa.lastChild.remove())
  return caixa
}

/** O pedido do presente: um plano, um porquê (opcional) e o prazo. */
function abrirPedido(p) {
  const motivo = el('textarea', { rows: '3', maxlength: '300', placeholder: 'Se quiser, conte o que você quer ler (isso ajuda a casa a escolher o próximo livro a traduzir).' })
  const recado = el('p', { class: 'recado', hidden: true })
  const enviar = el('button', { class: 'botao', type: 'submit' }, `Pedir o ${p.nome}`)
  const fundo = el('div', { class: 'fio-modal-fundo', onclick: (e) => { if (e.target === fundo) fundo.remove() } },
    el('div', { class: 'fio-modal', role: 'dialog', 'aria-modal': 'true' },
      el('button', { class: 'ico fechar', type: 'button', 'aria-label': 'Fechar', onclick: () => fundo.remove() }, '×'),
      el('p', { class: 'olho' }, 'Presente da casa'),
      el('h2', {}, `Pedir o plano ${p.nome}`),
      el('p', { class: 'sub' }, 'A Fiolib está começando e ainda não cobra nada. Os planos são dados de presente, um a um, por quem cuida do acervo — e o seu chega em até 24 horas, sem cartão e sem cobrança nenhuma depois.'),
      el('form', { style: 'display:grid;gap:12px', onsubmit: async (ev) => {
        ev.preventDefault()
        enviar.disabled = true
        try {
          await pedir('/planos/quero', { plano: p.chave, motivo: motivo.value })
          try { sessionStorage.removeItem('fio:barra') } catch {}
          fundo.remove()
          // a página se redesenha inteira; o recado entra DEPOIS, senão some
          await iniciar()
          main.prepend(el('div', { class: 'recado bom' }, `Pedido feito: o ${p.nome} chega em até 24 horas. Você recebe um aviso aqui no site quando ele estiver valendo.`))
        } catch (x) { enviar.disabled = false; recado.className = 'recado ruim'; recado.textContent = x.message; recado.hidden = false }
      } },
      el('label', { class: 'campo' }, el('span', {}, 'Por que você quer (opcional)'), motivo),
      recado,
      el('div', { style: 'display:flex;gap:12px;align-items:center;flex-wrap:wrap' }, enviar,
        el('button', { class: 'botao fraco', type: 'button', onclick: () => fundo.remove() }, 'Agora não')))))
  document.body.append(fundo)
}
const POR = {
  epub: 'Baixar livros em EPUB faz parte dos planos pagos, a partir do Novelo.',
  voz: 'Ouvir em voz alta faz parte dos planos pagos, a partir do Novelo.',
  limite: 'Você já abriu os livros deste mês no plano grátis.',
}

async function iniciar() {
  let v
  try { v = await pedir('/planos') } catch (e) { por(main, recado('ruim', `Não consegui abrir os planos: ${e.message}`)); return }
  const meu = v.meu?.plano
  const motivo = POR[new URLSearchParams(location.search).get('por')]

  const cartao = (p) => {
    const destaque = p.chave === 'novelo'
    let acao
    if (meu === p.chave) acao = el('span', { class: 'botao fraco', 'aria-disabled': 'true' }, v.meu.porAdmin ? 'Seu plano (administração)' : 'Seu plano')
    else if (p.chave === 'leitor') acao = v.meu ? el('span', { class: 'botao fraco', 'aria-disabled': 'true' }, 'Incluído na sua conta') : el('a', { class: 'botao', href: '/#/entrar' }, 'Criar conta grátis')
    // Enquanto o pagamento não existe, o plano é PRESENTE: o botão pede, e o
    // dono concede pelo painel (servidor/planos.mjs, querer/conceder).
    else if (!v.meu) acao = el('a', { class: `botao${destaque ? '' : ' fraco'}`, href: '/#/entrar' }, 'Criar conta e pedir')
    else if (v.meu.quer?.plano === p.chave) acao = el('span', { class: 'botao fraco', 'aria-disabled': 'true' }, 'Pedido feito ✓')
    else acao = el('button', { class: `botao${destaque ? '' : ' fraco'}`, type: 'button', onclick: () => abrirPedido(p) }, `Pedir o ${p.nome} de presente`)
    return el('div', { class: `plano${destaque ? ' destaque' : ''}` },
      destaque ? el('span', { class: 'fita' }, 'ler sem limite') : null,
      meu === p.chave ? el('span', { class: 'meu' }, 'o seu') : null,
      el('h2', {}, p.nome),
      el('p', { class: 'frase' }, p.frase),
      el('div', { class: 'preco' }, p.preco ? dinheiro(p.preco) : 'R$ 0', el('small', {}, p.preco ? ' /mês' : '')),
      el('div', { class: 'ano' }, p.precoAno ? `ou ${dinheiro(p.precoAno)} por ano — 2 meses grátis` : 'com conta'),
      el('ul', {}, p.destaques.map((d) => el('li', {}, d))),
      acao)
  }

  const marca = (valor) => valor === true ? el('span', { class: 'sim', 'aria-label': 'sim' }, '✓')
    : valor === false ? el('span', { class: 'nao', 'aria-label': 'não' }, '—') : el('span', {}, valor)

  const tabela = el('div', { class: 'tabela' }, el('table', {},
    el('thead', {}, el('tr', {}, el('th', {}, ''), v.planos.map((p) => el('th', {}, p.nome, el('br'),
      el('small', { style: 'font-weight:400;color:var(--tinta2)' }, p.preco ? `${dinheiro(p.preco)}/mês` : 'grátis'))))),
    el('tbody', {}, v.recursos.map((g) => [
      el('tr', { class: 'grupo' }, el('td', { colspan: String(v.planos.length + 1) }, g.grupo)),
      g.itens.map((r) => el('tr', {}, el('td', {}, r.nome), v.planos.map((p) => el('td', {}, marca(r[p.chave]))))),
    ]))))

  const uso = v.meu?.uso
  const pequeno = (t) => el('div', { style: 'font-size:12px;color:var(--tinta2)' }, t)
  const seuPlano = v.meu ? el('div', { class: 'caixa', style: 'margin:0 0 26px;display:flex;gap:28px;flex-wrap:wrap;align-items:center' },
    el('div', {}, pequeno('seu plano'), el('div', { style: 'font-family:Literata,Georgia,serif;font-size:24px' }, v.meu.nome)),
    uso?.livros
      ? el('div', {}, pequeno('livros nos últimos 30 dias'), el('div', { style: 'font-size:20px' }, `${uso.livros.usados} de ${uso.livros.limite}`),
        uso.livros.renovaEm && uso.livros.usados >= uso.livros.limite
          ? pequeno(`o próximo libera em ${new Date(uso.livros.renovaEm.replace(' ', 'T') + 'Z').toLocaleDateString('pt-BR')}`) : null)
      : el('div', {}, pequeno('livros'), el('div', { style: 'font-size:20px' }, 'sem limite')),
    uso?.pedidos?.limite ? el('div', {}, pequeno('pedidos de tradução no mês'),
      el('div', { style: 'font-size:20px' }, `${uso.pedidos.usados} de ${uso.pedidos.limite}`),
      el('a', { href: '/central.html#pedidos', style: 'font-size:12.5px' }, 'pedir um livro')) : null,
    v.meu.ate ? pequeno(`concedido até ${new Date(v.meu.ate.replace(' ', 'T') + 'Z').toLocaleDateString('pt-BR')}`) : null) : null

  const pergunta = (t, r) => el('div', { class: 'caixa' }, el('h4', {}, t), el('p', {}, r))

  por(main,
    el('h1', {}, 'Planos'),
    el('p', { class: 'sub' }, 'Sem conta, você lê o primeiro capítulo de qualquer livro. Com a conta grátis, 3 livros novos por mês. Para ler sem limite, ouvir e baixar, escolha um plano.'),
    motivo ? el('div', { class: 'recado ruim' }, motivo) : null,
    el('div', { class: 'aviso-topo', role: 'note' }, el('span', { style: 'font-size:20px' }, '🎁'),
      el('div', {},
        el('b', {}, v.meu?.quer ? 'Seu pedido está na fila.' : 'Por enquanto, os planos são presente.'),
        v.meu?.quer
          ? `Você pediu o ${nomeDoPlano(v.meu.quer.plano)} ${quandoFoi(v.meu.quer.criado_em)}. A gente entrega à mão, uma conta por vez: chega em até 24 horas. Enquanto isso, comece um livro — a leitura é sua de qualquer jeito.`
          : v.aviso)),
    v.meu?.quer ? enquantoEspera() : null,
    seuPlano,
    el('div', { class: 'planos' }, v.planos.map(cartao)),
    el('h2', {}, 'Comparação'),
    tabela,
    el('h2', { style: 'margin-top:40px' }, 'Perguntas'),
    el('div', { class: 'perguntas' },
      pergunta('O que conta como “livro novo”?', 'Abrir um livro para ler pela primeira vez. Livro que você já começou continua aberto para sempre, mesmo depois do mês. Leis, quadrinhos livres e obras da comunidade não contam.'),
      pergunta('Por que o plano é de graça agora?', 'Porque a Fiolib está começando e o pagamento ainda não está ligado. Em vez de deixar todo mundo esperando, damos os planos de presente a quem pede. Não é teste com prazo curto nem pegadinha: não pedimos cartão e não há cobrança depois.'),
      pergunta('Quanto tempo demora?', 'Até 24 horas. Cada presente é concedido à mão, uma conta por vez. Você recebe um aviso no sino do site quando o plano começar a valer.'),
      pergunta('E quando o pagamento abrir?', 'Os preços desta página são os que vão valer, e ninguém é cobrado sem escolher. Quem ganhou o presente continua com ele pelo tempo combinado.'),
      pergunta('Como funciona o pedido de tradução?', 'Você escolhe um clássico em domínio público que ainda não existe em português, e a esteira do Fio o traduz. Ele entra no acervo para todo mundo, e você recebe um aviso quando ficar pronto.'),
      pergunta('Posso publicar algo que não é meu?', 'Não. Só publica quem é autor ou tem autorização por escrito, e toda obra passa por revisão antes de aparecer.')),
    el('p', { class: 'rodape' }, 'Valores em reais. Quando as assinaturas abrirem, será possível cancelar a qualquer momento.'))
}

iniciar()
