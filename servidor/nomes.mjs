// Nomes de autor como uma pessoa escreveria.
//
// O Project Gutenberg guarda "Sobrenome, Nome, Título" e completa as iniciais
// entre parênteses: "Chesterton, G. K. (Gilbert Keith)", "La Motte-Fouqué,
// Friedrich Heinrich Karl, Freiherr de", "Lytton, Edward Bulwer Lytton, Baron".
// A esteira virava isso ao contrário sem pensar e o site mostrava
// "G. K. (Gilbert Keith) Chesterton", "Freiherr de Friedrich Heinrich Karl La
// Motte-Fouqué" e "Baron Edward Bulwer Lytton Lytton" (varredura de 19/09/2026).
// E a ingestão do Wikisource deixou "(página não existe)" — o texto do link
// vermelho — no nome de doze autores.

const SUFIXOS = /^(jr\.?|sr\.?|junior|júnior|filho|neto|ii|iii|iv)$/i

/** "Chesterton, G. K. (Gilbert Keith)" → "G. K. Chesterton". */
export function nomeDoGutenberg(bruto) {
  const partes = String(bruto ?? '').split(/,\s*/).map((p) => p.trim()).filter(Boolean)
  if (!partes.length) return ''
  if (partes.length === 1) return limparNome(partes[0])
  const [sobrenome, nomes, ...resto] = partes
  const sufixo = resto.filter((r) => SUFIXOS.test(r))
  // título de nobreza não entra no nome ("Freiherr de", "Baron")
  let nome = [nomes, sobrenome, ...sufixo].join(' ')
  // "Edward Bulwer Lytton" + "Lytton": o sobrenome repetido no fim sai
  const palavras = nome.split(/\s+/)
  if (palavras.length > 2 && palavras.at(-1) === palavras.at(-2)) palavras.pop()
  nome = palavras.join(' ')
  // resto que não é título nem sufixo (raro) é descartado: o Gutenberg põe ali
  // datas e funções, nunca parte do nome com que a pessoa assina
  return limparNome(nome)
}

/** Limpa um nome já na ordem de leitura. */
export function limparNome(nome) {
  let n = String(nome ?? '')
    .replace(/\s*\(página não existe\)\s*/gi, ' ')
    .replace(/\s*\((translator|tradutor|editor|ed\.)\)\s*/gi, ' ')
  // Os parênteses do Gutenberg só completam iniciais: "G. K. (Gilbert Keith)".
  // Sai só quando há inicial antes — "Anônimo (cantar de gesta)" fica.
  n = n.replace(/^(.*?\b[A-ZÀ-Ý]\.[^(]*?)\s*\([^)]*\)\s*/u, '$1 ')
  // Título estrangeiro que a inversão jogou na FRENTE do nome inteiro
  // ("Freiherr de Friedrich Heinrich Karl…", "Baron Edward Bulwer…"). Só com
  // três palavras ou mais depois: "Conde de Penha Garcia" e "Barão de Mauá"
  // são o nome pelo qual a pessoa é conhecida, e ficam.
  const m = n.match(/^\s*(freiherr|baron|graf|count|earl|viscount|vicomte|marquis|duke|prince)(?:\s+(?:de|von|of|di|du))?\s+(.+)$/i)
  if (m && m[2].trim().split(/\s+/).length >= 3) n = m[2]
  const palavras = n.replace(/\s+/g, ' ').trim().split(' ')
  if (palavras.length > 2 && palavras.at(-1) === palavras.at(-2)) palavras.pop()
  return palavras.join(' ')
}
