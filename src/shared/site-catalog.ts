import rawCatalog from './site-catalog.generated.json';

export type SourceSiteTour = {
  url:string;
  path:string;
  title:string;
  description:string;
  imageCount:number;
  priceLines:string[];
  facets:{tags:string[];ageHints:string[];genderTags:string[];directionHints:string[]};
  likelyTour:boolean;
  textExcerpt:string;
  photos:string[];
  photoCount:number;
};

export type SourceSiteCatalog = {
  generatedAt:string;
  source:string;
  policy:string;
  pagesScanned:number;
  tourDetailPages:number;
  uniqueTourPhotoUrls:number;
  errors:Array<{url:string;error:string}>;
  tours:SourceSiteTour[];
};

const catalog = rawCatalog as SourceSiteCatalog;

export function sourceTourId(path:string){ return path.replace(/^\/+|\/+$/g,'') || 'tour'; }
export function sourceSiteCatalog(){ return catalog; }
export function sourceSiteTours(){ return catalog.tours ?? []; }
export function findSourceSiteTour(idOrSlug:string){
  const id=decodeURIComponent(String(idOrSlug||'')).replace(/^\/+|\/+$/g,'');
  return sourceSiteTours().find(t=>sourceTourId(t.path)===id || t.path===`/${id}` || t.url.replace(/\/$/,'').endsWith(`/${id}`)) ?? null;
}
