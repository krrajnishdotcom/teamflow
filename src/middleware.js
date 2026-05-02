'use strict';

/**
 * @fileoverview TeamFlow Middleware — Authentication and security filters.
 */

const admin = require('firebase-admin');
const cfg   = require('./config');

/**
 * Soft Firebase ID token verifier.
 *
 * Reads `Authorization: Bearer <token>` from the request header. If present,
 * verifies it against the Firebase Auth project and attaches `req.user`.
 * Unauthenticated requests are allowed through — route handlers must check `req.user`
 * if they require authentication.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function verifyFirebaseToken(req, res, next) {
  const header = req.headers.authorization || '';

  if (!header.startsWith('Bearer ')) {
    return next();
  }

  try {
    let authApp = admin.apps.find(a => a.name === 'auth-app');
    if (!authApp) {
      authApp = admin.initializeApp(
        {
          credential: admin.credential.applicationDefault(),
          projectId: cfg.FIREBASE_AUTH_PROJECT
        },
        'auth-app'
      );
    }

    const token = header.slice(7);
    const decoded = await authApp.auth().verifyIdToken(token);

    req.user = {
      uid:   decoded.uid,
      email: decoded.email,
      name:  decoded.name || decoded.email
    };
  } catch (err) {
    // Log as warning since it's a "soft" auth middleware
    console.warn('[Auth] Invalid token:', err.message);
  }

  next();
}

/**
 * Ensures that the request is authenticated.
 * Use this after verifyFirebaseToken if a route must be private.
 */
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }
  next();
}

module.exports = {
  verifyFirebaseToken,
  requireAuth
};
