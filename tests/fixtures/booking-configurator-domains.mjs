// Functional contract fixtures, not a presentation model or live product data.
export function configurationDomains(){
  const day=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
  return ['1287578','1287580'].map((id,index)=>({
    schemaVersion:'lovetravel.bokun-domain.v1',provider:{vendorId:137689,productId:id},
    experience:{id,title:index?'Hòn Mun':'Robinson Beach',description:'Configuration acceptance fixture',
      location:{timeZone:'Asia/Ho_Chi_Minh'},booking:{capacityType:'LIMITED'},
      media:{photos:[]},content:{},meeting:{startPoints:[{id:10,title:'Nha Trang Port'}]},
      pickup:{enabled:true,customAllowed:true,places:[{id:501,title:'Fixture Hotel',askForRoomNumber:true,wholeAddress:'Nha Trang'}]},
      dropoff:{enabled:true,customAllowed:true,places:[{id:601,title:'Fixture Return Hotel'}]},
    },
    participants:[
      {id:101,title:'Adult',ticketCategory:'ADULT',minAge:12,maxAge:99},
      {id:102,title:'Child',ticketCategory:'CHILD',minAge:5,maxAge:11},
      {id:103,title:'Infant',ticketCategory:'INFANT',minAge:0,maxAge:4},
    ],
    rates:[201,202].map(rate=>({id:rate,title:'Option '+rate,minPerBooking:2,maxPerBooking:6,pricedPerPerson:true,
      allStartTimes:true,startTimeIds:[],pickup:{selectionType:'OPTIONAL',pricingType:'INCLUDED_IN_PRICE'},
      dropoff:{selectionType:'OPTIONAL',pricingType:'INCLUDED_IN_PRICE'},
      extraConfigs:[{extraId:701,selectionType:'OPTIONAL',pricingType:'PRICED_SEPARATELY',pricedPerPerson:false},{extraId:702,selectionType:'OPTIONAL',pricingType:'PRICED_SEPARATELY',pricedPerPerson:true}],
    })),
    extras:[
      {id:701,title:'Equipment',pricedPerPerson:false,selectionType:'OPTIONAL',pricingType:'PRICED_SEPARATELY',maxPerBooking:5},
      {id:702,title:'Passenger equipment',pricedPerPerson:true,selectionType:'OPTIONAL',pricingType:'PRICED_SEPARATELY',maxPerBooking:5},
    ],
    bookingRequirements:{bookingType:'DATE_AND_TIME',requiredCustomerFields:['firstName','lastName','email','phoneNumber'],
      mainContactFields:[],passengerFields:[{field:'FIRST_NAME',required:true},{field:'LAST_NAME',required:true}],
      questions:[
        {id:'diet',title:'Diet',dataType:'STRING',context:'BOOKING',required:true,options:[{value:'none',label:'None'},{value:'vegetarian',label:'Vegetarian'}]},
        {id:'birth',title:'Birth date',dataType:'DATE',context:'PASSENGER',required:true},
        {id:'weight',title:'Weight',dataType:'NUMBER',context:'PASSENGER',required:true},
        {id:'equipment-size',title:'Equipment size',dataType:'STRING',context:'EXTRA',required:true,extraTriggerSelection:'SELECTED_ONLY',extraTriggers:['701'],options:[{value:'M',label:'M'},{value:'L',label:'L'}]},
        {id:'passenger-equipment-size',title:'Passenger equipment size',dataType:'STRING',context:'EXTRA',required:true,extraTriggerSelection:'SELECTED_ONLY',extraTriggers:['702'],options:[{value:'M',label:'M'},{value:'L',label:'L'}]},
      ],customFields:[{id:'reference',title:'Reference',required:true}],
      cutoff:{hours:0,days:0,weeks:0,minutes:0},
    },
    availabilitySlots:[301,302].map(time=>({id:time+'_'+day,date:day,startTime:time===301?'08:00':'10:00',startTimeId:time,
      availabilityCount:6,unlimitedAvailability:false,soldOut:false,unavailable:false,minParticipants:2,minParticipantsToBookNow:2,
      defaultRateId:201,rates:[{id:201},{id:202}],
      pickup:{availabilityCount:6,soldOut:false},dropoff:{availabilityCount:6,soldOut:false},
      priceQuotesByRate:[201,202].map(rate=>({rateId:rate,participantPrices:[
        {categoryId:101,amount:{amount:rate===201?50:60,currency:'USD'}},
        {categoryId:102,amount:{amount:30,currency:'USD'}},{categoryId:103,amount:{amount:0,currency:'USD'}},
      ],extraPricePerUnit:[{id:701,amount:{amount:5,currency:'USD'}}],
      extraPricePerCategoryUnit:[{extraId:702,prices:[101,102,103].map(categoryId=>({categoryId,amount:{amount:3,currency:'USD'}}))}],
      })),
    })),
  }));
}
