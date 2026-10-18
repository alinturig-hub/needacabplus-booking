import {autocabIso} from '../autocab-time.mjs';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const names=`id rowVersion name telephoneNumber customerEmail customerId customerDisplayName companyId accountCode paymentType paymentMethod bookingType bookingSource bookerName bookerTelephoneNumber bookedById bookedAtTime pickupDueTime pickupDueTimeUtc pickupDueTimeMode expectedPickupDueTime validFromPickupDueTime validToPickupDueTime dispatchDueTime dispatchDueTimeOverride dispatchDueTimeOverrideUtc dropOffTime dropOffTimeUtc pickup destination vias passengers luggage driverNote officeNote ourReference yourReferences capabilities priority priorityOverride prioritySource distance distanceSource distanceFromRouteCalc outOfAreaDeadMileage flight returnFlight returnTime returnBookingType repeatSchedule waitAndReturn hold autoComplete canBeExchanged wasExchanged cabExchange cabExchangeBooking callID counterpartID docketNumber externalBookingReference extraPassengerDetails passengerInformation passengerTimeZone driverConstraints vehicleConstraints rejectedVehicles loyaltyCardId loyaltyCardName travelProgram paymentTransactionReference payByLinkDetails corporateAccountDetails corporateAccountTransactionId hasSpecialAccount releaseCode questionsAndAnswers bookingSuspensions cliOptions igoAgentCommission igoAgentCommissionVat igoVendorServiceCharge igoVendorServiceChargeVat igoVendorVat promotionCodeDiscount stageInfo activeBooking advancedBooking dispatchedBooking exchangedBooking archivedBooking cancelledById chaseCount autoApproveInfo greeterName greeterTelephoneNumber returnWillCall willCall textKeyword passengerReliabilityRating pricing fare cost price accountAmount cashAmount cardAmount extraCost fixedCost fixedPrice chargingAreaCost chargingAreaPrice waitingTime waitingTimeChargeable gratuityAmount costSource pricingTariff pricingSource bookingCost bookingPrice bookingFee cashAccountFee driverCommissionFee dropOffCharge gpsMeterDistance gpsMeterPrice gratuitySettingType gratuitySettingValue isLocked isManual kickbackFeeCommission loyaltyCardCost meterDistance paymentFee paymentTransactions pickUpCharge serviceChargeFee startTariff finishTariff tax waitingTimeCost waitingTimeFree waitingTimePrice archiveTime autoCompleted badgeNumber bookedByCompanyID cancellationInfo completedAtTime completedBy completedByCompanyID dispatchSource dispatchedAtTime driver estimatedPickupTime originalAutoID pickedUpAtTime plateNumber priceComparison reason regNumber systemDistance vehicle vehicleArrivedAtTime address coordinates coordinate latitude longitude zone zoneId note text type completed noFare passengerDetailsIndex visitedTime source house street town postCode bookingPriority priorityAppliesTo descriptor mdtZoneId isEmpty callsign forename surname registration licenceNumber`.split(/\s+/);
const aliases=new Map(names.map(name=>[name.toLowerCase(),name]));
export function normalizeKeys(value){
 if(Array.isArray(value))return value.map(normalizeKeys);
 if(!object(value))return value;
 const result=Object.create(null);
 for(const [key,item] of Object.entries(value))result[aliases.get(key.toLowerCase())??key]=normalizeKeys(item);
 return result;
}
function location(value){
 if(!object(value))return value;
 const normalized=normalizeKeys(value);
 if(typeof normalized.address!=='string')return normalized;
 // Webhook locations are flat; Search uses address.text / address.coordinate.
 const {address,coordinates,zone,...rest}=normalized;
 return {...rest,address:{text:address,...(coordinates!==undefined?{coordinate:coordinates}:{}),...(zone!==undefined?{zone}: {})}};
}
export function webhookDocument(payload,externalId){
 const doc=normalizeKeys(payload);
 // Webhook BookingType is Active/Archived/etc.; Search bookingType is ASAP/Advanced.
 if(Object.hasOwn(payload,'BookingType')){doc.webhookBookingType=payload.BookingType;delete doc.bookingType}
 if(Object.hasOwn(payload,'TypeOfBooking'))doc.bookingType=payload.TypeOfBooking;
 if(object(payload.Company)&&Object.hasOwn(payload.Company,'Id'))doc.companyId=payload.Company.Id;
 if(Object.hasOwn(payload,'Pickup'))doc.pickup=location(payload.Pickup);
 if(Object.hasOwn(payload,'Destination'))doc.destination=location(payload.Destination);
 if(Object.hasOwn(payload,'Vias'))doc.vias=Array.isArray(payload.Vias)?payload.Vias.map(location):payload.Vias;
 // Keep original lifecycle fields too; add the compatible archive subtree only
 // for fields actually supplied by Autocab, never synthetic completion values.
 const archive=Object.create(null);
 for(const key of ['DispatchedAtTime','VehicleArrivedAtTime','PickedUpAtTime','CompletedAtTime']){
  if(Object.hasOwn(payload,key))archive[aliases.get(key.toLowerCase())]=payload[key];
 }
 if(Object.keys(archive).length)doc.archivedBooking=mergeDocument(doc.archivedBooking??{},archive);
 if(!Object.hasOwn(doc,'pickupDueTimeUtc')&&typeof doc.pickupDueTime==='string'){
  const utc=autocabIso(doc.pickupDueTime);if(utc)doc.pickupDueTimeUtc=utc;
 }
 doc.id=String(externalId);
 return doc;
}
export function mergeDocument(previous,patch,fillOnly=false){
 const result=Object.assign(Object.create(null),object(previous)?previous:{});
 for(const [key,value] of Object.entries(patch)){
  if(Object.hasOwn(result,key)){
   if(object(result[key])&&object(value)){result[key]=mergeDocument(result[key],value,fillOnly);continue}
   if(fillOnly)continue; // null, zero and [] are explicit values, not gaps.
  }
  result[key]=value;
 }
 return result;
}
export function documentTimestamp(value){return autocabIso(value)}
