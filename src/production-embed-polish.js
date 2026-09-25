(() => {
  const referrerHost = (() => {
    try { return new URL(document.referrer).hostname; } catch { return ''; }
  })();
  const isDirectProduction = location.hostname === 'max-tour.viiversion.com';
  const isProductionEmbed = window.parent !== window && referrerHost === 'max-tour.viiversion.com';
  if (!isDirectProduction && !isProductionEmbed) return;

  document.documentElement.classList.add('max-tour-production-embed');

  const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim();
  const upper = (value) => normalize(value).toLocaleUpperCase('ru-RU');

  const TOUR_TITLES = [
    'Далат «Премиум»',
    'Далат «ВИП»',
    'Провинция Фуйен',
    'Дневная обзорная по Нячангу',
    'Вечерняя обзорная по Нячангу',
    'Далат на 2 дня',
    'Fast Track + трансфер',
    'Ба На Хилл, Золотой мост и Хойан',
    'Дананг: Сон Тра, Мраморные горы и мосты',
    'Фукуок: 4 острова и канатная дорога',
    'VinWonders и Safari Фукуок',
    'Ханой и бухта Халонг',
    'Ханой и Сапа',
    'Ниньбинь: Чанган и пещера Муа',
    'Муйне: дюны, Рыбацкая деревня и ручей Фей',
  ];

  // Curated against MAX TOUR's official site / verified location photography.
  // These overrides intentionally target only the production host/embed.
  const TOUR_IMAGE_OVERRIDES = new Map([
    ['Дневная обзорная по Нячангу', 'https://static.tildacdn.one/tild6434-3137-4937-a636-666233396436/nha-trang-city-tour-.png'],
    ['Вечерняя обзорная по Нячангу', 'https://static.tildacdn.one/tild6263-3330-4138-a533-383463316634/nha-trang-city-tour-.png'],
    ['Ба На Хилл, Золотой мост и Хойан', 'https://static.tildacdn.one/tild3163-3961-4362-b065-623331613939/danang-.png'],
    ['Ханой и Сапа', 'https://static.tildacdn.one/tild6339-3238-4939-b762-666433376534/hanoi-sapa-3-dnya-2-.png'],
    ['Ниньбинь: Чанган и пещера Муа', 'https://static.tildacdn.one/tild3337-6538-4035-a135-336439653834/Ninh_Binh3.png'],
    ['Муйне: дюны, Рыбацкая деревня и ручей Фей', 'https://images.unsplash.com/photo-1591252215923-9fa0072a556d?auto=format&fit=crop&w=1600&q=85'],
  ]);

  const exactLeaves = (label) => {
    const wanted = upper(label);
    return [...document.querySelectorAll('body *')].filter((el) => {
      if (upper(el.textContent) !== wanted) return false;
      return ![...el.children].some((child) => normalize(child.textContent));
    });
  };

  const exactLeaf = (label) => exactLeaves(label)[0] || null;

  const radius = (el) => {
    const cs = getComputedStyle(el);
    return Math.max(
      parseFloat(cs.borderTopLeftRadius) || 0,
      parseFloat(cs.borderTopRightRadius) || 0,
      parseFloat(cs.borderBottomLeftRadius) || 0,
      parseFloat(cs.borderBottomRightRadius) || 0,
    );
  };

  const chooseTile = (leaf, mode = 'small') => {
    let node = leaf?.parentElement || null;
    let best = null;
    let bestScore = -Infinity;
    for (let depth = 0; node && node !== document.body && depth < 6; depth += 1, node = node.parentElement) {
      const rect = node.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const cs = getComputedStyle(node);
      let score = 0;
      if (radius(node) >= 12) score += 5;
      if ((parseFloat(cs.borderTopWidth) || 0) > 0) score += 2;
      if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') score += 1;
      if (mode === 'small') {
        if (rect.width <= innerWidth * 0.52) score += 4;
        if (rect.height >= 48 && rect.height <= 230) score += 3;
      } else {
        if (rect.width >= innerWidth * 0.65) score += 4;
        if (rect.height >= 64 && rect.height <= 240) score += 3;
      }
      if (node.querySelectorAll('*').length <= 10) score += 1;
      if (score > bestScore) {
        best = node;
        bestScore = score;
      }
    }
    return best;
  };

  const centerKnownDetailTiles = () => {
    ['ВЗРОСЛЫЙ', 'РЕБЁНОК', 'МАЛЫШИ', 'ДЕПОЗИТ', 'ГРУППА', 'ВОЗВРАТ'].forEach((label) => {
      const leaf = exactLeaf(label);
      const tile = chooseTile(leaf, 'small');
      if (tile) tile.classList.add('production-center-tile');
    });

    ['Маршрут', 'Включено'].forEach((label) => {
      const leaf = exactLeaf(label);
      const tile = chooseTile(leaf, 'wide');
      if (tile && leaf) {
        tile.classList.add('production-center-wide');
        leaf.classList.add('production-center-label');
      }
    });
  };

  const centerCompactRoundedTiles = () => {
    document.querySelectorAll('div,button,a,li,article,span').forEach((el) => {
      if (el.closest('.production-center-wide')) return;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      if (rect.width > innerWidth * 0.52 || rect.height < 34 || rect.height > 210) return;
      if (radius(el) < 12) return;
      const text = normalize(el.textContent);
      if (!text || text.length > 110) return;
      if (el.querySelectorAll('*').length > 7) return;
      el.classList.add('production-center-tile');
    });
  };

  const markShowButtons = () => {
    document.querySelectorAll('button,[role="button"]').forEach((button) => {
      const label = normalize(button.textContent).replace(/→/g, '').trim();
      if (button.classList.contains('cf-show-v26') || label === 'Показать') {
        button.classList.add('production-show-button');
      }
    });
  };

  const isPlausibleTourImage = (img) => {
    if (!(img instanceof HTMLImageElement)) return false;
    const src = img.currentSrc || img.src || '';
    if (!src || src.includes('max-tour-logo') || src.endsWith('.svg')) return false;
    const alt = normalize(img.alt).toLowerCase();
    if (alt.includes('logo') || alt.includes('логотип')) return false;
    const rect = img.getBoundingClientRect();
    return rect.width >= 120 && rect.height >= 70;
  };

  const visibleTourImagesIn = (container) => [...container.querySelectorAll('img')].filter(isPlausibleTourImage);

  const findTourContainer = (leaf) => {
    let node = leaf?.parentElement || null;
    let fallback = null;
    for (let depth = 0; node && node !== document.body && depth < 9; depth += 1, node = node.parentElement) {
      const rect = node.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const images = visibleTourImagesIn(node);
      if (!images.length) continue;
      if (!fallback) fallback = node;
      const cls = String(node.className || '').toLowerCase();
      if (node.matches('article,a,button,li') || /tour|card|item|detail|screen/.test(cls)) return node;
    }
    return fallback;
  };

  const setTourImage = (img, title, url) => {
    if (!img || !url) return;
    if (img.dataset.productionTourOverride !== url) {
      img.removeAttribute('srcset');
      img.removeAttribute('data-srcset');
      img.removeAttribute('data-original');
      img.removeAttribute('data-lazy-src');
      const picture = img.closest('picture');
      picture?.querySelectorAll('source').forEach((source) => source.removeAttribute('srcset'));
      img.src = url;
      img.dataset.productionTourOverride = url;
    }
    img.alt = title;
  };

  // Keep the audited/corrected cover photos, but covers/cards must NOT open the lightbox.
  const applyTourImages = () => {
    TOUR_TITLES.forEach((title) => {
      exactLeaves(title).forEach((leaf) => {
        if (!leaf.getBoundingClientRect().width) return;
        const container = findTourContainer(leaf);
        if (!container) return;
        const images = visibleTourImagesIn(container);
        if (!images.length) return;

        const override = TOUR_IMAGE_OVERRIDES.get(title);
        if (override) setTourImage(images[0], title, override);
      });
    });
  };

  const currentTourTitle = () => {
    for (const title of TOUR_TITLES) {
      const visible = exactLeaves(title).find((leaf) => {
        const rect = leaf.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      if (visible) return title;
    }
    return 'Экскурсия';
  };

  const clearPhotoInteraction = (img) => {
    img.classList.remove('production-tour-photo');
    delete img.dataset.productionTourTitle;
    delete img.dataset.productionTourGallery;
    img.removeAttribute('role');
    img.removeAttribute('tabindex');
    img.removeAttribute('aria-label');
  };

  const findPhotoTourGallery = () => {
    const heading = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,div,span')].find((el) => {
      if (upper(el.textContent) !== 'ФОТО ТУРА') return false;
      return ![...el.children].some((child) => normalize(child.textContent));
    });
    if (!heading) return null;

    const galleries = [...document.querySelectorAll('.t-gallery')].filter((gallery) => {
      const rect = gallery.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && gallery.querySelector('img.t-gallery__image');
    });
    if (!galleries.length) return null;

    return galleries.find((gallery) => Boolean(heading.compareDocumentPosition(gallery) & Node.DOCUMENT_POSITION_FOLLOWING)) || null;
  };

  const markPhotoTourGallery = () => {
    // Remove the old broad behavior from cards, hero images and any non-gallery photos.
    document.querySelectorAll('img.production-tour-photo').forEach(clearPhotoInteraction);

    const gallery = findPhotoTourGallery();
    if (!gallery) return;

    const title = currentTourTitle();
    const images = [...gallery.querySelectorAll('img.t-gallery__image')].filter(isPlausibleTourImage);
    images.forEach((img, index) => {
      img.classList.add('production-tour-photo');
      img.dataset.productionTourTitle = title;
      img.dataset.productionTourGallery = 'photo-tour';
      if (!normalize(img.alt)) img.alt = `${title} — фото ${index + 1}`;
      img.setAttribute('role', 'button');
      img.setAttribute('tabindex', '0');
      img.setAttribute('aria-label', `Открыть фото ${index + 1} из раздела «Фото тура»`);
    });
  };

  let lightbox = null;
  let lightboxImage = null;
  let lightboxCaption = null;
  let lightboxPrev = null;
  let lightboxNext = null;
  let lightboxGallery = [];
  let lightboxIndex = 0;

  const ensureLightbox = () => {
    if (lightbox) return;
    lightbox = document.createElement('div');
    lightbox.className = 'production-tour-lightbox';
    lightbox.setAttribute('aria-hidden', 'true');
    lightbox.innerHTML = `
      <button type="button" class="production-tour-lightbox-close" aria-label="Закрыть фото">×</button>
      <button type="button" class="production-tour-lightbox-nav production-tour-lightbox-prev" aria-label="Предыдущее фото">‹</button>
      <figure class="production-tour-lightbox-figure">
        <img class="production-tour-lightbox-image" alt="">
        <figcaption class="production-tour-lightbox-caption"></figcaption>
      </figure>
      <button type="button" class="production-tour-lightbox-nav production-tour-lightbox-next" aria-label="Следующее фото">›</button>
    `;
    document.body.appendChild(lightbox);
    lightboxImage = lightbox.querySelector('.production-tour-lightbox-image');
    lightboxCaption = lightbox.querySelector('.production-tour-lightbox-caption');
    lightboxPrev = lightbox.querySelector('.production-tour-lightbox-prev');
    lightboxNext = lightbox.querySelector('.production-tour-lightbox-next');

    const close = () => {
      lightbox.classList.remove('is-open');
      lightbox.setAttribute('aria-hidden', 'true');
      document.documentElement.classList.remove('production-lightbox-open');
      document.body.classList.remove('production-lightbox-open');
    };
    lightbox.querySelector('.production-tour-lightbox-close').addEventListener('click', close);
    lightbox.addEventListener('click', (event) => {
      if (event.target === lightbox) close();
    });
    lightboxPrev.addEventListener('click', () => showLightboxAt(lightboxIndex - 1));
    lightboxNext.addEventListener('click', () => showLightboxAt(lightboxIndex + 1));
    document.addEventListener('keydown', (event) => {
      if (!lightbox?.classList.contains('is-open')) return;
      if (event.key === 'Escape') close();
      if (event.key === 'ArrowLeft') showLightboxAt(lightboxIndex - 1);
      if (event.key === 'ArrowRight') showLightboxAt(lightboxIndex + 1);
    });
  };

  const showLightboxAt = (nextIndex) => {
    if (!lightboxGallery.length) return;
    lightboxIndex = (nextIndex + lightboxGallery.length) % lightboxGallery.length;
    const active = lightboxGallery[lightboxIndex];
    lightboxImage.src = active.currentSrc || active.src;
    lightboxImage.alt = active.alt || active.dataset.productionTourTitle || 'Фото экскурсии';
    const title = active.dataset.productionTourTitle || 'Экскурсия';
    lightboxCaption.textContent = lightboxGallery.length > 1
      ? `${title} · ${lightboxIndex + 1}/${lightboxGallery.length}`
      : title;
    const multiple = lightboxGallery.length > 1;
    lightboxPrev.hidden = !multiple;
    lightboxNext.hidden = !multiple;
  };

  const openTourLightbox = (img) => {
    ensureLightbox();
    const gallery = img.closest('.t-gallery');
    lightboxGallery = gallery
      ? [...gallery.querySelectorAll('img.production-tour-photo')].filter(isPlausibleTourImage)
      : [img];
    if (!lightboxGallery.length) lightboxGallery = [img];
    lightboxIndex = Math.max(0, lightboxGallery.indexOf(img));
    showLightboxAt(lightboxIndex);
    lightbox.classList.add('is-open');
    lightbox.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('production-lightbox-open');
    document.body.classList.add('production-lightbox-open');
    requestAnimationFrame(() => lightbox.querySelector('.production-tour-lightbox-close')?.focus({ preventScroll: true }));
  };

  const tourPhotoFromEvent = (event) => event.target?.closest?.('.t-gallery img.production-tour-photo') || null;

  document.addEventListener('click', (event) => {
    const img = tourPhotoFromEvent(event);
    if (!img) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openTourLightbox(img);
  }, true);

  document.addEventListener('keydown', (event) => {
    const img = tourPhotoFromEvent(event);
    if (!img || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    event.stopPropagation();
    openTourLightbox(img);
  }, true);

  const pressedButtonFromEvent = (event) => event.target?.closest?.('.production-show-button') || null;
  const releasePressed = (button) => {
    if (!button) return;
    setTimeout(() => button.classList.remove('production-show-pressed'), 140);
  };

  document.addEventListener('pointerdown', (event) => {
    const button = pressedButtonFromEvent(event);
    if (button) button.classList.add('production-show-pressed');
  }, true);

  document.addEventListener('pointerup', (event) => releasePressed(pressedButtonFromEvent(event)), true);
  document.addEventListener('pointercancel', (event) => releasePressed(pressedButtonFromEvent(event)), true);

  document.addEventListener('click', (event) => {
    const button = pressedButtonFromEvent(event);
    if (!button) return;
    button.classList.remove('production-show-applied');
    void button.offsetWidth;
    button.classList.add('production-show-applied');
    setTimeout(() => button.classList.remove('production-show-applied'), 650);
  }, true);

  let scheduled = false;
  const apply = () => {
    scheduled = false;
    centerKnownDetailTiles();
    centerCompactRoundedTiles();
    markShowButtons();
    applyTourImages();
    markPhotoTourGallery();
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(apply);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule, { once: true });
  } else {
    schedule();
  }

  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style'],
  });
  addEventListener('resize', schedule, { passive: true });
})();