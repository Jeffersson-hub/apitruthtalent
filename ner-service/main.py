from fastapi import FastAPI, Request, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any
import os
from transformers import pipeline
from fastapi.middleware.cors import CORSMiddleware

MODEL_NAME = os.environ.get("NER_MODEL", "Jean-Baptiste/camembert-ner")
API_KEY = os.environ.get("NER_API_KEY", None)
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "*")  # e.g. https://truthtalent.online

print("Loading model:", MODEL_NAME)
ner_pipe = pipeline("ner", model=MODEL_NAME, grouped_entities=True)

app = FastAPI(title="NER Service for CV parsing")

# CORS
origins = [o.strip() for o in ALLOWED_ORIGINS.split(",")] if ALLOWED_ORIGINS else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)

class ParseRequest(BaseModel):
    text: str

@app.get("/health")
def health():
    return {"ok": True, "model": MODEL_NAME}

def check_api_key(request: Request):
    if API_KEY:
        header = request.headers.get("x-api-key") or request.headers.get("authorization")
        if not header:
            raise HTTPException(status_code=401, detail="Missing API key")
        # support "Bearer <key>" or raw header
        token = header.split()[-1]
        if token != API_KEY:
            raise HTTPException(status_code=403, detail="Invalid API key")

@app.post("/parse-text")
def parse_text(req: ParseRequest, request: Request):
    # Vérifier clé si définie
    check_api_key(request)

    text = req.text or ""
    if not text:
        return {"ok": False, "entities": []}

    ner_results = ner_pipe(text)
    entities = []
    by_label: Dict[str, List[Dict[str, Any]]] = {}
    for ent in ner_results:
        label = ent.get("entity_group") or ent.get("entity") or ent.get("label")
        item = {
            "label": label,
            "text": ent.get("word") or ent.get("entity"),
            "start": ent.get("start"),
            "end": ent.get("end"),
            "score": float(ent.get("score", 0.0))
        }
        entities.append(item)
        by_label.setdefault(label, []).append(item)

    summary = { label: sorted(items, key=lambda x: -x["score"])[0] for label, items in by_label.items() }
    return {"ok": True, "entities": entities, "summary": summary}