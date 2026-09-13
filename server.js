'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { get, persist, uid, now, UPLOAD_DIR } = require('./src/store');
const auth = require('./src/auth');
const { sendJson, ok, fail, readJson, saveDataUrl, removeUpload } = require('./src/http');
const exporter = require('./src/exporter');
const rateLimit = require('./src/ratelimit');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---------- 工具 ----------
function clientIp(req) {
  return (req.socket.remoteAddress || '') + '|' + (req.headers['x-forwarded-for'] || '');
}

function str(v, max) {
  if (typeof v !== 'string') return '';
  const t = v.trim();
  return max ? t.slice(0, max) : t;
}

function isDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(s + 'T00:00:00');
  return dt.getFullYear() === y && dt.getMonth() + 1 === m && dt.getDate() === d;
}

function requireAdmin(req, res) {
  if (auth.isAuthed(req)) return true;
  fail(res, 401, '请先登录老师账号');
  return false;
}

// ---------- 公开数据：隐藏敏感联系方式 ----------
function publicMemories(db) {
  return db.memories
    .filter(m => m.status === 'approved')
    .sort((a, b) => (b.reviewedAt || b.createdAt).localeCompare(a.reviewedAt || a.createdAt))
    .map(m => ({ id: m.id, name: m.name, content: m.content, photoFile: m.photoFile, createdAt: m.createdAt }));
}

function bootstrap(db) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const g = new Date(db.settings.graduationDate + 'T00:00:00');
  const days = Math.round((g - today) / 86400000);
  return {
    settings: db.settings,
    countdown: {
      days,
      phase: days > 0 ? 'before' : days === 0 ? 'today' : 'after',
      graduationDate: db.settings.graduationDate
    },
    milestones: [...db.milestones].sort((a, b) => a.date.localeCompare(b.date)),
    photos: db.photos,
    wishes: db.wishes,
    memories: publicMemories(db)
  };
}

// ---------- API 处理 ----------
async function handleApi(req, res, url) {
  const seg = url.pathname.split('/').filter(Boolean); // ['api', ...]
  const method = req.method;

  // ---- 公开接口 ----
  if (url.pathname === '/api/bootstrap' && method === 'GET') {
    return ok(res, bootstrap(get()));
  }

  if (url.pathname === '/api/memories' && method === 'POST') {
    if (!rateLimit.check(clientIp(req), 15000)) {
      return fail(res, 429, '提交过于频繁，请稍候再试');
    }
    const body = await readJson(req);
    const name = str(body.name, 30);
    const content = str(body.content, 1000);
    const contact = str(body.contact, 200);
    if (!name) return fail(res, 400, '请填写姓名或昵称');
    if (content.length < 5) return fail(res, 400, '回忆内容至少 5 个字');

    let photoFile = null;
    if (body.photo) {
      try { photoFile = saveDataUrl(body.photo); }
      catch (e) { return fail(res, e.status || 400, e.message); }
    }
    const m = {
      id: uid('mm'), name, content, contact, photoFile,
      status: 'pending', reviewNote: '', createdAt: now(), reviewedAt: null
    };
    get().memories.push(m);
    persist();
    return ok(res, { id: m.id, status: 'pending' });
  }

  // 公开版 Markdown 编年（不含联系方式）
  if (url.pathname === '/api/export/chronicle.md' && method === 'GET') {
    return sendText(res, exporter.buildChronicleMd(get()), 'text/markdown; charset=utf-8',
      attachmentName(`${get().settings.className}-毕业纪念编年.md`));
  }

  // ---- 老师登录 ----
  if (url.pathname === '/api/admin/login' && method === 'POST') {
    const body = await readJson(req);
    if (str(body.username, 50) !== auth.TEACHER_USER || !auth.verifyPassword(body.password)) {
      return fail(res, 401, '账号或密码不正确');
    }
    const token = auth.createSession();
    res.setHeader('Set-Cookie', auth.sessionCookie(token));
    return ok(res, { user: auth.TEACHER_USER });
  }

  if (url.pathname === '/api/admin/logout' && method === 'POST') {
    auth.destroySession(auth.getSessionToken(req));
    res.setHeader('Set-Cookie', auth.clearCookie());
    return ok(res);
  }

  // 以下全部需要登录
  if (seg[1] === 'admin') {
    if (!requireAdmin(req, res)) return;

    if (url.pathname === '/api/admin/me' && method === 'GET') {
      return ok(res, { user: auth.TEACHER_USER });
    }

    if (url.pathname === '/api/admin/data' && method === 'GET') {
      const db = get();
      return ok(res, {
        settings: db.settings,
        milestones: [...db.milestones].sort((a, b) => a.date.localeCompare(b.date)),
        photos: db.photos,
        wishes: db.wishes,
        memories: [...db.memories].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        counts: {
          pending: db.memories.filter(m => m.status === 'pending').length,
          approved: db.memories.filter(m => m.status === 'approved').length,
          rejected: db.memories.filter(m => m.status === 'rejected').length
        }
      });
    }

    // ---- 通用增删改：milestones / photos / wishes ----
    const resource = seg[2];
    const resources = { milestone: 'milestones', photo: 'photos', wish: 'wishes' };

    if (resource === 'milestones' && !seg[3] && method === 'POST') {
      const b = await readJson(req);
      const date = str(b.date, 10);
      const title = str(b.title, 60);
      const content = str(b.content, 2000);
      if (!isDate(date)) return fail(res, 400, '请选择有效的日期');
      if (!title) return fail(res, 400, '请填写标题');
      const item = { id: uid('ms'), date, title, content, createdAt: now() };
      get().milestones.push(item); persist();
      return ok(res, item);
    }
    if (resource === 'milestones' && seg[3] && method === 'PUT') {
      const item = get().milestones.find(x => x.id === seg[3]);
      if (!item) return fail(res, 404, '大事记不存在');
      const b = await readJson(req);
      const date = str(b.date, 10);
      if (!isDate(date)) return fail(res, 400, '请选择有效的日期');
      item.date = date;
      item.title = str(b.title, 60) || item.title;
      item.content = str(b.content, 2000);
      persist();
      return ok(res, item);
    }
    if (resource === 'milestones' && seg[3] && method === 'DELETE') {
      const db = get();
      db.milestones = db.milestones.filter(x => x.id !== seg[3]);
      persist();
      return ok(res);
    }

    if (resource === 'photos' && !seg[3] && method === 'POST') {
      const b = await readJson(req);
      if (!b.photo) return fail(res, 400, '请选择照片');
      let file;
      try { file = saveDataUrl(b.photo); }
      catch (e) { return fail(res, e.status || 400, e.message); }
      const item = { id: uid('ph'), file, title: str(b.title, 60), description: str(b.description, 500), uploadedAt: now() };
      get().photos.push(item); persist();
      return ok(res, item);
    }
    if (resource === 'photos' && seg[3] && method === 'PUT') {
      const item = get().photos.find(x => x.id === seg[3]);
      if (!item) return fail(res, 404, '照片不存在');
      const b = await readJson(req);
      item.title = str(b.title, 60);
      item.description = str(b.description, 500);
      persist();
      return ok(res, item);
    }
    if (resource === 'photos' && seg[3] && method === 'DELETE') {
      const db = get();
      const item = db.photos.find(x => x.id === seg[3]);
      if (item) removeUpload(item.file);
      db.photos = db.photos.filter(x => x.id !== seg[3]);
      persist();
      return ok(res);
    }

    if (resource === 'wishes' && !seg[3] && method === 'POST') {
      const b = await readJson(req);
      const author = str(b.author, 30);
      if (!author) return fail(res, 400, '请填写老师姓名');
      const item = {
        id: uid('w'), author,
        role: str(b.role, 30),
        content: str(b.content, 1000),
        createdAt: now()
      };
      if (item.content.length < 2) return fail(res, 400, '请填写寄语内容');
      get().wishes.push(item); persist();
      return ok(res, item);
    }
    if (resource === 'wishes' && seg[3] && method === 'PUT') {
      const item = get().wishes.find(x => x.id === seg[3]);
      if (!item) return fail(res, 404, '寄语不存在');
      const b = await readJson(req);
      item.author = str(b.author, 30) || item.author;
      item.role = str(b.role, 30);
      item.content = str(b.content, 1000) || item.content;
      persist();
      return ok(res, item);
    }
    if (resource === 'wishes' && seg[3] && method === 'DELETE') {
      const db = get();
      db.wishes = db.wishes.filter(x => x.id !== seg[3]);
      persist();
      return ok(res);
    }

    // ---- 回忆审核 ----
    if (resource === 'memories' && seg[3] === 'review' && method === 'POST') {
      const item = get().memories.find(x => x.id === seg[4]);
      if (!item) return fail(res, 404, '回忆不存在');
      const b = await readJson(req);
      const decision = str(b.decision, 10);
      if (!['approved', 'rejected'].includes(decision)) return fail(res, 400, '审核动作无效');
      item.status = decision;
      item.reviewNote = str(b.reviewNote, 300);
      item.reviewedAt = now();
      persist();
      return ok(res, item);
    }
    if (resource === 'memories' && seg[3] && method === 'DELETE') {
      const db = get();
      const item = db.memories.find(x => x.id === seg[3]);
      if (item && item.photoFile) removeUpload(item.photoFile);
      db.memories = db.memories.filter(x => x.id !== seg[3]);
      persist();
      return ok(res);
    }

    // ---- 站点设置 ----
    if (url.pathname === '/api/admin/settings' && method === 'PUT') {
      const b = await readJson(req);
      const s = get().settings;
      const schoolName = str(b.schoolName, 60);
      const className = str(b.className, 60);
      const graduationDate = str(b.graduationDate, 10);
      if (!schoolName || !className) return fail(res, 400, '学校和班级名称不能为空');
      if (!isDate(graduationDate)) return fail(res, 400, '请选择有效的毕业日期');
      s.schoolName = schoolName;
      s.className = className;
      s.graduationDate = graduationDate;
      s.tagline = str(b.tagline, 120);
      s.notice = str(b.notice, 300);
      persist();
      return ok(res, s);
    }

    // ---- 资料导出 ----
    if (url.pathname === '/api/admin/export/json' && method === 'GET') {
      const data = exporter.buildJsonArchive(get());
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        ...attachmentName(`${get().settings.className}-毕业纪念完整归档-${ymd()}.json`)
      });
      return res.end(JSON.stringify(data, null, 2));
    }
    if (url.pathname === '/api/admin/export/csv' && method === 'GET') {
      return sendText(res, exporter.buildMemoriesCsv(get()), 'text/csv; charset=utf-8',
        attachmentName(`${get().settings.className}-同学回忆明细-${ymd()}.csv`));
    }
    if (url.pathname === '/api/admin/export/md' && method === 'GET') {
      return sendText(res, exporter.buildChronicleMd(get()), 'text/markdown; charset=utf-8',
        attachmentName(`${get().settings.className}-毕业纪念编年-${ymd()}.md`));
    }
  }

  return fail(res, 404, '接口不存在');
}

function ymd() {
  return new Date().toISOString().slice(0, 10);
}

function sendText(res, text, type, disposition) {
  const buf = Buffer.from(text, 'utf8');
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(buf), ...disposition });
  res.end(buf);
}

function attachmentName(filename) {
  return { 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}` };
}

// ---------- 静态文件 ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

function safeJoin(base, target) {
  const p = path.normalize(path.join(base, target));
  if (!p.startsWith(base + path.sep) && p !== base) return null;
  return p;
}

function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath);
  if (rel === '/') rel = '/index.html';
  if (rel === '/admin' || rel === '/admin/') rel = '/admin/index.html';

  let base, file;
  if (rel.startsWith('/uploads/')) {
    base = UPLOAD_DIR;
    file = safeJoin(UPLOAD_DIR, rel.slice('/uploads/'.length));
  } else {
    base = PUBLIC_DIR;
    file = safeJoin(PUBLIC_DIR, rel);
  }
  if (!file) { res.writeHead(403); return res.end('Forbidden'); }

  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('页面不存在'); }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': st.size,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': type.startsWith('image/') ? 'private, max-age=3600' : 'no-cache'
    });
    fs.createReadStream(file).pipe(res);
  });
}

// ---------- 服务器 ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');

  if (url.pathname.startsWith('/api/')) {
    try {
      await handleApi(req, res, url);
    } catch (e) {
      if (!res.headersSent) fail(res, e.status || 500, e.message || '服务器错误');
      console.error(e);
    }
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405); return res.end('Method Not Allowed');
  }
  serveStatic(req, res, url.pathname);
});

server.listen(PORT, () => {
  require('./src/store').load();
  console.log(`🎓 毕业班纪念站已启动: http://localhost:${PORT}`);
  console.log(`   老师后台:       http://localhost:${PORT}/admin`);
  console.log(`   默认账号 teacher / ${process.env.TEACHER_PASSWORD || 'graduation2026'}（请尽快修改）`);
});
