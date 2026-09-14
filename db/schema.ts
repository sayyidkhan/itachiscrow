import {sqliteTable,text,integer,index} from 'drizzle-orm/sqlite-core';
export const usageLimits=sqliteTable('usage_limits',{
 id:text('id').primaryKey(),minute:integer('minute').notNull(),minuteCount:integer('minute_count').notNull(),hour:integer('hour').notNull(),hourCount:integer('hour_count').notNull(),expires:integer('expires').notNull()
},table=>[index('usage_limits_expires').on(table.expires)]);
