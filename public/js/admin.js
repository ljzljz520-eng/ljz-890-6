'use strict';
const { h, toast, fmtTime, openLightbox, fileToCompressedDataUrl, api } = window.CMS;

let DATA = null;
let reviewFilter = 'pending';

/* ---------------- 标签切换 ---------------- */
function initTabs() {
  document.getElementById('tabs').addEventListener('click', e => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === btn));
    document.querySelectorAll('.tabpane').forEach(p =>
      p.classList.toggle('active', p.id === 'pane-' + btn.dataset.tab));
  });
}

/* ---------------- 概览 ---------------- */
function renderDashboard() {
  const root = document.getElementById('stat-row');
  const c = DATA.counts;
  const cards = [
    { v: c.pending, l: '待审核回忆' },
    { v: c.approved, l: '已公开回忆' },
    { v: DATA.milestones.length, l: '条大事记' },
    { v: DATA.photos.length, l: '张照片' },
    { v: DATA.wishes.length, l: '条老师寄语' }
  ];
  root.replaceChildren(...cards.map(c =>
    h('div', { class: 'stat' },
      h('div', { class: 'v' }, String(c.v)),
      h('div', { class: 'l' }, c.l))));

  const dot = document.getElementById('pending-dot');
  if (c.pending > 0) { dot.style.display = 'inline-block'; dot.textContent = c.pending; }
  else dot.style.display = 'none';
}

/* ---------------- 回忆审核 ---------------- */
function statusTag(s) {
  const map = {
    pending: ['pending', '待审核'],
    approved: ['approved', '已通过'],
    rejected: ['rejected', '未通过']
  };
  const [cls, txt] = map[s] || map.pending;
  return h('span', { class: 'tag ' + cls }, txt);
}

function renderReview() {
  const root = document.getElementById('review-list');
  root.replaceChildren();
  const list = DATA.memories
    .filter(m => reviewFilter === 'all' || m.status === reviewFilter)
    .sort((a, b) => {
      // 待审核优先，其次时间新
      const w = { pending: 0, rejected: 1, approved: 2 };
      if (w[a.status] !== w[b.status]) return w[a.status] - w[b.status];
      return b.createdAt.localeCompare(a.createdAt);
    });

  if (!list.length) {
    root.append(h('div', { class: 'empty' }, '当前分类下暂无回忆。'));
    return;
  }

  for (const m of list) {
    const card = h('div', { class: 'list-card' });

    const headRight = h('div', { style: 'display:flex;gap:10px;align-items:center;flex:none' },
      statusTag(m.status),
      h('button', {
        class: 'btn danger sm',
        onclick: () => deleteMemory(m.id)
      }, '删除'));

    const head = h('div', { class: 'row1' },
      h('div', {},
        h('h4', null, m.name),
        h('div', { class: 'sub' }, '提交于 ' + fmtTime(m.createdAt) +
          (m.reviewedAt ? '　·　审核于 ' + fmtTime(m.reviewedAt) : ''))
      ),
      headRight
    );
    card.append(head);

    if (m.contact) card.append(h('div', { class: 'contact' }, m.contact));
    card.append(h('div', { class: 'body' }, m.content));
    if (m.photoFile) {
      const im = h('img', { class: 'thumb-inline', src: '/uploads/' + m.photoFile, alt: '配图' });
      im.style.cursor = 'zoom-in';
      im.addEventListener('click', () => openLightbox('/uploads/' + m.photoFile, m.name + ' 提交的配图'));
      card.append(im);
    }
    if (m.reviewNote) {
      card.append(h('div', { class: 'sub', style: 'margin-top:6px' }, '上次审核备注：' + m.reviewNote));
    }

    if (m.status === 'pending') {
      const noteBox = h('input', { type: 'text', placeholder: '审核备注（选填，如退回原因）', style: 'margin:10px 10px 0 0;width:260px;max-width:100%' });
      const actions = h('div', { class: 'btn-row', style: 'margin-top:12px' },
        h('button', {
          class: 'btn sage sm',
          onclick: async () => {
            await api('/api/admin/memories/review/' + m.id, {
              method: 'POST', body: { decision: 'approved', reviewNote: noteBox.value }
            });
            toast('已通过，回忆已在公开页展示', 'ok');
            await reload();
          }
        }, '✓ 通过并公开'),
        h('button', {
          class: 'btn danger sm',
          onclick: async () => {
            await api('/api/admin/memories/review/' + m.id, {
              method: 'POST', body: { decision: 'rejected', reviewNote: noteBox.value }
            });
            toast('已标记为未通过');
            await reload();
          }
        }, '退回'),
        noteBox
      );
      card.append(actions);
    } else {
      card.append(h('div', { class: 'btn-row', style: 'margin-top:10px' },
        m.status === 'rejected'
          ? h('button', {
              class: 'btn secondary sm',
              onclick: async () => {
                await api('/api/admin/memories/review/' + m.id, { method: 'POST', body: { decision: 'approved' } });
                toast('已重新通过', 'ok'); await reload();
              }
            }, '重新通过')
          : h('button', {
              class: 'btn ghost sm',
              onclick: async () => {
                await api('/api/admin/memories/review/' + m.id, { method: 'POST', body: { decision: 'rejected' } });
                toast('已撤回公开'); await reload();
              }
            }, '撤回公开')
      ));
    }
    root.append(card);
  }
}

async function deleteMemory(id) {
  if (!confirm('确定删除这条回忆？删除后不可恢复（配图也会一并删除）。')) return;
  await api('/api/admin/memories/' + id, { method: 'DELETE' });
  toast('已删除');
  await reload();
}

function initReviewFilter() {
  document.querySelector('#pane-review .filter-bar').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    reviewFilter = chip.dataset.filter;
    document.querySelectorAll('#pane-review .chip').forEach(c => c.classList.toggle('active', c === chip));
    renderReview();
  });
}

/* ---------------- 大事记 ---------------- */
function renderMilestones() {
  const root = document.getElementById('ms-list');
  root.replaceChildren();
  if (!DATA.milestones.length) root.append(h('div', { class: 'empty' }, '还没有大事记。'));
  for (const m of DATA.milestones) {
    const card = h('div', { class: 'list-card' });
    card.append(
      h('div', { class: 'row1' },
        h('div', {},
          h('h4', null, m.date + '　' + m.title),
          h('div', { class: 'body' }, m.content)
        ),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn ghost sm', onclick: () => toggleMsEdit(card, m) }, '编辑'),
          h('button', {
            class: 'btn danger sm',
            onclick: async () => {
              if (!confirm('删除这条大事记？')) return;
              await api('/api/admin/milestones/' + m.id, { method: 'DELETE' });
              toast('已删除'); await reload();
            }
          }, '删除')
        )
      )
    );
    const edit = h('div', { class: 'inline-form' });
    edit.append(buildMsForm(m, async body => {
      await api('/api/admin/milestones/' + m.id, { method: 'PUT', body });
      toast('已保存', 'ok'); await reload();
    }));
    card.append(edit);
    root.append(card);
  }
}

function toggleMsEdit(card, m) {
  card.querySelector('.inline-form').classList.toggle('show');
}

function buildMsForm(m, onSubmit) {
  const f = h('form', {},
    h('div', { class: 'form-grid' },
      h('label', { class: 'field' }, h('span', null, '日期'),
        h('input', { type: 'date', name: 'date', required: true, value: m ? m.date : '' })),
      h('label', { class: 'field' }, h('span', null, '标题'),
        h('input', { type: 'text', name: 'title', maxlength: '60', required: true, value: m ? m.title : '' }))
    ),
    h('label', { class: 'field' }, h('span', null, '内容'),
      h('textarea', { name: 'content', maxlength: '2000' }, m ? m.content : '')),
    h('button', { class: 'btn sm', type: 'submit' }, m ? '保存修改' : '添加')
  );
  f.addEventListener('submit', async e => {
    e.preventDefault();
    await onSubmit({
      date: f.elements.date.value,
      title: f.elements.title.value,
      content: f.elements.content.value
    });
  });
  return f;
}

function initMilestoneForm() {
  const f = document.getElementById('ms-form');
  f.elements.date.value = new Date().toISOString().slice(0, 10);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    await api('/api/admin/milestones', {
      method: 'POST',
      body: {
        date: f.elements.date.value,
        title: f.elements.title.value,
        content: f.elements.content.value
      }
    });
    f.reset();
    f.elements.date.value = new Date().toISOString().slice(0, 10);
    toast('已添加大事记', 'ok');
    await reload();
  });
}

/* ---------------- 照片 ---------------- */
function renderPhotos() {
  const root = document.getElementById('ph-list');
  root.replaceChildren();
  if (!DATA.photos.length) root.append(h('div', { class: 'empty', style: 'grid-column:1/-1' }, '还没有照片。'));
  for (const p of DATA.photos) {
    const card = h('div', { class: 'photo-admin' },
      h('img', { src: '/uploads/' + p.file, alt: p.title, style: 'cursor:zoom-in' }),
      h('div', { class: 'pa-body' },
        h('h4', null, p.title || '未命名'),
        h('p', null, p.description || '　'),
        h('div', { class: 'pa-actions' },
          h('button', {
            class: 'btn ghost sm',
            onclick: async () => {
              const title = prompt('照片标题', p.title || '');
              if (title === null) return;
              const description = prompt('照片说明', p.description || '');
              if (description === null) return;
              await api('/api/admin/photos/' + p.id, { method: 'PUT', body: { title, description } });
              toast('已更新', 'ok'); await reload();
            }
          }, '编辑'),
          h('button', {
            class: 'btn danger sm',
            onclick: async () => {
              if (!confirm('删除这张照片？')) return;
              await api('/api/admin/photos/' + p.id, { method: 'DELETE' });
              toast('已删除'); await reload();
            }
          }, '删除')
        )
      )
    );
    card.querySelector('img').addEventListener('click', () => openLightbox('/uploads/' + p.file, p.title));
    root.append(card);
  }
}

function initPhotoForm() {
  const f = document.getElementById('ph-form');
  let photoData = null;
  f.elements.photo.addEventListener('change', async e => {
    const file = e.target.files[0];
    const preview = document.getElementById('ph-preview');
    preview.replaceChildren();
    photoData = null;
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) {
      toast('原图过大，请选择 6MB 以内的图片', 'error');
      f.elements.photo.value = '';
      return;
    }
    try {
      photoData = await fileToCompressedDataUrl(file);
      preview.append(h('img', { src: photoData, style: 'max-height:160px;border-radius:10px;margin-top:8px' }));
    } catch (err) { toast(err.message, 'error'); }
  });

  f.addEventListener('submit', async e => {
    e.preventDefault();
    if (!photoData) return toast('请先选择照片', 'error');
    const btn = document.getElementById('ph-submit');
    btn.disabled = true; btn.textContent = '上传中…';
    try {
      await api('/api/admin/photos', {
        method: 'POST',
        body: {
          photo: photoData,
          title: f.elements.title.value,
          description: f.elements.description.value
        }
      });
      f.reset();
      document.getElementById('ph-preview').replaceChildren();
      photoData = null;
      toast('照片已上传', 'ok');
      await reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = '上传照片';
    }
  });
}

/* ---------------- 寄语 ---------------- */
function renderWishes() {
  const root = document.getElementById('w-list');
  root.replaceChildren();
  if (!DATA.wishes.length) root.append(h('div', { class: 'empty' }, '还没有寄语。'));
  for (const w of DATA.wishes) {
    const card = h('div', { class: 'list-card' });
    card.append(
      h('div', { class: 'row1' },
        h('div', {},
          h('h4', null, w.author + (w.role ? '（' + w.role + '）' : '')),
          h('div', { class: 'body' }, w.content)
        ),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn ghost sm', onclick: () => card.querySelector('.inline-form').classList.toggle('show') }, '编辑'),
          h('button', {
            class: 'btn danger sm',
            onclick: async () => {
              if (!confirm('删除这条寄语？')) return;
              await api('/api/admin/wishes/' + w.id, { method: 'DELETE' });
              toast('已删除'); await reload();
            }
          }, '删除')
        )
      )
    );
    const edit = h('div', { class: 'inline-form' }, buildWishForm(w, async body => {
      await api('/api/admin/wishes/' + w.id, { method: 'PUT', body });
      toast('已保存', 'ok'); await reload();
    }));
    card.append(edit);
    root.append(card);
  }
}

function buildWishForm(w, onSubmit) {
  const f = h('form', {},
    h('div', { class: 'form-grid' },
      h('label', { class: 'field' }, h('span', null, '老师姓名'),
        h('input', { type: 'text', name: 'author', maxlength: '30', required: true, value: w ? w.author : '' })),
      h('label', { class: 'field' }, h('span', null, '身份'),
        h('input', { type: 'text', name: 'role', maxlength: '30', value: w ? w.role || '' : '' }))
    ),
    h('label', { class: 'field' }, h('span', null, '寄语内容'),
      h('textarea', { name: 'content', maxlength: '1000', required: true }, w ? w.content : '')),
    h('button', { class: 'btn sm', type: 'submit' }, w ? '保存修改' : '发布')
  );
  f.addEventListener('submit', async e => {
    e.preventDefault();
    await onSubmit({
      author: f.elements.author.value,
      role: f.elements.role.value,
      content: f.elements.content.value
    });
  });
  return f;
}

function initWishForm() {
  const f = document.getElementById('w-form');
  f.addEventListener('submit', async e => {
    e.preventDefault();
    await api('/api/admin/wishes', {
      method: 'POST',
      body: {
        author: f.elements.author.value,
        role: f.elements.role.value,
        content: f.elements.content.value
      }
    });
    f.reset();
    toast('寄语已发布', 'ok');
    await reload();
  });
}

/* ---------------- 设置 ---------------- */
function fillSettings() {
  const f = document.getElementById('set-form');
  const s = DATA.settings;
  for (const k of ['schoolName', 'className', 'graduationDate', 'tagline', 'notice']) {
    f.elements[k].value = s[k] || '';
  }
}

function initSettingsForm() {
  const f = document.getElementById('set-form');
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('set-save');
    btn.disabled = true;
    try {
      await api('/api/admin/settings', {
        method: 'PUT',
        body: {
          schoolName: f.elements.schoolName.value,
          className: f.elements.className.value,
          graduationDate: f.elements.graduationDate.value,
          tagline: f.elements.tagline.value,
          notice: f.elements.notice.value
        }
      });
      toast('设置已保存，公开页倒计时已更新', 'ok');
      await reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });
}

/* ---------------- 数据加载 ---------------- */
async function reload() {
  DATA = await api('/api/admin/data');
  renderDashboard();
  renderReview();
  renderMilestones();
  renderPhotos();
  renderWishes();
  fillSettings();
}

function initLogout() {
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    location.href = '/admin/login.html';
  });
}

async function boot() {
  initTabs();
  initReviewFilter();
  initMilestoneForm();
  initPhotoForm();
  initWishForm();
  initSettingsForm();
  initLogout();
  try {
    await reload();
  } catch (err) {
    if (err.status !== 401) toast('加载失败：' + err.message, 'error');
  }
}

boot();
