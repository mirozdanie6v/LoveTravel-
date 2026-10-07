const asArray = value => Array.isArray(value) ? value : [];
const text = (value, max = 8000) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const numeric = value => value === null || value === undefined || value === '' ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
const bool = value => Boolean(value);

function money(value) {
  const amount = numeric(value?.amount);
  const currency = text(value?.currency, 12) || null;
  return amount === null ? null : { amount, currency };
}

function nonEmpty(value) {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  if (typeof value === 'boolean') return value;
  return true;
}

function id(value) {
  const n = numeric(value);
  return n === null ? (text(value, 120) || null) : n;
}

function photoUrl(photo = {}) {
  if (typeof photo === 'string') return text(photo, 2000);
  const derived = asArray(photo.derived);
  return text(
    derived.find(item => item?.name === 'large')?.cleanUrl
      || derived.find(item => item?.name === 'large')?.url
      || derived.find(item => item?.name === 'preview')?.cleanUrl
      || derived.find(item => item?.name === 'preview')?.url
      || photo.cleanUrl
      || photo.url
      || photo.originalUrl,
    2000,
  );
}

function mediaPhotos(entity = {}) {
  const media = entity?.media && typeof entity.media === 'object' ? entity.media : {};
  const candidates = [
    entity.keyPhoto,
    entity.photo,
    entity.image,
    ...asArray(entity.photos),
    ...asArray(entity.images),
    ...asArray(media.photos),
    ...asArray(media.images),
  ].filter(Boolean);
  const seen = new Set();
  return candidates.map(photo => ({
    url:photoUrl(photo),
    alt:text(typeof photo === 'object' ? (photo.alt || photo.title || photo.name) : '', 300),
    providerData:photo,
  })).filter(item => {
    if (!item.url || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

function inferIsoDate(entry = {}) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(entry.dateIso || ''))) return String(entry.dateIso);
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(entry.iso || ''))) return String(entry.iso);
  const idMatch = String(entry.id || '').match(/_(\d{4})(\d{2})(\d{2})$/);
  if (idMatch) return `${idMatch[1]}-${idMatch[2]}-${idMatch[3]}`;
  const timestamp = numeric(entry.date);
  if (timestamp !== null && timestamp > 0) return new Date(timestamp).toISOString().slice(0, 10);
  return '';
}

function point(item = {}) {
  const address = item.address || {};
  return {
    id:id(item.id),
    title:text(item.title, 240),
    addressLine1:text(address.addressLine1, 300),
    addressLine2:text(address.addressLine2, 300),
    city:text(address.city, 160),
    state:text(address.state, 160),
    countryCode:text(address.countryCode, 16),
    postalCode:text(address.postalCode, 40),
    latitude:numeric(address.geoPoint?.latitude),
    longitude:numeric(address.geoPoint?.longitude),
    providerData:item,
  };
}

function pickupPlace(item = {}) {
  const location = item.location && typeof item.location === 'object' ? item.location : {};
  const addressObject = item.address && typeof item.address === 'object'
    ? item.address
    : location.address && typeof location.address === 'object'
      ? location.address
      : {};
  const geo = addressObject.geoPoint || item.geoPoint || location.geoPoint || {};
  const addressLine1 = typeof item.address === 'string'
    ? item.address
    : typeof location.address === 'string'
      ? location.address
      : item.addressLine1 || addressObject.addressLine1 || '';
  const label = item.title || item.name || item.label || addressLine1 || location.wholeAddress || '';
  return {
    id:id(item.id),
    title:text(label, 300),
    description:text(item.description || item.pickupDescription || item.notes, 3000),
    placeType:text(item.placeType || item.type, 80),
    externalId:text(item.externalId, 180),
    askForRoomNumber:item.askForRoomNumber === undefined ? null : bool(item.askForRoomNumber),
    addressLine1:text(addressLine1, 300),
    addressLine2:text(item.addressLine2 || addressObject.addressLine2, 300),
    wholeAddress:text(item.wholeAddress || location.wholeAddress, 600),
    city:text(item.city || location.city || addressObject.city, 160),
    state:text(item.state || location.state || addressObject.state, 160),
    countryCode:text(item.countryCode || location.countryCode || addressObject.countryCode, 16),
    postalCode:text(item.postalCode || item.postCode || location.postalCode || location.postCode || addressObject.postalCode, 40),
    latitude:numeric(item.latitude ?? location.latitude ?? geo.latitude),
    longitude:numeric(item.longitude ?? location.longitude ?? geo.longitude),
    providerData:item,
  };
}

function providerPlaceArray(payload, preferredKey) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  if (preferredKey && Array.isArray(payload[preferredKey])) return payload[preferredKey];
  for (const key of ['places','items','results']) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  return [];
}

function pickupPlaceArray(payload) {
  return providerPlaceArray(payload, 'pickupPlaces');
}

function dropoffPlaceArray(payload) {
  return providerPlaceArray(payload, 'dropoffPlaces');
}

function genericProviderEntity(item = {}) {
  return {
    id:id(item.id),
    title:text(item.title || item.name || item.label, 240),
    code:text(item.code || item.rateCode || item.key, 120),
    description:text(item.description || item.body || item.text, 3000),
    required:item.required === undefined ? null : bool(item.required),
    providerData:item,
  };
}

function extraEntity(item = {}) {
  return {
    id:id(item.id),
    externalId:text(item.externalId, 180),
    title:text(item.title || item.name, 240),
    code:text(item.code, 120),
    description:text(item.description, 3000),
    maxPerBooking:numeric(item.maxPerBooking),
    limitByPax:item.limitByPax === undefined ? null : bool(item.limitByPax),
    providerData:item,
  };
}

function referenceIds(values = []) {
  return asArray(values).map(value => id(
    value && typeof value === 'object' ? (value.id ?? value.activityRateId ?? value.extraId) : value
  )).filter(value => value !== null);
}

function videoEntity(item = {}) {
  return {
    id:id(item.id),
    title:text(item.title || item.name, 300),
    description:text(item.description, 3000),
    url:text(item.url || item.videoUrl || item.embedUrl || item.originalUrl || item.youtubeUrl, 2000),
    providerData:item,
  };
}

function questionEntity(item = {}) {
  const options=asArray(item.options ?? item.answerOptions).map(option => ({
    id:id(option.id),
    label:text(option.label ?? option.title ?? option.value, 300),
    value:text(option.value ?? option.id ?? option.label, 500),
    providerData:option,
  }));
  return {
    id:id(item.id ?? item.questionId),
    title:text(item.title || item.label || item.question, 500),
    code:text(item.code || item.questionCode, 160),
    description:text(item.description || item.help, 3000),
    required:item.required === undefined ? false : bool(item.required),
    personalData:item.personalData === undefined ? null : bool(item.personalData),
    placeholder:text(item.placeholder, 500),
    dataType:text(item.dataType, 80),
    dataFormat:text(item.dataFormat, 80),
    pattern:text(item.pattern, 500),
    defaultValue:item.defaultValue ?? null,
    context:text(item.context, 100),
    pricingCategoryTriggerSelection:text(item.pricingCategoryTriggerSelection, 80),
    pricingCategoryTriggers:referenceIds(item.pricingCategoryTriggers),
    rateTriggerSelection:text(item.rateTriggerSelection, 80),
    rateTriggers:referenceIds(item.rateTriggers),
    extraTriggerSelection:text(item.extraTriggerSelection, 80),
    extraTriggers:referenceIds(item.extraTriggers),
    selectFromOptions:item.selectFromOptions === undefined ? options.length > 0 : bool(item.selectFromOptions),
    selectMultiple:item.selectMultiple === undefined ? false : bool(item.selectMultiple),
    options,
    flags:asArray(item.flags),
    providerData:item,
  };
}

function rateExtraConfig(item = {}) {
  const extra = item.extra && typeof item.extra === 'object' ? item.extra : {};
  return {
    id:id(item.id),
    extraId:id(extra.id ?? item.extraId),
    extraExternalId:text(extra.externalId ?? item.extraExternalId, 180),
    selectionType:text(item.selectionType, 80),
    pricingType:text(item.pricingType, 80),
    pricedPerPerson:item.pricedPerPerson === undefined ? null : bool(item.pricedPerPerson),
    providerData:item,
  };
}

function pricedItem(item = {}) {
  return {
    id:id(item.id),
    amount:money(item.amount),
    providerData:item,
  };
}

function pricedCategoryItem(item = {}) {
  return {
    categoryId:id(item.id),
    amount:money(item.amount),
    providerData:item,
  };
}

function extraCategoryPrice(item = {}) {
  return {
    extraId:id(item.id),
    prices:asArray(item.prices).map(pricedCategoryItem),
    providerData:item,
  };
}

function cancellationPolicy(policy) {
  if (!policy || typeof policy !== 'object') return null;
  return {
    id:id(policy.id),
    title:text(policy.title, 240),
    policyType:text(policy.policyType || policy.policyTypeEnum, 80),
    simpleCutoffHours:numeric(policy.simpleCutoffHours),
    defaultPolicy:bool(policy.defaultPolicy),
    penaltyRules:asArray(policy.penaltyRules).map(rule => ({
      id:id(rule.id),
      cutoffHours:numeric(rule.cutoffHours),
      charge:numeric(rule.charge),
      chargeType:text(rule.chargeType, 60),
      percentage:numeric(rule.percentage),
      providerData:rule,
    })),
    providerData:policy,
  };
}

function participantCategory(item = {}) {
  return {
    id:id(item.id),
    title:text(item.title, 120),
    ticketCategory:text(item.ticketCategory, 60),
    minAge:numeric(item.minAge),
    maxAge:numeric(item.maxAge),
    providerData:item,
  };
}

function rateEntity(rate = {}) {
  return {
    id:id(rate.id),
    code:text(rate.rateCode, 100),
    title:text(rate.title, 240),
    description:text(rate.description, 4000),
    index:numeric(rate.index),
    pricedPerPerson:bool(rate.pricedPerPerson),
    minPerBooking:numeric(rate.minPerBooking),
    maxPerBooking:numeric(rate.maxPerBooking),
    cancellationPolicy:cancellationPolicy(rate.cancellationPolicy),
    pickup:{
      selectionType:text(rate.pickupSelectionType, 80),
      pricingType:text(rate.pickupPricingType, 80),
      pricedPerPerson:rate.pickupPricedPerPerson === undefined ? null : bool(rate.pickupPricedPerPerson),
    },
    dropoff:{
      selectionType:text(rate.dropoffSelectionType, 80),
      pricingType:text(rate.dropoffPricingType, 80),
      pricedPerPerson:rate.dropoffPricedPerPerson === undefined ? null : bool(rate.dropoffPricedPerPerson),
    },
    startTimeIds:asArray(rate.startTimeIds).map(id),
    allStartTimes:bool(rate.allStartTimes),
    tieredPricingEnabled:bool(rate.tieredPricingEnabled),
    tiers:asArray(rate.tiers).map(tier => ({
      id:id(tier.id),
      minPassengersRequired:numeric(tier.minPassengersRequired),
      maxPassengersRequired:numeric(tier.maxPassengersRequired),
      pricingCategoryId:id(tier.pricingCategoryId),
      activityRateId:id(tier.activityRateId),
      providerData:tier,
    })),
    pricingCategoryIds:asArray(rate.pricingCategoryIds).map(id),
    extraConfigs:asArray(rate.extraConfigs).map(rateExtraConfig),
    details:asArray(rate.details).map(genericProviderEntity),
    textItems:asArray(rate.textItems).map(genericProviderEntity),
    media:{
      photos:mediaPhotos(rate),
      videos:asArray(rate.videos || rate.media?.videos).map(videoEntity),
    },
    fixedPassExpiryDate:rate.fixedPassExpiryDate ?? null,
    passValidForDays:numeric(rate.passValidForDays),
    providerData:rate,
  };
}

function categoryQuote(item = {}) {
  return {
    categoryId:id(item.id),
    amount:money(item.amount),
    minParticipantsRequired:numeric(item.minParticipantsRequired),
    maxParticipantsRequired:numeric(item.maxParticipantsRequired),
    providerData:item,
  };
}

function rateQuote(item = {}) {
  return {
    rateId:id(item.activityRateId),
    participantPrices:asArray(item.pricePerCategoryUnit).map(categoryQuote),
    pricePerBooking:money(item.pricePerBooking),
    pickupPrice:money(item.pickupPrice),
    pickupPricePerCategoryUnit:asArray(item.pickupPricePerCategoryUnit).map(pricedCategoryItem),
    dropoffPrice:money(item.dropoffPrice),
    dropoffPricePerCategoryUnit:asArray(item.dropoffPricePerCategoryUnit).map(pricedCategoryItem),
    extraPricePerUnit:asArray(item.extraPricePerUnit).map(pricedItem),
    extraPricePerCategoryUnit:asArray(item.extraPricePerCategoryUnit).map(extraCategoryPrice),
    providerData:item,
  };
}

function availabilitySlot(entry = {}) {
  return {
    id:text(entry.id, 180),
    productId:id(entry.activityId),
    productTitle:text(entry.activityTitle, 300),
    ownerId:id(entry.activityOwnerId),
    ownerTitle:text(entry.activityOwnerTitle, 240),
    date:inferIsoDate(entry),
    localizedDate:text(entry.localizedDate, 120),
    startTime:text(entry.startTime, 40),
    startTimeId:id(entry.startTimeId),
    startTimeLabel:text(entry.startTimeLabel, 160),
    recurrenceId:id(entry.recurrenceId),
    flexible:bool(entry.flexible),
    availabilityCount:numeric(entry.availabilityCount),
    bookedParticipants:numeric(entry.bookedParticipants),
    unlimitedAvailability:bool(entry.unlimitedAvailability),
    soldOut:bool(entry.soldOut),
    unavailable:bool(entry.unavailable),
    minParticipants:numeric(entry.minParticipants),
    minParticipantsToBookNow:numeric(entry.minParticipantsToBookNow),
    defaultRateId:id(entry.defaultRateId),
    productGroupId:id(entry.productGroupId),
    guidedLanguages:asArray(entry.guidedLanguages).map(value => text(value, 40)).filter(Boolean),
    rates:asArray(entry.rates).map(rateEntity),
    priceQuotesByRate:asArray(entry.pricesByRate).map(rateQuote),
    defaultPrice:money(entry.defaultPrice),
    pricesByCategory:entry.pricesByCategory ?? {},
    pickup:{
      allotment:entry.pickupAllotment === undefined ? null : bool(entry.pickupAllotment),
      availabilityCount:numeric(entry.pickupAvailabilityCount),
      soldOut:entry.pickupSoldOut === undefined ? null : bool(entry.pickupSoldOut),
      price:money(entry.pickupPrice),
      pricesByCategory:entry.pickupPricesByCategory ?? {},
    },
    dropoff:{
      price:money(entry.dropoffPrice),
      pricesByCategory:entry.dropoffPricesByCategory ?? {},
    },
    extraPrices:entry.extraPrices ?? {},
    comboActivity:bool(entry.comboActivity),
    comboStartTimes:asArray(entry.comboStartTimes),
    flags:asArray(entry.flags),
    providerData:entry,
  };
}

const MAPPED_PRODUCT_FIELDS = new Set([
  'id','actualId','externalId','title','description','excerpt','slug','published','lastModified','lastPublished',
  'activityType','productCategory','categories','activityCategories','activityAttributes','keywords','tagGroups',
  'duration','durationText','durationType','durationDays','durationHours','durationMinutes','durationWeeks',
  'difficultyLevel','minAge','baseLanguage','languages','guidanceTypes','timeZone','locationCode',
  'keyPhoto','photos','videos',
  'included','inclusions','excluded','exclusions','requirements','attention','dressCode','knowBeforeYouGoItems',
  'agendaItems','route',
  'startPoints','meetingType','googlePlace',
  'pickupService','pickupPlaceGroups','pickupFlags','pickupMinutesBefore','pickupTimeByLocations','pickupTimeLocationBased',
  'pickupTimeWindowInMinutes','pickupAllotment','pickupAllotmentType','pickupActivityId','customPickupAllowed',
  'dropoffService','dropoffPlaceGroups','dropoffFlags','customDropoffAllowed','useSameAsPickUpPlaces',
  'pricingCategories','rates','defaultRateId','nextDefaultPrice','nextDefaultPriceMoney','nextDefaultPriceAsText',
  'originalDefaultPrice','activityPriceCatalogs','paymentCurrencies',
  'bookingCutoff','bookingCutoffDays','bookingCutoffHours','bookingCutoffMinutes','bookingCutoffWeeks',
  'cutoffReferenceHour','cutoffReferenceMinute','cutoffType','bookingType','bookingQuestions','bookingLabels',
  'requiredCustomerFields','mainContactFields','passengerFields','customFields','reservationTimeout','vendorReservationTimeout',
  'requestDeadline','requestDeadlineDays','requestDeadlineHours','requestDeadlineMinutes','requestDeadlineWeeks',
  'bookableExtras','offers',
  'cancellationPolicy',
  'capacityType','inventoryLocal','inventorySupportsAvailability','inventorySupportsPricing','resourceSlots',
  'scheduleType','dayBasedAvailability','dayOptions','startTimes','defaultOpeningHours','seasonalOpeningHours','hasOpeningHours',
  'earlyBookingLimitDaysBefore','earlyBookingLimitMonthsBefore','earlyBookingLimitSpecificDateTime','earlyBookingLimitTime','earlyBookingLimitType',
  'allowCustomizedBookings','privateActivity','storedExternally','createMethod',
  'supportedAccessibilityTypes','passportRequired',
  'ticketMsg','ticketPerPerson','barcodeType','overrideBarcodeFormat',
  'reviewCount','reviewRating','tripadvisorReview',
  'comboActivity','comboParts','ticketComboComponents','ticketPerComboComponent','returnProduct',
  'passesAvailable','passCapacity','passExpiryType','passValidForDays','fixedPassExpiryDate',
  'vendor','actualVendor','affiliateHubProduct','productGroupId','pluginId',
  'box','boxedActivityId','boxedVendor','hasBoxes','flags','displaySettings','widgetSettings',
  'showGlobalPickupMsg','showNoPickupMsg','noPickupMsg','useComponentPickupAllotments',
]);

const INTENTIONALLY_IGNORED_PRODUCT_FIELDS = new Set([
  // Provider/audit metadata that is preserved in providerRaw/providerExtensions but
  // is not part of the customer or booking contract.
  'creationDate',
  'marketplaceVisibilityType',
]);

function coverage(rawProduct, rawAvailability) {
  const productKeys = Object.keys(rawProduct || {}).sort();
  const availabilityKeys = [...new Set(asArray(rawAvailability).flatMap(item => Object.keys(item || {})))].sort();
  const intentionallyIgnoredTopLevelFields = productKeys.filter(key => INTENTIONALLY_IGNORED_PRODUCT_FIELDS.has(key));
  const unmappedProductKeys = productKeys.filter(
    key => !MAPPED_PRODUCT_FIELDS.has(key) && !INTENTIONALLY_IGNORED_PRODUCT_FIELDS.has(key)
  );
  return {
    product:{
      totalTopLevelFields:productKeys.length,
      mappedTopLevelFields:productKeys.filter(key => MAPPED_PRODUCT_FIELDS.has(key)),
      intentionallyIgnoredTopLevelFields,
      unmappedTopLevelFields:unmappedProductKeys,
      nonEmptyUnmappedTopLevelFields:unmappedProductKeys.filter(key => nonEmpty(rawProduct?.[key])),
    },
    availability:{
      totalTopLevelFields:availabilityKeys.length,
      observedTopLevelFields:availabilityKeys,
    },
    rawPreserved:true,
  };
}

export function buildBokunDomain(product = {}, availability = [], { vendorId = null, pickupPlaces = [] } = {}) {
  const productId = id(product.id);
  if (productId === null) throw new Error('Bókun product is missing id');

  const participantCategories = asArray(product.pricingCategories).map(participantCategory);
  const rates = asArray(product.rates).map(rateEntity);
  const productMediaPhotos = mediaPhotos(product);

  const schemaCoverage = coverage(product, availability);
  const providerExtensions = Object.fromEntries(
    schemaCoverage.product.unmappedTopLevelFields.map(key => [key, product[key]])
  );

  const domain = {
    schemaVersion:'lovetravel.bokun-domain.v1',
    source:'bokun',
    provider:{
      vendorId:id(vendorId ?? product.vendor?.id ?? product.actualVendor?.id),
      productId,
      externalId:text(product.externalId, 160),
    },
    experience:{
      id:String(productId),
      externalId:text(product.externalId, 160),
      title:text(product.title, 300),
      description:text(product.description, 6000),
      excerpt:text(product.excerpt, 3000),
      slug:text(product.slug, 240),
      published:product.published === undefined ? null : bool(product.published),
      category:text(product.activityType || product.productCategory, 120),
      location:{
        city:text(product.locationCode?.name || product.googlePlace?.city, 160),
        country:text(product.locationCode?.country || product.googlePlace?.country, 160),
        timeZone:text(product.timeZone, 80),
      },
      duration:{
        text:text(product.durationText, 120),
        type:text(product.durationType, 80),
        days:numeric(product.durationDays),
        hours:numeric(product.durationHours),
        minutes:numeric(product.durationMinutes),
        weeks:numeric(product.durationWeeks),
        raw:product.duration ?? null,
      },
      difficulty:text(product.difficultyLevel, 80),
      minAge:numeric(product.minAge),
      languages:{
        base:text(product.baseLanguage, 40),
        raw:asArray(product.languages),
        guidanceTypes:asArray(product.guidanceTypes),
      },
      content:{
        included:product.included ?? null,
        inclusions:asArray(product.inclusions),
        excluded:product.excluded ?? null,
        exclusions:asArray(product.exclusions),
        requirements:product.requirements ?? null,
        attention:product.attention ?? null,
        dressCode:product.dressCode ?? null,
        knowBeforeYouGoItems:asArray(product.knowBeforeYouGoItems),
      },
      itinerary:asArray(product.agendaItems).map((item,index) => ({
        id:id(item.id),
        index,
        title:text(item.title, 300),
        body:text(item.body, 5000),
        providerData:item,
      })),
      media:{
        photos:productMediaPhotos,
        videos:asArray(product.videos).map(videoEntity),
      },
      booking:{
        type:text(product.bookingType,100),
        capacityType:text(product.capacityType,100),
        scheduleType:text(product.scheduleType,100),
        passesAvailable:numeric(product.passesAvailable),
        passCapacity:numeric(product.passCapacity),
        passExpiryType:text(product.passExpiryType,100),
        passValidForDays:numeric(product.passValidForDays),
        fixedPassExpiryDate:product.fixedPassExpiryDate ?? null,
      },
      ticket:{
        perPerson:product.ticketPerPerson === undefined ? null : bool(product.ticketPerPerson),
        message:text(product.ticketMsg,3000),
        barcodeType:text(product.barcodeType,100),
      },
      meeting:{
        type:text(product.meetingType, 100),
        startPoints:asArray(product.startPoints).map(point),
      },
      pickup:{
        enabled:bool(product.pickupService),
        placeGroups:asArray(product.pickupPlaceGroups).map(genericProviderEntity),
        places:pickupPlaceArray(pickupPlaces).map(pickupPlace),
        flags:asArray(product.pickupFlags),
        minutesBefore:numeric(product.pickupMinutesBefore),
        timeByLocations:product.pickupTimeByLocations ?? null,
        timeLocationBased:product.pickupTimeLocationBased ?? null,
        timeWindowMinutes:numeric(product.pickupTimeWindowInMinutes),
        allotment:product.pickupAllotment ?? null,
        allotmentType:text(product.pickupAllotmentType, 100),
        customAllowed:product.customPickupAllowed === undefined ? null : bool(product.customPickupAllowed),
        showGlobalMessage:product.showGlobalPickupMsg === undefined ? null : bool(product.showGlobalPickupMsg),
        showNoPickupMessage:product.showNoPickupMsg === undefined ? null : bool(product.showNoPickupMsg),
        noPickupMessage:text(product.noPickupMsg, 3000),
      },
      dropoff:{
        enabled:bool(product.dropoffService),
        placeGroups:asArray(product.dropoffPlaceGroups).map(genericProviderEntity),
        places:dropoffPlaceArray(pickupPlaces).map(pickupPlace),
        flags:asArray(product.dropoffFlags),
        customAllowed:product.customDropoffAllowed === undefined ? null : bool(product.customDropoffAllowed),
        useSameAsPickup:product.useSameAsPickUpPlaces === undefined ? null : bool(product.useSameAsPickUpPlaces),
      },
      accessibility:asArray(product.supportedAccessibilityTypes),
      passportRequired:product.passportRequired === undefined ? null : bool(product.passportRequired),
      reviews:{
        count:numeric(product.reviewCount),
        rating:numeric(product.reviewRating),
        tripadvisor:product.tripadvisorReview ?? null,
      },
      paymentCurrencies:asArray(product.paymentCurrencies),
    },
    participants:participantCategories,
    rates,
    extras:asArray(product.bookableExtras).map(extraEntity),
    offers:asArray(product.offers).map(genericProviderEntity),
    bookingRequirements:{
      questions:asArray(product.bookingQuestions).map(questionEntity),
      requiredCustomerFields:asArray(product.requiredCustomerFields),
      mainContactFields:asArray(product.mainContactFields),
      passengerFields:asArray(product.passengerFields),
      customFields:asArray(product.customFields).map(genericProviderEntity),
      labels:asArray(product.bookingLabels),
      allowCustomizedBookings:product.allowCustomizedBookings === undefined ? null : bool(product.allowCustomizedBookings),
      bookingType:text(product.bookingType, 100),
      cutoff:{
        raw:product.bookingCutoff ?? null,
        days:numeric(product.bookingCutoffDays),
        hours:numeric(product.bookingCutoffHours),
        minutes:numeric(product.bookingCutoffMinutes),
        weeks:numeric(product.bookingCutoffWeeks),
        referenceHour:numeric(product.cutoffReferenceHour),
        referenceMinute:numeric(product.cutoffReferenceMinute),
        type:text(product.cutoffType, 100),
      },
      requestDeadline:{
        raw:product.requestDeadline ?? null,
        days:numeric(product.requestDeadlineDays),
        hours:numeric(product.requestDeadlineHours),
        minutes:numeric(product.requestDeadlineMinutes),
        weeks:numeric(product.requestDeadlineWeeks),
      },
      reservationTimeout:numeric(product.reservationTimeout),
      vendorReservationTimeout:numeric(product.vendorReservationTimeout),
    },
    cancellationPolicy:cancellationPolicy(product.cancellationPolicy),
    availabilitySlots:asArray(availability).map(availabilitySlot),
    providerExtensions,
    providerRaw:{
      product,
      availability:asArray(availability),
      pickupPlaces,
    },
    coverage:schemaCoverage,
  };

  return domain;
}

export function quoteMatrix(domain = {}) {
  return asArray(domain.availabilitySlots).flatMap(slot =>
    asArray(slot.priceQuotesByRate).flatMap(rate =>
      asArray(rate.participantPrices).map(price => ({
        slotId:slot.id,
        date:slot.date,
        startTime:slot.startTime,
        rateId:rate.rateId,
        participantCategoryId:price.categoryId,
        amount:price.amount,
        minParticipantsRequired:price.minParticipantsRequired,
        maxParticipantsRequired:price.maxParticipantsRequired,
      }))
    )
  );
}

export const _domainTest = {
  inferIsoDate,
  cancellationPolicy,
  rateEntity,
  availabilitySlot,
  coverage,
  pickupPlaceArray,
  dropoffPlaceArray,
  pickupPlace,
};
