import {
  CONTRACT_SCHEMA_VERSIONS,
  ContractError,
  validateOffer,
  validateProviderEvidence,
  validateQuote,
} from './travel-commerce-contracts.js';

export const DEFAULT_QUOTE_TTL_MS=120000;

const arr=value=>Array.isArray(value)?value:[];
const str=value=>String(value??'').trim();

function stableValue(value){
  if(Array.isArray(value)) return value.map(stableValue);
  if(value&&typeof value==='object'){
    return Object.fromEntries(
      Object.keys(value).sort().map(key=>[key,stableValue(value[key])])
    );
  }
  return value;
}

export function stableJson(value){
  return JSON.stringify(stableValue(value));
}

export async function sha256Hex(value){
  const bytes=new TextEncoder().encode(typeof value==='string'?value:stableJson(value));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

function normalizedCustomLocation(value){
  if(!value) return null;
  if(typeof value==='string') return str(value)||null;
  return str(value.wholeAddress||value.addressLine1||value.address||'')||null;
}

function sortedQuantityMap(value={}){
  return Object.fromEntries(
    Object.entries(value||{})
      .map(([key,raw])=>[String(key),Math.max(0,Math.floor(Number(typeof raw==='number'?raw:raw?.quantity)||0))])
      .filter(([,quantity])=>quantity>0)
      .sort(([a],[b])=>a.localeCompare(b))
  );
}

function materialTransport(value={}){
  return {
    mode:str(value.mode).toUpperCase()||'UNKNOWN',
    placeId:value.placeId===undefined||value.placeId===null?null:String(value.placeId),
    customLocation:normalizedCustomLocation(value.customLocation),
  };
}

export function materialQuoteSelection(selection={}){
  return {
    productId:str(selection.productId),
    date:str(selection.date)||null,
    slotId:str(selection.slotId)||null,
    startTimeId:selection.startTimeId===undefined||selection.startTimeId===null?null:String(selection.startTimeId),
    rateId:selection.rateId===undefined||selection.rateId===null?null:String(selection.rateId),
    participants:sortedQuantityMap(selection.participants),
    pickup:materialTransport(selection.pickup),
    dropoff:materialTransport(selection.dropoff),
    extras:sortedQuantityMap(selection.extras),
  };
}

export async function selectionFingerprint(selection={}){
  return sha256Hex(materialQuoteSelection(selection));
}

function semanticFieldCode(path,code=''){
  const source=str(path)||str(code)||'UNKNOWN';
  const normalized=source
    .replace(/([a-z0-9])([A-Z])/g,'$1_$2')
    .replace(/[^A-Za-z0-9]+/g,'_')
    .replace(/^_+|_+$/g,'')
    .toUpperCase();
  return normalized&&/^[A-Z]/.test(normalized)?normalized:`FIELD_${normalized||'UNKNOWN'}`;
}

function safeIssue(item={}){
  return {
    code:str(item.code)||'unknown',
    path:str(item.path),
    message:str(item.message)||str(item.code)||'Unknown issue',
    ...(item.details!==undefined?{details:structuredClone(item.details)}:{}),
  };
}

export function quoteIssueSnapshot(resolution={}){
  return {
    errors:arr(resolution.errors).map(safeIssue),
    warnings:arr(resolution.warnings).map(safeIssue),
    bookingDataIssues:arr(resolution.bookingDataIssues).map(safeIssue),
  };
}

export function requiredFieldCodes(resolution={}){
  return [...new Set(
    arr(resolution.bookingDataIssues)
      .map(item=>semanticFieldCode(item?.path,item?.code))
      .filter(Boolean)
  )].sort();
}

async function evidenceRecord({
  quoteId,
  transactionId,
  providerRef,
  factType,
  fieldPath,
  value,
  retrievedAt,
  sourceRevision,
}){
  const valueHash=await sha256Hex(value);
  const evidenceId=`evidence-${(await sha256Hex({
    quoteId,transactionId,factType,fieldPath,valueHash,retrievedAt,sourceRevision,
  })).slice(0,24)}`;
  return validateProviderEvidence({
    schemaVersion:CONTRACT_SCHEMA_VERSIONS.ProviderEvidence,
    evidenceId,
    providerRef,
    factType,
    fieldPath,
    retrievedAt,
    sourceRevision:sourceRevision||'',
    valueHash,
    value:structuredClone(value),
    transactionId,
    quoteId,
  });
}

function quoteIdFor(transactionId){
  return sha256Hex({transactionId,kind:'TRAVEL_QUOTE_V1'})
    .then(hash=>`quote-${hash.slice(0,24)}`);
}

function moneyFromResolution(resolution={}){
  if(!resolution?.quote?.available||!Number.isFinite(Number(resolution.quote.total))||!resolution.quote.currency){
    throw new ContractError('Quote',[{
      code:'resolution_quote_unavailable',
      path:'resolution.quote',
      message:'booking-selection-engine did not produce a complete quote',
    }]);
  }
  return {
    amount:Number(resolution.quote.total),
    currency:String(resolution.quote.currency),
  };
}

function assertOfferResolutionMatch(offer,resolution){
  if(!resolution?.readyToQuote){
    throw new ContractError('Quote',[{
      code:'resolution_not_quote_ready',
      path:'resolution.readyToQuote',
      message:'selection must be readyToQuote before a first-class Quote can be created',
    }]);
  }
  if(!offer) throw new ContractError('Quote',[{
    code:'offer_required',
    path:'offer',
    message:'canonical Offer is required',
  }]);
  return validateOffer(offer);
}

export async function createFirstClassQuote({
  transactionId,
  revision=1,
  offer,
  resolution,
  now=new Date(),
  ttlMs=DEFAULT_QUOTE_TTL_MS,
  sourceFetchedAt=null,
}={}){
  const validOffer=assertOfferResolutionMatch(offer,resolution);
  const tx=str(transactionId);
  if(!tx) throw new ContractError('Quote',[{
    code:'transaction_required',
    path:'transactionId',
    message:'transactionId is required',
  }]);
  if(!Number.isInteger(revision)||revision<1) throw new ContractError('Quote',[{
    code:'invalid_revision',
    path:'revision',
    message:'revision must be an integer >= 1',
  }]);
  if(!Number.isInteger(ttlMs)||ttlMs<1||ttlMs>600000) throw new ContractError('Quote',[{
    code:'invalid_quote_ttl',
    path:'ttlMs',
    message:'ttlMs must be between 1 and 600000',
  }]);

  const instant=now instanceof Date?now:new Date(now);
  if(Number.isNaN(instant.getTime())) throw new ContractError('Quote',[{
    code:'invalid_timestamp',
    path:'now',
    message:'now must be a valid date',
  }]);

  const createdAt=instant.toISOString();
  const retrievedAt=sourceFetchedAt?new Date(sourceFetchedAt).toISOString():createdAt;
  const quoteId=await quoteIdFor(tx);
  const fingerprint=await selectionFingerprint(resolution.selection||{});
  const price=moneyFromResolution(resolution);
  const sourceRevision=await sha256Hex({
    fingerprint,
    offerId:validOffer.offerId,
    price,
    availability:validOffer.availability,
  });

  const evidence=[
    await evidenceRecord({
      quoteId,transactionId:tx,providerRef:validOffer.providerRef,
      factType:'PRICE',fieldPath:'quote.price',
      value:price,retrievedAt,sourceRevision,
    }),
    await evidenceRecord({
      quoteId,transactionId:tx,providerRef:validOffer.providerRef,
      factType:'AVAILABILITY',fieldPath:'offer.availability',
      value:validOffer.availability,retrievedAt,sourceRevision,
    }),
    await evidenceRecord({
      quoteId,transactionId:tx,providerRef:validOffer.providerRef,
      factType:'BOOKING_REQUIREMENTS',fieldPath:'resolution.constraints.bookingRequirements',
      value:resolution.constraints?.bookingRequirements||null,retrievedAt,sourceRevision,
    }),
  ];

  const quote=validateQuote({
    schemaVersion:CONTRACT_SCHEMA_VERSIONS.Quote,
    quoteId,
    transactionId:tx,
    revision,
    offerId:validOffer.offerId,
    offer:validOffer,
    providerRef:validOffer.providerRef,
    selectionFingerprint:fingerprint,
    price,
    availabilityStatus:validOffer.availability.status,
    requiredFieldCodes:requiredFieldCodes(resolution),
    providerEvidenceRefs:evidence.map(item=>item.evidenceId),
    freshness:{
      policy:'REVALIDATE_BEFORE_MUTATION',
      ttlMs,
    },
    issues:quoteIssueSnapshot(resolution),
    createdAt,
    refreshedAt:createdAt,
    expiresAt:new Date(instant.getTime()+ttlMs).toISOString(),
    status:'ACTIVE',
    readyToBook:Boolean(resolution.readyToBook&&validOffer.availability.status==='AVAILABLE'),
  });

  return {quote,evidence};
}

export async function refreshFirstClassQuote({
  previousQuote,
  offer,
  resolution,
  now=new Date(),
  ttlMs,
  sourceFetchedAt=null,
}={}){
  const previous=validateQuote(previousQuote);
  const result=await createFirstClassQuote({
    transactionId:previous.transactionId,
    revision:previous.revision+1,
    offer,
    resolution,
    now,
    ttlMs:ttlMs??previous.freshness.ttlMs,
    sourceFetchedAt,
  });
  if(result.quote.quoteId!==previous.quoteId){
    throw new ContractError('Quote',[{
      code:'quote_identity_changed',
      path:'quoteId',
      message:'refresh must preserve quoteId for the same transaction',
    }]);
  }
  return result;
}

export async function quoteMatchesSelection(quote,selection){
  const current=validateQuote(quote);
  return current.selectionFingerprint===await selectionFingerprint(selection);
}

export async function markQuoteStaleForSelection(quote,selection,{now=new Date()}={}){
  const current=validateQuote(quote);
  const nextFingerprint=await selectionFingerprint(selection);
  if(nextFingerprint===current.selectionFingerprint) return current;
  const instant=now instanceof Date?now:new Date(now);
  const stale=structuredClone(current);
  stale.revision=current.revision+1;
  stale.status='STALE';
  stale.readyToBook=false;
  stale.refreshedAt=instant.toISOString();
  stale.expiresAt=new Date(instant.getTime()+current.freshness.ttlMs).toISOString();
  return validateQuote(stale);
}

export function isQuoteExpired(quote,{now=new Date()}={}){
  const current=validateQuote(quote);
  const instant=now instanceof Date?now:new Date(now);
  return Boolean(current.expiresAt&&Date.parse(current.expiresAt)<=instant.getTime());
}
