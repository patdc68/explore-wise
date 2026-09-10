import assert from 'node:assert/strict';
import test from 'node:test';
import { initialMapPreviewStatus, isFiniteMapCoordinate, mapPreviewLayout } from '../src/services/map-state.ts';
import { buildStages, mapStops, removeStop, selectStop } from '../src/services/itinerary.ts';

test('map state includes numbered sequence coordinates and clears removed stops', () => {
  const state:any={start:{latitude:14.55,longitude:121.05,label:'Start'},budgetMinor:100000,partySize:1,stages:buildStages(['food_talk','activity_fun']),stops:[]};
  const one=selectStop(state,state.stages[0].id,{place_id:'a',name:'Restaurant',latitude:14.56,longitude:121.06,has_price:false} as any); const two=selectStop(one,state.stages[1].id,{place_id:'b',name:'Activity',latitude:14.57,longitude:121.07,has_price:false} as any);
  assert.deepEqual(mapStops(two).map((stop)=>[stop.number,stop.place.place_id]),[[1,'a'],[2,'b']]); assert.ok([state.start,...two.stops.map((stop:any)=>stop.place)].every(isFiniteMapCoordinate)); assert.equal(removeStop(two,state.stages[1].id).stops.length,1); assert.equal(removeStop(two,state.stages[0].id).stops.length,1);
});
test('map layout accepts copied finite primitives and rejects invalid dimensions without an event', () => {
 const initial=initialMapPreviewStatus(); const updated=mapPreviewLayout(initial,360,220);
 assert.deepEqual([updated.width,updated.height],[360,220]); assert.equal(mapPreviewLayout(updated,Number.NaN,220),updated); assert.equal(mapPreviewLayout(updated,360,Number.POSITIVE_INFINITY),updated);
});
