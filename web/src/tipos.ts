// O vocabulário do site, e ele é o mesmo do banco.
//
//   Obra    a coisa abstrata: "Dom Casmurro, de Machado, 1899"
//   Texto   uma manifestação dela num idioma, com um dono de tradução
//   Trilho  A = dá para ler aqui · B = só referência · C = arquivo do leitor
//
// A separação entre obra e texto é o que permite dizer "temos o livro, mas
// não podemos servir esta tradução". Está explicada em docs/ACERVO.md.

export type Trilho = 'A' | 'B' | 'C'
export type Nivel = 'iniciante' | 'intermediario' | 'avancado' | 'academico'

export type ObraResumo = {
  id: number
  titulo: string
  autor: string
  autorId: number | null
  ano: number | null
  trilho: Trilho
  nivel: Nivel | null
  paginas: number | null
  minutos: number | null
  temas: string[]
  /** por que NÃO dá para ler aqui — só existe no trilho B */
  impedimento?: string
}

export type Capitulo = {
  ordem: number
  titulo: string | null
  corpo: string
  palavras: number
}

export type Livro = ObraResumo & {
  textoId: number
  fonte: string
  fonteUrl: string | null
  direito: string
  capitulos: Capitulo[]
}

export type Catalogo = {
  geradoEm: string
  obras: ObraResumo[]
  autores: { id: number; nome: string; obras: number; morte: number | null }[]
}
