import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-employee-session-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json"
};
const BUCKET = "erp-pengaduan-photos";
const MAX_FILES = 5;
const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg","image/png","image/webp"]);

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, serviceKey, { auth: { persistSession:false, autoRefreshToken:false } });

function json(body: unknown, status=200){ return new Response(JSON.stringify(body), { status, headers:cors }); }
function extFor(type:string){ return type==="image/png"?"png":type==="image/webp"?"webp":"jpg"; }

async function employeeId(req:Request){
  const token=(req.headers.get("x-employee-session-token")||"").trim();
  if(!token) return null;
  const {data,error}=await admin.rpc("karyawan_session_id_from_token",{p_token:token});
  if(error||!data) return null;
  return Number(data);
}
async function staffUser(req:Request){
  const auth=req.headers.get("authorization")||"";
  const jwt=auth.toLowerCase().startsWith("bearer ")?auth.slice(7).trim():"";
  if(!jwt) return null;
  const {data:{user},error}=await admin.auth.getUser(jwt);
  if(error||!user) return null;
  const {data:profile}=await admin.from("profiles").select("id,role,aktif").eq("id",user.id).maybeSingle();
  const role=String(profile?.role||"").toLowerCase();
  if(!profile?.aktif||!["owner","spv","svp"].includes(role)) return null;
  return {id:user.id,role};
}
async function ticketForEmployee(ticketId:number,kid:number){
  const {data}=await admin.from("erp_pengaduan").select("id,ticket_no,pelapor_id,status").eq("id",ticketId).eq("pelapor_id",kid).maybeSingle();
  return data;
}
async function ticketForStaff(ticketId:number){
  const {data}=await admin.from("erp_pengaduan").select("id,ticket_no,pelapor_id,status").eq("id",ticketId).maybeSingle();
  return data;
}
async function gallery(ticketId:number){
  const {data,error}=await admin.from("erp_pengaduan_photo")
    .select("id,pengaduan_id,uploaded_by_kind,original_name,mime_type,size_bytes,storage_path,created_at,file_deleted_at,delete_reason")
    .eq("pengaduan_id",ticketId).order("created_at",{ascending:true}).order("id",{ascending:true});
  if(error) throw error;
  const items=[];
  for(const row of data||[]){
    let signed_url:string|null=null;
    if(!row.file_deleted_at){
      const {data:signed,error:signErr}=await admin.storage.from(BUCKET).createSignedUrl(row.storage_path,3600);
      if(!signErr) signed_url=signed?.signedUrl||null;
    }
    items.push({...row,signed_url,deleted:!!row.file_deleted_at});
  }
  return items;
}

Deno.serve(async (req:Request)=>{
  if(req.method==="OPTIONS") return new Response(null,{status:204,headers:cors});
  let uploaded:{path:string,file:File}[]=[];
  let insertedIds:number[]=[];
  let committed=false;
  try{
    const parsed=new URL(req.url);
    const ticketId=Number(parsed.searchParams.get("ticket_id")||0);
    if(!Number.isSafeInteger(ticketId)||ticketId<1) return json({ok:false,reason:"TICKET_REQUIRED"},400);

    const kid=await employeeId(req);
    const staff=kid?null:await staffUser(req);
    if(!kid&&!staff) return json({ok:false,reason:"AUTH_REQUIRED"},401);

    const ticket=kid?await ticketForEmployee(ticketId,kid):await ticketForStaff(ticketId);
    if(!ticket) return json({ok:false,reason:"NOT_FOUND"},404);

    if(req.method==="GET") return json({ok:true,items:await gallery(ticketId)});
    if(req.method!=="POST") return json({ok:false,reason:"METHOD_NOT_ALLOWED"},405);
    if(!kid) return json({ok:false,reason:"EMPLOYEE_UPLOAD_ONLY"},403);
    if(["SELESAI","DITUTUP_OTOMATIS"].includes(String(ticket.status))) return json({ok:false,reason:"TICKET_CLOSED"},409);

    const form=await req.formData();
    const message=String(form.get("message")||"").trim().slice(0,800);
    const files=form.getAll("photos").filter((x):x is File=>x instanceof File);
    if(files.length<1) return json({ok:false,reason:"PHOTO_REQUIRED"},400);
    if(files.length>MAX_FILES) return json({ok:false,reason:"MAX_5_PHOTOS"},400);
    for(const file of files){
      if(!ALLOWED.has(file.type)) return json({ok:false,reason:"PHOTO_TYPE_INVALID",file:file.name},400);
      if(file.size<1||file.size>MAX_SIZE) return json({ok:false,reason:"PHOTO_SIZE_INVALID",file:file.name},400);
    }

    for(const file of files){
      const path=`${ticketId}/${kid}/${Date.now()}-${crypto.randomUUID()}.${extFor(file.type)}`;
      const bytes=new Uint8Array(await file.arrayBuffer());
      const {error}=await admin.storage.from(BUCKET).upload(path,bytes,{contentType:file.type,upsert:false,cacheControl:"3600"});
      if(error) throw error;
      uploaded.push({path,file});
    }

    const rows=uploaded.map(({path,file})=>({
      pengaduan_id:ticketId,
      uploaded_by_kind:"KARYAWAN",
      uploaded_by_karyawan_id:kid,
      storage_bucket:BUCKET,
      storage_path:path,
      original_name:(file.name||"foto").slice(0,180),
      mime_type:file.type,
      size_bytes:file.size
    }));
    const {data:inserted,error:insertErr}=await admin.from("erp_pengaduan_photo").insert(rows).select("id");
    if(insertErr) throw insertErr;
    insertedIds=(inserted||[]).map((x:any)=>Number(x.id));

    const fromStatus=String(ticket.status);
    const toStatus=fromStatus==="MENUNGGU_INFO"?"DALAM_PENANGANAN":fromStatus;
    const {error:updateErr}=await admin.from("erp_pengaduan").update({status:toStatus,updated_at:new Date().toISOString()}).eq("id",ticketId);
    if(updateErr) throw updateErr;

    const names=rows.map(r=>r.original_name);
    const eventMessage=message||`Karyawan mengirim ${rows.length} foto.`;
    const {error:eventErr}=await admin.from("erp_pengaduan_event").insert({
      pengaduan_id:ticketId,
      actor_kind:"KARYAWAN",
      actor_karyawan_id:kid,
      event_type:"EMPLOYEE_REPLY_PHOTO",
      status_from:fromStatus,
      status_to:toStatus,
      message:eventMessage,
      metadata:{photo_ids:insertedIds,photo_count:rows.length,original_names:names}
    });
    if(eventErr) throw eventErr;
    committed=true;

    const {error:notifyErr}=await admin.rpc("erp_pengaduan_notify_staff",{
      p_pengaduan_id:ticketId,
      p_kind:"SVP",
      p_level:"INFO",
      p_title:`Foto dari karyawan · ${ticket.ticket_no}`,
      p_body:message||`Karyawan mengirim ${rows.length} foto untuk pengaduan ini.`
    });
    if(notifyErr) console.warn("notify staff failed",notifyErr);

    return json({ok:true,status:toStatus,count:rows.length,items:await gallery(ticketId)});
  }catch(error){
    console.error(error);
    if(!committed){
      if(insertedIds.length) await admin.from("erp_pengaduan_photo").delete().in("id",insertedIds);
      if(uploaded.length) await admin.storage.from(BUCKET).remove(uploaded.map(x=>x.path));
    }
    return json({ok:false,reason:"SERVER_ERROR",message:String((error as Error)?.message||error)},500);
  }
});