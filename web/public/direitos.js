// O formulário "fale com a gente" (servidor/contato.mjs). Sem conta: quem
// avisa de uma violação muitas vezes não é leitor daqui.
(function () {
  const alvo = document.getElementById('formulario')
  if (!alvo) return
  const h = (tag, attrs = {}, ...filhos) => {
    const e = document.createElement(tag)
    for (const [k, v] of Object.entries(attrs)) {
      if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v)
      else if (v != null && v !== false) e.setAttribute(k, v === true ? '' : v)
    }
    for (const f of filhos.flat()) if (f != null && f !== false) e.append(f.nodeType ? f : document.createTextNode(String(f)))
    return e
  }
  const TIPOS = {
    direito: 'Direito autoral: uma obra que não deveria estar aqui',
    privacidade: 'Meus dados pessoais (LGPD)',
    erro: 'Um erro no site ou num livro',
    outro: 'Outro assunto',
  }
  const tipo = h('select', { name: 'tipo' }, Object.entries(TIPOS).map(([k, r]) => h('option', { value: k }, r)))
  const nome = h('input', { type: 'text', name: 'nome', autocomplete: 'name', maxlength: '120', required: true })
  const email = h('input', { type: 'email', name: 'email', autocomplete: 'email', maxlength: '200', required: true })
  const obra = h('input', { type: 'text', name: 'obra', maxlength: '400', placeholder: 'ex.: https://fiolib.com.br/livro/612-o-cortico' })
  const mensagem = h('textarea', { name: 'mensagem', rows: '6', maxlength: '5000', required: true })
  const boaFe = h('input', { type: 'checkbox', name: 'boaFe' })
  const campoObra = h('label', {}, 'Qual obra ou página', obra)
  const declaracao = h('label', { class: 'boa-fe' }, boaFe,
    h('span', {}, 'Declaro, de boa-fé, que sou titular dos direitos desta obra ou estou autorizado a agir em nome de quem é, e que as informações acima são verdadeiras.'))
  const recado = h('p', { class: 'recado', hidden: true })
  const enviar = h('button', { class: 'botao', type: 'submit' }, 'Enviar')

  const ajustar = () => {
    const d = tipo.value === 'direito'
    declaracao.hidden = !d
    campoObra.hidden = !(d || tipo.value === 'erro')
    mensagem.placeholder = d ? 'Por que a obra está protegida (autor, ano, edição, contrato)? Onde está a versão autorizada?' : 'Conte o que aconteceu.'
  }
  tipo.addEventListener('change', ajustar)
  if (location.hash === '#avisar') tipo.value = 'direito'
  addEventListener('hashchange', () => { if (location.hash === '#avisar') { tipo.value = 'direito'; ajustar() } })
  ajustar()

  const form = h('form', { class: 'contato caixa', onsubmit: async (e) => {
    e.preventDefault()
    recado.hidden = true
    enviar.disabled = true
    try {
      const r = await fioApi.pedir('/contato', { tipo: tipo.value, nome: nome.value, email: email.value, obra: obra.value, mensagem: mensagem.value, boaFe: boaFe.checked })
      form.replaceChildren(h('div', {},
        h('p', { class: 'recado bom' }, `Recebido. Protocolo ${r.protocolo}.`),
        h('p', {}, 'Respondemos no e-mail que você informou. ', tipo.value === 'direito' ? 'Avisos de direito autoral bem identificados fazem o conteúdo sair do ar enquanto verificamos.' : '')))
    } catch (x) {
      recado.className = 'recado ruim'; recado.textContent = x.message; recado.hidden = false
      enviar.disabled = false
    }
  } },
  h('label', {}, 'Assunto', tipo),
  h('div', { class: 'dupla' }, h('label', {}, 'Seu nome', nome), h('label', {}, 'Seu e-mail (para a resposta)', email)),
  campoObra,
  h('label', {}, 'Mensagem', mensagem),
  declaracao, recado,
  h('div', {}, enviar))
  alvo.replaceWith(form)
})()
