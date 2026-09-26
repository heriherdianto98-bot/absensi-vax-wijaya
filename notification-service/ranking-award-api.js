import 'dotenv/config';
import http from 'node:http';
import { loadRankingAwardVapid } from './ranking-award-vapid.js';

const vapid=loadRankingAwardVapid();

const allowed=new Set([
  'https://erp.vaxwijaya.com',
  'https://erp-test.vaxwijaya.com',
  'http://127.0.0.1:5500',
  'http://localhost:5500'
]);
const reply=(res,status,data)=>{
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(data));
};
const server=http.createServer((req,res)=>{
  const origin=String(req.headers.origin||'');
  if(origin&&allowed.has(origin)) res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Vary','Origin');
  if(req.method==='OPTIONS'){
    res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
    return reply(res,204,{});
  }
  if(req.method==='GET'&&req.url==='/health') return reply(res,200,{ok:true,service:'ranking-award-api'});
  if(req.method==='GET'&&req.url==='/api/ranking-award/push-config'){
    if(origin&&!allowed.has(origin)) return reply(res,403,{ok:false,error:'Origin ditolak'});
    return reply(res,200,{ok:true,publicKey:vapid.publicKey});
  }
  return reply(res,404,{ok:false,error:'Not found'});
});
const port=Number(process.env.RANKING_AWARD_API_PORT||8796);
server.listen(port,'127.0.0.1',()=>console.log('Ranking Award API listening on 127.0.0.1:'+port));
