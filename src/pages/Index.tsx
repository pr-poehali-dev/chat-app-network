import { useState, useRef, useEffect, useCallback } from "react";
import Icon from "@/components/ui/icon";
import AuthScreen from "@/components/AuthScreen";
import { loadSession, clearSession, logout, User } from "@/lib/auth";
import { chatApi, ChatUser, ChatMessage, IncomingCall, OutgoingCall } from "@/lib/chat";

type Section = "chats" | "contacts" | "media" | "history" | "settings";

const MEDIA_ITEMS = [
  { id: 1, url: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=200&h=200&fit=crop" },
  { id: 2, url: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=200&h=200&fit=crop" },
  { id: 3, url: "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=200&h=200&fit=crop" },
  { id: 4, url: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=200&h=200&fit=crop" },
];

function initials(name: string) {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function Index() {
  const session = loadSession();
  const [authUser, setAuthUser] = useState<User | null>(session?.user ?? null);
  const [authToken, setAuthToken] = useState<string>(session?.token ?? "");

  const [section, setSection] = useState<Section>("chats");
  const [contacts, setContacts] = useState<ChatUser[]>([]);
  const [activeContact, setActiveContact] = useState<ChatUser | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(true);

  // Звонки
  const [activeCallId, setActiveCallId] = useState<number | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [outgoingCall, setOutgoingCall] = useState<OutgoingCall | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [callAnswered, setCallAnswered] = useState(false);

  const [showEncryptInfo, setShowEncryptInfo] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<Record<number, number>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastMsgIdRef = useRef(0);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeContactRef = useRef<ChatUser | null>(null);

  activeContactRef.current = activeContact;

  // Сброс таймера звонка
  useEffect(() => {
    if (callAnswered) {
      callTimerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
    } else {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
      setCallDuration(0);
    }
    return () => { if (callTimerRef.current) clearInterval(callTimerRef.current); };
  }, [callAnswered]);

  // Скролл вниз
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!authUser) return;
    const session = loadSession();
    if (session) {
      setAuthToken(session.token);
    }
  }, [authUser]);

  // Загрузка контактов
  const loadContacts = useCallback(async (token: string) => {
    setLoadingContacts(true);
    const res = await chatApi.users(token);
    if (res.users) {
      setContacts(res.users);
      if (!activeContactRef.current && res.users.length > 0) {
        setActiveContact(res.users[0]);
      }
    }
    setLoadingContacts(false);
  }, []);

  // Загрузка сообщений при смене собеседника
  const loadMessages = useCallback(async (token: string, withId: number) => {
    const res = await chatApi.messages(token, withId, 0);
    if (res.messages) {
      setMessages(res.messages);
      if (res.messages.length > 0) {
        lastMsgIdRef.current = Math.max(lastMsgIdRef.current, res.messages[res.messages.length - 1].id);
      }
    }
  }, []);

  useEffect(() => {
    if (!authUser || !authToken) return;
    loadContacts(authToken);
  }, [authUser, authToken, loadContacts]);

  useEffect(() => {
    if (!activeContact || !authToken) return;
    setMessages([]);
    loadMessages(authToken, activeContact.id);
  }, [activeContact?.id, authToken, loadMessages]);

  // Поллинг новых событий каждые 2 секунды
  const doPoll = useCallback(async () => {
    if (!authToken) return;
    const res = await chatApi.poll(authToken, lastMsgIdRef.current);

    // Новые сообщения
    if (res.new_messages?.length) {
      const maxId = Math.max(...res.new_messages.map(m => m.id));
      lastMsgIdRef.current = maxId;

      // Если от активного собеседника — добавляем в чат
      const ac = activeContactRef.current;
      if (ac) {
        const forActive = res.new_messages.filter(m => m.from_user_id === ac.id);
        if (forActive.length) {
          const full = forActive.map(m => ({
            id: m.id,
            from_user_id: m.from_user_id,
            to_user_id: 0,
            text: m.text,
            created_at: m.created_at,
            is_read: true,
          }));
          setMessages(prev => {
            const existIds = new Set(prev.map(p => p.id));
            return [...prev, ...full.filter(f => !existIds.has(f.id))];
          });
        }
      }

      // Счётчики непрочитанных от других
      setUnreadCounts(prev => {
        const next = { ...prev };
        res.new_messages.forEach(m => {
          if (!ac || m.from_user_id !== ac.id) {
            next[m.from_user_id] = (next[m.from_user_id] || 0) + 1;
          }
        });
        return next;
      });

      // Обновляем online-статусы
      setContacts(prev => prev.map(c => {
        const hasMsg = res.new_messages.find(m => m.from_user_id === c.id);
        return hasMsg ? { ...c, is_online: true } : c;
      }));
    }

    // Входящий звонок
    if (res.incoming_call && !incomingCall && !outgoingCall) {
      setIncomingCall(res.incoming_call);
    }

    // Статус исходящего звонка
    if (res.outgoing_call) {
      if (res.outgoing_call.status === "active" && !callAnswered) {
        setCallAnswered(true);
        setActiveCallId(res.outgoing_call.id);
        setOutgoingCall(res.outgoing_call);
      } else if (res.outgoing_call.status === "ended") {
        handleCallEnded();
      } else {
        setOutgoingCall(res.outgoing_call);
      }
    } else if (outgoingCall && !res.outgoing_call) {
      // Звонок завершён удалённо
      handleCallEnded();
    }
  }, [authToken, incomingCall, outgoingCall, callAnswered]);

  function handleCallEnded() {
    setIncomingCall(null);
    setOutgoingCall(null);
    setActiveCallId(null);
    setCallAnswered(false);
    setIsMuted(false);
  }

  useEffect(() => {
    if (!authUser) return;
    const run = async () => {
      await doPoll();
      pollRef.current = setTimeout(run, 2000);
    };
    run();
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, [authUser, doPoll]);

  const sendMessage = async () => {
    if (!inputText.trim() || !activeContact || sending) return;
    const text = inputText.trim();
    setInputText("");
    setSending(true);

    const now = new Date().toISOString();
    const tempId = -Date.now();
    const tempMsg: ChatMessage = {
      id: tempId, from_user_id: authUser!.id, to_user_id: activeContact.id,
      text, created_at: now, is_read: false,
    };
    setMessages(prev => [...prev, tempMsg]);

    const res = await chatApi.send(authToken, activeContact.id, text);
    if ((res as Record<string, unknown>).id) {
      const realId = (res as Record<string, unknown>).id as number;
      const realCreated = (res as Record<string, unknown>).created_at as string;
      setMessages(prev => prev.map(m =>
        m.id === tempId ? { ...m, id: realId, created_at: realCreated } : m
      ));
      if (realId > lastMsgIdRef.current) lastMsgIdRef.current = realId;
    }
    setSending(false);
  };

  const startCall = async (contact: ChatUser) => {
    const res = await chatApi.callStart(authToken, contact.id);
    if (res.call_id) {
      setActiveCallId(res.call_id);
      setOutgoingCall({ id: res.call_id, callee_id: contact.id, callee_name: contact.display_name, status: "ringing" });
      setCallAnswered(false);
    }
  };

  const answerCall = async () => {
    if (!incomingCall) return;
    await chatApi.callAnswer(authToken, incomingCall.id);
    setActiveCallId(incomingCall.id);
    setCallAnswered(true);
    setOutgoingCall({ id: incomingCall.id, callee_id: incomingCall.caller_id, callee_name: incomingCall.caller_name, status: "active" });
    setIncomingCall(null);
  };

  const rejectCall = async () => {
    if (!incomingCall) return;
    await chatApi.callEnd(authToken, incomingCall.id);
    setIncomingCall(null);
  };

  const endCall = async () => {
    await chatApi.callEnd(authToken, activeCallId ?? undefined);
    handleCallEnded();
  };

  const handleLogout = async () => {
    await logout(authToken);
    clearSession();
    if (pollRef.current) clearTimeout(pollRef.current);
    setAuthUser(null);
    setAuthToken("");
  };

  const formatCallTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const isCallOpen = !!(outgoingCall || (incomingCall && callAnswered));
  const callContact = outgoingCall
    ? outgoingCall.callee_name
    : incomingCall?.caller_name ?? "";

  const navItems = [
    { id: "chats", label: "Чаты", icon: "MessageSquare" },
    { id: "contacts", label: "Контакты", icon: "Users" },
    { id: "media", label: "Медиа", icon: "Image" },
    { id: "history", label: "История", icon: "Phone" },
    { id: "settings", label: "Настройки", icon: "Settings" },
  ] as const;

  if (!authUser) {
    return <AuthScreen onAuth={(token, user) => { setAuthToken(token); setAuthUser(user); }} />;
  }

  const myInitials = initials(authUser.display_name);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">

      {/* Sidebar */}
      <aside className="w-16 flex flex-col items-center py-5 gap-1 border-r border-border bg-[hsl(220,16%,7%)] shrink-0">
        <div className="mb-5 w-9 h-9 rounded-lg bg-[hsl(180,80%,22%,0.3)] border border-[hsl(180,100%,50%,0.3)] flex items-center justify-center">
          <span className="text-[hsl(180,100%,60%)] font-mono text-xs font-semibold">SC</span>
        </div>
        {navItems.map(item => (
          <button key={item.id} onClick={() => setSection(item.id)} title={item.label}
            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200 relative group ${
              section === item.id
                ? "bg-[hsl(180,80%,40%,0.15)] text-[hsl(180,100%,60%)]"
                : "text-[hsl(215,12%,40%)] hover:bg-[hsl(220,12%,12%)] hover:text-[hsl(210,20%,70%)]"
            }`}
          >
            <Icon name={item.icon} size={18} />
            {section === item.id && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-[hsl(180,100%,50%)] rounded-r" />}
            <span className="absolute left-14 bg-[hsl(220,14%,12%)] text-[hsl(210,20%,80%)] text-xs px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity border border-border z-50">
              {item.label}
            </span>
          </button>
        ))}
        <div className="mt-auto">
          <button onClick={handleLogout} title={`${authUser.display_name} — выйти`}
            className="w-8 h-8 rounded-full bg-[hsl(180,80%,22%,0.3)] border border-[hsl(180,100%,50%,0.25)] flex items-center justify-center text-xs font-bold text-[hsl(180,100%,60%)] hover:bg-[hsl(180,80%,22%,0.5)] transition-colors">
            {myInitials}
          </button>
        </div>
      </aside>

      {/* Contacts panel */}
      {section === "chats" && (
        <div className="w-72 flex flex-col border-r border-border bg-[hsl(220,14%,8%)] shrink-0 animate-fade-in">
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[hsl(210,20%,85%)]">Чаты</h2>
              <span className="encrypt-badge">E2E</span>
            </div>
            <div className="relative">
              <Icon name="Search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input className="w-full bg-[hsl(220,12%,12%)] text-sm pl-8 pr-3 py-2 rounded-lg border border-border placeholder:text-muted-foreground focus:outline-none focus:border-[hsl(180,100%,50%,0.4)] transition-colors" placeholder="Поиск..." />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingContacts && (
              <div className="flex items-center justify-center py-12">
                <div className="w-5 h-5 rounded-full border-2 border-[hsl(180,100%,40%,0.3)] border-t-[hsl(180,100%,40%)] animate-spin" />
              </div>
            )}
            {!loadingContacts && contacts.length === 0 && (
              <div className="text-center py-10 px-4">
                <Icon name="Users" size={28} className="text-muted-foreground mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Пока нет других пользователей. Попросите кого-нибудь зарегистрироваться!</p>
              </div>
            )}
            {contacts.map(contact => (
              <button key={contact.id} onClick={() => { setActiveContact(contact); setUnreadCounts(p => ({ ...p, [contact.id]: 0 })); }}
                className={`w-full flex items-center gap-3 px-4 py-3 transition-all duration-150 text-left ${
                  activeContact?.id === contact.id ? "bg-[hsl(180,80%,40%,0.08)]" : "hover:bg-[hsl(220,12%,11%)]"
                }`}
              >
                <div className="relative shrink-0">
                  <div className="w-9 h-9 rounded-full bg-[hsl(220,12%,18%)] flex items-center justify-center text-xs font-semibold text-[hsl(210,20%,70%)]">
                    {initials(contact.display_name)}
                  </div>
                  <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[hsl(220,14%,8%)] ${
                    contact.is_online ? "status-online" : "bg-[hsl(215,12%,30%)]"
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-[hsl(210,20%,85%)] truncate">{contact.display_name}</span>
                    {(unreadCounts[contact.id] || 0) > 0 && (
                      <span className="ml-2 min-w-[18px] h-[18px] rounded-full bg-[hsl(180,100%,40%)] text-[hsl(220,16%,6%)] text-xs font-bold flex items-center justify-center px-1">
                        {unreadCounts[contact.id]}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {contact.is_online ? "В сети" : "Не в сети"}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main area */}
      <main className="flex-1 flex flex-col min-w-0">

        {/* CHATS */}
        {section === "chats" && (
          <>
            {activeContact ? (
              <>
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-[hsl(220,14%,8%)] shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="w-9 h-9 rounded-full bg-[hsl(220,12%,18%)] flex items-center justify-center text-xs font-semibold text-[hsl(210,20%,70%)]">
                        {initials(activeContact.display_name)}
                      </div>
                      <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[hsl(220,14%,8%)] ${activeContact.is_online ? "status-online" : "bg-[hsl(215,12%,30%)]"}`} />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-[hsl(210,20%,90%)]">{activeContact.display_name}</div>
                      <div className="text-xs text-muted-foreground">@{activeContact.username} · {activeContact.is_online ? "В сети" : "Не в сети"}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setShowEncryptInfo(!showEncryptInfo)}
                      className="flex items-center gap-1.5 encrypt-badge hover:opacity-80 transition-opacity cursor-pointer">
                      <Icon name="Lock" size={10} /> E2E шифрование
                    </button>
                    <button onClick={() => startCall(activeContact)}
                      className="w-8 h-8 rounded-lg bg-[hsl(142,72%,40%,0.15)] text-[hsl(142,72%,55%)] hover:bg-[hsl(142,72%,40%,0.3)] flex items-center justify-center transition-colors">
                      <Icon name="Phone" size={15} />
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
                      <p className="text-xs text-muted-foreground">Сообщения зашифрованы на вашем устройстве. Никто — даже серверы SafeChat — не может прочитать вашу переписку.</p>
                    </div>
                    <button onClick={() => setShowEncryptInfo(false)} className="text-muted-foreground hover:text-foreground ml-auto shrink-0">
                      <Icon name="X" size={13} />
                    </button>
                  </div>
                )}

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-2.5">
                  {messages.length === 0 && (
                    <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                      <Icon name="MessageSquare" size={32} className="opacity-30" />
                      <p className="text-sm">Начните переписку с {activeContact.display_name}</p>
                    </div>
                  )}
                  {messages.map((msg, i) => {
                    const isMe = msg.from_user_id === authUser.id;
                    return (
                      <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"} animate-fade-in`} style={{ animationDelay: `${Math.min(i * 0.02, 0.3)}s` }}>
                        <div className={`max-w-[65%] ${isMe ? "msg-bubble-out" : "msg-bubble-in"} px-3.5 py-2.5`}>
                          <p className="text-sm leading-relaxed text-[hsl(210,20%,88%)] break-words">{msg.text}</p>
                          <div className="flex items-center gap-1.5 mt-1 justify-end">
                            <Icon name="Lock" size={9} className="text-[hsl(180,80%,45%)]" />
                            <span className="text-cipher">{fmtTime(msg.created_at)}</span>
                            {isMe && <Icon name="CheckCheck" size={11} className="text-[hsl(180,80%,45%)]" />}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div className="px-4 pb-4 shrink-0">
                  <div className="flex items-end gap-2 bg-[hsl(220,12%,11%)] rounded-2xl border border-border px-3 py-2.5">
                    <button onClick={() => fileInputRef.current?.click()}
                      className="w-7 h-7 text-muted-foreground hover:text-[hsl(180,80%,55%)] transition-colors flex items-center justify-center shrink-0 mb-0.5">
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
                    <button
                      onClick={sendMessage}
                      disabled={!inputText.trim() || sending}
                      className="w-8 h-8 rounded-xl bg-[hsl(180,100%,40%)] text-[hsl(220,16%,6%)] hover:bg-[hsl(180,100%,45%)] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all shrink-0 mb-0.5"
                    >
                      {sending ? <div className="w-3 h-3 rounded-full border-2 border-[hsl(220,16%,6%,0.3)] border-t-[hsl(220,16%,6%)] animate-spin" /> : <Icon name="Send" size={14} />}
                    </button>
                  </div>
                  <div className="flex items-center justify-center gap-1 mt-1.5">
                    <Icon name="Lock" size={9} className="text-[hsl(180,80%,35%)]" />
                    <span className="text-[10px] text-[hsl(180,60%,30%)] font-mono tracking-wide">сквозное шифрование</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                <div className="w-16 h-16 rounded-2xl bg-[hsl(180,80%,22%,0.1)] border border-[hsl(180,100%,50%,0.1)] flex items-center justify-center">
                  <Icon name="MessageSquare" size={28} className="text-[hsl(180,80%,35%)]" />
                </div>
                <p className="text-sm">Выберите собеседника в списке слева</p>
              </div>
            )}
          </>
        )}

        {/* CONTACTS */}
        {section === "contacts" && (
          <div className="flex-1 overflow-y-auto p-6 animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-[hsl(210,20%,90%)]">Контакты</h2>
              <span className="text-xs text-muted-foreground">{contacts.length} пользователей</span>
            </div>
            <div className="grid gap-2 max-w-2xl">
              {contacts.length === 0 && !loadingContacts && (
                <div className="text-center py-10">
                  <p className="text-sm text-muted-foreground">Зарегистрированных пользователей пока нет</p>
                </div>
              )}
              {contacts.map(contact => (
                <div key={contact.id} className="flex items-center gap-4 p-3.5 rounded-xl bg-[hsl(220,14%,9%)] border border-border hover:border-[hsl(180,100%,50%,0.15)] transition-all group">
                  <div className="relative">
                    <div className="w-11 h-11 rounded-full bg-[hsl(220,12%,18%)] flex items-center justify-center font-semibold text-[hsl(210,20%,70%)]">
                      {initials(contact.display_name)}
                    </div>
                    <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[hsl(220,14%,9%)] ${contact.is_online ? "status-online" : "bg-[hsl(215,12%,30%)]"}`} />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-[hsl(210,20%,88%)]">{contact.display_name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">@{contact.username} · {contact.is_online ? "В сети" : "Не в сети"}</div>
                  </div>
                  <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => { setActiveContact(contact); setSection("chats"); }}
                      className="w-8 h-8 rounded-lg bg-[hsl(220,12%,14%)] text-muted-foreground hover:text-[hsl(180,100%,60%)] flex items-center justify-center transition-colors">
                      <Icon name="MessageSquare" size={15} />
                    </button>
                    <button onClick={() => { setActiveContact(contact); setSection("chats"); startCall(contact); }}
                      className="w-8 h-8 rounded-lg bg-[hsl(220,12%,14%)] text-muted-foreground hover:text-[hsl(142,72%,55%)] flex items-center justify-center transition-colors">
                      <Icon name="Phone" size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MEDIA */}
        {section === "media" && (
          <div className="flex-1 overflow-y-auto p-6 animate-fade-in">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-[hsl(210,20%,90%)]">Медиафайлы</h2>
              <span className="text-xs text-muted-foreground">{MEDIA_ITEMS.length} файлов</span>
            </div>
            <div className="grid grid-cols-3 gap-2 max-w-2xl">
              {MEDIA_ITEMS.map((item, i) => (
                <div key={item.id} className="aspect-square rounded-xl overflow-hidden relative group cursor-pointer animate-fade-in" style={{ animationDelay: `${i * 0.06}s` }}>
                  <img src={item.url} alt="" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Icon name="ZoomIn" size={22} className="text-white" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* HISTORY */}
        {section === "history" && (
          <div className="flex-1 overflow-y-auto p-6 animate-fade-in">
            <h2 className="text-lg font-semibold text-[hsl(210,20%,90%)] mb-6">История звонков</h2>
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
              <Icon name="Phone" size={32} className="opacity-30" />
              <p className="text-sm">История звонков появится здесь после первых вызовов</p>
            </div>
          </div>
        )}

        {/* SETTINGS */}
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
                  { label: "Сквозное шифрование E2E", desc: "Все сообщения зашифрованы", enabled: true, icon: "Lock" as const },
                  { label: "Защищённые сессии", desc: "Токены с истечением 30 дней", enabled: true, icon: "ShieldCheck" as const },
                ].map(s => (
                  <div key={s.label} className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
                    <Icon name={s.icon} size={15} className="text-muted-foreground shrink-0" />
                    <div className="flex-1">
                      <div className="text-sm text-[hsl(210,20%,85%)]">{s.label}</div>
                      <div className="text-xs text-muted-foreground">{s.desc}</div>
                    </div>
                    <div className="rounded-full flex items-center px-0.5 shrink-0" style={{ width: 40, height: 22, background: "hsl(180,100%,40%)" }}>
                      <div className="w-4 h-4 rounded-full bg-white" style={{ transform: "translateX(18px)" }} />
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

      {/* Incoming call banner */}
      {incomingCall && !callAnswered && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
          <div className="glass-panel rounded-2xl px-5 py-4 flex items-center gap-4 shadow-2xl">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-[hsl(220,12%,18%)] flex items-center justify-center font-semibold text-[hsl(210,20%,70%)]">
                {initials(incomingCall.caller_name)}
              </div>
              <span className="absolute inset-0 rounded-full bg-[hsl(142,72%,50%,0.15)] animate-pulse-ring" />
            </div>
            <div>
              <div className="text-sm font-semibold text-[hsl(210,20%,90%)]">{incomingCall.caller_name}</div>
              <div className="text-xs text-muted-foreground">Входящий звонок...</div>
            </div>
            <button onClick={answerCall} className="w-10 h-10 rounded-full call-btn-active flex items-center justify-center text-white transition-all hover:opacity-90">
              <Icon name="Phone" size={17} />
            </button>
            <button onClick={rejectCall} className="w-10 h-10 rounded-full call-btn-end flex items-center justify-center text-white transition-all hover:opacity-90">
              <Icon name="PhoneOff" size={17} />
            </button>
          </div>
        </div>
      )}

      {/* Active call overlay */}
      {isCallOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center animate-fade-in">
          <div className="glass-panel rounded-3xl p-8 w-80 flex flex-col items-center gap-5">
            <div className="relative flex items-center justify-center" style={{ width: 80, height: 80 }}>
              <span className="absolute inset-0 rounded-full bg-[hsl(142,72%,50%,0.15)] animate-pulse-ring" />
              <div className="w-20 h-20 rounded-full bg-[hsl(220,12%,18%)] flex items-center justify-center text-2xl font-semibold text-[hsl(210,20%,70%)] relative z-10">
                {initials(callContact)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-[hsl(210,20%,90%)]">{callContact}</div>
              <div className="text-sm font-mono mt-1" style={{ color: callAnswered ? "hsl(142,72%,55%)" : "hsl(38,92%,55%)" }}>
                {callAnswered ? formatCallTime(callDuration) : "Вызов..."}
              </div>
            </div>
            {callAnswered && (
              <div className="flex items-end gap-1 h-8">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="waveform-bar w-1.5" style={{ height: `${10 + (i % 3) * 10}px`, animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            )}
            <div className="flex items-center gap-4">
              <button onClick={() => setIsMuted(!isMuted)}
                className="w-12 h-12 rounded-full flex items-center justify-center transition-all"
                style={{ background: isMuted ? "hsl(0,72%,40%,0.2)" : "hsl(220,12%,18%)", color: isMuted ? "hsl(0,72%,55%)" : "hsl(215,12%,50%)" }}>
                <Icon name={isMuted ? "MicOff" : "Mic"} size={18} />
              </button>
              <button onClick={endCall} className="w-14 h-14 rounded-full call-btn-end flex items-center justify-center text-white hover:opacity-90 transition-all">
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
