# Remplace :
# from pymongo import MongoClient
# client = MongoClient("mongodb://localhost:27017/")
# db = client["resume_analyzer"]

# Par :
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
