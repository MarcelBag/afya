const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
  action: {
    type: String, // e.g., 'ROLE_CHANGE', 'USER_DEACTIVATE', 'HISTORY_WIPE'
    required: true
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  targetUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  details: {
    type: String
  },
  metadata: {
    resourceType: { type: String },
    resourceId: { type: String },
    ipAddress: { type: String },
    userAgent: { type: String }
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('AuditLog', AuditLogSchema);
