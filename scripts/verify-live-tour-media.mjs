const base = (process.env.MAX_TOUR_BASE || 'https://max-tour-demo.viiversion.com').replace(/\/$/, '');
const expected = [
  'dalat-premium','dalat-vip','fuyen','nhatrang-day','nhatrang-night','dalat-2days','fast-track',
  'danang-ba-na-hoian','danang-city-sontra','phuquoc-4-islands','phuquoc-vinwonders-safari',
  'hanoi-halong-2d','hanoi-sapa-3d','hanoi-ninhbinh','muine-dunes-jeep',
];
const cardCovers = [
  '/tour-media/muine-dunes-jeep/card-cover.jpg',
  '/tour-media/orchid-monkey-islands/card-cover.jpg',
  '/tour-media/hon-tam-island/card-cover.jpg',
];
const fail = message => { throw new Error(`[tour-media-live] ${message}`); };

const catalogResponse = await fetch(`${base}/catalog.v28.json?tourMediaVerify=${Date.now()}`, { redirect: 'follow' });
if (!catalogResponse.ok) fail(`catalog HTTP ${catalogResponse.status}`);
const catalog = await catalogResponse.json();
if (!Array.isArray(catalog) || catalog.length !== expected.length) fail(`expected ${expected.length} tours, got ${catalog?.length}`);

const byId = new Map(catalog.map(tour => [String(tour.id), tour]));
const paths = new Set(cardCovers);
for (const id of expected) {
  const tour = byId.get(id);
  if (!tour) fail(`missing tour ${id}`);
  const gallery = [...new Set([tour.image, ...(Array.isArray(tour.gallery) ? tour.gallery : [])].filter(Boolean))];
  if (gallery.length < 3) fail(`${id} exposes only ${gallery.length} images`);
  for (const path of gallery) {
    if (/^https?:\/\//i.test(path)) fail(`external image URL found for ${id}: ${path}`);
    if (!path.startsWith(`/tour-media/${id}/`)) fail(`wrong R2 path for ${id}: ${path}`);
    paths.add(path);
  }
  if (tour.fallbackImage !== tour.image) fail(`${id} fallbackImage must equal cover image`);
}

async function verifyPath(path) {
  const response = await fetch(`${base}${path}?v=${Date.now()}`, { method: 'HEAD', redirect: 'follow' });
  if (!response.ok) fail(`${path} HTTP ${response.status}`);
  const type = response.headers.get('content-type') || '';
  const length = Number(response.headers.get('content-length') || 0);
  if (!type.startsWith('image/')) fail(`${path} invalid content-type ${type}`);
  if (length < 1024) fail(`${path} invalid content-length ${length}`);
}

const list = [...paths];
for (let index = 0; index < list.length; index += 6) {
  await Promise.all(list.slice(index, index + 6).map(verifyPath));
}
console.log(`[tour-media-live] verified ${expected.length} catalog tours, ${cardCovers.length} dedicated card covers and ${list.length} same-origin R2 image objects at ${base}`);
