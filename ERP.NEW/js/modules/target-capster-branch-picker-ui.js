/* UI-only adapter: existing select and change handler remain the source. */
(function () {
'use strict';
const select = document.getElementById('tcoBranch');
if (!select || document.getElementById('tcoBranchPicker')) return;
const style = document.createElement('style');
style.textContent = `
.target-capster-owner-page .tco-branch-picker{position:relative;min-width:0;text-transform:none;letter-spacing:normal}
.target-capster-owner-page .tco-branch-trigger{width:100%;height:40px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 12px;border:1px solid #705a20;border-radius:10px;background:linear-gradient(180deg,#1d242b,#11171d);color:#f2f4f6;font-family:inherit;font-size:13px;font-weight:800;text-align:left;cursor:pointer}
.target-capster-owner-page .tco-branch-trigger:hover,.target-capster-owner-page .tco-branch-trigger[aria-expanded="true"]{border-color:#d3aa35}
.target-capster-owner-page .tco-branch-trigger:focus-visible,.target-capster-owner-page .tco-branch-option:focus-visible{outline:2px solid #e4bd50;outline-offset:2px}
.target-capster-owner-page .tco-branch-arrow{color:#d3aa35;font-size:16px}
.target-capster-owner-page .tco-branch-list{position:absolute;left:0;right:0;top:calc(100% + 7px);z-index:30;max-height:300px;overflow:auto;margin:0;padding:6px;border:1px solid #705a20;border-radius:12px;background:linear-gradient(180deg,#171e26,#0d1218);box-shadow:0 18px 36px #0009;scrollbar-width:thin;scrollbar-color:#806625 #151b22}
.target-capster-owner-page .tco-branch-list[hidden]{display:none}
.target-capster-owner-page .tco-branch-option{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;min-height:38px;border:0;border-radius:7px;padding:9px 10px;background:transparent;color:#e6eaf0;font-family:inherit;font-size:12px;font-weight:700;text-align:left;cursor:pointer}
.target-capster-owner-page .tco-branch-option:hover,.target-capster-owner-page .tco-branch-option:focus{background:#ffffff0c}
.target-capster-owner-page .tco-branch-option[aria-selected="true"]{background:#d3aa351b;color:#edc85c}
.target-capster-owner-page .tco-branch-trigger:disabled{opacity:.5;cursor:default}
`;
document.head.appendChild(style);
const wrap = document.createElement('div');
wrap.id = 'tcoBranchPicker'; wrap.className = 'tco-branch-picker';
const trigger = document.createElement('button');
trigger.type = 'button'; trigger.className = 'tco-branch-trigger';
trigger.setAttribute('aria-haspopup', 'listbox'); trigger.setAttribute('aria-expanded', 'false');
trigger.setAttribute('aria-controls', 'tcoBranchList');
const caption = document.createElement('span');
const arrow = document.createElement('span'); arrow.className = 'tco-branch-arrow'; arrow.textContent = '⌄'; arrow.setAttribute('aria-hidden', 'true');
trigger.append(caption, arrow);
const list = document.createElement('div');
list.id = 'tcoBranchList'; list.className = 'tco-branch-list'; list.hidden = true;
list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', 'Cabang');
wrap.append(trigger, list); select.after(wrap);
function close(focus) { list.hidden = true; trigger.setAttribute('aria-expanded', 'false'); if(focus) trigger.focus(); }
function sync() {
 caption.textContent = select.selectedOptions[0]?.textContent || 'Semua Cabang';
 trigger.setAttribute('aria-label', 'Cabang: ' + caption.textContent); trigger.disabled = select.disabled;
 list.replaceChildren();
 Array.from(select.options).forEach(option => {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'tco-branch-option';
  button.setAttribute('role', 'option'); button.setAttribute('aria-selected', String(option.selected)); button.disabled = option.disabled;
  const name = document.createElement('span'); name.textContent = option.textContent; button.append(name);
  if(option.selected) { const mark = document.createElement('span'); mark.textContent = '✓'; mark.setAttribute('aria-hidden','true'); button.append(mark); }
  button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); const changed = select.value !== option.value; select.value = option.value; sync(); close(true); if(changed) select.dispatchEvent(new Event('change', {bubbles:true})); });
  list.append(button);
 });
}
function open() { sync(); list.hidden = false; trigger.setAttribute('aria-expanded','true'); (list.querySelector('[aria-selected="true"]') || list.firstElementChild)?.focus(); }
trigger.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); if(list.hidden) open(); else close(false); });
wrap.addEventListener('keydown', event => {
 const buttons = Array.from(list.querySelectorAll('button:not(:disabled)'));
 if(event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
 else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
  event.preventDefault(); if(list.hidden) { open(); return; }
  let index = buttons.indexOf(document.activeElement);
  index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length-1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
  buttons[index]?.focus();
 } else if(event.key === 'Tab') close(false);
});
document.addEventListener('click', event => { if(!wrap.contains(event.target)) close(false); });
select.addEventListener('change', sync);
new MutationObserver(sync).observe(select, {childList:true,subtree:true,attributes:true,attributeFilter:['disabled','selected']});
sync(); select.hidden = true;
})();
