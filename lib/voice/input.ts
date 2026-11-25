export function voiceInput(text:string,phase:string){
 const value=text.trim().replace(/[.!?]+$/,'').trim();if(/^(yes|yeah|yes please|confirm|that's right|that is right)$/i.test(value))return {intent:'AMAZON.YesIntent'};
 if(/^(no|no thanks|that's wrong|that is wrong)$/i.test(value))return {intent:'AMAZON.NoIntent'};
 if(/^(stop|cancel|cancel booking)$/i.test(value))return {intent:'AMAZON.StopIntent'};
 if(/^(use my (?:current )?location|pick me up here)$/i.test(value))return {intent:'UseLocationIntent'};
 const exclude=/^(?:i (?:don't|do not) want|not)\s+(.+)$/i.exec(value);if(exclude)return {intent:'ExcludeAddressIntent',value:exclude[1]};
 const correction=/^(?:no[, ]+)?(?:i (?:want(?: to go)?|meant|mean)(?: to)?|not|change it to)\s+(.+)$/i.exec(value);if(correction)return {intent:'RefineAddressIntent',value:correction[1]};
 const targeted=/^change (pickup|destination) to\s+(.+)$/i.exec(value);if(targeted)return {intent:targeted[1].toLowerCase()==='pickup'?'CorrectPickupIntent':'CorrectDestinationIntent',value:targeted[2]};
 if(/^(where is my taxi|taxi status|where is my driver)$/i.test(value))return {intent:'TaxiStatusIntent'};
 const booking=/^(?:please\s+)?(?:book(?: me)?|request|get me)\s+(?:a\s+)?(?:taxi|cab)(?:\s+(.+))?$/i.exec(value);if(booking)return {intent:'BookTaxiIntent',journey:booking[1]};
 const pickup=/^(?:pick(?:up| up) is|pick me up from|collect me from|i am at|i'm at)\s+(.+)$/i.exec(value);if(pickup)return {intent:'ProvidePickupIntent',value:pickup[1]};
 const destination=/^(?:take me to|destination is|go to|to)\s+(.+)$/i.exec(value);if(destination)return {intent:'ProvideDestinationIntent',value:destination[1]};
 if(phase==='name')return {intent:'ProvideNameIntent',value:value.replace(/^(?:my name is|passenger name is)\s+/i,'')};
 if(phase==='phone')return {intent:'ProvidePhoneIntent',value:value.replace(/^(?:my phone number is|phone number is)\s+/i,'')};
 if(phase.startsWith('pickup')||phase.startsWith('destination'))return {intent:'ProvideAddressIntent',value};
 return {intent:'AMAZON.HelpIntent'};
}
