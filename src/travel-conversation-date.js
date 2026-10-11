// Calendar facts are resolved from the customer's words, never assistant claims.
const normalize=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').normalize('NFKC').replace(/[.!?。！？]+$/u,'').trim();
export function explicitDateReset(message){
 const s=normalize(message);
 return /(?:сброс|убери|удали|отмен).{0,20}дат|дат.{0,20}(?:сброс|убери|удали)|(?:clear|remove|reset|forget).{0,20}(?:date|day)|(?:xoa|bo).{0,20}ngay|(?:清除|删除|重置).{0,10}日期|날짜.{0,15}(?:삭제|초기화|취소)/u.test(s);
}
export function vietnamCalendar(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 return Object.fromEntries(parts.filter(p=>['year','month','day'].includes(p.type)).map(p=>[p.type,Number(p.value)]));
}
function exact(year,month,day){
 const iso=[year,String(month).padStart(2,'0'),String(day).padStart(2,'0')].join('-');
 const value=new Date(iso+'T00:00:00Z');
 return Number.isFinite(value.getTime())&&value.toISOString().slice(0,10)===iso?{kind:'EXACT',exact:iso}:null;
}
const months=[['январ','january','jan'],['феврал','february','feb'],['март','march','mar'],['апрел','april','apr'],['мая','май','may'],['июн','june','jun'],['июл','july','jul'],['август','august','aug'],['сентябр','september','sep'],['октябр','october','oct'],['ноябр','november','nov'],['декабр','december','dec']];
const ordinals=['первое','второе','третье','четвертое','пятое','шестое','седьмое','восьмое','девятое','десятое','одиннадцатое','двенадцатое','тринадцатое','четырнадцатое','пятнадцатое','шестнадцатое','семнадцатое','восемнадцатое','девятнадцатое','двадцатое','двадцать первое','двадцать второе','двадцать третье','двадцать четвертое','двадцать пятое','двадцать шестое','двадцать седьмое','двадцать восьмое','двадцать девятое','тридцатое','тридцать первое'];
export function customerCalendarDate(message,{now=new Date(),dateAsked=false,baseDate='',allowRelative=true}={}){
 const text=normalize(message),today=vietnamCalendar(now);
 if(explicitDateReset(text))return {dateConstraint:null};
 const iso=text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/u);
 if(iso){const dateConstraint=exact(...iso.slice(1).map(Number));return dateConstraint?{dateConstraint}:{invalidDate:true};}
 if(allowRelative&&/завтра|\btomorrow\b|ngay mai|明天|내일/u.test(text)){
  const d=new Date(Date.UTC(today.year,today.month-1,today.day+1));return {dateConstraint:{kind:'EXACT',exact:d.toISOString().slice(0,10)}};
 }
 if(allowRelative&&/сегодня|\btoday\b|hom nay|今天|오늘/u.test(text))return {dateConstraint:exact(today.year,today.month,today.day)};
 let day,month,year;
 for(let i=0;i<months.length;i++){
  const name=months[i].find(name=>new RegExp('(?:^|\\s)'+name+'[a-zа-я]*(?:\\s|$)','u').test(text));
  if(!name)continue;
  const before=text.match(new RegExp('(\\d{1,2})(?:st|nd|rd|th)?\\s+'+name+'[a-zа-я]*(?:\\s+(\\d{4}))?','u'));
  const after=text.match(new RegExp(name+'[a-zа-я]*\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?','u'));
  const m=before||after;if(m){day=Number(m[1]);month=i+1;year=Number(m[2])||today.year;break;}
 }
 const numeric=text.match(/(?:^|\s)(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?(?:\s|$)/u)||text.match(/(?:ngay\s+)?(\d{1,2})\s+thang\s+(\d{1,2})(?:\s+nam\s+(\d{4}))?/u);
 const east=text.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})(?:日|号)?/u)||text.match(/(?:(\d{4})년\s*)?(\d{1,2})월\s*(\d{1,2})일/u);
 if(!day&&numeric){day=Number(numeric[1]);month=Number(numeric[2]);year=Number(numeric[3])||today.year;}
 if(!day&&east){year=Number(east[1])||today.year;month=Number(east[2]);day=Number(east[3]);}
 if(!day){
  const short=text.match(/^(?:на\s+|for\s+|ngay\s+)?(\d{1,2})(?:-?(?:е|ое|го)|日|号|일)?$/u);
  const ordinal=ordinals.indexOf(text.replace(/^на\s+/u,''))+1;
  if((short||ordinal)&&(dateAsked||/^на\s+/u.test(text))){
   day=short?Number(short[1]):ordinal;
   const base=/^\d{4}-\d{2}-\d{2}$/.test(baseDate)?baseDate.split('-').map(Number):[today.year,today.month,today.day];
   year=base[0];month=base[1];
   if(!baseDate&&day<today.day)return {invalidDate:true};
  }
 }
 if(!day)return {};
 const dateConstraint=exact(year,month,day);return dateConstraint?{dateConstraint}:{invalidDate:true};
}
export function recoverCustomerDate(history,{now=new Date()}={}){
 let result;
 for(let i=0;i<history.length;i++){
  const turn=history[i];if(turn.role!=='user')continue;
  const previous=history[i-1]?.text||'';
  const at=turn.at?new Date(turn.at):now;
  const parsed=customerCalendarDate(turn.text,{now:Number.isFinite(at.getTime())?at:now,dateAsked:/(?:какую дату|какое число|какого числа|what date|which date|ngay nao|哪天|日期|어느 날짜|몇 일)/iu.test(previous),allowRelative:Boolean(turn.at)});
  if(Object.hasOwn(parsed,'dateConstraint'))result=parsed.dateConstraint;
 }
 return result;
}
