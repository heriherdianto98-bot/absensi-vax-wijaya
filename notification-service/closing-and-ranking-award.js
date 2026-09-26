import { spawnSync } from 'node:child_process';

const args=process.argv.slice(2);
function run(file,passArgs){
  const result=spawnSync(process.execPath,[file,...passArgs],{stdio:'inherit',env:process.env});
  return Number.isInteger(result.status)?result.status:1;
}

const closingStatus=run('setoran-closing-email.js',args);
const awardArgs=args.filter(x=>x==='--dry-run'||x==='--force'||x.startsWith('--date='));
const awardStatus=run('ranking-award-push.js',awardArgs);

if(closingStatus!==0||awardStatus!==0){
  console.error('[ERP VAX Closing + Ranking Award]',{closingStatus,awardStatus});
  process.exitCode=closingStatus!==0?closingStatus:awardStatus;
}
