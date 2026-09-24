import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from './lib/api';
import type { Tour } from '../shared/types';

type ChildRuleDraft = {
  type: 'height' | 'age';
  min: string;
  max: string;
  price: string;
  label: string;
};

type PrivateTierDraft = {
  minPeople: string;
  maxPeople: string;
  total: string;
  perPerson: string;
};

type TourDraft = {
  title: string;
  direction: string;
  category: string;
  sourceUrl: string;
  priceMode: Tour['priceMode'];
  adultPrice: string;
  adultFromPrice: string;
  pricingNote: string;
  childRules: ChildRuleDraft[];
  privateTiers: PrivateTierDraft[];
  requiredFields: string;
  scheduleMode: Tour['scheduleMode'];
  pickup: string;
  back: string;
  description: string;
  program: string;
  included: string;
  extraCosts: string;
  whatToTake: string;
  badges: string;
  images: string[];
  published: boolean;
  promoEnabled: boolean;
  promoLabel: string;
  promoValue: string;
};

const LOGO_SRC = 'https://static.tildacdn.one/tild3063-6230-4266-b063-313839663461/____1680_x_600_-4.jpg';

const centsToInput = (value?: number) => value == null ? '' : String(value / 100);
const inputToCents = (value: string) => Math.max(0, Math.round((Number(value.replace(',', '.')) || 0) * 100));
const inputToOptionalNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const result = Number(trimmed.replace(',', '.'));
  return Number.isFinite(result) ? result : undefined;
};
const linesToText = (items: string[]) => items.join('\n');
const textToLines = (value: string) => value.split('\n').map((item) => item.trim()).filter(Boolean);

function toDraft(tour: Tour): TourDraft {
  return {
    title: tour.title,
    direction: tour.direction,
    category: tour.category,
    sourceUrl: tour.sourceUrl,
    priceMode: tour.priceMode,
    adultPrice: centsToInput(tour.pricingRules.adultMinor),
    adultFromPrice: centsToInput(tour.pricingRules.adultFromMinor),
    pricingNote: tour.pricingRules.note ?? '',
    childRules: tour.pricingRules.childRules.map((rule) => ({
      type: rule.type,
      min: rule.min == null ? '' : String(rule.min),
      max: rule.max == null ? '' : String(rule.max),
      price: centsToInput(rule.priceMinor),
      label: rule.label,
    })),
    privateTiers: (tour.pricingRules.privateTiers ?? []).map((tier) => ({
      minPeople: String(tier.minPeople),
      maxPeople: String(tier.maxPeople),
      total: centsToInput(tier.totalMinor),
      perPerson: centsToInput(tier.perPersonMinor),
    })),
    requiredFields: linesToText(tour.requiredFields),
    scheduleMode: tour.scheduleMode,
    pickup: tour.pickup ?? '',
    back: tour.back ?? '',
    description: tour.description,
    program: linesToText(tour.program),
    included: linesToText(tour.included),
    extraCosts: linesToText(tour.extraCosts),
    whatToTake: linesToText(tour.whatToTake),
    badges: linesToText(tour.badges),
    images: [...tour.images],
    published: tour.published,
    promoEnabled: Boolean(tour.promo?.enabled),
    promoLabel: tour.promo?.label ?? '',
    promoValue: tour.promo?.value ?? '',
  };
}

function editorTourId(pathname: string) {
  const match = pathname.match(/^\/admin\/tours\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]!) : '';
}

export function UnifiedAdminTourPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const tourId = editorTourId(location.pathname);
  const [tour, setTour] = useState<Tour | null>(null);
  const [form, setForm] = useState<TourDraft | null>(null);
  const [directions, setDirections] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        await api.session();
        const [tourResult, directionsResult] = await Promise.all([
          api.tour(tourId),
          api.directions().catch(() => ({ items: [] })),
        ]);
        if (!active) return;
        setTour(tourResult.item);
        setForm(toDraft(tourResult.item));
        setDirections(directionsResult.items.map((item) => item.name));
      } catch (cause) {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : 'Не удалось загрузить экскурсию');
      } finally {
        if (active) setLoading(false);
      }
    };
    if (tourId) void load();
    else {
      setError('Экскурсия не найдена');
      setLoading(false);
    }
    return () => { active = false; };
  }, [tourId]);

  const previewImage = useMemo(() => form?.images.find((url) => url.trim()) ?? '', [form?.images]);

  const setField = <K extends keyof TourDraft>(key: K, value: TourDraft[K]) => {
    setForm((current) => current ? { ...current, [key]: value } : current);
  };

  const updateChildRule = (index: number, patch: Partial<ChildRuleDraft>) => {
    if (!form) return;
    setField('childRules', form.childRules.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, ...patch } : rule));
  };

  const updatePrivateTier = (index: number, patch: Partial<PrivateTierDraft>) => {
    if (!form) return;
    setField('privateTiers', form.privateTiers.map((tier, tierIndex) => tierIndex === index ? { ...tier, ...patch } : tier));
  };

  const updateImage = (index: number, value: string) => {
    if (!form) return;
    setField('images', form.images.map((url, imageIndex) => imageIndex === index ? value : url));
  };

  const moveImage = (index: number, direction: -1 | 1) => {
    if (!form) return;
    const target = index + direction;
    if (target < 0 || target >= form.images.length) return;
    const next = [...form.images];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setField('images', next);
  };

  const save = async () => {
    if (!tour || !form || busy) return;
    setBusy(true);
    setSaved(false);
    setError('');
    try {
      const childRules = form.childRules.map((rule) => ({
        type: rule.type,
        ...(inputToOptionalNumber(rule.min) == null ? {} : { min: inputToOptionalNumber(rule.min) }),
        ...(inputToOptionalNumber(rule.max) == null ? {} : { max: inputToOptionalNumber(rule.max) }),
        priceMinor: inputToCents(rule.price),
        label: rule.label.trim(),
      }));
      const privateTiers = form.privateTiers.map((tier) => ({
        minPeople: Math.max(1, Math.round(inputToOptionalNumber(tier.minPeople) ?? 1)),
        maxPeople: Math.max(1, Math.round(inputToOptionalNumber(tier.maxPeople) ?? 1)),
        ...(tier.total.trim() ? { totalMinor: inputToCents(tier.total) } : {}),
        ...(tier.perPerson.trim() ? { perPersonMinor: inputToCents(tier.perPerson) } : {}),
      }));

      await Promise.all([
        api.patchTour(tour.id, {
          title: form.title.trim(),
          direction: form.direction.trim(),
          category: form.category.trim(),
          sourceUrl: form.sourceUrl.trim(),
          priceMode: form.priceMode,
          pricingRules: {
            adultMinor: form.priceMode === 'fixed' ? inputToCents(form.adultPrice) : null,
            adultFromMinor: form.priceMode === 'from-price' ? inputToCents(form.adultFromPrice || form.adultPrice) : null,
            childRules,
            privateTiers,
            note: form.pricingNote.trim(),
          },
          requiredFields: textToLines(form.requiredFields),
          scheduleMode: form.scheduleMode,
          pickup: form.pickup.trim(),
          back: form.back.trim(),
          description: form.description,
          program: textToLines(form.program),
          included: textToLines(form.included),
          extraCosts: textToLines(form.extraCosts),
          whatToTake: textToLines(form.whatToTake),
          badges: textToLines(form.badges),
          images: form.images.map((url) => url.trim()).filter(Boolean),
          published: form.published,
        }),
        api.promo(tour.id, {
          enabled: form.promoEnabled,
          label: form.promoLabel.trim(),
          value: form.promoValue.trim(),
        }),
      ]);

      const refreshed = await api.tour(tour.id);
      setTour(refreshed.item);
      setForm(toDraft(refreshed.item));
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2200);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить изменения');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <main className="px-loading"><div className="px-monogram">MT</div><h1>Экскурсия</h1><p>Загружаем единую форму редактирования</p></main>;
  }

  if (!form || !tour) {
    return <main className="px-loading"><div className="px-monogram">MT</div><h1>Не удалось открыть экскурсию</h1><p>{error || 'Данные недоступны'}</p><button className="px-button px-button-light" onClick={() => navigate('/admin')}>Вернуться в каталог</button></main>;
  }

  const directionOptions = Array.from(new Set([form.direction, ...directions].filter(Boolean)));

  return <div className="px-app px-backoffice">
    <header className="px-header">
      <button className="px-brand-button" onClick={() => navigate('/')} aria-label="MAX TOUR — на главную"><div className="px-logo-wrap"><img className="px-logo-image px-logo-official" src={LOGO_SRC} alt="MAX TOUR" /></div></button>
      <span className="px-header-title">Экскурсия</span>
      <button className="mt-editor-back" onClick={() => navigate('/admin')}>← Каталог</button>
    </header>

    <main className="px-content px-wide">
      <section className="px-office-hero">
        <div><span className="px-kicker">MAX TOUR · ADMIN DEMO</span><h1>Редактирование экскурсии</h1></div>
        <span className="px-demo-pill">ЕДИНАЯ ФОРМА</span>
      </section>
      <nav className="px-office-tabs">
        <button onClick={() => navigate('/admin')}>Каталог</button>
        <button onClick={() => navigate('/admin/schedule')}>Расписание</button>
        <button onClick={() => navigate('/admin/groups')}>Группы</button>
        <button onClick={() => navigate('/admin/crm')}>CRM</button>
        <button onClick={() => navigate('/admin/analytics')}>Аналитика</button>
        <button onClick={() => navigate('/admin/directions')}>Направления</button>
      </nav>

      {error && <div className="px-notice">{error}</div>}

      <form className="px-edit-form mt-unified-editor" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <section className="px-edit-preview mt-editor-preview">
          {previewImage ? <img src={previewImage} alt={form.title || tour.title} /> : <div className="mt-preview-empty">Нет фотографии</div>}
          <div><span className="px-kicker">LIVE DEMO PREVIEW</span><h2>{form.title || tour.title}</h2><p>{form.direction || 'Направление'} · {form.category || 'Категория'}</p></div>
        </section>

        <div className="mt-editor-statusline">
          <span>ID: <b>{tour.id}</b></span><span>Slug: <b>{tour.slug}</b></span><span>Источник данных: <b>{tour.dataStatus}</b></span>
        </div>

        <EditorSection title="Основная информация" note="Название, направление, категория, публикация и источник страницы.">
          <div className="px-admin-editor-grid">
            <label className="px-field"><span>Название</span><input value={form.title} onChange={(event) => setField('title', event.target.value)} /></label>
            <label className="px-field"><span>Направление</span><select value={form.direction} onChange={(event) => setField('direction', event.target.value)}>{directionOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label className="px-field"><span>Категория</span><input value={form.category} onChange={(event) => setField('category', event.target.value)} placeholder="Например, Премиум экскурсии" /></label>
            <label className="px-field"><span>Режим расписания</span><select value={form.scheduleMode} onChange={(event) => setField('scheduleMode', event.target.value as Tour['scheduleMode'])}><option value="demoDates">Даты / доступность</option><option value="request">По запросу</option></select></label>
          </div>
          <label className="px-field"><span>Официальный источник / URL</span><input value={form.sourceUrl} onChange={(event) => setField('sourceUrl', event.target.value)} /></label>
          <label className="px-owner-check"><input type="checkbox" checked={form.published} onChange={(event) => setField('published', event.target.checked)} /><span>Показывать экскурсию туристу</span></label>
        </EditorSection>

        <EditorSection title="Цена и тарифы" note="Все тарифные правила экскурсии редактируются здесь и сохраняются одной кнопкой вместе с остальными данными.">
          <div className="px-admin-editor-grid">
            <label className="px-field"><span>Режим цены</span><select value={form.priceMode} onChange={(event) => setField('priceMode', event.target.value as Tour['priceMode'])}><option value="fixed">Фиксированная</option><option value="from-price">От указанной цены</option><option value="dynamic-request">Цена по запросу</option></select></label>
            {form.priceMode === 'fixed' ? <label className="px-field"><span>Цена взрослого, $</span><input type="number" min="0" step="0.01" value={form.adultPrice} onChange={(event) => setField('adultPrice', event.target.value)} /></label> : null}
            {form.priceMode === 'from-price' ? <label className="px-field"><span>Цена от, $</span><input type="number" min="0" step="0.01" value={form.adultFromPrice || form.adultPrice} onChange={(event) => setField('adultFromPrice', event.target.value)} /></label> : null}
          </div>
          <label className="px-field"><span>Комментарий к цене</span><input value={form.pricingNote} onChange={(event) => setField('pricingNote', event.target.value)} placeholder="Условия, особенности расчёта" /></label>

          <div className="mt-subsection-head"><div><b>Детские тарифы</b><span>Возраст или рост, диапазон и цена.</span></div><button type="button" className="mt-small-button" onClick={() => setField('childRules', [...form.childRules, { type: 'height', min: '', max: '', price: '', label: '' }])}>+ Добавить тариф</button></div>
          <div className="mt-rule-list">{form.childRules.map((rule, index) => <div className="mt-rule-card" key={`child-${index}`}>
            <label className="px-field"><span>Тип</span><select value={rule.type} onChange={(event) => updateChildRule(index, { type: event.target.value as ChildRuleDraft['type'] })}><option value="height">Рост, см</option><option value="age">Возраст, лет</option></select></label>
            <label className="px-field"><span>От</span><input type="number" min="0" value={rule.min} onChange={(event) => updateChildRule(index, { min: event.target.value })} /></label>
            <label className="px-field"><span>До</span><input type="number" min="0" value={rule.max} onChange={(event) => updateChildRule(index, { max: event.target.value })} /></label>
            <label className="px-field"><span>Цена, $</span><input type="number" min="0" step="0.01" value={rule.price} onChange={(event) => updateChildRule(index, { price: event.target.value })} /></label>
            <label className="px-field mt-rule-label"><span>Подпись</span><input value={rule.label} onChange={(event) => updateChildRule(index, { label: event.target.value })} placeholder="Например, ребёнок до 120 см" /></label>
            <button type="button" className="mt-remove-button" onClick={() => setField('childRules', form.childRules.filter((_, ruleIndex) => ruleIndex !== index))}>Удалить</button>
          </div>)}</div>

          <div className="mt-subsection-head"><div><b>Индивидуальные тарифы</b><span>Диапазон участников и цена за группу или за человека.</span></div><button type="button" className="mt-small-button" onClick={() => setField('privateTiers', [...form.privateTiers, { minPeople: '1', maxPeople: '1', total: '', perPerson: '' }])}>+ Добавить тариф</button></div>
          <div className="mt-rule-list">{form.privateTiers.map((tier, index) => <div className="mt-rule-card mt-private-rule" key={`private-${index}`}>
            <label className="px-field"><span>Людей от</span><input type="number" min="1" value={tier.minPeople} onChange={(event) => updatePrivateTier(index, { minPeople: event.target.value })} /></label>
            <label className="px-field"><span>Людей до</span><input type="number" min="1" value={tier.maxPeople} onChange={(event) => updatePrivateTier(index, { maxPeople: event.target.value })} /></label>
            <label className="px-field"><span>За группу, $</span><input type="number" min="0" step="0.01" value={tier.total} onChange={(event) => updatePrivateTier(index, { total: event.target.value })} /></label>
            <label className="px-field"><span>За человека, $</span><input type="number" min="0" step="0.01" value={tier.perPerson} onChange={(event) => updatePrivateTier(index, { perPerson: event.target.value })} /></label>
            <button type="button" className="mt-remove-button" onClick={() => setField('privateTiers', form.privateTiers.filter((_, tierIndex) => tierIndex !== index))}>Удалить</button>
          </div>)}</div>
        </EditorSection>

        <EditorSection title="Логистика и бронирование" note="Сбор, возвращение и поля, которые клиент должен заполнить при бронировании.">
          <div className="px-admin-editor-grid">
            <label className="px-field"><span>Сбор</span><input value={form.pickup} onChange={(event) => setField('pickup', event.target.value)} placeholder="Например, 07:30 у отеля" /></label>
            <label className="px-field"><span>Возвращение</span><input value={form.back} onChange={(event) => setField('back', event.target.value)} placeholder="Например, около 18:00" /></label>
          </div>
          <label className="px-field"><span>Обязательные поля бронирования — одно на строку</span><textarea rows={5} value={form.requiredFields} onChange={(event) => setField('requiredFields', event.target.value)} placeholder={'fullName\nbirthDate\npassport'} /></label>
        </EditorSection>

        <EditorSection title="Описание и программа" note="Весь контент карточки экскурсии редактируется в одном месте.">
          <label className="px-field"><span>Описание</span><textarea rows={6} value={form.description} onChange={(event) => setField('description', event.target.value)} /></label>
          <label className="px-field"><span>Программа — один пункт на строку</span><textarea rows={10} value={form.program} onChange={(event) => setField('program', event.target.value)} /></label>
          <div className="px-admin-editor-grid">
            <label className="px-field"><span>Включено — по строкам</span><textarea rows={8} value={form.included} onChange={(event) => setField('included', event.target.value)} /></label>
            <label className="px-field"><span>Доплаты — по строкам</span><textarea rows={8} value={form.extraCosts} onChange={(event) => setField('extraCosts', event.target.value)} /></label>
          </div>
          <div className="px-admin-editor-grid">
            <label className="px-field"><span>Что взять — по строкам</span><textarea rows={7} value={form.whatToTake} onChange={(event) => setField('whatToTake', event.target.value)} /></label>
            <label className="px-field"><span>Бейджи — по строкам</span><textarea rows={7} value={form.badges} onChange={(event) => setField('badges', event.target.value)} /></label>
          </div>
        </EditorSection>

        <EditorSection title="Фотографии" note="Фото больше не редактируются отдельно: порядок, URL и удаление находятся внутри этой же формы и сохраняются общей кнопкой.">
          <div className="mt-photo-list">{form.images.map((url, index) => <div className="mt-photo-row" key={`image-${index}`}>
            <div className="mt-photo-thumb">{url.trim() ? <img src={url} alt={`Фото ${index + 1}`} /> : <span>Фото {index + 1}</span>}</div>
            <label className="px-field"><span>Фото {index + 1} · URL</span><input value={url} onChange={(event) => updateImage(index, event.target.value)} /></label>
            <div className="mt-photo-actions"><button type="button" disabled={index === 0} onClick={() => moveImage(index, -1)}>↑</button><button type="button" disabled={index === form.images.length - 1} onClick={() => moveImage(index, 1)}>↓</button><button type="button" className="danger" onClick={() => setField('images', form.images.filter((_, imageIndex) => imageIndex !== index))}>Удалить</button></div>
          </div>)}</div>
          <button type="button" className="mt-small-button mt-add-photo" onClick={() => setField('images', [...form.images, ''])}>+ Добавить фотографию</button>
        </EditorSection>

        <EditorSection title="Акция" note="Акция экскурсии также управляется из этой формы; отдельная страница расписания остаётся для массовой работы с датами.">
          <label className="px-owner-check"><input type="checkbox" checked={form.promoEnabled} onChange={(event) => setField('promoEnabled', event.target.checked)} /><span>Включить акцию</span></label>
          <div className="px-admin-editor-grid">
            <label className="px-field"><span>Название акции</span><input value={form.promoLabel} onChange={(event) => setField('promoLabel', event.target.value)} placeholder="Например, SPECIAL" /></label>
            <label className="px-field"><span>Значение</span><input value={form.promoValue} onChange={(event) => setField('promoValue', event.target.value)} placeholder="Например, -10%" /></label>
          </div>
        </EditorSection>

        <div className="mt-save-bar">
          <div><b>{saved ? 'Сохранено ✓' : 'Все изменения сохраняются одновременно'}</b><span>Контент, тарифы, фотографии и акция — одна форма, одна кнопка.</span></div>
          <button type="submit" className="px-button px-button-dark" disabled={busy}>{busy ? 'Сохраняем…' : saved ? 'Сохранено ✓' : 'Сохранить все изменения'}</button>
        </div>
      </form>
    </main>
  </div>;
}

function EditorSection({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return <section className="mt-editor-section"><div className="mt-editor-section-head"><div><span className="px-kicker">РЕДАКТИРОВАНИЕ</span><h2>{title}</h2></div><p>{note}</p></div>{children}</section>;
}
