/**
 * IUIU Smart Parking — Admin Dashboard v4
 * Menu: Dashboard | Vehicle Categories | Slots & Gates | Vehicles Parked |
 *       Attendants | Pricing | Alerts | Audit Logs | System
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  lotsAPI, usersAPI, slotTypesAPI, slotsAPI, entrancesAPI, exitsAPI,
  alertsAPI, auditAPI, ticketsAPI,
} from '../api/client';
import type {
  ParkingLot, LotAnalytics, User, SlotType, ParkingSlot,
  Entrance, Exit, Alert, AuditLog, Ticket,
} from '../types';

// ── Palette ──────────────────────────────────────────────────────────────────
const C = {
  primary:'#16a34a', dark:'#14532d', darkest:'#052e16',
  light:'#f0fdf4', border:'#d1fae5', muted:'#6b7280',
  white:'#ffffff', danger:'#dc2626', warning:'#d97706',
  info:'#2563eb', text:'#111827', bg:'#f8fafc',
};

type Sec = 'dashboard'|'vehicles'|'slots'|'parked'|'attendants'|'pricing'|'alerts'|'audit'|'system';

const NAV:{id:Sec;icon:string;label:string}[] = [
  {id:'dashboard',  icon:'📊', label:'Dashboard'},
  {id:'vehicles',   icon:'🚗', label:'Vehicle Categories'},
  {id:'slots',      icon:'🅿️', label:'Slots & Gates'},
  {id:'parked',     icon:'🔍', label:'Vehicles Parked'},
  {id:'attendants', icon:'👷', label:'Attendants'},
  {id:'pricing',    icon:'💰', label:'Pricing'},
  {id:'alerts',     icon:'🔥', label:'Alerts'},
  {id:'audit',      icon:'📋', label:'Audit Logs'},
  {id:'system',     icon:'⚙️',  label:'System'},
];

const VICONS:Record<string,string> = {car:'🚗',motorcycle:'🏍️',bicycle:'🚲',van:'🚐',truck:'🚛',bus:'🚌'};
const VCOLORS:Record<string,string> = {car:'#2563eb',motorcycle:'#7c3aed',bicycle:'#059669',van:'#d97706',truck:'#dc2626',bus:'#0891b2'};
const ROLE_META:{[k:string]:{label:string;color:string;bg:string;icon:string;desc:string}} = {
  admin:             {label:'Admin',            color:'#14532d',bg:'#dcfce7',icon:'🛡️', desc:'Full system access — manage users, pricing, gates, analytics'},
  entrance_attendant:{label:'Entrance Att.',    color:'#1d4ed8',bg:'#dbeafe',icon:'🚗', desc:'Issue tickets, open entrance gate, scan plates on entry'},
  exit_attendant:    {label:'Exit Att.',        color:'#7c3aed',bg:'#ede9fe',icon:'🚪', desc:'Scan receipts, calculate fees, open exit gate after payment'},
  attendant:         {label:'Parking Att.',     color:'#b45309',bg:'#fef3c7',icon:'🅿️', desc:'Assist clients with parking, record parked vehicles'},
  entrance_display:  {label:'Entry Display',   color:'#0e7490',bg:'#cffafe',icon:'📺', desc:'Entrance screen — shows vacant count, slot map'},
  exit_display:      {label:'Exit Display',    color:'#be185d',bg:'#fce7f3',icon:'📺', desc:'Exit screen — shows payment info'},
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt  = (n:number) => `UGX ${Number(n).toLocaleString()}`;
const fmtT = (iso:string) => new Date(iso).toLocaleString('en-UG',{dateStyle:'short',timeStyle:'short'});
const fmtDur = (h:number) => { const hh=Math.floor(h); const mm=Math.round((h-hh)*60); return hh>0?`${hh}h ${mm}m`:`${mm}m`; };

// ── Base styles ───────────────────────────────────────────────────────────────
const inp:React.CSSProperties = {padding:'10px 12px',border:`1.5px solid ${C.border}`,borderRadius:10,fontSize:14,color:C.text,width:'100%',background:'#fafafa',boxSizing:'border-box'};
const btnP:React.CSSProperties = {padding:'10px 20px',background:`linear-gradient(135deg,${C.primary},${C.dark})`,color:'#fff',border:'none',borderRadius:10,fontSize:14,fontWeight:700,cursor:'pointer'};
const btnD:React.CSSProperties = {...btnP,background:C.danger};
const btnG:React.CSSProperties = {...btnP,background:'#f3f4f6',color:C.muted};
const card:React.CSSProperties = {background:C.white,borderRadius:16,padding:'20px 24px',border:`1px solid ${C.border}`,boxShadow:'0 1px 4px rgba(0,0,0,0.06)'};

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({msg,type='success'}:{msg:string;type?:'success'|'error'|'info'}) {
  const bg = type==='error'?C.danger:type==='info'?C.info:C.primary;
  return <div style={{position:'fixed',bottom:24,right:24,zIndex:9999,background:bg,color:'#fff',padding:'12px 20px',borderRadius:12,fontWeight:600,fontSize:14,boxShadow:'0 8px 24px rgba(0,0,0,.3)'}}>{msg}</div>;
}
function useToast() {
  const [msg,setMsg]=useState(''); const [tp,setTp]=useState<'success'|'error'|'info'>('success');
  const show=(m:string,t:'success'|'error'|'info'='success')=>{setMsg(m);setTp(t);setTimeout(()=>setMsg(''),3500);};
  return {toastEl:msg?<Toast msg={msg} type={tp}/>:null, show};
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({icon,label,value,sub,color=C.primary}:{icon:string;label:string;value:string|number;sub?:string;color?:string}) {
  return (
    <div style={{...card,display:'flex',flexDirection:'column',gap:6}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span style={{fontSize:28}}>{icon}</span>
        <div style={{background:color+'18',borderRadius:8,padding:'4px 10px',fontSize:10,fontWeight:700,color}}>LIVE</div>
      </div>
      <div style={{fontSize:26,fontWeight:800,color:C.text}}>{value}</div>
      <div style={{fontSize:12,fontWeight:600,color:C.muted}}>{label}</div>
      {sub&&<div style={{fontSize:11,color:C.muted}}>{sub}</div>}
    </div>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────────
function Badge({label,color='#16a34a',bg='#dcfce7'}:{label:string;color?:string;bg?:string}) {
  return <span style={{display:'inline-block',padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:700,color,background:bg}}>{label}</span>;
}

// ── Loader ────────────────────────────────────────────────────────────────────
function Loader() {
  return <div style={{textAlign:'center',padding:40,color:C.muted}}><div style={{width:36,height:36,border:`3px solid ${C.border}`,borderTopColor:C.primary,borderRadius:'50%',animation:'spin .8s linear infinite',margin:'0 auto 12px'}}/>Loading…</div>;
}

// ── Section Header ────────────────────────────────────────────────────────────
function SectionHeader({title,sub,action}:{title:string;sub?:string;action?:React.ReactNode}) {
  return (
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:24}}>
      <div>
        <h2 style={{fontSize:22,fontWeight:800,color:C.text,margin:0}}>{title}</h2>
        {sub&&<p style={{fontSize:13,color:C.muted,margin:'4px 0 0'}}>{sub}</p>}
      </div>
      {action&&<div>{action}</div>}
    </div>
  );
}

// ── SVG Pie Chart ─────────────────────────────────────────────────────────────
function PieChart({data}:{data:Record<string,number>}) {
  const total = Object.values(data).reduce((a,b)=>a+b,0)||1;
  let cumAngle = -Math.PI/2;
  const slices = Object.entries(data).map(([k,v])=>{
    const frac=v/total; const start=cumAngle; cumAngle+=frac*2*Math.PI;
    return {key:k,frac,start,end:cumAngle,color:VCOLORS[k]||'#9ca3af'};
  });
  const polar=(a:number,r=80)=>[100+r*Math.cos(a),100+r*Math.sin(a)];
  return (
    <div style={{display:'flex',gap:20,alignItems:'center',flexWrap:'wrap'}}>
      <svg width="200" height="200" viewBox="0 0 200 200">
        {slices.map(s=>{
          const [sx,sy]=polar(s.start); const [ex,ey]=polar(s.end);
          const large=s.frac>.5?1:0;
          return s.frac<0.001?null:(
            <path key={s.key}
              d={`M100,100 L${sx},${sy} A80,80 0 ${large},1 ${ex},${ey} Z`}
              fill={s.color} stroke="#fff" strokeWidth={2}/>
          );
        })}
        <circle cx="100" cy="100" r="38" fill="#fff"/>
        <text x="100" y="97" textAnchor="middle" fontSize="12" fontWeight="700" fill={C.text}>Vehicles</text>
        <text x="100" y="113" textAnchor="middle" fontSize="18" fontWeight="800" fill={C.primary}>{total}</text>
      </svg>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {slices.map(s=>(
          <div key={s.key} style={{display:'flex',alignItems:'center',gap:8}}>
            <div style={{width:12,height:12,borderRadius:3,background:s.color,flexShrink:0}}/>
            <span style={{fontSize:13,color:C.text,textTransform:'capitalize'}}>{VICONS[s.key]||''} {s.key}</span>
            <span style={{fontSize:13,fontWeight:700,color:s.color,marginLeft:'auto',paddingLeft:12}}>{data[s.key]}</span>
            <span style={{fontSize:11,color:C.muted}}>({(s.frac*100).toFixed(1)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── SVG Bar Chart (peak hours) ────────────────────────────────────────────────
function BarChart({hours}:{hours:number[]}) {
  const max=Math.max(...hours,1);
  const H=120; const W=500; const bw=W/24;
  const now=new Date().getHours();
  return (
    <div style={{overflowX:'auto'}}>
      <svg width={W} height={H+30} style={{minWidth:W}}>
        {hours.map((v,i)=>{
          const bh=(v/max)*H; const x=i*bw; const y=H-bh;
          const isNow=i===now;
          return (
            <g key={i}>
              <rect x={x+1} y={y} width={bw-2} height={bh}
                fill={isNow?C.primary:C.border} rx={3}/>
              {i%3===0&&<text x={x+bw/2} y={H+18} textAnchor="middle" fontSize="10" fill={C.muted}>{i}h</text>}
              {v>0&&<text x={x+bw/2} y={y-4} textAnchor="middle" fontSize="9" fill={C.dark} fontWeight="700">{v}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Slot Grid ─────────────────────────────────────────────────────────────────
function SlotGrid({slots}:{slots:ParkingSlot[]}) {
  const STATUS_COLOR:Record<string,string> = {vacant:'#dcfce7',occupied:'#fee2e2',reserved:'#fef3c7',maintenance:'#f3f4f6'};
  const STATUS_TEXT:Record<string,string>  = {vacant:C.primary,occupied:C.danger,reserved:C.warning,maintenance:C.muted};
  return (
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(110px,1fr))',gap:10}}>
      {slots.map(s=>(
        <div key={s.id} style={{background:STATUS_COLOR[s.status]||'#f3f4f6',borderRadius:12,padding:'12px 10px',textAlign:'center',border:`2px solid ${STATUS_TEXT[s.status]||C.muted}30`}}>
          <div style={{fontSize:20,marginBottom:4}}>{s.status==='occupied'?'🔴':s.status==='reserved'?'🟡':s.status==='maintenance'?'🔧':'🟢'}</div>
          <div style={{fontWeight:800,fontSize:15,color:C.text}}>{s.slot_number}</div>
          <div style={{fontSize:10,color:STATUS_TEXT[s.status]||C.muted,fontWeight:600,textTransform:'uppercase',marginTop:2}}>{s.status}</div>
          {s.license_plate&&<div style={{fontSize:10,color:C.text,marginTop:4,background:'#fff',borderRadius:6,padding:'2px 6px'}}>{s.license_plate}</div>}
        </div>
      ))}
      {slots.length===0&&<div style={{gridColumn:'1/-1',textAlign:'center',color:C.muted,padding:24}}>No slots configured</div>}
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function Modal({title,onClose,children,width=480}:{title:string;onClose:()=>void;children:React.ReactNode;width?:number}) {
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <div style={{background:'#fff',borderRadius:20,padding:28,width:'100%',maxWidth:width,maxHeight:'90vh',overflowY:'auto',boxShadow:'0 24px 64px rgba(0,0,0,.3)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <h3 style={{margin:0,fontSize:18,fontWeight:800,color:C.text}}>{title}</h3>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:22,cursor:'pointer',color:C.muted}}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({label,children}:{label:string;children:React.ReactNode}) {
  return <div style={{marginBottom:14}}><label style={{display:'block',fontSize:12,fontWeight:700,color:C.text,marginBottom:6,textTransform:'uppercase',letterSpacing:.5}}>{label}</label>{children}</div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATE LOT PROMPT (shown when no lot exists yet)
// ─────────────────────────────────────────────────────────────────────────────
function CreateLotPrompt({onCreated,showToast}:{onCreated:(lot:ParkingLot)=>void;showToast:(m:string,t?:'success'|'error'|'info')=>void}) {
  const [form,setForm]=useState({name:'',location:''});
  const [saving,setSaving]=useState(false);

  const create=async()=>{
    if(!form.name.trim()||!form.location.trim()){showToast('Name and location are required','error');return;}
    setSaving(true);
    try{
      const {data}=await lotsAPI.create({name:form.name,location:form.location,is_active:true});
      showToast('Parking lot created!');
      onCreated(data);
    }catch{showToast('Failed to create lot','error');}
    finally{setSaving(false);}
  };

  return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'60vh'}}>
      <div style={{...card,maxWidth:480,width:'100%',textAlign:'center',padding:'40px 36px'}}>
        <div style={{fontSize:52,marginBottom:16}}>🏢</div>
        <h2 style={{fontSize:20,fontWeight:800,color:C.text,marginBottom:8}}>Create Your Parking Lot</h2>
        <p style={{fontSize:13,color:C.muted,marginBottom:28}}>
          No parking lot found. Create one to get started — you can add slots, gates and pricing after.
        </p>
        <div style={{textAlign:'left',marginBottom:16}}>
          <Field label="Lot Name">
            <input style={inp} value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))}
              placeholder="e.g. IUIU Main Campus Parking" autoFocus/>
          </Field>
          <Field label="Location / Address">
            <input style={inp} value={form.location} onChange={e=>setForm(p=>({...p,location:e.target.value}))}
              placeholder="e.g. Kampala Campus, Gate A"/>
          </Field>
        </div>
        <button onClick={create} disabled={saving}
          style={{...btnP,width:'100%',padding:'14px',fontSize:15,opacity:saving?0.7:1}}>
          {saving?'Creating…':'🚀 Create Parking Lot'}
        </button>
        <p style={{fontSize:11,color:C.muted,marginTop:16}}>
          You can edit the name, location, and fees later from the System section.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. DASHBOARD SECTION
// ─────────────────────────────────────────────────────────────────────────────
function DashboardSection({lot}:{lot:ParkingLot}) {
  const [analytics,setAnalytics]=useState<LotAnalytics|null>(null);
  const [tickets,setTickets]=useState<Ticket[]>([]);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    Promise.all([
      lotsAPI.analytics(lot.id),
      ticketsAPI.list({lot:lot.id,status:'active',page_size:'100'}),
    ]).then(([a,t])=>{
      setAnalytics(a.data);
      setTickets(Array.isArray(t.data)?t.data:(t.data.results||[]));
    }).finally(()=>setLoading(false));
  },[lot.id]);

  // Also get today's tickets (both active and paid)
  const [todayTickets,setTodayTickets]=useState<Ticket[]>([]);
  useEffect(()=>{
    ticketsAPI.list({lot:lot.id,page_size:'200'}).then(r=>{
      const all:Ticket[]=Array.isArray(r.data)?r.data:(r.data.results||[]);
      const today=new Date().toDateString();
      setTodayTickets(all.filter(t=>new Date(t.entry_time).toDateString()===today));
    });
  },[lot.id]);

  if(loading) return <Loader/>;
  const a=analytics;

  return (
    <div>
      <SectionHeader title="📊 Dashboard" sub={`Live overview — ${lot.name}`}/>

      {/* KPI Cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:16,marginBottom:28}}>
        <StatCard icon="🚗" label="Vehicles Today"  value={a?.tickets_today??0}/>
        <StatCard icon="💰" label="Revenue Today"   value={fmt(a?.revenue_today??0)} color={C.dark}/>
        <StatCard icon="🟢" label="Available Slots" value={a?.vacant??0}  color={C.primary}/>
        <StatCard icon="🔴" label="Occupied Slots"  value={a?.occupied??0} color={C.danger}/>
        <StatCard icon="🎫" label="Active Tickets"  value={a?.active_tickets??0} color={C.info}/>
        <StatCard icon="📅" label="Revenue (Week)"  value={fmt(a?.revenue_week??0)} color={C.warning}/>
      </div>

      {/* Charts row */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,marginBottom:28}}>
        <div style={card}>
          <div style={{fontWeight:700,fontSize:15,color:C.text,marginBottom:16}}>🥧 Vehicle Type Distribution</div>
          {a?.by_vehicle_type&&Object.keys(a.by_vehicle_type).length>0
            ? <PieChart data={a.by_vehicle_type}/>
            : <div style={{color:C.muted,textAlign:'center',padding:40}}>No data yet</div>}
        </div>
        <div style={card}>
          <div style={{fontWeight:700,fontSize:15,color:C.text,marginBottom:16}}>📈 Peak Hours (vehicles/hour)</div>
          {a?.peak_hours ? <BarChart hours={a.peak_hours}/> : <div style={{color:C.muted,textAlign:'center',padding:40}}>No data yet</div>}
          <div style={{fontSize:11,color:C.muted,marginTop:8}}>Green bar = current hour</div>
        </div>
      </div>

      {/* Today's Vehicles Table */}
      <div style={card}>
        <div style={{fontWeight:700,fontSize:15,color:C.text,marginBottom:16}}>🚘 Vehicles Entered Today ({todayTickets.length})</div>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead>
              <tr style={{background:C.light}}>
                {['Type','License Plate','Entry Time','Hours Spent','Status','Slot'].map(h=>(
                  <th key={h} style={{padding:'10px 12px',textAlign:'left',fontWeight:700,color:C.dark,fontSize:12,textTransform:'uppercase',letterSpacing:.5}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {todayTickets.length===0?(
                <tr><td colSpan={6} style={{textAlign:'center',padding:24,color:C.muted}}>No vehicles entered today</td></tr>
              ):todayTickets.map((t,i)=>(
                <tr key={t.id} style={{background:i%2?'#fafafa':'#fff',borderBottom:`1px solid ${C.border}`}}>
                  <td style={{padding:'10px 12px'}}>{VICONS[t.vehicle_type]||'🚗'} <span style={{textTransform:'capitalize'}}>{t.vehicle_type}</span></td>
                  <td style={{padding:'10px 12px',fontWeight:700,letterSpacing:1}}>{t.license_plate||'—'}</td>
                  <td style={{padding:'10px 12px',color:C.muted}}>{fmtT(t.entry_time)}</td>
                  <td style={{padding:'10px 12px'}}>{fmtDur(t.duration_hours)}</td>
                  <td style={{padding:'10px 12px'}}>
                    {t.status==='active'
                      ?<Badge label="Still Inside"  color={C.primary} bg="#dcfce7"/>
                      :t.status==='paid'
                      ?<Badge label="Left"          color="#1d4ed8"   bg="#dbeafe"/>
                      :<Badge label={t.status}      color={C.muted}   bg="#f3f4f6"/>}
                  </td>
                  <td style={{padding:'10px 12px'}}>{t.slot_number||'—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. VEHICLE CATEGORIES SECTION
// ─────────────────────────────────────────────────────────────────────────────
function VehiclesSection({lot}:{lot:ParkingLot}) {
  const [tickets,setTickets]=useState<Ticket[]>([]);
  const [selected,setSelected]=useState<string>('');
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    ticketsAPI.list({lot:lot.id,page_size:'500'}).then(r=>{
      setTickets(Array.isArray(r.data)?r.data:(r.data.results||[]));
    }).finally(()=>setLoading(false));
  },[lot.id]);

  const today=new Date().toDateString();
  const todayT=tickets.filter(t=>new Date(t.entry_time).toDateString()===today);
  const types=['car','motorcycle','bicycle','van','truck','bus'];
  const countByType=(type:string)=>todayT.filter(t=>t.vehicle_type===type);
  const filtered=selected?todayT.filter(t=>t.vehicle_type===selected):todayT;

  if(loading) return <Loader/>;
  return (
    <div>
      <SectionHeader title="🚗 Vehicle Categories" sub="Types that entered today — counts and plates"/>

      {/* Category cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:14,marginBottom:28}}>
        {types.map(type=>{
          const list=countByType(type);
          const isActive=selected===type;
          return (
            <div key={type} onClick={()=>setSelected(isActive?'':type)}
              style={{...card,cursor:'pointer',borderColor:isActive?(VCOLORS[type]||C.primary):C.border,borderWidth:isActive?2:1,transition:'all .15s',userSelect:'none'}}>
              <div style={{fontSize:32,textAlign:'center',marginBottom:8}}>{VICONS[type]||'🚗'}</div>
              <div style={{fontSize:28,fontWeight:800,textAlign:'center',color:VCOLORS[type]||C.text}}>{list.length}</div>
              <div style={{fontSize:12,fontWeight:600,textAlign:'center',color:C.muted,textTransform:'capitalize',marginTop:4}}>{type}</div>
              <div style={{fontSize:10,textAlign:'center',color:C.muted}}>{list.filter(t=>t.status==='active').length} inside</div>
            </div>
          );
        })}
      </div>

      {/* Plate list */}
      <div style={card}>
        <div style={{fontWeight:700,fontSize:15,color:C.text,marginBottom:16}}>
          {selected?`${VICONS[selected]} ${selected.charAt(0).toUpperCase()+selected.slice(1)} vehicles today (${filtered.length})`:`All vehicles today (${filtered.length})`}
          {selected&&<button onClick={()=>setSelected('')} style={{...btnG,padding:'4px 12px',fontSize:12,marginLeft:12}}>Clear filter</button>}
        </div>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead>
              <tr style={{background:C.light}}>
                {['#','Type','License Plate','Entry Time','Exit Time','Duration','Status','Attendant'].map(h=>(
                  <th key={h} style={{padding:'10px 12px',textAlign:'left',fontWeight:700,color:C.dark,fontSize:11,textTransform:'uppercase'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length===0?(
                <tr><td colSpan={8} style={{textAlign:'center',padding:24,color:C.muted}}>No vehicles</td></tr>
              ):filtered.map((t,i)=>(
                <tr key={t.id} style={{background:i%2?'#fafafa':'#fff',borderBottom:`1px solid ${C.border}`}}>
                  <td style={{padding:'10px 12px',color:C.muted}}>{i+1}</td>
                  <td style={{padding:'10px 12px'}}>{VICONS[t.vehicle_type]} {t.vehicle_type}</td>
                  <td style={{padding:'10px 12px',fontWeight:700,letterSpacing:1,color:VCOLORS[t.vehicle_type]||C.text}}>{t.license_plate||'—'}</td>
                  <td style={{padding:'10px 12px',color:C.muted,fontSize:12}}>{fmtT(t.entry_time)}</td>
                  <td style={{padding:'10px 12px',color:C.muted,fontSize:12}}>{t.exit_time?fmtT(t.exit_time):'—'}</td>
                  <td style={{padding:'10px 12px'}}>{fmtDur(t.duration_hours)}</td>
                  <td style={{padding:'10px 12px'}}>
                    <Badge label={t.status==='active'?'Inside':t.status}
                      color={t.status==='active'?C.primary:t.status==='paid'?C.info:C.muted}
                      bg={t.status==='active'?'#dcfce7':t.status==='paid'?'#dbeafe':'#f3f4f6'}/>
                  </td>
                  <td style={{padding:'10px 12px',color:C.muted,fontSize:12}}>{t.attendant_name||'—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. SLOTS & GATES SECTION
// ─────────────────────────────────────────────────────────────────────────────
function SlotsSection({lot,showToast}:{lot:ParkingLot;showToast:(m:string,t?:'success'|'error'|'info')=>void}) {
  const [slots,setSlots]=useState<ParkingSlot[]>([]);
  const [entrances,setEntrances]=useState<Entrance[]>([]);
  const [exits,setExits]=useState<Exit[]>([]);
  const [slotTypes,setSlotTypes]=useState<SlotType[]>([]);
  const [loading,setLoading]=useState(true);
  const [showSlotForm,setShowSlotForm]=useState(false);
  const [showEntForm,setShowEntForm]=useState(false);
  const [showExitForm,setShowExitForm]=useState(false);
  const [slotForm,setSlotForm]=useState({slot_number:'',sensor_id:'',slot_type:''});
  const [entForm,setEntForm]=useState({name:'',sensor_id:'',camera_ip:'',servo_channel:'0'});
  const [exitForm,setExitForm]=useState({name:'',sensor_id:'',servo_channel:'0'});

  const load=useCallback(()=>{
    Promise.all([
      slotsAPI.list({lot:lot.id}),
      entrancesAPI.list(lot.id),
      exitsAPI.list(lot.id),
      slotTypesAPI.list(),
    ]).then(([s,e,x,st])=>{
      setSlots(Array.isArray(s.data)?s.data:(s.data.results||[]));
      setEntrances(Array.isArray(e.data)?e.data:(e.data.results||[]));
      setExits(Array.isArray(x.data)?x.data:(x.data.results||[]));
      setSlotTypes(Array.isArray(st.data)?st.data:(st.data.results||[]));
    }).finally(()=>setLoading(false));
  },[lot.id]);

  useEffect(()=>{load();},[load]);

  const createSlot=async()=>{
    try{
      await slotsAPI.create({...slotForm,lot:lot.id,slot_type:slotForm.slot_type?Number(slotForm.slot_type):undefined});
      showToast('Slot created');setShowSlotForm(false);setSlotForm({slot_number:'',sensor_id:'',slot_type:''});load();
    }catch{showToast('Failed to create slot','error');}
  };
  const deleteSlot=async(id:string)=>{
    if(!confirm('Delete this slot?'))return;
    try{await slotsAPI.delete(id);showToast('Slot deleted');load();}catch{showToast('Failed','error');}
  };
  const createEntrance=async()=>{
    try{
      await entrancesAPI.create({...entForm,lot:lot.id,servo_channel:Number(entForm.servo_channel)});
      showToast('Entrance gate created');setShowEntForm(false);setEntForm({name:'',sensor_id:'',camera_ip:'',servo_channel:'0'});load();
    }catch{showToast('Failed','error');}
  };
  const createExit=async()=>{
    try{
      await exitsAPI.create({...exitForm,lot:lot.id,servo_channel:Number(exitForm.servo_channel)});
      showToast('Exit gate created');setShowExitForm(false);setExitForm({name:'',sensor_id:'',servo_channel:'0'});load();
    }catch{showToast('Failed','error');}
  };
  const openGate=(type:'entrance'|'exit',id:string)=>{
    const fn=type==='entrance'?entrancesAPI.openGate:exitsAPI.openGate;
    fn(id).then(()=>showToast(`Gate opened`)).catch(()=>showToast('Gate error','error'));
  };

  if(loading)return <Loader/>;
  return (
    <div>
      <SectionHeader title="🅿️ Slots & Gates" sub="Create and monitor parking slots, entrance and exit gates"/>

      {/* Slot grid visual */}
      <div style={{...card,marginBottom:20}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <div style={{fontWeight:700,fontSize:15,color:C.text}}>Parking Slot Map ({slots.length} slots)</div>
          <div style={{display:'flex',gap:10}}>
            <span style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:C.muted}}><span style={{width:12,height:12,borderRadius:3,background:'#dcfce7',display:'inline-block'}}/>Vacant</span>
            <span style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:C.muted}}><span style={{width:12,height:12,borderRadius:3,background:'#fee2e2',display:'inline-block'}}/>Occupied</span>
            <span style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:C.muted}}><span style={{width:12,height:12,borderRadius:3,background:'#fef3c7',display:'inline-block'}}/>Reserved</span>
          </div>
        </div>
        <SlotGrid slots={slots}/>
      </div>

      {/* Create Slot */}
      <div style={{...card,marginBottom:20}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <div style={{fontWeight:700,fontSize:15,color:C.text}}>Parking Slots ({slots.length})</div>
          <button onClick={()=>setShowSlotForm(true)} style={btnP}>+ New Slot</button>
        </div>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
          <thead><tr style={{background:C.light}}>
            {['Slot','Type','Status','Sensor ID','Plate','Action'].map(h=>(
              <th key={h} style={{padding:'10px 12px',textAlign:'left',fontWeight:700,color:C.dark,fontSize:11,textTransform:'uppercase'}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {slots.length===0?<tr><td colSpan={6} style={{textAlign:'center',padding:20,color:C.muted}}>No slots yet</td></tr>
            :slots.map((s,i)=>(
              <tr key={s.id} style={{background:i%2?'#fafafa':'#fff',borderBottom:`1px solid ${C.border}`}}>
                <td style={{padding:'10px 12px',fontWeight:700}}>{s.slot_number}</td>
                <td style={{padding:'10px 12px',fontSize:12,color:C.muted}}>{s.slot_type_detail?.name||'—'}</td>
                <td style={{padding:'10px 12px'}}>
                  <Badge label={s.status}
                    color={s.status==='vacant'?C.primary:s.status==='occupied'?C.danger:C.warning}
                    bg={s.status==='vacant'?'#dcfce7':s.status==='occupied'?'#fee2e2':'#fef3c7'}/>
                </td>
                <td style={{padding:'10px 12px',fontSize:12,color:C.muted}}>{s.sensor_id||'—'}</td>
                <td style={{padding:'10px 12px',fontWeight:600}}>{s.license_plate||'—'}</td>
                <td style={{padding:'10px 12px'}}>
                  <button onClick={()=>deleteSlot(s.id)} style={{...btnD,padding:'5px 12px',fontSize:12}}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Entrance Gates */}
      <div style={{...card,marginBottom:20}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <div style={{fontWeight:700,fontSize:15,color:C.text}}>🚗 Entrance Gates ({entrances.length})</div>
          <button onClick={()=>setShowEntForm(true)} style={btnP}>+ New Entrance</button>
        </div>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
          <thead><tr style={{background:C.light}}>
            {['Name','Sensor ID','Camera IP','Status','Actions'].map(h=>(
              <th key={h} style={{padding:'10px 12px',textAlign:'left',fontWeight:700,color:C.dark,fontSize:11,textTransform:'uppercase'}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {entrances.length===0?<tr><td colSpan={5} style={{textAlign:'center',padding:20,color:C.muted}}>No entrances yet</td></tr>
            :entrances.map((e,i)=>(
              <tr key={e.id} style={{background:i%2?'#fafafa':'#fff',borderBottom:`1px solid ${C.border}`}}>
                <td style={{padding:'10px 12px',fontWeight:700}}>{e.name}</td>
                <td style={{padding:'10px 12px',fontSize:12,color:C.muted}}>{e.sensor_id||'—'}</td>
                <td style={{padding:'10px 12px',fontSize:12,color:C.muted}}>{e.camera_ip||'—'}</td>
                <td style={{padding:'10px 12px'}}><Badge label={e.is_active?'Active':'Inactive'} color={e.is_active?C.primary:C.muted} bg={e.is_active?'#dcfce7':'#f3f4f6'}/></td>
                <td style={{padding:'10px 12px',display:'flex',gap:8}}>
                  <button onClick={()=>openGate('entrance',e.id)} style={{...btnP,padding:'5px 14px',fontSize:12,background:'#2563eb'}}>🔓 Open</button>
                  <button onClick={async()=>{if(!confirm('Delete?'))return;await entrancesAPI.delete(e.id);showToast('Deleted');load();}} style={{...btnD,padding:'5px 12px',fontSize:12}}>Del</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Exit Gates */}
      <div style={card}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <div style={{fontWeight:700,fontSize:15,color:C.text}}>🚪 Exit Gates ({exits.length})</div>
          <button onClick={()=>setShowExitForm(true)} style={btnP}>+ New Exit</button>
        </div>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
          <thead><tr style={{background:C.light}}>
            {['Name','Sensor ID','Status','Actions'].map(h=>(
              <th key={h} style={{padding:'10px 12px',textAlign:'left',fontWeight:700,color:C.dark,fontSize:11,textTransform:'uppercase'}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {exits.length===0?<tr><td colSpan={4} style={{textAlign:'center',padding:20,color:C.muted}}>No exit gates yet</td></tr>
            :exits.map((x,i)=>(
              <tr key={x.id} style={{background:i%2?'#fafafa':'#fff',borderBottom:`1px solid ${C.border}`}}>
                <td style={{padding:'10px 12px',fontWeight:700}}>{x.name}</td>
                <td style={{padding:'10px 12px',fontSize:12,color:C.muted}}>{x.sensor_id||'—'}</td>
                <td style={{padding:'10px 12px'}}><Badge label={x.is_active?'Active':'Inactive'} color={x.is_active?C.primary:C.muted} bg={x.is_active?'#dcfce7':'#f3f4f6'}/></td>
                <td style={{padding:'10px 12px',display:'flex',gap:8}}>
                  <button onClick={()=>openGate('exit',x.id)} style={{...btnP,padding:'5px 14px',fontSize:12,background:'#7c3aed'}}>🔓 Open</button>
                  <button onClick={async()=>{if(!confirm('Delete?'))return;await exitsAPI.delete(x.id);showToast('Deleted');load();}} style={{...btnD,padding:'5px 12px',fontSize:12}}>Del</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      {showSlotForm&&(
        <Modal title="Create Parking Slot" onClose={()=>setShowSlotForm(false)}>
          <Field label="Slot Number (e.g. L1, R3)"><input style={inp} value={slotForm.slot_number} onChange={e=>setSlotForm(p=>({...p,slot_number:e.target.value}))} placeholder="L1"/></Field>
          <Field label="Slot Type">
            <select style={inp} value={slotForm.slot_type} onChange={e=>setSlotForm(p=>({...p,slot_type:e.target.value}))}>
              <option value="">— None —</option>
              {slotTypes.map(st=><option key={st.id} value={st.id}>{st.name}</option>)}
            </select>
          </Field>
          <Field label="Sensor ID (optional)"><input style={inp} value={slotForm.sensor_id} onChange={e=>setSlotForm(p=>({...p,sensor_id:e.target.value}))} placeholder="sensor-01"/></Field>
          <div style={{display:'flex',gap:10,marginTop:16}}>
            <button onClick={createSlot} style={btnP}>Create Slot</button>
            <button onClick={()=>setShowSlotForm(false)} style={btnG}>Cancel</button>
          </div>
        </Modal>
      )}
      {showEntForm&&(
        <Modal title="Create Entrance Gate" onClose={()=>setShowEntForm(false)}>
          <Field label="Gate Name"><input style={inp} value={entForm.name} onChange={e=>setEntForm(p=>({...p,name:e.target.value}))} placeholder="Main Entrance"/></Field>
          <Field label="Sensor ID"><input style={inp} value={entForm.sensor_id} onChange={e=>setEntForm(p=>({...p,sensor_id:e.target.value}))} placeholder="entrance-01"/></Field>
          <Field label="Camera IP (optional)"><input style={inp} value={entForm.camera_ip} onChange={e=>setEntForm(p=>({...p,camera_ip:e.target.value}))} placeholder="192.168.1.10"/></Field>
          <Field label="Servo Channel"><input style={{...inp,width:'auto'}} type="number" value={entForm.servo_channel} onChange={e=>setEntForm(p=>({...p,servo_channel:e.target.value}))}/></Field>
          <div style={{display:'flex',gap:10,marginTop:16}}>
            <button onClick={createEntrance} style={btnP}>Create Gate</button>
            <button onClick={()=>setShowEntForm(false)} style={btnG}>Cancel</button>
          </div>
        </Modal>
      )}
      {showExitForm&&(
        <Modal title="Create Exit Gate" onClose={()=>setShowExitForm(false)}>
          <Field label="Gate Name"><input style={inp} value={exitForm.name} onChange={e=>setExitForm(p=>({...p,name:e.target.value}))} placeholder="Main Exit"/></Field>
          <Field label="Sensor ID"><input style={inp} value={exitForm.sensor_id} onChange={e=>setExitForm(p=>({...p,sensor_id:e.target.value}))} placeholder="exit-01"/></Field>
          <Field label="Servo Channel"><input style={{...inp,width:'auto'}} type="number" value={exitForm.servo_channel} onChange={e=>setExitForm(p=>({...p,servo_channel:e.target.value}))}/></Field>
          <div style={{display:'flex',gap:10,marginTop:16}}>
            <button onClick={createExit} style={btnP}>Create Gate</button>
            <button onClick={()=>setShowExitForm(false)} style={btnG}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. VEHICLES PARKED SECTION
// ─────────────────────────────────────────────────────────────────────────────
function ParkedSection({lot}:{lot:ParkingLot}) {
  const [active,setActive]=useState<Ticket[]>([]);
  const [history,setHistory]=useState<Ticket[]>([]);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    const today=new Date().toISOString().split('T')[0];
    Promise.all([
      ticketsAPI.list({lot:lot.id,status:'active',page_size:'200'}),
      ticketsAPI.list({lot:lot.id,status:'paid',page_size:'200'}),
    ]).then(([a,h])=>{
      setActive(Array.isArray(a.data)?a.data:(a.data.results||[]));
      const paid:Ticket[]=Array.isArray(h.data)?h.data:(h.data.results||[]);
      setHistory(paid.filter(t=>t.exit_time&&t.exit_time.startsWith(today)));
    }).finally(()=>setLoading(false));
  },[lot.id]);

  if(loading)return <Loader/>;
  return (
    <div>
      <SectionHeader title="🔍 Vehicles Parked" sub="Active vehicles inside and those who left today"/>

      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16,marginBottom:24}}>
        <StatCard icon="🔴" label="Currently Inside"  value={active.length} color={C.danger}/>
        <StatCard icon="✅" label="Left Today"         value={history.length} color={C.primary}/>
        <StatCard icon="💰" label="Revenue Collected" value={fmt(history.reduce((s,t)=>s+t.amount_charged,0))} color={C.dark}/>
      </div>

      {/* Active (currently parked) */}
      <div style={{...card,marginBottom:20}}>
        <div style={{fontWeight:700,fontSize:15,color:C.text,marginBottom:16}}>🚗 Currently Inside ({active.length})</div>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead><tr style={{background:C.light}}>
              {['Type','License Plate','Slot','Entry Time','Duration','Parked By','Ticket #'].map(h=>(
                <th key={h} style={{padding:'10px 12px',textAlign:'left',fontWeight:700,color:C.dark,fontSize:11,textTransform:'uppercase'}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {active.length===0?<tr><td colSpan={7} style={{textAlign:'center',padding:24,color:C.muted}}>No vehicles currently parked</td></tr>
              :active.map((t,i)=>(
                <tr key={t.id} style={{background:i%2?'#fafafa':'#fff',borderBottom:`1px solid ${C.border}`}}>
                  <td style={{padding:'10px 12px'}}>{VICONS[t.vehicle_type]} <span style={{textTransform:'capitalize'}}>{t.vehicle_type}</span></td>
                  <td style={{padding:'10px 12px',fontWeight:700,color:VCOLORS[t.vehicle_type]||C.text,letterSpacing:1}}>{t.license_plate||'—'}</td>
                  <td style={{padding:'10px 12px'}}>{t.slot_number||'—'}</td>
                  <td style={{padding:'10px 12px',fontSize:12,color:C.muted}}>{fmtT(t.entry_time)}</td>
                  <td style={{padding:'10px 12px',fontWeight:600,color:C.primary}}>{fmtDur(t.duration_hours)}</td>
                  <td style={{padding:'10px 12px',fontSize:12,color:C.muted}}>{t.attendant_name||'—'}</td>
                  <td style={{padding:'10px 12px',fontSize:11,color:C.muted}}>{t.ticket_number}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* History (left today) */}
      <div style={card}>
        <div style={{fontWeight:700,fontSize:15,color:C.text,marginBottom:16}}>📤 Left Today ({history.length})</div>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead><tr style={{background:C.light}}>
              {['Type','License Plate','Entry','Exit','Duration','Fee Paid','Payment','Attendant'].map(h=>(
                <th key={h} style={{padding:'10px 12px',textAlign:'left',fontWeight:700,color:C.dark,fontSize:11,textTransform:'uppercase'}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {history.length===0?<tr><td colSpan={8} style={{textAlign:'center',padding:24,color:C.muted}}>No vehicles left yet today</td></tr>
              :history.map((t,i)=>(
                <tr key={t.id} style={{background:i%2?'#fafafa':'#fff',borderBottom:`1px solid ${C.border}`}}>
                  <td style={{padding:'10px 12px'}}>{VICONS[t.vehicle_type]} {t.vehicle_type}</td>
                  <td style={{padding:'10px 12px',fontWeight:700,letterSpacing:1}}>{t.license_plate||'—'}</td>
                  <td style={{padding:'10px 12px',fontSize:12,color:C.muted}}>{fmtT(t.entry_time)}</td>
                  <td style={{padding:'10px 12px',fontSize:12,color:C.muted}}>{t.exit_time?fmtT(t.exit_time):'—'}</td>
                  <td style={{padding:'10px 12px'}}>{fmtDur(t.duration_hours)}</td>
                  <td style={{padding:'10px 12px',fontWeight:700,color:C.dark}}>{fmt(t.amount_charged)}</td>
                  <td style={{padding:'10px 12px',fontSize:12,textTransform:'capitalize'}}>{t.payment_method}</td>
                  <td style={{padding:'10px 12px',fontSize:12,color:C.muted}}>{t.attendant_name||'—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. ATTENDANTS SECTION
// ─────────────────────────────────────────────────────────────────────────────
function AttendantsSection({showToast}:{showToast:(m:string,t?:'success'|'error'|'info')=>void}) {
  const [users,setUsers]=useState<User[]>([]);
  const [loading,setLoading]=useState(true);
  const [showForm,setShowForm]=useState(false);
  const [editUser,setEditUser]=useState<User|null>(null);
  const [form,setForm]=useState({username:'',first_name:'',last_name:'',email:'',phone:'',role:'attendant',password:''});

  const load=()=>{usersAPI.list().then(r=>{setUsers(Array.isArray(r.data)?r.data:(r.data.results||[]));}).finally(()=>setLoading(false));};
  useEffect(()=>{load();},[]);

  const openCreate=()=>{setForm({username:'',first_name:'',last_name:'',email:'',phone:'',role:'attendant',password:''});setEditUser(null);setShowForm(true);};
  const openEdit=(u:User)=>{setForm({username:u.username,first_name:u.first_name,last_name:u.last_name,email:u.email,phone:u.phone,role:u.role,password:''});setEditUser(u);setShowForm(true);};

  const save=async()=>{
    try{
      if(editUser){await usersAPI.update(editUser.id,{username:form.username,first_name:form.first_name,last_name:form.last_name,email:form.email,phone:form.phone,role:form.role as any});showToast('User updated');}
      else{await usersAPI.create({...form,role:form.role as any});showToast('User created');}
      setShowForm(false);load();
    }catch{showToast('Failed to save','error');}
  };
  const del=async(u:User)=>{
    if(!confirm(`Delete ${u.username}?`))return;
    try{await usersAPI.delete(u.id);showToast('Deleted');load();}catch{showToast('Failed','error');}
  };
  const toggle=async(u:User)=>{
    try{await usersAPI.update(u.id,{is_active:!u.is_active});showToast(u.is_active?'Deactivated':'Activated');load();}catch{showToast('Failed','error');}
  };

  const roles=['entrance_attendant','exit_attendant','attendant'] as const;
  if(loading)return <Loader/>;

  return (
    <div>
      <SectionHeader title="👷 Attendants" sub="Create and manage system users and their roles"
        action={<button onClick={openCreate} style={btnP}>+ New Attendant</button>}/>

      {/* Role description cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16,marginBottom:28}}>
        {[
          {role:'entrance_attendant',rights:['Issue parking tickets','Open entrance gate','Capture license plate','Scan QR on entry']},
          {role:'exit_attendant',    rights:['Scan exit receipts','Calculate hours & fee','Open exit gate after payment','Process mobile money']},
          {role:'attendant',         rights:['Assist clients in parking','Record vehicle in assigned slot','Report issues to admin','View slot map']},
        ].map(({role,rights})=>{
          const m=ROLE_META[role];
          return (
            <div key={role} style={{...card,borderTop:`3px solid ${m.color}`}}>
              <div style={{fontSize:28,marginBottom:8}}>{m.icon}</div>
              <div style={{fontWeight:700,fontSize:14,color:m.color,marginBottom:8}}>{m.label}</div>
              <ul style={{margin:0,paddingLeft:16,color:C.muted,fontSize:12}}>
                {rights.map(r=><li key={r} style={{marginBottom:4}}>{r}</li>)}
              </ul>
              <div style={{marginTop:12,fontSize:13,fontWeight:700,color:C.text}}>
                Count: {users.filter(u=>u.role===role).length}
              </div>
            </div>
          );
        })}
      </div>

      {/* User table per role */}
      {(['admin',...roles] as const).map(role=>{
        const roleUsers=users.filter(u=>u.role===role);
        const m=ROLE_META[role]||{label:role,color:C.muted,bg:'#f3f4f6',icon:'👤'};
        return (
          <div key={role} style={{...card,marginBottom:16}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <span style={{fontSize:20}}>{m.icon}</span>
                <span style={{fontWeight:700,fontSize:14,color:m.color}}>{m.label}s</span>
                <span style={{background:m.bg,color:m.color,borderRadius:20,padding:'2px 10px',fontSize:12,fontWeight:700}}>{roleUsers.length}</span>
              </div>
            </div>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead><tr style={{background:C.light}}>
                {['Name','Username','Email','Phone','Status','Actions'].map(h=>(
                  <th key={h} style={{padding:'8px 12px',textAlign:'left',fontWeight:700,color:C.dark,fontSize:11,textTransform:'uppercase'}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {roleUsers.length===0?<tr><td colSpan={6} style={{textAlign:'center',padding:16,color:C.muted,fontSize:12}}>No {m.label.toLowerCase()}s yet</td></tr>
                :roleUsers.map((u,i)=>(
                  <tr key={u.id} style={{background:i%2?'#fafafa':'#fff',borderBottom:`1px solid ${C.border}`}}>
                    <td style={{padding:'8px 12px',fontWeight:600}}>{u.full_name||u.username}</td>
                    <td style={{padding:'8px 12px',color:C.muted}}>{u.username}</td>
                    <td style={{padding:'8px 12px',color:C.muted,fontSize:12}}>{u.email||'—'}</td>
                    <td style={{padding:'8px 12px',color:C.muted,fontSize:12}}>{u.phone||'—'}</td>
                    <td style={{padding:'8px 12px'}}><Badge label={u.is_active?'Active':'Inactive'} color={u.is_active?C.primary:C.muted} bg={u.is_active?'#dcfce7':'#f3f4f6'}/></td>
                    <td style={{padding:'8px 12px',display:'flex',gap:6}}>
                      <button onClick={()=>openEdit(u)} style={{...btnG,padding:'4px 10px',fontSize:11}}>Edit</button>
                      <button onClick={()=>toggle(u)} style={{...btnP,padding:'4px 10px',fontSize:11,background:u.is_active?C.warning:C.primary}}>{u.is_active?'Disable':'Enable'}</button>
                      {u.role!=='admin'&&<button onClick={()=>del(u)} style={{...btnD,padding:'4px 10px',fontSize:11}}>Del</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}

      {/* Create / Edit modal */}
      {showForm&&(
        <Modal title={editUser?'Edit User':'Create Attendant'} onClose={()=>setShowForm(false)}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
            <Field label="First Name"><input style={inp} value={form.first_name} onChange={e=>setForm(p=>({...p,first_name:e.target.value}))} placeholder="Allan"/></Field>
            <Field label="Last Name"><input style={inp} value={form.last_name} onChange={e=>setForm(p=>({...p,last_name:e.target.value}))} placeholder="Tomoko"/></Field>
          </div>
          <Field label="Username"><input style={inp} value={form.username} onChange={e=>setForm(p=>({...p,username:e.target.value}))} placeholder="allan.t"/></Field>
          <Field label="Email"><input style={inp} type="email" value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))} placeholder="allan@iuiu.ac.ug"/></Field>
          <Field label="Phone"><input style={inp} value={form.phone} onChange={e=>setForm(p=>({...p,phone:e.target.value}))} placeholder="+256..."/></Field>
          <Field label="Role">
            <select style={inp} value={form.role} onChange={e=>setForm(p=>({...p,role:e.target.value}))}>
              <option value="admin">🛡️ Admin</option>
              <option value="entrance_attendant">🚗 Entrance Attendant</option>
              <option value="exit_attendant">🚪 Exit Attendant</option>
              <option value="attendant">🅿️ Parking Attendant</option>
              <option value="entrance_display">📺 Entrance Display</option>
              <option value="exit_display">📺 Exit Display</option>
            </select>
          </Field>
          {!editUser&&<Field label="Password"><input style={inp} type="password" value={form.password} onChange={e=>setForm(p=>({...p,password:e.target.value}))} placeholder="Min 6 characters"/></Field>}
          <div style={{background:ROLE_META[form.role]?.bg||'#f3f4f6',borderRadius:10,padding:'12px 14px',fontSize:13,color:ROLE_META[form.role]?.color||C.muted,marginBottom:16}}>
            {ROLE_META[form.role]?.icon} <strong>{ROLE_META[form.role]?.label}</strong> — {ROLE_META[form.role]?.desc}
          </div>
          <div style={{display:'flex',gap:10}}>
            <button onClick={save} style={btnP}>{editUser?'Save Changes':'Create Account'}</button>
            <button onClick={()=>setShowForm(false)} style={btnG}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. PRICING SECTION
// ─────────────────────────────────────────────────────────────────────────────
function PricingSection({lot,showToast}:{lot:ParkingLot;showToast:(m:string,t?:'success'|'error'|'info')=>void}) {
  const [types,setTypes]=useState<SlotType[]>([]);
  const [loading,setLoading]=useState(true);
  const [showForm,setShowForm]=useState(false);
  const [editType,setEditType]=useState<SlotType|null>(null);
  const [form,setForm]=useState({name:'',vehicle_class:'car',hourly_rate:'',flat_rate:'0',daily_max_rate:'',grace_period_minutes:'15',color_hex:'#16a34a',description:''});

  const load=()=>{slotTypesAPI.list().then(r=>{setTypes(Array.isArray(r.data)?r.data:(r.data.results||[]));}).finally(()=>setLoading(false));};
  useEffect(()=>{load();},[]);

  const openCreate=()=>{setForm({name:'',vehicle_class:'car',hourly_rate:'',flat_rate:'0',daily_max_rate:'',grace_period_minutes:'15',color_hex:'#16a34a',description:''});setEditType(null);setShowForm(true);};
  const openEdit=(t:SlotType)=>{setForm({name:t.name,vehicle_class:t.vehicle_class,hourly_rate:String(t.hourly_rate),flat_rate:String(t.flat_rate),daily_max_rate:t.daily_max_rate!=null?String(t.daily_max_rate):'',grace_period_minutes:String(t.grace_period_minutes),color_hex:t.color_hex,description:t.description});setEditType(t);setShowForm(true);};

  const save=async()=>{
    const data={name:form.name,vehicle_class:form.vehicle_class as any,hourly_rate:Number(form.hourly_rate),flat_rate:Number(form.flat_rate),daily_max_rate:form.daily_max_rate?Number(form.daily_max_rate):null,grace_period_minutes:Number(form.grace_period_minutes),color_hex:form.color_hex,description:form.description};
    try{
      if(editType)await slotTypesAPI.update(editType.id,data);
      else await slotTypesAPI.create(data);
      showToast(editType?'Rate updated':'Rate created');setShowForm(false);load();
    }catch{showToast('Failed','error');}
  };

  const VCLASS_TYPES:Record<string,string[]> = {car:['car','van'],truck:['truck','bus'],cycle:['motorcycle','bicycle']};

  if(loading)return <Loader/>;
  return (
    <div>
      <SectionHeader title="💰 Pricing" sub="Set hourly rates per vehicle type — attendants see these rates automatically"
        action={<button onClick={openCreate} style={btnP}>+ New Rate</button>}/>

      {/* Info box */}
      <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:12,padding:'14px 18px',marginBottom:24,fontSize:13,color:'#92400e'}}>
        💡 <strong>How pricing works:</strong> Exit attendants enter the vehicle type and duration — the system automatically calculates the fee using the rate below. The calculated amount is shown to the attendant before opening the exit gate.
      </div>

      {/* Rate cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:16,marginBottom:28}}>
        {types.map(t=>(
          <div key={t.id} style={{...card,borderLeft:`4px solid ${t.color_hex||C.primary}`}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
              <div>
                <div style={{fontWeight:700,fontSize:16,color:C.text}}>{t.name}</div>
                <div style={{fontSize:12,color:C.muted,textTransform:'capitalize',marginTop:2}}>Class: {t.vehicle_class} · Grace: {t.grace_period_minutes}min</div>
              </div>
              <div style={{width:32,height:32,borderRadius:8,background:t.color_hex||C.primary}}/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
              <div style={{background:C.light,borderRadius:8,padding:'10px 12px'}}>
                <div style={{fontSize:11,color:C.muted,fontWeight:600}}>HOURLY RATE</div>
                <div style={{fontSize:18,fontWeight:800,color:C.dark,marginTop:4}}>{fmt(t.hourly_rate)}</div>
              </div>
              <div style={{background:'#f0f9ff',borderRadius:8,padding:'10px 12px'}}>
                <div style={{fontSize:11,color:C.muted,fontWeight:600}}>FLAT RATE</div>
                <div style={{fontSize:18,fontWeight:800,color:C.info,marginTop:4}}>{t.flat_rate>0?fmt(t.flat_rate):'—'}</div>
              </div>
            </div>
            {t.daily_max_rate!=null&&<div style={{fontSize:12,color:C.muted,marginBottom:10}}>Daily max: {fmt(t.daily_max_rate)}</div>}
            <div style={{display:'flex',gap:8}}>
              <button onClick={()=>openEdit(t)} style={{...btnP,padding:'7px 16px',fontSize:12,flex:1}}>Edit Rate</button>
              <button onClick={async()=>{if(!confirm('Delete?'))return;await slotTypesAPI.delete(t.id);showToast('Deleted');load();}} style={{...btnD,padding:'7px 14px',fontSize:12}}>Del</button>
            </div>
          </div>
        ))}
        {types.length===0&&<div style={{color:C.muted,textAlign:'center',padding:40,gridColumn:'1/-1'}}>No rates configured yet. Click "+ New Rate" to start.</div>}
      </div>

      {/* Special fees */}
      <div style={card}>
        <div style={{fontWeight:700,fontSize:15,color:C.text,marginBottom:4}}>⚠️ Special Fees (Lot: {lot.name})</div>
        <div style={{fontSize:12,color:C.muted,marginBottom:16}}>These are charged in addition to the hourly rate in special circumstances</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14}}>
          {[
            {label:'Lost Receipt Fee',value:lot.lost_receipt_fee,icon:'🧾',desc:'Client cannot show original receipt'},
            {label:'No Plate Fee',    value:lot.no_plate_fee,    icon:'🚫',desc:'Vehicle with no identifiable plate'},
            {label:'Lost Ticket Fee', value:lot.lost_ticket_fee, icon:'🎫',desc:'Client ticket completely lost'},
          ].map(f=>(
            <div key={f.label} style={{background:C.light,borderRadius:10,padding:'14px 16px'}}>
              <div style={{fontSize:22,marginBottom:6}}>{f.icon}</div>
              <div style={{fontWeight:700,fontSize:13,color:C.text}}>{f.label}</div>
              <div style={{fontSize:20,fontWeight:800,color:C.danger,margin:'6px 0'}}>{fmt(f.value)}</div>
              <div style={{fontSize:11,color:C.muted}}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {showForm&&(
        <Modal title={editType?'Edit Rate':'Create Price Rate'} onClose={()=>setShowForm(false)}>
          <Field label="Rate Name"><input style={inp} value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="e.g. Standard Car Rate"/></Field>
          <Field label="Vehicle Class">
            <select style={inp} value={form.vehicle_class} onChange={e=>setForm(p=>({...p,vehicle_class:e.target.value}))}>
              <option value="car">🚗 Car / Van</option>
              <option value="truck">🚛 Truck / Bus</option>
              <option value="cycle">🏍️ Motorcycle / Bicycle</option>
            </select>
          </Field>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
            <Field label="Hourly Rate (UGX)"><input style={inp} type="number" value={form.hourly_rate} onChange={e=>setForm(p=>({...p,hourly_rate:e.target.value}))} placeholder="2000"/></Field>
            <Field label="Flat Rate (0 = none)"><input style={inp} type="number" value={form.flat_rate} onChange={e=>setForm(p=>({...p,flat_rate:e.target.value}))} placeholder="0"/></Field>
            <Field label="Daily Max (UGX, optional)"><input style={inp} type="number" value={form.daily_max_rate} onChange={e=>setForm(p=>({...p,daily_max_rate:e.target.value}))}/></Field>
            <Field label="Grace Period (minutes)"><input style={inp} type="number" value={form.grace_period_minutes} onChange={e=>setForm(p=>({...p,grace_period_minutes:e.target.value}))}/></Field>
          </div>
          <Field label="Colour"><input style={{...inp,height:40}} type="color" value={form.color_hex} onChange={e=>setForm(p=>({...p,color_hex:e.target.value}))}/></Field>
          <Field label="Description"><input style={inp} value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} placeholder="Optional description"/></Field>
          <div style={{display:'flex',gap:10,marginTop:16}}>
            <button onClick={save} style={btnP}>{editType?'Save Changes':'Create Rate'}</button>
            <button onClick={()=>setShowForm(false)} style={btnG}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. ALERTS SECTION
// ─────────────────────────────────────────────────────────────────────────────
function AlertsSection({lot,showToast}:{lot:ParkingLot;showToast:(m:string,t?:'success'|'error'|'info')=>void}) {
  const [alerts,setAlerts]=useState<Alert[]>([]);
  const [loading,setLoading]=useState(true);

  const load=()=>{alertsAPI.list({lot:lot.id,page_size:'100'}).then(r=>{setAlerts(Array.isArray(r.data)?r.data:(r.data.results||[]));}).finally(()=>setLoading(false));};
  useEffect(()=>{load();},[lot.id]);

  const resolve=async(id:string)=>{
    try{await alertsAPI.resolve(id);showToast('Alert resolved');load();}catch{showToast('Failed','error');}
  };

  const fires=alerts.filter(a=>a.alert_type==='fire'&&!a.is_resolved);
  const active=alerts.filter(a=>!a.is_resolved);
  const resolved=alerts.filter(a=>a.is_resolved);

  const SEV_COLOR:Record<string,{c:string;bg:string}> = {
    critical:{c:'#fff',bg:'#dc2626'},high:{c:'#fff',bg:'#d97706'},medium:{c:C.text,bg:'#fef3c7'},low:{c:C.text,bg:'#dcfce7'},
  };

  if(loading)return <Loader/>;
  return (
    <div>
      <SectionHeader title="🔔 Alerts" sub="System alerts including fire/smoke detector notifications"/>

      {/* Fire alert banner */}
      {fires.length>0&&(
        <div style={{background:'#dc2626',borderRadius:16,padding:'20px 24px',marginBottom:24,color:'#fff',display:'flex',alignItems:'center',gap:16,animation:'pulse 1s ease-in-out infinite'}}>
          <span style={{fontSize:40}}>🔥</span>
          <div style={{flex:1}}>
            <div style={{fontWeight:800,fontSize:18}}>FIRE ALERT ACTIVE — {fires.length} alarm{fires.length>1?'s':''}</div>
            <div style={{fontSize:13,marginTop:4,opacity:.9}}>{fires.map(f=>f.message).join(' | ')}</div>
          </div>
          <div style={{fontSize:12,opacity:.8}}>Smoke/fire detected</div>
        </div>
      )}
      {fires.length===0&&(
        <div style={{background:'#dcfce7',border:`1px solid ${C.border}`,borderRadius:12,padding:'14px 20px',marginBottom:24,color:C.dark,display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:24}}>✅</span> No fire or smoke alerts — all clear
        </div>
      )}

      {/* Active alerts */}
      <div style={{...card,marginBottom:20}}>
        <div style={{fontWeight:700,fontSize:15,color:C.text,marginBottom:16}}>⚠️ Active Alerts ({active.length})</div>
        {active.length===0?<div style={{textAlign:'center',color:C.muted,padding:24}}>No active alerts</div>
        :active.map(a=>(
          <div key={a.id} style={{display:'flex',alignItems:'center',gap:14,padding:'14px 0',borderBottom:`1px solid ${C.border}`}}>
            <div style={{width:10,height:10,borderRadius:'50%',background:SEV_COLOR[a.severity]?.bg||C.muted,flexShrink:0}}/>
            <span style={{background:SEV_COLOR[a.severity]?.bg||'#f3f4f6',color:SEV_COLOR[a.severity]?.c||C.text,borderRadius:8,padding:'3px 10px',fontSize:11,fontWeight:700,textTransform:'uppercase',flexShrink:0}}>{a.severity}</span>
            <span style={{flex:1,fontSize:13,color:C.text}}>{a.alert_type==='fire'?'🔥':a.alert_type==='lot_full'?'🅿️':'⚠️'} {a.message}</span>
            <span style={{fontSize:11,color:C.muted,flexShrink:0}}>{fmtT(a.created_at)}</span>
            <button onClick={()=>resolve(a.id)} style={{...btnP,padding:'6px 14px',fontSize:12,flexShrink:0}}>Resolve</button>
          </div>
        ))}
      </div>

      {/* Resolved */}
      <div style={card}>
        <div style={{fontWeight:700,fontSize:15,color:C.text,marginBottom:16}}>✅ Resolved ({resolved.length})</div>
        {resolved.length===0?<div style={{textAlign:'center',color:C.muted,padding:16}}>None</div>
        :resolved.slice(0,10).map(a=>(
          <div key={a.id} style={{display:'flex',alignItems:'center',gap:14,padding:'10px 0',borderBottom:`1px solid ${C.border}`,opacity:.7}}>
            <span style={{fontSize:13,color:C.muted,flex:1}}>{a.alert_type}: {a.message}</span>
            <span style={{fontSize:11,color:C.muted}}>{fmtT(a.created_at)}</span>
            <Badge label="Resolved" color={C.primary} bg="#dcfce7"/>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. AUDIT LOGS SECTION
// ─────────────────────────────────────────────────────────────────────────────
function AuditSection() {
  const [logs,setLogs]=useState<AuditLog[]>([]);
  const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState('');

  useEffect(()=>{auditAPI.list({page_size:'200'}).then(r=>{setLogs(Array.isArray(r.data)?r.data:(r.data.results||[]));}).finally(()=>setLoading(false));},[]);

  const filtered=search?logs.filter(l=>l.username.toLowerCase().includes(search.toLowerCase())||l.action.toLowerCase().includes(search.toLowerCase())||l.detail.toLowerCase().includes(search.toLowerCase())):logs;

  const ACTION_COLOR:Record<string,{c:string;bg:string}> = {
    login:{c:'#1d4ed8',bg:'#dbeafe'},logout:{c:C.muted,bg:'#f3f4f6'},
    create:{c:'#065f46',bg:'#d1fae5'},update:{c:C.warning,bg:'#fef3c7'},
    delete:{c:C.danger,bg:'#fee2e2'},gate_open:{c:'#7c3aed',bg:'#ede9fe'},
  };

  if(loading)return <Loader/>;
  return (
    <div>
      <SectionHeader title="📋 Audit Logs" sub="Full record of every action taken in the system"/>
      <div style={{marginBottom:16}}>
        <input style={{...inp,maxWidth:360}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search by user, action, or detail…"/>
      </div>
      <div style={card}>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead><tr style={{background:C.light}}>
              {['Time','User','Action','Target','Detail','IP'].map(h=>(
                <th key={h} style={{padding:'10px 12px',textAlign:'left',fontWeight:700,color:C.dark,fontSize:11,textTransform:'uppercase'}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {filtered.length===0?<tr><td colSpan={6} style={{textAlign:'center',padding:24,color:C.muted}}>No logs</td></tr>
              :filtered.map((l,i)=>{
                const ac=ACTION_COLOR[l.action]||{c:C.muted,bg:'#f3f4f6'};
                return (
                  <tr key={l.id} style={{background:i%2?'#fafafa':'#fff',borderBottom:`1px solid ${C.border}`}}>
                    <td style={{padding:'8px 12px',fontSize:11,color:C.muted,whiteSpace:'nowrap'}}>{fmtT(l.timestamp)}</td>
                    <td style={{padding:'8px 12px',fontWeight:600}}>{l.username}</td>
                    <td style={{padding:'8px 12px'}}><Badge label={l.action_label||l.action} color={ac.c} bg={ac.bg}/></td>
                    <td style={{padding:'8px 12px',fontSize:12,color:C.muted}}>{l.target_type}</td>
                    <td style={{padding:'8px 12px',fontSize:12,color:C.text,maxWidth:220,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.detail}</td>
                    <td style={{padding:'8px 12px',fontSize:11,color:C.muted}}>{l.ip_address||'—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. SYSTEM SECTION
// ─────────────────────────────────────────────────────────────────────────────
function SystemSection({lot,showToast}:{lot:ParkingLot;showToast:(m:string,t?:'success'|'error'|'info')=>void}) {
  const [slots,setSlots]=useState<ParkingSlot[]>([]);
  useEffect(()=>{slotsAPI.list({lot:lot.id}).then(r=>setSlots(Array.isArray(r.data)?r.data:(r.data.results||[])));},[lot.id]);

  const override=async(slotId:string,status:string)=>{
    try{await slotsAPI.setStatus(slotId,status);showToast(`Slot set to ${status}`);
    slotsAPI.list({lot:lot.id}).then(r=>setSlots(Array.isArray(r.data)?r.data:(r.data.results||[])));
    }catch{showToast('Override failed','error');}
  };
  return (
    <div>
      <SectionHeader title="⚙️ System" sub="Manual overrides, lot info, and system settings"/>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,marginBottom:24}}>
        <div style={card}>
          <div style={{fontWeight:700,fontSize:15,color:C.text,marginBottom:14}}>🏢 Lot Information</div>
          {[['Name',lot.name],['Location',lot.location],['Total Capacity',lot.total_capacity],['Available',lot.available_slots],['Occupied',lot.occupied_slots],['Status',lot.is_full?'FULL':'Available']].map(([k,v])=>(
            <div key={String(k)} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:`1px solid ${C.border}`,fontSize:13}}>
              <span style={{color:C.muted}}>{k}</span>
              <span style={{fontWeight:600,color:C.text}}>{String(v)}</span>
            </div>
          ))}
        </div>
        <div style={card}>
          <div style={{fontWeight:700,fontSize:15,color:C.text,marginBottom:14}}>🔧 Manual Slot Override</div>
          <div style={{color:C.muted,fontSize:12,marginBottom:14}}>Force-set a slot's status (use for maintenance, reservations, or corrections)</div>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {slots.map(s=>(
              <div key={s.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:`1px solid ${C.border}`}}>
                <span style={{fontWeight:700,minWidth:40,fontSize:13}}>{s.slot_number}</span>
                <Badge label={s.status} color={s.status==='vacant'?C.primary:s.status==='occupied'?C.danger:C.warning} bg={s.status==='vacant'?'#dcfce7':s.status==='occupied'?'#fee2e2':'#fef3c7'}/>
                <div style={{marginLeft:'auto',display:'flex',gap:6}}>
                  {['vacant','occupied','maintenance','reserved'].map(st=>(
                    <button key={st} onClick={()=>override(s.id,st)}
                      disabled={s.status===st}
                      style={{padding:'3px 8px',border:'1px solid #e5e7eb',borderRadius:6,background:s.status===st?C.light:'#fff',fontSize:10,cursor:s.status===st?'default':'pointer',color:C.text,fontWeight:s.status===st?700:400}}>
                      {st}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ADMIN DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
interface Props { onLogout: () => void; }

export default function AdminDashboard({ onLogout }: Props) {
  const [section, setSection] = useState<Sec>('dashboard');
  const [collapsed, setCollapsed] = useState(false);
  const [lots, setLots] = useState<ParkingLot[]>([]);
  const [activeLot, setActiveLot] = useState<ParkingLot | null>(null);
  const { toastEl, show: showToast } = useToast();

  useEffect(() => {
    lotsAPI.list().then(r => {
      const list = Array.isArray(r.data) ? r.data : (r.data.results || []);
      setLots(list);
      if (list.length > 0) setActiveLot(list[0]);
    });
  }, []);

  const unreadAlerts = 0; // could wire to WS later

  const SECTION_LABEL: Record<Sec, string> = {
    dashboard:'Dashboard', vehicles:'Vehicle Categories', slots:'Slots & Gates',
    parked:'Vehicles Parked', attendants:'Attendants', pricing:'Pricing',
    alerts:'Alerts', audit:'Audit Logs', system:'System',
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: "'Inter', system-ui, sans-serif", background: C.bg }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.8} }
        input:focus,select:focus { outline: none; border-color: #16a34a !important; box-shadow: 0 0 0 3px #dcfce7 !important; }
        button:hover:not(:disabled) { filter: brightness(1.07); }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #f1f5f9; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
      `}</style>

      {/* ── Sidebar ── */}
      <aside style={{
        width: collapsed ? 64 : 240, flexShrink: 0, background: C.darkest,
        display: 'flex', flexDirection: 'column', transition: 'width .2s', position: 'sticky', top: 0, height: '100vh', overflowY: 'auto',
      }}>
        {/* Logo */}
        <div style={{ padding: collapsed ? '20px 16px' : '20px 20px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 18 }}>🅿</span>
            </div>
            {!collapsed && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>IUIU Parking</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,.5)' }}>Admin Panel</div>
              </div>
            )}
          </div>
        </div>

        {/* Lot selector */}
        {!collapsed && lots.length > 0 && (
          <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: .5 }}>Active Lot</div>
            <select value={activeLot?.id || ''} onChange={e => setActiveLot(lots.find(l => l.id === e.target.value) || null)}
              style={{ width: '100%', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.15)', color: '#fff', padding: '7px 10px', borderRadius: 8, fontSize: 12 }}>
              {lots.map(l => <option key={l.id} value={l.id} style={{ background: C.darkest }}>{l.name}</option>)}
            </select>
            {activeLot && (
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', marginTop: 6 }}>
                {activeLot.available_slots} vacant · {activeLot.occupied_slots} occupied
              </div>
            )}
          </div>
        )}

        {/* Nav items */}
        <nav style={{ flex: 1, padding: '10px 0' }}>
          {NAV.map(item => {
            const active = section === item.id;
            return (
              <button key={item.id} onClick={() => setSection(item.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: collapsed ? '13px 16px' : '12px 18px',
                  background: active ? 'rgba(22,163,74,.25)' : 'transparent',
                  border: 'none', borderLeft: active ? `3px solid ${C.primary}` : '3px solid transparent',
                  color: active ? C.primary : 'rgba(255,255,255,.6)',
                  cursor: 'pointer', textAlign: 'left', fontSize: 13, fontWeight: active ? 700 : 400,
                  transition: 'all .15s',
                }}>
                <span style={{ fontSize: 17, flexShrink: 0 }}>{item.icon}</span>
                {!collapsed && <span>{item.label}</span>}
                {!collapsed && item.id === 'alerts' && unreadAlerts > 0 && (
                  <span style={{ marginLeft: 'auto', background: C.danger, color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>{unreadAlerts}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Collapse toggle + logout */}
        <div style={{ padding: '12px 0', borderTop: '1px solid rgba(255,255,255,.08)' }}>
          <button onClick={() => setCollapsed(c => !c)}
            style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: collapsed ? '12px 16px' : '12px 18px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,.5)', cursor: 'pointer', fontSize: 13 }}>
            <span style={{ fontSize: 16 }}>{collapsed ? '→' : '←'}</span>
            {!collapsed && <span>Collapse</span>}
          </button>
          <button onClick={onLogout}
            style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: collapsed ? '12px 16px' : '12px 18px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,.5)', cursor: 'pointer', fontSize: 13 }}>
            <span style={{ fontSize: 16 }}>🚪</span>
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Top bar */}
        <div style={{ background: C.white, borderBottom: `1px solid ${C.border}`, padding: '14px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 100 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: C.text }}>{SECTION_LABEL[section]}</div>
            {activeLot && <div style={{ fontSize: 12, color: C.muted }}>{activeLot.name} — {activeLot.available_slots} vacant / {activeLot.total_capacity} total</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {activeLot && (
              <div style={{ background: activeLot.is_full ? '#fee2e2' : C.light, color: activeLot.is_full ? C.danger : C.primary, borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 700 }}>
                {activeLot.is_full ? '🔴 LOT FULL' : `🟢 ${activeLot.available_slots} VACANT`}
              </div>
            )}
            <div style={{ fontSize: 12, color: C.muted }}>{new Date().toLocaleDateString('en-UG', { dateStyle: 'full' })}</div>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: '28px 32px', overflowY: 'auto' }}>
          {!activeLot ? (
            <CreateLotPrompt onCreated={lot => { setLots([lot]); setActiveLot(lot); }} showToast={showToast} />
          ) : (
            <>
              {section === 'dashboard'  && <DashboardSection  lot={activeLot} />}
              {section === 'vehicles'   && <VehiclesSection   lot={activeLot} />}
              {section === 'slots'      && <SlotsSection      lot={activeLot} showToast={showToast} />}
              {section === 'parked'     && <ParkedSection     lot={activeLot} />}
              {section === 'attendants' && <AttendantsSection showToast={showToast} />}
              {section === 'pricing'    && <PricingSection    lot={activeLot} showToast={showToast} />}
              {section === 'alerts'     && <AlertsSection     lot={activeLot} showToast={showToast} />}
              {section === 'audit'      && <AuditSection />}
              {section === 'system'     && <SystemSection     lot={activeLot} showToast={showToast} />}
            </>
          )}
        </div>
      </main>

      {toastEl}
    </div>
  );
}
