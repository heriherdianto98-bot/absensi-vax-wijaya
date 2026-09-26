import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-employee-session-token","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Content-Type":"application/json"};
const BUCKET="erp-pengaduan-photos";
const REPLY_MAX_FILES=5, REPLY_MAX_SIZE=5*1024*1024;
const INITIAL_MAX_PHOTOS=3, INITIAL_MAX_VIDEOS=1, INITIAL_PHOTO_MAX=2*1024*1024, INITIAL_VIDEO_MAX=8*1024*1024, INITIAL_TOTAL_MAX=12*1024*1024;
const IMAGE_TYPES=new Set(["image/jpeg","image/png","image/webp"]);
const VIDEO_TYPES=new Set(["video/mp4","video/webm","video/quicktime"]);
const ALL_TYPES=new Set([...IMAGE_TYPES,...VIDEO_TYPES]);
const url=Deno.env.get("SUPABASE_URL")!;
const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:cors});}
function extFor(type:string){if(type==="image/png")return"png";if(type==="image/webp")return"webp";if(type==="video/mp4")return"mp4";if(type==="video/webm")return"webm";if(type==="video/quicktime")return"mov";return"jpg";}
async function employeeId(req:Request){const token=(req.headers.get("x-employee-session-token")||"").trim();if(!token)return null;const {data,error}=await admin.rpc("karyawan_session_id_from_token",{p_token:token});if(error||!data)return null;return Number(data);}
async function staffUser(req:Request){const auth=req.headers.get("authorization")||"";const jwt=auth.toLowerCase().startsWith("bearer ")?auth.slice(7).trim():"";if(!jwt)return null;const {data:{user},error}=await admin.auth.getUser(jwt);if(error||!user)return null;const {data:profile}=await admin.from("profiles").select("id,role,aktif").eq("id",user.id).maybeSingle();const role=String(profile?.role||"").toLowerCase();if(!profile?.aktif||!["owner","spv","svp"].includes(role))return null;return{id:user.id,role};}
async function ticketForEmployee(ticketId:number,kid:number){const {data}=await admin.from("erp_pengaduan").select("id,ticket_no,pelapor_id,status").eq("id",ticketId).eq("pelapor_id",kid).maybeSingle();return data;}
async function ticketForStaff(ticketId:number){const {data}=await admin.from("erp_pengaduan").select("id,ticket_no,pelapor_id,status").eq("id",ticketId).maybeSingle();return data;}
async function gallery(ticketId:number){const {data,error}=await admin.from("erp_pengaduan_photo").select("id,pengaduan_id,uploaded_by_kind,original_name,mime_type,size_bytes,storage_path,created_at,file_deleted_at,delete_reason").eq("pengaduan_id",ticketId).order("created_at",{ascending:true}).order("id",{ascending:true});if(error)throw error;const items=[];for(const row of data||[]){let signed_url:string|null=null;if(!row.file_deleted_at){const {data:signed,error:signErr}=await admin.storage.from(BUCKET).createSignedUrl(row.storage_path,3600);if(!signErr)signed_url=signed?.signedUrl||null;}items.push({...row,signed_url,deleted:!!row.file_deleted_at});}return items;}

Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 let uploaded:{path:string,file:File}[]=[], insertedIds:number[]=[]; let committed=false;
 try{
  const parsed=new URL(req.url); const ticketId=Number(parsed.searchParams.get("ticket_id")||0);
  if(!Number.isSafeInteger(ticketId)||ticketId<1)return json({ok:false,reason:"TICKET_REQUIRED"},400);
  const kid=await employeeId(req); const staff=kid?null:await staffUser(req);
  if(!kid&&!staff)return json({ok:false,reason:"AUTH_REQUIRED"},401);
  const ticket=kid?await ticketForEmployee(ticketId,kid):await ticketForStaff(ticketId);
  if(!ticket)return json({ok:false,reason:"NOT_FOUND"},404);
  if(req.method==="GET")return json({ok:true,items:await gallery(ticketId)});
  if(req.method!=="POST")return json({ok:false,reason:"METHOD_NOT_ALLOWED"},405);
  if(!kid)return json({ok:false,reason:"EMPLOYEE_UPLOAD_ONLY"},403);
  if(["SELESAI","DITUTUP_OTOMATIS"].includes(String(ticket.status)))return json({ok:false,reason:"TICKET_CLOSED"},409);
  const form=await req.formData(); const context=String(form.get("context")||"REPLY").trim().toUpperCase(); const message=String(form.get("message")||"").trim().slice(0,800);
  const field=context==="INITIAL"?"media":"photos"; const files=form.getAll(field).filter((x):x is File=>x instanceof File);
  if(files.length<1)return json({ok:false,reason:"MEDIA_REQUIRED"},400);
  if(context==="INITIAL"){
   if(files.length>INITIAL_MAX_PHOTOS+INITIAL_MAX_VIDEOS)return json({ok:false,reason:"INITIAL_MEDIA_COUNT_INVALID"},400);
   let photos=0,videos=0,total=0;
   for(const file of files){if(!ALL_TYPES.has(file.type))return json({ok:false,reason:"MEDIA_TYPE_INVALID",file:file.name},400);total+=file.size;if(IMAGE_TYPES.has(file.type)){photos++;if(file.size<1||file.size>INITIAL_PHOTO_MAX)return json({ok:false,reason:"INITIAL_PHOTO_SIZE_INVALID",file:file.name},400);}else{videos++;if(file.size<1||file.size>INITIAL_VIDEO_MAX)return json({ok:false,reason:"INITIAL_VIDEO_SIZE_INVALID",file:file.name},400);}}
   if(photos>INITIAL_MAX_PHOTOS)return json({ok:false,reason:"MAX_3_INITIAL_PHOTOS"},400);
   if(videos>INITIAL_MAX_VIDEOS)return json({ok:false,reason:"MAX_1_INITIAL_VIDEO"},400);
   if(total>INITIAL_TOTAL_MAX)return json({ok:false,reason:"INITIAL_TOTAL_SIZE_INVALID"},400);
  }else{
   if(files.length>REPLY_MAX_FILES)return json({ok:false,reason:"MAX_5_PHOTOS"},400);
   for(const file of files){if(!IMAGE_TYPES.has(file.type))return json({ok:false,reason:"PHOTO_TYPE_INVALID",file:file.name},400);if(file.size<1||file.size>REPLY_MAX_SIZE)return json({ok:false,reason:"PHOTO_SIZE_INVALID",file:file.name},400);}
  }
  for(const file of files){const path=String(ticketId)+"/"+String(kid)+"/"+String(Date.now())+"-"+crypto.randomUUID()+"."+extFor(file.type);const bytes=new Uint8Array(await file.arrayBuffer());const {error}=await admin.storage.from(BUCKET).upload(path,bytes,{contentType:file.type,upsert:false,cacheControl:"3600"});if(error)throw error;uploaded.push({path,file});}
  const rows=uploaded.map(({path,file})=>({pengaduan_id:ticketId,uploaded_by_kind:"KARYAWAN",uploaded_by_karyawan_id:kid,storage_bucket:BUCKET,storage_path:path,original_name:(file.name||"lampiran").slice(0,180),mime_type:file.type,size_bytes:file.size}));
  const {data:inserted,error:insertErr}=await admin.from("erp_pengaduan_photo").insert(rows).select("id");if(insertErr)throw insertErr;insertedIds=(inserted||[]).map((x:any)=>Number(x.id));
  const fromStatus=String(ticket.status); const toStatus=context==="INITIAL"?fromStatus:(fromStatus==="MENUNGGU_INFO"?"DALAM_PENANGANAN":fromStatus);
  if(toStatus!==fromStatus){const {error:updateErr}=await admin.from("erp_pengaduan").update({status:toStatus,updated_at:new Date().toISOString()}).eq("id",ticketId);if(updateErr)throw updateErr;}
  const names=rows.map(r=>r.original_name); const photoCount=rows.filter(r=>IMAGE_TYPES.has(r.mime_type)).length; const videoCount=rows.filter(r=>VIDEO_TYPES.has(r.mime_type)).length;
  const eventType=context==="INITIAL"?"EMPLOYEE_INITIAL_MEDIA":"EMPLOYEE_REPLY_PHOTO";
  const eventMessage=message||(context==="INITIAL"?"Karyawan melampirkan "+photoCount+" foto dan "+videoCount+" video pada penjelasan awal.":"Karyawan mengirim "+rows.length+" foto.");
  const {error:eventErr}=await admin.from("erp_pengaduan_event").insert({pengaduan_id:ticketId,actor_kind:"KARYAWAN",actor_karyawan_id:kid,event_type:eventType,status_from:fromStatus,status_to:toStatus,message:eventMessage,metadata:{media_ids:insertedIds,media_count:rows.length,photo_count:photoCount,video_count:videoCount,original_names:names,context}});if(eventErr)throw eventErr;
  committed=true;
  const {error:notifyErr}=await admin.rpc("erp_pengaduan_notify_staff",{p_pengaduan_id:ticketId,p_kind:"SVP",p_level:"INFO",p_title:context==="INITIAL"?"Lampiran awal · "+ticket.ticket_no:"Foto dari karyawan · "+ticket.ticket_no,p_body:message||(context==="INITIAL"?photoCount+" foto dan "+videoCount+" video dilampirkan pada penjelasan awal.":"Karyawan mengirim "+rows.length+" foto untuk pengaduan ini.")});
  if(notifyErr)console.warn("notify staff failed",notifyErr);
  return json({ok:true,status:toStatus,count:rows.length,photo_count:photoCount,video_count:videoCount,items:await gallery(ticketId)});
 }catch(error){console.error(error);if(!committed){if(insertedIds.length)await admin.from("erp_pengaduan_photo").delete().in("id",insertedIds);if(uploaded.length)await admin.storage.from(BUCKET).remove(uploaded.map(x=>x.path));}return json({ok:false,reason:"SERVER_ERROR",message:String((error as Error)?.message||error)},500);}
});