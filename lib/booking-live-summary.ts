// Once a job enters POB it remains live until a terminal booking event changes its status.
// Driver tracking may be delayed or temporarily unavailable and must not hide the active job.
export const livePassengerSql=`SELECT COUNT(*)::text AS total
 FROM bookings WHERE status='Passenger On Board'`;
