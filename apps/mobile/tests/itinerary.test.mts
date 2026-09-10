import assert from 'node:assert/strict';
import test from 'node:test';
import { addUserStage, areRequiredStagesComplete, buildStages, finalizeItinerary, MAX_ITINERARY_STOPS, nextStageOrigin, remainingBudget, removeStop, removeUserStage, selectStop, selectedTotals, stageBudget, stageOrigin } from '../src/services/itinerary.ts';
import { formatPhp, parsePhpToMinor } from '../src/services/money.ts';

const place = (id: string, latitude: number, priced = true) => ({ place_id:id,name:id,latitude,longitude:121,has_price:priced,estimated_group_min_minor:priced?10000:null,estimated_group_max_minor:priced?15000:null } as any);
test('selected stage changes next-stage origin and calculates remaining budget', () => {
 const state:any={start:{latitude:14.5,longitude:121,label:'BGC'},budgetMinor:300000,partySize:4,stages:buildStages(['food_talk','activity_fun']),stops:[]};
 const selected=selectStop(state,state.stages[0].id,place('Food',14.55));
 assert.equal(nextStageOrigin(selected).latitude,14.55); assert.deepEqual(remainingBudget(selected),{minAmountMinor:10000,maxAmountMinor:15000,uncertain:false,knownStopCount:1,unknownStopCount:0,optimisticMinor:290000,conservativeMinor:285000}); assert.equal(stageBudget(selected,1),285000);
});
test('unknown selection propagates budget uncertainty',()=>{const state:any={start:{latitude:1,longitude:2,label:'Start'},budgetMinor:10000,partySize:1,stages:buildStages(['discovery']),stops:[]};assert.equal(remainingBudget(selectStop(state,state.stages[0].id,place('Unknown',1,false))).conservativeMinor,null);});
test('PHP amounts remain minor units and are formatted exactly once', () => {
  for (const [input, minor] of [['15', 1500], ['150', 15000], ['1500', 150000], ['2500', 250000], ['3000', 300000], ['2k', 200000], ['2.5k', 250000], ['3k', 300000], ['₱1,500', 150000], ['PHP 1500', 150000]] as const) assert.equal(parsePhpToMinor(input), minor);
  assert.equal(formatPhp(150000), '₱1,500');
  const state:any={start:{latitude:1,longitude:2,label:'Start'},budgetMinor:150000,partySize:1,stages:buildStages(['food_talk','activity_fun']),stops:[]}; const selected=selectStop(state,state.stages[0].id,{...place('Food',1),estimated_group_min_minor:50000,estimated_group_max_minor:50000});
  assert.equal(formatPhp(remainingBudget(selected).conservativeMinor!), '₱1,000');
});
test('required stages block review after only a restaurant and become incomplete after removal', () => { const state:any={start:{latitude:1,longitude:2,label:'Start'},budgetMinor:150000,partySize:1,stages:buildStages(['food_talk','activity_fun']),stops:[]}; const food=selectStop(state,state.stages[0].id,place('Food',1)); assert.equal(areRequiredStagesComplete(food),false); const complete=selectStop(food,state.stages[1].id,place('Fun',2)); assert.equal(areRequiredStagesComplete(complete),true); assert.equal(areRequiredStagesComplete(removeStop(complete,state.stages[1].id)),false); });
test('unknown-only prices stay unknown while explicit free pricing stays grounded at zero', () => {
 const state:any={start:{latitude:1,longitude:2,label:'Start'},budgetMinor:150000,partySize:1,stages:buildStages(['food_talk','activity_fun']),stops:[]};
 const unknown=selectStop(selectStop(state,state.stages[0].id,place('Unknown food',1,false)),state.stages[1].id,place('Unknown activity',2,false));
 assert.deepEqual(selectedTotals(unknown.stops),{minAmountMinor:0,maxAmountMinor:0,uncertain:true,knownStopCount:0,unknownStopCount:2});
 const free=selectStop(state,state.stages[0].id,{...place('Grounded free place',1),estimated_group_min_minor:0,estimated_group_max_minor:0});
 assert.deepEqual(selectedTotals(free.stops),{minAmountMinor:0,maxAmountMinor:0,uncertain:false,knownStopCount:1,unknownStopCount:0});
});
test('user-added stages append from the preceding stop, can be removed alone, and respect the maximum', () => {
 const initial:any={start:{latitude:1,longitude:2,label:'Start'},budgetMinor:150000,partySize:1,stages:buildStages(['food_talk','activity_fun']),stops:[]};
 const food=selectStop(initial,initial.stages[0].id,place('Food',10)); const activity=selectStop(food,initial.stages[1].id,place('Activity',20));
 const withDessert=addUserStage(activity,'dessert'); const dessert=withDessert.stages.at(-1)!;
 assert.equal(dessert.source,'user_added'); assert.equal(stageOrigin(withDessert,2).latitude,20);
 const selectedDessert=selectStop(withDessert,dessert.id,place('Dessert',30));
 const removed=removeUserStage(selectedDessert,dessert.id); assert.deepEqual(removed.stops.map((stop:any)=>stop.place.name),['Food','Activity']); assert.equal(removed.stages.length,2);
 let capped=initial; for(let i=0;i<MAX_ITINERARY_STOPS;i+=1) capped=addUserStage(capped,'dessert');
 assert.equal(capped.stages.length,MAX_ITINERARY_STOPS); assert.equal(addUserStage(capped,'outdoor').stages.length,MAX_ITINERARY_STOPS);
});

test('finalized three-stop itineraries preserve their selections and reject all editing mutations', () => {
 const base:any={start:{latitude:1,longitude:2,label:'Start'},budgetMinor:150000,partySize:1,stages:buildStages(['food_talk','activity_fun']),stops:[]};
 const withEntertainment=addUserStage(base,'entertainment');
 const selected=withEntertainment.stages.reduce((current:any, stage:any, index:number)=>selectStop(current,stage.id,place(['Dinner','Something fun','Entertainment'][index]!,index+1)),withEntertainment);
 const finalized=finalizeItinerary(selected);
 assert.equal(finalized.finalized,true); assert.equal(finalizeItinerary(finalized),finalized);
 assert.deepEqual(selectStop(finalized,finalized.stages[0].id,place('Replacement',9)).stops,finalized.stops);
 assert.deepEqual(removeStop(finalized,finalized.stages[0].id).stops,finalized.stops);
 assert.equal(addUserStage(finalized,'dessert').stages.length,3);
 assert.equal(removeUserStage(finalized,finalized.stages[2].id).stages.length,3);
});
