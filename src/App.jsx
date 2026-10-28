import { useEffect, useState } from 'react';
import { apiClient, ApiError } from './lib/api.js';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Heart, X, Sparkles, MessageCircle, UserRound, SlidersHorizontal,
  MapPin, BadgeCheck, ChevronRight, Settings2, Crown, Flame, ArrowLeft,
  Camera, ShieldCheck, MoreHorizontal, Send, Compass, Star, Check
} from 'lucide-react';

const people = [
  { id: 1, name: 'Алиса', age: 24, city: 'Цюрих', distance: '2 км от тебя', km: 2, bio: 'Собираю впечатления, а не вещи ✨', interests: ['Путешествия', 'Кофе', 'Искусство'], photo: 'photo-1524504388940-b1c1722653e1', color: 'rose', online: true },
  { id: 2, name: 'Мия', age: 22, city: 'Цюрих', distance: '4 км от тебя', km: 4, bio: 'Спонтанная поездка? Я уже собираюсь.', interests: ['Музыка', 'Море', 'Кино'], photo: 'photo-1529139574466-a303027c1d8b', color: 'violet', online: true },
  { id: 3, name: 'София', age: 26, city: 'Винтертур', distance: '12 км от тебя', km: 12, bio: 'За честность, долгие разговоры и матчу.', interests: ['Матча', 'Книги', 'Йога'], photo: 'photo-1534528741775-53994a69daeb', color: 'peach', online: false },
  { id: 4, name: 'Эмма', age: 23, city: 'Цюрих', distance: '3 км от тебя', km: 3, bio: 'Ищу человека, с которым легко молчать.', interests: ['Дизайн', 'Горы', 'Бранчи'], photo: 'photo-1524250502761-1ac6f2e30d43', color: 'blue', online: true }
];
const photo = (id, w = 900) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=85`;

function Brand() {
  return <div className="brand"><span className="brand-mark"><Heart size={17} fill="currentColor" strokeWidth={2.2}/></span><span>AMORI<span className="brand-dot">.</span></span></div>;
}

function ProfileCard({ person, onLike, onPass, index }) {
  return <motion.article className="profile-card" key={person.id}
    initial={{ opacity: 0, y: 20, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, x: 80, rotate: 7, scale: .92 }} transition={{ duration: .28, ease: 'easeOut' }}>
    <img className="profile-photo" src={person.photo} alt={`Фото ${person.name}`} />
    <div className="photo-shade" />
    <div className="card-topline"><span className="verified"><BadgeCheck size={14} fill="currentColor"/> Настоящие люди</span><button className="icon-glass" aria-label="Дополнительно"><MoreHorizontal size={20}/></button></div>
    <div className="photo-pagination"><i className="active"/><i/><i/><i/></div>
    <div className="profile-info">
      <div className="online-line">{person.online && <><span className="online-dot"/><span>Сейчас онлайн</span></>}</div>
      <h2>{person.name}<span className="age">, {person.age}</span><BadgeCheck className="verified-large" size={20} fill="currentColor"/></h2>
      <div className="location"><MapPin size={14}/>{person.city}<span className="location-sep">·</span>{person.distance}</div>
      <p className="bio">{person.bio}</p>
      <div className="interest-row">{person.interests.map((interest) => <span key={interest} className="interest">{interest}</span>)}</div>
    </div>
    <div className="card-actions">
      <button className="pass-button" onClick={onPass} aria-label="Пропустить"><X size={25}/></button>
      <button className="super-button" aria-label="Суперлайк" onClick={onLike}><Sparkles size={19}/></button>
      <button className="like-button" onClick={onLike} aria-label="Нравится"><Heart size={25} fill="currentColor"/></button>
    </div>
  </motion.article>;
}

function EmptyState({ title, body, icon: Icon }) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={28}/></div><h3>{title}</h3><p>{body}</p></div>;
}

export default function App() {
 const [tab,setTab]=useState('discover');
 const [profile,setProfile]=useState(null);
 const [people,setPeople]=useState([]);
 const [likes,setLikes]=useState([]);
 const [matches,setMatches]=useState([]);
 const [index,setIndex]=useState(0);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [editing,setEditing]=useState(false);
 const [showFilters,setShowFilters]=useState(false);
 const [showMatch,setShowMatch]=useState(null);
 const [age,setAge]=useState('18–99');
 const [distance,setDistance]=useState(25);
 const [form,setForm]=useState({displayName:'',birthDate:'',bio:'',city:'',interests:''});
 const tgUser=window.Telegram?.WebApp?.initDataUnsafe?.user;
 const avatar=(name)=>'https://ui-avatars.com/api/?name='+encodeURIComponent(name||'AMORI')+'&background=302438&color=fff&size=700&bold=true';
 const mapProfile=(p)=>({...p,name:p.display_name||'Без имени',age:Number(p.age)||ageOf(p.birth_date),city:p.city||'Город не указан',bio:p.bio||'Пока ничего не рассказал(а) о себе.',interests:Array.isArray(p.interests)?p.interests:[],photo:avatar(p.display_name),verified:Boolean(p.is_verified)});
 function ageOf(date){if(!date)return '';const d=new Date(date),n=new Date();return n.getFullYear()-d.getFullYear()-((n.getMonth()<d.getMonth()||(n.getMonth()===d.getMonth()&&n.getDate()<d.getDate()))?1:0);}
 async function load(){setLoading(true);setError('');try{const me=await apiClient.me();setProfile(me.profile||null);if(me.profile){setForm({displayName:me.profile.display_name||'',birthDate:String(me.profile.birth_date||'').slice(0,10),bio:me.profile.bio||'',city:me.profile.city||'',interests:Array.isArray(me.profile.interests)?me.profile.interests.join(', '):''});const results=await Promise.all([apiClient.discovery(30),apiClient.incomingLikes(),apiClient.matches()]);setPeople((results[0].profiles||[]).map(mapProfile));setLikes((results[1].profiles||[]).map(mapProfile));setMatches((results[2].matches||[]).map(mapProfile));}else{setPeople([]);setLikes([]);setMatches([]);setEditing(true);}}catch(e){setError(e instanceof ApiError?e.message:'Не удалось загрузить данные.');}finally{setLoading(false);}}
 useEffect(()=>{load();},[]);
 const filtered=people.filter(p=>{const parts=age.split('–').map(Number);return !p.age||(p.age>=parts[0]&&p.age<=parts[1]);});
 const current=filtered[index];
 async function next(like){if(!current||busy)return;setBusy(true);setError('');try{if(like){const result=await apiClient.like(current.id);if(result.matched){setShowMatch(current);const m=await apiClient.matches();setMatches((m.matches||[]).map(mapProfile));}}setIndex(v=>v+1);}catch(e){setError(e instanceof ApiError?e.message:'Не удалось выполнить действие.');}finally{setBusy(false);}}
 async function save(e){e.preventDefault();setBusy(true);setError('');try{const r=await apiClient.saveMe({displayName:form.displayName.trim(),birthDate:form.birthDate,bio:form.bio.trim(),city:form.city.trim(),interests:form.interests.split(',').map(v=>v.trim()).filter(Boolean).slice(0,20)});setProfile(r.profile);setEditing(false);setTab('discover');setIndex(0);await load();}catch(e){setError(e instanceof ApiError?e.message:'Не удалось сохранить анкету.');}finally{setBusy(false);}}
 const name=profile?.display_name||tgUser?.first_name||'Твой профиль';
 return <div className="app-shell"><div className="ambient ambient-one"/><div className="ambient ambient-two"/>
 <header className="topbar"><Brand/><div className="top-actions"><button className="premium-pill" onClick={()=>setTab('premium')}><Crown size={14}/> Premium</button><button className="avatar-mini" onClick={()=>setTab('profile')}><img src={avatar(name)} alt="Профиль"/></button></div></header>
 <main className="main-content">
 {error&&<div className="api-alert" role="alert"><span>{error}</span><button onClick={load}>Повторить</button></div>}
 {loading?<div className="empty-state"><div className="empty-icon"><Sparkles size={28}/></div><h3>Загружаем AMORI…</h3><p>Получаем данные твоего аккаунта.</p></div>:<>
 {tab==='discover'&&<><section className="welcome-row"><div><div className="eyebrow"><Sparkles size={13}/> ТВОЯ ИСТОРИЯ НАЧИНАЕТСЯ ЗДЕСЬ</div><h1>Искра может<br/><span>быть рядом.</span></h1><p className="subtitle">Реальные анкеты из AMORI.</p></div><button className="filter-button" onClick={()=>setShowFilters(true)}><SlidersHorizontal size={18}/></button></section>
 <div className="discovery-meta"><div className="people-count"><span className="pulse-dot"/><strong>{filtered.length}</strong> анкет доступно</div></div>
 {!profile?<EmptyState icon={UserRound} title="Создай свою анкету" body="Заполни профиль, чтобы начать знакомиться."/>:current?<><section className="deck-wrap"><AnimatePresence mode="wait"><ProfileCard key={current.id} person={current} onLike={()=>next(true)} onPass={()=>next(false)} index={index}/></AnimatePresence></section><div className="swipe-hint"><span>← Пропустить</span><span>Нравится →</span></div></>:<EmptyState icon={Heart} title="Анкеты закончились" body="Новых анкет пока нет. Попробуй позже."/>}</>}
 {tab==='likes'&&<><section className="page-heading"><div className="eyebrow"><Heart size={13}/> СИМПАТИИ</div><h1>Кому ты<br/><span>понравился.</span></h1></section>{likes.length?<div className="likes-grid">{likes.map(p=><div className="like-tile" key={p.id}><img src={p.photo} alt={p.name}/><span className="tile-gradient"/><span className="tile-name">{p.name}{p.age?', '+p.age:''}</span></div>)}</div>:<EmptyState icon={Heart} title="Пока нет лайков" body="Входящие симпатии появятся здесь."/>}</>}
 {tab==='matches'&&<><section className="page-heading"><div className="eyebrow"><Sparkles size={13}/> СОВПАДЕНИЯ</div><h1>Это уже<br/><span>что-то особенное.</span></h1></section>{matches.length?<div className="match-list">{matches.map(p=><div className="match-row" key={p.match_id||p.id}><img src={p.photo} alt={p.name}/><div><strong>{p.name}{p.age?', '+p.age:''}</strong><span>Взаимная симпатия</span></div><span className="chat-arrow"><MessageCircle size={18}/></span></div>)}</div>:<EmptyState icon={MessageCircle} title="Пока нет совпадений" body="Взаимные лайки появятся здесь."/>}</>}
 {tab==='profile'&&<><section className="page-heading"><div className="eyebrow"><UserRound size={13}/> ТВОЁ ПРОСТРАНСТВО</div><h1>Покажи себя<br/><span>настоящего.</span></h1></section>{profile?<div className="own-profile"><div className="own-photo"><img src={avatar(name)} alt="Профиль"/></div><div className="own-details"><h2>{profile.display_name}</h2><p>{profile.bio||'Добавь описание о себе.'}</p><button className="primary-button" onClick={()=>setEditing(true)}>Редактировать анкету <ChevronRight size={16}/></button></div></div>:<EmptyState icon={UserRound} title="Анкета не создана" body="Создай профиль, чтобы пользоваться поиском."/>}<div className="settings-list"><button onClick={()=>setTab('premium')}><span className="settings-icon gold"><Crown size={18}/></span><span><strong>AMORI Premium</strong><small>Оплата пока отключена</small></span><ChevronRight size={17}/></button></div></>}
 {tab==='premium'&&<><section className="page-heading"><div className="eyebrow"><Crown size={13}/> AMORI PLUS</div><h1>Больше искр.<br/><span>Меньше границ.</span></h1></section><div className="premium-card"><div className="crown-large"><Crown size={30}/></div><h2>Твоя история.<br/>Твои правила.</h2><p>Premium появится после подключения безопасной оплаты.</p><button className="primary-button" disabled>Скоро появится</button><small>Списания не выполняются.</small></div></>}
 </>}
 <footer className="footer-note">AMORI — ближе к настоящим встречам <Heart size={12} fill="currentColor"/></footer></main>
 <nav className="bottom-nav"><button className={tab==='discover'?'nav-item active':'nav-item'} onClick={()=>setTab('discover')}><Compass size={21}/><span>Поиск</span></button><button className={tab==='likes'?'nav-item active':'nav-item'} onClick={()=>setTab('likes')}><Heart size={21}/><span>Лайки</span>{likes.length>0&&<i className="nav-badge">{likes.length}</i>}</button><button className={tab==='matches'?'nav-item active':'nav-item'} onClick={()=>setTab('matches')}><MessageCircle size={21}/><span>Чаты</span></button><button className={tab==='profile'?'nav-item active':'nav-item'} onClick={()=>setTab('profile')}><UserRound size={21}/><span>Профиль</span></button></nav>
 <AnimatePresence>{editing&&<motion.div className="modal-backdrop" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}><motion.form className="filter-sheet profile-form" initial={{y:50}} animate={{y:0}} exit={{y:50}} onSubmit={save}><div className="sheet-handle"/><div className="sheet-heading"><div><span className="eyebrow">ТВОЯ АНКЕТА</span><h2>{profile?'Редактировать профиль':'Создать профиль'}</h2></div><button type="button" className="close-button" onClick={()=>profile&&setEditing(false)}><X size={19}/></button></div>
 <label className="field-label">Имя</label><input className="profile-input" required maxLength={40} value={form.displayName} onChange={e=>setForm({...form,displayName:e.target.value})} placeholder="Как тебя зовут?"/>
 <label className="field-label">Дата рождения (18+)</label><input className="profile-input" type="date" required value={form.birthDate} max={new Date(Date.now()-18*365.25*86400000).toISOString().slice(0,10)} onChange={e=>setForm({...form,birthDate:e.target.value})}/>
 <label className="field-label">Город</label><input className="profile-input" maxLength={100} value={form.city} onChange={e=>setForm({...form,city:e.target.value})} placeholder="Цюрих"/>
 <label className="field-label">О себе</label><textarea className="profile-input profile-textarea" maxLength={500} value={form.bio} onChange={e=>setForm({...form,bio:e.target.value})} placeholder="Расскажи о себе"/>
 <label className="field-label">Интересы через запятую</label><input className="profile-input" value={form.interests} onChange={e=>setForm({...form,interests:e.target.value})} placeholder="Кофе, горы, кино"/>
 <button className="primary-button full-width" type="submit" disabled={busy}>{busy?'Сохраняем…':'Сохранить анкету'} <Check size={16}/></button></motion.form></motion.div>}</AnimatePresence>
 <AnimatePresence>{showFilters&&<motion.div className="modal-backdrop" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={()=>setShowFilters(false)}><motion.div className="filter-sheet" initial={{y:50}} animate={{y:0}} exit={{y:50}} onClick={e=>e.stopPropagation()}><div className="sheet-handle"/><div className="sheet-heading"><div><span className="eyebrow">НАСТРОЙКИ</span><h2>Твои предпочтения</h2></div><button className="close-button" onClick={()=>setShowFilters(false)}><X size={19}/></button></div><label className="field-label">Возраст</label><div className="age-options">{['18–24','20–30','25–35','30–45','18–99'].map(v=><button key={v} className={age===v?'age-option selected':'age-option'} onClick={()=>setAge(v)}>{v}</button>)}</div><label className="field-label">Расстояние: до {distance} км</label><input className="range" type="range" min="1" max="100" value={distance} onChange={e=>setDistance(Number(e.target.value))}/><button className="primary-button full-width" onClick={()=>{setIndex(0);setShowFilters(false)}}>Показать анкеты <Sparkles size={16}/></button></motion.div></motion.div>}</AnimatePresence>
 <AnimatePresence>{showMatch&&<motion.div className="modal-backdrop match-backdrop" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={()=>setShowMatch(null)}><motion.div className="match-modal" initial={{scale:.88,y:18}} animate={{scale:1,y:0}} exit={{scale:.92}} onClick={e=>e.stopPropagation()}><button className="match-close" onClick={()=>setShowMatch(null)}><X size={18}/></button><div className="match-sparkles"><Sparkles/><Heart fill="currentColor"/><Sparkles/></div><div className="match-photos"><img src={avatar(name)} alt="Ты"/><span><Heart size={18} fill="currentColor"/></span><img src={showMatch.photo} alt={showMatch.name}/></div><div className="eyebrow centered">ЭТО ВЗАИМНО</div><h2>Есть искра! ✨</h2><p>Вы с {showMatch.name} понравились друг другу.</p><button className="primary-button full-width" onClick={()=>{setShowMatch(null);setTab('matches')}}><MessageCircle size={17}/> К совпадениям</button></motion.div></motion.div>}</AnimatePresence>
 </div>;
}