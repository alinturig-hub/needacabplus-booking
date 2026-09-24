import {index,integer,sqliteTable,text} from 'drizzle-orm/sqlite-core';
export const bookings=sqliteTable('bookings',{
 id:text('id').primaryKey(),userId:text('user_id').notNull(),name:text('name').notNull(),phone:text('phone').notNull(),pickup:text('pickup').notNull(),destination:text('destination').notNull(),viaPoints:text('via_points').notNull().default('[]'),pickupNote:text('pickup_note').notNull(),vehicle:text('vehicle').notNull(),farePence:integer('fare_pence').notNull(),status:text('status').notNull().default('test_confirmed'),createdAt:text('created_at').notNull(),
},t=>[index('idx_bookings_created_at').on(t.createdAt)]);
export const tariffs=sqliteTable('tariffs',{id:text('id').primaryKey(),basePence:integer('base_pence').notNull(),perMilePence:integer('per_mile_pence').notNull(),minimumPence:integer('minimum_pence').notNull(),updatedAt:text('updated_at').notNull()});
