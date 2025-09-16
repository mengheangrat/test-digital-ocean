const express = require("express");
const multer = require("multer");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs").promises;
const chokidar = require("chokidar");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

// Local upload directory to monitor
const LOCAL_UPLOAD_DIR = "/root/tmp/uploads";

// Configure DigitalOcean Spaces client
const s3Client = new S3Client({
  endpoint: process.env.DO_SPACES_ENDPOINT,
  region: process.env.DO_SPACES_REGION,
  credentials: {
    accessKeyId: process.env.DO_SPACES_KEY,
    secretAccessKey: process.env.DO_SPACES_SECRET,
  },
});

// Helper function to check if file is an image
const isImageFile = (filename) => {
  const imageExtensions = [
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".bmp",
    ".webp",
    ".svg",
  ];
  const ext = path.extname(filename).toLowerCase();
  return imageExtensions.includes(ext);
};

// Helper function to get MIME type from file extension
const getMimeType = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
  };
  return mimeTypes[ext] || "application/octet-stream";
};

// Function to upload a single file to DigitalOcean Spaces
const uploadFileToSpaces = async (filePath, filename) => {
  try {
    console.log(`📤 Uploading: ${filename}`);

    // Read file from local directory
    const fileBuffer = await fs.readFile(filePath);
    // Use original filename instead of generating UUID
    const key = `images/${filename}`;

    // Upload to DigitalOcean Spaces
    const command = new PutObjectCommand({
      Bucket: process.env.DO_SPACES_BUCKET,
      Key: key,
      Body: fileBuffer,
      ContentType: getMimeType(filename),
      ACL: "public-read",
    });

    await s3Client.send(command);

    // Generate public URL
    const publicUrl = `https://${process.env.DO_SPACES_BUCKET}.${process.env.DO_SPACES_REGION}.digitaloceanspaces.com/${key}`;

    console.log(`✅ Uploaded successfully: ${filename} -> ${publicUrl}`);

    // Optional: Delete local file after successful upload
    // await fs.unlink(filePath);
    // console.log(`🗑️  Deleted local file: ${filename}`);

    return {
      success: true,
      url: publicUrl,
      originalName: filename,
      uploadedName: filename,
    };
  } catch (error) {
    console.error(`❌ Failed to upload ${filename}:`, error.message);
    return { success: false, error: error.message, filename };
  }
};

// Function to scan and upload all images in the directory
const scanAndUploadAll = async () => {
  try {
    console.log(`🔍 Scanning directory: ${LOCAL_UPLOAD_DIR}`);

    // Create directory if it doesn't exist
    try {
      await fs.access(LOCAL_UPLOAD_DIR);
    } catch {
      await fs.mkdir(LOCAL_UPLOAD_DIR, { recursive: true });
      console.log(`📁 Created directory: ${LOCAL_UPLOAD_DIR}`);
    }

    // Read all files in the directory
    const files = await fs.readdir(LOCAL_UPLOAD_DIR);
    const imageFiles = files.filter(isImageFile);

    if (imageFiles.length === 0) {
      console.log(`📂 No image files found in ${LOCAL_UPLOAD_DIR}`);
      return;
    }

    console.log(`📸 Found ${imageFiles.length} image(s) to upload`);

    // Upload images in batches of 100
    const BATCH_SIZE = 1000;
    const batches = [];

    // Split images into batches
    for (let i = 0; i < imageFiles.length; i += BATCH_SIZE) {
      batches.push(imageFiles.slice(i, i + BATCH_SIZE));
    }

    console.log(
      `📦 Processing ${batches.length} batch(es) of ${BATCH_SIZE} images each`
    );

    let allResults = [];
    let totalSuccessful = 0;
    let totalFailed = 0;

    // Process each batch sequentially
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const batchNumber = batchIndex + 1;

      console.log(
        `🚀 Processing batch ${batchNumber}/${batches.length} (${batch.length} images)...`
      );

      // Upload all images in current batch in parallel
      const uploadPromises = batch.map((filename) => {
        const filePath = path.join(LOCAL_UPLOAD_DIR, filename);
        return uploadFileToSpaces(filePath, filename);
      });

      const batchResults = await Promise.all(uploadPromises);
      const batchSuccessful = batchResults.filter((r) => r.success).length;
      const batchFailed = batchResults.filter((r) => !r.success).length;

      totalSuccessful += batchSuccessful;
      totalFailed += batchFailed;
      allResults = allResults.concat(batchResults);

      console.log(
        `✅ Batch ${batchNumber} complete: ${batchSuccessful} successful, ${batchFailed} failed`
      );

      // Small delay between batches to be respectful to the API
      if (batchIndex < batches.length - 1) {
        console.log(`⏳ Waiting 2 seconds before next batch...`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    console.log(
      `🎉 All uploads complete: ${totalSuccessful} successful, ${totalFailed} failed (${imageFiles.length} total)`
    );
    return allResults;
  } catch (error) {
    console.error(`❌ Error scanning directory:`, error.message);
  }
};

// Function to setup file watcher for automatic uploads
const setupFileWatcher = () => {
  console.log(`👀 Setting up file watcher for: ${LOCAL_UPLOAD_DIR}`);

  const watcher = chokidar.watch(LOCAL_UPLOAD_DIR, {
    ignored: /^\./, // ignore dotfiles
    persistent: true,
    ignoreInitial: true, // don't trigger for existing files
  });

  watcher.on("add", async (filePath) => {
    const filename = path.basename(filePath);
    if (isImageFile(filename)) {
      console.log(`🆕 New image detected: ${filename}`);
      // Wait a moment to ensure file is fully written
      setTimeout(async () => {
        await uploadFileToSpaces(filePath, filename);
      }, 1000);
    }
  });

  watcher.on("ready", () => {
    console.log(`✅ File watcher ready and monitoring: ${LOCAL_UPLOAD_DIR}`);
  });

  watcher.on("error", (error) => {
    console.error(`❌ File watcher error:`, error);
  });

  return watcher;
};

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

    // Use original filename instead of generating UUID
    const fileName = req.file.originalname;
    const key = `images/${fileName}`;

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

// Test endpoint to upload just 1 image to validate credentials
app.post("/test-upload", async (req, res) => {
  try {
    console.log(`🧪 Testing single image upload...`);

    // Create directory if it doesn't exist
    try {
      await fs.access(LOCAL_UPLOAD_DIR);
    } catch {
      return res.status(404).json({
        error: "Upload directory not found",
        path: LOCAL_UPLOAD_DIR,
      });
    }

    // Read all files in the directory
    const files = await fs.readdir(LOCAL_UPLOAD_DIR);
    const imageFiles = files.filter(isImageFile);

    if (imageFiles.length === 0) {
      return res.status(404).json({
        error: "No image files found",
        path: LOCAL_UPLOAD_DIR,
      });
    }

    // Take just the first image for testing
    const testFile = imageFiles[0];
    const filePath = path.join(LOCAL_UPLOAD_DIR, testFile);

    console.log(`🎯 Testing upload with: ${testFile}`);

    // Upload single test file
    const result = await uploadFileToSpaces(filePath, testFile);

    if (result.success) {
      res.json({
        success: true,
        message: "✅ Test upload successful! Credentials are working.",
        testFile: testFile,
        uploadedUrl: result.url,
        totalImagesFound: imageFiles.length,
      });
    } else {
      res.status(500).json({
        success: false,
        error: "❌ Test upload failed",
        details: result.error,
        testFile: testFile,
      });
    }
  } catch (error) {
    console.error(`❌ Test upload error:`, error);
    res.status(500).json({
      success: false,
      error: "Test upload failed",
      details: error.message,
    });
  }
});

// API endpoint to manually trigger scan and upload
app.post("/scan-upload", async (req, res) => {
  try {
    const results = await scanAndUploadAll();
    res.json({
      success: true,
      message: "Scan and upload completed",
      results,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to scan and upload",
      details: error.message,
    });
  }
});

// Initialize auto-upload functionality
const initializeAutoUpload = async () => {
  console.log(`🚀 Initializing auto-upload system...`);

  // Scan and upload existing files on startup
  await scanAndUploadAll();

  // Setup file watcher for new files
  setupFileWatcher();

  console.log(`🎯 Auto-upload system ready!`);
};

// Start server
app.listen(port, async () => {
  console.log(`Server running on port ${port}`);
  console.log(`Upload form available at http://localhost:${port}`);
  console.log(`Manual scan endpoint: http://localhost:${port}/scan-upload`);

  // Initialize auto-upload after server starts
  await initializeAutoUpload();
});

module.exports = app;
