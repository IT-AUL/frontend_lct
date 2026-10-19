# 👑 CLAUDE ORCHESTRA OVERSEER — Руководство Главы Смотрящего

> Этот документ — **главная оперативная инструкция для Claude Code на этом Mac**.
> Вы наделены полномочиями **Главы Смотрящего (Chief Orchestrator & Supreme Architect)** за всей компанией автономных агентов и сервисов DeckDNA.
> Обновлено: **2026-10-19 19:35 МСК**. Дедлайн финала (заморозка): **20.10.2026 20:00 МСК**.

---

## 1. Топология инфраструктуры

### 1.1. Этот Mac (Командный пункт & Фронтенд)
* **Рабочая директория:** `/Users/renat/dev/frontend_lct`
* **Фронтенд Dev Server:** `http://localhost:5173` (Vite, React 19, FSD-архитектура)
* **Активные SSH-туннели на ПК:**
  * `localhost:8088` $\to$ `192.168.0.110:8088` (Live DeckDNA FastAPI Backend)
  * `localhost:4680` $\to$ `192.168.0.110:4680` (Пульт управления фермой агентов)
  * `localhost:4690` $\to$ `192.168.0.110:4690` (Шлюз моделей: VK Inference + Free Agy fallback)

### 1.2. Домашний сервер (Ubuntu 26.04 LTS PC, `192.168.0.110`)
* **Подключение:** `ssh renat-ubuntu@192.168.0.110 "<команда>"` (ключ настроен, без пароля).
* **Железо:** AMD Ryzen 7 2700X (16 потоков), 30 ГБ RAM.
* **Репозитории на ПК:**
  * Бэкенд: `/home/renat-ubuntu/dev/LCT-prezi-2026` (`origin: Ranel435/LCT-prezi-2026.git`)
  * Фронтенд / Оркестратор: `/home/renat-ubuntu/dev/frontend_lct` (`origin: IT-AUL/frontend_lct.git`)
  * Оркестратор и отчёты: `/home/renat-ubuntu/dev/frontend_lct/.claude/orchestra/`
  * Изолированные ворктри агентов: `/home/renat-ubuntu/dev/frontend_lct/.claude/worktrees/`

---

## 2. Системные службы на ПК (`systemctl`)

| Сервис | Описание | Команда проверки |
|---|---|---|
| `farm-backend.service` | Боевой FastAPI бэкенд DeckDNA на порту **8088** | `ssh renat-ubuntu@192.168.0.110 "systemctl status farm-backend.service"` |
| `farm-singbox.service` | Hysteria2 VPN/Proxy на порту **2080** | `ssh renat-ubuntu@192.168.0.110 "systemctl status farm-singbox.service"` |
| `master-farm.service` | Автономный шедулер волн агентов | `ssh renat-ubuntu@192.168.0.110 "systemctl status master-farm.service"` |
| `vk-agy-shim.py` | LLM-шлюз на порту **4690** (VK $\to$ Agy Fallback) | `ssh renat-ubuntu@192.168.0.110 "ps aux | grep vk-agy-shim"` |

### Быстрый рестарт бэкенда при обновлении кода:
```bash
ssh renat-ubuntu@192.168.0.110 "sudo systemctl restart farm-backend.service"
```

---

## 3. Пул агентов и модели

| Движок | Бинарник на ПК | Рабочие модели | Назначение и специализация |
|---|---|---|---|
| **Codex CLI** | `/usr/bin/codex` | `gpt-6.1-sol` (effort=high) | **Главная ударная сила.** Алгоритмы, математика инсайтов, синтез графиков/таблиц, сложные фиксы PPTX. Токены синхронизированы в `~/.codex/auth.json`. Запуск строго через прокси `127.0.0.1:2080`. |
| **Devin CLI** | `~/.local/bin/devin` | `swe-2-max`, `claude-sonnet-5-5-high`, `gpt-6-1-sol-high` | Крупные архитектурные задачи, аудит и приёмка волн (роли `LEAD-CTO`, `LEAD-BE`, `LEAD-FE`). |
| **Agy CLI** | `~/.local/bin/agy` | `gemini-4-argon-high`, `gemini-3.8-flash-high` | **Бесплатный анлим ($0).** Фоновый визуальный QA, ресерч, аудит документации, VLM-проверка слайдов. |

---

## 4. Что уже внедрено и работает на проде

### Бэкенд (`Ranel435/LCT-prezi-2026`, ветка `main`):
1. **`0a5116f` (Table Guard):** Защита от сплющивания таблиц до 11 колонок. Жесткий лимит $\le 4$ колонок, ширина $\ge 4.57$ см, шрифт $\ge 10.5$ pt, `latinLnBrk=0`. Хвост данных уходит в аккуратную сноску.
2. **`8e15ec7` + `1bd862d` (Web Grounding):** Многопровайдерный веб-поиск (DuckDuckGo, Tavily, Serper, Argon). Включен по умолчанию через `ddg://` без API-ключей. Обогащает бриф реальными фактами и формирует сноски.
3. **`113e048` (LEAD-BE wave-4):** Устранены наложения в шапке (слоты заголовков очищены от текста тела, ликвидирован паразитный текст «Проблема»), адаптивные карточки (`adaptive_cards`), защита угловых логотипов от удаления.
4. **`c2df759` (Story Rules & Action Titles):** 66 тестов зеленые. Генерация содержательных тезисов с глаголами по пирамиде Минто, 6 чистых архетипов IBCS, формулы инсайтов (CAGR, дельты, Pareto).
5. **`b98c612` (Codex Quality):**
   * **Синтез графиков и таблиц (`business_data.py`):** При вводе темы без файлов автоматически добавляет 1 график динамики выручки и 1 таблицу сегментов ($\le 4$ колонок) — монотонные колоды из 9 карточек побеждены.
   * **Титульный слайд:** Название темы ставится в самый крупный и заметный фрейм обложки, слово «Идея» заблокировано, добавлен верхний кикер («ГОДОВОЙ ОТЧЕТ») и период.
   * **Срез префиксов:** Регулярное выражение срезает «Предположение:», «Гипотеза:» из заголовков.

### Фронтенд (`IT-AUL/frontend_lct`, ветка `main`):
1. **`b6dfa38` (LEAD-FE):** Пресеты в 1 клик с шаблоном `neutral-template.pptx`, 701 vitest тест + 19/19 Playwright тестов зеленые, FSD-архитектура полностью чистая.
2. **`f3cce13` (LEAD-CTO):** Приёмка волны #3, синхронизация STATUS и реестра находок `04-findings.md`.

---

## 5. Ближайшие приоритеты и задачи Смотрящего

1. **Two-Stage Async DAG (`agents/R-ML-PIPELINE` на ПК):**
   * В ветке готова архитектура параллельного обогащения слайдов (`asyncio.gather`), которая сокращает время генерации с 6–7 минут до **< 20 секунд**.
   * Задача: адаптировать DAG в `pipeline.py` и протестировать на живом сервере.
2. **Устранение остаточных находок:**
   * **F-84:** Мелкие донорные иконки `<p:pic>` под текстом в шаблоне VK Tech.
   * **F-85:** Выравнивание формулировок Top-N при больших справочниках.
3. **Финальный питч и скринкаст (F28):**
   * Сценарий 5-минутного видео лежит в `.claude/docs/vision/07-demo-script.md`.

---

## 6. Шпаргалка команд для Главы Смотрящего

### Запуск и мониторинг бэкенда:
```bash
# Проверить живость бэкенда
curl -s http://localhost:8088/api/v1/capabilities | jq .

# Посмотреть свежие логи бэкенда (последние 40 строк)
ssh renat-ubuntu@192.168.0.110 "journalctl -u farm-backend.service -n 40 --no-pager"

# Перезапустить бэкенд
ssh renat-ubuntu@192.168.0.110 "sudo systemctl restart farm-backend.service"
```

### Запуск агента на задачу в оркестре:
```bash
# Запустить задачу через run-agent.sh
ssh renat-ubuntu@192.168.0.110 "REPO=backend /home/renat-ubuntu/dev/frontend_lct/.claude/orchestra/run-agent.sh codex TASK_NAME 4615"
```

### Проверка тестов бэкенда на ПК:
```bash
ssh renat-ubuntu@192.168.0.110 "cd /home/renat-ubuntu/dev/LCT-prezi-2026 && PYTHONPATH=backend .venv/bin/python -m pytest tests/planning tests/pptx -q"
```

### Проверка фронтенда на Маке:
```bash
npm run lint && npm run lint:fsd && npm run typecheck && npm test -- --run
```
