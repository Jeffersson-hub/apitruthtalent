# ner-service/Dockerfile
# Utilise Alpine pour être léger
FROM python:3.10-alpine

WORKDIR /app

# Installer les dépendances système minimales
RUN apk add --no-cache gcc musl-dev linux-headers

# Copier requirements d'abord pour optimiser le cache
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copier le code source
COPY main.py .

# Variables d'environnement pour optimisation
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV UVICORN_WORKERS=1
ENV PORT=10000

# Exposer le port
EXPOSE 10000

# Commande de démarrage
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "10000", "--workers", "1"]