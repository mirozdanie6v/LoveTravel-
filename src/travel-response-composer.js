import {stableJson} from './travel-commerce-quote.js';
export function normalizeReplyText(value){
  return String(value??'').replace(/<br\s*\/?>/gi,'\n').replace(/\r\n?/g,'\n')
    .replace(/\\+(?:r\\+)?n/g,'\n').replace(/https?:\/\/\S+|\/n(?=[ \t]|\d{1,2}[.)][ \t]+|[-*•][ \t]+|\p{Lu})/gu,token=>token.startsWith('/n')?'\n':token)
    .replace(/\.n\./gu,'.\n\n').replace(/([.!?])n{1,2}(?=\p{Lu})/gu,'$1\n\n')
    .replace(/([.!?。！？])n{1,2}(?=[ \t]*(?:[-*•]|\d{1,2}[.)])[ \t]+\S)/gu,'$1\n')
    .replace(/[ \t]{2,}(?=(?:[-*•]|\d{1,2}[.)])\s+\p{L})/gu,'\n')
    .replace(/\*\*([^*\n]+)\*\*/g,'$1').trim();
}
const normalized=value=>String(value||'').trim().toLowerCase().normalize('NFD').replace(/([a-z])[\u0300-\u036f]+/g,'$1').normalize('NFC').replace(/đ/g,'d').replace(/[.!?。！？]+$/u,'').trim();
export const acceptsBookingForm=message=>/^(?:да|yes|okay|ok|dong\s+y|vang|是|好的|네|예|давайте этот|беру этот|let'?s take (?:it|this)|choose this|chon cai nay|就选这个|이걸로 할게요)$/u.test(normalized(message));
const copy={
  ru:{open:'Открываю форму с выбранными параметрами. Проверьте данные перед подтверждением.',retained:'Выбранные условия сохранены. Можно перейти к форме кнопкой под экскурсией.',pickup:hotel=>'Отель «'+hotel+'» указан в запросе. Место и возможность трансфера проверьте в форме.'},
  en:{open:'Opening the form with your selected details. Review them before confirming.',retained:'Your selected details are retained. You can continue using the button below the tour.',pickup:hotel=>'Your request names '+hotel+' as the hotel. Check the pickup location and availability in the form.'},
  vi:{open:'Đang mở biểu mẫu với các thông tin đã chọn. Vui lòng kiểm tra trước khi xác nhận.',retained:'Các thông tin đã chọn được giữ lại. Bạn có thể tiếp tục bằng nút bên dưới tour.',pickup:hotel=>'Yêu cầu của bạn ghi khách sạn '+hotel+'. Vui lòng kiểm tra địa điểm và khả năng đón khách trong biểu mẫu.'},
  zh:{open:'正在打开包含已选信息的表单，请在确认前核对。',retained:'已保留您选择的条件，可通过行程下方的按钮继续。',pickup:hotel=>'您的请求中已填写酒店 '+hotel+'。请在表单中核对接送地点和是否提供接送。'},
  ko:{open:'선택한 정보로 양식을 열고 있습니다. 확인 전에 내용을 검토해 주세요.',retained:'선택한 조건이 유지됩니다. 투어 아래 버튼으로 계속 진행할 수 있습니다.',pickup:hotel=>'요청에 '+hotel+' 호텔이 기재되었습니다. 양식에서 픽업 장소와 가능 여부를 확인해 주세요.'},
};
// Presentation only: no provider/DB access, tariff selection, approval or reserve.
export function composeBookingResponse({plan,transaction,memory={},locale='ru',message='',pickupChanged=false,hotel=''}={}){
  let result={...plan},presentation=memory.lastPresentedOffer||'',uiAction='';
  if(plan.source==='provider-exact-offer'&&transaction?.quote?.offer){
    const offer=transaction.quote.offer;
    presentation=stableJson({transactionId:transaction.transactionId,productId:offer.productId,
      rate:offer.rateRef,startTime:offer.startTimeRef,date:offer.date,party:offer.participantMix,price:offer.price});
    if(presentation===memory.lastPresentedOffer){
      const text=copy[locale]||copy.en;
      if(acceptsBookingForm(message)&&memory.nextQuestionCode==='OPEN_CONFIGURATOR'){
        result.reply=text.open;uiAction='OPEN_CONFIGURATOR';
      }else if(pickupChanged&&hotel)result.reply=text.pickup(hotel);
      else result.reply=text.retained;
    }
  }
  if(!['OPTION','CHOOSE_OFFER'].includes(result.nextQuestionCode)
    &&result.source!=='provider-catalog-options'
    &&/входит|включ|includ|bao\s*gom|包含|包括|포함/iu.test(normalized(message))){
    result.reply=String(result.reply).replace(/(?:^|\s)(\d{1,2})[.)]\s+(?=\p{L})/gu,'\n- ').trim();
  }
  result.reply=normalizeReplyText(result.reply);
  return {plan:result,presentation,uiAction};
}

const optionCopy={
 ru:{summary:'Варианты и стартовые цены',group:'Итого за указанную группу на',note:'Цены «от» — ориентир. Точную сумму уточним по дате, составу группы и выбранным услугам.',question:'Нажмите на подходящий вариант, и я помогу с дальнейшим выбором.'},
 en:{summary:'Options and starting prices',group:'Total for your specified party on',note:'Starting prices are a guide. The final total depends on your date, travellers and selected services.',question:'Tap an option and I will help with the next step.'},
 vi:{summary:'Các phương án và giá từ',group:'Tổng giá cho nhóm đã nêu vào',note:'Giá từ chỉ để tham khảo. Tổng giá được xác nhận theo ngày, số khách và dịch vụ đã chọn.',question:'Chạm vào phương án phù hợp để tiếp tục.'},
 zh:{summary:'行程方案与起价',group:'所述出行人员的总价，日期',note:'起价仅供参考，最终总价根据日期、出行人数和所选服务确认。',question:'点击合适的方案，我会协助您继续选择。'},
 ko:{summary:'투어 옵션과 시작 가격',group:'입력한 전체 인원의 총액, 날짜',note:'시작 가격은 참고용입니다. 날짜, 인원 및 선택한 서비스에 따라 최종 금액을 확인합니다.',question:'원하는 옵션을 누르면 다음 단계를 도와드릴게요.'},
};
export function optionCardsPresentation({plan,products=[],offers=[],intent={},locale='ru'}={}){
 if(!['provider-catalog-options','provider-option-prices'].includes(plan?.source)||!Array.isArray(plan.choices))return null;
 const exact=plan.source==='provider-option-prices',groups=[];
 for(const [index,choice] of plan.choices.entries()){
  const row=products.find(row=>row.product.productId===choice.productId);
  const option=row?.facts?.options?.find(option=>String(option.rateRef.externalId)===String(choice.rateRef?.externalId));
  if(!row||!option)continue;
  const quoted=exact?offers.find(item=>item.product?.productId===choice.productId&&String(item.offer?.rateRef?.externalId)===String(choice.rateRef?.externalId)):null;
  const candidate=exact?quoted?.offer?.price:option.fromPrice;
  const amount=candidate?.amount;
  const price=typeof amount==='number'&&Number.isFinite(amount)&&amount>=0&&/^[A-Z]{3}$/.test(candidate.currency||'')
   ?{amount,currency:candidate.currency,kind:exact?'GROUP_TOTAL':option.pricedPerPerson?'FROM_ADULT':'FROM_BOOKING'}:null;
  let group=groups.find(group=>group.productId===choice.productId);
  if(!group){group={productId:choice.productId,externalProductId:String(row.product.providerRef.externalId),title:row.facts.localizedTitle||row.product.title,options:[]};groups.push(group);}
  group.options.push({index:index+1,rateId:String(option.rateRef.externalId),title:option.localizedTitle||option.title,description:option.description||'',price});
 }
 if(!groups.length)return null;
 const copy=optionCopy[locale]||optionCopy.en;
 return {groups,summary:exact?copy.group+' '+intent.dateConstraint.exact:copy.summary,footnote:exact?'':copy.note,question:copy.question};
}
