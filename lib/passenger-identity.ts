type AccountIdentity={fullName?:string|null;phone?:string|null}|null;
/** Use the current account, never a stale device draft, for the default passenger. */
export function passengerIdentity(account:AccountIdentity,entered:{name:string;phone:string}){
 const accountName=account?.fullName?.trim()||'',accountPhone=account?.phone?.trim()||'';
 const needsName=accountName.length<2||accountName.length>100;
 const needsPhone=!/^\+?[0-9 ()-]{7,25}$/.test(accountPhone);
 return {name:needsName?entered.name:accountName,phone:needsPhone?entered.phone:accountPhone,needsName,needsPhone};
}
