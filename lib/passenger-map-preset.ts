/** Passenger presentation presets. Custom administrator styles remain unchanged. */
export function passengerMapPresets(light:string,dark:string){
 const standard=light==='streets-v4'&&['streets-v4','streets-v4-dark'].includes(dark);
 return standard?{light:'basic-v2',dark:'basic-v2-dark'}:{light,dark};
}
