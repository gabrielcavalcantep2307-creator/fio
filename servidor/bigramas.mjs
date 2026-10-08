// O hash dos pares de palavras (08/10/2026): o mesmo na hora de contar
// (ingestao/ocr-contexto.mjs) e na de escolher (servidor/ortografia.mjs).
// FNV-1a de 32 bits; a tabela tem 2^BITS casas, e uma colisão só infla uma
// contagem, nunca faz a escolha trocar de lado por si só.

export const BITS = 24

export function hash1(s) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return h >>> 0
}

export function hash2(a, b) {
  return (Math.imul(hash1(a), 0x9e3779b1) ^ hash1(b)) >>> (32 - BITS)
}
