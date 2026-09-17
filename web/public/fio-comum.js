// O que as páginas soltas (comunidade, publicar, planos) dividem.
//
// Todo texto entra por nó de texto: `el()` nunca aceita HTML. Escrita manda o
// cabeçalho `x-fio`, que o servidor exige contra CSRF.

/* exported el, pedir, eu, cabecalho, dinheiro, recado, por */

function el(tag, attrs = {}, ...filhos) {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (k === 'class') e.className = v
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v)
    else if (v != null && v !== false) e.setAttribute(k, v === true ? '' : v)
  }
  for (const f of filhos.flat(Infinity)) if (f != null && f !== false) e.append(f.nodeType ? f : document.createTextNode(String(f)))
  return e
}

async function pedir(caminho, corpo, { bruto = null } = {}) {
  const r = await fetch('/api' + caminho, {
    method: corpo || bruto ? 'POST' : 'GET',
    headers: bruto ? { 'x-fio': '1', 'content-type': 'application/octet-stream' }
      : corpo ? { 'content-type': 'application/json', 'x-fio': '1' } : {},
    body: bruto ?? (corpo ? JSON.stringify(corpo) : undefined),
    credentials: 'same-origin',
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) { const e = new Error(j.erro || `erro ${r.status}`); e.status = r.status; throw e }
  return j
}

let _eu
function eu() {
  _eu ??= pedir('/eu').then((r) => r.pessoa).catch(() => null)
  return _eu
}

function cabecalho(atual) {
  const links = [['/#/', 'livros', 'livros'], ['/quadrinhos.html', 'quadrinhos', 'quadrinhos'],
    ['/publicacoes.html', 'comunidade', 'comunidade'], ['/publicar.html', 'publicar', 'publicar'], ['/assinaturas.html', 'planos', 'planos']]
  const h = el('header', {}, el('div', { class: 'barra' },
    el('a', { class: 'marca', href: '/#/' }, 'Fio'),
    el('nav', { class: 'nav' }, links.map(([href, rot, chave]) =>
      el('a', { href, 'aria-current': chave === atual ? 'page' : null }, rot)))))
  document.body.prepend(h)
}

// `replaceChildren(null)` escreve "null" na tela (já apareceu na central em
// 16/09 e na ficha em 17/09). Todo redesenho passa por aqui.
function por(alvo, ...filhos) {
  alvo.replaceChildren(...filhos.flat(Infinity).filter((f) => f != null && f !== false))
}

const dinheiro =(v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const recado = (tipo, texto) => el('div', { class: `recado ${tipo}`, role: tipo === 'ruim' ? 'alert' : 'status' }, texto)
