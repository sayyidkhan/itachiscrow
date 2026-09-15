import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseEnv} from 'node:util';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const defaults=JSON.parse(await readFile(new URL('../config.example.json',import.meta.url),'utf8'));

export function validateFileConfig(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('config.json must contain an object.');
 for(const [name,setting] of Object.entries(value)){
  if(name==='OPENAI_API_KEY')throw Error('Move OPENAI_API_KEY from config.json to .env or a runtime secret binding.');
  if(!Object.hasOwn(defaults,name))throw Error('config.json contains an unsupported setting. OPENAI_API_KEY, Maps keys and PUBLIC_ORIGIN belong in .env.');
  if(name==='PORT'){
   if(!Number.isInteger(Number(setting))||Number(setting)<1||Number(setting)>65535)throw Error('config.json PORT must be between 1 and 65535.');
  }else if(typeof setting!=='string')throw Error('config.json settings must be strings, except PORT.');
 }
 return {...defaults,...value};
}

export async function readFileConfig(path,{optional=false}={}){
 let text;
 try{text=await readFile(path,'utf8');}catch(error){if(optional&&error.code==='ENOENT')return {...defaults};throw Error('Unable to read the private configuration file.');}
 let value;try{value=JSON.parse(text);}catch{throw Error('config.json is not valid JSON.');}
 return validateFileConfig(value);
}

export async function loadRuntimeConfig({root=ROOT,env=process.env}={}){
 const file=await readFileConfig(resolve(root,'config.json'),{optional:true});
 let dotenv={};
 try{dotenv=parseEnv(await readFile(resolve(root,'.env'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw Error('Unable to read .env.');}
 return {...file,...dotenv,...Object.fromEntries(Object.entries(env).filter(([,value])=>value!==undefined))};
}
