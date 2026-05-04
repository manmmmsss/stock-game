import { useState, useEffect, useCallback, useRef } from "react";
import { db } from "./firebase";
import { ref, onValue, set as fbSet, get } from "firebase/database";
import bgImage from "./assets/MT_background.png";
import logoImage from "./assets/MT_logo.png";

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
const TEAM_REF = (tid) => ref(db, `game/teams/${tid}`);
const GROUP_REF = (gname) => ref(db, `game/groups/${gname}`);

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

const setShared = async (fn, opts = {}) => {
  try {
    const snapshot = await get(GAME_REF);
    const current = snapshot.val() || { ...INIT_SS };
    const next = fn(current);

    let merged;

    if (opts.force) {
      // force 모드: 딥머지 없이 완전 교체
      merged = { ...next };
    } else {
      // 일반 모드: teams 딥머지
      merged = { ...current, ...next };

      if (next.teams && current.teams) {
        merged.teams = { ...current.teams };
        for (const [tid, tm] of Object.entries(next.teams)) {
          merged.teams[tid] = {
            ...(current.teams[tid] || {}),
            ...tm,
            holdings: (() => {
              const base = current.teams[tid]?.holdings || {};
              const cleaned = {};
              for (const [sid, h] of Object.entries(base)) {
                if (sid === '_empty') continue;
                if (h && typeof h === 'object') {
                  cleaned[sid] = { qty: h.qty ?? 0, avgPrice: h.avgPrice ?? 0 };
                }
              }
              const incoming = tm.holdings || {};
              const result = { ...cleaned };
              for (const [sid, h] of Object.entries(incoming)) {
                if (sid === '_empty') continue;
                if (h && typeof h === 'object') {
                  result[sid] = {
                    qty: h.qty ?? cleaned[sid]?.qty ?? 0,
                    avgPrice: h.avgPrice ?? cleaned[sid]?.avgPrice ?? 0,
                  };
                }
              }
              return result;
            })(),
            history: Array.isArray(tm.history)
              ? tm.history
              : (current.teams[tid]?.history || []),
            purchases: Array.isArray(tm.purchases)
              ? tm.purchases
              : (current.teams[tid]?.purchases || []),
          };
        }
        // next.teams에 없는 팀은 삭제 (delMember 등 명시적 삭제 반영)
        for (const tid of Object.keys(current.teams)) {
          if (!(tid in next.teams)) delete merged.teams[tid];
        }
      }

      // chatMessages 배열 보존
      if (next.chatMessages && Array.isArray(next.chatMessages)) {
        merged.chatMessages = next.chatMessages;
      } else if (!next.hasOwnProperty('chatMessages')) {
        merged.chatMessages = Array.isArray(current.chatMessages)
          ? current.chatMessages
          : Object.values(current.chatMessages || {}).sort((a, b) => a.ts - b.ts);
      }
    }

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
        if (val.priceHistory) {
          for (const sid of Object.keys(val.priceHistory)) {
            if (val.priceHistory[sid] && !Array.isArray(val.priceHistory[sid])) {
              val.priceHistory[sid] = Object.values(val.priceHistory[sid])
                .sort((a, b) => a.t - b.t);
            }
          }
        }
        if (val.chatMessages && !Array.isArray(val.chatMessages)) {
          val.chatMessages = Object.values(val.chatMessages)
            .sort((a, b) => a.ts - b.ts);
        }
        if (val.tradeOffers && !Array.isArray(val.tradeOffers)) {
          // 객체 형태 유지 (id 키로 접근)
        }
        if (val.teams) {
          for (const tid of Object.keys(val.teams)) {
            const tm = val.teams[tid];
            if (tm.history && !Array.isArray(tm.history)) {
              val.teams[tid].history = Object.values(tm.history)
                .sort((a, b) => (a.ts || a.t || 0) - (b.ts || b.t || 0));
            }
            if (!tm.history) val.teams[tid].history = [];
            if (tm.purchases && !Array.isArray(tm.purchases)) {
              val.teams[tid].purchases = Object.values(tm.purchases);
            }
            if (!tm.purchases) val.teams[tid].purchases = [];
            if (!tm.holdings) val.teams[tid].holdings = {};
            if (tm.borrowed === undefined) val.teams[tid].borrowed = 0;
            if (tm.diamonds === undefined) val.teams[tid].diamonds = 0;
          }
        }
        // _empty 플래그 제거
        if (val.teams) {
          for (const tid of Object.keys(val.teams)) {
            const tm = val.teams[tid];
            if (tm.holdings) {
              if (tm.holdings._empty === true) {
                // 초기화된 경우
                val.teams[tid].holdings = {};
              } else {
                // Firebase가 객체로 저장한 holdings — avgPrice 보존하며 복원
                const cleanHoldings = {};
                for (const [sid, h] of Object.entries(tm.holdings)) {
                  if (sid === '_empty') continue;
                  if (h && typeof h === 'object') {
                    cleanHoldings[sid] = {
                      qty: h.qty ?? 0,
                      avgPrice: h.avgPrice ?? 0,
                    };
                  }
                }
                val.teams[tid].holdings = cleanHoldings;
              }
            }
            if (Array.isArray(tm.purchases)) {
              val.teams[tid].purchases = tm.purchases.filter(x => x !== "_empty");
            }
            if (Array.isArray(tm.history)) {
              val.teams[tid].history = tm.history.filter(x => x !== "_empty" && typeof x === 'object');
            }
          }
        }
        if (Array.isArray(val.chatMessages)) {
          val.chatMessages = val.chatMessages.filter(x => x !== "_empty" && typeof x === 'object');
        }
        if (Array.isArray(val.eventHistory)) {
          val.eventHistory = val.eventHistory.filter(x => x !== "_empty" && typeof x === 'object');
        }
        if (val.groups) {
          for (const gname of Object.keys(val.groups)) {
            const g = val.groups[gname];
            if (g.memberIds && !Array.isArray(g.memberIds)) {
              val.groups[gname].memberIds = Object.values(g.memberIds);
            }
            if (!g.memberIds) val.groups[gname].memberIds = [];
            if (g.diamonds === undefined) val.groups[gname].diamonds = 0;
          }
        }
        if (val.bonusPool?._empty) val.bonusPool = {};
        if (val.priceHistory?._empty) val.priceHistory = {};
        if (val.modifiedTargets?._empty) val.modifiedTargets = {};
        if (val.tradeOffers?._empty) val.tradeOffers = {};
        if (val.bets?._empty) val.bets = {};
        if (val.betOdds?._empty) val.betOdds = {};
        if (!val.roundStartedAt || val.roundStartedAt === 0) val.roundStartedAt = null;
        if (!val.roundEndsAt || val.roundEndsAt === 0) val.roundEndsAt = null;
        if (!val.breakEndsAt || val.breakEndsAt === 0) val.breakEndsAt = null;
        if (!val.betDeadline || val.betDeadline === 0) val.betDeadline = null;
        if (!val.activeEvent || val.activeEvent === 0) val.activeEvent = null;
        if (!val.noticeAt || val.noticeAt === 0) val.noticeAt = null;
        if (!val.nextAutoEventAt || val.nextAutoEventAt === 0) val.nextAutoEventAt = null;

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

const BUILT_IN_TEMPLATES = [
  {
    id:"tpl1", name:"🏦 기본형 (3라운드)", builtIn:true,
    desc:"가장 기본적인 설정. 처음 진행할 때 추천",
    initCash:10000000, maxRound:3, feeRate:0.1,
    leverageEnabled:false, leverageMax:2,
    rounds:[
      {id:"r1",label:"Round 1",durationMin:5,blind:false,dividends:{}},
      {id:"r2",label:"Round 2",durationMin:5,blind:false,dividends:{s3:500,s1:300}},
      {id:"r3",label:"Round 3",durationMin:5,blind:false,dividends:{s1:800,s3:1000,s5:500}},
    ],
    stocks:[
      {id:"s1",name:"삼성전자",code:"005930",emoji:"💎",prices:[65000,72000,58000],totalSupply:0,listed:true},
      {id:"s2",name:"카카오",code:"035720",emoji:"🟡",prices:[45000,38000,51000],totalSupply:0,listed:true},
      {id:"s3",name:"네이버",code:"035420",emoji:"🟢",prices:[180000,195000,172000],totalSupply:0,listed:true},
      {id:"s4",name:"현대자동차",code:"005380",emoji:"🚗",prices:[95000,88000,103000],totalSupply:0,listed:true},
      {id:"s5",name:"LG에너지솔루션",code:"373220",emoji:"⚡",prices:[420000,445000,398000],totalSupply:0,listed:true},
    ],
    shopItems:[
      {id:"sh1",name:"내부자 제보 A",desc:"다음 라운드에서 가장 많이 오를 종목을 귀띔해드립니다",price:2400000,emoji:"🕵️",hint:"💡 힌트: 3라운드에서 현대자동차가 강세를 보일 것으로 예상됩니다. 글로벌 전기차 수요 증가 때문입니다."},
      {id:"sh2",name:"시장 분석 리포트",desc:"현재 시장 흐름과 섹터별 동향을 분석해드립니다",price:1500000,emoji:"📊",hint:"📊 분석: 현재 IT 섹터(카카오, 네이버)는 조정 국면. 반도체(삼성전자)는 저점 매수 기회. 에너지(LG에너지솔루션)는 강세 지속 예상."},
      {id:"sh3",name:"VIP 정보 패키지",desc:"3라운드 전 종목 방향 + 추천 포트폴리오 제공",price:6000000,emoji:"💡",hint:"🔮 VIP 정보\n삼성전자: ▼ 하락 예상\n카카오: ▲ 반등 예상\n네이버: ▼ 조정 지속\n현대자동차: ▲ 강세\nLG에너지솔루션: ▲ 강세\n\n추천: 카카오 + 현대차 + LG에너지 집중 매수"},
      {id:"sh4",name:"배당 수익률 리포트",desc:"라운드별 배당금이 가장 높은 종목 공개",price:900000,emoji:"💰",hint:"배당 TOP: 2라운드 네이버(주당 500원), 3라운드 삼성전자(주당 800원). 장기보유 전략 추천!"},
    ],
    eventPresets:[
      {id:"e1",name:"반도체 수출 호조",emoji:"💾",desc:"글로벌 반도체 수요 급증",globalEffect:5,stockEffects:{s1:20,s5:15,s2:-5,s3:-3,s4:3},note:"삼성 급등",autoTrigger:true,triggerIntervalMin:1,triggerIntervalMax:2,probability:40,duration:90,affectTarget:true},
      {id:"e2",name:"금리 인상 발표",emoji:"📉",desc:"한국은행 기준금리 0.5% 인상",globalEffect:-10,stockEffects:{s1:-8,s2:-15,s3:-12,s4:-5,s5:-10},note:"성장주 타격",autoTrigger:true,triggerIntervalMin:2,triggerIntervalMax:3,probability:35,duration:120,affectTarget:true},
      {id:"e3",name:"외국인 대규모 매수",emoji:"🌏",desc:"외국인 투자자 한국 주식 대량 매입",globalEffect:8,stockEffects:{},note:"전체 상승",autoTrigger:false,triggerIntervalMin:2,triggerIntervalMax:4,probability:30,duration:60,affectTarget:true},
      {id:"e4",name:"코스피 서킷브레이커",emoji:"🛑",desc:"급락으로 거래 일시 정지",globalEffect:-18,stockEffects:{},note:"전체 급락",autoTrigger:false,triggerIntervalMin:3,triggerIntervalMax:5,probability:20,duration:0,affectTarget:true},
    ],
  },
  {
    id:"tpl2", name:"🎭 롤러코스터 (4라운드)", builtIn:true,
    desc:"급등락이 심한 고위험 고수익. 레버리지 투자 가능",
    initCash:10000000, maxRound:4, feeRate:0.2,
    leverageEnabled:true, leverageMax:2,
    rounds:[
      {id:"r1",label:"Round 1",durationMin:4,blind:false,dividends:{}},
      {id:"r2",label:"Round 2",durationMin:4,blind:false,dividends:{s2:1000}},
      {id:"r3",label:"Round 3",durationMin:4,blind:true,dividends:{}},
      {id:"r4",label:"Round 4",durationMin:4,blind:false,dividends:{s1:2000,s5:1500}},
    ],
    stocks:[
      {id:"s1",name:"테슬라코리아",code:"TSLA",emoji:"🚗",prices:[250000,380000,180000,420000],totalSupply:100,listed:true},
      {id:"s2",name:"바이오제약",code:"BIO",emoji:"💊",prices:[12000,28000,8000,35000],totalSupply:200,listed:true},
      {id:"s3",name:"코인뱅크",code:"COIN",emoji:"🪙",prices:[85000,140000,45000,160000],totalSupply:0,listed:true},
      {id:"s4",name:"메타버스Inc",code:"META",emoji:"🎮",prices:[32000,15000,48000,22000],totalSupply:0,listed:true},
      {id:"s5",name:"그린에너지",code:"GRN",emoji:"🌱",prices:[45000,52000,38000,68000],totalSupply:0,listed:true},
    ],
    shopItems:[
      {id:"sh1",name:"레버리지 가이드",desc:"레버리지 투자 최적 타이밍 분석 제공",price:1800000,emoji:"⚡",hint:"⚡ 레버리지 전략\n3라운드(블라인드)에서 테슬라코리아가 급락합니다.\n2라운드에 테슬라 매도 후 4라운드에 x2 레버리지 매수 추천!\n바이오제약은 2라운드 고점에서 반드시 매도하세요."},
      {id:"sh2",name:"3라운드 블라인드 해제",desc:"블라인드 라운드의 예상 가격대를 알려드립니다",price:4500000,emoji:"🙈",hint:"🔓 블라인드 해제\n3라운드 예상가:\n테슬라코리아: 180,000 (급락)\n바이오제약: 8,000 (급락)\n코인뱅크: 45,000 (하락)\n메타버스: 48,000 (상승!)\n그린에너지: 38,000 (하락)"},
      {id:"sh3",name:"내부자 폐지 정보",desc:"이번 게임에서 폐지될 종목 사전 정보",price:7500000,emoji:"☠️",hint:"☠️ 극비 정보\n코인뱅크는 3라운드 중 규제 이슈로 폐지 예정!\n지금 당장 전량 매도하세요. 폐지 시 현재가로 강제 매도됩니다."},
      {id:"sh4",name:"급등주 포착",desc:"4라운드에서 가장 크게 오를 종목 1개 공개",price:3000000,emoji:"🚀",hint:"🚀 4라운드 급등주: 바이오제약!\n3라운드 저점(8,000)에서 최대한 매수 후 4라운드 고점(35,000)에서 매도. 수익률 337% 예상"},
    ],
    eventPresets:[
      {id:"e1",name:"FDA 신약 승인",emoji:"💊",desc:"바이오제약 신약 FDA 승인 소식",globalEffect:0,stockEffects:{s2:40,s1:5,s3:10,s4:8,s5:3},note:"바이오 급등",autoTrigger:true,triggerIntervalMin:1,triggerIntervalMax:2,probability:50,duration:120,affectTarget:true},
      {id:"e2",name:"코인 규제 발표",emoji:"🚫",desc:"정부 가상자산 전면 규제",globalEffect:-5,stockEffects:{s3:-35,s1:-10,s2:-5,s4:5,s5:0},note:"코인 급락",autoTrigger:true,triggerIntervalMin:1,triggerIntervalMax:3,probability:45,duration:0,affectTarget:true},
      {id:"e3",name:"메타버스 대기업 투자",emoji:"🎮",desc:"글로벌 빅테크 메타버스 2조 투자 발표",globalEffect:3,stockEffects:{s4:35,s1:8,s2:5,s3:10,s5:5},note:"메타 급등",autoTrigger:true,triggerIntervalMin:2,triggerIntervalMax:3,probability:40,duration:90,affectTarget:true},
      {id:"e4",name:"테슬라 리콜 사태",emoji:"🔧",desc:"전 세계 50만대 배터리 결함 리콜",globalEffect:-3,stockEffects:{s1:-25,s5:-15,s2:5,s3:-5,s4:-8},note:"테슬라 급락",autoTrigger:true,triggerIntervalMin:2,triggerIntervalMax:4,probability:35,duration:0,affectTarget:true},
      {id:"e5",name:"그린뉴딜 정책 발표",emoji:"🌱",desc:"정부 탄소중립 100조 투자",globalEffect:5,stockEffects:{s5:28,s1:10,s2:3,s3:2,s4:8},note:"그린 급등",autoTrigger:false,triggerIntervalMin:2,triggerIntervalMax:4,probability:30,duration:120,affectTarget:true},
    ],
  },
  {
    id:"tpl3", name:"🕵️ 블라인드 배틀 (3라운드)", builtIn:true,
    desc:"2라운드 블라인드 — 정보가 곧 돈! 상점이 핵심",
    initCash:8000000, maxRound:3, feeRate:0.15,
    leverageEnabled:false, leverageMax:2,
    rounds:[
      {id:"r1",label:"Round 1",durationMin:5,blind:false,dividends:{}},
      {id:"r2",label:"Round 2",durationMin:5,blind:true,dividends:{}},
      {id:"r3",label:"Round 3",durationMin:5,blind:false,dividends:{s2:800,s4:1200}},
    ],
    stocks:[
      {id:"s1",name:"삼성전자",code:"005930",emoji:"💎",prices:[65000,48000,72000],totalSupply:0,listed:true},
      {id:"s2",name:"카카오",code:"035720",emoji:"🟡",prices:[45000,62000,38000],totalSupply:0,listed:true},
      {id:"s3",name:"네이버",code:"035420",emoji:"🟢",prices:[180000,155000,210000],totalSupply:0,listed:true},
      {id:"s4",name:"현대자동차",code:"005380",emoji:"🚗",prices:[95000,118000,75000],totalSupply:0,listed:true},
      {id:"s5",name:"LG에너지솔루션",code:"373220",emoji:"⚡",prices:[420000,380000,490000],totalSupply:0,listed:true},
    ],
    shopItems:[
      {id:"sh1",name:"블라인드 힌트 A",desc:"2라운드 특정 종목의 방향만 알려드립니다 (상승/하락)",price:1200000,emoji:"🔍",hint:"2라운드 상승 종목: 카카오, 현대자동차\n2라운드 하락 종목: 삼성전자, 네이버, LG에너지솔루션"},
      {id:"sh2",name:"블라인드 완전 해제",desc:"2라운드 전 종목 예상 가격 공개",price:3600000,emoji:"🔓",hint:"🔓 2라운드 완전 해제\n삼성전자: 48,000 (▼ -26%)\n카카오: 62,000 (▲ +38%)\n네이버: 155,000 (▼ -14%)\n현대자동차: 118,000 (▲ +24%)\nLG에너지솔루션: 380,000 (▼ -10%)"},
      {id:"sh3",name:"3라운드 내부 정보",desc:"3라운드에서 가장 크게 움직일 종목 공개",price:3000000,emoji:"🕵️",hint:"3라운드 주목 종목:\n▲ 네이버: 155,000→210,000 (+35%)\n▲ LG에너지솔루션: 380,000→490,000 (+29%)\n▼ 현대자동차: 118,000→75,000 (-36%) ⚠️ 고점 매도 필수!"},
      {id:"sh4",name:"배당 알림",desc:"3라운드 배당금 지급 종목과 금액 공개",price:600000,emoji:"💰",hint:"3라운드 배당 지급:\n카카오: 주당 800원\n현대자동차: 주당 1,200원\n→ 현대차 3라운드 전에 매수해두면 배당+시세차익 가능!"},
    ],
    eventPresets:[
      {id:"e1",name:"IT 섹터 쇼크",emoji:"💻",desc:"글로벌 빅테크 동반 급락",globalEffect:-8,stockEffects:{s2:-20,s3:-18,s1:-10,s4:5,s5:3},note:"IT 하락",autoTrigger:true,triggerIntervalMin:1,triggerIntervalMax:2,probability:45,duration:120,affectTarget:true},
      {id:"e2",name:"한류 경제 효과",emoji:"🌏",desc:"K-콘텐츠 글로벌 흥행 → 카카오·네이버 수혜",globalEffect:3,stockEffects:{s2:18,s3:15,s1:5,s4:3,s5:2},note:"IT 급등",autoTrigger:true,triggerIntervalMin:2,triggerIntervalMax:3,probability:40,duration:90,affectTarget:true},
      {id:"e3",name:"현대차 파업",emoji:"🏭",desc:"전국 공장 동시 파업 돌입",globalEffect:-2,stockEffects:{s4:-22,s1:-3,s2:-2,s3:-2,s5:-5},note:"현대차 급락",autoTrigger:true,triggerIntervalMin:2,triggerIntervalMax:4,probability:35,duration:0,affectTarget:true},
      {id:"e4",name:"배터리 기술 혁신",emoji:"🔋",desc:"LG에너지, 전고체 배터리 상용화 발표",globalEffect:4,stockEffects:{s5:25,s1:8,s4:10,s2:3,s3:2},note:"에너지 급등",autoTrigger:false,triggerIntervalMin:2,triggerIntervalMax:4,probability:30,duration:120,affectTarget:true},
    ],
  },
  {
    id:"tpl4", name:"💸 배당왕 (3라운드)", builtIn:true,
    desc:"배당금이 핵심! 장기 보유 vs 시세차익 전략 대결",
    initCash:10000000, maxRound:3, feeRate:0.1,
    leverageEnabled:false, leverageMax:2,
    rounds:[
      {id:"r1",label:"Round 1",durationMin:6,blind:false,dividends:{s1:500,s3:800}},
      {id:"r2",label:"Round 2",durationMin:6,blind:false,dividends:{s2:1200,s4:600,s5:1000}},
      {id:"r3",label:"Round 3",durationMin:6,blind:false,dividends:{s1:1500,s2:800,s3:2000,s4:1000,s5:2500}},
    ],
    stocks:[
      {id:"s1",name:"삼성전자",code:"005930",emoji:"💎",prices:[65000,68000,72000],totalSupply:0,listed:true},
      {id:"s2",name:"카카오",code:"035720",emoji:"🟡",prices:[45000,47000,50000],totalSupply:0,listed:true},
      {id:"s3",name:"네이버",code:"035420",emoji:"🟢",prices:[180000,185000,192000],totalSupply:0,listed:true},
      {id:"s4",name:"현대자동차",code:"005380",emoji:"🚗",prices:[95000,98000,102000],totalSupply:0,listed:true},
      {id:"s5",name:"LG에너지솔루션",code:"373220",emoji:"⚡",prices:[420000,432000,448000],totalSupply:0,listed:true},
    ],
    shopItems:[
      {id:"sh1",name:"배당 수익률 계산기",desc:"전 종목 라운드별 배당 수익률 분석 자료",price:900000,emoji:"📊",hint:"💰 배당 총액 시뮬레이션 (100주 보유 기준)\n삼성전자: R1(5만)+R3(15만) = 20만원\n카카오: R2(12만)+R3(8만) = 20만원\n네이버: R1(8만)+R3(20만) = 28만원 ← 최고!\nLG에너지솔루션: R2(10만)+R3(25만) = 35만원 ← 주가 비쌈 주의"},
      {id:"sh2",name:"배당 귀족 포트폴리오",desc:"배당+시세차익 동시 극대화 추천 포트폴리오",price:2400000,emoji:"👑",hint:"👑 최적 포트폴리오\n네이버 30% + LG에너지솔루션 30% + 삼성전자 40%\n이유: 네이버·LG는 배당 높음, 삼성은 안정적 상승"},
      {id:"sh3",name:"3라운드 배당 극비 정보",desc:"3라운드 배당금이 가장 높은 종목 Top3",price:1800000,emoji:"🏆",hint:"3라운드 배당 Top3\n🥇 LG에너지솔루션: 주당 2,500원\n🥈 네이버: 주당 2,000원\n🥉 삼성전자: 주당 1,500원\n→ 3라운드 전 LG에너지 최대한 확보!"},
      {id:"sh4",name:"이벤트 방어 전략",desc:"배당 중 이벤트 발생 시 손실 최소화 방법",price:1200000,emoji:"🛡️",hint:"🛡️ 방어 전략\n이벤트 발생 시 배당주는 상대적으로 덜 떨어집니다.\n급락 이벤트 시 오히려 저점 매수 기회!\n삼성전자·네이버는 이벤트 충격이 작은 방어주입니다."},
    ],
    eventPresets:[
      {id:"e1",name:"배당 시즌 호황",emoji:"💰",desc:"기관투자자 배당주 대규모 매입",globalEffect:6,stockEffects:{s1:12,s3:10,s5:8,s2:5,s4:6},note:"배당주 강세",autoTrigger:true,triggerIntervalMin:2,triggerIntervalMax:4,probability:40,duration:120,affectTarget:true},
      {id:"e2",name:"경기침체 우려",emoji:"😰",desc:"GDP 성장률 예상치 하회",globalEffect:-7,stockEffects:{s1:-5,s2:-10,s3:-8,s4:-12,s5:-6},note:"경기민감주 하락",autoTrigger:true,triggerIntervalMin:2,triggerIntervalMax:3,probability:35,duration:90,affectTarget:true},
      {id:"e3",name:"ESG 펀드 대규모 유입",emoji:"🌿",desc:"친환경 기업 집중 투자",globalEffect:3,stockEffects:{s5:15,s3:8,s1:5,s4:3,s2:4},note:"에너지·IT 강세",autoTrigger:true,triggerIntervalMin:3,triggerIntervalMax:5,probability:30,duration:120,affectTarget:true},
      {id:"e4",name:"외환위기 공포",emoji:"💱",desc:"원달러 환율 1500원 돌파",globalEffect:-12,stockEffects:{s1:-8,s2:-15,s3:-12,s4:-10,s5:-10},note:"전체 급락",autoTrigger:false,triggerIntervalMin:3,triggerIntervalMax:6,probability:20,duration:0,affectTarget:true},
    ],
  },
  {
    id:"tpl5", name:"⚡ 스피드 런 (5라운드)", builtIn:true,
    desc:"라운드당 3분, 빠른 판단력 싸움! 레버리지·수수료 주의",
    initCash:5000000, maxRound:5, feeRate:0.3,
    leverageEnabled:true, leverageMax:2,
    rounds:[
      {id:"r1",label:"Round 1",durationMin:3,blind:false,dividends:{}},
      {id:"r2",label:"Round 2",durationMin:3,blind:false,dividends:{s3:200}},
      {id:"r3",label:"Round 3",durationMin:3,blind:true,dividends:{}},
      {id:"r4",label:"Round 4",durationMin:3,blind:false,dividends:{s1:500,s5:300}},
      {id:"r5",label:"Round 5",durationMin:3,blind:false,dividends:{s2:400,s4:600}},
    ],
    stocks:[
      {id:"s1",name:"A종목",code:"A001",emoji:"🔴",prices:[10000,13000,9000,15000,11000],totalSupply:300,listed:true},
      {id:"s2",name:"B종목",code:"B001",emoji:"🔵",prices:[10000,8000,13000,7000,16000],totalSupply:300,listed:true},
      {id:"s3",name:"C종목",code:"C001",emoji:"🟢",prices:[10000,11000,10500,12500,13500],totalSupply:0,listed:true},
      {id:"s4",name:"D종목",code:"D001",emoji:"🟡",prices:[10000,9000,8000,11500,10500],totalSupply:0,listed:true},
      {id:"s5",name:"E종목",code:"E001",emoji:"⚫",prices:[10000,10800,11800,10200,17000],totalSupply:0,listed:true},
    ],
    shopItems:[
      {id:"sh1",name:"급등 예고 알림",desc:"다음 라운드 급등 종목 1개만 공개",price:1500000,emoji:"🚀",hint:"🚀 급등 예고\n5라운드에서 B종목과 E종목이 동시 급등!\nB종목 7,000→16,000 (+128%), E종목 10,200→17,000 (+67%)\n4라운드에 저점 매수 필수!"},
      {id:"sh2",name:"블라인드 완전 공개",desc:"3라운드 블라인드 전 종목 가격 공개",price:2400000,emoji:"🔓",hint:"🔓 3라운드 실제 가격\nA종목: 9,000 (▼)\nB종목: 13,000 (▲)\nC종목: 10,500 (→)\nD종목: 8,000 (▼▼)\nE종목: 11,800 (▲)\n→ D종목 절대 보유금지!"},
      {id:"sh3",name:"수수료 절약 전략",desc:"0.3% 수수료 최소화 투자 전략 가이드",price:600000,emoji:"💡",hint:"💡 수수료 절약 전략\n매 라운드 매매하면 수수료로 자산 3% 소모!\n핵심 종목만 골라 2~3번만 매매하세요.\n추천: 1라운드 매수 → 4~5라운드 매도 장기 보유"},
      {id:"sh4",name:"레버리지 타이밍",desc:"레버리지 x2 투자 최적 타이밍 공개",price:1800000,emoji:"⚡",hint:"⚡ 레버리지 최적 타이밍\n4라운드에 B종목 x2 레버리지 매수!\n7,000→16,000 상승 시 레버리지 수익률 228%\n단, 수수료 0.3%×2=0.6% 적용됨 주의"},
    ],
    eventPresets:[
      {id:"e1",name:"플래시 크래시",emoji:"💥",desc:"알고리즘 오작동으로 순간 급락",globalEffect:-15,stockEffects:{s1:-20,s4:-25,s2:-10,s3:-8,s5:-12},note:"순간 급락",autoTrigger:true,triggerIntervalMin:1,triggerIntervalMax:2,probability:50,duration:60,affectTarget:true},
      {id:"e2",name:"뉴스 호재 폭탄",emoji:"📢",desc:"복수 기업 동시 호재 발표",globalEffect:12,stockEffects:{s2:20,s5:18,s1:10,s3:8,s4:5},note:"급등",autoTrigger:true,triggerIntervalMin:1,triggerIntervalMax:2,probability:50,duration:60,affectTarget:true},
      {id:"e3",name:"공매도 세력 등장",emoji:"🐻",desc:"헤지펀드 대규모 공매도",globalEffect:-8,stockEffects:{s1:-18,s3:-12,s2:-5,s4:-10,s5:-8},note:"A·D 급락",autoTrigger:true,triggerIntervalMin:1,triggerIntervalMax:3,probability:45,duration:90,affectTarget:true},
      {id:"e4",name:"개미 투자자 결집",emoji:"🐜",desc:"SNS 결집으로 특정 종목 급등",globalEffect:5,stockEffects:{s2:30,s4:15,s1:5,s3:5,s5:8},note:"B종목 폭등",autoTrigger:true,triggerIntervalMin:2,triggerIntervalMax:3,probability:40,duration:90,affectTarget:true},
      {id:"e5",name:"서킷브레이커",emoji:"🛑",desc:"급등으로 거래 일시 정지",globalEffect:-5,stockEffects:{s5:-20,s2:-15,s1:-8,s3:-5,s4:-10},note:"전체 조정",autoTrigger:false,triggerIntervalMin:2,triggerIntervalMax:4,probability:25,duration:0,affectTarget:true},
    ],
  },
  {
    id:"tpl6", name:"🎓 로(路) 공식전 (43분)", builtIn:true,
    desc:"개인 50만원 시작, 3라운드, 10종목, 베팅+거시/종목 힌트 포함 공식 세팅",
    initCash:500000, maxRound:3, feeRate:0.1,
    leverageEnabled:false, leverageMax:2,
    betEnabled:true, betBaseOdds:1.8, betDynamic:true,
    betMinAmount:10, betMaxRatio:100, betDuration:180,
    timelineSteps:[
      {id:"bet1",  label:"1라운드 베팅",     type:"betting",duration:180,round:1},
      {id:"round1",label:"1라운드 매매",     type:"round",  duration:600,round:1},
      {id:"result1",label:"1라운드 종가",    type:"result", duration:60, round:1},
      {id:"bet2",  label:"2라운드 베팅",     type:"betting",duration:180,round:2},
      {id:"round2",label:"2라운드 매매",     type:"round",  duration:600,round:2},
      {id:"result2",label:"2라운드 종가",    type:"result", duration:60, round:2},
      {id:"round3",label:"3라운드 매매",     type:"round",  duration:600,round:3},
      {id:"result3",label:"최종 결과",       type:"result", duration:300,round:3},
    ],
    rounds:[
      {id:"r1",label:"Round 1",durationMin:10,blind:false,dividends:{}},
      {id:"r2",label:"Round 2",durationMin:10,blind:false,dividends:{}},
      {id:"r3",label:"Round 3",durationMin:10,blind:false,dividends:{}},
    ],
    stocks:[
      {id:"s1",name:"A 엔터",code:"AENT",emoji:"🎤",initialPrice:8000,prices:[10240,8190,9660],totalSupply:0,listed:true},
      {id:"s2",name:"B 엔터",code:"BENT",emoji:"🎬",initialPrice:12000,prices:[11040,9050,11040],totalSupply:0,listed:true},
      {id:"s3",name:"C IT",code:"CIT",emoji:"💻",initialPrice:20000,prices:[21000,24150,28980],totalSupply:0,listed:true},
      {id:"s4",name:"D IT",code:"DIT",emoji:"🖥️",initialPrice:50000,prices:[51500,40170,46200],totalSupply:0,listed:true},
      {id:"s5",name:"E 바이오",code:"EBIO",emoji:"🧬",initialPrice:15000,prices:[16200,12150,17980],totalSupply:0,listed:true},
      {id:"s6",name:"F 바이오",code:"FBIO",emoji:"🧪",initialPrice:3000,prices:[3120,2180,2440],totalSupply:0,listed:true},
      {id:"s7",name:"G 식품",code:"GFOOD",emoji:"🍞",initialPrice:9000,prices:[10620,9340,11210],totalSupply:0,listed:true},
      {id:"s8",name:"H 뷰티",code:"HBEAU",emoji:"💄",initialPrice:25000,prices:[15500,10850,1],totalSupply:0,listed:true,
        autoDelist:{round:3,phase:"roundStart",forceSell:true,reason:"3라운드 상장폐지"}},
      {id:"s9",name:"I 화학",code:"ICHEM",emoji:"🧫",initialPrice:10000,prices:[10600,6150,2770],totalSupply:0,listed:true},
      {id:"s10",name:"J 조선",code:"JSHIP",emoji:"🚢",initialPrice:30000,prices:[31500,25200,13100],totalSupply:0,listed:true},
    ],
    shopItems:[
      {id:"sh1",name:"1라운드 거시 힌트",desc:"1라운드 전체 시장 방향성",pointPrice:4,emoji:"🌐",hint:"글로벌 증시가 특별한 모멘텀 없이 방향성을 잡지 못하고 있다. 개별 종목의 이슈가 주가를 좌우하는 장세이며, 시장 전체보다는 종목 선택이 수익을 결정하는 구간이다."},
      {id:"sh2",name:"2라운드 거시 힌트",desc:"2라운드 전체 시장 방향성",pointPrice:4,emoji:"🦠",hint:"국내외에서 원인 불명의 신종 감염병이 빠르게 확산되며 사회 전반이 공포에 휩싸이고 있다. 외국인과 기관이 동시에 매도에 나서며 증시 전체가 패닉셀 국면에 진입했다."},
      {id:"sh3",name:"3라운드 거시 힌트",desc:"3라운드 전체 시장 방향성",pointPrice:4,emoji:"📈",hint:"감염병 백신 개발 성공 소식과 함께 억눌렸던 소비·투자 심리가 한꺼번에 분출되고 있다. 외국인 자금이 빠르게 재유입되며 증시 전반이 강한 반등 흐름을 타고 있다."},
      {id:"sh4",name:"A 엔터 힌트",desc:"A 엔터 라운드별 종목 힌트",pointPrice:2,emoji:"🎤",hint:"[1라운드]\n1. 이 회사 소속 아티스트가 최근 해외 대형 페스티벌 헤드라이너로 공식 확정됐다는 소식이 음악 업계 내부에서 흘러나오고 있다.\n2. 올해 이 회사의 앨범 발매 스케줄이 역대 가장 빽빽하게 잡혀 있으며, 음반·음원 매출이 사상 최대를 기록할 것이라는 전망이 나온다.\n3. 이 회사 소속 아티스트의 글로벌 팬덤 규모가 전년 대비 40% 이상 성장했으며, 해외 법인 설립 검토에 들어갔다는 소식이 있다.\n\n[2라운드]\n1. 이 회사 소속 아티스트가 해외 유명 시상식 후보에 올라 팬들의 투표 열기가 뜨겁다. 수상 여부는 아직 미정이다.\n2. 이 회사는 올해 신규 앨범 제작에 전년 대비 40% 많은 제작비를 투입했으며, 결과물에 대한 내부 기대감이 높다고 한다.\n3. 이 회사 소속 아티스트의 SNS 팔로워가 꾸준히 늘고 있으며, 브랜드 협업 문의도 이어지고 있다는 소식이다.\n※ 거시 힌트 보유 시: 감염병 대유행으로 공연·투어 전면 취소 위기. 제작비 40% 증가는 유동성 악화 요인. 팔로워 증가는 매출로 이어지기 어려운 상황.\n\n[3라운드]\n1. 이 회사 소속 아이돌의 컴백 앨범 선주문량이 역대 최고치를 경신했으며, 초동 판매량이 전작 대비 두 배를 넘길 것이라는 예측이 나온다.\n2. 억눌렸던 공연 수요가 폭발하며 이 회사 소속 아티스트의 투어 일정이 완판 행진을 이어가고 있다는 소식이다.\n3. 이 회사가 MD(굿즈) 사업을 별도 법인으로 분리해 직접 운영할 계획이라는 내부 소식이 흘러나오고 있다."},
      {id:"sh5",name:"B 엔터 힌트",desc:"B 엔터 라운드별 종목 힌트",pointPrice:2,emoji:"🎬",hint:"[1라운드]\n1. 이 회사 소속 배우의 주연 드라마가 편성 확정됐으나, 방영 전부터 유사 소재 논란이 일고 있어 흥행 여부가 불투명하다.\n2. 이 회사의 올해 제작비 지출이 전년 대비 30% 늘어났으나 매출은 그에 못 미쳐 수익성이 악화될 우려가 있다.\n3. 소속 배우 두 명의 전속 계약이 연내 만료 예정이며, 재계약 협상이 난항을 겪고 있다는 소문이 연예계에 돌고 있다.\n\n[2라운드]\n1. 이 회사 소속 배우가 출연 중인 드라마의 시청률이 초반 대비 소폭 하락했으나, 후반부 반전 전개에 대한 기대감이 커지고 있다.\n2. 이 회사가 내년 라인업을 대폭 확충하겠다는 계획을 내부적으로 발표했으며, 신인 발굴을 위한 오디션을 준비 중이라고 한다.\n3. 이 회사의 주요 소속 배우가 복수의 광고 촬영을 소화 중이며, 모델 계약 문의가 꾸준히 들어오고 있다는 소식이다.\n※ 거시 힌트 보유 시: 감염병으로 드라마 촬영 중단 가능성 있음. 내년 라인업은 올해 실적 공백. 광고주 집행 예산 축소 시 계약 유지가 불투명하다.\n\n[3라운드]\n1. 이 회사 소속 배우가 회사 옥상에 꾸민 비밀 정원이 SNS에서 화제가 되며 브랜드 이미지가 훈훈하게 회복되고 있다.\n2. OTT 플랫폼 두 곳이 이 회사와 단독 콘텐츠 공급 계약을 놓고 경쟁 입찰 중이며, 협상 금액이 상당하다는 소식이 있다.\n3. 신인 그룹 데뷔 프로젝트가 내부 검토를 통과했으며, 연내 데뷔를 목표로 제작이 본격화됐다는 내부 소식이 있다."},
      {id:"sh6",name:"C IT 힌트",desc:"C IT 라운드별 종목 힌트",pointPrice:2,emoji:"💻",hint:"[1라운드]\n1. 이 회사 제품이 글로벌 IT 전문 매체의 올해 주목할 부품사 리스트에 이름을 올렸다는 소식이 전해졌다.\n2. 이 회사의 올해 수주 파이프라인이 작년보다 2배 이상 늘어났으며, 특정 글로벌 고객사와의 협의가 막바지 단계라는 말이 나온다.\n3. 자율주행 관련 부품 특허를 올해만 15건 이상 출원했으며, 경쟁사 대비 기술 격차가 벌어지고 있다는 업계 평가가 있다.\n\n[2라운드]\n1. 이 회사가 특정 글로벌 완성차 업체와의 협의 결과를 조만간 공식 발표할 것이라는 소문이 업계에 퍼지고 있다.\n2. 이 회사의 자율주행 부품 관련 특허가 해외 전문기관에서 높은 평가를 받았으며, 기술 우위가 지속되고 있다는 분석이 나왔다.\n3. 이 회사의 신규 고객사 확보 속도가 업계 평균보다 빠르며, 영업 조직이 크게 확대됐다는 소식이다.\n※ 거시 힌트 보유 시: 감염병 대폭락장이지만 C IT는 애플 독점 계약이라는 확정 호재가 임박. 폭락장에서도 역주행 가능.\n\n[3라운드]\n1. 이 회사 CEO가 국제 IT 포럼에서 차세대 배터리 기술을 직접 시연해 전 세계 언론의 집중 조명을 받았다.\n2. 글로벌 스마트기기 업체 두 곳이 이 회사의 신기술을 동시에 테스트 중이며, 업계에서는 이미 본계약 체결이 확실시된다는 분위기다.\n3. 이 회사의 신규 배터리 기술 관련 특허 수가 경쟁사 전체를 합친 것보다 많다는 분석 자료가 공개됐다."},
      {id:"sh7",name:"D IT 힌트",desc:"D IT 라운드별 종목 힌트",pointPrice:2,emoji:"🖥️",hint:"[1라운드]\n1. 이 회사가 올해 출시할 신규 플랫폼이 베타 테스트에서 높은 완성도를 보였다는 내부 평가가 흘러나오고 있다.\n2. 올해 매출 목표를 상향 조정했다는 내부 소식이 있으며, 신규 B2B 계약이 예상보다 빠르게 체결되고 있다.\n3. 경쟁사 대비 개발 인력 규모는 작지만 1인당 생산성이 업계 최고 수준이라는 외부 평가 보고서가 나왔다.\n\n[2라운드]\n1. 이 회사 사옥 이전 또는 리모델링 관련 계획이 내부적으로 검토되고 있다는 소문이 돌고 있으며, 직원들 사이에서도 화제가 되고 있다.\n2. 이 회사는 현금 보유액이 넉넉하고 부채가 거의 없어 재무 건전성 면에서 업계 최상위권에 속한다는 평가가 나왔다.\n3. 이 회사가 클라우드 인프라 전환을 완료해 내부 운영 효율이 높아졌다는 소식이 있으며, 비용 구조가 개선되고 있다.\n※ 거시 힌트 보유 시: 재무 건전성은 사실이나 감염병 충격으로 B2B 계약이 연기·취소될 가능성 있음. 풍수지리 찌라시가 하락장과 겹치면 더 민감하게 반응한다.\n\n[3라운드]\n1. 이 회사가 대기업 그룹사와 IT 시스템 구축 장기 계약을 체결했다는 소식이 업계에서 흘러나오고 있다.\n2. 신규 사업 부문의 분기 매출이 처음으로 흑자를 기록했으며, 내년에는 전사 이익의 30%를 담당할 것이라는 전망이 나왔다.\n3. 스타트업 M&A를 통해 핵심 기술 두 가지를 한 번에 확보했다는 소식이 IT 업계에서 화제가 되고 있다."},
      {id:"sh8",name:"E 바이오 힌트",desc:"E 바이오 라운드별 종목 힌트",pointPrice:2,emoji:"🧬",hint:"[1라운드]\n1. 이 회사 항암 신약이 임상 2상을 성공적으로 마쳤으며, 3상 진입이 조만간 공식 발표될 것이라는 학계 소문이 돌고 있다.\n2. 이 회사의 파이프라인 가치를 재평가한 증권사 리포트가 나왔으며, 적정 주가가 현재보다 60% 높다는 분석이 담겼다.\n3. 글로벌 제약사가 이 회사 신약 기술이전에 관심을 보이며 비밀 유지 협약(NDA)을 체결했다는 소식이 업계에 퍼졌다.\n\n[2라운드]\n1. 이 회사가 진행 중인 임상시험의 중간 점검 결과 발표가 수개월 후로 예정돼 있으며, 학계의 관심이 높아지고 있다.\n2. 이 회사 연구팀이 최근 국제 학술대회에서 신약 후보물질 관련 발표를 진행했으며, 청중 반응이 우호적이었다는 후기가 전해졌다.\n3. 이 회사의 올해 R&D 투자 비중이 매출 대비 역대 최고 수준이며, 내년 임상 데이터 공개에 대한 내부 기대감이 크다고 한다.\n※ 거시 힌트 보유 시: 감염병 공포로 항암제보다 치료제·백신 관련주에 자금 쏠림. E 바이오는 단기 모멘텀이 없어 하락장에서 소외되지만 3라운드 반전 포석이 있다.\n\n[3라운드]\n1. 임상 3상 최종 통과 이후 글로벌 빅파마 3곳이 기술이전 실사를 동시에 신청했다는 소식이 업계를 뒤흔들고 있다.\n2. 국내 건강보험 급여 등재 협의가 예상보다 빠르게 진행되고 있으며, 연내 급여 적용 가능성이 높다는 소식이 전해졌다.\n3. 첫 달 처방 건수가 내부 예측치의 두 배를 넘겼으며, 초기 시장 반응이 기대 이상이라는 영업팀 내부 보고가 유출됐다."},
      {id:"sh9",name:"F 바이오 힌트",desc:"F 바이오 라운드별 종목 힌트",pointPrice:2,emoji:"🧪",hint:"[1라운드]\n1. 이 회사가 연구하는 희귀질환 분야는 경쟁사가 거의 없어 시장 독점 가능성이 높지만, 시장 자체의 크기가 작다는 한계가 있다.\n2. 정부 희귀의약품 R&D 지원 사업 대상으로 선정됐으며, 3년간 연구비를 지원받게 됐다는 공시가 나왔다.\n3. 이 회사 연구팀 핵심 인력이 전 직장에서 유사 파이프라인을 성공적으로 완료한 경험이 있다는 사실이 업계에서 주목받고 있다.\n\n[2라운드]\n1. 이 회사의 연구 성과가 국내 희귀질환 학회에서 긍정적인 평가를 받았으며, 향후 임상 전망에 대한 기대감이 유지되고 있다.\n2. 이 회사가 내년 임상 진입을 위한 준비를 착실히 진행 중이라는 소식이 있으며, 규제 당국과의 사전 미팅도 일정대로 이뤄지고 있다.\n3. 소규모 바이오 기업임에도 이 회사의 기술력이 업계 내에서 꾸준히 회자되고 있으며, 협업 제안도 꾸준히 들어오고 있다고 한다.\n※ 거시 힌트 보유 시: 감염병 대유행 시 소형 바이오는 가장 먼저 대규모 매도된다. 임상이 내년이라 당장 현금 창출이 없고 기관·외국인 이탈이 빠르다.\n\n[3라운드]\n1. VC 추가 투자 유치가 마무리 단계에 있으며, 기존 주주들도 전원 참여하는 방향으로 협의됐다는 소식이 있다.\n2. 이 회사가 내년 임상 2상 진입을 공식화했으며, 파이프라인 확장 계획도 함께 발표할 것이라는 소문이 돌고 있다.\n3. 해외 희귀질환 환자 단체가 이 회사 치료제의 조기 도입을 촉구하는 공개 서한을 발표했다는 소식이 전해졌다."},
      {id:"sh10",name:"G 식품 힌트",desc:"G 식품 라운드별 종목 힌트",pointPrice:2,emoji:"🍞",hint:"[1라운드]\n1. 건설 경기 호황으로 공사 현장 수가 늘어나며 B2B 식자재 수요가 급증하고 있고, 이 회사가 주요 수혜주로 거론되고 있다.\n2. 이 회사의 편의점 채널 납품 단가를 인상하는 협상이 완료됐으며, 올해 하반기부터 마진이 개선될 전망이다.\n3. 신제품 3종이 출시 첫 주에 편의점 판매 상위 10위 안에 진입했다는 내부 집계 자료가 유출됐다.\n\n[2라운드]\n1. 이 회사 주력 제품 라인의 소비자 인지도가 꾸준하게 유지되고 있으며, 시장 점유율이 전년 수준을 유지하고 있다.\n2. 대형 유통사와의 납품 계약 갱신이 예정대로 완료됐으며, 내년 물량 협의도 진행 중이라는 소식이다.\n3. 이 회사 회장이 사내 이미지 쇄신을 위해 브랜드 전면 개편을 검토 중이라는 소문이 사내에 퍼지고 있다.\n※ 거시 힌트 보유 시: 식품주는 방어주지만 감염병으로 외식·급식 채널 매출이 급감한다. 점유율 유지는 성장 부재를 뜻하고, 브랜드 개편은 비용 부담이다.\n\n[3라운드]\n1. 이 회사 시리얼 제품 표기 오류가 자진 시정으로 마무리됐으며 재무적 영향이 거의 없다는 내부 보고가 나왔다.\n2. 회복 소비 심리에 힘입어 이 회사 신제품 판매량이 출시 대비 150% 급증했다는 소식이 유통업계에 퍼지고 있다.\n3. 경쟁사들이 이 회사의 공격적인 신제품 라인업을 경계하며 방어적 마케팅에 나서고 있다는 소식이다."},
      {id:"sh11",name:"H 뷰티 힌트",desc:"H 뷰티 라운드별 종목 힌트",pointPrice:2,emoji:"💄",hint:"[1라운드]\n1. 이 회사 파우더 제품에서 발암물질이 검출됐다는 소비자 단체 발표가 SNS를 통해 빠르게 확산되며 불매 운동이 시작됐다.\n2. 주요 H&B 스토어 전 채널에서 이 회사 제품 판매가 중단됐으며, 리콜 비용이 영업이익의 절반 이상을 갉아먹을 것이라는 추정치가 나왔다.\n3. 경쟁 뷰티 브랜드들이 이 회사의 유통 공백을 노리고 매대 확보에 나서며 시장 점유율 탈환 움직임이 본격화됐다.\n\n[2라운드]\n1. 이 회사가 문제 제품 관련 자체 조사를 진행 중이며, 결과 발표 전까지 추가 입장을 내지 않겠다고 밝혔다.\n2. 이 회사의 해외 사업 일부 라인은 이번 이슈와 무관하게 정상 운영되고 있으며, 수출 물량은 현재까지 큰 변동이 없다는 소식이다.\n3. 이 회사 내부적으로 브랜드 신뢰 회복을 위한 프리미엄 신제품 라인 기획이 진행 중이라는 소문이 돌고 있다.\n※ 거시 힌트 보유 시: 감염병 대폭락장에서 기존 악재가 해소되지 않은 종목은 이중 타격을 받는다. 3라운드 상장폐지로 이어지는 포석이다.\n\n[3라운드]\n1. 이 회사가 발표한 피해 보상안이 소비자 단체로부터 턱없이 부족하다는 비판을 받으며 추가 협의가 장기화될 전망이다.\n2. 이번 분기 대규모 충당금 설정이 불가피하며, 연간 기준 적자 전환 가능성이 높다는 증권사 보고서가 나왔다.\n3. 상장 유지 요건 충족 여부를 거래소가 검토 중이라는 소식이 흘러나오며, 업계에서는 상장폐지 가능성을 심각하게 거론하고 있다."},
      {id:"sh12",name:"I 화학 힌트",desc:"I 화학 라운드별 종목 힌트",pointPrice:2,emoji:"🧫",hint:"[1라운드]\n1. 전기차 시장 성장세에 힘입어 배터리 소재 업계 전반의 수주가 늘고 있으며, 이 회사도 수혜를 받을 것이라는 전망이 나오고 있다.\n2. 이 회사가 정부 배터리 소재 국산화 지원 사업의 주요 수혜 기업으로 선정됐으며, 보조금 규모가 상당하다는 소식이다.\n3. 이 회사 공장 증설 투자가 예정대로 진행 중이며, 내년 상반기 완공 시 생산 능력이 현재의 1.8배로 늘어난다는 계획이 확인됐다.\n\n[2라운드]\n1. 이 회사가 공급 중인 일부 배터리 제품에 대해 글로벌 완성차 업체가 추가 품질 검증을 요청했으며, 현재 협의가 진행 중이다.\n2. 이 회사는 현재 공장 가동률을 일부 조정 중이며, 이는 신규 라인 도입을 위한 일시적 조치라고 회사 측은 설명했다.\n3. 배터리 소재 업계 전반에서 기술 고도화 경쟁이 치열해지고 있으며, 이 회사도 품질 개선을 위한 내부 점검을 진행 중이라는 소식이다.\n※ 거시 힌트 보유 시: 추가 품질 검증과 가동률 조정은 대규모 리콜의 전조다. 감염병 대폭락장과 겹치면 이중 폭락 위험이 크다.\n\n[3라운드]\n1. 이 회사의 배터리 리콜 규모가 당초 예상의 3배에 달하는 것으로 밝혀졌으며, 추가 손실 충당금 적립이 불가피하다는 소식이다.\n2. 주거래 은행이 이 회사에 대한 추가 신용 공여를 거절했다는 소문이 금융권에 돌고 있으며, 유동성 위기 우려가 커지고 있다.\n3. 이 회사가 공장 일부를 매각하는 방안을 검토 중이라는 소식이 전해지며, 업계에서는 구조조정 가능성을 심각하게 보고 있다."},
      {id:"sh13",name:"J 조선 힌트",desc:"J 조선 라운드별 종목 힌트",pointPrice:2,emoji:"🚢",hint:"[1라운드]\n1. 글로벌 해운 물동량 증가와 노후 선박 교체 수요가 맞물리며 대형 선박 발주가 급증하고 있고, 이 회사가 수주 1순위로 꼽히고 있다.\n2. 이 회사의 현재 수주 잔고는 약 2.5년치 일감이며, 달러 강세로 인해 원화 환산 수익성이 크게 개선되고 있다.\n3. LNG 운반선 시장에서 이 회사가 독점적 기술력을 인정받으며, 경쟁사가 따라오지 못하는 영역이 생겼다는 업계 평가가 나오고 있다.\n\n[2라운드]\n1. 이 회사가 수주 협의 중인 대형 프로젝트 몇 건의 계약 일정이 발주처 측 사정으로 수개월 지연됐다는 소식이 있다.\n2. 이 회사의 주요 거래처 중 한 곳이 최근 자금 조달 시장에서 어려움을 겪고 있다는 소문이 조선 업계에 퍼지고 있다.\n3. 이 회사는 현재 수주 협의를 여러 건 병행하고 있으며, 연내 한두 건의 계약이 체결될 것이라는 낙관적 전망을 유지하고 있다.\n※ 거시 힌트 보유 시: 계약 지연과 거래처 자금난은 계약 취소의 전조다. 감염병으로 글로벌 해운 물동량이 급감하면 발주 자체가 사라질 수 있다.\n\n[3라운드]\n1. 이 회사의 수조 원 규모 계약 취소로 인해 협력업체 수백 곳의 일감이 사라졌으며, 지역 경제 붕괴 우려까지 나오고 있다.\n2. 해당 프로젝트에 이미 투입된 원자재·설계 비용 회수가 불투명하며, 법적 분쟁으로 이어질 경우 수년간 자금이 묶일 수 있다.\n3. 이 회사의 부채비율이 임계치를 넘어설 것이라는 증권사 보고서가 나왔으며, 워크아웃 가능성까지 거론되고 있다."},
    ],
    eventPresets:[
      {id:"e1",name:"1R 호재 확정 - A 엔터",emoji:"🏆",desc:"A엔터 연예인 MJJ 빌보드 1위 등극 후 세계에서 가장 영향력 있는 인물로 선정",globalEffect:0,stockEffects:{s1:18},note:"1라운드 대표 호재",autoTrigger:false,triggerIntervalMin:1,triggerIntervalMax:2,probability:100,duration:90,affectTarget:true},
      {id:"e2",name:"1R 치명 악재 - H 뷰티",emoji:"☣️",desc:"H뷰티 화장품 파우더에서 1급 발암물질인 석면 검출",globalEffect:0,stockEffects:{s8:-28},note:"1라운드 대표 악재",autoTrigger:false,triggerIntervalMin:1,triggerIntervalMax:2,probability:100,duration:120,affectTarget:true},
      {id:"e3",name:"1R 황당 찌라시 - G 식품",emoji:"🍽️",desc:"공사장 인부들 새참이 떡에서 호빵으로 변경",globalEffect:0,stockEffects:{s7:12},note:"1라운드 찌라시 수혜",autoTrigger:false,triggerIntervalMin:1,triggerIntervalMax:2,probability:100,duration:90,affectTarget:true},
      {id:"e4",name:"2R 호재 확정 - C IT",emoji:"🍎",desc:"C IT, 글로벌 기업 애플과 차세대 자율주행차 핵심 부품 독점 공급 계약 체결",globalEffect:0,stockEffects:{s3:20},note:"폭락장 역주행 호재",autoTrigger:false,triggerIntervalMin:1,triggerIntervalMax:2,probability:100,duration:120,affectTarget:true},
      {id:"e5",name:"2R 치명 악재 - I 화학",emoji:"🔋",desc:"I화학, 주력 배터리 제품 대규모 결함 발견으로 전 세계 전량 리콜 결정",globalEffect:0,stockEffects:{s9:-30},note:"2라운드 대표 악재",autoTrigger:false,triggerIntervalMin:1,triggerIntervalMax:2,probability:100,duration:120,affectTarget:true},
      {id:"e6",name:"2R 황당 찌라시 - D IT",emoji:"🧭",desc:"D IT 사옥 현관 방향이 풍수지리상 재물이 빠지는 수구 방향이라 정문 이전 공사 예정설",globalEffect:0,stockEffects:{s4:-10},note:"폭락장 속 찌라시 악영향",autoTrigger:false,triggerIntervalMin:1,triggerIntervalMax:2,probability:100,duration:90,affectTarget:true},
      {id:"e7",name:"3R 호재 확정 - E 바이오",emoji:"💊",desc:"E바이오, 암세포만 골라 죽이는 꿈의 항암제 임상 3상 최종 통과 및 시판 허가",globalEffect:0,stockEffects:{s5:28},note:"3라운드 폭등 재료",autoTrigger:false,triggerIntervalMin:1,triggerIntervalMax:2,probability:100,duration:120,affectTarget:true},
      {id:"e8",name:"3R 치명 악재 - J 조선",emoji:"⚓",desc:"J조선, 수주했던 수조 원 규모 초대형 유조선 프로젝트 계약 상대측 파산으로 전격 취소",globalEffect:0,stockEffects:{s10:-26},note:"3라운드 대폭락 재료",autoTrigger:false,triggerIntervalMin:1,triggerIntervalMax:2,probability:100,duration:120,affectTarget:true},
      {id:"e9",name:"3R 황당 찌라시 - G 식품",emoji:"🔴",desc:"G식품 회장님이 꿈에서 조상님 계시를 받아 모든 로고·포장지를 내일부터 빨간색으로 변경 예정",globalEffect:0,stockEffects:{s7:10},note:"3라운드 찌라시 재등장",autoTrigger:false,triggerIntervalMin:1,triggerIntervalMax:2,probability:100,duration:90,affectTarget:true},
    ],
    rules:`📌 기본 설정
• 시작 자금: 50만 원
• 총 3라운드 (라운드당 매매 10분)
• 수수료: 매수·매도 각 0.1%

⏱ 진행 순서
1라운드: 베팅(3분) → 매매(10분) → 종가확인(1분)
2라운드: 베팅(3분) → 매매(10분) → 종가확인(1분)
3라운드: 매매(10분) → 최종결과(5분)

📈 주식 매매
• 라운드 진행 중에만 매수·매도 가능
• 수수료 0.1%가 매수·매도 각각 부과됨

🎲 베팅 (조장 전용)
• 1·2라운드 시작 전 3분간 진행 (3라운드 베팅 없음)
• 종목별로 상승▲ 또는 하락▼ 예측 후 금액 베팅
• 베팅금은 즉시 현금에서 차감, 마감 전 취소 가능
• 적중 시 베팅금 × 배당률 지급 (기본 1.8배)
• 참가자 쏠림에 따라 배당률 1.2~3.0배로 자동 조정
• 동점(가격 변동 없음)은 실패 처리

💎 다이아몬드 상점 (조장 전용)
• 조장이 구매한 힌트는 같은 조 전원이 열람 가능

🏆 순위
• 개인 순위: 현금 + 보유주식 평가액 (총자산 기준)
• 조 순위: 같은 조 구성원 총자산 합산`,
  },
  {
    id:"tpl7", name:"⚡ 단기 집중전 (25분)", builtIn:true,
    desc:"2라운드 압축 버전, 빠른 의사결정 훈련",
    initCash:1000000, maxRound:2, feeRate:0.2,
    leverageEnabled:false, leverageMax:2,
    betEnabled:true, betBaseOdds:2.0, betDynamic:false,
    betMinAmount:10, betMaxRatio:100, betDuration:120,
    timelineSteps:[
      {id:"bet1",  label:"1라운드 베팅",  type:"betting",duration:120,round:1},
      {id:"round1",label:"1라운드 매매",  type:"round",  duration:480,round:1},
      {id:"result1",label:"1라운드 종가", type:"result", duration:60, round:1},
      {id:"bet2",  label:"2라운드 베팅",  type:"betting",duration:120,round:2},
      {id:"round2",label:"2라운드 매매",  type:"round",  duration:480,round:2},
      {id:"result2",label:"최종 결과",    type:"result", duration:240,round:2},
    ],
    rounds:[
      {id:"r1",label:"Round 1",durationMin:8,blind:false,dividends:{}},
      {id:"r2",label:"Round 2",durationMin:8,blind:false,dividends:{}},
    ],
    stocks:[
      {id:"s1",name:"A기업",code:"A001",emoji:"🔴",prices:[100000,130000],totalSupply:0,listed:true},
      {id:"s2",name:"B기업",code:"B001",emoji:"🔵",prices:[100000,80000],totalSupply:0,listed:true},
      {id:"s3",name:"C기업",code:"C001",emoji:"🟢",prices:[100000,115000],totalSupply:0,listed:true},
      {id:"s4",name:"D기업",code:"D001",emoji:"🟡",prices:[100000,95000],totalSupply:0,listed:true},
      {id:"s5",name:"E기업",code:"E001",emoji:"⚫",prices:[100000,140000],totalSupply:0,listed:true},
    ],
    shopItems:[
      {id:"sh1",name:"급등주 예고",desc:"2라운드 급등 예상 종목 공개",pointPrice:40,emoji:"🚀",hint:"운영자가 설정합니다"},
      {id:"sh2",name:"급락주 경고",desc:"2라운드 급락 예상 종목 공개",pointPrice:40,emoji:"⚠️",hint:"운영자가 설정합니다"},
    ],
  },
  {
    id:"tpl8", name:"🎭 블라인드 심화전 (43분)", builtIn:true,
    desc:"2라운드가 블라인드, 정보 비대칭 극대화",
    initCash:1000000, maxRound:3, feeRate:0.1,
    leverageEnabled:false, leverageMax:2,
    betEnabled:true, betBaseOdds:2.5, betDynamic:true,
    betMinAmount:10, betMaxRatio:100, betDuration:180,
    timelineSteps:[
      {id:"bet1",  label:"1라운드 베팅",     type:"betting",duration:180,round:1},
      {id:"round1",label:"1라운드 매매",     type:"round",  duration:600,round:1},
      {id:"result1",label:"1라운드 종가",    type:"result", duration:60, round:1},
      {id:"bet2",  label:"2라운드 베팅",     type:"betting",duration:180,round:2},
      {id:"round2",label:"2라운드 매매(🙈)", type:"round",  duration:600,round:2},
      {id:"result2",label:"2라운드 종가",    type:"result", duration:60, round:2},
      {id:"round3",label:"3라운드 매매",     type:"round",  duration:600,round:3},
      {id:"result3",label:"최종 결과",       type:"result", duration:300,round:3},
    ],
    rounds:[
      {id:"r1",label:"Round 1",durationMin:10,blind:false,dividends:{}},
      {id:"r2",label:"Round 2",durationMin:10,blind:true, dividends:{}},
      {id:"r3",label:"Round 3",durationMin:10,blind:false,dividends:{}},
    ],
    stocks:[
      {id:"s1",name:"삼성전자",code:"005930",emoji:"💎",prices:[50000,62000,55000],totalSupply:0,listed:true},
      {id:"s2",name:"카카오",code:"035720",emoji:"🟡",prices:[45000,35000,50000],totalSupply:0,listed:true},
      {id:"s3",name:"네이버",code:"035420",emoji:"🟢",prices:[180000,200000,175000],totalSupply:0,listed:true},
      {id:"s4",name:"현대자동차",code:"005380",emoji:"🚗",prices:[95000,110000,90000],totalSupply:0,listed:true},
      {id:"s5",name:"LG에너지솔루션",code:"373220",emoji:"⚡",prices:[420000,380000,450000],totalSupply:0,listed:true},
    ],
    shopItems:[
      {id:"sh1",name:"블라인드 해제 힌트",desc:"2라운드 블라인드 예상가 범위 공개",pointPrice:80,emoji:"🔓",hint:"운영자가 설정합니다"},
      {id:"sh2",name:"방향 힌트",desc:"블라인드 라운드 종목별 방향만 공개",pointPrice:50,emoji:"🧭",hint:"운영자가 설정합니다"},
      {id:"sh3",name:"3라운드 선행 정보",desc:"3라운드 주목 종목 공개",pointPrice:60,emoji:"🔭",hint:"운영자가 설정합니다"},
    ],
  },
  {
    id:"tpl9", name:"💸 배당 수익전 (43분)", builtIn:true,
    desc:"라운드별 배당금이 핵심, 장기보유 전략 필수",
    initCash:1000000, maxRound:3, feeRate:0.1,
    leverageEnabled:false, leverageMax:2,
    betEnabled:true, betBaseOdds:1.8, betDynamic:false,
    betMinAmount:10, betMaxRatio:100, betDuration:180,
    timelineSteps:[
      {id:"bet1",  label:"1라운드 베팅",      type:"betting",duration:180,round:1},
      {id:"round1",label:"1라운드 매매",      type:"round",  duration:600,round:1},
      {id:"result1",label:"1라운드 종가+배당",type:"result", duration:60, round:1},
      {id:"bet2",  label:"2라운드 베팅",      type:"betting",duration:180,round:2},
      {id:"round2",label:"2라운드 매매",      type:"round",  duration:600,round:2},
      {id:"result2",label:"2라운드 종가+배당",type:"result", duration:60, round:2},
      {id:"round3",label:"3라운드 매매",      type:"round",  duration:600,round:3},
      {id:"result3",label:"최종 결과+배당",   type:"result", duration:300,round:3},
    ],
    rounds:[
      {id:"r1",label:"Round 1",durationMin:10,blind:false,dividends:{s1:500,s3:300}},
      {id:"r2",label:"Round 2",durationMin:10,blind:false,dividends:{s2:800,s4:400}},
      {id:"r3",label:"Round 3",durationMin:10,blind:false,dividends:{s1:1000,s3:800,s5:1500}},
    ],
    stocks:[
      {id:"s1",name:"삼성전자",code:"005930",emoji:"💎",prices:[50000,54000,58000],totalSupply:0,listed:true},
      {id:"s2",name:"카카오",code:"035720",emoji:"🟡",prices:[45000,47000,50000],totalSupply:0,listed:true},
      {id:"s3",name:"네이버",code:"035420",emoji:"🟢",prices:[180000,184000,190000],totalSupply:0,listed:true},
      {id:"s4",name:"현대자동차",code:"005380",emoji:"🚗",prices:[95000,97000,100000],totalSupply:0,listed:true},
      {id:"s5",name:"LG에너지솔루션",code:"373220",emoji:"⚡",prices:[420000,428000,440000],totalSupply:0,listed:true},
    ],
    shopItems:[
      {id:"sh1",name:"배당 수익률 분석",desc:"전 종목 라운드별 배당 수익률 공개",pointPrice:30,emoji:"📊",hint:"운영자가 설정합니다"},
      {id:"sh2",name:"3라운드 고배당 힌트",desc:"3라운드 배당이 가장 높은 종목 Top2",pointPrice:50,emoji:"💰",hint:"운영자가 설정합니다"},
      {id:"sh3",name:"포트폴리오 추천",desc:"배당+시세차익 최적 포트폴리오",pointPrice:70,emoji:"👑",hint:"운영자가 설정합니다"},
    ],
  },
  {
    id:"tpl10", name:"🌪️ 이벤트 폭풍전 (43분)", builtIn:true,
    desc:"자동 이벤트가 자주 발동, 빠른 대응이 핵심",
    initCash:1000000, maxRound:3, feeRate:0.15,
    leverageEnabled:true, leverageMax:2,
    betEnabled:true, betBaseOdds:2.0, betDynamic:true,
    betMinAmount:10, betMaxRatio:100, betDuration:180,
    timelineSteps:[
      {id:"bet1",  label:"1라운드 베팅",     type:"betting",duration:180,round:1},
      {id:"round1",label:"1라운드 매매",     type:"round",  duration:600,round:1},
      {id:"result1",label:"1라운드 종가",    type:"result", duration:60, round:1},
      {id:"bet2",  label:"2라운드 베팅",     type:"betting",duration:180,round:2},
      {id:"round2",label:"2라운드 매매",     type:"round",  duration:600,round:2},
      {id:"result2",label:"2라운드 종가",    type:"result", duration:60, round:2},
      {id:"round3",label:"3라운드 매매",     type:"round",  duration:600,round:3},
      {id:"result3",label:"최종 결과",       type:"result", duration:300,round:3},
    ],
    rounds:[
      {id:"r1",label:"Round 1",durationMin:10,blind:false,dividends:{}},
      {id:"r2",label:"Round 2",durationMin:10,blind:false,dividends:{}},
      {id:"r3",label:"Round 3",durationMin:10,blind:false,dividends:{}},
    ],
    stocks:[
      {id:"s1",name:"삼성전자",code:"005930",emoji:"💎",prices:[50000,60000,45000],totalSupply:0,listed:true},
      {id:"s2",name:"카카오",code:"035720",emoji:"🟡",prices:[45000,35000,55000],totalSupply:0,listed:true},
      {id:"s3",name:"네이버",code:"035420",emoji:"🟢",prices:[180000,210000,170000],totalSupply:0,listed:true},
      {id:"s4",name:"현대자동차",code:"005380",emoji:"🚗",prices:[95000,115000,80000],totalSupply:0,listed:true},
      {id:"s5",name:"LG에너지솔루션",code:"373220",emoji:"⚡",prices:[420000,460000,390000],totalSupply:0,listed:true},
    ],
    shopItems:[
      {id:"sh1",name:"이벤트 예고",desc:"다음 자동 이벤트 종류 미리 공개",pointPrice:60,emoji:"⚡",hint:"운영자가 설정합니다"},
      {id:"sh2",name:"이벤트 방어막",desc:"다음 이벤트 피해 50% 감소 (효과형)",pointPrice:80,emoji:"🛡️",hint:"이 아이템을 구매하면 다음 이벤트 발동 시 피해가 50% 감소합니다"},
      {id:"sh3",name:"이벤트 내부 정보",desc:"이벤트 발동 시 가장 크게 오를 종목",pointPrice:100,emoji:"💣",hint:"운영자가 설정합니다"},
    ],
    eventPresets:[
      {id:"e1",name:"반도체 수출 급증",emoji:"💾",desc:"글로벌 반도체 수요 폭증",
       globalEffect:8,stockEffects:{s1:25,s5:15,s2:-5,s3:5,s4:3},
       autoTrigger:true,triggerIntervalMin:1,triggerIntervalMax:2,probability:60,duration:90,affectTarget:true},
      {id:"e2",name:"금리 인상 쇼크",emoji:"📉",desc:"기준금리 0.75% 긴급 인상",
       globalEffect:-12,stockEffects:{s2:-20,s3:-15,s1:-8,s4:-5,s5:-10},
       autoTrigger:true,triggerIntervalMin:1,triggerIntervalMax:2,probability:55,duration:120,affectTarget:true},
      {id:"e3",name:"외국인 대규모 매수",emoji:"🌏",desc:"외국인 한국 주식 대량 매입",
       globalEffect:10,stockEffects:{},
       autoTrigger:true,triggerIntervalMin:2,triggerIntervalMax:3,probability:50,duration:60,affectTarget:true},
      {id:"e4",name:"기업 스캔들",emoji:"💣",desc:"대기업 분식회계 발각",
       globalEffect:-15,stockEffects:{s2:-35,s3:-25,s1:-10,s4:-8,s5:-5},
       autoTrigger:true,triggerIntervalMin:2,triggerIntervalMax:3,probability:40,duration:0,affectTarget:true},
      {id:"e5",name:"AI 혁명 발표",emoji:"🤖",desc:"초거대 AI 상용화 발표",
       globalEffect:12,stockEffects:{s1:20,s3:25,s2:15,s5:10,s4:5},
       autoTrigger:true,triggerIntervalMin:2,triggerIntervalMax:4,probability:45,duration:90,affectTarget:true},
    ],
  },
];

// 템플릿 설정에서 timelineSteps 자동 생성
const buildTimelineSteps = (tpl) => {
  const rounds = tpl.rounds || [];
  const betEnabled = tpl.betEnabled ?? false;
  const betDuration = tpl.betDuration ?? 180;
  const steps = [];
  rounds.forEach((r, i) => {
    const roundNum = i + 1;
    const isLast = i === rounds.length - 1;
    if (betEnabled) {
      steps.push({ id:`bet${roundNum}`, label:`${roundNum}라운드 베팅`, type:"betting", duration:betDuration, round:roundNum });
    }
    steps.push({ id:`round${roundNum}`, label:`${roundNum}라운드 매매`, type:"round", duration:(r.durationMin||5)*60, round:roundNum });
    steps.push({ id:`result${roundNum}`, label:isLast?"최종 결과":`${roundNum}라운드 종가`, type:"result", duration:isLast?300:60, round:roundNum });
  });
  return steps;
};

const DEFAULT_EVENT_AUTO={autoTrigger:false,triggerIntervalMin:1,triggerIntervalMax:3,probability:50,duration:60,affectTarget:true};
const makeEventPresets=()=>[
  {id:uid(),name:"코로나 팬데믹",emoji:"🦠",desc:"전 세계 봉쇄령 발동",globalEffect:-15,stockEffects:{},note:"항공·소비재 급락",...DEFAULT_EVENT_AUTO},
  {id:uid(),name:"전쟁 발발",emoji:"⚔️",desc:"지정학적 리스크 고조",globalEffect:-10,stockEffects:{},note:"방산 급등, 성장주 급락",...DEFAULT_EVENT_AUTO},
  {id:uid(),name:"AI 혁명 발표",emoji:"🤖",desc:"초거대 AI 모델 공개",globalEffect:+10,stockEffects:{},note:"기술주 전반 급등",...DEFAULT_EVENT_AUTO},
  {id:uid(),name:"중앙은행 양적완화",emoji:"🏦",desc:"긴급 유동성 3조 달러",globalEffect:+15,stockEffects:{},note:"전 종목 반등",...DEFAULT_EVENT_AUTO},
  {id:uid(),name:"금리 인상 쇼크",emoji:"📉",desc:"연준 긴급 금리 0.75% 인상",globalEffect:-12,stockEffects:{},note:"성장주 급락",...DEFAULT_EVENT_AUTO},
  {id:uid(),name:"대규모 스캔들",emoji:"💣",desc:"분식회계 발각",globalEffect:-20,stockEffects:{},note:"섹터 신뢰 붕괴",...DEFAULT_EVENT_AUTO},
];

const ADMIN_PW="admin1234";
const DEFAULT_INIT_CASH=1_000_000;

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
    {id:"sh1",name:"내부자 제보 A",desc:"특정 종목 다음 라운드 방향",price:2400000,emoji:"🕵️",hint:"힌트를 설정해주세요"},
    {id:"sh2",name:"시장 분석 리포트",desc:"현재 라운드 전체 시장 흐름",price:1500000,emoji:"📊",hint:"힌트를 설정해주세요"},
    {id:"sh3",name:"VIP 정보 패키지",desc:"3라운드 전 종목 방향",price:6000000,emoji:"💡",hint:"힌트를 설정해주세요"},
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
  modifiedTargets: {},
  nextAutoEventAt: null,
  priceHistory: {},
  chatMessages: [],
  tradeOffers: {},
  // 자동 진행
  autoPlay: false,
  breakDuration: 60,
  betWindow: 30,
  breakEndsAt: null,
  betDeadline: null,
  // 베팅
  betEnabled: false,
  baseOdds: 1.8,
  dynamicOdds: false,
  minBet: 100000,
  maxBetPct: 50,
  bets: {},
  betOdds: {},
  eventSnapshots: {},
  diamondsEnabled: true,
  groups: {},
  // 시드 보정
  seedBalancing: true,
  // 자동 타임라인
  timelineAuto: false,
  timelineIndex: -1,
  timelineEndsAt: null,
  currentPhase: "ready",
  currentPhaseDetail: "",
  // ready → betting → round → result → ended
  timelineSteps: [
    { id:"bet1",   label:"1라운드 베팅",     type:"betting", duration:180, round:1 },
    { id:"round1", label:"1라운드 매매",     type:"round",   duration:600, round:1 },
    { id:"result1",label:"1라운드 종가 확인",type:"result",  duration:60,  round:1 },
    { id:"bet2",   label:"2라운드 베팅",     type:"betting", duration:180, round:2 },
    { id:"round2", label:"2라운드 매매",     type:"round",   duration:600, round:2 },
    { id:"result2",label:"2라운드 종가 확인",type:"result",  duration:60,  round:2 },
    { id:"round3", label:"3라운드 매매",     type:"round",   duration:600, round:3 },
    { id:"result3",label:"최종 결과 확인",   type:"result",  duration:300, round:3 },
  ],
  resultHint: "",
  rules: "",
};

const buildFreshTeamsFromCreds = (teamCredentials = {}, existingTeams = {}, initCash = DEFAULT_INIT_CASH) => {
  const freshTeams = {};
  for (const [name, { id, groupName }] of Object.entries(teamCredentials || {})) {
    const existingPoints = existingTeams?.[id]?.diamonds || 0;
    freshTeams[id] = {
      name,
      groupName: groupName || "",
      cash: initCash,
      holdings: { _empty: true },
      purchases: ["_empty"],
      history: ["_empty"],
      borrowed: 0,
      diamonds: existingPoints,
    };
  }
  return freshTeams;
};



/* ══════════════════════════════════════════
   실시간 주가 계산 (선형보간 + 노이즈)
══════════════════════════════════════════ */
const getInitialPrice = (stock) => {
  if (stock?.initialPrice !== undefined) return stock.initialPrice;
  // initialPrice 미설정 시: prices[0]의 90%를 시작가로 유도 → 1라운드도 가격 변동 발생
  const r1 = stock?.prices?.[0] ?? 0;
  return r1 ? Math.round(r1 * 0.90) : 0;
};
const getRoundClosePrice = (stock, round) => {
  if (!stock) return 0;
  const ri = Math.min(Math.max(round - 1, 0), stock.prices.length - 1);
  return stock.prices[ri] ?? getInitialPrice(stock);
};
const getRoundStartPrice = (stock, round) => {
  if (!stock) return 0;
  return round <= 1 ? getInitialPrice(stock) : getRoundClosePrice(stock, round - 1);
};
const getAutoDelistRule = (stock, round, phase = "roundStart") => {
  const rule = stock?.autoDelist;
  if (!rule) return null;
  if ((rule.round ?? null) !== round) return null;
  if ((rule.phase || "roundStart") !== phase) return null;
  return rule;
};
const applyScheduledDelistings = (state, round, phase = "roundStart") => {
  const stocks = Array.isArray(state.stocks) ? state.stocks : [];
  const autoTargets = stocks
    .filter(stock => stock?.listed !== false)
    .map(stock => ({ stock, rule: getAutoDelistRule(stock, round, phase) }))
    .filter(x => !!x.rule);

  if (autoTargets.length === 0) return { nextState: state, delistedNames: [] };

  const teams = { ...(state.teams || {}) };
  const nextStocks = stocks.map(stock => {
    const match = autoTargets.find(x => x.stock.id === stock.id);
    return match
      ? {
          ...stock,
          listed: false,
          autoDelistedAtRound: round,
          autoDelistedAtPhase: phase,
          delistReason: match.rule.reason || "자동 상장폐지",
        }
      : stock;
  });

  for (const { stock, rule } of autoTargets) {
    const settlePrice = Math.max(rule.forceSellPrice ?? getRoundStartPrice(stock, round), 1);
    for (const [tid, tm] of Object.entries(teams)) {
      const qty = tm.holdings?.[stock.id]?.qty || 0;
      if (qty <= 0) continue;
      const proceeds = qty * settlePrice;
      const holdings = { ...(tm.holdings || {}) };
      delete holdings[stock.id];
      teams[tid] = {
        ...tm,
        cash: (tm.cash || 0) + proceeds,
        holdings,
        history: [
          ...(Array.isArray(tm.history) ? tm.history : []),
          {
            time: new Date().toLocaleTimeString("ko-KR"),
            type: "sell",
            stockName: `${stock.name}(자동폐지)`,
            stockEmoji: stock.emoji,
            qty,
            price: settlePrice,
            total: proceeds,
          },
        ],
      };
    }
  }

  const delistedNames = autoTargets.map(({ stock }) => stock.name);
  return {
    nextState: {
      ...state,
      teams,
      stocks: nextStocks,
      notice: `자동 폐지: ${delistedNames.join(", ")}`,
      noticeAt: Date.now(),
    },
    delistedNames,
  };
};

function getCurrentPrice(stock, round, roundStartedAt, roundEndsAt, activeEvent, modifiedTargets, eventSnapshots, phase) {
  if (!stock || round < 1) return getInitialPrice(stock);
  // 라운드 진행 중이 아니면 확정 목표가 반환
  if (phase === "break" || phase === "ended") {
    const ri2 = Math.min(round - 1, stock.prices.length - 1);
    const mod2 = modifiedTargets?.[stock.id];
    return (mod2 && mod2.round === round)
      ? mod2.modifiedPrice
      : stock.prices[ri2] ?? stock.prices[0];
  }
  if (phase === "ready") return stock.prices[0];
  const ri = Math.min(round - 1, stock.prices.length - 1);
  const mod = modifiedTargets?.[stock.id];
  const target = (mod && mod.round === round) ? mod.modifiedPrice : stock.prices[ri];
  const prev = getRoundStartPrice(stock, round);

  // 이벤트 스냅샷: 발동 시점 가격 → 새 목표가로 수렴
  const snap = eventSnapshots?.[stock.id];
  const hasSnap = snap && snap.appliedAt >= (roundStartedAt || 0);

  if (!roundStartedAt || !roundEndsAt) return hasSnap ? snap.basePrice : prev;
  const now = Date.now();
  if (now <= roundStartedAt) return prev;
  if (now >= roundEndsAt) return target;

  let effectiveBase, effectiveTarget, effectiveElapsed, effectiveTotal, seedTs;

  if (hasSnap && snap.appliedAt > roundStartedAt && snap.appliedAt < roundEndsAt) {
    // 이벤트 발동 이후: 발동 시점 가격 → 새 목표가
    effectiveBase = snap.basePrice;
    effectiveTarget = target;
    effectiveElapsed = Math.max(0, now - snap.appliedAt);
    effectiveTotal = roundEndsAt - snap.appliedAt;
    seedTs = snap.appliedAt;
  } else {
    effectiveBase = prev;
    effectiveTarget = target;
    effectiveElapsed = now - roundStartedAt;
    effectiveTotal = roundEndsAt - roundStartedAt;
    seedTs = roundStartedAt;
  }

  const t = Math.min(Math.max(effectiveElapsed / effectiveTotal, 0), 1);
  // 마지막 20% 구간에서 노이즈를 급격히 0으로 수렴
  const noiseDecay = t < 0.8 ? (1 - t) : (1 - t) * ((1 - t) / 0.2);
  const base = effectiveBase + (effectiveTarget - effectiveBase) * t;

  const sid = stock.id?.charCodeAt(0) || 1;
  const sid2 = stock.id?.charCodeAt(1) || 2;
  const SLOT_MS = 3000;
  const currentSlot = Math.floor(effectiveElapsed / SLOT_MS);

  let walk = 0;
  for (let i = 0; i <= currentSlot; i++) {
    const slotSeed = (sid * 1664525 + sid2 * 1013904223 + i * 22695477 + seedTs) & 0x7fffffff;
    const dir = ((slotSeed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff * 2 - 1;
    walk += dir;
  }
  const walkNorm = currentSlot > 0 ? walk / Math.sqrt(currentSlot + 1) : 0;

  const slotSeed2 = (sid * 22695477 + currentSlot * 1664525 + seedTs) & 0x7fffffff;
  const fine = Math.sin(now * 0.0031 + slotSeed2 * 0.0001) * 0.5
             + Math.sin(now * 0.0071 + slotSeed2 * 0.0002) * 0.5;

  const noiseRange = Math.abs(effectiveTarget - effectiveBase) * 0.20 * noiseDecay;
  let price = Math.round(base + walkNorm * noiseRange * 0.6 + fine * noiseRange * 0.4);

  if (activeEvent) {
    const eff = activeEvent.stockEffects?.[stock.id] ?? activeEvent.globalEffect ?? 0;
    price = Math.round(price * (1 + eff / 100));
  }
  return Math.max(price, 1);
}

// 자동 이벤트 타이머 + 가격 기록 훅
function useAutoEventAndHistory(shared) {
  const sharedRef = useRef(shared);
  useEffect(() => { sharedRef.current = shared; }, [shared]);

  useEffect(() => {
    if (shared.phase !== "round") return;

    const interval = setInterval(() => {
      const s = sharedRef.current;
      if (!s.roundStartedAt || s.phase !== "round") return;
      const now = Date.now();

      // 1. priceHistory 기록 — stocks만 읽고 priceHistory만 씀
      const newHistory = { ...(s.priceHistory || {}) };
      let changed = false;
      (s.stocks || []).forEach(stock => {
        const price = getCurrentPrice(
          stock, s.round, s.roundStartedAt, s.roundEndsAt,
          s.activeEvent, s.modifiedTargets, s.eventSnapshots, s.phase
        );
        const existing = Array.isArray(s.priceHistory?.[stock.id])
          ? s.priceHistory[stock.id] : [];
        newHistory[stock.id] = [...existing.slice(-299), { t: now, price }];
        changed = true;
      });

      // 2. 자동 이벤트 체크
      let eventUpdate = {};
      if (s.nextAutoEventAt && now >= s.nextAutoEventAt) {
        const autoEvents = (s.eventPresets || []).filter(e => e.autoTrigger);
        if (autoEvents.length > 0) {
          const triggered = autoEvents.filter(e => Math.random() * 100 < (e.probability || 50));
          const ev = triggered.length > 0
            ? triggered[Math.floor(Math.random() * triggered.length)]
            : null;

          const pickNext = (ev2) => {
            const minMs = ((ev2 || autoEvents[0]).triggerIntervalMin || 1) * 60 * 1000;
            const maxMs = ((ev2 || autoEvents[0]).triggerIntervalMax || 3) * 60 * 1000;
            return now + minMs + Math.random() * (maxMs - minMs);
          };

          if (ev) {
            const newMod = { ...(s.modifiedTargets || {}) };
            if (ev.affectTarget !== false) {
              (s.stocks || []).forEach(stock => {
                const eff = ev.stockEffects?.[stock.id] ?? ev.globalEffect ?? 0;
                if (eff === 0) return;
                const ri = Math.min(s.round - 1, stock.prices.length - 1);
                const base = newMod[stock.id]?.round === s.round
                  ? newMod[stock.id].modifiedPrice : stock.prices[ri];
                newMod[stock.id] = {
                  round: s.round,
                  originalPrice: stock.prices[ri],
                  modifiedPrice: Math.max(Math.round(base * (1 + eff / 100)), 1),
                };
              });
            }
            eventUpdate = {
              activeEvent: { ...ev, appliedAt: now },
              eventHistory: [...(s.eventHistory || []), { ...ev, appliedAt: now }],
              modifiedTargets: newMod,
              nextAutoEventAt: pickNext(ev),
            };
            if (ev.duration > 0) {
              setTimeout(() => {
                setShared(ss => ({ ...ss, activeEvent: null }));
              }, ev.duration * 1000);
            }
          } else {
            eventUpdate = { nextAutoEventAt: pickNext(null) };
          }
        }
      }

      if (changed || Object.keys(eventUpdate).length > 0) {
        setShared(ss => {
          // teams는 건드리지 않고 priceHistory + event만 업데이트
          const result = { ...ss, priceHistory: newHistory, ...eventUpdate };
          // teams 보존 명시
          if (ss.teams) result.teams = ss.teams;
          return result;
        });
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [shared.phase, shared.round, shared.roundStartedAt]);
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

function EventBanner({event, showEffect=false}){
  if(!event) return null;
  return(
    <div style={{background:`linear-gradient(135deg,${G.orange},${G.red})`,color:G.white,padding:"9px 14px",display:"flex",alignItems:"center",gap:10}}>
      <span style={{fontSize:20,flexShrink:0}}>{event.emoji}</span>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:12,fontWeight:800,marginBottom:1}}>🚨 긴급: {event.name}</div>
        <div style={{fontSize:11,opacity:.9,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{event.desc}</div>
      </div>
      {showEffect&&(
        <div style={{fontSize:13,fontWeight:800,flexShrink:0,color:event.globalEffect>=0?"#FFD700":G.white}}>
          {event.globalEffect>=0?"+":""}{event.globalEffect}%
        </div>
      )}
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
  <input type="number" value={value}
    onChange={onChange}
    onFocus={e=>e.target.select()}
    onKeyDown={e=>{
      // 0일 때 숫자 입력하면 0 제거하고 바로 입력
      if(String(value)==="0"&&e.key>="0"&&e.key<="9"){
        e.preventDefault();
        onChange({target:{value:e.key}});
      }
    }}
    {...p}
    style={{width:"100%",border:`1.5px solid ${G.border}`,borderRadius:8,padding:"8px 6px",
      fontSize:13,fontFamily:"monospace",outline:"none",color:G.black,boxSizing:"border-box",textAlign:"center",...s}}/>
);
const TextInput=({value,onChange,placeholder,style:s,...p})=>(
  <input type="text" value={value} onChange={onChange} placeholder={placeholder} {...p}
    style={{width:"100%",border:`1.5px solid ${G.border}`,borderRadius:8,padding:"9px 10px",
      fontSize:13,fontFamily:"inherit",outline:"none",color:G.black,boxSizing:"border-box",...s}}/>
);

/* ── 캔들스틱 차트 ── */
function LiveBigChart({ stock, round, roundStartedAt, roundEndsAt, activeEvent, blind, modifiedTargets, avgPrice, eventSnapshots, phase }) {
  const [, tick] = useState(0);
  const containerRef = useRef(null);
  const [containerW, setContainerW] = useState(300);

  useEffect(() => {
    const id = setInterval(() => tick(t => t + 1), 3000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerW(el.offsetWidth || 300);
    const obs = new ResizeObserver(e => setContainerW(e[0].contentRect.width || 300));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  if (!stock) return null;

  if (blind) return (
    <div ref={containerRef} style={{ height: 150, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", background: G.bg, borderRadius: 12 }}>
      <div style={{ fontSize: 28, marginBottom: 6 }}>🙈</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: G.gray1 }}>블라인드 라운드</div>
    </div>
  );

  const ri = Math.min(round - 1, stock.prices.length - 1);

  // 라운드 진행 중이 아닐 때 — 심플한 종가 표시
  if (!roundStartedAt || !roundEndsAt) {
    const displayPrice = phase === "break"
      ? (stock.prices[Math.min(round - 1, stock.prices.length - 1)] ?? stock.prices[0])
      : stock.prices[0];
    return (
      <div ref={containerRef} style={{ padding: "20px 0", textAlign: "center",
        background: G.bg, borderRadius: 12 }}>
        <div style={{ fontSize: 12, color: G.gray2, marginBottom: 6 }}>
          {ri > 0 ? `R${ri} 종가` : "시작가"}
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: G.black }}>
          {fmtN(displayPrice)}
        </div>
        {avgPrice > 0 && (
          <div style={{ fontSize: 12, color: G.purple, marginTop: 6 }}>
            평단가 {fmtN(avgPrice)} ({displayPrice >= avgPrice ? "▲" : "▼"} {Math.abs(((displayPrice - avgPrice) / avgPrice) * 100).toFixed(2)}%)
          </div>
        )}
        <div style={{ fontSize: 11, color: G.gray2, marginTop: 4 }}>
          다음 라운드 시작 대기 중...
        </div>
      </div>
    );
  }
  const startPrice = getRoundStartPrice(stock, round);
  const target = modifiedTargets?.[stock.id]?.round === round
    ? modifiedTargets[stock.id].modifiedPrice : stock.prices[ri];

  // 현재 라운드 실시간 가격
  const curPrice = getCurrentPrice(stock, round, roundStartedAt, roundEndsAt, activeEvent, modifiedTargets, eventSnapshots, phase);

  // getPriceAt — 현재 라운드 특정 시각 가격 (getCurrentPrice와 동일한 공식)
  const getPriceAt = (atTs) => {
    if (!roundStartedAt || !roundEndsAt) return startPrice;
    if (atTs <= roundStartedAt) return startPrice;
    if (atTs >= roundEndsAt) return target;

    const snap = eventSnapshots?.[stock.id];
    const hasSnap = snap && snap.appliedAt >= roundStartedAt;

    // 이벤트 발동 전 구간 캔들은 원래 목표가(originalPrice) 사용
    const originalTarget = (hasSnap && modifiedTargets?.[stock.id]?.round === round && modifiedTargets[stock.id].originalPrice !== undefined)
      ? modifiedTargets[stock.id].originalPrice
      : stock.prices[ri];

    let effectiveBase, effectiveTarget, effectiveElapsed, effectiveTotal, seedTs;

    if (hasSnap && snap.appliedAt > roundStartedAt && snap.appliedAt < roundEndsAt && atTs >= snap.appliedAt) {
      effectiveBase = snap.basePrice;
      effectiveTarget = target;
      effectiveElapsed = Math.max(0, atTs - snap.appliedAt);
      effectiveTotal = roundEndsAt - snap.appliedAt;
      seedTs = snap.appliedAt;
    } else {
      effectiveBase = startPrice;
      // 이벤트 발동 이전 시점의 캔들은 원래 목표가로 계산
      effectiveTarget = (hasSnap && atTs < snap.appliedAt) ? originalTarget : target;
      effectiveElapsed = atTs - roundStartedAt;
      effectiveTotal = roundEndsAt - roundStartedAt;
      seedTs = roundStartedAt;
    }

    const t = Math.min(Math.max(effectiveElapsed / effectiveTotal, 0), 1);
    // 마지막 20% 구간에서 노이즈를 급격히 0으로 수렴
    const noiseDecay = t < 0.8 ? (1 - t) : (1 - t) * ((1 - t) / 0.2);
    const base = effectiveBase + (effectiveTarget - effectiveBase) * t;

    const sid = stock.id?.charCodeAt(0) || 1;
    const sid2 = stock.id?.charCodeAt(1) || 2;
    const SLOT_MS = 3000;
    const currentSlot = Math.floor(effectiveElapsed / SLOT_MS);

    let walk = 0;
    for (let i = 0; i <= currentSlot; i++) {
      const slotSeed = (sid * 1664525 + sid2 * 1013904223 + i * 22695477 + seedTs) & 0x7fffffff;
      const dir = ((slotSeed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff * 2 - 1;
      walk += dir;
    }
    const walkNorm = currentSlot > 0 ? walk / Math.sqrt(currentSlot + 1) : 0;

    const slotSeed2 = (sid * 22695477 + currentSlot * 1664525 + seedTs) & 0x7fffffff;
    const fine = Math.sin(atTs * 0.0031 + slotSeed2 * 0.0001) * 0.5
               + Math.sin(atTs * 0.0071 + slotSeed2 * 0.0002) * 0.5;

    const noiseRange = Math.abs(effectiveTarget - effectiveBase) * 0.20 * noiseDecay;
    let p = Math.round(base + walkNorm * noiseRange * 0.6 + fine * noiseRange * 0.4);

    if (activeEvent) {
      const eff = activeEvent.stockEffects?.[stock.id] ?? activeEvent.globalEffect ?? 0;
      p = Math.round(p * (1 + eff / 100));
    }
    return Math.max(p, 1);
  };

  // ── 현재 라운드 캔들만 생성 (15초 간격) ──
  const CANDLE_MS = 15000;
  const liveCandles = [];

  if (roundStartedAt) {
    const now = Date.now();
    const elapsed = Math.max(0, now - roundStartedAt);
    const doneCnt = Math.floor(elapsed / CANDLE_MS);

    for (let ci = 0; ci < doneCnt; ci++) {
      const cs = roundStartedAt + ci * CANDLE_MS;
      const ce = cs + CANDLE_MS;
      const samples = Array.from({ length: 8 }, (_, i) =>
        getPriceAt(cs + (CANDLE_MS / 7) * i)
      );
      samples.push(getPriceAt(ce - 200));
      const o = samples[0];
      const c = samples[samples.length - 1];
      liveCandles.push({ o, c, h: Math.max(...samples), l: Math.min(...samples), done: true });
    }

    // 현재 진행 중 캔들
    const cs = roundStartedAt + doneCnt * CANDLE_MS;
    const elIn = Math.max(0, now - cs);
    const steps = Math.max(2, Math.floor(elIn / 1000));
    const samples = Array.from({ length: steps + 1 }, (_, i) =>
      i === steps ? curPrice : getPriceAt(cs + (elIn / steps) * i)
    );
    liveCandles.push({
      o: samples[0], c: curPrice,
      h: Math.max(...samples), l: Math.min(...samples),
      done: false
    });
  } else {
    liveCandles.push({ o: startPrice, c: curPrice, h: Math.max(startPrice, curPrice), l: Math.min(startPrice, curPrice), done: false });
  }

  // ── 레이아웃: 고정 캔들 너비 ──
  const CANDLE_W = 12;
  const CANDLE_GAP = 3;
  const SLOT_W = CANDLE_W + CANDLE_GAP;
  const PR = 68;
  const PL = 40; // 왼쪽에 이전 라운드 종가 표시 공간
  const PT = 12;
  const PB = 20;
  const H = 160;
  const viewW = containerW;
  const ch = H - PT - PB;

  // 이전 라운드 종가 (기준점)
  const prevClose = startPrice;

  // 현재 라운드 캔들들 Y 범위
  const allPrices = [prevClose, ...liveCandles.flatMap(c => [c.h, c.l])];
  const dMin = Math.min(...allPrices);
  const dMax = Math.max(...allPrices);
  const pad = Math.max((dMax - dMin) * 0.15, dMin * 0.005);
  const minP = dMin - pad, maxP = dMax + pad, range = maxP - minP || 1;
  const toY = v => Math.max(PT + 1, Math.min(PT + ch - 1, PT + ch - ((v - minP) / range) * ch));

  const UP = G.red, DN = G.blue;
  const isUpNow = curPrice >= startPrice;
  const lc = isUpNow ? UP : DN;
  const blinkOp = 0.35 + 0.65 * Math.abs(Math.sin(Date.now() * 0.003));

  // 캔들 총 너비
  const totalCandleW = liveCandles.length * SLOT_W;
  // 캔들 그리기 시작 X (오른쪽 정렬)
  const chartAreaW = viewW - PL - PR;
  const candleStartX = PL + Math.max(0, chartAreaW - totalCandleW);

  // 눈금
  const grids = [0, 1, 2, 3].map(i => {
    const v = minP + (range / 3) * i;
    return { y: toY(v), label: fmtN(Math.round(v)) };
  });

  return (
    <div ref={containerRef} style={{ position: "relative", overflow: "hidden" }}>
      <svg width="100%" height={H} style={{ display: "block" }}>

        {/* 그리드 */}
        {grids.map((g, i) => (
          <g key={i}>
            <line x1={PL} y1={g.y} x2={viewW - PR} y2={g.y}
              stroke={G.border} strokeWidth="0.6" strokeDasharray="3,4" />
            <text x={viewW - PR + 3} y={g.y + 3.5}
              fontSize="8" fill={G.gray2} fontFamily="monospace">{g.label}</text>
          </g>
        ))}

        {/* ── 왼쪽: 이전 라운드 종가 기준점 ── */}
        {ri > 0 && (
          <g>
            {/* 이전 종가 수평 점선 */}
            <line
              x1={PL - 2} y1={toY(prevClose)}
              x2={candleStartX + CANDLE_W / 2} y2={toY(prevClose)}
              stroke={G.gray2} strokeWidth="0.8" strokeDasharray="3,3" />
            {/* 이전 종가 동그라미 */}
            <circle cx={PL - 6} cy={toY(prevClose)} r="3"
              fill={G.gray2} />
            {/* 이전 종가 레이블 */}
            <text x={2} y={toY(prevClose) + 4}
              fontSize="8" fill={G.gray2} fontFamily="monospace">{fmtN(prevClose)}</text>
            {/* R구분 레이블 */}
            <text x={PL - 2} y={PT - 2}
              fontSize="8" fill={G.gray2} fontFamily="inherit">R{round - 1}종가</text>
          </g>
        )}

        {/* 이전 종가 → 첫 캔들 open 연결선 */}
        {ri > 0 && liveCandles.length > 0 && (
          <line
            x1={PL - 2} y1={toY(prevClose)}
            x2={candleStartX + CANDLE_W / 2} y2={toY(liveCandles[0].o)}
            stroke={G.gray3} strokeWidth="0.8" strokeDasharray="2,3" />
        )}

        {/* ── 현재 라운드 캔들 ── */}
        {liveCandles.map((c, i) => {
          const x = candleStartX + i * SLOT_W + CANDLE_W / 2;
          const isUp = c.c >= c.o;
          const col = isUp ? UP : DN;
          const bTop = toY(Math.max(c.o, c.c));
          const bBot = toY(Math.min(c.o, c.c));
          const bH = Math.max(bBot - bTop, 1.5);
          const wTop = toY(c.h), wBot = toY(c.l);
          const lw = !c.done ? 2 : 1.5;
          return (
            <g key={i}>
              <line x1={x} y1={wTop} x2={x} y2={bTop}
                stroke={col} strokeWidth="1" strokeLinecap="round" />
              <line x1={x} y1={bBot} x2={x} y2={wBot}
                stroke={col} strokeWidth="1" strokeLinecap="round" />
              <rect x={x - CANDLE_W / 2} y={bTop} width={CANDLE_W} height={bH}
                fill={col} stroke={col} strokeWidth={lw} rx={1} />
            </g>
          );
        })}

        {/* 현재 라운드 레이블 */}
        <text x={candleStartX + 2} y={PT - 2}
          fontSize="8.5" fill={lc} fontFamily="inherit" fontWeight="bold">R{round}</text>

        {/* 평단가 선 */}
        {avgPrice > 0 && avgPrice >= minP && avgPrice <= maxP && (
          <g>
            <line
              x1={PL} y1={toY(avgPrice)}
              x2={viewW - PR} y2={toY(avgPrice)}
              stroke={G.purple} strokeWidth="1" strokeDasharray="5,3" opacity="0.8" />
            <rect x={2} y={toY(avgPrice) - 8} width={PL - 4} height={16}
              fill={G.purple} rx={3} opacity="0.85" />
            <text x={PL / 2} y={toY(avgPrice) + 4}
              textAnchor="middle" fontSize="8" fill="white" fontFamily="monospace" fontWeight="bold">
              평균
            </text>
            <rect x={viewW - PR + 2} y={toY(avgPrice) - 8} width={PR - 4} height={16}
              fill={G.purple} rx={3} opacity="0.85" />
            <text x={viewW - PR + (PR - 4) / 2 + 2} y={toY(avgPrice) + 4}
              textAnchor="middle" fontSize="8" fill="white" fontFamily="monospace" fontWeight="bold">
              {fmtN(avgPrice)}
            </text>
          </g>
        )}

        {/* 현재가 점선 */}
        <line x1={PL} y1={toY(curPrice)} x2={viewW - PR} y2={toY(curPrice)}
          stroke={lc} strokeWidth="0.9" strokeDasharray="4,3" opacity="0.8" />

        {/* 현재가 라벨 */}
        <rect x={viewW - PR + 2} y={toY(curPrice) - 9} width={PR - 4} height={18} fill={lc} rx={4} />
        <text x={viewW - PR + (PR - 4) / 2 + 2} y={toY(curPrice) + 4.5}
          textAnchor="middle" fontSize="9.5" fill="white" fontFamily="monospace" fontWeight="bold">
          {fmtN(curPrice)}
        </text>

        {/* 깜빡 점 */}
        <circle
          cx={candleStartX + (liveCandles.length - 1) * SLOT_W + CANDLE_W / 2}
          cy={toY(curPrice)} r="3.5" fill={lc} opacity={blinkOp} />
      </svg>
    </div>
  );
}







function LiveMiniChart({ stock, round, roundStartedAt, roundEndsAt, activeEvent, blind, modifiedTargets, eventSnapshots, phase }) {
  const [ts, setTs] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setTs(Date.now()), 3000);
    return () => clearInterval(id);
  }, []);

  if (blind) return <div style={{ width: 52, height: 28, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🙈</div>;
  if (!stock || stock.prices.length < 1) return <div style={{ width: 52, height: 28 }} />;

  const ri = Math.min(round - 1, stock.prices.length - 1);
  const startPrice = getRoundStartPrice(stock, round);

  const cur = getCurrentPrice(stock, round, roundStartedAt, roundEndsAt, activeEvent, modifiedTargets, eventSnapshots, phase);

  const confirmedPts = stock.prices.slice(0, ri);
  const steps = 6;
  const livePts = Array.from({ length: steps }, (_, i) => {
    if (!roundStartedAt || !roundEndsAt) return i === steps - 1 ? cur : startPrice;
    const frac = i / (steps - 1) * Math.min((ts - roundStartedAt) / (roundEndsAt - roundStartedAt), 1);
    const target = modifiedTargets?.[stock.id]?.round === round
      ? modifiedTargets[stock.id].modifiedPrice : stock.prices[ri];
    const base = startPrice + (target - startPrice) * frac;
    const n = Math.sin(i * 2.1 + (stock.id?.charCodeAt(0) || 1) * 1.7) * 0.4;
    const nr = Math.abs(target - startPrice) * 0.08 + base * 0.01;
    return Math.max(1, Math.round(base + n * nr));
  });
  livePts[livePts.length - 1] = cur;

  const pts2 = [...confirmedPts, ...livePts];
  if (pts2.length < 2) pts2.unshift(startPrice);

  const mn = Math.min(...pts2), mx = Math.max(...pts2);
  const r = mx - mn || pts2[0] * 0.01;
  const pad = r * 0.2;
  const minP = mn - pad, rng = mx + pad - minP || 1;
  const W = 52, H = 28;
  const toY = v => H - ((v - minP) / rng) * H;

  const coords = pts2.map((p, i) => ({ x: (i / (pts2.length - 1)) * W, y: toY(p) }));
  const linePts = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const fillPts = linePts + ` L${W},${H} L0,${H} Z`;
  const isUp = cur >= pts2[0];
  const col = isUp ? G.red : G.blue;
  const blinkOp = 0.4 + 0.6 * Math.abs(Math.sin(ts * 0.002));
  const last = coords[coords.length - 1];

  return (
    <svg width={W} height={H} style={{ display: "block", flexShrink: 0 }}>
      <defs>
        <linearGradient id={`mg${stock.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={col} stopOpacity="0.2" />
          <stop offset="100%" stopColor={col} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillPts} fill={`url(#mg${stock.id})`} />
      <path d={linePts} fill="none" stroke={col} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last.x} cy={last.y} r="2.5" fill={col} opacity={blinkOp} />
    </svg>
  );
}


function useRoundTimer(phase, roundEndsAt) {
  const [rem, setRem] = useState(null);
  useEffect(() => {
    if (phase !== "round" || !roundEndsAt) { setRem(null); return; }
    let id;
    const tick = () => {
      const s = Math.max(0, Math.round((roundEndsAt - Date.now()) / 1000));
      setRem(s);
      if (s <= 0) {
        clearInterval(id); // 한 번만 실행 — 반복 호출 방지
        setShared(ss => {
          // 이미 다른 라운드가 시작됐으면 덮어쓰지 않음
          if (ss.roundEndsAt !== roundEndsAt) return ss;
          return { ...ss, phase: "break", roundEndsAt: null, roundStartedAt: null };
        });
      }
    };
    tick();
    id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [phase, roundEndsAt]);
  return rem;
}

function BetResultPopup({ data, onClose }) {
  if (!data) return null;
  const { results, totalPnl } = data;
  const allFail = results.every(r => !r.success);
  const headerBg = allFail ? '#F04452' : totalPnl >= 0 ? '#00B493' : '#F5A623';
  const emoji = allFail ? '📉' : totalPnl > 0 ? '🎯' : '😅';
  const title = allFail ? '예측 실패' : totalPnl > 0 ? '예측 적중!' : '부분 적중';
  const subtitle = `Round ${data.round} 베팅 결과`;
  return (
    <div style={{
      position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",
      zIndex:2000,display:"flex",alignItems:"center",
      justifyContent:"center",padding:"0 20px",
    }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:G.white,borderRadius:20,width:"100%",
        maxWidth:340,overflow:"hidden",
        border:`1px solid ${G.border}`,
        animation:"popupIn 0.25s cubic-bezier(.34,1.56,.64,1)",
      }}>
        <style>{`
          @keyframes popupIn {
            from { opacity:0; transform:scale(0.85) translateY(20px); }
            to   { opacity:1; transform:scale(1) translateY(0); }
          }
        `}</style>
        <div style={{background:headerBg,padding:"28px 24px 20px",textAlign:"center"}}>
          <div style={{fontSize:40,marginBottom:8}}>{emoji}</div>
          <div style={{fontSize:19,fontWeight:800,color:G.white,marginBottom:4}}>{title}</div>
          <div style={{fontSize:13,color:"rgba(255,255,255,0.75)"}}>{subtitle}</div>
        </div>
        <div style={{padding:"18px 20px 0"}}>
          <div style={{fontSize:12,color:G.gray1,fontWeight:600,marginBottom:10}}>베팅 내역</div>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
            {results.map((r,i)=>(
              <div key={i} style={{
                background:r.success?G.greenLight:G.redLight,
                borderRadius:12,padding:"11px 14px",
                display:"flex",justifyContent:"space-between",alignItems:"center",
              }}>
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:G.black,marginBottom:3}}>
                    {r.stockEmoji} {r.stockName}
                  </div>
                  <div style={{fontSize:11,color:r.success?G.green:G.red}}>
                    {r.direction==="up"?"▲ 상승":"▼ 하락"} 예측
                    {r.success?" → 적중!":" → 빗나감"}
                  </div>
                </div>
                <div style={{textAlign:"right"}}>
                  {r.success&&<div style={{fontSize:11,color:G.gray1,marginBottom:2}}>x{r.odds}배</div>}
                  <div style={{fontSize:14,fontWeight:700,color:r.success?G.green:G.red}}>
                    {r.success?"+":"-"}{fmt(r.success?r.payout-r.amount:r.amount)}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={{borderTop:`1px solid ${G.border}`,paddingTop:14,marginBottom:18}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:14,fontWeight:700,color:G.black}}>최종 손익</span>
              <span style={{fontSize:18,fontWeight:800,color:totalPnl>=0?G.green:G.red}}>
                {totalPnl>=0?"+":""}{fmt(totalPnl)}
              </span>
            </div>
          </div>
          <button onClick={onClose} style={{
            width:"100%",background:G.blue,color:G.white,
            border:"none",borderRadius:12,padding:"14px",
            fontSize:15,fontWeight:700,cursor:"pointer",
            fontFamily:"inherit",marginBottom:20,
          }}>확인</button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   관리자 앱
══════════════════════════════════════════ */
function AdminApp({onBack=null}){
  const shared=useShared();
  useAutoEventAndHistory(shared);
  // 운영자 세션 갱신 (5분마다 타임스탬프 업데이트)
  useEffect(()=>{
    const refresh=()=>{
      try{
        const s=localStorage.getItem(ADMIN_SESSION_KEY);
        if(s){const{ts}=JSON.parse(s);if(Date.now()-ts<ADMIN_SESSION_TTL)localStorage.setItem(ADMIN_SESSION_KEY,JSON.stringify({ts:Date.now()}));}
      }catch(e){}
    };
    refresh();
    const id=setInterval(refresh,5*60*1000);
    return()=>clearInterval(id);
  },[]);
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
  const [adminChatInput,setAdminChatInput]=useState("");
  const [newGroupName,setNewGroupName]=useState("1조");
  const [newMemberName,setNewMemberName]=useState("");
  const [batchCount,setBatchCount]=useState(5);
  const [pointGroupTarget,setPointGroupTarget]=useState("전체");
  const [groupPointInput,setGroupPointInput]=useState("");
  const [saveTplName,setSaveTplName]=useState("");
  const [editingTpl,setEditingTpl]=useState(null);
  // 자동진행 / 베팅 설정
  const [breakDuration,setBreakDuration]=useState(60);
  const [betWindow,setBetWindow]=useState(30);
  const [betEnabled,setBetEnabled]=useState(false);
  const [baseOdds,setBaseOdds]=useState(1.8);
  const [dynamicOdds,setDynamicOdds]=useState(false);
  const [minBet,setMinBet]=useState(100000);
  const [maxBetPct,setMaxBetPct]=useState(50);
  const [breakRem,setBreakRem]=useState(null);
  const [betRem,setBetRem]=useState(null);
  const [resultHintInput,setResultHintInput]=useState("");
  const [rulesInput,setRulesInput]=useState("");
  const [previewTeamId,setPreviewTeamId]=useState(null);

  // shared → 로컬 설정 동기화
  useEffect(()=>{
    if(shared.breakDuration!==undefined) setBreakDuration(shared.breakDuration);
    if(shared.betWindow!==undefined) setBetWindow(shared.betWindow);
    if(shared.betEnabled!==undefined) setBetEnabled(shared.betEnabled);
    if(shared.baseOdds!==undefined) setBaseOdds(shared.baseOdds);
    if(shared.dynamicOdds!==undefined) setDynamicOdds(shared.dynamicOdds);
    if(shared.minBet!==undefined) setMinBet(shared.minBet);
    if(shared.maxBetPct!==undefined) setMaxBetPct(shared.maxBetPct);
    if(shared.resultHint!==undefined) setResultHintInput(shared.resultHint);
    if(shared.rules!==undefined) setRulesInput(shared.rules||"");
  },[shared.breakDuration,shared.betWindow,shared.betEnabled,shared.baseOdds,shared.dynamicOdds,shared.minBet,shared.maxBetPct,shared.resultHint,shared.rules]);

  // 휴식 타이머 (표시용)
  useEffect(()=>{
    const isActiveBet=shared.phase==="break"||shared.phase==="ready";
    if(!isActiveBet){setBreakRem(null);setBetRem(null);return;}
    if(!shared.breakEndsAt&&!shared.betDeadline){setBreakRem(null);setBetRem(null);return;}
    const tick=()=>{
      const now=Date.now();
      setBreakRem(shared.breakEndsAt?Math.max(0,Math.ceil((shared.breakEndsAt-now)/1000)):null);
      setBetRem(shared.betDeadline?Math.max(0,Math.ceil((shared.betDeadline-now)/1000)):null);
    };
    tick();
    const id=setInterval(tick,1000);
    return()=>clearInterval(id);
  },[shared.phase,shared.breakEndsAt,shared.betDeadline]);

  // 자동 타임라인 진행
  useEffect(() => {
    if (!shared.timelineAuto) return;
    if (shared.timelineEndsAt && Date.now() < shared.timelineEndsAt) return;
    const steps = shared.timelineSteps || INIT_SS.timelineSteps;
    const nextIdx = (shared.timelineIndex ?? -1) + 1;
    if (nextIdx >= steps.length) {
      setShared(s => ({ ...s, timelineAuto: false, phase: "ended" }));
      return;
    }
    const step = steps[nextIdx];
    const endsAt = Date.now() + step.duration * 1000;
    const now = Date.now();
    const baseUpdates = {
      timelineIndex: nextIdx,
      timelineEndsAt: endsAt,
      currentPhaseDetail: step.type,
    };

    if (step.type === "betting") {
      setShared(s => ({ ...s, ...baseUpdates, betDeadline: endsAt, betOdds: {} }));
      return;
    }

    if (step.type === "round") {
      const autoEvts = (shared.eventPresets || []).filter(e => e.autoTrigger);
      const nextAutoEventAt = autoEvts.length > 0 ? (() => {
        const ev = autoEvts[0];
        return now + (ev.triggerIntervalMin||1)*60*1000 + Math.random()*((ev.triggerIntervalMax||3)-(ev.triggerIntervalMin||1))*60*1000;
      })() : null;
      const roundUpdates = {
        ...baseUpdates,
        phase: "round", round: step.round,
        roundStartedAt: now, roundEndsAt: endsAt,
        betDeadline: 0,
        priceHistory: {}, modifiedTargets: {}, eventSnapshots: {},
        nextAutoEventAt,
      };
      setShared(s => {
        const baseState = { ...s, ...roundUpdates };
        const { nextState } = applyScheduledDelistings(baseState, step.round, "roundStart");
        return nextState;
      });
      return;
    }

    if (step.type === "result") {
      const isLast = nextIdx === steps.length - 1;
      const r = step.round;
      setShared(s => {
        const rc = (s.rounds || [])[r - 1];
        const divs = rc?.dividends || {};
        let teams = { ...s.teams };

        // 베팅 정산
        const roundBets = s.bets?.[r] || {};
        const newBetsForRound = {};
        if (s.betEnabled && Object.keys(roundBets).length > 0) {
          for (const [tid, teamBets] of Object.entries(roundBets)) {
            if (!teams[tid]) continue;
            let payout = 0;
            const settledTeamBets = {};
            for (const [sid, bet] of Object.entries(teamBets)) {
              if (!bet || bet.settled) { settledTeamBets[sid] = bet; continue; }
              const stock = s.stocks?.find(x => x.id === sid);
              if (!stock) { settledTeamBets[sid] = bet; continue; }
              const startP = getRoundStartPrice(stock, r);
              const endP = getRoundClosePrice(stock, r);
              const actualDir = endP > startP ? "up" : endP < startP ? "down" : "draw";
              const success = actualDir === bet.direction && actualDir !== "draw";
              const betPayout = success ? Math.round(bet.amount * (bet.odds || s.baseOdds || 1.8)) : 0;
              payout += betPayout;
              settledTeamBets[sid] = { ...bet, settled: true, success, payout: betPayout };
            }
            newBetsForRound[tid] = settledTeamBets;
            if (payout > 0) {
              const tm = teams[tid];
              const hist = Array.isArray(tm.history) ? tm.history : Object.values(tm.history || {});
              teams[tid] = { ...tm, cash: tm.cash + payout,
                history: [...hist, { time: new Date().toLocaleTimeString('ko-KR'), type: 'bet', stockName: `R${r} 베팅 정산`, stockEmoji: '🎲', qty: 0, price: 0, total: payout }] };
            }
          }
        }

        // 배당금 지급
        for (const [tid, tm] of Object.entries(teams)) {
          let bonus = 0;
          for (const [sid, perShare] of Object.entries(divs)) {
            const qty = tm.holdings?.[sid]?.qty || 0;
            bonus += qty * perShare;
          }
          if (bonus > 0) {
            const hist = Array.isArray(tm.history) ? tm.history : Object.values(tm.history || {});
            teams[tid] = { ...tm, cash: tm.cash + bonus,
              history: [...hist, { time: new Date().toLocaleTimeString('ko-KR'), type: 'dividend', stockName: '배당금', stockEmoji: '💰', qty: 0, price: 0, total: bonus }] };
          }
        }

        // 이벤트로 수정된 종가를 stock.prices에 반영 → 다음 라운드 시작가 연속성 보장
        const nextStocks = (s.stocks || []).map(stock => {
          const mod = s.modifiedTargets?.[stock.id];
          if (mod && mod.round === r) {
            const newPrices = [...stock.prices];
            newPrices[r - 1] = mod.modifiedPrice;
            return { ...stock, prices: newPrices };
          }
          return stock;
        });

        return {
          ...s, ...baseUpdates,
          phase: isLast ? "ended" : "break",
          roundEndsAt: null, roundStartedAt: null,
          teams,
          stocks: nextStocks,
          bets: { ...(s.bets || {}), [r]: newBetsForRound },
          betOdds: {},
        };
      });
      return;
    }

    setShared(s => ({ ...s, ...baseUpdates }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared.timelineAuto, shared.timelineEndsAt, shared.timelineIndex]);

  // 자동 라운드 진행
  useEffect(()=>{
    if(!shared.autoPlay||shared.phase!=="break"||!shared.breakEndsAt) return;
    const nextR=(shared.round||0)+1;
    if(nextR>(shared.maxRound||3)) return;
    const rem=shared.breakEndsAt-Date.now();
    if(rem<=0){startRound(nextR);return;}
    const timer=setTimeout(()=>startRound(nextR),rem);
    return()=>clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[shared.autoPlay,shared.phase,shared.breakEndsAt,shared.round,shared.maxRound]);

  // 템플릿 적용
  const applyTemplate = tpl => {
    const s = tpl.stocks.map(x => ({ ...x, prices: [...x.prices] }));
    const r = tpl.rounds.map(x => ({ ...x, dividends: { ...(x.dividends || {}) } }));
    const si = tpl.shopItems ? tpl.shopItems.map(x => ({ ...x })) : shopItems;
    const ep = tpl.eventPresets ? tpl.eventPresets.map(x => ({ ...x, stockEffects: { ...(x.stockEffects || {}) } })) : eventPresets;
    const nextInitCash = tpl.initCash;
    setStocks(s);
    setRounds(r);
    setShopItems(si);
    setEventPresets(ep);
    setMaxRound(tpl.maxRound);
    setInitCash(nextInitCash);
    setFeeRate(tpl.feeRate ?? 0.1);
    setLeverageEnabled(tpl.leverageEnabled ?? false);
    setLeverageMax(tpl.leverageMax ?? 2);
    setBetEnabled(tpl.betEnabled ?? false);
    setBaseOdds(tpl.betBaseOdds ?? 1.8);
    setDynamicOdds(tpl.betDynamic ?? false);
    setMinBet(tpl.betMinAmount ?? 100000);
    setMaxBetPct(tpl.betMaxRatio ?? 50);
    setBetWindow(tpl.betDuration ?? 30);

    setShared(ss => ({
      ...ss,
      stocks: s,
      rounds: r,
      shopItems: si,
      eventPresets: ep,
      maxRound: tpl.maxRound,
      initCash: nextInitCash,
      feeRate: tpl.feeRate ?? 0.1,
      leverageEnabled: tpl.leverageEnabled ?? false,
      leverageMax: tpl.leverageMax ?? 2,
      timelineSteps: tpl.timelineSteps
        ? tpl.timelineSteps.map(x=>({...x}))
        : buildTimelineSteps(tpl),
      betEnabled: tpl.betEnabled ?? false,
      baseOdds: tpl.betBaseOdds ?? 1.8,
      dynamicOdds: tpl.betDynamic ?? false,
      minBet: tpl.betMinAmount ?? 100000,
      maxBetPct: tpl.betMaxRatio ?? 50,
      betWindow: tpl.betDuration ?? 30,
      teams: buildFreshTeamsFromCreds(ss.teamCredentials || {}, ss.teams || {}, nextInitCash),
      phase: "ready",
      round: 0,
      roundStartedAt: null,
      roundEndsAt: null,
      activeEvent: null,
      eventHistory: [],
      notice: "",
      noticeAt: null,
      modifiedTargets: {},
      nextAutoEventAt: null,
      priceHistory: {},
      chatMessages: Array.isArray(ss.chatMessages) ? ss.chatMessages : [],
      tradeOffers: {},
      bonusPool: ss.bonusPool || {},
      breakEndsAt: null,
      betDeadline: null,
      bets: {},
      betOdds: {},
      eventSnapshots: {},
      customTemplates: ss.customTemplates || [],
      timelineIndex: -1,
      timelineAuto: false,
      timelineEndsAt: 0,
      currentPhaseDetail: "",
      currentPhase: "ready",
      resultHint: "",
      rules: tpl.rules !== undefined ? tpl.rules : ss.rules,
    }));

    t2(`"${tpl.name}" 적용 완료 ✓`);
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
  const addShop=()=>setShopItems(p=>[...p,{id:uid(),name:"새 항목",desc:"설명",price:500000,pointPrice:50,emoji:"🎁",hint:"힌트 입력"}]);
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
    const newTimelineSteps=buildTimelineSteps({rounds,betEnabled,betDuration:betWindow});
    setShared(s=>({...s,stocks:stocks.map(x=>({...x,prices:[...x.prices]})),
      shopItems:shopItems.map(x=>({...x})),rounds:rounds.map(x=>({...x})),
      eventPresets:eventPresets.map(x=>({...x})),maxRound,initCash,feeRate,leverageEnabled,leverageMax,
      breakDuration,betWindow,betEnabled,baseOdds,dynamicOdds,minBet,maxBetPct,
      timelineSteps:newTimelineSteps}));
    t2("설정 저장됨 ✓");
  };

  // 팀 계정
  const addMember=()=>{
    const group=newGroupName;
    const names=newMemberName.split(/[\n,，]+/).map(s=>s.trim()).filter(Boolean);
    if(names.length===0){t2("이름 입력");return;}
    const duplicates=names.filter(n=>shared.teamCredentials?.[n]);
    if(duplicates.length>0){t2(`이미 있는 이름: ${duplicates.join(", ")}`);return;}
    const newCreds={},newTeams={},newIds=[];
    names.forEach(name=>{
      const id=uid();
      newCreds[name]={id,groupName:group};
      newTeams[id]={name,groupName:group,cash:0,
        holdings:{_empty:true},purchases:["_empty"],history:["_empty"],borrowed:0,diamonds:0};
      newIds.push(id);
    });
    setShared(s=>({
      ...s,
      teamCredentials:{...(s.teamCredentials||{}),...newCreds},
      teams:{...s.teams,...newTeams},
      groups:{...(s.groups||{}),[group]:{
        ...(s.groups?.[group]||{}),
        diamonds:(s.groups?.[group]?.diamonds||0),
        memberIds:[...(s.groups?.[group]?.memberIds||[]),...newIds],
      }},
    }));
    setNewMemberName("");
    t2(`${group} - ${names.length}명 등록 완료`);
  };

  const addBatch=()=>{
    const group=newGroupName,count=batchCount;
    if(!count||count<1){t2("인원을 입력하세요");return;}
    const existingCount=Object.keys(shared.teamCredentials||{})
      .filter(n=>n.startsWith(group+"-")).length;
    const newCreds={},newTeams={},newMemberIds=[];
    for(let i=1;i<=count;i++){
      const num=existingCount+i;
      const name=`${group}-${num}`;
      if(shared.teamCredentials?.[name]) continue;
      const id=uid();
      newCreds[name]={id,groupName:group};
      newTeams[id]={name,groupName:group,cash:shared.initCash||DEFAULT_INIT_CASH,
        holdings:{_empty:true},purchases:["_empty"],history:["_empty"],borrowed:0,diamonds:0};
      newMemberIds.push(id);
    }
    setShared(s=>({
      ...s,
      teamCredentials:{...(s.teamCredentials||{}),...newCreds},
      teams:{...s.teams,...newTeams},
      groups:{...(s.groups||{}),[group]:{
        diamonds:(s.groups?.[group]?.diamonds||0),
        memberIds:[...(s.groups?.[group]?.memberIds||[]),...newMemberIds],
      }},
    }));
    t2(`${group} ${count}명 일괄 등록 완료`);
  };

  const setGroupCode=(group,code)=>{
    setShared(s=>({...s,groups:{...(s.groups||{}),[group]:{...(s.groups?.[group]||{}),code:code.trim()}}}));
  };
  const setGroupLeader=(group,leaderName)=>{
    setShared(s=>({...s,groups:{...(s.groups||{}),[group]:{...(s.groups?.[group]||{}),leader:leaderName}}}));
  };

  const delMember=(name,id,group)=>{
    setShared(s=>{
      const creds={...(s.teamCredentials||{})};
      const grp={...(s.groups||{})};
      delete creds[name];
      if(grp[group]){
        grp[group]={...grp[group],memberIds:(grp[group].memberIds||[]).filter(mid=>mid!==id)};
      }
      const teams={...s.teams};
      delete teams[id];
      return{...s,teamCredentials:creds,teams,groups:grp};
    });
  };

  const syncTeamsAndCredentials=()=>{
    setShared(s=>{
      const creds=s.teamCredentials||{};
      const teams={...(s.teams||{})};
      const groups={...(s.groups||{})};
      let fixed=0;

      // 1. credentials에 있지만 teams에 계좌 없는 경우 → 계좌 생성
      Object.entries(creds).forEach(([name,{id,groupName}])=>{
        if(!teams[id]){
          teams[id]={name,groupName:groupName||"미분류",
            cash:s.initCash||DEFAULT_INIT_CASH,
            holdings:{_empty:true},purchases:["_empty"],history:["_empty"],borrowed:0,diamonds:0};
          const g=groupName||"미분류";
          if(!groups[g]) groups[g]={diamonds:0,memberIds:[]};
          if(!(groups[g].memberIds||[]).includes(id)){
            groups[g]={...groups[g],memberIds:[...(groups[g].memberIds||[]),id]};
          }
          fixed++;
        }
      });

      // 2. teams에 있지만 credentials에 없는 경우 → 활동 없으면 삭제, 있으면 유지
      const credIds=new Set(Object.values(creds).map(v=>v.id));
      Object.entries(teams).forEach(([id,tm])=>{
        if(credIds.has(id)) return;
        const hasActivity=
          (Object.keys(tm.holdings||{}).filter(k=>k!=='_empty').length>0)||
          ((tm.history||[]).filter(h=>h!=='_empty').length>0)||
          (tm.borrowed>0)||
          (Math.abs((tm.cash||0)-(s.initCash||DEFAULT_INIT_CASH))>1);
        if(!hasActivity){
          delete teams[id];
          // groups에서도 제거
          Object.keys(groups).forEach(g=>{
            if((groups[g].memberIds||[]).includes(id)){
              groups[g]={...groups[g],memberIds:groups[g].memberIds.filter(mid=>mid!==id)};
            }
          });
          fixed++;
        }
      });

      return{...s,teams,groups};
    });
    t2("팀-계좌 보정 완료");
  };

  const giveGroupPoints=()=>{
    const amount=parseInt(groupPointInput)||0;
    if(!amount){t2("다이아를 입력하세요");return;}
    setShared(s=>{
      const groups={...(s.groups||{})};
      const targets=pointGroupTarget==="전체"
        ?Array.from({length:16},(_,i)=>`${i+1}조`)
        :[pointGroupTarget];
      for(const g of targets){
        if(groups[g]) groups[g]={...groups[g],diamonds:(groups[g].diamonds||0)+amount};
      }
      return{...s,groups};
    });
    setGroupPointInput("");
    t2(pointGroupTarget==="전체"?`전체 조에 ${amount}💎 지급`:`${pointGroupTarget}에 ${amount}💎 지급`);
  };

  const applySeedBalancing = () => {
    const groups = shared.groups || {};
    const memberCounts = Object.values(groups).map(g => (g.memberIds||[]).length);
    if (memberCounts.length === 0) { t2("조가 없습니다"); return; }
    const maxCount = Math.max(...memberCounts);
    const baseCash = shared.initCash || DEFAULT_INIT_CASH;
    setShared(s => {
      const teams = { ...s.teams };
      for (const [gname, gdata] of Object.entries(s.groups || {})) {
        const memberIds = gdata.memberIds || [];
        const count = memberIds.length;
        if (count >= maxCount) continue;
        const shortfall = maxCount - count;
        const extraSeed = shortfall * baseCash;
        const firstMemberId = memberIds[0];
        if (!firstMemberId || !teams[firstMemberId]) continue;
        teams[firstMemberId] = {
          ...teams[firstMemberId],
          cash: (teams[firstMemberId].cash || baseCash) + extraSeed,
          history: [
            ...(Array.isArray(teams[firstMemberId].history)
              ? teams[firstMemberId].history : []),
            {
              time: new Date().toLocaleTimeString('ko-KR'),
              type: 'bonus',
              stockName: `시드 보정 (+${shortfall}인분)`,
              stockEmoji: '🌱',
              qty: 0, price: 0,
              total: extraSeed,
            }
          ],
        };
      }
      return { ...s, teams };
    });
    t2("시드 보정 완료");
  };

  // 라운드 제어
  const startRound=r=>{
    const rc=shared.rounds?.[r-1]||rounds[r-1];
    const dur=(rc?.durationMin||5)*60*1000,now=Date.now();
    let autoDelistedNames = [];
    setShared(s=>{
      const baseState = {...s,phase:"round",round:r,roundStartedAt:now,roundEndsAt:now+dur,
        stocks:stocks.map(x=>({...x,prices:[...x.prices]})),
        shopItems:shopItems.map(x=>({...x})),rounds:rounds.map(x=>({...x})),
        eventPresets:eventPresets.map(x=>({...x})),maxRound,initCash,feeRate,leverageEnabled,leverageMax,
        modifiedTargets:{},
        priceHistory:{},
        eventSnapshots:{},
        betEnabled,baseOdds,dynamicOdds,minBet,maxBetPct,betOdds:{},
        nextAutoEventAt:(()=>{
          const autoEvents=eventPresets.filter(e=>e.autoTrigger);
          if(autoEvents.length===0) return null;
          const ev=autoEvents[0];
          const minMs=(ev.triggerIntervalMin||1)*60*1000;
          const maxMs=(ev.triggerIntervalMax||3)*60*1000;
          return Date.now()+minMs+Math.random()*(maxMs-minMs);
        })(),
        breakEndsAt:null,
        betDeadline:null,
      };
      const { nextState, delistedNames } = applyScheduledDelistings(baseState, r, "roundStart");
      autoDelistedNames = delistedNames;
      return nextState;
    });
    t2(
      autoDelistedNames.length > 0
        ? `Round ${r} 시작 (${rc?.durationMin||5}분) — 자동 폐지: ${autoDelistedNames.join(", ")}`
        : `Round ${r} 시작 (${rc?.durationMin||5}분)`
    );
  };
  const stopRound=()=>{
    const r=shared.round;
    const rc=shared.rounds?.[r-1];
    const divs=rc?.dividends||{};
    setShared(s=>{
      const nowT=Date.now();
      let teams={...s.teams};

      // 베팅 정산 (settled 마킹 + 당첨금 지급)
      const roundBets=s.bets?.[r]||{};
      const newBetsForRound={};
      if(s.betEnabled&&Object.keys(roundBets).length>0){
        for(const [tid,teamBets] of Object.entries(roundBets)){
          if(!teams[tid]) continue;
          let payout=0;
          const settledTeamBets={};
          for(const [sid,bet] of Object.entries(teamBets)){
            if(!bet||bet.settled){settledTeamBets[sid]=bet;continue;}
            const stock=s.stocks?.find(x=>x.id===sid);
            if(!stock){settledTeamBets[sid]=bet;continue;}
            const startP=getRoundStartPrice(stock, r);
            const endP=getRoundClosePrice(stock, r);
            const actualDir=endP>startP?"up":endP<startP?"down":"draw";
            const success=actualDir===bet.direction&&actualDir!=="draw";
            const betPayout=success?Math.round(bet.amount*(bet.odds||s.baseOdds||1.8)):0;
            payout+=betPayout;
            settledTeamBets[sid]={...bet,settled:true,success,payout:betPayout};
          }
          newBetsForRound[tid]=settledTeamBets;
          if(payout>0){
            const tm=teams[tid];
            const hist=Array.isArray(tm.history)?tm.history:Object.values(tm.history||{});
            teams[tid]={...tm,cash:tm.cash+payout,
              history:[...hist,{time:new Date().toLocaleTimeString('ko-KR'),
                type:'bet',stockName:`R${r} 베팅 정산`,stockEmoji:'🎲',qty:0,price:0,total:payout}]};
          }
        }
      }

      // 배당금 지급
      for(const [tid,tm] of Object.entries(teams)){
        let bonus=0;
        for(const [sid,perShare] of Object.entries(divs)){
          const qty=tm.holdings?.[sid]?.qty||0;
          bonus+=qty*perShare;
        }
        if(bonus>0){
          const hist=Array.isArray(tm.history)?tm.history:Object.values(tm.history||{});
          teams[tid]={...tm,cash:tm.cash+bonus,
            history:[...hist,{time:new Date().toLocaleTimeString('ko-KR'),
              type:'dividend',stockName:'배당금',stockEmoji:'💰',qty:0,price:0,total:bonus}]};
        }
      }

      const newBets={...(s.bets||{}),[r]:newBetsForRound};
      const breakEnd=s.autoPlay?(nowT+s.breakDuration*1000):null;
      const betEnd=s.betEnabled?(nowT+(s.betWindow||30)*1000):null;

      // 이벤트로 수정된 종가를 stock.prices에 반영 → 다음 라운드 시작가 연속성 보장
      const nextStocks=(s.stocks||[]).map(stock=>{
        const mod=s.modifiedTargets?.[stock.id];
        if(mod&&mod.round===r){
          const newPrices=[...stock.prices];
          newPrices[r-1]=mod.modifiedPrice;
          return{...stock,prices:newPrices};
        }
        return stock;
      });

      return{...s,
        phase:"break",roundEndsAt:null,roundStartedAt:null,teams,
        stocks:nextStocks,
        bets:newBets,betOdds:{},
        breakEndsAt:breakEnd,
        betDeadline:betEnd,
      };
    });
    t2(`Round ${r} 종료`+(Object.keys(divs).length>0?" — 배당금 지급":""));
  };
  const endGame=()=>{setShared(s=>({...s,phase:"ended"}));t2("게임 종료");};

  // 종목 상장/폐지
  const delistStock=async sid=>{
    setShared(s=>{
      const st=s.stocks?.find(x=>x.id===sid);
      if(!st) return s;
      const r=Math.max(s.round,1);
      const price=getCurrentPrice(st,r,s.roundStartedAt,s.roundEndsAt,s.activeEvent,s.modifiedTargets,s.eventSnapshots,s.phase);
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
  const applyEvent=ev=>{
    const now=Date.now();
    // 발동 시점 각 종목 현재가 스냅샷 (eventSnapshots=null: 이전 스냅샷 무시)
    const snapshots={};
    (shared.stocks||[]).forEach(stock=>{
      const currentP=getCurrentPrice(
        stock,shared.round,
        shared.roundStartedAt,shared.roundEndsAt,
        null,shared.modifiedTargets,null,shared.phase
      );
      snapshots[stock.id]={appliedAt:now,basePrice:currentP};
    });
    // 목표가 수정
    const newMod={...(shared.modifiedTargets||{})};
    (shared.stocks||[]).forEach(stock=>{
      const eff=ev.stockEffects?.[stock.id]??ev.globalEffect??0;
      if(eff===0) return;
      const ri=Math.min(shared.round-1,stock.prices.length-1);
      const base=newMod[stock.id]?.round===shared.round
        ?newMod[stock.id].modifiedPrice
        :stock.prices[ri];
      newMod[stock.id]={
        round:shared.round,
        originalPrice:stock.prices[ri],
        modifiedPrice:Math.max(Math.round(base*(1+eff/100)),1),
      };
    });
    setShared(s=>({
      ...s,
      activeEvent:{...ev,appliedAt:now},
      eventHistory:[...(s.eventHistory||[]),{...ev,appliedAt:now}],
      modifiedTargets:newMod,
      eventSnapshots:snapshots,
    }));
    t2(`🚨 ${ev.name} 발동!`);
  };
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
  const resetGame = async () => {
    try {
      const snapshot = await get(GAME_REF);
      const current = snapshot.val() || {};
      const savedCreds = current.teamCredentials || {};
      const savedCash = current.initCash || DEFAULT_INIT_CASH;

      // 팀 완전 초기화
      // Firebase가 빈 {}를 삭제하므로 _reset 플래그로 표시
      const freshTeams = {};
      for (const [name, { id, pw, groupName }] of Object.entries(savedCreds)) {
        const existingPoints = current.teams?.[id]?.diamonds || 0;
        freshTeams[id] = {
          name,
          groupName: groupName || "",
          cash: savedCash,
          holdings: { _empty: true },  // Firebase 빈객체 방지용
          purchases: ["_empty"],        // Firebase 빈배열 방지용
          history: ["_empty"],
          borrowed: 0,
          pw,
          diamonds: existingPoints,       // 다이아는 게임 초기화해도 유지
        };
      }
      // 조 다이아 유지, memberIds 유지
      const savedGroups = {};
      if (current.groups) {
        for (const [g, v] of Object.entries(current.groups)) {
          savedGroups[g] = { diamonds: v.diamonds || 0, memberIds: v.memberIds || [] };
        }
      }

      const savedRounds = current.rounds || [];
      const savedBetEnabled = current.betEnabled || false;
      const savedBetWindow = current.betWindow || 30;
      const savedTimelineSteps = current.timelineSteps
        || buildTimelineSteps({ rounds: savedRounds, betEnabled: savedBetEnabled, betDuration: savedBetWindow });

      const newState = {
        stocks: current.stocks || [],
        rounds: savedRounds,
        shopItems: current.shopItems || [],
        eventPresets: current.eventPresets || [],
        customTemplates: current.customTemplates || [],
        maxRound: current.maxRound || 3,
        initCash: savedCash,
        feeRate: current.feeRate || 0.1,
        leverageEnabled: current.leverageEnabled || false,
        leverageMax: current.leverageMax || 2,
        teamCredentials: savedCreds,
        teams: freshTeams,
        phase: "ready",
        round: 0,
        roundStartedAt: 0,
        roundEndsAt: 0,
        activeEvent: 0,
        eventHistory: ["_empty"],
        notice: "",
        noticeAt: 0,
        bonusPool: { _empty: true },
        priceHistory: { _empty: true },
        modifiedTargets: { _empty: true },
        eventSnapshots: { _empty: true },
        nextAutoEventAt: 0,
        chatMessages: ["_empty"],
        tradeOffers: { _empty: true },
        autoPlay: current.autoPlay || false,
        breakDuration: current.breakDuration || 60,
        betWindow: savedBetWindow,
        betEnabled: savedBetEnabled,
        baseOdds: current.baseOdds || 1.8,
        dynamicOdds: current.dynamicOdds || false,
        minBet: current.minBet || 100000,
        maxBetPct: current.maxBetPct || 50,
        breakEndsAt: 0,
        betDeadline: 0,
        bets: { _empty: true },
        betOdds: { _empty: true },
        groups: savedGroups,
        timelineSteps: savedTimelineSteps,
        timelineIndex: -1,
        timelineAuto: false,
        timelineEndsAt: 0,
        currentPhaseDetail: "",
        currentPhase: "ready",
        resultHint: "",
      };

      await fbSet(GAME_REF, newState);
      t2("게임 초기화 ✓");
    } catch(e) {
      console.error("resetGame error:", e);
      t2("초기화 중 오류 발생");
    }
  };

  const getGroupRank=()=>{
    return Array.from({length:16},(_,i)=>`${i+1}조`).map(group=>{
      const members=Object.entries(shared.teamCredentials||{})
        .filter(([,v])=>v.groupName===group);
      const r=Math.max(shared.round,1);
      const totalAsset=members.reduce((sum,[,{id}])=>{
        const tm=shared.teams?.[id];
        if(!tm) return sum;
        const sv=Object.entries(tm.holdings||{}).reduce((acc,[sid,h])=>{
          if(sid==='_empty') return acc;
          const st=shared.stocks?.find(x=>x.id===sid);
          return acc+(st?st.prices[Math.min(r-1,st.prices.length-1)]*(h.qty||0):0);
        },0);
        return sum+(tm.cash||0)+sv;
      },0);
      const groupPoints=shared.groups?.[group]?.diamonds||0;
      const memberCount=members.length;
      return{group,totalAsset,groupPoints,memberCount};
    }).filter(g=>g.memberCount>0).sort((a,b)=>b.totalAsset-a.totalAsset);
  };
  const getIndividualRank=()=>{
    const r=Math.max(shared.round,1);
    const entries = Object.entries(shared.teamCredentials||{}).map(([name,v])=>{
      const tm=shared.teams?.[v.id];
      if(!tm) return null;
      const stockValue=Object.entries(tm.holdings||{}).reduce((acc,[sid,h])=>{
        if(sid==='_empty') return acc;
        const st=shared.stocks?.find(x=>x.id===sid);
        return acc+(st?st.prices[Math.min(r-1,st.prices.length-1)]*(h.qty||0):0);
      },0);
      const totalAsset=(tm.cash||0)+stockValue;
      return {
        id:v.id,
        name,
        groupName:v.groupName||"",
        totalAsset,
        stockValue,
        cash:tm.cash||0,
        diamonds: tm.diamonds||0,
      };
    }).filter(Boolean);
    return entries.sort((a,b)=>b.totalAsset-a.totalAsset);
  };

  const phaseLabel=shared.phase==="ready"?"대기중":shared.phase==="round"?`R${shared.round} 진행중`:shared.phase==="break"?`R${shared.round} 종료`:"게임종료";
  const phaseBg=shared.phase==="round"?G.greenLight:shared.phase==="break"?G.yellowLight:shared.phase==="ended"?G.redLight:G.gray4;
  const phaseColor=shared.phase==="round"?G.green:shared.phase==="break"?G.yellow:shared.phase==="ended"?G.red:G.gray1;
  const TABS=[["control","진행"],["settings","설정"],["teams","팀"],["accounts","계좌"],["rank","순위"],["preview","👁미리"]];

  const allTemplates=[...BUILT_IN_TEMPLATES,...(shared.customTemplates||[])];

  return(
    <div style={{...WRAP,background:G.bg}}>
      <div style={{background:G.white,padding:"env(safe-area-inset-top, 14px) 16px 0",borderBottom:`1px solid ${G.border}`,position:"sticky",top:"env(safe-area-inset-top, 0)",zIndex:50}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
          {onBack&&(
            <div onClick={onBack} style={{display:"flex",alignItems:"center",gap:4,cursor:"pointer",padding:"4px 8px",borderRadius:8,background:G.bg,flexShrink:0}}>
              <span style={{fontSize:15}}>←</span>
              <span style={{fontSize:11,fontWeight:600,color:G.gray1}}>나가기</span>
            </div>
          )}
          <div style={{background:G.black,color:G.white,borderRadius:6,padding:"2px 8px",fontSize:11,fontWeight:700}}>ADMIN</div>
          <span style={{fontSize:16,fontWeight:800,color:G.black}}>운영자 패널</span>
          <div style={{marginLeft:"auto",background:phaseBg,color:phaseColor,borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:600}}>{phaseLabel}</div>
        </div>
        {shared.activeEvent&&<div style={{marginBottom:6}}><EventBanner event={shared.activeEvent} showEffect={true}/></div>}
        <div style={{display:"flex",overflowX:"auto"}}>
          {TABS.map(([key,label])=>(
            <div key={key} onClick={()=>setTab(key)} style={{flex:1,textAlign:"center",padding:"8px 6px",fontSize:11,fontWeight:600,
              color:tab===key?G.blue:G.gray1,borderBottom:`2px solid ${tab===key?G.blue:"transparent"}`,cursor:"pointer",transition:"all .15s",whiteSpace:"nowrap"}}>{label}</div>
          ))}
        </div>
      </div>

      <div style={{padding:"14px 14px env(safe-area-inset-bottom, 100px)",overflowY:"auto",WebkitOverflowScrolling:"touch"}}>

        {/* ══ 진행 탭 ══ */}
        {tab==="control"&&<>
          {/* 자동 타임라인 */}
          {!shared.timelineAuto ? (
            <Btn onClick={() => {
              setShared(s => ({
                ...s,
                timelineAuto: true,
                timelineIndex: -1,
                timelineEndsAt: 0,
              }));
              const _totalMin = Math.round((shared.timelineSteps || INIT_SS.timelineSteps).reduce((s, st) => s + st.duration, 0) / 60);
              t2(`${_totalMin}분 자동 진행 시작!`);
            }} color={G.green}
              style={{width:"100%",padding:"14px",fontSize:15,marginBottom:8}}>
              {(() => {
                const _totalMin = Math.round((shared.timelineSteps || INIT_SS.timelineSteps).reduce((s, st) => s + st.duration, 0) / 60);
                return `▶ 게임 자동 시작 (${_totalMin}분)`;
              })()}
            </Btn>
          ) : (
            <div style={{background:G.greenLight,borderRadius:14,padding:14,marginBottom:10}}>
              <div style={{fontSize:13,fontWeight:700,color:G.green,marginBottom:6}}>
                ▶ 자동 진행 중
              </div>
              {(() => {
                const steps = shared.timelineSteps || INIT_SS.timelineSteps;
                const idx = shared.timelineIndex ?? -1;
                const step = steps[idx];
                const rem = shared.timelineEndsAt
                  ? Math.max(0, Math.round((shared.timelineEndsAt - Date.now()) / 1000))
                  : 0;
                return (
                  <div>
                    <div style={{fontSize:14,fontWeight:600,color:G.black,marginBottom:4}}>
                      {step ? step.label : "준비 중..."}
                    </div>
                    <div style={{fontSize:22,fontWeight:800,color:G.green,fontFamily:"monospace",marginBottom:8}}>
                      {secToStr(rem)}
                    </div>
                    <div style={{display:"flex",gap:6}}>
                      <Btn onClick={() => setShared(s => ({...s, timelineEndsAt: 0}))}
                        color={G.yellow} textColor={G.black}
                        style={{flex:1,padding:"8px",fontSize:12}}>
                        다음 단계 강제 진행
                      </Btn>
                      <Btn onClick={() => setShared(s => ({...s, timelineAuto: false}))}
                        color={G.redLight} textColor={G.red}
                        style={{flex:1,padding:"8px",fontSize:12}}>
                        자동 진행 중단
                      </Btn>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* 힌트 설정 */}
          <div style={{background:G.white,borderRadius:14,padding:14,marginBottom:10}}>
            <div style={{fontSize:13,fontWeight:700,color:G.black,marginBottom:8}}>
              💡 종가 확인 힌트 설정
            </div>
            <div style={{fontSize:11,color:G.gray1,marginBottom:8}}>
              종가 확인 단계에서 팀원에게 공개될 힌트
            </div>
            <textarea value={resultHintInput}
              onChange={e=>setResultHintInput(e.target.value)}
              placeholder="예) 다음 라운드에서 에너지 섹터 강세 예상"
              rows={3}
              style={{width:"100%",border:`1.5px solid ${G.border}`,borderRadius:8,
                padding:"9px 10px",fontSize:13,fontFamily:"inherit",outline:"none",
                color:G.black,boxSizing:"border-box",resize:"vertical",lineHeight:1.6}}/>
            <div style={{display:"flex",gap:8,marginTop:8}}>
              <Btn onClick={()=>{
                setShared(s=>({...s,resultHint:resultHintInput}));
                t2("힌트 저장됨");
              }} style={{flex:1,padding:"9px",fontSize:12}}>저장</Btn>
              <Btn onClick={()=>{
                setShared(s=>({...s,resultHint:""}));
                setResultHintInput("");
                t2("힌트 삭제됨");
              }} color={G.redLight} textColor={G.red}
                style={{flex:1,padding:"9px",fontSize:12}}>삭제</Btn>
            </div>
          </div>

          {/* 규칙 설정 */}
          <div style={{background:G.white,borderRadius:14,padding:14,marginBottom:10}}>
            <div style={{fontSize:13,fontWeight:700,color:G.black,marginBottom:4}}>📋 게임 규칙</div>
            <div style={{fontSize:11,color:G.gray1,marginBottom:8}}>참여자 화면의 규칙 탭에 표시됩니다</div>
            <textarea value={rulesInput} onChange={e=>setRulesInput(e.target.value)}
              placeholder={"예) 1. 매수·매도는 라운드 진행 중에만 가능합니다\n2. 수수료율 10%\n3. 레버리지 최대 2배"}
              rows={5}
              style={{width:"100%",border:`1.5px solid ${G.border}`,borderRadius:8,
                padding:"9px 10px",fontSize:13,fontFamily:"inherit",outline:"none",
                color:G.black,boxSizing:"border-box",resize:"vertical",lineHeight:1.6}}/>
            <div style={{display:"flex",gap:8,marginTop:8}}>
              <Btn onClick={()=>{setShared(s=>({...s,rules:rulesInput}));t2("규칙 저장됨");}} style={{flex:1,padding:"9px",fontSize:12}}>저장</Btn>
              <Btn onClick={()=>{setShared(s=>({...s,rules:""}));setRulesInput("");t2("규칙 삭제됨");}} color={G.redLight} textColor={G.red} style={{flex:1,padding:"9px",fontSize:12}}>삭제</Btn>
            </div>
          </div>

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

          {/* 채팅 관리 */}
          <div style={{background:G.white,borderRadius:14,padding:14,marginBottom:10}}>
            <div style={{fontSize:13,fontWeight:700,color:G.black,marginBottom:8}}>💬 채팅 관리</div>

            {/* 채팅 전송 */}
            {(()=>{
              const sendAdminChat=()=>{
                const text=adminChatInput.trim();
                if(!text){t2("메시지를 입력하세요");return;}
                const msg={id:uid(),teamName:"🛠 운영자",text,ts:Date.now()};
                setShared(s=>({...s,chatMessages:[...(Array.isArray(s.chatMessages)?s.chatMessages:[]),msg].slice(-200)}));
                setAdminChatInput("");
                t2("채팅 전송됨");
              };
              return(
                <div style={{display:"flex",gap:8,marginBottom:10}}>
                  <TextInput value={adminChatInput} onChange={e=>setAdminChatInput(e.target.value)}
                    onKeyDown={e=>e.key==="Enter"&&sendAdminChat()}
                    placeholder="운영자로 채팅 전송 (Enter)" style={{flex:1}}/>
                  <Btn onClick={sendAdminChat} style={{flexShrink:0,padding:"9px 12px",fontSize:12}}>전송</Btn>
                </div>
              );
            })()}

            {/* 채팅 미리보기 + 개별 삭제 */}
            <div style={{maxHeight:200,overflowY:"auto",marginBottom:8}}>
              {(shared.chatMessages||[]).length===0
                ?<div style={{textAlign:"center",color:G.gray2,fontSize:12,padding:"12px 0"}}>채팅 없음</div>
                :[...(shared.chatMessages||[])].reverse().map(msg=>(
                  <div key={msg.id} style={{display:"flex",alignItems:"flex-start",gap:8,
                    padding:"6px 0",borderBottom:`1px solid ${G.border}`}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:11,fontWeight:600,color:msg.teamName==="🛠 운영자"?G.orange:G.blue,marginBottom:2}}>
                        {msg.teamName}
                      </div>
                      <div style={{fontSize:12,color:G.black,wordBreak:"break-all"}}>{msg.text}</div>
                      <div style={{fontSize:10,color:G.gray2,marginTop:2}}>
                        {new Date(msg.ts).toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}
                      </div>
                    </div>
                    <div onClick={()=>{
                      setShared(s=>({...s,
                        chatMessages:(Array.isArray(s.chatMessages)?s.chatMessages:[])
                          .filter(m=>m.id!==msg.id)
                      }));
                      t2("메시지 삭제됨");
                    }}
                      style={{width:24,height:24,borderRadius:6,background:G.redLight,color:G.red,
                        display:"flex",alignItems:"center",justifyContent:"center",
                        cursor:"pointer",fontSize:13,fontWeight:700,flexShrink:0}}>×</div>
                  </div>
                ))
              }
            </div>

            {/* 전체 삭제 */}
            {(shared.chatMessages||[]).length>0&&(
              <Btn
                onClick={()=>{
                  if(!window.confirm("채팅 전체를 삭제할까요?")) return;
                  setShared(s=>({...s,chatMessages:["_empty"]}));
                  t2("채팅 전체 삭제됨");
                }}
                color={G.redLight} textColor={G.red}
                style={{width:"100%",padding:"9px",fontSize:12}}>
                🗑 채팅 전체 삭제
              </Btn>
            )}
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

          {/* 1라운드 전 베팅 오픈 */}
          {shared.phase==="ready"&&shared.betEnabled&&(
            <div style={{background:G.white,borderRadius:14,padding:14,marginBottom:10}}>
              <div style={{fontSize:13,fontWeight:700,color:G.black,marginBottom:8}}>🎲 1라운드 전 베팅</div>
              {!shared.betDeadline||shared.betDeadline<Date.now()?(
                <Btn onClick={()=>{
                    const deadline=Date.now()+(shared.betWindow||30)*1000;
                    setShared(s=>({...s,betDeadline:deadline,betOdds:{}}));
                    t2(`베팅 오픈 (${shared.betWindow||30}초)`);
                  }}
                  color={G.purple}
                  style={{width:"100%",padding:"12px",fontSize:13}}>
                  🎲 1라운드 베팅 오픈
                </Btn>
              ):(
                <div>
                  <div style={{background:G.purpleLight,borderRadius:10,padding:"10px 12px",
                    marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:13,color:G.purple,fontWeight:600}}>베팅 진행 중</span>
                    <span style={{fontSize:14,fontWeight:800,color:G.purple,fontFamily:"monospace"}}>
                      {betRem!==null&&betRem>0?secToStr(betRem):"마감"}
                    </span>
                  </div>
                  <Btn onClick={()=>{setShared(s=>({...s,betDeadline:0}));t2("베팅 마감");}}
                    color={G.redLight} textColor={G.red}
                    style={{width:"100%",padding:"10px",fontSize:12}}>
                    베팅 즉시 마감
                  </Btn>
                </div>
              )}
            </div>
          )}

          {/* 자동 진행 */}
          <div style={{background:G.white,borderRadius:14,padding:14,marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:shared.autoPlay&&shared.phase==="break"?10:0}}>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:G.black}}>Break 후 자동 시작</div>
                <div style={{fontSize:11,color:G.gray1}}>휴식({breakDuration}s) 끝나면 다음 라운드 자동 시작 (수동 제어 시 사용)</div>
              </div>
              <div onClick={()=>setShared(s=>({...s,autoPlay:!s.autoPlay}))}
                style={{width:44,height:26,borderRadius:13,background:shared.autoPlay?G.green:G.gray3,
                  position:"relative",cursor:"pointer",transition:"background .2s"}}>
                <div style={{width:22,height:22,borderRadius:"50%",background:G.white,position:"absolute",
                  top:2,left:shared.autoPlay?20:2,transition:"left .2s"}}/>
              </div>
            </div>
            {shared.autoPlay&&shared.phase==="break"&&(
              <div style={{background:G.yellowLight,borderRadius:10,padding:"10px 12px"}}>
                <div style={{fontSize:12,fontWeight:700,color:G.yellow,marginBottom:2}}>
                  휴식 중 — R{(shared.round||0)+1} 자동 시작까지
                  <span style={{fontFamily:"monospace",marginLeft:6}}>{breakRem!==null?secToStr(breakRem):"--:--"}</span>
                </div>
                {shared.betEnabled&&shared.betDeadline&&(
                  <div style={{fontSize:11,color:G.orange}}>
                    🎯 베팅 마감까지 {betRem!==null&&betRem>0?secToStr(betRem):"마감"}
                  </div>
                )}
              </div>
            )}
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
            <Btn onClick={()=>{if(!window.confirm("게임을 종료하시겠습니까?")) return; endGame();}} color={G.black} style={{flex:1,padding:"12px 0"}}>게임 종료</Btn>
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

          <Btn onClick={()=>{if(!window.confirm("게임을 초기화합니다.\n모든 팀의 자산·거래내역이 초기화됩니다.\n설정과 팀 등록 정보는 유지됩니다.\n계속하시겠습니까?")) return; resetGame();}} color={G.redLight} textColor={G.red} style={{width:"100%",padding:"12px",fontSize:13}}>🔄 게임 초기화 (설정·팀 유지)</Btn>
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

            {/* 자동 진행 설정 */}
            <div style={{background:G.white,borderRadius:14,padding:14,marginBottom:10}}>
              <div style={{fontSize:13,fontWeight:700,color:G.black,marginBottom:10}}>자동 진행 설정</div>
              <div style={{display:"flex",gap:8,marginBottom:10}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:11,color:G.gray2,marginBottom:4}}>휴식 시간 (초)</div>
                  <NumInput value={breakDuration} onChange={e=>setBreakDuration(parseInt(e.target.value)||30)}/>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:11,color:G.gray2,marginBottom:4}}>베팅 마감 (초)</div>
                  <NumInput value={betWindow} onChange={e=>setBetWindow(parseInt(e.target.value)||15)}/>
                </div>
              </div>
            </div>

            {/* 방향 예측 베팅 설정 */}
            <div style={{background:G.white,borderRadius:14,padding:14,marginBottom:10}}>
              <div style={{fontSize:13,fontWeight:700,color:G.black,marginBottom:10}}>방향 예측 베팅</div>
              <div style={{background:G.bg,borderRadius:10,padding:"10px 12px",marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:G.black}}>베팅 활성화</div>
                    <div style={{fontSize:11,color:G.gray1}}>휴식 중 상승/하락 예측 베팅</div>
                  </div>
                  <div onClick={()=>setBetEnabled(v=>!v)}
                    style={{width:44,height:26,borderRadius:13,background:betEnabled?G.orange:G.gray3,
                      position:"relative",cursor:"pointer",transition:"background .2s"}}>
                    <div style={{width:22,height:22,borderRadius:"50%",background:G.white,position:"absolute",
                      top:2,left:betEnabled?20:2,transition:"left .2s"}}/>
                  </div>
                </div>
              </div>
              {betEnabled&&<>
                <div style={{display:"flex",gap:8,marginBottom:10}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:11,color:G.gray2,marginBottom:4}}>기본 배당률 (x)</div>
                    <NumInput value={baseOdds} onChange={e=>setBaseOdds(parseFloat(e.target.value)||1.5)} style={{textAlign:"left"}}/>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:11,color:G.gray2,marginBottom:4}}>최소 베팅 (원)</div>
                    <NumInput value={minBet} onChange={e=>setMinBet(parseInt(e.target.value)||10000)}/>
                  </div>
                </div>
                <div style={{display:"flex",gap:8,marginBottom:10}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:11,color:G.gray2,marginBottom:4}}>최대 베팅 (현금의 %)</div>
                    <NumInput value={maxBetPct} onChange={e=>setMaxBetPct(parseInt(e.target.value)||50)}/>
                  </div>
                </div>
                <div style={{background:G.bg,borderRadius:10,padding:"10px 12px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:600,color:G.black}}>다이나믹 배당률</div>
                      <div style={{fontSize:11,color:G.gray1}}>베팅 비율에 따라 배당률 자동 조정</div>
                    </div>
                    <div onClick={()=>setDynamicOdds(v=>!v)}
                      style={{width:44,height:26,borderRadius:13,background:dynamicOdds?G.purple:G.gray3,
                        position:"relative",cursor:"pointer",transition:"background .2s"}}>
                      <div style={{width:22,height:22,borderRadius:"50%",background:G.white,position:"absolute",
                        top:2,left:dynamicOdds?20:2,transition:"left .2s"}}/>
                    </div>
                  </div>
                </div>
              </>}
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
                    <div style={{fontSize:11,color:G.purple,flexShrink:0,width:60}}>다이아 가격</div>
                    <NumInput value={item.pointPrice||0} onChange={e=>updShop(item.id,"pointPrice",parseInt(e.target.value)||0)} style={{textAlign:"left"}}/>
                    <span style={{fontSize:11,color:G.purple}}>💎</span>
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
                        <div style={{fontSize:11,color:G.gray2,marginBottom:3}}>공개 설명 (팀원 화면 표시)</div>
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
                      <div style={{borderTop:`1px solid ${G.border}`,paddingTop:10,marginTop:4}}>
                        <div style={{fontSize:12,fontWeight:700,color:G.black,marginBottom:8}}>⚡ 자동 발동 설정</div>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                          <div>
                            <div style={{fontSize:13,fontWeight:600,color:G.black}}>자동 발동</div>
                            <div style={{fontSize:11,color:G.gray1}}>라운드 중 자동으로 발동</div>
                          </div>
                          <div onClick={()=>updEvent(ev.id,"autoTrigger",!ev.autoTrigger)}
                            style={{width:44,height:26,borderRadius:13,background:ev.autoTrigger?G.blue:G.gray3,position:"relative",cursor:"pointer",transition:"background .2s"}}>
                            <div style={{width:22,height:22,borderRadius:"50%",background:G.white,position:"absolute",top:2,left:ev.autoTrigger?20:2,transition:"left .2s"}}/>
                          </div>
                        </div>
                        {ev.autoTrigger&&<>
                          <div style={{display:"flex",gap:8,marginBottom:8}}>
                            <div style={{flex:1}}>
                              <div style={{fontSize:11,color:G.gray2,marginBottom:3}}>발동 간격 최소 (분)</div>
                              <NumInput value={ev.triggerIntervalMin||1} onChange={e=>updEvent(ev.id,"triggerIntervalMin",parseInt(e.target.value)||1)}/>
                            </div>
                            <div style={{flex:1}}>
                              <div style={{fontSize:11,color:G.gray2,marginBottom:3}}>발동 간격 최대 (분)</div>
                              <NumInput value={ev.triggerIntervalMax||3} onChange={e=>updEvent(ev.id,"triggerIntervalMax",parseInt(e.target.value)||3)}/>
                            </div>
                          </div>
                          <div style={{display:"flex",gap:8,marginBottom:8}}>
                            <div style={{flex:1}}>
                              <div style={{fontSize:11,color:G.gray2,marginBottom:3}}>발동 확률 (%)</div>
                              <NumInput value={ev.probability||50} onChange={e=>updEvent(ev.id,"probability",parseInt(e.target.value)||50)}/>
                            </div>
                            <div style={{flex:1}}>
                              <div style={{fontSize:11,color:G.gray2,marginBottom:3}}>지속 시간 (초, 0=영구)</div>
                              <NumInput value={ev.duration||60} onChange={e=>updEvent(ev.id,"duration",parseInt(e.target.value)||0)}/>
                            </div>
                          </div>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                            <div>
                              <div style={{fontSize:13,fontWeight:600,color:G.black}}>목표가 수정</div>
                              <div style={{fontSize:11,color:G.gray1}}>이벤트 효과를 목표가에 반영</div>
                            </div>
                            <div onClick={()=>updEvent(ev.id,"affectTarget",ev.affectTarget===false?true:false)}
                              style={{width:44,height:26,borderRadius:13,background:ev.affectTarget!==false?G.blue:G.gray3,position:"relative",cursor:"pointer",transition:"background .2s"}}>
                              <div style={{width:22,height:22,borderRadius:"50%",background:G.white,position:"absolute",top:2,left:ev.affectTarget!==false?20:2,transition:"left .2s"}}/>
                            </div>
                          </div>
                        </>}
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
          {/* 팀-계좌 보정 */}
          <Btn onClick={syncTeamsAndCredentials} color={G.orange}
            style={{width:"100%",padding:"12px",fontSize:13,marginBottom:6}}>
            🔧 팀-계좌 불일치 보정
          </Btn>
          <div style={{fontSize:11,color:G.gray1,marginBottom:10,textAlign:"center"}}>
            credentials↔teams 동기화 · 활동 없는 고아 계좌 제거
          </div>

          {/* 전체 초기화 */}
          <Btn onClick={()=>{
            if(!window.confirm("⚠️ 등록된 팀원, 계좌, 그룹 데이터를 전부 삭제합니다.\n정말 진행하시겠습니까?")) return;
            setShared(s=>({...s, teamCredentials:{}, teams:{}, groups:{}}));
            t2("전체 계좌 삭제 완료");
          }} color={G.red}
            style={{width:"100%",padding:"12px",fontSize:13,marginBottom:6}}>
            🗑 전체 팀/계좌 삭제
          </Btn>
          <div style={{fontSize:11,color:G.gray1,marginBottom:10,textAlign:"center"}}>
            팀원 로그인 정보, 계좌, 그룹 데이터 모두 삭제
          </div>

          {/* 시드 불균형 보정 */}
          <Btn onClick={applySeedBalancing} color={G.green}
            style={{width:"100%",padding:"12px",fontSize:13,marginBottom:10}}>
            🌱 시드 불균형 보정 (조원 적은 조 1명 추가 지급)
          </Btn>

          {/* 개별 등록 */}
          <div style={{background:G.white,borderRadius:14,padding:14,marginBottom:10}}>
            <div style={{fontSize:13,fontWeight:700,color:G.black,marginBottom:10}}>팀원 계정 등록</div>
            <select value={newGroupName} onChange={e=>setNewGroupName(e.target.value)}
              style={{width:"100%",border:`1.5px solid ${G.border}`,borderRadius:8,
                padding:"9px 10px",fontSize:13,fontFamily:"inherit",outline:"none",
                color:G.black,marginBottom:6}}>
              {Array.from({length:16},(_,i)=>`${i+1}조`).map(g=>(
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            <textarea value={newMemberName} onChange={e=>setNewMemberName(e.target.value)}
              placeholder={"이름을 입력하세요\n여러 명은 줄바꿈 또는 쉼표로 구분\n예)\n홍길동\n김철수\n이영희"}
              rows={5}
              style={{width:"100%",border:`1.5px solid ${G.border}`,borderRadius:8,
                padding:"9px 10px",fontSize:13,fontFamily:"inherit",outline:"none",
                color:G.black,boxSizing:"border-box",resize:"vertical",lineHeight:1.6,marginBottom:6}}/>
            <Btn onClick={addMember} style={{width:"100%",padding:"9px",fontSize:13}}>등록</Btn>
          </div>

          {/* 일괄 등록 */}
          <div style={{background:G.blueLight,borderRadius:14,padding:14,marginBottom:10}}>
            <div style={{fontSize:13,fontWeight:700,color:G.blue,marginBottom:8}}>📋 일괄 등록</div>
            <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:6}}>
              <select value={newGroupName} onChange={e=>setNewGroupName(e.target.value)}
                style={{flex:1,border:`1.5px solid ${G.border}`,borderRadius:8,
                  padding:"8px",fontSize:12,fontFamily:"inherit",outline:"none"}}>
                {Array.from({length:16},(_,i)=>`${i+1}조`).map(g=>(
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
              <NumInput value={batchCount} onChange={e=>setBatchCount(parseInt(e.target.value)||1)}
                placeholder="인원" style={{width:60}}/>
              <span style={{fontSize:12,color:G.gray1,flexShrink:0}}>명</span>
              <Btn onClick={addBatch} color={G.blue}
                style={{flexShrink:0,padding:"8px 12px",fontSize:12}}>등록</Btn>
            </div>
            <div style={{fontSize:11,color:G.blue}}>예) 1조 5명 → 1조-1 ~ 1조-5 자동 생성</div>
          </div>

          {/* 조별 다이아 지급 */}
          <div style={{background:G.white,borderRadius:14,padding:14,marginBottom:10}}>
            <div style={{fontSize:13,fontWeight:700,color:G.black,marginBottom:10}}>💎 조별 다이아 지급</div>
            <div style={{display:"flex",gap:8}}>
              <select value={pointGroupTarget} onChange={e=>setPointGroupTarget(e.target.value)}
                style={{flex:1,border:`1.5px solid ${G.border}`,borderRadius:8,
                  padding:"9px 10px",fontSize:13,fontFamily:"inherit",outline:"none"}}>
                <option value="전체">전체 조</option>
                {Array.from({length:16},(_,i)=>`${i+1}조`).map(g=>(
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
              <NumInput value={groupPointInput} onChange={e=>setGroupPointInput(e.target.value)}
                placeholder="다이아" style={{width:80,textAlign:"left"}}/>
              <Btn onClick={giveGroupPoints} color={G.purple}
                style={{flexShrink:0,padding:"9px 12px",fontSize:12}}>지급</Btn>
            </div>
          </div>

          {/* 조별 팀원 목록 */}
          {(()=>{
            // teamCredentials + teams 양쪽 합산
            const credIds=new Set(Object.values(shared.teamCredentials||{}).map(v=>v.id));
            const orphans=Object.entries(shared.teams||{})
              .filter(([id,tm])=>!credIds.has(id)&&tm.name)
              .map(([id,tm])=>[tm.name,{id,pw:null,groupName:tm.groupName||"미분류"}]);
            const allMembers=[...Object.entries(shared.teamCredentials||{}),...orphans];
            const totalCount=allMembers.length;
            const r=Math.max(shared.round,1);
            const groups=[...new Set(allMembers.map(([,v])=>v.groupName))].sort();
            return(
              <div style={{background:G.white,borderRadius:14,padding:14}}>
                <div style={{fontSize:13,fontWeight:700,color:G.black,marginBottom:12}}>
                  등록된 팀원 ({totalCount}명)
                  {orphans.length>0&&<span style={{fontSize:11,color:G.orange,marginLeft:6}}>⚠ 계좌만 있는 팀 {orphans.length}명</span>}
                </div>
                {totalCount===0
                  ?<div style={{textAlign:"center",color:G.gray2,padding:"24px 0",fontSize:13}}>등록된 팀원 없음</div>
                  :groups.map(group=>{
                    const members=allMembers.filter(([,v])=>v.groupName===group);
                    if(members.length===0) return null;
                    const groupAsset=members.reduce((sum,[,{id}])=>{
                      const tm=shared.teams?.[id];
                      if(!tm) return sum;
                      const sv=Object.entries(tm.holdings||{}).reduce((acc,[sid,h])=>{
                        if(sid==='_empty') return acc;
                        const st=shared.stocks?.find(x=>x.id===sid);
                        return acc+(st?st.prices[Math.min(r-1,st.prices.length-1)]*(h.qty||0):0);
                      },0);
                      return sum+(tm.cash||0)+sv;
                    },0);
                    const groupPoints=shared.groups?.[group]?.diamonds||0;
                    return(
                      <div key={group} style={{marginBottom:16}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                          <div style={{fontSize:13,fontWeight:700,color:G.black}}>{group} ({members.length}명)</div>
                          <div style={{display:"flex",gap:8,alignItems:"center"}}>
                            {groupPoints>0&&<div style={{fontSize:11,color:G.purple,fontWeight:600}}>💎 {groupPoints}</div>}
                            <div style={{fontSize:11,color:G.gray1}}>합산 {fmt(groupAsset)}</div>
                          </div>
                        </div>
                        {/* 팀코드 + 조장 설정 */}
                        <div style={{display:"flex",gap:6,marginBottom:6,alignItems:"center"}}>
                          <TextInput
                            value={shared.groups?.[group]?.code||""}
                            onChange={e=>setGroupCode(group,e.target.value)}
                            placeholder="팀코드 입력"
                            style={{flex:1,fontSize:12,padding:"6px 10px"}}/>
                          <select
                            value={shared.groups?.[group]?.leader||""}
                            onChange={e=>setGroupLeader(group,e.target.value)}
                            style={{flex:1,border:`1.5px solid ${G.border}`,borderRadius:8,padding:"6px 8px",fontSize:12,fontFamily:"inherit",outline:"none",color:G.black}}>
                            <option value="">조장 선택</option>
                            {members.map(([n])=><option key={n} value={n}>{n}</option>)}
                          </select>
                        </div>
                        {members.map(([name,{id}])=>{
                          const tm=shared.teams?.[id];
                          const isLeaderMark=shared.groups?.[group]?.leader===name;
                          return(
                            <div key={name} style={{display:"flex",justifyContent:"space-between",
                              alignItems:"center",padding:"6px 10px",
                              background:isLeaderMark?G.yellowLight:G.bg,
                              borderRadius:8,marginBottom:4,
                              border:isLeaderMark?`1px solid ${G.yellow}`:"none"}}>
                              <div style={{display:"flex",alignItems:"center",gap:6}}>
                                {isLeaderMark&&<span style={{fontSize:11,background:G.orange,color:"#fff",borderRadius:20,padding:"1px 7px",fontWeight:700}}>조장</span>}
                                <div style={{fontSize:12,fontWeight:600,color:G.black}}>{name}</div>
                              </div>
                              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                                {tm&&<div style={{fontSize:11,color:G.gray1}}>{fmt(tm.cash||0)}</div>}
                                <div onClick={()=>delMember(name,id,group)}
                                  style={{padding:"3px 8px",borderRadius:6,background:G.redLight,
                                    color:G.red,cursor:"pointer",fontSize:11,fontWeight:600}}>삭제</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })
                }
              </div>
            );
          })()}
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
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <div style={{fontSize:14,fontWeight:700,color:G.black}}>{tm.name}</div>
                        {tm.groupName&&<div style={{fontSize:10,color:G.gray1,background:G.bg,borderRadius:4,padding:"1px 6px"}}>{tm.groupName}</div>}
                      </div>
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
                      {/* 차입금 강제 초기화 */}
                      <div style={{marginBottom:8,background:G.orangeLight,borderRadius:10,padding:"10px 12px"}}>
                        <div style={{fontSize:11,fontWeight:700,color:G.orange,marginBottom:6}}>⚡ 차입금 강제 초기화</div>
                        <div style={{fontSize:11,color:G.gray1,marginBottom:6}}>현재 차입금: {fmt(shared.teams?.[id]?.borrowed||0)}</div>
                        <Btn onClick={()=>{
                          setShared(s=>({...s,teams:{...s.teams,[id]:{...s.teams[id],borrowed:0}}}));
                          t2("차입금 초기화됨");
                        }} color={G.orange} textColor={G.white} style={{width:"100%",padding:"7px",fontSize:12}}>차입금 0으로 초기화</Btn>
                      </div>
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
            <div style={{fontSize:13,fontWeight:700,color:G.black,marginBottom:12}}>팀 순위</div>
            {getGroupRank().length===0
              ?<div style={{textAlign:"center",color:G.gray2,padding:"32px 0"}}>등록된 조 없음</div>
              :getGroupRank().map((g,i)=>{
                const initTotal=(shared.initCash||DEFAULT_INIT_CASH)*g.memberCount;
                const diff=g.totalAsset-initTotal;
                return(
                  <div key={g.group} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 0",borderBottom:`1px solid ${G.border}`}}>
                    <div style={{width:28,height:28,borderRadius:"50%",flexShrink:0,
                      background:i===0?"#FFD700":i===1?"#C0C0C0":i===2?"#CD7F32":G.gray4,
                      display:"flex",alignItems:"center",justifyContent:"center",
                      fontSize:12,fontWeight:700,color:i<3?G.white:G.gray1}}>{i+1}</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:15,fontWeight:800,color:G.black}}>{g.group}</div>
                      <div style={{fontSize:11,color:G.gray1}}>
                        {g.memberCount}명 참여
                        {g.groupPoints>0&&<span style={{color:G.purple,marginLeft:6}}>💎 {g.groupPoints}</span>}
                      </div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:15,fontWeight:800,color:G.black}}>{fmt(g.totalAsset)}</div>
                      <div style={{fontSize:11,fontWeight:600,color:diff>=0?G.red:G.blue}}>
                        {diff>=0?"+":""}{fmt(diff)}
                      </div>
                    </div>
                  </div>
                );
              })
            }
            <div style={{fontSize:13,fontWeight:700,color:G.black,marginTop:18,marginBottom:12}}>개별 순위</div>
            {getIndividualRank().length===0
              ?<div style={{textAlign:"center",color:G.gray2,padding:"20px 0"}}>등록된 인원 없음</div>
              :getIndividualRank().map((p,i)=>{
                const diff=p.totalAsset-(shared.initCash||DEFAULT_INIT_CASH);
                return(
                  <div key={p.id} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 0",borderBottom:`1px solid ${G.border}`}}>
                    <div style={{width:28,height:28,borderRadius:"50%",flexShrink:0,
                      background:i===0?"#FFD700":i===1?"#C0C0C0":i===2?"#CD7F32":G.gray4,
                      display:"flex",alignItems:"center",justifyContent:"center",
                      fontSize:12,fontWeight:700,color:i<3?G.white:G.gray1}}>{i+1}</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:15,fontWeight:800,color:G.black}}>{p.name}</div>
                      <div style={{fontSize:11,color:G.gray1}}>
                        {p.groupName||"무소속"}
                        {p.diamonds>0&&<span style={{color:G.purple,marginLeft:6}}>💎 {p.diamonds}</span>}
                      </div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:15,fontWeight:800,color:G.black}}>{fmt(p.totalAsset)}</div>
                      <div style={{fontSize:11,fontWeight:600,color:diff>=0?G.red:G.blue}}>
                        {diff>=0?"+":""}{fmt(diff)}
                      </div>
                    </div>
                  </div>
                );
              })
            }
          </div>
        )}

        {/* ══ 미리보기 탭 ══ */}
        {tab==="preview"&&(()=>{
          const teamList=Object.entries(shared.teamCredentials||{}).map(([name,v])=>({name,id:v.id,groupName:v.groupName}));
          const pvId=previewTeamId||(teamList[0]?.id||null);
          const pvCred=teamList.find(t=>t.id===pvId);
          const pvName=pvCred?.name||"";
          const pvGroup=pvCred?.groupName||"";
          return(<>
            {/* 팀 선택 */}
            <div style={{background:G.white,borderRadius:14,padding:14,marginBottom:10}}>
              <div style={{fontSize:12,fontWeight:700,color:G.black,marginBottom:8}}>팀 선택</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {teamList.map(t=>(
                  <div key={t.id} onClick={()=>setPreviewTeamId(t.id)}
                    style={{padding:"5px 12px",borderRadius:20,fontSize:12,fontWeight:600,cursor:"pointer",
                      background:pvId===t.id?G.blue:G.bg,color:pvId===t.id?G.white:G.gray1,
                      border:`1.5px solid ${pvId===t.id?G.blue:G.border}`}}>
                    {t.name} {t.groupName?`(${t.groupName})`:""}
                  </div>
                ))}
              </div>
            </div>

            {/* 실제 팀원 화면 */}
            {pvId&&(
              <div style={{borderRadius:16,overflow:"hidden",border:`2px solid ${G.blue}33`,boxShadow:"0 4px 20px rgba(0,0,0,0.08)"}}>
                <div style={{background:G.blue,padding:"6px 14px",fontSize:11,fontWeight:700,color:G.white,display:"flex",alignItems:"center",gap:6}}>
                  <span>👁 미리보기</span>
                  <span style={{opacity:.7}}>— {pvName}{pvGroup?` (${pvGroup})`:""}</span>
                </div>
                <UserApp key={pvId} previewAs={{teamId:pvId,teamName:pvName}}/>
              </div>
            )}
            {teamList.length===0&&<div style={{textAlign:"center",color:G.gray2,padding:"40px 0",fontSize:13}}>등록된 팀이 없습니다</div>}
          </>);
        })()}

      </div>
      <Toast {...toast}/>
    </div>
  );
}

/* ══════════════════════════════════════════
   사용자 앱
══════════════════════════════════════════ */
function UserApp({previewAs=null,onBack=null}){
  const shared=useShared();
  const SESSION_TTL = 15 * 60 * 1000;
  const _savedSession=(()=>{
    if(previewAs) return null;
    try{
      const s=localStorage.getItem('sg_session');
      if(s){const {id,name,ts}=JSON.parse(s);if(id&&name&&Date.now()-ts<SESSION_TTL) return {id,name};}
    }catch(e){}
    return null;
  })();
  const [screen,setScreen]=useState(previewAs?"main":_savedSession?"main":"login");
  const [loginCode,setLoginCode]=useState("");
  const [loginName,setLoginName]=useState("");
  const [loginErr,setLoginErr]=useState("");
  const [teamId,setTeamId]=useState(previewAs?.teamId||_savedSession?.id||null);
  const [teamName,setTeamName]=useState(previewAs?.teamName||_savedSession?.name||"");

  useEffect(()=>{
    if(!previewAs) return;
    setTeamId(previewAs.teamId);
    setTeamName(previewAs.teamName);
    setScreen("main");
    setTab("market");
  },[previewAs?.teamId]);
  const [tab,setTab]=useState("market");
  const [detail,setDetail]=useState(null);
  const detailRef=useRef(null);
  const setDetailSafe=(st)=>{detailRef.current=st;setDetail(st);};
  const [orderSide,setOrderSide]=useState("buy");
  const [qty,setQty]=useState(1);
  const [leverage,setLeverage]=useState(1);
  const [confirm,setConfirm]=useState(false);
  const [toast,setToast]=useState({msg:"",show:false});
  const t2=msg=>showToast(setToast,msg);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const chatBottomRef = useRef(null);
  const lastReadTs = useRef(0);

  useEffect(() => {
    if (screen === "ended") {
      try { localStorage.removeItem('sg_session'); } catch(e) {}
    }
  }, [screen]);

  useEffect(()=>{
    // 게임 종료 시만 화면 전환, detail 화면은 절대 건드리지 않음
    if((screen==="main"||screen==="detail")&&shared.phase==="ended") setScreen("ended");
    if(screen==="ended"&&(shared.phase==="ready"||shared.phase==="round")) setScreen("main");

    // 라운드 종료 시 베팅 결과 팝업
    if(shared.phase==="break"&&teamId){
      const myBets=shared.bets?.[shared.round]?.[teamId];
      if(myBets&&Object.keys(myBets).length>0){
        const results=[];
        let totalPnl=0;
        for(const [stockId,bet] of Object.entries(myBets)){
          if(!bet) continue;
          const stock=shared.stocks?.find(s=>s.id===stockId);
          if(!stock) continue;
          const startP=getRoundStartPrice(stock, shared.round);
          const endP=getRoundClosePrice(stock, shared.round);
          const actualDir=endP>startP?"up":endP<startP?"down":"draw";
          const success=actualDir===bet.direction&&actualDir!=="draw";
          const odds=bet.odds||shared.betOdds?.[stockId]?.[bet.direction==="up"?"upOdds":"downOdds"]||1.8;
          const payout=success?Math.round(bet.amount*odds):0;
          totalPnl+=success?payout-bet.amount:-bet.amount;
          results.push({
            stockId,stockName:stock.name,stockEmoji:stock.emoji,
            direction:bet.direction,amount:bet.amount,
            success,payout,odds,actualDir,
          });
        }
        if(results.length>0) setBetResultPopup({results,totalPnl,round:shared.round});
      }
    }
  },[shared.phase]);

  useEffect(() => {
    if (chatOpen) {
      setUnreadCount(0);
      lastReadTs.current = Date.now();
      setTimeout(() => {
        chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 50);
    }
  }, [chatOpen]);

  useEffect(() => {
    const msgs = shared.chatMessages || [];
    if (!chatOpen && msgs.length > 0) {
      const newMsgs = msgs.filter(m => m.ts > lastReadTs.current && m.teamName !== teamName);
      setUnreadCount(newMsgs.length);
    }
    if (chatOpen) {
      setTimeout(() => {
        chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 50);
    }
  }, [shared.chatMessages]);

  const myTeam=teamId?shared.teams?.[teamId]:null;
  const initCash=shared.initCash||DEFAULT_INIT_CASH;
  const cash=myTeam?.cash??initCash;
  const holdings=myTeam?.holdings??{};
  const purchases=myTeam?.purchases??[];
  const borrowed=myTeam?.borrowed??0;
  const myGroupName=shared.teamCredentials?.[teamName]?.groupName;
  const isLeader=!!(myGroupName&&shared.groups?.[myGroupName]?.leader===teamName);
  const leaderName=myGroupName?shared.groups?.[myGroupName]?.leader:null;
  const leaderId=leaderName?shared.teamCredentials?.[leaderName]?.id:null;
  const leaderPurchases=leaderId?(shared.teams?.[leaderId]?.purchases??[]):[];
  const round=Math.max(shared.round,1);
  const maxRound=shared.maxRound||3;
  const feeRate=shared.feeRate??0.1;
  const leverageEnabled=shared.leverageEnabled??false;
  const leverageMax=shared.leverageMax??2;
  const rem=useRoundTimer(shared.phase,shared.roundEndsAt);
  const [breakRem,setBreakRem]=useState(null);
  const [betRem,setBetRem]=useState(null);
  const [betInputs,setBetInputs]=useState({});
  const [betResultPopup,setBetResultPopup]=useState(null);

  useEffect(()=>{
    const isActiveBet=shared.phase==="break"||shared.phase==="ready";
    if(!isActiveBet){setBreakRem(null);setBetRem(null);return;}
    if(!shared.breakEndsAt&&!shared.betDeadline){setBreakRem(null);setBetRem(null);return;}
    const tick=()=>{
      const now=Date.now();
      setBreakRem(shared.breakEndsAt?Math.max(0,Math.ceil((shared.breakEndsAt-now)/1000)):null);
      setBetRem(shared.betDeadline?Math.max(0,Math.ceil((shared.betDeadline-now)/1000)):null);
    };
    tick();
    const id=setInterval(tick,1000);
    return()=>clearInterval(id);
  },[shared.phase,shared.breakEndsAt,shared.betDeadline]);

  // 현재 라운드 블라인드 여부
  const isBlind=(shared.rounds?.[round-1]?.blind)||false;

  const getLivePrice=useCallback(st=>{
    if(isBlind) return null;
    return getCurrentPrice(st,round,shared.roundStartedAt,shared.roundEndsAt,shared.activeEvent,shared.modifiedTargets,shared.eventSnapshots,shared.phase);
  },[round,shared.roundStartedAt,shared.roundEndsAt,shared.activeEvent,shared.modifiedTargets,isBlind,shared.phase]);

  const totalAsset=useCallback(()=>{
    let t=cash;
    for(const [sid,h] of Object.entries(holdings)){
      const s=shared.stocks?.find(x=>x.id===sid);
      if(s&&h.qty>0){
        const p=getCurrentPrice(s,round,shared.roundStartedAt,shared.roundEndsAt,shared.activeEvent,shared.modifiedTargets,shared.eventSnapshots,shared.phase);
        t+=p*h.qty;
      }
    }
    return t;
  },[cash,holdings,shared.stocks,round,shared.roundStartedAt,shared.roundEndsAt,shared.activeEvent,shared.modifiedTargets,shared.phase]);

  const doLogin=()=>{
    const name=loginName.trim(),code=loginCode.trim();
    if(!name||!code){setLoginErr("이름과 팀코드를 입력해주세요");return;}
    const groupEntry=Object.entries(shared.groups||{}).find(([,g])=>g.code===code);
    if(!groupEntry){setLoginErr("올바르지 않은 팀코드입니다");return;}
    const [groupName]=groupEntry;
    const cred=shared.teamCredentials?.[name];
    if(!cred||cred.groupName!==groupName){setLoginErr("해당 조에 등록되지 않은 이름입니다");return;}
    try {
      localStorage.setItem('sg_session', JSON.stringify({ id: cred.id, name, ts: Date.now() }));
    } catch(e) {}
    setTeamId(cred.id);setTeamName(name);setLoginErr("");setScreen("main");
  };

  const updTeam = async (fn) => {
    try {
      const snap = await get(TEAM_REF(teamId));
      const cur = snap.val() || {
        name: teamName,
        cash: shared.initCash || DEFAULT_INIT_CASH,
        holdings: {}, purchases: [], history: [], borrowed: 0, diamonds: 0,
      };
      if (cur.history && !Array.isArray(cur.history)) {
        cur.history = Object.values(cur.history).filter(x => x !== "_empty" && typeof x === 'object');
      }
      if (!cur.history) cur.history = [];
      if (cur.purchases && !Array.isArray(cur.purchases)) {
        cur.purchases = Object.values(cur.purchases).filter(x => x !== "_empty");
      }
      if (!cur.purchases) cur.purchases = [];
      if (cur.holdings?._empty) cur.holdings = {};
      const updated = fn(cur);
      await fbSet(TEAM_REF(teamId), removeUndefined(updated));
    } catch(e) {
      console.error("updTeam error:", e);
    }
  };

  const orderPrice=detail?(isBlind?detail.prices[Math.min(round-1,detail.prices.length-1)]:getLivePrice(detail)):0;
  const effectiveQty=qty*leverage;
  const feeAmt=Math.round(orderPrice*effectiveQty*feeRate/100);

  const doOrder=async()=>{
    const now = Date.now();
    const isRoundActive = shared.phase === "round"
      && shared.roundEndsAt
      && now < shared.roundEndsAt;
    if (!isRoundActive) {
      t2("현재 매매 시간이 아닙니다");
      setConfirm(false);
      return;
    }
    const s=detail;
    const cur=orderPrice;
    if (!cur || cur <= 0) {
      t2("가격 정보를 불러오는 중입니다");
      setConfirm(false);
      return;
    }
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
      await updTeam(t=>{
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
      // 매도 시 차입금 비례 상환
      // 보유 수량 대비 매도 수량 비율만큼 차입금 상환
      await updTeam(t=>{
        const currentHolding=t.holdings?.[s.id]||{qty:0,avgPrice:0};
        const totalQty=currentHolding.qty||0;
        const repayRatio=totalQty>0?effectiveQty/totalQty:0;
        const repay=Math.round((t.borrowed||0)*repayRatio);
        const newQty=totalQty-effectiveQty;
        const rec={time:new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}),
          type:'sell',stockName:s.name,stockEmoji:s.emoji,qty:effectiveQty,price:cur,total:cost};
        return{
          ...t,
          cash:t.cash+proceeds,
          borrowed:Math.max(0,(t.borrowed||0)-repay),
          holdings:{...t.holdings,[s.id]:{...currentHolding,qty:newQty}},
          history:[...(t.history||[]),rec],
        };
      });
      t2(`${s.name} ${effectiveQty}주 매도 완료`);
    }
    setQty(1);setLeverage(1);setConfirm(false);
  };

  const placeBet=(stockId,direction)=>{
    if(!isLeader){t2("조장만 베팅할 수 있습니다");return;}
    const amount=parseInt(betInputs[stockId])||0;
    const minB=shared.minBet||100000;
    if(!amount||amount<minB){t2(`최소 베팅액: ${fmt(minB)}`);return;}
    const maxB=Math.floor(cash*((shared.maxBetPct||50)/100));
    if(amount>maxB){t2(`최대 베팅액: ${fmt(maxB)}`);return;}
    if(amount>cash){t2("잔액 부족");return;}
    if(!shared.betDeadline||Date.now()>shared.betDeadline){t2("베팅 마감");return;}
    const nextRound=shared.phase==="ready"?1:(shared.round||0)+1;
    const baseO=shared.baseOdds||1.8;
    const existing=shared.betOdds?.[stockId];
    const upCount=(existing?.upCount||0)+(direction==="up"?1:0);
    const downCount=(existing?.downCount||0)+(direction==="down"?1:0);
    const total=upCount+downCount;
    let upOdds=baseO,downOdds=baseO;
    if(shared.dynamicOdds&&total>0){
      const upRatio=upCount/total;
      upOdds=Math.max(1.2,Math.min(3.0,+(baseO*(1+(0.5-upRatio))).toFixed(2)));
      downOdds=Math.max(1.2,Math.min(3.0,+(baseO*(1+(upRatio-0.5))).toFixed(2)));
    }
    const myOdds=direction==="up"?upOdds:downOdds;
    setShared(s=>{
      const tm=s.teams?.[teamId];
      if(!tm||tm.cash<amount) return s;
      return{
        ...s,
        bets:{
          ...(s.bets||{}),
          [nextRound]:{
            ...(s.bets?.[nextRound]||{}),
            [teamId]:{...(s.bets?.[nextRound]?.[teamId]||{}),[stockId]:{direction,amount,odds:myOdds,settled:false,ts:Date.now()}},
          },
        },
        betOdds:{...(s.betOdds||{}),[stockId]:{upCount,downCount,upOdds,downOdds}},
        teams:{...s.teams,[teamId]:{...tm,cash:tm.cash-amount}},
      };
    });
    setBetInputs(b=>({...b,[stockId]:""}));
    t2(`${direction==="up"?"▲ 상승":"▼ 하락"} ${fmt(amount)} 베팅 완료! (x${myOdds.toFixed(1)})`);
  };

  const cancelBet=(stockId)=>{
    const nextRound=shared.phase==="ready"?1:(shared.round||0)+1;
    const myBet=shared.bets?.[nextRound]?.[teamId]?.[stockId];
    if(!myBet) return;
    if(!shared.betDeadline||Date.now()>shared.betDeadline){t2("베팅 마감 후 취소 불가");return;}
    setShared(s=>{
      const bets={...s.bets};
      if(bets[nextRound]?.[teamId]?.[stockId]){
        const nb={...bets[nextRound][teamId]};
        delete nb[stockId];
        bets[nextRound]={...bets[nextRound],[teamId]:nb};
      }
      const tm=s.teams?.[teamId];
      if(!tm) return{...s,bets};
      return{...s,bets,teams:{...s.teams,[teamId]:{...tm,cash:tm.cash+myBet.amount}}};
    });
    t2("베팅 취소됨");
  };

  const buyShop=async(item)=>{
    if(!isLeader){t2("조장만 구매할 수 있습니다");return;}
    const latest=(shared.shopItems||[]).find(x=>x.id===item.id)||item;
    if(purchases.includes(latest.id)){t2("이미 구매한 항목");return;}
    const pointCost=latest.pointPrice||50;
    const myGroupName=shared.teamCredentials?.[teamName]?.groupName;
    if(!myGroupName){t2("조 정보 없음");return;}
    const groupSnap=await get(GROUP_REF(myGroupName));
    const groupData=groupSnap.val()||{diamonds:0};
    if((groupData.diamonds||0)<pointCost){t2("조 다이아 부족");return;}
    await updTeam(t=>({...t,purchases:[...(t.purchases||[]),latest.id]}));
    await fbSet(GROUP_REF(myGroupName),{...groupData,diamonds:(groupData.diamonds||0)-pointCost});
    t2(`${latest.name} 구매 완료! (-${pointCost}💎)`);
  };

  const sendChat = () => {
    const text = chatInput.trim();
    if (!text || !teamName) return;
    const msg = { id: uid(), teamName, text, ts: Date.now() };
    setShared(s => ({
      ...s,
      chatMessages: [...(Array.isArray(s.chatMessages) ? s.chatMessages : []), msg].slice(-200),
    }));
    setChatInput("");
  };


  const total=totalAsset(),diff=total-initCash,diffPct=((diff/initCash)*100).toFixed(2);
  const stockVal=total-cash;
  const W={wrap:{...WRAP,background:G.bg}};

  // 타임라인 현재 단계 — 모든 화면에서 공유
  const _tlSteps = shared.timelineSteps || INIT_SS.timelineSteps;
  const curStep = _tlSteps[shared.timelineIndex ?? -1];
  const stepRem = shared.timelineEndsAt
    ? Math.max(0, Math.round((shared.timelineEndsAt - Date.now()) / 1000))
    : null;
  const isBettingPhase =
    shared.currentPhaseDetail === "betting"
    && !!shared.betDeadline
    && shared.betDeadline > Date.now()
    && shared.betEnabled;

  // 모든 화면 우상단에 표시되는 플로팅 타이머
  const PhaseChip = curStep ? (
    <div style={{
      position:"fixed", top:"env(safe-area-inset-top, 10px)", right:12,
      zIndex:9999, display:"flex", flexDirection:"column", alignItems:"flex-end", gap:3, pointerEvents:"none",
    }}>
      <div style={{
        background:
          shared.phase==="round"?G.green:
          shared.currentPhaseDetail==="betting"?G.purple:
          shared.currentPhaseDetail==="result"?G.yellow:G.gray2,
        color:G.white, borderRadius:20, padding:"3px 10px",
        fontSize:11, fontWeight:700, boxShadow:"0 2px 8px rgba(0,0,0,0.18)",
      }}>
        {curStep.label}
      </div>
      {stepRem !== null && (
        <div style={{
          background:"rgba(0,0,0,0.72)", color:stepRem<=30?G.red:stepRem<=60?"#FFAA00":G.white,
          borderRadius:14, padding:"2px 10px", fontSize:13, fontWeight:800,
          fontFamily:"monospace", boxShadow:"0 2px 8px rgba(0,0,0,0.22)",
        }}>
          ⏱ {secToStr(stepRem)}
        </div>
      )}
    </div>
  ) : null;

  /* ── 로그인 ── */
  if(screen==="login") return(
    <div style={W.wrap}>
      <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",justifyContent:"center",padding:"0 24px",background:G.white,position:"relative"}}>
        {onBack&&!previewAs&&(
          <div onClick={onBack} style={{position:"absolute",top:24,left:24,display:"flex",alignItems:"center",gap:6,cursor:"pointer",padding:"6px 10px",borderRadius:10,background:G.bg}}>
            <span style={{fontSize:16}}>←</span>
            <span style={{fontSize:13,fontWeight:600,color:G.gray1}}>뒤로</span>
          </div>
        )}
        <div style={{marginBottom:36}}>
          <div style={{fontSize:30,fontWeight:800,color:G.black,marginBottom:8,letterSpacing:-1}}>경영학과 주식게임</div>
          <div style={{fontSize:15,color:G.gray1,lineHeight:1.7}}>팀코드와 이름을 입력해주세요</div>
        </div>
        <div style={{marginBottom:12}}>
          <div style={{fontSize:13,fontWeight:600,color:G.gray1,marginBottom:6}}>팀코드</div>
          <input value={loginCode} onChange={e=>{setLoginCode(e.target.value);setLoginErr("");}} placeholder="운영자에게 받은 팀코드"
            onKeyDown={e=>e.key==="Enter"&&doLogin()}
            style={{width:"100%",border:`1.5px solid ${loginErr?G.red:G.border}`,borderRadius:12,padding:"14px 16px",fontSize:15,fontFamily:"inherit",outline:"none",color:G.black,boxSizing:"border-box"}}/>
        </div>
        <div style={{marginBottom:16}}>
          <div style={{fontSize:13,fontWeight:600,color:G.gray1,marginBottom:6}}>이름</div>
          <input value={loginName} onChange={e=>{setLoginName(e.target.value);setLoginErr("");}} placeholder="본인 이름"
            onKeyDown={e=>e.key==="Enter"&&doLogin()}
            style={{width:"100%",border:`1.5px solid ${loginErr?G.red:G.border}`,borderRadius:12,padding:"14px 16px",fontSize:15,fontFamily:"inherit",outline:"none",color:G.black,boxSizing:"border-box"}}/>
        </div>
        {loginErr&&<div style={{fontSize:13,color:G.red,marginBottom:10,padding:"10px 12px",background:G.redLight,borderRadius:8}}>{loginErr}</div>}
        <Btn onClick={doLogin} style={{width:"100%",padding:"15px",fontSize:16,borderRadius:12}}>게임 입장</Btn>
        <div style={{textAlign:"center",marginTop:14,fontSize:12,color:G.gray2}}>팀코드는 운영자에게 문의하세요</div>
      </div>
      <Toast {...toast}/>
    </div>
  );

  /* ── 종료 ── */
  if(screen==="ended"){
    const myGroupName=shared.teamCredentials?.[teamName]?.groupName;
    const individualRank=Object.entries(shared.teamCredentials||{}).map(([name,v])=>{
      const tm=shared.teams?.[v.id];
      if(!tm) return null;
      const stockValue=Object.entries(tm.holdings||{}).reduce((acc,[sid,h])=>{
        if(sid==='_empty') return acc;
        const st=shared.stocks?.find(x=>x.id===sid);
        return acc+(st?st.prices[st.prices.length-1]*(h.qty||0):0);
      },0);
      const total=(tm.cash||0)+stockValue;
      return { id:v.id, name, groupName:v.groupName||"", total, diamonds:tm.diamonds||0 };
    }).filter(Boolean).sort((a,b)=>b.total-a.total);
    const groupRank=Array.from({length:16},(_,i)=>`${i+1}조`).map(group=>{
      const members=Object.entries(shared.teamCredentials||{})
        .filter(([,v])=>v.groupName===group);
      const total=members.reduce((sum,[,{id}])=>{
        const tm=shared.teams?.[id];
        if(!tm) return sum;
        const sv=Object.entries(tm.holdings||{}).reduce((acc,[sid,h])=>{
          if(sid==='_empty') return acc;
          const st=shared.stocks?.find(x=>x.id===sid);
          return acc+(st?st.prices[st.prices.length-1]*(h.qty||0):0);
        },0);
        return sum+(tm.cash||0)+sv;
      },0);
      const groupPoints=shared.groups?.[group]?.diamonds||0;
      return{group,total,memberCount:members.length,groupPoints};
    }).filter(g=>g.memberCount>0).sort((a,b)=>b.total-a.total);
    const myGroupRank=groupRank.findIndex(g=>g.group===myGroupName)+1;
    const myGroupData=groupRank.find(g=>g.group===myGroupName);
    const myGroupFd=(myGroupData?.total||0)-(initCash*(myGroupData?.memberCount||1));
    const myPersonalRank=individualRank.findIndex(p=>p.name===teamName)+1;
    const myPersonalData=individualRank.find(p=>p.name===teamName);
    const myPersonalDiff=(myPersonalData?.total||0)-initCash;
    return(
      <>
        <div style={W.wrap}>
          <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",background:G.white}}>
            <div style={{background:`linear-gradient(135deg,${G.blue},${G.purple})`,padding:"40px 24px 32px",textAlign:"center",position:"relative"}}>
              {onBack&&<button onClick={onBack} style={{position:"absolute",top:16,left:16,background:"rgba(255,255,255,0.18)",border:"none",borderRadius:10,padding:"7px 14px",color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>← 처음으로</button>}
              <div style={{fontSize:48,marginBottom:12}}>{(myPersonalDiff||myGroupFd)>=0?"🏆":"📉"}</div>
              <div style={{fontSize:22,fontWeight:800,color:G.white,marginBottom:4}}>게임 종료!</div>
              <div style={{fontSize:14,color:"rgba(255,255,255,0.8)",marginBottom:20}}>{teamName} 최종 결과</div>
              <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
                <div style={{background:"rgba(255,255,255,0.15)",borderRadius:16,padding:"16px 20px",display:"inline-block",minWidth:170}}>
                  <div style={{fontSize:12,color:"rgba(255,255,255,0.7)",marginBottom:4}}>팀 최종 자산</div>
                  <div style={{fontSize:28,fontWeight:800,color:G.white,marginBottom:4}}>{fmt(myGroupData?.total||0)}</div>
                  <div style={{fontSize:15,fontWeight:600,color:myGroupFd>=0?"#FFD700":"#FF8080"}}>
                    {myGroupFd>=0?"+":""}{fmt(myGroupFd)}
                  </div>
                </div>
                <div style={{background:"rgba(255,255,255,0.15)",borderRadius:16,padding:"16px 20px",display:"inline-block",minWidth:170}}>
                  <div style={{fontSize:12,color:"rgba(255,255,255,0.7)",marginBottom:4}}>개인 최종 자산</div>
                  <div style={{fontSize:28,fontWeight:800,color:G.white,marginBottom:4}}>{fmt(myPersonalData?.total||0)}</div>
                  <div style={{fontSize:15,fontWeight:600,color:myPersonalDiff>=0?"#FFD700":"#FF8080"}}>
                    {myPersonalDiff>=0?"+":""}{fmt(myPersonalDiff)}
                  </div>
                </div>
              </div>
              <div style={{marginTop:12,fontSize:13,color:"rgba(255,255,255,0.9)",fontWeight:600}}>
                {myGroupRank>0&&<span>{groupRank.length}개 팀 중 {myGroupRank}위 {myGroupRank===1?"🥇":myGroupRank===2?"🥈":myGroupRank===3?"🥉":""}</span>}
                {myGroupRank>0&&myPersonalRank>0&&<span style={{margin:"0 8px"}}>·</span>}
                {myPersonalRank>0&&<span>{individualRank.length}명 중 {myPersonalRank}위</span>}
                {(myGroupData?.groupPoints||0)>0&&<span style={{marginLeft:8}}>💎 {myGroupData.groupPoints}</span>}
              </div>
            </div>
            <div style={{padding:"16px"}}>
              <div style={{fontSize:13,fontWeight:700,color:G.black,marginBottom:8}}>팀 최종 순위</div>
              <div style={{background:G.white,borderRadius:14,border:`1px solid ${G.border}`,overflow:"hidden",marginBottom:12}}>
                {groupRank.map((g,i)=>{
                  const initTotal=initCash*g.memberCount;
                  const diff=g.total-initTotal;
                  return(
                    <div key={g.group} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",
                      borderBottom:i<groupRank.length-1?`1px solid ${G.border}`:"none",
                      background:g.group===myGroupName?G.blueLight:"transparent"}}>
                      <div style={{width:26,height:26,borderRadius:"50%",flexShrink:0,
                        background:i===0?"#FFD700":i===1?"#C0C0C0":i===2?"#CD7F32":G.gray4,
                        display:"flex",alignItems:"center",justifyContent:"center",
                        fontSize:12,fontWeight:700,color:i<3?G.white:G.gray1}}>{i+1}</div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:g.group===myGroupName?800:500,color:G.black}}>
                          {g.group}{g.group===myGroupName?" (우리 조)":""}
                        </div>
                        <div style={{fontSize:11,color:G.gray1}}>
                          {g.memberCount}명
                          {g.groupPoints>0&&<span style={{color:G.purple,marginLeft:4}}>💎 {g.groupPoints}</span>}
                        </div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:13,fontWeight:700,color:G.black}}>{fmt(g.total)}</div>
                        <div style={{fontSize:11,color:diff>=0?G.red:G.blue}}>{diff>=0?"+":""}{fmt(diff)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{fontSize:13,fontWeight:700,color:G.black,marginBottom:8}}>개별 최종 순위</div>
              <div style={{background:G.white,borderRadius:14,border:`1px solid ${G.border}`,overflow:"hidden",marginBottom:12}}>
                {individualRank.map((p,i)=>{
                  const diff=p.total-initCash;
                  return(
                    <div key={p.id} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",
                      borderBottom:i<individualRank.length-1?`1px solid ${G.border}`:"none",
                      background:p.name===teamName?G.blueLight:"transparent"}}>
                      <div style={{width:26,height:26,borderRadius:"50%",flexShrink:0,
                        background:i===0?"#FFD700":i===1?"#C0C0C0":i===2?"#CD7F32":G.gray4,
                        display:"flex",alignItems:"center",justifyContent:"center",
                        fontSize:12,fontWeight:700,color:i<3?G.white:G.gray1}}>{i+1}</div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:p.name===teamName?800:500,color:G.black}}>
                          {p.name}{p.name===teamName?" (나)":""}
                        </div>
                        <div style={{fontSize:11,color:G.gray1}}>
                          {p.groupName||"무소속"}
                          {p.diamonds>0&&<span style={{color:G.purple,marginLeft:4}}>💎 {p.diamonds}</span>}
                        </div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:13,fontWeight:700,color:G.black}}>{fmt(p.total)}</div>
                        <div style={{fontSize:11,color:diff>=0?G.red:G.blue}}>{diff>=0?"+":""}{fmt(diff)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {(shared.phase==="ready"||shared.phase==="round")&&(
                <Btn onClick={()=>setScreen("main")} style={{width:"100%",padding:"14px",fontSize:15,borderRadius:12}}>계속하기 →</Btn>
              )}
            </div>
          </div>
        </div>
        {PhaseChip}
      </>
    );
  }

  /* ── 상세 ── */
  if(screen==="detail"&&detail){
    const st=detail;
    const cur=isBlind?null:getLivePrice(st);
    // 대기 중이거나 블라인드면 이전 라운드 종가 표시
    const ri2 = Math.min(round - 1, st.prices.length - 1);
    const displayPrice = isBlind
      ? getRoundStartPrice(st, round)
      : shared.phase !== "round"
        ? getRoundStartPrice(st, round)
        : cur;
    const prev=getRoundStartPrice(st, round);
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
          <div onClick={()=>setScreen("main")}
            style={{display:"inline-flex",alignItems:"center",gap:6,
              background:G.bg,border:`1.5px solid ${G.border}`,
              borderRadius:10,padding:"9px 16px",cursor:"pointer",
              marginBottom:12,transition:"background .15s"}}
            onMouseDown={e=>e.currentTarget.style.background=G.border}
            onMouseUp={e=>e.currentTarget.style.background=G.bg}>
            <span style={{fontSize:18,lineHeight:1}}>←</span>
            <span style={{fontSize:14,fontWeight:600,color:G.black}}>뒤로가기</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:4}}>
            <div>
              <div style={{fontSize:13,color:G.gray1,marginBottom:2}}>{st.emoji} {st.code}</div>
              <div style={{fontSize:20,fontWeight:800,color:G.black,marginBottom:2}}>{st.name}</div>
              {isBlind ? (
                <div style={{fontSize:16,fontWeight:700,color:G.purple}}>🙈 블라인드 라운드</div>
              ) : (
                <div style={{display:"flex",alignItems:"baseline",gap:8}}>
                  <div style={{fontSize:26,fontWeight:800,color:isUp?G.red:p<0?G.blue:G.black}}>{fmtN(cur)}</div>
                  <div style={{fontSize:13,fontWeight:600,color:isUp?G.red:p<0?G.blue:G.gray1}}>{isUp?"▲ +":"▼ "}{p.toFixed(2)}%</div>
                </div>
              )}
            </div>
            {/* 오른쪽: 현재 단계 + 타이머 */}
            <div style={{textAlign:"right",flexShrink:0}}>
              <div style={{background:
                shared.phase==="round"?G.greenLight:
                shared.currentPhaseDetail==="betting"?G.purpleLight:
                shared.currentPhaseDetail==="result"?G.yellowLight:G.gray4,
                color:
                shared.phase==="round"?G.green:
                shared.currentPhaseDetail==="betting"?G.purple:
                shared.currentPhaseDetail==="result"?G.yellow:G.gray1,
                borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:600,marginBottom:4,display:"inline-block"}}>
                {curStep ? curStep.label : "대기중"}
              </div>
              {stepRem !== null && (
                <div style={{fontSize:18,fontWeight:800,
                  color:stepRem<=30?G.red:stepRem<=60?G.orange:G.black,
                  fontFamily:"monospace",display:"block"}}>
                  ⏱ {secToStr(stepRem)}
                </div>
              )}
            </div>
          </div>
          {st.listed===false&&(
            <div style={{fontSize:12,color:G.red,fontWeight:500,marginTop:2}}>⛔ 폐지된 종목</div>
          )}
          {shared.phase!=="round"&&st.listed!==false&&(
            <div style={{fontSize:12,color:G.red,fontWeight:500,marginTop:2}}>🔴 매매 시간이 아닙니다</div>
          )}
        </div>
        <div style={{paddingBottom:"env(safe-area-inset-bottom, 100px)",overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
          <div style={{background:G.white,padding:"14px 18px 8px",marginBottom:8}}>
            <div style={{fontSize:11,color:G.gray2,marginBottom:8,fontWeight:500}}>가격 추이</div>
            <LiveBigChart stock={st} round={round} maxRound={maxRound}
              roundStartedAt={shared.roundStartedAt} roundEndsAt={shared.roundEndsAt}
              activeEvent={shared.activeEvent} blind={isBlind}
              modifiedTargets={shared.modifiedTargets}
              priceHistory={shared.priceHistory}
              eventSnapshots={shared.eventSnapshots}
              phase={shared.phase}
              avgPrice={holdings[st.id]?.avgPrice || 0}/>
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
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div onClick={()=>setQty(q=>Math.max(1,q-1))}
                    style={{width:36,height:36,borderRadius:10,background:G.bg,display:"flex",alignItems:"center",
                      justifyContent:"center",cursor:"pointer",fontSize:20,userSelect:"none",fontWeight:700,
                      border:`1.5px solid ${G.border}`}}>−</div>
                  <input
                    type="number" value={qty} min={1} max={maxQty||1}
                    onFocus={e=>e.target.select()}
                    onChange={e=>{
                      const raw=e.target.value;
                      if(raw===""){setQty("");return;}
                      const v=parseInt(raw,10);
                      if(!isNaN(v))setQty(Math.max(1,Math.min(v,maxQty||1)));
                    }}
                    style={{width:64,textAlign:"center",border:`1.5px solid ${G.border}`,borderRadius:10,
                      padding:"8px 4px",fontSize:17,fontWeight:700,fontFamily:"monospace",
                      outline:"none",color:G.black,boxSizing:"border-box"}}/>
                  <div onClick={()=>setQty(q=>Math.min(q+1,maxQty||1))}
                    style={{width:36,height:36,borderRadius:10,background:G.bg,display:"flex",alignItems:"center",
                      justifyContent:"center",cursor:"pointer",fontSize:20,userSelect:"none",fontWeight:700,
                      border:`1.5px solid ${G.border}`}}>+</div>
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
                {orderSide==="buy"
                  ?<>잔액 {fmt(cash)} · <span style={{color:G.red,fontWeight:700}}>최대 {maxQty}주 구매 가능</span></>
                  :<>보유 {holding}주 · <span style={{color:G.blue,fontWeight:700}}>최대 {maxQty}주 판매 가능</span></>
                }
              </div>
              <Btn
                onClick={()=>{
                  const isActive = shared.phase === "round"
                    && shared.roundEndsAt
                    && Date.now() < shared.roundEndsAt;
                  if (!isActive) { t2("현재 매매 시간이 아닙니다"); return; }
                  setConfirm(true);
                }}
                color={
                  !(shared.phase === "round" && shared.roundEndsAt && Date.now() < shared.roundEndsAt)
                    ? G.gray3
                    : orderSide === "buy" ? G.red : G.blue
                }
                style={{width:"100%",padding:"14px",fontSize:15,borderRadius:12}}
              >
                {!(shared.phase === "round" && shared.roundEndsAt && Date.now() < shared.roundEndsAt)
                  ? "⏸ 매매 시간 아님"
                  : orderSide === "buy" ? "매수 주문" : "매도 주문"
                }
              </Btn>
            </div>
          )}
        </div>
        <BetResultPopup data={betResultPopup} onClose={()=>setBetResultPopup(null)}/>
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
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:1}}>
              <div style={{fontSize:12,color:G.gray1}}>{teamName}팀</div>
              {onBack&&!previewAs&&(
                <div onClick={onBack} style={{display:"flex",alignItems:"center",gap:3,cursor:"pointer",padding:"2px 8px",borderRadius:8,background:G.bg,border:`1px solid ${G.border}`}}>
                  <span style={{fontSize:12}}>←</span>
                  <span style={{fontSize:10,fontWeight:600,color:G.gray2}}>나가기</span>
                </div>
              )}
            </div>
            <div style={{fontSize:26,fontWeight:800,color:G.black,letterSpacing:-0.5}}>{fmt(total)}</div>
            <div style={{fontSize:13,fontWeight:600,color:diff>=0?G.red:G.blue,marginTop:1}}>
              {diff>=0?"▲ +":"▼ "}{fmt(Math.abs(diff))} ({diff>=0?"+":""}{diffPct}%)
            </div>
            {(()=>{
              const mgn=shared.teamCredentials?.[teamName]?.groupName;
              const gp=shared.groups?.[mgn]?.diamonds||0;
              return gp>0&&mgn?(
                <div style={{fontSize:12,color:G.purple,fontWeight:600,marginTop:2}}>💎 {gp} ({mgn})</div>
              ):null;
            })()}
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{background:
              shared.phase==="round"?G.greenLight:
              shared.currentPhaseDetail==="betting"?G.purpleLight:
              shared.currentPhaseDetail==="result"?G.yellowLight:G.gray4,
              color:
              shared.phase==="round"?G.green:
              shared.currentPhaseDetail==="betting"?G.purple:
              shared.currentPhaseDetail==="result"?G.yellow:G.gray1,
              borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:600,marginBottom:3,display:"inline-block"}}>
              {curStep ? curStep.label : "대기중"}
            </div>
            {stepRem !== null && (
              <div style={{fontSize:14,fontWeight:800,color:stepRem<=30?G.red:stepRem<=60?G.orange:G.black,fontFamily:"monospace"}}>
                ⏱ {secToStr(stepRem)}
              </div>
            )}
          </div>
        </div>
        <div style={{display:"flex",margin:"0 -18px"}}>
          {[["market","시장"],["portfolio","보유"],["shop","상점"],["rules","규칙"]].map(([key,label])=>(
            <div key={key} onClick={()=>setTab(key)} style={{flex:1,textAlign:"center",padding:"9px 0",fontSize:12,fontWeight:600,
              color:tab===key?G.blue:G.gray1,borderBottom:`2px solid ${tab===key?G.blue:"transparent"}`,cursor:"pointer",transition:"all .15s"}}>{label}</div>
          ))}
        </div>
      </div>

      <div style={{paddingBottom:"env(safe-area-inset-bottom, 24px)",overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
        {tab==="market"&&<>
          {/* 휴식 중 배너 */}
          {shared.phase==="break"&&(
            <div style={{background:G.yellowLight,padding:"12px 18px",borderBottom:`1px solid ${G.border}`}}>
              <div style={{fontSize:13,fontWeight:700,color:G.yellow}}>
                R{shared.round} 종료 — 휴식 중
                {shared.breakEndsAt&&breakRem!==null&&<span style={{fontFamily:"monospace",marginLeft:8}}>{secToStr(breakRem)}</span>}
              </div>
              {(shared.round||0)<(shared.maxRound||3)&&<div style={{fontSize:11,color:G.gray1,marginTop:2}}>다음: R{(shared.round||0)+1}</div>}
            </div>
          )}

          {/* 방향 예측 베팅 패널 */}
          {isBettingPhase&&(
            <div style={{background:G.white,margin:"0 0 8px",padding:"14px 18px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div>
                  <div style={{fontSize:14,fontWeight:800,color:G.black}}>
                    🎲 {shared.phase==="ready"?"1라운드 예측 베팅":`${(shared.round||0)+1}라운드 예측 베팅`}
                  </div>
                  <div style={{fontSize:12,color:G.gray1,marginTop:2}}>종목별 상승/하락을 예측하세요</div>
                </div>
                <div style={{background:betRem!==null&&betRem>0?G.redLight:G.gray4,borderRadius:20,padding:"4px 12px"}}>
                  <span style={{fontSize:13,fontWeight:700,
                    color:betRem!==null&&betRem>0?G.red:G.gray1,fontFamily:"monospace"}}>
                    {betRem!==null&&betRem>0?secToStr(betRem):"마감"}
                  </span>
                </div>
              </div>
              {(shared.stocks||[]).filter(st=>st.listed!==false).map(st=>{
                const nextR=shared.phase==="ready"?1:(shared.round||0)+1;
                const oddsInfo=shared.betOdds?.[st.id];
                const upOdds=+(oddsInfo?.upOdds??shared.baseOdds??1.8);
                const downOdds=+(oddsInfo?.downOdds??shared.baseOdds??1.8);
                const upCount=oddsInfo?.upCount??0;
                const downCount=oddsInfo?.downCount??0;
                const myBet=shared.bets?.[nextR]?.[teamId]?.[st.id];
                const canBet=betRem!==null&&betRem>0;
                const inputAmt=betInputs[st.id]||"";
                return(
                  <div key={st.id} style={{marginBottom:10,background:G.bg,borderRadius:12,padding:"12px 14px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                      <div style={{fontSize:13,fontWeight:700,color:G.black}}>{st.emoji} {st.name}</div>
                      {myBet&&(
                        <div style={{fontSize:11,fontWeight:600,
                          color:myBet.direction==="up"?G.red:G.blue,
                          background:myBet.direction==="up"?G.redLight:G.blueLight,
                          borderRadius:20,padding:"2px 10px"}}>
                          {myBet.direction==="up"?"▲ 상승":"▼ 하락"} {fmt(myBet.amount)} 베팅완료
                        </div>
                      )}
                    </div>
                    {!myBet&&canBet&&!isLeader&&(
                      <div style={{fontSize:12,color:G.gray2,padding:"8px 0"}}>베팅은 조장만 가능합니다</div>
                    )}
                    {!myBet&&canBet&&isLeader&&<>
                      <div style={{display:"flex",gap:4,marginBottom:8,fontSize:11,color:G.gray1}}>
                        <span style={{color:G.red}}>▲ {upCount}팀 (x{upOdds.toFixed(1)})</span>
                        <span style={{margin:"0 4px"}}>·</span>
                        <span style={{color:G.blue}}>▼ {downCount}팀 (x{downOdds.toFixed(1)})</span>
                      </div>
                      <div style={{display:"flex",gap:6,marginBottom:6}}>
                        <input type="number" value={inputAmt} placeholder="베팅 금액"
                          onChange={e=>setBetInputs(b=>({...b,[st.id]:e.target.value}))}
                          style={{flex:1,border:`1.5px solid ${G.border}`,borderRadius:8,
                            padding:"7px 10px",fontSize:12,fontFamily:"inherit",outline:"none",
                            background:G.white}}/>
                      </div>
                      <div style={{display:"flex",gap:4,marginBottom:8}}>
                        {[100000,300000,500000].map(v=>(
                          <div key={v} onClick={()=>setBetInputs(b=>({...b,[st.id]:String(v)}))}
                            style={{flex:1,background:G.white,border:`1px solid ${G.border}`,
                              borderRadius:6,padding:"4px 0",textAlign:"center",cursor:"pointer",
                              fontSize:11,color:G.gray1}}>
                            {v>=1000000?(v/1000000)+"백만":(v/10000)+"만"}
                          </div>
                        ))}
                        <div onClick={()=>setBetInputs(b=>({...b,[st.id]:String(Math.floor(cash*((shared.maxBetPct||50)/100)))}))}
                          style={{flex:1,background:G.white,border:`1px solid ${G.border}`,
                            borderRadius:6,padding:"4px 0",textAlign:"center",cursor:"pointer",
                            fontSize:11,color:G.gray1}}>
                          최대
                        </div>
                      </div>
                      <div style={{display:"flex",gap:6}}>
                        <div onClick={()=>placeBet(st.id,"up")}
                          style={{flex:1,background:G.red,color:G.white,borderRadius:9,
                            padding:"9px 0",textAlign:"center",cursor:"pointer",fontWeight:700,fontSize:13}}>
                          ▲ 상승
                        </div>
                        <div onClick={()=>placeBet(st.id,"down")}
                          style={{flex:1,background:G.blue,color:G.white,borderRadius:9,
                            padding:"9px 0",textAlign:"center",cursor:"pointer",fontWeight:700,fontSize:13}}>
                          ▼ 하락
                        </div>
                      </div>
                    </>}
                    {myBet&&canBet&&isLeader&&(
                      <div onClick={()=>cancelBet(st.id)}
                        style={{textAlign:"center",fontSize:12,color:G.red,cursor:"pointer",marginTop:4}}>
                        베팅 취소
                      </div>
                    )}
                    {myBet&&!canBet&&(
                      <div style={{fontSize:11,color:G.gray1,padding:"4px 0"}}>
                        {myBet.direction==="up"?"▲ 상승":"▼ 하락"} {fmt(myBet.amount)} 베팅 완료 — 결과 대기 중
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {shared.currentPhaseDetail==="result" && (
            <div style={{background:G.yellowLight,margin:"8px 14px",borderRadius:12,padding:"12px 14px",border:`1.5px solid ${G.yellow}`}}>
              <div style={{fontSize:13,fontWeight:700,color:G.yellow,marginBottom:6}}>📊 R{shared.round} 종가 확인</div>
              {(shared.stocks||[]).filter(st=>st.listed!==false).map(st=>{
                const closePrice=st.prices[Math.min((shared.round||1)-1,st.prices.length-1)];
                const prevPrice=getRoundStartPrice(st, shared.round || 1);
                const diff=closePrice&&prevPrice?((closePrice-prevPrice)/prevPrice*100).toFixed(2):null;
                return(
                  <div key={st.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 0",borderBottom:`1px solid ${G.border}`}}>
                    <div style={{fontSize:12,fontWeight:600,color:G.black}}>{st.emoji} {st.name}</div>
                    <div style={{textAlign:"right"}}>
                      <span style={{fontSize:13,fontWeight:700,color:G.black}}>{closePrice?fmtN(closePrice):"?"}</span>
                      {diff!==null&&<span style={{fontSize:11,fontWeight:600,marginLeft:6,color:parseFloat(diff)>0?G.red:parseFloat(diff)<0?G.blue:G.gray1}}>{parseFloat(diff)>0?"+":""}{diff}%</span>}
                    </div>
                  </div>
                );
              })}
              {shared.resultHint && (
                <div style={{marginTop:8,padding:"8px 10px",background:G.white,borderRadius:8,fontSize:12,color:G.gray1,lineHeight:1.5}}>
                  💡 {shared.resultHint}
                </div>
              )}
            </div>
          )}

          <div style={{padding:"10px 18px 5px",fontSize:12,color:G.gray1,fontWeight:500}}>
            종목 현황 {shared.phase==="round"?`· Round ${shared.round}`:""}
            {isBlind&&<span style={{color:G.purple,marginLeft:6}}>🙈 블라인드</span>}
          </div>
          {(shared.stocks||[]).filter(st=>st.listed!==false).map(st=>{
            const cur=isBlind?null:getLivePrice(st);
            const prev=getRoundStartPrice(st, round);
            const p=isBlind?0:pctOf(cur,prev),isUp=p>0;
            return(
              <div key={st.id} onClick={()=>{setDetailSafe(st);setOrderSide("buy");setQty(1);setLeverage(1);setScreen("detail");}}
                style={{background:G.white,display:"flex",alignItems:"center",padding:"13px 18px",borderBottom:`1px solid ${G.border}`,cursor:"pointer",gap:10}}>
                <div style={{width:40,height:40,borderRadius:11,background:G.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{st.emoji}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:700,color:G.black,marginBottom:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{st.name}</div>
                  <div style={{fontSize:11,color:G.gray2}}>{st.code}</div>
                </div>
                <LiveMiniChart stock={st} round={round} roundStartedAt={shared.roundStartedAt} roundEndsAt={shared.roundEndsAt} activeEvent={shared.activeEvent} modifiedTargets={shared.modifiedTargets} eventSnapshots={shared.eventSnapshots} phase={shared.phase} blind={isBlind}/>
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
              const cur=getCurrentPrice(st,round,shared.roundStartedAt,shared.roundEndsAt,shared.activeEvent,shared.modifiedTargets,shared.eventSnapshots,shared.phase);
              const ev2=cur*h.qty,pnl=ev2-h.avgPrice*h.qty;
              return(
                <div key={st.id} onClick={()=>{setDetailSafe(st);setOrderSide("sell");setQty(1);setLeverage(1);setScreen("detail");}}
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

        {tab==="rules"&&(
          <div style={{padding:"16px 18px"}}>
            <div style={{background:G.white,borderRadius:14,padding:"16px"}}>
              <div style={{fontSize:15,fontWeight:800,color:G.black,marginBottom:12}}>📋 게임 규칙</div>
              {shared.rules
                ?<div style={{fontSize:14,color:G.black,lineHeight:1.9,whiteSpace:"pre-wrap"}}>{shared.rules}</div>
                :<div style={{textAlign:"center",color:G.gray2,padding:"32px 0",fontSize:13}}>아직 등록된 규칙이 없습니다</div>
              }
            </div>
          </div>
        )}

        {tab==="shop"&&(()=>{
          const _mgn=shared.teamCredentials?.[teamName]?.groupName;
          const _gp=shared.groups?.[_mgn]?.diamonds||0;
          return(<>
          <div style={{padding:"10px 18px 5px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:12,color:G.gray1,fontWeight:500}}>다이아 상점</div>
            <div style={{fontSize:14,fontWeight:700,color:G.purple}}>💎 {_gp} {_mgn?`(${_mgn})`:""}</div>
          </div>
          <div style={{padding:"0 14px 8px"}}>
            <div style={{background:G.purpleLight,borderRadius:11,padding:"11px 13px",fontSize:13,color:G.purple,fontWeight:500,lineHeight:1.5}}>
              💎 다이아로만 구매 가능한 특별 정보입니다
            </div>
          </div>
          {(shared.shopItems||[]).map(item=>{
            const boughtByMe=purchases.includes(item.id);
            const boughtByLeader=leaderPurchases.includes(item.id);
            const hintVisible=boughtByMe||boughtByLeader;
            const pointCost=item.pointPrice||50;
            const canAfford=_gp>=pointCost;
            return(
              <div key={item.id} style={{background:G.white,marginBottom:1,padding:"15px 18px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10}}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                      <span style={{fontSize:19}}>{item.emoji}</span>
                      <span style={{fontSize:14,fontWeight:700,color:G.black}}>{item.name}</span>
                      {hintVisible&&<span style={{fontSize:11,background:G.greenLight,color:G.green,borderRadius:20,padding:"2px 8px",fontWeight:600}}>{boughtByLeader&&!boughtByMe?"조장구매":"구매완료"}</span>}
                    </div>
                    <div style={{fontSize:12,color:G.gray1,marginBottom:6,lineHeight:1.5}}>{item.desc}</div>
                    <div style={{fontSize:14,fontWeight:700,color:G.purple}}>💎 {pointCost}</div>
                  </div>
                  {isLeader&&(
                    <button onClick={()=>buyShop(item)} disabled={boughtByMe||!canAfford}
                      style={{background:boughtByMe?G.greenLight:!canAfford?G.bg:G.purple,
                        color:boughtByMe?G.green:!canAfford?G.gray2:G.white,
                        border:"none",borderRadius:9,padding:"9px 14px",fontSize:12,fontWeight:700,
                        cursor:boughtByMe||!canAfford?"not-allowed":"pointer",fontFamily:"inherit",flexShrink:0}}>
                      {boughtByMe?"✓":!canAfford?"💎부족":"구매"}
                    </button>
                  )}
                </div>
                {hintVisible&&(
                  <div style={{marginTop:10,padding:"12px 13px",background:"linear-gradient(135deg,#F0EEFF,#EBF3FE)",borderRadius:11,border:`1.5px solid ${G.purple}22`}}>
                    <div style={{fontSize:11,fontWeight:700,color:G.purple,marginBottom:5}}>🔓 공개된 힌트</div>
                    <div style={{fontSize:13,color:G.black,lineHeight:1.7,whiteSpace:"pre-wrap"}}>{item.hint}</div>
                  </div>
                )}
              </div>
            );
          })}
        </>);
        })()}
      </div>
      {/* ── 채팅 플로팅 버튼 ── */}
      {screen === "main" && (
        <>
          {chatOpen && (
            <div style={{
              position: "fixed", bottom: 80, right: 16,
              width: 300, height: 420,
              background: G.white,
              borderRadius: 18,
              boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
              display: "flex", flexDirection: "column",
              zIndex: 200,
              overflow: "hidden",
              border: `1px solid ${G.border}`,
              maxWidth: "calc(100vw - 32px)",
            }}>
              <div style={{
                background: G.blue, color: G.white,
                padding: "12px 16px",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                flexShrink: 0,
              }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>💬 팀 채팅</div>
                <div onClick={() => setChatOpen(false)}
                  style={{ cursor: "pointer", fontSize: 18, lineHeight: 1, opacity: 0.8 }}>×</div>
              </div>
              <div style={{
                flex: 1, overflowY: "auto", padding: "10px 12px",
                display: "flex", flexDirection: "column", gap: 6,
              }}>
                {(shared.chatMessages || []).length === 0 && (
                  <div style={{ textAlign: "center", color: G.gray2, fontSize: 12, marginTop: 40 }}>
                    아직 메시지가 없어요<br/>먼저 인사해보세요 👋
                  </div>
                )}
                {(shared.chatMessages || []).map(msg => {
                  const isMine = msg.teamName === teamName;

                  if (msg.type === "system") {
                    return (
                      <div key={msg.id} style={{ textAlign: "center" }}>
                        <div style={{ display: "inline-block", background: G.greenLight, color: G.green,
                          borderRadius: 20, padding: "5px 12px", fontSize: 11, fontWeight: 600, lineHeight: 1.5 }}>
                          {msg.text}
                        </div>
                      </div>
                    );
                  }

                  if (msg.type === "trade") return null;

                  return (
                    <div key={msg.id} style={{ display: "flex", flexDirection: "column", alignItems: isMine ? "flex-end" : "flex-start" }}>
                      {!isMine && (
                        <div style={{ fontSize: 10, color: G.gray2, marginBottom: 2, marginLeft: 4 }}>{msg.teamName}</div>
                      )}
                      <div style={{ maxWidth: "80%", background: isMine ? G.blue : G.bg, color: isMine ? G.white : G.black,
                        borderRadius: isMine ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                        padding: "8px 12px", fontSize: 13, lineHeight: 1.5, wordBreak: "break-all" }}>
                        {msg.text}
                      </div>
                      <div style={{ fontSize: 9, color: G.gray2, marginTop: 2,
                        marginLeft: isMine ? 0 : 4, marginRight: isMine ? 4 : 0 }}>
                        {new Date(msg.ts).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  );
                })}
                <div ref={chatBottomRef} />
              </div>
              <div style={{
                padding: "10px 12px",
                borderTop: `1px solid ${G.border}`,
                display: "flex", gap: 8, flexShrink: 0,
                background: G.white,
              }}>
                <input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                  placeholder="메시지 입력..."
                  maxLength={100}
                  style={{
                    flex: 1, border: `1.5px solid ${G.border}`, borderRadius: 10,
                    padding: "8px 12px", fontSize: 13, fontFamily: "inherit",
                    outline: "none", color: G.black,
                  }}
                />
                <div onClick={sendChat}
                  style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: chatInput.trim() ? G.blue : G.gray3,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: chatInput.trim() ? "pointer" : "default",
                    fontSize: 16, flexShrink: 0,
                    transition: "background .15s",
                  }}>
                  ➤
                </div>
              </div>
            </div>
          )}
          <div
            onClick={() => { setChatOpen(o => !o); setUnreadCount(0); lastReadTs.current = Date.now(); }}
            style={{
              position: "fixed", bottom: 24, right: 16,
              width: 52, height: 52,
              borderRadius: "50%",
              background: chatOpen ? G.gray1 : G.blue,
              boxShadow: "0 4px 16px rgba(49,130,246,0.35)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", zIndex: 201,
              transition: "background .2s, transform .15s",
              fontSize: 22,
            }}
            onMouseDown={e => e.currentTarget.style.transform = "scale(0.9)"}
            onMouseUp={e => e.currentTarget.style.transform = "scale(1)"}
          >
            {chatOpen ? "×" : "💬"}
            {!chatOpen && unreadCount > 0 && (
              <div style={{
                position: "absolute", top: 2, right: 2,
                width: 18, height: 18, borderRadius: "50%",
                background: G.red, color: G.white,
                fontSize: 10, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center",
                border: "2px solid white",
              }}>
                {unreadCount > 9 ? "9+" : unreadCount}
              </div>
            )}
          </div>
        </>
      )}
      <BetResultPopup data={betResultPopup} onClose={()=>setBetResultPopup(null)}/>
      <Toast {...toast}/>
    </div>
  );
}

/* ══════════════════════════════════════════
   관리자 로그인
══════════════════════════════════════════ */
function AdminLogin({onSuccess,onBack=null}){
  const [pw,setPw]=useState(""),[ err,setErr]=useState(false);
  const check=()=>{if(pw===ADMIN_PW)onSuccess();else setErr(true);};
  return(
    <div style={{...WRAP,display:"flex",flexDirection:"column",justifyContent:"center",padding:"0 24px",position:"relative"}}>
      {onBack&&(
        <div onClick={onBack} style={{position:"absolute",top:24,left:24,display:"flex",alignItems:"center",gap:6,cursor:"pointer",padding:"6px 10px",borderRadius:10,background:G.bg}}>
          <span style={{fontSize:16}}>←</span>
          <span style={{fontSize:13,fontWeight:600,color:G.gray1}}>뒤로</span>
        </div>
      )}
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
const ADMIN_SESSION_TTL = 15 * 60 * 1000; // 15분
const ADMIN_SESSION_KEY = 'sg_admin_session';

export default function App(){
  const [mode,setMode]=useState(()=>{
    try {
      const s=localStorage.getItem(ADMIN_SESSION_KEY);
      if(s){const {ts}=JSON.parse(s);if(Date.now()-ts<ADMIN_SESSION_TTL) return "admin";}
    } catch(e){}
    return "select";
  });
  const [auth,setAuth]=useState(()=>{
    try {
      const s=localStorage.getItem(ADMIN_SESSION_KEY);
      if(s){const {ts}=JSON.parse(s);if(Date.now()-ts<ADMIN_SESSION_TTL) return true;}
    } catch(e){}
    return false;
  });
  const shared=useShared();
  const [showLoginModal,setShowLoginModal]=useState(false);
  const [modalName,setModalName]=useState("");
  const [modalCode,setModalCode]=useState("");
  const [modalErr,setModalErr]=useState("");

  const closeModal=()=>{setShowLoginModal(false);setModalName("");setModalCode("");setModalErr("");};
  const doModalLogin=()=>{
    const name=modalName.trim(),code=modalCode.trim();
    if(!name||!code){setModalErr("이름과 팀코드를 입력해주세요");return;}
    const groupEntry=Object.entries(shared.groups||{}).find(([,g])=>g.code===code);
    if(!groupEntry){setModalErr("올바르지 않은 팀코드입니다");return;}
    const [groupName]=groupEntry;
    const cred=shared.teamCredentials?.[name];
    if(!cred||cred.groupName!==groupName){setModalErr("해당 조에 등록되지 않은 이름입니다");return;}
    try{localStorage.setItem('sg_session',JSON.stringify({id:cred.id,name,ts:Date.now()}));}catch(e){}
    closeModal();
    setMode("user");
  };

  useEffect(()=>{
    if(mode==="admin"&&!auth){
      try{const s=localStorage.getItem(ADMIN_SESSION_KEY);if(s){const{ts}=JSON.parse(s);if(Date.now()-ts<ADMIN_SESSION_TTL)setAuth(true);}}catch(e){}
    }
  },[mode]);
  const handleAdminLogin=()=>{
    try{localStorage.setItem(ADMIN_SESSION_KEY,JSON.stringify({ts:Date.now()}));}catch(e){}
    setAuth(true);
  };
  const handleAdminBack=()=>{
    setMode("select");setAuth(false);
  };

  if(mode==="admin"){if(!auth)return <AdminLogin onSuccess={()=>{handleAdminLogin();setMode("admin");}} onBack={()=>setMode("select")}/>;return <AdminApp onBack={handleAdminBack}/>;};
  if(mode==="user") return <UserApp onBack={()=>setMode("select")}/>;
  return(
    <div style={{...WRAP,background:"#000",display:"flex",flexDirection:"column",
      position:"relative",overflow:"hidden"}}>
      {/* 배경 이미지 (200% 크기, 비율 유지) */}
      <div style={{position:"absolute",top:0,left:0,right:0,bottom:0,
        backgroundImage:`url(${bgImage})`,backgroundSize:"140%",backgroundPosition:"center top",
        opacity:0.8}}/>
      {/* 아래로 검정 페이드 오버레이 */}
      <div style={{position:"absolute",top:"40%",left:0,right:0,bottom:0,
        background:"linear-gradient(to bottom,transparent 0%,#000 55%)"}}/>
      {/* 로고 + 제목: 화면 중앙 */}
      <div style={{position:"relative",zIndex:1,display:"flex",flexDirection:"column",
        alignItems:"center",width:"100%",padding:"0 32px",flex:1,justifyContent:"center"}}>
        <img src={logoImage} alt="경영학과 로고"
          style={{width:"200px",marginBottom:20,filter:"drop-shadow(0 4px 16px rgba(0,0,0,0.6))"}}/>
        <div style={{fontSize:26,fontWeight:900,color:"#fff",letterSpacing:-0.5,
          textShadow:"0 2px 12px rgba(0,0,0,0.8)"}}>경영학과 주식게임</div>
      </div>
      {/* 버튼: 하단 고정 */}
      <div style={{position:"relative",zIndex:1,width:"100%",padding:"0 32px 48px"}}>
        <button onClick={()=>setShowLoginModal(true)}
          style={{background:"#fff",color:"#000",border:"none",
            borderRadius:14,padding:"17px 0",fontSize:17,fontWeight:700,cursor:"pointer",
            fontFamily:"inherit",textAlign:"center",width:"100%",
            boxShadow:"0 8px 32px rgba(0,0,0,0.4)",transition:"transform .15s"}}
          onMouseDown={e=>e.currentTarget.style.transform="scale(0.97)"}
          onMouseUp={e=>e.currentTarget.style.transform="scale(1)"}
          onTouchStart={e=>e.currentTarget.style.transform="scale(0.97)"}
          onTouchEnd={e=>e.currentTarget.style.transform="scale(1)"}>
          게임 시작하기
        </button>
        <div style={{textAlign:"center",marginTop:14}}>
          <button onClick={()=>setMode("admin")}
            style={{background:"none",color:"rgba(255,255,255,0.35)",border:"none",
              fontSize:12,fontWeight:400,cursor:"pointer",fontFamily:"inherit",
              textDecoration:"underline",padding:"4px 8px"}}>
            운영자 입장
          </button>
        </div>
      </div>
      {/* 로그인 모달 */}
      {showLoginModal&&(
        <div style={{position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,0.55)",
          display:"flex",alignItems:"flex-end",backdropFilter:"blur(3px)"}}
          onClick={closeModal}>
          <div style={{background:"#fff",borderRadius:"24px 24px 0 0",
            padding:"12px 24px 48px",width:"100%",maxWidth:"430px",margin:"0 auto"}}
            onClick={e=>e.stopPropagation()}>
            {/* 상단 바 + X */}
            <div style={{display:"flex",justifyContent:"flex-end",paddingTop:8,marginBottom:16}}>
              <button onClick={closeModal}
                style={{background:"none",border:"none",cursor:"pointer",
                  fontSize:20,color:"#aaa",lineHeight:1,padding:"4px 6px"}}>✕</button>
            </div>
            {/* 팀코드 */}
            <div style={{marginBottom:12}}>
              <input value={modalCode} onChange={e=>{setModalCode(e.target.value);setModalErr("");}}
                placeholder="팀코드" onKeyDown={e=>e.key==="Enter"&&doModalLogin()}
                style={{width:"100%",border:`1.5px solid ${modalErr?"#e53935":"#e0e0e0"}`,
                  borderRadius:12,padding:"14px 16px",fontSize:15,fontFamily:"inherit",
                  outline:"none",color:"#111",boxSizing:"border-box"}}/>
            </div>
            {/* 이름 */}
            <div style={{marginBottom:16}}>
              <input value={modalName} onChange={e=>{setModalName(e.target.value);setModalErr("");}}
                placeholder="이름" onKeyDown={e=>e.key==="Enter"&&doModalLogin()}
                style={{width:"100%",border:`1.5px solid ${modalErr?"#e53935":"#e0e0e0"}`,
                  borderRadius:12,padding:"14px 16px",fontSize:15,fontFamily:"inherit",
                  outline:"none",color:"#111",boxSizing:"border-box"}}/>
            </div>
            {modalErr&&<div style={{fontSize:13,color:"#e53935",marginBottom:12,
              padding:"10px 12px",background:"#ffebee",borderRadius:8}}>{modalErr}</div>}
            {/* 게임 입장 버튼 */}
            <button onClick={doModalLogin}
              style={{width:"100%",background:"#111",color:"#fff",border:"none",
                borderRadius:12,padding:"16px",fontSize:16,fontWeight:700,
                cursor:"pointer",fontFamily:"inherit"}}>
              게임 입장
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
