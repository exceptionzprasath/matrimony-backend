const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { initAwsInfrastructure } = require('./config/aws');
const authRoutes = require('./routes/auth');
const uploadRoutes = require('./routes/upload');
const profileRoutes = require('./routes/profiles');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for mobile app & admin panel
app.use(cors());

// Parse JSON and URL-encoded bodies (up to 20MB for images)
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    service: 'Matrimony AWS Backend',
    region: process.env.AWS_REGION || 'ap-south-1',
  });
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/profiles', profileRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Server Error]', err);
  res.status(500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

// Start Server & Initialize AWS
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`=========================================`);
  console.log(`🚀 Matrimony Backend Running on port ${PORT}`);
  console.log(`📍 Local:   http://localhost:${PORT}`);
  console.log(`📍 Network: http://0.0.0.0:${PORT}`);
  console.log(`☁️ AWS Region: ${process.env.AWS_REGION || 'ap-south-1'}`);
  console.log(`=========================================`);

  // Ensure DynamoDB tables and S3 bucket exist
  await initAwsInfrastructure();
});

