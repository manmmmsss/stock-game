import { useState, useEffect, useCallback } from "react";
import { db } from "./firebase";
import { ref, onValue, set as fbSet, get } from "firebase/database";

const injectGlobal = () => {
  if (document.getElementById('sg-global')) return;
  const style = document.createElement('style');
  style.id = 'sg-global';
  style.textContent = `
    *, *::before, *::after { box-sizing: border-box; }
    html { overflow-x: hidden; }
    body {
      margin: 0; padding: 0; overflow-x: hidden;
      background: #F2F4F6;
      font-family: 'Pretendard', 'Apple SD Gothic Neo', sans-serif;
      -webkit-text-size-adjust: 100%;
    }
    input, button, select, textarea { font-family: inherit; }
    * { -webkit-tap-highlight-color: transparent; }
  `;
  document.head.appendChild(style);
};
injectGlobal();

const WRAP = {
  background: "#FFFFFF",
  minHeight: "100dvh",
  width: "100%",
  maxWidth: "430px",
  margin: "0 auto",
  position: "relative",
  overflowX: "hidden",
};

const GAME_REF = ref(db, "game");

function removeUndefined(obj) {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(removeUndefined);
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) result[k] = removeUndefined(v);
  }
  return result;
}

const setShared = async (fn) => {
  try {
    const snapshot = await get(GAME_REF);
    const current = snapshot.val() || { ...INIT_SS };
    const next = fn(current);
    const merged = { ...current, ...next };
    await fbSet(GAME_REF, removeUndefined(merged));
  } catch(e) {
    console.error("Firebase setShared error:", e);
  }
};

const useShared = () => {
  const [s, set] = useState({ ...INIT_SS });
  useEffect(() => {
    const unsub = onValue(GAME_REF, snapshot => {
      const val = snapshot.val();
      if (val) {
        if (val.stocks && !Array.isArray(val.stocks)) val.stocks = Object.values(val.stocks);
        if (val.shopItems && !Array.isArray(val.shopItems)) val.shopItems = Object.values(val.shopItems);
        if (val.rounds && !Array.isArray(val.rounds)) val.rounds = Object.values(val.rounds);
        if (val.eventPresets && !Array.isArray(val.eventPresets)) val.eventPresets = Object.values(val.eventPresets);
        if (val.customTemplates && !Array.isArray(val.customTemplates)) val.customTemplates = Object.values(val.customTemplates);
        set(val);
      } else {
        set({ ...INIT_SS });
      }
    });
    return () => unsub();
  }, []);
  return s;
};

/* ══════════════════════════════════════════
   디자인 시스템
══════════════════════════════════════════ */
const G = {
  bg:"#F2F4F6", white:"#FFFFFF", black:"#191F28",
  gray1:"#8B95A1", gray2:"#B0B8C1", gray3:"#D1D6DB", gray4:"#F2F4F6",
  blue:"#3182F6", blueLight:"#EBF3FE",
  red:"#F04452", redLight:"#FEF0F1",
  green:"#00B493", greenLight:"#E8FAF6",
  yellow:"#F5A623", yellowLight:"#FEF9EC",
  purple:"#7B61FF", purpleLight:"#F0EEFF",
  orange:"#FF6B35", orangeLight:"#FFF0EB",
  border:"#E5E8EB",
};

const STOCK_EMOJIS=["💎","🟡","🟢","🚗","⚡","🏦","🛢️","✈️","🎮","🏥","🏭","🌐","🔋","💊","🎯"];
const SHOP_EMOJIS =["🔍","📊","🕵️","💡","📰","📈","🗝️","💰","🧩","⚠️","🎁","🔮","📡","🏆","🌟"];
const EVENT_EMOJIS=["🦠","⚔️","🌊","🔥","💣","📉","🏦","⚡","🌪️","💥","🤖","💾","🏛️","🛑","📢","🧨","🌡️","💸","🔔","🚨"];

const uid=()=>Math.random().toString(36).slice(2,8);
const pad2=n=>String(n).padStart(2,"0");
const secToStr=s=>`${pad2(Math.floor(s/60))}:${pad2(s%60)}`;
const fmt=n=>"₩"+Math.round(n).toLocaleString("ko-KR");
const fmtN=n=>Math.round(n).toLocaleString("ko-KR");
const pctOf=(cur,prev)=>prev?((cur-prev)/prev*100):0;

/* ── 템플릿 정의 ── */
const makeRound=(r,min=5)=>({id:`r${r}`,label:`Round ${r}`,durationMin:min,blind:false,dividends:{}});

const BUILT_IN_TEMPLATES=[
  {
    id:"tpl1", name:"🏦 기본형 (3라운드)", builtIn:true,
    desc:"가장 기본적인 설정. 처음 진행할 때 추천",
    initCash:10000000, maxRound:3, feeRate:0.1, leverageEnabled:false, leverageMax:2,
    rounds:[makeRound(1,5),makeRound(2,5),makeRound(3,5)],
    stocks:[
      {id:"s1",name:"삼성전자",code:"005930",emoji:"💎",prices:[65000,72000,58000],totalSupply:0,listed:true},
      {id:"s2",name:"카카오",code:"035720",emoji:"🟡",prices:[45000,38000,51000],totalSupply:0,listed:true},
      {id:"s3",name:"네이버",code:"035420",emoji:"🟢",prices:[180000,195000,172000],totalSupply:0,listed:true},
      {id:"s4",name:"현대자동차",code:"005380",emoji:"🚗",prices:[95000,88000,103000],totalSupply:0,listed:true},
      {id:"s5",name:"LG에너지솔루션",code:"373220",emoji:"⚡",prices:[420000,445000,398000],totalSupply:0,listed:true},
    ],
  },
  {
    id:"tpl2", name:"🎭 롤러코스터 (4라운드)", builtIn:true,
    desc:"급등락이 심한 고위험 고수익 설정",
    initCash:10000000, maxRound:4, feeRate:0.2, leverageEnabled:true, leverageMax:2,
    rounds:[makeRound(1,4),makeRound(2,4),makeRound(3,4),makeRound(4,4)],
    stocks:[
      {id:"s1",name:"테슬라",code:"TSLA",emoji:"🚗",prices:[250000,380000,180000,420000],totalSupply:100,listed:true},
      {id:"s2",name:"바이오랩",code:"BIO",emoji:"💊",prices:[12000,28000,8000,35000],totalSupply:200,listed:true},
      {id:"s3",name:"코인베이스",code:"COIN",emoji:"🪙",prices:[85000,140000,45000,160000],totalSupply:0,listed:true},
      {id:"s4",name:"메타버스Inc",code:"META",emoji:"🎮",prices:[32000,15000,48000,22000],totalSupply:0,listed:true},
      {id:"s5",name:"그린에너지",code:"GRN",emoji:"🌱",prices:[45000,52000,38000,68000],totalSupply:0,listed:true},
    ],
  },
  {
    id:"tpl3", name:"🕵️ 블라인드 배틀 (3라운드)", builtIn:true,
    desc:"2라운드가 블라인드 — 아무것도 모른 채 투자",
    initCash:8000000, maxRound:3, feeRate:0.15, leverageEnabled:false, leverageMax:2,
    rounds:[makeRound(1,5),{...makeRound(2,5),blind:true},{...makeRound(3,5),blind:false}],
    stocks:[
      {id:"s1",name:"삼성전자",code:"005930",emoji:"💎",prices:[65000,72000,58000],totalSupply:0,listed:true},
      {id:"s2",name:"카카오",code:"035720",emoji:"🟡",prices:[45000,60000,38000],totalSupply:0,listed:true},
      {id:"s3",name:"네이버",code:"035420",emoji:"🟢",prices:[180000,150000,210000],totalSupply:0,listed:true},
      {id:"s4",name:"현대자동차",code:"005380",emoji:"🚗",prices:[95000,115000,75000],totalSupply:0,listed:true},
      {id:"s5",name:"LG에너지솔루션",code:"373220",emoji:"⚡",prices:[420000,390000,480000],totalSupply:0,listed:true},
    ],
  },
  {
    id:"tpl4", name:"💸 배당왕 (3라운드)", builtIn:true,
    desc:"배당금이 핵심 — 장기 보유 전략이 유리",
    initCash:10000000, maxRound:3, feeRate:0.1, leverageEnabled:false, leverageMax:2,
    rounds:[
      {...makeRound(1,6),dividends:{s1:500,s3:1000}},
      {...makeRound(2,6),dividends:{s2:800,s4:600}},
      {...makeRound(3,6),dividends:{s1:1000,s3:1500,s5:2000}},
    ],
    stocks:[
      {id:"s1",name:"삼성전자",code:"005930",emoji:"💎",prices:[65000,68000,72000],totalSupply:0,listed:true},
      {id:"s2",name:"카카오",code:"035720",emoji:"🟡",prices:[45000,47000,50000],totalSupply:0,listed:true},
      {id:"s3",name:"네이버",code:"035420",emoji:"🟢",prices:[180000,185000,190000],totalSupply:0,listed:true},
      {id:"s4",name:"현대자동차",code:"005380",emoji:"🚗",prices:[95000,98000,102000],totalSupply:0,listed:true},
      {id:"s5",name:"LG에너지솔루션",code:"373220",emoji:"⚡",prices:[420000,430000,450000],totalSupply:0,listed:true},
    ],
  },
  {
    id:"tpl5", name:"⚡ 스피드 런 (5라운드)", builtIn:true,
    desc:"라운드당 3분, 총 5라운드 — 빠른 판단력 싸움",
    initCash:5000000, maxRound:5, feeRate:0.3, leverageEnabled:true, leverageMax:2,
    rounds:[makeRound(1,3),makeRound(2,3),makeRound(3,3),makeRound(4,3),makeRound(5,3)],
    stocks:[
      {id:"s1",name:"A주",code:"A001",emoji:"🔴",prices:[10000,12000,9000,14000,11000],totalSupply:0,listed:true},
      {id:"s2",name:"B주",code:"B001",emoji:"🔵",prices:[10000,8000,13000,7000,15000],totalSupply:0,listed:true},
      {id:"s3",name:"C주",code:"C001",emoji:"🟢",prices:[10000,11000,10500,12000,13000],totalSupply:0,listed:true},
      {id:"s4",name:"D주",code:"D001",emoji:"🟡",prices:[10000,9500,8000,11000,10000],totalSupply:0,listed:true},
      {id:"s5",name:"E주",code:"E001",emoji:"⚫",prices:[10000,10500,11500,10000,16000],totalSupply:0,listed:true},
    ],
  },
];

const makeEventPresets=()=>[
  {id:uid(),name:"코로나 팬데믹",emoji:"🦠",desc:"전 세계 봉쇄령 발동",globalEffect:-15,stockEffects:{},note:"항공·소비재 급락"},
  {id:uid(),name:"전쟁 발발",emoji:"⚔️",desc:"지정학적 리스크 고조",globalEffect:-10,stockEffects:{},note:"방산 급등, 성장주 급락"},
  {id:uid(),name:"AI 혁명 발표",emoji:"🤖",desc:"초거대 AI 모델 공개",globalEffect:+10,stockEffects:{},note:"기술주 전반 급등"},
  {id:uid(),name:"중앙은행 양적완화",emoji:"🏦",desc:"긴급 유동성 3조 달러",globalEffect:+15,stockEffects:{},note:"전 종목 반등"},
  {id:uid(),name:"금리 인상 쇼크",emoji:"📉",desc:"연준 긴급 금리 0.75% 인상",globalEffect:-12,stockEffects:{},note:"성장주 급락"},
  {id:uid(),name:"대규모 스캔들",emoji:"💣",desc:"분식회계 발각",globalEffect:-20,stockEffects:{},note:"섹터 신뢰 붕괴"},
];

const ADMIN_PW="admin1234";
const DEFAULT_INIT_CASH=10_000_000;

/* ══════════════════════════════════════════
   공유 상태
══════════════════════════════════════════ */
const INIT_SS={
  phase:"ready", round:0, maxRound:3,
  roundStartedAt:null, roundEndsAt:null,
  initCash:DEFAULT_INIT_CASH,
  feeRate:0.1,           // 수수료율 (%)
  leverageEnabled:false, // 레버리지 활성화
  leverageMax:2,         // 최대 레버리지 배수
  stocks:BUILT_IN_TEMPLATES[0].stocks.map(s=>({...s})),
  rounds:BUILT_IN_TEMPLATES[0].rounds.map(r=>({...r})),
  shopItems:[
    {id:"sh1",name:"내부자 제보 A",desc:"특정 종목 다음 라운드 방향",price:800000,emoji:"🕵️",hint:"힌트를 설정해주세요"},
    {id:"sh2",name:"시장 분석 리포트",desc:"현재 라운드 전체 시장 흐름",price:500000,emoji:"📊",hint:"힌트를 설정해주세요"},
    {id:"sh3",name:"VIP 정보 패키지",desc:"3라운드 전 종목 방향",price:2000000,emoji:"💡",hint:"힌트를 설정해주세요"},
  ],
  eventPresets:makeEventPresets(),
  customTemplates:[],    // 사용자 저장 템플릿
  teams:{},
  teamCredentials:{},
  bonusPool:{},
  activeEvent:null,
  eventHistory:[],
  notice:"",
  noticeAt:null,
};



/* ══════════════════════════════════════════
   실시간 주가 계산 (선형보간 + 노이즈)
══════════════════════════════════════════ */
function getCurrentPrice(stock,round,roundStartedAt,roundEndsAt,activeEvent){
  if(!stock||round<1) return stock?.prices?.[0]??0;
  const ri=Math.min(round-1,stock.prices.length-1);
  const target=stock.prices[ri];
  const prev=ri>0?stock.prices[ri-1]:stock.prices[0];
  if(!roundStartedAt||!roundEndsAt) return target;
  const now=Date.now();
  const total=roundEndsAt-roundStartedAt;
  const t=Math.min(Math.max((now-roundStartedAt)/total,0),1);
  let base=prev+(target-prev)*t;
  const noiseSeed=Math.floor(now/2000);
  const noise=(Math.sin(noiseSeed*9301+(stock.id?.charCodeAt(0)||1)*49297)*0.5+0.5)*2-1;
  const noiseRange=Math.abs(target-prev)*0.04+base*0.008;
  let price=Math.round(base+noise*noiseRange);
  if(activeEvent){
    const eff=activeEvent.stockEffects?.[stock.id]??activeEvent.globalEffect??0;
    price=Math.round(price*(1+eff/100));
  }
  return Math.max(price,1);
}

/* ══════════════════════════════════════════
   공통 UI
══════════════════════════════════════════ */
let _tt=null;
const showToast=(set,msg)=>{set({msg,show:true});if(_tt)clearTimeout(_tt);_tt=setTimeout(()=>set(t=>({...t,show:false})),2500);};

function Toast({msg,show}){
  return <div style={{position:"fixed",bottom:80,left:"50%",
    transform:`translateX(-50%) translateY(${show?0:10}px)`,
    opacity:show?1:0,transition:"all .25s cubic-bezier(.34,1.56,.64,1)",
    background:G.black,color:"#fff",borderRadius:12,padding:"11px 20px",
    fontSize:13,fontWeight:500,whiteSpace:"nowrap",zIndex:9999,
    pointerEvents:"none",boxShadow:"0 8px 24px rgba(0,0,0,.2)"}}>{msg}</div>;
}

function ConfirmModal({show,onConfirm,onCancel,side,stock,qty,price,fee,leverage}){
  if(!show) return null;
  const isBuy=side==="buy";
  const total=price*qty;
  const feeAmt=Math.round(total*fee/100);
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:1000,
      display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={onCancel}>
      <div onClick={e=>e.stopPropagation()} style={{background:G.white,borderRadius:"20px 20px 0 0",
        padding:"24px 20px 40px",width:"100%",maxWidth:430,boxShadow:"0 -8px 32px rgba(0,0,0,.15)"}}>
        <div style={{width:36,height:4,background:G.border,borderRadius:2,margin:"0 auto 20px"}}/>
        <div style={{fontSize:18,fontWeight:800,color:G.black,marginBottom:4}}>
          {isBuy?"매수":"매도"} 주문 확인
          {leverage>1&&<span style={{fontSize:13,color:G.orange,marginLeft:8}}>x{leverage} 레버리지</span>}
        </div>
        <div style={{fontSize:13,color:G.gray1,marginBottom:16}}>아래 내용으로 주문할까요?</div>
        <div style={{background:G.bg,borderRadius:12,padding:"14px 16px",marginBottom:16}}>
          {[
            ["종목",`${stock?.emoji} ${stock?.name}`],
            ["구분",isBuy?"매수":"매도"],
            ["수량",`${qty}주`],
            ["단가",`${fmtN(price)}원`],
            ["거래대금",fmt(total)],
            ["수수료",`${fmt(feeAmt)} (${fee}%)`],
            ["실제 차감",fmt(total+(isBuy?feeAmt:-feeAmt))],
          ].map(([k,v])=>(
            <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${G.border}`}}>
              <span style={{fontSize:12,color:G.gray1}}>{k}</span>
              <span style={{fontSize:12,fontWeight:700,color:k==="실제 차감"?(isBuy?G.red:G.blue):G.black}}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={onCancel} style={{flex:1,padding:"13px",borderRadius:12,border:"none",background:G.bg,color:G.gray1,fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>취소</button>
          <button onClick={onConfirm} style={{flex:2,padding:"13px",borderRadius:12,border:"none",background:isBuy?G.red:G.blue,color:G.white,fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
            {isBuy?"매수하기":"매도하기"}
          </button>
        </div>
      </div>
    </div>
  );
}

function NoticeBanner({notice}){
  if(!notice) return null;
  return(
    <div style={{background:G.blue,color:G.white,padding:"8px 14px",display:"flex",alignItems:"center",gap:8}}>
      <span style={{fontSize:16,flexShrink:0}}>📢</span>
      <div style={{flex:1}}>
        <div style={{fontSize:11,fontWeight:700,opacity:.8,marginBottom:1}}>운영자 공지</div>
        <div style={{fontSize:13,fontWeight:500}}>{notice}</div>
      </div>
    </div>
  );
}

function EventBanner({event}){
  if(!event) return null;
  return(
    <div style={{background:`linear-gradient(135deg,${G.orange},${G.red})`,color:G.white,padding:"9px 14px",display:"flex",alignItems:"center",gap:10}}>
      <span style={{fontSize:20,flexShrink:0}}>{event.emoji}</span>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:12,fontWeight:800,marginBottom:1}}>🚨 긴급: {event.name}</div>
        <div style={{fontSize:11,opacity:.9,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{event.desc}</div>
      </div>
      <div style={{fontSize:13,fontWeight:800,flexShrink:0,color:event.globalEffect>=0?"#FFD700":G.white}}>
        {event.globalEffect>=0?"+":""}{event.globalEffect}%
      </div>
    </div>
  );
}

const Btn=({children,color=G.blue,textColor=G.white,style:s,...p})=>(
  <button {...p} style={{background:color,color:textColor,border:"none",borderRadius:10,
    padding:"11px 14px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"opacity .15s",...s}}
    onMouseDown={e=>e.currentTarget.style.opacity=".75"}
    onMouseUp={e=>e.currentTarget.style.opacity="1"}>{children}</button>
);
const NumInput=({value,onChange,style:s,...p})=>(
  <input type="number" value={value} onChange={onChange} {...p}
    style={{width:"100%",border:`1.5px solid ${G.border}`,borderRadius:8,padding:"8px 6px",
      fontSize:13,fontFamily:"monospace",outline:"none",color:G.black,boxSizing:"border-box",textAlign:"center",...s}}/>
);
const TextInput=({value,onChange,placeholder,style:s,...p})=>(
  <input type="text" value={value} onChange={onChange} placeholder={placeholder} {...p}
    style={{width:"100%",border:`1.5px solid ${G.border}`,borderRadius:8,padding:"9px 10px",
      fontSize:13,fontFamily:"inherit",outline:"none",color:G.black,boxSizing:"border-box",...s}}/>
);

/* ── 캔들스틱 차트 ── */
function LiveBigChart({stock,round,maxRound,roundStartedAt,roundEndsAt,activeEvent,blind}){
  const [,tick]=useState(0);
  useEffect(()=>{const id=setInterval(()=>tick(t=>t+1),500);return()=>clearInterval(id);},[]);
  if(!stock) return null;
  const ri=Math.min(round-1,stock.prices.length-1);
  const curPrice=getCurrentPrice(stock,round,roundStartedAt,roundEndsAt,activeEvent);
  const candles=[];
  for(let i=0;i<ri;i++){
    const open=i===0?stock.prices[0]:stock.prices[i-1];
    const close=stock.prices[i];
    candles.push({open,close,high:Math.max(open,close)*1.02,low:Math.min(open,close)*0.98,label:`R${i+1}`,live:false});
  }
  const curOpen=ri>0?stock.prices[ri-1]:stock.prices[0];
  candles.push({open:curOpen,close:curPrice,high:Math.max(curOpen,curPrice)*1.015,low:Math.min(curOpen,curPrice)*0.985,label:`R${round}`,live:true});
  const allP=candles.flatMap(c=>[c.high,c.low]);
  const minP=Math.min(...allP)*0.97,maxP=Math.max(...allP)*1.03,range=maxP-minP||1;
  const W=280,H=120,cw=Math.min(36,(W/candles.length)*0.55),gap=W/candles.length;
  const toY=p=>H-((p-minP)/range)*H;
  const grids=Array.from({length:4},(_,i)=>{const p=minP+(range/3)*i;return{y:toY(p),label:fmtN(Math.round(p))};});
  if(blind) return(
    <div style={{height:160,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:G.bg,borderRadius:12}}>
      <div style={{fontSize:32,marginBottom:8}}>🙈</div>
      <div style={{fontSize:14,fontWeight:700,color:G.gray1}}>블라인드 라운드</div>
      <div style={{fontSize:12,color:G.gray2,marginTop:4}}>이번 라운드는 가격이 숨겨집니다</div>
    </div>
  );
  return(
    <svg width="100%" viewBox={`-48 -20 ${W+60} ${H+40}`} style={{overflow:"visible",display:"block"}}>
      {grids.map((g,i)=>(
        <g key={i}>
          <line x1={0} y1={g.y} x2={W} y2={g.y} stroke="#E5E8EB" strokeWidth="0.8" strokeDasharray="4,3"/>
          <text x={-4} y={g.y+3} textAnchor="end" fontSize="8" fill="#B0B8C1" fontFamily="monospace">{g.label}</text>
        </g>
      ))}
      {candles.map((c,i)=>{
        const x=gap*i+gap/2,isUp=c.close>=c.open,color=isUp?G.red:G.blue;
        const bodyTop=toY(Math.max(c.open,c.close)),bodyBot=toY(Math.min(c.open,c.close));
        const bodyH=Math.max(bodyBot-bodyTop,2);
        return(
          <g key={i}>
            <line x1={x} y1={toY(c.high)} x2={x} y2={bodyTop} stroke={color} strokeWidth={c.live?1.5:1}/>
            <line x1={x} y1={bodyBot} x2={x} y2={toY(c.low)} stroke={color} strokeWidth={c.live?1.5:1}/>
            <rect x={x-cw/2} y={bodyTop} width={cw} height={bodyH}
              fill={isUp?color:"none"} stroke={color} strokeWidth={c.live?2:1.5} rx={2} opacity={c.live?1:0.85}/>
            {c.live&&(
              <>
                <line x1={0} y1={toY(c.close)} x2={W} y2={toY(c.close)} stroke={color} strokeWidth="1" strokeDasharray="3,2" opacity=".6"/>
                <rect x={W+2} y={toY(c.close)-8} width={48} height={16} fill={color} rx={3}/>
                <text x={W+26} y={toY(c.close)+4} textAnchor="middle" fontSize="9" fill="white" fontFamily="monospace" fontWeight="700">{fmtN(c.close)}</text>
              </>
            )}
            <text x={x} y={H+14} textAnchor="middle" fontSize="9.5" fill={c.live?color:G.gray1} fontFamily="inherit" fontWeight={c.live?"700":"400"}>{c.label}</text>
          </g>
        );
      })}
      {(()=>{
        const last=candles[candles.length-1];
        const x=gap*(candles.length-1)+gap/2,y=toY(last.close);
        const color=last.close>=last.open?G.red:G.blue;
        return <circle cx={x} cy={y} r="4" fill={color}><animate attributeName="opacity" values="1;0.2;1" dur="1.5s" repeatCount="indefinite"/></circle>;
      })()}
    </svg>
  );
}

function LiveMiniChart({stock,round,roundStartedAt,roundEndsAt,activeEvent,blind}){
  const [,tick]=useState(0);
  useEffect(()=>{const id=setInterval(()=>tick(t=>t+1),2000);return()=>clearInterval(id);},[]);
  if(blind) return <div style={{width:52,height:28,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>🙈</div>;
  if(!stock||stock.prices.length<1) return <div style={{width:52,height:28}}/>;
  const ri=Math.min(round-1,stock.prices.length-1);
  const cur=getCurrentPrice(stock,round,roundStartedAt,roundEndsAt,activeEvent);
  const pts2=[...stock.prices.slice(0,ri),cur];
  if(pts2.length<2) return <div style={{width:52,height:28}}/>;
  const mn=Math.min(...pts2),mx=Math.max(...pts2),r=mx-mn||1,W=52,H=28;
  const pts=pts2.map((p,i)=>`${(i/(pts2.length-1))*W},${H-((p-mn)/r)*H}`).join(" ");
  const color=cur>=pts2[0]?G.red:G.blue;
  return(
    <svg width={W} height={H} style={{display:"block",flexShrink:0}}>
      <defs><linearGradient id={`mg${stock.id}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity="0.3"/>
        <stop offset="100%" stopColor={color} stopOpacity="0"/>
      </linearGradient></defs>
      <polyline points={pts+` ${W},${H} 0,${H}`} fill={`url(#mg${stock.id})`} stroke="none"/>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={W} cy={H-((cur-mn)/r)*H} r="2.5" fill={color}>
        <animate attributeName="opacity" values="1;0.3;1" dur="1.5s" repeatCount="indefinite"/>
      </circle>
    </svg>
  );
}

function useRoundTimer(phase,roundEndsAt){
  const [rem,setRem]=useState(null);
  useEffect(()=>{
    if(phase!=="round"||!roundEndsAt){setRem(null);return;}
    const tick=()=>{
      const s=Math.max(0,Math.round((roundEndsAt-Date.now())/1000));
      setRem(s);
      if(s<=0) setShared(ss=>({...ss,phase:"break",roundEndsAt:null,roundStartedAt:null}));
    };
    tick();const id=setInterval(tick,1000);return()=>clearInterval(id);
  },[phase,roundEndsAt]);
  return rem;
}

/* ══════════════════════════════════════════
   관리자 앱
══════════════════════════════════════════ */
function AdminApp(){
  const shared=useShared();
  const [tab,setTab]=useState("control");
  const [settingsTab,setSettingsTab]=useState("template");
  const [toast,setToast]=useState({msg:"",show:false});
  const t2=msg=>showToast(setToast,msg);

  // 로컬 편집 상태
  const [stocks,setStocks]=useState(()=>BUILT_IN_TEMPLATES[0].stocks.map(s=>({...s})));
  const [shopItems,setShopItems]=useState(()=>INIT_SS.shopItems.map(s=>({...s})));
  const [rounds,setRounds]=useState(()=>BUILT_IN_TEMPLATES[0].rounds.map(r=>({...r})));
  const [maxRound,setMaxRound]=useState(3);
  const [initCash,setInitCash]=useState(DEFAULT_INIT_CASH);
  const [feeRate,setFeeRate]=useState(0.1);
  const [leverageEnabled,setLeverageEnabled]=useState(false);
  const [leverageMax,setLeverageMax]=useState(2);
  const [eventPresets,setEventPresets]=useState(()=>makeEventPresets());
  const [editingEvent,setEditingEvent]=useState(null);
  const [selTeam,setSelTeam]=useState(null);
  const [bonusIn,setBonusIn]=useState({});
  const [noticeInput,setNoticeInput]=useState("");
  const [newTeamName,setNewTeamName]=useState("");
  const [newTeamPw,setNewTeamPw]=useState("");
  const [saveTplName,setSaveTplName]=useState("");
  const [editingTpl,setEditingTpl]=useState(null);

  // 템플릿 적용
  const applyTemplate=tpl=>{
    const s=tpl.stocks.map(x=>({...x,prices:[...x.prices]}));
    const r=tpl.rounds.map(x=>({...x}));
    setStocks(s);setRounds(r);
    setMaxRound(tpl.maxRound);setInitCash(tpl.initCash);
    setFeeRate(tpl.feeRate??0.1);
    setLeverageEnabled(tpl.leverageEnabled??false);
    setLeverageMax(tpl.leverageMax??2);
    t2(`"${tpl.name}" 템플릿 적용됨`);
  };

  // 현재 설정 템플릿으로 저장
  const saveAsTemplate=()=>{
    const name=saveTplName.trim();
    if(!name){t2("템플릿 이름을 입력하세요");return;}
    const tpl={id:uid(),name,builtIn:false,desc:"사용자 저장 템플릿",
      initCash,maxRound,feeRate,leverageEnabled,leverageMax,
      stocks:stocks.map(x=>({...x,prices:[...x.prices]})),
      rounds:rounds.map(x=>({...x}))};
    setShared(s=>({...s,customTemplates:[...(s.customTemplates||[]),tpl]}));
    setSaveTplName("");t2(`"${name}" 저장됨`);
  };
  const delCustomTpl=id=>setShared(s=>({...s,customTemplates:(s.customTemplates||[]).filter(t=>t.id!==id)}));
  const updateCustomTpl=(id,key,val)=>setShared(s=>({...s,customTemplates:(s.customTemplates||[]).map(t=>t.id===id?{...t,[key]:val}:t)}));

  // 종목 CRUD
  const addStock=()=>setStocks(p=>[...p,{id:uid(),name:"새 종목",code:"000000",emoji:"🏦",prices:Array(maxRound).fill(100000),totalSupply:0,listed:true}]);
  const delStock=id=>setStocks(p=>p.filter(s=>s.id!==id));
  const updStock=(id,k,v)=>setStocks(p=>p.map(s=>s.id===id?{...s,[k]:v}:s));
  const updPrice=(id,ri,v)=>setStocks(p=>p.map(s=>s.id===id?{...s,prices:s.prices.map((x,i)=>i===ri?parseInt(v)||0:x)}:s));

  // 라운드 CRUD
  const changeMaxRound=n=>{
    const nr=Math.max(1,Math.min(10,n));setMaxRound(nr);
    setRounds(prev=>{const nx=[...prev];while(nx.length<nr)nx.push(makeRound(nx.length+1));return nx.slice(0,nr);});
    setStocks(p=>p.map(s=>{const pr=[...s.prices];while(pr.length<nr)pr.push(pr[pr.length-1]||100000);return{...s,prices:pr.slice(0,nr)};}));
  };
  const updRound=(id,k,v)=>setRounds(p=>p.map(r=>r.id===id?{...r,[k]:v}:r));
  const updDividend=(rid,sid,v)=>setRounds(p=>p.map(r=>r.id===rid?{...r,dividends:{...(r.dividends||{}),[sid]:parseInt(v)||0}}:r));
  const clearDividend=(rid,sid)=>setRounds(p=>p.map(r=>{if(r.id!==rid)return r;const d={...(r.dividends||{})};delete d[sid];return{...r,dividends:d};}));

  // 상점 CRUD
  const addShop=()=>setShopItems(p=>[...p,{id:uid(),name:"새 항목",desc:"설명",price:500000,emoji:"🎁",hint:"힌트 입력"}]);
  const delShop=id=>setShopItems(p=>p.filter(s=>s.id!==id));
  const updShop=(id,k,v)=>setShopItems(p=>p.map(s=>s.id===id?{...s,[k]:v}:s));

  // 이벤트 CRUD
  const addEvent=()=>{const e={id:uid(),name:"새 이벤트",emoji:"🚨",desc:"설명",globalEffect:0,stockEffects:{},note:""};setEventPresets(p=>[...p,e]);setEditingEvent(e);};
  const delEvent=id=>{setEventPresets(p=>p.filter(e=>e.id!==id));if(editingEvent?.id===id)setEditingEvent(null);};
  const updEvent=(id,k,v)=>{setEventPresets(p=>p.map(e=>e.id===id?{...e,[k]:v}:e));if(editingEvent?.id===id)setEditingEvent(e=>({...e,[k]:v}));};
  const updStockEffect=(evId,sid,v)=>{setEventPresets(p=>p.map(e=>e.id===evId?{...e,stockEffects:{...e.stockEffects,[sid]:parseInt(v)||0}}:e));if(editingEvent?.id===evId)setEditingEvent(e=>({...e,stockEffects:{...e.stockEffects,[sid]:parseInt(v)||0}}));};
  const clearStockEffect=(evId,sid)=>{setEventPresets(p=>p.map(e=>{if(e.id!==evId)return e;const se={...e.stockEffects};delete se[sid];return{...e,stockEffects:se};}));if(editingEvent?.id===evId)setEditingEvent(e=>{const se={...e.stockEffects};delete se[sid];return{...e,stockEffects:se};});};

  // 설정 저장
  const saveSettings=()=>{
    setShared(s=>({...s,stocks:stocks.map(x=>({...x,prices:[...x.prices]})),
      shopItems:shopItems.map(x=>({...x})),rounds:rounds.map(x=>({...x})),
      eventPresets:eventPresets.map(x=>({...x})),maxRound,initCash,feeRate,leverageEnabled,leverageMax}));
    t2("설정 저장됨 ✓");
  };

  // 팀 계정
  const addTeam=()=>{
    const name=newTeamName.trim(),pw=newTeamPw.trim();
    if(!name||!pw){t2("이름과 비밀번호 입력");return;}
    if(shared.teamCredentials?.[name]){t2("이미 있는 팀 이름");return;}
    const id=uid();
    setShared(s=>({...s,teamCredentials:{...(s.teamCredentials||{}),[name]:{id,pw}},
      teams:{...s.teams,[id]:{name,cash:s.initCash||DEFAULT_INIT_CASH,holdings:{},purchases:[],history:[],borrowed:0}}}));
    setNewTeamName("");setNewTeamPw("");t2(`팀 "${name}" 등록`);
  };
  const delTeam=name=>{
    setShared(s=>{const c={...(s.teamCredentials||{})};const id=c[name]?.id;delete c[name];const t={...s.teams};if(id)delete t[id];return{...s,teamCredentials:c,teams:t};});
  };

  // 라운드 제어
  const startRound=r=>{
    const rc=shared.rounds?.[r-1]||rounds[r-1];
    const dur=(rc?.durationMin||5)*60*1000,now=Date.now();
    setShared(s=>({...s,phase:"round",round:r,roundStartedAt:now,roundEndsAt:now+dur,
      stocks:stocks.map(x=>({...x,prices:[...x.prices]})),
      shopItems:shopItems.map(x=>({...x})),rounds:rounds.map(x=>({...x})),
      eventPresets:eventPresets.map(x=>({...x})),maxRound,initCash,feeRate,leverageEnabled,leverageMax}));
    t2(`Round ${r} 시작 (${rc?.durationMin||5}분)`);
  };
  const stopRound=()=>{
    // 배당금 지급
    const r=shared.round;
    const rc=shared.rounds?.[r-1];
    const divs=rc?.dividends||{};
    if(Object.keys(divs).length>0){
      setShared(s=>{
        const teams={...s.teams};
        for(const [tid,tm] of Object.entries(teams)){
          let bonus=0;
          for(const [sid,perShare] of Object.entries(divs)){
            const qty=tm.holdings?.[sid]?.qty||0;
            bonus+=qty*perShare;
          }
          if(bonus>0) teams[tid]={...tm,cash:tm.cash+bonus,
            history:[...(tm.history||[]),{time:new Date().toLocaleTimeString('ko-KR'),type:'dividend',stockName:'배당금',stockEmoji:'💰',qty:0,price:0,total:bonus}]};
        }
        return{...s,phase:"break",roundEndsAt:null,roundStartedAt:null,teams};
      });
      t2(`Round ${r} 종료 — 배당금 지급 완료`);
    } else {
      setShared(s=>({...s,phase:"break",roundEndsAt:null,roundStartedAt:null}));
      t2("라운드 종료");
    }
  };
  const endGame=()=>{setShared(s=>({...s,phase:"ended"}));t2("게임 종료");};

  // 종목 상장/폐지
  const delistStock=async sid=>{
    setShared(s=>{
      const st=s.stocks?.find(x=>x.id===sid);
      if(!st) return s;
      const r=Math.max(s.round,1);
      const price=getCurrentPrice(st,r,s.roundStartedAt,s.roundEndsAt,s.activeEvent);
      const teams={...s.teams};
      for(const [tid,tm] of Object.entries(teams)){
        const qty=tm.holdings?.[sid]?.qty||0;
        if(qty>0){
          const proceeds=qty*price;
          const h={...tm.holdings};delete h[sid];
          teams[tid]={...tm,cash:tm.cash+proceeds,holdings:h,
            history:[...(tm.history||[]),{time:new Date().toLocaleTimeString('ko-KR'),type:'sell',stockName:st.name+'(폐지)',stockEmoji:st.emoji,qty,price,total:proceeds}]};
        }
      }
      const newStocks=s.stocks.map(x=>x.id===sid?{...x,listed:false}:x);
      return{...s,teams,stocks:newStocks};
    });
    t2("종목 폐지 완료 — 보유자 강제 매도");
  };
  const relistStock=sid=>{setShared(s=>({...s,stocks:s.stocks.map(x=>x.id===sid?{...x,listed:true}:x)}));t2("종목 재상장");};

  // 이벤트
  const applyEvent=ev=>{setShared(s=>({...s,activeEvent:{...ev,appliedAt:Date.now()},eventHistory:[...(s.eventHistory||[]),ev]}));t2(`🚨 ${ev.name} 발동!`);};
  const clearEvent=()=>{setShared(s=>({...s,activeEvent:null}));t2("이벤트 해제");};

  // 보너스
  const giveBonus=tid=>{
    const val=parseInt(bonusIn[tid])||0;
    if(!val){t2("금액 입력");return;}
    setShared(s=>({...s,bonusPool:{...(s.bonusPool||{}),[tid]:(s.bonusPool?.[tid]||0)+val},
      teams:{...s.teams,[tid]:{...s.teams[tid],cash:s.teams[tid].cash+val}}}));
    setBonusIn(b=>({...b,[tid]:""}));t2(`${fmt(val)} 지급`);
  };

  // 초기화
  const resetGame=()=>{
    setShared(s=>{
      const savedCreds=s.teamCredentials||{};
      const savedCash=s.initCash||DEFAULT_INIT_CASH;
      const freshTeams={};
      for(const [name,{id}] of Object.entries(savedCreds)){
        freshTeams[id]={name,cash:savedCash,holdings:{},purchases:[],history:[],borrowed:0};
      }
      return{...s,phase:"ready",round:0,roundStartedAt:null,roundEndsAt:null,
        activeEvent:null,eventHistory:[],notice:"",noticeAt:null,bonusPool:{},
        teams:freshTeams};
    });
    t2("게임 초기화 ✓ (설정·팀 유지)");
  };

  const getRank=()=>Object.entries(shared.teams||{}).map(([id,tm])=>{
    const r=Math.max(shared.round,1);
    const sv=Object.entries(tm.holdings||{}).reduce((acc,[sid,h])=>{
      const st=shared.stocks?.find(x=>x.id===sid);
      return acc+(st?st.prices[Math.min(r-1,st.prices.length-1)]*h.qty:0);
    },0);
    return{id,name:tm.name,total:tm.cash+sv,bonus:shared.bonusPool?.[id]||0,borrowed:tm.borrowed||0};
  }).sort((a,b)=>b.total-a.total);

  const phaseLabel=shared.phase==="ready"?"대기중":shared.phase==="round"?`R${shared.round} 진행중`:shared.phase==="break"?`R${shared.round} 종료`:"게임종료";
  const phaseBg=shared.phase==="round"?G.greenLight:shared.phase==="break"?G.yellowLight:shared.phase==="ended"?G.redLight:G.gray4;
  const phaseColor=shared.phase==="round"?G.green:shared.phase==="break"?G.yellow:shared.phase==="ended"?G.red:G.gray1;
  const TABS=[["control","진행"],["settings","설정"],["teams","팀"],["accounts","계좌"],["rank","순위"]];

  const allTemplates=[...BUILT_IN_TEMPLATES,...(shared.customTemplates||[])];

  return(
    <div style={{...WRAP,background:G.bg}}>
      <div style={{background:G.white,padding:"env(safe-area-inset-top, 14px) 16px 0",borderBottom:`1px solid ${G.border}`,position:"sticky",top:"env(safe-area-inset-top, 0)",zIndex:50}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
          <div style={{background:G.black,color:G.white,borderRadius:6,padding:"2px 8px",fontSize:11,fontWeight:700}}>ADMIN</div>
          <span style={{fontSize:16,fontWeight:800,color:G.black}}>운영자 패널</span>
          <div style={{marginLeft:"auto",background:phaseBg,color:phaseColor,borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:600}}>{phaseLabel}</div>
        </div>
        {shared.activeEvent&&<div style={{marginBottom:6}}><EventBanner event={shared.activeEvent}/></div>}
        <div style={{display:"flex",overflowX:"auto"}}>
          {TABS.map(([key,label])=>(
            <div key={key} onClick={()=>setTab(key)} style={{flexShrink:0,textAlign:"center",padding:"8px 14px",fontSize:12,fontWeight:600,
              color:tab===key?G.blue:G.gray1,borderBottom:`2px solid ${tab===key?G.blue:"transparent"}`,cursor:"pointer",transition:"all .15s"}}>{label}</div>
          ))}
        </div>
      </div>

      <div style={{padding:"14px 14px env(safe-area-inset-bottom, 100px)",overflowY:"auto",WebkitOverflowScrolling:"touch"}}>

        {/* ══ 진행 탭 ══ */}
        {tab==="control"&&<>
          {/* 공지 */}
          <div style={{background:G.white,borderRadius:14,padding:14,marginBottom:10}}>
            <div style={{fontSize:13,fontWeight:700,color:G.black,marginBottom:8}}>📢 전체 공지</div>
            <div style={{display:"flex",gap:8,marginBottom:6}}>
              <TextInput value={noticeInput} onChange={e=>setNoticeInput(e.target.value)} placeholder="전체 팀에게 보낼 공지" style={{flex:1}}/>
              <Btn onClick={()=>{setShared(s=>({...s,notice:noticeInput,noticeAt:Date.now()}));t2("공지 전송");}} style={{flexShrink:0,padding:"9px 12px",fontSize:12}}>전송</Btn>
            </div>
            {shared.notice&&<div style={{fontSize:11,color:G.blue,background:G.blueLight,borderRadius:8,padding:"6px 10px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span>{shared.notice}</span>
              <span onClick={()=>{setShared(s=>({...s,notice:"",noticeAt:null}));setNoticeInput("");}} style={{cursor:"pointer",color:G.red,marginLeft:8}}>×</span>
            </div>}
          </div>

          {/* 현재 상태 */}
          <div style={{background:G.white,borderRadius:14,padding:14,marginBottom:10}}>
            <div style={{fontSize:13,fontWeight:700,color:G.black,marginBottom:10}}>현재 상태</div>
            {[["단계",phaseLabel],["라운드",`${shared.round||0}/${shared.maxRound||3}`],
              ["참가팀",`${Object.keys(shared.teams||{}).length}팀`],
              ["수수료",`${shared.feeRate||0.1}%`],
              ["레버리지",shared.leverageEnabled?`최대 x${shared.leverageMax}`:"비활성"]].map(([k,v])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${G.border}`}}>
                <span style={{fontSize:13,color:G.gray1}}>{k}</span>
                <span style={{fontSize:13,fontWeight:600,color:G.black}}>{v}</span>
              </div>
            ))}
          </div>

          {/* 라운드 제어 */}
          <div style={{background:G.white,borderRadius:14,padding:14,marginBottom:10}}>
            <div style={{fontSize:13,fontWeight:700,color:G.black,marginBottom:10}}>라운드 제어 (총 {shared.maxRound||3}라운드)</div>
            {Array.from({length:shared.maxRound||3},(_,i)=>i+1).map(r=>{
              const rc=shared.rounds?.[r-1];
              const isActive=shared.round===r&&shared.phase==="round";
              const isBlind=rc?.blind||false;
              const hasDivs=Object.keys(rc?.dividends||{}).length>0;
              return(
                <div key={r} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                  <div style={{width:28,height:28,borderRadius:"50%",flexShrink:0,
                    background:isActive?G.green:shared.round>r?G.gray3:G.bg,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:12,fontWeight:700,color:isActive?G.white:shared.round>r?G.white:G.gray2}}>
                    {shared.round>r?"✓":r}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,color:G.black}}>
                      R{r} <span style={{fontSize:11,color:G.gray1,fontWeight:400}}>({rc?.durationMin||5}분)</span>
                      {isBlind&&<span style={{fontSize:10,color:G.purple,background:G.purpleLight,borderRadius:4,padding:"1px 5px",marginLeft:4}}>블라인드</span>}
                      {hasDivs&&<span style={{fontSize:10,color:G.green,background:G.greenLight,borderRadius:4,padding:"1px 5px",marginLeft:4}}>배당</span>}
                    </div>
                  </div>
                  <Btn onClick={()=>startRound(r)} color={isActive?G.green:G.blue} style={{padding:"7px 12px",fontSize:12}}>
                    {isActive?"진행중":shared.round>r?"재시작":"시작"}
                  </Btn>
                </div>
              );
            })}
          </div>

          <div style={{display:"flex",gap:8,marginBottom:10}}>
            <Btn onClick={stopRound} color={G.yellow} textColor={G.black} style={{flex:1,padding:"12px 0"}}>라운드 종료</Btn>
            <Btn onClick={endGame} color={G.black} style={{flex:1,padding:"12px 0"}}>게임 종료</Btn>
          </div>

          {/* 종목 상장/폐지 */}
          <div style={{background:G.white,borderRadius:14,padding:14,marginBottom:10}}>
            <div style={{fontSize:13,fontWeight:700,color:G.black,marginBottom:10}}>📋 종목 상장·폐지</div>
            {(shared.stocks||[]).map(st=>(
              <div key={st.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:`1px solid ${G.border}`}}>
                <span style={{fontSize:18}}>{st.emoji}</span>
                <span style={{flex:1,fontSize:13,fontWeight:600,color:st.listed!==false?G.black:G.gray2,textDecoration:st.listed===false?"line-through":"none"}}>{st.name}</span>
                <span style={{fontSize:11,color:st.listed!==false?G.green:G.red,fontWeight:600}}>{st.listed!==false?"상장중":"폐지"}</span>
                {st.listed!==false
                  ?<Btn onClick={()=>delistStock(st.id)} color={G.redLight} textColor={G.red} style={{padding:"5px 10px",fontSize:11}}>폐지</Btn>
                  :<Btn onClick={()=>relistStock(st.id)} color={G.greenLight} textColor={G.green} style={{padding:"5px 10px",fontSize:11}}>재상장</Btn>}
              </div>
            ))}
          </div>

          {/* 긴급 이벤트 발동 */}
          <div style={{background:G.white,borderRadius:14,padding:14,marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{fontSize:13,fontWeight:700,color:G.black}}>🚨 긴급 이벤트 발동</div>
              {shared.activeEvent&&<Btn onClick={clearEvent} color={G.redLight} textColor={G.red} style={{padding:"5px 10px",fontSize:11}}>해제</Btn>}
            </div>
            {shared.activeEvent&&(
              <div style={{background:G.orangeLight,borderRadius:10,padding:"10px 12px",marginBottom:10,border:`1.5px solid ${G.orange}`}}>
                <div style={{fontSize:12,fontWeight:700,color:G.orange}}>활성: {shared.activeEvent.emoji} {shared.activeEvent.name}</div>
              </div>
            )}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {(shared.eventPresets||eventPresets).map(ev=>(
                <div key={ev.id} onClick={()=>applyEvent(ev)}
                  style={{background:G.bg,borderRadius:10,padding:"10px",cursor:"pointer",
                    border:`1.5px solid ${shared.activeEvent?.id===ev.id?G.orange:G.border}`,transition:"all .15s"}}>
                  <div style={{fontSize:18,marginBottom:3}}>{ev.emoji}</div>
                  <div style={{fontSize:12,fontWeight:700,color:G.black,marginBottom:2}}>{ev.name}</div>
                  <div style={{fontSize:11,fontWeight:600,color:ev.globalEffect>=0?G.red:G.blue}}>{ev.globalEffect>=0?"+":""}{ev.globalEffect}%</div>
                </div>
              ))}
            </div>
          </div>

          <Btn onClick={resetGame} color={G.redLight} textColor={G.red} style={{width:"100%",padding:"12px",fontSize:13}}>게임 초기화 (설정·팀 유지)</Btn>
        </>}

        {/* ══ 설정 탭 ══ */}
        {tab==="settings"&&<>
          <div style={{background:G.white,borderRadius:14,marginBottom:10,overflow:"hidden"}}>
            <div style={{display:"flex",overflowX:"auto"}}>
              {[["template","템플릿"],["round","라운드"],["stocks","종목"],["shop","상점"],["event","이벤트"]].map(([key,label])=>(
                <div key={key} onClick={()=>setSettingsTab(key)} style={{flexShrink:0,textAlign:"center",padding:"10px 14px",fontSize:12,fontWeight:600,
                  color:settingsTab===key?G.blue:G.gray1,borderBottom:`2px solid ${settingsTab===key?G.blue:"transparent"}`,cursor:"pointer"}}>{label}</div>
              ))}
            </div>
          </div>

          {/* 템플릿 */}
          {settingsTab==="template"&&<>
            <div style={{background:G.blueLight,borderRadius:12,padding:"10px 14px",marginBottom:10,fontSize:12,color:G.blue,lineHeight:1.6}}>
              💡 템플릿을 선택하면 종목·라운드·수수료 등 전체 설정이 한 번에 적용됩니다
            </div>
            {allTemplates.map(tpl=>(
              <div key={tpl.id} style={{background:G.white,borderRadius:14,padding:14,marginBottom:8}}>
                {editingTpl===tpl.id&&!tpl.builtIn?(
                  <div>
                    <div style={{display:"flex",gap:8,marginBottom:8}}>
                      <TextInput value={tpl.name} onChange={e=>updateCustomTpl(tpl.id,"name",e.target.value)} style={{flex:1}}/>
                      <Btn onClick={()=>setEditingTpl(null)} color={G.bg} textColor={G.gray1} style={{padding:"8px 12px",fontSize:12}}>완료</Btn>
                    </div>
                    <TextInput value={tpl.desc||""} onChange={e=>updateCustomTpl(tpl.id,"desc",e.target.value)} placeholder="설명"/>
                  </div>
                ):(
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:14,fontWeight:700,color:G.black,marginBottom:3}}>{tpl.name}</div>
                      <div style={{fontSize:12,color:G.gray1,marginBottom:6}}>{tpl.desc}</div>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                        {[`${tpl.maxRound}라운드`,`${fmt(tpl.initCash)}`,`수수료 ${tpl.feeRate}%`,
                          tpl.leverageEnabled?`레버리지 x${tpl.leverageMax}`:"레버리지 없음"].map(tag=>(
                          <span key={tag} style={{fontSize:10,background:G.bg,borderRadius:4,padding:"2px 6px",color:G.gray1}}>{tag}</span>
                        ))}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:6,flexShrink:0,marginLeft:8}}>
                      {!tpl.builtIn&&<>
                        <Btn onClick={()=>setEditingTpl(tpl.id)} color={G.bg} textColor={G.gray1} style={{padding:"6px 10px",fontSize:11}}>수정</Btn>
                        <Btn onClick={()=>delCustomTpl(tpl.id)} color={G.redLight} textColor={G.red} style={{padding:"6px 10px",fontSize:11}}>삭제</Btn>
                      </>}
                      <Btn onClick={()=>applyTemplate(tpl)} color={G.blue} style={{padding:"6px 12px",fontSize:12}}>적용</Btn>
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div style={{background:G.white,borderRadius:14,padding:14,marginTop:10}}>
              <div style={{fontSize:13,fontWeight:700,color:G.black,marginBottom:8}}>현재 설정 저장</div>
              <div style={{display:"flex",gap:8}}>
                <TextInput value={saveTplName} onChange={e=>setSaveTplName(e.target.value)} placeholder="템플릿 이름" style={{flex:1}}/>
                <Btn onClick={saveAsTemplate} color={G.green} style={{flexShrink:0,padding:"9px 12px",fontSize:12}}>저장</Btn>
              </div>
            </div>
          </>}

          {/* 라운드 설정 */}
          {settingsTab==="round"&&<>
            <div style={{background:G.white,borderRadius:14,padding:14,marginBottom:10}}>
              <div style={{fontSize:13,fontWeight:700,color:G.black,marginBottom:10}}>게임 기본 설정</div>
              <div style={{display:"flex",gap:8,marginBottom:10}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:11,color:G.gray2,marginBottom:4}}>시작 자금 (원)</div>
                  <NumInput value={initCash} onChange={e=>setInitCash(parseInt(e.target.value)||0)}/>
                </div>
                <div style={{width:100}}>
                  <div style={{fontSize:11,color:G.gray2,marginBottom:4}}>라운드 수</div>
                  <div style={{display:"flex",alignItems:"center",gap:4}}>
                    <div onClick={()=>changeMaxRound(maxRound-1)} style={{width:28,height:34,borderRadius:7,border:`1.5px solid ${G.border}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:16,flexShrink:0}}>−</div>
                    <div style={{fontSize:16,fontWeight:700,color:G.black,textAlign:"center",minWidth:24}}>{maxRound}</div>
                    <div onClick={()=>changeMaxRound(maxRound+1)} style={{width:28,height:34,borderRadius:7,border:`1.5px solid ${G.border}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:16,flexShrink:0}}>+</div>
                  </div>
                </div>
              </div>
              <div style={{display:"flex",gap:8,marginBottom:10}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:11,color:G.gray2,marginBottom:4}}>수수료율 (%)</div>
                  <NumInput value={feeRate} onChange={e=>setFeeRate(parseFloat(e.target.value)||0)} style={{textAlign:"left"}}/>
                </div>
              </div>
              <div style={{background:G.bg,borderRadius:10,padding:"10px 12px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:leverageEnabled?8:0}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:G.black}}>레버리지 투자</div>
                    <div style={{fontSize:11,color:G.gray1}}>보유 현금의 최대 N배 투자 가능</div>
                  </div>
                  <div onClick={()=>setLeverageEnabled(v=>!v)}
                    style={{width:44,height:26,borderRadius:13,background:leverageEnabled?G.blue:G.gray3,
                      position:"relative",cursor:"pointer",transition:"background .2s"}}>
                    <div style={{width:22,height:22,borderRadius:"50%",background:G.white,position:"absolute",
                      top:2,left:leverageEnabled?20:2,transition:"left .2s"}}/>
                  </div>
                </div>
                {leverageEnabled&&<div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:12,color:G.gray1}}>최대 배수</span>
                  <NumInput value={leverageMax} onChange={e=>setLeverageMax(parseInt(e.target.value)||2)} style={{width:64}}/>
                  <span style={{fontSize:12,color:G.gray1}}>배</span>
                </div>}
              </div>
            </div>
            <div style={{background:G.white,borderRadius:14,padding:14,marginBottom:10}}>
              <div style={{fontSize:13,fontWeight:700,color:G.black,marginBottom:10}}>라운드별 설정</div>
              {rounds.map((r,i)=>(
                <div key={r.id} style={{marginBottom:16,paddingBottom:16,borderBottom:i<rounds.length-1?`1px solid ${G.border}`:"none"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                    <div style={{fontSize:13,fontWeight:700,color:G.black,minWidth:32}}>R{i+1}</div>
                    <NumInput value={r.durationMin} onChange={e=>updRound(r.id,"durationMin",parseInt(e.target.value)||1)} style={{width:60}}/>
                    <span style={{fontSize:12,color:G.gray1}}>분</span>
                    <div onClick={()=>updRound(r.id,"blind",!r.blind)}
                      style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:6,cursor:"pointer",
                        background:r.blind?G.purpleLight:G.bg,borderRadius:8,padding:"4px 10px"}}>
                      <span style={{fontSize:11,color:r.blind?G.purple:G.gray2,fontWeight:600}}>🙈 블라인드</span>
                      <div style={{width:32,height:18,borderRadius:9,background:r.blind?G.purple:G.gray3,position:"relative"}}>
                        <div style={{width:14,height:14,borderRadius:"50%",background:G.white,position:"absolute",top:2,left:r.blind?16:2,transition:"left .2s"}}/>
                      </div>
                    </div>
                  </div>
                  <div>
                    <div style={{fontSize:11,color:G.green,fontWeight:600,marginBottom:6}}>💰 배당금 설정 (주당 지급액)</div>
                    {stocks.map(s=>{
                      const val=r.dividends?.[s.id]||0;
                      return(
                        <div key={s.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
                          <span style={{fontSize:13,width:100,flexShrink:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.emoji} {s.name}</span>
                          <NumInput value={val||""} onChange={e=>updDividend(r.id,s.id,e.target.value)} placeholder="0=없음" style={{flex:1,textAlign:"left"}}/>
                          <span style={{fontSize:11,color:G.gray2,flexShrink:0}}>원/주</span>
                          {val>0&&<span onClick={()=>clearDividend(r.id,s.id)} style={{fontSize:11,color:G.red,cursor:"pointer",flexShrink:0}}>×</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <Btn onClick={saveSettings} style={{width:"100%",padding:"13px",fontSize:14}}>설정 저장</Btn>
          </>}

          {/* 종목 설정 */}
          {settingsTab==="stocks"&&<>
            <div style={{background:G.white,borderRadius:14,padding:14,marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div style={{fontSize:13,fontWeight:700,color:G.black}}>종목 ({stocks.length}개)</div>
                <Btn onClick={addStock} color={G.green} style={{padding:"6px 12px",fontSize:12}}>+ 추가</Btn>
              </div>
              {stocks.map((s,si)=>(
                <div key={s.id} style={{marginBottom:14,paddingBottom:14,borderBottom:si<stocks.length-1?`1px solid ${G.border}`:"none"}}>
                  <div style={{display:"flex",gap:6,marginBottom:8,alignItems:"center"}}>
                    <select value={s.emoji} onChange={e=>updStock(s.id,"emoji",e.target.value)}
                      style={{width:40,height:34,border:`1.5px solid ${G.border}`,borderRadius:7,fontSize:16,textAlign:"center",background:G.white,outline:"none",cursor:"pointer",flexShrink:0}}>
                      {STOCK_EMOJIS.map(em=><option key={em} value={em}>{em}</option>)}
                    </select>
                    <TextInput value={s.name} onChange={e=>updStock(s.id,"name",e.target.value)} placeholder="종목명" style={{flex:1}}/>
                    <TextInput value={s.code} onChange={e=>updStock(s.id,"code",e.target.value)} placeholder="코드" style={{width:68}}/>
                    <div onClick={()=>delStock(s.id)} style={{width:32,height:34,borderRadius:7,background:G.redLight,color:G.red,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:16,flexShrink:0,fontWeight:700}}>×</div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(maxRound,4)},1fr)`,gap:6,marginBottom:6}}>
                    {Array.from({length:maxRound},(_,ri)=>(
                      <div key={ri}>
                        <div style={{fontSize:10,color:G.gray2,marginBottom:3,textAlign:"center",fontWeight:500}}>R{ri+1} 목표가</div>
                        <NumInput value={s.prices[ri]??0} onChange={e=>updPrice(s.id,ri,e.target.value)}/>
                      </div>
                    ))}
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{fontSize:11,color:G.gray2,flexShrink:0}}>총 발행량</div>
                    <NumInput value={s.totalSupply||0} onChange={e=>updStock(s.id,"totalSupply",parseInt(e.target.value)||0)} placeholder="0=무제한" style={{flex:1,textAlign:"left"}}/>
                    <span style={{fontSize:11,color:G.gray2,flexShrink:0}}>주 (0=무제한)</span>
                  </div>
                </div>
              ))}
            </div>
            <Btn onClick={saveSettings} style={{width:"100%",padding:"13px",fontSize:14}}>종목 설정 저장</Btn>
          </>}

          {/* 상점 설정 */}
          {settingsTab==="shop"&&<>
            <div style={{background:G.white,borderRadius:14,padding:14,marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div style={{fontSize:13,fontWeight:700,color:G.black}}>상품 ({shopItems.length}개)</div>
                <Btn onClick={addShop} color={G.green} style={{padding:"6px 12px",fontSize:12}}>+ 추가</Btn>
              </div>
              {shopItems.map((item,i)=>(
                <div key={item.id} style={{marginBottom:16,paddingBottom:16,borderBottom:i<shopItems.length-1?`1px solid ${G.border}`:"none"}}>
                  <div style={{display:"flex",gap:6,marginBottom:6,alignItems:"center"}}>
                    <select value={item.emoji} onChange={e=>updShop(item.id,"emoji",e.target.value)}
                      style={{width:40,height:34,border:`1.5px solid ${G.border}`,borderRadius:7,fontSize:16,textAlign:"center",background:G.white,outline:"none",cursor:"pointer",flexShrink:0}}>
                      {SHOP_EMOJIS.map(em=><option key={em} value={em}>{em}</option>)}
                    </select>
                    <TextInput value={item.name} onChange={e=>updShop(item.id,"name",e.target.value)} placeholder="상품명" style={{flex:1}}/>
                    <div onClick={()=>delShop(item.id)} style={{width:32,height:34,borderRadius:7,background:G.redLight,color:G.red,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:16,flexShrink:0,fontWeight:700}}>×</div>
                  </div>
                  <div style={{display:"flex",gap:6,marginBottom:6,alignItems:"center"}}>
                    <div style={{fontSize:11,color:G.gray2,flexShrink:0,width:36}}>가격</div>
                    <NumInput value={item.price} onChange={e=>updShop(item.id,"price",parseInt(e.target.value)||0)} style={{textAlign:"left"}}/>
                  </div>
                  <div style={{marginBottom:6}}>
                    <div style={{fontSize:11,color:G.gray2,marginBottom:3}}>구매 전 설명</div>
                    <TextInput value={item.desc} onChange={e=>updShop(item.id,"desc",e.target.value)} placeholder="구매 전 보이는 설명"/>
                  </div>
                  <div>
                    <div style={{fontSize:11,color:G.purple,fontWeight:600,marginBottom:3}}>🔒 구매 후 공개 힌트</div>
                    <textarea value={item.hint} onChange={e=>updShop(item.id,"hint",e.target.value)} rows={3}
                      style={{width:"100%",border:`1.5px solid ${G.purple}`,borderRadius:8,padding:"9px 10px",fontSize:13,fontFamily:"inherit",outline:"none",color:G.black,boxSizing:"border-box",resize:"vertical",lineHeight:1.6,background:G.purpleLight}}/>
                  </div>
                </div>
              ))}
            </div>
            <Btn onClick={saveSettings} color={G.purple} style={{width:"100%",padding:"13px",fontSize:14}}>상점 설정 저장</Btn>
          </>}

          {/* 이벤트 설정 */}
          {settingsTab==="event"&&<>
            <div style={{background:G.white,borderRadius:14,padding:14,marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div style={{fontSize:13,fontWeight:700,color:G.black}}>이벤트 프리셋 ({eventPresets.length}개)</div>
                <Btn onClick={addEvent} color={G.green} style={{padding:"6px 12px",fontSize:12}}>+ 추가</Btn>
              </div>
              {eventPresets.map(ev=>(
                <div key={ev.id} style={{marginBottom:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",
                    background:editingEvent?.id===ev.id?G.blueLight:G.bg,borderRadius:10,cursor:"pointer",
                    border:`1.5px solid ${editingEvent?.id===ev.id?G.blue:G.border}`}}
                    onClick={()=>setEditingEvent(editingEvent?.id===ev.id?null:{...ev})}>
                    <span style={{fontSize:20}}>{ev.emoji}</span>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:700,color:G.black}}>{ev.name}</div>
                      <div style={{fontSize:11,color:G.gray1}}>{ev.desc}</div>
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{fontSize:12,fontWeight:600,color:ev.globalEffect>=0?G.red:G.blue}}>{ev.globalEffect>=0?"+":""}{ev.globalEffect}%</div>
                    </div>
                    <div onClick={e=>{e.stopPropagation();delEvent(ev.id);}} style={{width:28,height:28,borderRadius:7,background:G.redLight,color:G.red,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:14,flexShrink:0,fontWeight:700}}>×</div>
                  </div>
                  {editingEvent?.id===ev.id&&(
                    <div style={{background:G.white,border:`1.5px solid ${G.blue}`,borderRadius:12,padding:14,marginTop:6}}>
                      <div style={{fontSize:12,fontWeight:700,color:G.blue,marginBottom:10}}>✏️ 이벤트 상세 설정</div>
                      <div style={{display:"flex",gap:6,marginBottom:8,alignItems:"center"}}>
                        <select value={ev.emoji} onChange={e=>updEvent(ev.id,"emoji",e.target.value)}
                          style={{width:40,height:34,border:`1.5px solid ${G.border}`,borderRadius:7,fontSize:16,textAlign:"center",background:G.white,outline:"none",cursor:"pointer",flexShrink:0}}>
                          {EVENT_EMOJIS.map(em=><option key={em} value={em}>{em}</option>)}
                        </select>
                        <TextInput value={ev.name} onChange={e=>updEvent(ev.id,"name",e.target.value)} placeholder="이벤트 이름" style={{flex:1}}/>
                      </div>
                      <div style={{marginBottom:8}}>
                        <div style={{fontSize:11,color:G.gray2,marginBottom:3}}>공개 설명 (팀장 화면 표시)</div>
                        <TextInput value={ev.desc} onChange={e=>updEvent(ev.id,"desc",e.target.value)} placeholder="공개 설명"/>
                      </div>
                      <div style={{background:G.bg,borderRadius:10,padding:"10px 12px",marginBottom:10}}>
                        <div style={{fontSize:12,fontWeight:600,color:G.black,marginBottom:6}}>전체 종목 기본 효과 (%)</div>
                        <NumInput value={ev.globalEffect} onChange={e=>updEvent(ev.id,"globalEffect",parseInt(e.target.value)||0)} style={{width:80}}/>
                      </div>
                      <div style={{marginBottom:8}}>
                        <div style={{fontSize:12,fontWeight:600,color:G.black,marginBottom:6}}>종목별 개별 효과</div>
                        {stocks.map(s=>{
                          const has=ev.stockEffects?.[s.id]!==undefined;
                          return(
                            <div key={s.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                              <span style={{width:90,fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flexShrink:0}}>{s.emoji} {s.name}</span>
                              <NumInput value={has?ev.stockEffects[s.id]:""} onChange={e=>updStockEffect(ev.id,s.id,e.target.value)}
                                placeholder={`기본(${ev.globalEffect}%)`} style={{flex:1,background:has?G.blueLight:G.white}}/>
                              <span style={{fontSize:11,color:G.gray2,flexShrink:0}}>%</span>
                              {has&&<span onClick={()=>clearStockEffect(ev.id,s.id)} style={{fontSize:11,color:G.red,cursor:"pointer",flexShrink:0}}>초기화</span>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <Btn onClick={saveSettings} color={G.orange} style={{width:"100%",padding:"13px",fontSize:14}}>이벤트 설정 저장</Btn>
          </>}
        </>}

        {/* ══ 팀 관리 탭 ══ */}
        {tab==="teams"&&<>
          <div style={{background:G.white,borderRadius:14,padding:14,marginBottom:10}}>
            <div style={{fontSize:13,fontWeight:700,color:G.black,marginBottom:10}}>팀 계정 등록</div>
            <div style={{display:"flex",gap:6,marginBottom:6}}>
              <TextInput value={newTeamName} onChange={e=>setNewTeamName(e.target.value)} placeholder="팀 이름" style={{flex:1}}/>
            </div>
            <div style={{display:"flex",gap:6,marginBottom:10}}>
              <TextInput value={newTeamPw} onChange={e=>setNewTeamPw(e.target.value)} placeholder="비밀번호" style={{flex:1}}/>
              <Btn onClick={addTeam} style={{flexShrink:0,padding:"9px 14px",fontSize:13}}>등록</Btn>
            </div>
          </div>
          <div style={{background:G.white,borderRadius:14,padding:14}}>
            <div style={{fontSize:13,fontWeight:700,color:G.black,marginBottom:10}}>등록된 팀 ({Object.keys(shared.teamCredentials||{}).length}팀)</div>
            {Object.keys(shared.teamCredentials||{}).length===0
              ?<div style={{textAlign:"center",color:G.gray2,padding:"24px 0",fontSize:13}}>등록된 팀 없음</div>
              :Object.entries(shared.teamCredentials||{}).map(([name,{id,pw}])=>{
                const tm=shared.teams?.[id];
                return(
                  <div key={name} style={{padding:"10px 0",borderBottom:`1px solid ${G.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:700,color:G.black}}>{name}</div>
                      <div style={{fontSize:11,color:G.gray2,fontFamily:"monospace",marginTop:1}}>PW: {pw}</div>
                      {tm&&<div style={{fontSize:11,color:G.gray1,marginTop:1}}>현금: {fmt(tm.cash||0)}</div>}
                    </div>
                    <div onClick={()=>delTeam(name)} style={{padding:"5px 10px",borderRadius:7,background:G.redLight,color:G.red,cursor:"pointer",fontSize:12,fontWeight:600}}>삭제</div>
                  </div>
                );
              })
            }
          </div>
        </>}

        {/* ══ 계좌 조회 탭 ══ */}
        {tab==="accounts"&&(
          Object.keys(shared.teams||{}).length===0
            ?<div style={{background:G.white,borderRadius:14,padding:40,textAlign:"center",color:G.gray2}}>참가 팀 없음</div>
            :Object.entries(shared.teams||{}).map(([id,tm])=>{
              const r=Math.max(shared.round,1);
              const sv=Object.entries(tm.holdings||{}).reduce((acc,[sid,h])=>{
                const st=shared.stocks?.find(x=>x.id===sid);
                return acc+(st?st.prices[Math.min(r-1,st.prices.length-1)]*h.qty:0);
              },0);
              const isOpen=selTeam===id;
              return(
                <div key={id} style={{background:G.white,borderRadius:14,marginBottom:8,overflow:"hidden"}}>
                  <div onClick={()=>setSelTeam(isOpen?null:id)}
                    style={{padding:"13px 14px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontSize:14,fontWeight:700,color:G.black}}>{tm.name}</div>
                      <div style={{fontSize:11,color:G.gray1,marginTop:1}}>총 자산 {fmt(tm.cash+sv)}</div>
                    </div>
                    <span style={{color:G.gray2,fontSize:14}}>{isOpen?"▲":"▼"}</span>
                  </div>
                  {isOpen&&(
                    <div style={{padding:"0 14px 14px",borderTop:`1px solid ${G.border}`}}>
                      <div style={{display:"flex",gap:6,marginTop:10,marginBottom:10}}>
                        {[["현금",fmt(tm.cash)],["주식",fmt(sv)],["차입금",fmt(tm.borrowed||0)]].map(([k,v])=>(
                          <div key={k} style={{flex:1,background:G.bg,borderRadius:9,padding:"9px 6px",textAlign:"center"}}>
                            <div style={{fontSize:10,color:G.gray2,marginBottom:2}}>{k}</div>
                            <div style={{fontSize:12,fontWeight:700,color:G.black}}>{v}</div>
                          </div>
                        ))}
                      </div>
                      {Object.entries(tm.holdings||{}).filter(([,h])=>h.qty>0).map(([sid,h])=>{
                        const st=shared.stocks?.find(x=>x.id===sid);
                        if(!st) return null;
                        const cur=st.prices[Math.min(r-1,st.prices.length-1)];
                        const pnl=(cur-h.avgPrice)*h.qty;
                        return(
                          <div key={sid} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${G.border}`}}>
                            <span style={{fontSize:12,color:G.black}}>{st.emoji} {st.name} <span style={{color:G.gray2}}>{h.qty}주</span></span>
                            <span style={{fontSize:12,fontWeight:600,color:pnl>=0?G.red:G.blue}}>{pnl>=0?"+":""}{fmt(pnl)}</span>
                          </div>
                        );
                      })}
                      {/* 거래 내역 */}
                      {(tm.history||[]).length>0&&(
                        <div style={{marginTop:10}}>
                          <div style={{fontSize:11,color:G.gray1,marginBottom:6,fontWeight:600}}>거래 내역</div>
                          <div style={{maxHeight:150,overflowY:"auto"}}>
                            {[...(tm.history||[])].reverse().map((h,i)=>(
                              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:`1px solid ${G.border}`}}>
                                <div style={{display:"flex",alignItems:"center",gap:6}}>
                                  <span style={{fontSize:11,fontWeight:700,
                                    color:h.type==="buy"?G.red:h.type==="sell"?G.blue:G.green,
                                    background:h.type==="buy"?G.redLight:h.type==="sell"?G.blueLight:G.greenLight,
                                    padding:"1px 6px",borderRadius:4}}>
                                    {h.type==="buy"?"매수":h.type==="sell"?"매도":"배당"}
                                  </span>
                                  <span style={{fontSize:12,color:G.black}}>{h.stockEmoji} {h.stockName}</span>
                                  {h.qty>0&&<span style={{fontSize:11,color:G.gray2}}>{h.qty}주</span>}
                                </div>
                                <div style={{textAlign:"right"}}>
                                  <div style={{fontSize:12,fontWeight:600,color:G.black}}>{fmt(h.total)}</div>
                                  <div style={{fontSize:10,color:G.gray2}}>{h.time}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* 보너스 지급 */}
                      <div style={{marginTop:10,background:G.yellowLight,borderRadius:10,padding:"10px 12px"}}>
                        <div style={{fontSize:11,fontWeight:700,color:G.yellow,marginBottom:7}}>💰 보너스 지급</div>
                        <div style={{display:"flex",gap:6,marginBottom:6}}>
                          <NumInput value={bonusIn[id]||""} onChange={e=>setBonusIn(b=>({...b,[id]:e.target.value}))} placeholder="금액" style={{flex:1,textAlign:"left"}}/>
                          <Btn onClick={()=>giveBonus(id)} color={G.yellow} textColor={G.black} style={{padding:"8px 12px",fontSize:12,flexShrink:0}}>지급</Btn>
                        </div>
                        <div style={{display:"flex",gap:5}}>
                          {[100000,500000,1000000].map(v=>(
                            <div key={v} onClick={()=>setBonusIn(b=>({...b,[id]:String(v)}))}
                              style={{flex:1,background:G.white,border:`1px solid ${G.border}`,borderRadius:6,padding:"5px",fontSize:11,textAlign:"center",cursor:"pointer",color:G.gray1}}>
                              +{v>=1000000?(v/1000000)+"백만":(v/10000)+"만"}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
        )}

        {/* ══ 순위 탭 ══ */}
        {tab==="rank"&&(
          <div style={{background:G.white,borderRadius:14,padding:14}}>
            <div style={{fontSize:13,fontWeight:700,color:G.black,marginBottom:12}}>실시간 자산 순위</div>
            {getRank().length===0
              ?<div style={{textAlign:"center",color:G.gray2,padding:"32px 0"}}>참가 팀 없음</div>
              :getRank().map((t,i)=>(
                <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 0",borderBottom:`1px solid ${G.border}`}}>
                  <div style={{width:26,height:26,borderRadius:"50%",flexShrink:0,
                    background:i===0?"#FFD700":i===1?"#C0C0C0":i===2?"#CD7F32":G.gray4,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:12,fontWeight:700,color:i<3?G.white:G.gray1}}>{i+1}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:700,color:G.black}}>{t.name}</div>
                    {t.bonus>0&&<div style={{fontSize:11,color:G.yellow}}>보너스 +{fmt(t.bonus)}</div>}
                    {t.borrowed>0&&<div style={{fontSize:11,color:G.orange}}>차입 {fmt(t.borrowed)}</div>}
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:14,fontWeight:800,color:G.black}}>{fmt(t.total)}</div>
                    <div style={{fontSize:11,color:t.total>=(shared.initCash||DEFAULT_INIT_CASH)?G.red:G.blue}}>
                      {t.total>=(shared.initCash||DEFAULT_INIT_CASH)?"+":""}{fmt(t.total-(shared.initCash||DEFAULT_INIT_CASH))}
                    </div>
                  </div>
                </div>
              ))
            }
          </div>
        )}
      </div>
      <Toast {...toast}/>
    </div>
  );
}

/* ══════════════════════════════════════════
   사용자 앱
══════════════════════════════════════════ */
function UserApp(){
  const shared=useShared();
  const [screen,setScreen]=useState("login");
  const [loginName,setLoginName]=useState("");
  const [loginPw,setLoginPw]=useState("");
  const [loginErr,setLoginErr]=useState("");
  const [teamId,setTeamId]=useState(null);
  const [teamName,setTeamName]=useState("");
  const [tab,setTab]=useState("market");
  const [detail,setDetail]=useState(null);
  const [orderSide,setOrderSide]=useState("buy");
  const [qty,setQty]=useState(1);
  const [leverage,setLeverage]=useState(1);
  const [confirm,setConfirm]=useState(false);
  const [toast,setToast]=useState({msg:"",show:false});
  const t2=msg=>showToast(setToast,msg);

  useEffect(()=>{if(screen==="main"&&shared.phase==="ended")setScreen("ended");},[shared.phase,screen]);
  useEffect(()=>{if(screen==="ended"&&(shared.phase==="ready"||shared.phase==="round"))setScreen("main");},[shared.phase,screen]);

  const myTeam=teamId?shared.teams?.[teamId]:null;
  const initCash=shared.initCash||DEFAULT_INIT_CASH;
  const cash=myTeam?.cash??initCash;
  const holdings=myTeam?.holdings??{};
  const purchases=myTeam?.purchases??[];
  const borrowed=myTeam?.borrowed??0;
  const round=Math.max(shared.round,1);
  const maxRound=shared.maxRound||3;
  const feeRate=shared.feeRate??0.1;
  const leverageEnabled=shared.leverageEnabled??false;
  const leverageMax=shared.leverageMax??2;
  const rem=useRoundTimer(shared.phase,shared.roundEndsAt);

  // 현재 라운드 블라인드 여부
  const isBlind=(shared.rounds?.[round-1]?.blind)||false;

  const getLivePrice=useCallback(st=>{
    if(isBlind) return null;
    return getCurrentPrice(st,round,shared.roundStartedAt,shared.roundEndsAt,shared.activeEvent);
  },[round,shared.roundStartedAt,shared.roundEndsAt,shared.activeEvent,isBlind]);

  const totalAsset=useCallback(()=>{
    let t=cash;
    for(const [sid,h] of Object.entries(holdings)){
      const s=shared.stocks?.find(x=>x.id===sid);
      if(s&&h.qty>0){
        const p=getCurrentPrice(s,round,shared.roundStartedAt,shared.roundEndsAt,shared.activeEvent);
        t+=p*h.qty;
      }
    }
    return t;
  },[cash,holdings,shared.stocks,round,shared.roundStartedAt,shared.roundEndsAt,shared.activeEvent]);

  const doLogin=()=>{
    const name=loginName.trim(),pw=loginPw.trim();
    if(!name||!pw){setLoginErr("팀 이름과 비밀번호를 입력해주세요");return;}
    const cred=shared.teamCredentials?.[name];
    if(!cred){setLoginErr("등록되지 않은 팀 이름입니다");return;}
    if(cred.pw!==pw){setLoginErr("비밀번호가 올바르지 않습니다");return;}
    setTeamId(cred.id);setTeamName(name);setLoginErr("");setScreen("main");
  };

  const updTeam=fn=>setShared(s=>{
    const cur=s.teams?.[teamId]||{name:teamName,cash:s.initCash||DEFAULT_INIT_CASH,holdings:{},purchases:[],history:[],borrowed:0};
    return{...s,teams:{...s.teams,[teamId]:fn(cur)}};
  });

  const orderPrice=detail?(isBlind?detail.prices[Math.min(round-1,detail.prices.length-1)]:getLivePrice(detail)):0;
  const effectiveQty=qty*leverage;
  const feeAmt=Math.round(orderPrice*effectiveQty*feeRate/100);

  const doOrder=()=>{
    if(shared.phase!=="round"){t2("현재 매매 시간이 아닙니다");setConfirm(false);return;}
    const s=detail;
    const cur=orderPrice;
    const cost=cur*effectiveQty;
    const totalCost=cost+(orderSide==="buy"?feeAmt:-feeAmt);

    if(orderSide==="buy"){
      const borrowAmt=leverage>1?Math.round(cost*(leverage-1)/leverage):0;
      const myCost=cost-borrowAmt+feeAmt;
      if(myCost>cash){t2("잔액이 부족합니다");setConfirm(false);return;}
      // 발행량 체크
      const si=shared.stocks?.find(x=>x.id===s.id);
      if((si?.totalSupply||0)>0){
        const allHeld=Object.values(shared.teams||{}).reduce((acc,tm)=>acc+(tm.holdings?.[s.id]?.qty||0),0);
        if(allHeld+effectiveQty>si.totalSupply){t2(`최대 ${si.totalSupply-allHeld}주 구매 가능`);setConfirm(false);return;}
      }
      updTeam(t=>{
        const h=t.holdings?.[s.id]||{qty:0,avgPrice:0};
        const nq=h.qty+effectiveQty,na=Math.round((h.avgPrice*h.qty+cur*effectiveQty)/nq);
        const rec={time:new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}),
          type:'buy',stockName:s.name+(leverage>1?` (x${leverage})`:""),stockEmoji:s.emoji,qty:effectiveQty,price:cur,total:cost};
        return{...t,cash:t.cash-myCost,borrowed:(t.borrowed||0)+borrowAmt,
          holdings:{...t.holdings,[s.id]:{qty:nq,avgPrice:na}},
          history:[...(t.history||[]),rec]};
      });
      t2(`${s.name} ${effectiveQty}주 매수 완료${leverage>1?` (x${leverage})`:""}`);;
    } else {
      const h=holdings[s.id];
      if(!h||h.qty<effectiveQty){t2("보유 수량 부족");setConfirm(false);return;}
      const proceeds=cost-feeAmt;
      const repay=Math.min(borrowed,cost*((leverage-1)/leverage)||0);
      updTeam(t=>{
        const newQty=(t.holdings?.[s.id]?.qty||0)-effectiveQty;
        const rec={time:new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}),
          type:'sell',stockName:s.name,stockEmoji:s.emoji,qty:effectiveQty,price:cur,total:cost};
        return{...t,cash:t.cash+proceeds,borrowed:Math.max(0,(t.borrowed||0)-repay),
          holdings:{...t.holdings,[s.id]:{...t.holdings?.[s.id],qty:newQty}},
          history:[...(t.history||[]),rec]};
      });
      t2(`${s.name} ${effectiveQty}주 매도 완료`);
    }
    setQty(1);setLeverage(1);setConfirm(false);
  };

  const buyShop=item=>{
    const latest=(shared.shopItems||[]).find(x=>x.id===item.id)||item;
    if(purchases.includes(latest.id)){t2("이미 구매한 항목");return;}
    if(cash<latest.price){t2("잔액 부족");return;}
    updTeam(t=>({...t,cash:t.cash-latest.price,purchases:[...(t.purchases||[]),latest.id]}));
    t2(`${latest.name} 구매 완료!`);
  };

  const total=totalAsset(),diff=total-initCash,diffPct=((diff/initCash)*100).toFixed(2);
  const stockVal=total-cash;
  const W={wrap:{...WRAP,background:G.bg}};

  /* ── 로그인 ── */
  if(screen==="login") return(
    <div style={W.wrap}>
      <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",justifyContent:"center",padding:"0 24px",background:G.white}}>
        <div style={{marginBottom:36}}>
          <div style={{fontSize:30,fontWeight:800,color:G.black,marginBottom:8,letterSpacing:-1}}>로(路) 주식 게임 🏦</div>
          <div style={{fontSize:15,color:G.gray1,lineHeight:1.7}}>운영자에게 받은 팀 정보로<br/>로그인하세요</div>
        </div>
        <div style={{marginBottom:12}}>
          <div style={{fontSize:13,fontWeight:600,color:G.gray1,marginBottom:6}}>팀 이름</div>
          <input value={loginName} onChange={e=>{setLoginName(e.target.value);setLoginErr("");}} placeholder="예) 드림팀"
            onKeyDown={e=>e.key==="Enter"&&doLogin()}
            style={{width:"100%",border:`1.5px solid ${loginErr?G.red:G.border}`,borderRadius:12,padding:"14px 16px",fontSize:15,fontFamily:"inherit",outline:"none",color:G.black,boxSizing:"border-box"}}/>
        </div>
        <div style={{marginBottom:16}}>
          <div style={{fontSize:13,fontWeight:600,color:G.gray1,marginBottom:6}}>비밀번호</div>
          <input type="password" value={loginPw} onChange={e=>{setLoginPw(e.target.value);setLoginErr("");}} placeholder="운영자에게 받은 비밀번호"
            onKeyDown={e=>e.key==="Enter"&&doLogin()}
            style={{width:"100%",border:`1.5px solid ${loginErr?G.red:G.border}`,borderRadius:12,padding:"14px 16px",fontSize:15,fontFamily:"inherit",outline:"none",color:G.black,boxSizing:"border-box"}}/>
        </div>
        {loginErr&&<div style={{fontSize:13,color:G.red,marginBottom:10,padding:"10px 12px",background:G.redLight,borderRadius:8}}>{loginErr}</div>}
        <Btn onClick={doLogin} style={{width:"100%",padding:"15px",fontSize:16,borderRadius:12}}>게임 입장</Btn>
        <div style={{textAlign:"center",marginTop:14,fontSize:12,color:G.gray2}}>팀 정보는 운영자에게 문의하세요</div>
      </div>
      <Toast {...toast}/>
    </div>
  );

  /* ── 종료 ── */
  if(screen==="ended"){
    const fd=totalAsset()-initCash;
    const rank=Object.entries(shared.teams||{}).map(([id,tm])=>{
      const sv=Object.entries(tm.holdings||{}).reduce((acc,[sid,h])=>{
        const st=shared.stocks?.find(x=>x.id===sid);
        return acc+(st?st.prices[st.prices.length-1]*h.qty:0);
      },0);
      return{id,name:tm.name,total:tm.cash+sv};
    }).sort((a,b)=>b.total-a.total);
    const myRank=rank.findIndex(r=>r.id===teamId)+1;
    return(
      <div style={W.wrap}>
        <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",background:G.white}}>
          <div style={{background:`linear-gradient(135deg,${G.blue},${G.purple})`,padding:"40px 24px 32px",textAlign:"center"}}>
            <div style={{fontSize:48,marginBottom:12}}>{fd>=0?"🏆":"📉"}</div>
            <div style={{fontSize:22,fontWeight:800,color:G.white,marginBottom:4}}>게임 종료!</div>
            <div style={{fontSize:14,color:"rgba(255,255,255,0.8)",marginBottom:20}}>{teamName}팀 최종 결과</div>
            <div style={{background:"rgba(255,255,255,0.15)",borderRadius:16,padding:"16px 20px",display:"inline-block",minWidth:200}}>
              <div style={{fontSize:12,color:"rgba(255,255,255,0.7)",marginBottom:4}}>최종 총 자산</div>
              <div style={{fontSize:28,fontWeight:800,color:G.white,marginBottom:4}}>{fmt(totalAsset())}</div>
              <div style={{fontSize:15,fontWeight:600,color:fd>=0?"#FFD700":"#FF8080"}}>{fd>=0?"+":""}{fmt(fd)} ({fd>=0?"+":""}{((fd/initCash)*100).toFixed(2)}%)</div>
            </div>
            {myRank>0&&<div style={{marginTop:12,fontSize:13,color:"rgba(255,255,255,0.9)",fontWeight:600}}>
              {rank.length}팀 중 {myRank}위 {myRank===1?"🥇":myRank===2?"🥈":myRank===3?"🥉":""}
            </div>}
          </div>
          <div style={{padding:"16px"}}>
            <div style={{fontSize:13,fontWeight:700,color:G.black,marginBottom:8}}>전체 순위</div>
            <div style={{background:G.white,borderRadius:14,border:`1px solid ${G.border}`,overflow:"hidden",marginBottom:12}}>
              {rank.map((t,i)=>(
                <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",
                  borderBottom:i<rank.length-1?`1px solid ${G.border}`:"none",
                  background:t.id===teamId?G.blueLight:"transparent"}}>
                  <div style={{width:26,height:26,borderRadius:"50%",flexShrink:0,
                    background:i===0?"#FFD700":i===1?"#C0C0C0":i===2?"#CD7F32":G.gray4,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:12,fontWeight:700,color:i<3?G.white:G.gray1}}>{i+1}</div>
                  <div style={{flex:1,fontSize:13,fontWeight:t.id===teamId?700:500,color:G.black}}>
                    {t.name}{t.id===teamId?" (나)":""}
                  </div>
                  <div style={{fontSize:13,fontWeight:700,color:G.black}}>{fmt(t.total)}</div>
                </div>
              ))}
            </div>
            {(shared.phase==="ready"||shared.phase==="round")&&(
              <Btn onClick={()=>setScreen("main")} style={{width:"100%",padding:"14px",fontSize:15,borderRadius:12}}>계속하기 →</Btn>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ── 상세 ── */
  if(screen==="detail"&&detail){
    const st=detail;
    const cur=isBlind?null:getLivePrice(st);
    const displayPrice=isBlind?st.prices[Math.min(round-2,st.prices.length-1)]:cur;
    const prev=round<=1?st.prices[0]:st.prices[Math.min(round-2,st.prices.length-1)];
    const p=isBlind?0:pctOf(cur,prev),isUp=p>0;
    const h=holdings[st.id];
    const holding=h?.qty||0,avgPrice=h?.avgPrice||0;
    const effectiveCash=leverageEnabled?cash*leverageMax:cash;
    const maxQty=orderSide==="buy"?Math.floor(effectiveCash/Math.max(displayPrice||1,1)):holding;

    return(
      <div style={W.wrap}>
        <ConfirmModal show={confirm} onConfirm={doOrder} onCancel={()=>setConfirm(false)}
          side={orderSide} stock={st} qty={effectiveQty} price={displayPrice||0} fee={feeRate} leverage={leverage}/>
        <div style={{background:G.white,padding:"env(safe-area-inset-top, 14px) 18px 16px",position:"sticky",top:"env(safe-area-inset-top, 0)",zIndex:50,borderBottom:`1px solid ${G.border}`}}>
          {shared.notice&&<div style={{marginBottom:8}}><NoticeBanner notice={shared.notice}/></div>}
          {shared.activeEvent&&<div style={{marginBottom:8}}><EventBanner event={shared.activeEvent}/></div>}
          <div onClick={()=>setScreen("main")} style={{fontSize:13,color:G.gray1,marginBottom:8,cursor:"pointer"}}>← 뒤로</div>
          <div style={{fontSize:13,color:G.gray1,marginBottom:2}}>{st.emoji} {st.code}</div>
          <div style={{fontSize:20,fontWeight:800,color:G.black,marginBottom:4}}>{st.name}</div>
          {isBlind?(
            <div style={{fontSize:16,fontWeight:700,color:G.purple}}>🙈 블라인드 라운드 — 가격 숨김</div>
          ):(
            <div style={{display:"flex",alignItems:"baseline",gap:10}}>
              <div style={{fontSize:26,fontWeight:800,color:isUp?G.red:p<0?G.blue:G.black}}>{fmtN(cur)}</div>
              <div style={{fontSize:13,fontWeight:600,color:isUp?G.red:p<0?G.blue:G.gray1}}>{isUp?"▲ +":"▼ "}{p.toFixed(2)}%</div>
            </div>
          )}
          {shared.phase!=="round"&&<div style={{marginTop:4,fontSize:12,color:G.red,fontWeight:500}}>🔴 매매 시간이 아닙니다</div>}
          {st.listed===false&&<div style={{marginTop:4,fontSize:12,color:G.red,fontWeight:500}}>⛔ 폐지된 종목입니다</div>}
        </div>
        <div style={{paddingBottom:"env(safe-area-inset-bottom, 100px)",overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
          <div style={{background:G.white,padding:"14px 18px 8px",marginBottom:8}}>
            <div style={{fontSize:11,color:G.gray2,marginBottom:8,fontWeight:500}}>가격 추이</div>
            <LiveBigChart stock={st} round={round} maxRound={maxRound}
              roundStartedAt={shared.roundStartedAt} roundEndsAt={shared.roundEndsAt}
              activeEvent={shared.activeEvent} blind={isBlind}/>
          </div>
          {holding>0&&(
            <div style={{background:G.white,padding:"13px 18px",marginBottom:8,display:"flex",justifyContent:"space-between"}}>
              <div><div style={{fontSize:11,color:G.gray2,marginBottom:2}}>보유</div><div style={{fontSize:15,fontWeight:700,color:G.black}}>{holding}주</div></div>
              <div><div style={{fontSize:11,color:G.gray2,marginBottom:2}}>평단</div><div style={{fontSize:15,fontWeight:700,color:G.black}}>{fmtN(avgPrice)}</div></div>
              {!isBlind&&<div style={{textAlign:"right"}}><div style={{fontSize:11,color:G.gray2,marginBottom:2}}>손익</div>
                <div style={{fontSize:15,fontWeight:700,color:cur>avgPrice?G.red:G.blue}}>{cur>avgPrice?"+":""}{fmt((cur-avgPrice)*holding)}</div></div>}
            </div>
          )}
          {st.listed!==false&&(
            <div style={{background:G.white,padding:"14px 18px"}}>
              <div style={{display:"flex",gap:8,marginBottom:14}}>
                {["buy","sell"].map(side=>(
                  <button key={side} onClick={()=>{setOrderSide(side);setQty(1);setLeverage(1);}}
                    style={{flex:1,padding:"11px 0",borderRadius:10,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:14,fontWeight:700,transition:"all .15s",
                      background:orderSide===side?(side==="buy"?G.red:G.blue):G.bg,
                      color:orderSide===side?G.white:G.gray1}}>{side==="buy"?"매수":"매도"}</button>
                ))}
              </div>
              {/* 레버리지 선택 */}
              {leverageEnabled&&orderSide==="buy"&&(
                <div style={{background:G.orangeLight,borderRadius:10,padding:"10px 12px",marginBottom:12}}>
                  <div style={{fontSize:11,fontWeight:700,color:G.orange,marginBottom:6}}>⚡ 레버리지 (최대 x{leverageMax})</div>
                  <div style={{display:"flex",gap:6}}>
                    {Array.from({length:leverageMax},(_,i)=>i+1).map(lv=>(
                      <button key={lv} onClick={()=>setLeverage(lv)}
                        style={{flex:1,padding:"7px 0",borderRadius:8,border:"none",cursor:"pointer",fontFamily:"inherit",
                          fontSize:13,fontWeight:700,
                          background:leverage===lv?G.orange:G.white,
                          color:leverage===lv?G.white:G.orange}}>x{lv}</button>
                    ))}
                  </div>
                  {leverage>1&&<div style={{fontSize:11,color:G.orange,marginTop:4}}>수익·손실 모두 x{leverage} 적용</div>}
                </div>
              )}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <span style={{fontSize:14,color:G.gray1}}>수량</span>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <div onClick={()=>setQty(q=>Math.max(1,q-1))} style={{width:32,height:32,borderRadius:8,background:G.bg,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:20,userSelect:"none"}}>−</div>
                  <span style={{fontSize:18,fontWeight:700,color:G.black,minWidth:32,textAlign:"center"}}>{qty}</span>
                  <div onClick={()=>setQty(q=>Math.min(q+1,Math.floor(maxQty/leverage)||1))} style={{width:32,height:32,borderRadius:8,background:G.bg,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:20,userSelect:"none"}}>+</div>
                </div>
              </div>
              {leverage>1&&<div style={{fontSize:12,color:G.orange,textAlign:"right",marginBottom:6}}>실제 주문량: {effectiveQty}주 (x{leverage})</div>}
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                <span style={{fontSize:13,color:G.gray1}}>거래대금</span>
                <span style={{fontSize:15,fontWeight:700,color:G.black}}>{fmt((displayPrice||0)*effectiveQty)}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                <span style={{fontSize:12,color:G.gray1}}>수수료 ({feeRate}%)</span>
                <span style={{fontSize:12,color:G.gray1}}>-{fmt(feeAmt)}</span>
              </div>
              <div style={{fontSize:12,color:G.gray2,textAlign:"right",marginBottom:14}}>
                {orderSide==="buy"?`잔액 ${fmt(cash)}`:` 보유 ${holding}주`}
              </div>
              <Btn onClick={()=>setConfirm(true)} color={orderSide==="buy"?G.red:G.blue}
                style={{width:"100%",padding:"14px",fontSize:15,borderRadius:12}}>
                {orderSide==="buy"?"매수 주문":"매도 주문"}
              </Btn>
            </div>
          )}
        </div>
        <Toast {...toast}/>
      </div>
    );
  }

  /* ── 메인 ── */
  return(
    <div style={W.wrap}>
      <ConfirmModal show={confirm} onConfirm={doOrder} onCancel={()=>setConfirm(false)}
        side={orderSide} stock={detail} qty={effectiveQty} price={orderPrice} fee={feeRate} leverage={leverage}/>
      <div style={{background:G.white,padding:"env(safe-area-inset-top, 16px) 18px 0",position:"sticky",top:"env(safe-area-inset-top, 0)",zIndex:50,borderBottom:`1px solid ${G.border}`}}>
        {shared.notice&&<div style={{marginBottom:8}}><NoticeBanner notice={shared.notice}/></div>}
        {shared.activeEvent&&<div style={{marginBottom:8}}><EventBanner event={shared.activeEvent}/></div>}
        {isBlind&&<div style={{background:G.purpleLight,padding:"6px 14px",marginBottom:8,borderRadius:8}}>
          <span style={{fontSize:12,color:G.purple,fontWeight:700}}>🙈 블라인드 라운드 — 가격이 숨겨집니다</span>
        </div>}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
          <div>
            <div style={{fontSize:12,color:G.gray1,marginBottom:1}}>{teamName}팀</div>
            <div style={{fontSize:26,fontWeight:800,color:G.black,letterSpacing:-0.5}}>{fmt(total)}</div>
            <div style={{fontSize:13,fontWeight:600,color:diff>=0?G.red:G.blue,marginTop:1}}>
              {diff>=0?"▲ +":"▼ "}{fmt(Math.abs(diff))} ({diff>=0?"+":""}{diffPct}%)
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{background:shared.phase==="round"?G.greenLight:shared.phase==="break"?G.yellowLight:G.gray4,
              color:shared.phase==="round"?G.green:shared.phase==="break"?G.yellow:G.gray1,
              borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:600,marginBottom:3}}>
              {shared.phase==="ready"?"대기중":shared.phase==="round"?`Round ${shared.round}`:shared.phase==="break"?`R${shared.round} 종료`:"게임종료"}
            </div>
            {shared.phase==="round"&&rem!==null&&<div style={{fontSize:14,fontWeight:800,color:rem<=60?G.red:G.black,fontFamily:"monospace"}}>⏱ {secToStr(rem)}</div>}
          </div>
        </div>
        <div style={{display:"flex"}}>
          {[["market","시장"],["portfolio","보유"],["shop","상점 🛒"]].map(([key,label])=>(
            <div key={key} onClick={()=>setTab(key)} style={{flex:1,textAlign:"center",padding:"8px 0",fontSize:12,fontWeight:600,
              color:tab===key?G.blue:G.gray1,borderBottom:`2px solid ${tab===key?G.blue:"transparent"}`,cursor:"pointer",transition:"all .15s"}}>{label}</div>
          ))}
        </div>
      </div>

      <div style={{paddingBottom:"env(safe-area-inset-bottom, 24px)",overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
        {tab==="market"&&<>
          <div style={{padding:"10px 18px 5px",fontSize:12,color:G.gray1,fontWeight:500}}>
            종목 현황 {shared.phase==="round"?`· Round ${shared.round}`:""}
            {isBlind&&<span style={{color:G.purple,marginLeft:6}}>🙈 블라인드</span>}
          </div>
          {(shared.stocks||[]).filter(st=>st.listed!==false).map(st=>{
            const cur=isBlind?null:getLivePrice(st);
            const prev=round<=1?st.prices[0]:st.prices[Math.min(round-2,st.prices.length-1)];
            const p=isBlind?0:pctOf(cur,prev),isUp=p>0;
            return(
              <div key={st.id} onClick={()=>{setDetail(st);setOrderSide("buy");setQty(1);setLeverage(1);setScreen("detail");}}
                style={{background:G.white,display:"flex",alignItems:"center",padding:"13px 18px",borderBottom:`1px solid ${G.border}`,cursor:"pointer",gap:10}}>
                <div style={{width:40,height:40,borderRadius:11,background:G.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{st.emoji}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:700,color:G.black,marginBottom:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{st.name}</div>
                  <div style={{fontSize:11,color:G.gray2}}>{st.code}</div>
                </div>
                <LiveMiniChart stock={st} round={round} roundStartedAt={shared.roundStartedAt} roundEndsAt={shared.roundEndsAt} activeEvent={shared.activeEvent} blind={isBlind}/>
                <div style={{textAlign:"right",flexShrink:0,minWidth:72}}>
                  {isBlind
                    ?<div style={{fontSize:14,fontWeight:700,color:G.purple}}>???</div>
                    :<><div style={{fontSize:14,fontWeight:700,color:G.black,marginBottom:3}}>{fmtN(cur)}</div>
                      <div style={{fontSize:11,fontWeight:600,padding:"2px 7px",borderRadius:5,
                        background:isUp?G.redLight:p<0?G.blueLight:G.bg,color:isUp?G.red:p<0?G.blue:G.gray1}}>{isUp?"+":""}{p.toFixed(2)}%</div>
                    </>
                  }
                </div>
              </div>
            );
          })}
        </>}

        {tab==="portfolio"&&<>
          {/* 자산 구성 카드 */}
          <div style={{background:G.white,padding:"16px 18px",borderBottom:`1px solid ${G.border}`}}>
            <div style={{fontSize:12,color:G.gray1,marginBottom:10,fontWeight:500}}>자산 구성</div>
            <div style={{display:"flex",gap:8,marginBottom:10}}>
              <div style={{flex:1,background:G.blueLight,borderRadius:12,padding:"12px 14px"}}>
                <div style={{fontSize:11,color:G.blue,fontWeight:600,marginBottom:4}}>💵 보유 현금</div>
                <div style={{fontSize:16,fontWeight:800,color:G.black}}>{fmt(cash)}</div>
                <div style={{fontSize:11,color:G.gray1,marginTop:2}}>{total>0?((cash/total)*100).toFixed(1):0}%</div>
              </div>
              <div style={{flex:1,background:G.redLight,borderRadius:12,padding:"12px 14px"}}>
                <div style={{fontSize:11,color:G.red,fontWeight:600,marginBottom:4}}>📈 주식 평가액</div>
                <div style={{fontSize:16,fontWeight:800,color:G.black}}>{fmt(stockVal)}</div>
                <div style={{fontSize:11,color:G.gray1,marginTop:2}}>{total>0?((stockVal/total)*100).toFixed(1):0}%</div>
              </div>
            </div>
            {borrowed>0&&<div style={{background:G.orangeLight,borderRadius:10,padding:"8px 12px",marginBottom:8}}>
              <div style={{fontSize:11,color:G.orange,fontWeight:600}}>⚡ 레버리지 차입금: {fmt(borrowed)}</div>
            </div>}
            <div style={{height:6,borderRadius:3,background:G.border,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${total>0?(cash/total*100):100}%`,
                background:`linear-gradient(90deg,${G.blue},${G.purple})`,borderRadius:3,transition:"width .5s"}}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
              <span style={{fontSize:10,color:G.blue}}>현금 {total>0?((cash/total)*100).toFixed(1):0}%</span>
              <span style={{fontSize:10,color:G.red}}>주식 {total>0?((stockVal/total)*100).toFixed(1):0}%</span>
            </div>
          </div>
          <div style={{padding:"10px 18px 5px",fontSize:12,color:G.gray1,fontWeight:500}}>보유 종목</div>
          {(shared.stocks||[]).filter(st=>holdings[st.id]?.qty>0).length===0
            ?<div style={{background:G.white,textAlign:"center",color:G.gray2,padding:"36px 0",fontSize:14}}>보유 종목 없음</div>
            :(shared.stocks||[]).filter(st=>holdings[st.id]?.qty>0).map(st=>{
              const h=holdings[st.id];
              const cur=getCurrentPrice(st,round,shared.roundStartedAt,shared.roundEndsAt,shared.activeEvent);
              const ev2=cur*h.qty,pnl=ev2-h.avgPrice*h.qty;
              return(
                <div key={st.id} onClick={()=>{setDetail(st);setOrderSide("sell");setQty(1);setLeverage(1);setScreen("detail");}}
                  style={{background:G.white,padding:"13px 18px",borderBottom:`1px solid ${G.border}`,cursor:"pointer"}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <div style={{fontSize:14,fontWeight:700,color:G.black}}>{st.emoji} {st.name}</div>
                    <div style={{fontSize:14,fontWeight:700,color:pnl>=0?G.red:G.blue}}>{pnl>=0?"+":""}{fmt(pnl)}</div>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between"}}>
                    <span style={{fontSize:12,color:G.gray1}}>{h.qty}주 · 평단 {fmtN(h.avgPrice)}</span>
                    <span style={{fontSize:12,color:G.gray1}}>평가 {fmt(ev2)}</span>
                  </div>
                </div>
              );
            })
          }
        </>}

        {tab==="shop"&&<>
          <div style={{padding:"10px 18px 5px",fontSize:12,color:G.gray1,fontWeight:500}}>보유 현금 {fmt(cash)}</div>
          <div style={{padding:"0 14px 8px"}}>
            <div style={{background:G.purpleLight,borderRadius:11,padding:"11px 13px",fontSize:13,color:G.purple,fontWeight:500,lineHeight:1.5}}>
              💡 구매 즉시 힌트가 공개됩니다
            </div>
          </div>
          {(shared.shopItems||[]).map(item=>{
            const bought=purchases.includes(item.id);
            return(
              <div key={item.id} style={{background:G.white,marginBottom:1,padding:"15px 18px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10}}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                      <span style={{fontSize:19}}>{item.emoji}</span>
                      <span style={{fontSize:14,fontWeight:700,color:G.black}}>{item.name}</span>
                      {bought&&<span style={{fontSize:11,background:G.greenLight,color:G.green,borderRadius:20,padding:"2px 8px",fontWeight:600}}>구매완료</span>}
                    </div>
                    <div style={{fontSize:12,color:G.gray1,marginBottom:6,lineHeight:1.5}}>{item.desc}</div>
                    <div style={{fontSize:14,fontWeight:700,color:G.purple}}>{fmt(item.price)}</div>
                  </div>
                  <button onClick={()=>buyShop(item)} disabled={bought||cash<item.price}
                    style={{background:bought?G.greenLight:cash<item.price?G.bg:G.purple,
                      color:bought?G.green:cash<item.price?G.gray2:G.white,
                      border:"none",borderRadius:9,padding:"9px 14px",fontSize:12,fontWeight:700,
                      cursor:bought||cash<item.price?"not-allowed":"pointer",fontFamily:"inherit",flexShrink:0}}>
                    {bought?"✓":cash<item.price?"잔액부족":"구매"}
                  </button>
                </div>
                {bought&&(
                  <div style={{marginTop:10,padding:"12px 13px",background:"linear-gradient(135deg,#F0EEFF,#EBF3FE)",borderRadius:11,border:`1.5px solid ${G.purple}22`}}>
                    <div style={{fontSize:11,fontWeight:700,color:G.purple,marginBottom:5}}>🔓 공개된 힌트</div>
                    <div style={{fontSize:13,color:G.black,lineHeight:1.7,whiteSpace:"pre-wrap"}}>{item.hint}</div>
                  </div>
                )}
              </div>
            );
          })}
        </>}
      </div>
      <Toast {...toast}/>
    </div>
  );
}

/* ══════════════════════════════════════════
   관리자 로그인
══════════════════════════════════════════ */
function AdminLogin({onSuccess}){
  const [pw,setPw]=useState(""),[ err,setErr]=useState(false);
  const check=()=>{if(pw===ADMIN_PW)onSuccess();else setErr(true);};
  return(
    <div style={{...WRAP,display:"flex",flexDirection:"column",justifyContent:"center",padding:"0 24px"}}>
      <div style={{fontSize:26,fontWeight:800,color:G.black,marginBottom:8}}>운영자 로그인 🔐</div>
      <div style={{fontSize:14,color:G.gray1,marginBottom:24}}>관리자 비밀번호를 입력하세요</div>
      <input type="password" value={pw} onChange={e=>{setPw(e.target.value);setErr(false);}} placeholder="비밀번호"
        onKeyDown={e=>e.key==="Enter"&&check()}
        style={{border:`1.5px solid ${err?G.red:G.border}`,borderRadius:11,padding:"13px 14px",fontSize:15,fontFamily:"inherit",outline:"none",marginBottom:8,color:G.black}}/>
      {err&&<div style={{fontSize:13,color:G.red,marginBottom:8}}>비밀번호가 올바르지 않습니다</div>}
      <Btn onClick={check} color={G.black} style={{width:"100%",padding:"14px",fontSize:15,borderRadius:11}}>로그인</Btn>
    </div>
  );
}

/* ══════════════════════════════════════════
   진입점
══════════════════════════════════════════ */
export default function App(){
  const [mode,setMode]=useState("select");
  const [auth,setAuth]=useState(false);
  if(mode==="admin"){if(!auth)return <AdminLogin onSuccess={()=>setAuth(true)}/>;return <AdminApp/>;};
  if(mode==="user") return <UserApp/>;
  return(
    <div style={{...WRAP,display:"flex",flexDirection:"column",justifyContent:"center",padding:"0 24px"}}>
      <div style={{marginBottom:48}}>
        <div style={{fontSize:34,fontWeight:800,color:G.black,marginBottom:8,letterSpacing:-1}}>로(路)<br/>주식 게임</div>
        <div style={{fontSize:15,color:G.gray1,lineHeight:1.7}}>접속할 화면을 선택하세요</div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {[["user","👤 팀장 화면","팀 이름·비밀번호로 로그인",G.blue],
          ["admin","🛠 운영자 화면","라운드·설정·이벤트·계좌 관리",G.black]].map(([m,title,sub,bg])=>(
          <button key={m} onClick={()=>setMode(m)} style={{background:bg,color:G.white,border:"none",
            borderRadius:15,padding:"18px 20px",fontSize:15,fontWeight:700,cursor:"pointer",
            fontFamily:"inherit",textAlign:"left",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div><div style={{marginBottom:3}}>{title}</div><div style={{fontSize:12,fontWeight:400,opacity:.8}}>{sub}</div></div>
            <span style={{fontSize:20}}>→</span>
          </button>
        ))}
      </div>
    </div>
  );
}
