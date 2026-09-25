(() => {
  'use strict';

  const originalRenderHome = typeof renderHome === 'function' ? renderHome : null;

  const icon = paths => `<svg class="lucide" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  const svg = {
    palm: icon('<path d="M13 8c0-2.76-2.46-5-5.5-5S2 5.24 2 8h2l1-1 1 1h4"/><path d="M13 7.14A5.82 5.82 0 0 1 16.5 6c3.04 0 5.5 2.24 5.5 5h-3l-1-1-1 1h-3"/><path d="M5.89 9.71c-2.15 2.15-2.3 5.47-.35 7.43l4.24-4.25.7-.7.71-.71 2.12-2.12c-1.95-1.96-5.27-1.8-7.42.35"/><path d="M11 15.5c.5 2.5-.17 4.5-1 6.5h4c2-5.5-.5-12-1-14"/>'),
    mountain: icon('<path d="m8 3 4 8 5-5 5 15H2L8 3z"/>'),
    waves: icon('<path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>'),
    sun: icon('<circle cx="12" cy="12" r="4"/><path d="M12 3v1"/><path d="M12 20v1"/><path d="M3 12h1"/><path d="M20 12h1"/><path d="m18.364 5.636-.707.707"/><path d="m6.343 17.657-.707.707"/><path d="m5.636 5.636.707.707"/><path d="m17.657 17.657.707.707"/>'),
    plane: icon('<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>'),
    sparkles: icon('<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/>'),
    chevron: icon('<path d="m9 18 6-6-6-6"/>')
  };

  const destinations = [
    { label: 'Нячанг', icon: 'palm' },
    { label: 'Дананг', icon: 'mountain' },
    { label: 'Фукуок', icon: 'waves' },
    { label: 'Муйне/Фантьет', icon: 'sun' },
  ];

  function enhanceHero() {
    const hero = document.querySelector('#homeScreen .hero');
    if (!hero || hero.dataset.luxHero === '2') return;
    hero.dataset.luxHero = '2';
    hero.className = 'hero hero-lux-v30';
    hero.innerHTML = `
      <div class="hero-lux__inner">
        <div class="hero-lux__destinations" aria-label="Направления">
          ${destinations.map(item => `
            <button class="hero-lux__destination" type="button" onclick="quick('city','${item.label.replace(/'/g, "\\'")}')">
              <span class="hero-lux__destination-icon">${svg[item.icon]}</span>
              <span class="hero-lux__destination-label">${item.label}</span>
            </button>`).join('')}
        </div>

        <div class="hero-lux__content">
          <div class="hero-lux__eyebrow">VIETNAM <i>•</i> TOURS <i>•</i> FAST TRACK</div>
          <h1><span>Ваш лучший отдых</span><strong>во Вьетнаме</strong></h1>
          <p>Более 150 экскурсий по всему Вьетнаму, Fast Track в аэропортах, трансферы, индивидуальные программы и авторские путешествия по Юго-Восточной Азии.</p>
        </div>

        <div class="hero-lux__actions">
          <button class="hero-lux__cta hero-lux__cta--primary" type="button" onclick="showScreen('catalog')">
            <span class="hero-lux__cta-icon">${svg.plane}</span>
            <span>Выбрать тур</span>
            <span class="hero-lux__chevron">${svg.chevron}</span>
          </button>
          <button class="hero-lux__cta hero-lux__cta--glass" type="button" onclick="showScreen('ai')">
            <span class="hero-lux__cta-icon">${svg.sparkles}</span>
            <span>ИИ-Помощник</span>
            <span class="hero-lux__chevron">${svg.chevron}</span>
          </button>
        </div>
      </div>`;
  }

  if (originalRenderHome) {
    renderHome = function renderHomeLuxury() {
      originalRenderHome();
      enhanceHero();
    };
  }

  enhanceHero();
  globalThis.MaxTourHero = { enhanceHero };
})();