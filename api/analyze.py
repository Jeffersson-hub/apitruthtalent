# api/analyze.py
import os
import json
import logging
from flask import Flask, request, jsonify
from supabase import create_client, Client
from dotenv import load_dotenv
from datetime import datetime
from leverparser import ResumeParser
from docling.document_converter import DocumentConverter
import tempfile

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

class HybridParser:
    """Parser hybride utilisant PyResume avec fallback Docling"""
    
    def __init__(self):
        try:
            self.pyresume = ResumeParser()
            self.docling = DocumentConverter()
            logger.info("✅ Parser hybride initialisé")
        except Exception as e:
            logger.error(f"❌ Erreur initialisation parser: {e}")
            raise
    
    def parse(self, file_path):
        """Parse un CV avec fallback intelligent"""
        try:
            # 1. Essayer PyResume (rapide et précis)
            logger.info(f"📄 Tentative avec PyResume: {file_path}")
            result = self.pyresume.parse(file_path)
            
            # Vérifier la confiance
            if hasattr(result, 'confidence_scores') and result.confidence_scores.overall > 0.85:
                logger.info(f"✅ PyResume réussi avec confiance {result.confidence_scores.overall}")
                return self.format_output(result)
            else:
                # Confiance trop basse, fallback vers Docling
                logger.info(f"⚠️ Confiance faible, fallback vers Docling")
                return self.parse_with_docling(file_path)
                
        except Exception as e:
            logger.error(f"❌ Erreur parsing avec PyResume: {e}")
            return self.parse_with_docling(file_path)
    
    def parse_with_docling(self, file_path):
        """Fallback utilisant Docling pour les cas complexes"""
        try:
            logger.info(f"📄 Tentative avec Docling: {file_path}")
            result = self.docling.convert(file_path)
            
            # Extraire le texte du document Docling
            text = result.document.export_to_text()
            
            # Fallback vers extraction manuelle si Docling ne structure pas
            return self.manual_extract(text, file_path)
            
        except Exception as e:
            logger.error(f"❌ Erreur parsing avec Docling: {e}")
            # Dernier recours : extraction manuelle
            return self.manual_extract_from_file(file_path)
    
    def format_output(self, result):
        """Formate la sortie de PyResume vers notre structure"""
        
        # Calcul des années d'expérience
        years_exp = result.get_years_experience() if hasattr(result, 'get_years_experience') else 0
        
        return {
            "nom": self.extract_field(result, 'contact_info.name'),
            "prenom": self.extract_field(result, 'contact_info.first_name'),
            "email": self.extract_field(result, 'contact_info.email'),
            "telephone": self.extract_field(result, 'contact_info.phone'),
            "metiers": self.extract_job_title(result),
            "competences": self.extract_skills(result),
            "diplomes": self.extract_diplomas(result),
            "niveau": self.get_highest_diploma(result),
            "annees_experience": years_exp,
            "niveau_experience": self.get_experience_level(years_exp)
        }
    
    def extract_field(self, result, field_path):
        """Extrait un champ de manière sécurisée"""
        try:
            parts = field_path.split('.')
            value = result
            for part in parts:
                value = getattr(value, part)
            return value if value else None
        except:
            return None
    
    def extract_job_title(self, result):
        """Extrait le métier des expériences"""
        try:
            if hasattr(result, 'experience') and result.experience:
                return result.experience[0].title
        except:
            pass
        return None
    
    def extract_skills(self, result):
        """Extrait les compétences"""
        try:
            if hasattr(result, 'skills'):
                return [s.name for s in result.skills if hasattr(s, 'name')]
        except:
            pass
        return []
    
    def extract_diplomas(self, result):
        """Extrait les diplômes"""
        try:
            if hasattr(result, 'education'):
                return [e.degree for e in result.education if hasattr(e, 'degree')]
        except:
            pass
        return []
    
    def get_highest_diploma(self, result):
        """Retourne le diplôme le plus élevé"""
        diplomas = self.extract_diplomas(result)
        if diplomas:
            # Ordre de priorité (du plus élevé au plus bas)
            priority = ['Doctorat', 'Master', 'Ingénieur', 'Licence', 'BTS', 'Bac']
            for p in priority:
                if any(p in d for d in diplomas):
                    return p
            return diplomas[0]
        return None
    
    def get_experience_level(self, years):
        """Détermine le niveau d'expérience"""
        if years < 2:
            return "junior"
        elif years < 5:
            return "intermédiaire"
        elif years < 10:
            return "confirmé"
        else:
            return "senior"
    
    def manual_extract(self, text, file_path):
        """Extraction manuelle basique (fallback ultime)"""
        import re
        
        result = {
            "nom": None,
            "prenom": None,
            "email": None,
            "telephone": None,
            "metiers": None,
            "competences": [],
            "diplomes": [],
            "niveau": None,
            "annees_experience": 0,
            "niveau_experience": "junior"
        }
        
        # Email
        email_match = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', text)
        if email_match:
            result['email'] = email_match.group(0)
        
        # Téléphone
        phone_match = re.search(r'(?:(?:\+|00)33|0)[1-9](?:[\s.-]?\d{2}){4}', text)
        if phone_match:
            result['telephone'] = re.sub(r'[\s.-]', '', phone_match.group(0))
        
        return result
    
    def manual_extract_from_file(self, file_path):
        """Dernier recours : extraction simple du texte"""
        try:
            with open(file_path, 'r', errors='ignore') as f:
                text = f.read()
            return self.manual_extract(text, file_path)
        except:
            return self.manual_extract("", file_path)

# Initialisation du parser global
try:
    parser = HybridParser()
except Exception as e:
    logger.error(f"❌ Échec initialisation parser: {e}")
    parser = None

@app.route('/api/analyze', methods=['POST', 'OPTIONS'])
def analyze():
    """Route principale d'analyse"""
    
    if request.method == 'OPTIONS':
        return '', 200
    
    try:
        data = request.get_json()
        file_path = data.get('filePath')
        
        if not file_path:
            return jsonify({"success": False, "error": "filePath requis"}), 400
        
        logger.info(f"📥 Analyse: {file_path}")
        
        # Télécharger le fichier depuis Supabase
        file_data = download_from_supabase(file_path)
        
        # Sauvegarder temporairement
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp_file:
            tmp_file.write(file_data)
            tmp_path = tmp_file.name
        
        try:
            # Parser le CV
            if parser:
                cv_data = parser.parse(tmp_path)
            else:
                # Fallback si parser non initialisé
                cv_data = fallback_extract(file_data, file_path)
            
            # Ajouter les métadonnées
            cv_data['cv_url'] = f"{SUPABASE_URL}/storage/v1/object/public/truthtalent/{file_path}"
            cv_data['cv_filename'] = file_path.split('/')[-1]
            cv_data['fichier'] = file_path
            
            logger.info(f"✅ Analyse terminée: {cv_data.get('nom')} {cv_data.get('prenom')}")
            
            return jsonify({
                "success": True,
                "candidateInfo": cv_data
            })
            
        finally:
            # Nettoyer le fichier temporaire
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        
    except Exception as e:
        logger.error(f"❌ Erreur: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500

def download_from_supabase(file_path: str) -> bytes:
    """Télécharge un fichier depuis Supabase"""
    response = supabase.storage.from_('truthtalent').download(file_path)
    return response

def fallback_extract(file_data: bytes, file_path: str) -> dict:
    """Extraction basique si le parser principal échoue"""
    import re
    
    result = {
        "nom": None,
        "prenom": None,
        "email": None,
        "telephone": None,
        "metiers": None,
        "competences": [],
        "diplomes": [],
        "niveau": None,
        "annees_experience": 0,
        "niveau_experience": "junior"
    }
    
    # Essayer d'extraire du texte basique
    try:
        text = file_data.decode('utf-8', errors='ignore')
        
        # Email
        email_match = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', text)
        if email_match:
            result['email'] = email_match.group(0)
        
        # Téléphone
        phone_match = re.search(r'(?:(?:\+|00)33|0)[1-9](?:[\s.-]?\d{2}){4}', text)
        if phone_match:
            result['telephone'] = re.sub(r'[\s.-]', '', phone_match.group(0))
            
    except:
        pass
    
    return result

# Pour Vercel
app = app