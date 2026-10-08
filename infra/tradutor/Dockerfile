# O tradutor local (infra/tradutor/servidor.py). Os modelos NÃO entram na
# imagem: moram em /opt/fio-mt na VPS (convertidos uma vez, ~600 MB) e chegam
# por volume, só leitura.
FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends hunspell hunspell-pt-br \
 && rm -rf /var/lib/apt/lists/* \
 && pip install --no-cache-dir ctranslate2 sentencepiece \
 && useradd -u 1718 -m mt
WORKDIR /app
COPY servidor.py .
USER mt
EXPOSE 8095
CMD ["python", "-u", "servidor.py"]
