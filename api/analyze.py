# api/analyze.py - Version Gemini directe (100% fiable)
import os
import json
import tempfile
import PyPDF2
import google.generativeai as genai
from flask import Flask, request, jsonify
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()
app = Flask(__name__)

# Configuration
supabase = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_SERVICE_ROLE_KEY"]
)

# Initialisation Gemini
genai.configure(api_key=os.environ["GOOGLE_API_KEY"])
model = genai.GenerativeModel('gemini-1.5-flash')  # Version gratuite et rapide

@app.route('/api/analyze', methods=['POST', 'OPTIONS'])
def analyze():
    if request.method == 'OPTIONS':
        return '', 200
    
    try:
        data = request.get_json()
        file_path = data.get('filePath')
        
        if not file_path:
            return jsonify({"success": False, "error": "filePath requis"}), 400
        
        # 1. Télécharger le PDF
        file_data = supabase.storage.from_('truthtalent').download(file_path)
        
        # 2. Sauvegarder temporairement
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp:
            tmp.write(file_data)
            tmp_path = tmp.name
        
        try:
            # 3. Extraire le texte du PDF
            text = ""
            with open(tmp_path, 'rb') as f:
                reader = PyPDF2.PdfReader(f)
                for page in reader.pages:
                    text += page.extract_text() + "\n"
            
            # 4. Prompt clair pour Gemini
            prompt = f"""
            Analyse ce CV et retourne UNIQUEMENT un JSON valide avec ces champs :
            - nom_complet
            - email
            - telephone
            - metier (le poste principal)
            - competences (liste de 5-10 compétences clés)
            - diplome (le plus élevé)
            - experience_annees (nombre)

            CV :
            {text[:6000]}

            Exemple de format attendu :
            {{
                "nom_complet": "Jean Dupont",
                "email": "jean.dupont@email.com",
                "telephone": "0612345678",
                "metier": "Ingénieur DevOps",
                "competences": ["Python", "AWS", "Docker"],
                "diplome": "Master",
                "experience_annees": 5
            }}
            """
            
            # 5. Appel à Gemini
            response = model.generate_content(prompt)
            result_text = response.text.strip()
            
            # Nettoyer la réponse (enlever ```json si présent)
            if result_text.startswith('```json'):
                result_text = result_text[7:]
            if result_text.endswith('```'):
                result_text = result_text[:-3]
            
            result = json.loads(result_text)
            
            # 6. Extraire nom et prénom
            nom_complet = result.get('nom_complet', '').strip()
            nom_parts = nom_complet.split()
            
            candidate = {
                "nom": nom_parts[-1] if len(nom_parts) > 1 else None,
                "prenom": nom_parts[0] if nom_parts else None,
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
        return jsonify({"success": False, "error": str(e)}), 500

@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', 'https://truthtalent.online')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
    response.headers.add('Access-Control-Allow-Methods', 'POST, OPTIONS')
    return response

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5000, debug=True)

# Pour Vercel
app = app