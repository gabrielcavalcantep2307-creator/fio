# A Central

Tudo que dá para saber sobre a VPS, numa página que roda no **seu** computador.

```
Central.cmd          (clique duas vezes)
```

ou, no terminal:

```
node central/servidor.mjs
```

Ela abre o navegador sozinha. A janela preta **é** o programa: fechar a janela
fecha a central.

---

## Por que não fica na VPS

Três motivos, em ordem de importância.

**1. Um painel que faz tudo é a coisa mais perigosa da máquina.** Quem passar
por ele não precisa passar por mais nada: reiniciar serviço, ler banco, rodar
deploy — é tudo poder de administrador. Poder de administrador atrás de uma
senha numa página pública é um convite, e senha vaza.

**2. Um painel hospedado na VPS está fora do ar exatamente quando a VPS tem
problema** — o único momento em que alguém realmente precisa dele. Um
monitorador que cai junto com o que ele monitora não é um monitorador.

**3. Não precisou inventar login nenhum.** A chave SSH já existe e já é o que
autoriza mexer na máquina. Um login novo é mais uma coisa para errar.

A central escuta em `127.0.0.1`, endereço que não existe para o resto do mundo.
Nenhuma porta nova foi aberta na VPS.

### O segredo na URL

"Só escuta em 127.0.0.1" protege contra a internet e **não** protege contra o
próprio navegador: qualquer página aberta numa aba pode mandar um pedido para
`http://127.0.0.1:7777`. Por isso todo pedido exige um segredo sorteado quando o
programa sobe. Ele vai na URL e fica na aba; nenhuma outra página adivinha.

É a diferença entre uma porta destrancada dentro de casa e uma porta destrancada
na rua. O segredo muda a cada vez que a central sobe — um endereço de ontem não
funciona hoje.

---

## As peças

```
central/coletar.py     roda NA VPS, lê tudo, imprime um JSON só
central/servidor.mjs   roda no seu PC: chama o coletor por SSH, serve a página
central/pagina.js      as REGRAS e as seções — é o arquivo que você vai mexer
central/pagina.css     a aparência
central/pagina.html    o esqueleto
```

**O coletor é Python** e o resto é Node porque a VPS não tem node no host. Tem
dentro do contêiner do Fio, e o contêiner não enxerga o host — não vê
`docker ps`, não vê as portas, não vê o disco. Um coletor lá dentro seria cego
justamente para o que se quer ver.

**Um JSON só, e não um pedido por seção.** Cada chamada custa um SSH inteiro,
uns dois segundos. Quinze seções seriam trinta segundos de espera para dizer a
mesma coisa.

---

## As regras são o coração

Um painel que mostra `disco 87%` espera que você já saiba se 87 é bom ou ruim.
Um painel que diz *"o disco vai encher em poucos dias — apague as pastas antigas
do deploy"* não espera nada.

Toda regra em `pagina.js` responde três coisas:

| campo | o que é |
|---|---|
| `titulo` | o que está acontecendo |
| `porque` | por que isso importa — **a parte que ensina** |
| `oquefazer` | o que fazer — a parte que resolve |

Para acrescentar uma, ponha uma função na lista `REGRAS`. Ela recebe o panorama
e devolve um alerta ou `null`:

```js
(d) => {
  if (d.maquina.troca_mb.total > 0) return null
  return {
    nivel: 'atencao',                        // grave | atencao | info
    titulo: 'A máquina não tem swap',
    porque: 'Sem swap, um pico de memória mata um programa em vez de deixar tudo lento.',
    oquefazer: 'Criar 1 GB de swap resolve.',
  }
}
```

O `**negrito**` dentro de `oquefazer` aponta para o botão que resolve.

---

## As ações

Uma lista **fechada**, em `servidor.mjs`. Não existe campo para digitar comando,
e isso é de propósito: um painel com terminal embutido é um painel que, se
alguém alcançar, vira controle total da máquina. Com lista fechada, o pior que
um pedido forjado consegue é reiniciar um contêiner que volta em cinco segundos.

Toda ação declara o que faz, **o que estraga se der errado**, quanto demora e o
risco — e a página mostra isso antes de perguntar se pode.

```js
'minha-acao': {
  nome: 'O que aparece no botão',
  faz: 'Uma frase do que acontece.',
  estraga: 'O que se perde se der errado. Seja honesto aqui.',
  demora: 'uns 2 minutos',      // meça de verdade; estimativa otimista faz
  perigo: 'baixo',              // quem espera achar que travou
  comando: 'o shell que roda na VPS',
}
```

---

## O que ela ainda não faz

- **Não mostra o histórico.** Cada leitura é um retrato do agora; não há gráfico
  de ontem. Para isso ela precisaria guardar as leituras num arquivo.
- **Não avisa sozinha.** Você precisa abrir para ver. Um aviso no celular quando
  algo ficar grave seria o próximo passo natural.
- **Não enxerga o Wallt por dentro** — vê os contêineres e as portas dele, mas
  não conta usuários nem lê o banco dele como faz com o Fio.
- **Não tira a cópia da máquina.** A ação de backup grava em `/opt/fio/backups`,
  no mesmo disco. Protege contra corromper o arquivo e contra apagar sem querer;
  não protege contra a máquina morrer. Esse passo ainda é manual.
