"""The legal documents Prelegal can draft, read from templates/documents.json.

The spec lists each document's cover page fields. Everything document-specific is
derived from it: the field data the API accepts, the schema the model fills in,
validation, the required and optional lists, and carrying values over when the
user switches to another document. frontend/src/lib/documents.ts reads the same file.
"""

from datetime import date
from functools import cache
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, create_model, model_validator
from pydantic.alias_generators import to_camel

from app.config import REPO_ROOT

SPEC_PATH = REPO_ROOT / "templates" / "documents.json"
MAX_VALUE_LENGTH = 4000

FieldType = Literal["text", "longtext", "date", "enum", "int"]


class CamelModel(BaseModel):
    """snake_case in Python, camelCase in JSON (as in the spec and the frontend)."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


# ---------------------------------------------------------------------------
# The spec


class Option(CamelModel):
    value: str
    label: str


class Condition(CamelModel):
    field: str
    equals: str


class FieldSpec(CamelModel):
    model_config = ConfigDict(extra="forbid")

    key: str
    label: str
    type: FieldType
    required: bool = False
    description: str
    default: str | int | None = None  # "today" for a date field means the current date
    placeholder: str | None = None
    terms: list[str] | None = None  # the template terms this field defines; defaults to [label]
    options: list[Option] | None = None
    min: int | None = None
    max: int | None = None
    unit: str | None = None  # shown after a number input, e.g. "year(s)"
    enabled_when: Condition | None = None

    @model_validator(mode="after")
    def _check_type_settings(self) -> "FieldSpec":
        if (self.min is None or self.max is None) == (self.type == "int"):
            raise ValueError(f"{self.key}: min and max are for (and required by) int fields")
        if (self.options is None) == (self.type == "enum"):
            raise ValueError(f"{self.key}: options are for (and required by) enum fields")
        return self

    @property
    def defined_terms(self) -> list[str]:
        return [self.label] if self.terms is None else self.terms


class Section(CamelModel):
    title: str
    fields: list[FieldSpec]


class DocumentSpec(CamelModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    filename: str
    description: str
    cover_title: str
    version: str | None = None
    url: str | None = None
    parties: tuple[str, str]
    sections: list[Section]

    @property
    def fields(self) -> list[FieldSpec]:
        return [field for section in self.sections for field in section.fields]

    @model_validator(mode="after")
    def _check_fields(self) -> "DocumentSpec":
        keys = [field.key for field in self.fields]
        if len(keys) != len(set(keys)) or {"party1", "party2"} & set(keys):
            raise ValueError(f"{self.id}: field keys must be unique and not party1 or party2")
        for section in self.sections:
            enums = {field.key for field in section.fields if field.type == "enum"}
            for field in section.fields:
                # The form shows a conditional number inside the choice it depends on.
                if field.enabled_when and (field.type != "int" or field.enabled_when.field not in enums):
                    raise ValueError(f"{self.id}.{field.key}: enabledWhen is for an int field and an enum in its section")
        return self


class Spec(BaseModel):
    documents: list[DocumentSpec]


def load_documents() -> dict[str, DocumentSpec]:
    spec = Spec.model_validate_json(SPEC_PATH.read_text())
    return {document.id: document for document in spec.documents}


DOCUMENTS = load_documents()
DocumentId = Literal[tuple(DOCUMENTS)]


# ---------------------------------------------------------------------------
# A document's field data: the cover page values (by spec key) and the two parties


class Party(CamelModel):
    name: str = Field(default="", max_length=MAX_VALUE_LENGTH)
    title: str = Field(default="", max_length=MAX_VALUE_LENGTH)
    company: str = Field(default="", max_length=MAX_VALUE_LENGTH)
    notice_address: str = Field(default="", max_length=MAX_VALUE_LENGTH)


class DocumentData(CamelModel):
    values: dict[str, str | int]
    parties: tuple[Party, Party]


def _default(field: FieldSpec, today: date) -> str | int:
    return today.isoformat() if field.default == "today" else ("" if field.default is None else field.default)


def default_data(spec: DocumentSpec, today: date) -> DocumentData:
    return DocumentData(values={field.key: _default(field, today) for field in spec.fields}, parties=(Party(), Party()))


def _valid_date(value: object) -> bool:
    try:
        return isinstance(value, str) and len(value) == 10 and bool(date.fromisoformat(value))
    except ValueError:
        return False


def _check_value(field: FieldSpec, value: object) -> str | None:
    """Why the value isn't valid for the field, or None if it is."""
    if field.type == "int":
        if not isinstance(value, int) or not field.min <= value <= field.max:
            return f"{field.label} must be a whole number from {field.min} to {field.max}."
    elif not isinstance(value, str):
        return f"{field.label} must be text."
    elif field.type == "enum" and value not in (choices := [option.value for option in field.options or []]):
        return f"{field.label} must be one of: {', '.join(choices)}."
    elif field.type == "date" and value and not _valid_date(value):
        return f"{field.label} must be a date (YYYY-MM-DD)."
    elif len(value) > MAX_VALUE_LENGTH:
        return f"{field.label} must be at most {MAX_VALUE_LENGTH} characters."
    return None


def validate_data(spec: DocumentSpec, data: DocumentData | None, today: date) -> DocumentData:
    """The client's field data checked against the spec; missing values get their defaults.

    Raises ValueError with a message for the user if a value is unknown or invalid.
    """
    if data is None:
        return default_data(spec, today)
    fields = {field.key: field for field in spec.fields}
    if unknown := sorted(set(data.values) - set(fields)):
        raise ValueError(f"Unknown field for the {spec.name}: {unknown[0]}.")
    for key, value in data.values.items():
        if problem := _check_value(fields[key], value):
            raise ValueError(problem)
    defaults = default_data(spec, today).values
    return DocumentData(values={**defaults, **data.values}, parties=data.parties)


def _is_blank(value: str | int) -> bool:
    return isinstance(value, str) and not value.strip()


def missing_required_fields(spec: DocumentSpec, data: DocumentData) -> list[str]:
    """The fields that must be filled in before the document can be downloaded (as in documents.ts)."""
    missing = [field.label for field in spec.fields if field.required and _is_blank(data.values[field.key])]
    missing += [f"{role} company" for role, party in zip(spec.parties, data.parties) if not party.company.strip()]
    return missing


def empty_optional_fields(spec: DocumentSpec, data: DocumentData) -> list[str]:
    empty = [field.label for field in spec.fields if not field.required and _is_blank(data.values[field.key])]
    for role, party in zip(spec.parties, data.parties):
        empty += [
            f"{role} {label}"
            for label, value in (("signatory name", party.name), ("signatory title", party.title), ("notice address", party.notice_address))
            if not value.strip()
        ]
    return empty


def carry_over(old: DocumentSpec | None, data: DocumentData | None, new: DocumentSpec, today: date) -> DocumentData:
    """The new document's defaults, plus the parties and every non-blank value the two documents share."""
    result = default_data(new, today)
    if old is None or data is None:
        return result
    old_types = {field.key: field.type for field in old.fields}
    for field in new.fields:
        value = data.values.get(field.key)
        if old_types.get(field.key) == field.type and value is not None and not _is_blank(value) and not _check_value(field, value):
            result.values[field.key] = value
    return DocumentData(values=result.values, parties=data.parties)


# ---------------------------------------------------------------------------
# What the model returns: updates to the fields. Every field is required but nullable
# (null = leave unchanged), which keeps the schema valid for strict Structured Outputs.


class PartyUpdate(CamelModel):
    name: str | None = Field(description="Name of the person signing for this party")
    title: str | None = Field(description="Job title of the person signing")
    company: str | None = Field(description="Legal name of the company")
    notice_address: str | None = Field(description="Email or postal address for legal notices")


def _update_type(field: FieldSpec) -> object:
    if field.type == "int":
        return int | None
    if field.type == "enum":
        return Literal[tuple(option.value for option in field.options)] | None
    return str | None


def _update_description(field: FieldSpec) -> str:
    if field.type == "date":
        return f"{field.label} as YYYY-MM-DD: {field.description}"
    return f"{field.label}: {field.description}"


def model_name(document_id: str, suffix: str) -> str:
    """A schema name for a document's model, e.g. PilotAgreementUpdates."""
    return "".join(part.capitalize() for part in document_id.split("-")) + suffix


@cache
def updates_model(document_id: str) -> type[BaseModel]:
    spec = DOCUMENTS[document_id]
    fields: dict[str, object] = {
        field.key: (_update_type(field), Field(description=_update_description(field))) for field in spec.fields
    }
    for n, role in enumerate(spec.parties, start=1):
        fields[f"party{n}"] = (PartyUpdate | None, Field(description=f"The {role}"))
    return create_model(model_name(document_id, "Updates"), **fields)


def _clean(field: FieldSpec, value: str | int | None) -> str | int | None:
    """The model's new value for a field, trimmed; None to leave the field as it is."""
    if isinstance(value, str):
        value = value.strip()
    if value is None or (field.type == "date" and not value):  # the model can't clear a date, only replace it
        return None
    return value if _check_value(field, value) is None else None


def apply_updates(spec: DocumentSpec, data: DocumentData, updates: BaseModel) -> DocumentData:
    """Merge the model's updates into the field data, ignoring nulls and invalid values."""
    new = updates.model_dump()
    values = dict(data.values)
    for field in spec.fields:
        if (value := _clean(field, new[field.key])) is not None:
            values[field.key] = value
    parties = list(data.parties)
    for n in (1, 2):
        if (party_updates := new[f"party{n}"]) is not None:
            changes = {k: v.strip() for k, v in party_updates.items() if v is not None and len(v.strip()) <= MAX_VALUE_LENGTH}
            parties[n - 1] = parties[n - 1].model_copy(update=changes)
    return DocumentData(values=values, parties=(parties[0], parties[1]))
