import type{QuotePolicy}from'./quote-policy';
export const pricingFeatureFields:Record<string,(keyof QuotePolicy)[]>={
 details:['quoteValiditySeconds'],
 smart:['smartFareMode','smartFareMinClear','smartFareMaxWaitingRatio','smartFareFreshnessSeconds','demandWindowMinutes'],
 fares:['priorityUpliftMode','lowPercent','priorityFixedAmount','prebookUpliftMode','prebookPercent','prebookFixedAmount','guaranteeUpliftMode','guaranteePercent','guaranteeFixedAmount'],
 membership:['membership'],marketing:['promotions','loyalty'],
 demand:['dynamicPricingEnabled','demandPercent','demandWindowMinutes','dynamicScheduleEnabled','dynamicDays','dynamicStartTime','dynamicEndTime'],
 advanced:['enabled','pricePath','priceUnit','smartFareCapabilities','serviceCapabilities'],
};
