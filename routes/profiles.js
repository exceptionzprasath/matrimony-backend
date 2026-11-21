const express = require('express');
const router = express.Router();
const {
  ScanCommand,
  GetCommand,
  PutCommand,
  DeleteCommand,
} = require('@aws-sdk/lib-dynamodb');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { docClient, s3Client, PROFILES_TABLE, USERS_TABLE, S3_BUCKET } = require('../config/aws');

/**
 * Helper to sign S3 photo URLs so images load even when S3 BlockPublicAccess is enabled,
 * and normalize all profile fields for both the Mobile App and Admin Panel.
 */
async function normalizeAndSignProfile(item) {
  if (!item) return null;

  const rawPhotos = Array.isArray(item.photos) && item.photos.length > 0
    ? item.photos.filter(Boolean)
    : [];

  const signedPhotos = await Promise.all(
    rawPhotos.map(async (photoUrl) => {
      if (typeof photoUrl !== 'string') return photoUrl;
      try {
        // Check if this is an S3 URL for our bucket
        if (photoUrl.includes('.amazonaws.com/') && !photoUrl.includes('X-Amz-Signature')) {
          const urlObj = new URL(photoUrl);
          const key = decodeURIComponent(urlObj.pathname.replace(/^\/+/, ''));
          if (key) {
            const command = new GetObjectCommand({
              Bucket: S3_BUCKET,
              Key: key,
            });
            return await getSignedUrl(s3Client, command, { expiresIn: 604800 }); // 7 days
          }
        }
      } catch (err) {
        console.warn('[S3 Presign Warning]', err.message);
      }
      return photoUrl;
    })
  );

  // Determine status & verification state accurately
  const status = item.status || (item.isVerified === true ? 'approved' : 'pending');
  const isVerified = status === 'approved' || status === 'active' || item.isVerified === true;

  return {
    ...item,
    matrimonyId: item.matrimonyId || `MM-${(item.id || '').slice(-6).toUpperCase()}`,
    name: item.name || 'Unnamed Member',
    gender: item.gender === 'bride' || item.gender === 'female' ? 'bride' : 'groom',
    age: Number(item.age) || 26,
    currentCity: item.currentCity || item.city || 'Chennai',
    nativeDistrict: item.nativeDistrict || item.nativePlace || item.currentCity || 'Tamil Nadu',
    caste: item.caste || item.community || 'Not specified',
    subCaste: item.subCaste || item.subCommunity || '',
    education: item.education || item.educationCareer?.qualification || 'Not specified',
    college: item.college || item.educationCareer?.institution || '',
    occupation: item.occupation || item.profession || item.educationCareer?.occupation || 'Not specified',
    employer: item.employer || item.company || item.educationCareer?.employer || '',
    annualIncome: item.annualIncome || item.educationCareer?.annualIncome || 'Not specified',
    about: item.about || item.aboutMe || `${item.name || 'Candidate'} is looking for a compatible life partner.`,
    photos: signedPhotos.length > 0 ? signedPhotos : [
      item.gender === 'bride'
        ? 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=600&q=80'
        : 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=80',
    ],
    rawPhotos: rawPhotos,
    status,
    isVerified,
    verified: isVerified,
    verificationDocType:
      item.verificationDocType ||
      (status === 'approved'
        ? 'Aadhaar Card (UIDAI Verified)'
        : status === 'rejected'
        ? 'Verification Rejected'
        : status === 'suspended'
        ? 'Profile Suspended'
        : 'Aadhaar e-KYC Pending Review'),
    membershipTier: item.membershipTier || 'gold',
    horoscope: {
      rasi: item.horoscope?.rasi || item.rasi || 'Not specified',
      nakshatram: item.horoscope?.nakshatram || item.star || 'Not specified',
      lagnam: item.horoscope?.lagnam || item.gothram || 'Not specified',
      gothram: item.horoscope?.gothram || item.gothram || 'Not specified',
      dosham: item.horoscope?.dosham || item.dosham || 'No Dosham',
      chevvaiDosham: Boolean(
        item.horoscope?.chevvaiDosham ||
          item.dosham === 'Chevvai dosham' ||
          item.dosham === 'Yes'
      ),
    },
    family: {
      fatherName: item.family?.fatherName || 'Father',
      fatherOccupation: item.family?.fatherOccupation || item.fatherOccupation || 'Not specified',
      motherName: item.family?.motherName || 'Mother',
      motherOccupation: item.family?.motherOccupation || item.motherOccupation || 'Not specified',
      familyStatus: item.family?.familyStatus || item.familyStatus || 'Middle Class',
      familyType: item.family?.familyType || item.familyType || 'Nuclear',
      familyValues: item.family?.familyValues || item.familyValues || 'Traditional',
      siblings: item.family?.siblings || item.siblings || 'Not specified',
    },
  };
}

/**
 * GET /api/profiles
 * List all profiles from AWS DynamoDB
 */
router.get('/', async (req, res) => {
  try {
    const { gender, status } = req.query;
    const params = { TableName: PROFILES_TABLE };

    if (gender) {
      params.FilterExpression = 'gender = :gender';
      params.ExpressionAttributeValues = { ':gender': gender };
    }

    const result = await docClient.send(new ScanCommand(params));
    const items = result.Items || [];

    // Sort newest first
    items.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });

    const normalized = await Promise.all(items.map(normalizeAndSignProfile));
    const filtered = status
      ? normalized.filter((p) => p.status === status)
      : normalized;

    return res.json({
      success: true,
      count: filtered.length,
      profiles: filtered,
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

    const profile = await normalizeAndSignProfile(result.Item);
    return res.json({ success: true, profile });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/profiles
 * Create a new profile from Admin Panel
 */
router.post('/', async (req, res) => {
  try {
    const now = new Date().toISOString();
    const gender = req.body.gender === 'groom' ? 'groom' : 'bride';
    const profileId = req.body.id || `mm-${gender === 'bride' ? 'b' : 'g'}-${Date.now().toString().slice(-6)}`;

    const newProfile = {
      ...req.body,
      id: profileId,
      matrimonyId: req.body.matrimonyId || `MM${Math.floor(100000 + Math.random() * 900000)}`,
      status: req.body.status || 'pending',
      isVerified: Boolean(req.body.isVerified),
      verified: Boolean(req.body.isVerified),
      createdAt: now,
      updatedAt: now,
    };

    await docClient.send(
      new PutCommand({
        TableName: PROFILES_TABLE,
        Item: newProfile,
      })
    );

    const normalized = await normalizeAndSignProfile(newProfile);
    return res.status(201).json({
      success: true,
      message: 'Profile created in DynamoDB',
      profile: normalized,
    });
  } catch (error) {
    console.error('[Create Profile Error]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PATCH /api/profiles/:id/status
 * Admin Moderation: Approve, Reject, or Suspend a profile
 */
router.patch('/:id/status', async (req, res) => {
  try {
    const profileId = req.params.id;
    const { action, status, reason } = req.body;

    const existing = await docClient.send(
      new GetCommand({
        TableName: PROFILES_TABLE,
        Key: { id: profileId },
      })
    );

    if (!existing.Item) {
      return res.status(404).json({ success: false, message: 'Profile not found in database' });
    }

    const targetAction = (action || status || '').toLowerCase();
    let updatedFields = {};

    if (targetAction === 'approve' || targetAction === 'approved' || targetAction === 'active') {
      updatedFields = {
        status: 'approved',
        isVerified: true,
        verified: true,
        verificationDocType: 'Aadhaar Card (UIDAI Verified)',
        rejectionReason: null,
      };
    } else if (targetAction === 'reject' || targetAction === 'rejected') {
      updatedFields = {
        status: 'rejected',
        isVerified: false,
        verified: false,
        verificationDocType: 'Verification Rejected',
        rejectionReason: reason || 'Profile verification rejected by moderator',
      };
    } else if (targetAction === 'suspend' || targetAction === 'suspended') {
      updatedFields = {
        status: 'suspended',
        isVerified: false,
        verified: false,
        verificationDocType: 'Profile Suspended',
        suspensionReason: reason || 'Suspended due to policy violation',
      };
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid moderation action. Use approve, reject, or suspend.',
      });
    }

    const updatedItem = {
      ...existing.Item,
      ...updatedFields,
      // Keep original raw S3 URLs rather than overwriting with temporary presigned URLs
      photos: existing.Item.rawPhotos || existing.Item.photos,
      moderatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await docClient.send(
      new PutCommand({
        TableName: PROFILES_TABLE,
        Item: updatedItem,
      })
    );

    // Also sync moderation status to MatrimonyUsers table if userId is linked
    if (existing.Item.userId) {
      try {
        const userRes = await docClient.send(
          new GetCommand({
            TableName: USERS_TABLE,
            Key: { id: existing.Item.userId },
          })
        );
        if (userRes.Item) {
          await docClient.send(
            new PutCommand({
              TableName: USERS_TABLE,
              Item: {
                ...userRes.Item,
                status: updatedFields.status,
                isVerified: updatedFields.isVerified,
                updatedAt: new Date().toISOString(),
              },
            })
          );
        }
      } catch (uErr) {
        console.warn('[Sync User Status Warning]', uErr.message);
      }
    }

    const normalized = await normalizeAndSignProfile(updatedItem);
    return res.json({
      success: true,
      message: `Profile ${updatedFields.status} successfully`,
      profile: normalized,
    });
  } catch (error) {
    console.error('[Moderate Profile Error]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /api/profiles/:id
 * Full or partial update of a profile
 */
router.put('/:id', async (req, res) => {
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
      photos: req.body.rawPhotos || req.body.photos || existing.Item.photos,
      updatedAt: new Date().toISOString(),
    };

    await docClient.send(
      new PutCommand({
        TableName: PROFILES_TABLE,
        Item: updatedProfile,
      })
    );

    const normalized = await normalizeAndSignProfile(updatedProfile);
    return res.json({ success: true, profile: normalized });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /api/profiles/:id
 * Permanently delete profile (and linked user record) from AWS DynamoDB
 */
router.delete('/:id', async (req, res) => {
  try {
    const profileId = req.params.id;
    const existing = await docClient.send(
      new GetCommand({
        TableName: PROFILES_TABLE,
        Key: { id: profileId },
      })
    );

    if (!existing.Item) {
      return res.status(404).json({ success: false, message: 'Profile not found in database' });
    }

    // Delete from MatrimonyProfiles table
    await docClient.send(
      new DeleteCommand({
        TableName: PROFILES_TABLE,
        Key: { id: profileId },
      })
    );

    // If profile has a linked userId in MatrimonyUsers, delete user account too
    if (existing.Item.userId) {
      try {
        await docClient.send(
          new DeleteCommand({
            TableName: USERS_TABLE,
            Key: { id: existing.Item.userId },
          })
        );
      } catch (uErr) {
        console.warn('[Delete Linked User Warning]', uErr.message);
      }
    }

    return res.json({
      success: true,
      message: 'Profile deleted permanently from database',
      deletedId: profileId,
    });
  } catch (error) {
    console.error('[Delete Profile Error]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
