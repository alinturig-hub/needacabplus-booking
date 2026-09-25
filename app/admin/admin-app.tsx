'use client';
import Link from 'next/link';
import {useCallback,useEffect,useState} from 'react';
import {ArrowLeft,CalendarDays,LogOut,RefreshCw,Webhook} from 'lucide-react';
import {Table,TableHeader,TableHead,TableBody,TableRow,TableCell} from '@/components/ui/table';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {Empty,EmptyHeader,EmptyTitle,EmptyDescription} from '@/components/ui/empty';
import {Button} from '@/components/ui/button';
import {Skeleton} from '@/components/ui/skeleton';
import {vehicles,money} from '@/lib/vehicles';

type Booking={id:string;name:string;phone:string;pickup:string;destination:string;pickup_note:string;vehicle:string;fare_pence:number;status:string;created_at:string};

export default function AdminApp(){
 const [bookings,setBookings]=useState<Booking[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const refresh=useCallback(async()=>{setLoading(true);setError('');try{const response=await fetch('/api/bookings');const data=await response.json() as {bookings:Booking[];error?:string};if(!response.ok)throw new Error(data.error);setBookings(data.bookings)}catch(reason){setError(reason instanceof Error?reason.message:'Unable to load bookings.')}finally{setLoading(false)}},[]);
 useEffect(()=>{void refresh()},[refresh]);
 async function status(id:string,status:string){setBusy(true);setError('');try{const response=await fetch('/api/bookings',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,status})});const data=await response.json() as {error?:string};if(!response.ok)throw new Error(data.error);setBookings(items=>items.map(item=>item.id===id?{...item,status}:item));setMessage('Booking updated.')}catch(reason){setError(reason instanceof Error?reason.message:'Unable to update booking.')}finally{setBusy(false)}}
 return <main className="admin-shell">
  <header className="brandbar"><Link className="brand" href="/"><span className="brandmark">N<span>+</span></span><span>NEED A CAB <b>PLUS</b></span></Link><nav className="admin-nav" aria-label="Admin navigation"><Link className="active" href="/admin">Bookings</Link><Link href="/admin/configuration">Configuration</Link></nav><a className="admin-link" href="/api/admin/logout"><LogOut size={16}/>Sign out</a></header>
  <div className="admin-body">
   <div className="admin-title"><div><span className="eyebrow">ADMINISTRATION</span><h1>Incoming bookings.</h1><p className="muted">View and manage bookings received by Need A Cab Plus.</p></div><Link className="text-link" href="/"><ArrowLeft size={16}/>Open customer app</Link></div>
   <div className="admin-notice"><Webhook size={22}/><div><strong>Webhook booking feed</strong><p>Bookings received from the connected provider will appear in this list. Prices and journey details come from the booking data.</p></div></div>
   <div className="stats"><div><span>Total bookings</span><strong>{loading?'—':bookings.length}</strong><small>Latest 200 records</small></div><div><span>Confirmed</span><strong>{loading?'—':bookings.filter(booking=>booking.status.includes('confirmed')).length}</strong><small>Ready bookings</small></div><div><span>Cancelled</span><strong>{loading?'—':bookings.filter(booking=>booking.status.includes('cancelled')).length}</strong><small>Cancelled bookings</small></div></div>
   <div className="admin-toolbar"><div><span className="eyebrow">BOOKINGS</span></div><Button variant="outline" onClick={refresh} disabled={loading||busy}><RefreshCw size={16}/>Refresh</Button></div>
   {error&&<p className="error-message" role="alert">{error}</p>}{message&&<p className="saved-message" role="status">{message}</p>}
   <div className="admin-card">{loading?<div className="loading-list"><Skeleton className="h-10 w-full"/><Skeleton className="h-10 w-full"/><Skeleton className="h-10 w-full"/></div>:bookings.length===0?<Empty><EmptyHeader><CalendarDays size={36}/><EmptyTitle>No bookings received yet</EmptyTitle><EmptyDescription>A booking will appear here after it is received through the connected webhook.</EmptyDescription></EmptyHeader></Empty>:<Table><TableHeader><TableRow><TableHead>Reference / passenger</TableHead><TableHead>Journey</TableHead><TableHead>Vehicle / fare</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{bookings.map(booking=><TableRow key={booking.id}><TableCell><strong>NAC-{booking.id.slice(0,8).toUpperCase()}</strong><span className="cell-line">{booking.name}</span><a className="cell-line muted" href={`tel:${booking.phone.replace(/[^+0-9]/g,'')}`}>{booking.phone}</a><small>{new Date(booking.created_at).toLocaleString('en-GB',{timeZone:'Europe/London'})}</small></TableCell><TableCell className="journey-cell"><span>{booking.pickup}</span><span className="cell-line muted">→ {booking.destination}</span>{booking.pickup_note&&<small>Pick-up note: {booking.pickup_note}</small>}</TableCell><TableCell>{vehicles.find(vehicle=>vehicle.id===booking.vehicle)?.name||booking.vehicle}<strong className="cell-line">{money(booking.fare_pence)}</strong></TableCell><TableCell><Select value={booking.status} onValueChange={value=>status(booking.id,value)} disabled={busy}><SelectTrigger aria-label={`Status for NAC-${booking.id.slice(0,8)}`}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="test_confirmed">Confirmed</SelectItem><SelectItem value="test_completed">Completed</SelectItem><SelectItem value="test_cancelled">Cancelled</SelectItem></SelectContent></Select></TableCell></TableRow>)}</TableBody></Table>}</div>
   <footer className="admin-footer">Admin access: admin@needacabplus.app</footer>
  </div>
 </main>;
}
