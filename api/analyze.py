# api/analyze.py - Version qui gère TOUS vos CVs
import os
import re
import tempfile
import fitz  # PyMuPDF
from flask import Flask, request, jsonify
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()
app = Flask(__name__)

# Supabase
supabase = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_SERVICE_ROLE_KEY"]
)

class UniversalCVExtractor:
    """Extracteur qui s'adapte à TOUS les formats de CV"""
    
    def __init__(self):
        # Patterns de noms (prénom nom / NOM Prénom)
        self.name_patterns = [
            r'^([A-Z][a-zéèêëàâîïôöûüç-]+)\s+([A-Z][a-zéèêëàâîïôöûüç-]+)$',  # Prénom Nom
            r'^([A-Z]{2,}(?:-[A-Z]{2,})?)\s+([A-Z][a-zéèêëàâîïôöûüç-]+)$'      # NOM Prénom
        ]
        
        # Compétences par catégorie (pour éviter les faux positifs)
        self.skills_db = {
            'tech': [
                'Python', 'Java', 'JavaScript', 'TypeScript', 'SQL', 'React',
                'Angular', 'Vue', 'Node.js', 'Django', 'Spring', 'AWS', 'Azure',
                'GCP', 'Docker', 'Kubernetes', 'Jenkins', 'Git', 'Linux',
                'Bash', 'PowerShell', 'Ansible', 'Terraform', 'MySQL',
                'PostgreSQL', 'MongoDB', 'Oracle', 'Redis', 'Elasticsearch'
            ],
            'rh': [
                'Recrutement', 'Sourcing', 'ADP', 'Paie', 'CSE', 'NAO', 'GPEC',
                'Formation', 'Droit du travail', 'Administration du personnel',
                'Relations sociales', 'Entretien', 'Évaluation'
            ],
            'commercial': [
                'Vente', 'Prospection', 'Négociation', 'Relation client',
                'Fidélisation', 'Force de vente', 'Commerce', 'Conseil',
                'Développement commercial', 'Business development'
            ],
            'communication': [
                'Marketing', 'Communication', 'Réseaux sociaux', 'Community management',
                'Canva', 'Photoshop', 'WordPress', 'Content creation',
                'Rédaction web', 'SEO', 'Emailing', 'Newsletter'
            ]
        }
        
        # Métiers avec mots-clés associés
        self.jobs_db = {
            'Ingénieur': ['ingénieur', 'devops', 'sysops', 'architecte'],
            'Développeur': ['développeur', 'developer', 'programmeur', 'full stack'],
            'Data': ['data scientist', 'data analyst', 'data engineer', 'machine learning'],
            'Chef de projet': ['chef de projet', 'project manager', 'product owner'],
            'Commercial': ['commercial', 'vendeur', 'business developer', 'account executive'],
            'Chargé RH': ['chargé rh', 'recruteur', 'ressources humaines', 'hr'],
            'Marketing': ['marketing', 'community manager', 'social media'],
            'Technicien': ['technicien', 'support', 'maintenance', 'helpdesk']
        }
        
        # Niveaux de diplômes
        self.diploma_levels = [
            'Doctorat', 'Master', 'Ingénieur', 'Licence', 'BTS', 'DUT', 'Bac', 'CAP', 'BEP'
        ]
    
    def extract_text_from_pdf(self, pdf_path):
        """Extraction robuste avec fallback"""
        try:
            doc = fitz.open(pdf_path)
            text = ""
            for page in doc:
                text += page.get_text() + "\n"
            return text
        except Exception as e:
            print(f"Erreur extraction PDF: {e}")
            return ""
    
    def clean_text(self, text):
        """Nettoie le texte pour l'analyse"""
        # Supprime les caractères bizarres mais garde l'essentiel
        text = re.sub(r'[^\w\s@.,;:!?()/-]', ' ', text)
        # Normalise les espaces
        text = re.sub(r'\s+', ' ', text)
        return text.strip()
    
    def extract_name(self, text):
        """Extraction nom/prénom multi-stratégies"""
        lines = text.split('\n')[:10]  # Cherche dans les 10 premières lignes
        
        # Stratégie 1: Patterns directs
        for line in lines:
            line = line.strip()
            if len(line) < 5 or len(line) > 40:
                continue
            
            for pattern in self.name_patterns:
                match = re.match(pattern, line)
                if match:
                    return {
                        'prenom': match.group(1),
                        'nom': match.group(2)
                    }
        
        # Stratégie 2: Lignes avec # (titres)
        for line in lines:
            if line.startswith('#') and len(line) < 50:
                words = re.sub(r'#', '', line).strip().split()
                if len(words) >= 2:
                    return {
                        'prenom': words[0],
                        'nom': ' '.join(words[1:])
                    }
        
        # Stratégie 3: Chercher dans le nom de fichier
        return {'prenom': None, 'nom': None}
    
    def extract_email(self, text):
        """Extraction email - pattern universel"""
        emails = re.findall(r'[\w\.-]+@[\w\.-]+\.\w+', text)
        # Filtre les emails invalides
        valid_emails = [e for e in emails if not any(x in e for x in ['example', 'test', 'email'])]
        return valid_emails[0] if valid_emails else None
    
    def extract_phone(self, text):
        """Extraction téléphone - formats français et internationaux"""
        patterns = [
            r'(?:(?:\+|00)33|0)[1-9](?:[\s.-]?\d{2}){4}',  # Format français
            r'0[1-9](?:[\s.-]?\d{2}){4}'                    # Format simple
        ]
        
        for pattern in patterns:
            phones = re.findall(pattern, text)
            if phones:
                # Nettoie et retourne le premier
                return re.sub(r'[\s.-]', '', phones[0])
        return None
    
    def extract_skills(self, text):
        """Extraction compétences avec contexte"""
        text_lower = text.lower()
        found = []
        
        for category, skills in self.skills_db.items():
            for skill in skills:
                # Vérifie que c'est un mot entier
                if re.search(rf'\b{re.escape(skill.lower())}\b', text_lower):
                    found.append(skill)
        
        return found
    
    def extract_job(self, text):
        """Extraction métier avec score de confiance"""
        text_lower = text.lower()
        best_match = None
        best_score = 0
        
        for job, keywords in self.jobs_db.items():
            score = 0
            for kw in keywords:
                if kw in text_lower:
                    score += 1
            if score > best_score:
                best_score = score
                best_match = job
        
        return best_match if best_score > 0 else None
    
    def extract_diploma(self, text):
        """Extraction du plus haut diplôme"""
        text_lower = text.lower()
        
        for diploma in self.diploma_levels:
            if diploma.lower() in text_lower:
                return diploma
        
        # Cherche des patterns alternatifs
        if re.search(r'phd|doctorat', text_lower):
            return 'Doctorat'
        elif re.search(r'master|bac\+5', text_lower):
            return 'Master'
        elif re.search(r'ingénieur', text_lower):
            return 'Ingénieur'
        elif re.search(r'licence|bac\+3', text_lower):
            return 'Licence'
        elif re.search(r'bts', text_lower):
            return 'BTS'
        elif re.search(r'bac', text_lower):
            return 'Bac'
        
        return None
    
    def parse(self, pdf_path):
        """Parse complet d'un CV"""
        # Extraction et nettoyage
        raw_text = self.extract_text_from_pdf(pdf_path)
        text = self.clean_text(raw_text)
        
        # Extraction de toutes les informations
        name = self.extract_name(text)
        email = self.extract_email(text)
        phone = self.extract_phone(text)
        job = self.extract_job(text)
        skills = self.extract_skills(text)
        diploma = self.extract_diploma(text)
        
        return {
            'nom': name['nom'],
            'prenom': name['prenom'],
            'email': email,
            'telephone': phone,
            'metier': job,
            'competences': skills,
            'niveau': diploma
        }

# Initialisation
extractor = UniversalCVExtractor()

@app.route('/api/analyze', methods=['POST', 'OPTIONS'])
def analyze():
    if request.method == 'OPTIONS':
        return '', 200
    
    try:
        data = request.get_json()
        file_path = data.get('filePath')
        
        if not file_path:
            return jsonify({"success": False, "error": "filePath requis"}), 400
        
        # Téléchargement
        file_data = supabase.storage.from_('truthtalent').download(file_path)
        
        # Sauvegarde temporaire
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp:
            tmp.write(file_data)
            tmp_path = tmp.name
        
        try:
            # Extraction
            result = extractor.parse(tmp_path)
            
            # Ajout métadonnées
            result['cv_url'] = f"{os.environ['SUPABASE_URL']}/storage/v1/object/public/truthtalent/{file_path}"
            result['cv_filename'] = file_path.split('/')[-1]
            result['fichier'] = file_path
            
            return jsonify({
                "success": True,
                "candidateInfo": result
            })
            
        finally:
            os.unlink(tmp_path)
            
    except Exception as e:
        print(f"Erreur: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', 'https://truthtalent.online')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
    response.headers.add('Access-Control-Allow-Methods', 'POST, OPTIONS')
    return response

# Pour Vercel
app = app