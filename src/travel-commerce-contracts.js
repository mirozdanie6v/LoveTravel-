/**
 * VIIVERSION Travel Commerce canonical contracts v1.
 *
 * Provider-neutral by design. Bókun-specific identifiers may appear only
 * inside opaque providerRef objects and must never drive AI/UI semantics.
 */

export const CONTRACT_SCHEMA_VERSIONS = Object.freeze({
  TravelIntent: 'viiversion.travel-intent.v1',
  Product: 'viiversion.travel-product.v1',
  Offer: 'viiversion.travel-offer.v1',
  Quote: 'viiversion.travel-quote.v1',
  BookingDraft: 'viiversion.booking-draft.v1',
  ShoppingSession: 'viiversion.shopping-session.v1',
  BookingTransaction: 'viiversion.booking-transaction.v1',
  ProviderEvidence: 'viiversion.provider-evidence.v1',
  TransactionCommand: 'viiversion.transaction-command.v1',
  CommandReceipt: 'viiversion.command-receipt.v1',
});

export const SUPPORTED_LOCALES = Object.freeze(['ru', 'en', 'vi', 'zh', 'ko']);
export const PARTICIPANT_ROLES = Object.freeze(['ADULT', 'CHILD', 'INFANT']);
export const PICKUP_MODES = Object.freeze(['UNKNOWN', 'PICKUP', 'MEET_ON_LOCATION']);
export const DROPOFF_MODES = Object.freeze(['UNKNOWN', 'DROPOFF', 'NO_DROPOFF']);
export const SHOPPING_SESSION_STATES = Object.freeze(['ACTIVE', 'COMPLETED', 'ABANDONED']);
export const QUOTE_STATES = Object.freeze(['ACTIVE', 'STALE', 'EXPIRED']);
export const BOOKING_TRANSACTION_STATES = Object.freeze([
  'SHOPPING',
  'OFFER_SELECTED',
  'QUOTED',
  'COLLECTING_REQUIRED_DATA',
  'READY_FOR_APPROVAL',
  'USER_APPROVED',
  'RESERVING',
  'CONFIRMED',
  'FAILED_NEEDS_RECONCILIATION',
  'ABANDONED',
]);
export const TRANSACTION_COMMAND_TYPES = Object.freeze([
  'SELECT_OFFER',
  'SET_INTENT',
  'SET_DRAFT',
  'REFRESH_QUOTE',
  'APPROVE_QUOTE',
  'RESERVE_BOOKING',
  'RECONCILE_BOOKING',
  'ABANDON_TRANSACTION',
]);
export const COMMAND_RECEIPT_STATES = Object.freeze([
  'APPLIED',
  'REPLAYED',
  'REJECTED',
  'FAILED',
  'NEEDS_RECONCILIATION',
]);

const TOP_LEVEL_KEYS = Object.freeze({
  TravelIntent: [
    'schemaVersion', 'locale', 'origin', 'destination', 'dateConstraint', 'party',
    'preferences', 'budget', 'hotel', 'pickupPreference', 'accessibility',
    'specialRequests', 'freeTextNotes',
  ],
  Product: [
    'schemaVersion', 'productId', 'providerRef', 'title', 'summary', 'location',
    'semanticTags', 'capabilities', 'evidenceRefs',
  ],
  Offer: [
    'schemaVersion', 'offerId', 'productId', 'providerRef', 'rateRef', 'startTimeRef',
    'date', 'participantMix', 'pickup', 'dropoff', 'price', 'availability',
    'restrictionCodes', 'evidenceRefs', 'generatedAt',
  ],
  Quote: [
    'schemaVersion', 'quoteId', 'transactionId', 'revision', 'offerId', 'offer', 'providerRef',
    'selectionFingerprint', 'price', 'availabilityStatus', 'requiredFieldCodes',
    'providerEvidenceRefs', 'freshness', 'issues', 'createdAt', 'refreshedAt', 'expiresAt',
    'status', 'readyToBook',
  ],
  BookingDraft: [
    'schemaVersion', 'quoteId', 'quoteRevision', 'customer', 'travellers', 'pickup',
    'dropoff', 'answers', 'extras', 'paymentChoice', 'specialRequests',
  ],
  ShoppingSession: [
    'schemaVersion', 'sessionId', 'revision', 'intent', 'candidateOfferIds',
    'selectedOfferId', 'status', 'createdAt', 'updatedAt',
  ],
  BookingTransaction: [
    'schemaVersion', 'transactionId', 'revision', 'shoppingSessionId', 'state',
    'selection', 'selectedOfferId', 'quote', 'draft', 'approval', 'mutation', 'providerBooking',
    'createdAt', 'updatedAt',
  ],
  ProviderEvidence: [
    'schemaVersion', 'evidenceId', 'providerRef', 'factType', 'fieldPath',
    'retrievedAt', 'sourceRevision', 'valueHash', 'value', 'transactionId', 'quoteId',
  ],
  TransactionCommand: [
    'schemaVersion', 'commandId', 'transactionId', 'expectedRevision', 'idempotencyKey',
    'type', 'issuedAt', 'payload',
  ],
  CommandReceipt: [
    'schemaVersion', 'commandId', 'transactionId', 'revisionBefore', 'revisionAfter',
    'status', 'providerEvidenceRefs', 'providerResultRef', 'errorCode', 'createdAt',
  ],
});

export const TRAVEL_COMMERCE_SCHEMAS = Object.freeze(
  Object.fromEntries(Object.entries(TOP_LEVEL_KEYS).map(([name, allowedKeys]) => [
    name,
    Object.freeze({
      name,
      schemaVersion: CONTRACT_SCHEMA_VERSIONS[name],
      allowedKeys: Object.freeze([...allowedKeys]),
    }),
  ])),
);

export class ContractError extends Error {
  constructor(contract, issues) {
    const normalized = Array.isArray(issues) ? issues : [{ code: 'invalid_contract', path: '', message: String(issues) }];
    super(`${contract} contract invalid: ${normalized.map(item => `${item.path || '<root>'}: ${item.message}`).join('; ')}`);
    this.name = 'ContractError';
    this.contract = contract;
    this.issues = normalized;
  }
}

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isInteger = value => Number.isInteger(value);
const isIsoDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
const isIsoInstant = value => typeof value === 'string' && !Number.isNaN(Date.parse(value));
const isSafeId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value);
const isSemanticCode = value => typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(value);
const isHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);

function issue(issues, code, path, message) {
  issues.push({ code, path, message });
}

function exactObject(value, path, allowed, issues) {
  if (!isObject(value)) {
    issue(issues, 'object_required', path, 'must be an object');
    return false;
  }
  const unknown = Object.keys(value).filter(key => !allowed.includes(key));
  if (unknown.length) issue(issues, 'unknown_field', path, `unknown fields: ${unknown.join(', ')}`);
  return true;
}

function requiredString(value, path, issues, { safe = false } = {}) {
  if (typeof value !== 'string' || !value.trim()) {
    issue(issues, 'string_required', path, 'must be a non-empty string');
    return;
  }
  if (safe && !isSafeId(value)) issue(issues, 'invalid_identifier', path, 'must be a safe identifier');
}

function optionalString(value, path, issues) {
  if (value !== undefined && value !== null && typeof value !== 'string') issue(issues, 'invalid_string', path, 'must be a string');
}

function requiredSchemaVersion(value, contract, issues) {
  const expected = CONTRACT_SCHEMA_VERSIONS[contract];
  if (value !== expected) issue(issues, 'schema_version_mismatch', 'schemaVersion', `must equal ${expected}`);
}

function requiredRevision(value, path, issues) {
  if (!isInteger(value) || value < 1) issue(issues, 'invalid_revision', path, 'must be an integer >= 1');
}

function requiredInstant(value, path, issues) {
  if (!isIsoInstant(value)) issue(issues, 'invalid_timestamp', path, 'must be an ISO-8601 timestamp');
}

function validateProviderRef(value, path, issues) {
  const keys = ['provider', 'resourceType', 'externalId', 'accountRef'];
  if (!exactObject(value, path, keys, issues)) return;
  requiredString(value.provider, `${path}.provider`, issues, { safe: true });
  requiredString(value.resourceType, `${path}.resourceType`, issues, { safe: true });
  requiredString(value.externalId, `${path}.externalId`, issues);
  optionalString(value.accountRef, `${path}.accountRef`, issues);
}

function validateMoney(value, path, issues) {
  if (!exactObject(value, path, ['amount', 'currency'], issues)) return;
  if (!Number.isFinite(Number(value.amount)) || Number(value.amount) < 0) issue(issues, 'invalid_amount', `${path}.amount`, 'must be a finite number >= 0');
  if (typeof value.currency !== 'string' || !/^[A-Z]{3}$/.test(value.currency)) issue(issues, 'invalid_currency', `${path}.currency`, 'must be an ISO-style 3-letter uppercase currency code');
}

function validateProviderRefArray(value, path, issues) {
  if (!Array.isArray(value)) {
    issue(issues, 'array_required', path, 'must be an array');
    return;
  }
  value.forEach((item, index) => validateProviderRef(item, `${path}.${index}`, issues));
}

function validateStringArray(value, path, issues, { semantic = false } = {}) {
  if (!Array.isArray(value)) {
    issue(issues, 'array_required', path, 'must be an array');
    return;
  }
  value.forEach((item, index) => {
    if (typeof item !== 'string' || !item.trim()) issue(issues, 'invalid_string', `${path}.${index}`, 'must be a non-empty string');
    else if (semantic && !isSemanticCode(item)) issue(issues, 'invalid_semantic_code', `${path}.${index}`, 'must be a language-neutral semantic code');
  });
}

function validateAnswers(value, path, issues) {
  if (!isObject(value)) {
    issue(issues, 'object_required', path, 'must be an object');
    return;
  }
  for (const [key, raw] of Object.entries(value)) {
    if (!isSafeId(key)) issue(issues, 'invalid_answer_key', `${path}.${key}`, 'answer key must be a safe provider-neutral/provider question identifier');
    const values = Array.isArray(raw) ? raw : [raw];
    if (!values.every(item => ['string', 'number', 'boolean'].includes(typeof item) || item === null)) {
      issue(issues, 'invalid_answer_value', `${path}.${key}`, 'answer values must be scalar JSON values or arrays of scalar values');
    }
  }
}

function validateDateConstraint(value, path, issues) {
  if (!exactObject(value, path, ['kind', 'exact', 'from', 'to'], issues)) return;
  if (!['EXACT', 'RANGE', 'FLEXIBLE'].includes(value.kind)) issue(issues, 'invalid_date_kind', `${path}.kind`, 'must be EXACT, RANGE or FLEXIBLE');
  if (value.kind === 'EXACT') {
    if (!isIsoDate(value.exact)) issue(issues, 'invalid_date', `${path}.exact`, 'EXACT requires YYYY-MM-DD');
    if (own(value, 'from') || own(value, 'to')) issue(issues, 'incompatible_fields', path, 'EXACT cannot include from/to');
  }
  if (value.kind === 'RANGE') {
    if (!isIsoDate(value.from) || !isIsoDate(value.to)) issue(issues, 'invalid_date_range', path, 'RANGE requires from/to YYYY-MM-DD');
    else if (value.from > value.to) issue(issues, 'invalid_date_range', path, 'from must not be after to');
    if (own(value, 'exact')) issue(issues, 'incompatible_fields', path, 'RANGE cannot include exact');
  }
  if (value.kind === 'FLEXIBLE' && (own(value, 'exact') || own(value, 'from') || own(value, 'to'))) {
    issue(issues, 'incompatible_fields', path, 'FLEXIBLE cannot include exact/from/to');
  }
}

function validateParty(value, path, issues) {
  if (!exactObject(value, path, ['adults', 'children', 'infants'], issues)) return;
  for (const key of ['adults', 'infants']) {
    if (!isInteger(value[key]) || value[key] < 0 || value[key] > 50) issue(issues, 'invalid_party_count', `${path}.${key}`, 'must be an integer between 0 and 50');
  }
  if (!Array.isArray(value.children)) issue(issues, 'array_required', `${path}.children`, 'must be an array');
  else value.children.forEach((child, index) => {
    if (!exactObject(child, `${path}.children.${index}`, ['age'], issues)) return;
    if (!isInteger(child.age) || child.age < 0 || child.age > 17) issue(issues, 'invalid_child_age', `${path}.children.${index}.age`, 'must be an integer between 0 and 17');
  });
}

function validatePreference(value, path, issues) {
  if (!exactObject(value, path, ['code', 'weight'], issues)) return;
  if (!isSemanticCode(value.code)) issue(issues, 'invalid_semantic_code', `${path}.code`, 'must be a language-neutral semantic code');
  if (value.weight !== undefined && (!Number.isFinite(Number(value.weight)) || Number(value.weight) < -1 || Number(value.weight) > 1)) {
    issue(issues, 'invalid_weight', `${path}.weight`, 'must be between -1 and 1');
  }
}

function validateTravelIntentInternal(value, path, issues) {
  if (!exactObject(value, path, TOP_LEVEL_KEYS.TravelIntent, issues)) return;
  requiredSchemaVersion(value.schemaVersion, 'TravelIntent', issues);
  if (!SUPPORTED_LOCALES.includes(value.locale)) issue(issues, 'unsupported_locale', `${path}locale`, `must be one of ${SUPPORTED_LOCALES.join(', ')}`);
  optionalString(value.origin, `${path}origin`, issues);
  optionalString(value.destination, `${path}destination`, issues);
  if (value.dateConstraint !== undefined) validateDateConstraint(value.dateConstraint, `${path}dateConstraint`, issues);
  if (value.party !== undefined) validateParty(value.party, `${path}party`, issues);
  if (value.preferences !== undefined) {
    if (!Array.isArray(value.preferences)) issue(issues, 'array_required', `${path}preferences`, 'must be an array');
    else value.preferences.forEach((item, index) => validatePreference(item, `${path}preferences.${index}`, issues));
  }
  if (value.budget !== undefined) validateMoney(value.budget, `${path}budget`, issues);
  optionalString(value.hotel, `${path}hotel`, issues);
  if (value.pickupPreference !== undefined && !PICKUP_MODES.includes(value.pickupPreference)) issue(issues, 'invalid_pickup_preference', `${path}pickupPreference`, 'must be a semantic pickup mode');
  if (value.accessibility !== undefined) validateStringArray(value.accessibility, `${path}accessibility`, issues, { semantic: true });
  if (value.specialRequests !== undefined) validateStringArray(value.specialRequests, `${path}specialRequests`, issues);
  optionalString(value.freeTextNotes, `${path}freeTextNotes`, issues);
}

function validateLocation(value, path, issues) {
  if (!exactObject(value, path, ['countryCode', 'cityCode', 'timeZone'], issues)) return;
  if (value.countryCode !== undefined && (typeof value.countryCode !== 'string' || !/^[A-Z]{2}$/.test(value.countryCode))) issue(issues, 'invalid_country_code', `${path}.countryCode`, 'must be 2 uppercase letters');
  optionalString(value.cityCode, `${path}.cityCode`, issues);
  optionalString(value.timeZone, `${path}.timeZone`, issues);
}

function validateParticipantMix(value, path, issues) {
  if (!Array.isArray(value) || value.length === 0) {
    issue(issues, 'participant_mix_required', path, 'must be a non-empty array');
    return;
  }
  value.forEach((item, index) => {
    const itemPath = `${path}.${index}`;
    if (!exactObject(item, itemPath, ['role', 'count', 'providerCategoryRef'], issues)) return;
    if (!PARTICIPANT_ROLES.includes(item.role)) issue(issues, 'invalid_participant_role', `${itemPath}.role`, 'must be ADULT, CHILD or INFANT');
    if (!isInteger(item.count) || item.count < 1 || item.count > 50) issue(issues, 'invalid_participant_count', `${itemPath}.count`, 'must be an integer between 1 and 50');
    if (item.providerCategoryRef !== undefined) validateProviderRef(item.providerCategoryRef, `${itemPath}.providerCategoryRef`, issues);
  });
}

function validateTransportChoice(value, path, issues, modes) {
  if (!exactObject(value, path, ['mode', 'placeRef', 'customLocation'], issues)) return;
  if (!modes.includes(value.mode)) issue(issues, 'invalid_transport_mode', `${path}.mode`, `must be one of ${modes.join(', ')}`);
  if (value.placeRef !== undefined) validateProviderRef(value.placeRef, `${path}.placeRef`, issues);
  optionalString(value.customLocation, `${path}.customLocation`, issues);
  if (value.placeRef !== undefined && value.customLocation !== undefined) issue(issues, 'incompatible_fields', path, 'cannot include both placeRef and customLocation');
}

function validateSelectionParticipantMix(value, path, issues) {
  if (!Array.isArray(value)) {
    issue(issues, 'array_required', path, 'must be an array');
    return;
  }
  value.forEach((item, index) => {
    const itemPath = `${path}.${index}`;
    if (!exactObject(item, itemPath, ['role', 'count', 'providerCategoryRef'], issues)) return;
    if (!PARTICIPANT_ROLES.includes(item.role)) issue(issues, 'invalid_participant_role', `${itemPath}.role`, 'must be ADULT, CHILD or INFANT');
    if (!isInteger(item.count) || item.count < 1 || item.count > 50) issue(issues, 'invalid_participant_count', `${itemPath}.count`, 'must be an integer between 1 and 50');
    if (item.providerCategoryRef !== undefined) validateProviderRef(item.providerCategoryRef, `${itemPath}.providerCategoryRef`, issues);
  });
}

function validateBookingSelectionSnapshotInternal(value, path, issues) {
  const keys = [
    'productRef', 'date', 'rateRef', 'startTimeRef', 'slotRef', 'participants',
    'pickup', 'pickupRoomNumber', 'pickupAnswers', 'dropoff', 'customer',
    'travellers', 'answers', 'extras',
  ];
  if (!exactObject(value, path, keys, issues)) return;
  validateProviderRef(value.productRef, `${path}productRef`, issues);
  if (value.date !== undefined && value.date !== null && value.date !== '' && !isIsoDate(value.date)) issue(issues, 'invalid_date', `${path}date`, 'must be YYYY-MM-DD');
  if (value.rateRef !== undefined) validateProviderRef(value.rateRef, `${path}rateRef`, issues);
  if (value.startTimeRef !== undefined) validateProviderRef(value.startTimeRef, `${path}startTimeRef`, issues);
  if (value.slotRef !== undefined) validateProviderRef(value.slotRef, `${path}slotRef`, issues);
  validateSelectionParticipantMix(value.participants, `${path}participants`, issues);
  if (value.pickup !== undefined) validateTransportChoice(value.pickup, `${path}pickup`, issues, PICKUP_MODES);
  optionalString(value.pickupRoomNumber, `${path}pickupRoomNumber`, issues);
  if (value.pickupAnswers !== undefined) validateAnswers(value.pickupAnswers, `${path}pickupAnswers`, issues);
  if (value.dropoff !== undefined) validateTransportChoice(value.dropoff, `${path}dropoff`, issues, DROPOFF_MODES);
  if (value.customer !== undefined) validateCustomer(value.customer, `${path}customer`, issues);
  if (!Array.isArray(value.travellers)) issue(issues, 'array_required', `${path}travellers`, 'must be an array');
  else value.travellers.forEach((traveller, index) => validateTraveller(traveller, `${path}travellers.${index}`, issues));
  if (value.answers !== undefined) validateAnswers(value.answers, `${path}answers`, issues);
  if (value.extras !== undefined) {
    if (!Array.isArray(value.extras)) issue(issues, 'array_required', `${path}extras`, 'must be an array');
    else value.extras.forEach((extra, index) => validateExtraSelection(extra, `${path}extras.${index}`, issues));
  }
}

export function validateBookingSelectionSnapshot(value) {
  return assertValid('BookingSelectionSnapshot', value, validateBookingSelectionSnapshotInternal);
}

function validateAvailability(value, path, issues) {
  if (!exactObject(value, path, ['status', 'remaining'], issues)) return;
  if (!['AVAILABLE', 'SOLD_OUT', 'UNAVAILABLE', 'ON_REQUEST'].includes(value.status)) issue(issues, 'invalid_availability', `${path}.status`, 'invalid availability status');
  if (value.remaining !== undefined && (!isInteger(value.remaining) || value.remaining < 0)) issue(issues, 'invalid_remaining', `${path}.remaining`, 'must be an integer >= 0');
}

function validateCustomer(value, path, issues) {
  const keys = ['firstName', 'lastName', 'email', 'phoneNumber', 'nationality', 'dateOfBirth'];
  if (!exactObject(value, path, keys, issues)) return;
  keys.forEach(key => optionalString(value[key], `${path}.${key}`, issues));
  if (value.dateOfBirth !== undefined && value.dateOfBirth !== '' && !isIsoDate(value.dateOfBirth)) issue(issues, 'invalid_date', `${path}.dateOfBirth`, 'must be YYYY-MM-DD');
}

function validateExtraSelection(value, path, issues) {
  if (!exactObject(value, path, ['extraRef', 'quantity', 'answers'], issues)) return;
  validateProviderRef(value.extraRef, `${path}.extraRef`, issues);
  if (!isInteger(value.quantity) || value.quantity < 1) issue(issues, 'invalid_quantity', `${path}.quantity`, 'must be an integer >= 1');
  if (value.answers !== undefined) validateAnswers(value.answers, `${path}.answers`, issues);
}

function validateTraveller(value, path, issues) {
  const keys = ['participantRole', 'providerCategoryRef', 'firstName', 'lastName', 'dateOfBirth', 'passportId', 'nationality', 'answers', 'extras'];
  if (!exactObject(value, path, keys, issues)) return;
  if (!PARTICIPANT_ROLES.includes(value.participantRole)) issue(issues, 'invalid_participant_role', `${path}.participantRole`, 'must be ADULT, CHILD or INFANT');
  if (value.providerCategoryRef !== undefined) validateProviderRef(value.providerCategoryRef, `${path}.providerCategoryRef`, issues);
  for (const key of ['firstName', 'lastName', 'passportId', 'nationality']) optionalString(value[key], `${path}.${key}`, issues);
  if (value.dateOfBirth !== undefined && value.dateOfBirth !== '' && !isIsoDate(value.dateOfBirth)) issue(issues, 'invalid_date', `${path}.dateOfBirth`, 'must be YYYY-MM-DD');
  if (value.answers !== undefined) validateAnswers(value.answers, `${path}.answers`, issues);
  if (value.extras !== undefined) {
    if (!Array.isArray(value.extras)) issue(issues, 'array_required', `${path}.extras`, 'must be an array');
    else value.extras.forEach((extra, index) => validateExtraSelection(extra, `${path}.extras.${index}`, issues));
  }
}

function assertValid(contract, value, validator) {
  const issues = [];
  validator(value, '', issues);
  if (issues.length) throw new ContractError(contract, issues);
  return structuredClone(value);
}

export function validateTravelIntent(value) {
  return assertValid('TravelIntent', value, validateTravelIntentInternal);
}

export function validateProduct(value) {
  return assertValid('Product', value, (item, path, issues) => {
    if (!exactObject(item, path, TOP_LEVEL_KEYS.Product, issues)) return;
    requiredSchemaVersion(item.schemaVersion, 'Product', issues);
    requiredString(item.productId, 'productId', issues, { safe: true });
    validateProviderRef(item.providerRef, 'providerRef', issues);
    requiredString(item.title, 'title', issues);
    optionalString(item.summary, 'summary', issues);
    if (item.location !== undefined) validateLocation(item.location, 'location', issues);
    if (item.semanticTags !== undefined) validateStringArray(item.semanticTags, 'semanticTags', issues, { semantic: true });
    if (item.capabilities !== undefined) validateStringArray(item.capabilities, 'capabilities', issues, { semantic: true });
    if (item.evidenceRefs !== undefined) validateStringArray(item.evidenceRefs, 'evidenceRefs', issues);
  });
}

export function validateOffer(value) {
  return assertValid('Offer', value, (item, path, issues) => {
    if (!exactObject(item, path, TOP_LEVEL_KEYS.Offer, issues)) return;
    requiredSchemaVersion(item.schemaVersion, 'Offer', issues);
    requiredString(item.offerId, 'offerId', issues, { safe: true });
    requiredString(item.productId, 'productId', issues, { safe: true });
    validateProviderRef(item.providerRef, 'providerRef', issues);
    if (item.rateRef !== undefined) validateProviderRef(item.rateRef, 'rateRef', issues);
    if (item.startTimeRef !== undefined) validateProviderRef(item.startTimeRef, 'startTimeRef', issues);
    if (!isIsoDate(item.date)) issue(issues, 'invalid_date', 'date', 'must be YYYY-MM-DD');
    validateParticipantMix(item.participantMix, 'participantMix', issues);
    if (item.pickup !== undefined) validateTransportChoice(item.pickup, 'pickup', issues, PICKUP_MODES);
    if (item.dropoff !== undefined) validateTransportChoice(item.dropoff, 'dropoff', issues, DROPOFF_MODES);
    validateMoney(item.price, 'price', issues);
    validateAvailability(item.availability, 'availability', issues);
    if (item.restrictionCodes !== undefined) validateStringArray(item.restrictionCodes, 'restrictionCodes', issues, { semantic: true });
    validateStringArray(item.evidenceRefs, 'evidenceRefs', issues);
    requiredInstant(item.generatedAt, 'generatedAt', issues);
  });
}

function validateQuoteFreshness(value, path, issues) {
  if (!exactObject(value, path, ['policy', 'ttlMs'], issues)) return;
  if (value.policy !== 'REVALIDATE_BEFORE_MUTATION') {
    issue(issues, 'invalid_freshness_policy', `${path}.policy`, 'must equal REVALIDATE_BEFORE_MUTATION');
  }
  if (!isInteger(value.ttlMs) || value.ttlMs < 1 || value.ttlMs > 600000) {
    issue(issues, 'invalid_quote_ttl', `${path}.ttlMs`, 'must be an integer between 1 and 600000 milliseconds');
  }
}

function validateQuoteIssueArray(value, path, issues) {
  if (!Array.isArray(value)) {
    issue(issues, 'array_required', path, 'must be an array');
    return;
  }
  value.forEach((entry, index) => {
    const entryPath = `${path}.${index}`;
    if (!exactObject(entry, entryPath, ['code', 'path', 'message', 'details'], issues)) return;
    requiredString(entry.code, `${entryPath}.code`, issues);
    optionalString(entry.path, `${entryPath}.path`, issues);
    requiredString(entry.message, `${entryPath}.message`, issues);
    if (entry.details !== undefined && !jsonSafe(entry.details)) {
      issue(issues, 'invalid_issue_details', `${entryPath}.details`, 'must be JSON-safe');
    }
  });
}

function validateQuoteIssues(value, path, issues) {
  if (!exactObject(value, path, ['errors', 'warnings', 'bookingDataIssues'], issues)) return;
  validateQuoteIssueArray(value.errors, `${path}.errors`, issues);
  validateQuoteIssueArray(value.warnings, `${path}.warnings`, issues);
  validateQuoteIssueArray(value.bookingDataIssues, `${path}.bookingDataIssues`, issues);
}

export function validateQuote(value) {
  return assertValid('Quote', value, (item, path, issues) => {
    if (!exactObject(item, path, TOP_LEVEL_KEYS.Quote, issues)) return;
    requiredSchemaVersion(item.schemaVersion, 'Quote', issues);
    requiredString(item.quoteId, 'quoteId', issues, { safe: true });
    requiredString(item.transactionId, 'transactionId', issues, { safe: true });
    requiredRevision(item.revision, 'revision', issues);
    requiredString(item.offerId, 'offerId', issues, { safe: true });
    if (item.offer === undefined) {
      issue(issues, 'offer_required', 'offer', 'first-class Quote requires the resolved canonical Offer');
    } else {
      try { validateOffer(item.offer); }
      catch (error) {
        if (error instanceof ContractError) error.issues.forEach(entry => issue(issues, entry.code, `offer.${entry.path}`, entry.message));
        else throw error;
      }
      if (item.offer?.offerId !== item.offerId) issue(issues, 'quote_offer_id_mismatch', 'offer.offerId', 'must match offerId');
    }
    validateProviderRef(item.providerRef, 'providerRef', issues);
    if (item.offer?.providerRef && JSON.stringify(item.offer.providerRef) !== JSON.stringify(item.providerRef)) {
      issue(issues, 'quote_provider_mismatch', 'providerRef', 'must match Offer providerRef');
    }
    if (!isHash(item.selectionFingerprint)) issue(issues, 'invalid_hash', 'selectionFingerprint', 'must be a SHA-256 hex digest');
    validateMoney(item.price, 'price', issues);
    if (item.offer?.price && (Number(item.offer.price.amount) !== Number(item.price?.amount) || item.offer.price.currency !== item.price?.currency)) {
      issue(issues, 'quote_price_mismatch', 'price', 'must exactly match the resolved Offer price');
    }
    if (!['AVAILABLE', 'SOLD_OUT', 'UNAVAILABLE', 'ON_REQUEST'].includes(item.availabilityStatus)) issue(issues, 'invalid_availability', 'availabilityStatus', 'invalid availability status');
    if (item.offer?.availability?.status && item.offer.availability.status !== item.availabilityStatus) {
      issue(issues, 'quote_availability_mismatch', 'availabilityStatus', 'must match the resolved Offer availability');
    }
    validateStringArray(item.requiredFieldCodes, 'requiredFieldCodes', issues, { semantic: true });
    validateStringArray(item.providerEvidenceRefs, 'providerEvidenceRefs', issues);
    if (Array.isArray(item.providerEvidenceRefs) && item.providerEvidenceRefs.length < 1) {
      issue(issues, 'provider_evidence_required', 'providerEvidenceRefs', 'first-class Quote requires provider evidence');
    }
    validateQuoteFreshness(item.freshness, 'freshness', issues);
    validateQuoteIssues(item.issues, 'issues', issues);
    requiredInstant(item.createdAt, 'createdAt', issues);
    requiredInstant(item.refreshedAt, 'refreshedAt', issues);
    if (item.expiresAt !== undefined && item.expiresAt !== null) requiredInstant(item.expiresAt, 'expiresAt', issues);
    if (!QUOTE_STATES.includes(item.status)) issue(issues, 'invalid_quote_status', 'status', `must be one of ${QUOTE_STATES.join(', ')}`);
    if (typeof item.readyToBook !== 'boolean') issue(issues, 'boolean_required', 'readyToBook', 'must be boolean');
    if (item.status !== 'ACTIVE' && item.readyToBook === true) issue(issues, 'stale_quote_ready', 'readyToBook', 'non-active Quote cannot be readyToBook');
    if (item.readyToBook === true && item.availabilityStatus !== 'AVAILABLE') issue(issues, 'unavailable_quote_ready', 'availabilityStatus', 'readyToBook Quote must be AVAILABLE');
    if (isIsoInstant(item.createdAt) && isIsoInstant(item.refreshedAt) && Date.parse(item.refreshedAt) < Date.parse(item.createdAt)) issue(issues, 'invalid_quote_time', 'refreshedAt', 'cannot be before createdAt');
    if (isIsoInstant(item.refreshedAt) && isIsoInstant(item.expiresAt) && Date.parse(item.expiresAt) <= Date.parse(item.refreshedAt)) {
      issue(issues, 'invalid_quote_expiry', 'expiresAt', 'must be after refreshedAt');
    }
  });
}

export function validateBookingDraft(value) {
  return assertValid('BookingDraft', value, (item, path, issues) => {
    if (!exactObject(item, path, TOP_LEVEL_KEYS.BookingDraft, issues)) return;
    requiredSchemaVersion(item.schemaVersion, 'BookingDraft', issues);
    requiredString(item.quoteId, 'quoteId', issues, { safe: true });
    requiredRevision(item.quoteRevision, 'quoteRevision', issues);
    if (item.customer !== undefined) validateCustomer(item.customer, 'customer', issues);
    if (!Array.isArray(item.travellers)) issue(issues, 'array_required', 'travellers', 'must be an array');
    else item.travellers.forEach((traveller, index) => validateTraveller(traveller, `travellers.${index}`, issues));
    if (item.pickup !== undefined) validateTransportChoice(item.pickup, 'pickup', issues, PICKUP_MODES);
    if (item.dropoff !== undefined) validateTransportChoice(item.dropoff, 'dropoff', issues, DROPOFF_MODES);
    if (item.answers !== undefined) validateAnswers(item.answers, 'answers', issues);
    if (item.extras !== undefined) {
      if (!Array.isArray(item.extras)) issue(issues, 'array_required', 'extras', 'must be an array');
      else item.extras.forEach((extra, index) => validateExtraSelection(extra, `extras.${index}`, issues));
    }
    optionalString(item.paymentChoice, 'paymentChoice', issues);
    if (item.specialRequests !== undefined) validateStringArray(item.specialRequests, 'specialRequests', issues);
  });
}

export function validateShoppingSession(value) {
  return assertValid('ShoppingSession', value, (item, path, issues) => {
    if (!exactObject(item, path, TOP_LEVEL_KEYS.ShoppingSession, issues)) return;
    requiredSchemaVersion(item.schemaVersion, 'ShoppingSession', issues);
    requiredString(item.sessionId, 'sessionId', issues, { safe: true });
    requiredRevision(item.revision, 'revision', issues);
    validateTravelIntentInternal(item.intent, 'intent.', issues);
    validateStringArray(item.candidateOfferIds, 'candidateOfferIds', issues);
    optionalString(item.selectedOfferId, 'selectedOfferId', issues);
    if (item.selectedOfferId && !item.candidateOfferIds.includes(item.selectedOfferId)) issue(issues, 'selected_offer_not_candidate', 'selectedOfferId', 'must reference a candidate offer');
    if (!SHOPPING_SESSION_STATES.includes(item.status)) issue(issues, 'invalid_session_status', 'status', `must be one of ${SHOPPING_SESSION_STATES.join(', ')}`);
    requiredInstant(item.createdAt, 'createdAt', issues);
    requiredInstant(item.updatedAt, 'updatedAt', issues);
    if (isIsoInstant(item.createdAt) && isIsoInstant(item.updatedAt) && Date.parse(item.updatedAt) < Date.parse(item.createdAt)) {
      issue(issues, 'invalid_session_time', 'updatedAt', 'cannot be before createdAt');
    }
  });
}

function validateApproval(value, path, issues) {
  if (!exactObject(value, path, ['approvalId', 'decision', 'quoteId', 'quoteRevision', 'approvedAt'], issues)) return;
  requiredString(value.approvalId, `${path}.approvalId`, issues, { safe: true });
  if (value.decision !== 'APPROVE') issue(issues, 'invalid_approval_decision', `${path}.decision`, 'must equal APPROVE');
  requiredString(value.quoteId, `${path}.quoteId`, issues, { safe: true });
  requiredRevision(value.quoteRevision, `${path}.quoteRevision`, issues);
  requiredInstant(value.approvedAt, `${path}.approvedAt`, issues);
}

function validateMutation(value, path, issues) {
  if (!exactObject(value, path, ['commandId', 'idempotencyKey', 'externalBookingReference', 'status', 'startedAt', 'completedAt'], issues)) return;
  requiredString(value.commandId, `${path}.commandId`, issues, { safe: true });
  requiredString(value.idempotencyKey, `${path}.idempotencyKey`, issues);
  requiredString(value.externalBookingReference, `${path}.externalBookingReference`, issues);
  if (!['PENDING', 'SUCCEEDED', 'FAILED', 'AMBIGUOUS'].includes(value.status)) issue(issues, 'invalid_mutation_status', `${path}.status`, 'invalid mutation status');
  requiredInstant(value.startedAt, `${path}.startedAt`, issues);
  if (value.completedAt !== undefined && value.completedAt !== null) requiredInstant(value.completedAt, `${path}.completedAt`, issues);
}

function validateProviderBooking(value, path, issues) {
  if (!exactObject(value, path, ['providerRef', 'confirmationCode', 'status', 'confirmedAt'], issues)) return;
  validateProviderRef(value.providerRef, `${path}.providerRef`, issues);
  optionalString(value.confirmationCode, `${path}.confirmationCode`, issues);
  if (!['RESERVED', 'CONFIRMED', 'CANCELLED', 'UNKNOWN'].includes(value.status)) issue(issues, 'invalid_provider_booking_status', `${path}.status`, 'invalid provider booking status');
  if (value.confirmedAt !== undefined && value.confirmedAt !== null) requiredInstant(value.confirmedAt, `${path}.confirmedAt`, issues);
}

function txStateAtLeastQuote(state) {
  return ['QUOTED', 'COLLECTING_REQUIRED_DATA', 'READY_FOR_APPROVAL', 'USER_APPROVED', 'RESERVING', 'CONFIRMED', 'FAILED_NEEDS_RECONCILIATION'].includes(state);
}

export function validateBookingTransaction(value) {
  return assertValid('BookingTransaction', value, (item, path, issues) => {
    if (!exactObject(item, path, TOP_LEVEL_KEYS.BookingTransaction, issues)) return;
    requiredSchemaVersion(item.schemaVersion, 'BookingTransaction', issues);
    requiredString(item.transactionId, 'transactionId', issues, { safe: true });
    requiredRevision(item.revision, 'revision', issues);
    optionalString(item.shoppingSessionId, 'shoppingSessionId', issues);
    if (item.selection !== undefined) {
      try { validateBookingSelectionSnapshot(item.selection); }
      catch (error) { if (error instanceof ContractError) error.issues.forEach(entry => issue(issues, entry.code, `selection.${entry.path}`, entry.message)); else throw error; }
    }
    if (!BOOKING_TRANSACTION_STATES.includes(item.state)) issue(issues, 'invalid_transaction_state', 'state', `must be one of ${BOOKING_TRANSACTION_STATES.join(', ')}`);
    optionalString(item.selectedOfferId, 'selectedOfferId', issues);
    if (!['SHOPPING', 'ABANDONED'].includes(item.state) && !item.selectedOfferId) issue(issues, 'selected_offer_required', 'selectedOfferId', `${item.state} requires selectedOfferId`);

    if (item.quote !== undefined) {
      try { validateQuote(item.quote); }
      catch (error) { if (error instanceof ContractError) error.issues.forEach(entry => issue(issues, entry.code, `quote.${entry.path}`, entry.message)); else throw error; }
      if (item.quote?.transactionId !== item.transactionId) issue(issues, 'quote_transaction_mismatch', 'quote.transactionId', 'must match transactionId');
      if (item.selectedOfferId && item.quote?.offerId !== item.selectedOfferId) issue(issues, 'quote_offer_mismatch', 'quote.offerId', 'must match selectedOfferId');
      if (item.selection?.productRef && JSON.stringify(item.selection.productRef) !== JSON.stringify(item.quote?.offer?.providerRef)) issue(issues, 'selection_product_mismatch', 'selection.productRef', 'must match Quote Offer providerRef');
      if (item.selection?.date && item.quote?.offer?.date && item.selection.date !== item.quote.offer.date) issue(issues, 'selection_date_mismatch', 'selection.date', 'must match Quote Offer date');
      if (item.selection?.rateRef && item.quote?.offer?.rateRef && JSON.stringify(item.selection.rateRef) !== JSON.stringify(item.quote.offer.rateRef)) issue(issues, 'selection_rate_mismatch', 'selection.rateRef', 'must match Quote Offer rateRef');
      if (item.selection?.startTimeRef && item.quote?.offer?.startTimeRef && JSON.stringify(item.selection.startTimeRef) !== JSON.stringify(item.quote.offer.startTimeRef)) issue(issues, 'selection_start_time_mismatch', 'selection.startTimeRef', 'must match Quote Offer startTimeRef');
    } else if (txStateAtLeastQuote(item.state)) {
      issue(issues, 'quote_required', 'quote', `${item.state} requires a Quote`);
    }

    if (item.draft !== undefined) {
      try { validateBookingDraft(item.draft); }
      catch (error) { if (error instanceof ContractError) error.issues.forEach(entry => issue(issues, entry.code, `draft.${entry.path}`, entry.message)); else throw error; }
      if (item.quote && item.draft?.quoteId !== item.quote.quoteId) issue(issues, 'draft_quote_mismatch', 'draft.quoteId', 'must match current Quote');
      if (item.quote && item.draft?.quoteRevision !== item.quote.revision) issue(issues, 'draft_quote_revision_mismatch', 'draft.quoteRevision', 'must match current Quote revision');
    }

    if (['READY_FOR_APPROVAL', 'USER_APPROVED', 'RESERVING', 'CONFIRMED', 'FAILED_NEEDS_RECONCILIATION'].includes(item.state)) {
      if (!item.draft) issue(issues, 'draft_required', 'draft', `${item.state} requires BookingDraft`);
      if (item.quote?.status !== 'ACTIVE') issue(issues, 'active_quote_required', 'quote.status', `${item.state} requires an ACTIVE Quote`);
    }
    if (['READY_FOR_APPROVAL', 'USER_APPROVED', 'RESERVING', 'CONFIRMED', 'FAILED_NEEDS_RECONCILIATION'].includes(item.state) && item.quote?.readyToBook !== true) {
      issue(issues, 'quote_not_ready', 'quote.readyToBook', `${item.state} requires readyToBook=true`);
    }

    if (item.approval !== undefined) validateApproval(item.approval, 'approval', issues);
    if (['USER_APPROVED', 'RESERVING', 'CONFIRMED', 'FAILED_NEEDS_RECONCILIATION'].includes(item.state)) {
      if (!item.approval) issue(issues, 'approval_required', 'approval', `${item.state} requires explicit customer approval`);
      else if (item.quote && (item.approval.quoteId !== item.quote.quoteId || item.approval.quoteRevision !== item.quote.revision)) {
        issue(issues, 'stale_approval', 'approval', 'approval must target the current Quote revision');
      }
    }

    if (item.mutation !== undefined) validateMutation(item.mutation, 'mutation', issues);
    if (['RESERVING', 'CONFIRMED', 'FAILED_NEEDS_RECONCILIATION'].includes(item.state) && !item.mutation) issue(issues, 'mutation_required', 'mutation', `${item.state} requires mutation state`);
    if (item.state === 'RESERVING' && item.mutation?.status !== 'PENDING') issue(issues, 'pending_mutation_required', 'mutation.status', 'RESERVING requires PENDING mutation');
    if (item.state === 'FAILED_NEEDS_RECONCILIATION' && item.mutation?.status !== 'AMBIGUOUS') issue(issues, 'ambiguous_mutation_required', 'mutation.status', 'FAILED_NEEDS_RECONCILIATION requires AMBIGUOUS mutation');

    if (item.providerBooking !== undefined) validateProviderBooking(item.providerBooking, 'providerBooking', issues);
    if (item.state === 'CONFIRMED') {
      if (!item.providerBooking) issue(issues, 'provider_booking_required', 'providerBooking', 'CONFIRMED requires provider booking evidence');
      else {
        if (!['RESERVED', 'CONFIRMED'].includes(item.providerBooking.status)) issue(issues, 'provider_booking_not_confirmed', 'providerBooking.status', 'must be RESERVED or CONFIRMED');
        if (!item.providerBooking.confirmationCode) issue(issues, 'confirmation_code_required', 'providerBooking.confirmationCode', 'must be present before transaction is CONFIRMED');
      }
      if (item.mutation?.status !== 'SUCCEEDED') issue(issues, 'successful_mutation_required', 'mutation.status', 'CONFIRMED requires SUCCEEDED mutation');
    }

    requiredInstant(item.createdAt, 'createdAt', issues);
    requiredInstant(item.updatedAt, 'updatedAt', issues);
    if (isIsoInstant(item.createdAt) && isIsoInstant(item.updatedAt) && Date.parse(item.updatedAt) < Date.parse(item.createdAt)) issue(issues, 'invalid_transaction_time', 'updatedAt', 'cannot be before createdAt');
  });
}

function jsonSafe(value, depth = 0) {
  if (depth > 12) return false;
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return Number.isFinite(value) || typeof value !== 'number';
  if (Array.isArray(value)) return value.every(item => jsonSafe(item, depth + 1));
  if (isObject(value)) return Object.entries(value).every(([key, item]) => typeof key === 'string' && jsonSafe(item, depth + 1));
  return false;
}

export function validateProviderEvidence(value) {
  return assertValid('ProviderEvidence', value, (item, path, issues) => {
    if (!exactObject(item, path, TOP_LEVEL_KEYS.ProviderEvidence, issues)) return;
    requiredSchemaVersion(item.schemaVersion, 'ProviderEvidence', issues);
    requiredString(item.evidenceId, 'evidenceId', issues, { safe: true });
    validateProviderRef(item.providerRef, 'providerRef', issues);
    if (!isSemanticCode(item.factType)) issue(issues, 'invalid_fact_type', 'factType', 'must be a language-neutral semantic fact code');
    requiredString(item.fieldPath, 'fieldPath', issues);
    requiredInstant(item.retrievedAt, 'retrievedAt', issues);
    optionalString(item.sourceRevision, 'sourceRevision', issues);
    if (!isHash(item.valueHash)) issue(issues, 'invalid_hash', 'valueHash', 'must be a SHA-256 hex digest');
    if (!jsonSafe(item.value)) issue(issues, 'invalid_evidence_value', 'value', 'must be JSON-safe');
    optionalString(item.transactionId, 'transactionId', issues);
    optionalString(item.quoteId, 'quoteId', issues);
  });
}

function validateCommandPayload(type, payload, issues) {
  const p = 'payload';
  if (!isObject(payload)) {
    issue(issues, 'object_required', p, 'must be an object');
    return;
  }
  const spec = {
    SELECT_OFFER: ['offerId'],
    SET_INTENT: ['intent'],
    SET_DRAFT: ['draft'],
    REFRESH_QUOTE: ['quoteId'],
    APPROVE_QUOTE: ['approvalId', 'quoteId', 'quoteRevision'],
    RESERVE_BOOKING: ['quoteId', 'quoteRevision', 'externalBookingReference'],
    RECONCILE_BOOKING: ['externalBookingReference'],
    ABANDON_TRANSACTION: ['reasonCode'],
  }[type];
  if (!spec) return;
  exactObject(payload, p, spec, issues);

  if (type === 'SELECT_OFFER') requiredString(payload.offerId, `${p}.offerId`, issues, { safe: true });
  if (type === 'SET_INTENT') {
    try { validateTravelIntent(payload.intent); }
    catch (error) { if (error instanceof ContractError) error.issues.forEach(entry => issue(issues, entry.code, `${p}.intent.${entry.path}`, entry.message)); else throw error; }
  }
  if (type === 'SET_DRAFT') {
    try { validateBookingDraft(payload.draft); }
    catch (error) { if (error instanceof ContractError) error.issues.forEach(entry => issue(issues, entry.code, `${p}.draft.${entry.path}`, entry.message)); else throw error; }
  }
  if (type === 'REFRESH_QUOTE') requiredString(payload.quoteId, `${p}.quoteId`, issues, { safe: true });
  if (type === 'APPROVE_QUOTE') {
    requiredString(payload.approvalId, `${p}.approvalId`, issues, { safe: true });
    requiredString(payload.quoteId, `${p}.quoteId`, issues, { safe: true });
    requiredRevision(payload.quoteRevision, `${p}.quoteRevision`, issues);
  }
  if (type === 'RESERVE_BOOKING') {
    requiredString(payload.quoteId, `${p}.quoteId`, issues, { safe: true });
    requiredRevision(payload.quoteRevision, `${p}.quoteRevision`, issues);
    requiredString(payload.externalBookingReference, `${p}.externalBookingReference`, issues);
  }
  if (type === 'RECONCILE_BOOKING') requiredString(payload.externalBookingReference, `${p}.externalBookingReference`, issues);
  if (type === 'ABANDON_TRANSACTION' && !isSemanticCode(payload.reasonCode)) issue(issues, 'invalid_reason_code', `${p}.reasonCode`, 'must be a language-neutral semantic code');
}

export function validateTransactionCommand(value) {
  return assertValid('TransactionCommand', value, (item, path, issues) => {
    if (!exactObject(item, path, TOP_LEVEL_KEYS.TransactionCommand, issues)) return;
    requiredSchemaVersion(item.schemaVersion, 'TransactionCommand', issues);
    requiredString(item.commandId, 'commandId', issues, { safe: true });
    requiredString(item.transactionId, 'transactionId', issues, { safe: true });
    requiredRevision(item.expectedRevision, 'expectedRevision', issues);
    requiredString(item.idempotencyKey, 'idempotencyKey', issues);
    if (!TRANSACTION_COMMAND_TYPES.includes(item.type)) issue(issues, 'invalid_command_type', 'type', `must be one of ${TRANSACTION_COMMAND_TYPES.join(', ')}`);
    requiredInstant(item.issuedAt, 'issuedAt', issues);
    validateCommandPayload(item.type, item.payload, issues);
  });
}

export function assertCommandRevision(command, transaction) {
  const validCommand = validateTransactionCommand(command);
  const validTransaction = validateBookingTransaction(transaction);
  if (validCommand.transactionId !== validTransaction.transactionId) {
    throw new ContractError('TransactionCommand', [{ code: 'transaction_mismatch', path: 'transactionId', message: 'command must target the supplied transaction' }]);
  }
  if (validCommand.expectedRevision !== validTransaction.revision) {
    throw new ContractError('TransactionCommand', [{
      code: 'stale_revision',
      path: 'expectedRevision',
      message: `expected revision ${validTransaction.revision}, received ${validCommand.expectedRevision}`,
    }]);
  }
  return { command: validCommand, transaction: validTransaction };
}

export function validateCommandReceipt(value) {
  return assertValid('CommandReceipt', value, (item, path, issues) => {
    if (!exactObject(item, path, TOP_LEVEL_KEYS.CommandReceipt, issues)) return;
    requiredSchemaVersion(item.schemaVersion, 'CommandReceipt', issues);
    requiredString(item.commandId, 'commandId', issues, { safe: true });
    requiredString(item.transactionId, 'transactionId', issues, { safe: true });
    requiredRevision(item.revisionBefore, 'revisionBefore', issues);
    requiredRevision(item.revisionAfter, 'revisionAfter', issues);
    if (!COMMAND_RECEIPT_STATES.includes(item.status)) issue(issues, 'invalid_receipt_status', 'status', `must be one of ${COMMAND_RECEIPT_STATES.join(', ')}`);
    if (item.revisionAfter < item.revisionBefore) issue(issues, 'revision_regression', 'revisionAfter', 'cannot be lower than revisionBefore');
    if (['REPLAYED', 'REJECTED', 'FAILED', 'NEEDS_RECONCILIATION'].includes(item.status) && item.revisionAfter !== item.revisionBefore) {
      issue(issues, 'unexpected_revision_change', 'revisionAfter', `${item.status} receipt must not advance the transaction revision`);
    }
    if (item.providerEvidenceRefs !== undefined) validateStringArray(item.providerEvidenceRefs, 'providerEvidenceRefs', issues);
    optionalString(item.providerResultRef, 'providerResultRef', issues);
    optionalString(item.errorCode, 'errorCode', issues);
    requiredInstant(item.createdAt, 'createdAt', issues);
  });
}

export function validateContract(name, value) {
  const validators = {
    TravelIntent: validateTravelIntent,
    Product: validateProduct,
    Offer: validateOffer,
    Quote: validateQuote,
    BookingDraft: validateBookingDraft,
    ShoppingSession: validateShoppingSession,
    BookingTransaction: validateBookingTransaction,
    ProviderEvidence: validateProviderEvidence,
    TransactionCommand: validateTransactionCommand,
    CommandReceipt: validateCommandReceipt,
  };
  const validator = validators[name];
  if (!validator) throw new TypeError(`Unknown Travel Commerce contract: ${name}`);
  return validator(value);
}
