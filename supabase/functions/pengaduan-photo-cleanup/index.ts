import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const headers={"Content-Type":"application/json"};
const BUCKET="erp-pengaduan-photos";
const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});

Deno.serve(async(req:Request)=>{
  try{
    const provided=(req.headers.get("x-erp-cleanup-token")||"").trim();
    const {data:secretRow,error:secretErr}=await admin.from("erp_internal_job_secrets").select("secret").eq("job_name","pengaduan_photo_cleanup").maybeSingle();
    if(secretErr||!secretRow?.secret||provided!==secretRow.secret){
      return new Response(JSON.stringify({ok:false,reason:"UNAUTHORIZED"}),{status:401,headers});
    }

    const cutoff=new Date(Date.now()-40*24*60*60*1000).toISOString();
    const {data:rows,error}=await admin.from("erp_pengaduan_photo")
      .select("id,storage_path,pengaduan_id,created_at")
      .is("file_deleted_at",null)
      .lte("created_at",cutoff)
      .order("created_at",{ascending:true})
      .limit(500);
    if(error) throw error;
    if(!rows?.length) return new Response(JSON.stringify({ok:true,deleted:0,cutoff}),{headers});

    const paths=rows.map(r=>r.storage_path);
    const {error:removeErr}=await admin.storage.from(BUCKET).remove(paths);
    if(removeErr) throw removeErr;

    const ids=rows.map(r=>r.id);
    const {error:updateErr}=await admin.from("erp_pengaduan_photo")
      .update({file_deleted_at:new Date().toISOString(),delete_reason:"AUTO_RETENTION_40_DAYS"})
      .in("id",ids);
    if(updateErr) throw updateErr;

    return new Response(JSON.stringify({ok:true,deleted:ids.length,cutoff}),{headers});
  }catch(error){
    console.error(error);
    return new Response(JSON.stringify({ok:false,reason:"SERVER_ERROR",message:String((error as Error)?.message||error)}),{status:500,headers});
  }
});