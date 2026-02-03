export default function Home() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>API Truth Talent - Parseur de CV</h1>
      <p>API disponible sur <code>/api/parse</code></p>
      <h3>Utilisation :</h3>
      <pre>
        {`curl -X POST https://apitruthtalent.vercel.app/api/parse \\
  -F "file=@cv.pdf" \\
  -H "Content-Type: multipart/form-data"`}
      </pre>
    </div>
  );
}