// O que as páginas soltas (comunidade, publicar, planos) dividem.
//
// Todo texto entra por nó de texto: `el()` nunca aceita HTML. Escrita manda o
// cabeçalho `x-fio`, que o servidor exige contra CSRF.

/* exported el, pedir, eu, dinheiro, recado, por */

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

// A conversa com a API é a de todas as páginas (/fio-api.js, carregado antes).
const pedir = (caminho, corpo, opcoes) => fioApi.pedir(caminho, corpo, opcoes)
const eu = () => fioApi.eu()

// `replaceChildren(null)` escreve "null" na tela (já apareceu na central em
// 16/09 e na ficha em 17/09). Todo redesenho passa por aqui.
function por(alvo, ...filhos) {
  alvo.replaceChildren(...filhos.flat(Infinity).filter((f) => f != null && f !== false))
}

const dinheiro =(v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const recado = (tipo, texto) => el('div', { class: `recado ${tipo}`, role: tipo === 'ruim' ? 'alert' : 'status' }, texto)
