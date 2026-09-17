// Aplica, antes de a página pintar, o tema que a pessoa escolheu no app.
// Fica no <head> de toda página solta; sem isto, quem lê de noite vê o claro
// piscar antes de o cabeçalho carregar.
try {
  const guardado = JSON.parse(localStorage.getItem('fio.estante.v1') || '{}')
  document.documentElement.dataset.tema = guardado?.prefs?.tema || 'claro'
} catch { document.documentElement.dataset.tema = 'claro' }
