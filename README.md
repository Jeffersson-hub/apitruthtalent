 🧠 AI Resume Analyzer

An AI-powered Resume Analyzer that evaluates resumes against job descriptions using AWS services like Comprehend, Lambda, and S3. It provides ATS (Applicant Tracking System) score, keyword analysis, and summary improve resumes for better job matches.

---

## 📁 Project Structure

```
resume-analyzer/
├── backend/                  # Express server for testing locally
├── extract-resume-text/     # AWS Lambda function to extract/analyze resume
├── resume-analyzer-frontend/ # React frontend (hosted on Vercel)
└── .gitignore
```

---

## 🛠️ Features

- 📄 Upload resumes in PDF or DOCX
- 🧠 Analyzes with **AWS Comprehend**
- ✅ ATS score & keyword match
- 📊 Extracted summary and missing keywords
- 💡 Light/Dark mode toggle
- ☁️ Serverless architecture using AWS Lambda
- 🔐 S3 resume storage 

---

## 🚀 Live Demo

> You can deploy the frontend on [Vercel](https://vercel.com) and backend via AWS Lambda + API Gateway or render

---

## 🧑‍💻 Local Setup Instructions

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/resume-analyzer.git
cd resume-analyzer
```

---

### 2. Frontend Setup (`resume-analyzer-frontend/`)

```bash
cd resume-analyzer-frontend
npm install
```

Run locally:

```bash
npm run dev
```

---

### 3. Backend Setup 

If you want to test locally before Lambda deployment:

```bash
cd backend
npm install
node index.js
```

This provides a basic Express server with file upload and analysis routes.

---

### 4. AWS Lambda Function (`extract-resume-text/`)

This is your serverless function that:

- Extracts text from `.pdf` or `.docx`
- Uses **AWS Comprehend** to detect key phrases/entities
- Calculates ATS match score

#### Deploying to AWS:

1. Zip the `extract-resume-text/` folder
2. Upload it to AWS Lambda Console
3. Set the handler (e.g., `index.handler`)
4. Set environment variables (if needed)
5. Enable CORS via API Gateway

---

### 5. Hosting Frontend on Vercel

#### Steps:
1. Push your frontend folder to a GitHub repo
2. Go to [vercel.com](https://vercel.com)
3. Import the project
4. Add Environment Variables
5. Deploy 🎉

---

## 🧠 Tech Stack

- **Frontend:** React, Axios, Vercel
- **Backend:** AWS Lambda (Node.js), AWS S3, AWS Comprehend, render
- **Parsing:** `pdf-parse`, `mammoth`
- **Deployment:** Vercel + AWS Lambda + render

---

## 💡 To-Do (Optional Ideas)

- Resume tips based on analysis
- Multiple resume uploads
- Job matching engine
- OAuth / Auth0 integration


