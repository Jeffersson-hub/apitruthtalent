// Remplace l'URL de l'API MongoDB/Flask par :
const API_URL = "https://apitruthtalent.vercel.app";
export const analyzeResume = async (formData) => {
  const response = await fetch(`${API_URL}/analyze`, {
    method: "POST",
    body: formData,
  });
  return response.json();
};
