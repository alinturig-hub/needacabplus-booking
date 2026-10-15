import {isAdmin,sameOrigin} from '@/lib/security';
import {database,failure,randomUUID} from '@/lib/local-drivers';
import {carTypeInput} from '@/lib/local-fleet';
export const dynamic='force-dynamic';
export async function GET(){if(!await isAdmin())return Response.json({error:'Forbidden'},{status:403});try{const result=await database().query('SELECT t.*, (SELECT COUNT(*)::int FROM local_vehicles v WHERE v.car_type_id=t.id) AS vehicle_count FROM local_car_types t ORDER BY name');return Response.json({items:result.rows})}catch(e){return failure(e)}}
export async function POST(request:Request){if(!sameOrigin(request)||!await isAdmin())return Response.json({error:'Forbidden'},{status:403});try{const v=carTypeInput.parse(await request.json()),id=randomUUID();await database().query('INSERT INTO local_car_types(id,name,description,seats,hand_luggage,checkin_luggage,active) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,v.name,v.description,v.seats,v.hand_luggage,v.checkin_luggage,v.active]);return Response.json({id},{status:201})}catch(e){return failure(e)}}
