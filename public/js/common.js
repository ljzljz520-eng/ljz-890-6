'use strict';
/* 安全的 DOM 构建工具：所有文本经 textContent 渲染，避免 XSS */
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.textContent = v; // 名称提醒：仍是 textContent
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

function toast(msg, type = '') {
  let box = document.getElementById('toast');
  if (!box) {
    box = h('div', { id: 'toast' });
    document.body.append(box);
  }
  box.textContent = msg;
  box.className = 'show ' + type;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { box.className = ''; }, 2600);
}

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* 灯箱 */
function openLightbox(src, caption) {
  let lb = document.getElementById('lightbox');
  if (!lb) {
    lb = h('div', {
      id: 'lightbox', class: 'lightbox',
      onclick: e => { if (e.target === lb || e.target.classList.contains('close')) lb.classList.remove('show'); }
    },
      h('button', { class: 'close', 'aria-label': '关闭' }, '×'),
      h('div', {},
        h('img', { alt: '预览' }),
        h('div', { class: 'cap' })
      )
    );
    document.addEventListener('keydown', e => { if (e.key === 'Escape') lb.classList.remove('show'); });
    document.body.append(lb);
  }
  lb.querySelector('img').src = src;
  lb.querySelector('.cap').textContent = caption || '';
  lb.classList.add('show');
}

/* 图片压缩：最长边 1600，JPEG 0.82，减小上传体积（PNG/GIF 保留） */
function fileToCompressedDataUrl(file, maxSize = 1600) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        if (file.type === 'image/gif' || file.type === 'image/webp') {
          return resolve(reader.result); // 动图/webp 不压缩
        }
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          const r = Math.min(maxSize / width, maxSize / height);
          width = Math.round(width * r);
          height = Math.round(height * r);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => reject(new Error('图片解析失败'));
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch (_) {}
  if (res.status === 401) {
    if (!location.pathname.includes('/admin/login')) {
      const next = encodeURIComponent(location.pathname + location.search);
      location.href = '/admin/login.html?next=' + next;
    }
    throw Object.assign(new Error((data && data.error) || '请先登录'), { status: 401 });
  }
  if (!res.ok || !data || data.ok === false) {
    throw Object.assign(new Error((data && data.error) || '请求失败'), { status: res.status });
  }
  return data.data;
}

window.CMS = { h, toast, fmtTime, openLightbox, fileToCompressedDataUrl, api };
