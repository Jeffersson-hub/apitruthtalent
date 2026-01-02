# Dockerfile pour microservice NER (CPU)
FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Installer dépendances système nécessaires (optionnel)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential git && \
    rm -rf /var/lib/apt/lists/*

# Copier requirements et installer (torch installé via index-url si besoin)
COPY ner-service/requirements.txt /app/requirements.txt

# Installer pip packages
RUN python -m pip install --upgrade pip
# (si problème d'installation torch, remplacer l'étape par installation spécifique)
RUN python -m pip install -r /app/requirements.txt

# Copier le code
COPY ner-service /app/ner-service
WORKDIR /app/ner-service

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]