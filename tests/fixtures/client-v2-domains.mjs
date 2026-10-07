const localeText={
  ru:{one:'Островное приключение Robinson Beach',two:'Снорклинг Hòn Mun',description:'Островная экскурсия в Нячанге.'},
  en:{one:'Robinson Beach Island Adventure',two:'Hòn Mun Snorkeling',description:'Island experience in Nha Trang.'},
  vi:{one:'Khám phá Robinson Beach',two:'Lặn ngắm san hô Hòn Mun',description:'Trải nghiệm biển đảo tại Nha Trang.'},
  zh:{one:'Robinson Beach 海岛之旅',two:'Hòn Mun 浮潜',description:'芽庄海岛体验。'},
  ko:{one:'Robinson Beach 아일랜드 투어',two:'Hòn Mun 스노클링',description:'나트랑 섬 투어입니다.'},
};

function amount(value){return {amount:value,currency:'USD'};}

function domain({id,title,photo,rateBaseId,second=false,locale='ru'}){
  const text=localeText[locale]||localeText.ru;
  const firstRate=rateBaseId;
  const secondRate=rateBaseId+1;
  const dayOne=id==='1287578'?'2026-10-10':'2026-10-11';
  const dayTwo=id==='1287578'?'2026-10-12':'2026-10-13';
  return {
    schemaVersion:'lovetravel.bokun-domain.v1',
    source:'bokun',
    provider:{vendorId:137689,productId:id},
    experience:{
      id,
      title,
      description:text.description,
      category:'DAY_TOUR_OR_ACTIVITY',
      location:{city:locale==='zh'?'芽庄':'Nha Trang',country:'VN',timeZone:'Asia/Ho_Chi_Minh'},
      duration:{hours:7,text:'7 hours'},
      minAge:5,
      languages:{raw:[{name:'English'}],guidanceTypes:[{displayLanguages:['English','Vietnamese']}]},
      content:{
        included:'<ul><li>Lunch</li><li>Snorkeling equipment</li></ul>',
        inclusions:[],
        excluded:'Personal expenses',
        exclusions:[],
        requirements:'Bring swimwear',
        attention:'Route may change with sea conditions',
        dressCode:'Beachwear',
        knowBeforeYouGoItems:[{title:'Bring a photo ID'}],
      },
      itinerary:[
        {title:'Harbour',body:'Meet the local team and depart.'},
        {title:second?'Hòn Mun':'Robinson Beach',body:'Main island experience.'},
        {title:'Return',body:'Return to Nha Trang.'},
      ],
      media:{photos:[{url:photo},{url:photo.replace('1.svg','2.svg')}],videos:[]},
      meeting:{startPoints:[{title:'Nha Trang Tourist Port'}]},
      pickup:{
        enabled:true,
        customAllowed:true,
        placeGroups:[{id:1,title:'Nha Trang hotels'}],
        places:[],
        noPickupMessage:'',
      },
      dropoff:{enabled:false,places:[]},
      accessibility:['Limited mobility assistance on request'],
      ticket:{message:'Show mobile voucher'},
      reviews:{count:0,rating:0},
      paymentCurrencies:['USD'],
    },
    participants:[
      {id:1,title:'Adult',ticketCategory:'ADULT'},
      {id:2,title:'Child',ticketCategory:'CHILD'},
    ],
    rates:[
      {id:firstRate,title:second?'Shared snorkeling':'Robinson standard',description:'',details:[],textItems:[],media:{photos:[]}},
      {id:secondRate,title:second?'Private snorkeling':'Robinson + Bích Đầm',description:'',details:[],textItems:[],media:{photos:[]}},
    ],
    extras:[],
    offers:[],
    bookingRequirements:{
      questions:[],
      requiredCustomerFields:['firstName','lastName','email','phone'],
      mainContactFields:['email','phone'],
      passengerFields:[],
      customFields:[],
    },
    cancellationPolicy:{
      title:'24 hour cancellation policy',
      policyType:'ADVANCED',
      penaltyRules:[
        {cutoffHours:24,charge:100,chargeType:'percentage',percentage:100},
        {cutoffHours:24000,charge:0,chargeType:'percentage',percentage:0},
      ],
    },
    availabilitySlots:[
      {
        id:id+'_'+dayOne.replaceAll('-',''),
        productId:id,
        date:dayOne,
        startTime:'08:00',
        defaultRateId:firstRate,
        availabilityCount:8,
        unlimitedAvailability:false,
        soldOut:false,
        unavailable:false,
        rates:[
          {id:firstRate,title:second?'Shared snorkeling':'Robinson standard',description:'',details:[],textItems:[{title:'Program',description:'Main island program'}],media:{photos:[]}},
          {id:secondRate,title:second?'Private snorkeling':'Robinson + Bích Đầm',description:'',details:[],textItems:[{title:'Program',description:'Bích Đầm fishing village extension'}],media:{photos:[]}},
        ],
        priceQuotesByRate:[
          {rateId:firstRate,participantPrices:[{categoryId:1,amount:amount(second?35:30)},{categoryId:2,amount:amount(second?20:15)}]},
          {rateId:secondRate,participantPrices:[{categoryId:1,amount:amount(second?70:45)},{categoryId:2,amount:amount(second?40:25)}]},
        ],
      },
      {
        id:id+'_'+dayTwo.replaceAll('-',''),
        productId:id,
        date:dayTwo,
        startTime:'09:00',
        defaultRateId:secondRate,
        availabilityCount:5,
        unlimitedAvailability:false,
        soldOut:false,
        unavailable:false,
        rates:[
          {id:secondRate,title:second?'Private snorkeling':'Robinson + Bích Đầm',description:'',details:[],textItems:[{title:'Program',description:'Bích Đầm fishing village extension'}],media:{photos:[]}},
        ],
        priceQuotesByRate:[
          {rateId:secondRate,participantPrices:[{categoryId:1,amount:amount(second?72:47)},{categoryId:2,amount:amount(second?42:27)}]},
        ],
      },
    ],
    coverage:{product:{nonEmptyUnmappedTopLevelFields:[]},rawPreserved:true},
  };
}

export function fixturePayload(locale='ru'){
  const text=localeText[locale]||localeText.ru;
  return {
    ok:true,
    schema:'lovetravel.client-v2.preview.v1',
    source:'fixture',
    vendorId:'137689',
    productIds:['1287578','1287580'],
    fetchedAt:'2026-10-07T00:00:00.000Z',
    domains:[
      domain({id:'1287578',title:text.one,photo:'/fixture/robinson-1.svg',rateBaseId:101,locale}),
      domain({id:'1287580',title:text.two,photo:'/fixture/honmun-1.svg',rateBaseId:201,second:true,locale}),
    ],
  };
}
