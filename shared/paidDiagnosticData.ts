// ─── Paid Diagnostic Data ─────────────────────────────────────────────────────
// 14 blocks, ~45 mandatory + 15 branching questions
// Version: v1

export type AnswerType = "single" | "multi" | "text" | "file";

export interface AnswerOption {
  id: string;
  label: string;
  riskFlag?: boolean; // triggers risk scoring
  criticalTrigger?: boolean; // escalates to high/critical
  branchTrigger?: string; // opens additional block
}

export interface PaidQuestion {
  id: string;
  blockId: number;
  text: string;
  hint?: string; // "зачем мы это спрашиваем"
  type: AnswerType;
  options?: AnswerOption[];
  required?: boolean;
  branchCondition?: {
    questionId: string;
    answerIds: string[];
  };
  riskWeight?: number;
}

export interface PaidBlock {
  id: number;
  title: string;
  description: string;
  why: string; // зачем спрашиваем
  what: string; // что это даёт в отчёте
  questions: PaidQuestion[];
  hasFileUpload?: boolean;
}

// ─── BLOCK 1: Общая информация о компании и продукте ─────────────────────────
const block1: PaidBlock = {
  id: 1,
  title: "Общая информация о компании и продукте",
  description: "Расскажите о своём продукте и бизнес-модели",
  why: "Чтобы понять, что именно вы продаёте, кто ваши клиенты и к какому типу правовых рисков относится продукт в первую очередь.",
  what: "Правильную квалификацию модели бизнеса и контекст для всех остальных выводов.",
  questions: [
    {
      id: "b1_q1",
      blockId: 1,
      text: "Как называется ваш продукт или сервис?",
      hint: "Это поможет персонализировать отчёт.",
      type: "text",
      required: true,
    },
    {
      id: "b1_q2",
      blockId: 1,
      text: "Как лучше всего описать ваш продукт?",
      hint: "Выберите наиболее подходящий вариант.",
      type: "single",
      required: true,
      options: [
        { id: "saas", label: "SaaS / облачный сервис по подписке" },
        { id: "marketplace", label: "Маркетплейс или платформа" },
        { id: "mobile_app", label: "Мобильное приложение" },
        { id: "b2b_software", label: "B2B-программное обеспечение" },
        { id: "fintech", label: "Финтех / платёжный сервис", riskFlag: true },
        { id: "edtech", label: "Образовательный сервис" },
        { id: "medtech", label: "Медицинский / health-сервис", riskFlag: true },
        { id: "ai_product", label: "AI-продукт или сервис на основе ИИ" },
        { id: "other", label: "Иное" },
      ],
    },
    {
      id: "b1_q3",
      blockId: 1,
      text: "Кто ваши основные клиенты?",
      type: "multi",
      required: true,
      options: [
        { id: "b2c", label: "Физические лица (B2C)", branchTrigger: "block_consumer" },
        { id: "b2b_small", label: "Малый и средний бизнес (B2B)" },
        { id: "b2b_enterprise", label: "Крупные корпоративные клиенты (Enterprise)" },
        { id: "b2g", label: "Государственные заказчики (B2G)", riskFlag: true },
        { id: "mixed", label: "Смешанная модель" },
      ],
    },
    {
      id: "b1_q4",
      blockId: 1,
      text: "На каком рынке работает продукт?",
      type: "single",
      required: true,
      options: [
        { id: "russia_only", label: "Только Россия" },
        { id: "russia_cis", label: "Россия и СНГ" },
        { id: "international", label: "Международный рынок", riskFlag: true },
        { id: "russia_international", label: "Россия + международный рынок", riskFlag: true },
      ],
    },
    {
      id: "b1_q5",
      blockId: 1,
      text: "На каком этапе развития находится продукт?",
      type: "single",
      required: true,
      options: [
        { id: "idea", label: "Идея / разработка" },
        { id: "mvp", label: "MVP / первые пользователи" },
        { id: "growth", label: "Активный рост / масштабирование" },
        { id: "mature", label: "Зрелый продукт" },
        { id: "pre_investment", label: "Подготовка к инвестициям", branchTrigger: "block_investment" },
        { id: "pre_sale", label: "Подготовка к продаже бизнеса", branchTrigger: "block_investment" },
      ],
    },
    {
      id: "b1_q6",
      blockId: 1,
      text: "Что для вас важнее всего по итогам диагностики?",
      hint: "Можно выбрать несколько вариантов.",
      type: "multi",
      required: true,
      options: [
        { id: "goal_ip", label: "Проверить права на продукт" },
        { id: "goal_investment", label: "Подготовиться к инвестициям" },
        { id: "goal_sale", label: "Подготовиться к продаже бизнеса" },
        { id: "goal_enterprise", label: "Подготовиться к работе с крупными корпоративными клиентами" },
        { id: "goal_pd", label: "Разобраться с персональными данными" },
        { id: "goal_docs", label: "Разобраться с пользовательскими документами" },
        { id: "goal_partner", label: "Проверить партнёрскую модель" },
        { id: "goal_general", label: "Выявить главные юридические риски в целом" },
        { id: "goal_other", label: "Иное" },
      ],
    },
  ],
};

// ─── BLOCK 2: Корпоративное право и структура бизнеса ────────────────────────
const block2: PaidBlock = {
  id: 2,
  title: "Корпоративное право и структура бизнеса",
  description: "Юридическая структура компании и распределение активов",
  why: "Чтобы понять, на каком лице находятся права, деньги, договоры и ответственность.",
  what: "Вывод о том, есть ли разрыв между бизнесом, активами и юридической структурой.",
  questions: [
    {
      id: "b2_q1",
      blockId: 2,
      text: "Какова организационно-правовая форма вашей компании?",
      type: "single",
      required: true,
      options: [
        { id: "ooo", label: "ООО" },
        { id: "ao", label: "АО / ПАО" },
        { id: "ip", label: "ИП" },
        { id: "foreign", label: "Иностранная компания", riskFlag: true },
        { id: "group", label: "Группа компаний / холдинг", riskFlag: true },
        { id: "none", label: "Нет юридического лица", criticalTrigger: true },
      ],
    },
    {
      id: "b2_q2",
      blockId: 2,
      text: "На каком юридическом лице зарегистрированы права на продукт, код и ключевые активы?",
      type: "single",
      required: true,
      options: [
        { id: "same", label: "На том же лице, что ведёт бизнес" },
        { id: "different", label: "На другом юридическом лице", riskFlag: true },
        { id: "founder", label: "На физическом лице (основатель)", criticalTrigger: true },
        { id: "unclear", label: "Не уверен(а)", riskFlag: true },
      ],
    },
    {
      id: "b2_q3",
      blockId: 2,
      text: "Есть ли у компании несколько учредителей или сооснователей?",
      type: "single",
      required: true,
      options: [
        { id: "no", label: "Нет, один учредитель" },
        { id: "yes_agreement", label: "Да, есть корпоративное соглашение" },
        { id: "yes_no_agreement", label: "Да, без корпоративного соглашения", riskFlag: true },
        { id: "yes_informal", label: "Да, но один из сооснователей не оформлен", criticalTrigger: true },
      ],
    },
    {
      id: "b2_q4",
      blockId: 2,
      text: "Есть ли иностранные учредители, акционеры или бенефициары?",
      type: "single",
      required: true,
      options: [
        { id: "no", label: "Нет" },
        { id: "yes", label: "Да", riskFlag: true },
        { id: "unclear", label: "Не уверен(а)" },
      ],
    },
    {
      id: "b2_q5",
      blockId: 2,
      text: "Есть ли неурегулированные корпоративные конфликты, просроченные обязательства или споры между участниками?",
      type: "single",
      required: true,
      options: [
        { id: "no", label: "Нет" },
        { id: "yes", label: "Да", criticalTrigger: true },
        { id: "unclear", label: "Не уверен(а)", riskFlag: true },
      ],
    },
  ],
};

// ─── BLOCK 3: Продукт, монетизация и каналы продаж ───────────────────────────
const block3: PaidBlock = {
  id: 3,
  title: "Продукт, монетизация и каналы продаж",
  description: "Бизнес-модель и способы получения дохода",
  why: "Чтобы определить, какие договорные, потребительские и регуляторные риски возникают из вашей бизнес-модели.",
  what: "Оценку рисков по подписке, возвратам, обещаниям результата, продажам через партнёров и посредников.",
  questions: [
    {
      id: "b3_q1",
      blockId: 3,
      text: "Как монетизируется продукт?",
      type: "multi",
      required: true,
      options: [
        { id: "subscription", label: "Подписка / рекуррентные платежи", riskFlag: true },
        { id: "one_time", label: "Разовая оплата" },
        { id: "freemium", label: "Freemium" },
        { id: "marketplace_fee", label: "Комиссия с транзакций" },
        { id: "b2b_contract", label: "Корпоративные контракты" },
        { id: "advertising", label: "Реклама / монетизация данных", riskFlag: true },
        { id: "no_revenue", label: "Пока без выручки" },
      ],
    },
    {
      id: "b3_q2",
      blockId: 3,
      text: "Через какие каналы продаётся продукт?",
      type: "multi",
      required: true,
      options: [
        { id: "direct", label: "Прямые продажи" },
        { id: "app_store", label: "App Store / Google Play", riskFlag: true },
        { id: "partners", label: "Через партнёров / реселлеров", branchTrigger: "block_partners" },
        { id: "marketplace", label: "Через маркетплейс" },
        { id: "white_label", label: "White-label / под брендом партнёра", riskFlag: true },
      ],
    },
    {
      id: "b3_q3",
      blockId: 3,
      text: "Есть ли в маркетинге или интерфейсе обещания результата, гарантии или сравнения с конкурентами?",
      type: "single",
      required: true,
      options: [
        { id: "no", label: "Нет" },
        { id: "yes", label: "Да", riskFlag: true },
        { id: "unclear", label: "Не уверен(а)" },
      ],
    },
  ],
};

// ─── BLOCK 4: Интеллектуальная собственность и IT-активы ─────────────────────
const block4: PaidBlock = {
  id: 4,
  title: "Интеллектуальная собственность и IT-активы",
  description: "Права на код, бренд и ключевые результаты разработки",
  why: "Чтобы понять, действительно ли компания владеет кодом, брендом, данными и ключевыми результатами разработки.",
  what: "Вывод о том, можно ли безопасно масштабировать продукт, продавать его, лицензировать или показывать инвестору.",
  hasFileUpload: true,
  questions: [
    {
      id: "b4_q1",
      blockId: 4,
      text: "Кто разрабатывал продукт?",
      type: "multi",
      required: true,
      options: [
        { id: "inhouse", label: "Штатные разработчики" },
        { id: "contractors", label: "Внешние подрядчики / фрилансеры", branchTrigger: "block_contractors", riskFlag: true },
        { id: "outsource", label: "Аутсорс-команда", branchTrigger: "block_contractors", riskFlag: true },
        { id: "founder", label: "Основатель(и) самостоятельно" },
        { id: "mixed", label: "Смешанная команда" },
      ],
    },
    {
      id: "b4_q2",
      blockId: 4,
      text: "Со всеми ли лицами, участвовавшими в разработке, заключены письменные договоры?",
      type: "single",
      required: true,
      options: [
        { id: "all", label: "Да, со всеми" },
        { id: "most", label: "С большей частью" },
        { id: "partial", label: "Только с частью", riskFlag: true },
        { id: "no", label: "Нет", criticalTrigger: true },
        { id: "unclear", label: "Не уверен(а)", riskFlag: true },
      ],
    },
    {
      id: "b4_q3",
      blockId: 4,
      text: "Во всех ли договорах с разработчиками предусмотрена передача исключительных прав?",
      type: "single",
      required: true,
      options: [
        { id: "all", label: "Да, во всех" },
        { id: "partial", label: "Только в части договоров", riskFlag: true },
        { id: "no", label: "Нет", criticalTrigger: true },
        { id: "unclear", label: "Не уверен(а)", criticalTrigger: true },
      ],
    },
    {
      id: "b4_q4",
      blockId: 4,
      text: "Используется ли открытое программное обеспечение (open source)?",
      type: "single",
      required: true,
      options: [
        { id: "no", label: "Нет" },
        { id: "limited", label: "Да, в ограниченном объёме" },
        { id: "significant", label: "Да, существенно", riskFlag: true },
        { id: "unclear", label: "Не уверен(а)" },
      ],
    },
    {
      id: "b4_q5",
      blockId: 4,
      text: "Используются ли сторонние библиотеки, шаблоны, изображения, шрифты, датасеты, модели ИИ или иные внешние объекты с ограниченными правами?",
      type: "single",
      required: true,
      options: [
        { id: "no", label: "Нет" },
        { id: "yes", label: "Да", riskFlag: true },
        { id: "unclear", label: "Не уверен(а)" },
      ],
    },
    {
      id: "b4_q6",
      blockId: 4,
      text: "Зарегистрированы ли товарные знаки, домены, бренды, логотипы?",
      type: "multi",
      required: true,
      options: [
        { id: "tm_registered", label: "Товарный знак зарегистрирован" },
        { id: "tm_pending", label: "Подана заявка на регистрацию" },
        { id: "tm_none", label: "Используется без регистрации", riskFlag: true },
        { id: "domain_registered", label: "Зарегистрирован домен" },
        { id: "unclear", label: "Не уверен(а)" },
      ],
    },
    {
      id: "b4_q7",
      blockId: 4,
      text: "Есть ли споры, претензии или сомнения по правам на код, бренд, контент или иные объекты интеллектуальной собственности?",
      type: "single",
      required: true,
      options: [
        { id: "no", label: "Нет" },
        { id: "yes", label: "Да", criticalTrigger: true },
        { id: "unclear", label: "Не уверен(а)", riskFlag: true },
      ],
    },
    {
      id: "b4_q8",
      blockId: 4,
      text: "Используются ли сторонние модели ИИ, API или провайдеры, условия которых ограничивают коммерческое использование?",
      type: "single",
      required: true,
      options: [
        { id: "no", label: "Нет" },
        { id: "yes", label: "Да", riskFlag: true },
        { id: "unclear", label: "Не уверен(а)" },
      ],
    },
    {
      id: "b4_q9",
      blockId: 4,
      text: "Прикрепите договоры с разработчиками, лицензионные соглашения, документы по интеллектуальной собственности (если готовы предоставить для анализа)",
      type: "file",
      required: false,
    },
  ],
};

// ─── BLOCK 5: Персональные данные, конфиденциальность и инфраструктура ────────
const block5: PaidBlock = {
  id: 5,
  title: "Персональные данные и информационная инфраструктура",
  description: "Сбор, хранение и обработка данных пользователей",
  why: "Чтобы проверить, законно ли вы собираете, храните и передаёте данные пользователей.",
  what: "Карту рисков по 152-ФЗ, хранению данных, подрядчикам, аналитике и инцидентам.",
  hasFileUpload: true,
  questions: [
    {
      id: "b5_q1",
      blockId: 5,
      text: "Какие данные собираются или обрабатываются в продукте?",
      type: "multi",
      required: true,
      options: [
        { id: "name", label: "ФИО / имя" },
        { id: "email", label: "Email" },
        { id: "phone", label: "Телефон" },
        { id: "company", label: "Должность / компания" },
        { id: "payment", label: "Платёжные данные", riskFlag: true },
        { id: "geo", label: "Геолокация", riskFlag: true },
        { id: "ip", label: "IP-адрес / данные об устройстве" },
        { id: "photo_video", label: "Фото / видео", riskFlag: true },
        { id: "health", label: "Данные о здоровье", criticalTrigger: true },
        { id: "biometric", label: "Биометрия", criticalTrigger: true },
        { id: "children", label: "Данные детей / несовершеннолетних", criticalTrigger: true },
        { id: "other", label: "Иное" },
      ],
    },
    {
      id: "b5_q2",
      blockId: 5,
      text: "Где хранятся данные пользователей?",
      type: "single",
      required: true,
      options: [
        { id: "russia", label: "Только в России" },
        { id: "mixed", label: "Частично в России, частично за рубежом", riskFlag: true },
        { id: "abroad", label: "Только за рубежом", criticalTrigger: true },
        { id: "unclear", label: "Не уверен(а)", riskFlag: true },
      ],
    },
    {
      id: "b5_q3",
      blockId: 5,
      text: "Есть ли у компании политика обработки персональных данных?",
      type: "single",
      required: true,
      options: [
        { id: "yes", label: "Да" },
        { id: "no", label: "Нет", criticalTrigger: true },
        { id: "unclear", label: "Не уверен(а)", riskFlag: true },
      ],
    },
    {
      id: "b5_q4",
      blockId: 5,
      text: "Есть ли согласия на обработку персональных данных там, где они требуются?",
      type: "single",
      required: true,
      options: [
        { id: "yes", label: "Да" },
        { id: "partial", label: "Частично", riskFlag: true },
        { id: "no", label: "Нет", criticalTrigger: true },
        { id: "unclear", label: "Не уверен(а)", riskFlag: true },
      ],
    },
    {
      id: "b5_q5",
      blockId: 5,
      text: "Направлялось ли уведомление в Роскомнадзор, если оно требовалось?",
      type: "single",
      required: true,
      options: [
        { id: "yes", label: "Да" },
        { id: "no", label: "Нет", riskFlag: true },
        { id: "unclear", label: "Не уверен(а)", riskFlag: true },
        { id: "not_required", label: "Считаем, что не требуется" },
      ],
    },
    {
      id: "b5_q6",
      blockId: 5,
      text: "Были ли утечки, инциденты безопасности, обращения субъектов данных, претензии или проверки?",
      type: "single",
      required: true,
      options: [
        { id: "no", label: "Нет" },
        { id: "yes", label: "Да", criticalTrigger: true },
        { id: "unclear", label: "Не уверен(а)" },
      ],
    },
    {
      id: "b5_q7",
      blockId: 5,
      text: "Используются ли cookie, трекеры, маркетинговые пиксели, поведенческий таргетинг?",
      type: "single",
      required: true,
      options: [
        { id: "no", label: "Нет" },
        { id: "yes", label: "Да", riskFlag: true },
        { id: "unclear", label: "Не уверен(а)" },
      ],
    },
    {
      id: "b5_q8",
      blockId: 5,
      text: "Прикрепите документы по персональным данным (если готовы предоставить для анализа)",
      type: "file",
      required: false,
    },
  ],
};

// ─── BLOCK 6: Договорная база и пользовательские документы ───────────────────
const block6: PaidBlock = {
  id: 6,
  title: "Договорная база и пользовательские документы",
  description: "Наличие и качество ключевых правовых документов",
  why: "Чтобы понять, насколько хорошо оформлены отношения с клиентами, подрядчиками, партнёрами и пользователями.",
  what: "Вывод о слабых местах оферты, договоров с клиентами, соглашений об уровне сервиса, соглашений о конфиденциальности, лицензий и шаблонов.",
  hasFileUpload: true,
  questions: [
    {
      id: "b6_q1",
      blockId: 6,
      text: "Какие из следующих документов уже существуют?",
      type: "multi",
      required: true,
      options: [
        { id: "offer", label: "Публичная оферта" },
        { id: "user_agreement", label: "Пользовательское соглашение" },
        { id: "privacy", label: "Политика конфиденциальности" },
        { id: "consent", label: "Согласие на обработку персональных данных" },
        { id: "cookie", label: "Политика использования файлов cookie" },
        { id: "b2b_contract", label: "Договор с компанией-клиентом" },
        { id: "sla", label: "Соглашение об уровне сервиса (SLA)" },
        { id: "nda", label: "Соглашение о конфиденциальности (NDA)" },
        { id: "dpa", label: "Соглашение об обработке данных (DPA)" },
        { id: "license", label: "Лицензионный договор" },
        { id: "agency", label: "Агентский / партнёрский договор" },
        { id: "dev_contract", label: "Договор с разработчиком" },
        { id: "none", label: "Ничего из перечисленного", criticalTrigger: true },
      ],
    },
    {
      id: "b6_q2",
      blockId: 6,
      text: "Насколько вы уверены в актуальности и корректности этих документов?",
      type: "single",
      required: true,
      options: [
        { id: "current", label: "Документы актуальны и регулярно обновляются" },
        { id: "old", label: "Документы есть, но давно не проверялись", riskFlag: true },
        { id: "partial", label: "Документы есть частично", riskFlag: true },
        { id: "almost_none", label: "Документов почти нет", criticalTrigger: true },
        { id: "unclear", label: "Не уверен(а)", riskFlag: true },
      ],
    },
    {
      id: "b6_q3",
      blockId: 6,
      text: "Есть ли обязательства, которые могут быть для вас опасны: неограниченная ответственность, жёсткие требования к качеству, крупные штрафы, условие об исключительности?",
      type: "single",
      required: true,
      options: [
        { id: "no", label: "Нет" },
        { id: "yes", label: "Да", riskFlag: true },
        { id: "unclear", label: "Не уверен(а)" },
      ],
    },
    {
      id: "b6_q4",
      blockId: 6,
      text: "Прикрепите ключевые договоры и шаблоны (если готовы предоставить для анализа)",
      type: "file",
      required: false,
    },
  ],
};

// ─── BLOCK 7: Платёжная модель, расчёты и возвраты ───────────────────────────
const block7: PaidBlock = {
  id: 7,
  title: "Платёжная модель, расчёты и возвраты",
  description: "Кто принимает деньги и как оформляются расчёты",
  why: "Чтобы увидеть, кто реально принимает деньги, кто отвечает за возвраты и где может возникнуть конфликт между выручкой и юридической конструкцией.",
  what: "Оценку риска по подпискам, агентским схемам, платежам через посредников и возвратам.",
  questions: [
    {
      id: "b7_q1",
      blockId: 7,
      text: "Кто принимает деньги от клиентов?",
      type: "single",
      required: true,
      options: [
        { id: "direct", label: "Компания напрямую" },
        { id: "aggregator", label: "Платёжный агрегатор" },
        { id: "agent", label: "Агент / посредник", riskFlag: true },
        { id: "foreign", label: "Иностранный провайдер", criticalTrigger: true },
        { id: "partner", label: "Партнёр / реселлер", riskFlag: true },
        { id: "multiple", label: "Несколько моделей одновременно", riskFlag: true },
      ],
    },
    {
      id: "b7_q2",
      blockId: 7,
      text: "Есть ли рекуррентные списания, автопродления или подписка?",
      type: "single",
      required: true,
      options: [
        { id: "no", label: "Нет" },
        { id: "yes", label: "Да", riskFlag: true },
        { id: "planned", label: "Планируется" },
      ],
    },
    {
      id: "b7_q3",
      blockId: 7,
      text: "Есть ли международные платежи, расчёты в иностранной валюте или клиенты из-за рубежа?",
      type: "single",
      required: true,
      options: [
        { id: "no", label: "Нет" },
        { id: "yes", label: "Да", riskFlag: true },
        { id: "planned", label: "Планируется" },
      ],
    },
    {
      id: "b7_q4",
      blockId: 7,
      text: "Есть ли споры, оспаривание платежей, массовые возвраты или претензии по оплате?",
      type: "single",
      required: true,
      options: [
        { id: "no", label: "Нет" },
        { id: "yes", label: "Да", criticalTrigger: true },
        { id: "unclear", label: "Не уверен(а)" },
      ],
    },
  ],
};

// ─── BLOCK 8: Потребительское право, реклама и интерфейсные практики ─────────
const block8: PaidBlock = {
  id: 8,
  title: "Потребительское право, реклама и интерфейсные практики",
  description: "Соответствие требованиям к работе с конечными пользователями",
  why: "Чтобы понять, насколько опасны ваши обещания пользователю и не заложены ли в интерфейсе условия, которые потом оборачиваются претензиями.",
  what: "Вывод о рисках по оферте, рекламе, автопродлениям, возвратам и штрафам в спорах с потребителями.",
  questions: [
    {
      id: "b8_q1",
      blockId: 8,
      text: "Есть ли у продукта конечные пользователи-физлица?",
      type: "single",
      required: true,
      options: [
        { id: "no", label: "Нет" },
        { id: "yes", label: "Да", branchTrigger: "block_consumer" },
        { id: "mixed", label: "Смешанная модель", branchTrigger: "block_consumer" },
      ],
    },
    {
      id: "b8_q2",
      blockId: 8,
      text: "Понимает ли пользователь до оплаты, сколько он платит, как списываются деньги, как отменить подписку и как вернуть деньги?",
      type: "single",
      required: true,
      options: [
        { id: "yes", label: "Да" },
        { id: "partial", label: "Частично", riskFlag: true },
        { id: "no", label: "Нет", criticalTrigger: true },
        { id: "unclear", label: "Не уверен(а)", riskFlag: true },
      ],
    },
    {
      id: "b8_q3",
      blockId: 8,
      text: "Используются ли в интерфейсе практики, которые могут быть восприняты как манипулятивные: скрытые условия, сложно отключаемая подписка, навязанные галочки?",
      type: "single",
      required: true,
      options: [
        { id: "no", label: "Нет" },
        { id: "yes", label: "Да", riskFlag: true },
        { id: "unclear", label: "Не уверен(а)" },
      ],
    },
  ],
};

// ─── BLOCK 9: Партнёры, посредники и интеграции ───────────────────────────────
const block9: PaidBlock = {
  id: 9,
  title: "Партнёры, посредники и интеграции",
  description: "Дистрибуция через третьих лиц и зависимость от внешних платформ",
  why: "Чтобы определить, где вы зависите от третьих лиц и как распределяется ответственность в партнёрской модели.",
  what: "Вывод о продажах под брендом партнёра, зависимости от внешних платформ и разрывах в распределении обязательств.",
  questions: [
    {
      id: "b9_q1",
      blockId: 9,
      text: "Есть ли дистрибуция через партнёров, реселлеров, агентов, интеграторов или платформы третьих лиц?",
      type: "single",
      required: true,
      options: [
        { id: "no", label: "Нет" },
        { id: "yes", label: "Да", riskFlag: true },
        { id: "planned", label: "Планируется" },
      ],
    },
    {
      id: "b9_q2",
      blockId: 9,
      text: "Есть ли договоры, которые чётко распределяют ответственность между вами и партнёром?",
      type: "single",
      required: true,
      options: [
        { id: "yes", label: "Да" },
        { id: "partial", label: "Частично", riskFlag: true },
        { id: "no", label: "Нет", riskFlag: true },
        { id: "unclear", label: "Не уверен(а)" },
      ],
    },
    {
      id: "b9_q3",
      blockId: 9,
      text: "Есть ли риски прекращения доступа к внешним платформам, API или данным, критичным для продукта?",
      type: "single",
      required: true,
      options: [
        { id: "no", label: "Нет" },
        { id: "yes", label: "Да", riskFlag: true },
        { id: "unclear", label: "Не уверен(а)" },
      ],
    },
  ],
};

// ─── BLOCK 10: Регуляторные и отраслевые требования ──────────────────────────
const block10: PaidBlock = {
  id: 10,
  title: "Регуляторные и отраслевые требования",
  description: "Специальные режимы регулирования и лицензирование",
  why: "Чтобы понять, не подпадает ли продукт под специальное регулирование, о котором команда не подумала на раннем этапе.",
  what: "Отдельную квалификацию по чувствительным режимам: финансы, медицина, дети, управление персоналом, реклама и другие спецсферы.",
  questions: [
    {
      id: "b10_q1",
      blockId: 10,
      text: "Подпадает ли продукт под специальные режимы регулирования?",
      type: "multi",
      required: true,
      options: [
        { id: "finance", label: "Финансы / платежи", criticalTrigger: true },
        { id: "medicine", label: "Медицина / здоровье", criticalTrigger: true },
        { id: "education", label: "Образование" },
        { id: "hr", label: "Трудовые отношения / управление персоналом" },
        { id: "children", label: "Работа с детьми", criticalTrigger: true },
        { id: "advertising", label: "Реклама", riskFlag: true },
        { id: "sensitive_data", label: "Обработка чувствительных данных", riskFlag: true },
        { id: "gov", label: "Государственные информационные системы / госсектор", riskFlag: true },
        { id: "critical_infra", label: "Критическая инфраструктура / безопасность", criticalTrigger: true },
        { id: "none", label: "Ничего из перечисленного" },
        { id: "unclear", label: "Не уверен(а)" },
      ],
    },
    {
      id: "b10_q2",
      blockId: 10,
      text: "Есть ли лицензии, разрешения, аккредитации или иные формальные требования, без которых работа невозможна или рискованна?",
      type: "single",
      required: true,
      options: [
        { id: "no", label: "Нет" },
        { id: "yes", label: "Да, и они получены" },
        { id: "yes_missing", label: "Да, но не все получены", criticalTrigger: true },
        { id: "unclear", label: "Не уверен(а)", riskFlag: true },
      ],
    },
    {
      id: "b10_q3",
      blockId: 10,
      text: "Были ли запросы, замечания, предписания или требования со стороны регуляторов, платформ, банков или магазинов приложений?",
      type: "single",
      required: true,
      options: [
        { id: "no", label: "Нет" },
        { id: "yes", label: "Да", riskFlag: true },
        { id: "unclear", label: "Не уверен(а)" },
      ],
    },
  ],
};

// ─── BLOCK 11: Команда, сотрудники и подрядчики ───────────────────────────────
const block11: PaidBlock = {
  id: 11,
  title: "Команда, сотрудники и подрядчики",
  description: "Оформление трудовых и гражданско-правовых отношений",
  why: "Чтобы оценить риски по правам на продукт, конфиденциальности, доступам и зависимость от ключевых людей.",
  what: "Вывод о риске потери контроля над кодом, инфраструктурой и знаниями о продукте.",
  questions: [
    {
      id: "b11_q1",
      blockId: 11,
      text: "Кто фактически работает над продуктом?",
      type: "multi",
      required: true,
      options: [
        { id: "employees", label: "Штатные сотрудники" },
        { id: "self_employed", label: "Самозанятые" },
        { id: "ip", label: "ИП-подрядчики" },
        { id: "freelancers", label: "Фрилансеры" },
        { id: "outsource", label: "Аутсорс-команда" },
        { id: "cofounders_informal", label: "Сооснователи без оформления", criticalTrigger: true },
        { id: "multiple", label: "Несколько форм одновременно" },
      ],
    },
    {
      id: "b11_q2",
      blockId: 11,
      text: "Со всеми ли ключевыми лицами, создающими продукт, подписаны договоры?",
      type: "single",
      required: true,
      options: [
        { id: "yes", label: "Да" },
        { id: "partial", label: "Частично", riskFlag: true },
        { id: "no", label: "Нет", criticalTrigger: true },
        { id: "unclear", label: "Не уверен(а)", riskFlag: true },
      ],
    },
    {
      id: "b11_q3",
      blockId: 11,
      text: "Есть ли ключевые люди, уход которых может создать проблему для доступа к коду, инфраструктуре, клиентам или данным?",
      type: "single",
      required: true,
      options: [
        { id: "no", label: "Нет" },
        { id: "yes", label: "Да", riskFlag: true },
        { id: "unclear", label: "Не уверен(а)" },
      ],
    },
    {
      id: "b11_q4",
      blockId: 11,
      text: "Были ли споры или конфликты с сотрудниками / подрядчиками в части оплаты, объёма работ, передачи прав, доступа к системам?",
      type: "single",
      required: true,
      options: [
        { id: "no", label: "Нет" },
        { id: "yes", label: "Да", criticalTrigger: true },
        { id: "unclear", label: "Не уверен(а)" },
      ],
    },
  ],
};

// ─── BLOCK 12: Споры, претензии, проверки, инциденты ─────────────────────────
const block12: PaidBlock = {
  id: 12,
  title: "Споры, претензии, проверки и инциденты",
  description: "Уже материализовавшиеся и потенциальные правовые риски",
  why: "Чтобы выявить уже материализовавшиеся риски и понять, какие проблемы могут перейти в деньги и ограничения в ближайшее время.",
  what: "Отдельный блок по судебным спорам, претензиям и взаимодействию с регуляторами.",
  questions: [
    {
      id: "b12_q1",
      blockId: 12,
      text: "Были ли за последние 3 года судебные споры, претензии или серьёзные конфликты, связанные с продуктом или компанией?",
      type: "single",
      required: true,
      options: [
        { id: "no", label: "Нет" },
        { id: "yes", label: "Да", criticalTrigger: true },
        { id: "unclear", label: "Не уверен(а)" },
      ],
    },
    {
      id: "b12_q2",
      blockId: 12,
      text: "Если были споры, в каких областях?",
      type: "multi",
      required: false,
      branchCondition: { questionId: "b12_q1", answerIds: ["yes"] },
      options: [
        { id: "ip", label: "Интеллектуальная собственность" },
        { id: "pd", label: "Персональные данные" },
        { id: "consumer", label: "Потребительские споры" },
        { id: "contract", label: "Договорные споры" },
        { id: "labor", label: "Трудовые споры" },
        { id: "corporate", label: "Корпоративные споры" },
        { id: "tax", label: "Налоги / регуляторы" },
        { id: "other", label: "Иное" },
      ],
    },
    {
      id: "b12_q3",
      blockId: 12,
      text: "Есть ли сейчас открытые претензии, письма, уведомления, требования удалить контент / код / данные?",
      type: "single",
      required: true,
      options: [
        { id: "no", label: "Нет" },
        { id: "yes", label: "Да", criticalTrigger: true },
        { id: "unclear", label: "Не уверен(а)" },
      ],
    },
    {
      id: "b12_q4",
      blockId: 12,
      text: "Были ли проверки со стороны Роскомнадзора, Роспотребнадзора, ФАС, налоговых органов или иных контролирующих субъектов?",
      type: "single",
      required: true,
      options: [
        { id: "no", label: "Нет" },
        { id: "yes", label: "Да", riskFlag: true },
        { id: "unclear", label: "Не уверен(а)" },
      ],
    },
    {
      id: "b12_q5",
      blockId: 12,
      text: "Опишите наиболее чувствительные для вас правовые проблемы, даже если по ним пока нет формальной претензии",
      type: "text",
      required: false,
    },
  ],
};

// ─── BLOCK 13: Документы и подтверждающие материалы ──────────────────────────
const block13: PaidBlock = {
  id: 13,
  title: "Документы и подтверждающие материалы",
  description: "Что вы готовы предоставить для анализа",
  why: "Чтобы отделить предположения от подтверждённых выводов и понять, что можно проверить документально уже сейчас.",
  what: "Пометки, какие выводы подтверждены документами, а какие предварительны.",
  hasFileUpload: true,
  questions: [
    {
      id: "b13_q1",
      blockId: 13,
      text: "Какие документы вы готовы предоставить сейчас?",
      type: "multi",
      required: false,
      options: [
        { id: "charter", label: "Учредительные документы" },
        { id: "corp_agreement", label: "Корпоративные соглашения" },
        { id: "dev_contracts", label: "Договоры с разработчиками" },
        { id: "license", label: "Лицензионные договоры" },
        { id: "user_docs", label: "Пользовательские документы" },
        { id: "pd_docs", label: "Документы по персональным данным" },
        { id: "client_contracts", label: "Договоры с клиентами" },
        { id: "partner_contracts", label: "Договоры с партнёрами" },
        { id: "brand_docs", label: "Документы по бренду / товарным знакам" },
        { id: "claims", label: "Акты / переписка / претензии" },
        { id: "none", label: "Ничего из перечисленного" },
      ],
    },
    {
      id: "b13_q2",
      blockId: 13,
      text: "Загрузите документы для анализа (необязательно, но повышает точность выводов)",
      type: "file",
      required: false,
    },
    {
      id: "b13_q3",
      blockId: 13,
      text: "Требуется ли вам режим повышенной конфиденциальности / соглашение о конфиденциальности до направления дополнительных материалов?",
      type: "single",
      required: true,
      options: [
        { id: "no", label: "Нет" },
        { id: "yes", label: "Да" },
      ],
    },
  ],
};

// ─── BLOCK 14: Приоритеты и ожидаемый результат ───────────────────────────────
const block14: PaidBlock = {
  id: 14,
  title: "Приоритеты и ожидаемый результат",
  description: "Под какую задачу вы проходите диагностику",
  why: "Чтобы понять, под какую бизнес-задачу клиент проходит диагностику: инвестиции, крупные корпоративные клиенты, продажа бизнеса, упаковка продукта или устранение критических рисков.",
  what: "Адаптацию выводов и плана устранения нарушений под конкретную цель клиента.",
  questions: [
    {
      id: "b14_q1",
      blockId: 14,
      text: "Что вы хотите получить по итогам платной диагностики?",
      type: "multi",
      required: true,
      options: [
        { id: "full_report", label: "Подробный отчёт с рисками" },
        { id: "priority_table", label: "Таблицу проблем и приоритетов" },
        { id: "roadmap", label: "План устранения на 30/60/90 дней" },
        { id: "doc_list", label: "Перечень необходимых документов" },
        { id: "investment_prep", label: "Рекомендации перед инвестициями / сделкой" },
        { id: "doc_package", label: "Подготовку пакета документов после диагностики" },
        { id: "critical_consult", label: "Консультацию по критическим рискам" },
      ],
    },
    {
      id: "b14_q2",
      blockId: 14,
      text: "Есть ли срок, к которому вам нужен результат?",
      type: "text",
      required: false,
    },
    {
      id: "b14_q3",
      blockId: 14,
      text: "Есть ли вопрос, который вы считаете критичным и хотите, чтобы он был отдельно отражён в отчёте?",
      type: "text",
      required: false,
    },
  ],
};

// ─── All blocks ───────────────────────────────────────────────────────────────
export const PAID_BLOCKS: PaidBlock[] = [
  block1, block2, block3, block4, block5,
  block6, block7, block8, block9, block10,
  block11, block12, block13, block14,
];

export const PAID_ANKETA_VERSION = "v1";
export const PAID_PRICE_RUB = 4900;

// ─── Scoring ──────────────────────────────────────────────────────────────────
export interface PaidRiskBlock {
  blockId: number;
  blockTitle: string;
  riskLevel: "low" | "moderate" | "high" | "critical";
  probability: "low" | "medium" | "high";
  impact: "limited" | "significant" | "substantial" | "blocking";
  urgency: "monitor" | "90days" | "30days" | "immediate";
  title: string;
  whatFound: string;
  whyItMatters: string;
  legalBasis: string;
  financialRange: string;
  businessImpact: string;
  whatToDo: string;
}

export interface PaidScoringResult {
  riskCategory: "low" | "moderate" | "high" | "critical";
  totalScore: number;
  criticalTriggers: string[];
  riskBlocks: PaidRiskBlock[];
  keyFindings: string[];
  missingDocuments: string[];
  roadmap: {
    immediate: string[];
    days30: string[];
    days60: string[];
    days90: string[];
    scaling: string[];
  };
  nextStep: {
    type: "doc_package" | "critical_consult" | "investment_prep" | "enterprise_prep" | "legal_audit";
    title: string;
    description: string;
  };
  investmentReadiness?: string;
  scopeLimitations: string[];
}

export function scorePaidDiagnostic(
  answers: Record<string, string | string[]>
): PaidScoringResult {
  let totalScore = 0;
  const criticalTriggers: string[] = [];
  const riskBlocks: PaidRiskBlock[] = [];
  const missingDocuments: string[] = [];
  const keyFindings: string[] = [];

  // Helper to check if answer contains a specific option
  const hasAnswer = (qId: string, optId: string): boolean => {
    const ans = answers[qId];
    if (!ans) return false;
    if (Array.isArray(ans)) return ans.includes(optId);
    return ans === optId;
  };

  const hasAnyAnswer = (qId: string, optIds: string[]): boolean =>
    optIds.some(id => hasAnswer(qId, id));

  // ── Block 2: Corporate structure ──
  if (hasAnswer("b2_q2", "founder")) {
    criticalTriggers.push("Права на продукт зарегистрированы на физическое лицо");
    riskBlocks.push({
      blockId: 2,
      blockTitle: "Корпоративная структура",
      riskLevel: "critical",
      probability: "high",
      impact: "blocking",
      urgency: "immediate",
      title: "Права на продукт зарегистрированы на физическое лицо, а не на компанию",
      whatFound: "Ключевые активы (код, бренд, домены) находятся на физическом лице, а не на юридическом лице, ведущем бизнес.",
      whyItMatters: "При любой сделке — инвестиции, продажа, партнёрство — инвестор или покупатель не сможет получить права на продукт без отдельной сделки с физическим лицом. Это блокирует сделку или существенно снижает оценку.",
      legalBasis: "ст. 1229, 1234 ГК РФ — исключительное право принадлежит правообладателю; передача требует договора об отчуждении.",
      financialRange: "Риск снижения оценки бизнеса на 30–70%; стоимость исправления — от 150 000 до 500 000 руб. при наличии нескольких объектов ИС.",
      businessImpact: "Блокирует инвестиционные сделки, продажу бизнеса и корпоративное кредитование.",
      whatToDo: "Заключить договор об отчуждении исключительных прав с физического лица на юридическое лицо по каждому объекту ИС.",
    });
    totalScore += 40;
  }

  if (hasAnswer("b2_q3", "yes_informal")) {
    criticalTriggers.push("Сооснователь не оформлен юридически");
    riskBlocks.push({
      blockId: 2,
      blockTitle: "Корпоративная структура",
      riskLevel: "critical",
      probability: "high",
      impact: "blocking",
      urgency: "immediate",
      title: "Неоформленный сооснователь — критический корпоративный риск",
      whatFound: "Один или несколько сооснователей фактически участвуют в бизнесе, но не имеют юридически оформленной доли или договора.",
      whyItMatters: "Неоформленный сооснователь может в любой момент предъявить права на долю в бизнесе или на результаты разработки через суд.",
      legalBasis: "ст. 1228, 1229 ГК РФ — права на результаты интеллектуальной деятельности возникают у создателей; ст. 8 Закона об ООО — доля участника определяется уставом и договором.",
      financialRange: "Судебный спор с сооснователем — от 500 000 до нескольких миллионов рублей; риск блокировки сделок.",
      businessImpact: "Блокирует любые корпоративные сделки; создаёт риск судебного оспаривания прав на продукт.",
      whatToDo: "Немедленно оформить отношения с сооснователем: либо ввести в состав участников, либо заключить договор с передачей прав и выплатой вознаграждения.",
    });
    totalScore += 45;
  }

  // ── Block 4: IP ──
  if (hasAnswer("b4_q3", "no") || hasAnswer("b4_q3", "unclear")) {
    criticalTriggers.push("Отсутствует подтверждённый титул на код");
    riskBlocks.push({
      blockId: 4,
      blockTitle: "Интеллектуальная собственность",
      riskLevel: "critical",
      probability: "high",
      impact: "blocking",
      urgency: "immediate",
      title: "Права на код не переданы компании — критический дефект правовой конструкции",
      whatFound: "В договорах с разработчиками отсутствует условие о передаче исключительных прав, либо такие договоры не заключались.",
      whyItMatters: "Без явной передачи исключительных прав разработчик по умолчанию остаётся правообладателем созданного кода (ст. 1228 ГК РФ). Компания использует чужую интеллектуальную собственность без правового основания.",
      legalBasis: "ст. 1228, 1234, 1296 ГК РФ — исключительное право на созданное произведение принадлежит автору, если иное не предусмотрено договором.",
      financialRange: "Компенсация за нарушение исключительных прав: от 10 000 до 5 000 000 руб. либо двукратная стоимость права использования (ст. 1301 ГК РФ). Стоимость исправления — от 200 000 руб.",
      businessImpact: "Продукт юридически принадлежит разработчикам. Инвестор или покупатель не получит чистый актив. Сделка невозможна без исправления.",
      whatToDo: "Заключить договоры об отчуждении исключительных прав с каждым разработчиком, участвовавшим в создании продукта. При наличии служебных произведений — оформить надлежащим образом.",
    });
    totalScore += 45;
  }

  if (hasAnswer("b4_q2", "no")) {
    riskBlocks.push({
      blockId: 4,
      blockTitle: "Интеллектуальная собственность",
      riskLevel: "high",
      probability: "high",
      impact: "substantial",
      urgency: "30days",
      title: "Отсутствуют письменные договоры с разработчиками",
      whatFound: "Разработка велась без письменного оформления отношений с исполнителями.",
      whyItMatters: "Без письменного договора невозможно доказать факт передачи прав и согласованные условия. Устные договорённости не имеют юридической силы для передачи исключительных прав.",
      legalBasis: "ст. 1234 ГК РФ — договор об отчуждении исключительного права заключается в письменной форме под страхом недействительности.",
      financialRange: "Риск претензий от разработчиков: компенсация от 10 000 до 5 000 000 руб. за каждый объект ИС.",
      businessImpact: "Невозможность подтвердить права на продукт при due diligence.",
      whatToDo: "Ретроспективно заключить письменные договоры с каждым разработчиком с условием о передаче исключительных прав.",
    });
    totalScore += 30;
  }

  // ── Block 5: Personal data ──
  if (hasAnswer("b5_q2", "abroad")) {
    criticalTriggers.push("Данные хранятся только за рубежом — нарушение требований локализации");
    riskBlocks.push({
      blockId: 5,
      blockTitle: "Персональные данные",
      riskLevel: "critical",
      probability: "high",
      impact: "blocking",
      urgency: "immediate",
      title: "Данные российских пользователей хранятся исключительно за рубежом",
      whatFound: "Персональные данные граждан России обрабатываются и хранятся только на серверах за пределами Российской Федерации.",
      whyItMatters: "С 1 сентября 2015 года операторы обязаны обеспечить запись, систематизацию, накопление, хранение, уточнение и извлечение персональных данных граждан РФ с использованием баз данных, расположенных на территории РФ.",
      legalBasis: "ст. 18.1 Федерального закона № 152-ФЗ «О персональных данных»; ст. 13.11 КоАП РФ.",
      financialRange: "Штраф до 18 000 000 руб. за повторное нарушение (ст. 13.11 КоАП РФ в ред. 2024 г.); блокировка сервиса Роскомнадзором.",
      businessImpact: "Риск блокировки сервиса на территории РФ; невозможность работы с российскими корпоративными клиентами.",
      whatToDo: "Перенести хранение персональных данных российских пользователей на серверы в РФ; уведомить Роскомнадзор об операторе.",
    });
    totalScore += 45;
  }

  if (hasAnswer("b5_q3", "no")) {
    criticalTriggers.push("Отсутствует политика обработки персональных данных");
    riskBlocks.push({
      blockId: 5,
      blockTitle: "Персональные данные",
      riskLevel: "high",
      probability: "high",
      impact: "substantial",
      urgency: "30days",
      title: "Отсутствует политика обработки персональных данных",
      whatFound: "У компании нет опубликованной политики конфиденциальности / обработки персональных данных.",
      whyItMatters: "Оператор обязан опубликовать политику в отношении обработки персональных данных и обеспечить к ней неограниченный доступ.",
      legalBasis: "ч. 2 ст. 18.1 Федерального закона № 152-ФЗ; ст. 13.11 КоАП РФ — штраф за нарушение.",
      financialRange: "Штраф по ст. 13.11 КоАП РФ: до 300 000 руб. за первичное нарушение; до 500 000 руб. за повторное.",
      businessImpact: "Претензии Роскомнадзора; невозможность работы с корпоративными клиентами, требующими DPA.",
      whatToDo: "Разработать и опубликовать политику обработки персональных данных; разместить ссылку на всех точках сбора данных.",
    });
    totalScore += 25;
  }

  if (hasAnswer("b5_q4", "no")) {
    riskBlocks.push({
      blockId: 5,
      blockTitle: "Персональные данные",
      riskLevel: "high",
      probability: "high",
      impact: "substantial",
      urgency: "30days",
      title: "Отсутствуют согласия на обработку персональных данных",
      whatFound: "Компания собирает персональные данные без надлежащего оформления согласий субъектов.",
      whyItMatters: "Обработка персональных данных без согласия субъекта является нарушением, если иное правовое основание не предусмотрено законом.",
      legalBasis: "ст. 6, 9 Федерального закона № 152-ФЗ; ст. 13.11 КоАП РФ.",
      financialRange: "Штраф до 300 000 руб. за первичное нарушение; до 500 000 руб. за повторное.",
      businessImpact: "Риск жалоб пользователей в Роскомнадзор; блокировка сервиса.",
      whatToDo: "Разработать и внедрить механизм получения согласий на обработку персональных данных на всех точках сбора.",
    });
    totalScore += 20;
  }

  // ── Block 6: Documents ──
  if (hasAnswer("b6_q1", "none")) {
    criticalTriggers.push("Отсутствует договорная база — нет ни одного пользовательского документа");
    riskBlocks.push({
      blockId: 6,
      blockTitle: "Договорная база",
      riskLevel: "critical",
      probability: "high",
      impact: "blocking",
      urgency: "immediate",
      title: "Полное отсутствие пользовательских и договорных документов",
      whatFound: "У компании нет ни одного из базовых правовых документов: ни оферты, ни пользовательского соглашения, ни политики конфиденциальности.",
      whyItMatters: "Без правовых документов компания не может ограничить свою ответственность, урегулировать возвраты, защитить права на контент и данные, а также работать с корпоративными клиентами.",
      legalBasis: "ст. 428, 437 ГК РФ — публичная оферта; Закон РФ № 2300-1 «О защите прав потребителей»; ФЗ № 152-ФЗ.",
      financialRange: "Совокупный риск претензий: от 500 000 до нескольких миллионов рублей. Стоимость разработки базового пакета документов: от 100 000 до 300 000 руб.",
      businessImpact: "Невозможность работы с корпоративными клиентами; полная незащищённость от потребительских претензий.",
      whatToDo: "Немедленно разработать минимальный пакет: оферта / пользовательское соглашение, политика конфиденциальности, согласие на обработку ПД.",
    });
    totalScore += 40;
  }

  // ── Block 10: Regulatory ──
  if (hasAnyAnswer("b10_q1", ["finance", "medicine", "children", "critical_infra"])) {
    criticalTriggers.push("Продукт работает в специально регулируемой сфере");
    riskBlocks.push({
      blockId: 10,
      blockTitle: "Регуляторные требования",
      riskLevel: "critical",
      probability: "high",
      impact: "blocking",
      urgency: "immediate",
      title: "Продукт работает в специально регулируемой сфере без проверки специальных требований",
      whatFound: "Продукт подпадает под специальное регулирование (финансы, медицина, работа с детьми или критическая инфраструктура), однако соответствие специальным требованиям не подтверждено.",
      whyItMatters: "Работа в регулируемых сферах без соответствующих лицензий, разрешений или соблюдения специальных требований является административным или уголовным правонарушением.",
      legalBasis: "ФЗ № 86-ФЗ (медицина), ФЗ № 353-ФЗ (потребительский кредит), ФЗ № 149-ФЗ (информация), ФЗ № 436-ФЗ (защита детей), ФЗ № 187-ФЗ (КИИ) — в зависимости от сферы.",
      financialRange: "Штрафы: от 500 000 до 1 000 000 руб. и выше; риск уголовной ответственности; приостановление деятельности.",
      businessImpact: "Принудительная остановка работы продукта; уголовная ответственность руководителей.",
      whatToDo: "Провести отдельный правовой анализ применимых специальных требований; получить необходимые лицензии и разрешения до масштабирования.",
    });
    totalScore += 40;
  }

  // ── Block 12: Disputes ──
  if (hasAnswer("b12_q1", "yes") || hasAnswer("b12_q3", "yes")) {
    criticalTriggers.push("Есть открытые споры или претензии");
    totalScore += 35;
  }

  // ── Block 7: Payments ──
  if (hasAnswer("b7_q1", "foreign")) {
    criticalTriggers.push("Платежи принимаются через иностранного провайдера");
    riskBlocks.push({
      blockId: 7,
      blockTitle: "Платёжная модель",
      riskLevel: "high",
      probability: "high",
      impact: "substantial",
      urgency: "30days",
      title: "Приём платежей через иностранного провайдера — валютный и регуляторный риск",
      whatFound: "Денежные средства от российских клиентов принимаются через иностранного платёжного провайдера.",
      whyItMatters: "Приём платежей через иностранные сервисы создаёт риски валютного контроля, блокировки переводов и претензий со стороны ФНС и ЦБ РФ.",
      legalBasis: "ФЗ № 173-ФЗ «О валютном регулировании»; ФЗ № 161-ФЗ «О национальной платёжной системе».",
      financialRange: "Штраф за нарушение валютного законодательства: до 100% суммы незаконной валютной операции.",
      businessImpact: "Риск блокировки счетов; претензии ФНС; невозможность легального вывода средств.",
      whatToDo: "Перейти на российский платёжный агрегатор или выстроить корректную агентскую схему с российским юридическим лицом.",
    });
    totalScore += 25;
  }

  // ── Block 11: Team ──
  if (hasAnswer("b11_q1", "cofounders_informal")) {
    criticalTriggers.push("Сооснователи без юридического оформления");
    totalScore += 30;
  }

  // ── Additional risk flags ──
  if (hasAnswer("b4_q7", "yes")) {
    criticalTriggers.push("Есть споры по правам на интеллектуальную собственность");
    totalScore += 35;
  }
  if (hasAnswer("b5_q6", "yes")) {
    criticalTriggers.push("Были инциденты безопасности или утечки данных");
    totalScore += 30;
  }
  if (hasAnswer("b2_q5", "yes")) {
    criticalTriggers.push("Есть неурегулированные корпоративные конфликты");
    totalScore += 35;
  }

  // ── Moderate risks ──
  if (hasAnswer("b4_q4", "significant")) {
    riskBlocks.push({
      blockId: 4,
      blockTitle: "Интеллектуальная собственность",
      riskLevel: "moderate",
      probability: "medium",
      impact: "significant",
      urgency: "90days",
      title: "Существенное использование open source без учёта лицензионных ограничений",
      whatFound: "Продукт существенно использует открытое программное обеспечение, учёт лицензий не ведётся.",
      whyItMatters: "Некоторые лицензии open source (GPL, AGPL) требуют раскрытия исходного кода коммерческого продукта при распространении.",
      legalBasis: "ст. 1235, 1286 ГК РФ — лицензионный договор; условия конкретных open source лицензий.",
      financialRange: "Риск принудительного раскрытия исходного кода; компенсация правообладателям: от 10 000 до 5 000 000 руб.",
      businessImpact: "Раскрытие исходного кода конкурентам; претензии правообладателей open source.",
      whatToDo: "Провести аудит используемых open source компонентов; заменить несовместимые лицензии или получить коммерческую лицензию.",
    });
    totalScore += 15;
  }

  if (hasAnswer("b8_q2", "no")) {
    riskBlocks.push({
      blockId: 8,
      blockTitle: "Потребительское право",
      riskLevel: "high",
      probability: "high",
      impact: "substantial",
      urgency: "30days",
      title: "Пользователь не понимает условия оплаты и возврата до совершения покупки",
      whatFound: "Условия оплаты, списания, отмены подписки и возврата не раскрываются пользователю до момента оплаты.",
      whyItMatters: "Закон о защите прав потребителей обязывает продавца предоставить полную информацию об условиях покупки до её совершения.",
      legalBasis: "ст. 10 Закона РФ № 2300-1 «О защите прав потребителей»; п. 6 ст. 13 — штраф 50% от суммы, присуждённой потребителю.",
      financialRange: "Штраф 50% от суммы иска потребителя; при массовых претензиях — от 500 000 руб. и выше.",
      businessImpact: "Массовые возвраты; жалобы в Роспотребнадзор; репутационный ущерб.",
      whatToDo: "Разместить полные условия оплаты, возврата и отмены подписки на странице оформления заказа до кнопки оплаты.",
    });
    totalScore += 20;
  }

  // ── Determine risk category ──
  let riskCategory: "low" | "moderate" | "high" | "critical";
  if (criticalTriggers.length > 0 || totalScore >= 80) {
    riskCategory = "critical";
  } else if (totalScore >= 50) {
    riskCategory = "high";
  } else if (totalScore >= 25) {
    riskCategory = "moderate";
  } else {
    riskCategory = "low";
  }

  // ── Key findings ──
  if (criticalTriggers.length > 0) {
    keyFindings.push(`Выявлено ${criticalTriggers.length} критических триггера, требующих немедленного внимания.`);
  }
  keyFindings.push(`Общий балл риска: ${totalScore} из 200.`);
  if (riskBlocks.length > 0) {
    keyFindings.push(`Обнаружено ${riskBlocks.length} зон правового риска по ${new Set(riskBlocks.map(b => b.blockId)).size} направлениям.`);
  }

  // ── Missing documents ──
  const docAnswers = answers["b6_q1"];
  const existingDocs = Array.isArray(docAnswers) ? docAnswers : docAnswers ? [docAnswers] : [];
  if (!existingDocs.includes("offer") && !existingDocs.includes("user_agreement")) {
    missingDocuments.push("Публичная оферта или пользовательское соглашение");
  }
  if (!existingDocs.includes("privacy")) {
    missingDocuments.push("Политика конфиденциальности");
  }
  if (!existingDocs.includes("consent")) {
    missingDocuments.push("Согласие на обработку персональных данных");
  }
  if (!existingDocs.includes("nda")) {
    missingDocuments.push("Соглашения о конфиденциальности с ключевыми подрядчиками");
  }

  // ── Roadmap ──
  const roadmap = {
    immediate: [] as string[],
    days30: [] as string[],
    days60: [] as string[],
    days90: [] as string[],
    scaling: [] as string[],
  };

  if (criticalTriggers.some(t => t.includes("код") || t.includes("права"))) {
    roadmap.immediate.push("Оформить передачу исключительных прав на код от разработчиков");
  }
  if (criticalTriggers.some(t => t.includes("физическое лицо"))) {
    roadmap.immediate.push("Перенести права на продукт с физического лица на юридическое");
  }
  if (criticalTriggers.some(t => t.includes("данные"))) {
    roadmap.days30.push("Перенести хранение персональных данных на серверы в РФ");
    roadmap.days30.push("Разработать и опубликовать политику конфиденциальности");
  }
  if (missingDocuments.length > 0) {
    roadmap.days30.push("Разработать базовый пакет правовых документов");
  }
  roadmap.days60.push("Провести аудит договоров с подрядчиками и сотрудниками");
  roadmap.days60.push("Проверить соответствие рекламных материалов требованиям законодательства");
  roadmap.days90.push("Выстроить систему внутренних регламентов по персональным данным");
  roadmap.days90.push("Провести повторную проверку документов после внесения исправлений");
  roadmap.scaling.push("Подготовить пакет документов для работы с корпоративными клиентами");
  roadmap.scaling.push("Провести due diligence перед инвестиционным раундом или продажей бизнеса");

  // ── Next step ──
  const goals = answers["b14_q1"];
  const goalsList = Array.isArray(goals) ? goals : goals ? [goals] : [];

  let nextStep: PaidScoringResult["nextStep"];
  if (goalsList.includes("investment_prep") || goalsList.includes("goal_sale")) {
    nextStep = {
      type: "investment_prep",
      title: "Сопровождение правовой упаковки перед инвестициями",
      description: "Подготовим компанию к due diligence: устраним критические дефекты, оформим права на активы и подготовим пакет документов для инвестора.",
    };
  } else if (goalsList.includes("enterprise_prep") || goalsList.includes("goal_enterprise")) {
    nextStep = {
      type: "enterprise_prep",
      title: "Подготовка к работе с крупными корпоративными клиентами",
      description: "Разработаем корпоративный пакет документов, соглашения об уровне сервиса и DPA для прохождения юридической проверки корпоративного клиента.",
    };
  } else if (riskCategory === "critical") {
    nextStep = {
      type: "critical_consult",
      title: "Консультация по критическим рискам",
      description: "Разберём каждый критический риск, определим приоритетность и составим план немедленных действий.",
    };
  } else if (missingDocuments.length >= 3) {
    nextStep = {
      type: "doc_package",
      title: "Пакет исправления документов",
      description: "Разработаем полный пакет правовых документов: оферта, политика конфиденциальности, согласия, договоры с разработчиками.",
    };
  } else {
    nextStep = {
      type: "legal_audit",
      title: "Углублённая правовая проверка",
      description: "Проведём детальный анализ выявленных зон риска с привлечением профильных специалистов.",
    };
  }

  // ── Scope limitations ──
  const scopeLimitations: string[] = [
    "Данный отчёт подготовлен на основании ответов на анкету и не заменяет полноценную правовую экспертизу.",
    "Выводы, не подтверждённые документами, носят предварительный характер и требуют проверки.",
  ];
  const uploadedDocs = answers["b13_q1"];
  if (!uploadedDocs || (Array.isArray(uploadedDocs) && uploadedDocs.includes("none"))) {
    scopeLimitations.push("Документы для анализа не предоставлены — все выводы основаны только на анкетных данных.");
  }

  return {
    riskCategory,
    totalScore,
    criticalTriggers,
    riskBlocks,
    keyFindings,
    missingDocuments,
    roadmap,
    nextStep,
    scopeLimitations,
  };
}
