const express = require('express');
const router = express.Router();
const multer = require('multer');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { s3Client, S3_BUCKET } = require('../config/aws');
const { v4: uuidv4 } = require('uuid');

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images are allowed'));
    }
  },
});

/**
 * POST /api/upload
 * Direct file upload to AWS S3 bucket
 */
router.post('/', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image file uploaded' });
    }

    const fileExt = req.file.originalname.split('.').pop() || 'jpg';
    const key = `profiles/${Date.now()}_${uuidv4()}.${fileExt}`;

    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    });

    await s3Client.send(command);

    const region = process.env.AWS_REGION || 'ap-south-1';
    const fileUrl = `https://${S3_BUCKET}.s3.${region}.amazonaws.com/${key}`;

    return res.json({
      success: true,
      message: 'Photo uploaded to AWS S3 successfully',
      url: fileUrl,
      key,
    });
  } catch (error) {
    console.error('[S3 Upload Error]', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to upload photo to S3',
    });
  }
});

/**
 * POST /api/upload/base64
 * Upload base64 encoded photo to AWS S3
 */
router.post('/base64', async (req, res) => {
  try {
    const { base64, contentType = 'image/jpeg' } = req.body;
    if (!base64) {
      return res.status(400).json({ success: false, message: 'Base64 image string is required' });
    }

    const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    const ext = contentType.split('/')[1] || 'jpg';
    const key = `profiles/${Date.now()}_${uuidv4()}.${ext}`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );

    const region = process.env.AWS_REGION || 'ap-south-1';
    const fileUrl = `https://${S3_BUCKET}.s3.${region}.amazonaws.com/${key}`;

    return res.json({
      success: true,
      url: fileUrl,
      key,
    });
  } catch (error) {
    console.error('[S3 Base64 Upload Error]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

