# O servidor do Fio.
#
# Só o servidor entra na imagem. O site construído e o banco chegam por volume:
# publicar uma versão nova do site é sincronizar uma pasta, sem reconstruir
# imagem e sem derrubar quem está lendo.
FROM node:22-alpine

# Sem root. O processo não precisa de privilégio nenhum, e o dia em que
# alguém achar um furo no servidor de arquivos é o dia em que isto paga.
RUN addgroup -g 1717 fio && adduser -u 1717 -G fio -D fio

WORKDIR /app
COPY servidor/ ./servidor/

# A pasta do banco nasce aqui, com dono. Um volume nomeado VAZIO herda o dono
# do caminho que existe na imagem; sem esta linha, o volume nasce de root e o
# processo (que não é root) não consegue nem criar o arquivo.
RUN mkdir -p /dados && chown -R fio:fio /dados /app

USER fio
VOLUME /dados
ENV NODE_ENV=production FIO_PORTA=8787
EXPOSE 8787

# Sem dependência nenhuma: `node:sqlite` vem no runtime.
CMD ["node", "servidor/api.mjs"]
