/* Absensi Karyawan — location display enhancement only.
   Reads browser GPS to show a human-readable address and mirrors the nearest branch
   already chosen by the existing attendance engine. It never changes radius logic. */
(() => {
  'use strict';

  const ADDRESS_CACHE_KEY = 'vax_absensi_reverse_geocode_v1';

  const clean = (value) => String(value || '').trim();

  function formatAddress(payload){
    const a = payload?.address || {};
    const road = clean(a.road || a.pedestrian || a.residential || a.hamlet || a.village);
    const suburb = clean(a.suburb || a.neighbourhood || a.quarter || a.village);
    const district = clean(a.city_district || a.district || a.municipality || a.county);
    const city = clean(a.city || a.town || a.regency || a.state_district || a.state);

    const parts = [];
    [road, suburb, district, city].forEach((part) => {
      if(part && !parts.includes(part)) parts.push(part);
    });

    if(parts.length) return parts.slice(0,4).join(', ');

    const display = clean(payload?.display_name);
    if(display) return display.split(',').slice(0,4).join(',').trim();
    return '';
  }

  function setAddress(text){
    const el = document.getElementById('gpsUserAddress');
    if(el) el.textContent = text || 'Alamat belum tersedia';
  }

  function syncNearestBranch(){
    const source = document.getElementById('namaCabang');
    const target = document.getElementById('nearestBranchName');
    if(!source || !target) return;

    const apply = () => {
      const value = clean(source.textContent);
      target.textContent = value && !/mendeteksi/i.test(value)
        ? value
        : 'Mendeteksi cabang terdekat...';
    };

    apply();
    new MutationObserver(apply).observe(source, {
      childList:true,
      subtree:true,
      characterData:true
    });
  }

  function getCached(lat, lon){
    try{
      const raw = sessionStorage.getItem(ADDRESS_CACHE_KEY);
      if(!raw) return null;
      const parsed = JSON.parse(raw);
      if(!parsed || !Number.isFinite(parsed.lat) || !Number.isFinite(parsed.lon)) return null;
      const near = Math.abs(parsed.lat-lat) < 0.0008 && Math.abs(parsed.lon-lon) < 0.0008;
      return near ? clean(parsed.address) : null;
    }catch(_e){
      return null;
    }
  }

  function setCached(lat, lon, address){
    try{
      sessionStorage.setItem(ADDRESS_CACHE_KEY, JSON.stringify({
        lat, lon, address, at:Date.now()
      }));
    }catch(_e){ /* storage optional */ }
  }

  async function reverseGeocode(lat, lon){
    const cached = getCached(lat, lon);
    if(cached){
      setAddress(cached);
      return;
    }

    setAddress('Membaca alamat lokasi...');

    try{
      const url = new URL('https://nominatim.openstreetmap.org/reverse');
      url.searchParams.set('format','jsonv2');
      url.searchParams.set('lat',String(lat));
      url.searchParams.set('lon',String(lon));
      url.searchParams.set('zoom','18');
      url.searchParams.set('addressdetails','1');
      url.searchParams.set('accept-language','id');

      const response = await fetch(url.toString(), {
        method:'GET',
        headers:{ 'Accept':'application/json' }
      });

      if(!response.ok) throw new Error('reverse-geocode-http-' + response.status);

      const payload = await response.json();
      const address = formatAddress(payload);

      if(address){
        setAddress(address);
        setCached(lat, lon, address);
      }else{
        setAddress('Alamat tidak ditemukan dari koordinat GPS.');
      }
    }catch(err){
      console.warn('Reverse geocoding tidak tersedia:', err);
      setAddress('Alamat belum dapat dibaca. Koordinat GPS tetap aktif.');
    }
  }

  function readAddressFromGps(){
    if(!navigator.geolocation){
      setAddress('Perangkat tidak mendukung pembacaan lokasi.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude);
        const lon = Number(pos.coords.longitude);
        if(Number.isFinite(lat) && Number.isFinite(lon)){
          reverseGeocode(lat, lon);
        }
      },
      () => setAddress('Izinkan akses lokasi untuk membaca alamat.'),
      {
        enableHighAccuracy:true,
        timeout:15000,
        maximumAge:30000
      }
    );
  }

  const boot = () => {
    syncNearestBranch();
    readAddressFromGps();
  };

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot, { once:true });
  }else{
    boot();
  }
})();