import { useEffect, useState } from 'react'
import type { ObraResumo } from '../tipos'

// A capa.
//
// Três origens, nesta ordem:
//   1. arquivo nosso, baixado do Gutenberg      /capas/{id}.jpg
//   2. a Open Library, que serve capa por id    covers.openlibrary.org
//   3. nenhuma — e aí desenhamos uma
//
// O caso 3 não é um retângulo cinza. Um retângulo cinza numa estante de
// cinquenta livros estraga a estante inteira. A capa desenhada usa o título,
// o autor e uma cor tirada do próprio título — então é sempre a mesma para o
// mesmo livro, e a estante fica com cara de estante.

const PALETA = [
  ['#2c3d4f', '#e8dfd0'], ['#4a3328', '#efe3d2'], ['#3a4636', '#e6ead9'],
  ['#54303a', '#f2e2e4'], ['#2f3a52', '#e2e6f0'], ['#4d4126', '#efe8d4'],
  ['#39304a', '#e8e2f0'], ['#1f3d3a', '#dcece8'], ['#5a3520', '#f4e5d6'],
  ['#33404a', '#e4ecf2'],
]

/** Mesma entrada, mesma cor, sempre. Estante não pode piscar a cada carga. */
function corDe(chave: string) {
  let h = 0
  for (let i = 0; i < chave.length; i++) h = (h * 31 + chave.charCodeAt(i)) >>> 0
  return PALETA[h % PALETA.length]
}

// ─────────────────────────────────────────────────────────────
// Capa em branco é pior que capa nenhuma
//
// A Open Library serve, para muitas obras, uma digitalização quase branca —
// uma folha de rosto lavada, ou um scan estourado. Ela CARREGA (não é erro de
// rede, não é 404), e o resultado na estante é um retângulo branco no meio de
// capas de verdade: parece defeito do site.
//
// Aqui a imagem é examinada de fato: desenha-se num canvas de 12×18 e mede-se
// média e desvio dos pixels. Quase branca e quase uniforme ⇒ trata-se como
// "sem capa", e a desenhada entra no lugar.
//
// A checagem roda numa imagem SEPARADA, com CORS. Se o servidor não permitir,
// a checagem falha em silêncio e a capa original continua aparecendo — nunca
// o contrário.
// ─────────────────────────────────────────────────────────────

const MEDIA_MAXIMA = 228   // 0 = preto, 255 = branco
const DESVIO_MINIMO = 42   // menos que isso é uma superfície lisa

const veredito = new Map<string, boolean>() // url → serve?

function examinar(url: string): Promise<boolean> {
  if (veredito.has(url)) return Promise.resolve(veredito.get(url)!)
  return new Promise(resolve => {
    const guardar = (serve: boolean) => { veredito.set(url, serve); resolve(serve) }
    const im = new Image()
    im.crossOrigin = 'anonymous'
    im.onerror = () => guardar(true) // sem CORS: não dá para julgar, então aceita
    im.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = 12; c.height = 18
        const g = c.getContext('2d', { willReadFrequently: true })!
        g.drawImage(im, 0, 0, 12, 18)
        const d = g.getImageData(0, 0, 12, 18).data
        let soma = 0, soma2 = 0, n = 0
        for (let i = 0; i < d.length; i += 4) {
          const v = (d[i] + d[i + 1] + d[i + 2]) / 3
          soma += v; soma2 += v * v; n++
        }
        const media = soma / n
        const desvio = Math.sqrt(Math.max(0, soma2 / n - media * media))
        guardar(!(media > MEDIA_MAXIMA && desvio < DESVIO_MINIMO))
      } catch {
        guardar(true) // canvas sujo: não dá para julgar
      }
    }
    im.src = url
  })
}

// ─────────────────────────────────────────────────────────────

export function Capa({ obra, tamanho = 'medio' }: { obra: ObraResumo; tamanho?: 'pequeno' | 'medio' | 'grande' }) {
  const url = obra.capa
    ? `${import.meta.env.BASE_URL}capas/${obra.capa}`
    : obra.capaOL
      ? `https://covers.openlibrary.org/b/id/${obra.capaOL}-M.jpg`
      : null

  const [serve, setServe] = useState(() => (url ? veredito.get(url) ?? true : false))

  useEffect(() => {
    if (!url) return
    let vivo = true
    examinar(url).then(ok => { if (vivo) setServe(ok) })
    return () => { vivo = false }
  }, [url])

  // A desenhada fica SEMPRE atrás. Enquanto a foto não decodifica — e são
  // dezenas numa estante — o que aparecia era um retângulo branco, que é
  // exatamente o defeito que a capa desenhada existe para não ter. Assim o
  // lugar do livro já nasce com cara de livro, e a foto entra por cima quando
  // chega. Se ela nunca chegar, ou chegar lavada, ninguém percebe.
  return (
    <span className="block relative w-full h-full">
      <Desenhada obra={obra} tamanho={tamanho} />
      {url && serve && (
        <img
          src={url}
          alt={`Capa de ${obra.titulo}`}
          loading="lazy"
          decoding="async"
          width={300}
          height={450}
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => setServe(false)}
        />
      )}
    </span>
  )
}

/**
 * A capa desenhada.
 *
 * Não é um substituto envergonhado: é uma capa tipográfica de verdade, com
 * moldura, filete e a cor tirada do título. Numa estante misturada com scans
 * do século XIX, ela se comporta como mais um livro — e não como um buraco.
 */
function Desenhada({ obra, tamanho }: { obra: ObraResumo; tamanho: 'pequeno' | 'medio' | 'grande' }) {
  const [fundo, tinta] = corDe(obra.titulo + obra.autor)
  const titulo = obra.titulo.length > 58 ? obra.titulo.slice(0, 56) + '…' : obra.titulo
  const corpo = tamanho === 'grande' ? 15 : titulo.length > 34 ? 9.5 : titulo.length > 18 ? 11.5 : 13.5

  return (
    <svg viewBox="0 0 200 300" className="w-full h-full" role="img"
      aria-label={`Capa de ${obra.titulo}, de ${obra.autor}`}>
      <rect width="200" height="300" fill={fundo} />
      {/* um brilho no alto, para a capa não ser uma chapa de cor */}
      <rect width="200" height="300" fill="url(#luz)" />
      <defs>
        <radialGradient id="luz" cx="30%" cy="18%" r="85%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="10" y="10" width="180" height="280" fill="none" stroke={tinta} strokeOpacity="0.28" />
      <line x1="26" y1="112" x2="174" y2="112" stroke={tinta} strokeOpacity="0.3" />
      <foreignObject x="24" y="122" width="152" height="118">
        <div style={{
          font: `500 ${corpo}px/1.32 Literata, Georgia, serif`,
          color: tinta, textAlign: 'center', hyphens: 'auto',
        }}>{titulo}</div>
      </foreignObject>
      <foreignObject x="18" y="250" width="164" height="34">
        <div style={{
          font: '400 7.5px/1.3 Inter, system-ui, sans-serif',
          letterSpacing: '0.09em', textTransform: 'uppercase',
          color: tinta, opacity: 0.72, textAlign: 'center',
        }}>{obra.autor}</div>
      </foreignObject>
    </svg>
  )
}

/** A capa com o que precisa vir junto: link, título por baixo, e o estado. */
export function Livrete({ obra, mostrarAutor = true }: { obra: ObraResumo; mostrarAutor?: boolean }) {
  return (
    <a href={`#/obra/${obra.id}`} className="group block">
      <div
        className="relative aspect-[2/3] overflow-hidden rounded-[3px] transition-transform duration-200 group-hover:-translate-y-1"
        style={{ boxShadow: '0 1px 2px rgba(0,0,0,.18), 0 8px 20px -12px rgba(0,0,0,.5)' }}
      >
        <Capa obra={obra} />
        {obra.trilho === 'A' && (
          <span
            className="absolute bottom-0 left-0 right-0 py-1 text-center opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: 'color-mix(in srgb, var(--acento) 92%, transparent)', color: '#fff', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase' }}
          >ler agora</span>
        )}
      </div>
      <div className="mt-2 leading-snug">
        <div className="text-[0.82rem] line-clamp-2" style={{ fontFamily: 'Literata, serif' }}>
          {obra.titulo}
        </div>
        {mostrarAutor && (
          <div className="text-[0.7rem] mt-0.5 truncate" style={{ color: 'var(--tinta-2)' }}>
            {obra.autor}
          </div>
        )}
      </div>
    </a>
  )
}
