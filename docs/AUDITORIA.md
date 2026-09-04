# Auditoria de segurança

Feita em 04/09/2026, sobre o sistema inteiro no ar: servidor de contas,
servidor de arquivos, ingestão, front-end e a máquina.

**Resumo:** seis problemas encontrados, **seis corrigidos**, com teste para
cada um. Um risco continua aberto e é operacional, não de código: sem chave de
e-mail, o link de trocar senha sai no log do servidor.

O que se testa em autenticação não é "consegue entrar". É **consegue NÃO
entrar** — são 21 testes, e eles rodam com `npm test`.

---

## O que foi corrigido

### 1. ALTA · "Apagar tudo" era mentira para quem tinha conta

O caderno tinha um botão de apagar que limpava o navegador. Com a sincronia
ligada, dois minutos depois o servidor devolvia tudo — marcações, notas,
progresso — e a pessoa não tinha como saber por quê.

Não é um detalhe de conformidade: é o sistema desfazendo, sozinho, uma decisão
explícita de alguém.

**Corrigido.** `POST /api/apagar-dados` apaga no servidor, e o botão chama os
dois lados. Teste: *"apagar os dados apaga no servidor — senão a sincronia
ressuscita"*.

### 2. MÉDIA · Não existia jeito de apagar a conta

Criar conta era possível; apagar, não. Fora de ordem pela LGPD (art. 18, IV),
e fora de ordem pelo simples: quem entra tem que poder sair levando tudo.

**Corrigido.** `POST /api/apagar-conta` apaga a linha do leitor — sessões e
dados guardados caem por cascata. Exige o **e-mail digitado** para confirmar:
um clique não é consentimento suficiente para o que não volta. E apagar apaga
mesmo, nada de `desativado = 1` disfarçado de exclusão.

### 3. MÉDIA · Sessões sem teto

Cada login deixava uma linha para trás, para sempre. Quem tivesse a senha
poderia abrir milhares de sessões que sobreviveriam à troca de aparelho — e
mesmo sem ataque, a tabela só crescia.

**Corrigido.** Doze por conta (celular, computador e anônimo com folga); acima
disso, a mais antiga sai. Teste: *"as sessões têm teto"*.

### 4. MÉDIA · A sincronia não tinha freio

Entrar, criar conta e "esqueci a senha" tinham limite de tentativas. Gravar
dados, não — e uma conta comprometida virava torneira de escrita no disco da
máquina, que é compartilhada com o Wallt.

**Corrigido.** 40 sincronias por hora por conta, com a mesma máquina de freio
das outras rotas.

### 5. BAIXA · Cookie sem o prefixo `__Host-`

O navegador só aceita gravar um cookie `__Host-` se ele vier por HTTPS, com
`Path=/` e **sem** `Domain`. Sem o prefixo, um subdomínio qualquer — ou alguém
em HTTP na mesma rede — pode gravar um cookie de sessão que o site principal
aceitaria.

**Corrigido.** O nome é `__Host-fio` em produção. Em localhost sem HTTPS o
prefixo é impossível, e lá o nome continua simples.

### 6. BAIXA · Relógio adiantado grudava um registro para sempre

A junção da sincronia é "quem escreveu por último vence". Um aparelho com a
data errada — ou de má-fé — mandaria `mudouEm` daqui a cem anos, e aquele
registro nunca mais seria substituído.

**Corrigido.** O relógio é aparado em `agora + 1 minuto`. Teste: *"relógio do
futuro não vence para sempre"*.

---

## O que foi verificado e está certo

### Senha

| | |
|---|---|
| scrypt N=2¹⁵, r=8 | ~100 ms por tentativa; irrelevante para quem entra, caro para quem chuta |
| sal de 16 bytes por pessoa | duas senhas iguais dão hashes diferentes |
| parâmetros gravados na linha | endurecer o scrypt em 2028 não tranca quem tem conta desde hoje |
| `timingSafeEqual` | o relógio não conta quantos bytes bateram |
| mínimo de 10 caracteres, 5 distintos | comprimento pesa mais que "um símbolo e um número" |

### Descobrir quem tem conta

Dois caminhos, duas defesas:

1. **A mensagem** é a mesma para "não existe" e "senha errada". Há um teste
   que compara as duas strings.
2. **O tempo** é o mesmo: quando o e-mail não existe, o servidor roda um scrypt
   descartável antes de recusar. Sem isso, 1 ms contra 100 ms entregaria a
   lista de quem tem conta aqui.

"Esqueci a senha" responde `{ok:true}` sempre.

### Força bruta

Dois contadores, e **os dois precisam existir**: por e-mail (protege uma conta
de quem insiste nela) e por IP (protege todas de quem varre a lista). Ficam no
banco, não na memória — reiniciar o servidor não pode ser o jeito de zerar o
freio de quem está atacando.

### Sessão

Token sorteado de 32 bytes; no banco fica só o **sha256**. Quem levar o banco
não entra como ninguém. Trocar a senha derruba **todas** as sessões — se a
conta foi invadida, é isso que expulsa o invasor.

### CSRF

Três camadas: `SameSite=Lax`, cabeçalho `x-fio` obrigatório em toda escrita
(um `<form>` comum não consegue mandá-lo sem antes pedir permissão), e
verificação da origem quando ela vem. Testado em produção:

```
POST /api/entrar sem x-fio → {"erro":"Pedido sem identificação."}
```

### Travessia de caminho

Três variantes testadas **contra a máquina no ar**:

```
/../../../../etc/passwd        → o app, não o arquivo
/%2e%2e%2f%2e%2e%2fetc/passwd  → o app
/dados/../../etc/passwd        → o app
```

A trava é `arquivo.startsWith(ESTATICO)` depois do `join` — e não a limpeza da
string, que sozinha nunca é suficiente.

### SQL

Toda consulta que toca dado de fora é parametrizada. As três interpolações que
existem estão em ferramentas de linha de comando (`copia.mjs`, `fundir.mjs`,
`recriarDerivada`), com valores que vêm do `argv` de quem tem acesso à máquina
— nunca da rede. Quem já pode rodar `node servidor/fundir.mjs` já pode abrir o
banco com `sqlite3`; não há privilégio a ganhar ali.

### XSS

Há **um** `dangerouslySetInnerHTML` no projeto: o corpo do capítulo. O HTML
que chega ali foi sanitizado **na ingestão** — lista de permissão de dez tags,
e **nenhum atributo sobrevive**. `<script>`, `<style>`, `<table>`, `<svg>` e
`<figure>` saem inteiros antes disso.

Sanitizar na entrada, e não na hora de mostrar, é a decisão que importa: roda
uma vez, e não há caminho de renderização que alguém possa esquecer.

### Vazamento pela mensagem de erro

Erro interno nunca chega ao cliente: vira *"Deu alguma coisa errada aqui"* e o
verdadeiro vai para o log. Corpo de pedido limitado a 64 KB.

### A máquina

- O container **não roda como root** (usuário 1717).
- A porta 8787 escuta **só em 127.0.0.1**. Quem fala com ela é o Caddy.
- `mem_limit: 320m` — se estourar, morre sozinho em vez de levar o Wallt junto.
- `/opt/fio/infra/.env` com permissão `600`; nenhum segredo no repositório
  (conferido por varredura).
- O site é montado **somente leitura** dentro do container.

### Cabeçalhos, conferidos no ar

```
Content-Security-Policy: default-src 'self'; script-src 'self'; img-src 'self' data:
  https://covers.openlibrary.org; font-src 'self'; connect-src 'self';
  form-action 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'
Strict-Transport-Security: max-age=63072000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
```

O cabeçalho `Server` é removido. As fontes passaram a ser servidas por nós — o
que fechou `font-src` em `'self'` e tirou um terceiro do caminho de toda
visita.

---

## O que continua aberto

### 1. ALTA (operacional) · O link de trocar senha sai no log

Sem `FIO_EMAIL_CHAVE`, "esqueci a senha" **não manda e-mail**: escreve o link
inteiro no log do container. Quem tiver root na VPS pode ler e assumir
qualquer conta.

Hoje isso é uma pessoa só — mas é a maior distância entre "o login é seguro" e
"o login é seguro na prática".

**O que resolve:** uma chave de envio no `.env`. Dez minutos.

### 2. MÉDIA · O backup mora no mesmo disco do banco

`infra/backup.sh` cobre "apaguei sem querer" e não cobre "a VPS morreu".

**O que resolve:** copiar o `.gz` para fora — outra máquina, ou um balde
qualquer — depois de gerar.

### 3. MÉDIA · `style-src 'unsafe-inline'`

Os temas são aplicados por variável em atributo `style`, e isso obriga a
folga. Ela **não** permite executar código, mas amplia o que um XSS faria se
existisse.

**O que resolve:** trocar os `style={{...}}` por classes com variáveis no
`:root`. É trabalho de front, não de segurança.

### 4. BAIXA · Sem segundo fator

Para uma biblioteca fechada de amigos, senha forte + convite + freio é
proporcional. Fica registrado que não há.

### 5. BAIXA · Os dois domínios são de terceiro

`fiolib.duckdns.org` e `fio.142-93-57-2.sslip.io` dependem de dois serviços
gratuitos. Se um sair do ar, o site fica inacessível **por aquele nome** — daí
manter os dois, que quebram por motivos diferentes. Um domínio próprio custa
pouco e tira essa dependência.

Vale notar de onde vem o risco real: o DuckDNS permite **atualizar o IP de um
domínio com um token na URL**. Quem tiver o token aponta o nome para onde
quiser — e o Let's Encrypt emitiria certificado para o novo dono. O token vale
tanto quanto uma senha.

### 6. BAIXA · Ninguém avisa quando cai

O `healthcheck` reinicia o container, mas não conta a ninguém. Descobrir que
caiu é abrir o site.

### 7. INFO · As capas da Open Library

Carregar capa de lá conta ao servidor deles que **alguém** abriu aquela
página. `Referrer-Policy: no-referrer` impede que saibam de onde, e nenhum
dado de conta atravessa. É o único terceiro que sobrou.

---

## Como repetir esta auditoria

```bash
npm test                                    # 21 testes, os casos de dizer NÃO

# em produção, os caminhos que têm que falhar
B=https://fio.142-93-57-2.sslip.io
curl -sS -X POST $B/api/entrar -H 'content-type: application/json' \
  -d '{"email":"a@b.com","senha":"x"}'                  # sem x-fio → 403
curl -sS "$B/%2e%2e%2f%2e%2e%2fetc%2fpasswd" | head -3  # → o app, não o arquivo
curl -sSI $B/ | grep -i "content-security\|strict-transport"

# no repositório
grep -rn 'dangerouslySetInnerHTML' web/src/      # tem que ser 1, e só o capítulo
grep -n 'prepare(`[^`]*\${' servidor/*.mjs       # tem que ser nenhum
git ls-files | grep -iE '\.env$|\.key$|\.pem$'   # tem que ser nenhum
```
