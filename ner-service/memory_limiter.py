# ner-service/memory_limiter.py
import resource
import os

def set_memory_limit(limit_mb: int = 400):
    """Limiter l'utilisation mémoire du processus"""
    try:
        # Convertir MB en bytes
        soft, hard = resource.getrlimit(resource.RLIMIT_AS)
        new_limit = limit_mb * 1024 * 1024
        
        # Définir la nouvelle limite
        resource.setrlimit(resource.RLIMIT_AS, (new_limit, hard))
        print(f"✅ Limite mémoire fixée à {limit_mb}MB")
        
    except Exception as e:
        print(f"⚠️ Impossible de limiter la mémoire: {e}")

# Appeler au démarrage
if __name__ == "__main__":
    set_memory_limit(400)