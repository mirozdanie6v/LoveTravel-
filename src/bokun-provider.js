import {
  fetchLoveTravelBokunDomains,
  LOVE_TRAVEL_BOKUN_PRODUCT_IDS,
  LOVE_TRAVEL_BOKUN_VENDOR_ID,
} from './bokun-adapter.js';
import { resolveBookingSelection } from './booking-selection-engine.js';
import { buildBokunBookingDraft } from './bokun-booking-draft.js';
import {
  CONTRACT_SCHEMA_VERSIONS,
  validateBookingDraft,
  validateBookingSelectionSnapshot,
  validateBookingTransaction,
  validateOffer,
  validateProduct,
} from './travel-commerce-contracts.js';
import {
  createFirstClassQuote,
  refreshFirstClassQuote,
} from './travel-commerce-quote.js';

const DEFAULT_BASE_URL='https://integration.viiversion.com';

export const LOVE_TRAVEL_CANONICAL_PRODUCT_IDS=Object.freeze({
  '1287578':'love-travel-robinson-island',
  '1287580':'love-travel-hon-mun',
});

export class ProviderCapabilityError extends Error {
  constructor(code,message){
    super(message||code);
    this.name='ProviderCapabilityError';
    this.code=code;
  }
}

export class ProviderUpstreamError extends Error {
  constructor(code,message,status=502){
    super(message||code);
    this.name='ProviderUpstreamError';
    this.code=code;
    this.status=status;
  }
}

const arr=value=>Array.isArray(value)?value:[];
const str=value=>String(value??'').trim();

function hash32(input){
  let hash=0x811c9dc5;
  for(const ch of String(input)){
    hash^=ch.codePointAt(0);
    hash=Math.imul(hash,0x01000193)>>>0;
  }
  return hash.toString(16).padStart(8,'0');
}

export function bokunProviderRef(resourceType,externalId,vendorId=LOVE_TRAVEL_BOKUN_VENDOR_ID){
  return {
    provider:'BOKUN',
    resourceType:String(resourceType),
    externalId:String(externalId),
    accountRef:String(vendorId),
  };
}

function semanticCapabilities(domain={}){
  const out=[];
  if(domain.experience?.pickup?.enabled) out.push('PICKUP');
  if(domain.experience?.dropoff?.enabled) out.push('DROPOFF');
  if(arr(domain.extras).length) out.push('EXTRAS');
  if(arr(domain.bookingRequirements?.questions).length) out.push('BOOKING_QUESTIONS');
  if(arr(domain.participants).some(item=>String(item?.ticketCategory||'').toUpperCase()==='CHILD')) out.push('CHILDREN');
  return out;
}

export function canonicalProductFromBokunDomain(domain={},{
  vendorId=LOVE_TRAVEL_BOKUN_VENDOR_ID,
  canonicalProductIds=LOVE_TRAVEL_CANONICAL_PRODUCT_IDS,
}={}){
  const externalId=str(domain.experience?.id||domain.provider?.productId);
  const productId=canonicalProductIds[externalId];
  if(!productId) throw new ProviderCapabilityError('unmapped_product',`No canonical product mapping for Bókun product ${externalId}`);
  const location=domain.experience?.location||{};
  return validateProduct({
    schemaVersion:CONTRACT_SCHEMA_VERSIONS.Product,
    productId,
    providerRef:bokunProviderRef('ACTIVITY',externalId,vendorId),
    title:str(domain.experience?.title)||productId,
    summary:str(domain.experience?.description)||'',
    location:{
      countryCode:str(location.countryCode||'VN').toUpperCase().slice(0,2),
      timeZone:str(location.timeZone||'Asia/Ho_Chi_Minh'),
    },
    semanticTags:[],
    capabilities:semanticCapabilities(domain),
    evidenceRefs:[],
  });
}

function participantRole(category={}){
  const role=String(category.ticketCategory||'').toUpperCase();
  return ['ADULT','CHILD','INFANT'].includes(role)?role:null;
}

function participantMix(domain,resolution,vendorId){
  const categories=new Map(arr(domain.participants).map(item=>[String(item.id),item]));
  return Object.entries(resolution.selection?.participants||{})
    .map(([categoryId,count])=>{
      const category=categories.get(String(categoryId));
      const role=participantRole(category);
      const quantity=Math.max(0,Math.floor(Number(count)||0));
      if(!role||quantity<1) return null;
      return {
        role,
        count:quantity,
        providerCategoryRef:bokunProviderRef('PRICING_CATEGORY',categoryId,vendorId),
      };
    })
    .filter(Boolean);
}

function transportChoice(value,resourceType,vendorId){
  const mode=String(value?.mode||'UNKNOWN').toUpperCase();
  const result={mode};
  if(value?.placeId) result.placeRef=bokunProviderRef(resourceType,value.placeId,vendorId);
  else if(value?.customLocation){
    const custom=str(value.customLocation?.wholeAddress||value.customLocation?.addressLine1||value.customLocation);
    if(custom) result.customLocation=custom;
  }
  return result;
}

function availabilityFromResolution(resolution={}){
  const slot=resolution.resolved?.slot||{};
  if(slot.soldOut) return {status:'SOLD_OUT',remaining:0};
  if(slot.unavailable) return {status:'UNAVAILABLE',remaining:Math.max(0,Number(slot.availabilityCount)||0)};
  const confirmation=String(resolution.product?.confirmationMode||'').toUpperCase();
  return {
    status:confirmation==='ON_REQUEST'?'ON_REQUEST':'AVAILABLE',
    remaining:Math.max(0,Number(slot.availabilityCount)||0),
  };
}

export function canonicalOfferFromResolution(domain,resolution,{
  vendorId=LOVE_TRAVEL_BOKUN_VENDOR_ID,
  canonicalProductIds=LOVE_TRAVEL_CANONICAL_PRODUCT_IDS,
  generatedAt=new Date().toISOString(),
}={}){
  if(!resolution?.readyToQuote || !resolution?.quote?.available) return null;
  const product=canonicalProductFromBokunDomain(domain,{vendorId,canonicalProductIds});
  const slot=resolution.resolved?.slot;
  const rate=resolution.resolved?.rate;
  if(!slot||!rate) return null;
  const rawIdentity=[
    product.productId,
    resolution.selection?.date,
    rate.id,
    slot.startTimeId,
    JSON.stringify(resolution.selection?.participants||{}),
    resolution.selection?.pickup?.mode||'',
    resolution.selection?.pickup?.placeId||'',
  ].join('|');
  return validateOffer({
    schemaVersion:CONTRACT_SCHEMA_VERSIONS.Offer,
    offerId:`offer-${hash32(rawIdentity)}`,
    productId:product.productId,
    providerRef:bokunProviderRef('ACTIVITY',domain.experience?.id||domain.provider?.productId,vendorId),
    rateRef:bokunProviderRef('RATE',rate.id,vendorId),
    startTimeRef:bokunProviderRef('START_TIME',slot.startTimeId,vendorId),
    date:String(resolution.selection?.date||slot.date),
    participantMix:participantMix(domain,resolution,vendorId),
    pickup:transportChoice(resolution.selection?.pickup,'PICKUP_PLACE',vendorId),
    dropoff:transportChoice(resolution.selection?.dropoff,'DROPOFF_PLACE',vendorId),
    price:{
      amount:Number(resolution.quote.total),
      currency:String(resolution.quote.currency),
    },
    availability:availabilityFromResolution(resolution),
    restrictionCodes:[
      ...arr(resolution.errors).map(item=>String(item.code||'').toUpperCase()).filter(Boolean),
      ...arr(resolution.warnings).map(item=>String(item.code||'').toUpperCase()).filter(Boolean),
    ],
    evidenceRefs:[],
    generatedAt,
  });
}

function bookingAnswerMap(source={}){
  return Object.entries(source&&typeof source==='object'?source:{})
    .filter(([,value])=>value!==null&&value!==undefined&&String(value).trim()!=='')
    .map(([questionId,value])=>({
      questionId:String(questionId),
      values:Array.isArray(value)?value.map(String):[String(value)],
    }));
}

export function provisionalBookingRequest(resolution,externalBookingReference){
  const selection=resolution?.selection||{};
  const resolved=resolution?.resolved||{};
  const passengers=[];
  const explicitPassengers=Array.isArray(selection.passengers)?selection.passengers:[];
  for(const [categoryId,countRaw] of Object.entries(selection.participants||{})){
    const count=Math.max(0,Math.floor(Number(countRaw)||0));
    const matching=explicitPassengers.filter(item=>String(item?.categoryId||'')===String(categoryId));
    for(let index=0;index<count;index+=1){
      const person=matching[index]||{};
      const passengerDetails=bookingAnswerMap(Object.fromEntries(
        Object.entries(person).filter(([key])=>!['categoryId','answers','extras'].includes(key))
      ));
      const answers=bookingAnswerMap(person.answers||{});
      const extras=Object.entries(person.extras||{}).flatMap(([extraId,entry])=>{
        const item=typeof entry==='number'?{quantity:entry}:(entry||{});
        const quantity=Math.max(0,Math.floor(Number(item.quantity)||0));
        if(!quantity) return [];
        return [{
          extraId:Number(extraId),
          quantity,
          ...(bookingAnswerMap(item.answers||{}).length?{answers:bookingAnswerMap(item.answers||{})}:{}),
        }];
      });
      passengers.push({
        pricingCategoryId:Number(categoryId),
        ...(passengerDetails.length?{passengerDetails}:{}),
        ...(answers.length?{answers}:{}),
        ...(extras.length?{extras}:{}),
      });
    }
  }
  const pickup=String(selection?.pickup?.mode||'').toUpperCase()==='PICKUP';
  const dropoff=String(selection?.dropoff?.mode||'').toUpperCase()==='DROPOFF';
  const pickupAnswers=bookingAnswerMap({
    ...(selection?.pickup?.answers||{}),
    ...(selection?.pickup?.roomNumber?{roomNumber:selection.pickup.roomNumber}:{}),
  });
  const activityBooking={
    activityId:Number(selection.productId),
    rateId:Number(selection.rateId||resolved?.rate?.id),
    startTimeId:Number(selection.startTimeId||resolved?.slot?.startTimeId),
    date:String(selection.date||resolved?.slot?.date||''),
    pickup,
    dropoff,
    checkedIn:false,
    customized:false,
    ...(pickup&&selection?.pickup?.placeId?{pickupPlaceId:Number(selection.pickup.placeId)}:{}),
    ...(pickup&&!selection?.pickup?.placeId&&selection?.pickup?.customLocation
      ?{pickupDescription:String(selection.pickup.customLocation.wholeAddress||selection.pickup.customLocation.addressLine1||'')}
      :{}),
    ...(dropoff&&selection?.dropoff?.placeId?{dropoffPlaceId:Number(selection.dropoff.placeId)}:{}),
    ...(dropoff&&!selection?.dropoff?.placeId&&selection?.dropoff?.customLocation
      ?{dropoffDescription:String(selection.dropoff.customLocation.wholeAddress||selection.dropoff.customLocation.addressLine1||'')}
      :{}),
    ...(bookingAnswerMap(selection.answers||{}).length?{answers:bookingAnswerMap(selection.answers||{})}:{}),
    ...(pickupAnswers.length?{pickupAnswers}:{}),
    passengers,
  };
  return {
    mainContactDetails:bookingAnswerMap(selection.customer||{}),
    activityBookings:[activityBooking],
    sendCustomerNotification:false,
    externalBookingReference,
    externalBookingEntityName:'VIIVERSION',
    externalBookingEntityCode:'LOVE_TRAVEL',
  };
}

function canonicalExtraList(extras={},vendorId=LOVE_TRAVEL_BOKUN_VENDOR_ID){
  return Object.entries(extras||{}).flatMap(([extraId,raw])=>{
    const item=typeof raw==='number'?{quantity:raw}:(raw||{});
    const quantity=Math.max(0,Math.floor(Number(item.quantity)||0));
    if(!quantity) return [];
    return [{
      extraRef:bokunProviderRef('EXTRA',extraId,vendorId),
      quantity,
      ...(item.answers&&typeof item.answers==='object'?{answers:structuredClone(item.answers)}:{}),
    }];
  });
}

function travellerList(domain,selection,vendorId=LOVE_TRAVEL_BOKUN_VENDOR_ID){
  const categories=new Map(arr(domain?.participants).map(item=>[String(item.id),item]));
  const explicit=arr(selection?.passengers);
  const travellers=[];
  for(const [categoryId,countRaw] of Object.entries(selection?.participants||{})){
    const count=Math.max(0,Math.floor(Number(countRaw)||0));
    const category=categories.get(String(categoryId));
    const role=participantRole(category);
    if(!role) continue;
    const matches=explicit.filter(item=>String(item?.categoryId||'')===String(categoryId));
    for(let index=0;index<count;index+=1){
      const person=matches[index]||{};
      travellers.push({
        participantRole:role,
        providerCategoryRef:bokunProviderRef('PRICING_CATEGORY',categoryId,vendorId),
        ...(person.firstName?{firstName:String(person.firstName)}:{}),
        ...(person.lastName?{lastName:String(person.lastName)}:{}),
        ...(person.dateOfBirth?{dateOfBirth:String(person.dateOfBirth)}:{}),
        ...(person.passportId?{passportId:String(person.passportId)}:{}),
        ...(person.nationality?{nationality:String(person.nationality)}:{}),
        answers:structuredClone(person.answers||{}),
        extras:canonicalExtraList(person.extras||{},vendorId),
      });
    }
  }
  return travellers;
}

export function canonicalBookingSelectionFromBokun(domain,selection,{
  vendorId=LOVE_TRAVEL_BOKUN_VENDOR_ID,
}={}){
  const resolved=selection||{};
  const participants=Object.entries(resolved.participants||{}).flatMap(([categoryId,countRaw])=>{
    const category=arr(domain?.participants).find(item=>String(item?.id)===String(categoryId));
    const role=participantRole(category);
    const count=Math.max(0,Math.floor(Number(countRaw)||0));
    if(!role||count<1) return [];
    return [{
      role,
      count,
      providerCategoryRef:bokunProviderRef('PRICING_CATEGORY',categoryId,vendorId),
    }];
  });
  return validateBookingSelectionSnapshot({
    productRef:bokunProviderRef('ACTIVITY',resolved.productId||domain?.experience?.id||domain?.provider?.productId,vendorId),
    ...(resolved.date?{date:String(resolved.date)}:{}),
    ...(resolved.rateId?{rateRef:bokunProviderRef('RATE',resolved.rateId,vendorId)}:{}),
    ...(resolved.startTimeId?{startTimeRef:bokunProviderRef('START_TIME',resolved.startTimeId,vendorId)}:{}),
    ...(resolved.slotId?{slotRef:bokunProviderRef('AVAILABILITY_SLOT',resolved.slotId,vendorId)}:{}),
    participants,
    pickup:transportChoice(resolved.pickup,'PICKUP_PLACE',vendorId),
    ...(resolved?.pickup?.roomNumber?{pickupRoomNumber:String(resolved.pickup.roomNumber)}:{}),
    ...(resolved?.pickup?.answers&&typeof resolved.pickup.answers==='object'?{pickupAnswers:structuredClone(resolved.pickup.answers)}:{}),
    dropoff:transportChoice(resolved.dropoff,'DROPOFF_PLACE',vendorId),
    customer:structuredClone(resolved.customer||{}),
    travellers:travellerList(domain,resolved,vendorId),
    answers:structuredClone(resolved.answers||{}),
    extras:canonicalExtraList(resolved.extras||{},vendorId),
  });
}

export function canonicalBookingDraftFromSelection(snapshot,quote){
  const selection=validateBookingSelectionSnapshot(snapshot);
  return validateBookingDraft({
    schemaVersion:CONTRACT_SCHEMA_VERSIONS.BookingDraft,
    quoteId:quote.quoteId,
    quoteRevision:quote.revision,
    customer:structuredClone(selection.customer||{}),
    travellers:structuredClone(selection.travellers||[]),
    pickup:structuredClone(selection.pickup||{mode:'UNKNOWN'}),
    dropoff:structuredClone(selection.dropoff||{mode:'UNKNOWN'}),
    answers:structuredClone(selection.answers||{}),
    extras:structuredClone(selection.extras||[]),
    paymentChoice:'RESERVE_FOR_EXTERNAL_PAYMENT',
    specialRequests:[],
  });
}

function rawExtraMap(extras=[]){
  return Object.fromEntries(arr(extras).map(item=>[
    String(item?.extraRef?.externalId||''),
    {
      quantity:Math.max(0,Math.floor(Number(item?.quantity)||0)),
      answers:structuredClone(item?.answers||{}),
    },
  ]).filter(([id,item])=>id&&item.quantity>0));
}

export function bokunSelectionFromCanonicalSelection(snapshot){
  const selection=validateBookingSelectionSnapshot(snapshot);
  const participants={};
  for(const item of selection.participants||[]){
    const categoryId=str(item?.providerCategoryRef?.externalId);
    if(categoryId) participants[categoryId]=(participants[categoryId]||0)+Number(item.count||0);
  }
  const passengers=(selection.travellers||[]).map(traveller=>({
    categoryId:str(traveller?.providerCategoryRef?.externalId),
    ...(traveller.firstName?{firstName:traveller.firstName}:{}),
    ...(traveller.lastName?{lastName:traveller.lastName}:{}),
    ...(traveller.dateOfBirth?{dateOfBirth:traveller.dateOfBirth}:{}),
    ...(traveller.passportId?{passportId:traveller.passportId}:{}),
    ...(traveller.nationality?{nationality:traveller.nationality}:{}),
    answers:structuredClone(traveller.answers||{}),
    extras:rawExtraMap(traveller.extras||[]),
  }));
  return {
    productId:str(selection.productRef?.externalId),
    ...(selection.date?{date:selection.date}:{}),
    ...(selection.rateRef?.externalId?{rateId:str(selection.rateRef.externalId)}:{}),
    ...(selection.startTimeRef?.externalId?{startTimeId:str(selection.startTimeRef.externalId)}:{}),
    ...(selection.slotRef?.externalId?{slotId:str(selection.slotRef.externalId)}:{}),
    participants,
    passengers,
    pickup:{
      ...canonicalTransportSelection(selection.pickup),
      ...(selection.pickupRoomNumber?{roomNumber:selection.pickupRoomNumber}:{}),
      ...(selection.pickupAnswers?{answers:structuredClone(selection.pickupAnswers)}:{}),
    },
    dropoff:canonicalTransportSelection(selection.dropoff),
    customer:structuredClone(selection.customer||{}),
    answers:structuredClone(selection.answers||{}),
    extras:rawExtraMap(selection.extras||[]),
  };
}

function canonicalExtraMap(extras=[]){
  return Object.fromEntries(arr(extras).map(item=>[
    String(item?.extraRef?.externalId||''),
    {
      quantity:Math.max(0,Math.floor(Number(item?.quantity)||0)),
      answers:structuredClone(item?.answers||{}),
    },
  ]).filter(([id,value])=>id&&value.quantity>0));
}

function canonicalTransportSelection(value={}){
  return {
    mode:String(value?.mode||'UNKNOWN'),
    ...(value?.placeRef?.externalId?{placeId:String(value.placeRef.externalId)}:{}),
    ...(value?.customLocation?{customLocation:{wholeAddress:String(value.customLocation)}}:{}),
  };
}

export function bokunSelectionFromTransaction(transaction){
  const tx=validateBookingTransaction(transaction);
  if(tx.selection) return bokunSelectionFromCanonicalSelection(tx.selection);
  if(!tx.quote?.offer||!tx.draft) throw new ProviderCapabilityError('transaction_not_booking_ready','Transaction requires canonical selection or Quote and BookingDraft');
  const fallback=canonicalBookingSelectionFromBokun({
    experience:{id:tx.quote.offer.providerRef.externalId},
    participants:[],
  },{
    productId:tx.quote.offer.providerRef.externalId,
    date:tx.quote.offer.date,
    rateId:tx.quote.offer.rateRef?.externalId,
    startTimeId:tx.quote.offer.startTimeRef?.externalId,
    participants:{},
    pickup:canonicalTransportSelection(tx.draft.pickup),
    dropoff:canonicalTransportSelection(tx.draft.dropoff),
    customer:tx.draft.customer||{},
    answers:tx.draft.answers||{},
    passengers:[],
    extras:canonicalExtraMap(tx.draft.extras||[]),
  });
  return bokunSelectionFromCanonicalSelection(fallback);
}

function buildUrl(baseUrl,path,params={}){
  const url=new URL(String(baseUrl||DEFAULT_BASE_URL).replace(/\/+$/,'')+path);
  for(const [key,value] of Object.entries(params)){
    if(value!==undefined&&value!==null&&value!=='') url.searchParams.set(key,String(value));
  }
  return url.toString();
}

async function responseJson(response,code){
  const data=await response.json().catch(()=>null);
  if(!response.ok||!data) throw new ProviderUpstreamError(code,data?.error||`Provider HTTP ${response.status}`,response.status);
  return data;
}

export function createBokunProvider({
  fetchImpl=globalThis.fetch,
  baseUrl=DEFAULT_BASE_URL,
  vendorId=LOVE_TRAVEL_BOKUN_VENDOR_ID,
  productIds=LOVE_TRAVEL_BOKUN_PRODUCT_IDS,
  canonicalProductIds=LOVE_TRAVEL_CANONICAL_PRODUCT_IDS,
  bookingTestToken='',
  now=()=>new Date(),
}={}){
  if(typeof fetchImpl!=='function') throw new TypeError('fetch implementation is required');
  const allowedProducts=new Set(productIds.map(String));
  const ensureProduct=productId=>{
    const id=String(productId||'');
    if(!allowedProducts.has(id)) throw new ProviderCapabilityError('unsupported_product',`Unsupported Bókun product ${id}`);
    return id;
  };

  async function getDomains(options={}){
    const ids=(options.productIds||productIds).map(ensureProduct);
    return fetchLoveTravelBokunDomains({
      fetchImpl,
      baseUrl,
      vendorId,
      productIds:ids,
      start:options.start,
      end:options.end,
      currency:options.currency||'USD',
      lang:options.lang||'EN',
      includePickupPlaces:Boolean(options.includePickupPlaces),
    });
  }

  async function getDomain(options={}){
    const productId=ensureProduct(options.productId);
    const domains=await getDomains({...options,productIds:[productId]});
    const domain=domains[0];
    if(!domain) throw new ProviderUpstreamError('product_domain_unavailable','Bókun product domain unavailable');
    return domain;
  }

  async function listProducts(options={}){
    const domains=await getDomains(options);
    return domains.map(domain=>canonicalProductFromBokunDomain(domain,{vendorId,canonicalProductIds}));
  }

  async function resolveOffer({selection,domain,...options}={}){
    const productId=ensureProduct(selection?.productId);
    const activeDomain=domain||await getDomain({
      ...options,
      productId,
      includePickupPlaces:options.includePickupPlaces??(
        String(selection?.pickup?.mode||'').toUpperCase()==='PICKUP'
        ||String(selection?.dropoff?.mode||'').toUpperCase()==='DROPOFF'
      ),
    });
    const resolution=resolveBookingSelection(activeDomain,selection,{now:now()});
    return {
      domain:activeDomain,
      product:canonicalProductFromBokunDomain(activeDomain,{vendorId,canonicalProductIds}),
      offer:canonicalOfferFromResolution(activeDomain,resolution,{vendorId,canonicalProductIds,generatedAt:now().toISOString()}),
      resolution,
    };
  }

  function getBookingRequirements(resolution){
    return structuredClone(resolution?.constraints?.bookingRequirements||null);
  }

  async function quoteSelection({
    transactionId,
    previousQuote=null,
    selection,
    domain,
    ttlMs,
    ...options
  }={}){
    const resolved=await resolveOffer({selection,domain,...options});
    if(!resolved.offer||!resolved.resolution?.readyToQuote){
      throw new ProviderCapabilityError('selection_not_quote_ready','Selection cannot produce a first-class Quote');
    }
    const sourceFetchedAt=resolved.offer.generatedAt;
    const quoted=previousQuote
      ? await refreshFirstClassQuote({
          previousQuote,
          offer:resolved.offer,
          resolution:resolved.resolution,
          now:now(),
          ttlMs,
          sourceFetchedAt,
        })
      : await createFirstClassQuote({
          transactionId,
          revision:1,
          offer:resolved.offer,
          resolution:resolved.resolution,
          now:now(),
          ttlMs,
          sourceFetchedAt,
        });
    return {...resolved,...quoted};
  }

  async function getCheckoutContract({resolution,externalBookingReference,currency='USD'}={}){
    if(!resolution?.readyToQuote) throw new ProviderCapabilityError('selection_not_quote_ready','Selection is not ready for checkout options');
    const provisional=provisionalBookingRequest(resolution,externalBookingReference);
    const response=await fetchImpl(buildUrl(baseUrl,'/api/bokun/checkout/options',{vendorId,currency}),{
      method:'POST',
      headers:{'content-type':'application/json','accept':'application/json'},
      body:JSON.stringify(provisional),
    });
    return responseJson(response,'checkout_options_unavailable');
  }

  function createBookingDraft({resolution,checkoutContract,externalBookingReference}={}){
    return buildBokunBookingDraft(resolution,checkoutContract,{
      externalBookingReference,
      externalBookingEntityName:'VIIVERSION',
      externalBookingEntityCode:'LOVE_TRAVEL',
    });
  }

  async function submitClientDemoBooking({checkoutRequestTemplate,demoToken,currency='USD'}={}){
    if(!demoToken) throw new ProviderCapabilityError('demo_token_required','Demo token is required');
    const response=await fetchImpl(buildUrl(baseUrl,'/internal/lovetravel/bokun/demo-submit',{vendorId,currency}),{
      method:'POST',
      headers:{
        'content-type':'application/json',
        'accept':'application/json',
        'x-love-travel-demo-token':demoToken,
        'x-viiversion-booking-intent':'SUBMIT_LOVE_TRAVEL_CLIENT_DEMO_BOOKING',
      },
      body:JSON.stringify(checkoutRequestTemplate),
    });
    const submitted=await responseJson(response,'demo_booking_submit_failed');
    const booking=submitted?.booking||null;
    const confirmationCode=str(booking?.confirmationCode);
    if(!submitted?.ok||!/^NHA-[0-9]+$/.test(confirmationCode)){
      throw new ProviderUpstreamError('demo_booking_submit_failed','Bókun did not return a valid LoveTravel booking confirmation',502);
    }
    return {
      confirmationCode,
      status:str(booking?.status).toUpperCase()||'CONFIRMED',
      paymentType:str(booking?.paymentType)||'NOT_PAID',
      totalPaid:Number(booking?.totalPaid||0),
      externalBookingReference:str(booking?.externalBookingReference||checkoutRequestTemplate?.directBooking?.externalBookingReference),
      raw:submitted,
    };
  }

  async function readBookingByConfirmationCode({confirmationCode}={}){
    if(!bookingTestToken) throw new ProviderCapabilityError('booking_read_not_configured','Bókun booking read token is not configured');
    if(!/^NHA-(?:T)?[0-9]+$/.test(String(confirmationCode||''))) throw new ProviderCapabilityError('invalid_confirmation_code','Invalid Bókun confirmation code');
    const response=await fetchImpl(buildUrl(baseUrl,'/admin/bokun/pilot/booking',{vendorId,code:confirmationCode}),{
      headers:{'x-viiversion-booking-test-token':bookingTestToken,'accept':'application/json'},
    });
    return responseJson(response,'booking_read_failed');
  }

  async function reconcileBooking({
    externalBookingReference,
    confirmationCode,
    demoToken,
    bookingDate,
  }={}){
    if(confirmationCode){
      const booking=await readBookingByConfirmationCode({confirmationCode});
      if(externalBookingReference&&str(booking?.externalBookingReference)!==str(externalBookingReference)){
        throw new ProviderUpstreamError('external_reference_mismatch','Provider booking does not match the expected external reference',409);
      }
      return booking;
    }

    const reference=str(externalBookingReference);
    if(!reference) throw new ProviderCapabilityError('external_reference_required','externalBookingReference is required');
    if(!demoToken) throw new ProviderCapabilityError('demo_token_required','Demo token is required for reverse reconciliation');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(str(bookingDate))){
      throw new ProviderCapabilityError('booking_date_required','bookingDate must be YYYY-MM-DD for bounded reconciliation');
    }

    const response=await fetchImpl(buildUrl(baseUrl,'/internal/lovetravel/bokun/reconcile',{vendorId}),{
      method:'POST',
      headers:{
        'content-type':'application/json',
        'accept':'application/json',
        'x-love-travel-demo-token':demoToken,
        'x-viiversion-booking-intent':'RECONCILE_LOVE_TRAVEL_CLIENT_DEMO_BOOKING',
      },
      body:JSON.stringify({externalBookingReference:reference,bookingDate}),
    });
    const result=await responseJson(response,'booking_reconciliation_failed');
    if(!result?.found) return null;
    const booking=result.booking||null;
    if(!booking||str(booking.externalBookingReference)!==reference){
      throw new ProviderUpstreamError('external_reference_mismatch','Reconciled provider booking does not match expected external reference',409);
    }
    return booking;
  }

  return Object.freeze({
    provider:'BOKUN',
    vendorId:String(vendorId),
    capabilities:Object.freeze({
      products:true,
      offers:true,
      bookingRequirements:true,
      checkoutOptions:true,
      clientDemoReserve:true,
      bookingReadByConfirmationCode:Boolean(bookingTestToken),
      bookingLookupByExternalReference:true,
    }),
    getDomains,
    getDomain,
    listProducts,
    resolveOffer,
    quoteSelection,
    getBookingRequirements,
    getCheckoutContract,
    createBookingDraft,
    submitClientDemoBooking,
    readBookingByConfirmationCode,
    reconcileBooking,
  });
}
