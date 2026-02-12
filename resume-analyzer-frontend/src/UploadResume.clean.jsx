import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

export default function UploadResume() {
  const [file, setFile] = useState(null);
  const [jobDescription, setJobDescription] = useState('');
  const [message, setMessage] = useState('');
  const [analysis, setAnalysis] = useState({
    wordCount: 0,
    ats: { score: '0%', missingKeywords: [], foundKeywords: [] },
    skills: { technical: [], soft: [] },
    jobSuggestions: [],
    skillsGap: { missingSkills: [], suggestedImprovements: [] },
    summary: '',
  });
  const [loading, setLoading] = useState(false);
  const [showAllSkills, setShowAllSkills] = useState(false);

  useEffect(() => {
    document.body.classList.add('dark');
    return () => {
      document.body.classList.remove('dark');
    };
  }, []);

  const toggleTheme = () => {
    document.body.classList.toggle('light');
  };

  const resetAnalysis = () => {
    setAnalysis({
      wordCount: 0,
      ats: { score: '0%', missingKeywords: [], foundKeywords: [] },
      skills: { technical: [], soft: [] },
      jobSuggestions: [],
      skillsGap: { missingSkills: [], suggestedImprovements: [] },
      summary: '',
    });
  };

  const handleChange = (e) => {
    setFile(e.target.files[0]);
    setMessage('');
    resetAnalysis();
  };

  const handleUpload = async () => {
    if (!file || !jobDescription) {
      alert('Please upload a resume and enter a job description.');
      return;
    }

    const formData = new FormData();
    formData.append('resume', file);
    formData.append('jobDescription', jobDescription);

    setLoading(true);
    setMessage('');
    setShowAllSkills(false);

    try {
      const res = await axios.post(
        `${import.meta.env.VITE_API_URL}/upload`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );

      const apiAnalysis = res.data.analysis || {};
      const apiAts = apiAnalysis.ats || {};
      const apiSkills = apiAnalysis.skills || {};
      const apiSkillsGap = apiAnalysis.skillsGap || {};

      setMessage(res.data.message || 'Analysis complete.');

      setAnalysis({
        wordCount: apiAnalysis.wordCount || 0,
        ats: {
          score: String(apiAts.score ?? '0') + (String(apiAts.score ?? '0').includes('%') ? '' : '%'),
          missingKeywords: apiAts.missingKeywords || [],
          foundKeywords: apiAts.foundKeywords || [],
        },
        skills: {
          technical: apiSkills.technical || [],
          soft: apiSkills.soft || [],
        },
        jobSuggestions: apiAnalysis.jobSuggestions || [],
        skillsGap: {
          missingSkills: apiSkillsGap.missingSkills || [],
          suggestedImprovements: apiSkillsGap.suggestedImprovements || [],
        },
        summary: apiAnalysis.summary || '',
      });
    } catch (err) {
      console.error('Analysis Error:', err);
      setMessage(`Analysis failed. ${err.message || ''}`);
      resetAnalysis();
    } finally {
      setLoading(false);
    }
  };

  const areSkillsGapListsSame = () => {
    const missing = analysis.skillsGap?.missingSkills || [];
    const suggested = analysis.skillsGap?.suggestedImprovements || [];
    if (missing.length !== suggested.length) return false;
    const sortedMissing = [...missing].sort();
    const sortedSuggested = [...suggested].sort();
    return sortedMissing.every((val, index) => val === sortedSuggested[index]);
  };

  const skillsGapIdentical = areSkillsGapListsSame();

  const renderSkills = (skills, limit = 5) => {
    if (!skills || skills.length === 0) return <p>No skills found</p>;
    
    const skillsToShow = showAllSkills ? skills : skills.slice(0, limit);
    
    return (
      <div className="skills-container">
        <ul className="skill-list">
          {skillsToShow.map((skill, index) => (
            <li key={index} className="skill-tag">
              {skill}
            </li>
          ))}
        </ul>
        {skills.length > limit && !showAllSkills && (
          <button 
            className="show-more" 
            onClick={() => setShowAllSkills(true)}
          >
            Show more...
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="container">
      <h1 className="title">AI Resume Analyzer</h1>

      <button className="theme-toggle" onClick={toggleTheme}>
        Toggle Theme
      </button>

      <div className="upload-section">
        <div className="form-group">
          <label htmlFor="resume-upload">Upload Resume (PDF/DOCX)</label>
          <input 
            id="resume-upload"
            type="file" 
            onChange={handleChange} 
            accept=".pdf,.doc,.docx"
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="job-description">Job Description</label>
          <textarea
            id="job-description"
            placeholder="Paste the job description here..."
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
          />
        </div>

        <button 
          className="analyze-button"
          onClick={handleUpload} 
          disabled={loading || !file || !jobDescription}
        >
          {loading ? 'Analyzing...' : 'Analyze Resume'}
        </button>
        
        {message && <p className="message">{message}</p>}
      </div>

      {!loading && analysis.wordCount > 0 && (
        <div className="result-section">
          <div className="card">
            <h3>Resume Analysis</h3>
            <div className="analysis-summary">
              <div className="analysis-metric">
                <span className="metric-label">Word Count</span>
                <span className="metric-value">{analysis.wordCount}</span>
              </div>
              <div className="analysis-metric">
                <span className="metric-label">ATS Score</span>
                <span className={`metric-value ${parseInt(analysis.ats.score) >= 50 ? 'good' : 'bad'}`}>
                  {analysis.ats.score}
                </span>
              </div>
            </div>
          </div>

          {(analysis.ats.foundKeywords.length > 0 || analysis.ats.missingKeywords.length > 0) && (
            <div className="card">
              <h3>Job Description Relevance</h3>
              {analysis.ats.foundKeywords.length > 0 && (
                <div className="matched-skills">
                  <h4>Matched Skills</h4>
                  <p className="section-description">These skills from your resume match the job description:</p>
                  {renderSkills(analysis.ats.foundKeywords)}
                </div>
              )}
              
              {analysis.ats.missingKeywords.length > 0 && (
                <div className="missing-skills">
                  <h4>Missing Keywords</h4>
                  <p className="section-description">Consider adding these keywords from the job description:</p>
                  <ul className="skill-list">
                    {analysis.ats.missingKeywords.map((kw, i) => (
                      <li key={`missing-${i}`} className="skill-tag missing">
                        {kw}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {analysis.jobSuggestions.length > 0 && (
            <div className="card">
              <h3>Suggested Job Roles</h3>
              <p className="section-description">Based on your skills and experience, you might be a good fit for:</p>
              <div className="job-suggestions">
                {analysis.jobSuggestions.map((job, index) => (
                  <div key={`job-${index}`} className="job-suggestion">
                    <h4>
                      {job.title} 
                      <span className="match-score">{job.matchScore || 0}% match</span>
                    </h4>
                    {job.matchingSkills && job.matchingSkills.length > 0 && (
                      <div className="matching-skills">
                        <p>Key matching skills:</p>
                        <ul className="skill-list">
                          {job.matchingSkills.slice(0, 5).map((skill, idx) => (
                            <li key={`job-${index}-skill-${idx}`} className="skill-tag">
                              {skill}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {(analysis.skillsGap.missingSkills.length > 0 || analysis.skillsGap.suggestedImprovements.length > 0) && (
            <div className="card">
              <h3>Skills Gap Analysis</h3>
              <p className="section-description">Here are areas where you could improve your resume:</p>
              <div className="skills-gap">
                <div className="missing-skills-section">
                  <h4>Skills to Add</h4>
                  <ul className="skill-list">
                    {analysis.skillsGap.missingSkills.map((skill, i) => (
                      <li key={`missing-skill-${i}`} className="skill-tag missing">
                        {skill}
                      </li>
                    ))}
                  </ul>
                </div>

                {!skillsGapIdentical && analysis.skillsGap.suggestedImprovements.length > 0 && (
                  <div className="suggestions-section">
                    <h4>Suggested Improvements</h4>
                    <ul className="suggestions-list">
                      {analysis.skillsGap.suggestedImprovements.map((suggestion, i) => (
                        <li key={`suggestion-${i}`} className="suggestion">
                          <span className="suggestion-bullet">•</span>
                          <span>{suggestion}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {analysis.summary && (
            <div className="card">
              <h3>Summary</h3>
              <div className="scroll-box">
                <p style={{ whiteSpace: "pre-wrap" }}>{analysis.summary}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
