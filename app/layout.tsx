import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title:'Need A Cab Plus | Book your trip',description:'Plan your journey with Need A Cab Plus.',icons:{icon:'/favicon.svg',shortcut:'/favicon.svg'}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body>{children}</body></html>}
