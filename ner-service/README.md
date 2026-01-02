# NER Service — déploiement rapide

Options de déploiement recommandées (free / simple):
- Render (service web via Docker or repo)
- Railway (déploy from repo)
- Fly.io (docker deploy)
- Google Cloud Run / Cloud Run Jobs
- VPS Docker

Variables d'environnement importantes:
- NER_MODEL (ex: Jean-Baptiste/camembert-ner) — modèle HF
- NER_API_KEY (clé secrète pour sécuriser l'API)
- ALLOWED_ORIGINS (ex: https://truthtalent.online)

Exemple (Docker local):
docker build -t ner-service -f ner-service/Dockerfile .
docker run -e NER_MODEL=Jean-Baptiste/camembert-ner -e NER_API_KEY="mon-secret" -e ALLOWED_ORIGINS="https://truthtalent.online" -p 8000:8000 ner-service

Health: GET /health
Parse: POST /parse-text { "text": "..." } with header x-api-key: mon-secret