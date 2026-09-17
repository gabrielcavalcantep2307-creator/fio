// Os planos do Fio: a vitrine e a comparação. Ninguém assina por aqui ainda —
// os botões dizem isso, e o servidor também (`disponivel: false`).

cabecalho('planos')
const main = document.getElementById('main')

// O que cada cartão destaca; a tabela completa vem do servidor.
const DESTAQUES = {
  leitor: ['Todo o acervo, sem limite', 'Publicações da comunidade', 'Progresso em todos os aparelhos', 'Recomendações pelo seu gosto'],
  novelo: ['Tudo do Leitor', ['Pedir 1 tradução por mês', true], ['Leitura em voz alta', true], ['Selo de apoiador', true], ['Voto no que a casa traduz', true]],
  trama: ['Tudo do Novelo', 'Publicar livros e quadrinhos', 'Até 3 obras e 40 capítulos cada', '300 MB para imagens e capa própria', ['Parte da receita por leitura', true]],
  tear: ['Tudo da Trama', 'Até 20 obras e 400 capítulos cada', '3 GB para imagens', ['Pular a fila da esteira', true], ['Destaque na vitrine, 1 por mês', true]],
}

async function iniciar() {
  let v
  try { v = await pedir('/planos') } catch (e) { por(main, recado('ruim', `Não consegui abrir os planos: ${e.message}`)); return }
  const meu = v.meu?.plano

  const cartao = (p) => {
    const destaque = p.chave === 'trama'
    let acao
    if (meu === p.chave) acao = el('span', { class: 'botao fraco', 'aria-disabled': 'true' }, v.meu.porAdmin ? 'Seu plano (administração)' : 'Seu plano atual')
    else if (p.chave === 'leitor') acao = v.meu ? el('span', { class: 'botao fraco', 'aria-disabled': 'true' }, 'Incluído na sua conta') : el('a', { class: 'botao fraco', href: '/#/entrar' }, 'Criar conta grátis')
    else acao = el('button', { class: `botao${destaque ? '' : ' fraco'}`, disabled: true, title: 'As assinaturas ainda não estão abertas' }, 'Em breve')
    return el('div', { class: `plano${destaque ? ' destaque' : ''}` },
      destaque ? el('span', { class: 'fita' }, 'para criadores') : null,
      meu === p.chave ? el('span', { class: 'meu' }, 'o seu') : null,
      el('h2', {}, p.nome),
      el('p', { class: 'frase' }, p.frase),
      el('div', { class: 'preco' }, p.preco ? dinheiro(p.preco) : 'Grátis', p.preco ? el('small', {}, ' /mês') : null),
      el('div', { class: 'ano' }, p.precoAno ? `ou ${dinheiro(p.precoAno)} por ano (2 meses de presente)` : 'para sempre'),
      el('ul', {}, (DESTAQUES[p.chave] ?? []).map((d) => Array.isArray(d)
        ? el('li', { class: 'breve', title: 'chega junto com as assinaturas' }, d[0], el('span', { class: 'breve-t' }, 'em breve'))
        : el('li', {}, d))),
      acao)
  }

  const marca = (valor) => valor === true ? el('span', { class: 'sim', 'aria-label': 'sim' }, '✓')
    : valor === false ? el('span', { class: 'nao', 'aria-label': 'não' }, '—') : el('span', {}, valor)

  const tabela = el('div', { class: 'tabela' }, el('table', {},
    el('thead', {}, el('tr', {}, el('th', {}, 'O que vem em cada plano'), v.planos.map((p) => el('th', {}, p.nome, el('br'),
      el('small', { style: 'font-weight:400;color:var(--tinta2)' }, p.preco ? `${dinheiro(p.preco)}/mês` : 'grátis'))))),
    el('tbody', {}, v.recursos.map((g) => [
      el('tr', { class: 'grupo' }, el('td', { colspan: String(v.planos.length + 1) }, g.grupo)),
      g.itens.map((r) => el('tr', {},
        el('td', {}, r.nome, r.em_breve ? el('span', { class: 'breve-t' }, 'em breve') : null),
        v.planos.map((p) => el('td', {}, marca(r[p.chave]))))),
    ]))))

  const pergunta = (t, r) => el('div', { class: 'caixa' }, el('h4', {}, t), el('p', {}, r))

  por(main, 
    el('h1', {}, 'Planos do Fio'),
    el('p', { class: 'sub' }, 'Ler continua de graça, para todo mundo e para sempre. As assinaturas sustentam a casa — as traduções, o servidor — e abrem espaço para quem quer publicar as próprias histórias.'),
    el('div', { class: 'aviso-topo', role: 'note' }, el('span', { style: 'font-size:20px' }, '🕰'),
      el('div', {}, el('b', {}, 'Ainda não dá para assinar.'), v.aviso)),
    v.meu && meu !== 'leitor' ? el('p', { class: 'recado bom' }, v.meu.porAdmin
      ? 'Contas da administração têm o plano Tear.'
      : `Você tem o plano ${v.meu.nome}${v.meu.ate ? `, até ${new Date(v.meu.ate.replace(' ', 'T') + 'Z').toLocaleDateString('pt-BR')}` : ''}, concedido pela administração.`) : null,
    el('div', { class: 'planos' }, v.planos.map(cartao)),
    el('h2', {}, 'Comparação completa'),
    el('p', { class: 'sub', style: 'margin-bottom:14px' }, 'O que está marcado “em breve” chega junto com as assinaturas. O resto já funciona hoje para quem tem o plano.'),
    tabela,
    el('h2', { style: 'margin-top:40px' }, 'Perguntas'),
    el('div', { class: 'perguntas' },
      pergunta('Quando vou poder assinar?', 'Quando o pagamento estiver ligado — cartão e Pix. Os preços desta página já são os que vão valer, e quem tem conta será avisado na central.'),
      pergunta('O que continua grátis?', 'Tudo o que é leitura: o acervo inteiro, as leis, os quadrinhos livres, as publicações da comunidade, o progresso e as recomendações. Assinar nunca vai trancar um livro.'),
      pergunta('Posso publicar mangá ou livro que não é meu?', 'Não. Só publica quem é autor ou tem autorização por escrito. Toda obra passa por revisão antes de aparecer, e obra alheia é retirada.'),
      pergunta('Por que publicar começa na Trama?', 'Imagem ocupa disco e cada obra passa pela revisão de uma pessoa. O limite por plano mantém o espaço bem cuidado — e o dinheiro da assinatura é o que paga essa revisão.')),
    el('p', { class: 'rodape' }, 'Valores em reais. Quando as assinaturas abrirem, será possível cancelar a qualquer momento.'))
}

iniciar()
