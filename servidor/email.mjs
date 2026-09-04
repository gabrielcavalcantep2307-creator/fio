// Mandar e-mail.
//
// Só um caso de uso hoje: o link de trocar a senha. Por isso não há
// dependência nenhuma — é um POST na API de um serviço de envio.
//
// Sem `FIO_EMAIL_CHAVE` configurada, o e-mail **não é enviado**: ele aparece
// no log do servidor, com o link inteiro. Isso é de propósito — em
// desenvolvimento dá para testar a recuperação de senha sem contratar nada,
// e em produção o log grita que falta configurar.

const SERVICO = process.env.FIO_EMAIL_SERVICO || 'resend'
const CHAVE = process.env.FIO_EMAIL_CHAVE
const DE = process.env.FIO_EMAIL_DE || 'Fio <nao-responda@exemplo.org>'

const escapar = (s) => String(s).replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

/** O e-mail tem a cara do site: papel, serifa, e nada de imagem. */
function montar({ titulo, texto, botao }) {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#fbf9f5;padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:480px" cellpadding="0" cellspacing="0">
  <tr><td style="font:500 20px Georgia,serif;color:#1c1815;padding-bottom:4px">Fio</td></tr>
  <tr><td style="border-top:1px solid #e0d9cd;padding-top:24px">
    <p style="font:400 17px/1.5 Georgia,serif;color:#1c1815;margin:0 0 14px">${escapar(titulo)}</p>
    <p style="font:400 15px/1.6 -apple-system,Segoe UI,sans-serif;color:#6b6157;margin:0 0 26px">${escapar(texto)}</p>
    ${botao ? `<a href="${escapar(botao.url)}" style="display:inline-block;background:#7a2e2e;color:#fff;text-decoration:none;padding:11px 22px;border-radius:4px;font:400 14px -apple-system,Segoe UI,sans-serif">${escapar(botao.rotulo)}</a>
    <p style="font:400 12px/1.6 -apple-system,sans-serif;color:#9a9086;margin:22px 0 0">Se o botão não funcionar, copie este endereço:<br><span style="word-break:break-all">${escapar(botao.url)}</span></p>` : ''}
  </td></tr>
  <tr><td style="border-top:1px solid #e0d9cd;padding-top:18px;margin-top:26px">
    <p style="font:400 12px/1.5 -apple-system,sans-serif;color:#9a9086;margin:18px 0 0">
      Você recebeu isto porque alguém pediu a troca de senha da sua conta no Fio.
      Se não foi você, pode ignorar: nada muda sem abrir o link.
    </p>
  </td></tr>
</table></td></tr></table></body></html>`
}

export async function enviar({ para, assunto, titulo, texto, botao }) {
  const html = montar({ titulo, texto, botao })

  if (!CHAVE) {
    console.warn(
      `\n[fio/email] FIO_EMAIL_CHAVE não configurada — o e-mail NÃO foi enviado.\n` +
      `  para:    ${para}\n  assunto: ${assunto}\n` +
      (botao ? `  link:    ${botao.url}\n` : ''),
    )
    return { enviado: false, motivo: 'sem chave' }
  }

  if (SERVICO !== 'resend') {
    throw new Error(`serviço de e-mail desconhecido: ${SERVICO}`)
  }

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${CHAVE}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: DE, to: [para], subject: assunto, html }),
  })
  if (!r.ok) {
    // Não vaze o motivo para quem pediu: um erro do provedor não é assunto
    // de quem só clicou em "esqueci a senha".
    console.error('[fio/email] falhou', r.status, await r.text().catch(() => ''))
    return { enviado: false, motivo: 'provedor recusou' }
  }
  return { enviado: true }
}
