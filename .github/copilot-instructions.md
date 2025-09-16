# DigitalOcean Spaces Image Upload Project

This is a Node.js project for uploading images to DigitalOcean Spaces using the AWS S3-compatible API.

## Project Overview

- **Language**: JavaScript/Node.js
- **Framework**: Express.js for web server
- **Storage**: DigitalOcean Spaces (S3-compatible)
- **Dependencies**: AWS SDK v3, multer for file uploads

## Development Guidelines

- Use ES6+ syntax and async/await for asynchronous operations
- Follow RESTful API design patterns
- Include proper error handling for file uploads
- Implement environment variable configuration for sensitive data
- Use proper CORS configuration for web uploads

## Key Features

- Image file upload endpoint
- File validation (type, size limits)
- Direct upload to DigitalOcean Spaces
- Public URL generation for uploaded images
- Error handling and validation

## Environment Variables Required

- `DO_SPACES_KEY`: DigitalOcean Spaces access key
- `DO_SPACES_SECRET`: DigitalOcean Spaces secret key
- `DO_SPACES_ENDPOINT`: DigitalOcean Spaces endpoint URL
- `DO_SPACES_BUCKET`: DigitalOcean Spaces bucket name
- `DO_SPACES_REGION`: DigitalOcean Spaces region
