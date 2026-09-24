import {requireChatGPTUser,chatGPTSignOutPath} from '@/app/chatgpt-auth';
import {ADMIN_EMAIL} from '@/lib/security';
import AdminApp from './admin-app';
export const dynamic='force-dynamic';
export default async function AdminPage(){const user=await requireChatGPTUser('/admin');if(user.email.trim().toLowerCase()!==ADMIN_EMAIL)return <main className="access-panel"><span className="brandmark">N<span>+</span></span><h1>Admin access</h1><p>This area is restricted to {ADMIN_EMAIL}.</p><p className="muted">You are signed in as {user.email}.</p><a className="text-link" href={chatGPTSignOutPath('/admin')}>Sign out and use your admin account</a><a className="text-link" href="/">Back to booking</a></main>;return <AdminApp/>}
