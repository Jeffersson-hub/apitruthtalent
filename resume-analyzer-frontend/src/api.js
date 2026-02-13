// frontend/src/api.js
export const uploadResume = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch('https://ton-projet-vercel.vercel.app/api/upload', {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) throw new Error('Upload failed');
  return response.json();
};

export const analyzeResume = async (resumeUrl, jobDescription) => {
  const response = await fetch('https://ton-projet-vercel.vercel.app/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resumeUrl, jobDescription }),
  });
  if (!response.ok) throw new Error('Analysis failed');
  return response.json();
};
