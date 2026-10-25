export const modelFeatures={membership:{title:'Memberships',tab:'membership'},smart:{title:'Smart Fare',tab:'smart'},promotions:{title:'Promotions & loyalty',tab:'marketing'},services:{title:'Service fares',tab:'fares'},demand:{title:'Demand & timing',tab:'demand'},fares:{title:'Fare sources',tab:'advanced'}} as const;
export type ModelFeature=keyof typeof modelFeatures;
