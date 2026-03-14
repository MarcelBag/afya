const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const multer = require('multer'); // For handling file uploads
const { exec } = require('child_process');
const fs = require('fs');
const axios = require('axios');
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const User = require('./models/User'); // Mongoose User model
const HeaderHistory = require('./models/HeaderHistory');
const AnalysisHistory = require('./models/AnalysisHistory');
const AuditLog = require('./models/AuditLog');
const nodemailer = require('nodemailer');

const app = express();

// ----------------------------
// Role-based Middlewares
// ----------------------------
const isAdmin = (req, res, next) => {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'superuser')) {
    next();
  } else {
    res.status(403).json({ message: 'Access denied: Requires Admin privileges' });
  }
};

const isSuperuser = (req, res, next) => {
  if (req.user && req.user.role === 'superuser') {
    next();
  } else {
    res.status(403).json({ message: 'Access denied: Requires Superuser privileges' });
  }
};

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Mail Transporter Configuration
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT),
  secure: process.env.EMAIL_USE_TLS === 'False', // TLS often uses 587 and secure: false
  auth: {
    user: process.env.EMAIL_HOST_USER,
    pass: process.env.EMAIL_HOST_PASSWORD,
  },
});

// Middleware
const allowedOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',') 
  : ['http://localhost:4000', 'https://afya.tuunganes.com'];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(cors(corsOptions));

// ----------------------------
// File upload setup with multer
// ----------------------------
//const upload = multer({ dest: 'uploads/' });
// Custom storage engine using multer (do not re-require multer)
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
      // Use the original file name to preserve the extension
      cb(null, file.originalname);
    }
  });
  
  // Update the upload variable to use the custom storage
  const upload = multer({ storage });
  
// ----------------------------
// Signup Route
// ----------------------------
app.post('/api/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    let existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists. Please sign in instead.' });
    }
    const hashedPassword = await bcrypt.hash(password, 12);
    const newUser = new User({ name, email, password: hashedPassword });
    await newUser.save();
    res.status(201).json({ message: 'User created successfully!' });
  } catch (err) {
    console.error('Signup error:', err.message);
    res.status(500).json({ message: 'Server error during signup.' });
  }
});

// ----------------------------
// Contact Route
// ----------------------------
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, message } = req.body;
    if (!name || !email || !message) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    const contactEmail = process.env.CONTACT_EMAIL || process.env.EMAIL_HOST_USER;

    await transporter.sendMail({
      from: `"Afya Contact" <${process.env.EMAIL_HOST_USER}>`,
      to: contactEmail,
      replyTo: email,
      subject: `📬 New Contact Message from ${name}`,
      html: `
        <div style="font-family:'DM Sans',Arial,sans-serif;max-width:600px;margin:0 auto;background:#f7fafc;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
          <div style="background:linear-gradient(135deg,#1771c6,#2497f3);padding:32px 40px;color:#fff;">
            <h2 style="margin:0;font-size:1.6rem;">New Contact Message</h2>
            <p style="margin:6px 0 0;opacity:0.85;">From the Afya eHealth contact form</p>
          </div>
          <div style="padding:32px 40px;background:#fff;">
            <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
              <tr>
                <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;font-weight:700;color:#374151;width:120px;">Name</td>
                <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;color:#1a202c;">${name}</td>
              </tr>
              <tr>
                <td style="padding:12px 0;font-weight:700;color:#374151;">Email</td>
                <td style="padding:12px 0;"><a href="mailto:${email}" style="color:#2497f3;">${email}</a></td>
              </tr>
            </table>
            <div style="background:#f9fafb;padding:24px;border-radius:12px;border:1px solid #e5e7eb;">
              <p style="font-weight:700;color:#374151;margin:0 0 12px;text-transform:uppercase;font-size:0.8rem;letter-spacing:0.05em;">Message Content</p>
              <p style="color:#4b5563;line-height:1.7;white-space:pre-wrap;margin:0;">${message}</p>
            </div>
          </div>
        </div>
      `
    });

    res.status(200).json({ message: 'Message sent successfully!' });
  } catch (err) {
    console.error('Contact email error:', err);
    res.status(500).json({ message: 'Failed to send message.' });
  }
});

// ----------------------------
// Signin Route
// ----------------------------
// ----------------------------
app.post('/api/signin', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Invalid credentials.' });
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials.' });

    // Generate 2FA Code
    const twoFactorCode = Math.floor(100000 + Math.random() * 900000).toString();
    const twoFactorExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

    user.twoFactorCode = twoFactorCode;
    user.twoFactorExpires = twoFactorExpires;
    await user.save();

    // Send Email
    const mailOptions = {
      from: process.env.DEFAULT_FROM_EMAIL,
      to: user.email,
      subject: 'Your Afya Verification Code',
      text: `Your verification code is: ${twoFactorCode}. It will expire in 10 minutes.`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
          <h2 style="color: #2497f3;">Afya Verification Code</h2>
          <p>Hello ${user.name},</p>
          <p>Your 2FA verification code is:</p>
          <div style="font-size: 2rem; font-weight: bold; color: #1a365d; margin: 20px 0;">${twoFactorCode}</div>
          <p>This code will expire in 10 minutes.</p>
          <p>If you did not request this code, please ignore this email.</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({ 
      message: 'Verification code sent to your email.', 
      requires2FA: true,
      email: user.email 
    });
  } catch (err) {
    console.error('Signin error:', err.message);
    res.status(500).json({ message: 'Server error during signin.' });
  }
});

app.post('/api/verify-2fa', async (req, res) => {
  try {
    const { email, code } = req.body;
    const user = await User.findOne({ 
      email, 
      twoFactorCode: code, 
      twoFactorExpires: { $gt: Date.now() } 
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired verification code.' });
    }

    // Clear the code after successful verification
    user.twoFactorCode = undefined;
    user.twoFactorExpires = undefined;

    // Auto-promote EMAIL_HOST_USER to superuser
    if (user.email === process.env.EMAIL_HOST_USER && user.role !== 'superuser') {
      user.role = 'superuser';
      await new AuditLog({
        action: 'AUTO_PROMOTE_SUPERUSER',
        performedBy: user._id,
        details: `Auto-promoted ${user.email} based on EMAIL_HOST_USER env variable.`
      }).save();
    }
    
    // Check if user is active
    if (user.status !== 'active') {
      return res.status(403).json({ message: 'Account deactivated. Please contact support.' });
    }

    await user.save();

    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role }, 
      process.env.JWT_SECRET, 
      { expiresIn: '12h' }
    );

    res.status(200).json({ message: 'Verification successful!', token, role: user.role });
  } catch (err) {
    console.error('2FA verification error:', err.message);
    res.status(500).json({ message: 'Server error during 2FA verification.' });
  }
});

// ----------------------------
// Forgot Password Flow
// ----------------------------
app.post('/api/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      // Don't reveal if user exists for security, just say we sent a code if found
      return res.status(200).json({ message: 'If account exists, a code was sent.' });
    }

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.twoFactorCode = verificationCode;
    user.twoFactorExpires = Date.now() + 15 * 60 * 1000; // 15 mins
    await user.save();

    await transporter.sendMail({
      from: process.env.DEFAULT_FROM_EMAIL,
      to: user.email,
      subject: 'Afya Password Reset Code',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
          <h2 style="color: #2497f3;">Password Reset Verification</h2>
          <p>You requested to reset your password. Use the following code:</p>
          <div style="font-size: 2rem; font-weight: bold; color: #1a365d; margin: 20px 0;">${verificationCode}</div>
          <p>This code will expire in 15 minutes.</p>
        </div>
      `,
    });

    res.status(200).json({ message: 'Verification code sent to your email.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Error processing request.' });
  }
});

app.post('/api/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    const user = await User.findOne({ 
      email, 
      twoFactorCode: code, 
      twoFactorExpires: { $gt: Date.now() } 
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired verification code.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    user.password = hashedPassword;
    user.twoFactorCode = undefined;
    user.twoFactorExpires = undefined;
    await user.save();

    res.status(200).json({ message: 'Password reset successfully!' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Error resetting password.' });
  }
});

// ----------------------------
// Auth Middleware
// ----------------------------
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token, unauthorized.' });
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ message: 'Invalid or expired token.' });
    req.user = decoded; // { userId, email, role }
    next();
  });
};

// ----------------------------
// Image Upload & Prediction Route
// ----------------------------
app.post('/api/upload-image', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    const token = req.headers.authorization.split(' ')[1];
    if (!req.file) return res.status(400).json({ message: 'No image uploaded.' });
    
    // Prepare form data to forward the file to the Flask API
    const FormData = require('form-data');
    const formData = new FormData();
    formData.append('image', fs.createReadStream(req.file.path));
    formData.append('analysis-type', req.body['analysis-type'] || 'Unknown');

    // Forward request to the Flask API on port 5000
    /*
    const response = await axios.post('http://localhost:5000/predict', formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Bearer ${token}`
      }
    });
    */
    const response = await axios.post('http://afya-backend:5002/predict', formData, {
        headers: {
          ...formData.getHeaders(),
          'Authorization': `Bearer ${token}`
        }
      });
      
    const { prediction, confidence, analysisType } = response.data;

    // Save to AnalysisHistory
    await new AnalysisHistory({
      userId: req.user.userId,
      imagePath: req.file.path.replace('/usr/src/app', ''), // Relative path for serving
      prediction,
      confidence,
      analysisType
    }).save();

    res.json({ prediction, confidence, analysisType });
  } catch (error) {
    console.error('Error during image upload or prediction:', error);
    res.status(500).json({ message: 'Error analyzing the image.' });
  }
});

// ----------------------------
// Blog Header Generation Proxy
// ----------------------------
app.post('/api/generate-headers', authMiddleware, async (req, res) => {
  try {
    const response = await axios.post('http://afya-backend:5002/api/generate-headers', req.body);
    const data = response.data;

    // Save successful generations to history
    if (data.results) {
      const successfulGenerations = data.results
        .filter(r => !r.error)
        .map(r => ({
          userId: req.user.userId,
          title: r.title,
          imageUrl: r.image
        }));
      
      if (successfulGenerations.length > 0) {
        await HeaderHistory.insertMany(successfulGenerations);
      }
    }

    res.json(data);
  } catch (error) {
    console.error('Error proxying header generation request:', error.message);
    res.status(error.response?.status || 500).json({ 
      message: 'Error generating headers.', 
      details: error.response?.data || error.message 
    });
  }
});

app.get('/api/header-history', authMiddleware, async (req, res) => {
  try {
    const history = await HeaderHistory.find({ userId: req.user.userId }).sort({ createdAt: -1 });
    res.json(history);
  } catch (error) {
    console.error('Error fetching header history:', error);
    res.status(500).json({ message: 'Error fetching history' });
  }
});

app.delete('/api/header-history/:id', authMiddleware, async (req, res) => {
  try {
    const item = await HeaderHistory.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!item) return res.status(404).json({ message: 'History item not found' });

    // Delete file from disk if it's a local path
    if (item.imageUrl.startsWith('/uploads/')) {
      const filePath = path.join(__dirname, '..', item.imageUrl);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await HeaderHistory.deleteOne({ _id: req.params.id });
    res.json({ message: 'History item deleted successfully' });
  } catch (error) {
    console.error('Error deleting header history:', error);
    res.status(500).json({ message: 'Error deleting history item' });
  }
});

// ----------------------------
// Protected Routes
// ----------------------------
app.get('/api/home', authMiddleware, (req, res) => {
  res.status(200).json({ message: `Welcome to home, ${req.user.email}!` });
});

app.get('/api/user', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.status(200).json({ name: user.name, email: user.email });
  } catch (err) {
    console.error("Get user error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

app.put('/api/user', authMiddleware, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: "Name is required" });
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    user.name = name;
    await user.save();
    res.status(200).json({ message: "User updated successfully!", name: user.name });
  } catch (err) {
    console.error("Update user error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// ----------------------------
// Routes for User Management
// ----------------------------
app.get('/api/users', authMiddleware, async (req, res) => {
  try {
    const users = await User.find();
    res.status(200).json(users);
  } catch (err) {
    console.error('Error fetching users:', err.message);
    res.status(500).json({ message: 'Server error fetching users.' });
  }
});

app.put('/api/users/:id', authMiddleware, async (req, res) => {
  try {
    const { name, email } = req.body;
    const userId = req.params.id;
    if (!name || !email) return res.status(400).json({ message: 'Name and email are required' });
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.name = name;
    user.email = email;
    await user.save();
    res.status(200).json({ message: 'User updated successfully!' });
  } catch (err) {
    console.error('Error updating user:', err.message);
    res.status(500).json({ message: 'Server error updating user.' });
  }
});

app.delete('/api/users/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findByIdAndDelete(userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.status(200).json({ message: 'User deleted successfully!' });
  } catch (err) {
    console.error('Delete user error:', err.message);
    res.status(500).json({ message: 'Server error deleting user.' });
  }
});

// ----------------------------
// Serve Frontend Pages
// ----------------------------
/**  app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});
app.get('/signin', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/signin.html'));
});
app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/signup.html'));
});
app.get('/home', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/home.html'));
});
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/admin.html'));
});
// Serve  under /frontend and auto-append .html when missing
app.use(express.static(path.join(__dirname, '../frontend'), {
  extensions: ['html']
})); */
// ----------------------------
// Serve Front-end
// ----------------------------
const FRONTEND_DIR = path.join(__dirname, '../frontend');

/* Root URL → index.html */
app.get('/', (req, res) =>
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'))
);

/* Redirect /page.html → /page (must come BEFORE static) */
app.get(/^\/([a-zA-Z0-9_-]+)\.html$/, (req, res) => {
  res.redirect(301, `/${req.params[0]}`);
});

app.get('/verify-2fa', (req, res) =>
  res.sendFile(path.join(FRONTEND_DIR, 'verify_2fa.html'))
);

/* Static handler with .html fallback */
app.use(
  express.static(FRONTEND_DIR, {
    extensions: ['html'], // /about → about.html
  })
);

/* Serve Uploads statically */
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

/* ----------------------------
   Start server
---------------------------- */
const PORT = process.env.PORT || 4000;
app.listen(PORT, () =>
  console.log(`Server running at http://localhost:${PORT}`)
);

// ----------------------------
// Admin APIs
// ----------------------------

// Get all users (Admin only)
app.get('/api/admin/users', authMiddleware, isAdmin, async (req, res) => {
  try {
    const users = await User.find({}, '-password -twoFactorCode');
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching users' });
  }
});

// Add New User (Superuser only)
app.post('/api/admin/users', authMiddleware, isSuperuser, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      role: role || 'user',
      status: 'active'
    });

    await newUser.save();

    await new AuditLog({
      action: 'USER_CREATED',
      performedBy: req.user.userId,
      targetUser: newUser._id,
      details: `Manually created user ${email} with role ${role || 'user'}.`
    }).save();

    res.status(201).json({ message: 'User created successfully', user: { name, email, role: newUser.role } });
  } catch (error) {
    res.status(500).json({ message: 'Error creating user' });
  }
});

// Update User Role/Status (Superuser only)
app.patch('/api/admin/users/:id', authMiddleware, isSuperuser, async (req, res) => {
  try {
    const { role, status } = req.body;
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) return res.status(404).json({ message: 'User not found' });

    const oldRole = targetUser.role;
    const oldStatus = targetUser.status;

    if (role) targetUser.role = role;
    if (status) targetUser.status = status;
    await targetUser.save();

    await new AuditLog({
      action: 'USER_UPDATE',
      performedBy: req.user.userId,
      targetUser: targetUser._id,
      details: `Changed role from ${oldRole} to ${role || oldRole}, status from ${oldStatus} to ${status || oldStatus}.`
    }).save();

    res.json(targetUser);
  } catch (error) {
    res.status(500).json({ message: 'Error updating user' });
  }
});

// Get Global AI Creation History (Admin only)
app.get('/api/admin/history', authMiddleware, isAdmin, async (req, res) => {
  try {
    const headers = await HeaderHistory.find().populate('userId', 'name email').sort({ createdAt: -1 });
    const analysis = await AnalysisHistory.find().populate('userId', 'name email').sort({ createdAt: -1 });
    
    // Combine and sort
    const unifiedHistory = [
      ...headers.map(h => ({ ...h._doc, type: 'Blog Header' })),
      ...analysis.map(a => ({ ...a._doc, type: 'Image Analysis', title: `[${a.analysisType}] ${a.prediction}` }))
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json(unifiedHistory);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching global history' });
  }
});

// Update Own Profile
app.patch('/api/user/profile', authMiddleware, async (req, res) => {
  try {
    const { name, password } = req.body;
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (name) user.name = name;
    if (password) {
      user.password = await bcrypt.hash(password, 10);
    }
    
    await user.save();
    res.json({ message: 'Profile updated successfully', name: user.name });
  } catch (error) {
    res.status(500).json({ message: 'Error updating profile' });
  }
});

// Get Audit Logs (Superuser only)
app.get('/api/admin/audit', authMiddleware, isSuperuser, async (req, res) => {
  try {
    const logs = await AuditLog.find()
      .populate('performedBy', 'name email')
      .populate('targetUser', 'name email')
      .sort({ timestamp: -1 })
      .limit(100);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching audit logs' });
  }
});

// Admin Stats
app.get('/api/admin/stats', authMiddleware, isAdmin, async (req, res) => {
  try {
    const userCount = await User.countDocuments();
    const headerCount = await HeaderHistory.countDocuments();
    const analysisCount = await AnalysisHistory.countDocuments();
    const activeUsers = await User.countDocuments({ status: 'active' });

    res.json({
      totalUsers: userCount,
      totalGenerations: headerCount + analysisCount,
      activeUsers: activeUsers
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching stats' });
  }
});
