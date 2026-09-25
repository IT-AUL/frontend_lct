"""FastAPI application — Wave 1 contract surface for docs/contracts/API.md.

Every domain route from API.md is mounted here. Pipeline business logic is
not implemented yet: handlers store inputs in an in-memory stub store and
return schema-valid responses built from the generated contract models in
``deckdna.contracts``. "Jobs" are executed synchronously inside the request
and returned already ``completed`` so the frontend can exercise the whole
flow end to end; real stages replace the stub bodies in Wave 2.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import re
import tempfile
import zipfile
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from io import BytesIO
from pathlib import Path
from typing import Annotated, Any, Literal
from urllib.parse import urlparse
from uuid import uuid4

import yaml
from fastapi import FastAPI, File, Form, Header, Query, Request, Response, UploadFile
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse
from lxml import etree
from pydantic import BaseModel, Field, field_validator
from sse_starlette.sse import EventSourceResponse
from starlette.concurrency import run_in_threadpool

from deckdna.audit import basic as _audit_basic
from deckdna.audit.basic import audit_deck
from deckdna.audit.contextual import run_contextual_audit
from deckdna.audit.issues import AuditIssue as _RuntimeAuditIssue
from deckdna.contracts.audit_issue import AuditIssue
from deckdna.contracts.content_pack import ContentPack
from deckdna.contracts.deck_plan import Brief, DeckPlan
from deckdna.contracts.design_dna import DesignDNA
from deckdna.contracts.evidence_graph import EvidenceGraph
from deckdna.contracts.variant_spec import Strategy
from deckdna.errors import DeckDNAError
from deckdna.generation import pipeline
from deckdna.ingestion import content_parsers
from deckdna.ingestion.content_parsers import parse_file
from deckdna.planning.evidence import build_evidence_graph
from deckdna.planning.story_director import plan_deck, plan_deck_llm
from deckdna.providers.base import ModelGateway
from deckdna.providers.factory import build_gateway
from deckdna.providers.openai_compat import OpenAICompatibleProvider
from deckdna.repair.apply import apply_repairs
from deckdna.repair.planner import plan_repairs_with_report
from deckdna.settings import settings
from deckdna.template import autopsy

API_PREFIX = "/api/v1"
SCHEMA_VERSION = "freeze-1"

# api/app.py -> deckdna -> backend -> repo root; used to locate skill/manifest.yaml
# regardless of the process working directory.
_REPO_ROOT = Path(__file__).resolve().parents[3]


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex}"


def _utcnow() -> datetime:
    return datetime.now(UTC)


class Page[T](BaseModel):
    """Opaque-cursor page envelope (API.md §1)."""

    items: list[T]
    next_cursor: str | None = None


class ErrorBody(BaseModel):
    """Typed error object from API.md §1."""

    code: str
    message: str
    stage: str | None = None
    retryable: bool = False
    request_id: str | None = None
    details: dict[str, Any] = {}


class ErrorEnvelope(BaseModel):
    error: ErrorBody


# ---------------------------------------------------------------------------
# Request/response DTOs (entity shapes from docs/contracts/DOMAIN_MODEL.md;
# cross-workstream artifact payloads reuse deckdna.contracts models).
# ---------------------------------------------------------------------------


class JobState(StrEnum):
    queued = "queued"
    running = "running"
    awaiting_user = "awaiting_user"
    completed = "completed"
    failed = "failed"
    canceled = "canceled"


class JobKind(StrEnum):
    template_analysis = "template_analysis"
    content_ingestion = "content_ingestion"
    generation = "generation"
    audit = "audit"
    repair = "repair"
    export = "export"


class JobError(BaseModel):
    code: str
    message: str
    stage: str | None = None


class Job(BaseModel):
    id: str
    kind: JobKind
    state: JobState
    stage: str | None = None
    progress: float = Field(ge=0.0, le=1.0)
    project_id: str | None = None
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    error: JobError | None = None
    result_ids: dict[str, str] = {}


class ModelSpec(BaseModel):
    text: str
    vision: str
    embedding: str | None = None
    image: str | None = None


class ProviderCapabilities(BaseModel):
    structured_output: bool = False
    tool_calls: bool = False
    image_input: bool = False
    embeddings: bool = False


class ProviderSessionCreate(BaseModel):
    label: str
    base_url: str
    api_token: str = Field(min_length=1)
    models: ModelSpec
    capabilities: ProviderCapabilities = ProviderCapabilities()
    timeout_seconds: int = 90
    max_concurrency: int = 4
    ttl_seconds: int = 14400
    project_id: str | None = None

    @field_validator("base_url")
    @classmethod
    def _base_url_is_safe(cls, value: str) -> str:
        # base_url публикуется в ProviderSession наружу — userinfo с
        # кредами в URL утёк бы в ответ; креды места в api_token, не в URL.
        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise ValueError("base_url must be an http(s) URL")
        if parsed.username or parsed.password:
            raise ValueError("base_url must not carry userinfo credentials")
        return value


class ProviderSession(BaseModel):
    """Session view — токен и рабочие лимиты хранятся в lease-сторе
    (in-memory до Redis, Wave 2) и никогда не возвращаются API."""

    id: str
    label: str
    base_url: str
    models: ModelSpec
    capabilities: ProviderCapabilities
    project_id: str | None = None
    created_at: datetime
    expires_at: datetime


class CapabilityProbe(BaseModel):
    capability: str
    status: Literal["ok", "fail", "skip"]
    detail: str | None = None


class ProviderSessionTestResult(BaseModel):
    session_id: str
    results: list[CapabilityProbe]
    tested_at: datetime


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1)
    default_language: str = "ru"
    target_slide_count: int = Field(default=12, ge=3, le=40)


class ProjectPatch(BaseModel):
    name: str | None = None
    default_language: str | None = None
    target_slide_count: int | None = Field(default=None, ge=3, le=40)


class Project(BaseModel):
    id: str
    name: str
    status: Literal["draft", "ready", "archived"]
    default_language: str
    target_slide_count: int
    template_id: str | None = None
    content_pack_id: str | None = None
    created_at: datetime
    updated_at: datetime


class TemplateAsset(BaseModel):
    id: str
    project_id: str
    filename: str
    media_type: str
    package_type: Literal["pptx", "potx"]
    sha256: str
    size_bytes: int
    artifact_id: str
    validation_status: Literal["pending", "valid", "invalid"]
    created_at: datetime


class TemplateAnalysisRequest(BaseModel):
    provider_session_id: str | None = None
    config_version: str | None = None


class AnalysisAccepted(BaseModel):
    job_id: str
    analysis_id: str


class TemplateAnalysis(BaseModel):
    id: str
    template_id: str
    revision: int
    status: Literal["running", "completed", "failed"]
    parser_version: str
    config_version: str | None = None
    design_dna_revision: int | None = None
    preview_artifact_ids: list[str]
    package_inventory: dict[str, Any] | None = None
    warnings: list[str]
    created_at: datetime
    finished_at: datetime | None = None


class TemplateDetail(TemplateAsset):
    latest_analysis: TemplateAnalysis | None = None


class SlidePreviewMeta(BaseModel):
    id: str
    slide_index: int
    role: str | None = None
    purpose: str | None = None
    title: str | None = None
    part: str | None = None
    mutability: str | None = None
    preview_artifact_id: str | None = None


class ContentPackAccepted(BaseModel):
    content_pack: ContentPack
    job: Job


class VariantRequest(BaseModel):
    strategy: Literal["faithful", "balanced", "visual", "custom"]
    # Принимается под будущее: сейчас no-op — в пайплайне нет ни одного
    # источника управляемой случайности (детерминированный путь её не
    # нуждается, LLM-семплинг через этот API не сидируется). Реальный
    # смысл появится вместе с LLM top-k reranking'ом / tie-breaking.
    seed: int | None = Field(
        default=None,
        description=(
            "Accepted for future use; currently a no-op — the pipeline has "
            "no source of controlled randomness to seed (deterministic path "
            "needs none; LLM sampling is not seed-wired through this API)."
        ),
    )
    # Принимается, но на генерацию не применяется и на вариант не
    # сохраняется. На эндпоинтах анализа/аудита config_version реально
    # пишется в запись как metadata — там он не no-op.
    config_version: str | None = Field(
        default=None,
        description=(
            "Accepted but currently not applied to generation behaviour or "
            "stored on the variant (on analysis/audit endpoints it IS "
            "recorded as metadata)."
        ),
    )


class GenerationCreate(BaseModel):
    template_id: str
    content_pack_id: str
    provider_session_id: str | None = None
    brief: Brief
    variants: list[VariantRequest] = Field(min_length=1, max_length=3)
    # Как и VariantRequest.config_version: принимается, на генерацию не
    # применяется и никуда не пишется (в отличие от того же поля на
    # эндпоинтах анализа/аудита, где оно — metadata записи).
    config_version: str | None = Field(
        default=None,
        description=(
            "Accepted but currently not applied to generation behaviour or "
            "stored on the run."
        ),
    )
    # Как VariantRequest.seed: accepted-for-future-use, сейчас no-op —
    # сидировать нечего, источников случайности в пайплайне нет.
    seed: int | None = Field(
        default=None,
        description=(
            "Accepted for future use; currently a no-op — the pipeline has "
            "no source of controlled randomness to seed."
        ),
    )
    # LLM/VLM-режим (паритет с `deckdna generate --llm`): планирование через
    # plan_deck_llm + contextual VLM-аудит. provider_session_id выбирает
    # gateway по кредам lease-сессии и сам по себе включает LLM-путь;
    # иначе use_llm → build_gateway() по env settings (mock по дефолту).
    use_llm: bool = False


class GenerationAccepted(BaseModel):
    generation_id: str
    job_id: str
    variant_ids: list[str]


class VariantMetrics(BaseModel):
    validity: float | None = None
    editability_pei: int | None = None
    issues_total: int | None = None


class VariantSummary(BaseModel):
    id: str
    run_id: str
    strategy: str
    status: JobState
    rationale: str | None = None
    deck_artifact_id: str | None = None
    montage_artifact_id: str | None = None
    metrics: VariantMetrics | None = None
    audit_status: Literal["not_started", "running", "completed", "failed"] = "not_started"
    export_ids: list[str] = []
    # Что реально спланировало колоду и сколько VLM-issues вернул
    # contextual-аудит (None = LLM-режим выключен / не запускался).
    planner: str | None = None
    contextual_issues: int | None = None
    # id плана ЭТОГО варианта — при разных стратегиях планы различаются,
    # run-level deck_plan хранит план первого варианта.
    deck_plan_id: str | None = None


class GenerationDetail(BaseModel):
    id: str
    project_id: str
    state: JobState
    job_id: str
    events_url: str
    template_id: str
    content_pack_id: str
    deck_plan_id: str | None = None
    deck_plan: DeckPlan | None = None
    variants: list[VariantSummary]
    parent_run_id: str | None = None
    created_at: datetime
    finished_at: datetime | None = None


class SlideInfo(BaseModel):
    id: str
    variant_id: str
    index: int
    slide_plan_id: str | None = None
    purpose: str | None = None
    title: str | None = None
    revision: int = 1
    preview_artifact_id: str | None = None


class AuditRequest(BaseModel):
    provider_session_id: str | None = None
    config_version: str | None = None


class AuditAccepted(BaseModel):
    audit_id: str
    job_id: str


class IssueSummary(BaseModel):
    info: int = 0
    warning: int = 0
    error: int = 0
    blocker: int = 0


class AuditRun(BaseModel):
    id: str
    variant_id: str
    deck_revision: int
    status: Literal["running", "completed", "failed"]
    deterministic_status: Literal["pending", "running", "completed", "failed"]
    contextual_status: Literal["pending", "running", "completed", "failed", "skipped"]
    issue_count: int
    summary_by_severity: IssueSummary
    summary_by_type: dict[str, int]
    config_version: str | None = None
    created_at: datetime
    finished_at: datetime | None = None


class RepairRequest(BaseModel):
    provider_session_id: str | None = None
    selected_issue_ids: list[str] = Field(min_length=1)
    max_iterations: int = Field(default=2, ge=1, le=5)


class RepairAccepted(BaseModel):
    job_id: str
    audit_id: str
    deck_revision: int


class IssueDismissRequest(BaseModel):
    reason: str = Field(min_length=1)


class ExportRequest(BaseModel):
    formats: list[Literal["pptx", "pdf", "html", "quality_passport"]] = Field(min_length=1)


class ExportAccepted(BaseModel):
    export_id: str
    job_id: str


class ExportArtifact(BaseModel):
    format: str
    artifact_id: str
    sha256: str
    size_bytes: int
    mime_type: str
    download_url: str


class ExportRecord(BaseModel):
    id: str
    variant_id: str
    deck_revision: int
    job_id: str
    artifacts: list[ExportArtifact]
    created_at: datetime


# ---------------------------------------------------------------------------
# In-memory stub store. Wave 2 replaces this with Postgres repositories and a
# real job queue; the store exists only to keep stub responses coherent
# (created entities are visible to subsequent GETs).
# ---------------------------------------------------------------------------


class _Artifact(BaseModel):
    id: str
    project_id: str | None
    type: str
    mime_type: str
    filename: str
    sha256: str
    size_bytes: int
    created_at: datetime
    data: bytes = b""


class _InternalRun(BaseModel):
    """GenerationRun bookkeeping: run fields plus owned child records."""

    detail: GenerationDetail
    variant_strategy: dict[str, str] = {}
    deck_revision: dict[str, int] = {}
    request: GenerationCreate | None = None
    # variant_id -> {format -> artifact_id} for artifacts the pipeline produced
    variant_artifacts: dict[str, dict[str, str]] = {}
    # variant_id -> фактический DeckPlan варианта (run.detail.deck_plan —
    # только план первого варианта; VLM-аудиту нужен план именно этого
    # варианта, иначе checks граундятся в чужом плане)
    variant_plans: dict[str, DeckPlan] = {}


class _Store:
    def __init__(self) -> None:
        self.projects: dict[str, Project] = {}
        self.provider_sessions: dict[str, ProviderSession] = {}
        # Lease-держатель api_token + рабочих полей ProviderSessionCreate
        # (timeout/concurrency не входят в публичную модель сессии).
        # Токен никогда не сериализуется в ответы — in-memory до Redis
        # (Wave 2), семантика lease: TTL + revoke по DELETE.
        self.provider_secrets: dict[str, dict[str, Any]] = {}
        self.templates: dict[str, TemplateAsset] = {}
        self.analyses: dict[str, TemplateAnalysis] = {}
        self.design_dna: dict[str, DesignDNA] = {}
        self.template_slides: dict[str, list[SlidePreviewMeta]] = {}
        self.content_packs: dict[str, ContentPack] = {}
        self.pack_artifacts: dict[str, list[str]] = {}
        self.evidence_graphs: dict[str, EvidenceGraph] = {}
        self.runs: dict[str, _InternalRun] = {}
        self.slides: dict[str, list[SlideInfo]] = {}
        self.audits: dict[str, AuditRun] = {}
        self.issues: dict[str, list[AuditIssue]] = {}
        self.exports: dict[str, ExportRecord] = {}
        self.jobs: dict[str, Job] = {}
        self.artifacts: dict[str, _Artifact] = {}
        self.idempotency: dict[tuple[str, str, str], dict[str, Any]] = {}


STORE = _Store()


def _require[T](mapping: dict[str, T], key: str, what: str) -> T:
    try:
        return mapping[key]
    except KeyError:
        raise DeckDNAError("not_found", f"{what} not found: {key}") from None


def _require_session(
    session_id: str, project_id: str | None = None
) -> ProviderSession:
    """Provider session с проверкой lease: живой TTL + project scope.

    Истёкшая сессия вытесняется (вместе с токеном) и отвечает 404 —
    как несуществующая. Сессия, привязанная к проекту, не может быть
    использована в чужом проекте.
    """
    session = _require(STORE.provider_sessions, session_id, "provider session")
    if session.expires_at <= _utcnow():
        STORE.provider_sessions.pop(session_id, None)
        STORE.provider_secrets.pop(session_id, None)
        raise DeckDNAError(
            "not_found", f"provider session expired: {session_id}"
        )
    if (
        project_id is not None
        and session.project_id is not None
        and session.project_id != project_id
    ):
        raise DeckDNAError(
            "invalid_input",
            f"provider session {session_id} is bound to project "
            f"{session.project_id}, not {project_id}",
        )
    return session


def _session_gateway(session: ProviderSession) -> OpenAICompatibleProvider:
    """Gateway по lease-секрету сессии (не env settings)."""
    secret = _require(
        STORE.provider_secrets, session.id, "provider session secret"
    )
    return OpenAICompatibleProvider(
        base_url=session.base_url,
        api_key=secret["api_token"],
        model_text=session.models.text,
        model_vision=session.models.vision or "",
        model_embed=session.models.embedding or "",
        timeout_s=float(secret["timeout_seconds"]),
    )


def _gateway_for(body: GenerationCreate) -> ModelGateway | None:
    """Выбор gateway генерации.

    provider_session_id → gateway по кредам сессии (подразумевает
    LLM-путь — сессия и есть источник провайдера); иначе use_llm →
    build_gateway() по env settings (mock по дефолту).
    """
    if body.provider_session_id is not None:
        return _session_gateway(_require_session(body.provider_session_id))
    return build_gateway() if body.use_llm else None


def _store_artifact(
    data: bytes,
    *,
    type: str,
    mime_type: str,
    filename: str,
    project_id: str | None = None,
) -> _Artifact:
    artifact = _Artifact(
        id=_new_id("art"),
        project_id=project_id,
        type=type,
        mime_type=mime_type,
        filename=filename,
        sha256=hashlib.sha256(data).hexdigest(),
        size_bytes=len(data),
        created_at=_utcnow(),
        data=data,
    )
    STORE.artifacts[artifact.id] = artifact
    return artifact


def _complete_job(kind: JobKind, project_id: str | None, result_ids: dict[str, str]) -> Job:
    now = _utcnow()
    job = Job(
        id=_new_id("job"),
        kind=kind,
        state=JobState.completed,
        progress=1.0,
        project_id=project_id,
        created_at=now,
        started_at=now,
        finished_at=now,
        result_ids=result_ids,
    )
    STORE.jobs[job.id] = job
    return job


# ---------------------------------------------------------------------------
# Stub payload factories — minimal schema-valid samples so the frontend can
# build real screens against realistic shapes. Wave 2 replaces these with the
# actual pipeline outputs.
# ---------------------------------------------------------------------------

_PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation"

# Mirrors the suffix dispatch in ingestion.content_parsers._PARSERS — the
# first uploaded file with one of these becomes the parsed pack source.
# Derived from the ingestion parser registry — stays in sync automatically.
_SUPPORTED_CONTENT_SUFFIXES = set(content_parsers._PARSERS)
_MIME_BY_FORMAT = {"pptx": _PPTX_MIME, "pdf": "application/pdf", "html": "text/html"}


_PART_NUMBER = re.compile(r"(\d+)\.xml$")


def _part_number(name: str) -> int:
    match = _PART_NUMBER.search(name)
    return int(match.group(1)) if match else 0


def _pptx_part_names(data: bytes) -> dict[str, list[str]]:
    """Real OOXML part names from the uploaded package (census, no invention)."""
    patterns = {
        "slides": re.compile(r"^ppt/slides/slide\d+\.xml$"),
        "layouts": re.compile(r"^ppt/slideLayouts/slideLayout\d+\.xml$"),
        "masters": re.compile(r"^ppt/slideMasters/slideMaster\d+\.xml$"),
        "themes": re.compile(r"^ppt/theme/theme\d+\.xml$"),
    }
    with zipfile.ZipFile(BytesIO(data)) as zf:
        names = zf.namelist()
    return {
        key: sorted((n for n in names if rx.match(n)), key=_part_number)
        for key, rx in patterns.items()
    }


def _pptx_slide_size(data: bytes) -> tuple[int, int]:
    """sldSz from ppt/presentation.xml — real EMU dimensions of the package."""
    with zipfile.ZipFile(BytesIO(data)) as zf:
        root = etree.fromstring(zf.read("ppt/presentation.xml"))
    node = root.find(".//p:sldSz", autopsy.NS)
    if node is None or node.get("cx") is None or node.get("cy") is None:
        raise DeckDNAError("package_corrupt", "presentation.xml has no sldSz")
    return int(node.get("cx", "0")), int(node.get("cy", "0"))


def _pptx_theme_fonts(
    data: bytes, theme_parts: list[str]
) -> dict[str, tuple[str | None, str | None]]:
    """Per-theme (majorFont, minorFont) latin typefaces, read from each theme part."""
    out: dict[str, tuple[str | None, str | None]] = {}
    with zipfile.ZipFile(BytesIO(data)) as zf:
        for part in theme_parts:
            root = etree.fromstring(zf.read(part))
            fonts: dict[str, str | None] = {}
            for tag in ("majorFont", "minorFont"):
                node = root.find(f".//a:fontScheme/a:{tag}/a:latin", autopsy.NS)
                fonts[tag] = node.get("typeface") if node is not None else None
            out[part] = (fonts["majorFont"], fonts["minorFont"])
    return out


def _forensics_to_design_dna(
    forensics: autopsy.TemplateForensics,
    data: bytes,
    template_id: str,
    analysis_id: str,
) -> DesignDNA:
    """Map TemplateForensics onto the DesignDNA contract.

    Autopsy gives us: package census (slide/master/layout/theme part names
    are read straight from the zip), per-layout slide usage, declared theme
    fonts, observed run-level fonts. Semantic fields autopsy does not
    compute (slide roles, capacities, components, anchors, font sizes,
    colors, spacing, backgrounds) stay empty/`"unresolved"` — never invented.
    """
    from deckdna.contracts import design_dna as dna

    parts = _pptx_part_names(data)
    width, height = _pptx_slide_size(data)
    theme_fonts = _pptx_theme_fonts(data, parts["themes"])

    unsupported: list[dna.UnsupportedFeature] = []
    if forensics.charts:
        unsupported.append(
            dna.UnsupportedFeature(
                feature="chart",
                location=f"ppt/charts/ ({forensics.charts} parts)",
                strategy=dna.Strategy.preserve,
                disclosure="detected by package census; render fidelity not verified",
            )
        )
    if forensics.embeddings:
        unsupported.append(
            dna.UnsupportedFeature(
                feature="embedded_object",
                location=f"ppt/embeddings/ ({forensics.embeddings} parts)",
                strategy=dna.Strategy.preserve,
                disclosure="detected by package census; render fidelity not verified",
            )
        )

    return dna.DesignDNA(
        schema_version=SCHEMA_VERSION,
        template_id=template_id,
        analysis_id=analysis_id,
        created_at=_utcnow(),
        slide_size=dna.SlideSize(
            width_emu=width,
            height_emu=height,
            aspect_ratio=width / height if height else 0.0,
        ),
        declared=dna.Declared(
            themes=[
                dna.Theme(
                    part=part,
                    major_font=theme_fonts[part][0] or "unspecified",
                    minor_font=theme_fonts[part][1] or "unspecified",
                    colors={},
                )
                for part in parts["themes"]
            ],
            masters=[
                dna.Master(part=part, layout_parts=[], placeholders=[]) for part in parts["masters"]
            ],
            layouts=[
                dna.Layout(
                    part=part,
                    name="unresolved",
                    type="unresolved",
                    placeholders=[],
                )
                for part in parts["layouts"]
            ],
        ),
        observed=dna.Observed(
            fonts=[
                dna.Frequency(value=font, frequency=count)
                for font, count in forensics.observed_fonts.items()
            ],
            font_sizes=[],
            colors=[],
            spacing=dna.Spacing(),
        ),
        anchors=[],
        slide_roles=[],
        exemplars=[
            dna.Exemplar(
                slide_index=index,
                part=part,
                role="unresolved",
                cluster_id="unresolved",
            )
            for index, part in enumerate(parts["slides"])
        ],
        components=[],
        capacities=dna.Capacities(),
        unsupported_features=unsupported,
    )


def _stub_audit_issues(
    audit_run_id: str, slide_ids: list[str]
) -> list[AuditIssue]:
    from deckdna.contracts import audit_issue as ai

    first_slide = slide_ids[0] if slide_ids else None
    specs = [
        (
            "contrast_min",
            ai.Severity.warning,
            True,
            True,
            "Contrast 3.2 < 4.5 on body text",
            3.2,
            4.5,
        ),
        (
            "overflow_text",
            ai.Severity.error,
            True,
            True,
            "Text overflows shape bounds by 12pt",
            "412pt",
            "400pt",
        ),
        (
            "unsupported_claim",
            ai.Severity.blocker,
            False,
            False,
            "Claim lacks evidence support",
            None,
            None,
        ),
        (
            "style_drift",
            ai.Severity.info,
            False,
            True,
            "Font size deviates from observed scale",
            None,
            None,
        ),
    ]
    return [
        ai.AuditIssue(
            schema_version=SCHEMA_VERSION,
            id=_new_id("iss"),
            audit_run_id=audit_run_id,
            deck_revision=1,
            rule_code=rule,
            deterministic=det,
            severity=sev,
            slide_id=first_slide,
            slide_index=0,
            bbox=ai.Bbox(x=0.1, y=0.2, w=0.3, h=0.1),
            message=message,
            measured_value=measured,
            threshold=threshold,
            status=ai.Status.open,
            repairable=repairable,
            proposed_actions=["shorten_text"] if repairable else None,
            provenance=ai.Provenance(rule_version="stub-1"),
        )
        for rule, sev, det, repairable, message, measured, threshold in specs
    ]


# ---------------------------------------------------------------------------
# Application, middleware and error handling.
# ---------------------------------------------------------------------------

app = FastAPI(
    title="DeckDNA",
    version="0.1.0",
    openapi_url="/openapi.json",
    responses={
        "4XX": {
            "model": ErrorEnvelope,
            "description": "Client error — typed DeckDNAError envelope (API.md §1)",
        },
        "5XX": {
            "model": ErrorEnvelope,
            "description": "Server/dependency error — typed DeckDNAError envelope",
        },
    },
)


def _mark_binary_fields(node: Any) -> None:
    # FastAPI emits OpenAPI 3.1 `contentMediaType` for UploadFile. Swagger UI
    # only renders a file picker for `format: binary` (and never for array
    # items), so add the 3.0-style marker alongside for codegen/UI clients.
    if isinstance(node, dict):
        if node.get("type") == "string" and node.get("contentMediaType"):
            node["format"] = "binary"
        for value in node.values():
            _mark_binary_fields(value)
    elif isinstance(node, list):
        for value in node:
            _mark_binary_fields(value)


def _custom_openapi() -> dict[str, Any]:
    if app.openapi_schema:
        return app.openapi_schema
    spec = get_openapi(
        title=app.title, version=app.version, routes=app.routes
    )
    _mark_binary_fields(spec)
    app.openapi_schema = spec
    return spec


app.openapi = _custom_openapi  # type: ignore[method-assign]

_STATUS_BY_CODE = {
    "invalid_input": 422,
    "package_corrupt": 422,
    "unsupported_encrypted_template": 422,
    "not_found": 404,
    "not_implemented": 501,
    "idempotency_conflict": 409,
    "provider_unavailable": 503,
    "time_budget_exceeded": 503,
    "internal_error": 500,
}


@app.middleware("http")
async def contract_middleware(request: Request, call_next: Any) -> Response:
    """Attach X-Request-ID; implement API.md §12 idempotency replay (in-memory)."""
    request.state.request_id = uuid4().hex
    headers = {"X-Request-ID": request.state.request_id}
    is_mutation = request.method in {"POST", "PATCH", "DELETE"}
    idem_key = request.headers.get("idempotency-key") if is_mutation else None
    cache_key = (request.method, request.url.path, idem_key or "")
    if idem_key:
        body_hash = hashlib.sha256(await request.body()).hexdigest()
        record = STORE.idempotency.get(cache_key)
        if record is not None:
            if record["body_hash"] != body_hash:
                err = DeckDNAError(
                    "idempotency_conflict",
                    "Idempotency-Key was already used with a different request body",
                )
                return JSONResponse(
                    status_code=409,
                    content=err.to_envelope(request.state.request_id),
                    headers=headers,
                )
            return Response(
                content=record["body"],
                status_code=record["status"],
                media_type="application/json",
                headers=headers,
            )
    response = await call_next(request)
    if not idem_key:
        response.headers["X-Request-ID"] = request.state.request_id
        return response
    body_bytes = b"".join([chunk async for chunk in response.body_iterator])
    if (
        200 <= response.status_code < 300
        and response.headers.get("content-type", "").startswith("application/json")
    ):
        STORE.idempotency[cache_key] = {
            "body_hash": body_hash,
            "status": response.status_code,
            "body": body_bytes,
        }
    out_headers = dict(response.headers)
    out_headers["X-Request-ID"] = request.state.request_id
    return Response(
        content=body_bytes,
        status_code=response.status_code,
        headers=out_headers,
    )


@app.exception_handler(DeckDNAError)
async def deckdna_error_handler(request: Request, exc: DeckDNAError) -> JSONResponse:
    status = exc.http_status or _STATUS_BY_CODE.get(exc.code) or (
        503 if exc.retryable else 422
    )
    return JSONResponse(
        status_code=status,
        content=exc.to_envelope(getattr(request.state, "request_id", None)),
    )


@app.exception_handler(RequestValidationError)
async def validation_error_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    # API.md §1: even malformed-domain-input failures keep the error envelope.
    # exc.errors() несёт `input` (сырое тело запроса — может содержать
    # api_token) и `ctx` (значения валидаторов); оба вырезаются — в конверт
    # ошибки не должен попадать ни один байт пользовательского ввода, в
    # котором могут лежать секреты.
    errors = [
        {key: value for key, value in error.items() if key not in {"input", "ctx"}}
        for error in exc.errors()
    ]
    err = DeckDNAError(
        "invalid_input",
        "request validation failed",
        details={"errors": jsonable_encoder(errors)},
    )
    return JSONResponse(
        status_code=422,
        content=err.to_envelope(getattr(request.state, "request_id", None)),
    )


IdempotencyKey = Annotated[str | None, Header(alias="Idempotency-Key")]


# ---------------------------------------------------------------------------
# §2 Provider sessions
# ---------------------------------------------------------------------------


@app.post(f"{API_PREFIX}/provider-sessions", status_code=201, tags=["provider-sessions"])
async def create_provider_session(
    body: ProviderSessionCreate, idempotency_key: IdempotencyKey = None
) -> ProviderSession:
    if body.project_id is not None:
        _require(STORE.projects, body.project_id, "project")
    now = _utcnow()
    session = ProviderSession(
        id=_new_id("sess"),
        label=body.label,
        base_url=body.base_url,
        models=body.models,
        capabilities=body.capabilities,
        project_id=body.project_id,
        created_at=now,
        expires_at=now + timedelta(seconds=body.ttl_seconds),
    )
    STORE.provider_sessions[session.id] = session
    # Lease: токен и рабочие лимиты хранятся отдельно от публичной
    # модели и никогда не возвращаются API.
    STORE.provider_secrets[session.id] = {
        "api_token": body.api_token,
        "timeout_seconds": body.timeout_seconds,
        "max_concurrency": body.max_concurrency,
    }
    return session


@app.post(f"{API_PREFIX}/provider-sessions/{{session_id}}/test", tags=["provider-sessions"])
async def test_provider_session(session_id: str) -> ProviderSessionTestResult:
    """Реальные minimal capability-пробы против endpoint'а сессии.

    Для каждой заявленной capability — один живой round-trip с кредами
    сессии (structured_output: json_schema-вызов; image_input: +1px PNG
    data URL; embeddings: один embed-вызов). ok — проба прошла, fail —
    endpoint/creды не ответили (detail = typed code, без секретов),
    skip — capability не заявлена клиентом либо непробиваема
    (tool_calls).
    """
    session = _require_session(session_id)
    caps = session.capabilities.model_dump()
    gateway = _session_gateway(session)
    results: list[CapabilityProbe] = []
    try:
        for name, declared in caps.items():
            if not declared:
                results.append(
                    CapabilityProbe(
                        capability=name,
                        status="skip",
                        detail="not declared by client",
                    )
                )
                continue
            try:
                if name == "structured_output":
                    await gateway.probe_structured_output()
                elif name == "image_input":
                    await gateway.probe_image_input()
                elif name == "embeddings":
                    await gateway.embed(["probe"])
                else:  # tool_calls — проба не реализована
                    results.append(
                        CapabilityProbe(
                            capability=name,
                            status="skip",
                            detail="no probe implemented",
                        )
                    )
                    continue
            except DeckDNAError as exc:
                results.append(
                    CapabilityProbe(
                        capability=name, status="fail", detail=exc.code
                    )
                )
                continue
            results.append(CapabilityProbe(capability=name, status="ok"))
    finally:
        close = getattr(gateway, "aclose", None)
        if close is not None:
            await close()
    return ProviderSessionTestResult(
        session_id=session.id, results=results, tested_at=_utcnow()
    )


@app.delete(
    f"{API_PREFIX}/provider-sessions/{{session_id}}",
    status_code=204,
    tags=["provider-sessions"],
)
async def delete_provider_session(session_id: str) -> Response:
    _require(STORE.provider_sessions, session_id, "provider session")
    del STORE.provider_sessions[session_id]
    # revoke lease: токен вытесняется вместе с сессией.
    STORE.provider_secrets.pop(session_id, None)
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# §3 Projects
# ---------------------------------------------------------------------------


@app.post(f"{API_PREFIX}/projects", status_code=201, tags=["projects"])
async def create_project(body: ProjectCreate, idempotency_key: IdempotencyKey = None) -> Project:
    now = _utcnow()
    project = Project(
        id=_new_id("prj"),
        name=body.name,
        status="draft",
        default_language=body.default_language,
        target_slide_count=body.target_slide_count,
        created_at=now,
        updated_at=now,
    )
    STORE.projects[project.id] = project
    return project


@app.get(f"{API_PREFIX}/projects", tags=["projects"])
async def list_projects(
    cursor: str | None = Query(default=None), limit: int = Query(default=50, ge=1, le=200)
) -> Page[Project]:
    items = sorted(STORE.projects.values(), key=lambda p: p.created_at)
    return Page[Project](items=items[:limit])


@app.get(f"{API_PREFIX}/projects/{{project_id}}", tags=["projects"])
async def get_project(project_id: str) -> Project:
    return _require(STORE.projects, project_id, "project")


@app.patch(f"{API_PREFIX}/projects/{{project_id}}", tags=["projects"])
async def patch_project(project_id: str, body: ProjectPatch) -> Project:
    project = _require(STORE.projects, project_id, "project")
    update = body.model_dump(exclude_none=True)
    updated = project.model_copy(update={**update, "updated_at": _utcnow()})
    STORE.projects[project_id] = updated
    return updated


@app.delete(f"{API_PREFIX}/projects/{{project_id}}", status_code=204, tags=["projects"])
async def delete_project(project_id: str) -> Response:
    _require(STORE.projects, project_id, "project")
    del STORE.projects[project_id]
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# §4 Templates (tool: inspect_template)
# ---------------------------------------------------------------------------

_TEMPLATE_MIME = {
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "potx": "application/vnd.openxmlformats-officedocument.presentationml.template",
}


@app.post(f"{API_PREFIX}/projects/{{project_id}}/templates", status_code=201, tags=["templates"])
async def upload_template(
    project_id: str,
    file: Annotated[UploadFile, File()],
    idempotency_key: IdempotencyKey = None,
) -> TemplateAsset:
    project = _require(STORE.projects, project_id, "project")
    filename = file.filename or "template.pptx"
    package_type = filename.rsplit(".", 1)[-1].lower()
    if package_type not in _TEMPLATE_MIME:
        raise DeckDNAError(
            "invalid_input",
            f"unsupported template type: {filename}; expected .pptx or .potx",
            http_status=415,
        )
    data = await file.read()
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise DeckDNAError(
            "invalid_input",
            f"upload exceeds {settings.max_upload_mb} MB limit",
            http_status=413,
        )
    artifact = _store_artifact(
        data,
        type="template.original",
        mime_type=_TEMPLATE_MIME[package_type],
        filename=filename,
        project_id=project_id,
    )
    template = TemplateAsset(
        id=_new_id("tpl"),
        project_id=project_id,
        filename=filename,
        media_type=artifact.mime_type,
        package_type=package_type,
        sha256=artifact.sha256,
        size_bytes=artifact.size_bytes,
        artifact_id=artifact.id,
        validation_status="valid",
        created_at=_utcnow(),
    )
    STORE.templates[template.id] = template
    STORE.projects[project_id] = project.model_copy(
        update={"template_id": template.id, "updated_at": _utcnow()}
    )
    return template


@app.post(f"{API_PREFIX}/templates/{{template_id}}/analyze", status_code=202, tags=["templates"])
async def analyze_template(
    template_id: str,
    body: TemplateAnalysisRequest,
    idempotency_key: IdempotencyKey = None,
) -> AnalysisAccepted:
    template = _require(STORE.templates, template_id, "template")
    if body.provider_session_id is not None:
        # autopsy детерминирован — сессия не используется; валидируем
        # lease (TTL + project scope) для консистентности контракта.
        _require_session(body.provider_session_id, template.project_id)
    artifact = _require(STORE.artifacts, template.artifact_id, "template package bytes")
    analysis_id = _new_id("ana")
    try:
        with tempfile.TemporaryDirectory(prefix="deckdna-autopsy-") as tmpdir:
            package_path = Path(tmpdir) / "template.package"
            package_path.write_bytes(artifact.data)
            forensics = autopsy.analyze_template(package_path)
        dna = _forensics_to_design_dna(forensics, artifact.data, template_id, analysis_id)
    except (zipfile.BadZipFile, KeyError, etree.XMLSyntaxError) as exc:
        raise DeckDNAError("package_corrupt", f"cannot parse OOXML package: {exc}") from exc
    inventory = forensics.to_dict()
    inventory["path"] = template.filename
    analysis = TemplateAnalysis(
        id=analysis_id,
        template_id=template_id,
        revision=1,
        status="completed",
        parser_version="autopsy-1",
        config_version=body.config_version,
        design_dna_revision=1,
        preview_artifact_ids=[],
        package_inventory=inventory,
        warnings=[],
        created_at=_utcnow(),
        finished_at=_utcnow(),
    )
    STORE.analyses[analysis.id] = analysis
    STORE.design_dna[template_id] = dna
    STORE.template_slides[template_id] = [
        SlidePreviewMeta(
            id=_new_id("tsl"),
            slide_index=e.slide_index,
            part=e.part,
        )
        for e in dna.exemplars
    ]
    job = _complete_job(
        JobKind.template_analysis,
        template.project_id,
        {"analysis_id": analysis.id, "design_dna_revision": "1"},
    )
    return AnalysisAccepted(job_id=job.id, analysis_id=analysis.id)


@app.get(f"{API_PREFIX}/templates/{{template_id}}", tags=["templates"])
async def get_template(template_id: str) -> TemplateDetail:
    template = _require(STORE.templates, template_id, "template")
    latest = next(
        (a for a in STORE.analyses.values() if a.template_id == template_id),
        None,
    )
    return TemplateDetail(**template.model_dump(), latest_analysis=latest)


@app.get(f"{API_PREFIX}/templates/{{template_id}}/design-dna", tags=["templates"])
async def get_design_dna(template_id: str) -> DesignDNA:
    _require(STORE.templates, template_id, "template")
    return _require(STORE.design_dna, template_id, "design DNA (run analyze first)")


@app.get(f"{API_PREFIX}/templates/{{template_id}}/slides", tags=["templates"])
async def list_template_slides(
    template_id: str,
    cursor: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
) -> Page[SlidePreviewMeta]:
    _require(STORE.templates, template_id, "template")
    items = STORE.template_slides.get(template_id, [])
    return Page[SlidePreviewMeta](items=items[:limit])


# ---------------------------------------------------------------------------
# §5 Content packs (tool: ingest_content)
# ---------------------------------------------------------------------------


@app.post(
    f"{API_PREFIX}/projects/{{project_id}}/content-packs",
    status_code=202,
    tags=["content-packs"],
)
async def upload_content_pack(
    project_id: str,
    files: Annotated[list[UploadFile], File()],
    brief: Annotated[str | None, Form(description="Optional JSON-encoded brief")] = None,
    idempotency_key: IdempotencyKey = None,
) -> ContentPackAccepted:
    project = _require(STORE.projects, project_id, "project")
    parsed_brief: dict[str, Any] = {}
    if brief:
        try:
            parsed_brief = json.loads(brief)
        except json.JSONDecodeError:
            raise DeckDNAError("invalid_input", "brief form field must be valid JSON") from None
    artifacts: list[_Artifact] = []
    for file in files:
        data = await file.read()
        artifacts.append(
            _store_artifact(
                data,
                type="content.original",
                mime_type=file.content_type or "application/octet-stream",
                filename=file.filename or "content.bin",
                project_id=project_id,
            )
        )

    # The pack is built from the first file whose suffix the ingestion
    # parsers dispatch (.json/.md/.markdown/.txt); the rest stay stored as
    # source artifacts. Putting the parsed artifact first keeps
    # _run_generation (source_ids[0]) parsing the same file this pack shows.
    chosen = next(
        (
            a
            for a in artifacts
            if Path(a.filename).suffix.lower() in _SUPPORTED_CONTENT_SUFFIXES
        ),
        None,
    )
    if chosen is None:
        raise DeckDNAError(
            "invalid_input",
            "no supported content file: expected one of "
            f"{sorted(_SUPPORTED_CONTENT_SUFFIXES)}",
        )
    with tempfile.TemporaryDirectory(prefix="deckdna-ingest-") as tmpdir:
        src_path = Path(tmpdir) / chosen.filename
        src_path.write_bytes(chosen.data)
        pack = parse_file(src_path, artifact_id=chosen.id)
    updates: dict[str, Any] = {}
    if parsed_brief.get("language"):
        updates["language"] = str(parsed_brief["language"])
    if parsed_brief.get("title_hint"):
        updates["title_hint"] = str(parsed_brief["title_hint"])
    if updates:
        pack = pack.model_copy(update=updates)
    STORE.pack_artifacts[pack.id] = [chosen.id] + [
        a.id for a in artifacts if a.id != chosen.id
    ]
    graph = build_evidence_graph(pack)
    STORE.content_packs[pack.id] = pack
    STORE.evidence_graphs[pack.id] = graph
    STORE.projects[project_id] = project.model_copy(
        update={"content_pack_id": pack.id, "updated_at": _utcnow()}
    )
    job = _complete_job(
        JobKind.content_ingestion,
        project_id,
        {"content_pack_id": pack.id, "evidence_graph_id": graph.id},
    )
    return ContentPackAccepted(content_pack=pack, job=job)


@app.get(f"{API_PREFIX}/content-packs/{{pack_id}}", tags=["content-packs"])
async def get_content_pack(pack_id: str) -> ContentPack:
    return _require(STORE.content_packs, pack_id, "content pack")


@app.get(f"{API_PREFIX}/content-packs/{{pack_id}}/evidence-graph", tags=["content-packs"])
async def get_evidence_graph(pack_id: str) -> EvidenceGraph:
    _require(STORE.content_packs, pack_id, "content pack")
    return _require(STORE.evidence_graphs, pack_id, "evidence graph")


# ---------------------------------------------------------------------------
# §6 Generations (tools: plan_deck + generate_deck)
# ---------------------------------------------------------------------------


def _contract_issue_to_runtime(issue: AuditIssue) -> _RuntimeAuditIssue:
    """Contract ``AuditIssue`` -> runtime ``audit.issues.AuditIssue``.

    Repair tooling (planner/apply) operates on the runtime shape: bbox as a
    plain dict, evidence as list[dict], severity/status as raw strings.
    """
    return _RuntimeAuditIssue(
        rule_code=issue.rule_code,
        severity=issue.severity.value,
        message=issue.message,
        audit_run_id=issue.audit_run_id,
        id=issue.id,
        deterministic=issue.deterministic,
        deck_revision=issue.deck_revision or 0,
        slide_id=issue.slide_id,
        slide_index=issue.slide_index,
        shape_ids=list(issue.shape_ids or []),
        bbox=issue.bbox.model_dump() if issue.bbox else None,
        measured_value=issue.measured_value,
        threshold=issue.threshold,
        evidence=[e.model_dump() for e in (issue.evidence or [])],
        confidence=issue.confidence if issue.confidence is not None else 1.0,
        status=issue.status.value,
        repairable=issue.repairable,
        proposed_actions=list(issue.proposed_actions or []),
        provenance=issue.provenance.model_dump() if issue.provenance else {},
    )


def _contract_issue(raw: dict) -> AuditIssue:
    # runtime-аудит (audit/contextual.py) пишет evidence kind "vlm_verdict";
    # в замороженной схеме санкционированное имя для вердикта модели —
    # "model_verdict" (переименование kind в схеме требует ADR). detail с
    # исходным check/confidence/rationale сохраняется нетронутым.
    for item in raw.get("evidence") or ():
        if item.get("kind") == "vlm_verdict":
            item["kind"] = "model_verdict"
    return AuditIssue.model_validate(raw)


def _issue_summaries(issues: list[AuditIssue]) -> tuple[IssueSummary, dict[str, int]]:
    by_severity = IssueSummary()
    by_type: dict[str, int] = {}
    for issue in issues:
        count = getattr(by_severity, issue.severity.value, 0)
        setattr(by_severity, issue.severity.value, count + 1)
        by_type[issue.rule_code] = by_type.get(issue.rule_code, 0) + 1
    return by_severity, by_type


def _run_generation(
    project: Project, body: GenerationCreate, parent_run_id: str | None
) -> tuple[_InternalRun, Job]:
    """Run the real deckdna.generation pipeline once per requested variant.

    Synchronous by Wave-1 strategy (single process, no queue). Each variant
    invokes ``generate()``: ingestion -> planning -> composing -> audit ->
    pdf render -> quality passport, and all produced artifacts land in the
    in-memory STORE like everything else.
    """
    template = STORE.templates[body.template_id]
    tpl_artifact = _require(STORE.artifacts, template.artifact_id, "template package bytes")
    source_ids = STORE.pack_artifacts.get(body.content_pack_id, [])
    if not source_ids:
        raise DeckDNAError(
            "invalid_input",
            f"content pack {body.content_pack_id} has no uploaded source file",
        )
    src_artifact = _require(STORE.artifacts, source_ids[0], "content source")

    run_id = _new_id("run")
    job_id = _new_id("job")
    now = _utcnow()
    variants: list[VariantSummary] = []
    strategies: dict[str, str] = {}
    revisions: dict[str, int] = {}
    variant_artifacts: dict[str, dict[str, str]] = {}
    variant_plans: dict[str, DeckPlan] = {}
    # provider_session_id подразумевает LLM-путь (gateway по
    # кредам сессии); иначе use_llm → build_gateway() по env.
    gateway = _gateway_for(body)
    try:
        with tempfile.TemporaryDirectory(prefix="deckdna-gen-") as tmpdir:
            tmp = Path(tmpdir)
            tpl_path = tmp / tpl_artifact.filename
            tpl_path.write_bytes(tpl_artifact.data)
            src_path = tmp / src_artifact.filename
            src_path.write_bytes(src_artifact.data)
            pack = parse_file(src_path)
            plans: dict[Strategy, DeckPlan] = {}

            def _plan_for(strategy: Strategy) -> DeckPlan:
                # План на стратегию вычисляется ОДИН раз и прокидывается
                # в generate(deck_plan=...) — записанный DeckPlan тот
                # самый, по которому собрана колода (иначе LLM-
                # планировщик вызывался бы дважды и план записи мог
                # расходиться с итоговой колодой).
                if strategy not in plans:
                    if gateway is None:
                        plans[strategy] = plan_deck(
                            pack, body.brief, strategy=strategy
                        )
                    else:
                        plans[strategy] = asyncio.run(
                            plan_deck_llm(
                                pack, body.brief, gateway, strategy=strategy
                            )
                        )
                return plans[strategy]

            for variant_req in body.variants:
                strategy = Strategy(variant_req.strategy)
                plan = _plan_for(strategy)
                out_dir = tmp / variant_req.strategy
                report = pipeline.generate(
                    tpl_path,
                    src_path,
                    body.brief,
                    out_dir,
                    gateway=gateway,
                    strategy=strategy,
                    deck_plan=plan,
                )

                variant_id = _new_id("var")
                deck_art = _store_artifact(
                    (out_dir / "deck.pptx").read_bytes(),
                    type="deck.pptx.revision",
                    mime_type=_PPTX_MIME,
                    filename=f"deck_{variant_req.strategy}.pptx",
                    project_id=project.id,
                )
                pdf_art = _store_artifact(
                    (out_dir / "deck.pdf").read_bytes(),
                    type="export.pdf",
                    mime_type="application/pdf",
                    filename=f"{variant_req.strategy}.pdf",
                    project_id=project.id,
                )
                passport_art = _store_artifact(
                    (out_dir / "quality-passport.json").read_bytes(),
                    type="quality.passport.json",
                    mime_type="application/json",
                    filename=f"{variant_req.strategy}_quality_passport.json",
                    project_id=project.id,
                )
                variant_artifacts[variant_id] = {
                    "pptx": deck_art.id,
                    "pdf": pdf_art.id,
                    "quality_passport": passport_art.id,
                }

                issues = [_contract_issue(i) for i in report["audit_issues"]]
                by_severity, by_type = _issue_summaries(issues)
                # keep the pipeline's own audit_run_id so issues trace back
                audit_id = issues[0].audit_run_id if issues else _new_id("audit")
                STORE.audits[audit_id] = AuditRun(
                    id=audit_id,
                    variant_id=variant_id,
                    deck_revision=1,
                    status="completed",
                    deterministic_status="completed",
                    contextual_status=(
                        "completed"
                        if report["contextual_audit"]["ran"]
                        else "skipped"
                    ),
                    issue_count=len(issues),
                    summary_by_severity=by_severity,
                    summary_by_type=by_type,
                    created_at=now,
                    finished_at=_utcnow(),
                )
                STORE.issues[audit_id] = issues

                export = ExportRecord(
                    id=_new_id("exp"),
                    variant_id=variant_id,
                    deck_revision=1,
                    job_id=job_id,
                    artifacts=[
                        ExportArtifact(
                            format=fmt,
                            artifact_id=art_id,
                            sha256=STORE.artifacts[art_id].sha256,
                            size_bytes=STORE.artifacts[art_id].size_bytes,
                            mime_type=STORE.artifacts[art_id].mime_type,
                            download_url=f"{API_PREFIX}/artifacts/{art_id}/download",
                        )
                        for fmt, art_id in (
                            ("pdf", pdf_art.id),
                            ("quality_passport", passport_art.id),
                        )
                    ],
                    created_at=now,
                )
                STORE.exports[export.id] = export

                qp_metrics = report["quality_passport"]["metrics"]
                variants.append(
                    VariantSummary(
                        id=variant_id,
                        run_id=run_id,
                        strategy=variant_req.strategy,
                        status=JobState.completed,
                        deck_artifact_id=deck_art.id,
                        planner=report["planner"],
                        deck_plan_id=plan.id,
                        contextual_issues=(
                            report["contextual_audit"]["issues"]
                            if report["contextual_audit"]["ran"]
                            else None
                        ),
                        metrics=VariantMetrics(
                            validity=(
                                1.0 if qp_metrics["validity"].get("opens_cleanly") else 0.0
                            ),
                            editability_pei=qp_metrics["editability"].get("pei_level"),
                            issues_total=len(issues),
                        ),
                        audit_status="completed",
                        export_ids=[export.id],
                    )
                )
                STORE.slides[variant_id] = [
                    SlideInfo(
                        id=_new_id("sld"),
                        variant_id=variant_id,
                        index=slide.index,
                        slide_plan_id=slide.id,
                        purpose=slide.purpose.value,
                        title=slide.title_intent,
                    )
                    for slide in plan.slides
                ]
                strategies[variant_id] = variant_req.strategy
                revisions[variant_id] = 1
                variant_plans[variant_id] = plan
    except DeckDNAError as exc:
        job = Job(
            id=job_id,
            kind=JobKind.generation,
            state=JobState.failed,
            progress=0.0,
            project_id=project.id,
            created_at=now,
            started_at=now,
            finished_at=_utcnow(),
            error=JobError(code=exc.code, message=exc.message, stage=exc.stage),
        )
        STORE.jobs[job.id] = job
        STORE.runs[run_id] = _InternalRun(
            detail=GenerationDetail(
                id=run_id,
                project_id=project.id,
                state=JobState.failed,
                job_id=job.id,
                events_url=f"{API_PREFIX}/jobs/{job.id}/events",
                template_id=body.template_id,
                content_pack_id=body.content_pack_id,
                variants=[],
                parent_run_id=parent_run_id,
                created_at=now,
                finished_at=_utcnow(),
            ),
            request=body,
        )
        exc.details["generation_id"] = run_id
        raise
    finally:
        # HTTP-клиент gateway закрывается на любом исходе — иначе
        # AsyncClient провайдера утекает вместе с коннекшен-пулом.
        close = getattr(gateway, "aclose", None)
        if close is not None:
            asyncio.run(close())

    # Записанный план — план первого варианта (при разных стратегиях
    # планы вариантов различаются; свой deck_plan_id есть у каждого
    # VariantSummary).
    recorded_plan = plans[Strategy(body.variants[0].strategy)]
    job = Job(
        id=job_id,
        kind=JobKind.generation,
        state=JobState.completed,
        progress=1.0,
        project_id=project.id,
        created_at=now,
        started_at=now,
        finished_at=_utcnow(),
        result_ids={"deck_plan_id": recorded_plan.id},
    )
    STORE.jobs[job.id] = job
    run = _InternalRun(
        detail=GenerationDetail(
            id=run_id,
            project_id=project.id,
            state=JobState.completed,
            job_id=job.id,
            events_url=f"{API_PREFIX}/jobs/{job.id}/events",
            template_id=body.template_id,
            content_pack_id=body.content_pack_id,
            deck_plan_id=recorded_plan.id,
            deck_plan=recorded_plan,
            variants=variants,
            parent_run_id=parent_run_id,
            created_at=now,
            finished_at=job.finished_at,
        ),
        variant_strategy=strategies,
        deck_revision=revisions,
        request=body,
        variant_artifacts=variant_artifacts,
        variant_plans=variant_plans,
    )
    STORE.runs[run_id] = run
    return run, job


@app.post(
    f"{API_PREFIX}/projects/{{project_id}}/generations",
    status_code=202,
    tags=["generations"],
)
async def create_generation(
    project_id: str,
    body: GenerationCreate,
    idempotency_key: IdempotencyKey = None,
) -> GenerationAccepted:
    project = _require(STORE.projects, project_id, "project")
    _require(STORE.templates, body.template_id, "template")
    _require(STORE.content_packs, body.content_pack_id, "content pack")
    if body.provider_session_id is not None:
        _require_session(body.provider_session_id, project_id)
    # threadpool: в LLM-режиме generate() внутри зовёт asyncio.run —
    # в потоке event loop'а это RuntimeError; заодно детерминированный
    # путь перестаёт блокировать loop на десятки секунд.
    run, job = await run_in_threadpool(_run_generation, project, body, parent_run_id=None)
    return GenerationAccepted(
        generation_id=run.detail.id,
        job_id=job.id,
        variant_ids=[v.id for v in run.detail.variants],
    )


@app.get(f"{API_PREFIX}/generations/{{run_id}}", tags=["generations"])
async def get_generation(run_id: str) -> GenerationDetail:
    return _require(STORE.runs, run_id, "generation run").detail


@app.post(f"{API_PREFIX}/generations/{{run_id}}/cancel", tags=["generations"])
async def cancel_generation(run_id: str) -> Job:
    run = _require(STORE.runs, run_id, "generation run")
    job = _require(STORE.jobs, run.detail.job_id, "job")
    now = _utcnow()
    canceled_job = job.model_copy(update={"state": JobState.canceled, "finished_at": now})
    run.detail = run.detail.model_copy(
        update={"state": JobState.canceled, "finished_at": now}
    )
    STORE.jobs[job.id] = canceled_job
    return canceled_job


@app.post(f"{API_PREFIX}/generations/{{run_id}}/retry", status_code=202, tags=["generations"])
async def retry_generation(
    run_id: str, idempotency_key: IdempotencyKey = None
) -> GenerationAccepted:
    parent_run = _require(STORE.runs, run_id, "generation run")
    parent = parent_run.detail
    project = _require(STORE.projects, parent.project_id, "project")
    if parent_run.request is not None:
        body = parent_run.request
    elif parent.deck_plan is not None:
        body = GenerationCreate(
            template_id=parent.template_id,
            content_pack_id=parent.content_pack_id,
            brief=parent.deck_plan.brief,
            variants=[VariantRequest(strategy=s.strategy) for s in parent.variants],
        )
    else:
        raise DeckDNAError("internal_error", "generation run has no recorded request")
    run, job = await run_in_threadpool(_run_generation, project, body, parent_run_id=run_id)
    return GenerationAccepted(
        generation_id=run.detail.id,
        job_id=job.id,
        variant_ids=[v.id for v in run.detail.variants],
    )


# ---------------------------------------------------------------------------
# §7 Jobs and events
# ---------------------------------------------------------------------------


@app.get(f"{API_PREFIX}/jobs/{{job_id}}", tags=["jobs"])
async def get_job(job_id: str) -> Job:
    return _require(STORE.jobs, job_id, "job")


@app.get(f"{API_PREFIX}/jobs/{{job_id}}/events", tags=["jobs"])
async def job_events(job_id: str, after: int = Query(default=0, ge=0)) -> EventSourceResponse:
    job = _require(STORE.jobs, job_id, "job")

    async def stream() -> AsyncIterator[dict[str, str]]:
        events = [
            ("job.state_changed", {"state": "running"}),
            ("stage.started", {"stage": job.kind.value}),
            ("stage.completed", {"stage": job.kind.value}),
            ("job.completed" if job.state == JobState.completed else "job.state_changed",
             {"state": job.state.value}),
        ]
        for seq, (event_type, data) in enumerate(events, start=1):
            if seq <= after:
                continue
            yield {
                "id": str(seq),
                "event": event_type,
                "data": json.dumps(
                    {
                        "sequence": seq,
                        "timestamp": job.created_at.isoformat(),
                        "job_id": job.id,
                        "stage": job.kind.value,
                        "progress": job.progress,
                        **data,
                    }
                ),
            }

    return EventSourceResponse(stream())


# ---------------------------------------------------------------------------
# §8 Variants and slides
# ---------------------------------------------------------------------------


def _variant_or_404(variant_id: str) -> tuple[_InternalRun, VariantSummary]:
    for run in STORE.runs.values():
        for variant in run.detail.variants:
            if variant.id == variant_id:
                return run, variant
    raise DeckDNAError("not_found", f"variant not found: {variant_id}")


@app.get(f"{API_PREFIX}/generations/{{run_id}}/variants", tags=["variants"])
async def list_variants(run_id: str) -> Page[VariantSummary]:
    run = _require(STORE.runs, run_id, "generation run")
    return Page[VariantSummary](items=run.detail.variants)


@app.get(f"{API_PREFIX}/variants/{{variant_id}}", tags=["variants"])
async def get_variant(variant_id: str) -> VariantSummary:
    _, variant = _variant_or_404(variant_id)
    return variant


@app.get(f"{API_PREFIX}/variants/{{variant_id}}/slides", tags=["variants"])
async def list_variant_slides(
    variant_id: str,
    cursor: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
) -> Page[SlideInfo]:
    _variant_or_404(variant_id)
    return Page[SlideInfo](items=STORE.slides.get(variant_id, [])[:limit])


def _slide_or_404(slide_id: str) -> SlideInfo:
    for slides in STORE.slides.values():
        for slide in slides:
            if slide.id == slide_id:
                return slide
    raise DeckDNAError("not_found", f"slide not found: {slide_id}")


@app.get(f"{API_PREFIX}/slides/{{slide_id}}", tags=["variants"])
async def get_slide(slide_id: str) -> SlideInfo:
    return _slide_or_404(slide_id)


@app.get(f"{API_PREFIX}/slides/{{slide_id}}/preview", tags=["variants"])
async def get_slide_preview(slide_id: str) -> Response:
    slide = _slide_or_404(slide_id)
    artifact = _require(STORE.artifacts, slide.preview_artifact_id or "", "slide preview")
    return Response(
        content=artifact.data,
        media_type=artifact.mime_type,
        headers={"Content-Disposition": f'inline; filename="{artifact.filename}"'},
    )


# ---------------------------------------------------------------------------
# §9 Audit (tool: audit_deck) and repair (tool: repair_deck)
# ---------------------------------------------------------------------------


async def _contextual_audit_issues(
    audit: AuditRun,
    run: _InternalRun,
    variant: VariantSummary,
    session: ProviderSession,
) -> list[AuditIssue]:
    """Реальный contextual-прогон по lease-сессии.

    Возвращает contract-issues (runtime → ``to_dict`` → ``_contract_issue``:
    на границе ремапится ``vlm_verdict`` → ``model_verdict``). При отказе
    провайдера статус аудита — ``failed`` и список пуст.
    """
    try:
        deck_artifact = _require(
            STORE.artifacts, variant.deck_artifact_id, "variant deck bytes"
        )
        with tempfile.TemporaryDirectory(prefix="deckdna-ctx-audit-") as tmpdir:
            deck_path = Path(tmpdir) / deck_artifact.filename
            deck_path.write_bytes(deck_artifact.data)
            gateway = _session_gateway(session)
            # план именно этого варианта — run.detail.deck_plan держит
            # только план ПЕРВОГО варианта; на multi-variant run'е
            # чужой план граундил бы VLM-checks неверно
            plan = run.variant_plans.get(variant.id) or run.detail.deck_plan
            try:
                ctx_issues = await run_contextual_audit(
                    deck_path,
                    gateway,
                    deck_plan=plan,
                    deck_language=plan.language if plan else "ru",
                    audit_run_id=audit.id,
                )
            finally:
                await gateway.aclose()
        audit.contextual_status = "completed"
        return [_contract_issue(i.to_dict()) for i in ctx_issues]
    except DeckDNAError:
        audit.contextual_status = "failed"
        return []


@app.post(f"{API_PREFIX}/variants/{{variant_id}}/audits", status_code=202, tags=["audit"])
async def create_audit(
    variant_id: str,
    body: AuditRequest,
    idempotency_key: IdempotencyKey = None,
) -> AuditAccepted:
    run, variant = _variant_or_404(variant_id)
    session = (
        _require_session(body.provider_session_id, run.detail.project_id)
        if body.provider_session_id is not None
        else None
    )
    existing = next((a for a in STORE.audits.values() if a.variant_id == variant_id), None)
    if existing is not None:
        # the generation pipeline already ran deterministic audit — serve it;
        # но явно переданная живая сессия выполняет upgrade: VLM-прогон
        # поверх существующего audit run, детерминированные issues
        # сохраняются (completed → чистая идемпотентность, повтор не
        # дублирует вызовы; failed → честный повтор попытки).
        if session is not None and existing.contextual_status != "completed":
            ctx_issues = await _contextual_audit_issues(
                existing, run, variant, session
            )
            issues = [
                i for i in STORE.issues.get(existing.id, []) if i.deterministic
            ] + ctx_issues
            STORE.issues[existing.id] = issues
            existing.issue_count = len(issues)
            existing.summary_by_severity, existing.summary_by_type = (
                _issue_summaries(issues)
            )
            existing.finished_at = _utcnow()
            idx = run.detail.variants.index(variant)
            run.detail.variants[idx] = variant.model_copy(
                update={
                    "metrics": variant.metrics.model_copy(
                        update={"issues_total": len(issues)}
                    )
                }
            )
        job = _complete_job(JobKind.audit, run.detail.project_id, {"audit_id": existing.id})
        return AuditAccepted(audit_id=existing.id, job_id=job.id)
    audit = AuditRun(
        id=_new_id("audit"),
        variant_id=variant_id,
        deck_revision=run.deck_revision.get(variant_id, 1),
        status="completed",
        deterministic_status="completed",
        contextual_status="pending" if session else "skipped",
        issue_count=0,
        summary_by_severity=IssueSummary(),
        summary_by_type={},
        config_version=body.config_version,
        created_at=_utcnow(),
        finished_at=_utcnow(),
    )
    slide_ids = [s.id for s in STORE.slides.get(variant_id, [])]
    issues = _stub_audit_issues(audit.id, slide_ids)
    if session is not None:
        issues = [
            *issues,
            *await _contextual_audit_issues(audit, run, variant, session),
        ]
    STORE.issues[audit.id] = issues
    by_severity, by_type = _issue_summaries(issues)
    audit.issue_count = len(issues)
    audit.summary_by_severity = by_severity
    audit.summary_by_type = by_type
    STORE.audits[audit.id] = audit
    idx = run.detail.variants.index(variant)
    run.detail.variants[idx] = variant.model_copy(
        update={
            "audit_status": "completed",
            "metrics": VariantMetrics(
                validity=1.0, editability_pei=4, issues_total=len(issues)
            ),
        }
    )
    job = _complete_job(JobKind.audit, run.detail.project_id, {"audit_id": audit.id})
    return AuditAccepted(audit_id=audit.id, job_id=job.id)


@app.get(f"{API_PREFIX}/audits/{{audit_id}}", tags=["audit"])
async def get_audit(audit_id: str) -> AuditRun:
    return _require(STORE.audits, audit_id, "audit run")


@app.get(f"{API_PREFIX}/audits/{{audit_id}}/issues", tags=["audit"])
async def list_audit_issues(
    audit_id: str,
    slide_id: str | None = Query(default=None),
    rule_code: str | None = Query(default=None),
    severity: str | None = Query(default=None),
    deterministic: bool | None = Query(default=None),
    status: str | None = Query(default=None),
    repairable: bool | None = Query(default=None),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
) -> Page[AuditIssue]:
    _require(STORE.audits, audit_id, "audit run")
    issues = STORE.issues.get(audit_id, [])
    if slide_id is not None:
        issues = [i for i in issues if i.slide_id == slide_id]
    if rule_code is not None:
        issues = [i for i in issues if i.rule_code == rule_code]
    if severity is not None:
        issues = [i for i in issues if i.severity.value == severity]
    if deterministic is not None:
        issues = [i for i in issues if i.deterministic == deterministic]
    if status is not None:
        issues = [i for i in issues if i.status.value == status]
    if repairable is not None:
        issues = [i for i in issues if i.repairable == repairable]
    return Page[AuditIssue](items=issues[:limit])


@app.post(f"{API_PREFIX}/audits/{{audit_id}}/repairs", status_code=202, tags=["audit"])
async def create_repair(
    audit_id: str,
    body: RepairRequest,
    idempotency_key: IdempotencyKey = None,
) -> RepairAccepted:
    audit = _require(STORE.audits, audit_id, "audit run")
    run, variant = _variant_or_404(audit.variant_id)
    if body.provider_session_id is not None:
        # repair детерминирован — сессия не используется; lease
        # валидируется для консистентности контракта.
        _require_session(body.provider_session_id, run.detail.project_id)
    variant_id = audit.variant_id
    issues = STORE.issues.get(audit_id, [])
    by_id = {i.id: i for i in issues}
    missing = [i for i in body.selected_issue_ids if i not in by_id]
    if missing:
        raise DeckDNAError(
            "invalid_input", f"unknown issue ids for this audit: {missing}"
        )
    selected = [by_id[i] for i in body.selected_issue_ids]

    deck_artifact = _require(
        STORE.artifacts, variant.deck_artifact_id, "variant deck bytes"
    )
    new_revision = run.deck_revision.get(variant_id, 1) + 1

    with tempfile.TemporaryDirectory(prefix="deckdna-repair-") as tmpdir:
        tmp = Path(tmpdir)
        in_pptx = tmp / deck_artifact.filename
        in_pptx.write_bytes(deck_artifact.data)
        out_pptx = tmp / f"repaired_rev{new_revision}.pptx"

        plan = plan_repairs_with_report(
            [_contract_issue_to_runtime(i) for i in selected]
        )
        apply_report = apply_repairs(in_pptx, plan.actions, out_pptx)

        new_artifact = _store_artifact(
            out_pptx.read_bytes(),
            type="deck.pptx.revision",
            mime_type=_PPTX_MIME,
            filename=f"{variant.strategy}_rev{new_revision}.pptx",
            project_id=run.detail.project_id,
        )

        # Re-audit the repaired deck: issues that were actually fixed
        # disappear from the list; ones the executor skipped/failed on stay
        # open under their fresh audit ids — nothing is marked "fixed" by hand.
        fresh = [
            AuditIssue.model_validate(i.to_dict())
            for i in audit_deck(
                out_pptx, deck_revision=new_revision, audit_run_id=audit_id
            )
        ]

    STORE.issues[audit_id] = fresh
    by_severity, by_type = _issue_summaries(fresh)
    audit.deck_revision = new_revision
    audit.issue_count = len(fresh)
    audit.summary_by_severity = by_severity
    audit.summary_by_type = by_type
    audit.finished_at = _utcnow()

    run.deck_revision[variant_id] = new_revision
    # The repaired deck replaces the variant's current pptx. The pdf and
    # quality passport produced for the older revision no longer reflect it,
    # so their export pointers are dropped rather than served silently.
    run.variant_artifacts[variant_id] = {"pptx": new_artifact.id}
    update: dict[str, Any] = {"deck_artifact_id": new_artifact.id}
    if variant.metrics is not None:
        update["metrics"] = variant.metrics.model_copy(
            update={"issues_total": len(fresh)}
        )
    idx = next(i for i, v in enumerate(run.detail.variants) if v.id == variant_id)
    run.detail.variants[idx] = variant.model_copy(update=update)

    job = _complete_job(
        JobKind.repair,
        run.detail.project_id,
        {
            "audit_id": audit_id,
            "deck_revision": str(new_revision),
            "deck_artifact_id": new_artifact.id,
            "applied": str(apply_report.applied),
            "skipped": str(apply_report.skipped),
            "failed": str(apply_report.failed),
            "not_implemented": str(apply_report.not_implemented),
            "unresolved": str(len(plan.unresolved)),
        },
    )
    return RepairAccepted(job_id=job.id, audit_id=audit_id, deck_revision=new_revision)


@app.post(f"{API_PREFIX}/issues/{{issue_id}}/dismiss", tags=["audit"])
async def dismiss_issue(issue_id: str, body: IssueDismissRequest) -> AuditIssue:
    for issues in STORE.issues.values():
        for issue in issues:
            if issue.id == issue_id:
                updated = issue.model_copy(update={"status": "dismissed"})
                issues[issues.index(issue)] = updated
                return updated
    raise DeckDNAError("not_found", f"issue not found: {issue_id}")


# ---------------------------------------------------------------------------
# §10 Exports (tool: export_deck)
# ---------------------------------------------------------------------------


@app.post(f"{API_PREFIX}/variants/{{variant_id}}/exports", status_code=202, tags=["exports"])
async def create_export(
    variant_id: str,
    body: ExportRequest,
    idempotency_key: IdempotencyKey = None,
) -> ExportAccepted:
    run, variant = _variant_or_404(variant_id)
    revision = run.deck_revision.get(variant_id, 1)
    available = run.variant_artifacts.get(variant_id, {})
    artifacts: list[ExportArtifact] = []
    for fmt in body.formats:
        artifact_id = available.get(fmt)
        if artifact_id is None:
            raise DeckDNAError(
                "not_implemented",
                f"export format {fmt} is not produced by the pipeline for this variant",
            )
        stored = _require(STORE.artifacts, artifact_id, "artifact")
        artifacts.append(
            ExportArtifact(
                format=fmt,
                artifact_id=stored.id,
                sha256=stored.sha256,
                size_bytes=stored.size_bytes,
                mime_type=stored.mime_type,
                download_url=f"{API_PREFIX}/artifacts/{stored.id}/download",
            )
        )
    job = _complete_job(JobKind.export, run.detail.project_id, {})
    export = ExportRecord(
        id=_new_id("exp"),
        variant_id=variant_id,
        deck_revision=revision,
        job_id=job.id,
        artifacts=artifacts,
        created_at=_utcnow(),
    )
    STORE.exports[export.id] = export
    idx = run.detail.variants.index(variant)
    run.detail.variants[idx] = variant.model_copy(
        update={"export_ids": [*variant.export_ids, export.id]}
    )
    return ExportAccepted(export_id=export.id, job_id=job.id)


@app.get(f"{API_PREFIX}/exports/{{export_id}}", tags=["exports"])
async def get_export(export_id: str) -> ExportRecord:
    return _require(STORE.exports, export_id, "export")


@app.get(f"{API_PREFIX}/artifacts/{{artifact_id}}/download", tags=["exports"])
async def download_artifact(artifact_id: str) -> Response:
    artifact = _require(STORE.artifacts, artifact_id, "artifact")
    safe_name = artifact.filename.replace('"', "").replace("/", "_")
    return Response(
        content=artifact.data,
        media_type=artifact.mime_type,
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
    )


# ---------------------------------------------------------------------------
# §11 Health and capabilities
# ---------------------------------------------------------------------------


@app.get(f"{API_PREFIX}/health/live")
async def live() -> dict[str, str]:
    return {"status": "ok"}


@app.get(f"{API_PREFIX}/health/ready")
async def ready() -> dict[str, str]:
    # Wave 1: check DB/Redis/artifact dir. Wave 0 reports process readiness.
    return {"status": "ok"}


@app.get(f"{API_PREFIX}/version")
async def version() -> dict[str, str]:
    out = {
        "version": app.version,
        "schema_version": SCHEMA_VERSION,
        "official_mode": str(settings.official_mode).lower(),
    }
    try:
        out["skill_version"] = str(_read_skill_manifest().get("version", ""))
    except DeckDNAError:
        out["skill_version"] = "unknown"
    return out


def _read_skill_manifest() -> dict[str, Any]:
    """skill/manifest.yaml parsed to a dict; typed errors, never a bare 500."""
    path = _REPO_ROOT / "skill" / "manifest.yaml"
    if not path.is_file():
        raise DeckDNAError(
            "not_found", f"skill manifest not found at {path}"
        )
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        raise DeckDNAError(
            "internal_error", f"skill manifest is not valid YAML: {exc}"
        ) from exc
    if not isinstance(data, dict):
        raise DeckDNAError(
            "internal_error", "skill manifest is not a YAML mapping"
        )
    return data


@app.get(f"{API_PREFIX}/skill/manifest", tags=["skill"])
async def skill_manifest() -> dict[str, Any]:
    """The skill's manifest.yaml parsed to JSON (OR-006: versioned skill
    identity — name, version, inputs/outputs, tools)."""
    return _read_skill_manifest()


@app.get(f"{API_PREFIX}/capabilities")
async def capabilities() -> dict[str, object]:
    # Aggregated by stage registry once Agents 2/3 register implementations.
    try:
        manifest = _read_skill_manifest()
        skill = {
            "name": str(manifest.get("id", "deckdna")),
            "version": str(manifest.get("version", "")),
        }
    except DeckDNAError:
        skill = {"name": "deckdna", "version": "unknown"}
    # Only real capabilities: parsers resolve to content_parsers._PARSERS
    # suffixes, exporters to formats the pipeline actually produces,
    # audit_rules to the RULE_* ids emitted by audit_deck.
    return {
        "parsers": sorted(
            suffix.lstrip(".") for suffix in content_parsers._PARSERS
        ),
        "exporters": ["pdf", "pptx", "quality_passport"],
        "audit_rules": sorted(
            value
            for name, value in vars(_audit_basic).items()
            if name.startswith("RULE_")
        ),
        "schemas": {"version": SCHEMA_VERSION},
        "skill": skill,
    }
