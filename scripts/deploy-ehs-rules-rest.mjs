// Deploy EHS Firestore rules using the documented Firebase Rules REST API.
// This path still requires the service account to have Firebase Rules permissions.
// It does not modify IAM settings, bypass authorization, or expose credentials.
import {GoogleAuth} from 'google-auth-library';
import {readFileSync} from 'node:fs';

const project=process.env.FIREBASE_PROJECT_ID;
if(project!=='ehs-environment-management')throw Error('Refusing to deploy rules to unexpected Firebase project');
if(!process.env.GOOGLE_APPLICATION_CREDENTIALS)throw Error('Missing service account credentials');
const auth=new GoogleAuth({scopes:['https://www.googleapis.com/auth/firebase']});
const client=await auth.getClient();
const token=await client.getAccessToken();
if(!token.token)throw Error('Service account could not obtain an OAuth token');
const api='https://firebaserules.googleapis.com/v1';
const releaseName='projects/'+project+'/releases/cloud.firestore';
const request=async(method,path,body)=>{
 const result=await fetch(api+path,{
   method,
   headers:{Authorization:'Bearer '+token.token,Accept:'application/json',
    ...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})
 });
 const raw=await result.text();
 let data;try{data=JSON.parse(raw)}catch{data={message:raw.slice(0,500)}}
 if(!result.ok)throw Error('Firebase Rules API '+method+' '+path+' HTTP '+result.status+': '+JSON.stringify(data.error||data).slice(0,800));
 return data;
};
const oldRelease=await request('GET','/'+releaseName);
if(!oldRelease.rulesetName)throw Error('Live Firestore release has no ruleset; refusing deployment');
const file=readFileSync('firestore.rules','utf8');
if(!file.includes("service cloud.firestore")||!file.includes("match /operations/{id}"))
 throw Error('Refusing unexpected or incomplete Firestore rules source');
const created=await request('POST','/projects/'+project+'/rulesets',{
 source:{files:[{name:'firestore.rules',content:file}]}
});
if(!created.name)throw Error('Ruleset creation did not return its name');
const updated=await request('PATCH','/'+releaseName,{
 release:{name:releaseName,rulesetName:created.name},
 updateMask:'rulesetName'
});
const verified=await request('GET','/'+releaseName);
if(verified.rulesetName!==created.name)throw Error('Firestore release verification mismatch');
console.log('PASS: Firestore Rules release updated and verified:',verified.rulesetName);
