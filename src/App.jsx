import { useMemo, useState } from 'react';
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
  return <div className="brand"><span className="brand-mark"><Heart size={17} fill="currentColor" strokeWidth={2.2}/></span><span>znakomstva<span className="brand-dot">.</span></span></div>;
}

function ProfileCard({ person, onLike, onPass, index }) {
  return <motion.article className="profile-card" key={person.id}
    initial={{ opacity: 0, y: 20, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, x: 80, rotate: 7, scale: .92 }} transition={{ duration: .28, ease: 'easeOut' }}>
    <img className="profile-photo" src={photo(person.photo)} alt={`Фото ${person.name}`} />
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
  const [tab, setTab] = useState('discover');
  const [index, setIndex] = useState(0);
  const [liked, setLiked] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [showMatch, setShowMatch] = useState(null);
  const [distance, setDistance] = useState(25);
  const [age, setAge] = useState('20–30');
  const [profileMode, setProfileMode] = useState(false);
  const visiblePeople = useMemo(() => { const [minAge, maxAge] = age.split('–').map(Number); return people.filter(p => p.age >= minAge && p.age <= maxAge && p.km <= distance); }, [age, distance]);
  const current = visiblePeople[index % Math.max(visiblePeople.length, 1)];
  const incomingLikes = useMemo(() => people.filter(p => liked.includes(p.id)).reverse(), [liked]);

  const next = (isLike) => {
    if (isLike && current) {
      setLiked(prev => prev.includes(current.id) ? prev : [...prev, current.id]);
      // Demo-only match feedback. Production matching must come from the backend.
      if (current.id === 2 || current.id === 4) setShowMatch(current);
    }
    setIndex(prev => prev + 1);
  };
  const goTab = (value) => { setTab(value); setProfileMode(value === 'profile'); };

  return <div className="app-shell">
    <div className="ambient ambient-one"/><div className="ambient ambient-two"/>
    <header className="topbar">
      <Brand />
      <div className="top-actions"><button className="premium-pill" onClick={() => setTab('premium')}><Crown size={14} fill="currentColor"/> Premium</button><button className="avatar-mini" onClick={() => goTab('profile')}><img src={photo('photo-1534528741775-53994a69daeb', 100)} alt="Профиль"/></button></div>
    </header>

    <main className="main-content">
      {tab === 'discover' && <>
        <section className="welcome-row"><div><div className="eyebrow"><Sparkles size={13}/> ТВОЯ ИСТОРИЯ НАЧИНАЕТСЯ ЗДЕСЬ</div><h1>Искра может<br/><span>быть рядом.</span></h1><p className="subtitle">Знакомься с теми, кто тебе по-настоящему близок.</p></div><button className="filter-button" onClick={() => setShowFilters(true)}><SlidersHorizontal size={18}/></button></section>
        <div className="discovery-meta"><div className="people-count"><span className="pulse-dot"/> <strong>24</strong> человека рядом</div><button className="sort-button" onClick={() => setShowFilters(true)}><Compass size={14}/> Для тебя <ChevronRight size={14}/></button></div>
        <section className="deck-wrap">
          <AnimatePresence mode="wait">{index < visiblePeople.length ? <ProfileCard key={current.id} person={current} onLike={() => next(true)} onPass={() => next(false)} index={index}/> : <div className="finished-card"><div className="finished-orb"><Heart size={28}/></div><h2>Пока всё на сегодня</h2><p>Ты посмотрел(а) все анкеты поблизости. Загляни чуть позже — новые люди уже в пути.</p><button className="primary-button" onClick={() => setIndex(0)}>Посмотреть ещё раз <Sparkles size={16}/></button></div>}</AnimatePresence>
        </section>
        <div className="swipe-hint"><span>← Пропустить</span><span>Нравится →</span></div>
        <section className="trust-note"><ShieldCheck size={16}/><span>Твоё личное пространство — под твоим контролем.</span><ChevronRight size={15}/></section>
      </>}

      {tab === 'likes' && <><section className="page-heading"><div className="eyebrow"><Heart size={13}/> СИМПАТИИ</div><h1>Кому ты<br/><span>понравился.</span></h1><p className="subtitle">Взаимность начинается с маленького шага.</p></section>{incomingLikes.length ? <div className="likes-grid">{incomingLikes.map(p => <button className="like-tile" key={p.id} onClick={() => setShowMatch(p)}><img src={photo(p.photo, 400)} alt={p.name}/><span className="tile-gradient"/><span className="tile-name">{p.name}, {p.age}</span><span className="tile-heart"><Heart size={14} fill="currentColor"/></span></button>)}</div> : <EmptyState icon={Heart} title="Здесь будет взаимность" body="Ставь лайки анкетам, которые тебе понравились. Все твои симпатии будут собраны здесь."/>}</>}

      {tab === 'matches' && <><section className="page-heading"><div className="eyebrow"><Sparkles size={13}/> СОВПАДЕНИЯ</div><h1>Это уже<br/><span>что-то особенное.</span></h1><p className="subtitle">Когда симпатия взаимна — всё только начинается.</p></section>{liked.some(id => id === 2 || id === 4) ? <div className="match-list">{people.filter(p => liked.includes(p.id) && (p.id === 2 || p.id === 4)).map(p => <button className="match-row" key={p.id} onClick={() => setShowMatch(p)}><img src={photo(p.photo, 200)} alt={p.name}/><div><strong>{p.name}, {p.age}</strong><span>Вы понравились друг другу ✨</span></div><span className="chat-arrow"><MessageCircle size={18}/></span></button>)}</div> : <EmptyState icon={MessageCircle} title="Тут начнутся ваши истории" body="Когда симпатии совпадут, вы увидите друг друга здесь и сможете начать общение."/>}</>}

      {tab === 'profile' && <><section className="page-heading"><div className="eyebrow"><UserRound size={13}/> ТВОЁ ПРОСТРАНСТВО</div><h1>Покажи себя<br/><span>настоящего.</span></h1></section><div className="own-profile"><div className="own-photo"><img src={photo('photo-1534528741775-53994a69daeb')} alt="Твоё фото"/><button><Camera size={17}/></button></div><div className="own-details"><h2>Твой профиль <span className="draft-badge">ДЕМО</span></h2><p>Добавь фото, расскажи о себе и укажи интересы — пусть знакомство начнётся с тебя.</p><button className="primary-button" onClick={() => setShowFilters(true)}>Настроить анкету <ChevronRight size={16}/></button></div></div><div className="settings-list"><button onClick={() => setShowFilters(true)}><span className="settings-icon"><Settings2 size={18}/></span><span><strong>Предпочтения</strong><small>Кого хочешь встретить</small></span><ChevronRight size={17}/></button><button><span className="settings-icon"><ShieldCheck size={18}/></span><span><strong>Приватность и безопасность</strong><small>Контроль над своим профилем</small></span><ChevronRight size={17}/></button><button onClick={() => setTab('premium')}><span className="settings-icon gold"><Crown size={18}/></span><span><strong>Znakomstva Premium</strong><small>Больше возможностей для знакомств</small></span><ChevronRight size={17}/></button></div></>}

      {tab === 'premium' && <><section className="page-heading"><div className="eyebrow gold-text"><Crown size={13}/> ZNAKOMSTVA PLUS</div><h1>Больше искр.<br/><span>Меньше границ.</span></h1><p className="subtitle">Дополнительные возможности для твоих знакомств.</p></section><div className="premium-card"><div className="premium-glow"/><div className="crown-large"><Crown size={30}/></div><h2>Твоя история.<br/>Твои правила.</h2><p>Premium-функции появятся после подключения безопасной оплаты.</p><div className="premium-benefits"><span><Check size={16}/> Смотреть, кому ты понравился</span><span><Check size={16}/> Дополнительные суперлайки</span><span><Check size={16}/> Расширенные фильтры</span></div><button className="primary-button" onClick={() => alert('Premium пока в разработке. Оплата не подключена.')}>Скоро появится <Sparkles size={16}/></button><small>Никаких списаний — оплата пока отключена.</small></div></>}

      <footer className="footer-note">Сделано для настоящих встреч <Heart size={12} fill="currentColor"/></footer>
    </main>

    <nav className="bottom-nav">
      <button className={tab === 'discover' ? 'nav-item active' : 'nav-item'} onClick={() => goTab('discover')}><Compass size={21}/><span>Поиск</span></button>
      <button className={tab === 'likes' ? 'nav-item active' : 'nav-item'} onClick={() => goTab('likes')}><Heart size={21}/><span>Лайки</span>{liked.length > 0 && <i className="nav-badge">{liked.length}</i>}</button>
      <button className={tab === 'matches' ? 'nav-item active' : 'nav-item'} onClick={() => goTab('matches')}><MessageCircle size={21}/><span>Чаты</span></button>
      <button className={tab === 'profile' ? 'nav-item active' : 'nav-item'} onClick={() => goTab('profile')}><UserRound size={21}/><span>Профиль</span></button>
    </nav>

    <AnimatePresence>{showFilters && <motion.div className="modal-backdrop" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={() => setShowFilters(false)}><motion.div className="filter-sheet" initial={{y:50}} animate={{y:0}} exit={{y:50}} onClick={e => e.stopPropagation()}><div className="sheet-handle"/><div className="sheet-heading"><div><span className="eyebrow">НАСТРОЙКИ</span><h2>Твои предпочтения</h2></div><button className="close-button" onClick={() => setShowFilters(false)}><X size={19}/></button></div><label className="field-label">Возраст</label><div className="age-options">{['18–24','20–30','25–35','30–45'].map(v => <button key={v} className={age === v ? 'age-option selected' : 'age-option'} onClick={() => setAge(v)}>{v}</button>)}</div><div className="range-heading"><label className="field-label">Расстояние</label><strong>до {distance} км</strong></div><input className="range" type="range" min="1" max="100" value={distance} onChange={e => setDistance(Number(e.target.value))}/><div className="range-labels"><span>Рядом</span><span>100 км</span></div><div className="privacy-callout"><ShieldCheck size={19}/><span>Точные координаты не показываются другим пользователям.</span></div><button className="primary-button full-width" onClick={() => { setIndex(0); setShowFilters(false); }}>Показать анкеты <Sparkles size={16}/></button></motion.div></motion.div>}</AnimatePresence>

    <AnimatePresence>{showMatch && <motion.div className="modal-backdrop match-backdrop" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={() => setShowMatch(null)}><motion.div className="match-modal" initial={{scale:.88,y:18}} animate={{scale:1,y:0}} exit={{scale:.92}} onClick={e => e.stopPropagation()}><button className="match-close" onClick={() => setShowMatch(null)}><X size={18}/></button><div className="match-sparkles"><Sparkles/><Heart fill="currentColor"/><Sparkles/></div><div className="match-photos"><img src={photo('photo-1534528741775-53994a69daeb',300)} alt="Ты"/><span><Heart size={18} fill="currentColor"/></span><img src={photo(showMatch.photo,300)} alt={showMatch.name}/></div><div className="eyebrow centered">ЭТО ВЗАИМНО</div><h2>Есть искра! <span>✨</span></h2><p>Вы с {showMatch.name} понравились друг другу. Самое время сказать привет.</p><button className="primary-button full-width" onClick={() => {setShowMatch(null);setTab('matches')}}><MessageCircle size={17}/> Перейти к совпадениям</button><button className="text-button" onClick={() => setShowMatch(null)}>Продолжить знакомиться</button><small className="demo-disclaimer">Демонстрационный экран · реальный матчинг подключим к серверу</small></motion.div></motion.div>}</AnimatePresence>
  </div>;
}