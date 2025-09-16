const express = require("express");
const multer = require("multer");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const path = require("path");
const crypto = require("crypto");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

// Configure DigitalOcean Spaces client
const s3Client = new S3Client({
  endpoint: process.env.DO_SPACES_ENDPOINT,
  region: process.env.DO_SPACES_REGION,
  credentials: {
    accessKeyId: process.env.DO_SPACES_KEY,
    secretAccessKey: process.env.DO_SPACES_SECRET,
  },
});

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"), false);
    }
  },
});

// Enable CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

// Serve static files for the upload form
app.use(express.static("public"));

// Upload endpoint
app.post("/upload", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Generate unique filename
    const fileExtension = path.extname(req.file.originalname);
    const fileName = `${crypto.randomUUID()}${fileExtension}`;
    const key = `tmp/uploads/${fileName}`;

    // Upload to DigitalOcean Spaces
    const command = new PutObjectCommand({
      Bucket: process.env.DO_SPACES_BUCKET,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
      ACL: "public-read", // Make the file publicly accessible
    });

    await s3Client.send(command);

    // Generate public URL
    const publicUrl = `https://${process.env.DO_SPACES_BUCKET}.${process.env.DO_SPACES_REGION}.digitaloceanspaces.com/${key}`;

    res.json({
      success: true,
      message: "Image uploaded successfully",
      url: publicUrl,
      filename: fileName,
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({
      error: "Failed to upload image",
      details: error.message,
    });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "OK", service: "DigitalOcean Spaces Image Upload" });
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Upload form available at http://localhost:${port}`);
});

module.exports = app;
