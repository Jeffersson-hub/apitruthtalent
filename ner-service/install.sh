# ner-service/install.sh
#!/bin/bash
echo "🔧 Installation des dépendances..."

# Créer un environnement virtuel
python3 -m venv venv
source venv/bin/activate

# Installer pip et setuptools
pip install --upgrade pip setuptools wheel

# Installer les dépendances de base
pip install fastapi==0.104.1
pip install "uvicorn[standard]"==0.24.0
pip install pydantic==2.5.0
pip install python-multipart==0.0.6

echo "✅ Installation terminée"