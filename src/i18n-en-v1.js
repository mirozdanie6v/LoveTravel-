(() => {
  'use strict';

  const EN_TEXT = {
    'Вы':'You','Главная':'Home','Каталог':'Tours','Мои поездки':'My Trips','ИИ-Помощник':'AI Assistant',
    'Ваш лучший отдых':'Your best holiday','во Вьетнаме':'in Vietnam',
    'Ваш лучший отдых во Вьетнаме':'Your best holiday in Vietnam',
    'Более 150 экскурсий по всему Вьетнаму, Fast Track в аэропортах, трансферы, индивидуальные программы и авторские путешествия по Юго-Восточной Азии.':'150+ tours across Vietnam, airport Fast Track, transfers, private programs and signature journeys across Southeast Asia.',
    'Выбрать тур':'Choose a tour','Быстрый':'Quick','выбор':'selection','по направлениям':'by destination',
    'Быстрый выбор':'Quick selection','Быстрый выбор по направлениям':'Quick selection by destination',
    'Популярные экскурсии':'Popular tours','Все':'All','Подробнее':'Details','Подробнее об экскурсии':'Tour details',
    'Нячанг':'Nha Trang','Дананг':'Da Nang','Фукуок':'Phu Quoc','Ханой':'Hanoi','Далат':'Da Lat','Фуйен':'Phu Yen',
    'Муйне/Фантьет':'Mui Ne / Phan Thiet','Премиум':'Premium',
    'Далат, Фуйен, обзорные и морские маршруты':'Da Lat, Phu Yen, city tours and sea routes',
    'Ба На Хилл, Золотой мост, Хойан и Мраморные горы':'Ba Na Hills, Golden Bridge, Hoi An and Marble Mountains',
    'Острова, канатная дорога, VinWonders и семейные программы':'Islands, cable car, VinWonders and family programs',
    'Халонг, Сапа, Ниньбинь и туры по северу':'Ha Long, Sa Pa, Ninh Binh and Northern Vietnam tours',
    'Фильтры':'Filters','Фильтры каталога':'Tour filters','Свернуть фильтры':'Collapse filters','Развернуть фильтры':'Expand filters',
    'Город':'City','Все города':'All cities','Длительность':'Duration','Тип отдыха':'Experience type',
    'Бюджет, $':'Budget, $','Бюджет':'Budget','Бюджет от':'Budget from','Бюджет до':'Budget to',
    'от':'from','до':'to','С детьми':'With children','Показывать только семейные экскурсии':'Show family-friendly tours only',
    'Сбросить':'Reset','Поиск по экскурсиям':'Search tours','Поиск: Далат, море, Ханой...':'Search: Da Lat, sea, Hanoi...',
    'По выбранному фильтру пока нет загруженных экскурсий. Измените параметры или сбросьте фильтр.':'No tours match the selected filters yet. Change the filters or reset them.',
    'Море и острова':'Sea and islands','Морские':'Sea & islands','Природа и горы':'Nature & mountains','Культура':'Culture','Fast Track + трансфер':'Fast Track + transfer','Другое':'Other',
    'Маршрут':'Itinerary','Включено':'Included','Что взять':'What to bring','Собирающиеся выезды':'Scheduled group departures',
    'На этот тур пока нет собирающихся групп.':'There are no scheduled groups for this tour yet.','Присоединиться':'Join','Создать свою группу':'Create your own group',
    'Групповой':'Group','Индивидуальный':'Private','Индивидуально':'Private','Группа':'Group',
    'Забронировать':'Book','Оформление поездки':'Book your trip','Назад':'Back',
    'Взрослые':'Adults','Дети':'Children','Малыши':'Infants','Участники поездки':'Travelers',
    'Фамилия Имя':'Full name','Имя':'Name','Телефон':'Phone','Дата рождения':'Date of birth','Дата':'Date',
    'Отель':'Hotel','Отель / район':'Hotel / area','Способ оплаты':'Payment method',
    'Оплата':'Payment','Перейти к оплате':'Continue to payment','Оплата 100%':'Pay 100%','Оплата выполнена':'Payment completed',
    'Состав группы':'Party','Стоимость':'Price','Стоимость поездки':'Trip price','к оплате гиду':'payable to the guide',
    'дата на выбор':'choose a date','дата не указана':'date not selected','дата не определена':'date not set',
    'Сохранить':'Save','Сохранить подбор':'Save selection','Выбрать из сохранённых':'Choose from saved travelers',
    'Забронированные':'Booked','Поездка завершена':'Trip completed','Поездка отменена':'Trip cancelled','Поездка перенесена':'Trip rescheduled',
    'Перенести поездку':'Reschedule trip','Отменить':'Cancel','Отмена':'Cancellation','Перенос':'Reschedule','Возврат':'Refund',
    'Правила поездки':'Trip rules','Правила оплаты, переноса и отмены':'Payment, rescheduling and cancellation rules',
    'Спросить помощника':'Ask the assistant','Напишите сообщение...':'Type a message...',
    'Напишите: хочу море, дети 7 и 10 лет...':'Example: I want the sea, children aged 7 and 10...',
    'Задавайте вопрос — я помогу с поездкой.':'Ask a question — I will help with your trip.',
    'Задавайте вопрос — я помогу подобрать экскурсию и сразу перейти к бронированию.':'Ask a question — I will help you choose a tour and continue straight to booking.',
    'Я AI-консультант, задайте мне любые вопросы, я подскажу вам с поездкой и помогу разобраться во всем.':'I am your AI travel assistant. Ask me anything about the trip and I will help you choose the right option.',
    'Расскажите, кто едет, город, дату и желаемый темп. Я предложу 2–3 экскурсии MaxTour и объясню разницу.':'Tell me who is travelling, the city, date and preferred pace. I will suggest 2–3 MaxTour options and explain the differences.',
    'Советую эти поездки':'Recommended trips','Подходящие экскурсии':'Suitable tours',
    'Что вам интереснее: море и острова, природа, город или что-то премиальное?':'What interests you most: sea and islands, nature, city sightseeing or something premium?',
    'Сколько человек едет?':'How many people are travelling?','На какую дату планируете поездку?':'What date are you planning for?',
    'Покажу подходящие варианты.':'I will show suitable options.','Выберите вариант ниже — я сразу помогу перейти к бронированию.':'Choose an option below and I will help you continue straight to booking.',
    'Не нашёл точного совпадения. Откройте каталог и уточните город, состав группы или желаемый формат отдыха.':'I could not find an exact match. Open the catalogue and specify the city, party size or preferred trip format.',
    'цена уточняется':'price on request','стоимость уточняется после выбора даты':'price is confirmed after choosing the date',
    'индивидуальный / групповой':'private / group','лёгкий':'easy','средний':'moderate','активный':'active',
    'семья':'family','пара':'couple','компания':'friends','дети':'children','старшие туристы':'senior travelers',
    'город':'city','культура':'culture','природа':'nature','горы':'mountains','фото':'photography','море':'sea',
    'острова':'islands','канатная дорога':'cable car','снорклинг':'snorkeling','животные':'animals','парк':'park',
    'аттракционы':'attractions','дюны':'sand dunes','рассвет':'sunrise','круиз':'cruise','лодка':'boat',
    'рисовые террасы':'rice terraces','золотой мост':'Golden Bridge','мосты':'bridges','вечер':'evening','ужин':'dinner',
    'комфорт':'comfort','без очереди':'skip the line','трансфер':'transfer','аэропорт':'airport',
    'хит':'popular','дикий пляж':'wild beach','с отелем':'hotel included','до $50':'under $50',
    'пещера муа':'Mua Cave','сапа':'Sa Pa','халонг':'Ha Long',
    'собирается':'open','почти собрана':'almost full','лист ожидания':'waitlist','отменена':'cancelled',
    'без удержания':'no fee','по правилам':'according to policy','мест':'seats',
    'до 2 лет бесплатно':'free under age 2','до 100 см бесплатно':'free under 100 cm','30% или 100%':'30% or 100%',
    '—':'—','по договорённости':'by arrangement','по запросу':'on request',
    'Данные рейса':'Flight details','Название отеля':'Hotel name','Паспорт':'Passport',
    'Готово':'Done','Отправить':'Send','Показать':'Show','Новая дата':'New date','Не отменять':'Keep trip',
    'Подтвердить отмену':'Confirm cancellation','Подтвердить перенос':'Confirm reschedule',
    'Отмена недоступна':'Cancellation unavailable','Перенос недоступен':'Reschedule unavailable',
    'К возврату':'Refund','Расчёт при открытии':'Calculated when opened','Требует подтверждения менеджером перед оплатой':'Requires confirmation before payment',
    'Открыть каталог':'Open catalogue','Открыть Далат':'Open Da Lat',
    'Личный кабинет':'Traveler profile','Основной путешественник':'Primary traveler','Попутчики':'Travel companions',
    'Попутчик':'Companion','Попутчик · взрослый':'Companion · adult','Попутчик · ребёнок':'Companion · child','Попутчик · малыш':'Companion · infant',
    'Изменить':'Edit','Удалить':'Delete','Соглашения и данные':'Agreements and data',
    'После первой заявки здесь появится основной путешественник.':'Your primary traveler will appear here after the first booking.',
    'Добавятся автоматически после заполнения ФИО и даты рождения в заявке.':'Travel companions are added automatically after you enter their full name and date of birth in a booking.',
    'Данные путешественников сохраняются после оформления заявки и доступны для быстрого выбора при следующем бронировании.':'Traveler details are saved after booking and can be reused quickly in future bookings.',
    'Согласие на обработку данных для бронирования экскурсии и связи по поездке.':'Consent to process data for booking and trip communication.',
    'Правила оплаты, переноса и отмены показываются до оплаты в оформлении поездки.':'Payment, rescheduling and cancellation rules are shown before payment during booking.',
    'Сохранённые путешественники доступны для повторного выбора в новых заявках.':'Saved travelers can be selected again in new bookings.',
    'Заполните ФИО и дату рождения.':'Enter the full name and date of birth.',
    'Такой путешественник уже есть в личном кабинете.':'This traveler is already saved in your profile.',
    'Этот путешественник уже выбран в заявке.':'This traveler is already selected in this booking.',
    'Статус и расчёт обновлены.':'Status and calculation updated.','Статус изменён':'Status changed',
    'Перенесено':'Rescheduled','Перенесено · удержание 30%':'Rescheduled · 30% retained','Отменено':'Cancelled',
    'Отменить поездку?':'Cancel this trip?','Перенести':'Reschedule','ОТМЕНА':'CANCELLATION','ПЕРЕНОС':'RESCHEDULE',
    'Стоимость поездки':'Trip price','Уже внесено':'Already paid','Удержание':'Retained','Расчёт актуален на':'Calculated at',
    'Бесплатно':'Free','Без удержания':'No fee','Удержание 30%':'30% retained','Удержание 100%':'100% retained',
    'Новый выезд':'New departure','Групповые выезды':'Group departures','Групповой выезд':'Group departure',
    'Дата группового выезда фиксирована':'Group departure date is fixed','Готовый групповой выезд':'Available group departure',
    'Лист ожидания':'Waitlist','осталось мало мест':'Few seats left','сейчас нет свободного выезда':'No available departure right now',
    'свободно':'available','Продолжить бронирование':'Continue booking',
    'AI-консультант':'AI Assistant','Подбираю…':'Searching…','Подбираю подходящий ответ…':'Preparing a suitable answer…',
    'Расскажите, куда и как хотите поехать. Я подберу варианты и доведу до бронирования.':'Tell me where and how you would like to travel. I will suggest options and guide you to booking.',
    'Я подскажу по маршрутам, цене, датам, детям, трансферу, оплате и условиям поездки. Напишите вопрос своими словами.':'I can help with itineraries, prices, dates, children, transfers, payment and trip conditions. Ask in your own words.',
    'Куда хотите поехать?':'Where would you like to go?','На какие даты планируете?':'What dates are you considering?',
    'Сколько взрослых, детей и малышей едет?':'How many adults, children and infants are travelling?',
    'Индивидуальная поездка или групповой выезд?':'Private trip or group departure?',
    'Какой формат удобнее — групповой или индивидуальный? После выбора сразу покажу варианты с ценой и бронированием.':'Which format do you prefer — group or private? After you choose, I will show options with prices and booking.',
    'Что важно в поездке: море, природа, город или комфорт?':'What matters most: sea, nature, city sightseeing or comfort?',
    'Что вам больше хочется: море и острова, природа и красивые виды или обзор города?':'What would you prefer: sea and islands, nature and scenic views, or a city tour?',
    'Хочу групповой тур':'I want a group tour','Хочу индивидуальный тур':'I want a private tour','Хочу море и острова':'I want sea and islands',
    'Хочу обзорную экскурсию':'I want a city tour','Хочу природу и красивые виды':'I want nature and scenic views',
    'Нас 2 взрослых':'We are 2 adults','С ребёнком':'With a child','Пока только посмотрю варианты':'I only want to browse for now',
    'Сравнить групповой и индивидуальный':'Compare group and private','Сравнить оба':'Compare both',
    'Любое направление':'Any destination','Направление':'Destination','Формат':'Format','Пожелания':'Preferences','Контакт':'Contact',
    'Как к вам обращаться':'Your name','Отель, нужен ли трансфер':'Hotel and whether you need a transfer',
    'Например, до $600':'For example, up to $600','нужен':'needed','не нужен':'not needed','нужен / уточнить':'needed / to confirm',
    'дата гибкая':'flexible date','Дата гибкая':'Flexible date','даты уточняются':'dates to be confirmed','дата учитывается':'date considered',
    'дата подтверждается при бронировании':'date confirmed during booking','индивидуальная дата подтверждается при оформлении':'private date confirmed during booking',
    'состав группы не указан':'party not specified','состав не указан':'party not specified',
    'индивидуальная поездка':'private trip','групповой выезд':'group departure','пока не решил формат':'format not decided yet',
    'море / острова':'sea / islands','море, острова':'sea, islands','Природа и фото':'Nature and photography','природа, горы, фото':'nature, mountains, photography',
    'город и культура':'city and culture','Обзор города':'City tour','комфорт / премиум':'comfort / premium',
    'красивые виды':'scenic views','Красивые виды':'Scenic views','лёгкая программа':'easy program','лёгкая программа, комфорт':'easy program, comfort',
    'Легко и комфортно':'Easy and comfortable','насыщенная программа':'full itinerary','спокойный темп':'relaxed pace',
    'подходит для семьи':'family-friendly','подходит с детьми':'good with children','подходит под ваш запрос':'matches your request',
    'совпадает с вашим запросом':'matches your request','подходит для индивидуальной поездки':'suitable for a private trip',
    'выгодная цена':'good value','выгоднее по цене':'better value','два формата для сравнения':'two formats to compare',
    'сравнение двух форматов':'comparison of two formats','сравнила индивидуальный и групповой форматы':'compared private and group formats',
    'ближайшие выходные':'next weekend','Ближайшие выходные':'Next weekend','в течение ближайшей недели':'within the next week',
    'В течение ближайшей недели':'Within the next week','В течение недели':'Within a week','Сегодня':'Today','Завтра':'Tomorrow',
    'дата выбирается при бронировании':'date selected during booking','на эту дату выезд не найден':'no departure found for this date',
    'уточняется':'to be confirmed','новинка':'new','Новый тур':'New tour'
  };

  const CITY = {
    'Нячанг':'Nha Trang','Дананг':'Da Nang','Фукуок':'Phu Quoc','Ханой':'Hanoi','Далат':'Da Lat',
    'Фуйен':'Phu Yen','Муйне/Фантьет':'Mui Ne / Phan Thiet','Муйне':'Mui Ne','Аэропорт':'Airport',
    'Ба На Хилл · Хойан':'Ba Na Hills · Hoi An','Южные острова':'Southern Islands','Север острова':'North Island',
    'Ханой · Халонг':'Hanoi · Ha Long','Сапа · Фансипан':'Sa Pa · Fansipan','Ниньбинь':'Ninh Binh'
  };

  const CITY_CASES = {
    'Нячанга':'Nha Trang','Ханоя':'Hanoi','Дананга':'Da Nang','Фукуока':'Phu Quoc','Далата':'Da Lat',
    'Фуйена':'Phu Yen','Хойана':'Hoi An','Халонга':'Ha Long','Ниньбиня':'Ninh Binh','Муйне/Фантьета':'Mui Ne / Phan Thiet'
  };

  const SIMPLE = {
    '1 день':'1 day','полдня':'half day','вечер':'evening','2 дня':'2 days','2 дня / 1 ночь':'2 days / 1 night',
    '3 дня / 2 ночи':'3 days / 2 nights','прилёт':'arrival','по времени рейса':'according to flight time',
    'премиум':'premium','природа':'nature','семья':'family','горы':'mountains','фото':'photography','хит':'popular',
    'животные':'animals','культура':'culture','море':'sea','дикий пляж':'wild beach','город':'city',
    'легкая':'easy','ужин':'dinner','с отелем':'hotel included','аэропорт':'airport','трансфер':'transfer',
    'комфорт':'comfort','без очереди':'skip the line','золотой мост':'Golden Bridge','мосты':'bridges',
    'острова':'islands','канатная дорога':'cable car','снорклинг':'snorkeling','парк':'park','дети':'children',
    'аттракционы':'attractions','круиз':'cruise','халонг':'Ha Long','сапа':'Sa Pa','рисовые террасы':'rice terraces',
    'лодка':'boat','пещера муа':'Mua Cave','дюны':'sand dunes','рассвет':'sunrise','лёгкий':'easy',
    'средний':'moderate','активный':'active','пара':'couple','компания':'friends','старшие туристы':'senior travelers',
    'solo':'solo','индивидуальный / групповой':'private / group','Морские':'Sea & islands',
    'Природа и горы':'Nature & mountains','Культура':'Culture','Премиум':'Premium',
    'Fast Track + трансфер':'Fast Track + transfer','30% или 100%':'30% or 100%',
    'до 2 лет бесплатно':'free under age 2','до 100 см бесплатно':'free under 100 cm',
    'собирается':'open','почти собрана':'almost full','лист ожидания':'waitlist'
  };

  const EN_TOURS = {
    'dalat-premium': {
      title:'Da Lat “Premium”',
      groupNotes:['Group of 14–20 guests','Lunch, entrance tickets and cable car included','Guide and hotel pickup included'],
      individualNotes:['Choose your date when booking','The itinerary can be adjusted at a relaxed pace','The remaining balance can be paid to the guide in VND'],
      route:[
        ['Coffee plantation','Discover Vietnamese coffee culture and one of the largest coffee venues in the area.'],
        ['Mountain pass','A winding scenic road with views of mountains, clouds and forest.'],
        ['Clay Tunnel','A creative park with art installations and famous stone faces in the water.'],
        ['Crazy House','One of Da Lat’s most distinctive architectural landmarks.'],
        ['Linh Phuoc Pagoda','A Buddhist temple known for glass and ceramic mosaics.'],
        ['Datanla Waterfall','Pine forest, mountain scenery and an optional alpine coaster paid on site.'],
        ['Cable car','Panoramic views of Da Lat, lakes and pine forests from above.']
      ],
      included:['Lunch','Entrance tickets and cable car','Professional guide','Comfortable minibus','One bottle of water per guest'],
      take:['Temple-appropriate clothing covering shoulders and knees','Order a takeaway breakfast the evening before','A light jacket because Da Lat is cooler','Rain jacket','Comfortable shoes','VND for souvenirs and small expenses']
    },
    'dalat-vip': {
      title:'Da Lat “VIP”',
      groupNotes:['Group of 14–20 guests','Lunch, tickets, water and guide included','A full itinerary at a comfortable pace'],
      individualNotes:['Private pace','More time at the main sights','Suitable for families and groups of friends'],
      route:[
        ['Coffee plantation','Discover local coffee culture and a major coffee venue in the area.'],
        ['Hobbit Village','A fairytale setting with photogenic houses.'],
        ['Mountain pass','A scenic route through mountains and forest.'],
        ['Clay Tunnel','An art park with famous stone faces in the water.'],
        ['Crazy House','Unique architecture and Da Lat’s creative atmosphere.'],
        ['Linh Phuoc Pagoda','Glass and ceramic mosaic art.'],
        ['Datanla Waterfall','Mountain waterfall and optional alpine coaster.'],
        ['Animal farm','Tigers, lions, capybaras, elephants and ostriches; optional activities are paid on site.']
      ],
      included:['Lunch','Entrance tickets','Guide','Comfortable minibus','Comfortable group size','Bottled water'],
      take:['Hat and sunscreen','Takeaway breakfast ordered the evening before','Comfortable shoes','Swimwear/spare clothes depending on weather','Good mood','VND for small expenses']
    },
    'fuyen': {
      title:'Phu Yen Province',
      groupNotes:['Group of 14–20 guests','Lunch, tickets, transfers and water included','Many nature and photo stops'],
      individualNotes:['Private itinerary for your group','Control the pace of the day','Great for photography and relaxed stops'],
      route:[
        ['Wild beach','Swim and enjoy unspoiled nature.'],
        ['Tuy Hoa and Cham tower','Historic Cham architecture and culture.'],
        ['Nghinh Phong Tower','A modern white landmark and new symbol of the province.'],
        ['Mui Dien Lighthouse','One of Vietnam’s best-known eastern coastal viewpoints.'],
        ['Tram Pagoda','A spiritual stop with local stories.'],
        ['Restaurant lunch','Traditional dishes and local soups.'],
        ['Thanh Luong Pagoda','A peaceful stop near the end of the day.'],
        ['Ganh Da Dia','Distinctive basalt rock formations by the sea.'],
        ['Mang Lang Church','One of Vietnam’s notable historic churches.']
      ],
      included:['Lunch','Entrance tickets','Guide','Comfortable minibus','Comfortable group size','Bottled water'],
      take:['Hat and sunscreen','Takeaway breakfast ordered the evening before','Comfortable shoes and backpack','Swimwear and towel','Good mood','VND for souvenirs']
    },
    'nhatrang-day': {
      title:'Nha Trang Day City Tour',
      groupNotes:['Compact and convenient program','Lunch, tickets, transfers and water included','Ideal for a first introduction to Nha Trang'],
      individualNotes:['Suitable for families or small groups','Relaxed pace available','No long-distance travel outside the city'],
      route:[
        ['Long Son Pagoda and White Buddha','A Buddhist temple complex and one of Nha Trang’s best-known landmarks.'],
        ['Nha Trang Cathedral','Early-20th-century French Gothic architecture.'],
        ['Hon Chong','Coastal rock formations and sea views.'],
        ['Truc Lam Phung Pagoda','A panoramic viewpoint on Chin Khuc Mountain.'],
        ['Po Nagar Cham Towers','A historic Cham temple complex.'],
        ['North Nha Trang beach','A walk along a scenic part of the coastline.'],
        ['Restaurant lunch','Vietnamese food and a break after sightseeing.']
      ],
      included:['Lunch','Entrance tickets','Guide','Comfortable minibus','Comfortable group size','Bottled water'],
      take:['Temple-appropriate clothing','Hat and sunscreen','Good mood','VND for souvenirs']
    },
    'nhatrang-night': {
      title:'Nha Trang Evening City Tour',
      groupNotes:['Seafood buffet and traditional show','All entrance tickets included','Convenient evening schedule'],
      individualNotes:['Private evening itinerary','Convenient for families and couples','More relaxed visits to temples and viewpoints'],
      route:[
        ['Da Bao Pagoda','A hilltop pagoda with panoramic views.'],
        ['Hon Chong','Coastal rock formations.'],
        ['Nha Trang Cathedral','An early-20th-century Gothic cathedral.'],
        ['Do Theatre','Architecture inspired by a traditional Vietnamese fishing tool.'],
        ['Po Nagar Cham Towers','A historic temple complex.'],
        ['Long Son Pagoda and White Buddha','A famous Buddhist complex.'],
        ['Lang Ngon Restaurant','Seafood dinner and traditional performance.']
      ],
      included:['Seafood buffet and show','All entrance tickets','Guide','Transfers','Comfortable group size','Bottled water'],
      take:['Temple-appropriate clothing','Hat and sunscreen','Good mood','VND for small expenses']
    },
    'dalat-2days': {
      title:'Da Lat — 2 Days',
      groupNotes:['Two program options: Standard and + Glass Bridge','Breakfast and two lunches included','Accommodation depends on the selected room type'],
      individualNotes:['Private two-day program','A relaxed way to explore Da Lat','Final price may depend on room category'],
      route:[
        ['Day 1: coffee plantation','Coffee culture and a scenic mountain-road route.'],
        ['Clay Tunnel and Crazy House','Two of Da Lat’s most distinctive creative attractions.'],
        ['Linh Phuoc Pagoda and Big Buddha','Temple complex, scenery and architecture.'],
        ['Datanla Waterfall','Mountain nature and optional activities on site.'],
        ['Hotel check-in','Central Da Lat and free time in the evening.'],
        ['Day 2: farm, waterfall and old railway station','Animals, Pongour Waterfall, cable car and Da Lat railway station.']
      ],
      included:['Breakfast and two lunches','All entrance tickets','Guide','Transfers','Accommodation according to the selected package','Bottled water'],
      take:['Temple-appropriate clothing','Takeaway breakfast for day one','Light jacket','Rain jacket','Comfortable shoes','VND for extras and souvenirs']
    },
    'fast-track': {
      title:'Fast Track + Transfer',
      groupNotes:['This service is provided privately','Suitable for airport arrival and hotel transfer'],
      individualNotes:['Meet-and-greet with a name sign','Priority immigration assistance without queuing','Private transfer to a hotel in central Nha Trang'],
      route:[
        ['Airport meet-and-greet','A representative meets you near the immigration/formalities area.'],
        ['Fast-track formalities','Assistance through passport control.'],
        ['Hotel transfer','Comfortable private transfer to your hotel in central Nha Trang.']
      ],
      included:['Meet-and-greet with a name sign','Fast-track passport formalities','Private hotel transfer'],
      take:['Passport','Flight details','Hotel name']
    },
    'danang-ba-na-hoian': {
      title:'Ba Na Hills, Golden Bridge & Hoi An',
      groupNotes:['Group of 14–20 guests','Cable car, theme park and evening Hoi An','Ideal for a first visit to Central Vietnam'],
      individualNotes:['Travel at your own pace','More time at Golden Bridge or in Hoi An','Comfortable for families and groups of friends'],
      route:[
        ['Ba Na Hills','Ride the cable car to the mountain resort.'],
        ['Golden Bridge','Walk across the famous bridge held by giant stone hands.'],
        ['French Village','Architecture, photo spots and free time.'],
        ['Marble Mountains','Caves, pagodas and viewpoints.'],
        ['Hoi An in the evening','Lantern-lit streets, walking and atmospheric old-town lanes.']
      ],
      included:['Transfers according to the program','Entrance tickets according to the program','Guide','Bottled water','Ticket assistance'],
      take:['Comfortable shoes','Hat and sunscreen','Light jacket for Ba Na Hills','VND for personal expenses','Phone charger']
    },
    'danang-city-sontra': {
      title:'Da Nang: Son Tra, Marble Mountains & Bridges',
      groupNotes:['Compact evening program','Da Nang highlights','A good option after a beach day'],
      individualNotes:['Flexible departure time','Option to add a restaurant or photo stop','A relaxed way to explore the city'],
      route:[
        ['Linh Ung Pagoda','Views over the sea and city.'],
        ['Marble Mountains','Caves, steps and pagoda areas.'],
        ['Dragon Bridge','A Da Nang landmark with evening lights.'],
        ['Han River waterfront','A short walk and photo stop.']
      ],
      included:['Transfers','Guide/host','Bottled water','Ticket assistance'],
      take:['Comfortable shoes','Clothing covering shoulders for temples','Water','Phone or camera']
    },
    'phuquoc-4-islands': {
      title:'Phu Quoc: 4 Islands & Cable Car',
      groupNotes:['Scheduled group departure','Islands, beaches and cable car','Sea trip can be included depending on the package'],
      individualNotes:['Private speedboat/vehicle on request','Flexible pace and beach time','Convenient for families with children'],
      route:[
        ['Southern islands','Travel by sea between scenic islands.'],
        ['Beach stop','Swimming, photography and relaxation.'],
        ['Snorkeling','Easy stops to explore the underwater world.'],
        ['Hon Thom cable car','Views of the sea and islands from above.']
      ],
      included:['Pickup from hotels in the service area','Sea trip','Bottled water','Ticket assistance','Program support'],
      take:['Swimwear and towel','Sunscreen','Hat','Dry clothes','VND for optional extras']
    },
    'phuquoc-vinwonders-safari': {
      title:'VinWonders & Safari Phu Quoc',
      groupNotes:['Tickets and transfers depend on the selected package','Full-day program','Family-friendly'],
      individualNotes:['Private transfer','Flexible return time','Choose the park only or park + safari'],
      route:[
        ['VinWonders','Themed zones, aquarium and attractions.'],
        ['Safari','Animal park and family activities.'],
        ['Grand World','Optional evening walk in the north of the island.']
      ],
      included:['Transfers','Ticket assistance','Program support','Bottled water'],
      take:['Comfortable shoes','Hat for children','Swimwear for the water park','Child ID/document copy if required']
    },
    'hanoi-halong-2d': {
      title:'Hanoi & Ha Long Bay',
      groupNotes:['Group on request','Cruise and sightseeing program','Price depends on travel date and cabin category'],
      individualNotes:['Private program with flight/transfer options','Diamond Era Cruise 5★ according to the package','Current price depends on season and tickets'],
      route:[
        ['Hanoi','Old Quarter, pagodas and key city sights.'],
        ['Ha Long Bay','Transfer to the pier and boarding.'],
        ['Cruise','Lunch, caves, kayak or boat ride, and sunset on board.'],
        ['Return','Transfer back and end of the program.']
      ],
      included:['Meals according to the program','Flights/transfers according to the package','Entrance tickets','Guide in Hanoi','5★ cruise'],
      take:['Passport','Comfortable shoes','VND for small expenses','Phone charger','Light evening jacket']
    },
    'hanoi-sapa-3d': {
      title:'Hanoi & Sa Pa',
      groupNotes:['Shared schedule on request','Mountains, Fansipan and Sa Pa villages','Seasonal pricing applies'],
      individualNotes:['Hanoi, Sa Pa and Fansipan itinerary','Ideal for exploring Northern Vietnam’s mountains','Current price depends on tickets and season'],
      route:[
        ['Hanoi','Sightseeing program in the capital.'],
        ['Sa Pa','Transfer to the mountains and an evening walk.'],
        ['Cat Cat Village','Discover local life and traditions.'],
        ['Fansipan','Cable car to the Roof of Indochina.'],
        ['Silver Waterfall','A final nature stop.']
      ],
      included:['Transfers according to the program','Accommodation','Meals according to the program','Program tickets','Guide/host'],
      take:['Passport','Jacket or windbreaker','Comfortable shoes','VND','Personal medication']
    },
    'hanoi-ninhbinh': {
      title:'Ninh Binh: Trang An & Mua Cave',
      groupNotes:['Shared departure from Hanoi','Boat ride and panoramic viewpoints','A full and varied day'],
      individualNotes:['Private vehicle from Hanoi','A more relaxed pace is available','Excellent for nature and photography'],
      route:[
        ['Trang An','Boat ride between limestone mountains, rivers and caves.'],
        ['Local restaurant','Lunch and a break.'],
        ['Mua Cave','Climb to the panoramic viewpoint.'],
        ['Temples and countryside','Cultural stops depending on the day’s timing.']
      ],
      included:['Transfers','Boat ride','Entrance tickets','Lunch','Program support'],
      take:['Comfortable shoes','Hat','Water','VND','Temple-appropriate clothing']
    },
    'muine-dunes-jeep': {
      title:'Mui Ne: Sand Dunes, Fishing Village & Fairy Stream',
      groupNotes:['Shared sunrise departure','White and red sand dunes','Photo stops and light walking'],
      individualNotes:['Private jeep/vehicle','Choose sunrise or sunset','Ideal for a photography-focused trip'],
      route:[
        ['White Sand Dunes','Sunrise and panoramic views.'],
        ['Red Sand Dunes','Photo stop on the colored dunes.'],
        ['Fishing Village','Boats, local life and the morning market.'],
        ['Fairy Stream','Walk through a shallow stream between red-earth slopes.']
      ],
      included:['Transfers','Jeep/vehicle according to the program','Bottled water','Program support'],
      take:['Comfortable shoes','Hat','Phone/camera','VND for personal expenses']
    }
  };

  function translateDateTimeSafe(text) {
    let out = String(text);
    const months = {'янв':'Jan','фев':'Feb','мар':'Mar','апр':'Apr','май':'May','мая':'May','июн':'Jun','июл':'Jul','авг':'Aug','сен':'Sep','сент':'Sep','окт':'Oct','ноя':'Nov','дек':'Dec'};
    out = out.replace(/(\d{1,2})[–-](\d{1,2})\s+(янв|фев|мар|апр|май|мая|июн|июл|авг|сен|сент|окт|ноя|дек)(?=$|\s|[·,.)])/gi, (_,a,b,mon)=>a+'–'+b+' '+(months[String(mon).toLowerCase()]||mon));
    out = out.replace(/(\d{1,2})\s+(янв|фев|мар|апр|май|мая|июн|июл|авг|сен|сент|окт|ноя|дек)(?=$|\s|[·,.)])/gi, (_,day,mon)=>day+' '+(months[String(mon).toLowerCase()]||mon));
    out = out.replace(/около/gi,'about').replace(/второго дня/gi,'on day two');
    return out;
  }

  function translateDynamicSafe(text) {
    let m;
    if ((m=text.match(/^(\d+)\s+найдено$/i))) return m[1]+' found';
    if ((m=text.match(/^(\d+)\s+из\s+(\d+)\s+мест$/i))) return m[1]+'/'+m[2]+' seats';
    if ((m=text.match(/^Групповой от\s+(.+)$/i))) return 'Group from '+m[1];
    if ((m=text.match(/^Индивидуальный от\s+(.+)$/i))) return 'Private from '+m[1];
    if ((m=text.match(/^от\s+(.+)$/i))) return 'from '+m[1];
    if ((m=text.match(/^Открыть каталог:\s*(.+)$/i))) return 'Open catalogue: '+translateAtomic(m[1]);
    if ((m=text.match(/^Открыть\s+(.+)$/i))) return 'Open '+translateAtomic(m[1]);
    if ((m=text.match(/^выезд\s+(.+)$/i))) return 'departure '+translateAtomic(m[1]);
    if ((m=text.match(/^есть выезд\s+(.+)$/i))) return 'departure available '+translateAtomic(m[1]);
    if ((m=text.match(/^ближайший выезд\s+(.+)$/i))) return 'nearest departure '+translateAtomic(m[1]);
    if ((m=text.match(/^(\d+)\s+взр\.$/i))) return m[1]+' adults';
    if ((m=text.match(/^(\d+)\s+дет\.$/i))) return m[1]+' children';
    if ((m=text.match(/^(\d+)\s+мал\.$/i))) return m[1]+' infants';
    if ((m=text.match(/^(\d+)\s+взросл(?:ый|ых)$/i))) return m[1]+' adults';
    if ((m=text.match(/^(\d+)\s+дет(?:ей|и)$/i))) return m[1]+' children';
    if ((m=text.match(/^(\d+)\s+малыш(?:а|ей)?$/i))) return m[1]+' infants';
    if ((m=text.match(/^(\d+)\s+взрослых\s*\+\s*(\d+)\s+детей\s*\+\s*(\d+)\s+малышей$/i))) return m[1]+' adults + '+m[2]+' children + '+m[3]+' infants';
    if ((m=text.match(/^(\d+)\s+взрослых\s*\+\s*(\d+)\s+реб[её]нок$/i))) return m[1]+' adults + '+m[2]+' child';
    if ((m=text.match(/^(\d+)\s+взрослых\s*\+\s*реб[её]нок\s+(\d+)\s+лет$/i))) return m[1]+' adults + child aged '+m[2];
    if ((m=text.match(/^до\s+(.+)$/i))) return 'until '+translateDateTimeSafe(m[1]);
    if ((m=text.match(/^сейчас\s+(.+)$/i))) return 'now '+translateAtomic(m[1]);
    if ((m=text.match(/^(\d+)\s+человек(?:а)?\s+—\s+(.+)$/i))) return m[1]+' people — '+m[2];
    if ((m=text.match(/^(\d+)[–-](\d+)\s+человек(?:а)?\s+—\s+(.+)$/i))) return m[1]+'–'+m[2]+' people — '+m[3];
    if ((m=text.match(/^(\d+)\s+мест$/i))) return m[1]+' seats';
    if ((m=text.match(/^чек\s+(.+)$/i))) return 'receipt '+m[1];
    if ((m=text.match(/^Дата оплаты:\s*(.+)$/i))) return 'Payment date: '+translateDateTimeSafe(m[1]);
    if ((m=text.match(/^Открываю бронирование «(.+)»\.\s*Дату и состав группы, которые вы уже назвали, перенесу в оформление\.$/i))) return 'Opening booking for “'+translateAtomic(m[1])+'”. I will carry your date and party details into the booking form.';
    if ((m=text.match(/^Отмена сейчас бесплатная\.\s*Деньги удерживать не нужно\.\s*Бесплатная отмена действует до (.+)\.$/i))) return 'Cancellation is free right now. No fee applies until '+translateDateTimeSafe(m[1])+'.';
    if ((m=text.match(/^Бесплатный срок отмены был до (.+)\.\s*При отмене сейчас удерживается 30% стоимости экскурсии:\s*(.+)\.$/i))) return 'Free cancellation was available until '+translateDateTimeSafe(m[1])+'. Cancelling now retains 30% of the tour price: '+m[2]+'.';
    if ((m=text.match(/^Бесплатный срок отмены был до (.+)\.\s*Сейчас действует удержание 100%:\s*(.+)\.\s*Это правило применяется в день выезда или при неявке\.$/i))) return 'Free cancellation was available until '+translateDateTimeSafe(m[1])+'. A 100% retention now applies: '+m[2]+'. This applies on the departure day or for a no-show.';
    if ((m=text.match(/^Перенос сейчас бесплатный\.\s*Доплата не нужна\.\s*Бесплатный перенос действует до (.+)\.$/i))) return 'Rescheduling is free right now with no extra charge. Free rescheduling is available until '+translateDateTimeSafe(m[1])+'.';
    if ((m=text.match(/^Бесплатный срок переноса был до (.+)\.\s*При переносе сейчас удерживается 30% стоимости экскурсии:\s*(.+)\.$/i))) return 'Free rescheduling was available until '+translateDateTimeSafe(m[1])+'. Rescheduling now retains 30% of the tour price: '+m[2]+'.';
    if ((m=text.match(/^Отмена сейчас бесплатная\. Бесплатная отмена действует до (.+)\.$/i))) return 'Cancellation is free now. Free cancellation is available until '+translateDateTimeSafe(m[1])+'.';
    if ((m=text.match(/^При отмене сейчас удерживается 30% стоимости:\s*(.+)\.$/i))) return 'Cancelling now retains 30% of the price: '+m[1]+'.';
    if ((m=text.match(/^Сейчас действует удержание 100% стоимости:\s*(.+)\.$/i))) return 'A 100% retention now applies: '+m[1]+'.';
    if ((m=text.match(/^Перенос сейчас бесплатный\. Бесплатный перенос действует до (.+)\.$/i))) return 'Rescheduling is free now. Free rescheduling is available until '+translateDateTimeSafe(m[1])+'.';
    if ((m=text.match(/^При переносе сейчас удерживается 30% стоимости:\s*(.+)\.$/i))) return 'Rescheduling now retains 30% of the price: '+m[1]+'.';
    if ((m=text.match(/^Удалить попутчика «(.+)» из сохранённых данных\?$/i))) return 'Remove “'+m[1]+'” from saved travelers?';
    if ((m=text.match(/^Эта дата уже прошла\. Сегодня во Вьетнаме (.+)\. Выберите (.+) или любую более позднюю дату\.$/i))) return 'This date has already passed. Today in Vietnam is '+translateDateTimeSafe(m[1])+'. Choose '+translateDateTimeSafe(m[2])+' or any later date.';
    if ((m=text.match(/^Подходящие варианты с выездом из (.+) уже подобраны\. На какую дату хотите поехать\?$/i))) return 'Suitable options departing from '+translateAtomic(m[1])+' are ready. What date would you like to travel?';
    return text;
  }

  function mapSimple(value) {
    const key = String(value == null ? '' : value);
    if (CITY[key]) return CITY[key];
    if (SIMPLE[key]) return SIMPLE[key];
    if (/^(\d+)\s+сен$/.test(key)) return key.replace(' сен',' Sep');
    if (key === '05:00–05:30 → около 20:00') return '05:00–05:30 → about 20:00';
    if (key === '05:00–05:30 → около 18:30') return '05:00–05:30 → about 18:30';
    if (key === '05:00–05:30 → около 18:30 второго дня') return '05:00–05:30 → about 18:30 on day two';
    if (key === '08:00 → около 20:30') return '08:00 → about 20:30';
    if (key === '14:00 → около 19:30') return '14:00 → about 19:30';
    if (key === '08:30 → около 17:30') return '08:30 → about 17:30';
    if (key === '09:00 → около 18:00') return '09:00 → about 18:00';
    if (key === '08:00 → около 18:30') return '08:00 → about 18:30';
    if (key === '04:30 → около 09:30') return '04:30 → about 09:30';
    if (key === 'утро 1-го дня → вечер 2-го дня') return 'morning day 1 → evening day 2';
    if (key === 'утро 1-го дня → вечер 3-го дня') return 'morning day 1 → evening day 3';
    if (key === 'Дата выбирается сразу') return 'Choose the date when booking';
    if (/^(\d+)[–-](\d+)\s+человека\s+—\s+(.+)$/.test(key)) return key.replace('человека','people');
    if (/^(\d+)\s+человек[а]?\s+—\s+(.+)$/.test(key)) return key.replace(/человек[а]?/,'people');
    return key;
  }

  function translateAtomic(text) {
    const s = String(text == null ? '' : text).trim();
    if (!s) return s;
    const numbered=s.match(/^(\d+\.\s*)(.+)$/);
    if (numbered) { const tail=translateAtomic(numbered[2]); if (tail !== numbered[2]) return numbered[1]+tail; }
    if (EN_TEXT[s]) return EN_TEXT[s];
    if (CITY_CASES[s]) return CITY_CASES[s];
    if (CITY[s]) return CITY[s];
    if (SIMPLE[s]) return SIMPLE[s];
    const mapped=mapSimple(s); if(mapped!==s) return mapped;
    const dynamic=translateDynamicSafe(s); if(dynamic!==s) return dynamic;
    const dated=translateDateTimeSafe(s); if(dated!==s) return dated;
    return s;
  }

  Object.assign(EN_TEXT, {
    'Остров Орхидей и Остров Обезьян':'Orchid Island & Monkey Island',
    'Остров Хон Там':'Hon Tam Island',
    'Выезд':'Departure',
    'Возвращение':'Return',
    'Взрослый':'Adult',
    'Ребёнок':'Child',
    'Депозит':'Deposit',
    'групповой':'group',
    'вечер 3-го дня':'evening of day 3',
    'ВЫЕЗД':'DEPARTURE',
    'ФИНИШ':'FINISH',
    'ВОЗВРАЩЕНИЕ':'RETURN',
    'групповой от':'group from',
    'индивидуальный':'private',
    'взрослый':'adult',
    'ребёнок':'child',
    'ребенок':'child',
    'малыш':'infant',
    'утро 1-го дня':'morning of day 1',
    'вечер 2-го дня':'evening of day 2',
    'Любая':'Any',
    'Полдня':'Half day',
    'Вечер':'Evening',
    'Несколько дней':'Multi-day',
    'Любой тип':'Any type',
    'Подходит детям':'Family-friendly',
    'Групповой тур':'Group tour',
    'Индивидуальный тур':'Private tour',
    'Выберите собирающийся выезд внизу страницы или создайте новую дату.':'Choose an available group departure below or create a new date.',
    'Маршрут и дата под вашу семью или компанию.':'An itinerary and date tailored to your family or group.',
    'ВЗРОСЛЫЙ':'ADULT',
    'РЕБЁНОК':'CHILD',
    'ДЕПОЗИТ':'DEPOSIT',
    '100%, если группа не набралась':'100% if the group is not formed',
    'Кому подойдёт':'Best for',
    'Фото тура':'Tour photos',
    'Погода и форс-мажор':'Weather and force majeure',
    'ОТ':'FROM',
    'своя дата и темп':'your own date and pace',
    'Кто едет':'Who is travelling',
    'основной тариф':'standard fare',
    'детская цена по туру':'child fare for this tour',
    'если применимо':'if applicable',
    'Данные участников':'Traveler details',
    'ФИО и дата рождения обязательны для каждого участника. Первый взрослый — основной путешественник, остальные сохраняются как попутчики.':'Full name and date of birth are required for every traveler. The first adult is the primary traveler; the others are saved as companions.',
    'ФИО':'Full name',
    'СЕЙЧАС':'NOW',
    'ОСТАТОК':'BALANCE',
    'ВНЕСЕНО':'PAID',
    'Депозит 30%':'30% deposit',
    'СБП':'SBP',
    'QR / ссылка':'QR / link',
    'карта / QR':'card / QR',
    'Другой способ':'Other method',
    'подберём вариант':'we will arrange an option',
    'Понравилось':'Favorites',
    'добавить':'add',
    'Язык':'Language',
    'Русский':'English',
    'Согласия':'Consents',
    'актуальны':'active',
    'receipt и статус':'receipt and status',
    'Чек и статус':'Receipt and status',
    'Очистить':'Clear',
    'Где вы сейчас или откуда планируете выезд?':'Where are you now, or where will you depart from?',
    'Основной':'Primary',
    'Основной ·':'Primary ·',
    'Попутчик · взрослый':'Companion · adult',
    'Попутчик · ребёнок':'Companion · child',
    'Попутчик · малыш':'Companion · infant',
    'основной путешественник':'primary traveler',
    'попутчик':'companion',
    'по туру':'per tour',
    'Группа':'Group',
    'Возврат':'Refund',
    'Финиш':'Finish',
    'От':'From',
    'по расписанию':'scheduled',
    'время уточняется':'time to be confirmed',
    'по программе':'according to the program',
    'Направления':'Destinations',
    'Без имени':'Unnamed',
    'Условия действия':'Policy conditions',
    'Понятно':'Got it',
    'Дата из AI-консультанта':'Date from AI Assistant',
    'состав не указан':'party not specified',
    'Сейчас':'Now',
    'Остаток':'Balance',
    'Внесено':'Paid'
  });

  function mapEnQuery(value) {
    let q=String(value==null?'':value).toLowerCase();
    const aliases=[
      [/nha\s*trang/g,'нячанг'],[/da\s*lat/g,'далат'],[/da\s*nang/g,'дананг'],
      [/phu\s*quoc/g,'фукуок'],[/phu\s*yen|tuy\s*hoa/g,'фуйен'],[/hanoi|ha\s*noi/g,'ханой'],
      [/ha\s*long/g,'халонг'],[/hoi\s*an/g,'хойан'],[/mui\s*ne|phan\s*thiet/g,'муйне'],
      [/sea|beach/g,'море'],[/island/g,'остров'],[/nature/g,'природа'],[/mountain/g,'горы'],
      [/waterfall/g,'водопад'],[/culture/g,'культура'],[/city/g,'город'],[/premium|vip/g,'премиум'],
      [/family/g,'семья'],[/child|children|kids/g,'дети'],[/cable\s*car/g,'канатная дорога'],
      [/cruise/g,'круиз'],[/dune/g,'дюны'],[/golden\s*bridge/g,'золотой мост']
    ];
    for(const [pattern,ru] of aliases) q=q.replace(pattern,ru);
    return q;
  }

  Object.assign(EN_TEXT, {
    'Бутылка воды':'Bottle of water',
    'Русскоязычный гид':'Russian-speaking guide',
    'Русскоговорящий гид':'Russian-speaking guide',
    'Трансфер — микроавтобус и лодка':'Transfer — minibus and boat',
    'Трансфер — микроавтобус и катер':'Transfer — minibus and speedboat',
    'Обед':'Lunch',
    'Все входные билеты':'All entrance tickets',
    'Входные билеты':'Entrance tickets',
    'Вода':'Water',
    'ОСТРОВА НЯЧАНГА':'NHA TRANG ISLANDS',
    'Вариант с буфетом — $55':'Buffet option — $55',
    'пляж':'beach',
    'не групповой формат':'not a group format',
    'БА НА ХИЛЛ':'BA NA HILLS',
    'ХОЙАН':'HOI AN',
    'ХАЛОНГ':'HA LONG',
    'САПА':'SA PA',
    'ФАНСИПАН':'FANSIPAN',
    'Острова Нячанга':'Nha Trang Islands',
    'Ба На Хилл':'Ba Na Hills',
    'Хойан':'Hoi An',
    'Халонг':'Ha Long',
    'Сапа':'Sa Pa',
    'Фансипан':'Fansipan'
  });

  globalThis.MaxTourLocaleData = globalThis.MaxTourLocaleData || {};
  globalThis.MaxTourLocaleData.en = Object.freeze({
    text: EN_TEXT,
    city: CITY,
    cityCases: CITY_CASES,
    simple: SIMPLE,
    tours: EN_TOURS,
    translateDateTime: translateDateTimeSafe,
    translateDynamic: translateDynamicSafe,
    translateAtomic,
    mapSimple,
    mapQuery: mapEnQuery
  });

})();
