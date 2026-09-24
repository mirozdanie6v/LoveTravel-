import { useEffect, useRef, useState } from 'react';

export function FullscreenGallery({ images, title, labels = [] }: { images: string[]; title: string; labels?: string[] }) {
  const [active, setActive] = useState<number | null>(null);
  const touchStart = useRef<number | null>(null);
  const count = images.length;
  const close = () => setActive(null);
  const prev = () => setActive((value) => value == null ? null : (value - 1 + count) % count);
  const next = () => setActive((value) => value == null ? null : (value + 1) % count);

  useEffect(() => {
    if (active == null) return;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
      if (event.key === 'ArrowLeft') prev();
      if (event.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = oldOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [active, count]);

  if (!count) return null;
  return <>
    <div className="px-detail-gallery">
      {images.map((src, index) => <figure key={`${src}-${index}`}>
        <button className="px-gallery-open" onClick={() => setActive(index)} aria-label={`Открыть фото ${index + 1} на весь экран`}>
          <img src={src} alt={`${title} — ${labels[index] || `локация ${index + 1}`}`} loading={index > 1 ? 'lazy' : 'eager'} />
          <span className="px-gallery-zoom">↗</span>
        </button>
        <figcaption>{labels[index] || `Локация ${index + 1}`}</figcaption>
      </figure>)}
    </div>
    {active != null && <div className="px-lightbox" role="dialog" aria-modal="true" aria-label={`Фотогалерея: ${title}`} onClick={close}>
      <div className="px-lightbox-top"><span>{active + 1} / {count}</span><button onClick={close} aria-label="Закрыть">×</button></div>
      <button className="px-lightbox-arrow px-lightbox-prev" onClick={(e) => { e.stopPropagation(); prev(); }} aria-label="Предыдущее фото">‹</button>
      <div className="px-lightbox-stage" onClick={(e) => e.stopPropagation()} onTouchStart={(e) => { touchStart.current = e.touches[0]?.clientX ?? null; }} onTouchEnd={(e) => { const start = touchStart.current; const end = e.changedTouches[0]?.clientX; touchStart.current = null; if (start == null || end == null) return; const delta = end - start; if (Math.abs(delta) < 42) return; delta > 0 ? prev() : next(); }}>
        <img src={images[active]} alt={`${title} — ${labels[active] || `локация ${active + 1}`}`} />
        <div className="px-lightbox-caption"><b>{title}</b><span>{labels[active] || `Локация ${active + 1}`}</span><small>Свайпните или используйте стрелки</small></div>
      </div>
      <button className="px-lightbox-arrow px-lightbox-next" onClick={(e) => { e.stopPropagation(); next(); }} aria-label="Следующее фото">›</button>
    </div>}
  </>;
}
