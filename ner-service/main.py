# ner-service/main.py
# Version ultra légère sans imports externes problématiques
import os
import re
import sys
import time
import json
from typing import Dict, List, Any, Optional
from datetime import datetime

# Gestion des imports avec fallback
try:
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel
    import uvicorn
    FASTAPI_AVAILABLE = True
except ImportError:
    print("⚠️ FastAPI non disponible, création d'un serveur minimal")
    FASTAPI_AVAILABLE = False

try:
    import psutil
    PSUTIL_AVAILABLE = True
except ImportError:
    print("⚠️ psutil non disponible, utilisation de méthode alternative")
    PSUTIL_AVAILABLE = False

# Créer une application FastAPI minimaliste si disponible
if FASTAPI_AVAILABLE:
    app = FastAPI(
        title="CV NER Service",
        description="Service d'extraction d'information depuis les CV",
        version="1.0.0"
    )
    
    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    # Fallback: créer un faux objet pour la compatibilité
    class MockApp:
        def __init__(self):
            self.routes = {}
        
        def post(self, path):
            def decorator(func):
                self.routes[('POST', path)] = func
                return func
            return decorator
        
        def get(self, path):
            def decorator(func):
                self.routes[('GET', path)] = func
                return func
            return decorator
    
    app = MockApp()

# Modèles Pydantic
if FASTAPI_AVAILABLE:
    class TextInput(BaseModel):
        text: str
        language: str = "fr"
    
    class Entity(BaseModel):
        text: str
        label: str
        confidence: float
    
    class ExtractionResult(BaseModel):
        entities: List[Entity]
        skills: List[Dict[str, Any]]
        contact_info: Dict[str, Any]
        confidence: float
        processing_time_ms: float
        memory_used_mb: Optional[float] = None
else:
    # Classes de fallback
    class TextInput:
        def __init__(self, text: str, language: str = "fr"):
            self.text = text
            self.language = language
    
    class Entity:
        def __init__(self, text: str, label: str, confidence: float):
            self.text = text
            self.label = label
            self.confidence = confidence
    
    class ExtractionResult:
        def __init__(self, entities, skills, contact_info, confidence, processing_time_ms, memory_used_mb=None):
            self.entities = entities
            self.skills = skills
            self.contact_info = contact_info
            self.confidence = confidence
            self.processing_time_ms = processing_time_ms
            self.memory_used_mb = memory_used_mb
        
        def dict(self):
            return {
                "entities": [{"text": e.text, "label": e.label, "confidence": e.confidence} 
                           for e in self.entities] if hasattr(self.entities[0], 'text') else self.entities,
                "skills": self.skills,
                "contact_info": self.contact_info,
                "confidence": self.confidence,
                "processing_time_ms": self.processing_time_ms,
                "memory_used_mb": self.memory_used_mb
            }

class UltraLightNER:
    def __init__(self):
        print("🚀 Initialisation du NER léger...")
        
        # Charger les dictionnaires
        self.skills_dict = self._load_skills_dictionary()
        self.job_titles = self._load_job_titles()
        
        print(f"✅ Chargé: {len(self.skills_dict)} compétences")
    
    def _load_skills_dictionary(self) -> Dict[str, Dict[str, Any]]:
        """Dictionnaire de compétences"""
        return {
            "javascript": {"category": "frontend", "aliases": ["js"]},
            "typescript": {"category": "frontend", "aliases": ["ts"]},
            "react": {"category": "frontend", "aliases": []},
            "vue": {"category": "frontend", "aliases": ["vuejs"]},
            "angular": {"category": "frontend", "aliases": []},
            "html": {"category": "frontend", "aliases": []},
            "css": {"category": "frontend", "aliases": []},
            "python": {"category": "backend", "aliases": []},
            "java": {"category": "backend", "aliases": []},
            "php": {"category": "backend", "aliases": []},
            "sql": {"category": "database", "aliases": []},
            "mongodb": {"category": "database", "aliases": ["mongo"]},
            "docker": {"category": "devops", "aliases": []},
            "aws": {"category": "cloud", "aliases": []},
            "git": {"category": "devops", "aliases": []},
        }
    
    def _load_job_titles(self) -> List[str]:
        """Titres de postes"""
        return ["développeur", "ingénieur", "consultant", "analyste"]
    
    def extract(self, text: str) -> Dict[str, Any]:
        """Extraire les informations du texte"""
        start_time = time.time()
        text_lower = text.lower()
        
        # Extraire les informations
        skills = self._extract_skills(text_lower)
        contact_info = self._extract_contact_info(text)
        entities = self._extract_entities(text, text_lower)
        confidence = self._calculate_confidence(contact_info, skills)
        
        processing_time = (time.time() - start_time) * 1000
        
        return {
            "entities": entities,
            "skills": skills,
            "contact_info": contact_info,
            "confidence": confidence,
            "processing_time_ms": round(processing_time, 2),
            "memory_used_mb": self._get_memory_usage()
        }
    
    def _extract_skills(self, text_lower: str) -> List[Dict[str, Any]]:
        """Extraire les compétences"""
        skills = []
        for skill_name, skill_data in self.skills_dict.items():
            if skill_name in text_lower:
                skills.append({
                    "name": skill_name.capitalize(),
                    "category": skill_data["category"],
                    "confidence": 0.9
                })
        return skills
    
    def _extract_contact_info(self, text: str) -> Dict[str, Any]:
        """Extraire les contacts"""
        # Emails
        email_pattern = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
        emails = list(set(re.findall(email_pattern, text, re.IGNORECASE)))
        
        # Téléphones français
        phone_pattern = r'0[1-9]([\s.-]?\d{2}){4}'
        phones = list(set(re.findall(phone_pattern, text)))
        
        return {
            "emails": emails,
            "phones": phones,
            "linkedin": None,
            "github": None
        }
    
    def _extract_entities(self, text: str, text_lower: str) -> List[Dict[str, Any]]:
        """Extraire les entités"""
        entities = []
        
        # Emails
        emails = re.findall(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', text)
        for email in emails:
            entities.append({
                "text": email,
                "label": "EMAIL",
                "confidence": 0.95
            })
        
        # Téléphones
        phones = re.findall(r'0[1-9]([\s.-]?\d{2}){4}', text)
        for phone in phones:
            entities.append({
                "text": phone,
                "label": "PHONE",
                "confidence": 0.9
            })
        
        return entities
    
    def _calculate_confidence(self, contact: Dict, skills: List) -> float:
        """Calculer la confiance"""
        score = 0
        if contact["emails"]:
            score += 0.4
        if contact["phones"]:
            score += 0.3
        if skills:
            score += min(len(skills) * 0.1, 0.3)
        return min(score, 1.0)
    
    def _get_memory_usage(self) -> Optional[float]:
        """Obtenir l'usage mémoire"""
        if PSUTIL_AVAILABLE:
            try:
                import psutil
                process = psutil.Process(os.getpid())
                return round(process.memory_info().rss / 1024 / 1024, 2)
            except:
                return None
        return None

# Initialiser
ner_processor = UltraLightNER()

# Définir les endpoints
def extract_entities_handler(input_data: TextInput):
    """Handler pour l'extraction"""
    try:
        result = ner_processor.extract(input_data.text)
        
        entities = [
            Entity(
                text=e["text"],
                label=e["label"],
                confidence=e["confidence"]
            ) for e in result["entities"]
        ]
        
        return ExtractionResult(
            entities=entities,
            skills=result["skills"],
            contact_info=result["contact_info"],
            confidence=result["confidence"],
            processing_time_ms=result["processing_time_ms"],
            memory_used_mb=result["memory_used_mb"]
        )
    except Exception as e:
        raise HTTPException(500, f"Erreur: {str(e)}") if FASTAPI_AVAILABLE else Exception(str(e))

def health_handler():
    """Handler de santé"""
    return {
        "status": "healthy",
        "service": "cv-ner",
        "timestamp": datetime.now().isoformat(),
        "memory_mb": ner_processor._get_memory_usage()
    }

def root_handler():
    """Handler racine"""
    return {
        "service": "CV NER Extractor",
        "version": "1.0.0",
        "endpoints": ["POST /extract", "GET /health", "GET /"]
    }

# Enregistrer les routes
if FASTAPI_AVAILABLE:
    @app.post("/extract")
    async def extract_endpoint(input_data: TextInput):
        return extract_entities_handler(input_data)
    
    @app.get("/health")
    async def health_endpoint():
        return health_handler()
    
    @app.get("/")
    async def root_endpoint():
        return root_handler()
else:
    # Enregistrer dans l'app mock
    app.post("/extract")(extract_entities_handler)
    app.get("/health")(health_handler)
    app.get("/")(root_handler)

# Serveur minimal si FastAPI n'est pas disponible
if not FASTAPI_AVAILABLE:
    from http.server import HTTPServer, BaseHTTPRequestHandler
    import json as json_module
    
    class SimpleHandler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == '/health':
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json_module.dumps(health_handler()).encode())
            elif self.path == '/':
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json_module.dumps(root_handler()).encode())
            else:
                self.send_response(404)
                self.end_headers()
        
        def do_POST(self):
            if self.path == '/extract':
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                try:
                    data = json_module.loads(post_data.decode())
                    input_data = TextInput(**data)
                    result = extract_entities_handler(input_data)
                    
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json_module.dumps(result.dict()).encode())
                except Exception as e:
                    self.send_response(500)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json_module.dumps({"error": str(e)}).encode())
            else:
                self.send_response(404)
                self.end_headers()

def run_simple_server():
    """Lancer le serveur HTTP simple"""
    port = int(os.getenv("PORT", 10000))
    server = HTTPServer(('0.0.0.0', port), SimpleHandler)
    print(f"🚀 Serveur HTTP simple démarré sur le port {port}")
    server.serve_forever()

if __name__ == "__main__":
    if FASTAPI_AVAILABLE:
        port = int(os.getenv("PORT", 10000))
        uvicorn.run(
            "main:app",
            host="0.0.0.0",
            port=port,
            workers=1,
            log_level="info"
        )
    else:
        run_simple_server()