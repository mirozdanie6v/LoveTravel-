import {ensureSalesGuest,ensureSalesSession,withSalesSession} from './travel-session.js';
import {executeConversationOperation} from './booking-session-client.js';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
export async function handleTravelConversationApi(request,env,url=new URL(request.url)){
  if(!['/api/travel-commerce/session','/api/travel-commerce/conversation'].includes(url.pathname))return null;
  let session;
  try{
    if(url.pathname.endsWith('/session')&&request.method!=='GET')return json({ok:false,error:'method_not_allowed'},405);
    if(url.pathname.endsWith('/conversation')&&request.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
    // Credential bootstrap must not reopen or require a deleted default dialogue.
    session=url.pathname.endsWith('/session')?await ensureSalesGuest(request,env):await ensureSalesSession(request,env);
    if(url.pathname.endsWith('/session'))return withSalesSession(json({ok:true}),session);
    const body=await request.json().catch(()=>null);
    if(body?.action!=='DELETE_SAVED_DATA')return withSalesSession(json({ok:false,error:'unsupported_action'},400),session);
    const result=await executeConversationOperation(env,session,{action:'DELETE_SAVED_DATA'});
    return withSalesSession(json(result),session);
  }catch(error){return withSalesSession(json({ok:false,error:error.code||'conversation_action_failed'},error.status||502),session);}
}
