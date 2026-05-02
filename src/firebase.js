/**
 * Firebase Admin + Firestore initializer
 * Uses Application Default Credentials — works automatically on Cloud Run.
 * Locally: run `gcloud auth application-default login`
 */

'use strict';

const admin = require('firebase-admin');

let db = null;

function getDb() {
  if (db) return db;
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: process.env.GCLOUD_PROJECT || 'teamflow-495105',
    });
  }
  db = admin.firestore();
  db.settings({ ignoreUndefinedProperties: true });
  return db;
}

module.exports = { getDb, admin };
