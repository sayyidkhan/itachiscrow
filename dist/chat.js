import { validateLiveAction } from './live.js';

// Typed and spoken commands use the same validated application action handler.
export class CrowChat {
  constructor(options){this.options=options;this.conversationId=null;this.run=null;}
  stop(){if(this.run)this.completedConversation=null;this.run?.abort();this.run=null;this.conversationId=null;this.options.onBusy?.(false);}
  async send(message){
    this.stop();const controller=new AbortController();this.run=controller;
    // Preserve a completed conversation, while abandoning interrupted tool loops.
    this.conversationId=this.completedConversation||null;
    this.options.onMessage?.('user',message);this.options.onBusy?.(true);
    const current=()=>this.run===controller&&!controller.signal.aborted;
    let body={message},steps=0;
    const completedCalls=new Map();
    try{
      while(current()){
        if(++steps>10)throw Error('That request needed too many steps. Try a shorter journey.');
        const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},signal:controller.signal,body:JSON.stringify({...body,conversationId:this.conversationId||undefined,context:this.options.getContext()})});
        const data=await response.json().catch(()=>null);
        if(!response.ok||!data){if(response.status===410)this.completedConversation=null;throw Error(data?.error?.message||'The guide could not reply. Please try again.');}
        if(!current())return;
        this.conversationId=data.conversationId;
        if(data.text)this.options.onMessage?.('assistant',data.text);
        if(!data.calls?.length){this.completedConversation=this.conversationId;return;}
        const results=[];
        for(const call of data.calls){
          if(!current())return;
          let output=completedCalls.get(call.call_id);
          if(output===undefined){
            let result;
            try{result=await this.options.onAction(call.name,validateLiveAction(call.name,call.arguments),{signal:controller.signal,callId:call.call_id});}
            catch(error){result={status:error.name==='AbortError'?'cancelled':'error',error:error.message};}
            output=JSON.stringify(result??{status:'completed'});
            if(output.length>14000)output=JSON.stringify({status:result?.status||'completed',summary:'The result is displayed in the app.'});
            completedCalls.set(call.call_id,output);
          }
          if(!current())return;
          results.push({call_id:call.call_id,output});
        }
        body={results};
      }
    }catch(error){if(current())this.options.onMessage?.('assistant',error.message);}
    finally{if(this.run===controller){this.run=null;this.options.onBusy?.(false);}}
  }
}
