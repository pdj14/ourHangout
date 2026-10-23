/* Optional rich text and media fields preserve schema 1 plaintext/legacy photos. */
'use strict';
window.DiaryFeatures=(()=>{
 const allowed=new Set(['B','STRONG','I','EM','U','S','STRIKE','P','DIV','BR','UL','OL','LI','BLOCKQUOTE','H2','H3','SPAN','FONT']);
 function sanitize(html){
  if(!html)return '';
  const t=document.createElement('template');t.innerHTML=String(html||'').slice(0,1000000);
  function clean(parent){for(const n of [...parent.childNodes]){if(n.nodeType===3)continue;if(n.nodeType!==1){n.remove();continue;}if(['SCRIPT','STYLE','IFRAME','OBJECT','SVG','MATH'].includes(n.tagName)){n.remove();continue;}clean(n);if(!allowed.has(n.tagName)){n.replaceWith(...n.childNodes);continue;}const face=n.getAttribute('face'),color=n.getAttribute('color'),size=n.getAttribute('size'),style=n.getAttribute('style');for(const a of [...n.attributes])n.removeAttribute(a.name);if(style){const probe=document.createElement('span');probe.setAttribute('style',style);for(const k of ['color','background-color','font-size','font-weight','font-style','text-decoration','text-align']){const v=probe.style.getPropertyValue(k);if(v&&!/url|expression|var\(/i.test(v))n.style.setProperty(k,v);}}if(n.tagName==='FONT'){if(['sans-serif','serif','monospace'].includes(face))n.setAttribute('face',face);if(color&&/^#[0-9a-f]{3,8}$/i.test(color))n.setAttribute('color',color);if(size&&/^[1-7]$/.test(size))n.setAttribute('size',size);}}}clean(t.content);return t.innerHTML;
 }
 function attachments(list){if(list===undefined)return [];if(!Array.isArray(list)||list.length>100)throw Error('첨부 파일은 기록마다 100개까지 담을 수 있어요.');return list.map(a=>{if(!a||typeof a.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(a.id)||typeof a.name!=='string'||a.name.length>300||typeof a.mime!=='string'||!/^[-a-zA-Z0-9.+]+\/[-a-zA-Z0-9.+]+$/.test(a.mime)||!Number.isFinite(a.size)||a.size<0||a.size>128*1024*1024||!['image','video','audio','file'].includes(a.kind))throw Error('첨부 파일 정보가 올바르지 않아요.');if(a.kind!=='file'&&!a.mime.startsWith(a.kind+'/'))throw Error('첨부 파일 형식이 올바르지 않아요.');return {id:a.id,name:a.name,mime:a.mime,size:a.size,kind:a.kind,...(typeof a.sha256==='string'&&/^[0-9a-f]{64}$/.test(a.sha256)?{sha256:a.sha256}:{}),url:'https://diary.local/media/'+a.id,...(Number.isFinite(a.duration)&&a.duration>=0?{duration:a.duration}:{})};});}
 function normalizeTemplates(list){
  if(list===undefined)return [];
  if(!Array.isArray(list)||list.length>20)throw Error('나만의 템플릿은 20개까지 보관할 수 있어요.');
  const names=new Set();
  return list.map(t=>{
   if(!t||typeof t!=='object'||typeof t.name!=='string'||!t.name.trim()||t.name.trim().length>40||typeof t.body!=='string'||t.body.length>200000||(t.title!==undefined&&(typeof t.title!=='string'||t.title.length>200))||(t.bodyHtml!==undefined&&(typeof t.bodyHtml!=='string'||t.bodyHtml.length>1000000)))throw Error('템플릿 형식이나 글자 수를 확인해 주세요.');
   const name=t.name.trim();if(names.has(name))throw Error('같은 이름의 템플릿이 중복되어 있어요.');names.add(name);
   return {name,title:t.title||'',body:t.body,bodyHtml:sanitize(t.bodyHtml||''),paper:['plain','lavender','blush','mint','cream'].includes(t.paper)?t.paper:'plain'};
  });
 }
 const size=n=>n>=1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.ceil(n/1024))+' KB';
 return {sanitize,attachments,size,normalizeTemplates};
})();
