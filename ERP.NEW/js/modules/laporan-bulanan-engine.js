/*
=========================================================
VAX ERP — LAPORAN BULANAN CONSUMER ENGINE V1
=========================================================
OWNER RULE:
- Modul Bulanan adalah CONSUMER OTOMATIS + READ ONLY.
- Tidak menulis / mengubah Tabel Harian, Payroll, Cash Out,
  Master Sewa, Master Investor, DailyDataEngine, ProteksiEngine,
  VAX AI Insight, atau engine LOCK lain.
- Mapping provider AMBIGUOUS disimpan khusus consumer Bulanan;
  source provider_sales_daily_source / Payroll tetap READ ONLY.

Mapping OWNER 12 Sep 2026:
1) Pendapatan Cukur  = Gross Service (DailyDataEngine)
2) Pendapatan Produk = Nett Product = Product - Share Product (canonical)
3) Gaji Kasir        = Payroll sesuai HOME BRANCH karyawan
4) Gaji Capster      = Payroll + provider AMBIGUOUS yang sudah dimapping + Protek Cash Out cabang
5) Gaji SVP          = item Gaji SPV aktual di Cash Out cabang
6) Backup/Floating   = Payroll; cash-out gaji backup + bensin bernama
   tidak dihitung lagi sebagai operasional
7) Sewa              = Master Sewa sesuai effective date
8) Investor          = Master Investor sesuai effective date
9) Performance       = ringkasan dari object AI Insight existing; presenter only

Catatan anti double-count:
- Gaji Kasir / Gaji Backup Kasir / Protek / Gaji SPV / gaji Capster
  yang sudah direklasifikasi tidak masuk Operasional.
- Biaya Sewa Tempat di Cash Out tidak masuk Operasional karena memakai Master Sewa.
=========================================================
*/

"use strict";

const LaporanBulananEngine = {
    TABLE_DAILY: "daily_recap_source",
    TABLE_SEWA: "master_biaya_sewa_tempat",
    TABLE_INVESTOR: "master_investor",
    TABLE_PROVIDER_MAPPING: "laporan_bulanan_provider_mapping",

    number(value){
        const n = Number(value || 0);
        return Number.isFinite(n) ? n : 0;
    },

    normalizeText(value){
        return String(value || "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    },

    normalizeBranchName(value){
        return this.normalizeText(value)
            .replace(/^vax wijaya /, "")
            .replace(/^vax wijiaya /, "")
            .replace(/^vax /, "")
            .replace(/rawa badak/g, "rawabadak")
            .replace(/spbu pagaden/g, "pagaden")
            .replace(/\bsoklat\b/g, "barsel")
            .trim();
    },

    monthRange(year, month){
        const y = Number(year);
        const m = Number(month);
        if(!Number.isInteger(y) || y < 2000 || y > 2100 || !Number.isInteger(m) || m < 1 || m > 12){
            throw new Error("Laporan Bulanan: bulan tidak valid.");
        }
        const mm = String(m).padStart(2, "0");
        const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
        return {
            start: `${y}-${mm}-01`,
            end: `${y}-${mm}-${String(last).padStart(2, "0")}`
        };
    },

    previousMonthRange(year, month){
        const d = new Date(Date.UTC(Number(year), Number(month) - 2, 1));
        return this.monthRange(d.getUTCFullYear(), d.getUTCMonth() + 1);
    },

    resolveClient(client){
        const resolved = client
            || (typeof db !== "undefined" ? db : null)
            || (typeof window !== "undefined" ? window.db : null);
        if(!resolved || typeof resolved.from !== "function"){
            throw new Error("Laporan Bulanan: Supabase client tidak tersedia.");
        }
        return resolved;
    },

    parseCashOutItems(rawText){
        const raw = String(rawText || "").trim();
        if(!raw) return [];
        return raw.split(/\s*;\s*/).map((chunk) => chunk.trim()).filter(Boolean).map((chunk) => {
            const noKasir = chunk.replace(/\s*[-–]\s*Kasir:\s*.+$/i, "").trim();
            const m = noKasir.match(/^(.*?)\s+Rp\s*([\d.,\s]+)$/i);
            const label = String(m?.[1] || noKasir).trim();
            const digits = String(m?.[2] || "").replace(/\D/g, "");
            return {
                raw: chunk,
                label,
                normalized: this.normalizeText(label),
                nominal: digits ? Number(digits) : 0
            };
        });
    },

    isSvpSalary(item){
        return /\bgaji\s+spv\b/i.test(item?.normalized || "");
    },

    isCashierSalary(item){
        const s = item?.normalized || "";
        return /\bgaji\s+kasir\b/.test(s) && !/backup/.test(s);
    },

    isBackupSalary(item){
        const s = item?.normalized || "";
        return /\bgaji\s+backup\s*kasir\b/.test(s) || /\bgaji\s+backupkasir\b/.test(s);
    },

    isFloatingFuel(item){
        const s = item?.normalized || "";
        if(!/\bbensin\b/.test(s)) return false;
        return /\b(hairi|hari|ryan|rian)\b/.test(s);
    },

    isRentCashOut(item){
        const s = item?.normalized || "";
        return /\b(biaya\s+)?sewa\s+(tempat|ruko|lokasi)\b/.test(s);
    },

    isProtection(item){
        if(typeof ProteksiEngine !== "undefined" && typeof ProteksiEngine.isProteksiText === "function"){
            return ProteksiEngine.isProteksiText(item?.label || item?.raw || "");
        }
        return /\b(?:protek(?:si)?|protect)\b/i.test(item?.label || item?.raw || "");
    },

    employeeAliases(employee){
        const full = this.normalizeText(employee?.namaKaryawan || employee?.nama_karyawan || "");
        const first = full.split(" ")[0] || "";
        return [...new Set([full, first].filter((x) => x.length >= 3))];
    },

    isDirectCapsterSalary(item, payrollRows){
        const s = item?.normalized || "";
        if(!/^gaji\s+/.test(s)) return false;
        const after = s.replace(/^gaji\s+/, "").trim();
        return (payrollRows || []).some((employee) => {
            if(!employee?.isCapster) return false;
            return this.employeeAliases(employee).some((alias) => after === alias || after.startsWith(alias + " "));
        });
    },

    classifyCashOutItems(dailyRows, payrollRows){
        const detail = [];
        const totals = {
            officialCashOut: 0,
            parsedNominal: 0,
            svpSalary: 0,
            protectionSalary: 0,
            excludedPayrollDuplicate: 0,
            excludedRentDuplicate: 0,
            operational: 0,
            unparsedOfficialRemainder: 0
        };

        for(const row of (dailyRows || [])){
            const official = this.number(row?.cash_out);
            totals.officialCashOut += official;
            const items = this.parseCashOutItems(row?.keterangan_cash_out);
            const parsedDay = items.reduce((sum, x) => sum + this.number(x.nominal), 0);
            totals.parsedNominal += parsedDay;

            for(const item of items){
                let category = "OPERASIONAL";
                if(this.isSvpSalary(item)){
                    category = "GAJI_SVP";
                    totals.svpSalary += this.number(item.nominal);
                }else if(this.isProtection(item)){
                    category = "GAJI_CAPSTER_PROTEK";
                    totals.protectionSalary += this.number(item.nominal);
                }else if(this.isCashierSalary(item) || this.isBackupSalary(item) || this.isFloatingFuel(item) || this.isDirectCapsterSalary(item, payrollRows)){
                    category = "EXCLUDE_PAYROLL_DUPLICATE";
                    totals.excludedPayrollDuplicate += this.number(item.nominal);
                }else if(this.isRentCashOut(item)){
                    category = "EXCLUDE_SEWA_MASTER";
                    totals.excludedRentDuplicate += this.number(item.nominal);
                }else{
                    totals.operational += this.number(item.nominal);
                }

                detail.push({
                    tanggal: String(row?.tanggal || "").slice(0, 10),
                    cabang_id: Number(row?.cabang_id || 0) || null,
                    ...item,
                    category
                });
            }

            if(official > parsedDay){
                const remainder = official - parsedDay;
                totals.unparsedOfficialRemainder += remainder;
                totals.operational += remainder;
                detail.push({
                    tanggal: String(row?.tanggal || "").slice(0, 10),
                    cabang_id: Number(row?.cabang_id || 0) || null,
                    raw: row?.keterangan_cash_out || "",
                    label: "Cash Out resmi belum terurai",
                    normalized: "cash out resmi belum terurai",
                    nominal: remainder,
                    category: "OPERASIONAL_UNPARSED"
                });
            }
        }

        return { totals, detail };
    },

    async fetchDailyCashOut({ client, start, end, cabangId }){
        const supabase = this.resolveClient(client);
        let q = supabase
            .from(this.TABLE_DAILY)
            .select("tanggal,cabang_id,cash_out,keterangan_cash_out")
            .gte("tanggal", start)
            .lte("tanggal", end)
            .order("tanggal", { ascending: true });
        if(cabangId !== null && cabangId !== undefined && String(cabangId) !== ""){
            q = q.eq("cabang_id", Number(cabangId));
        }
        const { data, error } = await q;
        if(error) throw error;
        return Array.isArray(data) ? data : [];
    },

    async fetchMasterRowsAt({ client, table, date }){
        const supabase = this.resolveClient(client);
        const { data, error } = await supabase
            .from(table)
            .select("*")
            .or(`effective_from.is.null,effective_from.lte.${date}`)
            .or(`effective_to.is.null,effective_to.gte.${date}`);
        if(error) throw error;
        return Array.isArray(data) ? data : [];
    },

    async fetchProviderMappings({ client, month }){
        const supabase = this.resolveClient(client);
        const periodMonth = String(month || "").slice(0, 7) + "-01";
        const { data, error } = await supabase
            .from(this.TABLE_PROVIDER_MAPPING)
            .select("source_provider_row_id,period_month,source_cabang_id,source_provider_name,source_provider_share,employee_id,employee_cabang_id,employee_name_snapshot,branch_name_snapshot")
            .eq("period_month", periodMonth);
        if(error) throw error;
        return Array.isArray(data) ? data : [];
    },

    applyProviderMappings({ pendingRows, mappings, reportCabangId }){
        const reportId = Number(reportCabangId);
        const mapBySource = new Map((mappings || []).map((m) => [String(m?.source_provider_row_id || ""), m]));
        const relevant = (pendingRows || []).filter((row) => Number(row?.cabangId) === reportId);
        const resolved = [];
        const pending = [];

        for(const row of relevant){
            const sourceId = String(row?.sourceId || "").trim();
            const mapping = mapBySource.get(sourceId) || null;
            const amount = this.number(row?.providerShare);
            if(mapping?.employee_id){
                resolved.push({
                    sourceId,
                    tanggal: row?.tanggal || "",
                    sourceCabangId: Number(row?.cabangId || 0) || null,
                    sourceCabang: row?.cabang || "—",
                    provider: row?.providerMinutes || "Backup",
                    service: this.number(row?.service),
                    amount,
                    employeeId: Number(mapping.employee_id),
                    employeeCabangId: Number(mapping.employee_cabang_id || 0) || null,
                    employeeName: mapping.employee_name_snapshot || "—",
                    employeeBranch: mapping.branch_name_snapshot || "—",
                    source: "MONTHLY_PROVIDER_MAPPING"
                });
            }else{
                pending.push({
                    sourceId,
                    tanggal: row?.tanggal || "",
                    sourceCabangId: Number(row?.cabangId || 0) || null,
                    sourceCabang: row?.cabang || "—",
                    provider: row?.providerMinutes || "Backup",
                    service: this.number(row?.service),
                    amount
                });
            }
        }

        return {
            resolved,
            pending,
            resolvedAmount: resolved.reduce((sum, row) => sum + this.number(row.amount), 0),
            pendingAmount: pending.reduce((sum, row) => sum + this.number(row.amount), 0)
        };
    },

    pickBranchMaster(rows, branchName){
        const want = this.normalizeBranchName(branchName);
        const candidates = (rows || []).filter((row) => this.normalizeBranchName(row?.branch_name) === want);
        candidates.sort((a, b) => String(b?.effective_from || "0000-00-00").localeCompare(String(a?.effective_from || "0000-00-00")));
        return candidates[0] || null;
    },

    async loadMasters({ client, date, branchName }){
        const [sewaRows, investorRows] = await Promise.all([
            this.fetchMasterRowsAt({ client, table: this.TABLE_SEWA, date }),
            this.fetchMasterRowsAt({ client, table: this.TABLE_INVESTOR, date })
        ]);
        return {
            sewa: this.pickBranchMaster(sewaRows, branchName),
            investor: this.pickBranchMaster(investorRows, branchName)
        };
    },

    payrollForBranch(payrollDataset, cabangId){
        const id = Number(cabangId);
        const rows = Array.isArray(payrollDataset?.payroll) ? payrollDataset.payroll : [];
        const detail = [];
        let total = 0;
        let floatingUnallocatedAdjustments = 0;

        for(const employee of rows){
            if(employee?.isBackupCashoutFloating){
                const daily = (employee.daily || []).filter((d) => Number(d?.cabangId) === id);
                const branchAmount = daily.reduce((sum, d) => sum
                    + this.number(d?.gajiPokok)
                    - this.number(d?.denda)
                    - this.number(d?.kasbon)
                    + this.number(d?.bonusProduk), 0);
                if(branchAmount !== 0){
                    total += branchAmount;
                    detail.push({
                        employeeId: employee.employeeId,
                        nama: employee.namaKaryawan,
                        jabatan: employee.jabatan,
                        source: "PAYROLL_FLOATING_BRANCH_DAILY",
                        amount: branchAmount
                    });
                }
                const summary = employee.summary || {};
                const monthlyAdj = this.number(summary.bonusInsentif) + this.number(summary.bonusKpi);
                if(monthlyAdj > 0){
                    floatingUnallocatedAdjustments += monthlyAdj;
                }
                continue;
            }

            if(Number(employee?.homeCabangId) !== id) continue;
            const amount = this.number(employee?.summary?.gajiBersih);
            total += amount;
            detail.push({
                employeeId: employee.employeeId,
                nama: employee.namaKaryawan,
                jabatan: employee.jabatan,
                isCapster: Boolean(employee.isCapster),
                source: "PAYROLL_HOME_BRANCH",
                amount
            });
        }

        return { total, detail, floatingUnallocatedAdjustments };
    },

    summarizeInsight(insight){
        if(!insight) return null;
        const out = {
            title: String(insight?.title || insight?.headline || "").trim(),
            status: String(insight?.status || insight?.level || "").trim(),
            finding: "",
            omzet: null,
            trends: null
        };

        const findings = insight?.detail?.temuan || insight?.detail?.temuanData || insight?.detail?.kondisi || [];
        const first = Array.isArray(findings) ? findings[0] : findings;
        if(typeof VaxAiInsight !== "undefined"){
            if(typeof VaxAiInsight.itemText === "function") out.finding = VaxAiInsight.itemText(first);
            if(typeof VaxAiInsight.extractOmzetMetrics === "function") out.omzet = VaxAiInsight.extractOmzetMetrics(insight);
            if(typeof VaxAiInsight.extractPeriodTrends === "function") out.trends = VaxAiInsight.extractPeriodTrends(insight);
        }else{
            out.finding = String(first?.text || first || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        }
        return out;
    },

    async loadMonth({ client, year, month, cabangId, insight = null } = {}){
        const supabase = this.resolveClient(client);
        const range = this.monthRange(year, month);
        if(cabangId === null || cabangId === undefined || String(cabangId).trim() === ""){
            throw new Error("Laporan Bulanan: cabang wajib dipilih.");
        }

        if(typeof DailyDataEngine === "undefined" || typeof DailyDataEngine.load !== "function"){
            throw new Error("Laporan Bulanan: DailyDataEngine tidak tersedia.");
        }
        if(typeof PayrollUnifiedEngine === "undefined" || typeof PayrollUnifiedEngine.loadPeriod !== "function"){
            throw new Error("Laporan Bulanan: PayrollUnifiedEngine tidak tersedia.");
        }

        const periodMonth = `${range.start.slice(0, 7)}-01`;
        const [daily, payrollAll, cashOutRows, providerMappings] = await Promise.all([
            DailyDataEngine.load({ client: supabase, start: range.start, end: range.end, cabangId: Number(cabangId) }),
            PayrollUnifiedEngine.loadPeriod({ start: range.start, end: range.end }),
            this.fetchDailyCashOut({ client: supabase, start: range.start, end: range.end, cabangId: Number(cabangId) }),
            this.fetchProviderMappings({ client: supabase, month: periodMonth })
        ]);

        const branch = daily.branches?.[0] || null;
        if(!branch) throw new Error("Laporan Bulanan: cabang tidak ditemukan di DailyDataEngine.");

        const masters = await this.loadMasters({ client: supabase, date: range.end, branchName: branch.nama_cabang });
        const payroll = this.payrollForBranch(payrollAll, Number(cabangId));
        const mappedProvider = this.applyProviderMappings({
            pendingRows: payrollAll.pendingMapping || [],
            mappings: providerMappings,
            reportCabangId: Number(cabangId)
        });
        const cashOut = this.classifyCashOutItems(cashOutRows, payrollAll.payroll || []);

        const grossService = this.number(daily.summary?.grossService);
        const nettProduct = this.number(daily.summary?.nettProduct);
        const pendapatan = grossService + nettProduct;

        const gajiPayroll = payroll.total;
        const gajiProviderMapped = mappedProvider.resolvedAmount;
        const gajiProtek = cashOut.totals.protectionSalary;
        const gajiSvp = cashOut.totals.svpSalary;
        const totalGaji = gajiPayroll + gajiProviderMapped + gajiProtek + gajiSvp;
        const operasional = cashOut.totals.operational;
        const sewa = this.number(masters.sewa?.monthly_rent);
        const totalBiaya = totalGaji + operasional + sewa;
        const labaBersih = pendapatan - totalBiaya;

        const investorPct = this.number(masters.investor?.profit_share_percent);
        const investorShare = labaBersih > 0 && investorPct > 0
            ? Math.round(labaBersih * investorPct / 100)
            : 0;
        const rentEntitlement = Boolean(masters.investor?.rent_entitlement);
        const rentDebtNextMonth = labaBersih <= 0 && sewa > 0 && String(masters.sewa?.loss_rule || "").toUpperCase() === "JADI_HUTANG_BULAN_BERIKUTNYA"
            ? sewa
            : 0;
        const investorRentPayable = rentEntitlement && rentDebtNextMonth === 0 ? sewa : 0;

        return {
            mode: "READ_ONLY_CONSUMER",
            range,
            branch: { id: Number(branch.id), name: branch.nama_cabang },
            source: {
                pendapatan: "DailyDataEngine",
                payroll: "PayrollUnifiedEngine",
                providerMapping: "laporan_bulanan_provider_mapping (consumer metadata)",
                protek: "Proteksi/Cash Out canonical",
                cashOut: "daily_recap_source.cash_out + keterangan_cash_out",
                sewa: "master_biaya_sewa_tempat",
                investor: "master_investor",
                performance: "VAX AI Insight existing object"
            },
            pendapatan: {
                cukur: grossService,
                produkNett: nettProduct,
                total: pendapatan,
                customer: this.number(daily.summary?.customer),
                transaction: this.number(daily.summary?.transaction),
                services: this.number(daily.summary?.services),
                avgTicketCanonical: this.number(daily.summary?.avgTicket)
            },
            gaji: {
                payroll: gajiPayroll,
                providerMapped: gajiProviderMapped,
                protek: gajiProtek,
                svp: gajiSvp,
                total: totalGaji,
                payrollDetail: payroll.detail,
                providerMappedDetail: mappedProvider.resolved,
                providerPendingDetail: mappedProvider.pending,
                floatingUnallocatedAdjustments: payroll.floatingUnallocatedAdjustments
            },
            pengeluaran: {
                operasional,
                sewa,
                total: operasional + sewa,
                cashOutOfficial: cashOut.totals.officialCashOut,
                excludedPayrollDuplicate: cashOut.totals.excludedPayrollDuplicate,
                excludedRentDuplicate: cashOut.totals.excludedRentDuplicate,
                unparsedOfficialRemainder: cashOut.totals.unparsedOfficialRemainder,
                detail: cashOut.detail
            },
            laba: {
                totalPendapatan: pendapatan,
                totalBiaya,
                labaBersih
            },
            investor: masters.investor ? {
                nama: masters.investor.investor_name,
                persentase: investorPct,
                bagiHasil: investorShare,
                hakSewa: rentEntitlement,
                sewaDibayar: investorRentPayable,
                hutangSewaBulanBerikutnya: rentDebtNextMonth,
                totalHakBulanIni: investorShare + investorRentPayable
            } : null,
            master: masters,
            performance: this.summarizeInsight(insight),
            review: {
                status: mappedProvider.pending.length ? "BELUM_FINAL" : "MAPPING_PROVIDER_SELESAI",
                providerResolvedRows: mappedProvider.resolved.length,
                providerResolvedAmount: mappedProvider.resolvedAmount,
                providerPendingRows: mappedProvider.pending.length,
                providerPendingAmount: mappedProvider.pendingAmount
            },
            diagnostics: {
                payrollPendingMapping: payrollAll.pendingSummary || null,
                providerMapping: {
                    resolvedRows: mappedProvider.resolved.length,
                    resolvedAmount: mappedProvider.resolvedAmount,
                    pendingRows: mappedProvider.pending.length,
                    pendingAmount: mappedProvider.pendingAmount
                },
                floatingUnallocatedAdjustments: payroll.floatingUnallocatedAdjustments,
                cashOutParsedVsOfficialDifference: cashOut.totals.officialCashOut - cashOut.totals.parsedNominal
            }
        };
    }
};

if(typeof window !== "undefined"){
    window.LaporanBulananEngine = LaporanBulananEngine;
}
