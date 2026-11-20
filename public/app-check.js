import {initializeAppCheck,ReCaptchaV3Provider} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-app-check.js';

// Public site key; register it for the EHS web app in Firebase Console.
const SITE_KEY='6Lc4GikuAAAAAE3m0kRfXn9ZwALRk-fwcMKzL31h';
let installed=false;
export function installAppCheck(app){
 if(installed)return;
 initializeAppCheck(app,{
  provider:new ReCaptchaV3Provider(SITE_KEY),
  isTokenAutoRefreshEnabled:true
 });
 installed=true;
}
