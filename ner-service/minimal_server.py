# ner-service/minimal_server.py
import os
import re
import json
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import datetime
from urllib.parse import parse_qs, urlparse

class CVNERExtractor:
    def __init__(self):
        self.skills = ["javascript", "python", "java", "react", "node", "sql", "docker", "aws", "git"]
    
    def extract(self, text):
        """Extraction ultra simple"""
        text_lower = text.lower()
        
        # Trouver les compétences
        found_skills = []
        for skill in self.skills:
            if skill in text_lower:
                found_skills.append(skill.capitalize())
        
        # Trouver les emails
        emails = re.findall(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', text)
        
        # Trouver les téléphones
        phones = re.findall(r'0[1-9]([\s.-]?\d{2}){4}', text)
        
        return {
            "skills": found_skills,
            "emails": list(set(emails)),
            "phones": list(set(phones)),
            "confidence": 0.7 if emails else 0.5,
            "timestamp": datetime.now().isoformat()
        }

class RequestHandler(BaseHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        self.extractor = CVNERExtractor()
        super().__init__(*args, **kwargs)
    
    def do_GET(self):
        if self.path == '/health':
            self.send_json(200, {"status": "healthy", "service": "cv-ner"})
        elif self.path == '/':
            self.send_json(200, {"message": "CV NER Service", "endpoint": "POST /extract"})
        else:
            self.send_json(404, {"error": "Not found"})
    
    def do_POST(self):
        if self.path == '/extract':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data.decode('utf-8'))
                text = data.get('text', '')
                
                if len(text) < 10:
                    self.send_json(400, {"error": "Text too short"})
                    return
                
                result = self.extractor.extract(text)
                self.send_json(200, result)
                
            except Exception as e:
                self.send_json(500, {"error": str(e)})
        else:
            self.send_json(404, {"error": "Not found"})
    
    def send_json(self, code, data):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

def run_server():
    port = int(os.getenv("PORT", 10000))
    server = HTTPServer(('0.0.0.0', port), RequestHandler)
    print(f"🚀 Serveur CV NER démarré sur le port {port}")
    server.serve_forever()

if __name__ == "__main__":
    run_server()