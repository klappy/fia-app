import {canonicalSourceOrder,matchesSchema} from '../compiler/presentation/source-action-projector.mjs';
import schema from '../compiler/presentation/source-action-input.schema.json' with {type:'json'};
import {canonicalJSONString} from './contract.mjs';
const need=(v,r)=>{if(!v)throw Error(r)};
// First-stage semantic questions only. No lexical cue detection, kind inference,
// requested-medium slots, explicit answers, resource selection or provider calls.
export async function inspectCueRoleQuestions(c){
 need(await canonicalSourceOrder(c.canonicalUnits)===c.canonicalOrderSha256,'cue-question-source-order');
 need(c.canonicalUnits.length<=256,'cue-question-envelope');
 const questions=[],unsupported=[],excluded=[];
 for(const u of c.canonicalUnits){
  const activities=c.basePresentation.activities.filter(a=>a.sourceUnitId===u.sourceUnitId&&a.fulfills==null);
  if(activities.length!==1){
   const anchor=(({text,...value})=>value)(u),examples=(c.basePresentation.examples??[]).filter(e=>e.id===u.sourceUnitId),coverage=(c.basePresentation.coverage??[]).filter(e=>e.id===u.sourceUnitId);
   if(activities.length===0&&examples.length===1&&coverage.length===1&&examples[0].text===u.text&&examples[0].sha256===u.sourceTextSha256&&coverage[0].treatment==='optional-example'&&coverage[0].textSha256===u.sourceTextSha256){excluded.push({sourceAnchor:anchor,sourceText:u.text,reason:'reviewed-optional-example'});continue;}
   unsupported.push({sourceAnchor:anchor,sourceText:u.text,reason:'cue-question-primary-anchor',activityIds:activities.map(a=>a.id)});continue;
  }const a=activities[0];
  need(a.sectionId===u.sectionId&&(a.sourceText===undefined||a.sourceText===u.text)&&(a.sourceSha256??a.sourceTextSha256)===u.sourceTextSha256,'cue-question-primary-source');
  // Role-only classification requires source text, not unrelated resource HTML.
  const candidates=[];
  const {text,...sourceAnchor}=u;
  const input={contract:'fia-source-action-input@1',packId:c.basePresentation.id,presentationRevision:c.baseRevision,sourceRevision:c.sourceRevision,guideContentSha256:c.guideContentSha256,language:c.language,source:{unitId:u.sourceUnitId,text,sha256:u.sourceTextSha256},context:[],requestedDecisions:['cue-roles'],candidates,explicitAssociations:[],sourceAnchor,canonicalOrderSha256:c.canonicalOrderSha256,existingActivityBindings:[{activityId:a.id,sourceUnitId:u.sourceUnitId,sourceTextSha256:u.sourceTextSha256,sectionId:u.sectionId}],intentSlots:[]};
  let bounded=false;try{bounded=matchesSchema(input,schema)&&new TextEncoder().encode(canonicalJSONString(input)).length<=8192;}catch{}
  if(!bounded){unsupported.push({sourceAnchor,sourceText:text,reason:'cue-question-input-envelope',activityIds:[a.id]});continue;}questions.push({input});
 }
 return {questions,unsupported,excluded};
}

export async function composeCueRoleQuestions(c){const report=await inspectCueRoleQuestions(c);if(report.unsupported.length)throw Error('cue-question-unresolved-source');return report.questions;}
