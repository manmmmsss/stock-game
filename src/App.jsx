import { useState, useEffect, useCallback } from "react";
import { db } from "./firebase";
import { ref, onValue, set as fbSet, get } from "firebase/database";

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

const STOCK_EMOJIS = ["💎","🟡","🟢","🚗","⚡","🏦","🛢️","✈️","🎮","🏥","🏭","🌐","🔋","💊","🎯"];
const SHOP_EMOJIS  = ["🔍","📊","🕵️","💡","📰","📈","🗝️","💰","🧩","⚠️","🎁","🔮","📡","🏆","🌟"];
const EVENT_EMOJIS = ["🦠","⚔️","🌊","🔥","💣","📉","🏦","⚡","🌪️","💥","🤖","💾","🏛️","🛑","📢","🧨","🌡️","💸","🔔","🚨"];

const uid = () => Math.random().toString(36).slice(2,8);
const pad2 = n => String(n).padStart(2,"0");
const secToStr = s => `${pad2(Math.floor(s/60))}:${pad2(s%60)}`;
const fmt  = n => "₩"+Math.round(n).toLocaleString("ko-KR");
const fmtN = n => Math.round(n).toLocaleString("ko-KR");
const pctOf = (cur,prev) => prev ? ((cur-prev)/prev*100) : 0;

/* ── 기본 종목 ── */
const INIT_STOCKS = [
  {id:"s1",name:"삼성전자",      code:"005930",emoji:"💎",prices:[65000,72000,58000]},
  {id:"s2",name:"카카오",        code:"035720",emoji:"🟡",prices:[45000,38000,51000]},
  {id:"s3",name:"네이버",        code:"035420",emoji:"🟢",prices:[180000,195000,172000]},
  {id:"s4",name:"현대자동차",    code:"005380",emoji:"🚗",prices:[95000,88000,103000]},
  {id:"s5",name:"LG에너지솔루션",code:"373220",emoji:"⚡",prices:[420000,445000,398000]},
];

const makeRound = r => ({id:`r${r}`,label:`Round ${r}`,durationMin:5});

/* ── 기본 상점 ── */
const INIT_SHOP = [
  {id:"sh1",name:"내부자 제보 A",  desc:"특정 종목의 다음 라운드 방향을 알려드립니다",price:800000, emoji:"🕵️",hint:"힌트를 설정해주세요"},
  {id:"sh2",name:"시장 분석 리포트",desc:"현재 라운드 전체 시장 흐름 분석 자료",      price:500000, emoji:"📊",hint:"힌트를 설정해주세요"},
  {id:"sh3",name:"VIP 정보 패키지",desc:"3라운드 전 종목 방향 + 추천 포트폴리오",    price:2000000,emoji:"💡",hint:"힌트를 설정해주세요"},
  {id:"sh4",name:"긴급 알림 구독", desc:"긴급 이벤트 발생 시 30초 먼저 알림",        price:300000, emoji:"🔔",hint:"힌트를 설정해주세요"},
];

/* ── 긴급 이벤트 기본 프리셋
   stockEffects: { [stockId]: number(%} } — 종목별 개별 효과
   globalEffect: number(%) — 모든 종목에 일괄 적용 (stockEffects가 없는 종목)
── */
const makeEventPresets = () => [
  {id:uid(),name:"코로나 팬데믹",   emoji:"🦠",desc:"전 세계 봉쇄령 발동",
   globalEffect:-15, stockEffects:{s1:-20,s2:-25,s3:-18,s4:-30,s5:+10},
   duration:0, triggerRound:0, note:"바이오 섹터 급등, 항공·소비재 급락"},
  {id:uid(),name:"전쟁 발발",       emoji:"⚔️",desc:"지정학적 리스크 고조",
   globalEffect:-10, stockEffects:{s4:+15,s5:+20,s1:-15,s2:-20,s3:-12},
   duration:0, triggerRound:0, note:"방산·원유 급등, 성장주 급락"},
  {id:uid(),name:"금리 인상 쇼크",  emoji:"📉",desc:"연준 긴급 금리 0.75% 인상",
   globalEffect:-12, stockEffects:{s1:-10,s2:-20,s3:-18,s4:-8,s5:-15},
   duration:0, triggerRound:0, note:"성장주 전반 급락"},
  {id:uid(),name:"AI 혁명 발표",    emoji:"🤖",desc:"초거대 AI 모델 공개 발표",
   globalEffect:+10, stockEffects:{s1:+25,s3:+30,s2:+15,s4:+5,s5:+20},
   duration:0, triggerRound:0, note:"기술주 전반 급등"},
  {id:uid(),name:"중앙은행 양적완화",emoji:"🏦",desc:"긴급 유동성 3조 달러 공급",
   globalEffect:+15, stockEffects:{},
   duration:0, triggerRound:0, note:"전 종목 일제 반등"},
  {id:uid(),name:"대규모 기업 스캔들",emoji:"💣",desc:"분식회계 및 횡령 발각",
   globalEffect:-20, stockEffects:{s2:-40,s3:-35,s1:-10,s4:-15,s5:-10},
   duration:0, triggerRound:0, note:"해당 기업 섹터 신뢰 붕괴"},
];

const ADMIN_PW = "admin1234";
const DEFAULT_INIT_CASH = 10_000_000;

/* ══════════════════════════════════════════
   공유 상태
══════════════════════════════════════════ */
const INIT_SS = {
  phase:"ready",
  round:0, maxRound:3,
  roundStartedAt:null, roundEndsAt:null,
  initCash:DEFAULT_INIT_CASH,
  stocks:INIT_STOCKS.map(s=>({...s,prices:[...s.prices]})),
  rounds:[makeRound(1),makeRound(2),makeRound(3)],
  shopItems:INIT_SHOP.map(s=>({...s})),
  eventPresets:makeEventPresets(),
  teams:{},       // { id: { name, pw, cash, holdings, purchases } }
  teamCredentials:{}, // { name: { id, pw } } — 관리자가 등록한 팀 계정
  bonusPool:{},
  activeEvent:null,
  eventHistory:[],
};

const GAME_REF = ref(db, "game");

// Firebase는 undefined를 저장 못하므로 제거
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
    // teams, holdings 같은 중첩 객체는 완전 교체
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
        // stocks 배열이 객체로 변환되는 Firebase 버그 방지
        if (val.stocks && !Array.isArray(val.stocks)) {
          val.stocks = Object.values(val.stocks);
        }
        if (val.shopItems && !Array.isArray(val.shopItems)) {
          val.shopItems = Object.values(val.shopItems);
        }
        if (val.rounds && !Array.isArray(val.rounds)) {
          val.rounds = Object.values(val.rounds);
        }
        if (val.eventPresets && !Array.isArray(val.eventPresets)) {
          val.eventPresets = Object.values(val.eventPresets);
        }
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
   실시간 주가 계산 (선형 보간 + 종목별 이벤트)
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
  let price=Math.round(prev+(target-prev)*t);
  if(activeEvent){
    const stockEffect=activeEvent.stockEffects?.[stock.id];
    const eff=stockEffect!==undefined?stockEffect:activeEvent.globalEffect??0;
    price=Math.round(price*(1+eff/100));
  }
  return Math.max(price,1);
}

/* ══════════════════════════════════════════
   공통 UI
══════════════════════════════════════════ */
let _tt=null;
const toast2=(setToast,msg)=>{setToast({msg,show:true});if(_tt)clearTimeout(_tt);_tt=setTimeout(()=>setToast(t=>({...t,show:false})),2500);};

function Toast({msg,show}){
  return <div style={{position:"fixed",bottom:80,left:"50%",
    transform:`translateX(-50%) translateY(${show?0:10}px)`,
    opacity:show?1:0,transition:"all .25s cubic-bezier(.34,1.56,.64,1)",
    background:G.black,color:"#fff",borderRadius:12,padding:"11px 20px",
    fontSize:13,fontWeight:500,whiteSpace:"nowrap",zIndex:9999,
    pointerEvents:"none",boxShadow:"0 8px 24px rgba(0,0,0,.2)"}}>{msg}</div>;
}

/* 매수/매도 확인 모달 */
function ConfirmModal({show,onConfirm,onCancel,side,stock,qty,price}){
  if(!show) return null;
  const isBuy=side==="buy";
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:1000,
      display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={onCancel}>
      <div onClick={e=>e.stopPropagation()} style={{background:G.white,borderRadius:"20px 20px 0 0",
        padding:"24px 20px 40px",width:"100%",maxWidth:"100%",boxShadow:"0 -8px 32px rgba(0,0,0,.15)"}}>
        <div style={{width:36,height:4,background:G.border,borderRadius:2,margin:"0 auto 20px"}}/>
        <div style={{fontSize:18,fontWeight:800,color:G.black,marginBottom:4}}>{isBuy?"매수":"매도"} 주문 확인</div>
        <div style={{fontSize:14,color:G.gray1,marginBottom:18}}>아래 내용으로 주문하시겠어요?</div>
        <div style={{background:G.bg,borderRadius:12,padding:"14px 16px",marginBottom:18}}>
          {[["종목",`${stock?.emoji} ${stock?.name}`],["구분",isBuy?"매수":"매도"],
            ["수량",`${qty}주`],["단가",`${fmtN(price)}원`],["총액",fmt(price*qty)]].map(([k,v])=>(
            <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${G.border}`}}>
              <span style={{fontSize:13,color:G.gray1}}>{k}</span>
              <span style={{fontSize:13,fontWeight:700,color:k==="총액"?(isBuy?G.red:G.blue):G.black}}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={onCancel} style={{flex:1,padding:"13px",borderRadius:12,border:"none",
            background:G.bg,color:G.gray1,fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>취소</button>
          <button onClick={onConfirm} style={{flex:2,padding:"13px",borderRadius:12,border:"none",
            background:isBuy?G.red:G.blue,color:G.white,fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
            {isBuy?"매수하기":"매도하기"}</button>
        </div>
      </div>
    </div>
  );
}

function EventBanner({event,stocks}){
  if(!event) return null;
  return (
    <div style={{background:`linear-gradient(135deg,${G.orange},${G.red})`,color:G.white,
      padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
      <span style={{fontSize:22,flexShrink:0}}>{event.emoji}</span>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:13,fontWeight:800,marginBottom:1}}>🚨 긴급: {event.name}</div>
        <div style={{fontSize:11,opacity:.9,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{event.desc}</div>
      </div>
      <div style={{textAlign:"right",flexShrink:0,fontSize:11}}>
        <div style={{fontWeight:800,fontSize:13,color:event.globalEffect>=0?"#FFD700":G.white}}>
          전체 {event.globalEffect>=0?"+":""}{event.globalEffect}%
        </div>
      </div>
    </div>
  );
}

const Btn=({children,color=G.blue,textColor=G.white,style:s,...p})=>(
  <button {...p} style={{background:color,color:textColor,border:"none",borderRadius:10,
    padding:"11px 14px",fontSize:13,fontWeight:700,cursor:"pointer",
    fontFamily:"inherit",transition:"opacity .15s",...s}}
    onMouseDown={e=>e.currentTarget.style.opacity=".75"}
    onMouseUp={e=>e.currentTarget.style.opacity="1"}>{children}</button>
);
const NumInput=({value,onChange,style:s,...p})=>(
  <input type="number" value={value} onChange={onChange} {...p}
    style={{width:"100%",border:`1.5px solid ${G.border}`,borderRadius:8,
      padding:"8px 6px",fontSize:13,fontFamily:"monospace",outline:"none",
      color:G.black,boxSizing:"border-box",textAlign:"center",...s}}/>
);
const TextInput=({value,onChange,placeholder,style:s,...p})=>(
  <input type="text" value={value} onChange={onChange} placeholder={placeholder} {...p}
    style={{width:"100%",border:`1.5px solid ${G.border}`,borderRadius:8,
      padding:"9px 10px",fontSize:13,fontFamily:"inherit",outline:"none",
      color:G.black,boxSizing:"border-box",...s}}/>
);

/* 실시간 미니차트 */
function LiveMiniChart({stock,round,roundStartedAt,roundEndsAt,activeEvent}){
  const [,tick]=useState(0);
  useEffect(()=>{const id=setInterval(()=>tick(t=>t+1),2000);return()=>clearInterval(id);},[]);
  if(!stock||stock.prices.length<1) return <div style={{width:52,height:24}}/>;
  const ri=Math.min(round-1,stock.prices.length-1);
  const prev=ri>0?stock.prices[ri-1]:stock.prices[0];
  const cur=getCurrentPrice(stock,round,roundStartedAt,roundEndsAt,activeEvent);
  const pts2=[...stock.prices.slice(0,ri),cur];
  if(pts2.length<2) return <div style={{width:52,height:24}}/>;
  const mn=Math.min(...pts2),mx=Math.max(...pts2),r=mx-mn||1,W=52,H=24;
  const pts=pts2.map((p,i)=>`${(i/(pts2.length-1))*W},${H-((p-mn)/r)*H}`).join(" ");
  return <svg width={W} height={H} style={{display:"block",flexShrink:0}}>
    <polyline points={pts} fill="none" stroke={cur>=prev?G.red:G.blue} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}

function LiveBigChart({stock,round,maxRound,roundStartedAt,roundEndsAt,activeEvent}){
  const [,tick]=useState(0);
  useEffect(()=>{const id=setInterval(()=>tick(t=>t+1),500);return()=>clearInterval(id);},[]);
  if(!stock) return null;
  const ri=Math.min(round-1,stock.prices.length-1);
  const cur=getCurrentPrice(stock,round,roundStartedAt,roundEndsAt,activeEvent);
  const points=[];
  for(let i=0;i<ri;i++) points.push({label:`R${i+1}`,price:stock.prices[i],live:false});
  points.push({label:`R${round}`,price:cur,live:true});
  const prices=points.map(p=>p.price);
  const mn=Math.min(...prices)*0.95,mx=Math.max(...prices)*1.05,rng=mx-mn||1,W=280,H=80;
  const pts=points.map((p,i)=>({...p,x:points.length===1?W/2:(i/(points.length-1))*W,y:H-((p.price-mn)/rng)*H}));
  const d=pts.map((p,i)=>`${i===0?"M":"L"}${p.x},${p.y}`).join(" ");
  const fill=d+` L${pts[pts.length-1].x},${H} L${pts[0].x},${H} Z`;
  const lc=cur>=(stock.prices[Math.max(ri-1,0)]||cur)?G.red:G.blue;
  return <svg width="100%" viewBox={`-16 -28 ${W+32} ${H+40}`} style={{overflow:"visible",display:"block"}}>
    <defs><linearGradient id={`gc${stock.id}`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={lc} stopOpacity="0.18"/>
      <stop offset="100%" stopColor={lc} stopOpacity="0"/>
    </linearGradient></defs>
    <path d={fill} fill={`url(#gc${stock.id})`}/>
    <path d={d} fill="none" stroke={lc} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    {pts.map((p,i)=><g key={i}>
      <circle cx={p.x} cy={p.y} r={p.live?5:3.5} fill={p.live?G.white:lc} stroke={lc} strokeWidth={p.live?2.5:1.5}/>
      <text x={p.x} y={p.y-12} textAnchor="middle" fontSize="9.5"
        fill={p.live?lc:G.gray1} fontFamily="inherit" fontWeight={p.live?"700":"500"}>{fmtN(p.price)}</text>
      <text x={p.x} y={H+16} textAnchor="middle" fontSize="9" fill={G.gray2} fontFamily="inherit">{p.label}</text>
    </g>)}
  </svg>;
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
  const [settingsTab,setSettingsTab]=useState("round");
  const [toast,setToast]=useState({msg:"",show:false});
  const t2=msg=>toast2(setToast,msg);

  // 로컬 편집
  const [stocks,setStocks]=useState(()=>INIT_STOCKS.map(s=>({...s,prices:[...s.prices]})));
  const [shopItems,setShopItems]=useState(()=>INIT_SHOP.map(s=>({...s})));
  const [rounds,setRounds]=useState(()=>[makeRound(1),makeRound(2),makeRound(3)]);
  const [maxRound,setMaxRound]=useState(3);
  const [initCash,setInitCash]=useState(DEFAULT_INIT_CASH);
  const [eventPresets,setEventPresets]=useState(()=>makeEventPresets());
  const [editingEvent,setEditingEvent]=useState(null); // null | event obj
  const [selTeam,setSelTeam]=useState(null);
  const [bonusIn,setBonusIn]=useState({});

  // 팀 계정 관리
  const [newTeamName,setNewTeamName]=useState("");
  const [newTeamPw,setNewTeamPw]=useState("");

  /* 종목 */
  const addStock=()=>setStocks(p=>[...p,{id:uid(),name:"새 종목",code:"000000",emoji:"🏦",prices:Array(maxRound).fill(100000)}]);
  const delStock=id=>setStocks(p=>p.filter(s=>s.id!==id));
  const updStock=(id,k,v)=>setStocks(p=>p.map(s=>s.id===id?{...s,[k]:v}:s));
  const updPrice=(id,ri,v)=>setStocks(p=>p.map(s=>s.id===id?{...s,prices:s.prices.map((x,i)=>i===ri?parseInt(v)||0:x)}:s));

  /* 라운드 수 */
  const changeMaxRound=n=>{
    const nr=Math.max(1,Math.min(10,n));
    setMaxRound(nr);
    setRounds(prev=>{const nx=[...prev];while(nx.length<nr)nx.push(makeRound(nx.length+1));return nx.slice(0,nr);});
    setStocks(p=>p.map(s=>{const pr=[...s.prices];while(pr.length<nr)pr.push(pr[pr.length-1]||100000);return{...s,prices:pr.slice(0,nr)};}));
  };
  const updRound=(id,k,v)=>setRounds(p=>p.map(r=>r.id===id?{...r,[k]:v}:r));

  /* 상점 */
  const addShop=()=>setShopItems(p=>[...p,{id:uid(),name:"새 항목",desc:"설명",price:500000,emoji:"🎁",hint:"힌트를 입력해주세요"}]);
  const delShop=id=>setShopItems(p=>p.filter(s=>s.id!==id));
  const updShop=(id,k,v)=>setShopItems(p=>p.map(s=>s.id===id?{...s,[k]:v}:s));

  /* 이벤트 프리셋 CRUD */
  const addEvent=()=>{
    const ne={id:uid(),name:"새 이벤트",emoji:"🚨",desc:"이벤트 설명",
      globalEffect:0,stockEffects:{},duration:0,triggerRound:0,note:""};
    setEventPresets(p=>[...p,ne]);
    setEditingEvent(ne);
  };
  const delEvent=id=>{setEventPresets(p=>p.filter(e=>e.id!==id));if(editingEvent?.id===id)setEditingEvent(null);};
  const updEvent=(id,k,v)=>{
    setEventPresets(p=>p.map(e=>e.id===id?{...e,[k]:v}:e));
    if(editingEvent?.id===id) setEditingEvent(ev=>({...ev,[k]:v}));
  };
  const updStockEffect=(evId,stockId,v)=>{
    setEventPresets(p=>p.map(e=>e.id===evId?{...e,stockEffects:{...e.stockEffects,[stockId]:parseInt(v)||0}}:e));
    if(editingEvent?.id===evId) setEditingEvent(ev=>({...ev,stockEffects:{...ev.stockEffects,[stockId]:parseInt(v)||0}}));
  };
  const clearStockEffect=(evId,stockId)=>{
    setEventPresets(p=>p.map(e=>{if(e.id!==evId)return e;const se={...e.stockEffects};delete se[stockId];return{...e,stockEffects:se};}));
    if(editingEvent?.id===evId) setEditingEvent(ev=>{const se={...ev.stockEffects};delete se[stockId];return{...ev,stockEffects:se};});
  };

  /* 설정 저장 */
  const saveSettings=()=>{
    setShared(s=>({...s,stocks:stocks.map(x=>({...x,prices:[...x.prices]})),
      shopItems:shopItems.map(x=>({...x})),rounds:rounds.map(x=>({...x})),
      eventPresets:eventPresets.map(x=>({...x})),maxRound,initCash}));
    t2("설정 저장됨 ✓");
  };

  /* 팀 계정 등록 */
  const addTeamAccount=()=>{
    const name=newTeamName.trim();
    const pw=newTeamPw.trim();
    if(!name||!pw){t2("팀 이름과 비밀번호를 입력해주세요");return;}
    if(shared.teamCredentials?.[name]){t2("이미 존재하는 팀 이름");return;}
    const id=uid();
    setShared(s=>({...s,
      teamCredentials:{...(s.teamCredentials||{}),[name]:{id,pw}},
      teams:{...s.teams,[id]:{name,cash:s.initCash||DEFAULT_INIT_CASH,holdings:{},purchases:[]}},
    }));
    setNewTeamName("");setNewTeamPw("");
    t2(`팀 "${name}" 등록 완료`);
  };
  const delTeamAccount=name=>{
    setShared(s=>{
      const creds={...(s.teamCredentials||{})};
      const id=creds[name]?.id;
      delete creds[name];
      const teams={...s.teams};
      if(id) delete teams[id];
      return{...s,teamCredentials:creds,teams};
    });
  };

  /* 라운드 제어 */
  const startRound=r=>{
    const rc=shared.rounds?.[r-1]||rounds[r-1];
    const dur=(rc?.durationMin||5)*60*1000;
    const now=Date.now();
    setShared(s=>({...s,phase:"round",round:r,roundStartedAt:now,roundEndsAt:now+dur,
      stocks:stocks.map(x=>({...x,prices:[...x.prices]})),
      shopItems:shopItems.map(x=>({...x})),
      rounds:rounds.map(x=>({...x})),
      eventPresets:eventPresets.map(x=>({...x})),maxRound,initCash}));
    t2(`Round ${r} 시작 (${rc?.durationMin||5}분)`);
  };
  const stopRound=()=>{setShared(s=>({...s,phase:"break",roundEndsAt:null,roundStartedAt:null}));t2("라운드 종료");};
  const endGame=()=>{setShared(s=>({...s,phase:"ended"}));t2("게임 종료");};
  const resetGame=()=>{
    setShared(()=>({...INIT_SS,
      stocks:stocks.map(x=>({...x,prices:[...x.prices]})),
      shopItems:shopItems.map(x=>({...x})),
      rounds:rounds.map(x=>({...x})),
      eventPresets:eventPresets.map(x=>({...x})),
      maxRound,initCash,
      teamCredentials:SS.teamCredentials||{},
      teams:Object.fromEntries(
        Object.entries(SS.teamCredentials||{}).map(([,{id}])=>
          [id,{...SS.teams?.[id],cash:initCash,holdings:{},purchases:[]}]
        )
      ),
    }));
    t2("게임 초기화 (팀 계정 유지)");
  };

  /* 이벤트 발동 */
  const applyEvent=ev=>{
    const event={...ev,appliedAt:Date.now()};
    setShared(s=>({...s,activeEvent:event,eventHistory:[...(s.eventHistory||[]),event]}));
    t2(`🚨 ${ev.name} 발동!`);
  };
  const clearEvent=()=>{setShared(s=>({...s,activeEvent:null}));t2("이벤트 해제");};

  /* 보너스 */
  const giveBonus=tid=>{
    const val=parseInt(bonusIn[tid])||0;
    if(!val){t2("금액을 입력하세요");return;}
    setShared(s=>({...s,
      bonusPool:{...(s.bonusPool||{}),[tid]:(s.bonusPool?.[tid]||0)+val},
      teams:{...s.teams,[tid]:{...s.teams[tid],cash:s.teams[tid].cash+val}}}));
    setBonusIn(b=>({...b,[tid]:""}));
    t2(`${fmt(val)} 지급`);
  };

  const getRank=()=>Object.entries(shared.teams||{}).map(([id,tm])=>{
    const r=Math.max(shared.round,1);
    const sv=Object.entries(tm.holdings||{}).reduce((acc,[sid,h])=>{
      const st=shared.stocks?.find(x=>x.id===sid);
      return acc+(st?st.prices[Math.min(r-1,st.prices.length-1)]*h.qty:0);
    },0);
    return{id,name:tm.name,total:tm.cash+sv,bonus:shared.bonusPool?.[id]||0};
  }).sort((a,b)=>b.total-a.total);

  const phaseLabel=shared.phase==="ready"?"대기중":shared.phase==="round"?`R${shared.round} 진행중`:shared.phase==="break"?`R${shared.round} 종료`:"게임종료";
  const phaseBg=shared.phase==="round"?G.greenLight:shared.phase==="break"?G.yellowLight:shared.phase==="ended"?G.redLight:G.gray4;
  const phaseColor=shared.phase==="round"?G.green:shared.phase==="break"?G.yellow:shared.phase==="ended"?G.red:G.gray1;
  const TABS=[["control","진행"],["settings","설정"],["teams","팀 관리"],["accounts","계좌"],["rank","순위"]];

  return (
    <div style={{background:G.bg,minHeight:"100vh",minHeightFallback:"100dvh",maxWidth:"430px",width:"100%",margin:"0 auto",overflowX:"hidden",fontFamily:"'Pretendard','Apple SD Gothic Neo',sans-serif"}}>
      <div style={{background:G.white,padding:"14px 16px 0",borderBottom:`1px solid ${G.border}`,position:"sticky",top:0,zIndex:50}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
          <div style={{background:G.black,color:G.white,borderRadius:6,padding:"2px 8px",fontSize:11,fontWeight:700}}>ADMIN</div>
          <span style={{fontSize:16,fontWeight:800,color:G.black}}>운영자 패널</span>
          <div style={{marginLeft:"auto",background:phaseBg,color:phaseColor,borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:600}}>{phaseLabel}</div>
        </div>
        {shared.activeEvent&&<div style={{marginBottom:6}}><EventBanner event={shared.activeEvent} stocks={shared.stocks}/></div>}
        <div style={{display:"flex",overflowX:"auto"}}>
          {TABS.map(([key,label])=>(
            <div key={key} onClick={()=>setTab(key)} style={{flexShrink:0,textAlign:"center",
              padding:"8px 14px",fontSize:12,fontWeight:600,
              color:tab===key?G.blue:G.gray1,
              borderBottom:`2px solid ${tab===key?G.blue:"transparent"}`,
              cursor:"pointer",transition:"all .15s"}}>{label}</div>
          ))}
        </div>
      </div>

      <div style={{padding:"14px 14px 100px"}}>

        {/* ══ 진행 탭 ══ */}
        {tab==="control"&&<>
          <div style={{background:G.white,borderRadius:14,padding:14,marginBottom:10}}>
            <div style={{fontSize:13,fontWeight:700,color:G.black,marginBottom:10}}>현재 상태</div>
            {[["단계",phaseLabel],["라운드",`${shared.round||0}/${shared.maxRound||3}`],
              ["참가팀",`${Object.keys(shared.teams||{}).length}팀`],["시작자금",fmt(shared.initCash||DEFAULT_INIT_CASH)]].map(([k,v])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${G.border}`}}>
                <span style={{fontSize:13,color:G.gray1}}>{k}</span>
                <span style={{fontSize:13,fontWeight:600,color:G.black}}>{v}</span>
              </div>
            ))}
          </div>

          <div style={{background:G.white,borderRadius:14,padding:14,marginBottom:10}}>
            <div style={{fontSize:13,fontWeight:700,color:G.black,marginBottom:10}}>라운드 제어 (총 {shared.maxRound||3}라운드)</div>
            {Array.from({length:shared.maxRound||3},(_,i)=>i+1).map(r=>{
              const rc=shared.rounds?.[r-1];
              const isActive=shared.round===r&&shared.phase==="round";
              return <div key={r} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                <div style={{width:28,height:28,borderRadius:"50%",flexShrink:0,
                  background:isActive?G.green:shared.round>r?G.gray3:G.bg,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:12,fontWeight:700,color:isActive?G.white:shared.round>r?G.white:G.gray2}}>
                  {shared.round>r?"✓":r}
                </div>
                <div style={{flex:1,fontSize:13,fontWeight:600,color:G.black}}>
                  Round {r} <span style={{fontSize:11,color:G.gray1,fontWeight:400}}>({rc?.durationMin||5}분)</span>
                </div>
                <Btn onClick={()=>startRound(r)} color={isActive?G.green:G.blue} style={{padding:"7px 14px",fontSize:12}}>
                  {isActive?"진행중":shared.round>r?"재시작":"시작"}
                </Btn>
              </div>;
            })}
          </div>

          <div style={{display:"flex",gap:8,marginBottom:10}}>
            <Btn onClick={stopRound} color={G.yellow} textColor={G.black} style={{flex:1,padding:"12px 0"}}>라운드 종료</Btn>
            <Btn onClick={endGame} color={G.black} style={{flex:1,padding:"12px 0"}}>게임 종료</Btn>
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
                <div style={{fontSize:11,color:G.gray1,marginTop:2}}>{shared.activeEvent.note||shared.activeEvent.desc}</div>
              </div>
            )}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {(shared.eventPresets||eventPresets).map(ev=>(
                <div key={ev.id} onClick={()=>applyEvent(ev)}
                  style={{background:G.bg,borderRadius:10,padding:"10px",cursor:"pointer",
                    border:`1.5px solid ${shared.activeEvent?.id===ev.id?G.orange:G.border}`,
                    transition:"all .15s"}}>
                  <div style={{fontSize:18,marginBottom:3}}>{ev.emoji}</div>
                  <div style={{fontSize:12,fontWeight:700,color:G.black,marginBottom:2}}>{ev.name}</div>
                  <div style={{fontSize:11,color:G.gray1,marginBottom:3,lineHeight:1.4}}>{ev.desc}</div>
                  <div style={{fontSize:11,fontWeight:600,color:ev.globalEffect>=0?G.red:G.blue}}>
                    전체 {ev.globalEffect>=0?"+":""}{ev.globalEffect}%
                  </div>
                  {Object.keys(ev.stockEffects||{}).length>0&&(
                    <div style={{fontSize:10,color:G.gray2,marginTop:2}}>개별 설정 {Object.keys(ev.stockEffects).length}개</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <Btn onClick={resetGame} color={G.redLight} textColor={G.red} style={{width:"100%",padding:"12px",fontSize:13}}>
            게임 초기화 (팀 계정 유지)
          </Btn>
        </>}

        {/* ══ 설정 탭 ══ */}
        {tab==="settings"&&<>
          <div style={{background:G.white,borderRadius:14,marginBottom:10,overflow:"hidden"}}>
            <div style={{display:"flex"}}>
              {[["round","라운드"],["stocks","종목"],["shop","상점"],["event","이벤트"]].map(([key,label])=>(
                <div key={key} onClick={()=>setSettingsTab(key)} style={{
                  flex:1,textAlign:"center",padding:"10px 0",fontSize:12,fontWeight:600,
                  color:settingsTab===key?G.blue:G.gray1,
                  borderBottom:`2px solid ${settingsTab===key?G.blue:"transparent"}`,
                  cursor:"pointer",transition:"all .15s"}}>{label}</div>
              ))}
            </div>
          </div>

          {/* 라운드 설정 */}
          {settingsTab==="round"&&<>
            <div style={{background:G.white,borderRadius:14,padding:14,marginBottom:10}}>
              <div style={{fontSize:13,fontWeight:700,color:G.black,marginBottom:10}}>게임 기본 설정</div>
              <div style={{display:"flex",gap:8}}>
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
            </div>
            <div style={{background:G.white,borderRadius:14,padding:14,marginBottom:10}}>
              <div style={{fontSize:13,fontWeight:700,color:G.black,marginBottom:10}}>라운드별 매매 시간</div>
              {rounds.map((r,i)=>(
                <div key={r.id} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                  <div style={{width:48,fontSize:13,fontWeight:600,color:G.black,flexShrink:0}}>R{i+1}</div>
                  <NumInput value={r.durationMin} onChange={e=>updRound(r.id,"durationMin",parseInt(e.target.value)||1)} style={{width:64}}/>
                  <span style={{fontSize:13,color:G.gray1}}>분</span>
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
                    <TextInput value={s.code} onChange={e=>updStock(s.id,"code",e.target.value)} placeholder="코드" style={{width:72}}/>
                    <div onClick={()=>delStock(s.id)} style={{width:32,height:34,borderRadius:7,background:G.redLight,color:G.red,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:16,flexShrink:0,fontWeight:700}}>×</div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(maxRound,4)},1fr)`,gap:6}}>
                    {Array.from({length:maxRound},(_,ri)=>(
                      <div key={ri}>
                        <div style={{fontSize:10,color:G.gray2,marginBottom:3,textAlign:"center",fontWeight:500}}>R{ri+1} 목표가</div>
                        <NumInput value={s.prices[ri]??0} onChange={e=>updPrice(s.id,ri,e.target.value)}/>
                      </div>
                    ))}
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
                    <TextInput value={item.desc} onChange={e=>updShop(item.id,"desc",e.target.value)} placeholder="구매 전에 보이는 설명"/>
                  </div>
                  <div>
                    <div style={{fontSize:11,color:G.purple,fontWeight:600,marginBottom:3}}>🔒 구매 후 공개 힌트</div>
                    <textarea value={item.hint} onChange={e=>updShop(item.id,"hint",e.target.value)}
                      placeholder="구매 후 공개될 힌트 내용" rows={3}
                      style={{width:"100%",border:`1.5px solid ${G.purple}`,borderRadius:8,padding:"9px 10px",
                        fontSize:13,fontFamily:"inherit",outline:"none",color:G.black,
                        boxSizing:"border-box",resize:"vertical",lineHeight:1.6,background:G.purpleLight}}/>
                  </div>
                </div>
              ))}
            </div>
            <Btn onClick={saveSettings} color={G.purple} style={{width:"100%",padding:"13px",fontSize:14}}>상점 설정 저장</Btn>
          </>}

          {/* ── 이벤트 설정 ── */}
          {settingsTab==="event"&&<>
            <div style={{background:G.white,borderRadius:14,padding:14,marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div style={{fontSize:13,fontWeight:700,color:G.black}}>이벤트 프리셋 ({eventPresets.length}개)</div>
                <Btn onClick={addEvent} color={G.green} style={{padding:"6px 12px",fontSize:12}}>+ 추가</Btn>
              </div>

              {/* 이벤트 목록 */}
              {eventPresets.map(ev=>(
                <div key={ev.id} style={{marginBottom:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",
                    background:editingEvent?.id===ev.id?G.blueLight:G.bg,
                    borderRadius:10,cursor:"pointer",border:`1.5px solid ${editingEvent?.id===ev.id?G.blue:G.border}`}}
                    onClick={()=>setEditingEvent(editingEvent?.id===ev.id?null:ev)}>
                    <span style={{fontSize:20}}>{ev.emoji}</span>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:700,color:G.black}}>{ev.name}</div>
                      <div style={{fontSize:11,color:G.gray1}}>{ev.desc}</div>
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{fontSize:12,fontWeight:600,color:ev.globalEffect>=0?G.red:G.blue}}>전체 {ev.globalEffect>=0?"+":""}{ev.globalEffect}%</div>
                      {Object.keys(ev.stockEffects||{}).length>0&&<div style={{fontSize:10,color:G.gray2}}>개별 {Object.keys(ev.stockEffects).length}개</div>}
                    </div>
                    <div onClick={e=>{e.stopPropagation();delEvent(ev.id);}}
                      style={{width:28,height:28,borderRadius:7,background:G.redLight,color:G.red,
                        display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:14,flexShrink:0,fontWeight:700}}>×</div>
                  </div>

                  {/* 이벤트 상세 편집 */}
                  {editingEvent?.id===ev.id&&(
                    <div style={{background:G.white,border:`1.5px solid ${G.blue}`,borderRadius:12,
                      padding:14,marginTop:6}}>
                      <div style={{fontSize:12,fontWeight:700,color:G.blue,marginBottom:10}}>✏️ 이벤트 상세 설정</div>

                      {/* 기본 정보 */}
                      <div style={{display:"flex",gap:6,marginBottom:8,alignItems:"center"}}>
                        <select value={ev.emoji} onChange={e=>updEvent(ev.id,"emoji",e.target.value)}
                          style={{width:40,height:34,border:`1.5px solid ${G.border}`,borderRadius:7,fontSize:16,textAlign:"center",background:G.white,outline:"none",cursor:"pointer",flexShrink:0}}>
                          {EVENT_EMOJIS.map(em=><option key={em} value={em}>{em}</option>)}
                        </select>
                        <TextInput value={ev.name} onChange={e=>updEvent(ev.id,"name",e.target.value)} placeholder="이벤트 이름" style={{flex:1}}/>
                      </div>
                      <div style={{marginBottom:8}}>
                        <div style={{fontSize:11,color:G.gray2,marginBottom:3}}>공개 설명 (팀장 화면 표시)</div>
                        <TextInput value={ev.desc} onChange={e=>updEvent(ev.id,"desc",e.target.value)} placeholder="이벤트 공개 설명"/>
                      </div>
                      <div style={{marginBottom:8}}>
                        <div style={{fontSize:11,color:G.gray2,marginBottom:3}}>운영자 메모 (내부용)</div>
                        <TextInput value={ev.note||""} onChange={e=>updEvent(ev.id,"note",e.target.value)} placeholder="내부 메모"/>
                      </div>

                      {/* 전체 효과 */}
                      <div style={{background:G.bg,borderRadius:10,padding:"10px 12px",marginBottom:10}}>
                        <div style={{fontSize:12,fontWeight:600,color:G.black,marginBottom:8}}>전체 종목 기본 효과 (%)</div>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <NumInput value={ev.globalEffect} onChange={e=>updEvent(ev.id,"globalEffect",parseInt(e.target.value)||0)} style={{width:80}}/>
                          <span style={{fontSize:12,color:G.gray1}}>% (개별 설정 없는 종목에 적용)</span>
                        </div>
                      </div>

                      {/* 종목별 개별 효과 */}
                      <div style={{marginBottom:8}}>
                        <div style={{fontSize:12,fontWeight:600,color:G.black,marginBottom:8}}>종목별 개별 효과 설정</div>
                        <div style={{fontSize:11,color:G.gray2,marginBottom:8}}>설정하면 전체 효과 대신 이 값이 적용됩니다</div>
                        {stocks.map(s=>{
                          const hasCustom=ev.stockEffects?.[s.id]!==undefined;
                          return <div key={s.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                            <div style={{width:110,fontSize:12,color:G.black,display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
                              <span>{s.emoji}</span><span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</span>
                            </div>
                            <NumInput value={hasCustom?ev.stockEffects[s.id]:""}
                              onChange={e=>updStockEffect(ev.id,s.id,e.target.value)}
                              placeholder={`기본(${ev.globalEffect}%)`}
                              style={{flex:1,background:hasCustom?G.blueLight:G.white}}/>
                            <span style={{fontSize:11,color:G.gray2,flexShrink:0}}>%</span>
                            {hasCustom&&<div onClick={()=>clearStockEffect(ev.id,s.id)}
                              style={{fontSize:11,color:G.red,cursor:"pointer",flexShrink:0,padding:"2px 6px",
                                background:G.redLight,borderRadius:5}}>초기화</div>}
                          </div>;
                        })}
                      </div>

                      {/* 발동 라운드 (옵션) */}
                      <div style={{borderTop:`1px solid ${G.border}`,paddingTop:10}}>
                        <div style={{fontSize:12,fontWeight:600,color:G.black,marginBottom:6}}>발동 조건 (선택)</div>
                        <div style={{display:"flex",gap:8,alignItems:"center"}}>
                          <span style={{fontSize:12,color:G.gray1,flexShrink:0}}>라운드</span>
                          <NumInput value={ev.triggerRound||0}
                            onChange={e=>updEvent(ev.id,"triggerRound",parseInt(e.target.value)||0)}
                            style={{width:60}} placeholder="0"/>
                          <span style={{fontSize:11,color:G.gray2}}>라운드에 자동 발동 (0=수동)</span>
                        </div>
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
            <div style={{fontSize:12,color:G.gray1,marginBottom:10,lineHeight:1.6,background:G.blueLight,borderRadius:8,padding:"8px 10px"}}>
              💡 팀 이름과 비밀번호를 설정하면 팀장이 해당 정보로 로그인합니다.<br/>게임 데이터가 팀 이름에 연결되어 저장됩니다.
            </div>
            <div style={{display:"flex",gap:6,marginBottom:6}}>
              <TextInput value={newTeamName} onChange={e=>setNewTeamName(e.target.value)} placeholder="팀 이름 (예: 드림팀)" style={{flex:1}}/>
            </div>
            <div style={{display:"flex",gap:6,marginBottom:10}}>
              <TextInput value={newTeamPw} onChange={e=>setNewTeamPw(e.target.value)} placeholder="비밀번호 (예: dream123)" style={{flex:1}}/>
              <Btn onClick={addTeamAccount} color={G.blue} style={{flexShrink:0,padding:"9px 14px",fontSize:13}}>등록</Btn>
            </div>
          </div>

          <div style={{background:G.white,borderRadius:14,padding:14}}>
            <div style={{fontSize:13,fontWeight:700,color:G.black,marginBottom:10}}>
              등록된 팀 ({Object.keys(shared.teamCredentials||{}).length}팀)
            </div>
            {Object.keys(shared.teamCredentials||{}).length===0
              ?<div style={{textAlign:"center",color:G.gray2,padding:"24px 0",fontSize:13}}>등록된 팀이 없습니다</div>
              :Object.entries(shared.teamCredentials||{}).map(([name,{id,pw}])=>{
                const tm=shared.teams?.[id];
                const r=Math.max(shared.round,1);
                const sv=Object.entries(tm?.holdings||{}).reduce((acc,[sid,h])=>{
                  const st=shared.stocks?.find(x=>x.id===sid);
                  return acc+(st?st.prices[Math.min(r-1,st.prices.length-1)]*h.qty:0);
                },0);
                return <div key={name} style={{padding:"10px 0",borderBottom:`1px solid ${G.border}`,
                  display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:700,color:G.black}}>{name}</div>
                    <div style={{fontSize:11,color:G.gray2,fontFamily:"monospace",marginTop:1}}>PW: {pw}</div>
                    {tm&&<div style={{fontSize:11,color:G.gray1,marginTop:1}}>자산: {fmt((tm.cash||0)+sv)}</div>}
                  </div>
                  <div onClick={()=>delTeamAccount(name)}
                    style={{padding:"5px 10px",borderRadius:7,background:G.redLight,color:G.red,
                      cursor:"pointer",fontSize:12,fontWeight:600}}>삭제</div>
                </div>;
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
              return <div key={id} style={{background:G.white,borderRadius:14,marginBottom:8,overflow:"hidden"}}>
                <div onClick={()=>setSelTeam(isOpen?null:id)}
                  style={{padding:"13px 14px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:14,fontWeight:700,color:G.black}}>{tm.name}</div>
                    <div style={{fontSize:11,color:G.gray1,marginTop:1}}>총 자산 {fmt(tm.cash+sv)}</div>
                  </div>
                  <span style={{color:G.gray2,fontSize:14}}>{isOpen?"▲":"▼"}</span>
                </div>
                {isOpen&&<div style={{padding:"0 14px 14px",borderTop:`1px solid ${G.border}`}}>
                  <div style={{display:"flex",gap:6,marginTop:10,marginBottom:10}}>
                    {[["현금",fmt(tm.cash)],["주식",fmt(sv)],["보너스",fmt(shared.bonusPool?.[id]||0)]].map(([k,v])=>(
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
                    return <div key={sid} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${G.border}`}}>
                      <span style={{fontSize:12,color:G.black}}>{st.emoji} {st.name} <span style={{color:G.gray2}}>{h.qty}주</span></span>
                      <span style={{fontSize:12,fontWeight:600,color:(cur-h.avgPrice)*h.qty>=0?G.red:G.blue}}>{(cur-h.avgPrice)*h.qty>=0?"+":""}{fmt((cur-h.avgPrice)*h.qty)}</span>
                    </div>;
                  })}
                  {(tm.purchases||[]).length>0&&<div style={{marginTop:8}}>
                    <div style={{fontSize:11,color:G.gray1,marginBottom:3}}>구매 정보</div>
                    {(tm.purchases||[]).map(pid=>{const it=shared.shopItems?.find(x=>x.id===pid);return it?<div key={pid} style={{fontSize:12,color:G.gray1,padding:"2px 0"}}>{it.emoji} {it.name}</div>:null;})}
                  </div>}
                  <div style={{marginTop:10,background:G.yellowLight,borderRadius:10,padding:"10px 12px"}}>
                    <div style={{fontSize:11,fontWeight:700,color:G.yellow,marginBottom:7}}>💰 보너스 지급</div>
                    <div style={{display:"flex",gap:6,marginBottom:6}}>
                      <NumInput value={bonusIn[id]||""} onChange={e=>setBonusIn(b=>({...b,[id]:e.target.value}))} placeholder="금액" style={{flex:1,textAlign:"left"}}/>
                      <Btn onClick={()=>giveBonus(id)} color={G.yellow} textColor={G.black} style={{padding:"8px 12px",fontSize:12,flexShrink:0}}>지급</Btn>
                    </div>
                    <div style={{display:"flex",gap:5}}>
                      {[100000,500000,1000000].map(v=>(
                        <div key={v} onClick={()=>setBonusIn(b=>({...b,[id]:String(v)}))}
                          style={{flex:1,background:G.white,border:`1px solid ${G.border}`,borderRadius:6,
                            padding:"5px",fontSize:11,textAlign:"center",cursor:"pointer",color:G.gray1}}>
                          +{v>=1000000?(v/1000000)+"백만":(v/10000)+"만"}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>}
              </div>;
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
   사용자 앱 (팀 이름 + 비밀번호 로그인)
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
  const [confirm,setConfirm]=useState(false);
  const [toast,setToast]=useState({msg:"",show:false});
  const t2=msg=>toast2(setToast,msg);

  useEffect(()=>{
    if(screen==="main"&&shared.phase==="ended") setScreen("ended");
    // 운영자가 게임 초기화하면 ended → main으로 복귀
    if(screen==="ended"&&shared.phase==="ready") setScreen("main");
    // 운영자가 초기화하면 팀 데이터도 갱신되므로 탭 초기화
    if(screen==="ended"&&shared.phase==="round") setScreen("main");
  },[shared.phase,screen]);

  const myTeam=teamId?shared.teams?.[teamId]:null;
  const initCash=shared.initCash||DEFAULT_INIT_CASH;
  const cash=myTeam?.cash??initCash;
  const holdings=myTeam?.holdings??{};
  const purchases=myTeam?.purchases??[];
  const round=Math.max(shared.round,1);
  const maxRound=shared.maxRound||3;
  const rem=useRoundTimer(shared.phase,shared.roundEndsAt);

  const getLivePrice=useCallback(st=>getCurrentPrice(st,round,shared.roundStartedAt,shared.roundEndsAt,shared.activeEvent),
    [round,shared.roundStartedAt,shared.roundEndsAt,shared.activeEvent]);

  const totalAsset=useCallback(()=>{
    let t=cash;
    for(const [sid,h] of Object.entries(holdings)){
      const s=shared.stocks?.find(x=>x.id===sid);
      if(s&&h.qty>0) t+=getLivePrice(s)*h.qty;
    }
    return t;
  },[cash,holdings,shared.stocks,getLivePrice]);

  /* 로그인: teamCredentials에서 팀 이름+비번 확인 */
  const doLogin=()=>{
    const name=loginName.trim();
    const pw=loginPw.trim();
    if(!name||!pw){setLoginErr("팀 이름과 비밀번호를 입력해주세요");return;}
    const cred=shared.teamCredentials?.[name];
    if(!cred){setLoginErr("등록되지 않은 팀 이름입니다");return;}
    if(cred.pw!==pw){setLoginErr("비밀번호가 올바르지 않습니다");return;}
    setTeamId(cred.id);
    setTeamName(name);
    setLoginErr("");
    setScreen("main");
  };

  const updTeam=fn=>setShared(s=>({...s,teams:{...s.teams,[teamId]:fn(s.teams[teamId])}}));
  const orderPrice=detail?getLivePrice(detail):0;

  const doOrder=()=>{
    if(shared.phase!=="round"){t2("현재 매매 시간이 아닙니다");setConfirm(false);return;}
    const s=detail;
    const cur=orderPrice;
    const cost=cur*qty;
    if(orderSide==="buy"){
      if(cost>cash){t2("잔액이 부족합니다");setConfirm(false);return;}
      updTeam(t=>{
        const h=t.holdings[s.id]||{qty:0,avgPrice:0};
        const nq=h.qty+qty,na=Math.round((h.avgPrice*h.qty+cur*qty)/nq);
        return{...t,cash:t.cash-cost,holdings:{...t.holdings,[s.id]:{qty:nq,avgPrice:na}}};
      });
      t2(`${s.name} ${qty}주 매수 완료`);
    } else {
      const h=holdings[s.id];
      if(!h||h.qty<qty){t2("보유 수량 부족");setConfirm(false);return;}
      updTeam(t=>({...t,cash:t.cash+cost,holdings:{...t.holdings,[s.id]:{...t.holdings[s.id],qty:t.holdings[s.id].qty-qty}}}));
      t2(`${s.name} ${qty}주 매도 완료`);
    }
    setQty(1);setConfirm(false);
  };

  const buyShop=item=>{
    const latest=(shared.shopItems||[]).find(x=>x.id===item.id)||item;
    if(purchases.includes(latest.id)){t2("이미 구매한 항목");return;}
    if(cash<latest.price){t2("잔액 부족");return;}
    updTeam(t=>({...t,cash:t.cash-latest.price,purchases:[...(t.purchases||[]),latest.id]}));
    t2(`${latest.name} 구매 완료!`);
  };

  const total=totalAsset(),diff=total-initCash,diffPct=((diff/initCash)*100).toFixed(2);
  const W={wrap:{background:G.bg,minHeight:"100vh",minHeightFallback:"100dvh",maxWidth:"430px",width:"100%",margin:"0 auto",overflowX:"hidden",fontFamily:"'Pretendard','Apple SD Gothic Neo',sans-serif"}};

  /* ── 로그인 ── */
  if(screen==="login") return (
    <div style={W.wrap}>
      <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",justifyContent:"center",padding:"0 24px",background:G.white}}>
        <div style={{marginBottom:36}}>
          <div style={{fontSize:30,fontWeight:800,color:G.black,marginBottom:8,letterSpacing:-1}}>로(路) 주식 게임 🏦</div>
          <div style={{fontSize:15,color:G.gray1,lineHeight:1.7}}>운영자에게 받은 팀 정보로<br/>로그인하세요</div>
        </div>
        <div style={{marginBottom:12}}>
          <div style={{fontSize:13,fontWeight:600,color:G.gray1,marginBottom:6}}>팀 이름</div>
          <input value={loginName} onChange={e=>{setLoginName(e.target.value);setLoginErr("");}}
            placeholder="예) 드림팀" maxLength={20}
            onKeyDown={e=>e.key==="Enter"&&doLogin()}
            style={{width:"100%",border:`1.5px solid ${loginErr?G.red:G.border}`,borderRadius:12,
              padding:"14px 16px",fontSize:15,fontFamily:"inherit",outline:"none",
              color:G.black,boxSizing:"border-box"}}/>
        </div>
        <div style={{marginBottom:16}}>
          <div style={{fontSize:13,fontWeight:600,color:G.gray1,marginBottom:6}}>비밀번호</div>
          <input type="password" value={loginPw} onChange={e=>{setLoginPw(e.target.value);setLoginErr("");}}
            placeholder="운영자에게 받은 비밀번호"
            onKeyDown={e=>e.key==="Enter"&&doLogin()}
            style={{width:"100%",border:`1.5px solid ${loginErr?G.red:G.border}`,borderRadius:12,
              padding:"14px 16px",fontSize:15,fontFamily:"inherit",outline:"none",
              color:G.black,boxSizing:"border-box"}}/>
        </div>
        {loginErr&&<div style={{fontSize:13,color:G.red,marginBottom:10,padding:"10px 12px",background:G.redLight,borderRadius:8}}>{loginErr}</div>}
        <Btn onClick={doLogin} style={{width:"100%",padding:"15px",fontSize:16,borderRadius:12}}>게임 입장</Btn>
        <div style={{textAlign:"center",marginTop:16,fontSize:12,color:G.gray2}}>
          팀 정보는 운영자에게 문의하세요
        </div>
      </div>
      <Toast {...toast}/>
    </div>
  );

  /* ── 종료 ── */
  if(screen==="ended"){
    const fd=totalAsset()-initCash;
    const rank = Object.entries(shared.teams||{}).map(([id,tm])=>{
      const sv=Object.entries(tm.holdings||{}).reduce((acc,[sid,h])=>{
        const st=shared.stocks?.find(x=>x.id===sid);
        return acc+(st?st.prices[st.prices.length-1]*h.qty:0);
      },0);
      return{id,name:tm.name,total:tm.cash+sv};
    }).sort((a,b)=>b.total-a.total);

    const myRank = rank.findIndex(r=>r.id===teamId)+1;

    return <div style={W.wrap}>
      <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",background:G.white}}>
        {/* 상단 결과 카드 */}
        <div style={{background:`linear-gradient(135deg,${G.blue},${G.purple})`,padding:"40px 24px 32px",textAlign:"center"}}>
          <div style={{fontSize:48,marginBottom:12}}>{fd>=0?"🏆":"📉"}</div>
          <div style={{fontSize:22,fontWeight:800,color:G.white,marginBottom:4}}>게임 종료!</div>
          <div style={{fontSize:14,color:"rgba(255,255,255,0.8)",marginBottom:20}}>{teamName}팀 최종 결과</div>
          <div style={{background:"rgba(255,255,255,0.15)",borderRadius:16,padding:"16px 20px",display:"inline-block",minWidth:200}}>
            <div style={{fontSize:12,color:"rgba(255,255,255,0.7)",marginBottom:4}}>최종 총 자산</div>
            <div style={{fontSize:28,fontWeight:800,color:G.white,marginBottom:4}}>{fmt(totalAsset())}</div>
            <div style={{fontSize:15,fontWeight:600,color:fd>=0?"#FFD700":"#FF8080"}}>
              {fd>=0?"+":""}{fmt(fd)} ({fd>=0?"+":""}{((fd/initCash)*100).toFixed(2)}%)
            </div>
          </div>
          {myRank>0&&<div style={{marginTop:12,fontSize:13,color:"rgba(255,255,255,0.9)",fontWeight:600}}>
            전체 {rank.length}팀 중 {myRank}위 {myRank===1?"🥇":myRank===2?"🥈":myRank===3?"🥉":""}
          </div>}
        </div>

        {/* 내 포트폴리오 */}
        <div style={{padding:"16px 16px 0"}}>
          <div style={{fontSize:13,fontWeight:700,color:G.black,marginBottom:8}}>내 최종 포트폴리오</div>
          <div style={{background:G.white,borderRadius:14,overflow:"hidden",marginBottom:12,border:`1px solid ${G.border}`}}>
            <div style={{padding:"12px 16px",display:"flex",justifyContent:"space-between",borderBottom:`1px solid ${G.border}`}}>
              <span style={{fontSize:13,color:G.gray1}}>보유 현금</span>
              <span style={{fontSize:13,fontWeight:700,color:G.black}}>{fmt(cash)}</span>
            </div>
            {(shared.stocks||[]).filter(st=>holdings[st.id]?.qty>0).length===0
              ?<div style={{padding:"16px",textAlign:"center",color:G.gray2,fontSize:13}}>보유 종목 없음</div>
              :(shared.stocks||[]).filter(st=>holdings[st.id]?.qty>0).map(st=>{
                const h=holdings[st.id];
                const finalPrice=st.prices[st.prices.length-1];
                const ev=finalPrice*h.qty;
                const pnl=ev-h.avgPrice*h.qty;
                return <div key={st.id} style={{padding:"12px 16px",borderBottom:`1px solid ${G.border}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                    <span style={{fontSize:13,fontWeight:600,color:G.black}}>{st.emoji} {st.name}</span>
                    <span style={{fontSize:13,fontWeight:700,color:pnl>=0?G.red:G.blue}}>{pnl>=0?"+":""}{fmt(pnl)}</span>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between"}}>
                    <span style={{fontSize:11,color:G.gray1}}>{h.qty}주 · 평단 {fmtN(h.avgPrice)}</span>
                    <span style={{fontSize:11,color:G.gray1}}>평가 {fmt(ev)}</span>
                  </div>
                </div>;
              })
            }
          </div>

          {/* 전체 순위 */}
          <div style={{fontSize:13,fontWeight:700,color:G.black,marginBottom:8}}>전체 순위</div>
          <div style={{background:G.white,borderRadius:14,overflow:"hidden",border:`1px solid ${G.border}`}}>
            {rank.map((t,i)=>(
              <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",
                borderBottom:i<rank.length-1?`1px solid ${G.border}`:"none",
                background:t.id===teamId?"#EBF3FE":"transparent"}}>
                <div style={{width:26,height:26,borderRadius:"50%",flexShrink:0,
                  background:i===0?"#FFD700":i===1?"#C0C0C0":i===2?"#CD7F32":G.gray4,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:12,fontWeight:700,color:i<3?G.white:G.gray1}}>{i+1}</div>
                <div style={{flex:1,fontSize:13,fontWeight:t.id===teamId?700:500,color:G.black}}>
                  {t.name} {t.id===teamId?"(나)":""}
                </div>
                <div style={{fontSize:13,fontWeight:700,color:G.black}}>{fmt(t.total)}</div>
              </div>
            ))}
          </div>
          <div style={{padding:"16px"}}>
            {shared.phase==="ready"||shared.phase==="round"
              ? <Btn onClick={()=>setScreen("main")} style={{width:"100%",padding:"14px",fontSize:15,borderRadius:12}}>
                  게임 계속하기 →
                </Btn>
              : <div style={{textAlign:"center",padding:"12px",fontSize:13,color:G.gray2,background:G.bg,borderRadius:12}}>
                  운영자가 게임을 초기화하면 다시 참여할 수 있습니다
                </div>
            }
          </div>
        </div>
      </div>
    </div>;
  }

  /* ── 상세 ── */
  if(screen==="detail"&&detail){
    const st=detail;
    const cur=getLivePrice(st);
    const prev=round<=1?st.prices[0]:st.prices[Math.min(round-2,st.prices.length-1)];
    const p=pctOf(cur,prev),isUp=p>0;
    const h=holdings[st.id];
    const holding=h?.qty||0,avgPrice=h?.avgPrice||0;
    const maxQty=orderSide==="buy"?Math.floor(cash/Math.max(cur,1)):holding;
    return <div style={W.wrap}>
      <ConfirmModal show={confirm} onConfirm={doOrder} onCancel={()=>setConfirm(false)} side={orderSide} stock={st} qty={qty} price={cur}/>
      <div style={{background:G.white,padding:"14px 18px 16px",position:"sticky",top:0,zIndex:50,borderBottom:`1px solid ${G.border}`}}>
        {shared.activeEvent&&<div style={{marginBottom:8}}><EventBanner event={shared.activeEvent} stocks={shared.stocks}/></div>}
        <div onClick={()=>setScreen("main")} style={{fontSize:13,color:G.gray1,marginBottom:8,cursor:"pointer"}}>← 뒤로</div>
        <div style={{fontSize:13,color:G.gray1,marginBottom:2}}>{st.emoji} {st.code}</div>
        <div style={{fontSize:20,fontWeight:800,color:G.black,marginBottom:4}}>{st.name}</div>
        <div style={{display:"flex",alignItems:"baseline",gap:10}}>
          <div style={{fontSize:26,fontWeight:800,color:isUp?G.red:p<0?G.blue:G.black}}>{fmtN(cur)}</div>
          <div style={{fontSize:13,fontWeight:600,color:isUp?G.red:p<0?G.blue:G.gray1}}>{isUp?"▲ +":"▼ "}{p.toFixed(2)}%</div>
        </div>
        {shared.phase!=="round"&&<div style={{marginTop:4,fontSize:12,color:G.red,fontWeight:500}}>🔴 매매 시간이 아닙니다</div>}
      </div>
      <div style={{paddingBottom:100}}>
        <div style={{background:G.white,padding:"14px 18px 8px",marginBottom:8}}>
          <div style={{fontSize:11,color:G.gray2,marginBottom:8,fontWeight:500}}>실시간 가격 추이</div>
          <LiveBigChart stock={st} round={round} maxRound={maxRound} roundStartedAt={shared.roundStartedAt} roundEndsAt={shared.roundEndsAt} activeEvent={shared.activeEvent}/>
        </div>
        {holding>0&&<div style={{background:G.white,padding:"13px 18px",marginBottom:8,display:"flex",justifyContent:"space-between"}}>
          <div><div style={{fontSize:11,color:G.gray2,marginBottom:2}}>보유</div><div style={{fontSize:15,fontWeight:700,color:G.black}}>{holding}주</div></div>
          <div><div style={{fontSize:11,color:G.gray2,marginBottom:2}}>평단</div><div style={{fontSize:15,fontWeight:700,color:G.black}}>{fmtN(avgPrice)}</div></div>
          <div style={{textAlign:"right"}}><div style={{fontSize:11,color:G.gray2,marginBottom:2}}>손익</div>
            <div style={{fontSize:15,fontWeight:700,color:cur>avgPrice?G.red:G.blue}}>{cur>avgPrice?"+":""}{fmt((cur-avgPrice)*holding)}</div></div>
        </div>}
        <div style={{background:G.white,padding:"14px 18px"}}>
          <div style={{display:"flex",gap:8,marginBottom:16}}>
            {["buy","sell"].map(side=>(
              <button key={side} onClick={()=>{setOrderSide(side);setQty(1);}}
                style={{flex:1,padding:"11px 0",borderRadius:10,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:14,fontWeight:700,transition:"all .15s",
                  background:orderSide===side?(side==="buy"?G.red:G.blue):G.bg,color:orderSide===side?G.white:G.gray1}}>{side==="buy"?"매수":"매도"}</button>
            ))}
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <span style={{fontSize:14,color:G.gray1}}>수량</span>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div onClick={()=>setQty(q=>Math.max(1,q-1))} style={{width:32,height:32,borderRadius:8,background:G.bg,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:20,userSelect:"none"}}>−</div>
              <span style={{fontSize:18,fontWeight:700,color:G.black,minWidth:32,textAlign:"center"}}>{qty}</span>
              <div onClick={()=>setQty(q=>Math.min(q+1,maxQty||1))} style={{width:32,height:32,borderRadius:8,background:G.bg,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:20,userSelect:"none"}}>+</div>
            </div>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
            <span style={{fontSize:13,color:G.gray1}}>총 금액</span>
            <span style={{fontSize:15,fontWeight:700,color:G.black}}>{fmt(cur*qty)}</span>
          </div>
          <div style={{fontSize:12,color:G.gray2,textAlign:"right",marginBottom:14}}>
            {orderSide==="buy"?`잔액 ${fmt(cash)} · 최대 ${maxQty}주`:`보유 ${holding}주 · 최대 ${maxQty}주`}
          </div>
          <Btn onClick={()=>setConfirm(true)} color={orderSide==="buy"?G.red:G.blue} style={{width:"100%",padding:"14px",fontSize:15,borderRadius:12}}>
            {orderSide==="buy"?"매수 주문":"매도 주문"}
          </Btn>
        </div>
      </div>
      <Toast {...toast}/>
    </div>;
  }

  /* ── 메인 ── */
  return <div style={W.wrap}>
    <ConfirmModal show={confirm} onConfirm={doOrder} onCancel={()=>setConfirm(false)} side={orderSide} stock={detail} qty={qty} price={orderPrice}/>
    <div style={{background:G.white,padding:"16px 18px 0",position:"sticky",top:0,zIndex:50,borderBottom:`1px solid ${G.border}`}}>
      {shared.activeEvent&&<div style={{marginBottom:8}}><EventBanner event={shared.activeEvent} stocks={shared.stocks}/></div>}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
        <div>
          <div style={{fontSize:12,color:G.gray1,marginBottom:1}}>{teamName}팀</div>
          <div style={{fontSize:26,fontWeight:800,color:G.black,letterSpacing:-0.5}}>{fmt(total)}</div>
          <div style={{fontSize:13,fontWeight:600,color:diff>=0?G.red:G.blue,marginTop:1}}>{diff>=0?"▲ +":"▼ "}{fmt(Math.abs(diff))} ({diff>=0?"+":""}{diffPct}%)</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{background:shared.phase==="round"?G.greenLight:shared.phase==="break"?G.yellowLight:G.gray4,
            color:shared.phase==="round"?G.green:shared.phase==="break"?G.yellow:G.gray1,
            borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:600,marginBottom:3}}>
            {shared.phase==="ready"?"대기중":shared.phase==="round"?`Round ${shared.round}`:shared.phase==="break"?`R${shared.round} 종료`:"게임종료"}
          </div>
          {shared.phase==="round"&&rem!==null&&<div style={{fontSize:14,fontWeight:800,color:rem<=60?G.red:G.black,fontFamily:"monospace"}}>⏱ {secToStr(rem)}</div>}
          {shared.phase==="round"&&rem===null&&<div style={{fontSize:11,color:G.green}}>매매중</div>}
        </div>
      </div>
      <div style={{display:"flex"}}>
        {[["market","시장"],["portfolio","보유"],["shop","상점 🛒"]].map(([key,label])=>(
          <div key={key} onClick={()=>setTab(key)} style={{flex:1,textAlign:"center",padding:"8px 0",fontSize:12,fontWeight:600,
            color:tab===key?G.blue:G.gray1,borderBottom:`2px solid ${tab===key?G.blue:"transparent"}`,cursor:"pointer",transition:"all .15s"}}>{label}</div>
        ))}
      </div>
    </div>

    <div style={{paddingBottom:24}}>
      {tab==="market"&&<>
        <div style={{padding:"10px 18px 5px",fontSize:12,color:G.gray1,fontWeight:500}}>종목 현황 {shared.phase==="round"?`· Round ${shared.round}`:""}</div>
        {(shared.stocks||[]).map(st=>{
          const cur=getLivePrice(st);
          const prev=round<=1?st.prices[0]:st.prices[Math.min(round-2,st.prices.length-1)];
          const p=pctOf(cur,prev),isUp=p>0;
          return <div key={st.id} onClick={()=>{setDetail(st);setOrderSide("buy");setQty(1);setScreen("detail");}}
            style={{background:G.white,display:"flex",alignItems:"center",padding:"13px 18px",borderBottom:`1px solid ${G.border}`,cursor:"pointer",gap:10}}>
            <div style={{width:40,height:40,borderRadius:11,background:G.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{st.emoji}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:14,fontWeight:700,color:G.black,marginBottom:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{st.name}</div>
              <div style={{fontSize:11,color:G.gray2}}>{st.code}</div>
            </div>
            <LiveMiniChart stock={st} round={round} roundStartedAt={shared.roundStartedAt} roundEndsAt={shared.roundEndsAt} activeEvent={shared.activeEvent}/>
            <div style={{textAlign:"right",flexShrink:0,minWidth:72}}>
              <div style={{fontSize:14,fontWeight:700,color:G.black,marginBottom:3}}>{fmtN(cur)}</div>
              <div style={{fontSize:11,fontWeight:600,padding:"2px 7px",borderRadius:5,
                background:isUp?G.redLight:p<0?G.blueLight:G.bg,color:isUp?G.red:p<0?G.blue:G.gray1}}>{isUp?"+":""}{p.toFixed(2)}%</div>
            </div>
          </div>;
        })}
      </>}

      {tab==="portfolio"&&<>
        <div style={{background:G.white,padding:"13px 18px",borderBottom:`1px solid ${G.border}`,display:"flex",justifyContent:"space-between"}}>
          <span style={{fontSize:14,color:G.gray1}}>보유 현금</span>
          <span style={{fontSize:14,fontWeight:700,color:G.black}}>{fmt(cash)}</span>
        </div>
        <div style={{padding:"10px 18px 5px",fontSize:12,color:G.gray1,fontWeight:500}}>보유 종목</div>
        {(shared.stocks||[]).filter(st=>holdings[st.id]?.qty>0).length===0
          ?<div style={{background:G.white,textAlign:"center",color:G.gray2,padding:"36px 0",fontSize:14}}>보유 종목 없음</div>
          :(shared.stocks||[]).filter(st=>holdings[st.id]?.qty>0).map(st=>{
            const h=holdings[st.id],cur=getLivePrice(st);
            const ev2=cur*h.qty,pnl=ev2-h.avgPrice*h.qty;
            return <div key={st.id} onClick={()=>{setDetail(st);setOrderSide("sell");setQty(1);setScreen("detail");}}
              style={{background:G.white,padding:"13px 18px",borderBottom:`1px solid ${G.border}`,cursor:"pointer"}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                <div style={{fontSize:14,fontWeight:700,color:G.black}}>{st.emoji} {st.name}</div>
                <div style={{fontSize:14,fontWeight:700,color:pnl>=0?G.red:G.blue}}>{pnl>=0?"+":""}{fmt(pnl)}</div>
              </div>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{fontSize:12,color:G.gray1}}>{h.qty}주 · 평단 {fmtN(h.avgPrice)}</span>
                <span style={{fontSize:12,color:G.gray1}}>평가 {fmt(ev2)}</span>
              </div>
            </div>;
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
          return <div key={item.id} style={{background:G.white,marginBottom:1,padding:"15px 18px"}}>
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
            {bought&&<div style={{marginTop:10,padding:"12px 13px",background:"linear-gradient(135deg,#F0EEFF,#EBF3FE)",borderRadius:11,border:`1.5px solid ${G.purple}22`}}>
              <div style={{fontSize:11,fontWeight:700,color:G.purple,marginBottom:5}}>🔓 공개된 힌트</div>
              <div style={{fontSize:13,color:G.black,lineHeight:1.7,whiteSpace:"pre-wrap"}}>{item.hint}</div>
            </div>}
          </div>;
        })}
      </>}
    </div>
    <Toast {...toast}/>
  </div>;
}

/* ══════════════════════════════════════════
   관리자 로그인
══════════════════════════════════════════ */
function AdminLogin({onSuccess}){
  const [pw,setPw]=useState(""),[ err,setErr]=useState(false);
  const check=()=>{if(pw===ADMIN_PW)onSuccess();else setErr(true);};
  return <div style={{background:G.white,minHeight:"100vh",minHeightFallback:"100dvh",maxWidth:"430px",width:"100%",margin:"0 auto",overflowX:"hidden",
    display:"flex",flexDirection:"column",justifyContent:"center",padding:"0 24px",
    fontFamily:"'Pretendard','Apple SD Gothic Neo',sans-serif"}}>
    <div style={{fontSize:26,fontWeight:800,color:G.black,marginBottom:8}}>운영자 로그인 🔐</div>
    <div style={{fontSize:14,color:G.gray1,marginBottom:24}}>관리자 비밀번호를 입력하세요</div>
    <input type="password" value={pw} onChange={e=>{setPw(e.target.value);setErr(false);}}
      placeholder="비밀번호" onKeyDown={e=>e.key==="Enter"&&check()}
      style={{border:`1.5px solid ${err?G.red:G.border}`,borderRadius:11,padding:"13px 14px",
        fontSize:15,fontFamily:"inherit",outline:"none",marginBottom:8,color:G.black}}/>
    {err&&<div style={{fontSize:13,color:G.red,marginBottom:8}}>비밀번호가 올바르지 않습니다</div>}
    <Btn onClick={check} color={G.black} style={{width:"100%",padding:"14px",fontSize:15,borderRadius:11}}>로그인</Btn>
  </div>;
}

/* ══════════════════════════════════════════
   진입점
══════════════════════════════════════════ */
export default function App(){
  const [mode,setMode]=useState("select");
  const [auth,setAuth]=useState(false);
  if(mode==="admin"){if(!auth)return <AdminLogin onSuccess={()=>setAuth(true)}/>;return <AdminApp/>;}
  if(mode==="user") return <UserApp/>;
  return <div style={{background:G.white,minHeight:"100vh",minHeightFallback:"100dvh",maxWidth:"430px",width:"100%",margin:"0 auto",overflowX:"hidden",
    display:"flex",flexDirection:"column",justifyContent:"center",padding:"0 24px",
    fontFamily:"'Pretendard','Apple SD Gothic Neo',sans-serif"}}>
    <div style={{marginBottom:48}}>
      <div style={{fontSize:34,fontWeight:800,color:G.black,marginBottom:8,letterSpacing:-1}}>로(路)<br/>주식 게임</div>
      <div style={{fontSize:15,color:G.gray1,lineHeight:1.7}}>접속할 화면을 선택하세요</div>
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {[["user","👤 팀장 화면","팀 이름·비밀번호로 로그인",G.blue],
        ["admin","🛠 운영자 화면","라운드·설정·계좌·이벤트 관리",G.black]].map(([m,title,sub,bg])=>(
        <button key={m} onClick={()=>setMode(m)} style={{background:bg,color:G.white,border:"none",
          borderRadius:15,padding:"18px 20px",fontSize:15,fontWeight:700,cursor:"pointer",
          fontFamily:"inherit",textAlign:"left",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><div style={{marginBottom:3}}>{title}</div><div style={{fontSize:12,fontWeight:400,opacity:.8}}>{sub}</div></div>
          <span style={{fontSize:20}}>→</span>
        </button>
      ))}
    </div>
  </div>;
}
