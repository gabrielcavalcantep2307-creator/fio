/**
 * "45 min", "3 h", "5 h 20". Nunca "~0 h", que não diz nada — nem "4 h 60",
 * que arredondar os minutos antes de tirar as horas produz.
 */
export function duracao(minutos: number | null | undefined) {
  if (!minutos || minutos < 1) return null
  if (minutos < 60) return `${minutos} min`
  const arredondado = Math.round(minutos / 10) * 10
  const h = Math.floor(arredondado / 60)
  const m = arredondado % 60
  return m ? `${h} h ${m}` : `${h} h`
}
