'use strict';
const crypto = require('crypto');

const TEACHER_USER = process.env.TEACHER_USER || 'teacher';
const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || 'graduation2026';
const SESSION_TTL = 1000 * 60 * 60 * 12; // 12 小时
const COOKIE_NAME = 'cms_session';

// token -> 过期时间（仅存内存，不落盘、不导出）
const sessions = new Map();

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 32).toString('hex');
}

function verifyPassword(input) {
  const salt = 'class-memorial-salt-v1'; // 单机固定盐；生产可换环境变量
  const expected = hashPassword(TEACHER_PASSWORD, salt);
  const actual = hashPassword(String(input || ''), salt);
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(actual, 'hex'));
}

function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL);
  return token;
}

function destroySession(token) {
  sessions.delete(token);
}

function isValid(token) {
  if (!token) return false;
  const exp = sessions.get(token);
  if (!exp) return false;
  if (Date.now() > exp) {
    sessions.delete(token);
    return false;
  }
  sessions.set(token, Date.now() + SESSION_TTL); // 滑动续期
  return true;
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function getSessionToken(req) {
  return parseCookies(req)[COOKIE_NAME] || null;
}

function isAuthed(req) {
  return isValid(getSessionToken(req));
}

function sessionCookie(token) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_TTL / 1000}`;
}

function clearCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

module.exports = {
  COOKIE_NAME, TEACHER_USER,
  verifyPassword, createSession, destroySession,
  isAuthed, getSessionToken, sessionCookie, clearCookie
};
