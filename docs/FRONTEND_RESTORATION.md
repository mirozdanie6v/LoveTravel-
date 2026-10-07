# LoveTravel: восстановление функционального frontend

Baseline: `f2ff47f48121fbc2c606823443bdf0fdfd6824eb`.
Recovery branch до аудита: `b754a9d21f266461c35fba7ee810a04d4e7d8185`.
Текущий main, включённый в recovery branch: `cc1715d`.

## Аудит

Три восстановленных production-файла в исходной recovery branch совпадали с baseline: BookingConfigurator JS/CSS и domain tour JS. Domain CSS также совпадал. Build отличался версиями assets. Полного rollback repository или backend не выполнялось. `preview/client-v2` не используется production build и не изменён.

Recovery branch имела отдельный runtime-дефект: transaction API вызывал удалённую функцию `view()`. Main уже содержал её восстановление; это исправление сохранено при объединении историй.

Первичная браузерная проверка baseline на текущем transaction backend успешно открыла оба тура. Затем устранено конкурирующее владение экраном: исходный `openTour` сохраняет навигацию, его `renderTour` делегирует Bókun-продукты существующему domain renderer. Повторный render не перезаписывает mount конфигуратора. Observer ремонта legacy HTML удалён. Конфигуратор монтируется по событию готовности экрана; его observer следит только за lifecycle attributes. Асинхронный bootstrap защищён от повторного запуска и старых навигаций. AI handoff ждёт его завершения.

Проверка reload выявила несовместимость extras projection: canonical extras возвращались объектами, хотя UI/resolver принимают числовые quantities и отдельные `extraAnswers`. Исправлен этот переход с сохранением canonical contracts. Contact sheet также сохраняет passenger extras, когда provider не требует passenger fields.

## Запрет бронирования

Запрет задан кодом, без environment/token override:

- Transaction API отвечает HTTP 423 на RESERVE и RECONCILE до DB/session/revision validation.
- BookingSession отклоняет те же действия и соответствующие COMMAND types.
- Provider submit и reconcile выбрасывают `booking_mutations_disabled` до fetch.
- Production router блокирует legacy `/api/bookings` POST, demo submit и прямые provider mutation routes.
- UI предлагает только проверку и одобрение exact Quote; RESERVE и demo token flow удалены.
- Старый workflow включения demo token заменён локальным configuration parity gate. Live verifiers не создают бронь; browser smoke отменяет попытку mutation до отправки.

Поведенческие safety tests проверяют отсутствие DB/runtime/provider calls даже с ранее действующим token.

## Проверки

`node --test tests/*.test.mjs`: 458 passed, 0 failed.
Проверка tour media и production build проходят. Cache version: `20261008-restored-config-v1`; порядок semantic i18n → provider locale → runtime → domain → configurator сохранён. Добавлена совместимость build с CRLF checkout.

`npm run test:booking-ui` проходит полный существующий интерфейс на production API/BookingSession/store/Quote code с SQLite вместо D1 и локальным DO namespace. Fixtures покрывают два продукта, date/time, все rates, Adult/Child/Infant, participant limits, hotel pickup/room, custom pickup/dropoff, booking/passenger extras и их вопросы, required contact/custom/passenger fields, select/date/number questions, exact Quote approval, пять locale reloads, повторный renderTour, быстрые переходы и AI handoff. Внешние provider вызовы в harness запрещены.

`npm run test:booking-ui:live-reads` получает свежий public GET domain snapshot и проходит тот же production configuration flow локально. Внешние transaction или booking mutations не отправляются. На проверенных данных Robinson Beach предоставляет 7 rates, Hòn Mun — 4; оба имеют Adult/Child/Infant и 923 pickup places. Extras/dropoff сейчас отсутствуют и проверяются расширенными fixtures. Подготовленные конфигурации получают `readyToBook=true` и точную Quote, затем `USER_APPROVED`, без providerBooking.

Дополнительный режим `--minimal-passengers` проверяет сохранение passenger extras без passenger fields. Отчёты и screenshots сохраняются в `artifacts/restoration/`.

## Граница результата

Это восстановление существующего production frontend и проверка кода recovery branch. Реальные Bókun bookings не создавались. Merge в main и production deployment этой доработки не выполнялись; после deployment нужны проверки deployed asset versions и read-only browser smoke. Quote на live-read acceptance вычисляется текущим backend из свежего snapshot; проверка не утверждает, что snapshot остаётся актуальным после времени его получения.
