export const vehicles=[
 {id:'saloon',name:'Plus Saloon',passengers:4,bags:2,description:'Your everyday ride'},
 {id:'estate',name:'Plus Estate',passengers:4,bags:4,description:'A little more room for luggage'},
 {id:'xl',name:'Plus XL',passengers:6,bags:4,description:'Space for the whole group'},
] as const;
export const money=(pence:number)=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(pence/100);
