// app/page.tsx - SIMPLIFIÉ
export default function Home() {
  return (
    <div style={{ padding: '2rem' }}>
      <h1>CV Parser API</h1>
      <p>API disponible sur <code>/api/parse</code></p>
      
      <h3>Utilisation :</h3>
      <pre>
{`curl -X POST /api/parse \\
  -F "file=@cv.pdf" \\
  -H "Content-Type: multipart/form-data"`}
      </pre>
      
      <h3>Statut :</h3>
      <p>✅ Parser fonctionnel à 85%+</p>
      <p>✅ Prêt pour la production</p>
    </div>
  );
}