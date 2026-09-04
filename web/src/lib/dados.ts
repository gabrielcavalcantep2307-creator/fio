import type { Catalogo, Livro } from '../tipos'

// O site é estático: os dados vêm de JSON gerado pela ingestão, não de uma API.
// Isso é o que permite publicar no GitHub Pages hoje. Quando houver servidor,
// só este arquivo muda.
const RAIZ = import.meta.env.BASE_URL + 'dados/'

const memoria = new Map<string, unknown>()

async function pegar<T>(caminho: string): Promise<T> {
  const guardado = memoria.get(caminho)
  if (guardado) return guardado as T
  const r = await fetch(RAIZ + caminho)
  if (!r.ok) throw new Error(`não achei ${caminho} (${r.status})`)
  const d = (await r.json()) as T
  memoria.set(caminho, d)
  return d
}

export const catalogo = () => pegar<Catalogo>('catalogo.json')

// Um arquivo por livro, com os capítulos dentro. Baixa uma vez e a leitura
// inteira fica instantânea — virar página não pede rede.
export const livro = (id: number) => pegar<Livro>(`livros/${id}.json`)

export function buscar(obras: Catalogo['obras'], termo: string) {
  const t = normal(termo)
  if (!t) return obras
  const partes = t.split(/\s+/)
  return obras
    .map(o => {
      const alvo = normal(`${o.titulo} ${o.autor} ${o.temas.join(' ')}`)
      if (!partes.every(p => alvo.includes(p))) return null
      // título bate antes de autor, e começo antes de meio
      const pos = normal(o.titulo).indexOf(partes[0])
      return { o, peso: pos === 0 ? 0 : pos > 0 ? 1 : 2 }
    })
    .filter((x): x is { o: Catalogo['obras'][0]; peso: number } => x !== null)
    .sort((a, b) => a.peso - b.peso)
    .map(x => x.o)
}

/** "Revolução" e "revolucao" têm que dar na mesma coisa. */
export const normal = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
