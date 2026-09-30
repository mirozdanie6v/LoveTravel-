const arr = value => Array.isArray(value) ? value : [];
const obj = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const str = value => String(value ?? '').trim();
const num = value => Number.isFinite(Number(value)) ? Number(value) : null;
const has = value => value !== null && value !== undefined && str(value) !== '';

const CUSTOMER_ALIASES = {
  firstName:['firstName','first_name'],
  lastName:['lastName','last_name'],
  email:['email'],
  phoneNumber:['phoneNumber','phone','phone_number'],
  nationality:['nationality'],
  gender:['gender'],
  personalIdNumber:['personalIdNumber','personal_id_number'],
  passportId:['passportId','passport_id'],
  passportExpiry:['passportExpiry','passport_expiry'],
  dateOfBirth:['dateOfBirth','date_of_birth'],
  organization:['organization'],
  address:['address'],
  title:['title'],
};

function valueFor(source, questionId) {
  const keys = CUSTOMER_ALIASES[questionId] || [questionId];
  for (const key of keys) if (has(source?.[key])) return source[key];
  return undefined;
}

function answer(questionId, value) {
  if (!questionId || !has(value)) return null;
  const values = Array.isArray(value) ? value.filter(has).map(String) : [String(value)];
  return values.length ? { questionId:String(questionId), values } : null;
}

function answerMap(values = {}) {
  return Object.entries(obj(values))
    .map(([questionId,value])=>answer(questionId,value))
    .filter(Boolean);
}

function questionAnswers(questions = [], source = {}, issues = [], path = '') {
  const out=[];
  for (const q of arr(questions)) {
    const questionId=str(q?.questionId);
    if(!questionId) continue;
    const value=valueFor(source,questionId);
    if(q?.required===true && !has(value)) {
      issues.push({
        code:'required_checkout_answer_missing',
        path:path ? path+'.'+questionId : questionId,
        questionId,
        label:str(q?.label),
      });
      continue;
    }
    const item=answer(questionId,value);
    if(item) out.push(item);
  }
  return out;
}

function checkoutActivityQuestions(contract, productId) {
  return arr(contract?.questions?.activityBookings)
    .find(item=>String(item?.activityId)===String(productId))
    || arr(contract?.questions?.activityBookings)[0]
    || {};
}

function explicitPassengersByCategory(selection) {
  const buckets=new Map();
  for(const passenger of arr(selection?.passengers)) {
    const key=str(passenger?.categoryId);
    if(!key) continue;
    if(!buckets.has(key)) buckets.set(key,[]);
    buckets.get(key).push(passenger);
  }
  return buckets;
}

function extraRequests(passenger = {}) {
  return Object.entries(obj(passenger?.extras))
    .flatMap(([extraId,entry])=>{
      const item=typeof entry==='number' ? {quantity:entry} : obj(entry);
      const quantity=Math.max(0,Math.floor(Number(item.quantity)||0));
      if(!quantity) return [];
      return [{
        extraId:Number(extraId),
        quantity,
        answers:answerMap(item.answers),
      }];
    });
}

function buildPassengers(selection, activityQuestions, issues) {
  const explicit=explicitPassengersByCategory(selection);
  const questionPassengerByCategory=new Map(
    arr(activityQuestions?.passengers).map(item=>[String(item?.pricingCategoryId),item])
  );
  const result=[];

  for(const [categoryIdRaw,countRaw] of Object.entries(obj(selection?.participants))) {
    const categoryId=num(categoryIdRaw);
    const count=Math.max(0,Math.floor(Number(countRaw)||0));
    if(categoryId===null || count===0) continue;
    const bucket=explicit.get(String(categoryIdRaw)) || [];

    for(let index=0;index<count;index+=1) {
      const source=bucket[index] || {};
      const q=questionPassengerByCategory.get(String(categoryId)) || {};
      const passengerDetails=questionAnswers(
        q?.passengerDetails,
        {...obj(source),...obj(source?.answers)},
        issues,
        'passengers.'+result.length+'.details',
      );
      const questionIds=new Set(arr(q?.questions).map(item=>str(item?.questionId)).filter(Boolean));
      const passengerAnswers=answerMap(source?.answers).filter(item=>questionIds.size===0 || questionIds.has(item.questionId));
      for(const question of arr(q?.questions)) {
        const id=str(question?.questionId);
        if(question?.required===true && id && !passengerAnswers.some(item=>item.questionId===id)) {
          issues.push({
            code:'required_checkout_answer_missing',
            path:'passengers.'+result.length+'.answers.'+id,
            questionId:id,
            label:str(question?.label),
          });
        }
      }

      result.push({
        pricingCategoryId:categoryId,
        ...(passengerDetails.length?{passengerDetails}:{}),
        ...(passengerAnswers.length?{answers:passengerAnswers}:{}),
        ...(extraRequests(source).length?{extras:extraRequests(source)}:{}),
      });
    }
  }

  if(result.length===0) issues.push({code:'passengers_required',path:'participants'});
  return result;
}

function buildPickupAnswers(selection, pickupQuestions, issues, selectedPlace) {
  const source={...obj(selection?.pickup?.answers)};
  if(has(selection?.pickup?.roomNumber)) source.roomNumber=selection.pickup.roomNumber;

  const answers=questionAnswers(pickupQuestions,source,issues,'pickup.answers');
  if(selectedPlace?.askForRoomNumber===true && !has(selection?.pickup?.roomNumber)) {
    issues.push({
      code:'pickup_room_number_required',
      path:'pickup.roomNumber',
      questionId:'roomNumber',
      label:'Room number',
    });
  }
  if(has(selection?.pickup?.roomNumber) && !answers.some(item=>item.questionId==='roomNumber')) {
    answers.push(answer('roomNumber',selection.pickup.roomNumber));
  }
  return answers.filter(Boolean);
}

function nonPassengerExtrasSelected(selection) {
  return Object.values(obj(selection?.extras)).some(value=>Number(value)>0);
}

export function buildBokunBookingDraft(resolution = {}, contract = {}, options = {}) {
  const issues=[];
  const selection=obj(resolution?.selection);
  const resolved=obj(resolution?.resolved);

  if(resolution?.readyToQuote!==true) issues.push({code:'selection_not_quote_ready',path:'selection'});

  const productId=num(selection.productId ?? resolved?.product?.id ?? resolution?.product?.id);
  const rateId=num(selection.rateId ?? resolved?.rate?.id);
  const startTimeId=num(selection.startTimeId ?? resolved?.slot?.startTimeId);
  const date=str(selection.date ?? resolved?.slot?.date);

  if(productId===null) issues.push({code:'product_required',path:'productId'});
  if(rateId===null) issues.push({code:'rate_required',path:'rateId'});
  if(!date) issues.push({code:'date_required',path:'date'});
  if(startTimeId===null) issues.push({code:'start_time_required',path:'startTimeId'});

  const activityQuestions=checkoutActivityQuestions(contract,productId);
  const mainContactDetails=questionAnswers(
    contract?.questions?.mainContactDetails,
    selection.customer,
    issues,
    'customer',
  );

  const passengers=buildPassengers(selection,activityQuestions,issues);
  const pickup=selection?.pickup?.mode==='PICKUP';
  const dropoff=selection?.dropoff?.mode==='DROPOFF';
  const selectedPlace=resolved?.pickupPlace || null;
  const pickupAnswers=pickup
    ? buildPickupAnswers(selection,activityQuestions?.pickupQuestions,issues,selectedPlace)
    : [];

  if(nonPassengerExtrasSelected(selection)) {
    issues.push({
      code:'booking_level_extra_mapping_not_verified',
      path:'extras',
      message:'Bókun direct booking extras must be mapped to passenger requests; booking-level allocation is not verified yet.',
    });
  }

  const activityBooking={
    activityId:productId,
    rateId,
    startTimeId,
    date,
    pickup,
    dropoff,
    checkedIn:false,
    customized:false,
    ...(pickup && selection?.pickup?.placeId ? {pickupPlaceId:num(selection.pickup.placeId)} : {}),
    ...(pickup && !selection?.pickup?.placeId && selection?.pickup?.customLocation
      ? {pickupDescription:str(selection.pickup.customLocation.wholeAddress || selection.pickup.customLocation.addressLine1)}
      : {}),
    ...(dropoff && selection?.dropoff?.placeId ? {dropoffPlaceId:num(selection.dropoff.placeId)} : {}),
    ...(dropoff && !selection?.dropoff?.placeId && selection?.dropoff?.customLocation
      ? {dropoffDescription:str(selection.dropoff.customLocation.wholeAddress || selection.dropoff.customLocation.addressLine1)}
      : {}),
    ...(answerMap(selection.answers).length?{answers:answerMap(selection.answers)}:{}),
    ...(pickupAnswers.length?{pickupAnswers}:{}),
    passengers,
  };

  const externalBookingReference=str(options.externalBookingReference);
  if(!externalBookingReference) {
    issues.push({code:'external_booking_reference_required_by_viiversion',path:'externalBookingReference'});
  }

  const bookingRequest={
    mainContactDetails,
    activityBookings:[activityBooking],
    sendCustomerNotification:false,
    ...(externalBookingReference?{externalBookingReference}:{}),
    externalBookingEntityName:str(options.externalBookingEntityName || 'VIIVERSION'),
    externalBookingEntityCode:str(options.externalBookingEntityCode || 'LOVE_TRAVEL'),
  };

  const checkoutOptions=arr(contract?.options);
  const reserveOption=checkoutOptions.find(option=>arr(option?.paymentMethods?.allowedMethods).includes('RESERVE_FOR_EXTERNAL_PAYMENT')) || null;
  if(!reserveOption) {
    issues.push({code:'reserve_for_external_payment_unavailable',path:'checkout.paymentMethod'});
  }

  const checkoutRequestTemplate={
    checkoutOption:str(reserveOption?.type),
    paymentMethod:reserveOption?'RESERVE_FOR_EXTERNAL_PAYMENT':null,
    source:'DIRECT_REQUEST',
    directBooking:bookingRequest,
    sendNotificationToMainContact:false,
    showPricesInNotification:false,
  };

  return {
    schemaVersion:'lovetravel.bokun-booking-draft.v1',
    writePerformed:false,
    readyForCheckout:issues.length===0,
    readyForReserve:issues.length===0 && Boolean(reserveOption),
    issues,
    bookingRequest,
    checkoutRequestTemplate,
    checkout:{
      currency:reserveOption?.currency || null,
      amount:reserveOption?.amount ?? null,
      optionType:reserveOption?.type || null,
      allowedMethods:arr(reserveOption?.paymentMethods?.allowedMethods),
    },
  };
}

export const _bookingDraftTest={answer,answerMap,questionAnswers,buildPassengers,buildPickupAnswers};
