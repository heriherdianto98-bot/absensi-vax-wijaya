/*
=========================================================
VAX ERP — NETT formula (OWNER LOCKED)
=========================================================
NETT ERP = nett_revenue (Minutes) + product_cost (Minutes)

Both values keep Minutes original sign (including negatives).
Product Cost is added EXACTLY ONCE here.
Gross / Cash / QRIS / Cash Out formulas are out of scope.
=========================================================
*/

const NettErp = {

    /**
     * @param {number|string|null|undefined} nettRevenue
     * @param {number|string|null|undefined} productCost
     * @returns {number}
     */
    fromParts(nettRevenue, productCost){
        return Number(nettRevenue || 0) + Number(productCost || 0);
    },

    /**
     * @param {{ nett_revenue?: unknown, product_cost?: unknown }|null|undefined} row
     * @returns {number}
     */
    fromRow(row){
        return this.fromParts(row?.nett_revenue, row?.product_cost);
    }
};

if(typeof window !== "undefined"){
    window.NettErp = NettErp;
}
