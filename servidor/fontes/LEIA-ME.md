# As fontes que vão dentro do PDF

Literata, de Google Fonts, sob a SIL Open Font License 1.1 (`OFL.txt`) — a
mesma licença que permite embutir a fonte num documento e redistribuí-lo.
É a fonte com que se lê no site, e agora é a do arquivo que a pessoa baixa.

O que está aqui é o **recorte latino** que o Google serve (48 KB por estilo,
contra ~300 KB da família inteira). Latin-1 inteiro cabe nele, que é
exatamente o que o `WinAnsiEncoding` do PDF endereça — nada do que
`servidor/pdf.mjs` escreve fica de fora.

Para trocar de fonte ou atualizar, o que veio daqui foi:

    curl -H "User-Agent: Mozilla/5.0 (Linux; U; Android 2.2; en-us; Nexus One Build/FRF91) AppleWebKit/533.1" \
      "https://fonts.googleapis.com/css?family=Literata:400"

O agente antigo é o que faz o Google devolver `.ttf` em vez de `woff2` — o PDF
não lê woff2, e converter exigiria uma dependência nova.
