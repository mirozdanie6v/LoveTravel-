import { mkdir, writeFile, copyFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname);
const dist = resolve(root, 'dist');

const html = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#f7fbfe">
  <title>Nha Trang Love Travel</title>
  <link rel="stylesheet" href="/lovetravel-shell.css">
  <link rel="stylesheet" href="/lovetravel-brand.css">
  <link rel="stylesheet" href="/lovetravel-domain-tour.css">
  <link rel="stylesheet" href="/lovetravel-booking-configurator.css">
</head>
<body>
  <div class="phone">
    <header class="top">
      <div class="brandrow">
        <a class="brandmark-real" href="#" aria-label="Nha Trang Love Travel">
          <img src="https://bizweb.dktcdn.net/100/416/263/themes/809458/assets/logo.png?1787117096236" alt="Nha Trang Love Travel" loading="eager">
        </a>
        <div class="mt-language-switcher" aria-label="Language">
          <button type="button" data-locale="ru" class="active">RU</button>
          <button type="button" data-locale="vi">VI</button>
          <button type="button" data-locale="en">EN</button>
        </div>
      </div>
    </header>
    <main>
      <section id="homeScreen" class="screen active"><div class="lt-shell-loading">Загружаем актуальные экскурсии…</div></section>
      <section id="catalogScreen" class="screen"><div class="lt-shell-loading">Загружаем актуальные экскурсии…</div></section>
      <section id="tourScreen" class="screen"></section>
    </main>
    <nav class="bottom-nav" aria-label="Navigation">
      <button type="button" class="nav-btn active" data-screen="home"><span aria-hidden="true">⌂</span><span class="nav-label">Главная</span></button>
      <button type="button" class="nav-btn" data-screen="catalog"><span aria-hidden="true">☰</span><span class="nav-label">Экскурсии</span></button>
    </nav>
  </div>
  <script src="https://telegram.org/js/telegram-web-app.js?63"></script>
  <script src="/lovetravel-shell.js"></script>
  <script src="/lovetravel-runtime.js"></script>
  <script src="/lovetravel-brand.js"></script>
  <script src="/lovetravel-domain-tour.js"></script>
  <script src="/lovetravel-booking-configurator.js"></script>
  <script defer src="https://dashboard.viiversion.com/tracker.js" data-project="LoveTravel"></script>
</body>
</html>`;

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await writeFile(resolve(dist, 'index.html'), html, 'utf8');

for (const file of [
  'lovetravel-shell.css',
  'lovetravel-shell.js',
  'lovetravel-runtime.js',
  'lovetravel-brand.css',
  'lovetravel-brand.js',
  'lovetravel-domain-tour.css',
  'lovetravel-domain-tour.js',
  'lovetravel-booking-configurator.css',
  'lovetravel-booking-configurator.js',
]) {
  await copyFile(resolve(root, 'src', file), resolve(dist, file));
}

console.log('Built standalone LoveTravel customer shell: canonical Bókun catalog + domain tour + booking configurator; no MAX TOUR customer runtime.');
