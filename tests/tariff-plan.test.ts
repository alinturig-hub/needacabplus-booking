import assert from 'node:assert/strict';
import {test} from 'node:test';
import {calculateTariffPlan,defaultTariffPlan,newTariffRule,tariffPlanSchema} from '../lib/tariff-plan';

const trip={vehicle:'saloon' as const,miles:5,waitingMinutes:0,pickupZone:'Plymouth',destinationZone:'Exeter',pickupLocal:'2026-10-15T12:00'};

test('distance bands charge only miles within each band',()=>{
 const plan={...defaultTariffPlan,distanceBands:[{id:crypto.randomUUID(),toMiles:2,perMilePence:100},{id:crypto.randomUUID(),toMiles:null,perMilePence:200}]};
 assert.equal(tariffPlanSchema.safeParse(plan).success,true);
 const result=calculateTariffPlan(plan,trip);
 assert.equal(result.distancePence,800);
 assert.equal(result.totalPence,1100);
});

test('vehicle rules can change the starting fare and mileage independently',()=>{
 const start={...newTariffRule('vehicle'),name:'Estate start',vehicle:'estate' as const,target:'start' as const,value:200};
 const distance={...newTariffRule('vehicle'),name:'Estate mileage',vehicle:'estate' as const,target:'distance' as const,value:50};
 const plan={...defaultTariffPlan,rules:[start,distance]};
 assert.equal(calculateTariffPlan(plan,trip).totalPence,1200);
 const estate=calculateTariffPlan(plan,{...trip,vehicle:'estate'});
 assert.equal(estate.totalPence,1650);
 assert.deepEqual(estate.lines.map(line=>line.amountPence),[200,250]);
});

test('discounts apply to the original components and the minimum is the final floor',()=>{
 const discount={...newTariffRule('custom'),name:'Half off',direction:'subtract' as const,mode:'percent' as const,target:'total' as const,value:50};
 const plan={...defaultTariffPlan,rules:[discount]};
 const result=calculateTariffPlan(plan,{...trip,miles:1});
 assert.equal(result.basePence,480);
 assert.equal(result.lines[0].amountPence,-240);
 assert.equal(result.minimumAdjustmentPence,360);
 assert.equal(result.totalPence,600);
});

test('overnight time rule matches the following morning only',()=>{
 const night={...newTariffRule('schedule'),name:'Friday night',days:[5],startTime:'22:00',endTime:'06:00',value:200};
 const plan={...defaultTariffPlan,rules:[night]};
 assert.equal(calculateTariffPlan(plan,{...trip,pickupLocal:'2026-10-16T23:00'}).lines.length,1);
 assert.equal(calculateTariffPlan(plan,{...trip,pickupLocal:'2026-10-17T05:00'}).lines.length,1);
 assert.equal(calculateTariffPlan(plan,{...trip,pickupLocal:'2026-10-17T07:00'}).lines.length,0);
});

test('zone conditions and percentage targets work together',()=>{
 const airport={...newTariffRule('zone'),name:'Airport uplift',eitherZone:'EXETER AIRPORT',mode:'percent' as const,target:'both' as const,value:10};
 const plan={...defaultTariffPlan,rules:[airport]};
 assert.equal(calculateTariffPlan(plan,trip).lines.length,0);
 const result=calculateTariffPlan(plan,{...trip,destinationZone:'Exeter Airport'});
 assert.equal(result.basePence,1200);
 assert.equal(result.lines[0].amountPence,120);
 assert.equal(result.totalPence,1320);
});

test('weekday selection works without a time range',()=>{
 const weekday={...newTariffRule('schedule'),name:'Friday uplift',days:[5],value:100};
 const plan={...defaultTariffPlan,rules:[weekday]};
 assert.equal(calculateTariffPlan(plan,{...trip,pickupLocal:'2026-10-16T12:00'}).lines.length,1);
 assert.equal(calculateTariffPlan(plan,{...trip,pickupLocal:'2026-10-17T12:00'}).lines.length,0);
});

test('waiting charges each started minute after the free allowance, on top of the minimum fare',()=>{
 const plan={...defaultTariffPlan,waiting:{freeMinutes:2,perMinutePence:50}};
 assert.equal(calculateTariffPlan(plan,{...trip,miles:0,waitingMinutes:2}).totalPence,600);
 const result=calculateTariffPlan(plan,{...trip,miles:0,waitingMinutes:3.2});
 assert.equal(result.chargeableMinutes,2);
 assert.equal(result.waitingPence,100);
 assert.equal(result.totalPence,700);
});

test('waiting rules can change the charge for one vehicle',()=>{
 const rule={...newTariffRule('waiting'),name:'XL waiting',vehicle:'xl' as const,value:25};
 const plan={...defaultTariffPlan,waiting:{freeMinutes:1,perMinutePence:50},rules:[rule]};
 assert.equal(calculateTariffPlan(plan,{...trip,waitingMinutes:3}).totalPence,1300);
 const xl=calculateTariffPlan(plan,{...trip,vehicle:'xl',waitingMinutes:3});
 assert.equal(xl.waitingPence,100);
 assert.equal(xl.waitingTotalPence,150);
 assert.equal(xl.totalPence,1350);
});

test('plans saved before waiting was added receive a zero waiting default',()=>{
 const previous={...defaultTariffPlan,waiting:undefined};
 const parsed=tariffPlanSchema.parse(previous);
 assert.deepEqual(parsed.waiting,{freeMinutes:0,perMinutePence:0});
});

test('bad thresholds and inverted date ranges cannot be saved',()=>{
 const bad={...newTariffRule('date'),startDate:'2026-12-31',endDate:'2026-01-01'};
 assert.equal(tariffPlanSchema.safeParse({...defaultTariffPlan,rules:[bad]}).success,false);
 assert.equal(tariffPlanSchema.safeParse({...defaultTariffPlan,distanceBands:[{id:crypto.randomUUID(),toMiles:10,perMilePence:100}]}).success,false);
});
