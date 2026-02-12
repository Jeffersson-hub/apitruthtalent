import React, { useState } from 'react';
import AnalysisResults from './AnalysisResults';

const UploadResume = () => {
  const [file, setFile] = useState(null);
  const [jobDescription, setJobDescription] = useState('');
  const [analysis, setAnalysis] = useState({
    skills: {
      technical: [],
      soft: [],
      matchPercentage: '0%',
      missing: []
    },
    ats: {
      score: '0%',
      missingKeywords: [],
      foundKeywords: []
    },
    jobSuggestions: [],
    skillsGap: {
      missingSkills: [],
      suggestedImprovements: []
    },
    candidateInfo: {
      name: null,
      email: null,
      phone: null
    },
    sections: {},
    workExperienceAnalysis: {
      feedback: '',
      actionVerbCheck: [],
      quantifiableCheck: []
    },
    readabilityAnalysis: {
      pages: 0,
      longSentences: 0,
      feedback: []
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleJobDescriptionChange = (e) => {
    setJobDescription(e.target.value);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a file');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('jobDescription', jobDescription);

      const response = await fetch('/api/analyze-resume', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to analyze resume');
      }

      const responseData = await response.json();
      const data = responseData.analysis;

      // Transform the response to match expected structure
      const transformedAnalysis = {
        skills: {
          technical: data.skills?.technical || [],
          soft: data.sills?.soft || [],
          matchPercentage: data.skills?.matchPercentage || '0%',
          missing: data.skills?.missing || []
        },
        ats: {
          score: data.ats?.score || data.skills?.matchPercentage || '0%',
          missingKeywords: data.ats?.missingKeywords || data.skills?.missing || [],
          foundKeywords: data.ats?.foundKeywords || data.skills?.technical || []
        },
        jobSuggestions: data.jobSuggestions || [],
        skillsGap: {
          missingSkills: data.skillsGap?.missingSkills || [],
          suggestedImprovements: data.skillsGap?.suggestedImprovements || []
        },
        candidateInfo: data.candidateInfo || { name: null, email: null, phone: null },
        sections: data.sections || {},
        workExperienceAnalysis: data.workExperienceAnalysis || { feedback: '', actionVerbCheck: [], quantifiableCheck: [] },
        readabilityAnalysis: data.readabilityAnalysis || { pages: 0, longSentences: 0, feedback: [] }
      };

      setAnalysis(transformedAnalysis);
    } catch (err) {
      setError(err.message || 'An error occurred while analyzing the resume');
      setAnalysis({
        skills: {
          technical: [],
          soft: [],
          matchPercentage: '0%',
          missing: []
        },
        ats: {
          score: '0%',
          missingKeywords: [],
          foundKeywords: []
        },
        jobSuggestions: [],
        skillsGap: {
          missingSkills: [],
          suggestedImprovements: []
        },
        candidateInfo: {
          name: null,
          email: null,
          phone: null
        },
        sections: {},
        workExperienceAnalysis: {
          feedback: '',
          actionVerbCheck: [],
          quantifiableCheck: []
        },
        readabilityAnalysis: {
          pages: 0,
          longSentences: 0,
          feedback: []
        }
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="upload-resume">
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="resume">Upload Resume (PDF or DOCX)</label>
          <input
            type="file"
            id="resume"
            accept=".pdf,.docx"
            onChange={handleFileChange}
          />
        </div>

        <div className="form-group">
          <label htmlFor="jobDescription">Job Description</label>
          <textarea
            id="jobDescription"
            value={jobDescription}
            onChange={handleJobDescriptionChange}
            placeholder="Paste the job description here..."
          />
        </div>

        <button type="submit" disabled={loading}>
          {loading ? 'Analyzing...' : 'Analyze Resume'}
        </button>
      </form>

      {error && <div className="error">{error}</div>}

      {!loading && analysis.skills.matchPercentage !== '0%' && (
        <>
          <AnalysisResults analysis={analysis} />
          <p
            className={`score ${
              parseInt(analysis.ats.score) >= 50 ? "good" : "bad"
            }`}
          >
            ATS Score: {analysis.ats.score}
          </p>
        </>
      )}
    </div>
  );
};

export default UploadResume;