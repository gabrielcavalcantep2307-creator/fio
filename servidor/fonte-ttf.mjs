// O suficiente de TrueType para embutir uma fonte num PDF.
//
// O PDF conhece catorze fontes de cor — Times, Helvetica, Courier — que não
// precisam ser embutidas porque todo leitor já as tem. Era com Times que o
// nosso PDF saía: correto, leve, e sem cara nenhuma. Para o arquivo ter a
// cara do site é preciso embutir a Literata, e para embutir uma fonte o PDF
// exige o que só o arquivo da fonte sabe dizer: a largura de cada letra, a
// altura da maiúscula, a inclinação do itálico, a caixa que cerca o desenho.
//
// Isto lê essas medidas. Não desenha glifo nenhum e não sabe nada de
// contornos: o desenho vai inteiro para dentro do PDF, em `/FontFile2`, e
// quem desenha é o leitor. O que se lê aqui são cinco tabelas:
//
//   head  o tamanho do "em" (a régua de tudo) e a caixa do desenho
//   hhea  quantas larguras a hmtx traz, e as alturas de linha
//   hmtx  a largura de avanço de cada glifo
//   cmap  de letra para glifo (formato 4, que é o do Unicode básico)
//   OS/2  a altura da maiúscula; post, a inclinação do itálico
//
// As fontes em `fontes/` são o recorte latino que o Google serve (48 KB cada,
// contra 300 KB da família inteira). Latin-1 inteiro cabe ali, que é
// exatamente o que o WinAnsiEncoding do PDF endereça.

/**
 * Lê as medidas de um arquivo TrueType.
 *
 * @param {Buffer} buf o arquivo .ttf inteiro
 * @returns {{unitsPerEm:number, ascent:number, descent:number, capHeight:number,
 *            italicAngle:number, bbox:number[], avancoDe:(cp:number)=>number|null}}
 */
export function lerTtf(buf) {
  const u16 = (o) => buf.readUInt16BE(o)
  const i16 = (o) => buf.readInt16BE(o)
  const u32 = (o) => buf.readUInt32BE(o)

  const tabelas = {}
  const quantas = u16(4)
  for (let i = 0; i < quantas; i++) {
    const p = 12 + i * 16
    tabelas[buf.toString('latin1', p, p + 4)] = { off: u32(p + 8), len: u32(p + 12) }
  }
  for (const obrigatoria of ['head', 'hhea', 'hmtx', 'cmap']) {
    if (!tabelas[obrigatoria]) throw new Error(`fonte sem a tabela ${obrigatoria}`)
  }

  const head = tabelas.head.off
  const unitsPerEm = u16(head + 18)
  const bbox = [i16(head + 36), i16(head + 38), i16(head + 40), i16(head + 42)]

  const hhea = tabelas.hhea.off
  const ascent = i16(hhea + 4)
  const descent = i16(hhea + 6)
  // A hmtx guarda a largura só das primeiras `quantasLarguras`; daí para a
  // frente todos os glifos avançam o mesmo, e repetem o último valor.
  const quantasLarguras = u16(hhea + 34)
  const hmtx = tabelas.hmtx.off
  const avancoDoGlifo = (g) => u16(hmtx + (g < quantasLarguras ? g : quantasLarguras - 1) * 4)

  // ── cmap, formato 4 ──
  //
  // Escolhe a subtabela do Windows/Unicode (3,1). É a que toda fonte moderna
  // traz e a única que o formato 4 endereça direito.
  const cmap = tabelas.cmap.off
  let sub = 0
  for (let i = 0, n = u16(cmap + 2); i < n; i++) {
    const p = cmap + 4 + i * 8
    const plataforma = u16(p)
    const codificacao = u16(p + 2)
    if ((plataforma === 3 && codificacao === 1) || (plataforma === 0 && !sub)) sub = cmap + u32(p + 4)
  }
  if (!sub || u16(sub) !== 4) throw new Error('fonte sem cmap em formato 4')

  const segmentos = u16(sub + 6) / 2
  const fins = sub + 14
  const inicios = fins + segmentos * 2 + 2
  const deltas = inicios + segmentos * 2
  const desvios = deltas + segmentos * 2

  const glifoDe = (cp) => {
    for (let i = 0; i < segmentos; i++) {
      if (cp > u16(fins + i * 2)) continue
      const inicio = u16(inicios + i * 2)
      if (cp < inicio) return 0
      const delta = i16(deltas + i * 2)
      const desvio = u16(desvios + i * 2)
      if (desvio === 0) return (cp + delta) & 0xffff
      const p = desvios + i * 2 + desvio + (cp - inicio) * 2
      if (p + 1 >= buf.length) return 0
      const g = u16(p)
      return g === 0 ? 0 : (g + delta) & 0xffff
    }
    return 0
  }

  // A altura da maiúscula só existe na OS/2 versão 2 em diante; sem ela, a
  // estimativa clássica de 70% do em serve — é descritivo, não métrica de
  // composição, e nenhum leitor posiciona texto por este número.
  let capHeight = Math.round(unitsPerEm * 0.7)
  if (tabelas['OS/2'] && u16(tabelas['OS/2'].off) >= 2) capHeight = i16(tabelas['OS/2'].off + 88)

  const italicAngle = tabelas.post ? i16(tabelas.post.off + 4) : 0

  return {
    unitsPerEm,
    ascent,
    descent,
    capHeight,
    italicAngle,
    bbox,
    /** A largura de avanço da letra, na régua de mil do PDF. `null` se a fonte não a tem. */
    avancoDe(cp) {
      const g = glifoDe(cp)
      if (!g) return null
      return Math.round((avancoDoGlifo(g) * 1000) / unitsPerEm)
    },
  }
}
