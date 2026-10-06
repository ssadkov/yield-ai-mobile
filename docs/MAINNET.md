# Mainnet: Safe, Kamino (Flexible), Exponent (Fixed)

Включается флагом `EXPO_PUBLIC_YIELD_NETWORK=mainnet` (EAS-профиль `mainnet`). **Реальные USDC и SOL.** Devnet (`=devnet`) остаётся только для idle USDC, без флага приложение работает на моках.

API: `https://yield-ai-solana-mainnet.vercel.app/api/mobile/v1`. Документация бэкенда: `docs/yield-ai-v2-solana-safe-api.md` и `docs/yield-ai-v2-owner-protocol-api.md` в `ssadkov/yield-ai-os-sol`. Program, mint и genesis зашиты в `src/features/yield-app/chain/config.ts`.

## Что куда

| В приложении | Протокол | Подписи |
| --- | --- | --- |
| Первый депозит любой стратегии | `creation-plan` без депозита (пустой Safe) | +1, один раз |
| Flexible: депозит | Kamino `deposits/plan`, `source: wallet` (кошелёк → Safe → Kamino атомарно), минимум 1 USDC | 1 |
| Flexible: частичный вывод | Kamino `redeem` (`percent`, дальше остаток в raw shares) → `return` по `redemptionSignature` | 2 на каждую ногу |
| Flexible: «All» | Kamino `redeem shares: all` по всем ногам → idle `withdrawals/plan amount: all` | ноги + 1 |
| Fixed: первый депозит | Exponent `phase: setup` (аренда за аккаунты) | +1, один раз |
| Fixed: депозит | Exponent `phase: invest`, `source: wallet` | 1 |
| Fixed: вывод | Exponent `withdrawals/plan` (`percent` или `shares: all`). До 10.01.2027 — продажа по рынку, USDC сразу в кошелёк | 1 |

APY Flexible берётся из `/protocols/kamino/yield` раз в минуту. Если ставка недоступна, приложение показывает «—», а не 0%. Ставка Fixed приходит с котировкой и видна на экране подписи.

Баланс Kamino и Fixed показывается по себестоимости (`principalUsdc`): живой стоимости долей API пока не отдаёт.

## Безопасность (`chain/`)

- `tx.ts`: v0, ≤ 1232 байта, единственный подписант и плательщик — владелец, blockhash из плана. На верхнем уровне только ComputeBudget, ATA и Safe-программа, причём только проверенные инструкции Safe (тот же список, что пропускает транспорт API). После подписи проверяется ed25519.
- `journal.ts`: подписанные байты сохраняются до отправки. После таймаута или перезапуска приложение проверяет прежнюю подпись. При неизвестном результате блокирует новые операции до ручной проверки.
- `engine.ts`: если подпись пришла после `lastValidBlockHeight` или после `quoteExpiresAtUnixSeconds` у Exponent, транзакция не отправляется («ничего не ушло, повторите»).
- `protocols.ts`: для одной redemption `return` планируется не больше одного раза (иначе можно задеть чужие idle-средства). Для частичного вывода после первой ноги запрашивается остаток в raw shares, а не повторный процент. Ног не больше 8.
- Отправка идёт через `POST /rpc` API: тот же RPC, что строил план, preflight обязателен.

## Приёмка на Seeker

Нужно немного SOL (≈0.02 на аренду и комиссии) и 2–3 USDC на адресе кошелька.

1. Flexible $1: создание Safe + депозит в Kamino (2 подписи). На главной Flexible $1.00 и APY.
2. Flexible вывод 50% (redeem + return), затем «All».
3. Fixed $1: setup + invest (2 подписи, ещё +1, если Safe не было).
4. Fixed вывод «All»: USDC в кошельке, сумма не меньше минимума с экрана подписи.
5. Перезапуск посреди вывода из Kamino: если redemption прошла, а return нет, USDC лежит idle в Safe и выводится через Flexible → «All».
