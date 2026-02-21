# api/analyze.py
import os
import json
import re
import tempfile
import logging
from flask import Flask, request, jsonify
from supabase import create_client, Client
from dotenv import load_dotenv
import pdfplumber
from datetime import datetime

# Configuration
load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Supabase
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

app = Flask(__name__)

@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', 'https://truthtalent.online')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
    response.headers.add('Access-Control-Allow-Methods', 'POST, OPTIONS')
    return response

class CVExtractor:
    """Extracteur de CV basé sur pdfplumber"""
    
    def extract_text(self, file_path):
        """Extrait le texte d'un PDF"""
        text = ""
        try:
            with pdfplumber.open(file_path) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        text += page_text + "\n"
            return text
        except Exception as e:
            logger.error(f"Erreur extraction PDF: {e}")
            return ""
    
    def extract_email(self, text):
        """Extrait l'email"""
        pattern = r'[\w\.-]+@[\w\.-]+\.\w+'
        match = re.search(pattern, text)
        return match.group(0) if match else None
    
    def extract_phone(self, text):
        """Extrait le téléphone (format français)"""
        pattern = r'(?:(?:\+|00)33|0)[1-9](?:[\s.-]?\d{2}){4}'
        match = re.search(pattern, text)
        if match:
            return re.sub(r'[\s.-]', '', match.group(0))
        return None
    
    def extract_name(self, text):
        """Extrait le nom et prénom (simplifié)"""
        lines = text.split('\n')[:10]
        for line in lines:
            line = line.strip()
            if len(line) < 5 or len(line) > 50:
                continue
            
            # Pattern simple: deux mots avec majuscules
            pattern = r'^([A-Z][a-zéèêëàâîïôöûüç]+)\s+([A-Z][a-zéèêëàâîïôöûüç]+)$'
            match = re.search(pattern, line)
            if match:
                return {
                    'prenom': match.group(1),
                    'nom': match.group(2)
                }
        return {'prenom': None, 'nom': None}
    
    def extract_skills(self, text):
        """Extrait les compétences (liste prédéfinie)"""
        skills_list = [
            'Python', 'Java', 'JavaScript', 'SQL', 'React', 'Node.js',
            'AWS', 'Docker', 'Git', 'Linux',
            'Recrutement', 'Sourcing', 'Paie', 'CSE',
            'Vente', 'Prospection', 'Relation client',
            'Marketing', 'Communication', 'Réseaux sociaux'
        ]
        
        found = []
        text_lower = text.lower()
        for skill in skills_list:
            if skill.lower() in text_lower:
                found.append(skill)
        return found
    
    def extract_diplomas(self, text):
        """Extrait les diplômes"""
        diploma_patterns = [
            ('Doctorat', r'doctorat|phd'),
            ('Master', r'master|bac\+5'),
            ('Ingénieur', r'ingénieur'),
            ('Licence', r'licence|bac\+3'),
            ('BTS', r'bts'),
            ('Bac', r'bac(?:calauréat)?')
        ]
        
        found = []
        text_lower = text.lower()
        for diplome, pattern in diploma_patterns:
            if re.search(pattern, text_lower):
                found.append(diplome)
        return found
    
    def extract_experience(self, text):
        """Extrait les années d'expérience"""
        pattern = r'(\d+)\s*(?:ans?|années?)\s*d\'expérience'
        match = re.search(pattern, text.lower())
        if match:
            return int(match.group(1))
        
        # Fallback: compter les dates
        dates = re.findall(r'\b(19|20)\d{2}\b', text)
        if len(dates) >= 2:
            years = [int(d) for d in dates]
            return max(years) - min(years)
        return 0
    
    def extract_job_title(self, text):
        """Extrait le métier"""
        job_patterns = [
            (r'ingénieur', 'Ingénieur'),
            (r'développeur', 'Développeur'),
            (r'chef de projet', 'Chef de projet'),
            (r'responsable (rh|ressources humaines)', 'Responsable RH'),
            (r'chargé (rh|recrutement)', 'Chargé RH'),
            (r'commercial|vendeur', 'Commercial'),
            (r'marketing|community manager', 'Marketing')
        ]
        
        text_lower = text.lower()
        for pattern, title in job_patterns:
            if re.search(pattern, text_lower):
                return title
        return None
    
    def parse(self, file_path):
        """Parse un CV complet"""
        text = self.extract_text(file_path)
        
        name = self.extract_name(text)
        email = self.extract_email(text)
        phone = self.extract_phone(text)
        job = self.extract_job_title(text)
        skills = self.extract_skills(text)
        diplomas = self.extract_diplomas(text)
        experience = self.extract_experience(text)
        
        # Niveau d'expérience
        if experience < 2:
            niveau_exp = "junior"
        elif experience < 5:
            niveau_exp = "intermédiaire"
        elif experience < 10:
            niveau_exp = "confirmé"
        else:
            niveau_exp = "senior"
        
        return {
            "nom": name['nom'],
            "prenom": name['prenom'],
            "email": email,
            "telephone": phone,
            "metiers": job,
            "competences": skills,
            "diplomes": diplomas,
            "niveau": diplomas[0] if diplomas else None,
            "annees_experience": experience,
            "niveau_experience": niveau_exp
        }

# Initialisation
extractor = CVExtractor()

@app.route('/api/analyze', methods=['POST', 'OPTIONS'])
def analyze():
    if request.method == 'OPTIONS':
        return '', 200
    
    try:
        data = request.get_json()
        file_path = data.get('filePath')
        
        if not file_path:
            return jsonify({"success": False, "error": "filePath requis"}), 400
        
        logger.info(f"📥 Analyse: {file_path}")
        
        # Télécharger depuis Supabase
        response = supabase.storage.from_('truthtalent').download(file_path)
        
        # Sauvegarder temporairement
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp:
            tmp.write(response)
            tmp_path = tmp.name
        
        try:
            # Extraire les données
            cv_data = extractor.parse(tmp_path)
            
            # Ajouter les métadonnées
            cv_data['cv_url'] = f"{SUPABASE_URL}/storage/v1/object/public/truthtalent/{file_path}"
            cv_data['cv_filename'] = file_path.split('/')[-1]
            cv_data['fichier'] = file_path
            
            return jsonify({
                "success": True,
                "candidateInfo": cv_data
            })
            
        finally:
            os.remove(tmp_path)
            
    except Exception as e:
        logger.error(f"Erreur: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

# Pour Vercel
app = app