export type AiChatMessage={role:'system'|'user'|'assistant'|'tool';content:string|null;tool_call_id?:string;tool_calls?:unknown};
export type AiCompletion={choices?:Array<{message?:{content?:string|null;tool_calls?:Array<{id:string;type:string;function:{name:string;arguments:string}}>}}>;error?:{message?:string}};

export async function aiComplete(apiKey:string,model:string,messages:AiChatMessage[],tools?:unknown):Promise<AiCompletion>{
 const response=await fetch('https://api.openai.com/v1/chat/completions',{
  method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
  body:JSON.stringify({model,messages,...(tools?{tools,tool_choice:'auto',parallel_tool_calls:false}:{}),max_completion_tokens:700,store:false}),
  signal:AbortSignal.timeout(25000),cache:'no-store',
 });
 if(!response.ok){
  if(response.status===401||response.status===403)throw new Error('The OpenAI API key was rejected. Check the key in assistant settings.');
  if(response.status===429)throw new Error('OpenAI rate limit reached. Please try again shortly.');
  throw new Error(`OpenAI is unavailable (${response.status}).`);
 }
 return response.json() as Promise<AiCompletion>;
}
