import {stableJson} from './travel-commerce-quote.js';
const normalized=value=>String(value||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[.!?。！？]+$/u,'').trim();
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
  return {plan:result,presentation,uiAction};
}
