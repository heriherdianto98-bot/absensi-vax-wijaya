/* ERP VAX Employee Portal — Device Readiness Gate
   Additive only. Attendance/GPS validation remains canonical in absensi.js + server RPC. */
(()=>{
  'use strict';

  const ID='employeeDeviceReadiness';
  const state={
    secure:false,
    localTest:false,
    session:false,
    geoSupport:false,
    geoPermission:'unknown',
    geoAccuracy:null,
    notificationSupport:false,
    notificationPermission:'unsupported',
    haptic:false
  };

  const isPrivateHost=(host)=>{
    return /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) || host==='localhost';
  };

  function cls(v){
    if(v===true||v==='granted') return 'ok';
    if(v===false||v==='denied'||v==='unsupported') return 'bad';
    return 'warn';
  }

  function label(v){
    if(v===true||v==='granted') return 'SIAP';
    if(v===false||v==='denied') return 'BLOKIR';
    if(v==='unsupported') return 'N/A';
    if(v==='prompt') return 'IZINKAN';
    return 'CEK';
  }

  function row(icon,title,copy,status,key){
    return '<div class="employee-readiness-row" data-key="'+key+'">'+
      '<span class="ico"><i class="'+icon+'"></i></span>'+
      '<span><strong>'+title+'</strong><small>'+copy+'</small></span>'+
      '<span class="employee-readiness-status '+cls(status)+'">'+label(status)+'</span>'+
    '</div>';
  }

  function mount(){
    if(document.getElementById(ID)) return;
    const wrap=document.createElement('div');
    wrap.id=ID;
    wrap.className='employee-readiness-overlay';
    wrap.setAttribute('role','dialog');
    wrap.setAttribute('aria-modal','true');
    wrap.setAttribute('aria-label','Kesiapan perangkat');
    wrap.innerHTML=
      '<section class="employee-readiness-panel">'+
        '<header class="employee-readiness-head">'+
          '<span class="employee-readiness-icon"><i class="fa-solid fa-mobile-screen-button"></i></span>'+
          '<div><h2>Kesiapan Perangkat</h2><p>Periksa izin yang dibutuhkan sebelum memakai portal karyawan.</p></div>'+
        '</header>'+
        '<div class="employee-readiness-body">'+
          '<div id="employeeReadinessRows" class="employee-readiness-list"></div>'+
          '<div class="employee-readiness-actions">'+
            '<button type="button" id="employeeReadinessLocation" class="employee-readiness-btn primary">Aktifkan Lokasi</button>'+
            '<button type="button" id="employeeReadinessNotification" class="employee-readiness-btn">Aktifkan Notifikasi</button>'+
          '</div>'+
          '<p id="employeeReadinessLocal" class="employee-readiness-local" hidden></p>'+
          '<p class="employee-readiness-note">GPS/lokasi wajib untuk Absensi. Kamera/file hanya diminta saat fitur yang membutuhkannya digunakan. Dashboard, Gaji Saya, dan Profil tetap dapat dibuka.</p>'+
          '<button type="button" id="employeeReadinessContinue" class="employee-readiness-btn primary" style="width:100%;margin-top:10px">Lanjut ke Dashboard</button>'+
        '</div>'+
      '</section>';
    document.body.appendChild(wrap);

    document.getElementById('employeeReadinessLocation')?.addEventListener('click',requestLocation);
    document.getElementById('employeeReadinessNotification')?.addEventListener('click',requestNotification);
    document.getElementById('employeeReadinessContinue')?.addEventListener('click',()=>wrap.classList.remove('is-open'));
  }

  async function sessionCheck(){
    try{
      if(typeof KaryawanSession==='undefined') return false;
      const secure=await KaryawanSession.loadSecureSession();
      return !!(secure&&secure.aktif===true);
    }catch(_){ return false; }
  }

  async function permissionCheck(){
    state.geoSupport=!!navigator.geolocation;
    state.notificationSupport=('Notification' in window);
    state.notificationPermission=state.notificationSupport ? Notification.permission : 'unsupported';
    state.haptic=typeof navigator.vibrate==='function';

    if(state.geoSupport && navigator.permissions?.query){
      try{
        const p=await navigator.permissions.query({name:'geolocation'});
        state.geoPermission=p.state;
        p.onchange=()=>{state.geoPermission=p.state;render();};
      }catch(_){
        state.geoPermission='unknown';
      }
    }else if(!state.geoSupport){
      state.geoPermission='unsupported';
    }
  }

  function render(){
    const rows=document.getElementById('employeeReadinessRows');
    if(!rows) return;
    const secureStatus=state.secure || state.localTest ? true : false;
    const secureCopy=state.secure
      ? 'Koneksi HTTPS/secure context aktif.'
      : state.localTest
        ? 'Mode tes lokal. Produksi wajib HTTPS.'
        : 'Produksi wajib menggunakan HTTPS.';

    const geoStatus=!state.geoSupport ? 'unsupported' : state.geoPermission;
    const geoCopy=state.geoAccuracy!==null
      ? 'Izin lokasi aktif. Akurasi terakhir ±'+Math.round(state.geoAccuracy)+' m; validasi Absensi tetap mengikuti engine.'
      : 'Wajib untuk Absensi dan geofence cabang.';

    rows.innerHTML=
      row('fa-solid fa-shield-halved','Koneksi Aman',secureCopy,secureStatus,'secure')+
      row('fa-solid fa-user-shield','Session Karyawan','Session diverifikasi ke server dan status akun harus aktif.',state.session,'session')+
      row('fa-solid fa-location-crosshairs','Lokasi / GPS',geoCopy,geoStatus,'geo')+
      row('fa-solid fa-bell','Notifikasi','Disarankan untuk pengumuman dan informasi kerja.',state.notificationPermission,'notification')+
      row('fa-solid fa-mobile-screen','Haptic','Umpan balik getar jika perangkat/browser mendukung.',state.haptic,'haptic');

    const locBtn=document.getElementById('employeeReadinessLocation');
    if(locBtn){
      locBtn.disabled=!state.geoSupport;
      locBtn.textContent=state.geoPermission==='granted'?'Perbarui Lokasi':'Aktifkan Lokasi';
    }
    const nBtn=document.getElementById('employeeReadinessNotification');
    if(nBtn){
      nBtn.disabled=!state.notificationSupport || state.notificationPermission==='denied';
      nBtn.textContent=state.notificationPermission==='granted'?'Notifikasi Aktif':
        state.notificationPermission==='denied'?'Notifikasi Diblokir':'Aktifkan Notifikasi';
    }
    const local=document.getElementById('employeeReadinessLocal');
    if(local){
      if(state.localTest && !state.secure){
        local.hidden=false;
        local.textContent='Anda sedang tes melalui jaringan lokal HTTP. GPS browser dapat dibatasi. Saat online, portal harus memakai HTTPS.';
      }else{
        local.hidden=true;
      }
    }
  }

  function requestLocation(){
    if(!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos)=>{
        state.geoPermission='granted';
        state.geoAccuracy=Number(pos.coords?.accuracy)||null;
        render();
      },
      (err)=>{
        state.geoPermission=err?.code===1?'denied':'prompt';
        render();
      },
      {enableHighAccuracy:true,timeout:12000,maximumAge:0}
    );
  }

  async function requestNotification(){
    if(!('Notification' in window)) return;
    try{
      const p=await Notification.requestPermission();
      state.notificationPermission=p;
      render();
    }catch(_){}
  }

  async function init(){
    mount();
    state.localTest=isPrivateHost(location.hostname);
    state.secure=window.isSecureContext===true || location.protocol==='https:';
    await permissionCheck();
    state.session=await sessionCheck();
    render();

    const needsAttention=!state.session || state.geoPermission!=='granted' ||
      (state.notificationSupport && state.notificationPermission==='default') ||
      (!state.secure && !state.localTest);

    if(needsAttention){
      document.getElementById(ID)?.classList.add('is-open');
    }
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
