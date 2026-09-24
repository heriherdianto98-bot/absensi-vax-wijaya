/* ERP VAX — Pengaduan notification bridge.
   Additive UI/read-only integration into existing ERPGlobalNotifications.
*/
"use strict";
(function(){
  const install=()=>{
    const N=window.ERPGlobalNotifications;
    if(!N||N.__pengaduanBridgeV1)return false;
    N.__pengaduanBridgeV1=true;

    const loadPengaduan=async(db)=>{
      if(!['owner','svp'].includes(N.role))return;
      try{
        const {data,error}=await db.rpc('erp_pengaduan_notifications_current');
        if(error)throw error;
        if(!data?.ok)return;
        (data.items||[]).filter(x=>!x.read_at).forEach(x=>{
          const level=String(x.level||'INFO').toUpperCase();
          N.add({
            key:'pengaduan:'+x.id,
            tone:level==='KRITIS'?'urgent':level==='PERHATIAN'?'warning':'info',
            icon:'⚑',
            module:'PENGADUAN',
            href:'./pengaduan.html?ticket='+encodeURIComponent(x.ticket_id)+'&notif='+encodeURIComponent(x.id),
            title:x.title||'Update pengaduan',
            detail:x.body||'Ada pembaruan pengaduan yang perlu ditinjau.'
          });
        });
      }catch(e){console.warn('[Notif Pengaduan]',e)}
    };

    const originalRefresh=N.refresh;
    N.refresh=async function(){
      await originalRefresh.call(this);
      if(!['owner','svp'].includes(this.role))return;
      const db=await this.waitDb();
      if(!db)return;
      await loadPengaduan(db);
      this.render();
    };

    setTimeout(()=>N.refresh(),250);
    return true;
  };

  if(!install()){
    let tries=0;
    const t=setInterval(()=>{if(install()||++tries>80)clearInterval(t)},100);
  }
})();