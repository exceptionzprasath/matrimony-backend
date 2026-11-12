const express = require('express');
const router = express.Router();
const { ScanCommand, GetCommand, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient, PROFILES_TABLE } = require('../config/aws');
const { authenticateToken } = require('../middleware/auth');

/**
 * GET /api/profiles
 * List all profiles from AWS DynamoDB
 */
router.get('/', async (req, res) => {
  try {
    const { gender } = req.query;
    let params = { TableName: PROFILES_TABLE };

    if (gender) {
      params.FilterExpression = 'gender = :gender';
      params.ExpressionAttributeValues = { ':gender': gender };
    }

    const result = await docClient.send(new ScanCommand(params));
    return res.json({
      success: true,
      count: result.Items ? result.Items.length : 0,
      profiles: result.Items || [],
    });
  } catch (error) {
    console.error('[Get Profiles Error]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/profiles/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const result = await docClient.send(
      new GetCommand({
        TableName: PROFILES_TABLE,
        Key: { id: req.params.id },
      })
    );

    if (!result.Item) {
      return res.status(404).json({ success: false, message: 'Profile not found' });
    }

    return res.json({ success: true, profile: result.Item });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /api/profiles/:id
 */
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const profileId = req.params.id;
    const existing = await docClient.send(
      new GetCommand({
        TableName: PROFILES_TABLE,
        Key: { id: profileId },
      })
    );

    if (!existing.Item) {
      return res.status(404).json({ success: false, message: 'Profile not found' });
    }

    const updatedProfile = {
      ...existing.Item,
      ...req.body,
      id: profileId,
      updatedAt: new Date().toISOString(),
    };

    await docClient.send(
      new PutCommand({
        TableName: PROFILES_TABLE,
        Item: updatedProfile,
      })
    );

    return res.json({ success: true, profile: updatedProfile });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

