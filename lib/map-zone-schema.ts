import {z} from 'zod';
const point=z.tuple([z.number().finite().min(-180).max(180),z.number().finite().min(-85).max(85)]);
function validRing(ring:[number,number][]){
 const n=ring.length-1;if(n<3||ring[0][0]!==ring[n][0]||ring[0][1]!==ring[n][1])return false;
 const orient=(a:number[],b:number[],c:number[])=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 const on=(a:number[],b:number[],c:number[])=>Math.abs(orient(a,b,c))<1e-12&&c[0]>=Math.min(a[0],b[0])&&c[0]<=Math.max(a[0],b[0])&&c[1]>=Math.min(a[1],b[1])&&c[1]<=Math.max(a[1],b[1]);
 let area=0;for(let i=0;i<n;i++){const a=ring[i],b=ring[i+1];if(a[0]===b[0]&&a[1]===b[1])return false;area+=a[0]*b[1]-b[0]*a[1];for(let j=i+1;j<n;j++){if(j===i+1||(i===0&&j===n-1))continue;const c=ring[j],d=ring[j+1];const x=orient(a,b,c),y=orient(a,b,d),u=orient(c,d,a),v=orient(c,d,b);if((x*y<0&&u*v<0)||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b))return false}}
 return Math.abs(area)>1e-12;
}
export const zoneGeometrySchema=z.object({type:z.literal('Polygon'),coordinates:z.tuple([z.array(point).min(4).max(1001).refine(validRing,'Draw a closed polygon without crossing edges.')])}).strict();
export const mapZoneInputSchema=z.object({name:z.string().trim().min(1).max(100),colour:z.string().regex(/^#[0-9a-f]{6}$/i),purpose:z.enum(['operational','pricing','dispatch','demand']),enabled:z.boolean(),geometry:zoneGeometrySchema}).strict();
export type MapZoneInput=z.infer<typeof mapZoneInputSchema>;
export type MapZone=MapZoneInput&{id:string;version:number;updated_at:string};
