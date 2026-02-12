import React from 'react';

const AnalysisResults = ({ analysis = {} }) => {
  // Destructure with default values
  const {
    skills = {
      technical: [],
      soft: [],
      matchPercentage: '0%',
      missing: []
    },
    ats = {
      score: '0%',
      missingKeywords: [],
      foundKeywords: []
    },
    jobSuggestions = [],
    skillsGap = {
      missingSkills: [],
      suggestedImprovements: []
    },
    candidateInfo = {},
    sections = {},
    workExperienceAnalysis = {},
    readabilityAnalysis = {}
  } = analysis;

  return (
    <div className="analysis-results">
      <div className="candidate-info">
        <h3>Candidate Information</h3>
        <p>Name: {candidateInfo.name || 'N/A'}</p>
        <p>Email: {candidateInfo.email || 'N/A'}</p>
        <p>Phone: {candidateInfo.phone || 'N/A'}</p>
      </div>

      <div className="readability-analysis">
        <h3>Readability Analysis</h3>
        <p>Pages: {readabilityAnalysis.pages || 0}</p>
        <p>Long Sentences: {readabilityAnalysis.longSentences || 0}</p>
        <ul>
          {readabilityAnalysis.feedback && readabilityAnalysis.feedback.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      </div>

      <div className="skills-section">
        <h3>Skills Analysis</h3>
        <div className="match-score">
          <h4>Match Score: {ats.score}</h4>
        </div>
        
        <div className="skills-lists">
          <div className="technical-skills">
            <h4>Technical Skills</h4>
            <ul>
              {skills.technical.map((skill, index) => (
                <li key={index}>{skill}</li>
              ))}
            </ul>
          </div>
          
          <div className="soft-skills">
            <h4>Soft Skills</h4>
            <ul>
              {skills.soft.map((skill, index) => (
                <li key={index}>{skill}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="work-experience-analysis">
        <h3>Work Experience Analysis</h3>
        <h4>Action Verb Check</h4>
        <ul>
          {workExperienceAnalysis.actionVerbCheck && workExperienceAnalysis.actionVerbCheck.map((item, index) => (
            <li key={index}>{item.bullet} - {item.feedback}</li>
          ))}
        </ul>
        <h4>Quantifiable Achievement Check</h4>
        <ul>
          {workExperienceAnalysis.quantifiableCheck && workExperienceAnalysis.quantifiableCheck.map((item, index) => (
            <li key={index}>{item.bullet} - {item.feedback}</li>
          ))}
        </ul>
      </div>

      <div className="job-suggestions">
        <h3>Suggested Job Roles</h3>
        {jobSuggestions.map((job, index) => (
          <div key={index} className="job-suggestion">
            <h4>{job.title} ({job.matchScore || 0}% match)</h4>
            <div className="matching-skills">
              <h5>Matching Skills:</h5>
              <ul>
                {(job.matchingSkills || []).map((skill, idx) => (
                  <li key={idx}>{skill}</li>
                ))}
              </ul>
            </div>
            {(job.missingRequired || []).length > 0 && (
              <div className="missing-skills">
                <h5>Missing Required Skills:</h5>
                <ul>
                  {job.missingRequired.map((skill, idx) => (
                    <li key={idx}>{skill}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="skills-gap">
        <h3>Skills Gap Analysis</h3>
        <div className="missing-skills">
          <h4>Missing Skills</h4>
          <ul>
            {skillsGap.missingSkills.map((skill, index) => (
              <li key={index}>{skill}</li>
            ))}
          </ul>
        </div>
        <div className="suggested-improvements">
          <h4>Suggested Improvements</h4>
          <ul>
            {skillsGap.suggestedImprovements.map((skill, index) => (
              <li key={index}>{skill}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="resume-sections">
        <h3>Resume Sections</h3>
        {Object.entries(sections).map(([section, content]) => (
          <div key={section}>
            <h4>{section}</h4>
            <ul>
              {content.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AnalysisResults;