import type {PreviewData} from './preview-data';
import type {AlertPlan,alertPolicy} from './alert-plan';
export type AlertHistoryRow={id:string;driverId:string;vehicleId:string;driverCallsign:string|null;vehicleCallsign:string|null;message:string;status:string;outcomeCode:string|null;httpStatus:number|null;distanceMetres:number;createdAt:string;completedAt:string|null};
export type AlertHistoryPage={rows:AlertHistoryRow[];nextCursor:string|null};
export type OperationsSnapshot={checkedAt:string;mode:string;transport:string;policy:typeof alertPolicy;roadworks:PreviewData;alerts:AlertPlan;feed:{state:string;subscriptions:{topic:string;confirmedAt:string}[];topics:{topic:string;total:number;lastReceived:string|null}[]};delivery:{ready:boolean;windowHours?:number;statuses:{status:string;count:number;last_attempt:string|null;last_completed:string|null}[];outcomes:{outcome_code:string;count:number;last_completed:string|null}[]}};
