// Os planos do Fio: a vitrine e a comparação. Ninguém assina por aqui ainda —
// os botões dizem isso, e o servidor também (`disponivel: false`).
//
// Tudo que aparece aqui vem de `servidor/planos.mjs` e é regra que o servidor
// faz valer. Nenhum item de "em breve", nenhum detalhe de infraestrutura.

const main = document.getElementById('main')
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
    // Sem pagamento ainda, o botão diz a verdade e guarda o interesse
    // (planos.querer): vira termômetro no painel e a lista de quem avisar.
    else if (!v.meu) acao = el('a', { class: `botao${destaque ? '' : ' fraco'}`, href: '/#/entrar' }, 'Criar conta e ser avisado')
    else if (v.meu.quer?.plano === p.chave) acao = el('span', { class: 'botao fraco', 'aria-disabled': 'true' }, 'Avisaremos quando abrir')
    else acao = el('button', { class: `botao${destaque ? '' : ' fraco'}`, type: 'button', title: 'As assinaturas ainda não estão abertas', onclick: async (e) => {
      const b = e.currentTarget
      b.disabled = true
      try { await pedir('/planos/quero', { plano: p.chave }); b.textContent = 'Pronto: avisaremos quando abrir'; try { sessionStorage.removeItem('fio:barra') } catch {} }
      catch (x) { b.disabled = false; b.textContent = x.message }
    } }, 'Me avise quando abrir')
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
    el('div', { class: 'aviso-topo', role: 'note' }, el('span', { style: 'font-size:20px' }, '🕰'),
      el('div', {}, el('b', {}, 'Ainda não dá para assinar.'), v.aviso)),
    seuPlano,
    el('div', { class: 'planos' }, v.planos.map(cartao)),
    el('h2', {}, 'Comparação'),
    tabela,
    el('h2', { style: 'margin-top:40px' }, 'Perguntas'),
    el('div', { class: 'perguntas' },
      pergunta('O que conta como “livro novo”?', 'Abrir um livro para ler pela primeira vez. Livro que você já começou continua aberto para sempre, mesmo depois do mês. Leis, quadrinhos livres e obras da comunidade não contam.'),
      pergunta('Quando vou poder assinar?', 'Quando o pagamento for ligado — cartão e Pix. Os preços desta página são os que vão valer, e quem tem conta recebe um aviso.'),
      pergunta('Como funciona o pedido de tradução?', 'Você escolhe um clássico em domínio público que ainda não existe em português, e a esteira do Fio o traduz. Ele entra no acervo para todo mundo, e você recebe um aviso quando ficar pronto.'),
      pergunta('Posso publicar algo que não é meu?', 'Não. Só publica quem é autor ou tem autorização por escrito, e toda obra passa por revisão antes de aparecer.')),
    el('p', { class: 'rodape' }, 'Valores em reais. Quando as assinaturas abrirem, será possível cancelar a qualquer momento.'))
}

iniciar()
