const express = require("express");
const multer = require("multer");
const cors = require("cors");
const dotenv = require("dotenv");
const fs = require("fs");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { LambdaClient, InvokeCommand } = require("@aws-sdk/client-lambda");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
app.use(cors());
const upload = multer({ dest: "uploads/" });

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const lambda = new LambdaClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

app.post("/upload", upload.single("resume"), async (req, res) => {
  const file = req.file;
  const jobDescription = req.body.jobDescription;

  if (!file || !jobDescription) {
    return res
      .status(400)
      .json({ error: "Resume and job description required." });
  }

  const fileStream = fs.createReadStream(file.path);

  const uploadParams = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: `resumes/${file.originalname}`,
    Body: fileStream,
    ContentType: file.mimetype,
  };

  try {
    // 1. Upload file to S3
    await s3.send(new PutObjectCommand(uploadParams));
    fs.unlinkSync(file.path); // Clean up local file

    // 2. Invoke Lambda function
    const lambdaParams = {
      FunctionName: "ExtractResumeText",
      Payload: JSON.stringify({
        bucket: process.env.S3_BUCKET_NAME,
        key: `resumes/${file.originalname}`,
        jobDescription: jobDescription,
      }),
    };

    const lambdaRes = await lambda.send(new InvokeCommand(lambdaParams));

    // 3. Handle Lambda function error if any
    if (lambdaRes.FunctionError) {
      console.error("Lambda FunctionError:", lambdaRes.Payload.toString());
      return res
        .status(500)
        .json({ error: "Lambda function error. Check logs for details." });
    }

    // 4. Parse and validate Lambda payload
    let lambdaPayload;
    try {
      lambdaPayload = JSON.parse(Buffer.from(lambdaRes.Payload).toString());
    } catch (parseError) {
      console.error("Failed to parse Lambda response:", parseError);
      return res
        .status(500)
        .json({ error: "Invalid response from Lambda function." });
    }

    // 5. Parse body from Lambda payload if it's wrapped
    let analysisData;
    try {
      analysisData = JSON.parse(lambdaPayload.body);
    } catch {
      analysisData = lambdaPayload;
    }

    res.json({
      message: "Resume analyzed successfully!",
      analysis: analysisData,
    });
  } catch (error) {
    console.error("Upload/processing error:", error);
    res.status(500).json({ error: "Failed to process resume." });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
