# Рынок AI-сервисов для корпоративных презентаций: конкурентная карта для кейса VK Tech

*Актуальность: 25 сентября 2026 года*

## Главный вывод

На рынке уже достаточно решений, которые умеют превратить промпт или документ в презентацию, применить бренд-кит и экспортировать результат в PPTX. Однако задача VK Tech существенно уже и технически сложнее: сервис должен **без предварительной ручной настройки разобрать ранее неизвестный PPTX-шаблон как систему правил, собрать по нему три действительно разных варианта колоды, сохранить элементы редактируемыми и встроить объяснимый аудит макета и содержания в сам пайплайн**.[^1]

Ближе всего к полному решению находятся три группы продуктов:

- **AI внутри офисного редактора:** Microsoft Copilot, Google Gemini и Plus AI. Они хорошо сохраняют привычный рабочий процесс и редактируемость, но обычно рассчитывают на корректно подготовленный шаблон или тему.[^2][^3][^4]
- **Enterprise brand-governance:** Templafy, empower и Prezent. Они сильнее всего в централизованных шаблонах, библиотеках утвержденного контента, проверке фирменного стиля и исправлении нарушений, но их публичное позиционирование предполагает заранее настроенную корпоративную среду.[^5][^6][^7]
- **API и open-source генераторы:** SlideSpeak, Presenton и PPTAgent. Они ближе к требуемой архитектуре «парсинг → план → генерация → рендеринг → проверка», дают программный контроль и редактируемый PPTX, но ни один из них по открытой документации не закрывает весь набор критериев VK Tech из коробки.[^8][^9][^10]

Следовательно, сильная конкурсная позиция — не «еще один генератор презентаций», а **presentation compiler + linting/QA layer**: загрузить произвольный шаблон, вывести промежуточную дизайн-спецификацию, скомпилировать контент в нативные объекты и показать проверяемый отчет с исправлениями.

## Что именно проверяет кейс

Кейс требует импортировать шаблон и контент-пакет, извлечь дизайн-токены, композиционные паттерны, типографику и визуальные элементы, затем сгенерировать структуру и текст 10–15 слайдов, графики, таблицы, диаграммы, пиктограммы и SmartArt. Для одного шаблона и контента должны быть представлены три визуально различимых варианта; неизвестная заранее колода должна создаваться не более чем за пять минут.[^1]

Результат необходимо экспортировать в HTML, PDF и PPTX, причем PPTX должен состоять из редактируемых нативных объектов, а не из растровых снимков. Встроенный аудит должен разделять детерминированные проверки геометрии и стиля и контекстуальные проверки смысла, визуализировать нарушения и позволять пользователю выбирать исправления.[^1]

Технические ограничения дополнительно меняют конкурентную рамку: на конкурсном этапе разрешены только модели с открытыми весами и лицензиями Apache 2.0/MIT, размером до 35B; для топ-10 обязателен VK Inference. Поэтому закрытые SaaS-продукты полезны как продуктовые ориентиры, но не могут стать ядром конкурсного решения.[^1]

## Карта сегментов

| Сегмент | Основные игроки | Что уже решено | Что остается открытым для кейса |
|---|---|---|---|
| Генераторы «prompt-to-deck» | Gamma, Beautiful.ai, Pitch, Presentations.AI, Canva | Быстрый черновик, авторазметка, изображения, темы, совместная работа и экспорт.[^11][^12][^13] | Глубокая реконструкция произвольного PPTX-шаблона, формальный аудит и воспроизводимость пайплайна публично не являются ядром большинства продуктов. |
| AI в PowerPoint/Slides | Microsoft Copilot, Gemini, Plus AI | Работа в привычном редакторе, создание из документов, редактируемые слайды, использование текущей темы или корпоративного шаблона.[^2][^3][^4] | Автоматическое понимание плохо подготовленного неизвестного шаблона, три стратегии верстки и внешний программный аудит. |
| Enterprise brand governance | Templafy, empower, Prezent | Утвержденные шаблоны и ассеты, централизованный контроль бренда, проверка и исправление отклонений.[^14][^6][^7] | Быстрый zero-setup onboarding неизвестного шаблона и открытый, переносимый пайплайн на разрешенных моделях. |
| Presentation API | SlideSpeak, Plus API, Prezent API, Gamma API | Автоматическая генерация из приложений и workflow, брендовые темы, программный экспорт.[^8][^15][^16] | Прозрачность внутренних правил, локальный inference, детерминированные тесты и независимая оценка качества. |
| Open source / research | Presenton, PPTAgent, PPT Master | Self-hosting, собственные модели, анализ референсных колод, редактируемый PPTX, программная расширяемость.[^9][^17][^18] | Enterprise-grade разбор сложных шаблонов, надежная поддержка всех PPTX-объектов и полный интерактивный аудит. |
| Российские массовые сервисы | SimpleSlide, SlidePoint, Presentacium | Русский пользовательский сценарий, генерация по теме/тексту, простой редактор, PPTX/PDF.[^19][^20][^21] | Корпоративный дизайн-контроль, неизвестные шаблоны, explainable audit, API/оркестрация и открытые модели не заявлены как ключевые возможности. |

## Наиболее близкие решения

### Microsoft Copilot

Copilot умеет создавать презентации из промпта или файла и формировать редактируемый результат внутри PowerPoint. Актуальная брендовая логика использует sample slides, layouts, objects, placeholders и Brand Kit; поддерживается загрузка PPTX/POTX или выбор шаблона из Organization Asset Library.[^22][^3]

Это важнейший продуктовый референс: он показывает, что рынок движется от простого набора цветов к пониманию назначения placeholders и выбору подходящих layout. Но Copilot ожидает репрезентативные образцы и корректно заданные placeholders; документация прямо рекомендует специально оптимизировать шаблон, тогда как кейс VK Tech проверяет адаптацию к шаблону, который команда заранее не видела.[^3][^1]

**Что перенять:** сначала показывать пользователю план колоды; использовать иерархию master → layout → placeholder → object; давать локальные команды редактирования отдельных слайдов.

**Где обойти:** принимать «грязный» реальный PPTX без предварительной подготовки и явно показывать извлеченную schema/design system, confidence и конфликты правил.

### Google Gemini in Slides

Gemini может построить полностью редактируемую презентацию из промпта и источников Drive, задать уточняющие вопросы, сформировать план, позволить его отредактировать и затем сгенерировать слайды. Пользователь также может выбрать существующую колоду как визуальный референс, а для отдельного слайда — повторно использовать стиль другой презентации.[^23][^4]

Преимущество этого подхода — контролируемая стадия **plan before render**, которая уменьшает стоимость перегенераций и дает человеку влияние на narrative до верстки. Ограничение для кейса — Google описывает style matching и использование текущей темы, но не публикует формальную декомпозицию неизвестного шаблона, набор детерминированных layout-тестов или экспорт отчета аудита.[^24][^4]

**Что перенять:** короткий диалог перед генерацией, отдельное подтверждение структуры, источники на уровне плана и слайда.

### Plus AI

Plus AI работает непосредственно в PowerPoint и Google Slides, создает и редактирует нативные презентации, умеет генерировать колоду, добавлять отдельные слайды, переписывать текст и менять макет. Компания отдельно подчеркивает собственный Open XML renderer и совместимость с существующими PowerPoint-workflow.[^2]

Поддержка пользовательских шаблонов существует, но публичная автоматическая загрузка обозначена как beta, ограничена Google Slides и требует подготовленного шаблона; Plus использует исходные слайды как есть и не добавляет новые типы макетов. Для Enterprise возможна отдельная настройка шаблона.[^25][^26]

**Что перенять:** сохранение нативного формата как основное продуктовое обещание, а не как последний export step; команды `insert`, `rewrite`, `remix` для локальных изменений.

**Где обойти:** полностью автоматический импорт произвольного PowerPoint-шаблона, генерация новых безопасных вариаций layout и встроенный аудит после каждого изменения.

### SlideSpeak

SlideSpeak — один из наиболее прямых API-конкурентов: он генерирует презентации из текста и документов, программно изменяет существующие PPTX, поддерживает branded templates и экспортирует нативные редактируемые PowerPoint-файлы. API поддерживает асинхронные задачи, webhooks и интеграции с MCP, Zapier и Make.[^27][^8]

Однако в документации заметны два режима onboarding. Enterprise-страница заявляет чтение master layouts, placeholders и design rules из PPTX/POTX, а техническая инструкция для custom templates требует переименовывать layouts и слои по специальным соглашениям `SS_*`. Branded Templates также предполагают AI mapping и выделенный onboarding с ручной доработкой библиотеки layouts.[^28][^29][^30]

Это демонстрирует главный нерешенный рыночный компромисс: высокая точность часто достигается не универсальным пониманием любого файла, а ручной нормализацией шаблона. Именно этот разрыв может закрыть решение VK Tech.

### Templafy

Templafy объединяет agentic document generation, централизованные правила бренда и compliance, работает внутри PowerPoint и подключается к DAM, CRM, SharePoint и другим корпоративным источникам. Agent add-in создает, редактирует и проверяет презентации с использованием утвержденных шаблонов, ассетов и бизнес-правил.[^31][^5]

Сильная сторона — governance: шаблон, разрешенный контент, права доступа, юридические оговорки и аудит рассматриваются как единая система, а не как набор косметических настроек. Это очень близко к бизнес-мотивации VK Tech, но публичный продукт ориентирован на крупное внедрение и заранее администрируемую корпоративную базу, а не на мгновенный разбор неизвестного файла.[^14][^32]

**Что перенять:** раздельные policy packs для бренда, контента и юридических требований; связь каждого исправления с конкретным правилом; versioning правил и ассетов.

### empower

empower встраивается в Microsoft 365, централизует master templates, слайды, изображения, иконки, графики и другие элементы. Его Design Check проверяет template, fonts, colors, font sizes, margins, logo spacing и может автоматически исправлять несоответствия.[^6]

Из всех рассмотренных продуктов это один из лучших референсов для детерминированного аудита. В более новом Slide Generation продукт объединяет AI, корпоративные шаблоны, библиотеку контента, проверку пунктуации/формулировок и обнаружение устаревших слайдов.[^33]

**Что перенять:** audit sidebar с категориями, severity, переходом к объекту и one-click fix; отдельное состояние «устаревший утвержденный контент».

### Prezent

Prezent сочетает AI Builder, библиотеку утвержденных слайдов и Template Converter. Converter анализирует fonts, colors, images и footers, оценивает соответствие выбранному шаблону, показывает нарушения и позволяет принять исправления по одному или все сразу.[^34][^7]

Это самый близкий продуктовый референс для требуемого UX аудита: проблемы не просто перечисляются, а превращаются в управляемую очередь изменений. При этом основной публичный сценарий — преобразовать существующую колоду в заранее выбранный и подготовленный корпоративный шаблон; это отличается от генерации новой колоды по впервые увиденному шаблону.[^35][^16]

**Что перенять:** compliance score, preview before/after, accept/reject для каждого исправления и журнал принятых преобразований.

### Gamma и Beautiful.ai

Gamma хорошо решает быстрый переход от текста к визуальной истории, импортирует PPTX с сохранением редактируемости, извлекает из PPTX/Google Slides тему с цветами, шрифтами и логотипом и экспортирует в PPTX. Таблицы при экспорте могут оставаться редактируемыми.[^36][^37][^38]

Beautiful.ai использует Smart Slides, которые автоматически управляют spacing, alignment и hierarchy, а locked themes, brand kits и reusable slides помогают удерживать бренд. Экспорт в PowerPoint заявлен редактируемым, но анимации и аудио не переносятся.[^39][^11][^40]

Оба продукта — сильные UX-референсы для вариативной композиции, но их основной объект — собственная layout-система. Для VK Tech нельзя ограничиться переносом цветов и шрифтов: требуется воспроизводить правила чужого шаблона и доказуемо валидировать результат.[^1]

### Presentations.AI и Pitch

Presentations.AI делает brand profile из URL компании, применяет логотип, шрифты и цвета, генерирует колоды из темы, документа или URL и заявляет нативный редактируемый PPTX. Это полезный референс для быстрого brand onboarding, но веб-сайт дает только поверхностные токены бренда и не заменяет понимание masters, placeholders, композиционных семейств и служебных элементов PPTX.[^13][^41]

Pitch позволяет приложить исходные файлы, создать branded template из домена, сгенерировать полную колоду агентом и экспортировать PPTX/PDF. Сильная сторона — совместная работа и web-native delivery, но продукт публично не позиционирует детерминированный linting и нативную PPTX-семантику как ядро.[^42][^12]

## Open-source база

### Presenton

Presenton — Apache 2.0 open-source генератор, который можно self-hosted-развернуть через Docker, подключить собственный AI provider, использовать свои дизайны и экспортировать полностью редактируемый PPTX. Он также заявляет генерацию шаблонов из существующих PowerPoint-файлов и API для генерации.[^9][^43]

Это практичный кандидат для быстрого прототипа editor/export слоя. Но его HTML/Tailwind-модель шаблонов означает, что необходимо отдельно проверить точность round-trip для сложных masters, SmartArt, диаграмм, групп, theme inheritance и embedded assets.

### PPTAgent

PPTAgent использует двухфазный edit-based подход: сначала анализирует референсную презентацию, выделяет функциональные типы слайдов и content schemas, затем строит outline и генерирует edit actions на основе выбранных reference slides. PPTEval отдельно оценивает Content, Design и Coherence.[^10][^44]

Архитектурно это наиболее близкая исследовательская основа к задаче VK Tech, поскольку шаблон трактуется не просто как тема, а как набор семантических типов и примеров. Абляции исследования показывают, что удаление outline, schema или structure ухудшает итоговые метрики, что подтверждает пользу явных промежуточных представлений.[^10]

Однако даже сильные исследовательские решения пока далеки от гарантированной промышленной точности: PresentBench показывает существенный разрыв между presentation fundamentals и visual/content fidelity у нескольких систем, а PPTAgent v2 в опубликованной таблице получил 50,2 общего балла. Это аргумент в пользу гибридного генератора с жесткими правилами геометрии, а не полностью свободной VLM-верстки.[^45]

### PPT Master

PPT Master реализован как workflow/skill для coding agents, генерирует нативный PPTX с shapes, charts, tables, transitions и animations, умеет извлекать reusable brand/style/layout templates и заполнять существующий PPTX с явным контрактом сохранения.[^18]

Проект полезен как источник инженерных паттернов для code-driven rendering и контрактов сохранности. Его следует рассматривать как reference implementation, а не как готовый enterprise-сервис с пользовательским аудитом.

## Российский рынок

SimpleSlide и SlidePoint закрывают массовый русскоязычный сценарий: тема или документ → структура → слайды → онлайн-редактор → PPTX/PDF. SimpleSlide заявляет автоматический подбор изображений, графиков и таблиц, а SlidePoint дает отдельную стадию просмотра структуры до финальной генерации.[^19][^20][^46]

Presentacium также позиционируется как русскоязычный AI-помощник, который строит структуру, текст, визуальные элементы и стиль за несколько минут. В доступных публичных материалах этих сервисов не найдены доказательства автоматического разбора произвольного корпоративного PPTX, поддержки master/layout semantics, API для enterprise-интеграции, rule-level аудита или self-hosted open-weight inference.[^21][^47]

Для конкурсного решения эти продукты важны не как технический benchmark, а как benchmark простоты: пользователь ожидает получить черновик за несколько шагов, видеть структуру до генерации и иметь понятное редактирование результата.

## Матрица соответствия

Обозначения: **●** — явно заявлено и близко к требованию; **◐** — частично или через подготовку/ограниченный сценарий; **○** — не найдено в публичной документации. Оценка относится к открыто описанным возможностям на дату отчета, а не к закрытым enterprise-функциям.

| Решение | Промпт/документ → колода | Произвольный PPTX как шаблон | Нативный редактируемый PPTX | Встроенный brand audit | Контентный audit | API / self-hosting | Соответствие open-weight ограничениям |
|---|---:|---:|---:|---:|---:|---:|---:|
| Microsoft Copilot | ● | ◐ | ● | ◐ | ◐ | ◐ | ○ |
| Google Gemini Slides | ● | ◐ | ● | ○ | ◐ | ○ | ○ |
| Plus AI | ● | ◐ | ● | ○ | ◐ | ◐ | ○ |
| SlideSpeak | ● | ◐ | ● | ◐ | ○ | ● API | ○ |
| Templafy | ● | ◐ | ● | ● | ◐ | ◐ | ○ |
| empower | ● | ◐ | ● | ● | ◐ | ○ | ○ |
| Prezent | ● | ◐ | ● | ● | ◐ | ● API | ○ |
| Gamma | ● | ◐ | ◐ | ○ | ◐ | ● API | ○ |
| Beautiful.ai | ● | ○ | ◐ | ◐ | ◐ | ○ | ○ |
| Presentations.AI | ● | ◐ | ● | ◐ | ◐ | ○ | ○ |
| Presenton | ● | ◐ | ● | ○ | ○ | ● self-host | ●, при выборе разрешенных моделей |
| PPTAgent | ● | ● reference analysis | ● | ◐ research eval | ● research eval | ● self-host | ●, при выборе разрешенных моделей |
| SimpleSlide / SlidePoint | ● | ○ | ◐ | ○ | ○ | ○ | не подтверждено |

## Незакрытые рыночные проблемы

### 1. Zero-shot template understanding

Большинство продуктов либо используют собственную систему layout, либо требуют корректные masters/placeholders, naming conventions или ручной onboarding. Редко встречается надежный механизм, который принимает любой реальный PPTX, выявляет скрытые зависимости, дубликаты, фальшивые placeholders и исключения, а затем объясняет полученную дизайн-систему.[^30][^25][^3]

**Возможность:** превратить parser output в inspectable `Template IR` — JSON/граф с theme tokens, masters, layouts, roles, anchors, constraints, examples и confidence.

### 2. Доказуемый native export

Маркетинговая формулировка «editable PPTX» не гарантирует, что диаграммы останутся native charts, таблицы — таблицами, группы — группами, а текстовые стили и inheritance сохранятся корректно. Даже продукты с экспортом рекомендуют проверять результат или признают потери отдельных возможностей.[^40][^38][^48]

**Возможность:** машинно проверять export round-trip: сгенерировать PPTX, повторно распарсить его, сравнить semantic tree и приложить audit manifest.

### 3. Audit как часть генерации

Enterprise-решения умеют проверять бренд, но массовые генераторы в основном предлагают редактирование после факта. Кейс требует объединить геометрические, шаблонные, плотностные, целостностные и смысловые тесты, показать нарушения на слайде и дать пользователю выбрать исправления.[^7][^6][^1]

**Возможность:** сделать audit engine отдельным продуктовым слоем с rule IDs, severity, evidence, bounding boxes, proposed patch, confidence и before/after preview.

### 4. Grounded content fidelity

Современные продукты умеют подключать документы и рабочие файлы, но точность фактов и полнота содержания остаются отдельной задачей. Исследовательские benchmarks показывают, что визуально приемлемые слайды могут иметь слабую content fidelity.[^4][^45]

**Возможность:** хранить provenance на уровне каждого текстового блока, числа, таблицы и графика: `source_id`, page/paragraph, transformation, confidence; запрещать добавление неподтвержденных чисел.

### 5. Контролируемая вариативность

Рынок хорошо умеет `retry` и `remix`, но редко формулирует три варианта как управляемые стратегии. Для кейса различия должны быть заметны и одновременно соответствовать одному шаблону.[^23][^2][^1]

**Возможность:** генерировать не три случайных seed, а три явные политики: `Executive` — низкая плотность и выводы; `Analytical` — больше данных и диаграмм; `Narrative` — последовательная история и визуальные метафоры.

## Рекомендуемое позиционирование

**Формулировка продукта:** «Компилятор корпоративных презентаций, который превращает любой PPTX-шаблон в исполняемую дизайн-систему, создает три редактируемые колоды из проверенных источников и автоматически объясняет и исправляет нарушения».

Такое позиционирование отличает решение сразу от трех классов конкурентов:

- от Gamma/Beautiful.ai — поддержкой чужой дизайн-системы вместо собственного canvas;
- от Copilot/Plus — zero-shot разбором шаблона и прозрачным audit report;
- от Templafy/empower/Prezent — быстрым onboarding без длительной enterprise-настройки;
- от open-source генераторов — продуктовым UX проверки, воспроизводимостью и измеримым SLA.

## Рекомендуемая архитектура

### Template ingestion

1. Разобрать OOXML package: themes, masters, layouts, slides, relationships, media, charts, tables, groups и notes.
2. Нормализовать цвета с учетом theme mapping, tint/shade/alpha; шрифты — с учетом inheritance и fallback.
3. Выделить повторяющиеся regions, guides, margins, grids, logo/footer/page-number zones.
4. Скластеризовать слайды по функциональным типам и layout families, используя structural features плюс render embeddings.
5. Сформировать `Template IR` и визуальный отчет «что система поняла».

Такой подход объединяет сильные стороны master/layout анализа Microsoft и SlideSpeak с schema-first подходом PPTAgent.[^3][^28][^10]

### Content planning

1. Извлечь из content pack атомарные claims, facts, metrics, entities и изображения с provenance.
2. Построить narrative graph: проблема → доказательство → решение → эффект → следующий шаг.
3. Сгенерировать outline до верстки и дать пользователю его подтвердить.
4. Для каждого слайда создать typed content schema: `claim`, `evidence`, `visual_intent`, `source_refs`, `density_budget`.

Промежуточное подтверждение плана соответствует зрелому workflow Gemini и Beautiful.ai и снижает риск дорогой полной перегенерации.[^11][^4]

### Layout planning

Вместо генерации координат моделью следует использовать двухступенчатую схему:

- LLM/VLM выбирает semantic slide type, layout family и способ визуализации;
- constraint solver размещает объекты по anchors и ограничениям шаблона;
- renderer создает нативные OOXML-объекты;
- audit запускается после каждого слайда и возвращает structured patches.

Свободная VLM-верстка может использоваться только как proposer. Финальное решение по границам, пересечениям, контрасту, font scale и safe zones должно оставаться детерминированным — это соответствует требованиям кейса и снижает нестабильность, которую показывают benchmarks генерации слайдов.[^45][^1]

### Audit loop

Для каждого нарушения нужен объект следующего вида:

```json
{
  "rule_id": "LAYOUT.TEXT_OVERFLOW",
  "severity": "error",
  "slide": 6,
  "objects": ["shape_17"],
  "evidence": {"overflow_px": 28},
  "fixes": [
    {"type": "shorten_text", "confidence": 0.88},
    {"type": "switch_layout", "confidence": 0.74}
  ]
}
```

Детерминированные правила должны охватывать bounds, overlap, overflow, alignment, safe margins, aspect ratio, theme fonts/colors, typography scale, contrast, density, file integrity и editability. Контекстуальные агенты проверяют тезисный заголовок, согласованность заголовка и тела, подтверждение фактов источниками, релевантность визуала, единый язык и связность соседних слайдов.[^1]

## Приоритеты MVP

### Обязательно

- Импорт реального PPTX и визуализация извлеченных tokens/layout families.
- Outline-first workflow и source grounding.
- Три управляемые стратегии вариативности.
- Нативные text boxes, shapes, images, tables и charts в PPTX.
- Детерминированный audit с координатной подсветкой и выборочным исправлением.
- Контекстуальный audit с evidence и confidence.
- Повторный парсинг экспортированного PPTX как round-trip test.
- Полный прогон 10–15 слайдов менее чем за пять минут.[^1]

### После MVP

- SmartArt через нативные OOXML-схемы или надежную деградацию в редактируемые grouped shapes.
- Text-to-image до разрешенного лимита модели.
- Версионирование skills/agents и воспроизводимый run manifest.
- Корпоративная библиотека утвержденных ассетов и policy packs.
- Human feedback loop для улучшения выбора layout без переобучения всей модели.

## Как валидировать конкурентное преимущество

Следует подготовить blind benchmark из шаблонов, не использованных в разработке, с разными уровнями качества: корректный Slide Master, визуально сложный шаблон без нормальных placeholders и legacy-колода с ручной версткой. Для каждого шаблона нужно измерять не «красоту в целом», а наблюдаемые показатели.

| Группа | Метрики |
|---|---|
| Template fidelity | Доля корректно извлеченных colors/fonts/layout roles; точность logo/footer zones; совпадение layout family. |
| Layout validity | Количество overlap, overflow, out-of-bounds, off-grid и contrast violations на слайд. |
| Native editability | Доля текста, таблиц, диаграмм и shapes, оставшихся семантически редактируемыми после round-trip. |
| Content fidelity | Доля claims и чисел с валидным source reference; unsupported facts; полнота обязательных тезисов. |
| Narrative | Связность соседних слайдов, отсутствие дублей, качество тезисных заголовков. |
| Вариативность | Попарное различие layouts/visualization policies при нулевых критических нарушениях шаблона. |
| Производительность | End-to-end latency, p50/p95 на слайд и на колоду, число повторных inference-вызовов. |
| Пользовательский контроль | Доля audit fixes, принятых пользователем; время до принятого результата; число ручных правок. |

В качестве baseline разумно прогнать хотя бы Microsoft Copilot или Gemini, Plus AI, Gamma, SlideSpeak и один open-source стек. Сравнение должно проводиться на одинаковых источниках и шаблонах, а закрытые продукты оцениваться по результату, а не по возможности соблюдать конкурсные ограничения.

## Практический вывод для команды

Не стоит конкурировать количеством тем, картинок или «магией одного промпта»: этот слой уже коммодитизирован. Наиболее защищаемая часть решения — **универсальный Template IR, constraint-based renderer, source-grounded content model и audit/repair engine**, которые можно демонстрировать независимо от выбранной LLM.

Самый убедительный live demo должен показывать не только красивую презентацию, а последовательность доказательств: неизвестный PPTX → извлеченные правила → план → три стратегии → подсвеченные нарушения → выбор исправлений → нативный PPTX → повторный audit без критических ошибок. Именно эта цепочка напрямую соответствует критериям архитектурной обоснованности, адаптации к произвольному шаблону, воспроизводимости, качества и скорости из задания VK Tech.[^1]

---

## References

1. ТЗ задачи №4 VK Tech (`sources/tz-vk-tech.pdf`) - 2026

2. [Plus AI presentation maker | Stop making slides the old way](https://plusai.com/) - Plus is an AI assistant for PowerPoint and Slides that helps you create usable, results-oriented pre...

3. [Keep your presentation on-brand with Copilot](https://support.microsoft.com/en-us/powerpoint/copilot/keep-your-presentation-on-brand-with-copilot) - Open the Microsoft Copilot app. · Select Create in the left navigation menu > More… > Brand kits. · ...

4. [Generate presentations with Gemini in Google Slides](https://support.google.com/docs/answer/17111393?hl=en) - Feature availability This feature requires an eligible Google Workspace or Google AI plan. Learn abo...

5. [Create presentations in minutes with Templafy’s AI ...](https://www.templafy.com/home/platform/ai-presentation-maker/) - Discover Templafy’s AI-powered presentation maker. Automate design, enhance clarity, and stay on-bra...

6. [empower® Office 365: powerful add-ins for Microsoft Office](https://www.empowersuite.com/en/features/empower-office-365) - Easy, uniform, efficient. Empower your colleagues as well as your brand with empower®. The #1 add-in...

7. [Presentation Template Converter for Brand-Compliant Slides](https://www.prezent.ai/transform/template-converter) - Convert presentations into brand-compliant templates with Prezent.ai. Automatically update fonts, la...

8. [SlideSpeak API: Generate AI PowerPoint Presentations](https://slidespeak.co/features/slidespeak-api) - An API to create presentations from text or documents · Edit slides programmatically · Export to Pow...

9. [Open-Source AI Presentation Generator and API (Gamma, ...](https://github.com/presenton/presenton) - Create presentations from a prompt, an uploaded document, or your own PowerPoint design. Choose from...

10. [PPTAgent: Generating and Evaluating Presentations Beyond Text-to-Slides](https://arxiv.org/html/2501.03936)

11. [Beautiful.ai](https://www.beautiful.ai/) - Themes & brand control. Define colors, fonts, logos, icons, and footers once. Save and reuse brand t...

12. [Create on-brand decks with Pitch's AI presentation maker](https://pitch.com/use-cases/ai-presentation-maker) - Generate a beautiful presentation in seconds, with Pitch’s AI generator. Enter a prompt, select a co...

13. [Presentations.AI - The AI Presentation Platform](https://www.presentations.ai/) - Create AI presentations in seconds. Turn any topic, document, or URL into branded slides. Export to ...

14. [Brand compliance software for enterprise consistency - Templafy](https://www.templafy.com/home/platform/brand-compliance-software/) - Ensure brand consistency with enterprise-grade brand compliance software. Explore key features, comp...

15. [Does Gamma have an API?](https://help.gamma.app/en/articles/11962420-does-gamma-have-an-api) - Create presentations programmatically with the Gamma Generate API - automation, integration, workflo...

16. [Prezent API: Create Presentations Inside Workflows](https://www.prezent.ai/blog/prezent-api-automated-on-brand-presentations) - Create and transform on-brand PowerPoint presentations within applications, chatbots, and AI workflo...

17. [icip-cas/PPTAgent: An Agentic Framework for Reflective ...](https://github.com/icip-cas/pptagent) - An Agentic Framework for Reflective PowerPoint Generation - icip-cas/PPTAgent

18. [PPT Master — AI generates native PowerPoint from any ...](https://github.com/hugohe3/ppt-master) - AI turns documents or topics into real, native PowerPoint decks—with native shapes, transitions and ...

19. [ИИ презентация бесплатно – нейросеть для презентаций ...](https://simpleslide.ru/) - В течение пары минут искусственный интеллект наполнит слайды текстом и графикой, оформив все в выбра...

20. [Нейросеть для презентаций - создать презентацию ...](https://slidepoint.online/) - Сервис SlidePoint имеет встроенный онлайн редактор PPTX файлов (аналог PowerPoint), который позволяе...

21. [О нашем сервисе Presentacium](https://presentacium.ru/about.html) - Мы — команда Presentacium, и наша миссия — сделать процесс создания презентаций простым, быстрым и в...

22. [AI PowerPoint Generator](https://www.microsoft.com/en-us/microsoft-365/powerpoint/ai-powerpoint-generator) - Easily create professional-looking PowerPoint presentations with Microsoft 365 Copilot. Learn more a...

23. [Generate a slide with Gemini in Google Slides](https://support.google.com/docs/answer/16961475?hl=en) - Feature availability This feature requires an eligible Google Workspace or Google AI plan. Learn abo...

24. [Create Your First Presentation in Slides](https://support.google.com/a/users/answer/10665800?hl=en)

25. [Custom templates (beta) | Plus AI Guide](https://guide.plusai.com/ai-for-presentations/custom-templates-beta) - When you import a custom template, we convert it into a format that can be used by Plus AI — includi...

26. [Plus AI For PowerPoint](https://marketplace.microsoft.com/pl-pl/product/office/wa200007130?tab=overview) - Hundreds of slide templates and layouts. Custom presentation templates. native, editable PowerPoint ...

27. [SlideSpeak | API Docs](https://docs.slidespeak.co/) - SlideSpeak API Overview · Generate presentations from plain text, documents (PDF, Word), or JSON. · ...

28. [Enterprise AI presentations, on your template](https://slidespeak.co/use-cases/enterprise) - Generate on-brand presentations from your documents at team scale. Corporate PowerPoint templates, s...

29. [Branded Templates | API Docs](https://docs.slidespeak.co/basics/branded-templates/branded-templates/) - Learn about SlideSpeak's branded templates and how to upload your own.

30. [Preparing your template | SlideSpeak API Docs](https://docs.slidespeak.co/basics/custom-templates/layouts-and-placeholders) - Learn how to create a PowerPoint template that is compatible with SlideSpeak's AI-driven presentatio...

31. [Best PowerPoint AI Tools for Enterprise Teams - Templafy](https://www.templafy.com/powerpoint-ai/) - Discover how AI can generate PowerPoint presentations in seconds. Explore top AI tools and see how T...

32. [Agentic document generation platform](https://www.templafy.com/) - Agentic enterprise document generation for better consistency, higher quality, and faster document w...

33. [Slide Generation with empower®](https://www.empowersuite.com/en/solutions/slide-generation) - With Slide Generation from empower®, you can create perfect PowerPoint presentations with ease - usi...

34. [Brand-Consistent Presentations at Scale with AI](https://www.prezent.ai/blog/how-enterprise-teams-create-brand-consistent-ai-powered-presentations) - Learn how enterprise teams maintain brand consistency with AI-powered presentations. Create polished...

35. [Prezent Template Converter for Enterprise Brand Compliance](https://www.prezent.ai/blog/how-prezent-template-converter-solves-enterprise-brand-compliance) - Learn how Prezent’s Template Converter automates brand compliance, fixes off-brand decks, and helps ...

36. [How can I import slides or content into Gamma?](https://help.gamma.app/en/articles/11047840-how-can-i-import-slides-or-content-into-gamma) - Learn how to import PowerPoint presentations and other content into Gamma, and how the new Gamma can...

37. [How do I customize themes, colors, and fonts in Gamma?](https://help.gamma.app/en/articles/11029150-how-do-i-customize-themes-colors-and-fonts-in-gamma) - Learn how file themes in the new Gamma 5 give you per-gamma control over your colors, fonts, and sty...

38. [What's the easiest way to export my Gamma?](https://help.gamma.app/en/articles/8022861-what-s-the-easiest-way-to-export-my-gamma) - How to export a Gamma doc, deck, or site to PDF, PNG, or PowerPoint format. Access export options, d...

39. [Brand Controls & Locked Themes | Fix Off-Brand Company ...](https://www.beautiful.ai/brand-controls-themes) - Decks go off-brand when templates are easy to override. Beautiful.ai fixes it with locked Themes, gu...

40. [How to Export to PPT from Beautiful.ai (Editable PowerPoint)](https://www.beautiful.ai/blog/how-to-export-to-ppt-and-why-you-shouldnt) - Select the Export Presentation tab and choose Editable PowerPoint. Click Export to save a copy of th...

41. [Presentations.AI Features: Brand Sync, PPT Export & AI](https://www.presentations.ai/features) - What it does: Upload any document. AI reads, understands, and converts to presentation. Supported fo...

42. [Free online presentation maker – 100+ Templates - Pitch](https://pitch.com/use-cases/presentation-maker) - Create stunning decks with Pitch - an online presentation maker. Pitch helps fast-moving teams build...

43. [presenton/presenton_docker - GitHub](https://github.com/presenton/presenton_docker) - Contribute to presenton/presenton_docker development by creating an account on GitHub.

44. [PPTAgent: Generating and Evaluating Presentations ...](https://github.com/icip-cas/PPTAgent) - PPTAgent: Generating and Evaluating Presentations Beyond Text-to-Slides [EMNLP 2025] - icip-cas/PPTA...

45. [PresentBench: A Fine-Grained Rubric-Based Benchmark for Slide Gener…](https://presentbench.github.io/) - PresentBench is a fine-grained, rubric-based benchmark for evaluating automated real-world slide gen...

46. [Как создать презентацию по тексту с помощью нейросети ...](https://slidepoint.online/blog/93-kak-sozdat-prezentaciju-po-tekstu-s-pomoschju-nejroseti-slidepoint.html) - Создание качественной презентации традиционным способом требует значительного времени и навыков. Нео...

47. [Задать вопрос](https://presentacium.ru/help.html) - Мы в Presentacium стремимся сделать ваш опыт использования нашего сервиса максимально комфортным и п...

48. [How to Manage Presentations Without Headaches](https://gamma.app/explore/content/guides/the-easiest-way-to-create-update-and-share-presentations) - Say goodbye to outdated slides and messy file versions. Learn the simplest way to create, update, an...

