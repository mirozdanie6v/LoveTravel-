import { CONTRACT_SCHEMA_VERSIONS, validateTransactionCommand } from './travel-commerce-contracts.js';
import { stableJson, sha256Hex } from './travel-commerce-quote.js';

const str=value=>String(value??'').trim();

export async function stableExternalBookingReference(transactionId){
  const id=str(transactionId);
  if(!id) throw new TypeError('transactionId is required');
  const hash=await sha256Hex({transactionId:id,namespace:'LOVE_TRAVEL_BOOKING_V1'});
  return `LT-TEST-CLIENT-${hash.slice(0,24).toUpperCase()}`;
}

export async function deterministicCommandIdentity({
  transactionId,
  expectedRevision,
  type,
  payload={},
}={}){
  const tx=str(transactionId);
  if(!tx) throw new TypeError('transactionId is required');
  if(!Number.isInteger(expectedRevision)||expectedRevision<1) throw new TypeError('expectedRevision must be an integer >= 1');
  const normalizedPayload=structuredClone(payload||{});
  if(type==='RESERVE_BOOKING'){
    normalizedPayload.externalBookingReference=await stableExternalBookingReference(tx);
  }
  const material={
    transactionId:tx,
    expectedRevision,
    type:str(type),
    payload:normalizedPayload,
  };
  const digest=await sha256Hex(stableJson(material));
  return {
    commandId:`cmd-${digest.slice(0,24)}`,
    idempotencyKey:`idem-${digest}`,
    payload:normalizedPayload,
  };
}

export async function createDeterministicTransactionCommand({
  transactionId,
  expectedRevision,
  type,
  payload={},
  issuedAt=new Date(),
}={}){
  const identity=await deterministicCommandIdentity({transactionId,expectedRevision,type,payload});
  const at=issuedAt instanceof Date?issuedAt:new Date(issuedAt);
  if(Number.isNaN(at.getTime())) throw new TypeError('issuedAt must be a valid date');
  return validateTransactionCommand({
    schemaVersion:CONTRACT_SCHEMA_VERSIONS.TransactionCommand,
    commandId:identity.commandId,
    transactionId:str(transactionId),
    expectedRevision,
    idempotencyKey:identity.idempotencyKey,
    type:str(type),
    issuedAt:at.toISOString(),
    payload:identity.payload,
  });
}
