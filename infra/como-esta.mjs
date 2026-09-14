// Em que pé está a esteira — sem precisar perguntar a ninguém.
//
//   node infra/como-esta.mjs
//
// Em Node, e não em shell, por um motivo prático: a primeira versão disto era
// um `.sh`, e o comando que eu passei — `bash /c/Users/...` — só funciona no
// Git Bash. Quem está no PowerShell recebe um erro e não tem o que fazer com
// ele. `node caminho/com/barras` funciona igual nos dois, e o projeto já
// depende do Node de qualquer forma.
//
// ─────────────────────────────────────────────────────────────
// O SINAL DE VIDA É O CADERNO CRESCENDO
//
// Em 14/09/2026 a esteira passou 1h34 parada num pedido de rede que nunca ia
// voltar. De fora, isso é idêntico a "está traduzindo um livro grande": o
// processo está lá, o livro está lá, o relógio anda.
//
// A primeira versão deste arquivo tentou separar os dois pelo tempo de
// PROCESSADOR, e estava errada. Traduzir é esperar a rede, não fazer conta: o
// Schopenhauer tinha gasto 2 segundos de processador em 10 minutos e estava
// trabalhando perfeitamente — o caderno dele cresceu 31 KB em meio minuto
// enquanto eu o acusava de travado. Pelo processador, quem traduz e quem está
// pendurado são iguais. Os dois esperam.
//
// O que separa de verdade é o CADERNO. Cada parágrafo traduzido é uma linha
// gravada nele na hora, então o arquivo cresce sem parar enquanto há trabalho,
// e congela no segundo em que o trabalho para. É o mesmo caderno que faz
// recomeçar não custar nada — ele já existia, só não estava sendo lido como o
// sinal de vida que é.
// ─────────────────────────────────────────────────────────────

import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const LOG = join(RAIZ, 'dados', 'traducoes', 'esteira.log')

/** Os processos da esteira, com quanto tempo têm de pé e de processador. */
function processos() {
  if (process.platform !== 'win32') return null
  const ps = `
    Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | ForEach-Object {
      $p = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue
      if ($p) { [pscustomobject]@{
        cmd = $_.CommandLine
        minutos = [int]((Get-Date) - $p.StartTime).TotalMinutes
        cpu = [int]$p.CPU
      } }
    } | ConvertTo-Json -Compress`
  try {
    const bruto = execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8' })
    const j = JSON.parse(bruto || 'null')
    return (Array.isArray(j) ? j : j ? [j] : [])
      .filter((p) => /esteira\.mjs|traduzir-obra\.mjs/.test(p.cmd ?? ''))
  } catch { return [] }
}

console.log('== está viva? ==')
const ps = processos()
if (ps === null) {
  console.log('   (só sei conferir isto no Windows)')
} else if (!ps.length) {
  console.log('   nenhuma esteira rodando')
  console.log('   para soltar de novo:')
  console.log('     node ingestao/esteira.mjs --quantos 35 --minutos 8000 --subir --lote 2')
} else {
  for (const p of ps) {
    // A esteira-mãe não trabalha: abre um processo por livro e espera. Ficar
    // parada é o que ela deve fazer, então ela não é julgada.
    if (/esteira\.mjs/.test(p.cmd)) {
      console.log(`   ${'(a esteira)'.padEnd(26)} ${String(p.minutos).padStart(4)} min de pé`)
      continue
    }

    const titulo = p.cmd.match(/--titulo (?:"([^"]+)"|(\S+))/)?.slice(1).find(Boolean) ?? '(um livro)'
    const saida = p.cmd.match(/--saida (?:"([^"]+)"|(\S+))/)?.slice(1).find(Boolean)
    const caderno = saida && join(RAIZ, 'dados', 'traducoes', `${saida}.caderno.jsonl`)

    let veredito = 'sem caderno ainda (baixando a fonte)'
    if (caderno && existsSync(caderno)) {
      const s = statSync(caderno)
      const parado = Math.round((Date.now() - s.mtimeMs) / 60_000)
      const kb = Math.round(s.size / 1024)
      veredito = parado >= 10
        ? `PENDURADA — o caderno não cresce há ${parado} min`
        : `traduzindo, ${kb} KB no caderno (última linha há ${parado} min)`
    } else if (p.minutos > 12) {
      // Baixar a fonte tem prazo de 3 min e três tentativas. Passou disso sem
      // caderno, não é download: é outra coisa.
      veredito = `PENDURADA — ${p.minutos} min sem começar a escrever`
    }

    console.log(`   ${titulo.slice(0, 26).padEnd(26)} ${String(p.minutos).padStart(4)} min de pé, ${veredito}`)
  }
}

console.log('\n== últimas linhas ==')
if (existsSync(LOG)) {
  const linhas = readFileSync(LOG, 'utf8').split(/\r?\n/)
    .filter((l) => /^\[|pronto:|FALHOU|↑|esteira:/.test(l))
  for (const l of linhas.slice(-12)) console.log(`   ${l.trim()}`)
} else {
  console.log('   sem log ainda')
}

const prontos = readdirSync(join(RAIZ, 'dados', 'traducoes'))
  .filter((f) => /^obra\d+\.json$/.test(f)).length
console.log(`\n== ${prontos} livros traduzidos, esperando para subir ==`)
