const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const classes=()=>({items:new Set(),add(x){this.items.add(x)},remove(x){this.items.delete(x)},contains(x){return this.items.has(x)},toggle(x,force){if(force)this.add(x);else this.remove(x)}});
const frame=()=>({classList:classes(),attrs:{},contentWindow:{postMessage(){}},style:{height:'568px'},
    setAttribute(k,v){this.attrs[k]=v},hasAttribute(k){return k in this.attrs},removeAttribute(k){delete this.attrs[k]},
    showPopover(){this.open=true},hidePopover(){this.open=false}});
const full=frame(),tenK=frame(),root=classes(),listeners={};
const source=fs.readFileSync('app.js','utf8');
const scope=source.slice(source.indexOf('let fullscreenMapFrame ='),source.indexOf('function watchCourseMap('));
const context=vm.createContext({$:id=>id==='courseMapFrame'?full:tenK,window:{scrollX:0,scrollY:520,scrollTo(x,y){this.restored=[x,y]},addEventListener(type,fn){listeners[type]=fn}},document:{documentElement:{classList:root},addEventListener(type,fn){listeners[type]=fn}}});
vm.runInContext(scope,context);
const send=(f,active)=>listeners.message({source:f.contentWindow,data:{type:'marathon-map-fullscreen',active}});
send({contentWindow:{}},true);assert.equal(full.open,undefined);
send(full,true);assert.equal(full.open,true);assert.ok(root.contains('map-fullscreen'));assert.ok(full.classList.contains('is-map-fullscreen'));assert.equal(full.style.height,'568px');
send(full,true);assert.equal(full.open,true);
send(tenK,true);assert.equal(full.open,false);assert.equal(tenK.open,true);
send(full,false);assert.ok(root.contains('map-fullscreen'));
send(tenK,false);assert.equal(tenK.open,false);assert.ok(!root.contains('map-fullscreen'));assert.ok(!tenK.hasAttribute('popover'));assert.deepEqual([...context.window.restored],[0,520]);
tenK.showPopover=undefined;send(tenK,true);assert.ok(tenK.classList.contains('is-map-fullscreen'));send(tenK,false);
console.log('PASS: validated iframe messages, viewport top-layer entry, idempotence, map switch, close, and CSS fallback; iframe source/height untouched');
