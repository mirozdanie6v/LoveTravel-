import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomBytes,createCipheriv,publicEncrypt,createHash} from 'node:crypto';
const publicKey="-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuJ3ooD0V+acIodB+MQJH\nrnpxaVsL+ubEYvbJX7G97B/LB6vLmM6z5ejxnXGvX/ye8+7jP/JYQqB/JtzZa28X\nDm4ZoppuueGntg8S077xP6Li9smFR4s5RZuy0dNPwwxJQgLxn/uatC6oAn1l8RqA\nlXIFirzoHquYC7hjJdDS+1aYGJDJyQ1upzMyZoq7Sm/q8AeqJhalTorHYPtN2ZR1\nDuMxSEsv5Qa7XH1VB2WCIcuCk2yS/zasMEPlZbKqFrASJrhYgVTz8VgpTswXlraF\nSlqT2niAb5Oy002/8qsfdnwIbd73nf8Pq8WwtcZKhOSSi5l2bPxxg5oODWy+aVen\n2QIDAQAB\n-----END PUBLIC KEY-----\n";
const anchor="2026-10-09 22:36:26";
const sql="SELECT m.session_id,m.updated_at,m.memory_json,s.snapshot_json FROM ai_conversation_memory m LEFT JOIN travel_shopping_sessions s ON s.owner_session_id=m.session_id WHERE m.updated_at>=datetime('"+anchor+"','-1 hour') ORDER BY m.updated_at DESC LIMIT 30";
let result;
try{
 const output=execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','love-travel-v28-db','--remote','--json','--command',sql],{encoding:'utf8',maxBuffer:4*1024*1024,timeout:90000,stdio:['ignore','pipe','pipe']});
 result=JSON.parse(output);
}catch{
 console.error('Read-only conversation snapshot failed. No transcript was logged.');process.exit(1);
}
const rows=result.flatMap(r=>r.results||[]).map(r=>{
 let memory={},shopping=null;try{memory=JSON.parse(r.memory_json||'{}');shopping=JSON.parse(r.snapshot_json||'null');}catch{}
 return {sessionHash:createHash('sha256').update(r.session_id).digest('hex'),updatedAt:r.updated_at,turns:memory.travelSales?.turns||[],intent:shopping?.intent||null,conversationMeta:{commercialGoal:memory.travelSales?.commercialGoal||null,nextQuestionCode:memory.travelSales?.nextQuestionCode||null}};
});
const data=Buffer.from(JSON.stringify({anchor,capturedAt:new Date().toISOString(),note:'The database timestamps each saved conversation, not each individual message. Only the latest twenty messages per conversation are retained.',rows}));
const key=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
const sealed=Buffer.concat([cipher.update(data),cipher.final()]);
const envelope={algorithm:'AES-256-GCM + RSA-OAEP-SHA256',encryptedKey:publicEncrypt({key:publicKey,oaepHash:'sha256'},key).toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:sealed.toString('base64')};
data.fill(0);key.fill(0);
await mkdir('artifacts/recent-ai-private',{recursive:true});
await writeFile('artifacts/recent-ai-private/sealed.json',JSON.stringify(envelope));
console.log(JSON.stringify({encrypted:true,conversations:rows.length,anchor}));
