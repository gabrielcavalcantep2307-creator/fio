// De quem são os dados guardados neste navegador.
//
// A estante, o progresso, as marcações e o progresso dos quadrinhos ficam no
// navegador e sobem para a conta que estiver entrada. Até 18/09 ninguém
// lembrava DE QUEM eram: quem saía da conta A e criava a conta B mandava a
// estante de A para B. Agora o navegador guarda o dono; se entra outra conta,
// ou se a pessoa sai, o que é pessoal é apagado ANTES de qualquer sincronia.
//
// O que fica: tema e preferências de leitura dos quadrinhos, velocidade da voz,
// avisos já fechados — gosto do aparelho, não da pessoa.

(function () {
  const DONO = 'fio:dono'
  const PESSOAIS = ['fio.estante.v1', 'fio:revisao', 'fio:cegas', 'fio:quadrinhos']
  const PREFIXOS = ['fio:rascunho:', 'fio-c-']

  function limpar() {
    try {
      for (const k of PESSOAIS) localStorage.removeItem(k)
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i)
        if (k && PREFIXOS.some((p) => k.startsWith(p))) localStorage.removeItem(k)
      }
    } catch { /* modo privado */ }
    try { sessionStorage.removeItem('fio:barra') } catch {}
  }

  // Navegador com dados de ANTES desta correção: não se sabe de quem são. Vira
  // "legado" e é apagado na primeira conta que se identificar — o servidor
  // devolve o que é dela na mesma sincronia.
  try {
    if (!localStorage.getItem('fio:dono-v')) {
      if (!localStorage.getItem(DONO)) localStorage.setItem(DONO, 'legado')
      localStorage.setItem('fio:dono-v', '1')
    }
  } catch {}

  window.fioDono = {
    /** Conta que acabou de se identificar. Devolve true se apagou dados de outra. */
    conferir(id) {
      if (id == null) return false
      const agora = String(id)
      let antes = null
      try { antes = localStorage.getItem(DONO) } catch {}
      const trocou = antes != null && antes !== agora
      if (trocou) limpar()
      try { localStorage.setItem(DONO, agora) } catch {}
      return trocou
    },
    /** A pessoa saiu: nada dela fica para quem vier depois. */
    saiu() {
      limpar()
      try { localStorage.removeItem(DONO) } catch {}
    },
  }
})()
