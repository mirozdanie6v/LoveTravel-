const arr = value => Array.isArray(value) ? value : [];
const num = value => value === null || value === undefined || value === '' ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
const str = value => value === null || value === undefined ? '' : String(value);

export const BOOKING_SELECTION_SCHEMA = 'lovetravel.booking-selection.v1';
export const BOOKING_RESOLUTION_SCHEMA = 'lovetravel.booking-selection-resolution.v1';

function issue(code, path, message, meta = undefined) {
  return { code, path, message, ...(meta === undefined ? {} : { meta }) };
}

function participantMap(value = {}) {
  if (Array.isArray(value)) {
    return Object.fromEntries(value
      .map(item => [str(item?.categoryId), Math.max(0, Math.floor(Number(item?.count) || 0))])
      .filter(([key]) => key));
  }
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(Object.entries(value)
    .map(([key,count]) => [str(key), Math.max(0, Math.floor(Number(count) || 0))])
    .filter(([key]) => key));
}

function extraMap(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .map(([key,count]) => [str(key), Math.max(0, Math.floor(Number(count) || 0))])
    .filter(([key,count]) => key && count > 0));
}

export function normalizeBookingSelection(input = {}, domain = {}) {
  const productId = str(input.productId || domain?.experience?.id || domain?.provider?.productId) || null;
  return {
    schemaVersion:BOOKING_SELECTION_SCHEMA,
    productId,
    date:/^\d{4}-\d{2}-\d{2}$/.test(str(input.date)) ? str(input.date) : null,
    startTimeId:input.startTimeId === null || input.startTimeId === undefined || input.startTimeId === '' ? null : str(input.startTimeId),
    slotId:input.slotId === null || input.slotId === undefined || input.slotId === '' ? null : str(input.slotId),
    rateId:input.rateId === null || input.rateId === undefined || input.rateId === '' ? null : str(input.rateId),
    participants:participantMap(input.participants),
    pickup:{
      mode:['MEET_ON_LOCATION','PICKUP'].includes(str(input?.pickup?.mode).toUpperCase())
        ? str(input.pickup.mode).toUpperCase()
        : null,
      placeId:input?.pickup?.placeId === null || input?.pickup?.placeId === undefined || input?.pickup?.placeId === ''
        ? null : str(input.pickup.placeId),
      customLocation:input?.pickup?.customLocation && typeof input.pickup.customLocation === 'object'
        ? { ...input.pickup.customLocation }
        : null,
      roomNumber:input?.pickup?.roomNumber === null || input?.pickup?.roomNumber === undefined
        ? '' : str(input.pickup.roomNumber).trim(),
    },
    extras:extraMap(input.extras),
    customer:input.customer && typeof input.customer === 'object' && !Array.isArray(input.customer) ? { ...input.customer } : {},
    answers:input.answers && typeof input.answers === 'object' && !Array.isArray(input.answers) ? { ...input.answers } : {},
    passengers:Array.isArray(input.passengers) ? input.passengers.map(item => item && typeof item === 'object' ? { ...item } : {}) : [],
  };
}

function rateIdSet(slot = {}) {
  return new Set([
    ...arr(slot.rates).map(rate => str(rate?.id)),
    ...arr(slot.priceQuotesByRate).map(quote => str(quote?.rateId)),
  ].filter(Boolean));
}

export function rateSupportsSlot(rate = {}, slot = {}) {
  if (!rate || !slot) return false;
  const rateId = str(rate.id);
  if (!rateId) return false;
  const explicit = rateIdSet(slot);
  if (explicit.has(rateId)) return true;
  if (rate.allStartTimes) return true;
  const startTimeId = str(slot.startTimeId);
  return arr(rate.startTimeIds).some(id => str(id) === startTimeId);
}

function cutoffMinutes(cutoff = {}) {
  const weeks = Math.max(0, num(cutoff.weeks) || 0);
  const days = Math.max(0, num(cutoff.days) || 0);
  const hours = Math.max(0, num(cutoff.hours) || 0);
  const minutes = Math.max(0, num(cutoff.minutes) || 0);
  return weeks * 7 * 24 * 60 + days * 24 * 60 + hours * 60 + minutes;
}

function formatParts(epoch, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', second:'2-digit',
    hourCycle:'h23',
  }).formatToParts(new Date(epoch));
  return Object.fromEntries(parts.map(part => [part.type, part.value]));
}

export function zonedLocalToEpoch(date, time, timeZone = 'Asia/Ho_Chi_Minh') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str(date)) || !/^\d{1,2}:\d{2}/.test(str(time))) return null;
  const [year,month,day] = str(date).split('-').map(Number);
  const [hour,minute,second = 0] = str(time).split(':').map(Number);
  let epoch = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let i=0;i<3;i+=1) {
    const p = formatParts(epoch, timeZone);
    const represented = Date.UTC(Number(p.year), Number(p.month)-1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
    const target = Date.UTC(year, month - 1, day, hour, minute, second);
    const correction = target - represented;
    epoch += correction;
    if (correction === 0) break;
  }
  return epoch;
}

export function slotBookability(domain = {}, slot = {}, now = new Date()) {
  const reasons = [];
  if (slot.soldOut) reasons.push('sold_out');
  if (slot.unavailable) reasons.push('unavailable');
  const available = num(slot.availabilityCount);
  if (!slot.unlimitedAvailability && available !== null && available <= 0) reasons.push('no_capacity');

  const cutoff = domain?.bookingRequirements?.cutoff || {};
  const type = str(cutoff.type).toUpperCase();
  const minutes = cutoffMinutes(cutoff);
  let cutoffAt = null;
  if (minutes > 0 && (!type || type === 'RELATIVE_TO_START_TIME')) {
    const startAt = zonedLocalToEpoch(slot.date, slot.startTime, domain?.experience?.location?.timeZone || 'Asia/Ho_Chi_Minh');
    if (startAt !== null) {
      cutoffAt = startAt - minutes * 60000;
      if (now.getTime() >= cutoffAt) reasons.push('booking_cutoff_passed');
    }
  }

  return {
    bookable:reasons.length === 0,
    reasons,
    cutoffAt:cutoffAt === null ? null : new Date(cutoffAt).toISOString(),
  };
}

function quoteRows(slot = {}, rateId) {
  return arr(slot.priceQuotesByRate)
    .filter(item => str(item?.rateId) === str(rateId))
    .flatMap(item => arr(item.participantPrices));
}

function applicableQuote(rows, categoryId, totalParticipants) {
  const candidates = rows.filter(row => str(row?.categoryId) === str(categoryId));
  if (!candidates.length) return null;
  const tier = candidates.find(row => {
    const min = num(row.minParticipantsRequired);
    const max = num(row.maxParticipantsRequired);
    return (min === null || totalParticipants >= min) && (max === null || totalParticipants <= max);
  });
  return tier || (candidates.length === 1 ? candidates[0] : null);
}

function currencyOf(lines = []) {
  const currencies = [...new Set(lines.map(line => line?.amount?.currency).filter(Boolean))];
  return currencies.length === 1 ? currencies[0] : currencies.length ? 'MIXED' : null;
}

function sumAmounts(lines, field) {
  return lines.reduce((sum,line) => sum + (Number(line?.[field]) || 0), 0);
}

function rateQuoteFor(slot = {}, rateId) {
  return arr(slot.priceQuotesByRate).find(item => str(item?.rateId) === str(rateId)) || null;
}

function extraConfigMap(rate = {}) {
  return new Map(arr(rate.extraConfigs)
    .map(config => [str(config?.extraId || config?.extra?.id), config])
    .filter(([extraId]) => extraId));
}

function extraConstraints(domain = {}, rate = null, participantTotal = 0, selection = {}) {
  const configs=extraConfigMap(rate || {});
  return arr(domain.extras).flatMap(extra => {
    const extraId=str(extra?.id);
    const config=configs.get(extraId);
    if (!config) return [];
    const selectionType=str(config.selectionType).toUpperCase();
    const pricingType=str(config.pricingType).toUpperCase();
    const limitByPax=Boolean(extra?.limitByPax);
    const configuredMax=num(extra?.maxPerBooking);
    const maxQuantity=limitByPax
      ? Math.max(0,participantTotal)
      : configuredMax !== null && configuredMax > 0
        ? configuredMax
        : null;
    return [{
      id:extraId,
      title:str(extra?.title),
      code:str(extra?.code),
      description:str(extra?.description),
      required:selectionType === 'PRESELECTED' || selectionType === 'REQUIRED',
      selectionType,
      pricingType,
      pricedPerPerson:config.pricedPerPerson === null || config.pricedPerPerson === undefined ? null : Boolean(config.pricedPerPerson),
      limitByPax,
      maxQuantity,
      quantity:Number(selection.extras?.[extraId] || 0),
    }];
  });
}

function moneyCurrency(value) {
  return str(value?.currency) || null;
}

function publicRate(rate = {}, domain = {}, slots = []) {
  const adult = arr(domain.participants).find(item => str(item.ticketCategory).toUpperCase() === 'ADULT') || arr(domain.participants)[0] || null;
  let from = null;
  for (const slot of slots) {
    if (rate.pricedPerPerson && adult) {
      const rows = quoteRows(slot, rate.id).filter(row => str(row.categoryId) === str(adult.id));
      for (const row of rows) {
        const amount = num(row?.amount?.amount);
        if (amount !== null && (from === null || amount < from.amount)) {
          from = { amount, currency:row?.amount?.currency || null };
        }
      }
    } else {
      const quote=rateQuoteFor(slot,rate.id);
      const amount=num(quote?.pricePerBooking?.amount);
      if(amount!==null && (from===null||amount<from.amount)){
        from={amount,currency:quote?.pricePerBooking?.currency||null};
      }
    }
  }
  return {
    id:str(rate.id),
    title:str(rate.title),
    code:str(rate.code),
    minPerBooking:num(rate.minPerBooking),
    maxPerBooking:num(rate.maxPerBooking),
    pricedPerPerson:Boolean(rate.pricedPerPerson),
    pickup:rate.pickup || null,
    dropoff:rate.dropoff || null,
    extraConfigs:arr(rate.extraConfigs).map(config=>({
      extraId:str(config?.extraId || config?.extra?.id),
      selectionType:str(config?.selectionType),
      pricingType:str(config?.pricingType),
      pricedPerPerson:config?.pricedPerPerson === null || config?.pricedPerPerson === undefined ? null : Boolean(config.pricedPerPerson),
    })),
    fromPrice:from,
  };
}

function publicSlot(slot = {}, domain = {}, rateId = null, now = new Date()) {
  const bookability = slotBookability(domain, slot, now);
  return {
    id:str(slot.id),
    date:str(slot.date),
    localizedDate:str(slot.localizedDate),
    startTime:str(slot.startTime),
    startTimeId:slot.startTimeId === null || slot.startTimeId === undefined ? null : str(slot.startTimeId),
    recurrenceId:slot.recurrenceId === null || slot.recurrenceId === undefined ? null : str(slot.recurrenceId),
    availabilityCount:num(slot.availabilityCount),
    bookedParticipants:num(slot.bookedParticipants),
    unlimitedAvailability:Boolean(slot.unlimitedAvailability),
    minParticipants:num(slot.minParticipants),
    minParticipantsToBookNow:num(slot.minParticipantsToBookNow),
    pickup:slot.pickup || null,
    bookable:bookability.bookable,
    disabledReasons:bookability.reasons,
    cutoffAt:bookability.cutoffAt,
    rateAvailable:rateId ? rateIdSet(slot).has(str(rateId)) : undefined,
  };
}

function resolveSlot(domain, selection, bookableSlots) {
  if (selection.slotId) return bookableSlots.find(slot => str(slot.id) === selection.slotId) || null;
  const byDate = selection.date ? bookableSlots.filter(slot => slot.date === selection.date) : bookableSlots;
  if (selection.startTimeId) {
    const matches = byDate.filter(slot => str(slot.startTimeId) === selection.startTimeId);
    return matches.length === 1 ? matches[0] : null;
  }
  return byDate.length === 1 ? byDate[0] : null;
}

function pickupConstraint(domain, rate, slot, participantTotal) {
  const selectionType = str(rate?.pickup?.selectionType).toUpperCase();
  const pricingType = str(rate?.pickup?.pricingType).toUpperCase();
  const productEnabled = Boolean(domain?.experience?.pickup?.enabled);
  const pickupCapacity = num(slot?.pickup?.availabilityCount);
  const pickupSoldOut = slot?.pickup?.soldOut === true ||
    (pickupCapacity !== null && pickupCapacity >= 0 && participantTotal > pickupCapacity);

  const pickupAllowed = productEnabled && selectionType !== 'UNAVAILABLE' && !pickupSoldOut;
  const required = pickupAllowed && ['REQUIRED','PRESELECTED'].includes(selectionType);
  const optional = pickupAllowed && selectionType === 'OPTIONAL';
  const modes = [];
  if (!required) modes.push('MEET_ON_LOCATION');
  if (pickupAllowed) modes.push('PICKUP');

  const places = arr(domain?.experience?.pickup?.places).map(item => ({
    id:item?.id === null || item?.id === undefined ? null : str(item.id),
    title:str(item?.title),
    description:str(item?.description),
    placeType:str(item?.placeType),
    externalId:str(item?.externalId),
    askForRoomNumber:item?.askForRoomNumber === null || item?.askForRoomNumber === undefined ? null : Boolean(item.askForRoomNumber),
    addressLine1:str(item?.addressLine1),
    addressLine2:str(item?.addressLine2),
    wholeAddress:str(item?.wholeAddress),
    city:str(item?.city),
    state:str(item?.state),
    countryCode:str(item?.countryCode),
    postalCode:str(item?.postalCode),
    latitude:num(item?.latitude),
    longitude:num(item?.longitude),
  })).filter(item => item.id);

  const customAllowed = Boolean(domain?.experience?.pickup?.customAllowed);

  return {
    selectionType:selectionType || (productEnabled ? 'OPTIONAL' : 'UNAVAILABLE'),
    pricingType,
    pricedPerPerson:rate?.pickup?.pricedPerPerson ?? null,
    required,
    optional,
    pickupAllowed,
    pickupSoldOut,
    availabilityCount:pickupCapacity,
    modes,
    placeGroups:arr(domain?.experience?.pickup?.placeGroups).map(item => ({
      id:item?.id === null || item?.id === undefined ? null : str(item.id),
      title:str(item?.title),
      code:str(item?.code),
      description:str(item?.description),
    })),
    places,
    customAllowed,
    locationChoiceAvailable:places.length > 0 || customAllowed,
  };
}

function canonicalCustomerField(field) {
  const normalized = str(field).replace(/[^a-z0-9]/gi,'').toLowerCase();
  const canonical = {
    firstname:'firstName',
    lastname:'lastName',
    phonenumber:'phoneNumber',
    phone:'phoneNumber',
    email:'email',
  };
  return canonical[normalized] || str(field);
}

function customerFieldKeys(field) {
  const canonical = canonicalCustomerField(field);
  const aliases = {
    firstName:['firstName','firstname','FIRST_NAME'],
    lastName:['lastName','lastname','LAST_NAME'],
    phoneNumber:['phoneNumber','phonenumber','phone','PHONE_NUMBER','PHONE'],
    email:['email','EMAIL'],
  };
  return aliases[canonical] || [field, canonical].filter(Boolean);
}

function fieldSpec(item) {
  if (typeof item === 'string') {
    return {
      field:canonicalCustomerField(item),
      required:true,
      requiredBeforeDeparture:false,
    };
  }
  if (!item || typeof item !== 'object') return null;
  const raw = item.field ?? item.name ?? item.code ?? item.id ?? '';
  const field = canonicalCustomerField(raw);
  if (!field) return null;
  return {
    field,
    required:item.required === undefined ? null : Boolean(item.required),
    requiredBeforeDeparture:item.requiredBeforeDeparture === undefined ? null : Boolean(item.requiredBeforeDeparture),
  };
}

function passengerFieldSpec(item) {
  if (typeof item === 'string') {
    return { field:canonicalCustomerField(item), required:true };
  }
  if (!item || typeof item !== 'object') return null;
  const field=canonicalCustomerField(item.field ?? item.name ?? item.code ?? item.id ?? '');
  if(!field) return null;
  return {
    field,
    required:item.required === undefined ? true : Boolean(item.required),
  };
}

function bookingRequirements(domain = {}) {
  const req = domain.bookingRequirements || {};
  return {
    requiredCustomerFields:arr(req.requiredCustomerFields).map(canonicalCustomerField).filter(Boolean),
    mainContactFields:arr(req.mainContactFields).map(fieldSpec).filter(Boolean),
    passengerFields:arr(req.passengerFields).map(passengerFieldSpec).filter(Boolean),
    questions:arr(req.questions).map(item => ({
      id:item?.id === null || item?.id === undefined ? null : str(item.id),
      title:str(item?.title),
      code:str(item?.code),
      description:str(item?.description),
      required:Boolean(item?.required),
    })),
    customFields:arr(req.customFields).map(item => ({
      id:item?.id === null || item?.id === undefined ? null : str(item.id),
      title:str(item?.title),
      code:str(item?.code),
      description:str(item?.description),
      required:Boolean(item?.required),
    })),
    bookingType:str(req.bookingType),
    cutoff:req.cutoff || null,
    requestDeadline:req.requestDeadline || null,
  };
}

function hasValue(value) {
  return value !== null && value !== undefined && str(value).trim() !== '';
}

function answerKey(item = {}) {
  return str(item.id || item.code || item.title);
}

function pickupLocationHasValue(value) {
  if (!value || typeof value !== 'object') return false;
  return ['wholeAddress','addressLine1','address','title','name']
    .some(key => hasValue(value[key]));
}

function missingBookingData(domain, selection, participantTotal, pickup = null, extras = []) {
  const missing = [];
  const req = bookingRequirements(domain);
  const requiredFields = new Set(arr(req.requiredCustomerFields).map(canonicalCustomerField));

  for (const item of arr(req.mainContactFields)) {
    if (item?.required === true && item?.field) requiredFields.add(canonicalCustomerField(item.field));
  }
  for (const field of requiredFields) {
    const aliases = customerFieldKeys(field);
    if (!aliases.some(key => hasValue(selection.customer?.[key]))) {
      missing.push(issue('required_customer_field_missing', 'customer.'+field, 'Required customer field is missing', { field }));
    }
  }

  for (const question of arr(req.questions)) {
    if (!question?.required) continue;
    const key = answerKey(question);
    if (key && !hasValue(selection.answers?.[key])) {
      missing.push(issue('required_booking_question_missing', 'answers.'+key, 'Required booking question is missing', { questionId:key }));
    }
  }

  for (const custom of arr(req.customFields)) {
    if (!custom?.required) continue;
    const key = answerKey(custom);
    if (key && !hasValue(selection.answers?.[key])) {
      missing.push(issue('required_custom_field_missing', 'answers.'+key, 'Required custom field is missing', { customFieldId:key }));
    }
  }

  const passengerSpecs=arr(req.passengerFields).filter(item=>item?.field);
  const requiredPassengerFields=[...new Set(passengerSpecs.filter(item=>item.required!==false).map(item=>canonicalCustomerField(item.field)).filter(Boolean))];
  if (requiredPassengerFields.length) {
    if (selection.passengers.length < participantTotal) {
      missing.push(issue('passenger_details_incomplete','passengers','Passenger details are incomplete',{
        requiredCount:participantTotal,
        currentCount:selection.passengers.length,
        fields:requiredPassengerFields,
      }));
    }
    for (let index=0; index<participantTotal; index+=1) {
      const passenger = selection.passengers[index] || {};
      for (const field of requiredPassengerFields) {
        const aliases = customerFieldKeys(field);
        if (!aliases.some(key => hasValue(passenger?.[key]))) {
          missing.push(issue(
            'passenger_field_missing',
            'passengers.'+index+'.'+field,
            'Required passenger field is missing',
            { passengerIndex:index, field },
          ));
        }
      }
    }
  }

  for (const extra of arr(extras)) {
    if (!extra?.required) continue;
    const extraId = str(extra.id);
    if (extraId && Number(selection.extras?.[extraId] || 0) <= 0) {
      missing.push(issue('required_extra_missing','extras.'+extraId,'Required extra must be selected',{ extraId }));
    }
  }

  if (selection.pickup?.mode === 'PICKUP') {
    const selectedPlace = selection.pickup.placeId
      ? arr(pickup?.places).find(item => str(item?.id) === str(selection.pickup.placeId)) || null
      : null;
    if (selectedPlace?.askForRoomNumber && !hasValue(selection.pickup.roomNumber)) {
      missing.push(issue(
        'pickup_room_number_required',
        'pickup.roomNumber',
        'Room number is required for the selected pickup place',
        { placeId:str(selectedPlace.id) },
      ));
    }
    if (selection.pickup.customLocation && !pickupLocationHasValue(selection.pickup.customLocation)) {
      missing.push(issue(
        'custom_pickup_location_incomplete',
        'pickup.customLocation',
        'Custom pickup location is incomplete',
      ));
    }
  }

  return missing;
}

export function resolveBookingSelection(domain = {}, input = {}, { now = new Date() } = {}) {
  const selection = normalizeBookingSelection(input, domain);
  const errors = [];
  const warnings = [];

  if (!domain?.experience?.id) errors.push(issue('domain_missing_experience','domain.experience','Domain experience is missing'));
  if (selection.productId !== str(domain?.experience?.id)) {
    errors.push(issue('product_mismatch','productId','Selection product does not match domain product'));
  }

  const slotStates = arr(domain.availabilitySlots).map(slot => ({
    slot,
    state:slotBookability(domain, slot, now),
  }));
  const bookableSlots = slotStates.filter(item => item.state.bookable).map(item => item.slot);

  const allRates = arr(domain.rates);
  const selectedRate = selection.rateId ? allRates.find(rate => str(rate.id) === selection.rateId) || null : null;
  if (selection.rateId && !selectedRate) {
    errors.push(issue('unknown_rate','rateId','Selected rate is not part of this product',{ rateId:selection.rateId }));
  }

  const dates = [...new Set(bookableSlots
    .filter(slot => !selectedRate || rateSupportsSlot(selectedRate, slot))
    .map(slot => slot.date)
    .filter(Boolean))]
    .sort()
    .map(date => ({
      date,
      slots:bookableSlots.filter(slot => slot.date === date && (!selectedRate || rateSupportsSlot(selectedRate, slot))).length,
    }));

  if (selection.date && !dates.some(item => item.date === selection.date)) {
    errors.push(issue('date_not_available','date','Selected date has no bookable availability',{ date:selection.date }));
  }

  const dateSlots = selection.date
    ? bookableSlots.filter(slot => slot.date === selection.date && (!selectedRate || rateSupportsSlot(selectedRate, slot)))
    : bookableSlots.filter(slot => !selectedRate || rateSupportsSlot(selectedRate, slot));

  const times = dateSlots.map(slot => publicSlot(slot, domain, selection.rateId, now));

  const selectedSlot = resolveSlot(domain, selection, bookableSlots);
  if (selection.slotId && !selectedSlot) {
    errors.push(issue('slot_not_available','slotId','Selected availability slot is not bookable',{ slotId:selection.slotId }));
  }
  if (selection.startTimeId && selection.date && !dateSlots.some(slot => str(slot.startTimeId) === selection.startTimeId)) {
    errors.push(issue('time_not_available','startTimeId','Selected start time is not available on this date',{
      date:selection.date,
      startTimeId:selection.startTimeId,
    }));
  }

  const rateScopeSlots = selectedSlot
    ? [selectedSlot]
    : selection.date
      ? bookableSlots.filter(slot => slot.date === selection.date)
      : bookableSlots;
  const allowedRates = allRates.filter(rate => rateScopeSlots.some(slot => rateSupportsSlot(rate, slot)));
  const rates = allowedRates.map(rate => publicRate(rate, domain, rateScopeSlots));

  if (selectedRate && selectedSlot && !rateSupportsSlot(selectedRate, selectedSlot)) {
    errors.push(issue('rate_not_available_for_slot','rateId','Selected rate is not available for the selected date/time',{
      rateId:selection.rateId,
      slotId:selectedSlot.id,
    }));
  }

  const participantCategories = arr(domain.participants).map(category => ({
    id:str(category.id),
    title:str(category.title),
    ticketCategory:str(category.ticketCategory),
    minAge:num(category.minAge),
    maxAge:num(category.maxAge),
    count:selection.participants[str(category.id)] || 0,
  }));
  const knownCategoryIds = new Set(participantCategories.map(item => item.id));
  for (const [categoryId,count] of Object.entries(selection.participants)) {
    if (count > 0 && !knownCategoryIds.has(categoryId)) {
      errors.push(issue('unknown_participant_category','participants.'+categoryId,'Unknown participant category',{ categoryId }));
    }
  }

  const participantTotal = participantCategories.reduce((sum,item) => sum + item.count, 0);
  if (participantTotal <= 0) {
    errors.push(issue('participants_required','participants','At least one participant is required'));
  }

  if (selectedRate) {
    const min = num(selectedRate.minPerBooking);
    const max = num(selectedRate.maxPerBooking);
    if (min !== null && participantTotal > 0 && participantTotal < min) {
      errors.push(issue('below_rate_minimum','participants','Participant count is below rate minimum',{ minimum:min, total:participantTotal }));
    }
    if (max !== null && participantTotal > max) {
      errors.push(issue('above_rate_maximum','participants','Participant count exceeds rate maximum',{ maximum:max, total:participantTotal }));
    }
  }

  if (selectedSlot && participantTotal > 0) {
    const minNow = num(selectedSlot.minParticipantsToBookNow);
    if (minNow !== null && participantTotal < minNow) {
      errors.push(issue('below_slot_minimum','participants','Participant count is below the minimum required to book now',{
        minimum:minNow,total:participantTotal,
      }));
    }
    const available = num(selectedSlot.availabilityCount);
    if (!selectedSlot.unlimitedAvailability && available !== null && participantTotal > available) {
      errors.push(issue('insufficient_capacity','participants','Not enough availability for selected participants',{
        available,total:participantTotal,
      }));
    }
  }

  const pickup = pickupConstraint(domain, selectedRate, selectedSlot, participantTotal);
  if (pickup.required && selection.pickup.mode !== 'PICKUP') {
    errors.push(issue('pickup_required','pickup.mode','Pickup is required for the selected rate'));
  }
  if (selection.pickup.mode === 'PICKUP' && !pickup.pickupAllowed) {
    errors.push(issue('pickup_not_available','pickup.mode','Pickup is not available for this selection'));
  }
  if (selection.pickup.mode === 'MEET_ON_LOCATION' && pickup.required) {
    errors.push(issue('meet_on_location_not_allowed','pickup.mode','Meeting on location is not allowed for this rate'));
  }

  const extras = extraConstraints(domain,selectedRate,participantTotal,selection);
  const knownExtraIds = new Set(extras.map(item => item.id).filter(Boolean));
  for (const extraId of Object.keys(selection.extras)) {
    if (!knownExtraIds.has(extraId)) {
      errors.push(issue('unknown_extra','extras.'+extraId,'Selected extra is not available for the selected rate',{ extraId }));
      continue;
    }
    const extra=extras.find(item=>item.id===extraId);
    const quantity=Math.max(0,Number(selection.extras[extraId])||0);
    if(extra?.maxQuantity!==null && extra?.maxQuantity!==undefined && quantity>extra.maxQuantity){
      errors.push(issue('extra_quantity_exceeds_maximum','extras.'+extraId,'Selected extra quantity exceeds the allowed maximum',{
        extraId,maximum:extra.maxQuantity,quantity,
      }));
    }
  }

  let quote = {
    available:false,
    currency:null,
    participantLines:[],
    participantSubtotal:null,
    pickupTotal:null,
    extrasTotal:null,
    extraLines:[],
    total:null,
  };

  if (selectedSlot && selectedRate && participantTotal > 0) {
    const selectedRateQuote=rateQuoteFor(selectedSlot,selectedRate.id);
    const lines = [];
    let quoteComplete = true;
    let participantSubtotal = 0;
    let baseCurrency = null;

    if (selectedRate.pricedPerPerson) {
      const rows = quoteRows(selectedSlot, selectedRate.id);
      for (const category of participantCategories.filter(item => item.count > 0)) {
        const row = applicableQuote(rows, category.id, participantTotal);
        const unit = num(row?.amount?.amount);
        const currency = str(row?.amount?.currency) || null;
        if (!row || unit === null || !currency) {
          quoteComplete = false;
          errors.push(issue('participant_price_unavailable','participants.'+category.id,'No applicable price quote for participant category',{
            categoryId:category.id,totalParticipants:participantTotal,
          }));
          continue;
        }
        lines.push({
          categoryId:category.id,
          title:category.title,
          ticketCategory:category.ticketCategory,
          count:category.count,
          amount:{ amount:unit, currency },
          minParticipantsRequired:num(row.minParticipantsRequired),
          maxParticipantsRequired:num(row.maxParticipantsRequired),
          lineTotal:Number((unit * category.count).toFixed(2)),
        });
      }
      baseCurrency=currencyOf(lines);
      if (baseCurrency === 'MIXED') {
        quoteComplete = false;
        errors.push(issue('mixed_currencies','quote','Participant prices use multiple currencies'));
      }
      participantSubtotal=Number(sumAmounts(lines,'lineTotal').toFixed(2));
    } else {
      const amount=num(selectedRateQuote?.pricePerBooking?.amount);
      baseCurrency=moneyCurrency(selectedRateQuote?.pricePerBooking);
      if(amount===null||!baseCurrency){
        quoteComplete=false;
        errors.push(issue('booking_price_unavailable','rateId','No per-booking price quote is available for this rate',{rateId:str(selectedRate.id)}));
      }else{
        participantSubtotal=Number(amount.toFixed(2));
      }
    }

    let pickupTotal = 0;
    let pickupCurrency = null;
    if (selection.pickup.mode === 'PICKUP') {
      if (pickup.pricingType === 'INCLUDED_IN_PRICE' || !pickup.pricingType) {
        pickupTotal = 0;
      } else if (pickup.pricedPerPerson) {
        const priceRows=arr(selectedRateQuote?.pickupPricePerCategoryUnit);
        let resolved=0;
        for(const category of participantCategories.filter(item=>item.count>0)){
          const row=priceRows.find(item=>str(item?.categoryId)===category.id);
          const unit=num(row?.amount?.amount);
          const currency=moneyCurrency(row?.amount);
          if(unit===null||!currency){
            quoteComplete=false;
            warnings.push(issue('pickup_price_unresolved','pickup','Pickup price is missing for a selected participant category',{categoryId:category.id}));
            continue;
          }
          pickupCurrency=pickupCurrency||currency;
          if(pickupCurrency!==currency){
            quoteComplete=false;
            errors.push(issue('mixed_currencies','pickup','Pickup prices use multiple currencies'));
          }
          resolved+=unit*category.count;
        }
        pickupTotal=Number(resolved.toFixed(2));
      } else {
        const direct = num(selectedRateQuote?.pickupPrice?.amount ?? selectedSlot?.pickup?.price?.amount);
        pickupCurrency=moneyCurrency(selectedRateQuote?.pickupPrice ?? selectedSlot?.pickup?.price);
        if (direct !== null && pickupCurrency) {
          pickupTotal=Number(direct.toFixed(2));
        } else {
          quoteComplete = false;
          warnings.push(issue('pickup_price_unresolved','pickup','Pickup pricing is configured separately but no resolved pickup price is available'));
        }
      }
    }

    let extrasTotal = 0;
    const extraLines=[];
    for(const extra of extras.filter(item=>Number(item.quantity)>0)){
      const quantity=Math.max(0,Number(extra.quantity)||0);
      if(extra.pricingType==='INCLUDED_IN_PRICE'||!extra.pricingType){
        extraLines.push({extraId:extra.id,title:extra.title,quantity,unitAmount:0,lineTotal:0,currency:baseCurrency});
        continue;
      }
      if(extra.pricedPerPerson){
        quoteComplete=false;
        warnings.push(issue(
          'extras_price_unresolved',
          'extras.'+extra.id,
          'Per-person extra pricing requires passenger-level allocation before final quoting',
          {extraId:extra.id},
        ));
        continue;
      }
      const row=arr(selectedRateQuote?.extraPricePerUnit).find(item=>str(item?.id)===extra.id);
      const unit=num(row?.amount?.amount);
      const currency=moneyCurrency(row?.amount);
      if(unit===null||!currency){
        quoteComplete=false;
        warnings.push(issue('extras_price_unresolved','extras.'+extra.id,'Selected extra has no resolved price',{extraId:extra.id}));
        continue;
      }
      const lineTotal=Number((unit*quantity).toFixed(2));
      extrasTotal+=lineTotal;
      extraLines.push({extraId:extra.id,title:extra.title,quantity,unitAmount:unit,lineTotal,currency});
    }
    extrasTotal=Number(extrasTotal.toFixed(2));

    const currencies=[
      baseCurrency==='MIXED'?null:baseCurrency,
      pickupTotal>0?pickupCurrency:null,
      ...extraLines.filter(line=>line.lineTotal>0).map(line=>line.currency),
    ].filter(Boolean);
    const distinct=[...new Set(currencies)];
    const quoteCurrency=distinct.length===1?distinct[0]:distinct.length===0?(baseCurrency==='MIXED'?null:baseCurrency):null;
    if(distinct.length>1){
      quoteComplete=false;
      errors.push(issue('mixed_currencies','quote','Booking components use multiple currencies'));
    }

    if (quoteComplete) {
      quote = {
        available:true,
        currency:quoteCurrency,
        participantLines:lines,
        participantSubtotal,
        pickupTotal,
        extrasTotal,
        extraLines,
        total:Number((participantSubtotal + pickupTotal + extrasTotal).toFixed(2)),
      };
    } else {
      quote = {
        available:false,
        currency:quoteCurrency,
        participantLines:lines,
        participantSubtotal,
        pickupTotal,
        extrasTotal:extraLines.length?extrasTotal:null,
        extraLines,
        total:null,
      };
    }
  }

  if (!selection.date) errors.push(issue('date_required','date','Booking date is required'));
  if (!selectedSlot) errors.push(issue('slot_required','slotId','A specific date/time slot is required'));
  if (!selectedRate) errors.push(issue('rate_required','rateId','A rate/option is required'));

  const bookingDataIssues = missingBookingData(domain, selection, participantTotal, pickup, extras);
  if (pickup.optional && !selection.pickup.mode) {
    bookingDataIssues.push(issue('pickup_mode_required','pickup.mode','Choose pickup or meeting on location before booking'));
  }
  if (selection.pickup.mode === 'PICKUP') {
    const knownPickupIds = new Set(arr(pickup.places).map(item => str(item.id)).filter(Boolean));
    if (!pickup.locationChoiceAvailable) {
      bookingDataIssues.push(issue(
        'pickup_places_unavailable',
        'pickup',
        'Pickup is enabled for the selected rate, but no selectable pickup places or custom pickup option are available',
      ));
    } else if (selection.pickup.placeId) {
      if (!knownPickupIds.has(str(selection.pickup.placeId))) {
        bookingDataIssues.push(issue(
          'unknown_pickup_place',
          'pickup.placeId',
          'Selected pickup place is not available for this product',
          { placeId:str(selection.pickup.placeId) },
        ));
      }
    } else if (selection.pickup.customLocation) {
      if (!pickup.customAllowed) {
        bookingDataIssues.push(issue(
          'custom_pickup_not_allowed',
          'pickup.customLocation',
          'Custom pickup location is not allowed for this product',
        ));
      }
    } else {
      bookingDataIssues.push(issue(
        'pickup_location_required',
        'pickup',
        'Choose a pickup place before booking',
      ));
    }
  }
  const blockingQuoteCodes = new Set([
    'product_mismatch','date_not_available','slot_not_available','time_not_available','unknown_rate',
    'rate_not_available_for_slot','participants_required','unknown_participant_category','below_rate_minimum',
    'above_rate_maximum','below_slot_minimum','insufficient_capacity','pickup_required','pickup_not_available',
    'meet_on_location_not_allowed','participant_price_unavailable','mixed_currencies','date_required','slot_required','rate_required'
  ]);
  const readyToQuote = quote.available && !errors.some(item => blockingQuoteCodes.has(item.code));
  const readyToBook = readyToQuote && bookingDataIssues.length === 0 && !warnings.some(item => ['pickup_price_unresolved','extras_price_unresolved'].includes(item.code));

  const currentSlot = selectedSlot ? publicSlot(selectedSlot, domain, selection.rateId, now) : null;
  const currentRate = selectedRate ? publicRate(selectedRate, domain, selectedSlot ? [selectedSlot] : rateScopeSlots) : null;

  return {
    schemaVersion:BOOKING_RESOLUTION_SCHEMA,
    product:{
      id:str(domain?.experience?.id),
      title:str(domain?.experience?.title),
      bookingType:str(domain?.bookingRequirements?.bookingType),
    },
    selection,
    resolved:{
      slot:currentSlot,
      rate:currentRate,
      participantTotal,
      pickupMode:selection.pickup.mode,
      pickupPlace:selection.pickup.placeId
        ? arr(pickup.places).find(item => str(item.id) === str(selection.pickup.placeId)) || null
        : null,
    },
    constraints:{
      dates,
      times,
      rates,
      participants:participantCategories,
      pickup,
      extras,
      bookingRequirements:bookingRequirements(domain),
    },
    quote,
    errors,
    bookingDataIssues,
    warnings,
    readyToQuote,
    readyToBook,
  };
}

export function selectionForPatch(selection = {}, patch = {}) {
  const next = { ...selection, ...patch };
  if ('date' in patch) {
    next.slotId = null;
    next.startTimeId = null;
  }
  if ('startTimeId' in patch) next.slotId = null;
  if ('rateId' in patch) {
    // Keep date/time so resolver can state whether the newly selected rate is compatible.
  }
  return next;
}

export const _bookingSelectionTest = {
  applicableQuote,
  quoteRows,
  cutoffMinutes,
  pickupConstraint,
  missingBookingData,
};
