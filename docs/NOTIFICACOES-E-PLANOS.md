# Notificações e convite aos planos — o plano, e o que já está feito

19/09/2026. O dono pediu: "a aba Para você parece rústica, não parece uma
central de notificações; se tivesse só um ícone no canto já pareceria" e
"tem que ter incentivo aos planos em alguns lugares do site, pop-ups,
mensagens flutuantes, avisos — use como base o que os maiores sites fazem".

## De onde vieram as ideias

| Quem | O que faz | O que pegamos |
|---|---|---|
| GitHub, YouTube, LinkedIn | sino com número, painel abre no lugar, "Todas / Não lidas", "marcar todas como lidas" | o sino da barra, com as duas abas e o botão |
| Facebook, LinkedIn | página inteira com grupos "Hoje / Esta semana / Antes", ícone por tipo, ponto no não lido | a página `/central.html#avisos`, refeita |
| Instagram, YouTube (celular) | no telefone, o sino leva a uma página, não abre menu | no celular o sino é link direto |
| NYT, Medium, Scribd | contador de artigos grátis do mês ("2 de 3"), sempre com o número exato | o lembrete "você abriu X de Y livros grátis este mês" |
| Spotify, Duolingo | janela com os planos, com "agora não" e sem voltar toda hora | a janela, no máximo a cada 14 dias, e nunca para quem já é assinante ou já pediu aviso |
| Wattpad, Stripe | menu que abre ao passar o mouse, com uma linha explicando cada item | os submenus de Quadrinhos e Comunidade |
| Todos eles | faixa de convite para quem não tem conta, que dá para dispensar | a faixa "crie sua conta grátis", lembrada por 7 dias |

## O que já está no ar

**O sino** (web/public/fio-cabecalho.js): número em cima do ícone, painel com
"Todas / Não lidas", ícone por tipo (segurança em vermelho, boas-vindas em
dourado), tempo relativo ("há 5 min", "ontem"), fundo diferente no não lido,
"marcar todas como lidas", "ver todas as notificações". O número se atualiza
sozinho a cada 90 segundos enquanto a aba está à vista.

**A página inteira** (`/central.html#avisos`): o mesmo desenho, com grupos por
data e um vazio que explica o que vai aparecer ali.

**Os convites**, em ordem de quem menos incomoda:
1. faixa no alto, só para quem não tem conta (dispensa por 7 dias);
2. selo "Plano Grátis" dentro do menu do perfil, que leva aos planos;
3. lembrete no canto quando a pessoa já abriu 1, 2 ou 3 dos livros grátis do
   mês — com o número exato e a data em que o próximo libera;
4. janela com os três planos pagos, no máximo a cada 14 dias, nunca no leitor,
   nunca na página de planos, nunca para assinante;
5. rodapé e página de planos, sempre à mão.

**A verdade em vez do "Em breve":** como não há pagamento, o botão diz
"me avise quando abrir" e guarda o interesse (`planos.querer`). No painel, a
aba Assinaturas mostra quantas pessoas querem cada plano — é o termômetro que
diz se vale a pena construir a cobrança, e a lista de quem avisar primeiro.

## O que fica para quando o pagamento existir

- Trocar "me avise quando abrir" por "assinar" (o código já olha
  `planos.disponivel`).
- Avisar, pelo sino, todo mundo que pediu para ser avisado.
- Oferta de boas-vindas (primeiro mês) e o aviso de renovação — os dois são
  padrão em todos os sites de assinatura, e os dois pedem regras de cobrança
  escritas nos termos antes.
