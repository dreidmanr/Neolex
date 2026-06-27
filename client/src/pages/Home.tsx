import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight, Shield, FileText, AlertTriangle, CheckCircle2, Clock, Users, ChevronRight, Scale, Lock, Zap } from "lucide-react";

export default function Home() {
  const [, navigate] = useLocation();

  const handleStartDiagnostic = () => {
    navigate("/diagnostic");
  };

  const handleStartPaid = () => {
    navigate("/paid");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── NAV ── */}
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Scale className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-display font-800 text-xl tracking-tight">Lexy</span>
          </div>
          <div className="hidden sm:flex items-center gap-3">
            <button
              onClick={handleStartPaid}
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors"
            >
              Углублённая диагностика
            </button>
            <Button
              onClick={handleStartDiagnostic}
              className="btn-electric px-5 py-2 text-sm"
            >
              Бесплатно
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="relative overflow-hidden bg-background pt-20 pb-24">
        {/* Decorative blobs */}
        <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-blue-500/5 blur-3xl translate-y-1/2 -translate-x-1/3 pointer-events-none" />

        <div className="container relative">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/8 border border-primary/15 text-primary text-sm font-medium mb-6 animate-fade-in-up">
              <Zap className="w-3.5 h-3.5" />
              Бесплатная экспресс-диагностика · 5–7 минут
            </div>

            <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-800 leading-[1.05] tracking-tight mb-6 animate-fade-in-up animate-delay-100">
              Узнайте, какие{" "}
              <span className="text-gradient">правовые риски</span>{" "}
              скрыты в вашем IT-продукте
            </h1>

            <p className="text-xl text-muted-foreground leading-relaxed mb-10 max-w-2xl animate-fade-in-up animate-delay-200">
              Предварительная правовая оценка за 5–7 минут. Выявите зоны уязвимости, получите конкретные выводы и узнайте, что стоит проверить в первую очередь.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 animate-fade-in-up animate-delay-300">
              <button
                onClick={handleStartDiagnostic}
                className="btn-electric flex items-center justify-center gap-2 px-8 py-4 text-base rounded-xl"
              >
                Начать диагностику бесплатно
                <ArrowRight className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2 text-sm text-muted-foreground px-4">
                <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                Без регистрации · Без оплаты
              </div>
            </div>

            {/* Stats row */}
            <div className="flex flex-wrap gap-8 mt-14 animate-fade-in-up animate-delay-400">
              {[
                { value: "8", label: "вопросов" },
                { value: "5–7", label: "минут" },
                { value: "4", label: "зоны риска" },
                { value: "100%", label: "бесплатно" },
              ].map((stat) => (
                <div key={stat.label}>
                  <div className="font-display text-3xl font-800 text-foreground">{stat.value}</div>
                  <div className="text-sm text-muted-foreground mt-0.5">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── WHAT DIAGNOSTIC SHOWS ── */}
      <section className="section-dark py-24">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="font-display text-4xl sm:text-5xl font-800 text-white mb-4">
              Что показывает диагностика
            </h2>
            <p className="text-lg text-white/60 max-w-xl mx-auto">
              Восемь ключевых зон, в которых IT-продукты чаще всего сталкиваются с правовыми проблемами
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: FileText, title: "Документы и оферта", desc: "Есть ли у продукта правовая защита в спорах с пользователями" },
              { icon: Lock, title: "Персональные данные", desc: "Соответствует ли работа с данными применимым требованиям законодательства" },
              { icon: Shield, title: "Права на продукт", desc: "Оформлены ли исключительные права на код и результаты разработки" },
              { icon: AlertTriangle, title: "Хранение данных", desc: "Где хранятся данные российских пользователей и есть ли риск блокировки" },
              { icon: Users, title: "Работа с клиентами", desc: "Защищена ли компания при работе с физическими лицами" },
              { icon: Scale, title: "Платёжная модель", desc: "Корректно ли оформлены расчёты и работа через посредников" },
              { icon: CheckCircle2, title: "Подрядчики", desc: "Переданы ли права на результаты работ подрядчиков" },
              { icon: Zap, title: "Регулируемые сферы", desc: "Нужны ли лицензии и специальные разрешения для вашей деятельности" },
            ].map((item, i) => (
              <div key={i} className="card-dark p-5 animate-fade-in-up" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="w-10 h-10 rounded-lg bg-white/8 flex items-center justify-center mb-4">
                  <item.icon className="w-5 h-5 text-white/70" />
                </div>
                <h3 className="font-display font-700 text-white text-sm mb-2">{item.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHAT YOU GET ── */}
      <section className="py-24 bg-background">
        <div className="container">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="font-display text-4xl sm:text-5xl font-800 leading-tight mb-6">
                Что вы получите
                <br />
                <span className="text-gradient">по итогам</span>
              </h2>
              <p className="text-lg text-muted-foreground mb-10">
                Не просто список вопросов, а структурированный вывод с конкретными последствиями и ссылками на нормы закона.
              </p>

              <div className="space-y-5">
                {[
                  { title: "Категория риска", desc: "Низкий, умеренный, высокий или критический — с объяснением, почему именно эта оценка" },
                  { title: "Матрица зон риска", desc: "Наглядное отображение того, в каких зонах выявлены проблемы" },
                  { title: "Ключевые риски с последствиями", desc: "До 5 рисков с денежными последствиями, влиянием на бизнес и применимыми правовыми основаниями" },
                  { title: "Главный вывод", desc: "Итоговая оценка правовой устойчивости продукта на текущем этапе" },
                ].map((item, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <ChevronRight className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div>
                      <div className="font-display font-700 text-foreground mb-1">{item.title}</div>
                      <div className="text-muted-foreground text-sm leading-relaxed">{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Mock result card */}
            <div className="relative">
              <div className="card-premium p-8 rounded-2xl">
                <div className="flex items-center justify-between mb-6">
                  <div className="font-display font-800 text-lg">Результат диагностики</div>
                  <span className="risk-badge risk-high">Высокий риск</span>
                </div>
                <div className="space-y-4">
                  {[
                    { label: "Права на продукт", level: "critical", pct: 90 },
                    { label: "Персональные данные", level: "high", pct: 70 },
                    { label: "Пользовательские документы", level: "high", pct: 65 },
                    { label: "Хранение данных", level: "moderate", pct: 40 },
                    { label: "Платёжная модель", level: "low", pct: 20 },
                  ].map((row) => (
                    <div key={row.label}>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="text-foreground font-medium">{row.label}</span>
                        <span className={`text-xs font-600 ${row.level === "critical" ? "text-red-600" : row.level === "high" ? "text-orange-500" : row.level === "moderate" ? "text-yellow-600" : "text-green-600"}`}>
                          {row.level === "critical" ? "Критично" : row.level === "high" ? "Высокий" : row.level === "moderate" ? "Умеренный" : "Низкий"}
                        </span>
                      </div>
                      <div className="progress-track">
                        <div
                          className="progress-fill"
                          style={{
                            width: `${row.pct}%`,
                            background: row.level === "critical" ? "oklch(55% 0.22 20)" : row.level === "high" ? "oklch(68% 0.20 40)" : row.level === "moderate" ? "oklch(72% 0.18 75)" : "oklch(65% 0.18 145)",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-6 p-4 rounded-xl bg-muted/60 text-sm text-muted-foreground leading-relaxed">
                  Выявлены существенные правовые риски в ключевых зонах. Рекомендуется провести расширенную диагностику.
                </div>
              </div>
              {/* Floating badge */}
              <div className="absolute -top-4 -right-4 bg-primary text-primary-foreground text-xs font-700 px-3 py-1.5 rounded-full shadow-lg">
                Пример отчёта
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── WHO IT'S FOR ── */}
      <section className="section-dark py-24">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="font-display text-4xl sm:text-5xl font-800 text-white mb-4">
              Для кого подходит
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[
              { emoji: "🚀", title: "Стартапы и MVP", desc: "Проверьте правовую конструкцию до первых пользователей и инвестиционных переговоров" },
              { emoji: "📦", title: "Зрелые продукты", desc: "Убедитесь, что рост не создал новых правовых рисков, которые вы ещё не заметили" },
              { emoji: "💼", title: "Предприниматели", desc: "Получите первичную оценку без дорогостоящей консультации юриста" },
              { emoji: "🏢", title: "Продуктовые команды", desc: "Выявите риски перед запуском новой функциональности или выходом на новый рынок" },
              { emoji: "🤝", title: "Перед сделкой", desc: "Оцените правовую устойчивость продукта перед переговорами с инвестором или покупателем" },
              { emoji: "🌍", title: "Масштабирование", desc: "Проверьте, готов ли продукт к росту аудитории с правовой точки зрения" },
            ].map((item, i) => (
              <div key={i} className="card-dark p-6">
                <div className="text-3xl mb-3">{item.emoji}</div>
                <h3 className="font-display font-700 text-white mb-2">{item.title}</h3>
                <p className="text-white/55 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="py-24 bg-background">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="font-display text-4xl sm:text-5xl font-800 mb-4">
              Как проходит диагностика
            </h2>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto">
              Четыре простых шага — от запуска до готового отчёта
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 max-w-5xl mx-auto">
            {[
              { step: "01", icon: FileText, title: "Оставьте контакт", desc: "Укажите email и название продукта — это займёт 30 секунд" },
              { step: "02", icon: CheckCircle2, title: "Ответьте на 8 вопросов", desc: "Вопросы о продукте, данных, документах и правах. Можно вернуться и изменить ответ" },
              { step: "03", icon: Zap, title: "Получите результат", desc: "Система рассчитает категорию риска и сформирует персональный отчёт" },
              { step: "04", icon: ArrowRight, title: "Узнайте, что делать дальше", desc: "Получите рекомендации и при необходимости — предложение расширенной диагностики" },
            ].map((item, i) => (
              <div key={i} className="text-center">
                <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/8 border border-primary/15 mb-5">
                  <item.icon className="w-7 h-7 text-primary" />
                  <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-800 flex items-center justify-center font-display">
                    {i + 1}
                  </span>
                </div>
                <h3 className="font-display font-700 text-foreground mb-2">{item.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHY TRUST ── */}
      <section className="section-dark py-24">
        <div className="container">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="font-display text-4xl sm:text-5xl font-800 text-white mb-6">
                Почему результату
                <br />можно доверять
              </h2>
              <div className="space-y-6">
                {[
                  { icon: Scale, title: "Основано на реальных нормах", desc: "Каждый риск привязан к конкретным применимым правовым основаниям и актуальным нормам" },
                  { icon: AlertTriangle, title: "Трёхуровневая система оценки", desc: "Критические события, существенные риски и накопительный балл — не один параметр, а комплексная модель" },
                  { icon: Shield, title: "Прозрачная методология", desc: "Вы видите, какие именно зоны проверялись и почему присвоена та или иная категория риска" },
                  { icon: Clock, title: "Это не юридическая консультация", desc: "Диагностика — предварительная оценка, которая помогает понять, нужна ли полноценная проверка. Мы честно говорим об ограничениях" },
                ].map((item, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="w-10 h-10 rounded-xl bg-white/8 flex items-center justify-center flex-shrink-0">
                      <item.icon className="w-5 h-5 text-white/70" />
                    </div>
                    <div>
                      <div className="font-display font-700 text-white mb-1">{item.title}</div>
                      <div className="text-white/55 text-sm leading-relaxed">{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              {[
                { label: "Права на продукт", law: "Применимые правовые основания" },
                { label: "Персональные данные", law: "Применимые требования и практика" },
                { label: "Защита потребителей", law: "Применимые правовые основания" },
                { label: "Хранение данных", law: "Обязательные требования" },
                { label: "Платёжная модель", law: "Применимые правовые основания" },
              ].map((item, i) => (
                <div key={i} className="card-dark p-4 flex items-center justify-between">
                  <span className="text-white font-medium text-sm">{item.label}</span>
                  <span className="text-white/40 text-xs font-mono">{item.law}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── PAID DIAGNOSTIC SECTION ── */}
      <section className="py-24 bg-background border-t border-border">
        <div className="container">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/8 border border-primary/15 text-primary text-sm font-medium mb-6">
                <Shield className="w-3.5 h-3.5" />
                Углублённая диагностика
              </div>
              <h2 className="font-display text-3xl sm:text-4xl font-800 leading-tight mb-4">
                Полный правовой аудит
                <br />
                <span className="text-gradient">за 4 900 ₽</span>
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                14 блоков анализа, 50+ вопросов, AI-отчёт с дорожной картой устранения рисков на 30/60/90 дней. Загрузка документов, конкретные правовые основания, финансовые последствия каждого риска.
              </p>
              <ul className="space-y-2 mb-8">
                {[
                  "Корпоративная структура и права на продукт",
                  "Персональные данные и соответствие применимым требованиям",
                  "Договорная база с командой и подрядчиками",
                  "Платёжная модель и финансовое регулирование",
                  "Дорожная карта устранения рисков 30/60/90 дней",
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <button
                onClick={handleStartPaid}
                className="btn-electric flex items-center gap-2 px-8 py-4 text-base rounded-xl"
              >
                Начать углублённую диагностику
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { num: "14", label: "блоков анализа" },
                { num: "50+", label: "вопросов" },
                { num: "30/60/90", label: "дней дорожная карта" },
                { num: "AI", label: "генерация отчёта" },
              ].map((stat) => (
                <div key={stat.label} className="card-premium p-6 text-center">
                  <div className="font-display text-3xl font-800 text-foreground mb-1">{stat.num}</div>
                  <div className="text-sm text-muted-foreground">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24 bg-background">
        <div className="container text-center">
          <h2 className="font-display text-4xl sm:text-5xl font-800 mb-6">
            Готовы узнать, как обстоят дела
            <br />
            <span className="text-gradient">с вашим продуктом?</span>
          </h2>
          <p className="text-lg text-muted-foreground mb-10 max-w-lg mx-auto">
            Бесплатная диагностика занимает 5–7 минут. Результат — сразу после завершения.
          </p>
          <button
            onClick={handleStartDiagnostic}
            className="btn-electric flex items-center gap-2 px-10 py-4 text-base rounded-xl mx-auto"
          >
            Начать диагностику
            <ArrowRight className="w-5 h-5" />
          </button>
          <p className="text-sm text-muted-foreground mt-4">
            Без регистрации · Без оплаты · Результат сразу
          </p>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="section-dark py-10 border-t border-white/8">
        <div className="container flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center">
              <Scale className="w-3.5 h-3.5 text-white/70" />
            </div>
            <span className="font-display font-700 text-white">Lexy</span>
          </div>
          <p className="text-white/40 text-sm text-center">
            Диагностика носит информационный характер и не является юридической консультацией.
          </p>
          <p className="text-white/30 text-xs">© 2025 Lexy</p>
        </div>
      </footer>
    </div>
  );
}
