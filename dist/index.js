class t{key;parent=null;children={};_store=new Set;constructor(t,r=[]){this.key=t,Array.isArray(r)&&(this._store=new Set(r))}addValues(t=[]){return(t||[]).forEach((t=>this._store.add(t))),this}setValues(t=[]){return this._store.clear(),this.addValues(t)}getValues(){return Array.from(this._store)}getWord(){let t=[],r=this;for(;null!==r;)t.unshift(r.key),r=r.parent;return t.join("")}getChildrenCount(){return Object.keys(this.children).length-1}}class r{static DUMP_VALUES_KEY="__";_root=new t(null);clear(){this._root=new t(null)}insert(r,e=null){let n=this._root;for(let o of r)n.children[o]?n.children[o].addValues(e):(n.children[o]=new t(o,e),n.children[o].parent=n),n=n.children[o]}find(t){let r=this._root;for(let e of t){if(!r.children[e])return null;r=r.children[e]}return r}remove(t){let r=this.find(t);if(!r)return!1;for(;r.parent.key;)delete r.children,delete r.parent.children[r.key],r=r.parent;return r.setValues(Object.values(r.children).reduce(((t,r)=>[...t,...r.getValues()]),[])),!0}toJSON(){return this.dump()}dump(){let t={};const e=(t,n)=>{for(let i of Object.values(t.children))n[i.key]||={[r.DUMP_VALUES_KEY]:[]},n[i.key][r.DUMP_VALUES_KEY]=(o=[...n[i.key][r.DUMP_VALUES_KEY],...i.getValues()],Array.from(new Set(o))),e(i,n[i.key]);var o};return e(this._root,t),t}restore(t){this.clear();const e={},n=(t,o)=>{for(let[i,s]of Object.entries(t))i!==r.DUMP_VALUES_KEY&&(o+=i,e[o]||=[],e[o]=[...e[o],...s[r.DUMP_VALUES_KEY]],n(t[i],o),o="")};return n(t,""),Object.entries(e).forEach((([t,r])=>this.insert(t,r))),this}}function e(t,r){for(var e=-1,n=null==t?0:t.length,o=Array(n);++e<n;)o[e]=r(t[e],e,t);return o}var n="object"==typeof global&&global&&global.Object===Object&&global,o="object"==typeof self&&self&&self.Object===Object&&self,i=n||o||Function("return this")(),s=i.Symbol,a=Object.prototype,u=a.hasOwnProperty,l=a.toString,c=s?s.toStringTag:void 0;var h=Object.prototype.toString;var f=s?s.toStringTag:void 0;function p(t){return null==t?void 0===t?"[object Undefined]":"[object Null]":f&&f in Object(t)?function(t){var r=u.call(t,c),e=t[c];try{t[c]=void 0;var n=!0}catch(t){}var o=l.call(t);return n&&(r?t[c]=e:delete t[c]),o}(t):function(t){return h.call(t)}(t)}function _(t){var r=typeof t;return null!=t&&("object"==r||"function"==r)}function d(t){if(!_(t))return!1;var r=p(t);return"[object Function]"==r||"[object GeneratorFunction]"==r||"[object AsyncFunction]"==r||"[object Proxy]"==r}var v,y=i["__core-js_shared__"],g=(v=/[^.]+$/.exec(y&&y.keys&&y.keys.IE_PROTO||""))?"Symbol(src)_1."+v:"";var b=Function.prototype.toString;var j=/^\[object .+?Constructor\]$/,S=Function.prototype,O=Object.prototype,m=S.toString,w=O.hasOwnProperty,A=RegExp("^"+m.call(w).replace(/[\\^$.*+?()[\]{}|]/g,"\\$&").replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g,"$1.*?")+"$");function E(t){return!(!_(t)||(r=t,g&&g in r))&&(d(t)?A:j).test(function(t){if(null!=t){try{return b.call(t)}catch(t){}try{return t+""}catch(t){}}return""}(t));var r}function V(t,r){var e=function(t,r){return null==t?void 0:t[r]}(t,r);return E(e)?e:void 0}var z=V(Object,"create");var P=Object.prototype.hasOwnProperty;var k=Object.prototype.hasOwnProperty;function U(t){var r=-1,e=null==t?0:t.length;for(this.clear();++r<e;){var n=t[r];this.set(n[0],n[1])}}function x(t,r){for(var e,n,o=t.length;o--;)if((e=t[o][0])===(n=r)||e!=e&&n!=n)return o;return-1}U.prototype.clear=function(){this.__data__=z?z(null):{},this.size=0},U.prototype.delete=function(t){var r=this.has(t)&&delete this.__data__[t];return this.size-=r?1:0,r},U.prototype.get=function(t){var r=this.__data__;if(z){var e=r[t];return"__lodash_hash_undefined__"===e?void 0:e}return P.call(r,t)?r[t]:void 0},U.prototype.has=function(t){var r=this.__data__;return z?void 0!==r[t]:k.call(r,t)},U.prototype.set=function(t,r){var e=this.__data__;return this.size+=this.has(t)?0:1,e[t]=z&&void 0===r?"__lodash_hash_undefined__":r,this};var M=Array.prototype.splice;function L(t){var r=-1,e=null==t?0:t.length;for(this.clear();++r<e;){var n=t[r];this.set(n[0],n[1])}}L.prototype.clear=function(){this.__data__=[],this.size=0},L.prototype.delete=function(t){var r=this.__data__,e=x(r,t);return!(e<0)&&(e==r.length-1?r.pop():M.call(r,e,1),--this.size,!0)},L.prototype.get=function(t){var r=this.__data__,e=x(r,t);return e<0?void 0:r[e][1]},L.prototype.has=function(t){return x(this.__data__,t)>-1},L.prototype.set=function(t,r){var e=this.__data__,n=x(e,t);return n<0?(++this.size,e.push([t,r])):e[n][1]=r,this};var D=V(i,"Map");function W(t,r){var e,n,o=t.__data__;return("string"==(n=typeof(e=r))||"number"==n||"symbol"==n||"boolean"==n?"__proto__"!==e:null===e)?o["string"==typeof r?"string":"hash"]:o.map}function F(t){var r=-1,e=null==t?0:t.length;for(this.clear();++r<e;){var n=t[r];this.set(n[0],n[1])}}F.prototype.clear=function(){this.size=0,this.__data__={hash:new U,map:new(D||L),string:new U}},F.prototype.delete=function(t){var r=W(this,t).delete(t);return this.size-=r?1:0,r},F.prototype.get=function(t){return W(this,t).get(t)},F.prototype.has=function(t){return W(this,t).has(t)},F.prototype.set=function(t,r){var e=W(this,t),n=e.size;return e.set(t,r),this.size+=e.size==n?0:1,this};function $(t){var r=-1,e=null==t?0:t.length;for(this.__data__=new F;++r<e;)this.add(t[r])}function K(t){return t!=t}function Y(t,r){return!!(null==t?0:t.length)&&function(t,r,e){return r==r?function(t,r,e){for(var n=e-1,o=t.length;++n<o;)if(t[n]===r)return n;return-1}(t,r,e):function(t,r,e,n){for(var o=t.length,i=e+(n?1:-1);n?i--:++i<o;)if(r(t[i],i,t))return i;return-1}(t,K,e)}(t,r,0)>-1}function N(t,r,e){for(var n=-1,o=null==t?0:t.length;++n<o;)if(e(r,t[n]))return!0;return!1}function q(t){return function(r){return t(r)}}function C(t,r){return t.has(r)}$.prototype.add=$.prototype.push=function(t){return this.__data__.set(t,"__lodash_hash_undefined__"),this},$.prototype.has=function(t){return this.__data__.has(t)};var R=Math.min;function J(t){return t}function T(t,r,e){switch(e.length){case 0:return t.call(r);case 1:return t.call(r,e[0]);case 2:return t.call(r,e[0],e[1]);case 3:return t.call(r,e[0],e[1],e[2])}return t.apply(r,e)}var Q=Math.max;var B=function(){try{var t=V(Object,"defineProperty");return t({},"",{}),t}catch(t){}}(),G=B?function(t,r){return B(t,"toString",{configurable:!0,enumerable:!1,value:(e=r,function(){return e}),writable:!0});var e}:J,I=Date.now;var H,X,Z,tt=(H=G,X=0,Z=0,function(){var t=I(),r=16-(t-Z);if(Z=t,r>0){if(++X>=800)return arguments[0]}else X=0;return H.apply(void 0,arguments)});function rt(t){return function(t){return null!=t&&"object"==typeof t}(t)&&function(t){return null!=t&&function(t){return"number"==typeof t&&t>-1&&t%1==0&&t<=9007199254740991}(t.length)&&!d(t)}(t)}function et(t){return rt(t)?t:[]}var nt=function(t,r){return tt(function(t,r,e){return r=Q(void 0===r?t.length-1:r,0),function(){for(var n=arguments,o=-1,i=Q(n.length-r,0),s=Array(i);++o<i;)s[o]=n[r+o];o=-1;for(var a=Array(r+1);++o<r;)a[o]=n[o];return a[r]=e(s),T(t,this,a)}}(t,r,J),t+"")}((function(t){var r=e(t,et);return r.length&&r[0]===t[0]?function(t,r,n){for(var o=n?N:Y,i=t[0].length,s=t.length,a=s,u=Array(s),l=1/0,c=[];a--;){var h=t[a];a&&r&&(h=e(h,q(r))),l=R(h.length,l),u[a]=!n&&(r||i>=120&&h.length>=120)?new $(a&&h):void 0}h=t[0];var f=-1,p=u[0];t:for(;++f<i&&c.length<l;){var _=h[f],d=r?r(_):_;if(_=n||0!==_?_:0,!(p?C(p,d):o(c,d,n))){for(a=s;--a;){var v=u[a];if(!(v?C(v,d):o(t[a],d,n)))continue t}p&&p.push(d),c.push(_)}}return c}(r):[]}));class ot{options;static defaultOptions={caseSensitive:!1,accentSensitive:!1,isStopword:t=>!1,normalizeWord:t=>t,processResults:(t,r)=>t,parseQuery:t=>({query:t,operators:null}),querySomeWordMinLength:1};_index=new r;constructor(t={}){this.options=t,this.options={...ot.defaultOptions,...this.options}}clear(){return this._index.clear(),this}toWords(t){let r=`${t}`.trim().replace(/\s\s+/g," ").split(" ").map((t=>(this.options.isStopword(t)&&(t=null),t&&(t=this.options.normalizeWord(t)),t&&this.options.isStopword(t)&&(t=null),t&&!this.options.caseSensitive&&(t=t.toLowerCase()),t&&!this.options.accentSensitive&&(t=t.normalize("NFD").replace(/[\u0300-\u036f]/g,"")),t))).filter(Boolean);return Array.from(new Set(r))}add(t,r){if(void 0===r)return!1;const e=this.toWords(t);return!!e.length&&(e.forEach((t=>this._index.insert(t,[r]))),!0)}search(t){const{parseQuery:r,querySomeWordMinLength:e,processResults:n}=this.options,o=r(t),i=o.operators&&Object.keys(o.operators).length>0,s=this.toWords(o.query);if(!i&&!s.length)return[];if(!i&&!s.some((t=>t.length>=e)))return[];s.length;const a=[];for(let t of s){const r=this._index.find(t);if(!r)return[];a.push(r.getValues())}return n(nt(...a),o)}dump(){return JSON.stringify(this._index.dump())}restore(t){return"string"==typeof t&&(t=JSON.parse(t)),this._index.restore(t),this}}export{ot as Searchable,r as Trie};