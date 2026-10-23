const jwt = require('jsonwebtoken');
const admin = require('../firebase/firebaseAdmin');
const prisma = require('../db/db');

const optionalAuthenticateToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]; // "Bearer <token>"
  if (!token) {
    return next(); // No token = continue as guest
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
  } catch (err) {
    // Invalid token, but don't block the request
    console.warn('Invalid token provided. Proceeding as guest.');
  }

  next();
};


const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const idToken = authHeader.split(' ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Firebase UIDs allowed to create, edit and delete opportunities, organizations and
// badges, from ADMIN_UIDS (comma-separated). Read on each request so tests and a
// redeploy pick up changes. With ADMIN_UIDS unset, nobody is an admin (D-API-007).
const adminUids = () =>
  (process.env.ADMIN_UIDS || '').split(',').map((uid) => uid.trim()).filter(Boolean);

// Use after verifyFirebaseToken.
const requireAdmin = (req, res, next) => {
  if (!adminUids().includes(req.user.uid)) {
    return res.status(403).json({ error: 'Admins only' });
  }
  next();
};

// Use after verifyFirebaseToken on routes with a `:id` user param: the caller may only
// act on their own account (D-API-007).
const requireSelf = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: Number(req.params.id) },
      select: { firebaseUid: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.firebaseUid !== req.user.uid) {
      return res.status(403).json({ error: 'You can only change your own account' });
    }
    next();
  } catch (err) {
    console.error('Error checking user ownership:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  verifyFirebaseToken,
  optionalAuthenticateToken,
  requireAdmin,
  requireSelf,
};
