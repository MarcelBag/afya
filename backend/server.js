// backend/server.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const multer = require('multer');
const { exec } = require('child_process');
const fs = require('fs');
const axios = require('axios');
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

const User = require('./models/User');
const {
  ROLES,
  PERMISSIONS,
  ROLE_LABELS,
  getRolePermissions,
  canManageTargetUser,
} = require('./authentication/roles');
const {
  authMiddleware,
  requireDashboardAccess,
  requirePermission,
  requireSuperuser,
} = require('./authentication/middleware');
const { logAudit } = require('./authentication/audit');

const FLASK_BACKEND_URL = process.env.FLASK_BACKEND_URL || 'http://afya-backend:5002';
const HeaderHistory = require('./models/HeaderHistory');
const AnalysisHistory = require('./models/AnalysisHistory');
const AuditLog = require('./models/AuditLog');

const app = express();
const USER_STATUSES = ['active', 'inactive', 'suspended'];

// ----------------------------
// 1. Basic Middleware & Config
// ----------------------------
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
  : [
      'http://localhost:4000', 
      'http://localhost:4006', 
      'https://afya.tuunganes.com', 
      'http://213.130.147.166:4000', 
      'http://213.130.147.166:4006'
    ];

const corsOptions = {
  origin: (origin, callback) => {
    // allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(null, true); // Fallback to allowing everything if we're debugging prod
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Monitoring-Token'],
  credentials: true
};

app.use(cors(corsOptions));
// Global error handler for middleware (like CORS) to ensure JSON response
app.use((err, req, res, next) => {
  if (err) {
    console.error('Initial Error:', err.message);
    return res.status(err.status || 500).json({ 
      message: err.message || 'Internal Server Error',
      details: 'Error during initial request processing' 
    });
  }
  next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Mail Transporter
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT),
  secure: process.env.EMAIL_USE_TLS === 'False',
  auth: {
    user: process.env.EMAIL_HOST_USER,
    pass: process.env.EMAIL_HOST_PASSWORD,
  },
});

// Multer Setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../uploads/')),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

const getMonitoringTokenFromRequest = (req) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }

  const headerToken = req.headers['x-monitoring-token'];
  return typeof headerToken === 'string' ? headerToken.trim() : '';
};

const monitoringAuthMiddleware = (req, res, next) => {
  const configuredToken = process.env.MONITORING_SHARED_TOKEN?.trim();

  if (!configuredToken) {
    return res.status(503).json({ message: 'Monitoring token is not configured.' });
  }

  const providedToken = getMonitoringTokenFromRequest(req);
  if (!providedToken) {
    return res.status(401).json({ message: 'Monitoring token required.' });
  }

  if (providedToken !== configuredToken) {
    return res.status(403).json({ message: 'Invalid monitoring token.' });
  }

  next();
};

const VERSION = "1.1.4"; // Diagnostic ping bump

// ----------------------------
// 3. Public API Routes
// ----------------------------
app.get('/api/ping', (req, res) => {
  console.log(`[DEBUG v${VERSION}] Ping received from ${req.ip}`);
  res.json({ status: 'ok', version: VERSION, message: 'Gateway is running' });
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'afya' });
});

app.post('/api/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    let existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: 'User already exists.' });
    
    const hashedPassword = await bcrypt.hash(password, 12);
    const newUser = new User({ name, email, password: hashedPassword });
    await newUser.save();
    res.status(201).json({ message: 'User created successfully!' });
  } catch (err) {
    res.status(500).json({ message: 'Server error during signup.' });
  }
});

app.post('/api/signin', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Invalid credentials.' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials.' });

    const twoFactorCode = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(`[DEBUG v${VERSION}] Signin attempt for ${email}. Generated code: ${twoFactorCode}`);
    user.twoFactorCode = twoFactorCode;
    user.twoFactorExpires = Date.now() + 10 * 60 * 1000;
    await user.save();

    console.log(`[DEBUG v${VERSION}] User saved. Sending mail via ${process.env.EMAIL_HOST}...`);
    await transporter.sendMail({
      from: process.env.DEFAULT_FROM_EMAIL,
      to: user.email,
      subject: 'Your Afya Verification Code',
      html: `<div style="padding:20px;border:1px solid #ddd;border-radius:10px;">
               <h2>Verification Code</h2><p>Your code is: <strong>${twoFactorCode}</strong></p>
             </div>`
    });

    console.log(`[DEBUG v${VERSION}] Email sent. Response: requires2FA=true`);
    res.json({ message: 'Code sent to email.', requires2FA: true, email: user.email, version: VERSION });
  } catch (err) {
    console.error(`[CRITICAL v${VERSION}] Signin error:`, err);
    res.status(500).json({ message: 'Server error during signin.', error: err.message, version: VERSION });
  }
});

app.post('/api/verify-2fa', async (req, res) => {
  try {
    const { email, code } = req.body;
    console.log(`[DEBUG] Attempting to verify 2FA for ${email} with code ${code}`);
    
    // Find user first to debug why verification might fail
    const user = await User.findOne({ email });
    if (!user) {
      console.log(`[DEBUG] User not found for email ${email}`);
      return res.status(400).json({ message: 'Invalid or expired code.' });
    }
    
    console.log(`[DEBUG] User found. Stored code: ${user.twoFactorCode}, Expires: ${user.twoFactorExpires}, Current Time: ${new Date()}`);

    if (user.twoFactorCode !== code) {
      console.log(`[DEBUG] Code mismatch. Received: ${code}, Expected: ${user.twoFactorCode}`);
      return res.status(400).json({ message: 'Invalid or expired code.' });
    }

    if (user.twoFactorExpires < Date.now()) {
      console.log(`[DEBUG] Code expired. Expires at: ${user.twoFactorExpires}, Current time: ${new Date()}`);
      return res.status(400).json({ message: 'Invalid or expired code.' });
    }

    if (user.status !== 'active') return res.status(403).json({ message: 'Account deactivated.' });

    user.twoFactorCode = undefined;
    user.twoFactorExpires = undefined;
    if (user.email === process.env.EMAIL_HOST_USER && user.role !== ROLES.SUPERUSER) {
      user.role = ROLES.SUPERUSER;
    }
    await user.save();

    const token = jwt.sign({ userId: user._id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '12h' });
    req.currentUser = user;
    await logAudit(req, 'LOGIN', {
      resourceType: 'User',
      resourceId: String(user._id),
      details: `User signed in: ${user.email}`,
    });
    res.json({
      message: 'Successful!',
      token,
      role: user.role,
      permissions: getRolePermissions(user.role),
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error during verification.' });
  }
});

app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, message } = req.body;
    await transporter.sendMail({
      from: `"Afya Contact" <${process.env.EMAIL_HOST_USER}>`,
      to: process.env.CONTACT_EMAIL || process.env.EMAIL_HOST_USER,
      replyTo: email,
      subject: `New Contact Message from ${name}`,
      text: message
    });
    res.json({ message: 'Message sent!' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to send message.' });
  }
});

app.post('/api/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.json({ message: 'If account exists, a code was sent.' });
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    user.twoFactorCode = code;
    user.twoFactorExpires = Date.now() + 15 * 60 * 1000;
    await user.save();
    await transporter.sendMail({
        from: process.env.DEFAULT_FROM_EMAIL,
        to: user.email,
        subject: 'Afya Password Reset Code',
        text: `Your reset code is ${code}`
    });
    res.json({ message: 'Code sent.' });
  } catch (err) { res.status(500).json({ message: 'Error.' }); }
});

app.post('/api/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    const user = await User.findOne({ email, twoFactorCode: code, twoFactorExpires: { $gt: Date.now() } });
    if (!user) return res.status(400).json({ message: 'Invalid code.' });
    user.password = await bcrypt.hash(newPassword, 12);
    user.twoFactorCode = undefined;
    await user.save();
    res.json({ message: 'Password reset!' });
  } catch (err) { res.status(500).json({ message: 'Error.' }); }
});

// ----------------------------
// 4. Protected API Routes
// ----------------------------

app.post('/api/upload-image', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No image uploaded.' });
    const FormData = require('form-data');
    const formData = new FormData();
    formData.append('image', fs.createReadStream(req.file.path));
    formData.append('analysis-type', req.body['analysis-type'] || 'Unknown');

    const response = await axios.post(`${FLASK_BACKEND_URL}/api/predict`, formData, {
      headers: { ...formData.getHeaders(), 'Authorization': req.headers.authorization }
    });

    const { prediction, confidence, analysisType } = response.data;
    const imagePath = '/uploads/' + req.file.filename; 
    const history = await new AnalysisHistory({
      userId: req.user.userId,
      imagePath,
      prediction, confidence, analysisType
    }).save();

    await logAudit(req, 'ANALYSIS_CREATE', {
      resourceType: 'AnalysisHistory',
      resourceId: String(history._id),
      details: `Created ${analysisType} analysis result.`,
    });
    res.json({ prediction, confidence, analysisType, imagePath });
  } catch (error) {
    if (error.response && error.response.data && error.response.data.message) {
      console.error('Upload-image error (Flask):', error.response.data.message);
      return res.status(error.response.status).json({ message: error.response.data.message });
    }
    console.error('Upload-image error:', error.message);
    res.status(500).json({ message: 'Error analyzing image.' });
  }
});

app.post('/api/generate-headers', authMiddleware, async (req, res, next) => {
  try {
    console.log(`[DEBUG v${VERSION}] Proxying generate-headers to ${FLASK_BACKEND_URL}...`);
    const response = await axios.post(`${FLASK_BACKEND_URL}/api/generate-headers`, req.body);
    console.log(`[DEBUG v${VERSION}] Proxy Success. Status: ${response.status}`);
    const data = response.data;

    if (data.results) {
      const successful = data.results.filter(r => !r.error).map(r => ({
        userId: req.user.userId, title: r.title, imageUrl: r.image
      }));
      if (successful.length > 0) {
        const inserted = await HeaderHistory.insertMany(successful);
        await logAudit(req, 'HEADER_GENERATION_CREATE', {
          resourceType: 'HeaderHistory',
          resourceId: inserted.map((item) => String(item._id)).join(','),
          details: `Generated ${inserted.length} header image(s).`,
        });
      }
    }
    res.json(data);
  } catch (error) {
    console.error(`[DEBUG v${VERSION}] Proxy Error:`, error.message);
    if (error.response) {
      console.error(`[DEBUG v${VERSION}] Proxy Error Data:`, error.response.data);
    }
    next(error); // Pass to global error handler
  }
});

app.get('/api/header-history', authMiddleware, async (req, res) => {
  const history = await HeaderHistory.find({ userId: req.user.userId }).sort({ createdAt: -1 });
  res.json(history);
});

app.get('/api/analysis-history', authMiddleware, async (req, res) => {
  try {
    const history = await AnalysisHistory.find({ userId: req.user.userId }).sort({ createdAt: -1 });
    res.json(history);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching analysis history.' });
  }
});

app.delete('/api/header-history/:id', authMiddleware, async (req, res) => {
  const item = await HeaderHistory.findOne({ _id: req.params.id, userId: req.user.userId });
  if (!item) return res.status(404).json({ message: 'Not found' });
  if (item.imageUrl.startsWith('/uploads/')) {
    const fpath = path.join(__dirname, '..', item.imageUrl);
    if (fs.existsSync(fpath)) fs.unlinkSync(fpath);
  }
  await HeaderHistory.deleteOne({ _id: req.params.id });
  await logAudit(req, 'HEADER_HISTORY_DELETE', {
    resourceType: 'HeaderHistory',
    resourceId: String(item._id),
    details: `Deleted generated header history: ${item.title}`,
  });
  res.json({ message: 'Deleted' });
});

app.delete('/api/analysis-history/:id', authMiddleware, async (req, res) => {
  try {
    const item = await AnalysisHistory.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!item) return res.status(404).json({ message: 'Analysis not found' });
    
    // Clean up file if it exists
    if (item.imagePath) {
      const fpath = path.join(__dirname, '..', item.imagePath);
      if (fs.existsSync(fpath)) fs.unlinkSync(fpath);
    }
    
    await AnalysisHistory.deleteOne({ _id: req.params.id });
    await logAudit(req, 'ANALYSIS_HISTORY_DELETE', {
      resourceType: 'AnalysisHistory',
      resourceId: String(item._id),
      details: `Deleted analysis history: ${item.analysisType}`,
    });
    res.json({ message: 'Analysis deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting analysis.' });
  }
});

app.get('/api/user', authMiddleware, async (req, res) => {
  const user = await User.findById(req.user.userId, 'name email role status');
  res.json({
    ...user.toObject(),
    roleLabel: ROLE_LABELS[user.role],
    permissions: getRolePermissions(user.role),
  });
});

app.patch('/api/user/profile', authMiddleware, async (req, res) => {
  try {
    const { name, password } = req.body;
    const user = await User.findById(req.user.userId);
    if (name) user.name = name;
    if (password) user.password = await bcrypt.hash(password, 10);
    await user.save();
    await logAudit(req, 'PROFILE_UPDATE', {
      resourceType: 'User',
      resourceId: String(user._id),
      details: `Updated profile for ${user.email}`,
    });
    res.json({ message: 'Updated', name: user.name });
  } catch (e) { res.status(500).json({ message: 'Error' }); }
});

// ----------------------------
// 5. Admin API Routes
// ----------------------------

app.get('/api/admin/stats', authMiddleware, requireDashboardAccess, async (req, res) => {
  const stats = {
    totalUsers: await User.countDocuments(),
    totalGenerations: await HeaderHistory.countDocuments() + await AnalysisHistory.countDocuments(),
    activeUsers: await User.countDocuments({ status: 'active' }),
    inactiveUsers: await User.countDocuments({ status: { $ne: 'active' } }),
    auditEvents: await AuditLog.countDocuments(),
  };
  res.json(stats);
});

app.get('/api/admin/users', authMiddleware, requirePermission(PERMISSIONS.MANAGE_USERS), async (req, res) => {
  const users = await User.find({}, '-password -twoFactorCode').sort({ createdAt: -1 });
  res.json(users);
});

app.post('/api/admin/users', authMiddleware, requirePermission(PERMISSIONS.MANAGE_USERS), async (req, res) => {
  try {
    const { name, email, password, role = ROLES.USER } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required.' });
    }

    if (!Object.values(ROLES).includes(role)) {
      return res.status(400).json({ message: 'Invalid role.' });
    }

    if (role === ROLES.SUPERUSER && req.currentUser.role !== ROLES.SUPERUSER) {
      return res.status(403).json({ message: 'Only superusers can create superuser accounts.' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: 'User already exists.' });

    const user = await User.create({
      name,
      email,
      password: await bcrypt.hash(password, 12),
      role,
      status: 'active',
    });

    await logAudit(req, 'USER_CREATE', {
      targetUser: user._id,
      resourceType: 'User',
      resourceId: String(user._id),
      details: `Created user ${email} with ${role} role.`,
    });

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error creating user.' });
  }
});

app.get('/api/admin/history', authMiddleware, requirePermission(PERMISSIONS.VIEW_ANALYTICS), async (req, res) => {
  const hset = await HeaderHistory.find().populate('userId', 'name email').sort({ createdAt: -1 });
  const aset = await AnalysisHistory.find().populate('userId', 'name email').sort({ createdAt: -1 });
  const joint = [...hset.map(h => ({ ...h._doc, type: 'Blog Header' })), 
                 ...aset.map(a => ({ ...a._doc, type: 'Image Analysis', title: `[${a.analysisType}] ${a.prediction}` }))]
                .sort((a,b) => b.createdAt - a.createdAt);
  res.json(joint);
});

app.get('/api/admin/recycle-bin', authMiddleware, requirePermission(PERMISSIONS.MANAGE_RECYCLE_BIN), async (req, res) => {
  const inactiveUsers = await User.find({ status: { $ne: 'active' } }, '-password -twoFactorCode').sort({ createdAt: -1 });
  res.json({
    inactiveUsers,
    generatedItems: [],
  });
});

app.get('/api/admin/audit', authMiddleware, requirePermission(PERMISSIONS.VIEW_AUDIT_LOGS), async (req, res) => {
  const logs = await AuditLog.find()
    .populate('performedBy', 'name email role')
    .populate('targetUser', 'name email role')
    .sort({ timestamp: -1 })
    .limit(200);
  res.json(logs);
});

app.get('/api/admin/permissions', authMiddleware, requireDashboardAccess, async (req, res) => {
  res.json({
    role: req.currentUser.role,
    roleLabel: ROLE_LABELS[req.currentUser.role],
    permissions: getRolePermissions(req.currentUser.role),
  });
});

app.get('/api/admin/django-admin-link', authMiddleware, requireSuperuser, async (req, res) => {
  res.json({ url: process.env.DJANGO_ADMIN_URL || '/django-admin/' });
});

app.patch('/api/admin/users/:id', authMiddleware, requireSuperuser, async (req, res) => {
  const { role, status } = req.body;
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  if (role && !Object.values(ROLES).includes(role)) {
    return res.status(400).json({ message: 'Invalid role.' });
  }

  if (status && !USER_STATUSES.includes(status)) {
    return res.status(400).json({ message: 'Invalid status.' });
  }

  if (!canManageTargetUser(req.currentUser, user, role)) {
    return res.status(403).json({ message: 'This user change is not allowed.' });
  }

  const previousRole = user.role;
  const previousStatus = user.status;
  if (role) user.role = role;
  if (status) user.status = status;
  await user.save();

  await logAudit(req, 'USER_UPDATE', {
    targetUser: user._id,
    resourceType: 'User',
    resourceId: String(user._id),
    details: `Updated user ${user.email}: role ${previousRole} -> ${user.role}, status ${previousStatus} -> ${user.status}.`,
  });

  res.json(user);
});

// ----------------------------
// 6. API Error Handling & Catch-all (Must be BEFORE static serving)
// ----------------------------

// Final API catch-all (Must be after all valid /api routes)
app.all('/api/*', (req, res) => {
  res.status(404).json({ message: `API endpoint ${req.method} ${req.originalUrl} not found` });
});

// Global API Error Handler
app.use('/api', (err, req, res, next) => {
  console.error('API Error:', err.message);
  const status = err.response?.status || err.status || 500;
  res.status(status).json({
    message: 'Internal Server Error',
    details: err.isAxiosError ? (err.response?.data || err.message) : (process.env.NODE_ENV === 'development' ? err.message : undefined),
    code: 'API_ERROR'
  });
});

// ----------------------------
// 7. Static Serving & Frontend
// ----------------------------
const FRONTEND_DIR = path.join(__dirname, '../frontend');

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Serve specific static routes first
app.get('/', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')));
app.get('/verify-2fa', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'verify_2fa.html')));

// Clean URL redirect: /page.html -> /page
app.get(/^\/([a-zA-Z0-9_-]+)\.html$/, (req, res) => res.redirect(301, `/${req.params[0]}`));

// Static files with extensions support
app.use(express.static(FRONTEND_DIR, { extensions: ['html'] }));

// Final fallback for SPA (Not strictly needed here but good practice)
app.get('*', (req, res) => {
  if (req.accepts('html')) {
    res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
  } else {
    res.status(404).send('Not found');
  }
});

// ----------------------------
const PORT = process.env.PORT || 4005;
app.listen(PORT, () => {
    console.log(`[GATEWAY v${VERSION}] Listening on port ${PORT}`);
    console.log(`[GATEWAY v${VERSION}] FLASK_BACKEND_URL: ${FLASK_BACKEND_URL}`);
    console.log(`[GATEWAY v${VERSION}] MongoDB URI configured: ${!!process.env.MONGODB_URI}`);
});
