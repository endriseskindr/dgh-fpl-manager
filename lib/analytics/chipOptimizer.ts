import type { EnrichedPlayer, FplFixture, SquadPick } from "../types";
import { projectNextGw } from "./projection";
import { optimizeXI } from "./xiOptimizer";

export type ChipWindow = { gw:number; expectedGain:number; basePoints:number; chipPoints:number; explanation:string };

function fixtureAdjustedProjection(p: EnrichedPlayer, fixtures:FplFixture[], gw:number) {
  const own=fixtures.filter(f=>f.event===gw && (f.team_h===p.teamId || f.team_a===p.teamId));
  if (!own.length) return 0;
  return own.reduce((sum,f)=>{ const home=f.team_h===p.teamId; const fdr=home?f.team_h_difficulty:f.team_a_difficulty; const adj=1+Math.max(-0.2,Math.min(0.24,(3-fdr)*0.08)); return sum+projectNextGw(p)*adj; },0);
}

function bestFreeHitSquad(pool:EnrichedPlayer[], fixtures:FplFixture[], gw:number, budget:number) {
  const selected:EnrichedPlayer[]=[]; const clubCount=new Map<number,number>(); let spent=0;
  for(const pos of ["GKP","DEF","MID","FWD"] as const){
    const need=pos==="GKP"?2:pos==="DEF"?5:pos==="MID"?5:3;
    const candidates=pool.filter(p=>p.position===pos && p.status!=="u" && p.status!=="i").map(p=>({p,score:fixtureAdjustedProjection(p,fixtures,gw)})).sort((a,b)=>b.score-a.score);
    for(const c of candidates){ if(selected.filter(x=>x.position===pos).length>=need) break; const count=clubCount.get(c.p.teamId)||0; if(count>=3 || spent+c.p.price>budget) continue; selected.push(c.p); spent+=c.p.price; clubCount.set(c.p.teamId,count+1); }
  }
  return selected.length===15?selected:null;
}

function toPicks(players:EnrichedPlayer[]):SquadPick[] { return players.map((p,i)=>({playerId:p.id,player:p,slot:i+1,isXI:i<11,isBench:i>=11,benchOrder:i>=11?i-10:null,multiplier:i===0?2:1,isCaptain:i===0,isViceCaptain:i===1,livePoints:0})); }

export function optimizeChipWindow(input:{chip:"wildcard"|"freehit"|"bboost"|"3xc"; gw:number; currentSquad:SquadPick[]; pool:EnrichedPlayer[]; fixtures:FplFixture[]; budget:number}):ChipWindow {
  const currentXI=optimizeXI(input.currentSquad); const base=input.currentSquad.reduce((s,p)=>s+fixtureAdjustedProjection(p.player,input.fixtures,input.gw),0);
  const currentXIAdjusted=currentXI.startingXI.reduce((s,p)=>s+fixtureAdjustedProjection(p.player,input.fixtures,input.gw),0);
  if(input.chip==="bboost") { const bench=input.currentSquad.filter(p=>!currentXI.startingXI.some(x=>x.playerId===p.playerId)); const chipPoints=currentXIAdjusted+bench.reduce((s,p)=>s+fixtureAdjustedProjection(p.player,input.fixtures,input.gw),0); return {gw:input.gw,basePoints:currentXIAdjusted,chipPoints,expectedGain:chipPoints-currentXIAdjusted,explanation:`Current squad XI + bench across ${new Set(input.currentSquad.map(p=>p.player.teamId)).size} clubs; ${bench.length} bench players contribute.`}; }
  if(input.chip==="3xc") { const captain=currentXI.startingXI.map(p=>({p,score:fixtureAdjustedProjection(p.player,input.fixtures,input.gw)})).sort((a,b)=>b.score-a.score)[0]; const chipPoints=currentXIAdjusted+(captain?.score??0)*2; return {gw:input.gw,basePoints:currentXIAdjusted,chipPoints,expectedGain:captain?.score??0,explanation:captain?`${captain.p.player.webName} has the highest fixture-adjusted captain projection for this window.`:"No viable captain."}; }
  const best=bestFreeHitSquad(input.pool,input.fixtures,input.gw,input.budget); if(!best) return {gw:input.gw,basePoints:currentXIAdjusted,chipPoints:currentXIAdjusted,expectedGain:0,explanation:"No legal 15-player squad found within the current budget and club limits."};
  const bestPicks=toPicks(best); const bestXI=optimizeXI(bestPicks); const chipPoints=bestXI.startingXI.reduce((s,p)=>s+fixtureAdjustedProjection(p.player,input.fixtures,input.gw),0); return {gw:input.gw,basePoints:currentXIAdjusted,chipPoints,expectedGain:chipPoints-currentXIAdjusted,explanation:`Optimized ${input.chip==="wildcard"?"squad": "free-hit XI"} under budget, position and 3-per-club constraints.`};
}
