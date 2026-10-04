# Devnet на Seeker: create → deposit → withdraw

Включается флагом `EXPO_PUBLIC_YIELD_NETWORK=devnet` (EAS-профиль `devnet` или локальная сборка). Без флага приложение работает на моках, как раньше.

API: `https://yield-ai-solana-devnet.vercel.app/api/mobile/v1` (переопределяется `EXPO_PUBLIC_YIELD_API_BASE`). Program, mint и genesis зашиты в `src/features/yield-app/devnet/config.ts`. Если API ответит другой сетью, приложение ничего не даёт подписывать.

## Как устроено

- `devnet/api.ts` — клиент Safe API: `/config`, `/safes`, `/safes/creation-plan`, `/deposits/plan`, `/withdrawals/plan`, `/transactions/{sig}`.
- `devnet/tx.ts` — до подписи проверяет транзакцию: v0, владелец единственный подписант и fee payer, blockhash из плана, вызываются только Yield-программа и ComputeBudget/ATA/Token/System. После подписи проверяет ed25519-подпись владельца.
- `devnet/journal.ts` — подписанная транзакция, signature, blockhash и lastValidBlockHeight пишутся в AsyncStorage **до** отправки.
- `devnet/engine.ts` — план → проверка → кошелёк подписывает (`signTransaction`, без отправки) → журнал → отправка в Devnet RPC → опрос `/transactions/{sig}`. Пока blockhash жив, отправляются те же байты. `unknown_or_expired` блокирует новые операции, пока пользователь сам не проверит перевод («I checked it» на главной).
- Первый депозит без Safe идёт через `creation-plan` + `initialDepositUsdc`, это одна подпись. Дальше используется `/deposits/plan`. «All» на выводе отправляет `amount: "all"`.

## Приёмка на устройстве

1. Получить 0,02 devnet SOL (faucet.solana.com) и 1–2 test USDC (faucet.circle.com → Solana Devnet) на адрес Seed Vault. Кнопки фаучетов есть в Account.
2. Новый владелец: Deposit $1 → одна подпись → Safe создан, на главной $1.00.
3. Отдельное пополнение: Deposit $0.50.
4. Withdraw 25% / своя сумма → USDC вернулся в кошелёк.
5. Withdraw All → в Safe $0.00.
6. Перезапуск: после подписи сразу убить приложение и открыть заново → баннер «Confirming…» → операция доходит до finalized, баланс обновляется.
7. Таймаут: подписать при выключенной сети, дождаться ошибки, включить сеть → «Check again» находит прежнюю signature. Новый депозит не создаётся, пока прежний не разрешён.
8. Мало SOL: понятная ошибка с суммой из `plan.cost`. Мало USDC: «Not enough USDC». Неверная сеть: «different network».

Каждая транзакция открывается в Explorer: «View transaction» на экране успеха и кнопки в баннере.
