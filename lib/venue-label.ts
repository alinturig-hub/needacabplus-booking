/** Keep a nearby venue distinct from the verified GPS street address. */
export function nearbyVenueLabel(name:string,address:string){
 const venue=name.trim(),street=address.trim();
 if(!venue)return street;
 if(street.toLowerCase().includes(venue.toLowerCase()))return street;
 return street?`Near ${venue}, ${street}`:`Near ${venue}`;
}
