'use strict';
const fs = require('fs');
const path = require('path');
const { UPLOAD_DIR } = require('./store');

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function fmtDate(d) {
  return d ? new Date(d).toLocaleString('zh-CN', { hour12: false }) : '';
}

// 1) 完整 JSON 归档（含联系方式；照片以 base64 内嵌，单文件即可留档）
function buildJsonArchive(db) {
  const photos = db.photos.map(p => {
    let dataUrl = null;
    try {
      const buf = fs.readFileSync(path.join(UPLOAD_DIR, p.file));
      const ext = path.extname(p.file).slice(1).toLowerCase();
      const mime = ext === 'svg' ? 'image/svg+xml'
        : ext === 'jpg' ? 'image/jpeg'
        : ext === 'webp' ? 'image/webp'
        : `image/${ext}`;
      dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
    } catch (_) { /* 丢失的文件跳过 */ }
    return { ...p, imageData: dataUrl };
  });

  const memoryPhotos = db.memories
    .filter(m => m.photoFile)
    .map(m => {
      let dataUrl = null;
      try {
        const buf = fs.readFileSync(path.join(UPLOAD_DIR, m.photoFile));
        const ext = path.extname(m.photoFile).slice(1).toLowerCase();
        const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
        dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
      } catch (_) {}
      return { memoryId: m.id, name: m.name, file: m.photoFile, imageData: dataUrl };
    });

  return {
    archiveType: 'class-memorial-archive',
    exportedAt: new Date().toISOString(),
    settings: db.settings,
    milestones: db.milestones,
    wishes: db.wishes,
    memories: db.memories,
    photos,
    memoryPhotos
  };
}

// 2) CSV：回忆明细（含未审核与联系方式，仅供老师留档）
function buildMemoriesCsv(db) {
  const header = ['提交时间', '姓名/昵称', '回忆内容', '联系方式', '配图文件', '审核状态', '审核备注', '审核时间'];
  const rows = db.memories.map(m => [
    fmtDate(m.createdAt), m.name, m.content, m.contact || '', m.photoFile || '',
    m.status === 'approved' ? '已通过' : m.status === 'rejected' ? '未通过' : '待审核',
    m.reviewNote || '', fmtDate(m.reviewedAt)
  ]);
  return '﻿' + [header, ...rows].map(r => r.map(csvEscape).join(',')).join('\r\n');
}

// 3) Markdown：公开版班级编年（不含任何联系方式，可直接打印/分享）
function buildChronicleMd(db) {
  const s = db.settings;
  const L = [];
  L.push(`# ${s.schoolName} ${s.className} 毕业纪念`);
  L.push('');
  L.push(`> ${s.tagline || ''}`);
  L.push('');
  L.push(`毕业日期：${s.graduationDate}`);
  L.push('');
  L.push('## 班级大事记');
  L.push('');
  [...db.milestones].sort((a, b) => a.date.localeCompare(b.date))
    .forEach(m => {
      L.push(`### ${m.date}　${m.title}`);
      L.push('');
      L.push(m.content);
      L.push('');
    });
  L.push('## 老师寄语');
  L.push('');
  db.wishes.forEach(w => {
    L.push(`> ${w.content}`);
      L.push(`> —— ${w.author}${w.role ? '（' + w.role + '）' : ''}`);
      L.push('');
  });
  L.push('## 同学回忆');
  L.push('');
  db.memories.filter(m => m.status === 'approved').forEach(m => {
    L.push(`- **${m.name}**：${m.content}`);
  });
  L.push('');
  L.push('## 照片目录');
  L.push('');
  db.photos.forEach(p => {
    L.push(`- ${p.title}${p.description ? '：' + p.description : ''}（文件 ${p.file}）`);
  });
  L.push('');
  L.push(`---\n导出时间：${fmtDate(new Date().toISOString())}`);
  return L.join('\n');
}

module.exports = { buildJsonArchive, buildMemoriesCsv, buildChronicleMd };
