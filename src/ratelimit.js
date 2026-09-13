'use strict';
// 内存限流：同一 IP 对回忆提交接口设最小间隔，防止刷屏
const hits = new Map();

function check(ip, minIntervalMs) {
  const last = hits.get(ip) || 0;
  const now = Date.now();
  if (now - last < minIntervalMs) return false;
  hits.set(ip, now);
  return true;
}

setInterval(() => {
  const cutoff = Date.now() - 1000 * 60 * 30;
  for (const [k, v] of hits) if (v < cutoff) hits.delete(k);
}, 60000).unref();

module.exports = { check };
