import { validateLiveAction } from './live.js?v=3';

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
    let body={message},steps=0,restarted=false;
    const completedCalls=new Map();
    try{
      while(current()){
        if(++steps>10)throw Error('That request needed too many steps. Try a shorter journey.');
        this.options.onProgress?.(body.message?'Thinking about your request…':'Checking the journey result…');
        const requestController=new AbortController();
        const abort=()=>requestController.abort();
        controller.signal.addEventListener('abort',abort,{once:true});
        const timeout=setTimeout(abort,this.options.timeoutMs??70000);
        let response,data;
        try{
          response=await (this.options.fetch||fetch)('/api/chat',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},signal:requestController.signal,body:JSON.stringify({...body,conversationId:this.conversationId||undefined,context:this.options.getContext()})});
          data=await response.json().catch(()=>null);
        }catch(error){
          if(controller.signal.aborted)throw error;
          throw Error(requestController.signal.aborted?'The guide took too long to reply. Please send your request again.':'The guide could not be reached. Check your connection and try again.');
        }finally{clearTimeout(timeout);controller.signal.removeEventListener('abort',abort);}
        if(!current())return;
        if(response.status===410&&body.message&&!restarted){this.completedConversation=null;this.conversationId=null;restarted=true;continue;}
        if(!response.ok||!data){if(response.status===410)this.completedConversation=null;throw Error(data?.error?.message||'The guide could not reply. Please try again.');}
        if(!current())return;
        this.conversationId=data.conversationId;
        if(data.text)this.options.onMessage?.('assistant',data.text);
        if(!data.calls?.length){
          if(!data.text?.trim())throw Error('The guide returned an empty reply. Please try again.');
          this.completedConversation=this.conversationId;this.options.onProgress?.('');return;
        }
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
    }catch(error){if(current()){this.completedConversation=null;this.options.onMessage?.('assistant',error.message);this.options.onError?.(error);}}
    finally{if(this.run===controller){this.run=null;this.options.onBusy?.(false);}}
  }
}
