import "dotenv/config";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

/** READ ONLY schema compatibility wrapper for Investor Revised. */
const args=[];
for(let i=2;i<process.argv.length;i++) args.push(process.argv[i]);
const __filename=fileURLToPath(import.meta.url);
const __dirname=path.dirname(__filename);
const runner=path.join(__dirname,"investor-monthly-dataset-yeartrend-readonly.js");

const child=spawn(process.execPath,[runner,...args],{cwd:__dirname,env:process.env,stdio:["ignore","pipe","pipe"]});
let out="",err="";
child.stdout.on("data",d=>out+=d.toString());
child.stderr.on("data",d=>err+=d.toString());
child.on("error",e=>{throw e;});
child.on("close",code=>{
  if(code!==0){console.error(err||out);process.exit(code||1);return;}
  const s=out.indexOf("AUDIT_RESULT_START"),e=out.indexOf("AUDIT_RESULT_END");
  if(s<0||e<0||e<=s){console.error("Year trend collector tidak menghasilkan marker JSON.");process.exit(1);return;}
  try{
    const data=JSON.parse(out.slice(s+"AUDIT_RESULT_START".length,e).trim());
    data.schema="INVESTOR_REVISED_DATASET_V1";
    data.datasetVersion=2;
    data.mode="READ_ONLY";
    data.mainSyncTouched=false;
    data.databaseWrite=false;
    console.log("AUDIT_MODE=READ_ONLY");
    console.log("MAIN_SYNC_TOUCHED=NO");
    console.log("DATABASE_WRITE=NO");
    console.log("YEAR_TREND_SOURCE=MINUTES_LIVE_READ_ONLY");
    console.log("AUDIT_RESULT_START");
    console.log(JSON.stringify(data));
    console.log("AUDIT_RESULT_END");
  }catch(parseErr){
    console.error(`Year trend JSON invalid · ${parseErr.message}`);process.exit(1);
  }
});
