import React, {useState, useEffect, useRef, useMemo} from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Alert, StatusBar, PanResponder, Linking, PermissionsAndroid, Platform, Dimensions,
} from 'react-native';
import {SafeAreaProvider, useSafeAreaInsets} from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Geolocation from 'react-native-geolocation-service';
import {accelerometer, setUpdateIntervalForType, SensorTypes} from 'react-native-sensors';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Svg, {Path, Circle, Polyline, Rect, Text as SvgText} from 'react-native-svg';
import Tts from 'react-native-tts';

const API = 'https://solelife-backend.onrender.com';
const ACCENT = '#E8632A';
const BG = '#000000';
const CARD = '#161616';
const SURFACE = '#2C2C2E';
const SEP = 'rgba(255,255,255,0.08)';
const T1 = '#FFFFFF';
const T2 = 'rgba(255,255,255,0.6)';
const T3 = 'rgba(255,255,255,0.3)';
const WARN = '#FF9F0A';
const DANGER = '#FF453A';
const FH = 'BebasNeue-Regular';
const FB = 'Barlow-Regular';
const FBM = 'Barlow-Medium';
const FP = 'PretendardVariable';

function calcDist(lat1:number,lon1:number,lat2:number,lon2:number):number{
  const R=6371,dL=(lat2-lat1)*Math.PI/180,dl=(lon2-lon1)*Math.PI/180;
  const a=Math.sin(dL/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dl/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

class KalmanFilter{
  private v=-1;private lat=0;private lon=0;private ts=0;private readonly Q=3;
  process(lat:number,lon:number,acc:number,ts:number):{lat:number,lon:number}{
    if(this.v<0){this.lat=lat;this.lon=lon;this.v=acc*acc;this.ts=ts;return{lat,lon};}
    const dt=Math.max((ts-this.ts)/1000,0);this.ts=ts;this.v+=dt*this.Q*this.Q;
    const K=this.v/(this.v+acc*acc);
    this.lat+=K*(lat-this.lat);this.lon+=K*(lon-this.lon);this.v=(1-K)*this.v;
    return{lat:this.lat,lon:this.lon};
  }
  reset(){this.v=-1;}
}

function fmtTime(s:number):string{
  const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;
  if(h>0)return`${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  return`${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}
function fmtPace(km:number,s:number):string{if(km<0.01)return'--';const p=s/km;return`${Math.floor(p/60)}'${String(Math.round(p%60)).padStart(2,'0')}"`;}
function today():string{return new Date().toISOString().split('T')[0];}

function ShoeIcon({color,size=24}:{color:string;size?:number}){
  return(
    <Svg width={size} height={size} viewBox="0 0 100 80" fill="none">
      {/* 아웃솔 (두꺼운 밑창) */}
      <Path d="M8 62 Q8 72 20 74 Q45 78 70 76 Q84 74 90 68 Q96 62 92 56"
        stroke={color} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round"/>
      {/* 미드솔 */}
      <Path d="M8 62 Q6 54 10 50"
        stroke={color} strokeWidth={6} strokeLinecap="round"/>
      <Path d="M92 56 L90 48 Q90 40 82 38 Q74 36 70 42"
        stroke={color} strokeWidth={6} strokeLinecap="round"/>
      {/* 어퍼 (신발 윗면) */}
      <Path d="M10 50 Q14 36 26 30 Q38 24 50 22 Q62 20 70 16 Q78 12 76 5 Q74 -1 68 4"
        stroke={color} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round"/>
      {/* 혀 (tongue) */}
      <Path d="M12 48 Q18 36 24 34"
        stroke={color} strokeWidth={5} strokeLinecap="round"/>
      {/* 힐 칼라 */}
      <Path d="M70 42 Q66 34 70 28 Q74 22 80 26 Q86 30 90 40"
        stroke={color} strokeWidth={5} strokeLinecap="round"/>
      {/* 끈 */}
      <Path d="M30 30 L32 44 M42 26 L44 40 M54 23 L55 37"
        stroke={color} strokeWidth={3.5} strokeLinecap="round" opacity={0.6}/>
      {/* 힐 로고 점 */}
      <Circle cx="14" cy="42" r="2.5" fill={color} opacity={0.5}/>
      <Circle cx="14" cy="34" r="2.5" fill={color} opacity={0.5}/>
    </Svg>
  );
}
function HistoryIcon({color,size=24}:{color:string;size?:number}){
  return(
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth={1.5}/>
      <Polyline points="12 7 12 12 15 15" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}
function StatsIcon({color,size=24}:{color:string;size?:number}){
  return(
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="12" width="4" height="9" rx="1" stroke={color} strokeWidth={1.5}/>
      <Rect x="10" y="7" width="4" height="14" rx="1" stroke={color} strokeWidth={1.5}/>
      <Rect x="17" y="3" width="4" height="18" rx="1" stroke={color} strokeWidth={1.5}/>
    </Svg>
  );
}

export default function App(){
  return(
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={BG}/>
      <Main/>
    </SafeAreaProvider>
  );
}

function Main(){
  const [tab,setTab]=useState('shoes');
  const [userId,setUserId]=useState<string|null>(null);
  const [shoes,setShoes]=useState<any[]>([]);
  const [runs,setRuns]=useState<any[]>([]);
  const [showAdd,setShowAdd]=useState(false);
  const [setupRun,setSetupRun]=useState<{id:string;name:string}|null>(null);
  const [activeRun,setActiveRun]=useState<{id:string;name:string;goalKm:number}|null>(null);
  const insets=useSafeAreaInsets();

  useEffect(()=>{initUser();},[]);

  async function initUser(){
    let did=await AsyncStorage.getItem('device_id');
    if(!did){did='sl_'+Date.now()+'_'+Math.random().toString(36).substr(2,9);await AsyncStorage.setItem('device_id',did);}
    try{
      const r=await fetch(API+'/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({device_id:did})});
      const d=await r.json();setUserId(d.user_id);
      const[sr,rr]=await Promise.all([fetch(API+'/api/shoes?user_id='+d.user_id),fetch(API+'/api/runs?user_id='+d.user_id)]);
      const sd=await sr.json();const rd=await rr.json();
      const safeShoes=Array.isArray(sd)?sd:[];
      const safeRuns=Array.isArray(rd)?rd:[];
      // 서버가 route를 안 돌려줄 경우 로컬 캐시에서 합치기
      const runsWithRoute=await Promise.all(safeRuns.map(async(run:any)=>{
        let merged={...run};
        if(!merged.route&&merged.id){
          const local=await AsyncStorage.getItem('route_'+merged.id);
          if(local) merged={...merged,route:local};
        }
        if(!merged.run_time&&merged.id){
          const localTime=await AsyncStorage.getItem('time_'+merged.id);
          if(localTime) merged={...merged,run_time:localTime};
        }
        return merged;
      }));
      setShoes(safeShoes);setRuns(runsWithRoute);
      checkShoeAlerts(safeShoes,safeRuns);
    }catch(e){console.log('offline');}
  }

  async function addShoe(name:string,maxKm:number,startKm:number,date:string){
    try{
      const r=await fetch(API+'/api/shoes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:userId,name,max_km:maxKm,start_km:startKm,purchase_date:date})});
      const newShoe=await r.json();
      setShoes(prev=>[newShoe,...prev]);
    }catch(e){Alert.alert('오류','저장 실패');}
  }

  async function updateShoeName(id:string,name:string){
    try{
      await fetch(API+'/api/shoes/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:userId,name})});
      setShoes(prev=>prev.map(s=>s.id===id?{...s,name}:s));
    }catch(e){Alert.alert('오류','수정 실패');}
  }

  async function deleteShoe(id:string){
    try{
      await fetch(API+'/api/shoes/'+id,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:userId})});
      setShoes(prev=>prev.filter(s=>s.id!==id));
      setRuns(prev=>prev.filter(r=>r.shoe_id!==id));
    }catch(e){Alert.alert('오류','삭제 실패');}
  }

  async function addRun(shoeId:string,km:number,date:string,memo:string,source:string,duration?:number,cadence?:number,route?:string,location?:string){
    try{
      const r=await fetch(API+'/api/runs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:userId,shoe_id:shoeId,km,run_date:date,memo,source,duration:duration||0,cadence:cadence||0,route:route||'',location:location||''})});
      const nr=await r.json();
      const now=new Date();
      const hh=String(now.getHours()).padStart(2,'0');
      const mm=String(now.getMinutes()).padStart(2,'0');
      const timeStr=`${hh}:${mm}`;
      const runWithRoute={...nr,shoe_id:shoeId,route:route||nr.route||'',run_time:timeStr};
      setRuns(prev=>[runWithRoute,...prev]);
      // 로컬에도 route/time 저장 (서버가 안 돌려줄 경우 대비)
      if(nr.id){
        if(route) await AsyncStorage.setItem('route_'+nr.id, route);
        await AsyncStorage.setItem('time_'+nr.id, timeStr);
      }
    }catch(e){Alert.alert('오류','저장 실패');}
  }

  async function checkShoeAlerts(shoeList:any[],runList:any[]){
    try{
      if(!Array.isArray(shoeList)||!Array.isArray(runList)) return;
      const lastAlert=await AsyncStorage.getItem('shoe_alert_date');
      if(lastAlert===today()) return;
      const critical=shoeList.filter((s:any)=>{
        const used=runList.filter((r:any)=>r.shoe_id===s.id).reduce((a:number,r:any)=>a+parseFloat(r.km||0),0)+(s.start_km||0);
        return Math.max(0,(s.max_km||600)-used)<=100;
      });
      if(critical.length>0){
        await AsyncStorage.setItem('shoe_alert_date',today());
        Alert.alert('신발 교체 알림',critical.map((s:any)=>s.name).join(', ')+'\n\n잔여 수명이 100km 이하입니다.\n새 신발을 준비하세요!',[{text:'확인'}]);
      }
    }catch(e){console.log('checkShoeAlerts error',e);}
  }

  function shoeStats(s:any){
    const used=runs.filter(r=>r.shoe_id===s.id).reduce((a:number,r:any)=>a+parseFloat(r.km),0)+(s.start_km||0);
    const left=Math.max(0,(s.max_km||600)-used);
    return{used,left,pct:Math.max(0,Math.min(100,(left/(s.max_km||600))*100))};
  }

  const TABS=[
    {key:'shoes',label:'신발',ion:null,Icon:ShoeIcon},
    {key:'log',  label:'기록',ion:'time-outline',Icon:null},
    {key:'stats',label:'통계',ion:'bar-chart-outline',Icon:null},
  ];

  return(
    <View style={{flex:1,backgroundColor:BG}}>
      <View style={[a.header,{paddingTop:insets.top+8}]}>
        <Text style={a.logo}><Text style={{color:T1}}>SOLE</Text><Text style={{color:ACCENT}}>MATE</Text></Text>
      </View>

      <View style={{flex:1}}>
        {tab==='shoes'&&<ShoesTab shoes={shoes} runs={runs} shoeStats={shoeStats} deleteShoe={deleteShoe} updateShoeName={updateShoeName} onStartRun={setSetupRun} onAddShoe={()=>setShowAdd(true)}/>}
        {tab==='log'  &&<LogTab   shoes={shoes} runs={runs}/>}
        {tab==='stats'&&shoes!=null&&runs!=null&&shoeStats!=null&&<StatsTab shoes={shoes} runs={runs} shoeStats={shoeStats}/>}
      </View>

      <View style={[a.navBar,{paddingBottom:insets.bottom+2}]}>
        {TABS.map(t=>{
          const active=tab===t.key;
          return(
            <TouchableOpacity key={t.key} style={a.navBtn} onPress={()=>setTab(t.key)} activeOpacity={0.7}>
              <View style={[{alignItems:'center',justifyContent:'center',paddingHorizontal:16,paddingVertical:6,borderRadius:12,gap:3},active&&{backgroundColor:ACCENT+'18'}]}>
                {t.Icon
                  ? <t.Icon size={active?24:22} color={active?ACCENT:T3}/>
                  : <Ionicons name={t.ion as any} size={active?23:21} color={active?ACCENT:T3}/>
                }
                <Text style={[a.navLabel,active&&{color:ACCENT,fontWeight:'700'}]}>{t.label}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {showAdd&&(
        <AddShoeModal
          onAdd={(n,m,sk,d)=>{addShoe(n,m,sk,d);setShowAdd(false);}}
          onClose={()=>setShowAdd(false)}
        />
      )}

      {setupRun&&(
        <RunSetupModal
          shoe={setupRun}
          onStart={(goalKm)=>{setActiveRun({...setupRun,goalKm});setSetupRun(null);}}
          onClose={()=>setSetupRun(null)}
        />
      )}

      {activeRun&&(
        <RunScreen
          shoe={activeRun}
          insets={insets}
          goalKm={activeRun.goalKm}
          onSave={async(km,dur,cad,memo,route,location)=>{
            await addRun(activeRun.id,km,today(),memo||'','gps',dur,cad,route,location);
            setActiveRun(null);
          }}
          onDiscard={()=>setActiveRun(null)}
        />
      )}
    </View>
  );
}

// ─── Shoes Tab ────────────────────────────────────────────────
function ShoesTab({shoes,runs,shoeStats,deleteShoe,updateShoeName,onStartRun,onAddShoe}:any){
  const [editingId,setEditingId]=useState<string|null>(null);
  const [editName,setEditName]=useState('');
  if(!shoes.length) return(
    <View style={a.empty}>
      <ShoeIcon size={64} color={T3}/>
      <Text style={a.emptyTitle}>러닝화를 추가해보세요</Text>
      <Text style={a.emptyText}>러닝화를 등록하고{'\n'}달린 거리를 추적해보세요</Text>
      <TouchableOpacity style={a.emptyAddBtn} onPress={onAddShoe}>
        <Text style={a.emptyAddBtnText}>러닝화 등록하기</Text>
      </TouchableOpacity>
    </View>
  );

  return(
    <ScrollView contentContainerStyle={{padding:16,paddingBottom:32}}>
      {shoes.map((s:any)=>{
        const{used,left,pct}=shoeStats(s);
        const p=Math.round(pct);
        const bc=p>40?ACCENT:p>15?WARN:DANGER;
        const bl=p>40?'양호':p>15?'주의':'교체 필요';
        return(
          <View key={s.id} style={{backgroundColor:CARD,borderRadius:18,marginBottom:14,overflow:'hidden',borderWidth:1,borderColor:'rgba(255,255,255,0.06)'}}>
            {/* 왼쪽 컬러 액센트 바 */}
            <View style={{position:'absolute',left:0,top:0,bottom:0,width:3,backgroundColor:bc,borderTopLeftRadius:18,borderBottomLeftRadius:18}}/>

            <View style={{padding:18,paddingLeft:20}}>
              {/* 상단: 신발명 + 삭제 */}
              <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start',marginBottom:3}}>
                {editingId===s.id?(
                  <View style={{flexDirection:'row',alignItems:'center',gap:8,flex:1}}>
                    <TextInput
                      style={{flex:1,color:T1,fontSize:17,fontWeight:'800',fontFamily:FH,borderBottomWidth:1.5,borderBottomColor:ACCENT,paddingVertical:2,paddingHorizontal:0}}
                      value={editName} onChangeText={setEditName} autoFocus selectTextOnFocus/>
                    <TouchableOpacity onPress={async()=>{if(editName.trim()){await updateShoeName(s.id,editName.trim());}setEditingId(null);}} style={{padding:4}}>
                      <Ionicons name="checkmark-circle" size={20} color={ACCENT}/>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={()=>setEditingId(null)} style={{padding:4}}>
                      <Ionicons name="close-circle" size={20} color={T3}/>
                    </TouchableOpacity>
                  </View>
                ):(
                  <TouchableOpacity style={{flexDirection:'row',alignItems:'center',gap:6,flex:1}} onPress={()=>{setEditingId(s.id);setEditName(s.name);}}>
                    <Text style={{color:T1,fontSize:17,fontWeight:'800',fontFamily:FH}}>{s.name}</Text>
                    <Ionicons name="pencil-outline" size={13} color={T3}/>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={()=>Alert.alert('삭제','이 러닝화를 삭제할까요?',[{text:'취소'},{text:'삭제',style:'destructive',onPress:()=>deleteShoe(s.id)}])} style={{padding:4,marginLeft:8}}>
                  <Ionicons name="trash-outline" size={15} color={T3}/>
                </TouchableOpacity>
              </View>

              {/* 구매일 + 상태 */}
              <View style={{flexDirection:'row',alignItems:'center',gap:8,marginBottom:18}}>
                <Text style={{color:T3,fontSize:11}}>{s.purchase_date?`${s.purchase_date} · `:''}최대 {s.max_km}km</Text>
                <View style={{backgroundColor:bc+'22',borderRadius:4,paddingHorizontal:6,paddingVertical:2}}>
                  <Text style={{color:bc,fontSize:10,fontWeight:'700'}}>{bl}</Text>
                </View>
              </View>

              {/* 남은 km + 프로그레스 */}
              <View style={{marginBottom:18}}>
                <View style={{flexDirection:'row',alignItems:'baseline',marginBottom:10}}>
                  <Text style={{color:bc,fontSize:40,fontWeight:'900',fontFamily:FH,letterSpacing:-1}}>{Math.round(left)}</Text>
                  <Text style={{color:T3,fontSize:12,marginLeft:6}}>km 남음</Text>
                  <View style={{flex:1}}/>
                  <Text style={{color:T2,fontSize:13,fontWeight:'600'}}>{p}%</Text>
                </View>
                <View style={{backgroundColor:SURFACE,borderRadius:100,height:6,overflow:'hidden'}}>
                  <View style={{height:'100%',width:`${p}%` as any,backgroundColor:bc,borderRadius:100,opacity:0.9}}/>
                </View>
              </View>

              {/* 스탯 2열 */}
              <View style={{flexDirection:'row',gap:0,marginBottom:16,backgroundColor:SURFACE,borderRadius:12,padding:12}}>
                <View style={{flex:1,alignItems:'center'}}>
                  <Text style={{color:T1,fontSize:16,fontWeight:'700',fontFamily:FH}}>{Math.round(used)} km</Text>
                  <Text style={{color:T3,fontSize:10,marginTop:3}}>누적 사용</Text>
                </View>
                <View style={{width:StyleSheet.hairlineWidth,backgroundColor:SEP}}/>
                <View style={{flex:1,alignItems:'center'}}>
                  <Text style={{color:T1,fontSize:16,fontWeight:'700',fontFamily:FH}}>{Math.round(left)} km</Text>
                  <Text style={{color:T3,fontSize:10,marginTop:3}}>잔여 거리</Text>
                </View>
              </View>

              {/* 러닝시작 버튼 */}
              <TouchableOpacity
                style={{backgroundColor:ACCENT,borderRadius:12,paddingVertical:13,alignItems:'center'}}
                onPress={()=>onStartRun({id:s.id,name:s.name})}>
                <Text style={{color:'#000',fontSize:15,fontWeight:'800',letterSpacing:0.5}}>러닝시작</Text>
              </TouchableOpacity>

            </View>{/* padding View 닫기 */}
            {/* 교체 시 구매 버튼 */}
            {p<=15&&(
              <View style={{flexDirection:'row',gap:8,marginTop:10}}>
                <TouchableOpacity style={[a.buyBtn,{flex:1}]}
                  onPress={()=>Linking.openURL('https://www.coupang.com/np/search?q='+encodeURIComponent(s.name))}>
                  <Text style={a.buyBtnText}>쿠팡에서 구매</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[a.buyBtn,{flex:1}]}
                  onPress={()=>Linking.openURL('https://www.musinsa.com/search/goods?q='+encodeURIComponent(s.name))}>
                  <Text style={a.buyBtnText}>무신사에서 구매</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      })}

      {/* 러닝화 등록 */}
      <TouchableOpacity
        style={{flexDirection:'row',alignItems:'center',justifyContent:'center',borderRadius:16,borderWidth:1.5,borderColor:SEP,paddingVertical:16,gap:8}}
        onPress={onAddShoe}>
        <Ionicons name="add-circle-outline" size={20} color={T2}/>
        <Text style={{color:T2,fontSize:15,fontWeight:'600'}}>러닝화 등록하기</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Run Setup Modal ──────────────────────────────────────────
function RunSetupModal({shoe,onStart,onClose}:{shoe:{id:string;name:string};onStart:(km:number)=>void;onClose:()=>void}){
  const [goalKm,setGoalKm]=useState(5);
  const [inputText,setInputText]=useState('5');
  const presets=[
    {label:'3km',km:3},
    {label:'5km',km:5},
    {label:'10km',km:10},
    {label:'하프\n21.1',km:21.1},
    {label:'풀마\n42.2',km:42.2},
  ];
  function handlePreset(km:number){setGoalKm(km);setInputText(String(km));}
  function handleInputChange(text:string){
    setInputText(text);
    const n=parseFloat(text);
    if(n>0&&n<=300) setGoalKm(Math.round(n*10)/10);
  }
  function handleStart(){
    const km=parseFloat(inputText);
    if(!km||km<=0){Alert.alert('알림','올바른 거리를 입력해주세요');return;}
    onStart(Math.round(km*10)/10);
  }
  return(
    <View style={a.modalBg}>
      <View style={a.modal}>
        <View style={a.modalHandle}/>
        <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
          <Text style={a.modalTitle}>목표 거리 설정</Text>
          <TouchableOpacity onPress={onClose} style={{padding:4}}>
            <Ionicons name="close-circle" size={26} color={SURFACE}/>
          </TouchableOpacity>
        </View>
        <Text style={{color:T3,fontSize:13,marginBottom:20}}>{shoe.name}</Text>
        <View style={{flexDirection:'row',gap:8,marginBottom:28}}>
          {presets.map(p=>{
            const active=goalKm===p.km;
            return(
              <TouchableOpacity key={p.km}
                style={{flex:1,paddingVertical:12,borderRadius:14,backgroundColor:active?ACCENT:SURFACE,alignItems:'center'}}
                onPress={()=>handlePreset(p.km)}>
                <Text style={{color:active?'#000':T2,fontSize:13,fontWeight:'700',textAlign:'center',lineHeight:18}}>{p.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={{alignItems:'center',marginBottom:28}}>
          <Text style={{color:T3,fontSize:11,letterSpacing:1.5,textTransform:'uppercase',fontWeight:'600',marginBottom:10}}>목표 거리</Text>
          <View style={{flexDirection:'row',alignItems:'flex-end',gap:6}}>
            <TextInput
              style={{color:T1,fontSize:72,fontWeight:'700',fontFamily:FH,letterSpacing:-4,textAlign:'center',minWidth:140,padding:0,lineHeight:80}}
              value={inputText}
              onChangeText={handleInputChange}
              keyboardType="decimal-pad"
              selectTextOnFocus
            />
            <Text style={{color:T3,fontSize:22,fontWeight:'600',marginBottom:12}}>km</Text>
          </View>
        </View>
        <TouchableOpacity style={a.accentBtn} onPress={handleStart}>
          <Text style={a.accentBtnText}>러닝시작</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Run Screen (full-screen overlay) ─────────────────────────
function RunScreen({shoe,insets,goalKm,onSave,onDiscard}:{shoe:{id:string;name:string};insets:any;goalKm:number;onSave:(km:number,dur:number,cad:number,memo:string,route:string,location:string)=>Promise<void>;onDiscard:()=>void}){
  const [phase,setPhase]=useState<'running'|'done'>('running');
  const [km,setKm]=useState(0);
  const [elapsed,setElapsed]=useState(0);
  const [gpsStatus,setGpsStatus]=useState('GPS 신호 찾는 중...');
  const [cadence,setCadence]=useState(0);
  const [paused,setPaused]=useState(false);
  const [autoPaused,setAutoPaused]=useState(false);
  const [stopConfirm,setStopConfirm]=useState(false);
  const [finKm,setFinKm]=useState(0);
  const [finTime,setFinTime]=useState(0);
  const [finCad,setFinCad]=useState(0);
  const [finRoute,setFinRoute]=useState('');
  const [finLocation,setFinLocation]=useState('');
  const [memo,setMemo]=useState('');
  const [saving,setSaving]=useState(false);

  const watchId=useRef<number|null>(null);
  const timer=useRef<any>(null);
  const stepSub=useRef<any>(null);
  const stepTs=useRef<number[]>([]);
  const lastMag=useRef(0);
  const lastStep=useRef(0);
  const pts=useRef<any[]>([]);
  const dist=useRef(0);
  const t0=useRef(Date.now());
  const kf=useRef(new KalmanFilter());
  const cadRef=useRef(0);
  const locationRef=useRef('');
  const locationFetched=useRef(false);
  const isPausedRef=useRef(false);
  const autoPausedRef=useRef(false);
  const pausedMs=useRef(0);
  const pauseStartRef=useRef(0);
  const announcedKm=useRef(0);
  const lastMovementRef=useRef(Date.now());
  const stopConfirmTimer=useRef<any>(null);

  useEffect(()=>{
    (async()=>{
      try{
        Tts.setDefaultLanguage('ko-KR');
        Tts.setDefaultRate(0.52);
        const voices:any[]=await Tts.voices();
        const femaleVoice=voices.find((v:any)=>
          (v.language==='ko-KR'||v.language==='ko')&&
          (v.name?.toLowerCase().includes('female')||
           v.name?.toLowerCase().includes('여성')||
           (v.quality&&v.quality>=400))
        );
        if(femaleVoice) Tts.setDefaultVoice(femaleVoice.id);
      }catch(e){}
    })();
    setTimeout(()=>{
      try{Tts.speak(`달리기를 시작합니다! 목표는 ${goalKm}킬로미터입니다.`);}catch(e){}
    },800);
    (async()=>{
      if(Platform.OS==='android'){
        const granted=await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {title:'위치 권한',message:'러닝 거리 측정을 위해 위치 권한이 필요합니다.',buttonPositive:'허용',buttonNegative:'거부'}
        );
        if(granted!==PermissionsAndroid.RESULTS.GRANTED){
          Alert.alert('권한 필요','위치 권한을 허용해야 GPS 러닝이 가능합니다.');
          return;
        }
      }
      beginRun();
    })();
    return()=>{stop();clearTimeout(stopConfirmTimer.current);try{Tts.stop();}catch(e){}};
  },[]);

  useEffect(()=>{
    const fullKm=Math.floor(km);
    if(fullKm>0&&fullKm>announcedKm.current){
      announcedKm.current=fullKm;
      const remaining=Math.max(0,goalKm-fullKm);
      try{Tts.stop();}catch(e){}
      if(remaining>0){
        try{Tts.speak(`${fullKm}킬로미터 완주! 앞으로 ${Math.round(remaining)}킬로미터 남았습니다.`);}catch(e){}
      } else {
        try{Tts.speak(`목표 달성! ${goalKm}킬로미터 완주를 축하합니다!`);}catch(e){}
      }
    }
  },[km]);

  function beginRun(){
    dist.current=0;t0.current=Date.now();kf.current.reset();
    stepTs.current=[];lastMag.current=0;lastStep.current=0;pts.current=[];
    locationRef.current='';locationFetched.current=false;
    isPausedRef.current=false;autoPausedRef.current=false;
    pausedMs.current=0;announcedKm.current=0;
    lastMovementRef.current=Date.now();
    setUpdateIntervalForType(SensorTypes.accelerometer,100);
    stepSub.current=accelerometer.subscribe(({x,y,z})=>{
      const mag=Math.sqrt(x*x+y*y+z*z),now=Date.now();
      // 움직임 감지 (자동 일시정지/재개용)
      if(mag>10.5){
        lastMovementRef.current=now;
        // 자동 일시정지 상태면 움직임 감지 시 자동 재개
        if(isPausedRef.current&&autoPausedRef.current){
          pausedMs.current+=now-pauseStartRef.current;
          isPausedRef.current=false;
          autoPausedRef.current=false;
          setPaused(false);
          setAutoPaused(false);
          try{Tts.speak('달리기를 재개합니다.');}catch(e){}
        }
      }
      if(isPausedRef.current)return;
      // 걸음 감지
      if(mag>12&&lastMag.current<=12&&now-lastStep.current>250){
        lastStep.current=now;
        stepTs.current.push(now);
        stepTs.current=stepTs.current.filter(t=>now-t<=60000);
        cadRef.current=stepTs.current.length;
        setCadence(cadRef.current);
      }
      lastMag.current=mag;
    });
    timer.current=setInterval(()=>{
      if(!isPausedRef.current){
        setElapsed(Math.floor((Date.now()-t0.current-pausedMs.current)/1000));
        // 자동 일시정지 비활성화 (테스트용)
      }
    },1000);
    watchId.current=Geolocation.watchPosition(
      pos=>{
        if(isPausedRef.current)return;
        const{latitude:lat,longitude:lon,accuracy:acc}=pos.coords;
        const f=kf.current.process(lat,lon,acc,pos.timestamp);
        setGpsStatus(`정확도 ${Math.round(acc)}m`);
        if(!locationFetched.current){
          locationFetched.current=true;
          fetch(`https://nominatim.openstreetmap.org/reverse?lat=${f.lat}&lon=${f.lon}&format=json&accept-language=ko`,{headers:{'User-Agent':'SoleMate/1.0'}})
            .then(r=>r.json()).then(d=>{
              const addr=d.address||{};
              const parts=[addr.suburb||addr.neighbourhood||addr.quarter||addr.city_district||addr.town,addr.city||addr.county||addr.state].filter(Boolean);
              locationRef.current=parts.length>0?parts.join(', '):(d.display_name||'').split(',').slice(0,2).join(',').trim()||'';
            }).catch(()=>{});
        }
        if(pts.current.length>0){
          const prev=pts.current[pts.current.length-1];
          const d=calcDist(prev.lat,prev.lon,f.lat,f.lon);
          if(d>0.003&&d<0.3){dist.current+=d;setKm(Math.round(dist.current*100)/100);}
          // 5m 이상 이동했을 때만 포인트 저장 (노이즈 제거)
          if(d>=0.005) pts.current.push(f);
        } else {
          pts.current.push(f);
        }
      },
      err=>{setGpsStatus(err.code===1?'위치 권한 필요':'GPS 신호 없음');},
      {enableHighAccuracy:true,interval:1000,fastestInterval:500,forceRequestLocation:true,distanceFilter:0,maximumAge:0},
    );
  }

  function stop(){
    if(watchId.current!==null){Geolocation.clearWatch(watchId.current);watchId.current=null;}
    if(stepSub.current){stepSub.current.unsubscribe();stepSub.current=null;}
    clearInterval(timer.current);
  }

  function handlePause(){
    if(!paused){
      isPausedRef.current=true;
      autoPausedRef.current=false;
      pauseStartRef.current=Date.now();
      setPaused(true);
      setAutoPaused(false);
      try{Tts.stop();Tts.speak('일시정지합니다.');}catch(e){}
    } else {
      pausedMs.current+=Date.now()-pauseStartRef.current;
      isPausedRef.current=false;
      autoPausedRef.current=false;
      lastMovementRef.current=Date.now();
      setPaused(false);
      setAutoPaused(false);
      try{Tts.speak('달리기를 재개합니다.');}catch(e){}
    }
  }

  function handleStop(){
    if(!stopConfirm){
      // 첫 번째 탭: 확인 대기 상태
      setStopConfirm(true);
      stopConfirmTimer.current=setTimeout(()=>setStopConfirm(false),3000);
      return;
    }
    // 두 번째 탭: 실제 종료
    clearTimeout(stopConfirmTimer.current);
    setStopConfirm(false);
    const curPausedMs=isPausedRef.current?pausedMs.current+(Date.now()-pauseStartRef.current):pausedMs.current;
    const fk=dist.current,ft=Math.floor((Date.now()-t0.current-curPausedMs)/1000);
    if(fk<0.01){
      stop();
      Alert.alert('거리가 너무 짧아요','계속 달리거나 나가기를 선택하세요',[
        {text:'계속 달리기',onPress:()=>{setKm(0);setElapsed(0);setCadence(0);setGpsStatus('GPS 신호 찾는 중...');setPaused(false);setAutoPaused(false);beginRun();}},
        {text:'나가기',style:'destructive',onPress:onDiscard},
      ]);
      return;
    }
    stop();
    const rawPts=pts.current;
    const sampled=rawPts.length>200?Array.from({length:200},(_,i)=>rawPts[Math.min(Math.floor(i*(rawPts.length-1)/199),rawPts.length-1)]):rawPts;
    setFinRoute(sampled.length>=2?JSON.stringify(sampled):'');
    setFinLocation(locationRef.current);
    setFinKm(fk);setFinTime(ft);setFinCad(cadRef.current);
    setPhase('done');
  }

  async function handleSave(){
    setSaving(true);
    try{
      // 위치 아직 없으면 route 첫 좌표로 재시도
      let loc=finLocation||locationRef.current;
      if(!loc&&finRoute){
        try{
          const pts2=JSON.parse(finRoute);
          if(pts2.length>0){
            const {lat,lon}=pts2[0];
            const d=await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=ko`,{headers:{'User-Agent':'SoleMate/1.0'}}).then(r=>r.json());
            const addr=d.address||{};
            const parts=[addr.suburb||addr.neighbourhood||addr.quarter||addr.city_district||addr.town,addr.city||addr.county||addr.state].filter(Boolean);
            loc=parts.length>0?parts.join(', '):(d.display_name||'').split(',').slice(0,2).join(',').trim()||'';
          }
        }catch(e){}
      }
      await onSave(Math.round(finKm*100)/100,finTime,finCad,memo,finRoute,loc);
    }finally{setSaving(false);}
  }

  const progress=Math.min(1,km/goalKm);
  const remaining=Math.max(0,goalKm-km);

  const metrics=(km_:number,time_:number,cad_:number)=>(
    <View style={r.metrics}>
      <View style={r.mItem}><Text style={r.mVal}>{fmtTime(time_)}</Text><Text style={r.mLbl}>시간</Text></View>
      <View style={r.mSep}/>
      <View style={r.mItem}><Text style={r.mVal}>{fmtPace(km_,time_)}</Text><Text style={r.mLbl}>페이스</Text></View>
      <View style={r.mSep}/>
      <View style={r.mItem}><Text style={r.mVal}>{cad_>0?cad_:'--'}</Text><Text style={r.mLbl}>케이던스</Text></View>
    </View>
  );

  if(phase==='done') return(
    <View style={[r.screen,{paddingTop:insets.top+20,paddingBottom:insets.bottom+24}]}>
      <View style={r.topRow}>
        <Text style={r.doneLabel}>완료</Text>
        <Text style={r.topShoe}>{shoe.name}</Text>
      </View>
      <View style={r.center}>
        <Text style={r.bigKm}>{finKm.toFixed(2)}</Text>
        <Text style={r.kmUnit}>KM</Text>
      </View>
      {metrics(finKm,finTime,finCad)}
      <TextInput
        style={r.memoInput}
        value={memo}
        onChangeText={setMemo}
        placeholder="메모 (선택)"
        placeholderTextColor={T3}
        autoCorrect={false}
        autoCapitalize="none"
      />
      <View style={r.actionRow}>
        <TouchableOpacity style={r.discardBtn} onPress={onDiscard}>
          <Text style={r.discardTxt}>버리기</Text>
        </TouchableOpacity>
        <TouchableOpacity style={r.saveBtn} onPress={handleSave} disabled={saving}>
          <Text style={r.saveTxt}>{saving?'저장 중...':'저장하기'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const pauseLabel=autoPaused?'자동 일시정지':paused?'일시정지':'달리는 중';
  const pauseColor=autoPaused?WARN:paused?WARN:ACCENT;

  return(
    <View style={[r.screen,{paddingTop:insets.top+20,paddingBottom:insets.bottom+24}]}>
      <View style={r.topRow}>
        <Text style={[r.runningLabel,{color:pauseColor}]}>{pauseLabel}</Text>
        <Text style={r.topShoe}>{shoe.name}</Text>
        <View style={r.gpsChip}>
          <Ionicons name="radio-outline" size={10} color={ACCENT} style={{marginRight:3}}/>
          <Text style={r.gpsText}>{gpsStatus}</Text>
        </View>
      </View>
      <View style={r.center}>
        <Text style={r.bigKm}>{km.toFixed(2)}</Text>
        <Text style={r.kmUnit}>KM</Text>
      </View>
      <View style={r.progressWrap}>
        <View style={{flexDirection:'row',justifyContent:'space-between',marginBottom:8}}>
          <Text style={r.progressRemain}>{remaining>0.009?`${remaining.toFixed(2)} km 남음`:'목표 달성!'}</Text>
          <Text style={r.progressGoalTxt}>{km.toFixed(2)} / {goalKm} km</Text>
        </View>
        <View style={r.progressTrack}>
          <View style={[r.progressFill,{width:`${Math.min(100,Math.round(progress*100))}%`}]}/>
        </View>
      </View>
      {metrics(km,elapsed,cadence)}
      <View style={r.controlRow}>
        <View style={{alignItems:'center'}}>
          <TouchableOpacity style={r.pauseBtn} onPress={handlePause}>
            <Ionicons name={paused?'play':'pause'} size={28} color={T1}/>
          </TouchableOpacity>
          <Text style={r.ctrlHint}>{paused?'재개':'일시정지'}</Text>
        </View>
        <View style={{alignItems:'center'}}>
          <TouchableOpacity
            style={[r.stopBtn,stopConfirm&&{backgroundColor:'#FF6B35',transform:[{scale:1.08}]}]}
            onPress={handleStop}>
            <View style={r.stopIcon}/>
          </TouchableOpacity>
          <Text style={[r.ctrlHint,stopConfirm&&{color:WARN,fontWeight:'700'}]}>
            {stopConfirm?'한번 더 누르면 종료':'종료'}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── Log Tab ──────────────────────────────────────────────────
function LogTab({shoes,runs}:any){
  const [selectedRun,setSelectedRun]=useState<any>(null);
  const DOW=['일','월','화','수','목','금','토'];

  const sorted=[...(Array.isArray(runs)?runs:[])].sort((a:any,b:any)=>new Date(b.run_date).getTime()-new Date(a.run_date).getTime()).slice(0,30);

  return(
    <View style={{flex:1}}>
      <ScrollView contentContainerStyle={{padding:16,paddingBottom:32}}>
        <Text style={a.secTitle}>최근 기록</Text>
        <View style={{gap:12}}>
          {sorted.map((run:any)=>{
            const s=shoes.find((x:any)=>x.id===run.shoe_id);
            const km=parseFloat(run.km);
            const dur=run.duration||0;
            const dow=DOW[new Date(run.run_date).getDay()]||'';
            const d=new Date(run.run_date);
            const fmtDate=`${d.getFullYear()}. ${d.getMonth()+1}. ${d.getDate()}.`;

            // 미니 SVG 경로
            let rPts:{lat:number,lon:number}[]=[];
            try{if(run.route){const raw=JSON.parse(run.route);rPts=raw.length>4?raw.filter((_:any,i:number)=>i%2===0):raw;}}catch(e){}
            const TW=68,TH=68,TP=7;
            let miniPath='';
            if(rPts.length>=2){
              const lats=rPts.map((p:any)=>p.lat),lons=rPts.map((p:any)=>p.lon);
              const minLat=Math.min(...lats),maxLat=Math.max(...lats);
              const minLon=Math.min(...lons),maxLon=Math.max(...lons);
              const rH=maxLat-minLat||0.0001,rV=maxLon-minLon||0.0001;
              const W=TW-TP*2,H=TH-TP*2;
              const toX=(lon:number)=>TP+(lon-minLon)/rV*W;
              const toY=(lat:number)=>TP+(maxLat-lat)/rH*H;
              miniPath=rPts.map((p:any,i:number)=>`${i===0?'M':'L'}${toX(p.lon).toFixed(1)},${toY(p.lat).toFixed(1)}`).join(' ');
            }

            return(
              <TouchableOpacity key={run.id} activeOpacity={0.75}
                style={{backgroundColor:CARD,borderRadius:16,overflow:'hidden'}}
                onPress={()=>setSelectedRun({...run,shoeName:s?s.name:'삭제된 신발'})}>
                {/* 상단: 썸네일 + 날짜/설명 */}
                <View style={{flexDirection:'row',alignItems:'center',padding:16,gap:14}}>
                  <View style={{width:TW,height:TH,borderRadius:12,backgroundColor:SURFACE,overflow:'hidden',alignItems:'center',justifyContent:'center'}}>
                    {miniPath?(
                      <Svg width={TW} height={TH}>
                        <Path d={miniPath} stroke={ACCENT} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.9}/>
                      </Svg>
                    ):(
                      <Svg width={TW} height={TH}>
                        <Path d={`M${TP},${TH/2} Q${TW*0.3},${TH*0.25} ${TW/2},${TH/2} Q${TW*0.7},${TH*0.75} ${TW-TP},${TH/2}`} stroke={T3} strokeWidth={2} fill="none" strokeLinecap="round" opacity={0.35}/>
                        <Path d={`M${TP},${TH*0.65} Q${TW*0.35},${TH*0.4} ${TW/2},${TH*0.6} Q${TW*0.65},${TH*0.8} ${TW-TP},${TH*0.45}`} stroke={T3} strokeWidth={1.5} fill="none" strokeLinecap="round" opacity={0.2}/>
                      </Svg>
                    )}
                  </View>
                  <View style={{flex:1,gap:2}}>
                    <Text style={{color:T1,fontSize:15,fontWeight:'700',fontFamily:FH}}>{fmtDate}</Text>
                    <Text style={{color:T2,fontSize:13,fontFamily:FP}}>{dow}요일 러닝{s?' · '+s.name:''}</Text>
                    {run.location?<Text style={{color:T3,fontSize:11,marginTop:1}} numberOfLines={1}>{run.location}</Text>:null}
                  </View>
                </View>
                {/* 구분선 */}
                <View style={{height:StyleSheet.hairlineWidth,backgroundColor:SEP,marginHorizontal:0}}/>
                {/* 하단: 3열 스탯 */}
                <View style={{flexDirection:'row',paddingVertical:14}}>
                  <View style={{flex:1,alignItems:'center'}}>
                    <Text style={{color:T1,fontSize:18,fontWeight:'700',fontFamily:FH}}>{km.toFixed(2)}</Text>
                    <Text style={{color:T3,fontSize:11,marginTop:3}}>Km</Text>
                  </View>
                  <View style={{width:StyleSheet.hairlineWidth,backgroundColor:SEP}}/>
                  <View style={{flex:1,alignItems:'center'}}>
                    <Text style={{color:T1,fontSize:18,fontWeight:'700',fontFamily:FH}}>{dur>0?fmtPace(km,dur):"-'--\""}</Text>
                    <Text style={{color:T3,fontSize:11,marginTop:3}}>평균 페이스</Text>
                  </View>
                  <View style={{width:StyleSheet.hairlineWidth,backgroundColor:SEP}}/>
                  <View style={{flex:1,alignItems:'center'}}>
                    <Text style={{color:T1,fontSize:18,fontWeight:'700',fontFamily:FH}}>{dur>0?fmtTime(dur):'--:--'}</Text>
                    <Text style={{color:T3,fontSize:11,marginTop:3}}>시간</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
      {selectedRun&&<RunDetailModal run={selectedRun} onClose={()=>setSelectedRun(null)}/>}
    </View>
  );
}

function RunDetailModal({run,onClose}:any){
  const{width:SW}=Dimensions.get('window');
  const km=parseFloat(run.km),dur=run.duration||0;
  const kcal=Math.round(km*70);
  const DOW2=['일','월','화','수','목','금','토'];
  const dow2=DOW2[new Date(run.run_date).getDay()]||'';
  const d2=new Date(run.run_date);
  const fmtDate2=`${d2.getFullYear()}. ${d2.getMonth()+1}. ${d2.getDate()}.`;

  const [dynLocation,setDynLocation]=React.useState<string>(run.location||'');
  React.useEffect(()=>{
    if(run.location){setDynLocation(run.location);return;}
    try{
      const pts=run.route?JSON.parse(run.route):[];
      if(pts.length>0){
        const{lat,lon}=pts[0];
        fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=ko`,{headers:{'User-Agent':'SoleMate/1.0'}})
          .then(r=>r.json()).then(d=>{
            const addr=d.address||{};
            const parts=[addr.suburb||addr.neighbourhood||addr.quarter||addr.city_district||addr.town,addr.city||addr.county||addr.state].filter(Boolean);
            const loc=parts.length>0?parts.join(', '):(d.display_name||'').split(',').slice(0,2).join(',').trim()||'';
            if(loc) setDynLocation(loc);
          }).catch(()=>{});
      }
    }catch(e){}
  },[run.id]);

  // SVG 경로 계산
  function smoothRoute(pts:{lat:number,lon:number}[],w=4){
    if(pts.length<=w) return pts;
    return pts.map((_,i)=>{
      const s=Math.max(0,i-Math.floor(w/2)),e=Math.min(pts.length,s+w);
      const sl=pts.slice(s,e);
      return{lat:sl.reduce((a,b)=>a+b.lat,0)/sl.length,lon:sl.reduce((a,b)=>a+b.lon,0)/sl.length};
    });
  }
  let routePts:{lat:number,lon:number}[]=[];
  try{if(run.route)routePts=smoothRoute(JSON.parse(run.route));}catch(e){}
  const MAP_W=SW-32,MAP_H=220,MP=18;
  let svgPath='',sx=0,sy=0,ex=0,ey=0;
  let kmMarkers:{x:number;y:number;km:number}[]=[];
  if(routePts.length>=2){
    const lats=routePts.map(p=>p.lat),lons=routePts.map(p=>p.lon);
    const minLat=Math.min(...lats),maxLat=Math.max(...lats);
    const minLon=Math.min(...lons),maxLon=Math.max(...lons);
    const rH=maxLat-minLat||0.0001,rV=maxLon-minLon||0.0001;
    const W=MAP_W-MP*2,H=MAP_H-MP*2;
    const toX=(lon:number)=>MP+(lon-minLon)/rV*W;
    const toY=(lat:number)=>MP+(maxLat-lat)/rH*H;
    svgPath=routePts.map((p,i)=>`${i===0?'M':'L'}${toX(p.lon).toFixed(1)},${toY(p.lat).toFixed(1)}`).join(' ');
    sx=toX(routePts[0].lon);sy=toY(routePts[0].lat);
    ex=toX(routePts[routePts.length-1].lon);ey=toY(routePts[routePts.length-1].lat);
    // 1km 마커
    let cum=0,nextKm=1;
    for(let i=1;i<routePts.length;i++){
      const prev=routePts[i-1],curr=routePts[i];
      const seg=calcDist(prev.lat,prev.lon,curr.lat,curr.lon);
      cum+=seg;
      while(cum>=nextKm){
        const t=seg>0?(nextKm-(cum-seg))/seg:0;
        const iLat=prev.lat+(curr.lat-prev.lat)*t;
        const iLon=prev.lon+(curr.lon-prev.lon)*t;
        kmMarkers.push({x:toX(iLon),y:toY(iLat),km:nextKm});
        nextKm++;
      }
    }
  }

  const StatCol=({value,label,accent}:{value:string;label:string;accent?:boolean})=>(
    <View style={{flex:1,paddingVertical:4}}>
      <Text style={{color:accent?ACCENT:T1,fontSize:22,fontWeight:'800',fontFamily:FH,letterSpacing:-0.5}}>{value}</Text>
      <Text style={{color:T3,fontSize:11,marginTop:3}}>{label}</Text>
    </View>
  );

  return(
    <View style={{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:BG,zIndex:999}}>
      {/* 헤더 */}
      <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:20,paddingTop:52,paddingBottom:16}}>
        <TouchableOpacity onPress={onClose} style={{padding:4}}>
          <Ionicons name="arrow-back" size={24} color={T1}/>
        </TouchableOpacity>
        <Text style={{color:T1,fontSize:16,fontWeight:'700'}}>{dow2}요일 러닝</Text>
        <View style={{width:32}}/>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom:40}}>
        {/* 날짜 + 큰 거리 */}
        <View style={{paddingHorizontal:24,paddingTop:8,paddingBottom:20}}>
          <View style={{flexDirection:'row',alignItems:'center',gap:10,marginBottom:8}}>
            <Text style={{color:T3,fontSize:13}}>{fmtDate2}  {dow2}요일</Text>
            {run.run_time?(
              <View style={{backgroundColor:SURFACE,borderRadius:6,paddingVertical:2,paddingHorizontal:8}}>
                <Text style={{color:T2,fontSize:13,fontWeight:'600'}}>{run.run_time}시</Text>
              </View>
            ):null}
          </View>
          <Text style={{color:T1,fontSize:80,fontWeight:'900',fontFamily:FH,letterSpacing:-3,lineHeight:84}}>{km.toFixed(2)}</Text>
          <Text style={{color:T3,fontSize:14,marginTop:2,letterSpacing:1}}>킬로미터</Text>
        </View>

        {/* 구분선 */}
        <View style={{height:StyleSheet.hairlineWidth,backgroundColor:SEP,marginHorizontal:24}}/>

        {/* 스탯 1행: 페이스 / 시간 / 칼로리 */}
        <View style={{flexDirection:'row',paddingHorizontal:24,paddingVertical:20,gap:0}}>
          <StatCol value={dur>0?fmtPace(km,dur):"-'--\""} label="평균 페이스"/>
          <View style={{width:StyleSheet.hairlineWidth,backgroundColor:SEP,marginVertical:4}}/>
          <View style={{width:20}}/>
          <StatCol value={dur>0?fmtTime(dur):'--:--'} label="시간"/>
          <View style={{width:StyleSheet.hairlineWidth,backgroundColor:SEP,marginVertical:4}}/>
          <View style={{width:20}}/>
          <StatCol value={String(kcal)} label="칼로리" accent/>
        </View>

        {/* 구분선 */}
        <View style={{height:StyleSheet.hairlineWidth,backgroundColor:SEP,marginHorizontal:24}}/>

        {/* 스탯 2행: 케이던스 / 러닝화 */}
        <View style={{flexDirection:'row',paddingHorizontal:24,paddingVertical:20,gap:0}}>
          <StatCol value={run.cadence>0?String(run.cadence):'--'} label="케이던스"/>
          <View style={{width:StyleSheet.hairlineWidth,backgroundColor:SEP,marginVertical:4}}/>
          <View style={{width:20}}/>
          <View style={{flex:2,paddingVertical:4}}>
            <Text style={{color:T1,fontSize:16,fontWeight:'700',fontFamily:FH}} numberOfLines={1}>{run.shoeName}</Text>
            <Text style={{color:T3,fontSize:11,marginTop:3}}>러닝화</Text>
          </View>
        </View>

        {/* 메모 */}
        {run.memo?(
          <>
            <View style={{height:StyleSheet.hairlineWidth,backgroundColor:SEP,marginHorizontal:24}}/>
            <View style={{paddingHorizontal:24,paddingVertical:16}}>
              <Text style={{color:T3,fontSize:11,marginBottom:6}}>메모</Text>
              <Text style={{color:T2,fontSize:14,lineHeight:20}}>{run.memo}</Text>
            </View>
          </>
        ):null}

        {/* 지도 */}
        {routePts.length>=2?(
          <View style={{margin:16,borderRadius:16,overflow:'hidden',backgroundColor:SURFACE}}>
            <Svg width={MAP_W} height={MAP_H}>
              <Rect width={MAP_W} height={MAP_H} fill={SURFACE}/>
              <Path d={svgPath} stroke={ACCENT} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              {kmMarkers.map(m=>(
                <React.Fragment key={m.km}>
                  <Circle cx={m.x} cy={m.y} r={10} fill={CARD} stroke={T1} strokeWidth={1.5}/>
                  <SvgText x={m.x} y={m.y+4} fontSize={9} fill={T1} textAnchor="middle" fontWeight="700">{m.km}</SvgText>
                </React.Fragment>
              ))}
              <Circle cx={sx} cy={sy} r={7} fill="#4CAF50"/>
              <Circle cx={ex} cy={ey} r={8} fill={DANGER} stroke={T1} strokeWidth={2}/>
            </Svg>
            {dynLocation?(
              <View style={{position:'absolute',top:12,left:12,backgroundColor:'rgba(0,0,0,0.65)',borderRadius:8,paddingVertical:5,paddingHorizontal:10,flexDirection:'row',alignItems:'center',gap:4}}>
                <Ionicons name="location" size={12} color={ACCENT}/>
                <Text style={{color:T1,fontSize:12,fontWeight:'600'}}>{dynLocation}</Text>
              </View>
            ):null}
          </View>
        ):(
          <View style={{margin:16,borderRadius:16,backgroundColor:SURFACE,height:120,alignItems:'center',justifyContent:'center',gap:8}}>
            <Ionicons name="map-outline" size={32} color={T3}/>
            <Text style={{color:T3,fontSize:12}}>경로 데이터 없음</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Period Wheel Picker ──────────────────────────────────────
function PeriodWheelPicker({period,offset,onChange,onClose,firstRunDate}:{
  period:string;offset:number;onChange:(o:number)=>void;onClose:()=>void;firstRunDate:string;
}){
  const ITEM_H=48;
  const now=new Date();
  function monOf(d:Date){const r=new Date(d);const day=r.getDay();r.setDate(r.getDate()-(day===0?6:day-1));r.setHours(0,0,0,0);return r;}

  const items=useMemo(()=>{
    const list:{label:string}[]=[];
    const first=new Date(firstRunDate||today());
    if(period==='year'){
      for(let y=now.getFullYear();y>=first.getFullYear();y--) list.push({label:`${y}년`});
    } else if(period==='month'){
      let d=new Date(now.getFullYear(),now.getMonth(),1);
      const fm=new Date(first.getFullYear(),first.getMonth(),1);
      while(d>=fm){list.push({label:`${d.getFullYear()}년 ${d.getMonth()+1}월`});d.setMonth(d.getMonth()-1);}
    } else if(period==='week'){
      let mon=monOf(now);
      const fm=monOf(first);
      let idx=0;
      while(mon>=fm){
        const sun=new Date(mon);sun.setDate(mon.getDate()+6);
        const label=idx===0?'이번 주':idx===1?'지난 주'
          :`${mon.toISOString().slice(5,10).replace('-','/')} ~ ${sun.toISOString().slice(5,10).replace('-','/')}`;
        list.push({label});
        mon.setDate(mon.getDate()-7);
        idx++;
      }
    }
    return list;
  },[period,firstRunDate]);

  const scrollRef=useRef<ScrollView>(null);
  const curOffset=Math.min(offset,items.length-1);
  useEffect(()=>{setTimeout(()=>scrollRef.current?.scrollTo({y:curOffset*ITEM_H,animated:false}),30);},[]);

  function onScrollEnd(e:any){
    const idx=Math.max(0,Math.min(items.length-1,Math.round(e.nativeEvent.contentOffset.y/ITEM_H)));
    onChange(idx);
  }

  return(
    <View style={a.wheelWrap}>
      <View pointerEvents="none" style={a.wheelHighlight}/>
      <ScrollView ref={scrollRef} style={{height:ITEM_H*5}}
        showsVerticalScrollIndicator={false} snapToInterval={ITEM_H}
        decelerationRate="fast" onMomentumScrollEnd={onScrollEnd} onScrollEndDrag={onScrollEnd}
        contentContainerStyle={{paddingVertical:ITEM_H*2}}>
        {items.map((item,i)=>(
          <View key={i} style={{height:ITEM_H,justifyContent:'center',alignItems:'center'}}>
            <Text style={[a.wheelItem,curOffset===i&&a.wheelItemActive]}>{item.label}</Text>
          </View>
        ))}
      </ScrollView>
      <TouchableOpacity style={a.wheelDone} onPress={onClose}>
        <Text style={a.wheelDoneTxt}>완료</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Stats Tab ────────────────────────────────────────────────
function StatsTab({shoes,runs,shoeStats}:any){
  const [period,setPeriod]=useState<'week'|'month'|'year'|'all'>('month');
  const [offset,setOffset]=useState(0);
  const [showPicker,setShowPicker]=useState(false);
  const [selectedShoe,setSelectedShoe]=useState<any>(null);
  const now=new Date();
  const offsetRef=useRef(0);

  const firstRunDate=runs.length
    ?runs.reduce((m:string,r:any)=>r.run_date<m?r.run_date:m,runs[0].run_date)
    :today();

  function changePeriod(p:any){setPeriod(p);setOffset(0);offsetRef.current=0;setShowPicker(false);}
  function changeOffset(n:number){const v=Math.max(0,n);offsetRef.current=v;setOffset(v);}

  const swipePan=useRef(PanResponder.create({
    onMoveShouldSetPanResponder:(_,g)=>Math.abs(g.dx)>Math.abs(g.dy)&&Math.abs(g.dx)>10,
    onPanResponderRelease:(_,g)=>{
      if(g.dx>30) changeOffset(offsetRef.current+1);
      else if(g.dx<-30) changeOffset(offsetRef.current-1);
    },
  })).current;

  function targetDate(off=offset){
    const d=new Date(now);
    if(period==='week') d.setDate(d.getDate()-off*7);
    if(period==='month') d.setMonth(d.getMonth()-off);
    if(period==='year') d.setFullYear(d.getFullYear()-off);
    return d;
  }

  function getMondayOf(d:Date){
    const r=new Date(d);
    const day=r.getDay();
    r.setDate(r.getDate()-(day===0?6:day-1));
    return r;
  }

  function filterByOffset(list:any[],off:number){
    const safe=list??[];
    if(period==='all') return safe;
    const t=targetDate(off);
    if(period==='week'){
      const mon=getMondayOf(t);
      const sun=new Date(mon); sun.setDate(mon.getDate()+6);
      const s=mon.toISOString().split('T')[0],e=sun.toISOString().split('T')[0];
      return safe.filter((r:any)=>r.run_date&&r.run_date>=s&&r.run_date<=e);
    }
    if(period==='month') return safe.filter((r:any)=>r.run_date?.startsWith(t.toISOString().slice(0,7)));
    return safe.filter((r:any)=>r.run_date?.startsWith(String(t.getFullYear())));
  }

  function getPeriodLabel(){
    if(period==='all') return '전체 기록';
    const t=targetDate();
    if(period==='week'){
      if(offset===0) return '이번 주';
      if(offset===1) return '지난 주';
      const mon=getMondayOf(t);
      const sun=new Date(mon); sun.setDate(mon.getDate()+6);
      return `${mon.toISOString().slice(5,10).replace('-','/')} ~ ${sun.toISOString().slice(5,10).replace('-','/')}`;
    }
    if(period==='month') return `${t.getFullYear()}년 ${t.getMonth()+1}월`;
    return `${t.getFullYear()}년`;
  }

  function getDiffLabel(){
    if(period==='week') return '전 주 대비';
    if(period==='month') return '전 달 대비';
    return '전 년 대비';
  }

  const filtered=filterByOffset(runs,offset);
  const prev=filterByOffset(runs,offset+1);

  const totalKm=filtered.reduce((a:number,r:any)=>a+parseFloat(r.km),0);
  const prevKm=prev.reduce((a:number,r:any)=>a+parseFloat(r.km),0);
  const avgKm=filtered.length?totalKm/filtered.length:0;
  const totalSec=filtered.reduce((a:number,r:any)=>a+(r.duration||0),0);
  const paceRuns=filtered.filter((r:any)=>r.source==='gps'&&r.duration>0&&parseFloat(r.km)>0.1);
  const avgPaceSec=paceRuns.length?paceRuns.reduce((a:number,r:any)=>a+r.duration/parseFloat(r.km),0)/paceRuns.length:0;
  const diff=period!=='all'&&prevKm>0?Math.round((totalKm-prevKm)/prevKm*100):null;

  function fmtTotalTime(s:number){
    const h=Math.floor(s/3600),m=Math.floor((s%3600)/60);
    if(h>0) return`${h}h ${m}m`;
    return m>0?`${m}m`:'--';
  }

  const shoePerf=shoes.map((s:any)=>{
    const sr=runs.filter((r:any)=>r.shoe_id===s.id&&r.source==='gps'&&(r.duration||0)>0&&parseFloat(r.km)>0.1);
    if(sr.length<2) return null;
    const avg=sr.reduce((a:number,r:any)=>a+r.duration/parseFloat(r.km),0)/sr.length;
    return{name:s.name,pace:avg,cnt:sr.length};
  }).filter(Boolean).sort((a:any,b:any)=>a.pace-b.pace);

  const shoeUsage=shoes.map((s:any)=>{
    const sr=filtered.filter((r:any)=>r.shoe_id===s.id);
    return{...s,cnt:sr.length,km:sr.reduce((a:number,r:any)=>a+parseFloat(r.km),0)};
  }).filter((s:any)=>s.cnt>0);

  const PERIODS=[{key:'week',label:'주'},{key:'month',label:'월'},{key:'year',label:'년'},{key:'all',label:'전체'}];

  return(
    <ScrollView contentContainerStyle={{padding:16,paddingBottom:24}}>

      <View style={a.periodSel}>
        {PERIODS.map(p=>(
          <TouchableOpacity key={p.key} style={[a.periodBtn,period===p.key&&a.periodBtnOn]}
            onPress={()=>changePeriod(p.key)}>
            <Text style={[a.periodTxt,period===p.key&&a.periodTxtOn]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {period!=='all'&&(
        <View style={a.periodNav} {...swipePan.panHandlers}>
          <TouchableOpacity style={{alignItems:'center',flex:1}} onPress={()=>setShowPicker(v=>!v)}>
            <View style={{flexDirection:'row',alignItems:'center',gap:4}}>
              <Text style={a.periodNavLabel}>{getPeriodLabel()}</Text>
              <Ionicons name={showPicker?'chevron-up':'chevron-down'} size={13} color={T3}/>
            </View>
            {diff!==null&&(
              <Text style={{color:diff>=0?ACCENT:DANGER,fontSize:11,fontWeight:'700',marginTop:2}}>
                {getDiffLabel()} {diff>=0?'+':''}{diff}%
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}
      {period!=='all'&&showPicker&&(
        <PeriodWheelPicker
          period={period} offset={offset}
          onChange={o=>{changeOffset(o);}}
          onClose={()=>setShowPicker(false)}
          firstRunDate={firstRunDate}
        />
      )}

      {period==='all'&&(
        <Text style={{color:T1,fontSize:15,fontWeight:'700',marginBottom:12}}>전체 기록</Text>
      )}

      <View style={a.statGrid}>
        <View style={a.statBox}><Text style={a.statNum}>{totalKm.toFixed(1)}</Text><Text style={a.statLbl}>총 km</Text></View>
        <View style={a.statBox}><Text style={a.statNum}>{filtered.length}</Text><Text style={a.statLbl}>런 횟수</Text></View>
      </View>
      <View style={[a.statGrid,{marginTop:0}]}>
        <View style={a.statBox}><Text style={a.statNum}>{avgPaceSec>0?fmtPace(1,avgPaceSec):'--'}</Text><Text style={a.statLbl}>평균 페이스</Text></View>
        <View style={a.statBox}><Text style={a.statNum}>{fmtTotalTime(totalSec)}</Text><Text style={a.statLbl}>총 시간</Text></View>
      </View>

      {shoePerf.length>=2&&(
        <View style={[a.shoeCard,{marginBottom:12,marginTop:4}]}>
          <Text style={[a.secTitle,{marginBottom:12}]}>신발별 페이스 비교</Text>
          {shoePerf.map((s:any,i:number)=>{
            const diffSec=i>0?Math.round(s.pace-shoePerf[0].pace):0;
            return(
              <View key={s.name} style={{flexDirection:'row',alignItems:'center',marginBottom:i<shoePerf.length-1?10:0}}>
                <View style={{width:22,alignItems:'center'}}>
                  {i===0?<Ionicons name="trophy" size={13} color={ACCENT}/>:<Text style={{color:T3,fontSize:11,fontFamily:FP}}>{i+1}</Text>}
                </View>
                <Text style={{color:i===0?T1:T2,fontSize:14,fontFamily:FP,flex:1,marginLeft:4}}>{s.name}</Text>
                <Text style={{color:i===0?ACCENT:T3,fontSize:15,fontFamily:FH,letterSpacing:0.5}}>{fmtPace(1,s.pace)}</Text>
                {diffSec>0&&<Text style={{color:DANGER,fontSize:11,fontFamily:FP,marginLeft:6}}>+{Math.floor(diffSec/60)}'{String(diffSec%60).padStart(2,'0')}"</Text>}
              </View>
            );
          })}
          <Text style={{color:T3,fontSize:11,fontFamily:FP,marginTop:10}}>
            {shoePerf[0].name} 착용 시 가장 빠름 · GPS 기록 기준
          </Text>
        </View>
      )}

      {shoeUsage.length>0&&<Text style={[a.secTitle,{marginTop:12}]}>신발별 사용</Text>}
      {shoeUsage.map((s:any)=>{
        const{pct}=shoeStats(s);
        const p=Math.round(pct);
        const bc=p>40?ACCENT:p>15?WARN:DANGER;
        return(
          <TouchableOpacity key={s.id} style={a.shoeCard} onPress={()=>setSelectedShoe(s)} activeOpacity={0.75}>
            <View style={a.shoeCardHead}>
              <Text style={a.shoeName}>{s.name}</Text>
              <View style={[a.badge,{backgroundColor:bc+'22',borderWidth:1,borderColor:bc}]}>
                <Text style={[a.badgeText,{color:bc}]}>{p}% 잔여</Text>
              </View>
            </View>
            <View style={a.shoeStatsRow}>
              <Text style={a.ssStat}><Text style={a.ssNum}>{s.cnt}</Text> 회 러닝</Text>
              <Text style={a.ssStat}><Text style={a.ssNum}>{s.km.toFixed(1)}</Text> km</Text>
            </View>
            <Text style={{color:T3,fontSize:11,marginTop:6,textAlign:'right'}}>탭하여 상세 보기</Text>
          </TouchableOpacity>
        );
      })}
      {selectedShoe&&<ShoeStatModal shoe={selectedShoe} runs={runs} onClose={()=>setSelectedShoe(null)}/>}

      {filtered.length===0&&(
        <View style={[a.empty,{marginTop:32}]}>
          <Text style={a.emptyTitle}>기록 없음</Text>
          <Text style={a.emptyText}>이 기간에 달린 기록이 없어요</Text>
        </View>
      )}
    </ScrollView>
  );
}

// ─── Shoe Stat Modal ─────────────────────────────────────────
function ShoeStatModal({shoe,runs,onClose}:any){
  const shoeRuns=runs.filter((r:any)=>r.shoe_id===shoe.id);
  const totalKm=shoeRuns.reduce((a:number,r:any)=>a+parseFloat(r.km),0);
  const totalSec=shoeRuns.reduce((a:number,r:any)=>a+(r.duration||0),0);
  const avgKm=shoeRuns.length?totalKm/shoeRuns.length:0;
  const cadRuns=shoeRuns.filter((r:any)=>r.cadence>0);
  const avgCad=cadRuns.length?cadRuns.reduce((a:number,r:any)=>a+r.cadence,0)/cadRuns.length:0;
  const paceRuns=shoeRuns.filter((r:any)=>r.source==='gps'&&r.duration>0&&parseFloat(r.km)>0.1);
  const avgPaceSec=paceRuns.length?paceRuns.reduce((a:number,r:any)=>a+r.duration/parseFloat(r.km),0)/paceRuns.length:0;

  function fmtTotalTime(s:number){
    const h=Math.floor(s/3600),m=Math.floor((s%3600)/60);
    if(h>0) return`${h}시간 ${m}분`;
    return`${m}분`;
  }

  const stats=[
    {label:'총 러닝',value:`${shoeRuns.length}회`},
    {label:'총 거리',value:`${totalKm.toFixed(1)} km`},
    {label:'총 시간',value:totalSec>0?fmtTotalTime(totalSec):'--'},
    {label:'평균 거리',value:avgKm>0?`${avgKm.toFixed(1)} km`:'--'},
    {label:'평균 페이스',value:avgPaceSec>0?fmtPace(1,avgPaceSec):'--'},
    {label:'평균 케이던스',value:avgCad>0?`${Math.round(avgCad)} spm`:'--'},
  ];

  return(
    <View style={a.modalBg}>
      <View style={a.modal}>
        <View style={a.modalHandle}/>
        <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <Text style={a.modalTitle}>{shoe.name}</Text>
          <TouchableOpacity onPress={onClose} style={{padding:4}}>
            <Ionicons name="close-circle" size={26} color={SURFACE}/>
          </TouchableOpacity>
        </View>
        <View style={a.inputGroup}>
          {stats.map((s,i)=>(
            <View key={s.label}>
              {i>0&&<View style={a.inputDiv}/>}
              <View style={a.inputRow}>
                <Text style={a.inputLbl}>{s.label}</Text>
                <Text style={{color:T1,fontSize:15,fontWeight:'600'}}>{s.value}</Text>
              </View>
            </View>
          ))}
        </View>
        <TouchableOpacity style={[a.accentBtn,{marginTop:16}]} onPress={onClose}>
          <Text style={a.accentBtnText}>닫기</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Add Shoe Modal ───────────────────────────────────────────
function ShoeNameInput({nameRef,nameVal,onSelectKm}:{nameRef:any;nameVal:any;onSelectKm:(km:string)=>void}){
  const [results,setResults]=useState<any[]>([]);
  const debounce=useRef<any>(null);
  function onChange(q:string){
    nameVal.current=q;
    clearTimeout(debounce.current);
    if(q.length<1){setResults([]);return;}
    debounce.current=setTimeout(async()=>{
      try{const r=await fetch(API+'/api/shoes/search?q='+encodeURIComponent(q));setResults(await r.json());}
      catch(e){setResults([]);}
    },300);
  }
  function pick(s:any){
    const n=s.brand+' '+s.model;
    nameVal.current=n;
    nameRef.current?.setNativeProps({text:n});
    onSelectKm(String(s.max_km));
    setResults([]);
  }
  return(
    <>
      <TextInput ref={nameRef} style={a.input} onChangeText={onChange}
        placeholder="Nike Pegasus 41, Adidas Ultraboost..." placeholderTextColor={T3}
        autoFocus autoCorrect={false} autoCapitalize="none"/>
      {results.length>0&&(
        <ScrollView style={a.acList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
          {results.map((s:any,i:number)=>(
            <TouchableOpacity key={i} style={[a.acItem,i===results.length-1&&{borderBottomWidth:0}]} onPress={()=>pick(s)}>
              <Text style={a.acName}>{s.brand} {s.model}</Text>
              <Text style={a.acSub}>{s.type} · {s.max_km}km</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </>
  );
}

function KmWheelPicker({value,onChange,onClose,recommendedKm}:{value:string;onChange:(v:string)=>void;onClose:()=>void;recommendedKm?:string|null}){
  const ITEM_H=48;
  const STEP=10;
  const center=parseInt(recommendedKm||'')||600;
  const minV=center-200;
  const maxV=center+200;
  const items=Array.from({length:(maxV-minV)/STEP+1},(_,i)=>minV+i*STEP);
  const recVal=parseInt(recommendedKm||'')||null;
  const scrollRef=useRef<ScrollView>(null);
  const curVal=Math.round((parseInt(value)||center)/STEP)*STEP;
  const initIdx=Math.max(0,items.findIndex(v=>v>=curVal));

  useEffect(()=>{
    setTimeout(()=>scrollRef.current?.scrollTo({y:initIdx*ITEM_H,animated:false}),30);
  },[]);

  function onScrollEnd(e:any){
    const idx=Math.max(0,Math.min(items.length-1,Math.round(e.nativeEvent.contentOffset.y/ITEM_H)));
    onChange(String(items[idx]));
  }

  return(
    <View style={a.wheelWrap}>
      <View pointerEvents="none" style={a.wheelHighlight}/>
      <ScrollView ref={scrollRef} style={{height:ITEM_H*5}}
        showsVerticalScrollIndicator={false} snapToInterval={ITEM_H}
        decelerationRate="fast" onMomentumScrollEnd={onScrollEnd} onScrollEndDrag={onScrollEnd}
        contentContainerStyle={{paddingVertical:ITEM_H*2}}>
        {items.map(v=>{
          const active=curVal===v;
          const isRec=recVal===v;
          return(
            <View key={v} style={{height:ITEM_H,justifyContent:'center',alignItems:'center',flexDirection:'row',gap:8}}>
              <Text style={[a.wheelItem,active&&a.wheelItemActive]}>{v} km</Text>
              {isRec&&<Text style={a.wheelRecLabel}>권장</Text>}
            </View>
          );
        })}
      </ScrollView>
      <TouchableOpacity style={a.wheelDone} onPress={onClose}>
        <Text style={a.wheelDoneTxt}>완료</Text>
      </TouchableOpacity>
    </View>
  );
}

function AddShoeModal({onAdd,onClose}:any){
  const nameRef=useRef<any>(null);
  const nameVal=useRef('');
  const [maxKm,setMaxKm]=useState('600');
  const [recommendedKm,setRecommendedKm]=useState<string|null>(null);
  const [startKm,setStartKm]=useState('0');
  const [date,setDate]=useState(today());
  const [kmOpen,setKmOpen]=useState(false);
  function handleSelectKm(km:string){setMaxKm(km);setRecommendedKm(km);}
  function submit(){
    const n=nameVal.current;
    if(!n.trim()){Alert.alert('알림','이름을 입력해주세요');return;}
    onAdd(n.trim(),parseInt(maxKm)||600,parseFloat(startKm)||0,date);
  }
  return(
    <View style={a.modalBg}>
      <View style={a.modal}>
        <View style={a.modalHandle}/>
        <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <Text style={a.modalTitle}>러닝화 등록</Text>
          <TouchableOpacity onPress={onClose} style={{padding:4}}>
            <Ionicons name="close-circle" size={26} color={SURFACE}/>
          </TouchableOpacity>
        </View>
        <Text style={a.flabel}>이름</Text>
        <ShoeNameInput nameRef={nameRef} nameVal={nameVal} onSelectKm={handleSelectKm}/>
        <View style={a.inputGroup}>
          <View style={[a.inputRow,{alignItems:'center'}]}>
            <View>
              <Text style={a.inputLbl}>내구도 (km)</Text>
              {recommendedKm&&(
                <View style={a.recChip}>
                  <Text style={a.recChipText}>권장 {recommendedKm}km</Text>
                </View>
              )}
            </View>
            <TouchableOpacity onPress={()=>setKmOpen(true)}>
              <Text style={a.dragKmVal}>{maxKm}</Text>
            </TouchableOpacity>
          </View>
          <View style={a.inputDiv}/>
          <View style={a.inputRow}>
            <Text style={a.inputLbl}>기존 거리 (km)</Text>
            <TextInput style={[a.inputField,{width:80}]} value={startKm} onChangeText={setStartKm} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={T3}/>
          </View>
          <View style={a.inputDiv}/>
          <View style={a.inputRow}>
            <Text style={a.inputLbl}>구매일</Text>
            <TextInput style={[a.inputField,{width:120}]} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor={T3}/>
          </View>
        </View>
        {kmOpen&&<KmWheelPicker value={maxKm} onChange={setMaxKm} onClose={()=>setKmOpen(false)} recommendedKm={recommendedKm}/>}
        <View style={{flexDirection:'row',gap:10,marginTop:16}}>
          <TouchableOpacity style={a.ghostBtn} onPress={onClose}>
            <Text style={{color:T2,fontWeight:'600',fontSize:15}}>취소</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[a.accentBtn,{flex:1}]} onPress={submit}>
            <Text style={a.accentBtnText}>등록</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const a = StyleSheet.create({
  header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:20,paddingBottom:14,backgroundColor:BG,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:'rgba(255,255,255,0.06)'},
  logo:{fontSize:22,fontFamily:FH,letterSpacing:4},
  navBar:{flexDirection:'row',backgroundColor:'#0A0A0A',borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:'rgba(255,255,255,0.08)',paddingTop:6},
  navBtn:{flex:1,alignItems:'center',justifyContent:'center'},
  navLabel:{fontSize:10,color:T3,fontFamily:FP,letterSpacing:0.3},

  empty:{flex:1,alignItems:'center',justifyContent:'center',padding:40,gap:12},
  emptyTitle:{color:T1,fontSize:17,fontFamily:FP},
  emptyText:{color:T3,fontSize:14,fontFamily:FP,textAlign:'center',lineHeight:22},
  emptyAddBtn:{flexDirection:'row',alignItems:'center',backgroundColor:ACCENT,paddingHorizontal:28,paddingVertical:15,borderRadius:100,gap:8,marginTop:8},
  emptyAddBtnText:{color:'#000',fontSize:16,fontFamily:FP,letterSpacing:0.5},
  addShoeBtn:{flexDirection:'row',alignItems:'center',justifyContent:'center',borderWidth:1.5,borderColor:ACCENT+'50',borderRadius:14,paddingVertical:14,gap:8,marginTop:4},
  addShoeBtnText:{color:ACCENT,fontSize:15,fontFamily:FP,fontWeight:'600'},

  shoeCard:{backgroundColor:CARD,borderRadius:14,padding:16,marginBottom:12},
  shoeCardHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14},
  shoeName:{color:T1,fontSize:18,fontFamily:FH,letterSpacing:1.5,marginBottom:3},
  shoeMeta:{color:T3,fontSize:11,fontFamily:FP},
  badge:{paddingHorizontal:10,paddingVertical:4,borderRadius:20},
  badgeText:{fontSize:11,fontFamily:FP,fontWeight:'700'},
  barTrack:{backgroundColor:SURFACE,borderRadius:100,height:4,overflow:'hidden',marginBottom:12},
  barFill:{height:'100%',borderRadius:100},
  shoeStatsRow:{flexDirection:'row',justifyContent:'space-between',marginBottom:14},
  ssStat:{color:T3,fontSize:10,fontFamily:FP,letterSpacing:1.5,textTransform:'uppercase' as const},
  ssNum:{color:T1,fontSize:24,fontFamily:FH,fontWeight:'300'},
  runBtn:{backgroundColor:ACCENT,borderRadius:14,paddingVertical:13,alignItems:'center',flexDirection:'row',justifyContent:'center'},
  runBtnText:{color:'#000',fontSize:16,fontFamily:FP,letterSpacing:0.5},
  buyBtn:{backgroundColor:SURFACE,borderRadius:10,paddingVertical:10,alignItems:'center'},
  buyBtnText:{color:T2,fontSize:13,fontFamily:FP,fontWeight:'600'},

  formCard:{backgroundColor:CARD,borderRadius:14,padding:16,marginBottom:14},
  fcTitle:{color:T2,fontSize:10,fontFamily:FP,letterSpacing:1.5,textTransform:'uppercase' as const,marginBottom:12},
  flabel:{color:T2,fontSize:12,fontFamily:FP,fontWeight:'600',marginBottom:6,marginTop:4},
  inputGroup:{backgroundColor:SURFACE,borderRadius:14,overflow:'hidden'},
  inputRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:14,paddingVertical:13},
  inputLbl:{color:T1,fontSize:15,fontFamily:FP},
  inputField:{color:T1,fontSize:15,fontFamily:FP,textAlign:'right',padding:0,minWidth:60},
  inputDiv:{height:StyleSheet.hairlineWidth,backgroundColor:SEP,marginLeft:14},
  input:{backgroundColor:SURFACE,borderRadius:12,padding:13,color:T1,fontSize:15,fontFamily:FP,marginBottom:10},
  chip:{paddingHorizontal:14,paddingVertical:8,borderRadius:100,backgroundColor:SURFACE,marginRight:8},
  chipActive:{backgroundColor:ACCENT+'20'},
  chipText:{color:T2,fontSize:13,fontFamily:FP,fontWeight:'500'},
  recChip:{marginTop:4,paddingHorizontal:8,paddingVertical:3,borderRadius:6,backgroundColor:ACCENT+'18',alignSelf:'flex-start'},
  recChipText:{color:ACCENT,fontSize:11,fontFamily:FP,fontWeight:'600'},
  dragKmVal:{color:ACCENT,fontSize:20,fontFamily:FH,letterSpacing:1,minWidth:48,textAlign:'right'},
  wheelWrap:{backgroundColor:SURFACE,borderRadius:16,marginTop:10,overflow:'hidden'},
  wheelHighlight:{position:'absolute',top:48*2,left:16,right:16,height:48,backgroundColor:ACCENT+'18',borderRadius:10},
  wheelItem:{color:T3,fontSize:16,fontFamily:FP},
  wheelItemActive:{color:T1,fontSize:22,fontFamily:FH},
  wheelRecLabel:{color:ACCENT,fontSize:10,fontFamily:FP,fontWeight:'700',letterSpacing:0.5},
  wheelDone:{padding:14,alignItems:'center',borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:SEP},
  wheelDoneTxt:{color:ACCENT,fontSize:16,fontFamily:FP,fontWeight:'600',letterSpacing:0},
  accentBtn:{backgroundColor:ACCENT,padding:15,borderRadius:14,alignItems:'center',justifyContent:'center'},
  accentBtnText:{color:'#000',fontSize:16,fontFamily:FP,letterSpacing:0.5},
  ghostBtn:{flex:1,backgroundColor:SURFACE,borderRadius:14,alignItems:'center',justifyContent:'center',padding:15},

  secTitle:{color:T3,fontSize:10,fontFamily:FP,letterSpacing:1.5,textTransform:'uppercase' as const,marginBottom:10},
  histWrap:{backgroundColor:CARD,borderRadius:14,overflow:'hidden'},
  histItem:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingVertical:14,paddingHorizontal:16,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:SEP},
  histKm:{color:T1,fontSize:18,fontFamily:FH,letterSpacing:1},
  histMeta:{color:T3,fontSize:11,fontFamily:FP,marginTop:2},
  histShoe:{color:T2,fontSize:11,fontFamily:FP,textAlign:'right',maxWidth:130},
  gpsBadge:{backgroundColor:ACCENT+'22',paddingHorizontal:6,paddingVertical:2,borderRadius:6,borderWidth:1,borderColor:ACCENT},

  periodSel:{flexDirection:'row',backgroundColor:CARD,borderRadius:14,padding:4,marginBottom:12},
  periodBtn:{flex:1,paddingVertical:9,alignItems:'center',borderRadius:10},
  periodBtnOn:{backgroundColor:ACCENT},
  periodTxt:{color:T3,fontSize:14,fontFamily:FP,fontWeight:'600'},
  periodTxtOn:{color:'#000',fontFamily:FP,fontWeight:'700',letterSpacing:0},
  periodNav:{flexDirection:'row',alignItems:'center',backgroundColor:CARD,borderRadius:14,paddingVertical:12,paddingHorizontal:4,marginBottom:12},
  periodNavLabel:{color:T1,fontSize:14,fontFamily:FP,fontWeight:'700'},
  statGrid:{flexDirection:'row',gap:8,marginBottom:8},
  statBox:{flex:1,backgroundColor:CARD,borderRadius:14,padding:16,alignItems:'center'},
  statNum:{color:ACCENT,fontSize:32,fontFamily:FH,letterSpacing:-1},
  statLbl:{color:T3,fontSize:10,marginTop:4,fontFamily:FP,letterSpacing:1},

  modalBg:{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(0,0,0,0.75)',justifyContent:'flex-end'},
  modal:{backgroundColor:CARD,borderTopLeftRadius:24,borderTopRightRadius:24,padding:20,paddingTop:12,maxHeight:'92%'},
  modalHandle:{width:36,height:4,backgroundColor:SURFACE,borderRadius:2,alignSelf:'center',marginBottom:16},
  modalTitle:{color:T1,fontSize:18,fontFamily:FP,letterSpacing:0},

  acList:{backgroundColor:SURFACE,borderRadius:12,marginBottom:10,maxHeight:160},
  acItem:{padding:14,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:SEP},
  acName:{color:T1,fontSize:14,fontFamily:FP,fontWeight:'600'},
  acSub:{color:T3,fontSize:12,fontFamily:FP,marginTop:2},
});

const r = StyleSheet.create({
  screen:{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:BG,paddingHorizontal:24},
  topRow:{marginBottom:8},
  runningLabel:{color:ACCENT,fontSize:11,fontFamily:FP,fontWeight:'700',letterSpacing:1.5,textTransform:'uppercase' as const},
  doneLabel:{color:ACCENT,fontSize:11,fontFamily:FP,fontWeight:'700',letterSpacing:1.5,textTransform:'uppercase' as const},
  topShoe:{color:T1,fontSize:24,fontFamily:FH,letterSpacing:1.5,marginTop:2},
  gpsChip:{flexDirection:'row',alignItems:'center',marginTop:6},
  gpsText:{color:T3,fontSize:11,fontFamily:FP},
  center:{flex:1,alignItems:'center',justifyContent:'center'},
  bigKm:{color:T1,fontSize:96,fontFamily:FH,letterSpacing:-3,lineHeight:96},
  kmUnit:{color:T3,fontSize:13,fontFamily:FP,letterSpacing:4,marginTop:4},
  metrics:{flexDirection:'row',backgroundColor:CARD,borderRadius:14,marginBottom:20},
  mItem:{flex:1,alignItems:'center',paddingVertical:16},
  mVal:{color:T1,fontSize:20,fontFamily:FH,letterSpacing:0.5},
  mLbl:{color:T3,fontSize:10,marginTop:4,fontFamily:FP,letterSpacing:1.5,textTransform:'uppercase' as const},
  mSep:{width:StyleSheet.hairlineWidth,backgroundColor:SEP,marginVertical:12},
  controlRow:{flexDirection:'row',justifyContent:'center',gap:52,alignItems:'flex-start'},
  pauseBtn:{width:72,height:72,borderRadius:36,backgroundColor:SURFACE,alignItems:'center',justifyContent:'center',borderWidth:1.5,borderColor:'rgba(232,99,42,0.35)'},
  stopBtn:{width:80,height:80,borderRadius:40,backgroundColor:DANGER,alignItems:'center',justifyContent:'center'},
  stopIcon:{width:26,height:26,borderRadius:5,backgroundColor:'#fff'},
  ctrlHint:{color:T3,fontSize:10,fontFamily:FP,letterSpacing:1,marginTop:8,textTransform:'uppercase' as const,textAlign:'center'},
  progressWrap:{marginBottom:16},
  progressTrack:{backgroundColor:SURFACE,borderRadius:100,height:8,overflow:'hidden'},
  progressFill:{height:'100%',borderRadius:100,backgroundColor:ACCENT},
  progressRemain:{color:T1,fontSize:13,fontFamily:FP},
  progressGoalTxt:{color:T3,fontSize:12,fontFamily:FP},
  memoInput:{backgroundColor:SURFACE,borderRadius:14,padding:14,color:T1,fontSize:15,fontFamily:FP,marginBottom:16},
  actionRow:{flexDirection:'row',gap:12},
  discardBtn:{flex:1,backgroundColor:SURFACE,borderRadius:14,padding:16,alignItems:'center'},
  discardTxt:{color:T2,fontSize:16,fontFamily:FP,fontWeight:'600',letterSpacing:0},
  saveBtn:{flex:2,backgroundColor:ACCENT,borderRadius:14,padding:16,alignItems:'center'},
  saveTxt:{color:'#000',fontSize:16,fontFamily:FP,fontWeight:'600',letterSpacing:0},
});
