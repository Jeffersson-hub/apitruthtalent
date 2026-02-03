// app/page.tsx
export default function Home() {
  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
    <h1>TruthTalent Engine API</h1>
      <p>API de parsing intelligent de CV pour truthtalent.online</p>
      
      <h2>Endpoints disponibles :</h2>
      <ul>
        <li>
          <strong>POST /api/parse</strong> - Analyser un CV
          <pre>
{`curl -X POST https://your-domain/api/parse \\
  -H "Content-Type: application/json" \\
  -d '{
    "file_url": "https://example.com/cv.pdf",
    "candidat_id": "123",
    "job_id": "job_123"
  }'`}
          </pre>
        </li>
        <li>
          <strong>GET /api/health</strong> - Vérifier l'état de l'API
        </li>
      </ul>
      
      <h2>Statistiques :</h2>
      <p>Parser fonctionnel à 85%+ - Extraction de :</p>
      <ul>
        <li>Noms et coordonnées</li>
        <li>Expériences professionnelles</li>
        <li>Compétences techniques</li>
        <li>Formations</li>
      </ul>
    </div>
  );
}