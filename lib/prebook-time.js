export const PREBOOK_INTERVAL_MINUTES=5;

/** @param {number|Date} when */
export function isPrebookInterval(when){
 const date=when instanceof Date?when:new Date(when);
 return Number.isFinite(date.getTime())&&date.getUTCMinutes()%PREBOOK_INTERVAL_MINUTES===0&&date.getUTCSeconds()===0&&date.getUTCMilliseconds()===0;
}

/** @param {number} minimumMinutes @param {number} [now] */
export function firstPrebookTime(minimumMinutes,now=Date.now()){
 const interval=PREBOOK_INTERVAL_MINUTES*60000;
 return Math.ceil((now+minimumMinutes*60000)/interval)*interval;
}
