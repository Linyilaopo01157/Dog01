/* ============================================================
   01 · Service Worker
   ① 离线也能打开小窝  ② Web Push（页面关了也能来敲门）
   ★ 每次更新 index.html 后，把 v1 改成 v2，旧缓存自动清掉
   ============================================================ */
const VERSION = 'p01-v1';
/* 若 HTML 不叫 index.html，把 './' 换成 './你的文件名.html' */
const APP_URL = './';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => c.addAll([APP_URL]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

/* 页面导航：网络优先（3 秒超时回落缓存）→ 平时能收到更新，断网也秒开
   其余 GET（字体等）：缓存优先 + 后台静默更新 → 首次联网后永久离线可用 */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  if (req.mode === 'navigate') {
    e.respondWith(
      Promise.race([
        fetch(req).then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then(c => { c.put(APP_URL, copy); c.put(req, copy); });
          }
          return res;
        }),
        new Promise(r => setTimeout(() =>
          r(caches.match(req).then(m => m || caches.match(APP_URL))), 3000))
      ]).catch(() => caches.match(req).then(m => m || caches.match(APP_URL)))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(cached => {
      const net = fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || net;
    })
  );
});

/* Web Push：门关了，01 也会来敲门 */
self.addEventListener('push', e => {
  let data = { title: '01', body: '汪！想你了，回来看看我呀。', url: APP_URL };
  try { data = Object.assign(data, e.data.json()); } catch (_) {}
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: 'p01',
      renotify: true,
      data: { url: data.url },
      vibrate: [80, 40, 80]
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || APP_URL;
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (list.length) { await list[0].focus(); return; }
    await self.clients.openWindow(url);
  })());
});
