export class OAuthFlowError extends Error{constructor(public code:string){super(code)}}
export const oauthMessages:Record<string,string>={
 provider:'Provider sign-in could not be completed. Please try again.',
 provider_cancelled:'Google or Apple sign-in was cancelled. Please try again.',
 provider_expired:'Your sign-in session expired or its browser cookie is missing. Start again in the same browser.',
 provider_account_exists:'This email already has an account. Sign in with your email and password.',
 provider_configuration:'Provider sign-in is not configured correctly. Please contact support or sign in with email.',
 provider_code:'The provider sign-in code expired or was already used. Start again.',
 provider_identity:'The provider identity could not be verified. Please start again.',
 provider_sms:'SMS verification is temporarily unavailable. Please try again later.',
 provider_limited:'Too many sign-in attempts. Please wait and try again.',
};
export function oauthErrorCode(error:unknown){
 if(error instanceof OAuthFlowError&&oauthMessages[error.code])return error.code;
 const message=error instanceof Error?error.message:'';
 if(message.includes('already has an account'))return 'provider_account_exists';
 if(message.includes('Sign-in expired'))return 'provider_expired';
 if(message.includes('Too many attempts'))return 'provider_limited';
 if(message.includes('SMS verification')||message.includes('SMS gateway'))return 'provider_sms';
 if(message.includes('not enabled')||message.includes('not configured'))return 'provider_configuration';
 return 'provider';
}
