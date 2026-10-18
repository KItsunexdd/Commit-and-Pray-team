function e(e,t){this.x=e,this.y=t}e.prototype={clone(){return new e(this.x,this.y)},add(e){return this.clone()._add(e)},sub(e){return this.clone()._sub(e)},multByPoint(e){return this.clone()._multByPoint(e)},divByPoint(e){return this.clone()._divByPoint(e)},mult(e){return this.clone()._mult(e)},div(e){return this.clone()._div(e)},rotate(e){return this.clone()._rotate(e)},rotateAround(e,t){return this.clone()._rotateAround(e,t)},matMult(e){return this.clone()._matMult(e)},unit(){return this.clone()._unit()},perp(){return this.clone()._perp()},round(){return this.clone()._round()},mag(){return Math.sqrt(this.x*this.x+this.y*this.y)},equals(e){return this.x===e.x&&this.y===e.y},dist(e){return Math.sqrt(this.distSqr(e))},distSqr(e){let t=e.x-this.x,n=e.y-this.y;return t*t+n*n},angle(){return Math.atan2(this.y,this.x)},angleTo(e){return Math.atan2(this.y-e.y,this.x-e.x)},angleWith(e){return this.angleWithSep(e.x,e.y)},angleWithSep(e,t){return Math.atan2(this.x*t-this.y*e,this.x*e+this.y*t)},_matMult(e){let t=e[0]*this.x+e[1]*this.y,n=e[2]*this.x+e[3]*this.y;return this.x=t,this.y=n,this},_add(e){return this.x+=e.x,this.y+=e.y,this},_sub(e){return this.x-=e.x,this.y-=e.y,this},_mult(e){return this.x*=e,this.y*=e,this},_div(e){return this.x/=e,this.y/=e,this},_multByPoint(e){return this.x*=e.x,this.y*=e.y,this},_divByPoint(e){return this.x/=e.x,this.y/=e.y,this},_unit(){return this._div(this.mag()),this},_perp(){let e=this.y;return this.y=this.x,this.x=-e,this},_rotate(e){let t=Math.cos(e),n=Math.sin(e),r=t*this.x-n*this.y,i=n*this.x+t*this.y;return this.x=r,this.y=i,this},_rotateAround(e,t){let n=Math.cos(e),r=Math.sin(e),i=t.x+n*(this.x-t.x)-r*(this.y-t.y),a=t.y+r*(this.x-t.x)+n*(this.y-t.y);return this.x=i,this.y=a,this},_round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this},constructor:e},e.convert=function(t){if(t instanceof e)return t;if(Array.isArray(t))return new e(+t[0],+t[1]);if(t.x!==void 0&&t.y!==void 0)return new e(+t.x,+t.y);throw Error(`Expected [x, y] or {x, y} point format`)};function t(e,t,n,r){let i=3*e,a=3*(n-e)-i,o=1-i-a,s=3*t,c=3*(r-t)-s,l=1-s-c;return function(e,t=1e-6){if(e<=0)return 0;if(e>=1)return 1;let n=e;for(let r=0;r<8;r++){let r=((o*n+a)*n+i)*n-e;if(Math.abs(r)<t)return((l*n+c)*n+s)*n;let u=(3*o*n+2*a)*n+i;if(Math.abs(u)<1e-6)break;n-=r/u}let r=0,u=1;n=e;for(let s=0;s<20;s++){let s=((o*n+a)*n+i)*n;if(Math.abs(s-e)<t)break;e>s?r=n:u=n,n=(r+u)*.5}return((l*n+c)*n+s)*n}}var n;function r(){return n??=typeof OffscreenCanvas<`u`&&!!new OffscreenCanvas(1,1).getContext(`2d`)&&typeof createImageBitmap==`function`,n}var i;function a(){if(i==null&&(i=!1,r())){let e=new OffscreenCanvas(5,5).getContext(`2d`,{willReadFrequently:!0});if(e){for(let t=0;t<25;t++){let n=t*4;e.fillStyle=`rgb(${n},${n+1},${n+2})`,e.fillRect(t%5,Math.floor(t/5),1,1)}let t=e.getImageData(0,0,5,5).data;for(let e=0;e<100;e++)if(e%4!=3&&t[e]!==e){i=!0;break}}}return i||!1}var o=typeof Float32Array<`u`?Float32Array:Array;function s(){var e=new o(9);return o!=Float32Array&&(e[1]=0,e[2]=0,e[3]=0,e[5]=0,e[6]=0,e[7]=0),e[0]=1,e[4]=1,e[8]=1,e}function c(e){var t=e[0],n=e[1],r=e[2],i=e[3],a=e[4],o=e[5],s=e[6],c=e[7],l=e[8];return t*(l*a-o*c)+n*(-l*i+o*s)+r*(c*i-a*s)}function l(e,t){var n=Math.sin(t),r=Math.cos(t);return e[0]=r,e[1]=n,e[2]=0,e[3]=-n,e[4]=r,e[5]=0,e[6]=0,e[7]=0,e[8]=1,e}function u(e,t){var n=t[0],r=t[1],i=t[2],a=t[3],o=n+n,s=r+r,c=i+i,l=n*o,u=r*o,d=r*s,f=i*o,p=i*s,m=i*c,h=a*o,g=a*s,_=a*c;return e[0]=1-d-m,e[3]=u-_,e[6]=f+g,e[1]=u+_,e[4]=1-l-m,e[7]=p-h,e[2]=f-g,e[5]=p+h,e[8]=1-l-d,e}function d(){var e=new o(16);return o!=Float32Array&&(e[1]=0,e[2]=0,e[3]=0,e[4]=0,e[6]=0,e[7]=0,e[8]=0,e[9]=0,e[11]=0,e[12]=0,e[13]=0,e[14]=0),e[0]=1,e[5]=1,e[10]=1,e[15]=1,e}function f(e){var t=new o(16);return t[0]=e[0],t[1]=e[1],t[2]=e[2],t[3]=e[3],t[4]=e[4],t[5]=e[5],t[6]=e[6],t[7]=e[7],t[8]=e[8],t[9]=e[9],t[10]=e[10],t[11]=e[11],t[12]=e[12],t[13]=e[13],t[14]=e[14],t[15]=e[15],t}function p(e,t){return e[0]=t[0],e[1]=t[1],e[2]=t[2],e[3]=t[3],e[4]=t[4],e[5]=t[5],e[6]=t[6],e[7]=t[7],e[8]=t[8],e[9]=t[9],e[10]=t[10],e[11]=t[11],e[12]=t[12],e[13]=t[13],e[14]=t[14],e[15]=t[15],e}function m(e){return e[0]=1,e[1]=0,e[2]=0,e[3]=0,e[4]=0,e[5]=1,e[6]=0,e[7]=0,e[8]=0,e[9]=0,e[10]=1,e[11]=0,e[12]=0,e[13]=0,e[14]=0,e[15]=1,e}function h(e,t){var n=t[0],r=t[1],i=t[2],a=t[3],o=t[4],s=t[5],c=t[6],l=t[7],u=t[8],d=t[9],f=t[10],p=t[11],m=t[12],h=t[13],g=t[14],_=t[15],v=n*s-r*o,y=n*c-i*o,b=n*l-a*o,x=r*c-i*s,S=r*l-a*s,C=i*l-a*c,w=u*h-d*m,T=u*g-f*m,E=u*_-p*m,D=d*g-f*h,O=d*_-p*h,k=f*_-p*g,A=v*k-y*O+b*D+x*E-S*T+C*w;return A?(A=1/A,e[0]=(s*k-c*O+l*D)*A,e[1]=(i*O-r*k-a*D)*A,e[2]=(h*C-g*S+_*x)*A,e[3]=(f*S-d*C-p*x)*A,e[4]=(c*E-o*k-l*T)*A,e[5]=(n*k-i*E+a*T)*A,e[6]=(g*b-m*C-_*y)*A,e[7]=(u*C-f*b+p*y)*A,e[8]=(o*O-s*E+l*w)*A,e[9]=(r*E-n*O-a*w)*A,e[10]=(m*S-h*b+_*v)*A,e[11]=(d*b-u*S-p*v)*A,e[12]=(s*T-o*D-c*w)*A,e[13]=(n*D-r*T+i*w)*A,e[14]=(h*y-m*x-g*v)*A,e[15]=(u*x-d*y+f*v)*A,e):null}function g(e,t,n){var r=t[0],i=t[1],a=t[2],o=t[3],s=t[4],c=t[5],l=t[6],u=t[7],d=t[8],f=t[9],p=t[10],m=t[11],h=t[12],g=t[13],_=t[14],v=t[15],y=n[0],b=n[1],x=n[2],S=n[3];return e[0]=y*r+b*s+x*d+S*h,e[1]=y*i+b*c+x*f+S*g,e[2]=y*a+b*l+x*p+S*_,e[3]=y*o+b*u+x*m+S*v,y=n[4],b=n[5],x=n[6],S=n[7],e[4]=y*r+b*s+x*d+S*h,e[5]=y*i+b*c+x*f+S*g,e[6]=y*a+b*l+x*p+S*_,e[7]=y*o+b*u+x*m+S*v,y=n[8],b=n[9],x=n[10],S=n[11],e[8]=y*r+b*s+x*d+S*h,e[9]=y*i+b*c+x*f+S*g,e[10]=y*a+b*l+x*p+S*_,e[11]=y*o+b*u+x*m+S*v,y=n[12],b=n[13],x=n[14],S=n[15],e[12]=y*r+b*s+x*d+S*h,e[13]=y*i+b*c+x*f+S*g,e[14]=y*a+b*l+x*p+S*_,e[15]=y*o+b*u+x*m+S*v,e}function _(e,t,n){var r=n[0],i=n[1],a=n[2],o,s,c,l,u,d,f,p,m,h,g,_;return t===e?(e[12]=t[0]*r+t[4]*i+t[8]*a+t[12],e[13]=t[1]*r+t[5]*i+t[9]*a+t[13],e[14]=t[2]*r+t[6]*i+t[10]*a+t[14],e[15]=t[3]*r+t[7]*i+t[11]*a+t[15]):(o=t[0],s=t[1],c=t[2],l=t[3],u=t[4],d=t[5],f=t[6],p=t[7],m=t[8],h=t[9],g=t[10],_=t[11],e[0]=o,e[1]=s,e[2]=c,e[3]=l,e[4]=u,e[5]=d,e[6]=f,e[7]=p,e[8]=m,e[9]=h,e[10]=g,e[11]=_,e[12]=o*r+u*i+m*a+t[12],e[13]=s*r+d*i+h*a+t[13],e[14]=c*r+f*i+g*a+t[14],e[15]=l*r+p*i+_*a+t[15]),e}function v(e,t,n){var r=n[0],i=n[1],a=n[2];return e[0]=t[0]*r,e[1]=t[1]*r,e[2]=t[2]*r,e[3]=t[3]*r,e[4]=t[4]*i,e[5]=t[5]*i,e[6]=t[6]*i,e[7]=t[7]*i,e[8]=t[8]*a,e[9]=t[9]*a,e[10]=t[10]*a,e[11]=t[11]*a,e[12]=t[12],e[13]=t[13],e[14]=t[14],e[15]=t[15],e}function y(e,t,n){var r=Math.sin(n),i=Math.cos(n),a=t[4],o=t[5],s=t[6],c=t[7],l=t[8],u=t[9],d=t[10],f=t[11];return t!==e&&(e[0]=t[0],e[1]=t[1],e[2]=t[2],e[3]=t[3],e[12]=t[12],e[13]=t[13],e[14]=t[14],e[15]=t[15]),e[4]=a*i+l*r,e[5]=o*i+u*r,e[6]=s*i+d*r,e[7]=c*i+f*r,e[8]=l*i-a*r,e[9]=u*i-o*r,e[10]=d*i-s*r,e[11]=f*i-c*r,e}function b(e,t,n){var r=Math.sin(n),i=Math.cos(n),a=t[0],o=t[1],s=t[2],c=t[3],l=t[8],u=t[9],d=t[10],f=t[11];return t!==e&&(e[4]=t[4],e[5]=t[5],e[6]=t[6],e[7]=t[7],e[12]=t[12],e[13]=t[13],e[14]=t[14],e[15]=t[15]),e[0]=a*i-l*r,e[1]=o*i-u*r,e[2]=s*i-d*r,e[3]=c*i-f*r,e[8]=a*r+l*i,e[9]=o*r+u*i,e[10]=s*r+d*i,e[11]=c*r+f*i,e}function x(e,t,n){var r=Math.sin(n),i=Math.cos(n),a=t[0],o=t[1],s=t[2],c=t[3],l=t[4],u=t[5],d=t[6],f=t[7];return t!==e&&(e[8]=t[8],e[9]=t[9],e[10]=t[10],e[11]=t[11],e[12]=t[12],e[13]=t[13],e[14]=t[14],e[15]=t[15]),e[0]=a*i+l*r,e[1]=o*i+u*r,e[2]=s*i+d*r,e[3]=c*i+f*r,e[4]=l*i-a*r,e[5]=u*i-o*r,e[6]=d*i-s*r,e[7]=f*i-c*r,e}function S(e,t){return e[0]=t[0],e[1]=0,e[2]=0,e[3]=0,e[4]=0,e[5]=t[1],e[6]=0,e[7]=0,e[8]=0,e[9]=0,e[10]=t[2],e[11]=0,e[12]=0,e[13]=0,e[14]=0,e[15]=1,e}function C(e,t,n,r,i){var a=1/Math.tan(t/2);if(e[0]=a/n,e[1]=0,e[2]=0,e[3]=0,e[4]=0,e[5]=a,e[6]=0,e[7]=0,e[8]=0,e[9]=0,e[11]=-1,e[12]=0,e[13]=0,e[15]=0,i!=null&&i!==1/0){var o=1/(r-i);e[10]=(i+r)*o,e[14]=2*i*r*o}else e[10]=-1,e[14]=-2*r;return e}var w=C;function T(e,t,n,r,i,a,o){var s=1/(t-n),c=1/(r-i),l=1/(a-o);return e[0]=-2*s,e[1]=0,e[2]=0,e[3]=0,e[4]=0,e[5]=-2*c,e[6]=0,e[7]=0,e[8]=0,e[9]=0,e[10]=2*l,e[11]=0,e[12]=(t+n)*s,e[13]=(i+r)*c,e[14]=(o+a)*l,e[15]=1,e}var E=T;function D(e,t){return e[0]===t[0]&&e[1]===t[1]&&e[2]===t[2]&&e[3]===t[3]&&e[4]===t[4]&&e[5]===t[5]&&e[6]===t[6]&&e[7]===t[7]&&e[8]===t[8]&&e[9]===t[9]&&e[10]===t[10]&&e[11]===t[11]&&e[12]===t[12]&&e[13]===t[13]&&e[14]===t[14]&&e[15]===t[15]}function O(e,t){var n=e[0],r=e[1],i=e[2],a=e[3],o=e[4],s=e[5],c=e[6],l=e[7],u=e[8],d=e[9],f=e[10],p=e[11],m=e[12],h=e[13],g=e[14],_=e[15],v=t[0],y=t[1],b=t[2],x=t[3],S=t[4],C=t[5],w=t[6],T=t[7],E=t[8],D=t[9],O=t[10],k=t[11],A=t[12],j=t[13],M=t[14],N=t[15];return Math.abs(n-v)<=1e-6*Math.max(1,Math.abs(n),Math.abs(v))&&Math.abs(r-y)<=1e-6*Math.max(1,Math.abs(r),Math.abs(y))&&Math.abs(i-b)<=1e-6*Math.max(1,Math.abs(i),Math.abs(b))&&Math.abs(a-x)<=1e-6*Math.max(1,Math.abs(a),Math.abs(x))&&Math.abs(o-S)<=1e-6*Math.max(1,Math.abs(o),Math.abs(S))&&Math.abs(s-C)<=1e-6*Math.max(1,Math.abs(s),Math.abs(C))&&Math.abs(c-w)<=1e-6*Math.max(1,Math.abs(c),Math.abs(w))&&Math.abs(l-T)<=1e-6*Math.max(1,Math.abs(l),Math.abs(T))&&Math.abs(u-E)<=1e-6*Math.max(1,Math.abs(u),Math.abs(E))&&Math.abs(d-D)<=1e-6*Math.max(1,Math.abs(d),Math.abs(D))&&Math.abs(f-O)<=1e-6*Math.max(1,Math.abs(f),Math.abs(O))&&Math.abs(p-k)<=1e-6*Math.max(1,Math.abs(p),Math.abs(k))&&Math.abs(m-A)<=1e-6*Math.max(1,Math.abs(m),Math.abs(A))&&Math.abs(h-j)<=1e-6*Math.max(1,Math.abs(h),Math.abs(j))&&Math.abs(g-M)<=1e-6*Math.max(1,Math.abs(g),Math.abs(M))&&Math.abs(_-N)<=1e-6*Math.max(1,Math.abs(_),Math.abs(N))}function k(){var e=new o(3);return o!=Float32Array&&(e[0]=0,e[1]=0,e[2]=0),e}function A(e){var t=new o(3);return t[0]=e[0],t[1]=e[1],t[2]=e[2],t}function j(e){var t=e[0],n=e[1],r=e[2];return Math.sqrt(t*t+n*n+r*r)}function M(e,t,n){var r=new o(3);return r[0]=e,r[1]=t,r[2]=n,r}function N(e,t,n){return e[0]=t[0]+n[0],e[1]=t[1]+n[1],e[2]=t[2]+n[2],e}function P(e,t,n){return e[0]=t[0]-n[0],e[1]=t[1]-n[1],e[2]=t[2]-n[2],e}function F(e,t,n){return e[0]=t[0]*n,e[1]=t[1]*n,e[2]=t[2]*n,e}function ee(e,t,n,r){return e[0]=t[0]+n[0]*r,e[1]=t[1]+n[1]*r,e[2]=t[2]+n[2]*r,e}function te(e,t){var n=t[0]-e[0],r=t[1]-e[1],i=t[2]-e[2];return Math.sqrt(n*n+r*r+i*i)}function ne(e,t){return e[0]=-t[0],e[1]=-t[1],e[2]=-t[2],e}function re(e,t){var n=t[0],r=t[1],i=t[2],a=n*n+r*r+i*i;return a>0&&(a=1/Math.sqrt(a)),e[0]=t[0]*a,e[1]=t[1]*a,e[2]=t[2]*a,e}function I(e,t){return e[0]*t[0]+e[1]*t[1]+e[2]*t[2]}function L(e,t,n){var r=t[0],i=t[1],a=t[2],o=n[0],s=n[1],c=n[2];return e[0]=i*c-a*s,e[1]=a*o-r*c,e[2]=r*s-i*o,e}function ie(e,t,n,r){var i=t[0],a=t[1],o=t[2];return e[0]=i+r*(n[0]-i),e[1]=a+r*(n[1]-a),e[2]=o+r*(n[2]-o),e}function ae(e,t,n){var r=t[0],i=t[1],a=t[2],o=n[3]*r+n[7]*i+n[11]*a+n[15];return o||=1,e[0]=(n[0]*r+n[4]*i+n[8]*a+n[12])/o,e[1]=(n[1]*r+n[5]*i+n[9]*a+n[13])/o,e[2]=(n[2]*r+n[6]*i+n[10]*a+n[14])/o,e}function oe(e,t,n){var r=t[0],i=t[1],a=t[2];return e[0]=r*n[0]+i*n[3]+a*n[6],e[1]=r*n[1]+i*n[4]+a*n[7],e[2]=r*n[2]+i*n[5]+a*n[8],e}function se(e,t,n){var r=n[0],i=n[1],a=n[2],o=n[3],s=t[0],c=t[1],l=t[2],u=i*l-a*c,d=a*s-r*l,f=r*c-i*s;return u+=u,d+=d,f+=f,e[0]=s+o*u+i*f-a*d,e[1]=c+o*d+a*u-r*f,e[2]=l+o*f+r*d-i*u,e}function ce(e,t,n,r){var i=[],a=[];return i[0]=t[0]-n[0],i[1]=t[1]-n[1],i[2]=t[2]-n[2],a[0]=i[0],a[1]=i[1]*Math.cos(r)-i[2]*Math.sin(r),a[2]=i[1]*Math.sin(r)+i[2]*Math.cos(r),e[0]=a[0]+n[0],e[1]=a[1]+n[1],e[2]=a[2]+n[2],e}function le(e,t,n,r){var i=[],a=[];return i[0]=t[0]-n[0],i[1]=t[1]-n[1],i[2]=t[2]-n[2],a[0]=i[2]*Math.sin(r)+i[0]*Math.cos(r),a[1]=i[1],a[2]=i[2]*Math.cos(r)-i[0]*Math.sin(r),e[0]=a[0]+n[0],e[1]=a[1]+n[1],e[2]=a[2]+n[2],e}function ue(e,t,n,r){var i=[],a=[];return i[0]=t[0]-n[0],i[1]=t[1]-n[1],i[2]=t[2]-n[2],a[0]=i[0]*Math.cos(r)-i[1]*Math.sin(r),a[1]=i[0]*Math.sin(r)+i[1]*Math.cos(r),a[2]=i[2],e[0]=a[0]+n[0],e[1]=a[1]+n[1],e[2]=a[2]+n[2],e}function de(e){return e[0]=0,e[1]=0,e[2]=0,e}var fe=P,pe=j;(function(){var e=k();return function(t,n,r,i,a,o){var s,c;for(n||=3,r||=0,c=i?Math.min(i*n+r,t.length):t.length,s=r;s<c;s+=n)e[0]=t[s],e[1]=t[s+1],e[2]=t[s+2],a(e,e,o),t[s]=e[0],t[s+1]=e[1],t[s+2]=e[2];return t}})();function me(){var e=new o(4);return o!=Float32Array&&(e[0]=0,e[1]=0,e[2]=0,e[3]=0),e}function he(e,t,n,r){var i=new o(4);return i[0]=e,i[1]=t,i[2]=n,i[3]=r,i}function ge(e,t,n){return e[0]=t[0]*n[0],e[1]=t[1]*n[1],e[2]=t[2]*n[2],e[3]=t[3]*n[3],e}function _e(e,t,n){return e[0]=t[0]*n,e[1]=t[1]*n,e[2]=t[2]*n,e[3]=t[3]*n,e}function ve(e,t){var n=t[0],r=t[1],i=t[2],a=t[3],o=n*n+r*r+i*i+a*a;return o>0&&(o=1/Math.sqrt(o)),e[0]=n*o,e[1]=r*o,e[2]=i*o,e[3]=a*o,e}function ye(e,t,n){var r=t[0],i=t[1],a=t[2],o=t[3];return e[0]=n[0]*r+n[4]*i+n[8]*a+n[12]*o,e[1]=n[1]*r+n[5]*i+n[9]*a+n[13]*o,e[2]=n[2]*r+n[6]*i+n[10]*a+n[14]*o,e[3]=n[3]*r+n[7]*i+n[11]*a+n[15]*o,e}var be=ge;(function(){var e=me();return function(t,n,r,i,a,o){var s,c;for(n||=4,r||=0,c=i?Math.min(i*n+r,t.length):t.length,s=r;s<c;s+=n)e[0]=t[s],e[1]=t[s+1],e[2]=t[s+2],e[3]=t[s+3],a(e,e,o),t[s]=e[0],t[s+1]=e[1],t[s+2]=e[2],t[s+3]=e[3];return t}})();function xe(){var e=new o(4);return o!=Float32Array&&(e[0]=0,e[1]=0,e[2]=0),e[3]=1,e}function Se(e,t,n){n*=.5;var r=Math.sin(n);return e[0]=r*t[0],e[1]=r*t[1],e[2]=r*t[2],e[3]=Math.cos(n),e}function Ce(e,t,n){var r=t[0],i=t[1],a=t[2],o=t[3],s=n[0],c=n[1],l=n[2],u=n[3];return e[0]=r*u+o*s+i*l-a*c,e[1]=i*u+o*c+a*s-r*l,e[2]=a*u+o*l+r*c-i*s,e[3]=o*u-r*s-i*c-a*l,e}function R(e,t,n,r){var i=t[0],a=t[1],o=t[2],s=t[3],c=n[0],l=n[1],u=n[2],d=n[3],f,p=i*c+a*l+o*u+s*d,m,h,g;return p<0&&(p=-p,c=-c,l=-l,u=-u,d=-d),1-p>1e-6?(f=Math.acos(p),m=Math.sin(f),h=Math.sin((1-r)*f)/m,g=Math.sin(r*f)/m):(h=1-r,g=r),e[0]=h*i+g*c,e[1]=h*a+g*l,e[2]=h*o+g*u,e[3]=h*s+g*d,e}function we(e,t){var n=t[0]+t[4]+t[8],r;if(n>0)r=Math.sqrt(n+1),e[3]=.5*r,r=.5/r,e[0]=(t[5]-t[7])*r,e[1]=(t[6]-t[2])*r,e[2]=(t[1]-t[3])*r;else{var i=0;t[4]>t[0]&&(i=1),t[8]>t[i*3+i]&&(i=2);var a=(i+1)%3,o=(i+2)%3;r=Math.sqrt(t[i*3+i]-t[a*3+a]-t[o*3+o]+1),e[i]=.5*r,r=.5/r,e[3]=(t[a*3+o]-t[o*3+a])*r,e[a]=(t[a*3+i]+t[i*3+a])*r,e[o]=(t[o*3+i]+t[i*3+o])*r}return e}function Te(e,t,n,r){var i=arguments.length>4&&arguments[4]!==void 0?arguments[4]:`zyx`,a=Math.PI/360;t*=a,r*=a,n*=a;var o=Math.sin(t),s=Math.cos(t),c=Math.sin(n),l=Math.cos(n),u=Math.sin(r),d=Math.cos(r);switch(i){case`xyz`:e[0]=o*l*d+s*c*u,e[1]=s*c*d-o*l*u,e[2]=s*l*u+o*c*d,e[3]=s*l*d-o*c*u;break;case`xzy`:e[0]=o*l*d-s*c*u,e[1]=s*c*d-o*l*u,e[2]=s*l*u+o*c*d,e[3]=s*l*d+o*c*u;break;case`yxz`:e[0]=o*l*d+s*c*u,e[1]=s*c*d-o*l*u,e[2]=s*l*u-o*c*d,e[3]=s*l*d+o*c*u;break;case`yzx`:e[0]=o*l*d+s*c*u,e[1]=s*c*d+o*l*u,e[2]=s*l*u-o*c*d,e[3]=s*l*d-o*c*u;break;case`zxy`:e[0]=o*l*d-s*c*u,e[1]=s*c*d+o*l*u,e[2]=s*l*u+o*c*d,e[3]=s*l*d-o*c*u;break;case`zyx`:e[0]=o*l*d-s*c*u,e[1]=s*c*d+o*l*u,e[2]=s*l*u-o*c*d,e[3]=s*l*d+o*c*u;break;default:throw Error(`Unknown angle order `+i)}return e}var Ee=he,z=ve;(function(){var e=k(),t=M(1,0,0),n=M(0,1,0);return function(r,i,a){var o=I(i,a);return o<-.999999?(L(e,t,i),pe(e)<1e-6&&L(e,n,i),re(e,e),Se(r,e,Math.PI),r):o>.999999?(r[0]=0,r[1]=0,r[2]=0,r[3]=1,r):(L(e,i,a),r[0]=e[0],r[1]=e[1],r[2]=e[2],r[3]=1+o,z(r,r))}})(),function(){var e=xe(),t=xe();return function(n,r,i,a,o,s){return R(e,r,o,s),R(t,i,a,s),R(n,e,t,2*s*(1-s)),n}}(),function(){var e=s();return function(t,n,r,i){return e[0]=r[0],e[3]=r[1],e[6]=r[2],e[1]=i[0],e[4]=i[1],e[7]=i[2],e[2]=-n[0],e[5]=-n[1],e[8]=-n[2],z(t,we(t,e))}}();function B(){var e=new o(2);return o!=Float32Array&&(e[0]=0,e[1]=0),e}function V(e,t){var n=new o(2);return n[0]=e,n[1]=t,n}function De(e,t,n){return e[0]=t[0]*n,e[1]=t[1]*n,e}function Oe(e){var t=e[0],n=e[1];return Math.sqrt(t*t+n*n)}function ke(e){var t=e[0],n=e[1];return t*t+n*n}function Ae(e,t){return e[0]*t[0]+e[1]*t[1]}function je(e){return e[0]=0,e[1]=0,e}var Me=ke;(function(){var e=B();return function(t,n,r,i,a,o){var s,c;for(n||=2,r||=0,c=i?Math.min(i*n+r,t.length):t.length,s=r;s<c;s+=n)e[0]=t[s],e[1]=t[s+1],a(e,e,o),t[s]=e[0],t[s+1]=e[1];return t}})();var H=8192;function U(e,t,n){return t*(H/(e.tileSize*2**(n-e.tileID.overscaledZ)))}var Ne=`__$json__:`;function W(e){return e instanceof Error?e:Error(typeof e==`string`?e:String(e))}function Pe(){return new Float64Array(4)}function Fe(){return new Float64Array(3)}function Ie(){return new Float64Array(16)}function Le(){let e=new Float64Array(16);return m(e),e}function Re(){let e=new Float32Array(16);return m(e),e}function ze(e,t,n,r,i=!1){if(!n[0]&&!n[1])return[0,0];let a=i?r===`map`?-e.bearingInRadians:0:r===`viewport`?e.bearingInRadians:0;if(a){let e=Math.sin(a),t=Math.cos(a);n=[n[0]*t-n[1]*e,n[0]*e+n[1]*t]}return[i?n[0]:U(t,n[0],e.zoom),i?n[1]:U(t,n[1],e.zoom)]}function Be(e,t){return e[0]*t[0]+e[1]*t[1]+e[2]*t[2]+e[3]}function Ve(e,t,n){let r=c([e[0],e[1],e[2],t[0],t[1],t[2],n[0],n[1],n[2]]);if(r===0)return null;let i=L([],[t[0],t[1],t[2]],[n[0],n[1],n[2]]),a=L([],[n[0],n[1],n[2]],[e[0],e[1],e[2]]),o=L([],[e[0],e[1],e[2]],[t[0],t[1],t[2]]),s=F([],i,-e[3]);return N(s,s,F([],a,-t[3])),N(s,s,F([],o,-n[3])),F(s,s,1/r),s}function He(e,t,n){let r=e[0]*n[0]+e[1]*n[1]+e[2]*n[2],i=t[0]*n[0]+t[1]*n[1]+t[2]*n[2];return i===0?null:(-r-n[3])/i}function Ue(e,t,n,r){let i=Math.sqrt(e*e+t*t),a=Math.sqrt(n*n+r*r);e/=i,t/=i,n/=a,r/=a;let o=e*n+t*r,s=Math.acos(o);return-t*n+e*r>0?s:-s}function We(e,t){let n=G(e,360),r=G(t,360),i=r-n,a=r>n?i-360:i+360;return Math.abs(i)<Math.abs(a)?i:a}function Ge(e,t){let n=G(e,Math.PI*2),r=G(t,Math.PI*2);return Math.min(Math.abs(n-r),Math.abs(n-r+Math.PI*2),Math.abs(n-r-Math.PI*2))}function G(e,t){return(e%t+t)%t}function Ke(e,t,n,r,i){return K(r,i,J((e-t)/(n-t),0,1))}function K(e,t,n){return e*(1-n)+t*n}function qe(e){let t=1/0,n=1/0,r=-1/0,i=-1/0;for(let a of e)t=Math.min(t,a.x),n=Math.min(n,a.y),r=Math.max(r,a.x),i=Math.max(i,a.y);return[t,n,r,i]}function Je(e){if(!e.length)return new Set;let t=Math.max(...e.map(e=>e.canonical.z)),n=1/0,r=-1/0,i=1/0,a=-1/0,o=[];for(let s of e){let{x:e,y:c,z:l}=s.canonical,u=2**(t-l),d=e*u,f=c*u;o.push({id:s,x:d,y:f}),d<n&&(n=d),d>r&&(r=d),f<i&&(i=f),f>a&&(a=f)}let s=new Set;for(let e of o)(e.x===n||e.x===r||e.y===i||e.y===a)&&s.add(e.id);return s}function Ye(e){if(e<=0)return 0;if(e>=1)return 1;let t=e*e,n=t*e;return 4*(e<.5?n:3*(e-t)+n-.75)}function q(e,n,r,i){return t(e,n,r,i)}var Xe=q(.25,.1,.25,1);function J(e,t,n){return Math.min(n,Math.max(t,e))}function Ze(e,t,n){let r=n-t,i=((e-t)%r+r)%r+t;return i===t?n:i}function Qe(e,...t){for(let n of t)for(let t in n)e[t]=n[t];return e}function $e(e,t){let n={};for(let r of t)r in e&&(n[r]=e[r]);return n}var et=1;function tt(){return et++}function nt(e){return Math.log(e)/Math.LN2%1==0}function rt(e){return e<=1?1:2**Math.ceil(Math.log(e)/Math.LN2)}function it(e){return 2**e}function at(e){return Math.log(e)/Math.LN2}function ot(e,t,n){if(t<=0)return e;let r=1/t;return n===void 0||Math.abs(n)<1e-10?Math.round(e*r)/r:(n>0?Math.ceil(e*r-1e-9):Math.floor(e*r+1e-10))/r}function st(e,t,n){let r={};for(let i in e)r[i]=t.call(n||this,e[i],i,e);return r}function ct(e,t,n){let r={};for(let i in e)t.call(n||this,e[i],i,e)&&(r[i]=e[i]);return r}function Y(e,t){if(Array.isArray(e)){if(!Array.isArray(t)||e.length!==t.length)return!1;for(let n=0;n<e.length;n++)if(!Y(e[n],t[n]))return!1;return!0}if(typeof e==`object`&&e&&t!==null){if(typeof t!=`object`||Object.keys(e).length!==Object.keys(t).length)return!1;for(let n in e)if(!Y(e[n],t[n]))return!1;return!0}return e===t}function X(e){return Array.isArray(e)?e.map(X):typeof e==`object`&&e?st(e,X):e}var lt={};function ut(e){lt[e]||(typeof console<`u`&&console.warn(e),lt[e]=!0)}function dt(e,t,n){return(n.y-e.y)*(t.x-e.x)>(t.y-e.y)*(n.x-e.x)}function ft(t,n,r,i){let a=n.y-t.y,o=n.x-t.x,s=i.y-r.y,c=i.x-r.x,l=s*o-c*a;if(l===0)return null;let u=t.y-r.y,d=t.x-r.x,f=(c*u-s*d)/l;return new e(t.x+f*o,t.y+f*a)}function pt([e,t,n]){return t+=90,t*=Math.PI/180,n*=Math.PI/180,[e*Math.cos(t)*Math.sin(n),e*Math.sin(t)*Math.sin(n),e*Math.cos(n)]}function mt(e){return typeof WorkerGlobalScope<`u`&&e!==void 0&&e instanceof WorkerGlobalScope}function ht(e){let t=/(?:^|(?:\s*\,\s*))([^\x00-\x20\(\)<>@\,;\:\\"\/\[\]\?\=\{\}\x7F]+)(?:\=(?:([^\x00-\x20\(\)<>@\,;\:\\"\/\[\]\?\=\{\}\x7F]+)|(?:\"((?:[^"\\]|\\.)*)\")))?/g,n={};if(e.replace(t,(e,t,r,i)=>{let a=r||i;return n[t]=!a||a.toLowerCase(),``}),n[`max-age`]){let e=parseInt(n[`max-age`],10);isNaN(e)?delete n[`max-age`]:n[`max-age`]=e}return n}var Z=null;function gt(e){if(Z==null){let t=e.navigator?e.navigator.userAgent:null;Z=!!e.safari||!!(t&&(/\b(iPad|iPhone|iPod)\b/.test(t)||t.match(`Safari`)&&!t.match(`Chrome`)))}return Z}function _t(e){return typeof ImageBitmap<`u`&&e instanceof ImageBitmap}var vt=async(e,t)=>{let n=new Blob([new Uint8Array(e)],{type:`image/png`});try{return createImageBitmap(n,t)}catch(e){throw Error(`Could not load image because of ${W(e).message}. Please make sure to use a supported image type such as PNG or JPEG. Note that SVGs are not supported.`)}},yt=`data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQYV2NgAAIAAAUAAarVyFEAAAAASUVORK5CYII=`,bt=e=>new Promise((t,n)=>{let r=new Image;r.onload=()=>{t(r),URL.revokeObjectURL(r.src),r.onload=null,window.requestAnimationFrame(()=>r.src=yt)},r.onerror=()=>n(Error(`Could not load image. Please make sure to use a supported image type such as PNG or JPEG. Note that SVGs are not supported.`));let i=new Blob([new Uint8Array(e)],{type:`image/png`});r.src=URL.createObjectURL(i)});function xt(e,t,n,r,i){let a=Math.max(-t,0)*4,o=(Math.max(0,n)-n)*r*4+a,s=r*4,c=Math.max(0,t),l=Math.max(0,n),u=Math.min(e.width,t+r),d=Math.min(e.height,n+i);return{rect:{x:c,y:l,width:u-c,height:d-l},layout:[{offset:o,stride:s}]}}async function St(e,t,n,r,i){if(typeof VideoFrame>`u`)throw Error(`VideoFrame not supported`);let a=new VideoFrame(e,{timestamp:0});try{let o=a?.format;if(!o||!(o.startsWith(`BGR`)||o.startsWith(`RGB`)))throw Error(`Unrecognized format ${o}`);let s=o.startsWith(`BGR`),c=new Uint8ClampedArray(r*i*4);if(await a.copyTo(c,xt(e,t,n,r,i)),s)for(let e=0;e<c.length;e+=4){let t=c[e];c[e]=c[e+2],c[e+2]=t}return c}finally{a.close()}}function Ct(e,t,n,r){return e.addEventListener(t,n,r),{unsubscribe:()=>{e.removeEventListener(t,n,r)}}}function wt(e){return e*Math.PI/180}function Q(e){return e/Math.PI*180}function Tt(e,t){return e.roll==t.roll&&e.pitch==t.pitch&&e.bearing==t.bearing}function Et(e){let t=new Float64Array(9);u(t,e);let n=Q(-Math.asin(J(t[2],-1,1))),r,i;return Math.hypot(t[5],t[8])<.001?(r=0,i=-Q(Math.atan2(t[3],t[4]))):(r=Q(t[5]===0&&t[8]===0?0:Math.atan2(t[5],t[8])),i=Q(t[1]===0&&t[0]===0?0:Math.atan2(t[1],t[0]))),{roll:r,pitch:n+90,bearing:i}}function Dt(e,t,n){let r=V(t.x-n.x,t.y-n.y),i=V(e.x-n.x,e.y-n.y),a=r[0]*i[1]-r[1]*i[0];return Q(Math.atan2(a,Ae(r,i)))}function Ot(e,t,n){let r=new Float64Array(4);return Te(r,e,t-90,n),r}var kt=85.051129,At={touchstart:!0,touchmove:!0,touchmoveWindow:!0,touchend:!0,touchcancel:!0},jt={dblclick:!0,click:!0,mouseover:!0,mouseout:!0,mousedown:!0,mousemove:!0,mousemoveWindow:!0,mouseup:!0,mouseupWindow:!0,contextmenu:!0,wheel:!0};function Mt(e,t){return At[t]&&`touches`in e}function Nt(e,t){if(!jt[t])return!1;let n=e,r=(n?.target)?.ownerDocument?.defaultView||window;return n instanceof r.MouseEvent||n instanceof r.WheelEvent}function Pt(e){return At[e]||jt[e]}function Ft(e,t){return e=J(Math.floor(e),0,255),t=J(Math.floor(t),0,255),256*e+t}var It=`#ifdef GL_ES
precision mediump float;
#else
#if !defined(lowp)
#define lowp
#endif
#if !defined(mediump)
#define mediump
#endif
#if !defined(highp)
#define highp
#endif
#endif
out highp vec4 fragColor;layout(std140) uniform ProjectionUBO {highp mat4 u_projection_matrix;highp mat4 u_projection_fallback_matrix;highp vec4 u_projection_tile_mercator_coords;highp vec4 u_projection_clipping_plane;highp float u_projection_transition;highp int u_projection_clip_antimeridian;};layout(std140) uniform FrameUBO {highp vec2 u_units_to_pixels;highp vec2 u_world_size;highp float u_camera_to_center_distance;highp float u_symbol_fade_change;highp float u_aspect_ratio;highp float u_device_pixel_ratio;highp vec2 u_viewport_size;highp vec2 u_pixel_extrude_scale;highp float u_pitch;};`,Lt=`#ifdef GL_ES
precision highp float;
#else
#if !defined(lowp)
#define lowp
#endif
#if !defined(mediump)
#define mediump
#endif
#if !defined(highp)
#define highp
#endif
#endif
vec2 unpack_float(const float packedValue) {int packedIntValue=int(packedValue);int v0=packedIntValue/256;return vec2(v0,packedIntValue-v0*256);}vec2 unpack_opacity(const uint packedOpacity) {return vec2(float(packedOpacity >> 1u)/127.0,float(packedOpacity & 1u));}vec4 decode_color(const vec2 encodedColor) {return vec4(unpack_float(encodedColor[0])/255.0,unpack_float(encodedColor[1])/255.0
);}float unpack_mix_vec2(const vec2 packedValue,const float t) {return mix(packedValue[0],packedValue[1],t);}vec4 unpack_mix_color(const vec4 packedColors,const float t) {vec4 minColor=decode_color(vec2(packedColors[0],packedColors[1]));vec4 maxColor=decode_color(vec2(packedColors[2],packedColors[3]));return mix(minColor,maxColor,t);}vec2 get_pattern_pos(const vec2 pixel_coord_upper,const vec2 pixel_coord_lower,const vec2 pattern_size,const float tile_units_to_pixels,const vec2 pos) {vec2 offset=mod(mod(mod(pixel_coord_upper,pattern_size)*256.0,pattern_size)*256.0+pixel_coord_lower,pattern_size);return (tile_units_to_pixels*pos+offset)/pattern_size;}mat3 rotationMatrixFromAxisAngle(vec3 u,float angle) {float c=cos(angle);float s=sin(angle);float c2=1.0-c;return mat3(u.x*u.x*c2+      c,u.x*u.y*c2-u.z*s,u.x*u.z*c2+u.y*s,u.y*u.x*c2+u.z*s,u.y*u.y*c2+    c,u.y*u.z*c2-u.x*s,u.z*u.x*c2-u.y*s,u.z*u.y*c2+u.x*s,u.z*u.z*c2+    c
);}
#ifdef TERRAIN3D
uniform sampler2D u_terrain;uniform highp sampler2D u_depth;layout(std140) uniform TerrainUBO {highp mat4 u_terrain_matrix;highp vec4 u_terrain_unpack;highp float u_terrain_dim;highp float u_terrain_exaggeration;};
#endif
const highp vec4 bitSh=vec4(256.*256.*256.,256.*256.,256.,1.);const highp vec4 bitShifts=vec4(1.)/bitSh;highp float unpack(highp vec4 color) {return dot(color,bitShifts);}highp float depthOpacity(vec3 frag) {
#ifdef TERRAIN3D
highp float d=unpack(texture(u_depth,frag.xy*0.5+0.5))+0.0001-frag.z;return 1.0-max(0.0,min(1.0,-d*500.0));
#else
return 1.0;
#endif
}float calculate_visibility(vec4 pos) {
#ifdef TERRAIN3D
vec3 frag=pos.xyz/pos.w;highp float d=depthOpacity(frag);if (d > 0.95) return 1.0;return (d+depthOpacity(frag+vec3(0.0,0.01,0.0)))/2.0;
#else
return 1.0;
#endif
}float ele(ivec2 pos) {
#ifdef TERRAIN3D
vec4 rgb=(texelFetch(u_terrain,pos,0)*255.0)*u_terrain_unpack;return rgb.r+rgb.g+rgb.b-u_terrain_unpack.a;
#else
return 0.0;
#endif
}float get_elevation(vec2 pos) {
#ifdef TERRAIN3D
#ifdef GLOBE
if ((pos.y <-32767.5) || (pos.y > 32766.5)) {return 0.0;}
#endif
vec2 coord=(u_terrain_matrix*vec4(pos,0.0,1.0)).xy*u_terrain_dim+1.5;vec2 f=fract(coord);ivec2 c=ivec2(floor(coord));ivec2 hi=textureSize(u_terrain,0)-1;float tl=ele(clamp(c,ivec2(0),hi));float tr=ele(clamp(c+ivec2(1,0),ivec2(0),hi));float bl=ele(clamp(c+ivec2(0,1),ivec2(0),hi));float br=ele(clamp(c+ivec2(1,1),ivec2(0),hi));float elevation=mix(mix(tl,tr,f.x),mix(bl,br,f.x),f.y);return elevation*u_terrain_exaggeration;
#else
return 0.0;
#endif
}const float PI=3.141592653589793;
#define PROJECTION_UBO
layout(std140) uniform ProjectionUBO {highp mat4 u_projection_matrix;highp mat4 u_projection_fallback_matrix;highp vec4 u_projection_tile_mercator_coords;highp vec4 u_projection_clipping_plane;highp float u_projection_transition;highp int u_projection_clip_antimeridian;};layout(std140) uniform FrameUBO {highp vec2 u_units_to_pixels;highp vec2 u_world_size;highp float u_camera_to_center_distance;highp float u_symbol_fade_change;highp float u_aspect_ratio;highp float u_device_pixel_ratio;highp vec2 u_viewport_size;highp vec2 u_pixel_extrude_scale;highp float u_pitch;};`,Rt=`uniform vec4 u_color;uniform float u_opacity;void main() {fragColor=u_color*u_opacity;
#ifdef OVERDRAW_INSPECTOR
fragColor=vec4(1.0);
#endif
}`,zt=`layout(location=0) in vec2 a_pos;void main() {gl_Position=projectTile(a_pos,a_pos);}`,Bt=`uniform vec2 u_pattern_tl_a;uniform vec2 u_pattern_br_a;uniform vec2 u_pattern_tl_b;uniform vec2 u_pattern_br_b;uniform vec2 u_texsize;uniform float u_mix;uniform float u_opacity;uniform sampler2D u_image;in vec2 v_pos_a;in vec2 v_pos_b;void main() {vec2 imagecoord=mod(v_pos_a,1.0);vec2 pos=mix(u_pattern_tl_a/u_texsize,u_pattern_br_a/u_texsize,imagecoord);vec4 color1=texture(u_image,pos);vec2 imagecoord_b=mod(v_pos_b,1.0);vec2 pos2=mix(u_pattern_tl_b/u_texsize,u_pattern_br_b/u_texsize,imagecoord_b);vec4 color2=texture(u_image,pos2);fragColor=mix(color1,color2,u_mix)*u_opacity;
#ifdef OVERDRAW_INSPECTOR
fragColor=vec4(1.0);
#endif
}`,Vt=`uniform vec2 u_pattern_size_a;uniform vec2 u_pattern_size_b;uniform vec2 u_pixel_coord_upper;uniform vec2 u_pixel_coord_lower;uniform float u_scale_a;uniform float u_scale_b;uniform float u_tile_units_to_pixels;layout(location=0) in vec2 a_pos;out vec2 v_pos_a;out vec2 v_pos_b;void main() {gl_Position=projectTile(a_pos,a_pos);v_pos_a=get_pattern_pos(u_pixel_coord_upper,u_pixel_coord_lower,u_scale_a*u_pattern_size_a,u_tile_units_to_pixels,a_pos);v_pos_b=get_pattern_pos(u_pixel_coord_upper,u_pixel_coord_lower,u_scale_b*u_pattern_size_b,u_tile_units_to_pixels,a_pos);}`,Ht=`in vec3 v_data;in float v_visibility;
#pragma maplibre: define highp vec4 color
#pragma maplibre: define mediump float radius
#pragma maplibre: define lowp float blur
#pragma maplibre: define lowp float opacity
#pragma maplibre: define highp vec4 stroke_color
#pragma maplibre: define mediump float stroke_width
#pragma maplibre: define lowp float stroke_opacity
void main() {
#pragma maplibre: initialize highp vec4 color
#pragma maplibre: initialize mediump float radius
#pragma maplibre: initialize lowp float blur
#pragma maplibre: initialize lowp float opacity
#pragma maplibre: initialize highp vec4 stroke_color
#pragma maplibre: initialize mediump float stroke_width
#pragma maplibre: initialize lowp float stroke_opacity
vec2 extrude=v_data.xy;float extrude_length=length(extrude);float antialiased_blur=v_data.z;float opacity_t=smoothstep(0.0,antialiased_blur,extrude_length-1.0);float color_t=stroke_width < 0.01 ? 0.0 : smoothstep(antialiased_blur,0.0,extrude_length-radius/(radius+stroke_width));fragColor=v_visibility*opacity_t*mix(color*opacity,stroke_color*stroke_opacity,color_t);const float epsilon=0.5/255.0;if (fragColor.r < epsilon && fragColor.g < epsilon && fragColor.b < epsilon && fragColor.a < epsilon) {discard;}
#ifdef OVERDRAW_INSPECTOR
fragColor=vec4(1.0);
#endif
}`,Ut=`uniform bool u_scale_with_map;uniform bool u_pitch_with_map;uniform vec2 u_extrude_scale;uniform highp float u_globe_extrude_scale;uniform vec2 u_translate;layout(location=0) in ivec2 a_pos;out vec3 v_data;out float v_visibility;
#pragma maplibre: define highp vec4 color
#pragma maplibre: define mediump float radius
#pragma maplibre: define lowp float blur
#pragma maplibre: define lowp float opacity
#pragma maplibre: define highp vec4 stroke_color
#pragma maplibre: define mediump float stroke_width
#pragma maplibre: define lowp float stroke_opacity
void main(void) {
#pragma maplibre: initialize highp vec4 color
#pragma maplibre: initialize mediump float radius
#pragma maplibre: initialize lowp float blur
#pragma maplibre: initialize lowp float opacity
#pragma maplibre: initialize highp vec4 stroke_color
#pragma maplibre: initialize mediump float stroke_width
#pragma maplibre: initialize lowp float stroke_opacity
ivec2 pos_raw=a_pos+32768;vec2 extrude=vec2(pos_raw & 7)/7.0*2.0-1.0;vec2 circle_center=vec2(pos_raw >> 3)+u_translate;float ele=get_elevation(circle_center);v_visibility=calculate_visibility(projectTileWithElevation(circle_center,ele));if (u_pitch_with_map) {
#ifdef GLOBE
vec3 center_vector=projectToSphere(circle_center);
#endif
float angle_scale=u_globe_extrude_scale;vec2 corner_position=circle_center;if (u_scale_with_map) {angle_scale*=(radius+stroke_width);corner_position+=extrude*u_extrude_scale*(radius+stroke_width);} else {
#ifdef GLOBE
vec4 projected_center=interpolateProjection(circle_center,center_vector,ele);
#else
vec4 projected_center=projectTileWithElevation(circle_center,ele);
#endif
corner_position+=extrude*u_extrude_scale*(radius+stroke_width)*(projected_center.w/u_camera_to_center_distance);angle_scale*=(radius+stroke_width)*(projected_center.w/u_camera_to_center_distance);}
#ifdef GLOBE
vec2 angles=extrude*angle_scale;vec3 corner_vector=globeRotateVector(center_vector,angles);gl_Position=interpolateProjection(corner_position,corner_vector,ele);
#else
gl_Position=projectTileWithElevation(corner_position,ele);
#endif
} else {gl_Position=projectTileWithElevation(circle_center,ele);if (gl_Position.z/gl_Position.w > 1.0) {gl_Position.xy=vec2(10000.0);}if (u_scale_with_map) {gl_Position.xy+=extrude*(radius+stroke_width)*u_extrude_scale*u_camera_to_center_distance;} else {gl_Position.xy+=extrude*(radius+stroke_width)*u_extrude_scale*gl_Position.w;}}float antialiasblur=-max(1.0/u_device_pixel_ratio/(radius+stroke_width),blur);v_data=vec3(extrude.x,extrude.y,antialiasblur);}`,Wt=`void main() {fragColor=vec4(1.0);}`,Gt={prelude:$(It,Lt),projectionMercator:$(`
void clipAntimeridian() {}`,`float projectLineThickness(float tileY) {return 1.0;}float projectCircleRadius(float tileY) {return 1.0;}vec4 projectTile(vec2 p) {vec4 result=u_projection_matrix*vec4(p,0.0,1.0);return result;}vec4 projectTile(vec2 p,vec2 rawPos) {vec4 result=u_projection_matrix*vec4(p,0.0,1.0);if (rawPos.y <-32767.5 || rawPos.y > 32766.5) {result.z=-10000000.0;}return result;}vec4 projectTileWithElevation(vec2 posInTile,float elevation) {return u_projection_matrix*vec4(posInTile,elevation,1.0);}vec4 projectTileFor3D(vec2 posInTile,float elevation) {return projectTileWithElevation(posInTile,elevation);}`),projectionGlobe:$(`in highp float v_projection_tile_x;void clipAntimeridian() {if (u_projection_clip_antimeridian !=0 && (v_projection_tile_x < 0.0 || v_projection_tile_x >=8192.0)) {discard;}}`,`#define GLOBE_RADIUS 6371008.8
#ifndef PROJECTION_UBO
uniform highp vec4 u_projection_tile_mercator_coords;uniform highp vec4 u_projection_clipping_plane;uniform highp float u_projection_transition;uniform mat4 u_projection_fallback_matrix;
#endif
out highp float v_projection_tile_x;vec3 globeRotateVector(vec3 vec,vec2 angles) {vec3 axisRight=vec3(vec.z,0.0,-vec.x);vec3 axisUp=cross(axisRight,vec);axisRight=normalize(axisRight);axisUp=normalize(axisUp);vec2 t=tan(angles);return normalize(vec+axisRight*t.x+axisUp*t.y);}mat3 globeGetRotationMatrix(vec3 spherePos) {vec3 axisRight=vec3(spherePos.z,0.0,-spherePos.x);vec3 axisDown=cross(axisRight,spherePos);axisRight=normalize(axisRight);axisDown=normalize(axisDown);return mat3(axisRight,axisDown,spherePos
);}float circumferenceRatioAtTileY(float tileY) {float mercator_pos_y=u_projection_tile_mercator_coords.y+u_projection_tile_mercator_coords.w*tileY;float t=exp(PI-(mercator_pos_y*PI*2.0));return (2.0*t)/(t*t+1.0);}float projectLineThickness(float tileY) {float thickness=1.0/circumferenceRatioAtTileY(tileY);if (u_projection_transition < 0.999) {return mix(1.0,thickness,u_projection_transition);} else {return thickness;}}vec3 projectToSphere(vec2 translatedPos,vec2 rawPos) {vec2 mercator_pos=u_projection_tile_mercator_coords.xy+u_projection_tile_mercator_coords.zw*translatedPos;float spherical_x=mercator_pos.x*PI*2.0+PI;float t=exp(PI-(mercator_pos.y*PI*2.0));float t2=t*t;float denom=t2+1.0;float sin_sy=(t2-1.0)/denom;float cos_sy=(2.0*t)/denom;vec3 pos=vec3(sin(spherical_x)*cos_sy,sin_sy,cos(spherical_x)*cos_sy
);if (rawPos.y <-32767.5) {pos=vec3(0.0,1.0,0.0);}if (rawPos.y > 32766.5) {pos=vec3(0.0,-1.0,0.0);}return pos;}vec3 projectToSphere(vec2 posInTile) {return projectToSphere(posInTile,vec2(0.0,0.0));}float globeComputeClippingZ(vec3 spherePos) {return (1.0-(dot(spherePos,u_projection_clipping_plane.xyz)+u_projection_clipping_plane.w));}vec4 interpolateProjection(vec2 posInTile,vec3 spherePos,float elevation) {v_projection_tile_x=posInTile.x;vec3 elevatedPos=spherePos*(1.0+elevation/GLOBE_RADIUS);vec4 globePosition=u_projection_matrix*vec4(elevatedPos,1.0);globePosition.z=globeComputeClippingZ(elevatedPos)*globePosition.w;if (u_projection_transition > 0.999) {return globePosition;}vec4 flatPosition=u_projection_fallback_matrix*vec4(posInTile,elevation,1.0);const float z_globeness_threshold=0.2;vec4 result=globePosition;result.z=mix(0.0,globePosition.z,clamp((u_projection_transition-z_globeness_threshold)/(1.0-z_globeness_threshold),0.0,1.0));result.xyw=mix(flatPosition.xyw,globePosition.xyw,u_projection_transition);if ((posInTile.y <-32767.5) || (posInTile.y > 32766.5)) {result=globePosition;const float poles_hidden_anim_percentage=0.02;result.z=mix(globePosition.z,100.0,pow(max((1.0-u_projection_transition)/poles_hidden_anim_percentage,0.0),8.0));}return result;}vec4 interpolateProjectionFor3D(vec2 posInTile,vec3 spherePos,float elevation) {v_projection_tile_x=posInTile.x;vec3 elevatedPos=spherePos*(1.0+elevation/GLOBE_RADIUS);vec4 globePosition=u_projection_matrix*vec4(elevatedPos,1.0);if (u_projection_transition > 0.999) {return globePosition;}vec4 fallbackPosition=u_projection_fallback_matrix*vec4(posInTile,elevation,1.0);return mix(fallbackPosition,globePosition,u_projection_transition);}vec4 projectTile(vec2 posInTile) {return interpolateProjection(posInTile,projectToSphere(posInTile),0.0);}vec4 projectTile(vec2 posInTile,vec2 rawPos) {return interpolateProjection(posInTile,projectToSphere(posInTile,rawPos),0.0);}vec4 projectTileWithElevation(vec2 posInTile,float elevation) {return interpolateProjection(posInTile,projectToSphere(posInTile),elevation);}vec4 projectTileFor3D(vec2 posInTile,float elevation) {vec3 spherePos=projectToSphere(posInTile,posInTile);return interpolateProjectionFor3D(posInTile,spherePos,elevation);}`),background:$(Rt,zt),backgroundPattern:$(Bt,Vt),circle:$(Ht,Ut),clippingMask:$(Wt,`layout(location=0) in vec2 a_pos;void main() {gl_Position=projectTile(a_pos,a_pos);}`),heatmap:$(`uniform highp float u_intensity;in vec2 v_extrude;
#pragma maplibre: define highp float weight
#define GAUSS_COEF 0.3989422804014327
void main() {
#pragma maplibre: initialize highp float weight
float d=-0.5*3.0*3.0*dot(v_extrude,v_extrude);float val=weight*u_intensity*GAUSS_COEF*exp(d);fragColor=vec4(val,1.0,1.0,1.0);
#ifdef OVERDRAW_INSPECTOR
fragColor=vec4(1.0);
#endif
}`,`uniform float u_extrude_scale;uniform float u_opacity;uniform float u_intensity;uniform highp float u_globe_extrude_scale;layout(location=0) in ivec2 a_pos;out vec2 v_extrude;
#pragma maplibre: define highp float weight
#pragma maplibre: define mediump float radius
const highp float ZERO=1.0/255.0/16.0;
#define GAUSS_COEF 0.3989422804014327
void main(void) {
#pragma maplibre: initialize highp float weight
#pragma maplibre: initialize mediump float radius
ivec2 pos_raw=a_pos+32768;vec2 unscaled_extrude=vec2(pos_raw & 7)/7.0*2.0-1.0;float S=sqrt(-2.0*log(ZERO/weight/u_intensity/GAUSS_COEF))/3.0;v_extrude=S*unscaled_extrude;vec2 extrude=v_extrude*radius*u_extrude_scale;vec2 circle_center=vec2(pos_raw >> 3);
#ifdef GLOBE
vec2 angles=v_extrude*radius*u_globe_extrude_scale;vec3 center_vector=projectToSphere(circle_center);vec3 corner_vector=globeRotateVector(center_vector,angles);gl_Position=interpolateProjection(circle_center+extrude,corner_vector,0.0);
#else
gl_Position=projectTileFor3D(circle_center+extrude,get_elevation(circle_center));
#endif
}`),heatmapTexture:$(`uniform sampler2D u_image;uniform sampler2D u_color_ramp;uniform float u_opacity;in vec2 v_pos;void main() {float t=texture(u_image,v_pos).r;vec4 color=texture(u_color_ramp,vec2(t,0.5));fragColor=color*u_opacity;
#ifdef OVERDRAW_INSPECTOR
fragColor=vec4(0.0);
#endif
}`,`uniform mat4 u_matrix;layout(location=0) in vec2 a_pos;out vec2 v_pos;void main() {gl_Position=u_matrix*vec4(a_pos*u_world_size,0,1);v_pos.x=a_pos.x;v_pos.y=1.0-a_pos.y;}`),collisionBox:$(`in float v_placed;in float v_notUsed;void main() {float alpha=0.5;fragColor=vec4(1.0,0.0,0.0,1.0)*alpha;if (v_placed > 0.5) {fragColor=vec4(0.0,0.0,1.0,0.5)*alpha;}if (v_notUsed > 0.5) {fragColor*=.1;}}`,`layout(location=0) in vec2 a_anchor_pos;layout(location=1) in vec2 a_placed;layout(location=2) in vec2 a_box_real;out float v_placed;out float v_notUsed;void main() {gl_Position=projectTileWithElevation(a_anchor_pos,get_elevation(a_anchor_pos));gl_Position.xy=((a_box_real+0.5)*u_pixel_extrude_scale*2.0-1.0)*vec2(1.0,-1.0)*gl_Position.w;if (gl_Position.z/gl_Position.w < 1.1) {gl_Position.z=0.5;}v_placed=a_placed.x;v_notUsed=a_placed.y;}`),collisionCircle:$(`in float v_radius;in vec2 v_extrude;in float v_collision;void main() {float alpha=0.5;float stroke_radius=0.9;float distance_to_center=length(v_extrude);float distance_to_edge=abs(distance_to_center-v_radius);float opacity_t=smoothstep(-stroke_radius,0.0,-distance_to_edge);vec4 color=mix(vec4(0.0,0.0,1.0,0.5),vec4(1.0,0.0,0.0,1.0),v_collision);fragColor=color*alpha*opacity_t;}`,`layout(location=0) in vec2 a_pos;layout(location=1) in float a_radius;layout(location=2) in vec2 a_flags;out float v_radius;out vec2 v_extrude;out float v_collision;void main() {float radius=a_radius;float collision=a_flags.x;float vertexIdx=a_flags.y;vec2 quadVertexOffset=vec2(mix(-1.0,1.0,float(vertexIdx >=2.0)),mix(-1.0,1.0,float(vertexIdx >=1.0 && vertexIdx <=2.0)));vec2 quadVertexExtent=quadVertexOffset*radius;float padding_factor=1.2;v_radius=radius;v_extrude=quadVertexExtent*padding_factor;v_collision=collision;gl_Position=vec4((a_pos/u_viewport_size*2.0-1.0)*vec2(1.0,-1.0),0.0,1.0)+vec4(quadVertexExtent*padding_factor/u_viewport_size*2.0,0.0,0.0);}`),colorRelief:$(`#ifdef GL_ES
precision highp float;
#endif
uniform sampler2D u_image;uniform vec4 u_unpack;uniform sampler2D u_elevation_stops;uniform sampler2D u_color_stops;uniform int u_color_ramp_size;uniform float u_opacity;in vec2 v_pos;float getElevation(vec2 coord) {vec4 data=texture(u_image,coord)*255.0;data.a=-1.0;return dot(data,u_unpack);}float getElevationStop(int stop) {vec4 data=texelFetch(u_elevation_stops,ivec2(stop,0),0)*255.0;data.a=-1.0;return dot(data,u_unpack);}void main() {float el=getElevation(v_pos);int r=(u_color_ramp_size-1);int l=0;float el_l=getElevationStop(l);float el_r=getElevationStop(r);while(r-l > 1){int m=(r+l)/2;float el_m=getElevationStop(m);if(el < el_m){r=m;el_r=el_m;}else
{l=m;el_l=el_m;}}float x=(float(l)+(el-el_l)/(el_r-el_l)+0.5)/float(u_color_ramp_size);fragColor=u_opacity*texture(u_color_stops,vec2(x,0));
#ifdef OVERDRAW_INSPECTOR
fragColor=vec4(1.0);
#endif
}`,`uniform vec2 u_dimension;layout(location=0) in vec2 a_pos;out vec2 v_pos;void main() {gl_Position=projectTile(a_pos,a_pos);highp vec2 epsilon=2.0/u_dimension;float scale=(u_dimension.x-4.0)/u_dimension.x;v_pos=(a_pos/8192.0)*scale+epsilon;if (a_pos.y <-32767.5) {v_pos.y=0.0;}if (a_pos.y > 32766.5) {v_pos.y=1.0;}}`),debug:$(`uniform highp vec4 u_color;uniform sampler2D u_overlay;in vec2 v_uv;void main() {vec4 overlay_color=texture(u_overlay,v_uv);fragColor=mix(u_color,overlay_color,overlay_color.a);}`,`layout(location=0) in vec2 a_pos;out vec2 v_uv;uniform float u_overlay_scale;void main() {v_uv=a_pos/8192.0;gl_Position=projectTileWithElevation(a_pos*u_overlay_scale,get_elevation(a_pos));}`),depth:$(Wt,`layout(location=0) in vec2 a_pos;void main() {
#ifdef GLOBE
gl_Position=projectTileFor3D(a_pos,0.0);
#else
gl_Position=u_projection_matrix*vec4(a_pos,0.0,1.0);
#endif
}`),fill:$(`#pragma maplibre: define highp vec4 color
#pragma maplibre: define lowp float opacity
void main() {
#pragma maplibre: initialize highp vec4 color
#pragma maplibre: initialize lowp float opacity
fragColor=color*opacity;
#ifdef OVERDRAW_INSPECTOR
fragColor=vec4(1.0);
#endif
}`,`uniform vec2 u_fill_translate;layout(location=0) in vec2 a_pos;
#pragma maplibre: define highp vec4 color
#pragma maplibre: define lowp float opacity
void main() {
#pragma maplibre: initialize highp vec4 color
#pragma maplibre: initialize lowp float opacity
if (opacity < 0.01) {gl_Position=vec4(-2.0,-2.0,-2.0,1.0);return;}gl_Position=projectTile(a_pos+u_fill_translate,a_pos);}`),fillOutline:$(`in vec2 v_pos;
#ifdef GLOBE
in float v_depth;
#endif
#pragma maplibre: define highp vec4 outline_color
#pragma maplibre: define lowp float opacity
void main() {
#pragma maplibre: initialize highp vec4 outline_color
#pragma maplibre: initialize lowp float opacity
float dist=length(v_pos-gl_FragCoord.xy);float alpha=1.0-smoothstep(0.0,1.0,dist);fragColor=outline_color*(alpha*opacity);
#ifdef GLOBE
if (v_depth > 1.0) {discard;}
#endif
#ifdef OVERDRAW_INSPECTOR
fragColor=vec4(1.0);
#endif
}`,`uniform vec2 u_fill_translate;layout(location=0) in vec2 a_pos;out vec2 v_pos;
#ifdef GLOBE
out float v_depth;
#endif
#pragma maplibre: define highp vec4 outline_color
#pragma maplibre: define lowp float opacity
void main() {
#pragma maplibre: initialize highp vec4 outline_color
#pragma maplibre: initialize lowp float opacity
if (opacity < 0.01) {gl_Position=vec4(-2.0,-2.0,-2.0,1.0);return;}gl_Position=projectTile(a_pos+u_fill_translate,a_pos);v_pos=(gl_Position.xy/gl_Position.w+1.0)/2.0*u_world_size;
#ifdef GLOBE
v_depth=gl_Position.z/gl_Position.w;
#endif
}`),fillOutlinePattern:$(`uniform vec2 u_texsize;uniform sampler2D u_image;uniform float u_fade;uniform bool u_sdf_pattern;in vec2 v_pos_a;in vec2 v_pos_b;in vec2 v_pos;
#ifdef GLOBE
in float v_depth;
#endif
#pragma maplibre: define lowp float opacity
#pragma maplibre: define highp vec4 color
#pragma maplibre: define lowp vec4 pattern_from
#pragma maplibre: define lowp vec4 pattern_to
void main() {
#pragma maplibre: initialize lowp float opacity
#pragma maplibre: initialize highp vec4 color
#pragma maplibre: initialize mediump vec4 pattern_from
#pragma maplibre: initialize mediump vec4 pattern_to
vec2 pattern_tl_a=pattern_from.xy;vec2 pattern_br_a=pattern_from.zw;vec2 pattern_tl_b=pattern_to.xy;vec2 pattern_br_b=pattern_to.zw;vec2 imagecoord=mod(v_pos_a,1.0);vec2 pos=mix(pattern_tl_a/u_texsize,pattern_br_a/u_texsize,imagecoord);vec4 color1=texture(u_image,pos);vec2 imagecoord_b=mod(v_pos_b,1.0);vec2 pos2=mix(pattern_tl_b/u_texsize,pattern_br_b/u_texsize,imagecoord_b);vec4 color2=texture(u_image,pos2);float dist=length(v_pos-gl_FragCoord.xy);float alpha=1.0-smoothstep(0.0,1.0,dist);if (u_sdf_pattern) {highp float sdf_edge=(256.0-64.0)/256.0;highp float sdf_gamma_a=max(fwidth(color1.a)*0.5,1.0/255.0/16.0);highp float sdf_gamma_b=max(fwidth(color2.a)*0.5,1.0/255.0/16.0);float sdf_alpha_a=smoothstep(sdf_edge-sdf_gamma_a,sdf_edge+sdf_gamma_a,color1.a);float sdf_alpha_b=smoothstep(sdf_edge-sdf_gamma_b,sdf_edge+sdf_gamma_b,color2.a);fragColor=mix(color*sdf_alpha_a,color*sdf_alpha_b,u_fade)*alpha*opacity;} else {fragColor=mix(color1,color2,u_fade)*alpha*opacity;}
#ifdef GLOBE
if (v_depth > 1.0) {discard;}
#endif
#ifdef OVERDRAW_INSPECTOR
fragColor=vec4(1.0);
#endif
}`,`uniform vec2 u_pixel_coord_upper;uniform vec2 u_pixel_coord_lower;uniform vec3 u_scale;uniform vec2 u_fill_translate;layout(location=0) in vec2 a_pos;out vec2 v_pos_a;out vec2 v_pos_b;out vec2 v_pos;
#ifdef GLOBE
out float v_depth;
#endif
#pragma maplibre: define lowp float opacity
#pragma maplibre: define highp vec4 color
#pragma maplibre: define lowp vec4 pattern_from
#pragma maplibre: define lowp vec4 pattern_to
#pragma maplibre: define lowp float pixel_ratio_from
#pragma maplibre: define lowp float pixel_ratio_to
void main() {
#pragma maplibre: initialize lowp float opacity
#pragma maplibre: initialize highp vec4 color
#pragma maplibre: initialize mediump vec4 pattern_from
#pragma maplibre: initialize mediump vec4 pattern_to
#pragma maplibre: initialize lowp float pixel_ratio_from
#pragma maplibre: initialize lowp float pixel_ratio_to
if (opacity < 0.01) {gl_Position=vec4(-2.0,-2.0,-2.0,1.0);return;}vec2 pattern_tl_a=pattern_from.xy;vec2 pattern_br_a=pattern_from.zw;vec2 pattern_tl_b=pattern_to.xy;vec2 pattern_br_b=pattern_to.zw;float tileRatio=u_scale.x;float fromScale=u_scale.y;float toScale=u_scale.z;gl_Position=projectTile(a_pos+u_fill_translate,a_pos);vec2 display_size_a=(pattern_br_a-pattern_tl_a)/pixel_ratio_from;vec2 display_size_b=(pattern_br_b-pattern_tl_b)/pixel_ratio_to;v_pos_a=get_pattern_pos(u_pixel_coord_upper,u_pixel_coord_lower,fromScale*display_size_a,tileRatio,a_pos);v_pos_b=get_pattern_pos(u_pixel_coord_upper,u_pixel_coord_lower,toScale*display_size_b,tileRatio,a_pos);v_pos=(gl_Position.xy/gl_Position.w+1.0)/2.0*u_world_size;
#ifdef GLOBE
v_depth=gl_Position.z/gl_Position.w;
#endif
}`),fillPattern:$(`#ifdef GL_ES
precision highp float;
#endif
uniform vec2 u_texsize;uniform float u_fade;uniform bool u_sdf_pattern;uniform sampler2D u_image;in vec2 v_pos_a;in vec2 v_pos_b;
#pragma maplibre: define lowp float opacity
#pragma maplibre: define highp vec4 color
#pragma maplibre: define lowp vec4 pattern_from
#pragma maplibre: define lowp vec4 pattern_to
void main() {
#pragma maplibre: initialize lowp float opacity
#pragma maplibre: initialize highp vec4 color
#pragma maplibre: initialize mediump vec4 pattern_from
#pragma maplibre: initialize mediump vec4 pattern_to
vec2 pattern_tl_a=pattern_from.xy;vec2 pattern_br_a=pattern_from.zw;vec2 pattern_tl_b=pattern_to.xy;vec2 pattern_br_b=pattern_to.zw;vec2 imagecoord=mod(v_pos_a,1.0);vec2 pos=mix(pattern_tl_a/u_texsize,pattern_br_a/u_texsize,imagecoord);vec4 color1=texture(u_image,pos);vec2 imagecoord_b=mod(v_pos_b,1.0);vec2 pos2=mix(pattern_tl_b/u_texsize,pattern_br_b/u_texsize,imagecoord_b);vec4 color2=texture(u_image,pos2);if (u_sdf_pattern) {highp float sdf_edge=(256.0-64.0)/256.0;highp float sdf_gamma_a=max(fwidth(color1.a)*0.5,1.0/255.0/16.0);highp float sdf_gamma_b=max(fwidth(color2.a)*0.5,1.0/255.0/16.0);float sdf_alpha_a=smoothstep(sdf_edge-sdf_gamma_a,sdf_edge+sdf_gamma_a,color1.a);float sdf_alpha_b=smoothstep(sdf_edge-sdf_gamma_b,sdf_edge+sdf_gamma_b,color2.a);fragColor=mix(color*sdf_alpha_a,color*sdf_alpha_b,u_fade)*opacity;} else {fragColor=mix(color1,color2,u_fade)*opacity;}
#ifdef OVERDRAW_INSPECTOR
fragColor=vec4(1.0);
#endif
}`,`uniform vec2 u_pixel_coord_upper;uniform vec2 u_pixel_coord_lower;uniform vec3 u_scale;uniform vec2 u_fill_translate;layout(location=0) in vec2 a_pos;out vec2 v_pos_a;out vec2 v_pos_b;
#pragma maplibre: define lowp float opacity
#pragma maplibre: define highp vec4 color
#pragma maplibre: define lowp vec4 pattern_from
#pragma maplibre: define lowp vec4 pattern_to
#pragma maplibre: define lowp float pixel_ratio_from
#pragma maplibre: define lowp float pixel_ratio_to
void main() {
#pragma maplibre: initialize lowp float opacity
#pragma maplibre: initialize highp vec4 color
#pragma maplibre: initialize mediump vec4 pattern_from
#pragma maplibre: initialize mediump vec4 pattern_to
#pragma maplibre: initialize lowp float pixel_ratio_from
#pragma maplibre: initialize lowp float pixel_ratio_to
if (opacity < 0.01) {gl_Position=vec4(-2.0,-2.0,-2.0,1.0);return;}vec2 pattern_tl_a=pattern_from.xy;vec2 pattern_br_a=pattern_from.zw;vec2 pattern_tl_b=pattern_to.xy;vec2 pattern_br_b=pattern_to.zw;float tileZoomRatio=u_scale.x;float fromScale=u_scale.y;float toScale=u_scale.z;vec2 display_size_a=(pattern_br_a-pattern_tl_a)/pixel_ratio_from;vec2 display_size_b=(pattern_br_b-pattern_tl_b)/pixel_ratio_to;gl_Position=projectTile(a_pos+u_fill_translate,a_pos);v_pos_a=get_pattern_pos(u_pixel_coord_upper,u_pixel_coord_lower,fromScale*display_size_a,tileZoomRatio,a_pos);v_pos_b=get_pattern_pos(u_pixel_coord_upper,u_pixel_coord_lower,toScale*display_size_b,tileZoomRatio,a_pos);}`),fillExtrusion:$(`in vec4 v_color;void main() {fragColor=v_color;
#ifdef OVERDRAW_INSPECTOR
fragColor=vec4(1.0);
#endif
}`,`uniform vec3 u_lightcolor;uniform lowp vec3 u_lightpos;uniform lowp vec3 u_lightpos_globe;uniform lowp float u_lightintensity;uniform float u_vertical_gradient;uniform lowp float u_opacity;uniform vec2 u_fill_translate;layout(location=0) in vec2 a_pos;layout(location=1) in ivec4 a_normal_ed;
#ifdef TERRAIN3D
layout(location=2) in vec2 a_centroid;
#endif
out vec4 v_color;
#pragma maplibre: define highp float base
#pragma maplibre: define highp float height
#pragma maplibre: define highp vec4 color
void main() {
#pragma maplibre: initialize highp float base
#pragma maplibre: initialize highp float height
#pragma maplibre: initialize highp vec4 color
vec3 normal=vec3(a_normal_ed.xyz);float gradient_base=max(0.0,base);float gradient_height=max(0.0,height);
#ifdef TERRAIN3D
float height_terrain3d_offset=get_elevation(a_centroid);float base_terrain3d_offset=height_terrain3d_offset-(base > 0.0 ? 0.0 : 10.0);
#else
float height_terrain3d_offset=0.0;float base_terrain3d_offset=0.0;
#endif
base=max(0.0,base)+base_terrain3d_offset;height=max(0.0,height)+height_terrain3d_offset;float t=float(a_normal_ed.x & 1);float elevation=t > 0.0 ? height : base;vec2 posInTile=a_pos+u_fill_translate;
#ifdef GLOBE
vec3 spherePos=projectToSphere(posInTile,a_pos);gl_Position=interpolateProjectionFor3D(posInTile,spherePos,elevation);
#else
gl_Position=u_projection_matrix*vec4(posInTile,elevation,1.0);
#endif
float colorvalue=color.r*0.2126+color.g*0.7152+color.b*0.0722;v_color=vec4(0.0,0.0,0.0,1.0);vec4 ambientlight=vec4(0.03,0.03,0.03,1.0);color+=ambientlight;vec3 normalForLighting=normal/16384.0;float directional=clamp(dot(normalForLighting,u_lightpos),0.0,1.0);
#ifdef GLOBE
mat3 rotMatrix=globeGetRotationMatrix(spherePos);normalForLighting=rotMatrix*normalForLighting;directional=mix(directional,clamp(dot(normalForLighting,u_lightpos_globe),0.0,1.0),u_projection_transition);
#endif
directional=mix((1.0-u_lightintensity),max((1.0-colorvalue+u_lightintensity),1.0),directional);if (normal.z==0.0) {directional*=((1.0-u_vertical_gradient)+(u_vertical_gradient*clamp((t+gradient_base)*pow(gradient_height/150.0,0.5),mix(0.7,0.98,1.0-u_lightintensity),1.0)));}v_color.r+=clamp(color.r*directional*u_lightcolor.r,mix(0.0,0.3,1.0-u_lightcolor.r),1.0);v_color.g+=clamp(color.g*directional*u_lightcolor.g,mix(0.0,0.3,1.0-u_lightcolor.g),1.0);v_color.b+=clamp(color.b*directional*u_lightcolor.b,mix(0.0,0.3,1.0-u_lightcolor.b),1.0);v_color*=u_opacity;}`),fillExtrusionPattern:$(`uniform vec2 u_texsize;uniform float u_fade;uniform sampler2D u_image;in vec2 v_pos_a;in vec2 v_pos_b;in vec4 v_lighting;
#pragma maplibre: define lowp float base
#pragma maplibre: define lowp float height
#pragma maplibre: define lowp vec4 pattern_from
#pragma maplibre: define lowp vec4 pattern_to
#pragma maplibre: define lowp float pixel_ratio_from
#pragma maplibre: define lowp float pixel_ratio_to
void main() {
#pragma maplibre: initialize lowp float base
#pragma maplibre: initialize lowp float height
#pragma maplibre: initialize mediump vec4 pattern_from
#pragma maplibre: initialize mediump vec4 pattern_to
#pragma maplibre: initialize lowp float pixel_ratio_from
#pragma maplibre: initialize lowp float pixel_ratio_to
vec2 pattern_tl_a=pattern_from.xy;vec2 pattern_br_a=pattern_from.zw;vec2 pattern_tl_b=pattern_to.xy;vec2 pattern_br_b=pattern_to.zw;vec2 imagecoord=mod(v_pos_a,1.0);vec2 pos=mix(pattern_tl_a/u_texsize,pattern_br_a/u_texsize,imagecoord);vec4 color1=texture(u_image,pos);vec2 imagecoord_b=mod(v_pos_b,1.0);vec2 pos2=mix(pattern_tl_b/u_texsize,pattern_br_b/u_texsize,imagecoord_b);vec4 color2=texture(u_image,pos2);vec4 mixedColor=mix(color1,color2,u_fade);fragColor=mixedColor*v_lighting;
#ifdef OVERDRAW_INSPECTOR
fragColor=vec4(1.0);
#endif
}`,`uniform vec2 u_pixel_coord_upper;uniform vec2 u_pixel_coord_lower;uniform float u_height_factor;uniform vec3 u_scale;uniform float u_vertical_gradient;uniform lowp float u_opacity;uniform vec2 u_fill_translate;uniform vec3 u_lightcolor;uniform lowp vec3 u_lightpos;uniform lowp vec3 u_lightpos_globe;uniform lowp float u_lightintensity;layout(location=0) in vec2 a_pos;layout(location=1) in ivec4 a_normal_ed;
#ifdef TERRAIN3D
layout(location=2) in vec2 a_centroid;
#endif
#ifdef GLOBE
out vec3 v_sphere_pos;
#endif
out vec2 v_pos_a;out vec2 v_pos_b;out vec4 v_lighting;
#pragma maplibre: define lowp float base
#pragma maplibre: define lowp float height
#pragma maplibre: define lowp vec4 pattern_from
#pragma maplibre: define lowp vec4 pattern_to
#pragma maplibre: define lowp float pixel_ratio_from
#pragma maplibre: define lowp float pixel_ratio_to
void main() {
#pragma maplibre: initialize lowp float base
#pragma maplibre: initialize lowp float height
#pragma maplibre: initialize mediump vec4 pattern_from
#pragma maplibre: initialize mediump vec4 pattern_to
#pragma maplibre: initialize lowp float pixel_ratio_from
#pragma maplibre: initialize lowp float pixel_ratio_to
vec2 pattern_tl_a=pattern_from.xy;vec2 pattern_br_a=pattern_from.zw;vec2 pattern_tl_b=pattern_to.xy;vec2 pattern_br_b=pattern_to.zw;float tileRatio=u_scale.x;float fromScale=u_scale.y;float toScale=u_scale.z;vec3 normal=vec3(a_normal_ed.xyz);float edgedistance=float(a_normal_ed.w);vec2 display_size_a=(pattern_br_a-pattern_tl_a)/pixel_ratio_from;vec2 display_size_b=(pattern_br_b-pattern_tl_b)/pixel_ratio_to;float gradient_base=max(0.0,base);float gradient_height=max(0.0,height);
#ifdef TERRAIN3D
float height_terrain3d_offset=get_elevation(a_centroid);float base_terrain3d_offset=height_terrain3d_offset-(base > 0.0 ? 0.0 : 10.0);
#else
float height_terrain3d_offset=0.0;float base_terrain3d_offset=0.0;
#endif
base=max(0.0,base)+base_terrain3d_offset;height=max(0.0,height)+height_terrain3d_offset;float t=float(a_normal_ed.x & 1);float elevation=t > 0.0 ? height : base;vec2 posInTile=a_pos+u_fill_translate;
#ifdef GLOBE
vec3 spherePos=projectToSphere(posInTile,a_pos);vec3 elevatedPos=spherePos*(1.0+elevation/GLOBE_RADIUS);v_sphere_pos=elevatedPos;gl_Position=interpolateProjectionFor3D(posInTile,spherePos,elevation);
#else
gl_Position=u_projection_matrix*vec4(posInTile,elevation,1.0);
#endif
vec2 pos=a_normal_ed.x==1 && a_normal_ed.y==0 && a_normal_ed.z==16384
? a_pos
: vec2(edgedistance,elevation*u_height_factor);v_pos_a=get_pattern_pos(u_pixel_coord_upper,u_pixel_coord_lower,fromScale*display_size_a,tileRatio,pos);v_pos_b=get_pattern_pos(u_pixel_coord_upper,u_pixel_coord_lower,toScale*display_size_b,tileRatio,pos);v_lighting=vec4(0.0,0.0,0.0,1.0);float directional=clamp(dot(normal/16383.0,u_lightpos),0.0,1.0);directional=mix((1.0-u_lightintensity),max((0.5+u_lightintensity),1.0),directional);if (normal.z==0.0) {directional*=((1.0-u_vertical_gradient)+(u_vertical_gradient*clamp((t+gradient_base)*pow(gradient_height/150.0,0.5),mix(0.7,0.98,1.0-u_lightintensity),1.0)));}v_lighting.rgb+=clamp(directional*u_lightcolor,mix(vec3(0.0),vec3(0.3),1.0-u_lightcolor),vec3(1.0));v_lighting*=u_opacity;}`),hillshadePrepare:$(`#ifdef GL_ES
precision highp float;
#endif
uniform sampler2D u_image;in vec2 v_pos;uniform vec2 u_dimension;uniform float u_zoom;uniform vec4 u_unpack;float getElevation(ivec2 texel) {vec4 data=texelFetch(u_image,texel,0)*255.0;data.a=-1.0;return dot(data,u_unpack);}void main() {ivec2 pos=ivec2(gl_FragCoord.xy)+ivec2(1);float tileSize=u_dimension.x-4.0;float a=getElevation(pos+ivec2(-1,-1));float b=getElevation(pos+ivec2(0,-1));float c=getElevation(pos+ivec2(1,-1));float d=getElevation(pos+ivec2(-1,0));float e=getElevation(pos);float f=getElevation(pos+ivec2(1,0));float g=getElevation(pos+ivec2(-1,1));float h=getElevation(pos+ivec2(0,1));float i=getElevation(pos+ivec2(1,1));float exaggerationFactor=u_zoom < 2.0 ? 0.4 : u_zoom < 4.5 ? 0.35 : 0.3;float exaggeration=u_zoom < 15.0 ? (u_zoom-15.0)*exaggerationFactor : 0.0;vec2 deriv=vec2((c+f+f+i)-(a+d+d+g),(g+h+h+i)-(a+b+b+c))*tileSize/pow(2.0,exaggeration+(28.2562-u_zoom));fragColor=clamp(vec4(deriv.x/8.0+128.0/255.0,deriv.y/8.0+128.0/255.0,1.0,1.0),0.0,1.0);
#ifdef OVERDRAW_INSPECTOR
fragColor=vec4(1.0);
#endif
}`,`uniform mat4 u_matrix;uniform vec2 u_dimension;layout(location=0) in vec2 a_pos;layout(location=1) in vec2 a_texture_pos;out vec2 v_pos;void main() {gl_Position=u_matrix*vec4(a_pos,0,1);highp vec2 epsilon=1.0/u_dimension;float scale=(u_dimension.x-2.0)/u_dimension.x;v_pos=(a_texture_pos/8192.0)*scale+epsilon;}`),hillshade:$(`uniform sampler2D u_image;in highp vec2 v_pos;uniform vec2 u_latrange;uniform float u_exaggeration;uniform vec4 u_accent;uniform int u_method;uniform float u_altitudes[NUM_ILLUMINATION_SOURCES];uniform float u_azimuths[NUM_ILLUMINATION_SOURCES];uniform vec4 u_shadows[NUM_ILLUMINATION_SOURCES];uniform vec4 u_highlights[NUM_ILLUMINATION_SOURCES];
#define PI 3.141592653589793
#define STANDARD 0
#define COMBINED 1
#define IGOR 2
#define MULTIDIRECTIONAL 3
#define BASIC 4
float get_aspect(vec2 deriv){return deriv.x !=0.0 ? atan(deriv.y,-deriv.x) : PI/2.0*(deriv.y > 0.0 ? 1.0 :-1.0);}void igor_hillshade(vec2 deriv){deriv=deriv*u_exaggeration*2.0;float aspect=get_aspect(deriv);float azimuth=u_azimuths[0]+PI;float slope_stength=atan(length(deriv))*2.0/PI;float aspect_strength=1.0-abs(mod((aspect+azimuth)/PI+0.5,2.0)-1.0);float shadow_strength=slope_stength*aspect_strength;float highlight_strength=slope_stength*(1.0-aspect_strength);fragColor=u_shadows[0]*shadow_strength+u_highlights[0]*highlight_strength;}void standard_hillshade(vec2 deriv){float azimuth=u_azimuths[0]+PI;float slope=atan(0.625*length(deriv));float aspect=get_aspect(deriv);float intensity=u_exaggeration;float base=1.875-intensity*1.75;float maxValue=0.5*PI;float scaledSlope=intensity !=0.5 ? ((pow(base,slope)-1.0)/(pow(base,maxValue)-1.0))*maxValue : slope;float accent=cos(scaledSlope);vec4 accent_color=(1.0-accent)*u_accent*clamp(intensity*2.0,0.0,1.0);float shade=abs(mod((aspect+azimuth)/PI+0.5,2.0)-1.0);vec4 shade_color=mix(u_shadows[0],u_highlights[0],shade)*sin(scaledSlope)*clamp(intensity*2.0,0.0,1.0);fragColor=accent_color*(1.0-shade_color.a)+shade_color;}void basic_hillshade(vec2 deriv){deriv=deriv*u_exaggeration*2.0;float azimuth=u_azimuths[0]+PI;float cos_az=cos(azimuth);float sin_az=sin(azimuth);float cos_alt=cos(u_altitudes[0]);float sin_alt=sin(u_altitudes[0]);float cang=(sin_alt-(deriv.y*cos_az*cos_alt-deriv.x*sin_az*cos_alt))/sqrt(1.0+dot(deriv,deriv));float shade=clamp(cang,0.0,1.0);if(shade > 0.5){fragColor=u_highlights[0]*(2.0*shade-1.0);}else
{fragColor=u_shadows[0]*(1.0-2.0*shade);}}void multidirectional_hillshade(vec2 deriv){deriv=deriv*u_exaggeration*2.0;fragColor=vec4(0,0,0,0);for(int i=0; i < NUM_ILLUMINATION_SOURCES; i++){float cos_alt=cos(u_altitudes[i]);float sin_alt=sin(u_altitudes[i]);float cos_az=-cos(u_azimuths[i]);float sin_az=-sin(u_azimuths[i]);float cang=(sin_alt-(deriv.y*cos_az*cos_alt-deriv.x*sin_az*cos_alt))/sqrt(1.0+dot(deriv,deriv));float shade=clamp(cang,0.0,1.0);if(shade > 0.5){fragColor+=u_highlights[i]*(2.0*shade-1.0)/float(NUM_ILLUMINATION_SOURCES);}else
{fragColor+=u_shadows[i]*(1.0-2.0*shade)/float(NUM_ILLUMINATION_SOURCES);}}}void combined_hillshade(vec2 deriv){deriv=deriv*u_exaggeration*2.0;float azimuth=u_azimuths[0]+PI;float cos_az=cos(azimuth);float sin_az=sin(azimuth);float cos_alt=cos(u_altitudes[0]);float sin_alt=sin(u_altitudes[0]);float cang=acos((sin_alt-(deriv.y*cos_az*cos_alt-deriv.x*sin_az*cos_alt))/sqrt(1.0+dot(deriv,deriv)));cang=clamp(cang,0.0,PI/2.0);float shade=cang*atan(length(deriv))*4.0/PI/PI;float highlight=(PI/2.0-cang)*atan(length(deriv))*4.0/PI/PI;fragColor=u_shadows[0]*shade+u_highlights[0]*highlight;}void main() {highp vec2 size=vec2(textureSize(u_image,0));highp vec2 texturePos=(v_pos*(size-2.0)+1.0)/size;vec4 pixel=texture(u_image,texturePos);float scaleFactor=cos(radians((u_latrange[0]-u_latrange[1])*(1.0-v_pos.y)+u_latrange[1]));vec2 deriv=(pixel.rg-128.0/255.0)*8.0/scaleFactor;if (u_method==BASIC) {basic_hillshade(deriv);} else if (u_method==COMBINED) {combined_hillshade(deriv);} else if (u_method==IGOR) {igor_hillshade(deriv);} else if (u_method==MULTIDIRECTIONAL) {multidirectional_hillshade(deriv);} else if (u_method==STANDARD) {standard_hillshade(deriv);} else {standard_hillshade(deriv);}
#ifdef OVERDRAW_INSPECTOR
fragColor=vec4(1.0);
#endif
}`,`uniform mat4 u_matrix;layout(location=0) in vec2 a_pos;out vec2 v_pos;void main() {gl_Position=projectTile(a_pos,a_pos);v_pos=a_pos/8192.0;if (a_pos.y <-32767.5) {v_pos.y=0.0;}if (a_pos.y > 32766.5) {v_pos.y=1.0;}}`),line:$(`in vec2 v_width2;in vec2 v_normal;in float v_gamma_scale;
#ifdef GLOBE
in float v_depth;
#endif
#pragma maplibre: define highp vec4 color
#pragma maplibre: define lowp float blur
#pragma maplibre: define lowp float opacity
void main() {
#pragma maplibre: initialize highp vec4 color
#pragma maplibre: initialize lowp float blur
#pragma maplibre: initialize lowp float opacity
clipAntimeridian();float dist=length(v_normal)*v_width2.s;float blur2=(blur+1.0/u_device_pixel_ratio)*v_gamma_scale;float alpha=clamp(min(dist-(v_width2.t-blur2),v_width2.s-dist)/blur2,0.0,1.0);fragColor=color*(alpha*opacity);
#ifdef GLOBE
if (v_depth > 1.0) {discard;}
#endif
#ifdef OVERDRAW_INSPECTOR
fragColor=vec4(1.0);
#endif
}`,`
#define scale 0.015873016
layout(location=0) in ivec2 a_pos_normal;layout(location=1) in uvec4 a_data;layout(location=2) in vec2 a_offset_normal;uniform vec2 u_translation;uniform mediump float u_ratio;out vec2 v_normal;out vec2 v_width2;out float v_gamma_scale;out highp float v_linesofar;
#ifdef GLOBE
out float v_depth;
#endif
#pragma maplibre: define highp vec4 color
#pragma maplibre: define lowp float blur
#pragma maplibre: define lowp float opacity
#pragma maplibre: define mediump float gapwidth
#pragma maplibre: define lowp float offset
#pragma maplibre: define mediump float width
void main() {
#pragma maplibre: initialize highp vec4 color
#pragma maplibre: initialize lowp float blur
#pragma maplibre: initialize lowp float opacity
#pragma maplibre: initialize mediump float gapwidth
#pragma maplibre: initialize lowp float offset
#pragma maplibre: initialize mediump float width
if (opacity < 0.01) {gl_Position=vec4(-2.0,-2.0,-2.0,1.0);return;}float ANTIALIASING=1.0/u_device_pixel_ratio/2.0;vec2 a_extrude=vec2(ivec2(a_data.xy)-128);v_linesofar=float((a_data.z >> 2u)+a_data.w*64u)*2.0;vec2 pos=vec2(a_pos_normal >> 1);mediump vec2 normal=vec2(a_pos_normal & 1);normal.y=normal.y*2.0-1.0;v_normal=normal;gapwidth=gapwidth/2.0;float halfwidth=width/2.0;offset=-1.0*offset;float inset=gapwidth+(gapwidth > 0.0 ? ANTIALIASING : 0.0);float outset=gapwidth+halfwidth*(gapwidth > 0.0 ? 2.0 : 1.0)+(halfwidth==0.0 ? 0.0 : ANTIALIASING);mediump vec2 dist=outset*a_extrude*scale;mediump vec2 offset2=offset*a_offset_normal*scale*normal.y;float adjustedThickness=projectLineThickness(pos.y);vec4 projected_no_extrude=projectTile(pos+offset2/u_ratio*adjustedThickness+u_translation);vec4 projected_with_extrude=projectTile(pos+offset2/u_ratio*adjustedThickness+u_translation+dist/u_ratio*adjustedThickness);gl_Position=projected_with_extrude;
#ifdef GLOBE
v_depth=gl_Position.z/gl_Position.w;
#endif
#ifdef TERRAIN3D
v_gamma_scale=1.0;
#else
float extrude_length_without_perspective=length(dist);float extrude_length_with_perspective=length((projected_with_extrude.xy-projected_no_extrude.xy)/projected_with_extrude.w*u_units_to_pixels);v_gamma_scale=extrude_length_without_perspective/extrude_length_with_perspective;
#endif
v_width2=vec2(outset,inset);}`),lineGradient:$(`uniform sampler2D u_image;in vec2 v_width2;in vec2 v_normal;in float v_gamma_scale;in highp vec2 v_uv;
#ifdef GLOBE
in float v_depth;
#endif
#pragma maplibre: define lowp float blur
#pragma maplibre: define lowp float opacity
void main() {
#pragma maplibre: initialize lowp float blur
#pragma maplibre: initialize lowp float opacity
clipAntimeridian();float dist=length(v_normal)*v_width2.s;float blur2=(blur+1.0/u_device_pixel_ratio)*v_gamma_scale;float alpha=clamp(min(dist-(v_width2.t-blur2),v_width2.s-dist)/blur2,0.0,1.0);vec4 color=texture(u_image,v_uv);fragColor=color*(alpha*opacity);
#ifdef GLOBE
if (v_depth > 1.0) {discard;}
#endif
#ifdef OVERDRAW_INSPECTOR
fragColor=vec4(1.0);
#endif
}`,`
#define scale 0.015873016
layout(location=0) in ivec2 a_pos_normal;layout(location=1) in uvec4 a_data;layout(location=2) in vec2 a_offset_normal;layout(location=3) in float a_uv_x;layout(location=4) in float a_split_index;uniform vec2 u_translation;uniform mediump float u_ratio;uniform float u_image_height;out vec2 v_normal;out vec2 v_width2;out float v_gamma_scale;out highp vec2 v_uv;
#ifdef GLOBE
out float v_depth;
#endif
#pragma maplibre: define lowp float blur
#pragma maplibre: define lowp float opacity
#pragma maplibre: define mediump float gapwidth
#pragma maplibre: define lowp float offset
#pragma maplibre: define mediump float width
void main() {
#pragma maplibre: initialize lowp float blur
#pragma maplibre: initialize lowp float opacity
#pragma maplibre: initialize mediump float gapwidth
#pragma maplibre: initialize lowp float offset
#pragma maplibre: initialize mediump float width
if (opacity < 0.01) {gl_Position=vec4(-2.0,-2.0,-2.0,1.0);return;}float ANTIALIASING=1.0/u_device_pixel_ratio/2.0;vec2 a_extrude=vec2(ivec2(a_data.xy)-128);highp float texel_height=1.0/u_image_height;highp float half_texel_height=0.5*texel_height;v_uv=vec2(a_uv_x,a_split_index*texel_height-half_texel_height);vec2 pos=vec2(a_pos_normal >> 1);mediump vec2 normal=vec2(a_pos_normal & 1);normal.y=normal.y*2.0-1.0;v_normal=normal;gapwidth=gapwidth/2.0;float halfwidth=width/2.0;offset=-1.0*offset;float inset=gapwidth+(gapwidth > 0.0 ? ANTIALIASING : 0.0);float outset=gapwidth+halfwidth*(gapwidth > 0.0 ? 2.0 : 1.0)+(halfwidth==0.0 ? 0.0 : ANTIALIASING);mediump vec2 dist=outset*a_extrude*scale;mediump vec2 offset2=offset*a_offset_normal*scale*normal.y;float adjustedThickness=projectLineThickness(pos.y);vec4 projected_no_extrude=projectTile(pos+offset2/u_ratio*adjustedThickness+u_translation);vec4 projected_with_extrude=projectTile(pos+offset2/u_ratio*adjustedThickness+u_translation+dist/u_ratio*adjustedThickness);gl_Position=projected_with_extrude;
#ifdef GLOBE
v_depth=gl_Position.z/gl_Position.w;
#endif
#ifdef TERRAIN3D
v_gamma_scale=1.0;
#else
float extrude_length_without_perspective=length(dist);float extrude_length_with_perspective=length((projected_with_extrude.xy-projected_no_extrude.xy)/projected_with_extrude.w*u_units_to_pixels);v_gamma_scale=extrude_length_without_perspective/extrude_length_with_perspective;
#endif
v_width2=vec2(outset,inset);}`),linePattern:$(`#ifdef GL_ES
precision highp float;
#endif
uniform vec2 u_texsize;uniform float u_fade;uniform mediump vec3 u_scale;uniform sampler2D u_image;in vec2 v_normal;in vec2 v_width2;in float v_linesofar;in float v_gamma_scale;in float v_width;
#ifdef GLOBE
in float v_depth;
#endif
#pragma maplibre: define lowp vec4 pattern_from
#pragma maplibre: define lowp vec4 pattern_to
#pragma maplibre: define lowp float pixel_ratio_from
#pragma maplibre: define lowp float pixel_ratio_to
#pragma maplibre: define lowp float blur
#pragma maplibre: define lowp float opacity
void main() {
#pragma maplibre: initialize mediump vec4 pattern_from
#pragma maplibre: initialize mediump vec4 pattern_to
#pragma maplibre: initialize lowp float pixel_ratio_from
#pragma maplibre: initialize lowp float pixel_ratio_to
#pragma maplibre: initialize lowp float blur
#pragma maplibre: initialize lowp float opacity
clipAntimeridian();vec2 pattern_tl_a=pattern_from.xy;vec2 pattern_br_a=pattern_from.zw;vec2 pattern_tl_b=pattern_to.xy;vec2 pattern_br_b=pattern_to.zw;float tileZoomRatio=u_scale.x;float fromScale=u_scale.y;float toScale=u_scale.z;vec2 display_size_a=(pattern_br_a-pattern_tl_a)/pixel_ratio_from;vec2 display_size_b=(pattern_br_b-pattern_tl_b)/pixel_ratio_to;vec2 pattern_size_a=vec2(display_size_a.x*fromScale/tileZoomRatio,display_size_a.y);vec2 pattern_size_b=vec2(display_size_b.x*toScale/tileZoomRatio,display_size_b.y);float aspect_a=display_size_a.y/v_width;float aspect_b=display_size_b.y/v_width;float dist=length(v_normal)*v_width2.s;float blur2=(blur+1.0/u_device_pixel_ratio)*v_gamma_scale;float alpha=clamp(min(dist-(v_width2.t-blur2),v_width2.s-dist)/blur2,0.0,1.0);float x_a=mod(v_linesofar/pattern_size_a.x*aspect_a,1.0);float x_b=mod(v_linesofar/pattern_size_b.x*aspect_b,1.0);float y=0.5*v_normal.y+0.5;vec2 texel_size=1.0/u_texsize;vec2 pos_a=mix(pattern_tl_a*texel_size-texel_size,pattern_br_a*texel_size+texel_size,vec2(x_a,y));vec2 pos_b=mix(pattern_tl_b*texel_size-texel_size,pattern_br_b*texel_size+texel_size,vec2(x_b,y));vec4 color=mix(texture(u_image,pos_a),texture(u_image,pos_b),u_fade);fragColor=color*alpha*opacity;
#ifdef GLOBE
if (v_depth > 1.0) {discard;}
#endif
#ifdef OVERDRAW_INSPECTOR
fragColor=vec4(1.0);
#endif
}`,`
#define scale 0.015873016
#define LINE_DISTANCE_SCALE 2.0
layout(location=0) in ivec2 a_pos_normal;layout(location=1) in uvec4 a_data;layout(location=2) in vec2 a_offset_normal;uniform vec2 u_translation;uniform mediump float u_ratio;out vec2 v_normal;out vec2 v_width2;out float v_linesofar;out float v_gamma_scale;out float v_width;
#ifdef GLOBE
out float v_depth;
#endif
#pragma maplibre: define lowp float blur
#pragma maplibre: define lowp float opacity
#pragma maplibre: define lowp float offset
#pragma maplibre: define mediump float gapwidth
#pragma maplibre: define mediump float width
#pragma maplibre: define lowp float floorwidth
#pragma maplibre: define lowp vec4 pattern_from
#pragma maplibre: define lowp vec4 pattern_to
#pragma maplibre: define lowp float pixel_ratio_from
#pragma maplibre: define lowp float pixel_ratio_to
void main() {
#pragma maplibre: initialize lowp float blur
#pragma maplibre: initialize lowp float opacity
#pragma maplibre: initialize lowp float offset
#pragma maplibre: initialize mediump float gapwidth
#pragma maplibre: initialize mediump float width
#pragma maplibre: initialize lowp float floorwidth
#pragma maplibre: initialize mediump vec4 pattern_from
#pragma maplibre: initialize mediump vec4 pattern_to
#pragma maplibre: initialize lowp float pixel_ratio_from
#pragma maplibre: initialize lowp float pixel_ratio_to
if (opacity < 0.01) {gl_Position=vec4(-2.0,-2.0,-2.0,1.0);return;}float ANTIALIASING=1.0/u_device_pixel_ratio/2.0;vec2 a_extrude=vec2(ivec2(a_data.xy)-128);float a_linesofar=float((a_data.z >> 2u)+a_data.w*64u)*LINE_DISTANCE_SCALE;vec2 pos=vec2(a_pos_normal >> 1);mediump vec2 normal=vec2(a_pos_normal & 1);normal.y=normal.y*2.0-1.0;v_normal=normal;gapwidth=gapwidth/2.0;float halfwidth=width/2.0;offset=-1.0*offset;float inset=gapwidth+(gapwidth > 0.0 ? ANTIALIASING : 0.0);float outset=gapwidth+halfwidth*(gapwidth > 0.0 ? 2.0 : 1.0)+(halfwidth==0.0 ? 0.0 : ANTIALIASING);mediump vec2 dist=outset*a_extrude*scale;mediump vec2 offset2=offset*a_offset_normal*scale*normal.y;float adjustedThickness=projectLineThickness(pos.y);vec4 projected_no_extrude=projectTile(pos+offset2/u_ratio*adjustedThickness+u_translation);vec4 projected_with_extrude=projectTile(pos+offset2/u_ratio*adjustedThickness+u_translation+dist/u_ratio*adjustedThickness);gl_Position=projected_with_extrude;
#ifdef GLOBE
v_depth=gl_Position.z/gl_Position.w;
#endif
#ifdef TERRAIN3D
v_gamma_scale=1.0;
#else
float extrude_length_without_perspective=length(dist);float extrude_length_with_perspective=length((projected_with_extrude.xy-projected_no_extrude.xy)/projected_with_extrude.w*u_units_to_pixels);v_gamma_scale=extrude_length_without_perspective/extrude_length_with_perspective;
#endif
v_linesofar=a_linesofar;v_width2=vec2(outset,inset);v_width=floorwidth;}`),lineSDF:$(`uniform lowp float u_lineatlas_width;uniform sampler2D u_image;uniform float u_mix;in vec2 v_normal;in vec2 v_width2;in vec2 v_tex_a;in vec2 v_tex_b;in float v_gamma_scale;
#ifdef GLOBE
in float v_depth;
#endif
#pragma maplibre: define highp vec4 color
#pragma maplibre: define lowp float blur
#pragma maplibre: define lowp float opacity
#pragma maplibre: define mediump float width
#pragma maplibre: define lowp float floorwidth
#pragma maplibre: define mediump vec4 dasharray_from
#pragma maplibre: define mediump vec4 dasharray_to
void main() {
#pragma maplibre: initialize highp vec4 color
#pragma maplibre: initialize lowp float blur
#pragma maplibre: initialize lowp float opacity
#pragma maplibre: initialize mediump float width
#pragma maplibre: initialize lowp float floorwidth
#pragma maplibre: initialize mediump vec4 dasharray_from
#pragma maplibre: initialize mediump vec4 dasharray_to
clipAntimeridian();float dist=length(v_normal)*v_width2.s;float blur2=(blur+1.0/u_device_pixel_ratio)*v_gamma_scale;float alpha=clamp(min(dist-(v_width2.t-blur2),v_width2.s-dist)/blur2,0.0,1.0);float sdfdist_a=texture(u_image,v_tex_a).a;float sdfdist_b=texture(u_image,v_tex_b).a;float sdfdist=mix(sdfdist_a,sdfdist_b,u_mix);float sdfgamma=(u_lineatlas_width/256.0/u_device_pixel_ratio)/min(dasharray_from.w,dasharray_to.w);alpha*=smoothstep(0.5-sdfgamma/floorwidth,0.5+sdfgamma/floorwidth,sdfdist);fragColor=color*(alpha*opacity);
#ifdef GLOBE
if (v_depth > 1.0) {discard;}
#endif
#ifdef OVERDRAW_INSPECTOR
fragColor=vec4(1.0);
#endif
}`,`
#define scale 0.015873016
#define LINE_DISTANCE_SCALE 2.0
layout(location=0) in ivec2 a_pos_normal;layout(location=1) in uvec4 a_data;layout(location=2) in vec2 a_offset_normal;uniform vec2 u_translation;uniform mediump float u_ratio;uniform float u_tileratio;uniform float u_crossfade_from;uniform float u_crossfade_to;uniform float u_lineatlas_height;out vec2 v_normal;out vec2 v_width2;out vec2 v_tex_a;out vec2 v_tex_b;out float v_gamma_scale;
#ifdef GLOBE
out float v_depth;
#endif
#pragma maplibre: define highp vec4 color
#pragma maplibre: define lowp float blur
#pragma maplibre: define lowp float opacity
#pragma maplibre: define mediump float gapwidth
#pragma maplibre: define lowp float offset
#pragma maplibre: define mediump float width
#pragma maplibre: define lowp float floorwidth
#pragma maplibre: define mediump vec4 dasharray_from
#pragma maplibre: define mediump vec4 dasharray_to
void main() {
#pragma maplibre: initialize highp vec4 color
#pragma maplibre: initialize lowp float blur
#pragma maplibre: initialize lowp float opacity
#pragma maplibre: initialize mediump float gapwidth
#pragma maplibre: initialize lowp float offset
#pragma maplibre: initialize mediump float width
#pragma maplibre: initialize lowp float floorwidth
#pragma maplibre: initialize mediump vec4 dasharray_from
#pragma maplibre: initialize mediump vec4 dasharray_to
if (opacity < 0.01) {gl_Position=vec4(-2.0,-2.0,-2.0,1.0);return;}float ANTIALIASING=1.0/u_device_pixel_ratio/2.0;vec2 a_extrude=vec2(ivec2(a_data.xy)-128);float a_linesofar=float((a_data.z >> 2u)+a_data.w*64u)*LINE_DISTANCE_SCALE;vec2 pos=vec2(a_pos_normal >> 1);mediump vec2 normal=vec2(a_pos_normal & 1);normal.y=normal.y*2.0-1.0;v_normal=normal;gapwidth=gapwidth/2.0;float halfwidth=width/2.0;offset=-1.0*offset;float inset=gapwidth+(gapwidth > 0.0 ? ANTIALIASING : 0.0);float outset=gapwidth+halfwidth*(gapwidth > 0.0 ? 2.0 : 1.0)+(halfwidth==0.0 ? 0.0 : ANTIALIASING);mediump vec2 dist=outset*a_extrude*scale;mediump vec2 offset2=offset*a_offset_normal*scale*normal.y;float adjustedThickness=projectLineThickness(pos.y);vec4 projected_no_extrude=projectTile(pos+offset2/u_ratio*adjustedThickness+u_translation);vec4 projected_with_extrude=projectTile(pos+offset2/u_ratio*adjustedThickness+u_translation+dist/u_ratio*adjustedThickness);gl_Position=projected_with_extrude;
#ifdef GLOBE
v_depth=gl_Position.z/gl_Position.w;
#endif
#ifdef TERRAIN3D
v_gamma_scale=1.0;
#else
float extrude_length_without_perspective=length(dist);float extrude_length_with_perspective=length((projected_with_extrude.xy-projected_no_extrude.xy)/projected_with_extrude.w*u_units_to_pixels);v_gamma_scale=extrude_length_without_perspective/extrude_length_with_perspective;
#endif
float u_patternscale_a_x=u_tileratio/dasharray_from.w/u_crossfade_from;float u_patternscale_a_y=-dasharray_from.z/2.0/u_lineatlas_height;float u_patternscale_b_x=u_tileratio/dasharray_to.w/u_crossfade_to;float u_patternscale_b_y=-dasharray_to.z/2.0/u_lineatlas_height;v_tex_a=vec2(a_linesofar*u_patternscale_a_x/floorwidth,normal.y*u_patternscale_a_y+(float(dasharray_from.y)+0.5)/u_lineatlas_height);v_tex_b=vec2(a_linesofar*u_patternscale_b_x/floorwidth,normal.y*u_patternscale_b_y+(float(dasharray_to.y)+0.5)/u_lineatlas_height);v_width2=vec2(outset,inset);}`),lineGradientSDF:$(`uniform sampler2D u_image;uniform sampler2D u_image_dash;uniform float u_mix;uniform lowp float u_lineatlas_width;in vec2 v_normal;in vec2 v_width2;in vec2 v_tex_a;in vec2 v_tex_b;in float v_gamma_scale;in highp vec2 v_uv;
#ifdef GLOBE
in float v_depth;
#endif
#pragma maplibre: define lowp float blur
#pragma maplibre: define lowp float opacity
#pragma maplibre: define mediump float width
#pragma maplibre: define lowp float floorwidth
#pragma maplibre: define mediump vec4 dasharray_from
#pragma maplibre: define mediump vec4 dasharray_to
void main() {
#pragma maplibre: initialize lowp float blur
#pragma maplibre: initialize lowp float opacity
#pragma maplibre: initialize mediump float width
#pragma maplibre: initialize lowp float floorwidth
#pragma maplibre: initialize mediump vec4 dasharray_from
#pragma maplibre: initialize mediump vec4 dasharray_to
clipAntimeridian();float dist=length(v_normal)*v_width2.s;float blur2=(blur+1.0/u_device_pixel_ratio)*v_gamma_scale;float alpha=clamp(min(dist-(v_width2.t-blur2),v_width2.s-dist)/blur2,0.0,1.0);vec4 color=texture(u_image,v_uv);float sdfdist_a=texture(u_image_dash,v_tex_a).a;float sdfdist_b=texture(u_image_dash,v_tex_b).a;float sdfdist=mix(sdfdist_a,sdfdist_b,u_mix);float sdfgamma=(u_lineatlas_width/256.0)/min(dasharray_from.w,dasharray_to.w);float dash_alpha=smoothstep(0.5-sdfgamma/floorwidth,0.5+sdfgamma/floorwidth,sdfdist);fragColor=color*(alpha*dash_alpha*opacity);
#ifdef GLOBE
if (v_depth > 1.0) {discard;}
#endif
#ifdef OVERDRAW_INSPECTOR
fragColor=vec4(1.0);
#endif
}`,`
#define scale 0.015873016
#define LINE_DISTANCE_SCALE 2.0
layout(location=0) in ivec2 a_pos_normal;layout(location=1) in uvec4 a_data;layout(location=2) in vec2 a_offset_normal;layout(location=3) in float a_uv_x;layout(location=4) in float a_split_index;uniform vec2 u_translation;uniform mediump float u_ratio;uniform float u_image_height;uniform float u_tileratio;uniform float u_crossfade_from;uniform float u_crossfade_to;uniform float u_lineatlas_height;out vec2 v_normal;out vec2 v_width2;out float v_gamma_scale;out highp vec2 v_uv;out vec2 v_tex_a;out vec2 v_tex_b;
#ifdef GLOBE
out float v_depth;
#endif
#pragma maplibre: define lowp float blur
#pragma maplibre: define lowp float opacity
#pragma maplibre: define mediump float gapwidth
#pragma maplibre: define lowp float offset
#pragma maplibre: define mediump float width
#pragma maplibre: define lowp float floorwidth
#pragma maplibre: define mediump vec4 dasharray_from
#pragma maplibre: define mediump vec4 dasharray_to
void main() {
#pragma maplibre: initialize lowp float blur
#pragma maplibre: initialize lowp float opacity
#pragma maplibre: initialize mediump float gapwidth
#pragma maplibre: initialize lowp float offset
#pragma maplibre: initialize mediump float width
#pragma maplibre: initialize lowp float floorwidth
#pragma maplibre: initialize mediump vec4 dasharray_from
#pragma maplibre: initialize mediump vec4 dasharray_to
if (opacity < 0.01) {gl_Position=vec4(-2.0,-2.0,-2.0,1.0);return;}float ANTIALIASING=1.0/u_device_pixel_ratio/2.0;vec2 a_extrude=vec2(ivec2(a_data.xy)-128);float a_linesofar=float((a_data.z >> 2u)+a_data.w*64u)*LINE_DISTANCE_SCALE;float texel_height=1.0/u_image_height;float half_texel_height=0.5*texel_height;v_uv=vec2(a_uv_x,a_split_index*texel_height-half_texel_height);vec2 pos=vec2(a_pos_normal >> 1);mediump vec2 normal=vec2(a_pos_normal & 1);normal.y=normal.y*2.0-1.0;v_normal=normal;gapwidth=gapwidth/2.0;float halfwidth=width/2.0;offset=-1.0*offset;float inset=gapwidth+(gapwidth > 0.0 ? ANTIALIASING : 0.0);float outset=gapwidth+halfwidth*(gapwidth > 0.0 ? 2.0 : 1.0)+(halfwidth==0.0 ? 0.0 : ANTIALIASING);mediump vec2 dist=outset*a_extrude*scale;mediump vec2 offset2=offset*a_offset_normal*scale*normal.y;float adjustedThickness=projectLineThickness(pos.y);vec4 projected_no_extrude=projectTile(pos+offset2/u_ratio*adjustedThickness+u_translation);vec4 projected_with_extrude=projectTile(pos+offset2/u_ratio*adjustedThickness+u_translation+dist/u_ratio*adjustedThickness);gl_Position=projected_with_extrude;
#ifdef GLOBE
v_depth=gl_Position.z/gl_Position.w;
#endif
#ifdef TERRAIN3D
v_gamma_scale=1.0;
#else
float extrude_length_without_perspective=length(dist);float extrude_length_with_perspective=length((projected_with_extrude.xy-projected_no_extrude.xy)/projected_with_extrude.w*u_units_to_pixels);v_gamma_scale=extrude_length_without_perspective/extrude_length_with_perspective;
#endif
float u_patternscale_a_x=u_tileratio/dasharray_from.w/u_crossfade_from;float u_patternscale_a_y=-dasharray_from.z/2.0/u_lineatlas_height;float u_patternscale_b_x=u_tileratio/dasharray_to.w/u_crossfade_to;float u_patternscale_b_y=-dasharray_to.z/2.0/u_lineatlas_height;v_tex_a=vec2(a_linesofar*u_patternscale_a_x/floorwidth,normal.y*u_patternscale_a_y+(float(dasharray_from.y)+0.5)/u_lineatlas_height);v_tex_b=vec2(a_linesofar*u_patternscale_b_x/floorwidth,normal.y*u_patternscale_b_y+(float(dasharray_to.y)+0.5)/u_lineatlas_height);v_width2=vec2(outset,inset);}`),layerOpacity:$(`uniform sampler2D u_image;uniform float u_opacity;in vec2 v_pos;void main() {fragColor=texture(u_image,v_pos)*u_opacity;
#ifdef OVERDRAW_INSPECTOR
fragColor=vec4(0.0);
#endif
}`,`layout(location=0) in vec2 a_pos;out vec2 v_pos;void main() {gl_Position=vec4(a_pos.x*2.0-1.0,1.0-a_pos.y*2.0,0.0,1.0);v_pos.x=a_pos.x;v_pos.y=1.0-a_pos.y;}`),raster:$(`uniform float u_fade_t;uniform float u_opacity;uniform sampler2D u_image0;uniform sampler2D u_image1;in vec3 v_pos0;in vec3 v_pos1;uniform float u_brightness_low;uniform float u_brightness_high;uniform float u_saturation_factor;uniform float u_contrast_factor;uniform vec3 u_spin_weights;void main() {vec4 color0=texture(u_image0,v_pos0.xy/v_pos0.z);vec4 color1=texture(u_image1,v_pos1.xy/v_pos1.z);if (color0.a > 0.0) {color0.rgb=color0.rgb/color0.a;}if (color1.a > 0.0) {color1.rgb=color1.rgb/color1.a;}vec4 color=mix(color0,color1,u_fade_t);color.a*=u_opacity;vec3 rgb=color.rgb;rgb=vec3(dot(rgb,u_spin_weights.xyz),dot(rgb,u_spin_weights.zxy),dot(rgb,u_spin_weights.yzx));float average=(color.r+color.g+color.b)/3.0;rgb+=(average-rgb)*u_saturation_factor;rgb=(rgb-0.5)*u_contrast_factor+0.5;vec3 u_high_vec=vec3(u_brightness_low,u_brightness_low,u_brightness_low);vec3 u_low_vec=vec3(u_brightness_high,u_brightness_high,u_brightness_high);fragColor=vec4(mix(u_high_vec,u_low_vec,rgb)*color.a,color.a);
#ifdef OVERDRAW_INSPECTOR
fragColor=vec4(1.0);
#endif
}`,`uniform vec2 u_tl_parent;uniform float u_scale_parent;uniform float u_buffer_scale;uniform vec3 u_image_warp;uniform vec4 u_coords_top;uniform vec4 u_coords_bottom;layout(location=0) in vec2 a_pos;out vec3 v_pos0;out vec3 v_pos1;void main() {vec2 fractionalPos=a_pos/8192.0;vec2 topLeft=u_coords_top.xy;vec2 topRight=u_coords_top.zw;vec2 bottomLeft=u_coords_bottom.xy;vec2 bottomRight=u_coords_bottom.zw;vec2 bilinearPos=mix(mix(topLeft,topRight,fractionalPos.x),mix(bottomLeft,bottomRight,fractionalPos.x),fractionalPos.y);float denominator=dot(u_image_warp.xy,fractionalPos)+1.0;vec2 acrossTop=topRight-topLeft+u_image_warp.x*topRight;vec2 downLeft=bottomLeft-topLeft+u_image_warp.y*bottomLeft;vec2 projectivePos=(acrossTop*fractionalPos.x+downLeft*fractionalPos.y+topLeft)/denominator;vec2 position=mix(projectivePos,bilinearPos,u_image_warp.z);gl_Position=projectTile(position,position);vec2 texturePos=((fractionalPos-0.5)/u_buffer_scale)+0.5;
#ifdef GLOBE
if (a_pos.y <-32767.5) {texturePos.y=0.0;}if (a_pos.y > 32766.5) {texturePos.y=1.0;}
#endif
float perspectiveRatio=mix(1.0/denominator,1.0,u_image_warp.z);v_pos0=vec3(texturePos*perspectiveRatio,perspectiveRatio);vec2 parentPos=(texturePos*u_scale_parent)+u_tl_parent;v_pos1=vec3(parentPos*perspectiveRatio,perspectiveRatio);}`),symbolIcon:$(`uniform sampler2D u_texture;in vec2 v_tex;in float v_total_opacity;void main() {fragColor=texture(u_texture,v_tex)*v_total_opacity;
#ifdef OVERDRAW_INSPECTOR
fragColor=vec4(1.0);
#endif
}`,`layout(location=0) in vec4 a_pos_offset;layout(location=1) in uvec4 a_data;layout(location=2) in vec4 a_pixeloffset;layout(location=3) in vec3 a_projected_pos;layout(location=4) in uint a_fade_opacity;layout(location=5) in float a_height_offset;uniform bool u_is_size_zoom_constant;uniform bool u_is_size_feature_constant;uniform highp float u_size_t;uniform highp float u_size;uniform bool u_rotate_symbol;uniform mat4 u_label_plane_matrix;uniform mat4 u_coord_matrix;uniform bool u_is_text;uniform bool u_pitch_with_map;uniform vec2 u_texsize;uniform bool u_is_along_line;uniform bool u_is_variable_anchor;uniform vec2 u_translation;uniform float u_pitched_scale;uniform bool u_is_offset;uniform bool u_height_anchor_ground;out vec2 v_tex;out float v_total_opacity;
#pragma maplibre: define lowp float opacity
void main() {
#pragma maplibre: initialize lowp float opacity
vec2 a_pos=a_pos_offset.xy;vec2 a_offset=a_pos_offset.zw;vec2 a_tex=vec2(a_data.xy);vec2 a_size=vec2(a_data.zw);float a_size_min=float(a_data.z >> 1u);vec2 a_pxoffset=a_pixeloffset.xy;vec2 a_minFontScale=a_pixeloffset.zw/256.0;float ele=a_height_offset+(u_height_anchor_ground ? get_elevation(a_pos) : 0.0);highp float segment_angle=-a_projected_pos[2];float size;if (!u_is_size_zoom_constant && !u_is_size_feature_constant) {size=mix(a_size_min,a_size[1],u_size_t)/128.0;} else if (u_is_size_zoom_constant && !u_is_size_feature_constant) {size=a_size_min/128.0;} else {size=u_size;}vec2 translated_a_pos=a_pos+u_translation;vec4 projectedPoint=projectTileWithElevation(translated_a_pos,ele);vec2 fade_opacity=unpack_opacity(a_fade_opacity);float fade_change=fade_opacity[1] > 0.5 ? u_symbol_fade_change :-u_symbol_fade_change;float visibility=calculate_visibility(projectedPoint);v_total_opacity=opacity*max(0.0,min(visibility,fade_opacity[0]+fade_change));if (v_total_opacity < 0.1){gl_Position=vec4(-2.,-2.,-2.,1.);return;}highp float camera_to_anchor_distance=projectedPoint.w;highp float distance_ratio=u_pitch_with_map ?
camera_to_anchor_distance/u_camera_to_center_distance :
u_camera_to_center_distance/camera_to_anchor_distance;highp float perspective_ratio=clamp(0.5+0.5*distance_ratio,0.0,4.0);if (!u_is_offset) {size*=perspective_ratio;}float fontScale=u_is_text ? size/24.0 : size;highp float symbol_rotation=0.0;if (u_rotate_symbol) {vec4 offsetProjectedPoint=projectTileWithElevation(translated_a_pos+vec2(1,0),ele);vec2 a=projectedPoint.xy/projectedPoint.w;vec2 b=offsetProjectedPoint.xy/offsetProjectedPoint.w;symbol_rotation=atan((b.y-a.y)/u_aspect_ratio,b.x-a.x);}highp float angle_sin=sin(segment_angle+symbol_rotation);highp float angle_cos=cos(segment_angle+symbol_rotation);mat2 rotation_matrix=mat2(angle_cos,-1.0*angle_sin,angle_sin,angle_cos);vec4 projected_pos;if (u_is_along_line || u_is_variable_anchor) {projected_pos=vec4(a_projected_pos.xy,ele,1.0);} else if (u_pitch_with_map) {projected_pos=u_label_plane_matrix*vec4(a_projected_pos.xy+u_translation,ele,1.0);} else {projected_pos=u_label_plane_matrix*projectTileWithElevation(a_projected_pos.xy+u_translation,ele);}float z=float(u_pitch_with_map)*projected_pos.z/projected_pos.w;float projectionScaling=1.0;
#ifdef GLOBE
if(u_pitch_with_map) {float anchor_pos_tile_y=(u_coord_matrix*vec4(projected_pos.xy/projected_pos.w,z,1.0)).y;projectionScaling=mix(projectionScaling,1.0/circumferenceRatioAtTileY(anchor_pos_tile_y)*u_pitched_scale,u_projection_transition);}
#endif
vec4 finalPos=u_coord_matrix*vec4(projected_pos.xy/projected_pos.w+rotation_matrix*(a_offset/32.0*max(a_minFontScale,fontScale)+a_pxoffset/16.0)*projectionScaling,z,1.0);if(u_pitch_with_map) {finalPos=projectTileWithElevation(finalPos.xy,finalPos.z);}gl_Position=finalPos;v_tex=a_tex/u_texsize;}`),symbolSDF:$(`#define SDF_PX 8.0
uniform bool u_is_halo;uniform bool u_is_plain;uniform sampler2D u_texture;uniform highp float u_gamma_scale;uniform bool u_is_text;in vec2 v_data0;in vec3 v_data1;
#pragma maplibre: define highp vec4 fill_color
#pragma maplibre: define highp vec4 halo_color
#pragma maplibre: define lowp float halo_width
#pragma maplibre: define lowp float halo_blur
void main() {
#pragma maplibre: initialize highp vec4 fill_color
#pragma maplibre: initialize highp vec4 halo_color
#pragma maplibre: initialize lowp float halo_width
#pragma maplibre: initialize lowp float halo_blur
float EDGE_GAMMA=0.105/u_device_pixel_ratio;vec2 tex=v_data0.xy;float gamma_scale=v_data1.x;float size=v_data1.y;float total_opacity=v_data1[2];float fontScale=u_is_text ? size/24.0 : size;highp float gamma=EDGE_GAMMA/(fontScale*u_gamma_scale);lowp float inner_edge=(256.0-64.0)/256.0;lowp float dist=texture(u_texture,tex).a;lowp vec4 color_alpha_out_text,color_alpha_out_halo;if (u_is_plain){highp float gamma_scaled=gamma*gamma_scale;highp float alpha=smoothstep(inner_edge-gamma_scaled,inner_edge+gamma_scaled,dist);color_alpha_out_text=total_opacity*alpha*fill_color;}if (u_is_halo) {float gamma_halo=(halo_blur*1.19/SDF_PX+EDGE_GAMMA)/(fontScale*u_gamma_scale);float inner_edge_halo=inner_edge+gamma_halo*gamma_scale;highp float gamma_scaled_halo=gamma_halo*gamma_scale;highp float alpha_halo=smoothstep(inner_edge_halo-gamma_scaled_halo,inner_edge_halo+gamma_scaled_halo,dist);highp float halo_edge=(6.0-halo_width/fontScale)/SDF_PX;alpha_halo= min(smoothstep(halo_edge-gamma_scaled_halo,halo_edge+gamma_scaled_halo,dist),1.0-alpha_halo);color_alpha_out_halo=total_opacity*alpha_halo*halo_color;}if (u_is_plain && u_is_halo) {fragColor=color_alpha_out_text+(1.-color_alpha_out_text.a)*color_alpha_out_halo;} else if (u_is_halo){fragColor=color_alpha_out_halo;} else {fragColor=color_alpha_out_text;}
#ifdef OVERDRAW_INSPECTOR
fragColor=vec4(1.0);
#endif
}`,`layout(location=0) in vec4 a_pos_offset;layout(location=1) in uvec4 a_data;layout(location=2) in vec4 a_pixeloffset;layout(location=3) in vec3 a_projected_pos;layout(location=4) in uint a_fade_opacity;layout(location=5) in float a_height_offset;uniform bool u_is_size_zoom_constant;uniform bool u_is_size_feature_constant;uniform highp float u_size_t;uniform highp float u_size;uniform mat4 u_label_plane_matrix;uniform mat4 u_coord_matrix;uniform bool u_is_text;uniform bool u_pitch_with_map;uniform bool u_is_along_line;uniform bool u_is_variable_anchor;uniform bool u_rotate_symbol;uniform vec2 u_texsize;uniform vec2 u_translation;uniform float u_pitched_scale;uniform bool u_is_offset;uniform bool u_height_anchor_ground;out vec2 v_data0;out vec3 v_data1;
#pragma maplibre: define highp vec4 fill_color
#pragma maplibre: define highp vec4 halo_color
#pragma maplibre: define lowp float opacity
#pragma maplibre: define lowp float halo_width
#pragma maplibre: define lowp float halo_blur
void main() {
#pragma maplibre: initialize highp vec4 fill_color
#pragma maplibre: initialize highp vec4 halo_color
#pragma maplibre: initialize lowp float opacity
#pragma maplibre: initialize lowp float halo_width
#pragma maplibre: initialize lowp float halo_blur
vec2 a_pos=a_pos_offset.xy;vec2 a_offset=a_pos_offset.zw;vec2 a_tex=vec2(a_data.xy);vec2 a_size=vec2(a_data.zw);float a_size_min=float(a_data.z >> 1u);vec2 a_pxoffset=a_pixeloffset.xy/16.0;vec2 a_minFontScale=a_pixeloffset.zw/256.0;float ele=a_height_offset+(u_height_anchor_ground ? get_elevation(a_pos) : 0.0);highp float segment_angle=-a_projected_pos[2];float size;if (!u_is_size_zoom_constant && !u_is_size_feature_constant) {size=mix(a_size_min,a_size[1],u_size_t)/128.0;} else if (u_is_size_zoom_constant && !u_is_size_feature_constant) {size=a_size_min/128.0;} else {size=u_size;}vec2 translated_a_pos=a_pos+u_translation;vec4 projectedPoint=projectTileWithElevation(translated_a_pos,ele);vec2 fade_opacity=unpack_opacity(a_fade_opacity);float visibility=calculate_visibility(projectedPoint);float fade_change=fade_opacity[1] > 0.5 ? u_symbol_fade_change :-u_symbol_fade_change;float interpolated_fade_opacity=max(0.0,min(visibility,fade_opacity[0]+fade_change));float total_opacity=opacity*interpolated_fade_opacity;if (total_opacity < 0.1){gl_Position=vec4(-2.,-2.,-2.,1.);return;}highp float camera_to_anchor_distance=projectedPoint.w;highp float distance_ratio=u_pitch_with_map ?
camera_to_anchor_distance/u_camera_to_center_distance :
u_camera_to_center_distance/camera_to_anchor_distance;highp float perspective_ratio=clamp(0.5+0.5*distance_ratio,0.0,4.0);if (!u_is_offset) {size*=perspective_ratio;}float fontScale=u_is_text ? size/24.0 : size;highp float symbol_rotation=0.0;if (u_rotate_symbol) {vec4 offsetProjectedPoint=projectTileWithElevation(translated_a_pos+vec2(1,0),ele);vec2 a=projectedPoint.xy/projectedPoint.w;vec2 b=offsetProjectedPoint.xy/offsetProjectedPoint.w;symbol_rotation=atan((b.y-a.y)/u_aspect_ratio,b.x-a.x);}highp float angle_sin=sin(segment_angle+symbol_rotation);highp float angle_cos=cos(segment_angle+symbol_rotation);mat2 rotation_matrix=mat2(angle_cos,-1.0*angle_sin,angle_sin,angle_cos);vec4 projected_pos;if (u_is_along_line || u_is_variable_anchor) {projected_pos=vec4(a_projected_pos.xy,ele,1.0);} else if (u_pitch_with_map) {projected_pos=u_label_plane_matrix*vec4(a_projected_pos.xy+u_translation,ele,1.0);} else {projected_pos=u_label_plane_matrix*projectTileWithElevation(a_projected_pos.xy+u_translation,ele);}float z=float(u_pitch_with_map)*projected_pos.z/projected_pos.w;float projectionScaling=1.0;
#ifdef GLOBE
if(u_pitch_with_map) {float anchor_pos_tile_y=(u_coord_matrix*vec4(projected_pos.xy/projected_pos.w,z,1.0)).y;projectionScaling=mix(projectionScaling,1.0/circumferenceRatioAtTileY(anchor_pos_tile_y)*u_pitched_scale,u_projection_transition);}
#endif
vec4 finalPos=u_coord_matrix*vec4(projected_pos.xy/projected_pos.w+rotation_matrix*(a_offset/32.0*max(a_minFontScale,fontScale)+a_pxoffset)*projectionScaling,z,1.0);if(u_pitch_with_map) {finalPos=projectTileWithElevation(finalPos.xy,finalPos.z);}float gamma_scale=finalPos.w;gl_Position=finalPos;v_data0=a_tex/u_texsize;v_data1=vec3(gamma_scale,size,total_opacity);}`),symbolTextAndIcon:$(`#define SDF_PX 8.0
#define SDF 1.0
#define ICON 0.0
uniform bool u_is_halo;uniform bool u_is_text;uniform sampler2D u_texture;uniform sampler2D u_texture_icon;uniform highp float u_gamma_scale;in vec4 v_data0;in vec3 v_data1;in float v_is_sdf;
#pragma maplibre: define highp vec4 fill_color
#pragma maplibre: define highp vec4 halo_color
#pragma maplibre: define lowp float halo_width
#pragma maplibre: define lowp float halo_blur
void main() {
#pragma maplibre: initialize highp vec4 fill_color
#pragma maplibre: initialize highp vec4 halo_color
#pragma maplibre: initialize lowp float halo_width
#pragma maplibre: initialize lowp float halo_blur
float total_opacity=v_data1[2];if (v_is_sdf==ICON) {vec2 tex_icon=v_data0.zw;fragColor=texture(u_texture_icon,tex_icon)*total_opacity;
#ifdef OVERDRAW_INSPECTOR
fragColor=vec4(1.0);
#endif
return;}vec2 tex=v_data0.xy;float EDGE_GAMMA=0.105/u_device_pixel_ratio;float gamma_scale=v_data1.x;float size=v_data1.y;float fontScale=size/24.0;highp float gamma=EDGE_GAMMA/(fontScale*u_gamma_scale);lowp float buff=(256.0-64.0)/256.0;lowp float dist=texture(u_texture,tex).a;lowp vec4 color_alpha_out,color_alpha_out_halo;if (u_is_text) {highp float gamma_scaled=gamma*gamma_scale;highp float alpha=smoothstep(buff-gamma_scaled,buff+gamma_scaled,dist);color_alpha_out=fill_color*(alpha*total_opacity);}if (u_is_halo) {highp float gamma_halo=(halo_blur*1.19/SDF_PX+EDGE_GAMMA)/(fontScale*u_gamma_scale);lowp float buff_halo=(6.0-halo_width/fontScale)/SDF_PX;highp float gamma_scaled_halo=gamma_halo*gamma_scale;highp float alpha_halo=smoothstep(buff_halo-gamma_scaled_halo,buff_halo+gamma_scaled_halo,dist);color_alpha_out_halo=halo_color*(alpha_halo*total_opacity);}if (u_is_text && u_is_halo) {fragColor=color_alpha_out+(1.-color_alpha_out.a)*color_alpha_out_halo;} else if (u_is_halo) {fragColor=color_alpha_out_halo;} else {fragColor=color_alpha_out;}
#ifdef OVERDRAW_INSPECTOR
fragColor=vec4(1.0);
#endif
}`,`layout(location=0) in vec4 a_pos_offset;layout(location=1) in uvec4 a_data;layout(location=2) in vec3 a_projected_pos;layout(location=3) in uint a_fade_opacity;layout(location=4) in float a_height_offset;uniform bool u_is_size_zoom_constant;uniform bool u_is_size_feature_constant;uniform highp float u_size_t;uniform highp float u_size;uniform mat4 u_label_plane_matrix;uniform mat4 u_coord_matrix;uniform bool u_is_text;uniform bool u_pitch_with_map;uniform bool u_rotate_symbol;uniform vec2 u_texsize;uniform vec2 u_texsize_icon;uniform bool u_is_along_line;uniform bool u_is_variable_anchor;uniform vec2 u_translation;uniform float u_pitched_scale;uniform bool u_is_offset;uniform bool u_height_anchor_ground;out vec4 v_data0;out vec3 v_data1;out float v_is_sdf;
#pragma maplibre: define highp vec4 fill_color
#pragma maplibre: define highp vec4 halo_color
#pragma maplibre: define lowp float opacity
#pragma maplibre: define lowp float halo_width
#pragma maplibre: define lowp float halo_blur
void main() {
#pragma maplibre: initialize highp vec4 fill_color
#pragma maplibre: initialize highp vec4 halo_color
#pragma maplibre: initialize lowp float opacity
#pragma maplibre: initialize lowp float halo_width
#pragma maplibre: initialize lowp float halo_blur
vec2 a_pos=a_pos_offset.xy;vec2 a_offset=a_pos_offset.zw;vec2 a_tex=vec2(a_data.xy);vec2 a_size=vec2(a_data.zw);float a_size_min=float(a_data.z >> 1u);float is_sdf=float(a_data.z & 1u);float ele=a_height_offset+(u_height_anchor_ground ? get_elevation(a_pos) : 0.0);highp float segment_angle=-a_projected_pos[2];float size;if (!u_is_size_zoom_constant && !u_is_size_feature_constant) {size=mix(a_size_min,a_size[1],u_size_t)/128.0;} else if (u_is_size_zoom_constant && !u_is_size_feature_constant) {size=a_size_min/128.0;} else {size=u_size;}vec2 translated_a_pos=a_pos+u_translation;vec4 projectedPoint=projectTileWithElevation(translated_a_pos,ele);vec2 fade_opacity=unpack_opacity(a_fade_opacity);float visibility=calculate_visibility(projectedPoint);float fade_change=fade_opacity[1] > 0.5 ? u_symbol_fade_change :-u_symbol_fade_change;float interpolated_fade_opacity=max(0.0,min(visibility,fade_opacity[0]+fade_change));float total_opacity=opacity*interpolated_fade_opacity;if (total_opacity < 0.1){gl_Position=vec4(-2.,-2.,-2.,1.);return;}highp float camera_to_anchor_distance=projectedPoint.w;highp float distance_ratio=u_pitch_with_map ?
camera_to_anchor_distance/u_camera_to_center_distance :
u_camera_to_center_distance/camera_to_anchor_distance;highp float perspective_ratio=clamp(0.5+0.5*distance_ratio,0.0,4.0);if (!u_is_offset) {size*=perspective_ratio;}float fontScale=size/24.0;highp float symbol_rotation=0.0;if (u_rotate_symbol) {vec4 offsetProjectedPoint=projectTileWithElevation(translated_a_pos+vec2(1,0),ele);vec2 a=projectedPoint.xy/projectedPoint.w;vec2 b=offsetProjectedPoint.xy/offsetProjectedPoint.w;symbol_rotation=atan((b.y-a.y)/u_aspect_ratio,b.x-a.x);}highp float angle_sin=sin(segment_angle+symbol_rotation);highp float angle_cos=cos(segment_angle+symbol_rotation);mat2 rotation_matrix=mat2(angle_cos,-1.0*angle_sin,angle_sin,angle_cos);vec4 projected_pos;if (u_is_along_line || u_is_variable_anchor) {projected_pos=vec4(a_projected_pos.xy,ele,1.0);} else if (u_pitch_with_map) {projected_pos=u_label_plane_matrix*vec4(a_projected_pos.xy+u_translation,ele,1.0);} else {projected_pos=u_label_plane_matrix*projectTileWithElevation(a_projected_pos.xy+u_translation,ele);}float z=float(u_pitch_with_map)*projected_pos.z/projected_pos.w;float projectionScaling=1.0;
#ifdef GLOBE
if(u_pitch_with_map && !u_is_along_line) {float anchor_pos_tile_y=(u_coord_matrix*vec4(projected_pos.xy/projected_pos.w,z,1.0)).y;projectionScaling=mix(projectionScaling,1.0/circumferenceRatioAtTileY(anchor_pos_tile_y)*u_pitched_scale,u_projection_transition);}
#endif
vec4 finalPos=u_coord_matrix*vec4(projected_pos.xy/projected_pos.w+rotation_matrix*(a_offset/32.0*fontScale)*projectionScaling,z,1.0);if(u_pitch_with_map) {finalPos=projectTileWithElevation(finalPos.xy,finalPos.z);}float gamma_scale=finalPos.w;gl_Position=finalPos;v_data0.xy=a_tex/u_texsize;v_data0.zw=a_tex/u_texsize_icon;v_data1=vec3(gamma_scale,size,total_opacity);v_is_sdf=is_sdf;}`),terrain:$(`uniform sampler2D u_texture;uniform vec4 u_fog_color;uniform vec4 u_horizon_color;uniform float u_fog_ground_blend;uniform float u_fog_ground_blend_opacity;uniform float u_horizon_fog_blend;uniform bool u_is_globe_mode;in vec2 v_texture_pos;in float v_fog_depth;const float gamma=2.2;vec4 gammaToLinear(vec4 color) {return pow(color,vec4(gamma));}vec4 linearToGamma(vec4 color) {return pow(color,vec4(1.0/gamma));}void main() {vec4 surface_color=texture(u_texture,vec2(v_texture_pos.x,1.0-v_texture_pos.y));if (!u_is_globe_mode && u_fog_ground_blend_opacity > 0.0 && v_fog_depth > u_fog_ground_blend) {vec4 surface_color_linear=gammaToLinear(surface_color);float blend_color=smoothstep(0.0,1.0,max((v_fog_depth-u_horizon_fog_blend)/(1.0-u_horizon_fog_blend),0.0));vec4 fog_horizon_color_linear=mix(gammaToLinear(u_fog_color),gammaToLinear(u_horizon_color),blend_color);float factor_fog=max(v_fog_depth-u_fog_ground_blend,0.0)/(1.0-u_fog_ground_blend);fragColor=linearToGamma(mix(surface_color_linear,fog_horizon_color_linear,pow(factor_fog,2.0)*u_fog_ground_blend_opacity));} else {fragColor=surface_color;}}`,`layout(location=0) in vec3 a_pos3d;uniform mat4 u_fog_matrix;uniform float u_ele_delta;out vec2 v_texture_pos;out float v_fog_depth;void main() {float ele=get_elevation(a_pos3d.xy);float ele_delta=a_pos3d.z==1.0 ? u_ele_delta : 0.0;v_texture_pos=a_pos3d.xy/8192.0;gl_Position=projectTileFor3D(a_pos3d.xy,ele-ele_delta);vec4 pos=u_fog_matrix*vec4(a_pos3d.xy,ele,1.0);v_fog_depth=pos.z/pos.w*0.5+0.5;}`),terrainDepth:$(`in float v_depth;const highp vec4 bitSh=vec4(256.*256.*256.,256.*256.,256.,1.);const highp vec4 bitMsk=vec4(0.,vec3(1./256.0));highp vec4 pack(highp float value) {highp vec4 comp=fract(value*bitSh);comp-=comp.xxyz*bitMsk;return comp;}void main() {fragColor=pack(v_depth);}`,`layout(location=0) in vec3 a_pos3d;uniform float u_ele_delta;out float v_depth;void main() {float ele=get_elevation(a_pos3d.xy);float ele_delta=a_pos3d.z==1.0 ? u_ele_delta : 0.0;gl_Position=projectTileFor3D(a_pos3d.xy,ele-ele_delta);v_depth=gl_Position.z/gl_Position.w;}`),terrainHeight:$(`in highp float v_elevation;void main() {fragColor=vec4(v_elevation,0.0,0.0,1.0);}`,`layout(location=0) in vec3 a_pos3d;uniform vec4 u_tile_bounds;out highp float v_elevation;void main() {v_elevation=get_elevation(a_pos3d.xy);vec2 position=u_tile_bounds.xy+a_pos3d.xy/8192.0*u_tile_bounds.zw;gl_Position=vec4(position.x*2.0-1.0,1.0-position.y*2.0,0.0,1.0);}`),atmosphere:$(`#ifdef GL_ES
precision highp float;
#endif
in vec3 view_direction;uniform vec3 u_sun_pos;uniform vec3 u_globe_position;uniform float u_globe_radius;uniform float u_atmosphere_blend;/**Shader use from https:*Made some change to adapt to MapLibre Globe geometry*/const float PI=3.141592653589793;const int iSteps=5;const int jSteps=3;/*radius of the planet*/const float EARTH_RADIUS=6371e3;/*radius of the atmosphere*/const float ATMOS_RADIUS=6471e3;vec2 rsi(vec3 r0,vec3 rd,float sr) {float a=dot(rd,rd);float b=2.0*dot(rd,r0);float c=dot(r0,r0)-(sr*sr);float d=(b*b)-4.0*a*c;if (d < 0.0) return vec2(1e5,-1e5);return vec2((-b-sqrt(d))/(2.0*a),(-b+sqrt(d))/(2.0*a));}vec4 atmosphere(vec3 r,vec3 r0,vec3 pSun,float iSun,float rPlanet,float rAtmos,vec3 kRlh,float kMie,float shRlh,float shMie,float g) {pSun=normalize(pSun);r=normalize(r);vec2 p=rsi(r0,r,rAtmos);if (p.x > p.y) {return vec4(0.0,0.0,0.0,1.0);}if (p.x < 0.0) {p.x=0.0;}vec3 pos=r0+r*p.x;vec2 p2=rsi(r0,r,rPlanet);if (p2.x <=p2.y && p2.x > 0.0) {p.y=min(p.y,p2.x);}float iStepSize=(p.y-p.x)/float(iSteps);float iTime=p.x+iStepSize*0.5;vec3 totalRlh=vec3(0,0,0);vec3 totalMie=vec3(0,0,0);float iOdRlh=0.0;float iOdMie=0.0;float mu=dot(r,pSun);float mumu=mu*mu;float gg=g*g;float pRlh=3.0/(16.0*PI)*(1.0+mumu);float pMie=3.0/(8.0*PI)*((1.0-gg)*(mumu+1.0))/(pow(1.0+gg-2.0*mu*g,1.5)*(2.0+gg));for (int i=0; i < iSteps; i++) {vec3 iPos=r0+r*iTime;float iHeight=length(iPos)-rPlanet;float odStepRlh=exp(-iHeight/shRlh)*iStepSize;float odStepMie=exp(-iHeight/shMie)*iStepSize;iOdRlh+=odStepRlh;iOdMie+=odStepMie;float jStepSize=rsi(iPos,pSun,rAtmos).y/float(jSteps);float jTime=jStepSize*0.5;float jOdRlh=0.0;float jOdMie=0.0;for (int j=0; j < jSteps; j++) {vec3 jPos=iPos+pSun*jTime;float jHeight=length(jPos)-rPlanet;jOdRlh+=exp(-jHeight/shRlh)*jStepSize;jOdMie+=exp(-jHeight/shMie)*jStepSize;jTime+=jStepSize;}vec3 attn=exp(-(kMie*(iOdMie+jOdMie)+kRlh*(iOdRlh+jOdRlh)));totalRlh+=odStepRlh*attn;totalMie+=odStepMie*attn;iTime+=iStepSize;}float opacity=exp(-(length(kRlh)*length(totalRlh)+kMie*length(totalMie)));vec3 color=iSun*(pRlh*kRlh*totalRlh+pMie*kMie*totalMie);return vec4(color,opacity);}void main() {vec3 scale_camera_pos=-u_globe_position*EARTH_RADIUS/u_globe_radius;vec4 color=atmosphere(normalize(view_direction),scale_camera_pos,u_sun_pos,22.0,EARTH_RADIUS,ATMOS_RADIUS,vec3(5.5e-6,13.0e-6,22.4e-6),21e-6,8e3,1.2e3,0.758
);color.rgb=1.0-exp(-1.0*color.rgb);color=pow(color,vec4(1.0/2.2));fragColor=vec4(color.rgb,1.0-color.a)*u_atmosphere_blend;}`,`layout(location=0) in vec2 a_pos;uniform mat4 u_inv_proj_matrix;out vec3 view_direction;void main() {view_direction=(u_inv_proj_matrix*vec4(a_pos,0.0,1.0)).xyz;gl_Position=vec4(a_pos,0.0,1.0);}`),sky:$(`uniform vec4 u_sky_color;uniform vec4 u_horizon_color;uniform vec2 u_horizon;uniform vec2 u_horizon_normal;uniform float u_sky_horizon_blend;uniform float u_sky_blend;uniform vec3 u_globe_position;uniform float u_globe_radius;uniform float u_atmosphere_blend;in vec3 v_view_direction;const float ATMOSPHERE_HEIGHT_TO_GLOBE_RADIUS=100000.0/6371000.0;void main() {float x=gl_FragCoord.x;float y=gl_FragCoord.y;float blend=(y-u_horizon.y)*u_horizon_normal.y+(x-u_horizon.x)*u_horizon_normal.x;float opacity=1.0;if (u_sky_blend > 0.0) {vec3 ray=normalize(v_view_direction);float globe_distance=length(u_globe_position);float angle_to_globe_center=acos(clamp(dot(ray,u_globe_position)/globe_distance,-1.0,1.0));float horizon_angle=asin(min(u_globe_radius/globe_distance,1.0));blend=mix(blend,((angle_to_globe_center-horizon_angle)*u_camera_to_center_distance+1.0)*u_device_pixel_ratio,u_sky_blend);float closest_approach=max(dot(ray,u_globe_position),0.0);float lowest_altitude=sqrt(max(globe_distance*globe_distance-closest_approach*closest_approach,0.0))-u_globe_radius;float atmosphere_height=u_globe_radius*ATMOSPHERE_HEIGHT_TO_GLOBE_RADIUS;float inside_atmosphere=1.0-smoothstep(atmosphere_height,10.0*atmosphere_height,globe_distance-u_globe_radius);float through_atmosphere=1.0-smoothstep(0.0,atmosphere_height,lowest_altitude);opacity=inside_atmosphere*through_atmosphere*(1.0-u_atmosphere_blend);}if (blend > 0.0) {if (blend < u_sky_horizon_blend) {fragColor=mix(u_sky_color,u_horizon_color,pow(1.0-blend/u_sky_horizon_blend,2.0));} else {fragColor=u_sky_color;}}fragColor*=mix(1.0,opacity,u_sky_blend);}`,`layout(location=0) in vec2 a_pos;uniform mat4 u_inv_proj_matrix;out vec3 v_view_direction;void main() {v_view_direction=(u_inv_proj_matrix*vec4(a_pos,0.0,1.0)).xyz;gl_Position=vec4(a_pos,1.0,1.0);}`)};function $(e,t){let n=/#pragma maplibre: ([\w]+) ([\w]+) ([\w]+) ([\w]+)/g,r=t.match(/in ([\w]+) ([\w]+)/g),i=e.match(/uniform ([\w]+) ([\w]+)([\s]*)([\w]*)/g),a=t.match(/uniform ([\w]+) ([\w]+)([\s]*)([\w]*)/g),o=a?a.concat(i):i,s=r?r.length:0,c={};return e=e.replace(n,(e,t,n,r,i)=>(c[i]=!0,t===`define`?`
#ifndef HAS_UNIFORM_u_${i}
in ${n} ${r} ${i};
#else
uniform ${n} ${r} u_${i};
#endif
`:`
#ifdef HAS_UNIFORM_u_${i}
    ${n} ${r} ${i} = u_${i};
#endif
`)),t=t.replace(n,(e,t,n,r,i)=>{let a=r===`float`?`vec2`:`vec4`,o=i.match(/color/)?`color`:a;return c[i]?t===`define`?`
#ifndef HAS_UNIFORM_u_${i}
uniform lowp float u_${i}_t;
layout(location = ${s++}) in ${n} ${a} a_${i};
out ${n} ${r} ${i};
#else
uniform ${n} ${r} u_${i};
#endif
`:o===`vec4`?`
#ifndef HAS_UNIFORM_u_${i}
    ${i} = a_${i};
#else
    ${n} ${r} ${i} = u_${i};
#endif
`:`
#ifndef HAS_UNIFORM_u_${i}
    ${i} = unpack_mix_${o}(a_${i}, u_${i}_t);
#else
    ${n} ${r} ${i} = u_${i};
#endif
`:t===`define`?`
#ifndef HAS_UNIFORM_u_${i}
uniform lowp float u_${i}_t;
layout(location = ${s++}) in ${n} ${a} a_${i};
#else
uniform ${n} ${r} u_${i};
#endif
`:o===`vec4`?`
#ifndef HAS_UNIFORM_u_${i}
    ${n} ${r} ${i} = a_${i};
#else
    ${n} ${r} ${i} = u_${i};
#endif
`:`
#ifndef HAS_UNIFORM_u_${i}
    ${n} ${r} ${i} = unpack_mix_${o}(a_${i}, u_${i}_t);
#else
    ${n} ${r} ${i} = u_${i};
#endif
`}),{fragmentSource:e,vertexSource:t,staticAttributes:r,staticUniforms:o}}export{pt as $,y as $t,Et as A,re as At,st as B,se as Bt,ot as C,L as Ct,qe as D,j as Dt,ft as E,pe as Et,gt as F,ee as Ft,Be as G,O as Gt,rt as H,f as Ht,Mt as I,fe as It,St as J,m as Jt,Q as K,D as Kt,Pt as L,P as Lt,_t as M,le as Mt,Nt as N,ue as Nt,Dt as O,ie as Ot,nt as P,F as Pt,at as Q,w as Qt,mt as R,oe as Rt,W as S,A as St,ct as T,I as Tt,ht as U,p as Ut,G as V,de as Vt,$e as W,d as Wt,Tt as X,g as Xt,Ke as Y,h as Yt,Ot as Z,E as Zt,Xe as _,R as _t,Ue as a,l as an,Ze as at,Ge as b,ye as bt,q as c,r as cn,H as ct,Re as d,De as dt,b as en,Ct as et,Le as f,Me as ft,Y as g,Ce as gt,Pe as h,Ee as ht,kt as i,s as in,ut as it,dt as j,ce as jt,Je as k,ne as kt,J as l,e as ln,B as lt,Fe as m,Te as mt,Ft as n,v as nn,ze as nt,bt as o,o as on,it as ot,Ie as p,je as pt,He as q,S as qt,Ne as r,_ as rn,tt as rt,vt as s,a as sn,U as st,Gt as t,x as tn,Ve as tt,X as u,Oe as ut,wt as v,be as vt,Qe as w,te as wt,Ye as x,N as xt,We as y,_e as yt,K as z,ae as zt};