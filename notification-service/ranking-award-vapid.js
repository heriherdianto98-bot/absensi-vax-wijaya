import fs from 'node:fs';
import path from 'node:path';
import webpush from 'web-push';

const defaultPath=path.join(process.cwd(),'.ranking-award-vapid.json');

export function loadRankingAwardVapid(){
  const fromEnv={
    publicKey:String(process.env.VAPID_PUBLIC_KEY||'').trim(),
    privateKey:String(process.env.VAPID_PRIVATE_KEY||'').trim()
  };
  if(fromEnv.publicKey&&fromEnv.privateKey)return fromEnv;

  const secretFile=String(process.env.RANKING_AWARD_VAPID_FILE||defaultPath);
  try{
    const saved=JSON.parse(fs.readFileSync(secretFile,'utf8'));
    if(saved?.publicKey&&saved?.privateKey)return saved;
  }catch(_){}

  const generated=webpush.generateVAPIDKeys();
  fs.writeFileSync(secretFile,JSON.stringify(generated,null,2),{mode:0o600,flag:'wx'});
  try{fs.chmodSync(secretFile,0o600);}catch(_){}
  return generated;
}
