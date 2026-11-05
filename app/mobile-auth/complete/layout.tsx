import type {Metadata} from 'next';
export const metadata:Metadata={robots:{index:false,follow:false},referrer:'no-referrer'};
export default function NativeReturnLayout({children}:{children:React.ReactNode}){return children}
