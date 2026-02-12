# Par :
import os
# Dans ton main.py
import spacy
nlp = spacy.load("fr_core_news_sm")  # Au lieu de "fr_core_news_md"

from supabase import create_client
supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))

# Exemple de fonction pour sauvegarder les résultats :
def save_results(cv_data, analysis_results):
    supabase.table("analysis_results").insert({
        "cv_id": cv_data["id"],
        "score": analysis_results["score"],
        "skills": analysis_results["skills"],
        "recommendations": analysis_results["recommendations"]
    }).execute()
