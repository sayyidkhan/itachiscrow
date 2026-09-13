import test from 'node:test';
import assert from 'node:assert/strict';
import { CrowChat } from '../dist/chat.js';

const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const reply=text=>({conversationId:'current-chat',text,calls:[]});
const pending=signal=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));
function fixture(options={}){
  const messages=[],progress=[],errors=[],busy=[];
  const chat=new CrowChat({getContext:()=>({}),onAction:()=>assert.fail('Unexpected action'),onMessage:(role,text)=>messages.push({role,text}),onProgress:text=>progress.push(text),onError:error=>errors.push(error.message),onBusy:value=>busy.push(value),...options});
  return {chat,messages,progress,errors,busy};
}

test('chat reports progress immediately and times out instead of leaving Send disabled',async()=>{
  const state=fixture({timeoutMs:10,fetch:async(url,{signal})=>pending(signal)});
  const sending=state.chat.send('eifel tower');
  assert.match(state.progress.at(-1),/Thinking/);
  assert.equal(state.busy.at(-1),true);
  await sending;
  assert.match(state.errors[0],/too long/);
  assert.equal(state.busy.at(-1),false);
});

test('expired completed chats restart once for a new message without duplicate user bubbles',async()=>{
  const requests=[];
  const state=fixture({fetch:async(url,init)=>{
    requests.push(JSON.parse(init.body));
    return requests.length===1?response({error:{message:'Expired'}},410):response(reply('Hello again.'));
  }});
  state.chat.completedConversation='expired';
  await state.chat.send('hello');
  assert.equal(requests[0].conversationId,'expired');
  assert.equal(requests[1].conversationId,undefined);
  assert.equal(state.messages.filter(x=>x.role==='user').length,1);
  assert.equal(state.chat.completedConversation,'current-chat');
});

test('expired action continuation does not replay a completed flight',async()=>{
  let requests=0,actions=0;
  const state=fixture({fetch:async()=>++requests===1?response({conversationId:'expired',calls:[{name:'fly_to',call_id:'flight',arguments:'{"destination":"Paris"}'}]}):response({error:{message:'This chat expired. Send again.'}},410),onAction:async()=>{actions++;return {status:'arrived'};}});
  await state.chat.send('Paris');
  assert.equal(requests,2);assert.equal(actions,1);
  assert.match(state.errors[0],/expired/);
});

test('cancellation discards late replies and actions',async()=>{
  let release;
  const state=fixture({fetch:()=>new Promise(resolve=>{release=resolve;})});
  const sending=state.chat.send('Paris');state.chat.stop();
  release(response({conversationId:'old',text:'Late reply',calls:[{name:'fly_to',call_id:'late',arguments:'{"destination":"Paris"}'}]}));
  await sending;
  assert.equal(state.messages.length,1);assert.equal(state.errors.length,0);
  assert.equal(state.busy.at(-1),false);
});

test('empty provider replies surface an error and release the composer',async()=>{
  const state=fixture({fetch:async()=>response(reply(''))});
  await state.chat.send('hello');
  assert.match(state.errors[0],/empty reply/);assert.equal(state.busy.at(-1),false);
});

test('completed conversation is retained for a follow-up question',async()=>{
  const requests=[];
  const state=fixture({fetch:async(url,init)=>{requests.push(JSON.parse(init.body));return response(reply('Ready.'));}});
  await state.chat.send('Paris');await state.chat.send('Where is it?');
  assert.equal(requests[1].conversationId,'current-chat');
});
