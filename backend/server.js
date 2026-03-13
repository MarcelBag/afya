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
const nodemailer = require('nodemailer');

const app = express();

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
app.use(cors());
app.use(bodyParser.json());
//app.use(express.static(path.join(__dirname, '../frontend')));

const corsOptions = {
  origin: ['http://localhost:4000', 'https://afya.tuunganes.com'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
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
// Signin Route
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
    await user.save();

    const token = jwt.sign(
      { userId: user._id, email: user.email }, 
      process.env.JWT_SECRET, 
      { expiresIn: '1h' }
    );

    res.status(200).json({ message: 'Verification successful!', token });
  } catch (err) {
    console.error('2FA verification error:', err.message);
    res.status(500).json({ message: 'Server error during 2FA verification.' });
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
    req.user = decoded;
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
    const response = await axios.post('http://afya-backend:5001/predict', formData, {
        headers: {
          ...formData.getHeaders(),
          'Authorization': `Bearer ${token}`
        }
      });
      
    const { prediction, confidence, analysisType } = response.data;
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
    const response = await axios.post('http://afya-backend:5001/api/generate-headers', req.body);
    res.json(response.data);
  } catch (error) {
    console.error('Error proxying header generation request:', error.message);
    res.status(error.response?.status || 500).json({ 
      message: 'Error generating headers.', 
      details: error.response?.data || error.message 
    });
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

/* ----------------------------
   Start server
---------------------------- */
const PORT = process.env.PORT || 4000;
app.listen(PORT, () =>
  console.log(`Server running at http://localhost:${PORT}`)
);
