# Contas, sessão e senha

Este documento é sobre a única parte do sistema em que um erro não aparece
usando. Um catálogo com bug fica torto na tela e alguém reclama. Um login com
bug funciona **perfeitamente** enquanto a senha de todo mundo está mal
guardada — e só aparece no dia do vazamento.

Por isso aqui tudo tem motivo escrito, e 16 testes cobrem os casos em que o
sistema tem que dizer **não**.

```bash
npm test                 # os testes, sem subir nada
npm run contas           # o servidor, na porta 8787
```

---

## A primeira decisão: o site não depende disto

O Fio é uma página estática. Ler, marcar trecho, anotar e guardar o progresso
funcionam **sem servidor nenhum** — ficam no navegador de cada um.

A conta serve a uma coisa só: **levar isso de um aparelho para outro**. Quem
nunca criar conta perde nada além disso.

Consequência de arquitetura: `servidor/` é um processo separado, que pode
estar fora do ar sem derrubar a biblioteca. O site sabe disso — sem
`VITE_API` configurada, a tela de entrar explica que o servidor não está no ar
e o resto continua.

---

## A segunda: a biblioteca é fechada

> "é algo para mim e meus amigos, então é algo mais reservado"

Isso virou regra do banco, não combinado: **criar conta exige um convite**, e
o convite é uma linha na tabela `convite` — uso único, validade de 14 dias, e
guardado só em resumo (nem o código fica em claro).

```bash
node -e "import('./servidor/contas.mjs').then(async c => {
  const {abrir} = await import('./servidor/banco/base.mjs')
  console.log(c.criarConvite(abrir(), {nota: 'para o fulano'}))
})"
# → { codigo: 'FIO-7K2M-9QXB', dias: 14 }
```

O código sai no alfabeto sem `I`, `O`, `0` e `1` — é feito para ser dito no
telefone sem gerar dúvida.

---

## Senha

| | | Por quê |
|---|---|---|
| Algoritmo | **scrypt** | vem no Node (zero dependência), consome memória de propósito — o que estraga o ataque com placa de vídeo — e não tem o limite de 72 bytes do bcrypt |
| Custo | N=2¹⁵, r=8, p=1 | ~100 ms por tentativa: irrelevante para quem entra, caríssimo para quem chuta em massa |
| Sal | 16 bytes, por pessoa | duas pessoas com a mesma senha têm hashes diferentes; tabela pronta não serve |
| Parâmetros | **gravados na linha** | endurecer o scrypt daqui a dois anos não pode trancar quem já tem conta |
| Comparação | `timingSafeEqual` | medir o tempo da resposta não pode entregar quantos bytes bateram |
| Regra mínima | 10 caracteres, 5 distintos | comprimento pesa mais que "um símbolo e um número": `a casa de matacavalos` resiste mais que `S3nh@!` |

> **Uma pedra no caminho, registrada:** o scrypt do Node recusa por padrão
> qualquer chamada acima de 32 MB, e N=2¹⁵ com r=8 precisa de exatamente
> 128·N·r = 32 MB. Ou seja: o parâmetro recomendado bate no teto e falha com
> `memory limit exceeded`. É preciso passar `maxmem` explicitamente — e ele
> **não** entra na conta do hash, então não vai gravado com os parâmetros.

---

## Sessão

O que vai no cookie é um **segredo sorteado** (32 bytes de aleatório real).
O que fica no banco é o **sha256 dele**.

Quem levar o banco embora não entra como ninguém: do resumo não se volta para
o segredo.

- Cookie `HttpOnly` — o JavaScript da página não enxerga, então um XSS não o
  rouba.
- `SameSite=Lax` + `Secure` — outro site não consegue fazer o navegador
  mandá-lo num POST.
- Validade de 30 dias, **deslizante**: passou da metade e a pessoa voltou,
  renova. Sumiu, expira.
- Sair apaga a linha. Trocar a senha apaga **todas** as linhas daquela pessoa
  — se a conta foi invadida, é isso que expulsa o invasor, e é exatamente por
  isso que ela trocou.

**Por que não JWT:** um JWT não se apaga. Para invalidar um, é preciso manter
uma lista do que foi revogado — que é uma tabela de sessões com passos a mais.
Aqui a tabela é a coisa.

---

## Contra ataque

### Força bruta

Duas contagens, e as duas precisam existir:

| Conta | Protege | Sem ela |
|---|---|---|
| por **e-mail** | uma conta de quem insiste nela | uma senha vazada é testada em mil e-mails |
| por **IP** | todas as contas de quem varre a lista | quem tem botnet passa |

8 tentativas por 15 minutos para entrar; 4 por hora para "esqueci". Entrar
certo **zera** o contador daquele e-mail. O contador fica no banco, não na
memória — reiniciar o servidor não pode ser o jeito de zerar o freio de quem
está atacando.

### Descobrir quem tem conta

Duas defesas, porque são dois caminhos:

1. **A mensagem.** "E-mail ou senha não conferem" é a mesma resposta nos dois
   casos. O teste `a resposta é a mesma para e-mail que existe e que não
   existe` trava isso.
2. **O relógio.** Sem cuidado, "não existe" responde em 1 ms e "senha errada"
   em 100 ms — e qualquer um lê a diferença. Por isso, quando o e-mail não
   existe, o servidor **gasta o mesmo tempo à toa** rodando um scrypt
   descartável.

O "esqueci a senha" responde `{ok:true}` sempre, exista a conta ou não.

### CSRF

Duas travas sobre o `SameSite=Lax`:

1. Lista de origens (`FIO_ORIGENS`): só quem está nela recebe permissão de ler
   a resposta e de mandar cookie.
2. Cabeçalho `x-fio: 1` obrigatório em toda escrita. Um formulário HTML comum
   não consegue mandar cabeçalho personalizado sem antes pedir permissão — e
   essa permissão a trava 1 recusa.

### E o resto

- Corpo do pedido limitado a 64 KB.
- Erro interno nunca vaza para a resposta: vira "deu alguma coisa errada
  aqui". A mensagem real vai para o log.
- Todo SQL é parametrizado. Nenhuma string de consulta é montada com dado de
  fora.
- Do IP guarda-se só o começo (`189.45.x.x`): dá para frear, não dá para
  rastrear ninguém.

---

## Recuperar a senha

```
pede  →  token sorteado, guardado em resumo, vale 30 min, uso único
      →  e-mail com o link
usa   →  senha trocada, token queimado, TODAS as sessões derrubadas
```

Sem `FIO_EMAIL_CHAVE` configurada, o e-mail **não é enviado**: o link inteiro
aparece no log do servidor. Isso é de propósito — dá para testar a
recuperação inteira sem contratar serviço nenhum, e em produção o log grita
que falta configurar.

---

## Entrar com o Google

Está na tela, desligado, e a coluna `leitor.google_sub` já existe.

Isso não é enfeite: ligar OAuth depois costuma exigir mexer na tabela de
gente, que é a única que **não** dá para recriar. Com a coluna criada antes de
haver conta nenhuma, ligar o Google vira uma rota nova — não uma migração no
meio de um banco com pessoas dentro.

O que falta, quando for a hora: registrar o cliente no Google, receber o
`id_token`, conferir a assinatura e o `aud`, e casar por `google_sub` (nunca
por e-mail — e-mail muda de dono, `sub` não).

---

## Publicar

```
Caddy          TLS e o site estático
fio-contas     este processo (node servidor/api.mjs)
volume         catalogo.db
```

O que precisa estar certo em produção, e que os testes não pegam:

- `FIO_ORIGENS` com o endereço **exato** do site, sem barra no fim.
- **Nunca** `FIO_INSEGURO=1` fora de localhost — é o que tira o `Secure` do
  cookie.
- Backup do `.db` com `VACUUM INTO`, que é consistente com o WAL.
- O banco fora da pasta servida pelo Caddy.
