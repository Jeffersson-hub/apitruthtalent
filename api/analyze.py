# api/analyze.py
import os
import json
import re
import fitz  # PyMuPDF
from flask import Flask, request, jsonify
from supabase import create_client, Client
from dotenv import load_dotenv
import logging
from datetime import datetime

# Configuration
load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialisation Supabase
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("❌ Variables Supabase manquantes")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

app = Flask(__name__)

# Configuration CORS
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', 'https://truthtalent.online')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
    response.headers.add('Access-Control-Allow-Methods', 'POST, OPTIONS')
    return response

@app.route('/api/analyze', methods=['POST', 'OPTIONS'])
def analyze():
    """Route principale d'analyse"""
    
    # Gérer OPTIONS (preflight CORS)
    if request.method == 'OPTIONS':
        return '', 200
    
    try:
        data = request.get_json()
        file_path = data.get('filePath')
        
        if not file_path:
            return jsonify({"success": False, "error": "filePath requis"}), 400
        
        logger.info(f"📥 Analyse: {file_path}")
        
        # 1. Télécharger le fichier depuis Supabase
        file_data = download_from_supabase(file_path)
        
        # 2. Extraire le texte
        text = extract_text(file_data, file_path)
        
        # 3. Analyser le CV
        cv_data = parse_resume(text)
        
        # 4. Calculer l'expérience
        cv_data['annees_experience'] = calculate_experience(text)
        
        # 5. Déterminer le niveau
        cv_data['niveau_experience'] = get_experience_level(cv_data['annees_experience'])
        
        # 6. URL publique
        cv_data['cv_url'] = f"{SUPABASE_URL}/storage/v1/object/public/truthtalent/{file_path}"
        cv_data['fichier'] = file_path
        
        logger.info(f"✅ Analyse terminée: {cv_data.get('nom')} {cv_data.get('prenom')}")
        
        return jsonify({
            "success": True,
            "candidateInfo": cv_data
        })
        
    except Exception as e:
        logger.error(f"❌ Erreur: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500

def download_from_supabase(file_path: str) -> bytes:
    """Télécharge un fichier depuis Supabase"""
    response = supabase.storage.from_('truthtalent').download(file_path)
    return response

def extract_text(file_data: bytes, file_path: str) -> str:
    """Extrait le texte d'un PDF ou DOCX"""
    ext = file_path.split('.')[-1].lower()
    temp_path = f"/tmp/{datetime.now().timestamp()}.{ext}"
    
    try:
        with open(temp_path, 'wb') as f:
            f.write(file_data)
        
        if ext == 'pdf':
            doc = fitz.open(temp_path)
            text = ""
            for page in doc:
                text += page.get_text()
            return text
        elif ext == 'docx':
            # Pour DOCX, on peut utiliser une librairie légère
            # Mais on garde simple pour l'instant
            return "Texte extrait du DOCX"
        else:
            raise ValueError(f"Format non supporté: {ext}")
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

def parse_resume(text: str) -> dict:
    """Analyse le CV avec des regex simples mais efficaces"""
    
    # Initialisation
    result = {
        "nom": None,
        "prenom": None,
        "email": None,
        "telephone": None,
        "metiers": None,
        "competences": [],
        "diplomes": [],
        "niveau": None,
        "experiences": []
    }
    
    # Email
    email_match = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', text)
    if email_match:
        result['email'] = email_match.group(0)
    
    # Téléphone (format français)
    phone_match = re.search(r'(?:(?:\+|00)33|0)[1-9](?:[\s.-]?\d{2}){4}', text)
    if phone_match:
        result['telephone'] = phone_match.group(0).replace(' ', '').replace('.', '')
    
    # Nom/Prénom (chercher dans les 10 premières lignes)
    lines = text.split('\n')[:10]
    for line in lines:
        # Pattern: Deux mots avec majuscules
        match = re.search(r'^([A-Z][a-zéèêëàâîïôöûüç]+)\s+([A-Z][a-zéèêëàâîïôöûüç]+)$', line.strip())
        if match:
            result['prenom'] = match.group(1)
            result['nom'] = match.group(2)
            break
    
    # Compétences (liste prédéfinie)
    skills_list = [
        'Python', 'Java', 'JavaScript', 'SQL', 'React', 'Node.js',
        'AWS', 'Docker', 'Git', 'Linux', 'Communication',
        'Gestion de projet', 'Recrutement', 'Vente', 'Marketing'
    ]
    
    for skill in skills_list:
        if re.search(rf'\b{re.escape(skill)}\b', text, re.IGNORECASE):
            result['competences'].append(skill)
    
    # Diplômes
    diploma_patterns = [
        ('Doctorat', r'doctorat|phd'),
        ('Master', r'master|bac\+5'),
        ('Ingénieur', r'ingénieur'),
        ('Licence', r'licence|bac\+3'),
        ('BTS', r'bts'),
        ('Bac', r'bac(?:calauréat)?')
    ]
    
    for diplome, pattern in diploma_patterns:
        if re.search(pattern, text, re.IGNORECASE):
            result['diplomes'].append(diplome)
    
    if result['diplomes']:
        result['niveau'] = result['diplomes'][0]
    
    # Métier
    job_patterns = [
        ('Ingénieur', r'ingénieur'),
        ('Développeur', r'développeur'),
        ('Chef de projet', r'chef de projet'),
        ('Chargé RH', r'charg[ée]\s+rh|ressources humaines'),
        ('Commercial', r'commercial|vendeur'),
        ('Marketing', r'marketing|communication')
    ]
    
    for job, pattern in job_patterns:
        if re.search(pattern, text, re.IGNORECASE):
            result['metiers'] = job
            break
    
    return result

def calculate_experience(text: str) -> int:
    """Calcule les années d'expérience"""
    # Pattern direct
    match = re.search(r'(\d+)\s*(?:ans?|années?)\s*d\'expérience', text, re.IGNORECASE)
    if match:
        return int(match.group(1))
    
    # Compter les dates
    dates = re.findall(r'\b(19|20)\d{2}\b', text)
    if len(dates) >= 2:
        years = [int(d) for d in dates]
        return max(years) - min(years)
    
    return 0

def get_experience_level(years: int) -> str:
    """Niveau d'expérience"""
    if years < 3:
        return "junior"
    elif years < 7:
        return "confirmé"
    else:
        return "senior"

# Pour Vercel (nécessaire)
app = app