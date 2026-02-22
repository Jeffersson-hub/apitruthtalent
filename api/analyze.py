# api/analyze.py - Version avec vérification d'import
import os
import sys
import json
import tempfile
import PyPDF2
from flask import Flask, request, jsonify
from supabase import create_client
from dotenv import load_dotenv

# Vérification des imports
try:
    import google.generativeai as genai
    print("✅ Google Generative AI importé avec succès")
except ImportError as e:
    print(f"❌ Erreur import Google Generative AI: {e}")
    print(f"📌 Python path: {sys.path}")
    sys.exit(1)

load_dotenv()
app = Flask(__name__)

# Configuration
supabase = create_client(
    os.environ.get("SUPABASE_URL"),
    os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
)

# Initialisation Gemini
genai.configure(api_key=os.environ.get("GOOGLE_API_KEY"))
model = genai.GenerativeModel('gemini-1.0-pro')

@app.route('/api/analyze', methods=['POST', 'OPTIONS'])
def analyze():
    if request.method == 'OPTIONS':
        return '', 200
    
    try:
        data = request.get_json()
        file_path = data.get('filePath')
        
        if not file_path:
            return jsonify({"success": False, "error": "filePath requis"}), 400
        
        print(f"📥 Analyse: {file_path}")
        
        # Télécharger le PDF
        file_data = supabase.storage.from_('truthtalent').download(file_path)
        
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp:
            tmp.write(file_data)
            tmp_path = tmp.name
        
        try:
            # Extraire le texte
            text = ""
            with open(tmp_path, 'rb') as f:
                reader = PyPDF2.PdfReader(f)
                for page in reader.pages:
                    if page.extract_text():
                        text += page.extract_text() + "\n"
            
            print(f"📄 Texte extrait: {len(text)} caractères")
            
            # Prompt pour Gemini
            prompt = f"""
            Analyse ce CV et retourne UNIQUEMENT un JSON valide avec ces champs EXACTS :
            - nom_complet
            - email
            - telephone
            - metier (le poste principal)
            - competences (liste de 5-10 compétences)
            - diplome (le plus élevé)
            - experience_annees (nombre entier)

            CV :
            {text[:5000]}

            Exemple de format attendu :
            {{
                "nom_complet": "Jean Dupont",
                "email": "jean.dupont@email.com",
                "telephone": "0612345678",
                "metier": "Ingénieur DevOps",
                "competences": ["Python", "AWS", "Docker", "Kubernetes"],
                "diplome": "Master",
                "experience_annees": 5
            }}
            """
            
            print("🤖 Appel Gemini...")
            response = model.generate_content(prompt)
            result_text = response.text.strip()
            
            # Nettoyer la réponse
            if result_text.startswith('```json'):
                result_text = result_text[7:]
            if result_text.endswith('```'):
                result_text = result_text[:-3]
            
            result = json.loads(result_text)
            print(f"✅ Résultat Gemini: {result}")
            
            # Extraire nom et prénom
            nom_complet = result.get('nom_complet', '').strip()
            name_parts = nom_complet.split()
            
            candidate = {
                "nom": name_parts[-1] if len(name_parts) > 1 else None,
                "prenom": name_parts[0] if name_parts else None,
                "email": result.get('email'),
                "telephone": result.get('telephone'),
                "metier": result.get('metier'),
                "competences": result.get('competences', []),
                "niveau": result.get('diplome'),
                "annees_experience": result.get('experience_annees', 0),
                "cv_url": f"{os.environ['SUPABASE_URL']}/storage/v1/object/public/truthtalent/{file_path}",
                "cv_filename": file_path.split('/')[-1],
                "fichier": file_path
            }
            
            # Niveau d'expérience
            exp = candidate["annees_experience"]
            if exp < 2:
                candidate["niveau_experience"] = "junior"
            elif exp < 5:
                candidate["niveau_experience"] = "intermédiaire"
            elif exp < 10:
                candidate["niveau_experience"] = "confirmé"
            else:
                candidate["niveau_experience"] = "senior"
            
            return jsonify({"success": True, "candidateInfo": candidate})
            
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
            
    except Exception as e:
        print(f"❌ Erreur: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500

@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', 'https://truthtalent.online')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
    response.headers.add('Access-Control-Allow-Methods', 'POST, OPTIONS')
    return response

if __name__ == "__main__":
    print(f"🐍 Python: {sys.executable}")
    print(f"📦 Google Generative AI: {genai.__version__}")
    app.run(host='0.0.0.0', port=5000, debug=True)

# Pour Vercel
app = app