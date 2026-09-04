// Marcação de trecho sem depender da estrutura do HTML.
//
// O trecho é guardado como um par de deslocamentos no TEXTO do capítulo — não
// como um caminho de nós do DOM. Assim a marcação sobrevive a mudar a fonte,
// virar página, trocar o tema e até a uma limpeza melhor do HTML na próxima
// ingestão.
//
// Uma lição aprendida na marra: NÃO se pinta mexendo no DOM depois que o React
// desenhou. Ele é o dono daquela árvore e desfaz a mudança no próximo render,
// sem erro nenhum — só a marcação some. Então a marcação entra ANTES, no
// próprio HTML que o React recebe.

/** Percorre os nós de texto somando o comprimento, para converter DOM ↔ posição. */
function nos(raiz: Node) {
  const passo = (raiz.ownerDocument ?? document).createTreeWalker(raiz, NodeFilter.SHOW_TEXT)
  const lista: { no: Text; inicio: number; fim: number }[] = []
  let acumulado = 0
  let n: Node | null
  while ((n = passo.nextNode())) {
    const t = n as Text
    lista.push({ no: t, inicio: acumulado, fim: acumulado + t.data.length })
    acumulado += t.data.length
  }
  return lista
}

/** O que está selecionado agora, em posições do capítulo. */
export function selecao(raiz: HTMLElement) {
  const s = window.getSelection()
  if (!s || s.isCollapsed || s.rangeCount === 0) return null
  const r = s.getRangeAt(0)
  if (!raiz.contains(r.commonAncestorContainer)) return null

  const lista = nos(raiz)
  const acha = (no: Node, deslocamento: number) => {
    const achado = lista.find(x => x.no === no)
    return achado ? achado.inicio + deslocamento : null
  }
  const inicio = acha(r.startContainer, r.startOffset)
  const fim = acha(r.endContainer, r.endOffset)
  if (inicio === null || fim === null || fim - inicio < 2) return null

  const trecho = r.toString().replace(/\s+/g, ' ').trim()
  if (!trecho) return null

  return { inicio, fim, trecho, caixa: r.getBoundingClientRect() }
}

const analisador = new DOMParser()

/**
 * Devolve o HTML do capítulo com as marcações já dentro.
 * As posições são as mesmas que `selecao()` produz, porque os dois contam
 * caracteres do texto do mesmo jeito.
 */
export function comMarcas(
  html: string,
  marcas: { id: string; inicio: number; fim: number; cor: string }[],
) {
  if (!marcas.length) return html

  const doc = analisador.parseFromString(`<div id="raiz">${html}</div>`, 'text/html')
  const raiz = doc.getElementById('raiz')!

  // de trás para a frente: assim uma marcação não desloca as posições da outra
  for (const marca of [...marcas].sort((a, b) => b.inicio - a.inicio)) {
    // Um trecho pode atravessar um <em> no meio, e aí são vários nós de texto.
    // Avança pedaço a pedaço até cobrir tudo, recalculando as posições — cada
    // corte de nó muda a lista.
    let coberto = marca.inicio
    let voltas = 0
    while (coberto < marca.fim && voltas++ < 200) {
      const alvo = nos(raiz).find(x => x.fim > coberto && x.inicio < marca.fim)
      if (!alvo) break

      const de = Math.max(coberto, alvo.inicio)
      const ate = Math.min(marca.fim, alvo.fim)
      if (de >= ate) { coberto = alvo.fim; continue }

      let no = alvo.no
      if (de > alvo.inicio) no = no.splitText(de - alvo.inicio)
      if (ate - de < no.data.length) no.splitText(ate - de)

      const m = doc.createElement('mark')
      m.setAttribute('data-cor', marca.cor)
      m.setAttribute('data-id', marca.id)
      no.parentNode?.insertBefore(m, no)
      m.appendChild(no)
      coberto = ate
    }
  }
  return raiz.innerHTML
}
