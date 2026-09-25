(() => {
  const MEDIA_PREFIX = '/tour-media/';
  let modal = null;
  let modalImage = null;
  let counter = null;
  let titleNode = null;
  let prevButton = null;
  let nextButton = null;
  let thumbs = null;
  let gallery = [];
  let index = 0;
  let previousOverflow = '';
  let catalogPromise = null;
  let touchStartX = null;
  let sourceImage = null;
  let openSequence = 0;
  let renderedGalleryKey = '';

  function pathFromImage(image) {
    try {
      return new URL(image.currentSrc || image.src, window.location.href).pathname;
    } catch {
      return '';
    }
  }

  function isTourImage(image) {
    return image instanceof HTMLImageElement && pathFromImage(image).startsWith(MEDIA_PREFIX);
  }

  function loadCatalog() {
    if (!catalogPromise) {
      catalogPromise = fetch('/catalog.v28.json', { cache: 'no-store' })
        .then(response => {
          if (!response.ok) throw new Error(`catalog HTTP ${response.status}`);
          return response.json();
        })
        .catch(() => []);
    }
    return catalogPromise;
  }

  function uniquePaths(values) {
    return [...new Set(values.filter(value => typeof value === 'string' && value.startsWith(MEDIA_PREFIX)))];
  }

  async function resolveGallery(path) {
    const catalog = await loadCatalog();
    const tour = Array.isArray(catalog)
      ? catalog.find(item => uniquePaths([item.image, item.fallbackImage, ...(item.gallery || [])]).includes(path))
      : null;
    if (!tour) return { paths: [path], title: '' };
    const paths = uniquePaths([...(tour.gallery || []), tour.image, tour.fallbackImage]);
    return { paths: paths.length ? paths : [path], title: String(tour.title || '') };
  }

  function ensureModal() {
    if (modal) return;
    modal = document.createElement('div');
    modal.className = 'tour-lightbox';
    modal.hidden = true;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Просмотр фотографий экскурсии');
    modal.innerHTML = `
      <div class="tour-lightbox__backdrop" data-lightbox-close></div>
      <div class="tour-lightbox__stage">
        <button class="tour-lightbox__close" type="button" data-lightbox-close aria-label="Закрыть галерею">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
        <button class="tour-lightbox__nav tour-lightbox__nav--prev" type="button" data-lightbox-prev aria-label="Предыдущее фото">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <figure class="tour-lightbox__figure">
          <div class="tour-lightbox__main">
            <img class="tour-lightbox__image" alt="Фотография экскурсии">
          </div>
          <figcaption class="tour-lightbox__caption">
            <span class="tour-lightbox__title"></span>
            <span class="tour-lightbox__counter"></span>
          </figcaption>
          <div class="tour-lightbox__thumbs" role="listbox" aria-label="Фотографии тура"></div>
        </figure>
        <button class="tour-lightbox__nav tour-lightbox__nav--next" type="button" data-lightbox-next aria-label="Следующее фото">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>`;
    document.body.appendChild(modal);
    modalImage = modal.querySelector('.tour-lightbox__image');
    counter = modal.querySelector('.tour-lightbox__counter');
    titleNode = modal.querySelector('.tour-lightbox__title');
    thumbs = modal.querySelector('.tour-lightbox__thumbs');
    prevButton = modal.querySelector('[data-lightbox-prev]');
    nextButton = modal.querySelector('[data-lightbox-next]');

    modal.addEventListener('click', event => {
      const thumb = event.target.closest('[data-lightbox-index]');
      if (thumb) {
        const nextIndex = Number(thumb.dataset.lightboxIndex);
        if (Number.isInteger(nextIndex) && nextIndex >= 0 && nextIndex < gallery.length) {
          index = nextIndex;
          render();
        }
        return;
      }
      if (event.target.closest('[data-lightbox-close]')) {
        close();
        return;
      }
      if (event.target.closest('[data-lightbox-prev]')) {
        move(-1);
        return;
      }
      if (event.target.closest('[data-lightbox-next]')) move(1);
    });

    modal.addEventListener('touchstart', event => {
      if (event.target.closest('.tour-lightbox__thumbs')) return;
      touchStartX = event.touches?.[0]?.clientX ?? null;
    }, { passive: true });
    modal.addEventListener('touchend', event => {
      if (touchStartX == null) return;
      const endX = event.changedTouches?.[0]?.clientX;
      if (typeof endX === 'number' && Math.abs(endX - touchStartX) > 55 && gallery.length > 1) {
        move(endX < touchStartX ? 1 : -1);
      }
      touchStartX = null;
    }, { passive: true });
  }

  function renderThumbnails() {
    if (!thumbs) return;
    const galleryKey = gallery.join('|');
    if (galleryKey !== renderedGalleryKey) {
      renderedGalleryKey = galleryKey;
      thumbs.replaceChildren(...gallery.map((src, thumbIndex) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'tour-lightbox__thumb';
        button.dataset.lightboxIndex = String(thumbIndex);
        button.setAttribute('role', 'option');
        button.setAttribute('aria-label', `Открыть фото ${thumbIndex + 1} из ${gallery.length}`);
        const image = document.createElement('img');
        image.src = src;
        image.alt = '';
        image.loading = 'eager';
        image.decoding = 'async';
        button.appendChild(image);
        return button;
      }));
    }

    thumbs.hidden = gallery.length < 2;
    [...thumbs.children].forEach((button, thumbIndex) => {
      const active = thumbIndex === index;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
      if (active) button.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    });
  }

  function render() {
    if (!modalImage || !gallery.length) return;
    modalImage.src = gallery[index];
    counter.textContent = gallery.length > 1 ? `${index + 1} / ${gallery.length}` : '';
    const hasMultiple = gallery.length > 1;
    prevButton.hidden = !hasMultiple;
    nextButton.hidden = !hasMultiple;
    renderThumbnails();
  }

  function move(delta) {
    if (gallery.length < 2) return;
    index = (index + delta + gallery.length) % gallery.length;
    render();
  }

  async function open(path, alt = '', trigger = null) {
    ensureModal();
    const sequence = ++openSequence;
    sourceImage = trigger instanceof HTMLElement ? trigger : null;
    gallery = [path];
    renderedGalleryKey = '';
    index = 0;
    modalImage.alt = alt || 'Фотография экскурсии';
    titleNode.textContent = '';
    render();
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add('is-open'));
    modal.querySelector('.tour-lightbox__close').focus({ preventScroll: true });

    const resolved = await resolveGallery(path);
    if (sequence !== openSequence || modal.hidden) return;
    gallery = resolved.paths;
    renderedGalleryKey = '';
    index = Math.max(0, gallery.indexOf(path));
    titleNode.textContent = resolved.title;
    render();
  }

  function close() {
    if (!modal || modal.hidden) return;
    ++openSequence;
    modal.classList.remove('is-open');
    document.body.style.overflow = previousOverflow;
    const focusTarget = sourceImage;
    window.setTimeout(() => {
      if (!modal.classList.contains('is-open')) {
        modal.hidden = true;
        if (focusTarget?.isConnected) focusTarget.focus?.({ preventScroll: true });
      }
    }, 180);
  }

  document.addEventListener('click', event => {
    const image = event.target.closest?.('img');
    if (!isTourImage(image)) return;
    if (modal?.contains(image)) return;
    event.preventDefault();
    event.stopPropagation();
    open(pathFromImage(image), image.alt || '', image);
  }, true);

  document.addEventListener('keydown', event => {
    if (!modal || modal.hidden) return;
    if (event.key === 'Escape') close();
    if (event.key === 'ArrowLeft') move(-1);
    if (event.key === 'ArrowRight') move(1);
  });
})();
