import { useState, useRef, useEffect } from "react";
import Icon from "@/components/ui/icon";
import AuthScreen from "@/components/AuthScreen";
import { loadSession, clearSession, logout, User } from "@/lib/auth";

type Section = "chats" | "contacts" | "media" | "history" | "settings";

interface Message {
  id: number;
  text: string;
  from: "me" | "them";
  time: string;
  encrypted: boolean;
  mediaUrl?: string;
  mediaType?: "image" | "file";
}

interface Contact {
  id: number;
  name: string;
  status: "online" | "away" | "offline";
  lastSeen?: string;
  avatar: string;
  unread?: number;
}

const CONTACTS: Contact[] = [
  { id: 1, name: "Алексей Волков", status: "online", avatar: "АВ", unread: 3 },
  { id: 2, name: "Мария Соколова", status: "away", lastSeen: "5 мин назад", avatar: "МС", unread: 1 },
  { id: 3, name: "Дмитрий Орлов", status: "offline", lastSeen: "2 ч назад", avatar: "ДО" },
  { id: 4, name: "Анна Лебедева", status: "online", avatar: "АЛ" },
  { id: 5, name: "Сергей Новиков", status: "offline", lastSeen: "вчера", avatar: "СН" },
];

const INITIAL_MESSAGES: Message[] = [
  { id: 1, text: "Привет! Всё настроил на новом сервере.", from: "them", time: "10:12", encrypted: true },
  { id: 2, text: "Отлично, как прошло развёртывание?", from: "me", time: "10:14", encrypted: true },
  { id: 3, text: "Без проблем. Вот скриншот логов.", from: "them", time: "10:15", encrypted: true, mediaUrl: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=320&h=200&fit=crop", mediaType: "image" },
  { id: 4, text: "Канал зашифрован сквозным шифрованием E2E. Никто кроме нас не видит переписку.", from: "me", time: "10:18", encrypted: true },
  { id: 5, text: "Именно для этого и выбрали SafeChat 🔒", from: "them", time: "10:19", encrypted: true },
];

const MEDIA_ITEMS = [
  { id: 1, url: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=200&h=200&fit=crop", date: "Сегодня" },
  { id: 2, url: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=200&h=200&fit=crop", date: "Сегодня" },
  { id: 3, url: "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=200&h=200&fit=crop", date: "Вчера" },
  { id: 4, url: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=200&h=200&fit=crop", date: "Вчера" },
  { id: 5, url: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=200&h=200&fit=crop", date: "22 мар" },
  { id: 6, url: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=200&h=200&fit=crop", date: "22 мар" },
];

const HISTORY = [
  { id: 1, contact: "Алексей Волков", type: "outgoing", duration: "4:32", date: "Сегодня, 09:45" },
  { id: 2, contact: "Мария Соколова", type: "incoming", duration: "12:07", date: "Сегодня, 08:10" },
  { id: 3, contact: "Дмитрий Орлов", type: "missed", duration: "—", date: "Вчера, 21:33" },
  { id: 4, contact: "Алексей Волков", type: "outgoing", duration: "1:15", date: "Вчера, 17:50" },
  { id: 5, contact: "Анна Лебедева", type: "incoming", duration: "8:44", date: "27 мар, 14:20" },
];

export default function Index() {
  const session = loadSession();
  const [authUser, setAuthUser] = useState<User | null>(session?.user ?? null);
  const [authToken, setAuthToken] = useState<string>(session?.token ?? "");

  const [section, setSection] = useState<Section>("chats");
  const [activeContact, setActiveContact] = useState<Contact>(CONTACTS[0]);
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [inputText, setInputText] = useState("");
  const [isCallActive, setIsCallActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [showEncryptInfo, setShowEncryptInfo] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);



  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isCallActive) {
      callTimerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
    } else {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
      setCallDuration(0);
    }
    return () => { if (callTimerRef.current) clearInterval(callTimerRef.current); };
  }, [isCallActive]);

  const formatCallTime = (s: number) => {
    const m = Math.floor(s / 60);
    return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  };

  if (!authUser) {
    return <AuthScreen onAuth={(token, user) => { setAuthToken(token); setAuthUser(user); }} />;
  }

  const handleLogout = async () => {
    await logout(authToken);
    clearSession();
    setAuthUser(null);
    setAuthToken("");
  };

  const myInitials = authUser.display_name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  const sendMessage = () => {
    if (!inputText.trim()) return;
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    setMessages(prev => [...prev, { id: Date.now(), text: inputText, from: "me", time, encrypted: true }]);
    setInputText("");
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        text: "Получил. Всё зашифровано на моей стороне ✓",
        from: "them",
        time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
        encrypted: true,
      }]);
    }, 2200);
  };

  const navItems = [
    { id: "chats", label: "Чаты", icon: "MessageSquare" },
    { id: "contacts", label: "Контакты", icon: "Users" },
    { id: "media", label: "Медиа", icon: "Image" },
    { id: "history", label: "История", icon: "Phone" },
    { id: "settings", label: "Настройки", icon: "Settings" },
  ] as const;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      {/* Sidebar nav */}
      <aside className="w-16 flex flex-col items-center py-5 gap-1 border-r border-border bg-[hsl(220,16%,7%)] shrink-0">
        <div className="mb-5 w-9 h-9 rounded-lg bg-[hsl(180,80%,22%,0.3)] border border-[hsl(180,100%,50%,0.3)] flex items-center justify-center">
          <span className="text-[hsl(180,100%,60%)] font-mono text-xs font-semibold">SC</span>
        </div>
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => setSection(item.id)}
            title={item.label}
            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200 relative group ${
              section === item.id
                ? "bg-[hsl(180,80%,40%,0.15)] text-[hsl(180,100%,60%)]"
                : "text-[hsl(215,12%,40%)] hover:bg-[hsl(220,12%,12%)] hover:text-[hsl(210,20%,70%)]"
            }`}
          >
            <Icon name={item.icon} size={18} />
            {section === item.id && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-[hsl(180,100%,50%)] rounded-r" />
            )}
            <span className="absolute left-14 bg-[hsl(220,14%,12%)] text-[hsl(210,20%,80%)] text-xs px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity border border-border z-50">
              {item.label}
            </span>
          </button>
        ))}
        <div className="mt-auto flex flex-col items-center gap-2">
          <button
            onClick={handleLogout}
            title="Выйти"
            className="w-8 h-8 rounded-full bg-[hsl(180,80%,22%,0.3)] border border-[hsl(180,100%,50%,0.25)] flex items-center justify-center text-xs font-bold text-[hsl(180,100%,60%)] hover:bg-[hsl(180,80%,22%,0.5)] transition-colors"
          >
            {myInitials}
          </button>
        </div>
      </aside>

      {/* Contacts list panel for chats */}
      {section === "chats" && (
        <div className="w-72 flex flex-col border-r border-border bg-[hsl(220,14%,8%)] shrink-0 animate-fade-in">
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[hsl(210,20%,85%)]">Чаты</h2>
              <span className="encrypt-badge">E2E</span>
            </div>
            <div className="relative">
              <Icon name="Search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                className="w-full bg-[hsl(220,12%,12%)] text-sm pl-8 pr-3 py-2 rounded-lg border border-border placeholder:text-muted-foreground focus:outline-none focus:border-[hsl(180,100%,50%,0.4)] transition-colors"
                placeholder="Поиск..."
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {CONTACTS.map(contact => (
              <button
                key={contact.id}
                onClick={() => setActiveContact(contact)}
                className={`w-full flex items-center gap-3 px-4 py-3 transition-all duration-150 text-left ${
                  activeContact.id === contact.id ? "bg-[hsl(180,80%,40%,0.08)]" : "hover:bg-[hsl(220,12%,11%)]"
                }`}
              >
                <div className="relative shrink-0">
                  <div className="w-9 h-9 rounded-full bg-[hsl(220,12%,18%)] flex items-center justify-center text-xs font-semibold text-[hsl(210,20%,70%)]">
                    {contact.avatar}
                  </div>
                  <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[hsl(220,14%,8%)] ${
                    contact.status === "online" ? "status-online" : contact.status === "away" ? "status-away" : "bg-[hsl(215,12%,30%)]"
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-[hsl(210,20%,85%)] truncate">{contact.name}</span>
                    {contact.unread && (
                      <span className="ml-2 min-w-[18px] h-[18px] rounded-full bg-[hsl(180,100%,40%)] text-[hsl(220,16%,6%)] text-xs font-bold flex items-center justify-center px-1">
                        {contact.unread}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {contact.status === "online" ? "В сети" : contact.lastSeen || "Не в сети"}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main content area */}
      <main className="flex-1 flex flex-col min-w-0">

        {/* ======= CHATS ======= */}
        {section === "chats" && (
          <>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-[hsl(220,14%,8%)] shrink-0">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-9 h-9 rounded-full bg-[hsl(220,12%,18%)] flex items-center justify-center text-xs font-semibold text-[hsl(210,20%,70%)]">
                    {activeContact.avatar}
                  </div>
                  <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[hsl(220,14%,8%)] ${
                    activeContact.status === "online" ? "status-online" : "bg-[hsl(215,12%,30%)]"
                  }`} />
                </div>
                <div>
                  <div className="text-sm font-semibold text-[hsl(210,20%,90%)]">{activeContact.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {activeContact.status === "online" ? "В сети" : activeContact.lastSeen || "Не в сети"}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowEncryptInfo(!showEncryptInfo)}
                  className="flex items-center gap-1.5 encrypt-badge hover:opacity-80 transition-opacity cursor-pointer"
                >
                  <Icon name="Lock" size={10} />
                  E2E шифрование
                </button>
                <button
                  onClick={() => setIsCallActive(true)}
                  className="w-8 h-8 rounded-lg bg-[hsl(142,72%,40%,0.15)] text-[hsl(142,72%,55%)] hover:bg-[hsl(142,72%,40%,0.3)] flex items-center justify-center transition-colors"
                >
                  <Icon name="Phone" size={15} />
                </button>
                <button className="w-8 h-8 rounded-lg bg-[hsl(220,12%,14%)] text-muted-foreground hover:bg-[hsl(220,12%,18%)] flex items-center justify-center transition-colors">
                  <Icon name="Video" size={15} />
                </button>
                <button className="w-8 h-8 rounded-lg bg-[hsl(220,12%,14%)] text-muted-foreground hover:bg-[hsl(220,12%,18%)] flex items-center justify-center transition-colors">
                  <Icon name="MoreVertical" size={15} />
                </button>
              </div>
            </div>

            {showEncryptInfo && (
              <div className="mx-4 mt-3 p-3 rounded-lg bg-[hsl(180,80%,22%,0.1)] border border-[hsl(180,100%,50%,0.15)] flex items-start gap-2.5 animate-fade-in">
                <Icon name="ShieldCheck" size={16} className="text-[hsl(180,100%,55%)] mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-[hsl(180,100%,65%)] mb-0.5">Сквозное шифрование активно</p>
                  <p className="text-xs text-muted-foreground">Сообщения зашифрованы на вашем устройстве и расшифрованы только получателем. Никто — даже серверы SafeChat — не может прочитать ваши сообщения.</p>
                </div>
                <button onClick={() => setShowEncryptInfo(false)} className="text-muted-foreground hover:text-foreground ml-auto shrink-0">
                  <Icon name="X" size={13} />
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-2.5">
              {messages.map((msg, i) => (
                <div key={msg.id} className={`flex ${msg.from === "me" ? "justify-end" : "justify-start"} animate-fade-in`} style={{ animationDelay: `${i * 0.04}s` }}>
                  <div className={`max-w-[65%] ${msg.from === "me" ? "msg-bubble-out" : "msg-bubble-in"} px-3.5 py-2.5`}>
                    {msg.mediaUrl && msg.mediaType === "image" && (
                      <img src={msg.mediaUrl} alt="медиа" className="rounded-lg mb-2 w-full object-cover max-h-48" />
                    )}
                    <p className="text-sm leading-relaxed text-[hsl(210,20%,88%)]">{msg.text}</p>
                    <div className="flex items-center gap-1.5 mt-1 justify-end">
                      {msg.encrypted && <Icon name="Lock" size={9} className="text-[hsl(180,80%,45%)]" />}
                      <span className="text-cipher">{msg.time}</span>
                      {msg.from === "me" && <Icon name="CheckCheck" size={11} className="text-[hsl(180,80%,45%)]" />}
                    </div>
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex justify-start animate-fade-in">
                  <div className="msg-bubble-in px-4 py-3 flex items-center gap-1.5">
                    {[0, 1, 2].map(i => (
                      <span key={i} className="typing-dot w-1.5 h-1.5 rounded-full bg-muted-foreground block" style={{ animationDelay: `${i * 0.2}s` }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="px-4 pb-4 shrink-0">
              <div className="flex items-end gap-2 bg-[hsl(220,12%,11%)] rounded-2xl border border-border px-3 py-2.5">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-7 h-7 text-muted-foreground hover:text-[hsl(180,80%,55%)] transition-colors flex items-center justify-center shrink-0 mb-0.5"
                >
                  <Icon name="Paperclip" size={16} />
                </button>
                <input ref={fileInputRef} type="file" className="hidden" accept="image/*,video/*" />
                <textarea
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder="Написать зашифрованное сообщение..."
                  rows={1}
                  className="flex-1 bg-transparent text-sm resize-none outline-none placeholder:text-muted-foreground text-[hsl(210,20%,88%)] max-h-32"
                  style={{ lineHeight: "1.5" }}
                />
                <button className="w-7 h-7 text-muted-foreground hover:text-[hsl(180,80%,55%)] transition-colors flex items-center justify-center shrink-0 mb-0.5">
                  <Icon name="Smile" size={16} />
                </button>
                <button
                  onClick={sendMessage}
                  disabled={!inputText.trim()}
                  className="w-8 h-8 rounded-xl bg-[hsl(180,100%,40%)] text-[hsl(220,16%,6%)] hover:bg-[hsl(180,100%,45%)] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all shrink-0 mb-0.5"
                >
                  <Icon name="Send" size={14} />
                </button>
              </div>
              <div className="flex items-center justify-center gap-1 mt-1.5">
                <Icon name="Lock" size={9} className="text-[hsl(180,80%,35%)]" />
                <span className="text-[10px] text-[hsl(180,60%,30%)] font-mono tracking-wide">сквозное шифрование</span>
              </div>
            </div>
          </>
        )}

        {/* ======= CONTACTS ======= */}
        {section === "contacts" && (
          <div className="flex-1 overflow-y-auto p-6 animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-[hsl(210,20%,90%)]">Контакты</h2>
              <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[hsl(180,80%,40%,0.15)] text-[hsl(180,100%,60%)] text-sm hover:bg-[hsl(180,80%,40%,0.25)] transition-colors">
                <Icon name="UserPlus" size={14} />
                Добавить
              </button>
            </div>
            <div className="grid gap-2 max-w-2xl">
              {CONTACTS.map(contact => (
                <div key={contact.id} className="flex items-center gap-4 p-3.5 rounded-xl bg-[hsl(220,14%,9%)] border border-border hover:border-[hsl(180,100%,50%,0.15)] transition-all group">
                  <div className="relative">
                    <div className="w-11 h-11 rounded-full bg-[hsl(220,12%,18%)] flex items-center justify-center font-semibold text-[hsl(210,20%,70%)]">
                      {contact.avatar}
                    </div>
                    <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[hsl(220,14%,9%)] ${
                      contact.status === "online" ? "status-online" : contact.status === "away" ? "status-away" : "bg-[hsl(215,12%,30%)]"
                    }`} />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-[hsl(210,20%,88%)]">{contact.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {contact.status === "online" ? "В сети" : contact.status === "away" ? contact.lastSeen : contact.lastSeen || "Не в сети"}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => { setActiveContact(contact); setSection("chats"); }}
                      className="w-8 h-8 rounded-lg bg-[hsl(220,12%,14%)] text-muted-foreground hover:text-[hsl(180,100%,60%)] flex items-center justify-center transition-colors"
                    >
                      <Icon name="MessageSquare" size={15} />
                    </button>
                    <button
                      onClick={() => { setActiveContact(contact); setIsCallActive(true); setSection("chats"); }}
                      className="w-8 h-8 rounded-lg bg-[hsl(220,12%,14%)] text-muted-foreground hover:text-[hsl(142,72%,55%)] flex items-center justify-center transition-colors"
                    >
                      <Icon name="Phone" size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ======= MEDIA ======= */}
        {section === "media" && (
          <div className="flex-1 overflow-y-auto p-6 animate-fade-in">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-[hsl(210,20%,90%)]">Медиафайлы</h2>
              <span className="text-xs text-muted-foreground">{MEDIA_ITEMS.length} файлов</span>
            </div>
            <div className="flex gap-2 mb-5">
              {["Все", "Фото", "Видео", "Файлы"].map(t => (
                <button key={t} className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${t === "Все" ? "bg-[hsl(180,80%,40%,0.15)] text-[hsl(180,100%,60%)]" : "text-muted-foreground hover:bg-[hsl(220,12%,12%)]"}`}>
                  {t}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2 max-w-2xl">
              {MEDIA_ITEMS.map((item, i) => (
                <div key={item.id} className="aspect-square rounded-xl overflow-hidden relative group cursor-pointer animate-fade-in" style={{ animationDelay: `${i * 0.06}s` }}>
                  <img src={item.url} alt="" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Icon name="ZoomIn" size={22} className="text-white" />
                  </div>
                  <div className="absolute bottom-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Icon name="Lock" size={10} className="text-[hsl(180,100%,70%)]" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ======= HISTORY ======= */}
        {section === "history" && (
          <div className="flex-1 overflow-y-auto p-6 animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-[hsl(210,20%,90%)]">История звонков</h2>
              <button className="text-xs text-muted-foreground hover:text-[hsl(0,72%,55%)] transition-colors">
                Очистить историю
              </button>
            </div>
            <div className="flex flex-col gap-2 max-w-2xl">
              {HISTORY.map((call, i) => (
                <div key={call.id} className="flex items-center gap-4 p-3.5 rounded-xl bg-[hsl(220,14%,9%)] border border-border hover:border-[hsl(220,12%,20%)] transition-colors animate-fade-in" style={{ animationDelay: `${i * 0.07}s` }}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    call.type === "incoming" ? "bg-[hsl(142,72%,40%,0.15)] text-[hsl(142,72%,55%)]"
                    : call.type === "outgoing" ? "bg-[hsl(180,80%,40%,0.15)] text-[hsl(180,100%,55%)]"
                    : "bg-[hsl(0,72%,40%,0.15)] text-[hsl(0,72%,55%)]"
                  }`}>
                    <Icon name={call.type === "incoming" ? "PhoneIncoming" : call.type === "outgoing" ? "PhoneOutgoing" : "PhoneMissed"} size={16} />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-[hsl(210,20%,88%)] text-sm">{call.contact}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{call.date}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm text-[hsl(210,20%,60%)]">{call.duration}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {call.type === "incoming" ? "Входящий" : call.type === "outgoing" ? "Исходящий" : "Пропущен"}
                    </div>
                  </div>
                  <button className="w-8 h-8 rounded-lg bg-[hsl(142,72%,40%,0.1)] text-[hsl(142,72%,55%)] hover:bg-[hsl(142,72%,40%,0.25)] flex items-center justify-center transition-colors">
                    <Icon name="Phone" size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ======= SETTINGS ======= */}
        {section === "settings" && (
          <div className="flex-1 overflow-y-auto p-6 animate-fade-in">
            <h2 className="text-lg font-semibold text-[hsl(210,20%,90%)] mb-6">Настройки</h2>
            <div className="max-w-lg flex flex-col gap-3">
              <div className="p-4 rounded-xl bg-[hsl(220,14%,9%)] border border-border">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Профиль</div>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-[hsl(180,80%,22%,0.3)] border border-[hsl(180,100%,50%,0.2)] flex items-center justify-center text-lg font-semibold text-[hsl(180,100%,60%)]">
                    {myInitials}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-[hsl(210,20%,88%)]">{authUser.display_name}</div>
                    <div className="text-xs text-muted-foreground">@{authUser.username}</div>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[hsl(220,14%,9%)] border border-border">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Безопасность</div>
                {[
                  { label: "Сквозное шифрование E2E", desc: "Все сообщения зашифрованы", enabled: true, icon: "Lock" },
                  { label: "Двухфакторная аутентификация", desc: "Вход по коду подтверждения", enabled: false, icon: "ShieldCheck" },
                  { label: "Автоудаление сообщений", desc: "Удалять через 7 дней", enabled: true, icon: "Trash2" },
                ].map(setting => (
                  <div key={setting.label} className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
                    <Icon name={setting.icon as "Lock" | "ShieldCheck" | "Trash2"} size={15} className="text-muted-foreground shrink-0" />
                    <div className="flex-1">
                      <div className="text-sm text-[hsl(210,20%,85%)]">{setting.label}</div>
                      <div className="text-xs text-muted-foreground">{setting.desc}</div>
                    </div>
                    <div
                      className="rounded-full transition-colors cursor-pointer flex items-center px-0.5 shrink-0"
                      style={{ width: 40, height: 22, background: setting.enabled ? "hsl(180,100%,40%)" : "hsl(220,12%,20%)" }}
                    >
                      <div className="w-4 h-4 rounded-full bg-white transition-transform" style={{ transform: setting.enabled ? "translateX(18px)" : "translateX(0)" }} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 rounded-xl bg-[hsl(220,14%,9%)] border border-border">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Уведомления</div>
                {[
                  { label: "Новые сообщения", enabled: true },
                  { label: "Входящие звонки", enabled: true },
                  { label: "Звуки уведомлений", enabled: false },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
                    <span className="text-sm text-[hsl(210,20%,85%)]">{item.label}</span>
                    <div
                      className="rounded-full transition-colors cursor-pointer flex items-center px-0.5 shrink-0"
                      style={{ width: 40, height: 22, background: item.enabled ? "hsl(180,100%,40%)" : "hsl(220,12%,20%)" }}
                    >
                      <div className="w-4 h-4 rounded-full bg-white transition-transform" style={{ transform: item.enabled ? "translateX(18px)" : "translateX(0)" }} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 rounded-xl border border-[hsl(0,72%,40%,0.3)] bg-[hsl(0,72%,40%,0.05)]">
                <button onClick={handleLogout} className="w-full flex items-center gap-2 text-sm text-[hsl(0,72%,55%)] hover:text-[hsl(0,72%,65%)] transition-colors">
                  <Icon name="LogOut" size={15} />
                  Выйти из аккаунта
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Call overlay */}
      {isCallActive && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center animate-fade-in">
          <div className="glass-panel rounded-3xl p-8 w-80 flex flex-col items-center gap-5">
            <div className="relative flex items-center justify-center" style={{ width: 80, height: 80 }}>
              <span className="absolute inset-0 rounded-full bg-[hsl(142,72%,50%,0.15)] animate-pulse-ring" />
              <div className="w-20 h-20 rounded-full bg-[hsl(220,12%,18%)] flex items-center justify-center text-2xl font-semibold text-[hsl(210,20%,70%)] relative z-10">
                {activeContact.avatar}
              </div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-[hsl(210,20%,90%)]">{activeContact.name}</div>
              <div className="text-sm text-[hsl(142,72%,55%)] font-mono mt-1">
                {callDuration > 0 ? formatCallTime(callDuration) : "Соединение..."}
              </div>
            </div>
            <div className="flex items-end gap-1 h-8">
              {[1, 2, 3, 4, 5].map(i => (
                <div
                  key={i}
                  className="waveform-bar w-1.5"
                  style={{ height: `${10 + (i % 3) * 10}px`, animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="w-12 h-12 rounded-full flex items-center justify-center transition-all"
                style={{ background: isMuted ? "hsl(0,72%,40%,0.2)" : "hsl(220,12%,18%)", color: isMuted ? "hsl(0,72%,55%)" : "hsl(215,12%,50%)" }}
              >
                <Icon name={isMuted ? "MicOff" : "Mic"} size={18} />
              </button>
              <button
                onClick={() => setIsCallActive(false)}
                className="w-14 h-14 rounded-full call-btn-end flex items-center justify-center text-white transition-all hover:opacity-90"
              >
                <Icon name="PhoneOff" size={22} />
              </button>
              <button className="w-12 h-12 rounded-full bg-[hsl(220,12%,18%)] text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors">
                <Icon name="Volume2" size={18} />
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <Icon name="Lock" size={10} className="text-[hsl(180,80%,40%)]" />
              <span className="font-mono text-[10px] text-[hsl(180,60%,35%)] tracking-widest">ЗАШИФРОВАННЫЙ ЗВОНОК</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}