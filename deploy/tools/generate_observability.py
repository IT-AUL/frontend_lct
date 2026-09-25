#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "config" / "grafana"
VM = {"type": "prometheus", "uid": "vm"}
VL = {"type": "victoriametrics-logs-datasource", "uid": "vl"}
SCOPE = 'name=~"deckdna-(app|ops)-.+"'
ACCESS = '{service="caddy",log_type="access"}'

_next_id = [0]


def _id():
    _next_id[0] += 1
    return _next_id[0]


def prom(expr, legend="", ref="A", instant=False):
    return {"datasource": VM, "expr": expr, "legendFormat": legend, "refId": ref, "instant": instant, "range": not instant}


def logs_q(expr, kind="statsRange", legend="", ref="A", extra=None):
    target = {"datasource": VL, "expr": expr, "queryType": kind, "refId": ref, "legendFormat": legend, "editorMode": "code"}
    if extra:
        target.update(extra)
    return target


def stat(title, targets, x, y, w=4, h=4, unit="short", thresholds=None, mappings=None, decimals=None, text_mode="auto"):
    steps = thresholds or [{"color": "green", "value": None}]
    defaults = {"unit": unit, "thresholds": {"mode": "absolute", "steps": steps}, "mappings": mappings or [], "color": {"mode": "thresholds"}}
    if decimals is not None:
        defaults["decimals"] = decimals
    return {
        "id": _id(), "type": "stat", "title": title, "gridPos": {"x": x, "y": y, "w": w, "h": h},
        "datasource": targets[0]["datasource"], "targets": targets,
        "fieldConfig": {"defaults": defaults, "overrides": []},
        "options": {"reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": False}, "colorMode": "background", "graphMode": "none", "textMode": text_mode, "justifyMode": "center"},
    }


def timeseries(title, targets, x, y, w=12, h=8, unit="short", stack=False, min_=None, max_=None, fill=12, legend="bottom"):
    custom = {"drawStyle": "line", "lineWidth": 2, "fillOpacity": fill, "showPoints": "never", "spanNulls": True,
              "stacking": {"mode": "normal" if stack else "none", "group": "A"}}
    defaults = {"unit": unit, "custom": custom, "color": {"mode": "palette-classic"}}
    if min_ is not None:
        defaults["min"] = min_
    if max_ is not None:
        defaults["max"] = max_
    return {
        "id": _id(), "type": "timeseries", "title": title, "gridPos": {"x": x, "y": y, "w": w, "h": h},
        "datasource": targets[0]["datasource"], "targets": targets,
        "fieldConfig": {"defaults": defaults, "overrides": []},
        "options": {"legend": {"displayMode": "list", "placement": legend, "showLegend": True}, "tooltip": {"mode": "multi", "sort": "desc"}},
    }


def bargauge(title, targets, x, y, w=8, h=8, unit="short", max_=None, thresholds=None):
    defaults = {"unit": unit, "thresholds": {"mode": "absolute", "steps": thresholds or [{"color": "green", "value": None}]}, "color": {"mode": "thresholds"}}
    if max_ is not None:
        defaults["max"] = max_
    return {
        "id": _id(), "type": "bargauge", "title": title, "gridPos": {"x": x, "y": y, "w": w, "h": h},
        "datasource": targets[0]["datasource"], "targets": targets,
        "fieldConfig": {"defaults": defaults, "overrides": []},
        "options": {"reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": False}, "orientation": "horizontal", "displayMode": "gradient", "showUnfilled": True},
    }


def state_timeline(title, targets, x, y, w=24, h=7):
    return {
        "id": _id(), "type": "state-timeline", "title": title, "gridPos": {"x": x, "y": y, "w": w, "h": h},
        "datasource": targets[0]["datasource"], "targets": targets,
        "fieldConfig": {"defaults": {
            "custom": {"fillOpacity": 80, "lineWidth": 0},
            "mappings": [{"type": "value", "options": {"1": {"text": "работает", "color": "green", "index": 0}, "0": {"text": "остановлен", "color": "red", "index": 1}}}],
            "color": {"mode": "thresholds"},
            "thresholds": {"mode": "absolute", "steps": [{"color": "red", "value": None}, {"color": "green", "value": 1}]},
        }, "overrides": []},
        "options": {"mergeValues": True, "showValue": "auto", "alignValue": "left", "rowHeight": 0.8, "legend": {"showLegend": False}, "tooltip": {"mode": "single"}},
    }


def table(title, targets, x, y, w=12, h=9, transformations=None, overrides=None, unit="short"):
    return {
        "id": _id(), "type": "table", "title": title, "gridPos": {"x": x, "y": y, "w": w, "h": h},
        "datasource": targets[0]["datasource"], "targets": targets,
        "fieldConfig": {"defaults": {"unit": unit, "custom": {"align": "auto", "cellOptions": {"type": "auto"}}}, "overrides": overrides or []},
        "options": {"showHeader": True, "cellHeight": "sm", "footer": {"show": False}},
        "transformations": transformations or [],
    }


def logs_panel(title, targets, x, y, w=24, h=12):
    return {
        "id": _id(), "type": "logs", "title": title, "gridPos": {"x": x, "y": y, "w": w, "h": h},
        "datasource": VL, "targets": targets,
        "options": {"showTime": True, "wrapLogMessage": True, "prettifyLogMessage": False, "enableLogDetails": True, "sortOrder": "Descending", "dedupStrategy": "none"},
    }


def row(title, y):
    return {"id": _id(), "type": "row", "title": title, "collapsed": False, "gridPos": {"x": 0, "y": y, "w": 24, "h": 1}, "panels": []}


def dashboard(uid, title, panels, tags, refresh="30s", time_from="now-6h", variables=None, description=""):
    return {
        "uid": uid, "title": title, "description": description, "tags": tags, "timezone": "browser", "schemaVersion": 41, "version": 1,
        "editable": True, "graphTooltip": 1, "refresh": refresh, "time": {"from": time_from, "to": "now"},
        "timepicker": {}, "templating": {"list": variables or []}, "annotations": {"list": []}, "links": [], "panels": panels,
    }


UP_MAP = [{"type": "value", "options": {"1": {"text": "OK", "color": "green", "index": 0}, "0": {"text": "НЕДОСТУПЕН", "color": "red", "index": 1}}}]
RG = [{"color": "red", "value": None}, {"color": "green", "value": 1}]


def overview():
    p = []
    y = 0
    p.append(stat("Сайт", [prom('probe_success{check="app_public"}', instant=True)], 0, y, mappings=UP_MAP, thresholds=RG))
    p.append(stat("API готов", [prom('probe_success{check="api_ready"}', instant=True)], 4, y, mappings=UP_MAP, thresholds=RG))
    p.append(stat("Панель ops", [prom('probe_success{check="ops_public"}', instant=True)], 8, y, mappings=UP_MAP, thresholds=RG))
    p.append(stat("Сертификат, дней", [prom('(probe_ssl_earliest_cert_expiry{check="app_public"} - time()) / 86400', instant=True)], 12, y, unit="d", decimals=0,
                  thresholds=[{"color": "red", "value": None}, {"color": "orange", "value": 7}, {"color": "green", "value": 14}]))
    p.append(stat("Ответ сайта", [prom('probe_duration_seconds{check="app_public"}', instant=True)], 16, y, unit="s", decimals=2,
                  thresholds=[{"color": "green", "value": None}, {"color": "orange", "value": 1}, {"color": "red", "value": 3}]))
    p.append(stat("Контейнеров работает", [prom(f'count((time() - container_last_seen{{{SCOPE},name!=""}}) < 120)', instant=True)], 20, y, decimals=0,
                  thresholds=[{"color": "red", "value": None}, {"color": "orange", "value": 8}, {"color": "green", "value": 11}]))
    y += 4
    p.append(row("Трафик", y)); y += 1
    p.append(timeseries("Запросы", [logs_q(f'{ACCESS} | stats by (site) count() requests', legend="{{site}}")], 0, y, w=8, unit="reqps" if False else "short", stack=True))
    p.append(timeseries("HTTP-статусы", [logs_q(f'{ACCESS} | stats by (http_status) count() requests', legend="{{http_status}}")], 8, y, w=8, stack=True))
    p.append(timeseries("Задержка запросов, мс", [
        logs_q(f'{ACCESS} | stats quantile(0.5, duration_ms) p50, quantile(0.95, duration_ms) p95', legend="{{__name__}}")], 16, y, w=8, unit="ms"))
    y += 8
    p.append(row("Хост", y)); y += 1
    p.append(timeseries("CPU, %", [prom('100 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100', "занято")], 0, y, w=6, unit="percent", min_=0, max_=100))
    p.append(timeseries("Память, %", [prom('(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100', "занято"),
                                       prom('(1 - node_memory_SwapFree_bytes / node_memory_SwapTotal_bytes) * 100', "swap", ref="B")], 6, y, w=6, unit="percent", min_=0, max_=100))
    p.append(timeseries("Диск /, %", [prom('100 - node_filesystem_avail_bytes{mountpoint="/",fstype!="rootfs"} / node_filesystem_size_bytes{mountpoint="/",fstype!="rootfs"} * 100', "занято")], 12, y, w=6, unit="percent", min_=0, max_=100))
    p.append(timeseries("Нагрузка (load1)", [prom('node_load1', "load1"), prom('count(node_cpu_seconds_total{mode="idle"})', "ядер", ref="B")], 18, y, w=6))
    y += 8
    p.append(row("Доступность", y)); y += 1
    p.append(timeseries("Время ответа проб, с", [prom('probe_duration_seconds{job=~"probe_.*"}', "{{check}}")], 0, y, w=12, unit="s"))
    p.append(timeseries("Успех проб", [prom('probe_success{job=~"probe_.*"}', "{{check}}")], 12, y, w=12, min_=0, max_=1, fill=0))
    return dashboard("deckdna-overview", "DeckDNA · Обзор", p, ["deckdna", "sre"], description="Состояние сайта, API, трафика и хоста")


def containers():
    p = []
    y = 0
    p.append(state_timeline("Состояние контейнеров (работает / остановлен)", [prom(f'(time() - container_last_seen{{{SCOPE},name!=""}}) < bool 120', "{{name}}")], 0, y, h=8))
    y += 8
    p.append(bargauge("Аптайм", [prom(f'time() - container_start_time_seconds{{{SCOPE},name!=""}}', "{{name}}", instant=True)], 0, y, w=8, unit="s"))
    p.append(bargauge("Перезапуски за 24 ч", [prom(f'changes(container_start_time_seconds{{{SCOPE},name!=""}}[24h])', "{{name}}", instant=True)], 8, y, w=8,
                      thresholds=[{"color": "green", "value": None}, {"color": "orange", "value": 1}, {"color": "red", "value": 3}]))
    p.append(bargauge("OOM-убийства за 24 ч", [prom(f'increase(container_oom_events_total{{{SCOPE},name!=""}}[24h])', "{{name}}", instant=True)], 16, y, w=8,
                      thresholds=[{"color": "green", "value": None}, {"color": "red", "value": 1}]))
    y += 8
    p.append(timeseries("CPU, % одного ядра", [prom(f'sum by (name) (rate(container_cpu_usage_seconds_total{{{SCOPE},name!=""}}[5m])) * 100', "{{name}}")], 0, y, w=12, unit="percent"))
    p.append(timeseries("Память (working set)", [prom(f'container_memory_working_set_bytes{{{SCOPE},name!=""}}', "{{name}}")], 12, y, w=12, unit="bytes"))
    y += 8
    p.append(bargauge("Память от лимита, %", [prom(f'container_memory_working_set_bytes{{{SCOPE},name!=""}} / (container_spec_memory_limit_bytes{{{SCOPE},name!=""}} > 0) * 100', "{{name}}", instant=True)], 0, y, w=8, unit="percent", max_=100,
                      thresholds=[{"color": "green", "value": None}, {"color": "orange", "value": 75}, {"color": "red", "value": 90}]))
    p.append(timeseries("Сеть: приём / отдача", [
        prom(f'sum by (name) (rate(container_network_receive_bytes_total{{{SCOPE},name!=""}}[5m]))', "{{name}} rx"),
        prom(f'sum by (name) (rate(container_network_transmit_bytes_total{{{SCOPE},name!=""}}[5m]))', "{{name}} tx", ref="B")], 8, y, w=8, unit="Bps"))
    p.append(timeseries("Файловая система контейнеров", [prom(f'container_fs_usage_bytes{{{SCOPE},name!=""}}', "{{name}}")], 16, y, w=8, unit="bytes"))
    return dashboard("deckdna-containers", "DeckDNA · Контейнеры", p, ["deckdna", "sre", "containers"], description="Состояние, ресурсы и перезапуски контейнеров стека")


def traffic():
    p = []
    y = 0
    p.append(stat("Запросов", [logs_q(f'{ACCESS} | stats count() requests', kind="stats")], 0, y, w=4, text_mode="value"))
    p.append(stat("Уникальных IP", [logs_q(f'{ACCESS} | stats count_uniq(client_ip) ips', kind="stats")], 4, y, w=4, text_mode="value"))
    p.append(stat("Ошибки 5xx", [logs_q(f'{ACCESS} http_status:>=500 | stats count() errors', kind="stats")], 8, y, w=4,
                  thresholds=[{"color": "green", "value": None}, {"color": "red", "value": 1}], text_mode="value"))
    p.append(stat("Ошибки 4xx", [logs_q(f'{ACCESS} http_status:>=400 http_status:<500 | stats count() errors', kind="stats")], 12, y, w=4,
                  thresholds=[{"color": "green", "value": None}, {"color": "orange", "value": 20}], text_mode="value"))
    p.append(stat("Переданный трафик", [logs_q(f'{ACCESS} | stats sum(bytes) bytes', kind="stats")], 16, y, w=4, unit="bytes", text_mode="value"))
    p.append(stat("Медленные (>2 с)", [logs_q(f'{ACCESS} duration_ms:>2000 | stats count() slow', kind="stats")], 20, y, w=4,
                  thresholds=[{"color": "green", "value": None}, {"color": "orange", "value": 1}], text_mode="value"))
    y += 4
    p.append(timeseries("Запросы по статусам", [logs_q(f'{ACCESS} | stats by (http_status) count() requests', legend="{{http_status}}")], 0, y, w=12, stack=True))
    p.append(timeseries("Запросы по сайтам", [logs_q(f'{ACCESS} | stats by (site) count() requests', legend="{{site}}")], 12, y, w=12, stack=True))
    y += 8
    p.append(timeseries("Задержка, мс (p50 / p95 / p99)", [
        logs_q(f'{ACCESS} | stats quantile(0.5, duration_ms) p50, quantile(0.95, duration_ms) p95, quantile(0.99, duration_ms) p99', legend="{{__name__}}")], 0, y, w=12, unit="ms"))
    p.append(timeseries("Трафик, байт", [logs_q(f'{ACCESS} | stats sum(bytes) bytes', legend="bytes")], 12, y, w=12, unit="bytes"))
    y += 8
    p.append(row("Кто и куда заходит", y)); y += 1
    p.append(table("Топ путей", [logs_q(f'{ACCESS} | stats by (http_path) count() hits, quantile(0.95, duration_ms) p95_ms | sort by (hits desc) | limit 15', kind="stats")], 0, y, w=12))
    p.append(table("Топ IP-адресов", [logs_q(f'{ACCESS} | stats by (client_ip) count() hits, sum(bytes) bytes | sort by (hits desc) | limit 15', kind="stats")], 12, y, w=12))
    y += 9
    p.append(table("Топ клиентов (User-Agent)", [logs_q(f'{ACCESS} | stats by (user_agent) count() hits | sort by (hits desc) | limit 10', kind="stats")], 0, y, w=12))
    p.append(table("Статусы по путям (ошибки)", [logs_q(f'{ACCESS} http_status:>=400 | stats by (http_status, http_path) count() hits | sort by (hits desc) | limit 15', kind="stats")], 12, y, w=12))
    y += 9
    p.append(logs_panel("Последние ошибочные запросы (4xx / 5xx)", [logs_q(f'{ACCESS} http_status:>=400', kind="instant")], 0, y))
    return dashboard("deckdna-traffic", "DeckDNA · Трафик и заходы", p, ["deckdna", "sre", "traffic"], description="Access-логи Caddy: запросы, статусы, задержки, клиенты")


def logs():
    variables = [
        {"name": "service", "label": "Сервис", "type": "custom", "multi": True, "includeAll": True, "allValue": ".+", "current": {"text": "All", "value": "$__all"},
         "options": [], "query": "api,web,caddy,grafana,victoria-metrics,victoria-logs,vector,cadvisor,node-exporter,blackbox,dozzle,docker-socket-proxy"},
        {"name": "search", "label": "Поиск", "type": "textbox", "query": "*", "current": {"text": "*", "value": "*"}},
    ]
    p = [
        timeseries("Объём логов по сервисам", [logs_q('{service=~"$service"} $search | stats by (service) count() lines', legend="{{service}}")], 0, 0, w=24, h=6, stack=True),
        logs_panel("Логи", [logs_q('{service=~"$service"} $search', kind="instant")], 0, 6, h=22),
    ]
    return dashboard("deckdna-logs", "DeckDNA · Логи", p, ["deckdna", "sre", "logs"], refresh="10s", time_from="now-1h", variables=variables, description="Логи всех сервисов стека")


def rule(uid, title, expr, evaluator, params, for_, severity, summary, description, no_data="OK", relative=600):
    return {
        "uid": uid, "title": title, "condition": "C", "for": for_, "noDataState": no_data, "execErrState": "Error", "isPaused": False,
        "annotations": {"summary": summary, "description": description},
        "labels": {"severity": severity, "stack": "deckdna"},
        "data": [
            {"refId": "A", "relativeTimeRange": {"from": relative, "to": 0}, "datasourceUid": "vm",
             "model": {"refId": "A", "expr": expr, "instant": True, "range": False, "intervalMs": 15000, "maxDataPoints": 43200,
                       "datasource": {"type": "prometheus", "uid": "vm"}}},
            {"refId": "B", "relativeTimeRange": {"from": relative, "to": 0}, "datasourceUid": "__expr__",
             "model": {"refId": "B", "type": "reduce", "expression": "A", "reducer": "last", "settings": {"mode": "dropNN"}, "datasource": {"type": "__expr__", "uid": "__expr__"}}},
            {"refId": "C", "relativeTimeRange": {"from": relative, "to": 0}, "datasourceUid": "__expr__",
             "model": {"refId": "C", "type": "threshold", "expression": "B", "conditions": [{"evaluator": {"type": evaluator, "params": params}}], "datasource": {"type": "__expr__", "uid": "__expr__"}}},
        ],
    }


def alerts():
    rules = [
        rule("dd-site-down", "Сайт недоступен", 'probe_success{check="app_public"}', "lt", [1], "3m", "critical",
             "Публичный сайт не отвечает", "Проба https://<APP_DOMAIN>/healthz не проходит более 3 минут.", no_data="Alerting"),
        rule("dd-api-not-ready", "API не готов", 'probe_success{check="api_ready"}', "lt", [1], "2m", "critical",
             "API DeckDNA не отвечает на /health/ready", "Внутренняя проба api:8000 не проходит более 2 минут.", no_data="Alerting"),
        rule("dd-ops-down", "Панель ops недоступна", 'probe_success{check="ops_public"}', "lt", [1], "5m", "warning",
             "Публичная панель ops не отвечает", "Проба страницы входа Grafana не проходит."),
        rule("dd-slow-site", "Сайт отвечает медленно", 'probe_duration_seconds{check="app_public"}', "gt", [3], "5m", "warning",
             "Время ответа сайта выше 3 с", "Проба healthz дольше 3 секунд на протяжении 5 минут."),
        rule("dd-tls-expiry", "Сертификат скоро истекает", '(probe_ssl_earliest_cert_expiry{check="app_public"} - time()) / 86400', "lt", [14], "1h", "warning",
             "Сертификат сайта истекает менее чем через 14 дней", "Caddy должен продлевать сертификат автоматически; проверьте DNS и порт 80."),
        rule("dd-container-down", "Контейнер стека остановлен",
             f'count((time() - container_last_seen{{{SCOPE},name!=""}}) > 180) or vector(0)', "gt", [0], "2m", "critical",
             "Есть контейнер стека, который не виден более 3 минут", "Смотрите дашборд «Контейнеры» и логи в Dozzle."),
        rule("dd-restart-loop", "Контейнер перезапускается",
             f'max(changes(container_start_time_seconds{{{SCOPE},name!=""}}[15m])) or vector(0)', "gt", [2], "0s", "critical",
             "Более двух перезапусков контейнера за 15 минут", "Возможен цикл падений. Смотрите логи контейнера."),
        rule("dd-oom", "OOM-убийство контейнера",
             f'sum(increase(container_oom_events_total{{{SCOPE},name!=""}}[15m])) or vector(0)', "gt", [0], "0s", "critical",
             "Контейнер убит по нехватке памяти", "Поднимите mem_limit или снизьте нагрузку."),
        rule("dd-api-memory", "API близко к лимиту памяти",
             f'max(container_memory_working_set_bytes{{{SCOPE},name=~".*api.*"}} / (container_spec_memory_limit_bytes{{{SCOPE},name=~".*api.*"}} > 0)) * 100 or vector(0)',
             "gt", [90], "10m", "warning", "API использует более 90% лимита памяти", "Риск OOM при тяжёлой генерации."),
        rule("dd-disk-high", "Диск заполнен", '100 - node_filesystem_avail_bytes{mountpoint="/",fstype!="rootfs"} / node_filesystem_size_bytes{mountpoint="/",fstype!="rootfs"} * 100',
             "gt", [85], "10m", "warning", "Диск / занят более чем на 85%", "Очистите образы и логи или расширьте диск."),
        rule("dd-host-memory", "На хосте мало памяти", '(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100', "gt", [95], "10m", "warning",
             "Занято более 95% памяти хоста", "На хосте работают и другие сервисы; проверьте swap."),
        rule("dd-host-swap", "Swap почти исчерпан", '(1 - node_memory_SwapFree_bytes / node_memory_SwapTotal_bytes) * 100', "gt", [90], "15m", "warning",
             "Swap занят более чем на 90%", "Хост под давлением по памяти."),
    ]
    return {"apiVersion": 1, "groups": [{"orgId": 1, "name": "deckdna", "folder": "DeckDNA", "interval": "1m", "rules": rules}]}


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_yaml_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main():
    dashboards_dir = ROOT / "dashboards"
    for factory in (overview, containers, traffic, logs):
        d = factory()
        write_json(dashboards_dir / f"{d['uid']}.json", d)
    write_yaml_json(ROOT / "provisioning" / "alerting" / "rules.yml", alerts())
    print("generated")


if __name__ == "__main__":
    main()
