export const dynamic='force-dynamic';
export async function GET(){
 return Response.json({provider:'openfreemap',lightStyleUrl:'https://tiles.openfreemap.org/styles/liberty',darkStyleUrl:'https://tiles.openfreemap.org/styles/fiord'},{headers:{'Cache-Control':'private, max-age=60'}});
}
