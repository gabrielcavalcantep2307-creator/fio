// O saneador de marcação, e por que ele mora no SERVIDOR.
//
// Ele nasceu em `ingestao/normalizar.mjs`, e ficou pequeno demais para lá no
// dia em que o leitor passou a poder enviar o próprio EPUB. Agora há dois
// caminhos por onde marcação de fora entra no acervo — a ingestão e o
// trilho C — e os dois têm que passar exatamente pelo mesmo filtro.
//
// Duas cópias do saneador seriam duas chances de consertar só uma.
//
// O corpo do capítulo vai para `dangerouslySetInnerHTML` no leitor. É a
// superfície mais exposta do projeto, e o arquivo que o leitor manda é tão de
// fora quanto o Wikisource: ninguém sabe o que tem dentro de um EPUB baixado
// da internet.

const PERMITIDAS = new Set(['p', 'em', 'strong', 'blockquote', 'br', 'ul', 'ol', 'li', 'h3'])
// Todo cabeçalho que sobra DENTRO de um capítulo é subtítulo — o do capítulo
// já foi consumido pelo partidor. Machado usa <h5> para o número e <h4> para
// a epígrafe ("Do titulo."); esquecer um deles apaga a epígrafe.
const TRADUZ = {
  i: 'em', b: 'strong', cite: 'em', small: 'em',
  h1: 'h3', h2: 'h3', h4: 'h3', h5: 'h3', h6: 'h3',
}

/**
 * Onde termina esta tag — e por que isto não é uma expressão regular.
 *
 * A versão anterior achava o fim com `[^>]*>`, o primeiro `>` depois do nome.
 * Isso erra dos dois lados:
 *
 *   `<img src="x>y" onerror=alert(1)>` termina cedo demais. A tag some pela
 *   metade e o resto — `onerror=alert(1)` — fica no capítulo como texto.
 *
 *   `<p data-mw='{"h":"<poem>x"}' id="mwA">`, que é como o Parsoid do
 *   Wikisource devolve parágrafo, termina no `>` de dentro do JSON, e o
 *   miolo do atributo vai parar na página.
 *
 * A versão ANTES dessa exigia aspas casadas, e aí uma aspa solta
 * (`title=a'b`) fazia o casamento falhar inteiro: a tag não era reconhecida,
 * não era removida, e ia viva para o `dangerouslySetInnerHTML` do leitor.
 *
 * O navegador não faz nada disso. A regra do HTML5 é simples e é esta: aspa
 * só abre valor quando vem logo depois do `=`. Em qualquer outro lugar ela é
 * um caractere como outro qualquer. Uma varredura de dez linhas faz certo o
 * que três expressões regulares fizeram errado.
 */
function fimDaTag(s, i) {
  let j = i + 1
  if (s[j] === '/') j++
  let nome = ''
  while (j < s.length && /[a-zA-Z0-9]/.test(s[j])) nome += s[j++]

  while (j < s.length && s[j] !== '>') {
    if (s[j] !== '=') { j++; continue }
    j++
    while (j < s.length && /\s/.test(s[j])) j++
    const aspa = s[j]
    if (aspa === '"' || aspa === "'") {
      j++
      while (j < s.length && s[j] !== aspa) j++
      j++ // a aspa que fecha
    }
  }
  return { nome, fim: j }
}

function limpar(html) {
  const semBloco = html
    // fora tudo que não é conteúdo
    .replace(/<(script|style|table|figure|svg)[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')

  let saida = ''
  for (let i = 0; i < semBloco.length; i++) {
    const c = semBloco[i]
    if (c !== '<') { saida += c; continue }

    // `<` que não começa tag é texto — "5 < 6" tem que sobreviver, e virar
    // entidade em vez de virar começo de marcação na cara do leitor.
    const depois = semBloco[i + 1] === '/' ? semBloco[i + 2] : semBloco[i + 1]
    if (!/[a-zA-Z]/.test(depois ?? '')) { saida += '&lt;'; continue }

    const { nome, fim } = fimDaTag(semBloco, i)
    const fechando = semBloco[i + 1] === '/'
    const alvo = TRADUZ[nome.toLowerCase()] ?? nome.toLowerCase()
    if (PERMITIDAS.has(alvo)) saida += fechando ? `</${alvo}>` : `<${alvo}>`
    i = fim // o laço avança para depois do `>`
  }

  return saida
    .replace(/\s+/g, ' ')
    .replace(/<p>\s*(<br>\s*)*<\/p>/g, '')
    .trim()
}

// Exportado porque é controle de segurança, e controle de segurança sem teste
// é intenção. Quem testa é `servidor/testes.mjs`, que é o que roda no CI.
export { limpar }
