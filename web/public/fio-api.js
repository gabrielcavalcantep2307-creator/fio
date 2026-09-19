// O único jeito de as páginas falarem com a API do Fio.
//
//   fioApi.pedir('/minha-conta')                 GET
//   fioApi.pedir('/meta', { livros: 12 })        POST com JSON
//   fioApi.pedir('/meu-livro', null, { bruto: arquivo, cabecalhos: { 'x-arquivo': nome } })
//   fioApi.eu()                                  quem está entrado (ou null), UMA vez por página
//
// Até 19/09/2026 cada página tinha a sua cópia disto — seis, cada uma com um
// detalhe diferente (uma mandava `credentials: 'include'`, outra não guardava
// o status do erro, outra esquecia o x-fio no upload) — e a mesma página
// perguntava "quem sou eu?" ao servidor duas, três vezes ao abrir.
//
// Escrita sempre leva `x-fio: 1`, que o servidor exige contra CSRF. Erro vira
// exceção com `.status` e a mensagem do servidor (`.message`), que já vem em
// português para mostrar ao leitor.

;(function () {
  if (window.fioApi) return

  // `append(null)` e `replaceChildren(null)` escrevem a PALAVRA "null" na tela
  // (o navegador converte em texto). As páginas montam listas com
  // `cond ? el(...) : null` o tempo todo, e na varredura de 19/09/2026 a aba
  // Descobrir mostrou "nullnull" quando o catálogo de mangás não respondeu.
  // Aqui, uma vez para todas as páginas: nulo, indefinido e false somem.
  for (const P of [Element.prototype, DocumentFragment.prototype]) {
    for (const m of ['append', 'prepend', 'replaceChildren']) {
      const original = P[m]
      if (!original || original.semNulo) continue
      const semNulo = function (...filhos) { return original.apply(this, filhos.filter((f) => f != null && f !== false)) }
      semNulo.semNulo = true
      P[m] = semNulo
    }
  }

  async function pedir(caminho, corpo, { bruto = null, cabecalhos = {}, manter = false } = {}) {
    const escrita = corpo != null || bruto != null
    const r = await fetch('/api' + caminho, {
      method: escrita ? 'POST' : 'GET',
      credentials: 'same-origin',
      // `keepalive`: o pedido sobrevive à página fechando (o progresso do leitor)
      keepalive: manter,
      headers: {
        ...(escrita ? { 'x-fio': '1' } : {}),
        ...(bruto != null ? { 'content-type': 'application/octet-stream' } : corpo != null ? { 'content-type': 'application/json' } : {}),
        ...cabecalhos,
      },
      body: bruto ?? (corpo != null ? JSON.stringify(corpo) : undefined),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) {
      const e = new Error(j.erro || `erro ${r.status}`)
      e.status = r.status
      throw e
    }
    return j
  }

  // Quem está entrado: uma pergunta por página, dividida por todos os scripts.
  let _eu = null
  const eu = () => (_eu ??= pedir('/eu').then((r) => r.pessoa).catch(() => null))
  /** Depois de entrar, sair ou apagar a conta: a próxima pergunta vai ao servidor. */
  const esquecerEu = () => { _eu = null }

  window.fioApi = { pedir, eu, esquecerEu }
})()
