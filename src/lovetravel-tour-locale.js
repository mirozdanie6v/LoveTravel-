(() => {
  'use strict';

  const STORAGE_KEY='max-tour-locale-v1';
  const SUPPORTED=['ru','vi','en','ko'];
  const intlLocale={ru:'ru-RU',vi:'vi-VN',en:'en-US',ko:'ko-KR'};

  const products={
    '1287578':{
      en:{
        title:'Nha Trang Island Hopping Adventure at Robinson Beach',
        description:'Experience the authentic side of Nha Trang beyond the usual island tours, combining a local fishing village, beautiful Robinson Island, snorkeling, fishing, kayaking and a relaxing break by the sea, with an optional lighthouse adventure.',
        itinerary:[
          'Visit Bich Dam, a peaceful fishing village in Nha Trang Bay, and experience the authentic local coastal lifestyle. Explore the village, see traditional fishing boats and houses, and enjoy the tranquil atmosphere away from the busy tourist areas. Your guide will introduce you to the local way of life and the history of this unique island community.',
          'Optional visit to Hon Lon Lighthouse by motorbike. Guests who choose this activity will ride a motorbike to visit the lighthouse and enjoy views of the surrounding coastline and Nha Trang Bay. The lighthouse visit is optional and is not suitable for walking access. Motorbike rental is available for approximately US$6 per person and is not included in the tour price.',
          'Enjoy free time on Robinson Island, known for its clear turquoise water, beautiful beach, and relaxed island atmosphere. Guests can swim, relax on the beach, take photos, and enjoy the surrounding scenery of Nha Trang Bay.'
        ]
      },
      ru:{
        title:'Островное приключение в Нячанге: пляж Робинзон',
        description:'Откройте аутентичную сторону Нячанга вдали от стандартных островных маршрутов: местная рыбацкая деревня, остров Робинзон, снорклинг, рыбалка, каякинг и отдых у моря, а также дополнительная поездка к маяку.',
        itinerary:[
          'Посетите Бич Дам — тихую рыбацкую деревню в заливе Нячанг — и познакомьтесь с настоящей жизнью местного побережья. Прогуляйтесь по деревне, увидьте традиционные рыбацкие лодки и дома и почувствуйте спокойную атмосферу вдали от оживлённых туристических районов. Гид расскажет о быте местных жителей и истории этого уникального островного сообщества.',
          'Дополнительная поездка на мотоцикле к маяку Хон Лон. Желающие отправятся к маяку на мотоцикле и увидят панорамы побережья и залива Нячанг. Посещение маяка необязательное; пешком до него добраться нельзя. Аренда мотоцикла стоит примерно 6 USD с человека и не входит в стоимость экскурсии.',
          'Свободное время на острове Робинзон, известном прозрачной бирюзовой водой, красивым пляжем и расслабленной островной атмосферой. Можно плавать, отдыхать на пляже, фотографироваться и любоваться пейзажами залива Нячанг.'
        ]
      },
      vi:{
        title:'Hành trình khám phá đảo Nha Trang tại bãi biển Robinson',
        description:'Khám phá một Nha Trang chân thực bên ngoài các tour đảo quen thuộc: làng chài địa phương, đảo Robinson xinh đẹp, lặn ngắm san hô, câu cá, chèo kayak và thời gian thư giãn bên biển, cùng lựa chọn khám phá hải đăng.',
        itinerary:[
          'Ghé thăm Bích Đầm, một làng chài yên bình trong vịnh Nha Trang, và khám phá nhịp sống ven biển địa phương chân thực. Dạo quanh làng, ngắm những chiếc thuyền đánh cá truyền thống và nhà dân, tận hưởng không khí thanh bình tách biệt khỏi các khu du lịch đông đúc. Hướng dẫn viên sẽ giới thiệu về đời sống địa phương và lịch sử của cộng đồng đảo độc đáo này.',
          'Tùy chọn đi xe máy đến hải đăng Hòn Lớn. Khách chọn hoạt động này sẽ đi xe máy đến hải đăng để ngắm toàn cảnh bờ biển và vịnh Nha Trang. Đây là hoạt động tự chọn và không phù hợp để đi bộ. Thuê xe máy khoảng 6 USD/người và không bao gồm trong giá tour.',
          'Tự do thư giãn trên đảo Robinson, nổi tiếng với làn nước xanh ngọc trong veo, bãi biển đẹp và không khí đảo thư thái. Quý khách có thể bơi, nghỉ ngơi trên bãi biển, chụp ảnh và ngắm cảnh vịnh Nha Trang.'
        ]
      },
      ko:{
        title:'나트랑 아일랜드 호핑: 로빈슨 비치 어드벤처',
        description:'일반적인 섬 투어를 넘어 나트랑의 진짜 매력을 경험하세요. 현지 어촌 마을과 아름다운 로빈슨 섬, 스노클링, 낚시, 카약, 바닷가에서의 여유로운 휴식에 선택 일정인 등대 방문까지 함께 즐길 수 있습니다.',
        itinerary:[
          '나트랑 만의 한적한 어촌 마을 빅담(Bích Đầm)을 방문해 현지 해안의 일상을 경험합니다. 마을을 둘러보며 전통 어선과 가옥을 보고, 붐비는 관광지에서 벗어난 평온한 분위기를 즐겨보세요. 가이드가 현지 주민들의 생활 방식과 이 특별한 섬 공동체의 역사를 소개합니다.',
          '오토바이를 타고 혼론(Hòn Lớn) 등대를 방문하는 선택 일정입니다. 이 활동을 선택한 고객은 오토바이로 등대까지 이동해 해안선과 나트랑 만의 전망을 감상합니다. 등대 방문은 선택 사항이며 도보로 접근하기에는 적합하지 않습니다. 오토바이 대여료는 1인당 약 미화 6달러이며 투어 요금에 포함되지 않습니다.',
          '맑은 청록빛 바다와 아름다운 해변, 여유로운 섬 분위기로 유명한 로빈슨 섬에서 자유 시간을 즐깁니다. 수영, 해변 휴식, 사진 촬영을 하며 나트랑 만의 풍경을 감상할 수 있습니다.'
        ]
      }
    },
    '1287580':{
      en:{
        title:'Hon Mun Marine Park Snorkeling and Nha Trang Island Tour',
        description:'Discover the beauty of Nha Trang’s islands with a well-balanced island-hopping experience. Snorkel in the clear waters of Hon Mun Marine Park, enjoy a delicious local lunch on Hon Mieu Island, and relax at Bai Tranh Beach. This tour combines marine life, island scenery, local food and beach relaxation in one memorable day.',
        itinerary:[
          "Enjoy snorkeling in the crystal-clear waters of Hon Mun Marine Park, one of Nha Trang's best-known marine areas. Explore colorful coral reefs and observe tropical marine life with your guide.",
          'Enjoy a delicious local Vietnamese lunch at a restaurant on Hon Mieu Island. Take a relaxing break and savor a selection of freshly prepared local dishes, including seafood and traditional Vietnamese specialties. This is a great opportunity to recharge after your island activities while enjoying the peaceful island atmosphere and beautiful coastal surroundings.',
          'Relax at Bai Tranh Beach, a beautiful coastal spot in Nha Trang known for its clear turquoise water and scenic surroundings. Enjoy free time to swim, relax on the beach, and take in the peaceful island atmosphere. Guests can also enjoy the beachside scenery and have time to unwind before continuing the island adventure.',
          'Relax at Mini Beach, a charming and peaceful beach surrounded by clear turquoise water and beautiful island scenery. Enjoy free time to swim, sunbathe, take photos, or simply unwind by the sea. This quiet beach offers a relaxing escape and a chance to enjoy the natural beauty of Nha Trang Bay.',
          'Enjoy a relaxing break at Soi Beach, a peaceful coastal spot surrounded by clear blue water and beautiful island scenery. Take some time to swim, unwind by the sea, enjoy the tranquil atmosphere, and capture memorable photos of Nha Trang Bay.',
          'Relax and rejuvenate with a traditional mineral mud bath experience on Hon Tam Island. Soak in natural mineral mud and enjoy a peaceful wellness experience surrounded by beautiful island scenery. After the mud bath, take time to relax and enjoy the facilities before continuing your island adventure.'
        ]
      },
      ru:{
        title:'Снорклинг в морском парке Хон Мун и островной тур по Нячангу',
        description:'Откройте острова Нячанга в сбалансированной однодневной программе: снорклинг в прозрачной воде морского парка Хон Мун, местный обед на острове Хон Мьеу и отдых на пляже Бай Чань. В одной поездке соединены морская природа, островные пейзажи, местная кухня и пляжный отдых.',
        itinerary:[
          'Займитесь снорклингом в кристально чистой воде морского парка Хон Мун — одного из самых известных морских районов Нячанга. Вместе с гидом исследуйте красочные коралловые рифы и наблюдайте за тропической морской жизнью.',
          'Пообедайте блюдами вьетнамской кухни в ресторане на острове Хон Мьеу. Отдохните и попробуйте свежеприготовленные местные блюда, включая морепродукты и традиционные вьетнамские специалитеты. Это удобная пауза после островных активностей в спокойной атмосфере с красивыми видами побережья.',
          'Отдохните на пляже Бай Чань — красивом уголке Нячанга с прозрачной бирюзовой водой и живописными видами. Будет свободное время для купания, отдыха на пляже и спокойной прогулки перед продолжением островного маршрута.',
          'Отдохните на Мини-Бич — небольшом спокойном пляже с прозрачной бирюзовой водой и красивыми островными пейзажами. Можно плавать, загорать, фотографироваться или просто расслабиться у моря и насладиться природой залива Нячанг.',
          'Сделайте спокойную остановку на пляже Бай Сой, окружённом прозрачной голубой водой и островными пейзажами. Можно искупаться, отдохнуть у моря, насладиться тишиной и сделать фотографии залива Нячанг.',
          'Расслабьтесь в традиционных минеральных грязевых ваннах на острове Хон Там. Погрузитесь в натуральную минеральную грязь и отдохните среди островных пейзажей, а после процедуры воспользуйтесь зонами отдыха перед продолжением путешествия.'
        ]
      },
      vi:{
        title:'Lặn ngắm san hô tại Hòn Mun và tour khám phá đảo Nha Trang',
        description:'Khám phá vẻ đẹp các đảo Nha Trang với hành trình cân bằng trong một ngày: lặn ngắm san hô trong làn nước trong xanh của Khu bảo tồn biển Hòn Mun, thưởng thức bữa trưa địa phương tại Hòn Miễu và thư giãn ở Bãi Tranh. Chuyến đi kết hợp sinh vật biển, cảnh đảo, ẩm thực địa phương và nghỉ ngơi trên bãi biển.',
        itinerary:[
          'Lặn ngắm san hô trong làn nước trong vắt của Khu bảo tồn biển Hòn Mun, một trong những vùng biển nổi tiếng nhất Nha Trang. Cùng hướng dẫn viên khám phá các rạn san hô đầy màu sắc và quan sát sinh vật biển nhiệt đới.',
          'Thưởng thức bữa trưa Việt Nam tại nhà hàng trên Hòn Miễu. Nghỉ ngơi và dùng các món địa phương được chế biến tươi, gồm hải sản và những món Việt truyền thống. Đây là khoảng nghỉ lý tưởng sau các hoạt động trên đảo, giữa không khí yên bình và khung cảnh ven biển đẹp.',
          'Thư giãn tại Bãi Tranh, một bãi biển đẹp ở Nha Trang với làn nước xanh ngọc trong veo và cảnh quan nên thơ. Quý khách có thời gian tự do để bơi, nghỉ trên bãi biển và tận hưởng không khí đảo yên bình trước khi tiếp tục hành trình.',
          'Thư giãn tại Mini Beach, một bãi biển nhỏ yên bình được bao quanh bởi làn nước xanh ngọc trong veo và cảnh đảo đẹp. Quý khách có thể bơi, tắm nắng, chụp ảnh hoặc đơn giản nghỉ ngơi bên biển và tận hưởng vẻ đẹp tự nhiên của vịnh Nha Trang.',
          'Nghỉ ngơi tại Bãi Sỏi, một bãi biển yên bình với làn nước xanh trong và cảnh đảo đẹp. Quý khách có thể bơi, thư giãn bên biển, tận hưởng không khí tĩnh lặng và lưu lại những bức ảnh đáng nhớ của vịnh Nha Trang.',
          'Thư giãn và phục hồi với trải nghiệm tắm bùn khoáng truyền thống tại Hòn Tằm. Ngâm mình trong bùn khoáng tự nhiên giữa khung cảnh đảo đẹp, sau đó nghỉ ngơi và sử dụng các tiện ích trước khi tiếp tục hành trình.'
        ]
      },
      ko:{
        title:'혼문 해양공원 스노클링 & 나트랑 아일랜드 투어',
        description:'균형 잡힌 아일랜드 호핑 일정으로 나트랑의 섬들을 만나보세요. 혼문 해양공원의 맑은 바다에서 스노클링을 즐기고, 혼미에우 섬에서 현지식 점심을 맛본 뒤 바이짠 비치에서 휴식합니다. 해양 생태, 섬 풍경, 현지 음식과 해변 휴식을 하루에 경험할 수 있습니다.',
        itinerary:[
          '나트랑의 대표적인 해양 지역인 혼문 해양공원의 맑은 바다에서 스노클링을 즐깁니다. 가이드와 함께 형형색색의 산호초를 탐험하고 열대 해양 생물을 관찰합니다.',
          '혼미에우(Hòn Miễu) 섬의 레스토랑에서 맛있는 베트남 현지식 점심을 즐깁니다. 해산물과 전통 베트남 요리 등 갓 준비한 현지 음식을 맛보며 여유롭게 휴식하세요. 섬 활동 후 평온한 분위기와 아름다운 해안 풍경 속에서 에너지를 충전하기 좋은 시간입니다.',
          '맑은 청록빛 바다와 아름다운 풍경으로 유명한 바이짠(Bãi Tranh) 비치에서 휴식합니다. 수영하거나 해변에서 쉬며 조용한 섬 분위기를 즐길 수 있고, 다음 일정 전 충분히 여유를 가질 수 있습니다.',
          '맑은 청록빛 바다와 아름다운 섬 풍경에 둘러싸인 아늑하고 조용한 미니 비치에서 휴식합니다. 수영, 일광욕, 사진 촬영을 하거나 바닷가에서 느긋하게 쉬며 나트랑 만의 자연을 즐길 수 있습니다.',
          '맑고 푸른 바다와 아름다운 섬 풍경으로 둘러싸인 바이소이(Bãi Sỏi)에서 편안한 휴식을 즐깁니다. 수영하거나 바닷가에서 쉬며 고요한 분위기를 느끼고 나트랑 만의 추억을 사진으로 남겨보세요.',
          '혼땀(Hòn Tằm) 섬에서 전통 미네랄 머드 배스를 즐기며 피로를 풀어보세요. 천연 미네랄 머드에 몸을 담그고 아름다운 섬 풍경 속에서 휴식한 뒤, 시설을 이용하며 여유를 즐기고 다음 일정을 이어갑니다.'
        ]
      }
    }
  };

  const rateTitles={
    '2581224':{en:'Robinson & Bich Dam',ru:'Робинзон и Бич Дам',vi:'Robinson & Bích Đầm',ko:'로빈슨 & 빅담'},
    '2623660':{en:'Robinson & Hon Mun Marine Park',ru:'Робинзон и морской парк Хон Мун',vi:'Robinson & Khu bảo tồn biển Hòn Mun',ko:'로빈슨 & 혼문 해양공원'},
    '2623666':{en:'Robinson & Hon Tam Mud Bath',ru:'Робинзон и грязевые ванны Хон Там',vi:'Robinson & tắm bùn Hòn Tằm',ko:'로빈슨 & 혼땀 머드 배스'},
    '2623667':{en:'Robinson & Tranh Beach',ru:'Робинзон и пляж Бай Чань',vi:'Robinson & Bãi Tranh',ko:'로빈슨 & 바이짠 비치'},
    '2623668':{en:'Robinson & Mini Beach',ru:'Робинзон и Мини-Бич',vi:'Robinson & Mini Beach',ko:'로빈슨 & 미니 비치'},
    '2623669':{en:'Robinson & Soi Beach',ru:'Робинзон и пляж Бай Сой',vi:'Robinson & Bãi Sỏi',ko:'로빈슨 & 바이소이 비치'},
    '2623670':{en:'Robinson & Tri Nguyen Aquarium',ru:'Робинзон и океанариум Три Нгуен',vi:'Robinson & Thủy cung Trí Nguyên',ko:'로빈슨 & 찌응우옌 수족관'},
    '2581227':{en:'Bai Tranh Beach',ru:'Пляж Бай Чань',vi:'Bãi Tranh',ko:'바이짠 비치'},
    '2581226':{en:'Bai Soi Beach',ru:'Пляж Бай Сой',vi:'Bãi Sỏi',ko:'바이소이 비치'},
    '2581229':{en:'Hon Tam Mud Bath',ru:'Грязевые ванны Хон Там',vi:'Tắm bùn Hòn Tằm',ko:'혼땀 머드 배스'},
    '2581228':{en:'Mini Beach',ru:'Мини-Бич',vi:'Mini Beach',ko:'미니 비치'}
  };

  const exact={
    'Standard Viator policy':{
      ru:'Условия отмены',vi:'Chính sách hủy',en:'Cancellation policy',ko:'취소 정책'
    },
    'English':{ru:'Английский',vi:'Tiếng Anh',en:'English',ko:'영어'},
    'Vietnamese':{ru:'Вьетнамский',vi:'Tiếng Việt',en:'Vietnamese',ko:'베트남어'},
    'Russian':{ru:'Русский',vi:'Tiếng Nga',en:'Russian',ko:'러시아어'},
    'Korean':{ru:'Корейский',vi:'Tiếng Hàn',en:'Korean',ko:'한국어'},
    'Hotel name':{ru:'Название отеля',vi:'Tên khách sạn',en:'Hotel name',ko:'호텔 이름'},
    'Room number':{ru:'Номер комнаты',vi:'Số phòng',en:'Room number',ko:'객실 번호'},
    'Private transfer':{ru:'Индивидуальный трансфер',vi:'Xe đưa đón riêng',en:'Private transfer',ko:'프라이빗 픽업'},
    'Bring sunscreen':{ru:'Возьмите солнцезащитный крем',vi:'Mang theo kem chống nắng',en:'Bring sunscreen',ko:'선크림을 준비하세요'},
    'Nha Trang hotels':{ru:'Отели Нячанга',vi:'Khách sạn Nha Trang',en:'Nha Trang hotels',ko:'나트랑 호텔'},
    'required':{ru:'обязательно',vi:'bắt buộc',en:'required',ko:'필수'},
    'WALKING':{ru:'Пешая доступность',vi:'Có thể đi bộ',en:'Walking access',ko:'도보 접근'},
    'индивидуальный':{ru:'индивидуальный',vi:'riêng',en:'private',ko:'프라이빗'},
    'групповой':{ru:'групповой',vi:'nhóm',en:'group',ko:'그룹'},
    'available':{ru:'доступно',vi:'còn chỗ',en:'available',ko:'예약 가능'},
    'full':{ru:'нет мест',vi:'hết chỗ',en:'sold out',ko:'매진'}
  };

  const difficultyMap={
    EASY:{ru:'Лёгкая',vi:'Dễ',en:'Easy',ko:'쉬움'},
    MODERATE:{ru:'Средняя',vi:'Trung bình',en:'Moderate',ko:'보통'},
    CHALLENGING:{ru:'Повышенная',vi:'Khó',en:'Challenging',ko:'어려움'},
    DIFFICULT:{ru:'Сложная',vi:'Khó',en:'Difficult',ko:'어려움'},
    HARD:{ru:'Сложная',vi:'Khó',en:'Hard',ko:'어려움'}
  };

  const meetingMap={
    MEET_ON_LOCATION:{ru:'Самостоятельно к месту начала',vi:'Tự đến điểm bắt đầu',en:'Arrive at the starting point',ko:'출발 지점으로 직접 이동'},
    PICK_UP:{ru:'Трансфер из отеля',vi:'Đón tại khách sạn',en:'Hotel pickup',ko:'호텔 픽업'},
    PICKUP:{ru:'Трансфер из отеля',vi:'Đón tại khách sạn',en:'Hotel pickup',ko:'호텔 픽업'},
    MEET_ON_LOCATION_OR_PICK_UP:{ru:'Самостоятельно или трансфер из отеля',vi:'Tự đến hoặc đón tại khách sạn',en:'Independent arrival or hotel pickup',ko:'직접 이동 또는 호텔 픽업'}
  };

  function locale(){
    const stored=String(localStorage.getItem(STORAGE_KEY)||'').toLowerCase();
    if(SUPPORTED.includes(stored)) return stored;
    const html=String(document.documentElement.lang||'').toLowerCase();
    return SUPPORTED.includes(html)?html:'ru';
  }
  function pick(row,fallback=''){
    return row?.[locale()] ?? row?.en ?? fallback;
  }
  function product(productId){
    return products[String(productId)]?.[locale()] || products[String(productId)]?.en || null;
  }
  function productTitle(productId,fallback=''){
    return product(productId)?.title || fallback;
  }
  function productDescription(productId,fallback=''){
    return product(productId)?.description || fallback;
  }
  function itineraryBody(productId,index,fallback=''){
    return product(productId)?.itinerary?.[Number(index)] || fallback;
  }
  function rateTitle(productId,rateId,fallback=''){
    return pick(rateTitles[String(rateId)],fallback);
  }
  function providerText(value){
    const raw=String(value??'').trim();
    if(!raw) return raw;
    return pick(exact[raw],raw);
  }
  function languageName(value){
    const raw=String(value??'').trim();
    const normalized=raw.toLowerCase().replace('_','-');
    const canonical={
      en:'English','en-gb':'English','en-us':'English','english':'English',
      vi:'Vietnamese','vi-vn':'Vietnamese','vietnamese':'Vietnamese',
      ru:'Russian','ru-ru':'Russian','russian':'Russian',
      ko:'Korean','ko-kr':'Korean','korean':'Korean'
    }[normalized];
    return providerText(canonical||raw);
  }
  function difficulty(value){
    const raw=String(value??'').trim();
    return pick(difficultyMap[raw.toUpperCase()],providerText(raw.replaceAll('_',' ')));
  }
  function meetingType(value){
    const raw=String(value??'').trim().toUpperCase();
    return pick(meetingMap[raw],providerText(raw.replaceAll('_',' ').toLowerCase()));
  }
  function policyTitle(value){
    return providerText(value||'Standard Viator policy');
  }
  function duration(value={}){
    const lang=locale();
    const units={
      ru:{day:['день','дня','дней'],hour:['час','часа','часов'],minute:['минута','минуты','минут']},
      vi:{day:'ngày',hour:'giờ',minute:'phút'},
      en:{day:['day','days'],hour:['hour','hours'],minute:['minute','minutes']},
      ko:{day:'일',hour:'시간',minute:'분'}
    };
    const pluralRu=(n,forms)=>{
      const n10=n%10,n100=n%100;
      return forms[n10===1&&n100!==11?0:(n10>=2&&n10<=4&&(n100<12||n100>14))?1:2];
    };
    const parts=[];
    const nums=[['day',Number(value.days)||0],['hour',Number(value.hours)||0],['minute',Number(value.minutes)||0]];
    for(const [unit,n] of nums){
      if(!n) continue;
      if(lang==='ru') parts.push(n+' '+pluralRu(n,units.ru[unit]));
      else if(lang==='en') parts.push(n+' '+units.en[unit][n===1?0:1]);
      else if(lang==='vi') parts.push(n+' '+units.vi[unit]);
      else parts.push(n+units.ko[unit]);
    }
    if(parts.length) return parts.join(' ');
    const raw=String(value.text||'').trim();
    const hours=raw.match(/^(\d+(?:\.\d+)?)\s*hours?$/i);
    if(hours) return duration({hours:Number(hours[1])});
    return providerText(raw);
  }
  function formatDate(iso,options={weekday:'short',day:'numeric',month:'short'}){
    const raw=String(iso||'');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const date=new Date(raw+'T12:00:00Z');
    return new Intl.DateTimeFormat(intlLocale[locale()],{...options,timeZone:'UTC'}).format(date);
  }
  function ageRange(min,max){
    const a=Number(min),b=Number(max);
    if(!Number.isFinite(a)||!Number.isFinite(b)) return '';
    const lang=locale();
    if(lang==='ru') return a+'–'+b+' лет';
    if(lang==='vi') return a+'–'+b+' tuổi';
    if(lang==='ko') return a+'–'+b+'세';
    return a+'–'+b+' years';
  }
  function minutes(value){
    const n=Number(value);
    if(!Number.isFinite(n)) return '';
    const lang=locale();
    if(lang==='ru') return n+' мин';
    if(lang==='vi') return n+' phút';
    if(lang==='ko') return n+'분';
    return n+' min';
  }
  function serverLocalizationMatches(value){
    const meta=value?.localization;
    return Boolean(meta && meta.locale===locale() && meta.source==='bokun-native');
  }
  function localizeCatalogTour(tour){
    if(!tour||typeof tour!=='object') return tour;
    const id=String(tour.id||'');
    const dynamic=serverLocalizationMatches(tour);
    const next={
      ...tour,
      title:dynamic?tour.title:productTitle(id,tour.title),
      description:dynamic?tour.description:productDescription(id,tour.description),
      duration:tour.duration?duration({text:tour.duration}):tour.duration,
      activity:tour.activity?difficulty(tour.activity):tour.activity,
      languages:Array.isArray(tour.languages)?tour.languages.map(languageName):tour.languages,
      included:Array.isArray(tour.included)?tour.included.map(providerText):tour.included,
      excluded:Array.isArray(tour.excluded)?tour.excluded.map(providerText):tour.excluded,
      formatsLabel:tour.formatsLabel?providerText(tour.formatsLabel):tour.formatsLabel,
    };
    if('shortDescription' in next) next.shortDescription=dynamic?next.shortDescription:productDescription(id,next.shortDescription);
    if(Array.isArray(tour.route)){
      const stopWord={ru:'Остановка',vi:'Điểm',en:'Stop',ko:'코스'}[locale()];
      next.route=tour.route.map((row,index)=>{
        const title=Array.isArray(row)?String(row[0]||''):String(row?.title||'');
        const fallbackBody=Array.isArray(row)?String(row[1]||''):String(row?.body||row?.description||'');
        const localizedBody=dynamic?fallbackBody:itineraryBody(id,index,fallbackBody);
        const localizedTitle=/^Stop\s+\d+$/i.test(title)?stopWord+' '+(index+1):providerText(title);
        return Array.isArray(row)?[localizedTitle,localizedBody]:{...row,title:localizedTitle,body:localizedBody};
      });
    }
    if(tour.group&&typeof tour.group==='object'){
      next.group={...tour.group};
      if(Array.isArray(tour.group.departures)){
        next.group.departures=tour.group.departures.map(item=>({
          ...item,
          date:item?.iso?formatDate(item.iso,{day:'numeric',month:'short'}):item?.date,
          status:providerText(item?.status||'')
        }));
      }
    }
    if(tour.bokun&&typeof tour.bokun==='object'){
      next.bokun={...tour.bokun};
      if(Array.isArray(tour.bokun.rates)){
        next.bokun.rates=tour.bokun.rates.map(rate=>({
          ...rate,
          title:dynamic?(rate?.title||rate?.code||''):rateTitle(id,rate?.id,rate?.title||rate?.code||''),
          description:providerText(rate?.description||'')
        }));
      }
      if(Array.isArray(tour.bokun.pricingCategories)){
        next.bokun.pricingCategories=tour.bokun.pricingCategories.map(item=>{
          const type=String(item?.ticketCategory||'').toUpperCase();
          const title=type==='ADULT'
            ? {ru:'Взрослый',vi:'Người lớn',en:'Adult',ko:'성인'}[locale()]
            : type==='CHILD'
              ? {ru:'Ребёнок',vi:'Trẻ em',en:'Child',ko:'아동'}[locale()]
              : type==='INFANT'
                ? {ru:'Младенец',vi:'Em bé',en:'Infant',ko:'유아'}[locale()]
                : providerText(item?.title||type);
          return {...item,title};
        });
      }
    }
    return next;
  }
  function localizeQuestion(item={}){
    return {
      ...item,
      title:providerText(item.title||item.label||''),
      label:providerText(item.label||item.title||''),
      description:providerText(item.description||item.help||''),
      placeholder:providerText(item.placeholder||''),
      options:Array.isArray(item.options)?item.options.map(option=>({
        ...option,
        label:providerText(option?.label||option?.title||option?.value||'')
      })):item.options
    };
  }

  globalThis.LoveTravelTourLocale={
    SUPPORTED_LOCALES:SUPPORTED.slice(),
    locale,
    productTitle,
    productDescription,
    itineraryBody,
    rateTitle,
    providerText,
    languageName,
    difficulty,
    meetingType,
    policyTitle,
    duration,
    formatDate,
    ageRange,
    minutes,
    localizeCatalogTour,
    localizeQuestion,
    serverLocalizationMatches
  };
})();