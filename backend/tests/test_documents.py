import json
import re
from datetime import date

import pytest

from pydantic import ValidationError

from app.config import REPO_ROOT
from app.documents import (
    DOCUMENTS,
    DocumentData,
    DocumentSpec,
    FieldSpec,
    Party,
    PartyUpdate,
    apply_updates,
    carry_over,
    default_data,
    empty_optional_fields,
    missing_required_fields,
    updates_model,
    validate_data,
)

TODAY = date(2026, 10, 7)
TEMPLATES = REPO_ROOT / "templates"
NDA = DOCUMENTS["mutual-nda"]
PILOT = DOCUMENTS["pilot-agreement"]


def pilot(**values) -> DocumentData:
    data = default_data(PILOT, TODAY)
    return DocumentData(values={**data.values, **values}, parties=data.parties)


def updates(document_id: str, **changes):
    model = updates_model(document_id)
    return model(**{**{name: None for name in model.model_fields}, **changes})


class TestSpec:
    def test_has_one_document_per_catalog_template(self):
        catalog = json.loads((REPO_ROOT / "catalog.json").read_text())
        # The NDA cover page is part of the Mutual NDA, not a document of its own.
        drafts = {entry["filename"]: entry for entry in catalog if entry["filename"] != "Mutual-NDA-coverpage.md"}
        assert {spec.filename for spec in DOCUMENTS.values()} == set(drafts)
        for spec in DOCUMENTS.values():
            assert (spec.name, spec.description) == (drafts[spec.filename]["name"], drafts[spec.filename]["description"])
            assert (TEMPLATES / spec.filename).is_file()

    @pytest.mark.parametrize("spec", DOCUMENTS.values(), ids=DOCUMENTS)
    def test_has_a_field_or_party_for_every_term_the_template_uses(self, spec):
        def normalise(term: str) -> str:
            # Possessives and plurals ("Customer's", "Provider Covered Claims") refer to the same term.
            return re.sub(r"(['’]s|s)$", "", term.replace("**", "").strip()).lower()

        template = (TEMPLATES / spec.filename).read_text()
        used = {normalise(term) for term in re.findall(r'<span class="\w+_link"[^>]*>(.*?)</span>', template)}
        defined = {normalise(term) for field in spec.fields for term in field.defined_terms}
        defined |= {normalise(role) for role in spec.parties} | {normalise("Notice Address")}  # a party detail
        assert used - defined == set()

    @pytest.mark.parametrize("spec", DOCUMENTS.values(), ids=DOCUMENTS)
    def test_is_consistent(self, spec):
        keys = [field.key for field in spec.fields]
        assert len(keys) == len(set(keys))
        for field in spec.fields:
            assert (field.options is not None) == (field.type == "enum")
            assert (field.min is not None and field.max is not None) == (field.type == "int")
            if field.enabled_when:
                assert field.enabled_when.field in keys
        default_data(spec, TODAY)  # every default is valid
        validate_data(spec, default_data(spec, TODAY), TODAY)

    @pytest.mark.parametrize("document_id", DOCUMENTS)
    def test_gives_the_model_a_strict_schema(self, document_id):
        # Strict Structured Outputs need every property required and no extra properties.
        schema = updates_model(document_id).model_json_schema()
        assert set(schema["required"]) == set(schema["properties"])
        party = schema["$defs"]["PartyUpdate"]
        assert set(party["required"]) == set(party["properties"])

    def test_shares_keys_only_between_fields_of_the_same_type(self):
        types: dict[str, set[str]] = {}
        for spec in DOCUMENTS.values():
            for field in spec.fields:
                types.setdefault(field.key, set()).add(field.type)
        assert {key: t for key, t in types.items() if len(t) > 1} == {}


class TestSpecValidation:
    field = {"key": "years", "label": "Years", "description": "How long"}

    @pytest.mark.parametrize(
        "changes",
        [
            {"type": "int"},  # no min or max
            {"type": "text", "min": 1, "max": 9},
            {"type": "enum"},  # no options
            {"type": "text", "options": [{"value": "a", "label": "A"}]},
        ],
    )
    def test_rejects_settings_that_do_not_fit_the_field_type(self, changes):
        with pytest.raises(ValidationError):
            FieldSpec.model_validate({**self.field, **changes})

    @pytest.mark.parametrize(
        "fields",
        [
            [{"key": "a", "label": "A", "type": "text", "description": "x"}] * 2,
            [{"key": "party1", "label": "A", "type": "text", "description": "x"}],
            [{"key": "n", "label": "N", "type": "int", "min": 1, "max": 9, "description": "x", "enabledWhen": {"field": "a", "equals": "b"}}],
        ],
    )
    def test_rejects_documents_with_clashing_or_dangling_fields(self, fields):
        spec = PILOT.model_dump(by_alias=True) | {"sections": [{"title": "S", "fields": fields}]}
        with pytest.raises(ValidationError):
            DocumentSpec.model_validate(spec)


class TestDefaults:
    def test_fills_in_defaults_and_today(self):
        data = default_data(NDA, TODAY)
        assert data.values["effectiveDate"] == "2026-10-07"
        assert data.values["mndaTermYears"] == 1
        assert data.values["mndaTermType"] == "expires"
        assert data.values["governingLaw"] == ""
        assert data.parties == (Party(), Party())


class TestValidateData:
    def test_fills_in_missing_values_with_their_defaults(self):
        data = validate_data(PILOT, DocumentData(values={"pilotPeriod": "90 days"}, parties=(Party(), Party())), TODAY)
        assert data.values["pilotPeriod"] == "90 days"
        assert data.values["effectiveDate"] == "2026-10-07"

    def test_defaults_everything_when_no_data_is_given(self):
        assert validate_data(PILOT, None, TODAY) == default_data(PILOT, TODAY)

    @pytest.mark.parametrize(
        ("values", "message"),
        [
            ({"purpose": "x", "salary": "1"}, "Unknown field for the Mutual Non-Disclosure Agreement: salary."),
            ({"mndaTermYears": 0}, "MNDA term in years must be a whole number from 1 to 99."),
            ({"mndaTermYears": "2"}, "MNDA term in years must be a whole number from 1 to 99."),
            ({"mndaTermType": "forever"}, "MNDA Term must be one of: expires, until-terminated."),
            ({"effectiveDate": "next week"}, "Effective Date must be a date (YYYY-MM-DD)."),
            ({"governingLaw": 3}, "Governing Law must be text."),
            ({"purpose": "x" * 4001}, "Purpose must be at most 4000 characters."),
        ],
    )
    def test_rejects_invalid_values(self, values, message):
        with pytest.raises(ValueError, match=re.escape(message)):
            validate_data(NDA, DocumentData(values=values, parties=(Party(), Party())), TODAY)


class TestRequiredAndOptional:
    def test_lists_required_fields_and_party_companies_still_missing(self):
        assert missing_required_fields(PILOT, pilot()) == [
            "Product",
            "Pilot Period",
            "Governing Law",
            "Chosen Courts",
            "Provider company",
            "Customer company",
        ]

    def test_lists_optional_fields_still_empty(self):
        assert empty_optional_fields(PILOT, pilot()) == [
            "Fees",
            "General Cap Amount",
            *(f"{role} {detail}" for role in ("Provider", "Customer") for detail in ("signatory name", "signatory title", "notice address")),
        ]

    def test_never_counts_numbers_and_choices_as_empty(self):
        assert "MNDA term in years" not in empty_optional_fields(NDA, default_data(NDA, TODAY))


class TestApplyUpdates:
    def test_leaves_null_fields_unchanged(self):
        assert apply_updates(PILOT, pilot(), updates(PILOT.id)) == pilot()

    def test_sets_and_trims_values(self):
        result = apply_updates(PILOT, pilot(), updates(PILOT.id, pilotPeriod=" 90 days ", governingLaw="Delaware"))
        assert (result.values["pilotPeriod"], result.values["governingLaw"]) == ("90 days", "Delaware")

    def test_can_clear_a_value(self):
        assert apply_updates(PILOT, pilot(fees="$1"), updates(PILOT.id, fees="")).values["fees"] == ""

    @pytest.mark.parametrize("value", ["2026-02-30", "next Monday", "2026-1-5", "", "2026-10-12T00:00"])
    def test_ignores_invalid_dates(self, value):
        assert apply_updates(PILOT, pilot(), updates(PILOT.id, effectiveDate=value)).values["effectiveDate"] == "2026-10-07"

    def test_sets_a_valid_date(self):
        assert apply_updates(PILOT, pilot(), updates(PILOT.id, effectiveDate="2026-10-12")).values["effectiveDate"] == "2026-10-12"

    def test_sets_numbers_and_choices(self):
        data = default_data(NDA, TODAY)
        result = apply_updates(NDA, data, updates(NDA.id, mndaTermType="until-terminated", mndaTermYears=3))
        assert (result.values["mndaTermType"], result.values["mndaTermYears"]) == ("until-terminated", 3)

    @pytest.mark.parametrize("years", [0, -1, 100])
    def test_ignores_numbers_out_of_range(self, years):
        data = default_data(NDA, TODAY)
        assert apply_updates(NDA, data, updates(NDA.id, mndaTermYears=years)).values["mndaTermYears"] == 1

    def test_updates_only_the_given_party_details(self):
        party = Party(name="Ada", title="CEO", company="Acme", notice_address="ada@acme.test")
        start = DocumentData(values=pilot().values, parties=(party, Party()))
        result = apply_updates(
            PILOT,
            start,
            updates(
                PILOT.id,
                party1=PartyUpdate(name=None, title=" CTO ", company=None, notice_address=None),
                party2=PartyUpdate(name=None, title=None, company="Globex", notice_address=None),
            ),
        )
        assert result.parties[0] == Party(name="Ada", title="CTO", company="Acme", notice_address="ada@acme.test")
        assert result.parties[1].company == "Globex"


    def test_ignores_party_details_that_are_too_long(self):
        result = apply_updates(PILOT, pilot(), updates(PILOT.id, party1=PartyUpdate(name="x" * 4001, title=None, company="Acme", notice_address=None)))
        assert result.parties[0] == Party(company="Acme")


class TestCarryOver:
    def test_starts_from_defaults_when_there_was_no_document(self):
        assert carry_over(None, None, PILOT, TODAY) == default_data(PILOT, TODAY)

    def test_keeps_the_parties_and_the_values_both_documents_have(self):
        nda = default_data(NDA, TODAY)
        nda.values.update(effectiveDate="2026-11-01", governingLaw="Delaware", chosenCourts="New Castle, DE", purpose="Talks")
        parties = (Party(company="Acme", name="Ada"), Party(company="Globex"))
        result = carry_over(NDA, DocumentData(values=nda.values, parties=parties), PILOT, TODAY)

        assert result.parties == parties
        assert result.values == {
            **default_data(PILOT, TODAY).values,
            "effectiveDate": "2026-11-01",
            "governingLaw": "Delaware",
            "chosenCourts": "New Castle, DE",
        }

    def test_does_not_carry_blank_values(self):
        result = carry_over(PILOT, pilot(effectiveDate=""), NDA, TODAY)
        assert result.values["effectiveDate"] == "2026-10-07"
