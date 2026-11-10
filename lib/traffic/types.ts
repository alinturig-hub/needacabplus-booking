import type {TrafficFeed} from './tomtom';
export type TrafficSnapshot={checkedAt:string;refreshSeconds:number;bounds:readonly number[];street:TrafficFeed;tomtom:TrafficFeed};
