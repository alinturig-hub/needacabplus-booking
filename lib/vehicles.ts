export const vehicles=[
 {id:'saloon',name:'Plus Saloon',passengers:4,bags:2,description:'Your everyday ride',demoPence:1090},
 {id:'estate',name:'Plus Estate',passengers:4,bags:4,description:'A little more room for luggage',demoPence:1290},
 {id:'xl',name:'Plus XL',passengers:6,bags:4,description:'Space for the whole group',demoPence:1590},
] as const;
export const money=(pence:number)=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(pence/100);
