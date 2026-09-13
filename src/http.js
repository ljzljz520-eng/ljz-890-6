'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { UPLOAD_DIR, uid } = require('./store');

const MAX_BODY = 2 * 1024 * 1024; // JSON 请求 2MB
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 图片 4MB
const ALLOWED_IMAGE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif'
};
// 注意：SVG 仅允许初始种子文件，后台/学生上传一律拒绝，避免内嵌脚本风险

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function ok(res, data) { sendJson(res, 200, { ok: true, data } || { ok: true }); }
function fail(res, status, message) { sendJson(res, status, { ok: false, error: message }); }

function readBody(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let exceeded = false;
    const chunks = [];
    req.on('data', c => {
      if (exceeded) return; // 超限后继续排空请求体，但不再收集
      size += c.length;
      if (size > limit) {
        exceeded = true;
        chunks.length = 0;
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (exceeded) reject(Object.assign(new Error('请求体过大（上限 ' + Math.round(limit / 1024 / 1024) + 'MB）'), { status: 413 }));
      else resolve(Buffer.concat(chunks));
    });
    req.on('error', reject);
  });
}

async function readJson(req) {
  const buf = await readBody(req);
  if (!buf.length) return {};
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch (_) {
    throw Object.assign(new Error('JSON 格式不正确'), { status: 400 });
  }
}

// 保存 data URL 图片，返回文件名；非法则抛错
function saveDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') throw Object.assign(new Error('缺少图片数据'), { status: 400 });
  const m = /^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/.exec(dataUrl);
  if (!m) throw Object.assign(new Error('图片格式不支持'), { status: 400 });
  const mime = m[1].toLowerCase();
  const ext = ALLOWED_IMAGE[mime];
  if (!ext) throw Object.assign(new Error('仅支持 JPG / PNG / WEBP / GIF 格式（不允许 SVG）'), { status: 400 });
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length === 0) throw Object.assign(new Error('图片内容为空'), { status: 400 });
  if (buf.length > MAX_IMAGE_BYTES) throw Object.assign(new Error('图片不能超过 4MB'), { status: 400 });

  // 用魔数二次校验，防止伪造 MIME
  const sig = buf.subarray(0, 4);
  const checks = {
    jpg: () => buf[0] === 0xff && buf[1] === 0xd8,
    png: () => sig.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
    gif: () => buf.slice(0, 6).toString('ascii').startsWith('GIF'),
    webp: () => buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP'
  };
  if (!checks[ext]()) throw Object.assign(new Error('图片内容与格式不符'), { status: 400 });

  const file = `${uid('img')}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, file), buf);
  return file;
}

// 安全删除上传文件（种子文件不允许删除）
function removeUpload(file) {
  if (!file || typeof file !== 'string' || path.isAbsolute(file) || file.includes('..')) return;
  if (file.startsWith('seed-')) return;
  try { fs.unlinkSync(path.join(UPLOAD_DIR, file)); } catch (_) {}
}

module.exports = {
  sendJson, ok, fail, readBody, readJson, saveDataUrl, removeUpload,
  MAX_BODY, MAX_IMAGE_BYTES
};
