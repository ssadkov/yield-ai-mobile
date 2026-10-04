# ТЗ для бэкенда: эндпоинты для мобильного приложения Yield AI

Статус: черновик на согласование. Задача Yield AI-4.

## 1. Цель

Мобильное приложение (`yield-ai-mobile`, экраны в `src/features/yield-app/`) сейчас работает целиком на моках: локальный стор, фейковое начисление процентов, подпись текстового сообщения вместо транзакции. Реальных запросов к бэкенду нет.

Нужно дать приложению бэкенд: портфель, стратегии, построение и подпись транзакций, вывод со статусом, лента активности и лог AI-агента. Целевая сеть — Solana, основной кошелёк — Seeker (Seed Vault), также Phantom, Solflare, Backpack, Privy.

Пути эндпоинтов ниже — предложение. Бэкендер может переименовать, если сохранён контракт данных.

## 2. Что уже есть на сайте (yield-ai) и что из этого брать

| Что | Где | Годится ли |
|---|---|---|
| Баланс токенов Solana-кошелька | `GET /api/solana/portfolio?address=` | Да, для баланса USDC. Кэш 30 с уже есть |
| Отправка подписанной tx | `POST /api/solana/sendRaw` `{txBase64}` → `{signature}` | Да, как есть |
| Unsigned tx депозита/вывода | `POST /api/protocols/jupiter/{deposit,withdraw}`, Kamino `deposit`/`earnTx` | Образец паттерна «unsigned base64 → кошелёк подписывает → sendRaw» |
| Методология PnL/APR | `docs/pnl-and-history-principles.md` (Modified Dietz) | Взять как основу расчёта |
| Лог операций агента | `/api/protocols/yield-ai/stablecoin-compound-history` (Aptos) | Форма данных близка, но только Aptos и без поля «почему» |
| Публичный read-only API | `/api/public/v1/wallet/[address]/{balance,protocols}` | Ключ нельзя класть в мобильное приложение — ходить только через свой бэкенд |

Чего на сайте нет вообще:

- продуктов Flexible и Fixed · 100 days (ни стратегии, ни источника APR, ни контракта);
- Solana AI Agent Safe / vault (в `user-flow.md` это только «target»);
- lock-механики (фиксированный срок с блокировкой);
- статуса вывода для поллинга;
- истории cashflow и лога агента для Solana;
- единого портфельного эндпоинта;
- мобильных push-уведомлений о статусе.

Вывод: ниже — новые эндпоинты, которые переиспользуют паттерны сайта, а не готовые роуты.

## 3. Общие требования

- Авторизация: приложение знает адрес кошелька пользователя. Запросы, читающие данные конкретного адреса, — по адресу; операции, меняющие состояние (создание вывода), — с подписью пользователя (message signing, схема по образцу `OwnerManageAuthBody` из `echelon-withdraw`, привязка к точным полям запроса + nonce + срок действия). Схему подписи описать и согласовать с мобильной стороной.
- Суммы: десятичные строки в USDC (6 знаков), например `"1000.500000"`. Не float. Клиент округляет до центов только при показе.
- Время: unix ms (число) или ISO 8601 — выбрать одно и держаться везде. Ниже везде `ms`.
- Ошибки: единый формат `{ "error": { "code": "STRING_CODE", "message": "..." } }`, коды описать для клиента (недостаточно средств, стратегия недоступна, lock ещё не истёк, лимит и т.д.).
- Ключ публичного API в клиент не встраивать. Бэкенд мобильного приложения сам ходит во внутренние источники.
- Idempotency: `POST`-эндпоинты принимают `Idempotency-Key`.

## 4. Эндпоинты

### 4.1 Стратегии

`GET /mobile/v1/strategies`

Заменяет хардкод из `lib/strategies.ts` (Flexible 6.32%, Fixed 14.00% — плейсхолдеры).

Ответ:

```
{
  "strategies": [
    {
      "id": "flexible",
      "name": "Flexible",
      "apr": "0.0632",            // текущий, переменный
      "aprKind": "variable",
      "lockDays": null,
      "minDeposit": "1.000000",
      "available": true
    },
    {
      "id": "fixed_100",
      "name": "Fixed · 100 days",
      "apr": "0.14",              // ставка, которая будет зафиксирована при депозите
      "aprKind": "fixed",
      "lockDays": 100,
      "minDeposit": "1.000000",
      "available": true
    }
  ],
  "updatedAt": 1790000000000
}
```

Клиент сам считает калькулятор «+$X в год» (`amount × apr`, для fixed — `× lockDays/365`) из этих значений. Приложение обновляет ответ при открытии экрана стратегий.

### 4.2 Баланс кошелька

`GET /mobile/v1/wallet/{address}/balance`

Нужен для экрана Deposit («USDC · in wallet $…», чипы Max, проверка «Not enough USDC»).

Ответ: `{ "usdc": "1240.000000", "updatedAt": ms }`. Внутри можно проксировать `/api/solana/portfolio`.

### 4.3 Портфель

`GET /mobile/v1/portfolio?address={address}`

Заменяет клиентский `computePortfolio()` (`lib/portfolio.ts`).

Ответ:

```
{
  "flexible": "500.120000",           // текущий баланс Flexible (тело + начисленное)
  "fixed": [
    {
      "id": "pos_...",
      "amount": "1000.000000",        // тело
      "earned": "3.840000",
      "apr": "0.14",                  // заморожен при открытии
      "openedAt": ms,
      "unlockAt": ms
    }
  ],
  "total": "1503.960000",
  "blendedApr": "0.0981",
  "earnedWeek": "1.20",
  "hasPositions": true,
  "firstDepositAt": ms | null
}
```

Клиент опрашивает раз в 60 с (сейчас так в `usePortfolio`).

### 4.4 История начислений для графика

`GET /mobile/v1/portfolio/earnings?address={address}&from=ms&to=ms`

Клиент бакетизирует сам (1W — 7 дней, 1M — 4 недельных бакета, 1Y — 12 месячных, All — адаптивно), поэтому нужна дневная гранулярность за всё время жизни аккаунта.

Ответ:

```
{
  "days": [
    { "day": ms /* полночь UTC */, "earned": "0.17", "added": "1000.00", "withdrew": "0.00" }
  ]
}
```

Считать по cashflow-событиям и начислениям, методология — Modified Dietz как на сайте.

### 4.5 Депозит: построение транзакций

`POST /mobile/v1/deposits/plan`

Запрос: `{ "address": "...", "strategyId": "flexible" | "fixed_100", "amount": "100.000000" }`

Ответ — упорядоченный список шагов, каждый шаг — одна неподписанная Solana-транзакция:

```
{
  "planId": "plan_...",
  "expiresAt": ms,
  "steps": [
    {
      "id": "setup",                    // только при первом депозите пользователя
      "kind": "setup",
      "title": "Set up your account",
      "detail": "One time. Creates your Yield AI vault on Solana.",
      "transaction": "<base64 unsigned>"
    },
    {
      "id": "deposit",                  // или "lock" для fixed
      "kind": "deposit",
      "title": "Deposit $100",
      "detail": "USDC into Flexible",
      "transaction": "<base64 unsigned>"
    }
  ]
}
```

Требования:

- Количество и состав шагов определяет бэкенд. Приложение показывает их по одному («Step 1 of 2») и умеет продолжать с первого неподтверждённого шага, уже подтверждённые повторно не подписывает.
- Если можно уложить всё в одну транзакцию (одна подпись) — предпочтительно; это ускоряет UX на Seeker (двойное нажатие боковой кнопки). Решение за бэкендером, приложение поддерживает любое число шагов.
- Blockhash в транзакциях должен жить достаточно долго для ручной подписи. Если истёк — приложение запрашивает план заново. Нужен эндпоинт или параметр для перестроения плана без потери уже подтверждённых шагов.

### 4.6 Отправка и подтверждение транзакции

Приложение может подписать и отправить транзакцию через кошелёк напрямую (`sign_and_submit_transaction`) или получить подписанную (`sign_transaction`, `send: false`, base64) и отправить через бэкенд.

`POST /mobile/v1/transactions/submit` — обёртка над `/api/solana/sendRaw`.

Запрос: `{ "planId": "plan_...", "stepId": "deposit", "signedTransaction": "<base64>" }`
Ответ: `{ "signature": "..." , "status": "confirmed" | "pending" }`

`GET /mobile/v1/transactions/{signature}` — статус (`pending | confirmed | failed`) для случая, когда приложение отправило транзакцию само, и бэкенд должен зафиксировать депозит в портфеле.

Открытый вопрос: кто записывает депозит в портфель — бэкенд сам видит его по ончейн-событию или приложение подтверждает вызовом. Предпочтительно первое (не зависеть от клиента).

### 4.7 Вывод

Вывод возможен только из Flexible. Fixed-позиции досрочно не выводятся до `unlockAt` (после — тоже выводятся, состав решает бэкенд; приложение пока показывает «Fixed deposits stay locked until <date>»).

`POST /mobile/v1/withdrawals`

Запрос: `{ "address": "...", "amount": "250.000000", "signature": "<подпись сообщения-разрешения или подписанная tx>" }`

Ответ: `{ "id": "wd_...", "status": "received", "requestedAt": ms }`

Если для вывода нужна подписанная транзакция — по аналогии с `deposits/plan` добавить `POST /mobile/v1/withdrawals/plan` → неподписанная tx, и затем создание вывода с `signature`. Приложению нужна ровно одна подпись пользователя («One signature with Seed Vault»).

`GET /mobile/v1/withdrawals/{id}`

Ответ:

```
{
  "id": "wd_...",
  "status": "received" | "withdrawing" | "sent" | "failed",
  "amount": "250.000000",
  "to": "<wallet address>",
  "requestedAt": ms,
  "completedAt": ms | null,
  "txSignature": "..." | null
}
```

Поведение UI: опрос каждые 3 с, показывает три шага — Request received → Withdrawing from protocols → Sent to your wallet, и текст «10–60 минут». Поэтому статус должен реально проходить эти стадии: `withdrawing` — пока агент/бэкенд выводит средства из протоколов, `sent` — после ончейн-перевода USDC на кошелёк пользователя.

`GET /mobile/v1/withdrawals?address={address}` — список выводов (для восстановления экрана после перезапуска приложения).

### 4.8 Лента активности (Account)

`GET /mobile/v1/activity?address={address}&cursor=&limit=`

Депозиты и выводы пользователя.

Элемент:

```
{
  "id": "...",
  "src": "account",
  "kind": "deposit" | "withdraw",
  "strategyId": "flexible" | "fixed_100",
  "amount": "100.000000",
  "ts": ms,
  "txSignatures": ["..."],
  "first": true,                 // первый депозит пользователя
  "unlockAt": ms | null          // для fixed
}
```

### 4.9 Лог AI-агента

`GET /mobile/v1/agent/log?address={address}&cursor=&limit=`

Элемент:

```
{
  "id": "...",
  "src": "agent",
  "kind": "action" | "check",    // check = «Checked, no action»
  "title": "Moved new USDC into loops",
  "detail": "...",               // короткая строка для ленты
  "why": "...",                  // развёрнутая причина для экрана деталей
  "delta": "+$0.40" | "3.9× → 4.0×" | null,
  "coins": ["usdc", "usd1"] | null,
  "txSignatures": ["..."],       // для «View transaction»
  "ts": ms
}
```

Важно: на сайте поля `why` нет — его нужно генерировать на бэкенде (шаблоны по типу действия либо LLM). Тексты для ленты и деталей — на английском, как в приложении.

`GET /mobile/v1/agent/status?address={address}`

Ответ: `{ "state": "active" | "waiting_first_deposit" | "paused", "lastCheckAt": ms | null }` — для баннера «Active · last check N min ago». Клиент опрашивает раз в 30 с; при желании — push/SSE.

`GET /mobile/v1/agent/policy`

Ответ: `{ "can": ["..."], "cant": ["..."] }` — список того, что агент может и не может делать. Сейчас текст захардкожен в `AgentLog.tsx` (Can: move USDC between approved protocols, re-loop and compound rewards, keep leverage near target. Can't: send funds out of your Safe, use unapproved protocols, go past your limits). Тексты должны соответствовать реально закодированным ограничениям (allowlist протоколов, лимиты плеча, вывод только на кошелёк владельца).

Единый порядок: активность и лог агента приложение показывает одной лентой по времени. Допустимо сделать общий `GET /mobile/v1/feed` с фильтром `src=account|agent`.

### 4.10 Кошельки и Privy

Для Seed Vault / Phantom / Solflare / Backpack / WalletConnect бэкенд в подключении не участвует, всё идёт через уже готовый нативный мост. От бэкенда нужны только неподписанные транзакции из п. 4.5 и 4.7.

Для Privy (вход через Google, embedded Solana-кошелёк) код в приложении готов. Нужно от бэкендера:

1. Создать приложение в dashboard.privy.io.
2. Включить вход через Google (и email).
3. Включить Solana embedded wallets с автосозданием при первом входе.
4. Разрешить идентификаторы приложения: Android `com.yieldai.mobile` и `com.yieldai.mobile.dev` (с SHA-256 подписных сертификатов), iOS `com.yieldai.mobile`.
5. Передать **App ID** и **Client ID** (положим в `EXPO_PUBLIC_PRIVY_APP_ID` / `EXPO_PUBLIC_PRIVY_CLIENT_ID`).

До получения ID строка Privy в Connect остаётся с меткой «Soon».

## 5. Подпись транзакций: что делает приложение

| Операция | Что подписывается | Кто строит | Мост |
|---|---|---|---|
| Setup аккаунта (первый депозит) | tx из `deposits/plan`, шаг `setup` | бэкенд | `sign_and_submit_transaction` |
| Deposit Flexible | tx, шаг `deposit` | бэкенд | `sign_and_submit_transaction` |
| Lock Fixed · 100 days | tx, шаг `lock` | бэкенд | `sign_and_submit_transaction` |
| Withdraw | tx или сообщение-разрешение | бэкенд | `sign_and_submit_transaction` / `sign_message` |
| Аутентификация чувствительных запросов | сообщение (nonce, поля запроса, срок) | клиент | `sign_message` |

Сейчас каждый шаг подписывается как читаемое текстовое сообщение (`sign_message`) — это заглушка. Как только бэкенд начнёт отдавать транзакции, приложение переключается на `sign_and_submit_transaction` (правка в `wallet/native-driver.ts`, TODO в коде).

Требования к транзакциям:

- Solana versioned/legacy tx в base64, без подписей, fee payer — кошелёк пользователя (либо указать иное, если будет gas sponsorship).
- Состав инструкций читаем для кошелька (Seed Vault показывает пользователю, что он подписывает).
- Симуляция на стороне бэкенда перед отдачей; при провале — понятный код ошибки, а не пустая tx.

## 6. Полный список эндпоинтов (сводка)

| # | Метод и путь | Экран | Приоритет |
|---|---|---|---|
| 1 | `GET /mobile/v1/strategies` | Strategy, Home | Обязательно |
| 2 | `GET /mobile/v1/wallet/{address}/balance` | Deposit | Обязательно |
| 3 | `GET /mobile/v1/portfolio` | Home | Обязательно |
| 4 | `GET /mobile/v1/portfolio/earnings` | Home (график) | Обязательно |
| 5 | `POST /mobile/v1/deposits/plan` | Deposit | Обязательно |
| 6 | `POST /mobile/v1/transactions/submit` | Deposit, Withdraw | Обязательно |
| 7 | `GET /mobile/v1/transactions/{signature}` | Deposit, Withdraw | Обязательно |
| 8 | `POST /mobile/v1/withdrawals` (+ `/plan`) | Withdraw | Обязательно |
| 9 | `GET /mobile/v1/withdrawals/{id}` | WithdrawDone | Обязательно |
| 10 | `GET /mobile/v1/withdrawals` | восстановление состояния | Желательно |
| 11 | `GET /mobile/v1/activity` | Activity | Обязательно |
| 12 | `GET /mobile/v1/agent/log` | Activity, AgentLog | Обязательно |
| 13 | `GET /mobile/v1/agent/status` | AgentLog | Желательно |
| 14 | `GET /mobile/v1/agent/policy` | AgentLog | Желательно |
| 15 | Push / SSE по статусу вывода и действиям агента | — | Позже |

## 7. Сверка приложения с сайтом

Что есть на сайте и нужно перенести в приложение или учесть в бэкенде:

- Методология PnL/APR (Modified Dietz, показывать APR только после 7 дней владения) — использовать в портфеле и графике.
- Лимиты и ограничения агента на уровне контракта (`max_per_tx`, `max_daily`, allowlist) — источник для `agent/policy`.
- Health Factor — нужен, только если Fixed/Flexible будут строиться с плечом (loops). В текущем UI не показывается.
- Уведомления в Telegram (`/api/tg-subscribe`) — в приложении нет, вместо них нужен мобильный push (п. 15).
- Сайт умеет несколько сетей (Aptos, EVM); приложение пока только Solana. Aptos-стратегии в мобильный релиз не входят.

Чего в приложении нет, а в дизайне обозначено:

- Ручной выбор протоколов (PRO · Coming soon) — отключён, в ТЗ не входит.
- Просмотр транзакции в эксплорере сейчас показывает заглушку «Mock transaction» — заработает, когда в ответах появятся `txSignatures`.

## 8. Что не входит

- Реализация самого приложения и переключение с моков на API — отдельная работа мобильной стороны после готовности эндпоинтов.
- Aptos и EVM в мобильном приложении.
- Ручной выбор протоколов (PRO).
- Fiat on-ramp.

## 9. Открытые вопросы

1. **Архитектура хранения средств.** Строить Solana AI Agent Safe (vault PDA, лимиты в программе, executor) как на Aptos, или обойтись прямыми позициями пользователя в Jupiter Lend / Kamino без Safe? От ответа зависят состав шагов депозита («Creates your Yield AI vault on Solana»), формулировки Can/Can't и то, кто держит USDC.
2. **Реальная ставка Fixed · 100 days.** 14.00% — плейсхолдер из дизайна. Откуда берётся ставка и чем она обеспечена (Exponent PT, собственный vault и т.д.).
3. **Источник APR Flexible.** 6.32% — плейсхолдер. Агрегация ставок Jupiter Lend / Kamino (`/api/yields`, `/api/protocols/*/pools`) или собственный расчёт.
4. **Протоколы и сети за Flexible и Fixed на Solana.** Тексты агента («loops», «leverage», Echelon) взяты из макета; Echelon — Aptos-протокол.
5. **Вывод.** Почему 10–60 минут: из-за unwind позиций или задержки протокола. Есть ли комиссия и минимальная сумма. Можно ли выводить Fixed после `unlockAt` автоматически или только по запросу.
6. **Досрочный вывод из Fixed.** Запрещён совсем или с штрафом.
7. **Число подписей на депозит.** Возможно ли уложить setup + deposit в одну транзакцию.
8. **Fee payer / газ.** Платит пользователь SOL или нужен sponsorship (у пользователя на Seeker может не быть SOL).
9. **Схема аутентификации подписью.** Формат сообщения, nonce, срок жизни, где хранить.
10. **Доставка обновлений.** Достаточно ли поллинга (3 с для вывода, 30–60 с для остального) или нужны push/SSE.
11. **Язык `why` и `title` агента.** Шаблоны или LLM; на каких языках.
12. **Privy.** Кто ведёт аккаунт после создания; App ID и Client ID (п. 4.10).

## 10. Приёмка

1. Приложение получает список стратегий с реальными ставками, а не из кода.
2. Баланс USDC в шите Deposit совпадает с ончейн-балансом кошелька.
3. Первый депозит на тестовом кошельке проходит: план → подпись на Seeker → подтверждение в сети → позиция появляется в портфеле.
4. Retry после отклонённой подписи продолжает с неподтверждённого шага, подтверждённые не подписываются повторно.
5. Fixed-депозит создаёт позицию с `unlockAt = сегодня + 100 дней` и замороженной ставкой.
6. Вывод из Flexible: одна подпись, статус проходит received → withdrawing → sent, USDC приходит на кошелёк.
7. График на Home строится из `portfolio/earnings` для 1W / 1M / 1Y / All.
8. Activity показывает депозиты, выводы и действия агента одной лентой; у действий агента есть `why` и ссылки на транзакции.
9. Privy: после передачи App ID / Client ID вход через Google создаёт embedded-кошелёк.
