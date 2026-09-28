import {jwtVerify,type JWTVerifyGetKey} from 'jose';
export async function verifyIdentityToken(token:string,provider:'google'|'apple',clientId:string,nonce:string,key:JWTVerifyGetKey){
 const {payload}=await jwtVerify(token,key,{issuer:provider==='google'?['https://accounts.google.com','accounts.google.com']:'https://appleid.apple.com',audience:clientId,algorithms:['RS256'],requiredClaims:['sub','exp','iat','nonce'],maxTokenAge:'10m',clockTolerance:30});
 if(payload.nonce!==nonce||!payload.sub||(payload.azp!==undefined&&payload.azp!==clientId))throw new Error('Invalid identity token binding');
 return payload;
}
