'use strict';
const { h, toast, fmtTime, openLightbox, fileToCompressedDataUrl } = window.CMS;

function renderCountdown(cd) {
  const box = document.getElementById('countdown');
  const num = document.getElementById('cd-num');
  const unit = document.getElementById('cd-unit');
  document.getElementById('cd-date').textContent = '毕业日 ' + cd.graduationDate;
  box.classList.remove('is-after', 'is-today');
  if (cd.phase === 'before') {
    num.textContent = cd.days;
    unit.textContent = '天后毕业';
  } else if (cd.phase === 'today') {
    box.classList.add('is-today');
    num.textContent = '今';
    unit.textContent = '天，毕业快乐！';
  } else {
    box.classList.add('is-after');
    num.textContent = Math.abs(cd.days);
    unit.textContent = '天前，我们毕业了';
  }
}

function renderTimeline(list) {
  const root = document.getElementById('timeline');
  root.replaceChildren();
  if (!list.length) { root.append(h('div', { class: 'empty' }, '大事记整理中…')); return; }
  for (const m of list) {
    root.append(
      h('div', { class: 'tl-item' },
        h('div', { class: 'tl-date' }, m.date.replace(/-/g, '/').slice(2)),
        h('div', { class: 'tl-dot' }),
        h('div', { class: 'tl-body' },
          h('h3', null, m.title),
          h('p', null, m.content)
        )
      )
    );
  }
}

function renderGallery(list) {
  const root = document.getElementById('gallery-grid');
  root.replaceChildren();
  if (!list.length) { root.append(h('div', { class: 'empty' }, '照片上传中…')); return; }
  for (const p of list) {
    const card = h('div', { class: 'photo-card' },
      h('div', { class: 'thumb' }, h('img', { src: '/uploads/' + p.file, alt: p.title, loading: 'lazy' })),
      h('div', { class: 'meta' },
        h('h3', null, p.title),
        h('p', null, p.description)
      )
    );
    card.addEventListener('click', () => openLightbox('/uploads/' + p.file, p.title));
    root.append(card);
  }
}

function renderWishes(list) {
  const root = document.getElementById('wishes-grid');
  root.replaceChildren();
  if (!list.length) { root.append(h('div', { class: 'empty' }, '寄语即将送达…')); return; }
  for (const w of list) {
    root.append(
      h('div', { class: 'wish-card' },
        h('p', null, w.content),
        h('div', { class: 'who' }, '—— ', h('b', null, w.author), w.role ? '（' + w.role + '）' : '')
      )
    );
  }
}

function initial(name) {
  return (name || '同').trim().charAt(0).toUpperCase();
}

function renderMemories(list) {
  const root = document.getElementById('memories-grid');
  root.replaceChildren();
  if (!list.length) {
    root.append(h('div', { class: 'empty', style: 'grid-column:1/-1' }, '还没有回忆，来做第一个分享的人吧。'));
    return;
  }
  for (const m of list) {
    const card = h('div', { class: 'memory-card' },
      h('div', { class: 'head' },
        h('div', { class: 'avatar' }, initial(m.name)),
        h('div', {},
          h('div', { class: 'name' }, m.name),
          h('div', { class: 'time' }, fmtTime(m.createdAt))
        )
      ),
      h('p', null, m.content)
    );
    if (m.photoFile) {
      const img = h('img', { src: '/uploads/' + m.photoFile, alt: '回忆配图', loading: 'lazy' });
      const wrap = h('div', { class: 'ph' }, img);
      wrap.addEventListener('click', () => openLightbox(img.src, m.name + ' 的回忆'));
      card.append(wrap);
    }
    root.append(card);
  }
}

function bindForm() {
  const form = document.getElementById('memory-form');
  const content = form.elements.content;
  const counter = document.getElementById('content-count');
  let photoData = null;

  content.addEventListener('input', () => { counter.textContent = content.value.length; });

  form.elements.photo.addEventListener('change', async e => {
    const file = e.target.files[0];
    const preview = document.getElementById('photo-preview');
    preview.replaceChildren();
    photoData = null;
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) {
      toast('原图过大，请选择 6MB 以内的图片', 'error');
      e.target.value = '';
      return;
    }
    try {
      photoData = await fileToCompressedDataUrl(file);
      const img = h('img', { src: photoData, style: 'max-height:160px;border-radius:10px;margin-top:8px' });
      preview.append(img);
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('submit-btn');
    const payload = {
      name: form.elements.name.value,
      contact: form.elements.contact.value,
      content: form.elements.content.value,
      photo: photoData
    };
    btn.disabled = true;
    btn.textContent = '提交中…';
    try {
      await fetch('/api/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(async r => {
        const d = await r.json().catch(() => null);
        if (!r.ok || !d || d.ok === false) throw new Error((d && d.error) || '提交失败');
        return d;
      });
      form.reset();
      counter.textContent = '0';
      document.getElementById('photo-preview').replaceChildren();
      photoData = null;
      toast('提交成功！等待老师审核后展示', 'ok');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '提交回忆';
    }
  });
}

async function init() {
  try {
    const res = await fetch('/api/bootstrap');
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || '加载失败');
    const d = json.data;
    document.title = `${d.settings.className}毕业纪念站`;
    document.getElementById('nav-class').textContent = d.settings.className + ' · 毕业纪念';
    document.getElementById('hero-title').textContent =
      d.settings.schoolName + ' ' + d.settings.className;
    document.getElementById('hero-tagline').textContent = d.settings.tagline;
    document.getElementById('footer-notice').textContent = d.settings.notice;
    renderCountdown(d.countdown);
    renderTimeline(d.milestones);
    renderGallery(d.photos);
    renderWishes(d.wishes);
    renderMemories(d.memories);
  } catch (err) {
    toast('页面数据加载失败：' + err.message, 'error');
  }
  bindForm();
}

init();
