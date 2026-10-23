import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
let guide;
before(async()=>{const result=await build({entryPoints:[fileURLToPath(new URL('../web2/src/walkthrough-state.ts',import.meta.url))],bundle:true,write:false,platform:'node',format:'esm'});guide=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));});
const initial={route:'wardrobe',itemExists:false,styleSaves:0,humanRating:false,zeroSelected:0,zeroSolved:false,saved:'',photos:0,coffee:false,wears:'',packed:'[]'};
test('each walkthrough gate rejects navigation/click-only progress and waits for the matching committed outcome',()=>{
 const outcomes=[{route:'item/own_1',itemExists:true},{styleSaves:1},{humanRating:true},{zeroSelected:1,zeroSolved:true},{saved:'saved-valid-look'},{photos:1,coffee:true},{wears:'today-valid-outfit'},{packed:'["coat"]'},{route:'review/coat',itemExists:true}];
 for(let step=0;step<9;step++){assert.equal(guide.objectiveComplete(step,initial,initial),false,'unchanged state '+step);assert.equal(guide.objectiveComplete(step,{...initial,...outcomes[step]},initial),true,'real outcome '+step);}
 assert.equal(guide.objectiveComplete(3,{...initial,zeroSelected:1},initial),false,'zero selection without a solved zero basket');
 assert.equal(guide.objectiveComplete(5,{...initial,coffee:true},initial),false,'viewing saved replay is not a new clothing photo');
 assert.equal(guide.objectiveComplete(5,{...initial,photos:1},initial),false,'photo still needs coffee review');
 assert.equal(guide.objectiveComplete(9,initial,initial),false);
 assert.equal(guide.objectiveComplete(0,{...initial,route:'item/missing'},initial),false,'a guessed missing-item URL does not complete an actual item inspection');
});
test('walkthrough persistence is bounded and invalid completion cannot skip the route',()=>{
 assert.deepEqual(guide.readWalkthrough('{"version":1,"step":5,"status":"paused"}'),{step:5,status:'paused'});
 for(const value of [null,'{}','{"version":1,"step":99,"status":"paused"}','{"version":1,"step":2,"status":"complete"}','{"version":2,"step":8,"status":"complete"}'])assert.deepEqual(guide.readWalkthrough(value),{step:0,status:'paused'});
 assert.deepEqual(guide.readWalkthrough('{"version":1,"step":8,"status":"complete"}'),{step:8,status:'complete'});
});
