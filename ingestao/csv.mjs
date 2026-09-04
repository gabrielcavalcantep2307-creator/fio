// Leitor de CSV com aspas. Vinte linhas, zero dependência.
// O catálogo do Gutenberg tem vírgula e quebra de linha dentro de campo —
// `split(',')` produz lixo silencioso, que é o pior tipo de erro.

export function lerCSV(texto) {
  const linhas = []
  let campo = ''
  let linha = []
  let aspas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (aspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++ } else aspas = false
      } else campo += c
    } else if (c === '"') aspas = true
    else if (c === ',') { linha.push(campo); campo = '' }
    else if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = '' }
    else if (c !== '\r') campo += c
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha) }

  const cabecalho = linhas[0]
  return linhas.slice(1)
    .filter(l => l.length === cabecalho.length)
    .map(l => Object.fromEntries(cabecalho.map((c, i) => [c, l[i]])))
}

// O Gutenberg mistura autor, tradutor e organizador no mesmo campo, marcando
// o papel entre colchetes. O tradutor tem direito próprio sobre a tradução —
// perder essa marca é perder o cálculo de domínio público.
const PAPEIS = {
  translator: 'tradutor',
  editor: 'organizador',
  illustrator: 'ilustrador',
  contributor: 'coautor',
  commentator: 'coautor',
  author: 'autor',
}

/**
 * "Orwell, George, 1903-1950" → { nome, nome_ordem, nascimento, morte, papel }
 * Aceita "1440?-1521", "Anonymous", "Cole, G. D. H., 1889-1959 [Translator]".
 */
export function lerAutor(bruto) {
  if (!bruto) return null
  let s = bruto.trim()
  let papel = 'autor'
  const marca = s.match(/\s*\[([^\]]*)\]\s*$/)
  if (marca) {
    papel = PAPEIS[marca[1].trim().toLowerCase()] ?? 'coautor'
    s = s.slice(0, marca.index).trim()
  }
  if (!s || /^(anonymous|unknown|various)$/i.test(s)) return null

  // As datas vêm em quatro formas, e três delas são fáceis de perder:
  //   ", 1903-1950"   completo
  //   ", 1889-"       nasceu, morte desconhecida
  //   ", -1927"       só a morte  ← esta derrubava obras para o trilho B à toa
  //   ", 1440?-1521"  com interrogação
  let nascimento = null
  let morte = null
  const anos = s.match(/,\s*(?:(\d{3,4})\??)?\s*-\s*(?:(\d{3,4})\??)?\s*$/)
  if (anos && (anos[1] || anos[2])) {
    nascimento = anos[1] ? Number(anos[1]) : null
    morte = anos[2] ? Number(anos[2]) : null
    s = s.slice(0, anos.index).trim()
  }

  const nome_ordem = s
  const virgula = s.indexOf(',')
  const nome = virgula > 0 ? `${s.slice(virgula + 1).trim()} ${s.slice(0, virgula).trim()}` : s
  return { nome, nome_ordem, nascimento, morte, papel }
}
