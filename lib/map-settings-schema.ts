import {z} from 'zod';

export const mapSettingsSchema=z.object({
 mapProvider:z.enum(['openstreetmap','maptiler']).default('openstreetmap'),
 searchProvider:z.enum(['openstreetmap','maptiler']).default('openstreetmap'),
 mapTilerLightStyle:z.string().trim().regex(/^[a-z0-9-]{1,80}$/).default('streets-v4'),
 mapTilerDarkStyle:z.string().trim().regex(/^[a-z0-9-]{1,80}$/).default('dark'),
 country:z.string().trim().toLowerCase().regex(/^[a-z]{2}$/).default('gb'),
 language:z.string().trim().toLowerCase().regex(/^[a-z]{2}$/).default('en'),
 proximityLongitude:z.number().finite().min(-180).max(180).default(-4.143),
 proximityLatitude:z.number().finite().min(-90).max(90).default(50.374),
 nearbyPlaceRadiusMetres:z.number().int().min(10).max(250).default(60),
}).strict();

export type MapSettings=z.infer<typeof mapSettingsSchema>;
export const defaultMapSettings=mapSettingsSchema.parse({});
