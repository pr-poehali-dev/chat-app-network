import { useState } from "react";
import Icon from "@/components/ui/icon";
import { register, login, saveSession, User } from "@/lib/auth";

interface Props {
  onAuth: (token: string, user: User) => void;
}

export default function AuthScreen({ onAuth }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    let result;
    if (mode === "register") {
      result = await register(username, displayName, password);
    } else {
      result = await login(username, password);
    }

    setLoading(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    const token = result.data?.token as string;
    const user = result.data?.user as User;
    saveSession(token, user);
    onAuth(token, user);
  };

  const switchMode = () => {
    setMode(m => m === "login" ? "register" : "login");
    setError("");
    setUsername("");
    setDisplayName("");
    setPassword("");
  };

  return (
    <div className="min-h-screen w-screen bg-background flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-[hsl(180,80%,40%,0.04)] blur-3xl" />
        <div className="absolute bottom-1/4 left-1/3 w-64 h-64 rounded-full bg-[hsl(220,80%,50%,0.03)] blur-3xl" />
      </div>

      <div className="w-full max-w-sm relative">
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[hsl(180,80%,22%,0.3)] border border-[hsl(180,100%,50%,0.25)] mb-4">
            <span className="font-mono text-xl font-bold text-[hsl(180,100%,60%)]">SC</span>
          </div>
          <h1 className="text-2xl font-semibold text-[hsl(210,20%,92%)] tracking-tight">SafeChat</h1>
          <p className="text-sm text-muted-foreground mt-1">Защищённый мессенджер с E2E шифрованием</p>
        </div>

        <div className="glass-panel rounded-2xl p-6 animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <div className="flex bg-[hsl(220,12%,12%)] rounded-xl p-1 mb-6">
            <button
              onClick={() => setMode("login")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === "login" ? "bg-[hsl(220,14%,18%)] text-[hsl(210,20%,90%)] shadow-sm" : "text-muted-foreground hover:text-[hsl(210,20%,70%)]"}`}
            >
              Войти
            </button>
            <button
              onClick={() => setMode("register")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === "register" ? "bg-[hsl(220,14%,18%)] text-[hsl(210,20%,90%)] shadow-sm" : "text-muted-foreground hover:text-[hsl(210,20%,70%)]"}`}
            >
              Регистрация
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Логин</label>
              <div className="relative">
                <Icon name="AtSign" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="username"
                  autoComplete="username"
                  className="w-full bg-[hsl(220,12%,12%)] border border-border rounded-xl pl-8 pr-3 py-2.5 text-sm text-[hsl(210,20%,88%)] placeholder:text-muted-foreground focus:outline-none focus:border-[hsl(180,100%,50%,0.4)] transition-colors"
                />
              </div>
            </div>

            {mode === "register" && (
              <div className="animate-fade-in">
                <label className="text-xs text-muted-foreground mb-1.5 block">Имя для отображения</label>
                <div className="relative">
                  <Icon name="User" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder="Иван Иванов"
                    autoComplete="name"
                    className="w-full bg-[hsl(220,12%,12%)] border border-border rounded-xl pl-8 pr-3 py-2.5 text-sm text-[hsl(210,20%,88%)] placeholder:text-muted-foreground focus:outline-none focus:border-[hsl(180,100%,50%,0.4)] transition-colors"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Пароль</label>
              <div className="relative">
                <Icon name="Lock" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={mode === "register" ? "Минимум 6 символов" : "••••••••"}
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  className="w-full bg-[hsl(220,12%,12%)] border border-border rounded-xl pl-8 pr-10 py-2.5 text-sm text-[hsl(210,20%,88%)] placeholder:text-muted-foreground focus:outline-none focus:border-[hsl(180,100%,50%,0.4)] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Icon name={showPassword ? "EyeOff" : "Eye"} size={14} />
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[hsl(0,72%,40%,0.1)] border border-[hsl(0,72%,40%,0.3)] animate-fade-in">
                <Icon name="AlertCircle" size={13} className="text-[hsl(0,72%,55%)] shrink-0" />
                <span className="text-xs text-[hsl(0,72%,60%)]">{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 w-full py-2.5 rounded-xl bg-[hsl(180,100%,40%)] text-[hsl(220,16%,6%)] font-semibold text-sm hover:bg-[hsl(180,100%,45%)] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-[hsl(220,16%,6%,0.3)] border-t-[hsl(220,16%,6%)] animate-spin" />
                  Подождите...
                </>
              ) : (
                <>
                  <Icon name={mode === "login" ? "LogIn" : "UserPlus"} size={15} />
                  {mode === "login" ? "Войти" : "Создать аккаунт"}
                </>
              )}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button onClick={switchMode} className="text-xs text-muted-foreground hover:text-[hsl(180,80%,55%)] transition-colors">
              {mode === "login" ? "Нет аккаунта? Зарегистрироваться" : "Уже есть аккаунт? Войти"}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-center gap-1.5 mt-5">
          <Icon name="ShieldCheck" size={12} className="text-[hsl(180,80%,35%)]" />
          <span className="text-[11px] text-[hsl(180,60%,30%)] font-mono tracking-wider">СКВОЗНОЕ ШИФРОВАНИЕ E2E</span>
        </div>
      </div>
    </div>
  );
}
