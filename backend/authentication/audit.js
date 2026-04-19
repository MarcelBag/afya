const AuditLog = require('../models/AuditLog');

async function logAudit(req, action, options = {}) {
  const actor = req.currentUser || req.userRecord || null;

  if (!actor || !action) return;

  try {
    await AuditLog.create({
      action,
      performedBy: actor._id,
      targetUser: options.targetUser || undefined,
      details: options.details || '',
      metadata: {
        resourceType: options.resourceType,
        resourceId: options.resourceId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    });
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
}

module.exports = { logAudit };
