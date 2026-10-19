import test from 'node:test';
import assert from 'node:assert/strict';
import { publicPageScript } from '../src/public-page.js';

// Isolate the actual browser helper, not a reimplementation.
const helper=publicPageScript.slice(publicPageScript.indexOf('function shareControl('),publicPageScript.indexOf('function about('));
function element(tag){
 return {tag,children:[],append(...values){this.children.push(...values)},setAttribute(){},style:{},querySelector(){return this.children.find(c=>c.tag==='input')},focus(){},select(){}};
}
const setup=navigator=>{
 const factory=new Function('navigator','document','location','lang','node',helper+';return shareControl;');
 const share=factory(navigator,{createElement:element},{origin:'https://alerts.example'},'ja',(tag,value)=>Object.assign(element(tag),{textContent:value}));
 const group=share({id:'a'.repeat(64)},{title:'Alert'});return {group,button:group.children[0],status:group.children[1]};
};
test('sharing is compact, right aligned and below the Cyber Care introduction',()=>{
 const {group,button}=setup({});
 assert.equal(group.tag,'div');assert.equal(group.style.textAlign,'right');
 assert.equal(button.style.fontSize,'0.85rem');assert.equal(button.style.minHeight,'36px');
 assert.match(publicPageScript,/article.append\(about\(t\),shareControl\(a,c\)\)/);
});
test('share menu receives only a public canonical bulletin URL',async()=>{
 let content;const {button}=setup({share:async data=>{content=data}});
 await button.onclick();assert.equal(content.url,'https://alerts.example/alerts?id='+'a'.repeat(64));assert.equal(button.disabled,false);
});
test('unsupported native sharing falls back to clipboard',async()=>{
 let copied;const {button,status}=setup({clipboard:{writeText:async url=>{copied=url}}});
 await button.onclick();assert.match(copied,/\/alerts\?id=/);assert.match(status.textContent,/コピーしました/);
});
test('cancelled sharing does not copy or send anything else',async()=>{
 let copied=false;const {button}=setup({share:async()=>{throw Object.assign(Error(),{name:'AbortError'})},clipboard:{writeText:async()=>{copied=true}}});
 await button.onclick();assert.equal(copied,false);assert.equal(button.disabled,false);
});
test('blocked clipboard provides a read-only URL for manual copying',async()=>{
 const {group,button,status}=setup({clipboard:{writeText:async()=>{throw Error()}}});
 await button.onclick();assert.equal(group.children.at(-1).readOnly,true);assert.match(status.textContent,/選択してコピー/);
});
