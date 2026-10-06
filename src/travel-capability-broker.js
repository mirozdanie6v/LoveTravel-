import {
  canonicalProductFromBokunDomain,
} from './bokun-provider.js';
import {
  sha256Hex,
  stableJson,
} from './travel-commerce-quote.js';
import {
  validateTravelIntent,
} from './travel-commerce-contracts.js';

export const CAPABILITY_PRINCIPALS=Object.freeze({
  MODEL:'MODEL',
  ORCHESTRATOR:'ORCHESTRATOR',
  TRANSACTION_POLICY:'TRANSACTION_POLICY',
});

export const TRAVEL_CAPABILITIES=Object.freeze({
  searchProducts:Object.freeze({kind:'READ'}),
  compareProducts:Object.freeze({kind:'READ'}),
  searchOffers:Object.freeze({kind:'READ'}),
  getOfferDetails:Object.freeze({kind:'READ'}),
  createQuote:Object.freeze({kind:'READ'}),
  refreshQuote:Object.freeze({kind:'READ'}),
  getBookingRequirements:Object.freeze({kind:'READ'}),
  previewBooking:Object.freeze({kind:'READ'}),
  reserveBooking:Object.freeze({kind:'MUTATION'}),
  confirmBooking:Object.freeze({kind:'MUTATION'}),
  cancelBooking:Object.freeze({kind:'MUTATION'}),
});

export class CapabilityPolicyError extends Error{
  constructor(code,message,status=403){
    super(message||code);
    this.name='CapabilityPolicyError';
    this.code=code;
    this.status=status;
  }
}

const arr=value=>Array.isArray(value)?value:[];
const str=value=>String(value??'').trim();

function exactKeys(value,allowed,label){
  if(!value||typeof value!=='object'||Array.isArray(value)){
    throw new CapabilityPolicyError('invalid_capability_args',`${label} args must be an object`,400);
  }
  const unknown=Object.keys(value).filter(key=>!allowed.includes(key));
  if(unknown.length){
    throw new CapabilityPolicyError(
      'unknown_capability_arg',
      `${label} contains unsupported args: ${unknown.join(', ')}`,
      400,
    );
  }
}

function isoDate(value){
  return /^\d{4}-\d{2}-\d{2}$/.test(str(value));
}

function vietnamToday(now=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{
    timeZone:'Asia/Ho_Chi_Minh',
    year:'numeric',month:'2-digit',day:'2-digit',
  }).formatToParts(now);
  const map=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function addDays(iso,days){
  const date=new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate()+Number(days||0));
  return date.toISOString().slice(0,10);
}

function exactIntentDate(intent){
  return intent?.dateConstraint?.kind==='EXACT'&&isoDate(intent.dateConstraint.exact)
    ? intent.dateConstraint.exact
    : '';
}

function participantCategory(domain,role,age=null){
  const candidates=arr(domain?.participants).filter(item=>
    String(item?.ticketCategory||'').toUpperCase()===role
  );
  if(age===null) return candidates[0]||null;
  return candidates.find(item=>{
    const min=Number(item?.minAge);
    const max=Number(item?.maxAge);
    return (!Number.isFinite(min)||age>=min)&&(!Number.isFinite(max)||age<=max);
  })||candidates[0]||null;
}

function participantSelection(domain,intent){
  const result={};
  const add=(category,count)=>{
    if(!category||!count) return;
    const key=String(category.id);
    result[key]=(result[key]||0)+count;
  };
  add(participantCategory(domain,'ADULT'),Math.max(0,Number(intent?.party?.adults)||0));
  for(const child of arr(intent?.party?.children)){
    add(participantCategory(domain,'CHILD',Number(child?.age)),1);
  }
  add(participantCategory(domain,'INFANT'),Math.max(0,Number(intent?.party?.infants)||0));
  return result;
}

function partySize(intent){
  return Math.max(0,Number(intent?.party?.adults)||0)
    + arr(intent?.party?.children).length
    + Math.max(0,Number(intent?.party?.infants)||0);
}

function slotFor(domain,date,total){
  return arr(domain?.availabilitySlots).find(slot=>{
    if(slot?.date!==date||slot?.soldOut||slot?.unavailable) return false;
    const remaining=Number(slot?.availabilityCount);
    return slot?.unlimitedAvailability||!Number.isFinite(remaining)||remaining>=total;
  })||null;
}

function rateFor(domain,slot){
  const slotDefault=String(slot?.defaultRateId??'');
  if(slotDefault){
    const rate=arr(domain?.rates).find(item=>String(item?.id)===slotDefault);
    if(rate) return rate;
  }
  const slotRateIds=new Set([
    ...arr(slot?.rates).map(item=>String(item?.id)),
    ...arr(slot?.priceQuotesByRate).map(item=>String(item?.rateId)),
  ].filter(Boolean));
  return arr(domain?.rates).find(item=>slotRateIds.has(String(item?.id)))
    ||arr(domain?.rates)[0]
    ||null;
}

function normalized(value){
  return str(value).toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'');
}

function pickupSelection(domain,intent){
  if(intent?.pickupPreference!=='PICKUP') return {mode:'MEET_ON_LOCATION'};
  const hotel=str(intent?.hotel);
  const places=arr(domain?.experience?.pickup?.places);
  const needle=normalized(hotel);
  const place=needle
    ? places.find(item=>normalized(item?.title||item?.name).includes(needle)
        ||normalized(item?.location?.address).includes(needle))
    : null;
  if(place?.id) return {mode:'PICKUP',placeId:String(place.id)};
  if(hotel&&domain?.experience?.pickup?.customAllowed){
    return {mode:'PICKUP',customLocation:{wholeAddress:hotel}};
  }
  return {mode:'PICKUP'};
}

export function selectionFromTravelIntent(domain,intent){
  const valid=validateTravelIntent(intent);
  const date=exactIntentDate(valid);
  if(!date){
    throw new CapabilityPolicyError('exact_date_required','Offer search requires an exact date',409);
  }
  const total=partySize(valid);
  if(total<1){
    throw new CapabilityPolicyError('party_required','Offer search requires at least one traveller',409);
  }
  const slot=slotFor(domain,date,total);
  const rate=rateFor(domain,slot);
  return {
    productId:String(domain?.experience?.id||domain?.provider?.productId||''),
    date,
    ...(slot?.id?{slotId:String(slot.id)}:{}),
    ...(slot?.startTimeId?{startTimeId:String(slot.startTimeId)}:{}),
    ...(rate?.id?{rateId:String(rate.id)}:{}),
    participants:participantSelection(domain,valid),
    pickup:pickupSelection(domain,valid),
    dropoff:{mode:'NO_DROPOFF'},
    extras:{},
    customer:{},
    answers:{},
    passengers:[],
  };
}

function productFacts(domain,product){
  return {
    product,
    facts:{
      description:str(domain?.experience?.description),
      excerpt:str(domain?.experience?.excerpt),
      duration:structuredClone(domain?.experience?.duration||null),
      minAge:domain?.experience?.minAge??null,
      itinerary:arr(domain?.experience?.itinerary).map(item=>({
        title:str(item?.title),
        body:str(item?.body),
      })).filter(item=>item.title||item.body),
      inclusions:structuredClone(domain?.experience?.content?.inclusions||[]),
      exclusions:structuredClone(domain?.experience?.content?.exclusions||[]),
      requirements:domain?.experience?.content?.requirements??null,
      attention:domain?.experience?.content?.attention??null,
      pickup:{
        enabled:Boolean(domain?.experience?.pickup?.enabled),
        customAllowed:Boolean(domain?.experience?.pickup?.customAllowed),
      },
      meeting:structuredClone(domain?.experience?.meeting||null),
      cancellationPolicy:structuredClone(domain?.cancellationPolicy||null),
    },
  };
}

async function evidenceEnvelope(capability,args,data,now){
  const retrievedAt=(now instanceof Date?now:new Date(now)).toISOString();
  const hash=await sha256Hex(stableJson({capability,args,data,retrievedAt}));
  return {
    evidenceId:`cap-${hash.slice(0,24)}`,
    source:'BOKUN',
    authority:'PROVIDER_VERIFIED',
    capability,
    retrievedAt,
    data,
  };
}

export function createTravelCapabilityBroker({
  provider,
  bookingSessionExecutor=null,
  now=()=>new Date(),
}={}){
  if(!provider) throw new TypeError('Travel capability broker requires a provider');

  async function searchProducts(args={}){
    exactKeys(args,['start','end','lang','includePickupPlaces','productIds'],'searchProducts');
    const start=isoDate(args.start)?args.start:vietnamToday(now());
    const end=isoDate(args.end)?args.end:addDays(start,14);
    const domains=await provider.getDomains({
      start,end,
      lang:args.lang||'EN',
      includePickupPlaces:Boolean(args.includePickupPlaces),
      ...(Array.isArray(args.productIds)?{productIds:args.productIds}:{}),
    });
    return Promise.all(domains.map(async domain=>{
      const product=canonicalProductFromBokunDomain(domain,{
        vendorId:provider.vendorId,
      });
      return productFacts(domain,product);
    }));
  }

  async function compareProducts(args={}){
    exactKeys(args,['productIds','start','end','lang'],'compareProducts');
    const products=await searchProducts({
      productIds:args.productIds,
      start:args.start,
      end:args.end,
      lang:args.lang,
      includePickupPlaces:false,
    });
    return products;
  }

  async function searchOffers(args={}){
    exactKeys(args,['intent','productIds','lang'],'searchOffers');
    const intent=validateTravelIntent(args.intent);
    const date=exactIntentDate(intent);
    if(!date) throw new CapabilityPolicyError('exact_date_required','searchOffers requires an exact TravelIntent date',409);
    const domains=await provider.getDomains({
      start:date,
      end:date,
      lang:args.lang||'EN',
      includePickupPlaces:intent.pickupPreference==='PICKUP',
      ...(Array.isArray(args.productIds)?{productIds:args.productIds}:{}),
    });
    const results=[];
    for(const domain of domains){
      const product=canonicalProductFromBokunDomain(domain,{vendorId:provider.vendorId});
      try{
        const selection=selectionFromTravelIntent(domain,intent);
        const resolved=await provider.resolveOffer({selection,domain});
        results.push({
          product,
          selection,
          offer:resolved.offer,
          readyToQuote:Boolean(resolved.resolution?.readyToQuote),
          readyToBook:Boolean(resolved.resolution?.readyToBook),
          errors:structuredClone(resolved.resolution?.errors||[]),
          warnings:structuredClone(resolved.resolution?.warnings||[]),
          bookingDataIssues:structuredClone(resolved.resolution?.bookingDataIssues||[]),
        });
      }catch(error){
        results.push({
          product,
          selection:null,
          offer:null,
          readyToQuote:false,
          readyToBook:false,
          errors:[{code:error?.code||'offer_resolution_failed',message:error?.message||'Offer resolution failed'}],
          warnings:[],
          bookingDataIssues:[],
        });
      }
    }
    return results;
  }

  async function getOfferDetails(args={}){
    exactKeys(args,['intent','productId','lang'],'getOfferDetails');
    const matches=await searchOffers({
      intent:args.intent,
      productIds:[args.productId],
      lang:args.lang,
    });
    return matches[0]||null;
  }

  async function createQuote(args={}){
    exactKeys(args,['transactionId','selection','domain','ttlMs'],'createQuote');
    return provider.quoteSelection({
      transactionId:args.transactionId,
      selection:args.selection,
      domain:args.domain,
      ttlMs:args.ttlMs,
    });
  }

  async function refreshQuote(args={}){
    exactKeys(args,['transactionId','previousQuote','selection','domain','ttlMs'],'refreshQuote');
    return provider.quoteSelection({
      transactionId:args.transactionId,
      previousQuote:args.previousQuote,
      selection:args.selection,
      domain:args.domain,
      ttlMs:args.ttlMs,
    });
  }

  async function getBookingRequirements(args={}){
    exactKeys(args,['selection','domain'],'getBookingRequirements');
    const resolved=await provider.resolveOffer({
      selection:args.selection,
      domain:args.domain,
    });
    return {
      requirements:provider.getBookingRequirements(resolved.resolution),
      readyToBook:Boolean(resolved.resolution?.readyToBook),
      bookingDataIssues:structuredClone(resolved.resolution?.bookingDataIssues||[]),
    };
  }

  async function previewBooking(args={}){
    exactKeys(args,['transactionId','selection','domain','previousQuote','ttlMs'],'previewBooking');
    const quoted=args.previousQuote
      ? await refreshQuote(args)
      : await createQuote(args);
    return {
      quote:quoted.quote,
      evidence:quoted.evidence,
      readyToBook:Boolean(quoted.quote?.readyToBook),
      requiredFieldCodes:structuredClone(quoted.quote?.requiredFieldCodes||[]),
      issues:structuredClone(quoted.quote?.issues||{}),
    };
  }

  async function mutation(name,args,principal){
    if(principal!==CAPABILITY_PRINCIPALS.TRANSACTION_POLICY){
      throw new CapabilityPolicyError(
        'mutation_authority_required',
        `${name} can only be invoked by Transaction Policy, never by the model`,
        403,
      );
    }
    if(!bookingSessionExecutor){
      throw new CapabilityPolicyError('booking_session_unavailable','BookingSession executor is not configured',503);
    }
    if(name==='reserveBooking'){
      exactKeys(args,['transactionId','expectedRevision','quoteId','quoteRevision'],'reserveBooking');
      return bookingSessionExecutor(args.transactionId,{
        action:'RESERVE',
        expectedRevision:args.expectedRevision,
        quoteId:args.quoteId,
        quoteRevision:args.quoteRevision,
      });
    }
    throw new CapabilityPolicyError(
      'mutation_capability_not_supported',
      `${name} is declared but the current Bókun release does not expose that mutation`,
      409,
    );
  }

  async function execute(name,args={},{
    principal=CAPABILITY_PRINCIPALS.MODEL,
  }={}){
    const definition=TRAVEL_CAPABILITIES[name];
    if(!definition) throw new CapabilityPolicyError('unknown_capability',`Unknown travel capability ${name}`,400);
    if(definition.kind==='MUTATION') return mutation(name,args,principal);

    let data;
    if(name==='searchProducts') data=await searchProducts(args);
    else if(name==='compareProducts') data=await compareProducts(args);
    else if(name==='searchOffers') data=await searchOffers(args);
    else if(name==='getOfferDetails') data=await getOfferDetails(args);
    else if(name==='createQuote') data=await createQuote(args);
    else if(name==='refreshQuote') data=await refreshQuote(args);
    else if(name==='getBookingRequirements') data=await getBookingRequirements(args);
    else if(name==='previewBooking') data=await previewBooking(args);
    else throw new CapabilityPolicyError('unknown_capability',`Unknown travel capability ${name}`,400);

    return evidenceEnvelope(name,args,data,now());
  }

  return Object.freeze({
    definitions:TRAVEL_CAPABILITIES,
    execute,
    searchProducts,
    compareProducts,
    searchOffers,
    getOfferDetails,
    createQuote,
    refreshQuote,
    getBookingRequirements,
    previewBooking,
  });
}
