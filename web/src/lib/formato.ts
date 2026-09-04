/** "45 min", "3 h", "5 h 20". Nunca "~0 h", que não diz nada. */
export function duracao(minutos: number | null | undefined) {
  if (!minutos || minutos < 1) return null
  if (minutos < 60) return `${minutos} min`
  const h = Math.floor(minutos / 60)
  const m = Math.round((minutos % 60) / 10) * 10
  return m >= 10 ? `${h} h ${m}` : `${h} h`
}
