'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

const DEFAULT_GRADUATION_DATE = '2027-06-15';

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`;
}

function now() {
  return new Date().toISOString();
}

function seedPhotosSvg() {
  // 初始占位图（可信来源，直接写入 SVG）
  const svgs = [
    { file: 'seed-opening.svg', from: '#f6d6c2', to: '#e8a98c', label: '开学典礼', emoji: '🎒' },
    { file: 'seed-sports.svg', from: '#cde8dd', to: '#8fcbb4', label: '运动会', emoji: '🏃' },
    { file: 'seed-camping.svg', from: '#d6e2f5', to: '#a4bfe6', label: '春游', emoji: '🌿' },
    { file: 'seed-classroom.svg', from: '#f3e3c3', to: '#e3c384', label: '课堂时光', emoji: '📖' },
    { file: 'seed-newyear.svg', from: '#f7d9d9', to: '#e5a0a0', label: '元旦联欢', emoji: '🎊' },
    { file: 'seed-graduation.svg', from: '#e6d8f2', to: '#bda3dd', label: '毕业合影', emoji: '🎓' }
  ];
  for (const s of svgs) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${s.from}"/><stop offset="1" stop-color="${s.to}"/>
  </linearGradient></defs>
  <rect width="800" height="600" fill="url(#g)"/>
  <text x="400" y="300" font-size="130" text-anchor="middle">${s.emoji}</text>
  <text x="400" y="420" font-size="44" text-anchor="middle" fill="#5b4a3f" font-family="sans-serif">${s.label}</text>
</svg>`;
    fs.writeFileSync(path.join(UPLOAD_DIR, s.file), svg, 'utf8');
  }
  return svgs.map((s, i) => ({
    id: uid('ph'),
    file: s.file,
    title: s.label,
    description: ['三年时光，从这里开始。', '奋力奔跑的青春。', '一路上的笑声与风景。',
      '窗边的光影与板书。', '灯火可亲，同学少年。', '愿此去前程似锦，再相逢依旧如故。'][i],
    uploadedAt: now()
  }));
}

function defaultData() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const photos = seedPhotosSvg();
  return {
    meta: { createdAt: now(), version: 1 },
    settings: {
      schoolName: '星河市第一中学',
      className: '高三（2）班',
      graduationDate: DEFAULT_GRADUATION_DATE,
      tagline: '愿你出走半生，归来仍是少年。',
      notice: '本站由班主任维护，欢迎同学们提交回忆，审核通过后将在页面展示。'
    },
    milestones: [
      { id: uid('ms'), date: '2024-09-01', title: '初见', content: '高一新生报到，五十四张陌生的面孔聚在同一间教室，故事从这里开始。', createdAt: now() },
      { id: uid('ms'), date: '2024-10-18', title: '秋季运动会', content: '全班齐心协力，拿下年级团体总分第二名，接力赛的呐喊至今难忘。', createdAt: now() },
      { id: uid('ms'), date: '2025-04-02', title: '春日研学', content: '山间徒步十里，一路歌声，也一路互相搀扶。', createdAt: now() },
      { id: uid('ms'), date: '2026-01-01', title: '元旦联欢', content: '黑板写满愿望，同学们偷偷准备的节目让老师红了眼眶。', createdAt: now() },
      { id: uid('ms'), date: '2026-06-07', title: '高考', content: '考场外的击掌与拥抱，所有努力都有了回响。', createdAt: now() },
      { id: uid('ms'), date: '2027-06-15', title: '毕业典礼', content: '穿上学士服合影，我们约定：十年之后，再回这里看看。', createdAt: now() }
    ],
    photos,
    wishes: [
      { id: uid('w'), author: '王老师', role: '班主任', content: '愿你们既有随处可栖的江湖，也有追风逐梦的勇敢。常回来看看。', createdAt: now() },
      { id: uid('w'), author: '李老师', role: '语文老师', content: '读过的书、走过的路、爱过的人，都会成为你们生命里的光。', createdAt: now() }
    ],
    memories: [
      { id: uid('mm'), name: '陈一然', content: '记得晚自习前窗边的晚霞，粉笔灰落在课桌上，那是我们最好的三年。', contact: '138****0000（示例，公开页不展示）', photoFile: null, status: 'approved', reviewNote: '', createdAt: now(), reviewedAt: now() },
      { id: uid('mm'), name: '林小满', content: '运动会接力最后一棒摔倒了又爬起来冲线，全班冲过来抱住我的那一刻，什么名次都不重要了。', contact: 'xiaoman@example.com（示例，公开页不展示）', photoFile: 'seed-sports.svg', status: 'approved', reviewNote: '', createdAt: now(), reviewedAt: now() }
    ]
  };
}

let db = null;
let saveTimer = null;

function load() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  if (fs.existsSync(DATA_FILE)) {
    db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } else {
    db = defaultData();
    save();
  }
  return db;
}

function get() {
  if (!db) load();
  return db;
}

function save() {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_FILE);
}

// 合并保存（写操作后调用，防抖落盘）
function persist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { save(); } catch (e) { console.error('保存失败', e); }
  }, 150);
}

module.exports = { get, persist, save, load, uid, now, UPLOAD_DIR, DATA_DIR, DATA_FILE };
