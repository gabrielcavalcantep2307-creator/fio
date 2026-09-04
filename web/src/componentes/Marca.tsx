// A marca.
//
// Livro encadernado à mão é **cosido**: um fio atravessa os cadernos e os
// segura juntos. É a imagem literal do nome e da ideia do produto — uma obra
// puxa a seguinte, e o que existe entre elas é a linha.
//
// Traço só, ponta redonda, e nenhum detalhe que suma quando encolhe: aos 16
// pixels da aba do navegador ainda se lê como um fio.
//
// A cor vem do tema (`currentColor`), então a marca funciona no papel claro,
// no sépia e no noturno sem ter três versões.

export function Marca({ tamanho = 22 }: { tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 32 32" aria-hidden="true"
      style={{ display: 'block', overflow: 'visible' }}>
      <path
        d="M11 6 C 11 12, 21 12, 21 16 C 21 20, 11 20, 11 24 C 11 27, 15 27.5, 18 26.5"
        fill="none" stroke="currentColor" strokeWidth="2.4"
        strokeLinecap="round" strokeLinejoin="round"
      />
      <circle cx="11" cy="6" r="1.8" fill="currentColor" />
    </svg>
  )
}

/** A marca com o nome, que é o que vai no cabeçalho. */
export function Logotipo() {
  return (
    <a href="#/" className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity"
      style={{ color: 'var(--acento)' }} aria-label="Fio — início">
      <Marca />
      <span className="text-lg tracking-tight" style={{ fontFamily: 'Literata, serif', color: 'var(--tinta)' }}>
        Fio
      </span>
    </a>
  )
}
