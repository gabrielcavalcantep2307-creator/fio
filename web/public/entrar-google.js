// o motivo vem do servidor pela URL; entra como TEXTO, nunca como HTML
const erro = new URLSearchParams(location.search).get('erro')
if (erro) document.getElementById('motivo').textContent = erro.slice(0, 300)
