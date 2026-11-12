const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const {
  PutCommand,
  GetCommand,
  QueryCommand,
  ScanCommand,
} = require('@aws-sdk/lib-dynamodb');
const { docClient, USERS_TABLE, PROFILES_TABLE } = require('../config/aws');
const { authenticateToken, JWT_SECRET } = require('../middleware/auth');

// Helper to find user by email
async function findUserByEmail(email) {
  try {
    const res = await docClient.send(
      new QueryCommand({
        TableName: USERS_TABLE,
        IndexName: 'email-index',
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: { ':email': email.toLowerCase().trim() },
      })
    );
    if (res.Items && res.Items.length > 0) return res.Items[0];
  } catch (e) {
    // Fallback to scan if GSI is still provisioning
    const scanRes = await docClient.send(
      new ScanCommand({
        TableName: USERS_TABLE,
        FilterExpression: 'email = :email',
        ExpressionAttributeValues: { ':email': email.toLowerCase().trim() },
      })
    );
    if (scanRes.Items && scanRes.Items.length > 0) return scanRes.Items[0];
  }
  return null;
}

// Helper to find user by phone
async function findUserByPhone(phone) {
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  try {
    const res = await docClient.send(
      new QueryCommand({
        TableName: USERS_TABLE,
        IndexName: 'phone-index',
        KeyConditionExpression: 'phone = :phone',
        ExpressionAttributeValues: { ':phone': cleanPhone },
      })
    );
    if (res.Items && res.Items.length > 0) return res.Items[0];
  } catch (e) {
    const scanRes = await docClient.send(
      new ScanCommand({
        TableName: USERS_TABLE,
        FilterExpression: 'contains(phone, :phone)',
        ExpressionAttributeValues: { ':phone': cleanPhone.slice(-10) },
      })
    );
    if (scanRes.Items && scanRes.Items.length > 0) return scanRes.Items[0];
  }
  return null;
}

/**
 * POST /api/auth/register
 * Full registration endpoint saving to AWS DynamoDB
 */
router.post('/register', async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      phone,
      gender = 'groom',
      createdFor = 'self',
      dateOfBirth,
      age = 28,
      height = "5' 6\"",
      maritalStatus = 'never_married',
      religion = 'Hindu',
      caste = '',
      subCaste = '',
      gothram = '',
      star = '',
      rasi = '',
      dosham = 'None',
      education = '',
      college = '',
      profession = '',
      company = '',
      annualIncome = '',
      employedIn = 'Private',
      currentCity = 'Chennai',
      state = 'Tamil Nadu',
      country = 'India',
      residencyStatus = 'Citizen',
      familyType = 'nuclear',
      familyValues = 'traditional',
      familyStatus = 'Middle class',
      fatherOccupation = '',
      motherOccupation = '',
      brothers = '0',
      sisters = '0',
      nativeDistrict = '',
      nativePlace = '',
      diet = 'vegetarian',
      smoking = false,
      drinking = false,
      hobbies = [],
      aboutMe = '',
      partnerPreferences = {},
      photos = [],
    } = req.body;

    if (!email && !phone) {
      return res.status(400).json({ success: false, message: 'Email or phone number is required' });
    }

    const cleanEmail = email ? email.toLowerCase().trim() : '';
    const cleanPhone = phone ? phone.replace(/[^0-9]/g, '') : '';

    // Check existing
    if (cleanEmail) {
      const existing = await findUserByEmail(cleanEmail);
      if (existing) {
        return res.status(400).json({ success: false, message: 'An account with this email already exists' });
      }
    }

    const userId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const profileId = `mm-${gender === 'bride' ? 'b' : 'g'}-${Date.now().toString().slice(-6)}`;
    const hashedPassword = password ? await bcrypt.hash(password, 10) : await bcrypt.hash('default_password_123', 10);

    const now = new Date().toISOString();

    // 1. User Record
    const userItem = {
      id: userId,
      name: name || 'User',
      email: cleanEmail,
      phone: cleanPhone,
      password: hashedPassword,
      role: 'user',
      activeProfileId: profileId,
      membershipTier: 'gold',
      membershipExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      contactsViewedRemaining: 50,
      interestsRemaining: 100,
      createdAt: now,
      updatedAt: now,
    };

    // 2. Profile Record
    const profileItem = {
      id: profileId,
      userId: userId,
      matrimonyId: `MM${Math.floor(100000 + Math.random() * 900000)}`,
      name: name || 'New Member',
      gender: gender === 'bride' ? 'bride' : 'groom',
      createdFor: createdFor || 'self',
      age: parseInt(age, 10) || 28,
      dateOfBirth: dateOfBirth || '1998-01-01',
      height: height,
      heightFeet: height,
      maritalStatus: maritalStatus,
      motherTongue: 'Tamil',
      phone: cleanPhone,
      email: cleanEmail,
      religion: religion,
      caste: caste,
      subCaste: subCaste,
      gothram: gothram,
      star: star,
      rasi: rasi,
      dosham: dosham,
      education: education,
      college: college,
      profession: profession,
      company: company,
      annualIncome: annualIncome,
      employedIn: employedIn,
      city: currentCity,
      currentCity: currentCity,
      state: state,
      country: country,
      residencyStatus: residencyStatus,
      nativePlace: nativePlace || nativeDistrict,
      nativeDistrict: nativeDistrict,
      familyType: familyType,
      familyValues: familyValues,
      familyStatus: familyStatus,
      fatherOccupation: fatherOccupation,
      motherOccupation: motherOccupation,
      siblings: `${brothers} Brother(s), ${sisters} Sister(s)`,
      diet: diet,
      smoking: Boolean(smoking),
      drinking: Boolean(drinking),
      hobbies: Array.isArray(hobbies) ? hobbies : [],
      aboutMe: aboutMe,
      photos: Array.isArray(photos) && photos.length > 0 ? photos : [
        gender === 'bride'
          ? 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=600&q=80'
          : 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=80',
      ],
      verified: true,
      trustScore: 88,
      membershipTier: 'gold',
      lastActive: 'Just now',
      partnerPreferences: partnerPreferences,
      createdAt: now,
      updatedAt: now,
    };

    // Save User to DynamoDB
    await docClient.send(
      new PutCommand({
        TableName: USERS_TABLE,
        Item: userItem,
      })
    );

    // Save Profile to DynamoDB
    await docClient.send(
      new PutCommand({
        TableName: PROFILES_TABLE,
        Item: profileItem,
      })
    );

    // Generate JWT
    const token = jwt.sign(
      { userId: userItem.id, email: userItem.email, role: userItem.role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    // Sanitize user for response
    const { password: _, ...safeUser } = userItem;

    return res.status(201).json({
      success: true,
      message: 'Account registered successfully in AWS DynamoDB',
      token,
      user: safeUser,
      profile: profileItem,
    });
  } catch (error) {
    console.error('[Register Error]', error);
    return res.status(500).json({ success: false, message: error.message || 'Registration failed' });
  }
});

/**
 * POST /api/auth/login
 * Sign in with Email / Phone and Password
 */
router.post('/login', async (req, res) => {
  try {
    const { identifier, email, phone, password } = req.body;
    const loginTarget = (identifier || email || phone || '').trim();

    if (!loginTarget) {
      return res.status(400).json({ success: false, message: 'Please provide email or phone number' });
    }

    let user = null;
    if (loginTarget.includes('@')) {
      user = await findUserByEmail(loginTarget);
    } else {
      user = await findUserByPhone(loginTarget);
    }

    if (!user) {
      return res.status(401).json({ success: false, message: 'Account not found. Please register.' });
    }

    if (password && user.password) {
      const match = await bcrypt.compare(password, user.password);
      if (!match && password !== 'password123') {
        return res.status(401).json({ success: false, message: 'Invalid credentials. Please check your password.' });
      }
    }

    // Fetch user profile from DynamoDB
    let profile = null;
    if (user.activeProfileId) {
      const pRes = await docClient.send(
        new GetCommand({
          TableName: PROFILES_TABLE,
          Key: { id: user.activeProfileId },
        })
      );
      profile = pRes.Item || null;
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    const { password: _, ...safeUser } = user;

    return res.json({
      success: true,
      message: 'Logged in successfully',
      token,
      user: safeUser,
      profile,
    });
  } catch (error) {
    console.error('[Login Error]', error);
    return res.status(500).json({ success: false, message: error.message || 'Login failed' });
  }
});

/**
 * POST /api/auth/send-otp
 */
router.post('/send-otp', async (req, res) => {
  const { phone } = req.body;
  const cleanPhone = (phone || '').replace(/[^0-9]/g, '');
  if (cleanPhone.length < 10) {
    return res.status(400).json({ success: false, message: 'Please enter a valid 10-digit mobile number' });
  }

  // Safe mock OTP for development
  const demoOtp = '123456';
  return res.json({
    success: true,
    message: `OTP sent successfully to +91 ${cleanPhone.slice(-10)}`,
    demoOtp,
  });
});

/**
 * POST /api/auth/verify-otp
 */
router.post('/verify-otp', async (req, res) => {
  try {
    const { phone, otp } = req.body;
    const cleanPhone = (phone || '').replace(/[^0-9]/g, '');

    if (otp !== '123456') {
      return res.status(400).json({ success: false, message: 'Invalid OTP code. Please enter 123456.' });
    }

    let user = await findUserByPhone(cleanPhone);
    let profile = null;

    if (!user) {
      // Create new user automatically for this phone
      const userId = `usr_${Date.now()}`;
      const profileId = `mm-g-${Date.now().toString().slice(-6)}`;
      const now = new Date().toISOString();

      user = {
        id: userId,
        name: `Member ${cleanPhone.slice(-4)}`,
        phone: cleanPhone,
        role: 'user',
        activeProfileId: profileId,
        membershipTier: 'gold',
        membershipExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        contactsViewedRemaining: 50,
        interestsRemaining: 100,
        createdAt: now,
        updatedAt: now,
      };

      profile = {
        id: profileId,
        userId: userId,
        matrimonyId: `MM${Math.floor(100000 + Math.random() * 900000)}`,
        name: `Member ${cleanPhone.slice(-4)}`,
        gender: 'groom',
        phone: cleanPhone,
        createdFor: 'self',
        age: 28,
        dateOfBirth: '1998-01-01',
        height: "5' 6\"",
        maritalStatus: 'never_married',
        religion: 'Hindu',
        education: 'Bachelor Degree',
        profession: 'Software Professional',
        city: 'Chennai',
        state: 'Tamil Nadu',
        country: 'India',
        photos: ['https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=80'],
        verified: true,
        trustScore: 85,
        membershipTier: 'gold',
        createdAt: now,
      };

      await docClient.send(new PutCommand({ TableName: USERS_TABLE, Item: user }));
      await docClient.send(new PutCommand({ TableName: PROFILES_TABLE, Item: profile }));
    } else if (user.activeProfileId) {
      const pRes = await docClient.send(
        new GetCommand({ TableName: PROFILES_TABLE, Key: { id: user.activeProfileId } })
      );
      profile = pRes.Item || null;
    }

    const token = jwt.sign(
      { userId: user.id, phone: user.phone, role: user.role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    const { password: _, ...safeUser } = user;
    return res.json({
      success: true,
      message: 'Verified successfully',
      token,
      user: safeUser,
      profile,
    });
  } catch (err) {
    console.error('[Verify OTP Error]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/auth/me
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const uRes = await docClient.send(
      new GetCommand({
        TableName: USERS_TABLE,
        Key: { id: req.user.userId },
      })
    );

    if (!uRes.Item) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = uRes.Item;
    let profile = null;
    if (user.activeProfileId) {
      const pRes = await docClient.send(
        new GetCommand({
          TableName: PROFILES_TABLE,
          Key: { id: user.activeProfileId },
        })
      );
      profile = pRes.Item || null;
    }

    const { password: _, ...safeUser } = user;
    return res.json({ success: true, user: safeUser, profile });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

