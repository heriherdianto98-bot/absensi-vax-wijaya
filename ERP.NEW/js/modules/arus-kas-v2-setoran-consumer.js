/*
=========================================================
VAX ERP — ARUS KAS V2 / SETORAN 3 HARIAN CONSUMER BRIDGE
Additive consumer layer only.

RULES:
- Tidak mengubah SetoranMoneyEngine / DailyDataEngine / Setoran 3 Harian.
- Consume per cabang, bukan menunggu semua cabang.
- Hanya row SUDAH DIAMBIL + owner_verified = true yang eligible.
- Cash Aktual menjadi transaksi AUTO Arus Kas.
- Nett Produk mengikuti angka canonical yang sama dengan Setoran 3 Harian,
  pada periode + cabang source tersebut.
- BRI Merchant dari Setoran menjadi nilai "Uang Rekening Sesuai Data"
  untuk rekonsiliasi Arus Kas; transfer aktual tetap transaksi QRIS_TRANSFER.
- Transaksi AUTO Arus Kas tetap BELUM_DIVERIFIKASI sampai Owner review
  di modul Arus Kas (verifikasi Arus Kas berbeda dari verifikasi Setoran).
=========================================================
*/
"use strict";

(function(){
  if(typeof ArusKasV2 === "undefined") return;

  const flow = ArusKasV2;
  flow.consumerCabangNames = flow.consumerCabangNames || new Map();

  flow.loadConsumerCabangNames = async function(){
    if(this.consumerCabangNames.size) return;
    const ids = [...new Set((this.setoranRows || []).map(r => Number(r.cabang_id)).filter(Number.isFinite))];
    if(!ids.length) return;
    const {data,error} = await db.from("cabang").select("id,nama_cabang").in("id", ids);
    if(error) return;
    for(const row of data || []){
      this.consumerCabangNames.set(Number(row.id), row.nama_cabang || `Cabang ${row.id}`);
    }
  };

  flow.consumerCabangName = function(row){
    return this.consumerCabangNames.get(Number(row?.cabang_id)) || `Cabang ${row?.cabang_id ?? "—"}`;
  };

  flow.isSetoranEligible = function(row){
    return Boolean(
      row &&
      row.taken_status === "SUDAH DIAMBIL" &&
      row.owner_verified === true
    );
  };

  flow.nettProdukFromSetoranSource = async function(row){
    if(typeof DailyDataEngine === "undefined" || typeof DailyDataEngine.load !== "function") return 0;
    const dataset = await DailyDataEngine.load({
      client: db,
      start: row.period_start,
      end: row.period_end,
      cabangId: row.cabang_id
    });
    return this.money(dataset?.summary?.nettProduct);
  };

  flow.syncAutomaticSetoran = async function(){
    await this.loadConsumerCabangNames();

    const rows = (this.setoranRows || [])
      .filter(row => this.isSetoranEligible(row))
      .sort((a,b) => {
        if(a.period_start !== b.period_start) return String(a.period_start).localeCompare(String(b.period_start));
        return Number(a.cabang_id) - Number(b.cabang_id);
      });

    for(const row of rows){
      const name = this.consumerCabangName(row);
      const cashActual = this.money(row.setoran_cash_actual ?? row.total_setoran);
      const sourceBase = String(row.id);
      const sourceMeta = {
        setoran_id: row.id,
        cabang_id: Number(row.cabang_id),
        cabang_name: name,
        owner_verified: true,
        owner_verified_at: row.owner_verified_at || null,
        owner_verified_by: row.owner_verified_by || null,
        taken_at: row.taken_at || null,
        taken_by: row.taken_by || null,
        bri_non_cash_actual: this.money(row.bri_non_cash_actual),
        auto_kind: "SETORAN_CASH_PER_CABANG"
      };

      if(cashActual !== 0){
        const incoming = cashActual > 0;
        await this.ensureAutoTransaction({
          tanggal: row.period_end,
          amount: Math.abs(cashActual),
          from_wallet: incoming ? "EXTERNAL" : "KAS_BESAR",
          to_wallet: incoming ? "KAS_BESAR" : "EXTERNAL",
          category: "SETORAN_3_HARIAN",
          description: `${incoming ? "Setoran" : "Koreksi setoran"} ${name} · ${this.fmtDate(row.period_start)} — ${this.fmtDate(row.period_end)}`,
          source_key: `${sourceBase}:CASH`,
          start: row.period_start,
          end: row.period_end,
          metadata: sourceMeta
        });
      }

      const nettProduk = await this.nettProdukFromSetoranSource(row);
      if(nettProduk !== 0){
        const normal = nettProduk > 0;
        await this.ensureAutoTransaction({
          tanggal: row.period_end,
          amount: Math.abs(nettProduk),
          from_wallet: normal ? "KAS_BESAR" : "DANA_PRODUK",
          to_wallet: normal ? "DANA_PRODUK" : "KAS_BESAR",
          category: "TRANSFER_DANA_PRODUK",
          description: `Nett Produk ${name} · ${this.fmtDate(row.period_start)} — ${this.fmtDate(row.period_end)}`,
          source_key: `${sourceBase}:PRODUK`,
          start: row.period_start,
          end: row.period_end,
          metadata: {
            ...sourceMeta,
            auto_kind: "NETT_PRODUCT_PER_CABANG",
            nett_product: nettProduk,
            source: "SETORAN_3_HARIAN_CANONICAL"
          }
        });
      }
    }
  };

  flow.renderQris = function(){
    const eligible = (this.setoranRows || []).filter(row => this.isSetoranEligible(row));
    const map = new Map();
    for(const row of eligible){
      const key = this.periodKey(row.period_start,row.period_end);
      if(!map.has(key)) map.set(key,{start:row.period_start,end:row.period_end,rows:[]});
      map.get(key).rows.push(row);
    }
    const groups = [...map.values()].sort((a,b)=>String(a.start).localeCompare(String(b.start)));
    const ledgerQris = this.ledger.filter(r=>r.category==="QRIS_TRANSFER"&&r.to_wallet==="KAS_BESAR");
    let expTotal=0,actTotal=0;
    const rows=groups.map(g=>{
      const expected=g.rows.reduce((t,r)=>t+this.money(r.bri_non_cash_actual),0);
      const matches=ledgerQris.filter(x=>x.source_period_start===g.start&&x.source_period_end===g.end);
      const actual=matches.reduce((t,r)=>t+this.money(r.amount),0);
      const diff=expected-actual; expTotal+=expected;actTotal+=actual;
      const notes=matches.map(x=>x.description).filter(Boolean).join(" · ");
      return `<tr><td>${this.fmtDate(g.start)} — ${this.fmtDate(g.end)}</td><td>${this.rupiah(expected)}</td><td>${this.rupiah(actual)}</td><td class="ak2-qris-diff ${Math.abs(diff)>.5?'is-alert':'is-ok'}">${this.rupiah(diff)}</td><td>${this.esc(notes)||"—"}</td></tr>`;
    });
    document.getElementById("ak2QrisBody").innerHTML=rows.length?rows.join(""):'<tr><td colspan="5" class="ak2-empty">Belum ada Setoran 3 Harian yang Owner Verified pada periode ini.</td></tr>';
    document.getElementById("ak2QrisExpected").textContent=this.rupiah(expTotal);
    document.getElementById("ak2QrisActual").textContent=this.rupiah(actTotal);
    document.getElementById("ak2QrisDiff").textContent=this.rupiah(expTotal-actTotal);
  };
})();
