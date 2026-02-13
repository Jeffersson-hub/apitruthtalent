import natural from 'natural';
const tokenizer = new natural.WordTokenizer();
const { JaroWinklerDistance } = natural;

export function analyzeText(resumeText, jobDescription) {
  const resumeTokens = tokenizer.tokenize(resumeText.toLowerCase());
  const jobTokens = tokenizer.tokenize(jobDescription.toLowerCase());

  const missingKeywords = jobTokens.filter(
    token => !resumeTokens.some(rToken => JaroWinklerDistance(token, rToken) > 0.85)
  );

  const score = 100 - (missingKeywords.length / jobTokens.length) * 100;

  return {
    score: Math.max(0, Math.round(score)),
    missingKeywords: [...new Set(missingKeywords)].slice(0, 10)
  };
}
